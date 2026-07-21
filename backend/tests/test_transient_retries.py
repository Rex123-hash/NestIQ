import requests
import pytest

from app import maps


class FakeResponse:
    def __init__(self, status_code):
        self.status_code = status_code


def test_maps_request_retries_one_transient_response(monkeypatch):
    monkeypatch.setattr(maps.time, "sleep", lambda _seconds: None)
    responses = iter([FakeResponse(503), FakeResponse(200)])
    call_count = 0

    def call():
        nonlocal call_count
        call_count += 1
        return next(responses)

    response = maps._request_with_retry(call)

    assert response.status_code == 200
    assert call_count == 2


def test_maps_request_does_not_retry_permanent_error(monkeypatch):
    monkeypatch.setattr(maps.time, "sleep", lambda _seconds: None)
    call_count = 0

    def call():
        nonlocal call_count
        call_count += 1
        return FakeResponse(400)

    response = maps._request_with_retry(call)

    assert response.status_code == 400
    assert call_count == 1


def test_maps_request_retries_one_transport_error(monkeypatch):
    monkeypatch.setattr(maps.time, "sleep", lambda _seconds: None)
    call_count = 0

    def call():
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise requests.ConnectionError("temporary network failure")
        return FakeResponse(200)

    response = maps._request_with_retry(call)

    assert response.status_code == 200
    assert call_count == 2


def test_maps_request_stops_after_second_transport_error(monkeypatch):
    monkeypatch.setattr(maps.time, "sleep", lambda _seconds: None)
    call_count = 0

    def call():
        nonlocal call_count
        call_count += 1
        raise requests.ConnectionError("network unavailable")

    with pytest.raises(requests.ConnectionError):
        maps._request_with_retry(call)

    assert call_count == 2
