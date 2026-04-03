#!/bin/bash
# Pattern Search Template
#
# ИСПОЛЬЗУЕТСЯ ДЛЯ ПОИСКА ПАТТЕРНОВ (не исправления!)
# Скопируй этот файл и адаптируй для нового паттерна
#
# Правило: FULL SEARCH перед исправлением!

PATTERN_NAME="${1:-Copy-on-Storage}"

echo "=== PATTERN SEARCH: $PATTERN_NAME ==="
echo ""
echo "Searching for all instances of '$PATTERN_NAME' pattern..."
echo ""

case "$PATTERN_NAME" in
  "Copy-on-Storage")
    echo "Pattern: Reference Sharing Corruption"
    echo "Definition: Mutable data (Array/Object) passed by reference instead of copy"
    echo ""

    echo "--- SEARCH 1: Direct property assignments without Array.from() ---"
    grep -rn "\.eq\s*=" opt.js ui_*.js | grep -v "Array.from" | grep -v "//" && echo "Found ☝️"

    echo ""
    echo "--- SEARCH 2: Return statements with eq ---"
    grep -rn "return {.*\beq:" opt.js ui_*.js | grep -v "Array.from" && echo "Found ☝️"

    echo ""
    echo "--- SEARCH 3: Object literal assignments ---"
    grep -rn "eq:" opt.js ui_*.js | grep -v "Array.from" | grep "{" && echo "Found ☝️"

    echo ""
    echo "--- SEARCH 4: Baseline (eqCalcBaselineArr) assignments ---"
    grep -rn "eqCalcBaselineArr\s*=" opt.js ui_*.js | grep -v "Array.from" && echo "Found ☝️"

    echo ""
    echo "--- SEARCH 5: Filtered equity (eqCalcMAArr) assignments ---"
    grep -rn "eqCalcMAArr\s*=" opt.js ui_*.js | grep -v "Array.from" && echo "Found ☝️"

    echo ""
    echo "--- SEARCH 6: Object properties with eq ---"
    grep -rn "\._fullEq\s*=\|\.old_eq\s*=\|\.new_eq\s*=" opt.js ui_*.js | grep -v "Array.from" && echo "Found ☝️"
    ;;

  *)
    echo "❌ Unknown pattern: $PATTERN_NAME"
    echo ""
    echo "Available patterns:"
    echo "  - Copy-on-Storage"
    exit 1
    ;;
esac

echo ""
echo "✅ Pattern search complete. Document findings in .claude/memory/pattern-bugs-whiteboard.md"
echo "   Then create comprehensive rule in .claude/rules/"
echo "   Then fix ALL instances at once (not in waves!)"
