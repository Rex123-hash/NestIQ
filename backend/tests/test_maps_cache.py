"""build_city_features performance behavior: parallel fan-out + stale-while-revalidate.

Real requests are monkeypatched with slow fakes so we can assert wall-clock
behavior without network access.
"""
import time

import pytest

from app import maps


LOC_COUNT = len(maps.get_city("delhi-ncr")["localities"])
CALL_DELAY = 0.08  # each fake Google call takes this long


@pytest.fixture()
def slow_fetchers(monkeypatch):
    """Stub the four per-locality Google calls with slow, counting fakes."""
    calls = {"n": 0}

    def slow(value):
        def f(*a, **k):
            calls["n"] += 1
            time.sleep(CALL_DELAY)
            return value
        return f

    monkeypatch.setattr(maps, "air_quality", slow({"aqi": 100, "category": "Moderate", "dominant": "pm25"}))
    monkeypatch.setattr(maps, "amenity_profile", slow({"total": 12, "breakdown": {"restaurant": 12}}))
    monkeypatch.setattr(maps, "commute_minutes", slow(30))
    monkeypatch.setattr(maps, "locality_photo", slow(""))
    maps._cache.clear()
    yield calls
    maps._cache.clear()


def test_cold_build_fetches_all_localities_in_parallel(slow_fetchers):
    start = time.time()
    feats = maps.build_city_features("delhi-ncr")
    elapsed = time.time() - start

    assert len(feats) == LOC_COUNT
    assert slow_fetchers["n"] == LOC_COUNT * 4
    # Sequential would take LOC_COUNT * 4 * CALL_DELAY (~2.5s for 8 localities).
    # Parallel fan-out should finish in a small multiple of one call's latency.
    sequential = LOC_COUNT * 4 * CALL_DELAY
    assert elapsed < sequential / 3, f"took {elapsed:.2f}s — calls are not parallel"


def test_fresh_cache_is_served_without_refetching(slow_fetchers):
    maps.build_city_features("delhi-ncr")
    before = slow_fetchers["n"]
    feats = maps.build_city_features("delhi-ncr")
    assert len(feats) == LOC_COUNT
    assert slow_fetchers["n"] == before


def test_concurrent_cold_requests_share_one_build(slow_fetchers):
    import threading

    results = []

    def hit():
        results.append(maps.build_city_features("delhi-ncr"))

    threads = [threading.Thread(target=hit) for _ in range(3)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert all(len(r) == LOC_COUNT for r in results)
    # The three concurrent requests must not each fan out to Google.
    assert slow_fetchers["n"] == LOC_COUNT * 4


def test_expired_cache_served_instantly_and_refreshed_in_background(slow_fetchers):
    stale = [{"id": "stale-marker", "name": "Stale", "aqi": 999}]
    maps._cache["delhi-ncr"] = (time.time() - maps._TTL - 1, stale)

    start = time.time()
    feats = maps.build_city_features("delhi-ncr")
    elapsed = time.time() - start

    # The stale copy comes back immediately — the user never waits on Google.
    assert feats[0]["id"] == "stale-marker"
    assert elapsed < CALL_DELAY

    # ...and a background refresh replaces the cache shortly after.
    deadline = time.time() + 5
    while time.time() < deadline:
        ts, cached = maps._cache["delhi-ncr"]
        if cached[0]["id"] != "stale-marker":
            break
        time.sleep(0.05)
    assert maps._cache["delhi-ncr"][1][0]["id"] != "stale-marker"
    assert len(maps._cache["delhi-ncr"][1]) == LOC_COUNT
