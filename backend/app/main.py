"""NestIQ API — FastAPI on Cloud Run.

City-aware decision-intelligence endpoints. Indian cities are powered live by
Google Maps (Air Quality, Places, Distance Matrix); New York is powered by the
real BigQuery + BQML pipeline.
"""
from __future__ import annotations

import json
import threading
import time

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from . import bq, gemini, maps, bq_india
from .config import settings
from .fitscore import score_neighborhoods, DEFAULT_WEIGHTS
from .india import city_list, get_city
from .schemas import SearchRequest, AskRequest

app = FastAPI(title="NestIQ API", version="2.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

NYC = "new-york"
DEFAULT_CITY = "delhi-ncr"

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


@app.on_event("startup")
def warm_default_city_cache():
    # Pre-fetch the default city's Google signals and spin up the Vertex client
    # so the first user request after a (re)start doesn't pay cold-start costs.
    def warm():
        maps.build_city_features(DEFAULT_CITY)
        try:
            gemini.parse_query("warmup: flat with clean air")
        except Exception as e:  # noqa: BLE001
            print(f"[warmup] gemini skipped: {e}")

    threading.Thread(target=warm, daemon=True).start()


def all_cities():
    # India-first: New York remains supported by the API but is no longer listed.
    return city_list()


def default_weights(city: str) -> dict:
    return dict(DEFAULT_WEIGHTS) if city == NYC else dict(gemini.INDIA_DEFAULT)


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
    return f"an air quality index (AQI) of {r.get('aqi')}, {r.get('aqi_category', '')}"


@app.get("/api/health")
def health():
    return {"ok": True, "project": settings.gcp_project, "cities": [c["id"] for c in all_cities()]}


@app.get("/api/cities")
def cities():
    return {"cities": all_cities(), "default": DEFAULT_CITY}


@app.get("/api/config")
def config():
    return {"mapsKey": settings.maps_api_key}


@app.post("/api/search")
def search(req: SearchRequest):
    city = req.city or DEFAULT_CITY
    parsed = gemini.parse_query(req.query, req.budget)
    results = rank(city, parsed["weights"], parsed["budget"])
    maybe_log_snapshot(city, results)
    return {"preferences": parsed, "results": results, "city": city}


# Fan-out agents: each owns one pillar and reports a headline finding.
PILLAR_AGENTS = [
    ("air", "Air Quality Agent", "air_quality", "aqi", min, lambda r: f"cleanest air: {r['name']} (AQI {r.get('aqi')})"),
    ("aff", "Affordability Agent", "affordability", "median_rent", min, lambda r: f"cheapest: {r['name']} (₹{r.get('median_rent'):,}/mo)"),
    ("com", "Commute Agent", "commute", "commute_min", min, lambda r: f"fastest commute: {r['name']} ({r.get('commute_min')} min)"),
    ("life", "Lifestyle Agent", "lifestyle", "amenity_count", max, lambda r: f"most amenities: {r['name']} ({r.get('amenity_count')} nearby)"),
    ("safe", "Safety Agent", "safety", "safety_est", max, lambda r: f"safest: {r['name']}"),
]


@app.get("/api/search/stream")
def search_stream(q: str = "", city: str = DEFAULT_CITY):
    """Server-Sent Events: shows the fan-out agents working, then final results."""
    def sse(event: str, data: dict) -> str:
        return f"event: {event}\ndata: {json.dumps(data)}\n\n"

    def gen():
        yield sse("agent", {"id": "planner", "name": "Planner", "status": "running",
                            "msg": "Understanding your request with Gemini…"})
        parsed = gemini.parse_query(q, None)
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
        return {**match, **cached[1]}

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


@app.get("/api/neighborhood/{nid}/reviews")
def neighborhood_reviews(nid: str, city: str = DEFAULT_CITY):
    """What residents say online (Gemini + Google Search grounding, cited)."""
    ranked = rank(city, default_weights(city), None)
    match = next((r for r in ranked if r["id"] == nid), None)
    if not match:
        raise HTTPException(404, "neighborhood not found")

    key = (city, nid)
    cached = _reviews_cache.get(key)
    if cached and time.time() - cached[0] < _REVIEWS_TTL:
        return cached[1]

    city_obj = get_city(city)
    data = gemini.web_reviews(match["name"], city_obj["name"] if city_obj else city)
    _reviews_cache[key] = (time.time(), data)
    return data


# Only the fields useful to the assistant — keeps the Gemini prompt small and
# free of noise (lat/lng, photo resource names, accent colours, breakdowns).
_ASK_FIELDS = ("name", "median_rent", "aqi", "aqi_category", "amenity_count",
               "commute_min", "safety_est", "subscores", "fitScore")


def _slim(f: dict) -> dict:
    return {k: f.get(k) for k in _ASK_FIELDS if f.get(k) is not None}


# Short-TTL cache so an identical question (e.g. a judge re-asking) is instant
# and doesn't re-bill Gemini + BigQuery.
_ask_cache: dict[tuple[str, str, str], tuple[float, dict]] = {}
_ASK_TTL = 600


@app.post("/api/ask")
def ask(req: AskRequest):
    city = req.city or DEFAULT_CITY
    key = (city, req.neighborhoodId or "", (req.question or "").strip().lower())
    cached = _ask_cache.get(key)
    if cached and time.time() - cached[0] < _ASK_TTL:
        return cached[1]

    resp = _ask(city, req)
    if resp.get("answer"):
        _ask_cache[key] = (time.time(), resp)
    return resp


def _ask(city: str, req: AskRequest) -> dict:
    # India + a cross-locality question -> real NL->SQL over BigQuery, with the SQL shown.
    if city != NYC and not req.neighborhoodId:
        try:
            bq_india.ensure_ready()
            sql = gemini.nl_to_sql(req.question, city, bq_india.LOCALITIES_LATEST)
            rows = bq_india.analytics_query(sql, city)
            if rows:
                answer = gemini.ask(req.question, f"BigQuery query returned these rows: {rows}")
                return {"answer": answer, "sql": sql, "rows": rows[:8],
                        "sources": ["BigQuery (NL→SQL)", "india_localities_latest view", "Gemini on Vertex AI"]}
        except Exception as e:  # noqa: BLE001
            print(f"[ask] NL->SQL fallback: {e}")

    feats = {f["id"]: f for f in rank(city, default_weights(city), None)}
    if req.neighborhoodId and req.neighborhoodId in feats:
        ctx = f"Locality {feats[req.neighborhoodId]['name']}: {_slim(feats[req.neighborhoodId])}"
    else:
        ctx = f"All localities in {city}: {[_slim(f) for f in feats.values()]}"
    sources = ["Google Air Quality API", "Google Places", "Google Maps", "Gemini"] if city != NYC else ["NYC 311", "NYPD collisions", "Zillow ZORI", "BigQuery ML"]
    return {"answer": gemini.ask(req.question, ctx), "sources": sources}
