// ============================================================
// ⚠️  CLAUDE: ЧИТАЙ MANIFEST.md ПЕРВЫМ ПЕРЕД ЛЮБЫМ ИЗМЕНЕНИЕМ
// Контрольный список критичных функций — в MANIFEST.md
// Проверяй его ДО и ПОСЛЕ каждой правки.
// ============================================================

// ============================================================
// USE_Optimizer_v6 — OPT  (optimizer + robustness engine)
// ============================================================
// Зависимости: DATA, HAS_VOLUME, results, favourites, equities
//              stopped, paused, $(), $v(), $c(), $n()
//              backtest + calc* из core.js
//
// SECTION A: parseRange  (18 строк)
// SECTION B: buildName  fmtNum  calcTotal  updatePreview  runOpt  (900+ строк)
// SECTION C: runMassRobust  runRobustScoreFor  runRobustScoreForDetailed  (330 строк)
// SECTION D: _robCache*  _fastCfgKey  _getDataHash  _robCacheLoad  (70 строк)
// ============================================================

// ##SECTION_A##
// RANGE PARSER
// ============================================================
function parseRange(id) {
  const v = $v(id);
  if (!v) return [];
  if (v.includes(':')) {
    const parts = v.split(':').map(Number);
    if (parts.length >= 3 && parts[2] > 0) {
      const arr = [];
      for (let x = parts[0]; x <= parts[1] + parts[2] * 0.0001; x += parts[2])
        arr.push(Math.round(x * 10000) / 10000);
      return arr;
    }
    return parts.filter(x => !isNaN(x));
  }
  return v.split(',').map(x => parseFloat(x.trim())).filter(x => !isNaN(x));
}

// ##SECTION_B##
// ── Statistical Significance (Hyp 3) ─────────────────────────
// z-тест win rate: уверенность что WR > 50% не случайна.
// Возвращает sig_pct [0..99].
function _calcStatSig(r) {
  if (!r || r.n < 2) return 0;
  const z = (r.wr / 100 - 0.5) / Math.sqrt(0.25 / r.n);
  if (z <= 0) return 0;
  const t = 1 / (1 + 0.2316419 * z);
  const p = (1/Math.sqrt(2*Math.PI)) * Math.exp(-z*z/2) *
    t*(0.319382+t*(-0.356564+t*(1.781478+t*(-1.821256+t*1.330274))));
  return Math.min(99, Math.max(0, Math.round((1 - p) * 100)));
}
// ─────────────────────────────────────────────────────────────

// ── GT-Score (Hyp 1) ──────────────────────────────────────────
// Антиовефиттинг метрика: (pnl/dd) × sig_mult × consistency_mult
// sig_mult     = 1 + clamp(z, 0, 3) × 0.3   [1.0 .. 1.9]
// consistMult  = 0.5 + clamp(1-dwr/100,0,1) × 0.5  [0.5 .. 1.0]
function _calcGTScore(r) {
  if (!r || r.n < 1) return -2;
  const pdd = r.dd > 0 ? r.pnl / r.dd : (r.pnl > 0 ? 50 : -2);
  if (pdd <= 0) return Math.max(-2, pdd);
  const z = (r.wr - 50) / Math.sqrt(2500 / Math.max(r.n, 1));
  const sigMult = 1 + Math.min(Math.max(z, 0), 3) * 0.3;
  const dwr = r.dwr !== undefined ? r.dwr : 0;
  const consistMult = 0.5 + Math.min(Math.max(1 - dwr / 100, 0), 1) * 0.5;
  return pdd * sigMult * consistMult;
}
// ─────────────────────────────────────────────────────────────

// ── CVR — Cross-Validation Robustness ────────────────────────
// Делит equity curve на 6 равных временных окон.
// CVR% = % окон с положительным PnL (0–100, выше = устойчивее).
// Смысл: защита от "всё заработано за один период" — стратегия
// должна быть прибыльна в большинстве временных сегментов.
// Основан на концепции CPCV (Bailey et al.) применительно к
// одиночной стратегии: temporal split вместо IS/OOS split.
function _calcCVR(eq) {
  if (!eq || eq.length < 100) return null;
  const N = eq.length, warmup = 50, nSplits = 6;
  const step = Math.floor((N - warmup) / nSplits);
  if (step < 15) return null;
  let wins = 0;
  for (let k = 0; k < nSplits; k++) {
    const s = warmup + k * step;
    const e = k === nSplits - 1 ? N - 1 : warmup + (k + 1) * step - 1;
    if (eq[e] - eq[s] > 0) wins++;
  }
  return Math.round(wins / nSplits * 100);
}
// ─────────────────────────────────────────────────────────────

// ── Ulcer Performance Index (Hyp 4) ──────────────────────────
// UPI = pnl / ulcerIdx, где ulcerIdx = sqrt(mean(dd_from_peak²))
// Лучше Calmar: учитывает длительность и частоту просадок,
// а не только максимум. Источник: quantstats 0.0.81 (2026).
// Возвращает null если данных мало или нет просадок.
function _calcUlcerIdx(eq) {
  if (!eq || eq.length < 20) return null;
  const N = eq.length;
  let peak = eq[0], sumSq = 0;
  for (let i = 0; i < N; i++) {
    if (eq[i] > peak) peak = eq[i];
    const dd = peak - eq[i];
    sumSq += dd * dd;
  }
  const ui = Math.sqrt(sumSq / N);
  if (ui < 0.001) return null;
  return Math.round(eq[N - 1] / ui * 10) / 10;
}
// ─────────────────────────────────────────────────────────────

// ── Sortino Ratio (поиск 2026-03-03-20) ──────────────────────
// Sortino = pnl / downside_dev
// downside_dev = sqrt( mean( min(Δeq_i, 0)² ) ) — только отриц. движения
// Отличие от UPI: штрафует за НЕСТАБИЛЬНОСТЬ потерь, а не глубину.
// Sortino ≥ 3 = отлично, ≥ 2 = хорошо, < 1 = плохо.
// eq — Float32Array из backtest() (кумулятивный PnL в %).
// Откат: удалить эту функцию + поле sortino во всех results.push() (opt.js)
//        + в _attachOOS.forward + _ncols/statsRow/table/filter/sort/col (ui.js)
//        + <th col-sor> и <th f_sortino> (shell.html)
function _calcSortino(eq) {
  if (!eq || eq.length < 10) return null;
  const N = eq.length;
  let sumSqDown = 0;
  for (let i = 1; i < N; i++) {
    const r = eq[i] - eq[i - 1];
    if (r < 0) sumSqDown += r * r;
  }
  const downDev = Math.sqrt(sumSqDown / (N - 1));
  if (downDev < 1e-9) return eq[N - 1] > 0 ? 99.9 : null;
  return Math.round(eq[N - 1] / downDev * 10) / 10;
}
// ─────────────────────────────────────────────────────────────

// ── K-Ratio (поиск 2026-03-03-20) ────────────────────────────
// K-Ratio = slope_of_OLS(eq) / se(slope)
// OLS: eq[i] ~ a + b·i. Высокий K = equity растёт равномерно.
// K ≥ 2 = отлично, ≥ 1 = хорошо, < 0.5 = нестабильно.
// Вычисляется лениво в showDetail (НЕ в горячем цикле).
// Откат: удалить эту функцию + блок ##KR_SQN## в showDetail (ui.js)
function _calcKRatio(eq) {
  if (!eq || eq.length < 20) return null;
  const N = eq.length;
  let sx = 0, sy = 0, sxy = 0, sx2 = 0;
  for (let i = 0; i < N; i++) { sx += i; sy += eq[i]; sxy += i * eq[i]; sx2 += i * i; }
  const den = N * sx2 - sx * sx;
  if (Math.abs(den) < 1e-10) return null;
  const b = (N * sxy - sx * sy) / den;
  const a = (sy - b * sx) / N;
  let ssr = 0;
  for (let i = 0; i < N; i++) { const e = eq[i] - (a + b * i); ssr += e * e; }
  const se = Math.sqrt(ssr / Math.max(N - 2, 1) / (sx2 - sx * sx / N));
  if (se < 1e-10) return b > 0 ? 99.9 : b < 0 ? -99.9 : null; // ровный тренд → макс. K-Ratio
  return Math.round(b / se * 10) / 10;
}
// ─────────────────────────────────────────────────────────────

// ── SQN — System Quality Number (поиск 2026-03-03-20) ────────
// SQN = (mean_trade / std_trade) × √n  (Van Tharp)
// SQN > 5 = excellent, 3–5 = good, 1–3 = average, < 1 = poor.
// Требует tradePnl[] из backtest() (core.js, cfg.collectTrades=true).
// Вычисляется лениво в showDetail (НЕ в горячем цикле).
// Откат: удалить эту функцию + блок ##KR_SQN## в showDetail (ui.js)
//        + revert core.js: collectTrades / _trPnl / tradePnl в return
function _calcSQN(tradePnlArr) {
  if (!tradePnlArr || tradePnlArr.length < 10) return null;
  const n = tradePnlArr.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += tradePnlArr[i];
  const mean = sum / n;
  let varSum = 0;
  for (let i = 0; i < n; i++) { const d = tradePnlArr[i] - mean; varSum += d * d; }
  const std = Math.sqrt(varSum / n);
  if (std < 1e-10) return mean > 0 ? 99.9 : null;
  return Math.round(mean / std * Math.sqrt(n) * 10) / 10;
}
// ─────────────────────────────────────────────────────────────

// ── Omega Ratio (поиск 2026-03-06) ───────────────────────────────
// Omega = Σmax(Δeq_i, 0) / |Σmin(Δeq_i, 0)|
// Profit factor на уровне баров: сумма приростов / сумма падений.
// Единственная метрика без предположения о нормальности распределения.
// Omega ≥ 2 = хорошо, ≥ 3 = отлично. Только equity[].
// Откат: удалить эту функцию + поле omega во всех results.push() (opt.js)
//        + batch-update omega (opt.js) + _attachOOS.forward (opt.js)
//        + _statsRow/table/filter/sort/col (ui.js) + col-omg / f_omega (shell.html)
function _calcOmega(eq) {
  if (!eq || eq.length < 10) return null;
  let up = 0, dn = 0;
  for (let i = 1; i < eq.length; i++) {
    const r = eq[i] - eq[i - 1];
    if (r > 0) up += r; else dn -= r;
  }
  if (dn < 1e-9) return up > 0 ? 99.9 : null;
  return Math.round(up / dn * 10) / 10;
}
// ─────────────────────────────────────────────────────────────────

// ── Pain Ratio (поиск 2026-03-06) ────────────────────────────────
// Pain Index = mean(|dd_from_peak[i]|) — средняя просадка от пика.
// Pain Ratio = pnl / Pain Index.
// Дополняет UPI: UPI штрафует за экстремумы (sqrt(mean(dd²))),
// Pain штрафует равномерно за длительность любой просадки.
// Pain ≥ 3 = хорошо, ≥ 5 = отлично. Только equity[].
// Откат: удалить эту функцию + поле pain во всех results.push() (opt.js)
//        + batch-update pain (opt.js) + _attachOOS.forward (opt.js)
//        + _statsRow/table/filter/sort/col (ui.js) + col-pain / f_pain (shell.html)
function _calcPainRatio(eq) {
  if (!eq || eq.length < 20) return null;
  const N = eq.length;
  let peak = eq[0], sumDD = 0;
  for (let i = 0; i < N; i++) {
    if (eq[i] > peak) peak = eq[i];
    sumDD += peak - eq[i];
  }
  const painIdx = sumDD / N;
  if (painIdx < 0.001) return null;
  return Math.round(eq[N - 1] / painIdx * 10) / 10;
}
// ─────────────────────────────────────────────────────────────────

// ── Burke Ratio ───────────────────────────────────────────────────
// Burke = PnL / sqrt(Σ di²), где di — глубина каждого отдельного события просадки.
// Отличие от Calmar: учитывает ВСЕ просадки (квадраты суммируются),
// не только максимальную. Стратегия с 10 просадками по 10% хуже,
// чем с одной просадкой 15%.
// Burke ≥ 2 = хорошо, ≥ 3 = отлично, < 0.5 = плохо.
// Откат: удалить эту функцию + поле burke во всех results.push() (opt.js)
//        + batch-update burke (opt.js) + _attachOOS.forward (opt.js)
//        + _statsRow/table/filter/sort/col (ui.js) + col-burke / f_burke (shell.html)
function _calcBurke(eq) {
  if (!eq || eq.length < 20) return null;
  const N = eq.length;
  let peak = eq[0], maxDepth = 0, sumSqDD = 0, inDD = false;
  for (let i = 1; i < N; i++) {
    if (eq[i] >= peak) {
      if (inDD) { sumSqDD += maxDepth * maxDepth; maxDepth = 0; inDD = false; }
      peak = eq[i];
    } else {
      const depth = peak - eq[i];
      if (depth > maxDepth) maxDepth = depth;
      inDD = true;
    }
  }
  if (inDD) sumSqDD += maxDepth * maxDepth; // финальная незакрытая просадка
  if (sumSqDD < 1e-9) return eq[N - 1] > 0 ? 99.9 : null;
  return Math.round(eq[N - 1] / Math.sqrt(sumSqDD) * 10) / 10;
}
// ─────────────────────────────────────────────────────────────────

// ── Serenity Index (Rosenthal 2012) ───────────────────────────────
// Serenity = PnL / (UlcerIndex × TailFactor)
// TailFactor = CVaR(5%) / mean(|negative bars|) — усиливает штраф
// когда хвостовые потери непропорционально хуже средних.
// Дополняет UPI: UPI не знает о "жирном хвосте" плохих дней.
// Serenity ≥ 5 = отлично, ≥ 3 = хорошо, < 1 = плохо.
// Откат: удалить эту функцию + поле serenity во всех results.push() (opt.js)
//        + batch-update serenity (opt.js) + _attachOOS.forward (opt.js)
//        + _statsRow/table/filter/sort/col (ui.js) + col-srnty / f_serenity (shell.html)
function _calcSerenity(eq) {
  if (!eq || eq.length < 20) return null;
  const N = eq.length;
  // Ulcer Index
  let peak = eq[0], sumSqUI = 0;
  for (let i = 0; i < N; i++) {
    if (eq[i] > peak) peak = eq[i];
    const dd = peak - eq[i];
    sumSqUI += dd * dd;
  }
  const ui = Math.sqrt(sumSqUI / N);
  if (ui < 0.001) return null;
  // Tail factor: CVaR(5%) / mean(|negative returns|)
  const neg = [];
  for (let i = 1; i < N; i++) { const r = eq[i] - eq[i - 1]; if (r < 0) neg.push(r); }
  if (neg.length === 0) return Math.round(eq[N - 1] / ui * 10) / 10;
  let sumNeg = 0;
  for (const r of neg) sumNeg += r;
  const meanNeg = -sumNeg / neg.length;
  neg.sort((a, b) => a - b); // ascending (worst first)
  const k = Math.max(1, Math.floor(neg.length * 0.05));
  let cvarSum = 0;
  for (let i = 0; i < k; i++) cvarSum += neg[i];
  const cvar5 = -cvarSum / k;
  const tailFactor = meanNeg > 0.001 ? Math.max(1, cvar5 / meanNeg) : 1;
  return Math.round(eq[N - 1] / (ui * tailFactor) * 10) / 10;
}
// ─────────────────────────────────────────────────────────────────

// ── Information Ratio — Tier 3 ────────────────────────────────────
// IR = mean(active_returns) / std(active_returns) × √252
// active_return[i] = Δeq[i] − buy_hold_return[i] (оба в % от init price)
// IR > 1.0 = хорошо, > 0.5 = добавляет ценность, < 0 = хуже buy&hold.
// Требует глобальный DATA (всегда доступен в opt.js).
// Откат: удалить функцию + поле ir во всех results.push(), _attachOOS.forward,
//        TPE batch, col-ir/f_ir в shell.html, фильтр/колонку/сортировку в ui.js
function _calcInfoRatio(eq) {
  if (!eq || eq.length < 30 || typeof DATA === 'undefined' || !DATA || DATA.length < eq.length) return null;
  const N = eq.length, c0 = DATA[0].c;
  if (!c0 || c0 <= 0) return null;
  let sumD = 0, sumD2 = 0;
  for (let i = 1; i < N; i++) {
    const stratR = eq[i] - eq[i - 1];
    const bhR    = (DATA[i].c - DATA[i - 1].c) / c0 * 100;
    const d      = stratR - bhR;
    sumD += d; sumD2 += d * d;
  }
  const n = N - 1, mean = sumD / n;
  const variance = sumD2 / n - mean * mean;
  if (variance < 1e-12) return mean > 0 ? 9.9 : null;
  return Math.round(mean / Math.sqrt(variance) * Math.sqrt(252) * 10) / 10;
}
// ─────────────────────────────────────────────────────────────────

// ── Normal CDF (shared utility) ────────────────────────────────────
// Abramowitz & Stegun 26.2.17, max error 7.5×10⁻⁸.
// Используется PSR и GP EI acquisition.
// Откат: удалить + убедиться что _calcPSR/_gpEI тоже удалены
function _normCDF(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const p = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const cdf = 1 - Math.exp(-0.5 * z * z) / 2.5066282746 * p;
  return z >= 0 ? cdf : 1 - cdf;
}
// ─────────────────────────────────────────────────────────────────

// ── Probabilistic Sharpe Ratio — Tier 3 ───────────────────────────
// PSR = Φ(√(n−1) × SR / √(1 − γ₁×SR + (γ₂+1)/4 × SR²))
// SR = mean/std сделок; γ₁ = skewness; γ₂ = excess kurtosis.
// Показывает % уверенности что SR > 0. PSR > 95% = статистически значимо.
// Требует tradePnl[] (cfg.collectTrades=true, доступен в showDetail).
// Откат: удалить + блок ##PSR в showDetail (ui.js)
function _calcPSR(tradePnlArr) {
  if (!tradePnlArr || tradePnlArr.length < 20) return null;
  const n = tradePnlArr.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += tradePnlArr[i];
  const mean = sum / n;
  let v2 = 0, v3 = 0, v4 = 0;
  for (let i = 0; i < n; i++) {
    const d = tradePnlArr[i] - mean;
    v2 += d * d; v3 += d * d * d; v4 += d * d * d * d;
  }
  const std = Math.sqrt(v2 / n);
  if (std < 1e-10) return mean > 0 ? 99.9 : null;
  const sr   = mean / std;
  const skew = v3 / (n * std * std * std);
  const kurt = v4 / (n * std * std * std * std) - 3; // excess kurtosis
  const denom2 = 1 - skew * sr + (kurt + 1) / 4 * sr * sr;
  if (denom2 <= 1e-10) return null;
  const z = Math.sqrt(n - 1) * sr / Math.sqrt(denom2);
  return Math.round(_normCDF(z) * 1000) / 10;
}
// ─────────────────────────────────────────────────────────────────

// ── Filter Ablation (Feature Importance) — Tier 3 ─────────────────
// Для каждого активного фильтра отключает его и запускает бэктест.
// delta > 0 → фильтр лишний (без него лучше). delta < 0 → фильтр важен.
// Вычисляется лениво только в showDetail, не в горячем цикле.
// Откат: удалить функцию + блок ##ABLATION в showDetail (ui.js)
function _calcFilterAblation(cfg) {
  try {
    const ind0  = _calcIndicators(cfg);
    const btc0  = buildBtCfg(cfg, ind0);
    const base  = backtest(ind0.pvLo, ind0.pvHi, ind0.atrArr, btc0);
    if (!base || base.n < 5) return null;
    const basePnl = base.pnl;
    const items = [];
    for (const f of FILTER_REGISTRY) {
      if (!cfg[f.flag]) continue;
      const cfgOff = Object.assign({}, cfg, { [f.flag]: false });
      const ind2   = _calcIndicators(cfgOff);
      const btc2   = buildBtCfg(cfgOff, ind2);
      const r2     = backtest(ind2.pvLo, ind2.pvHi, ind2.atrArr, btc2);
      items.push({ id: f.id, delta: Math.round(((r2 ? r2.pnl : basePnl) - basePnl) * 10) / 10 });
    }
    items.sort((a, b) => a.delta - b.delta); // важные (отрицательный delta) — вверху
    return { basePnl, items };
  } catch (_) { return null; }
}
// ─────────────────────────────────────────────────────────────────

// ── HMM Regime Detector — Tier 3 ─────────────────────────────────
// Gaussian HMM (2 состояния: bull/bear) на log-returns из DATA.
// Baum-Welch 5 итераций → Viterbi для меток состояний.
// Возвращает { bullPct, bearPct, regimes Int8Array, bullState, m0, m1, s0, s1, stayProb[] }
// Вычисляется лениво в showDetail. Откат: удалить + ##HMM / ##REGIME_PERF в ui.js
function _calcHMM() {
  if (!DATA || DATA.length < 100) return null;
  const N = DATA.length, M = N - 1;
  const obs = new Float64Array(M);
  for (let i = 1; i < N; i++) obs[i - 1] = Math.log(DATA[i].c / DATA[i - 1].c);
  // Init: split at median
  const sorted = Array.from(obs).sort((a, b) => a - b);
  const med = sorted[Math.floor(M / 2)];
  let m0 = 0, m1 = 0, c0 = 0, c1 = 0;
  for (let i = 0; i < M; i++) { if (obs[i] <= med) { m0 += obs[i]; c0++; } else { m1 += obs[i]; c1++; } }
  m0 /= c0 || 1; m1 /= c1 || 1;
  let s0 = 0, s1 = 0;
  for (let i = 0; i < M; i++) { const d = obs[i] - (obs[i] <= med ? m0 : m1); if (obs[i] <= med) s0 += d * d; else s1 += d * d; }
  s0 = Math.sqrt(s0 / (c0 || 1)) || 0.005; s1 = Math.sqrt(s1 / (c1 || 1)) || 0.005;
  let A = [[0.95, 0.05], [0.05, 0.95]], pi = [0.5, 0.5];
  const gPdf = (x, mu, sig) => Math.max(1e-300, Math.exp(-0.5 * ((x - mu) / sig) ** 2) / (sig * 2.5066282746));
  // Baum-Welch (5 iterations)
  for (let iter = 0; iter < 5; iter++) {
    const alpha = [], scale = new Float64Array(M);
    alpha.push([pi[0] * gPdf(obs[0], m0, s0), pi[1] * gPdf(obs[0], m1, s1)]);
    scale[0] = alpha[0][0] + alpha[0][1] || 1e-300; alpha[0][0] /= scale[0]; alpha[0][1] /= scale[0];
    for (let t = 1; t < M; t++) {
      const a0 = (alpha[t-1][0]*A[0][0] + alpha[t-1][1]*A[1][0]) * gPdf(obs[t], m0, s0);
      const a1 = (alpha[t-1][0]*A[0][1] + alpha[t-1][1]*A[1][1]) * gPdf(obs[t], m1, s1);
      scale[t] = a0 + a1 || 1e-300;
      alpha.push([a0 / scale[t], a1 / scale[t]]);
    }
    const beta = new Array(M); beta[M - 1] = [1, 1];
    for (let t = M - 2; t >= 0; t--) {
      const sc = scale[t + 1];
      beta[t] = [
        (A[0][0]*gPdf(obs[t+1],m0,s0)*beta[t+1][0] + A[0][1]*gPdf(obs[t+1],m1,s1)*beta[t+1][1]) / sc,
        (A[1][0]*gPdf(obs[t+1],m0,s0)*beta[t+1][0] + A[1][1]*gPdf(obs[t+1],m1,s1)*beta[t+1][1]) / sc
      ];
    }
    const gam = alpha.map((a, t) => { const s = a[0]*beta[t][0] + a[1]*beta[t][1] || 1e-300; return [a[0]*beta[t][0]/s, a[1]*beta[t][1]/s]; });
    pi = [gam[0][0], gam[0][1]];
    const newA = [[0, 0], [0, 0]], denomA = [0, 0];
    for (let t = 0; t < M - 1; t++) {
      for (let i = 0; i < 2; i++) {
        newA[i][0] += alpha[t][i]*A[i][0]*gPdf(obs[t+1],m0,s0)*beta[t+1][0]/scale[t+1];
        newA[i][1] += alpha[t][i]*A[i][1]*gPdf(obs[t+1],m1,s1)*beta[t+1][1]/scale[t+1];
        denomA[i] += gam[t][i];
      }
    }
    for (let i = 0; i < 2; i++) {
      const d = denomA[i] || 1e-10;
      const nm = (newA[i][0] + newA[i][1]) / d || 1;
      A[i][0] = newA[i][0] / d / nm; A[i][1] = newA[i][1] / d / nm;
    }
    let g0 = 0, g1 = 0, nm0 = 0, nm1 = 0;
    for (let t = 0; t < M; t++) { nm0 += gam[t][0]*obs[t]; g0 += gam[t][0]; nm1 += gam[t][1]*obs[t]; g1 += gam[t][1]; }
    m0 = nm0 / (g0 || 1); m1 = nm1 / (g1 || 1);
    let ns0 = 0, ns1 = 0;
    for (let t = 0; t < M; t++) { ns0 += gam[t][0]*(obs[t]-m0)**2; ns1 += gam[t][1]*(obs[t]-m1)**2; }
    s0 = Math.sqrt(ns0 / (g0 || 1)) || 0.005; s1 = Math.sqrt(ns1 / (g1 || 1)) || 0.005;
  }
  // Viterbi
  const delta = [[pi[0]*gPdf(obs[0],m0,s0), pi[1]*gPdf(obs[0],m1,s1)]];
  const psi = new Int8Array(M * 2);
  for (let t = 1; t < M; t++) {
    const row = [0, 0];
    for (let j = 0; j < 2; j++) {
      const cv = [delta[t-1][0]*A[0][j], delta[t-1][1]*A[1][j]];
      psi[t*2+j] = cv[0] >= cv[1] ? 0 : 1;
      row[j] = Math.max(cv[0], cv[1]) * gPdf(obs[t], j === 0 ? m0 : m1, j === 0 ? s0 : s1);
    }
    const sc = row[0] + row[1] || 1e-300;
    delta.push([row[0] / sc, row[1] / sc]);
  }
  const regimes = new Int8Array(M);
  regimes[M - 1] = delta[M - 1][0] > delta[M - 1][1] ? 0 : 1;
  for (let t = M - 2; t >= 0; t--) regimes[t] = psi[(t + 1) * 2 + regimes[t + 1]];
  const bullState = m0 > m1 ? 0 : 1;
  let bull = 0, bear = 0;
  for (let t = 0; t < M; t++) regimes[t] === bullState ? bull++ : bear++;
  return {
    bullPct: Math.round(bull / M * 100), bearPct: Math.round(bear / M * 100),
    regimes, bullState,
    m0: +(m0 * 100).toFixed(4), m1: +(m1 * 100).toFixed(4),
    s0: +(s0 * 100).toFixed(4), s1: +(s1 * 100).toFixed(4),
    stayProb: [+(A[0][0] * 100).toFixed(1), +(A[1][1] * 100).toFixed(1)]
  };
}
// ─────────────────────────────────────────────────────────────────

// ── Regime Performance (Adaptive Analysis) — Tier 3 ───────────────
// Разбивает equity curve по bull/bear режимам из HMM.
// Показывает PnL стратегии отдельно в трендовых vs боковых условиях.
// Вычисляется лениво в showDetail (параметр hmm передаётся из ##HMM блока).
// Откат: удалить функцию + блок ##REGIME_PERF в showDetail (ui.js)
function _calcRegimePerf(cfg, hmm) {
  if (!hmm || !hmm.regimes) return null;
  try {
    const ind = _calcIndicators(cfg);
    const btc = buildBtCfg(cfg, ind);
    const r   = backtest(ind.pvLo, ind.pvHi, ind.atrArr, btc);
    if (!r || r.n < 5) return null;
    const eq = r.eq, reg = hmm.regimes;
    const N  = Math.min(eq.length, reg.length + 1);
    let bullSum = 0, bearSum = 0, bullN = 0, bearN = 0;
    for (let i = 1; i < N; i++) {
      const d = eq[i] - eq[i - 1], ri = reg[i - 1];
      if (ri === hmm.bullState) { bullSum += d; bullN++; } else { bearSum += d; bearN++; }
    }
    return {
      bullPnl: Math.round(bullSum * 10) / 10, bullN,
      bearPnl: Math.round(bearSum * 10) / 10, bearN
    };
  } catch (_) { return null; }
}
// ─────────────────────────────────────────────────────────────────

// ── Kalman MA Builder — Tier 3 ────────────────────────────────────
// Скалярный Kalman фильтр для адаптивной MA.
// Q (process noise) адаптируется к ATR: при высокой волатильности → K↑ (быстрее).
// При низкой → K↓ (больше сглаживания). Параметр R (measurement noise) фиксирован.
// Возвращает Float64Array той же длины что prices.
// Откат: удалить функцию + kalmanArr в _calcIndicators/buildBtCfg + фильтр в filter_registry.js
function _buildKalmanMA(prices, baseLen) {
  const N = prices.length;
  const kArr = new Float64Array(N);
  if (N < 10) return kArr;
  let x = prices[0], P = 1.0;
  const halfL = Math.max(Math.floor(baseLen / 2), 2);
  for (let i = 0; i < N; i++) {
    const w = Math.min(i, halfL);
    let sumSq = 0;
    for (let j = i - w; j < i; j++) {
      const ret = (prices[j + 1] - prices[j]) / (prices[j] || 1);
      sumSq += ret * ret;
    }
    const Q = w > 0 ? sumSq / w : 0.001;
    P += Q;
    const K = P / (P + 1); // R normalised to 1
    x += K * (prices[i] - x);
    P *= (1 - K);
    kArr[i] = x;
  }
  return kArr;
}
// ─────────────────────────────────────────────────────────────────

// ── Gaussian Process helpers — Tier 3 (Bayesian Optimisation) ─────
// RBF kernel, Cholesky, GP predict, EI acquisition.
// Откат: удалить все _gp* функции + runBayesOpt + ##BAYES_OPT в ui.js / shell.html
function _gpCholesky(A, n) {
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i * n + j];
      for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
      L[i * n + j] = i === j ? Math.sqrt(Math.max(s, 1e-10)) : s / (L[j * n + j] || 1e-10);
    }
  }
  return L;
}
function _gpFwdSolve(L, b, n) {
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = b[i]; for (let j = 0; j < i; j++) s -= L[i*n+j]*x[j]; x[i] = s / (L[i*n+i] || 1e-10); }
  return x;
}
function _gpBwdSolve(L, b, n) {
  const x = new Float64Array(n);
  for (let i = n-1; i >= 0; i--) { let s = b[i]; for (let j = i+1; j < n; j++) s -= L[j*n+i]*x[j]; x[i] = s / (L[i*n+i] || 1e-10); }
  return x;
}
function _gpRBF(x1, x2, ls2) {
  let sq = 0; for (let i = 0; i < x1.length; i++) { const d = x1[i]-x2[i]; sq += d*d; } return Math.exp(-sq / (2 * ls2));
}
// Fit GP: return { L, alpha } for later prediction
function _gpFit(Xobs, yobs, noise) {
  const n = Xobs.length, ls2 = 1.0;
  const K = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) K[i*n+j] = _gpRBF(Xobs[i], Xobs[j], ls2) + (i===j ? noise : 0);
  const L = _gpCholesky(K, n);
  const tmp = _gpFwdSolve(L, yobs, n);
  const alpha = _gpBwdSolve(L, tmp, n);
  return { L, alpha, n, ls2 };
}
// Predict mu and sigma at xStar
function _gpPredict(gp, Xobs, xStar) {
  const { L, alpha, n, ls2 } = gp;
  const kStar = new Float64Array(n);
  for (let i = 0; i < n; i++) kStar[i] = _gpRBF(Xobs[i], xStar, ls2);
  let mu = 0; for (let i = 0; i < n; i++) mu += alpha[i] * kStar[i];
  const v = _gpFwdSolve(L, kStar, n);
  let kss = 1; for (let i = 0; i < n; i++) kss -= v[i] * v[i];
  return { mu, sigma: Math.sqrt(Math.max(kss, 1e-10)) };
}
// Expected Improvement
function _gpEI(mu, sigma, yBest) {
  if (sigma < 1e-10) return 0;
  const z = (mu - yBest) / sigma;
  return (mu - yBest) * _normCDF(z) + sigma * Math.exp(-0.5 * z * z) / 2.5066282746;
}
// ─────────────────────────────────────────────────────────────────

// ── Information Criteria: AIC / BIC / MDL ────────────────────────
// Основаны на биномиальной модели WR: logL = n_w·ln(WR) + n_l·ln(1-WR)
// k = число активных use* флагов в cfg (= число независимых правил стратегии)
// AIC  = 2k − 2·logL            (штраф пропорционален k)
// BIC  = k·ln(n) − 2·logL      (штраф растёт с объёмом данных, строже AIC)
// MDL  = BIC / 2                (в битах, информационная трактовка)
// ΔBIC = BIC_null − BIC_actual  (превышение над случайной стратегией с WR=50%)
//        > 0 = стратегия лучше случайной, > 10 = существенно лучше
// AIC/BIC используются для СРАВНЕНИЯ стратегий между собой:
// более сложная стратегия (высокое k) с той же WR получает ХУДШИЙ (больший) BIC.
// Откат: удалить эти функции + ##AIC_BIC_MDL## блок в showDetail (ui.js)
function _countCfgParams(cfg) {
  if (!cfg) return 2;
  let k = 2; // базовые 2: вход + управление позицией всегда присутствуют
  for (const val of Object.values(cfg)) {
    if (val === true) k++; // каждый активный use* флаг = +1 правило
  }
  return Math.max(k, 2);
}

function _calcInfoCriteria(n, wr, cfg) {
  if (!n || n < 5 || wr == null) return null;
  const p = wr / 100;
  if (p <= 0.001 || p >= 0.999) return null;
  const nw = Math.round(n * p), nl = n - nw;
  if (nw < 1 || nl < 1) return null;
  const logL = nw * Math.log(p) + nl * Math.log(1 - p);
  const k    = _countCfgParams(cfg);
  const aic  = 2 * k - 2 * logL;
  const bic  = k * Math.log(n) - 2 * logL;
  const mdl  = bic / 2;
  // ΔBIC: превышение над null-моделью (WR=50%, те же k)
  // BIC_null = k·ln(n) + 2n·ln(2); k·ln(n) сокращается → ΔBIC = 2n·ln(2) + 2·logL
  const deltaBic = 2 * n * Math.LN2 + 2 * logL;
  return { k, aic: Math.round(aic * 10) / 10, bic: Math.round(bic * 10) / 10,
           mdl: Math.round(mdl * 10) / 10, deltaBic: Math.round(deltaBic * 10) / 10 };
}
// ─────────────────────────────────────────────────────────────────

// ── MC Permutation Test (поиск 2026-03-06) ───────────────────────
// p-value = доля из 1000 случайных перемешиваний сделок,
// где shuffled Calmar ≥ actual Calmar.
// Тестирует: результат стратегии — скилл или удача порядка сделок?
// p < 0.05 = значимо, p < 0.01 = очень значимо.
// Требует tradePnl[] из backtest() (collectTrades=true).
// Вычисляется лениво в showDetail (НЕ в горячем цикле).
// Откат: удалить эту функцию + блок ##MC_PERM## в showDetail (ui.js)
//        + collectTrades=true в ##KR_SQN## блоке (ui.js)
function _calcMCPerm(tradePnlArr) {
  if (!tradePnlArr || tradePnlArr.length < 10) return null;
  const arr = tradePnlArr.slice();
  const n = arr.length;
  let eq = 0, peak = 0, actualDD = 0;
  for (let i = 0; i < n; i++) {
    eq += arr[i];
    if (eq > peak) peak = eq;
    const d = peak - eq; if (d > actualDD) actualDD = d;
  }
  const totalPnL = eq;
  if (totalPnL <= 0) return null; // убыточная стратегия — тест не имеет смысла
  const actualCalmar = actualDD > 1e-9 ? totalPnL / actualDD : 99;
  let betterCount = 0;
  for (let k = 0; k < 1000; k++) {
    for (let i = n - 1; i > 0; i--) { // Fisher-Yates shuffle
      const j = (Math.random() * (i + 1)) | 0;
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    eq = 0; peak = 0; let dd = 0;
    for (let i = 0; i < n; i++) {
      eq += arr[i];
      if (eq > peak) peak = eq;
      const d = peak - eq; if (d > dd) dd = d;
    }
    const calmar = dd > 1e-9 ? totalPnL / dd : 99;
    if (calmar >= actualCalmar) betterCount++;
  }
  return Math.round(betterCount / 1000 * 1000) / 1000; // 3 знака после запятой
}
// ─────────────────────────────────────────────────────────────────

// ── CPCV batch: вычисляет CPCV для топ-N результатов (асинхронно) ──
async function _batchCPCV(arr, limit) {
  const n = Math.min(arr.length, limit || 200);
  if (n === 0 || !DATA || DATA.length < 300) return;
  if (typeof setMcPhase === 'function') setMcPhase(`⏳ CPCV ${n} результатов…`);
  for (let i = 0; i < n; i++) {
    if (!arr[i].cfg) continue;
    const _c = _calcCPCVScore(arr[i].cfg);
    if (_c) arr[i].cpcvScore = _c.score;
    if (i % 30 === 0) await yieldToUI();
  }
  if (typeof setMcPhase === 'function') setMcPhase(null);
}

// ── CPCV: Block Walk-Forward Score (Hyp 1 — CPCV валидация) ──
// Делит DATA на K равных временных блоков, запускает backtest
// независимо на каждом. Надёжнее CVR: отдельный прогрев
// индикаторов на каждом блоке устраняет look-ahead bias.
//
// score % = доля блоков с PnL > 0 из имеющих ≥ 2 сделки.
// Вызывается ЛЕНИВО (в showDetail), НЕ во время оптимизации.
//
// Откат: удалить эту функцию + блок ##CPCV## в showDetail (ui.js)
function _calcCPCVScore(cfg) {
  if (!DATA || DATA.length < 300) return null;
  const N = DATA.length;
  const nSplits = N >= 500 ? 5 : 4;
  const blockSize = Math.floor(N / nSplits);
  if (blockSize < 75) return null;

  let wins = 0, valid = 0;
  const blocks = [];
  for (let k = 0; k < nSplits; k++) {
    const s = k * blockSize;
    const e = k === nSplits - 1 ? N : s + blockSize;
    const origDATA = DATA;
    DATA = origDATA.slice(s, e);
    let r = null;
    try {
      const ind   = _calcIndicators(cfg);
      const btCfg = buildBtCfg(cfg, ind);
      r = backtest(ind.pvLo, ind.pvHi, ind.atrArr, btCfg);
    } catch(_) {}
    DATA = origDATA;
    if (!r || r.n < 2) { blocks.push(null); continue; }
    valid++;
    if (r.pnl > 0) wins++;
    blocks.push({ pnl: r.pnl, n: r.n, wr: Math.round(r.wr) });
  }

  if (valid < 3) return null;
  return { score: Math.round(wins / valid * 100), wins, valid, blocks };
}
// ─────────────────────────────────────────────────────────────

// NAME BUILDER — подробный
// ============================================================
function buildName(cfg, pvL, pvR, slDesc, tpDesc, filters, extras) {
  const parts = [];
  const ex = extras||{};

  // Entry patterns — из ENTRY_REGISTRY
  const entries = [];
  const _cfgForName = Object.assign({}, cfg, { pvL, pvR }); // pvL/pvR доступны как параметры buildName
  for (const _e of ENTRY_REGISTRY) {
    if (cfg[_e.flag]) entries.push(_e.shortName(_cfgForName, ex));
  }
  if (entries.length === 0) entries.push('NoEntry');
  parts.push(entries.join('+'));
  // TL pivot params — include in name so variants with different pivots are unique
  if ((cfg.useTLTouch||cfg.useTLBreak||cfg.useFlag||cfg.useTri) && cfg.tlPvL != null)
    parts.push(`pv${cfg.tlPvL}/${cfg.tlPvR}`);

  // ATR period — always include so variants with different atrP are unique
  if (ex.atrP != null) parts.push(`ATR${ex.atrP}`);

  // SL
  parts.push(slDesc);

  // TP
  parts.push(tpDesc);

  // Exits
  const exits = [];
  if (cfg.useBE) exits.push(`BE(t${cfg.beTrig}o${cfg.beOff})`);
  if (cfg.useTrail) exits.push(`Trail(t${cfg.trTrig}d${cfg.trDist})`);
  if (cfg.useRev) { let _rs=`RevSig(mb${cfg.revBars})`; if(cfg.revSkip) _rs+=`sk${cfg.revSkip}`; if(cfg.revCooldown) _rs+=`cd${cfg.revCooldown}`; exits.push(_rs); }
  if (cfg.useTime) exits.push(`Time${cfg.timeBars}`);
  if (cfg.usePartial) exits.push(`Partial${cfg.partPct}%`);
  if (cfg.useClimax) exits.push('Clmx');
  if (cfg.useStExit) exits.push(`STex(${cfg.stAtrP||10},${cfg.stMult||3})`);
  if (exits.length>0) parts.push(exits.join('+'));
  // Delay
  if (cfg.waitBars > 0 || cfg.waitRetrace) {
    let _wd = `Wait(`;
    if (cfg.waitBars > 0) _wd += `b${cfg.waitBars}`;
    if (cfg.waitRetrace) _wd += (cfg.waitBars > 0 ? '+' : '') + 'Ret';
    parts.push(_wd + ')');
  }

  // Filters — из FILTER_REGISTRY
  const filts = [];
  for (const _f of FILTER_REGISTRY) {
    if (!cfg[_f.flag]) continue;
    const _label = _f.nameLabel(cfg, ex);
    if (_label) filts.push(_label);
  }
  if (filts.length > 0) parts.push('[' + filts.join('|') + ']');

  return parts.join(' ');
}

// ============================================================
// MAIN OPTIMIZER
// ============================================================
function fmtNum(n) {
  return Math.round(n).toLocaleString('ru-RU');
}

function calcTotal() {
  if (!DATA) return 0;
  const usePv=$c('e_pv'),useAdx=$c('f_adx'),useRsi=$c('f_rsi');
  const useVolF=$c('f_volf'),useMaDist=$c('f_madist'),useFresh=$c('f_fresh');
  const useTrail=$c('x_tr'),useBE=$c('x_be'),useTime=$c('x_time');
  const useVSA=HAS_VOLUME&&$c('f_vsa'),useWT=HAS_VOLUME&&$c('f_wt');
  const useAtrBo=$c('e_atrbo');
  const pvLs=usePv?parseRange('e_pvl'):[5];
  const pvRs=usePv?parseRange('e_pvr'):[2];
  const atrPs=parseRange('c_atr');
  const maPs=$c('f_ma')?parseRange('f_map'):[0];
  const adxTs=useAdx?parseRange('f_adxt'):[0];
  const rsiOSA=useRsi?parseRange('f_rsios'):[30];
  const rsiOBA=useRsi?parseRange('f_rsiob'):[70];
  let rsiCount=0;
  if(useRsi){rsiOSA.forEach(os=>{rsiOBA.forEach(ob=>{if(os<ob)rsiCount++;});})}
  else rsiCount=1;
  const vfMs=useVolF?parseRange('f_vfm'):[0];
  const mdMaxs=useMaDist?parseRange('f_madv'):[0];
  const freshMaxs=useFresh?parseRange('f_freshm'):[20];
  const beOffs=useBE?parseRange('x_beo'):[0];
  const beTrigs_ct=useBE?parseRange('x_bet'):[1];
  let beCount=1;
  if(useBE){let v=0;beTrigs_ct.forEach(t=>{beOffs.forEach(o=>{if(o<t)v++;});});beCount=v||1;}
  const trTrigs=useTrail?parseRange('x_trt'):[1.5];
  const trDists=useTrail?parseRange('x_trd'):[1.0];
  const timeBarsA=useTime?parseRange('x_timeb'):[50];
  const revBarsA=($c('x_rev')&&$v('x_revb'))?parseRange('x_revb'):[2];
  const revSkipA=$c('x_rev')?parseRange('x_revskip'):[0];
  const revCooldownA=$c('x_rev')?parseRange('x_revcd'):[0];
  const wtTs=useWT?parseRange('f_wtt'):[0];
  const vsaMs=useVSA?parseRange('f_vsam'):[0];
  const atrBoMs=useAtrBo?parseRange('e_atbm'):[2.0];
  let slCfgs=[];
  if($c('s_atr')) parseRange('s_atrv').forEach(v=>slCfgs.push({type:'atr',m:v}));
  if($c('s_pct')) parseRange('s_pctv').forEach(v=>slCfgs.push({type:'pct',m:v}));
  const slA=slCfgs.filter(s=>s.type==='atr'),slP=slCfgs.filter(s=>s.type==='pct');
  let slCount=slA.length&&slP.length ? slA.length*slP.length+slA.length+slP.length : slCfgs.length||1;
  let tpCfgs=[];
  if($c('t_rr')) parseRange('t_rrv').forEach(v=>tpCfgs.push({type:'rr',m:v}));
  if($c('t_atr')) parseRange('t_atrv').forEach(v=>tpCfgs.push({type:'atr',m:v}));
  if($c('t_pct')) parseRange('t_pctv').forEach(v=>tpCfgs.push({type:'pct',m:v}));
  const activeTp=['rr','atr','pct'].filter(t=>tpCfgs.some(x=>x.type===t));
  let tpCount=activeTp.length>=2 ?
    tpCfgs.filter(t=>t.type===activeTp[0]).length*tpCfgs.filter(t=>t.type===activeTp[1]).length+tpCfgs.length :
    tpCfgs.length||1;
  const _ctAdxL=$c('f_adx')?parseRange('f_adxl'):[$n('f_adxl')||14];
  const _ctAdxHtf=$c('f_adx')?parseRange('f_adx_htf'):[1];
  const _ctAtrExpMs=$c('f_atrexp')?parseRange('f_atrexpm'):[0];
  const _ctStw=$c('f_strend')?parseRange('f_stw'):[$n('f_stw')||10];
  const _ctConf=$c('f_confirm')?parseRange('f_confn'):[100];
  const _useTF=$c('e_tl_touch')||$c('e_tl_break')||$c('e_flag')||$c('e_tri');
  const _ctTlPvL=_useTF?parseRange('e_tl_pvl'):[5];
  const _ctTlPvR=_useTF?parseRange('e_tl_pvr'):[3];
  return pvLs.length*pvRs.length*atrPs.length*(maPs.length||1)*
    (adxTs.length||1)*(_ctAdxL.length||1)*(_ctAdxHtf.length||1)*rsiCount*(vfMs.length||1)*(_ctAtrExpMs.length||1)*(mdMaxs.length||1)*
    slCount*tpCount*beCount*(trTrigs.length||1)*(trDists.length||1)*
    (timeBarsA.length||1)*(freshMaxs.length||1)*(wtTs.length||1)*
    (vsaMs.length||1)*(atrBoMs.length||1)*(revBarsA.length||1)*
    (revSkipA.length||1)*(revCooldownA.length||1)*
    (_ctConf.length||1)*(_ctStw.length||1)*
    (_ctTlPvL.length||1)*(_ctTlPvR.length||1);
}

function updatePreview() {
  if (!DATA) return;
  const t = calcTotal();
  $('prog').textContent = '≈ '+fmtNum(t)+' вар.';
}

async function runOpt() {
  if (!DATA) {
    if (typeof _setSynthProgress !== 'undefined') _setSynthProgress(0, '❌ Нет данных для оптимизации');
    return;
  }
  stopped=false; paused=false; results=[]; equities={};
  resultCache.clear();
  const _resultNames = new Set(); // П.1: дедупликация
  $('tb').innerHTML=''; $('bst').style.display='none'; $('eqc').style.display='none';
  // Show pause/stop, hide run
  $('rbtn').style.display='none';
  $('pbtn').style.display='inline-block'; $('pbtn').textContent='⏸ Пауза';
  $('pbtn').style.background=''; $('pbtn').style.borderColor=''; $('pbtn').style.color='';
  $('sbtn').style.display='inline-block';
  $('pbar').style.width='0%';
  _t0 = Date.now();

  // Synthesis mode logging
  const _isSynthMode = optMode === 'synthesis';
  if (_isSynthMode && typeof _setSynthProgress !== 'undefined') {
    _setSynthProgress(15, '📈 ' + DATA.length + ' баров данных загружено');
  }

  const N=DATA.length;
  const closes=DATA.map(r=>r.c);
  const volumes=DATA.map(r=>r.v);

  // ── IS/OOS разделение ────────────────────────────────────────────────────
  // Если включено: оптимизация на IS, автопроверка на OOS после нахождения результата
  // IS = первые 70% данных, оптимизатор их не видит OOS = последние 30%
  // Три варианта OOS для перекрёстной проверки:
  //   forward:  IS=0..70%,  OOS=70..100%
  //   backward: IS=30..100%, OOS=0..30%
  //   middle:   IS=15..85%, OOS=0..15% + 85..100%
  const _useOOS = $c('c_oos');
  const _fullDATA = DATA; // сохраняем полный массив для восстановления после IS-бэктеста
  const _isN   = _useOOS ? Math.floor(N * 0.70) : N;
  const _isData = _useOOS ? DATA.slice(0, _isN) : DATA; // для forward IS
  // OOS срезы (для прогона после оптимизации)
  const _oosForwardData  = _useOOS ? DATA.slice(_isN) : null;                          // 70-100%
  const _oosBackwardData = _useOOS ? DATA.slice(0, Math.floor(N * 0.30)) : null;        // 0-30%
  const _oosMiddleData   = _useOOS ? [                                                  // 0-15% + 85-100%
    ...DATA.slice(0, Math.floor(N * 0.15)),
    ...DATA.slice(Math.floor(N * 0.85))
  ] : null;
  // backward IS = 30-100% (для backward OOS прогона нужен отдельный IS)
  const _isBackwardData  = _useOOS ? DATA.slice(Math.floor(N * 0.30)) : null;
  const _isMiddleData    = _useOOS ? DATA.slice(Math.floor(N * 0.15), Math.floor(N * 0.85)) : null;

  // Хелпер: прогнать cfg на срезе данных, возвращает {pnl, wr, n, dd} или null
  function _runOOS(slice, cfg) {
    if (!slice || slice.length < 50) return null;
    const origDATA = DATA;
    DATA = slice;
    try {
      const ind   = _calcIndicators(cfg);
      const btCfg = buildBtCfg(cfg, ind);
      return backtest(ind.pvLo, ind.pvHi, ind.atrArr, btCfg);
    } catch(e) { console.error('[_runOOS] exception:', e, cfg); return null; }
    finally { DATA = origDATA; }
  }

  // Хелпер: добавить OOS результаты в cfg после нахождения результата.
  // name — ключ в глобальном equities; если передан, обновляет equities полной equity-кривой.
  // isTradeN — количество сделок IS-прогона (для диагностики IS > TV инверсии).
  function _attachOOS(cfg, name, isTradeN) {
    if (!_useOOS) return;
    // Запускаем бэктест на ПОЛНЫХ данных для непрерывной equity-кривой.
    // Делим её по _isN: нет проблемы прогрева индикаторов в OOS-части.
    const rFull = _runOOS(_fullDATA, cfg);
    cfg._oos = { forward: null, isPct: Math.round(_isN / N * 100) };
    // Диагностика: IS сделок не может быть больше TV сделок (оба прогона с bar 0).
    if (rFull && typeof isTradeN === 'number' && isTradeN > rFull.n) {
      console.warn('[_attachOOS] IS > TV trades:', isTradeN, '>', rFull.n, cfg);
    }
    if (!rFull || !rFull.eq || rFull.eq.length < _isN + 5) return;
    const eq       = rFull.eq;
    const N_eq     = eq.length;
    const splitIdx = Math.min(_isN - 1, N_eq - 2);
    const isGain   = eq[splitIdx];                       // IS PnL (0..splitIdx bars)
    const oosGain  = eq[N_eq - 1] - isGain;             // OOS PnL (splitIdx..end bars)
    const isRate   = splitIdx > 0 ? isGain / (splitIdx + 1) : 0;  // PnL per bar (IS)
    const oosBars  = N_eq - 1 - splitIdx;
    const oosRate  = oosBars > 0 ? oosGain / oosBars : 0;         // PnL per bar (OOS)
    // IS должен значимо вносить вклад, иначе retention не имеет смысла.
    // Частый ложный случай: стратегия с большой IS-просадкой восстанавливается
    // к ~0 к моменту split → isGain≈0 → oosRate/isRate→∞ → ложные тысячи %.
    const totalGain = eq[N_eq - 1];
    const minIsGain = totalGain > 0 ? Math.max(totalGain * 0.4, 0.1) : 0.1;
    let retention;
    if (isGain < minIsGain) {
      // IS не вырос значимо — стратегия НЕ является равномерно растущей
      retention = -1;
    } else if (oosGain <= 0) {
      // OOS убыточный: отрицательный retention, ограничен -2x
      retention = Math.max(oosRate / isRate, -2.0);
    } else {
      // Оба периода прибыльны: отношение скоростей роста, ограничено 2x сверху
      retention = Math.min(oosRate / isRate, 2.0);
    }
    const pddFull = rFull.dd > 0 ? rFull.pnl / rFull.dd : (rFull.pnl > 0 ? 50 : 0);
    cfg._oos.forward = { pnl: oosGain, retention, isGain, n: rFull.n, wr: rFull.wr, dd: rFull.dd,
      pnlFull: rFull.pnl, avg: rFull.avg, pdd: pddFull,
      dwr: rFull.dwr, p1: rFull.p1, p2: rFull.p2, c1: rFull.c1, c2: rFull.c2,
      wrL: rFull.wrL??null, nL: rFull.nL||0, wrS: rFull.wrS??null, nS: rFull.nS||0,
      dwrLS: rFull.dwrLS??null, cvr: _calcCVR(rFull.eq), upi: _calcUlcerIdx(rFull.eq),
      sortino: _calcSortino(rFull.eq), kRatio: _calcKRatio(rFull.eq), sqn: rFull.sqn??null,
      omega: _calcOmega(rFull.eq), pain: _calcPainRatio(rFull.eq),
      burke: _calcBurke(rFull.eq), serenity: _calcSerenity(rFull.eq),
      ir: _calcInfoRatio(rFull.eq) }; // ##OMG ##PAIN ##BURKE ##SRNTY ##IR
    // Обновляем глобальный equities полной кривой — чтобы график показывал 100% данных
    // с правильным split-маркером на IS/OOS границе, а не растянутую IS-кривую.
    if (name && typeof equities !== 'undefined') equities[name] = rFull.eq;
  }
  const comm=$n('c_comm')||0.08;
  const spread=($n('c_spread')||0)/2; // спред делим на 2 стороны (как комиссия)
  const commTotal = comm + spread; // итоговая стоимость одной стороны сделки
  const minTrades=$n('c_mint')||30;
  const maxDD=$n('c_maxdd')||300;
  const _useGT = $c('c_use_gt');

  // Entry flags
  const usePv=$c('e_pv'),useEng=$c('e_eng'),usePin=$c('e_pin');
  const useBol=$c('e_bol'),useDon=$c('e_don'),useAtrBo=$c('e_atrbo');
  const useMaT=$c('e_mat'),useSqz=$c('e_sqz');

  // Trendline figures flags
  const useTLTouch=$c('e_tl_touch');
  const useTLBreak=$c('e_tl_break');
  const useFlag=$c('e_flag');
  const useTri=$c('e_tri');
  const useTrendFigures=useTLTouch||useTLBreak||useFlag||useTri;

  // New entry flags
  const useRsiExit  = $c('e_rsix');
  const useMaCross    = $c('e_macr');
  const useFreeEntry  = $c('e_free');
  const useMacd       = $c('e_macd');
  const useStochExit  = $c('e_stx');
  const useVolMove    = HAS_VOLUME && $c('e_volmv');
  const useInsideBar  = $c('e_inb');
  const useNReversal  = $c('e_nrev');
  const useSupertrend = $c('e_st');
  const useStExit     = $c('x_st');
  const useWaitEntry  = $c('e_wait_on');
  const useWaitRetrace= useWaitEntry && $c('e_wait_retrace');
  const useEIS        = $c('e_eis');
  const useSoldiers   = $c('e_soldiers');

  // Filter flags
  const useMa=$c('f_ma'),useAdx=$c('f_adx'),useRsi=$c('f_rsi');
  const useVolF=$c('f_volf'),useStruct=$c('f_struct'),useMaDist=$c('f_madist');
  const useCandleF=$c('f_candle'),useConsec=$c('f_consec');
  const useSTrend=$c('f_strend'),useFresh=$c('f_fresh');
  const useAtrExp=$c('f_atrexp');
  const useAdxSlope=$c('f_adx_slope');
  const adxSlopeBars=$n('f_adx_slope_bars')||3;
  const useConfirm=$c('f_confirm');
  const confNArr=useConfirm?parseRange('f_confn'):[100];
  const confMatType=document.getElementById('f_conf_mat')?.value||'EMA';
  // Sweep MA types: если галочка включена — перебираем все три типа
  const _sweepMaTypes=$c('f_ma_sweep_types');
  const _sweepConfTypes=$c('f_conf_sweep_types');
  const _sweepMaCrossTypes=$c('e_macr_sweep_types');
  const confM=3; // не используется (оставлено для совместимости)
  const structHH=2; // убрано из USE — поле f_strpvl/f_strpvr используются

  // Volume filters
  const useVSA=HAS_VOLUME&&$c('f_vsa');
  const useLiq=HAS_VOLUME&&$c('f_liq');
  const useVolDir=HAS_VOLUME&&$c('f_vdir');
  const useClimaxExit=HAS_VOLUME&&$c('f_clx');
  const useWT=HAS_VOLUME&&$c('f_wt');
  const useFat=HAS_VOLUME&&$c('f_fat');
  // New filters
  const useMacdFilter = $c('f_macd');
  const useER         = $c('f_er');
  const erThresh      = $n('f_ert') || 0.3;
  const useKalmanMA   = $c('f_kalman');      // ##KALMAN_MA##
  const kalmanLen     = $n('f_kalmanl') || 20; // ##KALMAN_MA##

  // ── Powerset фильтров ────────────────────────────────────────────────
  // Перебирает все 2^N комбинаций включённых фильтров.
  // Каждый элемент _filterCombos — объект {useMa, useAdx, ...} с bool-флагами.
  // Флаги только для тех фильтров, которые вообще включены пользователем.
  // При powerset=off: единственный элемент {} → все флаги берутся из внешней области.
  const _usePowerset = $c('c_powerset');
  const _psFilterDefs = [
    {key:'useMa',     active:useMa},
    {key:'useAdx',    active:useAdx},
    {key:'useRsi',    active:useRsi},
    {key:'useVolF',   active:useVolF},
    {key:'useStruct', active:useStruct},
    {key:'useMaDist', active:useMaDist},
    {key:'useCandleF',active:useCandleF},
    {key:'useConsec', active:useConsec},
    {key:'useSTrend', active:useSTrend},
    {key:'useFresh',  active:useFresh},
    {key:'useAtrExp', active:useAtrExp},
    {key:'useConfirm',active:useConfirm},
    {key:'useVSA',    active:useVSA},
    {key:'useLiq',    active:useLiq},
    {key:'useVolDir', active:useVolDir},
    {key:'useWT',         active:useWT},
    {key:'useFat',        active:useFat},
    {key:'useMacdFilter', active:useMacdFilter},
    {key:'useER',         active:useER},
    {key:'useKalmanMA',   active:useKalmanMA}, // ##KALMAN_MA##
  ].filter(f => f.active); // только те что включены
  let _filterCombos;
  if (_usePowerset && _psFilterDefs.length > 0) {
    const _psN = _psFilterDefs.length;
    _filterCombos = [];
    for (let _mask = 0; _mask < (1 << _psN); _mask++) {
      const combo = {};
      for (let i = 0; i < _psN; i++) combo[_psFilterDefs[i].key] = !!(_mask & (1 << i));
      _filterCombos.push(combo);
    }
  } else {
    _filterCombos = [{}]; // один пустой комбо → флаги из внешней области (стандартный режим)
  }
  // Предупреждение если много комбо
  if (_usePowerset && _psFilterDefs.length > 10) {
    console.warn('[powerset] Активных фильтров:', _psFilterDefs.length, '→', _filterCombos.length, 'комбинаций');
  }

  // Exit flags
  const useBE=$c('x_be'),useTrail=$c('x_tr'),useRev=$c('x_rev');
  const revSrc=document.querySelector('.xmode-btn.active[id^="revsrc_"]')?.id?.replace('revsrc_','')||'same';
  const revSkipArr=useRev?parseRange('x_revskip'):[0];
  const revCooldownArr=useRev?parseRange('x_revcd'):[0];
  if(!revSkipArr.length) revSkipArr.push(0);
  if(!revCooldownArr.length) revCooldownArr.push(0);
  const useTime=$c('x_time'),usePartial=$c('x_part');
  const partBE=$c('x_partbe');

  // Ranges
  const pvLs=usePv?parseRange('e_pvl'):[5];
  const pvRs=usePv?parseRange('e_pvr'):[2];
  const atrPs=parseRange('c_atr');
  const maPs=useMa?parseRange('f_map'):[0];
  const maTypeArr=useMa?(_sweepMaTypes?['EMA','SMA','WMA']:[$v('f_mat')||'EMA']):['EMA'];
  const htfRatioArr=useMa?parseRange('f_ma_htf'):[1];
  const confTypeArr=useConfirm?(_sweepConfTypes?['EMA','SMA','WMA']:[confMatType]):['EMA'];
  const confHtfArr=useConfirm?parseRange('f_conf_htf'):[1];
  const maCrossTypeArr=$c('e_macr')?(_sweepMaCrossTypes?['EMA','SMA','WMA']:[$v('e_macr_t')||'EMA']):['EMA'];
  const adxTs=useAdx?parseRange('f_adxt'):[0];
  const adxHtfArr=useAdx?parseRange('f_adx_htf'):[1];
  const atrExpMs=useAtrExp?parseRange('f_atrexpm'):[0];
  const vfMs=useVolF?parseRange('f_vfm'):[0];
  const mdMaxs=useMaDist?parseRange('f_madv'):[0];
  const wtThreshs=useWT?parseRange('f_wtt'):[0];
  const freshMaxs=useFresh?parseRange('f_freshm'):[20];
  const beOffs=useBE?parseRange('x_beo'):[0];
  if(!beOffs.length) beOffs.push(0);
  const trTrigs=useTrail?parseRange('x_trt'):[1.5];
  const trDists=useTrail?parseRange('x_trd'):[1.0];
  const timeBarsArr=useTime?parseRange('x_timeb'):[50];

  // SL configs
  let slCfgs=[];
  if ($c('s_atr')) parseRange('s_atrv').forEach(v=>slCfgs.push({type:'atr',m:v}));
  if ($c('s_pct')) parseRange('s_pctv').forEach(v=>slCfgs.push({type:'pct',m:v}));
  // Combinations AND/OR: generate pairs if both enabled
  let slPairs=[];
  const slATRs=slCfgs.filter(s=>s.type==='atr');
  const slPCTs=slCfgs.filter(s=>s.type==='pct');
  if (slATRs.length&&slPCTs.length) {
    // Both enabled: combine each ATR with each PCT
    slATRs.forEach(a=>{ slPCTs.forEach(p=>{ slPairs.push({a,p,combo:true}); }); });
    // Also single
    slATRs.forEach(a=>slPairs.push({a,p:null,combo:false}));
    slPCTs.forEach(p=>slPairs.push({a:null,p,combo:false}));
  } else {
    slCfgs.forEach(s=>{
      if(s.type==='atr') slPairs.push({a:s,p:null,combo:false});
      else slPairs.push({a:null,p:s,combo:false});
    });
  }
  if(slPairs.length===0) slPairs=[{a:{type:'atr',m:1.5},p:null,combo:false}];

  // TP configs — same approach
  let tpCfgs=[];
  if ($c('t_rr')) parseRange('t_rrv').forEach(v=>tpCfgs.push({type:'rr',m:v}));
  if ($c('t_atr')) parseRange('t_atrv').forEach(v=>tpCfgs.push({type:'atr',m:v}));
  if ($c('t_pct')) parseRange('t_pctv').forEach(v=>tpCfgs.push({type:'pct',m:v}));
  let tpPairs=[];
  const tpTypes=['rr','atr','pct'];
  const tpByType={rr:tpCfgs.filter(t=>t.type==='rr'),atr:tpCfgs.filter(t=>t.type==='atr'),pct:tpCfgs.filter(t=>t.type==='pct')};
  const activeTpTypes=tpTypes.filter(t=>tpByType[t].length>0);
  if(activeTpTypes.length>=2) {
    // Combinations of first two types + singles
    const t1=tpByType[activeTpTypes[0]], t2=tpByType[activeTpTypes[1]];
    t1.forEach(a=>{ t2.forEach(b=>{ tpPairs.push({a,b,combo:true}); }); });
    tpCfgs.forEach(t=>tpPairs.push({a:t,b:null,combo:false}));
  } else {
    tpCfgs.forEach(t=>tpPairs.push({a:t,b:null,combo:false}));
  }
  if(tpPairs.length===0) tpPairs=[{a:{type:'rr',m:2},b:null,combo:false}];

  // Fixed params — read as ranges; single value = no extra loop overhead
  const pinRatio=$n('e_pinr')||2;
  const beTrigs=useBE?parseRange('x_bet'):[1];
  if(!beTrigs.length) beTrigs.push(1);
  const revBarsArr=useRev?(()=>{const _a=parseRange('x_revb');return _a.length?_a:[2];})():[2];
  const partRR=$n('x_partr')||1;
  const partPct=$n('x_partp')||50;
  const rsiOS=parseRange('f_rsios');
  const rsiOB=parseRange('f_rsiob');
  const consecMax=$n('f_concm')||5;
  const sTrendWin=$n('f_stw')||10;
  const structLen=$n('f_strl')||20;
  const strPvL=$n('f_strpvl')||5;
  const strPvR=$n('f_strpvr')||2;
  // SL Pivot — диапазоны параметров + кэш pivot-массивов
  const useSLPiv  = $c('s_piv');
  const slPivTrail= $c('s_pivtr');
  const slPivOffA = useSLPiv ? parseRange('s_pivoff') : [$n('s_pivoff')||0.2];
  const slPivMaxA = useSLPiv ? parseRange('s_pivmax') : [$n('s_pivmax')||3.0];
  const slPivLArr = useSLPiv ? parseRange('s_pivl')   : [$n('s_pivl')  ||3];
  const slPivRArr = useSLPiv ? parseRange('s_pivr')   : [$n('s_pivr')  ||1];
  const pivSLCache = {}; // ключ: slPivL+'_'+slPivR
  function _getPivSL(l, r) {
    const k = l + '_' + r;
    if (!pivSLCache[k]) { const _p = calcPivotLoHi(DATA, l, r); pivSLCache[k] = _p; }
    return pivSLCache[k];
  }
  const vsaMult=$n('f_vsam')||1.5;
  const vsaP=$n('f_vsap')||20;
  const liqMin=$n('f_liqm')||0.5;
  const volDirP=$n('f_vdirp')||10;
  const clxVolMult=$n('f_clxm')||3.0;
  const clxBodyMult=$n('f_clxb')||1.5;
  const wtN=$n('f_wtn')||11;
  const wtVolW=$n('f_wtv')||3.5;
  const wtBodyW=$n('f_wtb')||3.5;
  const wtDistW=2.75;
  const wtUseDist=$c('f_wtdist');
  const fatConsec=$n('f_fatc')||6;
  const fatVolDrop=$n('f_fatv')||0.7;
  const candleMin=$n('f_cmin')||0.3;
  const candleMax=$n('f_cmax')||3.0;
  // ── New range arrays — only iterated if user typed a range (e.g. "14:20:2") ──
  const _adxLArr   = useAdx    ? parseRange('f_adxl') : [$n('f_adxl')||14];
  const _sTrendArr = useSTrend ? parseRange('f_stw')  : [sTrendWin];

  // RSI combos
  const rsiOSArr=useRsi?parseRange('f_rsios'):[30];
  const rsiOBArr=useRsi?parseRange('f_rsiob'):[70];
  const rsiPairs=[];
  if(useRsi) { rsiOSArr.forEach(os=>{ rsiOBArr.forEach(ob=>{ if(os<ob) rsiPairs.push({os,ob}); }); }); }
  else rsiPairs.push({os:30,ob:70});

  // Precompute indicators
  const pvCache={},atrCache={},atrAvgCache={},maCache={};
  // adxArr default (used when adxL not ranging); per-adxL computed in loop via adxCache
  const adxCache={};
  const adxArr=useAdx?(()=>{const l=_adxLArr[0];if(!adxCache[l])adxCache[l]=calcADX(l);return adxCache[l];})():null;
  const structData=(useStruct||useSTrend||useFresh||useMaDist||useMa)?null:null;
  let structBull=null,structBear=null;
  if(useStruct) {
    // Pivot-based структура как в Pine USE:
    // pivothigh/pivotlow → hi1>hi2 && lo1>lo2 = бычья структура
    const N2=DATA.length; structBull=new Uint8Array(N2); structBear=new Uint8Array(N2);
    const pvL=strPvL, pvR=strPvR;
    let pvHiArr=[], pvLoArr=[];
    // Вычисляем pivot high и low
    for(let i=pvL;i<N2-pvR;i++) {
      let isH=true, isL=true;
      for(let j=1;j<=pvL;j++) { if(DATA[i].h<=DATA[i-j].h){isH=false;break;} }
      if(isH) for(let j=1;j<=pvR;j++) { if(DATA[i].h<=DATA[i+j].h){isH=false;break;} }
      for(let j=1;j<=pvL;j++) { if(DATA[i].l>=DATA[i-j].l){isL=false;break;} }
      if(isL) for(let j=1;j<=pvR;j++) { if(DATA[i].l>=DATA[i+j].l){isL=false;break;} }
      if(isH) pvHiArr.push({idx:i,v:DATA[i].h});
      if(isL) pvLoArr.push({idx:i,v:DATA[i].l});
    }
    // Для каждого бара (с учётом задержки pvR) определяем структуру
    let hi1=NaN,hi2=NaN,lo1=NaN,lo2=NaN;
    let pHi=0,pLo=0;
    for(let i=pvL+pvR;i<N2;i++) {
      // Добавляем новые пивоты доступные на баре i
      while(pHi<pvHiArr.length && pvHiArr[pHi].idx+pvR<=i) {
        hi2=hi1; hi1=pvHiArr[pHi].v; pHi++;
      }
      while(pLo<pvLoArr.length && pvLoArr[pLo].idx+pvR<=i) {
        lo2=lo1; lo1=pvLoArr[pLo].v; pLo++;
      }
      if(!isNaN(hi1)&&!isNaN(hi2)&&!isNaN(lo1)&&!isNaN(lo2)) {
        if(hi1>hi2&&lo1>lo2) structBull[i]=1; // HH+HL = бычья
        if(hi1<hi2&&lo1<lo2) structBear[i]=1; // LH+LL = медвежья
      }
    }
  }



  let bbB=null,bbD=null,bbWarm=0;
  if(useBol) {
    const bl=$n('e_bbl')||20,bm=$n('e_bbm')||2;
    bbWarm=bl;
    bbB=calcSMA(closes,bl); bbD=new Float64Array(N);
    for(let i=bl-1;i<N;i++) {
      const mean=bbB[i];
      let s=0;
      for(let j=i-bl+1;j<=i;j++) s+=(closes[j]-mean)**2;
      bbD[i]=Math.sqrt(s/bl)*bm;
    }
  }
  let donH=null,donL=null;
  if(useDon) {
    const dl=$n('e_donl')||20; donH=new Float64Array(N);donL=new Float64Array(N);
    // donH[i] = max high за dl баров ДО i (не включая i и i-1)
    // Сигнал: prev.h > donH[i] означает пробой предыдущего максимума
    for(let i=dl+2;i<N;i++) {
      let mx=-Infinity,mn=Infinity;
      // берём [i-dl-1 .. i-2] — исключаем prev (i-1) из диапазона сравнения
      for(let j=i-dl-1;j<=i-2;j++) {if(DATA[j].h>mx)mx=DATA[j].h;if(DATA[j].l<mn)mn=DATA[j].l;}
      donH[i]=mx;donL[i]=mn;
    }
  }
  let atrBoMA=null,atrBoATR2=null;
  const atrBoMults=useAtrBo?parseRange('e_atbm'):[2.0];
  if(useAtrBo) {
    const al=$n('e_atbl')||14;
    atrBoMA=calcEMA(closes,al); atrBoATR2=calcRMA_ATR(al);
  }
  let matMA=null,matZone=0;
  if(useMaT) {
    const mp=$n('e_matp')||20,mt=$v('e_matt');
    matMA=calcMA(closes,mp,mt); matZone=$n('e_matz')||0.2;
  }
  let sqzOn=null,sqzCount=null;
  if(useSqz) {
    const sbl=$n('e_sqbl')||20,skm=$n('e_sqkm')||1.5;
    const bbBasis=calcSMA(closes,sbl);
    const bbDevSqz=new Float64Array(N);
    for(let i=sbl-1;i<N;i++) {
      let s=0;for(let j=i-sbl+1;j<=i;j++) s+=(closes[j]-bbBasis[i])**2;
      bbDevSqz[i]=Math.sqrt(s/sbl)*2;
    }
    const kcATR=calcRMA_ATR(sbl);
    const kcMA=calcEMA(closes,sbl);
    sqzOn=new Uint8Array(N); sqzCount=new Int32Array(N);
    for(let i=sbl;i<N;i++) {
      const bbU=bbBasis[i]+bbDevSqz[i],bbL=bbBasis[i]-bbDevSqz[i];
      const kcU=kcMA[i]+kcATR[i]*skm,kcL=kcMA[i]-kcATR[i]*skm;
      sqzOn[i]=(bbL>kcL&&bbU<kcU)?1:0;
      sqzCount[i]=sqzOn[i]?(sqzCount[i-1]||0)+1:0;
    }
  }
  const sqzMinBars=$n('e_sqzb')||1;
  const volAvgArr=HAS_VOLUME?calcVolSMA(vsaP):null;
  const bodyAvgArr=HAS_VOLUME?calcBodySMA(20):null;

  // ── New entry param ranges (support "from:to:step" ranges) ──────────
  const maCrossType  = $v('e_macr_t') || 'EMA';
  const rsiExitPers  = useRsiExit    ? parseRange('e_rsix_p')  : [$n('e_rsix_p') ||14];
  const rsiExitOSA   = useRsiExit    ? parseRange('e_rsix_os') : [$n('e_rsix_os')||30];
  const rsiExitOBA   = useRsiExit    ? parseRange('e_rsix_ob') : [$n('e_rsix_ob')||70];
  const maCrossPArr  = useMaCross    ? parseRange('e_macr_p')  : [$n('e_macr_p') ||20];
  const macdFastArr  = (useMacd||useMacdFilter) ? parseRange('e_macd_f')  : [$n('e_macd_f') ||12];
  const macdSlowArr  = (useMacd||useMacdFilter) ? parseRange('e_macd_s')  : [$n('e_macd_s') ||26];
  const macdSigPArr  = (useMacd||useMacdFilter) ? parseRange('e_macd_sg') : [$n('e_macd_sg')||9];
  const eisPArr      = useEIS        ? parseRange('e_eis_p')   : [$n('e_eis_p')  ||13];
  const erPArr       = useER         ? parseRange('f_erp')     : [$n('f_erp')    ||10];
  const stochKPArr   = useStochExit  ? parseRange('e_stx_k')   : [$n('e_stx_k')  ||14];
  const stochDPArr   = useStochExit  ? parseRange('e_stx_d')   : [$n('e_stx_d')  ||3];
  const stochOSA     = useStochExit  ? parseRange('e_stx_os')  : [$n('e_stx_os') ||20];
  const stochOBA     = useStochExit  ? parseRange('e_stx_ob')  : [$n('e_stx_ob') ||80];
  const volMoveMultA = useVolMove     ? parseRange('e_volmv_m') : [$n('e_volmv_m')||1.5];
  const nRevNArr     = useNReversal  ? parseRange('e_nrev_n')  : [$n('e_nrev_n') ||3];
  const stAtrPArr    = (useSupertrend||useStExit) ? parseRange('e_st_atrp') : [$n('e_st_atrp')||10];
  const stMultArr    = (useSupertrend||useStExit) ? parseRange('e_st_mult') : [$n('e_st_mult')||3.0];
  // Отложенный вход
  const waitBarsArr     = useWaitEntry ? parseRange('e_wait_bars')  : [0];
  const waitRetraceArr  = useWaitRetrace ? [false, true] : [false]; // оба варианта в одном прогоне
  const waitMaxBars     = useWaitEntry ? ($n('e_wait_maxb') || 0) : 0;
  const waitCancelAtr   = useWaitEntry ? ($n('e_wait_catr') || 0) : 0;
  // ── Per-iteration indicator caches ─────────────────────────────────
  const rsiExitCache = {}, maCrossNewCache = {}, macdNewCache = {}, stochNewCache = {}, stDirCache = {};

  // ── Trendline Figures Precompute ─────────────────────────────
  // Все четыре паттерна вычисляются один раз перед основным циклом.
  // tfSigL[i] / tfSigS[i] — бит-флаг: какие именно фигуры дали сигнал
  // бит 0 = TL-touch, бит 1 = TL-break, бит 2 = flag, бит 3 = triangle
  // tlPvLs/tlPvRs — диапазоны пивотов для TL, добавляются в _mcDims как измерения
  const tlPvLs = useTrendFigures ? parseRange('e_tl_pvl') : [5];
  const tlPvRs = useTrendFigures ? parseRange('e_tl_pvr') : [3];
  const TF_TOUCH=1, TF_BREAK=2, TF_FLAG=4, TF_TRI=8;
  // Параметры TL, не зависящие от tlPvL/tlPvR — вычисляются один раз
  const _tlZone        = useTrendFigures ? ($n('e_tl_zone')||0.3)/100 : 0;
  const _tlFlagImpMin  = useTrendFigures ? $n('e_flag_imp')||2.0   : 0;
  const _tlFlagMaxBars = useTrendFigures ? $n('e_flag_bars')||20    : 0;
  const _tlFlagRetrace = useTrendFigures ? $n('e_flag_ret')||0.618  : 0;
  const _tlAtrBase     = useTrendFigures ? calcRMA_ATR(14) : null;
  const _tlSigCache    = {}; // кэш {sigL,sigS} по ключу tlPvL+'_'+tlPvR

  function _getTfSig(tlPvL, tlPvR) {
    if (!useTrendFigures) return {sigL:null, sigS:null};
    const key=tlPvL+'_'+tlPvR;
    if (_tlSigCache[key]) return _tlSigCache[key];
    const tlZone=_tlZone, flagImpMin=_tlFlagImpMin, flagMaxBars=_tlFlagMaxBars;
    const flagRetrace=_tlFlagRetrace, atrBase=_tlAtrBase;
    const sigL=new Uint8Array(N), sigS=new Uint8Array(N);
    const tfPvLo=calcPivotLow(tlPvL,tlPvR), tfPvHi=calcPivotHigh(tlPvL,tlPvR);

    let sl1b=0,sl1v=0,sl2b=0,sl2v=0, rl1b=0,rl1v=0,rl2b=0,rl2v=0;
    let flagActive=false, flagBull=false, flagStartBar=0, flagImpHi=0, flagImpLo=0;
    const warm=Math.max(tlPvL+tlPvR+2,20);
    for (let i=warm; i<N; i++) {
      const bar=DATA[i], prev=DATA[i-1];
      if (tfPvLo[i]===1) { sl2b=sl1b;sl2v=sl1v; sl1b=i-tlPvR;sl1v=DATA[i-tlPvR].l; }
      if (tfPvHi[i]===1) { rl2b=rl1b;rl2v=rl1v; rl1b=i-tlPvR;rl1v=DATA[i-tlPvR].h; }
      let supLevel=NaN, resLevel=NaN;
      if (sl1b>0&&sl2b>0&&sl1b!==sl2b) { const s=(sl1v-sl2v)/(sl1b-sl2b); supLevel=sl1v+s*(i-sl1b); }
      if (rl1b>0&&rl2b>0&&rl1b!==rl2b) { const s=(rl1v-rl2v)/(rl1b-rl2b); resLevel=rl1v+s*(i-rl1b); }
      if (!isNaN(supLevel)&&supLevel>0) {
        const zone=supLevel*tlZone;
        if (useTLTouch&&DATA[i-1].l<=supLevel+zone&&DATA[i-1].l>=supLevel-zone) sigL[i]|=TF_TOUCH;
        if (useTLBreak&&i>=2&&DATA[i-1].c>supLevel+zone&&DATA[i-2].c<=supLevel+zone) sigL[i]|=TF_BREAK;
        if (useTLBreak&&i>=2&&DATA[i-1].c<supLevel-zone&&DATA[i-2].c>=supLevel-zone) sigS[i]|=TF_BREAK;
      }
      if (!isNaN(resLevel)&&resLevel>0) {
        const zone=resLevel*tlZone;
        if (useTLTouch&&DATA[i-1].h>=resLevel-zone&&DATA[i-1].h<=resLevel+zone) sigS[i]|=TF_TOUCH;
        if (useTLBreak&&i>=2&&DATA[i-1].c>resLevel+zone&&DATA[i-2].c<=resLevel+zone) sigL[i]|=TF_BREAK;
        if (useTLBreak&&i>=2&&DATA[i-1].c<resLevel-zone&&DATA[i-2].c>=resLevel-zone) sigS[i]|=TF_BREAK;
      }
      if (useFlag) {
        const atr=atrBase[i]||0.001;
        if (!flagActive) {
          const bullImp=(DATA[i-1].h-DATA[i-6>0?i-6:0].l)>atr*flagImpMin&&prev.c>prev.o;
          const bearImp=(DATA[i-6>0?i-6:0].h-DATA[i-1].l)>atr*flagImpMin&&prev.c<prev.o;
          if (bullImp) { flagActive=true;flagBull=true;flagStartBar=i;flagImpHi=prev.h;flagImpLo=DATA[Math.max(i-6,0)].l; }
          else if (bearImp) { flagActive=true;flagBull=false;flagStartBar=i;flagImpHi=DATA[Math.max(i-6,0)].h;flagImpLo=prev.l; }
        }
        if (flagActive) {
          const elapsed=i-flagStartBar;
          const impRange=Math.max(flagImpHi-flagImpLo,0.0000001);
          const retPct=flagBull?(flagImpHi-Math.min(bar.l,prev.l))/impRange:(Math.max(bar.h,prev.h)-flagImpLo)/impRange;
          if (retPct>flagRetrace||elapsed>flagMaxBars) { flagActive=false; }
          else if (elapsed>=2) {
            if (flagBull&&bar.c>flagImpHi*(1-tlZone)) { sigL[i]|=TF_FLAG; flagActive=false; }
            else if (!flagBull&&bar.c<flagImpLo*(1+tlZone)) { sigS[i]|=TF_FLAG; flagActive=false; }
          }
        }
      }
      if (useTri&&sl1b>0&&sl2b>0&&rl1b>0&&rl2b>0) {
        const resFalling=rl1v<rl2v, supRising=sl1v>sl2v;
        const symTri=resFalling&&supRising;
        const ascTri=Math.abs(rl1v-rl2v)/Math.max(rl1v,0.0001)<0.005&&supRising;
        const descTri=resFalling&&Math.abs(sl1v-sl2v)/Math.max(sl1v,0.0001)<0.005;
        if ((symTri||ascTri||descTri)&&!isNaN(resLevel)&&!isNaN(supLevel)) {
          const zone2=resLevel*tlZone;
          if (prev.c>resLevel+zone2&&DATA[i-2]&&DATA[i-2].c<=resLevel+zone2) sigL[i]|=TF_TRI;
          if (prev.c<supLevel-supLevel*tlZone&&DATA[i-2]&&DATA[i-2].c>=supLevel-supLevel*tlZone) sigS[i]|=TF_TRI;
        }
      }
    }
    _tlSigCache[key]={sigL,sigS};
    return _tlSigCache[key];
  }
  // ── End Trendline Figures ─────────────────────────────────────

  // Count combos for progress
  const vsaMs=useVSA?parseRange('f_vsam'):[0];
  // Точное количество валидных BE комбинаций (beOff < beTrig)
  let beValidCount=1;
  if(useBE){let v=0;beTrigs.forEach(t=>{beOffs.forEach(o=>{if(o<t)v++;});});beValidCount=v||1;}
  let total=pvLs.length*pvRs.length*atrPs.length*(maPs.length||1)*
    (maTypeArr.length||1)*(htfRatioArr.length||1)*
    (adxTs.length||1)*(adxHtfArr.length||1)*(rsiPairs.length||1)*(vfMs.length||1)*(atrExpMs.length||1)*(mdMaxs.length||1)*
    slPairs.length*tpPairs.length*beValidCount*(trTrigs.length||1)*(trDists.length||1)*
    (timeBarsArr.length||1)*(freshMaxs.length||1)*(wtThreshs.length||1)*
    (vsaMs.length||1)*(atrBoMults.length||1)*(confNArr.length||1)*(confTypeArr.length||1)*
    (confHtfArr.length||1)*(maCrossTypeArr.length||1)*(revBarsArr.length||1)*
    (revSkipArr.length||1)*(revCooldownArr.length||1)*
    (_adxLArr.length||1)*(_sTrendArr.length||1)*
    (tlPvLs.length||1)*(tlPvRs.length||1)*
    (stAtrPArr.length||1)*(stMultArr.length||1)*
    (waitBarsArr.length||1)*(waitRetraceArr.length||1);

  // Monte Carlo: shuffle and limit
  let mcTotal = total;
  let _mcIndices = null; // для MC — предвычисленная случайная последовательность (legacy, не используется)
  let _mcSampled = null; // новый MC: массив случайных индексов для прямого декодирования

  if (optMode === 'mc') {
    mcTotal = Math.min($n('mc_n')||5000, total);
    total = mcTotal;
    // Генерируем Set случайных индексов (без повторений)
    // Используем Fisher-Yates на диапазоне [0, realTotal)
    const realTotal = pvLs.length*pvRs.length*atrPs.length*(maPs.length||1)*
      (maTypeArr.length||1)*(htfRatioArr.length||1)*
      (adxTs.length||1)*(adxHtfArr.length||1)*(rsiPairs.length||1)*(vfMs.length||1)*(atrExpMs.length||1)*(mdMaxs.length||1)*
      slPairs.length*tpPairs.length*beValidCount*(trTrigs.length||1)*(trDists.length||1)*
      (timeBarsArr.length||1)*(freshMaxs.length||1)*(wtThreshs.length||1)*
      (vsaMs.length||1)*(atrBoMults.length||1)*(confNArr.length||1)*(confTypeArr.length||1)*
      (confHtfArr.length||1)*(maCrossTypeArr.length||1)*(revBarsArr.length||1)*
    (revSkipArr.length||1)*(revCooldownArr.length||1)*
    (_adxLArr.length||1)*(_sTrendArr.length||1)*
    (tlPvLs.length||1)*(tlPvRs.length||1)*
    (stAtrPArr.length||1)*(stMultArr.length||1)*
    (waitBarsArr.length||1)*(waitRetraceArr.length||1);
    // ── ИДЕЯ 7: Latin Hypercube Sampling — равномерное покрытие пространства
    // Делим [0, realTotal) на mcTotal равных страт, из каждой берём 1 случайную точку.
    // Гарантирует что каждая зона пространства представлена, нет кластеризации.
    // LHS: делим пространство на mcTotal страт, из каждой берём случайную точку
    setMcPhase('🔀 LHS-генерация ' + mcTotal + ' из ' + realTotal.toExponential(1) + '…');
    _mcSampled = new Array(mcTotal);
    if (realTotal <= mcTotal) {
      for (let i = 0; i < realTotal; i++) _mcSampled[i] = i;
      // Заполняем оставшиеся случайными (если mcTotal > realTotal)
      for (let i = realTotal; i < mcTotal; i++) _mcSampled[i] = Math.floor(Math.random() * realTotal);
    } else {
      const stratSize = realTotal / mcTotal;
      for (let i = 0; i < mcTotal; i++) {
        const lo = Math.floor(i * stratSize);
        const hi = Math.floor((i + 1) * stratSize) - 1;
        _mcSampled[i] = lo + Math.floor(Math.random() * (hi - lo + 1));
      }
      // Fisher-Yates shuffle
      for (let i = mcTotal - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [_mcSampled[i], _mcSampled[j]] = [_mcSampled[j], _mcSampled[i]];
      }
    }
    setMcPhase('⚡ Перебор ' + mcTotal + ' из ' + realTotal.toExponential(1) + '…');
    if (stopped) return;
  }
  let _iterCount = 0; // глобальный счётчик итераций для MC

  // Фазовый статус для MC
  function setMcPhase(msg) {
    const el = $('mc-phase');
    if (!el) return;
    if (msg) { el.style.display='inline'; el.textContent = msg; }
    else { el.style.display='none'; el.textContent=''; }
  }
  if (optMode === 'mc') {
    // Предупреждение: если пространство меньше N — каждый запуск одинаков
    const _mcRealTotal = pvLs.length*pvRs.length*atrPs.length*(maPs.length||1)*
      (adxTs.length||1)*(adxHtfArr.length||1)*(rsiPairs.length||1)*(vfMs.length||1)*(atrExpMs.length||1)*(mdMaxs.length||1)*
      slPairs.length*tpPairs.length*beValidCount*(trTrigs.length||1)*(trDists.length||1)*
      (timeBarsArr.length||1)*(freshMaxs.length||1)*(wtThreshs.length||1)*
      (vsaMs.length||1)*(atrBoMults.length||1)*(confNArr.length||1)*(revBarsArr.length||1)*
    (revSkipArr.length||1)*(revCooldownArr.length||1)*
    (_adxLArr.length||1)*(_sTrendArr.length||1)*
    (tlPvLs.length||1)*(tlPvRs.length||1)*
    (stAtrPArr.length||1)*(stMultArr.length||1)*
    (waitBarsArr.length||1)*(waitRetraceArr.length||1);
    const _mcEffective = Math.min(mcTotal, _mcRealTotal);
    if (_mcRealTotal <= mcTotal) {
      setMcPhase('⚠️ Пространство (' + _mcRealTotal + ') < N (' + mcTotal + ') — полный перебор, результаты одинаковы каждый раз');
    } else {
      setMcPhase('🔀 Генерация выборки ' + mcTotal + ' из ' + _mcRealTotal + '…');
    }
  }

  let done=0;
  updateETA(0, total, 0);

  // ── _ipCombos: flat enumeration of new iterable inner params ─────────────
  // Rules:
  //   • Only params where the user typed a range (len > 1) add iterations
  //   • Single-value params contribute no overhead — just provide their default
  //   • This block runs ONCE before the main loop (not inside it!)
  try {
    // Collect [name, array] only for params that actually vary
    const _allIp = [
      ['adxL',        (Array.isArray(_adxLArr) && _adxLArr.length > 0) ? _adxLArr : [14]],
      ['sTrendWin',   (Array.isArray(_sTrendArr) && _sTrendArr.length > 0) ? _sTrendArr : [12]],
      ['confN',       (Array.isArray(confNArr) && confNArr.length) ? confNArr : [2]],
      ['revBars',     (Array.isArray(revBarsArr) && revBarsArr.length > 0) ? revBarsArr : [5]],
      ['revSkip',     (Array.isArray(revSkipArr) && revSkipArr.length > 0) ? revSkipArr : [2]],
      ['revCooldown', (Array.isArray(revCooldownArr) && revCooldownArr.length > 0) ? revCooldownArr : [0]],
      ['slPivOff',    (Array.isArray(slPivOffA) && slPivOffA.length > 0) ? slPivOffA : [0]],
      ['slPivMax',    (Array.isArray(slPivMaxA) && slPivMaxA.length > 0) ? slPivMaxA : [50]],
      ['slPivL',      (Array.isArray(slPivLArr) && slPivLArr.length > 0) ? slPivLArr : [5]],
      ['slPivR',      (Array.isArray(slPivRArr) && slPivRArr.length > 0) ? slPivRArr : [3]],
      ['rsiExitPer',  (Array.isArray(rsiExitPers) && rsiExitPers.length > 0) ? rsiExitPers : [14]],
      ['rsiExitOS',   (Array.isArray(rsiExitOSA) && rsiExitOSA.length > 0) ? rsiExitOSA : [30]],
      ['rsiExitOB',   (Array.isArray(rsiExitOBA) && rsiExitOBA.length > 0) ? rsiExitOBA : [70]],
      ['maCrossP',    (Array.isArray(maCrossPArr) && maCrossPArr.length > 0) ? maCrossPArr : [50]],
      ['macdFast',    (Array.isArray(macdFastArr) && macdFastArr.length > 0) ? macdFastArr : [12]],
      ['macdSlow',    (Array.isArray(macdSlowArr) && macdSlowArr.length > 0) ? macdSlowArr : [26]],
      ['macdSigP',    (Array.isArray(macdSigPArr) && macdSigPArr.length > 0) ? macdSigPArr : [9]],
      ['stochKP',     (Array.isArray(stochKPArr) && stochKPArr.length > 0) ? stochKPArr : [14]],
      ['stochDP',     (Array.isArray(stochDPArr) && stochDPArr.length > 0) ? stochDPArr : [3]],
      ['stochOS',     (Array.isArray(stochOSA) && stochOSA.length > 0) ? stochOSA : [20]],
      ['stochOB',     (Array.isArray(stochOBA) && stochOBA.length > 0) ? stochOBA : [80]],
      ['volMoveMult', (Array.isArray(volMoveMultA) && volMoveMultA.length > 0) ? volMoveMultA : [1.5]],
      ['nReversalN',  (Array.isArray(nRevNArr) && nRevNArr.length > 0) ? nRevNArr : [3]],
      ['stAtrP',      (Array.isArray(stAtrPArr) && stAtrPArr.length > 0) ? stAtrPArr : [10]],
      ['stMult',      (Array.isArray(stMultArr) && stMultArr.length > 0) ? stMultArr : [3.0]],
      ['waitBars',    (Array.isArray(waitBarsArr) && waitBarsArr.length > 0) ? waitBarsArr : [0]],
      ['waitRetrace', (Array.isArray(waitRetraceArr) && waitRetraceArr.length > 0) ? waitRetraceArr : [0.618]],
      ['eisPeriod',   (Array.isArray(eisPArr) && eisPArr.length > 0) ? eisPArr : [20]],
      ['erPeriod',    (Array.isArray(erPArr) && erPArr.length > 0) ? erPArr : [10]],
    ];
    // Defaults for all params (first element of each array)
    window._ipDef = Object.fromEntries(_allIp.map(([n,a])=>[n,a[0]]));
    // Only build cross-product for params with >1 value
    const _multi = _allIp.filter(([,a])=>a.length>1);
    let combos = [{}];
    for (const [n,arr] of _multi) {
      const next=[];
      for (const c of combos) for (const v of arr) next.push({...c,[n]:v});
      combos=next;
    }
    window._ipCombos = combos.length ? combos : [{}];
  } catch (initErr) {
    console.error('[runOpt] Error initializing _ipCombos:', initErr);
    // Fallback: create minimal defaults
    window._ipDef = {
      adxL: 14, sTrendWin: 12, confN: 2, revBars: 5, revSkip: 2, revCooldown: 0,
      slPivOff: 0, slPivMax: 50, slPivL: 5, slPivR: 3, rsiExitPer: 14, rsiExitOS: 30,
      rsiExitOB: 70, maCrossP: 50, macdFast: 12, macdSlow: 26, macdSigP: 9,
      stochKP: 14, stochDP: 3, stochOS: 20, stochOB: 80, volMoveMult: 1.5, nReversalN: 3,
      stAtrP: 10, stMult: 3.0, waitBars: 0, waitRetrace: 0.618, eisPeriod: 20, erPeriod: 10
    };
    window._ipCombos = [{}];
    if (_isSynthMode && typeof _setSynthProgress !== 'undefined') {
      _setSynthProgress(0, '⚠️ Инициализация с резервными значениями (ошибка в _ipCombos)');
    }
  }

  // _mcDims/_mcDimSizes — общие для MC и TPE, строятся ПОСЛЕ _ipCombos
  const _mcDims = [
    pvLs, pvRs, atrPs, (maPs.length?maPs:[maPs[0]||0]),
    (maTypeArr.length?maTypeArr:['EMA']), (htfRatioArr.length?htfRatioArr:[1]),
    (adxTs.length?adxTs:[0]), (adxHtfArr.length?adxHtfArr:[1]), rsiPairs, (vfMs.length?vfMs:[0]), (atrExpMs.length?atrExpMs:[0]),
    (mdMaxs.length?mdMaxs:[0]), (freshMaxs.length?freshMaxs:[20]),
    (wtThreshs.length?wtThreshs:[0]), (vsaMs.length?vsaMs:[0]),
    (atrBoMults.length?atrBoMults:[2.0]), slPairs, tpPairs,
    beOffs, beTrigs, trTrigs, trDists, (timeBarsArr.length?timeBarsArr:[50]),
    window._ipCombos,
    (tlPvLs.length?tlPvLs:[5]), (tlPvRs.length?tlPvRs:[3]),
    (confTypeArr.length?confTypeArr:['EMA']), (confHtfArr.length?confHtfArr:[1]),
    (maCrossTypeArr.length?maCrossTypeArr:['EMA']),
    _filterCombos  // powerset фильтров (последнее измерение)
  ];
  const _mcDimSizes = _mcDims.map(d => d.length || 1);

  // ══════════════════════════════════════════════════════════════════════════
  // TPE — Tree-structured Parzen Estimator
  // Алгоритм:
  //   1. Фаза разведки: mcTotal*0.25 случайных точек (LHS) → строим историю
  //   2. Фаза эксплуатации: для каждой размерности строим два KDE:
  //      l(x) — плотность хороших точек (топ γ%), g(x) — плотность остальных
  //      Следующая точка = argmax [ l(x)/g(x) ] по кандидатам
  //   3. Повторяем до исчерпания бюджета
  // ══════════════════════════════════════════════════════════════════════════
  function _tpeSampleDim(goodVals, badVals, dimArr, nCandidates) {
    if (goodVals.length < 3) return Math.floor(Math.random() * dimArr.length);

    // Гистограмма вместо KDE — 13× быстрее, статистически достаточно
    const nBins = Math.min(dimArr.length, 10);
    const goodHist = new Float32Array(nBins);
    const badHist  = new Float32Array(nBins);
    for (const v of goodVals) goodHist[Math.min(nBins-1, v*nBins|0)]++;
    for (const v of badVals)  badHist [Math.min(nBins-1, v*nBins|0)]++;
    const gSum = goodVals.length + nBins; // Laplace smoothing
    const bSum = (badVals.length || 1) + nBins;

    const candidates = dimArr.length <= nCandidates
      ? Array.from({length:dimArr.length}, (_,i) => i)
      : Array.from({length:nCandidates}, () => Math.floor(Math.random()*dimArr.length));

    let bestRatio = -Infinity, bestIdx = 0;
    for (const idx of candidates) {
      const x   = idx / Math.max(dimArr.length-1, 1);
      const bin = Math.min(nBins-1, x*nBins|0);
      const ratio = (goodHist[bin]+1)/gSum / ((badHist[bin]+1)/bSum);
      if (ratio > bestRatio) { bestRatio = ratio; bestIdx = idx; }
    }
    return bestIdx;
  }

  // MAIN LOOP
  let _mcDone = false; // флаг досрочного выхода для MC/stop

  // ── MC РЕЖИМ: прямой цикл по предвычисленным индексам ──────────────────────
  if (optMode === 'mc' && _mcSampled) {
    // DEBUG: Check if _ipDef is ready for synthesis
    if (_isSynthMode && !window._ipDef) {
      if (typeof _setSynthProgress !== 'undefined') {
        _setSynthProgress(0, '❌ КРИТИЧЕСКАЯ ОШИБКА: window._ipDef не инициализирован');
      }
      console.error('[MC] window._ipDef missing!', {_isSynthMode, _ipDef: window._ipDef});
      return;
    }

    const _mType = $v('f_mat') || 'EMA';
    for (let _mi = 0; _mi < mcTotal && !stopped; _mi++) {
      // Декодируем индекс в параметры через деление с остатком
      let _idx = _mcSampled[_mi];
      const _dims = _mcDims;
      const _dsz  = _mcDimSizes;
      const _di = new Array(_dims.length);
      for (let d = _dims.length - 1; d >= 0; d--) {
        _di[d] = _idx % _dsz[d];
        _idx = Math.floor(_idx / _dsz[d]);
      }
      let _d = 0;
      const pvL      = _dims[_d][_di[_d++]];
      const pvR      = _dims[_d][_di[_d++]];
      const atrP     = _dims[_d][_di[_d++]];
      const maP      = _dims[_d][_di[_d++]];
      const _mType   = _dims[_d][_di[_d++]];
      const htfRatio = _dims[_d][_di[_d++]];
      const adxT        = _dims[_d][_di[_d++]];
      const adxHtfRatio = _dims[_d][_di[_d++]];
      const rsiPair  = _dims[_d][_di[_d++]];
      const vfM      = _dims[_d][_di[_d++]];
      const atrExpM  = _dims[_d][_di[_d++]];
      const mdMax    = _dims[_d][_di[_d++]];
      const freshMax = _dims[_d][_di[_d++]];
      const wtT      = _dims[_d][_di[_d++]];
      const vsaM     = _dims[_d][_di[_d++]];
      const atrBoM   = _dims[_d][_di[_d++]];
      const slPair   = _dims[_d][_di[_d++]];
      const tpPair   = _dims[_d][_di[_d++]];
      const beOff    = _dims[_d][_di[_d++]];
      const beTrig   = _dims[_d][_di[_d++]];
      const trTrig   = _dims[_d][_di[_d++]];
      const trDist   = _dims[_d][_di[_d++]];
      const timeBars = _dims[_d][_di[_d++]];
      const _ip      = _dims[_d][_di[_d++]];
      const tlPvL    = _dims[_d][_di[_d++]];
      const tlPvR    = _dims[_d][_di[_d++]];
      const _confType= _dims[_d][_di[_d++]];
      const _confHtf = _dims[_d][_di[_d++]];
      const _mCrossType= _dims[_d][_di[_d++]];
      const _fCombo  = _dims[_d][_di[_d++]]; // powerset: объект с bool-флагами фильтров
      // Эффективные флаги фильтров: берём из _fCombo если там есть, иначе из внешней области
      const _effUseMa      = _fCombo.useMa      ?? useMa;
      const _effUseAdx     = _fCombo.useAdx     ?? useAdx;
      const _effUseRsi     = _fCombo.useRsi     ?? useRsi;
      const _effUseVolF    = _fCombo.useVolF    ?? useVolF;
      const _effUseStruct  = _fCombo.useStruct  ?? useStruct;
      const _effUseMaDist  = _fCombo.useMaDist  ?? useMaDist;
      const _effUseCandleF = _fCombo.useCandleF ?? useCandleF;
      const _effUseConsec  = _fCombo.useConsec  ?? useConsec;
      const _effUseSTrend  = _fCombo.useSTrend  ?? useSTrend;
      const _effUseFresh   = _fCombo.useFresh   ?? useFresh;
      const _effUseAtrExp  = _fCombo.useAtrExp  ?? useAtrExp;
      const _effUseConfirm = _fCombo.useConfirm ?? useConfirm;
      const _effUseVSA     = _fCombo.useVSA     ?? useVSA;
      const _effUseLiq     = _fCombo.useLiq     ?? useLiq;
      const _effUseVolDir  = _fCombo.useVolDir  ?? useVolDir;
      const _effUseWT      = _fCombo.useWT      ?? useWT;
      const _effUseFat     = _fCombo.useFat     ?? useFat;
      const adxL        = (_ip && _ip.adxL) || window._ipDef?.adxL || 14;
      const sTrendWin   = _ip.sTrendWin   ?? window._ipDef.sTrendWin;
      const confN       = _ip.confN       ?? window._ipDef.confN;
      const revBars     = _ip.revBars     ?? window._ipDef.revBars;
      const revSkip     = _ip.revSkip     ?? window._ipDef.revSkip;
      const revCooldown = _ip.revCooldown ?? window._ipDef.revCooldown;
      const slPivOff    = _ip.slPivOff    ?? window._ipDef.slPivOff;
      const slPivMax    = _ip.slPivMax    ?? window._ipDef.slPivMax;
      const slPivL      = _ip.slPivL      ?? window._ipDef.slPivL;
      const slPivR      = _ip.slPivR      ?? window._ipDef.slPivR;
      const rsiExitPer  = _ip.rsiExitPer  ?? window._ipDef.rsiExitPer;
      const rsiExitOS   = _ip.rsiExitOS   ?? window._ipDef.rsiExitOS;
      const rsiExitOB   = _ip.rsiExitOB   ?? window._ipDef.rsiExitOB;
      const maCrossP    = _ip.maCrossP    ?? window._ipDef.maCrossP;
      const macdFast    = _ip.macdFast    ?? window._ipDef.macdFast;
      const macdSlow    = _ip.macdSlow    ?? window._ipDef.macdSlow;
      const macdSigP    = _ip.macdSigP    ?? window._ipDef.macdSigP;
      const stochKP     = _ip.stochKP     ?? window._ipDef.stochKP;
      const stochDP     = _ip.stochDP     ?? window._ipDef.stochDP;
      const stochOS     = _ip.stochOS     ?? window._ipDef.stochOS;
      const stochOB     = _ip.stochOB     ?? window._ipDef.stochOB;
      const volMoveMult = _ip.volMoveMult ?? window._ipDef.volMoveMult;
      const nReversalN  = _ip.nReversalN  ?? window._ipDef.nReversalN;
      const stAtrP      = _ip.stAtrP      ?? window._ipDef.stAtrP;
      const stMult      = _ip.stMult      ?? window._ipDef.stMult;
      const waitBars    = _ip.waitBars    ?? window._ipDef.waitBars;
      const waitRetrace = _ip.waitRetrace ?? window._ipDef.waitRetrace;
      const eisPeriod   = _ip.eisPeriod   ?? window._ipDef.eisPeriod;
      const erPeriod    = _ip.erPeriod    ?? window._ipDef.erPeriod;
      const {lo:pivSLLo, hi:pivSLHi} = useSLPiv ? _getPivSL(slPivL, slPivR) : {lo:null, hi:null};
      const rsiExitArr = useRsiExit   ? (rsiExitCache[rsiExitPer]||(rsiExitCache[rsiExitPer]=calcRSI(rsiExitPer))) : null;
      const maCrossArr = useMaCross   ? (()=>{const k=_mCrossType+'_'+maCrossP;return maCrossNewCache[k]||(maCrossNewCache[k]=calcMA(closes,maCrossP,_mCrossType));})() : null;
      const stDir      = (useSupertrend||useStExit) ? (()=>{const k=stAtrP+'_'+stMult;return stDirCache[k]||(stDirCache[k]=calcSupertrend(stAtrP,stMult));})() : null;
      let macdLine=null,macdSignal=null;
      if(useMacd||useMacdFilter){const mk=macdFast+'_'+macdSlow+'_'+macdSigP;if(!macdNewCache[mk]){const m=calcMACD(macdFast,macdSlow,macdSigP);macdNewCache[mk]=m;}macdLine=macdNewCache[mk].line;macdSignal=macdNewCache[mk].signal;}
      let stochD=null;
      if(useStochExit){const sk=stochKP+'_'+stochDP;if(!stochNewCache[sk])stochNewCache[sk]=calcStochastic(stochKP,stochDP);stochD=stochNewCache[sk].dArr;}
      let eisEMAArr=null,eisHistArr=null;
      if(useEIS){const ep=eisPeriod||13;const ek='eis_'+ep;eisEMAArr=maCache[ek]||(maCache[ek]=calcEMA(closes,ep));if(!macdNewCache['eis_hist']){const m=calcMACD(12,26,9);const h=new Float64Array(N);for(let i=0;i<N;i++)h[i]=m.line[i]-m.signal[i];macdNewCache['eis_hist']=h;}eisHistArr=macdNewCache['eis_hist'];}
      let erArr=null;
      if(useER){const ep=erPeriod||10;const ek='er_'+ep;if(!maCache[ek]){const ea=new Float64Array(N);for(let i=ep;i<N;i++){const net=Math.abs(closes[i]-closes[i-ep]);let sum=0;for(let j=i-ep+1;j<=i;j++)sum+=Math.abs(closes[j]-closes[j-1]);ea[i]=sum>0?net/sum:0;}maCache[ek]=ea;}erArr=maCache[ek];}
      const {sigL:tfSigL, sigS:tfSigS} = _getTfSig(tlPvL, tlPvR);

      // Пропускаем невалидные BE комбинации
      if (useBE && beOff >= beTrig) { continue; }

      // Кэши индикаторов
      const pk = pvL+'_'+pvR;
      if (!pvCache[pk]) pvCache[pk] = {lo:calcPivotLow(pvL,pvR), hi:calcPivotHigh(pvL,pvR)};
      if (!atrCache[atrP]) atrCache[atrP] = calcRMA_ATR(atrP);
      if (!atrAvgCache[atrP]) atrAvgCache[atrP] = calcSMA(atrCache[atrP], 50);
      const atrAvg = atrAvgCache[atrP];
      const mk = _mType+'_'+maP+'_htf'+htfRatio;
      let maArr = null;
      if (maP > 0) {
        if (!maCache[mk]) maCache[mk] = htfRatio>1 ? calcHTFMA(DATA,htfRatio,maP,_mType) : calcMA(closes,maP,_mType);
        maArr = maCache[mk];
      }
      let wtScores = null;
      if (_effUseWT && maArr) wtScores = calcWeightedTrend(maArr, atrCache[atrP], wtN, wtVolW, wtBodyW, wtDistW, wtUseDist);
      let confMAArr = null;
      if (_effUseConfirm && confN > 0) {
        const ck = _confType+'_'+confN+'_htf'+_confHtf;
        if (!maCache[ck]) maCache[ck] = _confHtf>1 ? calcHTFMA(DATA,_confHtf,confN,_confType) : calcMA(closes,confN,_confType);
        confMAArr = maCache[ck];
      }
      const _adxCk = adxL+'_htf'+adxHtfRatio;
      if (!adxCache[_adxCk]) adxCache[_adxCk] = adxHtfRatio>1 ? calcHTFADX(DATA,adxHtfRatio,adxL) : calcADX(adxL);

      const btCfg = {
        comm: commTotal,
        usePivot:usePv,pvLo:pvCache[pk].lo,pvHi_:pvCache[pk].hi,
        useEngulf:useEng,usePinBar:usePin,pinRatio,
        useBoll:useBol,bbB,bbD,
        useDonch:useDon,donH,donL,
        useAtrBo,atrBoMA,atrBoATR:atrBoATR2,atrBoMult:atrBoM,
        useMaTouch:useMaT,matMA,matZone,
        useSqueeze:useSqz,sqzOn,sqzCount,sqzMinBars,
        useTLTouch,useTLBreak,useFlag,useTri,tfSigL,tfSigS,tlPvL,tlPvR,
        useRsiExit,rsiExitArr,rsiExitPeriod:rsiExitPer,rsiExitOS,rsiExitOB,
        useMaCross,maCrossArr,maCrossP,maCrossType:_mCrossType,
        useFreeEntry,
        useMacd,macdLine,macdSignal,macdFast,macdSlow,macdSignalP:macdSigP,
        useStochExit,stochD,stochKP,stochDP,stochOS,stochOB,
        useVolMove,volMoveMult,
        useInsideBar,
        useNReversal,nReversalN,
        useSupertrend,stDir,stAtrP,stMult,
        useEIS,eisEMAArr,eisHistArr,eisPeriod:eisPeriod||13,
        useSoldiers,
        useStExit,
        waitBars:waitBars||0,waitRetrace:waitRetrace||false,waitMaxBars,waitCancelAtr,
        hasSLA:!!(slPair.a),slMult:slPair.a?slPair.a.m:0,hasSLB:!!(slPair.p),slPctMult:slPair.p?slPair.p.m:0,slLogic,
        hasTPA:!!(tpPair.a),tpMult:tpPair.a?tpPair.a.m:0,tpMode:tpPair.a?tpPair.a.type:'rr',
        hasTPB:!!(tpPair.b),tpMultB:tpPair.b?tpPair.b.m:0,tpModeB:tpPair.b?tpPair.b.type:'rr',tpLogic,
        useBE,beTrig,beOff,
        useTrail,trTrig,trDist,
        useRev,revBars,revMode,revAct,revSrc,revSkip,revCooldown,
        useTime,timeBars,timeMode,
        usePartial,partRR,partPct,partBE,
        useClimax:useClimaxExit&&HAS_VOLUME,clxVolMult,clxBodyMult,clxMode,
        useMA:_effUseMa&&maP>0,maArr,maType:_mType,maP,htfRatio,
        useADX:_effUseAdx&&adxT>0,adxArr:adxCache[_adxCk],adxThresh:adxT,adxLen:adxL,adxHtfRatio,useAdxSlope,adxSlopeBars,
        useRSI:_effUseRsi,rsiArr:_effUseRsi?calcRSI(14):null,rsiOS:rsiPair.os,rsiOB:rsiPair.ob,
        useVolF:_effUseVolF&&vfM>0,atrAvg,volFMult:vfM,
        useAtrExp:_effUseAtrExp&&atrExpM>0,atrExpMult:atrExpM,
        useStruct:_effUseStruct,structBull,structBear,strPvL,strPvR,
        useSLPiv,slPivOff,slPivMax,slPivL,slPivR,slPivTrail,pivSLLo,pivSLHi,
        useConfirm:_effUseConfirm&&confN>0,confN,confMatType:_confType,confHtfRatio:_confHtf,maArrConfirm:confMAArr,
        useMaDist:_effUseMaDist&&mdMax>0,maDistMax:mdMax,
        useCandleF:_effUseCandleF,candleMin,candleMax,
        useConsec:_effUseConsec,consecMax,
        useSTrend:_effUseSTrend,sTrendWin,
        useFresh:_effUseFresh&&freshMax>0,freshMax,
        useVSA:_effUseVSA&&vsaM>0,vsaMult:vsaM,volAvg:volAvgArr,
        useLiq:_effUseLiq,liqMin,
        useVolDir:_effUseVolDir,volDirPeriod:volDirP,
        useWT:_effUseWT&&wtT>0,wtScores,wtThresh:wtT,
        useFat:_effUseFat,fatConsec,fatVolDrop,
        bodyAvg:bodyAvgArr,
        useMacdFilter:_fCombo.useMacdFilter??useMacdFilter,
        useER:_fCombo.useER??useER,erArr,erPeriod:erPeriod||10,erThresh,
        useKalmanMA:_fCombo.useKalmanMA??useKalmanMA,kalmanArr,kalmanLen, // ##KALMAN_MA##
        start:Math.max(maP||0,50)+2,
        pruning:false, maxDDLimit:maxDD
      };

      if (_useOOS) DATA = _isData;
      let r;
      try { r = backtest(pvCache[pk].lo, pvCache[pk].hi, atrCache[atrP], btCfg); }
      finally { if (_useOOS) DATA = _fullDATA; }
      done++;
      if (r && r.n >= minTrades && r.dd <= maxDD) {
        const pdd = r.dd>0 ? r.pnl/r.dd : 0;
        const sig = _calcStatSig(r);
        const gt = _calcGTScore(r);
        let slDesc = slPair.combo ? `SL(ATR×${slPair.a.m}${slLogic==='or'?'|OR|':'|AND|'}${slPair.p.m}%)` : slPair.a ? `SL×${slPair.a.m}ATR` : `SL${slPair.p.m}%`;
        if(useSLPiv) slDesc+=`+SPiv(L${slPivL}/R${slPivR}×${slPivOff})`;
        let tpDesc = tpPair.combo ? (()=>{const n1=tpPair.a.type==='rr'?`RR${tpPair.a.m}`:tpPair.a.type==='atr'?`TP×${tpPair.a.m}ATR`:`TP${tpPair.a.m}%`;const n2=tpPair.b.type==='rr'?`RR${tpPair.b.m}`:tpPair.b.type==='atr'?`TP×${tpPair.b.m}ATR`:`TP${tpPair.b.m}%`;return `TP(${n1}${tpLogic==='or'?'|OR|':'|AND|'}${n2})`;})() : tpPair.a ? (tpPair.a.type==='rr'?`RR×${tpPair.a.m}`:tpPair.a.type==='atr'?`TP×${tpPair.a.m}ATR`:`TP${tpPair.a.m}%`) : '';
        const name = buildName(btCfg, pvL, pvR, slDesc, tpDesc, {}, {maP, maType:_mType, htfRatio, stw:sTrendWin, atrP, adxL, adxHtfRatio});
        if (!_resultNames.has(name)) {
          _resultNames.add(name);
          const _cfg = {usePivot:usePv,pvL,pvR,useEngulf:useEng,usePinBar:usePin,pinRatio,
              useBoll:useBol,bbLen:$n('e_bbl')||20,bbMult:$n('e_bbm')||2,
              useDonch:useDon,donLen:$n('e_donl')||20,
              useAtrBo,atrBoLen:$n('e_atbl')||14,atrBoMult:atrBoM,
              useMaTouch:useMaT,matType:$v('e_matt'),matPeriod:$n('e_matp')||20,matZone:$n('e_matz')||0.2,
              useSqueeze:useSqz,sqzBBLen:$n('e_sqbl')||20,sqzKCMult:$n('e_sqkm')||1.5,sqzMinBars,
              useTLTouch,useTLBreak,useFlag,useTri,
              tlPvL,tlPvR,tlZonePct:$n('e_tl_zone')||0.3,
              flagImpMin:$n('e_flag_imp')||2.0,flagMaxBars:$n('e_flag_bars')||20,flagRetrace:$n('e_flag_ret')||0.618,
              useRsiExit,rsiExitPeriod:rsiExitPer,rsiExitOS,rsiExitOB,
              useMaCross,maCrossP,maCrossType,
              useFreeEntry,
              useMacd,macdFast,macdSlow,macdSignalP:macdSigP,
              useStochExit,stochKP,stochDP,stochOS,stochOB,
              useVolMove,volMoveMult,
              useInsideBar,
              useNReversal,nReversalN,
              useSupertrend,stAtrP,stMult,
              useStExit,
              waitBars:waitBars||0,waitRetrace:waitRetrace||false,waitMaxBars,waitCancelAtr,
              slPair,slLogic,tpPair,tpLogic,
              useSLPiv,slPivOff,slPivMax,slPivL,slPivR,slPivTrail,
              useBE,beTrig,beOff,useTrail,trTrig,trDist,
              useRev,revBars,revMode,revAct,useTime,timeBars,timeMode,
              usePartial,partRR,partPct,partBE,
              useClimax:useClimaxExit&&HAS_VOLUME,clxVolMult,clxBodyMult,clxMode,
              useMA:_effUseMa&&maP>0,maType:_mType,maP,htfRatio,
              useADX:_effUseAdx&&adxT>0,adxThresh:adxT,adxLen:adxL,adxHtfRatio,useAdxSlope,adxSlopeBars,
              useRSI:_effUseRsi,rsiOS:rsiPair.os,rsiOB:rsiPair.ob,
              useVolF:_effUseVolF&&vfM>0,volFMult:vfM,
              useAtrExp:_effUseAtrExp&&atrExpM>0,atrExpMult:atrExpM,
              useStruct:_effUseStruct,structLen,strPvL,strPvR,
              useConfirm:_effUseConfirm&&confN>0,confN,confMatType:_confType,confHtfRatio:_confHtf,
              useMaDist:_effUseMaDist&&mdMax>0,maDistMax:mdMax,
              useCandleF:_effUseCandleF,candleMin,candleMax,useConsec:_effUseConsec,consecMax,
              useSTrend:_effUseSTrend,sTrendWin,useFresh:_effUseFresh&&freshMax>0,freshMax,
              useVSA:_effUseVSA&&vsaM>0,vsaMult:vsaM,vsaPeriod:vsaP,
              useLiq:_effUseLiq,liqMin,useVolDir:_effUseVolDir,volDirPeriod:volDirP,
              useWT:_effUseWT&&wtT>0,wtThresh:wtT,wtN,wtVolW,wtBodyW,wtUseDist,
              useFat:_effUseFat,fatConsec,fatVolDrop,
              useKalmanMA:_fCombo.useKalmanMA??useKalmanMA,kalmanLen, // ##KALMAN_MA##
              atrPeriod:atrP,commission:commTotal,baseComm:comm,spreadVal:spread*2,
              revSkip,revCooldown,revSrc};
          results.push({name,pnl:r.pnl,wr:r.wr,n:r.n,dd:r.dd,pdd,avg:r.avg,sig,gt,
            p1:r.p1,p2:r.p2,dwr:r.dwr,c1:r.c1,c2:r.c2,nL:r.nL||0,pL:r.pL||0,wrL:r.wrL,nS:r.nS||0,pS:r.pS||0,wrS:r.wrS,dwrLS:r.dwrLS,
            cvr:_calcCVR(r.eq),upi:_calcUlcerIdx(r.eq),sortino:_calcSortino(r.eq),kRatio:_calcKRatio(r.eq),sqn:r.sqn??null,
            omega:_calcOmega(r.eq),pain:_calcPainRatio(r.eq),
            burke:_calcBurke(r.eq),serenity:_calcSerenity(r.eq),ir:_calcInfoRatio(r.eq),cfg:_cfg}); // ##OMG ##PAIN ##BURKE ##SRNTY ##IR
          equities[name] = r.eq;
        }
      }
      if (done % 300 === 0 || done === mcTotal) {
        updateETA(done, mcTotal, results.length);
        await yieldToUI();
        await checkPause();
      }
      if (stopped) break;
    }
    // MC завершён — батч OOS + финальная обработка
    if (_useOOS && results.length > 0) {
      setMcPhase(`⏳ OOS проверка ${results.length} результатов…`);
      for (let oi = 0; oi < results.length; oi++) {
        _attachOOS(results[oi].cfg, results[oi].name, results[oi].n);
        if (oi % 50 === 0) { await yieldToUI(); }
      }
    }
    results.sort((a,b) => b.pdd-a.pdd);
    await _batchCPCV(results, 200);
    if (typeof setMcPhase === 'function') setMcPhase(null);
    _curPage = 0;
    renderVisibleResults(); showBestStats(); updateETA(done, mcTotal, results.length);
    $('prog').textContent = '✅ ' + fmtNum(results.length) + ' / ' + fmtNum(done) + ' прошли фильтр';
    $('pbtn').style.display='none'; $('sbtn').style.display='none';
    $('rbtn').style.display=''; $('rbtn').disabled=false;
    playDone();
    return; // выходим из runOpt — основной цикл не нужен
  }

  // ── TPE РЕЖИМ ──────────────────────────────────────────────────────────────
  if (optMode === 'tpe') {
    // tpe_target = целевое кол-во результатов (TPE останавливается когда найдено)
    // tpe_n      = жёсткий лимит итераций (защита от бесконечного цикла)
    const tpeTarget  = Math.max(10, parseInt($v('tpe_target')||'1000') || 1000);
    const tpeMaxIter = Math.max(100, parseInt($v('tpe_n')||'50000') || 50000);
    const _nCandidates = 32;
    const _exploreN = Math.max(20, Math.min(500, Math.floor(tpeMaxIter * 0.10))); // разведка = 10% бюджета, макс 500

    // История: для каждой размерности храним нормализованные индексы и метрику
    const _tpeHistory = []; // [{dimIndices: [...], score}]
    const _dims = _mcDims;
    const _dsz  = _mcDimSizes;
    const nDims = _dims.length;
    // Дедупликация: Set уже виденных комбинаций
    const _tpeSeen = new Set();

    setMcPhase('🔮 TPE разведка ' + _exploreN + ' точек…');

    // Предвычисляем RSI(14) один раз — не зависит от параметров оптимизации
    const _tpeRsiArr = useRsi ? calcRSI(14) : null;
    // Кэш calcWeightedTrend по ключу (atrP+'_'+maP) — каждая комбинация вычисляется 1 раз
    const _tpeWtCache = {};

    // Вспомогательная функция: прогнать одну точку через backtest и сохранить результат
    async function _tpeRunPoint(dimIndices) {
      // Дедупликация: быстрый числовой хеш вместо медленного join(',')
      let _hash = 0;
      for (let i = 0; i < dimIndices.length; i++) _hash = (_hash * 131 + dimIndices[i]) >>> 0;
      if (_tpeSeen.has(_hash)) return null;
      _tpeSeen.add(_hash);
      let _d = 0;
      const pvL      = _dims[_d][dimIndices[_d++]];
      const pvR      = _dims[_d][dimIndices[_d++]];
      const atrP     = _dims[_d][dimIndices[_d++]];
      const maP      = _dims[_d][dimIndices[_d++]];
      const _mType   = _dims[_d][dimIndices[_d++]];
      const htfRatio = _dims[_d][dimIndices[_d++]];
      const adxT        = _dims[_d][dimIndices[_d++]];
      const adxHtfRatio = _dims[_d][dimIndices[_d++]];
      const rsiPair  = _dims[_d][dimIndices[_d++]];
      const vfM      = _dims[_d][dimIndices[_d++]];
      const atrExpM  = _dims[_d][dimIndices[_d++]];
      const mdMax    = _dims[_d][dimIndices[_d++]];
      const freshMax = _dims[_d][dimIndices[_d++]];
      const wtT      = _dims[_d][dimIndices[_d++]];
      const vsaM     = _dims[_d][dimIndices[_d++]];
      const atrBoM   = _dims[_d][dimIndices[_d++]];
      const slPair   = _dims[_d][dimIndices[_d++]];
      const tpPair   = _dims[_d][dimIndices[_d++]];
      const beOff    = _dims[_d][dimIndices[_d++]];
      const beTrig   = _dims[_d][dimIndices[_d++]];
      const trTrig   = _dims[_d][dimIndices[_d++]];
      const trDist   = _dims[_d][dimIndices[_d++]];
      const timeBars = _dims[_d][dimIndices[_d++]];
      const _ip      = _dims[_d][dimIndices[_d++]];
      const tlPvL    = _dims[_d][dimIndices[_d++]];
      const tlPvR    = _dims[_d][dimIndices[_d++]];
      const _confType= _dims[_d][dimIndices[_d++]];
      const _confHtf = _dims[_d][dimIndices[_d++]];
      const _mCrossType= _dims[_d][dimIndices[_d++]];
      const _fCombo  = _dims[_d][dimIndices[_d++]]; // powerset: объект с bool-флагами фильтров
      // Эффективные флаги фильтров (TPE)
      const _effUseMa      = _fCombo.useMa      ?? useMa;
      const _effUseAdx     = _fCombo.useAdx     ?? useAdx;
      const _effUseRsi     = _fCombo.useRsi     ?? useRsi;
      const _effUseVolF    = _fCombo.useVolF    ?? useVolF;
      const _effUseStruct  = _fCombo.useStruct  ?? useStruct;
      const _effUseMaDist  = _fCombo.useMaDist  ?? useMaDist;
      const _effUseCandleF = _fCombo.useCandleF ?? useCandleF;
      const _effUseConsec  = _fCombo.useConsec  ?? useConsec;
      const _effUseSTrend  = _fCombo.useSTrend  ?? useSTrend;
      const _effUseFresh   = _fCombo.useFresh   ?? useFresh;
      const _effUseAtrExp  = _fCombo.useAtrExp  ?? useAtrExp;
      const _effUseConfirm = _fCombo.useConfirm ?? useConfirm;
      const _effUseVSA     = _fCombo.useVSA     ?? useVSA;
      const _effUseLiq     = _fCombo.useLiq     ?? useLiq;
      const _effUseVolDir  = _fCombo.useVolDir  ?? useVolDir;
      const _effUseWT      = _fCombo.useWT      ?? useWT;
      const _effUseFat     = _fCombo.useFat     ?? useFat;
      const adxL        = _ip.adxL        ?? window._ipDef.adxL;
      const sTrendWin   = _ip.sTrendWin   ?? window._ipDef.sTrendWin;
      const confN       = _ip.confN       ?? window._ipDef.confN;
      const revBars     = _ip.revBars     ?? window._ipDef.revBars;
      const revSkip     = _ip.revSkip     ?? window._ipDef.revSkip;
      const revCooldown = _ip.revCooldown ?? window._ipDef.revCooldown;
      const slPivOff    = _ip.slPivOff    ?? window._ipDef.slPivOff;
      const slPivMax    = _ip.slPivMax    ?? window._ipDef.slPivMax;
      const slPivL      = _ip.slPivL      ?? window._ipDef.slPivL;
      const slPivR      = _ip.slPivR      ?? window._ipDef.slPivR;
      const rsiExitPer  = _ip.rsiExitPer  ?? window._ipDef.rsiExitPer;
      const rsiExitOS   = _ip.rsiExitOS   ?? window._ipDef.rsiExitOS;
      const rsiExitOB   = _ip.rsiExitOB   ?? window._ipDef.rsiExitOB;
      const maCrossP    = _ip.maCrossP    ?? window._ipDef.maCrossP;
      const macdFast    = _ip.macdFast    ?? window._ipDef.macdFast;
      const macdSlow    = _ip.macdSlow    ?? window._ipDef.macdSlow;
      const macdSigP    = _ip.macdSigP    ?? window._ipDef.macdSigP;
      const stochKP     = _ip.stochKP     ?? window._ipDef.stochKP;
      const stochDP     = _ip.stochDP     ?? window._ipDef.stochDP;
      const stochOS     = _ip.stochOS     ?? window._ipDef.stochOS;
      const stochOB     = _ip.stochOB     ?? window._ipDef.stochOB;
      const volMoveMult = _ip.volMoveMult ?? window._ipDef.volMoveMult;
      const nReversalN  = _ip.nReversalN  ?? window._ipDef.nReversalN;
      const stAtrP      = _ip.stAtrP      ?? window._ipDef.stAtrP;
      const stMult      = _ip.stMult      ?? window._ipDef.stMult;
      const waitBars    = _ip.waitBars    ?? window._ipDef.waitBars;
      const waitRetrace = _ip.waitRetrace ?? window._ipDef.waitRetrace;
      const eisPeriod   = _ip.eisPeriod   ?? window._ipDef.eisPeriod;
      const erPeriod    = _ip.erPeriod    ?? window._ipDef.erPeriod;
      const {lo:pivSLLo, hi:pivSLHi} = useSLPiv ? _getPivSL(slPivL, slPivR) : {lo:null, hi:null};
      const rsiExitArr = useRsiExit   ? (rsiExitCache[rsiExitPer]||(rsiExitCache[rsiExitPer]=calcRSI(rsiExitPer))) : null;
      const maCrossArr = useMaCross   ? (()=>{const k=_mCrossType+'_'+maCrossP;return maCrossNewCache[k]||(maCrossNewCache[k]=calcMA(closes,maCrossP,_mCrossType));})() : null;
      const stDir      = (useSupertrend||useStExit) ? (()=>{const k=stAtrP+'_'+stMult;return stDirCache[k]||(stDirCache[k]=calcSupertrend(stAtrP,stMult));})() : null;
      let macdLine=null,macdSignal=null;
      if(useMacd||useMacdFilter){const mk=macdFast+'_'+macdSlow+'_'+macdSigP;if(!macdNewCache[mk]){const m=calcMACD(macdFast,macdSlow,macdSigP);macdNewCache[mk]=m;}macdLine=macdNewCache[mk].line;macdSignal=macdNewCache[mk].signal;}
      let stochD=null;
      if(useStochExit){const sk=stochKP+'_'+stochDP;if(!stochNewCache[sk])stochNewCache[sk]=calcStochastic(stochKP,stochDP);stochD=stochNewCache[sk].dArr;}
      let eisEMAArr=null,eisHistArr=null;
      if(useEIS){const ep=eisPeriod||13;const ek='eis_'+ep;eisEMAArr=maCache[ek]||(maCache[ek]=calcEMA(closes,ep));if(!macdNewCache['eis_hist']){const m=calcMACD(12,26,9);const h=new Float64Array(N);for(let i=0;i<N;i++)h[i]=m.line[i]-m.signal[i];macdNewCache['eis_hist']=h;}eisHistArr=macdNewCache['eis_hist'];}
      let erArr=null;
      if(useER){const ep=erPeriod||10;const ek='er_'+ep;if(!maCache[ek]){const ea=new Float64Array(N);for(let i=ep;i<N;i++){const net=Math.abs(closes[i]-closes[i-ep]);let sum=0;for(let j=i-ep+1;j<=i;j++)sum+=Math.abs(closes[j]-closes[j-1]);ea[i]=sum>0?net/sum:0;}maCache[ek]=ea;}erArr=maCache[ek];}
      const {sigL:tfSigL, sigS:tfSigS} = _getTfSig(tlPvL, tlPvR);

      // Пропускаем невалидные BE комбинации
      if (useBE && beOff >= beTrig) { return 0; }

      const pk = pvL+'_'+pvR;
      if (!pvCache[pk]) pvCache[pk] = {lo:calcPivotLow(pvL,pvR), hi:calcPivotHigh(pvL,pvR)};
      if (!atrCache[atrP]) atrCache[atrP] = calcRMA_ATR(atrP);
      if (!atrAvgCache[atrP]) atrAvgCache[atrP] = calcSMA(atrCache[atrP], 50);
      const atrAvg = atrAvgCache[atrP];
      const mk = _mType+'_'+maP+'_htf'+htfRatio;
      let maArr = null;
      if (maP > 0) {
        if (!maCache[mk]) maCache[mk] = htfRatio>1 ? calcHTFMA(DATA,htfRatio,maP,_mType) : calcMA(closes,maP,_mType);
        maArr = maCache[mk];
      }
      const _wtKey = atrP+'_'+mk;
      let wtScores = null;
      if (_effUseWT && maArr) {
        if (!_tpeWtCache[_wtKey]) _tpeWtCache[_wtKey] = calcWeightedTrend(maArr, atrCache[atrP], wtN, wtVolW, wtBodyW, wtDistW, wtUseDist);
        wtScores = _tpeWtCache[_wtKey];
      }
      let confMAArr = null;
      if (_effUseConfirm && confN > 0) {
        const ck = _confType+'_'+confN+'_htf'+_confHtf;
        if (!maCache[ck]) maCache[ck] = _confHtf>1 ? calcHTFMA(DATA,_confHtf,confN,_confType) : calcMA(closes,confN,_confType);
        confMAArr = maCache[ck];
      }
      const _adxCk = adxL+'_htf'+adxHtfRatio;
      if (!adxCache[_adxCk]) adxCache[_adxCk] = adxHtfRatio>1 ? calcHTFADX(DATA,adxHtfRatio,adxL) : calcADX(adxL);

      const btCfg = {
        comm:commTotal,
        usePivot:usePv,pvLo:pvCache[pk].lo,pvHi_:pvCache[pk].hi,
        useEngulf:useEng,usePinBar:usePin,pinRatio,
        useBoll:useBol,bbB,bbD,
        useDonch:useDon,donH,donL,
        useAtrBo,atrBoMA,atrBoATR:atrBoATR2,atrBoMult:atrBoM,
        useMaTouch:useMaT,matMA,matZone,
        useSqueeze:useSqz,sqzOn,sqzCount,sqzMinBars,
        useTLTouch,useTLBreak,useFlag,useTri,tfSigL,tfSigS,tlPvL,tlPvR,
        useRsiExit,rsiExitArr,rsiExitPeriod:rsiExitPer,rsiExitOS,rsiExitOB,
        useMaCross,maCrossArr,maCrossP,maCrossType:_mCrossType,
        useFreeEntry,
        useMacd,macdLine,macdSignal,macdFast,macdSlow,macdSignalP:macdSigP,
        useStochExit,stochD,stochKP,stochDP,stochOS,stochOB,
        useVolMove,volMoveMult,
        useInsideBar,
        useNReversal,nReversalN,
        useSupertrend,stDir,stAtrP,stMult,
        useEIS,eisEMAArr,eisHistArr,eisPeriod:eisPeriod||13,
        useSoldiers,
        useStExit,
        waitBars:waitBars||0,waitRetrace:waitRetrace||false,waitMaxBars,waitCancelAtr,
        hasSLA:!!(slPair.a),slMult:slPair.a?slPair.a.m:0,hasSLB:!!(slPair.p),slPctMult:slPair.p?slPair.p.m:0,slLogic,
        hasTPA:!!(tpPair.a),tpMult:tpPair.a?tpPair.a.m:0,tpMode:tpPair.a?tpPair.a.type:'rr',
        hasTPB:!!(tpPair.b),tpMultB:tpPair.b?tpPair.b.m:0,tpModeB:tpPair.b?tpPair.b.type:'rr',tpLogic,
        useBE,beTrig,beOff,useTrail,trTrig,trDist,
        useRev,revBars,revMode,revAct,revSrc,revSkip,revCooldown,
        useTime,timeBars,timeMode,usePartial,partRR,partPct,partBE,
        useClimax:useClimaxExit&&HAS_VOLUME,clxVolMult,clxBodyMult,clxMode,
        useMA:_effUseMa&&maP>0,maArr,maType:_mType,maP,htfRatio,
        useADX:_effUseAdx&&adxT>0,adxArr:adxCache[_adxCk],adxThresh:adxT,adxLen:adxL,adxHtfRatio,useAdxSlope,adxSlopeBars,
        useRSI:_effUseRsi,rsiArr:_effUseRsi?_tpeRsiArr:null,rsiOS:rsiPair.os,rsiOB:rsiPair.ob,
        useVolF:_effUseVolF&&vfM>0,atrAvg,volFMult:vfM,
        useAtrExp:_effUseAtrExp&&atrExpM>0,atrExpMult:atrExpM,
        useStruct:_effUseStruct,structBull,structBear,strPvL,strPvR,
        useSLPiv,slPivOff,slPivMax,slPivL,slPivR,slPivTrail,pivSLLo,pivSLHi,
        useConfirm:_effUseConfirm&&confN>0,confN,confMatType:_confType,confHtfRatio:_confHtf,maArrConfirm:confMAArr,
        useMaDist:_effUseMaDist&&mdMax>0,maDistMax:mdMax,
        useCandleF:_effUseCandleF,candleMin,candleMax,useConsec:_effUseConsec,consecMax,
        useSTrend:_effUseSTrend,sTrendWin,useFresh:_effUseFresh&&freshMax>0,freshMax,
        useVSA:_effUseVSA&&vsaM>0,vsaMult:vsaM,volAvg:volAvgArr,
        useLiq:_effUseLiq,liqMin,useVolDir:_effUseVolDir,volDirPeriod:volDirP,
        useWT:_effUseWT&&wtT>0,wtScores,wtThresh:wtT,
        useFat:_effUseFat,fatConsec,fatVolDrop,bodyAvg:bodyAvgArr,
        useMacdFilter:_fCombo.useMacdFilter??useMacdFilter,
        useER:_fCombo.useER??useER,erArr,erPeriod:erPeriod||10,erThresh,
        useKalmanMA:_fCombo.useKalmanMA??useKalmanMA,kalmanLen, // ##KALMAN_MA##
        start:Math.max(maP||0,50)+2,pruning:false,maxDDLimit:maxDD
      };

      if (_useOOS) DATA = _isData;
      let r;
      try { r = backtest(pvCache[pk].lo, pvCache[pk].hi, atrCache[atrP], btCfg); }
      finally { if (_useOOS) DATA = _fullDATA; }
      done++;
      // Мягкий score: градация для всех результатов, не только прошедших фильтр
      // Прошёл фильтр: P/DD или GT-Score (зависит от c_use_gt)
      // Не прошёл: небольшой отрицательный score пропорционально насколько близко
      //   — помогает TPE уходить от совсем плохих зон
      let score;
      if (r && r.n >= minTrades && r.dd <= maxDD) {
        const pdd = r.dd > 0 ? r.pnl / r.dd : (r.pnl > 0 ? 50 : 0);
        score = Math.max(0, _useGT ? _calcGTScore(r) : pdd);
      } else if (r && r.n > 0) {
        // Частичный score: pnl/maxDD нормализованный в [-1, 0)
        // Если pnl > 0 но DD превышает — слегка отрицательный
        // Если pnl < 0 — сильно отрицательный
        const softPnl = r.pnl / Math.max(maxDD, 1);
        const ddPenalty = r.dd > maxDD ? -(r.dd - maxDD) / Math.max(maxDD, 1) : 0;
        const tradePenalty = r.n < minTrades ? -0.5 * (1 - r.n / minTrades) : 0;
        score = Math.max(-2, softPnl * 0.1 + ddPenalty + tradePenalty);
      } else {
        score = -2; // нет сделок вообще
      }
      const pdd = (r && r.dd > 0) ? r.pnl/r.dd : (r && r.pnl > 0 ? 50 : 0);
      const sig = _calcStatSig(r);
      const gt = _calcGTScore(r);

      if (r && r.n >= minTrades && r.dd <= maxDD) {
        let slDesc = slPair.combo ? `SL(ATR×${slPair.a.m}${slLogic==='or'?'|OR|':'|AND|'}${slPair.p.m}%)` : slPair.a ? `SL×${slPair.a.m}ATR` : `SL${slPair.p.m}%`;
        if(useSLPiv) slDesc+=`+SPiv(L${slPivL}/R${slPivR}×${slPivOff})`;
        let tpDesc = tpPair.combo ? (()=>{const n1=tpPair.a.type==='rr'?`RR${tpPair.a.m}`:tpPair.a.type==='atr'?`TP×${tpPair.a.m}ATR`:`TP${tpPair.a.m}%`;const n2=tpPair.b.type==='rr'?`RR${tpPair.b.m}`:tpPair.b.type==='atr'?`TP×${tpPair.b.m}ATR`:`TP${tpPair.b.m}%`;return `TP(${n1}${tpLogic==='or'?'|OR|':'|AND|'}${n2})`;})() : tpPair.a ? (tpPair.a.type==='rr'?`RR×${tpPair.a.m}`:tpPair.a.type==='atr'?`TP×${tpPair.a.m}ATR`:`TP${tpPair.a.m}%`) : '';
        const name = buildName(btCfg, pvL, pvR, slDesc, tpDesc, {}, {maP, maType:_mType, htfRatio, stw:sTrendWin, atrP, adxL, adxHtfRatio});
        if (!_resultNames.has(name)) {
          _resultNames.add(name);
          const _cfg_tpe = {usePivot:usePv,pvL,pvR,useEngulf:useEng,usePinBar:usePin,pinRatio,
              useBoll:useBol,bbLen:$n('e_bbl')||20,bbMult:$n('e_bbm')||2,
              useDonch:useDon,donLen:$n('e_donl')||20,
              useAtrBo,atrBoLen:$n('e_atbl')||14,atrBoMult:atrBoM,
              useMaTouch:useMaT,matType:$v('e_matt'),matPeriod:$n('e_matp')||20,matZone:$n('e_matz')||0.2,
              useSqueeze:useSqz,sqzBBLen:$n('e_sqbl')||20,sqzKCMult:$n('e_sqkm')||1.5,sqzMinBars,
              useTLTouch,useTLBreak,useFlag,useTri,
              tlPvL,tlPvR,tlZonePct:$n('e_tl_zone')||0.3,
              flagImpMin:$n('e_flag_imp')||2.0,flagMaxBars:$n('e_flag_bars')||20,flagRetrace:$n('e_flag_ret')||0.618,
              useRsiExit,rsiExitPeriod:rsiExitPer,rsiExitOS,rsiExitOB,
              useMaCross,maCrossP,maCrossType:_mCrossType,
              useFreeEntry,
              useMacd,macdFast,macdSlow,macdSignalP:macdSigP,
              useStochExit,stochKP,stochDP,stochOS,stochOB,
              useVolMove,volMoveMult,
              useInsideBar,
              useNReversal,nReversalN,
              useSupertrend,stAtrP,stMult,
              useStExit,
              waitBars:waitBars||0,waitRetrace:waitRetrace||false,waitMaxBars,waitCancelAtr,
              slPair,slLogic,tpPair,tpLogic,
              useSLPiv,slPivOff,slPivMax,slPivL,slPivR,slPivTrail,
              useBE,beTrig,beOff,useTrail,trTrig,trDist,
              useRev,revBars,revMode,revAct,revSrc,revSkip,revCooldown,
              useTime,timeBars,timeMode,usePartial,partRR,partPct,partBE,
              useClimax:useClimaxExit&&HAS_VOLUME,clxVolMult,clxBodyMult,clxMode,
              useMA:_effUseMa&&maP>0,maType:_mType,maP,htfRatio,
              useADX:_effUseAdx&&adxT>0,adxThresh:adxT,adxLen:adxL,adxHtfRatio,useAdxSlope,adxSlopeBars,
              useRSI:_effUseRsi,rsiOS:rsiPair.os,rsiOB:rsiPair.ob,
              useVolF:_effUseVolF&&vfM>0,volFMult:vfM,
              useAtrExp:_effUseAtrExp&&atrExpM>0,atrExpMult:atrExpM,
              useStruct:_effUseStruct,structLen,strPvL,strPvR,
              useConfirm:_effUseConfirm&&confN>0,confN,confMatType:_confType,confHtfRatio:_confHtf,
              useMaDist:_effUseMaDist&&mdMax>0,maDistMax:mdMax,
              useCandleF:_effUseCandleF,candleMin,candleMax,useConsec:_effUseConsec,consecMax,
              useSTrend:_effUseSTrend,sTrendWin,useFresh:_effUseFresh&&freshMax>0,freshMax,
              useVSA:_effUseVSA&&vsaM>0,vsaMult:vsaM,vsaPeriod:vsaP,
              useLiq:_effUseLiq,liqMin,useVolDir:_effUseVolDir,volDirPeriod:volDirP,
              useWT:_effUseWT&&wtT>0,wtThresh:wtT,wtN,wtVolW,wtBodyW,wtUseDist,
              useFat:_effUseFat,fatConsec,fatVolDrop,
              useKalmanMA:_fCombo.useKalmanMA??useKalmanMA,kalmanLen, // ##KALMAN_MA##
              atrPeriod:atrP,commission:commTotal,baseComm:comm,spreadVal:spread*2};
          // OOS и тяжёлые метрики НЕ вызываем здесь — это горячий цикл
          // CVR/UPI/Sortino/kRatio вычислятся батчем после завершения TPE
          results.push({name,pnl:r.pnl,wr:r.wr,n:r.n,dd:r.dd,pdd,avg:r.avg,sig,gt,
            p1:r.p1,p2:r.p2,dwr:r.dwr,c1:r.c1,c2:r.c2,nL:r.nL||0,pL:r.pL||0,wrL:r.wrL,nS:r.nS||0,pS:r.pS||0,wrS:r.wrS,dwrLS:r.dwrLS,
            cvr:null,upi:null,sortino:null,kRatio:null,sqn:r.sqn??null,
            omega:null,pain:null,burke:null,serenity:null,ir:null,cfg:_cfg_tpe}); // ##OMG ##PAIN ##BURKE ##SRNTY ##IR (null — батч)
          equities[name] = r.eq;
        }
      }
      return score;
    }

    // ── Фаза 1: LHS разведка ─────────────────────────────────────────
    const _lhsIndices = [];
    {
      const realTotal2 = _mcDimSizes.reduce((a,b)=>a*b,1);
      if (realTotal2 <= _exploreN) {
        for (let i = 0; i < realTotal2; i++) _lhsIndices.push(i);
      } else {
        const stratSize = realTotal2 / _exploreN;
        for (let i = 0; i < _exploreN; i++) {
          const lo = Math.floor(i * stratSize);
          const hi = Math.floor((i+1)*stratSize)-1;
          _lhsIndices.push(lo + Math.floor(Math.random()*(hi-lo+1)));
        }
        for (let i = _exploreN-1; i > 0; i--) {
          const j = Math.floor(Math.random()*(i+1));
          [_lhsIndices[i],_lhsIndices[j]]=[_lhsIndices[j],_lhsIndices[i]];
        }
      }
    }

    for (let ei = 0; ei < _lhsIndices.length && !stopped; ei++) {
      let _idx = _lhsIndices[ei];
      const _di = new Array(nDims);
      for (let d = nDims-1; d >= 0; d--) { _di[d]=_idx%_dsz[d]; _idx=Math.floor(_idx/_dsz[d]); }
      const score = await _tpeRunPoint(_di);
      if (score !== null) _tpeHistory.push({dimIndices:[..._di], score});
      if (ei % 5 === 0) {
        setMcPhase(`🔮 TPE разведка ${ei+1}/${_exploreN} | Находки: ${results.length}/${tpeTarget}`);
        updateETA(done, tpeMaxIter, results.length);
        await yieldToUI();
        await checkPause();
      }
    }

    // ── Фаза 2: TPE эксплуатация — работаем пока не найдено tpeTarget результатов
    //   или не исчерпан бюджет tpeMaxIter итераций
    setMcPhase(`🎯 TPE эксплуатация | Цель: ${tpeTarget} результатов | Макс: ${tpeMaxIter} итераций…`);

    let _tpeSortedCache = null;
    let _tpeBestScore = 0;
    let _lastYieldTime = performance.now();
    // Предвычисленная матрица [dimIdx][histIdx] — обновляем только при изменении good/bad
    let _goodMat = null, _badMat = null, _lastGoodLen = -1, _lastBadLen = -1;

    let _tiSinceLastDone = 0, _donePrev = 0;
    for (let ti = 0; results.length < tpeTarget && done < tpeMaxIter && !stopped; ti++) {
      // Антизамерзание: если 500 внешних итераций без нового done → пространство исчерпано
      // Сбрасываем _tpeSeen чтобы разрешить повторное исследование
      if (done === _donePrev) { _tiSinceLastDone++; } else { _tiSinceLastDone = 0; _donePrev = done; }
      if (_tiSinceLastDone >= 500) { _tpeSeen.clear(); _tiSinceLastDone = 0; }

      const progress = Math.min(1, done / Math.max(tpeMaxIter - 1, 1));
      const gamma = 0.25 - 0.10 * progress;

      // Пересортируем раз в 50 итераций
      if (done % 50 === 0 || _tpeSortedCache === null) {
        _tpeSortedCache = _tpeHistory.slice().sort((a,b)=>b.score-a.score);
      }
      const sorted = _tpeSortedCache;
      const nGood = Math.max(3, Math.floor(sorted.length * gamma));
      const goodEnd = Math.min(nGood, 150);
      const badEnd  = Math.min(nGood + 300, sorted.length);

      // Пересчитываем матрицы только когда изменились размеры срезов
      if (goodEnd !== _lastGoodLen || badEnd - nGood !== _lastBadLen) {
        _goodMat = new Float32Array(nDims * goodEnd);
        _badMat  = new Float32Array(nDims * (badEnd - nGood));
        for (let d = 0; d < nDims; d++) {
          const inv = 1 / Math.max(_dsz[d]-1, 1);
          for (let i = 0; i < goodEnd; i++)
            _goodMat[d * goodEnd + i] = sorted[i].dimIndices[d] * inv;
          for (let i = nGood; i < badEnd; i++)
            _badMat[d * (badEnd-nGood) + (i-nGood)] = sorted[i].dimIndices[d] * inv;
        }
        _lastGoodLen = goodEnd;
        _lastBadLen  = badEnd - nGood;
      }

      // Выбираем лучший индекс для каждой размерности через гистограмму
      const nextDi = new Array(nDims);
      for (let d = 0; d < nDims; d++) {
        const gv = _goodMat.subarray(d * goodEnd, d * goodEnd + goodEnd);
        const bv = _badMat.subarray(d * _lastBadLen, d * _lastBadLen + _lastBadLen);
        nextDi[d] = _tpeSampleDim(gv, bv, _dims[d], _nCandidates);
      }

      // Парные взаимодействия (числовой массив вместо объекта со строками)
      if (goodEnd >= 5) {
        const _pairDims = [[2,12],[12,13],[2,13],[14,15],[16,17]];
        for (const [da, db] of _pairDims) {
          if (da >= nDims || db >= nDims) continue;
          const szA = _dsz[da], szB = _dsz[db];
          const pSum = new Float32Array(szA * szB);
          const pCnt = new Uint16Array(szA * szB);
          for (let i = 0; i < goodEnd; i++) {
            const h = sorted[i];
            const k = h.dimIndices[da] * szB + h.dimIndices[db];
            pSum[k] += h.score; pCnt[k]++;
          }
          let bestK = -1, bestAvg = -Infinity;
          for (let k = 0; k < pSum.length; k++) {
            if (pCnt[k] > 0) { const avg = pSum[k]/pCnt[k]; if (avg > bestAvg) { bestAvg=avg; bestK=k; } }
          }
          if (bestK >= 0 && Math.random() < 0.5) {
            nextDi[da] = Math.floor(bestK / szB);
            nextDi[db] = bestK % szB;
          }
        }
      }

      // Мутация 15%
      if (Math.random() < 0.15) {
        const dm = Math.floor(Math.random() * nDims);
        nextDi[dm] = Math.floor(Math.random() * _dsz[dm]);
      }

      const score = await _tpeRunPoint(nextDi);
      if (score !== null) {
        _tpeHistory.push({dimIndices:[...nextDi], score});
        if (score > _tpeBestScore) _tpeBestScore = score;
        // Ограничиваем размер истории — не даём расти бесконечно
        if (_tpeHistory.length > 1200) {
          _tpeHistory.sort((a,b)=>b.score-a.score);
          _tpeHistory.length = 1000;
          _tpeSortedCache = null;
        }
      }

      if (done % 50 === 0) {
        const pct = Math.round(Math.min(results.length / tpeTarget, done / tpeMaxIter) * 100);
        setMcPhase(`🎯 TPE итер:${done} | γ=${gamma.toFixed(2)} | P/DD: ${_tpeBestScore.toFixed(2)} | ${results.length}/${tpeTarget} (${pct}%)`);
        updateETA(done, tpeMaxIter, results.length);
      }
      // Time-based yield: отдаём UI каждые ~12мс независимо от кол-ва итераций
      const _now = performance.now();
      if (_now - _lastYieldTime >= 12) {
        _lastYieldTime = _now;
        await yieldToUI();
        await checkPause();
      }
    }

    // TPE завершён — батч метрик (CVR/UPI/Sortino/kRatio)
    // Вынесены из горячего цикла чтобы не замедлять TPE по мере роста pass-rate.
    if (results.length > 0) {
      setMcPhase(`⏳ Расчёт метрик ${results.length} результатов…`);
      for (let oi = 0; oi < results.length; oi++) {
        const _eq = equities[results[oi].name];
        if (_eq) {
          results[oi].cvr     = _calcCVR(_eq);
          results[oi].upi     = _calcUlcerIdx(_eq);
          results[oi].sortino = _calcSortino(_eq);
          results[oi].kRatio  = _calcKRatio(_eq);
          results[oi].omega    = _calcOmega(_eq);    // ##OMG
          results[oi].pain     = _calcPainRatio(_eq); // ##PAIN
          results[oi].burke    = _calcBurke(_eq);    // ##BURKE
          results[oi].serenity = _calcSerenity(_eq); // ##SRNTY
          results[oi].ir       = _calcInfoRatio(_eq); // ##IR
        }
        if (oi % 100 === 0) { await yieldToUI(); }
      }
    }
    // TPE завершён — батч OOS для всех найденных результатов
    if (_useOOS && results.length > 0) {
      setMcPhase(`⏳ OOS проверка ${results.length} результатов…`);
      for (let oi = 0; oi < results.length; oi++) {
        _attachOOS(results[oi].cfg, results[oi].name, results[oi].n);
        if (oi % 50 === 0) { await yieldToUI(); }
      }
    }
    results.sort((a,b)=>b.pdd-a.pdd);
    await _batchCPCV(results, 200);
    if (typeof setMcPhase==='function') setMcPhase(null);
    _curPage=0;
    renderVisibleResults(); showBestStats(); updateETA(done, tpeMaxIter, results.length);
    const _tpeStopReason = results.length >= tpeTarget ? `✅ цель ${tpeTarget} достигнута` : `✅ бюджет ${tpeMaxIter} итераций исчерпан`;
    $('prog').textContent=`${_tpeStopReason} | ${fmtNum(results.length)} / ${fmtNum(done)} прошли фильтр`;
    $('pbtn').style.display='none'; $('sbtn').style.display='none';
    $('rbtn').style.display=''; $('rbtn').disabled=false;
    playDone();
    return;
  }

  // ── Bayesian Optimisation (GP) — Tier 3 ─────────────────────────────────
  // GP surrogate с RBF ядром + EI acquisition function.
  // Находит оптимум за ~100 итераций vs 500–5000 для Grid/MC.
  // Работает с теми же _mcDims что TPE (до 6 измерений).
  // Откат: удалить этот блок + GP-функции выше + ##BAYES_OPT в ui.js + shell.html
  if (optMode === 'bo') {
    const boN    = Math.max(20, parseInt($v('bo_n') || '100') || 100);
    const nDims  = _mcDims.length;
    const _dsz   = _mcDimSizes;
    const _boSeen = new Set();
    // GP data storage
    const Xobs = []; // array of Float64Array (normalised [0,1]^d)
    const yobs = []; // Float64Array (scores)
    let gpModel  = null;
    let yBest    = -Infinity;
    const _boNoise = 0.05; // GP noise (σ²)

    // Normalise dim index to [0,1]
    const normIdx = (idx, d) => _dsz[d] <= 1 ? 0 : idx / (_dsz[d] - 1);
    const randPoint = () => _mcDims.map((dim, d) => Math.floor(Math.random() * _dsz[d]));

    setMcPhase(`🔬 BO разведка (${Math.min(20, boN)} случайных точек)…`);

    for (let iter = 0; iter < boN && !_mcDone; iter++) {
      let dimIndices;
      if (iter < Math.min(20, Math.floor(boN * 0.2)) || gpModel === null) {
        // Exploration: random LHS
        dimIndices = randPoint();
      } else {
        // Exploitation: maximise EI over random candidates
        const nCand = 200;
        let bestEI = -1, bestCand = null;
        for (let c = 0; c < nCand; c++) {
          const cand = randPoint();
          const xCand = Float64Array.from(cand.map((idx, d) => normIdx(idx, d)));
          const { mu, sigma } = _gpPredict(gpModel, Xobs, xCand);
          const ei = _gpEI(mu, sigma, yBest);
          if (ei > bestEI) { bestEI = ei; bestCand = cand; }
        }
        dimIndices = bestCand || randPoint();
      }

      const hash = dimIndices.join(',');
      if (_boSeen.has(hash)) continue;
      _boSeen.add(hash);

      const score = await _tpeRunPoint(dimIndices);
      if (score !== null) {
        const xNorm = Float64Array.from(dimIndices.map((idx, d) => normIdx(idx, d)));
        Xobs.push(xNorm);
        yobs.push(score);
        if (score > yBest) yBest = score;
        // Refit GP every 5 obs or when obs count changes significantly
        if (Xobs.length % 5 === 0 || Xobs.length <= 5) {
          try { gpModel = _gpFit(Xobs, yobs, _boNoise); } catch (_) { gpModel = null; }
        }
      }

      if (iter % 10 === 0 || iter === boN - 1) {
        updateETA(iter + 1, boN, results.length);
        setMcPhase(`🔬 BO итерация ${iter + 1}/${boN} · найдено ${results.length} · лучший score ${yBest.toFixed(3)}`);
        await yieldToUI();
        await checkPause();
      }
    }

    // Batch metrics for BO results (same as TPE)
    if (results.length > 0) {
      setMcPhase(`⏳ Расчёт метрик ${results.length} результатов…`);
      for (let oi = 0; oi < results.length; oi++) {
        const _eq = equities[results[oi].name];
        if (_eq) {
          results[oi].cvr      = _calcCVR(_eq);
          results[oi].upi      = _calcUlcerIdx(_eq);
          results[oi].sortino  = _calcSortino(_eq);
          results[oi].kRatio   = _calcKRatio(_eq);
          results[oi].omega    = _calcOmega(_eq);
          results[oi].pain     = _calcPainRatio(_eq);
          results[oi].burke    = _calcBurke(_eq);
          results[oi].serenity = _calcSerenity(_eq);
          results[oi].ir       = _calcInfoRatio(_eq);
        }
        if (oi % 100 === 0) { await yieldToUI(); }
      }
    }
    if (_useOOS && results.length > 0) {
      setMcPhase(`⏳ OOS проверка ${results.length} результатов…`);
      for (let oi = 0; oi < results.length; oi++) {
        _attachOOS(results[oi].cfg, results[oi].name, results[oi].n);
        if (oi % 50 === 0) { await yieldToUI(); }
      }
    }
    _curPage = 0;
    renderVisibleResults(); showBestStats();
    updateETA(boN, boN, results.length);
    $('prog').textContent = `✅ BO завершён ${boN} итераций | ${fmtNum(results.length)} прошли фильтр`;
    $('pbtn').style.display = 'none'; $('sbtn').style.display = 'none';
    $('rbtn').style.display = ''; $('rbtn').disabled = false;
    playDone();
    return;
  }
  // ─────────────────────────────────────────────────────────────────

  for(const pvL of pvLs) { for(const pvR of pvRs) {
    if(_mcDone) break;
    const pk=pvL+'_'+pvR;
    if(!pvCache[pk]) pvCache[pk]={lo:calcPivotLow(pvL,pvR),hi:calcPivotHigh(pvL,pvR)};

    for(const atrP of atrPs) {
      if(_mcDone) break;
      if(!atrCache[atrP]) atrCache[atrP]=calcRMA_ATR(atrP);
      const atrAvg=calcSMA(Array.from(atrCache[atrP]),50);

      for(const maP of maPs) {
        if(_mcDone) break;
        for(const mType of (maTypeArr.length?maTypeArr:['EMA'])) {
        if(_mcDone) break;
        for(const htfRatio of (htfRatioArr.length?htfRatioArr:[1])) {
        if(_mcDone) break;
        const mk=mType+'_'+maP+'_htf'+htfRatio;
        let maArr=null;
        if(maP>0) {
          if(!maCache[mk]) maCache[mk]=htfRatio>1?calcHTFMA(DATA,htfRatio,maP,mType):calcMA(closes,maP,mType);
          maArr=maCache[mk];
        }

        for(const adxT of (adxTs.length?adxTs:[0])) {
          if(_mcDone) break;
          for(const adxHtfRatio of (adxHtfArr.length?adxHtfArr:[1])) {
          if(_mcDone) break;
          const _adxCk=adxL+'_htf'+adxHtfRatio;
          if(!adxCache[_adxCk]) adxCache[_adxCk]=adxHtfRatio>1?calcHTFADX(DATA,adxHtfRatio,adxL):calcADX(adxL);
          for(const rsiPair of rsiPairs) {
            if(_mcDone) break;
            for(const vfM of (vfMs.length?vfMs:[0])) {
              if(_mcDone) break;
              for(const atrExpM of (atrExpMs.length?atrExpMs:[0])) {
              if(_mcDone) break;
              for(const mdMax of (mdMaxs.length?mdMaxs:[0])) {
                if(_mcDone) break;
                for(const freshMax of (freshMaxs.length?freshMaxs:[20])) {
                  if(_mcDone) break;
                  for(const wtT of (wtThreshs.length?wtThreshs:[0])) {
                    if(_mcDone) break;
                    // Weighted trend scores (if enabled)
                    let wtScores=null;
                    if(useWT && maArr) {
                      wtScores=calcWeightedTrend(maArr,atrCache[atrP],wtN,wtVolW,wtBodyW,wtDistW,wtUseDist);
                    }
                    for(const vsaM of (vsaMs.length?vsaMs:[0])) {
                      if(_mcDone) break;
                      for(const atrBoM of (atrBoMults.length?atrBoMults:[2.0])) {
                        if(_mcDone) break;
                        for(const slPair of slPairs) {
                          if(_mcDone) break;
                          for(const tpPair of tpPairs) {
                            if(_mcDone) break;
                            for(const beTrig of beTrigs) {
                            for(const beOff of beOffs) {
                              if(_mcDone) break;
                              if(useBE && beOff >= beTrig) continue; // только классический BE
                              for(const trTrig of trTrigs) {
                                for(const trDist of trDists) {
                                  for(const timeBars of (timeBarsArr.length?timeBarsArr:[50])) {
                                    for(const _ip of window._ipCombos) {
                                    if(_mcDone||stopped) break;
                                    const adxL     = _ip.adxL     ?? window._ipDef.adxL;
                                    const sTrendWin= _ip.sTrendWin?? window._ipDef.sTrendWin;
                                    const confN    = _ip.confN    ?? window._ipDef.confN;
                                    const revBars  = _ip.revBars  ?? window._ipDef.revBars;
                                    const revSkip  = _ip.revSkip  ?? window._ipDef.revSkip;
                                    const revCooldown = _ip.revCooldown ?? window._ipDef.revCooldown;
                                    const slPivOff    = _ip.slPivOff    ?? window._ipDef.slPivOff;
                                    const slPivMax    = _ip.slPivMax    ?? window._ipDef.slPivMax;
                                    const slPivL      = _ip.slPivL      ?? window._ipDef.slPivL;
                                    const slPivR      = _ip.slPivR      ?? window._ipDef.slPivR;
                                    const {lo:pivSLLo, hi:pivSLHi} = useSLPiv ? _getPivSL(slPivL, slPivR) : {lo:null, hi:null};
                                    const rsiExitPer  = _ip.rsiExitPer  ?? window._ipDef.rsiExitPer;
                                    const rsiExitOS   = _ip.rsiExitOS   ?? window._ipDef.rsiExitOS;
                                    const rsiExitOB   = _ip.rsiExitOB   ?? window._ipDef.rsiExitOB;
                                    const maCrossP    = _ip.maCrossP    ?? window._ipDef.maCrossP;
                                    const macdFast    = _ip.macdFast    ?? window._ipDef.macdFast;
                                    const macdSlow    = _ip.macdSlow    ?? window._ipDef.macdSlow;
                                    const macdSigP    = _ip.macdSigP    ?? window._ipDef.macdSigP;
                                    const stochKP     = _ip.stochKP     ?? window._ipDef.stochKP;
                                    const stochDP     = _ip.stochDP     ?? window._ipDef.stochDP;
                                    const stochOS     = _ip.stochOS     ?? window._ipDef.stochOS;
                                    const stochOB     = _ip.stochOB     ?? window._ipDef.stochOB;
                                    const volMoveMult = _ip.volMoveMult ?? window._ipDef.volMoveMult;
                                    const nReversalN  = _ip.nReversalN  ?? window._ipDef.nReversalN;
                                    const stAtrP      = _ip.stAtrP      ?? window._ipDef.stAtrP;
                                    const stMult      = _ip.stMult      ?? window._ipDef.stMult;
                                    const waitBars    = _ip.waitBars    ?? window._ipDef.waitBars;
                                    const waitRetrace = _ip.waitRetrace ?? window._ipDef.waitRetrace;
                                    const rsiExitArr = useRsiExit   ? (rsiExitCache[rsiExitPer]||(rsiExitCache[rsiExitPer]=calcRSI(rsiExitPer))) : null;
                                    const _mCrossType0 = maCrossTypeArr[0]||maCrossType;
                                    const maCrossArr = useMaCross   ? (()=>{const k=_mCrossType0+'_'+maCrossP;return maCrossNewCache[k]||(maCrossNewCache[k]=calcMA(closes,maCrossP,_mCrossType0));})() : null;
                                    const stDir      = (useSupertrend||useStExit) ? (()=>{const k=stAtrP+'_'+stMult;return stDirCache[k]||(stDirCache[k]=calcSupertrend(stAtrP,stMult));})() : null;
                                    let macdLine=null,macdSignal=null;
                                    if(useMacd){const mk=macdFast+'_'+macdSlow+'_'+macdSigP;if(!macdNewCache[mk]){const m=calcMACD(macdFast,macdSlow,macdSigP);macdNewCache[mk]=m;}macdLine=macdNewCache[mk].line;macdSignal=macdNewCache[mk].signal;}
                                    let stochD=null;
                                    if(useStochExit){const sk=stochKP+'_'+stochDP;if(!stochNewCache[sk])stochNewCache[sk]=calcStochastic(stochKP,stochDP);stochD=stochNewCache[sk].dArr;}
                                    if(stopped) break;
                                    for(const _confType of (confTypeArr.length?confTypeArr:['EMA'])) {
                                    for(const _confHtf of (confHtfArr.length?confHtfArr:[1])) {
                                    for(const _mCrossTyp of (maCrossTypeArr.length?maCrossTypeArr:['EMA'])) {
                                    if(_mcDone) break;

                                    // Вторая MA для фильтра (confMatType + confN)
                                     let confMAArr = null;
                                     if (useConfirm && confN > 0) {
                                       const ck = _confType+'_'+confN+'_htf'+_confHtf;
                                       if (!maCache[ck]) maCache[ck] = _confHtf>1?calcHTFMA(DATA,_confHtf,confN,_confType):calcMA(closes,confN,_confType);
                                       confMAArr = maCache[ck];
                                     }

                                     const btCfg={
                                      comm: commTotal,
                                      usePivot:usePv,useEngulf:useEng,usePinBar:usePin,pinRatio,
                                      useBoll:useBol,bbB,bbD,
                                      useDonch:useDon,donH,donL,
                                      useAtrBo,atrBoMA,atrBoATR:atrBoATR2,atrBoMult:atrBoM,
                                      useMaTouch:useMaT,matMA,matZone,
                                      useSqueeze:useSqz,sqzOn,sqzCount,sqzMinBars,
                                      // Trendline Figures
                                      useTLTouch,useTLBreak,useFlag,useTri,
                                      tfSigL,tfSigS,
                                      useRsiExit,rsiExitArr,rsiExitPeriod:rsiExitPer,rsiExitOS,rsiExitOB,
                                      useMaCross,maCrossArr,maCrossP,maCrossType:_mCrossTyp,
                                      useFreeEntry,
                                      useMacd,macdLine,macdSignal,macdFast,macdSlow,macdSignalP:macdSigP,
                                      useStochExit,stochD,stochKP,stochDP,stochOS,stochOB,
                                      useVolMove,volMoveMult,
                                      useInsideBar,
                                      useNReversal,nReversalN,
                                      useSupertrend,stDir,stAtrP,stMult,
                                      useStExit,
                                      waitBars:waitBars||0,waitRetrace:waitRetrace||false,waitMaxBars,waitCancelAtr,
                                      // SL
                                      hasSLA:!!slPair.a,
                                      slMult:slPair.a?slPair.a.m:0,
                                      hasSLB:!!slPair.p,
                                      slPctMult:slPair.p?slPair.p.m:0,
                                      slLogic,
                                      useSLPiv,slPivOff,slPivMax,slPivL,slPivR,slPivTrail,
                                      pivSLLo:useSLPiv?pivSLLo:null,pivSLHi:useSLPiv?pivSLHi:null,
                                      // TP
                                      hasTPA:!!tpPair.a,
                                      tpMult:tpPair.a?tpPair.a.m:0,
                                      tpMode:tpPair.a?tpPair.a.type:'rr',
                                      hasTPB:!!tpPair.b,
                                      tpMultB:tpPair.b?tpPair.b.m:0,
                                      tpModeB:tpPair.b?tpPair.b.type:'rr',
                                      tpLogic,
                                      // Exits
                                      useBE,beTrig,beOff,
                                      useTrail,trTrig,trDist,
                                      useRev,revBars,revMode,revAct,revSrc,revSkip,revCooldown,
                                      useTime,timeBars,timeMode,
                                      usePartial,partRR,partPct,partBE,
                                      useClimax:useClimaxExit&&HAS_VOLUME,clxVolMult,clxBodyMult,clxMode,
                                      // Filters
                                      useMA:maP>0,maArr,maType:mType,maP,htfRatio,
                                      useADX:useAdx&&adxT>0,adxArr:adxCache[_adxCk],adxThresh:adxT,adxLen:adxL,adxHtfRatio,useAdxSlope,adxSlopeBars,
                                      useRSI:useRsi,rsiArr:useRsi?calcRSI(14):null,
                                      rsiOS:rsiPair.os,rsiOB:rsiPair.ob,
                                      useVolF:useVolF&&vfM>0,atrAvg,volFMult:vfM,
                                      useAtrExp:useAtrExp&&atrExpM>0,atrExpMult:atrExpM,
                                      useStruct,structBull,structBear,strPvL,strPvR,
                                      useConfirm:useConfirm&&confN>0,confN,confMatType:_confType,confHtfRatio:_confHtf,maArrConfirm:confMAArr,
                                      useMaDist:useMaDist&&mdMax>0,maDistMax:mdMax,
                                      useCandleF,candleMin,candleMax,
                                      useConsec,consecMax,
                                      useSTrend,sTrendWin,
                                      useFresh:useFresh&&freshMax>0,freshMax,
                                      useVSA:useVSA&&vsaM>0,vsaMult:vsaM,volAvg:volAvgArr,
                                      useLiq,liqMin,
                                      useVolDir,volDirPeriod:volDirP,
                                      useWT:useWT&&wtT>0,wtScores,wtThresh:wtT,
                                      useFat,fatConsec,fatVolDrop,
                                      useKalmanMA,kalmanLen, // ##KALMAN_MA##
                                      bodyAvg:bodyAvgArr,
                                      start:Math.max(maP||0,50)+2,
                                      // Pruning
                                      pruning:optMode==='prune',maxDDLimit:maxDD
                                    };

                                    if (_useOOS) DATA = _isData;
                                    let r;
                                    try { r=backtest(pvCache[pk].lo,pvCache[pk].hi,atrCache[atrP],btCfg); }
                                    finally { if (_useOOS) DATA = _fullDATA; }
                                    done++;

                                    if(r && r.n>=minTrades && r.dd<=maxDD) {
                                      const pdd=r.dd>0?r.pnl/r.dd:0;
                                      const sig=_calcStatSig(r);
                                      const gt=_calcGTScore(r);
                                      // Build SL description
                                      let slDesc='';
                                      if(slPair.combo) {
                                        slDesc=`SL(ATR×${slPair.a.m}${slLogic==='or'?'|OR|':'|AND|'}${slPair.p.m}%)`;
                                      } else if(slPair.a) {
                                        slDesc=`SL×${slPair.a.m}ATR`;
                                      } else {
                                        slDesc=`SL${slPair.p.m}%`;
                                      }
                                      if(useSLPiv) slDesc+=`+SPiv(L${slPivL}/R${slPivR}×${slPivOff})`;
                                      // Build TP description
                                      let tpDesc='';
                                      if(tpPair.combo) {
                                        const nm1=tpPair.a.type==='rr'?`RR${tpPair.a.m}`:tpPair.a.type==='atr'?`TP×${tpPair.a.m}ATR`:`TP${tpPair.a.m}%`;
                                        const nm2=tpPair.b.type==='rr'?`RR${tpPair.b.m}`:tpPair.b.type==='atr'?`TP×${tpPair.b.m}ATR`:`TP${tpPair.b.m}%`;
                                        tpDesc=`TP(${nm1}${tpLogic==='or'?'|OR|':'|AND|'}${nm2})`;
                                      } else if(tpPair.a) {
                                        tpDesc=tpPair.a.type==='rr'?`RR×${tpPair.a.m}`:tpPair.a.type==='atr'?`TP×${tpPair.a.m}ATR`:`TP${tpPair.a.m}%`;
                                      }
                                      const name=buildName(btCfg,pvL,pvR,slDesc,tpDesc,{},{
                                        maP,maType:mType,htfRatio,stw:sTrendWin,atrP,adxL,adxHtfRatio
                                      });
                                      if (_resultNames.has(name)) { /* дубль — пропускаем */ } else {
                                      _resultNames.add(name);
                                      const _cfg_ex = {
                                          usePivot:usePv, pvL, pvR,
                                          useEngulf:useEng,
                                          usePinBar:usePin, pinRatio,
                                          useBoll:useBol, bbLen:$n('e_bbl')||20, bbMult:$n('e_bbm')||2,
                                          useDonch:useDon, donLen:$n('e_donl')||20,
                                          useAtrBo, atrBoLen:$n('e_atbl')||14, atrBoMult:atrBoM,
                                          useMaTouch:useMaT, matType:$v('e_matt'), matPeriod:$n('e_matp')||20, matZone:$n('e_matz')||0.2,
                                          useSqueeze:useSqz, sqzBBLen:$n('e_sqbl')||20, sqzKCMult:$n('e_sqkm')||1.5, sqzMinBars,
                                          useTLTouch, useTLBreak, useFlag, useTri,
                                          tlPvL:$n('e_tl_pvl')||5, tlPvR:$n('e_tl_pvr')||3, tlZonePct:$n('e_tl_zone')||0.3,
                                          flagImpMin:$n('e_flag_imp')||2.0, flagMaxBars:$n('e_flag_bars')||20, flagRetrace:$n('e_flag_ret')||0.618,
                                          useRsiExit,rsiExitPeriod:rsiExitPer,rsiExitOS,rsiExitOB,
                                          useMaCross,maCrossP,maCrossType:_mCrossTyp,
                                          useFreeEntry,
                                          useMacd,macdFast,macdSlow,macdSignalP:macdSigP,
                                          useStochExit,stochKP,stochDP,stochOS,stochOB,
                                          useVolMove,volMoveMult,
                                          useInsideBar,
                                          useNReversal,nReversalN,
                                          useSupertrend,stAtrP,stMult,
                                          useStExit,
                                          waitBars:waitBars||0,waitRetrace:waitRetrace||false,waitMaxBars,waitCancelAtr,
                                          slPair, slLogic, tpPair, tpLogic,
                                          useSLPiv, slPivOff, slPivMax, slPivL, slPivR, slPivTrail,
                                          useBE, beTrig, beOff,
                                          useTrail, trTrig, trDist,
                                          useRev, revBars, revMode, revAct, revSrc, revSkip, revCooldown,
                                          useTime, timeBars, timeMode,
                                          usePartial, partRR, partPct, partBE,
                                          useClimax:useClimaxExit&&HAS_VOLUME, clxVolMult, clxBodyMult, clxMode,
                                          useMA:maP>0, maType:mType, maP, htfRatio,
                                          useADX:useAdx&&adxT>0, adxThresh:adxT, adxLen:adxL, adxHtfRatio, useAdxSlope, adxSlopeBars,
                                          useRSI:useRsi, rsiOS:rsiPair.os, rsiOB:rsiPair.ob,
                                          useVolF:useVolF&&vfM>0, volFMult:vfM,
                                          useAtrExp:useAtrExp&&atrExpM>0, atrExpMult:atrExpM,
                                          useStruct, structLen, strPvL, strPvR,
                                          useConfirm:useConfirm&&confN>0, confN, confMatType:_confType, confHtfRatio:_confHtf,
                                          useMaDist:useMaDist&&mdMax>0, maDistMax:mdMax,
                                          useCandleF, candleMin, candleMax,
                                          useConsec, consecMax,
                                          useSTrend, sTrendWin,
                                          useFresh:useFresh&&freshMax>0, freshMax,
                                          useVSA:useVSA&&vsaM>0, vsaMult:vsaM, vsaPeriod:vsaP,
                                          useLiq, liqMin,
                                          useVolDir, volDirPeriod:volDirP,
                                          useWT:useWT&&wtT>0, wtThresh:wtT, wtN, wtVolW, wtBodyW, wtUseDist,
                                          useFat, fatConsec, fatVolDrop,
                                          useKalmanMA, kalmanLen, // ##KALMAN_MA##
                                          atrPeriod:atrP, commission:commTotal, baseComm:comm, spreadVal:spread*2
                                        };
                                      results.push({name,pnl:r.pnl,wr:r.wr,n:r.n,dd:r.dd,pdd,avg:r.avg,sig,gt,
                                        p1:r.p1,p2:r.p2,dwr:r.dwr,c1:r.c1,c2:r.c2,nL:r.nL||0,pL:r.pL||0,wrL:r.wrL,nS:r.nS||0,pS:r.pS||0,wrS:r.wrS,dwrLS:r.dwrLS,
                                        cvr:_calcCVR(r.eq),upi:_calcUlcerIdx(r.eq),sortino:_calcSortino(r.eq),kRatio:_calcKRatio(r.eq),sqn:r.sqn??null,
                                        omega:_calcOmega(r.eq),pain:_calcPainRatio(r.eq),
                                        burke:_calcBurke(r.eq),serenity:_calcSerenity(r.eq),ir:_calcInfoRatio(r.eq),cfg:_cfg_ex}); // ##OMG ##PAIN ##BURKE ##SRNTY ##IR
                                      equities[name]=r.eq;
                                      } // end else (не дубль)
                                    } // end if(r passed filter)
                                    // Yield: в prune режиме реже (1000 ит.), в обычном — чаще (300 ит.)
                                    const _yieldEvery = optMode === 'prune' ? 1000 : 300;
                                    if(done%_yieldEvery===0||done===total) {
                                      if(optMode==='mc' && done===300) setMcPhase('⚡ Перебор…');
                                      updateETA(done, total, results.length);
                                      await yieldToUI();
                                      await checkPause();
                                    }
                                    if(stopped) { _mcDone=true; break; }
                                    }}} // _mCrossTyp, _confHtf, _confType
                                  } // timeBars
                                  } // _ip combo
                                } // trDist
                              } // trTrig
                            } // beOff
                            } // beTrig
                          } // tpPair
                        } // slPair
                      } // atrBoM
                    } // vsaM
                  } // wtT
                } // freshMax
              } // mdMax
              } // atrExpM
            } // vfM
          } // rsiPair
          } // adxHtfRatio
        } // adxT
        }} // htfRatio, mType
      } // maP
    } // atrP
  }} // pvL pvR

  // Exhaustive завершён — батч OOS
  if (_useOOS && results.length > 0) {
    setMcPhase(`⏳ OOS проверка ${results.length} результатов…`);
    if (_isSynthMode && typeof _setSynthProgress !== 'undefined') {
      _setSynthProgress(85, '🔍 Проверка результатов на OOS данных (' + results.length + ' стратегий)');
    }
    for (let oi = 0; oi < results.length; oi++) {
      _attachOOS(results[oi].cfg, results[oi].name, results[oi].n);
      if (oi % 50 === 0) { await yieldToUI(); }
    }
  }
  results.sort((a,b)=>b.pdd-a.pdd);
  await _batchCPCV(results, 200);
  if (typeof setMcPhase === 'function') setMcPhase(null);
  _curPage = 0;
  renderResults();
  if(results.length>0) showBestStats();
  updateETA(done, total, results.length);

  // Synthesis mode completion logging
  if (_isSynthMode && typeof _setSynthProgress !== 'undefined') {
    const elapsed = Math.round((Date.now() - _t0) / 1000);
    _setSynthProgress(100, '✅ Синтез завершен! Найдено ' + results.length + ' стратегий за ' + elapsed + 'с');
    if (typeof _hideSynthProgressSection !== 'undefined') {
      _hideSynthProgressSection(); // модал остаётся открытым с логами
    }
  }

  $('prog').textContent='✅ ' + fmtNum(results.length) + ' / ' + fmtNum(done) + ' прошли фильтр';
  // Restore buttons
  $('pbtn').style.display='none';
  $('sbtn').style.display='none';
  $('rbtn').style.display='';
  $('rbtn').disabled=false;
  playDone();
}

// ============================================================
// Кэш TF-сигналов (tfSigL/tfSigS) для _calcIndicators.
// При батч-OOS (1000+ вызовов с одинаковым DATA и параметрами) вычисляется 1 раз.
let _tfSigCache = null; // {key, dataLen, dataFirst, dataLast, tfSigL, tfSigS}

// _calcIndicators / buildBtCfg — восстановлены из истории
// Используются тестами устойчивости (runOnSlice)
// ============================================================
// ============================================================
// _calcIndicators(cfg) — пересчитывает все индикаторные массивы
// из текущего DATA по параметрам cfg.
// Возвращает объект ind, который передаётся в buildBtCfg().
// ============================================================
function _calcIndicators(cfg) {
  const N = DATA.length;
  const closes = DATA.map(r => r.c);

  // ── Pivot Low / High (для входа) ──────────────────────────
  const pvL = cfg.pvL || 5;
  const pvR = cfg.pvR || 2;
  const pvLo = calcPivotLow(pvL, pvR);
  const pvHi = calcPivotHigh(pvL, pvR);

  // ── ATR ───────────────────────────────────────────────────
  const atrP = cfg.atrPeriod || 14;
  const atrArr = calcRMA_ATR(atrP);
  const atrAvg = calcSMA(Array.from(atrArr), 50);

  // ── MA (тренд-фильтр) ─────────────────────────────────────
  const maP  = cfg.maP  || 0;
  const maType = cfg.maType || 'EMA';
  const htfRatio = cfg.htfRatio || 1;
  const maArr = (maP > 0)
    ? (htfRatio > 1 ? calcHTFMA(DATA, htfRatio, maP, maType) : calcMA(closes, maP, maType))
    : null;

  // ── Kalman MA (адаптивная MA) ────────────────────────────────
  // ##KALMAN_MA## — Откат: удалить 2 строки + kalmanArr из return + buildBtCfg + filter_registry.js
  const kalmanLen = cfg.kalmanLen || 20;
  const kalmanArr = cfg.useKalmanMA ? _buildKalmanMA(closes, kalmanLen) : null;

  // ── Confirm MA ────────────────────────────────────────────
  const confN = cfg.confN || 0;
  const confMatType = cfg.confMatType || 'EMA';
  const confHtfRatio = cfg.confHtfRatio || 1;
  const maArrConfirm = (cfg.useConfirm && confN > 0)
    ? (confHtfRatio > 1 ? calcHTFMA(DATA, confHtfRatio, confN, confMatType) : calcMA(closes, confN, confMatType))
    : null;

  // ── ADX ───────────────────────────────────────────────────
  const adxLen = cfg.adxLen || 14;
  const adxHtfRatioInd = cfg.adxHtfRatio || 1;
  const adxArr = cfg.useADX ? (adxHtfRatioInd > 1 ? calcHTFADX(DATA, adxHtfRatioInd, adxLen) : calcADX(adxLen)) : null;

  // ── RSI ───────────────────────────────────────────────────
  const rsiArr = cfg.useRSI ? calcRSI(14) : null;

  // ── Bollinger Bands ───────────────────────────────────────
  let bbB = null, bbD = null;
  if (cfg.useBoll) {
    const bl = cfg.bbLen || 20;
    const bm = cfg.bbMult || 2;
    bbB = calcSMA(closes, bl);
    bbD = new Float64Array(N);
    for (let i = bl - 1; i < N; i++) {
      const mean = bbB[i];
      let s = 0;
      for (let j = i - bl + 1; j <= i; j++) s += (closes[j] - mean) ** 2;
      bbD[i] = Math.sqrt(s / bl) * bm;
    }
  }

  // ── Donchian ──────────────────────────────────────────────
  let donH = null, donL = null;
  if (cfg.useDonch) {
    const dl = cfg.donLen || 20;
    donH = new Float64Array(N); donL = new Float64Array(N);
    for (let i = dl + 2; i < N; i++) {
      let mx = -Infinity, mn = Infinity;
      for (let j = i - dl - 1; j <= i - 2; j++) {
        if (DATA[j].h > mx) mx = DATA[j].h;
        if (DATA[j].l < mn) mn = DATA[j].l;
      }
      donH[i] = mx; donL[i] = mn;
    }
  }

  // ── ATR Breakout ──────────────────────────────────────────
  let atrBoMA = null, atrBoATR2 = null;
  if (cfg.useAtrBo) {
    const al = cfg.atrBoLen || 14;
    atrBoMA   = calcEMA(closes, al);
    atrBoATR2 = calcRMA_ATR(al);
  }

  // ── MA Touch ──────────────────────────────────────────────
  let matMA = null;
  const matZone = cfg.matZone || 0.2;
  if (cfg.useMaTouch) {
    const mp = cfg.matPeriod || 20;
    const mt = cfg.matType   || 'EMA';
    matMA = calcMA(closes, mp, mt);
  }

  // ── Squeeze ───────────────────────────────────────────────
  let sqzOn = null, sqzCount = null;
  if (cfg.useSqueeze) {
    const sbl = cfg.sqzBBLen  || 20;
    const skm = cfg.sqzKCMult || 1.5;
    const bbBasis = calcSMA(closes, sbl);
    const bbDevSqz = new Float64Array(N);
    for (let i = sbl - 1; i < N; i++) {
      let s = 0;
      for (let j = i - sbl + 1; j <= i; j++) s += (closes[j] - bbBasis[i]) ** 2;
      bbDevSqz[i] = Math.sqrt(s / sbl) * 2;
    }
    const kcATR = calcRMA_ATR(sbl);
    const kcMA  = calcEMA(closes, sbl);
    sqzOn = new Uint8Array(N); sqzCount = new Int32Array(N);
    for (let i = sbl; i < N; i++) {
      const bbU = bbBasis[i] + bbDevSqz[i], bbL = bbBasis[i] - bbDevSqz[i];
      const kcU = kcMA[i] + kcATR[i] * skm, kcL = kcMA[i] - kcATR[i] * skm;
      sqzOn[i]    = (bbL > kcL && bbU < kcU) ? 1 : 0;
      sqzCount[i] = sqzOn[i] ? (sqzCount[i-1] || 0) + 1 : 0;
    }
  }

  // ── Volume-based arrays ───────────────────────────────────
  const vsaP     = cfg.vsaPeriod || 20;
  const volAvgArr  = HAS_VOLUME ? calcVolSMA(vsaP) : null;
  const bodyAvgArr = HAS_VOLUME ? calcBodySMA(20)   : null;

  // ── Weighted Trend ────────────────────────────────────────
  let wtScores = null;
  if (cfg.useWT && maArr) {
    const wtN      = cfg.wtN      || 11;
    const wtVolW   = cfg.wtVolW   || 3.5;
    const wtBodyW  = cfg.wtBodyW  || 3.5;
    const wtDistW  = 2.75;
    const wtUseDist = cfg.wtUseDist || false;
    wtScores = calcWeightedTrend(maArr, atrArr, wtN, wtVolW, wtBodyW, wtDistW, wtUseDist);
  }

  // ── Market Structure (HH/HL) ──────────────────────────────
  let structBull = null, structBear = null;
  if (cfg.useStruct) {
    const spvL = cfg.strPvL || 5;
    const spvR = cfg.strPvR || 2;
    structBull = new Uint8Array(N);
    structBear = new Uint8Array(N);
    let pvHiArr = [], pvLoArr = [];
    for (let i = spvL; i < N - spvR; i++) {
      let isH = true, isL = true;
      for (let j = 1; j <= spvL; j++) { if (DATA[i].h <= DATA[i-j].h) { isH = false; break; } }
      if (isH) for (let j = 1; j <= spvR; j++) { if (DATA[i].h <= DATA[i+j].h) { isH = false; break; } }
      for (let j = 1; j <= spvL; j++) { if (DATA[i].l >= DATA[i-j].l) { isL = false; break; } }
      if (isL) for (let j = 1; j <= spvR; j++) { if (DATA[i].l >= DATA[i+j].l) { isL = false; break; } }
      if (isH) pvHiArr.push({ idx: i, v: DATA[i].h });
      if (isL) pvLoArr.push({ idx: i, v: DATA[i].l });
    }
    let hi1=NaN, hi2=NaN, lo1=NaN, lo2=NaN, pHi=0, pLo=0;
    for (let i = spvL + spvR; i < N; i++) {
      while (pHi < pvHiArr.length && pvHiArr[pHi].idx + spvR <= i) { hi2 = hi1; hi1 = pvHiArr[pHi].v; pHi++; }
      while (pLo < pvLoArr.length && pvLoArr[pLo].idx + spvR <= i) { lo2 = lo1; lo1 = pvLoArr[pLo].v; pLo++; }
      if (!isNaN(hi1) && !isNaN(hi2) && !isNaN(lo1) && !isNaN(lo2)) {
        if (hi1 > hi2 && lo1 > lo2) structBull[i] = 1;
        if (hi1 < hi2 && lo1 < lo2) structBear[i] = 1;
      }
    }
  }

  // ── RSI Exit (выход из OB/OS зон) ────────────────────────
  const rsiExitArr = cfg.useRsiExit
    ? calcRSI(cfg.rsiExitPeriod || 14)
    : null;

  // ── MA Crossover (пересечение МА) ────────────────────────
  const maCrossArr = cfg.useMaCross
    ? calcMA(closes, cfg.maCrossP || 20, cfg.maCrossType || 'EMA')
    : null;

  // ── Supertrend ────────────────────────────────────────────
  const stDir = (cfg.useSupertrend || cfg.useStExit)
    ? calcSupertrend(cfg.stAtrP || 10, cfg.stMult || 3.0)
    : null;

  // ── MACD ──────────────────────────────────────────────────
  let macdLine = null, macdSignal = null;
  if (cfg.useMacd || cfg.useMacdFilter) {
    const _macd = calcMACD(cfg.macdFast || 12, cfg.macdSlow || 26, cfg.macdSignalP || 9);
    macdLine   = _macd.line;
    macdSignal = _macd.signal;
  }

  // ── Elder Impulse System ──────────────────────────────────
  let eisEMAArr = null, eisHistArr = null;
  if (cfg.useEIS) {
    const eisP = cfg.eisPeriod || 13;
    eisEMAArr = calcEMA(closes, eisP);
    const _eisMacd = calcMACD(12, 26, 9);
    eisHistArr = new Float64Array(N);
    for (let i = 0; i < N; i++) eisHistArr[i] = _eisMacd.line[i] - _eisMacd.signal[i];
  }

  // ── Efficiency Ratio ──────────────────────────────────────
  let erArr = null;
  if (cfg.useER) {
    const erP = cfg.erPeriod || 10;
    erArr = new Float64Array(N);
    for (let i = erP; i < N; i++) {
      const net = Math.abs(closes[i] - closes[i - erP]);
      let sum = 0;
      for (let j = i - erP + 1; j <= i; j++) sum += Math.abs(closes[j] - closes[j-1]);
      erArr[i] = sum > 0 ? net / sum : 0;
    }
  }

  // ── Stochastic ────────────────────────────────────────────
  let stochD = null;
  if (cfg.useStochExit) {
    stochD = calcStochastic(cfg.stochKP || 14, cfg.stochDP || 3).dArr;
  }

  // ── SL Pivot ──────────────────────────────────────────────
  let pivSLLo = null, pivSLHi = null;
  if (cfg.useSLPiv) {
    const slPivL = cfg.slPivL || 3;
    const slPivR = cfg.slPivR || 1;
    const r = calcPivotLoHi(DATA, slPivL, slPivR);
    pivSLLo = r.lo; pivSLHi = r.hi;
  }

  // ── Trendline Figures (TL touch/break, flag, triangle) ────
  // Вычисляем tfSigL/tfSigS на основе cfg — чтобы buildBtCfg,
  // _runOOS, _hcRunBacktest и drawEquityForResult работали корректно.
  // Кэшируем: при батч-OOS (1000+ вызовов с одним DATA) вычисляем 1 раз.
  let tfSigL = null, tfSigS = null;
  const _useTF = cfg.useTLTouch || cfg.useTLBreak || cfg.useFlag || cfg.useTri;
  if (_useTF) {
    const tlPvL      = Math.max(2, cfg.tlPvL      || 5);
    const tlPvR      = Math.max(1, cfg.tlPvR      || 3);
    const tlZone     = (cfg.tlZonePct || 0.3) / 100;
    const flagImpMin = cfg.flagImpMin || 2.0;
    const flagMaxBars= cfg.flagMaxBars|| 20;
    const flagRetrace= cfg.flagRetrace|| 0.618;
    const _tfKey = `${cfg.useTLTouch}|${cfg.useTLBreak}|${cfg.useFlag}|${cfg.useTri}|${tlPvL}|${tlPvR}|${tlZone}|${flagImpMin}|${flagMaxBars}|${flagRetrace}`;
    const _dLen = DATA.length;
    const _d0c  = DATA[0]?.c;
    const _dNc  = DATA[_dLen - 1]?.c;
    if (_tfSigCache && _tfSigCache.key === _tfKey && _tfSigCache.dataLen === _dLen &&
        _tfSigCache.dataFirst === _d0c && _tfSigCache.dataLast === _dNc) {
      tfSigL = _tfSigCache.tfSigL;
      tfSigS = _tfSigCache.tfSigS;
    } else {
    const atrBase    = calcRMA_ATR(14);
    const tfPvLo     = calcPivotLow(tlPvL, tlPvR);
    const tfPvHi     = calcPivotHigh(tlPvL, tlPvR);

    tfSigL = new Uint8Array(N);
    tfSigS = new Uint8Array(N);

    let sl1b=0,sl1v=0,sl2b=0,sl2v=0;
    let rl1b=0,rl1v=0,rl2b=0,rl2v=0;
    let flagActive=false, flagBull=false;
    let flagStartBar=0, flagImpHi=0, flagImpLo=0;
    const warm = Math.max(tlPvL+tlPvR+2, 20);

    for (let i=warm; i<N; i++) {
      const bar=DATA[i], prev=DATA[i-1];
      if (tfPvLo[i]===1) { sl2b=sl1b; sl2v=sl1v; sl1b=i-tlPvR; sl1v=DATA[i-tlPvR].l; }
      if (tfPvHi[i]===1) { rl2b=rl1b; rl2v=rl1v; rl1b=i-tlPvR; rl1v=DATA[i-tlPvR].h; }
      let supLevel=NaN, resLevel=NaN;
      if (sl1b>0&&sl2b>0&&sl1b!==sl2b) { const slope=(sl1v-sl2v)/(sl1b-sl2b); supLevel=sl1v+slope*(i-sl1b); }
      if (rl1b>0&&rl2b>0&&rl1b!==rl2b) { const slope=(rl1v-rl2v)/(rl1b-rl2b); resLevel=rl1v+slope*(i-rl1b); }
      if (!isNaN(supLevel)&&supLevel>0) {
        const zone=supLevel*tlZone;
        if (cfg.useTLTouch&&DATA[i-1].l<=supLevel+zone&&DATA[i-1].l>=supLevel-zone) tfSigL[i]|=1;
        if (cfg.useTLBreak&&i>=2&&DATA[i-1].c>supLevel+zone&&DATA[i-2].c<=supLevel+zone) tfSigL[i]|=2;
        if (cfg.useTLBreak&&i>=2&&DATA[i-1].c<supLevel-zone&&DATA[i-2].c>=supLevel-zone) tfSigS[i]|=2;
      }
      if (!isNaN(resLevel)&&resLevel>0) {
        const zone=resLevel*tlZone;
        if (cfg.useTLTouch&&DATA[i-1].h>=resLevel-zone&&DATA[i-1].h<=resLevel+zone) tfSigS[i]|=1;
        if (cfg.useTLBreak&&i>=2&&DATA[i-1].c>resLevel+zone&&DATA[i-2].c<=resLevel+zone) tfSigL[i]|=2;
        if (cfg.useTLBreak&&i>=2&&DATA[i-1].c<resLevel-zone&&DATA[i-2].c>=resLevel-zone) tfSigS[i]|=2;
      }
      if (cfg.useFlag) {
        const atr=atrBase[i]||0.001;
        if (!flagActive) {
          const bullImp=(DATA[i-1].h-DATA[i-6>0?i-6:0].l)>atr*flagImpMin&&prev.c>prev.o;
          const bearImp=(DATA[i-6>0?i-6:0].h-DATA[i-1].l)>atr*flagImpMin&&prev.c<prev.o;
          if (bullImp) { flagActive=true; flagBull=true; flagStartBar=i; flagImpHi=prev.h; flagImpLo=DATA[Math.max(i-6,0)].l; }
          else if (bearImp) { flagActive=true; flagBull=false; flagStartBar=i; flagImpHi=DATA[Math.max(i-6,0)].h; flagImpLo=prev.l; }
        }
        if (flagActive) {
          const elapsed=i-flagStartBar;
          const impRange=Math.max(flagImpHi-flagImpLo,0.0000001);
          const retPct=flagBull?(flagImpHi-Math.min(bar.l,prev.l))/impRange:(Math.max(bar.h,prev.h)-flagImpLo)/impRange;
          if (retPct>flagRetrace||elapsed>flagMaxBars) { flagActive=false; }
          else if (elapsed>=2) {
            if (flagBull&&bar.c>flagImpHi*(1-tlZone)) { tfSigL[i]|=4; flagActive=false; }
            else if (!flagBull&&bar.c<flagImpLo*(1+tlZone)) { tfSigS[i]|=4; flagActive=false; }
          }
        }
      }
      if (cfg.useTri&&sl1b>0&&sl2b>0&&rl1b>0&&rl2b>0) {
        const resFalling=rl1v<rl2v, supRising=sl1v>sl2v;
        const symTri=resFalling&&supRising;
        const ascTri=Math.abs(rl1v-rl2v)/Math.max(rl1v,0.0001)<0.005&&supRising;
        const descTri=resFalling&&Math.abs(sl1v-sl2v)/Math.max(sl1v,0.0001)<0.005;
        if ((symTri||ascTri||descTri)&&!isNaN(resLevel)&&!isNaN(supLevel)) {
          const zone2=resLevel*tlZone;
          if (prev.c>resLevel+zone2&&DATA[i-2]&&DATA[i-2].c<=resLevel+zone2) tfSigL[i]|=8;
          if (prev.c<supLevel-supLevel*tlZone&&DATA[i-2]&&DATA[i-2].c>=supLevel-supLevel*tlZone) tfSigS[i]|=8;
        }
      }
    }
    _tfSigCache = {key:_tfKey, dataLen:_dLen, dataFirst:_d0c, dataLast:_dNc, tfSigL, tfSigS};
    } // end else (cache miss)
  }

  return {
    pvLo, pvHi, atrArr, atrAvg,
    maArr, maArrConfirm, adxArr, rsiArr,
    bbB, bbD, donH, donL,
    atrBoMA, atrBoATR2,
    matMA, matZone,
    sqzOn, sqzCount,
    volAvgArr, bodyAvgArr,
    wtScores,
    structBull, structBear,
    pivSLLo, pivSLHi,
    tfSigL, tfSigS,
    rsiExitArr, maCrossArr,
    macdLine, macdSignal,
    stochD,
    stDir,
    eisEMAArr, eisHistArr,
    erArr,
    kalmanArr, // ##KALMAN_MA##
  };
}

// ============================================================
// buildBtCfg(cfg, ind) — собирает объект конфигурации бэктеста
// из сохранённого cfg результата и пересчитанных индикаторов ind.
// ============================================================
function buildBtCfg(cfg, ind) {
  const slPair  = cfg.slPair  || {};
  const tpPair  = cfg.tpPair  || {};
  const slLogic = cfg.slLogic || 'or';
  const tpLogic = cfg.tpLogic || 'or';
  const maP     = cfg.maP     || 0;

  return {
    comm: cfg.commission || 0,

    // ── Входные паттерны ──────────────────────────────────────
    usePivot:   cfg.usePivot   || false,
    pvLo:       ind.pvLo,
    pvHi_:      ind.pvHi,
    useEngulf:  cfg.useEngulf  || false,
    usePinBar:  cfg.usePinBar  || false,
    pinRatio:   cfg.pinRatio   || 2,
    useBoll:    cfg.useBoll    || false,
    bbB:        ind.bbB,
    bbD:        ind.bbD,
    useDonch:   cfg.useDonch   || false,
    donH:       ind.donH,
    donL:       ind.donL,
    useAtrBo:   cfg.useAtrBo   || false,
    atrBoMA:    ind.atrBoMA,
    atrBoATR:   ind.atrBoATR2,
    atrBoMult:  cfg.atrBoMult  || 2,
    useMaTouch: cfg.useMaTouch || false,
    matMA:      ind.matMA,
    matZone:    ind.matZone,
    useSqueeze: cfg.useSqueeze || false,
    sqzOn:      ind.sqzOn,
    sqzCount:   ind.sqzCount,
    sqzMinBars: cfg.sqzMinBars || 1,
    useTLTouch: cfg.useTLTouch || false,
    useTLBreak: cfg.useTLBreak || false,
    useFlag:    cfg.useFlag    || false,
    useTri:     cfg.useTri     || false,
    tfSigL:     ind.tfSigL     || null,
    tfSigS:     ind.tfSigS     || null,

    // ── Новые точки входа ─────────────────────────────────────
    useRsiExit:    cfg.useRsiExit    || false,
    rsiExitArr:    ind.rsiExitArr,
    rsiExitPeriod: cfg.rsiExitPeriod || 14,
    rsiExitOS:     cfg.rsiExitOS     || 30,
    rsiExitOB:     cfg.rsiExitOB     || 70,
    useMaCross:    cfg.useMaCross    || false,
    maCrossArr:    ind.maCrossArr,
    maCrossP:      cfg.maCrossP      || 20,
    maCrossType:   cfg.maCrossType   || 'EMA',
    useFreeEntry:  cfg.useFreeEntry  || false,
    useMacd:       cfg.useMacd       || false,
    macdLine:      ind.macdLine,
    macdSignal:    ind.macdSignal,
    macdFast:      cfg.macdFast      || 12,
    macdSlow:      cfg.macdSlow      || 26,
    macdSignalP:   cfg.macdSignalP   || 9,
    useMacdFilter: cfg.useMacdFilter || false,
    useEIS:        cfg.useEIS        || false,
    eisEMAArr:     ind.eisEMAArr,
    eisHistArr:    ind.eisHistArr,
    eisPeriod:     cfg.eisPeriod     || 13,
    useSoldiers:   cfg.useSoldiers   || false,
    useER:         cfg.useER         || false,
    erArr:         ind.erArr,
    erPeriod:      cfg.erPeriod      || 10,
    erThresh:      cfg.erThresh      || 0.3,
    useStochExit:  cfg.useStochExit  || false,
    stochD:        ind.stochD,
    stochKP:       cfg.stochKP       || 14,
    stochDP:       cfg.stochDP       || 3,
    stochOS:       cfg.stochOS       || 20,
    stochOB:       cfg.stochOB       || 80,
    useVolMove:    cfg.useVolMove     || false,
    volMoveMult:   cfg.volMoveMult    || 1.5,
    useInsideBar:  cfg.useInsideBar  || false,
    useNReversal:  cfg.useNReversal  || false,
    nReversalN:    cfg.nReversalN    || 3,
    useSupertrend: cfg.useSupertrend || false,
    stDir:         ind.stDir,
    stAtrP:        cfg.stAtrP        || 10,
    stMult:        cfg.stMult        || 3.0,
    useStExit:     cfg.useStExit     || false,
    waitBars:      cfg.waitBars      || 0,
    waitRetrace:   cfg.waitRetrace   || false,
    waitMaxBars:   cfg.waitMaxBars   || 0,
    waitCancelAtr: cfg.waitCancelAtr || 0,

    // ── SL / TP ───────────────────────────────────────────────
    hasSLA:    !!(slPair.a),
    slMult:    slPair.a ? slPair.a.m : 0,
    hasSLB:    !!(slPair.p),
    slPctMult: slPair.p ? slPair.p.m : 0,
    slLogic,
    hasTPA:    !!(tpPair.a),
    tpMult:    tpPair.a ? tpPair.a.m   : 0,
    tpMode:    tpPair.a ? tpPair.a.type : 'rr',
    hasTPB:    !!(tpPair.b),
    tpMultB:   tpPair.b ? tpPair.b.m   : 0,
    tpModeB:   tpPair.b ? tpPair.b.type : 'rr',
    tpLogic,

    // ── Exits ─────────────────────────────────────────────────
    useBE:    cfg.useBE    || false,
    beTrig:   cfg.beTrig   || 1,
    beOff:    cfg.beOff    || 0,
    useTrail: cfg.useTrail || false,
    trTrig:   cfg.trTrig   || 1,
    trDist:   cfg.trDist   || 0.5,
    useRev:   cfg.useRev   || false,
    revBars:  cfg.revBars  || 2,
    revMode:  cfg.revMode  || 'any',
    revAct:   cfg.revAct   || 'exit',
    revSrc:   cfg.revSrc   || 'same',
    revSkip:       cfg.revSkip       || 0,
    revCooldown:   cfg.revCooldown   || 0,
    useTime:  cfg.useTime  || false,
    timeBars: cfg.timeBars || 20,
    timeMode: cfg.timeMode || 'any',
    usePartial: cfg.usePartial || false,
    partRR:     cfg.partRR     || 1,
    partPct:    cfg.partPct    || 50,
    partBE:     cfg.partBE     || false,
    useClimax:  cfg.useClimax  || false,
    clxVolMult:  cfg.clxVolMult  || 3,
    clxBodyMult: cfg.clxBodyMult || 1.5,
    clxMode:     cfg.clxMode     || 'any',

    // ── Фильтры ───────────────────────────────────────────────
    useMA:    maP > 0,
    maArr:    ind.maArr,
    maType:   cfg.maType   || 'EMA',
    maP:      maP,
    htfRatio: cfg.htfRatio || 1,
    useADX:   cfg.useADX   || false,
    adxArr:   ind.adxArr,
    adxThresh: cfg.adxThresh || 25,
    adxLen:    cfg.adxLen    || 14,
    adxHtfRatio: cfg.adxHtfRatio || 1,
    useAdxSlope: cfg.useAdxSlope || false,
    adxSlopeBars: cfg.adxSlopeBars || 3,
    useRSI:   cfg.useRSI   || false,
    rsiArr:   ind.rsiArr,
    rsiOS:    cfg.rsiOS    || 30,
    rsiOB:    cfg.rsiOB    || 70,
    useVolF:  cfg.useVolF  || false,
    atrAvg:   ind.atrAvg,
    volFMult: cfg.volFMult || 1.5,
    useAtrExp: cfg.useAtrExp || false,
    atrExpMult: cfg.atrExpMult || 0.8,
    useStruct:  cfg.useStruct  || false,
    structBull: ind.structBull,
    structBear: ind.structBear,
    strPvL:     cfg.strPvL     || 5,
    strPvR:     cfg.strPvR     || 2,
    useSLPiv:   cfg.useSLPiv   || false,
    slPivOff:   cfg.slPivOff   || 0.2,
    slPivMax:   cfg.slPivMax   || 3,
    slPivL:     cfg.slPivL     || 3,
    slPivR:     cfg.slPivR     || 1,
    slPivTrail: cfg.slPivTrail || false,
    pivSLLo:    ind.pivSLLo,
    pivSLHi:    ind.pivSLHi,
    useConfirm:    cfg.useConfirm    || false,
    confN:         cfg.confN         || 2,
    confMatType:   cfg.confMatType   || 'EMA',
    confHtfRatio:  cfg.confHtfRatio  || 1,
    maArrConfirm:  ind.maArrConfirm,
    useMaDist:  cfg.useMaDist  || false,
    maDistMax:  cfg.maDistMax  || 2,
    useCandleF: cfg.useCandleF || false,
    candleMin:  cfg.candleMin  || 0.3,
    candleMax:  cfg.candleMax  || 3,
    useConsec:  cfg.useConsec  || false,
    consecMax:  cfg.consecMax  || 5,
    useSTrend:  cfg.useSTrend  || false,
    sTrendWin:  cfg.sTrendWin  || 10,
    useFresh:   cfg.useFresh   || false,
    freshMax:   cfg.freshMax   || 10,
    useVSA:     cfg.useVSA     || false,
    vsaMult:    cfg.vsaMult    || 1.5,
    volAvg:     ind.volAvgArr,
    useLiq:     cfg.useLiq     || false,
    liqMin:     cfg.liqMin     || 0.5,
    useVolDir:  cfg.useVolDir  || false,
    volDirPeriod: cfg.volDirPeriod || 10,
    useWT:      cfg.useWT      || false,
    wtScores:   ind.wtScores,
    wtThresh:   cfg.wtThresh   || 15,
    useFat:     cfg.useFat     || false,
    fatConsec:  cfg.fatConsec  || 6,
    fatVolDrop: cfg.fatVolDrop || 0.7,
    bodyAvg:    ind.bodyAvgArr,

    useKalmanMA: cfg.useKalmanMA || false, // ##KALMAN_MA##
    kalmanArr:   ind.kalmanArr,
    kalmanLen:   cfg.kalmanLen   || 20,

    start: Math.max(maP || 0, 50) + 2,
    pruning: false,
    maxDDLimit: 300,
  };
}

// ##SECTION_C##
// МАССОВЫЙ ТЕСТ УСТОЙЧИВОСТИ
// ============================================================
let _massRobRunning = false;

async function runMassRobust() {
  if (!DATA) { alert('Нет данных'); return; }
  if (_massRobRunning) {
    _massRobRunning = false;
    $('mass-rob-progress').textContent = '⏹ Остановлено';
    const btn = $('btn-mass-robust');
    if (btn) btn.textContent = '🔬 Тест всех видимых';
    return;
  }


  const tests = [];
  if ($c('mrb_walk'))  tests.push('walk');
  if ($c('mrb_oos'))   tests.push('oos');
  if ($c('mrb_param')) tests.push('param');
  if ($c('mrb_mc'))    tests.push('mc');
  if ($c('mrb_noise')) tests.push('noise');
  if (!tests.length) { alert('Выбери хотя бы один тест'); return; }

  // Снимаем СНАПШОТ результатов ДО начала теста
  // Используем results (полный массив) а не _visibleResults (меняется при applyFilters)
  // Фильтруем только видимые на момент нажатия — по индексам в _visibleResults
  const toTest = _visibleResults.filter(r => r.cfg);
  if (!toTest.length) { alert('Нет результатов с cfg'); return; }

  _massRobRunning = true;
  const btn = $('btn-mass-robust');
  if (btn) btn.textContent = '⏹ Стоп';

  // Инвалидируем кэш: настройки (param_spread, noise_runs и т.д.) могли измениться
  _robCache.clear();
  _robSliceCache.clear();

  for (let i = 0; i < toTest.length; i++) {
    if (!_massRobRunning) break;
    const r = toTest[i];
    $('mass-rob-progress').textContent = `⏳ ${i+1}/${toTest.length}: ${r.name.slice(0,35)}…`;
    if (i % 5 === 0) await yieldToUI();

    _robSliceCache.clear(); // очищаем кэш слайсов между стратегиями
    const { score, details } = await runRobustScoreForDetailed(r, tests);

    r.robScore = score;
    r.robMax   = tests.length;
    r.robDetails = details; // { oos:0..3, walk:0/1, param:0/1, noise:0/1, mc:0/1 }

    // Синхронизируем с favourites и results если это fav/hc режим
    const fIdx = favourites.findIndex(f => f.name === r.name);
    if (fIdx >= 0) {
      favourites[fIdx].stats.robScore = score;
      favourites[fIdx].stats.robMax = tests.length;
      favourites[fIdx].stats.robDetails = details;
    }
    const rIdx = results.findIndex(x => x.name === r.name);
    if (rIdx >= 0) { results[rIdx].robScore = score; results[rIdx].robMax = tests.length; results[rIdx].robDetails = details; }
    const hIdx = _hcTableResults ? _hcTableResults.findIndex(x => x.name === r.name) : -1;
    if (hIdx >= 0) { _hcTableResults[hIdx].robScore = score; _hcTableResults[hIdx].robMax = tests.length; _hcTableResults[hIdx].robDetails = details; }
  }

  _massRobRunning = false;
  if (btn) btn.textContent = '🔬 Тест всех видимых';
  $('mass-rob-progress').textContent = `✅ Готово: ${toTest.length} проверено`;
  renderVisibleResults();
}

// Запускает тесты для одного результата, возвращает число пройденных
async function runRobustScoreFor(r, tests, _fastMode) {
  const cfg = r.cfg;
  // ── ИДЕЯ 2: Проверяем кэш — fastMode и обычный режим хранятся раздельно
  // (разные параметры MC/Noise/порогов — результаты не взаимозаменяемы)
  const _cacheTests = _fastMode ? tests.map(t => t + '_fast') : tests;
  const _cached = _robCacheGet(cfg, _cacheTests);
  if (_cached !== null) return _cached;

  const fullDATA = DATA;
  let passed = 0;

  function runOnSlice(slice) {
    if (!slice || slice.length < 40) return null;
    const origDATA = DATA;
    DATA = slice;
    try {
      if (_robSliceCacheDataHash !== _getDataHash()) { _robSliceCache.clear(); _robSliceCacheDataHash = _getDataHash(); }
      const _sk = _getRobSliceKey(cfg, slice);
      if (_robSliceCache.has(_sk)) { DATA = origDATA; return _robSliceCache.get(_sk); }
      const ind   = _calcIndicators(cfg);
      const btCfg = buildBtCfg(cfg, ind);
      const _res  = backtest(ind.pvLo, ind.pvHi, ind.atrArr, btCfg);
      _robSliceCache.set(_sk, _res);
      return _res;
    } catch(e) { return null; }
    finally { DATA = origDATA; }
  }

  const base = runOnSlice(fullDATA);
  if (!base || base.n < 5) return 0;

  // ── ИДЕЯ 1: Каскадный порядок: OOS (быстрый) → Walk → Param → MC → Noise (медленный)
  // ── ИДЕЯ 4: Ранняя остановка — если оставшихся тестов не хватит для minNeeded
  const _stopCheck = () => !_massRobRunning && !_hcRobRunning;
  const _remaining = (already, total) => total - already;
  // minNeeded: в _fastMode хотим знать достижим ли максимум = tests.length
  // Если passed + remaining < tests.length → дальше нет смысла (для _fastMode)
  const _cascade = _fastMode; // каскад включён только в fastMode (HC rob режим)

  // ── 1. OOS — тест на трёх участках: первые/середина/последние 20%
  // Идея: если слабый только на 1 из 3 — это фаза рынка, а не слабость стратегии
  // Тест пройден если 2+ из 3 участков прибыльны
  if (tests.includes('oos')) {
    const N = fullDATA.length;
    const segLen = Math.floor(N * 0.20);
    const oosSegments = [
      fullDATA.slice(0, segLen),                               // первые 20%
      fullDATA.slice(Math.floor(N*0.40), Math.floor(N*0.60)), // середина 20%
      fullDATA.slice(N - segLen),                              // последние 20%
    ];
    // IS: полная выборка (для retention)
    const pnlFull = base.pnl;
    const pnlPerBar = pnlFull / N;
    let oosPassed = 0;
    const oosRetentions = [];
    for (const seg of oosSegments) {
      const rSeg = runOnSlice(seg);
      if (rSeg && rSeg.n >= 3) {
        const retained = pnlPerBar > 0 ? rSeg.pnl / (pnlPerBar * seg.length) : (rSeg.pnl > 0 ? 1 : 0);
        oosRetentions.push(retained);
        if (rSeg.pnl > 0 && retained >= 0.1) oosPassed++;
      }
    }
    // Пройден: >= 2 из 3 участков прибыльны
    const oosOk = oosPassed >= 2;
    if (oosOk) passed++;
    // Сохраняем детали для UI (опционально)
    if (r._oosDetail !== undefined) {
      r._oosDetail = { oosPassed, oosRetentions };
    }
    if (!oosOk && _cascade) {
      const remaining = tests.filter(t=>t!=='oos').length;
      if (passed + remaining < tests.length) return passed;
    }
  }
  if (_stopCheck()) return passed;

  // ── 2. Walk-Forward (~3 бэктеста)
  if (tests.includes('walk')) {
    const N=fullDATA.length;
    const r1=runOnSlice(fullDATA.slice(0,Math.floor(N*0.33)));
    const r2=runOnSlice(fullDATA.slice(Math.floor(N*0.33),Math.floor(N*0.66)));
    const r3=runOnSlice(fullDATA.slice(Math.floor(N*0.66)));
    const parts=[r1,r2,r3].filter(x=>x&&x.n>=5);
    if(parts.length>=2&&parts.every(x=>x.pnl>0)) passed++;
    else if(_cascade) {
      const remaining = tests.filter(t=>t!=='oos'&&t!=='walk').length;
      if (passed + remaining < tests.length) return passed;
    }
  }
  if (_stopCheck()) return passed;

  // ── 3. Param sensitivity (~4 бэктеста)
  if (tests.includes('param')) {
    const savedSl=cfg.slPair, savedTp=cfg.tpPair;
    const mut=(pair,m)=>{if(!pair)return pair;const np=JSON.parse(JSON.stringify(pair));if(np.a&&np.a.m)np.a.m=+(np.a.m*m).toFixed(2);if(np.p&&np.p.m)np.p.m=+(np.p.m*m).toFixed(2);return np;};
    const variants=[];
    // Разброс читается из UI (по умолчанию 30%)
    const _pSpread = Math.max(5, Math.min(50, parseInt(document.getElementById('param_spread')?.value) || 30)) / 100;
    const _pLo = +(1 - _pSpread).toFixed(2), _pHi = +(1 + _pSpread).toFixed(2);
    for(const sm of[_pLo,_pHi])for(const tm of[_pLo,_pHi]){cfg.slPair=mut(savedSl,sm);cfg.tpPair=mut(savedTp,tm);const rv=runOnSlice(fullDATA);if(rv&&rv.n>=5)variants.push(rv.pnl);}
    cfg.slPair=savedSl; cfg.tpPair=savedTp;
    // Пройден если хотя бы 3 из 4 вариантов прибыльны (не все — допускаем одну неудачу)
    const paramPassed = variants.filter(v=>v>0).length;
    if(variants.length>=3 && paramPassed>=3) passed++;
    else if(_cascade) {
      const remaining = tests.filter(t=>!['oos','walk','param'].includes(t)).length;
      if (passed + remaining < tests.length) return passed;
    }
  }
  if (_stopCheck()) return passed;

  // ── 4. MC (~150/500 перестановок) — до Noise т.к. детерминировано
  if (tests.includes('mc')) {
    const eq=base.eq; const tradePnls=[];
    for(let i=1;i<eq.length;i++){const d=eq[i]-eq[i-1];if(Math.abs(d)>0.001)tradePnls.push(d);}
    if(tradePnls.length>=10){
      const dds=[];
      const _mcN = _fastMode ? 150 : 500;
      for(let s=0;s<_mcN;s++){
        if(s%50===0 && _stopCheck()) break;
        if(s%25===0 && s>0) await yieldToUI();
        const t=[...tradePnls];
        for(let i=t.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[t[i],t[j]]=[t[j],t[i]];}
        let eq2=0,pk=0,dd=0;t.forEach(p=>{eq2+=p;if(eq2>pk)pk=eq2;dd=Math.max(dd,pk-eq2);});
        dds.push(dd);
      }
      dds.sort((a,b)=>a-b);
      if(dds.length>10 && dds[Math.floor(dds.length*0.95)]<Math.abs(base.pnl)) passed++;
      else if(_cascade) {
        const remaining = tests.includes('noise') ? 1 : 0;
        if (passed + remaining < tests.length) return passed;
      }
    }
  }
  if (_stopCheck()) return passed;

  // ── 5. Noise — самый медленный (20/50 бэктестов)
  // ── ИДЕЯ 4: ранняя остановка — если результат уже ясен
  if (tests.includes('noise')) {
    const pnls=[];
    const _noiseN = Math.max(5, Math.min(100, parseInt(document.getElementById('noise_runs')?.value) || (_fastMode ? 10 : 50)));
    const _noiseLevel = (parseFloat(document.getElementById('noise_level')?.value) || (_fastMode ? 0.2 : 0.05)) / 100;
    const _noiseThr = _fastMode ? 0.6 : 0.7;
    for(let s=0;s<_noiseN;s++){
      if(_stopCheck()) break;
      if(s%10===0 && s>0) await yieldToUI();
      const noisy=fullDATA.map(b=>{const f=1+(Math.random()-0.5)*2*_noiseLevel;return{o:b.o*f,h:b.h*f,l:b.l*f,c:b.c*f,v:b.v};});
      const rv=runOnSlice(noisy); if(rv&&rv.n>=5) pnls.push(rv.pnl);
      // ── Ранняя остановка (Идея 4): после ≥5 прогонов проверяем достижимость
      if(_fastMode && pnls.length>=5) {
        const okSoFar = pnls.filter(p=>p>0).length;
        const maxOk = okSoFar + (_noiseN - s - 1); // лучший возможный исход
        const minOk = okSoFar; // худший
        const need = Math.ceil(_noiseThr * _noiseN);
        if(maxOk < need) break; // даже при идеальном раскладе не пройдём
        if(minOk >= need) break; // уже точно прошли — не нужно продолжать
      }
    }
    if(pnls.length>=5&&pnls.filter(p=>p>0).length/pnls.length>=_noiseThr) passed++;
  }
  // ── Сохраняем в кэш (с учётом режима fastMode)
  _robCacheSet(cfg, _cacheTests, passed);
  return passed;
}

// Версия с деталями: возвращает { score, details }
async function runRobustScoreForDetailed(r, tests, _fastMode) {
  const cfg = r.cfg;
  const details = {};

  // ── OOS: проверяем 3 участка напрямую через _hcRunBacktest, возвращаем 0..3
  if (tests.includes('oos')) {
    const N = DATA.length;
    const segLen = Math.floor(N * 0.20);
    const oosSegs = [
      DATA.slice(0, segLen),                               // первые 20%
      DATA.slice(Math.floor(N*0.40), Math.floor(N*0.60)), // середина 20%
      DATA.slice(N - segLen),                              // последние 20%
    ];
    // IS baseline для retention
    const _rFull = _hcRunBacktest(cfg);
    const _pnlPerBarFull = (_rFull && _rFull.pnl && N > 0) ? _rFull.pnl / N : 0;
    let oosCount = 0;
    for (const seg of oosSegs) {
      const orig = DATA;
      DATA = seg;
      try {
        const rSeg = _hcRunBacktest(cfg);
        if (rSeg && rSeg.n >= 3 && rSeg.pnl > 0) {
          // Retention: сравниваем pnl/bar с IS
          const _segRetention = (_pnlPerBarFull > 0)
            ? rSeg.pnl / (_pnlPerBarFull * seg.length)
            : (rSeg.pnl > 0 ? 1 : 0);
          if (_segRetention >= 0.1) oosCount++;
        }
      } finally { DATA = orig; }
    }
    details['oos'] = oosCount; // 0, 1, 2 или 3
  }

  // ── Walk/Param/Noise/MC: запускаем по одному, возвращают 0 или 1
  for (const t of ['walk','param','noise','mc']) {
    if (!tests.includes(t)) continue;
    details[t] = await runRobustScoreFor({ cfg }, [t], _fastMode);
  }

  // ── Итоговый robScore: OOS пройден если >= 2/3, остальные 0/1
  let total = 0;
  if (details.oos !== undefined) total += (details.oos >= 2 ? 1 : 0);
  for (const t of ['walk','param','noise','mc']) {
    if (details[t] !== undefined) total += details[t];
  }
  // Идея 10: обучаем robSurrogate на полном результате
  _robSurrogate.addPoint(r.cfg || r, total);
  return { score: total, details };
}

// ##SECTION_D##
let _hcRunning = false;
let _hcRobRunning = false; // флаг прерывания теста устойчивости внутри HC
let _hcSourceResult = null;

// ── ИДЕЯ 2: Кэш результатов тестов в памяти (сбрасывается при смене DATA)
const _robCache = new Map(); // key → {score, tests, dataHash}
// Per-slice indicator+backtest result cache (shared across multiple rob test calls for same cfg)
// Key: cfgKey + '|' + sliceKey  Value: backtest result
const _robSliceCache = new Map();
let _robSliceCacheDataHash = '';
// ── HC_NUMERIC_PARAMS ────────────────────────────────────────────────
// ЕДИНЫЙ ИСТОЧНИК ИСТИНЫ для всех числовых параметров HC.
// Добавить новый параметр = добавить одну строку сюда.
// _fastCfgKey строится автоматически — не нужно обновлять вручную.
const HC_NUMERIC_PARAMS = [
  // Базовые
  ['pvL',5],['pvR',2],['atrPeriod',14],['maP',0],
  ['adxLen',14],['adxThresh',25],['adxHtfRatio',1],['adxSlopeBars',3],
  ['rsiOS',30],['rsiOB',70],['atrBoMult',2],['atrExpMult',0.8],
  // Выходы
  ['beTrig',1.0],['beOff',0],['trTrig',1.0],['trDist',0.5],['timeBars',20],
  // RevSig
  ['revBars',2],['revSkip',0],['revCooldown',0],
  // Фильтры
  ['confN',2],['sTrendWin',10],['htfRatio',1],['confHtfRatio',1],
  ['volFMult',1.5],['vsaMult',1.8],['wtThresh',15],
  ['freshMax',10],['maDistMax',2],
  // Структурные (не мутируются HC но нужны для уникальности кэша)
  ['bbLen',20],['bbMult',2],['donLen',20],['sqzBBLen',20],['matPeriod',20],
];

function _fastCfgKey(cfg) {
  // Автоматически строится из HC_NUMERIC_PARAMS — при добавлении параметра
  // достаточно добавить его в HC_NUMERIC_PARAMS выше.
  const parts = HC_NUMERIC_PARAMS.map(([k,def]) => cfg[k] ?? def);
  parts.push(
    cfg.slPair ? JSON.stringify(cfg.slPair) : '',
    cfg.tpPair ? JSON.stringify(cfg.tpPair) : '',
    cfg.maType||'EMA', cfg.confMatType||'EMA', cfg.maCrossType||'EMA',
    cfg.useBE?1:0, cfg.useTrail?1:0, cfg.useRev?1:0, cfg.useTime?1:0,
    cfg.commission||0
  );
  return parts.join('|');
}
function _getRobSliceKey(cfg, slice) {
  return _fastCfgKey(cfg) + '||' + slice.length + '_' + (slice[0]?.c||0).toFixed(2) + '_' + (slice[slice.length-1]?.c||0).toFixed(2);
}
let _robCacheDataHash = ''; // хэш текущих данных

function _getRobCacheKey(cfg, tests) {
  return _fastCfgKey(cfg) + '|' + tests.slice().sort().join(',');
}
function _getDataHash() {
  if (!DATA || !DATA.length) return '';
  return DATA.length + '_' + (DATA[0]?.c||0).toFixed(3) + '_' + (DATA[DATA.length-1]?.c||0).toFixed(3);
}
function _robCacheGet(cfg, tests) {
  const hash = _getDataHash();
  if (hash !== _robCacheDataHash) {
    _robCache.clear(); // данные изменились — кэш невалиден
    _robCacheDataHash = hash;
  }
  const key = _getRobCacheKey(cfg, tests);
  return _robCache.has(key) ? _robCache.get(key) : null;
}
function _robCacheSet(cfg, tests, score) {
  _robCache.set(_getRobCacheKey(cfg, tests), score);
  // ── ИДЕЯ 9: localStorage persistence (dataHash в ключе = валидность между сессиями)
  try {
    const storeKey = 'rob_' + _getDataHash() + '|' + _getRobCacheKey(cfg, tests);
    if (storeKey.length < 300) { // не сохраняем слишком длинные ключи
      localStorage.setItem(storeKey, String(score));
      // Лимит: если >2000 записей — очищаем старые
      const keys = Object.keys(localStorage).filter(k => k.startsWith('rob_'));
      if (keys.length > 2000) {
        keys.slice(0, 500).forEach(k => localStorage.removeItem(k));
      }
    }
  } catch(e) {} // localStorage может быть недоступен
}
function _robCacheLoad() {
  // При старте загружаем кэш из localStorage для текущих данных
  try {
    const prefix = 'rob_' + _getDataHash() + '|';
    let loaded = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) {
        const cfgTestsKey = k.slice(prefix.length);
        const score = parseInt(localStorage.getItem(k));
        if (!isNaN(score)) { _robCache.set(cfgTestsKey, score); loaded++; }
      }
    }
    if (loaded > 0) console.log('[RobCache] Loaded ' + loaded + ' entries from localStorage');
  } catch(e) {}
}
