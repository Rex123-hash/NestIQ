"""Essential-services signals (hospitals, doctors, pharmacies, schools, universities).

These are ADDITIVE and shown for context only. They must never touch the lifestyle
amenity list or score, must reuse the full Phase 2 evidence envelope per category,
and must be cached (coords + radius + type set + freshness) to avoid re-billing Places.
"""
import time

import pytest

from app import maps

ENVELOPE_FIELDS = {
    "metric", "value", "unit", "source", "sourceType", "status",
    "fetchedAt", "geographicScope", "confidence", "limitation",
}


@pytest.fixture(autouse=True)
def _clear_cache():
    maps._essential_cache.clear()
    yield
    maps._essential_cache.clear()


def _counter(value):
    calls = {"n": 0}

    def fake(lat, lng, place_type):
        calls["n"] += 1
        return value

    return calls, fake


class TestEssentialProfile:
    def test_full_evidence_envelope_per_category_on_success(self, monkeypatch):
        _, fake = _counter(7)
        monkeypatch.setattr(maps, "_count_places", fake)
        prof = maps.essential_profile(28.6, 77.2)

        assert prof["status"] == "live"
        assert set(prof["categories"].keys()) == set(maps.ESSENTIAL_TYPES)
        for kind, env in prof["categories"].items():
            assert ENVELOPE_FIELDS.issubset(env.keys())
            assert env["value"] == 7
            assert env["sourceType"] == "live_google"
            assert env["status"] == "live"
            assert env["geographicScope"] == "1.5km_radius"
            assert "not part of the FitScore" in env["limitation"]

    def test_partial_failure_degrades_status(self, monkeypatch):
        def fake(lat, lng, place_type):
            return None if place_type == "hospital" else 3

        monkeypatch.setattr(maps, "_count_places", fake)
        prof = maps.essential_profile(28.6, 77.2)
        assert prof["status"] == "partial"
        assert prof["failedCategories"] == ["hospital"]
        assert prof["categories"]["hospital"]["value"] is None
        assert prof["categories"]["hospital"]["status"] == "temporarily_unavailable"
        assert prof["categories"]["hospital"]["confidence"] == "unavailable"

    def test_total_failure_is_unavailable_and_not_cached(self, monkeypatch):
        calls, fake = _counter(None)
        monkeypatch.setattr(maps, "_count_places", fake)
        prof = maps.essential_profile(28.6, 77.2)
        assert prof["status"] == "temporarily_unavailable"
        assert prof["total"] is None
        # A total failure must never poison the cache.
        maps.essential_profile(28.6, 77.2)
        assert calls["n"] == 2 * len(maps.ESSENTIAL_TYPES)

    def test_essentials_are_separate_from_lifestyle_amenities(self):
        # No essential type may leak into the lifestyle amenity list (which feeds
        # amenity_count / the lifestyle subscore).
        assert set(maps.ESSENTIAL_TYPES).isdisjoint(set(maps.AMENITY_TYPES))
        assert maps.ESSENTIAL_TYPES == ["hospital", "doctor", "pharmacy", "school", "university"]


class TestEssentialEndpoint:
    def test_endpoint_returns_profile_for_locality_coords(self, client, monkeypatch):
        seen = {}

        def fake(lat, lng):
            seen["lat"], seen["lng"] = lat, lng
            return {"status": "live", "categories": {}, "labels": maps.ESSENTIAL_LABELS,
                    "total": 5, "failedCategories": [], "source": maps.ESSENTIAL_SOURCE,
                    "fetchedAt": "2026-07-20T00:00:00+00:00"}

        monkeypatch.setattr(maps, "essential_profile", fake)
        body = client.get("/api/neighborhood/clean-cheap/essentials?city=delhi-ncr").json()
        assert body["status"] == "live"
        assert body["total"] == 5
        # Uses the matched locality's real centroid (from fake_features).
        assert seen == {"lat": 28.60, "lng": 77.20}

    def test_unknown_neighborhood_is_404(self, client):
        r = client.get("/api/neighborhood/does-not-exist/essentials?city=delhi-ncr")
        assert r.status_code == 404


class TestEssentialCache:
    def test_second_call_within_ttl_hits_cache(self, monkeypatch):
        calls, fake = _counter(4)
        monkeypatch.setattr(maps, "_count_places", fake)
        maps.essential_profile(28.6, 77.2)
        assert calls["n"] == len(maps.ESSENTIAL_TYPES)
        maps.essential_profile(28.6, 77.2)
        assert calls["n"] == len(maps.ESSENTIAL_TYPES)  # no new Places calls

    def test_different_coords_are_a_distinct_cache_entry(self, monkeypatch):
        calls, fake = _counter(4)
        monkeypatch.setattr(maps, "_count_places", fake)
        maps.essential_profile(28.6, 77.2)
        maps.essential_profile(19.1, 72.8)
        assert calls["n"] == 2 * len(maps.ESSENTIAL_TYPES)

    def test_cache_key_includes_coords_radius_and_type_set(self):
        base = maps._essential_cache_key(28.6, 77.2, 1500.0, ["hospital", "doctor"])
        assert base != maps._essential_cache_key(28.7, 77.2, 1500.0, ["hospital", "doctor"])
        assert base != maps._essential_cache_key(28.6, 77.2, 2000.0, ["hospital", "doctor"])
        assert base != maps._essential_cache_key(28.6, 77.2, 1500.0, ["hospital"])
