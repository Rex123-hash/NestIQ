"""Deterministic routing and response metadata for NestIQ Copilot.

The language model explains evidence; it does not decide which data path is
allowed. Routing stays small, inspectable, and testable so ordinary questions
do not automatically incur a BigQuery job and every answer can disclose the
tools that actually ran.
"""
from __future__ import annotations

import re
from typing import Any


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

_GENERAL_PATTERNS = (
    r"\bwhat (?:is|does|are)\b",
    r"\bhow (?:does|do|can)\b",
    r"\bwhy does\b",
    r"\bexplain\b",
    r"\bmeaning of\b",
    r"\bdifference between\b",
)


def route_intent(
    question: str,
    neighborhood_id: str | None = None,
    history: list[dict[str, str]] | None = None,
) -> str:
    """Choose a safe evidence path without asking an LLM to route itself."""
    if neighborhood_id:
        return LOCALITY_EVIDENCE
    normalized = " ".join((question or "").lower().split())
    if any(re.search(pattern, normalized) for pattern in _ANALYTICS_PATTERNS):
        return CITY_ANALYTICS
    # Short referential follow-ups inherit an analytical route only from the
    # most recent user question. This supports "what about the second one?"
    # without allowing assistant prose to select a more expensive tool.
    refers_back = bool(re.search(r"\b(?:it|that|those|them|one|ones|first|second|third|option)\b", normalized))
    if refers_back:
        prior_users = [turn.get("content", "") for turn in (history or []) if turn.get("role") == "user"]
        if prior_users and any(re.search(pattern, prior_users[-1].lower()) for pattern in _ANALYTICS_PATTERNS):
            return CITY_ANALYTICS
    if any(re.search(pattern, normalized) for pattern in _GENERAL_PATTERNS):
        return GENERAL_GUIDANCE
    return CITY_EVIDENCE


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
