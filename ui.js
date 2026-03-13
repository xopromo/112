// ============================================================
// ⚠️  CLAUDE: ЧИТАЙ MANIFEST.md ПЕРВЫМ ПЕРЕД ЛЮБЫМ ИЗМЕНЕНИЕМ
// Контрольный список критичных функций — в MANIFEST.md
// Проверяй его ДО и ПОСЛЕ каждой правки.
// ============================================================

// ============================================================
// ui.js — ОГЛАВЛЕНИЕ
// ============================================================
// GLOBALS / ИНИЦИАЛИЗАЦИЯ:
//   DATA, results, favourites, ...              line 10
//   $, $v, $c, $n helpers                       line 20
//
// ДАННЫЕ:
//   setLogic(type, val)                         line ~30
//   loadFile(file)                              line ~74
//   parseCSV(text)                              line ~91
//   appendFile(file)                            line ~116
//   clearAppendedData()                         line ~172
//   _parseCSVtoArray(text)                      line ~185
//   updateVolStatus()                           line ~210
//
// ТАБЛИЦА / ФИЛЬТРЫ:
//   switchTableMode(mode)                       line ~246
//   _updateTableModeCounts()                    line ~281
//   applyFiltersDebounced()                     line ~298
//   resetAllFilters()                           line ~303
//   applyFilters()                              line ~317
//   renderResults()                             line ~389
//   goPage(p)                                   line ~409
//   renderVisibleResults()                      line ~417
//   doSort(col)                                 line ~853
//   _getFavAsResults()                          line ~892
//
// ДЕТАЛЬНАЯ ПАНЕЛЬ:
//   row / section / onoff helpers               line ~595
//   showDetail(r)                               line ~609
//   buildCopyText(r, c, slName, tpName)         line ~751
//   closeDetail() / copyDetail()                line ~820
//
// ОПТИМИЗАТОР / УПРАВЛЕНИЕ:
//   storeSave / storeLoad                       line ~854
//   setOptMode / setXMode                       line ~884
//   pauseOpt / checkPause / stopOpt             line ~899
//   updateETA / fmtSec                          line ~932
//   playDone()                                  line ~949
//
// ШАБЛОНЫ:
//   openTplModal / closeTplModal                line ~966
//   renderTplList / gatherSettings              line ~972
//   applySettings / saveTpl / loadTpl           line ~1014
//   exportTpl / importTplFromText               line ~1058
//   showTplToast / toast                        line ~1094
//
// ИЗБРАННОЕ:
//   isFav / toggleFav / _refreshFavStars        line ~1111
//   renderFavBar / toggleFavBody                line ~1147
//   removeFav / loadFavAsTpl                    line ~1182
//
// ПАРСЕР / НАСТРОЙКИ:
//   openParseModal / parseTextToSettings        line ~1488
//   flashField / showParseToast                 line ~1866
//   previewParsedText / applyParsedText         line ~1893
//
// СТАТИСТИКА / ЭКВИТИ:
//   showBestStats / drawEquityData              line ~1936
//   drawEquity / drawEquityForResult            line ~2002
//
// HC / ПОИСК СОСЕДЕЙ:
//   openHCModal / closeHCModal                  line ~2241
//   stopHillClimbing / _hcMetric                line ~2267
//   _hcRobScore(cfg)                            line ~2295
//   _hcRunBacktest(cfg)          ← buildBtCfg   line ~2499
//   _hcMultiStartPoints(...)                    line ~2515
//   _hcNeighbours(cfg, opts)                    line ~2599
//   runHillClimbing()                           line ~2729
//   _hcCluster / _gaCrossover / _gaMutate       line ~3215
//   _runGA(...)                                 line ~3313
//   _hcRenderResults / _hcOpenDetail            line ~3393
//   _hcAddToFav                                 line ~3484
//
// OOS / НОВЫЕ ДАННЫЕ:
//   loadNewData / openOOSCompareModal           line ~3627
//   sortOOSCompare / exportOOSCompareCSV        line ~3698
//   _applyOOSHeaders / doOOSSort                line ~3785
//   _renderOOSSummary / runOOSOnNewData         line ~3883
//   exportOOSTableCSV                           line ~3979
//
// КОЛОНКИ / НАСТРОЙКИ:
//   _loadColSettings / _saveColSettings         line ~4140
//   _applyColSettings / getColSettings          line ~4155
//   setColVisible / toggleColSettings           line ~4172
//   _colShowAll / _colHideRob / _initColSettings line ~4221
//
// MISC:
//   updateClxExitVisibility                     line ~1218
//   openRobustModal / runRobustTest             line ~1233
//   _pwDragStart                                line ~2106
//   runOOSScan                                  line ~2163
//   _updateHCSrcCounts                          line ~2200
// ============================================================

// ============================================================
// GLOBALS
// ============================================================
let DATA = null;
let _rawDATA = null;    // полные загруженные данные до среза по max bars
let _rawDataInfo = '';  // описание источника для finfo ("✅ filename" и т.п.)
let NEW_DATA = null;  // Новые данные для OOS-проверки избранных
let HAS_VOLUME = false;
var results = []; // var (not let) so window.results = x works from other scripts
let equities = {};
let stopped = false;
let slLogic = 'or'; // or | and
let tpLogic = 'or';

const $ = id => document.getElementById(id);
const $v = id => $(id).value.trim();
const $c = id => $(id).checked;
const $n = id => parseFloat($(id).value) || 0;

// ============================================================
// LOGIC TOGGLE
// ============================================================
function setLogic(type, val) {
  if (type === 'sl') {
    slLogic = val;
    $('sl_or').classList.toggle('active', val === 'or');
    $('sl_and').classList.toggle('active', val === 'and');
  } else {
    tpLogic = val;
    $('tp_or').classList.toggle('active', val === 'or');
    $('tp_and').classList.toggle('active', val === 'and');
  }
}

// ============================================================
// EARLY ERROR CATCHING
// ============================================================
window.onerror = function(msg, src, line, col, err) {
  console.error('[USE Opt Error]', msg, 'at', src, line + ':' + col, err);
  // Показываем ошибку в UI если доступно
  try {
    const info = document.getElementById('finfo');
    if (info) info.innerHTML = '<span style="color:#ff4466;font-size:.7em">⚠️ JS ошибка: ' + msg + ' (строка ' + line + ')</span>';
  } catch(e2) {}
  return false;
};

// ============================================================
// FILE LOADING
// ============================================================
// Объявляем переменные для zone и input - инициализируем после DOMContentLoaded
let dropZone, fileInput;
document.addEventListener('DOMContentLoaded', () => {
  dropZone = document.getElementById('drop');
  fileInput = document.getElementById('fi');
  if (!dropZone || !fileInput) return;
  ['dragover','dragenter'].forEach(e => dropZone.addEventListener(e, ev => { ev.preventDefault(); dropZone.classList.add('drag-over'); }));
  ['dragleave','drop'].forEach(e => dropZone.addEventListener(e, ev => { ev.preventDefault(); dropZone.classList.remove('drag-over'); }));
  dropZone.addEventListener('drop', e => loadFile(e.dataTransfer.files[0]));
  fileInput.addEventListener('change', e => loadFile(e.target.files[0]));

  // Append file input
  const appendInput = document.getElementById('fi_append');
  if (appendInput) appendInput.addEventListener('change', e => appendFile(e.target.files[0]));

  // Multi-file input
  const multiInput = document.getElementById('fi_multi');
  if (multiInput) multiInput.addEventListener('change', e => {
    const files = Array.from(e.target.files);
    e.target.value = '';
    if (!files.length) return;
    loadMultipleFiles(files);
  });
});

function loadFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    parseCSV(e.target.result);
    _rawDATA = DATA;
    _rawDataInfo = '✅ ' + file.name;
    applyMaxBars();
    $('rbtn').disabled = false;
    updateVolStatus();
    updatePreview();
    // Вычисляем dataHash для межсессионного surrogate (Идея 10)
    window._dataHash = (DATA.length + '_' + Math.round((DATA[0]?.c||0)*1000) + '_' + Math.round((DATA[DATA.length-1]?.c||0)*1000)).replace(/[^a-z0-9_]/gi,'_');
    _robSurrogate.load(window._dataHash);
    console.log('[RobSurrogate] dataHash:', window._dataHash);
    // Track last loaded file for the current project
    if (typeof ProjectManager !== 'undefined' && ProjectManager.getCurrentId()) {
      ProjectManager.updateLastFile(file.name);
    }
  };
  reader.readAsText(file);
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const hdr = lines[0].toLowerCase().split(',');
  const oi = hdr.findIndex(h => h.includes('open'));
  const hi = hdr.findIndex(h => h.includes('high'));
  const li = hdr.findIndex(h => h.includes('low'));
  const ci = hdr.findIndex(h => h.includes('close'));
  const ti = hdr.findIndex(h => h.includes('time'));
  const vi = hdr.findIndex(h => h.toLowerCase() === 'volume' || h.toLowerCase().includes('vol'));
  HAS_VOLUME = vi >= 0;
  DATA = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',');
    if (c.length > Math.max(oi,hi,li,ci)) {
      const vol = (vi >= 0 && c[vi] && !isNaN(+c[vi])) ? +c[vi] : 0;
      DATA.push({ o: +c[oi], h: +c[hi], l: +c[li], c: +c[ci], t: ti >= 0 ? +c[ti] : 0, v: vol });
    }
  }
}

// ============================================================
// СРЕЗ ДАННЫХ — применяет ограничение "последних N баров"
// ============================================================
function applyMaxBars() {
  if (!_rawDATA) return;
  const n = parseInt($('c_maxbars')?.value) || 0;
  const total = _rawDATA.length;
  DATA = (n > 0 && n < total) ? _rawDATA.slice(total - n) : _rawDATA;
  const used = DATA.length;
  const suffix = used < total ? ` ⤵ ${used}` : '';
  if ($('finfo')) $('finfo').textContent = _rawDataInfo + ': ' + total + ' баров' + suffix;
  const infoEl = $('c_maxbars_info');
  if (infoEl) infoEl.textContent = used < total ? `из ${total}` : '';
}

// ============================================================
// НАКОПЛЕНИЕ ДАННЫХ — объединение нескольких CSV файлов
// ============================================================
let _appendedFiles = []; // история загруженных файлов для UI

function appendFile(file) {
  if (!file) return;
  if (!DATA || DATA.length === 0) {
    // Нет базовых данных — загружаем как обычно
    loadFile(file);
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    const newBars = _parseCSVtoArray(e.target.result);
    if (!newBars.length) {
      alert('Не удалось прочитать файл: ' + file.name);
      return;
    }
    // Объединяем: новые бары + старые, сортируем по времени
    const combined = [...DATA, ...newBars];

    // Дедупликация по timestamp (t)
    // Если t=0 — дедуплицируем по порядковому индексу (нет времени)
    const hasTime = combined.some(b => b.t > 0);
    let merged;
    if (hasTime) {
      // Дедупликация по t
      const seen = new Map();
      for (const bar of combined) {
        if (!seen.has(bar.t) || bar.t === 0) seen.set(bar.t, bar);
      }
      merged = Array.from(seen.values()).sort((a, b) => a.t - b.t);
    } else {
      // Нет временных меток — просто объединяем и убираем точные дубли OHLCV
      const seen = new Set();
      merged = [];
      for (const bar of combined) {
        const key = `${bar.o},${bar.h},${bar.l},${bar.c},${bar.v}`;
        if (!seen.has(key)) { seen.add(key); merged.push(bar); }
      }
    }

    const prevCount = (_rawDATA || DATA).length;
    _rawDATA = merged;
    _appendedFiles.push(file.name);
    _rawDataInfo = '✅ Всего: ' + _appendedFiles.length + ' файл(ов)';
    applyMaxBars();
    const added = _rawDATA.length - prevCount;

    // Проверяем volume
    HAS_VOLUME = DATA.some(b => b.v > 0);
    $('finfo-append').textContent = '+ ' + file.name + ': добавлено ' + added + ' новых баров';
    $('btn-clear-data').style.display = 'inline-block';
    $('rbtn').disabled = false;
    updateVolStatus();
    updatePreview();
  };
  reader.readAsText(file);
}

function clearAppendedData() {
  if (!confirm('Сбросить накопленные данные? Останется только последний загруженный файл.')) return;
  _appendedFiles = [];
  DATA = []; _rawDATA = null; _rawDataInfo = '';
  $('finfo').textContent = '';
  $('finfo-append').textContent = '';
  const infoEl = $('c_maxbars_info'); if (infoEl) infoEl.textContent = '';
  $('btn-clear-data').style.display = 'none';
  $('rbtn').disabled = true;
  alert('Данные сброшены. Загрузи основной CSV заново.');
}

// ============================================================
// ЗАГРУЗКА НЕСКОЛЬКИХ CSV ФАЙЛОВ ОДНОВРЕМЕННО
// ============================================================
function loadMultipleFiles(files) {
  // Sort by filename alphabetically (date order for typical TF naming like BTCUSDT_1h_2023.csv)
  files.sort((a, b) => a.name.localeCompare(b.name));
  const total = files.length;
  let loaded = 0;
  const results = new Array(total);
  const infoEl = $('finfo-append');
  if (infoEl) infoEl.textContent = `Загружаю ${total} файлов…`;

  files.forEach((file, idx) => {
    const reader = new FileReader();
    reader.onload = e => {
      results[idx] = { name: file.name, text: e.target.result };
      loaded++;
      if (loaded === total) _mergeMultiResults(results);
    };
    reader.readAsText(file);
  });
}

function _mergeMultiResults(results) {
  let allBars = [];
  results.forEach(r => { if (r) allBars = allBars.concat(_parseCSVtoArray(r.text)); });

  if (!allBars.length) { alert('Не удалось прочитать файлы'); return; }

  const hasTime = allBars.some(b => b.t > 0);
  let merged;
  if (hasTime) {
    const seen = new Map();
    for (const bar of allBars) if (!seen.has(bar.t)) seen.set(bar.t, bar);
    merged = Array.from(seen.values()).sort((a, b) => a.t - b.t);
  } else {
    const seen = new Set(); merged = [];
    for (const bar of allBars) {
      const key = `${bar.o},${bar.h},${bar.l},${bar.c},${bar.v}`;
      if (!seen.has(key)) { seen.add(key); merged.push(bar); }
    }
  }

  HAS_VOLUME = merged.some(b => b.v > 0);
  _rawDATA = merged;
  _appendedFiles = results.map(r => r.name);
  _rawDataInfo = `✅ ${results.length} файл(ов)`;
  DATA = merged;
  applyMaxBars();

  const infoEl = $('finfo-append');
  if (infoEl) infoEl.textContent = `Объединено: ${merged.length} баров из ${results.length} файлов`;
  $('btn-clear-data').style.display = 'inline-block';
  $('rbtn').disabled = false;
  updateVolStatus();
  updatePreview();
  window._dataHash = (DATA.length + '_' + Math.round((DATA[0]?.c||0)*1000) + '_' + Math.round((DATA[DATA.length-1]?.c||0)*1000)).replace(/[^a-z0-9_]/gi,'_');
  if (typeof _robSurrogate !== 'undefined') _robSurrogate.load(window._dataHash);
}

// Парсинг CSV в массив баров (без присваивания в DATA)
function _parseCSVtoArray(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const hdr = lines[0].toLowerCase().split(',');
  const oi = hdr.findIndex(h => h.includes('open'));
  const hi = hdr.findIndex(h => h.includes('high'));
  const li = hdr.findIndex(h => h.includes('low'));
  const ci = hdr.findIndex(h => h.includes('close'));
  const ti = hdr.findIndex(h => h.includes('time'));
  const vi = hdr.findIndex(h => h === 'volume' || h.includes('vol'));
  if (oi < 0 || hi < 0 || li < 0 || ci < 0) return [];
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',');
    if (c.length > Math.max(oi, hi, li, ci)) {
      const vol = (vi >= 0 && c[vi] && !isNaN(+c[vi])) ? +c[vi] : 0;
      const t = ti >= 0 && c[ti] ? +c[ti] : 0;
      if (!isNaN(+c[oi]) && !isNaN(+c[ci])) {
        result.push({ o: +c[oi], h: +c[hi], l: +c[li], c: +c[ci], t, v: vol });
      }
    }
  }
  return result;
}

function updateVolStatus() {
  const s = $('vol-panel-status');
  const vsEl = $('vol-status');
  if (HAS_VOLUME) {
    s.className = 'vol-ok';
    s.textContent = '✅ Volume загружен — все фильтры доступны';
    vsEl.className = 'vol-ok';
    vsEl.textContent = '✅ Volume есть';
  } else {
    s.className = 'vol-miss';
    s.textContent = '⚠️ Volume не найден — объёмные фильтры недоступны';
    vsEl.className = 'vol-miss';
    vsEl.textContent = '⚠️ Нет Volume';
  }
}

// ============================================================
/* ##REGISTRIES## */

// ============================================================
/* ##OPT_A## */

/* ##CORE## */
// ============================================================
/* ##OPT_B## */

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
  // Показываем/скрываем нужную таблицу
  const stdScroll = document.querySelector('.tbl-scroll');
  const oosTbl    = document.getElementById('oos-tbl-wrap');
  if (mode === 'oos') {
    if (stdScroll) stdScroll.style.display = 'none';
    if (oosTbl)    oosTbl.style.display = '';
  } else {
    if (stdScroll) stdScroll.style.display = '';
    if (oosTbl)    oosTbl.style.display = 'none';
  }
  // Панель новых данных — во всех режимах
  const newDataBar = document.getElementById('new-data-bar');
  if (newDataBar) newDataBar.style.display = 'flex';
  // Кнопка экспорта только в OOS режиме
  const exportBtn = document.getElementById('btn-oos-export');
  if (exportBtn) exportBtn.style.display = (mode === 'oos' && _oosTableResults.length > 0) ? '' : 'none';
  // Кнопка сравнения
  const oosBtn = document.getElementById('btn-oos-new');
  if (oosBtn) oosBtn.style.display = NEW_DATA ? '' : 'none';
  // При переходе в HC или Fav — сбрасываем все фильтры:
  // фильтры основных результатов несовместимы с соседями/избранными
  if (mode === 'hc' || mode === 'fav') {
    if (typeof resetAllFilters === 'function') resetAllFilters();
  } else {
    applyFilters();
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
  applyFilters();
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
    Клик = применить ко всем (вкл. скрытые колонки) &nbsp;·&nbsp; Shift+Клик = только видимые колонки
  </div>`;

  const items = tpls.length
    ? tpls.map((t, i) => `
      <div class="tbl-tpl-item">
        <div style="flex:1;min-width:0">
          <div class="tbl-tpl-name">${t.name}</div>
          <div class="tbl-tpl-date">${new Date(t.ts).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div>
        </div>
        <button class="tpl-ibtn" style="font-size:.62em;padding:2px 6px" onclick="applyTableTpl(${i},false)" title="Применить ко всем колонкам">▶</button>
        <button class="tpl-ibtn" style="font-size:.62em;padding:2px 6px;border-color:var(--accent2);color:var(--accent2)" onclick="applyTableTpl(${i},true)" title="Применить только к видимым колонкам">👁▶</button>
        <button class="tpl-ibtn del" style="font-size:.62em;padding:2px 5px" onclick="deleteTableTpl(${i})" title="Удалить">✕</button>
      </div>`).join('')
    : '<div style="font-size:.65em;color:var(--text3);padding:4px 0">Нет сохранённых шаблонов</div>';

  pop.innerHTML = saveRow + toggleHelp + items;
  btn.parentElement.appendChild(pop);

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
  openTableTplPopover(true); // force reopen with updated list
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
  applyFilters();
}

function applyFilters() {
  const fName  = $('f_name').value.trim().toLowerCase();
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
    if (fName && !r.name.toLowerCase().includes(fName)) return false;
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
}

function renderResults() {
  _curPage = 0;
  // Sync results from window.results if set (e.g., from synthesis_ui)
  if (window.results && Array.isArray(window.results)) {
    results = window.results;
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

  console.log(`[RENDER] renderVisibleResults: total=${total}, page_length=${page.length}, _tableMode=${_tableMode}, _curPage=${_curPage}, _totalPages=${_totalPages}`);
  if (total > 0 && page.length > 0) {
    const first = _visibleResults[0];
    console.log('[RENDER] Первый результат:', `pnl=${first.pnl}, wr=${first.wr}, n=${first.n}, dd=${first.dd}, gt=${first.gt}`);
  }

  // Строим HTML строкой — намного быстрее чем createElement в цикле
  // ── OOS-режим: рендер через applyOOSFilters (своя фильтрация) ──
  if (_tableMode === 'oos') {
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
    const pnlCls = r.pnl >= 0 ? 'pos' : 'neg';
    const pddCls = r.pdd >= 10 ? 'pos' : r.pdd >= 5 ? 'warn' : 'neg';
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
    const fav = isFav(r.name) ? '⭐' : '☆';
    html +=
      `<tr data-i="${rii}" style="cursor:pointer">` +
      `<td class="accent" style="font-size:.66em;max-width:380px;overflow:hidden;text-overflow:ellipsis;user-select:text;cursor:text" title="${r.name}">${r.name}</td>` +
      `<td class="col-fav" style="cursor:pointer;font-size:.85em" data-fav="${rii}">${fav}</td>` +
      `<td class="col-pnl ${pnlCls}">${r.pnl.toFixed(1)}</td>` +
      `<td class="col-wr">${r.wr.toFixed(1)}</td>` +
      `<td class="col-n muted">${r.n}</td>` +
      `<td class="col-dd neg">${r.dd.toFixed(1)}</td>` +
      `<td class="col-pdd ${pddCls}">${r.pdd.toFixed(1)}</td>` +
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
      (()=>{ const v=r.cpcvScore??null; if(v===null) return '<td class="col-cpcv muted">—</td>'; const vc=v>=80?'pos':v>=60?'warn':'neg'; return `<td class="col-cpcv ${vc}" title="CPCV% — блочная валидация: % прибыльных блоков.\nЗаполняется после открытия детали. ≥80% = устойчива ✅">${v}%</td>`; })() + // ##CPCV lazy
      `<td class="col-avg">${r.avg.toFixed(2)}</td>` +
      `<td class="col-p1 ${r.p1 >= 0 ? 'pos' : 'neg'}">${r.p1.toFixed(1)}</td>` +
      `<td class="col-p2 ${r.p2 >= 0 ? 'pos' : 'neg'}">${r.p2.toFixed(1)}</td>` +
      `<td class="col-dwr ${sc}">${r.dwr.toFixed(1)}</td>` +
      `<td class="col-split ${sc}">${stable}</td>`
      + `<td class="col-ls ${lsSc}" title="L:${r.nL||0}сд WR${r.wrL!=null?r.wrL.toFixed(0):'?'}% | S:${r.nS||0}сд WR${r.wrS!=null?r.wrS.toFixed(0):'?'}%">${lsIcon}${r.dwrLS!=null?' '+r.dwrLS.toFixed(0)+'%':''}</td>` +
      (()=>{
        const f = r.cfg && r.cfg._oos && r.cfg._oos.forward;
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

  // ОТЛАДКА: первые 400 символов HTML
  const htmlPreview = html.substring(0, 400);
  console.log('[RENDER] HTML preview:', htmlPreview.substring(0, 200) + '...');

  const tbody = $('tb');
  console.log(`[RENDER] tbody element: exists=${!!tbody}, html_length=${html.length}`);

  if (!tbody) {
    console.error('[RENDER] КРИТИЧЕСКАЯ ОШИБКА: element tb не найден!');
    return;
  }

  tbody.innerHTML = html;
  const firstTr = tbody.querySelector('tr');
  const trs = tbody.querySelectorAll('tr');
  console.log(`[RENDER] HTML вставлен. Всего строк: ${trs.length}, firstTr существует: ${!!firstTr}`);

  // Применяем настройки видимости колонок к только что созданным td
  if (typeof _applyColSettings === 'function') _applyColSettings(getColSettings());
  tbody.onclick = function(e) {
    const tr = e.target.closest('tr');
    if (!tr) return;
    const idx = +tr.dataset.i;
    if (e.target.dataset.fav !== undefined) {
      const r = _visibleResults[idx];
      if (!r) return;
      toggleFav(r, e);
      e.target.textContent = isFav(r.name) ? '⭐' : '☆';
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

// ============================================================
// DETAIL PANEL
// ============================================================
let _detailText = '';

function row(label, val, cls='') {
  return `<div class="dp-row"><span class="dp-label">${label}</span><span class="dp-val ${cls}">${val}</span></div>`;
}
function section(icon, title, content) {
  if (!content) return '';
  return `<div class="dp-section">
    <div class="dp-section-title">${icon} ${title}</div>
    ${content}
  </div>`;
}
function onoff(v, onLabel='', offLabel='ВЫКЛ') {
  return v ? `<span class="on">ВКЛ${onLabel?' · '+onLabel:''}</span>` : `<span class="off">${offLabel}</span>`;
}

function showDetail(r) {
  if (!r.cfg) return;
  _robustResult = r;  // запоминаем для теста устойчивости
  const c = r.cfg;

  $('dp-title').textContent = r.name;

  // Stats bar — unified IS + TV rows via CSS grid
  const _fwd = r.cfg && r.cfg._oos && r.cfg._oos.forward;
  const _hasLS = r.wrL != null;
  // Column count: PnL WinRate Сделок MaxDD P/DD UPI Sortino Omega Pain Burke Serenity = 11
  const _ncols = 11;

  // Build one row of dp-stat cells (same structure for both IS and TV)
  function _statsRow(v) {
    const pddC = v.pdd>=10?'pos':v.pdd>=5?'warn':'neg';
    const dwrC = v.dwr<10?'ok':v.dwr<20?'warn':'bad';
    const cvrC = v.cvr!=null ? (v.cvr>=80?'pos':v.cvr>=50?'warn':'neg') : 'muted';
    const cvrV = v.cvr!=null ? v.cvr+'%' : '—';
    const upiC = v.upi!=null ? (v.upi>=5?'pos':v.upi>=2?'warn':'neg') : 'muted';
    const upiV = v.upi!=null ? v.upi.toFixed(1) : '—';
    const sorC = v.sortino!=null ? (v.sortino>=3?'pos':v.sortino>=2?'warn':'neg') : 'muted'; // ##SOR
    const sorV = v.sortino!=null ? v.sortino.toFixed(1) : '—'; // ##SOR
    const omgC = v.omega!=null ? (v.omega>=3?'pos':v.omega>=2?'warn':'neg') : 'muted'; // ##OMG
    const omgV = v.omega!=null ? v.omega.toFixed(1) : '—'; // ##OMG
    const painC   = v.pain!=null   ? (v.pain>=5?'pos':v.pain>=3?'warn':'neg')     : 'muted'; // ##PAIN
    const painV   = v.pain!=null   ? v.pain.toFixed(1)   : '—'; // ##PAIN
    const burkeC  = v.burke!=null  ? (v.burke>=3?'pos':v.burke>=2?'warn':'neg')   : 'muted'; // ##BURKE
    const burkeV  = v.burke!=null  ? v.burke.toFixed(1)  : '—'; // ##BURKE
    const srntyC  = v.serenity!=null ? (v.serenity>=5?'pos':v.serenity>=3?'warn':'neg') : 'muted'; // ##SRNTY
    const srntyV  = v.serenity!=null ? v.serenity.toFixed(1) : '—'; // ##SRNTY
    const irC     = v.ir!=null ? (v.ir>=1?'pos':v.ir>=0?'warn':'neg') : 'muted'; // ##IR
    const irV     = v.ir!=null ? v.ir.toFixed(1) : '—'; // ##IR
    const h =
      `<div class="dp-stat"><div class="v ${(v.pnl??0)>=0?'pos':'neg'}">${(v.pnl??0).toFixed(1)}%</div><div class="l">PnL</div></div>`+
      `<div class="dp-stat"><div class="v">${(v.wr??0).toFixed(1)}%</div><div class="l">WinRate</div></div>`+
      `<div class="dp-stat"><div class="v muted">${v.n??0}</div><div class="l">Сделок</div></div>`+
      `<div class="dp-stat"><div class="v neg">${(v.dd??0).toFixed(1)}%</div><div class="l">MaxDD</div></div>`+
      `<div class="dp-stat"><div class="v ${(v.pdd??0)>=10?'pos':(v.pdd??0)>=5?'warn':'neg'}">${(v.pdd??0).toFixed(1)}</div><div class="l">P/DD</div></div>`+
      `<div class="dp-stat" title="Ulcer Performance Index = PnL / sqrt(mean(просадка²))\nЛучше Calmar: учитывает длительность и частоту просадок.\n≥5 = устойчива ✅ | 2–5 = умеренно | &lt;2 = нестабильна"><div class="v ${upiC}">${upiV}</div><div class="l">UPI</div></div>`+
      `<div class="dp-stat" title="Sortino Ratio = PnL / downside_dev\ndownside_dev = sqrt(mean(min(Δeq,0)²)) — только отриц. движения.\n≥3 = отлично ✅ | ≥2 = хорошо | &lt;1 = нестабильно"><div class="v ${sorC}">${sorV}</div><div class="l">Sortino</div></div>`+
      `<div class="dp-stat" title="Omega Ratio = Σприросты / Σпадения (уровень баров)\nProfit factor без предположения о нормальности. ≥3 = отлично ✅ | ≥2 = хорошо."><div class="v ${omgC}">${omgV}</div><div class="l">Omega</div></div>`+
      `<div class="dp-stat" title="Pain Ratio = PnL / Pain Index\nPain Index = mean(просадка от пика). Штрафует за длительность любых просадок.\n≥5 = отлично ✅ | ≥3 = хорошо | &lt;1 = плохо"><div class="v ${painC}">${painV}</div><div class="l">Pain</div></div>`+
      `<div class="dp-stat" title="Burke Ratio = PnL / √(Σ просадок²)\nУчитывает ВСЕ события просадок, не только максимальную.\n≥3 = отлично ✅ | ≥2 = хорошо | &lt;0.5 = плохо"><div class="v ${burkeC}">${burkeV}</div><div class="l">Burke</div></div>`+
      `<div class="dp-stat" title="Serenity = PnL / (UlcerIdx × TailFactor)\nTailFactor = CVaR(5%) / mean(убытков). Штраф за хвостовые риски.\n≥5 = отлично ✅ | ≥3 = хорошо | &lt;1 = плохо"><div class="v ${srntyC}">${srntyV}</div><div class="l">Serenity</div></div>`;
    return h;
  }

  const _isLabel = _fwd ? `<div class="dp-stats-lbl" title="Отдельный бэктест только на IS-данных (первые ${r.cfg._oos.isPct}%). Используется для отбора стратегий. PnL может отличаться от IS-части графика из-за разной инициализации индикаторов.">IS · оптимизация (${r.cfg._oos.isPct}%) <span style="font-size:.75em;opacity:.6">· изолированный прогон</span></div>` : '';
  const dp = $('dp-stats');
  dp.style.setProperty('--ncols', _ncols);
  dp.innerHTML = _isLabel + _statsRow({
    pnl: r.pnl, wr: r.wr, n: r.n, dd: r.dd, pdd: r.pdd, dwr: r.dwr,
    p1: r.p1, p2: r.p2, c1: r.c1, c2: r.c2, avg: r.avg, cvr: r.cvr??null, upi: r.upi??null,
    sortino: r.sortino??null, // ##SOR
    omega: r.omega??null, pain: r.pain??null, // ##OMG ##PAIN
    burke: r.burke??null, serenity: r.serenity??null, ir: r.ir??null, // ##BURKE ##SRNTY ##IR
    dwrLS: r.dwrLS??null, wrL: r.wrL??null, nL: r.nL||0, wrS: r.wrS??null, nS: r.nS||0
  });

  // TradingView row (full data) — only when IS/OOS was enabled
  if (_fwd && _fwd.pnlFull != null) {
    const oosPct = 100 - r.cfg._oos.isPct;
    dp.innerHTML +=
      `<div class="dp-stats-lbl tv" title="Полный бэктест на всех данных (IS+OOS). Соответствует equity-графику.">TradingView · полный бэктест (IS+${oosPct}%) <span style="font-size:.75em;opacity:.6">· см. график</span></div>` +
      _statsRow({
        pnl: _fwd.pnlFull, wr: _fwd.wr, n: _fwd.n, dd: _fwd.dd, pdd: _fwd.pdd??0,
        dwr: _fwd.dwr??0, p1: _fwd.p1??0, p2: _fwd.p2??0, c1: _fwd.c1??0, c2: _fwd.c2??0,
        avg: _fwd.avg??0, cvr: _fwd.cvr??null, upi: _fwd.upi??null,
        sortino: _fwd.sortino??null, // ##SOR
        omega: _fwd.omega??null, pain: _fwd.pain??null, // ##OMG ##PAIN
        burke: _fwd.burke??null, serenity: _fwd.serenity??null, ir: _fwd.ir??null, // ##BURKE ##SRNTY ##IR
        dwrLS: _fwd.dwrLS??null, wrL: _fwd.wrL??null, nL: _fwd.nL||0, wrS: _fwd.wrS??null, nS: _fwd.nS||0
      });
  }

  // Helper: SL name
  function slName(pair) {
    if (!pair) return '—';
    if (pair.combo) {
      const lg = c.slLogic==='or' ? 'ИЛИ (выход по ближнему)' : 'И (выход по дальнему)';
      return `ATR ×${pair.a?.m??0}  ${c.slLogic.toUpperCase()}  ${pair.p?.m??0}%  [${lg}]`;
    }
    if (pair.a) return `ATR × ${pair.a.m??0}`;
    if (pair.p) return `${pair.p.m??0}% от цены`;
    return '—';
  }
  function tpName(pair) {
    if (!pair) return '—';
    function one(t) {
      if (!t) return '—';
      if (t.type==='rr') return `R:R = ${t.m??0} (от SL)`;
      if (t.type==='atr') return `ATR × ${t.m??0}`;
      return `${t.m??0}% от цены`;
    }
    if (pair.combo) {
      const lg = c.tpLogic==='or' ? 'ИЛИ (выход по ближнему)' : 'И (выход по дальнему)';
      return `${one(pair.a)}  ${c.tpLogic.toUpperCase()}  ${one(pair.b)}  [${lg}]`;
    }
    return one(pair.a);
  }

  // Build sections HTML
  let html = '';

  // 1. ENTRY PATTERNS
  let ent = '';
  ent += row('Pivot Points',        c.usePivot  ? `ВКЛ · Left=${c.pvL??0} баров, Right=${c.pvR??0} баров` : 'ВЫКЛ', c.usePivot?'on':'off');
  ent += row('Поглощение Engulfing',c.useEngulf ? 'ВКЛ' : 'ВЫКЛ',                                              c.useEngulf?'on':'off');
  ent += row('Pin Bar',             c.usePinBar ? `ВКЛ · тень/тело ≥ ${c.pinRatio??0}` : 'ВЫКЛ',                  c.usePinBar?'on':'off');
  ent += row('Пробой Боллинджера',  c.useBoll   ? `ВКЛ · период=${c.bbLen??0}, σ=${c.bbMult??0}` : 'ВЫКЛ',           c.useBoll?'on':'off');
  ent += row('Пробой Дончиана',     c.useDonch  ? `ВКЛ · период=${c.donLen??0} баров` : 'ВЫКЛ',                   c.useDonch?'on':'off');
  ent += row('ATR-канал пробой',    c.useAtrBo  ? `ВКЛ · EMA ${c.atrBoLen??0} баров, множитель=${c.atrBoMult??0}` : 'ВЫКЛ', c.useAtrBo?'on':'off');
  ent += row('Касание MA',          c.useMaTouch? `ВКЛ · ${c.matType||'EMA'} ${c.matPeriod??0}, зона=${c.matZone??0}%` : 'ВЫКЛ', c.useMaTouch?'on':'off');
  ent += row('Squeeze (BB+Keltner)',c.useSqueeze? `ВКЛ · BB ${c.sqzBBLen??0}, KC mult=${c.sqzKCMult??0}, мин ${c.sqzMinBars??0} баров в сжатии` : 'ВЫКЛ', c.useSqueeze?'on':'off');
  ent += row('Касание трендовой линии', c.useTLTouch ? `ВКЛ · пивот ${c.tlPvL??0}/${c.tlPvR??0}, зона ±${c.tlZonePct??0}%` : 'ВЫКЛ', c.useTLTouch?'on':'off');
  ent += row('Пробой трендовой линии',  c.useTLBreak ? `ВКЛ · пивот ${c.tlPvL??0}/${c.tlPvR??0}, зона ±${c.tlZonePct??0}%` : 'ВЫКЛ', c.useTLBreak?'on':'off');
  ent += row('Флаг (Flag)',             c.useFlag    ? `ВКЛ · импульс ≥${c.flagImpMin??0}×ATR, макс ${c.flagMaxBars??0} баров, откат ≤${c.flagRetrace??0}` : 'ВЫКЛ', c.useFlag?'on':'off');
  ent += row('Треугольник (Triangle)',  c.useTri     ? 'ВКЛ · симм./восх./нисх., пробой' : 'ВЫКЛ', c.useTri?'on':'off');
  ent += row('RSI выход из зоны',   c.useRsiExit  ? `ВКЛ · период=${c.rsiExitPeriod||14}, OS=${c.rsiExitOS||30} / OB=${c.rsiExitOB||70}` : 'ВЫКЛ', c.useRsiExit?'on':'off');
  ent += row('МА кросс-овер',       c.useMaCross  ? `ВКЛ · ${c.maCrossType||'EMA'} период=${c.maCrossP||20}` : 'ВЫКЛ', c.useMaCross?'on':'off');
  ent += row('Свободный вход',      c.useFreeEntry? 'ВКЛ · сигнал на каждом баре' : 'ВЫКЛ', c.useFreeEntry?'on':'off');
  ent += row('MACD кросс',          c.useMacd     ? `ВКЛ · ${c.macdFast||12}/${c.macdSlow||26}/${c.macdSignalP||9}` : 'ВЫКЛ', c.useMacd?'on':'off');
  ent += row('Stochastic выход',    c.useStochExit? `ВКЛ · K=${c.stochKP||14} D=${c.stochDP||3}, OS=${c.stochOS||20} / OB=${c.stochOB||80}` : 'ВЫКЛ', c.useStochExit?'on':'off');
  ent += row('Объём + движение',    c.useVolMove  ? `ВКЛ · объём ≥ ${c.volMoveMult||1.5}×avg` : 'ВЫКЛ', c.useVolMove?'on':'off');
  ent += row('Inside Bar пробой',   c.useInsideBar? 'ВКЛ' : 'ВЫКЛ', c.useInsideBar?'on':'off');
  ent += row('Разворот N свечей',   c.useNReversal? `ВКЛ · серия ≥ ${c.nReversalN||3} свечей` : 'ВЫКЛ', c.useNReversal?'on':'off');
  html += section('🎯', 'ПАТТЕРНЫ ВХОДА', ent);

  // 2. SL / TP
  let sltp = '';
  sltp += row('Stop Loss', slName(c.slPair), 'hi');
  sltp += row('Take Profit', tpName(c.tpPair), 'hi');
  if (c.slPair && c.slPair.combo)
    sltp += row('Логика SL (И/ИЛИ)', c.slLogic==='or' ? 'ИЛИ — выход по первому (ближнему) SL' : 'И — выход только когда оба SL пробиты', 'warn');
  if (c.tpPair && c.tpPair.combo)
    sltp += row('Логика TP (И/ИЛИ)', c.tpLogic==='or' ? 'ИЛИ — выход по первому (ближнему) TP' : 'И — выход только когда оба TP пробиты', 'warn');
  sltp += row('SL Pivot (динам)', c.useSLPiv ? `ВКЛ · Left=${c.slPivL||3}, Right=${c.slPivR||1}, оффсет=${c.slPivOff||0.2}×ATR, макс=${c.slPivMax||3}×ATR${c.slPivTrail?' · трейлинг':''}` : 'ВЫКЛ', c.useSLPiv?'on':'off');
  html += section('🛑', 'СТОП-ЛОСС И ТЕЙК-ПРОФИТ', sltp);

  // 3. EXIT MECHANICS
  let ex = '';
  ex += row('Безубыток (BE)',       c.useBE      ? `ВКЛ · триггер ${c.beTrig??0}×ATR от входа, оффсет SL=${c.beOff??0}×ATR (≈0=точный BE)` : 'ВЫКЛ', c.useBE?'on':'off');
  ex += row('Trailing Stop',        c.useTrail   ? `ВКЛ · триггер ${c.trTrig??0}×ATR, дистанция ${c.trDist??0}×ATR` : 'ВЫКЛ', c.useTrail?'on':'off');
  ex += row('Обратный сигнал', c.useRev ? [
    `ВКЛ · мин баров в сделке: <b>${c.revBars??0}</b>`,
    `Пропустить N сигналов (skip): <b>${c.revSkip||0}</b>`,
    `Кулдаун после сигнала (cooldown): <b>${c.revCooldown||0}</b> баров`,
    `Режим (mode): <b>${c.revMode||'any'}</b>`,
    `Действие (act): <b>${c.revAct||'exit'}</b>`,
    `Источник (src): <b>${c.revSrc||'same'}</b>`,
  ].join('<br>') : 'ВЫКЛ', c.useRev?'on':'off');
  ex += row('Выход по времени',     c.useTime    ? `ВКЛ · максимум ${c.timeBars??0} баров` : 'ВЫКЛ',                c.useTime?'on':'off');
  ex += row('Частичный TP1',        c.usePartial ? `ВКЛ · уровень SL×${c.partRR??0}, закрыть ${c.partPct??0}%${c.partBE?', затем BE':''}` : 'ВЫКЛ', c.usePartial?'on':'off');
  ex += row('Выход на Climax',      c.useClimax  ? `ВКЛ · объём >${c.clxVolMult??0}×средн, тело >${c.clxBodyMult??0}×средн` : 'ВЫКЛ', c.useClimax?'on':'off');
  html += section('🚪', 'МЕХАНИКИ ВЫХОДА', ex);

  // 4. TREND FILTERS
  let filt = '';
  filt += row('MA фильтр тренда',   c.useMA      ? `ВКЛ · ${c.maType||'EMA'} период=${c.maP??0}${(c.htfRatio&&c.htfRatio>1)?' · HTF ×'+c.htfRatio+'tf':''}` : 'ВЫКЛ',               c.useMA?'on':'off');
  filt += row('ADX (сила тренда)',  c.useADX ? `ВКЛ · ADX(${c.adxLen||14}) > ${c.adxThresh??0}${(c.adxHtfRatio&&c.adxHtfRatio>1)?' · HTF ×'+c.adxHtfRatio+'tf':''}${c.useAdxSlope?' · slope↑('+(c.adxSlopeBars??0)+'b)':''}` : 'ВЫКЛ', c.useADX?'on':'off');
  filt += row('ATR расширяется',   c.useAtrExp  ? `ВКЛ · ATR > ${c.atrExpMult??1}× среднего (антифлет)` : 'ВЫКЛ',  c.useAtrExp?'on':'off');
  filt += row('RSI перекуп/перепрод', c.useRSI   ? `ВКЛ · лонг если RSI < ${c.rsiOS??0}, шорт если RSI > ${c.rsiOB??0}` : 'ВЫКЛ', c.useRSI?'on':'off');
  filt += row('Простой тренд MA',   c.useSTrend  ? `ВКЛ · окно ${c.sTrendWin??0} баров` : 'ВЫКЛ',                  c.useSTrend?'on':'off');
  filt += row('Структура рынка HH/LL', c.useStruct ? `ВКЛ · lookback ${c.structLen??0} баров` : 'ВЫКЛ',            c.useStruct?'on':'off');
  filt += row('Свежесть тренда',    c.useFresh   ? `ВКЛ · макс ${c.freshMax??0} баров от пересечения MA` : 'ВЫКЛ', c.useFresh?'on':'off');
  filt += row('Волатильность ATR',  c.useVolF    ? `ВКЛ · ATR < ${c.volFMult??0}× среднего` : 'ВЫКЛ',              c.useVolF?'on':'off');
  filt += row('Дистанция от MA',    c.useMaDist  ? `ВКЛ · не дальше ${c.maDistMax??0}×ATR от MA` : 'ВЫКЛ',         c.useMaDist?'on':'off');
  filt += row('Размер свечи',       c.useCandleF ? `ВКЛ · от ${c.candleMin??0}×ATR до ${c.candleMax??0}×ATR` : 'ВЫКЛ', c.useCandleF?'on':'off');
  filt += row('Серия одноцв. свечей', c.useConsec ? `ВКЛ · блок если ≥ ${c.consecMax??0} одноцветных подряд` : 'ВЫКЛ', c.useConsec?'on':'off');
  filt += row('Подтв. МА (вторая)',  c.useConfirm ? `ВКЛ · ${c.confMatType||'EMA'} период=${c.confN??0}${(c.confHtfRatio&&c.confHtfRatio>1)?' · HTF ×'+c.confHtfRatio+'tf':''} · лонг только если цена > MA, шорт только если цена < MA` : 'ВЫКЛ', c.useConfirm?'on':'off');
  html += section('📊', 'ФИЛЬТРЫ — ТРЕНД И ЦЕНА', filt);

  // 5. VOLUME FILTERS
  let vol = '';
  vol += row('Объём ≥ среднего',    c.useVSA     ? `ВКЛ · объём > ${c.vsaMult??0}× среднего за ${c.vsaPeriod??0} баров` : 'ВЫКЛ', c.useVSA?'on':'off');
  vol += row('Ликвидность (мин)',   c.useLiq     ? `ВКЛ · объём > ${c.liqMin??0}× среднего` : 'ВЫКЛ',              c.useLiq?'on':'off');
  vol += row('Направление объёма',  c.useVolDir  ? `ВКЛ · окно ${c.volDirPeriod??0} баров` : 'ВЫКЛ',               c.useVolDir?'on':'off');
  vol += row('Взвешенный тренд',    c.useWT      ? `ВКЛ · порог score=${c.wtThresh??0}, глубина N=${c.wtN??0}, вес объёма=${c.wtVolW??0}, вес тела=${c.wtBodyW??0}${c.wtUseDist?', + дист. от MA':''}` : 'ВЫКЛ', c.useWT?'on':'off');
  vol += row('Усталость тренда',    c.useFat     ? `ВКЛ · ${c.fatConsec??0} свечей подряд + объём падает до ${c.fatVolDrop??0}× среднего` : 'ВЫКЛ', c.useFat?'on':'off');
  html += section('📦', 'ОБЪЁМНЫЕ ФИЛЬТРЫ', vol);

  // 6. GENERAL
  let gen = '';
  gen += row('ATR период',      `${c.atrPeriod??0} баров`, 'hi');
  const _baseC = (c.baseComm !== undefined ? c.baseComm : c.commission) ?? 0;
  const _spr   = (c.spreadVal !== undefined ? c.spreadVal : 0) ?? 0;
  gen += row('Комиссия (1 сторона)', `${_baseC.toFixed(3)}%  (туда+обратно = ${(_baseC*2).toFixed(3)}%)`, '');
  if (_spr > 0) {
    gen += row('Спред (round-trip)', `${_spr.toFixed(3)}%  (${(_spr/2).toFixed(3)}% за сторону)`, '');
    gen += row('Итого затраты (round-trip)', `${(_baseC*2 + _spr).toFixed(3)}%`, 'hi');
  }
  html += section('⚙️', 'ОБЩИЕ ПАРАМЕТРЫ', gen);

  // ##CPCV_START## — удалить этот блок для отката (вместе с _calcCPCVScore в opt.js)
  {
    const _cpcv = _calcCPCVScore(r.cfg);
    if (_cpcv) r.cpcvScore = _cpcv.score; // ##CPCV кэшируем для колонки таблицы
    let _cpcvHtml = '';
    if (_cpcv) {
      const _sc = _cpcv.score >= 80 ? 'pos' : _cpcv.score >= 60 ? 'warn' : 'neg';
      _cpcvHtml += row('Счёт',
        `<span class="${_sc}">${_cpcv.wins} / ${_cpcv.valid} блоков прибыльны · ${_cpcv.score}%</span>`, '');
      const _bHtml = _cpcv.blocks.map((b, i) => {
        if (!b) return `<span style="display:inline-block;min-width:52px;padding:3px 5px;border-radius:4px;background:var(--bg2);color:var(--muted);font-size:.78em;text-align:center">Б${i+1}<br>нет сд</span>`;
        const _bc = b.pnl > 0 ? 'var(--pos)' : 'var(--neg)';
        return `<span style="display:inline-block;min-width:52px;padding:3px 5px;border-radius:4px;background:var(--bg2);color:${_bc};font-size:.78em;text-align:center">Б${i+1}<br>${b.pnl>0?'+':''}${b.pnl.toFixed(1)}%<br>${b.n}сд WR${b.wr}%</span>`;
      }).join('');
      _cpcvHtml += `<div class="dp-row"><span class="dp-label">Блоки</span><span class="dp-val" style="display:flex;gap:5px;flex-wrap:wrap">${_bHtml}</span></div>`;
    } else {
      _cpcvHtml += row('Статус', 'нет данных — нужно ≥300 баров и ≥3 блока с ≥2 сделками', 'muted');
    }
    html = section('📊', 'CPCV — БЛОЧНАЯ ВАЛИДАЦИЯ', _cpcvHtml) + html;
  }
  // ##CPCV_END##

  // ##KR_SQN_START## — удалить для отката (вместе с _calcKRatio/_calcMCPerm в opt.js)
  // SQN теперь из r.sqn (core.js sumPnl2); K-Ratio и MC Perm требуют re-run
  // collectTrades=true нужен для MC Permutation Test (##MC_PERM)
  {
    let _rKS = null;
    try {
      const _ind = _calcIndicators(r.cfg);
      const _btc = buildBtCfg(r.cfg, _ind);
      _btc.collectTrades = true; // ##MC_PERM — нужен tradePnl[] для permutation test
      _rKS = backtest(_ind.pvLo, _ind.pvHi, _ind.atrArr, _btc);
    } catch(_) {}

    const _kr  = _rKS ? _calcKRatio(_rKS.eq) : (r.kRatio ?? null);
    const _sqn = r.sqn ?? (_rKS ? _rKS.sqn : null);
    if (_rKS && _kr != null) r.kRatio = _kr; // кэшируем для колонки таблицы

    let _ksHtml = '';
    if (_kr !== null) {
      const _kc = _kr >= 2 ? 'pos' : _kr >= 1 ? 'warn' : 'neg';
      _ksHtml += row('K-Ratio',
        `<span class="${_kc}">${_kr.toFixed(1)}</span>` +
        ` <span style="opacity:.6;font-size:.85em">${_kr >= 2 ? 'равномерный рост' : _kr >= 1 ? 'умеренная стабильность' : 'нестабильный рост'}</span>`, '');
    } else {
      _ksHtml += row('K-Ratio', 'нет данных', 'muted');
    }
    if (_sqn !== null) {
      const _sc = _sqn >= 5 ? 'pos' : _sqn >= 2 ? 'warn' : 'neg';
      _ksHtml += row('SQN',
        `<span class="${_sc}">${_sqn.toFixed(1)}</span>` +
        ` <span style="opacity:.6;font-size:.85em">${_sqn >= 5 ? 'excellent ✅' : _sqn >= 3 ? 'good' : _sqn >= 1 ? 'average' : 'poor'}</span>`, '');
    } else {
      _ksHtml += row('SQN', 'нет данных — нужно ≥10 сделок', 'muted');
    }
    html = section('📐', 'K-RATIO · SQN', _ksHtml) + html;
  }
  // ##KR_SQN_END##

  // ##MC_PERM_START## — удалить для отката (вместе с _calcMCPerm в opt.js)
  //                   + убрать collectTrades=true в ##KR_SQN_START## выше
  {
    const _pArr = typeof _rKS !== 'undefined' && _rKS ? _rKS.tradePnl : null;
    const _pval = _calcMCPerm(_pArr);
    let _mpHtml = '';
    if (_pval !== null) {
      const _pc = _pval <= 0.01 ? 'pos' : _pval <= 0.05 ? 'warn' : 'neg';
      const _plabel = _pval <= 0.01 ? 'очень значимо ✅' : _pval <= 0.05 ? 'значимо' : 'незначимо';
      _mpHtml += row('p-value',
        `<span class="${_pc}">${_pval.toFixed(3)}</span>` +
        ` <span style="opacity:.6;font-size:.85em">${_plabel}</span>`, '');
      _mpHtml += row('Интерпретация',
        `${_pval <= 0.05 ? 'Стратегия статистически значима — порядок сделок важен' : 'Результат может быть случайностью порядка сделок'}`, 'muted');
    } else {
      _mpHtml += row('p-value', 'нет данных — нужно ≥10 сделок', 'muted');
    }
    html = section('🎲', 'MC PERMUTATION TEST (1000 итераций)', _mpHtml) + html;
  }
  // ##MC_PERM_END##

  // ##AIC_BIC_MDL_START## — удалить для отката: эти строки + _countCfgParams/_calcInfoCriteria в opt.js
  {
    const _ic = _calcInfoCriteria(r.n, r.wr, r.cfg);
    let _icHtml = '';
    if (_ic) {
      const { k, aic, bic, mdl, deltaBic } = _ic;
      const kLabel = k <= 5 ? 'простая' : k <= 10 ? 'умеренная' : k <= 16 ? 'сложная' : 'очень сложная';
      const dC = deltaBic > 10 ? 'pos' : deltaBic > 0 ? 'warn' : 'neg';
      const dLabel = deltaBic > 10 ? 'стратегия оправдывает сложность ✅' : deltaBic > 0 ? 'слабое превосходство над случайной' : 'хуже случайного — возможный перефиттинг';
      _icHtml += row('k (параметров)', `${k} <span style="opacity:.6;font-size:.85em">${kLabel} стратегия</span>`, '');
      _icHtml += row('AIC', `${aic.toFixed(1)} <span style="opacity:.5;font-size:.8em">↓ лучше · 2k − 2·logL</span>`, 'muted');
      _icHtml += row('BIC', `${bic.toFixed(1)} <span style="opacity:.5;font-size:.8em">↓ лучше · k·ln(n) − 2·logL</span>`, 'muted');
      _icHtml += row('MDL (bits)', `${mdl.toFixed(1)} <span style="opacity:.5;font-size:.8em">↓ лучше · BIC/2</span>`, 'muted');
      _icHtml += row('ΔBIC vs случайной', `<span class="${dC}">${deltaBic > 0 ? '+' : ''}${deltaBic.toFixed(1)}</span> <span style="opacity:.6;font-size:.85em">${dLabel}</span>`, '');
    } else {
      _icHtml += row('IC', 'нет данных — нужно ≥5 сделок', 'muted');
    }
    html = section('🧮', 'AIC · BIC · MDL (сложность модели)', _icHtml) + html;
  }
  // ##AIC_BIC_MDL_END##

  // ##PSR_START## — удалить для отката: эти строки + _calcPSR/_normCDF в opt.js
  {
    const _pArr2 = typeof _rKS !== 'undefined' && _rKS ? _rKS.tradePnl : null;
    const _psr   = _calcPSR(_pArr2);
    let _psrHtml = '';
    if (_psr !== null) {
      const _psrC = _psr >= 95 ? 'pos' : _psr >= 70 ? 'warn' : 'neg';
      const _psrLabel = _psr >= 95 ? 'статистически значимо ✅' : _psr >= 70 ? 'умеренно значимо' : 'недостаточно значимо';
      _psrHtml += row('PSR',
        `<span class="${_psrC}">${_psr.toFixed(1)}%</span>` +
        ` <span style="opacity:.6;font-size:.85em">${_psrLabel}</span>`, '');
      _psrHtml += row('Интерпретация',
        'Вероятность что SR > 0 с учётом skewness и kurtosis сделок. PSR ≥ 95% = уверенный позитивный Sharpe.', 'muted');
    } else {
      _psrHtml += row('PSR', 'нет данных — нужно ≥20 сделок', 'muted');
    }
    html = section('📈', 'PSR — ВЕРОЯТНОСТНЫЙ SHARPE RATIO', _psrHtml) + html;
  }
  // ##PSR_END##

  // ##ABLATION_START## — удалить для отката: эти строки + _calcFilterAblation в opt.js
  {
    const _abl = _calcFilterAblation(r.cfg);
    let _ablHtml = '';
    if (_abl && _abl.items.length > 0) {
      _ablHtml += row('Базовый PnL', `${_abl.basePnl.toFixed(1)}%`, 'muted');
      for (const itm of _abl.items) {
        const dC = itm.delta <= -1 ? 'pos' : itm.delta >= 1 ? 'neg' : 'muted';
        const sign = itm.delta > 0 ? '+' : '';
        const label = itm.delta <= -2 ? '🔑 критичен' : itm.delta <= -0.5 ? '✅ важен' : itm.delta >= 2 ? '❌ мешает' : itm.delta >= 0.5 ? '⚠️ лишний?' : '→ нейтральный';
        _ablHtml += row(`${itm.id}`, `<span class="${dC}">${sign}${itm.delta.toFixed(1)}%</span> <span style="opacity:.55;font-size:.82em">${label}</span>`, '');
      }
    } else {
      _ablHtml += row('Статус', 'нет активных фильтров для анализа', 'muted');
    }
    html = section('🔬', 'FEATURE IMPORTANCE (ABLATION)', _ablHtml) + html;
  }
  // ##ABLATION_END##

  // ##HMM_START## — удалить для отката: эти строки + _calcHMM/_calcRegimePerf в opt.js
  {
    const _hmm = _calcHMM();
    let _hmmHtml = '';
    if (_hmm) {
      const bState = _hmm.bullState, beState = 1 - bState;
      const bMean  = bState === 0 ? _hmm.m0 : _hmm.m1;
      const bkMean = bState === 0 ? _hmm.m1 : _hmm.m0;
      const bStay  = _hmm.stayProb[bState], beStay = _hmm.stayProb[beState];
      const bullC  = _hmm.bullPct >= 60 ? 'pos' : _hmm.bullPct >= 40 ? 'warn' : 'neg';
      _hmmHtml += row('Bull режим', `<span class="${bullC}">${_hmm.bullPct}% баров</span> · ср.return ${bMean > 0 ? '+' : ''}${bMean.toFixed(3)}%/бар · остаётся ${bStay}% времени`, '');
      _hmmHtml += row('Bear режим', `<span class="neg">${_hmm.bearPct}% баров</span> · ср.return ${bkMean > 0 ? '+' : ''}${bkMean.toFixed(3)}%/бар · остаётся ${beStay}% времени`, '');
      // Regime Performance
      const _rp = _calcRegimePerf(r.cfg, _hmm);
      if (_rp) {
        const bpC = _rp.bullPnl >= 0 ? 'pos' : 'neg', bkpC = _rp.bearPnl >= 0 ? 'pos' : 'neg';
        _hmmHtml += row('PnL в bull', `<span class="${bpC}">${_rp.bullPnl > 0 ? '+' : ''}${_rp.bullPnl.toFixed(1)}%</span> <span style="opacity:.55;font-size:.82em">(${_rp.bullN} баров)</span>`, '');
        _hmmHtml += row('PnL в bear', `<span class="${bkpC}">${_rp.bearPnl > 0 ? '+' : ''}${_rp.bearPnl.toFixed(1)}%</span> <span style="opacity:.55;font-size:.82em">(${_rp.bearN} баров)</span>`, '');
        const regimeBias = _rp.bullPnl > _rp.bearPnl ? 'тренд-стратегия ✅' : _rp.bearPnl > _rp.bullPnl ? 'боковик-стратегия' : 'нейтральная';
        _hmmHtml += row('Характер', regimeBias, 'muted');
      }
    } else {
      _hmmHtml += row('HMM', 'нет данных — нужно ≥100 баров', 'muted');
    }
    html = section('🌊', 'HMM РЕЖИМЫ + ПРОИЗВОДИТЕЛЬНОСТЬ', _hmmHtml) + html;
  }
  // ##HMM_END##

  $('dp-body').innerHTML = html;

  // Build copy text
  _detailText = buildCopyText(r, c, slName, tpName);

  $('detail-overlay').classList.add('open');
  $('detail-panel').classList.add('open');
}

function buildCopyText(r, c, slName, tpName) {
  const lines = [];
  const on = (flag, text) => flag ? ('ВКЛ' + (text ? ', ' + text : '')) : 'ВЫКЛ';
  lines.push('=== USE OPTIMIZER v6 — НАСТРОЙКИ ===');
  lines.push('Конфиг: ' + r.name);
  lines.push('');
  lines.push('PnL: ' + (r.pnl??0).toFixed(1) + '%   WR: ' + (r.wr??0).toFixed(1) + '%   Сделок: ' + (r.n??0));
  lines.push('MaxDD: ' + (r.dd??0).toFixed(1) + '%   P/DD: ' + (r.pdd??0).toFixed(1) + '   Avg: ' + (r.avg??0).toFixed(2) + '%');
  lines.push('1п: ' + (r.p1??0).toFixed(1) + '% (' + (r.c1??0) + ' сд)   2п: ' + (r.p2??0).toFixed(1) + '% (' + (r.c2??0) + ' сд)   ΔWR: ' + (r.dwr??0).toFixed(1) + '%');
  if (r.wrL != null && r.wrS != null) lines.push('Лонг: WR ' + r.wrL.toFixed(0) + '% (' + (r.nL??0) + ' сд)   Шорт: WR ' + r.wrS.toFixed(0) + '% (' + (r.nS??0) + ' сд)   ΔWR L/S: ' + (r.dwrLS != null ? r.dwrLS.toFixed(0) : '?') + '%');
  lines.push('');
  lines.push('--- ПАТТЕРНЫ ВХОДА ---');
  lines.push('Pivot Points:       ' + on(c.usePivot,  'Left=' + c.pvL + ', Right=' + c.pvR));
  lines.push('Поглощение:         ' + on(c.useEngulf));
  lines.push('Pin Bar:            ' + on(c.usePinBar, 'тень/тело>=' + c.pinRatio));
  lines.push('Боллинджер пробой:  ' + on(c.useBoll,   'период=' + c.bbLen + ', sigma=' + c.bbMult));
  lines.push('Дончиан пробой:     ' + on(c.useDonch,  'период=' + c.donLen));
  lines.push('ATR-канал пробой:   ' + on(c.useAtrBo,  'EMA=' + c.atrBoLen + ', mult=' + c.atrBoMult));
  lines.push('Касание MA:         ' + on(c.useMaTouch,'тип=' + c.matType + ', период=' + c.matPeriod + ', зона=' + c.matZone + '%'));
  lines.push('Squeeze:            ' + on(c.useSqueeze,'BB=' + c.sqzBBLen + ', KC mult=' + c.sqzKCMult + ', мин=' + c.sqzMinBars + ' баров'));
  lines.push('');
  lines.push('--- СТОП-ЛОСС / ТЕЙК-ПРОФИТ ---');
  lines.push('Stop Loss:    ' + slName(c.slPair));
  lines.push('Take Profit:  ' + tpName(c.tpPair));
  if (c.slPair && c.slPair.combo) lines.push('Логика SL: ' + (c.slLogic==='or' ? 'ИЛИ (выход по ближнему)' : 'И (выход по дальнему)'));
  if (c.tpPair && c.tpPair.combo) lines.push('Логика TP: ' + (c.tpLogic==='or' ? 'ИЛИ (выход по ближнему)' : 'И (выход по дальнему)'));
  lines.push('');
  lines.push('--- МЕХАНИКИ ВЫХОДА ---');
  lines.push('Безубыток:       ' + on(c.useBE,      'триггер=' + (c.beTrig??0) + 'xATR, оффсет=' + (c.beOff??0) + 'xATR'));
  lines.push('Trailing Stop:   ' + on(c.useTrail,   'триггер=' + (c.trTrig??0) + 'xATR, дист=' + (c.trDist??0) + 'xATR'));
  lines.push('Обратный сигнал: ' + on(c.useRev,
    'мин=' + (c.revBars??0) + ' баров' +
    ' | skip=' + (c.revSkip||0) +
    ' | cooldown=' + (c.revCooldown||0) +
    ' | mode=' + (c.revMode||'any') +
    ' | act=' + (c.revAct||'exit') +
    ' | src=' + (c.revSrc||'same')
  ));
  lines.push('Выход по времени:' + on(c.useTime,    'макс=' + (c.timeBars??0) + ' баров'));
  lines.push('Частичный TP1:   ' + on(c.usePartial, 'уровень=SLx' + (c.partRR??0) + ', закрыть ' + (c.partPct??0) + '%' + (c.partBE ? ', потом BE' : '')));
  lines.push('Climax выход:    ' + on(c.useClimax,  'объём>' + (c.clxVolMult??0) + 'x, тело>' + (c.clxBodyMult??0) + 'x'));
  lines.push('');
  lines.push('--- ФИЛЬТРЫ ТРЕНДА ---');
  lines.push('MA фильтр:        ' + on(c.useMA,      (c.maType||'EMA') + ' период=' + (c.maP??0) + ((c.htfRatio&&c.htfRatio>1) ? ' HTF×'+c.htfRatio+'tf' : '')));
  lines.push('ADX:              ' + on(c.useADX,     'ADX>' + (c.adxThresh??0) + ((c.adxHtfRatio&&c.adxHtfRatio>1) ? ' HTF×'+c.adxHtfRatio+'tf' : '') + (c.useAdxSlope ? ' slope↑('+(c.adxSlopeBars??0)+'b)' : '')));
  lines.push('ATR расширяется:  ' + on(c.useAtrExp,  'ATR>' + (c.atrExpMult||1.0) + 'x среднего'));
  lines.push('RSI:              ' + on(c.useRSI,     'лонг<' + (c.rsiOS??0) + ', шорт>' + (c.rsiOB??0)));
  lines.push('Простой тренд:    ' + on(c.useSTrend,  'окно=' + (c.sTrendWin??0) + ' баров'));
  lines.push('Структура рынка:  ' + on(c.useStruct,  'lookback=' + (c.structLen??0)));
  lines.push('Свежесть тренда:  ' + on(c.useFresh,   'макс=' + (c.freshMax??0) + ' баров'));
  lines.push('Волатильность ATR:' + on(c.useVolF,    'ATR<' + (c.volFMult??0) + 'x среднего'));
  lines.push('Дистанция от MA:  ' + on(c.useMaDist,  'макс=' + (c.maDistMax??0) + 'xATR'));
  lines.push('Размер свечи:     ' + on(c.useCandleF, '' + (c.candleMin??0) + '-' + (c.candleMax??0) + 'xATR'));
  lines.push('Серия свечей:     ' + on(c.useConsec,  'макс=' + (c.consecMax??0) + ' одноцветных'));
  lines.push('Подтв. тренда:    ' + on(c.useConfirm, 'MA тип=' + (c.confMatType||'EMA') + ' период=' + (c.confN??0) + ((c.confHtfRatio&&c.confHtfRatio>1) ? ' HTF×'+c.confHtfRatio+'tf' : '')));
  lines.push('');
  lines.push('--- ОБЪЁМНЫЕ ФИЛЬТРЫ ---');
  lines.push('VSA (объём):      ' + on(c.useVSA,     'объём>' + (c.vsaMult??0) + 'x за ' + (c.vsaPeriod??0) + ' баров'));
  lines.push('Ликвидность:      ' + on(c.useLiq,     'мин=' + (c.liqMin??0) + 'x среднего'));
  lines.push('Направл. объёма:  ' + on(c.useVolDir,  'окно=' + (c.volDirPeriod??0) + ' баров'));
  lines.push('Взвеш. тренд WT:  ' + on(c.useWT,      'score>' + (c.wtThresh??0) + ', N=' + (c.wtN??0) + ', volW=' + (c.wtVolW??0) + ', bodyW=' + (c.wtBodyW??0) + (c.wtUseDist ? ', distMA=да' : '')));
  lines.push('Усталость тренда: ' + on(c.useFat,     (c.fatConsec??0) + ' свечей, vol<' + (c.fatVolDrop??0) + 'x'));
  lines.push('');
  lines.push('--- ОБЩЕЕ ---');
  lines.push('ATR период: ' + (c.atrPeriod??0));
  const _cc = (c.baseComm !== undefined ? c.baseComm : c.commission) ?? 0;
  const _sp = (c.spreadVal !== undefined ? c.spreadVal : 0) ?? 0;
  lines.push('Комиссия: ' + _cc.toFixed(3) + '% (1 ст.) = ' + (_cc*2).toFixed(3) + '% (round-trip)' + (_sp>0 ? ', Спред: ' + _sp.toFixed(3) + '% (r/t)' : ''));
  return lines.join('\n');
}
function closeDetail() {
  $('detail-overlay').classList.remove('open');
  $('detail-panel').classList.remove('open');
}

function copyDetail() {
  if (!_detailText) return;
  navigator.clipboard.writeText(_detailText).then(() => {
    const btn = document.querySelector('.dp-copy-btn');
    const orig = btn.textContent;
    btn.textContent = '✅ Скопировано!';
    setTimeout(() => btn.textContent = orig, 2000);
  });
}


// ============================================================
// v6 ADDITIONS
// ============================================================

// --- State ---
let paused = false;
let pauseResolve = null;
let optMode = 'full'; // full | prune | mc | tpe | bo
let revMode   = 'any';  // any | plus | minus
let revAct    = 'exit'; // exit | rev | skip
let timeMode  = 'any';  // any | plus
let clxMode   = 'any';  // any | plus
let favourites = [];
let templates = [];
let _favNs = '';   // неймспейс избранных: 'BTC_1h', 'ETH_4h' и т.д. Пустая строка = без метки.
let resultCache = new Map();
let _t0 = 0;

// --- Persistent storage helpers (window.storage API) ---
// Returns the storage key for the current project's favourites
function _favKey() {
  const id = typeof ProjectManager !== 'undefined' ? ProjectManager.getCurrentId() : null;
  return id ? 'use6_fav_' + id : 'use6_fav';
}

async function storeSave(key, data) {
  try {
    if (window.storage) await window.storage.set(key, JSON.stringify(data));
    else localStorage.setItem(key, JSON.stringify(data));
  } catch(e) {}
}
async function storeLoad(key) {
  try {
    if (window.storage) {
      const r = await window.storage.get(key);
      return r ? JSON.parse(r.value) : null;
    } else {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    }
  } catch(e) { return null; }
}

// Загружаем при старте
window.addEventListener('load', async () => {
  templates = (await storeLoad('use6_tpl')) || [];
  const def = templates.find(t => t.isDefault);
  if (def) applySettings(def.settings);
  renderTplList();
  updateClxExitVisibility();

  // ── Projects ──────────────────────────────────────────────
  ProjectManager.init();
  const projs = ProjectManager.getAll();
  if (projs.length === 0) {
    // Первый запуск — мигрируем старые избранные, показываем диалог создания
    favourites = (await storeLoad(_favKey())) || [];
    _favNs = localStorage.getItem('use6_fav_ns') || '';
    openCreateProject(true); // true = первый запуск, нельзя закрыть
  } else {
    await setProject(ProjectManager.getCurrentId() || projs[0].id);
  }

  renderFavBar();
  const nsEl = document.getElementById('fav-ns-label');
  if (nsEl) nsEl.textContent = _favNs ? _favNs : '';

  // Периодическая проверка новых файлов в папке проекта
  setInterval(_pollNewFiles, 30000);
});

// --- Mode buttons ---
function setOptMode(m) {
  optMode = m;
  ['full','prune','mc','tpe','bo'].forEach(x => { const el=document.getElementById('mode_'+x); if(el) el.classList.toggle('active', x===m); });
  document.getElementById('mc_n').style.display = m==='mc' ? 'inline-block' : 'none';
  const _tpeInputsEl = document.getElementById('tpe_inputs'); if(_tpeInputsEl) _tpeInputsEl.style.display = m==='tpe' ? 'inline-flex' : 'none';
  const _boInputsEl  = document.getElementById('bo_inputs');  if(_boInputsEl)  _boInputsEl.style.display  = m==='bo'  ? 'inline-flex' : 'none'; // ##BAYES_OPT
  updatePreview();
}
function setXMode(type, val) {
  if (type==='rev')     { revMode=val;  ['any','plus','minus'].forEach(x=>{ const el=$('revmode_'+x); if(el) el.classList.toggle('active',x===val); }); }
  if (type==='revact')  { revAct=val;   ['exit','rev','skip'].forEach(x=>{ const el=$('revact_'+x); if(el) el.classList.toggle('active',x===val); }); }
  if (type==='time')    { timeMode=val; ['any','plus'].forEach(x=>{ const el=$('timemode_'+x); if(el) el.classList.toggle('active',x===val); }); }
  if (type==='clx')     { clxMode=val;  ['any','plus'].forEach(x=>{ const el=$('clxmode_'+x); if(el) el.classList.toggle('active',x===val); }); }
}

// --- Pause ---
async function pauseOpt() {
  if (!paused) {
    paused = true;
    $('pbtn').textContent = '▶ Продолжить';
    $('pbtn').style.background = 'rgba(0,230,118,.15)';
    $('pbtn').style.borderColor = 'var(--green)';
    $('pbtn').style.color = 'var(--green)';
    renderResults();
  } else {
    paused = false;
    $('pbtn').textContent = '⏸ Пауза';
    $('pbtn').style.background = '';
    $('pbtn').style.borderColor = '';
    $('pbtn').style.color = '';
    if (pauseResolve) { pauseResolve(); pauseResolve = null; }
  }
}
async function checkPause() {
  if (!paused) return;
  await new Promise(r => { pauseResolve = r; });
}

// ── yieldToUI: уступает управление UI без заморозки в фоновых вкладках ──
// MessageChannel — настоящий macrotask, браузеры НЕ throttle-ят его до
// 1000ms в фоновых вкладках (в отличие от setTimeout). Это позволяет TPE,
// поиску соседей и тестам устойчивости работать в неактивной вкладке.
const _yieldCh = new MessageChannel();
function yieldToUI() {
  return new Promise(res => {
    _yieldCh.port1.onmessage = res;
    _yieldCh.port2.postMessage(0);
  });
}

// --- Stop ---
function stopOpt() {
  stopped = true; paused = false;
  if (pauseResolve) { pauseResolve(); pauseResolve = null; }
  $('pbtn').style.display = 'none';
  $('sbtn').style.display = 'none';
  $('rbtn').style.display = '';
  $('rbtn').disabled = false;
}

// --- ETA ---
function updateETA(done, total, found) {
  const pct = total > 0 ? done/total : 0;
  $('pbar').style.width = (pct*100).toFixed(1) + '%';
  const progEl = $('prog');
  progEl.textContent = done === 0 && total > 0
    ? '⟳ ' + fmtNum(total) + ' вар.'
    : fmtNum(done) + ' / ' + fmtNum(total) + ' вар.';
  $('eta-found').textContent = found > 0 ? '✅ ' + fmtNum(found) + ' ok' : '';

  // Synthesis mode progress logging
  if (optMode === 'synthesis' && typeof _setSynthProgress !== 'undefined') {
    const overallPct = Math.max(15, Math.min(85, 10 + pct * 75)); // 10-85% range
    const rate = _t0 > 0 ? done / ((Date.now() - _t0) / 1000) : 0;
    let logMsg = '🔨 ' + fmtNum(done) + '/' + fmtNum(total) + ' стратегий тестировано';
    if (found > 0) logMsg += ' · ✅ ' + found + ' годных';
    if (rate > 0) logMsg += ' (' + Math.round(rate) + '/с)';
    _setSynthProgress(overallPct, logMsg);
  }

  if (_t0 > 0) {
    const elapsed = (Date.now() - _t0) / 1000;
    if (done > 5 && elapsed > 0.3) {
      const rate = done / elapsed;
      const rem = (total - done) / Math.max(rate, 0.1);
      if (rem > 1) {
        $('eta-time').textContent = '⏱ ' + fmtSec(rem);
      } else if (elapsed > 1) {
        // Всё почти готово — показываем скорость
        $('eta-time').textContent = '⚡ ' + fmtNum(Math.round(rate)) + '/с';
      } else {
        $('eta-time').textContent = '';
      }
    }
  }
}
function fmtSec(s) {
  if (s < 60) return Math.ceil(s) + 'с';
  if (s < 3600) return Math.ceil(s/60) + 'мин';
  return (s/3600).toFixed(1) + 'ч';
}

// --- Sound ---
function playDone() {
  if (!$c('snd_on')) return;
  try {
    const ac = new (window.AudioContext||window.webkitAudioContext)();
    const vol = parseFloat($('snd_vol').value) * 0.3;
    const g = ac.createGain(); g.gain.value = vol; g.connect(ac.destination);
    [[523,0],[659,.15],[784,.3],[1047,.5]].forEach(([f,t]) => {
      const o = ac.createOscillator(); o.type='sine'; o.frequency.value=f;
      o.connect(g); o.start(ac.currentTime+t); o.stop(ac.currentTime+t+.22);
    });
  } catch(e) {}
}

// --- Pruning (early exit in backtest at 25% mark) ---
// Injected into backtest via cfg.pruning flag

// --- Templates ---
function openTplModal() {
  renderTplList();
  $('tpl-overlay').classList.add('open');
}
function closeTplModal() { $('tpl-overlay').classList.remove('open'); }

// ── Pine Script генератор ──────────────────────────────────────────────────
function openPineModal() {
  if (!_robustResult) { alert('Сначала откройте детали результата'); return; }
  const r = _robustResult;
  if (typeof generatePineScript !== 'function') {
    alert('Генератор Pine Script не загружен (pine_export.js)'); return;
  }
  const code = generatePineScript(r);
  $('pine-code').value = code;
  $('pine-desc').textContent = `Конфиг: ${r.name}  ·  PnL ${r.pnl.toFixed(1)}%  WR ${r.wr.toFixed(1)}%  Сделок ${r.n}  DD ${r.dd.toFixed(1)}%`;
  $('pine-overlay').classList.add('open');
}
function closePineModal() { $('pine-overlay').classList.remove('open'); }
function copyPineCode() {
  const ta = $('pine-code');
  ta.select();
  document.execCommand('copy');
  const btn = event.target;
  btn.textContent = '✅ Скопировано!';
  setTimeout(() => btn.textContent = '📋 Скопировать код', 1500);
}
function downloadPineCode() {
  const code = $('pine-code').value;
  const name = (_robustResult && _robustResult.name || 'strategy').replace(/[^\w\-]/g,'_').slice(0,40);
  const blob = new Blob([code], {type:'text/plain'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `USE_${name}.pine`;
  a.click();
}

function renderTplList() {
  const el = $('tpl-list-el');
  if (!templates.length) {
    el.innerHTML = '<div style="font-size:.68em;color:var(--text3);padding:8px">Нет сохранённых шаблонов</div>';
    return;
  }
  el.innerHTML = templates.map((t,i) => `
    <div class="tpl-item ${t.isDefault?'def':''}">
      <div style="flex:1;min-width:0">
        <div class="tpl-item-name">${t.isDefault?'⭐ ':''}${t.name}</div>
        <div class="tpl-item-date">${new Date(t.ts).toLocaleString('ru-RU')}</div>
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0">
        <div class="tpl-ibtn" onclick="loadTpl(${i})" title="Загрузить настройки">Загрузить</div>
        <div class="tpl-ibtn" onclick="exportTpl(${i})" title="Скопировать шаблон в буфер (для переноса)">📤</div>
        <div class="tpl-ibtn" onclick="setDefaultTpl(${i})" title="Загружать по умолчанию при открытии">${t.isDefault?'★':'☆'}</div>
        <div class="tpl-ibtn del" onclick="deleteTpl(${i})" title="Удалить шаблон">✕</div>
      </div>
    </div>`).join('');
}

function gatherSettings() {
  const vals = {}, chks = {}, sels = {};
  // Собираем все inputs внутри #panels (кроме checkbox и range)
  document.querySelectorAll('#panels input').forEach(el => {
    if (!el.id) return;
    if (el.type === 'checkbox' || el.type === 'range' || el.type === 'file') return;
    vals[el.id] = el.value;
  });
  document.querySelectorAll('#panels input[type=checkbox]').forEach(el => {
    if (el.id) chks[el.id] = el.checked;
  });
  document.querySelectorAll('#panels select').forEach(el => {
    if (el.id) sels[el.id] = el.value;
  });
  // Top-level inputs outside panels
  ['c_atr','c_comm','c_mint','c_maxdd','c_spread'].forEach(id => { const el=$(id); if(el) vals[id]=el.value; });
  // Настройки видимости столбиков
  const colSettings = getColSettings();
  // Порядок панелей
  const panelOrder = Array.from(document.querySelectorAll('#panels .panel[data-panel-id]'))
    .map(p => p.dataset.panelId);
  // Фильтры таблицы (f_pnl, f_wr, сортировка и т.д.)
  const tableFilters = (typeof _gatherTableFilters === 'function') ? _gatherTableFilters() : null;
  return { vals, chks, sels, slLogic, tpLogic, revMode, revAct, timeMode, clxMode, colSettings, panelOrder, tableFilters };
}

function applySettings(s) {
  if (!s) return;
  Object.entries(s.vals||{}).forEach(([id,v]) => { const el=$(id); if(el) el.value=v; });
  Object.entries(s.chks||{}).forEach(([id,v]) => { const el=$(id); if(el) el.checked=v; });
  Object.entries(s.sels||{}).forEach(([id,v]) => { const el=$(id); if(el) el.value=v; });
  if (s.slLogic)  setLogic('sl', s.slLogic);
  if (s.tpLogic)  setLogic('tp', s.tpLogic);
  if (s.revMode)  setXMode('rev', s.revMode);
  if (s.revAct)   setXMode('revact', s.revAct);
  if (s.timeMode) setXMode('time', s.timeMode);
  if (s.clxMode)  setXMode('clx', s.clxMode);
  // Восстанавливаем настройки столбиков
  if (s.colSettings) {
    _colSettings = s.colSettings;
    _saveColSettings(s.colSettings);
    _applyColSettings(s.colSettings);
  }
  // Восстанавливаем порядок панелей
  if (s.panelOrder && typeof _restorePanelOrder === 'function') _restorePanelOrder(s.panelOrder);
  // Восстанавливаем фильтры таблицы
  if (s.tableFilters && typeof _applyTableFilters === 'function') _applyTableFilters(s.tableFilters, false);
  updatePreview();
}

function saveTpl() {
  const name = ($('tpl-name-inp').value.trim()) || ('Шаблон ' + new Date().toLocaleTimeString('ru-RU'));
  const isDef = $c('tpl-def-cb');
  if (isDef) templates.forEach(t => t.isDefault=false);
  templates.push({ name, settings: gatherSettings(), isDefault: isDef, ts: Date.now() });
  storeSave('use6_tpl', templates);
  renderTplList();
  $('tpl-name-inp').value = '';
}
function loadTpl(i) {
  applySettings(templates[i].settings);
  closeTplModal();
}
function setDefaultTpl(i) {
  templates.forEach((t,j) => t.isDefault = j===i);
  storeSave('use6_tpl', templates);
  renderTplList();
}
function deleteTpl(i) {
  templates.splice(i,1);
  storeSave('use6_tpl', templates);
  renderTplList();
}

function exportTpl(i) {
  const t = templates[i];
  const payload = JSON.stringify({ _use6tpl: true, name: t.name, settings: t.settings, ts: t.ts });
  navigator.clipboard.writeText(payload).then(() => {
    // Показываем подтверждение
    const btns = document.querySelectorAll('.tpl-ibtn');
    // Ищем кнопку 📤 для этого индекса — просто показываем тост
    showTplToast(`📤 Шаблон "${t.name}" скопирован в буфер обмена`);
  }).catch(() => {
    // Fallback: открываем textarea с кодом
    $('tpl-import-area').value = payload;
    $('tpl-import-wrap').style.display = 'block';
    showTplToast('Скопируй текст из поля ниже вручную');
  });
}

function importTplFromText() {
  const text = $('tpl-import-area').value.trim();
  if (!text) return;
  try {
    const parsed = JSON.parse(text);
    if (!parsed._use6tpl || !parsed.settings) { showTplToast('⚠️ Неверный формат шаблона'); return; }
    // Предотвращаем дубли по имени+ts
    const exists = templates.some(t => t.ts === parsed.ts && t.name === parsed.name);
    if (exists) { showTplToast('⚠️ Этот шаблон уже есть'); return; }
    templates.push({ name: parsed.name, settings: parsed.settings, isDefault: false, ts: parsed.ts || Date.now() });
    storeSave('use6_tpl', templates);
    renderTplList();
    $('tpl-import-area').value = '';
    $('tpl-import-wrap').style.display = 'none';
    showTplToast(`✅ Шаблон "${parsed.name}" импортирован`);
  } catch(e) {
    showTplToast('⚠️ Ошибка парсинга: ' + e.message);
  }
}

function showTplToast(msg, duration) {
  let t = document.getElementById('tpl-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'tpl-toast';
    t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--bg3);border:1px solid var(--border2);color:var(--text);padding:8px 16px;border-radius:6px;font-size:.72em;z-index:9999;transition:opacity .3s;max-width:80vw;text-align:center';
    document.body.appendChild(t);
  }
  t.textContent = msg; t.style.opacity = '1';
  clearTimeout(t._tid);
  t._tid = setTimeout(() => { t.style.opacity = '0'; }, duration || 3000);
}
// Псевдоним для совместимости
function toast(msg, duration) { showTplToast(msg, duration); }

// Load default template on page load
// --- Favourites ---
function isFav(name) {
  return favourites.some(f => f.name===name && (f.ns||'')===_favNs);
}
function toggleFav(idx, event) {
  if (event) event.stopPropagation();
  const r = typeof idx === 'number' ? results[idx] : idx;
  if (!r) return;
  const fi = favourites.findIndex(f => f.name===r.name);
  if (fi >= 0) {
    favourites.splice(fi,1);
  } else {
    favourites.push({ name:r.name, ns:_favNs, stats:{
      pnl:r.pnl, wr:r.wr, n:r.n, dd:r.dd, pdd:r.pdd,
      dwr:r.dwr||0, avg:r.avg||0, p1:r.p1||0, p2:r.p2||0,
      nL:r.nL||0, pL:r.pL||0, wrL:r.wrL, nS:r.nS||0, pS:r.pS||0, wrS:r.wrS, dwrLS:r.dwrLS,
      robScore:r.robScore, robMax:r.robMax, robDetails:r.robDetails
    }, cfg:r.cfg, ts:Date.now() });
  }
  storeSave(_favKey(), favourites);
  renderFavBar();
  // НЕ вызываем renderResults() — это сбрасывает режим и фильтры!
  // Только перерисовываем звёздочки в текущем виде
  _refreshFavStars();
}

// Обновляет только звёздочки в текущей таблице без сброса фильтров
function _refreshFavStars() {
  const rows = document.querySelectorAll('#tb tr[data-i]');
  rows.forEach(tr => {
    const i = +tr.dataset.i;
    const r = _visibleResults[i];
    if (!r) return;
    const starEl = tr.querySelector('[data-fav]');
    if (starEl) starEl.textContent = isFav(r.name) ? '⭐' : '☆';
  });
  // Если мы в режиме fav — обновляем список полностью
  if (_tableMode === 'fav') applyFilters();
}
function renderFavBar() {
  const bar = $('fav-bar'), sec = $('fav-section');
  // Показываем секцию если есть хоть какие-то избранные (любого ns)
  if (!favourites.length) { sec.style.display='none'; return; }
  sec.style.display = 'block';

  // Считаем только текущий ns
  const nsItems = favourites.filter(f => (f.ns||'') === _favNs);
  $('fav-count').textContent = nsItems.length;

  // Обновляем метку ns
  const nsLabel = $('fav-ns-label');
  if (nsLabel) nsLabel.textContent = _favNs ? _favNs : '';

  const q = ($('fav-search') ? $('fav-search').value.trim().toLowerCase() : '');
  // Фильтруем: только текущий ns + поисковый запрос
  const filtered = favourites
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => (f.ns||'') === _favNs && (!q || f.name.toLowerCase().includes(q)));

  if (!filtered.length) {
    const allNs = [...new Set(favourites.map(f => f.ns||'').filter(Boolean))];
    const hint = !_favNs && allNs.length
      ? `<br><span style="color:var(--accent);cursor:pointer" onclick="openNsModal()">Доступные ns: ${allNs.join(', ')}</span>`
      : '';
    bar.innerHTML = `<div style="font-size:.62em;color:var(--text3);padding:4px 6px">Нет избранных в ns "${_favNs||'общий'}"${hint}</div>`;
    return;
  }

  bar.innerHTML = filtered.map(({ f, i }, idx) => {
    const pdd = f.stats.dd > 0 ? (f.stats.pnl / f.stats.dd) : 0;
    const pddCls = pdd >= 5 ? 'pos' : pdd >= 2 ? 'warn' : 'neg';
    return `<div class="fav-row">
      <span class="fav-row-num">${idx + 1}</span>
      <span class="fav-row-name" onclick="loadFavAsTpl(${i})" title="${f.name}">${f.name}</span>
      <span class="fav-row-stats">PnL&nbsp;${f.stats.pnl.toFixed(1)}%&nbsp;WR&nbsp;${f.stats.wr ? f.stats.wr.toFixed(0) : '—'}%&nbsp;#${f.stats.n}</span>
      <span class="fav-row-pdd ${pddCls}">P/DD&nbsp;${pdd.toFixed(1)}</span>
      <span class="fav-row-del" onclick="removeFav(${i})" title="Удалить">✕</span>
    </div>`;
  }).join('');
}

function toggleFavBody() {
  const body = $('fav-body'), tog = $('fav-toggle');
  const open = body.classList.toggle('open');
  tog.textContent = open ? '▲ скрыть' : '▼ показать';
}
function removeFav(i) {
  favourites.splice(i,1);
  storeSave(_favKey(), favourites);
  renderFavBar();
  _refreshFavStars(); // не сбрасываем фильтры
}
function loadFavAsTpl(i) {
  const f = favourites[i];
  if (!f) return;
  // Показываем детальную карточку с настройками
  if (f.cfg) {
    // Строим объект результата из сохранённых данных
    const r = { name: f.name, cfg: f.cfg,
      pnl: f.stats.pnl||0, wr: f.stats.wr||0, n: f.stats.n||0,
      dd: f.stats.dd||0, pdd: f.stats.pdd||0, avg: f.stats.avg||0,
      p1: f.stats.p1||0, p2: f.stats.p2||0, c1: f.stats.c1||0,
      c2: f.stats.c2||0, dwr: f.stats.dwr||0,
      wrL: f.stats.wrL??null, wrS: f.stats.wrS??null,
      nL: f.stats.nL||0, nS: f.stats.nS||0, dwrLS: f.stats.dwrLS??null };
    showDetail(r);
  } else {
    alert('Нет сохранённых настроек для этого результата');
  }
}

// --- Climax exit visibility ---
// ── Неймспейс избранных ───────────────────────────────────────
// Позволяет хранить избранные для разных тикеров/ТФ одновременно.
// Пример: setFavNs('BTC_1h'), setFavNs('ETH_4h'), setFavNs('')
function setFavNs(ns) {
  _favNs = (ns || '').trim().replace(/[^a-zA-Z0-9_\-\.]/g, '_');
  localStorage.setItem('use6_fav_ns', _favNs);
  // Обновляем отображение
  const el = document.getElementById('fav-ns-label');
  if (el) el.textContent = _favNs ? ' [' + _favNs + ']' : '';
  _updateTableModeCounts();
  renderFavBar();
  _refreshFavStars();
  toast('📌 Неймспейс: ' + (_favNs || 'общий'), 1500);
}

function openNsModal() {
  // Собираем все существующие ns
  const allNs = [...new Set(favourites.map(f => f.ns||'').filter(Boolean))];
  const cur = _favNs;
  const items = [{ v:'', label:'общий (без метки)', cnt: favourites.filter(f=>!(f.ns||'')).length }]
    .concat(allNs.map(ns => ({ v:ns, label:ns, cnt: favourites.filter(f=>(f.ns||'')===ns).length })));
  
  let html = `<div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center" id="ns-overlay" onclick="if(event.target===this)closeNsModal()">
  <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:8px;padding:20px;min-width:320px;max-width:480px">
    <div style="font-size:.9em;font-weight:600;color:var(--accent);margin-bottom:12px">📌 Неймспейс избранных</div>
    <div style="font-size:.7em;color:var(--text3);margin-bottom:10px">Выбери или создай метку для текущего тикера/ТФ.<br>Избранные разных меток хранятся независимо.</div>
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px">`;
  
  for (const it of items) {
    const active = it.v === cur;
    html += `<div onclick="setFavNs('${it.v}');closeNsModal()"
      style="cursor:pointer;padding:6px 10px;border-radius:5px;border:1px solid ${active?'var(--accent)':'var(--border2)'};
             background:${active?'rgba(0,212,255,.1)':'var(--bg)'};display:flex;align-items:center;gap:8px">
      <span style="font-size:.75em;flex:1;color:${active?'var(--accent)':'var(--text)'}">${it.label || '(общий)'}</span>
      <span style="font-size:.65em;color:var(--text3)">${it.cnt} стратегий</span>
      ${active?'<span style="color:var(--accent);font-size:.8em">✓</span>':''}
    </div>`;
  }
  
  html += `</div>
    <div style="display:flex;gap:8px;align-items:center">
      <input id="ns-new-input" placeholder="Новая метка: BTC_1h" 
        style="flex:1;background:var(--bg);border:1px solid var(--border2);border-radius:4px;color:var(--text);font-size:.72em;padding:5px 8px;font-family:var(--font-mono)"
        onkeydown="if(event.key==='Enter')applyNsNew()">
      <button onclick="applyNsNew()"
        style="padding:4px 12px;background:rgba(0,212,255,.15);border:1px solid var(--accent);border-radius:4px;color:var(--accent);font-size:.72em;cursor:pointer">
        Создать
      </button>
    </div>
    <div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end">
      <button onclick="closeNsModal()" style="padding:4px 12px;background:var(--bg3);border:1px solid var(--border2);border-radius:4px;color:var(--text2);font-size:.72em;cursor:pointer">Закрыть</button>
    </div>
  </div></div>`;
  
  document.body.insertAdjacentHTML('beforeend', html);
}
function closeNsModal() { document.getElementById('ns-overlay')?.remove(); }
function applyNsNew() {
  const v = document.getElementById('ns-new-input')?.value?.trim();
  if (v) { setFavNs(v); closeNsModal(); }
}


// ── Сессия ────────────────────────────────────────────────────
// Экспорт/импорт полного состояния: results + favourites + ns
function saveSession() {
  if (!results.length && !favourites.length) {
    toast('Нечего сохранять — нет результатов и избранных', 2000);
    return;
  }
  const session = {
    v: 1,
    ns:        _favNs,
    ts:        Date.now(),
    results:   results.map(r => ({
      name: r.name, pnl: r.pnl, wr: r.wr, n: r.n, dd: r.dd, pdd: r.pdd,
      avg: r.avg, p1: r.p1, p2: r.p2, dwr: r.dwr,
      nL: r.nL, pL: r.pL, wrL: r.wrL, nS: r.nS, pS: r.pS, wrS: r.wrS, dwrLS: r.dwrLS,
      robScore: r.robScore, robMax: r.robMax, robDetails: r.robDetails,
      cfg: r.cfg
    })),
    favourites: favourites.filter(f => (f.ns||'')=== _favNs),
  };
  const ns = _favNs || 'session';
  const dt = new Date().toISOString().slice(0,16).replace('T','_').replace(':','');
  const fname = `USE_${ns}_${dt}.json`;
  const blob = new Blob([JSON.stringify(session, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = fname;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  toast('💾 Сессия сохранена: ' + fname, 2500);
}

function loadSession(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const s = JSON.parse(e.target.result);
      if (!s.v || !Array.isArray(s.results)) throw new Error('Неверный формат');
      
      const nsToLoad = s.ns || '';
      
      // Удаляем старые избранные этого ns, добавляем из файла
      favourites = favourites.filter(f => (f.ns||'') !== nsToLoad);
      if (Array.isArray(s.favourites)) {
        for (const f of s.favourites) { f.ns = nsToLoad; favourites.push(f); }
      }
      storeSave(_favKey(), favourites);
      
      // Переключаемся на ns из файла
      _favNs = nsToLoad;
      localStorage.setItem('use6_fav_ns', _favNs);
      const nsEl = document.getElementById('fav-ns-label');
      if (nsEl) nsEl.textContent = _favNs ? ' [' + _favNs + ']' : '';
      
      // Загружаем results
      results = s.results || [];
      // Восстанавливаем equities (нет в файле — просто пусто)
      equities = {};
      
      renderFavBar();
      _refreshFavStars();
      _updateTableModeCounts();
      applyFilters();
      
      const nRes = results.length, nFav = s.favourites?.length || 0;
      const nsLabel = nsToLoad || 'общий';
      toast(`✅ Загружено: ${nRes} результатов, ${nFav} избранных [${nsLabel}]`, 3000);
    } catch(err) {
      alert('Ошибка загрузки сессии: ' + err.message);
    }
  };
  reader.readAsText(file);
}


function updateClxExitVisibility() {
  // Климакс-выход теперь только в панели объёма (f_clx)
  const cb = $('clx-cb');
  if (cb) cb.style.opacity = HAS_VOLUME ? '1' : '0.4';
}

// --- Confirm filter logic in backtest ---
// (injected into main backtest function via cfg.useConfirm, cfg.confN, cfg.confM)

// --- Escape key ---
document.addEventListener('keydown', e => {
  if (e.key==='Escape') { closeDetail(); closeTplModal(); closeRobustModal(); closeParseModal(); }
});

// ============================================================
// ROBUST TEST
// ============================================================
let _robustResult = null; // текущий результат для теста

function openRobustModal() {
  if (!_robustResult) { alert('Сначала выберите результат из таблицы'); return; }
  $('robust-results').innerHTML = '';
  $('robust-progress').style.display = 'none';
  $('robust-overlay').classList.add('open');
}
function closeRobustModal() { $('robust-overlay').classList.remove('open'); }
function selectFastOnly() {
  $('rb_walk').checked = true;
  $('rb_param').checked = true;
  $('rb_mc').checked = false;
  $('rb_noise').checked = false;
  $('rb_oos').checked = true;
}

// _robustResult обновляется внутри showDetail (см. оригинал функции выше)

async function runRobustTest() {
  if (!_robustResult || !DATA) { alert('Нет данных для теста'); return; }
  const r = _robustResult, cfg = r.cfg;
  if (!cfg) { alert('Нет cfg для этого результата'); return; }


  const tests = [];
  if ($c('rb_walk'))  tests.push('walk');
  if ($c('rb_param')) tests.push('param');
  if ($c('rb_oos'))   tests.push('oos');
  if ($c('rb_mc'))    tests.push('mc');
  if ($c('rb_noise')) tests.push('noise');
  if (!tests.length) { alert('Выбери хотя бы один тест'); return; }

  $('robust-results').innerHTML = '';
  $('robust-progress').style.display = 'block';
  $('rb-pbar').style.width = '0%';
  $('rb-status').textContent = 'Запуск...';

  // Сбрасываем кэш: настройки param_spread/noise_runs могли измениться
  if (typeof _robCache !== 'undefined') _robCache.clear();
  if (typeof _robSliceCache !== 'undefined') _robSliceCache.clear();

  const results_html = [];
  const fullDATA = DATA; // сохраняем оригинал

  // ── Конвертация saved cfg → btCfg формат и запуск backtest ──
  // saved cfg хранит slPair/tpPair объекты и commission,
  // но backtest ожидает hasSLA/slMult/tpMode/comm и предвычисленные массивы
  function runOnSlice(slice) {
    if (!slice || slice.length < 40) return null;
    const origDATA = DATA;
    DATA = slice;
    try {
      const ind   = _calcIndicators(cfg);
      const btCfg = buildBtCfg(cfg, ind);
      return backtest(ind.pvLo, ind.pvHi, ind.atrArr, btCfg);
    } catch(e) {
      console.error('runOnSlice error:', e);
      return null;
    } finally {
      DATA = origDATA;
    }
  }

  // Базовый прогон на полном наборе (для сравнения)
  const base = runOnSlice(fullDATA);
  if (!base || base.n < 5) {
    $('rb-status').textContent = '❌ Базовый бэктест дал < 5 сделок — тест невозможен';
    return;
  }

  const setProgress = (pct, txt) => {
    $('rb-pbar').style.width = pct+'%';
    $('rb-status').textContent = txt;
  };
  const addResult = (icon, cls, title, detail) => {
    results_html.push(`<div class="rb-row ${cls}"><span class="rb-icon">${icon}</span><span class="rb-title">${title}</span><span class="rb-detail">${detail}</span></div>`);
    $('robust-results').innerHTML = results_html.join('');
  };

  await yieldToUI();

  // ── 1. Walk-Forward ─────────────────────────────────────────
  if (tests.includes('walk')) {
    setProgress(5, '🔄 Walk-Forward...');
    await yieldToUI();
    const N = fullDATA.length;
    const r1 = runOnSlice(fullDATA.slice(0, Math.floor(N*0.33)));
    const r2 = runOnSlice(fullDATA.slice(Math.floor(N*0.33), Math.floor(N*0.66)));
    const r3 = runOnSlice(fullDATA.slice(Math.floor(N*0.66)));
    const parts = [r1,r2,r3].filter(x=>x&&x.n>=5);
    if (parts.length < 2) {
      addResult('⚠️','warn','Walk-Forward','Мало сделок на периодах (нужно ≥5 каждый)');
    } else {
      const pnls = parts.map(x=>x.pnl), wrs = parts.map(x=>x.wr);
      const allPos = pnls.every(p=>p>0);
      const wrSpread = Math.max(...wrs) - Math.min(...wrs);
      const pnlStr = pnls.map(p=>`${p>0?'+':''}${p.toFixed(1)}%`).join(' | ');
      const wrStr  = wrs.map(w=>w.toFixed(1)+'%').join(' | ');
      const cls = allPos && wrSpread<20 ? 'pass' : allPos ? 'warn' : 'fail';
      addResult(cls==='pass'?'✅':cls==='warn'?'⚠️':'❌', cls,
        `Walk-Forward: ${pnlStr}`,
        `WR: ${wrStr} (разброс ${wrSpread.toFixed(1)}%)`);
    }
  }

  // ── 2. OOS ──────────────────────────────────────────────────
  if (tests.includes('oos')) {
    setProgress(25, '🔬 OOS (3 участка: начало/середина/конец)...');
    await yieldToUI();
    const N = fullDATA.length;
    const segLen = Math.floor(N * 0.20);
    // Три OOS участка
    const segs = [
      { label: 'Начало (0-20%)',    data: fullDATA.slice(0, segLen) },
      { label: 'Середина (40-60%)', data: fullDATA.slice(Math.floor(N*0.40), Math.floor(N*0.60)) },
      { label: 'Конец (80-100%)',   data: fullDATA.slice(N - segLen) },
    ];
    const rFull = runOnSlice(fullDATA);
    const pnlPerBar = rFull && rFull.pnl && N > 0 ? rFull.pnl / N : 0;
    let passCount = 0;
    const segResults = [];
    for (const seg of segs) {
      const rSeg = runOnSlice(seg.data);
      if (!rSeg || rSeg.n < 3) {
        segResults.push({ label: seg.label, ok: false, detail: 'мало сделок' });
        continue;
      }
      const retention = pnlPerBar > 0 ? rSeg.pnl / (pnlPerBar * seg.data.length) : (rSeg.pnl > 0 ? 1 : 0);
      const ok = rSeg.pnl > 0 && retention >= 0.1;
      if (ok) passCount++;
      segResults.push({ label: seg.label, ok, pnl: rSeg.pnl, wr: rSeg.wr, n: rSeg.n, retention });
    }
    // Итог: 2+ из 3 = пройден
    const oosOverall = passCount >= 2;
    const overallCls = passCount === 3 ? 'pass' : passCount === 2 ? 'warn' : 'fail';
    const overallIcon = passCount === 3 ? '✅' : passCount === 2 ? '⚠️' : '❌';
    addResult(overallIcon, overallCls,
      `OOS: ${passCount}/3 участков прибыльны`,
      `IS полная выборка: ${rFull ? rFull.pnl.toFixed(1)+'%' : '-'} | Пройден если ≥2/3`);
    for (const sr of segResults) {
      if (sr.detail) {
        addResult('⚠️','warn', `  └ ${sr.label}`, sr.detail);
      } else {
        const retPct = sr.retention !== undefined ? (sr.retention*100).toFixed(0) : '?';
        const retStr = ` | Retention: ${retPct}%`;
        const retWarn = sr.retention < 0.1 ? ' ⚠️ <10% — слишком слабо' : sr.retention < 0.3 ? ' (слабо)' : '';
        const cls2 = sr.ok ? (sr.retention >= 0.3 ? 'pass' : 'warn') : 'fail';
        const icon2 = sr.ok ? (sr.retention >= 0.3 ? '✅' : '⚠️') : (sr.pnl > 0 ? '⚠️' : '❌');
        addResult(icon2, cls2,
          `  └ ${sr.label}: ${sr.pnl>0?'+':''}${sr.pnl.toFixed(1)}% WR ${sr.wr.toFixed(1)}% (${sr.n} сд.)`,
          `IS: ${rFull?rFull.pnl.toFixed(1)+'%':'-'}${retStr}${retWarn}`);
      }
    }
  }

  // ── 3. Параметрическая чувствительность ─────────────────────
  if (tests.includes('param')) {
    setProgress(45, '🎛 Параметрическая чувствительность...');
    await yieldToUI();

    const mutateSlPair = (pair, mult) => {
      if (!pair) return pair;
      const np = JSON.parse(JSON.stringify(pair));
      if (np.a && np.a.m) np.a.m = +(np.a.m * mult).toFixed(2);
      if (np.p && np.p.m) np.p.m = +(np.p.m * mult).toFixed(2);
      return np;
    };

    const variants = [];
    const savedSl = cfg.slPair, savedTp = cfg.tpPair;
    const _pSpread = Math.max(5, Math.min(50, parseInt(document.getElementById('param_spread')?.value) || 30)) / 100;
    const _pLo = +(1 - _pSpread).toFixed(2), _pHi = +(1 + _pSpread).toFixed(2);
    for (const slM of [_pLo, _pHi]) {
      for (const tpM of [_pLo, _pHi]) {
        cfg.slPair = mutateSlPair(savedSl, slM);
        cfg.tpPair = mutateSlPair(savedTp, tpM);
        const rv = runOnSlice(fullDATA);
        if (rv && rv.n >= 5) variants.push(rv.pnl);
      }
    }
    cfg.slPair = savedSl; cfg.tpPair = savedTp;

    if (!variants.length) {
      addResult('⚠️','warn','Параметрическая чувствительность','Нет данных SL/TP для мутации');
    } else {
      const minV=Math.min(...variants), maxV=Math.max(...variants), spread=maxV-minV;
      const passedCount = variants.filter(v=>v>0).length;
      const pSpreadPct = Math.round(_pSpread * 100);
      const cls = passedCount >= 4 && spread < Math.abs(base.pnl)*0.7 ? 'pass'
                : passedCount >= 3 ? 'warn' : 'fail';
      addResult(cls==='pass'?'✅':cls==='warn'?'⚠️':'❌', cls,
        `SL/TP ±${pSpreadPct}%: ${passedCount}/4 вариантов прибыльны (min ${minV.toFixed(1)}% / max ${maxV.toFixed(1)}%)`,
        `Разброс ${spread.toFixed(1)}% при базе ${base.pnl.toFixed(1)}%. Пройден если ≥3/4 прибыльны.`);
    }
  }

  // ── 4. Monte Carlo (перестановки PnL по сделкам) ────────────
  if (tests.includes('mc')) {
    setProgress(60, '🎲 Monte Carlo (1000 перестановок)...');
    await yieldToUI();

    // Собираем PnL сделок из базового прогона через equity diff
    const eq = base.eq;
    const tradePnls = [];
    for (let i=1;i<eq.length;i++) {
      const diff = eq[i]-eq[i-1];
      if (Math.abs(diff)>0.001) tradePnls.push(diff);
    }

    if (tradePnls.length < 10) {
      addResult('⚠️','warn','Monte Carlo','Мало сделок для симуляции (нужно ≥10)');
    } else {
      const N_MC=1000; const dds=[];
      for (let sim=0;sim<N_MC;sim++) {
        const t=[...tradePnls];
        for(let i=t.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[t[i],t[j]]=[t[j],t[i]];}
        let eq2=0,peak=0,dd=0;
        t.forEach(p=>{eq2+=p;if(eq2>peak)peak=eq2;dd=Math.max(dd,peak-eq2);});
        dds.push(dd);
      }
      dds.sort((a,b)=>a-b);
      const p50=dds[Math.floor(N_MC*0.5)], p95=dds[Math.floor(N_MC*0.95)];
      const cls = p95 < Math.abs(base.pnl)*0.6 ? 'pass' : p95 < Math.abs(base.pnl) ? 'warn' : 'fail';
      addResult(cls==='pass'?'✅':cls==='warn'?'⚠️':'❌', cls,
        `MC maxDD: медиана ${p50.toFixed(1)}% / p95 ${p95.toFixed(1)}%`,
        `1000 перестановок сделок. База: ${base.pnl.toFixed(1)}%`);
    }
    await yieldToUI();
  }

  // ── 5. Шум данных ───────────────────────────────────────────
  if (tests.includes('noise')) {
    setProgress(78, '📡 Шум данных (100 прогонов)...');
    await yieldToUI();

    const N_NOISE = Math.max(5, Math.min(200, parseInt(document.getElementById('noise_runs')?.value) || 20));
    const NOISE   = (parseFloat(document.getElementById('noise_level')?.value) || 0.2) / 100;
    const pnls=[];
    for (let sim=0;sim<N_NOISE;sim++) {
      const noisy = fullDATA.map(b=>{
        const f=1+(Math.random()-0.5)*2*NOISE;
        return {o:b.o*f,h:b.h*f,l:b.l*f,c:b.c*f,v:b.v};
      });
      const rv = runOnSlice(noisy);
      if (rv && rv.n>=5) pnls.push(rv.pnl);
      if (sim%10===0) await yieldToUI();
    }
    if (pnls.length<10) {
      addResult('⚠️','warn','Шум данных','Недостаточно результатов');
    } else {
      const avg=pnls.reduce((a,b)=>a+b,0)/pnls.length;
      const minP=Math.min(...pnls), maxP=Math.max(...pnls);
      const cls = avg>0&&minP>0 ? 'pass' : avg>0 ? 'warn' : 'fail';
      addResult(cls==='pass'?'✅':cls==='warn'?'⚠️':'❌', cls,
        `Шум ±0.05%: avg ${avg.toFixed(1)}% / min ${minP.toFixed(1)}%`,
        `Разброс ${(maxP-minP).toFixed(1)}% по ${pnls.length} прогонам`);
    }
    await yieldToUI();
  }

  setProgress(100, '✅ Готово');
}

// ============================================================
// TEXT PARSER
// ============================================================
function openParseModal() {
  $('parse-preview').innerHTML = '';
  $('parse-overlay').classList.add('open');
}
function closeParseModal() { $('parse-overlay').classList.remove('open'); }

function parseTextToSettings(text) {
  const changes = [];
  const lines = text.split('\n');

  // ── Хелперы ─────────────────────────────────────────────────
  // Ищем строку вида "Ключевая фраза: значение"
  function getVal(key) {
    for (const ln of lines) {
      const i = ln.indexOf(key);
      if (i === -1) continue;
      const after = ln.slice(i + key.length).replace(/^[\s:=]+/, '').trim();
      return after;
    }
    return null;
  }
  // Ищем число после ключевой фразы
  function getNum(key) {
    const v = getVal(key);
    if (!v) return null;
    const m = v.match(/^[\d.]+/);
    return m ? parseFloat(m[0]) : null;
  }
  // Ищем bool (ВКЛ/ВЫКЛ)
  function getOnOff(key) {
    const v = getVal(key);
    if (!v) return null;
    return v.startsWith('ВКЛ') ? true : v.startsWith('ВЫКЛ') ? false : null;
  }
  // Задаём значение
  const set = (id, value, type, label) => changes.push({id, value, type, label});

  const t = text.toLowerCase();

  // ── Определяем: это формат buildCopyText или свободный текст ──
  const isCopyFormat = text.includes('--- ПАТТЕРНЫ ВХОДА ---') || text.includes('--- СТОП-ЛОСС / ТЕЙК-ПРОФИТ ---');

  if (isCopyFormat) {
    // ════════════════════════════════════════════════════════════
    // РЕЖИМ 1: Парсинг формата buildCopyText (скопировано из карточки)
    // ════════════════════════════════════════════════════════════

    // --- Паттерны входа ---
    const parsePiv = getVal('Pivot Points:');
    if (parsePiv !== null) {
      const isOn = parsePiv.startsWith('ВКЛ');
      set('e_pv', isOn, 'chk', `Pivot: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) {
        const lm = parsePiv.match(/Left=(\d+)/); const rm = parsePiv.match(/Right=(\d+)/);
        if (lm) set('e_pvl', lm[1], 'val', `Pivot Left=${lm[1]}`);
        if (rm) set('e_pvr', rm[1], 'val', `Pivot Right=${rm[1]}`);
      }
    }
    const parseEng = getOnOff('Поглощение:');
    if (parseEng !== null) set('e_eng', parseEng, 'chk', `Поглощение: ${parseEng?'ВКЛ':'ВЫКЛ'}`);

    const parsePin = getVal('Pin Bar:');
    if (parsePin !== null) {
      const isOn = parsePin.startsWith('ВКЛ');
      set('e_pin', isOn, 'chk', `Pin Bar: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) { const m = parsePin.match(/([\d.]+)$/); if(m) set('e_pinr', m[1], 'val', `Pin ratio=${m[1]}`); }
    }
    const parseBB = getVal('Боллинджер пробой:');
    if (parseBB !== null) {
      const isOn = parseBB.startsWith('ВКЛ');
      set('e_bol', isOn, 'chk', `BB: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) {
        const pm = parseBB.match(/период=(\d+)/); const sm = parseBB.match(/sigma=([\d.]+)/);
        if (pm) set('e_bbl', pm[1], 'val', `BB период=${pm[1]}`);
        if (sm) set('e_bbm', sm[1], 'val', `BB sigma=${sm[1]}`);
      }
    }
    const parseDon = getVal('Дончиан пробой:');
    if (parseDon !== null) {
      const isOn = parseDon.startsWith('ВКЛ');
      set('e_don', isOn, 'chk', `Donchian: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) { const m = parseDon.match(/период=(\d+)/); if(m) set('e_donl', m[1], 'val', `Don период=${m[1]}`); }
    }
    const parseAtrBo = getVal('ATR-канал пробой:');
    if (parseAtrBo !== null) {
      const isOn = parseAtrBo.startsWith('ВКЛ');
      set('e_atrbo', isOn, 'chk', `ATR-канал: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) {
        const mm = parseAtrBo.match(/mult=([\d.]+)/);
        if (mm) set('e_atbm', mm[1], 'val', `ATR mult=${mm[1]}`);
      }
    }
    const parseMaT = getVal('Касание MA:');
    if (parseMaT !== null) {
      const isOn = parseMaT.startsWith('ВКЛ');
      set('e_mat', isOn, 'chk', `MA Touch: ${isOn?'ВКЛ':'ВЫКЛ'}`);
    }
    const parseSqz = getVal('Squeeze:');
    if (parseSqz !== null) {
      const isOn = parseSqz.startsWith('ВКЛ');
      set('e_sqz', isOn, 'chk', `Squeeze: ${isOn?'ВКЛ':'ВЫКЛ'}`);
    }

    // --- SL ---
    const parseSL = getVal('Stop Loss:');
    if (parseSL) {
      // ATR × N
      const atrM = parseSL.match(/ATR\s*[×x]\s*([\d.]+)/i);
      // N% от цены
      const pctM = parseSL.match(/([\d.]+)%\s*от/i);
      // Комбо: ATR ... OR/AND ... %
      const isCombo = (atrM && pctM);
      if (atrM) {
        set('s_atr', true, 'chk', 'SL ATR ВКЛ');
        set('s_atrv', atrM[1], 'val', `SL ATR=${atrM[1]}`);
      } else { set('s_atr', false, 'chk', 'SL ATR ВЫКЛ'); }
      if (pctM) {
        set('s_pct', true, 'chk', 'SL % ВКЛ');
        set('s_pctv', pctM[1], 'val', `SL %=${pctM[1]}`);
      } else { set('s_pct', false, 'chk', 'SL % ВЫКЛ'); }
      // логика
      const lgSL = parseSL.match(/\[(ИЛИ|И)\s/i);
      if (lgSL) { /* setLogic вызовем ниже */ changes.push({id:'_slLogic', value: lgSL[1]==='ИЛИ'?'or':'and', type:'logic', label:`SL логика=${lgSL[1]}`}); }
    }

    // --- TP ---
    const parseTP = getVal('Take Profit:');
    if (parseTP) {
      // Извлекаем все TP части (может быть комбо: "R:R = 2 OR ATR × 3")
      // Форматы: "R:R = N", "ATR × N", "N% от цены"
      const rrMatches   = [...parseTP.matchAll(/R:R\s*=\s*([\d.]+)/gi)];
      const atrMatches  = [...parseTP.matchAll(/ATR\s*[×x]\s*([\d.]+)/gi)];
      const pctMatches  = [...parseTP.matchAll(/([\d.]+)%\s*от/gi)];

      // Выключаем все TP типы сначала, потом включаем что нашли
      set('t_rr',  rrMatches.length  > 0, 'chk', `TP RR: ${rrMatches.length>0?'ВКЛ':'ВЫКЛ'}`);
      set('t_atr', atrMatches.length > 0, 'chk', `TP ATR: ${atrMatches.length>0?'ВКЛ':'ВЫКЛ'}`);
      set('t_pct', pctMatches.length > 0, 'chk', `TP %: ${pctMatches.length>0?'ВКЛ':'ВЫКЛ'}`);

      if (rrMatches.length > 0) {
        // Записываем все значения через запятую если их несколько
        const vals = rrMatches.map(m=>m[1]).join(',');
        set('t_rrv', vals, 'val', `TP RR значения=${vals}`);
      }
      if (atrMatches.length > 0) {
        const vals = atrMatches.map(m=>m[1]).join(',');
        set('t_atrv', vals, 'val', `TP ATR значения=${vals}`);
      }
      if (pctMatches.length > 0) {
        const vals = pctMatches.map(m=>m[1]).join(',');
        set('t_pctv', vals, 'val', `TP % значения=${vals}`);
      }
      const lgTP = parseTP.match(/\[(ИЛИ|И)\s/i);
      if (lgTP) changes.push({id:'_tpLogic', value: lgTP[1]==='ИЛИ'?'or':'and', type:'logic', label:`TP логика=${lgTP[1]}`});
    }

    // --- Выходы ---
    const parseBE = getVal('Безубыток:');
    if (parseBE !== null) {
      const isOn = parseBE.startsWith('ВКЛ');
      set('x_be', isOn, 'chk', `BE: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) {
        const tm=parseBE.match(/триггер=([\d.]+)/); const om=parseBE.match(/оффсет=([\d.]+)/);
        if(tm) set('x_bet', tm[1], 'val', `BE триггер=${tm[1]}`);
        if(om) set('x_beo', om[1], 'val', `BE оффсет=${om[1]}`);
      }
    }
    const parseTrail = getVal('Trailing Stop:');
    if (parseTrail !== null) {
      const isOn = parseTrail.startsWith('ВКЛ');
      set('x_tr', isOn, 'chk', `Trail: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) {
        const tm=parseTrail.match(/триггер=([\d.]+)/); const dm=parseTrail.match(/дист=([\d.]+)/);
        if(tm) set('x_trt', tm[1], 'val', `Trail триггер=${tm[1]}`);
        if(dm) set('x_trd', dm[1], 'val', `Trail дист=${dm[1]}`);
      }
    }
    const parseRev = getVal('Обратный сигнал:');
    if (parseRev !== null) {
      const isOn = parseRev.startsWith('ВКЛ');
      set('x_rev', isOn, 'chk', `RevSig: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) { const m=parseRev.match(/мин=([\d.]+)/); if(m) set('x_revb', m[1], 'val', `RevSig мин=${m[1]}`); }
    }
    const parseTime = getVal('Выход по времени:');
    if (parseTime !== null) {
      const isOn = parseTime.startsWith('ВКЛ');
      set('x_time', isOn, 'chk', `Time exit: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) { const m=parseTime.match(/макс=([\d.]+)/); if(m) set('x_timeb', m[1], 'val', `Time макс=${m[1]}`); }
    }
    const parsePart = getVal('Частичный TP1:');
    if (parsePart !== null) {
      const isOn = parsePart.startsWith('ВКЛ');
      set('x_part', isOn, 'chk', `Partial TP: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) {
        const rm=parsePart.match(/уровень=SL\s*x([\d.]+)/); const pm=parsePart.match(/закрыть\s*([\d.]+)%/);
        if(rm) set('x_partr', rm[1], 'val', `Partial RR=${rm[1]}`);
        if(pm) set('x_partp', pm[1], 'val', `Partial %=${pm[1]}`);
        set('x_partbe', parsePart.includes('потом BE'), 'chk', 'Partial BE');
      }
    }

    // --- Фильтры тренда ---
    const parseMA = getVal('MA фильтр:');
    if (parseMA !== null) {
      const isOn = parseMA.startsWith('ВКЛ');
      set('f_ma', isOn, 'chk', `MA: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) {
        const tm = parseMA.match(/\b(EMA|SMA|WMA|HMA)\b/i);
        const pm = parseMA.match(/период=(\d+)/);
        if (tm) set('f_mat', tm[1].toUpperCase(), 'sel', `MA тип=${tm[1]}`);
        if (pm) set('f_map', pm[1], 'val', `MA период=${pm[1]}`);
      }
    }
    const parseADX = getVal('ADX:');
    if (parseADX !== null) {
      const isOn = parseADX.startsWith('ВКЛ');
      set('f_adx', isOn, 'chk', `ADX: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) {
        const m=parseADX.match(/ADX\s*>\s*([\d.]+)/);
        if(m) set('f_adxt', m[1], 'val', `ADX мин=${m[1]}`);
      }
    }
    const parseRSI = getVal('RSI:');
    if (parseRSI !== null) {
      const isOn = parseRSI.startsWith('ВКЛ');
      set('f_rsi', isOn, 'chk', `RSI: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) {
        const osm=parseRSI.match(/лонг<(\d+)/); const obm=parseRSI.match(/шорт>(\d+)/);
        if(osm) set('f_rsios', osm[1], 'val', `RSI OS=${osm[1]}`);
        if(obm) set('f_rsiob', obm[1], 'val', `RSI OB=${obm[1]}`);
      }
    }
    const parseSTrend = getVal('Простой тренд:');
    if (parseSTrend !== null) {
      const isOn = parseSTrend.startsWith('ВКЛ');
      set('f_strend', isOn, 'chk', `STrend: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) { const m=parseSTrend.match(/окно=(\d+)/); if(m) set('f_stw', m[1], 'val', `STrend окно=${m[1]}`); }
    }
    const parseStruct = getVal('Структура рынка:');
    if (parseStruct !== null) {
      const isOn = parseStruct.startsWith('ВКЛ');
      set('f_struct', isOn, 'chk', `Struct: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) { const m=parseStruct.match(/lookback=(\d+)/); if(m) set('f_strl', m[1], 'val', `Struct lookback=${m[1]}`); }
    }
    const parseFresh = getVal('Свежесть тренда:');
    if (parseFresh !== null) {
      const isOn = parseFresh.startsWith('ВКЛ');
      set('f_fresh', isOn, 'chk', `Fresh: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) { const m=parseFresh.match(/макс=(\d+)/); if(m) set('f_freshm', m[1], 'val', `Fresh макс=${m[1]}`); }
    }
    const parseVolF = getVal('Волатильность ATR:');
    if (parseVolF !== null) {
      const isOn = parseVolF.startsWith('ВКЛ');
      set('f_volf', isOn, 'chk', `VolF: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) { const m=parseVolF.match(/ATR\s*<\s*([\d.]+)/); if(m) set('f_vfm', m[1], 'val', `VolF mult=${m[1]}`); }
    }
    const parseMaDist = getVal('Дистанция от MA:');
    if (parseMaDist !== null) {
      const isOn = parseMaDist.startsWith('ВКЛ');
      set('f_madist', isOn, 'chk', `MaDist: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) { const m=parseMaDist.match(/макс=([\d.]+)/); if(m) set('f_madv', m[1], 'val', `MaDist макс=${m[1]}`); }
    }
    const parseCandle = getVal('Размер свечи:');
    if (parseCandle !== null) {
      const isOn = parseCandle.startsWith('ВКЛ');
      set('f_candle', isOn, 'chk', `CandleF: ${isOn?'ВКЛ':'ВЫКЛ'}`);
    }
    const parseConsec = getVal('Серия свечей:');
    if (parseConsec !== null) {
      const isOn = parseConsec.startsWith('ВКЛ');
      set('f_consec', isOn, 'chk', `Consec: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) { const m=parseConsec.match(/макс=(\d+)/); if(m) set('f_concm', m[1], 'val', `Consec макс=${m[1]}`); }
    }
    // --- Объёмные фильтры ---
    const parseVSA = getVal('VSA (объём):');
    if (parseVSA !== null) {
      const isOn = parseVSA.startsWith('ВКЛ');
      set('f_vsa', isOn, 'chk', `VSA: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) {
        const mm=parseVSA.match(/объём\s*>([\d.]+)/); const pm=parseVSA.match(/за\s*(\d+)\s*баров/);
        if(mm) set('f_vsam', mm[1], 'val', `VSA mult=${mm[1]}`);
        if(pm) set('f_vsap', pm[1], 'val', `VSA период=${pm[1]}`);
      }
    }
    const parseLiq = getVal('Ликвидность:');
    if (parseLiq !== null) {
      const isOn = parseLiq.startsWith('ВКЛ');
      set('f_liq', isOn, 'chk', `Liq: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) { const m=parseLiq.match(/мин=([\d.]+)/); if(m) set('f_liqm', m[1], 'val', `Liq мин=${m[1]}`); }
    }
    const parseVolDir = getVal('Направл. объёма:');
    if (parseVolDir !== null) {
      const isOn = parseVolDir.startsWith('ВКЛ');
      set('f_vdir', isOn, 'chk', `VolDir: ${isOn?'ВКЛ':'ВЫКЛ'}`);
    }
    const parseWT = getVal('Взвеш. тренд WT:');
    if (parseWT !== null) {
      const isOn = parseWT.startsWith('ВКЛ');
      set('f_wt', isOn, 'chk', `WT: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) {
        const sm=parseWT.match(/score>([\d.]+)/); const nm=parseWT.match(/N=(\d+)/);
        const vm=parseWT.match(/volW=([\d.]+)/); const bm=parseWT.match(/bodyW=([\d.]+)/);
        if(sm) set('f_wtt', sm[1], 'val', `WT score=${sm[1]}`);
        if(nm) set('f_wtn', nm[1], 'val', `WT N=${nm[1]}`);
        if(vm) set('f_wtv', vm[1], 'val', `WT volW=${vm[1]}`);
        if(bm) set('f_wtb', bm[1], 'val', `WT bodyW=${bm[1]}`);
      }
    }
    const parseFat = getVal('Усталость тренда:');
    if (parseFat !== null) {
      const isOn = parseFat.startsWith('ВКЛ');
      set('f_fat', isOn, 'chk', `Fatigue: ${isOn?'ВКЛ':'ВЫКЛ'}`);
    }
    // --- Общее ---
    const parseATRp = getVal('ATR период:');
    if (parseATRp !== null) { const m=parseATRp.match(/^(\d+)/); if(m) set('c_atr', m[1], 'val', `ATR период=${m[1]}`); }
    const parseComm = getVal('Комиссия:');
    if (parseComm !== null) { const m=parseComm.match(/^([\d.]+)/); if(m) set('c_comm', (parseFloat(m[1])*2).toFixed(3), 'val', `Комиссия=${m[1]}%`); }

  } else {
    // ════════════════════════════════════════════════════════════
    // РЕЖИМ 2: Свободный текст — прежняя логика с regex
    // ════════════════════════════════════════════════════════════
    const matchNum = (str, ...pats) => { for(const p of pats){const m=str.match(p);if(m)return m[1];} return null; };

    const atrV = matchNum(t, /atr\s*[=:]?\s*(\d+)\b/, /atr\s+период\s*[=:]?\s*(\d+)/);
    if (atrV) set('c_atr', atrV, 'val', `ATR период=${atrV}`);
    const commV = matchNum(t, /комисс\w*\s*[=:]?\s*([\d.]+)/, /comm\w*\s*[=:]?\s*([\d.]+)/);
    if (commV) set('c_comm', commV, 'val', `Комиссия=${commV}%`);
    const mintV = matchNum(t, /мин\s*сдел\w*\s*[=:]?\s*(\d+)/, /min.?trades?\s*[=:]?\s*(\d+)/);
    if (mintV) set('c_mint', mintV, 'val', `Мин сделок=${mintV}`);

    const slAtrV = matchNum(t, /sl\s*(?:×|x|atr\s*[×x]?)\s*([\d.]+)/, /стоп\s*(?:лосс)?\s*atr\s*[=:]?\s*([\d.]+)/);
    if (slAtrV && parseFloat(slAtrV)<20) {
      set('s_atr', true, 'chk', 'SL ATR ВКЛ'); set('s_atrv', slAtrV, 'val', `SL ATR=${slAtrV}`);
      set('s_pct', false, 'chk', 'SL % ВЫКЛ');
    }
    const slPctV = matchNum(t, /sl\s*([\d.]+)\s*%/, /стоп\s*([\d.]+)\s*%/);
    if (slPctV && !slAtrV) {
      set('s_pct', true, 'chk', 'SL % ВКЛ'); set('s_pctv', slPctV, 'val', `SL %=${slPctV}`);
      set('s_atr', false, 'chk', 'SL ATR ВЫКЛ');
    }
    const tpRRV = matchNum(t, /tp\s*(?:rr|r:r|r\/r)\s*[=×x]?\s*([\d.]+)/, /r[:\s]?r\s*[=:]?\s*([\d.]+)/);
    if (tpRRV) { set('t_rr', true, 'chk', 'TP RR ВКЛ'); set('t_rrv', tpRRV, 'val', `TP RR=${tpRRV}`); }
    const tpAtrV = matchNum(t, /tp\s*(?:atr|×atr)\s*[=×x]?\s*([\d.]+)/);
    if (tpAtrV && !tpRRV) { set('t_atr', true, 'chk', 'TP ATR ВКЛ'); set('t_atrv', tpAtrV, 'val', `TP ATR=${tpAtrV}`); }
    const maP = matchNum(t, /(?:ema|sma|wma|hma|ma)\s*[=:]?\s*(\d+)\b/);
    if (maP && parseInt(maP)>=5) {
      set('f_ma', true, 'chk', 'MA ВКЛ'); set('f_map', maP, 'val', `MA период=${maP}`);
      if(t.match(/\bema\b/)) set('f_mat','EMA','sel','MA=EMA');
      else if(t.match(/\bsma\b/)) set('f_mat','SMA','sel','MA=SMA');
      else if(t.match(/\bwma\b/)) set('f_mat','WMA','sel','MA=WMA');
    }
    const adxThV = matchNum(t, /adx\s*[>>=]?\s*(\d+)/);
    if (adxThV) { set('f_adx', true, 'chk', 'ADX ВКЛ'); set('f_adxt', adxThV, 'val', `ADX мин=${adxThV}`); }
    const adxLV = matchNum(t, /adx\s+период\s*[=:]?\s*(\d+)/);
    if (adxLV) set('f_adxl', adxLV, 'val', `ADX период=${adxLV}`);
    const pvLV = matchNum(t, /pivot\s*(?:left|l)\s*[=:]?\s*(\d+)/, /left\s*[=:]?\s*(\d+)/);
    const pvRV = matchNum(t, /pivot\s*(?:right|r)\s*[=:]?\s*(\d+)/, /right\s*[=:]?\s*(\d+)/);
    if (pvLV||pvRV) {
      set('e_pv', true, 'chk', 'Pivot ВКЛ');
      if(pvLV) set('e_pvl', pvLV, 'val', `Pivot Left=${pvLV}`);
      if(pvRV) set('e_pvr', pvRV, 'val', `Pivot Right=${pvRV}`);
    }
    const rsiOsV = matchNum(t, /rsi\s*(?:os|перепрод\w*|oversold)\s*[<<=]?\s*(\d+)/, /rsi\s*<\s*(\d+)/);
    const rsiObV = matchNum(t, /rsi\s*(?:ob|перекуп\w*|overbought)\s*[>>=]?\s*(\d+)/, /rsi\s*>\s*(\d+)/);
    if (rsiOsV||rsiObV) {
      set('f_rsi', true, 'chk', 'RSI ВКЛ');
      if(rsiOsV) set('f_rsios', rsiOsV, 'val', `RSI OS=${rsiOsV}`);
      if(rsiObV) set('f_rsiob', rsiObV, 'val', `RSI OB=${rsiObV}`);
    }
  }

  return changes;
}

// Подсветка полей при применении
function flashField(id) {
  const el = $(id);
  if (!el) return;
  el.style.transition = 'background 0.1s';
  el.style.background = 'rgba(0,212,120,0.35)';
  setTimeout(() => { el.style.background = ''; el.style.transition = ''; }, 900);
}

function showParseToast(changes) {
  // Удаляем старый тост если есть
  const old = document.getElementById('parse-toast');
  if (old) old.remove();
  const toast = document.createElement('div');
  toast.id = 'parse-toast';
  toast.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    background:var(--bg4);border:1px solid var(--accent2);color:var(--text);
    border-radius:8px;padding:10px 18px;font-size:.72em;z-index:9999;
    box-shadow:0 4px 20px rgba(0,0,0,.5);max-width:420px;text-align:center;
    animation:fadeInUp .25s ease`;
  const groups = [...new Set(changes.map(c=>c.group))];
  const summary = changes.filter(c=>c.type!=='chk'||c.value===true).map(c=>c.label).join(' · ');
  toast.innerHTML = `<b style="color:var(--accent2)">✅ Применено ${changes.length} изменений</b><br>
    <span style="color:var(--text2)">${summary.slice(0,200)}</span>`;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity='0'; toast.style.transition='opacity .4s'; setTimeout(()=>toast.remove(),400); }, 4000);
}

function previewParsedText() {
  const changes = parseTextToSettings($('parse-input').value);
  const el = $('parse-preview');
  const isCopy = $('parse-input').value.includes('--- ПАТТЕРНЫ ВХОДА ---');
  if (!changes.length) {
    el.innerHTML = '<span style="color:var(--neg)">⚠️ Ничего не распознано.<br>Примеры: <i>SL ATR 1.5 · TP RR 2.5 · EMA 200 · ADX > 20</i><br>Или вставьте текст из "Скопировать настройки".</span>';
    return;
  }
  const mode = isCopy ? '📋 Формат карточки (точное восстановление)' : '✍️ Свободный текст';
  el.innerHTML = `<b style="color:var(--accent2)">${mode} — ${changes.length} изменений:</b><br>` +
    changes.filter(c=>c.type!=='logic'||(c.type==='logic')).map(c =>
      `<span style="color:${c.value===false?'var(--text3)':'var(--text2)'}">• ${c.label}</span>`
    ).join('<br>');
}

function applyParsedText() {
  const changes = parseTextToSettings($('parse-input').value);
  if (!changes.length) {
    $('parse-preview').innerHTML = '<span style="color:var(--neg)">⚠️ Ничего не распознано</span>';
    return;
  }
  const changed_ids = new Set();
  changes.forEach(c => {
    if (c.type === 'logic') {
      // SL/TP логика: ищем radio-кнопки или select с нужным именем
      const prefix = c.id === '_slLogic' ? 's_lg' : 't_lg';
      const radio = document.querySelector(`input[name="${prefix}"][value="${c.value}"]`);
      if (radio) { radio.checked = true; changed_ids.add(prefix); }
      return;
    }
    const el = $(c.id);
    if (!el) return;
    if (c.type === 'val') { el.value = c.value; changed_ids.add(c.id); }
    else if (c.type === 'chk') { el.checked = c.value; if(c.value) changed_ids.add(c.id); }
    else if (c.type === 'sel') { el.value = c.value; changed_ids.add(c.id); }
  });
  // Подсвечиваем изменённые поля
  changed_ids.forEach(id => flashField(id));
  updatePreview();
  closeParseModal();
  showParseToast(changes);
}

function showBestStats() {
  const b=results[0];
  const el=$('bst'); el.style.display='flex';
  el.innerHTML=
    `<div class="bstat"><div class="val ${b.pnl>=0?'pos':'neg'}">${b.pnl.toFixed(1)}%</div><div class="lbl">PnL</div></div>`+
    `<div class="bstat"><div class="val">${b.wr.toFixed(1)}%</div><div class="lbl">WinRate</div></div>`+
    `<div class="bstat"><div class="val muted">${b.n}</div><div class="lbl">Сделок</div></div>`+
    `<div class="bstat"><div class="val neg">${b.dd.toFixed(1)}%</div><div class="lbl">MaxDD</div></div>`+
    `<div class="bstat"><div class="val pos">${b.pdd.toFixed(1)}</div><div class="lbl">P/DD</div></div>`+
    `<div class="bstat"><div class="val" style="font-size:.6em;color:var(--accent);max-width:200px;overflow:hidden;text-overflow:ellipsis" title="${b.name}">${b.name}</div><div class="lbl">🏆 Лучшая</div></div>`;
}

// Параметры последнего нарисованного графика — для crosshair
let _eqChartParams = null;

function drawEquityData(eq, label, splitPct) {
  if (!eq || !eq.length) return;
  const wrap = document.getElementById('eq-wrap');
  const canvas=$('eqc');
  // Сохраняем позицию скролла — браузер может прыгнуть к canvas при display:none→block
  const _scrollEl = document.querySelector('.tbl-scroll') || document.documentElement;
  const _scrollY = window.scrollY;
  const _scrollT = _scrollEl.scrollTop;
  if (wrap) wrap.style.display = 'block';
  canvas.style.display='block';
  // Восстанавливаем позицию немедленно
  window.scrollTo({top: _scrollY, behavior: 'instant'});
  _scrollEl.scrollTop = _scrollT;
  const ctx=canvas.getContext('2d');
  canvas.width=canvas.offsetWidth*2; canvas.height=300;
  ctx.scale(2,2);
  const W=canvas.offsetWidth,H=150;
  ctx.fillStyle='#080b10'; ctx.fillRect(0,0,W,H);

  let mn=0,mx=0;
  for(let i=0;i<eq.length;i++) {if(eq[i]<mn)mn=eq[i];if(eq[i]>mx)mx=eq[i];}
  const range=mx-mn||1, pad=14;

  ctx.strokeStyle='rgba(30,42,56,0.8)'; ctx.lineWidth=0.5;
  for(let v=-3;v<=3;v++) {
    const y=H-pad-((v*(range/4)+(mn+range/2)-mn)/range*(H-2*pad));
    if(y>pad&&y<H-pad) { ctx.beginPath(); ctx.moveTo(pad,y); ctx.lineTo(W-pad,y); ctx.stroke(); }
  }
  const zy=H-pad-((0-mn)/range*(H-2*pad));
  ctx.strokeStyle='rgba(255,255,255,0.15)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(pad,zy); ctx.lineTo(W-pad,zy); ctx.stroke();
  // IS/OOS or 1п/2п split line
  const _splitFrac = (splitPct != null && splitPct > 0 && splitPct < 100) ? splitPct / 100 : 0.5;
  const sx = pad + (W - 2*pad) * _splitFrac;
  const _isOOS = splitPct != null;
  ctx.strokeStyle = _isOOS ? 'rgba(255,160,40,0.7)' : 'rgba(255,170,0,0.4)';
  ctx.lineWidth = _isOOS ? 1.5 : 1;
  ctx.setLineDash([3,3]);
  ctx.beginPath(); ctx.moveTo(sx,pad); ctx.lineTo(sx,H-pad); ctx.stroke();
  ctx.setLineDash([]);
  if (_isOOS) {
    // Shaded OOS region
    ctx.fillStyle='rgba(255,160,40,0.04)';
    ctx.fillRect(sx, pad, W-pad-sx, H-2*pad);
  }
  // Pixel-exact mapping: nPx пикселей → eq[round(px*(n-1)/(nPx-1))]
  // Гарантирует заполнение ровно W-2*pad пикселей и точное совпадение с crosshair
  const nPx = W - 2 * pad;
  const nLast = Math.max(eq.length - 1, 1);
  ctx.beginPath();
  let firstX=pad;
  for(let px=0;px<nPx;px++) {
    const x=pad+px;
    const i=Math.round(px*(nLast)/(nPx-1));
    const y=H-pad-((eq[i]-mn)/range*(H-2*pad));
    if(px===0){ctx.moveTo(x,y);firstX=x;}else ctx.lineTo(x,y);
  }
  ctx.lineTo(W-pad,zy); ctx.lineTo(firstX,zy); ctx.closePath();
  ctx.fillStyle='rgba(0,212,255,0.06)'; ctx.fill();
  const grd=ctx.createLinearGradient(pad,0,W-pad,0);
  grd.addColorStop(0,'rgba(0,212,255,0.6)');
  grd.addColorStop(0.5,'rgba(0,230,118,0.8)');
  grd.addColorStop(1,'rgba(0,212,255,0.6)');
  ctx.strokeStyle=grd; ctx.lineWidth=1.5;
  ctx.beginPath();
  for(let px=0;px<nPx;px++) {
    const x=pad+px;
    const i=Math.round(px*(nLast)/(nPx-1));
    const y=H-pad-((eq[i]-mn)/range*(H-2*pad));
    if(px===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
  }
  ctx.stroke();
  ctx.fillStyle='rgba(180,200,220,0.6)'; ctx.font='8px JetBrains Mono,monospace';
  ctx.fillText(mx.toFixed(1)+'%',1,pad+7);
  ctx.fillText(mn.toFixed(1)+'%',1,H-pad-2);
  ctx.fillStyle='rgba(0,212,255,0.7)'; ctx.font='8px JetBrains Mono,monospace';
  ctx.fillText((label||'').substring(0,60),pad,9);
  ctx.fillStyle='rgba(255,160,40,0.6)';
  if (_isOOS) {
    ctx.fillText(`◄ IS (${splitPct}%)`, sx-38, H-4);
    ctx.fillText(`OOS (${100-splitPct}%) ►`, sx+4, H-4);
  } else {
    ctx.fillText('◄ 1п      2п ►', sx-24, H-4);
  }

  // Сохраняем параметры для crosshair
  _eqChartParams = { eq, mn, mx, range, pad, W, H, label };

  // Синхронизируем размер crosshair-canvas
  const ch = document.getElementById('eq-crosshair');
  if (ch) { ch.width = canvas.width; ch.height = canvas.height; ch.style.width = canvas.style.width || canvas.offsetWidth+'px'; ch.style.height = '150px'; }
}

function drawEquity(name) {
  const eq=equities[name]; if(!eq) return;
  drawEquityData(eq, name);
}

// Обёртка для режимов hc/fav — рисует equity из объекта результата
function drawEquityForResult(r) {
  if (!r) return;
  const splitPct = r.cfg?._oos?.isPct ?? null;
  // Проверяем доступные источники equity
  if (r.eq && r.eq.length) {
    drawEquityData(r.eq, r.name, splitPct);
  } else if (equities[r.name]) {
    drawEquityData(equities[r.name], r.name, splitPct);
  } else if (r.cfg) {
    // Для fav и hc результатов без eq — запускаем лёгкий бэктест
    const raw = _hcRunBacktest(r.cfg);
    if (raw && raw.eq) {
      r.eq = raw.eq; // кэшируем
      drawEquityData(raw.eq, r.name, splitPct);
    }
  }
}


// ── CROSSHAIR ──────────────────────────────────────────────────
(function() {
  function _drawCrosshair(e) {
    const p = _eqChartParams;
    if (!p) return;
    const canvas = document.getElementById('eqc');
    const ch = document.getElementById('eq-crosshair');
    if (!canvas || !ch) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;   // = 2 (retina scale)
    const scaleY = canvas.height / rect.height;

    // Координаты в canvas-пикселях (до scale(2,2)) — делим на 2
    const cx = (e.clientX - rect.left) * scaleX / 2;
    const cy = (e.clientY - rect.top)  * scaleY / 2;

    const { eq, mn, range, pad, W, H } = p;

    // Только внутри рабочей области
    if (cx < pad || cx > W - pad || cy < pad || cy > H - pad) {
      ch.getContext('2d').clearRect(0, 0, ch.width, ch.height);
      return;
    }

    // Индекс бара под курсором — тот же pixel-exact mapping что и при рисовании
    const nPx   = W - 2 * pad;
    const px    = Math.max(0, Math.min(nPx - 1, Math.round(cx - pad)));
    const clampedIdx = Math.round(px * (eq.length - 1) / Math.max(nPx - 1, 1));
    const val = eq[clampedIdx];                           // PnL в этой точке

    // Y-координата реального значения на кривой
    const valY = H - pad - ((val - mn) / range * (H - 2 * pad));

    // Прогресс (бар / всего)
    const progress = clampedIdx / Math.max(eq.length - 1, 1);

    const ctx = ch.getContext('2d');
    ctx.clearRect(0, 0, ch.width, ch.height);
    ctx.save();
    ctx.scale(2, 2);  // retina

    // Вертикальная линия
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(cx, pad); ctx.lineTo(cx, H - pad); ctx.stroke();

    // Горизонтальная линия на уровне значения
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

  function _clearCrosshair() {
    const ch = document.getElementById('eq-crosshair');
    if (ch) ch.getContext('2d').clearRect(0, 0, ch.width, ch.height);
  }

  document.addEventListener('DOMContentLoaded', function() {
    const canvas = document.getElementById('eqc');
    if (!canvas) return;
    canvas.addEventListener('mousemove', _drawCrosshair);
    canvas.addEventListener('mouseleave', _clearCrosshair);
  });
})();
// Live preview of combo count
document.addEventListener('change', e => {
  const oc = e.target.getAttribute('onchange');
  if (oc && oc.includes('applyFilters')) { if(typeof applyFiltersDebounced==='function') applyFiltersDebounced(); }
  else if (oc && oc.includes('updatePreview')) { if(typeof updatePreview==='function') updatePreview(); }
});
document.addEventListener('input', e => {
  const oi = e.target.getAttribute('oninput');
  if (oi && oi.includes('applyFilters')) { if(typeof applyFiltersDebounced==='function') applyFiltersDebounced(); }
  else if (oi && oi.includes('updatePreview')) { if(typeof updatePreview==='function') updatePreview(); }
});
// Навешивает делегированный обработчик сортировки на строку заголовков.
// Вызывается при init и после _applyOOSHeaders (которая перезаписывает innerHTML).
// Выбор строки по индексу в _visibleResults — обновляет выделение и график
function selectRow(idx) {
  if (idx < 0 || idx >= _visibleResults.length) return;
  _selectedIdx = idx;

  // Переключаем страницу если нужно
  const targetPage = Math.floor(idx / _pageSize);
  if (targetPage !== _curPage) {
    _curPage = targetPage;
    renderVisibleResults();
    return; // renderVisibleResults восстановит выделение сам
  }

  // Обновляем выделение
  const prevSel = document.querySelector('#tb tr.sel');
  if (prevSel) prevSel.classList.remove('sel');
  const tr = document.querySelector(`#tb tr[data-i="${idx}"]`);
  if (tr) {
    tr.classList.add('sel');
    // Прокручиваем строку в видимую область таблицы (не всей страницы)
    const tblScroll = document.querySelector('.tbl-scroll');
    if (tblScroll) {
      const trTop    = tr.offsetTop;
      const trBottom = trTop + tr.offsetHeight;
      const visTop   = tblScroll.scrollTop;
      const visBot   = visTop + tblScroll.clientHeight;
      if (trTop < visTop + 40)         tblScroll.scrollTop = trTop - 40;
      else if (trBottom > visBot - 10) tblScroll.scrollTop = trBottom - tblScroll.clientHeight + 10;
    }
  }

  const r = _visibleResults[idx];
  if (!r) return;
  if (_tableMode === 'results') drawEquity(r.name);
  else drawEquityForResult(r);
}

// Клавиатурная навигация по таблице результатов
document.addEventListener('keydown', function(e) {
  // Не перехватываем если фокус в инпуте/текстэриа
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  // Не перехватываем если открыто модальное окно
  if (document.querySelector('.tpl-overlay.open, #hc-overlay.open, #pine-overlay.open')) return;

  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const total = _visibleResults.length;
    if (!total) return;
    let next = _selectedIdx + (e.key === 'ArrowDown' ? 1 : -1);
    if (next < 0) next = 0;
    if (next >= total) next = total - 1;
    selectRow(next);
  } else if (e.key === 'Enter') {
    if (_selectedIdx >= 0 && _visibleResults[_selectedIdx]) {
      showDetail(_visibleResults[_selectedIdx]);
    }
  } else if (e.key === 'f' || e.key === 'F') {
    if (_selectedIdx >= 0 && _visibleResults[_selectedIdx]) {
      const r = _visibleResults[_selectedIdx];
      toggleFav(r, null);
      // Обновить звёздочку в строке
      const tr = document.querySelector(`#tb tr[data-i="${_selectedIdx}"]`);
      if (tr) {
        const favTd = tr.querySelector('[data-fav]');
        if (favTd) favTd.textContent = isFav(r.name) ? '⭐' : '☆';
      }
    }
  }
});

function _attachSortListener(row) {
  if (!row) return row;
  const clone = row.cloneNode(true);  // снимаем старые listeners клонированием
  row.parentNode.replaceChild(clone, row);
  clone.addEventListener('click', function(e) {
    const th = e.target.closest('th');
    if (!th) return;
    if (th.id === 'col-settings-btn') { toggleColSettings(); return; }
    const sc = th.getAttribute('data-sort');
    if (sc !== null) doSort(parseInt(sc));
  });
  return clone;
}

function doSort(col) {
  if (sortDirs[col] === undefined) sortDirs[col] = false;
  sortDirs[col] = !sortDirs[col];
  const d = sortDirs[col] ? 1 : -1;

  // Визуальная обратная связь: стрелка на нажатом заголовке
  try {
    document.querySelectorAll('#tbl-header-row th[data-sort]').forEach(th => {
      const c = parseInt(th.getAttribute('data-sort'));
      const base = (th.dataset.sortBase = th.dataset.sortBase || th.textContent.replace(/\s*[↕↑↓]/g,'').trim());
      th.textContent = base + (c === col ? (sortDirs[col] ? ' ↑' : ' ↓') : ' ↕');
      th.style.color = c === col ? 'var(--accent)' : '';
    });
  } catch(e) { /* не критично */ }

  const arr = _tableMode === 'hc'  ? _hcTableResults :
              _tableMode === 'fav' ? _getFavAsResults() :
              _tableMode === 'oos' ? _oosTableResults : results;
  if (!arr || !arr.length) { applyFilters(); return; }

  const detailKeys = {12:'oos', 13:'walk', 14:'param', 15:'noise', 16:'mc'};

  if (col === 0) {
    arr.sort((a,b) => d * a.name.localeCompare(b.name));
  } else if (col === 19) {
    arr.sort((a,b) => d * ((a.sig??0) - (b.sig??0)));
  } else if (col === 20) {
    arr.sort((a,b) => d * ((a.gt??-2) - (b.gt??-2)));
  } else if (col === 21) {
    arr.sort((a,b) => d * ((a.cvr??-1) - (b.cvr??-1)));
  } else if (col === 26) { // ##SOR
    arr.sort((a,b) => d * ((a.sortino??-99) - (b.sortino??-99)));
  } else if (col === 27) { // ##KR
    arr.sort((a,b) => d * ((a.kRatio??-99)  - (b.kRatio??-99)));
  } else if (col === 28) { // ##SQN
    arr.sort((a,b) => d * ((a.sqn??-99)     - (b.sqn??-99)));
  } else if (col === 29) { // ##CPCV
    arr.sort((a,b) => d * ((a.cpcvScore??-1) - (b.cpcvScore??-1)));
  } else if (col === 30) { // ##OMG
    arr.sort((a,b) => d * ((a.omega??-99) - (b.omega??-99)));
  } else if (col === 31) { // ##PAIN
    arr.sort((a,b) => d * ((a.pain??-99) - (b.pain??-99)));
  } else if (col === 32) { // ##BURKE
    arr.sort((a,b) => d * ((a.burke??-99) - (b.burke??-99)));
  } else if (col === 33) { // ##SRNTY
    arr.sort((a,b) => d * ((a.serenity??-99) - (b.serenity??-99)));
  } else if (col === 34) { // ##IR
    arr.sort((a,b) => d * ((a.ir??-99) - (b.ir??-99)));
  } else if (col <= 11) {
    const keys = ['name','pnl','wr','n','dd','pdd','avg','p1','p2','dwr','dwr','robScore'];
    const key = keys[col];
    arr.sort((a,b) => d * ((a[key]||0) - (b[key]||0)));
  } else if (col === 17) {
    arr.sort((a,b) => d * ((a.dwrLS ?? 999) - (b.dwrLS ?? 999)));
  } else if (col >= 22 && col <= 25) {
    const _tvVal = (r, c) => {
      const f = r.cfg?._oos?.forward;
      if (!f || f.pnlFull == null) return c === 24 ? 999 : -999;
      const oosGain  = f.pnl ?? 0;
      const isGain   = f.isGain ?? 0;
      const isPct    = r.cfg._oos.isPct, oosPct = 100 - isPct;
      const isRate   = isPct  > 0 ? isGain  / isPct  : 0;
      const oosRate  = oosPct > 0 ? oosGain / oosPct : 0;
      const rateRatio = isRate > 0 ? oosRate / isRate * 100 : (oosGain > 0 ? 200 : -100);
      const mulDd    = r.dd > 0 ? f.dd / r.dd : 1;
      const retPdd   = r.pdd > 0 ? (f.pdd??0) / r.pdd * 100 : 0;
      if (c === 22) {
        const g = oosGain>0 && rateRatio>=70 && mulDd<=1.5 && retPdd>=70;
        const b = oosGain<=0 || mulDd>2.5;
        return g ? 2 : b ? 0 : 1;
      }
      if (c === 23) return oosGain;       // сортируем по OOS PnL напрямую
      if (c === 24) return mulDd;
      if (c === 25) return retPdd;
    };
    arr.sort((a,b) => d * (_tvVal(a,col) - _tvVal(b,col)));
  } else if (detailKeys[col]) {
    const dk = detailKeys[col];
    arr.sort((a,b) => {
      const av = (a.robDetails && a.robDetails[dk] !== undefined) ? a.robDetails[dk] : -1;
      const bv = (b.robDetails && b.robDetails[dk] !== undefined) ? b.robDetails[dk] : -1;
      return d * (av - bv);
    });
  }

  if (_tableMode === 'fav') {
    const nameOrder = arr.map(r => r.name);
    favourites.sort((a,b) => nameOrder.indexOf(a.name) - nameOrder.indexOf(b.name));
  }

  _curPage = 0;
  applyFilters();
}

// Получаем favs в формате таблицы (для сортировки)
function _getFavAsResults() {
  return favourites.filter(f => (f.ns||'')=== _favNs).map(f => ({
    ...f.stats, name: f.name, cfg: f.cfg,
    pdd: f.stats.dd>0 ? f.stats.pnl/f.stats.dd : 0,
    dwr: f.stats.dwr||0, avg: f.stats.avg||0,
    p1: f.stats.p1||0, p2: f.stats.p2||0,
    robScore: f.stats.robScore, robMax: f.stats.robMax,
    robDetails: f.stats.robDetails
  }));
}

// ============================================================
/* ##OPT_C## */


// ============================================================
// PERFORMANCE WIDGET — лёгкий, без querySelectorAll
// ============================================================
(function() {
  let _fps = 60;
  let _lastRafTime = performance.now();
  let _rafCount = 0;

  function _rafTick(now) {
    _rafCount++;
    if (now - _lastRafTime >= 1000) {
      _fps = _rafCount;
      _rafCount = 0;
      _lastRafTime = now;
    }
    requestAnimationFrame(_rafTick);
  }
  requestAnimationFrame(_rafTick);

  // Обновляем виджет раз в секунду
  setInterval(function() {
    const fpsEl = document.getElementById('pw-fps');
    if (!fpsEl) return;

    const fpsColor = _fps >= 50 ? 'var(--green)' : _fps >= 30 ? 'var(--orange)' : '#ff4466';
    fpsEl.textContent = _fps + ' fps';
    fpsEl.style.color = fpsColor;

    // CPU прокси через FPS
    const cpuPct = Math.max(0, Math.round(100 - _fps / 60 * 100));
    const cpuBar = document.getElementById('pw-cpu-bar');
    const cpuVal = document.getElementById('pw-cpu');
    if (cpuBar) { cpuBar.style.width = cpuPct + '%'; cpuBar.className = 'perf-bar ' + (cpuPct<50?'green':cpuPct<80?'orange':'red'); }
    if (cpuVal) cpuVal.textContent = cpuPct + '%';

    // Результаты
    const resCount = typeof results !== 'undefined' ? results.length : 0;
    const resVal = document.getElementById('pw-res');
    if (resVal) resVal.textContent = resCount > 999 ? (resCount/1000).toFixed(1)+'k' : resCount;
  }, 1000);
})();


// ============================================================
// HILL CLIMBING — поиск лучших соседних параметров
// ============================================================
/* ##OPT_D## */
let _hcFoundResults = [];

// Показываем/скрываем список тестов устойчивости
document.addEventListener('DOMContentLoaded', function() {
  // Инициализируем настройки колонок
  _initColSettings();
  setTimeout(_robCacheLoad, 500);

  const _headerRowEl = document.getElementById('tbl-header-row');
  _attachSortListener(_headerRowEl);

  const cb = document.getElementById('hc_rob_filter');
  if (cb) cb.addEventListener('change', function() {
    const box = document.getElementById('hc-rob-tests');
    if (box) box.style.display = this.checked ? 'flex' : 'none';
  });

  // Показываем hint при выборе метрики rob или tv
  document.querySelectorAll('input[name="hc_metric"]').forEach(radio => {
    radio.addEventListener('change', function() {
      const hint = document.getElementById('hc-rob-metric-hint');
      if (hint) hint.style.display = this.value === 'rob' ? 'block' : 'none';
      const tvHint = document.getElementById('hc-tv-metric-hint');
      if (tvHint) tvHint.style.display = this.value.startsWith('tv_') ? 'block' : 'none';
      const robMinRow = document.getElementById('hc-rob-min-row');
      if (robMinRow) robMinRow.style.display = this.value === 'rob' ? 'block' : 'none';
    });
  });

  // Показываем hint и скрываем/показываем ms настройки при выборе источника
  document.querySelectorAll('input[name="hc_source"]').forEach(radio => {
    radio.addEventListener('change', function() {
      const msHint = document.getElementById('hc-ms-hint');
      if (msHint) msHint.style.display = this.value === 'multistart' ? 'block' : 'none';
    });
  });
});

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
  const toScan = _visibleResults.filter(r => r.cfg);
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
  applyFilters();
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

let _colSettings = null; // null = не загружен

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
  // Применяем показ/скрытие через CSS класс col-hidden
  // Используем nth-child для td/th — через data-col атрибут
  _COL_DEFS.forEach(col => {
    const visible = settings[col.id] !== false;
    // Скрываем все элементы с этим классом
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
    panel.style.right = (window.innerWidth - rect.right) + 'px';
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


function openHCModal(mode) {
  if (!DATA) { alert('Нет данных'); return; }
  const modeMap = {
    'selected':    'hc_src_sel',
    'visible':     'hc_src_top',
    'all_visible': 'hc_src_all_vis',
    'fav':         'hc_src_fav',
    'all_fav':     'hc_src_all_fav',
    'rob_filtered':'hc_src_rob',
  };
  const radioId = modeMap[mode] || 'hc_src_sel';
  const radio = document.getElementById(radioId);
  if (radio) radio.checked = true;

  _updateHCSrcCounts();

  document.getElementById('hc-results').innerHTML = '';
  document.getElementById('hc-progress').style.display = 'none';
  document.getElementById('hc-overlay').classList.add('open');
}

function closeHCModal() {
  _hcRunning = false;
  document.getElementById('hc-overlay').classList.remove('open');
}

function stopHillClimbing() {
  _hcRunning = false;
  _hcRobRunning = false; // прерывает текущий тест устойчивости
  document.getElementById('btn-stop-hc').style.display = 'none';
  document.getElementById('btn-run-hc').style.display = '';
  document.getElementById('hc-status').textContent = '⏹ Остановлено';
}

// Получаем метрику из результата бэктеста
function _hcMetric(r, metric) {
  if (!r || r.n < 5) return -Infinity;
  switch(metric) {
    case 'pdd': return r.dd > 0 ? r.pnl / r.dd : r.pnl > 0 ? 99 : 0;
    case 'pnl': return r.pnl;
    case 'wr':  return r.wr;
    case 'avg': return r.avg;
    case 'rob': {
      // robScore * 100 + P/DD как тай-брейкер
      const pdd = r.dd > 0 ? r.pnl / r.dd : (r.pnl > 0 ? 99 : 0);
      const rob = r._robScore || 0;
      return rob * 100 + Math.min(pdd, 99); // 500 max + pdd tiebreak
    }
    default:    return r.dd > 0 ? r.pnl / r.dd : 0;
  }
}

// TV-метрика: запускает IS (70%) и полный бэктест, делит equity-кривую по splitIdx.
// IS/OOS gains берётся из ОДНОГО полного бэктеста — корректное сравнение без edge-эффектов.
function _hcTvScore(cfg, metric) {
  const N = DATA.length;
  const isN = Math.round(N * 0.70);
  const origData = DATA;
  // IS-only run нужен только для DD-базиса
  DATA = origData.slice(0, isN);
  const rIS = _hcRunBacktest(cfg);
  DATA = origData;
  const rFull = _hcRunBacktest(cfg);
  if (!rIS || !rFull || rIS.n < 3 || rFull.n < 3) return -Infinity;
  if (!rFull.eq || rFull.eq.length < isN + 5) return -Infinity;
  // IS/OOS gains из equity-кривой ОДНОГО полного бэктеста
  const eq = rFull.eq;
  const N_eq = eq.length;
  const splitIdx = Math.min(isN - 1, N_eq - 2);
  const isGain  = eq[splitIdx];
  const oosGain = eq[N_eq - 1] - isGain;
  const isRate  = splitIdx > 0 ? isGain / (splitIdx + 1) : 0;
  const oosBars = N_eq - 1 - splitIdx;
  const oosRate = oosBars > 0 ? oosGain / oosBars : 0;
  // rateRatio: скорость OOS / скорость IS × 100. 100% = одинаково, >100% = ускоряется
  const rateRatio = isRate > 0 ? oosRate / isRate * 100
                  : (oosGain > 0 ? 200 : (oosGain < 0 ? -100 : 0));
  // DD: сравниваем IS-only бэктест с полным (оба — честные срезы данных)
  const mulDd  = rIS.dd > 0 ? rFull.dd / rIS.dd : (rFull.dd > 0 ? 99 : 1);
  const pddIS   = rIS.dd > 0 ? rIS.pnl / rIS.dd : (rIS.pnl > 0 ? 99 : 0);
  const pddFull = rFull.dd > 0 ? rFull.pnl / rFull.dd : (rFull.pnl > 0 ? 99 : 0);
  const retPdd = pddIS > 0 ? pddFull / pddIS * 100 : 0;
  switch (metric) {
    case 'tv_pnl': return oosGain;    // максимизировать OOS-прибыль напрямую
    case 'tv_pdd': return retPdd;     // максимизировать удержание P/DD
    case 'tv_score': {
      // OOS должен быть прибыльным — жёсткое требование
      if (oosGain <= 0) return -100 - mulDd;
      const sRate = Math.min(Math.max(rateRatio, 0), 150); // 0-150
      const sDd   = Math.max(0, 200 - mulDd * 100);        // 200 = без роста DD, 0 = удвоился
      const sPdd  = Math.min(Math.max(retPdd, 0), 150);    // 0-150
      return (sRate + sDd + sPdd) / 3;
    }
    default: return oosGain;
  }
}

// Полные тесты устойчивости для одного cfg (все 5: OOS+Walk+Param+Noise+MC)
// Возвращает {score, pdd} синхронно-совместимо (возвращает Promise)
async function _hcRobScore(cfg) {
  if (!_hcRunning) return 0;
  _hcRobRunning = true;
  const fakeR = { cfg };
  try {
    const score = await runRobustScoreFor(fakeR, ['oos', 'walk', 'param', 'noise', 'mc'], true);
    return score; // 0-5
  } finally {
    _hcRobRunning = false;
  }
}

// Запуск бэктеста для cfg объекта на полных данных
// Возвращает {n, pnl, wr, dd, avg, pdd} или null
// ─────────────────────────────────────────────────────────────────────────────
// ИДЕЯ 6: Surrogate model — online линейная регрессия cfg → pdd
// Быстрый предсказатель: пропускаем явно плохих кандидатов до полного бэктеста
// ─────────────────────────────────────────────────────────────────────────────
const _surrogate = {
  // Обучающая выборка: массивы X (features) и y (pdd)
  Xdata: [], ydata: [],
  // Веса модели (ridge regression, λ=0.1)
  w: null, bias: 0,
  // Нормализация
  xMean: null, xStd: null,
  trained: false,
  minSamples: 20, // минимум точек для обучения

  // Извлекаем числовые признаки из cfg
  features(cfg) {
    const c = cfg;
    return [
      c.slPair?.a?.m || 0,    // SL ATR mult
      c.slPair?.p?.m || 0,    // SL pct
      c.tpPair?.a?.m || 0,    // TP ATR mult
      c.tpPair?.b?.m || 0,    // TP2 mult
      c.atrPeriod || 14,
      c.pvL || 5,
      c.pvR || 2,
      c.beTrig || 0,
      c.trTrig || 0,
      c.adxThresh || 0,
    ];
  },

  // Добавляем точку в обучающую выборку
  addPoint(cfg, pdd) {
    if (!isFinite(pdd) || pdd > 500) return;
    this.Xdata.push(this.features(cfg));
    this.ydata.push(Math.min(pdd, 50)); // cap для стабильности
    // Обучаем каждые 10 новых точек
    if (this.Xdata.length >= this.minSamples && this.Xdata.length % 10 === 0) {
      this._train();
    }
  },

  // Ridge regression (матричный расчёт на Float64Array)
  _train() {
    const n = this.Xdata.length, d = this.Xdata[0].length;
    // Нормализация X
    const mean = new Array(d).fill(0), std = new Array(d).fill(0);
    for (const x of this.Xdata) for (let j = 0; j < d; j++) mean[j] += x[j];
    for (let j = 0; j < d; j++) mean[j] /= n;
    for (const x of this.Xdata) for (let j = 0; j < d; j++) std[j] += (x[j]-mean[j])**2;
    for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j]/n) || 1;
    this.xMean = mean; this.xStd = std;
    // Нормализуем X
    const Xn = this.Xdata.map(x => x.map((v,j) => (v - mean[j]) / std[j]));
    // y — центрируем
    const yMean = this.ydata.reduce((a,b)=>a+b,0) / n;
    const yn = this.ydata.map(v => v - yMean);
    // Gradient descent (100 итераций, lr=0.01, λ=0.1)
    const w = new Array(d).fill(0);
    const lr = 0.01, lam = 0.1;
    for (let iter = 0; iter < 100; iter++) {
      const grad = new Array(d).fill(0);
      let loss = 0;
      for (let i = 0; i < n; i++) {
        let pred = 0;
        for (let j = 0; j < d; j++) pred += w[j] * Xn[i][j];
        const err = pred - yn[i];
        loss += err * err;
        for (let j = 0; j < d; j++) grad[j] += err * Xn[i][j];
      }
      for (let j = 0; j < d; j++) w[j] -= lr * (grad[j]/n + lam * w[j]);
    }
    this.w = w; this.bias = yMean; this.trained = true;
  },

  // Предсказываем pdd для cfg. Возвращает null если нет модели.
  predict(cfg) {
    if (!this.trained || !this.w) return null;
    const x = this.features(cfg);
    let pred = this.bias;
    for (let j = 0; j < x.length; j++) {
      pred += this.w[j] * (x[j] - this.xMean[j]) / this.xStd[j];
    }
    return Math.max(0, pred);
  },

  reset() { this.Xdata = []; this.ydata = []; this.w = null; this.trained = false; }
};

// ── ROB-SURROGATE: предсказание robScore по cfg (Идея 10) ──────────────────
const _robSurrogate = {
  Xdata: [], ydata: [],
  w: null, bias: 0,
  xMean: null, xStd: null,
  trained: false,
  minSamples: 15,
  _saveTimer: null,

  features(cfg) {
    // Те же признаки что у _surrogate
    const c = cfg;
    return [
      c.slPair?.a?.m || 0,
      c.slPair?.p?.m || 0,
      c.tpPair?.a?.m || 0,
      c.tpPair?.b?.m || 0,
      c.atrPeriod || 14,
      c.pvL || 5,
      c.pvR || 2,
      c.beTrig || 0,
      c.trTrig || 0,
      c.adxThresh || 0,
    ];
  },

  addPoint(cfg, robScore) {
    if (!isFinite(robScore)) return;
    this.Xdata.push(this.features(cfg));
    this.ydata.push(Math.min(robScore, 5));
    if (this.Xdata.length >= this.minSamples && this.Xdata.length % 5 === 0) {
      this._train();
    }
    // Отложенное сохранение в localStorage (debounce 2с)
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._save(), 2000);
  },

  _train() {
    const n = this.Xdata.length, d = this.Xdata[0].length;
    const mean = new Array(d).fill(0), std = new Array(d).fill(0);
    for (const x of this.Xdata) for (let j = 0; j < d; j++) mean[j] += x[j];
    for (let j = 0; j < d; j++) mean[j] /= n;
    for (const x of this.Xdata) for (let j = 0; j < d; j++) std[j] += (x[j]-mean[j])**2;
    for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j]/n) || 1;
    this.xMean = mean; this.xStd = std;
    const Xn = this.Xdata.map(x => x.map((v,j) => (v-mean[j])/std[j]));
    const yMean = this.ydata.reduce((a,b)=>a+b,0)/n;
    const yn = this.ydata.map(v => v-yMean);
    const w = new Array(d).fill(0);
    const lr = 0.02, lam = 0.1;
    for (let iter = 0; iter < 80; iter++) {
      const grad = new Array(d).fill(0);
      for (let i = 0; i < n; i++) {
        let pred = 0;
        for (let j = 0; j < d; j++) pred += w[j]*Xn[i][j];
        const err = pred - yn[i];
        for (let j = 0; j < d; j++) grad[j] += err*Xn[i][j];
      }
      for (let j = 0; j < d; j++) w[j] -= lr*(grad[j]/n + lam*w[j]);
    }
    this.w = w; this.bias = yMean; this.trained = true;
  },

  predict(cfg) {
    if (!this.trained || !this.w) return null;
    const x = this.features(cfg);
    let pred = this.bias;
    for (let j = 0; j < x.length; j++) pred += this.w[j]*(x[j]-this.xMean[j])/this.xStd[j];
    return Math.max(0, Math.min(5, pred));
  },

  // Сохраняем в localStorage с привязкой к dataHash
  _save() {
    try {
      const key = 'robSurrogate_' + (window._dataHash || 'default');
      const payload = { Xdata: this.Xdata.slice(-500), ydata: this.ydata.slice(-500), ts: Date.now() };
      localStorage.setItem(key, JSON.stringify(payload));
    } catch(e) {}
  },

  // Загружаем из localStorage
  load(dataHash) {
    try {
      const key = 'robSurrogate_' + (dataHash || 'default');
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const saved = JSON.parse(raw);
      // Не загружаем данные старше 30 дней
      if (Date.now() - saved.ts > 30*24*3600*1000) { localStorage.removeItem(key); return; }
      this.Xdata = saved.Xdata || [];
      this.ydata = saved.ydata || [];
      if (this.Xdata.length >= this.minSamples) this._train();
      console.log('[RobSurrogate] Загружено', this.Xdata.length, 'точек из кэша');
    } catch(e) {}
  },

  reset() { this.Xdata = []; this.ydata = []; this.w = null; this.trained = false; }
};


function _hcRunBacktest(cfg) {
  if (!DATA || DATA.length < 40) return null;
  if (_robSliceCacheDataHash !== _getDataHash()) { _robSliceCache.clear(); _robSliceCacheDataHash = _getDataHash(); }
  const _hcsk = _getRobSliceKey(cfg, DATA);
  if (_robSliceCache.has(_hcsk)) return _robSliceCache.get(_hcsk);
  try {
    const ind    = _calcIndicators(cfg);
    const btCfg  = buildBtCfg(cfg, ind);
    const _hcRes = backtest(ind.pvLo, ind.pvHi, ind.atrArr, btCfg);
    _robSliceCache.set(_hcsk, _hcRes);
    return _hcRes;
  } catch(e) { return null; }
}

// Вычисляет _oos и IS-статы для HC соседа.
// Запускает IS-бэктест (70%) и полный (100%), строит cfg._oos аналогично _attachOOS в opt.js.
// Возвращает { _oos, isStats } — isStats содержат метрики IS-периода для строки детальной статистики.
function _hcBuildOOS(cfg) {
  if (!DATA || DATA.length < 100) return null;
  const N = DATA.length;
  const isN = Math.round(N * 0.70);
  const origData = DATA;

  // Внутренний прогон без взаимодействия с _robSliceCache:
  // смена DATA при использовании _hcRunBacktest сбрасывает весь кеш,
  // поэтому используем прямой вызов _calcIndicators + buildBtCfg + backtest.
  function _runDirect(slice) {
    if (!slice || slice.length < 40) return null;
    DATA = slice;
    try {
      const ind = _calcIndicators(cfg);
      const btCfg = buildBtCfg(cfg, ind);
      return backtest(ind.pvLo, ind.pvHi, ind.atrArr, btCfg);
    } catch(e) { return null; }
    finally { DATA = origData; }
  }

  // IS-прогон: только первые 70% данных
  const rIS = _runDirect(origData.slice(0, isN));

  // Полный TV-прогон: все 100% данных (используем кеш если доступен)
  const rFull = _hcRunBacktest(cfg);

  if (!rFull || !rFull.eq || rFull.eq.length < isN + 5) return null;

  // Делим equity-кривую по splitIdx (аналогично _attachOOS в opt.js)
  const eq = rFull.eq;
  const N_eq = eq.length;
  const splitIdx = Math.min(isN - 1, N_eq - 2);
  const isGain  = eq[splitIdx];
  const oosGain = eq[N_eq - 1] - isGain;
  const isRate  = splitIdx > 0 ? isGain / (splitIdx + 1) : 0;
  const oosBars = N_eq - 1 - splitIdx;
  const oosRate = oosBars > 0 ? oosGain / oosBars : 0;

  const totalGain = eq[N_eq - 1];
  const minIsGain = totalGain > 0 ? Math.max(totalGain * 0.4, 0.1) : 0.1;
  let retention;
  if (isGain < minIsGain) {
    retention = -1;
  } else if (oosGain <= 0) {
    retention = Math.max(isRate > 0 ? oosRate / isRate : -2, -2.0);
  } else {
    retention = Math.min(isRate > 0 ? oosRate / isRate : 2, 2.0);
  }

  const pddFull = rFull.dd > 0 ? rFull.pnl / rFull.dd : (rFull.pnl > 0 ? 50 : 0);

  const _oos = {
    isPct: Math.round(isN / N * 100),
    forward: {
      pnl: oosGain, retention, isGain, n: rFull.n, wr: rFull.wr, dd: rFull.dd,
      pnlFull: rFull.pnl, avg: rFull.avg, pdd: pddFull,
      dwr: rFull.dwr, p1: rFull.p1, p2: rFull.p2, c1: rFull.c1, c2: rFull.c2,
      wrL: rFull.wrL ?? null, nL: rFull.nL || 0, wrS: rFull.wrS ?? null, nS: rFull.nS || 0,
      dwrLS: rFull.dwrLS ?? null, cvr: _calcCVR(rFull.eq), upi: _calcUlcerIdx(rFull.eq),
      sortino: _calcSortino(rFull.eq), kRatio: _calcKRatio(rFull.eq), sqn: rFull.sqn??null, // ##SOR ##KR ##SQN
      omega: _calcOmega(rFull.eq), pain: _calcPainRatio(rFull.eq) // ##OMG ##PAIN
    }
  };

  // IS-статы для первой строки детальной статистики
  // Если IS-прогон успешен — используем его метрики; иначе fallback на IS-часть полной equity
  const isStats = rIS ? {
    pnl: rIS.pnl, wr: rIS.wr, n: rIS.n, dd: rIS.dd,
    pdd: rIS.dd > 0 ? rIS.pnl / rIS.dd : (rIS.pnl > 0 ? 50 : 0),
    avg: rIS.avg || 0, dwr: rIS.dwr || 0,
    p1: rIS.p1 || 0, p2: rIS.p2 || 0, c1: rIS.c1 || 0, c2: rIS.c2 || 0,
    nL: rIS.nL || 0, pL: rIS.pL || 0, wrL: rIS.wrL ?? null,
    nS: rIS.nS || 0, pS: rIS.pS || 0, wrS: rIS.wrS ?? null,
    dwrLS: rIS.dwrLS ?? null, cvr: _calcCVR(rIS.eq), upi: _calcUlcerIdx(rIS.eq),
    sortino: _calcSortino(rIS.eq), // ##SOR
    kRatio:  _calcKRatio(rIS.eq),  // ##KR
    sqn:     rIS.sqn ?? null,       // ##SQN
    omega:   _calcOmega(rIS.eq),   // ##OMG
    pain:    _calcPainRatio(rIS.eq) // ##PAIN
  } : null;

  return { _oos, isStats, eq: rFull.eq };
}

// ── MULTI-START: генерирует N случайных стартовых точек ──────────────────────
// Берёт структуру (паттерны, фильтры) из шаблона, рандомизирует числовые параметры
function _hcMultiStartPoints(template, n, opts) {
  const points = [];

  // Диапазоны для случайной генерации каждого числового параметра
  // [min, max, step] — шаг определяет гранулярность
  const numRanges = {
    // SL ATR multiplier
    sl_a_m:   [0.5,  5.0,  0.25],
    // SL PCT multiplier
    sl_p_m:   [0.5,  8.0,  0.5],
    // TP ATR/RR multiplier (первый)
    tp_a_m:   [0.5,  8.0,  0.25],
    // TP второй (если есть)
    tp_b_m:   [0.5,  8.0,  0.25],
    // ATR период
    atrPeriod:[5,    30,   1],
    // Pivot L
    pvL:      [2,    10,   1],
    // Pivot R
    pvR:      [1,    5,    1],
    // MA период (если useMA)
    maP:      [10,   200,  5],
    // BE trigger
    beTrig:   [0.5,  3.0,  0.25],
    // Trail trigger
    trTrig:   [0.5,  3.0,  0.25],
    // Trail dist
    trDist:   [0.3,  2.0,  0.25],
    // ADX threshold
    adxThresh:[15,   40,   5],
  };

  function randFromRange(min, max, step) {
    const steps = Math.floor((max - min) / step);
    return +(min + Math.floor(Math.random() * (steps + 1)) * step).toFixed(4);
  }

  for (let i = 0; i < n; i++) {
    const c = JSON.parse(JSON.stringify(template));

    // Рандомизируем SL
    if (opts.vSL) {
      if (c.slPair?.a) c.slPair.a.m = randFromRange(...numRanges.sl_a_m);
      if (c.slPair?.p) c.slPair.p.m = randFromRange(...numRanges.sl_p_m);
    }
    // Рандомизируем TP
    if (opts.vTP) {
      if (c.tpPair?.a) c.tpPair.a.m = randFromRange(...numRanges.tp_a_m);
      if (c.tpPair?.b) c.tpPair.b.m = randFromRange(...numRanges.tp_b_m);
    }
    // Рандомизируем ATR период
    if (opts.vATR) {
      c.atrPeriod = randFromRange(...numRanges.atrPeriod);
    }
    // Рандомизируем Pivot
    if (opts.vPV) {
      c.pvL = randFromRange(...numRanges.pvL);
      c.pvR = randFromRange(...numRanges.pvR);
    }
    // Рандомизируем MA период (только если MA включён)
    if (opts.vMA && c.maP > 0) {
      c.maP = randFromRange(...numRanges.maP);
    }
    // Рандомизируем BE trigger
    if (opts.vBE && c.useBE) {
      c.beTrig = randFromRange(...numRanges.beTrig);
    }
    // Рандомизируем Trail
    if (opts.vTrail && c.useTrail) {
      c.trTrig = randFromRange(...numRanges.trTrig);
      c.trDist = randFromRange(...numRanges.trDist);
    }
    // Рандомизируем ADX threshold
    if (opts.vADX && c.useADX) {
      c.adxThresh = randFromRange(...numRanges.adxThresh);
    }

    points.push(c);
  }

  return points;
}

// Генерирует список соседних cfg на расстоянии одного шага
function _hcNeighbours(cfg, opts) {
  const nb = [];
  const step  = opts.step  || 0.5;
  const pvStp = opts.pvStep || 1;

  function mutate(key, delta) {
    const c = JSON.parse(JSON.stringify(cfg));
    delete c._oos; // не наследовать IS/OOS данные от родительского cfg — они устарели для нового соседа
    if (key === 'sl_a')  { if (c.slPair&&c.slPair.a)  c.slPair.a.m  = Math.max(0.2, +(c.slPair.a.m  + delta).toFixed(2)); else return null; }
    else if (key === 'sl_p') { if (c.slPair&&c.slPair.p)  c.slPair.p.m  = Math.max(0.5, +(c.slPair.p.m  + delta).toFixed(1)); else return null; }
    else if (key === 'tp_a') { if (c.tpPair&&c.tpPair.a)  c.tpPair.a.m  = Math.max(0.2, +(c.tpPair.a.m  + delta).toFixed(2)); else return null; }
    else if (key === 'tp_b') { if (c.tpPair&&c.tpPair.b)  c.tpPair.b.m  = Math.max(0.2, +(c.tpPair.b.m  + delta).toFixed(2)); else return null; }
    else if (key === 'atr') { c.atrPeriod = Math.max(5, Math.round(c.atrPeriod + delta)); }
    else if (key === 'pvL') { c.pvL = Math.max(2, Math.round(c.pvL + delta)); }
    else if (key === 'pvR') { c.pvR = Math.max(1, Math.round(c.pvR + delta)); }
    else if (key === 'maP') { c.maP = Math.max(5, Math.round(c.maP + delta)); }
    else if (key === 'beTrig') { c.beTrig = Math.max(0.3, +(c.beTrig + delta).toFixed(2)); }
    else if (key === 'trTrig') { c.trTrig = Math.max(0.3, +(c.trTrig + delta).toFixed(2)); }
    else if (key === 'trDist') { c.trDist = Math.max(0.3, +(c.trDist + delta).toFixed(2)); }
    else if (key === 'adxT')  { c.adxThresh = Math.max(10, Math.round(c.adxThresh + delta)); }
    else if (key === 'revSkip')     { c.revSkip     = Math.max(0, Math.round((c.revSkip||0)     + delta)); }
    else if (key === 'revCooldown') { c.revCooldown = Math.max(0, Math.round((c.revCooldown||0) + delta)); }
    else if (key === 'revBars')     { c.revBars     = Math.max(1, Math.round((c.revBars||2)     + delta)); }
    else if (key === 'beOff')       { c.beOff       = Math.max(0, +(  (c.beOff||0)       + delta).toFixed(2)); }
    else if (key === 'timeBars')    { c.timeBars    = Math.max(5, Math.round((c.timeBars||20)  + delta)); }
    else if (key === 'confN')       { c.confN       = Math.max(2, Math.round((c.confN||2)      + delta)); }
    else if (key === 'sTrendWin')   { c.sTrendWin   = Math.max(3, Math.round((c.sTrendWin||10) + delta)); }
    else if (key === 'adxLen')      { c.adxLen      = Math.max(5, Math.round((c.adxLen||14)    + delta)); }
    else if (key === 'atrBoMult')   { c.atrBoMult   = Math.max(0.5, +((c.atrBoMult||2.0)      + delta).toFixed(2)); }
    else if (key === 'rsiOS')       { c.rsiOS       = Math.max(10, Math.min(45, Math.round((c.rsiOS||30)  + delta))); }
    else if (key === 'rsiOB')       { c.rsiOB       = Math.max(55, Math.min(90, Math.round((c.rsiOB||70)  + delta))); }
    else if (key === 'volFMult')    { c.volFMult    = Math.max(0.5, +((c.volFMult||1.5)        + delta).toFixed(2)); }
    else if (key === 'vsaMult')     { c.vsaMult     = Math.max(0.5, +((c.vsaMult||1.5)         + delta).toFixed(2)); }
    else if (key === 'wtThresh')    { c.wtThresh    = Math.max(1,   Math.round((c.wtThresh||10) + delta)); }
    else if (key === 'freshMax')    { c.freshMax    = Math.max(3,   Math.round((c.freshMax||10) + delta)); }
    else if (key === 'maDistMax')   { c.maDistMax   = Math.max(0.5, +((c.maDistMax||2.0)       + delta).toFixed(2)); }
    return c;
  }

  // SL
  if (opts.vSL) {
    [-step, +step].forEach(d => { const c=mutate('sl_a', d); if(c) nb.push(c); });
    [-step, +step].forEach(d => { const c=mutate('sl_p', d*2); if(c) nb.push(c); });
  }
  // TP
  if (opts.vTP) {
    [-step, +step].forEach(d => { const c=mutate('tp_a', d); if(c) nb.push(c); });
    [-step, +step].forEach(d => { const c=mutate('tp_b', d); if(c) nb.push(c); });
  }
  // ATR период
  if (opts.vATR) {
    [-2, +2, -4, +4].forEach(d => { const c=mutate('atr', d); if(c) nb.push(c); });
  }
  // Pivot
  if (opts.vPV) {
    [-pvStp, +pvStp].forEach(d => { const c=mutate('pvL', d); if(c) nb.push(c); });
    [-pvStp, +pvStp].forEach(d => { const c=mutate('pvR', d); if(c) nb.push(c); });
  }
  // MA период
  if (opts.vMA && cfg.useMA) {
    [-5, +5, -10, +10].forEach(d => { const c=mutate('maP', d); if(c) nb.push(c); });
  }
  // BE trigger
  if (opts.vBE && cfg.useBE) {
    [-step, +step].forEach(d => { const c=mutate('beTrig', d); if(c) nb.push(c); });
  }
  // Trail
  if (opts.vTrail && cfg.useTrail) {
    [-step, +step].forEach(d => { const c=mutate('trTrig', d); if(c) nb.push(c); });
    [-step, +step].forEach(d => { const c=mutate('trDist', d); if(c) nb.push(c); });
  }
  // ADX
  if (opts.vADX && cfg.useADX) {
    [-5, +5].forEach(d => { const c=mutate('adxT', d); if(c) nb.push(c); });
  }
  // RevSig skip / cooldown / bars — расширенные шаги для преодоления локальных плато
  if (opts.vRev && cfg.useRev) {
    // revSkip: шаги ±1,±2,±3,±5 + абсолютные значения 0..15 (полный диапазон)
    [-1,+1,-2,+2,-3,+3,-5,+5].forEach(d => { const c=mutate('revSkip', d); if(c) nb.push(c); });
    for (let v=0; v<=15; v++) {
      if (v !== (cfg.revSkip||0)) {
        const c = JSON.parse(JSON.stringify(cfg));
        c.revSkip = v;
        nb.push(c);
      }
    }
    // revCooldown: шаги ±1,±2,±3,±5
    [-1,+1,-2,+2,-3,+3,-5,+5].forEach(d => { const c=mutate('revCooldown', d); if(c) nb.push(c); });
    // revBars: шаги ±1,±2
    [-1,+1,-2,+2].forEach(d => { const c=mutate('revBars', d); if(c) nb.push(c); });
  }
  // BE offset
  if (opts.vBE && cfg.useBE) {
    [-step, +step].forEach(d => { const c=mutate('beOff', d); if(c) nb.push(c); });
  }
  // Time bars
  if (opts.vTime && cfg.useTime) {
    [-5,+5,-10,+10,-20,+20,-30,+30].forEach(d => { const c=mutate('timeBars', d); if(c) nb.push(c); });
  }
  // Confirm MA period
  if (opts.vConf && cfg.useConfirm) {
    [-1,+1,-2,+2,-5,+5].forEach(d => { const c=mutate('confN', d); if(c) nb.push(c); });
  }
  // Simple Trend window
  if (opts.vSTrend && cfg.useSTrend) {
    [-2,+2,-5,+5,-10,+10].forEach(d => { const c=mutate('sTrendWin', d); if(c) nb.push(c); });
  }
  // ADX length
  if (opts.vADX && cfg.useADX) {
    [-2, +2].forEach(d => { const c=mutate('adxLen', d); if(c) nb.push(c); });
  }
  // ATR Breakout multiplier
  if (opts.vATR && cfg.useAtrBo) {
    [-step, +step].forEach(d => { const c=mutate('atrBoMult', d); if(c) nb.push(c); });
  }
  // RSI levels
  if (opts.vRSI && cfg.useRSI) {
    [-5, +5].forEach(d => { const c=mutate('rsiOS', d); if(c) nb.push(c); });
    [-5, +5].forEach(d => { const c=mutate('rsiOB', d); if(c) nb.push(c); });
  }
  // Volume filters
  if (opts.vVol && cfg.useVolF)  { [-step, +step].forEach(d => { const c=mutate('volFMult',  d); if(c) nb.push(c); }); }
  if (opts.vVol && cfg.useVSA)   { [-step, +step].forEach(d => { const c=mutate('vsaMult',   d); if(c) nb.push(c); }); }
  if (opts.vVol && cfg.useWT)    { [-2,+2,-5,+5,-10,+10,-15,+15].forEach(d => { const c=mutate('wtThresh', d); if(c) nb.push(c); }); }
  // Freshness / MA distance
  if (opts.vFilt && cfg.useFresh)  { [-3,+3,-5,+5,-10,+10,-20,+20].forEach(d => { const c=mutate('freshMax', d); if(c) nb.push(c); }); }
  if (opts.vFilt && cfg.useMaDist) { [-step, +step].forEach(d => { const c=mutate('maDistMax', d); if(c) nb.push(c); }); }

  return nb;
}

async function runHillClimbing() {
  if (!DATA) { alert('Нет данных'); return; }
  if (_hcRunning) return;

  // Определяем стартовый результат
  const srcMode = document.querySelector('input[name="hc_source"]:checked').value;
  const metric  = document.querySelector('input[name="hc_metric"]:checked').value;
  const maxIter = parseInt(document.getElementById('hc_maxiter').value) || 200;
  const minTr   = parseInt(document.getElementById('hc_mintr').value)   || 30;
  const step    = parseFloat(document.getElementById('hc_step').value)  || 0.5;
  const pvStep  = parseInt(document.getElementById('hc_pvstep').value)  || 1;

  const isRobMetric = metric === 'rob';
  const isTvMetric  = metric === 'tv_score' || metric === 'tv_pnl' || metric === 'tv_pdd';
  const _metricLbl  = {pdd:'P/DD',pnl:'PnL%',wr:'WR%',avg:'Avg%',rob:'Rob',
                       tv_score:'TV Score',tv_pnl:'TV PnL ret%',tv_pdd:'TV P/DD ret%'}[metric]||'Score';
  // В режиме устойчивости ограничиваем итерации — каждая стоит ~300мс
  const effectiveMaxIter = isRobMetric ? Math.min(maxIter, 30) : maxIter;

  const opts = {
    step, pvStep,
    vSL:    document.getElementById('hc_v_sl').checked,
    vTP:    document.getElementById('hc_v_tp').checked,
    vATR:   document.getElementById('hc_v_atr').checked,
    vPV:    document.getElementById('hc_v_pv').checked,
    vMA:    document.getElementById('hc_v_ma').checked,
    vBE:    document.getElementById('hc_v_be').checked,
    vTrail: document.getElementById('hc_v_trail').checked,
    vADX:   document.getElementById('hc_v_adx').checked,
    vRev:   document.getElementById('hc_v_rev')?.checked  ?? true,
    vTime:  document.getElementById('hc_v_time')?.checked  ?? false,
    vConf:  document.getElementById('hc_v_conf')?.checked  ?? false,
    vSTrend:document.getElementById('hc_v_stw')?.checked   ?? false,
    vRSI:   document.getElementById('hc_v_rsi')?.checked   ?? false,
    vVol:   document.getElementById('hc_v_vol')?.checked   ?? false,
    vFilt:  document.getElementById('hc_v_filt')?.checked  ?? false,
  };

  // Собираем стартовые точки
  const topN = parseInt(document.getElementById('hc_src_topn')?.value) || 5;
  let startCfgs = [];
  if (srcMode === 'selected') {
    if (!_robustResult || !_robustResult.cfg) { alert('Сначала выбери результат (открой детали)'); return; }
    startCfgs = [_robustResult.cfg];
  } else if (srcMode === 'fav') {
    // Лучший из избранных по P/DD
    const best = favourites.slice().sort((a,b) => {
      const pddA = a.stats.dd>0 ? a.stats.pnl/a.stats.dd : 0;
      const pddB = b.stats.dd>0 ? b.stats.pnl/b.stats.dd : 0;
      return pddB - pddA;
    })[0];
    if (!best || !best.cfg) { alert('Нет избранных с настройками'); return; }
    startCfgs = [best.cfg];
  } else if (srcMode === 'all_fav') {
    // Все избранные как стартовые точки
    startCfgs = favourites.filter(f => f.cfg).map(f => f.cfg);
    if (!startCfgs.length) { alert('Нет избранных с настройками'); return; }
  } else if (srcMode === 'all_visible') {
    startCfgs = _visibleResults.filter(r => r.cfg).map(r => r.cfg);
    if (!startCfgs.length) { alert('Нет видимых результатов с настройками'); return; }
  } else if (srcMode === 'rob_filtered') {
    // ── ИДЕЯ 8: Все результаты с robScore >= N как стартовые точки
    const minR = parseInt(document.getElementById('hc_src_rob_min')?.value) || 3;
    const robFiltered = results.filter(r => r.cfg && r.robScore !== undefined && r.robScore >= minR);
    if (!robFiltered.length) {
      alert(`Нет результатов с robScore ≥ ${minR}. Сначала запусти OOS-скан или массовый тест.`);
      return;
    }
    startCfgs = robFiltered.map(r => r.cfg);
    toast(`🛡 Старт от ${startCfgs.length} точек с robScore ≥ ${minR}`);
  } else if (srcMode === 'multistart') {
    // ── MULTI-START: генерируем N случайных точек из пространства параметров ──
    const msN = Math.max(5, Math.min(200, parseInt(document.getElementById('hc_ms_n')?.value) || 20));
    if (!_visibleResults.length && !results.length) { alert('Нет результатов для определения пространства параметров'); return; }
    // Берём шаблон из лучшего видимого — только структура (паттерны, фильтры)
    const _msTemplate = (_visibleResults[0] || results[0])?.cfg;
    if (!_msTemplate) { alert('Нет cfg для шаблона'); return; }
    startCfgs = _hcMultiStartPoints(_msTemplate, msN, opts);
    toast(`🎲 Multi-start: ${startCfgs.length} случайных точек`);
  } else {
    // top N visible
    const n = Math.min(topN, _visibleResults.length);
    if (n === 0) { alert('Нет видимых результатов'); return; }
    for (let i = 0; i < n; i++) {
      if (_visibleResults[i].cfg) startCfgs.push(_visibleResults[i].cfg);
    }
  }
  if (!startCfgs.length) { alert('Нет cfg для старта'); return; }
  // Дедуплицируем стартовые точки
  const _startSeen = new Set();
  startCfgs = startCfgs.filter(c => {
    const k = JSON.stringify(c);
    if (_startSeen.has(k)) return false;
    _startSeen.add(k); return true;
  });

  _hcRunning = true;
  const _hcStartTime = Date.now(); // для ETA
  document.getElementById('btn-run-hc').style.display   = 'none';
  document.getElementById('btn-stop-hc').style.display  = '';
  document.getElementById('hc-progress').style.display  = 'block';
  document.getElementById('hc-pbar').style.width = '0%';
  document.getElementById('hc-results').innerHTML = '';

  const allFound = []; // все найденные результаты
  _surrogate.reset(); // сбрасываем surrogate для нового поиска

  for (let si = 0; si < startCfgs.length; si++) {
    if (!_hcRunning) break;
    const startCfg = startCfgs[si];
    const _srcLabel = srcMode === 'multistart'
      ? `🎲 Точка ${si+1}/${startCfgs.length}`
      : `Старт ${si+1}/${startCfgs.length}: ${(startCfg.usePivot?'Pivot':'')+(startCfg.useEngulf?'Engulf':'')||'cfg'}`;
    const _bestSoFar = allFound.length > 0
      ? ` | Лучший: ${Math.max(...allFound.map(x=>x.score)).toFixed(2)}`
      : '';
    document.getElementById('hc-status').textContent = _srcLabel + _bestSoFar;

    // Базовый результат для этой стартовой точки
    const baseR = _hcRunBacktest(startCfg);
    if (!baseR || baseR.n < minTr) continue;

    const baseScore = isTvMetric ? _hcTvScore(startCfg, metric) : _hcMetric(baseR, metric);

    const visited = new Set();
    visited.add(JSON.stringify(startCfg));
    let iter = 0;

    // Список тестов устойчивости (читается один раз для всего HC)
    const robTests = [];
    if (document.getElementById('hcr_oos')?.checked)   robTests.push('oos');
    if (document.getElementById('hcr_walk')?.checked)  robTests.push('walk');
    if (document.getElementById('hcr_param')?.checked) robTests.push('param');
    if (document.getElementById('hcr_noise')?.checked) robTests.push('noise');
    if (document.getElementById('hcr_mc')?.checked)    robTests.push('mc');
    // Если ни один не выбран — используем все 5 по умолчанию
    if (isRobMetric && robTests.length === 0) robTests.push('oos','walk','param','noise','mc');

    if (isRobMetric) {
      // ── ROB РЕЖИМ: ДВУХПРОХОДНЫЙ ПОИСК УСТОЙЧИВЫХ ──────────────────
      // Проход 1 (быстрый): бэктест + только OOS-фильтр → отсев слабых кандидатов
      // Проход 2 (полный): все 5 тестов на отобранных кандидатах
      // ── ИДЕЯ 7 (LHS): добавляем случайные точки из расширенного радиуса

      const robMinThresh = parseInt(document.getElementById('hc_rob_min')?.value) || 0;
      const useLHSExpand = document.getElementById('hc_lhs_expand')?.checked;

      // ── Фаза 1: генерируем кандидатов (level1 + level2 + LHS расширение) ──
      const level1 = _hcNeighbours(startCfg, opts);
      const allCandidates = [];
      const candSeen = new Set([JSON.stringify(startCfg)]);
      for (const nc of level1) {
        const k = JSON.stringify(nc);
        if (!candSeen.has(k)) { candSeen.add(k); allCandidates.push(nc); }
      }
      // Level 2 — жёсткий cap effectiveMaxIter
      outer2: for (const nc of level1) {
        for (const nc2 of _hcNeighbours(nc, opts)) {
          if (allCandidates.length >= effectiveMaxIter) break outer2;
          const k = JSON.stringify(nc2);
          if (!candSeen.has(k)) { candSeen.add(k); allCandidates.push(nc2); }
        }
      }

      // ── ИДЕЯ 7: LHS-расширение — добавляем случайные точки в ±2×step радиусе
      if (useLHSExpand) {
        const lhsCount = Math.min(effectiveMaxIter, 20); // добавляем до 20 LHS точек
        const lhsStep = (opts.step || 0.5) * 2;
        const lhsPvStep = (opts.pvStep || 1) * 2;
        const lhsOpts = { ...opts, step: lhsStep, pvStep: lhsPvStep };
        // Берём всех соседей с удвоенным шагом
        const wideNeighbours = _hcNeighbours(startCfg, lhsOpts);
        // LHS: делим на страты и берём по одному из каждой
        const lhsStrat = Math.max(1, Math.floor(wideNeighbours.length / lhsCount));
        for (let li = 0; li < wideNeighbours.length && allCandidates.length < effectiveMaxIter + lhsCount; li += lhsStrat) {
          const nc = wideNeighbours[li + Math.floor(Math.random() * Math.min(lhsStrat, wideNeighbours.length - li))];
          if (!nc) continue;
          const k = JSON.stringify(nc);
          if (!candSeen.has(k)) { candSeen.add(k); allCandidates.push(nc); }
        }
      }

      const totalCandidates = allCandidates.length;
      document.getElementById('hc-status').textContent =
        `🔎 Фаза 1: предварительный отбор из ${totalCandidates} кандидатов…`;
      await yieldToUI();

      // ── Фаза 1: быстрый бэктест + OOS предотбор ──────────────────────
      const phase1Passed = []; // кандидаты прошедшие OOS
      for (let ci = 0; ci < totalCandidates && _hcRunning; ci++) {
        const nc = allCandidates[ci];
        const r = _hcRunBacktest(nc);
        iter++;
        if (r && r.n >= minTr) {
          // Быстрый OOS: последние 20% данных должны быть прибыльными
          const N = DATA.length, cut = Math.floor(N * 0.8);
          const origData = DATA;
          DATA = origData.slice(cut);
          const rOOS = _hcRunBacktest(nc);
          DATA = origData;
          const oosOk = rOOS && rOOS.n >= 3 && rOOS.pnl > 0;
          if (oosOk) phase1Passed.push({ nc, r });
        }

        const pct = Math.round((ci + 1) / totalCandidates * 50); // первые 50%
        document.getElementById('hc-pbar').style.width = pct + '%';
        if (ci % 5 === 0) {
          document.getElementById('hc-status').textContent =
            `🔎 Фаза 1: ${ci+1}/${totalCandidates} | OOS прошли: ${phase1Passed.length}`;
          await yieldToUI();
        }
      }

      if (!_hcRunning) { /* прерван */ }
      else {
        // ── Фаза 2: полные тесты устойчивости на прошедших OOS ───────────
        const totalPhase2 = phase1Passed.length;
        document.getElementById('hc-status').textContent =
          `🛡 Фаза 2: полные тесты на ${totalPhase2} кандидатах (OOS прошли)…`;
        await yieldToUI();

        _hcRobRunning = true; // разрешаем noise/MC работать в фазе 2
        console.log('[HC Фаза2] robTests=', robTests, 'totalPhase2=', totalPhase2, '_hcRobRunning=', _hcRobRunning);
        for (let pi = 0; pi < totalPhase2 && _hcRunning; pi++) {
          const { nc, r } = phase1Passed[pi];
          const fakeR2 = { cfg: nc };
          console.log('[HC Фаза2] кандидат', pi, '/', totalPhase2, 'nc=', JSON.stringify(nc).slice(0,80));
          const { score: robScore, details: robDetails2 } = await runRobustScoreForDetailed(fakeR2, robTests, true); // fastMode=true для скорости
          console.log('[HC Фаза2] кандидат', pi, 'robScore=', robScore, 'details=', robDetails2);
          if (!_hcRunning) break;
          r._robScore = robScore; r.robDetails = robDetails2;
          const pdd = r.dd > 0 ? r.pnl / r.dd : (r.pnl > 0 ? 99 : 0);
          const score = robScore * 100 + Math.min(pdd, 99);
          // Сохраняем ВСЕ — фильтруем при отображении по robMinThresh
          allFound.push({ cfg: nc, score, r, delta: score - baseScore, robScore, robMax: robTests.length, robDetails: robDetails2 });

          const pct = 50 + Math.round((pi + 1) / totalPhase2 * 50); // вторые 50%
          document.getElementById('hc-pbar').style.width = pct + '%';
          const withRob = allFound.filter(x => x.robScore >= Math.max(1, robMinThresh)).length;
          const elapsed = Date.now() - _hcStartTime;
          const msPerIter = (elapsed / (pi + 1));
          const remaining = Math.round((totalPhase2 - pi - 1) * msPerIter / 1000);
          const etaStr = remaining > 60 ? Math.round(remaining/60) + 'м ' + (remaining%60) + 'с' : remaining + 'с';
          document.getElementById('hc-status').textContent =
            `🛡 Фаза 2: ${pi+1}/${totalPhase2} | ≥${robMinThresh}🛡: ${withRob} | ~${etaStr} осталось`;
          await yieldToUI();
        }
        _hcRobRunning = false; // сбрасываем после фазы 2
      }

    } else {
      // ── ОБЫЧНЫЙ РЕЖИМ: BEAM SEARCH ──────────────────────────────────
      let beam = [{ cfg: JSON.parse(JSON.stringify(startCfg)), score: baseScore, r: baseR }];
      let improved = true;

      while (improved && iter < effectiveMaxIter && _hcRunning) {
        improved = false;
        const candidates = [];

        for (const pos of beam) {
          for (const nc of _hcNeighbours(pos.cfg, opts)) {
            const key = JSON.stringify(nc);
            if (visited.has(key)) continue;
            visited.add(key);

            // ── ИДЕЯ 6+10: surrogate ансамбль (PDD + robScore) — пропускаем явно слабых
            {
              const predPdd = _surrogate.trained ? _surrogate.predict(nc) : null;
              const predRob = _robSurrogate.trained ? _robSurrogate.predict(nc) : null;
              const bestPdd = beam[0]?.r?.dd > 0 ? beam[0].r.pnl/beam[0].r.dd : 0;
              // Фильтр по PDD (оригинальный)
              const skipByPdd = predPdd !== null && bestPdd > 1 && predPdd < bestPdd * 0.25;
              // Фильтр по rob: если предсказанный robScore < 1 с высокой уверенностью
              const skipByRob = predRob !== null && _robSurrogate.Xdata.length > 50 && predRob < 0.8;
              if (skipByPdd || skipByRob) {
                iter++; continue; // surrogate ансамбль: явно слабый, пропускаем
              }
            }
            const r = _hcRunBacktest(nc);
            iter++;
            if (r && r.n >= minTr) {
              // Обучаем surrogate на каждом бэктесте
              const _rpdd = r.dd > 0 ? r.pnl/r.dd : (r.pnl > 0 ? 50 : 0);
              _surrogate.addPoint(nc, _rpdd);
              const score = isTvMetric ? _hcTvScore(nc, metric) : _hcMetric(r, metric);
              candidates.push({ cfg: nc, score, r });
              // Сохраняем все соседи не хуже 90% базы — чтобы показывать альтернативы
              // Порог: baseScore - 10% от |baseScore| (корректно и для отрицательных значений)
              if (score >= baseScore - Math.abs(baseScore) * 0.10) {
                allFound.push({ cfg: nc, score, r, delta: score - baseScore });
              }
            }

            const pct = Math.min(99, Math.round(iter / effectiveMaxIter * 100));
            document.getElementById('hc-pbar').style.width = pct + '%';
            document.getElementById('hc-status').textContent =
              `⚡ Итер. ${iter}/${effectiveMaxIter} | Луч: ${beam.length} | Находки: ${allFound.length} | ${_metricLbl}: ${beam[0].score.toFixed(1)}`;

            if (iter % 10 === 0) {
              await yieldToUI();
              if (!_hcRunning) break;
            }
          }
          if (!_hcRunning) break;
        }

        const allBeam = [...beam, ...candidates];
        allBeam.sort((a, b) => b.score - a.score);
        const newBeam = [];
        const bSeen = new Set();
        for (const x of allBeam) {
          const k = JSON.stringify(x.cfg);
          if (!bSeen.has(k)) { bSeen.add(k); newBeam.push(x); }
          if (newBeam.length >= 3) break;
        }
        if (newBeam.length && newBeam[0].score > beam[0].score + 0.01) {
          improved = true; beam = newBeam;
        }
      }
    } // end if isRobMetric

    // ── GA-фаза: если включён, запускаем GA поверх beam/rob результатов
    const doGA = document.getElementById('hc_use_ga')?.checked;
    if (doGA && _hcRunning) {
      document.getElementById('hc-status').textContent = '🧬 GA-поиск запущен…';
      await yieldToUI();
      const gaProgress = (gen, maxGen, best, total) => {
        document.getElementById('hc-pbar').style.width = Math.round(gen/maxGen*100) + '%';
        const bestRob = best.robScore !== undefined ? best.robScore+'/5' : best.score.toFixed(1);
        document.getElementById('hc-status').textContent =
          `🧬 GA поколение ${gen+1}/${maxGen} | Лучший: ${bestRob} | Всего найдено: ${total}`;
      };
      await _runGA([startCfg], opts, minTr, isRobMetric, allFound, baseScore, gaProgress);
    }
  }

  if (!_hcRunning) {
    document.getElementById('hc-status').textContent = '⏹ Остановлено';
  } else {
    document.getElementById('hc-pbar').style.width = '100%';
    document.getElementById('hc-status').textContent =
      `✅ Готово. Найдено улучшений: ${allFound.length}`;
  }

  _hcRunning = false;
  document.getElementById('btn-stop-hc').style.display = 'none';
  document.getElementById('btn-run-hc').style.display  = '';

  // Фаза 2: тест устойчивости для найденных (если включён)
  const doRobFilter = document.getElementById('hc_rob_filter') && document.getElementById('hc_rob_filter').checked;
  const robTopN = doRobFilter ? (parseInt(document.getElementById('hc_rob_top').value) || 5) : 0;
  let _phase2Stopped = false;
  if (doRobFilter && allFound.length > 0) {
    const robTests = [];
    if (document.getElementById('hcr_oos').checked)   robTests.push('oos');
    if (document.getElementById('hcr_walk').checked)  robTests.push('walk');
    if (document.getElementById('hcr_param').checked) robTests.push('param');
    if (document.getElementById('hcr_noise').checked) robTests.push('noise');
    if (document.getElementById('hcr_mc').checked)    robTests.push('mc');

    if (robTests.length > 0) {
      // Дедуплицируем и берём топ-100 для проверки
      const seenPre = new Set();
      const toCheck = [];
      allFound.sort((a,b) => b.score - a.score);
      for (const x of allFound) {
        const k = JSON.stringify(x.cfg);
        if (!seenPre.has(k)) { seenPre.add(k); toCheck.push(x); }
        if (toCheck.length >= 100) break;
      }

      document.getElementById('btn-run-hc').style.display = 'none';
      document.getElementById('btn-stop-hc').style.display = '';

      _hcRunning = true;    // реактивируем для фазы 2 (стоп-кнопка)
      _hcRobRunning = true; // разрешаем runRobustScoreFor работать (иначе _stopCheck()=true сразу)
      document.getElementById('btn-stop-hc').style.display = '';
      document.getElementById('btn-run-hc').style.display = 'none';
      for (let ri = 0; ri < toCheck.length; ri++) {
        if (!_hcRunning) { _phase2Stopped = true; break; }
        const x = toCheck[ri];
        document.getElementById('hc-status').textContent =
          `🔬 Тест устойчивости ${ri+1}/${toCheck.length}…`;
        document.getElementById('hc-pbar').style.width = Math.round(ri/toCheck.length*100) + '%';
        // Оборачиваем cfg в объект с нужным полем для runRobustScoreFor
        const fakeR = { cfg: x.cfg };
        const { score, details } = await runRobustScoreForDetailed(fakeR, robTests, true);
        x.robScore = score;
        x.robMax   = robTests.length;
        x.robDetails = details;
        await yieldToUI();
      }

      // Сортируем: сначала по robScore, потом по основной метрике
      allFound.sort((a,b) => {
        const aRob = a.robScore !== undefined ? a.robScore : -1;
        const bRob = b.robScore !== undefined ? b.robScore : -1;
        if (bRob !== aRob) return bRob - aRob;
        return b.score - a.score;
      });

      _hcRunning = false;
      _hcRobRunning = false;
      document.getElementById('btn-stop-hc').style.display = 'none';
      document.getElementById('btn-run-hc').style.display = '';
      document.getElementById('hc-pbar').style.width = '100%';
      document.getElementById('hc-status').textContent = _phase2Stopped ? '⏹ Остановлено' : '✅ Тест устойчивости завершён';
    }
  }

  // Конвертируем HC результаты в формат основной таблицы
  const _hcMaxRes = parseInt(document.getElementById('hc_maxres')?.value) || 500;
  // Применяем кластеризацию если включена
  const doCluster = document.getElementById('hc_cluster')?.checked !== false;
  let _allFoundFinal = allFound;
  if (doCluster && allFound.length > 1) {
    const _beforeCluster = allFound.length;
    _allFoundFinal = _hcCluster(allFound, step, pvStep);
    const hint = document.getElementById('hc-status');
    if (hint) hint.textContent += ' | Кластеризация: ' + _beforeCluster + ' → ' + _allFoundFinal.length;
  }

  _hcTableResults = [];
  const seenHC = new Set();
  // Сортируем финальный список (кластеризация могла нарушить порядок)
  if (doRobFilter) {
    _allFoundFinal.sort((a,b) => {
      const aR = a.robScore !== undefined ? a.robScore : -1;
      const bR = b.robScore !== undefined ? b.robScore : -1;
      if (bR !== aR) return bR - aR;
      return b.score - a.score;
    });
  } else {
    _allFoundFinal.sort((a,b) => b.score - a.score);
  }
  // В ROB режиме фильтруем по порогу robScore
  const _robFilterThresh = isRobMetric
    ? (parseInt(document.getElementById('hc_rob_min')?.value) || 0)
    : -1;
  for (const x of _allFoundFinal) {
    const key = JSON.stringify(x.cfg);
    if (seenHC.has(key)) continue;
    seenHC.add(key);
    // Фильтр: в rob режиме показываем только >= threshold (0 = показать все)
    if (_robFilterThresh > 0 && (x.robScore === undefined || x.robScore < _robFilterThresh)) continue;
    const raw = x.r;
    const c = x.cfg;
    // Вычисляем IS/OOS данные для HC соседа — строим _oos и IS-статы
    const _oosData = _hcBuildOOS(c);
    if (_oosData) {
      c._oos = _oosData._oos;
      // Обновляем equity полным прогоном чтобы график показывал IS/OOS split
      if (_oosData.eq) x.r.eq = _oosData.eq;
    }
    // IS-статы: из IS-прогона (70%) если доступны, иначе из HC full-data прогона
    const _is = _oosData?.isStats || null;
    const pdd = _is
      ? _is.pdd
      : (raw.dd > 0 ? raw.pnl / raw.dd : (raw.pnl > 0 ? 999 : 0));
    // Строим имя через buildName — как в основных результатах
    let slStr = ''; let tpStr = '';
    if (c.slPair) { slStr = (c.slPair.combo ? `SL(ATR×${c.slPair.a?.m||0}|${c.slLogic==='or'?'OR':'AND'}|${c.slPair.p?.m||0}%)` : c.slPair.a ? `SL×${c.slPair.a.m}ATR` : `SL${c.slPair.p?.m||0}%`); }
    if (c.tpPair) { const ta=c.tpPair.a; const tb=c.tpPair.b; tpStr = c.tpPair.combo ? `TP(${ta?.type==='rr'?'RR'+ta.m:ta?.type==='atr'?'TP×'+ta.m+'ATR':'TP'+ta.m+'%'}|${c.tpLogic==='or'?'OR':'AND'}|${tb?.type==='rr'?'RR'+tb.m:tb?.type==='atr'?'TP×'+tb.m+'ATR':'TP'+tb.m+'%'})` : ta ? (ta.type==='rr'?`RR×${ta.m}`:ta.type==='atr'?`TP×${ta.m}ATR`:`TP${ta.m}%`) : ''; }
    const name = typeof buildName === 'function'
      ? buildName(c, c.pvL, c.pvR, slStr, tpStr, {}, {maP: c.maP, maType: c.maType||'EMA', htfRatio: c.htfRatio||1, stw: c.sTrendWin, atrP: c.atrPeriod, adxL: c.adxLen})
      : ['SL('+slStr+')', 'TP('+tpStr+')', 'pv(L'+c.pvL+'R'+c.pvR+')', 'ATR'+c.atrPeriod].filter(Boolean).join(' ');
    // IS-статы для первой строки в таблице и детальной статистике
    const _isR = _is || raw;
    _hcTableResults.push({
      name, cfg: x.cfg,
      pnl: _isR.pnl, wr: _isR.wr, n: _isR.n, dd: _isR.dd, pdd,
      avg: _isR.avg||0, dwr: _isR.dwr||0,
      p1: _isR.p1||0, p2: _isR.p2||0, c1: _isR.c1||0, c2: _isR.c2||0,
      sig: _calcStatSig(_isR), gt: _calcGTScore(_isR), cvr: _isR.cvr != null ? _isR.cvr : _calcCVR(_isR.eq),
      upi: _isR.upi != null ? _isR.upi : _calcUlcerIdx(_isR.eq),
      sortino: _isR.sortino != null ? _isR.sortino : _calcSortino(_isR.eq), // ##SOR
      kRatio:  _isR.kRatio  != null ? _isR.kRatio  : _calcKRatio(_isR.eq),  // ##KR
      sqn:     _isR.sqn     != null ? _isR.sqn     : null,                   // ##SQN (нет eq→sqn нет fallback)
      omega:   _isR.omega   != null ? _isR.omega   : _calcOmega(_isR.eq),   // ##OMG
      pain:    _isR.pain    != null ? _isR.pain    : _calcPainRatio(_isR.eq), // ##PAIN
      robScore: x.robScore, robMax: x.robMax, robDetails: x.robDetails,
      eq: x.r.eq,
      nL: _isR.nL||0, pL: _isR.pL||0, wrL: _isR.wrL,
      nS: _isR.nS||0, pS: _isR.pS||0, wrS: _isR.wrS, dwrLS: _isR.dwrLS,
      _hcScore: x.score, _hcDelta: x.delta
    });
    if (_hcTableResults.length >= _hcMaxRes) break;
  }

  // Переключаем таблицу на HC режим если есть результаты
  if (_hcTableResults.length > 0) {
    switchTableMode('hc');
    const minT  = parseInt(document.getElementById('hc_rob_min')?.value) || 0;
    const full5 = allFound.filter(r => r.robScore >= 5).length;
    const full3 = allFound.filter(r => r.robScore >= 3).length;
    const msg = isRobMetric
      ? `🛡 Таблица: ${_hcTableResults.length} (порог ≥${minT}). Всего проверено: ${allFound.length} | ≥3: ${full3} | 5/5: ${full5}`
      : '🧗 Найдено ' + _hcTableResults.length + ' улучшений — показаны в таблице';
    toast(msg, 8000);
  } else if (isRobMetric) {
    const minT = parseInt(document.getElementById('hc_rob_min')?.value) || 0;
    toast(`🛡 Проверено ${allFound.length} кандидатов, ни один не прошёл порог ≥${minT || 1}. Снизь порог до 0 чтобы увидеть все, или смени стартовую точку.`, 8000);
  }

  // Рендерим результаты в модале HC (компактно)
  _hcRenderResults(allFound, metric);
}

// ============================================================
// КЛАСТЕРИЗАЦИЯ HC результатов
// Из группы похожих (отличающихся на 1 шаг) оставляем только лучший
// ============================================================
function _hcCluster(found, step, pvStep) {
  if (!found.length) return found;

  // Расстояние между двумя cfg (нормализованное)
  function cfgDist(a, b) {
    let d = 0;
    // ATR период
    d += Math.abs((a.atrPeriod||14) - (b.atrPeriod||14)) / 2;
    // Pivot
    d += Math.abs((a.pvL||5) - (b.pvL||5)) / pvStep;
    d += Math.abs((a.pvR||2) - (b.pvR||2)) / pvStep;
    // SL
    const saM = (a.slPair&&a.slPair.a) ? a.slPair.a.m : 0;
    const sbM = (b.slPair&&b.slPair.a) ? b.slPair.a.m : 0;
    d += Math.abs(saM - sbM) / step;
    const spM = (a.slPair&&a.slPair.p) ? a.slPair.p.m : 0;
    const spbM = (b.slPair&&b.slPair.p) ? b.slPair.p.m : 0;
    d += Math.abs(spM - spbM) / (step*2);
    // TP
    const taM = (a.tpPair&&a.tpPair.a) ? a.tpPair.a.m : 0;
    const tbM = (b.tpPair&&b.tpPair.a) ? b.tpPair.a.m : 0;
    d += Math.abs(taM - tbM) / step;
    // BE / Trail
    if (a.useBE && b.useBE)   d += Math.abs((a.beTrig||1) - (b.beTrig||1)) / step;
    if (a.useTrail && b.useTrail) d += Math.abs((a.trTrig||1) - (b.trTrig||1)) / step;
    // MA
    d += Math.abs((a.maP||0) - (b.maP||0)) / 5;
    return d;
  }

  // Greedy clustering: порог = 1.5 (меньше 1.5 нормализованных шагов = "одна группа")
  const THRESH = 1.5;
  const centers = []; // выбранные представители кластеров

  for (const x of found) {
    let tooClose = false;
    for (const c of centers) {
      if (cfgDist(x.cfg, c.cfg) < THRESH) { tooClose = true; break; }
    }
    if (!tooClose) centers.push(x);
  }
  return centers;
}

// ─────────────────────────────────────────────────────────────────────────────
// ИДЕЯ 10: Генетический алгоритм для поиска устойчивых параметров
// Популяция → оценка → отбор → скрещивание → мутация → новое поколение
// ─────────────────────────────────────────────────────────────────────────────

// Скрещивание двух cfg: берём параметры от родителей случайно
function _gaCrossover(cfgA, cfgB) {
  const c = JSON.parse(JSON.stringify(cfgA));
  // Для каждого числового параметра — 50/50 берём от A или B
  const keys = ['atrPeriod','pvL','pvR','maP','beTrig','trTrig','trDist','adxThresh','revSkip','revCooldown','revBars','volFMult','vsaMult','wtThresh','freshMax','maDistMax','rsiOS','rsiOB'];
  for (const k of keys) {
    if (Math.random() < 0.5 && cfgB[k] !== undefined) c[k] = cfgB[k];
  }
  // SL/TP — берём целиком от одного из родителей
  if (Math.random() < 0.5 && cfgB.slPair) c.slPair = JSON.parse(JSON.stringify(cfgB.slPair));
  if (Math.random() < 0.5 && cfgB.tpPair) c.tpPair = JSON.parse(JSON.stringify(cfgB.tpPair));
  return c;
}

// Мутация: случайный сдвиг 1-2 параметров на ±step
function _gaMutate(cfg, opts, mutRate) {
  const c = JSON.parse(JSON.stringify(cfg));
  const step = opts.step || 0.5;
  const pvStp = opts.pvStep || 1;
  const candidates = [];
  if (opts.vSL && c.slPair?.a) candidates.push(() => { c.slPair.a.m = Math.max(0.2, +(c.slPair.a.m + (Math.random()<0.5?1:-1)*step).toFixed(2)); });
  if (opts.vTP && c.tpPair?.a) candidates.push(() => { c.tpPair.a.m = Math.max(0.2, +(c.tpPair.a.m + (Math.random()<0.5?1:-1)*step).toFixed(2)); });
  if (opts.vATR) candidates.push(() => { c.atrPeriod = Math.max(5, c.atrPeriod + (Math.random()<0.5?1:-1)); });
  if (opts.vPV) candidates.push(() => { c.pvL = Math.max(2, c.pvL + (Math.random()<0.5?1:-1)*pvStp); c.pvR = Math.max(1, c.pvR + (Math.random()<0.5?1:-1)*pvStp); });
  if (opts.vBE && c.useBE) candidates.push(() => { c.beTrig = Math.max(0.3, +(c.beTrig + (Math.random()<0.5?1:-1)*step).toFixed(2)); });
  if (opts.vTrail && c.useTrail) candidates.push(() => { c.trTrig = Math.max(0.3, +(c.trTrig + (Math.random()<0.5?1:-1)*step).toFixed(2)); });
  if (opts.vRev && c.useRev) {
    candidates.push(() => { c.revSkip     = Math.max(0, (c.revSkip||0)     + (Math.random()<0.5?1:-1)); });
    candidates.push(() => { c.revCooldown = Math.max(0, (c.revCooldown||0) + (Math.random()<0.5?1:-1)); });
    candidates.push(() => { c.revBars     = Math.max(1, (c.revBars||2)     + (Math.random()<0.5?1:-1)); });
  }
  if (opts.vADX && c.useADX) candidates.push(() => { c.adxThresh = Math.max(10, c.adxThresh + (Math.random()<0.5?5:-5)); });
  if (opts.vMA && c.useMA)   candidates.push(() => { c.maP = Math.max(5, c.maP + (Math.random()<0.5?5:-5)); });
  if (opts.vRSI && c.useRSI) { candidates.push(() => { c.rsiOS = Math.max(10, Math.min(45, c.rsiOS + (Math.random()<0.5?5:-5))); }); candidates.push(() => { c.rsiOB = Math.max(55, Math.min(90, c.rsiOB + (Math.random()<0.5?5:-5))); }); }
  if (opts.vVol && c.useVolF)  candidates.push(() => { c.volFMult  = Math.max(0.5, +(c.volFMult  + (Math.random()<0.5?1:-1)*step).toFixed(2)); });
  if (opts.vVol && c.useVSA)   candidates.push(() => { c.vsaMult   = Math.max(0.5, +(c.vsaMult   + (Math.random()<0.5?1:-1)*step).toFixed(2)); });
  if (opts.vFilt && c.useFresh)  candidates.push(() => { c.freshMax  = Math.max(3, c.freshMax  + (Math.random()<0.5?3:-3)); });
  if (opts.vFilt && c.useMaDist) candidates.push(() => { c.maDistMax = Math.max(0.5, +(c.maDistMax + (Math.random()<0.5?1:-1)*step).toFixed(2)); });
  // Мутируем от 1 до 3 параметров
  const nMut = Math.floor(Math.random() * 3) + 1;
  for (let m = 0; m < nMut && candidates.length; m++) {
    const idx = Math.floor(Math.random() * candidates.length);
    if (Math.random() < mutRate) candidates[idx]();
  }
  return c;
}

// Генетический алгоритм поиска устойчивых параметров
// Возвращает Promise, обновляет allFound напрямую
async function _runGA(startCfgs, opts, minTr, isRobMetric, allFound, baseScore, onProgress) {
  const POP_SIZE = 16;       // размер популяции
  const MAX_GEN = 15;        // максимум поколений
  const SURVIVE_RATE = 0.5;  // выживаемость (топ-50%)
  const MUT_RATE = 0.7;      // вероятность мутации параметра
  const seen = new Set();

  // Инициализация популяции: стартовые точки + мутации
  let population = [];
  for (const cfg of startCfgs.slice(0, 4)) {
    population.push(cfg);
    for (let i = 0; i < Math.floor(POP_SIZE / startCfgs.slice(0,4).length) - 1; i++) {
      population.push(_gaMutate(cfg, opts, MUT_RATE));
    }
  }
  // Если популяция мала — добиваем мутациями от лучшего
  while (population.length < POP_SIZE) {
    population.push(_gaMutate(population[0], opts, MUT_RATE));
  }
  population = population.slice(0, POP_SIZE);

  let bestScore = -Infinity;
  let noImprovGen = 0;

  for (let gen = 0; gen < MAX_GEN && _hcRunning; gen++) {
    // Оцениваем популяцию
    const scored = [];
    for (const cfg of population) {
      if (!_hcRunning) break;
      const key = JSON.stringify(cfg);
      if (seen.has(key)) {
        // Берём из allFound если уже считали
        const cached = allFound.find(x => JSON.stringify(x.cfg) === key);
        if (cached) { scored.push({ cfg, score: cached.score, r: cached.r, robScore: cached.robScore }); }
        continue;
      }
      seen.add(key);
      const r = _hcRunBacktest(cfg);
      if (!r || r.n < minTr) continue;
      // Обучаем surrogate
      const _rpdd = r.dd > 0 ? r.pnl/r.dd : (r.pnl > 0 ? 50 : 0);
      _surrogate.addPoint(cfg, _rpdd);
      let robScore = undefined;
      if (isRobMetric) {
        robScore = await _hcRobScore(cfg);
        if (!_hcRunning) break;
        r._robScore = robScore;
      }
      const pdd = r.dd > 0 ? r.pnl/r.dd : (r.pnl > 0 ? 99 : 0);
      const score = isRobMetric ? (robScore * 100 + Math.min(pdd, 99)) : _hcMetric(r, 'pdd');
      scored.push({ cfg, score, r, robScore });
      // Сохраняем в allFound
      allFound.push({ cfg, score, r, delta: score - baseScore,
        robScore: robScore, robMax: isRobMetric ? 5 : undefined });
      await yieldToUI();
    }
    if (!scored.length) break;
    scored.sort((a,b) => b.score - a.score);
    // Проверяем улучшение
    if (scored[0].score > bestScore + 0.5) {
      bestScore = scored[0].score; noImprovGen = 0;
    } else { noImprovGen++; }
    if (onProgress) onProgress(gen, MAX_GEN, scored[0], allFound.length);
    if (noImprovGen >= 3) break; // сходится — стоп
    // Отбор: топ-50% выживают
    const survivors = scored.slice(0, Math.ceil(POP_SIZE * SURVIVE_RATE));
    // Новое поколение
    const newPop = survivors.map(x => x.cfg); // элита
    while (newPop.length < POP_SIZE) {
      const pA = survivors[Math.floor(Math.random() * survivors.length)].cfg;
      const pB = survivors[Math.floor(Math.random() * survivors.length)].cfg;
      let child = pA === pB ? _gaMutate(pA, opts, MUT_RATE) : _gaCrossover(pA, pB);
      if (Math.random() < 0.5) child = _gaMutate(child, opts, MUT_RATE * 0.5);
      newPop.push(child);
    }
    population = newPop;
  }
}


function _hcRenderResults(found, metric) {
  const el = document.getElementById('hc-results');
  if (!found.length) {
    el.innerHTML = '<div style="color:var(--text3);font-size:.7em;padding:8px">Улучшений не найдено. Попробуй увеличить шаг или кол-во итераций.</div>';
    return;
  }
  // Сортируем по score desc, дедуплицируем
  found.sort((a, b) => b.score - a.score);
  const seen = new Set();
  const uniq = found.filter(x => { const k = JSON.stringify(x.cfg); if(seen.has(k)) return false; seen.add(k); return true; });
  const top = uniq.slice(0, 20);

  // Сохраняем в глобальный массив для безопасного доступа по индексу
  _hcFoundResults = top.map((x, i) => {
    const c = x.cfg;
    let slStr = '';
    if (c.slPair) {
      if (c.slPair.a) slStr += 'SL×' + c.slPair.a.m + 'ATR';
      if (c.slPair.p) slStr += (slStr?' ':'') + 'SL' + c.slPair.p.m + '%';
    }
    let tpStr = '';
    if (c.tpPair) {
      if (c.tpPair.a) tpStr += 'TP×' + c.tpPair.a.m;
      if (c.tpPair.b) tpStr += (tpStr?' ':'') + 'TP2×' + c.tpPair.b.m;
    }
    const descParts = [
      'pv(L'+c.pvL+'R'+c.pvR+')',
      'ATR'+c.atrPeriod,
      slStr, tpStr,
      c.useBE  ? 'BE'   +c.beTrig  : '',
      c.useTrail ? 'Trail'+c.trTrig : '',
    ].filter(Boolean).join(' ');
    const name = 'HC-' + (i+1) + ': ' + descParts;
    return { ...x, name, descParts };
  });

  const metricLabel = {pdd:'P/DD',pnl:'PnL%',wr:'WR%',avg:'Avg%',tv_score:'TV Score',tv_pnl:'TV PnL ret%',tv_pdd:'TV P/DD ret%'}[metric]||'Score';
  let html = '<div style="font-size:.65em;font-weight:600;color:var(--text3);margin-bottom:6px">ТОП УЛУЧШЕНИЙ (' + top.length + ' из ' + found.length + '):</div>';
  html += '<div style="display:flex;flex-direction:column;gap:4px">';

  for (let i = 0; i < _hcFoundResults.length; i++) {
    const x = _hcFoundResults[i];
    const r = x.r;
    const pddCls = r.dd>0 && r.pnl/r.dd>=5 ? 'pos' : 'warn';
    const pdd = r.dd > 0 ? r.pnl/r.dd : 0;
    const deltaSign = x.delta >= 0 ? '+' : '';
    const favStar = favourites.some(f => f.name === x.name) ? '⭐' : '☆';
    html += '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:5px;padding:5px 8px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:3px">' +
        '<span style="font-size:.82em;color:var(--accent);font-family:var(--font-mono);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer" onclick="_hcOpenDetail(' + i + ')" title="Открыть детали">' + x.descParts + '</span>' +
        '<span class="' + pddCls + '" style="font-weight:600;white-space:nowrap;font-size:.82em">' + metricLabel + ': ' + x.score.toFixed(2) + '</span>' +
      '</div>' +
      '<div style="display:flex;gap:8px;font-size:.72em;color:var(--text2);align-items:center">' +
        '<span class="' + (r.pnl>=0?'pos':'neg') + '">PnL ' + r.pnl.toFixed(1) + '%</span>' +
        '<span>WR ' + r.wr.toFixed(1) + '%</span>' +
        '<span class="muted">' + r.n + ' сд.</span>' +
        '<span class="neg">DD ' + r.dd.toFixed(1) + '%</span>' +
        '<span class="' + pddCls + '">P/DD ' + pdd.toFixed(2) + '</span>' +
        '<span style="color:var(--green)">' + deltaSign + (x.delta).toFixed(2) + '</span>' +
        '<span style="margin-left:auto;display:flex;gap:5px">' +
          '<button onclick="_hcOpenDetail(' + i + ')" style="font-size:.9em;padding:1px 7px;background:rgba(0,212,255,.1);border:1px solid var(--accent);border-radius:3px;color:var(--accent);cursor:pointer" title="Открыть детали">🔍 Детали</button>' +
          '<button onclick="_hcAddToFav(' + i + ',this)" style="font-size:.9em;padding:1px 7px;background:rgba(255,170,0,.1);border:1px solid rgba(255,170,0,.4);border-radius:3px;color:var(--orange);cursor:pointer" title="В избранное">' + favStar + ' В избр.</button>' +
        '</span>' +
      '</div>' +
    '</div>';
  }
  html += '</div>';
  el.innerHTML = html;
}

// Открываем найденный результат в детальной панели
function _hcOpenDetail(idx) {
  const x = _hcFoundResults[idx];
  if (!x) return;
  // Прикрепляем IS/OOS данные лениво — только при открытии деталей
  if (!x.cfg._oos) {
    const _oosData = _hcBuildOOS(x.cfg);
    if (_oosData) {
      x.cfg._oos = _oosData._oos;
      if (_oosData.eq) x.r.eq = _oosData.eq; // полная equity для графика
    }
  }
  const raw = x.r;
  // showDetail ожидает pdd и dwr — досчитываем
  const pdd = raw.dd > 0 ? raw.pnl / raw.dd : (raw.pnl > 0 ? 999 : 0);
  const r = Object.assign({}, raw, {
    name: x.name,
    cfg:  x.cfg,
    pdd,
    dwr:  raw.dwr || 0,
    avg:  raw.avg || 0,
    p1:   raw.p1  || 0,
    p2:   raw.p2  || 0,
  });
  _robustResult = r;
  showDetail(r);
}

// Добавляем HC результат в избранное
function _hcAddToFav(idx, btn) {
  const x = _hcFoundResults[idx];
  if (!x) return;
  const r = x.r;
  const name = x.name;
  const fi = favourites.findIndex(f => f.name === name);
  if (fi >= 0) {
    favourites.splice(fi, 1);
    btn.textContent = '☆ В избр.';
  } else {
    const pdd = r.dd > 0 ? r.pnl / r.dd : 0;
    favourites.push({ name, cfg: x.cfg, stats: {
      pnl: r.pnl, wr: r.wr, n: r.n, dd: r.dd, pdd,
      avg: r.avg||0, p1: r.p1||0, p2: r.p2||0
    }});
    btn.textContent = '⭐ В избр.';
    btn.style.background = 'rgba(255,170,0,.2)';
  }
  storeSave(_favKey(), favourites);
  renderFavBar();
}


// ── Expose all functions globally for inline event handlers ──
// ── Expose functions to window for sandbox compatibility ──
try { window.applyFilters = applyFilters; window.applyFiltersDebounced = applyFiltersDebounced; } catch(e) { /* skip */ }
try { window.openHCModal = openHCModal; } catch(e) {}
try { window.toggleFavBody = toggleFavBody; } catch(e) {}
try { window.switchTableMode = switchTableMode; } catch(e) {}
try { window._getFavAsResults = _getFavAsResults; } catch(e) {}
try { window.runOOSScan = runOOSScan; } catch(e) {}
try { window._updateHCSrcCounts = _updateHCSrcCounts; } catch(e) {}
try { window.drawEquityForResult = drawEquityForResult; } catch(e) {}
try { window._refreshFavStars = _refreshFavStars; } catch(e) {}
try { window.appendFile = appendFile; } catch(e) {}
try { window.clearAppendedData = clearAppendedData; } catch(e) {}
try { window.closeHCModal = closeHCModal; } catch(e) {}
try { window.runHillClimbing = runHillClimbing; } catch(e) {}
try { window.stopHillClimbing = stopHillClimbing; } catch(e) {}
try { window._hcOpenDetail = _hcOpenDetail; } catch(e) {}
try { window._hcAddToFav = _hcAddToFav; } catch(e) {}
try { window.applyParsedText = applyParsedText; } catch(e) { /* skip */ }
try { window.closeDetail = closeDetail; } catch(e) { /* skip */ }
try { window.closeParseModal = closeParseModal; } catch(e) { /* skip */ }
try { window.closeRobustModal = closeRobustModal; } catch(e) { /* skip */ }
try { window.closeTplModal = closeTplModal; } catch(e) { /* skip */ }
try { window.copyDetail = copyDetail; } catch(e) { /* skip */ }
try { window.deleteTpl = deleteTpl; } catch(e) { /* skip */ }
try { window.doSort = doSort; } catch(e) { /* skip */ }
try { window.exportTpl = exportTpl; } catch(e) { /* skip */ }
try { window.importTplFromText = importTplFromText; } catch(e) { /* skip */ }
try { window.loadFavAsTpl = loadFavAsTpl; } catch(e) { /* skip */ }
try { window.loadTpl = loadTpl; } catch(e) { /* skip */ }
try { window.openParseModal = openParseModal; } catch(e) { /* skip */ }
try { window.openRobustModal = openRobustModal; } catch(e) { /* skip */ }
try { window.openTplModal = openTplModal; } catch(e) { /* skip */ }
try { window.pauseOpt = pauseOpt; } catch(e) { /* skip */ }
try { window.previewParsedText = previewParsedText; } catch(e) { /* skip */ }
try { window.removeFav = removeFav; } catch(e) { /* skip */ }
try { window.runMassRobust = runMassRobust; } catch(e) { /* skip */ }
try { window.runOpt = runOpt; } catch(e) { /* skip */ }
try { window.runRobustTest = runRobustTest; } catch(e) { /* skip */ }
try { window.saveTpl = saveTpl; } catch(e) { /* skip */ }
try { window.selectFastOnly = selectFastOnly; } catch(e) { /* skip */ }
try { window.setDefaultTpl = setDefaultTpl; } catch(e) { /* skip */ }
try { window.setLogic = setLogic; } catch(e) { /* skip */ }
try { window.setOptMode = setOptMode; } catch(e) { /* skip */ }
try { window.setXMode = setXMode; } catch(e) { /* skip */ }
try { window.stopOpt = stopOpt; } catch(e) { /* skip */ }
try { window.toggleFav = toggleFav; } catch(e) { /* skip */ }

// ── Fallback: bind events via addEventListener for strict sandboxes ──
document.addEventListener('DOMContentLoaded', function() {
  var btnMap = {
    // Mode buttons
    'mode_full':  function(){ setOptMode('full'); },
    'mode_prune': function(){ setOptMode('prune'); },
    'mode_mc':    function(){ setOptMode('mc'); },
    'mode_tpe':   function(){ setOptMode('tpe'); },
    // Rev mode
    'revmode_any':   function(){ setXMode('rev','any'); },
    'revmode_plus':  function(){ setXMode('rev','plus'); },
    'revmode_minus': function(){ setXMode('rev','minus'); },
    // Rev action
    'revact_exit':  function(){ setXMode('revact','exit'); },
    'revact_rev':   function(){ setXMode('revact','rev'); },
    'revact_skip':  function(){ setXMode('revact','skip'); },
    // Time mode
    'timemode_any':  function(){ setXMode('time','any'); },
    'timemode_plus': function(){ setXMode('time','plus'); },
    // Clx mode
    'clxmode_any':  function(){ setXMode('clx','any'); },
    'clxmode_plus': function(){ setXMode('clx','plus'); },
    // Logic buttons
    'sl_or':  function(){ setLogic('sl','or'); },
    'sl_and': function(){ setLogic('sl','and'); },
    'tp_or':  function(){ setLogic('tp','or'); },
    'tp_and': function(){ setLogic('tp','and'); },
    // Main controls
    'rbtn': runOpt,
    'pbtn': pauseOpt,
    'sbtn': stopOpt,
    // Template/modal buttons
    // Template modal buttons
    'btn-open-tpl':   openTplModal,
    'btn-open-parse': openParseModal,
    'btn-save-tpl':   saveTpl,
    'btn-close-tpl':  closeTplModal,
    'btn-import-tpl': importTplFromText,
    'btn-mass-robust': runMassRobust,
    // Detail modal buttons
    'btn-close-detail': closeDetail,
    'btn-copy-detail':  copyDetail,
    'btn-open-robust-from-detail': function(){ openRobustModal(); },
    // Robust modal buttons
    'btn-run-robust':   runRobustTest,
    'btn-close-robust': closeRobustModal,
    // Parse text modal buttons
    'btn-apply-parse':   applyParsedText,
    'btn-preview-parse': previewParsedText,
    'btn-close-parse':   closeParseModal,
    'clr-btn': function(){ if(typeof clearResults==='function') clearResults(); }
  };
  Object.keys(btnMap).forEach(function(id) {
    var el = document.getElementById(id);
    // Не добавляем listener если уже есть inline onclick — иначе двойной вызов!
    if (el && !el.hasAttribute('onclick')) {
      el.addEventListener('click', function(e) {
        btnMap[id]();
      });
    }
  });
});




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
  const fname  = document.getElementById('oof_name')?.value.trim().toLowerCase() || '';
  const fopnl  = parseFloat(document.getElementById('oof_opnl')?.value);
  const fnpnl  = parseFloat(document.getElementById('oof_npnl')?.value);
  const fdpnl  = parseFloat(document.getElementById('oof_dpnl')?.value);
  const fdapt  = parseFloat(document.getElementById('oof_dapt')?.value);
  const fdwr   = parseFloat(document.getElementById('oof_dwr')?.value);
  const fon    = parseFloat(document.getElementById('oof_on')?.value);
  const fnn    = parseFloat(document.getElementById('oof_nn')?.value);
  const fscore = document.getElementById('oof_score')?.value || '';

  const src = _oosTableResults.filter(r => {
    if (fname && !r.name.toLowerCase().includes(fname)) return false;
    if (!isNaN(fopnl) && (r.old_pnl ?? -Infinity) < fopnl) return false;
    if (!isNaN(fnpnl) && (r.new_pnl ?? -Infinity) < fnpnl) return false;
    if (!isNaN(fdpnl) && (r.delta_pnl ?? -Infinity) < fdpnl) return false;
    if (!isNaN(fon)   && (r.old_n ?? -Infinity) < fon) return false;
    if (!isNaN(fnn)   && (r.new_n ?? -Infinity) < fnn) return false;
    if (!isNaN(fdapt) || !isNaN(fdwr)) {
      const ao = r.old_n > 0 ? r.old_pnl / r.old_n : null;
      const an = r.new_n > 0 ? r.new_pnl / r.new_n : null;
      if (!isNaN(fdapt)) { const da = (ao!=null&&an!=null)?an-ao:null; if(da==null||da<fdapt) return false; }
      if (!isNaN(fdwr) && (r.delta_wr ?? -Infinity) < fdwr) return false;
    }
    if (fscore) {
      const badge = _oosGetBadge(r);
      if (badge !== fscore) return false;
    }
    return true;
  });

  const tbody = document.getElementById('oos-tb');
  if (!tbody) return;
  let html = '';
  for (let i = 0; i < src.length; i++) {
    const r = src[i];
    const globalIdx = _oosTableResults.indexOf(r);
    const isFavRow = isFav(r.name);
    const fav = isFavRow ? '⭐' : '☆';
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
      `<tr data-i="${globalIdx}" data-name="${_esc(r.name)}" class="${isFavRow?'fav-row':''}">` +
      `<td title="${_esc(r.name)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(r.name)}</td>` +
      `<td style="text-align:center;cursor:pointer" onclick="toggleFav(${globalIdx},event)">${fav}</td>` +
      `<td class="${r.old_pnl!=null&&r.old_pnl>0?'pos':'neg'}">${f1(r.old_pnl)}%</td>` +
      `<td class="${r.new_pnl!=null&&r.new_pnl>0?'pos':'neg'}">${f1(r.new_pnl)}%</td>` +
      `<td class="${pCls(r.delta_pnl)}">${dStr(r.delta_pnl)}</td>` +
      `<td class="${pCls(apt_old)}">${f2(apt_old)}%</td>` +
      `<td class="${pCls(apt_new)}">${f2(apt_new)}%</td>` +
      `<td class="${pCls(delta_apt)}">${dStr(delta_apt,2)}</td>` +
      `<td class="muted">${f1(r.old_wr)}%</td>` +
      `<td class="muted">${f1(r.new_wr)}%</td>` +
      `<td class="${pCls(r.delta_wr)}">${dStr(r.delta_wr)}</td>` +
      `<td class="muted" style="text-align:center">${r.old_n??'—'}</td>` +
      `<td class="muted" style="text-align:center">${r.new_n??'—'}</td>` +
      `<td style="text-align:center"><span class="oos-badge ${badge} ${oosCls}">${oosScore}</span></td>` +
      `</tr>`;
  }
  tbody.innerHTML = html;
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


function doOOSSort(key) {
  if (_oosSortKey === key) _oosSortDir *= -1;
  else { _oosSortKey = key; _oosSortDir = -1; }
  _oosTableResults.sort((a, b) => {
    const av = _getOOSSortVal(a, key);
    const bv = _getOOSSortVal(b, key);
    if (typeof av === 'string') return _oosSortDir * av.localeCompare(bv);
    return _oosSortDir * ((av ?? -Infinity) - (bv ?? -Infinity));
  });
  applyFilters();
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
    let rOld = null, rNew = null;
    try { DATA = origDATA; rOld = _hcRunBacktest(r.cfg); } catch(e) {}
    try { DATA = NEW_DATA; rNew = _hcRunBacktest(r.cfg); } catch(e) {}
    DATA = origDATA;

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
      // OOS-специфичные поля
      old_pnl:   rOld ? rOld.pnl : null,
      old_wr:    rOld ? rOld.wr  : null,
      old_n:     rOld ? rOld.n   : null,
      new_pnl:   rNew ? rNew.pnl : null,
      new_wr:    rNew ? rNew.wr  : null,
      new_n:     rNew ? rNew.n   : null,
      delta_pnl: (rOld && rNew) ? rNew.pnl - rOld.pnl : null,
      delta_wr:  (rOld && rNew) ? rNew.wr  - rOld.wr  : null,
      old_bars:  DATA ? DATA.length : null,
      new_bars:  NEW_DATA ? NEW_DATA.length : null,
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


// ============================================================
// PARAMETER SENSITIVITY HEATMAP
// ============================================================
// Показывает устойчивость стратегии при изменении 2 параметров.
// Открывается кнопкой "🗺️ Карта параметров" в детальной панели.

const _HM_PARAMS = [
  { key: 'pvL',       label: 'Pivot Left',   step: 1,    min: 1,   max: 15  },
  { key: 'pvR',       label: 'Pivot Right',  step: 1,    min: 1,   max: 8   },
  { key: 'atrPeriod', label: 'ATR Period',   step: 1,    min: 3,   max: 35  },
  { key: 'sl_a_m',    label: 'SL ATR mult',  step: 0.5,  min: 0.5, max: 6   },
  { key: 'sl_p_m',    label: 'SL % mult',    step: 0.5,  min: 0.5, max: 8   },
  { key: 'tp_a_m',    label: 'TP mult',      step: 0.5,  min: 0.5, max: 8   },
  { key: 'tp_b_m',    label: 'TP-B mult',    step: 0.5,  min: 0.5, max: 8   },
  { key: 'maP',       label: 'MA Period',    step: 5,    min: 10,  max: 200 },
  { key: 'beTrig',    label: 'BE Trigger',   step: 0.25, min: 0.25, max: 4  },
  { key: 'trTrig',    label: 'Trail Trig',   step: 0.25, min: 0.25, max: 4  },
  { key: 'trDist',    label: 'Trail Dist',   step: 0.25, min: 0.1,  max: 3  },
  { key: 'adxThresh', label: 'ADX Thresh',   step: 5,    min: 10,  max: 55  },
  { key: 'revBars',   label: 'Rev Bars',     step: 1,    min: 1,   max: 15  },
];

let _hmRunning = false;
let _hmStop    = false;

function openHeatmapModal() {
  if (!_robustResult || !_robustResult.cfg) {
    alert('Сначала откройте стратегию из таблицы результатов');
    return;
  }
  const cfg = _robustResult.cfg;
  const available = _HM_PARAMS.filter(p => typeof cfg[p.key] === 'number' && isFinite(cfg[p.key]));
  if (available.length < 2) {
    alert('Недостаточно числовых параметров для построения карты (нужно минимум 2)');
    return;
  }

  const xSel = document.getElementById('hm-x-param');
  const ySel = document.getElementById('hm-y-param');
  xSel.innerHTML = '';
  ySel.innerHTML = '';
  available.forEach(p => {
    xSel.add(new Option(`${p.label}  [${cfg[p.key]}]`, p.key));
    ySel.add(new Option(`${p.label}  [${cfg[p.key]}]`, p.key));
  });
  if (available.length >= 2) ySel.selectedIndex = 1;

  document.getElementById('hm-status').textContent = '';
  const canvas = document.getElementById('hm-canvas');
  canvas.width = 0; canvas.height = 0;
  document.getElementById('hm-run-btn').textContent = '▶ Запустить';
  document.getElementById('heatmap-overlay').classList.add('open');
}

function closeHeatmapModal() {
  _hmStop = true;
  document.getElementById('heatmap-overlay').classList.remove('open');
}

async function runHeatmap() {
  if (!_robustResult || !_robustResult.cfg) return;
  if (_hmRunning) { _hmStop = true; return; }

  const cfg    = _robustResult.cfg;
  const xKey   = document.getElementById('hm-x-param').value;
  const yKey   = document.getElementById('hm-y-param').value;
  const nSteps = parseInt(document.getElementById('hm-steps').value);
  const metric = document.getElementById('hm-metric').value;

  if (xKey === yKey) { alert('Выберите разные параметры для осей X и Y'); return; }

  const xParam = _HM_PARAMS.find(p => p.key === xKey);
  const yParam = _HM_PARAMS.find(p => p.key === yKey);
  if (!xParam || !yParam) return;

  function genAxis(param) {
    const center = cfg[param.key];
    const vals = [];
    for (let i = -nSteps; i <= nSteps; i++) {
      const v = Math.round((center + i * param.step) * 10000) / 10000;
      if (v >= param.min && v <= param.max) vals.push(v);
    }
    return vals;
  }

  const xVals = genAxis(xParam);
  const yVals = genAxis(yParam);
  const total = xVals.length * yVals.length;

  _hmRunning = true;
  _hmStop    = false;
  const runBtn = document.getElementById('hm-run-btn');
  runBtn.textContent = '⏹ Стоп';

  const grid = [];
  let done = 0;

  for (let yi = 0; yi < yVals.length; yi++) {
    if (_hmStop) break;
    const row = [];
    for (let xi = 0; xi < xVals.length; xi++) {
      if (_hmStop) break;

      const testCfg = Object.assign({}, cfg, { [xKey]: xVals[xi], [yKey]: yVals[yi] });
      const res = _hcRunBacktest(testCfg);

      let val = null;
      if (res && res.n > 0) {
        if      (metric === 'pnl') val = res.pnl;
        else if (metric === 'wr')  val = res.wr;
        else if (metric === 'dd')  val = res.dd;
        else if (metric === 'pdd') val = res.dd > 0 ? res.pnl / res.dd : null;
        else if (metric === 'n')   val = res.n;
      }
      row.push(val);
      done++;

      if (done % 7 === 0) {
        document.getElementById('hm-status').textContent = `${done}/${total}`;
        _hmRender(grid.concat([row]), xVals, yVals, xParam, yParam, metric, cfg[xKey], cfg[yKey]);
        await yieldToUI();
      }
    }
    grid.push(row);
  }

  _hmRender(grid, xVals, yVals, xParam, yParam, metric, cfg[xKey], cfg[yKey]);
  document.getElementById('hm-status').textContent = _hmStop ? `⏹ ${done}/${total}` : `✓ ${total} ячеек`;
  _hmRunning = false;
  _hmStop    = false;
  runBtn.textContent = '▶ Запустить';
}

function _hmRender(grid, xVals, yVals, xParam, yParam, metric, cX, cY) {
  const canvas = document.getElementById('hm-canvas');
  const wrap   = document.getElementById('hm-canvas-wrap');

  const PAD_L = 66, PAD_R = 14, PAD_T = 34, PAD_B = 44;
  const cols = xVals.length, rows = yVals.length;
  const wrapW  = Math.max(wrap.clientWidth - 8, 300);
  const cellW  = Math.max(Math.floor((wrapW - PAD_L - PAD_R) / cols), 28);
  const cellH  = Math.max(cellW - 2, 26);
  const W = PAD_L + cols * cellW + PAD_R;
  const H = PAD_T + rows * cellH + PAD_B;

  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const flat = grid.flat().filter(v => v !== null && isFinite(v));
  if (!flat.length) return;

  const lowerBetter = (metric === 'dd');
  const minV = Math.min(...flat), maxV = Math.max(...flat);
  const range = maxV - minV || 1;

  function getColor(v) {
    if (v === null || !isFinite(v)) return '#1a1a1a';
    let t = (v - minV) / range;
    if (lowerBetter) t = 1 - t;
    const r = t < 0.5 ? 255 : Math.round(255 - (t - 0.5) * 2 * 205);
    const g = t < 0.5 ? Math.round(t * 2 * 185) : 185;
    const b = t < 0.5 ? 70  : Math.round(70 - (t - 0.5) * 2 * 50);
    return `rgba(${r},${g},${b},0.85)`;
  }

  const fSize = Math.max(9, Math.min(12, cellH - 10));
  ctx.font = `${fSize}px monospace`;

  for (let yi = 0; yi < grid.length; yi++) {
    const row = grid[yi];
    for (let xi = 0; xi < (row ? row.length : 0); xi++) {
      const v  = row[xi];
      const cx = PAD_L + xi * cellW;
      const cy = PAD_T + (rows - 1 - yi) * cellH;

      ctx.fillStyle = getColor(v);
      ctx.fillRect(cx, cy, cellW, cellH);

      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(cx, cy, cellW, cellH);

      if (xVals[xi] === cX && yVals[yi] === cY) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(cx + 1.5, cy + 1.5, cellW - 3, cellH - 3);
      }

      if (v !== null && cellW > 30) {
        const disp = metric === 'n'   ? String(v)
                   : metric === 'pdd' ? v.toFixed(2)
                   : metric === 'dd'  ? v.toFixed(1) + '%'
                   :                    v.toFixed(1);
        ctx.fillStyle = 'rgba(0,0,0,0.78)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(disp, cx + cellW / 2, cy + cellH / 2);
      }
    }
  }

  ctx.font = '10px monospace';
  ctx.textBaseline = 'top';
  for (let xi = 0; xi < xVals.length; xi++) {
    const cx = PAD_L + xi * cellW + cellW / 2;
    ctx.fillStyle = xVals[xi] === cX ? '#fff' : '#888';
    ctx.textAlign = 'center';
    ctx.fillText(xVals[xi], cx, PAD_T + rows * cellH + 5);
  }

  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let yi = 0; yi < yVals.length; yi++) {
    const cy = PAD_T + (rows - 1 - yi) * cellH + cellH / 2;
    ctx.fillStyle = yVals[yi] === cY ? '#fff' : '#888';
    ctx.fillText(yVals[yi], PAD_L - 6, cy);
  }

  ctx.fillStyle = '#ccc';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(xParam.label, PAD_L + cols * cellW / 2, H - 4);

  ctx.save();
  ctx.translate(11, PAD_T + rows * cellH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(yParam.label, 0, 0);
  ctx.restore();

  const legX = PAD_L, legY = 6, legW = cols * cellW, legH = 8;
  const grad = ctx.createLinearGradient(legX, 0, legX + legW, 0);
  if (lowerBetter) {
    grad.addColorStop(0,   'rgba(50,185,80,0.85)');
    grad.addColorStop(0.5, 'rgba(255,200,50,0.85)');
    grad.addColorStop(1,   'rgba(255,40,70,0.85)');
  } else {
    grad.addColorStop(0,   'rgba(255,40,70,0.85)');
    grad.addColorStop(0.5, 'rgba(255,185,50,0.85)');
    grad.addColorStop(1,   'rgba(50,185,80,0.85)');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(legX, legY, legW, legH);

  const fmt = v => metric === 'n'   ? String(Math.round(v))
                 : metric === 'pdd' ? v.toFixed(2)
                 :                    v.toFixed(1);
  ctx.fillStyle = '#777';
  ctx.font = '9px monospace';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(lowerBetter ? fmt(minV) + ' (лучше)' : fmt(minV), legX, legY + legH + 2);
  ctx.textAlign = 'right';
  ctx.fillText(lowerBetter ? fmt(maxV) : fmt(maxV) + ' (лучше)', legX + legW, legY + legH + 2);
}


// ═══════════════════════════════════════════════════════════════
// PROJECT MANAGEMENT UI
// ═══════════════════════════════════════════════════════════════

// ── Core: switch to a project ──────────────────────────────────

async function setProject(id) {
  if (!id) return;
  // Save current project state before switching
  const curId = ProjectManager.getCurrentId();
  if (curId && curId !== id) {
    ProjectManager.saveState({ favNs: _favNs }, curId);
  }

  await ProjectManager.switchTo(id);
  const proj = ProjectManager.getCurrent();
  if (!proj) return;

  // Load per-project favourites
  favourites = (await storeLoad(_favKey())) || [];

  // Restore last state
  const state = ProjectManager.loadState(id);
  _favNs = (state && state.favNs) ? state.favNs : '';
  localStorage.setItem('use6_fav_ns', _favNs);

  // Update UI
  _updateProjBar(proj);
  renderFavBar();
  const nsEl = document.getElementById('fav-ns-label');
  if (nsEl) nsEl.textContent = _favNs ? _favNs : '';

  // Auto-load last CSV from project folder
  if (proj.lastFile) {
    const file = await ProjectManager.readCSVFile(id, proj.lastFile);
    if (file) loadFile(file);
  } else {
    // No lastFile — try to pick the most recent CSV
    const files = await ProjectManager.listCSVFiles(id);
    if (files.length > 0) {
      const file = await ProjectManager.readCSVFile(id, files[0].name);
      if (file) { loadFile(file); ProjectManager.updateLastFile(files[0].name); }
      ProjectManager.markFilesKnown(id, files.map(f => f.name));
    }
  }

  closeProjSwitcher();
}

function _updateProjBar(proj) {
  const el = document.getElementById('proj-name');
  if (el) el.textContent = proj ? proj.name : 'Нет проекта';
}

// ── Create project ─────────────────────────────────────────────

let _projCreateHandle = null;
let _projCreateFirstLaunch = false;

function openCreateProject(firstLaunch) {
  _projCreateHandle = null;
  _projCreateFirstLaunch = !!firstLaunch;
  const overlay = document.getElementById('proj-create-overlay');
  if (!overlay) return;
  document.getElementById('proj-create-name').value = '';
  document.getElementById('proj-create-folder').textContent = 'не выбрана';
  // Hide cancel button on first launch
  const cancelBtn = document.getElementById('proj-create-cancel');
  if (cancelBtn) cancelBtn.style.display = firstLaunch ? 'none' : '';
  overlay.style.display = 'flex';
  setTimeout(() => document.getElementById('proj-create-name').focus(), 50);
}

function closeProjCreate() {
  if (_projCreateFirstLaunch) return; // must create on first launch
  const overlay = document.getElementById('proj-create-overlay');
  if (overlay) overlay.style.display = 'none';
}

async function projPickFolder() {
  if (!window.showDirectoryPicker) {
    toast('File System Access API не поддерживается в этом браузере', 2500);
    return;
  }
  try {
    _projCreateHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    document.getElementById('proj-create-folder').textContent = _projCreateHandle.name;
  } catch(e) { /* user cancelled */ }
}

async function confirmCreateProject() {
  const name = (document.getElementById('proj-create-name').value || '').trim();
  if (!name) { toast('Введи название проекта', 1500); return; }
  if (!_projCreateHandle) { toast('Выбери папку', 1500); return; }

  // Snapshot current template
  const templateSnapshot = templates.find(t => t.isDefault) || null;

  const proj = await ProjectManager.create(name, _projCreateHandle, templateSnapshot);
  closeProjCreate();
  await setProject(proj.id);
  toast('✅ Проект создан: ' + name, 2000);
}

// ── Switch project ─────────────────────────────────────────────

function openProjSwitcher() {
  const overlay = document.getElementById('proj-switch-overlay');
  if (!overlay) return;
  _renderProjList();
  overlay.style.display = 'flex';
}

function closeProjSwitcher() {
  const overlay = document.getElementById('proj-switch-overlay');
  if (overlay) overlay.style.display = 'none';
}

function _renderProjList() {
  const list = document.getElementById('proj-switch-list');
  if (!list) return;
  const projects = ProjectManager.getAll();
  const curId    = ProjectManager.getCurrentId();

  if (!projects.length) {
    list.innerHTML = '<div style="font-size:.7em;color:var(--text3);padding:8px">Нет проектов</div>';
    return;
  }

  list.innerHTML = projects.map(p => {
    const active = p.id === curId;
    const dt = new Date(p.createdAt).toLocaleDateString('ru');
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:6px;border:1px solid ${active ? 'var(--accent)' : 'var(--border)'};background:${active ? 'rgba(0,212,255,.07)' : 'var(--bg)'};cursor:pointer"
      onclick="setProject('${p.id}')">
      <div style="flex:1;min-width:0">
        <div style="font-size:.78em;color:${active ? 'var(--accent)' : 'var(--text)'};font-weight:${active ? '700' : '400'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name}</div>
        <div style="font-size:.6em;color:var(--text3);margin-top:2px">${p.lastFile || 'нет файла'} · создан ${dt}</div>
      </div>
      ${active ? '<span style="color:var(--accent);font-size:.8em">✓</span>' : ''}
      <button onclick="event.stopPropagation();_dupProject('${p.id}')" title="Дублировать проект"
        style="padding:2px 7px;background:var(--bg3);border:1px solid var(--border2);border-radius:3px;color:var(--text3);font-size:.65em;cursor:pointer">⧉</button>
      <button onclick="event.stopPropagation();_delProject('${p.id}')" title="Удалить проект"
        style="padding:2px 7px;background:rgba(255,68,102,.08);border:1px solid rgba(255,68,102,.25);border-radius:3px;color:#ff4466;font-size:.65em;cursor:pointer">✕</button>
    </div>`;
  }).join('');
}

async function _dupProject(id) {
  const newProj = await ProjectManager.duplicate(id);
  if (newProj) {
    await setProject(newProj.id);
    closeProjSwitcher();
    toast('⧉ Проект продублирован: ' + newProj.name, 2000);
  }
}

async function _delProject(id) {
  const proj = ProjectManager.getById(id);
  if (!proj) return;
  if (!confirm(`Удалить проект "${proj.name}"?\nИзбранные и история будут удалены.`)) return;
  await ProjectManager.remove(id);
  const remaining = ProjectManager.getAll();
  if (remaining.length > 0) {
    await setProject(remaining[0].id);
  } else {
    _updateProjBar(null);
    favourites = [];
    renderFavBar();
  }
  _renderProjList();
}

// ── New files polling ──────────────────────────────────────────

async function _pollNewFiles() {
  const id = ProjectManager.getCurrentId();
  if (!id) return;
  try {
    const newFiles = await ProjectManager.checkNewFiles(id);
    const badge = document.getElementById('proj-new-badge');
    if (badge) badge.style.display = newFiles.length > 0 ? 'inline' : 'none';
  } catch(e) {}
}

async function refreshProjectFiles() {
  const id = ProjectManager.getCurrentId();
  if (!id) return;
  const files = await ProjectManager.listCSVFiles(id);
  ProjectManager.markFilesKnown(id, files.map(f => f.name));
  document.getElementById('proj-new-badge').style.display = 'none';
  // Load the most recent file
  if (files.length > 0) {
    const file = await ProjectManager.readCSVFile(id, files[0].name);
    if (file) { loadFile(file); ProjectManager.updateLastFile(files[0].name); }
    toast('🔄 Данные обновлены: ' + files[0].name, 2000);
  }
}

