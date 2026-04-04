# Deployment Safety Policy: Защита от потери кода

## 🚨 Урок из инцидента (2026-04-04)

**Что случилось:**
1. Удалил `USE_Optimizer_v6_built.html` из git
2. GitHub Pages упал (404 - файл не найден)
3. Старая версия осталась на сайте
4. **Могли потерять ВСЮ работу дня!**

**Почему это произошло:**
- ❌ Не было резервной копии
- ❌ Не было системы восстановления
- ❌ Нет защиты перед удалением критичных файлов
- ❌ Нет мониторинга состояния сайта

---

## ✅ СИСТЕМА ЗАЩИТЫ (4 уровня)

### Уровень 1: BACKUP & RECOVERY (Резервные копии)

**Критичные файлы (НИКОГДА не удалять без резервной копии):**
```
USE_Optimizer_v6_built.html (главный бандл)
shell.html (точка входа)
Все исходники (ui*.js, opt.js, core.js)
```

**Автоматический backup:**
```bash
# Ежедневно (в GitHub Actions):
git tag backup-$(date +%Y%m%d) main
git push origin --tags

# Результат: https://github.com/xopromo/112/releases/tag/backup-20260404
# Всегда можно восстановить: git show backup-20260404:USE_Optimizer_v6_built.html
```

**Как восстановить в чрезвычайной ситуации:**
```bash
# 1. Найти backup tag
git tag | grep backup | sort | tail -5

# 2. Восстановить файл
git show backup-20260404:USE_Optimizer_v6_built.html > USE_Optimizer_v6_built.html

# 3. Commit и push
git add -f USE_Optimizer_v6_built.html
git commit -m "EMERGENCY RECOVERY: restore from backup-20260404"
git push origin main
```

---

### Уровень 2: CI/CD & AUTO-DEPLOY (Автоматическая сборка)

**GitHub Actions workflow (.github/workflows/deploy.yml):**
```yaml
name: Build & Deploy

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.9'
      
      - name: Build bundle
        run: python build.py
      
      - name: Commit & push bundle
        run: |
          git config user.email "github-actions@example.com"
          git config user.name "GitHub Actions"
          git add -f USE_Optimizer_v6_built.html
          git commit -m "Auto-rebuild bundle [skip ci]" || echo "Nothing to commit"
          git push origin main
      
      - name: Deploy to Pages
        # GitHub Pages автоматически использует содержимое main
```

**Результат:**
- ✅ Каждый коммит → автоматическая сборка
- ✅ Бандл всегда актуален
- ✅ GitHub Pages автоматически обновляется
- ✅ Можно удалить из .gitignore (CI/CD пересоберёт)

---

### Уровень 3: PRE-PUSH PROTECTION (Защита перед пушем)

**Критичные файлы - запретить удаление:**
```bash
# .claude/scripts/dumb-checks.sh добавить RULE 17:

check_critical_deletions() {
  # Список файлов которые НИКОГДА не должны быть удалены
  CRITICAL_FILES=(
    "USE_Optimizer_v6_built.html"
    "shell.html"
    "opt.js"
    "core.js"
  )
  
  for file in "${CRITICAL_FILES[@]}"; do
    if git diff --cached --name-status | grep "^D.*$file"; then
      echo "❌ ОШИБКА: Попытка удалить критичный файл: $file"
      echo "   Это может сломать GitHub Pages или основной функционал!"
      echo ""
      echo "   Если это намеренно:"
      echo "   1. Создай backup: git tag backup-$(date +%Y%m%d)"
      echo "   2. Убедись что есть CI/CD для пересборки"
      echo "   3. Добавь файл в .gitignore (не удаляй из git!)"
      return 1
    fi
  done
  return 0
}
```

---

### Уровень 4: DEPLOYMENT MONITORING (Мониторинг)

**Проверка что Pages работает:**
```bash
# .github/workflows/health-check.yml (каждый час)

jobs:
  check-pages:
    runs-on: ubuntu-latest
    steps:
      - name: Check GitHub Pages health
        run: |
          STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
            https://xopromo.github.io/112/USE_Optimizer_v6_built.html)
          
          if [ "$STATUS" != "200" ]; then
            echo "🚨 ALERT: GitHub Pages returned $STATUS"
            echo "File is DOWN or MISSING!"
            # Отправить уведомление в GitHub Issues
            gh issue create --title "🚨 GitHub Pages is DOWN" \
              --body "USE_Optimizer_v6_built.html returns HTTP $STATUS"
          fi
```

---

## 📋 ЧЁТКИЙ ПРОЦЕСС РАЗВЁРТЫВАНИЯ

### Когда менять исходники (ui*.js, opt.js, etc):

```
1. ✅ Изменить файлы на feature branch
   ↓
2. ✅ Протестировать локально
   ↓
3. ✅ Создать PR в main
   ↓
4. ✅ Merge PR в main
   ↓
5. ✅ CI/CD АВТОМАТИЧЕСКИ пересобирает бандл
   ↓
6. ✅ GitHub Pages обновляется (за ~2 минуты)
   ↓
7. ✅ ГОТОВО - ничего ручного не требуется!
```

**НИКОГДА не коммитить бандл вручную!**
```
❌ НЕПРАВИЛЬНО:
python build.py
git add USE_Optimizer_v6_built.html
git commit -m "..."
git push

✅ ПРАВИЛЬНО:
python build.py (только для локального тестирования)
git add ui_equity.js (только исходники!)
git commit -m "Fix equity lines"
git push
# CI/CD сам пересобирает и коммитит бандл!
```

---

## 🚨 КРИТИЧНЫЕ ФАЙЛЫ (НИКОГДА НЕ УДАЛЯТЬ)

```
USE_Optimizer_v6_built.html  ← GitHub Pages зависит от этого!
shell.html                    ← Точка входа
opt.js, core.js              ← Основная логика
```

**Если нужно удалить файл:**
1. ✅ Создай backup tag: `git tag backup-$(date +%Y%m%d)`
2. ✅ Убедись что есть способ пересоздать (CI/CD или скрипт)
3. ✅ Добавь в .gitignore (если генерируется)
4. ✅ Только потом удаляй

---

## 📞 В ЧРЕЗВЫЧАЙНОЙ СИТУАЦИИ

**Если GitHub Pages упал:**

```bash
# 1. Немедленно восстановить из backup
git tag | grep backup | tail -1  # Найди последний backup
git show BACKUP_TAG:USE_Optimizer_v6_built.html > USE_Optimizer_v6_built.html

# 2. Emergency commit
git add -f USE_Optimizer_v6_built.html
git commit -m "EMERGENCY: GitHub Pages recovery from backup"
git push origin main

# 3. Создать GitHub Issue для расследования
gh issue create --title "🚨 EMERGENCY RECOVERY: Pages was down"
```

---

## ✅ Контрольный список перед продакшеном

- [ ] Есть backup tag последней версии?
- [ ] GitHub Actions workflow настроена и работает?
- [ ] RULE 17 в dumb-checks.sh блокирует удаление критичных файлов?
- [ ] Health check workflow проверяет Pages каждый час?
- [ ] Документ (этот файл) доступен всей команде?
- [ ] Все критичные файлы защищены от случайного удаления?

**Если все галочки ✅ - система полностью защищена от потери кода!**
