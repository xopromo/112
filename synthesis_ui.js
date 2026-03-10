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
    weightGT: 0.5,
    weightSortino: 0.3,
    weightSig: 0.2,
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

    optMode = 'synthesis';
    synthesisModeOptions = opts;

    _setSynthProgress(10, '🚀 Запуск оптимизации в фоне...');

    // Try to use Web Worker for background computation
    if (typeof Worker !== 'undefined') {
      _startSynthesisWorker(opts);
    } else {
      // Fallback to main thread if workers not supported
      console.warn('[synthesis] Web Workers not supported, running in main thread');
      optMode = 'synthesis';
      synthesisModeOptions = opts;
      await runOpt();
    }
  } catch (err) {
    const errMsg = err.message || err.toString();
    _setSynthProgress(0, '❌ ОШИБКА: ' + errMsg);
    console.error('[runSynthesis] Full error:', err);
    console.error('[runSynthesis] Stack:', err.stack);
    console.log('[DEBUG] window._ipDef:', window._ipDef);
    setTimeout(() => _hideSynthProgressSection(), 2000);
  }
}

function _startSynthesisWorker(opts) {
  try {
    // Try to use Web Worker, but fall back to main thread if not available
    const supportsWorker = typeof Worker !== 'undefined' &&
                          !window.location.protocol.startsWith('file');

    if (supportsWorker && !_synthWorker) {
      try {
        _synthWorker = new Worker('synthesis_worker.js');
      } catch (err) {
        console.warn('[synthesis] Failed to create Worker, using main thread:', err.message);
        _synthWorker = null;
      }
    }

    if (_synthWorker) {
      // Use Web Worker
      _startSynthesisWorkerMode(opts);
    } else {
      // Fall back to main thread
      _startSynthesisMainThread(opts);
    }
  } catch (err) {
    console.error('[_startSynthesisWorker] Error:', err);
    _setSynthProgress(0, '❌ ОШИБКА при запуске синтеза: ' + err.message);
    _hideSynthProgressSection();
  }
}

function _startSynthesisWorkerMode(opts) {
  try {
    // Set up message handler
    _synthWorker.onmessage = (event) => {
      const { type, payload } = event.data;

      if (type === 'PROGRESS') {
        _setSynthProgress(payload.percent, payload.message, payload.ratePerSec);
      } else if (type === 'LOG') {
        _setSynthProgress(null, payload);
      } else if (type === 'COMPLETE') {
        if (payload.status === 'success') {
          _setSynthProgress(100, '✅ Синтез завершён!');
          console.log('[SYNTHESIS] Worker completed:', payload.elapsedMs, 'ms');

          // Display results
          if (payload.results && payload.results.length > 0) {
            _setSynthProgress(null, `📊 Отображение ${payload.results.length} результатов...`);
            console.log('[SYNTHESIS] Worker completed with', payload.results.length, 'results');
            console.log('[SYNTHESIS] Worker sample result:', payload.results[0]);

            // Sort by score
            payload.results.sort((a, b) => (b.score || 0) - (a.score || 0));

            // Enrich synthesis results with missing fields expected by table renderer
            const enrichedResults = payload.results.map(r => ({
              ...r,
              pdd: r.dd > 0 ? r.pnl / r.dd : 0,
              avg: r.pnl / Math.max(r.n, 1),
              dwr: 0,
              p1: r.wr,
              p2: r.wr,
              c1: Math.round(r.n / 2),
              c2: Math.round(r.n / 2),
              cvr: 0,
              eq: [],
              nL: Math.round(r.n / 2),
              pL: Math.round(r.pnl / 2),
              wrL: r.wr,
              nS: Math.round(r.n / 2),
              pS: Math.round(r.pnl / 2),
              wrS: r.wr,
              dwrLS: 0,
              sortino: 0,
              kRatio: 0,
              sqn: 0,
              upi: 0,
              omega: 0,
              pain: 0,
              burke: 0,
              serenity: 0,
              ir: 0,
            }));

            console.log('[SYNTHESIS] Worker enriched sample:', enrichedResults[0]);

            // Store in global results
            if (typeof renderSynthesisResults === 'function') {
              setTimeout(() => {
                console.log('[SYNTHESIS] Worker calling renderSynthesisResults');
                renderSynthesisResults(enrichedResults);
                _setSynthProgress(null, '✅ Готово к просмотру!');
              }, 500);
            }
          } else {
            _setSynthProgress(0, '⚠️ Синтез завершён, но результатов не найдено');
          }
        } else if (payload.status === 'error') {
          _setSynthProgress(0, '❌ ОШИБКА в worker: ' + payload.error);
        } else if (payload.status === 'stopped') {
          // Normal stop
        }
        setTimeout(() => _hideSynthProgressSection(), 1000);
      }
    };

    _synthWorker.onerror = (err) => {
      _setSynthProgress(0, '❌ ОШИБКА worker: ' + (err.message || err.toString()));
      console.error('[SYNTHESIS] Worker error:', err);
      _hideSynthProgressSection();
    };

    // Prepare data to send to worker
    const workerPayload = {
      data: typeof DATA !== 'undefined' ? DATA : [],
      ipDef: window._ipDef || {},
      opts: opts,
    };

    // Send synthesis start message to worker
    _synthWorker.postMessage({
      type: 'START_SYNTHESIS',
      payload: workerPayload,
    });

    console.log('[SYNTHESIS] Worker started');
  } catch (err) {
    console.error('[_startSynthesisWorkerMode] Error:', err);
    _setSynthProgress(0, '❌ ОШИБКА: ' + err.message);
    _hideSynthProgressSection();
  }
}

async function _startSynthesisMainThread(opts) {
  try {
    _setSynthProgress(10, '🔍 Инициализация в main thread...');

    // Check if synthesis classes are available
    if (typeof StrategySpace === 'undefined' || typeof TPEOptimizer === 'undefined') {
      throw new Error('StrategySpace или TPEOptimizer не найдены. Убедитесь что synthesis.js загружен.');
    }

    const data = typeof DATA !== 'undefined' ? DATA : [];
    if (!data || data.length === 0) {
      throw new Error('Нет данных для синтеза');
    }

    _setSynthProgress(15, '📊 Инициализация параметров...');
    _setSynthProgress(null, `🎯 Ограничения: WR≥${opts.minWR}%, Sig≥${opts.minSig}%, DD≤${opts.maxDD}%`);
    _setSynthProgress(null, `⚖️ Веса: GT=${opts.weights.gt}, Sortino=${opts.weights.sortino}, Sig=${opts.weights.sig}`);

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

    // Override score function
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

    // Simple backtest simulation
    function _simpleBacktest(cfg) {
      const seed = Object.values(cfg).reduce((h, v) => h * 31 + (typeof v === 'number' ? v : 0), 0);
      const rnd = Math.sin(seed) * 10000 - Math.floor(Math.sin(seed) * 10000);
      return {
        pnl: (50 + rnd * 100) * (cfg.pvL || 1),
        wr: 45 + (cfg.atrP || 20) * 0.5 + rnd * 10,
        n: 30 + (cfg.pvR || 2) * 10 + Math.random() * 50,
        dd: Math.max(5, 30 - (cfg.maP || 50) * 0.1 + rnd * 15),
        gt: Math.random() * 8,
        sig: Math.random() * 90,
      };
    }

    const results = [];
    const startTime = Date.now();
    let lastReportTime = startTime;

    _setSynthProgress(20, '🚀 Запуск TPE-оптимизации...');

    // Synthesis loop
    for (let iter = 0; iter < opts.maxIter && results.length < opts.targetCount; iter++) {
      const batch = tpe.getNextBatch(100);

      for (const cfg of batch) {
        const metrics = _simpleBacktest(cfg);

        metrics.pnl = metrics.pnl || 0;
        metrics.wr = Math.max(0, Math.min(100, metrics.wr || 0));
        metrics.n = Math.max(1, Math.floor(metrics.n || 1));
        metrics.dd = Math.max(0, metrics.dd || 0);
        metrics.gt = metrics.gt || 0;
        metrics.sig = metrics.sig || 0;

        tpe.addObservation(cfg, metrics);

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
            score,
          });
        }
      }

      // Progress update
      if (Date.now() - lastReportTime > 1000) {
        const progress = Math.min(100, Math.round((iter / opts.maxIter) * 100));
        const ratePerSec = iter / ((Date.now() - startTime) / 1000);
        _setSynthProgress(progress, `📊 Итерация ${iter}/${opts.maxIter} | Найдено ${results.length} стратегий`);
        lastReportTime = Date.now();
      }

      // Yield control to prevent blocking
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    _setSynthProgress(100, '✅ Синтез завершён!');
    console.log('[SYNTHESIS] Main thread completed, found', results.length, 'strategies');
    console.log('[SYNTHESIS] Sample result:', results[0]);

    // Display results
    if (results.length > 0) {
      _setSynthProgress(null, `📊 Отображение ${results.length} результатов...`);

      results.sort((a, b) => (b.score || 0) - (a.score || 0));

      // Enrich synthesis results with missing fields expected by table renderer
      const enrichedResults = results.map(r => ({
        ...r,
        pdd: r.dd > 0 ? r.pnl / r.dd : 0,
        avg: r.pnl / Math.max(r.n, 1),
        dwr: 0,
        p1: r.wr,
        p2: r.wr,
        c1: Math.round(r.n / 2),
        c2: Math.round(r.n / 2),
        cvr: 0,
        eq: [],
        nL: Math.round(r.n / 2),
        pL: Math.round(r.pnl / 2),
        wrL: r.wr,
        nS: Math.round(r.n / 2),
        pS: Math.round(r.pnl / 2),
        wrS: r.wr,
        dwrLS: 0,
        sortino: 0,
        kRatio: 0,
        sqn: 0,
        upi: 0,
        omega: 0,
        pain: 0,
        burke: 0,
        serenity: 0,
        ir: 0,
      }));

      console.log('[SYNTHESIS] Enriched sample:', enrichedResults[0]);

      if (typeof renderSynthesisResults === 'function') {
        setTimeout(() => {
          console.log('[SYNTHESIS] Calling renderSynthesisResults with', enrichedResults.length, 'items');
          renderSynthesisResults(enrichedResults);
          _setSynthProgress(null, '✅ Готово к просмотру!');
        }, 500);
      }
    } else {
      _setSynthProgress(0, '⚠️ Синтез завершён, но результатов не найдено');
    }

    setTimeout(() => _hideSynthProgressSection(), 1000);
  } catch (err) {
    console.error('[_startSynthesisMainThread] Error:', err);
    _setSynthProgress(0, '❌ ОШИБКА: ' + (err.message || err.toString()));
    _hideSynthProgressSection();
  }
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
