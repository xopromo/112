// ============================================================
// synthesis_ui.js — UI INTEGRATION FOR STRATEGY SYNTHESIS
// ============================================================
// Функции для управления synthesis модалом, настройками и результатами
// ============================================================

// ============================================================
// MODAL MANAGEMENT
// ============================================================

function openSynthesisModal() {
  const modal = document.getElementById('synthesis-modal');
  if (!modal) {
    console.error('synthesis-modal not found');
    return;
  }

  // Заполнить текущие значения из UI
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

    targetCount: 1000,
    maxIter: 50000,
    gamma: 0.25,

    weightGT: 0.5,
    weightSortino: 0.3,
    weightSig: 0.2,

    startMode: 'zero',  // 'zero' или 'favourites'
    saveHistory: true,
  };

  // Загрузить сохраненные значения если есть
  const saved = localStorage.getItem('synthesis-settings');
  if (saved) {
    try {
      Object.assign(defaults, JSON.parse(saved));
    } catch (e) {
      console.warn('Failed to load synthesis settings', e);
    }
  }

  // Установить значения в UI
  _setSynthesisDefaults(defaults);

  modal.style.display = 'block';
  modal.querySelector('.modal-content').scrollTop = 0;
}

function closeSynthesisModal() {
  const modal = document.getElementById('synthesis-modal');
  if (modal) modal.style.display = 'none';
}

function _setSynthesisDefaults(defaults) {
  // Vary flags
  _setCheckbox('c_synth_vary_entries', defaults.varyEntries);
  _setCheckbox('c_synth_vary_filters', defaults.varyFilters);
  _setCheckbox('c_synth_vary_filter_params', defaults.varyFilterParams);
  _setCheckbox('c_synth_vary_exits', defaults.varyExits);
  _setCheckbox('c_synth_vary_sltp', defaults.varySLTP);
  _setCheckbox('c_synth_vary_risk', defaults.varyRisk);

  // Metrics
  _setCheckbox('c_synth_metric_gt', defaults.metricsGT);
  _setCheckbox('c_synth_metric_sortino', defaults.metricsSortino);
  _setCheckbox('c_synth_metric_sig', defaults.metricsSig);

  // Constraints
  _setInput('c_synth_min_trades', defaults.minTrades);
  _setInput('c_synth_max_dd', defaults.maxDD);
  _setInput('c_synth_min_wr', defaults.minWR);
  _setInput('c_synth_min_sig', defaults.minSig);

  // TPE params
  _setInput('c_synth_target_count', defaults.targetCount);
  _setInput('c_synth_max_iter', defaults.maxIter);
  _setInput('c_synth_gamma', defaults.gamma);

  // Weights
  _setInput('c_synth_weight_gt', defaults.weightGT);
  _setInput('c_synth_weight_sortino', defaults.weightSortino);
  _setInput('c_synth_weight_sig', defaults.weightSig);

  // Start mode
  _setSelectValue('c_synth_start_mode', defaults.startMode);

  // Save history
  _setCheckbox('c_synth_save_history', defaults.saveHistory);
}

function _setCheckbox(id, value) {
  const el = document.getElementById(id);
  if (el) el.checked = value;
}

function _setInput(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function _setSelectValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function _getCheckbox(id) {
  const el = document.getElementById(id);
  return el ? el.checked : false;
}

function _getInput(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

function _getSelectValue(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

// ============================================================
// SYNTHESIS EXECUTION
// ============================================================

async function runSynthesis() {
  // Получить параметры из модала
  const options = {
    varyEntries: _getCheckbox('c_synth_vary_entries'),
    varyFilters: _getCheckbox('c_synth_vary_filters'),
    varyFilterParams: _getCheckbox('c_synth_vary_filter_params'),
    varyExits: _getCheckbox('c_synth_vary_exits'),
    varySLTP: _getCheckbox('c_synth_vary_sltp'),
    varyRisk: _getCheckbox('c_synth_vary_risk'),

    metrics: [],
    minTrades: parseInt(_getInput('c_synth_min_trades')) || 10,
    maxDD: parseInt(_getInput('c_synth_max_dd')) || 100,
    minWR: parseFloat(_getInput('c_synth_min_wr')) || 0,
    minSig: parseFloat(_getInput('c_synth_min_sig')) || 0,

    targetCount: parseInt(_getInput('c_synth_target_count')) || 1000,
    maxIter: parseInt(_getInput('c_synth_max_iter')) || 50000,
    gamma: parseFloat(_getInput('c_synth_gamma')) || 0.25,

    weights: {
      gt: parseFloat(_getInput('c_synth_weight_gt')) || 0.5,
      sortino: parseFloat(_getInput('c_synth_weight_sortino')) || 0.3,
      sig: parseFloat(_getInput('c_synth_weight_sig')) || 0.2,
    },

    startMode: _getSelectValue('c_synth_start_mode') || 'zero',
    saveHistory: _getCheckbox('c_synth_save_history'),
  };

  // Собрать метрики
  if (_getCheckbox('c_synth_metric_gt')) options.metrics.push('gt');
  if (_getCheckbox('c_synth_metric_sortino')) options.metrics.push('sortino');
  if (_getCheckbox('c_synth_metric_sig')) options.metrics.push('sig');

  if (options.metrics.length === 0) {
    alert('Выбери хотя бы одну целевую метрику');
    return;
  }

  // Сохранить настройки
  localStorage.setItem('synthesis-settings', JSON.stringify(options));

  // Закрыть модал
  closeSynthesisModal();

  // Запустить синтез через opt.js
  optMode = 'synthesis';
  synthesisModeOptions = options;
  await runOpt();
}

// ============================================================
// RESULTS DISPLAY
// ============================================================

function renderSynthesisResults(results, pareto = null) {
  // Очистить таблицу результатов
  const tb = document.getElementById('tb');
  if (!tb) return;

  tb.innerHTML = '';

  // Колонки
  const cols = ['#', 'Название', 'PnL', 'WR', 'n', 'DD', 'GT-Score', 'Sortino', 'Sig%', 'Pareto'];

  // Header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  cols.forEach(col => {
    const th = document.createElement('th');
    th.textContent = col;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  tb.appendChild(thead);

  // Rows
  const tbody = document.createElement('tbody');
  results.forEach((r, idx) => {
    const row = document.createElement('tr');

    const isParetoMember = pareto && pareto.some(p => p.result === r);
    if (isParetoMember) row.style.backgroundColor = '#ffffcc';

    // #
    let td = document.createElement('td');
    td.textContent = idx + 1;
    row.appendChild(td);

    // Name (buildName из opt.js)
    td = document.createElement('td');
    td.textContent = r.name || 'Strategy #' + (idx + 1);
    td.style.cursor = 'pointer';
    td.onclick = () => showDetail(r);
    row.appendChild(td);

    // PnL
    td = document.createElement('td');
    td.textContent = fmtNum(r.pnl || 0);
    row.appendChild(td);

    // WR
    td = document.createElement('td');
    td.textContent = ((r.wr || 0).toFixed(1)) + '%';
    row.appendChild(td);

    // n
    td = document.createElement('td');
    td.textContent = r.n || 0;
    row.appendChild(td);

    // DD
    td = document.createElement('td');
    td.textContent = ((r.dd || 0).toFixed(1)) + '%';
    row.appendChild(td);

    // GT-Score
    td = document.createElement('td');
    const gt = r.gt || 0;
    td.textContent = gt.toFixed(2);
    td.style.color = gt >= 5 ? 'green' : (gt >= 2 ? 'orange' : 'red');
    row.appendChild(td);

    // Sortino
    td = document.createElement('td');
    const sortino = r.sortino || 0;
    td.textContent = sortino.toFixed(2);
    row.appendChild(td);

    // Sig%
    td = document.createElement('td');
    const sig = r.sig || 0;
    td.textContent = sig.toFixed(0) + '%';
    td.style.color = sig >= 90 ? 'green' : (sig >= 70 ? 'orange' : 'red');
    row.appendChild(td);

    // Pareto
    td = document.createElement('td');
    td.textContent = isParetoMember ? '✓' : '';
    td.style.textAlign = 'center';
    row.appendChild(td);

    tbody.appendChild(row);
  });

  tb.appendChild(tbody);

  // Обновить preview
  updatePreview();
}

// ============================================================
// SYNTHESIS HISTORY
// ============================================================

function saveSynthesisSession(sessionName, results, pareto, options) {
  const sessions = JSON.parse(localStorage.getItem('synthesis-sessions') || '{}');

  const timestamp = new Date().toISOString();
  sessions[timestamp] = {
    name: sessionName || `Synthesis ${timestamp.slice(0, 10)}`,
    timestamp,
    resultsCount: results.length,
    paretoCount: pareto.length,
    options,
    results: results.map(r => ({
      name: r.name,
      pnl: r.pnl,
      wr: r.wr,
      n: r.n,
      dd: r.dd,
      gt: r.gt,
      sortino: r.sortino,
      sig: r.sig,
    })),
    paretoIndices: pareto.map(p => results.indexOf(p)),
  };

  localStorage.setItem('synthesis-sessions', JSON.stringify(sessions));
  return timestamp;
}

function loadSynthesisSession(timestamp) {
  const sessions = JSON.parse(localStorage.getItem('synthesis-sessions') || '{}');
  return sessions[timestamp];
}

function deleteSynthesisSession(timestamp) {
  const sessions = JSON.parse(localStorage.getItem('synthesis-sessions') || '{}');
  delete sessions[timestamp];
  localStorage.setItem('synthesis-sessions', JSON.stringify(sessions));
}

function listSynthesisSessions() {
  const sessions = JSON.parse(localStorage.getItem('synthesis-sessions') || '{}');
  return Object.entries(sessions).map(([ts, data]) => ({
    timestamp: ts,
    ...data,
  }));
}

// ============================================================
// VISUALIZATION
// ============================================================

function drawParetoScatter(results) {
  // Draw scatter plot: GT-Score vs Sortino
  const canvas = document.getElementById('pareto-scatter');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  canvas.width = 400;
  canvas.height = 300;

  // Clear
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (results.length === 0) return;

  // Find min/max
  const gts = results.map(r => r.gt || 0);
  const sortinos = results.map(r => r.sortino || 0);
  const minGt = Math.min(...gts), maxGt = Math.max(...gts);
  const minSortino = Math.min(...sortinos), maxSortino = Math.max(...sortinos);

  const padding = 40;
  const w = canvas.width - 2 * padding;
  const h = canvas.height - 2 * padding;

  // Axes
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

  // Labels
  ctx.fillStyle = '#000';
  ctx.font = '12px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('GT-Score', canvas.width / 2, canvas.height - 10);

  ctx.save();
  ctx.translate(10, canvas.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Sortino', 0, 0);
  ctx.restore();

  // Points
  results.forEach((r, idx) => {
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

// ============================================================
// INTEGRATION WITH EXISTING UI
// ============================================================

function switchToSynthesisMode() {
  // Переключить режим оптимизации на synthesis
  optMode = 'synthesis';

  // Обновить UI
  const modeButtons = document.querySelectorAll('[data-mode]');
  modeButtons.forEach(btn => btn.classList.remove('active'));

  const synthBtn = document.querySelector('[data-mode="synthesis"]');
  if (synthBtn) synthBtn.classList.add('active');

  // Открыть модал с настройками
  openSynthesisModal();
}

// Export для использования в других модулях
if (typeof window !== 'undefined') {
  window.openSynthesisModal = openSynthesisModal;
  window.closeSynthesisModal = closeSynthesisModal;
  window.runSynthesis = runSynthesis;
  window.renderSynthesisResults = renderSynthesisResults;
  window.drawParetoScatter = drawParetoScatter;
  window.switchToSynthesisMode = switchToSynthesisMode;
  window.saveSynthesisSession = saveSynthesisSession;
  window.loadSynthesisSession = loadSynthesisSession;
  window.listSynthesisSessions = listSynthesisSessions;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    openSynthesisModal,
    closeSynthesisModal,
    runSynthesis,
    renderSynthesisResults,
    drawParetoScatter,
    switchToSynthesisMode,
  };
}
