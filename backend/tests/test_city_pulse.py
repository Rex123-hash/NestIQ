"""City-wide Pulse endpoint (Phase 6).

Reuses the SAME grounded pulse pipeline (gemini.locality_pulse + the shared
_pulse_cache / background refresh) as the per-locality pulse, scoped to the whole
city. It must never fabricate events and never affect any score.
"""
import time

from app import main


class TestCityPulse:
    def setup_method(self):
        main._pulse_cache.clear()
        main._pulse_refreshing.clear()

    def test_unknown_city_is_404(self, client):
        assert client.get("/api/city/nowhere-city/pulse").status_code == 404

    def test_cold_call_returns_pending_without_fabricating(self, client, monkeypatch):
        # Keep the background pipeline from making a real network call.
        monkeypatch.setattr(main.gemini, "locality_pulse",
                            lambda name, city: {"status": "no_evidence", "items": [], "citations": []})
        body = client.get("/api/city/delhi-ncr/pulse").json()
        assert body["status"] == "pending"
        assert body["items"] == []
        assert body["refreshStatus"] == "refreshing"

    def test_cached_city_pulse_is_served(self, client):
        # Prime the shared cache with a validated result (as the pipeline would).
        cached = {
            "status": "available",
            "items": [{
                "headline": "Metro line extension approved", "summary": "A civic update.",
                "affectedArea": "Delhi NCR", "category": "mobility", "severity": "moderate",
                "observedOn": "2026-07-18", "freshness": "1 day ago",
                "source": "Official Notice", "sourceUrl": "https://example.gov.in/notice",
            }],
            "citations": [{"title": "Official Notice", "uri": "https://example.gov.in/notice"}],
        }
        main._pulse_cache[("delhi-ncr", "__city__")] = (time.time(), cached)
        body = client.get("/api/city/delhi-ncr/pulse").json()
        assert body["status"] == "available"
        assert body["items"][0]["headline"] == "Metro line extension approved"
        assert body["items"][0]["sourceUrl"].startswith("http")

    def test_city_pulse_does_not_touch_fitscore(self, client):
        # The city pulse response never carries score fields.
        main._pulse_cache[("delhi-ncr", "__city__")] = (time.time(), {"status": "no_evidence", "items": [], "citations": []})
        body = client.get("/api/city/delhi-ncr/pulse").json()
        assert "fitScore" not in body and "results" not in body
