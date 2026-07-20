"""Offline responsible-AI scorecard built from NestIQ's real guardrails.

No network, Gemini, Google Maps, or BigQuery calls are made. Each case executes
the same deterministic validation code used by production endpoints.
"""
from __future__ import annotations

import json
from datetime import date

from . import bq_india, civic_rag, gemini, maps
from .air_quality import air_health_score, cpcb_band, critical_risks
from .evidence import metric_evidence


def _result(case_id: str, dimension: str, passed: bool, evidence: str) -> dict:
    return {"id": case_id, "dimension": dimension, "passed": bool(passed), "evidence": evidence}


def run_offline_scorecard() -> dict:
    """Run deterministic, zero-cost evaluations and return a JSON-safe report."""
    results = []

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

    rag = civic_rag.answer("air quality vehicle GRAP rules", "delhi-ncr", "noida-62")
    catalog_urls = {doc["url"] for doc in civic_rag.load_catalog()}
    results.append(_result(
        "civic-rag-citations-controlled", "groundedness",
        rag["status"] == "available" and bool(rag["citations"])
        and all(c["url"] in catalog_urls for c in rag["citations"]),
        f"retrieved={rag['retrievedCount']}, citations={len(rag['citations'])}",
    ))

    total = len(results)
    passed = sum(1 for item in results if item["passed"])
    dimensions = {}
    for item in results:
        bucket = dimensions.setdefault(item["dimension"], {"passed": 0, "total": 0})
        bucket["total"] += 1
        bucket["passed"] += int(item["passed"])
    return {
        "status": "passed" if passed == total else "failed",
        "passed": passed, "total": total,
        "passRate": round(100 * passed / total) if total else 0,
        "dimensions": dimensions, "cases": results,
        "billableCalls": 0,
    }


if __name__ == "__main__":
    print(json.dumps(run_offline_scorecard(), indent=2))
