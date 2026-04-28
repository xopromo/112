#!/usr/bin/env python3
from __future__ import annotations

import html
import json
import subprocess
from collections import OrderedDict
from datetime import datetime
from pathlib import Path

BASE = Path(__file__).resolve().parent
STABLE_DIR = BASE / "stable"
DAILY_DIR = STABLE_DIR / "daily"
OVERRIDES_FILE = STABLE_DIR / "version_overrides.json"
SINCE = "2026-02-26"
UNTIL = "2026-04-26 23:59:59"
BUILD_FILE = "USE_Optimizer_v6_built.html"

SPECIALS = [
    {
        "key": "stable-2026-03-03",
        "title": "Стабильная версия",
        "version": "stable-2026-03-03",
        "date": "2026-03-03",
        "status": "STABLE",
        "emoji": "🟢",
        "note": "Отмеченная стабильная версия.",
        "url": "./stable/2026-03-03/",
        "archive_url": "./2026-03-03/",
    },
    {
        "key": "stable-2026-03-07",
        "title": "Стабильная версия",
        "version": "stable-2026-03-07",
        "date": "2026-03-07",
        "status": "STABLE",
        "emoji": "🟢",
        "note": "Более поздняя стабильная версия марта.",
        "url": "./stable/2026-03-07/",
        "archive_url": "./2026-03-07/",
    },
    {
        "key": "v6.2.2-before-audit",
        "title": "Версия перед аудитом",
        "version": "v6.2.2-before-audit",
        "date": "2026-04-15",
        "status": "SNAPSHOT",
        "emoji": "🟠",
        "note": "Отдельный снимок перед аудитом.",
        "url": "./stable/v6.2.2-before-audit/",
        "archive_url": "./v6.2.2-before-audit/",
    },
]


def run_git(*args: str) -> str:
    return subprocess.check_output(
        ["git", *args],
        cwd=BASE,
        text=True,
        encoding="utf-8",
    )


def latest_daily_commits() -> list[dict[str, str]]:
    raw = run_git(
        "log",
        "origin/main",
        f"--since={SINCE}",
        f"--until={UNTIL}",
        "--date=short",
        "--pretty=format:%ad|%H|%s",
    )
    grouped: OrderedDict[str, dict[str, str]] = OrderedDict()
    for line in raw.splitlines():
        date, commit_hash, subject = line.split("|", 2)
        if date not in grouped:
            grouped[date] = {"date": date, "hash": commit_hash, "subject": subject}
    return list(grouped.values())


def load_version_overrides() -> dict[str, dict]:
    if not OVERRIDES_FILE.exists():
        return {}
    return json.loads(OVERRIDES_FILE.read_text(encoding="utf-8"))


def git_show_file(commit_hash: str, file_path: str) -> str | None:
    try:
        return run_git("show", f"{commit_hash}:{file_path}")
    except subprocess.CalledProcessError:
        return None


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as fh:
        fh.write(content)


def apply_override_to_content(content: str, override: dict) -> str:
    for repl in override.get("replacements", []):
        old = repl["old"]
        new = repl["new"]
        if old in content:
            content = content.replace(old, new)
    return content


def append_patch_note(text: str, override: dict) -> str:
    patched_at = override.get("patchedAt")
    patch_note = override.get("patchNote")
    if not patched_at and not patch_note:
        return text
    extra = []
    if patched_at:
        extra.append(f"исправлено {patched_at}")
    if patch_note:
        extra.append(patch_note)
    return f"{text} • {'; '.join(extra)}"


def build_snapshot_wrapper(title: str, subtitle: str, app_rel: str, back_rel: str, current_rel: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{html.escape(title)}</title>
  <style>
    body {{
      margin: 0;
      font-family: Arial, sans-serif;
      background: #0b1220;
      color: #e5eef8;
    }}
    .topbar {{
      padding: 12px 16px;
      background: #111a2b;
      border-bottom: 1px solid #22314d;
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      align-items: center;
    }}
    .topbar a {{
      color: #7dd3fc;
      text-decoration: none;
    }}
    .topbar strong {{
      margin-right: 8px;
    }}
    .muted {{
      color: #9fb3c8;
      font-size: .9em;
    }}
    iframe {{
      width: 100%;
      height: calc(100vh - 62px);
      border: 0;
      display: block;
      background: #fff;
    }}
  </style>
</head>
<body>
  <div class="topbar">
    <strong>{html.escape(title)}</strong>
    <span class="muted">{html.escape(subtitle)}</span>
    <a href="{current_rel}">Текущая версия</a>
    <a href="{back_rel}">Архив версий</a>
    <a href="{app_rel}">Открыть напрямую</a>
  </div>
  <iframe src="{app_rel}" title="{html.escape(title)}"></iframe>
</body>
</html>
"""


def build_list_page(title: str, subtitle: str, cards_html: str, current_rel: str, root_rel: str | None) -> str:
    extra_link = f'<a href="{root_rel}">Назад к версиям</a>' if root_rel else ""
    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{html.escape(title)}</title>
  <style>
    body {{
      margin: 0;
      padding: 40px 20px;
      font-family: Arial, sans-serif;
      background: #0b1220;
      color: #e5eef8;
    }}
    .wrap {{
      max-width: 980px;
      margin: 0 auto;
    }}
    h1, h2 {{
      margin-top: 0;
    }}
    .muted {{
      color: #9fb3c8;
    }}
    .card {{
      background: #111a2b;
      border: 1px solid #22314d;
      border-radius: 12px;
      padding: 18px;
      margin-top: 18px;
    }}
    .row {{
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      flex-wrap: wrap;
    }}
    .badge {{
      color: #9fb3c8;
      font-size: .75em;
      border: 1px solid #314769;
      border-radius: 999px;
      padding: 3px 8px;
      white-space: nowrap;
    }}
    a {{
      color: #7dd3fc;
      text-decoration: none;
    }}
    .links {{
      margin-top: 20px;
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>{html.escape(title)}</h1>
    <p class="muted">{html.escape(subtitle)}</p>
    {cards_html}
    <div class="links">
      <a href="{current_rel}">Открыть текущую версию</a>
      {extra_link}
    </div>
  </div>
</body>
</html>
"""


def card_html(version: str, title: str, date: str, note: str, url: str, status: str) -> str:
    return f"""<div class="card">
  <div class="row">
    <div>
      <h2>{html.escape(version)}</h2>
      <div class="muted">{html.escape(title)} • {html.escape(date)}</div>
      <p>{html.escape(note)}</p>
    </div>
    <div class="badge">{html.escape(status)}</div>
  </div>
  <p><a href="{url}">Открыть версию</a></p>
</div>"""


def build_ui_versions(entries: list[dict[str, str]]) -> str:
    groups = [
        ("current", "Текущая версия"),
        ("special", "Специальные версии"),
        ("daily", "Архив по датам"),
    ]
    data = json.dumps(entries, ensure_ascii=False, indent=2)
    groups_json = json.dumps(groups, ensure_ascii=False)
    return f"""// ============================================================
// VERSIONS VIEWER — generated by build_version_archive.py
// ============================================================

const VERSIONS_DATA = {data};
const VERSION_GROUPS = {groups_json};

function openVersionsModal() {{
  _ensureVersionsModal();
  const overlay = document.getElementById('versions-modal-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  _renderVersionsList();
}}

function closeVersionsModal() {{
  const overlay = document.getElementById('versions-modal-overlay');
  if (overlay) overlay.style.display = 'none';
}}

function _renderVersionsList() {{
  const list = document.getElementById('versions-list');
  if (!list) return;
  const parts = [];
  VERSION_GROUPS.forEach(([groupKey, groupTitle]) => {{
    const rows = VERSIONS_DATA.filter(v => v.group === groupKey);
    if (!rows.length) return;
    parts.push(`
      <div style="padding:14px 20px;border-bottom:1px solid var(--border);background:var(--bg3);position:sticky;top:0;z-index:1">
        <strong style="color:var(--accent)">${{groupTitle}}</strong>
        <span style="color:var(--text3);font-size:.82em;margin-left:8px">${{rows.length}}</span>
      </div>
    `);
    rows.forEach(v => {{
      parts.push(`
        <div style="border-bottom:1px solid var(--border);padding:16px 20px;display:flex;gap:14px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap">
          <div style="display:flex;gap:12px;align-items:flex-start;min-width:280px;flex:1">
            <div style="font-size:1.2em;line-height:1.2">${{v.emoji}}</div>
            <div>
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
                <strong style="color:var(--accent)">${{v.version}}</strong>
                <span style="color:var(--text3);font-size:.8em">${{v.date}}</span>
                <span style="color:var(--text3);font-size:.75em;background:var(--bg3);padding:2px 8px;border-radius:3px">${{v.status}}</span>
              </div>
              <div style="color:var(--text);font-size:.92em;margin-bottom:4px">${{v.title}}</div>
              <div style="color:var(--text2);font-size:.84em">${{v.note}}</div>
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <a href="${{v.url}}" target="_blank" rel="noopener noreferrer"
               style="padding:8px 12px;background:rgba(0,212,255,.15);border:1px solid var(--accent);border-radius:6px;color:var(--accent);font-size:.85em;text-decoration:none;white-space:nowrap">
              Открыть версию
            </a>
          </div>
        </div>
      `);
    }});
  }});
  list.innerHTML = parts.join('');
}}

function _ensureVersionsModal() {{
  if (document.getElementById('versions-modal-overlay')) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div id="versions-modal-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;align-items:center;justify-content:center;padding:24px" onclick="if(event.target===this)closeVersionsModal()">
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;width:100%;max-width:980px;max-height:85vh;display:flex;flex-direction:column;overflow:hidden">
        <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
          <div style="display:flex;align-items:center;gap:12px">
            <span style="font-size:1.4em">🗂</span>
            <div>
              <h2 style="margin:0;color:var(--accent)">Версии</h2>
              <div style="font-size:.8em;color:var(--text3)">Отдельные страницы по датам: специальные снимки и полный архив за последние месяцы.</div>
            </div>
          </div>
          <button onclick="closeVersionsModal()" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:1.3em">✕</button>
        </div>
        <div style="padding:12px 20px;background:var(--bg3);border-bottom:1px solid var(--border);font-size:.85em;color:var(--text2)">
          У каждой версии видны подпись, дата и тип. Открытие идет на отдельной надежной странице.
        </div>
        <div id="versions-list" style="flex:1;overflow-y:auto;padding:0">
          <div style="padding:20px;text-align:center;color:var(--text3)">Загрузка...</div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrap.firstElementChild);
}}

try {{ window.openVersionsModal = openVersionsModal; }} catch(e) {{}}
try {{ window.closeVersionsModal = closeVersionsModal; }} catch(e) {{}}
"""


def main() -> None:
    STABLE_DIR.mkdir(parents=True, exist_ok=True)
    DAILY_DIR.mkdir(parents=True, exist_ok=True)
    overrides = load_version_overrides()

    daily_entries: list[dict[str, str]] = []
    daily_cards: list[str] = []

    for item in latest_daily_commits():
        archive_key = f"daily/{item['date']}"
        override = overrides.get(archive_key, {})
        app = git_show_file(item["hash"], BUILD_FILE)
        if not app:
            continue
        app = apply_override_to_content(app, override)
        day_dir = DAILY_DIR / item["date"]
        write_text(day_dir / "app.html", app)
        short_hash = item["hash"][:7]
        title = f"Архивная версия: {item['date']}"
        subtitle = append_patch_note(f"{short_hash} - {item['subject']}", override)
        write_text(
            day_dir / "index.html",
            build_snapshot_wrapper(
                title=title,
                subtitle=subtitle,
                app_rel="app.html",
                back_rel="../",
                current_rel="../../../USE_Optimizer_v6_built.html",
            ),
        )
        daily_entries.append(
            {
                "group": "daily",
                "key": f"daily-{item['date']}",
                "title": "Архив по датам",
                "version": item["date"],
                "date": item["date"],
                "status": "DAILY",
                "emoji": "📅",
                "note": append_patch_note(f"{short_hash} - {item['subject']}", override),
                "url": f"./stable/daily/{item['date']}/",
            }
        )
        daily_cards.append(
            card_html(
                version=item["date"],
                title="Архив по датам",
                date=item["date"],
                note=append_patch_note(f"{short_hash} - {item['subject']}", override),
                url=f"./{item['date']}/",
                status="DAILY",
            )
        )

    write_text(
        DAILY_DIR / "index.html",
        build_list_page(
            title="Архив версий по датам",
            subtitle=f"По одной финальной точке на день из основной истории за период {SINCE} — 2026-04-26.",
            cards_html="\n".join(daily_cards),
            current_rel="../../USE_Optimizer_v6_built.html",
            root_rel="../",
        ),
    )

    root_cards = [
        card_html(
            version=item["version"],
            title=item["title"],
            date=item["date"],
            note=item["note"],
            url=item["archive_url"],
            status=item["status"],
        )
        for item in SPECIALS
    ]
    root_cards.append(
        card_html(
            version="Архив по датам",
            title="Последние 2 месяца",
            date=f"{SINCE} — 2026-04-26",
            note=f"Полный архив по дням, всего {len(daily_entries)} страниц.",
            url="./daily/",
            status="DAILY",
        )
    )
    write_text(
        STABLE_DIR / "index.html",
        build_list_page(
            title="Версии USE Optimizer",
            subtitle="Отдельные страницы для специальных снимков и полного архива по датам.",
            cards_html="\n".join(root_cards),
            current_rel="../USE_Optimizer_v6_built.html",
            root_rel=None,
        ),
    )

    readme = (
        "# Version archive\n\n"
        "Generated by `build_version_archive.py`.\n\n"
        f"- Daily snapshots: {len(daily_entries)}\n"
        f"- Range: {SINCE} .. 2026-04-26\n"
    )
    write_text(STABLE_DIR / "README.md", readme)

    current_entry = {
        "group": "current",
        "key": "current",
        "title": "Текущая версия",
        "version": "Current build",
        "date": datetime.now().strftime("%Y-%m-%d"),
        "status": "LIVE",
        "emoji": "🟦",
        "note": "Актуальная сборка оптимизатора.",
        "url": "./USE_Optimizer_v6_built.html",
    }
    special_entries = [{**item, "group": "special", "url": item["url"]} for item in SPECIALS]
    ui_versions = [current_entry, *special_entries, *daily_entries]
    write_text(BASE / "ui_versions.js", build_ui_versions(ui_versions))

    print(f"Generated {len(daily_entries)} daily snapshots.")


if __name__ == "__main__":
    main()
