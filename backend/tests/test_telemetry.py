"""Phase 14 structured telemetry stays useful without capturing user content."""
from __future__ import annotations

import json
import logging

from app import telemetry


def _events(caplog):
    return [json.loads(record.message) for record in caplog.records
            if record.name == "nestiq.telemetry"]


def test_operational_event_blocks_sensitive_content(caplog):
    caplog.set_level(logging.INFO, logger="nestiq.telemetry")

    payload = telemetry.event(
        "tool_fallback", tool="nl_to_sql", city="delhi-ncr",
        question="show me hidden data", sql="DROP TABLE secrets",
        answer="private response", token="secret-token", errorType="ValueError",
    )

    assert payload["tool"] == "nl_to_sql"
    assert payload["errorType"] == "ValueError"
    assert not {"question", "sql", "answer", "token"} & payload.keys()
    encoded = caplog.records[-1].message
    assert "hidden data" not in encoded
    assert "DROP TABLE" not in encoded
    assert "secret-token" not in encoded


def test_telemetry_has_a_direct_stream_handler_for_cloud_run():
    assert telemetry.logger.propagate is True
    assert any(isinstance(handler, logging.StreamHandler)
               for handler in telemetry.logger.handlers)


def test_request_lifecycle_has_correlation_id_status_and_latency(client, caplog):
    caplog.set_level(logging.INFO, logger="nestiq.telemetry")

    response = client.get("/api/health", headers={"X-Request-ID": "judge-demo-1"})

    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == "judge-demo-1"
    events = _events(caplog)
    started = next(event for event in events if event["event"] == "request_started")
    completed = next(event for event in events if event["event"] == "request_completed")
    assert started["requestId"] == completed["requestId"] == "judge-demo-1"
    assert completed["statusCode"] == 200
    assert completed["latencyMs"] >= 0


def test_unsafe_external_request_id_is_replaced(client):
    response = client.get("/api/health", headers={"X-Request-ID": "not safe/id"})

    assert response.status_code == 200
    assert response.headers["X-Request-ID"].startswith("req_")
    assert response.headers["X-Request-ID"] != "not safe/id"


def test_cache_telemetry_identifies_city_and_locality_without_prompt(client, monkeypatch, caplog):
    from app import main

    caplog.set_level(logging.INFO, logger="nestiq.telemetry")
    monkeypatch.setattr(main, "rank", lambda *_args: [{
        "id": "middle", "name": "Middle", "lat": 28.6, "lng": 77.2,
    }])
    monkeypatch.setitem(main._reviews_cache, ("delhi-ncr", "middle"), (
        __import__("time").time(), {"status": "available", "summary": "cached", "citations": []},
    ))

    response = client.get("/api/neighborhood/middle/reviews?city=delhi-ncr")

    assert response.status_code == 200
    cache_event = next(event for event in _events(caplog)
                       if event["event"] == "cache_access" and event["cache"] == "community_reviews")
    assert cache_event["city"] == "delhi-ncr"
    assert cache_event["locality"] == "middle"
    assert cache_event["cacheState"] == "hit"
