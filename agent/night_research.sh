#!/usr/bin/env bash
# =============================================================================
# night_research.sh — Точка входа крона
# Cron: 5 * * * * /home/user/night_research.sh
#
# Этот файл — симлинк или копия из /home/user/112/agent/night_research.sh
# =============================================================================

set -euo pipefail

REPO_DIR="/home/user/112"
LOG_DIR="/tmp"
TIMESTAMP=$(date +%Y-%m-%d-%H)
LOG="$LOG_DIR/night_research_${TIMESTAMP}.log"

# Убеждаемся, что репо актуальное
cd "$REPO_DIR"
git pull origin main --quiet 2>>"$LOG" || true

# Бэкап базы данных бота
bash "$REPO_DIR/agent/backup_db.sh" 2>>"$LOG" || true

# Запускаем pipeline
exec bash "$REPO_DIR/agent/research_pipeline.sh" "$@" 2>&1 | tee -a "$LOG"
