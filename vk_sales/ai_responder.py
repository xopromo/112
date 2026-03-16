"""
Groq AI responder — заменяет скриптовые ответы нейросетью.
Использует llama-3.3-70b через Groq API (бесплатно).
Ключ: console.groq.com → API Keys
"""
import json
import logging
import urllib.request
import urllib.error

logger = logging.getLogger(__name__)

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
MODEL    = "llama-3.3-70b-versatile"

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


def build_messages(history_rows, user_text: str) -> list:
    """Конвертировать историю из БД в формат OpenAI messages."""
    msgs = []
    for row in history_rows:
        role = "assistant" if row["direction"] == "out" else "user"
        msgs.append({"role": role, "content": row["text"] or ""})
    # Последнее сообщение пользователя (может дублировать — убираем)
    if msgs and msgs[-1]["role"] == "user" and msgs[-1]["content"] == user_text:
        pass
    else:
        msgs.append({"role": "user", "content": user_text})
    return msgs


def ask_groq(api_key: str, history_rows, user_text: str,
             state: str, name: str, product: str) -> str | None:
    """
    Вызвать Groq API. Возвращает текст ответа или None при ошибке.
    history_rows — результат db.get_messages()
    """
    if not api_key:
        return None

    stage = STATE_NAMES.get(state, state)
    goal  = STAGE_GOALS.get(state, "продолжить диалог")
    system = SYSTEM_TEMPLATE.format(
        product=product or "ваш продукт/услуга",
        stage=stage,
        name=name or "клиент",
        goal=goal,
    )

    messages = build_messages(history_rows, user_text)

    payload = {
        "model":       MODEL,
        "messages":    [{"role": "system", "content": system}] + messages,
        "max_tokens":  220,
        "temperature": 0.75,
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        GROQ_URL, data=data,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type":  "application/json",
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            result = json.loads(resp.read())
            text = result["choices"][0]["message"]["content"].strip()
            logger.info("AI reply generated (state=%s, len=%d)", state, len(text))
            return text
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        logger.error("Groq HTTP %s: %s", e.code, body[:200])
    except Exception as e:
        logger.error("Groq error: %s", e)
    return None
