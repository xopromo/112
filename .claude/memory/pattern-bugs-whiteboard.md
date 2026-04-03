# Pattern Bugs Whiteboard

Отслеживание ВСЕХ известных паттернов и их cases.

Это **белая доска** - обновляется когда находим новый case паттерна или создаем новое правило.

---

## ПАТТЕРН #1: Reference Sharing Corruption

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
ФАЙЛ: ui_hc.js:1125
ПРОБЛЕМА: x.r._fullEq = _oosData.eq без копирования - это поле используется drawEquityForResult()
ИСПРАВЛЕНО: Array.from(_oosData.eq)
СТАТУС: ✅ исправлено волна 4 (главная причина зеленой линии)
```

### Всего найдено этого паттерна: **22 места**
- Волна 1 (главная eq): 9 мест
- Волна 2 (baseline): 4 места  
- Волна 3 (MA filtered): 4 места
- Волна 4 (объектные литералы): 5 мест

### Проверка (Audit Rule 10 в dumb-checks.sh):
```bash
grep -rn "\.eq\s*=" | grep -v Array.from | grep -v "//"
grep -rn "return {.*eq:" | grep -v Array.from
```

---

## ПАТТЕРН #2: (Будущие паттерны по мере их обнаружения)

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

