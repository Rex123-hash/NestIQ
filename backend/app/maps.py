"""Google Maps Platform integration for Indian cities.

Fetches LIVE air quality, amenity density, and commute time per locality, then
scores them with a FitScore that swaps the NYC 'Trend' pillar for 'Air Quality'
(the defining Delhi-NCR/APAC livability factor).
"""
from __future__ import annotations

import statistics
import threading
import time
from math import asin, cos, radians, sin, sqrt
from concurrent.futures import ThreadPoolExecutor

import requests

from .config import settings
from .fitscore import _minmax, _match
from .air_quality import air_health_score, cpcb_band, critical_risks, air_relative_ranks, valid_aqi
from .evidence import metric_evidence, _envelope
from .india import get_city, INDIA_DEFAULT_WEIGHTS as INDIA_WEIGHTS
from . import telemetry

INDIA_KEYS = list(INDIA_WEIGHTS.keys())

_cache: dict[str, tuple[float, list[dict]]] = {}
_TTL = 1800  # 30 min
_TRANSIENT_HTTP = frozenset({408, 429, 500, 502, 503, 504})


def _request_with_retry(call, *args, **kwargs):
    """Retry one transient Maps transport/server failure, never permanent 4xx."""
    last_error = None
    for attempt in range(2):
        try:
            response = call(*args, **kwargs)
            if attempt == 0 and getattr(response, "status_code", 200) in _TRANSIENT_HTTP:
                time.sleep(0.35)
                continue
            return response
        except requests.RequestException as error:
            last_error = error
            if attempt == 1:
                raise
            time.sleep(0.35)
    raise last_error


# --------------------------- individual Maps calls ------------------------- #
CPCB_SOURCE = "Google Air Quality API (CPCB AQI)"
UAQI_SOURCE = "Google Air Quality API (Universal AQI)"
AIR_SOURCE = CPCB_SOURCE  # back-compat alias

# Last successful reading per rounded location, so a failed refresh can be served
# as an explicitly-stale value (with its ORIGINAL timestamp) instead of nothing.
_last_good_aqi: dict[tuple[float, float], dict] = {}


def _now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


def _aqi_key(lat: float, lng: float) -> tuple[float, float]:
    return (round(lat, 4), round(lng, 4))


def _unavailable_or_stale(key: tuple[float, float]) -> dict:
    """Serve the last good reading as stale, else an honest unavailable state."""
    prev = _last_good_aqi.get(key)
    if prev:
        return {**prev, "status": "stale", "stale": True, "fallbackUsed": True}
    return {"aqi": None, "category": "Unknown", "dominant": "", "indexCode": None,
            "status": "temporarily_unavailable", "source": CPCB_SOURCE,
            "scoringMethod": "none", "stale": False, "fallbackUsed": False,
            "fetchedAt": _now_iso()}


def air_quality(lat: float, lng: float) -> dict:
    """India CPCB AQI with Universal-AQI fallback, and explicit provenance.

    Returns which index was actually used (`indexCode`), an accurate source
    label, and the scoring method. A Universal-AQI reading is returned with its
    own label and scoringMethod 'none' so it is never scored through CPCB bands.
    A failed call serves the last good reading as stale (original timestamp), or
    an honest temporarily_unavailable state, never a fabricated number.
    """
    key = _aqi_key(lat, lng)
    fetched = _now_iso()
    try:
        r = _request_with_retry(requests.post,
            f"https://airquality.googleapis.com/v1/currentConditions:lookup?key={settings.maps_api_key}",
            json={"location": {"latitude": lat, "longitude": lng}, "extraComputations": ["LOCAL_AQI"]},
            timeout=15,
        )
        idx = {i["code"]: i for i in r.json().get("indexes", [])}
        cpcb = idx.get("ind_cpcb") or {}
        uaqi = idx.get("uaqi") or {}
        # Validate the raw value at ingestion: a string / NaN / infinity / boolean
        # / negative must never be cached or labelled live.
        if valid_aqi(cpcb.get("aqi")) is not None:
            chosen, code, source, method = cpcb, "ind_cpcb", CPCB_SOURCE, "cpcb"
        elif valid_aqi(uaqi.get("aqi")) is not None:
            # Universal AQI: different scale/direction — displayed, not CPCB-scored.
            chosen, code, source, method = uaqi, "uaqi", UAQI_SOURCE, "none"
        else:
            return _unavailable_or_stale(key)
        result = {"aqi": chosen.get("aqi"), "category": chosen.get("category", "Unknown"),
                  "dominant": chosen.get("dominantPollutant", ""), "indexCode": code,
                  "status": "live", "source": source, "scoringMethod": method,
                  "stale": False, "fallbackUsed": False, "fetchedAt": fetched}
        _last_good_aqi[key] = dict(result)
        return result
    except Exception as e:  # noqa: BLE001
        telemetry.event("tool_fallback", tool="maps_air_quality", fallbackUsed=True,
                        errorType=type(e).__name__)
        return _unavailable_or_stale(key)


def _extract_aqi(indexes: list) -> int | None:
    """CPCB (ind_cpcb) AQI for a single history/forecast point, validated.

    History and forecast feed a chart labelled as CPCB, so only ind_cpcb points
    are used — a Universal-AQI point is on a different scale and is omitted rather
    than plotted as if it were CPCB. Malformed values are dropped too.
    """
    idx = {i["code"]: i for i in indexes}
    v = idx.get("ind_cpcb", {}).get("aqi")
    return v if valid_aqi(v) is not None else None


def air_quality_history(lat: float, lng: float, hours: int = 24) -> list[dict]:
    """Past hourly AQI (real, Google history:lookup)."""
    try:
        r = _request_with_retry(requests.post,
            f"https://airquality.googleapis.com/v1/history:lookup?key={settings.maps_api_key}",
            json={"location": {"latitude": lat, "longitude": lng}, "hours": hours, "extraComputations": ["LOCAL_AQI"]},
            timeout=20,
        )
        out = []
        for h in r.json().get("hoursInfo", []):
            aqi = _extract_aqi(h.get("indexes", []))
            dt = h.get("dateTime", "")
            if aqi is not None:
                out.append({"label": dt[11:16], "ts": dt, "aqi": aqi})
        out.reverse()  # oldest -> newest
        return out
    except Exception as e:  # noqa: BLE001
        telemetry.event("tool_fallback", tool="maps_aqi_history", fallbackUsed=True,
                        errorType=type(e).__name__)
        return []


def air_quality_forecast(lat: float, lng: float, hours: int = 24) -> list[dict]:
    """Future hourly AQI (real, Google forecast:lookup)."""
    from datetime import datetime, timedelta, timezone
    start = datetime.now(timezone.utc) + timedelta(hours=1)
    end = start + timedelta(hours=hours)
    try:
        r = _request_with_retry(requests.post,
            f"https://airquality.googleapis.com/v1/forecast:lookup?key={settings.maps_api_key}",
            json={"location": {"latitude": lat, "longitude": lng},
                  "period": {"startTime": start.strftime("%Y-%m-%dT%H:00:00Z"), "endTime": end.strftime("%Y-%m-%dT%H:00:00Z")},
                  "extraComputations": ["LOCAL_AQI"]},
            timeout=20,
        )
        out = []
        for h in r.json().get("hourlyForecasts", []):
            aqi = _extract_aqi(h.get("indexes", []))
            dt = h.get("dateTime", "")
            if aqi is not None:
                out.append({"label": dt[11:16], "aqi": aqi})
        return out
    except Exception as e:  # noqa: BLE001
        telemetry.event("tool_fallback", tool="maps_aqi_forecast", fallbackUsed=True,
                        errorType=type(e).__name__)
        return []


AMENITY_TYPES = ["restaurant", "cafe", "supermarket", "gym", "park", "shopping_mall"]
AMENITY_LABELS = {
    "restaurant": "Restaurants", "cafe": "Cafes", "supermarket": "Supermarkets",
    "gym": "Gyms", "park": "Parks", "shopping_mall": "Malls",
}


def _count_places(lat: float, lng: float, place_type: str) -> int | None:
    """Nearby count for a single amenity type within 1.5 km (capped at 20)."""
    try:
        r = _request_with_retry(requests.post,
            "https://places.googleapis.com/v1/places:searchNearby",
            headers={"X-Goog-Api-Key": settings.maps_api_key, "X-Goog-FieldMask": "places.id"},
            json={
                "includedTypes": [place_type],
                "maxResultCount": 20,
                "locationRestriction": {"circle": {"center": {"latitude": lat, "longitude": lng}, "radius": 1500.0}},
            },
            timeout=15,
        )
        payload = r.json()
        if payload.get("error"):
            raise RuntimeError(payload["error"].get("message", "Places request failed"))
        return len(payload.get("places", []))
    except Exception as e:  # noqa: BLE001
        telemetry.event("tool_fallback", tool="maps_count_places", placeType=place_type,
                        fallbackUsed=True, errorType=type(e).__name__)
        return None


def amenity_profile(lat: float, lng: float) -> dict:
    """Per-category amenity counts within 1.5 km.

    One call per type so the total isn't capped at the Places API's 20-result
    ceiling — that cap made every urban locality report exactly 20 and flattened
    the Lifestyle pillar. Separate counts actually differentiate areas.
    """
    with ThreadPoolExecutor(max_workers=len(AMENITY_TYPES)) as ex:
        counts = list(ex.map(lambda t: _count_places(lat, lng, t), AMENITY_TYPES))
    breakdown = dict(zip(AMENITY_TYPES, counts))
    failed = [kind for kind, count in breakdown.items() if count is None]
    available = [count for count in counts if count is not None]
    status = "live" if not failed else "partial" if available else "temporarily_unavailable"
    return {
        "total": sum(available) if available else None,
        "breakdown": breakdown,
        "status": status,
        "failedCategories": failed,
        "source": "Google Places API",
        "fetchedAt": _now_iso() if available else None,
    }


# --------------------------- essential services ---------------------------- #
# ADDITIVE, non-scored proximity signals for health-sensitive households. These
# are a SEPARATE list from AMENITY_TYPES on purpose: they must never feed
# amenity_count or the lifestyle subscore. Only supported Google Places types are
# used; any finer split (e.g. primary vs secondary school) is a display concern.
ESSENTIAL_TYPES = ["hospital", "doctor", "pharmacy", "school", "university"]
ESSENTIAL_LABELS = {
    "hospital": "Hospitals", "doctor": "Doctors", "pharmacy": "Pharmacies",
    "school": "Schools", "university": "Universities",
}
ESSENTIAL_SOURCE = "Google Places API"
_ESSENTIAL_RADIUS = 1500.0
_ESSENTIAL_TTL = 1800  # 30 min — Places density barely moves; avoid re-billing.
_essential_cache: dict[tuple, tuple[float, dict]] = {}
_ESSENTIAL_LIMITATION = (
    "Counts are capped at 20 per category within 1.5 km. "
    "Shown for context; not part of the FitScore."
)


def _essential_cache_key(lat: float, lng: float, radius: float, types: list[str]) -> tuple:
    """Cache identity: coordinates + radius + exact type set (order-independent).
    Freshness is enforced separately by comparing the stored timestamp to the TTL."""
    return (round(lat, 4), round(lng, 4), radius, tuple(sorted(types)))


def essential_profile(lat: float, lng: float) -> dict:
    """Per-category essential-services counts within 1.5 km, each wrapped in the
    full Phase 2 evidence envelope. Never touches AMENITY_TYPES/amenity_count.

    A single call fans out to up to five Places category calls on a cold cache;
    results are cached (coords + radius + type set + freshness) so repeat detail
    views do not re-bill. A total failure is never cached, so it can be retried.
    """
    key = _essential_cache_key(lat, lng, _ESSENTIAL_RADIUS, ESSENTIAL_TYPES)
    hit = _essential_cache.get(key)
    if hit and time.time() - hit[0] < _ESSENTIAL_TTL:
        return hit[1]

    with ThreadPoolExecutor(max_workers=len(ESSENTIAL_TYPES)) as ex:
        counts = list(ex.map(lambda t: _count_places(lat, lng, t), ESSENTIAL_TYPES))

    fetched = _now_iso()
    categories: dict[str, dict] = {}
    failed: list[str] = []
    for kind, count in zip(ESSENTIAL_TYPES, counts):
        ok = count is not None
        if not ok:
            failed.append(kind)
        categories[kind] = _envelope(
            f"essential_{kind}", count, "places_within_1.5km", ESSENTIAL_SOURCE,
            "live_google", "live" if ok else "temporarily_unavailable",
            fetched if ok else None, "1.5km_radius",
            "high" if ok else "unavailable", _ESSENTIAL_LIMITATION,
        )

    available = [c for c in counts if c is not None]
    status = "live" if not failed else "partial" if available else "temporarily_unavailable"
    result = {
        "categories": categories,
        "labels": ESSENTIAL_LABELS,
        "total": sum(available) if available else None,
        "status": status,
        "failedCategories": failed,
        "source": ESSENTIAL_SOURCE,
        "fetchedAt": fetched if available else None,
    }
    # Never cache a total failure — it must be retriable on the next view.
    if available:
        _essential_cache[key] = (time.time(), result)
    return result


SAFETY_PLACE_TYPES = {
    "police": {"label": "Police stations", "radius": 3000.0},
    "hospital": {"label": "Hospitals", "radius": 3000.0},
    "fire_station": {"label": "Fire stations", "radius": 5000.0},
}


def _distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance used only to report proximity, never route time."""
    dlat = radians(lat2 - lat1)
    dlng = radians(lng2 - lng1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    return 6371.0 * 2 * asin(sqrt(a))


def _nearby_safety_places(lat: float, lng: float, place_type: str, radius: float) -> dict | None:
    """Count and nearest straight-line distance for one emergency-service type."""
    try:
        r = _request_with_retry(requests.post,
            "https://places.googleapis.com/v1/places:searchNearby",
            headers={
                "X-Goog-Api-Key": settings.maps_api_key,
                "X-Goog-FieldMask": "places.id,places.location",
            },
            json={
                "includedTypes": [place_type],
                "maxResultCount": 20,
                "locationRestriction": {
                    "circle": {
                        "center": {"latitude": lat, "longitude": lng},
                        "radius": radius,
                    }
                },
            },
            timeout=15,
        )
        payload = r.json()
        if payload.get("error"):
            raise RuntimeError(payload["error"].get("message", "Places request failed"))
        places = payload.get("places", [])
        distances = []
        for place in places:
            location = place.get("location") or {}
            plat, plng = location.get("latitude"), location.get("longitude")
            if isinstance(plat, (int, float)) and isinstance(plng, (int, float)):
                distances.append(_distance_km(lat, lng, plat, plng))
        return {
            "count": len(places),
            "nearestDistanceKm": round(min(distances), 1) if distances else None,
            "radiusKm": round(radius / 1000),
        }
    except Exception as e:  # noqa: BLE001
        telemetry.event("tool_fallback", tool="maps_safety_places", placeType=place_type,
                        fallbackUsed=True, errorType=type(e).__name__)
        return None


def _emergency_access_score(signals: dict) -> int | None:
    """Transparent emergency resilience; never described as a crime rate."""
    weights = {"police": 40, "hospital": 35, "fire_station": 25}
    target_counts = {"police": 3, "hospital": 4, "fire_station": 2}
    available = {k: v for k, v in signals.items() if v is not None}
    if not available:
        return None
    earned = 0.0
    possible = 0.0
    for kind, signal in available.items():
        weight = weights[kind]
        possible += weight
        count_part = min(signal["count"] / target_counts[kind], 1.0) * 0.7
        distance = signal.get("nearestDistanceKm")
        # Full proximity credit at <=1 km, tapering to zero at the search radius.
        if distance is None:
            proximity_part = 0.0
        else:
            radius = max(float(signal["radiusKm"]), 1.0)
            proximity_part = max(0.0, min(1.0, (radius - distance) / max(radius - 1.0, 1.0))) * 0.3
        earned += weight * (count_part + proximity_part)
    return round(100 * earned / possible) if possible else None


def safety_profile(lat: float, lng: float) -> dict:
    """Live emergency-access evidence used where no curated safety exists."""
    kinds = list(SAFETY_PLACE_TYPES)
    with ThreadPoolExecutor(max_workers=len(kinds)) as ex:
        values = list(ex.map(
            lambda kind: _nearby_safety_places(
                lat, lng, kind, SAFETY_PLACE_TYPES[kind]["radius"],
            ),
            kinds,
        ))
    signals = dict(zip(kinds, values))
    available = sum(v is not None for v in values)
    status = "live" if available == len(kinds) else "partial" if available else "temporarily_unavailable"
    confidence = "high" if available == len(kinds) else "medium" if available == 2 else "low" if available else "unavailable"
    return {
        "status": status,
        "confidence": confidence,
        "emergencyAccessScore": _emergency_access_score(signals),
        "signals": signals,
        "source": "Google Places API",
        "fetchedAt": _now_iso() if available else None,
        "limitation": (
            "Measures access to emergency services, not crime incidence. Place counts are capped at 20 per category; "
            "nearest distance is straight-line, not travel time."
        ),
        "officialCrimeContext": {
            "source": "NCRB Crime in India 2022 via data.gov.in",
            "url": "https://www.data.gov.in/catalog/crime-india-2022",
            "scope": "city/state context only",
            "scored": False,
            "limitation": "No consistent open locality-level crime series is available, so NestIQ does not invent one.",
        },
    }


def locality_photo(query: str) -> str:
    """First Places photo resource name for a locality (used for card imagery)."""
    try:
        r = _request_with_retry(requests.post,
            "https://places.googleapis.com/v1/places:searchText",
            headers={"X-Goog-Api-Key": settings.maps_api_key, "X-Goog-FieldMask": "places.photos"},
            json={"textQuery": query},
            timeout=15,
        )
        for p in r.json().get("places", []):
            photos = p.get("photos", [])
            if photos:
                return photos[0]["name"]
        return ""
    except Exception as e:  # noqa: BLE001
        telemetry.event("tool_fallback", tool="maps_locality_photo", fallbackUsed=True,
                        errorType=type(e).__name__)
        return ""


def commute_minutes(o_lat: float, o_lng: float, d_lat: float, d_lng: float) -> int | None:
    """Driving time (with traffic) to the city work anchor."""
    try:
        r = _request_with_retry(requests.get,
            "https://maps.googleapis.com/maps/api/distancematrix/json",
            params={"origins": f"{o_lat},{o_lng}", "destinations": f"{d_lat},{d_lng}",
                    "mode": "driving", "departure_time": "now", "key": settings.maps_api_key},
            timeout=15,
        )
        payload = r.json()
        if payload.get("status") not in (None, "OK"):
            raise RuntimeError(payload.get("error_message") or payload["status"])
        el = payload["rows"][0]["elements"][0]
        if el.get("status") not in (None, "OK"):
            raise RuntimeError(el.get("status", "Distance Matrix element failed"))
        secs = el.get("duration_in_traffic", el.get("duration"))["value"]
        return round(secs / 60)
    except Exception as e:  # noqa: BLE001
        telemetry.event("tool_fallback", tool="maps_commute", fallbackUsed=True,
                        errorType=type(e).__name__)
        return None


# ------------------------------ feature builder ---------------------------- #
_refresh_lock = threading.Lock()
_refreshing: set[str] = set()
_build_locks: dict[str, threading.Lock] = {}


def _build_lock(city_id: str) -> threading.Lock:
    with _refresh_lock:
        return _build_locks.setdefault(city_id, threading.Lock())


def _fetch_features(city: dict) -> list[dict]:
    """All Google calls for a city fanned out in parallel (5 per locality)."""
    anchor = city["anchor"]
    locs = city["localities"]
    with ThreadPoolExecutor(max_workers=min(40, len(locs) * 5)) as ex:
        aq = [ex.submit(air_quality, l["lat"], l["lng"]) for l in locs]
        am = [ex.submit(amenity_profile, l["lat"], l["lng"]) for l in locs]
        cm = [ex.submit(commute_minutes, l["lat"], l["lng"], anchor["lat"], anchor["lng"]) for l in locs]
        ph = [ex.submit(locality_photo, l["name"]) for l in locs]
        sf = [ex.submit(safety_profile, l["lat"], l["lng"]) for l in locs]
        feats = []
        for i, loc in enumerate(locs):
            a = aq[i].result()
            prof = am[i].result()
            commute = cm[i].result()
            evidence_time = _now_iso()
            safety = sf[i].result()
            curated_safety = loc.get("safety")
            live_safety = safety.get("emergencyAccessScore") if safety else None
            safety_value = curated_safety if curated_safety is not None else live_safety
            safety_source = (
                "curated_proxy" if curated_safety is not None
                else "live_emergency_access_proxy" if live_safety is not None
                else "unavailable"
            )
            feats.append({
                "id": loc["id"], "name": loc["name"], "short": loc["short"], "accent": loc.get("accent", "#7C5CF6"),
                "lat": loc["lat"], "lng": loc["lng"],
                # A staged city may not have sourced rent yet. Omission runs
                # provisional; it is never replaced with a typed-in guess.
                "median_rent": loc.get("rent"),
                # Phase 11 cities carry rent from grounded search with citations.
                # Absent = curated, so the existing catalog is unchanged.
                "rentSource": loc.get("rentSource", "curated_market_estimate"),
                "rentEvidence": loc.get("rentEvidence"),
                "safety_est": safety_value,
                "safetySource": safety_source,
                "safetyDataStatus": (
                    "curated" if curated_safety is not None
                    else safety.get("status", "temporarily_unavailable") if safety
                    else "temporarily_unavailable"
                ),
                "safetyFetchedAt": safety.get("fetchedAt") if safety else None,
                "safety_profile": safety,
                "aqi": a.get("aqi"), "aqi_category": a.get("category", "Unknown"), "aqi_pollutant": a.get("dominant", ""),
                # Air provenance flows through to score_india's additive fields.
                "airIndexCode": a.get("indexCode"),
                "airDataStatus": a.get("status", "live" if a.get("aqi") is not None else "temporarily_unavailable"),
                "airSource": a.get("source", AIR_SOURCE),
                "airScoringMethod": a.get("scoringMethod", "cpcb"),
                "airStale": a.get("stale", False),
                "airFallbackUsed": a.get("fallbackUsed", False),
                "airFetchedAt": a.get("fetchedAt"),
                "amenity_count": prof["total"],
                "amenity_breakdown": prof["breakdown"],
                "amenityDataStatus": prof.get("status", "live" if prof.get("total") is not None else "temporarily_unavailable"),
                "amenityFailedCategories": prof.get("failedCategories", []),
                "amenitySource": prof.get("source", "Google Places API"),
                "amenityFetchedAt": prof.get("fetchedAt"),
                "commute_min": commute,
                "commuteDataStatus": "live" if commute is not None else "temporarily_unavailable",
                "commuteSource": "Google Maps Distance Matrix",
                "commuteFetchedAt": evidence_time if commute is not None else None,
                "photo": ph[i].result(),
            })
    return feats


def _refresh_in_background(city_id: str, city: dict) -> None:
    """Rebuild an expired city cache off the request thread (deduped)."""
    with _refresh_lock:
        if city_id in _refreshing:
            return
        _refreshing.add(city_id)

    def work():
        try:
            feats = _fetch_features(city)
            if feats:
                _cache[city_id] = (time.time(), feats)
        finally:
            with _refresh_lock:
                _refreshing.discard(city_id)

    threading.Thread(target=work, daemon=True).start()


def build_city_features(city_id: str) -> list[dict]:
    """Live per-locality metrics for a city.

    Cached 30 min; an expired cache is served immediately (stale-while-
    revalidate) so users never wait on the Google fan-out after first load.
    """
    city = get_city(city_id)
    if not city:
        return []

    cached = _cache.get(city_id)
    if cached:
        if time.time() - cached[0] >= _TTL:
            _refresh_in_background(city_id, city)
        return cached[1]

    # Cold build: concurrent requests for the same city wait on one fan-out
    # instead of each hammering Google.
    with _build_lock(city_id):
        cached = _cache.get(city_id)
        if cached:
            return cached[1]
        feats = _fetch_features(city)
        if feats:
            _cache[city_id] = (time.time(), feats)
        return feats


def built_at(city_id: str) -> float | None:
    """Timestamp of the current cached build for a city (None if never built).

    Lets callers log a BigQuery snapshot only when the underlying data actually
    changed, instead of re-logging identical rows on every request.
    """
    cached = _cache.get(city_id)
    return cached[0] if cached else None


# Cross-sectional anomaly flags: a locality is flagged when one of its raw
# metrics is a statistical outlier (>= 1.5 sigma) versus the rest of the city.
# Serves the PS requirement to "identify patterns, trends, and anomalies", and
# is free — it reuses metrics already fetched, with no extra API calls.
_ANOMALY_Z = 1.5
# metric -> (pillar, high_label, high_kind, low_label, low_kind, formatter)
_ANOMALY_METRICS = {
    "aqi": ("air_quality", "Unusually polluted", "bad", "Unusually clean air", "good", lambda v: f"AQI {round(v)}"),
    "median_rent": ("affordability", "Premium priced", "bad", "Unusually affordable", "good", lambda v: f"₹{int(v):,}/mo"),
    "commute_min": ("commute", "Unusually far", "bad", "Unusually central", "good", lambda v: f"{round(v)} min to hub"),
    "amenity_count": ("lifestyle", "Amenity hotspot", "good", "Sparse amenities", "bad", lambda v: f"{int(v)} amenities"),
    "safety_est": ("safety", "Standout safety", "good", "Below-average safety", "bad", lambda v: f"safety {int(v)}"),
}


def _anomaly_flags(features: list[dict]) -> list[list[dict]]:
    """One list of anomaly flags per locality, aligned with `features`."""
    n = len(features)
    out: list[list[dict]] = [[] for _ in range(n)]
    if n < 4:  # too few localities for a meaningful distribution
        return out
    for metric, (pillar, hi_label, hi_kind, lo_label, lo_kind, fmt) in _ANOMALY_METRICS.items():
        vals = [f.get(metric) for f in features]
        if any(v is None for v in vals):
            continue
        mean = statistics.fmean(vals)
        sd = statistics.pstdev(vals)
        if sd <= 0:
            continue
        for i, v in enumerate(vals):
            z = (v - mean) / sd
            if z >= _ANOMALY_Z:
                label, kind, direction = hi_label, hi_kind, "above"
            elif z <= -_ANOMALY_Z:
                label, kind, direction = lo_label, lo_kind, "below"
            else:
                continue
            out[i].append({
                "pillar": pillar,
                "label": label,
                "kind": kind,
                "detail": f"{fmt(v)}, {abs(z):.1f}σ {direction} the city average",
                "z": round(abs(z), 2),
            })
    for i in range(n):  # keep the two strongest flags per locality
        out[i].sort(key=lambda a: a["z"], reverse=True)
        out[i] = out[i][:2]
    return out


def score_india(features: list[dict], weights: dict | None = None, budget: float = 30000) -> list[dict]:
    if not features:
        return []
    w = {**INDIA_WEIGHTS, **(weights or {})}

    # Air quality is scored ABSOLUTELY against CPCB health bands (see
    # air_quality.py), so a Severe locality can never be lifted to the top of the
    # band by relative comparison. Cross-locality position is exposed separately
    # as airRelativeRank and never folded back into the health score. The other
    # four pillars remain relative min-max across the candidate set.
    # CPCB health scoring only applies to the CPCB index. A Universal-AQI (uaqi)
    # reading is on a different scale/direction and must NOT be scored as CPCB;
    # its health score is left unavailable and the air pillar is treated as
    # missing. A None index_code (legacy/test features carrying 0-500 values) is
    # assumed CPCB. Only CPCB AQIs feed the cross-city relative rank.
    def cpcb_ok(f):
        return f.get("airIndexCode") in (None, "ind_cpcb")

    cpcb_aqis = [f.get("aqi") if cpcb_ok(f) else None for f in features]
    air_scores = [air_health_score(a) for a in cpcb_aqis]
    ranks = air_relative_ranks(cpcb_aqis)
    def sparse_minmax(values, invert=False):
        """Min-max available values while preserving None at its original index."""
        valid = [v for v in values if v is not None]
        if not valid:
            return [None for _ in values]
        scored = iter(_minmax(valid, invert=invert))
        return [next(scored) if v is not None else None for v in values]

    commute_values = [
        f.get("commute_min")
        if f.get("commuteDataStatus", "live" if f.get("commute_min") is not None else "temporarily_unavailable") == "live"
        else None
        for f in features
    ]
    amenity_values = [
        f.get("amenity_count")
        if f.get("amenityDataStatus", "live" if f.get("amenity_count") is not None else "temporarily_unavailable") == "live"
        else None
        for f in features
    ]
    rel = {
        # sparse_minmax: a locality with no sourced rent yields None (-> provisional
        # + reduced coverage) instead of raising on the arithmetic below.
        "affordability": sparse_minmax(
            [budget - f["median_rent"] if f.get("median_rent") is not None else None
             for f in features]),
        # sparse_minmax, not _minmax: a city without a safety source must yield
        # None (-> provisional + reduced coverage) rather than raise. With every
        # value present this delegates to _minmax on an identical list, so the
        # existing cities are unchanged by construction.
        "safety": sparse_minmax([f.get("safety_est") for f in features]),
        "commute": sparse_minmax(commute_values, invert=True),
        "lifestyle": sparse_minmax(amenity_values),
    }
    anoms = _anomaly_flags(features)
    out = []
    for i, f in enumerate(features):
        subscores = {
            "affordability": rel["affordability"][i],
            "safety": rel["safety"][i],
            "commute": rel["commute"][i],
            "lifestyle": rel["lifestyle"][i],
            "air_quality": air_scores[i],  # absolute CPCB; None when AQI missing/UAQI
        }
        # Weighted FitScore over pillars that actually have a value, so a missing
        # air signal never fabricates a number and never silently zeroes a pillar.
        avail = {k: v for k, v in subscores.items() if v is not None}
        wsum = sum(w[k] for k in avail) or 1.0
        fit = round(sum(avail[k] * w[k] for k in avail) / wsum)
        # Incomplete-score semantics: a missing high-priority pillar must never
        # silently read as a normal match. Keep the numeric score (compatibility)
        # but flag it provisional and report coverage.
        missing = [k for k in INDIA_KEYS if subscores[k] is None]
        total_w = sum(w[k] for k in INDIA_KEYS) or 1.0
        coverage = round(100 * sum(w[k] for k in avail) / total_w)
        status = "provisional" if missing else "complete"
        match = _match(fit)
        aqi = f.get("aqi")
        scored_cpcb = cpcb_ok(f)
        out.append({
            **f,
            "subscores": subscores,
            "fitScore": fit,
            "match": match,
            "matchDisplay": f"Provisional {match}" if missing else match,
            "fitScoreDataStatus": status,
            "missingPillars": missing,
            "coveragePercent": coverage,
            "evidence": metric_evidence(f),
            "anomalies": anoms[i],
            # Additive air-provenance fields. Existing consumers keep reading
            # subscores.air_quality / fitScore / match unchanged.
            "airHealthScore": air_scores[i],
            "airHealthBand": cpcb_band(aqi) if scored_cpcb else None,
            "airRelativeRank": ranks[i],
            "criticalRisks": critical_risks(aqi) if scored_cpcb else [],
            "airIndexCode": f.get("airIndexCode"),
            "airScoringMethod": "cpcb" if (scored_cpcb and air_scores[i] is not None) else "none",
            "airDataStatus": f.get("airDataStatus") or ("live" if aqi is not None else "temporarily_unavailable"),
            "airStale": bool(f.get("airStale")),
            "airFallbackUsed": bool(f.get("airFallbackUsed")),
            "airSource": f.get("airSource") or "Google Air Quality API (CPCB AQI)",
            "airFetchedAt": f.get("airFetchedAt"),
        })
    out.sort(key=lambda x: x["fitScore"], reverse=True)
    return out
