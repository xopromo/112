// ============================================================
// pareto_front.js — MULTI-OBJECTIVE OPTIMIZATION
// ============================================================

class ParetoFront {
  constructor(options = {}) {
    this.front = [];
    this.archived = [];
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

  addResult(result) {
    if (!this._satisfiesConstraints(result)) {
      this.archived.push(result);
      return false;
    }

    this.archived.push(result);

    for (let i = 0; i < this.front.length; i++) {
      const existing = this.front[i];
      if (this._dominates(existing, result)) {
        return false;
      }
    }

    this.front = this.front.filter(existing => !this._dominates(result, existing));

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

  getTopByMetric(metric, n = 100) {
    const sorted = [...this.front].sort((a, b) => {
      const aVal = a.metrics[metric] || 0;
      const bVal = b.metrics[metric] || 0;
      if (metric === 'dd') return aVal - bVal;
      return bVal - aVal;
    });
    return sorted.slice(0, n);
  }

  getRankedByWeights(weights = null, n = 100) {
    const w = weights || this.weights;
    const scored = this.front.map(item => ({
      ...item,
      weightedScore: this._computeScore(item.metrics, w),
    }));
    scored.sort((a, b) => b.weightedScore - a.weightedScore);
    return scored.slice(0, n);
  }

  getFrontier(n = null) {
    const sorted = [...this.front].sort((a, b) => b.score - a.score);
    return n ? sorted.slice(0, n) : sorted;
  }

  calculateCrowdingDistance() {
    if (this.front.length === 0) return [];

    const results = this.front.map((item, idx) => ({
      idx,
      item,
      distance: 0,
    }));

    const objectives = ['gt', 'sortino', 'sig'];
    const minMax = {};

    objectives.forEach(obj => {
      const vals = this.front.map(item => item.metrics[obj] || 0);
      minMax[obj] = {
        min: Math.min(...vals),
        max: Math.max(...vals),
      };
    });

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

  _dominates(a, b) {
    const aMet = a.metrics || a.result?.metrics || a;
    const bMet = b.metrics || b.result?.metrics || b;

    const aGt = aMet.gt || 0;
    const bGt = bMet.gt || 0;
    const aSortino = aMet.sortino || 0;
    const bSortino = bMet.sortino || 0;
    const aSig = aMet.sig || 0;
    const bSig = bMet.sig || 0;

    const gtOk = aGt >= bGt;
    const sortinoOk = aSortino >= bSortino;
    const sigOk = aSig >= bSig;

    if (!gtOk || !sortinoOk || !sigOk) return false;
    return aGt > bGt || aSortino > bSortino || aSig > bSig;
  }

  _satisfiesConstraints(result) {
    if (result.n && result.n < this.minTrades) return false;
    if (result.dd && result.dd > this.maxDD) return false;
    if (result.wr && result.wr < this.minWR) return false;
    if (result.sig && result.sig < this.minSig) return false;
    return true;
  }

  _computeWeightedScore(result) {
    const gt = result.gt || 0;
    const sortino = result.sortino || 0;
    const sig = result.sig || 0;
    return this._computeScore({ gt, sortino, sig }, this.weights);
  }

  _computeScore(metrics, weights) {
    const gtNorm = Math.min((metrics.gt || 0) / 10, 1);
    const sortinoNorm = Math.min((metrics.sortino || 0) / 5, 1);
    const sigNorm = Math.min((metrics.sig || 0) / 100, 1);
    return (gtNorm * weights.gt + sortinoNorm * weights.sortino + sigNorm * weights.sig);
  }
}
