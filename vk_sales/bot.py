"""
VK Sales Bot — основная логика.
Использует VK Long Poll для получения входящих сообщений.
Группа должна иметь включённые сообщения (messages.send с group_id).
"""
import time
import logging
import json
import random
from pathlib import Path
from typing import Optional

import vk_api
from vk_api.bot_longpoll import VkBotLongPoll, VkBotEventType

from . import db
from .states import (
    transition, on_enter, followup_dt,
    get_followup_message, FINAL_STATES
)
from .ai_responder import ask_groq

logger = logging.getLogger(__name__)


class VKSalesBot:
    def __init__(self, config_path: str = None):
        cfg_path = config_path or (Path(__file__).parent / "config.json")
        with open(cfg_path, encoding="utf-8") as f:
            self.cfg = json.load(f)

        self.token = self.cfg["group_token"]
        self.group_id = self.cfg["group_id"]
        self.dry_run   = self.cfg.get("dry_run", False)
        self.use_ai    = self.cfg.get("use_ai", False)
        self.groq_key  = self.cfg.get("groq_key", "")
        self.ai_product = self.cfg.get("ai_product", "")

        # Задержки между сообщениями (защита от спам-фильтра)
        self.send_delay_min = self.cfg.get("send_delay_min", 2)   # сек
        self.send_delay_max = self.cfg.get("send_delay_max", 8)

        # Инициализация VK API
        self.vk_session = vk_api.VkApi(token=self.token)
        self.vk = self.vk_session.get_api()

        db.init_db()
        logger.info("Bot initialized. group_id=%s dry_run=%s",
                    self.group_id, self.dry_run)

    # ─────────────────────────────────────────────────────────────────────────
    # ОТПРАВКА
    # ─────────────────────────────────────────────────────────────────────────

    def _send(self, user_id: int, text: str, state: str = None):
        """Отправить сообщение пользователю от имени группы."""
        if self.dry_run:
            logger.info("[DRY RUN] → user %s | state=%s | %r", user_id, state, text[:80])
            db.log_message(user_id, "out", text, state)
            return

        delay = random.uniform(self.send_delay_min, self.send_delay_max)
        time.sleep(delay)
        try:
            self.vk.messages.send(
                user_id=user_id,
                message=text,
                random_id=random.randint(1, 2**31),
            )
            db.log_message(user_id, "out", text, state)
            logger.info("→ user %s | state=%s", user_id, state)
        except vk_api.exceptions.ApiError as e:
            logger.error("send error user=%s: %s", user_id, e)

    # ─────────────────────────────────────────────────────────────────────────
    # ОБОГАЩЕНИЕ ПРОФИЛЯ
    # ─────────────────────────────────────────────────────────────────────────

    def _fetch_user_info(self, user_id: int) -> dict:
        """Получить имя и город из VK API."""
        try:
            users = self.vk.users.get(
                user_ids=user_id,
                fields="city,first_name,last_name"
            )
            if users:
                u = users[0]
                return {
                    "first_name": u.get("first_name", ""),
                    "last_name":  u.get("last_name", ""),
                    "city":       u.get("city", {}).get("title", ""),
                }
        except Exception as e:
            logger.warning("users.get error: %s", e)
        return {"first_name": "", "last_name": "", "city": ""}

    # ─────────────────────────────────────────────────────────────────────────
    # ЗАПУСК РАССЫЛКИ (первый контакт)
    # ─────────────────────────────────────────────────────────────────────────

    def start_campaign(self, user_ids=None):
        """
        Начать диалог с пользователями.
        user_ids — список id для добавления. Если None — берём из БД (state=NEW).
        """
        if user_ids:
            added = db.add_users_from_list(user_ids)
            logger.info("Added %d new users to DB", added)

        users = db.get_all_new_users()
        logger.info("Starting campaign: %d users in NEW state", len(users))

        for row in users:
            uid = row["user_id"]
            # Обогатить профиль если данных нет
            if not row["first_name"]:
                info = self._fetch_user_info(uid)
                db.upsert_user(
                    uid,
                    first_name=info["first_name"],
                    last_name=info["last_name"],
                    city=info["city"],
                    ab_variant=row["ab_variant"],
                )
                row = db.get_dialog(uid)  # перечитать

            name = row["first_name"] or ""
            city = row["city"] or ""
            variant = row["ab_variant"]

            text = on_enter("GREETING", variant, name, city)
            next_fu = followup_dt("GREETING")
            db.set_state(uid, "GREETING", next_fu)
            self._send(uid, text, "GREETING")

        logger.info("Campaign messages sent: %d", len(users))

    # ─────────────────────────────────────────────────────────────────────────
    # FOLLOW-UP (задержанные напоминания)
    # ─────────────────────────────────────────────────────────────────────────

    def process_followups(self):
        """Отправить follow-up тем кто не ответил. Вызывать по расписанию."""
        pending = db.get_pending_followups()
        logger.info("Follow-ups pending: %d", len(pending))
        for row in pending:
            uid = row["user_id"]
            state = row["state"]
            variant = row["ab_variant"]
            name = row["first_name"] or ""
            city = row["city"] or ""

            text = get_followup_message(state, variant, name, city)
            if not text:
                # Нет follow-up для этого состояния — снимаем дату
                db.set_state(uid, state, None)
                continue

            self._send(uid, text, f"{state}_FOLLOWUP")
            # Сбросить next_followup чтобы не спамить
            db.set_state(uid, state, None)

    # ─────────────────────────────────────────────────────────────────────────
    # ОБРАБОТКА ВХОДЯЩЕГО СООБЩЕНИЯ
    # ─────────────────────────────────────────────────────────────────────────

    def handle_incoming(self, user_id: int, text: str):
        """Обработать входящее сообщение от пользователя."""
        dialog = db.get_dialog(user_id)
        if not dialog:
            # Незнакомый пользователь — добавить и начать диалог
            info = self._fetch_user_info(user_id)
            variant = "A" if random.random() < 0.5 else "B"
            db.upsert_user(
                user_id,
                first_name=info["first_name"],
                last_name=info["last_name"],
                city=info["city"],
                ab_variant=variant,
            )
            dialog = db.get_dialog(user_id)

        state = dialog["state"]
        variant = dialog["ab_variant"]
        name = dialog["first_name"] or ""
        city = dialog["city"] or ""

        db.log_message(user_id, "in", text, state)
        logger.info("← user %s | state=%s | %r", user_id, state, text[:60])

        if state in FINAL_STATES:
            # Пользователь написал сам после закрытия
            if state == "UNSUBSCRIBED":
                return  # не отвечаем
            # CLOSED_WON / CLOSED_LOST — просто логируем
            logger.info("Message from closed dialog user=%s", user_id)
            return

        # ── AI или скрипт ────────────────────────────────────────────────────
        if self.use_ai and self.groq_key and state not in FINAL_STATES:
            history = db.get_messages(user_id, limit=20)
            ai_reply = ask_groq(
                api_key=self.groq_key,
                history_rows=history,
                user_text=text,
                state=state,
                name=name,
                product=self.ai_product,
            )
            if ai_reply:
                # состояние не меняем — AI сам ведёт диалог
                self._send(user_id, ai_reply, state)
                return
            logger.warning("AI fallback to script for user=%s", user_id)

        # ── Скриптовая машина состояний (fallback) ───────────────────────────
        next_state, reply = transition(state, text, variant, name, city)

        if next_state != state or reply:
            fu = followup_dt(next_state) if next_state not in FINAL_STATES else None
            db.set_state(user_id, next_state, fu)

        if reply:
            self._send(user_id, reply, next_state)

    # ─────────────────────────────────────────────────────────────────────────
    # LONG POLL LOOP
    # ─────────────────────────────────────────────────────────────────────────

    def run_longpoll(self):
        """Слушать Long Poll и обрабатывать входящие сообщения."""
        longpoll = VkBotLongPoll(self.vk_session, self.group_id)
        logger.info("Long Poll started. Listening...")
        while True:
            try:
                for event in longpoll.listen():
                    if event.type == VkBotEventType.MESSAGE_NEW:
                        msg = event.object.message
                        uid = msg["from_id"]
                        text = msg.get("text", "")
                        if uid > 0:  # игнорировать сообщения от других групп
                            self.handle_incoming(uid, text)
            except Exception as e:
                logger.error("Long Poll error: %s", e)
                time.sleep(5)

    # ─────────────────────────────────────────────────────────────────────────
    # СТАТИСТИКА
    # ─────────────────────────────────────────────────────────────────────────

    def print_stats(self):
        stats = db.get_stats()
        print("\n=== Статистика воронки ===")
        for state, count in stats.items():
            print(f"  {state:20s}: {count}")
        print()
