"""A candidate city may be onboarded before its rent evidence is sourced.

Rent must never be hand-typed for a new city, and grounded verification cannot
run until the city is reachable. So the catalog has to tolerate a locality with
no rent: affordability drops out, the FitScore runs provisional with reduced
coverage, and the provenance says so plainly rather than presenting an absent
value as a curated estimate.
"""
from app import maps
from app.evidence import metric_evidence
from app.india import INDIA_DEFAULT_WEIGHTS
from app.maps import score_india
from tests.conftest import fake_features


class TestExistingCatalogUnchanged:
    def test_populated_rent_still_scores_complete(self):
        ranked = score_india(fake_features(), budget=30000)
        assert all(r["fitScoreDataStatus"] == "complete" for r in ranked)
        assert all(r["coveragePercent"] == 100 for r in ranked)

    def test_populated_rent_keeps_curated_envelope(self):
        aff = metric_evidence(fake_features()[0])["affordability"]
        assert aff["value"] == 15000
        assert aff["sourceType"] == "curated_market_estimate"
        assert aff["confidence"] == "medium"


class TestFeatureAssemblyWithoutRent:
    def test_locality_without_rent_key_assembles(self, monkeypatch):
        monkeypatch.setattr(maps, "air_quality", lambda lat, lng: {
            "aqi": 90, "category": "Satisfactory", "dominant": "pm25",
            "indexCode": "cpcb", "status": "live", "fetchedAt": "2026-07-21T00:00:00Z"})
        monkeypatch.setattr(maps, "amenity_profile", lambda lat, lng: {
            "total": 14, "breakdown": {}, "status": "live"})
        monkeypatch.setattr(maps, "commute_minutes", lambda a, b, c, d: 25)
        monkeypatch.setattr(maps, "locality_photo", lambda name: "")
        monkeypatch.setattr(maps, "safety_profile", lambda lat, lng: None)

        city = {
            "anchor": {"name": "Hub", "lat": 23.03, "lng": 72.56},
            "localities": [
                # A staged city: neither rent nor safety sourced yet.
                {"id": "new-loc", "name": "New Locality", "short": "New",
                 "lat": 23.02, "lng": 72.50},
            ],
        }
        feats = maps._fetch_features(city)
        assert feats[0]["median_rent"] is None
        assert feats[0]["safety_est"] is None


class TestProvisionalScoringWithoutRent:
    def _features(self):
        feats = fake_features()
        for f in feats:
            f["median_rent"] = None
        return feats

    def test_missing_rent_is_provisional(self):
        ranked = score_india(self._features(), budget=30000)
        assert all(r["fitScoreDataStatus"] == "provisional" for r in ranked)
        assert all(r["missingPillars"] == ["affordability"] for r in ranked)
        assert all(r["subscores"]["affordability"] is None for r in ranked)

    def test_coverage_drops_by_the_affordability_weight(self):
        total = sum(INDIA_DEFAULT_WEIGHTS.values())
        expected = round(100 * (total - INDIA_DEFAULT_WEIGHTS["affordability"]) / total)
        ranked = score_india(self._features(), budget=30000)
        assert all(r["coveragePercent"] == expected for r in ranked)

    def test_other_pillars_still_score(self):
        ranked = score_india(self._features(), budget=30000)
        assert all(r["subscores"]["air_quality"] is not None for r in ranked)
        assert all(r["fitScore"] > 0 for r in ranked)

    def test_mixed_rent_availability_scores_only_the_known_ones(self):
        # A partially sourced city must not drag the sourced localities down.
        feats = fake_features()
        feats[1]["median_rent"] = None
        ranked = score_india(feats, budget=30000)
        by_id = {r["id"]: r for r in ranked}
        assert by_id["middle"]["subscores"]["affordability"] is None
        assert by_id["clean-cheap"]["subscores"]["affordability"] is not None


class TestMissingRentProvenanceIsHonest:
    def test_absent_rent_is_not_claimed_as_curated(self):
        aff = metric_evidence({**fake_features()[0], "median_rent": None})["affordability"]
        assert aff["value"] is None
        assert aff["status"] != "estimated"
        assert aff["confidence"] != "medium"
        assert "curated" not in aff["sourceType"]

    def test_absent_rent_states_why(self):
        aff = metric_evidence({**fake_features()[0], "median_rent": None})["affordability"]
        assert "excluded" in aff["limitation"].lower()
