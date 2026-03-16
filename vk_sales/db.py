"""
Database layer — SQLite, хранит состояния диалогов и статистику.
"""
import sqlite3
import json
from datetime import datetime
from pathlib import Path


DB_PATH = Path(__file__).parent / "sales.db"


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_conn() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS dialogs (
            user_id     INTEGER PRIMARY KEY,
            state       TEXT    NOT NULL DEFAULT 'NEW',
            ab_variant  TEXT    NOT NULL DEFAULT 'A',
            first_name  TEXT,
            last_name   TEXT,
            city        TEXT,
            created_at  TEXT    NOT NULL,
            updated_at  TEXT    NOT NULL,
            next_followup TEXT,
            notes       TEXT    DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS messages (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL,
            direction   TEXT    NOT NULL,  -- 'out' | 'in'
            state_at    TEXT,
            text        TEXT,
            sent_at     TEXT    NOT NULL
        );

        CREATE TABLE IF NOT EXISTS stats (
            state       TEXT PRIMARY KEY,
            count       INTEGER DEFAULT 0
        );
        """)


def upsert_user(user_id: int, first_name: str = None, last_name: str = None,
                city: str = None, ab_variant: str = 'A'):
    now = datetime.utcnow().isoformat()
    with get_conn() as conn:
        existing = conn.execute(
            "SELECT user_id FROM dialogs WHERE user_id=?", (user_id,)
        ).fetchone()
        if existing:
            return False  # уже есть
        conn.execute(
            """INSERT INTO dialogs
               (user_id, state, ab_variant, first_name, last_name, city, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?)""",
            (user_id, 'NEW', ab_variant, first_name, last_name, city, now, now)
        )
        return True  # новый


def get_dialog(user_id: int):
    with get_conn() as conn:
        return conn.execute(
            "SELECT * FROM dialogs WHERE user_id=?", (user_id,)
        ).fetchone()


def set_state(user_id: int, state: str, next_followup: str = None):
    now = datetime.utcnow().isoformat()
    with get_conn() as conn:
        conn.execute(
            """UPDATE dialogs SET state=?, updated_at=?, next_followup=?
               WHERE user_id=?""",
            (state, now, next_followup, user_id)
        )
        # обновить статистику
        conn.execute(
            "INSERT INTO stats(state,count) VALUES(?,1) ON CONFLICT(state) DO UPDATE SET count=count+1",
            (state,)
        )


def log_message(user_id: int, direction: str, text: str, state_at: str = None):
    now = datetime.utcnow().isoformat()
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO messages(user_id,direction,state_at,text,sent_at) VALUES(?,?,?,?,?)",
            (user_id, direction, state_at, text, now)
        )


def get_pending_followups():
    """Возвращает диалоги у которых next_followup <= now и state не финальное."""
    now = datetime.utcnow().isoformat()
    with get_conn() as conn:
        return conn.execute(
            """SELECT * FROM dialogs
               WHERE next_followup IS NOT NULL
                 AND next_followup <= ?
                 AND state NOT IN ('CLOSED_WON','CLOSED_LOST','UNSUBSCRIBED')
            """, (now,)
        ).fetchall()


def get_all_new_users():
    """Все пользователи в состоянии NEW — для запуска рассылки."""
    with get_conn() as conn:
        return conn.execute(
            "SELECT * FROM dialogs WHERE state='NEW'"
        ).fetchall()


def get_stats():
    with get_conn() as conn:
        rows = conn.execute("SELECT state, count FROM stats ORDER BY count DESC").fetchall()
        return {r['state']: r['count'] for r in rows}


def add_users_from_list(user_ids: list[int]):
    """Добавить список user_id с состоянием NEW (пропустить дубли)."""
    import random
    added = 0
    for uid in user_ids:
        variant = 'A' if random.random() < 0.5 else 'B'
        if upsert_user(uid, ab_variant=variant):
            added += 1
    return added
