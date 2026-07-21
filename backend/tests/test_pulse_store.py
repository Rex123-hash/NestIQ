from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor

from app.pulse_store import InMemoryPulseStore, document_id


class Clock:
    def __init__(self):
        self.now = datetime(2026, 7, 21, tzinfo=timezone.utc)
    def __call__(self):
        return self.now
    def advance(self, seconds):
        self.now += timedelta(seconds=seconds)


def store(clock=None):
    return InMemoryPulseStore(ttl_seconds=100, lease_seconds=10,
                              failure_ttl_seconds=5, clock=clock or Clock())


def test_two_simultaneous_instances_claim_one_job():
    shared = store()
    with ThreadPoolExecutor(max_workers=2) as pool:
        claims = list(pool.map(lambda _: shared.claim("delhi-ncr", "__city__"), range(2)))
    assert sum(c.launch for c in claims) == 1
    assert claims[0].document["jobId"] == claims[1].document["jobId"]


def test_completed_evidence_is_observed_by_another_instance():
    shared = store()
    claim = shared.claim("delhi-ncr", "__city__")
    result = {"status": "available", "items": [{"headline": "x"}], "citations": []}
    assert shared.complete("delhi-ncr", "__city__", claim.job_id, result, "passed")
    observed = shared.claim("delhi-ncr", "__city__")
    assert observed.document["payload"] == result
    assert not observed.launch and observed.document["items"] == result["items"]


def test_stale_success_is_preserved_while_exactly_one_refresh_starts():
    clock = Clock(); shared = store(clock)
    first = shared.claim("x", "__city__")
    shared.complete("x", "__city__", first.job_id,
                    {"status": "available", "items": [{"headline": "good"}], "citations": []}, "passed")
    clock.advance(101)
    a = shared.claim("x", "__city__"); b = shared.claim("x", "__city__")
    assert a.launch and not b.launch
    assert b.document["items"] == [{"headline": "good"}]


def test_forced_refresh_of_fresh_success_is_still_single_flight():
    shared = store()
    first = shared.claim("x", "__city__")
    shared.complete("x", "__city__", first.job_id,
                    {"status": "available", "items": [{"headline": "good"}], "citations": []},
                    "passed")
    forced = shared.claim("x", "__city__", force=True)
    duplicate = shared.claim("x", "__city__", force=True)
    assert forced.launch and not duplicate.launch
    assert forced.document["jobId"] == duplicate.document["jobId"]
    assert duplicate.document["items"] == [{"headline": "good"}]


def test_refresh_failure_preserves_stale_success():
    clock = Clock(); shared = store(clock)
    first = shared.claim("x", "n")
    shared.complete("x", "n", first.job_id,
                    {"status": "available", "items": [{"headline": "good"}], "citations": []}, "passed")
    clock.advance(101)
    refresh = shared.claim("x", "n")
    assert shared.fail("x", "n", refresh.job_id, "service_error", "failed")
    observed = shared.claim("x", "n")
    assert not observed.launch
    assert observed.document["items"] == [{"headline": "good"}]


def test_expired_lease_reclaimed_and_old_worker_discarded():
    clock = Clock(); shared = store(clock)
    old = shared.claim("x", "n")
    clock.advance(11)
    new = shared.claim("x", "n")
    assert new.launch and new.reclaimed and new.job_id != old.job_id
    assert not shared.complete("x", "n", old.job_id,
                               {"status": "available", "items": [{"headline": "late"}]}, "passed")


def test_deadline_failure_is_terminal_and_late_completion_cannot_win():
    clock = Clock(); shared = store(clock)
    claim = shared.claim("x", "n")
    clock.advance(10)
    assert shared.fail("x", "n", claim.job_id, "timeout", "deadline_exceeded")
    assert not shared.complete("x", "n", claim.job_id,
                               {"status": "available", "items": [{"headline": "late"}]}, "passed")
    assert shared.claim("x", "n").document["status"] == "temporarily_unavailable"


def test_city_and_locality_keys_cannot_collide():
    assert document_id("x", "__city__") != document_id("x", "city")
    assert "/" not in document_id("../../x", "../../y")
