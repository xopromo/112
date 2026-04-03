# Policy: Regression Testing & Verification

## Проблема: Неверифицированные исправления

Когда мы исправляем баг, мы часто не проверяем что исправление РЕАЛЬНО решило проблему.
Результат: неправильные правила закладываются в аудит системе.

## Решение: VERIFICATION-FIRST подход

### 1. Запуск regression-detector перед сохранением правила

Любое исправление ДОЛЖНО быть протестировано на 100+ итерациях:

```bash
node .claude/scripts/regression-detector.js --runs=50 --verbose
```

**Статусы:**
- ✅ **VERIFIED** (0 issues) → Правило может быть сохранено
- 🟡 **PARTIAL** (issues < 5%) → Требует доследования
- ❌ **FAILED** (issues > 5%) → Исправление неполное, поиск продолжается

### 2. Confidence Levels для правил

```markdown
## Rule: Float32Array must be copied
- Confidence: 0% ← UNVERIFIED
- Status: HYPOTHESIS (not yet proven)
- Verification: regression-detector [failed]
- Next: Continue searching for root cause
```

### 3. Процесс добавления нового правила

```
1. Найти баг
   ↓
2. Исправить в коде
   ↓
3. Запустить regression-detector
   ↓
4a. ЕСЛИ issues → Поиск продолжается (может быть не та причина)
   ↓
4b. ЕСЛИ 0 issues → Сохранить правило в audit-patterns.md
   ↓
5. Добавить в universal-audit.sh
```

### 4. Когда НЕ сохранять правило

- Если regression-detector нашел issues ПОСЛЕ исправления
- Если проблема "вроде пропала" но может вернуться
- Если мы не понимаем ПОЧЕМУ исправление сработало

## Текущий статус проблемы "Graph Movement Change"

```
Status: ❌ FAILED
Description: Графики меняют движение после OOS расчета
Last check: regression-detector found 25 MOVEMENT_CHANGE + 75 DATA_REFERENCE_REUSE
Attempted fixes: 
  - HC eq corruption (x.r._fullEq) ← incomplete
  - Float32Array copying (Array.from) ← incomplete
Next: Deep dive on where eq actually gets corrupted
```

## Инструменты

- **regression-detector.js** - автоматический поиск аномалий (100+ прогонов)
- **universal-audit.sh** - проверка кода на паттерны ошибок
- **audit-patterns.md** - библиотека VERIFIED правил

## Правило Zero-Copy Culture

Правило добавляется в систему ТОЛЬКО когда:
1. ✅ regression-detector = 0 issues
2. ✅ Код пройден через универсальный аудит
3. ✅ Паттерн документирован с примерами
4. ✅ Confidence ≥ 80%
