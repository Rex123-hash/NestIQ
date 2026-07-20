"""FitScore engine: normalization, weighting, ranking, labels."""
from app.fitscore import _minmax, _match, score_neighborhoods, DEFAULT_WEIGHTS, _BAND_LO, _BAND_HI
from app.maps import score_india, INDIA_KEYS
from tests.conftest import fake_features


class TestMinMax:
    def test_best_value_hits_band_top(self):
        assert max(_minmax([10, 20, 30])) == _BAND_HI

    def test_worst_value_hits_band_floor(self):
        assert min(_minmax([10, 20, 30])) == _BAND_LO

    def test_never_produces_0_or_100(self):
        scores = _minmax([1, 50, 999])
        assert all(0 < s < 100 for s in scores)

    def test_invert_flips_ordering(self):
        normal = _minmax([10, 20, 30])
        inverted = _minmax([10, 20, 30], invert=True)
        assert normal[0] == _BAND_LO and inverted[0] == _BAND_HI

    def test_identical_values_do_not_crash(self):
        assert _minmax([5, 5, 5]) == [_BAND_LO] * 3


class TestMatchLabels:
    def test_excellent_at_85(self):
        assert _match(85) == "Excellent Match"

    def test_good_at_75(self):
        assert _match(75) == "Good Match"

    def test_fair_below_75(self):
        assert _match(60) == "Fair Match"


class TestScoreIndia:
    def test_ranks_best_locality_first_on_defaults(self):
        ranked = score_india(fake_features(), budget=30000)
        # cheapest + cleanest + fastest commute must win under default weights
        assert ranked[0]["id"] == "clean-cheap"

    def test_air_quality_weight_dominates_when_maxed(self):
        w = {"affordability": 0, "safety": 0, "commute": 0, "lifestyle": 0, "air_quality": 100}
        ranked = score_india(fake_features(), weights=w)
        assert [r["id"] for r in ranked][0] == "clean-cheap"
        assert ranked[-1]["id"] == "posh-polluted"

    def test_lifestyle_weight_flips_the_ranking(self):
        w = {"affordability": 0, "safety": 0, "commute": 0, "lifestyle": 100, "air_quality": 0}
        ranked = score_india(fake_features(), weights=w)
        assert ranked[0]["id"] == "posh-polluted"  # most amenities

    def test_every_result_has_all_pillar_subscores(self):
        for r in score_india(fake_features()):
            assert set(r["subscores"].keys()) == set(INDIA_KEYS)

    def test_fitscore_within_presentation_band(self):
        for r in score_india(fake_features()):
            assert _BAND_LO <= r["fitScore"] <= _BAND_HI

    def test_empty_input_returns_empty(self):
        assert score_india([]) == []

    def test_every_result_carries_anomalies_list(self):
        for r in score_india(fake_features()):
            assert isinstance(r["anomalies"], list)


class TestAnomalies:
    def _feats(self):
        # Four near-identical localities plus one with a wildly high AQI. Only
        # AQI varies, so only the outlier should be flagged.
        base = {"aqi_category": "x", "aqi_pollutant": "pm25", "photo": "", "short": "S",
                "accent": "#111", "lat": 0.0, "lng": 0.0, "median_rent": 20000,
                "safety_est": 75, "amenity_count": 15, "commute_min": 30}
        aqis = {"a": 90, "b": 95, "c": 100, "d": 92, "polluted": 400}
        return [{**base, "id": k, "name": k, "aqi": v} for k, v in aqis.items()]

    def test_flags_the_outlier(self):
        ranked = score_india(self._feats())
        polluted = next(r for r in ranked if r["id"] == "polluted")
        assert "Unusually polluted" in [a["label"] for a in polluted["anomalies"]]

    def test_central_locality_has_no_flags(self):
        ranked = score_india(self._feats())
        c = next(r for r in ranked if r["id"] == "c")
        assert c["anomalies"] == []

    def test_small_city_skips_anomalies(self):
        # Fewer than 4 localities: distribution too small to flag anything.
        for r in score_india(fake_features()):
            assert r["anomalies"] == []


class TestScoreIndiaAirTrust:
    """Phase 1: absolute CPCB air semantics wired into score_india."""

    def _severe(self, varied=False):
        base = {"aqi_category": "Severe", "aqi_pollutant": "pm25", "photo": "", "short": "S",
                "accent": "#111", "lat": 0.0, "lng": 0.0, "median_rent": 20000,
                "safety_est": 75, "amenity_count": 15, "commute_min": 30}
        aqis = {"a": 410, "b": 450, "c": 500, "d": 430} if varied else {k: 500 for k in "abcd"}
        return [{**base, "id": k, "name": k, "aqi": v} for k, v in aqis.items()]

    def test_all_severe_air_subscore_stays_in_severe_band(self):
        for r in score_india(self._severe()):
            assert r["subscores"]["air_quality"] <= 14
            assert r["airHealthBand"] == "Severe"

    def test_all_severe_never_reads_as_clean(self):
        # The exact regression: no locality at AQI 500 may score 96 for air.
        assert all(r["subscores"]["air_quality"] != 96 for r in score_india(self._severe()))

    def test_air_subscore_equals_air_health_score(self):
        for r in score_india(self._severe(varied=True)):
            assert r["subscores"]["air_quality"] == r["airHealthScore"]

    def test_all_severe_carries_critical_risk(self):
        for r in score_india(self._severe()):
            assert r["criticalRisks"] and r["criticalRisks"][0]["severity"] == "critical"

    def test_equal_aqi_ties_relative_rank(self):
        # Every locality identical -> all tied at rank 1, no invented winner.
        assert all(r["airRelativeRank"] == 1 for r in score_india(self._severe()))

    def test_varied_severe_still_identifies_least_polluted(self):
        ranked = score_india(self._severe(varied=True))
        cleanest = next(r for r in ranked if r["airRelativeRank"] == 1)
        assert cleanest["aqi"] == 410  # lowest AQI ranks first
        # ...but it is still Severe, not clean.
        assert cleanest["subscores"]["air_quality"] <= 14

    def test_additive_provenance_fields_present(self):
        for r in score_india(self._severe()):
            for f in ("airHealthScore", "airRelativeRank", "airDataStatus",
                      "airSource", "airFetchedAt", "airHealthBand", "criticalRisks"):
                assert f in r

    def test_missing_aqi_does_not_fabricate_a_score(self):
        feats = self._severe()
        feats[0]["aqi"] = None
        ranked = score_india(feats)
        missing = next(r for r in ranked if r["id"] == "a")
        assert missing["subscores"]["air_quality"] is None
        assert missing["airHealthScore"] is None
        assert missing["airDataStatus"] == "temporarily_unavailable"
        # still ranked with a real FitScore from the remaining pillars
        assert isinstance(missing["fitScore"], int)
        assert "air_quality" in missing["subscores"]  # key preserved

    def test_complete_score_is_marked_complete(self):
        for r in score_india(self._severe()):
            assert r["fitScoreDataStatus"] == "complete"
            assert r["missingPillars"] == []
            assert r["coveragePercent"] == 100
            assert r["matchDisplay"] == r["match"]

    def test_missing_air_makes_score_provisional(self):
        feats = self._severe()
        feats[0]["aqi"] = None
        r = next(x for x in score_india(feats) if x["id"] == "a")
        assert r["fitScoreDataStatus"] == "provisional"
        assert r["missingPillars"] == ["air_quality"]
        assert r["coveragePercent"] < 100
        assert r["matchDisplay"].startswith("Provisional ")

    def test_uaqi_only_is_not_scored_as_cpcb(self):
        # A Universal-AQI reading must not run through CPCB bands.
        feats = self._severe()
        feats[0]["aqi"] = 55            # UAQI 55 (0-100 scale) is NOT CPCB 55
        feats[0]["airIndexCode"] = "uaqi"
        r = next(x for x in score_india(feats) if x["id"] == "a")
        assert r["airHealthScore"] is None      # no CPCB health score
        assert r["airHealthBand"] is None
        assert r["criticalRisks"] == []
        assert r["subscores"]["air_quality"] is None
        assert r["fitScoreDataStatus"] == "provisional"
        assert r["airIndexCode"] == "uaqi"
        assert r["aqi"] == 55                    # raw reading preserved for display

    def test_cpcb_index_is_scored(self):
        feats = self._severe()
        feats[0]["airIndexCode"] = "ind_cpcb"
        r = next(x for x in score_india(feats) if x["id"] == "a")
        assert r["airHealthScore"] == 0
        assert r["airHealthBand"] == "Severe"
        assert r["fitScoreDataStatus"] == "complete"

    def test_provenance_passthrough_from_features(self):
        feats = self._severe()
        feats[0]["airDataStatus"] = "stale"
        feats[0]["airSource"] = "Google Air Quality API (CPCB)"
        feats[0]["airFetchedAt"] = "2026-07-19T00:00:00Z"
        r = next(x for x in score_india(feats) if x["id"] == "a")
        assert r["airDataStatus"] == "stale"
        assert r["airFetchedAt"] == "2026-07-19T00:00:00Z"


class TestScoreNeighborhoodsNYC:
    def make(self):
        return [
            {"id": "a", "median_rent": 2000, "incidents_per_1k": 300, "collisions_per_1k": 10,
             "commute_min": 20, "amenity_count": 1500, "forecast_pct": 2.0},
            {"id": "b", "median_rent": 4000, "incidents_per_1k": 700, "collisions_per_1k": 25,
             "commute_min": 45, "amenity_count": 700, "forecast_pct": -1.0},
        ]

    def test_safer_cheaper_faster_wins(self):
        ranked = score_neighborhoods(self.make(), dict(DEFAULT_WEIGHTS), budget=2500)
        assert ranked[0]["id"] == "a"

    def test_results_sorted_descending(self):
        ranked = score_neighborhoods(self.make(), dict(DEFAULT_WEIGHTS), budget=2500)
        assert ranked[0]["fitScore"] >= ranked[-1]["fitScore"]
