"""Pulse failures are terminal and remain distinct from no evidence."""
import time

from app import main


def _drain(store):
    for _ in range(100):
        if not any(d.get("status") == "pending" for d in store.documents.values()):
            return
        time.sleep(0.01)


def test_grounding_exception_yields_unavailable(client, monkeypatch, isolated_pulse_store):
    def boom(*_):
        raise RuntimeError("secret internal detail")
    monkeypatch.setattr(main.gemini, "locality_pulse", boom)
    assert client.get("/api/neighborhood/clean-cheap/pulse?city=delhi-ncr").json()["status"] == "pending"
    _drain(isolated_pulse_store)
    body = client.get("/api/neighborhood/clean-cheap/pulse?city=delhi-ncr").json()
    assert body["status"] == "temporarily_unavailable"
    assert "secret" not in str(body)


def test_no_evidence_is_not_service_failure(client, monkeypatch, isolated_pulse_store):
    monkeypatch.setattr(main.gemini, "locality_pulse", lambda *_: {
        "status": "no_evidence", "items": [], "citations": []})
    client.get("/api/neighborhood/clean-cheap/pulse?city=delhi-ncr")
    _drain(isolated_pulse_store)
    assert client.get("/api/neighborhood/clean-cheap/pulse?city=delhi-ncr").json()["status"] == "no_evidence"


def test_transient_grounding_failure_retries_within_same_job(client, monkeypatch,
                                                              isolated_pulse_store):
    calls = {"n": 0}

    def recovering(*_):
        calls["n"] += 1
        if calls["n"] < 3:
            return {"status": "temporarily_unavailable", "items": [], "citations": [],
                    "errorCode": "grounding_unavailable"}
        return {"status": "no_evidence", "items": [], "citations": []}

    monkeypatch.setattr(main.gemini, "locality_pulse", recovering)
    client.get("/api/neighborhood/clean-cheap/pulse?city=delhi-ncr")
    _drain(isolated_pulse_store)
    body = client.get("/api/neighborhood/clean-cheap/pulse?city=delhi-ncr").json()
    assert body["status"] == "no_evidence"
    assert calls["n"] == 3


def test_missing_citations_retries_without_accepting_uncited_data(client, monkeypatch,
                                                                  isolated_pulse_store):
    calls = {"n": 0}

    def recovering(*_):
        calls["n"] += 1
        if calls["n"] == 1:
            return {"status": "temporarily_unavailable", "items": [], "citations": [],
                    "errorCode": "missing_citations"}
        return {"status": "no_evidence", "items": [], "citations": []}

    monkeypatch.setattr(main.gemini, "locality_pulse", recovering)
    client.get("/api/neighborhood/clean-cheap/pulse?city=delhi-ncr")
    _drain(isolated_pulse_store)
    body = client.get("/api/neighborhood/clean-cheap/pulse?city=delhi-ncr").json()
    assert body["status"] == "no_evidence"
    assert calls["n"] == 2


def test_unusable_grounding_is_not_blindly_retried(client, monkeypatch,
                                                    isolated_pulse_store):
    calls = {"n": 0}

    def unusable(*_):
        calls["n"] += 1
        return {"status": "temporarily_unavailable", "items": [], "citations": [],
                "errorCode": "unusable_grounding"}

    monkeypatch.setattr(main.gemini, "locality_pulse", unusable)
    client.get("/api/neighborhood/clean-cheap/pulse?city=delhi-ncr")
    _drain(isolated_pulse_store)
    assert client.get("/api/neighborhood/clean-cheap/pulse?city=delhi-ncr").json()["status"] == "temporarily_unavailable"
    assert calls["n"] == 1


def test_fresh_failure_deduplicates_retries(client, monkeypatch, isolated_pulse_store):
    calls = 0
    def boom(*_):
        nonlocal calls
        calls += 1
        raise RuntimeError("down")
    monkeypatch.setattr(main.gemini, "locality_pulse", boom)
    client.get("/api/city/delhi-ncr/pulse")
    _drain(isolated_pulse_store)
    for _ in range(3):
        assert client.get("/api/city/delhi-ncr/pulse").json()["status"] == "temporarily_unavailable"
    assert calls == 1


def test_firestore_error_fails_safely(client, monkeypatch):
    class BrokenStore:
        def claim(self, *args, **kwargs):
            raise RuntimeError("credential internals")
    monkeypatch.setattr(main, "_pulse_store", BrokenStore())
    body = client.get("/api/city/delhi-ncr/pulse").json()
    assert body["status"] == "temporarily_unavailable"
    assert "credential" not in str(body)


def test_stale_evidence_stays_visible_during_refresh(client, monkeypatch, isolated_pulse_store):
    claim = isolated_pulse_store.claim("delhi-ncr", "__city__")
    isolated_pulse_store.complete("delhi-ncr", "__city__", claim.job_id, {
        "status": "available", "items": [{"headline": "kept"}], "citations": []}, "passed")
    key = next(iter(isolated_pulse_store.documents))
    isolated_pulse_store.documents[key]["expiresAt"] = isolated_pulse_store.clock()
    gate = __import__("threading").Event()
    monkeypatch.setattr(main.gemini, "locality_pulse", lambda *_: (gate.wait(), {
        "status": "temporarily_unavailable", "items": [], "citations": []})[1])
    body = client.get("/api/city/delhi-ncr/pulse").json()
    assert body["status"] == "available" and body["items"][0]["headline"] == "kept"
    assert body["cacheStatus"] == "stale" and body["refreshStatus"] == "refreshing"
    gate.set()
