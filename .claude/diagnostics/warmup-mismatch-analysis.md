# ДИАГНОСТИКА: Warmup Synchronization Mismatch

## Проблема: OOS equity расходится с увеличивающимся смещением

## ROOT CAUSE IDENTIFIED: Двойная асимметрия в обработке warmup

### Проблема #1: eq_old и eq_new очищаются по РАЗНЫМ правилам

**Как создается eq_old (ui_oos.js:1442-1447):**
```javascript
old_eq: (() => {
  if (!rOld || !rOld.eq || !rOld.eq.length) return null;
  const isEndIdx = Math.round(0.70 * rOld.eq.length) || 0;
  // Копируем для безопасности - если rOld.eq переиспользуется, old_eq не пострадает
  return Array.from(rOld.eq.slice(0, Math.min(isEndIdx + 1, rOld.eq.length)));
})(),
```

- rOld.eq это ПОЛНЫЙ результат backtest на DATA (стартует от бара 0)
- Включает warmup бары (0-49) и actual trading (50+)
- Слайсится к 70% от длины, например bars 0-699 из 1000

**Как создается eq_new (ui_oos.js:1448-1454):**
```javascript
new_eq: (() => {
  // КРИТИЧНО: Сохраняем ПОЛНЫЙ eq (без обрезки по overlapIdx)
  // Обрезка будет в _drawOOSGraphicForResult по warmup + overlapIdx одновременно
  // чтобы гарантировать warmup синхронизация между eq_old и eq_new
  if (!rNew || !rNew.eq || !rNew.eq.length) return null;
  return Array.from(rNew.eq);  // ПОЛНЫЙ eq
})(),
```

- rNew.eq это ПОЛНЫЙ результат backtest на NEW_DATA (стартует от бара 0)
- Включает warmup бары (0-49) и actual trading (50+)
- Сохраняется БЕЗ обрезки!

**Как очищается при рисовании (ui_equity.js:231-262):**
```javascript
let newEqClean = eq_new;
let newBaselineClean = baseline_new;

if (newEqClean && newEqClean.length > 0) {
  const cfg = r.cfg || {};

  // Рассчитываем warmup ← РАССЧИТЫВАЕТСЯ ВТОРОЙ РАЗ!
  const maWarmup = cfg.useMA ? (cfg.maP || 20) : 0;
  const pivotWarmup = cfg.usePivot ? ((cfg.pvL || 5) + (cfg.pvR || 2) + 5) : 0;
  const atrWarmup = cfg.useATR ? (cfg.atrPeriod || 14) * 3 : 0;
  const eqMAWarmup = cfg.useEqMA ? (cfg.eqMALen || 20) : 0;
  const warmup = Math.max(maWarmup, pivotWarmup, atrWarmup, eqMAWarmup, 1);

  // ГЛАВНОЕ: обрезаем по МАКСИМУМУ из (overlapIdx, warmup)
  const minCleanIdx = Math.max(overlapIdx, warmup);

  if (minCleanIdx < newEqClean.length) {
    // Вычитаем значение при окончании warmup из ВСЕХ данных
    const warmupValue = newEqClean[minCleanIdx];
    newEqClean = newEqClean.map(v => v - warmupValue);

    // ...baseline also cleaned...
  }

  // Теперь обрезаем ОБЕ по minCleanIdx
  newEqClean = newEqClean.slice(minCleanIdx);
  if (newBaselineClean) newBaselineClean = newBaselineClean.slice(minCleanIdx);
}
```

**eq_old НЕ очищается в ui_equity.js!**

Остается как есть из ui_oos.js - просто слайс первых 70%.

---

## Проблема #2: Разные warmup значения между рассчетом метрик и рисованием

**Рассчет new_pnl (ui_oos.js:1403-1421):**
```javascript
// Чистые метрики нового периода: только бары/сделки после overlapIdx
if (rNew && rNew.eq && rNew.eq.length > 0) {
  const _eq  = rNew.eq;
  const _oi  = Math.min(_overlapIdx, _eq.length - 1);  // ← ИСПОЛЬЗУЕТСЯ ТОЛЬКО overlapIdx
  const _eqS = _eq.slice(_oi);                         // equity только нового периода

  new_pnl    = _eq[_eq.length - 1] - (_eq[_oi] || 0);  // ← базовое значение ТОЛЬКО overlapIdx
  // ... расчет других метрик
}
```

- new_pnl рассчитывается как разница между концом и точкой overlapIdx
- **НЕ учитывает warmup!**

**Рисование eq_new (ui_equity.js:246):**
```javascript
const minCleanIdx = Math.max(overlapIdx, warmup);
// Слайсится и очищается по этому индексу
newEqClean = newEqClean.slice(minCleanIdx);
```

- При рисовании new_eq обрезается по Math.max(overlapIdx, warmup)
- **Если warmup > overlapIdx, eq_new теряет первые (warmup - overlapIdx) баров!**

**РЕЗУЛЬТАТ: Асимметрия**

- Метрика new_pnl рассчитана как разница от overlapIdx
- График drawn от Math.max(overlapIdx, warmup)
- **Если warmup > overlapIdx → график отстает в метриках!**

---

## Проблема #3: eq_old не синхронизирована с eq_new по warmup

В core.js backtest() начинается с:
```javascript
const start = cfg.start || 50;  // line 647
for (let i = start; i < N; i++) {  // line 655
```

Значит equity array eq имеет:
- Bars 0-49: warmup (eq[i] = 0 или близко к 0)
- Bars 50+: actual trading результаты

Когда рассчитываем на DATA (длина 1000):
- rOld.eq length = 1000, warmup до бара 50
- eq_old берется как rOld.eq.slice(0, 700)
- eq_old.length = 700, warmup до бара 50

Когда рассчитываем на NEW_DATA (длина 500):
- rNew.eq length = 500, warmup до бара 50
- eq_new хранится как полный массив (длина 500)
- При рисовании очищается по minCleanIdx = Math.max(overlapIdx, warmup)
- Если overlapIdx = 0, warmup = 30 → eq_new обрезается к bars 30-500 (470 элементов)
- **Но eq_old остается bars 0-699 с warmupом в bars 0-49!**

При конкатенации (ui_equity.js:266):
```javascript
const lastOld = eq_old[eq_old.length - 1];  // последнее значение старого периода
const combined = [...eq_old, ...newEqClean.map(v => v + lastOld)];
```

**ПРОБЛЕМА:** 

eq_old и newEqClean имеют РАЗНЫЕ относительные точки отсчета:
- eq_old[0] = первый бар DATA, содержит warmup (eq примерно 0)
- eq_old[50] = первый actual trade бар, начинает расти
- newEqClean[0] = бар при minCleanIdx (если warmup=30, это бар 30 NEW_DATA), очищен и обнулен
- newEqClean не содержит информации о первых 30 барах NEW_DATA

При conc tenation они выравниваются только по lastOld, но не по warmup точкам!

---

## Конкретный пример где видна ошибка:

Сценарий:
- DATA: 1000 баров
- warmup = 30 (макс из MA, Pivot, ATR, EqMA параметров)
- overlapIdx = 0 (no overlap)
- NEW_DATA: 500 баров

**eq_old создание:**
```
rOld.eq: bars 0-999 [0, 0, ..., 0 (warmup 0-29), 5, 10, 15, ... 700 (bar 999)]
old_eq: bars 0-699 [0, 0, ..., 0 (warmup 0-29), 5, 10, 15, ... 700 (bar 699)]
```

**eq_new создание:**
```
rNew.eq: bars 0-499 [0, 0, ..., 0 (warmup 0-29), 3, 8, 12, ... 650 (bar 499)]
new_eq: bars 0-499 (полный, без изменений)
```

**При рисовании:**
```
minCleanIdx = Math.max(0, 30) = 30

newEqClean очищается:
  - subtract newEqClean[30] = 3 from all values
  - newEqClean = [0-3, 0-3, ..., 0-3 (warmup 0-29), 0 (bar 30), 5, 9, ... 647 (bar 499)]
  - then slice(30) = [0, 5, 9, ..., 647]

final combined:
  - [...eq_old (bars 0-699), ...newEqClean (bars 30-499 as indexes 0-469)]
  - lastOld = eq_old[699] = 700
  - combined = [0, 0, ..., 700 (bars 0-699), 700+0, 700+5, 700+9, ... 700+647 (remaining 470)]
```

**ВИДИМЫЙ РЕЗУЛЬТАТ:**

На графике:
- Orange line (eq_old): slowly rises от 0 до 700 за 700 баров
- Blue line (combined): jumps to 700 at bar 700, then continues
  + eq_new starts from bar 30 относительно своего начала
  + но графически это выглядит как скачок в среднюю часть

**ПЛЮС асимметрия в метриках:**
- new_pnl рассчитана как (eq_new[499] - eq_new[0]) = (650 - 0) = 650
- но на графике shown как newEqClean = только последние 470 баров!
- Метрика и график НЕ СОГЛАСУЮТСЯ!

---

## ЧТО ПРОИЗОЙДЕТ ЕСЛИ ДИВЕРГИРЫ ПОХОЖИ:

Если IS и OOS торговля ИДЕНТИЧНЫ (одинаковые входы/выходы):
- eq_old должна расти на ~700 за 700 баров
- eq_new должна расти на ~650 за 500 баров

Средний прирыльь в день:
- eq_old: 700 / 700 = 1.0
- eq_new: 650 / 500 = 1.3

На графике это видно как eq_new "растет быстрее" потому что:
1. Она очищена от warmup (теряет первые 30 баров)
2. Она рассчитана на более коротком периоде (может быть более волатильна)
3. Метрики и график НЕ СИНХРОНИЗИРОВАНЫ

Когда patterns похожи, это выглядит как "blue line diverges with increasing offset" потому что:
- Обе растут похоже в процентах
- Но одна очищена от warmup, другая нет
- Это создает визуальное смещение которое УВЕЛИЧИВАЕТСЯ при росте

---

## РЕШЕНИЕ:

### Вариант 1 (Правильный, но требует изменения ui_oos.js):

Очищать eq_old и eq_new в ui_oos.js ДО сохранения:

```javascript
new_eq: (() => {
  if (!rNew || !rNew.eq || !rNew.eq.length) return null;
  
  // Вычисляем warmup прямо здесь
  const cfg = r.cfg || {};
  const maWarmup = cfg.useMA ? (cfg.maP || 20) : 0;
  const pivotWarmup = cfg.usePivot ? ((cfg.pvL || 5) + (cfg.pvR || 2) + 5) : 0;
  const atrWarmup = cfg.useATR ? (cfg.atrPeriod || 14) * 3 : 0;
  const eqMAWarmup = cfg.useEqMA ? (cfg.eqMALen || 20) : 0;
  const warmup = Math.max(maWarmup, pivotWarmup, atrWarmup, eqMAWarmup, 1);
  
  // Очищаем new_eq здесь
  let cleanedEq = Array.from(rNew.eq);
  const cleanIdx = Math.max(_overlapIdx, warmup);
  if (cleanIdx < cleanedEq.length) {
    const startVal = cleanedEq[cleanIdx];
    cleanedEq = cleanedEq.slice(cleanIdx).map(v => v - startVal);
  }
  
  return cleanedEq;
})(),

old_eq: (() => {
  if (!rOld || !rOld.eq || !rOld.eq.length) return null;
  const isEndIdx = Math.round(0.70 * rOld.eq.length) || 0;
  
  // НОВОЕ: Синхронизируем warmup с eq_new
  const cfg = r.cfg || {};
  const maWarmup = cfg.useMA ? (cfg.maP || 20) : 0;
  const pivotWarmup = cfg.usePivot ? ((cfg.pvL || 5) + (cfg.pvR || 2) + 5) : 0;
  const atrWarmup = cfg.useATR ? (cfg.atrPeriod || 14) * 3 : 0;
  const eqMAWarmup = cfg.useEqMA ? (cfg.eqMALen || 20) : 0;
  const warmup = Math.max(maWarmup, pivotWarmup, atrWarmup, eqMAWarmup, 1);
  
  let oldEq = Array.from(rOld.eq.slice(0, Math.min(isEndIdx + 1, rOld.eq.length)));
  
  // Очищаем old_eq по ТОМ ЖЕ warmup что и new_eq
  if (warmup < oldEq.length) {
    const startVal = oldEq[warmup];
    oldEq = oldEq.slice(warmup).map(v => v - startVal);
  }
  
  return oldEq;
})(),
```

Затем в ui_equity.js можно просто конкатенировать без дополнительной очистки:

```javascript
const combined = [...eq_old, ...newEqClean.map(v => v + (eq_old[eq_old.length - 1] ?? 0))];
```

### Вариант 2 (Текущий, но с фиксом):

Хранить warmup в результате и использовать при рисовании:

```javascript
_warmup: warmup,  // сохранить warmup
_overlapIdx: _overlapIdx,  // сохранить overlapIdx
```

Затем в ui_equity.js использовать сохраненные значения вместо рассчета.

---

## Статус:
- ✅ Root cause identified: warmup desynchronization + double-processing
- ⚠️ Требуется фиксить в ui_oos.js (предпочтительнее вариант 1)
- ⚠️ ui_equity.js должна использовать сохраненные значения, не рассчитывать заново
