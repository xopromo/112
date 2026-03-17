"""
Image generation: Pollinations.ai (free, no key) + Gemini 2.0 Flash Exp (needs Gemini key).
Returns raw image bytes (JPEG/PNG) or None on failure.
"""
import base64
import json
import logging
import urllib.parse
import urllib.request
import urllib.error
from typing import Optional

logger = logging.getLogger(__name__)

TIMEOUT = 90  # Pollinations может генерировать до ~60 сек


def generate(prompt: str, provider: str = "pollinations",
             gemini_key: str = "") -> Optional[bytes]:
    """
    Generate image from text prompt.

    provider: "pollinations" (free, no key) | "gemini" (needs key)
    Returns image bytes or None on failure.
    """
    if provider == "pollinations":
        return _pollinations(prompt)
    elif provider == "gemini":
        if not gemini_key:
            logger.error("[image_gen] gemini_key not set")
            return None
        return _gemini(prompt, gemini_key)
    else:
        logger.error("[image_gen] unknown provider: %s", provider)
        return None


def _pollinations(prompt: str) -> Optional[bytes]:
    """GET https://image.pollinations.ai/prompt/{prompt} — returns JPEG bytes."""
    encoded = urllib.parse.quote(prompt, safe="")
    url = (
        f"https://image.pollinations.ai/prompt/{encoded}"
        "?model=flux&width=1024&height=1024&nologo=true&nofeed=true"
    )
    try:
        req = urllib.request.Request(
            url, headers={"User-Agent": "VKSalesBot/1.0"}
        )
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            data = resp.read()
        logger.info("[pollinations] generated %d bytes for prompt: %r", len(data), prompt[:60])
        return data
    except urllib.error.HTTPError as e:
        logger.error("[pollinations] HTTP %s: %s", e.code, e.read()[:200])
        return None
    except Exception as e:
        logger.error("[pollinations] error: %s", e)
        return None


def _gemini(prompt: str, api_key: str) -> Optional[bytes]:
    """POST gemini-2.0-flash-exp with responseModalities IMAGE — returns PNG bytes."""
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-2.0-flash-exp:generateContent?key={api_key}"
    )
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseModalities": ["IMAGE", "TEXT"]},
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=data,
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            result = json.loads(resp.read())
        for part in result["candidates"][0]["content"]["parts"]:
            if "inlineData" in part:
                img_bytes = base64.b64decode(part["inlineData"]["data"])
                logger.info("[gemini-img] generated %d bytes", len(img_bytes))
                return img_bytes
        logger.error("[gemini-img] no image in response: %s",
                     json.dumps(result)[:300])
        return None
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        logger.error("[gemini-img] HTTP %s: %s", e.code, body[:300])
        return None
    except Exception as e:
        logger.error("[gemini-img] error: %s", e)
        return None
