"""
Flask web-приложение для управления VK Sales Bot.
Запуск: python -m vk_sales.web_app
"""
import os
import csv
import json
import signal
import subprocess
import sys
import io
import logging
from pathlib import Path
from datetime import datetime

from flask import (Flask, render_template, redirect, url_for, request,
                   flash, jsonify, Response, send_file)

from . import db

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).parent
CONFIG_PATH = BASE_DIR / "config.json"
BOT_PID_FILE = BASE_DIR / "bot.pid"
BOT_LOG_FILE = BASE_DIR / "bot.log"

app = Flask(__name__, template_folder="templates")
app.secret_key = "vk-sales-secret-key-2024"


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

STATE_COLORS = {
    "NEW":         "secondary",
    "GREETING":    "primary",
    "QUALIFYING":  "info",
    "PAIN":        "info",
    "PITCH":       "warning",
    "OBJECTION":   "danger",
    "CTA":         "success",
    "CLOSED_WON":  "success",
    "CLOSED_LOST": "secondary",
    "UNSUBSCRIBED":"dark",
}
STATE_LABELS = {
    "NEW":         "Новый",
    "GREETING":    "Приветствие",
    "QUALIFYING":  "Квалификация",
    "PAIN":        "Боли",
    "PITCH":       "Питч",
    "OBJECTION":   "Возражения",
    "CTA":         "Призыв к действию",
    "CLOSED_WON":  "Закрыт ✓",
    "CLOSED_LOST": "Закрыт ✗",
    "UNSUBSCRIBED":"Отписался",
}

def state_badge(state: str) -> str:
    color = STATE_COLORS.get(state, "secondary")
    label = STATE_LABELS.get(state, state)
    return f'<span class="badge bg-{color} badge-state">{label}</span>'


def load_config() -> dict:
    defaults = {"group_token": "", "group_id": 0, "dry_run": True,
                "send_delay_min": 2, "send_delay_max": 8,
                "use_ai": False, "groq_key": "", "ai_product": ""}
    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH, encoding="utf-8") as f:
                data = json.load(f)
            defaults.update(data)
        except Exception as e:
            logger.error("Failed to load config: %s", e)
    return defaults


def save_config(data: dict):
    existing = load_config()
    existing.update(data)
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(existing, f, indent=2, ensure_ascii=False)
    logger.info("Config saved to %s, keys: %s", CONFIG_PATH, list(data.keys()))


def is_bot_running() -> bool:
    if not BOT_PID_FILE.exists():
        return False
    try:
        pid = int(BOT_PID_FILE.read_text().strip())
        os.kill(pid, 0)
        return True
    except (ProcessLookupError, ValueError, OSError):
        BOT_PID_FILE.unlink(missing_ok=True)
        return False


def get_dashboard_stats() -> dict:
    conn = db.get_conn()
    rows = conn.execute("SELECT state, COUNT(*) as c FROM dialogs GROUP BY state").fetchall()
    stats = {r["state"]: r["c"] for r in rows}
    total = sum(stats.values())
    in_funnel = sum(v for k, v in stats.items()
                    if k not in ("NEW", "CLOSED_WON", "CLOSED_LOST", "UNSUBSCRIBED"))
    won = stats.get("CLOSED_WON", 0)
    conv = round(won / total * 100, 1) if total else 0
    stats["total"] = total
    stats["in_funnel"] = in_funnel
    stats["conversion"] = conv
    return stats


def get_ab_stats() -> list:
    conn = db.get_conn()
    rows = conn.execute(
        "SELECT ab_variant, state FROM dialogs"
    ).fetchall()
    ab: dict[str, dict] = {}
    for r in rows:
        v = r["ab_variant"]
        if v not in ab:
            ab[v] = {"variant": v, "total": 0, "won": 0}
        ab[v]["total"] += 1
        if r["state"] == "CLOSED_WON":
            ab[v]["won"] += 1
    result = []
    for v, d in sorted(ab.items()):
        d["conv"] = round(d["won"] / d["total"] * 100, 1) if d["total"] else 0
        result.append(d)
    return result


def count_pending_followups() -> int:
    now = datetime.utcnow().isoformat()
    conn = db.get_conn()
    row = conn.execute(
        """SELECT COUNT(*) as c FROM dialogs
           WHERE next_followup IS NOT NULL AND next_followup <= ?
             AND state NOT IN ('CLOSED_WON','CLOSED_LOST','UNSUBSCRIBED')""",
        (now,)
    ).fetchone()
    return row["c"] if row else 0


@app.context_processor
def inject_globals():
    return {
        "bot_running": is_bot_running(),
        "state_badge": state_badge,
        "now": datetime.utcnow(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Маршруты: дашборд
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    db.init_db()
    stats = get_dashboard_stats()
    ab_stats = get_ab_stats()
    pending_followups = count_pending_followups()

    conn = db.get_conn()
    recent = conn.execute(
        "SELECT * FROM dialogs ORDER BY updated_at DESC LIMIT 10"
    ).fetchall()

    return render_template("index.html",
        stats=stats,
        ab_stats=ab_stats,
        pending_followups=pending_followups,
        recent_dialogs=recent,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Маршруты: диалоги
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/dialogs")
def dialogs():
    db.init_db()
    filter_state   = request.args.get("state", "")
    filter_variant = request.args.get("variant", "")
    filter_q       = request.args.get("q", "")
    page           = int(request.args.get("page", 1))
    per_page       = 25

    conn = db.get_conn()
    query = "SELECT * FROM dialogs WHERE 1=1"
    params = []
    if filter_state:
        query += " AND state=?"; params.append(filter_state)
    if filter_variant:
        query += " AND ab_variant=?"; params.append(filter_variant)
    if filter_q:
        q = f"%{filter_q}%"
        query += " AND (first_name LIKE ? OR last_name LIKE ? OR CAST(user_id AS TEXT) LIKE ?)"
        params += [q, q, q]
    query += " ORDER BY updated_at DESC"

    total = conn.execute(
        query.replace("SELECT *", "SELECT COUNT(*)"), params
    ).fetchone()[0]
    total_pages = (total + per_page - 1) // per_page
    query += f" LIMIT {per_page} OFFSET {(page-1)*per_page}"
    rows = conn.execute(query, params).fetchall()

    all_states = [r[0] for r in conn.execute(
        "SELECT DISTINCT state FROM dialogs ORDER BY state"
    ).fetchall()]

    return render_template("dialogs.html",
        dialogs=rows,
        filter_state=filter_state,
        filter_variant=filter_variant,
        filter_q=filter_q,
        page=page,
        total_pages=total_pages,
        all_states=all_states,
    )


@app.route("/dialog/<int:user_id>")
def dialog_view(user_id: int):
    db.init_db()
    dialog = db.get_dialog(user_id)
    if not dialog:
        flash("Диалог не найден", "danger")
        return redirect(url_for("dialogs"))
    conn = db.get_conn()
    messages = conn.execute(
        "SELECT * FROM messages WHERE user_id=? ORDER BY sent_at", (user_id,)
    ).fetchall()
    return render_template("dialog.html", dialog=dialog, messages=messages)


@app.route("/dialog/<int:user_id>/send", methods=["POST"])
def dialog_send(user_id: int):
    text = request.form.get("text", "").strip()
    if not text:
        flash("Введи текст сообщения", "danger")
        return redirect(url_for("dialog_view", user_id=user_id))
    try:
        from .bot import VKSalesBot
        bot = VKSalesBot(str(CONFIG_PATH))
        dialog = db.get_dialog(user_id)
        bot._send(user_id, text, dialog["state"] if dialog else None)
        flash("Сообщение отправлено", "success")
    except Exception as e:
        flash(f"Ошибка: {e}", "danger")
    return redirect(url_for("dialog_view", user_id=user_id))


@app.route("/dialog/<int:user_id>/close", methods=["POST"])
def dialog_close(user_id: int):
    db.set_state(user_id, "CLOSED_LOST", None)
    flash("Диалог закрыт", "success")
    return redirect(url_for("dialogs"))


@app.route("/dialog/<int:user_id>/set_state", methods=["POST"])
def dialog_set_state(user_id: int):
    state = request.form.get("state", "")
    if state:
        db.set_state(user_id, state, None)
        flash(f"Этап изменён на {state}", "success")
    return redirect(url_for("dialog_view", user_id=user_id))


# ─────────────────────────────────────────────────────────────────────────────
# Маршруты: рассылка
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/campaign")
def campaign():
    cfg = load_config()
    return render_template("campaign.html",
        cfg_delay_min=cfg.get("send_delay_min", 2),
        cfg_delay_max=cfg.get("send_delay_max", 8),
        cfg_dry_run=cfg.get("dry_run", True),
    )


@app.route("/campaign/start", methods=["POST"])
def campaign_start():
    # Обновить настройки из формы
    dry_run = "dry_run" in request.form
    save_config({
        "dry_run": dry_run,
        "send_delay_min": int(request.form.get("delay_min", 2)),
        "send_delay_max": int(request.form.get("delay_max", 8)),
    })

    # Собрать ID
    ids_text = request.form.get("ids_text", "")
    ids_file = request.files.get("ids_file")

    raw = ids_text
    if ids_file and ids_file.filename:
        raw += "\n" + ids_file.read().decode("utf-8", errors="ignore")

    user_ids = []
    for part in raw.replace(",", "\n").replace(";", "\n").splitlines():
        p = part.strip()
        if p.isdigit():
            user_ids.append(int(p))

    if not user_ids:
        flash("Не найдено ни одного VK ID. Проверь формат (только цифры).", "danger")
        return redirect(url_for("campaign"))

    try:
        from .bot import VKSalesBot
        bot = VKSalesBot(str(CONFIG_PATH))
        bot.start_campaign(user_ids)
        mode = "тестовом режиме (не отправлено реально)" if dry_run else "боевом режиме"
        flash(f"Рассылка запущена в {mode}. Пользователей: {len(user_ids)}", "success")
    except Exception as e:
        flash(f"Ошибка: {e}", "danger")

    return redirect(url_for("index"))


# ─────────────────────────────────────────────────────────────────────────────
# Маршруты: настройки
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/settings")
def settings():
    cfg = load_config()
    return render_template("settings.html", cfg=cfg)


@app.route("/settings/save", methods=["POST"])
def settings_save():
    def _int(val, default):
        try:
            return int(val or default)
        except (ValueError, TypeError):
            return default
    try:
        save_config({
            "group_token":    request.form.get("group_token", ""),
            "group_id":       _int(request.form.get("group_id"), 0),
            "dry_run":        "dry_run" in request.form,
            "send_delay_min": _int(request.form.get("send_delay_min"), 2),
            "send_delay_max": _int(request.form.get("send_delay_max"), 8),
            "use_ai":         "use_ai" in request.form,
            "groq_key":       request.form.get("groq_key", "").strip(),
            "ai_product":     request.form.get("ai_product", "").strip(),
        })
        flash("Настройки сохранены!", "success")
    except Exception as e:
        logger.error("settings_save error: %s", e)
        flash(f"Ошибка сохранения: {e}", "danger")
    return redirect(url_for("settings"))


@app.route("/api/messages/<int:user_id>")
def api_messages(user_id: int):
    conn = db.get_conn()
    count = conn.execute(
        "SELECT COUNT(*) FROM messages WHERE user_id=?", (user_id,)
    ).fetchone()[0]
    return jsonify({"count": count})


@app.route("/bot/log")
def bot_log():
    if not BOT_LOG_FILE.exists():
        lines_html = "Лог пуст — запусти бота чтобы появились записи."
    else:
        import html as _html
        lines = BOT_LOG_FILE.read_text(encoding="utf-8", errors="replace").splitlines()
        lines_html = _html.escape("\n".join(lines[-300:]))
    return render_template("bot_log.html", log=lines_html, bot_running=_bot_running())


@app.route("/api/debug")
def api_debug():
    cfg = load_config()
    return jsonify({
        "config_path": str(CONFIG_PATH),
        "config_exists": CONFIG_PATH.exists(),
        "has_groq_key": bool(cfg.get("groq_key")),
        "use_ai": cfg.get("use_ai"),
        "groq_key_len": len(cfg.get("groq_key") or ""),
        "ai_product_len": len(cfg.get("ai_product") or ""),
    })


@app.route("/api/log_tail")
def api_log_tail():
    if not BOT_LOG_FILE.exists():
        return jsonify({"log": "Лог пуст"})
    import html as _html
    lines = BOT_LOG_FILE.read_text(encoding="utf-8", errors="replace").splitlines()
    return jsonify({"log": _html.escape("\n".join(lines[-300:]))})


@app.route("/api/test_connection")
def api_test_connection():
    cfg = load_config()
    if not cfg.get("group_token"):
        return jsonify({"ok": False, "error": "Токен не задан"})
    try:
        import vk_api
        session = vk_api.VkApi(token=cfg["group_token"])
        vk = session.get_api()
        groups = vk.groups.getById(group_id=cfg["group_id"])
        name = groups[0]["name"] if groups else "?"
        return jsonify({"ok": True, "group_name": name})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)})


# ─────────────────────────────────────────────────────────────────────────────
# Маршруты: управление ботом
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/bot/start", methods=["POST"])
def bot_start():
    if is_bot_running():
        flash("Бот уже запущен", "warning")
        return redirect(url_for("index"))
    cfg = load_config()
    if not cfg.get("group_token"):
        flash("Сначала укажи токен в настройках", "danger")
        return redirect(url_for("settings"))
    try:
        python = sys.executable
        log_f = open(BOT_LOG_FILE, "a", encoding="utf-8")
        kwargs = dict(
            stdout=log_f,
            stderr=log_f,
            stdin=subprocess.DEVNULL,
        )
        if sys.platform == "win32":
            kwargs["creationflags"] = (subprocess.CREATE_NO_WINDOW
                                       | subprocess.DETACHED_PROCESS)
        proc = subprocess.Popen(
            [python, str(Path(__file__).parent.parent / "run_vk_bot.py"),
             "--config", str(CONFIG_PATH)],
            **kwargs,
        )
        BOT_PID_FILE.write_text(str(proc.pid))
        flash("Бот запущен!", "success")
    except Exception as e:
        flash(f"Ошибка запуска: {e}", "danger")
    return redirect(url_for("index"))


@app.route("/bot/stop", methods=["POST"])
def bot_stop():
    if not BOT_PID_FILE.exists():
        flash("Бот не запущен", "warning")
        return redirect(url_for("index"))
    try:
        pid = int(BOT_PID_FILE.read_text().strip())
        os.kill(pid, signal.SIGTERM)
        BOT_PID_FILE.unlink(missing_ok=True)
        flash("Бот остановлен", "success")
    except Exception as e:
        flash(f"Ошибка: {e}", "danger")
    return redirect(url_for("index"))


# ─────────────────────────────────────────────────────────────────────────────
# Маршруты: follow-ups и прочее
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/followups/run", methods=["POST"])
def followups_run():
    try:
        from .bot import VKSalesBot
        bot = VKSalesBot(str(CONFIG_PATH))
        bot.process_followups()
        flash("Follow-up сообщения отправлены", "success")
    except Exception as e:
        flash(f"Ошибка: {e}", "danger")
    return redirect(url_for("index"))


@app.route("/export/csv")
def export_csv():
    conn = db.get_conn()
    rows = conn.execute("SELECT * FROM dialogs ORDER BY created_at DESC").fetchall()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["user_id","state","ab_variant","first_name","last_name",
                     "city","created_at","updated_at","next_followup"])
    for r in rows:
        writer.writerow([r["user_id"],r["state"],r["ab_variant"],
                         r["first_name"],r["last_name"],r["city"],
                         r["created_at"],r["updated_at"],r["next_followup"]])
    output.seek(0)
    return Response(output.getvalue(), mimetype="text/csv",
                    headers={"Content-Disposition": "attachment;filename=dialogs.csv"})


@app.route("/db/reset")
def db_reset():
    db_file = BASE_DIR / "sales.db"
    if db_file.exists():
        db_file.unlink()
    db.init_db()
    flash("База данных очищена", "success")
    return redirect(url_for("settings"))


# ─────────────────────────────────────────────────────────────────────────────
# Точка входа
# ─────────────────────────────────────────────────────────────────────────────

def run_web(host="127.0.0.1", port=5001, debug=False):
    db.init_db()
    app.run(host=host, port=port, debug=debug, threaded=True, use_reloader=False)


if __name__ == "__main__":
    run_web(debug=True)
