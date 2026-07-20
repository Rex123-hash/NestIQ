"""Vertex AI Gemini: NL->criteria, explanations, Ask NestIQ.

India-first: weights cover affordability, safety, commute, lifestyle and
AIR QUALITY (the defining APAC livability factor). Every call degrades
gracefully so the API always returns something usable.
"""
from __future__ import annotations

import json
import re
import statistics
from datetime import date, datetime, timezone

from pydantic import BaseModel, Field

from .config import settings
from .india import INDIA_DEFAULT_WEIGHTS as INDIA_DEFAULT
_client = None


def _get_client():
    global _client
    if _client is None:
        from google import genai
        from google.genai import types
        # Bounded timeout so a hung model call can't hold a request open forever.
        _client = genai.Client(
            vertexai=True, project=settings.gcp_project, location=settings.gcp_location,
            http_options=types.HttpOptions(timeout=settings.gemini_timeout_ms),
        )
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


class RentObservation(BaseModel):
    monthlyRent: int
    observedOn: str = ""
    sourceTitle: str = ""
    evidenceType: str = "listing_or_market_page"


class RentExtraction(BaseModel):
    observations: list[RentObservation] = Field(default_factory=list)


class PulseItem(BaseModel):
    headline: str
    summary: str
    category: str
    severity: str
    affectedArea: str
    observedOn: str
    sourceTitle: str


class PulseExtraction(BaseModel):
    items: list[PulseItem] = Field(default_factory=list)


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
        # Ignore pillars with no score (e.g. air quality when the reading is
        # unavailable) so the fallback never compares None with an int.
        valid = {k: v for k, v in subscores.items() if v is not None}
        if valid:
            top = max(valid, key=valid.get)
            return f"{name} scores especially well on {top}, with rent around ₹{rent:,}/month. {note}."
        return f"{name} has rent around ₹{rent:,}/month. {note}."


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


def _grounding_citations(resp, limit: int = 8) -> list[dict]:
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
    return citations[:limit]


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
        citations = _grounding_citations(resp, 6)
        return {
            "summary": summary,
            "citations": citations[:6],
            "status": "available" if summary else "no_evidence",
        }
    except Exception as e:  # noqa: BLE001
        print(f"[gemini] web_reviews fallback: {e}")
        message = str(e).lower()
        if "permission_denied" in message or "403" in message or "aiplatform.endpoints.predict" in message:
            code = "vertex_permission_denied"
        elif "quota" in message or "resource_exhausted" in message or "429" in message:
            code = "vertex_quota_exhausted"
        else:
            code = "grounding_unavailable"
        # A service/IAM failure is not evidence that a locality has no public
        # discussion. Return an explicit retryable state so the UI never turns
        # an infrastructure error into a claim about the community.
        return {
            "summary": "",
            "citations": [],
            "status": "temporarily_unavailable",
            "errorCode": code,
        }


_PULSE_CATEGORIES = {"civic", "mobility", "environment", "safety", "development", "utilities"}
_PULSE_SEVERITIES = {"low", "informational", "moderate", "high"}


def analyze_pulse_items(raw: dict, citations: list[dict], today: date | None = None) -> list[dict]:
    """Validate model-found civic items against actual grounding citations."""
    today = today or datetime.now(timezone.utc).date()
    sources = [c for c in citations if c.get("uri") and c.get("title")]
    validated = []
    for item in raw.get("items", []) if isinstance(raw, dict) else []:
        if not isinstance(item, dict):
            continue
        headline = str(item.get("headline") or "").strip()[:140]
        summary = str(item.get("summary") or "").strip()[:280]
        area = str(item.get("affectedArea") or "").strip()[:100]
        category = str(item.get("category") or "").strip().lower()
        severity = str(item.get("severity") or "").strip().lower()
        observed_on, _ = _fresh_date(item.get("observedOn"), today)
        if not all((headline, summary, area, observed_on)) or category not in _PULSE_CATEGORIES or severity not in _PULSE_SEVERITIES:
            continue
        age = (today - date.fromisoformat(observed_on)).days
        if age > 30:
            continue
        wanted = str(item.get("sourceTitle") or "").strip().lower()
        citation = next((c for c in sources if wanted and (wanted in c["title"].lower() or c["title"].lower() in wanted)), None)
        if not citation:
            continue
        validated.append({
            "headline": headline, "summary": summary, "affectedArea": area,
            "category": category, "severity": severity, "observedOn": observed_on,
            "freshness": "Today" if age == 0 else f"{age} day{'s' if age != 1 else ''} ago",
            "source": citation["title"], "sourceUrl": citation["uri"],
        })
    return validated[:4]


def _parse_pulse_ledger(text: str) -> dict:
    """Parse the requested civic ledger locally to avoid a second model call."""
    items = []
    for raw_line in text.splitlines():
        parts = [part.strip() for part in raw_line.strip(" -*•\t").split("|")]
        if len(parts) < 7:
            continue
        observed_on, category, severity, area, headline, summary = parts[:6]
        source_title = " | ".join(parts[6:]).strip()
        items.append({
            "observedOn": observed_on,
            "category": category,
            "severity": severity,
            "affectedArea": area,
            "headline": headline,
            "summary": summary,
            "sourceTitle": source_title,
        })
    return {"items": items[:4]}


def locality_pulse(name: str, city: str) -> dict:
    """Return grounded, current civic updates without affecting any score."""
    try:
        from google.genai import types
        search_prompt = (
            f"Search the web for current civic and daily-life developments affecting {name}, {city}, India. "
            "Create a machine-readable evidence ledger with one event per line, exactly: "
            "YYYY-MM-DD | category | severity | affected area | headline | concise summary | exact cited source page title. "
            "Only include items published or verified in the last 30 days. "
            "Prefer official civic notices and reputable local reporting. Do not invent items; if no reliable "
            "recent evidence exists, say that plainly. Categories: civic, mobility, environment, safety, "
            "development, utilities. Severities: low, informational, moderate, high."
        )
        resp = _generate(model=settings.gemini_model, contents=search_prompt, config=types.GenerateContentConfig(
            tools=[types.Tool(google_search=types.GoogleSearch())], temperature=0.2,
        ))
        ledger = (resp.text or "").strip()
        citations = _grounding_citations(resp, 8)
        if not ledger or not citations:
            return {"status": "no_evidence", "items": [], "citations": citations}
        local_items = analyze_pulse_items(_parse_pulse_ledger(ledger), citations)
        if local_items:
            return {"status": "available", "items": local_items, "citations": citations}
        source_titles = "\n".join(f"- {c['title']}" for c in citations)
        extract_prompt = (
            "Extract at most 4 civic updates from the grounded ledger as JSON. Copy facts, dates and source titles "
            "only from the ledger. Use sourceTitle exactly as written in the allowed source-title list. Exclude any "
            "item without a YYYY-MM-DD date or a matching allowed source.\n\n"
            f"ALLOWED SOURCE TITLES:\n{source_titles}\n\nGROUNDED EVIDENCE LEDGER:\n{ledger}"
        )
        extracted = _generate(model=settings.gemini_model, contents=extract_prompt, config=types.GenerateContentConfig(
            response_mime_type="application/json", response_schema=PulseExtraction, temperature=0,
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        ))
        parsed = extracted.parsed
        raw = parsed.model_dump() if hasattr(parsed, "model_dump") else _json_object(extracted.text)
        items = analyze_pulse_items(raw, citations)
        return {"status": "available" if items else "no_evidence", "items": items, "citations": citations}
    except Exception as e:  # noqa: BLE001
        print(f"[gemini] locality_pulse fallback: {e}")
        return {"status": "temporarily_unavailable", "items": [], "citations": [], "errorCode": "grounding_unavailable"}


def _json_object(text: str) -> dict:
    cleaned = (text or "").strip()
    if "```" in cleaned:
        parts = cleaned.split("```")
        cleaned = next((p for p in parts if "{" in p and "}" in p), cleaned)
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start < 0 or end <= start:
        return {}
    try:
        return json.loads(cleaned[start:end + 1])
    except (TypeError, ValueError):
        return {}


def _rent_number(value) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        number = round(value)
    else:
        digits = re.sub(r"[^0-9.]", "", str(value or ""))
        if not digits:
            return None
        try:
            number = round(float(digits))
        except ValueError:
            return None
    return number if 3000 <= number <= 500000 else None


def _fresh_date(value: str | None, today: date | None = None) -> tuple[str | None, bool]:
    if not value:
        return None, False
    today = today or datetime.now(timezone.utc).date()
    try:
        parsed = date.fromisoformat(str(value)[:10])
    except ValueError:
        return None, False
    age = (today - parsed).days
    return parsed.isoformat(), 0 <= age <= 90


def analyze_rent_observations(raw: dict, citations: list[dict], today: date | None = None) -> dict:
    """Validate grounded observations and calculate the range locally.

    Gemini finds candidate evidence; deterministic code owns validation,
    outlier removal, the median and the confidence label.
    """
    observations, seen = [], set()
    for item in raw.get("observations", []) if isinstance(raw, dict) else []:
        if not isinstance(item, dict):
            continue
        rent = _rent_number(item.get("monthlyRent"))
        if rent is None:
            continue
        observed_on, fresh = _fresh_date(item.get("observedOn"), today)
        title = str(item.get("sourceTitle") or "Grounded web result").strip()[:160]
        key = (rent, title.lower())
        if key in seen:
            continue
        seen.add(key)
        observations.append({
            "monthlyRent": rent,
            "observedOn": observed_on,
            "fresh": fresh,
            "sourceTitle": title,
            "evidenceType": str(item.get("evidenceType") or "listing_or_market_page")[:80],
            "bedrooms": _bedroom_count(item.get("bedrooms")),
        })

    # Tukey fences prevent one luxury/incorrect listing from defining the range.
    if len(observations) >= 4:
        rents = sorted(o["monthlyRent"] for o in observations)
        q1, _, q3 = statistics.quantiles(rents, n=4, method="inclusive")
        iqr = q3 - q1
        lo_fence, hi_fence = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        observations = [o for o in observations if lo_fence <= o["monthlyRent"] <= hi_fence]

    rents = sorted(o["monthlyRent"] for o in observations)
    grounded_sources = len({(c.get("title") or c.get("uri") or "").strip().lower() for c in citations if c.get("uri")})
    if len(rents) < 2 or grounded_sources == 0:
        return {
            "status": "no_evidence",
            "confidence": "unavailable",
            "confidenceScore": 0,
            "observations": observations,
            "citations": citations,
            "limitation": "Not enough citation-backed rent observations were returned to verify a market range.",
        }

    median = round(statistics.median(rents))
    q1, q3 = (statistics.quantiles(rents, n=4, method="inclusive")[0::2]
              if len(rents) >= 4 else (min(rents), max(rents)))
    fresh_count = sum(o["fresh"] for o in observations)
    dated_count = sum(o["observedOn"] is not None for o in observations)
    fresh_ratio = fresh_count / dated_count if dated_count else 0.0
    agreement = max(0.0, 1.0 - ((q3 - q1) / max(median, 1)))
    score = round(
        min(len(rents) / 8, 1) * 35
        + min(grounded_sources / 3, 1) * 25
        + fresh_ratio * 20
        + agreement * 20
    )
    if score >= 80 and len(rents) >= 8 and grounded_sources >= 3 and fresh_ratio >= 0.5:
        confidence = "high"
    elif score >= 50 and len(rents) >= 3 and grounded_sources >= 2:
        confidence = "medium"
    else:
        confidence = "low"
    # Group by unit size so a reader compares like with like. A median blended
    # across 1 BHK and 4 BHK describes no real home, and the catalog's listed
    # rent states no size, so the breakdown is what makes the two comparable.
    by_size: dict[str, dict] = {}
    for obs in observations:
        beds = obs.get("bedrooms")
        if beds is None:
            continue  # unknown size stays unknown rather than joining a bucket
        by_size.setdefault(str(beds), []).append(obs["monthlyRent"])
    by_size = {
        size: {"median": round(statistics.median(values)), "count": len(values)}
        for size, values in sorted(by_size.items())
    }

    return {
        "status": "available",
        "confidence": confidence,
        "confidenceScore": score,
        "medianRent": median,
        "bySize": by_size,
        "rangeLow": round(q1),
        "rangeHigh": round(q3),
        "sampleSize": len(rents),
        "sourceCount": grounded_sources,
        "freshObservationCount": fresh_count,
        "observations": observations[:12],
        "citations": citations,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "method": "Gemini Google Search grounding; numeric validation, outlier filtering and median calculated by NestIQ.",
        "limitation": "A locality-level market estimate, not a guaranteed quote or an individual property recommendation.",
    }


_WORD_BEDROOMS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5}


def _bedroom_count(value) -> int | None:
    """Read a bedroom count from '2', '2 BHK', '3BHK', 'two-bedroom'.

    Returns None when absent or implausible: an unknown size must stay unknown
    rather than be guessed into a bucket it may not belong to.
    """
    if value is None:
        return None
    text = str(value).strip().lower()
    if not text:
        return None
    match = re.search(r"(\d+)\s*(?:bhk|bedroom|bed|br)?\b", text)
    if match:
        count = int(match.group(1))
        return count if 1 <= count <= 6 else None
    for word, count in _WORD_BEDROOMS.items():
        if word in text:
            return count
    return None


def _parse_rent_ledger(text: str) -> dict:
    """Parse the requested pipe-delimited ledger without another model call."""
    observations = []
    for raw_line in text.splitlines():
        parts = [part.strip() for part in raw_line.strip(" -*•\t").split("|")]
        if len(parts) < 3:
            continue
        rent = _rent_number(parts[0])
        if rent is None:
            continue
        observed_on = parts[1] if re.fullmatch(r"\d{4}-\d{2}-\d{2}", parts[1]) else ""
        title = parts[2].strip()
        if not title:
            continue
        observations.append({
            "monthlyRent": rent,
            "observedOn": observed_on,
            "sourceTitle": title,
            # Optional 4th field. Older three-field ledgers stay valid.
            "bedrooms": _bedroom_count(parts[3]) if len(parts) > 3 else None,
        })
    return {"observations": observations[:12]}


def verify_rent(name: str, city: str) -> dict:
    """On-demand, citation-backed 1-bedroom rent verification."""
    try:
        from google.genai import types
        # Start broad and stop as soon as the ledger has enough diverse
        # evidence. A second pass is a fallback, not an unconditional delay.
        search_passes = [
            "Search across 99acres, MagicBricks, Housing.com, NoBroker, SquareYards and other current Indian rental pages; use multiple independent domains.",
            "Fill any remaining evidence gaps using different current rental or locality-market pages, avoiding sources already represented.",
        ]
        ledger_parts, citations, seen_uris, search_errors = [], [], set(), []
        for focus in search_passes:
            search_prompt = (
                f"Use Google Search to find current Indian rental evidence for {name}, {city}. {focus} Find explicit "
                "monthly rents for unfurnished or semi-furnished residential homes across the common sizes "
                "(1 BHK, 2 BHK and 3 BHK), not one size only. Produce an evidence ledger with one observation per "
                "line in this form: INR monthly rent | visible YYYY-MM-DD date or unknown | source page title | "
                "bedroom count as shown (for example 2 BHK), or unknown. Include up to 8 distinct observations "
                "spanning more than one size where the sources support it, and cite the web sources. Exclude sale "
                "prices, deposits, daily rates, PG beds, hostels, shared rooms and any value not explicitly shown by "
                "a source. Never infer a bedroom count that a source does not state. Do not calculate a median and "
                "do not guess missing prices or dates."
            )
            try:
                grounded = _generate(
                    model=settings.gemini_model,
                    contents=search_prompt,
                    config=types.GenerateContentConfig(
                        tools=[types.Tool(google_search=types.GoogleSearch())],
                        temperature=0.1,
                    ),
                )
                text = (grounded.text or "").strip()
                if text:
                    ledger_parts.append(text)
                for citation in _grounding_citations(grounded, 8):
                    if citation["uri"] not in seen_uris:
                        seen_uris.add(citation["uri"])
                        citations.append(citation)
                parsed_so_far = _parse_rent_ledger("\n".join(ledger_parts))
                if len(citations) >= 3 and len(parsed_so_far["observations"]) >= 6:
                    break
            except Exception as search_error:  # noqa: BLE001
                search_errors.append(search_error)
        grounded_text = "\n\n".join(ledger_parts)
        if not grounded_text or not citations:
            if search_errors and not grounded_text:
                raise search_errors[-1]
            return analyze_rent_observations({}, citations)

        # The requested ledger is deliberately machine-readable. Parse it
        # locally first, avoiding another slow/billable model call. Retain the
        # structured extractor only as a fallback for malformed ledgers.
        locally_parsed = _parse_rent_ledger(grounded_text)
        if len(locally_parsed["observations"]) >= 2:
            return analyze_rent_observations(locally_parsed, citations)

        extract_prompt = (
            "Extract at most 12 distinct rent observations from the evidence ledgers below. Copy only explicit monthly INR "
            "amounts for 1 BHK/one-bedroom homes. Use an empty observedOn when the date is unknown. Never add a "
            "number, date, or source title that is not present in the ledger.\n\n"
            f"GROUNDED EVIDENCE LEDGER:\n{grounded_text}"
        )
        extracted = _generate(
            model=settings.gemini_model,
            contents=extract_prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=RentExtraction,
                temperature=0,
                thinking_config=types.ThinkingConfig(thinking_budget=0),
            ),
        )
        parsed = extracted.parsed
        raw = parsed.model_dump() if hasattr(parsed, "model_dump") else _json_object(extracted.text)
        return analyze_rent_observations(raw, citations)
    except Exception as e:  # noqa: BLE001
        print(f"[gemini] verify_rent fallback: {e}")
        message = str(e).lower()
        if "permission_denied" in message or "403" in message or "aiplatform.endpoints.predict" in message:
            code = "vertex_permission_denied"
        elif any(x in message for x in ("quota", "resource_exhausted", "429")):
            code = "vertex_quota_exhausted"
        else:
            code = "grounding_unavailable"
        return {
            "status": "temporarily_unavailable",
            "confidence": "unavailable",
            "confidenceScore": 0,
            "observations": [],
            "citations": [],
            "errorCode": code,
            "limitation": "Grounded rent verification could not be reached. The curated estimate remains unchanged.",
        }
