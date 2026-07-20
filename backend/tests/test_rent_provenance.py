"""Rent sourced from grounded evidence must not wear the curated label.

Phase 11 onboards new cities with rent from `gemini.verify_rent` (grounded
search with citations) rather than a hand-typed integer. That is strictly
better evidence than the curated dataset, so it needs its own provenance --
collapsing both into `curated_market_estimate` would understate the grounded
case and misdescribe its source.
"""
from app.evidence import metric_evidence
from tests.conftest import fake_features


class TestCuratedRentIsUnchanged:
    """The nine shipped cities carry no rentSource and must not move."""

    def test_absent_rent_source_keeps_the_curated_envelope(self):
        aff = metric_evidence(fake_features()[0])["affordability"]
        assert aff["sourceType"] == "curated_market_estimate"
        assert aff["source"] == "NestIQ curated locality market dataset"
        assert aff["status"] == "estimated"
        assert aff["confidence"] == "medium"

    def test_explicit_curated_source_is_equivalent_to_absent(self):
        feature = {**fake_features()[0], "rentSource": "curated_market_estimate"}
        aff = metric_evidence(feature)["affordability"]
        assert aff["sourceType"] == "curated_market_estimate"


class TestGroundedRentProvenance:
    def test_grounded_rent_is_labelled_distinctly(self):
        feature = {**fake_features()[0], "rentSource": "grounded_market_evidence"}
        aff = metric_evidence(feature)["affordability"]
        assert aff["sourceType"] == "grounded_market_evidence"
        assert aff["sourceType"] != "curated_market_estimate"

    def test_grounded_rent_names_its_method_not_the_curated_dataset(self):
        feature = {**fake_features()[0], "rentSource": "grounded_market_evidence"}
        aff = metric_evidence(feature)["affordability"]
        assert "curated" not in aff["source"].lower()
        assert "grounded" in aff["source"].lower()

    def test_grounded_rent_still_states_its_limitation(self):
        # Better evidence is not proof of an available tenancy at that price.
        feature = {**fake_features()[0], "rentSource": "grounded_market_evidence"}
        aff = metric_evidence(feature)["affordability"]
        assert aff["limitation"]
        assert "not a guaranteed quote" in aff["limitation"].lower()

    def test_value_and_unit_are_untouched_by_provenance(self):
        curated = metric_evidence(fake_features()[0])["affordability"]
        grounded = metric_evidence(
            {**fake_features()[0], "rentSource": "grounded_market_evidence"}
        )["affordability"]
        assert curated["value"] == grounded["value"]
        assert curated["unit"] == grounded["unit"] == "INR/month"
