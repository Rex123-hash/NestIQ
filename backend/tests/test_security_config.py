"""CORS allowlist and Maps key separation.

Two long-standing holes this pins shut:
  * CORS was allow_origins=["*"] — any site could call the API.
  * /api/config returned settings.maps_api_key — the SAME key the server uses for
    Air Quality, Places and Distance Matrix — to any browser, from any origin.

Honest limitation (documented, not solved here): serving a separate browser key only
stops server-key LEAKAGE. It is not protection until that browser key is HTTP-referrer
restricted in the GCP console, which is Phase 9b infrastructure work.
"""
import pytest
from pydantic import ValidationError

from app import main
from app.config import settings
from app.gemini import Criteria


def test_model_generated_preference_weights_are_bounded():
    with pytest.raises(ValidationError):
        Criteria(w_affordability=-1)
    with pytest.raises(ValidationError):
        Criteria(w_air_quality=101)


class TestCorsAllowlist:
    def test_unset_fails_closed_to_localhost_only(self, monkeypatch):
        monkeypatch.setattr(settings, "allowed_origins", "")
        origins = main.cors_origins()
        assert "*" not in origins
        assert origins, "must fall back to a concrete dev allowlist, never empty"
        # Loopback only: no public origin may be reachable without explicit config.
        assert all(("localhost" in o) or ("127.0.0.1" in o) for o in origins)

    def test_configured_origins_are_used(self, monkeypatch):
        monkeypatch.setattr(
            settings, "allowed_origins",
            "https://nestiq-india.web.app,https://example.com")
        origins = main.cors_origins()
        assert origins == ["https://nestiq-india.web.app", "https://example.com"]

    def test_whitespace_and_blanks_are_ignored(self, monkeypatch):
        monkeypatch.setattr(settings, "allowed_origins", " https://a.com , , https://b.com ")
        assert main.cors_origins() == ["https://a.com", "https://b.com"]

    def test_wildcard_is_never_produced_from_config(self, monkeypatch):
        # A stray "*" in config must not silently reopen the hole.
        monkeypatch.setattr(settings, "allowed_origins", "*")
        assert "*" not in main.cors_origins()


class TestMapsKeySeparation:
    def test_config_never_returns_the_server_key(self, client, monkeypatch):
        monkeypatch.setattr(settings, "maps_api_key", "SERVER-ONLY-SECRET")
        monkeypatch.setattr(settings, "maps_browser_key", "BROWSER-KEY")
        body = client.get("/api/config").json()
        assert "SERVER-ONLY-SECRET" not in str(body)
        assert body["mapsKey"] == "BROWSER-KEY"

    def test_missing_browser_key_does_not_fall_back_to_server_key(self, client, monkeypatch):
        # Falling back would re-open exactly the hole this closes.
        monkeypatch.setattr(settings, "maps_api_key", "SERVER-ONLY-SECRET")
        monkeypatch.setattr(settings, "maps_browser_key", "")
        body = client.get("/api/config").json()
        assert "SERVER-ONLY-SECRET" not in str(body)
        assert body["mapsKey"] == ""
