"""Google Maps Platform integration for Indian cities.

Fetches LIVE air quality, amenity density, and commute time per locality, then
scores them with a FitScore that swaps the NYC 'Trend' pillar for 'Air Quality'
(the defining Delhi-NCR/APAC livability factor).
"""
from __future__ import annotations

import statistics
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import requests

from .config import settings
from .fitscore import _minmax, _match
from .india import get_city, INDIA_DEFAULT_WEIGHTS as INDIA_WEIGHTS

INDIA_KEYS = list(INDIA_WEIGHTS.keys())

_cache: dict[str, tuple[float, list[dict]]] = {}
_TTL = 1800  # 30 min


# --------------------------- individual Maps calls ------------------------- #
def air_quality(lat: float, lng: float) -> dict:
    """India CPCB AQI (falls back to Universal AQI). Lower is better."""
    try:
        r = requests.post(
            f"https://airquality.googleapis.com/v1/currentConditions:lookup?key={settings.maps_api_key}",
            json={"location": {"latitude": lat, "longitude": lng}, "extraComputations": ["LOCAL_AQI"]},
            timeout=15,
        )
        idx = {i["code"]: i for i in r.json().get("indexes", [])}
        chosen = idx.get("ind_cpcb") or idx.get("uaqi") or {}
        return {"aqi": chosen.get("aqi", 150), "category": chosen.get("category", "Unknown"),
                "dominant": chosen.get("dominantPollutant", "")}
    except Exception as e:  # noqa: BLE001
        print(f"[maps] air_quality fallback: {e}")
        return {"aqi": 150, "category": "Unknown", "dominant": ""}


def _extract_aqi(indexes: list) -> int | None:
    idx = {i["code"]: i for i in indexes}
    ch = idx.get("ind_cpcb") or idx.get("uaqi") or {}
    return ch.get("aqi")


def air_quality_history(lat: float, lng: float, hours: int = 24) -> list[dict]:
    """Past hourly AQI (real, Google history:lookup)."""
    try:
        r = requests.post(
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
        print(f"[maps] aqi_history fallback: {e}")
        return []


def air_quality_forecast(lat: float, lng: float, hours: int = 24) -> list[dict]:
    """Future hourly AQI (real, Google forecast:lookup)."""
    from datetime import datetime, timedelta, timezone
    start = datetime.now(timezone.utc) + timedelta(hours=1)
    end = start + timedelta(hours=hours)
    try:
        r = requests.post(
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
        print(f"[maps] aqi_forecast fallback: {e}")
        return []


AMENITY_TYPES = ["restaurant", "cafe", "supermarket", "gym", "park", "shopping_mall"]
AMENITY_LABELS = {
    "restaurant": "Restaurants", "cafe": "Cafes", "supermarket": "Supermarkets",
    "gym": "Gyms", "park": "Parks", "shopping_mall": "Malls",
}


def _count_places(lat: float, lng: float, place_type: str) -> int:
    """Nearby count for a single amenity type within 1.5 km (capped at 20)."""
    try:
        r = requests.post(
            "https://places.googleapis.com/v1/places:searchNearby",
            headers={"X-Goog-Api-Key": settings.maps_api_key, "X-Goog-FieldMask": "places.id"},
            json={
                "includedTypes": [place_type],
                "maxResultCount": 20,
                "locationRestriction": {"circle": {"center": {"latitude": lat, "longitude": lng}, "radius": 1500.0}},
            },
            timeout=15,
        )
        return len(r.json().get("places", []))
    except Exception as e:  # noqa: BLE001
        print(f"[maps] _count_places {place_type} fallback: {e}")
        return 0


def amenity_profile(lat: float, lng: float) -> dict:
    """Per-category amenity counts within 1.5 km.

    One call per type so the total isn't capped at the Places API's 20-result
    ceiling — that cap made every urban locality report exactly 20 and flattened
    the Lifestyle pillar. Separate counts actually differentiate areas.
    """
    with ThreadPoolExecutor(max_workers=len(AMENITY_TYPES)) as ex:
        counts = list(ex.map(lambda t: _count_places(lat, lng, t), AMENITY_TYPES))
    breakdown = dict(zip(AMENITY_TYPES, counts))
    return {"total": sum(counts), "breakdown": breakdown}


def locality_photo(query: str) -> str:
    """First Places photo resource name for a locality (used for card imagery)."""
    try:
        r = requests.post(
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
        print(f"[maps] locality_photo fallback: {e}")
        return ""


def commute_minutes(o_lat: float, o_lng: float, d_lat: float, d_lng: float) -> int:
    """Driving time (with traffic) to the city work anchor."""
    try:
        r = requests.get(
            "https://maps.googleapis.com/maps/api/distancematrix/json",
            params={"origins": f"{o_lat},{o_lng}", "destinations": f"{d_lat},{d_lng}",
                    "mode": "driving", "departure_time": "now", "key": settings.maps_api_key},
            timeout=15,
        )
        el = r.json()["rows"][0]["elements"][0]
        secs = el.get("duration_in_traffic", el.get("duration"))["value"]
        return round(secs / 60)
    except Exception as e:  # noqa: BLE001
        print(f"[maps] commute fallback: {e}")
        return 40


# ------------------------------ feature builder ---------------------------- #
_refresh_lock = threading.Lock()
_refreshing: set[str] = set()
_build_locks: dict[str, threading.Lock] = {}


def _build_lock(city_id: str) -> threading.Lock:
    with _refresh_lock:
        return _build_locks.setdefault(city_id, threading.Lock())


def _fetch_features(city: dict) -> list[dict]:
    """All Google calls for a city fanned out in parallel (4 per locality)."""
    anchor = city["anchor"]
    locs = city["localities"]
    with ThreadPoolExecutor(max_workers=min(32, len(locs) * 4)) as ex:
        aq = [ex.submit(air_quality, l["lat"], l["lng"]) for l in locs]
        am = [ex.submit(amenity_profile, l["lat"], l["lng"]) for l in locs]
        cm = [ex.submit(commute_minutes, l["lat"], l["lng"], anchor["lat"], anchor["lng"]) for l in locs]
        ph = [ex.submit(locality_photo, l["name"]) for l in locs]
        feats = []
        for i, loc in enumerate(locs):
            a = aq[i].result()
            prof = am[i].result()
            feats.append({
                "id": loc["id"], "name": loc["name"], "short": loc["short"], "accent": loc.get("accent", "#7C5CF6"),
                "lat": loc["lat"], "lng": loc["lng"],
                "median_rent": loc["rent"],
                "safety_est": loc["safety"],
                "aqi": a["aqi"], "aqi_category": a["category"], "aqi_pollutant": a["dominant"],
                "amenity_count": prof["total"],
                "amenity_breakdown": prof["breakdown"],
                "commute_min": cm[i].result(),
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
    wsum = sum(w[k] for k in INDIA_KEYS) or 1.0

    sub = {
        "affordability": _minmax([budget - f["median_rent"] for f in features]),
        "safety": _minmax([f["safety_est"] for f in features]),
        "commute": _minmax([f["commute_min"] for f in features], invert=True),
        "lifestyle": _minmax([f["amenity_count"] for f in features]),
        "air_quality": _minmax([f["aqi"] for f in features], invert=True),  # lower AQI = better
    }
    anoms = _anomaly_flags(features)
    out = []
    for i, f in enumerate(features):
        subscores = {k: sub[k][i] for k in INDIA_KEYS}
        fit = round(sum(subscores[k] * w[k] for k in INDIA_KEYS) / wsum)
        out.append({**f, "subscores": subscores, "fitScore": fit, "match": _match(fit), "anomalies": anoms[i]})
    out.sort(key=lambda x: x["fitScore"], reverse=True)
    return out
