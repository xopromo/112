// ============================================================
// regression.js — регрессионный тест бэктеста
// Запуск: node test/regression.js
// Обновить baseline: node test/regression.js --update
//
// Суть: запускаем backtest() с эталонным конфигом на детерминированных данных.
// Сравниваем результат с сохранённым baseline.
// Если PnL / WR / число сделок / equity изменились — тест падает.
// Это ловит случайные регрессии логики ДО того, как они попадут в TradingView.
// ============================================================
'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');
const root = path.join(__dirname, '..');

const BASELINE_FILE = path.join(__dirname, 'regression_baseline.json');
const UPDATE_MODE   = process.argv.includes('--update');

// ── Мок браузерных глобалей ──────────────────────────────────
global.DATA       = [];
global.HAS_VOLUME = true;
global.equities   = {};
global.results    = [];
global.favourites = [];
global.stopped    = false;
global.paused     = false;
global.document   = { getElementById: () => ({ value: '', checked: false }) };
global.$          = () => ({ value: '', checked: false, textContent: '', innerHTML: '' });
global.$v         = () => '';
global.$c         = () => false;
global.$n         = () => 0;

function load(file) {
  vm.runInThisContext(fs.readFileSync(path.join(root, file), 'utf8'), { filename: file });
}
load('entry_registry.js');
load('filter_registry.js');
load('exit_registry.js');
load('sl_tp_registry.js');
load('core.js');
load('opt.js');

// ── Детерминированные данные ─────────────────────────────────
// LCG (Linear Congruential Generator) — стабильно по всем платформам/версиям Node
function makeDeterministicData(n) {
  let seed = 0x12345678;
  const rng = () => {
    seed = Math.imul(seed, 1664525) + 1013904223 | 0;
    return (seed >>> 0) / 0x100000000;
  };

  let price = 100;
  const data = [];
  for (let i = 0; i < n; i++) {
    // Медленный синусоидальный тренд + шум
    const trend = Math.sin(i / 150) * 0.15 + Math.sin(i / 40) * 0.05;
    const noise = (rng() - 0.5) * 0.6;
    price = Math.max(10, price + trend + noise);

    const spread = rng() * 0.5 + 0.1;
    const h = price + spread * rng();
    const l = price - spread * rng();
    const o = l + (h - l) * rng();
    const c = l + (h - l) * rng();
    data.push({
      o,
      h: Math.max(o, c, h),
      l: Math.min(o, c, l),
      c,
      v: 1000 + rng() * 4000,
    });
  }
  return data;
}

// ── Эталонный конфиг ─────────────────────────────────────────
// Умеренно сложный: Supertrend + Engulf + MA + ADX + ATRExp + SL/TP
// При изменении логики этих фич — тест упадёт, что правильно.
const REF_CFG = {
  // Паттерны: Supertrend + Engulf
  useSupertrend: true, stAtrP: 10, stMult: 3.0,
  useEngulf:     true,
  usePinBar:     false,
  usePivot:      false,
  useDonch:      false, useBoll:    false, useAtrBo:   false,
  useMaTouch:    false, useTLTouch: false, useTLBreak: false,
  useFlag:       false, useTri:     false, useSqueeze: false,
  useMaCross:    false, useInsideBar: false, useNReversal: false,
  useVolMove:    false, useMacd:    false, useFreeEntry: false,

  // Фильтры
  useMA:     true,  maType: 'EMA',  maP: 50,   htfRatio: 1,
  useConfirm: false,
  useMaDist: false,
  useSTrend: false,
  useADX:    true,  adxLen: 14, adxThresh: 20, adxHtfRatio: 1,
  useAdxSlope: false, adxSlopeBars: 3,
  useAtrExp: true,  atrExpMult: 0.8,
  useVolF:   false,
  useStruct: false,
  useVSA:    false,
  useLiq:    false,
  useVolDir: false,
  useCandleF: false,
  useRSI:    false,
  useConsec: false,
  useFresh:  false,
  useWT:     false,
  useFat:    false,

  // SL ATR×1.5, TP RR×2
  slPair: { a: { type: 'atr', m: 1.5 }, p: null, combo: false },
  tpPair: { a: { type: 'rr',  m: 2.0 }, b: null, combo: false },
  slLogic: 'or', tpLogic: 'or',

  // Без BE / Trail / особых выходов
  useBE:    false, useTrail:  false,
  useRev:   false, useTime:   false,
  useClimax: false, useStExit: false, usePartial: false,
  useSLPiv: false,
  waitBars: 0, waitRetrace: false, waitMaxBars: 10, waitCancelAtr: 0,

  atrPeriod: 14, baseComm: 0.08, spreadVal: 0, start: 0,
};

// ── Запуск ───────────────────────────────────────────────────
const N = 2000;
DATA = makeDeterministicData(N);

const ind   = _calcIndicators(REF_CFG);
const btCfg = buildBtCfg(REF_CFG, ind);
btCfg.collectTrades = true;

const r = backtest(ind.pvLo, ind.pvHi, ind.atrArr, btCfg);

// ── Снимок результата ─────────────────────────────────────────
function makeSnapshot(res) {
  const eq = Array.from(res.eq || []);

  // Fingerprint equity: не храним всё, но ловим изменения
  const eqFp = eq.length > 0 ? {
    len:   eq.length,
    first: +eq[0].toFixed(4),
    last:  +eq[eq.length - 1].toFixed(4),
    min:   +Math.min(...eq).toFixed(4),
    max:   +Math.max(...eq).toFixed(4),
    // Сумма с шагом 50 — ловит изменения формы кривой
    checksum: +(eq.filter((_,i) => i % 50 === 0).reduce((a,b) => a+b, 0)).toFixed(4),
  } : null;

  // Первые 15 сделок — ловит изменения порядка и логики входа
  const trades = (res.tradePnl || []).slice(0, 15).map((t, i) => {
    // tradePnl может быть массивом чисел или объектов — поддерживаем оба формата
    if (typeof t === 'number') return { idx: i, pnl: +t.toFixed(4) };
    return { idx: t.i || i, dir: t.dir || 0, pnl: +( (t.pnl !== undefined ? t.pnl : t) ).toFixed(4) };
  });

  return {
    pnl:  +(res.pnl  || 0).toFixed(4),
    wr:   +(res.wr   || 0).toFixed(4),
    n:     res.n     || 0,
    dd:   +(res.dd   || 0).toFixed(4),
    avg:  +(res.avg  || 0).toFixed(4),
    nL:    res.nL    || 0,
    nS:    res.nS    || 0,
    wrL:  +(res.wrL  || 0).toFixed(4),
    wrS:  +(res.wrS  || 0).toFixed(4),
    eq:   eqFp,
    trades,
  };
}

const snap = makeSnapshot(r);

// ── Режим обновления ─────────────────────────────────────────
if (UPDATE_MODE) {
  const baseline = {
    generated: new Date().toISOString(),
    note: 'Создан: node test/regression.js --update  |  Обновлять при НАМЕРЕННЫХ изменениях логики',
    refCfg: {
      entry:   'Supertrend+Engulf',
      filters: 'MA(EMA50) + ADX>20 + AtrExp>0.8x',
      sl:      'ATR×1.5',
      tp:      'RR×2.0',
    },
    snapshot: snap,
  };
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2));
  console.log('✓ Baseline обновлён: test/regression_baseline.json');
  console.log(`  Сделок: ${snap.n}  PnL: ${snap.pnl}%  WR: ${snap.wr}%  DD: ${snap.dd}%`);
  process.exit(0);
}

// ── Сравнение с baseline ─────────────────────────────────────
if (!fs.existsSync(BASELINE_FILE)) {
  console.error('✗ Baseline не найден. Запусти: node test/regression.js --update');
  process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
const expected = baseline.snapshot;

let pass = 0, fail = 0;

function eq(label, got, want, tol) {
  let ok;
  if (tol !== undefined) {
    ok = Math.abs((got || 0) - (want || 0)) <= tol;
  } else {
    ok = got === want;
  }
  if (ok) { pass++; }
  else {
    console.error(`  FAIL: ${label}: получено ${got}, ожидалось ${want}`);
    fail++;
  }
}

console.log(`Regression (baseline от ${(baseline.generated || '').slice(0, 10)})`);
console.log('─'.repeat(55));

// Основные метрики — строгая точность (детерминированные данные)
eq('pnl',  snap.pnl,  expected.pnl,  0.001);
eq('wr',   snap.wr,   expected.wr,   0.001);
eq('n',    snap.n,    expected.n);
eq('dd',   snap.dd,   expected.dd,   0.001);
eq('avg',  snap.avg,  expected.avg,  0.001);
eq('nL',   snap.nL,   expected.nL);
eq('nS',   snap.nS,   expected.nS);
eq('wrL',  snap.wrL,  expected.wrL,  0.001);
eq('wrS',  snap.wrS,  expected.wrS,  0.001);

// Equity fingerprint
if (expected.eq && snap.eq) {
  eq('eq.len',      snap.eq.len,      expected.eq.len);
  eq('eq.first',    snap.eq.first,    expected.eq.first,    0.001);
  eq('eq.last',     snap.eq.last,     expected.eq.last,     0.001);
  eq('eq.min',      snap.eq.min,      expected.eq.min,      0.001);
  eq('eq.max',      snap.eq.max,      expected.eq.max,      0.001);
  eq('eq.checksum', snap.eq.checksum, expected.eq.checksum, 0.01);
}

// Первые N сделок — ловит изменения порядка входов
const minT = Math.min(snap.trades.length, (expected.trades || []).length, 15);
for (let t = 0; t < minT; t++) {
  const got  = snap.trades[t];
  const want = expected.trades[t];
  if (!want) break;
  eq(`trade[${t}].pnl`, got.pnl, want.pnl, 0.001);
}

// ── Итог ─────────────────────────────────────────────────────
console.log('─'.repeat(55));
if (fail === 0) {
  console.log(`✓ ${pass} assertions passed — бэктест не изменился`);
} else {
  console.error(`✗ ${fail} FAILED, ${pass} passed`);
  console.log('\nЕсли изменение НАМЕРЕННОЕ — обнови baseline:');
  console.log('  node test/regression.js --update');
  process.exit(1);
}
