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

    def test_single_locality_question_uses_grounded_context(self, client):
        body = client.post("/api/ask", json={
            "question": "is it safe?", "neighborhoodId": "middle", "city": "delhi-ncr"}).json()
        assert body["answer"] == "Grounded answer."
        assert "sql" not in body


class TestAgentStream:
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
