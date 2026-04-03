#!/bin/bash
# ============================================================
# RUN ALL REGRESSION TESTS
# ============================================================
# Запускает полный набор тестов для проверки корупции данных.
# Используется перед пушем для гарантии что нет регрессий.
#
# Usage: bash .claude/scripts/run-all-tests.sh [--quick]
# ============================================================

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
QUICK_MODE="${1:-}"

echo "🧪 REGRESSION TEST SUITE"
echo "======================="
echo ""

# Параметры в зависимости от режима
if [ "$QUICK_MODE" = "--quick" ]; then
  RUNS=5
  echo "⚡ QUICK MODE (5 runs per test)"
else
  RUNS=20
  echo "📊 FULL MODE (20 runs per test)"
fi

echo ""

# Test 1: Regression Detector
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣  Regression Detector (поиск аномалий в eq)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if node "$SCRIPT_DIR/regression-detector.js" --runs=$RUNS --verbose 2>&1; then
  echo "✅ PASSED"
  REGRESSION_PASSED=1
else
  echo "❌ FAILED - Found regression issues!"
  REGRESSION_PASSED=0
fi

echo ""

# Test 2: OOS Mutation Test
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2️⃣  OOS Mutation Test (Float32Array corruption)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if node "$SCRIPT_DIR/oos-mutation-test.js" 2>&1; then
  echo "✅ PASSED"
  MUTATION_PASSED=1
else
  echo "❌ FAILED"
  MUTATION_PASSED=0
fi

echo ""

# Test 3: Validate Fix
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3️⃣  Validate Fix (Array.from() protection)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if node "$SCRIPT_DIR/validate-fix.js" 2>&1; then
  echo "✅ PASSED"
  VALIDATE_PASSED=1
else
  echo "❌ FAILED"
  VALIDATE_PASSED=0
fi

echo ""

# Анализ накопленных ошибок (если они есть)
if [ "$REGRESSION_PASSED" -eq 0 ] || [ "$MUTATION_PASSED" -eq 0 ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📊 Error Analysis & Rule Synthesis"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  node "$SCRIPT_DIR/rule-synthesizer.js" 2>&1 || true
  echo ""
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$REGRESSION_PASSED" -eq 1 ] && [ "$MUTATION_PASSED" -eq 1 ] && [ "$VALIDATE_PASSED" -eq 1 ]; then
  echo "✅ ALL TESTS PASSED"
  echo ""
  echo "You can safely push to the branch:"
  echo "  git push -u origin claude/your-branch"
  echo ""
  exit 0
else
  echo "❌ SOME TESTS FAILED"
  echo ""
  echo "Issues found:"
  [ "$REGRESSION_PASSED" -eq 0 ] && echo "  • Regression Detector found issues"
  [ "$MUTATION_PASSED" -eq 0 ] && echo "  • Mutation Test failed"
  [ "$VALIDATE_PASSED" -eq 0 ] && echo "  • Validate Fix failed"
  echo ""
  echo "Error analysis and rule hypotheses saved to:"
  echo "  .claude/logs/error-log.json"
  echo "  .claude/rules/rule-hypotheses.md"
  echo ""
  exit 1
fi
