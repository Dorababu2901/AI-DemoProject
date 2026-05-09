"""Image generation via LiteLLM (routed through the LiteLLM proxy if configured).

Uses LiteLLM's ``aimage_generation`` API (OpenAI ``/images/generations``
shape). The default model is Google's Imagen — exposed by our LiteLLM
proxy as ``gemini/imagen-4.0-fast-generate-001``.
"""

from __future__ import annotations

import base64
import re
from dataclasses import dataclass

import litellm

from app.ai.llm import _ensure_provider_env
from app.core.config import get_settings


class ImageGenError(Exception):
    """Raised for non-fatal image generation failures (safety, quota, etc.)."""


@dataclass
class ImageResult:
    image_bytes: bytes
    mime: str
    text: str | None  # optional inline caption / revised prompt


_DATA_URL_RE = re.compile(r"^data:(?P<mime>[^;]+);base64,(?P<b64>.+)$", re.DOTALL)


def _decode_b64(b64: str) -> bytes:
    try:
        return base64.b64decode(b64)
    except (ValueError, TypeError) as exc:
        raise ImageGenError("Image payload was not valid base64.") from exc


def _get(item: object, name: str) -> object | None:
    if isinstance(item, dict):
        return item.get(name)
    return getattr(item, name, None)


def _extract_image(item: object) -> tuple[bytes, str] | None:
    """Pull (bytes, mime) out of a single ``data[i]`` entry from the API.

    LiteLLM returns Pydantic ``ImageObject`` instances (or dicts), each with
    ``b64_json`` and/or ``url`` fields.
    """
    b64 = _get(item, "b64_json")
    if isinstance(b64, str) and b64:
        return _decode_b64(b64), "image/png"
    url = _get(item, "url")
    if isinstance(url, str) and url:
        match = _DATA_URL_RE.match(url)
        if match:
            return _decode_b64(match.group("b64")), match.group("mime")
    return None


async def generate_image(prompt: str) -> ImageResult:
    """Generate an image for ``prompt`` via LiteLLM and return raw bytes."""
    prompt = (prompt or "").strip()
    if not prompt:
        raise ImageGenError("Empty prompt.")
    if len(prompt) > 4000:
        raise ImageGenError("Prompt is too long (max 4000 characters).")

    _ensure_provider_env()
    settings = get_settings()

    model = settings.image_gen_model
    kwargs: dict = {
        "prompt": prompt,
        "n": 1,
    }
    if settings.litellm_proxy_url:
        # Proxy speaks OpenAI; force the openai/ prefix and target it as api_base.
        if not model.startswith("openai/"):
            model = f"openai/{model}"
        kwargs["api_base"] = settings.litellm_proxy_url.rstrip("/")
        kwargs["api_key"] = settings.litellm_api_key or "sk-proxy"
    kwargs["model"] = model

    try:
        response = await litellm.aimage_generation(**kwargs)
    except Exception as exc:  # noqa: BLE001
        raise ImageGenError(f"Image generation API call failed: {exc}") from exc

    data = _get(response, "data")
    if not data:
        raise ImageGenError("Empty response from image model.")

    for item in data:
        decoded = _extract_image(item)
        if decoded:
            image_bytes, mime = decoded
            revised = _get(item, "revised_prompt")
            return ImageResult(
                image_bytes=image_bytes,
                mime=mime,
                text=revised if isinstance(revised, str) and revised.strip() else None,
            )

    raise ImageGenError("Model did not return inline image data.")
