#!/usr/bin/env python3
"""
Telegram News Aggregator
Reads source channels via Telethon, deduplicates, cleans with Groq,
and schedules posts to target channel via Bot API.
"""

import os, json, hashlib, asyncio, re, time, base64, sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
import requests
from telethon import TelegramClient
from telethon.sessions import StringSession

# ── Config ────────────────────────────────────────────────────────────────────
API_ID      = int(os.environ['TG_API_ID'])
API_HASH    = os.environ['TG_API_HASH']
SESSION_STR = os.environ['TG_SESSION']
BOT_TOKEN   = os.environ['BOT_TOKEN']
TARGET      = os.environ['TARGET_CHANNEL']     # e.g. @neirogmagia or -100123456789
GROQ_KEY    = os.environ.get('GROQ_API_KEY', '')
GH_TOKEN    = os.environ.get('GITHUB_TOKEN', '')
REPO        = os.environ.get('GITHUB_REPOSITORY', 'xopromo/112')
MAX_PER_RUN = int(os.environ.get('MAX_PER_RUN', '1'))
LOOKBACK    = int(os.environ.get('LOOKBACK_HOURS', '5'))

SCRIPT_DIR   = Path(__file__).parent
SOURCES_FILE = SCRIPT_DIR / 'sources.txt'

# ── Similarity ────────────────────────────────────────────────────────────────
def tokenize(text):
    return set(re.findall(r'[а-яёa-z0-9]+', text.lower()))

def jaccard(a, b):
    ta, tb = tokenize(a), tokenize(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)

def text_hash(text):
    return hashlib.md5(re.sub(r'\s+', ' ', text.lower()).encode()).hexdigest()[:16]

# ── GitHub _db branch ─────────────────────────────────────────────────────────
DB_FILE   = 'tg_aggregator/seen.json'
DB_BRANCH = '_db'

def _gh_headers():
    return {"Authorization": f"token {GH_TOKEN}",
            "Accept": "application/vnd.github.v3+json"}

def _ensure_db_branch():
    r = requests.get(f"https://api.github.com/repos/{REPO}/git/ref/heads/{DB_BRANCH}",
                     headers=_gh_headers(), timeout=15)
    if r.status_code == 404:
        r2 = requests.get(f"https://api.github.com/repos/{REPO}/git/ref/heads/main",
                          headers=_gh_headers(), timeout=15)
        if not r2.ok:
            print("[db] cannot find main branch to create _db")
            return
        sha = r2.json()['object']['sha']
        requests.post(f"https://api.github.com/repos/{REPO}/git/refs",
                      headers=_gh_headers(), timeout=15,
                      json={"ref": f"refs/heads/{DB_BRANCH}", "sha": sha})
        print(f"[db] created branch {DB_BRANCH}")

def load_db():
    if not GH_TOKEN:
        return {}, None
    _ensure_db_branch()
    r = requests.get(f"https://api.github.com/repos/{REPO}/contents/{DB_FILE}",
                     params={"ref": DB_BRANCH}, headers=_gh_headers(), timeout=15)
    if r.status_code == 200:
        d = r.json()
        content = base64.b64decode(d['content']).decode()
        return json.loads(content), d['sha']
    return {}, None

def save_db(data, sha=None):
    if not GH_TOKEN:
        return False
    content = base64.b64encode(
        json.dumps(data, ensure_ascii=False, indent=2).encode()
    ).decode()
    body = {
        "message": "tg_aggregator: update seen",
        "content": content,
        "branch": DB_BRANCH
    }
    if sha:
        body["sha"] = sha
    r = requests.put(f"https://api.github.com/repos/{REPO}/contents/{DB_FILE}",
                     headers=_gh_headers(), json=body, timeout=15)
    ok = r.status_code in (200, 201)
    if not ok:
        print(f"[db] save failed: {r.status_code} {r.text[:200]}")
    return ok

# ── Text cleaning ─────────────────────────────────────────────────────────────
_CHANNEL_RE = re.compile(r'@[\w]{3,}|https?://t\.me/[\w/]+', re.IGNORECASE)
_FORWARD_RE = re.compile(
    r'(?:источник|перепост|via|from|подписаться|подпишись|канал)[:\s]*@[\w]+',
    re.IGNORECASE)
_HASHTAG_RE = re.compile(r'#\w+')
_MULTILINE  = re.compile(r'\n{3,}')

def basic_clean(text):
    text = _FORWARD_RE.sub('', text)
    text = _CHANNEL_RE.sub('', text)
    text = _HASHTAG_RE.sub('', text)
    text = _MULTILINE.sub('\n\n', text)
    return text.strip()

# ── Groq style improvement ─────────────────────────────────────────────────────
SYSTEM_PROMPT = """\
Ты редактор телеграм-канала про ИИ и нейросети.
Тебе дают пост из другого канала. Задача:
1. Убрать ВСЕ упоминания чужих каналов (@username, t.me/*), если они ещё остались
2. Убрать рекламные метки и призывы подписаться на другие каналы
3. Слегка улучшить стиль — сделать текст чище и читабельнее, без воды
4. НЕ меняй факты; ссылки на статьи, продукты, github — оставляй
5. Верни ТОЛЬКО готовый текст поста, без пояснений и кавычек

Если текст — чистая реклама или короче 15 слов — верни пустую строку."""

def groq_improve(text):
    if not GROQ_KEY or len(text.split()) < 5:
        return text
    try:
        r = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_KEY}",
                     "Content-Type": "application/json"},
            json={
                "model": "llama-3.3-70b-versatile",
                "temperature": 0.3,
                "max_tokens": 1024,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": text}
                ]
            },
            timeout=30
        )
        r.raise_for_status()
        result = r.json()['choices'][0]['message']['content'].strip()
        return result
    except Exception as e:
        print(f"[groq] error: {e}")
        return text

# ── Telegram Bot API ───────────────────────────────────────────────────────────
def bot_post(text, schedule_unix=None):
    payload = {
        "chat_id": TARGET,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": False
    }
    if schedule_unix:
        payload["schedule_date"] = schedule_unix
    r = requests.post(
        f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
        json=payload, timeout=15
    )
    if not r.ok:
        print(f"[bot] error: {r.status_code} {r.text[:300]}")
    return r.ok

# ── Source channels ────────────────────────────────────────────────────────────
def read_sources():
    if not SOURCES_FILE.exists():
        print(f"[sources] {SOURCES_FILE} not found")
        return []
    sources = []
    for line in SOURCES_FILE.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line and not line.startswith('#'):
            sources.append(line)
    return sources

# ── Fetch posts ────────────────────────────────────────────────────────────────
async def fetch_posts(client, channels, lookback_hours):
    posts = []
    since = datetime.now(timezone.utc) - timedelta(hours=lookback_hours)
    for ch in channels:
        try:
            count = 0
            async for msg in client.iter_messages(ch, limit=100):
                if msg.date.replace(tzinfo=timezone.utc) < since:
                    break
                if not msg.text or len(msg.text.strip()) < 30:
                    continue
                # Skip forwarded messages (already aggregated elsewhere)
                if msg.forward:
                    continue
                posts.append({
                    "channel": ch,
                    "id": msg.id,
                    "text": msg.text,
                    "date": msg.date.isoformat()
                })
                count += 1
            print(f"[fetch] {ch}: {count} posts")
        except Exception as e:
            print(f"[fetch] {ch}: error — {e}")
    return posts

# ── Main ───────────────────────────────────────────────────────────────────────
async def main():
    sources = read_sources()
    if not sources:
        print("No sources in sources.txt — add channel usernames and re-run")
        sys.exit(0)

    print(f"[main] sources: {sources}")
    print(f"[main] target: {TARGET}, max_per_run: {MAX_PER_RUN}, lookback: {LOOKBACK}h")

    # Load seen DB
    seen_db, db_sha = load_db()
    seen_hashes = set(seen_db.get("hashes", []))
    seen_texts  = seen_db.get("texts", [])   # last 200 for similarity check

    # Fetch from Telegram
    async with TelegramClient(StringSession(SESSION_STR), API_ID, API_HASH) as client:
        posts = await fetch_posts(client, sources, LOOKBACK)

    print(f"[main] fetched {len(posts)} posts total")

    # Deduplicate against seen + within this batch
    candidates = []
    batch_texts = []
    for p in posts:
        h = text_hash(p["text"])
        if h in seen_hashes:
            continue
        if any(jaccard(p["text"], t) > 0.55 for t in (seen_texts[-100:] + batch_texts)):
            print(f"[dedup] similar post skipped from {p['channel']}: {p['text'][:60]!r}")
            continue
        candidates.append(p)
        batch_texts.append(p["text"])

    print(f"[main] {len(candidates)} new unique posts after dedup")

    # Pick up to MAX_PER_RUN (newest first → already ordered by Telethon)
    candidates = candidates[:MAX_PER_RUN]

    # Process & schedule
    posted = 0
    now = datetime.now(timezone.utc)

    for i, p in enumerate(candidates):
        cleaned  = basic_clean(p["text"])
        improved = groq_improve(cleaned)

        if not improved or len(improved.strip().split()) < 10:
            print(f"[filter] post too short after processing — skip")
            continue

        # Schedule: first post in 10 min, then +60 min each
        delay_min    = 10 + i * 60
        schedule_ts  = int((now + timedelta(minutes=delay_min)).timestamp())

        ok = bot_post(improved, schedule_unix=schedule_ts)
        if ok:
            seen_hashes.add(text_hash(p["text"]))
            seen_texts.append(p["text"])
            posted += 1
            sched_str = (now + timedelta(minutes=delay_min)).strftime('%H:%M UTC')
            print(f"[post] ✓ scheduled at {sched_str} | source: {p['channel']}")
        time.sleep(1)

    # Persist DB (trim to last 500 hashes / 200 texts)
    seen_db["hashes"] = list(seen_hashes)[-500:]
    seen_db["texts"]  = seen_texts[-200:]
    seen_db["last_run"] = datetime.now(timezone.utc).isoformat()

    if posted > 0 or db_sha is None:
        save_db(seen_db, db_sha)

    print(f"[main] done — posted: {posted}/{len(candidates)}")


if __name__ == "__main__":
    asyncio.run(main())
