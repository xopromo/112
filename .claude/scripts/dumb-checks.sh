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
# 🔴 Критично 7: Unit-тесты (136 тестов — индикаторы, backtest, метрики, фильтры, pine)
# ======================================================================
echo "  Запуск unit-тестов..."
if command -v node &>/dev/null && [ -f "tests/unit/indicators.test.cjs" ]; then
  if node --test tests/unit/*.test.cjs 2>&1 | grep -q "^# fail [^0]"; then
    FAIL_COUNT=$(node --test tests/unit/*.test.cjs 2>&1 | grep "^# fail" | awk '{print $3}')
    echo "  ❌ ОШИБКА: Unit-тесты провалились ($FAIL_COUNT тестов)"
    node --test tests/unit/*.test.cjs 2>&1 | grep "not ok" | head -5
    ERRORS=$((ERRORS + 1))
  else
    PASS_COUNT=$(node --test tests/unit/*.test.cjs 2>&1 | grep "^# pass" | awk '{print $3}')
    echo "  ✓ Unit-тесты: $PASS_COUNT пройдено"
  fi
else
  echo "  ⚠️  WARNING: node или тесты не найдены — пропускаем"
fi

# ======================================================================
# 🔴 Критично 8: Investigation Methodology Rule
# При исправлении паттерн-ошибки (не одиночный баг) ДОЛЖЕН быть FULL SEARCH
# ======================================================================
echo "  Проверка Investigation Methodology Rule..."

# Проверяем если последний коммит упоминает паттерн-ошибку
LAST_MSG=$(git log -1 --pretty=%B 2>/dev/null || echo "")

# Паттерн-ошибки которые требуют FULL SEARCH
PATTERN_ERRORS="Float32Array.*copy\|Data.*Reference.*Reuse\|corruption\|mutation"

if echo "$LAST_MSG" | grep -iE "$PATTERN_ERRORS" > /dev/null 2>&1; then
  # Это паттерн-ошибка, проверяем что правило соблюдено

  # ПРАВИЛО 1: Должна быть ссылка на investigation-methodology.md
  if ! echo "$LAST_MSG" | grep -q "investigation-methodology\|FULL SEARCH"; then
    echo "  ⚠️  WARNING: Pattern-bug найден, но нет ссылки на investigation-methodology"
    echo "     Commit message должен включать 'investigation-methodology.md'"
  fi

  # ПРАВИЛО 2: Для Float32Array corruption - проверяем что все места исправлены
  if echo "$LAST_MSG" | grep -iq "Float32Array\|eq.*copy\|Array.from"; then
    # Ищем в диффе скольких файлов внесены изменения
    FILES_CHANGED=$(git diff-tree --no-commit-id --name-only -r HEAD 2>/dev/null | wc -l)

    if [ "$FILES_CHANGED" -lt 2 ]; then
      echo "  ❌ ОШИБКА: Float32Array fix в $FILES_CHANGED файле(s)"
      echo "     Float32Array corruption - это ПАТТЕРН, должны быть исправления в:"
      echo "     - opt.js, ui_oos.js, ui_hc.js, ui_equity.js (минимум)"
      echo "     Запусти FULL SEARCH перед фиксом:"
      echo "     grep -r '\\.eq\\s*=' opt.js ui*.js"
      ERRORS=$((ERRORS + 1))
    else
      echo "  ✓ Pattern-bug исправлен в нескольких файлах ($FILES_CHANGED файлов)"
    fi
  fi
fi

# ======================================================================
# 🔴 Критично 10: Copy-on-Storage Pattern (Reference Sharing Corruption)
# Паттерн: Изменяемые данные (Array/Object) НЕ должны передаваться по ссылке
# Правило: Array.from() при сохранении, {...} для объектов, Object.assign для вложенных
# ======================================================================
echo "  Проверка Copy-on-Storage Pattern (Float32Array, eq-like поля)..."
COS_VIOLATIONS=$(grep -rn "\.eq\s*=\|\.eqCalc\|\.old_eq\|\.new_eq\|\.config\|\.state" \
  opt.js ui_*.js 2>/dev/null | \
  grep "=" | \
  grep -v "Array.from\|{\.\.\..*}\|Object.assign\|const\|let\|for\|if\|=>\|==\|!=\|['\"]" | \
  grep -v "^[[:space:]]*//\|DEBUG\|console" || true)

if [ -n "$COS_VIOLATIONS" ]; then
  VIOLATIONS_COUNT=$(echo "$COS_VIOLATIONS" | wc -l)
  # Исключаем известные безопасные места из whitelist
  SAFE_PATTERNS="DataSync|calcOnly|readOnly|primitive|number|string|boolean|const \|let \|for \|if ("
  REAL_VIOLATIONS=$(echo "$COS_VIOLATIONS" | grep -v "$SAFE_PATTERNS" || true)

  if [ -n "$REAL_VIOLATIONS" ]; then
    echo "  ❌ ОШИБКА: Copy-on-Storage violations найдены ($VIOLATIONS_COUNT):"
    echo "$REAL_VIOLATIONS" | head -5
    echo ""
    echo "     Правило: Все изменяемые данные при сохранении ДОЛЖНЫ быть скопированы:"
    echo "     ✅ obj.field = Array.from(source.field);  // для массивов"
    echo "     ✅ obj.field = {...source.field};         // для объектов"
    echo "     ✅ obj.field = Object.assign({}, src);    // для вложенных"
    echo ""
    echo "     Используй: bash .claude/scripts/pattern-search-template.sh Copy-on-Storage"
    ERRORS=$((ERRORS + 1))
  else
    echo "  ✓ Copy-on-Storage: только безопасные присвоения"
  fi
else
  echo "  ✓ Copy-on-Storage: нарушений не найдено"
fi

# ======================================================================
# 🔴 Критично 12: Pattern Classification (CLASS A vs CLASS B)
# Проблема: Создаешь quick-fix скрипт для CLASS B проблемы которая не повторится
# и забываешь что это было (amnesia-driven development)
# Решение: Определи КЛАСС баги перед тем как исправлять
# ======================================================================
echo "  Проверка Pattern Classification (CLASS A vs CLASS B)..."

# Если был создан quick-fixes скрипт но класс не определен
if git diff --name-only HEAD 2>/dev/null | grep -q ".claude/scripts/quick-fixes/"; then
  LAST_MSG=$(git log -1 --pretty=%B 2>/dev/null || echo "")

  if ! echo "$LAST_MSG" | grep -iq "CLASS A\|CLASS B\|паттерн\|pattern"; then
    echo "  ⚠️  WARNING: Создан quick-fixes скрипт, но класс не определен"
    echo "     Нужно ответить на вопросы:"
    echo "     1. Есть ли ПОХОЖИЕ нарушения в других местах? (CLASS A = обобщить)"
    echo "     2. Может ли эта ошибка повториться в НОВОМ коде? (CLASS A = обобщить)"
    echo "     3. Это архитектурная проблема или случайная опечатка? (A vs B)"
    echo ""
    echo "     Подробнее: .claude/memory/pattern-classification-guide.md"
  fi
fi

# Проверка что обобщенные правила существуют для всех CLASS A паттернов
if git diff --name-only HEAD 2>/dev/null | grep -q ".claude/memory/pattern-bugs-whiteboard.md"; then
  WHITEBOARD_UPDATED=true
  # Это хороший знак - документируешь новый паттерн
fi

# ======================================================================
# 🔴 Критично 13: Loop Prevention (защита от infinite loops)
# Проблема: Исправляем паттерн, закрываем его, потом находим СНОВА
# Решение: Паттерны имеют STATUS (OPEN/PARTIAL/CLOSED)
# CLOSED = дальше искать ЗАПРЕЩЕНО
# ======================================================================
echo "  Проверка Loop Prevention (статусы паттернов)..."

LAST_MSG=$(git log -1 --pretty=%B 2>/dev/null || echo "")

# Если коммит упоминает паттерн который уже CLOSED:
if echo "$LAST_MSG" | grep -iq "Float32Array\|Reference Sharing\|Copy-on-Storage"; then
  CLOSED_STATUS=$(grep -A 2 "ПАТТЕРН #1.*Reference" .claude/memory/pattern-bugs-whiteboard.md 2>/dev/null | \
    grep "STATUS.*CLOSED" || true)

  if [ -n "$CLOSED_STATUS" ]; then
    # Паттерн CLOSED - проверяем что это не волна 5+
    CHANGED_FILES=$(git diff --name-only HEAD~1 2>/dev/null | grep -E "opt.js|ui_.*\.js|core.js" | wc -l)

    if [ "$CHANGED_FILES" -gt 0 ]; then
      # Проверяем дату последнего изменения паттерна
      LAST_PATTERN_UPDATE=$(grep "Last Updated:" .claude/memory/pattern-bugs-whiteboard.md 2>/dev/null | head -1 | cut -d: -f2 | xargs)

      # Если файлы добавлены ПОСЛЕ закрытия паттерна - это OK (новый код)
      # Если файлы были раньше - это волна (BAD!)
      echo "  ℹ️  Pattern 'Reference Sharing' is CLOSED (status: 2026-04-03)"
      echo "     If this is a wave 5+ attempt → RULE 13 will block it"
      echo "     If this is NEW code added after 2026-04-03 → OK, but why Rule 10 missed it?"
    fi
  else
    echo "  ✓ Loop Prevention: нет CLOSED паттернов"
  fi
else
  echo "  ✓ Loop Prevention: нет попыток исправить CLOSED паттерны"
fi

# ======================================================================
# 🔴 Критично 14: Pattern-First Workflow Verification
# БЛОКИРУЕТ пуш если код изменён но Pattern-First процесс не завершён
# ======================================================================
echo "  Проверка Pattern-First Workflow..."

# Проверяем какие файлы изменены в этом коммите
CHANGED_CODE_FILES=$(git diff --name-only HEAD~1 2>/dev/null | \
  grep -E "opt.js|core.js|ui_.*\.js|filter_registry\.js" | wc -l)

if [ "$CHANGED_CODE_FILES" -gt 0 ]; then
  # Код был изменён - нужна ОДНА из этих проверок в commit message:
  LAST_MSG=$(git log -1 --pretty=%B 2>/dev/null || echo "")

  # Проверяем что этап выполнен:
  # - regression-detector (означает что запустили проверку)
  # - VERIFIED (означает что регрессия прошла)
  # - PARTIAL (означает ожидание регрессии, но это документировано)
  # - verification pending (явно说明 что ждём регрессии)
  # - no regression needed (для очень малых changes)

  HAS_VERIFICATION=$(echo "$LAST_MSG" | grep -iE \
    "regression-detector|VERIFIED|PARTIAL|verification pending|no regression needed" \
    || true)

  if [ -z "$HAS_VERIFICATION" ]; then
    echo "  ❌ ОШИБКА WORKFLOW: Код изменён БЕЗ Pattern-First проверки!"
    echo ""
    echo "     Обязательно ДО пуша:"
    echo "     1. Запустить: node .claude/scripts/regression-detector.js --runs=50"
    echo "     2. Добавить в commit message ОДНО ИЗ:"
    echo "        - 'regression-detector VERIFIED' (если 0 issues)"
    echo "        - 'PARTIAL' (если ожидание итогов)"
    echo "        - 'verification pending' (если не запускал ещё)"
    echo "        - 'no regression needed' (только для очень малых changes)"
    echo ""
    echo "     Затем git commit --amend и попробовать пуш снова"
    ERRORS=$((ERRORS + 1))
  else
    echo "  ✓ Pattern-First проверка присутствует в commit message"
  fi
else
  echo "  ✓ Код не изменён - проверка регрессии не требуется"
fi

# ======================================================================
# 🔐 Критично 15: Pre-Push Regression Check (МЕХАНИЗМ БЛОКИРОВКИ)
# ОБЯЗАТЕЛЬНАЯ ПРОВЕРКА перед пушем
# ======================================================================
echo "  Проверка обязательного запуска регрессии..."

bash .claude/scripts/pre-push-regression-check.sh || {
  ERRORS=$((ERRORS + 1))
}

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
