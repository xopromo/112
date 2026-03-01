#!/bin/bash
# Установка/переустановка Context Mode MCP-сервера для Claude Code
# Источник: https://github.com/mksglu/claude-context-mode
#
# Запуск:
#   bash agent/setup_context_mode.sh

set -e

INSTALL_DIR="/home/user/.claude-context-mode"
TMP_DIR="/tmp/claude-context-mode"

echo "=== Context Mode: установка ==="

# 1. Клонируем репозиторий
echo "[1/4] Клонирование репозитория..."
rm -rf "$TMP_DIR"
git clone --depth=1 https://github.com/mksglu/claude-context-mode "$TMP_DIR"

# 2. Устанавливаем зависимости
echo "[2/4] Установка зависимостей..."
cd "$TMP_DIR"
npm install --silent

# 3. Копируем в постоянную директорию
echo "[3/4] Копирование в $INSTALL_DIR..."
rm -rf "$INSTALL_DIR"
cp -r "$TMP_DIR" "$INSTALL_DIR"
chmod +x "$INSTALL_DIR/hooks/pretooluse.sh"

# 4. Регистрируем MCP-сервер в Claude Code
echo "[4/4] Регистрация MCP-сервера..."
claude mcp add context-mode -- node "$INSTALL_DIR/server.bundle.mjs" 2>/dev/null || true

# 5. Добавляем PreToolUse хуки в settings.json
SETTINGS="$HOME/.claude/settings.json"
if [ -f "$SETTINGS" ]; then
    # Проверяем, не добавлен ли хук уже
    if grep -q "pretooluse.sh" "$SETTINGS"; then
        echo "    Хуки уже настроены — пропуск."
    else
        # Вставляем PreToolUse секцию перед существующими hooks
        python3 - <<PYEOF
import json, sys

with open("$SETTINGS") as f:
    s = json.load(f)

hook_entry = {
    "matcher": "Bash|WebFetch|Read|Grep|Task",
    "hooks": [{
        "type": "command",
        "command": "bash $INSTALL_DIR/hooks/pretooluse.sh"
    }]
}

hooks = s.setdefault("hooks", {})
pre = hooks.setdefault("PreToolUse", [])
if not any("pretooluse.sh" in str(h) for h in pre):
    pre.insert(0, hook_entry)

with open("$SETTINGS", "w") as f:
    json.dump(s, f, indent=4, ensure_ascii=False)
    f.write("\n")

print("    Хуки добавлены в settings.json")
PYEOF
    fi
else
    echo "    Внимание: $SETTINGS не найден — хуки не добавлены."
    echo "    Создайте файл вручную или запустите Claude Code хотя бы раз."
fi

echo ""
echo "=== Готово! ==="
echo "Context Mode установлен в: $INSTALL_DIR"
echo "MCP-сервер зарегистрирован для проекта /home/user/112"
echo "Хуки PreToolUse активны для: Bash, WebFetch, Read, Grep, Task"
echo ""
echo "Проверка — доступные инструменты сервера:"
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | timeout 3 node "$INSTALL_DIR/server.bundle.mjs" 2>/dev/null \
    | python3 -c "import json,sys; d=json.load(sys.stdin); [print('  -', t['name']) for t in d['result']['tools']]" \
    || echo "  (запустите новую сессию Claude Code для проверки)"
