"""Vertex AI Gemini: NL->criteria, explanations, Ask NestIQ.

India-first: weights cover affordability, safety, commute, lifestyle and
AIR QUALITY (the defining APAC livability factor). Every call degrades
gracefully so the API always returns something usable.
"""
from __future__ import annotations

from pydantic import BaseModel, Field

from .config import settings

INDIA_DEFAULT = {"affordability": 20, "safety": 20, "commute": 20, "lifestyle": 15, "air_quality": 25}
_client = None


def _get_client():
    global _client
    if _client is None:
        from google import genai
        _client = genai.Client(vertexai=True, project=settings.gcp_project, location=settings.gcp_location)
    return _client


def _generate(**kwargs):
    """generate_content that self-heals a stale/closed client.

    The cached Vertex client can intermittently land in a "client has been
    closed" state; when that happens we rebuild it once and retry so the call
    succeeds instead of silently degrading to default weights.
    """
    global _client
    try:
        return _get_client().models.generate_content(**kwargs)
    except Exception as e:  # noqa: BLE001
        if "closed" in str(e).lower():
            _client = None
            return _get_client().models.generate_content(**kwargs)
        raise


class Criteria(BaseModel):
    budget: int = Field(default=30000, description="monthly rent budget in INR")
    w_affordability: int = 20
    w_safety: int = 20
    w_commute: int = 20
    w_lifestyle: int = 15
    w_air_quality: int = 25
    anchor: str = Field(default="", description="commute destination if mentioned")


def parse_query(text: str, budget: float | None = None) -> dict:
    if not text.strip():
        return {"budget": budget or 30000, "weights": dict(INDIA_DEFAULT), "anchor": ""}
    try:
        from google.genai import types
        prompt = (
            "Extract home-search preferences and set weights (0-100, need not sum to 100) for how much "
            "the user cares about: affordability, safety, commute, lifestyle (amenities/nightlife), and "
            "AIR QUALITY (clean air / low pollution). Budget is monthly rent in INR.\n\n"
            f"Request: \"{text}\""
        )
        resp = _generate(
            model=settings.gemini_model, contents=prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json", response_schema=Criteria, temperature=0.1),
        )
        c: Criteria = resp.parsed
        weights = {"affordability": c.w_affordability, "safety": c.w_safety, "commute": c.w_commute,
                   "lifestyle": c.w_lifestyle, "air_quality": c.w_air_quality}
        final_budget = budget or c.budget or 30000
        if final_budget <= 0:
            final_budget = 30000
        return {"budget": final_budget, "weights": weights, "anchor": c.anchor}
    except Exception as e:  # noqa: BLE001
        print(f"[gemini] parse_query fallback: {e}")
        return {"budget": budget or 30000, "weights": dict(INDIA_DEFAULT), "anchor": ""}


def explain(name: str, subscores: dict, rent: int, note: str) -> str:
    try:
        prompt = (
            f"In 2 concise sentences, explain why {name} is a good place to live for this user, grounded in "
            f"these 0-100 scores {subscores}, a median rent of ₹{rent:,}/month, and {note}. Be specific, no fluff."
        )
        resp = _generate(model=settings.gemini_model, contents=prompt)
        return (resp.text or "").strip()
    except Exception as e:  # noqa: BLE001
        print(f"[gemini] explain fallback: {e}")
        top = max(subscores, key=subscores.get)
        return f"{name} scores especially well on {top}, with rent around ₹{rent:,}/month. {note}."


INDIA_SQL_COLUMNS = (
    "city, id, name, median_rent (INR per month), aqi (Air Quality Index, LOWER is cleaner), "
    "aqi_category, amenity_count, commute_min (drive minutes to the city work hub), "
    "safety_est (0-100), sub_affordability, sub_safety, sub_commute, sub_lifestyle, "
    "sub_air_quality (0-100 pillar sub-scores), fit_score (0-100 overall match)"
)


def _clean_sql(text: str) -> str:
    """Strip markdown fences / prose from an LLM SQL answer -> one statement."""
    t = (text or "").strip()
    if "```" in t:
        t = t.split("```")[1] if len(t.split("```")) > 1 else t
    t = t.replace("sql\n", "").replace("SQL\n", "").strip().strip("`").strip()
    return t.split(";")[0].strip()


def nl_to_sql(question: str, city: str, table_ref: str) -> str:
    """Translate a natural-language question into one BigQuery SELECT."""
    prompt = (
        "You translate a question into exactly ONE BigQuery Standard SQL SELECT over a single table of "
        f"Indian residential localities.\nTable: `{table_ref}`\nColumns: {INDIA_SQL_COLUMNS}\n"
        "Rules: output ONLY the SQL (no markdown, no prose, no semicolon); it MUST be a single SELECT; "
        f"ALWAYS include WHERE city = '{city}'; return about 5 rows (LIMIT 5) so the answer has context — "
        "use LIMIT 1 ONLY if the question is explicitly about a single top/bottom item; remember LOWER aqi = "
        "cleaner air and rent is INR/month. Select the columns needed to answer, and include `name`.\n"
        f'Question: "{question}"'
    )
    resp = _generate(model=settings.gemini_model, contents=prompt)
    return _clean_sql(resp.text)


def ask(question: str, context: str) -> str:
    try:
        prompt = (
            "You are NestIQ, an AI neighborhood assistant for Indian cities. Answer concisely (2-4 sentences) "
            "using ONLY the data context (rent in INR, AQI where lower is cleaner). If the context lacks the "
            f"answer, say so.\n\nContext:\n{context}\n\nQuestion: {question}"
        )
        resp = _generate(model=settings.gemini_model, contents=prompt)
        return (resp.text or "").strip()
    except Exception as e:  # noqa: BLE001
        print(f"[gemini] ask fallback: {e}")
        return "I couldn't reach the assistant just now — explore the locality's scores and AQI on its detail page."
