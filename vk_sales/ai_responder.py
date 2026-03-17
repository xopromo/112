"""
Multi-provider AI responder with automatic fallback.
Supports: Groq, Cerebras, Mistral, Gemini.
Priority queue configured via config.json → ai_models list.
Falls back to next provider when tokens/quota exhausted.
"""
import json
import logging
import re
import time
import threading
import urllib.request
import urllib.error
from collections import deque
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

_BASE_DIR   = Path(__file__).parent
PROMPT_FILE = _BASE_DIR / "system_prompt.txt"
KB_FILE     = _BASE_DIR / "knowledge_base.txt"

MAX_RETRIES  = 4
RETRY_DELAYS = [2, 4, 8, 16]
RPM_WARN_AT  = 0.8

_EN_WORD_RE = re.compile(r'(?<![/\w])([A-Za-z]{3,})(?!\w*[0-9])')
_URL_RE     = re.compile(r'https?://\S+|www\.\S+')


# ─── Provider configs ─────────────────────────────────────────────────────────

PROVIDER_CONFIGS = {
    "groq": {
        "url":           "https://api.groq.com/openai/v1/chat/completions",
        "default_model": "llama-3.3-70b-versatile",
        "rpm_limit":     30,
        "format":        "openai",
    },
    "cerebras": {
        "url":           "https://api.cerebras.ai/v1/chat/completions",
        "default_model": "llama-3.3-70b",
        "rpm_limit":     60,
        "format":        "openai",
    },
    "mistral": {
        "url":           "https://api.mistral.ai/v1/chat/completions",
        "default_model": "mistral-small-latest",
        "rpm_limit":     60,
        "format":        "openai",
    },
    "gemini": {
        "url":           "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        "default_model": "gemini-2.0-flash",
        "rpm_limit":     15,
        "format":        "gemini",
    },
}


# ─── Per-provider state (rate limiter + daily block) ─────────────────────────

class _RateLimiter:
    def __init__(self, rpm: int):
        self.rpm = rpm
        self._ts: deque = deque()
        self._lock = threading.Lock()

    def _clean(self, now: float):
        cutoff = now - 60.0
        while self._ts and self._ts[0] < cutoff:
            self._ts.popleft()

    def current_rpm(self) -> int:
        with self._lock:
            self._clean(time.monotonic())
            return len(self._ts)

    def acquire(self):
        while True:
            with self._lock:
                now = time.monotonic()
                self._clean(now)
                count = len(self._ts)
                if count >= self.rpm:
                    wait = 60.0 - (now - self._ts[0]) + 0.1
                    logger.warning("RPM limit (%d/%d). Waiting %.1fs...", count, self.rpm, wait)
                else:
                    ratio = count / self.rpm
                    if ratio >= RPM_WARN_AT:
                        delay = (ratio - RPM_WARN_AT) / (1.0 - RPM_WARN_AT) * 3.0
                        logger.info("RPM throttle (%.0f%% of limit). Sleeping %.1fs",
                                    ratio * 100, delay)
                        time.sleep(delay)
                    self._ts.append(time.monotonic())
                    return
            time.sleep(wait)  # noqa: F821


class _ProviderState:
    def __init__(self, rpm: int):
        self.limiter = _RateLimiter(rpm)
        self.blocked_until: float = 0.0
        self._lock = threading.Lock()

    def is_blocked(self) -> bool:
        with self._lock:
            return time.monotonic() < self.blocked_until

    def block_until_midnight(self) -> float:
        now = datetime.now(timezone.utc)
        tomorrow = now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
        secs = (tomorrow - now).total_seconds()
        with self._lock:
            self.blocked_until = time.monotonic() + secs
        return secs


_provider_states: dict = {}
_states_lock = threading.Lock()


def _get_state(provider: str) -> _ProviderState:
    with _states_lock:
        if provider not in _provider_states:
            rpm = PROVIDER_CONFIGS.get(provider, {}).get("rpm_limit", 30)
            _provider_states[provider] = _ProviderState(rpm)
        return _provider_states[provider]


# ─── Prompts ──────────────────────────────────────────────────────────────────

STATE_NAMES = {
    "NEW":          "знакомство",
    "GREETING":     "первый контакт",
    "QUALIFYING":   "выявление потребности",
    "PAIN":         "работа с болью",
    "PITCH":        "презентация",
    "OBJECTION":    "отработка возражения",
    "CTA":          "призыв к действию",
    "CLOSED_WON":   "сделка закрыта",
    "CLOSED_LOST":  "диалог закрыт",
    "UNSUBSCRIBED": "отписка",
}

SYSTEM_TEMPLATE = """\
Ты — менеджер по продажам в ВКонтакте. Ведёшь переписку от имени компании.

Продукт/услуга: {product}
Текущий этап воронки: {stage}
Имя клиента: {name}

Правила:
- Пиши коротко (1–3 предложения), по-человечески
- Без корпоративных штампов и заглавных букв на каждом слове
- Подстраивайся под тон клиента
- На этапе "{stage}" твоя цель: {goal}
- Если клиент просит не писать — скажи "хорошо, не буду беспокоить" и всё
- Отвечай ТОЛЬКО на русском языке
- НИКОГДА не перечисляй длинные списки (модули курса, пункты программы и т.п.)
  Максимум — упомяни 2-3 ключевых пункта кратко, остальное: "и ещё X тем"
- Не обещай списки которые не поместятся в 2-3 предложения
"""

STAGE_GOALS = {
    "NEW":          "поприветствовать и узнать чем можешь помочь",
    "GREETING":     "узнать интересно ли предложение в целом",
    "QUALIFYING":   "понять нишу, задачу или проблему клиента",
    "PAIN":         "помочь осознать проблему и её цену",
    "PITCH":        "коротко рассказать как продукт решает проблему",
    "OBJECTION":    "снять возражение мягко и честно",
    "CTA":          "договориться о следующем шаге (созвон, ссылка, встреча)",
    "CLOSED_WON":   "поблагодарить и уточнить детали",
    "CLOSED_LOST":  "оставить хорошее впечатление, пожелать удачи",
    "UNSUBSCRIBED": "попрощаться и сказать что не будешь писать",
}


# ─── HTTP helpers ─────────────────────────────────────────────────────────────

def _classify_429(body: str) -> str:
    b = body.lower()
    if "tokens per day" in b or "tpd" in b:
        return "tpd"
    if "tokens per minute" in b or "tpm" in b:
        return "tpm"
    if "requests per minute" in b or "rpm" in b:
        return "rpm"
    return "unknown"


def _parse_retry_after(header_value, fallback: float) -> float:
    try:
        return float(header_value)
    except (TypeError, ValueError):
        return fallback


# ─── Single provider calls ────────────────────────────────────────────────────

def _call_openai_provider(provider: str, api_key: str, model: str,
                           url: str, system: str, messages: list) -> Optional[str]:
    """Call OpenAI-compatible API (Groq, Cerebras, Mistral). Returns text or None."""
    state = _get_state(provider)
    if state.is_blocked():
        logger.warning("[%s] daily limit active, skipping", provider)
        return None

    payload = {
        "model":       model,
        "messages":    [{"role": "system", "content": system}] + messages,
        "max_tokens":  450,
        "temperature": 0.75,
    }
    data = json.dumps(payload).encode("utf-8")

    for attempt in range(MAX_RETRIES + 1):
        state.limiter.acquire()
        req = urllib.request.Request(
            url, data=data,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type":  "application/json",
                "User-Agent":    "Mozilla/5.0 (compatible; VKSalesBot/1.0)",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                result = json.loads(resp.read())
                choice = result["choices"][0]
                text   = choice["message"]["content"].strip()
                finish = choice.get("finish_reason", "")
                if finish == "length":
                    logger.warning("[%s] response truncated (len=%d)", provider, len(text))
                logger.info("[%s] reply len=%d finish=%s", provider, len(text), finish)
                return text
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")
            if e.code == 429:
                limit_type = _classify_429(body)
                if limit_type == "tpd":
                    secs = state.block_until_midnight()
                    logger.error("[%s] TPD limit exhausted. Disabled for %.0f min.",
                                 provider, secs / 60)
                    return None
                retry_after = _parse_retry_after(
                    e.headers.get("retry-after"),
                    RETRY_DELAYS[attempt] if attempt < len(RETRY_DELAYS) else 30,
                )
                if attempt < MAX_RETRIES:
                    logger.warning("[%s] 429 (%s). Retry %d/%d after %.0fs",
                                   provider, limit_type, attempt + 1, MAX_RETRIES, retry_after)
                    time.sleep(retry_after)
                    continue
                logger.error("[%s] 429 (%s) — all retries exhausted.", provider, limit_type)
            else:
                logger.error("[%s] HTTP %s: %s", provider, e.code, body[:200])
            break
        except Exception as ex:
            logger.error("[%s] error: %s", provider, ex)
            break
    return None


def _call_gemini_provider(api_key: str, model: str,
                           url_template: str, system: str, messages: list) -> Optional[str]:
    """Call Google Gemini API. Returns text or None."""
    provider = "gemini"
    state = _get_state(provider)
    if state.is_blocked():
        logger.warning("[gemini] daily limit active, skipping")
        return None

    url = url_template.format(model=model) + f"?key={api_key}"

    # Convert OpenAI messages format → Gemini format
    contents = []
    for msg in messages:
        role = "model" if msg["role"] == "assistant" else "user"
        contents.append({"role": role, "parts": [{"text": msg["content"]}]})

    payload = {
        "contents":           contents,
        "systemInstruction":  {"parts": [{"text": system}]},
        "generationConfig":   {"maxOutputTokens": 450, "temperature": 0.75},
    }
    data = json.dumps(payload).encode("utf-8")

    for attempt in range(MAX_RETRIES + 1):
        state.limiter.acquire()
        req = urllib.request.Request(
            url, data=data,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                result = json.loads(resp.read())
                text = result["candidates"][0]["content"]["parts"][0]["text"].strip()
                logger.info("[gemini] reply len=%d", len(text))
                return text
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")
            if e.code == 429:
                b = body.lower()
                # Daily quota exhausted
                if "quota" in b and ("day" in b or "exhausted" in b):
                    secs = state.block_until_midnight()
                    logger.error("[gemini] daily quota exhausted. Disabled for %.0f min.",
                                 secs / 60)
                    return None
                retry_after = _parse_retry_after(
                    e.headers.get("retry-after"),
                    RETRY_DELAYS[attempt] if attempt < len(RETRY_DELAYS) else 30,
                )
                if attempt < MAX_RETRIES:
                    logger.warning("[gemini] 429. Retry %d/%d after %.0fs",
                                   attempt + 1, MAX_RETRIES, retry_after)
                    time.sleep(retry_after)
                    continue
                logger.error("[gemini] 429 — all retries exhausted.")
            else:
                logger.error("[gemini] HTTP %s: %s", e.code, body[:200])
            break
        except Exception as ex:
            logger.error("[gemini] error: %s", ex)
            break
    return None


def _try_provider(provider: str, api_key: str, model: str,
                  pcfg: dict, system: str, messages: list) -> Optional[str]:
    if pcfg.get("format") == "gemini":
        return _call_gemini_provider(api_key, model, pcfg["url"], system, messages)
    return _call_openai_provider(provider, api_key, model, pcfg["url"], system, messages)


# ─── Public API ───────────────────────────────────────────────────────────────

def build_messages(history_rows, user_text: str) -> list:
    """Convert DB history to OpenAI messages format."""
    msgs = []
    for row in history_rows:
        role = "assistant" if row["direction"] == "out" else "user"
        msgs.append({"role": role, "content": row["text"] or ""})
    if not (msgs and msgs[-1]["role"] == "user" and msgs[-1]["content"] == user_text):
        msgs.append({"role": "user", "content": user_text})
    return msgs


def ask_ai(providers_config: list, history_rows, user_text: str,
           state: str, name: str, product: str) -> Optional[str]:
    """
    Try providers in priority order. Returns first successful reply.
    Automatically falls back to next provider on failure or quota exhaustion.

    providers_config: list of dicts, e.g.:
      [{"provider": "groq", "key": "...", "model": "llama-3.3-70b-versatile"},
       {"provider": "cerebras", "key": "..."},
       {"provider": "gemini", "key": "..."}]
    """
    stage = STATE_NAMES.get(state, state)
    goal  = STAGE_GOALS.get(state, "продолжить диалог")
    base_system = _load_prompt_template().format(
        product=product or "ваш продукт/услуга",
        stage=stage,
        name=name or "клиент",
        goal=goal,
    ) + _load_knowledge_base()

    messages = build_messages(history_rows, user_text)

    for entry in providers_config:
        provider = entry.get("provider", "").lower()
        api_key  = (entry.get("key") or "").strip()
        if not provider or not api_key:
            continue

        pcfg = PROVIDER_CONFIGS.get(provider)
        if not pcfg:
            logger.warning("Unknown provider '%s', skipping", provider)
            continue

        model = entry.get("model") or pcfg["default_model"]
        text  = _try_provider(provider, api_key, model, pcfg, base_system, messages)

        if text is None:
            logger.warning("Provider '%s' failed/exhausted, trying next...", provider)
            continue

        # Retry once with stricter prompt if English words slipped in
        en_words = _find_english_words(text)
        if en_words:
            logger.warning("[%s] English words in reply: %s — retrying with lang reminder",
                           provider, en_words[:5])
            strict_system = (
                base_system
                + "\n⚠️ КРИТИЧНО: В предыдущем ответе были английские слова: "
                + ", ".join(en_words[:5])
                + ". Перепиши ПОЛНОСТЬЮ на русском языке. НИ ОДНОГО латинского слова."
            )
            text2 = _try_provider(provider, api_key, model, pcfg, strict_system, messages)
            if text2:
                en_words2 = _find_english_words(text2)
                if not en_words2:
                    logger.info("[%s] Language retry succeeded.", provider)
                else:
                    logger.warning("[%s] English words still present after retry: %s",
                                   provider, en_words2[:5])
                text = text2

        logger.info("AI reply via '%s' (state=%s, len=%d)", provider, state, len(text))
        return text

    logger.error("All AI providers failed or exhausted.")
    return None


def ask_groq(api_key: str, history_rows, user_text: str,
             state: str, name: str, product: str) -> Optional[str]:
    """Backward-compatible wrapper — uses only Groq."""
    return ask_ai(
        [{"provider": "groq", "key": api_key}],
        history_rows, user_text, state, name, product,
    )


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _load_prompt_template() -> str:
    if PROMPT_FILE.exists():
        text = PROMPT_FILE.read_text(encoding="utf-8").strip()
        if text:
            return text
    return SYSTEM_TEMPLATE


def _load_knowledge_base() -> str:
    if KB_FILE.exists():
        lines = [
            ln for ln in KB_FILE.read_text(encoding="utf-8").splitlines()
            if ln.strip() and not ln.strip().startswith("#")
        ]
        text = "\n".join(lines).strip()
        if text:
            return (
                "\n\nБАЗА ЗНАНИЙ (используй только эти факты когда отвечаешь "
                "на вопросы о продукте):\n" + text
            )
    return ""


def _find_english_words(text: str) -> list:
    clean = _URL_RE.sub("", text)
    return _EN_WORD_RE.findall(clean)
