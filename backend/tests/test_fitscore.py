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
