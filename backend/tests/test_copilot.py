"""NestIQ Copilot routing and additive response contract."""
import pytest

from app import copilot, gemini
from app.india import get_city
from app.sql_guard import SqlGuardError, validate_analytics_sql


CHENNAI_LOCALITIES = get_city("chennai")["localities"]
PATNA_LOCALITIES = get_city("patna")["localities"]


class TestCopilotRouting:
    def test_comparative_question_routes_to_analytics(self):
        assert copilot.route_intent("Compare the cheapest localities") == copilot.CITY_ANALYTICS
        assert copilot.route_intent("Which locality has the cleanest air?") == copilot.CITY_ANALYTICS
        assert copilot.route_intent(
            "Which localities are similar on air + rent?",
        ) == copilot.CITY_ANALYTICS

    def test_ordinary_city_question_avoids_an_unnecessary_analytics_job(self):
        assert copilot.route_intent("Is the air safe to go out today?") == copilot.CITY_EVIDENCE

    def test_general_concept_question_uses_general_guidance(self):
        assert copilot.route_intent("What does AQI 110 mean?") == copilot.GENERAL_GUIDANCE
        assert copilot.route_intent("What is AQI?") == copilot.GENERAL_GUIDANCE
        assert copilot.route_intent("How does CPCB classify air quality?") == copilot.GENERAL_GUIDANCE
        assert copilot.route_intent(
            "How should I compare rent and commute?",
        ) == copilot.GENERAL_GUIDANCE
        assert copilot.route_intent(
            "Should I prioritize cleaner air or a shorter commute?",
        ) == copilot.GENERAL_GUIDANCE

    def test_general_chat_and_calculations_never_trigger_city_evidence(self):
        assert copilot.route_intent("2+2") == copilot.GENERAL_GUIDANCE
        assert copilot.route_intent("hello") == copilot.GENERAL_GUIDANCE
        assert copilot.route_intent("Who wrote The Discovery of India?") == copilot.GENERAL_GUIDANCE

    def test_unrelated_superlative_does_not_trigger_bigquery(self):
        assert copilot.route_intent("What is the highest mountain in India?") == copilot.GENERAL_GUIDANCE

    def test_verified_name_only_comparison_routes_to_analytics(self):
        assert copilot.route_intent(
            "Compare Adyar and Velachery.", localities=CHENNAI_LOCALITIES,
        ) == copilot.CITY_ANALYTICS
        assert copilot.route_intent(
            "Is Kankarbagh better than Boring Road?", localities=PATNA_LOCALITIES,
        ) == copilot.CITY_ANALYTICS

    def test_one_verified_name_routes_to_that_localitys_evidence(self):
        assert copilot.route_intent(
            "Tell me about Kankarbagh", localities=PATNA_LOCALITIES,
        ) == copilot.LOCALITY_EVIDENCE
        assert [item["id"] for item in copilot.locality_mentions(
            "What about Adyar's rent?", CHENNAI_LOCALITIES,
        )] == ["adyar"]

    def test_named_budget_judgement_routes_to_city_analytics(self):
        kochi_localities = get_city("kochi")["localities"]
        assert copilot.route_intent(
            "Is Edappally, Kochi a good budget pick?", localities=kochi_localities,
        ) == copilot.CITY_ANALYTICS

    def test_unknown_names_and_scalar_concepts_do_not_trigger_bigquery(self):
        assert copilot.route_intent(
            "Compare Foo Colony and Bar Nagar", localities=CHENNAI_LOCALITIES,
        ) == copilot.GENERAL_GUIDANCE
        assert copilot.route_intent(
            "Compare AQI 110 with CPCB bands", localities=CHENNAI_LOCALITIES,
        ) == copilot.GENERAL_GUIDANCE

    def test_current_nestiq_subject_still_uses_city_evidence(self):
        assert copilot.route_intent("What is the current rent here?") == copilot.CITY_EVIDENCE
        assert copilot.route_intent("Is the air safe to go out today?") == copilot.CITY_EVIDENCE

    def test_explicit_locality_always_uses_locality_evidence(self):
        assert copilot.route_intent("Compare it with alternatives", "powai") == copilot.LOCALITY_EVIDENCE

    def test_referential_follow_up_inherits_the_last_user_analytics_route(self):
        history = [
            {"role": "user", "content": "Compare the cheapest localities"},
            {"role": "assistant", "content": "Here are several options."},
        ]
        assert copilot.route_intent("What about the second one?", history=history) == copilot.CITY_ANALYTICS

    def test_assistant_text_cannot_force_an_analytics_route(self):
        history = [{"role": "assistant", "content": "Compare the cheapest localities"}]
        assert copilot.route_intent("Tell me more about that", history=history) == copilot.GENERAL_GUIDANCE


class TestCopilotEnvelope:
    def test_bigquery_receipt_discloses_only_tools_that_ran(self):
        result = copilot.envelope(
            mode=copilot.CITY_ANALYTICS,
            city="mumbai",
            neighborhood_id=None,
            used_bigquery=True,
            rows=[{"id": "powai", "name": "Powai"}],
        )
        assert result["mode"] == "city_analytics"
        assert [tool["id"] for tool in result["tools"]] == ["bigquery", "gemini"]
        assert result["actions"] == [
            {"type": "view_locality", "localityId": "powai", "label": "View Powai"},
        ]
        assert len(result["followUps"]) == 3

    def test_evidence_envelope_never_claims_bigquery(self):
        result = copilot.envelope(
            mode=copilot.LOCALITY_EVIDENCE,
            city="mumbai",
            neighborhood_id="powai",
            used_bigquery=False,
            locality={"id": "powai", "name": "Powai"},
        )
        assert "bigquery" not in [tool["id"] for tool in result["tools"]]
        assert result["scope"]["level"] == "locality"

    def test_general_guidance_discloses_model_only_and_no_live_evidence(self):
        result = copilot.envelope(
            mode=copilot.GENERAL_GUIDANCE,
            city="lucknow",
            neighborhood_id=None,
            used_bigquery=False,
        )
        assert result["evidenceStatus"] == "not_applicable"
        assert [tool["id"] for tool in result["tools"]] == ["gemini"]

    def test_analytics_rows_gain_only_deterministic_catalog_and_cpcb_context(self):
        rows = copilot.analytics_context_rows(
            [{"name": "Adyar", "aqi": 110}], CHENNAI_LOCALITIES,
        )
        assert rows == [{
            "name": "Adyar", "aqi": 110, "id": "adyar", "cpcbBand": "Moderate",
        }]


def test_nl_to_sql_requests_navigation_identity_and_aqi_context(monkeypatch):
    calls = []

    class Response:
        text = "SELECT `id`, `name`, `aqi`, `aqi_category` FROM `india_localities_latest` WHERE city = @city LIMIT 5"

    def generate(**kwargs):
        calls.append(kwargs)
        return Response()

    monkeypatch.setattr(gemini, "_generate", generate)
    sql = gemini.nl_to_sql("Which locality has the lowest AQI?", "chennai", "india_localities_latest")

    assert sql.startswith("SELECT id, name, aqi, aqi_category")
    assert "`" not in sql
    assert validate_analytics_sql(sql)
    with pytest.raises(SqlGuardError):
        validate_analytics_sql(gemini._clean_sql("SELECT * FROM `other-project.data.secret`"))
    sql_call = calls[-1]
    prompt = sql_call["contents"]
    assert "MUST include id and name" in prompt
    assert "MUST also include aqi_category" in prompt
    assert "no semicolon or backticks" in prompt
    assert "ALWAYS include WHERE city = @city" in prompt
    assert "never embed the selected city as a quoted literal" in prompt
    assert "good, value, or budget choice" in prompt
    assert "For a similarity question" in prompt
    assert "use a.id < b.id" in prompt
    assert sql_call["config"].temperature == 0.0
    assert sql_call["config"].max_output_tokens == 512
    assert sql_call["config"].thinking_config.thinking_budget == 0

    assert gemini.ask("Compare them", "verified rows") == Response.text
    grounded_call = calls[-1]
    grounded_prompt = grounded_call["contents"]
    assert "Mention causal evidence ONLY" in grounded_prompt
    assert "answer directly in the first sentence" in grounded_prompt
    assert "Mention that limitation ONLY" in grounded_prompt
    assert grounded_call["config"].temperature == 0.1
    assert grounded_call["config"].max_output_tokens == 512
    assert grounded_call["config"].thinking_config.thinking_budget == 0

    assert gemini.ask_general("What is AQI?") == Response.text
    assert "config" not in calls[-1]

    assert gemini.explain("Adyar", {"air_quality": 82}, 22000, "Satisfactory air") == Response.text
    assert "config" not in calls[-1]
