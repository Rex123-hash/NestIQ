"""Published Phase 11 cities must be useful without inventing evidence."""

from app import maps
from app.evidence import metric_evidence
from app.india import CITIES


NEW_CITIES = {"ahmedabad", "jaipur", "lucknow", "kochi"}


def _stub_external(monkeypatch, safety):
    monkeypatch.setattr(maps, "air_quality", lambda lat, lng: {
        "aqi": 80, "category": "Satisfactory", "dominant": "pm25",
        "indexCode": "ind_cpcb", "status": "live", "fetchedAt": "2026-07-21T00:00:00Z"})
    monkeypatch.setattr(maps, "amenity_profile", lambda lat, lng: {
        "total": 14, "breakdown": {}, "status": "live"})
    monkeypatch.setattr(maps, "commute_minutes", lambda *args: 25)
    monkeypatch.setattr(maps, "locality_photo", lambda name: "")
    monkeypatch.setattr(maps, "safety_profile", lambda lat, lng: safety)


class TestGroundedRentCoverage:
    def test_every_new_locality_has_source_backed_rent(self):
        for city_id in NEW_CITIES:
            for loc in CITIES[city_id]["localities"]:
                assert loc["rent"] > 0, (city_id, loc["id"])
                assert loc["rentSource"] == "grounded_market_evidence"
                assert loc["rentEvidence"]["basis"].startswith("Indicative monthly")
                assert loc["rentEvidence"]["citations"]

    def test_grounded_envelope_exposes_method_date_and_citations(self):
        loc = CITIES["jaipur"]["localities"][0]
        evidence = metric_evidence({
            "median_rent": loc["rent"],
            "rentSource": loc["rentSource"],
            "rentEvidence": loc["rentEvidence"],
            "safety_est": 70,
        })["affordability"]
        assert evidence["sourceType"] == "grounded_market_evidence"
        assert evidence["fetchedAt"] == "2026-07-21"
        assert evidence["method"]
        assert evidence["citations"][0]["uri"].startswith("https://")


class TestEmergencyResilienceFallback:
    def test_missing_curated_safety_uses_live_emergency_access(self, monkeypatch):
        profile = {
            "status": "live", "confidence": "high", "emergencyAccessScore": 82,
            "signals": {}, "source": "Google Places API",
            "fetchedAt": "2026-07-21T00:00:00Z",
            "limitation": "Measures access, not crime incidence.",
        }
        _stub_external(monkeypatch, profile)
        feature = maps._fetch_features({
            "anchor": {"name": "Hub", "lat": 26.9, "lng": 75.8},
            "localities": [{
                "id": "new", "name": "New", "short": "New",
                "lat": 26.8, "lng": 75.8, "rent": 15000,
            }],
        })[0]
        assert feature["safety_est"] == 82
        assert feature["safetySource"] == "live_emergency_access_proxy"
        evidence = metric_evidence(feature)["safety"]
        assert evidence["sourceType"] == "live_emergency_access_proxy"
        assert evidence["status"] == "live"
        assert "not a crime-incidence score" in evidence["limitation"]

    def test_existing_curated_safety_is_unchanged(self, monkeypatch):
        _stub_external(monkeypatch, {
            "status": "live", "confidence": "high", "emergencyAccessScore": 12,
            "signals": {}, "source": "Google Places API", "fetchedAt": "2026-07-21T00:00:00Z",
        })
        feature = maps._fetch_features({
            "anchor": {"name": "Hub", "lat": 28.6, "lng": 77.2},
            "localities": [{
                "id": "existing", "name": "Existing", "short": "Existing",
                "lat": 28.6, "lng": 77.2, "rent": 20000, "safety": 74,
            }],
        })[0]
        assert feature["safety_est"] == 74
        assert feature["safetySource"] == "curated_proxy"

    def test_failed_live_safety_remains_missing(self, monkeypatch):
        _stub_external(monkeypatch, {
            "status": "temporarily_unavailable", "confidence": "unavailable",
            "emergencyAccessScore": None, "signals": {}, "source": "Google Places API",
            "fetchedAt": None,
        })
        feature = maps._fetch_features({
            "anchor": {"name": "Hub", "lat": 26.9, "lng": 75.8},
            "localities": [{
                "id": "new", "name": "New", "short": "New",
                "lat": 26.8, "lng": 75.8, "rent": 15000,
            }],
        })[0]
        assert feature["safety_est"] is None
        assert feature["safetySource"] == "unavailable"
