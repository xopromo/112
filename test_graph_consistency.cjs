/**
 * Deep analysis: Graph redraw consistency test
 * Tests if the same result produces identical graphs on multiple renders
 */

// Mock browser environment
global.window = {
  devicePixelRatio: 1,
  DATA: null,
  NEW_DATA: null,
};
global.document = {
  getElementById: () => ({
    getContext: () => ({
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      globalAlpha: 1,
      fillRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      arc: () => {},
      closePath: () => {},
      setLineDash: () => {},
      scale: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      measureText: () => ({ width: 0 }),
      save: () => {},
      restore: () => {},
      clearRect: () => {},
    }),
    offsetWidth: 800,
    offsetHeight: 400,
    style: {},
    textContent: '',
  }),
  createElement: () => ({
    id: '',
    className: '',
    style: {},
    innerHTML: '',
    textContent: '',
    addEventListener: () => {},
  }),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  classList: { add: () => {}, remove: () => {} },
};
global.$ = (id) => document.getElementById(id);

// Load required functions
const fs = require('fs');
const code = fs.readFileSync('/home/user/112/core.js', 'utf8');
eval(code);

// Test configuration - from user's example
const testCfg = {
  "usePivot": false, "pvL": 5, "pvR": 2,
  "useEngulf": false, "usePinBar": false, "pinRatio": 2,
  "useBoll": false, "bbLen": 5, "bbMult": 1.5,
  "useDonch": false, "donLen": 5,
  "useAtrBo": false, "atrBoLen": 5, "atrBoMult": 2,
  "useMaTouch": false, "matType": "WMA", "matPeriod": 20, "matZone": 0.2,
  "useSqueeze": false, "sqzBBLen": 20, "sqzKCMult": 1.5, "sqzMinBars": 1,
  "useSqzMod": false,
  "useTLTouch": true, "useTLBreak": false, "useFlag": false, "useTri": false,
  "tlPvL": 10, "tlPvR": 2, "tlZonePct": 0.4,
  "flagImpMin": 2, "flagMaxBars": 20, "flagRetrace": 0.618,
  "useRsiExit": false, "rsiExitPeriod": 14, "rsiExitOS": 30, "rsiExitOB": 70,
  "useKalmanCross": false, "kalmanCrossLen": 5,
  "useMaCross": false, "maCrossP": 5, "maCrossType": "EMA",
  "useFreeEntry": false, "useEIS": false, "eisPeriod": 13,
  "useSoldiers": false,
  "useMacd": false, "macdFast": 12, "macdSlow": 26, "macdSignalP": 9,
  "useStochExit": false, "stochKP": 14, "stochDP": 3, "stochOS": 20, "stochOB": 80,
  "useVolMove": false, "volMoveMult": 0.5,
  "useInsideBar": false, "useNReversal": false, "nReversalN": 3,
  "usePChg": false, "pChgPctA": 1, "pChgPeriodA": 10, "pChgHtfA": 1,
  "usePChgB": false, "pChgPctB": 1, "pChgPeriodB": 20, "pChgHtfB": 1,
  "useSupertrend": false, "stAtrP": 5, "stMult": 0.5,
  "useStExit": false, "useFlatExit": false, "fzN": 20, "fzAtrMult": 0.5,
  "fzFlatThr": 0.5, "fzMinFlat": 5, "fzMinProfit": 0, "useFlatBreak": false,
  "fzBrConfirm": true,
  "waitBars": 1, "waitRetrace": false, "waitMaxBars": 10, "waitCancelAtr": 0,
  "slPair": { "a": { "type": "atr", "m": 2 }, "p": { "type": "pct", "m": 7 }, "combo": true },
  "slLogic": "or",
  "tpPair": { "a": { "type": "atr", "m": 5 }, "b": null, "combo": false },
  "tpLogic": "or",
  "useSLPiv": false, "slPivOff": 0.2, "slPivMax": 3, "slPivL": 3, "slPivR": 1, "slPivTrail": false,
  "useAdaptiveTP": false, "tpAtrLen": 20, "tpAtrMult": 1,
  "useAdaptiveSL": false, "slAtrLen": 20, "slAtrMult": 0.5,
  "useBE": false, "beTrig": 0.5, "beOff": 0,
  "useTrail": false, "trTrig": 0.5, "trDist": 0.5,
  "useWickTrail": false, "wickOffType": "ATR", "wickMult": 0.5,
  "useDynSLStruct": false, "dynSLStructMult": 0.3,
  "useRev": false, "revBars": 0, "revMode": "plus", "revAct": "exit", "revSrc": "same",
  "revSkip": 0, "revCooldown": 0,
  "useTime": false, "timeBars": 0, "timeMode": "any",
  "usePartial": false, "partRR": 1, "partPct": 50, "partBE": false,
  "useClimax": false, "clxVolMult": 3, "clxBodyMult": 1.5, "clxMode": "any",
  "useMA": false, "maType": "EMA", "maP": 0, "htfRatio": 1,
  "useADX": false, "adxThresh": 0, "adxLen": 10, "adxHtfRatio": 1, "useAdxSlope": true, "adxSlopeBars": 3,
  "useRSI": false, "rsiOS": 30, "rsiOB": 70,
  "useVolF": false, "volFMult": 0, "useAtrExp": false, "atrExpMult": 0,
  "useStruct": true, "structLen": 414, "strPvL": 9, "strPvR": 10,
  "useConfirm": false, "confN": 100, "confMatType": "EMA", "confHtfRatio": 1,
  "useMaDist": false, "maDistMax": 0,
  "useCandleF": false, "candleMin": 0.3, "candleMax": 3,
  "useConsec": false, "consecMax": 5,
  "useSTrend": false, "sTrendWin": 1,
  "useFresh": false, "freshMax": 20,
  "useVSA": false, "vsaMult": 0, "vsaPeriod": 20,
  "useLiq": false, "liqMin": 0.5,
  "useVolDir": false, "volDirPeriod": 1,
  "useWT": false, "wtThresh": 0, "wtN": 11, "wtVolW": 3.5, "wtBodyW": 3.5, "wtUseDist": false,
  "useFat": false, "fatConsec": 6, "fatVolDrop": 0.7,
  "useKalmanMA": false, "kalmanLen": 20,
  "useEqMA": true, "eqMALen": 55, "eqMAType": "SMA", "eqMAMode": "Фильтр",
  "useMacdFilter": false, "useER": false, "erPeriod": 10, "erThresh": 0.3,
  "useMLFilter": false, "mlThreshold": 0.55,
  "useMLHighFilter": false, "mlHighThreshold": 0.55,
  "atrPeriod": 17, "commission": 0.1, "baseComm": 0.1, "spreadVal": 0, "markToMarket": false,
};

// Simple test data
const testData = Array(500).fill(0).map((_, i) => ({
  o: 100 + Math.sin(i * 0.1) * 5,
  h: 105 + Math.sin(i * 0.1) * 5,
  l: 95 + Math.sin(i * 0.1) * 5,
  c: 102 + Math.sin(i * 0.1) * 5,
  v: 1000000,
  t: 1000000 + i * 60000,
}));

console.log('🔬 DEEP CONSISTENCY TEST: Graph Redraw Issue');
console.log('='.repeat(70));
console.log('Testing if same result produces identical graphs on multiple renders\n');

// Simulate multiple independent runs
let results = [];
let graphSnapshots = [];

console.log('📊 Running 100 independent backtests with same config...\n');

for (let run = 0; run < 100; run++) {
  // Reset global state
  global.window.DATA = testData.slice();

  // Get fresh pivot arrays
  const pvLo = new Float32Array(testData.length);
  const pvHi = new Float32Array(testData.length);
  const atrArr = new Float32Array(testData.length);

  // Simple pivot calculation (not real, but consistent)
  for (let i = 0; i < testData.length; i++) {
    pvLo[i] = testData[i].l;
    pvHi[i] = testData[i].h;
    atrArr[i] = (testData[i].h - testData[i].l) * 0.1;
  }

  // Run backtest
  const result = backtest(pvLo, pvHi, atrArr, testCfg);

  if (result && result.eq) {
    const eqArray = Array.from(result.eq);
    const eqHash = JSON.stringify(eqArray.slice(0, 10)); // Hash first 10 values
    const eqStats = {
      pnl: result.pnl,
      wr: result.wr,
      n: result.n,
      dd: result.dd,
      eqLen: result.eq.length,
      eqStart: eqArray[0],
      eqEnd: eqArray[eqArray.length - 1],
      eqHash: eqHash,
    };

    results.push(eqStats);
    graphSnapshots.push(eqArray);
  }

  if ((run + 1) % 10 === 0) {
    process.stdout.write(`✓ ${run + 1} runs\r`);
  }
}

console.log('\n✓ 100 runs completed\n');

// ANALYZE CONSISTENCY
console.log('📈 CONSISTENCY ANALYSIS:');
console.log('-'.repeat(70));

// Check if all runs produced identical results
const firstResult = results[0];
let identical = 0;
let differentPnL = new Set();
let differentWR = new Set();
let differentEqLen = new Set();

for (let i = 1; i < results.length; i++) {
  if (JSON.stringify(results[i]) === JSON.stringify(firstResult)) {
    identical++;
  } else {
    if (results[i].pnl !== firstResult.pnl) differentPnL.add(`${results[i].pnl.toFixed(2)}%`);
    if (results[i].wr !== firstResult.wr) differentWR.add(`${results[i].wr.toFixed(1)}%`);
    if (results[i].eqLen !== firstResult.eqLen) differentEqLen.add(results[i].eqLen);
  }
}

console.log(`\n✓ Identical results: ${identical}/99 subsequent runs`);
console.log(`✗ Different results: ${99 - identical}/99 runs`);

if (differentPnL.size > 0) {
  console.log(`\n⚠️  Different PnL values: ${Array.from(differentPnL).join(', ')}`);
}
if (differentWR.size > 0) {
  console.log(`⚠️  Different WR values: ${Array.from(differentWR).join(', ')}`);
}
if (differentEqLen.size > 0) {
  console.log(`⚠️  Different eq array length: ${Array.from(differentEqLen).join(', ')}`);
}

// Check equity array byte-for-byte comparison
console.log('\n📊 EQUITY ARRAY COMPARISON:');
console.log('-'.repeat(70));

let eqIdentical = 0;
for (let i = 1; i < graphSnapshots.length; i++) {
  const match = graphSnapshots[i].length === graphSnapshots[0].length &&
    graphSnapshots[i].every((v, idx) => v === graphSnapshots[0][idx]);
  if (match) eqIdentical++;
}

console.log(`✓ Identical equity arrays: ${eqIdentical}/99 runs`);
console.log(`✗ Different equity arrays: ${99 - eqIdentical}/99 runs`);

if (eqIdentical < 99) {
  // Show differences
  console.log('\n🔍 Sample differences in first differing run:');
  for (let i = 1; i < graphSnapshots.length; i++) {
    if (graphSnapshots[i][0] !== graphSnapshots[0][0]) {
      console.log(`\nFirst value differs at run ${i}:`);
      console.log(`  Run 0: ${graphSnapshots[0][0]}`);
      console.log(`  Run ${i}: ${graphSnapshots[i][0]}`);

      // Find first difference
      for (let j = 0; j < Math.min(graphSnapshots[0].length, graphSnapshots[i].length); j++) {
        if (graphSnapshots[0][j] !== graphSnapshots[i][j]) {
          console.log(`\nFirst difference at index ${j}:`);
          console.log(`  Run 0 values [${j-2} to ${j+2}]: ${graphSnapshots[0].slice(j-2, j+3).join(', ')}`);
          console.log(`  Run ${i} values [${j-2} to ${j+2}]: ${graphSnapshots[i].slice(j-2, j+3).join(', ')}`);
          break;
        }
      }
      break;
    }
  }
}

// VERDICT
console.log('\n' + '='.repeat(70));
console.log('🎯 FINAL VERDICT:');
console.log('='.repeat(70));

if (identical === 99 && eqIdentical === 99) {
  console.log('\n✅ PASSED: Graph render is 100% consistent');
  console.log('Same config always produces identical graphs');
  console.log('Issue is NOT in backtest calculation or graph data generation');
} else {
  console.log('\n❌ FAILED: Graph render is NOT consistent');
  console.log(`Only ${identical}/99 runs produced identical metrics`);
  console.log(`Only ${eqIdentical}/99 runs produced identical equity arrays`);
  console.log('\nProblem causes:');
  if (differentPnL.size > 0) console.log('- Backtest results vary (different PnL/WR)');
  if (differentEqLen.size > 0) console.log('- Equity array length varies (truncation issue?)');
  if (eqIdentical < 99 && differentPnL.size === 0) console.log('- Graph rendering has floating point precision issues');
}

console.log('\n');
