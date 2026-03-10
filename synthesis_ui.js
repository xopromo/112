// ============================================================
// synthesis_ui.js — UI INTEGRATION FOR STRATEGY SYNTHESIS
// ============================================================

function openSynthesisModal() {
  const modal = document.getElementById('synthesis-modal');
  if (!modal) {
    console.error('synthesis-modal not found');
    return;
  }

  const defaults = {
    varyEntries: true,
    varyFilters: true,
    varyFilterParams: true,
    varyExits: true,
    varySLTP: true,
    varyRisk: true,
    metricsGT: true,
    metricsSortino: true,
    metricsSig: true,
    minTrades: 10,
    maxDD: 50,
    minWR: 0,
    minSig: 0,
    targetCount: 200,
    maxIter: 10000,
    gamma: 0.25,
    weightGT: 2,
    weightSortino: 0.1,
    weightSig: 0.7,
    startMode: 'zero',
    saveHistory: true,
  };

  const saved = localStorage.getItem('synthesis-settings');
  if (saved) {
    try {
      Object.assign(defaults, JSON.parse(saved));
    } catch (e) {
      console.warn('Failed to load synthesis settings', e);
    }
  }

  _setSynthesisDefaults(defaults);
  modal.style.display = 'block';
  modal.querySelector('.modal-content')?.scrollTo(0, 0);
}

function closeSynthesisModal() {
  const modal = document.getElementById('synthesis-modal');
  if (modal) modal.style.display = 'none';
}

// ──── Synthesis Logging ────────────────────────────────────────
let _synthStartTime = 0;
let _synthLogCount = 0;
let _synthWorker = null;

function _showSynthProgressSection() {
  const section = document.getElementById('synth-progress-section');
  const runBtn = document.getElementById('synth-run-btn');
  const stopBtn = document.getElementById('synth-stop-btn');
  if (section) section.style.display = 'block';
  if (runBtn) runBtn.style.display = 'none';
  if (stopBtn) stopBtn.style.display = 'inline-block';
}

function _hideSynthProgressSection() {
  // НЕ закрываем модал! Оставляем его открытым чтобы пользователь прочитал логи
  const runBtn = document.getElementById('synth-run-btn');
  const stopBtn = document.getElementById('synth-stop-btn');
  if (runBtn) runBtn.style.display = 'inline-block';
  if (stopBtn) stopBtn.style.display = 'none';
}

function _setSynthProgress(percent, text, ratePerSec = null) {
  const fill = document.getElementById('synth-progress-fill');
  const txt = document.getElementById('synth-progress-text');
  if (fill) fill.style.width = Math.min(Math.max(percent, 0), 100) + '%';

  // Calculate ETA if progress rate is known
  let displayText = Math.round(percent) + '%';
  if (ratePerSec && ratePerSec > 0 && percent > 0 && percent < 100) {
    const elapsedMs = Date.now() - _synthStartTime;
    const elapsedSec = elapsedMs / 1000;
    const remainingPercent = 100 - percent;
    const remainingSeconds = (remainingPercent / percent) * elapsedSec;

    if (remainingSeconds > 60) {
      const mins = Math.round(remainingSeconds / 60);
      displayText += ` (⏱ ~${mins}мин)`;
    } else if (remainingSeconds > 0) {
      displayText += ` (⏱ ~${Math.round(remainingSeconds)}с)`;
    }
  }
  if (txt) txt.textContent = displayText;

  if (text) {
    const logs = document.getElementById('synth-logs');
    if (logs) {
      const time = new Date().toLocaleTimeString('ru-RU');
      const line = `[${time}] ${text}`;
      logs.innerHTML += line + '<br>';
      logs.scrollTop = logs.scrollHeight;
      _synthLogCount++;
      console.log('[SYNTHESIS]', text);
    }
  }
}

function stopSynthesis() {
  // Send stop signal to worker or global
  if (_synthWorker) {
    _synthWorker.postMessage({ type: 'STOP_SYNTHESIS' });
  }
  if (typeof stopped !== 'undefined') stopped = true;
  _setSynthProgress(0, '⏹ Синтез остановлен пользователем');
  _hideSynthProgressSection(); // только скрываем кнопку стопа, модал остаётся
}

function _setSynthesisDefaults(defaults) {
  const el = (id) => document.getElementById(id);

  // Vary options
  if (el('c_synth_vary_entries')) el('c_synth_vary_entries').checked = defaults.varyEntries;
  if (el('c_synth_vary_filters')) el('c_synth_vary_filters').checked = defaults.varyFilters;
  if (el('c_synth_vary_filter_params')) el('c_synth_vary_filter_params').checked = defaults.varyFilterParams;
  if (el('c_synth_vary_exits')) el('c_synth_vary_exits').checked = defaults.varyExits;
  if (el('c_synth_vary_sltp')) el('c_synth_vary_sltp').checked = defaults.varySLTP;
  if (el('c_synth_vary_risk')) el('c_synth_vary_risk').checked = defaults.varyRisk;

  // Metrics
  if (el('c_synth_metric_gt')) el('c_synth_metric_gt').checked = defaults.metricsGT;
  if (el('c_synth_metric_sortino')) el('c_synth_metric_sortino').checked = defaults.metricsSortino;
  if (el('c_synth_metric_sig')) el('c_synth_metric_sig').checked = defaults.metricsSig;

  // Constraints
  if (el('c_synth_min_trades')) el('c_synth_min_trades').value = defaults.minTrades;
  if (el('c_synth_max_dd')) el('c_synth_max_dd').value = defaults.maxDD;
  if (el('c_synth_min_wr')) el('c_synth_min_wr').value = defaults.minWR;
  if (el('c_synth_min_sig')) el('c_synth_min_sig').value = defaults.minSig;

  // TPE params
  if (el('c_synth_target_count')) el('c_synth_target_count').value = defaults.targetCount;
  if (el('c_synth_max_iter')) el('c_synth_max_iter').value = defaults.maxIter;
  if (el('c_synth_gamma')) el('c_synth_gamma').value = defaults.gamma;
  if (el('c_synth_gamma_val')) el('c_synth_gamma_val').textContent = defaults.gamma;

  // Weights
  if (el('c_synth_weight_gt')) el('c_synth_weight_gt').value = defaults.weightGT;
  if (el('c_synth_weight_sortino')) el('c_synth_weight_sortino').value = defaults.weightSortino;
  if (el('c_synth_weight_sig')) el('c_synth_weight_sig').value = defaults.weightSig;

  // Options
  if (el('c_synth_start_mode')) el('c_synth_start_mode').value = defaults.startMode;
  if (el('c_synth_save_history')) el('c_synth_save_history').checked = defaults.saveHistory;
}

async function runSynthesis() {
  const el = (id) => document.getElementById(id);

  try {
    _synthStartTime = Date.now();
    _synthLogCount = 0;
    _showSynthProgressSection();
    _setSynthProgress(1, '🔍 Загрузка параметров синтеза...');

    const opts = {
      varyEntries: el('c_synth_vary_entries')?.checked || true,
      varyFilters: el('c_synth_vary_filters')?.checked || true,
      varyFilterParams: el('c_synth_vary_filter_params')?.checked || true,
      varyExits: el('c_synth_vary_exits')?.checked || true,
      varySLTP: el('c_synth_vary_sltp')?.checked || true,
      varyRisk: el('c_synth_vary_risk')?.checked || true,
      metrics: [],
      minTrades: parseInt(el('c_synth_min_trades')?.value) || 10,
      maxDD: parseInt(el('c_synth_max_dd')?.value) || 100,
      minWR: parseFloat(el('c_synth_min_wr')?.value) || 0,
      minSig: parseFloat(el('c_synth_min_sig')?.value) || 0,
      targetCount: parseInt(el('c_synth_target_count')?.value) || 1000,
      maxIter: parseInt(el('c_synth_max_iter')?.value) || 50000,
      gamma: parseFloat(el('c_synth_gamma')?.value) || 0.25,
      weights: {
        gt: parseFloat(el('c_synth_weight_gt')?.value) || 0.5,
        sortino: parseFloat(el('c_synth_weight_sortino')?.value) || 0.3,
        sig: parseFloat(el('c_synth_weight_sig')?.value) || 0.2,
      },
      startMode: el('c_synth_start_mode')?.value || 'zero',
      saveHistory: el('c_synth_save_history')?.checked || true,
    };

    if (el('c_synth_metric_gt')?.checked) opts.metrics.push('gt');
    if (el('c_synth_metric_sortino')?.checked) opts.metrics.push('sortino');
    if (el('c_synth_metric_sig')?.checked) opts.metrics.push('sig');

    if (opts.metrics.length === 0) {
      alert('Выбери хотя бы одну целевую метрику');
      _hideSynthProgressSection();
      return;
    }

    _setSynthProgress(5, '✅ Параметры загружены: ' + opts.metrics.join(', '));
    _setSynthProgress(7, '📊 Конфигурация: ' + opts.targetCount + ' стратегий, ' + opts.maxIter + ' итераций');

    localStorage.setItem('synthesis-settings', JSON.stringify(opts));

    _setSynthProgress(10, '🚀 Запуск оптимизации в фоне (worker thread)...');

    // Use dedicated worker to prevent UI blocking
    await _runSynthesisWorker(opts);

    // After synthesis completes, close the modal so user sees results
    closeSynthesisModal();
    _setSynthProgress(100, '✅ Синтез завершён!');
    console.log('[runSynthesis] Synthesis complete, results displayed');
  } catch (err) {
    const errMsg = err.message || err.toString();
    _setSynthProgress(0, '❌ ОШИБКА: ' + errMsg);
    console.error('[runSynthesis] Full error:', err);
    console.error('[runSynthesis] Stack:', err.stack);
    setTimeout(() => _hideSynthProgressSection(), 2000);
  }
}

async function _runSynthesisWorker(opts) {
  return new Promise((resolve, reject) => {
    try {
      // Create worker from inline script or file
      let worker;
      try {
        worker = new Worker('synthesis_worker.js');
      } catch {
        // Fallback: create blob worker from inline synthesis code
        const workerScript = `
${typeof StrategySpace !== 'undefined' ? '' : 'importScripts("synthesis.js")'}
${typeof backtest !== 'undefined' ? '' : 'importScripts("core.js")'}
${typeof buildBtCfg !== 'undefined' ? '' : 'importScripts("opt.js")'}

// Worker message handler inline
self.onmessage = async (event) => {
  const { type, payload } = event.data;
  if (type === 'START_SYNTHESIS') {
    await _runSynthesisInWorker(payload);
  } else if (type === 'STOP_SYNTHESIS') {
    self.postMessage({ type: 'LOG', payload: '⏹ Синтез остановлен пользователем' });
    self.postMessage({ type: 'COMPLETE', payload: { status: 'stopped' } });
  }
};

let _synthWorkerStartTime = 0;

async function _runSynthesisInWorker(payload) {
  try {
    const { data, ipDef, opts } = payload;

    if (!data || data.length === 0) {
      throw new Error('Нет данных для синтеза');
    }

    // Store globals
    self.DATA = data;
    self.window = { _ipDef: ipDef };
    DATA = data;
    window = { _ipDef: ipDef };

    HAS_VOLUME = data.length > 0 && data[0].v !== undefined;
    results = [];
    favourites = {};
    equities = {};
    stopped = false;
    paused = false;

    _synthWorkerStartTime = Date.now();
    self.postMessage({ type: 'LOG', payload: '🔍 Инициализация параметров синтеза...' });
    self.postMessage({ type: 'LOG', payload: '📊 Целевые метрики: ' + opts.metrics.join(', ') });

    if (typeof StrategySpace === 'undefined' || typeof TPEOptimizer === 'undefined') {
      throw new Error('StrategySpace или TPEOptimizer не найдены');
    }

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

    const tpe = new TPEOptimizer(space, {
      maxIter: opts.maxIter,
      batchSize: 100,
      gamma: opts.gamma,
    });

    tpe._computeScore = function(metrics) {
      const wr = metrics.wr || 0;
      const sig = metrics.sig || 0;
      const trades = metrics.n || 0;
      const dd = metrics.dd || 0;

      if (space.minWR > 0 && wr < space.minWR) return -1000;
      if (space.minSig > 0 && sig < space.minSig) return -1000;
      if (space.minTrades > 0 && trades < space.minTrades) return -1000;
      if (space.maxDD < 100 && dd > space.maxDD) return -1000;

      const gtNorm = Math.min((metrics.gt || 0) / 10, 1);
      const sortinoNorm = Math.min((metrics.sortino || 0) / 5, 1);
      const sigNorm = Math.min((metrics.sig || 0) / 100, 1);
      return gtNorm * opts.weights.gt + sortinoNorm * opts.weights.sortino + sigNorm * opts.weights.sig;
    };

    const results = [];
    let lastReportTime = Date.now();

    function _computeMetrics(r) {
      if (!r) return null;
      const pdd = r.dd > 0 ? r.pnl / r.dd : (r.pnl > 0 ? 50 : 0);
      const z = (r.wr - 50) / Math.sqrt(2500 / Math.max(r.n, 1));
      const sigMult = 1 + Math.min(Math.max(z, 0), 3) * 0.3;
      const consistMult = 0.5 + Math.min(Math.max(1 - (r.dwr || 0) / 100, 0), 1) * 0.5;
      const gt = pdd > 0 ? pdd * sigMult * consistMult : 0;
      const t = 1 / (1 + 0.2316419 * z);
      const p = (1/Math.sqrt(2*Math.PI)) * Math.exp(-z*z/2) * t*(0.319382+t*(-0.356564+t*(1.781478+t*(-1.821256+t*1.330274))));
      const sig = Math.min(99, Math.max(0, Math.round((1 - p) * 100)));
      let sortino = 0;
      if (r.eq && r.eq.length > 1) {
        let sumDown = 0, cnt = 0;
        for (let i = 1; i < r.eq.length; i++) {
          const dd = Math.min(r.eq[i] - r.eq[i-1], 0);
          sumDown += dd * dd;
          cnt++;
        }
        const downStd = cnt > 0 ? Math.sqrt(sumDown / cnt) : 1;
        sortino = downStd > 0.01 ? r.pnl / downStd : 0;
      }
      return { gt, sig, sortino };
    }

    function _realBacktest(cfg) {
      try {
        const ind = _calcIndicators(cfg);
        const btc = buildBtCfg(cfg, ind);
        const result = backtest(ind.pvLo, ind.pvHi, ind.atrArr, btc);
        if (!result) return null;
        const metrics = _computeMetrics(result);
        return {
          pnl: result.pnl || 0,
          wr: Math.max(0, Math.min(100, result.wr || 0)),
          n: Math.max(1, result.n || 1),
          dd: Math.max(0, result.dd || 0),
          gt: metrics?.gt || 0,
          sig: metrics?.sig || 0,
          sortino: metrics?.sortino || 0,
          eq: result.eq || null,
        };
      } catch (err) {
        return null;
      }
    }

    for (let iter = 0; iter < opts.maxIter && results.length < opts.targetCount; iter++) {
      const batch = tpe.getNextBatch(100);
      for (const cfg of batch) {
        const metrics = _realBacktest(cfg);
        if (!metrics) {
          tpe.addObservation(cfg, { pnl: 0, wr: 0, n: 0, dd: 100, gt: 0, sig: 0 });
          continue;
        }
        tpe.addObservation(cfg, metrics);
        const passesConstraints = metrics.n >= space.minTrades && metrics.dd <= space.maxDD && metrics.wr >= space.minWR && metrics.sig >= space.minSig;
        if (passesConstraints && metrics.pnl > 0) {
          results.push({
            name: 'Synth_' + iter + '_' + results.length,
            cfg, pnl: metrics.pnl, wr: metrics.wr, n: metrics.n, dd: metrics.dd,
            gt: metrics.gt, sig: metrics.sig, sortino: metrics.sortino,
          });
        }
      }
      if (Date.now() - lastReportTime > 1000) {
        const progress = Math.min(100, Math.round((iter / opts.maxIter) * 100));
        const ratePerSec = iter / ((Date.now() - _synthWorkerStartTime) / 1000);
        self.postMessage({ type: 'PROGRESS', payload: {
          percent: progress, ratePerSec: ratePerSec,
          message: '📊 Итерация ' + iter + '/' + opts.maxIter + ' | Найдено ' + results.length + ' стратегий'
        }});
        lastReportTime = Date.now();
      }
    }

    self.postMessage({ type: 'LOG', payload: '✅ Синтез завершён! Найдено ' + results.length + ' стратегий' });
    const elapsedMs = Date.now() - _synthWorkerStartTime;
    self.postMessage({ type: 'LOG', payload: '⏱ Время синтеза: ' + (elapsedMs / 1000).toFixed(1) + 'с' });
    self.postMessage({ type: 'COMPLETE', payload: { status: 'success', results: results.slice(0, opts.targetCount) } });
  } catch (err) {
    self.postMessage({ type: 'LOG', payload: '❌ ОШИБКА в worker: ' + (err.message || err) });
    self.postMessage({ type: 'COMPLETE', payload: { status: 'error', error: err.message } });
  }
}
`;
        const blob = new Blob([workerScript], { type: 'application/javascript' });
        worker = new Worker(URL.createObjectURL(blob));
      }

      _synthWorker = worker;

      worker.onmessage = (event) => {
        const { type, payload } = event.data;
        if (type === 'LOG') {
          _setSynthProgress(null, payload);
        } else if (type === 'PROGRESS') {
          _setSynthProgress(payload.percent, payload.message, payload.ratePerSec);
        } else if (type === 'COMPLETE') {
          worker.terminate();
          _synthWorker = null;
          if (payload.status === 'success') {
            // Convert worker results to main table format
            results = (payload.results || []).map((r, idx) => ({
              ...r,
              name: r.name || 'Synth_' + idx,
              dwr: 0,  // фиксировать если нужно
            }));
            updatePreview();
            resolve();
          } else {
            reject(new Error(payload.error || 'Synthesis failed'));
          }
        }
      };

      worker.onerror = (err) => {
        worker.terminate();
        _synthWorker = null;
        reject(err);
      };

      // Start synthesis with data snapshot
      const ipDef = window._ipDef || {};
      worker.postMessage({ type: 'START_SYNTHESIS', payload: { data: DATA, ipDef, opts } });
    } catch (err) {
      reject(err);
    }
  });
}

function switchToSynthesisMode() {
  optMode = 'synthesis';
  const modeButtons = document.querySelectorAll('[data-mode], .mode-btn');
  modeButtons.forEach(btn => btn.classList.remove('active'));

  const synthBtn = document.getElementById('mode_synthesis');
  if (synthBtn) synthBtn.classList.add('active');

  openSynthesisModal();
}

function renderSynthesisResults(results, pareto = null) {
  const tb = document.getElementById('tb');
  if (!tb) return;

  tb.innerHTML = '';

  const cols = ['#', 'Название', 'PnL', 'WR', 'n', 'DD', 'GT', 'Sort', 'Sig%', '★'];
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  cols.forEach(col => {
    const th = document.createElement('th');
    th.textContent = col;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  tb.appendChild(thead);

  const tbody = document.createElement('tbody');
  results.forEach((r, idx) => {
    const row = document.createElement('tr');
    const isParetoMember = pareto && pareto.some(p => p.result === r);
    if (isParetoMember) row.style.backgroundColor = '#ffffcc';

    let td = document.createElement('td');
    td.textContent = idx + 1;
    row.appendChild(td);

    td = document.createElement('td');
    td.textContent = r.name || 'Strategy #' + (idx + 1);
    td.style.cursor = 'pointer';
    td.onclick = () => showDetail(r);
    row.appendChild(td);

    td = document.createElement('td');
    td.textContent = fmtNum(r.pnl || 0);
    row.appendChild(td);

    td = document.createElement('td');
    td.textContent = ((r.wr || 0).toFixed(1)) + '%';
    row.appendChild(td);

    td = document.createElement('td');
    td.textContent = r.n || 0;
    row.appendChild(td);

    td = document.createElement('td');
    td.textContent = ((r.dd || 0).toFixed(1)) + '%';
    row.appendChild(td);

    td = document.createElement('td');
    const gt = r.gt || 0;
    td.textContent = gt.toFixed(2);
    td.style.color = gt >= 5 ? 'green' : (gt >= 2 ? 'orange' : 'red');
    row.appendChild(td);

    td = document.createElement('td');
    const sortino = r.sortino || 0;
    td.textContent = sortino.toFixed(2);
    row.appendChild(td);

    td = document.createElement('td');
    const sig = r.sig || 0;
    td.textContent = sig.toFixed(0) + '%';
    td.style.color = sig >= 90 ? 'green' : (sig >= 70 ? 'orange' : 'red');
    row.appendChild(td);

    td = document.createElement('td');
    td.textContent = isParetoMember ? '★' : '';
    td.style.textAlign = 'center';
    row.appendChild(td);

    tbody.appendChild(row);
  });

  tb.appendChild(tbody);
  updatePreview();
}

function drawParetoScatter(results) {
  const canvas = document.getElementById('pareto-scatter');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  canvas.width = 400;
  canvas.height = 300;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (results.length === 0) return;

  const gts = results.map(r => r.gt || 0);
  const sortinos = results.map(r => r.sortino || 0);
  const minGt = Math.min(...gts), maxGt = Math.max(...gts);
  const minSortino = Math.min(...sortinos), maxSortino = Math.max(...sortinos);

  const padding = 40;
  const w = canvas.width - 2 * padding;
  const h = canvas.height - 2 * padding;

  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, canvas.height - padding);
  ctx.lineTo(canvas.width - padding, canvas.height - padding);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, canvas.height - padding);
  ctx.stroke();

  results.forEach((r) => {
    const gt = r.gt || 0;
    const sortino = r.sortino || 0;
    const x = padding + ((gt - minGt) / (maxGt - minGt || 1)) * w;
    const y = canvas.height - padding - ((sortino - minSortino) / (maxSortino - minSortino || 1)) * h;

    ctx.fillStyle = '#0066cc';
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, 2 * Math.PI);
    ctx.fill();
  });
}
