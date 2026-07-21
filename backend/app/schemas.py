"""API request/response models."""
from typing import Literal

from pydantic import BaseModel, Field


class SearchRequest(BaseModel):
    query: str = ""
    budget: float | None = None
    city: str | None = None
    # Optional server-resolved search preset id (e.g. "family_health"). The client
    # never sends raw weights; only a preset id resolved against a backend allowlist.
    preset: str | None = None


class AskTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=1500)


class AskRequest(BaseModel):
    question: str
    neighborhoodId: str | None = None
    city: str | None = None
    # Stateless, bounded context. The client sends only recent visible turns;
    # conversations are not persisted by the API or silently attached to users.
    history: list[AskTurn] = Field(default_factory=list, max_length=6)
