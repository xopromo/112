"""
Groq AI responder — заменяет скриптовые ответы нейросетью.
Использует llama-3.3-70b через Groq API (бесплатно).
Ключ: console.groq.com → API Keys
"""
import json
import logging
import re
import time
import threading
import urllib.request
import urllib.error
from collections import deque
from typing import Optional

logger = logging.getLogger(__name__)

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
MODEL    = "llama-3.3-70b-versatile"

# Лимиты Groq free tier
RPM_LIMIT   = 30    # запросов в минуту
RPM_WARN_AT = 0.8   # начало замедления (80% лимита)
MAX_RETRIES = 4
RETRY_DELAYS = [2, 4, 8, 16]  # секунды, exponential backoff

# Детектор английских слов: минимум 3 латинских символа подряд,
# игнорируем URL и числа с единицами (50px, v6, ...)
_EN_WORD_RE = re.compile(r'(?<![/\w])([A-Za-z]{3,})(?!\w*[0-9])')
_URL_RE = re.compile(r'https?://\S+|www\.\S+')


# ─────────────────────────────────────────────────────────────────────────────
# Rate limiter (скользящее окно, thread-safe)
# ─────────────────────────────────────────────────────────────────────────────

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
        """Блокирует вызов если нужно; замедляет при приближении к лимиту."""
        while True:
            with self._lock:
                now = time.monotonic()
                self._clean(now)
                count = len(self._ts)

                if count >= self.rpm:
                    # Лимит исчерпан — ждём освобождения слота
                    wait = 60.0 - (now - self._ts[0]) + 0.1
                    logger.warning(
                        "Groq RPM limit (%d/%d). Waiting %.1fs...",
                        count, self.rpm, wait,
                    )
                else:
                    # Throttle при приближении к лимиту
                    ratio = count / self.rpm
                    if ratio >= RPM_WARN_AT:
                        delay = (ratio - RPM_WARN_AT) / (1.0 - RPM_WARN_AT) * 3.0
                        logger.info(
                            "Groq RPM throttle (%.0f%% of limit). Sleeping %.1fs",
                            ratio * 100, delay,
                        )
                        time.sleep(delay)
                    self._ts.append(time.monotonic())
                    return

            time.sleep(wait)  # noqa: F821 — defined in the `if count >= self.rpm` branch


_limiter = _RateLimiter(rpm=RPM_LIMIT)


# ─────────────────────────────────────────────────────────────────────────────
# Промпты
# ─────────────────────────────────────────────────────────────────────────────

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


# ─────────────────────────────────────────────────────────────────────────────
# Основная функция
# ─────────────────────────────────────────────────────────────────────────────

def build_messages(history_rows, user_text: str) -> list:
    """Конвертировать историю из БД в формат OpenAI messages."""
    msgs = []
    for row in history_rows:
        role = "assistant" if row["direction"] == "out" else "user"
        msgs.append({"role": role, "content": row["text"] or ""})
    if msgs and msgs[-1]["role"] == "user" and msgs[-1]["content"] == user_text:
        pass
    else:
        msgs.append({"role": "user", "content": user_text})
    return msgs


def ask_groq(api_key: str, history_rows, user_text: str,
             state: str, name: str, product: str) -> Optional[str]:
    """
    Вызвать Groq API. Возвращает текст ответа или None при ошибке.
    - Throttle при приближении к RPM-лимиту, retry при 429.
    - При наличии английских слов в ответе делает 1 повторный запрос
      с явным напоминанием писать только по-русски.
    """
    if not api_key:
        return None

    stage  = STATE_NAMES.get(state, state)
    goal   = STAGE_GOALS.get(state, "продолжить диалог")
    base_system = SYSTEM_TEMPLATE.format(
        product=product or "ваш продукт/услуга",
        stage=stage,
        name=name or "клиент",
        goal=goal,
    )

    messages = build_messages(history_rows, user_text)

    def _call(system_override: str = None) -> Optional[tuple[str, str]]:
        """Один HTTP-вызов. Возвращает (text, finish_reason) или None."""
        payload = {
            "model":       MODEL,
            "messages":    [{"role": "system", "content": system_override or base_system}] + messages,
            "max_tokens":  450,
            "temperature": 0.75,
        }
        data = json.dumps(payload).encode("utf-8")

        for attempt in range(MAX_RETRIES + 1):
            _limiter.acquire()
            req = urllib.request.Request(
                GROQ_URL, data=data,
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
                    return choice["message"]["content"].strip(), choice.get("finish_reason", "")
            except urllib.error.HTTPError as e:
                body = e.read().decode(errors="replace")
                if e.code == 429:
                    retry_after = _parse_retry_after(
                        e.headers.get("retry-after"),
                        fallback=RETRY_DELAYS[attempt] if attempt < len(RETRY_DELAYS) else 30,
                    )
                    if attempt < MAX_RETRIES:
                        logger.warning(
                            "Groq 429. Retry %d/%d after %.0fs (RPM=%d)",
                            attempt + 1, MAX_RETRIES, retry_after, _limiter.current_rpm(),
                        )
                        time.sleep(retry_after)
                        continue
                    logger.error("Groq 429 — all retries exhausted.")
                else:
                    logger.error("Groq HTTP %s: %s", e.code, body[:200])
                break
            except Exception as e:
                logger.error("Groq error: %s", e)
                break
        return None

    # Первый запрос
    result = _call()
    if result is None:
        return None

    text, finish = result

    if finish == "length":
        logger.warning("Groq response truncated (len=%d)", len(text))

    # Проверка на английские слова → 1 retry с усиленным напоминанием
    en_words = _find_english_words(text)
    if en_words:
        logger.warning(
            "English words in AI reply: %s — retrying with lang reminder",
            en_words[:5],
        )
        strict_system = (
            base_system
            + "\n⚠️ КРИТИЧНО: В предыдущем ответе были английские слова: "
            + ", ".join(en_words[:5])
            + ". Перепиши ПОЛНОСТЬЮ на русском языке. НИ ОДНОГО латинского слова."
        )
        result2 = _call(system_override=strict_system)
        if result2:
            text2, finish2 = result2
            en_words2 = _find_english_words(text2)
            if en_words2:
                logger.warning("English words still present after retry: %s", en_words2[:5])
            else:
                logger.info("Language retry succeeded.")
            text = text2

    logger.info("AI reply (state=%s, len=%d, finish=%s)", state, len(text), finish)
    return text


def _parse_retry_after(header_value, fallback: float) -> float:
    try:
        return float(header_value)
    except (TypeError, ValueError):
        return fallback


def _find_english_words(text: str) -> list[str]:
    """Найти английские слова в тексте (игнорируем URL)."""
    clean = _URL_RE.sub("", text)
    return _EN_WORD_RE.findall(clean)
