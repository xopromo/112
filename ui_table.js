// ============================================================
// RENDER
// ============================================================
// ── фильтры таблицы ──────────────────────────────────────────
let _visibleResults = []; // результаты после фильтрации
let sortDirs = {};        // направления сортировки по колонкам

// ============================================================
// РЕЖИМ ТАБЛИЦЫ — переключение между результатами/соседями/избранными
// ============================================================
let _tableMode = 'results'; // 'results' | 'hc' | 'fav' | 'oos'
let _oosTableResults = []; // OOS сравнение: результаты + new_pnl/wr/avg_per_trade
let _hcTableResults = []; // HC результаты в формате таблицы

function switchTableMode(mode) {
  _tableMode = mode;
  _curPage = 0;
  // Обновляем кнопки
  ['results','hc','fav','oos'].forEach(m => {
    const btn = document.getElementById('tbl-btn-' + m);
    if (btn) btn.classList.toggle('active', m === mode);
  });
  // Показываем/скрываем нужную таблицу и графики
  const stdScroll   = document.querySelector('.tbl-scroll');
  const oosTbl      = document.getElementById('oos-tbl-wrap');
  const eqWrap      = document.getElementById('eq-wrap');
  const oosChrtWrap = document.getElementById('oos-chart-wrap');
  if (mode === 'oos') {
    if (stdScroll)   stdScroll.style.display   = 'none';
    if (oosTbl)      oosTbl.style.display       = '';
    if (eqWrap)      eqWrap.style.display       = 'none'; // стандартный график скрыть
    document.body.classList.remove('chart-active');
    // OOS график покажет drawOOSChart при клике по строке
    // Инициализация настроек столбиков OOS
    _initOOSColSettings();
    // Подвесить слушатель на кнопку настроек
    const oosColBtn = document.getElementById('oos-col-settings-btn');
    if (oosColBtn) {
      oosColBtn.onclick = toggleOOSColSettings;
    }
  } else {
    if (stdScroll)   stdScroll.style.display   = '';
    if (oosTbl)      oosTbl.style.display       = 'none';
    if (oosChrtWrap) oosChrtWrap.style.display  = 'none'; // OOS график скрыть
    document.body.classList.remove('chart-active');
    // eq-wrap управляет собственной видимостью через drawEquityData
  }
  // Панель новых данных — во всех режимах
  const newDataBar = document.getElementById('new-data-bar');
  if (newDataBar) newDataBar.style.display = 'flex';
  // Кнопка экспорта только в OOS режиме
  const exportBtn = document.getElementById('btn-oos-export');
  if (exportBtn) exportBtn.style.display = (mode === 'oos' && _oosTableResults.length > 0) ? '' : 'none';
  // Кнопка шаблонов OOS только в OOS режиме
  const oosTplBtn = document.getElementById('btn-oos-tpl');
  if (oosTplBtn) oosTplBtn.style.display = (mode === 'oos') ? '' : 'none';
  // Кнопка сравнения
  const oosBtn = document.getElementById('btn-oos-new');
  if (oosBtn) oosBtn.style.display = NEW_DATA ? '' : 'none';
  // При переходе в HC или Fav — сбрасываем все фильтры:
  // фильтры основных результатов несовместимы с соседями/избранными
  if (mode === 'hc' || mode === 'fav') {
    if (typeof resetAllFilters === 'function') resetAllFilters();
  } else if (mode === 'oos') {
    // OOS режим: применяем OOS-специфичные фильтры
    applyOOSFilters();
  } else {
    applyFilters(true);
  }
}

function _updateTableModeCounts() {
  const r = document.getElementById('tbl-cnt-results');
  const h = document.getElementById('tbl-cnt-hc');
  const f = document.getElementById('tbl-cnt-fav');
  const o = document.getElementById('tbl-cnt-oos');
  if (r) r.textContent = results.length;
  if (h) h.textContent = _hcTableResults.length;
  if (f) f.textContent = favourites.length;
  if (o) o.textContent = _oosTableResults.length;
  const hcBtn = document.getElementById('tbl-btn-hc');
  if (hcBtn) hcBtn.style.display = _hcTableResults.length > 0 ? '' : 'none';
  const oosBtn = document.getElementById('tbl-btn-oos');
  if (oosBtn) oosBtn.style.display = _oosTableResults.length > 0 ? '' : 'none';
}

// Debounced applyFilters — не вызывать на каждый символ
let _applyFiltersTimer = null;
function applyFiltersDebounced() {
  clearTimeout(_applyFiltersTimer);
  _applyFiltersTimer = setTimeout(applyFilters, 150);
}

// ══════════════════════════════════════════════════════════════
// TABLE FILTER TEMPLATES — мини-шаблоны фильтров таблицы
// ══════════════════════════════════════════════════════════════
const _TBL_TPL_KEY = 'use_tbl_tpl';

const _TF_NUM_IDS  = ['f_name','f_pnl','f_wr','f_n','f_dd','f_pdd','f_sig','f_gt','f_cvr','f_sortino','f_kr','f_sqn','f_cpcv','f_omega','f_pain','f_burke','f_serenity','f_ir','f_avg','f_p1','f_p2','f_dwr','f_tv_dpnl','f_tv_ddd','f_tv_dpdd']; // ##BURKE ##SRNTY ##IR
const _TF_SEL_IDS  = ['f_fav','f_split','f_ls','f_rob','f_oos','f_walk','f_param','f_noise','f_mc','f_tv_score'];

// map filter-input-id → column CSS class (for visibleOnly mode)
const _TF_COL_MAP  = {
  f_pnl:'col-pnl', f_wr:'col-wr', f_n:'col-n', f_dd:'col-dd', f_pdd:'col-pdd',
  f_sig:'col-sig', f_gt:'col-gt', f_cvr:'col-cvr', f_sortino:'col-sor', f_kr:'col-kr',
  f_sqn:'col-sqn', f_cpcv:'col-cpcv', f_omega:'col-omg', f_pain:'col-pain',
  f_burke:'col-burke', f_serenity:'col-srnty', f_ir:'col-ir', // ##BURKE ##SRNTY ##IR
  f_avg:'col-avg', f_p1:'col-p1', f_p2:'col-p2', f_dwr:'col-dwr',
  f_split:'col-split', f_ls:'col-ls',
  f_tv_dpnl:'col-tv-dpnl', f_tv_ddd:'col-tv-ddd', f_tv_dpdd:'col-tv-dpdd',
  f_rob:'col-rob', f_oos:'col-rob-oos', f_walk:'col-rob-walk',
  f_param:'col-rob-param', f_noise:'col-rob-noise', f_mc:'col-rob-mc',
};

function _gatherTableFilters() {
  const f = {};
  _TF_NUM_IDS.forEach(id => { f[id] = $(id)?.value ?? ''; });
  _TF_SEL_IDS.forEach(id => { f[id] = $(id)?.value ?? ''; });
  // capture current sort
  const sortCol = Object.keys(sortDirs)[0] ?? null;
  f._sortCol = sortCol;
  f._sortDir = sortCol !== null ? sortDirs[sortCol] : null;
  return f;
}

function _applyTableFilters(f, visibleOnly) {
  const allIds = [..._TF_NUM_IDS, ..._TF_SEL_IDS];
  allIds.forEach(id => {
    const el = $(id); if (!el) return;
    if (visibleOnly) {
      const colCls = _TF_COL_MAP[id];
      if (colCls && document.querySelector('.' + colCls + '.col-hidden')) return; // skip hidden col
    }
    el.value = f[id] ?? '';
  });
  // restore sort
  sortDirs = {};
  if (f._sortCol !== null && f._sortCol !== undefined) {
    sortDirs[f._sortCol] = f._sortDir;
  }
  applyFilters(true);
}

function _renderQuickFilterBtns(tpls) {
  const container = document.getElementById('tbl-quick-filters');
  if (!container) return;
  const pinned = (tpls || []).filter(t => t.pinned).slice(0, 5);
  container.innerHTML = pinned.map((t, _) => {
    const i = tpls.indexOf(t);
    const isDefault = t.isDefault;
    return `<button class="tbl-mode-btn tbl-qf-btn${isDefault ? ' tbl-qf-default' : ''}"
      onclick="applyTableTpl(${i},false)"
      title="${t.name}${isDefault ? ' · применяется по умолчанию' : ''}"
      style="max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
      >${isDefault ? '🏠 ' : ''}${t.name}</button>`;
  }).join('');
}

async function openTableTplPopover(forceReopen) {
  // close if already open (toggle); if forceReopen — just close old and rebuild
  const existing = document.getElementById('tbl-tpl-popover');
  if (existing && !forceReopen) { existing.remove(); return; }
  if (existing) existing.remove();

  const tpls = (await storeLoad(_TBL_TPL_KEY)) || [];
  const btn  = $('btn-tbl-tpl');

  const pop = document.createElement('div');
  pop.id = 'tbl-tpl-popover';

  const saveRow = `<div style="display:flex;gap:5px;margin-bottom:8px">
    <button class="tpl-ibtn" style="flex:1;font-size:.68em;padding:4px" onclick="saveTableTpl()">💾 Сохранить текущий</button>
  </div>`;

  const toggleHelp = `<div style="font-size:.6em;color:var(--text3);margin-bottom:6px">
    ▶ применить · 👁▶ только видимые · 🏠 по умолчанию · 📌 на панель (до 5)
  </div>`;

  const pinnedCount = tpls.filter(t => t.pinned).length;

  const items = tpls.length
    ? tpls.map((t, i) => {
        const pinActive  = t.pinned;
        const defActive  = t.isDefault;
        const canPin     = pinActive || pinnedCount < 5;
        return `
      <div class="tbl-tpl-item">
        <div style="flex:1;min-width:0">
          <div class="tbl-tpl-name">${t.name}</div>
          <div class="tbl-tpl-date">${new Date(t.ts).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div>
        </div>
        <button class="tpl-ibtn" style="font-size:.62em;padding:2px 6px" onclick="applyTableTpl(${i},false)" title="Применить ко всем колонкам">▶</button>
        <button class="tpl-ibtn" style="font-size:.62em;padding:2px 6px;border-color:var(--accent2);color:var(--accent2)" onclick="applyTableTpl(${i},true)" title="Применить только к видимым колонкам">👁▶</button>
        <button class="tpl-ibtn" style="font-size:.62em;padding:2px 5px;opacity:${canPin?1:.35};${defActive?'border-color:var(--accent2);color:var(--accent2)':''}" onclick="setDefaultTpl(${i})" title="${defActive ? 'Убрать из «по умолчанию»' : 'Применять по умолчанию при загрузке'}">🏠</button>
        <button class="tpl-ibtn" style="font-size:.62em;padding:2px 5px;${pinActive?'border-color:var(--accent);color:var(--accent)':'opacity:.5'}${canPin?'':';opacity:.3;cursor:default'}" onclick="${canPin?`togglePinTpl(${i})`:'void 0'}" title="${pinActive ? 'Убрать с панели' : (canPin ? 'Добавить на панель быстрого доступа' : 'Панель заполнена (5/5)')}">📌</button>
        <button class="tpl-ibtn del" style="font-size:.62em;padding:2px 5px" onclick="deleteTableTpl(${i})" title="Удалить">✕</button>
      </div>`;
      }).join('')
    : '<div style="font-size:.65em;color:var(--text3);padding:4px 0">Нет сохранённых шаблонов</div>';

  pop.innerHTML = saveRow + toggleHelp + items;

  // Append to body to escape overflow:hidden on .tbl-mode-bar
  document.body.appendChild(pop);
  const rect = btn.getBoundingClientRect();
  pop.style.position = 'fixed';
  pop.style.top  = (rect.bottom + 3) + 'px';
  pop.style.right = (window.innerWidth - rect.right) + 'px';
  pop.style.left  = 'auto';

  // close on outside click
  setTimeout(() => {
    document.addEventListener('mousedown', function _close(e) {
      if (!pop.contains(e.target) && e.target !== btn) {
        pop.remove();
        document.removeEventListener('mousedown', _close);
      }
    });
  }, 0);
}

async function saveTableTpl() {
  const tpls = (await storeLoad(_TBL_TPL_KEY)) || [];
  const name = prompt('Название шаблона фильтров:',
    `Фильтр ${new Date().toLocaleString('ru-RU',{hour:'2-digit',minute:'2-digit'})}`);
  if (!name?.trim()) return;
  tpls.push({ name: name.trim(), filters: _gatherTableFilters(), ts: Date.now() });
  await storeSave(_TBL_TPL_KEY, tpls);
  _renderQuickFilterBtns(tpls);
  openTableTplPopover(true); // force reopen with updated list
}

async function applyTableTpl(i, visibleOnly) {
  const tpls = (await storeLoad(_TBL_TPL_KEY)) || [];
  if (!tpls[i]) return;
  _applyTableFilters(tpls[i].filters, visibleOnly);
  const pop = document.getElementById('tbl-tpl-popover');
  if (pop) pop.remove();
}

async function deleteTableTpl(i) {
  const tpls = (await storeLoad(_TBL_TPL_KEY)) || [];
  tpls.splice(i, 1);
  await storeSave(_TBL_TPL_KEY, tpls);
  _renderQuickFilterBtns(tpls);
  openTableTplPopover(true); // force reopen with updated list
}

async function setDefaultTpl(i) {
  const tpls = (await storeLoad(_TBL_TPL_KEY)) || [];
  if (!tpls[i]) return;
  const wasDefault = tpls[i].isDefault;
  tpls.forEach(t => delete t.isDefault);
  if (!wasDefault) tpls[i].isDefault = true; // toggle off if already default
  await storeSave(_TBL_TPL_KEY, tpls);
  _renderQuickFilterBtns(tpls);
  openTableTplPopover(true);
}

async function togglePinTpl(i) {
  const tpls = (await storeLoad(_TBL_TPL_KEY)) || [];
  if (!tpls[i]) return;
  const pinnedCount = tpls.filter(t => t.pinned).length;
  if (!tpls[i].pinned && pinnedCount >= 5) return; // cap at 5
  tpls[i].pinned = !tpls[i].pinned;
  await storeSave(_TBL_TPL_KEY, tpls);
  _renderQuickFilterBtns(tpls);
  openTableTplPopover(true);
}

// ══════════════════════════════════════════════════════════════
// OOS TABLE FILTER TEMPLATES — мини-шаблоны фильтров OOS таблицы
// ══════════════════════════════════════════════════════════════
const _OOS_TPL_KEY = 'use_oos_tbl_tpl';

const _OOS_TF_NUM_IDS = ['oof_opnl','oof_npnl','oof_dpnl','oof_oddd','oof_nddd','oof_opdd','oof_npdd','oof_dapt','oof_dwr','oof_on','oof_nn','oof_rate_min','oof_rate_max'];
const _OOS_TF_SEL_IDS = ['oof_fav','oof_score'];
const _OOS_TF_TXT_IDS = ['oof_name'];

function _gatherOOSFilters() {
  const f = {};
  [..._OOS_TF_NUM_IDS, ..._OOS_TF_SEL_IDS, ..._OOS_TF_TXT_IDS].forEach(id => {
    f[id] = document.getElementById(id)?.value ?? '';
  });
  f._oosSortKey = _oosSortKey;
  f._oosSortDir = _oosSortDir;
  return f;
}

function _applyOOSFiltersFromTpl(f) {
  [..._OOS_TF_NUM_IDS, ..._OOS_TF_SEL_IDS, ..._OOS_TF_TXT_IDS].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = f[id] ?? '';
  });
  if (f._oosSortKey !== undefined) _oosSortKey = f._oosSortKey;
  if (f._oosSortDir !== undefined) _oosSortDir = f._oosSortDir;
  applyOOSFilters();
}

async function openOOSTplPopover(forceReopen) {
  const existing = document.getElementById('oos-tpl-popover');
  if (existing && !forceReopen) { existing.remove(); return; }
  if (existing) existing.remove();

  const tpls = (await storeLoad(_OOS_TPL_KEY)) || [];
  const btn  = document.getElementById('btn-oos-tpl');

  const pop = document.createElement('div');
  pop.id = 'oos-tpl-popover';

  const saveRow = `<div style="display:flex;gap:5px;margin-bottom:8px">
    <button class="tpl-ibtn" style="flex:1;font-size:.68em;padding:4px" onclick="saveOOSTableTpl()">💾 Сохранить текущий</button>
  </div>`;

  const items = tpls.length
    ? tpls.map((t, i) => `
      <div class="tbl-tpl-item">
        <div style="flex:1;min-width:0">
          <div class="tbl-tpl-name">${t.name}</div>
          <div class="tbl-tpl-date">${new Date(t.ts).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div>
        </div>
        <button class="tpl-ibtn" style="font-size:.62em;padding:2px 6px" onclick="applyOOSTableTpl(${i})" title="Применить">▶</button>
        <button class="tpl-ibtn del" style="font-size:.62em;padding:2px 5px" onclick="deleteOOSTableTpl(${i})" title="Удалить">✕</button>
      </div>`).join('')
    : '<div style="font-size:.65em;color:var(--text3);padding:4px 0">Нет сохранённых шаблонов</div>';

  pop.innerHTML = saveRow + items;

  document.body.appendChild(pop);
  const rect = btn.getBoundingClientRect();
  pop.style.position = 'fixed';
  pop.style.top  = (rect.bottom + 3) + 'px';
  pop.style.right = (window.innerWidth - rect.right) + 'px';
  pop.style.left  = 'auto';

  setTimeout(() => {
    document.addEventListener('mousedown', function _close(e) {
      if (!pop.contains(e.target) && e.target !== btn) {
        pop.remove();
        document.removeEventListener('mousedown', _close);
      }
    });
  }, 0);
}

async function saveOOSTableTpl() {
  const tpls = (await storeLoad(_OOS_TPL_KEY)) || [];
  const name = prompt('Название шаблона OOS-фильтров:',
    `OOS-фильтр ${new Date().toLocaleString('ru-RU',{hour:'2-digit',minute:'2-digit'})}`);
  if (!name?.trim()) return;
  tpls.push({ name: name.trim(), filters: _gatherOOSFilters(), ts: Date.now() });
  await storeSave(_OOS_TPL_KEY, tpls);
  openOOSTplPopover(true);
}

async function applyOOSTableTpl(i) {
  const tpls = (await storeLoad(_OOS_TPL_KEY)) || [];
  if (!tpls[i]) return;
  _applyOOSFiltersFromTpl(tpls[i].filters);
  const pop = document.getElementById('oos-tpl-popover');
  if (pop) pop.remove();
}

async function deleteOOSTableTpl(i) {
  const tpls = (await storeLoad(_OOS_TPL_KEY)) || [];
  tpls.splice(i, 1);
  await storeSave(_OOS_TPL_KEY, tpls);
  openOOSTplPopover(true);
}

// Move results from table to hidden archive (keeps them for future TPE use)
function clearResults() {
  if (!results.length) return;
  if (!confirm(`Убрать ${results.length} результатов из таблицы?\nОни сохранятся в скрытом архиве (${_archivedResults.length} уже в архиве).`)) return;
  _archivedResults = _archivedResults.concat(results);
  results = [];
  equities = {};
  const tb = $('tb'); if (tb) tb.innerHTML = '';
  const cnt = $('tbl-cnt-results'); if (cnt) cnt.textContent = '0';
  console.log(`[clearResults] archived ${_archivedResults.length} total, table cleared`);
}

// Wipe everything: table + archive
function clearAllResults() {
  const total = results.length + _archivedResults.length;
  if (!total) return;
  if (!confirm(`Удалить ВСЁ: ${results.length} в таблице + ${_archivedResults.length} в архиве = ${total} результатов?\nЭто действие необратимо.`)) return;
  results = [];
  _archivedResults = [];
  equities = {};
  const tb = $('tb'); if (tb) tb.innerHTML = '';
  const cnt = $('tbl-cnt-results'); if (cnt) cnt.textContent = '0';
  console.log('[clearAllResults] table + archive wiped');
}

function resetAllFilters() {
  // Сбрасываем все текстовые/числовые инпуты
  ['f_name','f_pnl','f_wr','f_n','f_dd','f_pdd','f_sig','f_gt','f_cvr','f_sortino','f_kr','f_sqn','f_cpcv','f_omega','f_pain','f_burke','f_serenity','f_ir', // ##OMG ##PAIN ##BURKE ##SRNTY ##IR
   'f_avg','f_p1','f_p2','f_dwr','f_tv_dpnl','f_tv_ddd','f_tv_dpdd'].forEach(id => {
    const el = $(id); if (el) el.value = '';
  });
  // Сбрасываем все select
  ['f_fav','f_split','f_ls','f_rob','f_oos','f_walk','f_param','f_noise','f_mc','f_tv_score'].forEach(id => {
    const el = $(id); if (el) el.value = '';
  });
  // Сбрасываем сортировку
  sortDirs = {};
  applyFilters(true);
}

let _applyFiltersLastMs = 0;
function applyFilters(_force = false) {
  // Блокируем автоматические вызовы во время queue/rob-теста — предотвращает рендер-цикл.
  // Пользовательские вызовы (сортировка, кнопки фильтров) передают _force=true и проходят.
  // finally-блок очереди вызывает applyFilters() УЖЕ после _queueMode=false — там тоже ок.
  if (!_force && window._queueMode) return;
  if (!_force && typeof _massRobRunning !== 'undefined' && _massRobRunning) return;
  // Throttle: не чаще 1 раза в 100 мс для авто-вызовов (защита от неизвестных источников петли)
  if (!_force) {
    const now = Date.now();
    if (now - _applyFiltersLastMs < 100) return;
    _applyFiltersLastMs = now;
  }
  const fName  = $('f_name').value.trim().toLowerCase().normalize('NFKD');
  const fFav   = $('f_fav').value;
  const fPnl   = parseFloat($('f_pnl').value);
  const fWr    = parseFloat($('f_wr').value);
  const fN     = parseFloat($('f_n').value);
  const fDd    = parseFloat($('f_dd').value);
  const fPdd   = parseFloat($('f_pdd').value);
  const fSig   = parseFloat($('f_sig').value);
  const fGt    = parseFloat($('f_gt').value);
  const fCvr     = parseFloat($('f_cvr').value);
  const fSortino = parseFloat($('f_sortino').value); // ##SOR
  const fKR      = parseFloat($('f_kr').value);      // ##KR
  const fSqn     = parseFloat($('f_sqn').value);     // ##SQN
  const fCpcv    = parseFloat($('f_cpcv').value);    // ##CPCV
  const fOmega    = parseFloat($('f_omega').value);    // ##OMG
  const fPain     = parseFloat($('f_pain').value);    // ##PAIN
  const fBurke    = parseFloat($('f_burke').value);   // ##BURKE
  const fSerenity = parseFloat($('f_serenity').value); // ##SRNTY
  const fIR       = parseFloat($('f_ir').value);       // ##IR
  const fAvg   = parseFloat($('f_avg').value);
  const fP1    = parseFloat($('f_p1').value);
  const fP2    = parseFloat($('f_p2').value);
  const fDwr   = parseFloat($('f_dwr').value);
  const fSplit = $('f_split').value;
  const fRob   = parseFloat($('f_rob').value);

  // Выбираем источник данных в зависимости от режима таблицы
  const _srcData = _tableMode === 'hc'  ? _hcTableResults :
                   _tableMode === 'fav' ? _getFavAsResults() :
                   _tableMode === 'oos' ? _oosTableResults : results;

  _visibleResults = _srcData.filter(r => {
    if (fName && !r.name.toLowerCase().normalize('NFKD').includes(fName)) return false;
    // Фильтр Избранного работает во всех режимах
    if (fFav === 'fav' && !isFav(r.name)) return false;
    if (fFav === 'no'  &&  isFav(r.name)) return false;
    // В OOS режиме поля pnl/wr/n/dd и т.д. хранятся как old_pnl/old_wr — пропускаем стандартные числовые фильтры
    if (_tableMode === 'oos') return true;
    if (!isNaN(fPnl) && r.pnl < fPnl) return false;
    if (!isNaN(fWr)  && r.wr  < fWr)  return false;
    if (!isNaN(fN)   && r.n   < fN)   return false;
    if (!isNaN(fDd)  && r.dd  > fDd)  return false;
    if (!isNaN(fPdd) && r.pdd < fPdd) return false;
    if (!isNaN(fSig) && (r.sig??0) < fSig) return false;
    if (!isNaN(fGt)  && (r.gt??-2) < fGt)  return false;
    if (!isNaN(fCvr)     && (r.cvr??-1)      < fCvr)     return false;
    if (!isNaN(fSortino) && (r.sortino??-99)  < fSortino) return false; // ##SOR
    if (!isNaN(fKR)      && (r.kRatio??-99)   < fKR)      return false; // ##KR
    if (!isNaN(fSqn)     && (r.sqn??-99)      < fSqn)     return false; // ##SQN
    if (!isNaN(fCpcv)    && (r.cpcvScore??-1) < fCpcv)    return false; // ##CPCV
    if (!isNaN(fOmega)    && (r.omega??-99)    < fOmega)    return false; // ##OMG
    if (!isNaN(fPain)     && (r.pain??-99)     < fPain)     return false; // ##PAIN
    if (!isNaN(fBurke)    && (r.burke??-99)    < fBurke)    return false; // ##BURKE
    if (!isNaN(fSerenity) && (r.serenity??-99) < fSerenity) return false; // ##SRNTY
    if (!isNaN(fIR)       && (r.ir??-99)       < fIR)       return false; // ##IR
    if (!isNaN(fAvg) && r.avg < fAvg) return false;
    if (!isNaN(fP1)  && r.p1  < fP1)  return false;
    if (!isNaN(fP2)  && r.p2  < fP2)  return false;
    if (!isNaN(fDwr) && r.dwr > fDwr) return false;
    if (fSplit) {
      const sc = r.dwr<10?'ok':r.dwr<20?'warn':'bad';
      if (fSplit !== sc) return false;
    }
    const fLs = $('f_ls')?.value;
    if (fLs) {
      const lsSc2 = r.dwrLS==null?'na':r.dwrLS<10?'ok':r.dwrLS<25?'warn':'bad';
      if (lsSc2 === 'na' || lsSc2 !== fLs) return false;
    }
    if (!isNaN(fRob) && fRob > 0) {
      if (r.robScore === undefined || r.robMax === undefined || r.robMax === 0) return false;
      const robNorm = Math.round(r.robScore / r.robMax * 5);
      if (robNorm < fRob) return false;
    }
    // Фильтры по детальным тестам
    const _fd = r.robDetails || {};
    const fOos = $('f_oos')?.value;
    if (fOos !== '' && fOos !== undefined && fOos !== null) {
      const fOosN = parseInt(fOos);
      const oosVal = _fd.oos ?? -1;
      if (!isNaN(fOosN) && oosVal !== fOosN) return false;
    }
    const fWalk  = $('f_walk')?.value;  if (fWalk  !== '' && fWalk  !== undefined) { const v = _fd.walk  ?? -1; if (String(v) !== fWalk)  return false; }
    const fParam = $('f_param')?.value; if (fParam !== '' && fParam !== undefined) { const v = _fd.param ?? -1; if (String(v) !== fParam) return false; }
    const fNoise = $('f_noise')?.value; if (fNoise !== '' && fNoise !== undefined) { const v = _fd.noise ?? -1; if (String(v) !== fNoise) return false; }
    const fMc    = $('f_mc')?.value;    if (fMc    !== '' && fMc    !== undefined) { const v = _fd.mc    ?? -1; if (String(v) !== fMc)    return false; }
    // TV delta filters
    const fTvScore = $('f_tv_score')?.value;
    const fTvDpnl  = parseFloat($('f_tv_dpnl')?.value);
    const fTvDdd   = parseFloat($('f_tv_ddd')?.value);
    const fTvDpdd  = parseFloat($('f_tv_dpdd')?.value);
    if (fTvScore !== '' || !isNaN(fTvDpnl) || !isNaN(fTvDdd) || !isNaN(fTvDpdd)) {
      const f = r.cfg?._oos?.forward;
      if (!f || f.pnl == null) return false; // нет TV данных — исключаем при фильтре
      const oosGain = f.pnl;
      const isGain  = f.isGain ?? 0;
      const isPct   = r.cfg._oos.isPct;
      const oosPct  = 100 - isPct;
      const isRate  = isPct  > 0 ? isGain  / isPct  : 0;
      const oosRate = oosPct > 0 ? oosGain / oosPct : 0;
      const rateRatio = isRate > 0 ? oosRate / isRate * 100 : (oosGain > 0 ? 200 : (oosGain < 0 ? -100 : 0));
      const mulDd  = r.dd > 0 ? f.dd / r.dd : (f.dd > 0 ? 99 : 1);
      const retPdd = r.pdd > 0 ? (f.pdd??0) / r.pdd * 100 : 0;
      const oosProfit = oosGain > 0;
      const goodRate  = rateRatio >= 70, okRate = rateRatio >= 30;
      const goodDd    = mulDd <= 1.5,    okDd   = mulDd <= 2.5;
      const goodPdd   = retPdd >= 70,    okPdd  = retPdd >= 40;
      const allGood = oosProfit && goodRate && goodDd && goodPdd;
      const allBad  = !oosProfit || !okDd;
      const tvScore = allGood ? 2 : allBad ? 0 : 1;
      if (fTvScore !== '' && fTvScore !== undefined && tvScore < parseInt(fTvScore)) return false;
      if (!isNaN(fTvDpnl) && oosGain  < fTvDpnl) return false;
      if (!isNaN(fTvDdd)  && mulDd    > fTvDdd)  return false;
      if (!isNaN(fTvDpdd) && retPdd   < fTvDpdd) return false;
    }
    return true;
  });

  _updateTableModeCounts();
  renderVisibleResults();
  // Показываем mass-robust панель для всех режимов
  const showMassRob = _visibleResults.length > 0;
  $('mass-rob-bar').style.display = showMassRob ? 'flex' : 'none';
  const modeLabel = _tableMode === 'hc' ? 'соседей' : _tableMode === 'fav' ? 'избранных' : 'результатов';
  $('mass-rob-info').textContent = `${_visibleResults.length} ${modeLabel} видимо`;
  updatePreRunCount();
}

function renderResults() {
  _curPage = 0;
  // Sync results from window.results if set (e.g., from synthesis_ui)
  if (window.results && Array.isArray(window.results)) {
    results = window.results;
  }

  // В режиме очереди: не трогаем таблицу и фильтры — только счётчики.
  // Таблица обновится когда пользователь кликнет сортировку или изменит фильтр.
  if (window._queueMode) {
    $('mass-rob-bar').style.display = results.length > 0 ? 'flex' : 'none';
    $('mass-rob-info').textContent = `${results.length} результатов`;
    if (typeof window._batchOOS === 'function') {
      const _pendingOOS = results.filter(r => r.cfg && r.cfg._oos === undefined);
      if (_pendingOOS.length > 0) {
        // Один таймер на всё — clearTimeout предотвращает накопление при частых вызовах
        clearTimeout(window._batchOOSTimer);
        window._batchOOSTimer = setTimeout(() => window._batchOOS(), 50);
      }
    }
    return;
  }

  // При новом запуске оптимизации — возвращаемся в режим results
  if (_tableMode !== 'results') switchTableMode('results');
  _visibleResults = [...results]; // сброс фильтра при новом запуске
  // Очищаем поля фильтров
  ['f_name','f_pnl','f_wr','f_n','f_dd','f_pdd','f_avg','f_p1','f_p2','f_dwr','f_rob'].forEach(id => {
    const el=$(id); if(el) el.value='';
  });
  ['f_fav','f_split'].forEach(id => { const el=$(id); if(el) el.value=''; });
  renderVisibleResults();
  $('mass-rob-bar').style.display = results.length > 0 ? 'flex' : 'none';
  $('mass-rob-info').textContent = `${results.length} результатов`;
  // Safety net: если после рендера есть результаты без OOS — пересчитать в фоне
  if (typeof window._batchOOS === 'function') {
    const _pendingOOS = results.filter(r => r.cfg && r.cfg._oos === undefined);
    if (_pendingOOS.length > 0) {
      // Один таймер — clearTimeout предотвращает накопление нескольких одновременных вызовов
      clearTimeout(window._batchOOSTimer);
      window._batchOOSTimer = setTimeout(async () => {
        await window._batchOOS();
        applyFilters(); // перерисовать таблицу с заполненными TV колонками
      }, 50);
    }
  }
}

// --- Пагинация ---
let _curPage = 0;
let _pageSize = 100;
let _totalPages = 1;
let _selectedIdx = -1; // индекс выбранной строки в _visibleResults

function goPage(p) {
  _curPage = Math.max(0, Math.min(_totalPages-1, p));
  renderVisibleResults();
  // Скроллим таблицу наверх
  const tbl = document.getElementById('rtbl');
  if (tbl) tbl.scrollIntoView({block:'nearest', behavior:'smooth'});
}

function renderVisibleResults() {
  const total = _visibleResults.length;
  _totalPages = Math.max(1, Math.ceil(total / _pageSize));
  if (_curPage >= _totalPages) _curPage = _totalPages - 1;

  const start = _curPage * _pageSize;
  const end   = Math.min(start + _pageSize, total);
  const page  = _visibleResults.slice(start, end);

  // Строим HTML строкой — намного быстрее чем createElement в цикле
  // ── OOS-режим: рендер через applyOOSFilters (своя фильтрация) ──
  if (_tableMode === 'oos') {
    // Скрываем основную таблицу в OOS режиме (никогда не показывать обе таблицы одновременно)
    const stdScroll = document.querySelector('.tbl-scroll');
    if (stdScroll) stdScroll.style.display = 'none';
    applyOOSFilters();
    return; // дальнейший рендер не нужен
  }
  let html = '';
  for (let i = 0; i < page.length; i++) {
    const r = page[i];
    const rii = start + i; // индекс в _visibleResults (для toggleFav)
    const sc = r.dwr < 10 ? 'ok' : r.dwr < 20 ? 'warn' : 'bad';
    const stable = r.dwr < 10 ? '✅' : r.dwr < 20 ? '⚠️' : '❌';
    const lsSc = r.dwrLS===null||r.dwrLS===undefined ? 'na' : r.dwrLS<10?'ok':r.dwrLS<25?'warn':'bad';
    const lsIcon = r.dwrLS===null||r.dwrLS===undefined ? '—' : r.dwrLS<10?'✅':r.dwrLS<25?'⚠️':'❌';
    const pnlCls = (r.pnl ?? 0) >= 0 ? 'pos' : 'neg';
    const pddCls = (r.pdd ?? 0) >= 10 ? 'pos' : (r.pdd ?? 0) >= 5 ? 'warn' : 'neg';
    let robCell = '—';
    if (r.robScore !== undefined && r.robMax > 0) {
      // Нормализуем к шкале 0-5 для пиктограммы
      const robNorm = Math.round(r.robScore / r.robMax * 5);
      const robCls  = 'rob-score-' + robNorm;
      // Пиктограмма: закрашенные / пустые квадраты (5 делений)
      const robFilled = '■'.repeat(robNorm);
      const robEmpty  = '□'.repeat(5 - robNorm);
      robCell = `<span class="${robCls}" title="${r.robScore}/${r.robMax} тестов пройдено" style="letter-spacing:1px;font-size:.8em">${robFilled}${robEmpty}</span>`;
    }
    // Детальные ячейки тестов
    const _rd = r.robDetails || {};
    const _robTd = (key) => {
      if (!r.robDetails && r.robScore === undefined) return '<td class="muted col-rob-'+key+'">—</td>';
      const v = _rd[key];
      if (v === undefined) return '<td class="muted col-rob-'+key+'">—</td>';
      // OOS: показываем X/3 (сколько участков из трёх прибыльны)
      if (key === 'oos') {
        const cls = v >= 3 ? 'pos' : v >= 2 ? 'warn' : 'neg';
        return `<td class="${cls} col-rob-oos" title="OOS: ${v} из 3 участков прибыльны">${v}/3</td>`;
      }
      // Walk/Param/Noise/MC: 0 или 1
      const cls = v >= 1 ? 'pos' : 'neg';
      return `<td class="${cls} col-rob-${key}" title="${key}: ${v ? 'пройден' : 'провален'}">${v}</td>`;
    };
    const favLvl = getFavLevel(r.name);
    const fav = favLvl > 0 ? '★' : '☆';
    const delBtn = _tableMode === 'fav' ? `<span class="fav-del-btn" data-del-fav="${rii}">✕</span>` : '';
    html +=
      `<tr data-i="${rii}" style="cursor:pointer">` +
      `<td class="accent" style="font-size:.66em;max-width:380px;overflow:hidden;text-overflow:ellipsis;user-select:text;cursor:text" title="${r.name}">${r.name}${delBtn}</td>` +
      `<td class="col-fav" style="font-size:.85em" data-fav="${rii}" data-level="${favLvl}">${fav}</td>` +
      `<td class="col-pnl ${pnlCls}">${r.pnl != null ? r.pnl.toFixed(1) : '—'}</td>` +
      `<td class="col-wr">${r.wr != null ? r.wr.toFixed(1) : '—'}</td>` +
      `<td class="col-n muted">${r.n ?? '—'}</td>` +
      `<td class="col-dd neg">${r.dd != null ? r.dd.toFixed(1) : '—'}</td>` +
      `<td class="col-pdd ${pddCls}">${r.pdd != null ? r.pdd.toFixed(1) : '—'}</td>` +
      (()=>{ const s=r.sig??0; const sc=s>=90?'pos':s>=70?'':'neg'; return `<td class="col-sig ${sc}" title="Статистическая значимость WR (z-тест)\n≥90% = значима ✅\n70–90% = под вопросом\n&lt;70% = вероятно случайно">${s}%</td>`; })() +
      (()=>{ const g=r.gt??-2; const gc=g>=5?'pos':g>=2?'':'neg'; return `<td class="col-gt ${gc}" title="GT-Score = (P/DD) × sig_mult × consistency_mult\nАнтиовефиттинг метрика: штрафует за мало сделок и нестабильный WR">${g.toFixed(2)}</td>`; })() +
      (()=>{ const v=r.cvr??null; if(v===null) return '<td class="col-cvr muted">—</td>'; const vc=v>=80?'pos':v>=50?'':'neg'; return `<td class="col-cvr ${vc}" title="CVR% — Temporal Cross-Validation Robustness\nПроцент из 6 временных окон, где стратегия прибыльна.\n≥80% = устойчива ✅ | 50–80% = умеренно | &lt;50% = нестабильна">${v}%</td>`; })() +
      (()=>{ const v=r.sortino??null; if(v===null) return '<td class="col-sor muted">—</td>'; const vc=v>=3?'pos':v>=2?'warn':'neg'; return `<td class="col-sor ${vc}" title="Sortino Ratio = PnL / downside_vol\n≥3 = отлично ✅ | ≥2 = хорошо | &lt;1 = нестабильно">${v.toFixed(1)}</td>`; })() + // ##SOR
      (()=>{ const v=r.kRatio??null; if(v===null) return '<td class="col-kr muted">—</td>'; const vc=v>=2?'pos':v>=1?'warn':'neg'; return `<td class="col-kr ${vc}" title="K-Ratio = slope_OLS(equity) / se(slope)\nМерит равномерность роста equity (OLS регрессия).\n≥2 = отлично ✅ | ≥1 = хорошо | &lt;0.5 = нестабильно">${v.toFixed(1)}</td>`; })() + // ##KR
      (()=>{ const v=r.sqn??null; if(v===null) return '<td class="col-sqn muted">—</td>'; const vc=v>=3?'pos':v>=1?'warn':'neg'; return `<td class="col-sqn ${vc}" title="SQN = (avg_trade/std_trade)×√n  (Van Tharp)\nМерит качество системы на уровне сделок.\n≥5 = excellent | ≥3 = good | ≥1 = average | &lt;1 = poor">${v.toFixed(1)}</td>`; })() + // ##SQN
      (()=>{ const v=r.omega??null; if(v===null) return '<td class="col-omg muted">—</td>'; const vc=v>=3?'pos':v>=2?'warn':'neg'; return `<td class="col-omg ${vc}" title="Omega Ratio = Σприросты / Σпадения (уровень баров)\nProfit factor без предположения о нормальности.\n≥3 = отлично ✅ | ≥2 = хорошо">${v.toFixed(1)}</td>`; })() + // ##OMG
      (()=>{ const v=r.pain??null; if(v===null) return '<td class="col-pain muted">—</td>'; const vc=v>=5?'pos':v>=3?'warn':'neg'; return `<td class="col-pain ${vc}" title="Pain Ratio = PnL / Pain Index\nPain Index = mean(просадка от пика). Штрафует за длительность любых просадок.\n≥5 = отлично ✅ | ≥3 = хорошо | &lt;1 = плохо">${v.toFixed(1)}</td>`; })() + // ##PAIN
      (()=>{ const v=r.burke??null; if(v===null) return '<td class="col-burke muted">—</td>'; const vc=v>=3?'pos':v>=2?'warn':'neg'; return `<td class="col-burke ${vc}" title="Burke Ratio = PnL / √(Σ просадок²)\nУчитывает ВСЕ события просадок, не только максимальную.\n≥3 = отлично ✅ | ≥2 = хорошо | &lt;0.5 = плохо">${v.toFixed(1)}</td>`; })() + // ##BURKE
      (()=>{ const v=r.serenity??null; if(v===null) return '<td class="col-srnty muted">—</td>'; const vc=v>=5?'pos':v>=3?'warn':'neg'; return `<td class="col-srnty ${vc}" title="Serenity Index = PnL / (UlcerIndex × TailFactor)\nTailFactor = CVaR(5%) / mean(убытков) — штраф за хвостовые риски.\n≥5 = отлично ✅ | ≥3 = хорошо | &lt;1 = плохо">${v.toFixed(1)}</td>`; })() + // ##SRNTY
      (()=>{ const v=r.ir??null; if(v===null) return '<td class="col-ir muted">—</td>'; const vc=v>=1?'pos':v>=0?'warn':'neg'; return `<td class="col-ir ${vc}" title="Information Ratio = mean(active) / std(active) × √252\nactive_return = стратегия − buy&amp;hold.\n≥1 = хорошо ✅ | ≥0.5 = добавляет ценность | &lt;0 = хуже buy&amp;hold">${v.toFixed(1)}</td>`; })() + // ##IR
      (()=>{ const ml=r.cfg&&r.cfg.useMLFilter; if(!ml) return '<td class="col-ml muted">—</td>'; const avg=r.mlAvg??null; const t=r.cfg.mlThreshold||0.55; if(avg===null) return `<td class="col-ml muted" title="ML-фильтр активен, порог ${(t*100).toFixed(0)}%\nСредний скор: нет данных">🤖?</td>`; const vc=avg>=70?'pos':avg>=60?'warn':'neg'; return `<td class="col-ml ${vc}" title="ML-фильтр активен\nСредний скор принятых сделок: ${avg}%\nПорог отсечки: ${(t*100).toFixed(0)}%\n≥70% = уверенные сигналы | 60–70% = умеренные | &lt;60% = на грани">🤖${avg}%</td>`; })() + // ##ML_FILTER
      (()=>{ const v=r.cpcvScore??null; if(v===null) return '<td class="col-cpcv muted">—</td>'; const vc=v>=80?'pos':v>=60?'warn':'neg'; return `<td class="col-cpcv ${vc}" title="CPCV% — блочная валидация: % прибыльных блоков.\nЗаполняется после открытия детали. ≥80% = устойчива ✅">${v}%</td>`; })() + // ##CPCV lazy
      `<td class="col-avg">${r.avg.toFixed(2)}</td>` +
      `<td class="col-p1 ${r.p1 >= 0 ? 'pos' : 'neg'}">${r.p1.toFixed(1)}</td>` +
      `<td class="col-p2 ${r.p2 >= 0 ? 'pos' : 'neg'}">${r.p2.toFixed(1)}</td>` +
      `<td class="col-dwr ${sc}">${r.dwr.toFixed(1)}</td>` +
      `<td class="col-split ${sc}">${stable}</td>`
      + `<td class="col-ls ${lsSc}" title="L:${r.nL||0}сд WR${r.wrL!=null?r.wrL.toFixed(0):'?'}% | S:${r.nS||0}сд WR${r.wrS!=null?r.wrS.toFixed(0):'?'}%">${lsIcon}${r.dwrLS!=null?' '+r.dwrLS.toFixed(0)+'%':''}</td>` +
      (()=>{
        const f = r.cfg && r.cfg._oos && r.cfg._oos.forward;
        // _oos===undefined: OOS не считался (паузе/во время оптимизации) — показываем ⏳
        if (r.cfg && r.cfg._oos === undefined) return '<td class="col-tv-score muted" title="OOS ещё не вычислен">⏳</td><td class="col-tv-dpnl muted">⏳</td><td class="col-tv-ddd muted">⏳</td><td class="col-tv-dpdd muted">⏳</td>';
        if (!f || f.pnlFull == null) return '<td class="col-tv-score muted">—</td><td class="col-tv-dpnl muted">—</td><td class="col-tv-ddd muted">—</td><td class="col-tv-dpdd muted">—</td>';
        // oosGain/isGain — из ОДНОГО полного бэктеста (корректное сравнение)
        const oosGain = f.pnl;           // прибыль только за OOS-период (последние 30%)
        const isGain  = f.isGain ?? 0;   // прибыль за IS-период из полного бэктеста
        const isPct   = r.cfg._oos.isPct;
        const oosPct  = 100 - isPct;
        // Скорость роста: PnL за 1% времени. Правильное сравнение IS↔OOS
        const isRate  = isPct  > 0 ? isGain  / isPct  : 0;
        const oosRate = oosPct > 0 ? oosGain / oosPct : 0;
        // rateRatio: OOS скорость / IS скорость. 100% = одинаково, >100% = ускоряется
        const rateRatio = isRate > 0 ? oosRate / isRate * 100
                        : (oosGain > 0 ? 200 : (oosGain < 0 ? -100 : 0));
        // DD и P/DD сравниваем между полным TV бэктестом и IS-only бэктестом
        const isDd  = r.dd??0,  tvDd  = f.dd??0;
        const isPdd = r.pdd??0, tvPdd = f.pdd ?? 0;
        const dDd   = tvDd - isDd;
        const mulDd = isDd > 0 ? tvDd / isDd : (tvDd > 0 ? 99 : 1);
        const dPdd  = tvPdd - isPdd;
        const retPdd = isPdd > 0 ? tvPdd / isPdd * 100 : 0;
        // TV score: главный критерий — OOS ПРИБЫЛЕН
        const oosProfit = oosGain > 0;
        const goodRate  = rateRatio >= 70;   // OOS растёт не хуже 70% скорости IS
        const okRate    = rateRatio >= 30;
        const goodDd    = mulDd <= 1.5,  okDd  = mulDd <= 2.5;
        const goodPdd   = retPdd >= 70,  okPdd = retPdd >= 40;
        const allGood = oosProfit && goodRate && goodDd && goodPdd;
        const allBad  = !oosProfit || !okDd;
        const scoreIcon = allGood ? '✓' : allBad ? '✗' : '~';
        const scoreCls  = allGood ? 'pos' : allBad ? 'neg' : 'warn';
        const oosCls    = oosGain >= 0 ? (goodRate ? 'pos' : 'warn') : 'neg';
        const ddCls2    = goodDd  ? 'pos' : okDd  ? 'warn' : 'neg';
        const pddCls2   = goodPdd ? 'pos' : okPdd ? 'warn' : 'neg';
        const rateLbl   = `${rateRatio >= 0 ? '+' : ''}${rateRatio.toFixed(0)}% rate`;
        return `<td class="col-tv-score ${scoreCls}" title="OOS PnL: ${oosGain.toFixed(1)}% · IS скорость: ${isRate.toFixed(2)}/% · OOS скорость: ${oosRate.toFixed(2)}/% · DD ×${mulDd.toFixed(1)}">${scoreIcon}</td>`+
          `<td class="col-tv-dpnl ${oosCls}" title="OOS PnL (только за последние ${oosPct}%): ${oosGain.toFixed(1)}%&#10;IS PnL (в полном бэктесте, первые ${isPct}%): ${isGain.toFixed(1)}%&#10;Скорость: IS=${isRate.toFixed(2)}%/1%, OOS=${oosRate.toFixed(2)}%/1%"><span style="font-size:.9em">${oosGain>=0?'+':''}${oosGain.toFixed(1)}</span><br><span style="font-size:.65em;color:var(--text2)">${rateLbl}</span></td>`+
          `<td class="col-tv-ddd ${ddCls2}" title="IS DD: ${isDd.toFixed(1)}% → TV DD: ${tvDd.toFixed(1)}%"><span style="font-size:.9em">${dDd>=0?'+':''}${dDd.toFixed(1)}</span><br><span style="font-size:.65em;color:var(--text2)">×${mulDd.toFixed(1)}</span></td>`+
          `<td class="col-tv-dpdd ${pddCls2}" title="IS P/DD: ${isPdd.toFixed(1)} → TV P/DD: ${tvPdd.toFixed(1)}"><span style="font-size:.9em">${dPdd>=0?'+':''}${dPdd.toFixed(1)}</span><br><span style="font-size:.65em;color:var(--text2)">${retPdd.toFixed(0)}% ret</span></td>`;
      })() +
      `<td class="col-rob">${robCell}</td>` +
      _robTd('oos') + _robTd('walk') + _robTd('param') + _robTd('noise') + _robTd('mc') +
      '<td></td></tr>';
  }

  const tbody = $('tb');
  if (!tbody) return;

  tbody.innerHTML = html;

  // Применяем настройки видимости колонок к только что созданным td
  if (typeof _applyColSettings === 'function') _applyColSettings(getColSettings());
  tbody.onclick = function(e) {
    const tr = e.target.closest('tr');
    if (!tr) return;
    const idx = +tr.dataset.i;
    if (e.target.dataset.delFav !== undefined) {
      const r = _visibleResults[+e.target.dataset.delFav];
      if (r) removeFavByName(r.name, e);
      return;
    }
    if (e.target.dataset.fav !== undefined) {
      const r = _visibleResults[idx];
      if (!r) return;
      toggleFav(r, e);
      const lvl = getFavLevel(r.name);
      e.target.textContent = lvl > 0 ? '★' : '☆';
      e.target.dataset.level = lvl;
      return;
    }
    selectRow(idx);
  };

  // Двойной клик: открывает детали
  tbody.ondblclick = function(e) {
    const tr = e.target.closest('tr');
    if (!tr) return;
    const idx = +tr.dataset.i;
    const r = _visibleResults[idx];
    if (!r || e.target.dataset.fav !== undefined) return;
    showDetail(r);
  };

  // Восстанавливаем выделение если оно было
  if (_selectedIdx >= 0) {
    const selTr = tbody.querySelector(`tr[data-i="${_selectedIdx}"]`);
    if (selTr) selTr.classList.add('sel');
  }

  // Пагинация
  const pg = $('pagination');
  if (!pg) return;
  if (_totalPages <= 1) { pg.style.display = 'none'; return; }
  pg.style.display = 'flex';

  $('pg-first').disabled = _curPage === 0;
  $('pg-prev').disabled  = _curPage === 0;
  $('pg-next').disabled  = _curPage >= _totalPages - 1;
  $('pg-last').disabled  = _curPage >= _totalPages - 1;

  // Страницы — только текстом, без appendChild в цикле
  const winHalf = 3;
  let lo = Math.max(0, _curPage - winHalf);
  let hi = Math.min(_totalPages - 1, _curPage + winHalf);
  if (hi - lo < winHalf * 2) { lo = Math.max(0, hi - winHalf * 2); hi = Math.min(_totalPages - 1, lo + winHalf * 2); }
  let pgHtml = '';
  for (let p = lo; p <= hi; p++) {
    pgHtml += `<button class="pg-btn${p === _curPage ? ' active' : ''}" onclick="goPage(${p})">${p + 1}</button>`;
  }
  $('pg-pages').innerHTML = pgHtml;
  $('pg-info').textContent = `${start + 1}–${end} из ${total}`;
}
