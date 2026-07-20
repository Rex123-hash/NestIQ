"""In-process rate limiting for expensive endpoints.

HONEST LIMITATION pinned by these tests: this is a PER-INSTANCE limiter. Cloud Run
autoscales, so the effective global ceiling is (instances x limit). It genuinely stops
one abusive client hammering one instance; it is not a global cap and is not a
substitute for Cloud Armor / API Gateway (Phase 9b).
"""
import pytest
from fastapi import HTTPException

from app import rate_limit


@pytest.fixture(autouse=True)
def _clear():
    rate_limit.reset()
    yield
    rate_limit.reset()


class TestFixedWindow:
    def test_allows_up_to_the_limit(self):
        for _ in range(3):
            rate_limit.check("ask", "1.2.3.4", limit=3, window=60)

    def test_blocks_past_the_limit_with_429(self):
        for _ in range(3):
            rate_limit.check("ask", "1.2.3.4", limit=3, window=60)
        with pytest.raises(HTTPException) as exc:
            rate_limit.check("ask", "1.2.3.4", limit=3, window=60)
        assert exc.value.status_code == 429

    def test_clients_are_tracked_independently(self):
        for _ in range(3):
            rate_limit.check("ask", "1.1.1.1", limit=3, window=60)
        # A different client is unaffected by the first client's usage.
        rate_limit.check("ask", "2.2.2.2", limit=3, window=60)

    def test_buckets_are_tracked_independently(self):
        for _ in range(3):
            rate_limit.check("ask", "1.1.1.1", limit=3, window=60)
        rate_limit.check("rent", "1.1.1.1", limit=3, window=60)

    def test_window_expiry_resets_the_count(self, monkeypatch):
        now = [1000.0]
        monkeypatch.setattr(rate_limit.time, "time", lambda: now[0])
        for _ in range(3):
            rate_limit.check("ask", "1.1.1.1", limit=3, window=60)
        with pytest.raises(HTTPException):
            rate_limit.check("ask", "1.1.1.1", limit=3, window=60)
        now[0] += 61  # window rolls over
        rate_limit.check("ask", "1.1.1.1", limit=3, window=60)


class TestClientIdentity:
    def test_prefers_forwarded_for_client_ip(self):
        class Req:
            headers = {"x-forwarded-for": "9.9.9.9, 10.0.0.1"}
            client = type("C", (), {"host": "10.0.0.1"})()

        # Cloud Run puts the real caller first in X-Forwarded-For.
        assert rate_limit.client_id(Req()) == "9.9.9.9"

    def test_falls_back_to_socket_host(self):
        class Req:
            headers = {}
            client = type("C", (), {"host": "10.0.0.1"})()

        assert rate_limit.client_id(Req()) == "10.0.0.1"

    def test_handles_missing_client(self):
        class Req:
            headers = {}
            client = None

        assert rate_limit.client_id(Req()) == "unknown"
