#!/bin/bash
# SearXNG + Claude Code MCP setup
# Запускает SearXNG в Docker и прописывает MCP-сервер в ~/.claude/settings.json
# Использование: bash agent/setup_searxng.sh

set -e

SEARXNG_PORT=8888
# Ищем реальный ~/.claude/settings.json (HOME может быть /root в некоторых окружениях)
SETTINGS="$(bash -c 'echo ~/.claude/settings.json')"

echo "[1/3] Запуск SearXNG..."
if docker ps --filter "name=searxng" --filter "status=running" | grep -q searxng; then
  echo "  SearXNG уже запущен"
else
  if docker ps -a --filter "name=searxng" | grep -q searxng; then
    docker start searxng
    echo "  Контейнер запущен (существующий)"
  else
    docker run -d \
      --name searxng \
      -p ${SEARXNG_PORT}:8080 \
      --restart unless-stopped \
      searxng/searxng
    echo "  Контейнер создан и запущен"
  fi
fi

# Ждём старта
sleep 3
if curl -s "http://localhost:${SEARXNG_PORT}" > /dev/null; then
  echo "  SearXNG доступен на http://localhost:${SEARXNG_PORT}"
else
  echo "  WARN: SearXNG не отвечает — подождите 10 сек и проверьте docker logs searxng"
fi

echo "[2/3] Прописываем MCP в ${SETTINGS}..."
python3 - <<PYEOF
import json, sys

path = "$SETTINGS"
with open(path) as f:
    cfg = json.load(f)

cfg.setdefault("mcpServers", {})["searxng"] = {
    "command": "npx",
    "args": ["-y", "mcp-searxng"],
    "env": {
        "SEARXNG_URL": "http://localhost:$SEARXNG_PORT"
    }
}

with open(path, "w") as f:
    json.dump(cfg, f, indent=4, ensure_ascii=False)

print("  MCP-сервер 'searxng' добавлен в settings.json")
PYEOF

echo "[3/3] Готово!"
echo ""
echo "Перезапусти Claude Code. В новой сессии MCP-инструмент mcp__searxng__searxng_web_search будет доступен."
echo "Проверка: попроси Claude 'найди через searxng ...'"
