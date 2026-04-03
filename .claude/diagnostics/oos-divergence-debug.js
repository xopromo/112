#!/usr/bin/env node
/**
 * OOS Divergence Debugger
 *
 * Анализирует почему OOS equity (green) выше IS equity (orange)
 * Проверяет 10 основных гипотез о источниках расхождения
 */

const fs = require('fs');
const path = require('path');

console.log('📊 OOS EQUITY DIVERGENCE ANALYZER\n');
console.log('Гипотезы для проверки:');
console.log('1. ❓ eq_old starts from DIFFERENT index than eq_new');
console.log('2. ❓ Warmup point different (eq_old includes warmup, eq_new cuts it)');
console.log('3. ❓ overlapIdx calculation incorrect (timestamp mismatch)');
console.log('4. ❓ eq_old calculated on 70% but eq_new includes 100% (different indicator state)');
console.log('5. ❓ Data mutation: rNew.eq gets modified after calculation');
console.log('6. ❓ Concatenation point wrong (lastOld value incorrect)');
console.log('7. ❓ eq_new cleaning removes WRONG bars (off-by-one)');
console.log('8. ❓ Baseline EqMA filter causes divergence (affects entry/exit)');
console.log('9. ❓ Trade triggers on different bars due to warmup mismatch');
console.log('10. ❓ Global DATA/NEW_DATA mutation between calculation and drawing');

console.log('\n═'.repeat(70));
console.log('DIAGNOSTIC STRATEGY:');
console.log('═'.repeat(70));

console.log(`
STEP 1: Inspect the merged code files
- Check ui_oos.js:1442-1454 (where old_eq and new_eq are stored)
- Check ui_equity.js:227-262 (where they are drawn)
- Look for any off-by-one errors in indexing

STEP 2: Add detailed logging
- Log eq_old.length, eq_new.length
- Log overlapIdx calculation
- Log warmup calculation for BOTH eq arrays
- Log minCleanIdx and actual slicing indices

STEP 3: Verify data is not mutated
- Check that rOld.eq and rNew.eq are not modified after storage
- Verify Array.from() is used for copying (not references)

STEP 4: Manual calculation on small example
- Create synthetic DATA (100 bars) and NEW_DATA (50 bars)
- Run backtest on both
- Calculate eq_old and eq_new manually
- Compare with actual output

STEP 5: Check if problem is in eq calculation itself
- Maybe rNew.eq grows faster than rOld.eq due to market conditions
- Compare actual trade entries/exits between old and new period

═══════════════════════════════════════════════════════════════════════

KEY INSIGHT FROM USER:
"может быть такое, что это не голубая линия отображается раньше нужного,
а оранжевая задерживается?"

Translation: Maybe orange line is DELAYED, not blue line early?

This suggests:
- eq_old might be missing early trades (warmup taking too long?)
- eq_old might start from wrong index
- eq_old might not reflect first 30 bars of actual trading
`);

console.log('\n═'.repeat(70));
console.log('FILES TO EXAMINE:');
console.log('═'.repeat(70));

const files = [
  {
    file: 'ui_oos.js',
    lines: '1442-1454',
    check: 'old_eq and new_eq storage logic',
    look_for: ['Array.from()', 'rOld.eq.slice', 'rNew.eq']
  },
  {
    file: 'ui_oos.js',
    lines: '1282-1292',
    check: 'overlapIdx calculation',
    look_for: ['_lastOldT', 'NEW_DATA[_k].t > _lastOldT']
  },
  {
    file: 'ui_equity.js',
    lines: '227-262',
    check: 'warmup cleaning and slicing',
    look_for: ['maWarmup', 'minCleanIdx', 'slice', 'map(v => v - warmupValue)']
  },
  {
    file: 'ui_equity.js',
    lines: '264-266',
    check: 'concatenation logic',
    look_for: ['const lastOld', 'const combined', 'v + lastOld']
  }
];

files.forEach(f => {
  console.log(`\n${f.file}:${f.lines} - ${f.check}`);
  console.log('  Look for:', f.look_for.join(', '));
});

console.log('\n═'.repeat(70));
console.log('MOST LIKELY ROOT CAUSE:');
console.log('═'.repeat(70));
console.log(`
eq_old is calculated on DATA (1000 bars):
  - backtest() starts at bar 50 (warmup)
  - eq[0-49] = 0 (no trades yet)
  - eq[50+] = actual pnl
  - Then sliced to 70% = bars 0-699

eq_new is calculated on NEW_DATA (500 bars):
  - backtest() starts at bar 50 (warmup)
  - eq[0-49] = 0 (no trades yet)
  - eq[50+] = actual pnl
  - Then cleaned at ui_equity.js by warmup/overlapIdx

PROBLEM: If warmup calculation in ui_equity.js doesn't match actual warmup,
then eq_new is sliced at wrong position!

For example:
  - True warmup = 30
  - But code calculates warmup = 50
  - Result: eq_new loses first 20 bars of actual trading!
  - This makes eq_new appear lower (or eq_old appear higher comparatively)

SOLUTION: Need to verify warmup calculation matches actual indicator warmup
in core.js line 647: const start = cfg.start || 50;
`);

console.log('\n✅ Next: Add logging to ui_oos.js and ui_equity.js to print:');
console.log('   1. eq_old.length, eq_new.length');
console.log('   2. overlapIdx value');
console.log('   3. warmup value');
console.log('   4. minCleanIdx value');
console.log('   5. First 10 values of eq_old and eq_new');
console.log('   6. Last 5 values before and after concatenation');
