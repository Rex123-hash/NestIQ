"""Durable, cross-instance coordination for grounded Pulse jobs.

Production uses one Firestore document per server-derived Pulse scope.  The
in-memory implementation exists only as a test adapter; production never falls
back to it when Firestore is unavailable.
"""
from __future__ import annotations

import hashlib
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Protocol


SCHEMA_VERSION = 1
COLLECTION = "pulse_jobs"
RETENTION = timedelta(days=30)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def document_id(city: str, locality: str) -> str:
    """Return a fixed-size ID; callers can never select a Firestore path."""
    material = f"pulse:v{SCHEMA_VERSION}:{city}:{locality}".encode("utf-8")
    return hashlib.sha256(material).hexdigest()


@dataclass(frozen=True)
class Claim:
    document: dict[str, Any]
    job_id: str | None = None
    launch: bool = False
    reclaimed: bool = False


class PulseStore(Protocol):
    def claim(self, city: str, locality: str, *, force: bool = False) -> Claim: ...
    def complete(self, city: str, locality: str, job_id: str, result: dict[str, Any],
                 validator_result: str) -> bool: ...
    def fail(self, city: str, locality: str, job_id: str, category: str,
             validator_result: str) -> bool: ...


class _StateMachine:
    def __init__(self, *, ttl_seconds: int, lease_seconds: int,
                 failure_ttl_seconds: int, clock: Callable[[], datetime] = utcnow):
        self.ttl = timedelta(seconds=ttl_seconds)
        self.lease = timedelta(seconds=lease_seconds)
        self.failure_ttl = timedelta(seconds=failure_ttl_seconds)
        self.clock = clock

    def claim_update(self, current: dict[str, Any] | None, city: str, locality: str,
                     force: bool) -> tuple[Claim, dict[str, Any] | None]:
        now = self.clock()
        doc = dict(current or {})
        status = doc.get("status")
        expires = doc.get("expiresAt")
        lease_expires = doc.get("leaseExpiresAt")
        if not force and status in {"available", "no_evidence"} and expires and expires > now:
            return Claim(doc), None
        if status == "pending" and lease_expires and lease_expires > now:
            return Claim(doc), None
        if not force and status == "temporarily_unavailable" and expires and expires > now:
            return Claim(doc), None

        reclaimed = status == "pending" and (not lease_expires or lease_expires <= now)
        job_id = uuid.uuid4().hex
        updated = {
            **doc,
            "schemaVersion": SCHEMA_VERSION,
            "city": city,
            "locality": locality,
            "status": "pending",
            "jobId": job_id,
            "attemptCount": int(doc.get("attemptCount") or 0) + 1,
            "startedAt": now,
            "updatedAt": now,
            "completedAt": None,
            "leaseExpiresAt": now + self.lease,
            "lastErrorCategory": None,
            "validatorResult": "pending",
            # Optional Firestore TTL policy target. This is deliberately separate
            # from evidence expiry so stale-while-revalidate remains possible.
            "deleteAfter": now + RETENTION,
        }
        return Claim(updated, job_id, True, reclaimed), updated

    def completion_update(self, current: dict[str, Any] | None, job_id: str,
                          result: dict[str, Any], validator_result: str) -> dict[str, Any] | None:
        now = self.clock()
        if not current or current.get("status") != "pending" or current.get("jobId") != job_id:
            return None
        # The deadline owns the generation once its lease expires. A late network
        # response cannot revive it, even if the watchdog was delayed.
        if not current.get("leaseExpiresAt") or current["leaseExpiresAt"] <= now:
            return None
        status = result.get("status")
        if status not in {"available", "no_evidence"}:
            return self.failure_update(current, job_id, "unusable_grounding", validator_result)
        updated = {
            **current,
            "status": status,
            "items": list(result.get("items") or []),
            "citations": list(result.get("citations") or []),
            "limitation": result.get("limitation"),
            "updatedAt": now,
            "completedAt": now,
            "expiresAt": now + self.ttl,
            "leaseExpiresAt": None,
            "lastErrorCategory": None,
            "validatorResult": validator_result,
        }
        if status == "available":
            updated["lastSuccessAt"] = now
        return updated

    def failure_update(self, current: dict[str, Any] | None, job_id: str,
                       category: str, validator_result: str) -> dict[str, Any] | None:
        now = self.clock()
        if not current or current.get("status") != "pending" or current.get("jobId") != job_id:
            return None
        return {
            **current,
            "status": "temporarily_unavailable",
            "updatedAt": now,
            "completedAt": now,
            "expiresAt": now + self.failure_ttl,
            "leaseExpiresAt": None,
            "lastErrorCategory": category,
            "validatorResult": validator_result,
            "limitation": "Verified civic sources could not be reached just now. Nothing is shown rather than showing unverified events.",
        }


class InMemoryPulseStore(_StateMachine):
    """Thread-safe shared fake for unit tests; never selected by production config."""
    def __init__(self, *, ttl_seconds: int = 21600, lease_seconds: int = 65,
                 failure_ttl_seconds: int = 60, clock: Callable[[], datetime] = utcnow):
        super().__init__(ttl_seconds=ttl_seconds, lease_seconds=lease_seconds,
                         failure_ttl_seconds=failure_ttl_seconds, clock=clock)
        self.documents: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()

    def claim(self, city: str, locality: str, *, force: bool = False) -> Claim:
        key = document_id(city, locality)
        with self._lock:
            claim, update = self.claim_update(self.documents.get(key), city, locality, force)
            if update is not None:
                self.documents[key] = update
            return claim

    def complete(self, city: str, locality: str, job_id: str, result: dict[str, Any],
                 validator_result: str) -> bool:
        key = document_id(city, locality)
        with self._lock:
            update = self.completion_update(self.documents.get(key), job_id, result, validator_result)
            if update is None:
                return False
            self.documents[key] = update
            return True

    def fail(self, city: str, locality: str, job_id: str, category: str,
             validator_result: str) -> bool:
        key = document_id(city, locality)
        with self._lock:
            update = self.failure_update(self.documents.get(key), job_id, category, validator_result)
            if update is None:
                return False
            self.documents[key] = update
            return True


class FirestorePulseStore(_StateMachine):
    def __init__(self, project: str, database: str, *, ttl_seconds: int = 21600,
                 lease_seconds: int = 65, failure_ttl_seconds: int = 60):
        super().__init__(ttl_seconds=ttl_seconds, lease_seconds=lease_seconds,
                         failure_ttl_seconds=failure_ttl_seconds)
        from google.cloud import firestore
        self._firestore = firestore
        self._client = firestore.Client(project=project or None, database=database)

    def _ref(self, city: str, locality: str):
        return self._client.collection(COLLECTION).document(document_id(city, locality))

    def claim(self, city: str, locality: str, *, force: bool = False) -> Claim:
        transaction = self._client.transaction()
        ref = self._ref(city, locality)

        @self._firestore.transactional
        def transact(tx):
            snapshot = ref.get(transaction=tx)
            current = snapshot.to_dict() if snapshot.exists else None
            claim, update = self.claim_update(current, city, locality, force)
            if update is not None:
                tx.set(ref, {**update, "serverUpdatedAt": self._firestore.SERVER_TIMESTAMP})
            return claim

        return transact(transaction)

    def _conditional_update(self, city: str, locality: str, builder) -> bool:
        transaction = self._client.transaction()
        ref = self._ref(city, locality)

        @self._firestore.transactional
        def transact(tx):
            snapshot = ref.get(transaction=tx)
            update = builder(snapshot.to_dict() if snapshot.exists else None)
            if update is None:
                return False
            tx.set(ref, {**update, "serverUpdatedAt": self._firestore.SERVER_TIMESTAMP})
            return True

        return transact(transaction)

    def complete(self, city: str, locality: str, job_id: str, result: dict[str, Any],
                 validator_result: str) -> bool:
        return self._conditional_update(city, locality, lambda current: self.completion_update(
            current, job_id, result, validator_result))

    def fail(self, city: str, locality: str, job_id: str, category: str,
             validator_result: str) -> bool:
        return self._conditional_update(city, locality, lambda current: self.failure_update(
            current, job_id, category, validator_result))


_production_store: FirestorePulseStore | None = None
_production_lock = threading.Lock()


def production_store(project: str, database: str, *, ttl_seconds: int,
                     lease_seconds: int, failure_ttl_seconds: int) -> FirestorePulseStore:
    global _production_store
    with _production_lock:
        if _production_store is None:
            _production_store = FirestorePulseStore(
                project, database, ttl_seconds=ttl_seconds, lease_seconds=lease_seconds,
                failure_ttl_seconds=failure_ttl_seconds)
        return _production_store
