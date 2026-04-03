# Loop Prevention Policy: Защита от бесконечных циклов

## Проблема: Infinite Loop Pattern Fixing

### Сценарий infinite loop:

```
Диагностика находит: "Float32Array передается без copy"
    ↓
Исправляем все 22 места
    ↓
Регрессия тестирует - 0 issues
    ↓
Месяц спустя диагностика находит: "Ещё Float32Array в новом коде"
    ↓
"Это НОВЫЙ баг или СТАРЫЙ паттерн?" ← НЕЯСНО!
    ↓
Начинаем исправлять снова...
    ↓
... (бесконечный цикл поиска одного паттерна)
```

---

## Решение: 3-уровневый статус паттернов

### **Уровень 1: PATTERN-LEVEL STATUS**

Каждый паттерн имеет статус:

```
OPEN    - Паттерн открыт, ещё есть места для исправления
PARTIAL - Часть мест исправлена (ВОЛНЫ - плохо, но временно)
CLOSED  - ВСЕ места исправлены, дальше ЗАПРЕЩЕНО искать
```

**Правило:**
- OPEN → Можно исправлять
- PARTIAL → Нужно доисправить, ЗАТЕМ ЗАКРЫТЬ
- CLOSED → ЗАПРЕЩЕНО искать дальше, запретить новые волны

---

## Как использовать Status:

### **Шаг 1: Классификация (определяем КЛАСС)**

```
Найден баг → Определяем CLASS A или B
    ↓
Если CLASS A → это ПАТТЕРН
    ↓
Проверяем whiteboard: "Есть ли уже такой паттерн?"
    ├─ ЕСЛИ статус = CLOSED
    │  └─ "Это ИЗВЕСТНЫЙ паттерн, уже исправлен!"
    │     ДЕЙСТВИЕ: Проверяем что исправление работает
    │              Если не работает → переводим в PARTIAL
    │
    └─ ЕСЛИ статус = OPEN или нет в whiteboard
       └─ "Это НОВЫЙ паттерн"
          ДЕЙСТВИЕ: Классифицируем, добавляем, исправляем
```

### **Шаг 2: Исправление (все сразу или волны?)**

```
Нашли паттерн → FULL SEARCH → нашли 22 места
    ↓
ИСПРАВЛЯЕМ ВСЕ 22 СРАЗУ (не волнами!)
    ↓
Уровень статуса:
├─ После волны 1 (исправили 9) → STATUS: PARTIAL
├─ После волны 2 (исправили 13) → STATUS: PARTIAL
├─ После волны 3 (исправили 17) → STATUS: PARTIAL
├─ После волны 4 (исправили 22) → STATUS: CLOSED ✅
└─ RULE 13 блокирует волну 5 (не может быть!)
```

### **Шаг 3: Регрессия (доказываем что готово)**

```
regression-detector.js:
  Pass 1: 50 тестов → 0 issues ✓
  Pass 2: 50 тестов → 0 issues ✓
  Pass 3: 50 тестов → 0 issues ✓
    ↓
Статус: CLOSED ✅
Защита: Дальше не ищем этот паттерн
```

### **Шаг 4: Будущее (защита от infinite loop)**

```
Через месяц диагностика находит: "Float32Array в новом коде"
    ↓
Проверяем whiteboard:
"Pattern #1: Reference Sharing Corruption - STATUS: CLOSED"
    ↓
ВЫВОД: Это тот же паттерн, уже исправлен
    ↓
ДЕЙСТВИЕ:
├─ Проверяем: новый файл добавлен ПОСЛЕ закрытия паттерна?
├─ ДА → Это повтор в новом коде (значит аудит Rule 10 не сработал)
│  └─ Исследуем почему Rule 10 не поймал это
│  └─ Улучшаем Rule 10
│
└─ НЕТ → Это место было раньше, просто не заметили
   └─ Добавляем в волну (переводим в PARTIAL)
   └─ Доисправляем
```

---

## Формат STATUS в whiteboard:

```markdown
## ПАТТЕРН #1: Reference Sharing Corruption

**STATUS: CLOSED**
- Last Updated: 2026-04-03
- Total Cases: 5 (22 мест)
- Confidence: 95%
- Last Wave: 4
- Next Search: FORBIDDEN (дальше не ищем)

### Cases (все ✅ исправлены):
- ✅ Case 1.1: Float32Array в eq полях (9 мест)
- ✅ Case 1.2: Float32Array в ui_hc.js (5 мест)
- ✅ Case 1.3: Float32Array в ui_favs.js (2 места)
- ✅ Case 1.4: Float32Array в ui_oos.js (2 места)
- ✅ Case 1.5: _fullEq в HC (1 место)

### Verification:
- regression-detector: 100 тестов = 0 issues ✓
- dumb-checks RULE 10: нарушений не найдено ✓
- Confidence Level: VERIFIED (закрыт навечно)
```

---

## RULE 13: Loop Prevention Check (в dumb-checks.sh)

```bash
# RULE 13: Защита от infinite loop паттернов
check_closed_patterns() {
  local pattern_name="$1"
  
  # Проверяем статус в whiteboard
  local status=$(grep -A 3 "ПАТТЕРН.*$pattern_name" \
    .claude/memory/pattern-bugs-whiteboard.md | \
    grep "STATUS:" | cut -d: -f2 | xargs)
  
  if [ "$status" = "CLOSED" ]; then
    echo "✓ Pattern '$pattern_name' is CLOSED"
    echo "  Next search: FORBIDDEN"
    echo "  Cannot create new waves or issues for this pattern"
    return 0  # паттерн закрыт, не ищем дальше
  fi
  
  return 1  # паттерн открыт, можно исправлять
}

# Если в commit message упоминается паттерн с CLOSED статусом:
LAST_MSG=$(git log -1 --pretty=%B)
if echo "$LAST_MSG" | grep -iq "Float32Array\|Reference Sharing"; then
  if check_closed_patterns "Reference Sharing"; then
    echo "⚠️  WARNING: Attempting to fix CLOSED pattern"
    echo "   Check if this is:"
    echo "   1. Code added AFTER pattern was closed (new violation)"
    echo "   2. A case we missed earlier (extend pattern, don't create wave)"
    echo ""
    echo "   Either way: update RULE 10 to catch this"
  fi
fi
```

---

## Когда паттерн можно считать CLOSED:

### ✅ Условия закрытия:

1. **ALL PLACES FIXED**
   - ✅ Whiteboard: все cases помечены ✓
   - ✅ FULL SEARCH подтвердил: больше нет мест
   - ✅ Все 22 места исправлены в одном коммите

2. **REGRESSION VERIFIED**
   - ✅ regression-detector.js: 100+ тестов = 0 issues
   - ✅ dumb-checks.sh Rule 10: нарушений нет
   - ✅ Confidence Level ≥ 80%

3. **AUDIT RULE ADDED**
   - ✅ dumb-checks.sh Rule 10 (Copy-on-Storage)
   - ✅ forbidden-patterns.md описывает
   - ✅ Новый код БЕЗ правила → блокировка пуша

4. **TIME GATE**
   - ⏳ Минимум 1 неделя без новых найденных мест
   - ⏳ Commit message содержит "Pattern CLOSED"

### ❌ Условия которых НЕ ХВАТАЕТ (паттерн остается OPEN):

- Есть хотя бы одно место которое еще не исправлено
- regression-detector нашел issues
- Rule в dumb-checks еще не добавлен
- Прошло < 1 недели

---

## Защита от infinite loop (практические примеры):

### **Пример 1: Правильное закрытие**

```
Week 1:
  Понедельник: Нашли Float32Array в 22 местах
  Вторник: Исправили все 22, regressor = 0 issues
  Среда: Добавили RULE 10 в dumb-checks
  Четверг-Пятница: Тестирование, дока
  
Week 2:
  Понедельник: Статус = CLOSED
  "Дальше не ищем, паттерн защищен"
```

### **Пример 2: Неправильное (волны)**

```
Week 1:
  День 1: Исправили 9 мест → STATUS: PARTIAL
  День 2: Исправили ещё 4 → STATUS: PARTIAL
  День 3: Исправили ещё 4 → STATUS: PARTIAL
  День 4: Исправили ещё 5 → STATUS: CLOSED
  
RULE 13 БЛОКИРУЕТ:
  День 5: "Ещё одно место?" → ЗАПРЕЩЕНО!
  "Паттерн уже CLOSED, волны кончились"
```

### **Пример 3: Повтор в новом коде**

```
Paттерн закрыт с STATUS: CLOSED

Месяц спустя:
  Диагностика: "Found Float32Array in new ui_future.js"
  
Check:
  └─ Paттерн статус: CLOSED
  └─ Файл ui_future.js создан ПОСЛЕ закрытия
  └─ ВЫВОД: Это повтор архитектурной ошибки
  
ACTION:
  1. Проверяем почему RULE 10 не поймал это
  2. Улучшаем RULE 10 (может быть недостаточно универсален)
  3. Исправляем новый файл
  4. Статус остается CLOSED (тот же паттерн)
  5. Улучшенный RULE 10 защищает от повтора
```

---

## Статус паттернов в CLAUDE.md:

```markdown
## Pattern Statuses

| Паттерн | STATUS | Last Wave | Confidence |
|---------|--------|-----------|------------|
| Reference Sharing | CLOSED | 4 | 95% ✅ |
| (future patterns) | OPEN | - | - |

CLOSED = дальше искать ЗАПРЕЩЕНО
OPEN = можно исправлять
PARTIAL = нужно доисправить
```

---

## Итоговая защита от infinite loop:

```
ДИАГНОСТИКА находит баг
    ↓
CLASSIFICATION: CLASS A или B?
    ↓ (если CLASS A)
ПРОВЕРЯЕМ WHITEBOARD: статус паттерна?
    ├─ CLOSED → "Уже исправлен, дальше не ищем"
    ├─ PARTIAL → "Нужно доисправить"
    └─ OPEN → "Новый паттерн, начинаем"
    ↓
ИСПРАВЛЯЕМ ВСЕ СРАЗУ (не волнами!)
    ↓
РЕГРЕССИЯ ТЕСТ: 0 issues?
    ├─ ДА → STATUS: CLOSED, дальше не ищем
    └─ НЕТ → STATUS: PARTIAL, продолжаем
    ↓
RULE 13 БЛОКИРУЕТ: "Паттерн CLOSED → волны запрещены"
```

**Результат:** Infinite loop impossible! 🔐

