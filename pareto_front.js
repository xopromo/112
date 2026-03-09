// ============================================================
// pareto_front.js — MULTI-OBJECTIVE OPTIMIZATION
// ============================================================
// Управление Pareto frontier (недоминируемыми стратегиями)
// для многоцелевой оптимизации по GT-Score, Sortino, Sig%
// ============================================================

class ParetoFront {
  constructor(options = {}) {
    this.front = [];  // [{result, metrics, score}, ...]
    this.archived = []; // все когда-либо найденные результаты

    // Веса для weighted ranking
    this.weights = {
      gt: options.weights?.gt || 0.5,
      sortino: options.weights?.sortino || 0.3,
      sig: options.weights?.sig || 0.2,
    };

    this.minTrades = options.minTrades || 10;
    this.maxDD = options.maxDD !== undefined ? options.maxDD : 100;
    this.minWR = options.minWR || 0;
    this.minSig = options.minSig || 0;
  }

  /**
   * Add result to Pareto front if not dominated
   * Returns true if added, false if dominated
   */
  addResult(result) {
    // Проверить constraints
    if (!this._satisfiesConstraints(result)) {
      this.archived.push(result);
      return false;
    }

    // Добавить в archived
    this.archived.push(result);

    // Проверить доминирует ли уже существующий результат
    for (let i = 0; i < this.front.length; i++) {
      const existing = this.front[i];
      if (this._dominates(existing, result)) {
        return false; // dominated
      }
    }

    // Удалить результаты которые доминирует result
    this.front = this.front.filter(existing => !this._dominates(result, existing));

    // Добавить result
    const score = this._computeWeightedScore(result);
    this.front.push({
      result,
      metrics: {
        gt: result.gt || 0,
        sortino: result.sortino || 0,
        sig: result.sig || 0,
        pnl: result.pnl || 0,
        dd: result.dd || 0,
        wr: result.wr || 0,
        n: result.n || 0,
      },
      score,
    });

    return true;
  }

  /**
   * Get top N results by specific metric
   */
  getTopByMetric(metric, n = 100) {
    const sorted = [...this.front].sort((a, b) => {
      const aVal = a.metrics[metric] || 0;
      const bVal = b.metrics[metric] || 0;

      // Некоторые метрики нужно минимизировать (dd, sig% в смысле "ниже лучше" — нет, Sig% больше лучше)
      // GT, Sortino, Sig% — максимизировать
      // DD — минимизировать
      if (metric === 'dd') return aVal - bVal;
      return bVal - aVal;
    });

    return sorted.slice(0, n);
  }

  /**
   * Get results ranked by weighted metric combination
   */
  getRankedByWeights(weights = null, n = 100) {
    const w = weights || this.weights;

    const scored = this.front.map(item => ({
      ...item,
      weightedScore: this._computeScore(item.metrics, w),
    }));

    scored.sort((a, b) => b.weightedScore - a.weightedScore);
    return scored.slice(0, n);
  }

  /**
   * Get Pareto frontier as list of results
   */
  getFrontier(n = null) {
    const sorted = [...this.front].sort((a, b) => b.score - a.score);
    return n ? sorted.slice(0, n) : sorted;
  }

  /**
   * Get crowding distance for each result (diversity metric)
   * Higher crowding distance = more isolated in objective space
   */
  calculateCrowdingDistance() {
    if (this.front.length === 0) return [];

    const results = this.front.map((item, idx) => ({
      idx,
      item,
      distance: 0,
    }));

    // Normalize objectives
    const objectives = ['gt', 'sortino', 'sig'];
    const minMax = {};

    objectives.forEach(obj => {
      const vals = this.front.map(item => item.metrics[obj] || 0);
      minMax[obj] = {
        min: Math.min(...vals),
        max: Math.max(...vals),
      };
    });

    // Calculate crowding distance
    objectives.forEach(obj => {
      const sorted = results.sort((a, b) => a.item.metrics[obj] - b.item.metrics[obj]);

      sorted[0].distance = Infinity;
      sorted[sorted.length - 1].distance = Infinity;

      const range = minMax[obj].max - minMax[obj].min;
      if (range === 0) return;

      for (let i = 1; i < sorted.length - 1; i++) {
        const dist = (sorted[i + 1].item.metrics[obj] - sorted[i - 1].item.metrics[obj]) / range;
        sorted[i].distance += dist;
      }
    });

    return results.sort((a, b) => a.idx - b.idx).map(r => r.distance);
  }

  /**
   * Select diverse solutions from Pareto front
   */
  selectDiverse(n = 100) {
    const distances = this.calculateCrowdingDistance();

    const indexed = this.front.map((item, idx) => ({
      idx,
      item,
      distance: distances[idx],
    }));

    indexed.sort((a, b) => b.distance - a.distance);
    return indexed.slice(0, n).sort((a, b) => a.idx - b.idx).map(r => r.item);
  }

  /**
   * Export for saving
   */
  export() {
    return {
      front: this.front.map(item => ({
        metrics: item.metrics,
        score: item.score,
        result: item.result,
      })),
      archived: this.archived,
      weights: this.weights,
    };
  }

  /**
   * Import from saved state
   */
  import(data) {
    this.front = data.front || [];
    this.archived = data.archived || [];
    this.weights = data.weights || this.weights;
  }

  // ────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ────────────────────────────────────────────────────────────

  /**
   * Check if a dominates b
   * a dominates b if: a >= b in all objectives and a > b in at least one
   */
  _dominates(a, b) {
    const aMet = a.metrics || a.result?.metrics || a;
    const bMet = b.metrics || b.result?.metrics || b;

    const aGt = aMet.gt || 0;
    const bGt = bMet.gt || 0;

    const aSortino = aMet.sortino || 0;
    const bSortino = bMet.sortino || 0;

    const aSig = aMet.sig || 0;
    const bSig = bMet.sig || 0;

    // a dominates b if:
    // a.gt >= b.gt AND a.sortino >= b.sortino AND a.sig >= b.sig
    // AND at least one is strictly greater
    const gtOk = aGt >= bGt;
    const sortinoOk = aSortino >= bSortino;
    const sigOk = aSig >= bSig;

    if (!gtOk || !sortinoOk || !sigOk) return false;

    // Check strict inequality in at least one
    return aGt > bGt || aSortino > bSortino || aSig > bSig;
  }

  /**
   * Check constraints
   */
  _satisfiesConstraints(result) {
    if (result.n && result.n < this.minTrades) return false;
    if (result.dd && result.dd > this.maxDD) return false;
    if (result.wr && result.wr < this.minWR) return false;
    if (result.sig && result.sig < this.minSig) return false;
    return true;
  }

  /**
   * Compute weighted score
   */
  _computeWeightedScore(result) {
    const gt = result.gt || 0;
    const sortino = result.sortino || 0;
    const sig = result.sig || 0;

    return this._computeScore({ gt, sortino, sig }, this.weights);
  }

  /**
   * Compute score with custom weights
   */
  _computeScore(metrics, weights) {
    // Normalize to [0, 1]
    const gtNorm = Math.min((metrics.gt || 0) / 10, 1);
    const sortinoNorm = Math.min((metrics.sortino || 0) / 5, 1);
    const sigNorm = Math.min((metrics.sig || 0) / 100, 1);

    return (gtNorm * weights.gt +
            sortinoNorm * weights.sortino +
            sigNorm * weights.sig);
  }
}

// ============================================================
// RANKING & FILTERING UTILITIES
// ============================================================

/**
 * Rank results by multiple objectives with different strategies
 */
function rankByStrategy(results, strategy = 'weighted', weights = null) {
  switch (strategy) {
    case 'weighted':
      return rankByWeighted(results, weights);
    case 'lexicographic':
      return rankByLexicographic(results);
    case 'topsis':
      return rankByTOPSIS(results, weights);
    default:
      return rankByWeighted(results, weights);
  }
}

/**
 * Weighted sum ranking
 */
function rankByWeighted(results, weights = null) {
  const w = weights || { gt: 0.5, sortino: 0.3, sig: 0.2 };

  const scored = results.map((r, idx) => {
    const gtNorm = Math.min((r.gt || 0) / 10, 1);
    const sortinoNorm = Math.min((r.sortino || 0) / 5, 1);
    const sigNorm = Math.min((r.sig || 0) / 100, 1);

    const score = gtNorm * w.gt + sortinoNorm * w.sortino + sigNorm * w.sig;

    return {
      ...r,
      _origIdx: idx,
      _score: score,
      _rank: 0,
    };
  });

  scored.sort((a, b) => b._score - a._score);
  scored.forEach((item, i) => item._rank = i + 1);

  return scored;
}

/**
 * Lexicographic ranking (first by GT, then by Sortino, then by Sig)
 */
function rankByLexicographic(results) {
  return [...results]
    .map((r, idx) => ({ ...r, _origIdx: idx }))
    .sort((a, b) => {
      const gtDiff = (b.gt || 0) - (a.gt || 0);
      if (gtDiff !== 0) return gtDiff;

      const sortinoDiff = (b.sortino || 0) - (a.sortino || 0);
      if (sortinoDiff !== 0) return sortinoDiff;

      return (b.sig || 0) - (a.sig || 0);
    })
    .map((r, i) => ({ ...r, _rank: i + 1 }));
}

/**
 * TOPSIS (Technique for Order Preference by Similarity to Ideal Solution)
 * Более продвинутый метод многоцелевой оптимизации
 */
function rankByTOPSIS(results, weights = null) {
  const w = weights || { gt: 0.5, sortino: 0.3, sig: 0.2 };
  const objectives = ['gt', 'sortino', 'sig'];

  // Normalize
  const mins = {}, maxs = {};
  objectives.forEach(obj => {
    const vals = results.map(r => r[obj] || 0);
    mins[obj] = Math.min(...vals);
    maxs[obj] = Math.max(...vals);
  });

  const normalized = results.map(r => {
    const norm = {};
    objectives.forEach(obj => {
      const val = r[obj] || 0;
      const range = maxs[obj] - mins[obj];
      norm[obj] = range === 0 ? 0.5 : (val - mins[obj]) / range;
    });
    return norm;
  });

  // Weighted normalized
  const weighted = normalized.map(norm => {
    return {
      gt: norm.gt * w.gt,
      sortino: norm.sortino * w.sortino,
      sig: norm.sig * w.sig,
    };
  });

  // Ideal solution
  const ideal = {
    gt: Math.max(...weighted.map(w => w.gt)),
    sortino: Math.max(...weighted.map(w => w.sortino)),
    sig: Math.max(...weighted.map(w => w.sig)),
  };

  const antiIdeal = {
    gt: Math.min(...weighted.map(w => w.gt)),
    sortino: Math.min(...weighted.map(w => w.sortino)),
    sig: Math.min(...weighted.map(w => w.sig)),
  };

  // Distances
  const distances = weighted.map(w => {
    const distIdeal = Math.sqrt(
      (w.gt - ideal.gt) ** 2 +
      (w.sortino - ideal.sortino) ** 2 +
      (w.sig - ideal.sig) ** 2
    );

    const distAntiIdeal = Math.sqrt(
      (w.gt - antiIdeal.gt) ** 2 +
      (w.sortino - antiIdeal.sortino) ** 2 +
      (w.sig - antiIdeal.sig) ** 2
    );

    return distIdeal + distAntiIdeal > 0
      ? distAntiIdeal / (distIdeal + distAntiIdeal)
      : 0;
  });

  // Rank
  const scored = results.map((r, idx) => ({
    ...r,
    _origIdx: idx,
    _score: distances[idx],
  }));

  scored.sort((a, b) => b._score - a._score);
  scored.forEach((item, i) => item._rank = i + 1);

  return scored;
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ParetoFront,
    rankByStrategy,
    rankByWeighted,
    rankByLexicographic,
    rankByTOPSIS,
  };
}
