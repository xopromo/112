// ============================================================
// smoke.js — мини-тесты критичных функций
// Запуск: node test/smoke.js
// Без токенов, без браузера. ~0.1 сек.
// ============================================================
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');
const root = path.join(__dirname, '..');

// ── Мок браузерных глобалей ──────────────────────────────────
global.DATA        = [];
global.HAS_VOLUME  = false;
global.equities    = {};
global.results     = [];
global.favourites  = [];
global.stopped     = false;
global.paused      = false;
global.document    = { getElementById: () => ({ value: '', checked: false }) };
global.$           = () => ({ value: '', checked: false, textContent: '', innerHTML: '' });
global.$v          = () => '';
global.$c          = () => false;
global.$n          = () => 0;

// ── Загрузка исходников (vm.runInThisContext = eval в global scope) ──
function load(file) {
  vm.runInThisContext(fs.readFileSync(path.join(root, file), 'utf8'), { filename: file });
}
load('core.js');
load('opt.js');

// ── Бегунок ───────────────────────────────────────────────────
let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; }
  else       { console.error(`  FAIL: ${msg}`); fail++; }
}

// ── Вспомогательные данные ────────────────────────────────────
function makeData(n) {
  let p = 100;
  return Array.from({length: n}, (_, i) => {
    p = Math.max(10, p + Math.sin(i / 10) * 0.3 + 0.01);
    const h = p + 1, l = p - 1;
    return { o: p - 0.3, h, l, c: p + 0.1, v: 1000 };
  });
}

const N = 300;
const ZERO = new Float32Array(N);
const ONES = new Float32Array(N).fill(1);

// cfg для backtest: все флаги false — 0 сделок, нет краша
const NO_TRADE_CFG = {
  comm: 0, start: 50,
  usePivot: false, useEngulf: false, usePinBar: false,
  useBoll:  false, useDonch:  false, useAtrBo:  false,
  useMaTouch: false, useSqueeze: false,
  useTLTouch: false, useTLBreak: false, useFlag: false, useTri: false,
  hasSLA: false, hasSLB: false, hasTPA: false, hasTPB: false,
  useBE: false, useTrail: false, useRev: false,
  useTime: false, usePartial: false, useClimax: false,
  useMA: false, useADX: false, useRSI: false,
  useVolF: false, useStruct: false, useMaDist: false,
  useCandleF: false, useConsec: false, useSTrend: false, useFresh: false,
  useConfirm: false, useVSA: false, useLiq: false, useVolDir: false,
  useClimaxExit: false, useShortOnly: false, useLongOnly: false,
};

// ════════════════════════════════════════════════════════════
// 1. _calcStatSig
// ════════════════════════════════════════════════════════════
console.log('1. _calcStatSig');
assert(_calcStatSig(null)          === 0,  'null → 0');
assert(_calcStatSig({n:0, wr:60}) === 0,  'n=0 → 0');
assert(_calcStatSig({n:1, wr:60}) === 0,  'n<2 → 0');
{
  const s50  = _calcStatSig({n:50,   wr:60});
  const s200 = _calcStatSig({n:1000, wr:60});
  assert(!isNaN(s50) && s50 >= 0 && s50 <= 99, `n=50 wr=60 ∈ [0,99] (${s50})`);
  assert(s200 > s50,                            `больше данных → выше sig (${s200}>${s50})`);
  assert(_calcStatSig({n:100, wr:50}) === 0,    'wr=50% → 0');
}

// ════════════════════════════════════════════════════════════
// 2. _calcGTScore
// ════════════════════════════════════════════════════════════
console.log('2. _calcGTScore');
assert(_calcGTScore(null)   === -2, 'null → -2');
assert(_calcGTScore({n:0})  === -2, 'n=0 → -2');
{
  const gtGood   = _calcGTScore({n:50,  wr:60, pnl:1000, dd:200, dwr:10});
  const gtBad    = _calcGTScore({n:50,  wr:40, pnl:-500, dd:200, dwr:60});
  const gtBetter = _calcGTScore({n:200, wr:65, pnl:1000, dd:200, dwr:5});
  assert(!isNaN(gtGood) && gtGood > 0,  `хорошая стратегия > 0 (${gtGood})`);
  assert(gtBad  <= 0,                   `плохая стратегия ≤ 0 (${gtBad})`);
  assert(gtBetter > gtGood,             `больше сделок/лучше wr → выше score`);
}

// ════════════════════════════════════════════════════════════
// 3. _calcCVR
// ════════════════════════════════════════════════════════════
console.log('3. _calcCVR');
assert(_calcCVR(null)                  === null, 'null → null');
assert(_calcCVR([])                    === null, '[] → null');
assert(_calcCVR(new Float32Array(50))  === null, '50 баров → null (мало данных)');
{
  const eqUp   = new Float32Array(200); for (let i = 0; i < 200; i++) eqUp[i] = i;
  const eqFlat = new Float32Array(200).fill(0);
  assert(_calcCVR(eqUp)   === 100, `растущий equity → 100 (${_calcCVR(eqUp)})`);
  assert(_calcCVR(eqFlat) === 0,   `плоский equity → 0 (${_calcCVR(eqFlat)})`);
}

// ════════════════════════════════════════════════════════════
// 4. backtest() — полнота return
// ════════════════════════════════════════════════════════════
console.log('4. backtest() поля');
DATA = makeData(N);
{
  const r = backtest(ZERO, ZERO, ONES, NO_TRADE_CFG);
  assert(r !== null, 'возвращает не null');
  for (const f of ['pnl','wr','n','dd','eq','dwr','avg',
                   'nL','nS','wrL','wrS','dwrLS',
                   'p1','p2','c1','c2']) {
    assert(f in r, `поле "${f}" присутствует`);
  }
  assert(r.eq.length === N,             `eq.length = ${N}`);
  assert(!isNaN(r.pnl),                 'pnl не NaN');
  assert(r.wr >= 0 && r.wr <= 100,     `wr ∈ [0,100] (${r.wr})`);
  assert(r.n  === 0,                    `0 сделок при всех flags=false (${r.n})`);
  assert(r.dd >= 0,                     `dd ≥ 0 (${r.dd})`);
}

// ════════════════════════════════════════════════════════════
// 5. buildBtCfg() — обязательные поля (регрессия 4cb0e94)
//    donH/donL/sqzOn/bbD/atrBoMA/atrBoATR пропускались
// ════════════════════════════════════════════════════════════
console.log('5. buildBtCfg() поля');
{
  const cfg = { slPair: {}, tpPair: {}, commission: 0 };
  const ind = {
    pvLo: null, pvHi: null,
    bbB:  null, bbD:  null,
    donH: null, donL: null,
    atrBoMA: null, atrBoATR2: null,
    matMA: null, matZone: null,
    sqzOn: null, sqzCount: null,
    atrArr: null,
  };
  const btCfg = buildBtCfg(cfg, ind);
  for (const f of ['donH','donL','sqzOn','sqzCount','atrBoMA','atrBoATR',
                   'bbD','usePivot','useBoll','useDonch','useAtrBo',
                   'useSqueeze','hasSLA','hasSLB','hasTPA','hasTPB','comm']) {
    assert(f in btCfg, `buildBtCfg: поле "${f}" присутствует`);
  }
}

// ════════════════════════════════════════════════════════════
// Итог
// ════════════════════════════════════════════════════════════
const total = pass + fail;
if (fail === 0) {
  console.log(`\n✓ ${total} assertions passed`);
} else {
  console.error(`\n✗ ${fail}/${total} assertions FAILED`);
  process.exit(1);
}
