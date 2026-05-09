"""Smoke check: verify the Gemini image-generation API key works.

Usage (from c:\\DemoApp\\backend with the venv active):

    .\\.venv\\Scripts\\python.exe -m scripts._check_image_gen
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from app.ai.image_gen import ImageGenError, generate_image


async def _main() -> int:
    prompt = "a red apple on a wooden table, soft daylight, photorealistic"
    print(f"prompt: {prompt}")
    try:
        result = await generate_image(prompt)
    except ImageGenError as exc:
        print(f"FAILED: {exc}", file=sys.stderr)
        return 1

    out = Path(__file__).resolve().parent / "_check_image_gen.png"
    out.write_bytes(result.image_bytes)
    print(f"OK: wrote {out} ({len(result.image_bytes)} bytes, mime={result.mime})")
    if result.text:
        print(f"text part: {result.text[:200]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_main()))
