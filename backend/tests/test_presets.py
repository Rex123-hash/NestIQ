"""Family Health & Resilience preset: deterministic weight override.

The preset must override ONLY the five pillar weights (not budget/other parsed
prefs), be gated by a server-side allowlist, and surface `presetApplied` so the
UI can honestly show the applied prioritization. Unknown presets are rejected.
"""
import json

from app import gemini

FAMILY_HEALTH = {"affordability": 12, "safety": 28, "commute": 20, "lifestyle": 5, "air_quality": 35}


class TestPresetSearch:
    def test_family_health_overrides_only_the_five_weights(self, client):
        body = client.post(
            "/api/search",
            json={"query": "clean air under 25000", "city": "delhi-ncr", "preset": "family_health"},
        ).json()
        prefs = body["preferences"]
        assert prefs["weights"] == FAMILY_HEALTH
        assert prefs["presetApplied"] == "family_health"
        # Budget still comes from parse_query (monkeypatched to 30000), not the preset.
        assert prefs["budget"] == 30000

    def test_absent_preset_is_unchanged_and_preset_applied_null(self, client):
        body = client.post(
            "/api/search",
            json={"query": "clean air under 30000", "city": "delhi-ncr"},
        ).json()
        prefs = body["preferences"]
        assert prefs["weights"] == dict(gemini.INDIA_DEFAULT)
        assert prefs["presetApplied"] is None

    def test_unknown_preset_returns_422(self, client):
        r = client.post(
            "/api/search",
            json={"query": "clean air", "city": "delhi-ncr", "preset": "totally_made_up"},
        )
        assert r.status_code == 422

    def test_client_cannot_inject_arbitrary_weights(self, client):
        # A weights payload is not part of the contract; it must be ignored, and
        # the parsed/default weights must stand.
        body = client.post(
            "/api/search",
            json={"query": "clean air", "city": "delhi-ncr",
                  "weights": {"air_quality": 100, "safety": 0}},
        ).json()
        assert body["preferences"]["weights"] == dict(gemini.INDIA_DEFAULT)


class TestPresetStream:
    def _final(self, client, url):
        with client.stream("GET", url) as r:
            assert r.status_code == 200
            event = None
            data = None
            for line in r.iter_lines():
                if line.startswith("event:"):
                    event = line.split(":", 1)[1].strip()
                elif line.startswith("data:") and event == "final":
                    data = json.loads(line.split(":", 1)[1].strip())
                    break
        return data

    def test_stream_applies_preset_in_final_preferences(self, client):
        data = self._final(
            client, "/api/search/stream?q=clean+air&city=delhi-ncr&preset=family_health")
        assert data is not None
        assert data["preferences"]["presetApplied"] == "family_health"
        assert data["preferences"]["weights"] == FAMILY_HEALTH

    def test_stream_without_preset_reports_null(self, client):
        data = self._final(client, "/api/search/stream?q=clean+air&city=delhi-ncr")
        assert data is not None
        assert data["preferences"]["presetApplied"] is None
