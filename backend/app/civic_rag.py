"""Citation-locked retrieval over a controlled civic-document catalog."""
from __future__ import annotations

import json
import math
import re
from datetime import date
from functools import lru_cache
from pathlib import Path

CATALOG_PATH = Path(__file__).resolve().parent.parent / "data" / "civic_knowledge.json"
_TOKEN = re.compile(r"[a-z0-9]+")
_STOP = {"a", "an", "and", "are", "for", "in", "is", "of", "on", "the", "to", "what", "with"}
_LOCALITY_INTENT = {"nearby", "here", "local", "locality", "neighborhood", "neighbourhood", "area", "affect"}


def _tokens(value: str) -> set[str]:
    return {t for t in _TOKEN.findall((value or "").lower()) if len(t) > 1 and t not in _STOP}


@lru_cache(maxsize=1)
def load_catalog() -> tuple[dict, ...]:
    data = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    required = {"id", "title", "authority", "url", "publishedOn", "cityIds", "localityIds", "topics", "text"}
    return tuple(item for item in data if isinstance(item, dict) and required <= item.keys())


def retrieve(question: str, city_id: str, locality_id: str | None = None, limit: int = 4,
             today: date | None = None) -> list[dict]:
    """Rank controlled documents by scope, topic overlap, and freshness."""
    today = today or date.today()
    query = _tokens(question)
    requires_locality_match = bool(locality_id and query & _LOCALITY_INTENT)
    ranked = []
    for doc in load_catalog():
        if city_id not in doc["cityIds"]:
            continue
        locality_scope = doc["localityIds"]
        if locality_scope and locality_id not in locality_scope:
            continue
        if requires_locality_match and locality_id not in locality_scope:
            continue
        haystack = _tokens(" ".join([doc["title"], " ".join(doc["topics"]), doc["text"]]))
        overlap = len(query & haystack)
        if query and overlap == 0:
            continue
        age = max(0, (today - date.fromisoformat(doc["publishedOn"])).days)
        freshness = 1 / (1 + math.log1p(age))
        scope_bonus = 3 if locality_id and locality_id in locality_scope else 1
        score = overlap * 4 + scope_bonus + freshness
        ranked.append((score, doc))
    ranked.sort(key=lambda pair: (pair[0], pair[1]["publishedOn"], pair[1]["id"]), reverse=True)
    return [{**doc, "retrievalScore": round(score, 3)} for score, doc in ranked[:max(1, min(limit, 6))]]


def answer(question: str, city_id: str, locality_id: str | None = None) -> dict:
    """Generate an extractive answer containing only retrieved catalog text."""
    docs = retrieve(question, city_id, locality_id)
    if not docs:
        return {
            "status": "no_evidence", "answer": "", "citations": [], "retrievedCount": 0,
            "method": "Controlled civic-document retrieval with citation-locked extractive answers.",
            "limitation": "The controlled library does not yet contain a relevant official document.",
            "scoreImpact": "none",
        }
    lines = [f"{doc['title']}: {doc['text']}" for doc in docs]
    citations = [{k: doc[k] for k in ("id", "title", "authority", "url", "publishedOn")} for doc in docs]
    return {
        "status": "available", "answer": "\n\n".join(lines), "citations": citations,
        "retrievedCount": len(docs),
        "method": "Controlled civic-document retrieval with citation-locked extractive answers.",
        "limitation": "Coverage is limited to documents already indexed by NestIQ; verify the current official notice.",
        "scoreImpact": "none",
    }
