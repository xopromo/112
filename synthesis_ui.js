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

    console.log('[runSynthesis] Loading params from UI...');
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
      commission: parseFloat(document.getElementById('c_comm')?.value) || 0.08,
      spreadVal: parseFloat(document.getElementById('c_spread')?.value) || 0,
      weights: {
        gt: parseFloat(el('c_synth_weight_gt')?.value) || 0.5,
        sortino: parseFloat(el('c_synth_weight_sortino')?.value) || 0.3,
        sig: parseFloat(el('c_synth_weight_sig')?.value) || 0.2,
      },
      startMode: el('c_synth_start_mode')?.value || 'zero',
      commission: parseFloat(document.getElementById('c_comm')?.value) || 0.08,
      spreadVal: parseFloat(document.getElementById('c_spread')?.value) || 0,
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

    console.log('[runSynthesis] Constraints:', {
      minTrades: opts.minTrades,
      maxDD: opts.maxDD,
      minWR: opts.minWR,
      minSig: opts.minSig,
      commission: opts.commission,
      spread: opts.spreadVal
    });

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
      // Try to use Web Worker first
      let worker;
      try {
        worker = new Worker('synthesis_worker.js');
      } catch (e) {
        // Worker not available - fallback to main thread
        _setSynthProgress(null, '⚠️ Worker недоступен, используется main thread (медленнее)');
        _runSynthesisMainThread(opts).then(resolve).catch(reject);
        return;
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
            results = (payload.results || []).map((r, idx) => ({
              ...r,
              name: r.name || 'Synth_' + idx,
              dwr: 0,
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

      const ipDef = window._ipDef || {};
      worker.postMessage({ type: 'START_SYNTHESIS', payload: { data: DATA, ipDef, opts } });
    } catch (err) {
      reject(err);
    }
  });
}

async function _runSynthesisMainThread(opts) {
  return new Promise(async (resolve, reject) => {
    try {
      const startTime = Date.now();
      _setSynthProgress(5, '🔍 Инициализация синтеза (main thread)...');

      if (typeof StrategySpace === 'undefined' || typeof TPEOptimizer === 'undefined') {
        throw new Error('StrategySpace или TPEOptimizer не найдены');
      }

      const space = new StrategySpace({
        varyEntries: opts.varyEntries, varyFilters: opts.varyFilters,
        varyFilterParams: opts.varyFilterParams, varyExits: opts.varyExits,
        varySLTP: opts.varySLTP, varyRisk: opts.varyRisk,
        minTrades: opts.minTrades, maxDD: opts.maxDD,
        minWR: opts.minWR, minSig: opts.minSig,
        commission: opts.commission, spreadVal: opts.spreadVal,
      });

      const tpe = new TPEOptimizer(space, {
        maxIter: opts.maxIter, batchSize: 100, gamma: opts.gamma,
      });

      tpe._computeScore = function(m) {
        if (space.minWR > 0 && m.wr < space.minWR) return -1000;
        if (space.minSig > 0 && m.sig < space.minSig) return -1000;
        if (space.minTrades > 0 && m.n < space.minTrades) return -1000;
        if (space.maxDD < 100 && m.dd > space.maxDD) return -1000;
        const gt = Math.min((m.gt || 0) / 10, 1);
        const s = Math.min((m.sortino || 0) / 5, 1);
        const sig = Math.min((m.sig || 0) / 100, 1);
        return gt * opts.weights.gt + s * opts.weights.sortino + sig * opts.weights.sig;
      };

      const foundResults = [];
      let totalTested = 0;
      let lastReportTime = Date.now();

      console.log('[Synthesis] Starting main loop, maxIter=', opts.maxIter, 'targetCount=', opts.targetCount);

      for (let iter = 0; iter < opts.maxIter && foundResults.length < opts.targetCount; iter++) {
        const batch = tpe.getNextBatch(100);

        for (const cfg of batch) {
          totalTested++;

          try {
            const ind = _calcIndicators(cfg);
            const btc = buildBtCfg(cfg, ind);
            const result = backtest(ind.pvLo, ind.pvHi, ind.atrArr, btc);

            if (!result) {
              tpe.addObservation(cfg, { pnl: 0, wr: 0, n: 0, dd: 100, gt: 0, sig: 0, dwr: 0 });
              continue;
            }

            const pdd = result.dd > 0 ? result.pnl / result.dd : (result.pnl > 0 ? 50 : 0);
            const z = (result.wr - 50) / Math.sqrt(2500 / Math.max(result.n, 1));
            const sigMult = 1 + Math.min(Math.max(z, 0), 3) * 0.3;
            const consistMult = 0.5 + Math.min(Math.max(1 - (result.dwr || 0) / 100, 0), 1) * 0.5;
            const gt = pdd > 0 ? pdd * sigMult * consistMult : (pdd <= 0 ? -2 : 0);
            const t = 1 / (1 + 0.2316419 * z);
            const p = (1/Math.sqrt(2*Math.PI)) * Math.exp(-z*z/2) * t*(0.319382+t*(-0.356564+t*(1.781478+t*(-1.821256+t*1.330274))));
            const sig = Math.min(99, Math.max(0, Math.round((1 - p) * 100)));

            const metrics = { pnl: result.pnl, wr: result.wr, n: result.n, dd: result.dd, gt, sig, sortino: 0, dwr: result.dwr || 0 };
            tpe.addObservation(cfg, metrics);

            // Debug: track rejection reasons
            const passN = metrics.n >= space.minTrades;
            const passDD = metrics.dd <= space.maxDD;
            const passWR = metrics.wr >= space.minWR;
            const passSig = metrics.sig >= space.minSig;
            const passPnL = metrics.pnl > 0;

            // Count rejections by reason
            if (!window._synthRejectStats) window._synthRejectStats = { n: 0, dd: 0, wr: 0, sig: 0, pnl: 0, total: 0 };
            const stats = window._synthRejectStats;
            stats.total++;
            if (!passN) stats.n++;
            if (!passDD) stats.dd++;
            if (!passWR) stats.wr++;
            if (!passSig) stats.sig++;
            if (!passPnL) stats.pnl++;

            // Log rejection summary every 5000 iterations
            if (iter > 0 && iter % 5000 === 0) {
              console.log(`[Synthesis iter=${iter}] Rejections: n=${stats.n}, dd=${stats.dd}, wr=${stats.wr}, sig=${stats.sig}, pnl=${stats.pnl}/${stats.total} (${(100*stats.n/stats.total).toFixed(1)}% by n, ${(100*stats.pnl/stats.total).toFixed(1)}% by pnl)`);
              console.log(`  Space: minTrades=${space.minTrades}, maxDD=${space.maxDD}, minWR=${space.minWR}, minSig=${space.minSig}`);
              console.log(`  Sample: n=${metrics.n}, dd=${metrics.dd.toFixed(1)}, wr=${metrics.wr.toFixed(1)}, sig=${metrics.sig}, pnl=${metrics.pnl.toFixed(1)}`);
            }

            if (metrics.n >= space.minTrades && metrics.dd <= space.maxDD &&
                metrics.wr >= space.minWR && metrics.sig >= space.minSig && metrics.pnl > 0) {
              const pdd = result.dd > 0 ? result.pnl / result.dd : (result.pnl > 0 ? 50 : 0);
              const resultName = 'Synth_' + iter + '_' + foundResults.length;
              // Ensure cfg has all required fields for UI display
              cfg.atrPeriod = cfg.atrP; // UI uses atrPeriod, synthesis uses atrP
              cfg.commission = opts.commission;
              const newResult = {
                name: resultName,
                cfg, pnl: result.pnl, wr: result.wr, n: result.n, dd: result.dd, pdd, avg: result.avg || 0,
                sig, gt, sortino: 0, kRatio: null, sqn: null,
                cvr: null, upi: null, omega: null, pain: null, burke: null, serenity: null, ir: null,
                p1: result.p1 || 0, p2: result.p2 || 0, dwr: result.dwr || 0,
                c1: result.c1 || 0, c2: result.c2 || 0,
                nL: result.nL || 0, pL: result.pL || 0, wrL: result.wrL || 0,
                nS: result.nS || 0, pS: result.pS || 0, wrS: result.wrS || 0,
                dwrLS: result.dwrLS || null,
                eq: result.eq || []
              };
              // Сохранить equity в глобальный объект для графика
              if (typeof equities !== 'undefined' && result.eq) {
                equities[resultName] = result.eq;
              }
              foundResults.push(newResult);
              results.push(newResult);
              if (typeof renderResults === 'function') renderResults();
            }
          } catch (e) {
            // skip bad config
          }
        }

        if (Date.now() - lastReportTime > 500) {
          const pct = Math.min(100, Math.round((iter / opts.maxIter) * 100));
          const rate = totalTested / ((Date.now() - startTime) / 1000);
          _setSynthProgress(pct, `📊 Проверено ${totalTested} | Найдено ${foundResults.length}`, rate);
          lastReportTime = Date.now();

          // Yield to prevent blocking
          await new Promise(r => setTimeout(r, 10));
        }
      }

      // Final statistics
      if (window._synthRejectStats) {
        const stats = window._synthRejectStats;
        console.log('[Synthesis FINAL]', {
          totalTested: stats.total,
          rejectedByN: stats.n,
          rejectedByDD: stats.dd,
          rejectedByWR: stats.wr,
          rejectedBySig: stats.sig,
          rejectedByPnL: stats.pnl,
          accepted: foundResults.length,
          pctByN: (100*stats.n/stats.total).toFixed(1) + '%',
          pctByPnL: (100*stats.pnl/stats.total).toFixed(1) + '%'
        });
      }

      _setSynthProgress(100, `✅ Синтез завершён! Найдено ${foundResults.length} стратегий`);
      resolve();
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
