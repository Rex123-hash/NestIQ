"""Privacy-safe structured telemetry for NestIQ.

Only operational metadata is accepted. User prompts, answers, SQL text, source
document content, credentials, and exception messages are deliberately blocked.
Cloud Run collects the emitted single-line JSON through ordinary stdout logging.
"""
from __future__ import annotations

import json
import logging
import re
import time
import uuid
from contextvars import ContextVar, Token
from typing import Any


logger = logging.getLogger("nestiq.telemetry")
logger.setLevel(logging.INFO)
if not logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(_handler)
logger.propagate = True

_request_id: ContextVar[str | None] = ContextVar("nestiq_request_id", default=None)
_BLOCKED_FIELDS = {
    "answer", "authorization", "content", "credential", "document", "message",
    "prompt", "query", "question", "secret", "sql", "token",
}
_SAFE_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


def new_id(prefix: str = "req") -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def accepted_request_id(value: str | None) -> str:
    """Keep a safe caller correlation ID or replace it with a generated one."""
    return value if value and _SAFE_REQUEST_ID.fullmatch(value) else new_id()


def bind_request(request_id: str) -> Token:
    return _request_id.set(request_id)


def reset_request(token: Token) -> None:
    _request_id.reset(token)


def current_request_id() -> str | None:
    return _request_id.get()


def elapsed_ms(started: float) -> float:
    return round((time.perf_counter() - started) * 1000, 2)


def _safe(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        return value[:160]
    if isinstance(value, (list, tuple, set)):
        return [_safe(item) for item in list(value)[:20]]
    if isinstance(value, dict):
        return {
            str(key): _safe(item)
            for key, item in list(value.items())[:30]
            if str(key).lower() not in _BLOCKED_FIELDS
        }
    return type(value).__name__


def event(event_name: str, *, request_id: str | None = None, **fields: Any) -> dict[str, Any]:
    """Emit and return one JSON-safe operational event."""
    payload: dict[str, Any] = {
        "event": event_name,
        "requestId": request_id or current_request_id(),
        "timestamp": time.time(),
    }
    for key, value in fields.items():
        if key.lower() not in _BLOCKED_FIELDS:
            payload[key] = _safe(value)
    logger.info(json.dumps(payload, separators=(",", ":"), sort_keys=True))
    return payload
