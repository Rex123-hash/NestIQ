"""NestIQ API — FastAPI on Cloud Run.

City-aware decision-intelligence endpoints. Indian cities are powered live by
Google Maps (Air Quality, Places, Distance Matrix); New York is powered by the
real BigQuery + BQML pipeline.
"""
from __future__ import annotations

import json
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
    return f"an air quality index (AQI) of {r.get('aqi')} — {r.get('aqi_category', '')}"


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
    if city != NYC:
        bq_india.log_snapshot_safe(city, results)
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
        time.sleep(0.2)

        yield sse("agent", {"id": "collect", "name": "Data Collector", "status": "running",
                            "msg": "Fetching live Google signals (AQI · Places · Distance Matrix)…"})
        results = rank(city, w, parsed["budget"])
        yield sse("agent", {"id": "collect", "name": "Data Collector", "status": "done",
                            "msg": f"Gathered live data for {len(results)} localities"})
        time.sleep(0.2)

        for aid, name, sub, field, pick, headline in PILLAR_AGENTS:
            yield sse("agent", {"id": aid, "name": name, "status": "running", "msg": "Scoring localities…"})
            time.sleep(0.25)
            valid = [r for r in results if r.get(field) is not None]
            best = pick(valid, key=lambda r: r[field]) if valid else None
            weight = w.get(sub, 0)
            msg = headline(best) if best else "no data"
            yield sse("agent", {"id": aid, "name": name, "status": "done", "msg": msg, "weight": weight})

        yield sse("agent", {"id": "orch", "name": "Orchestrator", "status": "running",
                            "msg": "Combining agent scores into weighted FitScores…"})
        time.sleep(0.25)
        top = results[0] if results else None
        yield sse("agent", {"id": "orch", "name": "Orchestrator", "status": "done",
                            "msg": f"Top match: {top['name']} (FitScore {top['fitScore']})" if top else "no results"})

        if city != NYC:
            bq_india.log_snapshot_safe(city, results)
        yield sse("final", {"preferences": parsed, "results": results, "city": city})

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/api/neighborhoods")
def neighborhoods(city: str = DEFAULT_CITY):
    results = rank(city, default_weights(city), None)
    if city != NYC:
        bq_india.log_snapshot_safe(city, results)
    return {"results": results, "city": city}


@app.get("/api/neighborhood/{nid}")
def neighborhood(nid: str, city: str = DEFAULT_CITY):
    ranked = rank(city, default_weights(city), None)
    match = next((r for r in ranked if r["id"] == nid), None)
    if not match:
        raise HTTPException(404, "neighborhood not found")
    match["why"] = gemini.explain(match["name"], match["subscores"], match["median_rent"], note_for(city, match))
    if city == NYC:
        match["rentSeries"] = bq.get_rent_series(nid)
    else:
        match["aqiSeries"] = {
            "history": maps.air_quality_history(match["lat"], match["lng"]),
            "forecast": maps.air_quality_forecast(match["lat"], match["lng"]),
            "bqmlForecast": bq_india.aqi_forecast_bqml(nid),
        }
    return match


@app.post("/api/ask")
def ask(req: AskRequest):
    city = req.city or DEFAULT_CITY

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
        ctx = f"Locality {feats[req.neighborhoodId]['name']}: {feats[req.neighborhoodId]}"
    else:
        ctx = f"All localities in {city}: {list(feats.values())}"
    sources = ["Google Air Quality API", "Google Places", "Google Maps", "Gemini"] if city != NYC else ["NYC 311", "NYPD collisions", "Zillow ZORI", "BigQuery ML"]
    return {"answer": gemini.ask(req.question, ctx), "sources": sources}
