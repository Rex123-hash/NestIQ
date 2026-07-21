"""Privacy-bounded Google Cloud Speech-to-Text integration for Copilot.

Audio is accepted as bytes, sent directly to Speech-to-Text, and discarded when
the request returns. This module never writes audio or transcripts to disk and
never emits either in telemetry.
"""
from __future__ import annotations

import time
from functools import lru_cache

from google.cloud import speech_v2
from google.cloud.speech_v2.types import cloud_speech

from . import telemetry
from .config import settings

MAX_AUDIO_BYTES = 5 * 1024 * 1024
MAX_DURATION_MS = 30_000
ALLOWED_CONTENT_TYPES = {
    "audio/webm",
    "audio/ogg",
    "audio/mp4",
    "audio/mpeg",
    "audio/wav",
    "audio/x-wav",
}
ALLOWED_LANGUAGES = {"en-IN", "hi-IN"}


class TranscriptionUnavailable(RuntimeError):
    """Speech provider failed without exposing provider internals to clients."""


@lru_cache(maxsize=1)
def client() -> speech_v2.SpeechClient:
    return speech_v2.SpeechClient()


def validate_request(content_type: str, duration_ms: int, size: int) -> str:
    media_type = (content_type or "").split(";", 1)[0].strip().lower()
    if media_type not in ALLOWED_CONTENT_TYPES:
        raise ValueError("Unsupported audio format. Record WebM, OGG, MP4, MP3, or WAV audio.")
    if duration_ms < 1 or duration_ms > MAX_DURATION_MS:
        raise ValueError("Voice questions must be between 1 and 30 seconds.")
    if size < 1:
        raise ValueError("The recording was empty.")
    if size > MAX_AUDIO_BYTES:
        raise ValueError("The recording is larger than 5 MB.")
    return media_type


def transcribe(audio: bytes, content_type: str, duration_ms: int, language_code: str) -> dict:
    """Transcribe one short voice question without persisting its contents."""
    media_type = validate_request(content_type, duration_ms, len(audio))
    if language_code not in ALLOWED_LANGUAGES:
        raise ValueError("Unsupported transcription language.")

    started = time.perf_counter()
    try:
        config = cloud_speech.RecognitionConfig(
            auto_decoding_config=cloud_speech.AutoDetectDecodingConfig(),
            language_codes=[language_code],
            model="short",
            features=cloud_speech.RecognitionFeatures(enable_automatic_punctuation=True),
        )
        request = cloud_speech.RecognizeRequest(
            recognizer=f"projects/{settings.gcp_project}/locations/global/recognizers/_",
            config=config,
            content=audio,
        )
        response = client().recognize(request=request, timeout=25)
        alternatives = [
            result.alternatives[0]
            for result in response.results
            if result.alternatives and result.alternatives[0].transcript.strip()
        ]
        transcript = " ".join(alt.transcript.strip() for alt in alternatives).strip()
        if not transcript:
            raise ValueError("No speech was detected. Please try again closer to the microphone.")
        confidences = [alt.confidence for alt in alternatives if alt.confidence > 0]
        confidence = round(sum(confidences) / len(confidences), 3) if confidences else None
        telemetry.event(
            "voice_transcription_completed",
            provider="google_speech_v2",
            contentType=media_type,
            languageCode=language_code,
            audioBytes=len(audio),
            durationMs=duration_ms,
            latencyMs=telemetry.elapsed_ms(started),
            transcriptLogged=False,
            audioStored=False,
        )
        return {
            "status": "available",
            "transcript": transcript,
            "confidence": confidence,
            "languageCode": language_code,
            "provider": "Google Cloud Speech-to-Text",
            "audioStored": False,
        }
    except ValueError:
        raise
    except Exception as error:  # noqa: BLE001
        telemetry.event(
            "voice_transcription_failed",
            provider="google_speech_v2",
            contentType=media_type,
            languageCode=language_code,
            audioBytes=len(audio),
            durationMs=duration_ms,
            latencyMs=telemetry.elapsed_ms(started),
            errorType=type(error).__name__,
            transcriptLogged=False,
            audioStored=False,
        )
        raise TranscriptionUnavailable("Speech-to-Text could not transcribe this recording.") from error
