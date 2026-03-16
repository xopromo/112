#!/bin/bash
# =====================================================
# VK Sales Bot — установка всего необходимого
# Запускать один раз: bash install.sh
# =====================================================

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

echo ""
echo -e "${BOLD}${CYAN}╔════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║     VK Sales Bot — Установка       ║${NC}"
echo -e "${BOLD}${CYAN}╚════════════════════════════════════╝${NC}"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Проверка Python ────────────────────────────────
echo -e "${YELLOW}[1/4]${NC} Проверяю Python..."
if ! command -v python3 &>/dev/null; then
  echo -e "${RED}✗ Python3 не найден. Установи Python 3.9+${NC}"
  echo "  Ubuntu/Debian: sudo apt install python3 python3-pip python3-venv"
  echo "  macOS:         brew install python"
  exit 1
fi
PY_VER=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
echo -e "${GREEN}✓ Python $PY_VER${NC}"

# ── Виртуальное окружение ──────────────────────────
echo -e "${YELLOW}[2/4]${NC} Создаю виртуальное окружение..."
if [ ! -d "venv" ]; then
  python3 -m venv venv
  echo -e "${GREEN}✓ Окружение создано${NC}"
else
  echo -e "${GREEN}✓ Окружение уже существует${NC}"
fi

# ── Установка пакетов ──────────────────────────────
echo -e "${YELLOW}[3/4]${NC} Устанавливаю пакеты..."
./venv/bin/pip install --quiet --upgrade pip
./venv/bin/pip install --quiet vk-api flask

echo -e "${GREEN}✓ Пакеты установлены${NC}"

# ── Конфиг ────────────────────────────────────────
echo -e "${YELLOW}[4/4]${NC} Проверяю конфигурацию..."
CONFIG_FILE="vk_sales/config.json"
if [ ! -f "$CONFIG_FILE" ]; then
  cp vk_sales/config.example.json "$CONFIG_FILE"
  echo -e "${GREEN}✓ Создан конфиг: $CONFIG_FILE${NC}"
else
  echo -e "${GREEN}✓ Конфиг уже существует${NC}"
fi

# ── Итог ──────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}╔════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║      ✓ Установка завершена!        ║${NC}"
echo -e "${BOLD}${GREEN}╚════════════════════════════════════╝${NC}"
echo ""
echo -e "Теперь запусти: ${BOLD}bash start.sh${NC}"
echo ""
