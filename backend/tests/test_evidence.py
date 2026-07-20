"""Phase 2: evidence envelopes and honest missing-signal semantics."""

from app import maps
from app.evidence import metric_evidence


def fake_features():
    base = {"aqi_category": "Moderate", "aqi_pollutant": "pm25", "photo": ""}
    return [
        {**base, "id": "clean-cheap", "name": "Clean & Cheap", "short": "CleanCheap",
         "accent": "#7C5CF6", "lat": 28.60, "lng": 77.20, "median_rent": 15000,
         "safety_est": 80, "aqi": 60, "amenity_count": 18, "commute_min": 20},
        {**base, "id": "middle", "name": "Middle Town", "short": "Middle",
         "accent": "#4F86F7", "lat": 28.55, "lng": 77.30, "median_rent": 25000,
         "safety_est": 70, "aqi": 150, "amenity_count": 12, "commute_min": 35},
        {**base, "id": "posh-polluted", "name": "Posh but Polluted", "short": "Posh",
         "accent": "#3FB984", "lat": 28.50, "lng": 77.10, "median_rent": 40000,
         "safety_est": 75, "aqi": 240, "amenity_count": 20, "commute_min": 50},
    ]


def test_evidence_envelope_is_complete_and_additive():
    result = maps.score_india(fake_features())[0]
    assert set(result["evidence"]) == {
        "affordability", "safety", "commute", "lifestyle", "air_quality",
    }
    for metric, envelope in result["evidence"].items():
        assert envelope["metric"] == metric
        for key in (
            "value", "unit", "source", "sourceType", "status", "fetchedAt",
            "geographicScope", "confidence", "limitation",
        ):
            assert key in envelope


def test_curated_metrics_are_not_labelled_live():
    evidence = metric_evidence(fake_features()[0])
    assert evidence["affordability"]["status"] == "estimated"
    assert evidence["affordability"]["sourceType"] == "curated_market_estimate"
    assert evidence["safety"]["status"] == "curated"
    assert evidence["safety"]["sourceType"] == "curated_proxy"


def test_missing_commute_is_excluded_and_makes_score_provisional():
    features = fake_features()
    features[0]["commute_min"] = None
    features[0]["commuteDataStatus"] = "temporarily_unavailable"
    result = next(r for r in maps.score_india(features) if r["id"] == "clean-cheap")
    assert result["subscores"]["commute"] is None
    assert "commute" in result["missingPillars"]
    assert result["fitScoreDataStatus"] == "provisional"
    assert result["evidence"]["commute"]["status"] == "temporarily_unavailable"


def test_partial_amenities_are_visible_but_not_scored_as_complete():
    features = fake_features()
    features[0]["amenityDataStatus"] = "partial"
    features[0]["amenityFailedCategories"] = ["park"]
    result = next(r for r in maps.score_india(features) if r["id"] == "clean-cheap")
    assert result["amenity_count"] == 18
    assert result["subscores"]["lifestyle"] is None
    assert "lifestyle" in result["missingPillars"]
    assert result["evidence"]["lifestyle"]["status"] == "partial"
    assert result["evidence"]["lifestyle"]["confidence"] == "low"


def test_sparse_normalization_preserves_scores_for_available_peers():
    features = fake_features()
    features[1]["commute_min"] = None
    ranked = maps.score_india(features)
    values = {r["id"]: r["subscores"]["commute"] for r in ranked}
    assert values["middle"] is None
    assert values["clean-cheap"] == 96
    assert values["posh-polluted"] == 40


def test_amenity_profile_distinguishes_partial_and_total_failure(monkeypatch):
    counts = {t: 4 for t in maps.AMENITY_TYPES}
    counts["park"] = None
    monkeypatch.setattr(maps, "_count_places", lambda lat, lng, t: counts[t])
    partial = maps.amenity_profile(28.6, 77.2)
    assert partial["status"] == "partial"
    assert partial["total"] == 4 * (len(maps.AMENITY_TYPES) - 1)
    assert partial["failedCategories"] == ["park"]

    monkeypatch.setattr(maps, "_count_places", lambda *args: None)
    missing = maps.amenity_profile(28.6, 77.2)
    assert missing["status"] == "temporarily_unavailable"
    assert missing["total"] is None


def test_commute_failure_returns_none_not_forty(monkeypatch):
    class BrokenResponse:
        def json(self):
            return {"status": "REQUEST_DENIED"}

    monkeypatch.setattr(maps.requests, "get", lambda *a, **k: BrokenResponse())
    assert maps.commute_minutes(1, 2, 3, 4) is None
