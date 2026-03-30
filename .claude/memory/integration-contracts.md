# Контракты интеграции между модулями

## backtest(cfg, data) → result

**Входная cfg должна содержать**:
```javascript
{
  // Параметры стратегии
  usePivot: boolean, pvL: number, pvR: number,
  useMA: boolean, maType: string, maP: number,
  atrPeriod: number, commission: number,
  // ... и все остальные из HC_NUMERIC_PARAMS

  // ОБЯЗАТЕЛЬНО: Индикаторные массивы (пересчитаны)
  maArr: Float64Array,      // если useMA=true
  confArr: Float64Array,    // если useConfirm=true
  atrArr: Float64Array,     // обычно всегда

  // НЕОБЯЗАТЕЛЬНО: OOS информация (для расчёта retention)
  _oos: { isPct: 70, forward: {...} }
}
```

**Выходной result**:
```javascript
{
  // Основные метрики
  pnl: number,              // % прибыли
  wr: number,               // % выигрышных сделок
  n: number,                // количество сделок
  dd: number,               // максимальный drawdown %
  avg: number,              // среднее PnL на сделку %
  dwr: number,              // разница WR long vs short
  pdd: number,              // PnL / DD ratio

  // Периоды 1 и 2 (если данные разделены)
  p1, p2: number,           // PnL первого и второго периодов %
  c1, c2: number,           // количество сделок в периодах
  w1, w2: number,           // WR в периодах %

  // Направления
  nL, pL, wrL: number,      // Long сделки: кол-во, PnL, WR
  nS, pS, wrS: number,      // Short сделки: кол-во, PnL, WR
  dwrLS: number,            // |wrL - wrS|

  // Кривая эквити (для графиков)
  eq: number[],             // массив cumulative PnL % по барам

  // null если ошибка в логике
}
```

**Если ошибка в cfg или данных**: возвращает `null` (не throw)

---

## _calcIndicators(cfg, data) → void (модифицирует cfg)

**Входная cfg**:
```javascript
{
  useMA: true, maType: 'WMA', maP: 35,
  useConfirm: false, confN: 100,
  useATR: true, atrPeriod: 13,
  // ... другие параметры
}
```

**После вызова cfg содержит**:
```javascript
{
  // ... все исходные параметры ПЛЮС:
  maArr: Float64Array,      // пересчитана из data и maType
  confArr: null,            // не вычисляется если useConfirm=false
  atrArr: Float64Array,     // всегда вычисляется
}
```

**Правило**: Массивы должны соответствовать cfg флагам:
- Если `useMA=false` → `maArr` не используется
- Если `useConfirm=true` → `confArr` обязательна
- `atrArr` всегда вычисляется (используется везде)

---

## _hcRunBacktest(cfg) → result

**Эта функция - обёртка над backtest(), которая**:
1. Вызывает `_calcIndicators(cfg, DATA)` автоматически
2. Использует кэш `_robSliceCache` для ускорения
3. Не пересчитывает `cfg._oos` (HC результаты без OOS split!)

**Входная cfg**: Может быть неполной (нет maArr, atrArr)
**Выходной result**: Полный, но БЕЗ поля `cfg._oos`

**Важно**: HC соседи генерируются через `mutate()` который удаляет `cfg._oos`

---

## _hcNeighbours.mutate(cfg) → cfg_new

**Что делает**:
```javascript
cfg_new = JSON.parse(JSON.stringify(cfg)); // глубокое копирование
cfg_new.pvL = cfg.pvL + 1; // изменяет один параметр
delete cfg_new._oos; // ← УДАЛЯЕТ OOS информацию!
return cfg_new;
```

**Следствие**: HC результаты в таблице показывают метрики только полного прогона (без IS/OOS split)

**Это нужно исправить**: Создать `_hcBuildOOS()` которая пересчитает split для соседей

---

## buildBtCfg(cfg, ind) → btCfg

**Входные**:
- `cfg`: Конфигурация из HC (частичная или полная)
- `ind`: Индикаторы пересчитанные `_calcIndicators()`

**Выходной btCfg**:
```javascript
{
  // Копирует все параметры из cfg
  usePivot: cfg.usePivot, pvL: cfg.pvL, pvR: cfg.pvR,
  // ...

  // Добавляет ссылки на массивы индикаторов
  maArr: ind.maArr,
  confArr: ind.confArr,
  atrArr: ind.atrArr,

  // Вычисляет специфичные значения (pivot levels и т.д.)
}
```

**Используется в**: `_hcRunBacktest()`, `runOpt()` внутри цикла

---

## showDetail(r) → открывает модаль

**Входной r** (результат из таблицы):
```javascript
{
  name: string,
  cfg: object,
  pnl, wr, n, dd, avg, dwr: number,
  p1, p2, c1, c2, w1, w2: number,
  sig, gt: number,              // статистическая значимость, GT-Score
  eq: number[],                 // equity curve

  // ОПЦИОНАЛЬНО (если был IS/OOS split):
  cfg._oos: {
    isPct: 70,
    forward: { pnl, wr, dd, ... } // OOS метрики
  }
}
```

**В модали показывает**:
1. Основные метрики (IS часть или полный прогон)
2. Если `cfg._oos.forward` !== null → вторая строка "TradingView · полный бэктест"
3. TV CSV сравнение (если загружен)
4. Параметры стратегии (JSON)

---

## _robustResult — глобальная переменная контекста

**Когда устанавливается**: При `showDetail(r)` или открытии HC модала
**Что содержит**: Текущий результат для которого открыта detail панель

**Использует**:
- `openOOSDiagnostic()` — берёт `_robustResult`
- `runRobustScoreFor(_robustResult)` — HC тест устойчивости
- `openHeatmapModal()` — параметры из `_robustResult.cfg`

---

## DATA, NEW_DATA, RESULTS — глобальные данные

**DATA**:
- Исходные данные загруженные пользователем
- Формат: `[{o, h, l, c, t}, ...]` (OHLCT + timestamp)
- Используется во всех бэктестах

**NEW_DATA**:
- Новые данные для OOS сравнения (загруженные отдельно)
- Тот же формат что DATA
- Пересчитываются все стратегии на NEW_DATA в `runOOSOnNewData()`

**RESULTS**:
- Массив найденных результатов оптимизации
- Каждый элемент — `{name, cfg, pnl, wr, ..., eq[]}`
- Отфильтровывается в `_visibleResults` по фильтрам

---

## Требование: Синхронизация 3 _cfg версий

Если добавляешь новый параметр:

1. Добавить в `_cfg` (MC mode, opt.js ~1909)
2. Добавить в `_cfg_tpe` (TPE mode, opt.js ~2265)
3. Добавить в `_cfg_ex` (Exhaustive, opt.js ~2847)

**Пример**: Добавили `newParam: 5`
```javascript
// opt.js ~1909 - MC
_cfg.newParam = 5;

// opt.js ~2265 - TPE
_cfg_tpe.newParam = 5;

// opt.js ~2847 - Ex
_cfg_ex.newParam = 5;
```

Если забыть → OOS split будет неправильным на одном из режимов.

**Проверка**: В `sync_claude_md.sh` добавить в dumb-checks
