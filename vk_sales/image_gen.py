"""
Image generation: Pollinations.ai (free, no key) + Gemini 2.0 Flash Exp (needs Gemini key).
Returns (image_bytes, "") on success or (None, error_message) on failure.
"""
import base64
import json
import logging
import random
import urllib.parse
import urllib.request
import urllib.error
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

TIMEOUT = 90  # Pollinations может генерировать до ~60 сек


def generate(prompt: str, provider: str = "pollinations",
             gemini_key: str = "") -> Tuple[Optional[bytes], str]:
    """
    Generate image from text prompt.

    provider: "pollinations" (free, no key) | "gemini" (needs key)
    Returns (image_bytes, "") on success or (None, error_message) on failure.
    """
    if provider == "pollinations":
        return _pollinations(prompt)
    elif provider == "gemini":
        if not gemini_key:
            return None, "Ключ Gemini не задан"
        return _gemini(prompt, gemini_key)
    else:
        return None, f"Неизвестный провайдер: {provider}"


def _pollinations(prompt: str) -> Tuple[Optional[bytes], str]:
    """GET https://image.pollinations.ai/prompt/{prompt} — returns JPEG bytes."""
    encoded = urllib.parse.quote(prompt, safe="")
    seed = random.randint(1, 2**31)
    url = (
        f"https://image.pollinations.ai/prompt/{encoded}"
        f"?model=flux&width=1024&height=1024&nologo=true&nofeed=true&seed={seed}"
    )
    logger.info("[pollinations] requesting seed=%d prompt=%r", seed, prompt[:80])
    try:
        req = urllib.request.Request(
            url, headers={"User-Agent": "VKSalesBot/1.0"}
        )
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            content_type = resp.headers.get("Content-Type", "")
            data = resp.read()
        if not data:
            logger.error("[pollinations] empty response")
            return None, "Pollinations вернул пустой ответ"
        if "text/html" in content_type or (data[:5] == b"<html" or data[:9] == b"<!DOCTYPE"):
            preview = data[:200].decode(errors="replace")
            logger.error("[pollinations] got HTML instead of image: %s", preview)
            return None, f"Pollinations вернул HTML вместо картинки: {preview[:100]}"
        logger.info("[pollinations] generated %d bytes for prompt: %r", len(data), prompt[:60])
        return data, ""
    except urllib.error.HTTPError as e:
        body = e.read()[:200].decode(errors="replace")
        msg = f"Pollinations HTTP {e.code}: {body}"
        logger.error("[pollinations] %s", msg)
        return None, msg
    except Exception as e:
        msg = f"Pollinations ошибка: {e}"
        logger.error("[pollinations] error: %s", e)
        return None, msg


def _gemini(prompt: str, api_key: str) -> Tuple[Optional[bytes], str]:
    """POST gemini-2.0-flash-preview-image-generation with responseModalities IMAGE — returns PNG bytes."""
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-2.0-flash-preview-image-generation:generateContent?key={api_key}"
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
                return img_bytes, ""
        preview = json.dumps(result)[:300]
        logger.error("[gemini-img] no image in response: %s", preview)
        return None, f"Gemini не вернул картинку в ответе: {preview}"
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        msg = f"Gemini HTTP {e.code}: {body[:300]}"
        logger.error("[gemini-img] %s", msg)
        return None, msg
    except Exception as e:
        msg = f"Gemini ошибка: {e}"
        logger.error("[gemini-img] error: %s", e)
        return None, msg
