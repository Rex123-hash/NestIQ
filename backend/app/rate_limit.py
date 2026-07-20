"""In-process fixed-window rate limiting for expensive endpoints.

HONEST LIMITATION — do not describe this as global rate limiting or as full cost
protection: Cloud Run autoscales, so this counter lives in ONE instance's memory. With
N instances the effective ceiling is (N x limit). It genuinely stops a single client
hammering a single instance, and nothing more. A real global cap needs a shared store or
edge enforcement (Cloud Armor / API Gateway), which is Phase 9b infrastructure work.

Cost is bounded independently and more reliably by the caches, by BigQuery's
maximum_bytes_billed (see bq_india.MAX_QUERY_BYTES), and by the dry-run check.
"""
from __future__ import annotations

import threading
import time

from fastapi import HTTPException

# (bucket, client) -> (window_start, count)
_hits: dict[tuple[str, str], tuple[float, int]] = {}
_lock = threading.Lock()


def reset() -> None:
    """Clear all counters (tests, and any future warm-restart hook)."""
    with _lock:
        _hits.clear()


def client_id(request) -> str:
    """Best-effort caller identity. Cloud Run terminates TLS at the edge, so the real
    caller is the first entry of X-Forwarded-For; the socket peer is the proxy."""
    forwarded = ""
    try:
        forwarded = request.headers.get("x-forwarded-for", "") or ""
    except Exception:  # noqa: BLE001 - header access must never break a request
        forwarded = ""
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    client = getattr(request, "client", None)
    return getattr(client, "host", None) or "unknown"


def check(bucket: str, client: str, limit: int, window: int) -> None:
    """Count one hit for (bucket, client); raise 429 once the window limit is passed."""
    now = time.time()
    key = (bucket, client)
    with _lock:
        started, count = _hits.get(key, (now, 0))
        if now - started >= window:
            started, count = now, 0  # window rolled over
        count += 1
        _hits[key] = (started, count)
        over = count > limit
        retry_after = max(1, int(window - (now - started)))
    if over:
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please wait a moment and try again.",
            headers={"Retry-After": str(retry_after)},
        )
