const fs = require('fs');

// Load all needed files in global scope
const code = [
  'core.js',
  'sl_tp_registry.js',
  'exit_registry.js',
  'entry_registry.js',
  'filter_registry.js',
].map(f => fs.readFileSync(f, 'utf8')).join('\n');

// Wrap in function to allow let DATA reassignment
const wrapper = code.replace(/^const DATA\b/m, 'var DATA');
eval(wrapper);

// Load CSV
const raw = fs.readFileSync('test_data/ohlcv.csv','utf8').trim().split('\n');
DATA = raw.slice(1).map(l => {
  const v = l.split(',');
  return {t: +v[0], o: +v[1], h: +v[2], l: +v[3], c: +v[4]};
});
const N = DATA.length;
console.log('Bars:', N);

// ATR
const atrArr = calcRMA_ATR(16);
// DEMA(10)
const closes = new Float64Array(DATA.map(d => d.c));
const maArr = calcDEMA(closes, 10);

// Pivot L3 R4
const pvLoArr = new Uint8Array(N);
const pvHiArr = new Uint8Array(N);
for (let i = 3; i < N - 4; i++) {
  let lo=true, hi=true;
  for (let j=-3; j<=4; j++) if(j!==0) {
    if(DATA[i+j].l < DATA[i].l) lo = false;
    if(DATA[i+j].h > DATA[i].h) hi = false;
  }
  if(lo) pvLoArr[i] = 1;
  if(hi) pvHiArr[i] = 1;
}

console.log('pvLo around 1784:');
for (let i = 1780; i <= 1800; i++) {
  if (pvLoArr[i]) console.log('  pvLo[' + i + '] = 1  close=' + DATA[i].c.toFixed(3));
}

// Run backtest (no MA filter, no confArr)
const cfg = {
  commission: 0.2, comm: 0.2,
  usePivot: true, pvLo: pvLoArr, pvHi_: pvHiArr,
  hasSLA: false, hasSLB: false, useSLPiv: false,
  hasTPA: false, hasTPB: false,
  useRev: false, useBE: false, useTrail: false, useWickTrail: false,
  useTime: false, useClimax: false, useStExit: false,
  useMA: false, usePartial: false, longOnly: false, shortOnly: false,
  start: 50,
  tradeLog: [],
};

const res = backtest(pvLoArr, pvHiArr, atrArr, cfg);
console.log('\nJS trades:', res.n, '  PnL:', res.pnl.toFixed(3) + '%');

// Show trades near bar 1785
const near = cfg.tradeLog.filter(t =>
  (t.exitBar != null && t.exitBar >= 1700 && t.entryBar <= 1900) ||
  (t.exitBar == null && t.entryBar <= 1785)
);
if (near.length) {
  console.log('\nTrades near bar 1785:');
  near.forEach(t => console.log(
    ' entry:', t.entryBar, 'exit:', t.exitBar ?? 'OPEN',
    'dir:', t.dir === 1 ? 'LONG' : 'SHORT',
    'ep:', t.entry?.toFixed(3), 'xp:', t.exit?.toFixed(3) ?? '?',
    'pnl:', t.pnl?.toFixed(3) ?? '?'
  ));
}
