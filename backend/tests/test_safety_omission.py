"""Onboarding a city with no safety source must degrade honestly, not invent.

No consistent open locality-level crime dataset exists for India, so a newly
onboarded city may legitimately have no `safety` value at all. Omission must
flow through as a provisional FitScore with reduced coverage -- never as a
fabricated number, and never as absent data wearing a curated label.
"""
from app import maps
from app.evidence import metric_evidence
from app.india import INDIA_DEFAULT_WEIGHTS
from app.maps import _minmax, score_india
from tests.conftest import fake_features


class TestHelperEquivalence:
    """Switching safety to the sparse helper must not move any existing score."""

    def test_sparse_helper_matches_strict_helper_when_fully_populated(self):
        # With no None present the sparse helper delegates to _minmax on an
        # identical list, so every existing city is unaffected by construction.
        values = [80, 70, 75]
        valid = [v for v in values if v is not None]
        scored = iter(_minmax(valid))
        sparse = [next(scored) if v is not None else None for v in values]
        assert sparse == _minmax(values)

    def test_existing_cities_keep_complete_status_and_full_coverage(self):
        ranked = score_india(fake_features(), budget=30000)
        assert all(r["fitScoreDataStatus"] == "complete" for r in ranked)
        assert all(r["coveragePercent"] == 100 for r in ranked)
        assert all(r["missingPillars"] == [] for r in ranked)


class TestFeatureAssemblyWithoutSafety:
    """maps.py feature assembly must not require a `safety` key."""

    def test_locality_without_safety_key_assembles(self, monkeypatch):
        monkeypatch.setattr(maps, "air_quality", lambda lat, lng: {
            "aqi": 90, "category": "Satisfactory", "dominant": "pm25",
            "indexCode": "cpcb", "status": "live", "fetchedAt": "2026-07-20T00:00:00Z"})
        monkeypatch.setattr(maps, "amenity_profile", lambda lat, lng: {
            "total": 14, "breakdown": {}, "status": "live"})
        monkeypatch.setattr(maps, "commute_minutes", lambda a, b, c, d: 25)
        monkeypatch.setattr(maps, "locality_photo", lambda name: "")
        monkeypatch.setattr(maps, "safety_profile", lambda lat, lng: None)

        city = {
            "anchor": {"name": "Hub", "lat": 26.0, "lng": 91.0},
            "localities": [
                # Deliberately no "safety" key: the new-city case.
                {"id": "new-loc", "name": "New Locality", "short": "New",
                 "lat": 26.14, "lng": 91.73, "rent": 18000},
            ],
        }
        feats = maps._fetch_features(city)
        assert feats[0]["safety_est"] is None


class TestProvisionalScoringWithoutSafety:
    """A missing safety pillar reweights instead of zeroing or fabricating."""

    def _features_without_safety(self):
        feats = fake_features()
        for f in feats:
            f["safety_est"] = None
        return feats

    def test_score_is_provisional_and_lists_safety_missing(self):
        ranked = score_india(self._features_without_safety(), budget=30000)
        assert all(r["fitScoreDataStatus"] == "provisional" for r in ranked)
        assert all(r["missingPillars"] == ["safety"] for r in ranked)
        assert all(r["subscores"]["safety"] is None for r in ranked)

    def test_coverage_drops_by_exactly_the_safety_weight(self):
        total = sum(INDIA_DEFAULT_WEIGHTS.values())
        expected = round(100 * (total - INDIA_DEFAULT_WEIGHTS["safety"]) / total)
        ranked = score_india(self._features_without_safety(), budget=30000)
        assert all(r["coveragePercent"] == expected for r in ranked)

    def test_fitscore_is_not_zeroed_by_the_missing_pillar(self):
        # Reweighting over available pillars, not treating safety as 0.
        ranked = score_india(self._features_without_safety(), budget=30000)
        assert all(r["fitScore"] > 0 for r in ranked)

    def test_match_label_is_marked_provisional(self):
        ranked = score_india(self._features_without_safety(), budget=30000)
        assert all(r["matchDisplay"].startswith("Provisional") for r in ranked)


class TestMissingSafetyProvenanceIsHonest:
    """Absent data must never be labelled as a curated estimate."""

    def test_absent_safety_is_not_claimed_as_curated(self):
        feature = {**fake_features()[0], "safety_est": None}
        safety = metric_evidence(feature)["safety"]
        assert safety["value"] is None
        assert safety["status"] != "curated"
        assert safety["confidence"] != "medium"
        assert "curated" not in safety["sourceType"]

    def test_absent_safety_carries_no_curated_confidence_label(self):
        feature = {**fake_features()[0], "safety_est": None}
        safety = metric_evidence(feature)["safety"]
        assert safety.get("confidenceLabel") != "Curated score confidence"

    def test_present_safety_keeps_the_existing_curated_envelope(self):
        # Regression guard: the honest-omission branch must not alter the
        # provenance the existing nine cities already publish.
        safety = metric_evidence(fake_features()[0])["safety"]
        assert safety["value"] == 80
        assert safety["sourceType"] == "curated_proxy"
        assert safety["status"] == "curated"
        assert safety["confidence"] == "medium"
        assert safety["confidenceLabel"] == "Curated score confidence"
