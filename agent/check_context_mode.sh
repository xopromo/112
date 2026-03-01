#!/bin/bash
# Проверка и автозапуск Context Mode MCP-сервера
# Вызывается автоматически при каждой новой сессии Claude Code (через CLAUDE.md)

INSTALL_DIR="/home/user/.claude-context-mode"
OK=true

# Проверка 1: файлы на месте?
if [ ! -f "$INSTALL_DIR/server.bundle.mjs" ]; then
    echo "[context-mode] ОТСУТСТВУЕТ: файлы не найдены в $INSTALL_DIR"
    OK=false
fi

# Проверка 2: сервер отвечает?
if [ "$OK" = true ]; then
    RESULT=$(echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
        | timeout 3 node "$INSTALL_DIR/server.bundle.mjs" 2>/dev/null \
        | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d['result']['tools']))" 2>/dev/null)
    if [ "$RESULT" != "7" ]; then
        echo "[context-mode] ОШИБКА: сервер не отвечает (ожидалось 7 инструментов, получено: $RESULT)"
        OK=false
    fi
fi

# Проверка 3: зарегистрирован в Claude Code?
if [ "$OK" = true ]; then
    if ! grep -q "claude-context-mode\|context-mode" /root/.claude.json 2>/dev/null; then
        echo "[context-mode] НЕ ЗАРЕГИСТРИРОВАН в .claude.json"
        OK=false
    fi
fi

# Если что-то не так — переустанавливаем
if [ "$OK" = false ]; then
    echo "[context-mode] Запуск переустановки..."
    bash "$(dirname "$0")/setup_context_mode.sh"
else
    echo "[context-mode] OK — сервер работает, 7 инструментов доступны"
fi
