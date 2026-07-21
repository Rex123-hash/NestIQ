"""Gemini calls must not hang indefinitely.

Every outbound requests() call in maps.py already passes timeout=15, but the Vertex
client was constructed with no timeout at all. A hung generate_content would hold a
Cloud Run request open until the platform killed it, tying up an instance slot.

google-genai 2.10.0 exposes HttpOptions.timeout in MILLISECONDS (verified against the
installed SDK, not assumed).
"""
from app import gemini
from app.config import settings


def test_client_is_constructed_with_a_timeout(monkeypatch):
    captured = {}

    class FakeClient:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    import google.genai as genai_mod
    monkeypatch.setattr(genai_mod, "Client", FakeClient)
    monkeypatch.setattr(gemini, "_client", None)

    gemini._get_client()

    http_options = captured.get("http_options")
    assert http_options is not None, "Vertex client must be given http_options"
    # SDK expects milliseconds.
    assert http_options.timeout == settings.gemini_timeout_ms
    assert http_options.timeout > 0
    retry = http_options.retry_options
    assert retry.attempts == 2
    assert retry.initial_delay == 1.0
    assert retry.max_delay == 4.0
    assert retry.http_status_codes == [408, 429, 500, 502, 503, 504]


def test_timeout_default_is_bounded():
    # A default that is effectively infinite would defeat the purpose.
    assert 0 < settings.gemini_timeout_ms <= 120_000
