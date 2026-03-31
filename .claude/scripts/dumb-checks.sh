#!/bin/bash
# Dumb Checks — нулевая толерантность к глупым ошибкам
# Запускается перед пушем (pre-push hook)

set -e

echo "🔍 Запуск dumb-checks..."

ERRORS=0

# ======================================================================
# 🔴 Критично 1: console.log в opt.js и core.js (вычислительное ядро)
# Исключение: строки вида console.*(  '[FuncName]'  ...) — диагностика с bracket-нотацией
# Практическое правило: любая строка с '[' в аргументе — диагностика (оставляем)
# ======================================================================
echo "  Проверка console.log в ядре..."
CORE_LOG=$(grep -n "console\." opt.js core.js 2>/dev/null \
  | grep -v "^[[:space:]]*//" \
  | grep -v "DEBUG_MODE" \
  | grep -v "\[" || true)
if [ -n "$CORE_LOG" ]; then
  echo "  ❌ ОШИБКА: console.* в ядре без bracket-нотации (может быть DEBUG-мусор):"
  echo "$CORE_LOG" | head -5
  ERRORS=$((ERRORS + 1))
else
  echo "  ✓ console.* в ядре: только диагностика с [FunctionName]"
fi

# ui.js — только warning (там диагностика допустима)
if grep -n "console\.log" ui.js 2>/dev/null \
  | grep -v "^[[:space:]]*//\|DEBUG_MODE\|\[" | head -3; then
  echo "  ⚠️  WARNING: console.log в ui.js без bracket-нотации"
fi

# ======================================================================
# ⚠️  Warning 2: Hardcoded цвета (#rrggbb) — только предупреждение
# ======================================================================
echo "  Проверка hardcoded цветов..."
if grep -n "#[0-9a-fA-F]\{6\}" opt.js ui.js 2>/dev/null \
  | grep -v "^[[:space:]]*//" | head -3; then
  echo "  ⚠️  WARNING: Найдены hardcoded цвета (canvas — OK, UI-код — проверь)"
else
  echo "  ✓ Hardcoded цветов не найдено"
fi

# ======================================================================
# ⚠️  Warning 3: Тройные ternary
# ======================================================================
echo "  Проверка вложенных ternary..."
if grep -n "\? .*\? .*\? " opt.js ui.js 2>/dev/null | grep -v "^[[:space:]]*//" | head -3; then
  echo "  ⚠️  WARNING: Тройные ternary — рефактори при случае"
else
  echo "  ✓ Вложенные ternary не найдены"
fi

# ======================================================================
# 🔴 Критично 4: Синхронизация _cfg версий (MC / TPE / Exhaustive)
# ======================================================================
echo "  Проверка синхронизации _cfg..."

CRITICAL_PARAMS=(
  "usePivot" "pvL" "pvR"
  "useMA" "maType" "maP"
  "atrPeriod" "commission"
  "useConfirm" "confN"
  "useBE" "useTrail" "useTime"
  "usePartial" "waitBars"
  "slPair" "tpPair"
)

CFG_ERRORS=0
for param in "${CRITICAL_PARAMS[@]}"; do
  # Параметры задаются как ключи объектных литералов {param:val} или shorthand {param,}
  # Считаем строки где встречается \bparam\b — каждый из 3 блоков cfg даёт ≥1 строку
  C_TOTAL=$(grep -cE "\b${param}\b" opt.js 2>/dev/null; true)
  if (( ${C_TOTAL:-0} < 3 )); then
    echo "  ❌ ОШИБКА: $param не синхронизирован (строк в opt.js: ${C_TOTAL:-0}, нужно ≥3)"
    CFG_ERRORS=$((CFG_ERRORS + 1))
  fi
done

if (( CFG_ERRORS > 0 )); then
  ERRORS=$((ERRORS + CFG_ERRORS))
else
  echo "  ✓ Все параметры синхронизированы"
fi

# ======================================================================
# ⚠️  Warning 5: Фильтры без warmup проверки (предупреждение — не блокирует)
# Только blocksL — для blocksS warmup=0 обычно корректно блокирует через <=
# ======================================================================
echo "  Проверка фильтров на warmup (blocksL)..."
BAD_L=$(grep -n "blocksL" filter_registry.js 2>/dev/null \
  | grep "Arr\[" | grep -v "<= 0" || true)
if [ -n "$BAD_L" ]; then
  echo "  ⚠️  WARNING: blocksL без warmup проверки (<= 0) — проверь что warmup не пропускает:"
  echo "$BAD_L" | head -5
else
  echo "  ✓ blocksL warmup проверки в порядке"
fi

# ======================================================================
# 🔴 Критично 6: Актуальность номеров строк в CLAUDE.md
# ======================================================================
echo "  Проверка номеров строк в CLAUDE.md..."
if [ -f "agent/sync_claude_md.sh" ]; then
  if ! bash agent/sync_claude_md.sh --check 2>/dev/null; then
    echo "  ❌ ОШИБКА: Номера строк в CLAUDE.md устарели — запусти: bash agent/sync_claude_md.sh"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo "  ⚠️  WARNING: agent/sync_claude_md.sh не найден"
fi

# ======================================================================
# Результаты
# ======================================================================
echo ""
if [ $ERRORS -eq 0 ]; then
  echo "✅ dumb-checks пройдены"
  exit 0
else
  echo "❌ Найдено ошибок: $ERRORS"
  exit 1
fi
