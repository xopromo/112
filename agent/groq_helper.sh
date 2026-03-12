#!/usr/bin/env bash
# =============================================================================
# groq_helper.sh — Уровень 1 исследовательского агента
#
# Использует реальный Groq API (api.groq.com).
# Ключ читается из ~/.groq_key или переменной GROQ_API_KEY.
#
# ОТКАТ: cp agent/groq_helper.sh.claude-backup agent/groq_helper.sh
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

# --- Модели ---
FAST_MODEL="llama-3.1-8b-instant"      # быстрые/простые задачи
SMART_MODEL="llama-3.3-70b-versatile"  # анализ и отчёты

# --- Groq API ключ ---
if [[ -z "${GROQ_API_KEY:-}" ]]; then
  if [[ -f "$HOME/.groq_key" ]]; then
    GROQ_API_KEY=$(cat "$HOME/.groq_key")
  else
    echo "ERROR: Groq API ключ не найден. Укажи GROQ_API_KEY или создай ~/.groq_key" >&2
    exit 1
  fi
fi

# --- Вспомогательная функция: запрос к Groq API с автоматическим retry при rate limit ---
groq_ask() {
  local system_prompt="$1"
  local user_prompt="$2"
  local max_tokens="${3:-512}"
  local model="${4:-$FAST_MODEL}"

  local payload
  payload=$(python3 -c "
import json, sys
print(json.dumps({
  'model': sys.argv[1],
  'max_tokens': int(sys.argv[2]),
  'messages': [
    {'role': 'system', 'content': sys.argv[3]},
    {'role': 'user',   'content': sys.argv[4]}
  ]
}))" "$model" "$max_tokens" "$system_prompt" "$user_prompt")

  while true; do
    local response
    response=$(curl -s --max-time 30 \
      -X POST "https://api.groq.com/openai/v1/chat/completions" \
      -H "Authorization: Bearer $GROQ_API_KEY" \
      -H "Content-Type: application/json" \
      -d "$payload")

    # Парсим ответ: если rate limit — ждём retry-after и повторяем
    local result
    result=$(python3 -c "
import sys, json, re
try:
    data = json.load(sys.stdin)
    if 'error' in data:
        msg = data['error'].get('message', '')
        # Определяем тип ошибки
        if 'rate_limit' in data['error'].get('type','') or 'Rate limit' in msg:
            # Ищем число секунд: 'try again in 2.72s' или 'in 2s'
            m = re.search(r'in ([\d.]+)s', msg)
            wait = float(m.group(1)) if m else 20.0
            # Округляем вверх до целого + 1 секунда запаса
            import math
            wait = math.ceil(wait) + 1
            print('RATE_LIMIT:' + str(wait))
        else:
            print('ERROR: ' + msg, file=sys.stderr)
            sys.exit(1)
    else:
        print(data['choices'][0]['message']['content'])
except Exception as e:
    print('ERROR: ' + str(e), file=sys.stderr)
    sys.exit(1)
" <<< "$response")

    if [[ "$result" == RATE_LIMIT:* ]]; then
      local wait="${result#RATE_LIMIT:}"
      echo "[groq] rate limit — жду ${wait}s..." >&2
      sleep "$wait"
      # повторяем запрос
    else
      echo "$result"
      return 0
    fi
  done
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
      512 "$FAST_MODEL"
    ;;

  web_summary)
    URL="${1:?URL required}"
    TEXT=$(fetch_url "$URL")
    groq_ask \
      "Ты — исследователь алгоритмической торговли. Отвечай только на русском." \
      "Перескажи главные идеи в 3-5 пунктах. Фокус: методы оптимизации стратегий, метрики качества, валидация, Pine Script.

ТЕКСТ (из $URL):
$TEXT" \
      512 "$FAST_MODEL"
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
      128 "$FAST_MODEL"
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
      256 "$SMART_MODEL"
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
      1024 "$SMART_MODEL"
    ;;

  ask)
    PROMPT="${1:?prompt required}"
    groq_ask \
      "Ты — помощник по алгоритмической торговле. Отвечай кратко и по делу на русском." \
      "$PROMPT" \
      512 "$FAST_MODEL"
    ;;

  *)
    echo "Usage: $0 {summarize|filter|web_summary|analyze|draft_report|ask} [args...]"
    exit 1
    ;;
esac
