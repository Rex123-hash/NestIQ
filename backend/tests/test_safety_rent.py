"""Live safety support and grounded rent verification stay evidence-first."""

from datetime import date
from threading import Event
from types import SimpleNamespace

from app import gemini, main, maps


def test_safety_profile_reports_live_counts_and_earned_confidence(monkeypatch):
    payloads = {
        "police": {"count": 4, "nearestDistanceKm": 0.8, "radiusKm": 3},
        "hospital": {"count": 6, "nearestDistanceKm": 1.2, "radiusKm": 3},
        "fire_station": {"count": 2, "nearestDistanceKm": 2.0, "radiusKm": 5},
    }
    monkeypatch.setattr(maps, "_nearby_safety_places", lambda lat, lng, kind, radius: payloads[kind])

    profile = maps.safety_profile(28.6, 77.2)

    assert profile["status"] == "live"
    assert profile["confidence"] == "high"
    assert profile["signals"]["police"]["count"] == 4
    assert 0 <= profile["emergencyAccessScore"] <= 100
    assert profile["officialCrimeContext"]["scored"] is False


def test_partial_safety_evidence_never_claims_high_confidence(monkeypatch):
    monkeypatch.setattr(
        maps,
        "_nearby_safety_places",
        lambda lat, lng, kind, radius: ({"count": 2, "nearestDistanceKm": 1.0, "radiusKm": 3}
                                        if kind == "police" else None),
    )
    profile = maps.safety_profile(28.6, 77.2)
    assert profile["status"] == "partial"
    assert profile["confidence"] == "low"


def test_safety_support_does_not_change_the_curated_score():
    base = [
        {"id": "a", "name": "A", "short": "A", "lat": 1, "lng": 1,
         "median_rent": 10000, "safety_est": 50, "aqi": 80,
         "amenity_count": 10, "commute_min": 20},
        {"id": "b", "name": "B", "short": "B", "lat": 2, "lng": 2,
         "median_rent": 20000, "safety_est": 80, "aqi": 100,
         "amenity_count": 15, "commute_min": 30},
    ]
    before = {r["id"]: r["subscores"]["safety"] for r in maps.score_india(base)}
    base[0]["safety_profile"] = {"status": "live", "confidence": "high", "emergencyAccessScore": 99}
    after = {r["id"]: r["subscores"]["safety"] for r in maps.score_india(base)}
    assert after == before


def test_grounded_rent_analysis_calculates_high_confidence_locally():
    observations = [
        {"monthlyRent": 18000 + i * 500, "observedOn": "2026-07-10", "sourceTitle": f"Listing {i}"}
        for i in range(8)
    ]
    citations = [
        {"title": "Portal A", "uri": "https://a.example/x"},
        {"title": "Portal B", "uri": "https://b.example/x"},
        {"title": "Portal C", "uri": "https://c.example/x"},
    ]
    result = gemini.analyze_rent_observations(
        {"observations": observations}, citations, today=date(2026, 7, 19),
    )
    assert result["status"] == "available"
    assert result["confidence"] == "high"
    assert result["sampleSize"] == 8
    assert 18000 <= result["medianRent"] <= 22000


def test_rent_analysis_rejects_bad_values_and_requires_citations():
    raw = {"observations": [
        {"monthlyRent": "₹22,000", "sourceTitle": "A"},
        {"monthlyRent": 24000, "sourceTitle": "B"},
        {"monthlyRent": 999, "sourceTitle": "Bad"},
        {"monthlyRent": True, "sourceTitle": "Bad boolean"},
    ]}
    result = gemini.analyze_rent_observations(raw, [])
    assert result["status"] == "no_evidence"
    assert len(result["observations"]) == 2


def test_verify_rent_uses_grounded_search_then_structured_extraction(monkeypatch):
    chunks = [
        SimpleNamespace(web=SimpleNamespace(uri=f"https://source{i}.example/rent", title=f"Source {i}"))
        for i in range(3)
    ]
    grounded = SimpleNamespace(
        text="\n".join(f"INR {18000 + i * 500} | 2026-07-10 | Listing {i}" for i in range(8)),
        candidates=[SimpleNamespace(grounding_metadata=SimpleNamespace(grounding_chunks=chunks))],
    )
    calls = {"n": 0, "config": None}

    def generate(**kwargs):
        calls["n"] += 1
        calls["config"] = kwargs["config"]
        return grounded

    monkeypatch.setattr(gemini, "_generate", generate)

    result = gemini.verify_rent("Sector 62, Noida", "Delhi NCR")

    assert result["status"] == "available"
    assert result["confidence"] == "high"
    assert result["sampleSize"] == 8
    assert result["sourceCount"] == 3
    assert calls["n"] == 1
    assert calls["config"].temperature == 0.0
    assert calls["config"].max_output_tokens == 1800
    assert calls["config"].thinking_config.thinking_budget == 0


def test_verify_rent_does_not_chain_an_extraction_call_for_malformed_evidence(monkeypatch):
    chunks = [
        SimpleNamespace(web=SimpleNamespace(uri="https://source.example/rent", title="Source")),
    ]
    grounded = SimpleNamespace(
        text="Current rental information exists, but not in the required evidence-ledger format.",
        candidates=[SimpleNamespace(grounding_metadata=SimpleNamespace(grounding_chunks=chunks))],
    )
    calls = {"n": 0}

    def generate(**kwargs):
        calls["n"] += 1
        return grounded

    monkeypatch.setattr(gemini, "_generate", generate)
    result = gemini.verify_rent("Sector 62, Noida", "Delhi NCR")
    assert result["status"] == "no_evidence"
    assert calls["n"] == 1


def test_rent_ledger_parser_rejects_non_rent_lines():
    parsed = gemini._parse_rent_ledger("""
    INR 22,000 | 2026-07-10 | Listing A
    sale price INR 2,20,00,000 | unknown | Sale page
    INR 24,000 | unknown | Listing B
    no price here
    """)

    assert [item["monthlyRent"] for item in parsed["observations"]] == [22000, 24000]


def test_rent_verification_endpoint_is_cached_without_changing_score(client, monkeypatch, isolated_rent_store):
    calls = {"n": 0}

    def verify(name, city):
        calls["n"] += 1
        return {
            "status": "available", "confidence": "medium", "confidenceScore": 65,
            "medianRent": 21000, "rangeLow": 19000, "rangeHigh": 23000,
            "sampleSize": 4, "sourceCount": 2, "citations": [],
        }

    monkeypatch.setattr(gemini, "verify_rent", verify)
    first = client.get("/api/neighborhood/clean-cheap/rent-verification?city=delhi-ncr")
    assert first.status_code == 200
    assert first.json()["status"] == "pending"
    assert first.json()["refreshStatus"] == "refreshing"

    for _ in range(100):
        if isolated_rent_store.claim("delhi-ncr", "clean-cheap").document["status"] != "pending":
            break
        Event().wait(0.01)
    second = client.get("/api/neighborhood/clean-cheap/rent-verification?city=delhi-ncr")

    assert second.status_code == 200
    assert calls["n"] == 1
    assert second.json()["status"] == "available"
    assert second.json()["curatedMedianRent"] == 15000
    assert second.json()["scoreImpact"] == "none"


def test_first_rent_verification_returns_immediately_while_work_continues(client, monkeypatch, isolated_rent_store):
    started, release = Event(), Event()
    calls = {"n": 0}

    def slow_verify(name, city):
        calls["n"] += 1
        started.set()
        release.wait(2)
        return {
            "status": "available", "confidence": "medium", "confidenceScore": 65,
            "medianRent": 21000, "rangeLow": 19000, "rangeHigh": 23000,
            "sampleSize": 4, "sourceCount": 2, "citations": [],
        }

    monkeypatch.setattr(gemini, "verify_rent", slow_verify)
    response = client.get("/api/neighborhood/clean-cheap/rent-verification?city=delhi-ncr")

    assert response.status_code == 200
    assert response.json()["status"] == "pending"
    assert started.wait(1)
    assert isolated_rent_store.claim("delhi-ncr", "clean-cheap").document["status"] == "pending"
    duplicate = client.get("/api/neighborhood/clean-cheap/rent-verification?city=delhi-ncr")
    assert duplicate.json()["status"] == "pending"
    assert calls["n"] == 1
    release.set()
    for _ in range(100):
        if isolated_rent_store.claim("delhi-ncr", "clean-cheap").document["status"] != "pending":
            break
        Event().wait(0.01)
    assert client.get("/api/neighborhood/clean-cheap/rent-verification?city=delhi-ncr").json()["status"] == "available"


def test_rent_reverification_returns_cached_result_while_refreshing(client, monkeypatch, isolated_rent_store):
    started, release, finished = Event(), Event(), Event()
    old = {
        "status": "available", "medianRent": 20000, "rangeLow": 18000, "rangeHigh": 22000,
        "sampleSize": 4, "sourceCount": 2, "citations": [], "scoreImpact": "none",
    }
    seeded = isolated_rent_store.claim("delhi-ncr", "clean-cheap")
    assert isolated_rent_store.complete(
        "delhi-ncr", "clean-cheap", seeded.job_id, old, "passed")

    def slow_refresh(name, city):
        started.set()
        release.wait(2)
        finished.set()
        return {**old, "medianRent": 21000}

    monkeypatch.setattr(gemini, "verify_rent", slow_refresh)
    response = client.get("/api/neighborhood/clean-cheap/rent-verification?city=delhi-ncr&refresh=true")

    assert response.status_code == 200
    assert response.json()["medianRent"] == 20000
    assert response.json()["refreshStatus"] == "refreshing"
    assert started.wait(1)
    release.set()
    assert finished.wait(1)
    for _ in range(100):
        if isolated_rent_store.claim("delhi-ncr", "clean-cheap").document["status"] != "pending":
            break
        release.wait(0.01)
    updated = client.get("/api/neighborhood/clean-cheap/rent-verification?city=delhi-ncr").json()
    assert updated["medianRent"] == 21000
    assert "refreshStatus" not in updated
def test_failed_rent_refresh_preserves_previous_verified_evidence(client, monkeypatch, isolated_rent_store):
    old = {
        "status": "available", "medianRent": 20000, "rangeLow": 18000, "rangeHigh": 22000,
        "sampleSize": 4, "sourceCount": 2, "citations": [], "scoreImpact": "none",
    }
    seeded = isolated_rent_store.claim("delhi-ncr", "clean-cheap")
    assert isolated_rent_store.complete(
        "delhi-ncr", "clean-cheap", seeded.job_id, old, "passed")

    monkeypatch.setattr(gemini, "verify_rent", lambda name, city: {
        "status": "temporarily_unavailable", "errorCode": "grounding_unavailable",
    })
    started = client.get(
        "/api/neighborhood/clean-cheap/rent-verification?city=delhi-ncr&refresh=true")
    assert started.status_code == 200
    assert started.json()["medianRent"] == 20000

    for _ in range(100):
        doc = isolated_rent_store.claim("delhi-ncr", "clean-cheap").document
        if doc["status"] != "pending":
            break
        Event().wait(0.01)

    stale = client.get(
        "/api/neighborhood/clean-cheap/rent-verification?city=delhi-ncr").json()
    assert stale["status"] == "available"
    assert stale["medianRent"] == 20000
    assert stale["cacheStatus"] == "stale"
    assert stale["refreshStatus"] == "failed"
