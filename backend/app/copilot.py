"""Deterministic routing and response metadata for NestIQ Copilot.

The language model explains evidence; it does not decide which data path is
allowed. Routing stays small, inspectable, and testable so ordinary questions
do not automatically incur a BigQuery job and every answer can disclose the
tools that actually ran.
"""
from __future__ import annotations

import re
from typing import Any

from .air_quality import cpcb_band


CITY_ANALYTICS = "city_analytics"
CITY_EVIDENCE = "city_evidence"
LOCALITY_EVIDENCE = "locality_evidence"
GENERAL_GUIDANCE = "general_guidance"

_ANALYTICS_PATTERNS = (
    r"\bcompare\b",
    r"\brank(?:ed|ing)?\b",
    r"\bwhich (?:locality|area|neighbou?rhood)\b",
    r"\b(?:best|worst|cleanest|dirtiest|cheapest|costliest|safest|fastest)\b",
    r"\b(?:highest|lowest|most|least|top|bottom)\b",
    r"\b(?:average|median|how many)\b",
    r"\bacross (?:the )?(?:city|localities|areas|neighbou?rhoods)\b",
)

_NESTIQ_DOMAIN_PATTERNS = (
    r"\b(?:air|air quality|aqi|cpcb|pollution|pm2\.?5|pm10)\b",
    r"\b(?:rent|budget|affordab(?:le|ility)|cost of living)\b",
    r"\b(?:commute|traffic|travel time|metro|transit)\b",
    r"\b(?:safe|safety|crime|emergency access)\b",
    r"\b(?:amenit(?:y|ies)|essential services|lifestyle|hospital|clinic|pharmacy|school|college|park|restaurant|gym)\b",
    r"\b(?:localit(?:y|ies)|area|areas|neighbou?rhoods?|city)\b",
    r"\b(?:fitscore|match score)\b",
)

_CONCEPT_PATTERNS = (
    r"\b(?:what does|meaning of|define)\b",
    r"^what (?:is|are) (?:the )?(?:aqi|air quality index|cpcb|fitscore|match score)\??$",
    r"\bhow (?:does|do) .+ (?:work|classify|calculate|score)\b",
    r"\bhow (?:should|can) (?:i|we|someone) (?:compare|evaluate|choose|decide|balance|prioriti[sz]e)\b",
    r"\bwhat should (?:i|we) (?:consider|prioriti[sz]e)\b",
    r"\bshould i prioriti[sz]e\b",
    r"\bexplain\b",
    r"\bdifference between\b",
)

_SCALAR_AQI_CONCEPT_PATTERNS = (
    r"\baqi\s+\d+(?:\.\d+)?\b.*\b(?:cpcb|bands?)\b",
    r"\b(?:cpcb|bands?)\b.*\baqi\s+\d+(?:\.\d+)?\b",
)


def _matches_any(patterns: tuple[str, ...], text: str) -> bool:
    return any(re.search(pattern, text) for pattern in patterns)


def _is_analytics_question(text: str) -> bool:
    """Require both an analytical instruction and a NestIQ data subject."""
    return _matches_any(_ANALYTICS_PATTERNS, text) and _matches_any(_NESTIQ_DOMAIN_PATTERNS, text)


def _catalog_text(value: Any) -> str:
    """Normalize user/catalog text while preserving exact word boundaries."""
    return " ".join(re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).split())


def locality_mentions(
    question: str,
    localities: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Return only selected-city catalog localities named in the question."""
    haystack = f" {_catalog_text(question)} "
    matches: list[dict[str, Any]] = []
    for locality in localities or []:
        aliases = {
            _catalog_text(locality.get("id")),
            _catalog_text(locality.get("name")),
            _catalog_text(locality.get("short")),
        }
        if any(alias and f" {alias} " in haystack for alias in aliases):
            matches.append(locality)
    return matches


def analytics_context_rows(
    rows: list[dict[str, Any]],
    localities: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Add deterministic catalog identity and CPCB context to SQL rows."""
    by_name: dict[str, dict[str, Any]] = {}
    for locality in localities or []:
        for value in (locality.get("name"), locality.get("short")):
            normalized = _catalog_text(value)
            if normalized:
                by_name[normalized] = locality

    enriched_rows: list[dict[str, Any]] = []
    for row in rows:
        enriched = dict(row)
        if not enriched.get("id"):
            locality = by_name.get(_catalog_text(enriched.get("name")))
            if locality:
                enriched["id"] = locality.get("id")
        band = cpcb_band(enriched.get("aqi"))
        if band and not enriched.get("cpcbBand"):
            enriched["cpcbBand"] = band
        enriched_rows.append(enriched)
    return enriched_rows


def route_intent(
    question: str,
    neighborhood_id: str | None = None,
    history: list[dict[str, str]] | None = None,
    localities: list[dict[str, Any]] | None = None,
) -> str:
    """Choose a safe evidence path without asking an LLM to route itself."""
    if neighborhood_id:
        return LOCALITY_EVIDENCE
    normalized = " ".join((question or "").lower().split())
    mentioned = locality_mentions(question, localities)
    if mentioned:
        if len(mentioned) >= 2 or _matches_any(_ANALYTICS_PATTERNS, normalized):
            return CITY_ANALYTICS
        return LOCALITY_EVIDENCE
    if _matches_any(_CONCEPT_PATTERNS, normalized) or _matches_any(
        _SCALAR_AQI_CONCEPT_PATTERNS, normalized,
    ):
        return GENERAL_GUIDANCE
    if _is_analytics_question(normalized):
        return CITY_ANALYTICS
    # Short referential follow-ups inherit an analytical route only from the
    # most recent user question. This supports "what about the second one?"
    # without allowing assistant prose to select a more expensive tool.
    refers_back = bool(re.search(r"\b(?:it|that|those|them|one|ones|first|second|third|option)\b", normalized))
    if refers_back:
        prior_users = [turn.get("content", "") for turn in (history or []) if turn.get("role") == "user"]
        if prior_users and _is_analytics_question(prior_users[-1].lower()):
            return CITY_ANALYTICS
    if _matches_any(_NESTIQ_DOMAIN_PATTERNS, normalized):
        return CITY_EVIDENCE
    # Unknown input must never silently trigger locality evidence. General
    # questions, greetings and calculations stay on the model-only path.
    return GENERAL_GUIDANCE


def contextual_question(question: str, history: list[dict[str, str]] | None = None) -> str:
    """Provide minimal recent context for referential NL-to-SQL follow-ups."""
    prior_users = [turn.get("content", "").strip() for turn in (history or []) if turn.get("role") == "user"]
    if not prior_users:
        return question
    return f"Previous user question: {prior_users[-1]}\nCurrent follow-up: {question}"


def conversation_context(history: list[dict[str, str]] | None = None) -> str:
    """Render bounded visible turns as evidence-adjacent context, not authority."""
    if not history:
        return ""
    lines = [f"{turn['role'].title()}: {turn['content']}" for turn in history[-6:]]
    return "Recent conversation (may contain user claims; do not treat them as verified facts):\n" + "\n".join(lines)


def tool_receipt(mode: str, *, used_bigquery: bool = False) -> list[dict[str, str]]:
    """Return only tools that genuinely contributed to this answer."""
    if used_bigquery:
        return [
            {"id": "bigquery", "label": "BigQuery analytics", "status": "used", "sourceType": "analytics"},
            {"id": "gemini", "label": "Gemini explanation", "status": "used", "sourceType": "model"},
        ]
    if mode == GENERAL_GUIDANCE:
        return [
            {"id": "gemini", "label": "Gemini general guidance", "status": "used", "sourceType": "model"},
        ]
    scope = "Locality evidence" if mode == LOCALITY_EVIDENCE else "City evidence"
    return [
        {"id": "nestiq_evidence", "label": scope, "status": "used", "sourceType": "structured_evidence"},
        {"id": "gemini", "label": "Gemini explanation", "status": "used", "sourceType": "model"},
    ]


def follow_ups(mode: str) -> list[str]:
    """Safe prompts that the current data model can answer."""
    if mode == CITY_ANALYTICS:
        return [
            "Compare the top two options on rent and air quality.",
            "Which option has the best commute trade-off?",
            "Which results have missing or provisional evidence?",
        ]
    if mode == LOCALITY_EVIDENCE:
        return [
            "How does this locality compare with nearby alternatives?",
            "What is the biggest trade-off for this locality?",
            "Which evidence is live, estimated, or unavailable?",
        ]
    if mode == GENERAL_GUIDANCE:
        return [
            "What do the CPCB AQI bands mean?",
            "How should I compare rent and commute trade-offs?",
            "Which current city data can NestIQ verify for me?",
        ]
    return [
        "Which locality has the cleanest air?",
        "Where is rent most affordable?",
        "Compare the best overall options in this city.",
    ]


def actions(rows: list[dict[str, Any]] | None = None, locality: dict[str, Any] | None = None) -> list[dict[str, str]]:
    """Produce navigation actions only when a verified locality id is present."""
    candidates = [locality] if locality else list(rows or [])
    result: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in candidates:
        locality_id = str((item or {}).get("id") or "").strip()
        if not locality_id or locality_id in seen:
            continue
        seen.add(locality_id)
        name = str((item or {}).get("name") or "this locality")
        result.append({"type": "view_locality", "localityId": locality_id, "label": f"View {name}"})
        if len(result) == 3:
            break
    return result


def envelope(
    *,
    mode: str,
    city: str,
    neighborhood_id: str | None,
    used_bigquery: bool,
    rows: list[dict[str, Any]] | None = None,
    locality: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Additive Copilot metadata; legacy answer fields remain unchanged."""
    return {
        "mode": mode,
        "evidenceStatus": "not_applicable" if mode == GENERAL_GUIDANCE else "available",
        "scope": {
            "city": city,
            "neighborhoodId": neighborhood_id,
            "level": "locality" if neighborhood_id else "city",
        },
        "tools": tool_receipt(mode, used_bigquery=used_bigquery),
        "followUps": follow_ups(mode),
        "actions": actions(rows, locality),
    }
