"""Community-insight failures remain distinguishable from genuine no-evidence results."""
from datetime import date
from threading import Event
from types import SimpleNamespace

from app import gemini, main


def test_web_reviews_reports_permission_failure(monkeypatch):
    def denied(**kwargs):
        raise RuntimeError("403 PERMISSION_DENIED: aiplatform.endpoints.predict")

    monkeypatch.setattr(gemini, "_generate", denied)
    result = gemini.web_reviews("Sector 62, Noida", "Delhi NCR")

    assert result == {
        "summary": "",
        "citations": [],
        "status": "temporarily_unavailable",
        "errorCode": "vertex_permission_denied",
    }


def test_web_reviews_marks_empty_success_as_no_evidence(monkeypatch):
    class Grounding:
        grounding_chunks = []

    class Candidate:
        grounding_metadata = Grounding()

    class Response:
        text = ""
        candidates = [Candidate()]

    monkeypatch.setattr(gemini, "_generate", lambda **kwargs: Response())
    result = gemini.web_reviews("Quiet Locality", "Delhi NCR")

    assert result["status"] == "no_evidence"
    assert result["summary"] == ""


def test_pulse_keeps_only_recent_items_with_matching_grounded_source():
    raw = {"items": [
        {"headline": "Road repair advisory", "summary": "Repairs may affect evening travel.",
         "category": "mobility", "severity": "moderate", "affectedArea": "Sector 62",
         "observedOn": "2026-07-18", "sourceTitle": "Noida Authority"},
        {"headline": "Unsupported claim", "summary": "This has no matching citation.",
         "category": "civic", "severity": "low", "affectedArea": "Sector 62",
         "observedOn": "2026-07-18", "sourceTitle": "Unknown source"},
    ]}
    citations = [{"title": "Noida Authority", "uri": "https://example.gov.in/notice"}]

    items = gemini.analyze_pulse_items(raw, citations, today=date(2026, 7, 19))

    assert len(items) == 1
    assert items[0]["freshness"] == "1 day ago"
    assert items[0]["sourceUrl"] == "https://example.gov.in/notice"


def test_pulse_rejects_stale_or_invalid_evidence():
    raw = {"items": [{"headline": "Old notice", "summary": "No longer current.",
                       "category": "rumour", "severity": "urgent", "affectedArea": "Noida",
                       "observedOn": "2025-01-01", "sourceTitle": "Official source"}]}
    citations = [{"title": "Official source", "uri": "https://example.gov.in/old"}]

    assert gemini.analyze_pulse_items(raw, citations, today=date(2026, 7, 19)) == []


def test_pulse_uses_one_grounded_call_when_ledger_is_machine_readable(monkeypatch):
    chunks = [SimpleNamespace(web=SimpleNamespace(
        uri="https://authority.example/notice", title="Noida Authority",
    ))]
    response = SimpleNamespace(
        text=("2026-07-18 | mobility | moderate | Sector 62 | Road repair advisory | "
              "Repairs may affect evening travel. | Noida Authority"),
        candidates=[SimpleNamespace(grounding_metadata=SimpleNamespace(grounding_chunks=chunks))],
    )
    calls = {"n": 0}

    def generate(**kwargs):
        calls["n"] += 1
        return response

    monkeypatch.setattr(gemini, "_generate", generate)
    result = gemini.locality_pulse("Sector 62, Noida", "Delhi NCR")

    assert result["status"] == "available"
    assert len(result["items"]) == 1
    assert calls["n"] == 1


def test_pulse_does_not_chain_a_second_model_call_for_malformed_ledger(monkeypatch):
    chunks = [SimpleNamespace(web=SimpleNamespace(
        uri="https://authority.example/notice", title="Noida Authority",
    ))]
    response = SimpleNamespace(
        text="A current notice exists, but this is not a valid evidence ledger.",
        candidates=[SimpleNamespace(grounding_metadata=SimpleNamespace(grounding_chunks=chunks))],
    )
    calls = {"n": 0}

    def generate(**kwargs):
        calls["n"] += 1
        return response

    monkeypatch.setattr(gemini, "_generate", generate)
    result = gemini.locality_pulse("Sector 62, Noida", "Delhi NCR")
    assert result["status"] == "temporarily_unavailable"
    assert result["errorCode"] == "unusable_grounding"
    assert calls["n"] == 1


def test_pulse_accepts_only_explicit_completed_search_as_no_evidence(monkeypatch):
    response = SimpleNamespace(
        text="NO_VERIFIED_UPDATES",
        candidates=[SimpleNamespace(grounding_metadata=SimpleNamespace(grounding_chunks=[]))],
    )
    monkeypatch.setattr(gemini, "_generate", lambda **_kwargs: response)

    result = gemini.locality_pulse("Vyttila", "Kochi")

    assert result == {"status": "no_evidence", "items": [], "citations": []}


def test_pulse_does_not_mislabel_missing_citations_as_no_evidence(monkeypatch):
    response = SimpleNamespace(
        text="No reliable recent evidence exists.",
        candidates=[SimpleNamespace(grounding_metadata=SimpleNamespace(grounding_chunks=[]))],
    )
    monkeypatch.setattr(gemini, "_generate", lambda **_kwargs: response)

    result = gemini.locality_pulse("Vyttila", "Kochi")

    assert result["status"] == "temporarily_unavailable"
    assert result["errorCode"] == "unusable_grounding"

def test_pulse_endpoint_returns_pending_without_duplicate_jobs(client, monkeypatch,
                                                               isolated_pulse_store):
    started, release = Event(), Event()
    calls = {"n": 0}

    def slow_pulse(name, city):
        calls["n"] += 1
        started.set()
        release.wait(2)
        return {"status": "no_evidence", "items": [], "citations": []}

    monkeypatch.setattr(gemini, "locality_pulse", slow_pulse)
    first = client.get("/api/neighborhood/clean-cheap/pulse?city=delhi-ncr")
    second = client.get("/api/neighborhood/clean-cheap/pulse?city=delhi-ncr")

    assert first.json()["status"] == second.json()["status"] == "pending"
    assert started.wait(1)
    assert calls["n"] == 1
    release.set()
    for _ in range(100):
        if not any(d.get("status") == "pending" for d in isolated_pulse_store.documents.values()):
            break
        Event().wait(0.01)
    assert client.get("/api/neighborhood/clean-cheap/pulse?city=delhi-ncr").json()["status"] == "no_evidence"
