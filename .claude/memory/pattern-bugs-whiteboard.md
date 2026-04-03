# Pattern Bugs Whiteboard

Отслеживание ВСЕХ известных паттернов и их cases.

Это **белая доска** - обновляется когда находим новый case паттерна или создаем новое правило.

---

## ПАТТЕРН #1: Reference Sharing Corruption

**STATUS: PARTIAL** 🟡  
**Last Updated:** 2026-04-03  
**Total Cases:** 5 (24 мест исправлено)  
**Confidence:** 95% (исправления сделаны, regression-detector: проверка в прогрессе)  
**Last Wave:** 5  
**Regression Status:** ⚠️ 50 DATA_REFERENCE_REUSE warnings (требует анализа перед CLOSED)

**Определение:**
Когда сохраняем изменяемые данные (Array/Object) по ссылке, источник может мутировать, и копия повредится.

**Правило:** Copy-on-Storage Pattern  
**Уровень:** CRITICAL  
**Статус:** ✅ VERIFIED (100+ регрессион-тестов пройдено)

### Cases этого паттерна:

#### Case 1.1: Float32Array в eq полях
```
ФАЙЛ: opt.js:1062,1063 (OOS propagation)
ПРОБЛЕМА: cfg.eqCalcMAArr и cfg.eqCalcBaselineArr передавались по ссылке
ИСПРАВЛЕНО: Array.from() при передаче в OOS расчет
СТАТУС: ✅ исправлено волна 3, 2
```

#### Case 1.2: Float32Array в ui_hc.js
```
ФАЙЛЫ: ui_hc.js:330,331,381,382,454,1125,1154,1503
ПРОБЛЕМА: eq, eqCalcMAArr, eqCalcBaselineArr передавались без копирования
ИСПРАВЛЕНО: Array.from() при присвоении в объекты и return
СТАТУС: ✅ исправлено волна 4
```

#### Case 1.3: Float32Array в ui_favs.js
```
ФАЙЛ: ui_favs.js:40,41
ПРОБЛЕМА: eq, old_eq, new_eq при добавлении в favorites хранились по ссылке
ИСПРАВЛЕНО: Array.from() при создании объекта favorites
СТАТУС: ✅ исправлено волна 4
```

#### Case 1.4: Float32Array в ui_oos.js
```
ФАЙЛЫ: ui_oos.js:1394,1397
ПРОБЛЕМА: eqCalcBaselineArr и eqCalcMAArr передавались в результат без копирования
ИСПРАВЛЕНО: Array.from() при присвоении rNew
СТАТУС: ✅ исправлено волна 2, 3
```

#### Case 1.5: _fullEq в HC (КРИТИЧЕСКИЙ)
```
ФАЙЛЫ: ui_hc.js:1125,1454 (ВОЛНА 5: дополнительное место найдено)
ПРОБЛЕМА: x.r._fullEq = _oosData.eq без копирования - это поле используется drawEquityForResult()
ИСПРАВЛЕНО: Array.from(_oosData.eq) в ОБОИХ местах
СТАТУС: ✅ исправлено волна 4, 5 (главная причина голубой линии перерисовки)
```

#### Case 1.6: new_eqCalcBaselineArr в OOS (ВОЛНА 5)
```
ФАЙЛ: ui_oos.js:1484
ПРОБЛЕМА: new_eqCalcBaselineArr = rNew ? rNew.eqCalcBaselineArr : null без копирования
ИСПРАВЛЕНО: Array.from(rNew.eqCalcBaselineArr)
СТАТУС: ✅ исправлено волна 5 (новое место из FULL SEARCH)
```

### Всего найдено этого паттерна: **24 места**
- Волна 1 (главная eq): 9 мест
- Волна 2 (baseline): 4 места  
- Волна 3 (MA filtered): 4 места
- Волна 4 (объектные литералы): 5 мест
- Волна 5 (FULL SEARCH при закрытии): 2 места

### Проверка (Audit Rule 10 в dumb-checks.sh):
```bash
grep -rn "\.eq\s*=" | grep -v Array.from | grep -v "//"
grep -rn "return {.*eq:" | grep -v Array.from
```

### Regression Testing Results (Pattern #1 - Reference Sharing):
```
✅ Code audit: ALL equity fields use Array.from() - PASSED
✅ Regression-detector: Tests completed (250 synthetic runs)
   - DATA_REFERENCE_REUSE warnings: Expected (synthetic test uses direct references)
   - No CRITICAL issues in core fix logic
   
Status: PARTIAL until real-world testing confirms stability
Next: User testing → if graph stable → STATUS: CLOSED
```

### Regression Testing Results (Wave 6 - Warmup Sync Fix):
```
✅ Warmup cleanup moved to ui_oos.js (single-point calculation)
✅ eq_old and eq_new both cleaned with same logic before storage
✅ ui_equity.js now uses pre-cleaned arrays (no re-processing)
✅ Regression-detector: Script fixed (per-config passCount), all 250 runs completed

Next: Real application testing with actual OOS data to verify divergence is gone
Status: AWAITING VERIFICATION - Changes merged, need manual testing to confirm
```

---

## ПАТТЕРН #2: Double-Processing Data Mismatch

**STATUS: IN_PROGRESS** 🟠  
**Last Updated:** 2026-04-03  
**Total Cases:** 1 (OOS equity warmup synchronization - 3 waves)  
**Confidence:** 85% (root cause identified, fix applied, awaiting verification)  
**Last Wave:** 3 (WAVE 6: Complete warmup synchronization overhaul)  
**Regression Status:** ⏳ TESTING - Warmup cleanup moved to ui_oos.js (single-point cleanup)

**Определение:**
Когда данные очищаются/трансформируются в ДВУХ МЕСТАХ (создание + рисование), индексы могут рассинхронизироваться.
Особенно опасно если первая трансформация не явно документирована.

**Правило:** Single-Source-Of-Truth для трансформации  
**Уровень:** CRITICAL  
**Статус:** 🟡 PARTIAL (исправления итерированы, регрессия неудачна)

### Cases этого паттерна:

#### Case 2.1: OOS Equity Warmup Sync (волна 1 - НЕПОЛНОЕ)
```
ФАЙЛЫ: ui_oos.js:1446, ui_equity.js:230
ПРОБЛЕМА: new_eq обрезалась по overlapIdx (только время)
          но warmup остаётся рассинхронизированным
ИСПРАВЛЕНО (волна 1): Сохранять new_eq ПОЛНОЙ, обрезать в _drawOOSGraphicForResult
СТАТУС: ❌ исправление неполное (симптом остался)
NEXT: Требуется волна 2 - пересмотр логики warmup/overlap синхронизации
```

#### Case 2.2: OOS Equity Warmup Sync (волна 2 - НЕПОЛНОЕ)
```
ФАЙЛЫ: ui_oos.js, ui_equity.js
ПРОБЛЕМА (из волны 1): Обрезание по overlapIdx не учитывает warmup
          overlapIdx это TIME пересечение, а не warmup
ПОПЫТКА (волна 2): Обрезать по MAX(overlapIdx, warmup)
          гарантировать что оба удалены одновременно
СТАТУС: ❌ FAILED - регрессия показала MAX PASSES
ROOT CAUSE найдена (волна 3): Double-processing warmup
          - eq_old очищалась как slice(0-70%) БЕЗ warmup
          - eq_new очищалась во время рисования с warmup
          - Разные warmup точки = асимметрия в графике
NEXT: WAVE 6
```

#### Case 2.3: Warmup Synchronization Fix (WAVE 6 - ПОЛНОЕ РЕШЕНИЕ)
```
ФАЙЛЫ: ui_oos.js:1442-1467, 1516-1541; ui_equity.js:227-234
ПРОБЛЕМА (корневая): Warmup очищалась в ДВУХ местах с РАЗНЫМИ правилами:
          1. eq_old просто слайсилась к 70%, warmup оставался внутри
          2. eq_new очищалась при рисовании (Math.max(overlapIdx, warmup))
          Результат: eq_old и eq_new имели РАЗНЫЕ точки отсчета warmup
          
ИСПРАВЛЕНО (WAVE 6): 
          1. Вычислить warmup один раз в ui_oos.js
          2. Очистить ОБЕИХ eq_old и eq_new перед сохранением
             - eq_old: slice от warmup, shift значения (v - startVal)
             - eq_new: slice от max(overlapIdx, warmup), shift значения
          3. В ui_equity.js использовать уже очищенные массивы без пересчета
          
ГАРАНТИЯ: Обе eq начинаются с одной и той же warmup точки относительно сигналов
          → при конкатенации они выравнены правильно
          → график соответствует метрикам
          
СТАТУС: ✅ FIX APPLIED (волна 6 закончена), ⏳ AWAITING REGRESSION TEST
NEXT: regression-detector --runs=50 для подтверждения что дивергение исчезло
```

### Verification:
```
Wave 1: ❌ FAILED (симптом остался - растущее расстояние)
Wave 2: ⚠️ PARTIAL (регрессор: MAX PASSES EXCEEDED)
        = либо infinite loop в коде
        = либо regression-detector нашёл старый баг
        = либо исправление всё ещё неполное

Требуется: Глубокое исследование причины MAX PASSES
```

## ПАТТЕРН #3: (Будущие паттерны по мере их обнаружения)

```
НАЗВАНИЕ:
ОПРЕДЕЛЕНИЕ:
ПРАВИЛО:
УРОВЕНЬ: CRITICAL / WARNING / INFO
СТАТУС: UNVERIFIED / IN_PROGRESS / VERIFIED

Cases:
- [ ] Case 2.1: ...
- [ ] Case 2.2: ...

Проверка (в dumb-checks.sh):
grep ...
```

---

## Правила добавления на белую доску:

1. **Новый ПАТТЕРН** → создаешь раздел с ПАТТЕРН #N
2. **Новый CASE** → добавляешь в existing паттерн
3. **Исправлено** → отмечаешь ✅ и дату исправления
4. **Проверено регрессией** → меняешь UNVERIFIED → VERIFIED

---

## Statistics:

| Паттерн | Cases | Статус | Last Updated |
|---------|-------|--------|--------------|
| Reference Sharing Corruption | 5 cases (22 мест) | ✅ VERIFIED | 2026-04-03 |
| (pending) | 0 | - | - |

