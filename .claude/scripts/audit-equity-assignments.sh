#!/bin/bash
# Аудит всех присвоений equity полей
# Проверяем что везде используется Array.from()/slice()/.../spread

echo "🔍 AUDIT: Все присвоения equity-подобных полей"
echo "=================================================="
echo ""

# Функция для проверки конкретного поля
check_field() {
  local field=$1
  local regex="\.${field}\s*=\s*"
  
  echo "Проверяю: .$field ="
  
  matches=$(grep -rn "$regex" --include="*.js" . 2>/dev/null | grep -v ".cache" | grep -v "node_modules" | grep -v "USE_Optimizer_v6_built.html")
  
  while IFS= read -r line; do
    if [ -z "$line" ]; then continue; fi
    
    # Проверяем НЕ ли содержит Array.from/slice/.from/spread/null check
    if echo "$line" | grep -qE "(Array\.from|\.slice|\.from|\[\.\.|= *null|= *\[\]|= *undefined)"; then
      echo "  ✅ $line"
    else
      # Может быть это создание нового массива [] или переменная
      if echo "$line" | grep -E "= *(\[\]|new |[a-zA-Z_]\w*\s*($|;|//|,))"; then
        # Если это присваивание переменной или инициализация [], может быть OK
        continue
      fi
      echo "  ⚠️  POTENTIAL ISSUE: $line"
    fi
  done <<< "$matches"
}

# Проверяем ключевые поля
check_field "eq"
echo ""
check_field "_fullEq"
echo ""
check_field "eqCalcBaselineArr"
echo ""
check_field "old_eqCalcBaselineArr"
echo ""
check_field "new_eqCalcBaselineArr"
echo ""
check_field "old_eq"
echo ""
check_field "new_eq"

echo ""
echo "=================================================="
echo "✅ Audit complete"
