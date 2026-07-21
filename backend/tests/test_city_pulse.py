"""Backward-compatible City Pulse API behavior over shared state."""
import time

from app import main


def _drain(store):
    for _ in range(100):
        if not any(d.get("status") == "pending" for d in store.documents.values()):
            return
        time.sleep(0.01)


class TestCityPulse:
    def test_unknown_city_is_404(self, client):
        assert client.get("/api/city/nowhere-city/pulse").status_code == 404

    def test_cold_call_returns_pending_without_fabricating(self, client, monkeypatch):
        gate = __import__("threading").Event()
        monkeypatch.setattr(main.gemini, "locality_pulse", lambda *_: (gate.wait(), {
            "status": "no_evidence", "items": [], "citations": []})[1])
        body = client.get("/api/city/delhi-ncr/pulse").json()
        assert body == {"status": "pending", "items": [], "citations": [],
                        "refreshStatus": "refreshing",
                        "limitation": "Verified civic sources are being checked in the background."}
        gate.set()

    def test_completed_city_pulse_is_shared_and_compatible(self, client, monkeypatch,
                                                            isolated_pulse_store):
        cached = {"status": "available", "items": [{
            "headline": "Metro extension approved", "sourceUrl": "https://example.gov.in/notice",
        }], "citations": [{"title": "Notice", "uri": "https://example.gov.in/notice"}]}
        monkeypatch.setattr(main.gemini, "locality_pulse", lambda *_: cached)
        client.get("/api/city/delhi-ncr/pulse")
        _drain(isolated_pulse_store)
        body = client.get("/api/city/delhi-ncr/pulse").json()
        assert body["status"] == "available"
        assert body["items"][0]["headline"] == "Metro extension approved"
        assert "fitScore" not in body and "results" not in body
