"""Cloud Speech boundary: validation, privacy metadata, and HTTP contract."""
from types import SimpleNamespace

import pytest

from app import transcription


def _speech_response(text="Compare Powai and Bandra", confidence=0.91):
    alternative = SimpleNamespace(transcript=text, confidence=confidence)
    return SimpleNamespace(results=[SimpleNamespace(alternatives=[alternative])])


class TestTranscriptionBoundary:
    def test_transcribes_without_returning_or_storing_audio(self, monkeypatch):
        fake_client = SimpleNamespace(recognize=lambda **_kwargs: _speech_response())
        monkeypatch.setattr(transcription, "client", lambda: fake_client)
        result = transcription.transcribe(b"short-audio", "audio/webm;codecs=opus", 1200, "en-IN")
        assert result["transcript"] == "Compare Powai and Bandra"
        assert result["confidence"] == 0.91
        assert result["audioStored"] is False
        assert "audio" not in result

    @pytest.mark.parametrize("content_type", ["image/png", "application/octet-stream", "text/plain"])
    def test_rejects_non_audio_content_types(self, content_type):
        with pytest.raises(ValueError, match="Unsupported audio format"):
            transcription.validate_request(content_type, 1000, 10)

    def test_rejects_oversized_and_overlong_audio(self):
        with pytest.raises(ValueError, match="larger than 5 MB"):
            transcription.validate_request("audio/webm", 1000, transcription.MAX_AUDIO_BYTES + 1)
        with pytest.raises(ValueError, match="between 1 and 30 seconds"):
            transcription.validate_request("audio/webm", 30_001, 10)

    def test_rejects_an_unapproved_language(self):
        with pytest.raises(ValueError, match="Unsupported transcription language"):
            transcription.transcribe(b"audio", "audio/webm", 1000, "en-US")


class TestTranscriptionEndpoint:
    def test_returns_memory_only_transcript(self, client, monkeypatch):
        monkeypatch.setattr(transcription, "transcribe", lambda *_args: {
            "status": "available",
            "transcript": "clean air near work",
            "confidence": 0.95,
            "languageCode": "en-IN",
            "provider": "Google Cloud Speech-to-Text",
            "audioStored": False,
        })
        response = client.post(
            "/api/copilot/transcribe?durationMs=1200&languageCode=en-IN",
            content=b"voice-bytes",
            headers={"Content-Type": "audio/webm"},
        )
        assert response.status_code == 200
        assert response.json()["transcript"] == "clean air near work"
        assert response.json()["audioStored"] is False

    def test_rejects_invalid_audio_before_calling_google(self, client, monkeypatch):
        called = False

        def should_not_run(*_args):
            nonlocal called
            called = True

        monkeypatch.setattr(transcription, "client", should_not_run)
        response = client.post(
            "/api/copilot/transcribe?durationMs=1200",
            content=b"not-audio",
            headers={"Content-Type": "image/png"},
        )
        assert response.status_code == 400
        assert called is False
