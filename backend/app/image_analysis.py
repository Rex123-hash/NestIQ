"""Memory-only Gemini image understanding for NestIQ Copilot."""
from __future__ import annotations

import time

from google.genai import types

from . import gemini, telemetry
from .config import settings

MAX_IMAGE_BYTES = 8 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}


class ImageAnalysisUnavailable(RuntimeError):
    """The image provider failed without exposing provider internals."""


def validate_image(content_type: str, size: int) -> str:
    media_type = (content_type or "").split(";", 1)[0].strip().lower()
    if media_type not in ALLOWED_IMAGE_TYPES:
        raise ValueError("Upload a JPG, PNG, or WebP image.")
    if size < 1:
        raise ValueError("The selected image is empty.")
    if size > MAX_IMAGE_BYTES:
        raise ValueError("The image is larger than 8 MB.")
    return media_type


def analyze(image: bytes, content_type: str, question: str, city_name: str) -> dict:
    """Analyze one image in memory; never persist or log image/prompt contents."""
    media_type = validate_image(content_type, len(image))
    prompt = (question or "What neighborhood-relevant details can you identify in this image?").strip()
    instruction = f"""
You are NestIQ Copilot, a careful neighborhood decision assistant for {city_name}.
Answer the user's question about the attached image: {prompt}

Focus only on visible, decision-relevant details such as streets, housing, accessibility,
amenities, cleanliness, traffic, greenery, signage, hazards, or readable locality clues.
Clearly separate observations from inferences. Never infer safety, air quality, rent, a
person's identity, or the exact location from appearance alone. Suggest a useful NestIQ
follow-up when live data would be needed. Be concise and transparent.
""".strip()
    started = time.perf_counter()
    try:
        response = gemini._generate(  # Reuse the app's bounded, self-healing Vertex client.
            model=settings.gemini_model,
            contents=[instruction, types.Part.from_bytes(data=image, mime_type=media_type)],
            config=types.GenerateContentConfig(temperature=0.2, max_output_tokens=500),
        )
        answer = (response.text or "").strip()
        if not answer:
            raise ImageAnalysisUnavailable("Gemini returned no image analysis.")
        telemetry.event(
            "copilot_image_analyzed", provider="gemini_vertex", contentType=media_type,
            imageBytes=len(image), latencyMs=telemetry.elapsed_ms(started),
            imageStored=False, imageLogged=False, promptLogged=False,
        )
        return {
            "answer": answer,
            "mode": "image_evidence",
            "scope": {"city": city_name},
            "sources": ["User-provided image", "Gemini on Vertex AI"],
            "tools": [{"id": "gemini_vision", "label": "Gemini image understanding", "status": "used", "sourceType": "model"}],
            "followUps": ["Compare these visible conditions with live locality data."],
            "actions": [],
            "imageStored": False,
        }
    except ImageAnalysisUnavailable:
        raise
    except Exception as error:  # noqa: BLE001
        telemetry.event(
            "copilot_image_failed", provider="gemini_vertex", contentType=media_type,
            imageBytes=len(image), latencyMs=telemetry.elapsed_ms(started),
            errorType=type(error).__name__, imageStored=False, imageLogged=False,
            promptLogged=False,
        )
        raise ImageAnalysisUnavailable("Gemini could not analyze this image.") from error
