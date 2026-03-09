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
    targetCount: 1000,
    maxIter: 50000,
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

function _setSynthesisDefaults(defaults) {
  document.getElementById('c_synth_vary_entries').checked = defaults.varyEntries;
  document.getElementById('c_synth_vary_filters').checked = defaults.varyFilters;
  document.getElementById('c_synth_vary_filter_params').checked = defaults.varyFilterParams;
  document.getElementById('c_synth_vary_exits').checked = defaults.varyExits;
  document.getElementById('c_synth_vary_sltp').checked = defaults.varySLTP;
  document.getElementById('c_synth_vary_risk').checked = defaults.varyRisk;

  document.getElementById('c_synth_metric_gt').checked = defaults.metricsGT;
  document.getElementById('c_synth_metric_sortino').checked = defaults.metricsSortino;
  document.getElementById('c_synth_metric_sig').checked = defaults.metricsSig;

  document.getElementById('c_synth_min_trades').value = defaults.minTrades;
  document.getElementById('c_synth_max_dd').value = defaults.maxDD;
  document.getElementById('c_synth_min_wr').value = defaults.minWR;
  document.getElementById('c_synth_min_sig').value = defaults.minSig;

  document.getElementById('c_synth_target_count').value = defaults.targetCount;
  document.getElementById('c_synth_max_iter').value = defaults.maxIter;
  document.getElementById('c_synth_gamma').value = defaults.gamma;
  document.getElementById('c_synth_gamma_val').textContent = defaults.gamma;

  document.getElementById('c_synth_weight_gt').value = defaults.weightGT;
  document.getElementById('c_synth_weight_sortino').value = defaults.weightSortino;
  document.getElementById('c_synth_weight_sig').value = defaults.weightSig;

  document.getElementById('c_synth_start_mode').value = defaults.startMode;
  document.getElementById('c_synth_save_history').checked = defaults.saveHistory;
}

async function runSynthesis() {
  const opts = {
    varyEntries: document.getElementById('c_synth_vary_entries').checked,
    varyFilters: document.getElementById('c_synth_vary_filters').checked,
    varyFilterParams: document.getElementById('c_synth_vary_filter_params').checked,
    varyExits: document.getElementById('c_synth_vary_exits').checked,
    varySLTP: document.getElementById('c_synth_vary_sltp').checked,
    varyRisk: document.getElementById('c_synth_vary_risk').checked,
    metrics: [],
    minTrades: parseInt(document.getElementById('c_synth_min_trades').value) || 10,
    maxDD: parseInt(document.getElementById('c_synth_max_dd').value) || 100,
    minWR: parseFloat(document.getElementById('c_synth_min_wr').value) || 0,
    minSig: parseFloat(document.getElementById('c_synth_min_sig').value) || 0,
    targetCount: parseInt(document.getElementById('c_synth_target_count').value) || 1000,
    maxIter: parseInt(document.getElementById('c_synth_max_iter').value) || 50000,
    gamma: parseFloat(document.getElementById('c_synth_gamma').value) || 0.25,
    weights: {
      gt: parseFloat(document.getElementById('c_synth_weight_gt').value) || 0.5,
      sortino: parseFloat(document.getElementById('c_synth_weight_sortino').value) || 0.3,
      sig: parseFloat(document.getElementById('c_synth_weight_sig').value) || 0.2,
    },
    startMode: document.getElementById('c_synth_start_mode').value || 'zero',
    saveHistory: document.getElementById('c_synth_save_history').checked,
  };

  if (document.getElementById('c_synth_metric_gt').checked) opts.metrics.push('gt');
  if (document.getElementById('c_synth_metric_sortino').checked) opts.metrics.push('sortino');
  if (document.getElementById('c_synth_metric_sig').checked) opts.metrics.push('sig');

  if (opts.metrics.length === 0) {
    alert('Выбери хотя бы одну целевую метрику');
    return;
  }

  localStorage.setItem('synthesis-settings', JSON.stringify(opts));
  closeSynthesisModal();

  optMode = 'synthesis';
  synthesisModeOptions = opts;
  await runOpt();
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
