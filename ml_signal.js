// ml_signal.js — ML-скоринг сигналов в браузере
// Признаки вычисляются идентично ml/train.py
// Требует: model_generated.js (сгенерирован python3 ml/train.py)

// ── Параметры (должны совпадать с train.py) ───────────────────
const ML_WINDOW    = 20;    // баров истории для признаков
const ML_ATR_P     = 14;    // период ATR
const ML_ER_P      = 10;    // период Efficiency Ratio
const ML_PVL       = 3;     // pivot left (для сканирования)
const ML_PVR       = 4;     // pivot right

// ── Кэш вычислений ────────────────────────────────────────────
let _mlAtrCache   = null;   // Float64Array ATR по всем барам DATA
let _mlDataLen    = 0;      // длина DATA при последнем кэше

// ─────────────────────────────────────────────────────────────
// Проверка: загружена ли модель
// ─────────────────────────────────────────────────────────────
function mlModelLoaded() {
    return typeof mlScore === 'function';
}

// ─────────────────────────────────────────────────────────────
// ATR (Wilder's RMA) — идентично calcRMA_ATR в core.js
// ─────────────────────────────────────────────────────────────
function _mlCalcATR() {
    const n = DATA.length;
    if (_mlAtrCache && _mlDataLen === n) return _mlAtrCache;
    const tr  = new Float64Array(n);
    const rma = new Float64Array(n);
    for (let i = 1; i < n; i++) {
        const d = DATA[i], p = DATA[i-1];
        tr[i] = Math.max(d.h - d.l, Math.abs(d.h - p.c), Math.abs(d.l - p.c));
    }
    let s = 0;
    const p = ML_ATR_P;
    for (let i = 1; i <= Math.min(p, n-1); i++) s += tr[i];
    if (n > p) rma[p] = s / p;
    const alpha = 1 / p;
    for (let i = p + 1; i < n; i++) rma[i] = alpha * tr[i] + (1 - alpha) * rma[i-1];
    _mlAtrCache = rma;
    _mlDataLen  = n;
    return rma;
}

// ─────────────────────────────────────────────────────────────
// Efficiency Ratio — идентично erArr в opt.js
// ─────────────────────────────────────────────────────────────
function _mlER(endIdx) {
    if (endIdx < ML_ER_P) return 0;
    const closes = DATA;
    const net = Math.abs(closes[endIdx].c - closes[endIdx - ML_ER_P].c);
    let path = 0;
    for (let j = endIdx - ML_ER_P + 1; j <= endIdx; j++)
        path += Math.abs(closes[j].c - closes[j-1].c);
    return path > 0 ? net / path : 0;
}

// ─────────────────────────────────────────────────────────────
// Вычислить вектор признаков для бара barIdx
// Возвращает Float64Array(21) или null если недостаточно данных
// ─────────────────────────────────────────────────────────────
function mlComputeFeatures(barIdx) {
    if (!DATA || barIdx < ML_WINDOW + 1 || barIdx >= DATA.length) return null;

    const atrArr = _mlCalcATR();

    // 19 нормализованных лог-возвратов (баров barIdx-19..barIdx-1)
    const logRets = new Float64Array(ML_WINDOW - 1);
    for (let k = 0; k < ML_WINDOW - 1; k++) {
        const i = barIdx - ML_WINDOW + k;
        const c0 = DATA[i].c, c1 = DATA[i+1].c;
        logRets[k] = (c0 > 0 && c1 > 0) ? Math.log(c1 / c0) : 0;
    }
    let sum = 0, sum2 = 0;
    for (let k = 0; k < logRets.length; k++) { sum += logRets[k]; sum2 += logRets[k]*logRets[k]; }
    const mean = sum / logRets.length;
    const std  = Math.sqrt(sum2 / logRets.length - mean * mean) + 1e-8;
    for (let k = 0; k < logRets.length; k++) logRets[k] = (logRets[k] - mean) / std;

    // ATR norm
    const prevClose = DATA[barIdx - 1].c;
    const atrNorm   = prevClose > 0 ? atrArr[barIdx - 1] / prevClose : 0;

    // Efficiency Ratio (10 баров до barIdx включительно, т.е. endIdx=barIdx-1)
    const er = _mlER(barIdx - 1);

    // Собираем вектор [19 × ret_norm, atrNorm, er]
    const feat = new Float64Array(21);
    for (let k = 0; k < 19; k++) feat[k] = logRets[k];
    feat[19] = atrNorm;
    feat[20] = er;
    return feat;
}

// ─────────────────────────────────────────────────────────────
// Скоринг одного бара: 0..1 (вероятность прибыльного входа)
// ─────────────────────────────────────────────────────────────
function mlScoreBar(barIdx) {
    if (!mlModelLoaded()) return null;
    const feat = mlComputeFeatures(barIdx);
    if (!feat) return null;
    return mlScore(feat);   // из model_generated.js
}

// ─────────────────────────────────────────────────────────────
// Сканирование pivot-low сигналов за последние nBars баров
// Возвращает [{bar, time, close, score}, ...] по убыванию score
// ─────────────────────────────────────────────────────────────
function mlScanSignals(nBars) {
    if (!mlModelLoaded() || !DATA || DATA.length < ML_WINDOW + ML_PVL + ML_PVR + 10) return [];
    const n     = DATA.length;
    const start = Math.max(ML_WINDOW + ML_PVL + ML_PVR, n - nBars);
    const lows  = DATA.map(d => d.l);
    const results = [];

    for (let i = start; i < n - 1; i++) {
        // Confirmation bar для pivot на idx = i - ML_PVR
        const idx = i - ML_PVR;
        if (idx < ML_PVL) continue;
        const v = lows[idx];
        let ok = true;
        for (let j = idx - ML_PVL; j < idx; j++)   { if (lows[j] < v) { ok = false; break; } }
        if (ok) for (let j = idx+1; j <= idx+ML_PVR; j++) { if (j < n && lows[j] <= v) { ok = false; break; } }
        if (!ok) continue;

        const score = mlScoreBar(i);
        if (score === null) continue;
        results.push({ bar: i, time: DATA[i].t, close: DATA[i].c, score });
    }

    results.sort((a, b) => b.score - a.score);
    return results;
}

// ─────────────────────────────────────────────────────────────
// Сброс кэша (вызывать при смене данных)
// ─────────────────────────────────────────────────────────────
function mlResetCache() {
    _mlAtrCache = null;
    _mlDataLen  = 0;
}
