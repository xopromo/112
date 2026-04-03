#!/bin/bash
# ============================================================
# AUTO-RESOLVE CONFLICTS
# Автоматически разрешает конфликты которые можно исправить
# без ручного вмешательства
# ============================================================

set -e

echo "🔄 Checking for resolvable conflicts..."

# Список файлов которые можно разрешить автоматически
AUTO_RESOLVE_FILES=(
  "USE_Optimizer_v6_built.html"      # Бандл - пересобирается
  "USE_Optimizer_v6_built.js"        # Бандл - пересобирается
)

# Проверяем есть ли конфликты
if ! git diff --name-only --diff-filter=U | grep -q .; then
  echo "✓ No conflicts found"
  exit 0
fi

CONFLICTS=$(git diff --name-only --diff-filter=U)
RESOLVED=0
UNRESOLVED=0

echo -e "\n⚠️  Found conflicts in:"
echo "$CONFLICTS"

for FILE in $CONFLICTS; do
  SHOULD_AUTO_RESOLVE=false

  # Проверяем может ли этот файл быть разрешен автоматически
  for AUTO_FILE in "${AUTO_RESOLVE_FILES[@]}"; do
    if [[ "$FILE" == "$AUTO_FILE" ]]; then
      SHOULD_AUTO_RESOLVE=true
      break
    fi
  done

  if [ "$SHOULD_AUTO_RESOLVE" = true ]; then
    echo -e "\n✓ AUTO-RESOLVING: $FILE"

    if [[ "$FILE" == *".html" ]] || [[ "$FILE" == *".js" ]]; then
      # Для бандлов - берем версию из main и пересобираем
      echo "  → Taking version from main..."
      git checkout --theirs "$FILE"

      if [[ "$FILE" == "USE_Optimizer_v6_built.html" ]] || [[ "$FILE" == "USE_Optimizer_v6_built.js" ]]; then
        echo "  → Rebuilding bundle..."
        if command -v python &>/dev/null; then
          python build.py || echo "  ⚠️  Build failed, but conflict marked as resolved"
        else
          echo "  ⚠️  python not found, skipping rebuild"
        fi
      fi

      git add "$FILE"
      RESOLVED=$((RESOLVED + 1))
    fi
  else
    echo -e "\n❌ MANUAL RESOLUTION NEEDED: $FILE"
    echo "   This file has conflicts that require human judgment"
    UNRESOLVED=$((UNRESOLVED + 1))
  fi
done

echo -e "\n════════════════════════════════════════════════════════════"
echo "CONFLICT RESOLUTION SUMMARY"
echo "════════════════════════════════════════════════════════════"
echo "✓ Auto-resolved: $RESOLVED"
echo "❌ Need manual resolution: $UNRESOLVED"

if [ $UNRESOLVED -gt 0 ]; then
  echo -e "\n⚠️  Manual conflicts require human decision:"
  git diff --name-only --diff-filter=U
  exit 1
fi

if [ $RESOLVED -gt 0 ]; then
  echo -e "\n✓ All conflicts auto-resolved"
  echo "Ready to commit:"
  echo "  git commit -m 'Resolve conflicts: auto-rebuild bundles'"
  exit 0
fi

exit 0
