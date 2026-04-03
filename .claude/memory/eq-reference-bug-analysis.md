# Bug Analysis: eq Reference Corruption in OOS Calculations

## Problem Statement
**Symptom**: Графики меняют движение после OOS расчета. Даже IS период меняется, что невозможно.
**Root Cause**: _eqCalc сохранялась как прямая ссылка на Float32Array без копирования

## Technical Details

### Where It Happened
- **File**: opt.js
- **TPE Mode**: Line 2647 - `_eqCalc = _shadowEq;`  
- **Exhaustive Mode**: Line 3365 - `_eqCalc = _shadowEq;`

### Why It Was a Bug
```javascript
// БЫЛО (неправильно):
_eqCalc = _shadowEq;  // Прямая ссылка на Float32Array
results.push({ ..., eqCalc: _eqCalc, ... });

// Затем если _shadowEq переиспользуется или модифицируется:
for (let i = 0; i < _shadowEq.length; i++) {
  _shadowEq[i] = 0;  // Модифицируем!
}
// results[0].eqCalc ТОЖЕ изменится, потому что это один и тот же объект!
```

### The Fix
```javascript
// СТАЛО (правильно):
_eqCalc = Array.from(_shadowEq);  // Копируем данные в новый массив
results.push({ ..., eqCalc: _eqCalc, ... });

// Теперь даже если _shadowEq модифицируется:
for (let i = 0; i < _shadowEq.length; i++) {
  _shadowEq[i] = 0;  // Модифицируем!
}
// results[0].eqCalc ОСТАНЕТСЯ неизменной, потому что это отдельный объект
```

## How the Bug Manifested

### Scenario
1. **TPE Optimization Phase**: Для каждого кандидата рассчитывается shadow (baseline без фильтра)
2. **Shadow Backtest**: Возвращает _shadowEq (Float32Array)
3. **Wrong Storage**: `_eqCalc = _shadowEq` → сохраняем ссылку
4. **Results Push**: Результат сохраняется в results array с eqCalc pointing to _shadowEq
5. **Later Reuse**: _shadowEq может быть переиспользована или модифицирована в другом цикле
6. **Corruption**: results[i].eqCalc неожиданно изменяется
7. **UI Update**: График перерисовывается с изменёнными данными
8. **Movement Change**: Паттерн движения (up/down/flat) меняется из-за изменённых значений

## Validation

### Test 1: _eqCalc Storage Test
```
Before fix:  _shadowEq modified → results_bad.eqCalc ALSO modified (CORRUPTED)
After fix:   _shadowEq modified → results_good.eqCalc UNCHANGED (PROTECTED)
Result: ✅ PASS
```

### Test 2: Movement Pattern Preservation
```
Original pattern: 11-1-1111-1-11
With direct ref:  11-1-1111-1-1-1  ← CHANGED!
With Array.from: 11-1-1111-1-11    ← PROTECTED!
Result: ✅ PASS
```

### Test 3: Array.from() Protection
```
After modifying original Float32Array:
- Direct reference (ref):    VALUES CHANGED (corrupted)
- Array.from() copy:         VALUES PROTECTED (safe)
- new Float32Array() copy:   VALUES PROTECTED (safe)
Result: ✅ PASS
```

## Code Pattern: Safe eq Storage

### Always Use Array.from() for eq Storage
❌ **DON'T**:
```javascript
cfg.eqCalc = backtest(...).eq;           // Direct reference
result.eq = _shadowEq;                   // Direct reference
pending[i].eq = equities[name];          // Maybe reference
```

✅ **DO**:
```javascript
cfg.eqCalc = Array.from(backtest(...).eq);  // Copy
result.eq = Array.from(_shadowEq);          // Copy
pending[i].eq = Array.from(equities[name]); // Copy if unsafe
```

### Why Array.from()?
1. **Creates Independent Copy**: New array, separate memory
2. **Type Safe**: Converts Float32Array → JavaScript Array
3. **Performance**: O(n) but only happens during optimization, not on every draw
4. **Clear Intent**: Shows that we want a copy, not a reference

## Similar Patterns to Watch For

### Pattern 1: eq Stored Without Copy
```javascript
const baselineEq = backtest(...).eq;  // ⚠️ Reference
// Later...
if (baselineEq[0] !== result.eq[0]) {  // Data mismatch!
```
→ Use `Array.from(backtest(...).eq)`

### Pattern 2: eq Passed Between Functions
```javascript
function processEq(eq) {
  eq[0] = 999;  // Modifies caller's array!
}
const result = { eq: backtest(...).eq };
processEq(result.eq);  // Caller's eq corrupted!
```
→ Pass copy: `processEq(Array.from(result.eq))`

### Pattern 3: eq in Cache
```javascript
const _cache = { eq: backtest(...).eq };  // ⚠️ Reference
// Later...
for (let i = 0; i < _cache.eq.length; i++) _cache.eq[i] = 0;  // Corrupts cache!
```
→ Cache copy: `const _cache = { eq: Array.from(backtest(...).eq) }`

## Why This Bug Was Hard to Find

1. **Non-Deterministic**: Only manifests when Float32Array is reused (happens during optimization)
2. **Silent Failure**: No error thrown, just wrong data rendered
3. **Delayed Effect**: Corruption happens later, not immediately
4. **Visual Symptom**: Graphs change movement characteristics (not obvious that it's data corruption)
5. **Affects Multiple Results**: Same Float32Array could affect many results if shared

## Prevention Rules

### Rule: Zero-Copy Vigilance
For eq data (Float32Arrays):
- ✅ Always use `Array.from()` when storing results
- ✅ Always check `= backtest(...).eq` patterns
- ✅ Document why storing reference is safe IF you do it
- ❌ Never assume Float32Array is immutable
- ❌ Never share Float32Array between different result objects

### Rule: Cache Invalidation
If caching eq:
- Copy on storage: `cache.eq = Array.from(source.eq)`
- Copy on retrieval: `return Array.from(cache.eq)`
- Document cache lifetime: how long is it valid?

## Files Modified
- opt.js:2647 (TPE) - Changed `_eqCalc = _shadowEq` to `_eqCalc = Array.from(_shadowEq)`
- opt.js:3365 (Exhaustive) - Changed `_eqCalc = _shadowEq` to `_eqCalc = Array.from(_shadowEq)`

## Related Issues
- HC eq corruption (ui_hc.js) - Was trying to work around this with _fullEq field
- ui_equity.js:177 - Caching from backtest, should consider copying
- opt.js:1142 - Assignment from equities dict, equities stores Arrays (safer)

## Confidence Level
**85%** - Root cause identified, fix applied, validation tests pass, but needs real-world testing with actual project data to confirm graphs no longer change movement characteristics.

## Next Steps
1. Test with real optimization run and OOS scan
2. Verify graphs maintain same movement pattern before/after OOS
3. Run full ui_oos.js flow to confirm no regressions
4. Consider similar pattern in other eq storage locations

