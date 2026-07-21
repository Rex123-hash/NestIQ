"""Offline city-onboarding validator and rent cross-checker.

Phase 11 gate: a city is publishable only after passing validation. This runs
OUTSIDE the request path on purpose -- 53 localities x grounded search will trip
the Vertex quota (production returned 429 RESOURCE_EXHAUSTED on 2026-07-20 from
considerably less traffic), so grounded checks are serial, rate-limited,
resumable and opt-in.

It never mutates india.py. Disagreements are REPORTED for a human to judge,
because a grounded median drawn from three listings is not authoritative enough
to overturn a curated value.

    # Structural pass only -- free, no model calls, all nine cities:
    python -m tools.validate_city

    # Add the grounded rent cross-check, ten localities at a time:
    python -m tools.validate_city --rent-check --limit 10

    # Resume where the last run stopped:
    python -m tools.validate_city --rent-check --limit 10

This module imports from app.* but must never be imported BY app.* -- that
coupling is what would put grounded search back on the request path.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from app.india import CITIES  # noqa: E402

# Mainland + islands bounding box. A centroid outside this is a typo, not a city.
_INDIA_LAT = (6.5, 35.7)
_INDIA_LNG = (68.0, 97.5)

_REQUIRED_KEYS = ("id", "name", "short", "lat", "lng")
# `rent` and `safety` are deliberately NOT required. Rent is sourced from
# grounded evidence with citations rather than typed in, so a city is onboarded
# before it exists; safety has no locality-level crime source in India at all.
# Their absence is reported as reduced coverage, never invented.
_OPTIONAL_KEYS = ("rent", "safety", "accent")

_DEFAULT_LEDGER = _BACKEND_ROOT / "data" / "rent_check_ledger.json"
_DEFAULT_REPORT = _BACKEND_ROOT / "data" / "city_coverage_report.md"
_PENDING = _BACKEND_ROOT / "data" / "pending_cities.json"


def load_pending() -> dict:
    """Staged cities awaiting the gate. These are NOT served by the app.

    Keeping candidates out of india.py until they pass is what makes "publish
    only after passing validation" mean something: a half-onboarded city cannot
    reach a user by accident.
    """
    if not _PENDING.exists():
        raise SystemExit(f"No staging file at {_PENDING}")
    data = json.loads(_PENDING.read_text(encoding="utf-8"))
    return data.get("cities", {})


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ------------------------------ structural pass ---------------------------- #

def validate_structure(city_id: str, city: dict) -> list[dict]:
    """Offline checks. No model calls, no quota, safe to run any time."""
    findings: list[dict] = []
    seen_ids: set[str] = set()

    def add(severity: str, locality: str, message: str) -> None:
        findings.append({"severity": severity, "city": city_id,
                         "locality": locality, "message": message})

    anchor = city.get("anchor") or {}
    for key in ("name", "lat", "lng"):
        if anchor.get(key) is None:
            add("error", "(anchor)", f"anchor is missing '{key}'")

    localities = city.get("localities") or []
    if not localities:
        add("error", "(city)", "city has no localities")

    for loc in localities:
        name = loc.get("id") or loc.get("name") or "(unnamed)"

        for key in _REQUIRED_KEYS:
            if loc.get(key) is None:
                add("error", name, f"missing required key '{key}'")

        lid = loc.get("id")
        if lid in seen_ids:
            add("error", name, f"duplicate locality id '{lid}'")
        seen_ids.add(lid)

        lat, lng = loc.get("lat"), loc.get("lng")
        if isinstance(lat, (int, float)) and not _INDIA_LAT[0] <= lat <= _INDIA_LAT[1]:
            add("error", name, f"latitude {lat} is outside India")
        if isinstance(lng, (int, float)) and not _INDIA_LNG[0] <= lng <= _INDIA_LNG[1]:
            add("error", name, f"longitude {lng} is outside India")

        rent = loc.get("rent")
        if rent is None:
            # Publishable, but visibly incomplete: affordability is excluded
            # from the FitScore until grounded rent evidence is sourced.
            add("warning", name, "no rent evidence sourced yet: affordability excluded, "
                                 "FitScore runs provisional")
        elif isinstance(rent, (int, float)) and not 3000 <= rent <= 400000:
            add("warning", name, f"rent {rent} is outside a plausible monthly range")

        # Absence is legitimate and must be reported as reduced coverage, not as
        # a defect -- the scoring engine already degrades to provisional.
        if loc.get("safety") is None:
            add("info", name, "no safety value: FitScore runs provisional (4 of 5 pillars)")

    return findings


def coverage_summary(city_id: str, city: dict) -> dict:
    localities = city.get("localities") or []
    total = len(localities) or 1
    with_safety = sum(1 for l in localities if l.get("safety") is not None)
    with_rent = sum(1 for l in localities if l.get("rent") is not None)
    return {
        "city": city_id,
        "localities": len(localities),
        "safetyCoveragePercent": round(100 * with_safety / total),
        "rentCoveragePercent": round(100 * with_rent / total),
    }


# --------------------------- grounded rent check --------------------------- #

def _load_ledger(path: Path) -> dict:
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            # A corrupt ledger must not silently discard prior work.
            raise SystemExit(f"Ledger at {path} is unreadable. Move it aside to start fresh.")
    return {}


def _save_ledger(path: Path, ledger: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(ledger, indent=2, sort_keys=True), encoding="utf-8")


def cross_check_rents(
    cities: dict,
    ledger_path: Path,
    limit: int,
    delay: float,
    min_sample: int,
    delta_threshold: float,
) -> tuple[dict, str | None]:
    """Serial, resumable grounded rent verification. Returns (ledger, abort_reason)."""
    from app import gemini  # imported late so the structural pass never needs Vertex

    ledger = _load_ledger(ledger_path)
    checked = 0
    abort: str | None = None

    for city_id, city in cities.items():
        for loc in city.get("localities") or []:
            if checked >= limit:
                return ledger, abort

            key = f"{city_id}/{loc.get('id')}"
            if key in ledger:
                continue  # already verified: the ledger doubles as the cache

            print(f"  verifying {key} ...", flush=True)
            result = gemini.verify_rent(loc["name"], city_id)
            checked += 1

            if result.get("errorCode") == "vertex_quota_exhausted":
                # Stop immediately rather than burning the remaining budget on
                # calls that will also fail. Progress so far is already saved.
                abort = ("Vertex quota exhausted. Progress is saved; rerun the "
                         "same command later to resume.")
                return ledger, abort

            entry = {
                "city": city_id,
                "locality": loc["name"],
                "curatedRent": loc.get("rent"),
                "status": result.get("status"),
                "checkedAt": _now(),
            }
            if result.get("status") == "available":
                entry.update({
                    "groundedMedian": result.get("medianRent"),
                    "rangeLow": result.get("rangeLow"),
                    "rangeHigh": result.get("rangeHigh"),
                    "sampleSize": result.get("sampleSize"),
                    "sourceCount": result.get("sourceCount"),
                    "confidence": result.get("confidence"),
                    "citations": result.get("citations", [])[:6],
                })
            else:
                entry["errorCode"] = result.get("errorCode")

            ledger[key] = entry
            _save_ledger(ledger_path, ledger)  # written per locality: resumable
            time.sleep(delay)

    return ledger, abort


def assess_disagreement(entry: dict, min_sample: int, delta_threshold: float) -> dict | None:
    """Flag only when the evidence is strong enough to be worth a human's time.

    A grounded median from two listings disagreeing with a curated value is
    noise. Requiring BOTH a meaningful delta and a real sample is what keeps the
    report actionable instead of forty false alarms.
    """
    if entry.get("status") != "available":
        return None
    curated, grounded = entry.get("curatedRent"), entry.get("groundedMedian")
    if not curated or not grounded:
        return None

    sample = entry.get("sampleSize") or 0
    delta = (grounded - curated) / curated
    if abs(delta) < delta_threshold:
        return None
    if sample < min_sample:
        return {**entry, "deltaPercent": round(100 * delta), "verdict": "insufficient_sample"}
    return {**entry, "deltaPercent": round(100 * delta), "verdict": "review"}


# --------------------- live signal + scoring validation -------------------- #

def check_live_signals(city_id: str, city: dict) -> dict:
    """Verify Google actually resolves at every centroid, then score if possible.

    Signal coverage and scoring are separated on purpose. "Does Google return
    air/commute/amenities at this coordinate?" is the question that validates a
    centroid, and it does not depend on rent -- so a candidate city with no rent
    yet can still prove its geography is correct.

    Scoring runs through the real production path (maps._fetch_features +
    maps.score_india) rather than a reimplementation, but only once the catalog
    data it requires is present. Uses Maps quota, not Vertex.
    """
    from app import maps

    anchor = city["anchor"]
    locs = city.get("localities") or []
    total = len(locs) or 1
    aqi_ok = commute_ok = amenity_ok = 0

    for loc in locs:
        air = maps.air_quality(loc["lat"], loc["lng"])
        if air.get("aqi") is not None:
            aqi_ok += 1
        prof = maps.amenity_profile(loc["lat"], loc["lng"])
        if prof.get("total") is not None:
            amenity_ok += 1
        if maps.commute_minutes(loc["lat"], loc["lng"], anchor["lat"], anchor["lng"]) is not None:
            commute_ok += 1

    live = {
        "city": city_id,
        "localities": total,
        "aqiCoveragePercent": round(100 * aqi_ok / total),
        "commuteCoveragePercent": round(100 * commute_ok / total),
        "amenityCoveragePercent": round(100 * amenity_ok / total),
        "findings": [],
        "scoringChecked": False,
    }

    # Scoring needs a complete catalog row; a candidate city without rent is not
    # scoreable yet, and that is a gate result rather than a live-signal failure.
    if all(loc.get("rent") is not None for loc in locs):
        ranked = maps.score_india(maps._fetch_features(city), budget=30000)
        live["findings"] = validate_scoring(city_id, ranked)
        live["scoringChecked"] = True

    return live


def validate_scoring(city_id: str, ranked: list[dict]) -> list[dict]:
    """Scoring invariants that must hold before a city is publishable."""
    findings: list[dict] = []

    def add(severity: str, locality: str, message: str) -> None:
        findings.append({"severity": severity, "city": city_id,
                         "locality": locality, "message": message})

    for r in ranked:
        name = r.get("name", "(unnamed)")
        fit = r.get("fitScore")

        if not isinstance(fit, (int, float)):
            add("error", name, f"FitScore is not numeric: {fit!r}")
            continue
        if not 0 <= fit <= 100:
            add("error", name, f"FitScore {fit} is outside 0-100")

        missing = r.get("missingPillars") or []
        status = r.get("fitScoreDataStatus")

        # The core trust invariant: a score with a missing pillar must never
        # present itself as complete.
        if missing and status != "provisional":
            add("error", name, f"missing pillars {missing} but status is '{status}'")
        if not missing and status != "complete":
            add("error", name, f"no missing pillars but status is '{status}'")

        coverage = r.get("coveragePercent")
        if not isinstance(coverage, (int, float)) or not 0 < coverage <= 100:
            add("error", name, f"implausible coverage: {coverage!r}")
        if not missing and coverage != 100:
            add("error", name, f"complete score but coverage is {coverage}%")

        # Phase 1 invariant: severe air can never read as healthy.
        band, air = r.get("airHealthBand"), r.get("airHealthScore")
        if band == "Severe" and isinstance(air, (int, float)) and air > 30:
            add("error", name, f"Severe air band with air score {air}")

    return findings


# --------------------------------- report ---------------------------------- #

def build_report(structural, coverage, flagged, ledger, abort, live=None) -> str:
    lines = ["# NestIQ city coverage report", "", f"Generated: {_now()}", ""]

    errors = [f for f in structural if f["severity"] == "error"]
    warnings = [f for f in structural if f["severity"] == "warning"]
    infos = [f for f in structural if f["severity"] == "info"]

    lines += ["## Gate", "",
              f"- Structural errors: **{len(errors)}** (must be zero to publish)",
              f"- Warnings: {len(warnings)}",
              f"- Provisional-coverage notices: {len(infos)}", ""]

    lines += ["## Catalog coverage", "",
              "| City | Localities | Rent | Safety |", "|---|---|---|---|"]
    for c in coverage:
        lines.append(f"| {c['city']} | {c['localities']} | {c['rentCoveragePercent']}% "
                     f"| {c['safetyCoveragePercent']}% |")
    lines.append("")

    if errors or warnings:
        lines += ["## Structural findings", "",
                  "| Severity | City | Locality | Finding |", "|---|---|---|---|"]
        for f in errors + warnings:
            lines.append(f"| {f['severity']} | {f['city']} | {f['locality']} | {f['message']} |")
        lines.append("")

    lines += ["## Live source coverage", ""]
    if not live:
        lines += ["Not run. Use `--live-check` to verify Air Quality, Places and "
                  "Distance Matrix actually resolve for each locality centroid.", ""]
    else:
        lines += ["| City | Localities | AQI | Commute | Amenities |",
                  "|---|---|---|---|---|"]
        for l in live:
            lines.append(f"| {l['city']} | {l['localities']} | {l['aqiCoveragePercent']}% "
                         f"| {l['commuteCoveragePercent']}% | {l['amenityCoveragePercent']}% |")
        lines.append("")
        scoring = [f for l in live for f in l.get("findings", [])]
        if scoring:
            lines += ["### Scoring invariant failures", "",
                      "| City | Locality | Finding |", "|---|---|---|"]
            for f in scoring:
                lines.append(f"| {f['city']} | {f['locality']} | {f['message']} |")
            lines.append("")
        elif any(l.get("scoringChecked") for l in live):
            lines += ["All scoring invariants held: no complete-status score carried a "
                      "missing pillar, and no Severe air band scored as healthy.", ""]
        else:
            lines += ["Scoring not validated: these cities are missing catalog data "
                      "(see structural findings), so they are not scoreable yet. "
                      "Live signal coverage above is still meaningful -- it proves the "
                      "centroids resolve against Google.", ""]

    lines += ["## Rent cross-check", ""]
    if not ledger:
        lines += ["Not run. Use `--rent-check` to cross-check curated rents against "
                  "grounded market evidence.", ""]
    else:
        available = [e for e in ledger.values() if e.get("status") == "available"]
        lines += [f"Localities verified: {len(ledger)} (grounded evidence returned for "
                  f"{len(available)})", ""]
        if abort:
            lines += [f"> Run stopped early: {abort}", ""]
        if flagged:
            lines += ["Curated values are NOT modified. Each row is a candidate for human "
                      "review; `insufficient_sample` means the delta is real but the "
                      "evidence is too thin to act on.", "",
                      "| City | Locality | Curated | Grounded median | Delta | Sample | "
                      "Sources | Verdict |", "|---|---|---|---|---|---|---|---|"]
            for f in flagged:
                lines.append(
                    f"| {f['city']} | {f['locality']} | {f['curatedRent']:,} | "
                    f"{f['groundedMedian']:,} | {f['deltaPercent']:+d}% | "
                    f"{f.get('sampleSize', 0)} | {f.get('sourceCount', 0)} | "
                    f"{f['verdict']} |")
            lines.append("")
            lines += ["### Citations", ""]
            for f in flagged:
                if f.get("citations"):
                    lines.append(f"**{f['locality']}**")
                    for cite in f["citations"]:
                        uri = cite.get("uri") if isinstance(cite, dict) else str(cite)
                        title = cite.get("title", "") if isinstance(cite, dict) else ""
                        lines.append(f"- {title} {uri}".strip())
                    lines.append("")
        else:
            lines += ["No disagreement cleared both the delta and sample-size gates.", ""]

    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Validate NestIQ city catalog coverage.")
    p.add_argument("--city", help="Validate a single city id (default: all).")
    p.add_argument("--pending", action="store_true",
                   help="Validate staged candidate cities from data/pending_cities.json "
                        "instead of the published catalog.")
    p.add_argument("--rent-check", action="store_true",
                   help="Cross-check curated rents against grounded evidence (uses Vertex quota).")
    p.add_argument("--live-check", action="store_true",
                   help="Verify Air Quality, Places and Distance Matrix resolve, then "
                        "validate scoring invariants (uses Maps quota, ~5 calls/locality).")
    p.add_argument("--limit", type=int, default=10,
                   help="Max grounded verifications this run (default 10).")
    p.add_argument("--delay", type=float, default=6.0,
                   help="Seconds between grounded calls (default 6).")
    p.add_argument("--min-sample", type=int, default=5,
                   help="Minimum grounded observations before a delta is actionable (default 5).")
    p.add_argument("--delta-threshold", type=float, default=0.25,
                   help="Fractional rent delta before flagging (default 0.25).")
    p.add_argument("--ledger", type=Path, default=_DEFAULT_LEDGER)
    p.add_argument("--report", type=Path, default=_DEFAULT_REPORT)
    args = p.parse_args(argv)

    cities = load_pending() if args.pending else CITIES
    if args.city:
        if args.city not in cities:
            print(f"Unknown city '{args.city}'. Known: {', '.join(cities)}")
            return 2
        cities = {args.city: cities[args.city]}

    print(f"Validating {len(cities)} city(ies) ...")
    structural, coverage = [], []
    for city_id, city in cities.items():
        structural += validate_structure(city_id, city)
        coverage.append(coverage_summary(city_id, city))

    live = []
    if args.live_check:
        calls = sum(len(c.get("localities") or []) for c in cities.values()) * 5
        print(f"Live signal check: about {calls} Google Maps calls ...")
        for city_id, city in cities.items():
            try:
                live.append(check_live_signals(city_id, city))
            except Exception as exc:  # a failing city must not lose the whole run
                print(f"  {city_id}: live check failed ({type(exc).__name__})")
                structural.append({"severity": "error", "city": city_id,
                                   "locality": "(live)",
                                   "message": f"live signal check failed: {type(exc).__name__}"})
            time.sleep(args.delay)

    ledger, flagged, abort = {}, [], None
    if args.rent_check:
        print(f"Grounded rent cross-check: limit={args.limit}, delay={args.delay}s")
        ledger, abort = cross_check_rents(
            cities, args.ledger, args.limit, args.delay,
            args.min_sample, args.delta_threshold)
        for entry in ledger.values():
            flag = assess_disagreement(entry, args.min_sample, args.delta_threshold)
            if flag:
                flagged.append(flag)

    report = build_report(structural, coverage, flagged, ledger, abort, live)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(report, encoding="utf-8")

    # Scoring invariant failures are publish-blocking too, not advisory.
    scoring_errors = [f for l in live for f in l.get("findings", [])
                      if f["severity"] == "error"]
    errors = sum(1 for f in structural if f["severity"] == "error") + len(scoring_errors)
    print(f"\nReport written to {args.report}")
    print(f"Structural errors: {errors} | flagged rent disagreements: {len(flagged)}")
    if abort:
        print(f"NOTE: {abort}")
    # Non-zero only on a hard gate failure, so this can run in CI.
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
