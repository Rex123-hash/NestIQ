"""Vertex AI Gemini: NL->criteria, explanations, Ask NestIQ.

India-first: weights cover affordability, safety, commute, lifestyle and
AIR QUALITY (the defining APAC livability factor). Every call degrades
gracefully so the API always returns something usable.
"""
from __future__ import annotations

from pydantic import BaseModel, Field

from .config import settings
from .india import INDIA_DEFAULT_WEIGHTS as INDIA_DEFAULT
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
            config=types.GenerateContentConfig(
                response_mime_type="application/json", response_schema=Criteria, temperature=0.1,
                # simple extraction — thinking adds seconds of latency for no quality gain
                thinking_config=types.ThinkingConfig(thinking_budget=0),
            ),
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
            f"these 0-100 scores {subscores}, a median rent of ₹{rent:,}/month, and {note}. Be specific, no fluff. "
            "Do not use em dashes; use commas or full stops instead."
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
        f"ALWAYS include WHERE city = '{city}'; return about 5 rows (LIMIT 5) so the answer has context, "
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
            "using ONLY the data context (rent in INR, AQI where lower is cleaner). "
            "NestIQ compares localities; it does not have individual hostels, PGs, hotels, flats-to-let or "
            "gender-specific listings. If the question asks for something the data doesn't cover, do NOT just "
            "refuse: in one short clause note that NestIQ compares localities rather than individual listings, "
            "then still help by answering the closest useful thing from the context, for example the most "
            "affordable localities and their median rents for the stated budget. If the budget is below every "
            "locality's rent, say so and give the cheapest options. Never mention 'the data context', "
            "'provided context' or 'the dataset'. Do not use em dashes; use commas or full stops instead."
            f"\n\nContext:\n{context}\n\nQuestion: {question}"
        )
        resp = _generate(model=settings.gemini_model, contents=prompt)
        return (resp.text or "").strip()
    except Exception as e:  # noqa: BLE001
        print(f"[gemini] ask fallback: {e}")
        return "I couldn't reach the assistant just now. Explore the locality's scores and AQI on its detail page."


def web_reviews(name: str, city: str) -> dict:
    """What residents say online about a locality, via Gemini + Google Search
    grounding. Returns a sentiment summary plus the source links it cited
    (Reddit, Quora, local news and forums surface here naturally).
    """
    try:
        from google.genai import types
        prompt = (
            f"Search the web for what residents and visitors actually say about living in {name}, {city}, India. "
            "In 3-4 sentences summarize the real sentiment: what people like, what they complain about, and any "
            "recurring themes on safety, traffic, water, noise, greenery and daily life. Base it only on what the "
            "sources say; if there is little discussion, say so plainly. "
            "Do not use em dashes; use commas or full stops instead."
        )
        resp = _generate(
            model=settings.gemini_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())],
                temperature=0.3,
            ),
        )
        summary = (resp.text or "").strip()
        citations, seen = [], set()
        try:
            chunks = resp.candidates[0].grounding_metadata.grounding_chunks or []
            for ch in chunks:
                web = getattr(ch, "web", None)
                uri = getattr(web, "uri", None)
                if uri and uri not in seen:
                    seen.add(uri)
                    citations.append({"title": getattr(web, "title", None) or uri, "uri": uri})
        except Exception:  # noqa: BLE001
            pass
        return {"summary": summary, "citations": citations[:6]}
    except Exception as e:  # noqa: BLE001
        print(f"[gemini] web_reviews fallback: {e}")
        return {"summary": "", "citations": []}
