"""Optional Secret Manager backing for sensitive settings.

Default OFF. With USE_SECRET_MANAGER=false the app reads secrets from env exactly as it
does today, so this code is inert until the secrets and IAM binding actually exist in
GCP. Until that setup is done and verified, NestIQ must not claim "secrets are stored in
Secret Manager" — the flag being present is not the same as it being in use.

Fail-safe rule pinned below: a failed or missing fetch must never blank out a working
env-provided key. Degrading to no credentials would take the whole app down, which is a
worse outcome than continuing on the env value.
"""
import pytest

from app import secrets as secrets_mod
from app.config import Settings


def _settings(**over):
    base = dict(gcp_project="proj", maps_api_key="ENV-SERVER", maps_browser_key="ENV-BROWSER")
    base.update(over)
    return Settings(**base)


class TestDisabledByDefault:
    def test_flag_defaults_off(self):
        assert _settings().use_secret_manager is False

    def test_disabled_leaves_env_values_untouched(self, monkeypatch):
        called = {"n": 0}
        monkeypatch.setattr(secrets_mod, "fetch_secret",
                            lambda *a, **k: called.__setitem__("n", called["n"] + 1))
        s = _settings(use_secret_manager=False)
        secrets_mod.resolve(s)
        assert s.maps_api_key == "ENV-SERVER"
        assert s.maps_browser_key == "ENV-BROWSER"
        assert called["n"] == 0, "must not call Secret Manager when disabled"


class TestEnabled:
    def test_enabled_overrides_from_secret_manager(self, monkeypatch):
        mapping = {"nestiq-maps-server-key": "SM-SERVER", "nestiq-maps-browser-key": "SM-BROWSER"}
        monkeypatch.setattr(secrets_mod, "fetch_secret",
                            lambda project, secret_id, version="latest": mapping.get(secret_id))
        s = _settings(use_secret_manager=True)
        secrets_mod.resolve(s)
        assert s.maps_api_key == "SM-SERVER"
        assert s.maps_browser_key == "SM-BROWSER"

    def test_missing_secret_keeps_env_value(self, monkeypatch):
        monkeypatch.setattr(secrets_mod, "fetch_secret", lambda *a, **k: None)
        s = _settings(use_secret_manager=True)
        secrets_mod.resolve(s)
        assert s.maps_api_key == "ENV-SERVER", "a missing secret must not blank a working key"
        assert s.maps_browser_key == "ENV-BROWSER"

    def test_fetch_error_keeps_env_value(self, monkeypatch):
        def boom(*a, **k):
            raise RuntimeError("permission denied")

        monkeypatch.setattr(secrets_mod, "fetch_secret", boom)
        s = _settings(use_secret_manager=True)
        secrets_mod.resolve(s)  # must not raise
        assert s.maps_api_key == "ENV-SERVER"

    def test_blank_secret_is_ignored(self, monkeypatch):
        monkeypatch.setattr(secrets_mod, "fetch_secret", lambda *a, **k: "   ")
        s = _settings(use_secret_manager=True)
        secrets_mod.resolve(s)
        assert s.maps_api_key == "ENV-SERVER"


class TestNeverLeaksSecrets:
    def test_resolution_does_not_print_secret_values(self, monkeypatch, capsys):
        monkeypatch.setattr(secrets_mod, "fetch_secret",
                            lambda *a, **k: "SUPER-SECRET-VALUE")
        s = _settings(use_secret_manager=True)
        secrets_mod.resolve(s)
        out = capsys.readouterr()
        assert "SUPER-SECRET-VALUE" not in (out.out + out.err)

    def test_failure_log_does_not_print_secret_id_value(self, monkeypatch, capsys):
        def boom(*a, **k):
            raise RuntimeError("SUPER-SECRET-VALUE leaked in error")

        monkeypatch.setattr(secrets_mod, "fetch_secret", boom)
        s = _settings(use_secret_manager=True)
        secrets_mod.resolve(s)
        out = capsys.readouterr()
        # Only the exception TYPE may be logged, never its message/payload.
        assert "SUPER-SECRET-VALUE" not in (out.out + out.err)
