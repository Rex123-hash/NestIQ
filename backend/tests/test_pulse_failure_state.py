"""Pulse must reach an honest failure state instead of loading forever.

Bug this pins: the background refresh only cached SUCCESSFUL results
("available"/"no_evidence"). When grounding failed — a 403 locally, or any transient
grounding failure in production — nothing was cached, so the endpoint kept answering
"pending" on every subsequent request and the UI showed an infinite grey skeleton.

An endless "loading" that will never resolve is dishonest UI: it implies data is on the
way when it is not. After a failed attempt the user must be told the source is
temporarily unavailable, and a retry must still be possible once the short TTL expires.

Mirrors the existing rent-verification pattern (_rent_failure_cache / _RENT_FAILURE_TTL).
"""
import time

from app import main


def _drain_background():
    """Background refresh runs in a daemon thread; give it a moment to finish."""
    for _ in range(50):
        with main._pulse_refresh_lock:
            busy = bool(main._pulse_refreshing)
        if not busy:
            return
        time.sleep(0.02)


class TestLocalityPulseFailure:
    def setup_method(self):
        main._pulse_cache.clear()
        main._pulse_refreshing.clear()
        main._pulse_failure_cache.clear()

    def test_grounding_exception_yields_unavailable_not_endless_pending(self, client, monkeypatch):
        def boom(name, city):
            raise RuntimeError("403 PERMISSION_DENIED")

        monkeypatch.setattr(main.gemini, "locality_pulse", boom)

        first = client.get("/api/neighborhood/clean-cheap/pulse?city=delhi-ncr").json()
        assert first["status"] == "pending"  # first call legitimately kicks off a refresh
        _drain_background()

        second = client.get("/api/neighborhood/clean-cheap/pulse?city=delhi-ncr").json()
        assert second["status"] == "temporarily_unavailable", \
            "a failed refresh must not leave the UI loading forever"
        assert second["items"] == []
        assert second.get("limitation")

    def test_unavailable_result_is_also_recorded_as_failure(self, client, monkeypatch):
        monkeypatch.setattr(main.gemini, "locality_pulse", lambda name, city: {
            "status": "temporarily_unavailable", "items": [], "citations": []})

        client.get("/api/neighborhood/clean-cheap/pulse?city=delhi-ncr")
        _drain_background()

        body = client.get("/api/neighborhood/clean-cheap/pulse?city=delhi-ncr").json()
        assert body["status"] == "temporarily_unavailable"

    def test_success_after_the_window_clears_the_recorded_failure(self, client, monkeypatch):
        # A fresh failure deliberately short-circuits (that is the retry window, and it
        # exists so a failing source is not hammered). Once it expires, a successful
        # refresh must both serve real data and clear the failure entry.
        key = ("delhi-ncr", "clean-cheap")
        main._pulse_failure_cache[key] = (
            time.time() - main._PULSE_FAILURE_TTL - 1, {"status": "temporarily_unavailable"})
        monkeypatch.setattr(main.gemini, "locality_pulse", lambda name, city: {
            "status": "no_evidence", "items": [], "citations": []})

        client.get("/api/neighborhood/clean-cheap/pulse?city=delhi-ncr")
        _drain_background()

        body = client.get("/api/neighborhood/clean-cheap/pulse?city=delhi-ncr").json()
        assert body["status"] == "no_evidence"
        assert key not in main._pulse_failure_cache

    def test_fresh_failure_does_not_re_hammer_the_failing_source(self, client, monkeypatch):
        calls = {"n": 0}

        def boom(name, city):
            calls["n"] += 1
            raise RuntimeError("403 PERMISSION_DENIED")

        monkeypatch.setattr(main.gemini, "locality_pulse", boom)

        client.get("/api/neighborhood/clean-cheap/pulse?city=delhi-ncr")
        _drain_background()
        assert calls["n"] == 1

        # Repeat views within the window must be served from the failure record.
        for _ in range(3):
            body = client.get("/api/neighborhood/clean-cheap/pulse?city=delhi-ncr").json()
            assert body["status"] == "temporarily_unavailable"
        _drain_background()
        assert calls["n"] == 1, "must not retry a known-failing source on every page view"

    def test_retry_is_possible_after_the_failure_ttl(self, client, monkeypatch):
        key = ("delhi-ncr", "clean-cheap")
        # An old failure must not block a fresh attempt forever.
        main._pulse_failure_cache[key] = (
            time.time() - main._PULSE_FAILURE_TTL - 1, {"status": "temporarily_unavailable"})
        monkeypatch.setattr(main.gemini, "locality_pulse", lambda name, city: {
            "status": "no_evidence", "items": [], "citations": []})

        body = client.get("/api/neighborhood/clean-cheap/pulse?city=delhi-ncr").json()
        assert body["status"] == "pending", "an expired failure must allow a retry"

    def test_cached_success_still_wins_over_a_failure(self, client):
        key = ("delhi-ncr", "clean-cheap")
        main._pulse_cache[key] = (time.time(), {
            "status": "available", "items": [{"headline": "Real event"}], "citations": []})
        main._pulse_failure_cache[key] = (time.time(), {"status": "temporarily_unavailable"})
        body = client.get("/api/neighborhood/clean-cheap/pulse?city=delhi-ncr").json()
        assert body["status"] == "available"


class TestCityPulseFailure:
    def setup_method(self):
        main._pulse_cache.clear()
        main._pulse_refreshing.clear()
        main._pulse_failure_cache.clear()

    def test_city_pulse_also_reaches_an_honest_failure_state(self, client, monkeypatch):
        def boom(name, city):
            raise RuntimeError("403 PERMISSION_DENIED")

        monkeypatch.setattr(main.gemini, "locality_pulse", boom)

        client.get("/api/city/delhi-ncr/pulse")
        _drain_background()

        body = client.get("/api/city/delhi-ncr/pulse").json()
        assert body["status"] == "temporarily_unavailable"
        assert body["items"] == []
