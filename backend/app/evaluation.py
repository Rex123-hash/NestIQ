"""Offline responsible-AI scorecard built from NestIQ's real guardrails.

No network, Gemini, Google Maps, or BigQuery calls are made. Each case executes
the same deterministic validation code used by production endpoints.
"""
from __future__ import annotations

import json
from datetime import date
from time import perf_counter

from . import bq_india, civic_rag, copilot, gemini, maps
from .adk_orchestration import run_adk_search
from .air_quality import CPCB_BANDS, air_health_score, air_relative_ranks, cpcb_band, critical_risks
from .evidence import metric_evidence
from .india import get_city


def _result(case_id: str, dimension: str, passed: bool, evidence: str) -> dict:
    return {"id": case_id, "dimension": dimension, "passed": bool(passed), "evidence": evidence}


def run_offline_scorecard() -> dict:
    """Run deterministic, zero-cost evaluations and return a JSON-safe report."""
    results = []

    band_checks = []
    for name, low, high, score_low, score_high in CPCB_BANDS:
        band_checks.extend([
            cpcb_band(low) == name,
            cpcb_band(high) == name,
            score_low <= air_health_score(low) <= score_high,
            score_low <= air_health_score(high) <= score_high,
        ])
    results.append(_result(
        "air-health-band-boundaries", "health_scoring", all(band_checks),
        f"validated {len(CPCB_BANDS)} CPCB bands at clean and dirty boundaries",
    ))

    tied = air_relative_ranks([75, 75, 120, None])
    results.append(_result(
        "air-relative-rank-ties", "health_scoring", tied == [1, 1, 3, None],
        f"ranks={tied}",
    ))

    score = air_health_score(500)
    results.append(_result(
        "air-severe-absolute", "health_scoring",
        score is not None and score <= 14 and cpcb_band(500) == "Severe" and bool(critical_risks(500)),
        f"AQI 500 -> score {score}, band {cpcb_band(500)}, critical risk present",
    ))

    feature = {"id": "eval", "name": "Eval Locality", "median_rent": 20000, "safety_est": 70,
               "commute_min": 25, "amenity_count": 50, "aqi": None,
               "airDataStatus": "temporarily_unavailable"}
    scored = maps.score_india([feature])[0]
    results.append(_result(
        "missing-air-provisional", "missing_data_honesty",
        scored["fitScoreDataStatus"] == "provisional" and "air_quality" in scored["missingPillars"]
        and scored["subscores"]["air_quality"] is None,
        f"status={scored['fitScoreDataStatus']}, missing={scored['missingPillars']}",
    ))

    envelope = metric_evidence({**feature, "commute_min": None, "commuteDataStatus": "temporarily_unavailable"})
    results.append(_result(
        "missing-commute-not-fabricated", "missing_data_honesty",
        envelope["commute"]["value"] is None and envelope["commute"]["status"] == "temporarily_unavailable",
        f"value={envelope['commute']['value']}, status={envelope['commute']['status']}",
    ))

    citations = [{"title": "Noida Authority", "uri": "https://example.gov.in/notice"}]
    raw_pulse = {"items": [{"headline": "Unsupported update", "summary": "No matching source.",
                             "category": "civic", "severity": "moderate", "affectedArea": "Sector 62",
                             "observedOn": "2026-07-18", "sourceTitle": "Invented source"}]}
    accepted = gemini.analyze_pulse_items(raw_pulse, citations, today=date(2026, 7, 19))
    results.append(_result(
        "pulse-unsupported-source-rejected", "groundedness", accepted == [],
        f"accepted_items={len(accepted)}",
    ))

    rent = gemini.analyze_rent_observations(
        {"observations": [{"monthlyRent": 19000, "observedOn": "2026-07-18", "sourceTitle": "Portal"}]},
        [], today=date(2026, 7, 19),
    )
    results.append(_result(
        "rent-without-citations-rejected", "groundedness", rent["status"] == "no_evidence",
        f"status={rent['status']}, sampleSize={rent.get('sampleSize', 0)}",
    ))

    sql_rejected = False
    try:
        bq_india.run_sql("SELECT * FROM locality; DROP TABLE locality")
    except ValueError:
        sql_rejected = True
    results.append(_result(
        "nl-sql-write-rejected", "security", sql_rejected,
        "stacked SELECT/DROP rejected before a BigQuery client is constructed",
    ))

    chennai_localities = get_city("chennai")["localities"]
    results.append(_result(
        "copilot-verified-name-comparison-uses-analytics", "tool_routing",
        copilot.route_intent(
            "Compare Adyar and Velachery", localities=chennai_localities,
        ) == copilot.CITY_ANALYTICS,
        "two selected-city catalog names route to guarded BigQuery analytics",
    ))
    results.append(_result(
        "copilot-general-concept-stays-model-only", "tool_routing",
        copilot.route_intent(
            "Compare AQI 110 with CPCB bands", localities=chennai_localities,
        ) == copilot.GENERAL_GUIDANCE,
        "a scalar AQI concept question does not launch a BigQuery job",
    ))
    results.append(_result(
        "copilot-invented-localities-cannot-launch-analytics", "tool_routing",
        copilot.route_intent(
            "Compare Foo Colony and Bar Nagar", localities=chennai_localities,
        ) == copilot.GENERAL_GUIDANCE,
        "unknown names are not treated as verified locality analytics subjects",
    ))

    rag = civic_rag.answer("air quality vehicle GRAP rules", "delhi-ncr", "noida-62")
    catalog_urls = {doc["url"] for doc in civic_rag.load_catalog()}
    results.append(_result(
        "civic-rag-citations-controlled", "groundedness",
        rag["status"] == "available" and bool(rag["citations"])
        and all(c["url"] in catalog_urls for c in rag["citations"]),
        f"retrieved={rag['retrievedCount']}, citations={len(rag['citations'])}",
    ))

    rag_schema = {
        "status", "answer", "citations", "retrievedCount", "method", "limitation", "scoreImpact",
    }
    results.append(_result(
        "civic-rag-response-schema", "api_contract",
        rag_schema <= rag.keys() and rag["scoreImpact"] == "none"
        and all({"id", "title", "authority", "url", "publishedOn"} <= citation.keys()
                for citation in rag["citations"]),
        f"keys={sorted(rag.keys())}",
    ))

    unsupported = civic_rag.answer("official water notice", "unsupported-city", "missing-locality")
    results.append(_result(
        "unsupported-locality-no-evidence", "graceful_degradation",
        unsupported["status"] == "no_evidence" and unsupported["answer"] == ""
        and unsupported["citations"] == [] and unsupported["retrievedCount"] == 0,
        f"status={unsupported['status']}, retrieved={unsupported['retrievedCount']}",
    ))

    catalog = civic_rag.load_catalog()
    suspicious = ("ignore previous", "system prompt", "developer message", "follow these instructions")
    catalog_safe = all(
        doc["url"].startswith("https://")
        and not any(marker in doc["text"].lower() for marker in suspicious)
        for doc in catalog
    )
    results.append(_result(
        "controlled-rag-catalog-source-validation", "security", catalog_safe,
        f"validated {len(catalog)} controlled documents for HTTPS sources and instruction-like content",
    ))

    def parsed_query(_query, _context):
        return {"weights": {"air_quality": 50, "safety": 30, "affordability": 20}, "budget": None}

    def ranked_rows(_city, _weights, _budget):
        return [{
            "id": "eval-locality", "name": "Eval Locality", "fitScore": 68,
            "match": "fair", "matchDisplay": "Fair Match", "aqi": None,
            "airHealthBand": None, "subscores": {"air_quality": None},
            "fitScoreDataStatus": "provisional", "anomalies": [],
        }]

    started = perf_counter()
    trajectory = run_adk_search(
        "Find a safer locality for a family member sensitive to air pollution",
        "unsupported-city", parsed_query, ranked_rows,
    )
    trajectory_ms = round((perf_counter() - started) * 1000, 2)
    agent_ids = [event.get("id") for event in trajectory if event.get("kind") == "agent"]
    final_events = [event for event in trajectory if event.get("kind") == "final"]
    required_agents = {
        "planner", "live_signals_agent", "analytics_agent", "civic_intelligence_agent",
        "validator", "explainer",
    }
    results.append(_result(
        "adk-health-sensitive-tool-trajectory", "tool_trajectory",
        required_agents <= set(agent_ids) and len(final_events) == 1,
        f"agents={agent_ids}, finalEvents={len(final_events)}, latencyMs={trajectory_ms}",
    ))
    results.append(_result(
        "adk-missing-data-validator", "contradiction_control",
        any(event.get("id") == "validator" and not event.get("contradictions")
            and "provisional" in event.get("msg", "") for event in trajectory),
        "validator preserved the provisional result without inventing an air score",
    ))

    empty_trajectory = run_adk_search(
        "Find a locality", "unsupported-city", parsed_query,
        lambda _city, _weights, _budget: [],
    )
    results.append(_result(
        "adk-empty-result-graceful-degradation", "graceful_degradation",
        any(event.get("id") == "explainer" and event.get("msg") == "No localities to rank"
            for event in empty_trajectory)
        and len([event for event in empty_trajectory if event.get("kind") == "final"]) == 1,
        "empty ranking completed with an honest final event",
    ))

    total = len(results)
    passed = sum(1 for item in results if item["passed"])
    dimensions = {}
    for item in results:
        bucket = dimensions.setdefault(item["dimension"], {"passed": 0, "total": 0})
        bucket["total"] += 1
        bucket["passed"] += int(item["passed"])
    by_id = {item["id"]: item for item in results}
    grounded_ids = {
        "pulse-unsupported-source-rejected", "rent-without-citations-rejected",
        "civic-rag-citations-controlled", "controlled-rag-catalog-source-validation",
    }
    citation_ids = {"civic-rag-citations-controlled", "civic-rag-response-schema"}
    contradiction_ids = {"adk-missing-data-validator", "air-severe-absolute"}
    fallback_cases = {"unsupported-locality-no-evidence", "adk-empty-result-graceful-degradation"}
    copilot_routing_ids = {
        "copilot-verified-name-comparison-uses-analytics",
        "copilot-general-concept-stays-model-only",
        "copilot-invented-localities-cannot-launch-analytics",
    }

    def rate(case_ids):
        selected = [by_id[case_id] for case_id in case_ids]
        return round(100 * sum(item["passed"] for item in selected) / len(selected))

    metrics = {
        "toolTrajectoryAccuracy": rate({"adk-health-sensitive-tool-trajectory"}),
        "selectiveToolRoutingAccuracy": rate(copilot_routing_ids),
        "groundedness": rate(grounded_ids),
        "citationPrecision": rate(citation_ids),
        "unsupportedClaimRate": 0 if rate(grounded_ids) == 100 else 100 - rate(grounded_ids),
        "contradictionRate": 0 if rate(contradiction_ids) == 100 else 100 - rate(contradiction_ids),
        "taskCompletion": round(100 * passed / total) if total else 0,
        "latencyMs": {"adkHealthSensitive": trajectory_ms},
        "fallbackFrequency": {
            "count": len(fallback_cases), "evaluatedScenarios": total,
            "percent": round(100 * len(fallback_cases) / total) if total else 0,
        },
    }
    return {
        "status": "passed" if passed == total else "failed",
        "passed": passed, "total": total,
        "passRate": round(100 * passed / total) if total else 0,
        "dimensions": dimensions, "cases": results,
        "metrics": metrics,
        "scope": {
            "included": [
                "FitScore health bands and ties", "missing-data honesty", "provenance",
                "source validation", "SQL security", "controlled RAG", "ADK tool trajectory",
                "Copilot selective tool routing", "unsupported-locality handling", "graceful degradation",
            ],
            "excludedNotImplemented": ["multilingual rendering and multilingual agent equivalents"],
        },
        "billableCalls": 0,
    }


if __name__ == "__main__":
    print(json.dumps(run_offline_scorecard(), indent=2))
