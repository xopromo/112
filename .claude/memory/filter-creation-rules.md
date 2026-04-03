# Правила создания/редактирования/аудита фильтров, опций и точек входа/выхода

> Создано на основе опыта реализации MACD Direction с HTF и разбора архитектуры проекта.

---

## 1. Добавление нового фильтра (чеклист)

### 1.1. filter_registry.js

```javascript
{
  id:       'myfilter',              // уникальный kebab-case id
  flag:     'useMyFilter',           // соответствует полю cfg.useMyFilter
  blocksL:  (cfg, i) => !cfg.myArr || cfg.myArr[i-1] <= 0 || /* логика */,
  blocksS:  (cfg, i) => !cfg.myArr || cfg.myArr[i-1] <= 0 || /* логика */,
  nameLabel: (cfg) => `MyFilter(${cfg.myParam||10})`,  // для отображения в названии стратегии
},
```

**Критично**:
- `!cfg.myArr` в начале → fail-safe: нет данных = блокируем
- `cfg.myArr[i-1] <= 0` → warmup-защита (первые N баров индикатор = 0)
- `nameLabel` — опционально, для красивого имени в таблице результатов

### 1.2. shell.html — UI

Добавить в секцию фильтров (раздел `#panels`):

```html
<div class="cb">
  <label><input type="checkbox" id="f_myfilter"> My Filter</label>
  <div class="g2">
    <div class="field"><label>Param</label><input id="f_myp" value="10" data-tip="Описание параметра"></div>
    <!-- если есть HTF: -->
    <div class="field"><label>HTF ratio</label><input id="f_myhtf" value="1" data-tip="HTF множитель (1=нет HTF)"></div>
  </div>
</div>
```

Правила:
- Чекбокс id: `f_<filter_id>` (без `use`)
- Параметры id: `f_<short_name>` — чтобы отличать от entry-параметров (`e_*`)
- `data-tip` — обязательно, описывает что параметр делает

### 1.3. opt.js — чтение параметров (секция parseRange ~line 1581)

```javascript
// Параметры фильтра MY FILTER
const myParamArr = useMyFilter ? parseRange('f_myp') : [$n('f_myp') || 10];
const myHtfFArr  = useMyFilter ? parseRange('f_myhtf') : [1];
```

Правило: если фильтр не активен — читаем одиночное значение по умолчанию (не диапазон),
чтобы не тратить итерации оптимизатора на отключённый фильтр.

### 1.4. opt.js — _ipCombos (перебираемые параметры)

Если параметр участвует в комбинаторном переборе (inner loop):

```javascript
// В массиве _ipCombos:
['myParam', myParamArr.length ? myParamArr : [10]],
```

Если параметр — HTF ratio или другой "внешний" параметр — добавляем в `_mcDims`:

```javascript
// В массиве _mcDims:
(myHtfFArr.length ? myHtfFArr : [1]),  // ##MY_FILTER_HTF##
```

### 1.5. opt.js — _ipDef (дефолтные значения)

```javascript
window._ipDef = {
  ...
  myParam: 10,   // добавить в объект
};
```

### 1.6. opt.js — 3 основных цикла (MC, TPE, Exhaustive)

Для каждого из трёх режимов (одинаковый код — используй `replace_all: true` если MC и TPE одинаковы):

**Чтение из _ip:**
```javascript
const myParam = _ip.myParam ?? window._ipDef.myParam;
```

**Чтение dims (для HTF и аналогичных внешних параметров):**
```javascript
// MC:
const myHtfF = _dims[_d][_di[_d++]]; // ##MY_FILTER_HTF##
// TPE:
const myHtfF = _dims[_d][dimIndices[_d++]]; // ##MY_FILTER_HTF##
// Exhaustive: добавить цикл for:
for (const myHtfF of (myHtfFArr.length ? myHtfFArr : [1])) { // ##MY_FILTER_HTF##
```

**Вычисление индикатора (кэшированное):**
```javascript
let myArr = null;
if (useMyFilter) {
  const mk = 'MF_' + myParam + '_htf' + myHtfF;
  if (!myCache[mk]) myCache[mk] = myHtfF > 1
    ? calcHTFMyIndicator(DATA, myHtfF, myParam)
    : calcMyIndicator(myParam);
  myArr = myCache[mk];
}
```

**В btCfg (4 места в MC, 4 в TPE, 2 в Exhaustive — btCfg и _cfg_ex):**
```javascript
useMacdFilter,myArr,myParam,myFHtfRatio:myHtfF,
```

### 1.7. opt.js — _calcIndicators (~line 3860)

```javascript
// ── My Filter Indicator ────────────────────────────────────
let myArr = null;
if (cfg.useMyFilter) {
  const p = cfg.myParam || 10;
  const htf = cfg.myFHtfRatio || 1;
  myArr = htf > 1
    ? calcHTFMyIndicator(DATA, htf, p)
    : calcMyIndicator(p);
}
```

В return объекте:
```javascript
return {
  ...
  myArr,
};
```

### 1.8. opt.js — buildBtCfg (~line 4100)

```javascript
useMyFilter:    cfg.useMyFilter    || false,
myArr:          ind.myArr,
myParam:        cfg.myParam        || 10,
myFHtfRatio:    cfg.myFHtfRatio    || 1,
```

---

## 2. Добавление нового параметра оптимизатора (числовой диапазон)

> Например: новый параметр TP/SL, ATR период, и т.д.

1. Добавить в `_cfg` (MC ~line 1909), `_cfg_tpe` (~line 2265), `_cfg_ex` (~line 2847) — **все 3 места одновременно**
2. Добавить в `_ipCombos` или `_mcDims` в зависимости от типа
3. Добавить в `window._ipDef` (дефолт)
4. Добавить в `buildBtCfg`
5. Если нужен массив данных — добавить в `_calcIndicators`
6. Проверить: `grep -n "newParam" opt.js | wc -l` — должно быть ≥ 6 строк

---

## 3. HTF индикаторы — шаблон реализации

Все HTF индикаторы следуют одному паттерну (см. `calcHTFADX`, `calcHTFMACD`):

```javascript
function calcHTFMyIndicator(data, htfRatio, period) {
  const N = data.length;
  if (N < 2) return new Float64Array(N);
  
  // 1. Вычислить размер HTF периода в миллисекундах
  const baseInterval = Math.round(parseInt(data[1].t) - parseInt(data[0].t));
  const htfPeriod    = baseInterval * htfRatio;
  
  // 2. Группировать базовые бары в HTF бары
  const htfBars = [];
  let currentPeriodStart = -Infinity;
  let currentClose = null;
  let lastBaseBar  = -1;
  
  for (let i = 0; i < N; i++) {
    const t = parseInt(data[i].t);
    const periodStart = Math.floor(t / htfPeriod) * htfPeriod;
    if (periodStart !== currentPeriodStart) {
      if (lastBaseBar >= 0) {
        htfBars.push({ close: currentClose, lastBaseBar });
      }
      currentPeriodStart = periodStart;
    }
    currentClose = data[i].c;  // или H/L/C по необходимости
    lastBaseBar  = i;
  }
  if (lastBaseBar >= 0) htfBars.push({ close: currentClose, lastBaseBar });
  
  // 3. Вычислить индикатор на HTF барах
  const htfCloses = htfBars.map(b => b.close);
  const htfValues = calcMyIndicator_on_array(htfCloses, period);
  
  // 4. Применить [1]-shift назад на базовые бары (lookahead prevention)
  const result = new Float64Array(N);
  for (let h = 1; h < htfBars.length; h++) {
    result[htfBars[h].lastBaseBar] = htfValues[h - 1];
  }
  // Заполнить пробелы (carry forward)
  for (let i = 1; i < N; i++) {
    if (result[i] === 0 && result[i - 1] !== 0) result[i] = result[i - 1];
  }
  
  return result;
}
```

**Ключевое**: `[1]-shift` — значение на HTF баре i идёт на базовые бары периода i+1. Это устраняет lookahead.

---

## 4. Аудит фильтра (чеклист перед пушем)

```bash
# 1. Синтаксис
node -c opt.js && node -c filter_registry.js && node -c core.js

# 2. Количество мест с новым параметром (должно быть ≥ 6 для опций)
grep -n "myParam" opt.js | wc -l

# 3. Синхронность 3 версий _cfg
grep -n "myParam" opt.js | grep "_cfg"
# Должны быть строки с _cfg, _cfg_tpe, _cfg_ex

# 4. Тесты
node --test tests/unit/filters.test.cjs
node --test tests/unit/indicators.test.cjs

# 5. dumb-checks
bash .claude/scripts/dumb-checks.sh
```

---

## 5. Тесты для нового фильтра (обязательный минимум)

В `tests/unit/filters.test.cjs`:

```javascript
describe('myfilter — логика', () => {
  it('blocksL=true при медвежьих условиях', () => { ... });
  it('blocksL=false при бычьих условиях', () => { ... });
  it('blocksS=true при бычьих условиях', () => { ... });
  it('blocksS=false при медвежьих условиях', () => { ... });
  it('warmup: arr[i-1]=0 блокирует', () => { ... });
  it('без данных (null) → fail-safe блокирует', () => { ... });
});
```

В `tests/unit/indicators.test.cjs` (если есть HTF версия):

```javascript
describe('calcHTFMyIndicator', () => {
  it('htfRatio=1 → совпадает с базовым', () => { ... });
  it('htfRatio=2 → возвращает {line} нужной длины', () => { ... });
  it('htfRatio=2 → bar[0]=0 (нет предыдущего HTF периода)', () => { ... });
  it('htfRatio=2 → отличается от htfRatio=1', () => { ... });
  it('пустой массив → не падает', () => { ... });
});
```

---

## 6. Типичные ошибки

| Ошибка | Симптом | Исправление |
|--------|---------|-------------|
| Забыт `_cfg_ex` (Exhaustive) | OOS/Exhaustive дают другие результаты | Добавить в все 3 `_cfg_*` |
| Не закрыт `for(const htfF of ...)` в Exhaustive | Синтаксическая ошибка или неверный scope | Добавить `}` после закрытия `_ip` loop |
| `macdFLine` используется в btCfg без объявления в dims | `undefined` в бэктесте | Добавить в dims, прочитать в начале цикла |
| Нет warmup-защиты | Фильтр блокирует первые N баров из-за `arr[i-1]=0` | Добавить `arr[i-1] <= 0` в условие |
| HTF без [1]-shift | Lookahead = будущие данные используются | Сдвинуть на -1 HTF период |
