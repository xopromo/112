// ============================================================
// synthesis.js — STRATEGY SYNTHESIS ENGINE
// ============================================================
// Обратный инжинириг для генерации оптимальных стратегий
// через TPE-based search максимизируя GT-Score, Sortino, Sig%
// ============================================================

// ============================================================
// STRATEGY SPACE — Кодирование/декодирование конфигов
// ============================================================

class StrategySpace {
  constructor(options = {}) {
    this.varyEntries = options.varyEntries !== false;
    this.varyFilters = options.varyFilters !== false;
    this.varyFilterParams = options.varyFilterParams !== false;
    this.varyExits = options.varyExits !== false;
    this.varySLTP = options.varySLTP !== false;
    this.varyRisk = options.varyRisk !== false;

    this.minTrades = options.minTrades || 10;
    this.maxDD = options.maxDD !== undefined ? options.maxDD : 100;
    this.minWR = options.minWR || 0;
    this.minSig = options.minSig || 0;
  }

  encode(cfg) {
    const v = [];
    if (this.varyEntries) {
      v.push(cfg.usePivot ? 1 : 0);
      v.push((cfg.pvL || 5) / 10);
      v.push((cfg.pvR || 2) / 5);
    }
    if (this.varyFilters) {
      v.push(cfg.useMA ? 1 : 0);
      v.push(cfg.useADX ? 1 : 0);
      v.push(cfg.useRSI ? 1 : 0);
      v.push((cfg.maP || 20) / 200);
      v.push((cfg.adxThresh || 25) / 40);
    }
    if (this.varyExits) {
      v.push(cfg.useBE ? 1 : 0);
      v.push(cfg.useTrail ? 1 : 0);
      v.push(cfg.useRev ? 1 : 0);
    }
    if (this.varyRisk) {
      v.push((cfg.atrP || 14) / 50);
    }
    return v;
  }

  decode(vector) {
    const cfg = {};
    let idx = 0;

    if (this.varyEntries) {
      cfg.usePivot = vector[idx++] > 0.5;
      cfg.pvL = Math.round(2 + vector[idx++] * 8);
      cfg.pvR = Math.round(1 + vector[idx++] * 4);
    }

    if (this.varyFilters) {
      cfg.useMA = vector[idx++] > 0.5;
      cfg.useADX = vector[idx++] > 0.5;
      cfg.useRSI = vector[idx++] > 0.5;
      cfg.maP = Math.round(vector[idx++] * 200);
      cfg.adxThresh = Math.round(vector[idx++] * 40);
    }

    if (this.varyExits) {
      cfg.useBE = vector[idx++] > 0.5;
      cfg.useTrail = vector[idx++] > 0.5;
      cfg.useRev = vector[idx++] > 0.5;
    }

    if (this.varyRisk) {
      cfg.atrP = Math.round(5 + vector[idx++] * 45);
    }

    return cfg;
  }
}

// ============================================================
// TPE ALGORITHM (Tree-structured Parzen Estimator)
// ============================================================

class TPEOptimizer {
  constructor(space, options = {}) {
    this.space = space;
    this.maxIter = options.maxIter || 50000;
    this.batchSize = options.batchSize || 100;
    this.gamma = options.gamma || 0.25;
    this.history = [];
    this.iterations = 0;
  }

  getNextBatch(size = 100) {
    const batch = [];

    if (this.iterations < 500) {
      batch.push(...this._latinHypercubeSample(size));
    } else {
      batch.push(...this._tpeSample(size));
    }

    return batch.map(v => this.space.decode(v));
  }

  addObservation(cfg, metrics) {
    const vector = this.space.encode(cfg);
    this.history.push({ vector, metrics, cfg });
    this.iterations++;
  }

  _latinHypercubeSample(n) {
    const samples = [];
    const d = 15; // dimension

    for (let i = 0; i < n; i++) {
      const sample = new Array(d);
      for (let j = 0; j < d; j++) {
        const segment = Math.random();
        const position = (i + segment) / n;
        sample[j] = position;
      }
      samples.push(sample);
    }

    for (let j = 0; j < d; j++) {
      for (let i = 0; i < n - 1; i++) {
        const k = i + Math.floor(Math.random() * (n - i));
        [samples[i][j], samples[k][j]] = [samples[k][j], samples[i][j]];
      }
    }

    return samples;
  }

  _tpeSample(n) {
    if (this.history.length === 0) return this._latinHypercubeSample(n);

    const samples = [];
    const d = 15;

    const scored = this.history.map((h, i) => ({
      idx: i,
      score: this._computeScore(h.metrics),
      metrics: h.metrics,
    }));
    scored.sort((a, b) => b.score - a.score);

    const splitIdx = Math.max(1, Math.ceil(this.history.length * this.gamma));
    const goodHist = scored.slice(0, splitIdx).map(s => this.history[s.idx]);

    for (let i = 0; i < n; i++) {
      const sample = new Array(d);

      for (let j = 0; j < d; j++) {
        if (goodHist.length > 0 && Math.random() < 0.8) {
          const goodVals = goodHist.map(h => h.vector[j]);
          const mean = goodVals.reduce((a, b) => a + b) / goodVals.length;
          const std = Math.sqrt(goodVals.reduce((a, b) => a + (b - mean) ** 2) / goodVals.length + 0.01);
          sample[j] = Math.max(0, Math.min(1, this._gaussianRandom(mean, std)));
        } else {
          sample[j] = Math.random();
        }
      }

      samples.push(sample);
    }

    return samples;
  }

  _computeScore(metrics) {
    const gtNorm = Math.min((metrics.gt || 0) / 10, 1);
    const sortinoNorm = Math.min((metrics.sortino || 0) / 5, 1);
    const sigNorm = Math.min((metrics.sig || 0) / 100, 1);
    return gtNorm * 0.5 + sortinoNorm * 0.3 + sigNorm * 0.2;
  }

  _gaussianRandom(mean = 0, std = 1) {
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + std * z;
  }

  getParetoFront() {
    if (this.history.length === 0) return [];

    const pareto = [];

    for (let i = 0; i < this.history.length; i++) {
      const cand = this.history[i];
      let dominated = false;

      for (let j = 0; j < this.history.length; j++) {
        if (i === j) continue;
        const other = this.history[j];

        const candScore = this._computeScore(cand.metrics);
        const otherScore = this._computeScore(other.metrics);

        if (otherScore > candScore) {
          const c = cand.metrics;
          const o = other.metrics;
          if ((o.gt || 0) >= (c.gt || 0) &&
              (o.sortino || 0) >= (c.sortino || 0) &&
              (o.sig || 0) >= (c.sig || 0)) {
            dominated = true;
            break;
          }
        }
      }

      if (!dominated) {
        pareto.push({
          ...cand,
          score: this._computeScore(cand.metrics),
        });
      }
    }

    return pareto.sort((a, b) => b.score - a.score);
  }
}
