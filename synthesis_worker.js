// ============================================================
// synthesis_worker.js — WEB WORKER FOR BACKGROUND SYNTHESIS
// ============================================================

// Load required dependencies
try {
  importScripts('synthesis.js');
  importScripts('core.js');
  importScripts('opt.js');
} catch (err) {
  console.error('[synthesis_worker] Failed to import scripts:', err.message);
  // Continue anyway - synthesis.js classes should be available from inline bundling
}

let _synthWorkerStartTime = 0;

self.onmessage = async (event) => {
  const { type, payload } = event.data;

  if (type === 'START_SYNTHESIS') {
    _synthWorkerStartTime = Date.now();
    await _runSynthesisInWorker(payload);
  } else if (type === 'STOP_SYNTHESIS') {
    // Stop signal
    _postMessage('LOG', '⏹ Синтез остановлен пользователем');
    _postMessage('COMPLETE', { status: 'stopped' });
  }
};

async function _runSynthesisInWorker(payload) {
  try {
    const { data, ipDef, opts } = payload;

    if (!data || data.length === 0) {
      throw new Error('Нет данных для синтеза');
    }

    // Store globals (both self and global scope for function access)
    self.DATA = data;
    self.window = { _ipDef: ipDef };
    DATA = data;  // For functions that need global DATA
    window = { _ipDef: ipDef };  // For functions that need window

    // Initialize stub globals required by opt.js
    HAS_VOLUME = data.length > 0 && data[0].v !== undefined;
    results = [];
    favourites = {};
    equities = {};
    stopped = false;
    paused = false;

    _postMessage('LOG', '🔍 Инициализация параметров синтеза...');
    _postMessage('LOG', `📊 Целевые метрики: ${opts.metrics.join(', ')}`);
    _postMessage('LOG', `🎯 Ограничения: WR≥${opts.minWR}%, Sig≥${opts.minSig}%, DD≤${opts.maxDD}%`);
    _postMessage('LOG', `🔄 Итераций: ${opts.maxIter}, Целевых стратегий: ${opts.targetCount}`);
    _postMessage('LOG', `⚖️ Веса: GT=${opts.weights.gt}, Sortino=${opts.weights.sortino}, Sig=${opts.weights.sig}`);

    // Verify synthesis classes are available
    if (typeof StrategySpace === 'undefined' || typeof TPEOptimizer === 'undefined') {
      throw new Error('StrategySpace or TPEOptimizer not found. Make sure synthesis.js is loaded in worker.');
    }

    _postMessage('LOG', '🚀 Запуск TPE-оптимизации...');

    // Initialize strategy space
    const space = new StrategySpace({
      varyEntries: opts.varyEntries,
      varyFilters: opts.varyFilters,
      varyFilterParams: opts.varyFilterParams,
      varyExits: opts.varyExits,
      varySLTP: opts.varySLTP,
      varyRisk: opts.varyRisk,
      minTrades: opts.minTrades,
      maxDD: opts.maxDD,
      minWR: opts.minWR,
      minSig: opts.minSig,
    });

    // Initialize TPE optimizer
    const tpe = new TPEOptimizer(space, {
      maxIter: opts.maxIter,
      batchSize: 100,
      gamma: opts.gamma,
    });

    // Override score function to use custom weights
    const origComputeScore = tpe._computeScore.bind(tpe);
    tpe._computeScore = function(metrics) {
      // Hard constraints first
      const wr = metrics.wr || 0;
      const sig = metrics.sig || 0;
      const trades = metrics.n || 0;
      const dd = metrics.dd || 0;

      if (space.minWR > 0 && wr < space.minWR) return -1000;
      if (space.minSig > 0 && sig < space.minSig) return -1000;
      if (space.minTrades > 0 && trades < space.minTrades) return -1000;
      if (space.maxDD < 100 && dd > space.maxDD) return -1000;

      // Weighted score with user-provided weights
      const gtNorm = Math.min((metrics.gt || 0) / 10, 1);
      const sortinoNorm = Math.min((metrics.sortino || 0) / 5, 1);
      const sigNorm = Math.min((metrics.sig || 0) / 100, 1);
      return gtNorm * opts.weights.gt + sortinoNorm * opts.weights.sortino + sigNorm * opts.weights.sig;
    };

    const results = [];
    let lastReportTime = Date.now();

    // Real backtest using core.js + opt.js
    function _realBacktest(cfg) {
      try {
        if (typeof _calcIndicators !== 'function' || typeof buildBtCfg !== 'function' || typeof backtest !== 'function') {
          throw new Error('Missing backtest functions: _calcIndicators, buildBtCfg, or backtest');
        }

        const ind = _calcIndicators(cfg);
        const btc = buildBtCfg(cfg, ind);
        const result = backtest(ind.pvLo, ind.pvHi, ind.atrArr, btc);

        if (!result) {
          return null;
        }

        return {
          pnl: result.pnl || 0,
          wr: Math.max(0, Math.min(100, result.wr || 0)),
          n: Math.max(1, result.n || 1),
          dd: Math.max(0, result.dd || 0),
          gt: result.gt || 0,
          sig: result.sig || 0,
          sortino: result.sortino || 0,
          upi: result.upi || 0,
          kratio: result.kratio || 0,
          eq: result.eq || null,
        };
      } catch (err) {
        console.error('[synthesis_worker] Backtest error:', err.message);
        return null;
      }
    }

    // Synthesis loop
    for (let iter = 0; iter < opts.maxIter && results.length < opts.targetCount; iter++) {
      const batch = tpe.getNextBatch(100);

      for (const cfg of batch) {
        // Run real backtest
        const metrics = _realBacktest(cfg);

        if (!metrics) {
          // Backtest failed, skip this config
          tpe.addObservation(cfg, { pnl: 0, wr: 0, n: 0, dd: 100, gt: 0, sig: 0 });
          continue;
        }

        tpe.addObservation(cfg, metrics);

        // Add to results if passes constraints
        const score = tpe._computeScore(metrics);
        if (score > 0) {
          results.push({
            name: `Synth_${iter}_${results.length}`,
            cfg,
            pnl: metrics.pnl,
            wr: metrics.wr,
            n: metrics.n,
            dd: metrics.dd,
            gt: metrics.gt,
            sig: metrics.sig,
            sortino: metrics.sortino,
            upi: metrics.upi,
            kratio: metrics.kratio,
            eq: metrics.eq,
            score,
          });
        }
      }

      // Progress update
      if (Date.now() - lastReportTime > 1000) {
        const progress = Math.min(100, Math.round((iter / opts.maxIter) * 100));
        const ratePerSec = iter / ((Date.now() - _synthWorkerStartTime) / 1000);
        _postMessage('PROGRESS', {
          percent: progress,
          ratePerSec: ratePerSec,
          message: `📊 Итерация ${iter}/${opts.maxIter} | Найдено ${results.length} стратегий`,
        });
        lastReportTime = Date.now();
      }
    }

    _postMessage('LOG', `✅ Синтез завершён! Найдено ${results.length} стратегий`);

    const elapsedMs = Date.now() - _synthWorkerStartTime;
    _postMessage('LOG', `⏱ Время синтеза: ${(elapsedMs / 1000).toFixed(1)}с`);

    _postMessage('COMPLETE', {
      status: 'success',
      elapsedMs: elapsedMs,
      results: results.slice(0, opts.targetCount),
    });
  } catch (err) {
    _postMessage('LOG', '❌ ОШИБКА в worker: ' + (err.message || err.toString()));
    console.error('[_runSynthesisInWorker]', err);
    _postMessage('COMPLETE', {
      status: 'error',
      error: err.message || err.toString(),
    });
  }
}

function _postMessage(type, payload) {
  self.postMessage({
    type: type,
    payload: payload,
  });
}
