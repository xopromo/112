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

---

## 🔴 Запрещено: Коммитить устаревший бандл без пересборки

**Проблема**: Бандл файлы (`.built.html`, минифицированные bundle.js) это ГЕНЕРИРУЕМЫЕ файлы.
Если изменить исходники (ui.js, opt.js) но НЕ пересобрать бандл → возникают конфликты при мерже.

**Где**: Любые коммиты что изменяют исходники

**Сценарий конфликта:**
```
1. Я изменю ui_equity.js и коммичу
2. НЕ пересобираю USE_Optimizer_v6_built.html
3. На удалённой ветке бандл обновлён (CI или вручную)
4. На main в GitHub бандл тоже обновлён
5. При попытке мержа: две разные версии бандла → КОНФЛИКТ
```

**❌ Неправильно:**
```bash
# Изменил код
git add ui_equity.js
git commit -m "Fix equity rendering"
git push  # ← БЕЗ пересборки бандла!
```

**✅ Правильно:**
```bash
# Изменил код
git add ui_equity.js

# ПЕРЕД коммитом: пересобрать бандл
python build.py  # или npm run build, или другой скрипт

# Теперь коммитим с актуальным бандлом
git add USE_Optimizer_v6_built.html
git commit -m "Fix equity rendering + rebuild bundle"
git push
```

**Проверка**: Перед пушем убедись что бандл файлы изменены ДЕ (если были изменены исходники):
```bash
git status | grep "\.built\|\.min"  # должны быть в списке изменённых файлов
```

**Или добавить в .gitignore:**
```
USE_Optimizer_v6_built.html
bundle.min.js
```
(Если бандл генерируется CI/CD автоматически)

**Причина правила:**
Конфликты бандлов невозможно разрешить вручную (это бинарный код).
Если забыть пересобрать → потребуется merge conflict resolution, что замедляет delivery.

---

## 🔴 Запрещено: Module Load Order Dependencies в build.py

**Проблема**: Когда один модуль использует глобальные переменные из другого модуля,
но подставляется **ДО** этого модуля в build.py → переменные undefined при выполнении.

**Класс бага**: CLASS A (ПАТТЕРН) - архитектурная проблема, может повториться при добавлении новых модулей.

**Где**: build.py линии 102-125 (порядок подстановки модулей)

**Пример CLASS A:**
```
Баг #1: ui_detail.js использует _eqMAFilterShowBaseline, но подставляется ПЕРЕД ui_equity.js
Баг #2: (будущий) Новый модуль ui_future.js использует переменные из ui_feature.js, 
        но разработчик забыл поменять порядок в build.py
```

**Сценарий ошибки:**
```
build.py подставляет:
  1. /* ##DETAIL## */ → ui_detail.js выполняется
       ↓ пытается использовать _eqMAFilterShowBaseline
       ❌ ReferenceError: _eqMAFilterShowBaseline is not defined
       
  2. /* ##EQUITY## */ → ui_equity.js выполняется
       ↓ ТУТ определяется переменная (уже поздно!)
```

**❌ Неправильно:**
```python
# build.py порядок подстановки
for ph, content in [
    # ...
    ('/* ##DETAIL## */',   ui_detail),   # ← ПЕРЕД equity
    ('/* ##EQUITY## */',   ui_equity),   # ← ПОСЛЕ detail ← НЕПРАВИЛЬНО!
    # ...
]
```

**✅ Правильно:**
```python
# build.py порядок подстановки
for ph, content in [
    # ...
    ('/* ##EQUITY## */',   ui_equity),   # ← ПЕРЕД detail (определяет переменные)
    ('/* ##DETAIL## */',   ui_detail),   # ← ПОСЛЕ equity (использует переменные)
    # ...
]
```

**Правило**: Если модуль использует глобальные переменные из другого модуля,
то модуль-ИСТОЧНИК переменных ДОЛЖЕН быть подставлен **ПЕРВЫМ** в build.py.

**Проверка**: Перед пушем запустить:
```bash
bash .claude/scripts/dumb-checks.sh  # RULE 18: проверка зависимостей модулей
```

**Документация зависимостей** (обновить при добавлении нового модуля):
```
ui_equity.js:
  DEFINES: _eqMAFilterShowBaseline, _eqMAFilterShowBaseline, _eqMAFilterBaselineColor
  REQUIRED_BEFORE: ui_detail.js, ui_oos.js (используют эти переменные)

ui_oos.js:
  USES: _eqMAFilterShowBaseline (из ui_equity.js)
  REQUIRED_AFTER: ui_equity.js
```

**Результат нарушения**: ReferenceError при открытии экранов, которые зависят от этих переменных.

---

## 🔴 Запрещено: Module Load Order Dependencies в build.py

**Проблема**: Когда один модуль использует глобальные переменные из другого модуля,
но подставляется **ДО** этого модуля в build.py → переменные undefined при выполнении.

**Класс бага**: CLASS A (ПАТТЕРН) - архитектурная проблема, может повториться при добавлении новых модулей.

**Где**: build.py линии 102-125 (порядок подстановки модулей)

**Пример CLASS A:**
```
Баг #1: ui_detail.js использует _eqMAFilterShowBaseline, но подставляется ПЕРЕД ui_equity.js
Баг #2: (будущий) Новый модуль ui_future.js использует переменные из ui_feature.js, 
        но разработчик забыл поменять порядок в build.py
```

**Сценарий ошибки:**
```
build.py подставляет:
  1. /* ##DETAIL## */ → ui_detail.js выполняется
       ↓ пытается использовать _eqMAFilterShowBaseline
       ❌ ReferenceError: _eqMAFilterShowBaseline is not defined
       
  2. /* ##EQUITY## */ → ui_equity.js выполняется
       ↓ ТУТ определяется переменная (уже поздно!)
```

**❌ Неправильно:**
```python
# build.py порядок подстановки
for ph, content in [
    # ...
    ('/* ##DETAIL## */',   ui_detail),   # ← ПЕРЕД equity
    ('/* ##EQUITY## */',   ui_equity),   # ← ПОСЛЕ detail ← НЕПРАВИЛЬНО!
    # ...
]
```

**✅ Правильно:**
```python
# build.py порядок подстановки
for ph, content in [
    # ...
    ('/* ##EQUITY## */',   ui_equity),   # ← ПЕРЕД detail (определяет переменные)
    ('/* ##DETAIL## */',   ui_detail),   # ← ПОСЛЕ equity (использует переменные)
    # ...
]
```

**Правило**: Если модуль использует глобальные переменные из другого модуля,
то модуль-ИСТОЧНИК переменных ДОЛЖЕН быть подставлен **ПЕРВЫМ** в build.py.

**Проверка**: Перед пушем запустить:
```bash
bash .claude/scripts/dumb-checks.sh  # RULE 18: проверка зависимостей модулей
```

**Документация зависимостей** (обновить при добавлении нового модуля):
```
ui_equity.js:
  DEFINES: _eqMAFilterShowBaseline, _eqMAFilterShowBaseline, _eqMAFilterBaselineColor
  REQUIRED_BEFORE: ui_detail.js, ui_oos.js (используют эти переменные)

ui_oos.js:
  USES: _eqMAFilterShowBaseline (из ui_equity.js)
  REQUIRED_AFTER: ui_equity.js
```

**Результат нарушения**: ReferenceError при открытии экранов, которые зависят от этих переменных.


---

## 🔴 Запрещено: eqCalc может быть null в результатах (ПАТТЕРН #4: Zero-Equity Bug)

**Проблема**: Когда `useEqMA=false`, переменная `_eqCalc` остаётся `null` и сохраняется в результаты.
Это приводит к:
- Нулевым значениям equity в таблице (eq[0..5]: 0.0, 0.0, 0.0...)
- Невозможности рисовать графики (null данные)
- Путанице между `r.eq` (baseline) и `r.eqCalc` (filtered)

**Где**: opt.js (3 места: MC, TPE, Exhaustive)

**Класс**: CLASS A (ПАТТЕРН) - архитектурная ошибка, может повториться в новом коде

**Сценарий ошибки:**
```javascript
// opt.js (MC режим, линия 2234)
let _eqCalc = null;                    // инициализирована null

if (_effUseEqMA) {                      // ЕСЛИ useEqMA=true
  // ... рассчитываем baseline и MA
  _eqCalc = Array.from(_shadowEq);     // _eqCalc = данные
}

// ВТОРОЙ ПРОХОД
let r = backtest(...);
done++;

// ❌ ПРОБЛЕМА: Если useEqMA=false → _eqCalc остался null!
results.push({..., eqCalc:_eqCalc, ...});  // eqCalc: null ❌
```

**РЕЗУЛЬТАТ:**
```javascript
// В ui_oos.js при создании OOS результатов
new_eqCalc: (rNew && rNew.eqCalc) ? Array.from(rNew.eqCalc) : null

// Если rNew.eqCalc === null → new_eqCalc === null
// При рисовании графика в ui_equity.js:
const eqToDisplay = r.eqCalc || r._fullEq || r.eq;
// Если r.eqCalc === null → использует fallback (r.eq)
// Но это может привести к несинхронизированным данным!
```

**✅ РЕШЕНИЕ:**
```javascript
// После второго прохода: ВСЕГДА назначить _eqCalc
let _eqCalc = null;

if (_effUseEqMA) {
  // ... рассчитываем baseline
  _eqCalc = Array.from(_shadowEq);
}

let r = backtest(...);
done++;

// ##ZERO_EQUITY_FIX## КРИТИЧНО: eqCalc НИКОГДА не null!
if (!_eqCalc && r && r.eq && r.eq.length > 0) {
  _eqCalc = Array.from(r.eq);  // Используем результат second pass
}

// Теперь eqCalc ВСЕГДА defined ✓
results.push({..., eqCalc:_eqCalc, ...});
```

**Правило**: `_eqCalc` ДОЛЖНА быть инициализирована результатом `backtest()`, даже если `useEqMA=false`.
Нельзя оставлять `null` в сохраняемых результатах.

**Проверка**: RULE 19 в dumb-checks.sh ищет `##ZERO_EQUITY_FIX##` комментарий в opt.js (3 места).

**Статус ПАТТЕРНА #4:**
- **Название**: Zero-Equity Bug
- **STATUS**: CLOSED
- **Волны**: 1 (все 3 места исправлены одновременно)
- **Confidence**: 95%
- **Cases**: 3 (MC, TPE, Exhaustive)
- **Verification**: dumb-checks.sh RULE 19

---

## 🔴 Запрещено: 70% Data Truncation в OOS результатах (ПАТТЕРН #5)

**Проблема**: Когда сохраняются OOS результаты, данные обрезаются на 70% вместо полных 100%.
Это приводит к:
- Графикам которые показывают только 7000 баров вместо 10000
- Потере данных для рендеринга
- Несинхронизированным линиям на графике

**Где**: ui_oos.js (3+ места где создаются old_eq, old_eqCalc, old_eqCalcBaselineArr)

**Класс**: CLASS A (ПАТТЕРН) - архитектурная ошибка в логике OOS обработки

**Правильное разделение**:
```javascript
// ❌ НЕПРАВИЛЬНО: Обрезать в результатах
old_eq: Array.from(rOld.eq.slice(0, Math.round(0.70 * rOld.eq.length)))

// ✅ ПРАВИЛЬНО: Полные данные в результатах
old_eq: Array.from(rOld.eq)  // 100% данных!

// ✅ ПРАВИЛЬНО: 70% используется ТОЛЬКО для метрик
old_pnl: rOld_IS ? rOld_IS.pnl : null  // IS часть для PnL расчёта
old_bars: DATA ? DATA.length : null    // ПОЛНАЯ длина для шкалы графика
```

**Правило**: Сохраняемые данные (old_eq, old_eqCalc, baseline) должны быть ПОЛНЫЕ (100%).
Обрезка по warmup/overlap происходит в _drawOOSGraphicForResult при РЕНДЕРИНГЕ, не при создании результата.

**Проверка**: RULE 20 в dumb-checks.sh ищет `.slice(0, 0.70*)` без `##OOS_FULL_DATA_FIX##` маркера.

**Статус ПАТТЕРНА #5**:
- **Название**: 70% Data Truncation Pattern
- **STATUS**: OPEN (требуется обобщение и универсальное решение)
- **Cases**: 3+ (old_eq, old_eqCalc, old_eqCalcBaselineArr и возможно другие)
- **Protection**: RULE 20 (dumb-checks.sh)
