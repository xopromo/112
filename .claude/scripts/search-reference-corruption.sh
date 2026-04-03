#!/bin/bash
# FULL SEARCH для Reference Sharing Corruption паттерна
# Ищет все места где массивы сохраняются БЕЗ копирования

echo "🔍 FULL SEARCH: Reference Sharing Corruption Pattern"
echo "======================================================"
echo ""

# Список всех полей которые могут быть массивами (equity, baseline, trade data, etc)
ARRAY_FIELDS=(
  "eq"
  "eqCalc"
  "eqBaselineArr"
  "eqCalcBaselineArr"
  "tradeLog"
  "shadowEq"
  "_fullEq"
  "old_eq"
  "new_eq"
  "old_eqCalcBaselineArr"
  "new_eqCalcBaselineArr"
  "_shadowRes"
)

echo "ℹ️  Ищем присвоения этих полей БЕЗ Array.from()/slice()/spread оператора"
echo ""

# Ищем проблемные паттерны
grep -rn "\.eq\s*=\s*[a-zA-Z_]" --include="*.js" | grep -v "Array.from" | grep -v "\.slice" | grep -v "\.from" | grep -v "// " | head -20

echo ""
echo "ℹ️  Ищем присвоения с = в полях которые точно должны быть массивами:"
echo ""

for field in "${ARRAY_FIELDS[@]}"; do
  echo "  Checking: $field"
  matches=$(grep -rn "\.$field\s*=" --include="*.js" . | grep -v "Array.from" | grep -v "\.slice" | grep -v "\.from" | grep -v "//" | grep -v "cfg\._oos" | grep -v "// " | grep -v "r\.eq" | wc -l)
  if [ "$matches" -gt 0 ]; then
    echo "    ⚠️  Found $matches potential issues"
    grep -rn "\.$field\s*=" --include="*.js" . | grep -v "Array.from" | grep -v "\.slice" | grep -v "\.from" | grep -v "//" | head -5
  fi
done

echo ""
echo "======================================================"
