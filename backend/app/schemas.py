"""API request/response models."""
from pydantic import BaseModel


class SearchRequest(BaseModel):
    query: str = ""
    budget: float | None = None
    city: str | None = None
    # Optional server-resolved search preset id (e.g. "family_health"). The client
    # never sends raw weights; only a preset id resolved against a backend allowlist.
    preset: str | None = None


class AskRequest(BaseModel):
    question: str
    neighborhoodId: str | None = None
    city: str | None = None
