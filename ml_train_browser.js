// ml_train_browser.js — In-browser Gradient Boosted Trees training
// Features: delegates to mlComputeFeatures() from ml_signal.js (must be loaded first)
// Label: did price reach entry × (1 + commission) within labelBars? (best-exit)

const _MLT_MAX_TRAIN = 2000; // cap training samples for speed

// ── Dataset builder ────────────────────────────────────────────

function _mltBuildDataset(opts) {
  const { nBars, labelBars, commission, pvL, pvR } = opts;
  const n = DATA.length;
  const startBar = Math.max(pvL + pvR + 52, n - nBars);

  const X = [], y = [];

  for (let i = startBar + pvR; i < n - labelBars; i++) {
    const idx = i - pvR;
    if (idx < pvL) continue;

    // Pivot low check at idx
    const v = DATA[idx].l;
    let ok = true;
    for (let j = idx - pvL; j < idx; j++)       { if (DATA[j].l < v) { ok = false; break; } }
    if (ok) for (let j = idx + 1; j <= idx + pvR; j++) { if (j < n && DATA[j].l <= v) { ok = false; break; } }
    if (!ok) continue;

    const feat = mlComputeFeatures(i);
    if (!feat) continue;

    // Label: did price gain >= targetPct within labelBars bars WITHOUT first hitting stopPct?
    // targetPct and stopPct are passed in opts (configurable in UI)
    const entry = DATA[i].c;
    const targetPrice = entry * (1 + opts.targetPct);
    const stopPrice   = entry * (1 - opts.stopPct);
    let hit = false;
    for (let k = 1; k <= labelBars && i + k < n; k++) {
      const c = DATA[i + k].c;
      if (c <= stopPrice) { break; }        // stopped out → label=0
      if (c >= targetPrice) { hit = true; break; }
    }

    X.push(Array.from(feat));
    y.push(hit ? 1 : 0);
  }

  return { X, y, n: X.length, nPos: y.reduce((a, b) => a + b, 0) };
}

// ── Decision tree ──────────────────────────────────────────────

function _mltMean(idx, arr) {
  if (!idx.length) return 0;
  let s = 0; for (const i of idx) s += arr[i]; return s / idx.length;
}

function _mltMSE(idx, arr) {
  if (idx.length < 2) return 0;
  const m = _mltMean(idx, arr);
  let s = 0; for (const i of idx) s += (arr[i] - m) ** 2; return s;
}

function _mltFitNode(X, idx, residuals, depth, maxDepth, minLeaf, nFeatSub) {
  const leafVal = _mltMean(idx, residuals);
  if (depth >= maxDepth || idx.length < minLeaf * 2) return { v: leafVal };

  // Random feature subset
  const allF = Array.from({ length: ML_FEAT_N }, (_, i) => i).sort(() => Math.random() - 0.5);
  const feats = allF.slice(0, nFeatSub);

  let bestF = -1, bestT = 0, bestScore = Infinity;

  for (const f of feats) {
    let minV = Infinity, maxV = -Infinity;
    for (const i of idx) { const v = X[i][f]; if (v < minV) minV = v; if (v > maxV) maxV = v; }
    if (minV >= maxV) continue;
    const range = maxV - minV;
    for (let t = 1; t <= 10; t++) {
      const thresh = minV + range * t / 11;
      const L = [], R = [];
      for (const i of idx) (X[i][f] <= thresh ? L : R).push(i);
      if (L.length < minLeaf || R.length < minLeaf) continue;
      const score = _mltMSE(L, residuals) + _mltMSE(R, residuals);
      if (score < bestScore) { bestScore = score; bestF = f; bestT = thresh; }
    }
  }

  if (bestF < 0) return { v: leafVal };

  const L = idx.filter(i => X[i][bestF] <= bestT);
  const R = idx.filter(i => X[i][bestF] > bestT);
  return {
    f: bestF, t: bestT,
    l: _mltFitNode(X, L, residuals, depth + 1, maxDepth, minLeaf, nFeatSub),
    r: _mltFitNode(X, R, residuals, depth + 1, maxDepth, minLeaf, nFeatSub),
  };
}

function _mltPredNode(node, x) {
  if (node.v !== undefined) return node.v;
  return x[node.f] <= node.t ? _mltPredNode(node.l, x) : _mltPredNode(node.r, x);
}

// ── AUC (Mann-Whitney) ─────────────────────────────────────────

function _mltAUC(scores, labels) {
  const pos = scores.filter((_, i) => labels[i] === 1);
  const neg = scores.filter((_, i) => labels[i] === 0);
  if (!pos.length || !neg.length) return 0.5;
  let wins = 0;
  for (const p of pos) for (const q of neg) wins += p > q ? 1 : p === q ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

// ── Main training function ─────────────────────────────────────

async function mlTrainInBrowser(params, onProgress) {
  const {
    nTrees      = 100,
    maxDepth    = 5,
    lr          = 0.08,
    subsample   = 0.8,
    labelBars   = 20,
    targetPct   = 0.01,   // цена должна вырасти на 1% → TP
    stopPct     = 0.005,  // цена упала на 0.5% → SL (label=0)
    nBars       = DATA.length,
    minLeaf     = 3,
    nFeatSub    = 6,
    pvL         = ML_PVL,
    pvR         = ML_PVR,
  } = params;

  if (onProgress) onProgress(0, 0, nTrees, 'dataset');
  await new Promise(r => setTimeout(r, 0));

  const ds = _mltBuildDataset({ nBars, labelBars, targetPct, stopPct, pvL, pvR });
  if (ds.n < 50)
    throw new Error(`Слишком мало сигналов: ${ds.n}. Нужно ≥50. Загрузите больше данных.`);

  // Walk-forward split: train on first 70%, test on last 30%
  const splitAt = Math.floor(ds.n * 0.7);
  let trainIdx = Array.from({ length: splitAt }, (_, i) => i);
  const testIdx = Array.from({ length: ds.n - splitAt }, (_, i) => splitAt + i);

  // Cap training set for speed
  if (trainIdx.length > _MLT_MAX_TRAIN)
    trainIdx = trainIdx.slice(trainIdx.length - _MLT_MAX_TRAIN);

  const { X, y } = ds;
  const sigmoid = v => 1 / (1 + Math.exp(-Math.max(-50, Math.min(50, v))));

  const p0 = Math.max(0.01, Math.min(0.99, ds.nPos / ds.n));
  const intercept = Math.log(p0 / (1 - p0));
  const F = new Float64Array(ds.n).fill(intercept);

  const trees = [];

  for (let t = 0; t < nTrees; t++) {
    // Negative gradient of log-loss = y - sigmoid(F)
    const residuals = new Float64Array(ds.n);
    for (let i = 0; i < ds.n; i++) residuals[i] = y[i] - sigmoid(F[i]);

    // Row subsampling from train only
    const bagN = Math.floor(trainIdx.length * subsample);
    const bag = trainIdx.slice().sort(() => Math.random() - 0.5).slice(0, bagN);

    const tree = _mltFitNode(X, bag, residuals, 0, maxDepth, minLeaf, nFeatSub);
    trees.push(tree);

    for (let i = 0; i < ds.n; i++) F[i] += lr * _mltPredNode(tree, X[i]);

    if (onProgress) onProgress((t + 1) / nTrees, t + 1, nTrees, 'training');
    if ((t + 1) % 5 === 0) await new Promise(r => setTimeout(r, 0));
  }

  // AUC on test set
  const testScores = testIdx.map(i => sigmoid(F[i]));
  const testLabels = testIdx.map(i => y[i]);
  const auc = _mltAUC(testScores, testLabels);

  if (onProgress) onProgress(1, nTrees, nTrees, 'done');

  return {
    code: _mltSerialize(trees, intercept, lr, {
      auc, n: ds.n, nPos: ds.nPos,
      trainN: trainIdx.length, testN: testIdx.length,
      bars: DATA.length,
    }),
    auc, n: ds.n, nPos: ds.nPos,
    trainN: trainIdx.length, testN: testIdx.length,
    bars: DATA.length,
  };
}

// ── Serialize model to standalone JS string ────────────────────

function _mltSerialize(trees, intercept, lr, meta) {
  function compact(node) {
    if (node.v !== undefined) return { v: +node.v.toFixed(6) };
    return { f: node.f, t: +node.t.toFixed(6), l: compact(node.l), r: compact(node.r) };
  }
  const data = JSON.stringify({
    b: +intercept.toFixed(6), lr, feat: ML_FEAT_N,
    trees: trees.map(compact),
  });

  return `// AUTO-GENERATED by USE Optimizer (in-browser GBT)
// Баров: ${meta.bars}  Сигналов: ${meta.n}  Положит: ${meta.nPos} (${(100*meta.nPos/meta.n).toFixed(1)}%)
// AUC: ${meta.auc.toFixed(4)}  Train: ${meta.trainN}  Test: ${meta.testN}
// Признаков: ${ML_FEAT_N} (19×logret + atr + er + vol×2 + rsi + ema20 + ema50 + wick + body + atr_regime + streak + range_pos + slope + bb_width)
const _mGBT=${data};
function _mPN(nd,x){if(nd.v!==undefined)return nd.v;return x[nd.f]<=nd.t?_mPN(nd.l,x):_mPN(nd.r,x);}
function mlScore(features){
  if(_mGBT.feat&&features.length!==_mGBT.feat)return 0.5;
  const x=Array.from(features);let s=_mGBT.b;
  for(const t of _mGBT.trees)s+=_mGBT.lr*_mPN(t,x);
  return 1/(1+Math.exp(-Math.max(-50,Math.min(50,s))));
}`;
}

// ── Dataset builder for pivot-HIGH (tops / short signals) ─────────────────
// Labeling: 3 methods, combinable via AND/OR
// Method 1 (pct):    price fell >= fallPct within labelBars
// Method 2 (atr):    price fell >= fallAtr × ATR within labelBars
// Method 3 (struct): next pivot-low < previous pivot-low (structural break)

function _mltBuildDatasetHigh(opts) {
  const {
    nBars, labelBars, pvL, pvR,
    useMethodPct    = true,  fallPct    = 0.02,  // 2% fall
    useMethodAtr    = false, fallAtr    = 2.0,   // 2 ATR fall
    useMethodStruct = false,
    combineMode     = 'or',                      // 'and' | 'or'
  } = opts;

  if (!useMethodPct && !useMethodAtr && !useMethodStruct)
    throw new Error('Выберите хотя бы один метод разметки');

  const n = DATA.length;
  const startBar = Math.max(pvL + pvR + 52, n - nBars);
  _mlEnsureCache();
  const { atr } = _mlCache;

  const X = [], y = [];

  for (let i = startBar + pvR; i < n - labelBars; i++) {
    const idx = i - pvR;
    if (idx < pvL) continue;

    // Pivot HIGH at idx
    const v = DATA[idx].h;
    let ok = true;
    for (let j = idx - pvL; j < idx; j++)        { if (DATA[j].h > v)  { ok = false; break; } }
    if (ok) for (let j = idx + 1; j <= idx + pvR; j++) { if (j < n && DATA[j].h >= v) { ok = false; break; } }
    if (!ok) continue;

    const feat = mlComputeFeaturesHigh(i);
    if (!feat) continue;

    const entry = DATA[i].c;
    const a0    = atr[i - 1] || 0;
    const methodLabels = [];

    // Method 1: % fall
    if (useMethodPct) {
      const target = entry * (1 - fallPct);
      let hit = false;
      for (let k = 1; k <= labelBars && i + k < n; k++) {
        if (DATA[i + k].c <= target) { hit = true; break; }
      }
      methodLabels.push(hit ? 1 : 0);
    }

    // Method 2: ATR fall
    if (useMethodAtr) {
      const target = a0 > 0 ? entry - fallAtr * a0 : entry * (1 - 0.02);
      let hit = false;
      for (let k = 1; k <= labelBars && i + k < n; k++) {
        if (DATA[i + k].c <= target) { hit = true; break; }
      }
      methodLabels.push(hit ? 1 : 0);
    }

    // Method 3: structural break (next pivot-low < previous pivot-low)
    if (useMethodStruct) {
      let prevPivLo = null;
      for (let pi = idx - pvL - pvR - 1; pi >= Math.max(0, idx - 60); pi--) {
        const vl = DATA[pi].l;
        let isLow = true;
        for (let j = pi - pvL; j < pi;      j++) { if (j < 0 || DATA[j].l < vl) { isLow = false; break; } }
        if (isLow) for (let j = pi + 1; j <= pi + pvR && j < n; j++) { if (DATA[j].l <= vl) { isLow = false; break; } }
        if (isLow) { prevPivLo = vl; break; }
      }
      let nextPivLo = null;
      const end = Math.min(n - pvR - 1, i + labelBars);
      for (let ni = i + pvR; ni < end; ni++) {
        const vl = DATA[ni].l;
        let isLow = true;
        for (let j = ni - pvL; j < ni;      j++) { if (j < 0 || DATA[j].l < vl) { isLow = false; break; } }
        if (isLow) for (let j = ni + 1; j <= ni + pvR && j < n; j++) { if (DATA[j].l <= vl) { isLow = false; break; } }
        if (isLow) { nextPivLo = vl; break; }
      }
      methodLabels.push((prevPivLo !== null && nextPivLo !== null && nextPivLo < prevPivLo) ? 1 : 0);
    }

    const label = combineMode === 'and'
      ? (methodLabels.every(l => l === 1) ? 1 : 0)
      : (methodLabels.some(l  => l === 1) ? 1 : 0);

    X.push(Array.from(feat));
    y.push(label);
  }

  return { X, y, n: X.length, nPos: y.reduce((a, b) => a + b, 0) };
}

// ── Serialize model for HIGHS → mlScoreHigh() ─────────────────
function _mltSerializeHigh(trees, intercept, lr, meta) {
  function compact(node) {
    if (node.v !== undefined) return { v: +node.v.toFixed(6) };
    return { f: node.f, t: +node.t.toFixed(6), l: compact(node.l), r: compact(node.r) };
  }
  const data = JSON.stringify({
    b: +intercept.toFixed(6), lr, feat: ML_FEAT_N,
    trees: trees.map(compact),
  });

  return `// AUTO-GENERATED by USE Optimizer — TOPS model (pivot-highs / short signals)
// Баров: ${meta.bars}  Сигналов: ${meta.n}  Положит(вершина): ${meta.nPos} (${(100*meta.nPos/meta.n).toFixed(1)}%)
// AUC: ${meta.auc.toFixed(4)}  Train: ${meta.trainN}  Test: ${meta.testN}
// Методы разметки: ${meta.methods}  Комбинация: ${meta.combineMode}
const _mGBTH=${data};
function _mPNH(nd,x){if(nd.v!==undefined)return nd.v;return x[nd.f]<=nd.t?_mPNH(nd.l,x):_mPNH(nd.r,x);}
function mlScoreHigh(features){
  if(_mGBTH.feat&&features.length!==_mGBTH.feat)return 0.5;
  const x=Array.from(features);let s=_mGBTH.b;
  for(const t of _mGBTH.trees)s+=_mGBTH.lr*_mPNH(t,x);
  return 1/(1+Math.exp(-Math.max(-50,Math.min(50,s))));
}`;
}

// ── Main training function for HIGHS ──────────────────────────
async function mlTrainHighInBrowser(params, onProgress) {
  const {
    nTrees      = 100,
    maxDepth    = 5,
    lr          = 0.08,
    subsample   = 0.8,
    labelBars   = 20,
    nBars       = DATA.length,
    minLeaf     = 3,
    nFeatSub    = 6,
    pvL         = ML_PVL,
    pvR         = ML_PVR,
    useMethodPct    = true,  fallPct    = 0.02,
    useMethodAtr    = false, fallAtr    = 2.0,
    useMethodStruct = false,
    combineMode     = 'or',
  } = params;

  if (onProgress) onProgress(0, 0, nTrees, 'dataset');
  await new Promise(r => setTimeout(r, 0));

  const ds = _mltBuildDatasetHigh({
    nBars, labelBars, pvL, pvR,
    useMethodPct, fallPct, useMethodAtr, fallAtr, useMethodStruct, combineMode,
  });
  if (ds.n < 50)
    throw new Error(`Слишком мало вершин: ${ds.n}. Нужно ≥50. Загрузите больше данных.`);

  const splitAt = Math.floor(ds.n * 0.7);
  let trainIdx = Array.from({ length: splitAt }, (_, i) => i);
  const testIdx = Array.from({ length: ds.n - splitAt }, (_, i) => splitAt + i);
  if (trainIdx.length > _MLT_MAX_TRAIN)
    trainIdx = trainIdx.slice(trainIdx.length - _MLT_MAX_TRAIN);

  const { X, y } = ds;
  const sigmoid = v => 1 / (1 + Math.exp(-Math.max(-50, Math.min(50, v))));
  const p0 = Math.max(0.01, Math.min(0.99, ds.nPos / ds.n));
  const intercept = Math.log(p0 / (1 - p0));
  const F = new Float64Array(ds.n).fill(intercept);
  const trees = [];

  for (let t = 0; t < nTrees; t++) {
    const residuals = new Float64Array(ds.n);
    for (let i = 0; i < ds.n; i++) residuals[i] = y[i] - sigmoid(F[i]);
    const bagN = Math.floor(trainIdx.length * subsample);
    const bag = trainIdx.slice().sort(() => Math.random() - 0.5).slice(0, bagN);
    const tree = _mltFitNode(X, bag, residuals, 0, maxDepth, minLeaf, nFeatSub);
    trees.push(tree);
    for (let i = 0; i < ds.n; i++) F[i] += lr * _mltPredNode(tree, X[i]);
    if (onProgress) onProgress((t + 1) / nTrees, t + 1, nTrees, 'training');
    if ((t + 1) % 5 === 0) await new Promise(r => setTimeout(r, 0));
  }

  const testScores = testIdx.map(i => sigmoid(F[i]));
  const testLabels = testIdx.map(i => y[i]);
  const auc = _mltAUC(testScores, testLabels);
  if (onProgress) onProgress(1, nTrees, nTrees, 'done');

  const methods = [
    useMethodPct    && `%падение${(fallPct*100).toFixed(1)}%`,
    useMethodAtr    && `ATR×${fallAtr}`,
    useMethodStruct && 'структ.разрыв',
  ].filter(Boolean).join('+');

  return {
    code: _mltSerializeHigh(trees, intercept, lr, {
      auc, n: ds.n, nPos: ds.nPos,
      trainN: trainIdx.length, testN: testIdx.length,
      bars: DATA.length, methods, combineMode,
    }),
    auc, n: ds.n, nPos: ds.nPos,
    trainN: trainIdx.length, testN: testIdx.length,
    bars: DATA.length,
  };
}
