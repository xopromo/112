#!/bin/bash
# PRE-PUSH REGRESSION CHECK
# ОБЯЗАТЕЛЬНОЕ требование перед пушем:
# 1. Если код изменён → регрессия ДОЛЖНА быть запущена
# 2. Результаты ДОЛЖНЫ быть сохранены в .regression-results
# 3. БЛОКИРУЕТ пуш если проверка не выполнена

set -e

echo "🔐 PRE-PUSH REGRESSION CHECK (ОБЯЗАТЕЛЬНАЯ ПРОВЕРКА)"
echo "===================================================="

# Проверяем какой код был изменён в этом коммите
CHANGED_CODE_FILES=$(git diff --name-only HEAD~1 2>/dev/null | \
  grep -E "opt.js|core.js|ui_.*\.js|filter_registry\.js" | wc -l)

if [ "$CHANGED_CODE_FILES" -eq 0 ]; then
  echo "✅ Код не изменён - регрессия не требуется"
  exit 0
fi

echo "⚠️  Код изменён! ($CHANGED_CODE_FILES файлов)"
echo ""
echo "ОБЯЗАТЕЛЬНО выполните ДО пуша:"
echo "  node .claude/scripts/regression-detector.js --runs=50"
echo ""

# Проверяем что результаты регрессии сохранены
if [ ! -f ".regression-results" ]; then
  echo "❌ ОШИБКА: Файл .regression-results НЕ найден!"
  echo ""
  echo "Это означает что регрессия никогда не была запущена"
  echo "или результаты не были сохранены."
  echo ""
  echo "ЗАПУСТИТЕ:"
  echo "  node .claude/scripts/regression-detector.js --runs=50"
  echo ""
  echo "Результаты будут автоматически сохранены в .regression-results"
  echo "затем попробуйте пуш снова."
  exit 1
fi

# Проверяем дату результатов (не старше 5 минут)
RESULTS_TIME=$(stat -f%m ".regression-results" 2>/dev/null || stat -c%Y ".regression-results" 2>/dev/null || echo "0")
CURRENT_TIME=$(date +%s)
TIME_DIFF=$((CURRENT_TIME - RESULTS_TIME))
FIVE_MINS=300

if [ "$TIME_DIFF" -gt "$FIVE_MINS" ]; then
  echo "⚠️  WARNING: Результаты регрессии старше 5 минут"
  echo "    Может быть code был изменён ПОСЛЕ последней регрессии?"
  echo ""
  read -p "Запустить регрессию СЕЙЧАС? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    node .claude/scripts/regression-detector.js --runs=50
  else
    echo "❌ Пуш отменён - требуется свежая регрессия"
    exit 1
  fi
fi

# Проверяем статус в результатах
REGRESSION_STATUS=$(grep -i "status:" ".regression-results" | head -1 || echo "UNKNOWN")
echo "📊 Статус регрессии: $REGRESSION_STATUS"

if grep -q "FAILED\|ERROR" ".regression-results"; then
  echo ""
  echo "⚠️  ВНИМАНИЕ: Регрессия показала FAILED/ERROR!"
  echo "    Это может означать что исправление неполное."
  echo ""
  echo "Вы можете:"
  echo "  1. Доисправить код и запустить регрессию снова"
  echo "  2. Пушить с пометкой PARTIAL (если это известная проблема)"
  echo ""
  read -p "Продолжить пуш? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Пуш отменён"
    exit 1
  fi
fi

echo ""
echo "✅ Регрессия проверена и допущена к пушу"
exit 0
