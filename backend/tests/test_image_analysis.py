"""Gemini image boundary: validation, privacy, and HTTP contract."""
from types import SimpleNamespace

import pytest

from app import image_analysis


class TestImageAnalysisBoundary:
    def test_analyzes_without_returning_or_storing_image(self, monkeypatch):
        monkeypatch.setattr(
            image_analysis.gemini,
            "_generate",
            lambda **_kwargs: SimpleNamespace(text="Visible greenery; air quality needs live data."),
        )
        result = image_analysis.analyze(b"png-bytes", "image/png", "What can you see?", "Mumbai")
        assert result["mode"] == "image_evidence"
        assert result["imageStored"] is False
        assert "image" not in result
        assert result["tools"][0]["id"] == "gemini_vision"

    @pytest.mark.parametrize("content_type", ["application/pdf", "image/gif", "text/plain"])
    def test_rejects_unapproved_image_types(self, content_type):
        with pytest.raises(ValueError, match="JPG, PNG, or WebP"):
            image_analysis.validate_image(content_type, 10)

    def test_rejects_oversized_images(self):
        with pytest.raises(ValueError, match="larger than 8 MB"):
            image_analysis.validate_image("image/jpeg", image_analysis.MAX_IMAGE_BYTES + 1)


class TestImageAnalysisEndpoint:
    def test_returns_memory_only_analysis(self, client, monkeypatch):
        monkeypatch.setattr(image_analysis, "analyze", lambda *_args: {
            "answer": "A footpath and nearby shops are visible.",
            "mode": "image_evidence",
            "imageStored": False,
        })
        response = client.post(
            "/api/copilot/analyze-image?city=mumbai&question=Is%20it%20walkable%3F",
            content=b"image-bytes",
            headers={"Content-Type": "image/jpeg"},
        )
        assert response.status_code == 200
        assert response.json()["mode"] == "image_evidence"
        assert response.json()["imageStored"] is False

    def test_rejects_invalid_content_before_gemini(self, client, monkeypatch):
        called = False

        def should_not_run(*_args):
            nonlocal called
            called = True

        monkeypatch.setattr(image_analysis.gemini, "_generate", should_not_run)
        response = client.post(
            "/api/copilot/analyze-image?city=mumbai",
            content=b"not-an-image",
            headers={"Content-Type": "application/pdf"},
        )
        assert response.status_code == 400
        assert called is False
