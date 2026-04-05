# OOS Equity Rendering Specification (ЭТАЛОН)

## 📋 Полная схема потока данных для OOS графика

### ЭТАП 1: Создание OOS результата (ui_oos.js:1300-1650)

**Входные данные:**
- `rOld` = результат оптимизации на старых данных (10000 баров)
- `rNew` = результат оптимизации на новых данных (N баров)
- `DATA` = старые данные (10000 баров)
- `NEW_DATA` = новые данные (N баров)

**Что должно быть в OOS результате:**
```javascript
{
  name: "...",
  old_eq:    Array.from(rOld.eq),           // ← ПОЛНАЯ эквити старых данных (10000 баров!)
  new_eq:    Array.from(rNew.eq),           // ← ПОЛНАЯ эквити новых данных (N баров)
  old_eqCalc: oldEqCalcFiltered,            // ← ПОЛНАЯ отфильтрованная (если useEqMA=true, иначе null)
  new_eqCalc: newEqCalcFiltered,            // ← ПОЛНАЯ отфильтрованная (если useEqMA=true, иначе null)
  
  old_eqCalcBaselineArr: oldBaseline,       // ← ПОЛНАЯ baseline старых (10000 баров)
  new_eqCalcBaselineArr: newBaseline,       // ← ПОЛНАЯ baseline новых (N баров)
  
  old_bars:  DATA.length,                   // ← 10000 (ПОЛНАЯ длина, для отображения!)
  new_bars:  NEW_DATA.length,               // ← N баров
  
  // Метрики для таблицы (используют IS часть 70%):
  old_pnl:   rOld_IS.pnl,                   // ← только IS 70%
  old_dd:    rOld_IS.dd,
  // ...
}
```

**⚠️ КРИТИЧНЫЕ ОШИБКИ (которые уже были найдены):**

| Линия | ❌ БЫЛО | ✅ ДОЛЖНО БЫТЬ | ПОСЛЕДСТВИЕ |
|-------|--------|---------------|------------|
| 1542-1548 | `rOld.eq.slice(0, 0.70*length)` | `Array.from(rOld.eq)` | Теряются данные 70% → 100% не видно |
| 1569-1570 | `rOld.eqCalc.slice(0, 0.70*length)` | `Array.from(rOld.eqCalc)` | Теряются фильтрованные данные |
| 1617-1618 | `rOld.eqCalcBaselineArr.slice(0, 0.70*length)` | `Array.from(rOld.eqCalcBaselineArr)` | Baseline обрезается |
| 1593 | `old_bars: Math.round(DATA.length * 0.70)` | `old_bars: DATA.length` | Шкала графика показывает 7000 вместо 10000 |

---

### ЭТАП 2: Рендеринг OOS графика (ui_equity.js:321-684)

**Функция:** `_drawOOSGraphicForResult(r)`

**Входные данные из результата:**
```javascript
const eq_old = r.old_eqCalc || r.old_eq;           // ← зелёная линия (с фильтром или базовая)
const eq_new = r.new_eqCalc || r.new_eq;           // ← зелёная линия (OOS)

const baseline_old = r.old_eqCalcBaselineArr || r.old_eq;  // ← оранжевая линия (без фильтра)
const baseline_new = r.new_eqCalcBaselineArr || r.new_eq;  // ← оранжевая линия (OOS)
```

**Обработка данных:**

| Шаг | Название | Что происходит | Для чего |
|-----|----------|----------------|----------|
| 1 | Определение пересечения | Ищет `overlapIdx` - где старые данные переходят в новые | Для синхронизации по времени |
| 2 | Очистка от warmup | Удаляет первые warmup баров (MA period, ATR period и т.д.) | Чтобы обе линии начинались из одного состояния |
| 3 | Нормализация | Вычитает startValue чтобы обе линии начинались с нуля | Для визуального совпадения в точке разделения |
| 4 | Конкатенация | Соединяет: `[...oldEqClean, ...newEqClean]` | Создаёт непрерывную линию |

**Логика после очистки (линия 384-430):**
```javascript
let oldEqClean = eq_old;      // 10000 баров
let newEqClean = eq_new;      // N баров

if (oldEqClean && oldEqClean.length > warmup) {
  const startValOld = oldEqClean[warmup];
  oldEqClean = oldEqClean.slice(warmup);  // ← ОБРЕЗКА: 10000 - warmup = 9980 баров
  // ...
}

const minCleanIdx = Math.max(overlapIdx, warmup);

if (newEqClean) {
  const warmupValue = newEqClean[minCleanIdx];
  newEqClean = newEqClean.slice(minCleanIdx);  // ← ОБРЕЗКА: удаляет первые N баров
  // ...
}

const combined = [...oldEqClean, ...newEqClean];  // ← ФИНАЛЬНЫЙ: (9980 + (N - minCleanIdx)) баров
```

**Результат на графике:**
```
Точка разделения (вертикальная линия):
  ← IS (70%) | OOS (30%) →

Зелёная линия (eq):
  Показывает от первого бара (после warmup) до последнего

Оранжевая линия (baseline):
  Показывает БЕЗ MA фильтра (то же что зелёная если useEqMA=false)
```

---

## 🎯 ТЕКУЩИЕ ПРОБЛЕМЫ И РЕШЕНИЯ

### Проблема 1: old_eq содержит только 70% данных
**Файл:** `ui_oos.js:1542-1548`

**❌ БЫЛО:**
```javascript
old_eq: (() => {
  const isEndIdx = Math.round(0.70 * rOld.eq.length) || 0;
  return Array.from(rOld.eq.slice(0, Math.min(isEndIdx + 1, rOld.eq.length)));
})(),
```

**✅ ДОЛЖНО БЫТЬ:**
```javascript
old_eq: Array.from(rOld.eq),  // ПОЛНЫЕ 10000 баров!
```

**ПОСЛЕДСТВИЕ:** График показывает только 7000 баров вместо 10000

---

### Проблема 2: old_eqCalc содержит только 70% фильтрованных данных
**Файл:** `ui_oos.js:1567-1571`

**❌ БЫЛО:**
```javascript
old_eqCalc: (() => {
  if (!rOld || !rOld.eqCalc) return null;
  const isEndIdx = Math.round(0.70 * rOld.eqCalc.length) || 0;
  return Array.from(rOld.eqCalc.slice(0, Math.min(isEndIdx + 1, rOld.eqCalc.length)));
})(),
```

**✅ ДОЛЖНО БЫТЬ:**
```javascript
old_eqCalc: (rOld && rOld.eqCalc) ? Array.from(rOld.eqCalc) : null,  // ПОЛНЫЕ данные!
```

**ПОСЛЕДСТВИЕ:** Зелёная линия показывает только фильтрованные 70%

---

### Проблема 3: baseline содержит только 70%
**Файл:** `ui_oos.js:1605-1620`

**❌ БЫЛО:**
```javascript
old_eqCalcBaselineArr: (() => {
  if (!rOld || !rOld.eqCalcBaselineArr) return null;
  const isEndIdx = Math.round(0.70 * rOld.eqCalcBaselineArr.length) || 0;
  return Array.from(rOld.eqCalcBaselineArr.slice(0, isEndIdx + 1));
})(),
```

**✅ ДОЛЖНО БЫТЬ:**
```javascript
old_eqCalcBaselineArr: (rOld && rOld.eqCalcBaselineArr) ? Array.from(rOld.eqCalcBaselineArr) : null,  // ПОЛНЫЕ!
```

**ПОСЛЕДСТВИЕ:** Оранжевая линия показывает только 70%

---

### Проблема 4: old_bars показывает 70% для шкалы графика
**Файл:** `ui_oos.js:1593`

**❌ БЫЛО:**
```javascript
old_bars: DATA ? Math.round(DATA.length * 0.70) : null,
```

**✅ ДОЛЖНО БЫТЬ:**
```javascript
old_bars: DATA ? DATA.length : null,  // ПОЛНАЯ длина!
```

**ПОСЛЕДСТВИЕ:** Шкала графика показывает 7000 вместо 10000

---

## 📊 ТАБЛИЦА СООТВЕТСТВИЯ (для проверки)

| Что | Где создаётся | Должна быть длина | Текущее значение | Статус |
|-----|---------------|-------------------|------------------|--------|
| `old_eq` | ui_oos.js:1550 | 10000 (100%) | 7000 (70%) | ❌ БАГ |
| `new_eq` | ui_oos.js:1560 | N полная | N полная | ✅ OK |
| `old_eqCalc` | ui_oos.js:1567 | 10000 (100%) | 7000 (70%) | ❌ БАГ |
| `new_eqCalc` | ui_oos.js:1572 | N полная | N полная | ✅ OK |
| `old_eqCalcBaselineArr` | ui_oos.js:1605 | 10000 (100%) | 7000 (70%) | ❌ БАГ |
| `new_eqCalcBaselineArr` | ui_oos.js:1630 | N полная | N полная | ✅ OK |
| `old_bars` (для шкалы) | ui_oos.js:1593 | 10000 (100%) | 7000 (70%) | ❌ БАГ |

---

## ✅ ПРОВЕРКА РЕШЕНИЯ

После исправления, когда откроешь результат в OOS модали и посмотришь на graph:

1. **Шкала должна показывать:** `◄ 15 (10000 (100%) ►` (не 7000 30%)
2. **Зелёная линия:** видна от первого до последнего бара
3. **Оранжевая линия:** видна, показывает то же без MA фильтра
4. **DevTools логи:** включи диагностику:
   ```javascript
   window.__DEBUG_OOS = true;
   window.__DEBUG_EQUITY = true;
   ```
   Смотри `oldEqClean.length` и `newEqClean.length` - должны быть полные значения

---

## 🚫 АНТИПАТТЕРНЫ (что НЕ делать)

❌ **Не обрезай 70% данных** при сохранении в результаты OOS  
❌ **Не используй 70% для шкалы графика** (только для расчёта метрик)  
❌ **Не теряй данные между этапами** 1 и 2  
✅ **Сохраняй полные данные** - обрезка происходит только при РЕНДЕРИНГЕ (этап 2)
