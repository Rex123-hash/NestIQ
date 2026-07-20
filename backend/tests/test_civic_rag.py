"""Citation-locked Civic Knowledge RAG remains scoped and offline-testable."""
from datetime import date

from app import civic_rag


def test_catalog_contains_only_attributed_official_documents():
    docs = civic_rag.load_catalog()

    assert len(docs) >= 5
    assert all(doc["url"].startswith("https://") for doc in docs)
    assert all(doc["authority"] and doc["publishedOn"] and doc["text"] for doc in docs)


def test_retrieval_prefers_locality_scoped_document():
    docs = civic_rag.retrieve(
        "What development consultation is planned in Rohini?", "delhi-ncr", "rohini",
        today=date(2026, 7, 19),
    )

    assert docs
    assert docs[0]["id"] == "dda-rohini-sector-34-consultation"
    assert all("rohini" in doc["localityIds"] or not doc["localityIds"] for doc in docs)


def test_retrieval_excludes_documents_scoped_to_another_locality():
    docs = civic_rag.retrieve("park development", "delhi-ncr", "mayur-vihar", today=date(2026, 7, 19))

    assert all(doc["id"] != "dda-dwarka-bharat-vandana-park" for doc in docs)
    assert all(doc["id"] != "dda-rohini-sector-34-consultation" for doc in docs)


def test_answer_is_composed_only_from_retrieved_text_and_citations():
    result = civic_rag.answer("air quality vehicle GRAP rules", "delhi-ncr", "noida-62")

    assert result["status"] == "available"
    assert result["retrievedCount"] == len(result["citations"])
    assert result["scoreImpact"] == "none"
    assert all(citation["url"] in {doc["url"] for doc in civic_rag.load_catalog()} for citation in result["citations"])


def test_uncovered_city_returns_honest_no_evidence():
    result = civic_rag.answer("official water notice", "mumbai", "powai")

    assert result["status"] == "no_evidence"
    assert result["answer"] == ""
    assert result["citations"] == []


def test_nearby_query_rejects_citywide_notices_for_other_localities():
    result = civic_rag.answer("Are there public consultations nearby?", "delhi-ncr", "noida-62")

    assert result["status"] == "no_evidence"
    assert result["citations"] == []


def test_citywide_rule_query_can_use_citywide_official_document():
    result = civic_rag.answer("official air quality vehicle restrictions", "delhi-ncr", "noida-62")

    assert result["status"] == "available"
    assert any("Environment" in citation["authority"] for citation in result["citations"])


def test_civic_knowledge_endpoint_contract(client):
    response = client.get("/api/neighborhood/clean-cheap/civic-knowledge", params={
        "city": "delhi-ncr", "q": "air quality vehicle rules",
    })

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "available"
    assert body["scoreImpact"] == "none"
    assert body["citations"]
