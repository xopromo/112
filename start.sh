#!/bin/bash
# =====================================================
# VK Sales Bot — запуск веб-интерфейса
# Запускать каждый раз: bash start.sh
# =====================================================

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PORT=5001
URL="http://localhost:$PORT"

# Проверить что установка была выполнена
if [ ! -d "venv" ]; then
  echo -e "${RED}Сначала запусти: bash install.sh${NC}"
  exit 1
fi

# Убить предыдущий процесс на этом порту если есть
if command -v lsof &>/dev/null; then
  OLD_PID=$(lsof -ti:$PORT 2>/dev/null || true)
  if [ -n "$OLD_PID" ]; then
    kill "$OLD_PID" 2>/dev/null || true
    sleep 1
  fi
fi

echo ""
echo -e "${BOLD}${CYAN}╔════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║         VK Sales Bot               ║${NC}"
echo -e "${BOLD}${CYAN}╚════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}▶ Запускаю веб-интерфейс...${NC}"
echo ""
echo -e "   Открой в браузере: ${BOLD}${CYAN}$URL${NC}"
echo ""
echo -e "${YELLOW}Для остановки нажми Ctrl+C${NC}"
echo ""

# Попытаться открыть браузер автоматически
sleep 1 && (
  if command -v xdg-open &>/dev/null; then
    xdg-open "$URL" 2>/dev/null &
  elif command -v open &>/dev/null; then
    open "$URL" 2>/dev/null &
  fi
) &

# Запуск Flask
export FLASK_ENV=production
./venv/bin/python -c "
import sys
sys.path.insert(0, '.')
from vk_sales.web_app import run_web
run_web(host='127.0.0.1', port=$PORT)
"
