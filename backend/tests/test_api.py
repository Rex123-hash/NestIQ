"""API contract tests — full request/response cycle with externals stubbed.

Covers search, ranking, detail (with BQML forecast), NL->SQL ask,
the SSE agent stream, and error paths.
"""
import json


class TestCoreEndpoints:
    def test_health(self, client):
        body = client.get("/api/health").json()
        assert body["ok"] is True and "delhi-ncr" in body["cities"]

    def test_cities_lists_india_first(self, client):
        body = client.get("/api/cities").json()
        assert body["default"] == "delhi-ncr"
        assert all(c["id"] != "new-york" for c in body["cities"])

    def test_search_returns_ranked_results_with_preferences(self, client):
        body = client.post("/api/search", json={"query": "clean air under 30000", "city": "delhi-ncr"}).json()
        results = body["results"]
        assert body["preferences"]["budget"] == 30000
        assert [r["fitScore"] for r in results] == sorted((r["fitScore"] for r in results), reverse=True)
        assert results[0]["id"] == "clean-cheap"

    def test_neighborhoods_default_listing(self, client):
        body = client.get("/api/neighborhoods?city=delhi-ncr").json()
        assert len(body["results"]) == 3


class TestProvisionalAndProvenanceApi:
    """End-to-end: provisional + provenance fields survive the API layer."""

    def _feats_with(self, over):
        from tests.conftest import fake_features
        feats = fake_features()
        feats[0].update(over)
        return feats

    def test_unavailable_air_yields_provisional_via_api(self, client, monkeypatch):
        from app import maps
        monkeypatch.setattr(maps, "build_city_features",
                            lambda city: self._feats_with({"aqi": None}))
        body = client.get("/api/neighborhoods?city=delhi-ncr").json()
        target = next(r for r in body["results"] if r["id"] == "clean-cheap")
        assert target["fitScoreDataStatus"] == "provisional"
        assert target["missingPillars"] == ["air_quality"]
        assert target["matchDisplay"].startswith("Provisional ")
        assert target["subscores"]["air_quality"] is None

    def test_uaqi_not_cpcb_scored_via_api(self, client, monkeypatch):
        from app import maps
        monkeypatch.setattr(maps, "build_city_features",
                            lambda city: self._feats_with({"aqi": 55, "airIndexCode": "uaqi"}))
        body = client.get("/api/neighborhoods?city=delhi-ncr").json()
        target = next(r for r in body["results"] if r["id"] == "clean-cheap")
        assert target["airHealthScore"] is None
        assert target["airIndexCode"] == "uaqi"
        assert target["fitScoreDataStatus"] == "provisional"

    def test_phase2_evidence_envelope_survives_api(self, client):
        body = client.get("/api/neighborhoods?city=delhi-ncr").json()
        target = body["results"][0]
        assert set(target["evidence"]) == {
            "affordability", "safety", "commute", "lifestyle", "air_quality",
        }
        assert target["evidence"]["affordability"]["status"] == "estimated"
        assert target["evidence"]["safety"]["status"] == "curated"


class TestExplainHandlesMissingSubscore:
    def test_explain_fallback_survives_none_subscore(self, monkeypatch):
        from app import gemini
        # Force the Gemini call to fail so the deterministic fallback runs.
        def boom(**kwargs):
            raise RuntimeError("vertex down")
        monkeypatch.setattr(gemini, "_generate", boom)
        subs = {"affordability": 80, "safety": 70, "commute": 60, "lifestyle": 50, "air_quality": None}
        out = gemini.explain("Testville", subs, 20000, "AQI unavailable")
        assert isinstance(out, str) and out  # no crash, returns a usable string


class TestSevereRiskExplanationNote:
    def test_note_names_the_trade_off_for_critical_air(self):
        from app.main import note_for
        note = note_for("delhi-ncr", {"aqi": 500, "aqi_category": "Severe",
                                      "criticalRisks": [{"severity": "critical"}]})
        assert "health concern" in note and "critical" in note

    def test_note_is_honest_when_air_unavailable(self):
        from app.main import note_for
        note = note_for("delhi-ncr", {"aqi": None})
        assert "unavailable" in note.lower()


class TestDetail:
    def test_detail_includes_ai_explanation_and_all_series(self, client):
        body = client.get("/api/neighborhood/clean-cheap?city=delhi-ncr").json()
        assert body["why"]
        series = body["aqiSeries"]
        assert series["history"] and series["forecast"]
        # our own BQML forecast ships with confidence bounds
        assert {"label", "aqi", "lo", "hi"} <= set(series["bqmlForecast"][0].keys())

    def test_unknown_locality_is_404(self, client):
        assert client.get("/api/neighborhood/nowhere?city=delhi-ncr").status_code == 404


class TestAsk:
    def test_cross_locality_question_uses_nl_to_sql(self, client):
        body = client.post("/api/ask", json={"question": "cleanest air?", "city": "delhi-ncr"}).json()
        assert body["sql"].lstrip().upper().startswith("SELECT")
        assert body["rows"] and "BigQuery (NL→SQL)" in body["sources"][0]
        assert body["mode"] == "city_analytics"
        assert [tool["id"] for tool in body["tools"]] == ["bigquery", "gemini"]
        assert len(body["followUps"]) == 3

    def test_verified_name_only_comparison_restores_bigquery_board(self, client):
        body = client.post("/api/ask", json={
            "question": "Compare Adyar and Velachery.", "city": "chennai",
        }).json()

        assert body["mode"] == "city_analytics"
        assert body["sql"].lstrip().upper().startswith("SELECT")
        assert body["rows"]
        assert [tool["id"] for tool in body["tools"]] == ["bigquery", "gemini"]

    def test_name_only_locality_question_resolves_verified_scope(self, client, monkeypatch):
        from app import main
        captured = {}
        monkeypatch.setattr(main, "rank", lambda *_args: [{
            "id": "kankarbagh", "name": "Kankarbagh", "aqi": 110,
            "aqi_category": "Moderate", "fitScore": 70,
        }])

        def answer(_question, context):
            captured["context"] = context
            return "Kankarbagh evidence."

        monkeypatch.setattr(main.gemini, "ask", answer)
        body = client.post("/api/ask", json={
            "question": "Tell me about Kankarbagh", "city": "patna",
        }).json()

        assert body["mode"] == "locality_evidence"
        assert body["scope"]["neighborhoodId"] == "kankarbagh"
        assert "Locality Kankarbagh" in captured["context"]
        assert body["actions"][0]["localityId"] == "kankarbagh"

    def test_single_locality_question_uses_grounded_context(self, client):
        body = client.post("/api/ask", json={
            "question": "is it safe?", "neighborhoodId": "middle", "city": "delhi-ncr"}).json()
        assert body["answer"] == "Grounded answer."
        assert "sql" not in body
        assert body["mode"] == "locality_evidence"
        assert body["scope"]["neighborhoodId"] == "middle"
        assert "bigquery" not in [tool["id"] for tool in body["tools"]]

    def test_ordinary_city_question_uses_evidence_without_bigquery(self, client, monkeypatch):
        from app import main
        called = False

        def unexpected_sql(*_args):
            nonlocal called
            called = True
            raise AssertionError("ordinary city guidance must not invoke NL-to-SQL")

        monkeypatch.setattr(main.gemini, "nl_to_sql", unexpected_sql)
        body = client.post("/api/ask", json={
            "question": "Is the air safe to go out today?", "city": "delhi-ncr",
        }).json()
        assert called is False
        assert body["mode"] == "city_evidence"
        assert "sql" not in body

    def test_general_question_uses_guidance_without_claiming_live_tools(self, client, monkeypatch):
        from app import main
        monkeypatch.setattr(main.gemini, "ask_general", lambda question, conversation="": "AQI guidance.")
        body = client.post("/api/ask", json={
            "question": "What does AQI 110 mean?", "city": "lucknow",
        }).json()
        assert body["answer"] == "AQI guidance."
        assert body["mode"] == "general_guidance"
        assert body["evidenceStatus"] == "not_applicable"
        assert [tool["id"] for tool in body["tools"]] == ["gemini"]
        assert "sql" not in body

    def test_general_calculation_never_receives_city_evidence(self, client, monkeypatch):
        from app import main
        monkeypatch.setattr(main.gemini, "ask_general", lambda question, conversation="": "4")
        body = client.post("/api/ask", json={
            "question": "2+2", "city": "kochi",
        }).json()
        assert body["answer"] == "4"
        assert body["mode"] == "general_guidance"
        assert body["evidenceStatus"] == "not_applicable"
        assert [tool["id"] for tool in body["tools"]] == ["gemini"]
        assert "sql" not in body

    def test_unknown_city_is_rejected_before_any_copilot_tool_runs(self, client, monkeypatch):
        from app import main

        def unexpected(*_args, **_kwargs):
            raise AssertionError("an invalid city must not reach Gemini")

        monkeypatch.setattr(main.gemini, "ask_general", unexpected)
        response = client.post("/api/ask", json={
            "question": "hello", "city": "not-a-catalog-city",
        })
        assert response.status_code == 404

    def test_bounded_history_supports_analytical_follow_ups(self, client):
        body = client.post("/api/ask", json={
            "question": "What about the second option?",
            "city": "delhi-ncr",
            "history": [
                {"role": "user", "content": "Compare the cheapest localities"},
                {"role": "assistant", "content": "Here are the leading options."},
            ],
        }).json()
        assert body["mode"] == "city_analytics"
        assert body["sql"].lstrip().upper().startswith("SELECT")

    def test_history_is_bounded_by_schema(self, client):
        turns = [{"role": "user", "content": f"Question {index}"} for index in range(7)]
        response = client.post("/api/ask", json={
            "question": "What about it?", "city": "delhi-ncr", "history": turns,
        })
        assert response.status_code == 422


class TestAgentStream:
    def test_adk_stream_preserves_sse_contract_when_enabled(self, client, monkeypatch):
        from app import main
        monkeypatch.setattr(main.settings, "use_adk_orchestration", True)
        monkeypatch.setattr(main.gemini, "parse_query", lambda query, budget: {
            "weights": {"air_quality": 60, "affordability": 40}, "budget": None,
        })
        monkeypatch.setattr(main, "rank", lambda city, weights, budget: [{
            "id": "clean-cheap", "name": "Clean & Cheap", "fitScore": 80,
            "airHealthBand": "Good", "subscores": {"air_quality": 90},
        }])
        try:
            with client.stream("GET", "/api/search/stream?q=clean+air&city=delhi-ncr") as resp:
                raw = "".join(chunk for chunk in resp.iter_text())
        finally:
            monkeypatch.setattr(main.settings, "use_adk_orchestration", False)
        first_event = raw.split("\n\n", 1)[0]
        assert "NestIQ Planner" in first_event
        assert '"status": "running"' in first_event
        assert "NestIQ Planner" in raw
        assert "Live Signals Agent" in raw
        assert "Analytics Agent" in raw
        assert "Civic Intelligence Agent" in raw
        assert "Validator Agent" in raw
        assert "event: final" in raw

    def test_adk_agents_report_real_work_not_stub_claims(self, client, monkeypatch):
        # The specialist agents must report what actually happened, not a canned
        # "completed" claim. Explainer names the real top result; analytics reports
        # a real count; civic states honestly when nothing matched.
        from app import main
        monkeypatch.setattr(main.settings, "use_adk_orchestration", True)
        monkeypatch.setattr(main.gemini, "parse_query", lambda query, budget: {
            "weights": {"air_quality": 60, "affordability": 40}, "budget": None})
        monkeypatch.setattr(main, "rank", lambda city, weights, budget: [{
            "id": "clean-cheap", "name": "Clean & Cheap", "fitScore": 82, "matchDisplay": "Good Match",
            "airHealthBand": "Good", "subscores": {"air_quality": 90}, "anomalies": [],
            "fitScoreDataStatus": "complete", "aqi": 40,
        }])
        with client.stream("GET", "/api/search/stream?q=clean+air&city=delhi-ncr") as resp:
            raw = "".join(chunk for chunk in resp.iter_text())
        assert "Analyzed 1 locality snapshots" in raw           # real analytics count
        assert "Clean & Cheap" in raw and "FitScore 82" in raw  # explainer names the real top
        assert "Live AQI/Places/commute fetched for 1 localities" in raw  # real live-signal report

    def test_adk_failure_falls_back_to_legacy_stream(self, client, monkeypatch):
        # If ADK orchestration errors, search must NOT break: it falls back to
        # the legacy narrated stream and still returns final results.
        from app import main, adk_orchestration
        monkeypatch.setattr(main.settings, "use_adk_orchestration", True)

        def boom(*a, **k):
            raise RuntimeError("adk exploded")
        monkeypatch.setattr(adk_orchestration, "run_adk_search", boom)
        with client.stream("GET", "/api/search/stream?q=clean+air&city=delhi-ncr") as resp:
            assert resp.status_code == 200
            raw = "".join(chunk for chunk in resp.iter_text())
        assert "Data Collector" in raw          # legacy path ran
        assert "event: final" in raw
        final = json.loads(raw.split("event: final")[1].split("data: ")[1].split("\n\n")[0])
        assert final["results"][0]["id"] == "clean-cheap"

    def test_sse_stream_emits_agents_then_final_results(self, client):
        with client.stream("GET", "/api/search/stream?q=clean+air&city=delhi-ncr") as resp:
            assert resp.status_code == 200
            raw = "".join(chunk for chunk in resp.iter_text())
        events = [b for b in raw.split("\n\n") if b.strip()]
        names = [line.split("event: ")[1].split("\n")[0] for line in events if "event: " in line]
        assert names.count("agent") >= 8          # planner, collector, 5 pillars, orchestrator
        assert names[-1] == "final"
        final = json.loads(events[-1].split("data: ")[1])
        assert final["results"][0]["id"] == "clean-cheap"

    def test_stream_reports_all_five_pillar_agents(self, client):
        with client.stream("GET", "/api/search/stream?q=x&city=delhi-ncr") as resp:
            raw = "".join(chunk for chunk in resp.iter_text())
        for agent in ("Air Quality Agent", "Affordability Agent", "Commute Agent",
                      "Lifestyle Agent", "Safety Agent", "Orchestrator"):
            assert agent in raw
