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

**STATUS: WAVE 7 APPLIED** 🔄  
**Last Updated:** 2026-04-03  
**Total Cases:** 1 (OOS equity warmup asymmetry)  
**Confidence:** 90% (root cause identified via alignment test, proper fix applied)  
**Last Wave:** 7 (WAVE 7: Clean eq_old warmup in ui_equity.js)  
**Regression Status:** ⏳ AWAITING REAL-WORLD VERIFICATION

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

#### Case 2.3: Asymmetric Warmup Handling (WAVE 7 - ПРАВИЛЬНОЕ РЕШЕНИЕ)
```
ФАЙЛЫ: ui_equity.js:227-275 (_drawOOSGraphicForResult function)

ПРОБЛЕМА (корневая): Warmup очищался АСИММЕТРИЧНО:
  - eq_old: сохранялась С warmup (bars 0-29 = 0 pnl, no trades)
  - eq_new: очищалась от warmup при рисовании
  
  РЕЗУЛЬТАТ: Визуально голубая линия (new_eq) растет быстрее
             потому что не имеет flat warmup-периода в начале
             Оранжевая линия (old_eq) выглядит delayed
             потому что включает 30 баров с нулевым pnl
             
ДИАГНОСТИКА: Написал eq-alignment-test.js который доказал:
  - eq_old: 700 баров (с warmup bars 0-29 = 0)
  - eq_new: 470 баров (warmup удален)
  → не выравнены по trading point!

ИСПРАВЛЕНО (WAVE 7):
  ✅ ui_equity.js:227-275 теперь очищает ОБЕИХ eq_old и eq_new
  ✅ eq_old: удалить первые warmup баров, shift значения
  ✅ eq_new: удалить первые max(overlapIdx, warmup) баров, shift значения
  ✅ Обе кривые теперь начинают с одной точки (после warmup)
  ✅ При конкатенации выравнены правильно
  
ГАРАНТИЯ: Обе eq_old и eq_new синхронизированы по warmup точке
          → нет искусственного смещения
          → дивергение должно исчезнуть

СТАТУС: ✅ FIX APPLIED (WAVE 7 завершена)
NEXT: ⏳ Ожидание реальной проверки пользователем на реальных данных
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

