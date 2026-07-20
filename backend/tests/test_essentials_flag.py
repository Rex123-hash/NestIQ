"""The ESSENTIALS_IN_LIFESTYLE_SCORE guard is a documented no-op this phase.

It must default OFF, and essential-services data present on a feature must never
change the lifestyle subscore or amenity_count — scoring stays exactly as today.
"""
from app import maps, gemini
from tests.conftest import fake_features


def test_flag_defaults_off():
    from app.config import settings
    assert settings.essentials_in_lifestyle_score is False


def test_essentials_data_on_features_never_changes_lifestyle_scoring():
    weights = dict(gemini.INDIA_DEFAULT)
    before = {r["id"]: (r["subscores"]["lifestyle"], r["amenity_count"])
              for r in maps.score_india([dict(f) for f in fake_features()], weights, 30000)}
    # Attach essential-services-like fields to every feature; scoring must ignore them.
    enriched = [{**f, "essentials": {"total": 999}, "essential_hospital": 50}
                for f in fake_features()]
    after = {r["id"]: (r["subscores"]["lifestyle"], r["amenity_count"])
             for r in maps.score_india(enriched, weights, 30000)}
    assert before == after
