#!/usr/bin/env bash
# =============================================================================
# setup.sh — Первоначальная установка исследовательского агента
#
# Что делает:
#   1. Создаёт симлинк /home/user/night_research.sh → agent/night_research.sh
#   2. Устанавливает cron (5 * * * *)
#   3. Проверяет наличие API ключей
#   4. Проверяет зависимости (curl, jq, git, claude CLI)
#
# Запуск: bash /home/user/112/agent/setup.sh
# =============================================================================

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT_DIR="$REPO_DIR/agent"
# Ключи ищем в /home/user/ (реальная рабочая директория), потом в $HOME
HOME_DIR="/home/user"

ok()   { echo "  ✓ $*"; }
warn() { echo "  ⚠ $*"; }
err()  { echo "  ✗ $*"; }
header() { echo ""; echo "=== $* ==="; }

echo ""
echo "┌─────────────────────────────────────────┐"
echo "│   Research Agent Setup — USE Optimizer  │"
echo "└─────────────────────────────────────────┘"

# =============================================================================
# 1. Права на скрипты
# =============================================================================
header "Права на скрипты"
chmod +x "$AGENT_DIR/groq_helper.sh"
chmod +x "$AGENT_DIR/research_pipeline.sh"
chmod +x "$AGENT_DIR/night_research.sh"
chmod +x "$AGENT_DIR/setup.sh"
ok "chmod +x для всех скриптов"

# =============================================================================
# 2. Симлинки
# =============================================================================
header "Симлинки в $HOME_DIR"

LINK="$HOME_DIR/night_research.sh"
TARGET="$AGENT_DIR/night_research.sh"
if [[ -L "$LINK" ]]; then
  rm "$LINK"
fi
ln -s "$TARGET" "$LINK"
ok "night_research.sh → $TARGET"

LINK2="$HOME_DIR/groq_helper.sh"
TARGET2="$AGENT_DIR/groq_helper.sh"
if [[ -L "$LINK2" ]]; then
  rm "$LINK2"
fi
ln -s "$TARGET2" "$LINK2"
ok "groq_helper.sh → $TARGET2"

# =============================================================================
# 3. Cron
# =============================================================================
header "Cron"
CRON_FILE="/etc/cron.d/research_agent"
CRON_JOB="5 * * * * root $HOME_DIR/night_research.sh >> /tmp/cron_research.log 2>&1"

if [[ -f "$CRON_FILE" ]]; then
  ok "Cron уже установлен: $CRON_FILE"
elif command -v crontab &>/dev/null; then
  # Если есть crontab — используем его
  if crontab -l 2>/dev/null | grep -q "night_research.sh"; then
    ok "Cron уже установлен"
  else
    (crontab -l 2>/dev/null; echo "5 * * * * $HOME_DIR/night_research.sh >> /tmp/cron_research.log 2>&1") | crontab -
    ok "Cron установлен через crontab"
  fi
elif [[ -d "/etc/cron.d" ]]; then
  # Используем /etc/cron.d/
  echo "$CRON_JOB" > "$CRON_FILE"
  chmod 644 "$CRON_FILE"
  ok "Cron установлен: $CRON_FILE"
  ok "  $CRON_JOB"
else
  warn "crontab и /etc/cron.d недоступны — запусти вручную или настрой systemd timer"
  echo "     Команда: $CRON_JOB"
fi

# =============================================================================
# 4. API ключи
# =============================================================================
header "API ключи"

GROQ_KEY_FILE="$HOME_DIR/.groq_key"
if [[ -f "$GROQ_KEY_FILE" && -s "$GROQ_KEY_FILE" ]]; then
  ok "Groq ключ: $GROQ_KEY_FILE ✓"
else
  err "Groq ключ не найден: $GROQ_KEY_FILE"
  echo "     Создай файл: echo 'gsk_xxxx' > $GROQ_KEY_FILE"
fi

ANTHROPIC_KEY_FILE="$HOME_DIR/.anthropic_key"
if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
  ok "Anthropic ключ: переменная ANTHROPIC_API_KEY ✓"
elif [[ -f "$ANTHROPIC_KEY_FILE" && -s "$ANTHROPIC_KEY_FILE" ]]; then
  ok "Anthropic ключ: $ANTHROPIC_KEY_FILE ✓"
else
  warn "Anthropic ключ не найден (нужен для Haiku/Sonnet)"
  echo "     export ANTHROPIC_API_KEY='sk-ant-...' или создай $ANTHROPIC_KEY_FILE"
fi

# =============================================================================
# 5. Зависимости
# =============================================================================
header "Зависимости"
for cmd in curl jq git; do
  if command -v "$cmd" &>/dev/null; then
    ok "$cmd ✓"
  else
    err "$cmd не найден — установи: apt-get install $cmd"
  fi
done

if command -v claude &>/dev/null; then
  ok "claude CLI ✓"
else
  warn "claude CLI не найден — Sonnet будет работать через прямой API (без файловых инструментов)"
  echo "     Установи: npm install -g @anthropic-ai/claude-code"
fi

# =============================================================================
# 6. Директории
# =============================================================================
header "Директории"
mkdir -p "$REPO_DIR/research_reports" "$REPO_DIR/experiments"
ok "research_reports/ ✓"
ok "experiments/ ✓"

# =============================================================================
# Итог
# =============================================================================
echo ""
echo "┌─────────────────────────────────────────┐"
echo "│              Настройка готова!           │"
echo "│                                         │"
echo "│  Тест: bash $HOME_DIR/night_research.sh │"
echo "│  Dry run: bash agent/research_pipeline.sh --dry-run"
echo "│  Логи: /tmp/night_research_*.log        │"
echo "│  Отчёты: $REPO_DIR/research_reports/   │"
echo "└─────────────────────────────────────────┘"
echo ""
