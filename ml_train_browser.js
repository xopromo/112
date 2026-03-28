// ml_train_browser.js — In-browser Gradient Boosted Trees training
// Trains on DATA array (already loaded in optimizer), no dependencies.
// Produces mlScore-compatible model, saves to IndexedDB via _MLModelDB.
// Identical feature engineering to ml/train.py and ml_signal.js.

const _MLT_MAX_SAMPLES = 2000; // cap training set for speed

// ── Dataset builder ────────────────────────────────────────────
// Returns { X: number[][], y: number[], trainN, testN }

function _mltBuildDataset(data, opts) {
    const { nBars, labelBars, commission, pvL, pvR } = opts;
    const n = data.length;
    const startBar = Math.max(0, n - nBars);

    // Wilder ATR (same as ml_signal.js _mlCalcATR)
    const tr  = new Float64Array(n);
    const atr = new Float64Array(n);
    for (let i = 1; i < n; i++) {
        const d = data[i], p = data[i-1];
        tr[i] = Math.max(d.h - d.l, Math.abs(d.h - p.c), Math.abs(d.l - p.c));
    }
    const ATR_P = 14, alpha = 1 / ATR_P;
    let s = 0;
    for (let i = 1; i <= Math.min(ATR_P, n-1); i++) s += tr[i];
    if (n > ATR_P) atr[ATR_P] = s / ATR_P;
    for (let i = ATR_P + 1; i < n; i++) atr[i] = alpha * tr[i] + (1 - alpha) * atr[i-1];

    // Pivot lows → confirmation bars (same logic as ml/train.py find_pivot_lows)
    const lows = data.map(d => d.l);
    const X = [], y = [];

    const iStart = startBar + pvL + pvR;
    for (let i = iStart; i < n - labelBars; i++) {
        const idx = i - pvR;
        if (idx < pvL) continue;
        const v = lows[idx];
        let ok = true;
        for (let j = idx - pvL; j < idx; j++)        { if (lows[j] < v) { ok = false; break; } }
        if (ok) for (let j = idx+1; j <= idx+pvR; j++) { if (j < n && lows[j] <= v) { ok = false; break; } }
        if (!ok) continue;

        // Features (identical to ml_signal.js mlComputeFeatures)
        const barIdx = i;
        if (barIdx < 21) continue;

        const WINDOW = 20, ER_P = 10;
        const logRets = new Float64Array(WINDOW - 1);
        for (let k = 0; k < WINDOW - 1; k++) {
            const bi = barIdx - WINDOW + k;
            const c0 = data[bi].c, c1 = data[bi+1].c;
            logRets[k] = (c0 > 0 && c1 > 0) ? Math.log(c1 / c0) : 0;
        }
        let rSum = 0, rSum2 = 0;
        for (let k = 0; k < 19; k++) { rSum += logRets[k]; rSum2 += logRets[k]*logRets[k]; }
        const mean = rSum / 19;
        const std  = Math.sqrt(rSum2 / 19 - mean * mean) + 1e-8;

        const feat = new Array(21);
        for (let k = 0; k < 19; k++) feat[k] = (logRets[k] - mean) / std;
        feat[19] = data[barIdx-1].c > 0 ? atr[barIdx-1] / data[barIdx-1].c : 0;

        const erEnd = barIdx - 1;
        if (erEnd >= ER_P) {
            const net = Math.abs(data[erEnd].c - data[erEnd - ER_P].c);
            let path = 0;
            for (let j = erEnd - ER_P + 1; j <= erEnd; j++)
                path += Math.abs(data[j].c - data[j-1].c);
            feat[20] = path > 0 ? net / path : 0;
        } else {
            feat[20] = 0;
        }

        // Label: close[+labelBars] > entry × (1 + 2×commission)
        const entry = data[i].c, exit = data[i + labelBars].c;
        y.push(exit > entry * (1 + 2 * commission) ? 1 : 0);
        X.push(feat);
    }

    return { X, y, n: X.length, nPos: y.reduce((a, b) => a + b, 0) };
}

// ── Decision tree helpers ──────────────────────────────────────

function _mltMean(idx, arr) {
    if (!idx.length) return 0;
    let s = 0; for (const i of idx) s += arr[i];
    return s / idx.length;
}

function _mltMSE(idx, arr) {
    if (idx.length < 2) return 0;
    const m = _mltMean(idx, arr);
    let s = 0; for (const i of idx) s += (arr[i] - m) ** 2;
    return s;
}

// Fit one regression tree to residuals
function _mltFitNode(X, idx, residuals, depth, maxDepth, minLeaf, nFeatSubset) {
    const leafVal = _mltMean(idx, residuals);
    if (depth >= maxDepth || idx.length < minLeaf * 2)
        return { v: leafVal };

    // Random feature subset
    const feats = Array.from({length: 21}, (_, i) => i)
        .sort(() => Math.random() - 0.5)
        .slice(0, nFeatSubset);

    let bestF = -1, bestT = 0, bestScore = Infinity;

    for (const f of feats) {
        let minV = Infinity, maxV = -Infinity;
        for (const i of idx) {
            const v = X[i][f];
            if (v < minV) minV = v;
            if (v > maxV) maxV = v;
        }
        if (minV >= maxV) continue;
        const range = maxV - minV;
        // Try 10 evenly spaced thresholds (fast, good enough)
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
        l: _mltFitNode(X, L, residuals, depth+1, maxDepth, minLeaf, nFeatSubset),
        r: _mltFitNode(X, R, residuals, depth+1, maxDepth, minLeaf, nFeatSubset),
    };
}

function _mltPredNode(node, x) {
    if (node.v !== undefined) return node.v;
    return x[node.f] <= node.t ? _mltPredNode(node.l, x) : _mltPredNode(node.r, x);
}

// ── AUC (Mann-Whitney, O(n²) — acceptable for test set ~100-300) ──

function _mltAUC(scores, labels) {
    const pos = scores.filter((_, i) => labels[i] === 1);
    const neg = scores.filter((_, i) => labels[i] === 0);
    if (!pos.length || !neg.length) return 0.5;
    let wins = 0;
    for (const p of pos) for (const n of neg)
        wins += p > n ? 1 : p === n ? 0.5 : 0;
    return wins / (pos.length * neg.length);
}

// ── Main training function ─────────────────────────────────────
// params: { nTrees, maxDepth, lr, subsample, labelBars, commission, nBars, minLeaf, nFeatSubset }
// onProgress(fraction 0..1, treeDone, treeTotal, phase)
// Returns serialized JS code string

async function mlTrainInBrowser(params, onProgress) {
    const {
        nTrees       = 80,
        maxDepth     = 4,
        lr           = 0.1,
        subsample    = 0.8,
        labelBars    = 10,
        commission   = 0.001,
        nBars        = DATA.length,
        minLeaf      = 3,
        nFeatSubset  = 5,
        pvL          = 3,
        pvR          = 4,
    } = params;

    if (onProgress) onProgress(0, 0, nTrees, 'dataset');

    const ds = _mltBuildDataset(DATA, { nBars, labelBars, commission, pvL, pvR });
    if (ds.n < 50) throw new Error(`Слишком мало сигналов: ${ds.n} (нужно ≥50). Загрузите больше данных.`);

    // Walk-forward split: 70% train, 30% test
    const splitAt = Math.floor(ds.n * 0.7);
    let trainIdx = Array.from({length: splitAt}, (_, i) => i);
    const testIdx = Array.from({length: ds.n - splitAt}, (_, i) => splitAt + i);

    // Cap training set for speed
    if (trainIdx.length > _MLT_MAX_SAMPLES) {
        trainIdx = trainIdx.slice(trainIdx.length - _MLT_MAX_SAMPLES);
    }

    const { X, y } = ds;
    const sigmoid = v => 1 / (1 + Math.exp(-Math.max(-50, Math.min(50, v))));

    // Initialize with log-odds of positive class
    const p0 = Math.max(0.01, Math.min(0.99, ds.nPos / ds.n));
    const intercept = Math.log(p0 / (1 - p0));
    const F = new Float64Array(ds.n).fill(intercept);

    const trees = [];

    for (let t = 0; t < nTrees; t++) {
        // Negative gradient of log-loss = y - p
        const residuals = new Float64Array(ds.n);
        for (let i = 0; i < ds.n; i++) residuals[i] = y[i] - sigmoid(F[i]);

        // Row subsampling (from train only)
        const bagN = Math.floor(trainIdx.length * subsample);
        const shuffled = trainIdx.slice().sort(() => Math.random() - 0.5);
        const bagIdx = shuffled.slice(0, bagN);

        const tree = _mltFitNode(X, bagIdx, residuals, 0, maxDepth, minLeaf, nFeatSubset);
        trees.push(tree);

        // Update all predictions
        for (let i = 0; i < ds.n; i++) F[i] += lr * _mltPredNode(tree, X[i]);

        if (onProgress) onProgress((t + 1) / nTrees, t + 1, nTrees, 'training');

        // Yield to UI every 5 trees
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
        auc,
        n:      ds.n,
        nPos:   ds.nPos,
        trainN: trainIdx.length,
        testN:  testIdx.length,
        bars:   DATA.length,
    };
}

// ── Serialize trained model to JS string ──────────────────────
// Output is a self-contained JS snippet exposing mlScore(Float64Array) → [0,1]

function _mltSerialize(trees, intercept, lr, meta) {
    function compact(node) {
        if (node.v !== undefined) return { v: +node.v.toFixed(6) };
        return { f: node.f, t: +node.t.toFixed(6),
                 l: compact(node.l), r: compact(node.r) };
    }
    const data = JSON.stringify({ b: +intercept.toFixed(6), lr, trees: trees.map(compact) });

    return `// AUTO-GENERATED by USE Optimizer (in-browser GBT training)
// Баров: ${meta.bars}  Сигналов: ${meta.n}  Положительных: ${meta.nPos} (${(100*meta.nPos/meta.n).toFixed(1)}%)
// AUC: ${meta.auc.toFixed(4)}  Train/Test: ${meta.trainN}/${meta.testN}
// Признаки: 19×log_ret_norm + atr_norm + er_10 (21 total)
const _mGBT=${data};
function _mPN(nd,x){if(nd.v!==undefined)return nd.v;return x[nd.f]<=nd.t?_mPN(nd.l,x):_mPN(nd.r,x);}
function mlScore(features){
  const x=Array.from(features);let s=_mGBT.b;
  for(const t of _mGBT.trees)s+=_mGBT.lr*_mPN(t,x);
  return 1/(1+Math.exp(-Math.max(-50,Math.min(50,s))));
}`;
}
