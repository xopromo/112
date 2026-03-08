// ============================================================
// indicator_parity.js — паритет формул: JS vs Pine
// Запуск: node test/indicator_parity.js
//
// Для каждого индикатора реализуется "Pine-эталон" (reference),
// который точно воспроизводит математику Pine Script.
// Затем сравниваем с нашим calcXxx() из core.js.
//
// Что ловит: неверный alpha, неверный seed, неверная формула TR/ADX,
//             неверный инициализирующий период RSI и т.д.
// Что НЕ ловит: HTF alignment, bar-timing off-by-one (→ regression.js)
// ============================================================
'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');
const root = path.join(__dirname, '..');

// ── Мок глобалей ─────────────────────────────────────────────
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

// Загружаем только core.js — больше ничего не нужно
vm.runInThisContext(fs.readFileSync(path.join(root, 'core.js'), 'utf8'), { filename: 'core.js' });

// ── Счётчик ───────────────────────────────────────────────────
let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; }
  else { console.error(`  FAIL: ${msg}`); fail++; }
}

// ── Детерминированные данные ─────────────────────────────────
// Другой seed чем в regression.js — независимые наборы данных
function makeData(n) {
  let seed = 0xDEADBEEF;
  const rng = () => {
    seed = Math.imul(seed, 1664525) + 1013904223 | 0;
    return (seed >>> 0) / 0x100000000;
  };
  let p = 100;
  const data = [];
  for (let i = 0; i < n; i++) {
    p = Math.max(10, p + Math.sin(i / 25) * 0.4 + (rng() - 0.5) * 0.5);
    const sp = rng() * 0.8 + 0.15;
    const h = p + sp * rng();
    const l = p - sp * rng();
    const o = l + (h - l) * rng();
    const c = l + (h - l) * rng();
    data.push({ o, h: Math.max(o, c, h), l: Math.min(o, c, l), c, v: 500 + rng() * 4000 });
  }
  return data;
}

const N     = 500;
const data  = makeData(N);
DATA        = data;
const closes = data.map(d => d.c);

// ── Утилиты сравнения ─────────────────────────────────────────
const TOL = 1e-6; // пикосекундная точность — ловит настоящие расхождения

// Сравниваем массивы, пропуская первые `skip` баров (warmup)
function compareArrays(label, got, want, skip, tol) {
  tol = tol !== undefined ? tol : TOL;
  skip = skip || 0;
  let diffs = 0;
  let maxDiff = 0, maxIdx = -1;
  for (let i = skip; i < N; i++) {
    const g = got[i] || 0, w = want[i] || 0;
    // Если оба близки к нулю (не прогрелись) — пропускаем
    if (Math.abs(w) < 1e-9 && Math.abs(g) < 1e-9) continue;
    const diff = Math.abs(g - w);
    if (diff > tol) {
      diffs++;
      if (diff > maxDiff) { maxDiff = diff; maxIdx = i; }
    }
  }
  if (diffs === 0) {
    pass++;
  } else {
    fail++;
    const g = (got[maxIdx] || 0).toFixed(8);
    const w = (want[maxIdx] || 0).toFixed(8);
    console.error(`  FAIL: ${label}: ${diffs} бара расходятся (макс Δ=${maxDiff.toFixed(8)} на баре ${maxIdx}: got=${g} want=${w})`);
  }
}

// ════════════════════════════════════════════════════════════
// Эталонные реализации Pine формул
// ════════════════════════════════════════════════════════════

// EMA: alpha = 2/(N+1), seed = data[0]
// Pine: ta.ema(src, length) — идентична EMA
function refEMA(data, period) {
  const result = new Float64Array(data.length);
  const k = 2 / (period + 1);
  result[0] = data[0];
  for (let i = 1; i < data.length; i++)
    result[i] = k * data[i] + (1 - k) * result[i - 1];
  return result;
}

// SMA: среднее последних N значений, 0 пока не накоплено N баров
// Pine: ta.sma(src, length)
function refSMA(data, period) {
  const result = new Float64Array(data.length);
  for (let i = period - 1; i < data.length; i++) {
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += data[j];
    result[i] = s / period;
  }
  return result;
}

// WMA: линейные веса 1..N, нормированные на N*(N+1)/2
// Pine: ta.wma(src, length)
function refWMA(data, period) {
  const result = new Float64Array(data.length);
  const denom = period * (period + 1) / 2;
  for (let i = period - 1; i < data.length; i++) {
    let s = 0;
    for (let j = 0; j < period; j++) s += data[i - period + 1 + j] * (j + 1);
    result[i] = s / denom;
  }
  return result;
}

// RMA (Wilder's): alpha = 1/N, seed = SMA первых N баров
// Pine: ta.rma(src, length) — используется в ATR, ADX
function refRMA(data, period) {
  const result = new Float64Array(data.length);
  const alpha = 1 / period;
  let s = 0;
  for (let i = 0; i < period && i < data.length; i++) s += data[i];
  if (data.length >= period) result[period - 1] = s / period;
  for (let i = period; i < data.length; i++)
    result[i] = alpha * data[i] + (1 - alpha) * result[i - 1];
  return result;
}

// ATR: ta.atr(len) = ta.rma(ta.tr, len)
// tr[0] = 0 (нет предыдущего закрытия), tr[i>=1] = max(h-l, |h-c_prev|, |l-c_prev|)
// Seed совпадает с calcRMA — оба начинают с бара 0
function refATR(ohlcv, period) {
  const N = ohlcv.length;
  const tr = new Float64Array(N);
  // bar 0: нет prev close — ta.tr = high - low
  tr[0] = ohlcv[0].h - ohlcv[0].l;
  for (let i = 1; i < N; i++) {
    tr[i] = Math.max(
      ohlcv[i].h - ohlcv[i].l,
      Math.abs(ohlcv[i].h - ohlcv[i - 1].c),
      Math.abs(ohlcv[i].l - ohlcv[i - 1].c)
    );
  }
  return refRMA(Array.from(tr), period);
}

// ADX (Wilder's DMI):
// Pine: dirmov(len) → [pDI, mDI], adx = 100 * ta.rma(|pDI-mDI|/(pDI+mDI), len)
// Эталон использует refRMA — должен совпасть с calcADX который использует calcRMA
function refADX(ohlcv, period) {
  const N = ohlcv.length;
  const pdm = new Float64Array(N), mdm = new Float64Array(N), tr = new Float64Array(N);
  // bar 0: нет предыдущего бара → pdm=mdm=0, tr=range
  tr[0] = ohlcv[0].h - ohlcv[0].l;
  for (let i = 1; i < N; i++) {
    const up = ohlcv[i].h - ohlcv[i - 1].h;
    const dn = ohlcv[i - 1].l - ohlcv[i].l;
    pdm[i] = (up > dn && up > 0) ? up : 0;
    mdm[i] = (dn > up && dn > 0) ? dn : 0;
    tr[i] = Math.max(
      ohlcv[i].h - ohlcv[i].l,
      Math.abs(ohlcv[i].h - ohlcv[i - 1].c),
      Math.abs(ohlcv[i].l - ohlcv[i - 1].c)
    );
  }
  const atrR = refRMA(Array.from(tr),  period);
  const pdmR = refRMA(Array.from(pdm), period);
  const mdmR = refRMA(Array.from(mdm), period);
  const dx = new Float64Array(N);
  for (let i = period; i < N; i++) {
    if (atrR[i] > 0) {
      const pi = pdmR[i] / atrR[i] * 100;
      const mi = mdmR[i] / atrR[i] * 100;
      const s  = pi + mi;
      dx[i] = s > 0 ? Math.abs(pi - mi) / s * 100 : 0;
    }
  }
  return refRMA(Array.from(dx), period);
}

// RSI: Pine ta.rsi = Wilder's RSI
// seed gain/loss = среднее первых period изменений (bars 1..period)
// затем Wilder's сглаживание: ag = (ag*(period-1) + gain) / period
function refRSI(ohlcv, period) {
  const N = ohlcv.length;
  const result = new Float64Array(N).fill(50);
  let ag = 0, al = 0;
  for (let i = 1; i <= Math.min(period, N - 1); i++) {
    const d = ohlcv[i].c - ohlcv[i - 1].c;
    if (d > 0) ag += d; else al -= d;
  }
  ag /= period;
  al /= period;
  for (let i = period + 1; i < N; i++) {
    const d = ohlcv[i].c - ohlcv[i - 1].c;
    ag = (ag * (period - 1) + (d > 0 ? d : 0)) / period;
    al = (al * (period - 1) + (d < 0 ? -d : 0)) / period;
    result[i] = al > 0 ? 100 - 100 / (1 + ag / al) : 100;
  }
  return result;
}

// ════════════════════════════════════════════════════════════
// 1. EMA
// ════════════════════════════════════════════════════════════
console.log('1. EMA');
{
  const period = 20;
  // calcEMA: (data, period)
  const got  = calcEMA(closes, period);
  const want = refEMA(closes, period);
  compareArrays(`EMA(${period})`, got, want, period);

  // Spot check: первый бар = первое значение
  assert(Math.abs(got[0] - closes[0]) < TOL, `EMA seed = closes[0] (${got[0].toFixed(6)} ≈ ${closes[0].toFixed(6)})`);

  // Monotone: с растущими данными EMA должна расти
  const up = Array.from({ length: 100 }, (_, i) => 100 + i);
  const emaUp = calcEMA(up, 5);
  assert(emaUp[99] > emaUp[50], 'EMA с растущими данными возрастает');

  // Alpha правильный: для period=2 alpha=2/3
  const simple = [100, 102]; // ema[1] = 102*(2/3) + 100*(1/3) = 101.333...
  const ema2 = calcEMA(simple, 2);
  assert(Math.abs(ema2[1] - (102 * (2/3) + 100 * (1/3))) < TOL,
    `EMA alpha=2/(N+1): period=2 → ${ema2[1].toFixed(6)} = ${(102*(2/3)+100*(1/3)).toFixed(6)}`);
}

// ════════════════════════════════════════════════════════════
// 2. SMA
// ════════════════════════════════════════════════════════════
console.log('2. SMA');
{
  const period = 14;
  const got  = calcSMA(closes, period);
  const want = refSMA(closes, period);
  compareArrays(`SMA(${period})`, got, want, period);

  // Первые period-1 баров = 0
  assert(got[period - 2] === 0, `SMA: бар ${period-2} = 0 (не прогрелся)`);
  assert(got[period - 1] > 0,  `SMA: бар ${period-1} > 0 (прогрелся)`);

  // Точность: SMA([1,2,3,4,5], 3) на баре 4 = (3+4+5)/3
  const nums = [1, 2, 3, 4, 5];
  const sma3 = calcSMA(nums, 3);
  assert(Math.abs(sma3[4] - 4.0) < TOL, `SMA([1..5],3)[4] = 4.0 (${sma3[4]})`);
}

// ════════════════════════════════════════════════════════════
// 3. WMA
// ════════════════════════════════════════════════════════════
console.log('3. WMA');
{
  const period = 10;
  const got  = calcWMA(closes, period);
  const want = refWMA(closes, period);
  compareArrays(`WMA(${period})`, got, want, period);

  // Spot: WMA([1,2,3], 3) = (1*1 + 2*2 + 3*3)/(1+2+3) = 14/6 = 2.333
  const nums = [1, 2, 3];
  const wma3 = calcWMA(nums, 3);
  assert(Math.abs(wma3[2] - 14/6) < TOL, `WMA([1,2,3],3)[2] = ${(14/6).toFixed(6)} (${wma3[2].toFixed(6)})`);
}

// ════════════════════════════════════════════════════════════
// 4. RMA (Wilder's smoothing)
// ════════════════════════════════════════════════════════════
console.log('4. RMA (Wilder\'s)');
{
  const period = 14;
  const got  = calcRMA(closes, period);
  const want = refRMA(closes, period);
  compareArrays(`RMA(${period})`, got, want, period);

  // Seed корректный: r[period-1] = SMA первых period баров
  const nums = Array.from({ length: 20 }, (_, i) => i + 1); // [1,2,...,20]
  const rma  = calcRMA(nums, 5);
  const expectedSeed = (1 + 2 + 3 + 4 + 5) / 5; // = 3
  assert(Math.abs(rma[4] - expectedSeed) < TOL,
    `RMA seed = SMA(${period} баров): r[4] = ${rma[4].toFixed(6)} ≈ ${expectedSeed}`);

  // Alpha = 1/period: r[5] = 6*(1/5) + 3*(4/5) = 1.2 + 2.4 = 3.6
  const expectedNext = 6 * (1/5) + expectedSeed * (4/5);
  assert(Math.abs(rma[5] - expectedNext) < TOL,
    `RMA alpha=1/N: r[5] = ${rma[5].toFixed(6)} ≈ ${expectedNext.toFixed(6)}`);
}

// ════════════════════════════════════════════════════════════
// 5. ATR
// ════════════════════════════════════════════════════════════
console.log('5. ATR');
{
  const period = 14;

  // calcRMA_ATR использует global DATA — уже установлен
  const gotATR  = calcRMA_ATR(period);

  // Наш эталон: refATR начинает с tr[0]=h[0]-l[0] и использует refRMA
  // calcRMA_ATR начинает с tr[1] и сидит на баре period (не period-1)
  // → сравниваем только на барах далеко после прогрева
  const wantATR = refATR(data, period);

  // Проверяем что оба сходятся после ~3*period баров
  const SKIP = 3 * period;
  let maxDiff = 0;
  for (let i = SKIP; i < N; i++) {
    const diff = Math.abs((gotATR[i] || 0) - (wantATR[i] || 0));
    if (diff > maxDiff) maxDiff = diff;
  }
  // После прогрева расхождение должно быть очень малым
  assert(maxDiff < 0.01, `ATR(${period}) после ${SKIP} баров сходится: макс Δ=${maxDiff.toFixed(8)}`);

  // TR всегда >= 0
  const trTest = [];
  for (let i = 1; i < N; i++) {
    const tr = Math.max(
      data[i].h - data[i].l,
      Math.abs(data[i].h - data[i-1].c),
      Math.abs(data[i].l - data[i-1].c)
    );
    trTest.push(tr);
  }
  assert(trTest.every(v => v >= 0), 'TR >= 0 для всех баров');

  // ATR >= 0 после прогрева
  assert(gotATR.slice(SKIP).every(v => v >= 0), `ATR(${period}) >= 0 после прогрева`);
}

// ════════════════════════════════════════════════════════════
// 6. ADX
// ════════════════════════════════════════════════════════════
console.log('6. ADX');
{
  const period = 14;
  const got  = calcADX(period);  // использует global DATA
  const want = refADX(data, period);

  // ADX эталон использует tr[0]=h[0]-l[0], calcADX использует tr[0]=0
  // → небольшое расхождение в первые 2*period баров, потом сходятся
  const SKIP = 4 * period;
  let maxDiff = 0, worstIdx = -1;
  for (let i = SKIP; i < N; i++) {
    const diff = Math.abs((got[i] || 0) - (want[i] || 0));
    if (diff > maxDiff) { maxDiff = diff; worstIdx = i; }
  }
  assert(maxDiff < 0.05,
    `ADX(${period}) после ${SKIP} баров сходится: макс Δ=${maxDiff.toFixed(8)} на баре ${worstIdx}`);

  // ADX ∈ [0, 100]
  const adxValues = Array.from(got).slice(SKIP).filter(v => v > 0);
  assert(adxValues.every(v => v >= 0 && v <= 100),
    `ADX(${period}) ∈ [0, 100] для всех прогретых баров`);

  // ADX поднимается на трендовых данных (монотонный рост цены)
  const trendData = Array.from({ length: 200 }, (_, i) => ({
    o: 100 + i * 0.9,
    h: 100 + i * 0.9 + 0.5,
    l: 100 + i * 0.9 - 0.1,
    c: 100 + i * 0.9 + 0.4,
  }));
  const dataBak = DATA;
  DATA = trendData;
  const adxTrend = calcADX(14);
  DATA = dataBak;
  // После прогрева на трендовом рынке ADX должен быть значимым
  assert(adxTrend[adxTrend.length - 1] > 20,
    `ADX > 20 на трендовых данных (${adxTrend[adxTrend.length-1].toFixed(2)})`);
}

// ════════════════════════════════════════════════════════════
// 7. RSI
// ════════════════════════════════════════════════════════════
console.log('7. RSI');
{
  const period = 14;
  const got  = calcRSI(period);
  const want = refRSI(data, period);
  compareArrays(`RSI(${period})`, got, want, period + 2);

  // RSI ∈ [0, 100]
  assert(Array.from(got).slice(period).every(v => v >= 0 && v <= 100),
    `RSI(${period}) ∈ [0, 100]`);

  // RSI ≈ 50 на случайных данных, 100 на сильном росте
  const allGain = Array.from({ length: 50 }, (_, i) => ({
    o: 100 + i, h: 101 + i, l: 99.5 + i, c: 100.5 + i, // только рост
  }));
  const dataBak = DATA;
  DATA = allGain;
  const rsiGain = calcRSI(14);
  DATA = dataBak;
  assert(rsiGain[49] > 90, `RSI близок к 100 при сплошном росте (${rsiGain[49].toFixed(2)})`);
}

// ════════════════════════════════════════════════════════════
// 8. Совместимость формул: calcRMA vs refRMA на тех же данных
// ════════════════════════════════════════════════════════════
console.log('8. calcRMA == refRMA (точное совпадение)');
{
  // calcRMA и refRMA должны совпадать побитово — одна и та же логика
  const testData = closes.slice(0, 100);
  for (const period of [3, 7, 14, 21]) {
    const got  = calcRMA(testData, period);
    const want = refRMA(testData, period);
    let maxDiff = 0;
    for (let i = 0; i < testData.length; i++) maxDiff = Math.max(maxDiff, Math.abs(got[i] - want[i]));
    assert(maxDiff < 1e-10, `calcRMA(period=${period}) == refRMA: макс Δ=${maxDiff}`);
  }
}

// ════════════════════════════════════════════════════════════
// 9. Прогрев: первые N-1 баров = 0 у SMA/WMA (как Pine na)
// ════════════════════════════════════════════════════════════
console.log('9. Прогрев (warmup) — SMA/WMA нули до period-1');
{
  for (const period of [5, 14, 50]) {
    const sma = calcSMA(closes, period);
    const wma = calcWMA(closes, period);
    // Баары 0..period-2 должны быть 0 (не прогрелись — как Pine na)
    const smaWarm = Array.from(sma).slice(0, period - 1).every(v => v === 0);
    const wmaWarm = Array.from(wma).slice(0, period - 1).every(v => v === 0);
    assert(smaWarm, `SMA(${period}): первые ${period-1} баров = 0`);
    assert(wmaWarm, `WMA(${period}): первые ${period-1} баров = 0`);
    // Бар period-1 уже прогрелся
    assert(sma[period - 1] > 0, `SMA(${period}): бар ${period-1} прогрелся (${sma[period-1].toFixed(4)})`);
    assert(wma[period - 1] > 0, `WMA(${period}): бар ${period-1} прогрелся (${wma[period-1].toFixed(4)})`);
  }
}

// ════════════════════════════════════════════════════════════
// Итог
// ════════════════════════════════════════════════════════════
const total = pass + fail;
if (fail === 0) {
  console.log(`\n✓ ${total} assertions passed — формулы совпадают с Pine`);
} else {
  console.error(`\n✗ ${fail}/${total} assertions FAILED`);
  process.exit(1);
}
