"""NestIQ data pipeline.

Builds the BigQuery data + ML spine from real public sources:
  1. create dataset
  2. load Zillow ZORI rent (real; downloaded CSV) -> zori_zip, zori_neighborhood
  3. aggregate NYC 311 complaints (public) -> per ZIP
  4. aggregate NYC motor-vehicle collisions (public) -> per ZIP
  5. train BigQuery ML ARIMA_PLUS on rent history -> 12-month forecast
  6. assemble neighborhood_features (the table the API reads)

Run from the backend/ directory:  python -m data_pipeline.build
Individual stages:                python -m data_pipeline.build --stage features
"""
from __future__ import annotations

import argparse
import io
import math
import sys

import pandas as pd
import requests
from google.cloud import bigquery

from app.config import settings
from app.neighborhoods import NEIGHBORHOODS, ALL_ZIPS, WORKPLACE, zip_to_neighborhood

DATASET_LOCATION = "US"  # must match bigquery-public-data (US multi-region)
ZORI_URL = "https://files.zillowstatic.com/research/public_csvs/zori/Zip_zori_uc_sfrcondomfr_sm_month.csv"

client = bigquery.Client(project=settings.gcp_project, location=DATASET_LOCATION)
DS = settings.bq_dataset
Z2N = zip_to_neighborhood()


def _haversine_km(lat1, lng1, lat2, lng2) -> float:
    r = 6371
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def commute_minutes(lat, lng) -> int:
    """Transit-commute proxy to the Midtown workplace anchor."""
    d = _haversine_km(lat, lng, WORKPLACE["lat"], WORKPLACE["lng"])
    return round(6 + d * 3.4)


# --------------------------------------------------------------------------- #
def stage_dataset():
    ds = bigquery.Dataset(f"{settings.gcp_project}.{DS}")
    ds.location = DATASET_LOCATION
    client.create_dataset(ds, exists_ok=True)
    print(f"[dataset] {DS} ready ({DATASET_LOCATION})")


def stage_rent():
    """Download Zillow ZORI, filter to our ZIPs, reshape wide->long, load."""
    print("[rent] downloading Zillow ZORI...")
    resp = requests.get(ZORI_URL, timeout=120)
    resp.raise_for_status()
    df = pd.read_csv(io.BytesIO(resp.content))
    df["RegionName"] = df["RegionName"].astype(str).str.zfill(5)
    df = df[df["RegionName"].isin(ALL_ZIPS)]
    date_cols = [c for c in df.columns if c[:4].isdigit() and "-" in c]
    long = df.melt(id_vars=["RegionName"], value_vars=date_cols, var_name="month", value_name="rent")
    long = long.rename(columns={"RegionName": "zip"}).dropna(subset=["rent"])
    long["month"] = pd.to_datetime(long["month"]).dt.date
    long["neighborhood"] = long["zip"].map(Z2N)
    long = long.dropna(subset=["neighborhood"])
    print(f"[rent] {len(long)} zip-month rows across {long['zip'].nunique()} ZIPs")

    _load_df(long[["zip", "month", "rent", "neighborhood"]], "zori_zip")

    # neighborhood-level monthly series (avg of member ZIPs) for the forecast model
    nbh = long.groupby(["neighborhood", "month"], as_index=False)["rent"].mean()
    _load_df(nbh, "zori_neighborhood")
    print("[rent] loaded zori_zip + zori_neighborhood")


def stage_safety():
    """Aggregate real 311 complaints + collisions per ZIP (last 12 months)."""
    zips = "', '".join(ALL_ZIPS)
    tbl311 = "`bigquery-public-data.new_york_311.311_service_requests`"
    # 311 is refreshed to ~2021 only, so window against the data's own max date.
    q311 = f"""
      SELECT incident_zip AS zip, COUNT(*) AS complaints
      FROM {tbl311}
      WHERE incident_zip IN ('{zips}')
        AND created_date >= (SELECT TIMESTAMP_SUB(MAX(created_date), INTERVAL 365 DAY) FROM {tbl311})
      GROUP BY incident_zip
    """
    d311 = client.query(q311).result().to_dataframe()
    print(f"[safety] 311: {len(d311)} zips, {int(d311['complaints'].sum())} complaints")

    # collisions are current; zip_code is INTEGER, timestamp is DATETIME.
    qcol = f"""
      SELECT CAST(zip_code AS STRING) AS zip, COUNT(*) AS collisions
      FROM `bigquery-public-data.new_york_mv_collisions.nypd_mv_collisions`
      WHERE CAST(zip_code AS STRING) IN ('{zips}')
        AND timestamp >= DATETIME_SUB(CURRENT_DATETIME(), INTERVAL 365 DAY)
      GROUP BY zip
    """
    dcol = client.query(qcol).result().to_dataframe()
    print(f"[safety] collisions: {len(dcol)} zips, {int(dcol['collisions'].sum())} collisions")

    _load_df(d311, "safety_311")
    _load_df(dcol, "safety_collisions")


def stage_forecast():
    """Train ARIMA_PLUS on neighborhood rent history, forecast 12 months."""
    sql = f"""
    CREATE OR REPLACE MODEL `{settings.dataset_ref}.rent_forecast_model`
    OPTIONS(model_type='ARIMA_PLUS', time_series_timestamp_col='month',
            time_series_data_col='rent', time_series_id_col='neighborhood',
            horizon=12, auto_arima=TRUE, data_frequency='MONTHLY') AS
    SELECT neighborhood, TIMESTAMP(month) AS month, rent
    FROM `{settings.dataset_ref}.zori_neighborhood`
    """
    print("[forecast] training ARIMA_PLUS model...")
    client.query(sql).result()

    fc = f"""
    CREATE OR REPLACE TABLE `{settings.dataset_ref}.rent_forecast` AS
    SELECT neighborhood, forecast_timestamp AS month, forecast_value AS rent
    FROM ML.FORECAST(MODEL `{settings.dataset_ref}.rent_forecast_model`,
                     STRUCT(12 AS horizon, 0.8 AS confidence_level))
    """
    client.query(fc).result()
    print("[forecast] rent_forecast table written")


def stage_features():
    """Assemble the neighborhood_features table the API reads."""
    rent = client.query(f"""
      SELECT neighborhood, ARRAY_AGG(rent ORDER BY month DESC LIMIT 1)[OFFSET(0)] AS median_rent
      FROM `{settings.dataset_ref}.zori_neighborhood` GROUP BY neighborhood
    """).result().to_dataframe()

    fc = client.query(f"""
      SELECT neighborhood, AVG(rent) AS fc_rent
      FROM `{settings.dataset_ref}.rent_forecast` GROUP BY neighborhood
    """).result().to_dataframe()

    d311 = client.query(f"SELECT zip, complaints FROM `{settings.dataset_ref}.safety_311`").result().to_dataframe()
    dcol = client.query(f"SELECT zip, collisions FROM `{settings.dataset_ref}.safety_collisions`").result().to_dataframe()
    c_by_n = _sum_by_neighborhood(d311, "complaints")
    x_by_n = _sum_by_neighborhood(dcol, "collisions")

    rent_map = dict(zip(rent["neighborhood"], rent["median_rent"]))
    fc_map = dict(zip(fc["neighborhood"], fc["fc_rent"]))

    rows = []
    for n in NEIGHBORHOODS:
        nid = n["id"]
        median_rent = float(rent_map.get(nid, 2000))
        fc_rent = float(fc_map.get(nid, median_rent))
        forecast_pct = round((fc_rent / median_rent - 1) * 100, 1) if median_rent else 0.0
        pop = n["pop"]
        rows.append({
            "id": nid,
            "median_rent": round(median_rent),
            "complaints": int(c_by_n.get(nid, 0)),
            "collisions": int(x_by_n.get(nid, 0)),
            "incidents_per_1k": round(c_by_n.get(nid, 0) / pop * 1000, 2),
            "collisions_per_1k": round(x_by_n.get(nid, 0) / pop * 1000, 2),
            "commute_min": commute_minutes(n["lat"], n["lng"]),
            "amenity_count": n["amenities"],
            "forecast_pct": forecast_pct,
        })
    df = pd.DataFrame(rows)
    _load_df(df, "neighborhood_features")
    print("[features] neighborhood_features written:")
    print(df.to_string(index=False))


def _sum_by_neighborhood(df: pd.DataFrame, col: str) -> dict:
    out: dict[str, float] = {}
    for _, r in df.iterrows():
        nid = Z2N.get(str(r["zip"]))
        if nid:
            out[nid] = out.get(nid, 0) + r[col]
    return out


def _load_df(df: pd.DataFrame, table: str):
    ref = f"{settings.dataset_ref}.{table}"
    client.load_table_from_dataframe(
        df, ref, job_config=bigquery.LoadJobConfig(write_disposition="WRITE_TRUNCATE")
    ).result()


STAGES = {
    "dataset": stage_dataset, "rent": stage_rent, "safety": stage_safety,
    "forecast": stage_forecast, "features": stage_features,
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", choices=list(STAGES) + ["all"], default="all")
    args = ap.parse_args()
    if not settings.gcp_project:
        sys.exit("GCP_PROJECT not set in .env")
    order = ["dataset", "rent", "safety", "forecast", "features"]
    for s in (order if args.stage == "all" else [args.stage]):
        STAGES[s]()
    print("\n[done]")


if __name__ == "__main__":
    main()
