"""NestIQ API — FastAPI on Cloud Run.

City-aware decision-intelligence endpoints. Indian cities are powered live by
Google Maps (Air Quality, Places, Distance Matrix); New York is powered by the
real BigQuery + BQML pipeline.
"""
from __future__ import annotations

import json
import threading
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from . import bq, gemini, maps, bq_india, civic_rag, copilot, image_analysis, pulse_store, rate_limit, telemetry, transcription
from .config import settings
from .fitscore import score_neighborhoods, DEFAULT_WEIGHTS
from .india import city_list, get_city
from .schemas import SearchRequest, AskRequest

# Localhost dev origins used when ALLOWED_ORIGINS is unset. Failing closed here means a
# deploy that forgets the env var breaks the frontend loudly instead of silently leaving
# the API open to every origin on the internet.
DEV_ORIGINS = ["http://localhost:5173", "http://localhost:4173", "http://127.0.0.1:5173"]


def cors_origins() -> list[str]:
    """Parse the configured CORS allowlist. A wildcard is never produced: '*' with an
    open API is the hole this replaces, so it is filtered out even if configured."""
    raw = (settings.allowed_origins or "").split(",")
    origins = [o.strip() for o in raw if o.strip() and o.strip() != "*"]
    return origins or list(DEV_ORIGINS)


NYC = "new-york"
DEFAULT_CITY = "delhi-ncr"


def warm_default_city_cache() -> None:
    """Warm slow clients without delaying Cloud Run readiness."""
    def warm():
        maps.build_city_features(DEFAULT_CITY)
        try:
            gemini.parse_query("warmup: flat with clean air")
        except Exception as error:  # noqa: BLE001
            telemetry.event("warmup_failed", tool="gemini_parse_query", errorType=type(error).__name__)

    threading.Thread(target=warm, daemon=True).start()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    warm_default_city_cache()
    yield


app = FastAPI(title="NestIQ API", version="2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_methods=["GET", "POST"],  # the API exposes nothing else
    allow_headers=["Content-Type", "Authorization"],
    expose_headers=["X-Request-ID"],
)


@app.middleware("http")
async def structured_request_telemetry(request: Request, call_next):
    """Attach a request ID and emit metadata-only request lifecycle events."""
    request_id = telemetry.accepted_request_id(request.headers.get("X-Request-ID"))
    token = telemetry.bind_request(request_id)
    started = time.perf_counter()
    telemetry.event("request_started", method=request.method, path=request.url.path)
    try:
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        telemetry.event(
            "request_completed", method=request.method, path=request.url.path,
            statusCode=response.status_code, latencyMs=telemetry.elapsed_ms(started),
        )
        return response
    except Exception as error:  # noqa: BLE001
        telemetry.event(
            "request_failed", method=request.method, path=request.url.path,
            latencyMs=telemetry.elapsed_ms(started), errorType=type(error).__name__,
        )
        raise
    finally:
        telemetry.reset_request(token)

# Per-instance request budget for the expensive Ask endpoint (Gemini + BigQuery).
# NOT a global cap: Cloud Run runs N instances, so the real ceiling is N x this.
ASK_RATE_LIMIT = 20
ASK_RATE_WINDOW = 60  # seconds
TRANSCRIBE_RATE_LIMIT = 6
TRANSCRIBE_RATE_WINDOW = 60

# Log a BigQuery snapshot only once per fresh city build, not on every request.
_last_logged: dict[str, float] = {}
_last_logged_lock = threading.Lock()

# Cache the assembled detail payload (Gemini explanation + AQI history/forecast
# + BQML) per locality so repeat views don't re-pay those calls. Matches the
# 30-min city-data TTL; AQI only changes hourly.
_detail_cache: dict[tuple[str, str], tuple[float, dict]] = {}
_DETAIL_TTL = 1800

# Web-review summaries are grounded Google-Search calls; cache 24h per locality
# so we make at most one such (billable) call per locality per day.
_reviews_cache: dict[tuple[str, str], tuple[float, dict]] = {}
_REVIEWS_TTL = 86400
_reviews_refreshing: set[tuple[str, str]] = set()
_reviews_refresh_lock = threading.Lock()
_reviews_failure_cache: dict[tuple[str, str], tuple[float, dict]] = {}
_REVIEWS_FAILURE_TTL = 60

REVIEWS_UNAVAILABLE = {
    "status": "temporarily_unavailable",
    "summary": "",
    "citations": [],
    "limitation": "Verified community sources could not be reached just now.",
}
_PULSE_TTL = settings.pulse_ttl_seconds
_PULSE_FAILURE_TTL = settings.pulse_failure_ttl_seconds
_PULSE_DEADLINE = settings.pulse_job_deadline_seconds
# Tests replace this with InMemoryPulseStore. Production resolves the official
# Firestore client lazily so importing the app never performs network I/O.
_pulse_store: pulse_store.PulseStore | None = None

PULSE_UNAVAILABLE = {
    "status": "temporarily_unavailable",
    "items": [],
    "citations": [],
    "limitation": "Verified civic sources could not be reached just now. "
                  "Nothing is shown rather than showing unverified events.",
}


def _get_pulse_store() -> pulse_store.PulseStore:
    return _pulse_store or pulse_store.production_store(
        settings.gcp_project, settings.firestore_database, ttl_seconds=_PULSE_TTL,
        lease_seconds=_PULSE_DEADLINE, failure_ttl_seconds=_PULSE_FAILURE_TTL,
    )


def _fresh_reviews_failure(key: tuple[str, str]) -> dict | None:
    failed = _reviews_failure_cache.get(key)
    if failed and time.time() - failed[0] < _REVIEWS_FAILURE_TTL:
        return failed[1]
    return None


def _refresh_reviews_in_background(key: tuple[str, str], name: str, city_name: str,
                                   request_id: str | None = None) -> None:
    started = time.perf_counter()
    telemetry.event("evidence_job_started", request_id=request_id, evidenceType="community_reviews",
                    city=key[0], locality=key[1], cacheState="miss")
    try:
        data = gemini.web_reviews(name, city_name)
        if data.get("summary") and data.get("status") != "temporarily_unavailable":
            _reviews_cache[key] = (time.time(), data)
            _reviews_failure_cache.pop(key, None)
            telemetry.event(
                "evidence_job_completed", request_id=request_id, evidenceType="community_reviews",
                city=key[0], locality=key[1], status="available", fallbackUsed=False,
                sourceType="grounded_web", retrievalCount=len(data.get("citations", [])),
                latencyMs=telemetry.elapsed_ms(started),
            )
        else:
            _reviews_failure_cache[key] = (time.time(), data or dict(REVIEWS_UNAVAILABLE))
            telemetry.event(
                "evidence_job_completed", request_id=request_id, evidenceType="community_reviews",
                city=key[0], locality=key[1], status="temporarily_unavailable", fallbackUsed=True,
                sourceType="grounded_web", retrievalCount=0, latencyMs=telemetry.elapsed_ms(started),
            )
    except Exception as error:  # noqa: BLE001
        _reviews_failure_cache[key] = (time.time(), dict(REVIEWS_UNAVAILABLE))
        telemetry.event(
            "evidence_job_failed", request_id=request_id, evidenceType="community_reviews",
            city=key[0], locality=key[1], errorType=type(error).__name__, fallbackUsed=True,
            latencyMs=telemetry.elapsed_ms(started),
        )
    finally:
        with _reviews_refresh_lock:
            _reviews_refreshing.discard(key)


def _pulse_failure_category(data: dict) -> str:
    code = str(data.get("errorCode") or "")
    if "timeout" in code:
        return "timeout"
    return "grounding_unavailable" if code else "unusable_grounding"


def _refresh_pulse_in_background(store: pulse_store.PulseStore, key: tuple[str, str],
                                 job_id: str, name: str, city_name: str,
                                 request_id: str | None = None) -> None:
    started = time.perf_counter()
    deadline = threading.Timer(
        _PULSE_DEADLINE,
        lambda: _expire_pulse_job(store, key, job_id, request_id, started),
    )
    deadline.daemon = True
    deadline.start()
    try:
        data = gemini.locality_pulse(name, city_name)
        if data.get("status") in {"available", "no_evidence"}:
            validator = "passed" if data.get("status") == "available" else "no_qualifying_evidence"
            written = store.complete(key[0], key[1], job_id, data, validator)
            event_name = "pulse_job_completed" if written else "pulse_late_result_discarded"
            telemetry.event(event_name, request_id=request_id, city=key[0], locality=key[1],
                            jobId=job_id, status=data.get("status"), validatorResult=validator,
                            retrievalCount=len(data.get("citations", [])),
                            latencyMs=telemetry.elapsed_ms(started))
        else:
            category = _pulse_failure_category(data)
            written = store.fail(key[0], key[1], job_id, category, "failed")
            telemetry.event("pulse_job_failed" if written else "pulse_late_result_discarded",
                            request_id=request_id, city=key[0], locality=key[1], jobId=job_id,
                            status="temporarily_unavailable", errorType=category,
                            validatorResult="failed", latencyMs=telemetry.elapsed_ms(started))
    except Exception as error:  # noqa: BLE001
        category = "timeout" if "timeout" in type(error).__name__.lower() else "service_error"
        try:
            written = store.fail(key[0], key[1], job_id, category, "failed")
        except Exception as store_error:  # noqa: BLE001
            telemetry.event("pulse_store_write_failed", request_id=request_id, city=key[0], locality=key[1],
                            jobId=job_id, errorType=type(store_error).__name__)
            return
        telemetry.event("pulse_job_failed" if written else "pulse_late_result_discarded",
                        request_id=request_id, city=key[0], locality=key[1], jobId=job_id,
                        errorType=type(error).__name__, validatorResult="failed",
                        latencyMs=telemetry.elapsed_ms(started))
    finally:
        deadline.cancel()


def _expire_pulse_job(store: pulse_store.PulseStore, key: tuple[str, str], job_id: str,
                      request_id: str | None, started: float) -> None:
    try:
        written = store.fail(key[0], key[1], job_id, "timeout", "deadline_exceeded")
        telemetry.event("pulse_job_timed_out" if written else "pulse_late_result_discarded",
                        request_id=request_id, city=key[0], locality=key[1], jobId=job_id,
                        status="temporarily_unavailable", validatorResult="deadline_exceeded",
                        latencyMs=telemetry.elapsed_ms(started))
    except Exception as error:  # noqa: BLE001
        telemetry.event("pulse_store_write_failed", request_id=request_id, city=key[0], locality=key[1],
                        jobId=job_id, errorType=type(error).__name__)


def _pulse_response(doc: dict) -> dict:
    """Map internal coordination fields to the backward-compatible public shape."""
    status = doc.get("status")
    stale_items = bool(doc.get("items")) and doc.get("lastSuccessAt") is not None
    base = {
        "status": status,
        "items": list(doc.get("items") or []),
        "citations": list(doc.get("citations") or []),
    }
    if doc.get("limitation"):
        base["limitation"] = doc["limitation"]
    if stale_items and status in {"pending", "temporarily_unavailable"}:
        base["status"] = "available"
        base["cacheStatus"] = "stale"
        base["refreshStatus"] = "refreshing" if status == "pending" else "failed"
        if status == "temporarily_unavailable":
            base["limitation"] = "Showing previously verified civic evidence because the latest refresh did not complete."
        return base
    if status == "pending":
        base["refreshStatus"] = "refreshing"
        base["limitation"] = "Verified civic sources are being checked in the background."
    return base


def _serve_pulse(key: tuple[str, str], name: str, city_name: str, refresh: bool,
                 cache_name: str) -> dict:
    try:
        store = _get_pulse_store()
        claim = store.claim(key[0], key[1], force=refresh)
    except Exception as error:  # noqa: BLE001
        telemetry.event("pulse_store_read_failed", city=key[0], locality=key[1],
                        errorType=type(error).__name__)
        return dict(PULSE_UNAVAILABLE)
    if claim.launch and claim.job_id:
        telemetry.event("pulse_lease_reclaimed" if claim.reclaimed else "pulse_job_claimed",
                        city=key[0], locality=key[1], jobId=claim.job_id,
                        status="pending", attemptCount=claim.document.get("attemptCount"))
        threading.Thread(
            target=_refresh_pulse_in_background,
            args=(store, key, claim.job_id, name, city_name, telemetry.current_request_id()),
            daemon=True,
        ).start()
    else:
        event_name = "pulse_job_deduplicated" if claim.document.get("status") == "pending" else "pulse_shared_cache_hit"
        telemetry.event(event_name, cache=cache_name, city=key[0], locality=key[1],
                        jobId=claim.document.get("jobId"), status=claim.document.get("status"))
    response = _pulse_response(claim.document)
    if response.get("cacheStatus") == "stale":
        telemetry.event("pulse_stale_evidence_served", cache=cache_name, city=key[0], locality=key[1],
                        jobId=claim.document.get("jobId"), status=response.get("status"))
    return response

# Rent verification shares Pulse's cross-instance, generation-safe job protocol,
# in a separate Firestore collection. Verified evidence remains visible on refresh.
_RENT_VERIFICATION_TTL = settings.rent_verification_ttl_seconds
_RENT_FAILURE_TTL = settings.rent_failure_ttl_seconds
_RENT_DEADLINE = settings.rent_job_deadline_seconds
_rent_store: pulse_store.PulseStore | None = None

RENT_UNAVAILABLE = {
    "status": "temporarily_unavailable",
    "limitation": "Grounded rent sources could not be reached just now. The curated market estimate remains available.",
    "scoreImpact": "none",
}


def _get_rent_store() -> pulse_store.PulseStore:
    return _rent_store or pulse_store.production_store(
        settings.gcp_project, settings.firestore_database,
        ttl_seconds=_RENT_VERIFICATION_TTL, lease_seconds=_RENT_DEADLINE,
        failure_ttl_seconds=_RENT_FAILURE_TTL, collection=pulse_store.RENT_COLLECTION,
    )


def _rent_failure_category(data: dict) -> str:
    code = str(data.get("errorCode") or "")
    if "timeout" in code.lower():
        return "timeout"
    return "grounding_unavailable" if code else "unusable_grounding"


def _expire_rent_job(store: pulse_store.PulseStore, key: tuple[str, str], job_id: str,
                     request_id: str | None, started: float) -> None:
    try:
        written = store.fail(key[0], key[1], job_id, "timeout", "deadline_exceeded")
        telemetry.event("rent_job_timed_out" if written else "rent_late_result_discarded",
                        request_id=request_id, city=key[0], locality=key[1], jobId=job_id,
                        status="temporarily_unavailable", validatorResult="deadline_exceeded",
                        latencyMs=telemetry.elapsed_ms(started))
    except Exception as error:  # noqa: BLE001
        telemetry.event("rent_store_write_failed", request_id=request_id, city=key[0],
                        locality=key[1], jobId=job_id, errorType=type(error).__name__)


def _refresh_rent_in_background(store: pulse_store.PulseStore, key: tuple[str, str],
                                job_id: str, name: str, city_name: str, curated_rent,
                                request_id: str | None = None) -> None:
    """Write one validated rent generation; late generations are discarded."""
    started = time.perf_counter()
    deadline = threading.Timer(
        _RENT_DEADLINE,
        lambda: _expire_rent_job(store, key, job_id, request_id, started),
    )
    deadline.daemon = True
    deadline.start()
    telemetry.event("evidence_job_started", request_id=request_id, evidenceType="rent_verification",
                    city=key[0], locality=key[1], jobId=job_id, cacheState="miss")
    try:
        data = dict(gemini.verify_rent(name, city_name) or {})
        data["curatedMedianRent"] = curated_rent
        data["scoreImpact"] = "none"
        status = data.get("status")
        valid_available = status == "available" and data.get("sampleSize", 0) >= 2
        if valid_available or status == "no_evidence":
            validator = "passed" if valid_available else "no_qualifying_evidence"
            written = store.complete(key[0], key[1], job_id, data, validator)
            telemetry.event("rent_job_completed" if written else "rent_late_result_discarded",
                            request_id=request_id, evidenceType="rent_verification", city=key[0],
                            locality=key[1], jobId=job_id, status=status,
                            fallbackUsed=not valid_available, sourceType="grounded_web",
                            retrievalCount=data.get("sourceCount", 0), validatorResult=validator,
                            latencyMs=telemetry.elapsed_ms(started))
        else:
            category = _rent_failure_category(data)
            written = store.fail(key[0], key[1], job_id, category, "failed")
            telemetry.event("rent_job_failed" if written else "rent_late_result_discarded",
                            request_id=request_id, evidenceType="rent_verification", city=key[0],
                            locality=key[1], jobId=job_id, status="temporarily_unavailable",
                            errorType=category, fallbackUsed=True, validatorResult="failed",
                            latencyMs=telemetry.elapsed_ms(started))
    except Exception as error:  # noqa: BLE001
        category = "timeout" if "timeout" in type(error).__name__.lower() else "service_error"
        try:
            written = store.fail(key[0], key[1], job_id, category, "failed")
        except Exception as store_error:  # noqa: BLE001
            telemetry.event("rent_store_write_failed", request_id=request_id, city=key[0],
                            locality=key[1], jobId=job_id, errorType=type(store_error).__name__)
            return
        telemetry.event("rent_job_failed" if written else "rent_late_result_discarded",
                        request_id=request_id, evidenceType="rent_verification", city=key[0],
                        locality=key[1], jobId=job_id, errorType=type(error).__name__,
                        fallbackUsed=True, validatorResult="failed",
                        latencyMs=telemetry.elapsed_ms(started))
    finally:
        deadline.cancel()


def _rent_response(doc: dict, curated_rent) -> dict:
    status = doc.get("status")
    payload = dict(doc.get("payload") or {})
    stale_available = payload.get("status") == "available" and doc.get("lastSuccessAt") is not None
    if status in {"available", "no_evidence"} and payload:
        response = payload
    elif stale_available and status in {"pending", "temporarily_unavailable"}:
        response = {**payload, "cacheStatus": "stale",
                    "refreshStatus": "refreshing" if status == "pending" else "failed"}
        if status == "temporarily_unavailable":
            response["limitation"] = "Showing previously verified rent evidence because the latest refresh did not complete."
    elif status == "pending":
        response = {"status": "pending", "refreshStatus": "refreshing",
                    "limitation": "Grounded rent sources are being checked in the background. You can continue browsing."}
    else:
        response = dict(RENT_UNAVAILABLE)
    response.setdefault("curatedMedianRent", curated_rent)
    response["scoreImpact"] = "none"
    return response


def _serve_rent(key: tuple[str, str], name: str, city_name: str, curated_rent,
                refresh: bool) -> dict:
    try:
        store = _get_rent_store()
        claim = store.claim(key[0], key[1], force=refresh)
    except Exception as error:  # noqa: BLE001
        telemetry.event("rent_store_read_failed", city=key[0], locality=key[1],
                        errorType=type(error).__name__)
        return {**RENT_UNAVAILABLE, "curatedMedianRent": curated_rent}
    if claim.launch and claim.job_id:
        telemetry.event("rent_lease_reclaimed" if claim.reclaimed else "rent_job_claimed",
                        city=key[0], locality=key[1], jobId=claim.job_id,
                        status="pending", attemptCount=claim.document.get("attemptCount"))
        threading.Thread(target=_refresh_rent_in_background,
                         args=(store, key, claim.job_id, name, city_name, curated_rent,
                               telemetry.current_request_id()), daemon=True).start()
    else:
        event_name = "rent_job_deduplicated" if claim.document.get("status") == "pending" else "rent_shared_cache_hit"
        telemetry.event(event_name, cache="rent_verification", city=key[0], locality=key[1],
                        jobId=claim.document.get("jobId"), status=claim.document.get("status"))
    response = _rent_response(claim.document, curated_rent)
    if response.get("cacheStatus") == "stale":
        telemetry.event("rent_stale_evidence_served", cache="rent_verification",
                        city=key[0], locality=key[1], jobId=claim.document.get("jobId"))
    return response


def maybe_log_snapshot(city: str, results: list[dict]) -> None:
    """Snapshot to BigQuery only when this city's data was freshly rebuilt."""
    if city == NYC or not results:
        return
    ts = maps.built_at(city)
    if ts is None:
        return
    with _last_logged_lock:
        if _last_logged.get(city) == ts:
            return
        _last_logged[city] = ts
    bq_india.log_snapshot_safe(city, results)


def all_cities():
    # India-first: New York remains supported by the API but is no longer listed.
    return city_list()


def default_weights(city: str) -> dict:
    return dict(DEFAULT_WEIGHTS) if city == NYC else dict(gemini.INDIA_DEFAULT)


# Server-side allowlist of search presets. A preset overrides ONLY the five pillar
# weights; budget and other parsed preferences are preserved. The client may only
# send a preset id (never raw weights), and an unknown id is rejected (422).
PRESETS: dict[str, dict[str, int]] = {
    "family_health": {"affordability": 12, "safety": 28, "commute": 20, "lifestyle": 5, "air_quality": 35},
}


def _validate_preset(preset: str | None) -> str | None:
    """Return the preset id if empty/None or on the allowlist, else raise 422."""
    if not preset:
        return None
    if preset not in PRESETS:
        raise HTTPException(422, f"unknown preset: {preset}")
    return preset


def _apply_preset(parsed: dict, preset: str | None) -> dict:
    """Override only the five weights with the preset profile; keep everything
    else parse_query produced. Always records `presetApplied` (None when absent).
    Assumes `preset` was already validated against the allowlist."""
    if preset and preset in PRESETS:
        parsed = {**parsed, "weights": {**parsed["weights"], **PRESETS[preset]},
                  "presetApplied": preset}
    else:
        parsed = {**parsed, "presetApplied": None}
    return parsed


def rank(city: str, weights: dict, budget: float | None) -> list[dict]:
    if city == NYC:
        ranked = score_neighborhoods(bq.get_features(), weights, budget or 2000)
        for r in ranked:
            r.update(bq.meta(r["id"]))
        return ranked
    feats = maps.build_city_features(city)
    return maps.score_india(feats, weights, budget or 30000)


def note_for(city: str, r: dict) -> str:
    if city == NYC:
        return f"a {r.get('forecast_pct', 0)}% predicted 12-month rent trend"
    aqi = r.get("aqi")
    if aqi is None:
        return "an air quality reading that is temporarily unavailable (do not estimate it)"
    note = f"an air quality index (AQI) of {aqi}, {r.get('aqi_category', '')}"
    risks = r.get("criticalRisks") or []
    if risks:
        # Give the model the health trade-off as a fact to weave in, not an
        # instruction to parrot, so it names the concern in its own words.
        note += f", which is a {risks[0]['severity']} health concern for residents despite the strong overall FitScore"
    return note


@app.get("/api/health")
def health():
    return {"ok": True, "project": settings.gcp_project, "cities": [c["id"] for c in all_cities()]}


@app.get("/api/cities")
def cities():
    return {"cities": all_cities(), "default": DEFAULT_CITY}


@app.get("/api/config")
def config():
    """Browser-safe config only. The server Maps key (Air Quality / Places / Distance
    Matrix) is NEVER returned here. If MAPS_BROWSER_KEY is unset we return an empty
    string and the map degrades — falling back to the server key would re-open exactly
    the leak this closes."""
    if not settings.maps_browser_key:
        telemetry.event("configuration_warning", setting="MAPS_BROWSER_KEY", status="missing")
    return {"mapsKey": settings.maps_browser_key}


@app.post("/api/search")
def search(req: SearchRequest):
    city = req.city or DEFAULT_CITY
    preset = _validate_preset(req.preset)
    parsed = _apply_preset(gemini.parse_query(req.query, req.budget), preset)
    results = rank(city, parsed["weights"], parsed["budget"])
    maybe_log_snapshot(city, results)
    return {"preferences": parsed, "results": results, "city": city}


# Fan-out agents: each owns one pillar and reports a headline finding.
PILLAR_AGENTS = [
    ("air", "Air Quality Agent", "air_quality", "aqi", min, lambda r: f"least-polluted: {r['name']} (AQI {r.get('aqi')}, {r.get('airHealthBand', '')})"),
    ("aff", "Affordability Agent", "affordability", "median_rent", min, lambda r: f"cheapest: {r['name']} (₹{r.get('median_rent'):,}/mo)"),
    ("com", "Commute Agent", "commute", "commute_min", min, lambda r: f"fastest commute: {r['name']} ({r.get('commute_min')} min)"),
    ("life", "Lifestyle Agent", "lifestyle", "amenity_count", max, lambda r: f"most amenities: {r['name']} ({r.get('amenity_count')} nearby)"),
    ("safe", "Safety Agent", "safety", "safety_est", max, lambda r: f"safest: {r['name']}"),
]


@app.get("/api/search/stream")
def search_stream(q: str = "", city: str = DEFAULT_CITY, preset: str | None = None):
    """Server-Sent Events: shows the fan-out agents working, then final results."""
    # Validate before streaming starts so an unknown preset is a clean 422.
    preset = _validate_preset(preset)

    def parse_with_preset(text: str, budget=None) -> dict:
        # Same preset override as POST /api/search, threaded through both the ADK
        # coordinator and the legacy narrated stream so the applied prioritization
        # is identical on every path.
        return _apply_preset(gemini.parse_query(text, budget), preset)

    def sse(event: str, data: dict) -> str:
        return f"event: {event}\ndata: {json.dumps(data)}\n\n"

    def gen():
        if settings.use_adk_orchestration:
            # The ADK runner currently returns its validated payloads together.
            # Emit the first truthful state before that work begins so the SSE
            # connection is visibly alive during Gemini intent parsing.
            yield sse("agent", {
                "id": "planner",
                "name": "NestIQ Planner",
                "status": "running",
                "msg": "Understanding your request and selecting tools...",
            })
            # Run the whole ADK workflow first; if it fails for any reason, fall
            # through to the legacy narrated stream so search never breaks.
            payloads = None
            try:
                from . import adk_orchestration
                payloads = adk_orchestration.run_adk_search(q, city, parse_with_preset, rank)
            except Exception as e:  # noqa: BLE001
                telemetry.event("agent_fallback", city=city, fromEngine="adk", toEngine="legacy_stream",
                                fallbackUsed=True, errorType=type(e).__name__)
                payloads = None
            if payloads is not None:
                for payload in payloads:
                    if payload.get("kind") == "final":
                        maybe_log_snapshot(city, payload.get("results", []))
                        yield sse("final", {k: v for k, v in payload.items() if k != "kind"})
                    else:
                        yield sse("agent", {k: v for k, v in payload.items() if k != "kind"})
                return
        yield sse("agent", {"id": "planner", "name": "Planner", "status": "running",
                            "msg": "Understanding your request with Gemini…"})
        parsed = parse_with_preset(q, None)
        w = parsed["weights"]
        top_prefs = ", ".join(k.replace("_", " ") for k, v in sorted(w.items(), key=lambda x: -x[1]) if v >= 40) or "balanced priorities"
        yield sse("agent", {"id": "planner", "name": "Planner", "status": "done", "msg": f"Priorities: {top_prefs}"})
        time.sleep(0.05)

        yield sse("agent", {"id": "collect", "name": "Data Collector", "status": "running",
                            "msg": "Fetching live Google signals (AQI · Places · Distance Matrix)…"})
        results = rank(city, w, parsed["budget"])
        yield sse("agent", {"id": "collect", "name": "Data Collector", "status": "done",
                            "msg": f"Gathered live data for {len(results)} localities"})
        time.sleep(0.05)

        for aid, name, sub, field, pick, headline in PILLAR_AGENTS:
            yield sse("agent", {"id": aid, "name": name, "status": "running", "msg": "Scoring localities…"})
            time.sleep(0.08)
            valid = [r for r in results if r.get(field) is not None]
            best = pick(valid, key=lambda r: r[field]) if valid else None
            weight = w.get(sub, 0)
            msg = headline(best) if best else "no data"
            yield sse("agent", {"id": aid, "name": name, "status": "done", "msg": msg, "weight": weight})

        yield sse("agent", {"id": "orch", "name": "Orchestrator", "status": "running",
                            "msg": "Combining agent scores into weighted FitScores…"})
        time.sleep(0.08)
        top = results[0] if results else None
        yield sse("agent", {"id": "orch", "name": "Orchestrator", "status": "done",
                            "msg": f"Top match: {top['name']} (FitScore {top['fitScore']})" if top else "no results"})

        maybe_log_snapshot(city, results)
        yield sse("final", {"preferences": parsed, "results": results, "city": city})

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/api/neighborhoods")
def neighborhoods(city: str = DEFAULT_CITY):
    results = rank(city, default_weights(city), None)
    maybe_log_snapshot(city, results)
    return {"results": results, "city": city}


@app.get("/api/neighborhood/{nid}")
def neighborhood(nid: str, city: str = DEFAULT_CITY):
    ranked = rank(city, default_weights(city), None)
    match = next((r for r in ranked if r["id"] == nid), None)
    if not match:
        raise HTTPException(404, "neighborhood not found")

    # Serve the cached detail (Gemini + AQI series) if it's still fresh; the
    # base metrics above are already city-cached, so this only skips the
    # expensive per-locality calls on repeat views.
    key = (city, nid)
    cached = _detail_cache.get(key)
    if cached and time.time() - cached[0] < _DETAIL_TTL:
        telemetry.event("cache_access", cache="neighborhood_detail", city=city, locality=nid, cacheState="hit")
        return {**match, **cached[1]}

    telemetry.event("cache_access", cache="neighborhood_detail", city=city, locality=nid, cacheState="miss")

    extra: dict = {"why": gemini.explain(match["name"], match["subscores"], match["median_rent"], note_for(city, match))}
    if city == NYC:
        extra["rentSeries"] = bq.get_rent_series(nid)
    else:
        extra["aqiSeries"] = {
            "history": maps.air_quality_history(match["lat"], match["lng"]),
            "forecast": maps.air_quality_forecast(match["lat"], match["lng"]),
            "bqmlForecast": bq_india.aqi_forecast_bqml(nid),
        }
    _detail_cache[key] = (time.time(), extra)
    return {**match, **extra}


@app.get("/api/neighborhood/{nid}/essentials")
def neighborhood_essentials(nid: str, city: str = DEFAULT_CITY):
    """Additive essential-services proximity (hospitals, doctors, pharmacies,
    schools, universities) for the locality. Shown for context on the detail
    page; never part of the FitScore. Missing data is an honest unavailable
    state, never a fabricated live-looking number."""
    ranked = rank(city, default_weights(city), None)
    match = next((r for r in ranked if r["id"] == nid), None)
    if not match:
        raise HTTPException(404, "neighborhood not found")
    return maps.essential_profile(match["lat"], match["lng"])


@app.get("/api/neighborhood/{nid}/reviews")
def neighborhood_reviews(nid: str, city: str = DEFAULT_CITY, refresh: bool = False):
    """Start grounded community evidence asynchronously and return immediately."""
    ranked = rank(city, default_weights(city), None)
    match = next((r for r in ranked if r["id"] == nid), None)
    if not match:
        raise HTTPException(404, "neighborhood not found")

    key = (city, nid)
    cached = _reviews_cache.get(key)
    if not refresh and cached and time.time() - cached[0] < _REVIEWS_TTL:
        telemetry.event("cache_access", cache="community_reviews", city=city, locality=nid, cacheState="hit")
        return cached[1]
    city_obj = get_city(city)
    if not refresh and not cached:
        failed = _fresh_reviews_failure(key)
        if failed:
            telemetry.event("cache_access", cache="community_reviews", city=city, locality=nid,
                            cacheState="failure_hit", fallbackUsed=True)
            return dict(failed)
    with _reviews_refresh_lock:
        if key not in _reviews_refreshing:
            _reviews_refreshing.add(key)
            threading.Thread(
                target=_refresh_reviews_in_background,
                args=(key, match["name"], city_obj["name"] if city_obj else city,
                      telemetry.current_request_id()),
                daemon=True,
            ).start()
    telemetry.event("cache_access", cache="community_reviews", city=city, locality=nid,
                    cacheState="stale" if cached else "miss", refreshStarted=True)
    if cached:
        return {**cached[1], "refreshStatus": "refreshing"}
    return {
        "status": "pending", "summary": "", "citations": [],
        "refreshStatus": "refreshing",
        "limitation": "Verified community sources are being checked in the background.",
    }


@app.get("/api/neighborhood/{nid}/pulse")
def neighborhood_pulse(nid: str, city: str = DEFAULT_CITY, refresh: bool = False):
    """Grounded current civic updates; never changes FitScore."""
    ranked = rank(city, default_weights(city), None)
    match = next((r for r in ranked if r["id"] == nid), None)
    if not match:
        raise HTTPException(404, "neighborhood not found")
    city_obj = get_city(city)
    return _serve_pulse((city, nid), match["name"], city_obj["name"] if city_obj else city,
                        refresh, "locality_pulse")


@app.get("/api/city/{city}/pulse")
def city_pulse(city: str, refresh: bool = False):
    """City-wide grounded civic updates for the Alerts City Pulse view.

    Reuses the exact same pulse pipeline (gemini.locality_pulse) and shared
    cache/background-refresh as the per-locality pulse — no second event
    pipeline — scoped to the whole city, and never affects any score.
    """
    city_obj = get_city(city)
    if not city_obj:
        raise HTTPException(404, "city not found")
    city_name = city_obj["name"]
    return _serve_pulse((city, "__city__"), city_name, city_name, refresh, "city_pulse")


@app.get("/api/neighborhood/{nid}/civic-knowledge")
def neighborhood_civic_knowledge(nid: str, q: str, city: str = DEFAULT_CITY):
    """Retrieve citation-locked official civic knowledge for a locality."""
    ranked = rank(city, default_weights(city), None)
    match = next((r for r in ranked if r["id"] == nid), None)
    if not match:
        raise HTTPException(404, "neighborhood not found")
    question = (q or "").strip()
    if len(question) < 3:
        raise HTTPException(422, "question must contain at least 3 characters")
    result = civic_rag.answer(question[:500], city, nid)
    telemetry.event(
        "rag_retrieval_completed", city=city, locality=nid, sourceType="controlled_official_catalog",
        retrievalCount=result.get("retrievedCount", 0), validatorResult=result.get("status"),
        citationCount=len(result.get("citations", [])), fallbackUsed=result.get("status") != "available",
    )
    return result


@app.get("/api/neighborhood/{nid}/rent-verification")
def neighborhood_rent_verification(nid: str, city: str = DEFAULT_CITY, refresh: bool = False):
    """Grounded current 1-bedroom rent range, calculated from cited observations."""
    ranked = rank(city, default_weights(city), None)
    match = next((r for r in ranked if r["id"] == nid), None)
    if not match:
        raise HTTPException(404, "neighborhood not found")

    key = (city, nid)
    city_obj = get_city(city)
    city_name = city_obj["name"] if city_obj else city
    return _serve_rent(key, match["name"], city_name, match.get("median_rent"), refresh)


# Only the fields useful to the assistant — keeps the Gemini prompt small and
# free of noise (lat/lng, photo resource names, accent colours, breakdowns).
_ASK_FIELDS = ("name", "median_rent", "aqi", "aqi_category", "airHealthBand",
               "airDataStatus", "criticalRisks", "amenity_count",
               "commute_min", "safety_est", "subscores", "fitScore", "matchDisplay", "evidence")


def _slim(f: dict) -> dict:
    return {k: f.get(k) for k in _ASK_FIELDS if f.get(k) is not None}


# Short-TTL cache so an identical question (e.g. a judge re-asking) is instant
# and doesn't re-bill Gemini + BigQuery.
_ask_cache: dict[tuple, tuple[float, dict]] = {}
_ASK_TTL = 600


@app.post("/api/ask")
def ask(req: AskRequest, request: Request):
    # Ask is the most expensive endpoint (Gemini + a BigQuery NL->SQL job per miss).
    # Per-instance limit only — see rate_limit module docstring.
    rate_limit.check("ask", rate_limit.client_id(request), limit=ASK_RATE_LIMIT,
                     window=ASK_RATE_WINDOW)
    city = req.city or DEFAULT_CITY
    history = tuple((turn.role, turn.content.strip()) for turn in req.history)
    key = (city, req.neighborhoodId or "", (req.question or "").strip().lower(), history)
    cached = _ask_cache.get(key)
    if cached and time.time() - cached[0] < _ASK_TTL:
        telemetry.event("cache_access", cache="ask", city=city,
                        locality=req.neighborhoodId, cacheState="hit")
        return cached[1]

    telemetry.event("cache_access", cache="ask", city=city,
                    locality=req.neighborhoodId, cacheState="miss")
    resp = _ask(city, req)
    if resp.get("answer"):
        _ask_cache[key] = (time.time(), resp)
    return resp


@app.post("/api/copilot/transcribe")
async def transcribe_voice(
    request: Request,
    durationMs: int,
    languageCode: str = "en-IN",
):
    """Transcribe a short, memory-only voice question through Google Speech v2."""
    rate_limit.check(
        "copilot_transcribe",
        rate_limit.client_id(request),
        limit=TRANSCRIBE_RATE_LIMIT,
        window=TRANSCRIBE_RATE_WINDOW,
    )
    content_type = request.headers.get("content-type", "")
    declared_size = request.headers.get("content-length")
    if declared_size and int(declared_size) > transcription.MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="The recording is larger than 5 MB.")

    audio = bytearray()
    async for chunk in request.stream():
        audio.extend(chunk)
        if len(audio) > transcription.MAX_AUDIO_BYTES:
            raise HTTPException(status_code=413, detail="The recording is larger than 5 MB.")

    try:
        return transcription.transcribe(bytes(audio), content_type, durationMs, languageCode)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except transcription.TranscriptionUnavailable as error:
        raise HTTPException(
            status_code=503,
            detail="Voice transcription is temporarily unavailable. You can continue typing.",
        ) from error


@app.post("/api/copilot/analyze-image")
async def analyze_copilot_image(
    request: Request,
    city: str = DEFAULT_CITY,
    question: str = "",
):
    """Analyze one memory-only image with Gemini; no upload is persisted."""
    rate_limit.check(
        "copilot_image", rate_limit.client_id(request), limit=6, window=60,
    )
    content_type = request.headers.get("content-type", "")
    declared_size = request.headers.get("content-length")
    if declared_size and int(declared_size) > image_analysis.MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="The image is larger than 8 MB.")

    image = bytearray()
    async for chunk in request.stream():
        image.extend(chunk)
        if len(image) > image_analysis.MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="The image is larger than 8 MB.")
    try:
        city_name = next((item["name"] for item in city_list() if item["id"] == city), city)
        return image_analysis.analyze(bytes(image), content_type, question, city_name)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except image_analysis.ImageAnalysisUnavailable as error:
        raise HTTPException(
            status_code=503,
            detail="Image analysis is temporarily unavailable. You can continue without the image.",
        ) from error


def _ask(city: str, req: AskRequest) -> dict:
    history = [turn.model_dump() for turn in req.history]
    mode = copilot.route_intent(req.question, req.neighborhoodId, history)
    telemetry.event("copilot_route_selected", city=city, route=mode,
                    locality=req.neighborhoodId)

    if mode == copilot.GENERAL_GUIDANCE:
        conversation = copilot.conversation_context(history)
        return {
            "answer": gemini.ask_general(req.question, conversation),
            "sources": ["Gemini on Vertex AI (general guidance)"],
            **copilot.envelope(
                mode=mode, city=city, neighborhood_id=None,
                used_bigquery=False,
            ),
        }

    # Comparative/aggregate India questions -> guarded NL->SQL over BigQuery.
    # Ordinary city questions stay on structured evidence, avoiding an unnecessary
    # analytics job while preserving the existing fallback if BigQuery is unavailable.
    if city != NYC and mode == copilot.CITY_ANALYTICS:
        try:
            bq_india.ensure_ready()
            analysis_question = copilot.contextual_question(req.question, history)
            sql = gemini.nl_to_sql(analysis_question, city, bq_india.LOCALITIES_LATEST)
            rows = bq_india.analytics_query(sql, city)
            if rows:
                answer = gemini.ask(req.question, f"BigQuery query returned these rows: {rows}")
                visible_rows = rows[:8]
                return {
                    "answer": answer,
                    "sql": sql,
                    "rows": visible_rows,
                    "sources": ["BigQuery (NL→SQL)", "india_localities_latest view", "Gemini on Vertex AI"],
                    **copilot.envelope(
                        mode=mode, city=city, neighborhood_id=req.neighborhoodId,
                        used_bigquery=True, rows=visible_rows,
                    ),
                }
        except Exception as e:  # noqa: BLE001
            telemetry.event(
                "tool_fallback", tool="nl_to_sql", city=city, sourceType="bigquery",
                fallbackUsed=True, errorType=type(e).__name__,
            )

    feats = {f["id"]: f for f in rank(city, default_weights(city), None)}
    if req.neighborhoodId and req.neighborhoodId in feats:
        selected = feats[req.neighborhoodId]
        ctx = f"Locality {selected['name']}: {_slim(selected)}"
    else:
        selected = None
        ctx = f"All localities in {city}: {[_slim(f) for f in feats.values()]}"
    conversation = copilot.conversation_context(history)
    if conversation:
        ctx = f"{ctx}\n\n{conversation}"
    sources = ["Google Air Quality API", "Google Places", "Google Maps", "Gemini"] if city != NYC else ["NYC 311", "NYPD collisions", "Zillow ZORI", "BigQuery ML"]
    return {
        "answer": gemini.ask(req.question, ctx),
        "sources": sources,
        **copilot.envelope(
            mode=mode, city=city, neighborhood_id=req.neighborhoodId,
            used_bigquery=False, locality=selected,
        ),
    }
