"""Absolute CPCB air-quality health scoring.

The FitScore air pillar used to be a min-max normalization across the candidate
localities, so the least-polluted locality in ANY set climbed to the top of the
presentation band. That produced the trust-breaking result that a city where
every locality read AQI 500 (Severe) still scored 96/100 for air.

This module replaces that with an ABSOLUTE score anchored to the CPCB
(Central Pollution Control Board, India) national AQI health bands. Within a
band, a lower AQI scores higher, but relative position can never lift a locality
out of its absolute health band. Cross-locality comparison is exposed
separately as a rank, never folded back into the absolute health score.

CPCB national AQI bands (0-500 scale):
  Good 0-50 · Satisfactory 51-100 · Moderate 101-200 · Poor 201-300 ·
  Very Poor 301-400 · Severe 401-500(+).
"""
from __future__ import annotations

import math

# (name, aqi_lo, aqi_hi, score_lo, score_hi)
# score_hi is awarded at the clean edge (aqi_lo), score_lo at the dirty edge
# (aqi_hi). Bands are contiguous and the score ranges are ordered so the whole
# 0-500 sweep is strictly monotonic.
CPCB_BANDS: list[tuple[str, int, int, int, int]] = [
    ("Good", 0, 50, 90, 100),
    ("Satisfactory", 51, 100, 75, 89),
    ("Moderate", 101, 200, 55, 74),
    ("Poor", 201, 300, 35, 54),
    ("Very Poor", 301, 400, 15, 34),
    ("Severe", 401, 500, 0, 14),
]

# Bands that constitute a health risk that must not be masked by a friendly
# overall "Good Match" label. Moderate and cleaner carry no critical flag.
_RISK_SEVERITY = {
    "Poor": "elevated",
    "Very Poor": "high",
    "Severe": "critical",
}


def valid_aqi(aqi) -> float | None:
    """Return aqi as a usable non-negative finite number, or None.

    Rejects None, booleans, non-numeric types (strings, lists), NaN, infinities
    and negatives so malformed API values never become a real band or score, or
    raise a type/arithmetic error downstream.
    """
    if isinstance(aqi, bool):  # bool is an int subclass; reject True/False
        return None
    if not isinstance(aqi, (int, float)):
        return None
    if math.isnan(aqi) or math.isinf(aqi):
        return None
    if aqi < 0:
        return None
    return float(aqi)


def _band_tuple(aqi):
    v = valid_aqi(aqi)
    if v is None:
        return None
    for band in CPCB_BANDS:
        if v <= band[2]:
            return band
    return CPCB_BANDS[-1]  # beyond 500 -> Severe


def cpcb_band(aqi: float | int | None) -> str | None:
    """CPCB health-band name for an AQI value (None if AQI is missing)."""
    band = _band_tuple(aqi)
    return band[0] if band else None


def air_health_score(aqi: float | int | None) -> int | None:
    """Absolute 0-100 air-health score for an AQI value.

    Anchored to the CPCB band: a lower AQI within a band scores higher, but the
    result is always inside the band's score range, so a Severe AQI can never
    read as clean. Returns None when AQI is unavailable.
    """
    band = _band_tuple(aqi)
    if band is None:
        return None
    v = valid_aqi(aqi)
    name, aqi_lo, aqi_hi, score_lo, score_hi = band
    span = (aqi_hi - aqi_lo) or 1
    frac = (v - aqi_lo) / span
    frac = min(1.0, max(0.0, frac))  # clamp (e.g. AQI > 500)
    return round(score_hi - frac * (score_hi - score_lo))


def critical_risks(aqi: float | int | None) -> list[dict]:
    """Health-risk qualifiers for an AQI value.

    Non-empty only for Poor/Very Poor/Severe air, so the UI can show a visible
    "Severe air-quality risk" qualifier alongside an overall FitScore match.
    """
    band = _band_tuple(aqi)
    if band is None:
        return []
    name = band[0]
    severity = _RISK_SEVERITY.get(name)
    if not severity:
        return []
    return [{
        "type": "air_quality",
        "severity": severity,
        "label": f"{name} air-quality risk",
        "detail": f"AQI {round(valid_aqi(aqi))}, {name} (CPCB)",
    }]


def air_relative_ranks(aqis: list[float | int | None]) -> list[int | None]:
    """Competition ranking of localities by AQI (rank 1 = lowest AQI = cleanest).

    Equal AQI values tie at the same rank, so an all-equal city produces all
    rank 1 rather than a fabricated winner. Missing values get no rank (None).
    """
    vals = [valid_aqi(v) for v in aqis]
    present = [v for v in vals if v is not None]
    out: list[int | None] = []
    for v in vals:
        if v is None:
            out.append(None)
        else:
            out.append(1 + sum(1 for other in present if other < v))
    return out
