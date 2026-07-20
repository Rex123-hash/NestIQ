"""Additive, serializable provenance envelopes for NestIQ's five pillars."""

from __future__ import annotations

from typing import Any


def _envelope(
    metric: str,
    value: Any,
    unit: str,
    source: str,
    source_type: str,
    status: str,
    fetched_at: str | None,
    geographic_scope: str,
    confidence: str,
    limitation: str,
) -> dict:
    evidence = {
        "metric": metric,
        "value": value,
        "unit": unit,
        "source": source,
        "sourceType": source_type,
        "status": status,
        "fetchedAt": fetched_at,
        "geographicScope": geographic_scope,
        "confidence": confidence,
        "limitation": limitation,
    }
    return evidence


def metric_evidence(feature: dict) -> dict[str, dict]:
    """Build evidence without changing any legacy metric field."""
    commute = feature.get("commute_min")
    commute_status = feature.get("commuteDataStatus") or (
        "live" if commute is not None else "temporarily_unavailable"
    )
    amenities = feature.get("amenity_count")
    amenity_status = feature.get("amenityDataStatus") or (
        "live" if amenities is not None else "temporarily_unavailable"
    )
    air = feature.get("aqi")
    air_status = feature.get("airDataStatus") or (
        "live" if air is not None else "temporarily_unavailable"
    )

    amenity_limitation = "Counts are capped at 20 per category within 1.5 km."
    failed = feature.get("amenityFailedCategories") or []
    if failed:
        amenity_limitation += f" Incomplete categories: {', '.join(failed)}."

    evidence = {
        "affordability": _envelope(
            "affordability", feature.get("median_rent"), "INR/month",
            "NestIQ curated locality market dataset", "curated_market_estimate",
            "estimated", None, "locality", "medium",
            "Indicative median rent, not a live property listing or quoted offer.",
        ),
        "safety": _envelope(
            "safety", feature.get("safety_est"), "index/100",
            "NestIQ curated locality safety profile", "curated_proxy", "curated",
            None, "locality", "medium",
            "Proxy index because consistent open locality-level crime data is unavailable.",
        ),
        "commute": _envelope(
            "commute", commute, "minutes",
            feature.get("commuteSource") or "Google Maps Distance Matrix",
            "live_google", commute_status, feature.get("commuteFetchedAt"),
            "route_to_city_hub", "high" if commute_status == "live" else "unavailable",
            "Traffic-dependent driving time to the configured city work hub.",
        ),
        "lifestyle": _envelope(
            "lifestyle", amenities, "places_within_1.5km",
            feature.get("amenitySource") or "Google Places API", "live_google",
            amenity_status, feature.get("amenityFetchedAt"), "1.5km_radius",
            "high" if amenity_status == "live" else "low" if amenity_status == "partial" else "unavailable",
            amenity_limitation,
        ),
        "air_quality": _envelope(
            "air_quality", air,
            "CPCB AQI" if feature.get("airIndexCode") != "uaqi" else "Universal AQI",
            feature.get("airSource") or "Google Air Quality API (CPCB AQI)",
            "cached_google" if air_status == "stale" else "live_google",
            air_status, feature.get("airFetchedAt"), "locality_coordinate",
            "high" if air_status == "live" else "medium" if air_status == "stale" else "unavailable",
            "Point-in-time modeled air-quality estimate; conditions can change quickly.",
        ),
    }
    safety_profile = feature.get("safety_profile")
    evidence["safety"]["confidenceLabel"] = "Curated score confidence"
    if safety_profile:
        # The live profile supports interpretation of the curated index. It is
        # kept separate so emergency-service density is never mislabeled as a
        # locality crime rate and never silently changes the Safety/FitScore.
        evidence["safety"]["supportingEvidence"] = safety_profile
    return evidence
