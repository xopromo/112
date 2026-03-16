#!/usr/bin/env python3
"""
Точка входа VK Sales Bot.

Использование:
  python run_vk_bot.py                        # запустить Long Poll + scheduler
  python run_vk_bot.py --campaign 123 456     # добавить user_id и начать рассылку
  python run_vk_bot.py --campaign-file ids.txt # загрузить список id из файла
  python run_vk_bot.py --followups            # только отправить follow-ups
  python run_vk_bot.py --stats                # показать статистику воронки
"""
import sys
import logging
import argparse
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)

from vk_sales.bot import VKSalesBot
from vk_sales.scheduler import start_scheduler


def main():
    parser = argparse.ArgumentParser(description="VK Sales Bot")
    parser.add_argument("--config", default="vk_sales/config.json",
                        help="Путь к config.json")
    parser.add_argument("--campaign", nargs="*", metavar="USER_ID",
                        help="Запустить рассылку для указанных user_id")
    parser.add_argument("--campaign-file", metavar="FILE",
                        help="Файл со списком user_id (по одному на строку)")
    parser.add_argument("--followups", action="store_true",
                        help="Только обработать follow-ups и выйти")
    parser.add_argument("--stats", action="store_true",
                        help="Показать статистику воронки и выйти")
    args = parser.parse_args()

    bot = VKSalesBot(config_path=args.config)

    # ── Статистика ────────────────────────────────────────────────────────────
    if args.stats:
        bot.print_stats()
        return

    # ── Только follow-ups ─────────────────────────────────────────────────────
    if args.followups:
        bot.process_followups()
        return

    # ── Запуск рассылки ────────────────────────────────────────────────────────
    user_ids = []
    if args.campaign:
        user_ids = [int(x) for x in args.campaign]
    if args.campaign_file:
        p = Path(args.campaign_file)
        if p.exists():
            user_ids += [int(line.strip()) for line in p.read_text().splitlines()
                         if line.strip().isdigit()]
        else:
            print(f"Файл не найден: {args.campaign_file}")
            sys.exit(1)

    if user_ids or args.campaign is not None:
        bot.start_campaign(user_ids if user_ids else None)

    # ── Long Poll + scheduler ─────────────────────────────────────────────────
    start_scheduler(bot)
    bot.run_longpoll()


if __name__ == "__main__":
    main()
