// ml_signal.js — Browser-side ML feature extraction and signal scoring
// Requires: DATA global array, mlScore() from active model

const ML_PVL = 3;      // pivot left bars (must match training)
const ML_PVR = 4;      // pivot right bars (must match training)
const ML_FEAT_N = 33;  // total features — models trained on different count are incompatible

// ── Indicator cache (rebuilt on data change) ───────────────────

let _mlCache = null;

function mlResetCache() { _mlCache = null; }

function _mlEnsureCache() {
  if (_mlCache && _mlCache.n === DATA.length) return;
  const n = DATA.length;
  const ATR_P = 14, aAlpha = 1 / ATR_P;
  const E20A = 2 / 21, E50A = 2 / 51;

  const atr  = new Float64Array(n);
  const ema20 = new Float64Array(n);
  const ema50 = new Float64Array(n);
  const rsi   = new Float64Array(n);

  // Wilder ATR
  let trSum = 0;
  for (let i = 1; i <= Math.min(ATR_P, n - 1); i++) {
    const d = DATA[i], p = DATA[i - 1];
    trSum += Math.max(d.h - d.l, Math.abs(d.h - p.c), Math.abs(d.l - p.c));
  }
  if (n > ATR_P) atr[ATR_P] = trSum / ATR_P;
  for (let i = ATR_P + 1; i < n; i++) {
    const d = DATA[i], p = DATA[i - 1];
    const tr = Math.max(d.h - d.l, Math.abs(d.h - p.c), Math.abs(d.l - p.c));
    atr[i] = aAlpha * tr + (1 - aAlpha) * atr[i - 1];
  }

  // EMA20, EMA50
  ema20[0] = ema50[0] = DATA[0] ? DATA[0].c : 0;
  for (let i = 1; i < n; i++) {
    ema20[i] = E20A * DATA[i].c + (1 - E20A) * ema20[i - 1];
    ema50[i] = E50A * DATA[i].c + (1 - E50A) * ema50[i - 1];
  }

  // RSI(14) — Wilder smoothing
  let avgU = 0, avgD = 0;
  for (let i = 1; i < n; i++) {
    const chg = DATA[i].c - DATA[i - 1].c;
    const u = chg > 0 ? chg : 0, d = chg < 0 ? -chg : 0;
    if (i < ATR_P)        { avgU += u / ATR_P; avgD += d / ATR_P; }
    else if (i === ATR_P) { avgU += u / ATR_P; avgD += d / ATR_P;
                            rsi[i] = avgD > 0 ? 100 - 100 / (1 + avgU / avgD) : 100; }
    else                  { avgU = (avgU * 13 + u) / 14; avgD = (avgD * 13 + d) / 14;
                            rsi[i] = avgD > 0 ? 100 - 100 / (1 + avgU / avgD) : 100; }
  }

  const hasVol = n > 0 && DATA[0].v != null && DATA[0].v > 0;
  _mlCache = { n, atr, ema20, ema50, rsi, hasVol };
}

// ── Feature vector (33 features) ──────────────────────────────
// barIdx = confirmation bar index (pivot low was at barIdx - ML_PVR)
// Returns Float64Array(33) or null if insufficient data

function mlComputeFeatures(barIdx) {
  if (!DATA || barIdx < 52 || barIdx >= DATA.length) return null;
  _mlEnsureCache();
  const { atr, ema20, ema50, rsi, hasVol } = _mlCache;

  const i  = barIdx;
  const c0 = DATA[i - 1].c;
  const a0 = atr[i - 1];
  if (a0 <= 0 || c0 <= 0) return null;

  const feat = new Float64Array(ML_FEAT_N);

  // [0-18] Normalized log-returns: z-score of last 19 bar changes
  const WINDOW = 20;
  let rSum = 0, rSum2 = 0;
  const lr = new Float64Array(WINDOW - 1);
  for (let k = 0; k < WINDOW - 1; k++) {
    const bi = i - WINDOW + k;
    const ca = DATA[bi].c, cb = DATA[bi + 1].c;
    lr[k] = (ca > 0 && cb > 0) ? Math.log(cb / ca) : 0;
    rSum += lr[k]; rSum2 += lr[k] * lr[k];
  }
  const lrMean = rSum / 19;
  const lrStd  = Math.sqrt(rSum2 / 19 - lrMean * lrMean) + 1e-8;
  for (let k = 0; k < 19; k++) feat[k] = (lr[k] - lrMean) / lrStd;

  // [19] ATR normalised (ATR / close)
  feat[19] = a0 / c0;

  // [20] Efficiency Ratio over 10 bars
  const ER_P = 10;
  if (i > ER_P) {
    const net = Math.abs(DATA[i - 1].c - DATA[i - 1 - ER_P].c);
    let path = 0;
    for (let j = i - ER_P; j < i; j++) path += Math.abs(DATA[j].c - DATA[j - 1].c);
    feat[20] = path > 0 ? net / path : 0;
  }

  // [21] Volume ratio: vol[i-1] / mean(vol, last 20)
  // [22] Volume z-score
  if (hasVol) {
    let vSum = 0, vSum2 = 0, vN = 0;
    for (let j = Math.max(0, i - 21); j < i - 1; j++) {
      const v = DATA[j].v || 0;
      vSum += v; vSum2 += v * v; vN++;
    }
    const vMean = vN > 0 ? vSum / vN : 1;
    const vStd  = vN > 1 ? Math.sqrt(Math.max(0, vSum2 / vN - vMean * vMean)) + 1e-8 : 1;
    const vNow  = DATA[i - 1].v || 0;
    feat[21] = vMean > 0 ? vNow / vMean : 1;
    feat[22] = (vNow - vMean) / vStd;
  } else {
    feat[21] = 1; feat[22] = 0;
  }

  // [23] RSI(14) / 100
  feat[23] = rsi[i - 1] / 100;

  // [24] Distance below EMA20 in ATR units (positive = price < EMA, oversold)
  // [25] Distance below EMA50
  feat[24] = (ema20[i - 1] - c0) / a0;
  feat[25] = (ema50[i - 1] - c0) / a0;

  // [26] Lower wick at pivot bar (rejection candle strength)
  // [27] Body size at pivot bar
  const pvBar = Math.max(0, i - ML_PVR);
  feat[26] = (DATA[pvBar].c - DATA[pvBar].l) / a0;
  feat[27] = Math.abs((DATA[pvBar].o || DATA[pvBar].c) - DATA[pvBar].c) / a0;

  // [28] ATR regime: current ATR vs 50-bar average (>1 = high vol, <1 = low vol)
  let atrSum = 0, atrN = 0;
  for (let j = Math.max(1, i - 51); j < i - 1; j++) {
    if (atr[j] > 0) { atrSum += atr[j]; atrN++; }
  }
  feat[28] = atrN > 0 ? a0 / (atrSum / atrN) : 1;

  // [29] Consecutive bearish closes before confirmation (/ 10, capped)
  let streak = 0;
  for (let j = i - 1; j > Math.max(1, i - 11) && DATA[j].c < DATA[j - 1].c; j--) streak++;
  feat[29] = streak / 10;

  // [30] Price position in 20-bar high-low channel (0=bottom, 1=top)
  let lo = Infinity, hi = -Infinity;
  for (let j = Math.max(0, i - 20); j < i; j++) {
    if (DATA[j].l < lo) lo = DATA[j].l;
    if (DATA[j].h > hi) hi = DATA[j].h;
  }
  feat[30] = hi > lo ? (c0 - lo) / (hi - lo) : 0.5;

  // [31] 20-bar linear regression slope / ATR (trend direction)
  {
    const N = Math.min(20, i);
    let sx = 0, sy = 0, sxy = 0, sx2 = 0;
    for (let j = 0; j < N; j++) {
      const c = DATA[i - N + j].c;
      sx += j; sy += c; sxy += j * c; sx2 += j * j;
    }
    const denom = N * sx2 - sx * sx;
    feat[31] = denom > 0 ? (N * sxy - sx * sy) / denom / a0 : 0;
  }

  // [32] Bollinger Band width (4σ / close) — squeeze = low, expansion = high
  {
    const N = Math.min(20, i);
    let s = 0, s2 = 0;
    for (let j = i - N; j < i; j++) { s += DATA[j].c; s2 += DATA[j].c * DATA[j].c; }
    const bMean = s / N;
    const bStd  = Math.sqrt(Math.max(0, s2 / N - bMean * bMean));
    feat[32] = c0 > 0 ? 4 * bStd / c0 : 0;
  }

  return feat;
}

// ── Signal scoring and scanning ────────────────────────────────

function mlModelLoaded() { return typeof mlScore === 'function'; }

// Scan last nBars for pivot-low signals, return array sorted by score desc
function mlScanSignals(nBars) {
  if (!mlModelLoaded() || !DATA || DATA.length < 50) return [];
  _mlEnsureCache();

  const n = DATA.length;
  const start = Math.max(ML_PVL + ML_PVR, n - nBars);
  const results = [];

  for (let i = start + ML_PVR; i < n - 1; i++) {
    const idx = i - ML_PVR;
    if (idx < ML_PVL) continue;

    // Check if idx is a pivot low
    const v = DATA[idx].l;
    let ok = true;
    for (let j = idx - ML_PVL; j < idx; j++)        { if (DATA[j].l < v) { ok = false; break; } }
    if (ok) for (let j = idx + 1; j <= idx + ML_PVR; j++) { if (j < n && DATA[j].l <= v) { ok = false; break; } }
    if (!ok) continue;

    const feat = mlComputeFeatures(i);
    if (!feat) continue;

    let score;
    try { score = mlScore(feat); } catch(e) { continue; }
    if (typeof score !== 'number' || isNaN(score)) continue;

    results.push({ bar: i, time: DATA[i].t, close: DATA[i].c, score });
  }

  return results.sort((a, b) => b.score - a.score);
}
