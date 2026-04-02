// ── ИДЕЯ 3: Массовый OOS-скан всех видимых результатов
let _oosScanRunning = false;
async function runOOSScan() {
  if (_oosScanRunning) { _oosScanRunning = false; return; }
  if (!DATA || !_visibleResults.length) return;
  _oosScanRunning = true;
  _hcRobRunning = true; // разрешаем runRobustScoreFor работать (иначе _stopCheck()=true сразу)
  const btn = document.getElementById('btn-oos-scan');
  const status = document.getElementById('oos-scan-status');
  if (btn) btn.textContent = '⏹ Стоп';
  const toScan = _getPreRunFiltered();
  const N = DATA.length, cut = Math.floor(N * 0.8);
  let done = 0, passed = 0;
  for (const r of toScan) {
    if (!_oosScanRunning) break;
    const origData = DATA;
    DATA = origData.slice(cut);
    const rOOS = _hcRunBacktest(r.cfg);
    DATA = origData;
    const oosOk = rOOS && rOOS.n >= 3 && rOOS.pnl > 0;
    if (oosOk) {
      const { score, details } = await runRobustScoreForDetailed(r, ['oos','walk','param','noise','mc'], true);
      r.robScore = score; r.robMax = 5; r.robDetails = details;
      const ri = results.findIndex(x => x.name === r.name);
      if (ri >= 0) { results[ri].robScore = score; results[ri].robMax = 5; results[ri].robDetails = details; }
      if (score >= 1) passed++;
    } else {
      if (r.robScore === undefined) r.robScore = 0;
    }
    done++;
    if (status) status.textContent = `${done}/${toScan.length} | ≥1🛡: ${passed}`;
    if (done % 3 === 0) { await yieldToUI(); _updateHCSrcCounts(); }
  }
  _oosScanRunning = false;
  _hcRobRunning = false;
  if (btn) btn.textContent = '🔎 OOS-скан';
  if (status) status.textContent = `✅ ${done} проверено | ≥1🛡: ${passed} | Кэш: ${_robCache.size}`;
  _updateHCSrcCounts();
  applyFilters(true);
}

function _updateHCSrcCounts() {
  const visCnt = document.getElementById('hc_src_vis_cnt');
  const favCnt = document.getElementById('hc_src_fav_cnt');
  const robCnt = document.getElementById('hc_src_rob_cnt');
  if (visCnt) visCnt.textContent = _visibleResults.length;
  if (favCnt) favCnt.textContent = favourites.length;
  if (robCnt) {
    const minR = parseInt(document.getElementById('hc_src_rob_min')?.value) || 3;
    const cnt = results.filter(r => r.robScore !== undefined && r.robScore >= minR).length;
    robCnt.textContent = cnt;
  }
}


// ─────────────────────────────────────────────────────────────────
// НАСТРАИВАЕМЫЕ КОЛОНКИ ТАБЛИЦЫ
// ─────────────────────────────────────────────────────────────────
const _COL_DEFS = [
  { id: 'col-fav',        label: '⭐ Избранное',        default: true },
  { id: 'col-pnl',        label: 'PnL%',                default: true },
  { id: 'col-wr',         label: 'WR%',                 default: true },
  { id: 'col-n',          label: '# сделок',            default: true },
  { id: 'col-dd',         label: 'DD%',                 default: true },
  { id: 'col-pdd',        label: 'P/DD',                default: true },
  { id: 'col-sig',        label: 'Sig%',                default: true },
  { id: 'col-gt',         label: 'GT-Score',            default: true },
  { id: 'col-cvr',        label: 'CVR%',                default: true },
  { id: 'col-sor',        label: 'Sortino',             default: true },  // ##SOR
  { id: 'col-kr',         label: 'K-Ratio',             default: true },  // ##KR
  { id: 'col-sqn',        label: 'SQN',                 default: true },  // ##SQN
  { id: 'col-omg',        label: 'Omega',               default: true },  // ##OMG
  { id: 'col-pain',       label: 'Pain',                default: true },  // ##PAIN
  { id: 'col-burke',      label: 'Burke',               default: true },  // ##BURKE
  { id: 'col-srnty',      label: 'Serenity',            default: true },  // ##SRNTY
  { id: 'col-ir',         label: 'IR',                  default: true },  // ##IR
  { id: 'col-ml',         label: 'ML-фильтр',           default: true },  // ##ML_FILTER
  { id: 'col-cpcv',       label: 'CPCV%',               default: false }, // ##CPCV lazy
  { id: 'col-avg',        label: 'Avg%',                default: true },
  { id: 'col-p1',         label: '1п PnL',              default: true },
  { id: 'col-p2',         label: '2п PnL',              default: false },
  { id: 'col-dwr',        label: 'ΔWR',                 default: true },
  { id: 'col-split',      label: 'Split',               default: true },
  { id: 'col-ls',          label: 'L/S Split',           default: true },
  { id: 'col-tv-score',   label: 'TV рейтинг',          default: true },
  { id: 'col-tv-dpnl',    label: 'ΔPnL TV',             default: true },
  { id: 'col-tv-ddd',     label: 'ΔDD TV',              default: true },
  { id: 'col-tv-dpdd',    label: 'ΔP/DD TV',            default: true },
  { id: 'col-rob',        label: 'Rob (итого)',         default: true },
  { id: 'col-rob-oos',    label: '🔬 OOS',              default: true },
  { id: 'col-rob-walk',   label: '🔬 Walk-Forward',    default: true },
  { id: 'col-rob-param',  label: '🔬 Param',            default: true },
  { id: 'col-rob-noise',  label: '🔬 Noise',            default: true },
  { id: 'col-rob-mc',     label: '🔬 MC',               default: true },
];

// OOS таблица столбики (аналогично _COL_DEFS)
const _OOS_COL_DEFS = [
  { id: 'oos-col-fav',     label: '⭐ Избранное',      default: true },
  { id: 'oos-col-pnl',     label: 'PnL%',              default: true },
  { id: 'oos-col-dd',      label: 'DD%',               default: true },
  { id: 'oos-col-pdd',     label: 'P/DD',              default: true },
  { id: 'oos-col-apt',     label: 'Avg/tr',            default: true },
  { id: 'oos-col-wr',      label: 'WR%',               default: true },
  { id: 'oos-col-kr',      label: 'K-Ratio',           default: true },
  { id: 'oos-col-n',       label: '# сделок',          default: true },
  { id: 'oos-col-rate',    label: 'Rate%',             default: true },
  { id: 'oos-col-score',   label: 'Оценка',            default: true },
];

let _colSettings = null; // null = не загружен
let _oosColSettings = null; // null = не загружен

function _loadColSettings() {
  try {
    const saved = localStorage.getItem('use_col_settings');
    if (saved) return JSON.parse(saved);
  } catch(e) {}
  // Дефолт
  const def = {};
  _COL_DEFS.forEach(c => def[c.id] = c.default);
  return def;
}

function _saveColSettings(settings) {
  try { localStorage.setItem('use_col_settings', JSON.stringify(settings)); } catch(e) {}
}

function _applyColSettings(settings) {
  // ОПТИМИЗАЦИЯ: если все колонки видимы — пропускаем querySelectorAll (дефолт после рендера)
  const hiddenCols = _COL_DEFS.filter(col => settings[col.id] === false);
  if (hiddenCols.length === 0) return;
  // Применяем показ/скрытие через CSS класс col-hidden только для изменённых колонок
  _COL_DEFS.forEach(col => {
    const visible = settings[col.id] !== false;
    document.querySelectorAll('.' + col.id).forEach(el => {
      el.classList.toggle('col-hidden', !visible);
    });
  });
}

function getColSettings() {
  if (!_colSettings) _colSettings = _loadColSettings();
  return _colSettings;
}

function setColVisible(colId, visible) {
  const s = getColSettings();
  s[colId] = visible;
  _colSettings = s;
  _saveColSettings(s);
  _applyColSettings(s);
}

let _colPanelOpen = false;
function toggleColSettings() {
  const btn = document.getElementById('col-settings-btn');
  if (!btn) return;
  // Убираем старую панель
  const oldPanel = document.getElementById('col-settings-panel');
  if (oldPanel) { oldPanel.remove(); _colPanelOpen = false; return; }
  _colPanelOpen = true;
  const settings = getColSettings();
  const panel = document.createElement('div');
  panel.id = 'col-settings-panel';
  panel.innerHTML = '<div style="font-weight:600;margin-bottom:6px;color:var(--text3);font-size:.9em">Столбики таблицы</div>' +
    _COL_DEFS.map(col => {
      const checked = settings[col.id] !== false ? 'checked' : '';
      return `<label><input type="checkbox" ${checked} onchange="setColVisible('${col.id}',this.checked)"> ${col.label}</label>`;
    }).join('') +
    '<div style="margin-top:8px;display:flex;gap:6px">' +
    '<button class="tpl-btn2" style="font-size:.8em;padding:2px 6px" onclick="_colShowAll()">Все</button>' +
    '<button class="tpl-btn2" style="font-size:.8em;padding:2px 6px" onclick="_colHideRob()">Скрыть тесты</button>' +
    '</div>';
  // Позиционируем относительно кнопки
  const rect = btn.getBoundingClientRect();
  const tbl = btn.closest('table');
  if (tbl) {
    const tblRect = tbl.getBoundingClientRect();
    panel.style.position = 'fixed';
    panel.style.top = (rect.bottom + 4) + 'px';
    // Проверяем место вправо, если не влазит - позиционируем влево
    const panelWidth = 280; // примерная ширина панели
    const rightSpace = window.innerWidth - rect.right;
    if (rightSpace < panelWidth) {
      // Позиционируем от левого края кнопки
      panel.style.left = (rect.left - panelWidth + rect.width) + 'px';
      panel.style.right = 'auto';
    } else {
      // Позиционируем от правого края
      panel.style.right = (window.innerWidth - rect.right) + 'px';
      panel.style.left = 'auto';
    }
  }
  document.body.appendChild(panel);
  // Закрыть при клике вне
  setTimeout(() => {
    document.addEventListener('click', function _closePanel(e) {
      if (!panel.contains(e.target) && e.target.id !== 'col-settings-btn') {
        panel.remove(); _colPanelOpen = false;
        document.removeEventListener('click', _closePanel);
      }
    });
  }, 50);
}

function _colShowAll() {
  _COL_DEFS.forEach(c => setColVisible(c.id, true));
  // Обновляем чекбоксы в панели
  document.querySelectorAll('#col-settings-panel input[type=checkbox]').forEach((cb,i) => cb.checked = true);
}
function _colHideRob() {
  ['col-rob-oos','col-rob-walk','col-rob-param','col-rob-noise','col-rob-mc'].forEach(c => setColVisible(c, false));
  document.querySelectorAll('#col-settings-panel input[type=checkbox]').forEach(cb => {
    const col = _COL_DEFS.find(c => c.label === cb.parentElement.textContent.trim());
  });
  toggleColSettings(); toggleColSettings(); // перерисовываем панель
}

// Инициализация при загрузке
function _initColSettings() {
  const s = getColSettings();
  _applyColSettings(s);
}

// ─────────────────────────────────────────────────────────────────
// OOS таблица — настраиваемые колонки
// ─────────────────────────────────────────────────────────────────

function _loadOOSColSettings() {
  try {
    const saved = localStorage.getItem('use_oos_col_settings');
    if (saved) return JSON.parse(saved);
  } catch(e) {}
  const def = {};
  _OOS_COL_DEFS.forEach(c => def[c.id] = c.default);
  return def;
}

function _saveOOSColSettings(settings) {
  try { localStorage.setItem('use_oos_col_settings', JSON.stringify(settings)); } catch(e) {}
}

function _applyOOSColSettings(settings) {
  const hiddenCols = _OOS_COL_DEFS.filter(col => settings[col.id] === false);
  if (hiddenCols.length === 0) return;
  _OOS_COL_DEFS.forEach(col => {
    const visible = settings[col.id] !== false;
    document.querySelectorAll('.' + col.id).forEach(el => {
      el.classList.toggle('col-hidden', !visible);
    });
  });
}

function getOOSColSettings() {
  if (!_oosColSettings) _oosColSettings = _loadOOSColSettings();
  return _oosColSettings;
}

function setOOSColVisible(colId, visible) {
  const s = getOOSColSettings();
  s[colId] = visible;
  _oosColSettings = s;
  _saveOOSColSettings(s);
  _applyOOSColSettings(s);
}

let _oosColPanelOpen = false;
function toggleOOSColSettings() {
  const btn = document.getElementById('oos-col-settings-btn');
  if (!btn) return;
  const oldPanel = document.getElementById('oos-col-settings-panel');
  if (oldPanel) { oldPanel.remove(); _oosColPanelOpen = false; return; }
  _oosColPanelOpen = true;
  const settings = getOOSColSettings();
  const panel = document.createElement('div');
  panel.id = 'oos-col-settings-panel';
  panel.innerHTML = '<div style="font-weight:600;margin-bottom:6px;color:var(--text3);font-size:.9em">Столбики OOS</div>' +
    _OOS_COL_DEFS.map(col => {
      const checked = settings[col.id] !== false ? 'checked' : '';
      return `<label><input type="checkbox" ${checked} onchange="setOOSColVisible('${col.id}',this.checked)"> ${col.label}</label>`;
    }).join('') +
    '<div style="margin-top:8px;display:flex;gap:6px">' +
    '<button class="tpl-btn2" style="font-size:.8em;padding:2px 6px" onclick="_oosColShowAll()">Все</button>' +
    '</div>';
  const rect = btn.getBoundingClientRect();
  panel.style.position = 'fixed';
  panel.style.top = (rect.bottom + 4) + 'px';
  const panelWidth = 240;
  const rightSpace = window.innerWidth - rect.right;
  if (rightSpace < panelWidth) {
    panel.style.left = (rect.left - panelWidth + rect.width) + 'px';
    panel.style.right = 'auto';
  } else {
    panel.style.right = (window.innerWidth - rect.right) + 'px';
    panel.style.left = 'auto';
  }
  document.body.appendChild(panel);
  setTimeout(() => {
    document.addEventListener('click', function _closePanelOOS(e) {
      if (!panel.contains(e.target) && e.target.id !== 'oos-col-settings-btn') {
        panel.remove(); _oosColPanelOpen = false;
        document.removeEventListener('click', _closePanelOOS);
      }
    });
  }, 50);
}

function _oosColShowAll() {
  _OOS_COL_DEFS.forEach(c => setOOSColVisible(c.id, true));
  document.querySelectorAll('#oos-col-settings-panel input[type=checkbox]').forEach((cb,i) => cb.checked = true);
}

function _initOOSColSettings() {
  const s = getOOSColSettings();
  _applyOOSColSettings(s);
}

// ============================================================
// OOS COMPARE — сравнение избранных стратегий на новых данных
// ============================================================
let _oosCompareData = []; // результаты последнего сравнения

// Загружает новый CSV в NEW_DATA
function loadNewData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const text = e.target.result;
    // Парсим так же как основные данные
    const lines = text.trim().split('\n');
    const hdr = lines[0].toLowerCase().split(',');
    const oi = hdr.findIndex(h => h.includes('open'));
    const hi = hdr.findIndex(h => h.includes('high'));
    const li = hdr.findIndex(h => h.includes('low'));
    const ci = hdr.findIndex(h => h.includes('close'));
    const ti = hdr.findIndex(h => h.includes('time'));
    const vi = hdr.findIndex(h => h.toLowerCase() === 'volume' || h.toLowerCase().includes('vol'));
    if (oi < 0 || hi < 0 || li < 0 || ci < 0) {
      alert('Файл не содержит колонок OHLC. Проверьте формат CSV.');
      return;
    }
    NEW_DATA = [];
    for (let i = 1; i < lines.length; i++) {
      const c = lines[i].split(',');
      if (c.length < 4) continue;
      const o = parseFloat(c[oi]), h2 = parseFloat(c[hi]), l2 = parseFloat(c[li]), cl = parseFloat(c[ci]);
      if (isNaN(o) || isNaN(h2) || isNaN(l2) || isNaN(cl)) continue;
      const bar = { o, h: h2, l: l2, c: cl };
      if (ti >= 0 && c[ti]) bar.t = c[ti].trim().replace(/"/g,'');
      if (vi >= 0) bar.v = parseFloat(c[vi]) || 0;
      NEW_DATA.push(bar);
    }
    if (NEW_DATA.length < 10) {
      alert('Слишком мало данных в файле: ' + NEW_DATA.length + ' баров');
      NEW_DATA = null;
      return;
    }
    const infoEl = document.getElementById('new-data-info');
    if (infoEl) {
      const first = NEW_DATA[0].t || '—';
      const last  = NEW_DATA[NEW_DATA.length-1].t || '—';
      infoEl.textContent = `✅ ${file.name} · ${NEW_DATA.length} баров · ${first} → ${last}`;
      infoEl.style.color = 'var(--green)';
    }
    const btn = document.getElementById('btn-oos-new');
    if (btn) btn.style.display = '';
    // Обновляем счётчик и кнопки
    _updateTableModeCounts();
    // Сбрасываем предыдущие результаты
    _oosCompareData = [];
  };
  reader.readAsText(file);
}

// (runOOSOnNewData перенесена в блок OOS COMPARE ниже)

function openOOSCompareModal() {
  // Мета-информация
  const metaEl = document.getElementById('oos-cmp-meta');
  if (metaEl) {
    const oldFirst = DATA.length   > 0 ? (DATA[0].t   || '?') : '?';
    const oldLast  = DATA.length   > 0 ? (DATA[DATA.length-1].t   || '?') : '?';
    const newFirst = NEW_DATA && NEW_DATA.length > 0 ? (NEW_DATA[0].t || '?') : '?';
    const newLast  = NEW_DATA && NEW_DATA.length > 0 ? (NEW_DATA[NEW_DATA.length-1].t || '?') : '?';
    metaEl.innerHTML =
      `<span style="color:var(--text2)">📊 Старые: <b style="color:var(--text)">${DATA.length} баров</b> (${oldFirst} → ${oldLast})</span>` +
      `<span style="color:var(--text2)">🆕 Новые: <b style="color:var(--text)">${NEW_DATA ? NEW_DATA.length : 0} баров</b> (${newFirst} → ${newLast})</span>` +
      `<span style="color:var(--text2)">Стратегий: <b style="color:var(--accent)">${_oosCompareData.length}</b></span>`;
  }
  sortOOSCompare();
  document.getElementById('oos-compare-overlay').classList.add('open');
}

function sortOOSCompare() {
  const sortKey = document.getElementById('oos-cmp-sort')?.value || 'delta_pnl';
  const onlyPos = document.getElementById('oos-cmp-only-pos')?.checked;

  let data = [..._oosCompareData];
  if (onlyPos) data = data.filter(r => r.new_pnl !== null && r.new_pnl > 0);

  data.sort((a, b) => {
    const av = a[sortKey] ?? -Infinity;
    const bv = b[sortKey] ?? -Infinity;
    if (sortKey === 'name') return String(av).localeCompare(String(bv));
    return bv - av;
  });

  const fmt = (v, digits=1) => v === null || v === undefined ? '—' : (v >= 0 ? '+' : '') + v.toFixed(digits);
  const fmtPlain = (v, digits=1) => v === null || v === undefined ? '—' : v.toFixed(digits);
  const deltaCls = v => v === null ? 'neu' : v > 0.5 ? 'up' : v < -0.5 ? 'dn' : 'neu';
  const score = r => {
    if (r.new_pnl === null) return '❓';
    if (r.new_pnl > 0 && r.delta_pnl >= 0) return '<span class="oos-cmp-badge up">✅ стабильна</span>';
    if (r.new_pnl > 0 && r.delta_pnl < 0)  return '<span class="oos-cmp-badge neu">⚠️ хуже, но +</span>';
    if (r.new_pnl <= 0 && r.old_pnl > 0)   return '<span class="oos-cmp-badge dn">❌ сломалась</span>';
    return '<span class="oos-cmp-badge dn">❌ убыток</span>';
  };

  let rows = '';
  for (const r of data) {
    const dc = deltaCls(r.delta_pnl);
    rows += `<tr>
      <td title="${r.name}">${r.name.slice(0,32)}</td>
      <td class="${r.old_pnl > 0 ? 'oos-cmp-up':'oos-cmp-dn'}">${fmtPlain(r.old_pnl)}%</td>
      <td class="${r.new_pnl > 0 ? 'oos-cmp-up':'oos-cmp-dn'}">${fmtPlain(r.new_pnl)}%</td>
      <td><span class="oos-cmp-badge ${dc}">${fmt(r.delta_pnl)}%</span></td>
      <td class="oos-cmp-neu">${fmtPlain(r.old_wr)}%</td>
      <td class="${r.new_wr >= 50 ? 'oos-cmp-up':'oos-cmp-neu'}">${fmtPlain(r.new_wr)}%</td>
      <td><span class="oos-cmp-badge ${deltaCls(r.delta_wr)}">${fmt(r.delta_wr)}%</span></td>
      <td class="oos-cmp-neu">${r.old_n ?? '—'}</td>
      <td class="oos-cmp-neu">${r.new_n ?? '—'}</td>
      <td>${score(r)}</td>
    </tr>`;
  }

  document.getElementById('oos-cmp-body').innerHTML = rows;

  // Сводка
  const pos   = data.filter(r => r.new_pnl > 0).length;
  const stable = data.filter(r => r.new_pnl > 0 && r.delta_pnl >= 0).length;
  const broken = data.filter(r => r.new_pnl !== null && r.new_pnl <= 0 && r.old_pnl > 0).length;
  const sumEl = document.getElementById('oos-cmp-summary');
  if (sumEl) sumEl.innerHTML =
    `Показано: <b>${data.length}</b> | ` +
    `<span class="oos-cmp-up">✅ Стабильны: ${stable}</span> | ` +
    `<span class="oos-cmp-neu">⚠️ Хуже но +: ${pos - stable}</span> | ` +
    `<span class="oos-cmp-dn">❌ Сломались: ${broken}</span>`;
}

function exportOOSCompareCSV() {
  const headers = ['Стратегия','PnL_old%','PnL_new%','ΔPnL','WR_old%','WR_new%','ΔWR','N_old','N_new'];
  const rows = _oosCompareData.map(r => [
    '"' + r.name.replace(/"/g,'""') + '"',
    r.old_pnl?.toFixed(2) ?? '',
    r.new_pnl?.toFixed(2) ?? '',
    r.delta_pnl?.toFixed(2) ?? '',
    r.old_wr?.toFixed(1) ?? '',
    r.new_wr?.toFixed(1) ?? '',
    r.delta_wr?.toFixed(1) ?? '',
    r.old_n ?? '',
    r.new_n ?? ''
  ].join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'oos_compare.csv'; a.click();
  URL.revokeObjectURL(url);
}



// ============================================================
// OOS COMPARE — вкладка основной таблицы
// ============================================================

// Сохранённые оригинальные заголовки (для восстановления)
let _origHeaders = null;

// Переключает заголовки таблицы под OOS-режим или восстанавливает оригинальные
function _applyOOSHeaders(oosMode) {
  const headerRow = document.getElementById('tbl-header-row');
  const filterRow = document.getElementById('filter-row');
  if (!headerRow) return;

  if (oosMode) {
    // Сохраняем оригинал один раз
    if (!_origHeaders) {
      _origHeaders = {
        header: headerRow.innerHTML,
        filter: filterRow ? filterRow.innerHTML : ''
      };
    }
    // OOS-заголовки
    // Подписи периодов в tooltip
    const nOld = DATA ? DATA.length : 0, nNew = NEW_DATA ? NEW_DATA.length : 0;
    headerRow.innerHTML = `
      <th onclick="doOOSSort('name')" style="min-width:120px;resize:horizontal;overflow:auto">Стратегия ↕</th>
      <th class="col-fav" style="width:26px">⭐</th>
      <th class="oos-th-hist" onclick="doOOSSort('old_pnl')" style="min-width:58px;resize:horizontal;overflow:auto" title="PnL ист (${nOld} баров)">PnL% ист ↕</th>
      <th class="oos-th-new"  onclick="doOOSSort('new_pnl')" style="min-width:58px;resize:horizontal;overflow:auto" title="PnL нов (${nNew} баров)">PnL% нов ↕</th>
      <th class="oos-th-delta" onclick="doOOSSort('delta_pnl')" style="min-width:54px;resize:horizontal;overflow:auto">ΔPnL ↕</th>
      <th class="oos-th-hist" onclick="doOOSSort('apt_old')" style="min-width:60px;resize:horizontal;overflow:auto" title="Ср. PnL% на сделку — история">Avg/tr ист ↕</th>
      <th class="oos-th-new"  onclick="doOOSSort('apt_new')" style="min-width:60px;resize:horizontal;overflow:auto" title="Ср. PnL% на сделку — новые">Avg/tr нов ↕</th>
      <th class="oos-th-delta" onclick="doOOSSort('delta_apt')" style="min-width:56px;resize:horizontal;overflow:auto">ΔAvg/tr ↕</th>
      <th class="oos-th-hist" onclick="doOOSSort('old_wr')" style="min-width:50px;resize:horizontal;overflow:auto" title="WR — история">WR% ист ↕</th>
      <th class="oos-th-new"  onclick="doOOSSort('new_wr')" style="min-width:50px;resize:horizontal;overflow:auto" title="WR — новые">WR% нов ↕</th>
      <th class="oos-th-delta" onclick="doOOSSort('delta_wr')" style="min-width:44px;resize:horizontal;overflow:auto">ΔWR ↕</th>
      <th class="oos-th-hist" style="min-width:34px;resize:horizontal;overflow:auto" title="Сделок ист (${nOld} баров)"># ист</th>
      <th class="oos-th-new"  style="min-width:34px;resize:horizontal;overflow:auto" title="Сделок нов (${nNew} баров)"># нов</th>
      <th onclick="doOOSSort('score')" style="min-width:86px;resize:horizontal;overflow:auto">Оценка ↕</th>
    `;
    if (filterRow) filterRow.style.display = 'none';
    // OOS: только горизонтальный скролл — без fixed layout
    const tblScroll = document.querySelector('.tbl-scroll');
    if (tblScroll) tblScroll.style.overflowX = 'auto';
    const rtbl = document.getElementById('rtbl');
    if (rtbl) rtbl.classList.add('oos-mode-active');
  } else {
    // Восстанавливаем оригинал
    if (_origHeaders) {
      headerRow.innerHTML = _origHeaders.header;
      if (filterRow) {
        filterRow.innerHTML = _origHeaders.filter;
        filterRow.style.display = '';
      }
      _origHeaders = null;
      // Переподвешиваем делегированный обработчик сортировки
      // (innerHTML = ... уничтожает все event listeners на дочерних элементах,
      //  но сам headerRow остаётся — переподвешиваем на него)
      _attachSortListener(headerRow);
    }
    const tblScroll = document.querySelector('.tbl-scroll');
    if (tblScroll) tblScroll.style.overflowX = '';
    const rtbl = document.getElementById('rtbl');
    if (rtbl) rtbl.classList.remove('oos-mode-active');
  }
}

// Сортировка OOS-таблицы
let _oosSortKey = 'delta_pnl';
let _oosSortDir = -1; // -1 = desc

// ── OOS фильтрация (собственная, независимая от applyFilters) ─
function applyOOSFilters() {
  // УЛУЧШЕНИЕ: убедиться что основная таблица скрыта в OOS режиме
  const stdScroll = document.querySelector('.tbl-scroll');
  if (stdScroll) stdScroll.style.display = 'none';
  const oosTbl = document.getElementById('oos-tbl-wrap');
  if (oosTbl) oosTbl.style.display = '';

  const fname  = document.getElementById('oof_name')?.value.trim().toLowerCase() || '';
  const ffav   = document.getElementById('oof_fav')?.value || '';
  const fopnl  = parseFloat(document.getElementById('oof_opnl')?.value);
  const fnpnl  = parseFloat(document.getElementById('oof_npnl')?.value);
  const fdpnl  = parseFloat(document.getElementById('oof_dpnl')?.value);
  const foddd  = parseFloat(document.getElementById('oof_oddd')?.value);
  const fnddd  = parseFloat(document.getElementById('oof_nddd')?.value);
  const fopdd  = parseFloat(document.getElementById('oof_opdd')?.value);
  const fnpdd  = parseFloat(document.getElementById('oof_npdd')?.value);
  const fdapt  = parseFloat(document.getElementById('oof_dapt')?.value);
  const fdwr   = parseFloat(document.getElementById('oof_dwr')?.value);
  const fon    = parseFloat(document.getElementById('oof_on')?.value);
  const fnn    = parseFloat(document.getElementById('oof_nn')?.value);
  const fscore = document.getElementById('oof_score')?.value || '';
  const frate_min = parseFloat(document.getElementById('oof_rate_min')?.value);
  const frate_max = parseFloat(document.getElementById('oof_rate_max')?.value);

  const src = _oosTableResults.filter(r => {
    if (fname && !r.name.toLowerCase().includes(fname)) return false;
    if (ffav) {
      const oosLvl = getFavLevel(r.name);
      if (ffav === 'fav' && oosLvl === 0) return false;
      if (ffav === 'no' && oosLvl > 0) return false;
    }
    if (!isNaN(fopnl) && (r.old_pnl ?? -Infinity) < fopnl) return false;
    if (!isNaN(fnpnl) && (r.new_pnl ?? -Infinity) < fnpnl) return false;
    if (!isNaN(fdpnl) && (r.delta_pnl ?? -Infinity) < fdpnl) return false;
    if (!isNaN(foddd) && (r.old_dd ?? Infinity) > foddd) return false;
    if (!isNaN(fnddd) && (r.new_dd ?? Infinity) > fnddd) return false;
    if (!isNaN(fopdd) && (r.old_pdd ?? -Infinity) < fopdd) return false;
    if (!isNaN(fnpdd) && (r.new_pdd ?? -Infinity) < fnpdd) return false;
    if (!isNaN(fon)   && (r.old_n ?? -Infinity) < fon) return false;
    if (!isNaN(fnn)   && (r.new_n ?? -Infinity) < fnn) return false;
    if (!isNaN(fdapt) || !isNaN(fdwr)) {
      const ao = r.old_n > 0 ? r.old_pnl / r.old_n : null;
      const an = r.new_n > 0 ? r.new_pnl / r.new_n : null;
      if (!isNaN(fdapt)) { const da = (ao!=null&&an!=null)?an-ao:null; if(da==null||da<fdapt) return false; }
      if (!isNaN(fdwr) && (r.delta_wr ?? -Infinity) < fdwr) return false;
    }
    if (!isNaN(frate_min) && (r.rate == null || r.rate < frate_min)) return false;
    if (!isNaN(frate_max) && (r.rate == null || r.rate > frate_max)) return false;
    if (fscore) {
      const badge = _oosGetBadge(r);
      if (badge !== fscore) return false;
    }
    return true;
  });

  const tbody = document.getElementById('oos-tb');
  if (!tbody) return;

  // Обновляем _visibleResults для использования в selectRow() и фильтрах
  _visibleResults = src;

  // Применяем пагинацию как в основной таблице
  _totalPages = Math.max(1, Math.ceil(src.length / _pageSize));
  if (_curPage >= _totalPages) _curPage = _totalPages - 1;

  const start = _curPage * _pageSize;
  const end = Math.min(start + _pageSize, src.length);
  const page = src.slice(start, end);

  let html = '';
  for (let i = 0; i < page.length; i++) {
    const r = page[i];
    const globalIdx = _oosTableResults.indexOf(r);
    const oosLvl = getFavLevel(r.name);
    const isFavRow = oosLvl > 0;
    const fav = oosLvl > 0 ? '★' : '☆';
    const apt_old = (r.old_n > 0 && r.old_pnl != null) ? r.old_pnl / r.old_n : null;
    const apt_new = (r.new_n > 0 && r.new_pnl != null) ? r.new_pnl / r.new_n : null;
    const delta_apt = (apt_old != null && apt_new != null) ? apt_new - apt_old : null;
    const badge = _oosGetBadge(r);
    const lowConf = r.new_n != null && r.new_n < 10;
    let oosScore, oosCls;
    if (badge === 'b' && r.new_pnl == null) { oosScore = '—';                    oosCls = ''; }
    else if (badge === 's') { oosScore = (lowConf?'⚠️':'✅') + ' стабильна';      oosCls = 'oos-stable'; }
    else if (badge === 'w') { oosScore = '⚠️ хуже, но +';                        oosCls = 'oos-worse'; }
    else                    { oosScore = '❌ сломалась';                          oosCls = 'oos-broken'; }
    const f2 = v => v == null ? '—' : v.toFixed(2);
    const f1 = v => v == null ? '—' : v.toFixed(1);
    const pCls = v => v == null ? '' : v >= 0 ? 'pos' : 'neg';
    const dStr = (v,d=1) => v == null ? '—' : (v>=0?'+':'')+v.toFixed(d)+'%';
    const _esc = s => String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    html +=
      `<tr data-i="${globalIdx}" data-name="${_esc(r.name)}" class="${isFavRow?'fav-row':''}" onclick="drawOOSChart(${globalIdx},this)" ondblclick="showOOSDetail(${globalIdx})">` +
      `<td title="${_esc(r.name)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(r.name)}</td>` +
      `<td class="oos-col-fav" style="text-align:center;font-size:.9em" data-fav="${globalIdx}" data-level="${oosLvl}" onclick="toggleOOSFav(${globalIdx},event)">${fav}</td>` +
      `<td class="oos-col-pnl ${r.old_pnl!=null&&r.old_pnl>0?'pos':'neg'}">${f1(r.old_pnl)}%</td>` +
      `<td class="oos-col-pnl ${r.new_pnl!=null&&r.new_pnl>0?'pos':'neg'}">${f1(r.new_pnl)}%</td>` +
      `<td class="oos-col-pnl ${pCls(r.delta_pnl)}">${dStr(r.delta_pnl)}</td>` +
      `<td class="oos-col-dd ${r.old_dd!=null&&r.old_dd<50?'pos':'neg'}">${f1(r.old_dd)}%</td>` +
      `<td class="oos-col-dd ${r.new_dd!=null&&r.new_dd<50?'pos':'neg'}">${f1(r.new_dd)}%</td>` +
      `<td class="oos-col-dd ${pCls(r.delta_dd)}">${r.delta_dd != null ? (r.delta_dd >= 0 ? '+' : '') + r.delta_dd.toFixed(1) + '%' : '—'}</td>` +
      `<td class="oos-col-pdd ${pCls(r.old_pdd)}">${f2(r.old_pdd)}</td>` +
      `<td class="oos-col-pdd ${pCls(r.new_pdd)}">${f2(r.new_pdd)}</td>` +
      `<td class="oos-col-pdd ${pCls(r.delta_pdd)}">${r.delta_pdd != null ? (r.delta_pdd >= 0 ? '+' : '') + r.delta_pdd.toFixed(2) : '—'}</td>` +
      `<td class="oos-col-apt ${pCls(apt_old)}">${f2(apt_old)}%</td>` +
      `<td class="oos-col-apt ${pCls(apt_new)}">${f2(apt_new)}%</td>` +
      `<td class="oos-col-apt ${pCls(delta_apt)}">${dStr(delta_apt,2)}</td>` +
      `<td class="oos-col-wr muted">${f1(r.old_wr)}%</td>` +
      `<td class="oos-col-wr muted">${f1(r.new_wr)}%</td>` +
      `<td class="oos-col-wr ${pCls(r.delta_wr)}">${dStr(r.delta_wr)}</td>` +
      `<td class="oos-col-kr ${pCls(r.old_kRatio)}">${r.old_kRatio != null ? r.old_kRatio.toFixed(2) : '—'}</td>` +
      `<td class="oos-col-kr ${pCls(r.new_kRatio)}">${r.new_kRatio != null ? r.new_kRatio.toFixed(2) : '—'}</td>` +
      `<td class="oos-col-kr ${pCls(r.delta_kRatio)}">${r.delta_kRatio != null ? (r.delta_kRatio >= 0 ? '+' : '') + r.delta_kRatio.toFixed(2) : '—'}</td>` +
      `<td class="oos-col-n muted" style="text-align:center">${r.old_n??'—'}</td>` +
      `<td class="oos-col-n muted" style="text-align:center">${r.new_n??'—'}</td>` +
      `<td class="oos-col-rate ${r.rate==null?'':r.rate>=70?'pos':r.rate>=30?'warn':'neg'}" style="text-align:center" title="Скорость роста нов/ист × 100%. 100% = равная скорость">${r.rate!=null?Math.round(r.rate)+'%':'—'}</td>` +
      `<td class="oos-col-score" style="text-align:center"><span class="oos-badge ${badge} ${oosCls}">${oosScore}</span></td>` +
      `</tr>`;
  }
  tbody.innerHTML = html;

  // Обновляем пагинацию (как в renderVisibleResults)
  const pg = $('pagination');
  if (pg) {
    if (_totalPages <= 1) {
      pg.style.display = 'none';
    } else {
      pg.style.display = 'flex';
      $('pg-first').disabled = _curPage === 0;
      $('pg-prev').disabled  = _curPage === 0;
      $('pg-next').disabled  = _curPage >= _totalPages - 1;
      $('pg-last').disabled  = _curPage >= _totalPages - 1;
      // Страницы
      const winHalf = 3;
      let lo = Math.max(0, _curPage - winHalf);
      let hi = Math.min(_totalPages - 1, _curPage + winHalf);
      if (hi - lo < winHalf * 2) { lo = Math.max(0, hi - winHalf * 2); hi = Math.min(_totalPages - 1, lo + winHalf * 2); }
      let pgHtml = '';
      for (let p = lo; p <= hi; p++) {
        pgHtml += `<button class="pg-btn${p === _curPage ? ' active' : ''}" onclick="goPage(${p})">${p + 1}</button>`;
      }
      $('pg-pages').innerHTML = pgHtml;
      $('pg-info').textContent = `${start + 1}–${end} из ${src.length}`;
    }
  }

  _renderOOSSummary();
}

function _oosGetBadge(r) {
  if (r.new_pnl == null) return 'b';
  const thresh = (parseFloat(document.getElementById('oos-stable-thresh')?.value)||50)/100;
  const ao = r.old_n > 0 ? r.old_pnl / r.old_n : 0;
  const an = r.new_n > 0 ? r.new_pnl / r.new_n : 0;
  const ratio = ao > 0 ? an / ao : null;
  if (r.new_pnl > 0 && ratio != null && ratio >= thresh) return 's';
  if (r.new_pnl > 0) return 'w';
  return 'b';
}


// Детальный вид OOS результата
function showOOSDetail(idx) {
  const r = _oosTableResults[idx];
  if (!r || !r.cfg) return;
  showDetail(r);
}

// Диагностика OOS расхождений для текущего результата в detail панели
function openOOSDiagnostic() {
  const r = _robustResult;
  if (!r) { alert('Сначала откройте результат из таблицы'); return; }
  if (!_oosTableResults || _oosTableResults.length === 0) {
    alert('Сначала запустите сравнение OOS (Новые данные)');
    return;
  }

  // Найдем соответствующий результат в OOS таблице
  const oosR = _oosTableResults.find(or => or.name === r.name && or.cfg === r.cfg);
  if (!oosR || !oosR.old_pnl) {
    alert('Этот результат не найден в OOS сравнении');
    return;
  }

  // Генерируем текст диагностики
  let text = `${'='.repeat(70)}\n`;
  text += `📊 ДИАГНОСТИКА OOS: ${oosR.name}\n`;
  text += `${'='.repeat(70)}\n\n`;

  text += `⚠️ ВНИМАНИЕ: Это сравнение JS-бэктеста на двух наборах данных.\n`;
  text += `Чтобы сравнить с РЕАЛЬНЫМИ данными TradingView, загрузите TV CSV выше.\n\n`;

  text += `📍 ИСХОДНЫЙ ПЕРИОД (История · все 100% данных):\n`;
  text += `   PnL: ${(oosR.old_pnl ?? '—').toFixed(2)}% | WR: ${(oosR.old_wr ?? '—').toFixed(1)}% | Сделок: ${oosR.old_n ?? '—'} | DD: ${(oosR.old_dd ?? '—').toFixed(2)}% | P/DD: ${(oosR.old_pdd ?? '—').toFixed(2)}\n\n`;

  text += `📍 НОВЫЙ ПЕРИОД (Загруженные данные · новый набор):\n`;
  text += `   PnL: ${(oosR.new_pnl ?? '—').toFixed(2)}% | WR: ${(oosR.new_wr ?? '—').toFixed(1)}% | Сделок: ${oosR.new_n ?? '—'} | DD: ${(oosR.new_dd ?? '—').toFixed(2)}% | P/DD: ${(oosR.new_pdd ?? '—').toFixed(2)}\n\n`;

  text += `📊 ДЕЛЬТА (изменения новые - исходные):\n`;
  if (oosR.old_pnl != null && oosR.new_pnl != null) {
    const dPnl = oosR.new_pnl - oosR.old_pnl;
    const status = dPnl > 0 ? '✅' : dPnl < 0 ? '❌' : '⚪';
    text += `   ΔPnL: ${dPnl >= 0 ? '+' : ''}${dPnl.toFixed(2)}% ${status}\n`;
  }
  if (oosR.old_wr != null && oosR.new_wr != null) {
    const dWr = oosR.new_wr - oosR.old_wr;
    const status = Math.abs(dWr) > 10 ? '⚠️' : '✅';
    text += `   ΔWR: ${dWr >= 0 ? '+' : ''}${dWr.toFixed(1)}% ${status}\n`;
  }
  if (oosR.old_n != null && oosR.new_n != null) {
    const dN = oosR.new_n - oosR.old_n;
    const status = dN < 0 ? '⚠️' : '✅';
    text += `   ΔТрейдов: ${dN >= 0 ? '+' : ''}${dN} ${status}\n`;
  }
  if (oosR.old_dd != null && oosR.new_dd != null) {
    const dDd = oosR.new_dd - oosR.old_dd;
    const status = dDd > 10 ? '❌' : dDd > 0 ? '⚠️' : '✅';
    text += `   ΔDD: ${dDd >= 0 ? '+' : ''}${dDd.toFixed(2)}% ${status}\n`;
  }
  text += `\n`;

  text += `💡 ИНТЕРПРЕТАЦИЯ:\n`;
  if (oosR.old_pnl != null && oosR.new_pnl != null) {
    const dPnl = oosR.new_pnl - oosR.old_pnl;
    if (dPnl < -50) {
      text += `   ❌ КРИТИЧЕСКОЕ ПАДЕНИЕ прибыли на ${Math.abs(dPnl).toFixed(1)}%\n`;
      text += `      → Стратегия работала только на исходных данных\n`;
      text += `      → Параметры переоптимизированы\n`;
    } else if (dPnl < -10) {
      text += `   ⚠️  Значительное снижение прибыли на ${Math.abs(dPnl).toFixed(1)}%\n`;
      text += `      → Проверить условия рынка и волатильность на новом периоде\n`;
    } else if (dPnl > 20) {
      text += `   ✅ Улучшение результатов на +${dPnl.toFixed(1)}%\n`;
      text += `      → Стратегия адаптируется к новым условиям\n`;
    } else {
      text += `   ⚠️  Небольшое изменение (${dPnl.toFixed(1)}%)\n`;
      text += `      → Стратегия относительно стабильна\n`;
    }
  }

  if (oosR.old_n != null && oosR.new_n != null) {
    const ratio = oosR.new_n / Math.max(oosR.old_n, 1);
    if (ratio < 0.3) {
      text += `   ❌ Кол-во сделок упало критически (${Math.round(ratio * 100)}%)\n`;
      text += `      → На новых данных отсутствуют условия для входа\n`;
    } else if (ratio < 0.7) {
      text += `   ⚠️  Кол-во сделок упало на ${Math.round((1 - ratio) * 100)}%\n`;
      text += `      → Проверить фильтры входа\n`;
    }
  }

  text += `\n⚡ ЧТО ДАЛЬШЕ?\n`;
  text += `1. Загрузите TV CSV (кнопка выше) для сравнения с реальностью\n`;
  text += `2. Если есть расхождения JS vs TV → это баг в расчётах\n`;
  text += `3. Если результаты похожи → параметры действительно переоптимизированы\n`;

  text += `\n📋 Параметры стратегии:\n`;
  const cfg = oosR.cfg || {};
  const cfgStr = JSON.stringify(cfg, null, 2);
  text += cfgStr + `\n\n`;
  text += `${'='.repeat(70)}\n`;

  // Открываем модальное окно
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.display = 'flex';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';
  modal.style.zIndex = 9999;
  modal.onclick = e => { if (e.target === modal) modal.remove(); };

  const content = document.createElement('div');
  content.style.cssText = 'background:var(--bg);border-radius:8px;padding:20px;max-width:800px;max-height:80vh;overflow:auto;border:1px solid var(--border)';

  content.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px">
      <h2 style="margin:0;color:var(--accent)">📊 OOS Диагностика</h2>
      <button onclick="this.closest('.modal-overlay').remove()" style="cursor:pointer;border:none;background:none;font-size:1.5em;color:var(--text3)">✕</button>
    </div>
    <pre style="margin:0;padding:12px;background:var(--bg2);border-radius:6px;border:1px solid var(--border);overflow:auto;max-height:50vh;font-size:.85em;color:var(--text2);font-family:monospace">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
    <div style="margin-top:15px;display:flex;gap:10px">
      <button class="tpl-btn2" style="padding:8px 16px;font-size:.9em;flex:1;border-color:#4ade80;color:#4ade80" onclick="navigator.clipboard.writeText(\`${text.replace(/`/g, '\\`')}\`).then(()=>{this.textContent='✅ Скопировано!';setTimeout(()=>this.textContent='📋 Копировать',2000)})">📋 Копировать</button>
    </div>
  `;

  modal.appendChild(content);
  document.body.appendChild(modal);
}

// Графическое сравнение equity: история (синий) + новые данные (оранжевый)
function drawOOSChart(idx, rowEl) {
  // Подсветить выбранную строку
  if (rowEl) {
    document.querySelectorAll('#oos-rtbl tr.sel').forEach(tr => tr.classList.remove('sel'));
    rowEl.classList.add('sel');
  }
  const wrap   = document.getElementById('oos-chart-wrap');
  const canvas = document.getElementById('oos-eqc');
  const eqWrap = document.getElementById('eq-wrap');
  if (!canvas || !wrap) return;
  const r = _oosTableResults[idx];
  // Синхронизируем _selectedIdx чтобы клавиатурная навигация шла с этой строки
  const visIdx = _visibleResults.indexOf(r);
  if (visIdx >= 0) _selectedIdx = visIdx;
  if (!r || !r.old_eq || !r.old_eq.length || !r.new_eq || !r.new_eq.length) {
    wrap.style.display = 'none'; return;
  }
  // Скрываем основной график и показываем OOS
  if (eqWrap) eqWrap.style.display = 'none';
  wrap.style.display = 'block';
  document.body.classList.add('chart-active');

  const eq_old = r.old_eq;
  const eq_new = r.new_eq;

  // Определяем пересечение данных по timestamps
  let overlapIdx = 0; // индекс в NEW_DATA где начинаются новые бары без пересечения
  if (DATA && NEW_DATA && DATA.length > 0 && NEW_DATA.length > 0) {
    const lastOldT = DATA[DATA.length - 1].t;
    const firstNewT = NEW_DATA[0].t;

    if (lastOldT && firstNewT) {
      // Есть timestamps - ищем пересечение
      for (let i = 0; i < NEW_DATA.length; i++) {
        if (NEW_DATA[i].t && NEW_DATA[i].t > lastOldT) {
          overlapIdx = i;
          break;
        }
      }
    }
  }

  // Пропускаем пересекающиеся бары из eq_new
  let newEqClean = eq_new.slice(overlapIdx);

  // Рассчитаем прогрев для новых данных (игнорируем первые N баров)
  if (newEqClean && newEqClean.length > 0) {
    const cfg = r.cfg || {};
    // Минимальный прогрев: макс из MA, pivot, ATR периодов
    const maWarmup = cfg.useMA ? (cfg.maP || 20) : 0;
    const pivotWarmup = cfg.usePivot ? ((cfg.pvL || 5) + (cfg.pvR || 2) + 5) : 0;
    const atrWarmup = cfg.useATR ? (cfg.atrPeriod || 14) * 3 : 0;
    const warmup = Math.max(maWarmup, pivotWarmup, atrWarmup, 1);

    // Пропускаем первые warmup баров из equity кривой (убираем прогрев)
    const warmupEndIdx = Math.min(warmup, newEqClean.length - 1);
    if (warmupEndIdx > 0 && warmupEndIdx < newEqClean.length) {
      // Берём значение при окончании прогрева и смещаем
      const warmupValue = newEqClean[warmupEndIdx];
      newEqClean = newEqClean.slice(warmupEndIdx).map(v => v - warmupValue);
    }
  }

  // Concatenate: новый сегмент продолжает с последнего значения истории (без пересечения)
  const lastOld = eq_old[eq_old.length - 1];
  const combined = [...eq_old, ...newEqClean.map(v => v + lastOld)];
  const splitIdx  = eq_old.length;
  const splitFrac = (splitIdx - 1) / (combined.length - 1);

  const dpr = window.devicePixelRatio || 1;
  canvas.width  = canvas.offsetWidth  * dpr;
  canvas.height = canvas.offsetHeight * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const W = canvas.offsetWidth, H = canvas.offsetHeight;
  const pad = 16;

  ctx.fillStyle = '#080b10';
  ctx.fillRect(0, 0, W, H);

  // Диапазон значений
  let mn = 0, mx = 0;
  for (const v of combined) { if (v < mn) mn = v; if (v > mx) mx = v; }
  const range = mx - mn || 1;
  const toY = v => H - pad - ((v - mn) / range * (H - 2 * pad));

  // Сетка
  ctx.strokeStyle = 'rgba(30,42,56,0.8)'; ctx.lineWidth = 0.5;
  for (let i = 1; i < 4; i++) {
    const y = pad + (H - 2 * pad) * i / 4;
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke();
  }
  // Нулевая линия
  const zy = toY(0);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad, zy); ctx.lineTo(W - pad, zy); ctx.stroke();

  // Вертикальная линия разделения
  const sx = pad + (W - 2 * pad) * splitFrac;
  ctx.strokeStyle = 'rgba(255,160,40,0.6)'; ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(sx, pad - 4); ctx.lineTo(sx, H - pad + 4); ctx.stroke();
  ctx.setLineDash([]);
  // Подсветка зоны новых данных
  ctx.fillStyle = 'rgba(255,160,40,0.04)';
  ctx.fillRect(sx, pad, W - pad - sx, H - 2 * pad);

  const nPx  = W - 2 * pad;
  const nLst = Math.max(combined.length - 1, 1);
  const pxSp = Math.round(splitFrac * (nPx - 1)); // пиксель разделения

  // Функция пути по сегменту [pxA..pxB]
  function pathSeg(pxA, pxB) {
    ctx.beginPath();
    for (let px = pxA; px <= pxB; px++) {
      const i = Math.round(px * nLst / (nPx - 1));
      const x = pad + px, y = toY(combined[Math.min(i, combined.length - 1)]);
      px === pxA ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
  }

  // Заливка — история
  pathSeg(0, pxSp);
  ctx.lineTo(pad + pxSp, zy); ctx.lineTo(pad, zy); ctx.closePath();
  ctx.fillStyle = 'rgba(0,212,255,0.06)'; ctx.fill();

  // Заливка — новые данные
  pathSeg(pxSp, nPx - 1);
  ctx.lineTo(W - pad, zy); ctx.lineTo(pad + pxSp, zy); ctx.closePath();
  ctx.fillStyle = 'rgba(255,160,40,0.06)'; ctx.fill();

  // Линия — история
  pathSeg(0, pxSp);
  const gOld = ctx.createLinearGradient(pad, 0, pad + pxSp, 0);
  gOld.addColorStop(0, 'rgba(0,212,255,0.7)'); gOld.addColorStop(1, 'rgba(0,212,255,0.9)');
  ctx.strokeStyle = gOld; ctx.lineWidth = 1.5; ctx.stroke();

  // Линия — новые данные
  pathSeg(pxSp, nPx - 1);
  const gNew = ctx.createLinearGradient(pad + pxSp, 0, W - pad, 0);
  gNew.addColorStop(0, 'rgba(255,160,40,0.9)'); gNew.addColorStop(1, 'rgba(255,100,20,0.8)');
  ctx.strokeStyle = gNew; ctx.lineWidth = 1.5; ctx.stroke();

  // Подписи значений
  ctx.font = '9px JetBrains Mono,monospace';
  ctx.fillStyle = 'rgba(180,200,220,0.55)';
  ctx.fillText(mx.toFixed(1) + '%', 2, pad + 9);
  ctx.fillText(mn.toFixed(1) + '%', 2, H - pad - 2);

  // Легенда: история и новые
  const oldLbl = (r.old_pnl != null ? r.old_pnl.toFixed(1) : '?') + '%  n=' + (r.old_n ?? '?');
  const newLbl = (r.new_pnl != null ? r.new_pnl.toFixed(1) : '?') + '%  n=' + (r.new_n ?? '?');
  ctx.font = '9px JetBrains Mono,monospace';
  ctx.fillStyle = 'rgba(0,212,255,0.85)';
  ctx.fillText('▌ История: ' + oldLbl, pad + 2, pad - 2);
  ctx.fillStyle = 'rgba(255,160,40,0.9)';
  ctx.fillText('▌ Новые: ' + newLbl, sx + 6, pad - 2);

  // Имя стратегии внизу
  const nameShort = (r.name || '').slice(0, 60);
  ctx.fillStyle = 'rgba(0,212,255,0.45)';
  ctx.font = '8px JetBrains Mono,monospace';
  ctx.fillText(nameShort, pad, H - 4);

  // Сохраняем параметры графика для mouse tracking
  window._oosChartParams = { combined, mn, range, pad, W, H, splitFrac, splitIdx, dpr };

  // Добавляем mouse tracking к OOS crosshair canvas (уже отрисован в overlayе)
  const oosCharts = document.getElementById('oos-crosshair');
  if (oosCharts) {
    // Синхронизируем размер crosshair canvas с основным
    oosCharts.width = canvas.width;
    oosCharts.height = canvas.height;

    // Добавляем обработчики mouse (они будут работать на oosCharts overlay)
    oosCharts.addEventListener('mousemove', _drawOOSCrosshair, { once: false });
    oosCharts.addEventListener('mouseleave', _clearOOSCrosshair, { once: false });
  }

  // Показываем контролы baseline для OOS графика ##EQ_MA_FILTER##
  const baselineCtrl = document.getElementById('eq-baseline-controls');
  if (baselineCtrl) {
    if ((r.old_eqCalcBaselineArr && r.old_eqCalcBaselineArr.length) || (r.new_eqCalcBaselineArr && r.new_eqCalcBaselineArr.length)) {
      baselineCtrl.style.display = 'flex';
    } else {
      baselineCtrl.style.display = 'none';
    }
  }
}

// Функции mouse tracking для OOS графика
function _drawOOSCrosshair(e) {
  const p = window._oosChartParams;
  if (!p) return;
  const ch = e.target; // сам crosshair canvas
  if (!ch) return;

  const { combined, mn, range, pad, W, H, dpr: _dpr } = p;
  const dpr = _dpr || window.devicePixelRatio || 1;

  const rect = ch.getBoundingClientRect();

  // cx/cy в CSS-пикселях = координатное пространство графика (W=offsetWidth, H=offsetHeight)
  const cx = (e.clientX - rect.left) * (W / rect.width);
  const cy = (e.clientY - rect.top)  * (H / rect.height);

  if (cx < pad || cx > W - pad || cy < pad || cy > H - pad) {
    ch.getContext('2d').clearRect(0, 0, ch.width, ch.height);
    return;
  }

  const nPx = W - 2 * pad;
  const px = Math.max(0, Math.min(nPx - 1, Math.round(cx - pad)));
  const clampedIdx = Math.round(px * (combined.length - 1) / Math.max(nPx - 1, 1));
  const val = combined[clampedIdx];

  const valY = H - pad - ((val - mn) / range * (H - 2 * pad));
  const progress = clampedIdx / Math.max(combined.length - 1, 1);

  const ctx = ch.getContext('2d');
  ctx.clearRect(0, 0, ch.width, ch.height);
  ctx.save();
  ctx.scale(dpr, dpr);

  // Вертикальная линия
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 0.5;
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(cx, pad); ctx.lineTo(cx, H - pad); ctx.stroke();

  // Горизонтальная линия
  ctx.beginPath(); ctx.moveTo(pad, valY); ctx.lineTo(W - pad, valY); ctx.stroke();
  ctx.setLineDash([]);

  // Точка пересечения
  ctx.fillStyle = '#00e676';
  ctx.beginPath(); ctx.arc(cx, valY, 3, 0, Math.PI * 2); ctx.fill();

  // Метка значения Y (слева)
  const valTxt = (val >= 0 ? '+' : '') + val.toFixed(2) + '%';
  ctx.font = 'bold 8px JetBrains Mono,monospace';
  const tw = ctx.measureText(valTxt).width;
  const labelX = cx > W / 2 ? pad + 1 : W - pad - tw - 1;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(labelX - 1, valY - 9, tw + 2, 10);
  ctx.fillStyle = val >= 0 ? '#00e676' : '#ff3d57';
  ctx.fillText(valTxt, labelX, valY - 1);

  // Метка прогресса X (снизу)
  const pctTxt = Math.round(progress * 100) + '%  #' + (clampedIdx + 1);
  const pw = ctx.measureText(pctTxt).width;
  const labelXb = Math.min(W - pad - pw - 2, Math.max(pad, cx - pw / 2));
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(labelXb - 1, H - pad - 11, pw + 2, 10);
  ctx.fillStyle = 'rgba(200,220,240,0.85)';
  ctx.fillText(pctTxt, labelXb, H - pad - 3);

  ctx.restore();
}

function _clearOOSCrosshair() {
  const ch = document.getElementById('oos-crosshair');
  if (ch) ch.getContext('2d').clearRect(0, 0, ch.width, ch.height);
}

function doOOSSort(key) {
  if (_oosSortKey === key) _oosSortDir *= -1;
  else { _oosSortKey = key; _oosSortDir = -1; }
  _oosTableResults.sort((a, b) => {
    const av = _getOOSSortVal(a, key);
    const bv = _getOOSSortVal(b, key);
    if (typeof av === 'string') return _oosSortDir * av.localeCompare(bv);
    return _oosSortDir * ((av ?? -Infinity) - (bv ?? -Infinity));
  });
  applyFilters(true);
}

function _getOOSSortVal(r, key) {
  if (key === 'apt_old') return (r.old_n > 0 && r.old_pnl !== null) ? r.old_pnl / r.old_n : null;
  if (key === 'apt_new') return (r.new_n > 0 && r.new_pnl !== null) ? r.new_pnl / r.new_n : null;
  if (key === 'delta_apt') {
    const ao = (r.old_n > 0 && r.old_pnl !== null) ? r.old_pnl / r.old_n : null;
    const an = (r.new_n > 0 && r.new_pnl !== null) ? r.new_pnl / r.new_n : null;
    return (ao !== null && an !== null) ? an - ao : null;
  }
  if (key === 'apb_old') return (DATA && r.old_pnl !== null) ? r.old_pnl / DATA.length * 1000 : null;
  if (key === 'apb_new') return (NEW_DATA && r.new_pnl !== null) ? r.new_pnl / NEW_DATA.length * 1000 : null;
  if (key === 'delta_apb') {
    const ao = (DATA && r.old_pnl !== null) ? r.old_pnl / DATA.length * 1000 : null;
    const an = (NEW_DATA && r.new_pnl !== null) ? r.new_pnl / NEW_DATA.length * 1000 : null;
    return (ao !== null && an !== null) ? an - ao : null;
  }
  if (key === 'rate') return r.rate ?? null;
  if (key === 'score') {
    if (r.new_pnl > 0) {
      const ao = (r.old_n > 0) ? r.old_pnl / r.old_n : 0;
      const an = (r.new_n > 0) ? r.new_pnl / r.new_n : 0;
      return (ao > 0 && an !== null) ? an / ao : 0;
    }
    return -1;
  }
  return r[key] ?? null;
}

// Сводка под OOS-таблицей
function _renderOOSSummary() {
  const bar = document.getElementById('mass-rob-info');
  if (!bar) return;
  const _stableThresh = (parseFloat(document.getElementById('oos-stable-thresh')?.value) || 50) / 100;
  const stable  = _oosTableResults.filter(r => {
    const ao = r.old_n > 0 ? r.old_pnl / r.old_n : 0;
    const an = r.new_n > 0 ? r.new_pnl / r.new_n : 0;
    const apbO = DATA ? r.old_pnl / DATA.length : 0;
    const apbN = NEW_DATA ? r.new_pnl / NEW_DATA.length : 0;
    const aptOk = ao > 0 && an / ao >= _stableThresh;
    const apbOk = apbO > 0 && apbN / apbO >= _stableThresh;
    return r.new_pnl > 0 && (aptOk || apbOk);
  }).length;
  const pos     = _oosTableResults.filter(r => r.new_pnl > 0).length;
  const broken  = _oosTableResults.filter(r => r.new_pnl !== null && r.new_pnl <= 0 && r.old_pnl > 0).length;
  const newInfo = NEW_DATA ? `${NEW_DATA.length} баров` : '';
  bar.innerHTML = `📊 OOS: <b>${_oosTableResults.length}</b> стратегий | ` +
    `<span style="color:var(--green)">✅ стабильных: ${stable}</span> | ` +
    `<span style="color:var(--orange)">⚠️ хуже но +: ${pos - stable}</span> | ` +
    `<span style="color:var(--red)">❌ сломались: ${broken}</span>` +
    (newInfo ? ` | Новые данные: ${newInfo}` : '');
}

// Вспомогательная функция: maxDrawdown из массива equity
// (используется для чистых метрик нового периода в OOS)
function _calcDDFromEq(eq) {
  if (!eq || eq.length === 0) return 0;
  let peak = eq[0], dd = 0;
  for (const v of eq) {
    if (v > peak) peak = v;
    const cur = peak - v;
    if (cur > dd) dd = cur;
  }
  return dd;
}

// Запуск OOS-сравнения на выбранной выборке
async function runOOSOnNewData() {
  if (!NEW_DATA || NEW_DATA.length < 10) { alert('Сначала загрузите новые данные'); return; }
  if (!DATA || DATA.length < 10) { alert('Нет исходных данных'); return; }

  // Определяем источник — текущий режим таблицы
  let srcList = [];
  if (_tableMode === 'fav') {
    srcList = _getFavAsResults();
  } else if (_tableMode === 'hc') {
    srcList = _hcTableResults;
  } else if (_tableMode === 'oos') {
    // Уже в OOS — берём все результаты
    srcList = _oosTableResults.length > 0 ? _oosTableResults : results;
  } else {
    // results — берём видимые
    srcList = _visibleResults.length > 0 ? _visibleResults : results;
  }

  if (!srcList || srcList.length === 0) { alert('Нет результатов для сравнения'); return; }

  // Вычисляем overlapIdx один раз: первый бар NEW_DATA строго после конца DATA.
  // Бары до overlapIdx — пересечение с историей, их исключаем из метрик нового периода.
  // Если пересечения нет (NEW_DATA начинается после DATA) — overlapIdx = 0, поведение не меняется.
  let _overlapIdx = 0;
  if (DATA.length > 0 && NEW_DATA.length > 0) {
    const _lastOldT = DATA[DATA.length - 1].t;
    if (_lastOldT) {
      for (let _k = 0; _k < NEW_DATA.length; _k++) {
        if (NEW_DATA[_k].t && NEW_DATA[_k].t > _lastOldT) {
          _overlapIdx = _k;
          break;
        }
      }
    }
  }

  const progressEl = document.getElementById('oos-new-progress');
  const btnEl = document.getElementById('btn-oos-new');
  if (btnEl) btnEl.disabled = true;
  _oosTableResults = [];

  for (let i = 0; i < srcList.length; i++) {
    const r = srcList[i];
    if (!r.cfg) continue;
    if (progressEl) progressEl.textContent = `⏳ ${i+1}/${srcList.length}…`;
    if (i % 5 === 0) await yieldToUI();

    const origDATA = DATA;
    let rOld = null, rNew = null, _newTradeLog = [];

    // Пересчитываем ПОЛНЫЙ результат на исходных 100% данных (не IS часть)
    try {
      DATA = origDATA;
      rOld = _hcRunBacktest(r.cfg);
    } catch(e) { }

    // Для new результата: прямой запуск с tradeLog на полном NEW_DATA.
    // Полный датасет нужен для прогрева индикаторов (MA, ATR, Pivot).
    // Чистые метрики без пересечения вычисляются ниже через _overlapIdx.
    try {
      DATA = NEW_DATA;
      const _ind    = _calcIndicators(r.cfg);
      const _btCfg  = buildBtCfg(r.cfg, _ind);
      _btCfg.tradeLog = [];

      // ##EQ_MA_FILTER## Двухпроходный цикл для OOS новых данных
      if (rOld && rOld.eqCalcMAArr && rOld.eqCalcBaselineArr && r.cfg.useEqMA) {
        // Используем MA, рассчитанную от old (IS) данных для фильтрации на new (OOS)
        _btCfg.eqCalcMAArr = rOld.eqCalcMAArr;
        _btCfg.eqCalcBaselineArr = rOld.eqCalcBaselineArr;
      } else if (r.cfg.useEqMA) {
        // Если нет old результата, рассчитаем MA для new данных отдельно
        const _shadowCfg = JSON.parse(JSON.stringify(_btCfg));
        _shadowCfg.useEqMA = false;
        const _shadowRes = backtest(_ind.pvLo, _ind.pvHi, _ind.atrArr, _shadowCfg);
        if (_shadowRes && _shadowRes.eq && _shadowRes.eq.length > 0) {
          const maLen = r.cfg.eqMALen || 20;
          _btCfg.eqCalcMAArr = calcSMA(Array.from(_shadowRes.eq), maLen);
          _btCfg.eqCalcBaselineArr = Array.from(_shadowRes.eq);
        }
      }

      rNew = backtest(_ind.pvLo, _ind.pvHi, _ind.atrArr, _btCfg);
      _newTradeLog = _btCfg.tradeLog || [];
    } catch(e) { }
    DATA = origDATA;

    // Чистые метрики нового периода: только бары/сделки после overlapIdx
    let new_pnl = null, new_wr = null, new_n = null;
    let new_dd = null, new_pdd = null, new_kRatio = null;
    if (rNew && rNew.eq && rNew.eq.length > 0) {
      const _eq  = rNew.eq;
      const _oi  = Math.min(_overlapIdx, _eq.length - 1);
      const _eqS = _eq.slice(_oi);                         // equity только нового периода

      const _cleanT = _newTradeLog.filter(
        t => t.entryBar != null && t.entryBar >= _oi && t.exitBar != null
      );

      new_pnl    = _eq[_eq.length - 1] - (_eq[_oi] || 0);
      new_dd     = _calcDDFromEq(_eqS);
      new_pdd    = new_dd > 0 ? new_pnl / new_dd : null;
      new_n      = _cleanT.length;
      new_wr     = new_n > 0 ? _cleanT.filter(t => t.pnl > 0).length / new_n * 100 : null;
      new_kRatio = _calcKRatio(_eqS);
    }

    _oosTableResults.push({
      name:      r.name,
      cfg:       r.cfg,
      // Поля для стандартного рендера (pnl = old_pnl для детали/избранного)
      pnl:       rOld ? rOld.pnl : null,
      wr:        rOld ? rOld.wr  : null,
      n:         rOld ? rOld.n   : null,
      dd:        rOld ? rOld.dd  : null,
      pdd:       rOld && rOld.dd > 0 ? rOld.pnl / rOld.dd : null,
      avg:       rOld ? rOld.avg : null,
      dwr:       rOld ? rOld.dwr : null,
      p1:        rOld ? rOld.p1  : 0,
      p2:        rOld ? rOld.p2  : 0,
      // OOS-специфичные поля — история
      old_pnl:    rOld ? rOld.pnl : null,
      old_wr:     rOld ? rOld.wr  : null,
      old_n:      rOld ? rOld.n   : null,
      old_dd:     rOld ? rOld.dd  : null,
      old_pdd:    rOld && rOld.dd > 0 ? rOld.pnl / rOld.dd : null,
      old_kRatio: rOld && rOld.eq ? _calcKRatio(rOld.eq) : null,
      // OOS-специфичные поля — новый период (чистые, без пересечения)
      new_pnl,
      new_wr,
      new_n,
      new_dd,
      new_pdd,
      new_kRatio,
      // Дельты из чистых значений
      delta_pnl:    (rOld && new_pnl != null) ? new_pnl    - rOld.pnl : null,
      delta_wr:     (rOld && new_wr  != null) ? new_wr     - rOld.wr  : null,
      delta_dd:     (rOld && new_dd  != null) ? new_dd     - rOld.dd  : null,
      delta_pdd:    (rOld && rOld.dd > 0 && new_pdd != null) ? new_pdd - (rOld.pnl / rOld.dd) : null,
      delta_kRatio: (rOld && rOld.eq && new_kRatio != null) ? new_kRatio - (_calcKRatio(rOld.eq) ?? 0) : null,
      old_bars:  DATA ? DATA.length : null,
      new_bars:  NEW_DATA ? NEW_DATA.length : null,
      _overlapBars: _overlapIdx,               // для отладки: сколько баров пересечения
      rate: (() => {
        const _ob = DATA ? DATA.length : 0;
        const _nb = NEW_DATA ? (NEW_DATA.length - _overlapIdx) : 0;
        if (_ob > 0 && _nb > 0 && rOld && rOld.pnl > 0 && new_pnl != null) {
          return (new_pnl / _nb) / (rOld.pnl / _ob) * 100;
        }
        return null;
      })(),
      old_eq:    rOld ? rOld.eq  : null,       // equity curve на истории
      new_eq:    rNew ? rNew.eq  : null,       // equity curve на новых данных (полная, график обрезает сам)
      old_eqCalcBaselineArr: rOld ? rOld.eqCalcBaselineArr : null, // baseline (без MA фильтра) на истории ##EQ_MA_FILTER##
      new_eqCalcBaselineArr: rNew ? rNew.eqCalcBaselineArr : null, // baseline (без MA фильтра) на новых данных ##EQ_MA_FILTER##
    });
  }

  if (progressEl) progressEl.textContent = `✅ ${_oosTableResults.length} стратегий`;
  if (btnEl) btnEl.disabled = false;

  _updateTableModeCounts();
  switchTableMode('oos');
}

// Экспорт OOS результатов в CSV
function exportOOSTableCSV() {
  if (!_oosTableResults.length) return;
  const hdr = ['Стратегия','PnL_ист%','PnL_нов%','ΔPnL%','AvgTr_ист%','AvgTr_нов%','ΔAvgTr%','AvgBar_ист','AvgBar_нов','ΔAvgBar','WR_ист%','WR_нов%','ΔWR%','N_ист','N_нов'];
  const rows = _oosTableResults.map(r => {
    const ao = r.old_n > 0 ? r.old_pnl / r.old_n : null;
    const an = r.new_n > 0 ? r.new_pnl / r.new_n : null;
    const da = (ao !== null && an !== null) ? an - ao : null;
    const apbO = r.old_bars ? r.old_pnl / r.old_bars * 1000 : null;
    const apbN = r.new_bars ? r.new_pnl / r.new_bars * 1000 : null;
    const dapb = (apbO !== null && apbN !== null) ? apbN - apbO : null;
    return [
      '"'+r.name.replace(/"/g,'""')+'"',
      r.old_pnl?.toFixed(2)??'', r.new_pnl?.toFixed(2)??'', r.delta_pnl?.toFixed(2)??'',
      ao?.toFixed(3)??'', an?.toFixed(3)??'', da?.toFixed(3)??'',
      apbO?.toFixed(4)??'', apbN?.toFixed(4)??'', dapb?.toFixed(4)??'',
      r.old_wr?.toFixed(1)??'', r.new_wr?.toFixed(1)??'', r.delta_wr?.toFixed(1)??'',
      r.old_n??'', r.new_n??''
    ].join(',');
  });
  const blob = new Blob([[hdr.join(','),...rows].join('\n')],{type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'oos_compare.csv'; a.click();
}



