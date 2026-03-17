#!/usr/bin/env bash
# Восстанавливает vk_sales/sales.db из ветки _db.
# Запускается автоматически при старте сессии через session-start хук.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB_PATH="$REPO_DIR/vk_sales/sales.db"
BRANCH="_db"

cd "$REPO_DIR"

echo "[restore_db] Fetching $BRANCH branch..."

if git fetch origin "$BRANCH" --quiet 2>/dev/null; then
    if git show "origin/$BRANCH:vk_sales/sales.db" > "$DB_PATH" 2>/dev/null; then
        SIZE=$(du -sh "$DB_PATH" | cut -f1)
        # Показываем последние записи
        STATS=$(python3 -c "
import sqlite3
try:
    conn = sqlite3.connect('$DB_PATH')
    n_msg   = conn.execute('SELECT COUNT(*) FROM messages').fetchone()[0]
    n_dlg   = conn.execute('SELECT COUNT(*) FROM dialogs').fetchone()[0]
    last_at = conn.execute('SELECT MAX(sent_at) FROM messages').fetchone()[0] or 'n/a'
    print(f'dialogs={n_dlg}, messages={n_msg}, last={last_at[:16]}')
except Exception as e:
    print(f'err: {e}')
" 2>/dev/null || echo "?")
        echo "[restore_db] ✅ sales.db restored ($SIZE): $STATS"
    else
        echo "[restore_db] ⚠️  Branch $BRANCH exists but sales.db not found in it"
    fi
else
    echo "[restore_db] ℹ️  Branch $BRANCH not found — fresh start (no prior data)"
fi
