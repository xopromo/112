#!/usr/bin/env bash
# Сохраняет vk_sales/sales.db в ветку _db.
# Запускать периодически (из крона) или вручную перед завершением сессии.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB_PATH="$REPO_DIR/vk_sales/sales.db"
BRANCH="_db"

if [ ! -f "$DB_PATH" ]; then
    echo "[backup_db] ℹ️  sales.db не существует — нечего бэкапить"
    exit 0
fi

cd "$REPO_DIR"

echo "[backup_db] Backing up sales.db to branch $BRANCH..."

# Сохраняем blob и строим дерево без чекаута
BLOB=$(git hash-object -w "$DB_PATH")
TREE=$(printf "100644 blob %s\tvk_sales/sales.db\n" "$BLOB" | git mktree)

PARENT=$(git ls-remote origin "refs/heads/$BRANCH" | cut -f1)
if [ -n "$PARENT" ]; then
    git fetch origin "$BRANCH" --quiet 2>/dev/null || true
    COMMIT=$(git commit-tree "$TREE" -p "$PARENT" \
        -m "db: backup $(date -u +%Y-%m-%dT%H:%M:%SZ)")
else
    COMMIT=$(git commit-tree "$TREE" \
        -m "db: init $(date -u +%Y-%m-%dT%H:%M:%SZ)")
fi

git push origin "${COMMIT}:refs/heads/$BRANCH" --quiet
SIZE=$(du -sh "$DB_PATH" | cut -f1)
echo "[backup_db] ✅ sales.db ($SIZE) pushed to $BRANCH"
