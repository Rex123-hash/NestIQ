"""Shared fixtures: an offline API client with all external services faked.

Every test runs with zero network access — Vertex, BigQuery and Maps are
monkeypatched so the suite is fast, deterministic and CI-safe.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import gemini, maps, bq_india, main  # noqa: E402


def fake_features():
    """Three localities with clearly distinct metrics (best/mid/worst)."""
    base = {"aqi_category": "Moderate air quality", "aqi_pollutant": "pm25", "photo": ""}
    return [
        {**base, "id": "clean-cheap", "name": "Clean & Cheap", "short": "CleanCheap",
         "accent": "#7C5CF6", "lat": 28.60, "lng": 77.20, "median_rent": 15000,
         "safety_est": 80, "aqi": 60, "amenity_count": 18, "commute_min": 20},
        {**base, "id": "middle", "name": "Middle Town", "short": "Middle",
         "accent": "#4F86F7", "lat": 28.55, "lng": 77.30, "median_rent": 25000,
         "safety_est": 70, "aqi": 150, "amenity_count": 12, "commute_min": 35},
        {**base, "id": "posh-polluted", "name": "Posh but Polluted", "short": "Posh",
         "accent": "#3FB984", "lat": 28.50, "lng": 77.10, "median_rent": 40000,
         "safety_est": 75, "aqi": 240, "amenity_count": 20, "commute_min": 50},
    ]


@pytest.fixture()
def client(monkeypatch):
    """FastAPI TestClient with every external dependency stubbed."""
    from fastapi.testclient import TestClient

    monkeypatch.setattr(maps, "build_city_features", lambda city: fake_features())
    monkeypatch.setattr(maps, "air_quality_history", lambda lat, lng, hours=24: [
        {"label": "10:00", "aqi": 100}, {"label": "11:00", "aqi": 110}])
    monkeypatch.setattr(maps, "air_quality_forecast", lambda lat, lng, hours=24: [
        {"label": "12:00", "aqi": 120}])
    monkeypatch.setattr(gemini, "parse_query", lambda text, budget=None: {
        "budget": 30000, "weights": dict(gemini.INDIA_DEFAULT), "anchor": ""})
    monkeypatch.setattr(gemini, "explain", lambda name, subscores, rent, note: f"{name} fits well.")
    monkeypatch.setattr(gemini, "ask", lambda q, ctx: "Grounded answer.")
    monkeypatch.setattr(gemini, "nl_to_sql", lambda q, city, table: (
        f"SELECT name, aqi FROM {table} WHERE city = '{city}' ORDER BY aqi ASC LIMIT 3"))
    monkeypatch.setattr(bq_india, "log_snapshot_safe", lambda city, ranked: None)
    monkeypatch.setattr(bq_india, "ensure_ready", lambda: None)
    monkeypatch.setattr(bq_india, "analytics_query", lambda sql, city=None: [
        {"name": "Clean & Cheap", "aqi": 60}])
    monkeypatch.setattr(bq_india, "aqi_forecast_bqml", lambda nid, horizon=24: [
        {"label": "12:00", "aqi": 118.0, "lo": 110.0, "hi": 126.0}])

    return TestClient(main.app)
