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
    // Какие параметры варьировать (пользователь выбирает)
    this.varyEntries = options.varyEntries !== false;      // варьировать entry methods
    this.varyFilters = options.varyFilters !== false;      // варьировать filters
    this.varyFilterParams = options.varyFilterParams !== false; // варьировать param каждого фильтра
    this.varyExits = options.varyExits !== false;          // варьировать exits
    this.varySLTP = options.varySLTP !== false;            // варьировать SL/TP
    this.varyRisk = options.varyRisk !== false;            // варьировать risk params (ATR period и т.д.)

    // Constraints (ограничения)
    this.minTrades = options.minTrades || 10;
    this.maxDD = options.maxDD !== undefined ? options.maxDD : 100; // %
    this.minWR = options.minWR || 0;
    this.minSig = options.minSig || 0; // % significance

    // Инициализация bounds и encoding
    this.entries = this._initEntries();
    this.filters = this._initFilters();
    this.exits = this._initExits();
    this.sltp = this._initSLTP();
    this.risk = this._initRisk();

    // Кэш для быстрого encode/decode
    this._boundsCache = null;
    this._encodingSchema = null;
  }

  // ── ENTRY METHODS ──────────────────────────────────────────
  _initEntries() {
    return {
      // Категориальный параметр: какой entry метод выбран
      method: {
        type: 'categorical',
        options: [
          'pivot',      // 0 — Pivot Low/High
          'engulf',     // 1 — Engulfing
          'pinbar',     // 2 — Pin Bar
          'boll',       // 3 — Bollinger Squeeze
          'donch',      // 4 — Donchian
          'atrbo',      // 5 — ATR Breakout
          'matouch',    // 6 — MA Touch
          'squeeze',    // 7 — Squeeze
          'tl',         // 8 — Trendline
          'macross',    // 9 — MA Cross
          'free',       // 10 — Free entry (no pattern)
        ],
        idx: 0,
      },
      // Параметры для Pivot
      pvL: { type: 'int', min: 2, max: 10, default: 5 },
      pvR: { type: 'int', min: 1, max: 5, default: 2 },

      // Параметры для Pin Bar
      pinRatio: { type: 'float', min: 1.0, max: 3.0, default: 2.0 },

      // Параметры для ATR Breakout
      atrBoMult: { type: 'float', min: 1.0, max: 3.0, default: 2.0 },

      // Параметры для Squeeze
      sqzMinBars: { type: 'int', min: 1, max: 10, default: 1 },

      // Параметры для MA Cross
      maCrossP: { type: 'int', min: 5, max: 200, default: 20 },
      maCrossType: { type: 'categorical', options: ['EMA', 'SMA'], idx: 0 },

      // Параметры для Supertrend
      stAtrP: { type: 'int', min: 5, max: 20, default: 10 },
      stMult: { type: 'float', min: 1.0, max: 5.0, default: 3.0 },

      // RSI Exit parameters
      rsiExitPeriod: { type: 'int', min: 5, max: 50, default: 14 },
      rsiExitOS: { type: 'int', min: 10, max: 40, default: 30 },
      rsiExitOB: { type: 'int', min: 60, max: 90, default: 70 },

      // MACD parameters
      macdFast: { type: 'int', min: 5, max: 20, default: 12 },
      macdSlow: { type: 'int', min: 15, max: 50, default: 26 },
      macdSignalP: { type: 'int', min: 5, max: 15, default: 9 },

      // Other ER, Stoch, EIS параметры (добавлю если нужно)
    };
  }

  // ── FILTERS ──────────────────────────────────────────────
  _initFilters() {
    // Powerset: каждый фильтр может быть включён/исключён
    const filterList = [
      'ma', 'adx', 'rsi', 'volf', 'atrexp', 'struct',
      'madist', 'candlef', 'consec', 'strend', 'fresh',
      'vsa', 'liq', 'voldir', 'wt', 'fat', 'slpiv', 'confirm'
    ];

    return {
      enabled: filterList.map(f => false), // которые фильтры включены
      filterList,

      // MA параметры
      maP: { type: 'int', min: 5, max: 200, default: 20 },
      maType: { type: 'categorical', options: ['EMA', 'SMA', 'WMA'], idx: 0 },
      htfRatio: { type: 'int', min: 1, max: 5, default: 1 },

      // ADX параметры
      adxThresh: { type: 'float', min: 10, max: 40, default: 25 },
      adxLen: { type: 'int', min: 10, max: 30, default: 14 },
      adxHtfRatio: { type: 'int', min: 1, max: 3, default: 1 },
      useAdxSlope: { type: 'bool', default: false },
      adxSlopeBars: { type: 'int', min: 1, max: 10, default: 3 },

      // RSI параметры
      rsiOS: { type: 'int', min: 10, max: 40, default: 30 },
      rsiOB: { type: 'int', min: 60, max: 90, default: 70 },

      // Volume Filter параметры
      volFMult: { type: 'float', min: 1.0, max: 3.0, default: 1.5 },

      // ATR Expanding параметры
      atrExpMult: { type: 'float', min: 0.5, max: 2.0, default: 0.8 },

      // Structure параметры
      strPvL: { type: 'int', min: 2, max: 10, default: 5 },
      strPvR: { type: 'int', min: 1, max: 5, default: 2 },

      // MA Distance параметры
      maDistMax: { type: 'float', min: 0.5, max: 5.0, default: 2.0 },

      // Candle Filter параметры
      candleMin: { type: 'float', min: 0.1, max: 1.0, default: 0.3 },
      candleMax: { type: 'float', min: 1.0, max: 5.0, default: 3.0 },

      // Consecutive bars параметры
      consecMax: { type: 'int', min: 2, max: 20, default: 5 },

      // S Trend параметры
      sTrendWin: { type: 'int', min: 2, max: 20, default: 10 },

      // Fresh параметры
      freshMax: { type: 'int', min: 2, max: 50, default: 10 },

      // VSA параметры
      vsaMult: { type: 'float', min: 1.0, max: 3.0, default: 1.5 },

      // Liquidity параметры
      liqMin: { type: 'float', min: 0.1, max: 2.0, default: 0.5 },

      // VolDir параметры
      volDirPeriod: { type: 'int', min: 5, max: 30, default: 10 },

      // WT параметры
      wtThresh: { type: 'int', min: 5, max: 50, default: 15 },

      // FAT параметры
      fatConsec: { type: 'int', min: 3, max: 15, default: 6 },
      fatVolDrop: { type: 'float', min: 0.3, max: 0.9, default: 0.7 },

      // SL Pivot параметры
      slPivL: { type: 'int', min: 1, max: 10, default: 3 },
      slPivR: { type: 'int', min: 1, max: 5, default: 1 },
      slPivOff: { type: 'float', min: 0.1, max: 1.0, default: 0.2 },
      slPivMax: { type: 'float', min: 1.0, max: 5.0, default: 3.0 },
      slPivTrail: { type: 'bool', default: false },

      // Confirm параметры
      confN: { type: 'int', min: 2, max: 200, default: 20 },
      confMatType: { type: 'categorical', options: ['EMA', 'SMA'], idx: 0 },
      confHtfRatio: { type: 'int', min: 1, max: 3, default: 1 },
    };
  }

  // ── EXITS ──────────────────────────────────────────────────
  _initExits() {
    return {
      // Break Even
      useBE: { type: 'bool', default: false },
      beTrig: { type: 'float', min: 0.5, max: 3.0, default: 1.0 },
      beOff: { type: 'float', min: -1.0, max: 1.0, default: 0.0 },

      // Trailing Stop
      useTrail: { type: 'bool', default: false },
      trTrig: { type: 'float', min: 0.5, max: 3.0, default: 1.5 },
      trDist: { type: 'float', min: 0.3, max: 2.0, default: 1.0 },

      // Reverse Signal
      useRev: { type: 'bool', default: false },
      revBars: { type: 'int', min: 1, max: 20, default: 2 },
      revMode: { type: 'categorical', options: ['any', 'pattern', 'both'], idx: 0 },
      revSkip: { type: 'int', min: 0, max: 10, default: 0 },
      revCooldown: { type: 'int', min: 0, max: 50, default: 0 },

      // Time Exit
      useTime: { type: 'bool', default: false },
      timeBars: { type: 'int', min: 5, max: 500, default: 50 },
      timeMode: { type: 'categorical', options: ['any', 'long', 'short'], idx: 0 },

      // Partial TP
      usePartial: { type: 'bool', default: false },
      partPct: { type: 'int', min: 10, max: 90, default: 50 },
      partRR: { type: 'float', min: 0.5, max: 3.0, default: 1.0 },
      partBE: { type: 'bool', default: false },

      // Climax Exit
      useClimax: { type: 'bool', default: false },
      clxVolMult: { type: 'float', min: 1.5, max: 5.0, default: 3.0 },
      clxBodyMult: { type: 'float', min: 1.0, max: 3.0, default: 1.5 },
      clxMode: { type: 'categorical', options: ['any', 'long', 'short'], idx: 0 },

      // Supertrend Exit
      useStExit: { type: 'bool', default: false },

      // Wait
      waitBars: { type: 'int', min: 0, max: 50, default: 0 },
      waitRetrace: { type: 'bool', default: false },
      waitMaxBars: { type: 'int', min: 0, max: 100, default: 0 },
    };
  }

  // ── SL/TP ──────────────────────────────────────────────────
  _initSLTP() {
    return {
      // SL тип
      slType: { type: 'categorical', options: ['none', 'atr', 'pct'], idx: 0 },
      slMult: { type: 'float', min: 0.5, max: 3.0, default: 1.0 }, // для ATR
      slPct: { type: 'float', min: 0.5, max: 5.0, default: 2.0 },  // для pct
      slLogic: { type: 'categorical', options: ['or', 'and'], idx: 0 },

      // TP тип
      tpType: { type: 'categorical', options: ['none', 'rr', 'atr', 'pct'], idx: 0 },
      tpMult: { type: 'float', min: 0.5, max: 3.0, default: 1.0 }, // для RR или ATR
      tpPct: { type: 'float', min: 0.5, max: 10.0, default: 3.0 }, // для pct
      tpLogic: { type: 'categorical', options: ['or', 'and'], idx: 0 },
    };
  }

  // ── RISK PARAMETERS ────────────────────────────────────────
  _initRisk() {
    return {
      // ATR period
      atrP: { type: 'int', min: 5, max: 50, default: 14 },

      // Commission
      commission: { type: 'float', min: 0.0, max: 0.01, default: 0.0005 },
    };
  }

  // ────────────────────────────────────────────────────────────
  // ENCODING / DECODING
  // ────────────────────────────────────────────────────────────

  /**
   * Encode cfg object to numerical vector for TPE
   */
  encode(cfg) {
    const v = [];

    if (this.varyEntries) {
      // Entry method (categorical)
      const methodIdx = this.entries.method.options.indexOf(cfg._entryMethod || 'pivot');
      v.push(methodIdx / this.entries.method.options.length);

      // Entry parameters
      if (cfg.usePivot || cfg._entryMethod === 'pivot') {
        v.push((cfg.pvL || 5) / 10); // normalize [2..10]
        v.push((cfg.pvR || 2) / 5);
      } else {
        v.push(0.5, 0.5); // default values
      }

      // Other entry params — simplified (добавлю если нужно)
    }

    if (this.varyFilters) {
      // Filter selection (powerset) — как binary flags
      const filterMask = this._encodeFilterMask(cfg);
      filterMask.forEach(bit => v.push(bit ? 1.0 : 0.0));

      // Filter parameters
      v.push((cfg.maP || 0) / 200);
      v.push((cfg.adxThresh || 25) / 40);
      v.push((cfg.rsiOS || 30) / 40);
      v.push((cfg.rsiOB || 70) / 90);
      // ... остальные параметры фильтров
    }

    if (this.varyExits) {
      v.push(cfg.useBE ? 1.0 : 0.0);
      v.push((cfg.beTrig || 1) / 3);
      v.push(cfg.useTrail ? 1.0 : 0.0);
      v.push((cfg.trDist || 0.5) / 2);
      v.push(cfg.useRev ? 1.0 : 0.0);
      v.push((cfg.revBars || 2) / 20);
    }

    if (this.varySLTP) {
      // SL/TP encoding будет добавлен
    }

    if (this.varyRisk) {
      v.push((cfg.atrP || 14) / 50);
    }

    return v;
  }

  /**
   * Decode numerical vector back to cfg object
   */
  decode(vector) {
    const cfg = {
      commission: this.risk.commission.default,
      _sourceVector: vector,
    };

    let idx = 0;

    if (this.varyEntries) {
      // Entry method
      const methodIdx = Math.floor(vector[idx++] * this.entries.method.options.length);
      cfg._entryMethod = this.entries.method.options[Math.min(methodIdx, this.entries.method.options.length - 1)];

      // Decode entry based on method
      switch (cfg._entryMethod) {
        case 'pivot':
          cfg.usePivot = true;
          cfg.pvL = Math.round(2 + vector[idx++] * 8);
          cfg.pvR = Math.round(1 + vector[idx++] * 4);
          break;
        case 'pinbar':
          cfg.usePinBar = true;
          cfg.pinRatio = 1.0 + vector[idx++] * 2;
          idx++; // skip pvR
          break;
        // ... остальные entry methods
        default:
          cfg.usePivot = true;
          cfg.pvL = 5;
          cfg.pvR = 2;
          idx += 2;
      }
    }

    if (this.varyFilters) {
      // Filter selection
      const filterMask = this._decodeFilterMask(vector.slice(idx, idx + this.filters.filterList.length));
      idx += this.filters.filterList.length;

      this.filters.filterList.forEach((f, i) => {
        cfg['use' + this._filterNameToFlag(f)] = filterMask[i];
      });

      // Filter parameters
      cfg.maP = Math.round(vector[idx++] * 200);
      cfg.adxThresh = Math.round(vector[idx++] * 40);
      cfg.rsiOS = Math.round(vector[idx++] * 40);
      cfg.rsiOB = Math.round(vector[idx++] * 90);
    }

    if (this.varyExits) {
      cfg.useBE = vector[idx++] > 0.5;
      cfg.beTrig = 0.5 + vector[idx++] * 2.5;
      cfg.useTrail = vector[idx++] > 0.5;
      cfg.trDist = 0.3 + vector[idx++] * 1.7;
      cfg.useRev = vector[idx++] > 0.5;
      cfg.revBars = Math.round(1 + vector[idx++] * 19);
    }

    if (this.varyRisk) {
      cfg.atrP = Math.round(5 + vector[idx++] * 45);
    }

    return cfg;
  }

  _encodeFilterMask(cfg) {
    return this.filters.filterList.map(f => {
      const flag = 'use' + this._filterNameToFlag(f);
      return cfg[flag] || false;
    });
  }

  _decodeFilterMask(vectorPart) {
    return vectorPart.map(v => v > 0.5);
  }

  _filterNameToFlag(filterName) {
    const map = {
      'ma': 'MA',
      'adx': 'ADX',
      'rsi': 'RSI',
      'volf': 'VolF',
      'atrexp': 'AtrExp',
      'struct': 'Struct',
      'madist': 'MaDist',
      'candlef': 'CandleF',
      'consec': 'Consec',
      'strend': 'STrend',
      'fresh': 'Fresh',
      'vsa': 'VSA',
      'liq': 'Liq',
      'voldir': 'VolDir',
      'wt': 'WT',
      'fat': 'Fat',
      'slpiv': 'SLPiv',
      'confirm': 'Confirm',
    };
    return map[filterName] || filterName;
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
    this.gamma = options.gamma || 0.25; // exploration vs exploitation (0-1)

    this.history = [];      // [{vector, metrics: {gt, sortino, sig%, pnl, dd, wr}}, ...]
    this.iterations = 0;
  }

  /**
   * Get next batch of configurations to evaluate
   */
  getNextBatch(size = 100) {
    const batch = [];

    if (this.iterations < 500) {
      // Phase 1: Exploration (LHS sampling)
      batch.push(...this._latinHypercubeSample(size));
    } else {
      // Phase 2: Exploitation (TPE-based)
      batch.push(...this._tpeSample(size));
    }

    return batch.map(v => this.space.decode(v));
  }

  /**
   * Add observation (evaluation result)
   */
  addObservation(cfg, metrics) {
    const vector = this.space.encode(cfg);
    this.history.push({ vector, metrics, cfg });
    this.iterations++;
  }

  /**
   * Latin Hypercube Sampling — равномерное распределение в пространстве
   */
  _latinHypercubeSample(n) {
    const samples = [];
    const d = this._vectorDim();

    for (let i = 0; i < n; i++) {
      const sample = new Array(d);
      for (let j = 0; j < d; j++) {
        const segment = Math.random(); // [0, 1)
        const position = (i + segment) / n;
        sample[j] = position;
      }
      samples.push(sample);
    }

    // Shuffle columns для decorrelation
    for (let j = 0; j < d; j++) {
      for (let i = 0; i < n - 1; i++) {
        const k = i + Math.floor(Math.random() * (n - i));
        [samples[i][j], samples[k][j]] = [samples[k][j], samples[i][j]];
      }
    }

    return samples;
  }

  /**
   * TPE Sampling — направленный поиск на основе истории
   */
  _tpeSample(n) {
    if (this.history.length === 0) return this._latinHypercubeSample(n);

    const samples = [];
    const d = this._vectorDim();

    // Найти best и worst по взвешенной метрике
    const scored = this.history.map((h, i) => ({
      idx: i,
      score: this._computeScore(h.metrics),
      metrics: h.metrics,
    }));
    scored.sort((a, b) => b.score - a.score);

    // Разделить на good (top gamma%) и bad
    const splitIdx = Math.max(1, Math.ceil(this.history.length * this.gamma));
    const goodHist = scored.slice(0, splitIdx).map(s => this.history[s.idx]);
    const badHist = scored.slice(splitIdx).map(s => this.history[s.idx]);

    // Для каждого dimension: построить Parzen estimators
    // Simplified: генерировать новые точки как mixture of gaussians
    for (let i = 0; i < n; i++) {
      const sample = new Array(d);

      for (let j = 0; j < d; j++) {
        if (goodHist.length > 0 && Math.random() < 0.8) {
          // Sample from good distribution
          const goodVals = goodHist.map(h => h.vector[j]);
          const mean = goodVals.reduce((a, b) => a + b) / goodVals.length;
          const std = Math.sqrt(goodVals.reduce((a, b) => a + (b - mean) ** 2) / goodVals.length + 0.01);
          sample[j] = Math.max(0, Math.min(1, this._gaussianRandom(mean, std)));
        } else {
          // Sample uniform
          sample[j] = Math.random();
        }
      }

      samples.push(sample);
    }

    return samples;
  }

  /**
   * Compute weighted score for metrics
   */
  _computeScore(metrics) {
    // Нормализовать метрики к [0, 1]
    const gtNorm = Math.min(metrics.gt || 0, 10) / 10;
    const sortinoNorm = Math.min(metrics.sortino || 0, 5) / 5;
    const sigNorm = (metrics.sig || 0) / 100;

    // Weighted sum
    return gtNorm * 0.5 + sortinoNorm * 0.3 + sigNorm * 0.2;
  }

  /**
   * Gaussian random with Box-Muller
   */
  _gaussianRandom(mean = 0, std = 1) {
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + std * z;
  }

  _vectorDim() {
    // Примерный размер вектора (зависит от опций)
    let dim = 0;
    if (this.space.varyEntries) dim += 15;      // entry method + params
    if (this.space.varyFilters) dim += 25;      // filter selection + params
    if (this.space.varyExits) dim += 10;        // exit params
    if (this.space.varySLTP) dim += 8;          // SL/TP params
    if (this.space.varyRisk) dim += 2;          // risk params
    return Math.max(dim, 10);
  }

  /**
   * Get Pareto frontier (недоминируемые стратегии)
   */
  getParetoFront() {
    if (this.history.length === 0) return [];

    // Simple Pareto filtering: для каждого результата проверить есть ли better результат по всем метрикам
    const pareto = [];

    for (let i = 0; i < this.history.length; i++) {
      const cand = this.history[i];
      let dominated = false;

      for (let j = 0; j < this.history.length; j++) {
        if (i === j) continue;
        const other = this.history[j];

        // Проверить доминирует ли other над cand
        const candScore = this._computeScore(cand.metrics);
        const otherScore = this._computeScore(other.metrics);

        if (otherScore > candScore) {
          // Check if dominate по всем метрикам
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

// ============================================================
// SYNTHESIS ENGINE — главная функция
// ============================================================

/**
 * Initialize and run strategy synthesis
 */
async function initStrategyEvolution(options = {}) {
  const space = new StrategySpace(options);
  const tpe = new TPEOptimizer(space, {
    maxIter: options.maxIter || 50000,
    batchSize: options.batchSize || 100,
    gamma: options.gamma || 0.25,
  });

  return { space, tpe };
}

/**
 * Evaluate single strategy cfg and return metrics
 * (будет вызываться из opt.js для каждого cfg в цикле)
 */
async function evaluateStrategy(cfg, DATA, indicators) {
  // Расчитать backtест
  // Расчитать все метрики
  // Вернуть {gt, sortino, sig%, pnl, dd, wr, n}
  // (реализуется в opt.js через buildBtCfg + backtest)

  // Placeholder
  return {
    gt: Math.random() * 10,
    sortino: Math.random() * 5,
    sig: Math.random() * 100,
    pnl: Math.random() * 100 - 50,
    dd: Math.random() * 50,
    wr: 50 + Math.random() * 50,
    n: 50 + Math.random() * 200,
  };
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { StrategySpace, TPEOptimizer, initStrategyEvolution, evaluateStrategy };
}
