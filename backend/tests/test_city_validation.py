"""The Phase 11 validation gate must actually catch defects.

A checker that returns clean on every input is indistinguishable from one that
does nothing, so each rule is exercised against deliberately broken catalog
data. The nine shipped cities pass this gate; these fixtures prove that result
is earned rather than vacuous.
"""
from tools.validate_city import (
    assess_disagreement,
    coverage_summary,
    validate_scoring,
    validate_structure,
)


def _city(localities, anchor=None):
    return {
        "anchor": anchor if anchor is not None else {"name": "Hub", "lat": 28.6, "lng": 77.2},
        "localities": localities,
    }


def _loc(**overrides):
    base = {"id": "loc-1", "name": "Test Locality", "short": "Test",
            "lat": 28.6, "lng": 77.2, "rent": 20000, "safety": 70}
    base.update(overrides)
    return base


def _messages(findings, severity=None):
    return [f["message"] for f in findings
            if severity is None or f["severity"] == severity]


class TestStructuralGate:
    def test_clean_city_produces_no_findings(self):
        assert validate_structure("test", _city([_loc()])) == []

    def test_missing_required_key_is_an_error(self):
        # `short` is structural: without it the UI has no label to render.
        loc = _loc()
        del loc["short"]
        errors = _messages(validate_structure("test", _city([loc])), "error")
        assert any("missing required key 'short'" in m for m in errors)

    def test_missing_rent_is_a_warning_not_an_error(self):
        # A staged city is publishable but provisional: affordability drops out
        # rather than being invented, so this must not block publication.
        loc = _loc()
        del loc["rent"]
        findings = validate_structure("test", _city([loc]))
        assert _messages(findings, "error") == []
        assert any("affordability excluded" in m for m in _messages(findings, "warning"))

    def test_duplicate_locality_id_is_an_error(self):
        city = _city([_loc(id="dupe"), _loc(id="dupe", name="Other")])
        errors = _messages(validate_structure("test", city), "error")
        assert any("duplicate locality id" in m for m in errors)

    def test_centroid_outside_india_is_an_error(self):
        # London: a plausible-looking pair that is not in India.
        city = _city([_loc(lat=51.5, lng=-0.12)])
        errors = _messages(validate_structure("test", city), "error")
        assert any("latitude" in m for m in errors)
        assert any("longitude" in m for m in errors)

    def test_missing_anchor_field_is_an_error(self):
        city = _city([_loc()], anchor={"name": "Hub", "lat": 28.6})
        errors = _messages(validate_structure("test", city), "error")
        assert any("anchor is missing 'lng'" in m for m in errors)

    def test_city_with_no_localities_is_an_error(self):
        errors = _messages(validate_structure("test", _city([])), "error")
        assert any("no localities" in m for m in errors)

    def test_implausible_rent_is_a_warning_not_an_error(self):
        findings = validate_structure("test", _city([_loc(rent=50)]))
        assert any("plausible monthly range" in m for m in _messages(findings, "warning"))
        assert _messages(findings, "error") == []


class TestSafetyOmissionIsNotADefect:
    """Omitting safety is a legitimate onboarding state, not a failure."""

    def test_missing_safety_is_info_not_error(self):
        loc = _loc()
        del loc["safety"]
        findings = validate_structure("test", _city([loc]))
        assert _messages(findings, "error") == []
        assert any("emergency-access resilience proxy" in m for m in _messages(findings, "info"))

    def test_coverage_reports_the_safety_gap_numerically(self):
        with_safety = _loc(id="a")
        without = _loc(id="b")
        del without["safety"]
        summary = coverage_summary("test", _city([with_safety, without]))
        assert summary["safetyCoveragePercent"] == 50
        assert summary["rentCoveragePercent"] == 100


class TestDisagreementDualGate:
    """Flag only on a real delta backed by a real sample."""

    def _entry(self, curated, grounded, sample):
        return {"status": "available", "curatedRent": curated,
                "groundedMedian": grounded, "sampleSize": sample,
                "city": "test", "locality": "Test"}

    def test_small_delta_is_not_flagged(self):
        # 10% disagreement: within normal market spread, not actionable.
        assert assess_disagreement(self._entry(20000, 22000, 10), 5, 0.25) is None

    def test_large_delta_with_strong_sample_is_flagged_for_review(self):
        flag = assess_disagreement(self._entry(20000, 30000, 10), 5, 0.25)
        assert flag["verdict"] == "review"
        assert flag["deltaPercent"] == 50

    def test_large_delta_with_thin_sample_is_downgraded_not_dropped(self):
        # The crying-wolf guard: a real delta from two listings is surfaced as
        # weak evidence rather than presented as a confident disagreement.
        flag = assess_disagreement(self._entry(20000, 30000, 2), 5, 0.25)
        assert flag["verdict"] == "insufficient_sample"

    def test_negative_delta_is_flagged_symmetrically(self):
        flag = assess_disagreement(self._entry(30000, 20000, 10), 5, 0.25)
        assert flag["verdict"] == "review"
        assert flag["deltaPercent"] < 0

    def test_unavailable_verification_is_never_a_disagreement(self):
        entry = {"status": "temporarily_unavailable", "curatedRent": 20000,
                 "city": "test", "locality": "Test"}
        assert assess_disagreement(entry, 5, 0.25) is None

    def test_missing_grounded_median_is_not_a_disagreement(self):
        entry = self._entry(20000, None, 10)
        assert assess_disagreement(entry, 5, 0.25) is None


class TestScoringInvariants:
    """The publish gate must reject a score that misrepresents its own coverage."""

    def _ranked(self, **overrides):
        base = {"name": "Test", "fitScore": 72, "missingPillars": [],
                "fitScoreDataStatus": "complete", "coveragePercent": 100,
                "airHealthBand": "Moderate", "airHealthScore": 60}
        base.update(overrides)
        return [base]

    def test_clean_score_produces_no_findings(self):
        assert validate_scoring("test", self._ranked()) == []

    def test_missing_pillar_claiming_complete_is_an_error(self):
        # The exact failure the safety-omission work exists to prevent.
        findings = validate_scoring("test", self._ranked(
            missingPillars=["safety"], fitScoreDataStatus="complete"))
        assert any("status is 'complete'" in f["message"] for f in findings)

    def test_complete_score_with_partial_coverage_is_an_error(self):
        findings = validate_scoring("test", self._ranked(coveragePercent=80))
        assert any("coverage is 80%" in f["message"] for f in findings)

    def test_provisional_status_without_missing_pillars_is_an_error(self):
        findings = validate_scoring("test", self._ranked(
            fitScoreDataStatus="provisional"))
        assert any("no missing pillars" in f["message"] for f in findings)

    def test_severe_air_scoring_as_healthy_is_an_error(self):
        # The original AQI-500-scores-96 bug, pinned as a publish gate.
        findings = validate_scoring("test", self._ranked(
            airHealthBand="Severe", airHealthScore=96))
        assert any("Severe air band" in f["message"] for f in findings)

    def test_severe_air_with_a_low_score_is_accepted(self):
        findings = validate_scoring("test", self._ranked(
            airHealthBand="Severe", airHealthScore=8))
        assert findings == []

    def test_non_numeric_fitscore_is_an_error(self):
        findings = validate_scoring("test", self._ranked(fitScore=None))
        assert any("not numeric" in f["message"] for f in findings)

    def test_out_of_range_fitscore_is_an_error(self):
        findings = validate_scoring("test", self._ranked(fitScore=140))
        assert any("outside 0-100" in f["message"] for f in findings)

    def test_provisional_score_with_matching_coverage_is_accepted(self):
        findings = validate_scoring("test", self._ranked(
            missingPillars=["safety"], fitScoreDataStatus="provisional",
            coveragePercent=80))
        assert findings == []


class TestShippedCatalogPassesTheGate:
    def test_all_nine_cities_have_zero_structural_errors(self):
        from app.india import CITIES
        errors = []
        for city_id, city in CITIES.items():
            errors += [f for f in validate_structure(city_id, city)
                       if f["severity"] == "error"]
        assert errors == []
