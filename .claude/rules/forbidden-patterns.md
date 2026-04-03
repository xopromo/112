# Запрещённые паттерны кодирования

Эти паттерны вызывали баги и техдолг. Если нарушение обнаружится → pre-push hook заблокирует пуш.

---

## 🔴 Запрещено: console.log в исходниках

**Проблема**: Логирует в консоль пользователя, утеком токены обучения
**Где**: opt.js, ui.js, core.js (только если явная диагностика)

**❌ Неправильно**:
```javascript
console.log('Значение:', value);  // ЗАПРЕЩЕНО
```

**✅ Правильно**:
```javascript
if (DEBUG_MODE) console.log('Значение:', value);  // Защищено флагом
// или просто удалить совсем
```

**Исключение**: Диагностические функции с явным именем
```javascript
function _logOOSDiagnostic(r, analysis) {  // ← имя начинается с _
  console.log('...');  // OK, это диагностика
}
```

---

## 🔴 Запрещено: Hardcoded цвета вместо CSS переменных

**Проблема**: Нарушает тему, усложняет поддержку
**Где**: ui.js, shell.html

**❌ Неправильно**:
```javascript
ctx.fillStyle = '#0099ff';  // прямой цвет
element.style.color = '#4ade80';  // прямой цвет
```

**✅ Правильно**:
```javascript
// Использовать CSS переменные
ctx.fillStyle = 'rgba(0, 153, 255, 0.7)'; // только для canvas математики
// или в CSS:
color: var(--accent);  // из :root
```

**Список переменных** (shell.html):
- `--bg`, `--bg2` — фоны
- `--text`, `--text2`, `--text3` — текст
- `--accent`, `--border` — основные
- `--green`, `--red` — статусы

---

## 🔴 Запрещено: Вложенные ternary > 1 уровня

**Проблема**: Трудно читать, ошибки в логике

**❌ Неправильно**:
```javascript
const status = value > 50 ? (value > 80 ? 'high' : 'medium') : 'low';
```

**✅ Правильно**:
```javascript
let status = 'low';
if (value > 50) status = 'medium';
if (value > 80) status = 'high';
```

---

## 🔴 Запрещено: Разные версии _cfg без синхронизации

**Проблема**: OOS split становится неправильным на одном из режимов
**Где**: opt.js (3 места: MC, TPE, Exhaustive)

**❌ Неправильно**:
```javascript
// opt.js ~1909 (MC)
_cfg.newParam = 5;

// opt.js ~2265 (TPE)
_cfg_tpe.newParam = 5;

// opt.js ~2847 (Exhaustive) — ЗАБЫЛ!
// нет _cfg_ex.newParam
```

**✅ Правильно**: Все 3 места содержат `newParam`

**Проверка**: `grep -n "newParam" opt.js` должен показать ≥3 совпадения

---

## 🔴 Запрещено: Фильтры без warmup проверки

**Проблема**: Первые N баров индикатора = 0 или na, фильтр блокируется неправильно
**Где**: filter_registry.js (все новые фильтры)

**❌ Неправильно**:
```javascript
blocksL: (cfg, i) => {
  const ma = cfg.maArr[i-1];
  return ma > DATA[i-1].c;  // не проверяет warmup!
}
```

**✅ Правильно**:
```javascript
blocksL: (cfg, i) => {
  const ma = cfg.maArr[i-1];
  return ma <= 0 || ma > DATA[i-1].c;  // ma<=0 = не прогрелась
}
```

---

## 🔴 Запрещено: Функции без проверки входных данных

**Проблема**: null/undefined распространяется дальше, трудно найти баг
**Где**: Все функции которые берут параметры из UI

**❌ Неправильно**:
```javascript
function parseRange(s) {
  const [a, b] = s.split('-');
  return [parseFloat(a), parseFloat(b)];  // crash if s=null
}
```

**✅ Правильно**:
```javascript
function parseRange(s) {
  if (!s || typeof s !== 'string') return null;
  const [a, b] = s.split('-');
  const n1 = parseFloat(a), n2 = parseFloat(b);
  if (isNaN(n1) || isNaN(n2)) return null;
  return [n1, n2];
}
```

---

## 🟡 Не рекомендуется: Глобальные переменные без префикса

**Проблема**: Путаница, конфликты имён

**⚠️ Плохо**:
```javascript
let results = [];  // можно спутать
```

**✅ Лучше**:
```javascript
let _tableResults = [];  // ясно что это глобальная
```

**Исключение**: Если это явная глобальная API вроде `DATA`, `NEW_DATA`, `RESULTS`

---

## 🟡 Не рекомендуется: Функции > 200 строк

**Проблема**: Трудно тестировать, много context switching
**Где**: opt.js, ui.js

**Решение**: Разбить на подфункции
```javascript
function runOpt() {  // 876 строк — ОК если есть подфункции
  _initOpt();
  _runMC();
  _runTPE();
  _attachOOS();
  renderResults();
}
```

---

## 🟢 Не запрещено но осторожно: Magic numbers

**Проблема**: Неясно откуда взялось число
**Где**: Любые вычисления

**⚠️ Плохо**:
```javascript
const warmup = Math.max(maWarmup, pivotWarmup, atrWarmup, 1);
const warmupEndIdx = Math.min(warmup, newEqClean.length - 1);
```

**✅ Лучше**:
```javascript
const MIN_WARMUP = 1;  // минимум чтобы избежать первого бара
const warmup = Math.max(maWarmup, pivotWarmup, atrWarmup, MIN_WARMUP);
const warmupEndIdx = Math.min(warmup, newEqClean.length - 1);
```

---

## 🔴 Запрещено: Незакрытые скобки и синтаксические ошибки при редактировании

**Проблема**: Одна незакрытая скобка ломает весь проект — проекты не открываются, данные не загружаются
**Частая причина**: При редактировании многострочных структур (объектов, циклов) забывается закрывающая скобка
**Где**: Любые JS файлы (ui*.js, opt.js, core.js)

**❌ Неправильно** (пример с циклом for):
```javascript
for (let i = 0; i < items.length; i++) {
  const item = items[i];
  _oosTableResults.push({
    name: item.name,
    value: item.value
  });
  // ЗАБЫТА СКОБКА! Цикл не закрыт
  
// Потом идёт код который должен быть после цикла
if (progressEl) progressEl.textContent = '✅ Готово';
```

**✅ Правильно**:
```javascript
for (let i = 0; i < items.length; i++) {
  const item = items[i];
  _oosTableResults.push({
    name: item.name,
    value: item.value
  });
}  // ← закрывающая скобка для цикла

// Теперь код после цикла
if (progressEl) progressEl.textContent = '✅ Готово';
```

**Как найти ошибку**:
```bash
# Проверить синтаксис
node -c ui_oos.js

# Если ошибка — посчитать скобки
grep -o "{" ui_oos.js | wc -l  # открывающих
grep -o "}" ui_oos.js | wc -l  # закрывающих

# Числа должны быть равны!
```

**Правило**: Каждой открывающей `{` должна соответствовать закрывающая `}`

---

## 🔴 Запрещено: Классифицировать баг как CLASS B когда это CLASS A

**Проблема**: Amnesia-driven development
```
Исправляем Float32Array в 22 местах (это CLASS A - ПАТТЕРН!)
    ↓
Проблема исчезает (потому что исправили)
    ↓
Теперь никто не вспомнит что это было
    ↓
Новый разработчик делает то же в НОВОМ месте
    ↓
Лазим по коду ища баги, не зная где пробоина
```

**Решение:** Определи КЛАСС баги СРАЗУ:

**CLASS A: СИСТЕМНЫЕ ПАТТЕРНЫ** (обобщить в правило ОБЯЗАТЕЛЬНО!)
- ✅ Есть похожие места в коде (≥2)
- ✅ Следует архитектурной логике
- ✅ Может повториться в новом коде
- ✅ Требует универсального решения

**Примеры CLASS A:**
```javascript
// Везде где Array передаётся → может быть то же
obj.field = source.field;  // Reference corruption!

// В новом ui_future.js может быть то же нарушение
rNew.eqCalcMAArr = _btCfg.eqCalcMAArr;  // Missing Array.from()
```

**CLASS B: СЛУЧАЙНЫЕ ОШИБКИ** (просто исправить)
- ❌ В одном месте, уникально
- ❌ Не архитектурная проблема
- ❌ Вероятность повтора = низкая
- ❌ Случайная опечатка/невнимательность

**Примеры CLASS B:**
```javascript
// Опечатка в одном месте — это невнимательность
const nLenght = arr.length;  // typo: nLenght → length

// Неправильное имя только здесь — не архитектура
let result = calculte(input);  // typo: calculte → calculate
```

**❌ НЕПРАВИЛЬНО:**
```
Нашли Float32Array в 22 местах (CLASS A - ПАТТЕРН!)
    ↓
"Ладно, создам quick-fixes/float32-audit.sh" ← БЕЗ обобщения!
    ↓
Через месяц новый баг похожего типа, но забыли про старый скрипт
```

**✅ ПРАВИЛЬНО:**
```
Нашли Float32Array в 22 местах (CLASS A - ПАТТЕРН!)
    ↓
Определили ПАТТЕРН: Reference Sharing Corruption
    ↓
Создали ПРАВИЛО: Copy-on-Storage Pattern
    ↓
Добавили в АУДИТ: dumb-checks.sh Rule 10
    ↓
ЗАЩИЩЕНО: Новый код не может нарушить это правило
```

**Подробнее:** см. `.claude/memory/pattern-classification-guide.md`

---

## 🔴 Запрещено: Частные скрипты для частных багов

**Проблема**: Когда находишь баг, нельзя создавать частный скрипт для его проверки. 
Это приводит к:
- Паттерн-специфичным скриптам (float32-audit.sh, eq-check.sh, abc-xyz-check.sh)
- Раздувающейся папке .claude/scripts/
- Непереиспользуемым кодом
- Волнам одинакового бага (когда забываешь проверить все места)

**Правильный подход:**
1. Определить ПАТТЕРН (что это класс проблем, а не один баг?)
2. Написать УНИВЕРСАЛЬНОЕ ПРАВИЛО в .claude/rules/
3. Добавить проверку в dumb-checks.sh (не отдельный скрипт)
4. Документировать case-ы в .claude/memory/pattern-bugs-whiteboard.md

**❌ ЗАПРЕЩЕНО:**
```bash
.claude/scripts/float32-audit.sh           # ← частный для Float32Array
.claude/scripts/eq-corruption-check.sh     # ← частный для eq
.claude/scripts/check-xy-pattern.sh        # ← частный для XY pattern
```

**✅ ПРАВИЛЬНО:**
```
.claude/rules/pattern-bug-methodology.md   # ← как думать паттернами
.claude/rules/forbidden-patterns.md        # ← добавить паттерн сюда
.claude/memory/pattern-bugs-whiteboard.md  # ← отслеживать все case-ы
dumb-checks.sh (RULE 10)                   # ← проверка в универсальном аудите
```

**Пример Float32Array:**
- ❌ Создал бы float32-audit.sh (частный скрипт)
- ✅ Вместо этого: обобщенное правило "Copy-on-Storage" в dumb-checks.sh

**Как это проверяется:**
- Перед пушем проверяется что не создано новых .claude/scripts/*.sh файлов без соответствующего обобщенного правила
- Если нарушение → пуш блокируется с сообщением "Create universal rule first!"

---

## Как это проверяется

**Pre-push hook** (`.git/hooks/pre-push`):
```bash
#!/bin/bash
bash scripts/dumb-checks.sh || exit 1
```

**dumb-checks.sh** содержит регулярные выражения для каждого правила.
Если нарушение найдено → пуш блокируется.

**Ручная проверка**:
```bash
bash scripts/dumb-checks.sh
```

---

## 🔴 Запрещено: Double-Processing Data Mismatch

**Проблема**: Когда данные очищаются/трансформируются в ДВУХ местах (создание и рисование), 
индексы могут рассинхронизироваться, особенно если первая трансформация не документирована.

**Где**: Любой код где данные: создаются → сохраняются → используются в другом модуле

**❌ Неправильно**:
```javascript
// В ui_oos.js при создании:
new_eq = Array.from(rNew.eq)  // ПОЛНЫЙ eq, не очищен

// В ui_equity.js при рисовании:
let newEqClean = eq_new.slice(overlapIdx);  // Обрезаем СНОВА!
let newEqClean = newEqClean.slice(warmupEndIdx);  // И ЕЩЕ!
// РЕЗУЛЬТАТ: Warmup рассинхронизирован, графики расходятся и ДИВЕРГИРУЮТ
```

**✅ Правильно** (очистить ВСЕ В ОДНОМ МЕСТЕ):
```javascript
// В ui_oos.js при создании:
new_eq = Array.from(rNew.eq.slice(_overlapIdx))  // ОЧИЩЕННЫЙ eq

// В ui_equity.js при рисовании:
let newEqClean = eq_new;  // Уже очищена! Используем как есть
// РЕЗУЛЬТАТ: Индексы совпадают, warmup синхронизирован, графики выровнены
```

**Правило**: Если данные очищаются/фильтруются, это должно происходить **ОДИН РАЗ** в **ОДНОМ МЕСТЕ**.
Сохраняемое поле должно содержать **ФИНАЛЬНОЕ состояние**, не промежуточное.

**Проверка**: grep для полей которые используются в разных модулях и проверить что трансформация не повторяется.

