"""
Машина состояний диалога.
Каждое состояние знает:
- какое сообщение отправить при входе
- как реагировать на ответ пользователя
- через сколько часов напомнить если нет ответа
"""
from datetime import datetime, timedelta
from .templates import render, classify_intent

# Финальные состояния — бот не пишет из них
FINAL_STATES = {"CLOSED_WON", "CLOSED_LOST", "UNSUBSCRIBED"}

# Состояния которые ждут ответа и имеют follow-up (часов)
FOLLOWUP_HOURS = {
    "GREETING":    48,   # 2 дня
    "QUALIFYING":  72,   # 3 дня
    "PAIN":        48,
    "PITCH":       48,
    "OBJECTION":   96,   # 4 дня
    "CTA":         72,
}


def followup_dt(state: str):
    """ISO-строка когда нужен follow-up."""
    hours = FOLLOWUP_HOURS.get(state)
    if hours is None:
        return None
    return (datetime.utcnow() + timedelta(hours=hours)).isoformat()


def on_enter(state: str, variant: str, name: str, city: str) -> str:
    """Текст сообщения при входе в состояние."""
    return render(state, variant, name, city)


def transition(current_state: str, user_text: str, variant: str,
               name: str, city: str):
    """
    Возвращает (next_state, reply_text | None).
    reply_text=None если нужно просто сменить состояние без ответа.
    """
    intent = classify_intent(user_text)

    # ── СТОП / ОТПИСКА ─────────────────────────────────────────────────────
    if intent == "NO" and any(w in user_text.lower() for w in
                              ["отпиши", "не пиши", "стоп", "хватит", "удали"]):
        return "UNSUBSCRIBED", render("CLOSED_LOST", variant, name, city)

    # ── GREETING ────────────────────────────────────────────────────────────
    if current_state == "GREETING":
        if intent == "YES":
            text = render("QUALIFYING", variant, name, city)
            return "QUALIFYING", text
        elif intent in ("NO", "LATER"):
            text = render("QUALIFYING_NO", variant, name, city)
            return "PAIN", text  # всё равно пытаемся узнать нишу
        else:
            # любой ответ — двигаемся к квалификации
            text = render("QUALIFYING", variant, name, city)
            return "QUALIFYING", text

    # ── QUALIFYING ───────────────────────────────────────────────────────────
    if current_state in ("QUALIFYING", "PAIN"):
        if intent in ("PRICE",):
            text = render("OBJECTION_PRICE", variant, name, city)
            return "OBJECTION", text
        elif intent == "COMPETITOR":
            text = render("OBJECTION_COMPETITOR", variant, name, city)
            return "OBJECTION", text
        elif intent in ("NO",):
            text = render("CLOSED_LOST", variant, name, city)
            return "CLOSED_LOST", text
        else:
            # Есть боль или просто ответил — идём в питч
            text = render("PITCH", variant, name, city)
            return "PITCH", text

    # ── PITCH ────────────────────────────────────────────────────────────────
    if current_state == "PITCH":
        if intent == "YES":
            text = render("CTA", variant, name, city)
            return "CTA", text
        elif intent == "PRICE":
            text = render("OBJECTION_PRICE", variant, name, city)
            return "OBJECTION", text
        elif intent == "COMPETITOR":
            text = render("OBJECTION_COMPETITOR", variant, name, city)
            return "OBJECTION", text
        elif intent == "LATER":
            text = render("OBJECTION_LATER", variant, name, city)
            return "OBJECTION", text
        elif intent == "NO":
            text = render("CLOSED_LOST", variant, name, city)
            return "CLOSED_LOST", text
        else:
            # Задал вопрос или неопределённый ответ — задаём уточняющий вопрос
            text = (
                f"Интересный вопрос! Расскажи подробнее — "
                f"что именно хочешь уточнить?\n\n"
                f"Или если в целом понятно — давай перейдём к следующему шагу? 🙂"
            )
            return "PITCH", text

    # ── OBJECTION ────────────────────────────────────────────────────────────
    if current_state == "OBJECTION":
        if intent == "YES":
            text = render("CTA", variant, name, city)
            return "CTA", text
        elif intent in ("NO",):
            text = render("CLOSED_LOST", variant, name, city)
            return "CLOSED_LOST", text
        elif intent == "LATER":
            text = (
                "Окей, не буду давить 🙂 "
                "Напомню через несколько дней — вдруг станет актуальнее."
            )
            return "OBJECTION", text
        else:
            # Продолжаем работу с возражением
            text = (
                "Понял(а)! Если есть конкретный вопрос или сомнение — "
                "задавай, отвечу честно без продажных скриптов 😊"
            )
            return "OBJECTION", text

    # ── CTA ──────────────────────────────────────────────────────────────────
    if current_state == "CTA":
        if intent in ("YES",) or "http" in user_text or "vk.com" in user_text:
            text = render("CLOSED_WON", variant, name, city)
            return "CLOSED_WON", text
        elif intent == "NO":
            text = render("CLOSED_LOST", variant, name, city)
            return "CLOSED_LOST", text
        elif intent == "PRICE":
            text = render("OBJECTION_PRICE", variant, name, city)
            return "OBJECTION", text
        elif intent == "LATER":
            text = render("OBJECTION_LATER", variant, name, city)
            return "OBJECTION", text
        else:
            # Ответил что-то неопределённое — уточнить время/детали
            text = (
                "Отлично! Напомни: тебе удобнее прислать ссылку на сообщество "
                "или договоримся на короткий созвон? 🎯"
            )
            return "CTA", text

    # Неизвестное состояние — ничего не делать
    return current_state, None


def get_followup_message(state: str, variant: str, name: str, city: str):
    """Текст follow-up сообщения если пользователь не ответил."""
    followup_map = {
        "GREETING": "GREETING_FOLLOWUP",
        "CTA":      "CTA_FOLLOWUP",
    }
    key = followup_map.get(state)
    if key:
        return render(key, variant, name, city)
    # Для остальных состояний — ненавязчивое напоминание
    if state in ("QUALIFYING", "PAIN", "PITCH", "OBJECTION"):
        return (
            f"Привет, {name or 'друг'}! Просто хотел(а) уточнить — "
            f"актуален ли ещё вопрос продвижения? 😊"
        )
    return None
