#!/bin/bash
# Dumb Checks — нулевая толерантность к глупым ошибкам
# Запускается перед пушем (pre-push hook)

set -e

echo "🔍 Запуск dumb-checks..."

ERRORS=0

# ======================================================================
# ❌ Запрещено 1: console.log в исходниках (исключая диагностику)
# ======================================================================
echo "  Проверка console.log..."
# Исключаем диагностические функции (начинающиеся с [ скобки = логирование)
if grep -r "console\.log\|console\.warn\|console\.error" opt.js ui.js core.js 2>/dev/null | grep -v "^[[:space:]]*//\|\[.*\]" | head -3; then
  echo "  ⚠️  WARNING: console.log найден (может быть диагностика)"
else
  echo "  ✓ console.log чист (диагностика OK)"
fi

# ======================================================================
# ❌ Запрещено 2: Hardcoded цвета (#rrggbb)
# ======================================================================
echo "  Проверка hardcoded цветов..."
if grep -r "#[0-9a-fA-F]\{6\}" opt.js ui.js 2>/dev/null | grep -v "^[[:space:]]*//\|var(--\|rgba(" | head -5; then
  echo "  ⚠️  WARNING: Найдены hardcoded цвета (может быть OK в canvas)"
else
  echo "  ✓ Hardcoded цветов не найдено"
fi

# ======================================================================
# ❌ Запрещено 3: Вложенные ternary
# ======================================================================
echo "  Проверка вложенных ternary..."
if grep -r "\? .*\? " opt.js ui.js 2>/dev/null | grep -v "^[[:space:]]*//"; then
  echo "  ⚠️  WARNING: Найдены вложенные ternary (может быть законно)"
else
  echo "  ✓ Вложенные ternary не найдены"
fi

# ======================================================================
# 🔴 Критично: Синхронизация _cfg версий
# ======================================================================
echo "  Проверка синхронизации _cfg..."

# Список параметров которые ДОЛЖНЫ быть в 3 местах
CRITICAL_PARAMS=(
  "usePivot" "pvL" "pvR"
  "useMA" "maType" "maP"
  "atrPeriod" "commission"
  "useConfirm" "confN"
  "useBE" "useTrail" "useTime"
  "usePartial" "waitBars"
  "slPair" "tpPair"
)

for param in "${CRITICAL_PARAMS[@]}"; do
  COUNT=$(grep -c "_cfg\.$param\|_cfg_tpe\.$param\|_cfg_ex\.$param" opt.js 2>/dev/null || echo "0")
  if [ "$COUNT" -lt 3 ]; then
    echo "  ❌ ОШИБКА: $param не синхронизирован (найдено только $COUNT/3 версий)"
    ERRORS=$((ERRORS + 1))
  fi
done

if [ $ERRORS -eq 0 ]; then
  echo "  ✓ Все параметры синхронизированы"
fi

# ======================================================================
# 🔴 Критично: Фильтры с warmup проверкой
# ======================================================================
echo "  Проверка фильтров на warmup..."

# Если добавлен новый фильтр — проверить что есть warmup
if grep -r "blocksL.*cfg.*\..*Arr\[" filter_registry.js 2>/dev/null | grep -v "<= 0\|!= null"; then
  echo "  ⚠️  WARNING: Фильтр может не проверять warmup (искать <= 0)"
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
