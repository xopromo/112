#!/bin/bash
# Установка git hooks для проекта

set -e

echo "🔧 Установка git hooks..."

HOOKS_DIR=".git/hooks"

# ======================================================================
# Pre-push hook: Запуск dumb-checks перед пушем
# ======================================================================
echo "  📌 Устанавливаем pre-push hook..."

cat > "$HOOKS_DIR/pre-push" << 'EOF'
#!/bin/bash
# Pre-push hook: Проверка dumb-checks перед пушем

if [ -f ".claude/scripts/dumb-checks.sh" ]; then
  echo "🔍 Запуск dumb-checks перед пушем..."
  bash .claude/scripts/dumb-checks.sh || {
    echo "❌ Дumb-checks не прошли. Пуш отменён."
    exit 1
  }
fi

exit 0
EOF

chmod +x "$HOOKS_DIR/pre-push"
echo "    ✓ pre-push установлен"

# ======================================================================
# Post-commit hook: Синхронизация номеров строк в CLAUDE.md
# ======================================================================

if [ -f "agent/sync_claude_md.sh" ]; then
  echo "  📌 Устанавливаем post-commit hook..."

  cat > "$HOOKS_DIR/post-commit" << 'EOF'
#!/bin/bash
# Post-commit hook: Синхронизация номеров строк

if [ -f "agent/sync_claude_md.sh" ]; then
  bash agent/sync_claude_md.sh
fi

exit 0
EOF

  chmod +x "$HOOKS_DIR/post-commit"
  echo "    ✓ post-commit установлен"
else
  echo "  ⚠️  agent/sync_claude_md.sh не найден, пропускаем post-commit"
fi

# ======================================================================
# Итоговый статус
# ======================================================================
echo ""
echo "✅ Hooks установлены успешно!"
echo ""
echo "Проверка:"
echo "  - Перед пушем запустится: bash .claude/scripts/dumb-checks.sh"
if [ -f "agent/sync_claude_md.sh" ]; then
  echo "  - После коммита запустится: bash agent/sync_claude_md.sh"
fi
echo ""
echo "Тестирование:"
echo "  bash .claude/scripts/dumb-checks.sh"
echo ""
