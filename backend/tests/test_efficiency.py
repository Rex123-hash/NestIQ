"""Part-2 efficiency guarantees: amenity differentiation, detail caching,
and deduplicated BigQuery snapshot logging."""
from app import maps, main, gemini


def test_amenity_profile_sums_per_category(monkeypatch):
    # Per-type counts must be summed, not capped at the API's 20-result ceiling
    # (the old single call flattened every locality to exactly 20).
    counts = {"restaurant": 20, "cafe": 15, "supermarket": 8, "gym": 5, "park": 3, "shopping_mall": 12}
    monkeypatch.setattr(maps, "_count_places", lambda lat, lng, t: counts[t])
    prof = maps.amenity_profile(28.6, 77.2)
    assert prof["total"] == sum(counts.values()) == 63
    assert prof["breakdown"] == counts


def test_detail_payload_is_cached(client, monkeypatch):
    calls = {"n": 0}

    def explain(*a, **k):
        calls["n"] += 1
        return "why-text"

    monkeypatch.setattr(gemini, "explain", explain)
    main._detail_cache.clear()

    r1 = client.get("/api/neighborhood/clean-cheap?city=delhi-ncr")
    r2 = client.get("/api/neighborhood/clean-cheap?city=delhi-ncr")

    assert r1.status_code == 200 and r2.status_code == 200
    assert calls["n"] == 1, "second view should be served from the detail cache"
    assert r1.json()["why"] == r2.json()["why"] == "why-text"


def test_reviews_endpoint_returns_summary_and_citations(client):
    main._reviews_cache.clear()
    r = client.get("/api/neighborhood/clean-cheap/reviews?city=delhi-ncr")
    assert r.status_code == 200
    body = r.json()
    assert body["summary"]
    assert body["citations"][0]["uri"].startswith("http")


def test_reviews_endpoint_caches(client, monkeypatch):
    calls = {"n": 0}

    def reviews(name, city):
        calls["n"] += 1
        return {"summary": "cached", "citations": []}

    monkeypatch.setattr(gemini, "web_reviews", reviews)
    main._reviews_cache.clear()
    client.get("/api/neighborhood/middle/reviews?city=delhi-ncr")
    client.get("/api/neighborhood/middle/reviews?city=delhi-ncr")
    assert calls["n"] == 1, "grounded review call must be cached, not repeated"


def test_reviews_endpoint_does_not_cache_service_failure(client, monkeypatch):
    calls = {"n": 0}

    def unavailable(name, city):
        calls["n"] += 1
        return {"summary": "", "citations": [], "status": "temporarily_unavailable",
                "errorCode": "vertex_permission_denied"}

    monkeypatch.setattr(gemini, "web_reviews", unavailable)
    main._reviews_cache.clear()
    r1 = client.get("/api/neighborhood/middle/reviews?city=delhi-ncr")
    r2 = client.get("/api/neighborhood/middle/reviews?city=delhi-ncr")

    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json()["status"] == "temporarily_unavailable"
    assert calls["n"] == 2, "retryable grounding failures must not be cached for 24 hours"


def test_reviews_endpoint_does_not_cache_empty_no_evidence(client, monkeypatch):
    calls = {"n": 0}

    def empty(name, city):
        calls["n"] += 1
        return {"summary": "", "citations": [], "status": "no_evidence"}

    monkeypatch.setattr(gemini, "web_reviews", empty)
    main._reviews_cache.clear()
    client.get("/api/neighborhood/middle/reviews?city=delhi-ncr")
    client.get("/api/neighborhood/middle/reviews?city=delhi-ncr")
    assert calls["n"] == 2, "an empty grounding response must not poison the 24-hour cache"


def test_reviews_refresh_bypasses_a_cached_summary(client, monkeypatch):
    calls = {"n": 0}

    def reviews(name, city):
        calls["n"] += 1
        return {"summary": f"version {calls['n']}", "citations": [], "status": "available"}

    monkeypatch.setattr(gemini, "web_reviews", reviews)
    main._reviews_cache.clear()
    first = client.get("/api/neighborhood/middle/reviews?city=delhi-ncr").json()
    cached = client.get("/api/neighborhood/middle/reviews?city=delhi-ncr").json()
    refreshed = client.get("/api/neighborhood/middle/reviews?city=delhi-ncr&refresh=true").json()
    assert first["summary"] == cached["summary"] == "version 1"
    assert refreshed["summary"] == "version 2"


def test_reviews_endpoint_404_for_unknown(client):
    main._reviews_cache.clear()
    r = client.get("/api/neighborhood/nope/reviews?city=delhi-ncr")
    assert r.status_code == 404


def test_ask_answer_is_cached(client, monkeypatch):
    calls = {"n": 0}

    def counting_ask(q, ctx):
        calls["n"] += 1
        return "answer"

    monkeypatch.setattr(gemini, "ask", counting_ask)
    main._ask_cache.clear()
    payload = {"question": "where is rent lowest", "city": "delhi-ncr"}
    client.post("/api/ask", json=payload)
    client.post("/api/ask", json=payload)
    assert calls["n"] == 1, "identical question should be answered from cache the second time"


def test_snapshot_logged_once_per_build(monkeypatch):
    logged = []
    monkeypatch.setattr(main.bq_india, "log_snapshot_safe", lambda city, ranked: logged.append(city))
    monkeypatch.setattr(main.maps, "built_at", lambda city: 111.0)
    main._last_logged.clear()

    rows = [{"id": "x", "name": "X"}]
    main.maybe_log_snapshot("delhi-ncr", rows)
    main.maybe_log_snapshot("delhi-ncr", rows)  # same build timestamp -> no duplicate log
    assert logged == ["delhi-ncr"]

    monkeypatch.setattr(main.maps, "built_at", lambda city: 222.0)  # a fresh build
    main.maybe_log_snapshot("delhi-ncr", rows)
    assert logged == ["delhi-ncr", "delhi-ncr"]
