"""API request/response models."""
from pydantic import BaseModel


class SearchRequest(BaseModel):
    query: str = ""
    budget: float | None = None
    city: str | None = None


class AskRequest(BaseModel):
    question: str
    neighborhoodId: str | None = None
    city: str | None = None
