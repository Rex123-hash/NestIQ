"""BigQuery + BQML spine for the India path.

Two tables, both fed by live Google data:
  * india_localities   — a snapshot of every locality's current features each run
                         (the platform builds its own dataset; powers NL->SQL).
  * india_aqi_history  — real hourly AQI per locality, appended each run so the
                         series self-accumulates for the ARIMA_PLUS forecast.

Everything degrades gracefully: if BigQuery is unavailable the API still works
off the live Maps path — this layer is additive.
"""
from __future__ import annotations

import threading
from datetime import datetime, timezone

from google.cloud import bigquery

from .bq import client
from .config import settings
from .sql_guard import validate_analytics_sql, SqlGuardError, MAX_ROWS
from . import telemetry

LOCALITIES = "india_localities"
LOCALITIES_LATEST = "india_localities_latest"
AQI_HISTORY = "india_aqi_history"
AQI_MODEL = "india_aqi_model"

_ready = False


def _ref(table: str) -> str:
    return f"{settings.dataset_ref}.{table}"


def ensure_tables() -> None:
    """Create the India tables if they don't exist (idempotent DDL)."""
    c = client()
    c.query(
        f"""
        CREATE TABLE IF NOT EXISTS `{_ref(LOCALITIES)}` (
          snapshot_ts TIMESTAMP, city STRING, id STRING, name STRING,
          lat FLOAT64, lng FLOAT64, median_rent INT64, aqi INT64,
          aqi_category STRING, amenity_count INT64, commute_min INT64,
          safety_est INT64, sub_affordability FLOAT64, sub_safety FLOAT64,
          sub_commute FLOAT64, sub_lifestyle FLOAT64, sub_air_quality FLOAT64,
          fit_score INT64
        )
        """
    ).result()
    c.query(
        f"""
        CREATE TABLE IF NOT EXISTS `{_ref(AQI_HISTORY)}` (
          city STRING, id STRING, name STRING, ts TIMESTAMP, aqi FLOAT64
        )
        """
    ).result()


# Dedup CTE (newest snapshot per locality). Injected in front of NL->SQL queries
# so analytics run on one row per locality — no VIEW needed (BigQuery sandbox
# blocks view creation without billing).
def _latest_cte() -> str:
    return (
        f"WITH {LOCALITIES_LATEST} AS (\n"
        f"  SELECT * EXCEPT(rn) FROM (\n"
        f"    SELECT *, ROW_NUMBER() OVER (PARTITION BY city, id ORDER BY snapshot_ts DESC) rn\n"
        f"    FROM `{_ref(LOCALITIES)}`\n"
        f"  ) WHERE rn = 1\n"
        f")\n"
    )


# Hard ceiling on bytes a single NL->SQL question may scan/bill. max_results caps rows
# RETURNED, not bytes SCANNED, so this (plus the dry run below) is the real cost control.
MAX_QUERY_BYTES = 100 * 1024 * 1024  # 100 MB


def analytics_query(select_sql: str, city: str | None = None) -> list[dict]:
    """Run a validated, cost-capped Gemini-generated SELECT against the latest-snapshot CTE.

    Order matters: validate first (nothing invalid ever reaches BigQuery), then dry-run
    to measure bytes, then execute with maximum_bytes_billed as a backstop.
    """
    safe_sql = validate_analytics_sql(select_sql)

    params = []
    if city and "@city" in safe_sql:
        params = [bigquery.ScalarQueryParameter("city", "STRING", city)]
    full_sql = _latest_cte() + safe_sql

    # Dry run: reject an oversized scan before it is ever billed.
    dry_cfg = bigquery.QueryJobConfig(query_parameters=params, dry_run=True, use_query_cache=False)
    estimated = client().query(full_sql, dry_cfg).total_bytes_processed or 0
    if estimated > MAX_QUERY_BYTES:
        raise SqlGuardError(
            f"query would scan {estimated} bytes, over the {MAX_QUERY_BYTES} byte limit")

    cfg = bigquery.QueryJobConfig(query_parameters=params, maximum_bytes_billed=MAX_QUERY_BYTES)
    rows = client().query(full_sql, cfg).result(max_results=MAX_ROWS)
    return [dict(r) for r in rows]


def log_localities(city: str, ranked: list[dict]) -> int:
    """Append a current-features snapshot for every locality in a ranked list."""
    if not ranked:
        return 0
    now = datetime.now(timezone.utc).isoformat()
    rows = []
    for r in ranked:
        sub = r.get("subscores", {})
        rows.append({
            "snapshot_ts": now, "city": city, "id": r["id"], "name": r["name"],
            "lat": r.get("lat"), "lng": r.get("lng"), "median_rent": r.get("median_rent"),
            "aqi": r.get("aqi"), "aqi_category": r.get("aqi_category"),
            "amenity_count": r.get("amenity_count"), "commute_min": r.get("commute_min"),
            "safety_est": r.get("safety_est"),
            "sub_affordability": sub.get("affordability"), "sub_safety": sub.get("safety"),
            "sub_commute": sub.get("commute"), "sub_lifestyle": sub.get("lifestyle"),
            "sub_air_quality": sub.get("air_quality"), "fit_score": r.get("fitScore"),
        })
    errors = client().insert_rows_json(_ref(LOCALITIES), rows)
    if errors:
        telemetry.event("tool_failed", tool="bigquery_log_localities", errorType="InsertError",
                        errorCount=len(errors))
        return 0
    return len(rows)


def append_aqi_history(city: str, locality: dict, series: list[dict]) -> int:
    """Append hourly AQI points (from Google history) for one locality."""
    if not series:
        return 0
    rows = []
    for pt in series:
        ts = pt.get("ts")  # full ISO datetime from Google history
        if not ts:
            continue
        rows.append({
            "city": city, "id": locality["id"], "name": locality["name"],
            "ts": ts, "aqi": pt.get("aqi"),
        })
    if not rows:
        return 0
    errors = client().insert_rows_json(_ref(AQI_HISTORY), rows)
    if errors:
        telemetry.event("tool_failed", tool="bigquery_append_aqi_history", errorType="InsertError",
                        errorCount=len(errors))
        return 0
    return len(rows)


def latest_localities(city: str) -> list[dict]:
    """Most recent snapshot per locality for a city (from BigQuery)."""
    cfg = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("c", "STRING", city)]
    )
    rows = client().query(
        f"""
        SELECT * EXCEPT(rn) FROM (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY snapshot_ts DESC) rn
          FROM `{_ref(LOCALITIES)}` WHERE city=@c
        ) WHERE rn=1 ORDER BY fit_score DESC
        """, cfg
    ).result()
    return [dict(r) for r in rows]


def ensure_ready() -> None:
    """Create tables once per process (guarded; never raises)."""
    global _ready
    if _ready:
        return
    try:
        ensure_tables()
        _ready = True
    except Exception as e:  # noqa: BLE001
        telemetry.event("tool_fallback", tool="bigquery_ensure_ready", fallbackUsed=True,
                        errorType=type(e).__name__)


def log_snapshot_safe(city: str, ranked: list[dict]) -> None:
    """Fire-and-forget snapshot log; never breaks or delays the request path."""
    def work():
        try:
            ensure_ready()
            log_localities(city, ranked)
        except Exception as e:  # noqa: BLE001
            telemetry.event("tool_fallback", tool="bigquery_log_snapshot", fallbackUsed=True,
                            errorType=type(e).__name__)

    threading.Thread(target=work, daemon=True).start()


def aqi_forecast_bqml(locality_id: str, horizon: int = 24) -> list[dict]:
    """ARIMA_PLUS (BQML) AQI forecast for one locality, with confidence band."""
    try:
        cfg = bigquery.QueryJobConfig(
            query_parameters=[bigquery.ScalarQueryParameter("id", "STRING", locality_id)]
        )
        rows = client().query(
            f"""
            SELECT FORMAT_TIMESTAMP('%H:%M', forecast_timestamp) AS label,
                   ROUND(forecast_value) AS aqi,
                   ROUND(prediction_interval_lower_bound) AS lo,
                   ROUND(prediction_interval_upper_bound) AS hi
            FROM ML.FORECAST(MODEL `{_ref(AQI_MODEL)}`,
                             STRUCT({int(horizon)} AS horizon, 0.8 AS confidence_level))
            WHERE id=@id ORDER BY forecast_timestamp
            """, cfg
        ).result()
        return [dict(r) for r in rows]
    except Exception as e:  # noqa: BLE001
        telemetry.event("tool_fallback", tool="bigquery_aqi_forecast", fallbackUsed=True,
                        errorType=type(e).__name__)
        return []


def run_sql(sql: str, city: str | None = None) -> list[dict]:
    """Run a read-only SELECT (for NL->SQL analytics). Guards against writes."""
    low = sql.strip().lower()
    if not low.startswith("select") or any(k in low for k in (";", "insert", "update", "delete", "drop", "create", "merge")):
        raise ValueError("only single read-only SELECT statements are allowed")
    params = []
    if city and "@city" in sql:
        params = [bigquery.ScalarQueryParameter("city", "STRING", city)]
    cfg = bigquery.QueryJobConfig(query_parameters=params) if params else None
    rows = client().query(sql, cfg).result(max_results=50)
    return [dict(r) for r in rows]
