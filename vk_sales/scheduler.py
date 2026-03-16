"""
Планировщик — запускает follow-up и кампании по расписанию.
Запускается параллельно с Long Poll (в отдельном потоке).
"""
import threading
import time
import logging

logger = logging.getLogger(__name__)


def _scheduler_loop(bot, check_interval_sec: int = 300):
    """
    Каждые check_interval_sec секунд проверяет pending follow-ups.
    По умолчанию раз в 5 минут.
    """
    while True:
        try:
            bot.process_followups()
        except Exception as e:
            logger.error("Scheduler error: %s", e)
        time.sleep(check_interval_sec)


def start_scheduler(bot, check_interval_sec: int = 300) -> threading.Thread:
    """Запустить планировщик в фоновом потоке."""
    t = threading.Thread(
        target=_scheduler_loop,
        args=(bot, check_interval_sec),
        daemon=True,
        name="FollowUpScheduler"
    )
    t.start()
    logger.info("Scheduler started (interval=%ds)", check_interval_sec)
    return t
