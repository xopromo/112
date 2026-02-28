#!/usr/bin/env bash
# =============================================================================
# groq_helper.sh — Уровень 1 исследовательского агента
# ПРИМЕЧАНИЕ: Groq API заблокирован прокси этой среды.
# Используем Claude Haiku (api.anthropic.com разрешён).
# Стоимость: ~$0.001/URL × 6 = $0.006/цикл (аналогично бесплатному Groq).
#
# Использование:
#   groq_helper.sh summarize  <url>           — пересказ страницы 3-5 пунктов
#   groq_helper.sh filter     <text_file>     — фильтр "применимо ДА/НЕТ"
#   groq_helper.sh web_summary <url>          — скачать + пересказать
#   groq_helper.sh analyze    <text_file>     — оценка 1-10 + обоснование
#   groq_helper.sh draft_report <digest_file> — черновик отчёта
#   groq_helper.sh ask        <prompt>        — свободный вопрос
# =============================================================================

set -euo pipefail

HAIKU_MODEL="claude-haiku-4-5-20251001"
CLAUDE_BIN="${CLAUDE_BIN:-claude}"

# --- Вспомогательная функция: запрос к Haiku через claude CLI ---
# Примечание: api.anthropic.com доступен, но ключ на файле может быть без кредитов.
# claude CLI работает через подписку и не требует отдельного ключа.
# В cron-контексте CLAUDECODE не установлен, вложенности нет — всё работает.
groq_ask() {
  local system_prompt="$1"
  local user_prompt="$2"
  # $3 — max_tokens, игнорируется с claude CLI (оставлен для совместимости интерфейса)

  local full_prompt="${system_prompt}

${user_prompt}"

  "$CLAUDE_BIN" --model "$HAIKU_MODEL" -p "$full_prompt" 2>/dev/null \
    || echo "ERROR: claude CLI недоступен"
}

# --- Скачать страницу ---
fetch_url() {
  local url="$1"
  curl -sL --max-time 15 --user-agent "Mozilla/5.0" "$url" 2>/dev/null \
    | sed 's/<[^>]*>//g' \
    | sed '/^[[:space:]]*$/d' \
    | head -200
}

# =============================================================================
# Команды
# =============================================================================

CMD="${1:-}"
shift || true

case "$CMD" in

  summarize)
    URL="${1:?URL required}"
    TEXT=$(fetch_url "$URL")
    groq_ask \
      "Ты — исследователь алгоритмической торговли. Отвечай только на русском." \
      "Перескажи главные идеи этой страницы в 3-5 чётких пунктах. URL: $URL

ТЕКСТ:
$TEXT" \
      512
    ;;

  web_summary)
    URL="${1:?URL required}"
    TEXT=$(fetch_url "$URL")
    groq_ask \
      "Ты — исследователь алгоритмической торговли. Отвечай только на русском." \
      "Перескажи главные идеи в 3-5 пунктах. Фокус: методы оптимизации стратегий, метрики качества, валидация, Pine Script.

ТЕКСТ (из $URL):
$TEXT" \
      512
    ;;

  filter)
    TEXT_FILE="${1:?text file required}"
    CONTENT=$(cat "$TEXT_FILE")
    groq_ask \
      "Ты — технический фильтр для проекта USE Optimizer (веб-бэктестер торговых стратегий на JS).
Отвечай только: ПРИМЕНИМО или ПРОПУСТИТЬ, затем одна строка обоснования." \
      "Применима ли эта идея к проекту USE Optimizer?
Критерии применимости: метрики качества стратегий, статистические тесты, алгоритмы оптимизации, Pine Script, UI для трейдера.

ИДЕЯ:
$CONTENT" \
      128
    ;;

  analyze)
    TEXT_FILE="${1:?text file required}"
    CONTENT=$(cat "$TEXT_FILE")
    groq_ask \
      "Ты — технический аналитик для проекта USE Optimizer. Отвечай только на русском." \
      "Оцени применимость этой идеи к USE Optimizer по шкале 1-10.
Критерии: сложность реализации (проще = лучше), польза для пользователя, оригинальность.

Формат ответа:
ОЦЕНКА: X/10
ОБОСНОВАНИЕ: (1-2 предложения)
СЛОЖНОСТЬ: низкая/средняя/высокая

ИДЕЯ:
$CONTENT" \
      256
    ;;

  draft_report)
    DIGEST_FILE="${1:?digest file required}"
    DIGEST=$(cat "$DIGEST_FILE")
    groq_ask \
      "Ты — технический исследователь. Составь структурированный черновик отчёта на русском." \
      "На основе дайджеста исследования составь отчёт:

1. ТОП-3 применимые идеи (название, оценка 1-10, краткое описание)
2. Для каждой: какой файл проекта затрагивает (opt.js/core.js/pine_export.js/ui.js)
3. Общий вывод: что реализовать в первую очередь

ДАЙДЖЕСТ:
$DIGEST" \
      1024
    ;;

  ask)
    PROMPT="${1:?prompt required}"
    groq_ask \
      "Ты — помощник по алгоритмической торговле. Отвечай кратко и по делу на русском." \
      "$PROMPT" \
      512
    ;;

  *)
    echo "Usage: $0 {summarize|filter|web_summary|analyze|draft_report|ask} [args...]"
    exit 1
    ;;
esac
