"""log_snapshot_safe must never delay the request path — it's fire-and-forget."""
import threading
import time

from app import bq_india


def test_snapshot_logging_is_off_the_request_path(monkeypatch):
    logged = threading.Event()

    def slow_log(city, ranked):
        time.sleep(0.5)
        logged.set()

    monkeypatch.setattr(bq_india, "ensure_ready", lambda: None)
    monkeypatch.setattr(bq_india, "log_localities", slow_log)

    start = time.time()
    bq_india.log_snapshot_safe("delhi-ncr", [{"id": "x"}])
    elapsed = time.time() - start

    assert elapsed < 0.2, f"log_snapshot_safe blocked the caller for {elapsed:.2f}s"
    assert logged.wait(3), "background log never ran"
