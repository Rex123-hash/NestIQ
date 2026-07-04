"""BigQuery read layer — the API's window onto the real data."""
from __future__ import annotations

from google.cloud import bigquery

from .config import settings
from .neighborhoods import BY_ID

_client: bigquery.Client | None = None
_features_cache: list[dict] | None = None


def client() -> bigquery.Client:
    global _client
    if _client is None:
        _client = bigquery.Client(project=settings.gcp_project, location="US")
    return _client


def get_features(refresh: bool = False) -> list[dict]:
    """Raw per-neighborhood metrics from neighborhood_features (cached)."""
    global _features_cache
    if _features_cache is None or refresh:
        rows = client().query(f"SELECT * FROM `{settings.dataset_ref}.neighborhood_features`").result()
        _features_cache = [dict(r) for r in rows]
    return _features_cache


def meta(nid: str) -> dict:
    n = BY_ID.get(nid, {})
    return {"id": nid, "name": n.get("name", nid), "short": n.get("short", nid),
            "accent": n.get("accent", "#7C5CF6"), "lat": n.get("lat"), "lng": n.get("lng"),
            "borough": n.get("borough")}


def get_rent_series(neighborhood: str) -> dict:
    """Historical ZORI + ARIMA_PLUS forecast for a neighborhood's charts."""
    cfg = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("n", "STRING", neighborhood)]
    )
    hist = client().query(
        f"""SELECT FORMAT_DATE('%b %Y', month) AS label, ROUND(rent) AS rent
            FROM `{settings.dataset_ref}.zori_neighborhood`
            WHERE neighborhood=@n ORDER BY month DESC LIMIT 12""", cfg
    ).result()
    fc = client().query(
        f"""SELECT FORMAT_TIMESTAMP('%b %Y', month) AS label, ROUND(rent) AS rent
            FROM `{settings.dataset_ref}.rent_forecast`
            WHERE neighborhood=@n ORDER BY month""", cfg
    ).result()
    history = [dict(r) for r in hist][::-1]
    forecast = [dict(r) for r in fc]
    return {"history": history, "forecast": forecast}
