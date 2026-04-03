# Pattern-First Methodology: Думаем категориями, не скриптами

## Проблема

Когда находишь баг, нельзя фиксить его как **частный случай**. Это приводит к:
- Нескольким волнам одинакового бага (как Float32Array × 4)
- Созданию частных скриптов для каждого бага
- Бесконечной доработке вместо полного решения

## Решение: Паттерн-First подход

### Шаг 1: ОПРЕДЕЛИТЬ ПАТТЕРН (не баг, а КЛАСС проблем)

**Плохо (частный баг):**
```
"Float32Array передается по ссылке в 4 местах"
```

**Хорошо (паттерн):**
```
ПАТТЕРН: Reference Sharing Corruption
ПРИЧИНА: Когда сохраняем изменяемые данные (Array/Object) по ссылке, 
         источник может мутировать, и копия повредится
ЗАТРАГИВАЕТ: Float32Array, Object properties, вложенные массивы, все 
             что может быть переиспользовано
```

### Шаг 2: НАПИСАТЬ УНИВЕРСАЛЬНОЕ ПРАВИЛО

**Плохо (для Float32Array):**
```bash
grep -rn "\.eq\s*=" | grep -v Array.from  # только для eq!
```

**Хорошо (для ВСЕХ типов данных):**
```
ПРАВИЛО: Copy-on-Storage Pattern

Когда сохраняешь данные в место которое может быть переиспользовано:
- Если primitives (number, string, boolean) → OK, immutable
- Если Array/TypedArray/Object → ОБЯЗАТЕЛЬНО копировать при сохранении
- Места сохранения: глобальные переменные, объекты, localStorage, конфиги

✅ ПРАВИЛЬНО:
  obj.field = Array.from(source.field);
  obj.field = {...source};
  obj.field = Object.assign({}, source);
  
❌ НЕПРАВИЛЬНО:
  obj.field = source.field;  // reference!
```

### Шаг 3: ДОБАВИТЬ В АУДИТ (не скрипт для одного бага!)

**Плохо:**
```bash
# float32-audit.sh - специфичный для Float32Array
grep "\.eqCalcBaselineArr\s*=" | grep -v Array.from
```

**Хорошо:**
```bash
# В dumb-checks.sh - универсальная проверка Copy-on-Storage
check_copy_on_storage() {
  # Ищет ВСЕ присвоения изменяемых структур без копирования
  grep -rn "\.\(eq\|config\|data\|state\)\s*=" | \
    grep -v Array.from | grep -v "\.{" | \
    # исключаем whitelist безопасных мест
    grep -v "for\|if\|const cfg ="
}
```

### Шаг 4: ФИКСИТЬ КОНКРЕТНЫЕ СЛУЧАИ

Теперь когда правило есть, исправляем ВСЕ места за один проход.

### Шаг 5: ДОКАЗАТЬ что правило работает

```bash
regression-detector.js --pattern=copy-on-storage --runs=100
```

Если 0 issues → правило валидно  
Если issues → правило неполное, нужна доработка

---

## Применение к Float32Array case:

```
ЭТАП 1: ОПРЕДЕЛЕНИЕ ПАТТЕРНА
├─ "Float32Array corruption" это подмножество...
├─ Reference Sharing Corruption (общий паттерн)
└─ Copy-on-Storage Pattern (универсальное правило)

ЭТАП 2: ПРАВИЛО
├─ Copy-on-Storage Pattern
├─ Applies to: Array, TypedArray, Object
└─ Severity: CRITICAL

ЭТАП 3: АУДИТ
├─ dumb-checks.sh Rule 10: Copy-on-Storage check
├─ Ищет все присвоения без Array.from/.../ Object.assign
└─ Требует whitelist для исключений

ЭТАП 4: ФИКСЫ
├─ 9 мест (волна 1)
├─ 4 места (волна 2)
├─ 4 места (волна 3)
└─ 5 мест (волна 4) = 22 места ✅

ЭТАП 5: ДОКАЗАТЕЛЬСТВО
├─ regression-detector.js 100+ тестов
└─ 0 issues ✅
```

---

## Запрет: Не создавай частные скрипты!

❌ **ЗАПРЕЩЕНО:**
```bash
.claude/scripts/float32-audit.sh        # частный скрипт для одного паттерна
.claude/scripts/eq-corruption-check.sh  # частный для eq
.claude/scripts/check-abc-xyz.sh        # частный для XYZ
```

✅ **ПРАВИЛЬНО:**
```
.claude/rules/pattern-bug-methodology.md     # обобщенный подход
.claude/rules/forbidden-patterns.md          # паттерн добавлен сюда
.claude/memory/pattern-bugs-whiteboard.md    # отслеживание case-ов паттерна
dumb-checks.sh (RULE 10)                     # проверка в универсальном аудите
```

---

## Контрольный список: Паттерн-First Workflow

Когда находишь баг:

1. ☐ **Определить ПАТТЕРН** (что это класс?)
   - Это Reference Sharing? Data Mutation? State Corruption?
   - Какие еще типы данных могут быть затронуты?

2. ☐ **FULL SEARCH** (найти ВСЕ случаи паттерна)
   - grep по категории (не по конкретному имени)
   - Документировать в whiteboard

3. ☐ **Написать ПРАВИЛО** (как это предотвратить универсально)
   - Добавить в .claude/rules/
   - Описать what/why/how

4. ☐ **Добавить в АУДИТ** (как проверять)
   - dumb-checks.sh CRITICAL Rule
   - Не частный скрипт!

5. ☐ **Исправить ВСЕ СЛУЧАИ** (одним коммитом)
   - Все 22 места одновременно
   - Одно объяснение почему

6. ☐ **Доказать что работает** (регрессионный тест)
   - regression-detector 100+ итераций
   - 0 issues = готово

---

## Как меня проверять

**Если я создал:**
- ❌ Частный скрипт (float32-audit.sh)
- ❌ Частное правило (fix-eq-only.md)
- ❌ Исправления волнами (пришлось фиксить 4 раза)

**Значит я нарушил эту методику!**

**Правильный результат:**
- ✅ Одно обобщенное правило (Copy-on-Storage)
- ✅ Одна проверка в dumb-checks.sh (Rule 10)
- ✅ 22 места исправлены за один раз
- ✅ Regression detector подтверждает

