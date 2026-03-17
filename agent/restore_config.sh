#!/usr/bin/env bash
# Восстанавливает vk_sales/config.json из ветки _config (GitHub).
# Запускается автоматически при старте сессии через session-start хук.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_PATH="$REPO_DIR/vk_sales/config.json"
BRANCH="_config"

echo "[restore_config] Fetching $BRANCH branch..."
cd "$REPO_DIR"

if git fetch origin "$BRANCH" 2>/dev/null; then
    if git show "origin/$BRANCH:vk_sales/config.json" > "$CONFIG_PATH" 2>/dev/null; then
        PROVIDERS=$(python3 -c "
import json, sys
cfg = json.load(open('$CONFIG_PATH'))
names = [m['provider'] for m in cfg.get('ai_models', []) if m.get('key')]
print(', '.join(names) if names else 'none')
" 2>/dev/null || echo "?")
        echo "[restore_config] ✅ config.json restored (providers: $PROVIDERS)"
    else
        echo "[restore_config] ⚠️  Branch $BRANCH exists but config.json not found in it"
        exit 1
    fi
else
    echo "[restore_config] ⚠️  Branch $BRANCH not found — run 'Generate VK Bot Config' workflow first"
    echo "[restore_config]    https://github.com/xopromo/112/actions/workflows/make-config.yml"
    exit 1
fi
