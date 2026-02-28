#!/usr/bin/env bash
# =============================================================================
# research_pipeline.sh — Главный pipeline исследовательского агента
#
# Три уровня:
#   1. Groq (llama-3.3-70b) — скачивает, суммирует, фильтрует
#   2. Claude Haiku (~$0.01) — выбирает гипотезы, пишет план
#   3. Claude Sonnet (~$0.10) — реализует код, коммитит в ветку
#
# Запуск: bash research_pipeline.sh [--dry-run]
# =============================================================================

set -euo pipefail

# --- Конфигурация ---
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT_DIR="$REPO_DIR/agent"
REPORTS_DIR="$REPO_DIR/research_reports"
STATE_FILE="$REPO_DIR/STATE.md"

TIMESTAMP=$(date +%Y-%m-%d-%H)
DATE_COMPACT=$(date +%Y%m%d%H)
BRANCH_NAME="claude/research-$TIMESTAMP"

DIGEST_FILE="/tmp/research_digest_${TIMESTAMP}.md"
PLAN_FILE="/tmp/research_plan_${TIMESTAMP}.md"
REPORT_FILE="$REPORTS_DIR/${DATE_COMPACT}.md"

LOG_FILE="/tmp/research_pipeline_${TIMESTAMP}.log"
DRY_RUN="${1:-}"

# Ключи ищем в /home/user/ (рабочая директория), потом в $HOME
GROQ_KEY_FILE="/home/user/.groq_key"
[[ ! -f "$GROQ_KEY_FILE" ]] && GROQ_KEY_FILE="${HOME}/.groq_key"
ANTHROPIC_KEY_FILE="/home/user/.anthropic_key"
[[ ! -f "$ANTHROPIC_KEY_FILE" ]] && ANTHROPIC_KEY_FILE="${HOME}/.anthropic_key"

mkdir -p "$REPORTS_DIR"

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
log_section() { echo "" >> "$LOG_FILE"; echo "========== $* ==========" | tee -a "$LOG_FILE"; echo ""; }

# --- Обновление STATE.md ---
update_state() {
  local status="$1"
  sed -i "s|^- \*\*Дата:\*\*.*|- **Дата:** $TIMESTAMP|" "$STATE_FILE"
  sed -i "s|^- \*\*Ветка:\*\*.*|- **Ветка:** \`$BRANCH_NAME\`|" "$STATE_FILE"
  sed -i "s|^- \*\*Статус:\*\*.*|- **Статус:** $status|" "$STATE_FILE"
  cd "$REPO_DIR"
  git add "$STATE_FILE" 2>/dev/null || true
  git commit -m "chore: update STATE.md after research $TIMESTAMP" \
    --author="Claude <noreply@anthropic.com>" \
    2>/dev/null || true
}

# --- Проверки ---
if [[ ! -f "$GROQ_KEY_FILE" ]]; then
  log "ERROR: $GROQ_KEY_FILE not found. Создай файл с Groq API ключом."
  exit 1
fi

ANTHROPIC_KEY="${ANTHROPIC_API_KEY:-}"
if [[ -z "$ANTHROPIC_KEY" && -f "$ANTHROPIC_KEY_FILE" ]]; then
  ANTHROPIC_KEY=$(cat "$ANTHROPIC_KEY_FILE" | tr -d '[:space:]')
fi
if [[ -z "$ANTHROPIC_KEY" ]]; then
  log "ERROR: Anthropic API key не найден. Установи ANTHROPIC_API_KEY или создай ~/.anthropic_key"
  exit 1
fi

# =============================================================================
# УРОВЕНЬ 1 — GROQ: скачать, суммировать, фильтровать
# =============================================================================
log_section "УРОВЕНЬ 1: Groq/llama — Дайджест источников"

SOURCES_FILE="$AGENT_DIR/sources.txt"
APPLICABLE_IDEAS=""
IDEA_COUNT=0

while IFS= read -r url; do
  # Пропускаем пустые строки и комментарии
  [[ -z "$url" || "$url" =~ ^# ]] && continue

  log "Обрабатываю: $url"

  # Суммаризация
  SUMMARY=$("$AGENT_DIR/groq_helper.sh" web_summary "$url" 2>/dev/null || echo "ERROR: не удалось скачать")
  if [[ "$SUMMARY" == ERROR* ]]; then
    log "  Пропускаю (ошибка скачивания)"
    continue
  fi

  # Сохраняем summary во временный файл для filter/analyze
  TEMP_FILE="/tmp/idea_$$_$(echo "$url" | md5sum | cut -c1-8).txt"
  echo "$SUMMARY" > "$TEMP_FILE"

  # Фильтр
  FILTER=$("$AGENT_DIR/groq_helper.sh" filter "$TEMP_FILE" 2>/dev/null || echo "ПРОПУСТИТЬ")
  log "  Фильтр: $(echo "$FILTER" | head -1)"

  if echo "$FILTER" | grep -q "^ПРИМЕНИМО"; then
    # Оценка
    SCORE=$("$AGENT_DIR/groq_helper.sh" analyze "$TEMP_FILE" 2>/dev/null || echo "ОЦЕНКА: 5/10")
    IDEA_COUNT=$((IDEA_COUNT + 1))
    APPLICABLE_IDEAS="${APPLICABLE_IDEAS}

--- Источник $IDEA_COUNT: $url ---
SUMMARY:
$SUMMARY

ОЦЕНКА:
$SCORE"
    log "  Добавлено в дайджест (идея #$IDEA_COUNT)"
  fi

  rm -f "$TEMP_FILE"
done < "$SOURCES_FILE"

# Формируем дайджест
{
  echo "# Research Digest — $TIMESTAMP"
  echo ""
  echo "Найдено применимых идей: $IDEA_COUNT"
  echo ""
  if [[ -n "$APPLICABLE_IDEAS" ]]; then
    echo "$APPLICABLE_IDEAS"
  else
    echo "Применимых идей не найдено."
  fi
} > "$DIGEST_FILE"

log "Дайджест сохранён: $DIGEST_FILE ($IDEA_COUNT идей)"

# =============================================================================
# УРОВЕНЬ 2 — CLAUDE HAIKU: выбрать гипотезы, написать план
# =============================================================================
log_section "УРОВЕНЬ 2: Claude Haiku — Выбор гипотез и план"

if [[ "$IDEA_COUNT" -eq 0 ]]; then
  log "Нет применимых идей — пропускаем Haiku и Sonnet."
  echo "ПРОПУСТИТЬ — нет применимых идей из источников." > "$PLAN_FILE"
  # Обновляем STATE.md
  update_state "ПРОПУСТИТЬ (нет идей)"
  exit 0
fi

DIGEST_CONTENT=$(cat "$DIGEST_FILE")

# Контекст проекта для Haiku
PROJECT_CONTEXT=$(cat <<'EOF'
USE Optimizer — веб-бэктестер торговых стратегий.
Ключевые файлы:
- opt.js: ядро оптимизатора (MC, TPE, exhaustive), метрики (_calcStatSig, GT-Score etc.)
- core.js: движок бэктеста, исполнение сделок, equity curve
- pine_export.js: генерация Pine Script v6
- ui.js: таблица результатов, фильтры, колонки

Уже реализовано:
- Sig% колонка (z-тест WR>50%)
- Pine Script v6 с active= для зависимых инпутов

В очереди:
1. GT-Score: взвешенная метрика (pnl/dd × sig_mult × consistency_mult)
2. CPCV: combinatorial IS/OOS валидация
3. WASM: Rust+WASM для x15 ускорения
4. TradingAgents: LLM анализ стратегий
EOF
)

HAIKU_PROMPT="Ты — технический менеджер проекта USE Optimizer.

КОНТЕКСТ ПРОЕКТА:
$PROJECT_CONTEXT

ДАЙДЖЕСТ ИССЛЕДОВАНИЯ (сегодня):
$DIGEST_CONTENT

Задача: выбери 1-2 лучшие гипотезы для реализации сегодня.
Критерии: высокая польза + низкая сложность + ещё не реализовано.

Если нет достойных гипотез — ответь ровно: ПРОПУСТИТЬ

Если есть — отвечай СТРОГО в этом формате для каждой гипотезы:

## Гипотеза N: [Название]
**Оценка:** X/10
**Файл:** [opt.js / core.js / pine_export.js / ui.js]
**Что делать:**
1. [конкретный шаг]
2. [конкретный шаг]
3. [конкретный шаг]
**Почему сейчас:** [1 предложение]"

# Вызов Haiku через Anthropic API
HAIKU_RESPONSE=$(curl -s "https://api.anthropic.com/v1/messages" \
  -H "x-api-key: $ANTHROPIC_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d "$(jq -n \
    --arg model "claude-haiku-4-5-20251001" \
    --arg prompt "$HAIKU_PROMPT" \
    '{
      model: $model,
      max_tokens: 1024,
      messages: [{role: "user", content: $prompt}]
    }')" \
  | jq -r '.content[0].text // "ERROR: " + .error.message')

echo "$HAIKU_RESPONSE" > "$PLAN_FILE"
log "План сохранён: $PLAN_FILE"
log "Haiku ответ (первые 3 строки): $(head -3 "$PLAN_FILE")"

# Проверяем — ПРОПУСТИТЬ?
if echo "$HAIKU_RESPONSE" | grep -q "^ПРОПУСТИТЬ"; then
  log "Haiku решил: ПРОПУСТИТЬ — Sonnet не запускается."
  update_state "ПРОПУСТИТЬ (Haiku: нет достойных гипотез)"
  exit 0
fi

# =============================================================================
# УРОВЕНЬ 3 — CLAUDE SONNET: реализация кода
# =============================================================================
log_section "УРОВЕНЬ 3: Claude Sonnet — Реализация"

if [[ "$DRY_RUN" == "--dry-run" ]]; then
  log "DRY RUN: Sonnet не запускается. План:"
  cat "$PLAN_FILE"
  exit 0
fi

# Создаём ветку
cd "$REPO_DIR"
git checkout main
git pull origin main --quiet 2>/dev/null || true
git checkout -b "$BRANCH_NAME" 2>/dev/null || git checkout "$BRANCH_NAME"

PLAN_CONTENT=$(cat "$PLAN_FILE")

# Читаем ключевые файлы проекта для контекста Sonnet
OPT_JS_HEAD=$(head -100 opt.js)
UI_JS_HEAD=$(head -80 ui.js)
PINE_JS_HEAD=$(head -60 pine_export.js)

SONNET_PROMPT="Ты — Claude Sonnet, реализуешь улучшения для USE Optimizer.

ПЛАН (от Haiku):
$PLAN_CONTENT

КОНТЕКСТ КОДА (начало ключевых файлов):
=== opt.js (первые 100 строк) ===
$OPT_JS_HEAD

=== ui.js (первые 80 строк) ===
$UI_JS_HEAD

=== pine_export.js (первые 60 строк) ===
$PINE_JS_HEAD

Задача: реализуй план. Используй инструменты Claude Code для:
1. Чтения нужных файлов (Read)
2. Внесения изменений (Edit)
3. Сохранения финального отчёта в research_reports/$DATE_COMPACT.md (Write)

Отчёт должен содержать:
- Что реализовано
- Какие файлы изменены и как
- Примеры изменённого кода
- Как проверить результат

После реализации: git add -A && git commit -m 'feat: [название] (Hyp N)'
Ветка: $BRANCH_NAME"

# Запускаем Sonnet через claude CLI
if command -v claude &>/dev/null; then
  log "Запускаю Claude Sonnet через CLI..."
  echo "$SONNET_PROMPT" | claude --model claude-sonnet-4-6 -p - \
    --allowedTools "Read,Edit,Write,Bash" \
    --add-dir "$REPO_DIR" \
    2>&1 | tee -a "$LOG_FILE"
else
  log "WARNING: claude CLI не найден. Запускаю через API напрямую..."
  # Fallback: прямой API вызов (без файловых инструментов)
  SONNET_RESPONSE=$(curl -s "https://api.anthropic.com/v1/messages" \
    -H "x-api-key: $ANTHROPIC_KEY" \
    -H "anthropic-version: 2023-06-01" \
    -H "content-type: application/json" \
    -d "$(jq -n \
      --arg model "claude-sonnet-4-6" \
      --arg prompt "$SONNET_PROMPT" \
      '{
        model: $model,
        max_tokens: 4096,
        messages: [{role: "user", content: $prompt}]
      }')" \
    | jq -r '.content[0].text')
  echo "$SONNET_RESPONSE" > "$REPORT_FILE"
  log "Sonnet ответ сохранён в $REPORT_FILE"
fi

# Коммитим отчёт и изменения
git add -A
git commit -m "research: ночное исследование $TIMESTAMP" \
  --author="Claude <noreply@anthropic.com>" \
  || log "Нечего коммитить"

# Пушим
git push -u origin "$BRANCH_NAME" 2>&1 | tee -a "$LOG_FILE" || {
  log "WARNING: push не удался. Ветка $BRANCH_NAME сохранена локально."
}

git checkout main
update_state "SUCCESS"

log_section "Pipeline завершён"
log "Ветка: $BRANCH_NAME"
log "Отчёт: $REPORT_FILE"
log "Лог: $LOG_FILE"
