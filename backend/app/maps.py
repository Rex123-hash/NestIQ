"""Google Maps Platform integration for Indian cities.

Fetches LIVE air quality, amenity density, and commute time per locality, then
scores them with a FitScore that swaps the NYC 'Trend' pillar for 'Air Quality'
(the defining Delhi-NCR/APAC livability factor).
"""
from __future__ import annotations

import time

import requests

from .config import settings
from .fitscore import _minmax, _match
from .india import get_city

INDIA_WEIGHTS = {"affordability": 20, "safety": 20, "commute": 20, "lifestyle": 15, "air_quality": 25}
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


def amenity_count(lat: float, lng: float) -> int:
    """Count of nearby amenities (Places Nearby, New)."""
    try:
        r = requests.post(
            "https://places.googleapis.com/v1/places:searchNearby",
            headers={"X-Goog-Api-Key": settings.maps_api_key, "X-Goog-FieldMask": "places.id"},
            json={
                "includedTypes": ["restaurant", "cafe", "supermarket", "gym", "park", "shopping_mall"],
                "maxResultCount": 20,
                "locationRestriction": {"circle": {"center": {"latitude": lat, "longitude": lng}, "radius": 1500.0}},
            },
            timeout=15,
        )
        return len(r.json().get("places", []))
    except Exception as e:  # noqa: BLE001
        print(f"[maps] amenity_count fallback: {e}")
        return 10


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
def build_city_features(city_id: str) -> list[dict]:
    """Live per-locality metrics for a city (cached 30 min)."""
    cached = _cache.get(city_id)
    if cached and time.time() - cached[0] < _TTL:
        return cached[1]

    city = get_city(city_id)
    if not city:
        return []
    anchor = city["anchor"]
    feats = []
    for loc in city["localities"]:
        aq = air_quality(loc["lat"], loc["lng"])
        feats.append({
            "id": loc["id"], "name": loc["name"], "short": loc["short"], "accent": loc["accent"],
            "lat": loc["lat"], "lng": loc["lng"],
            "median_rent": loc["rent"],
            "safety_est": loc["safety"],
            "aqi": aq["aqi"], "aqi_category": aq["category"], "aqi_pollutant": aq["dominant"],
            "amenity_count": amenity_count(loc["lat"], loc["lng"]),
            "commute_min": commute_minutes(loc["lat"], loc["lng"], anchor["lat"], anchor["lng"]),
            "photo": locality_photo(loc["name"]),
        })
    _cache[city_id] = (time.time(), feats)
    return feats


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
    out = []
    for i, f in enumerate(features):
        subscores = {k: sub[k][i] for k in INDIA_KEYS}
        fit = round(sum(subscores[k] * w[k] for k in INDIA_KEYS) / wsum)
        out.append({**f, "subscores": subscores, "fitScore": fit, "match": _match(fit)})
    out.sort(key=lambda x: x["fitScore"], reverse=True)
    return out
