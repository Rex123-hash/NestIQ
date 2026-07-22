"""Part-2 efficiency guarantees: amenity differentiation, detail caching,
and deduplicated BigQuery snapshot logging."""
import asyncio
import time
from concurrent.futures import ThreadPoolExecutor

from app import maps, main, gemini


def test_lifespan_starts_cache_warmup(monkeypatch):
    calls = {"n": 0}
    monkeypatch.setattr(main, "warm_default_city_cache", lambda: calls.__setitem__("n", calls["n"] + 1))

    async def exercise_lifespan():
        async with main.lifespan(main.app):
            assert calls["n"] == 1

    asyncio.run(exercise_lifespan())


def _clear_reviews_state():
    main._reviews_cache.clear()
    main._reviews_failure_cache.clear()
    main._reviews_refreshing.clear()


def _wait_for_reviews(client, path, terminal=("available", "temporarily_unavailable", "no_evidence")):
    deadline = time.time() + 2
    while time.time() < deadline:
        body = client.get(path).json()
        if body.get("status") in terminal or body.get("summary"):
            return body
        time.sleep(0.01)
    raise AssertionError("reviews background job did not finish")

def test_evidence_locality_lookup_skips_live_city_rebuild(monkeypatch):
    def fail_rank(*_args, **_kwargs):
        raise AssertionError("evidence status routes must not rebuild the whole city")

    monkeypatch.setattr(main, "rank", fail_rank)
    city, locality = main._evidence_locality("delhi-ncr", "noida-62")

    assert city["name"] == "Delhi NCR"
    assert locality["name"] == "Sector 62, Noida"
    assert locality["median_rent"] == 19000


def test_fast_forecast_route_skips_city_rank_and_gemini(client, monkeypatch):
    def fail_rank(*_args, **_kwargs):
        raise AssertionError("the chart endpoint must not rebuild the whole city")

    def fail_explain(*_args, **_kwargs):
        raise AssertionError("the chart endpoint must not wait for Gemini")

    main._air_forecast_cache.clear()
    monkeypatch.setattr(main, "rank", fail_rank)
    monkeypatch.setattr(gemini, "explain", fail_explain)
    response = client.get("/api/neighborhood/noida-62/air-quality-forecast?city=delhi-ncr")

    assert response.status_code == 200
    assert response.json()["status"] == "available"
    assert response.json()["forecast"] == [{"label": "12:00", "aqi": 120}]


def test_fast_forecast_is_cached_and_concurrent_requests_share_one_call(monkeypatch):
    calls = {"n": 0}
    locality = {"lat": 28.6, "lng": 77.2}
    key = ("delhi-ncr", "concurrent-aqi")
    main._air_forecast_cache.clear()

    def slow_forecast(*_args, **_kwargs):
        calls["n"] += 1
        time.sleep(0.03)
        return [{"label": "13:00", "aqi": 44}]

    monkeypatch.setattr(maps, "air_quality_forecast", slow_forecast)
    with ThreadPoolExecutor(max_workers=2) as pool:
        rows = list(pool.map(lambda _index: main._air_forecast(key, locality), range(2)))

    assert rows[0] == rows[1] == [{"label": "13:00", "aqi": 44}]
    assert calls["n"] == 1


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
    _clear_reviews_state()
    path = "/api/neighborhood/clean-cheap/reviews?city=delhi-ncr"
    r = client.get(path)
    assert r.status_code == 200
    assert r.json()["status"] == "pending"
    body = _wait_for_reviews(client, path)
    assert body["summary"]
    assert body["citations"][0]["uri"].startswith("http")


def test_reviews_endpoint_caches(client, monkeypatch):
    calls = {"n": 0}

    def reviews(name, city):
        calls["n"] += 1
        return {"summary": "cached", "citations": []}

    monkeypatch.setattr(gemini, "web_reviews", reviews)
    _clear_reviews_state()
    path = "/api/neighborhood/middle/reviews?city=delhi-ncr"
    client.get(path)
    _wait_for_reviews(client, path)
    client.get(path)
    assert calls["n"] == 1, "grounded review call must be cached, not repeated"


def test_reviews_endpoint_does_not_cache_service_failure(client, monkeypatch):
    calls = {"n": 0}

    def unavailable(name, city):
        calls["n"] += 1
        return {"summary": "", "citations": [], "status": "temporarily_unavailable",
                "errorCode": "vertex_permission_denied"}

    monkeypatch.setattr(gemini, "web_reviews", unavailable)
    _clear_reviews_state()
    path = "/api/neighborhood/middle/reviews?city=delhi-ncr"
    r1 = client.get(path)
    body = _wait_for_reviews(client, path)
    r2 = client.get(path)

    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json()["status"] == "pending"
    assert body["status"] == r2.json()["status"] == "temporarily_unavailable"
    assert calls["n"] == 1, "a short failure TTL must prevent an immediate retry storm"


def test_reviews_endpoint_does_not_cache_empty_no_evidence(client, monkeypatch):
    calls = {"n": 0}

    def empty(name, city):
        calls["n"] += 1
        return {"summary": "", "citations": [], "status": "no_evidence"}

    monkeypatch.setattr(gemini, "web_reviews", empty)
    _clear_reviews_state()
    path = "/api/neighborhood/middle/reviews?city=delhi-ncr"
    client.get(path)
    body = _wait_for_reviews(client, path)
    client.get(path)
    assert body["status"] == "no_evidence"
    assert calls["n"] == 1, "empty grounding should be briefly remembered, not retried in a loop"


def test_reviews_refresh_bypasses_a_cached_summary(client, monkeypatch):
    calls = {"n": 0}

    def reviews(name, city):
        calls["n"] += 1
        return {"summary": f"version {calls['n']}", "citations": [], "status": "available"}

    monkeypatch.setattr(gemini, "web_reviews", reviews)
    _clear_reviews_state()
    path = "/api/neighborhood/middle/reviews?city=delhi-ncr"
    client.get(path)
    first = _wait_for_reviews(client, path)
    cached = client.get(path).json()
    refreshing = client.get(path + "&refresh=true").json()
    assert first["summary"] == cached["summary"] == refreshing["summary"] == "version 1"
    deadline = time.time() + 2
    while time.time() < deadline and main._reviews_cache.get(("delhi-ncr", "middle"), (0, {}))[1].get("summary") != "version 2":
        time.sleep(0.01)
    assert client.get(path).json()["summary"] == "version 2"


def test_reviews_endpoint_404_for_unknown(client):
    _clear_reviews_state()
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
