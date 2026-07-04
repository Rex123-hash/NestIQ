"""FitScore engine.

Turns raw per-neighborhood metrics (from BigQuery) + the user's weighted
preferences into normalized 0-100 sub-scores and an overall FitScore.
Normalization is min-max across the candidate set, so scores are comparable
("normalized across all neighborhoods in New York City").
"""
from __future__ import annotations

DEFAULT_WEIGHTS = {
    "affordability": 20,
    "safety": 30,
    "commute": 25,
    "lifestyle": 15,
    "trend": 10,
}

SUBSCORE_KEYS = list(DEFAULT_WEIGHTS.keys())


_BAND_LO, _BAND_HI = 40, 96  # present scores in a friendly band, never 0/100


def _minmax(values: list[float], invert: bool = False) -> list[float]:
    lo, hi = min(values), max(values)
    span = (hi - lo) or 1.0
    out = []
    for v in values:
        s = (v - lo) / span
        if invert:
            s = 1 - s
        out.append(round(_BAND_LO + s * (_BAND_HI - _BAND_LO)))
    return out


def _match(score: int) -> str:
    if score >= 85:
        return "Excellent Match"
    if score >= 75:
        return "Good Match"
    return "Fair Match"


def score_neighborhoods(
    features: list[dict],
    weights: dict[str, float] | None = None,
    budget: float = 2000,
) -> list[dict]:
    """`features`: one dict per neighborhood with raw metrics:
        median_rent, incidents_per_1k, collisions_per_1k, commute_min,
        amenity_count, forecast_pct
    Returns the same neighborhoods enriched with subscores + fitScore, ranked.
    """
    if not features:
        return []

    w = {**DEFAULT_WEIGHTS, **(weights or {})}
    wsum = sum(w[k] for k in SUBSCORE_KEYS) or 1.0

    # Affordability blends budget-fit with relative cheapness.
    afford_raw = [budget - f["median_rent"] for f in features]
    sub = {
        "affordability": _minmax(afford_raw),
        "safety": _minmax([f["incidents_per_1k"] + f["collisions_per_1k"] for f in features], invert=True),
        "commute": _minmax([f["commute_min"] for f in features], invert=True),
        "lifestyle": _minmax([f["amenity_count"] for f in features]),
        "trend": _minmax([f["forecast_pct"] for f in features]),
    }

    out = []
    for i, f in enumerate(features):
        subscores = {k: sub[k][i] for k in SUBSCORE_KEYS}
        fit = round(sum(subscores[k] * w[k] for k in SUBSCORE_KEYS) / wsum)
        out.append({**f, "subscores": subscores, "fitScore": fit, "match": _match(fit)})

    out.sort(key=lambda x: x["fitScore"], reverse=True)
    return out
