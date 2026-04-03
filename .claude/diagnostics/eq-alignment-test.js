#!/usr/bin/env node
/**
 * Test: Understand eq_old and eq_new alignment
 *
 * Пример:
 * - DATA: 1000 баров, warmup до бара 50
 * - NEW_DATA: 500 баров, warmup до бара 50
 * - overlapIdx: 0 (no overlap)
 */

function testAlignment() {
  console.log('═'.repeat(70));
  console.log('SCENARIO: DATA=1000 bars, NEW_DATA=500 bars, warmup=30');
  console.log('═'.repeat(70));

  // Simulate eq arrays (simplified, just showing indices)
  const DATA_LEN = 1000;
  const NEW_DATA_LEN = 500;
  const WARMUP = 30;
  const OVERLAP_IDX = 0;

  console.log('\n📊 SCENARIO: eq_old calculation');
  console.log('─'.repeat(70));
  console.log(`1. Full backtest on DATA (${DATA_LEN} bars)`);
  console.log(`   rOld.eq.length = ${DATA_LEN}`);
  console.log(`   rOld.eq[0-29] = 0 (warmup, no trades)`);
  console.log(`   rOld.eq[30-999] = pnl (actual trading)`);

  const isEndIdx = Math.round(0.70 * DATA_LEN);
  console.log(`\n2. Slice to 70%`);
  console.log(`   isEndIdx = 0.70 * ${DATA_LEN} = ${isEndIdx}`);
  console.log(`   old_eq = rOld.eq.slice(0, ${isEndIdx})`);
  console.log(`   old_eq.length = ${isEndIdx}`);
  console.log(`   old_eq[0-29] = 0 (warmup)`);
  console.log(`   old_eq[30-699] = pnl (${isEndIdx - WARMUP} bars of actual trading)`);

  console.log('\n📊 SCENARIO: eq_new calculation');
  console.log('─'.repeat(70));
  console.log(`1. Full backtest on NEW_DATA (${NEW_DATA_LEN} bars)`);
  console.log(`   rNew.eq.length = ${NEW_DATA_LEN}`);
  console.log(`   rNew.eq[0-29] = 0 (warmup, no trades)`);
  console.log(`   rNew.eq[30-499] = pnl (actual trading)`);

  console.log(`\n2. During drawing in ui_equity.js:`);
  const minCleanIdx = Math.max(OVERLAP_IDX, WARMUP);
  console.log(`   minCleanIdx = Math.max(${OVERLAP_IDX}, ${WARMUP}) = ${minCleanIdx}`);
  console.log(`   newEqClean = rNew.eq.slice(${minCleanIdx})`);
  console.log(`   newEqClean.length = ${NEW_DATA_LEN} - ${minCleanIdx} = ${NEW_DATA_LEN - minCleanIdx}`);
  console.log(`   newEqClean[0] = original rNew.eq[${minCleanIdx}]`);
  console.log(`   Then: newEqClean = newEqClean.map(v => v - warmupValue)`);
  console.log(`   Result: newEqClean[0] = 0, newEqClean[470] = rNew.eq[500]`);

  console.log('\n🔗 CONCATENATION:');
  console.log('─'.repeat(70));
  console.log(`old_eq: ${isEndIdx} bars`);
  console.log(`  [0-29]: warmup`);
  console.log(`  [30-699]: trading (${isEndIdx - WARMUP} bars)`);

  console.log(`\nnewEqClean: ${NEW_DATA_LEN - minCleanIdx} bars`);
  console.log(`  [0-${NEW_DATA_LEN - minCleanIdx - 1}]: trading (after warmup removal)`);

  console.log(`\ncombined = [...old_eq, ...newEqClean]`);
  console.log(`combined.length = ${isEndIdx} + ${NEW_DATA_LEN - minCleanIdx} = ${isEndIdx + NEW_DATA_LEN - minCleanIdx}`);

  const lastOld = '670 (example)';  // This would be the value at the end of trading
  console.log(`\nlastOld = old_eq[${isEndIdx - 1}] = ${lastOld}`);
  console.log(`combined[${isEndIdx}] = newEqClean[0] + lastOld = 0 + ${lastOld} = ${lastOld}`);

  console.log('\n⚠️  POTENTIAL ISSUE:');
  console.log('─'.repeat(70));
  console.log(`eq_old represents trading bars 30-699 (670 bars of trading)`);
  console.log(`eq_new represents trading bars 30-499 (470 bars of trading)`);
  console.log(`\nBut they START at different indices:`);
  console.log(`  eq_old[0] = bar 0 of DATA (which is bar 0 of trading period)`);
  console.log(`  newEqClean[0] = bar 30 of NEW_DATA (warmup stripped)`);
  console.log(`\nThis means they are NOT aligned by trading logic!`);
  console.log(`  eq_old includes 30 bars of WARMUP (where no real trading happens)`);
  console.log(`  newEqClean doesn't include warmup`);
  console.log(`\nIf we expect similar growth rates:`);
  console.log(`  eq_old grows to 670 in 700 bars (including warmup)`);
  console.log(`  eq_new grows to 650 in 470 bars (warmup stripped)`);
  console.log(`  newEqClean appears STEEPER because warmup bars are removed!`);

  console.log('\n💡 HYPOTHESIS: ORANGE LINE APPEARS DELAYED');
  console.log('═'.repeat(70));
  console.log('The orange line (eq_old) includes warmup bars where eq is ~0.');
  console.log('The blue line (eq_new) skips warmup bars.');
  console.log('Result: Blue line appears to be "ahead" in growth curve.');
  console.log('\nSOLUTION: Need to ALSO clean eq_old by warmup!');
  console.log('  old_eq.slice(warmup) would remove first 30 bars');
  console.log('  Then both curves start at actual trading, not warmup point');
}

testAlignment();
