"""Absolute CPCB air-quality scoring (Phase 1 trust fix).

The old min-max normalization let the least-polluted locality in any set hit the
top of the presentation band, so a city where every locality read AQI 500
(Severe) scored 96/100 for air. These tests lock the new behavior: an air-health
score anchored to absolute CPCB health bands that a relative comparison can
never lift out of its band.
"""
from app.air_quality import (
    CPCB_BANDS,
    cpcb_band,
    air_health_score,
    critical_risks,
    air_relative_ranks,
)


class TestCpcbBand:
    def test_good(self):
        assert cpcb_band(30) == "Good"

    def test_satisfactory(self):
        assert cpcb_band(80) == "Satisfactory"

    def test_moderate(self):
        assert cpcb_band(150) == "Moderate"

    def test_poor(self):
        assert cpcb_band(260) == "Poor"

    def test_very_poor(self):
        assert cpcb_band(350) == "Very Poor"

    def test_severe(self):
        assert cpcb_band(480) == "Severe"

    def test_beyond_scale_is_severe(self):
        assert cpcb_band(650) == "Severe"

    def test_missing_is_none(self):
        assert cpcb_band(None) is None


class TestAirHealthScore:
    def test_severe_500_is_never_excellent(self):
        # The headline bug: AQI 500 must never score high.
        assert air_health_score(500) <= 14

    def test_severe_500_bottoms_out(self):
        assert air_health_score(500) == 0

    def test_clean_air_scores_high(self):
        assert air_health_score(10) >= 90

    def test_band_boundaries_stay_in_band(self):
        # Every band's dirtiest edge lands at that band's score floor.
        for name, aqi_lo, aqi_hi, score_lo, score_hi in CPCB_BANDS:
            assert air_health_score(aqi_hi) == score_lo, name
            assert air_health_score(aqi_lo) == score_hi, name

    def test_monotonic_lower_aqi_never_scores_worse(self):
        prev = -1
        for aqi in range(500, -1, -1):  # from dirtiest to cleanest
            s = air_health_score(aqi)
            assert s >= prev, f"AQI {aqi} broke monotonicity"
            prev = s

    def test_relative_position_cannot_escape_band(self):
        # Two Severe localities: the "cleaner" one still stays in the Severe band.
        assert air_health_score(410) <= 14
        assert air_health_score(490) <= 14

    def test_missing_aqi_is_none(self):
        assert air_health_score(None) is None


class TestCriticalRisks:
    def test_severe_flags_critical(self):
        risks = critical_risks(500)
        assert risks and risks[0]["severity"] == "critical"
        assert "Severe" in risks[0]["label"]

    def test_very_poor_flags_high(self):
        risks = critical_risks(360)
        assert risks and risks[0]["severity"] == "high"

    def test_poor_flags_elevated(self):
        risks = critical_risks(250)
        assert risks and risks[0]["severity"] == "elevated"

    def test_moderate_has_no_critical_risk(self):
        assert critical_risks(150) == []

    def test_good_has_no_critical_risk(self):
        assert critical_risks(30) == []

    def test_missing_has_no_critical_risk(self):
        assert critical_risks(None) == []


class TestInvalidAqiInput:
    # Malformed AQI must never become a real band/score or raise a type error.
    BAD = [-5, -0.1, float("nan"), float("inf"), float("-inf"), "150", "abc", True, False, [], {}]

    def test_band_is_none_for_bad_input(self):
        for v in self.BAD:
            assert cpcb_band(v) is None, v

    def test_score_is_none_for_bad_input(self):
        for v in self.BAD:
            assert air_health_score(v) is None, v

    def test_no_critical_risk_for_bad_input(self):
        for v in self.BAD:
            assert critical_risks(v) == [], v

    def test_negative_is_not_good(self):
        assert air_health_score(-1) is None
        assert cpcb_band(-1) is None

    def test_relative_ranks_ignore_bad_values(self):
        # invalid entries get no rank; valid ones still rank among themselves
        assert air_relative_ranks([100, float("nan"), 200, -5]) == [1, None, 2, None]


class TestAirRelativeRanks:
    def test_lowest_aqi_ranks_first(self):
        assert air_relative_ranks([200, 100, 300]) == [2, 1, 3]

    def test_equal_aqi_ties(self):
        # All identical -> everyone tied at rank 1, no fabricated winner.
        assert air_relative_ranks([500, 500, 500]) == [1, 1, 1]

    def test_partial_tie_uses_competition_ranking(self):
        assert air_relative_ranks([100, 100, 200]) == [1, 1, 3]

    def test_missing_values_get_no_rank(self):
        assert air_relative_ranks([100, None, 200]) == [1, None, 2]
