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
var _archivedResults = []; // hidden archive: results removed from table but kept for future use
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
  _loadPrfCutoff(); // restore cutoff fields from localStorage

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
      // Cache CSV text for restore on page reload (no file permission needed)
      try { localStorage.setItem(`use6_csv_${ProjectManager.getCurrentId()}`, e.target.result); } catch(_) {}
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
  if (typeof _mlScoresArrCache     !== 'undefined') _mlScoresArrCache     = { arr: null, len: -1 }; // ##ML_FILTER
  if (typeof _mlHighScoresArrCache !== 'undefined') _mlHighScoresArrCache = { arr: null, len: -1 }; // ##ML_FILTER_HIGH
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
  if (typeof _mlScoresArrCache     !== 'undefined') _mlScoresArrCache     = { arr: null, len: -1 }; // ##ML_FILTER
  if (typeof _mlHighScoresArrCache !== 'undefined') _mlHighScoresArrCache = { arr: null, len: -1 }; // ##ML_FILTER_HIGH
  // Сохраняем мастер-копию для ресэмплинга в multi-TF режиме
  window.DATA_1M = DATA.slice();
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
  // Показываем/скрываем нужную таблицу и графики
  const stdScroll   = document.querySelector('.tbl-scroll');
  const oosTbl      = document.getElementById('oos-tbl-wrap');
  const eqWrap      = document.getElementById('eq-wrap');
  const oosChrtWrap = document.getElementById('oos-chart-wrap');
  if (mode === 'oos') {
    if (stdScroll)   stdScroll.style.display   = 'none';
    if (oosTbl)      oosTbl.style.display       = '';
    if (eqWrap)      eqWrap.style.display       = 'none'; // стандартный график скрыть
    // OOS график покажет drawOOSChart при клике по строке
  } else {
    if (stdScroll)   stdScroll.style.display   = '';
    if (oosTbl)      oosTbl.style.display       = 'none';
    if (oosChrtWrap) oosChrtWrap.style.display  = 'none'; // OOS график скрыть
    // eq-wrap управляет собственной видимостью через drawEquityData
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
    const favLvl = getFavLevel(r.name);
    const fav = favLvl > 0 ? '★' : '☆';
    html +=
      `<tr data-i="${rii}" style="cursor:pointer">` +
      `<td class="accent" style="font-size:.66em;max-width:380px;overflow:hidden;text-overflow:ellipsis;user-select:text;cursor:text" title="${r.name}">${r.name}</td>` +
      `<td class="col-fav" style="font-size:.85em" data-fav="${rii}" data-level="${favLvl}">${fav}</td>` +
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
  _tvCmpCurrentResult = r; // для loadTVcsv
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
      `<div class="dp-stats-lbl tv" title="Полный бэктест на всех данных (IS+OOS). Соответствует equity-графику.">${r.cfg.useMLFilter ? '' : 'TradingView · '}полный бэктест (IS+${oosPct}%) <span style="font-size:.75em;opacity:.6">· см. график</span></div>` +
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
  if (c.usePChg) {
    const htfA = (c.pChgHtfA||1) > 1 ? ` · HTF×${c.pChgHtfA}` : '';
    ent += row('% изменения цены A', `ВКЛ · ≥${c.pChgPctA||1}% за ${c.pChgPeriodA||10} св.${htfA}`, 'on');
    if (c.usePChgB) {
      const htfB = (c.pChgHtfB||1) > 1 ? ` · HTF×${c.pChgHtfB}` : '';
      ent += row('% изменения цены B (AND)', `ВКЛ · ≥${c.pChgPctB||1}% за ${c.pChgPeriodB||20} св.${htfB}`, 'on');
    }
  } else {
    ent += row('% изменения цены', 'ВЫКЛ', 'off');
  }
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
  ex += row('Wick Trailing SL', c.useWickTrail ? `ВКЛ · отступ ${c.wickMult??1}×${c.wickOffType||'atr'}` : 'ВЫКЛ', c.useWickTrail?'on':'off');
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
  filt += row('Структура рынка HH/LL', c.useStruct ? `ВКЛ · L${c.strPvL||5} R${c.strPvR||2} · окно ${c.structLen||200}` : 'ВЫКЛ', c.useStruct?'on':'off');
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

  // ##TVCOMPARE_START##
  {
    const _tvSec = `<div style="font-size:.78em;color:var(--text3);margin-bottom:6px">Загрузи CSV из TradingView (индикатор USE_EXP → Table Mode → ⬇). Сравниваем <b>Equity%</b> с JS-бэктестом построчно.</div>`+
      `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">`+
      `<input type="file" id="fi-tv-csv" accept=".csv,.tsv" style="display:none" onchange="loadTVcsv(event)">`+
      `<button class="tpl-btn2" style="padding:3px 10px;font-size:.85em" onclick="document.getElementById('fi-tv-csv').click()">📂 TV CSV</button>`+
      `<span id="tv-cmp-status" style="font-size:.78em;color:var(--text3)">файл не загружен</span>`+
      `</div><div id="tv-cmp-results" style="margin-top:6px"></div>`;
    html = section('📡', 'СРАВНЕНИЕ С TRADINGVIEW (E2E)', _tvSec) + html;
  }
  // ##TVCOMPARE_END##

  $('dp-body').innerHTML = html;

  // Build copy text
  _detailText = buildCopyText(r, c, slName, tpName);

  $('detail-overlay').classList.add('open');
  $('detail-panel').classList.add('open');
}

// Карта: поле cfg → {id: HTML-элемент, type: 'chk'|'val'|'sel'}
// Используется для автоматического восстановления настроек из JSON блока
const CFG_HTML_MAP = {
  // ── Паттерны входа ─────────────────────────────────────────────────────────
  usePivot:       {id:'e_pv',            type:'chk'},
  pvL:            {id:'e_pvl',           type:'val'},
  pvR:            {id:'e_pvr',           type:'val'},
  useEngulf:      {id:'e_eng',           type:'chk'},
  usePinBar:      {id:'e_pin',           type:'chk'},
  pinRatio:       {id:'e_pinr',          type:'val'},
  useBoll:        {id:'e_bol',           type:'chk'},
  bbLen:          {id:'e_bbl',           type:'val'},
  bbMult:         {id:'e_bbm',           type:'val'},
  useDonch:       {id:'e_don',           type:'chk'},
  donLen:         {id:'e_donl',          type:'val'},
  useAtrBo:       {id:'e_atrbo',         type:'chk'},
  atrBoLen:       {id:'e_atbl',          type:'val'},
  atrBoMult:      {id:'e_atbm',          type:'val'},
  useMaTouch:     {id:'e_mat',           type:'chk'},
  matType:        {id:'e_matt',          type:'sel'},
  matPeriod:      {id:'e_matp',          type:'val'},
  matZone:        {id:'e_matz',          type:'val'},
  useSqueeze:     {id:'e_sqz',           type:'chk'},
  sqzBBLen:       {id:'e_sqbl',          type:'val'},
  sqzKCMult:      {id:'e_sqkm',          type:'val'},
  sqzMinBars:     {id:'e_sqzb',          type:'val'},
  useTLTouch:     {id:'e_tl_touch',      type:'chk'},
  useTLBreak:     {id:'e_tl_break',      type:'chk'},
  useFlag:        {id:'e_flag',          type:'chk'},
  useTri:         {id:'e_tri',           type:'chk'},
  useRsiExit:     {id:'e_rsix',          type:'chk'},
  rsiExitPeriod:  {id:'e_rsix_p',        type:'val'},
  rsiExitOS:      {id:'e_rsix_os',       type:'val'},
  rsiExitOB:      {id:'e_rsix_ob',       type:'val'},
  useKalmanCross: {id:'e_kalcr',         type:'chk'},
  kalmanCrossLen: {id:'e_kalcrl',        type:'val'},
  useMaCross:     {id:'e_macr',          type:'chk'},
  maCrossP:       {id:'e_macr_p',        type:'val'},
  maCrossType:    {id:'e_macr_t',        type:'sel'},
  useFreeEntry:   {id:'e_free',          type:'chk'},
  useMacd:        {id:'e_macd',          type:'chk'},
  macdFast:       {id:'e_macd_f',        type:'val'},
  macdSlow:       {id:'e_macd_s',        type:'val'},
  macdSignalP:    {id:'e_macd_sg',       type:'val'},
  useEIS:         {id:'e_eis',           type:'chk'},
  eisPeriod:      {id:'e_eis_p',         type:'val'},
  useSoldiers:    {id:'e_soldiers',      type:'chk'},
  useStochExit:   {id:'e_stx',           type:'chk'},
  stochKP:        {id:'e_stx_k',         type:'val'},
  stochDP:        {id:'e_stx_d',         type:'val'},
  stochOS:        {id:'e_stx_os',        type:'val'},
  stochOB:        {id:'e_stx_ob',        type:'val'},
  useVolMove:     {id:'e_volmv',         type:'chk'},
  volMoveMult:    {id:'e_volmv_m',       type:'val'},
  useInsideBar:   {id:'e_inb',           type:'chk'},
  useNReversal:   {id:'e_nrev',          type:'chk'},
  nReversalN:     {id:'e_nrev_n',        type:'val'},
  usePChg:        {id:'e_pchg',          type:'chk'},
  pChgPctA:       {id:'e_pchg_pct_a',    type:'val'},
  pChgPeriodA:    {id:'e_pchg_per_a',    type:'val'},
  pChgHtfA:       {id:'e_pchg_htf_a',    type:'val'},
  usePChgB:       {id:'e_pchgb',         type:'chk'},
  pChgPctB:       {id:'e_pchg_pct_b',    type:'val'},
  pChgPeriodB:    {id:'e_pchg_per_b',    type:'val'},
  pChgHtfB:       {id:'e_pchg_htf_b',    type:'val'},
  useSupertrend:  {id:'e_st',            type:'chk'},
  stAtrP:         {id:'e_st_atrp',       type:'val'},
  stMult:         {id:'e_st_mult',       type:'val'},
  useStExit:      {id:'x_st',            type:'chk'},
  useWaitEntry:   {id:'e_wait_on',       type:'chk'},
  waitBars:       {id:'e_wait_bars',     type:'val'},
  useWaitRetrace: {id:'e_wait_retrace',  type:'chk'},
  waitMaxBars:    {id:'e_wait_maxb',     type:'val'},
  waitCancelAtr:  {id:'e_wait_catr',     type:'val'},
  // ── SL/TP специфика ────────────────────────────────────────────────────────
  useSLPiv:       {id:'s_piv',           type:'chk'},
  slPivTrail:     {id:'s_pivtr',         type:'chk'},
  slPivOff:       {id:'s_pivoff',        type:'val'},
  slPivMax:       {id:'s_pivmax',        type:'val'},
  slPivL:         {id:'s_pivl',          type:'val'},
  slPivR:         {id:'s_pivr',          type:'val'},
  // ── Механики выхода ────────────────────────────────────────────────────────
  useBE:          {id:'x_be',            type:'chk'},
  beTrig:         {id:'x_bet',           type:'val'},
  beOff:          {id:'x_beo',           type:'val'},
  useTrail:       {id:'x_tr',            type:'chk'},
  trTrig:         {id:'x_trt',           type:'val'},
  trDist:         {id:'x_trd',           type:'val'},
  useWickTrail:   {id:'x_wt',            type:'chk'},
  wickMult:       {id:'x_wt_mult',       type:'val'},
  wickOffType:    {id:'x_wt_type',       type:'sel'},
  useRev:         {id:'x_rev',           type:'chk'},
  revBars:        {id:'x_revb',          type:'val'},
  revSkip:        {id:'x_revskip',       type:'val'},
  revCooldown:    {id:'x_revcd',         type:'val'},
  useTime:        {id:'x_time',          type:'chk'},
  timeBars:       {id:'x_timeb',         type:'val'},
  usePartial:     {id:'x_part',          type:'chk'},
  partRR:         {id:'x_partr',         type:'val'},
  partPct:        {id:'x_partp',         type:'val'},
  partBE:         {id:'x_partbe',        type:'chk'},
  useClimax:      {id:'f_clx',           type:'chk'},
  clxVolMult:     {id:'f_clxm',          type:'val'},
  clxBodyMult:    {id:'f_clxb',          type:'val'},
  // ── Фильтры тренда ─────────────────────────────────────────────────────────
  useMA:          {id:'f_ma',            type:'chk'},
  maType:         {id:'f_mat',           type:'sel'},
  maP:            {id:'f_map',           type:'val'},
  htfRatio:       {id:'f_ma_htf',        type:'val'},
  useADX:         {id:'f_adx',           type:'chk'},
  adxThresh:      {id:'f_adxt',          type:'val'},
  adxLen:         {id:'f_adxl',          type:'val'},
  adxHtfRatio:    {id:'f_adx_htf',       type:'val'},
  useAdxSlope:    {id:'f_adx_slope',     type:'chk'},
  adxSlopeBars:   {id:'f_adx_slope_bars',type:'val'},
  useRSI:         {id:'f_rsi',           type:'chk'},
  rsiOS:          {id:'f_rsios',         type:'val'},
  rsiOB:          {id:'f_rsiob',         type:'val'},
  useAtrExp:      {id:'f_atrexp',        type:'chk'},
  atrExpMult:     {id:'f_atrexpm',       type:'val'},
  useSTrend:      {id:'f_strend',        type:'chk'},
  sTrendWin:      {id:'f_stw',           type:'val'},
  useStruct:      {id:'f_struct',        type:'chk'},
  strPvL:         {id:'f_strpvl',        type:'val'},
  strPvR:         {id:'f_strpvr',        type:'val'},
  useFresh:       {id:'f_fresh',         type:'chk'},
  freshMax:       {id:'f_freshm',        type:'val'},
  useVolF:        {id:'f_volf',          type:'chk'},
  volFMult:       {id:'f_vfm',           type:'val'},
  useMaDist:      {id:'f_madist',        type:'chk'},
  maDistMax:      {id:'f_madv',          type:'val'},
  useCandleF:     {id:'f_candle',        type:'chk'},
  candleMin:      {id:'f_cmin',          type:'val'},
  candleMax:      {id:'f_cmax',          type:'val'},
  useConsec:      {id:'f_consec',        type:'chk'},
  consecMax:      {id:'f_concm',         type:'val'},
  useConfirm:     {id:'f_confirm',       type:'chk'},
  confN:          {id:'f_confn',         type:'val'},
  confMatType:    {id:'f_conf_mat',      type:'sel'},
  confHtfRatio:   {id:'f_conf_htf',      type:'val'},
  // ── Объёмные фильтры ───────────────────────────────────────────────────────
  useVSA:         {id:'f_vsa',           type:'chk'},
  vsaMult:        {id:'f_vsam',          type:'val'},
  vsaPeriod:      {id:'f_vsap',          type:'val'},
  useLiq:         {id:'f_liq',           type:'chk'},
  liqMin:         {id:'f_liqm',          type:'val'},
  useVolDir:      {id:'f_vdir',          type:'chk'},
  volDirPeriod:   {id:'f_vdirp',         type:'val'},
  useWT:          {id:'f_wt',            type:'chk'},
  wtThresh:       {id:'f_wtt',           type:'val'},
  wtN:            {id:'f_wtn',           type:'val'},
  wtVolW:         {id:'f_wtv',           type:'val'},
  wtBodyW:        {id:'f_wtb',           type:'val'},
  wtUseDist:      {id:'f_wtdist',        type:'chk'},
  useFat:         {id:'f_fat',           type:'chk'},
  fatConsec:      {id:'f_fatc',          type:'val'},
  fatVolDrop:     {id:'f_fatv',          type:'val'},
  useKalmanMA:    {id:'f_kalman',        type:'chk'},
  kalmanLen:      {id:'f_kalmanl',       type:'val'},
  useMacdFilter:  {id:'f_macd',          type:'chk'},
  useER:          {id:'f_er',            type:'chk'},
  erPeriod:       {id:'f_erp',           type:'val'},
  erThresh:       {id:'f_ert',           type:'val'},
  // ── Общие настройки ────────────────────────────────────────────────────────
  atrPeriod:      {id:'c_atr',           type:'val'},
};

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
  if (c.usePChg) {
    const htfA = (c.pChgHtfA||1) > 1 ? ` HTF×${c.pChgHtfA}` : '';
    lines.push('% изм. цены (A):    ВКЛ · ≥' + (c.pChgPctA||1) + '% за ' + (c.pChgPeriodA||10) + ' св.' + htfA);
    if (c.usePChgB) {
      const htfB = (c.pChgHtfB||1) > 1 ? ` HTF×${c.pChgHtfB}` : '';
      lines.push('% изм. цены (B AND):ВКЛ · ≥' + (c.pChgPctB||1) + '% за ' + (c.pChgPeriodB||20) + ' св.' + htfB);
    }
  } else {
    lines.push('% изменения цены:   ВЫКЛ');
  }
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
  lines.push('Wick Trail SL:   ' + on(c.useWickTrail, 'отступ=' + (c.wickMult??1) + 'x' + (c.wickOffType||'atr')));
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
  lines.push('Структура рынка:  ' + on(c.useStruct,  'pvl=' + (c.strPvL||5) + ' pvr=' + (c.strPvR||2)));
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

  // ── JSON блок для точного восстановления всех настроек ────────────────────
  // Сериализуем все скалярные поля cfg + объекты slPair/tpPair
  // Массивы (Float64Array, Uint8Array, обычные) намеренно исключаем — они runtime-кэш
  const _jsonCfg = {};
  for (const [k, v] of Object.entries(c)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'boolean' || typeof v === 'number' || typeof v === 'string') {
      _jsonCfg[k] = v;
    } else if (typeof v === 'object' && !Array.isArray(v) &&
               !(v instanceof Float64Array) && !(v instanceof Uint8Array) &&
               !(v instanceof Int8Array) && !(v instanceof Int32Array)) {
      // Включаем plain объекты: slPair, tpPair и т.д.
      _jsonCfg[k] = v;
    }
  }
  lines.push('');
  lines.push('--- CFG JSON ---');
  lines.push(JSON.stringify(_jsonCfg));
  lines.push('--- /CFG JSON ---');
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
let _activeTplIdx = -1; // индекс последнего загруженного/сохранённого шаблона
let _favNs = '';   // неймспейс избранных: 'BTC_1h', 'ETH_4h' и т.д. Пустая строка = без метки.
let resultCache = new Map();
let _t0 = 0;

// Очищает rob_* кэш из localStorage чтобы освободить место (используется в storeSave)
function _freeRobCache() {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('rob_'));
    keys.forEach(k => localStorage.removeItem(k));
    if (keys.length > 0) console.warn(`[_freeRobCache] удалено ${keys.length} записей rob-кэша`);
  } catch(_) {}
}

// --- Persistent storage helpers (window.storage API) ---
// Returns the storage key for the current project's favourites
function _favKey() {
  const id = typeof ProjectManager !== 'undefined' ? ProjectManager.getCurrentId() : null;
  return id ? 'use6_fav_' + id : 'use6_fav';
}

async function storeSave(key, data) {
  const _write = () => {
    if (window.storage) return window.storage.set(key, JSON.stringify(data));
    localStorage.setItem(key, JSON.stringify(data));
  };
  const _isQuota = e => e.name === 'QuotaExceededError' || (e.code && (e.code === 22 || e.code === 1014));
  try {
    await _write();
  } catch(e) {
    if (_isQuota(e)) {
      // Free rob cache + rob surrogate and retry
      try { _freeRobCache(); } catch(_) {}
      try {
        const keys = Object.keys(localStorage).filter(k => k.startsWith('robSurrogate_'));
        keys.forEach(k => localStorage.removeItem(k));
      } catch(_) {}
      try { await _write(); }
      catch(e2) { console.warn('[storeSave] quota exceeded after cleanup:', key, e2.message); }
    }
  }
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
  _idbInit(); // IndexedDB для задач/серий — запускаем async, не блокируем
  templates = (await storeLoad('use6_tpl')) || [];
  const defIdx = templates.findIndex(t => t.isDefault);
  if (defIdx >= 0) { applySettings(templates[defIdx].settings); _activeTplIdx = defIdx; }

  // Наборы фильтров: рендерим кнопки быстрого доступа и применяем дефолтный
  const filterTpls = (await storeLoad(_TBL_TPL_KEY)) || [];
  _renderQuickFilterBtns(filterTpls);
  const defFilterTpl = filterTpls.find(t => t.isDefault);
  if (defFilterTpl) _applyTableFilters(defFilterTpl.filters, false);
  renderTplList();
  _updateActiveTplBadge();
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
  ['full','prune','mc','tpe','bo','single'].forEach(x => { const el=document.getElementById('mode_'+x); if(el) el.classList.toggle('active', x===m); });
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
    // Вычисляем OOS для уже найденных результатов — иначе TV колонки показывают "—" при паузе
    if (typeof window._batchOOS === 'function') await window._batchOOS();
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
//
// ВАЖНО: onmessage — один слот. Если два корутина одновременно вызовут
// yieldToUI(), второй перезапишет первый callback → первый зависнет навсегда.
// Пример: rob-тест + _batchOOS таймер запускаются параллельно.
// Решение: очередь резолверов. Каждый postMessage обслуживает одного ожидающего.
const _yieldCh = new MessageChannel();
const _yieldQueue = [];
_yieldCh.port1.onmessage = () => { const cb = _yieldQueue.shift(); if (cb) cb(); };
function yieldToUI() {
  return new Promise(res => { _yieldQueue.push(res); _yieldCh.port2.postMessage(0); });
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

function _updateActiveTplBadge() {
  const el = document.getElementById('tpl-active-name');
  if (!el) return;
  const t = (_activeTplIdx >= 0 && _activeTplIdx < templates.length) ? templates[_activeTplIdx] : null;
  if (t) { el.textContent = t.name; el.style.display = 'inline'; }
  else    { el.textContent = ''; el.style.display = 'none'; }
}

function renderTplList() {
  const el = $('tpl-list-el');
  if (!templates.length) {
    el.innerHTML = '<div style="font-size:.68em;color:var(--text3);padding:8px">Нет сохранённых шаблонов</div>';
    return;
  }
  el.innerHTML = templates.map((t,i) => `
    <div class="tpl-item ${t.isDefault?'def':''} ${i===_activeTplIdx?'active-tpl':''}">
      <div style="flex:1;min-width:0">
        <div class="tpl-item-name">${t.isDefault?'⭐ ':''}${i===_activeTplIdx?'▶ ':''}${t.name}</div>
        <div class="tpl-item-date">${new Date(t.ts).toLocaleString('ru-RU')}</div>
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0">
        <div class="tpl-ibtn" onclick="loadTpl(${i})" title="Загрузить настройки">Загрузить</div>
        <div class="tpl-ibtn ok" onclick="overwriteTpl(${i})" title="Перезаписать текущими настройками">💾</div>
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
  applyMaxBars(); // синхронизируем DATA с c_maxbars из шаблона
}

function saveTpl() {
  const name = ($('tpl-name-inp').value.trim()) || ('Шаблон ' + new Date().toLocaleTimeString('ru-RU'));
  const isDef = $c('tpl-def-cb');
  const existIdx = templates.findIndex(t => t.name === name);
  if (existIdx >= 0) {
    // Перезаписываем существующий
    if (isDef) templates.forEach(t => t.isDefault=false);
    templates[existIdx].settings = gatherSettings();
    templates[existIdx].ts = Date.now();
    if (isDef) templates[existIdx].isDefault = true;
    _activeTplIdx = existIdx;
    showTplToast(`💾 Шаблон "${name}" перезаписан`);
  } else {
    // Новый шаблон
    if (isDef) templates.forEach(t => t.isDefault=false);
    templates.push({ name, settings: gatherSettings(), isDefault: isDef, ts: Date.now() });
    _activeTplIdx = templates.length - 1;
  }
  storeSave('use6_tpl', templates);
  renderTplList();
  _updateActiveTplBadge();
  $('tpl-name-inp').value = '';
}
function loadTpl(i) {
  applySettings(templates[i].settings);
  _activeTplIdx = i;
  _updateActiveTplBadge();
  closeTplModal();
}
function setDefaultTpl(i) {
  templates.forEach((t,j) => t.isDefault = j===i);
  storeSave('use6_tpl', templates);
  renderTplList();
}
function deleteTpl(i) {
  if (_activeTplIdx === i) { _activeTplIdx = -1; _updateActiveTplBadge(); }
  else if (_activeTplIdx > i) { _activeTplIdx--; }
  templates.splice(i,1);
  storeSave('use6_tpl', templates);
  renderTplList();
}
function overwriteTpl(i) {
  templates[i].settings = gatherSettings();
  templates[i].ts = Date.now();
  _activeTplIdx = i;
  storeSave('use6_tpl', templates);
  renderTplList();
  _updateActiveTplBadge();
  showTplToast(`💾 "${templates[i].name}" перезаписан`);
}
function quickSaveTpl() {
  if (_activeTplIdx < 0 || _activeTplIdx >= templates.length) return;
  overwriteTpl(_activeTplIdx);
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
// Возвращает уровень яркости звезды: 0=нет, 1=тусклая, 2=золотая, 3=яркая
function getFavLevel(name) {
  const f = favourites.find(f => f.name===name && (f.ns||'')===_favNs);
  return f ? (f.level || 1) : 0;
}
// HTML звёздочки с уровнем яркости (через data-level на родителе td)
function _favStarText(name) {
  return getFavLevel(name) > 0 ? '★' : '☆';
}
// Добавить/обновить уровень избранного: 0→startLevel→2→3→0 (цикл)
function toggleFav(idx, event, startLevel) {
  if (event) event.stopPropagation();
  const r = typeof idx === 'number' ? results[idx] : idx;
  if (!r) return;
  const fi = favourites.findIndex(f => f.name===r.name && (f.ns||'')===_favNs);
  if (fi >= 0) {
    const cur = favourites[fi].level || 1;
    if (cur >= 3) {
      favourites.splice(fi, 1); // убрать из избранного
    } else {
      favourites[fi].level = cur + 1; // повысить уровень
    }
  } else {
    favourites.push({ name:r.name, ns:_favNs, level: startLevel || 1, stats:{
      pnl:r.pnl, wr:r.wr, n:r.n, dd:r.dd, pdd:r.pdd,
      dwr:r.dwr||0, avg:r.avg||0, p1:r.p1||0, p2:r.p2||0, c1:r.c1||0, c2:r.c2||0,
      nL:r.nL||0, pL:r.pL||0, wrL:r.wrL, nS:r.nS||0, pS:r.pS||0, wrS:r.wrS, dwrLS:r.dwrLS,
      sig:r.sig, gt:r.gt, cvr:r.cvr, upi:r.upi,
      sortino:r.sortino, kRatio:r.kRatio, sqn:r.sqn,
      omega:r.omega, pain:r.pain, burke:r.burke, serenity:r.serenity, ir:r.ir,
      cpcvScore:r.cpcvScore,
      eq:r.eq,
      robScore:r.robScore, robMax:r.robMax, robDetails:r.robDetails
    }, cfg:r.cfg, ts:Date.now() });
  }
  storeSave(_favKey(), favourites);
  renderFavBar();
  _refreshFavStars();
}
// Добавить в избранное из OOS таблицы (уровень 2 — проверено на новых данных)
function toggleOOSFav(idx, event) {
  if (event) event.stopPropagation();
  const r = _oosTableResults[idx];
  if (!r) return;
  toggleFav(r, event, 2); // startLevel=2: из OOS = проверено на новых данных
}

// Обновляет только звёздочки в текущей таблице без сброса фильтров
function _refreshFavStars() {
  // Основная таблица результатов
  document.querySelectorAll('#tb tr[data-i]').forEach(tr => {
    const r = _visibleResults[+tr.dataset.i];
    if (!r) return;
    const starEl = tr.querySelector('[data-fav]');
    if (!starEl) return;
    const lvl = getFavLevel(r.name);
    starEl.textContent = lvl > 0 ? '★' : '☆';
    starEl.dataset.level = lvl;
  });
  // OOS таблица
  document.querySelectorAll('#oos-tb tr[data-i]').forEach(tr => {
    const r = _oosTableResults[+tr.dataset.i];
    if (!r) return;
    const starEl = tr.querySelector('[data-fav]');
    if (!starEl) return;
    const lvl = getFavLevel(r.name);
    starEl.textContent = lvl > 0 ? '★' : '☆';
    starEl.dataset.level = lvl;
    tr.classList.toggle('fav-row', lvl > 0);
  });
  if (_tableMode === 'fav') applyFilters(true);
}
function renderFavBar() { /* панель убрана — избранные доступны в таблице (вкладка Избранные) */ }
function toggleFavBody() {}
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
  // ── РЕЖИМ 0: JSON блок (buildCopyText формат с CFG JSON) ────────────────
  // Если текст содержит --- CFG JSON --- блок — используем точное восстановление
  const _jsonBlockMatch = text.match(/---\s*CFG JSON\s*---\s*\n([\s\S]*?)\n---\s*\/CFG JSON\s*---/);
  if (_jsonBlockMatch) {
    try {
      const j = JSON.parse(_jsonBlockMatch[1]);
      const ch = [];
      const _s = (id, value, type, label) => ch.push({id, value, type, label});
      // 1. Все поля из CFG_HTML_MAP
      for (const [field, {id, type}] of Object.entries(CFG_HTML_MAP)) {
        if (j[field] !== undefined) {
          _s(id, type === 'val' ? String(j[field]) : j[field], type, `${field}=${j[field]}`);
        }
      }
      // 2. SL пара (slPair)
      const slPair = j.slPair || {};
      const slA = slPair.a, slP = slPair.p;
      const hasSlAtr = !!(slA && slA.type === 'atr');
      const hasSlPct = !!(slA && slA.type === 'pct') || !!(slP && slP.type === 'pct');
      _s('s_atr', hasSlAtr, 'chk', 'SL ATR: ' + (hasSlAtr ? 'ВКЛ' : 'ВЫКЛ'));
      if (hasSlAtr) _s('s_atrv', String(slA.m), 'val', `SL ATR=${slA.m}`);
      _s('s_pct', hasSlPct, 'chk', 'SL %: ' + (hasSlPct ? 'ВКЛ' : 'ВЫКЛ'));
      const _slPctSrc = (slA && slA.type === 'pct') ? slA : slP;
      if (hasSlPct && _slPctSrc) _s('s_pctv', String(_slPctSrc.m), 'val', `SL %=${_slPctSrc.m}`);
      if (j.slLogic) ch.push({id:'_slLogic', value:j.slLogic, type:'logic', label:`SL логика=${j.slLogic}`});
      // 3. TP пара (tpPair)
      const tpPair = j.tpPair || {};
      const tpA = tpPair.a, tpB = tpPair.b;
      const hasTpRR  = !!(tpA && tpA.type === 'rr')  || !!(tpB && tpB.type === 'rr');
      const hasTpAtr = !!(tpA && tpA.type === 'atr') || !!(tpB && tpB.type === 'atr');
      const hasTpPct = !!(tpA && tpA.type === 'pct') || !!(tpB && tpB.type === 'pct');
      _s('t_rr',  hasTpRR,  'chk', 'TP RR: '  + (hasTpRR  ? 'ВКЛ' : 'ВЫКЛ'));
      _s('t_atr', hasTpAtr, 'chk', 'TP ATR: ' + (hasTpAtr ? 'ВКЛ' : 'ВЫКЛ'));
      _s('t_pct', hasTpPct, 'chk', 'TP %: '   + (hasTpPct ? 'ВКЛ' : 'ВЫКЛ'));
      const _rrSrc  = (tpA && tpA.type==='rr')  ? tpA : tpB;
      const _atrSrc = (tpA && tpA.type==='atr') ? tpA : tpB;
      const _pctSrc = (tpA && tpA.type==='pct') ? tpA : tpB;
      if (hasTpRR  && _rrSrc)  _s('t_rrv',  String(_rrSrc.m),  'val', `TP RR=${_rrSrc.m}`);
      if (hasTpAtr && _atrSrc) _s('t_atrv', String(_atrSrc.m), 'val', `TP ATR=${_atrSrc.m}`);
      if (hasTpPct && _pctSrc) _s('t_pctv', String(_pctSrc.m), 'val', `TP %=${_pctSrc.m}`);
      if (j.tpLogic) ch.push({id:'_tpLogic', value:j.tpLogic, type:'logic', label:`TP логика=${j.tpLogic}`});
      // 4. xmode кнопки (revMode, revAct, revSrc, timeMode, clxMode)
      if (j.revMode)  ch.push({id:'_xm_rev',     value:j.revMode,  type:'xmode', xmodeType:'rev',    label:`revMode=${j.revMode}`});
      if (j.revAct)   ch.push({id:'_xm_revact',  value:j.revAct,   type:'xmode', xmodeType:'revact', label:`revAct=${j.revAct}`});
      if (j.revSrc)   ch.push({id:'_xm_revsrc',  value:j.revSrc,   type:'xmode', xmodeType:'revsrc', label:`revSrc=${j.revSrc}`});
      if (j.timeMode) ch.push({id:'_xm_time',    value:j.timeMode, type:'xmode', xmodeType:'time',   label:`timeMode=${j.timeMode}`});
      if (j.clxMode)  ch.push({id:'_xm_clx',     value:j.clxMode,  type:'xmode', xmodeType:'clx',    label:`clxMode=${j.clxMode}`});
      // 5. Комиссия (baseComm = per-leg, не умножаем)
      const _comm = j.baseComm !== undefined ? j.baseComm : j.commission;
      if (_comm !== undefined) _s('c_comm', String(_comm), 'val', `Комиссия=${_comm}`);
      if (j.spreadVal !== undefined) _s('c_spread', String(j.spreadVal), 'val', `Спред=${j.spreadVal}`);
      if (ch.length) return ch;
    } catch(e) { /* fall through to legacy parsing */ }
  }

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
      if (isOn) {
        const ml=parseStruct.match(/pvl=(\d+)/), mr=parseStruct.match(/pvr=(\d+)/);
        if(ml) set('f_strpvl', ml[1], 'val', `Struct pvl=${ml[1]}`);
        if(mr) set('f_strpvr', mr[1], 'val', `Struct pvr=${mr[1]}`);
        const mOld=parseStruct.match(/lookback=(\d+)/); if(mOld) set('f_strl', mOld[1], 'val', `Struct lookback=${mOld[1]}`);
      }
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
    if (c.type === 'xmode') {
      // Кнопки режима (revMode, revAct, revSrc, timeMode, clxMode)
      if (typeof setXMode === 'function') { setXMode(c.xmodeType, c.value); changed_ids.add(c.xmodeType); }
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

function showBestStats() { /* removed */ }

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
  // Полное название с ★ если избранное, перенос по словам
  const _favPrefix = (typeof isFav === 'function' && isFav(label)) ? '★ ' : '';
  const _fullLabel = _favPrefix + (label||'');
  const _maxLabelW = W - pad - 4;
  const _labelWords = _fullLabel.split(' ');
  const _labelLines = [];
  let _curLine = '';
  for (const _w of _labelWords) {
    const _test = _curLine ? _curLine + ' ' + _w : _w;
    if (ctx.measureText(_test).width > _maxLabelW && _curLine) {
      _labelLines.push(_curLine); _curLine = _w;
    } else { _curLine = _test; }
  }
  if (_curLine) _labelLines.push(_curLine);
  _labelLines.slice(0, 3).forEach((_line, _li) => ctx.fillText(_line, pad, 9 + _li * 9));
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


// ── TV COMPARE ────────────────────────────────────────────────

let _tvCmpCurrentResult = null;
let _tvCmpDiag = null; // хранит данные для copyTVdiag()

function _normTime(t) {
  if (!t && t !== 0) return '';
  const s = String(t).trim();
  // Unix timestamp в секундах (9-10 цифр) или миллисекундах (13 цифр)
  if (/^\d{9,10}$/.test(s)) return new Date(parseInt(s) * 1000).toISOString().substring(0, 16).replace('T', ' ');
  if (/^\d{13}$/.test(s))   return new Date(parseInt(s)).toISOString().substring(0, 16).replace('T', ' ');
  // ISO/date string: убираем зону, T→пробел, секунды+мс, берём 16 символов
  return s
    .replace(/ UTC$/i, '').replace(/ GMT$/i, '').replace(/Z$/, '')
    .replace('T', ' ')
    .replace(/(\d{2}:\d{2}):\d{2}(\.\d+)?$/, '$1')  // только секунды, не минуты
    .substring(0, 16);
}

function _parseTVcsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return null;
  const sep = lines[0].includes('\t') ? '\t' : ',';
  const hdrs = lines[0].split(sep).map(h => h.trim().replace(/"/g, '').toLowerCase());

  const tIdx  = hdrs.findIndex(h => h.includes('time') || h.includes('date')) >= 0
                ? hdrs.findIndex(h => h.includes('time') || h.includes('date')) : 0;
  const eqIdx = hdrs.findIndex(h => h.includes('equity'));
  const elIdx = hdrs.indexOf('el');
  const esIdx = hdrs.indexOf('es');
  const xlIdx = hdrs.indexOf('xl');
  const xsIdx = hdrs.indexOf('xs');
  const maIdx = hdrs.indexOf('ma'); // exact match, не попадает в 'confirm ma'
  const confIdx = hdrs.findIndex(h => h.includes('confirm'));

  if (eqIdx < 0) return null;

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map(c => c.trim().replace(/"/g, ''));
    if (cols.length <= eqIdx) continue;
    const t  = _normTime(cols[tIdx]);
    const eq = parseFloat(cols[eqIdx]);
    if (!t || isNaN(eq)) continue;
    rows.push({
      t, eq,
      el: elIdx >= 0 ? (parseFloat(cols[elIdx]) || 0) : null,
      es: esIdx >= 0 ? (parseFloat(cols[esIdx]) || 0) : null,
      xl: xlIdx >= 0 ? (parseFloat(cols[xlIdx]) || 0) : null,
      xs: xsIdx >= 0 ? (parseFloat(cols[xsIdx]) || 0) : null,
      ma: maIdx >= 0 ? parseFloat(cols[maIdx]) : NaN,
      confMa: confIdx >= 0 ? parseFloat(cols[confIdx]) : NaN,
    });
  }
  return rows.length >= 2 ? rows : null;
}

function loadTVcsv(event) {
  const file = event.target.files[0];
  if (!file) return;
  const statusEl = document.getElementById('tv-cmp-status');
  const resultsEl = document.getElementById('tv-cmp-results');
  if (statusEl) statusEl.textContent = '⏳ Читаю файл...';
  const reader = new FileReader();
  reader.onload = function(e) {
    const tvRows = _parseTVcsv(e.target.result);
    if (!tvRows) {
      if (statusEl) statusEl.textContent = '❌ Не удалось прочитать. Нужна колонка «Equity %» из TV Table Mode';
      return;
    }
    if (statusEl) statusEl.textContent = `✅ ${file.name} · ${tvRows.length} строк`;
    _runTVcompare(tvRows, resultsEl);
  };
  reader.readAsText(file);
}

function _runTVcompare(tvRows, resultsEl) {
  const r = _tvCmpCurrentResult;
  if (!r || !r.cfg) {
    resultsEl.innerHTML = '<span style="color:var(--neg);font-size:.8em">❌ Нет текущего результата.</span>';
    return;
  }

  // Use equities[r.name] as primary source (same as showDetail equity chart = full IS+OOS run)
  // Fall back to fresh backtest if equities map is unavailable, then to r.eq
  let fullEq = r.eq; // fallback
  let isFullRun = false;
  let fullRunErr = '';
  if (typeof equities !== 'undefined' && equities[r.name] && equities[r.name].length > 0) {
    fullEq = equities[r.name];
    isFullRun = true;
  } else {
    try {
      const _ind   = typeof _calcIndicators === 'function' ? _calcIndicators(r.cfg) : null;
      const _btCfg = (_ind && typeof buildBtCfg === 'function') ? buildBtCfg(r.cfg, _ind) : null;
      if (_btCfg && typeof backtest === 'function') {
        const rFull = backtest(_ind.pvLo, _ind.pvHi, _ind.atrArr, _btCfg);
        if (rFull && rFull.eq && rFull.eq.length > 0) {
          fullEq = rFull.eq;
          isFullRun = true;
        } else { fullRunErr = 'backtest вернул пустой eq'; }
      } else { fullRunErr = '_calcIndicators/buildBtCfg/backtest не найдены'; }
    } catch(e) { fullRunErr = e.message; }
  }

  if (!fullEq || !fullEq.length) {
    resultsEl.innerHTML = '<span style="color:var(--neg);font-size:.8em">❌ Нет equity для текущего результата.</span>';
    return;
  }

  // Build time→row map
  const tvMap = Object.create(null);
  for (const row of tvRows) tvMap[row.t] = row;

  // Align with DATA[]
  const pairs = [];
  for (let i = 0; i < DATA.length; i++) {
    const nt = _normTime(DATA[i]?.t || '');
    const tv = tvMap[nt];
    if (tv && fullEq[i] !== undefined) pairs.push({ i, jsEq: fullEq[i], tvEq: tv.eq, tvRow: tv });
  }

  if (pairs.length < 5) {
    const tvFirst = tvRows[0]?.t || '?';
    const tvLast  = tvRows[tvRows.length - 1]?.t || '?';
    const jsFirst = _normTime(DATA[0]?.t || '');
    const jsLast  = _normTime(DATA[DATA.length - 1]?.t || '');
    const overlap = tvFirst <= jsLast && tvLast >= jsFirst;
    resultsEl.innerHTML = `<span style="color:var(--neg);font-size:.8em">❌ Совпало ${pairs.length} баров.`
      + `<br>TV диапазон: ${tvFirst} … ${tvLast}`
      + `<br>JS диапазон: ${jsFirst} … ${jsLast}`
      + (overlap ? '<br>⚠️ Диапазоны перекрываются — возможно несовпадение тикера или ТФ.'
                 : '<br>⛔ Диапазоны НЕ пересекаются — загрузи CSV за тот же период что и JS данные.')
      + `</span>`;
    return;
  }

  const c = r.cfg || {};

  // Warmup: skip first N bars where indicators aren't settled (MA, pivots)
  const _maTypeW = c.useMA ? (c.maType || 'EMA') : '';
  const _temaMult = (_maTypeW === 'TEMA' || _maTypeW === 'DEMA' || _maTypeW === 'EMA') ? 3 : 1;
  const _confTypeW = c.useConfirm ? (c.confMatType || 'EMA') : '';
  const _confMult = (_confTypeW === 'TEMA' || _confTypeW === 'DEMA' || _confTypeW === 'EMA') ? 3 : 1;
  const warmupN = Math.max(
    (c.pvL || 5) + (c.pvR || 2) + 5,
    c.useMA ? (c.maP || 0) * (c.htfRatio || 1) * _temaMult : 0,
    c.useConfirm ? (c.confN || 0) * (c.confHtfRatio || 1) * _confMult : 0,
    (c.atrPeriod || 14) * 3,
    50
  );
  const pairsPost = pairs.filter(p => p.i >= warmupN);

  const jsArr = pairs.map(p => p.jsEq);
  const tvArr = pairs.map(p => p.tvEq);

  // Correlation
  const jsMean = jsArr.reduce((s, v) => s + v, 0) / jsArr.length;
  const tvMean = tvArr.reduce((s, v) => s + v, 0) / tvArr.length;
  let num = 0, denJ = 0, denT = 0;
  for (let k = 0; k < jsArr.length; k++) {
    const dj = jsArr[k] - jsMean, dt = tvArr[k] - tvMean;
    num += dj * dt; denJ += dj * dj; denT += dt * dt;
  }
  const corr = (denJ > 0 && denT > 0) ? num / Math.sqrt(denJ * denT) : 0;

  // RMSE
  const rmse = Math.sqrt(pairs.reduce((s, p) => s + Math.pow(p.jsEq - p.tvEq, 2), 0) / pairs.length);

  // Max divergence
  let maxDiff = 0, maxDiffBar = 0, maxDiffTime = '';
  for (const p of pairs) {
    const d = Math.abs(p.jsEq - p.tvEq);
    if (d > maxDiff) { maxDiff = d; maxDiffBar = p.i; maxDiffTime = DATA[p.i]?.t || ''; }
  }

  // First divergence > 0.5%
  let firstDivBar = -1, firstDivTime = '';
  for (const p of pairs) {
    if (Math.abs(p.jsEq - p.tvEq) > 0.5) { firstDivBar = p.i; firstDivTime = DATA[p.i]?.t || ''; break; }
  }

  const jsLast = jsArr[jsArr.length - 1];
  const tvLast = tvArr[tvArr.length - 1];
  const finalDiff = jsLast - tvLast;

  // Post-warmup stats (skip first warmupN bars — MA/pivot not settled yet)
  let statsPost = null;
  if (pairsPost.length >= 5) {
    const jsAP = pairsPost.map(p => p.jsEq), tvAP = pairsPost.map(p => p.tvEq);
    const jsMeanP = jsAP.reduce((s,v)=>s+v,0)/jsAP.length, tvMeanP = tvAP.reduce((s,v)=>s+v,0)/tvAP.length;
    let nP=0, djP=0, dtP=0;
    for (let k=0; k<jsAP.length; k++) { const a=jsAP[k]-jsMeanP, b=tvAP[k]-tvMeanP; nP+=a*b; djP+=a*a; dtP+=b*b; }
    const corrP = (djP>0&&dtP>0) ? nP/Math.sqrt(djP*dtP) : 0;
    const rmseP = Math.sqrt(pairsPost.reduce((s,p)=>s+Math.pow(p.jsEq-p.tvEq,2),0)/pairsPost.length);
    let fdP=-1, ftP='', mdP=0, mbP=0, mtP='';
    for (const p of pairsPost) {
      const d = Math.abs(p.jsEq-p.tvEq);
      if (fdP<0 && d>0.5) { fdP=p.i; ftP=DATA[p.i]?.t||''; }
      if (d>mdP) { mdP=d; mbP=p.i; mtP=DATA[p.i]?.t||''; }
    }
    const jLP=jsAP[jsAP.length-1], tLP=tvAP[tvAP.length-1];
    statsPost = { corr:corrP, rmse:rmseP, firstDiv:fdP, firstTime:ftP, maxDiff:mdP, maxBar:mbP, maxTime:mtP, jsLast:jLP, tvLast:tLP, finalDiff:jLP-tLP, n:pairsPost.length };
  }

  // Signal stats
  const hasSigs = pairs[0]?.tvRow.el !== null;
  let tvSigCount = 0;
  if (hasSigs) for (const p of pairs) {
    if (p.tvRow.el === 1 || p.tvRow.es === 1 || p.tvRow.xl === 1 || p.tvRow.xs === 1) tvSigCount++;
  }

  // Coverage: detect if TV CSV ends before DATA ends
  const lastPairBar = pairs.length > 0 ? pairs[pairs.length - 1].i : -1;
  const missingEnd  = DATA.length - 1 - lastPairBar;   // bars at end not covered by TV
  const jsFullFinal = fullEq[DATA.length - 1] ?? NaN;  // equity at very last DATA bar

  const corrC = corr >= 0.99 ? 'pos' : corr >= 0.95 ? 'warn' : 'neg';
  const rmseC = rmse < 1 ? 'pos' : rmse < 5 ? 'warn' : 'neg';
  const fdC   = Math.abs(finalDiff) < 1 ? 'pos' : Math.abs(finalDiff) < 5 ? 'warn' : 'neg';

  // Compute JS tradeLog for diagnostic (separate lightweight run with collectTrades=true)
  let jsTradeLog = [];
  try {
    const _tli = typeof _calcIndicators === 'function' ? _calcIndicators(r.cfg) : null;
    const _tlC = (_tli && typeof buildBtCfg === 'function') ? buildBtCfg(r.cfg, _tli) : null;
    if (_tlC && typeof backtest === 'function') {
      _tlC.collectTrades = true; _tlC.tradeLog = [];
      backtest(_tli.pvLo, _tli.pvHi, _tli.atrArr, _tlC);
      jsTradeLog = _tlC.tradeLog || [];
    }
  } catch(e) {}

  // Сохраняем диагностику для copyTVdiag()
  _tvCmpDiag = { r, pairs, corr, rmse, finalDiff, jsLast, tvLast, firstDivBar, firstDivTime, maxDiff, maxDiffBar, maxDiffTime, hasSigs, tvSigCount, fullEq, isFullRun, missingEnd, jsFullFinal, fullRunErr, warmupN, statsPost, jsTradeLog };

  let html = '';
  html += row('Режим сравнения', isFullRun
    ? `<span class="pos">IS+OOS (полный прогон)</span>`
    : `<span class="warn">fallback (r.eq)</span>${fullRunErr ? ` · ${fullRunErr}` : ''}`, '');
  html += row('Совпало баров', `${pairs.length} / ${tvRows.length} TV · ${DATA.length} JS`, 'muted');
  if (missingEnd > 0) {
    const missedPnl = !isNaN(jsFullFinal) ? (jsFullFinal - jsLast).toFixed(1) : '?';
    html += row('⚠️ TV CSV не покрывает конец', `<span class="warn">последние ${missingEnd} баров DATA без TV данных · пропущено JS PnL ≈ ${missedPnl}%</span>`, '');
  }
  html += row('JS полный итог', `<span class="${isNaN(jsFullFinal) ? 'muted' : 'pos'}">${isNaN(jsFullFinal) ? '—' : jsFullFinal.toFixed(1) + '%'}</span> (бар ${DATA.length-1})`, 'muted');
  html += row('Корреляция equity', `<span class="${corrC}">${(corr * 100).toFixed(2)}%</span>${corr >= 0.99 ? ' ✅' : corr < 0.95 ? ' ⚠️' : ''}`, '');
  html += row('RMSE equity', `<span class="${rmseC}">${rmse.toFixed(2)}%</span>`, '');
  html += row('JS итог / TV итог', `<span class="${fdC}">JS ${jsLast.toFixed(1)}% · TV ${tvLast.toFixed(1)}% · Δ${finalDiff >= 0 ? '+' : ''}${finalDiff.toFixed(1)}%</span> (бар ${lastPairBar})`, '');
  if (firstDivBar >= 0) {
    html += row('Первое расхождение >0.5%', `<span class="warn">бар #${firstDivBar} · ${firstDivTime}</span>`, '');
    html += `<button class="tpl-btn2" style="margin-top:6px;padding:4px 12px;font-size:.82em;border-color:#c792ea;color:#c792ea;width:100%" onclick="copyTVdiag()">📋 Скопировать диагностику для Claude</button>`;
  } else {
    html += row('Расхождение >0.5%', '<span class="pos">не обнаружено ✅</span>', '');
  }
  html += row('Макс. расхождение', `${maxDiff.toFixed(2)}% · бар #${maxDiffBar} · ${maxDiffTime}`, 'muted');
  if (hasSigs) html += row('TV сигналов (EL/ES/XL/XS)', `${tvSigCount} из ${pairs.length} совпавших баров`, 'muted');
  if (statsPost) {
    const spC = statsPost.corr >= 0.99 ? 'pos' : statsPost.corr >= 0.95 ? 'warn' : 'neg';
    const srC = statsPost.rmse < 1 ? 'pos' : statsPost.rmse < 5 ? 'warn' : 'neg';
    const sfC = Math.abs(statsPost.finalDiff) < 1 ? 'pos' : Math.abs(statsPost.finalDiff) < 5 ? 'warn' : 'neg';
    html += row(`После прогрева (бар ${warmupN}+, ${statsPost.n} баров)`,
      `Корр: <span class="${spC}">${(statsPost.corr*100).toFixed(1)}%</span>${statsPost.corr>=0.99?' ✅':statsPost.corr<0.95?' ⚠️':''} · RMSE: <span class="${srC}">${statsPost.rmse.toFixed(2)}%</span> · Δ итог: <span class="${sfC}">${statsPost.finalDiff>=0?'+':''}${statsPost.finalDiff.toFixed(1)}%</span>`, 'muted');
  }

  resultsEl.innerHTML = html;

  // Draw TV equity overlay on existing canvas
  _tvDrawOverlay(pairs, fullEq);
}

function _tvDrawOverlay(pairs, jsEq) {
  const canvas = document.getElementById('eqc');
  if (!canvas || !_eqChartParams) return;
  const ctx = canvas.getContext('2d');
  const { mn, range, pad, W, H } = _eqChartParams;
  if (!range) return;

  // Build dense array: tvAtBar[jsBarIndex] = tvEquity (NaN where no match)
  const tvAtBar = new Float64Array(jsEq.length).fill(NaN);
  for (const p of pairs) { if (p.i < tvAtBar.length) tvAtBar[p.i] = p.tvEq; }

  const nPx  = W - 2 * pad;
  const nLast = Math.max(jsEq.length - 1, 1);

  ctx.save();
  ctx.strokeStyle = 'rgba(255,200,60,0.9)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 2]);
  ctx.beginPath();
  let started = false;
  for (let px = 0; px < nPx; px++) {
    const i = Math.round(px * nLast / (nPx - 1));
    const v = tvAtBar[i];
    if (isNaN(v)) { started = false; continue; }
    const x = pad + px;
    const y = H - pad - ((v - mn) / range * (H - 2 * pad));
    if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Legend label
  ctx.fillStyle = 'rgba(255,200,60,0.85)';
  ctx.font = '8px JetBrains Mono,monospace';
  ctx.fillText('TV', W - 24, 9);
  ctx.restore();
}

function copyTVdiag() {
  const d = _tvCmpDiag;
  if (!d) { alert('Нет данных диагностики — сначала загрузи TV CSV'); return; }
  const { r, pairs, corr, rmse, finalDiff, jsLast, tvLast,
          firstDivBar, firstDivTime, maxDiff, maxDiffBar, maxDiffTime, hasSigs, isFullRun,
          missingEnd, jsFullFinal, fullRunErr, warmupN, statsPost, jsTradeLog, fullEq } = d;
  const c = r.cfg;
  const lastPairBar2 = pairs.length > 0 ? pairs[pairs.length - 1].i : -1;

  const lines = [];
  lines.push('=== TV vs JS ДИАГНОСТИКА РАСХОЖДЕНИЯ ===');
  lines.push(`Результат: ${r.name}`);
  lines.push(`Режим: ${isFullRun ? 'IS+OOS (полный прогон)' : `fallback (r.eq)${fullRunErr ? ' — ' + fullRunErr : ''}`} | Данные: ${pairs.length}/${DATA.length} баров`);
  if (missingEnd > 0) {
    const missedPnl = !isNaN(jsFullFinal) ? (jsFullFinal - jsLast).toFixed(1) : '?';
    lines.push(`⚠️ TV CSV НЕ ПОКРЫВАЕТ последние ${missingEnd} баров DATA (пропущено JS PnL ≈ ${missedPnl}%)`);
    lines.push(`   JS полный итог (бар ${DATA.length-1}): ${isNaN(jsFullFinal) ? '—' : jsFullFinal.toFixed(2) + '%'}`);
    lines.push(`   JS @ последний TV бар (#${lastPairBar2}): ${jsLast.toFixed(2)}%`);
    lines.push(`   → Загрузи TV CSV за весь период оптимизатора чтобы покрыть все ${DATA.length} баров`);
  }
  lines.push(`Совпало баров: ${pairs.length} | Корреляция: ${(corr*100).toFixed(2)}% | RMSE: ${rmse.toFixed(2)}%`);
  lines.push(`JS итог (@ посл. TV бар): ${jsLast.toFixed(2)}%  TV итог: ${tvLast.toFixed(2)}%  Δ: ${finalDiff>=0?'+':''}${finalDiff.toFixed(2)}%`);
  lines.push(`Первое расхождение >0.5%: бар #${firstDivBar} (${firstDivTime})`);
  lines.push(`Макс. расхождение: ${maxDiff.toFixed(2)}% на баре #${maxDiffBar} (${maxDiffTime})`);
  lines.push('');

  // Config summary
  lines.push('=== КОНФИГ СТРАТЕГИИ ===');
  const slName = c.slPair ? JSON.stringify(c.slPair) : '—';
  const tpName = c.tpPair ? JSON.stringify(c.tpPair) : '—';
  lines.push(`SL: ${slName}`);
  lines.push(`TP: ${tpName}`);
  lines.push(`ATR период: ${c.atrPeriod||14}`);
  lines.push(`Комиссия: ${c.baseComm??c.commission??0.08}%  Спред: ${c.spreadVal||0}%`);
  lines.push(`useMA: ${!!c.useMA}  maType: ${c.maType||'EMA'}  maP: ${c.maP||200}`);
  lines.push(`useConfirm: ${!!c.useConfirm}  confN: ${c.confN||100}`);
  lines.push(`useSTrend: ${!!c.useSTrend}  sTrendWin: ${c.sTrendWin||10}`);
  lines.push(`useBE: ${!!c.useBE}  beTrig: ${c.beTrig||0}  beOff: ${c.beOff||0}`);
  lines.push(`useTrail: ${!!c.useTrail}  trTrig: ${c.trTrig||0}  trDist: ${c.trDist||0}`);
  lines.push(`useWickTrail: ${!!c.useWickTrail}  wickMult: ${c.wickMult||0}  wickOffType: ${c.wickOffType||'ATR'}`);
  lines.push(`usePartial: ${!!c.usePartial}  partRR: ${c.partRR||0}  partPct: ${c.partPct||0}`);
  lines.push(`useTime: ${!!c.useTime}  timeBars: ${c.timeBars||0}`);
  lines.push(`waitBars: ${c.waitBars||0}  waitRetrace: ${!!c.waitRetrace}  waitMaxBars: ${c.waitMaxBars||0}  waitCancelAtr: ${c.waitCancelAtr||0}`);
  lines.push(`usePivot: ${!!c.usePivot}  pvL: ${c.pvL||5}  pvR: ${c.pvR||2}`);
  lines.push(`useEngulf: ${!!c.useEngulf}  usePinBar: ${!!c.usePinBar}  useBoll: ${!!c.useBoll}`);
  lines.push(`useDonch: ${!!c.useDonch}  useAtrBo: ${!!c.useAtrBo}  useSqueeze: ${!!c.useSqueeze}`);
  lines.push(`useMaTouch: ${!!c.useMaTouch}  useRev: ${!!c.useRev}  useClimax: ${!!c.useClimax}`);
  lines.push(`longOnly: ${!!c.longOnly}  shortOnly: ${!!c.shortOnly}`);
  lines.push(`entry_price_mode: ${c.entryMode||'close'}  confirmed: ${c.confirmed!==false}`);
  lines.push('');

  // Bars around first divergence: -15 to +5
  const fromBar = Math.max(0, firstDivBar - 15);
  const toBar   = Math.min(DATA.length - 1, firstDivBar + 5);
  const pairMap = Object.create(null);
  for (const p of pairs) pairMap[p.i] = p;

  lines.push(`=== БАРЫ ВОКРУГ ПЕРВОГО РАСХОЖДЕНИЯ (бар #${firstDivBar}) ===`);
  // Пересчитываем btCfg — r.cfg хранит только скаляры, массивы не сохраняются в результат
  let pvLo = null, pvHi_ = null, maArr = null, confArr = null, atrArr = null, _btCfgRef = null;
  try {
    const _ind   = typeof _calcIndicators === 'function' ? _calcIndicators(c) : null;
    const _btCfg = (_ind && typeof buildBtCfg === 'function') ? buildBtCfg(c, _ind) : null;
    _btCfgRef = _btCfg;
    if (_btCfg) {
      pvLo    = _btCfg.pvLo          || null;
      pvHi_   = _btCfg.pvHi_         || null;
      maArr   = _btCfg.maArr         || null;
      confArr = _btCfg.maArrConfirm  || null;
      atrArr  = _ind.atrArr          || null;
    }
    lines.push(`btCfg пересчитан: pvLo=${pvLo?'✅':'❌'} maArr=${maArr?'✅':'❌'} confArr=${confArr?'✅':'—'}`);
  } catch(e) { lines.push(`⚠️ Не удалось пересчитать btCfg: ${e.message}`); }
  const confLabel = c.useConfirm ? `Conf(i-1)` : null;
  lines.push('Бар# | Дата              | Open     | High     | Low      | Close    | JS_eq%   | TV_eq%   | Δeq%  | TV:EL ES XL XS | pvLo pvHi | JS_MA(i-1) | TV_MA(i-1) | MA_Δ%    | MA_blk   | ATR(i)   ' + (confLabel ? `| ${confLabel.padEnd(10)} | Cf_blk` : ''));
  lines.push('-'.repeat(confLabel ? 175 : 150));
  for (let i = fromBar; i <= toBar; i++) {
    const bar  = DATA[i] || {};
    const p    = pairMap[i];
    const jsEq = p ? p.jsEq.toFixed(3) : '—      ';
    const tvEq = p ? p.tvEq.toFixed(3) : '—      ';
    const diff = p ? (p.jsEq - p.tvEq).toFixed(3) : '—    ';
    const sigs = p && hasSigs
      ? `${p.tvRow.el||0} ${p.tvRow.es||0} ${p.tvRow.xl||0} ${p.tvRow.xs||0}`
      : '— — — —';
    const pvLoVal = pvLo ? pvLo[i] : '?';
    const pvHiVal = pvHi_ ? pvHi_[i] : '?';
    const maVal   = (maArr && i > 0) ? maArr[i-1] : null;
    const maStr   = maVal != null ? maVal.toFixed(6) : '—';
    let maBlock = c.useMA ? '—' : 'off';
    if (c.useMA && maArr && i > 0) {
      const prevC = DATA[i-1]?.c || 0;
      const ma = maArr[i-1];
      maBlock = (ma <= 0) ? 'WARMUP' : (prevC <= ma ? 'BLK_L' : 'ok');
    }
    let confPart = '';
    if (confLabel) {
      const cma = (confArr && i > 0) ? confArr[i-1] : null;
      const cmaStr = cma != null ? cma.toFixed(6) : '—';
      let cfBlock = '—';
      if (confArr && i > 0) {
        const prevC = DATA[i-1]?.c || 0;
        const cmaV = confArr[i-1];
        cfBlock = (cmaV <= 0) ? 'WARMUP' : (prevC <= cmaV ? 'BLK_L' : 'ok');
      }
      confPart = ` | ${cmaStr.padStart(10)} | ${cfBlock}`;
    }
    // TV MA from CSV (p.tvRow.ma is the MA value exported by the TV indicator)
    const tvMaRaw = (p && !isNaN(p.tvRow?.ma) && p.tvRow.ma > 0) ? p.tvRow.ma : null;
    const tvMaStr = tvMaRaw != null ? tvMaRaw.toFixed(6) : (p ? 'empty' : 'NO_TV');
    // Difference JS_MA vs TV_MA in percent
    const maDiffPct = (maVal != null && tvMaRaw != null && maVal > 0)
      ? ((maVal - tvMaRaw) / tvMaRaw * 100).toFixed(3) : '—';
    const atrVal = (atrArr && atrArr[i] > 0) ? atrArr[i].toFixed(5) : '—';
    const marker = i === firstDivBar ? ' ◄ ПЕРВОЕ' : i === maxDiffBar ? ' ◄ МАКС' : '';
    // Show actual JS equity for bars without TV data (where p is null)
    const jsEqActual = (!p && fullEq && fullEq[i] !== undefined) ? fullEq[i].toFixed(3) : jsEq;
    const tvEqStr = !p ? 'NO_TV  ' : String(tvEq).padStart(8);
    const t = String(bar.t || '—').padEnd(18);
    lines.push(
      `${String(i).padStart(5)} | ${t} | ${(bar.o||0).toFixed(4).padStart(8)} | ${(bar.h||0).toFixed(4).padStart(8)} | ` +
      `${(bar.l||0).toFixed(6).padStart(10)} | ${(bar.c||0).toFixed(6).padStart(10)} | ` +
      `${String(jsEqActual).padStart(8)} | ${tvEqStr} | ${String(diff).padStart(6)} | ${sigs.padEnd(14)} | ` +
      `${String(pvLoVal).padStart(4)}  ${String(pvHiVal).padStart(4)} | ${maStr.padStart(11)} | ${tvMaStr.padStart(11)} | ${String(maDiffPct).padStart(8)} | ${maBlock.padEnd(7)} | ${String(atrVal).padStart(8)}${confPart}${marker}`
    );
  }
  lines.push('');

  // JS сделки вокруг первого расхождения
  const _tLog = jsTradeLog || [];
  const _win = 60;
  const _trNear = _tLog.filter(t =>
    (t.exitBar  != null && t.exitBar  >= firstDivBar - _win && t.exitBar  <= firstDivBar + 10) ||
    (t.entryBar != null && t.entryBar >= firstDivBar - _win && t.entryBar <= firstDivBar + 10)
  );
  if (_trNear.length > 0) {
    lines.push(`=== JS СДЕЛКИ ВОКРУГ БАР #${firstDivBar} (окно ±${_win}) ===`);
    lines.push(`  # | Вход  | Выход | Тип   | Цена вх    | Цена вых   | ATR вх   | PnL%    | Причина`);
    lines.push('-'.repeat(95));
    _trNear.forEach((t, k) => {
      const dir    = t.dir === 1 ? 'LONG' : 'SHORT';
      const atrE   = (atrArr && t.entryBar != null && atrArr[t.entryBar] > 0) ? atrArr[t.entryBar].toFixed(5) : '—';
      const exitB  = t.exitBar  != null ? String(t.exitBar).padStart(5)  : '  —  ';
      const entryB = t.entryBar != null ? String(t.entryBar).padStart(5) : '  —  ';
      lines.push(
        `${String(k+1).padStart(3)} | ${entryB} | ${exitB} | ${dir.padEnd(5)} | ` +
        `${(t.entry||0).toFixed(6)} | ${(t.exit||0).toFixed(6)} | ${String(atrE).padStart(8)} | ` +
        `${((t.pnl||0)).toFixed(3).padStart(7)}% | ${t.reason||'—'}`
      );
    });
    lines.push('');
  } else if (_tLog.length === 0) {
    lines.push(`=== JS СДЕЛКИ: tradeLog пуст — collectTrades не включён ===`);
    lines.push('');
  } else {
    lines.push(`=== JS СДЕЛКИ: нет в окне [${firstDivBar-_win}..${firstDivBar+10}] · всего JS сделок: ${_tLog.length} ===`);
    lines.push('');
  }

  // Also show 5 bars before first divergence where they still matched (last matching bars)
  let lastMatchBar = -1;
  for (const p of pairs) { if (p.i < firstDivBar && Math.abs(p.jsEq - p.tvEq) <= 0.5) lastMatchBar = p.i; }
  if (lastMatchBar >= 0) {
    lines.push(`Последний совпадающий бар (Δ≤0.5%): #${lastMatchBar} (${DATA[lastMatchBar]?.t||''})`);
    const pm = pairMap[lastMatchBar];
    if (pm) lines.push(`  JS_eq: ${pm.jsEq.toFixed(3)}%  TV_eq: ${pm.tvEq.toFixed(3)}%`);
  }
  lines.push('');
  // Post-warmup section
  if (statsPost) {
    lines.push(`=== ПОСТ-ПРОГРЕВ (бар ${warmupN}+, ${statsPost.n} баров) ===`);
    lines.push(`Прогрев пропускает первые ${warmupN} баров (MA=${c.useMA?`${c.maType||'EMA'}(${c.maP||0})×${c.htfRatio||1}tf`:'off'}, Conf=${c.useConfirm?`${c.confMatType||'EMA'}(${c.confN||0})×${c.confHtfRatio||1}tf`:'off'}, pvL+pvR+5=${(c.pvL||5)+(c.pvR||2)+5}, ATR×3=${(c.atrPeriod||14)*3})`);
    lines.push(`Корреляция: ${(statsPost.corr*100).toFixed(2)}%  RMSE: ${statsPost.rmse.toFixed(2)}%`);
    lines.push(`JS итог: ${statsPost.jsLast.toFixed(2)}%  TV итог: ${statsPost.tvLast.toFixed(2)}%  Δ: ${statsPost.finalDiff>=0?'+':''}${statsPost.finalDiff.toFixed(2)}%`);
    if (statsPost.firstDiv >= 0)
      lines.push(`Первое расхождение >0.5% (пост-прогрев): бар #${statsPost.firstDiv} (${statsPost.firstTime})`);
    else
      lines.push(`Первое расхождение >0.5% (пост-прогрев): не обнаружено ✅`);
    lines.push(`Макс. расхождение (пост-прогрев): ${statsPost.maxDiff.toFixed(2)}% на баре #${statsPost.maxBar}`);
    const verdict = statsPost.corr >= 0.99 ? '✅ ПРОГРЕВ БЫЛ ПРИЧИНОЙ — пост-warmup корреляция отличная' :
                    statsPost.corr >= 0.95 ? '⚠️ Улучшилось после прогрева, но есть остаточное расхождение' :
                    statsPost.corr >= 0 ?    '❌ Расхождение сохраняется после прогрева — есть баг в логике' :
                                             '❌❌ Отрицательная корреляция даже после прогрева — серьёзный баг';
    lines.push(verdict);
    lines.push('');
  }
  // Автоматический анализ первичной причины
  lines.push('=== АВТО-ДИАГНОЗ ===');
  // Ищем TV EL/ES сигнал в окне [firstDivBar-6 .. firstDivBar] — он мог быть чуть раньше
  let entrySignalBar = -1, entryDir = 0;
  for (let _si = Math.max(0, firstDivBar - 6); _si <= firstDivBar; _si++) {
    const _p = pairMap[_si];
    if (!_p) continue;
    if (_p.tvRow.el === 1) { entrySignalBar = _si; entryDir = 1; break; }
    if (_p.tvRow.es === 1) { entrySignalBar = _si; entryDir = -1; break; }
  }
  // Ищем TV XL/XS в том же окне
  let exitSignalBar = -1;
  for (let _si = Math.max(0, firstDivBar - 6); _si <= firstDivBar; _si++) {
    const _p = pairMap[_si];
    if (!_p) continue;
    if (_p.tvRow.xl === 1 || _p.tvRow.xs === 1) { exitSignalBar = _si; break; }
  }

  if (entrySignalBar >= 0) {
    const dirStr = entryDir === 1 ? 'LONG' : 'SHORT';
    lines.push(`TV открыл ${dirStr} на баре #${entrySignalBar}`);
    const waitB = c.waitBars || 0;

    // Ищем реальный сигнальный бар JS с учётом waitBars
    let jsSigBar = -1;
    if (pvLo && pvHi_ && c.usePivot) {
      // Сигнал должен быть на баре entrySignalBar - waitBars (± небольшое окно)
      const searchFrom = Math.max(0, entrySignalBar - waitB - 3);
      const searchTo   = Math.min(DATA.length - 1, entrySignalBar);
      for (let _k = searchTo; _k >= searchFrom; _k--) {
        const pv = entryDir === 1 ? pvLo[_k] : pvHi_[_k];
        if (pv === 1) { jsSigBar = _k; break; }
      }
    }

    if (pvLo && pvHi_) {
      const pvAtEntry = entryDir === 1 ? pvLo[entrySignalBar] : pvHi_[entrySignalBar];
      lines.push(`JS pvLo[${entrySignalBar}]=${pvLo[entrySignalBar]}  pvHi_[${entrySignalBar}]=${pvHi_[entrySignalBar]}`);
      if (pvAtEntry === 1) {
        lines.push(`✅ JS тоже видит pivot на баре #${entrySignalBar} — причина не в pivot detection`);
      } else if (waitB > 0 && jsSigBar >= 0) {
        const delay = entrySignalBar - jsSigBar;
        lines.push(`ℹ️  waitBars=${waitB}: JS видит pvSig на баре #${jsSigBar}, вход должен быть на #${jsSigBar}+${waitB}=${jsSigBar+waitB}`);
        if (jsSigBar + waitB === entrySignalBar) {
          lines.push(`✅ Задержка совпадает с TV (сигнал #${jsSigBar} + ${waitB}б = #${entrySignalBar}) — проверить фильтры на баре #${jsSigBar}`);
        } else {
          lines.push(`⚠️  Задержка не совпадает: JS вошёл бы на #${jsSigBar+waitB}, TV на #${entrySignalBar} (разница ${entrySignalBar-(jsSigBar+waitB)} бара)`);
        }
        // Анализ фильтров на СИГНАЛЬНОМ баре jsSigBar
        lines.push(`--- Фильтры на сигнальном баре JS #${jsSigBar} (bar.i-1=${jsSigBar-1}) ---`);
        if (maArr && jsSigBar > 0 && c.useMA) {
          const prevC2 = DATA[jsSigBar-1]?.c || 0;
          const ma2 = maArr[jsSigBar-1] || 0;
          const blocked2 = ma2 > 0 && (entryDir===1 ? prevC2 <= ma2 : prevC2 >= ma2);
          lines.push(`MA(${c.maP}×${c.htfRatio||1}tf)[${jsSigBar-1}] = ${ma2>0?ma2.toFixed(6):'0(warmup)'}  close=${prevC2.toFixed(6)}`);
          lines.push(ma2 <= 0 ? `⚠️  MA warmup → блокирует` : blocked2 ? `⚠️  MA БЛОКИРУЕТ (close${entryDir===1?'<=':'>='}MA)` : `✅ MA ok`);
        } else if (maArr && jsSigBar > 0 && !c.useMA) {
          lines.push(`MA(${c.maP}×${c.htfRatio||1}tf) — отключён (useMA=false), не влияет`);
        }
        if (confArr && jsSigBar > 0) {
          const prevC3 = DATA[jsSigBar-1]?.c || 0;
          const cf3 = confArr[jsSigBar-1] || 0;
          const cfBlocked = cf3 > 0 && (entryDir===1 ? prevC3 <= cf3 : prevC3 >= cf3);
          lines.push(`ConfMA(${c.confN}×${c.confHtfRatio||1}tf)[${jsSigBar-1}] = ${cf3>0?cf3.toFixed(6):'0(warmup)'}  close=${prevC3.toFixed(6)}`);
          lines.push(cf3 <= 0 ? `⚠️  ConfMA warmup → блокирует` : cfBlocked ? `⚠️  CONFIRM MA БЛОКИРУЕТ (close${entryDir===1?'<=':'>='}ConfMA)` : `✅ ConfMA ok`);
        }
      } else {
        lines.push(`⚠️  ПРИЧИНА: JS НЕ видит pivot вблизи бара #${entrySignalBar} (waitBars=${waitB})`);
        // показываем близкие бары где JS видит pivot
        for (let _k = Math.max(0,entrySignalBar-waitB-3); _k <= entrySignalBar+3; _k++) {
          if (_k >= DATA.length) break;
          if (pvLo[_k] === 1) lines.push(`   JS видит pvLo на баре #${_k}`);
          if (pvHi_[_k] === 1) lines.push(`   JS видит pvHi на баре #${_k}`);
        }
      }
    }
    // MA и Confirm MA filter на БАРЕ ВХОДА (для справки)
    const checkBar = (jsSigBar >= 0 && waitB > 0) ? jsSigBar : entrySignalBar;
    if (checkBar !== jsSigBar && c.useMA && maArr && entrySignalBar > 0) {
      // только если уже не показали выше
      const prevC = DATA[entrySignalBar - 1]?.c || 0;
      const ma = maArr[entrySignalBar - 1] || 0;
      if (ma > 0) {
        const blocked = entryDir === 1 ? prevC <= ma : prevC >= ma;
        lines.push(`MA(${c.maP}×${c.htfRatio||1}tf)[${entrySignalBar-1}] = ${ma.toFixed(6)}  close[${entrySignalBar-1}] = ${prevC.toFixed(6)}`);
        lines.push(blocked
          ? `⚠️  ПРИЧИНА: JS MA_FILTER БЛОКИРУЕТ ${dirStr} (close ${entryDir===1?'<=':'>='}  MA)`
          : `✅ MA filter не блокирует ${dirStr}`);
      } else {
        lines.push(`⚠️  ПРИЧИНА: MA[${entrySignalBar-1}] = 0 (warmup) → JS MA_FILTER БЛОКИРУЕТ`);
      }
    }
  } else if (exitSignalBar >= 0) {
    lines.push(`TV закрыл сделку (XL/XS=1) на баре #${exitSignalBar}. JS вероятно закрыл позже или по другой цене.`);
    if (maArr && exitSignalBar > 0) {
      const ma = maArr[exitSignalBar - 1] || 0;
      lines.push(`MA[${exitSignalBar-1}] = ${ma > 0 ? ma.toFixed(6) : '0 (warmup)'}`);
    }
  } else {
    lines.push(`TV не показывает явного EL/ES/XL/XS в окне [${firstDivBar-6}..${firstDivBar}].`);
    lines.push(`Возможна разница в цене входа/SL/TP расчёте.`);
    // Dump MA values near first divergence
    if (maArr) {
      for (let _k = firstDivBar - 2; _k <= firstDivBar + 1; _k++) {
        if (_k < 1 || _k >= DATA.length) continue;
        const ma = maArr[_k-1], cl = DATA[_k-1]?.c || 0;
        lines.push(`  MA[${_k-1}]=${ma>0?ma.toFixed(6):'warmup'}  close[${_k-1}]=${cl.toFixed(6)}`);
      }
    }
  }

  const text = lines.join('\n');
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector('#tv-cmp-results button');
    if (btn) { const orig = btn.textContent; btn.textContent = '✅ Скопировано!'; setTimeout(() => { btn.textContent = orig; }, 2000); }
  }).catch(() => {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
  });
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
        if (favTd) { const lvl=getFavLevel(r.name); favTd.textContent=lvl>0?'★':'☆'; favTd.dataset.level=lvl; }
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
  if (!arr || !arr.length) { applyFilters(true); return; }

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
  applyFilters(true);
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

// ══════════════════════════════════════════════════════════════════
// ── ОЧЕРЕДЬ ЗАДАЧ TPE ─────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

const _QUEUE_LS_KEY    = 'use_queue_tasks_v1';
const _SERIES_LS_KEY   = 'use_queue_series_v1';
let   _queueRunning    = false;
let   _queueStopFlag   = false;
let   _queueUnchecked  = new Set(); // IDs задач, снятых с чекбокса
let   _queueEditId     = null;      // ID редактируемой задачи (null = добавление)

// ── Снапшот текущего состояния DOM ────────────────────────────────
// Фильтры таблицы результатов — НЕ сохранять в снапшот очереди.
// Они не относятся к параметрам оптимизации и ломают таблицу при восстановлении:
// snapshot восстанавливает f_tv_score/f_rob/etc., applyFilters фильтрует новые
// результаты без OOS-данных → всё исчезает.
const _QUEUE_SNAP_EXCLUDE = new Set([..._TF_NUM_IDS, ..._TF_SEL_IDS]);

function _queueSnapshot() {
  const inputs = {}, checks = {};
  document.querySelectorAll('input[id], select[id]').forEach(el => {
    if (!el.id) return;
    if (el.type === 'checkbox' || el.type === 'radio') {
      if (!_QUEUE_SNAP_EXCLUDE.has(el.id)) checks[el.id] = el.checked;
    } else {
      // Не сохранять пустые поля — экономим место в localStorage
      // Не сохранять фильтры таблицы — они слетают при восстановлении снапшота
      if (el.value !== '' && !_QUEUE_SNAP_EXCLUDE.has(el.id)) inputs[el.id] = el.value;
    }
  });
  return {
    optMode: typeof optMode !== 'undefined' ? optMode : 'tpe',
    inputs,
    checks
  };
}

// ── Восстановить снапшот в DOM ────────────────────────────────────
function _queueRestore(snap) {
  if (!snap) return;
  if (snap.optMode && typeof setOptMode === 'function') setOptMode(snap.optMode);
  Object.entries(snap.inputs || {}).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el && el.tagName !== 'BUTTON') el.value = val;
  });
  Object.entries(snap.checks || {}).forEach(([id, checked]) => {
    const el = document.getElementById(id);
    if (el && (el.type === 'checkbox' || el.type === 'radio')) el.checked = checked;
  });
  // Применяем срез баров из снапшота (c_maxbars влияет на DATA/DATA_1M)
  if (typeof applyMaxBars === 'function') applyMaxBars();
  if (typeof updatePreview === 'function') updatePreview();
}

// ── localStorage helpers ──────────────────────────────────────────
// ── IndexedDB backend (задачи + серии) ───────────────────────────
// Кардинальная замена localStorage (~5MB) → IndexedDB (~GB).
// Синхронный API сохраняется через in-memory кэши (_tasksCache, _seriesCache).
// IndexedDB: запись async (fire-and-forget), чтение — из кэша (мгновенно).
let _tasksCache  = [];
let _seriesCache = [];
let _idb         = null;  // null = IDB недоступен, fallback на localStorage

async function _idbInit() {
  try {
    _idb = await new Promise((res, rej) => {
      const req = indexedDB.open('use_optimizer_v1', 1);
      req.onupgradeneeded = e => {
        if (!e.target.result.objectStoreNames.contains('blobs'))
          e.target.result.createObjectStore('blobs', { keyPath: 'k' });
      };
      req.onsuccess = e => res(e.target.result);
      req.onerror   = e => rej(e.target.error);
    });
    const _idbGet = k => new Promise((res, rej) => {
      const req = _idb.transaction('blobs','readonly').objectStore('blobs').get(k);
      req.onsuccess = e => res(e.target.result?.v ?? null);
      req.onerror   = e => rej(e.target.error);
    });
    // Однократная миграция из localStorage → IDB
    const lsTasks  = localStorage.getItem(_QUEUE_LS_KEY);
    const lsSeries = localStorage.getItem(_SERIES_LS_KEY);
    if (lsTasks  !== null) { await _idbWrite('tasks',  JSON.parse(lsTasks  || '[]')); localStorage.removeItem(_QUEUE_LS_KEY); }
    if (lsSeries !== null) { await _idbWrite('series', JSON.parse(lsSeries || '[]')); localStorage.removeItem(_SERIES_LS_KEY); }
    _tasksCache  = (await _idbGet('tasks'))  || [];
    _seriesCache = (await _idbGet('series')) || [];
    // Обновляем UI если панель уже открыта
    if (document.getElementById('queue-panel')?.style.display  !== 'none') renderQueueTaskList();
    if (document.getElementById('series-panel')?.style.display !== 'none') renderSeriesList();
  } catch(e) {
    console.warn('[_idbInit] IndexedDB недоступен, fallback на localStorage:', e);
    _idb = null;
    try { _tasksCache  = JSON.parse(localStorage.getItem(_QUEUE_LS_KEY)  || '[]'); } catch(_) {}
    try { _seriesCache = JSON.parse(localStorage.getItem(_SERIES_LS_KEY) || '[]'); } catch(_) {}
  }
}

function _idbWrite(key, val) {
  if (!_idb) {
    // localStorage fallback
    try { localStorage.setItem(key === 'tasks' ? _QUEUE_LS_KEY : _SERIES_LS_KEY, JSON.stringify(val)); } catch(_) {}
    return Promise.resolve();
  }
  return new Promise((res, rej) => {
    const tx = _idb.transaction('blobs', 'readwrite');
    tx.objectStore('blobs').put({ k: key, v: val });
    tx.oncomplete = () => res();
    tx.onerror    = e => rej(e.target.error);
  });
}

function _queueLoadTasks()    { return _tasksCache; }
function _queueSaveTasks(arr) {
  _tasksCache = arr;
  _idbWrite('tasks', arr).catch(e => console.error('[_queueSaveTasks] IDB:', e));
  return true;
}
function _seriesLoad()    { return _seriesCache; }
function _seriesSave(arr) {
  _seriesCache = arr;
  _idbWrite('series', arr).catch(e => console.error('[_seriesSave] IDB:', e));
  return true;
}

// ── Сгенерировать краткое описание снапшота ───────────────────────
function _queueSnapDesc(snap) {
  if (!snap) return '';
  const mode = snap.optMode || '?';
  const target = (snap.inputs || {})['tpe_target'] || '';
  const maxIter = (snap.inputs || {})['tpe_n'] || '';
  return `Режим: ${mode}` + (target ? ` · Цель: ${target}` : '') + (maxIter ? ` · Макс: ${maxIter}` : '');
}

// ── UI: показать/скрыть панель ────────────────────────────────────
function toggleQueuePanel() {
  const p = document.getElementById('queue-panel');
  if (!p) return;
  const open = p.style.display !== 'none';
  p.style.display = open ? 'none' : 'block';
  if (!open) renderQueueTaskList();
}

function toggleSeriesPanel() {
  const p = document.getElementById('series-panel');
  if (!p) return;
  p.style.display = p.style.display === 'none' ? 'block' : 'none';
  if (p.style.display !== 'none') renderSeriesList();
}

// ── Добавить задачу (открыть форму) ──────────────────────────────
function queueAddCurrent() {
  _queueEditId = null;
  const form = document.getElementById('queue-add-form');
  if (!form) return;
  form.style.display = 'block';
  const titleEl = document.getElementById('queue-form-title');
  if (titleEl) titleEl.textContent = '+ Добавить задачу';
  const prev = document.getElementById('queue-task-preview');
  if (prev) prev.textContent = 'Параметры сохранятся при нажатии ✓ Сохранить';
  document.getElementById('queue-task-name')?.focus();
}

// ── Закрыть форму (отмена) ────────────────────────────────────────
function queueCancelForm() {
  _queueEditId = null;
  const form = document.getElementById('queue-add-form');
  if (form) form.style.display = 'none';
}

// ── Редактировать существующую задачу ─────────────────────────────
function queueEditTask(id) {
  const tasks = _queueLoadTasks();
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  _queueEditId = id;
  _queueRestore(task.snapshot);
  const form = document.getElementById('queue-add-form');
  if (!form) return;
  form.style.display = 'block';
  const titleEl = document.getElementById('queue-form-title');
  if (titleEl) titleEl.textContent = '✏ Редактирование: ' + task.name;
  const nameEl = document.getElementById('queue-task-name');
  const repsEl = document.getElementById('queue-task-repeats');
  if (nameEl) nameEl.value = task.name;
  if (repsEl) repsEl.value = task.repeats;
  const prev = document.getElementById('queue-task-preview');
  if (prev) prev.textContent = 'Параметры восстановлены. Измени что нужно и нажми ✓ Сохранить';
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  nameEl?.focus();
}

function queueDuplicateTask(id) {
  const tasks = _queueLoadTasks();
  const idx = tasks.findIndex(t => t.id === id);
  if (idx < 0) return;
  const src = tasks[idx];
  // Deep copy snapshot so original and copy are fully independent
  const copy = JSON.parse(JSON.stringify({ ...src, id: Date.now() + Math.random(), name: src.name + ' (копия)' }));
  tasks.splice(idx + 1, 0, copy);
  _queueSaveTasks(tasks);
  renderQueueTaskList();
}

// ── Вспомогательные: чекбоксы задач ──────────────────────────────
function queueToggleCheck(id, checked) {
  if (checked) _queueUnchecked.delete(id);
  else _queueUnchecked.add(id);
  renderQueueTaskList();
}

function queueCheckAll(checked) {
  if (checked) {
    _queueUnchecked.clear();
  } else {
    _queueLoadTasks().forEach(t => _queueUnchecked.add(t.id));
  }
  renderQueueTaskList();
}

// Возвращает только отмеченные (активные) задачи
function _queueGetActive() {
  return _queueLoadTasks().filter(t => !_queueUnchecked.has(t.id));
}

// ── Сохранить задачу из формы (добавление или редактирование) ────
function queueSaveTask() {
  const snap    = _queueSnapshot(); // снапшот берётся здесь — в момент сохранения!
  const name    = (document.getElementById('queue-task-name')?.value || '').trim() || ('Задача ' + (_queueLoadTasks().length + 1));
  const repeats = Math.max(1, parseInt(document.getElementById('queue-task-repeats')?.value) || 1);
  let tasks = _queueLoadTasks();

  if (_queueEditId !== null) {
    const idx = tasks.findIndex(t => t.id === _queueEditId);
    if (idx >= 0) tasks[idx] = { ...tasks[idx], name, repeats, snapshot: snap };
    _queueEditId = null;
  } else {
    tasks.push({ id: Date.now() + Math.random(), name, repeats, snapshot: snap });
  }
  _queueSaveTasks(tasks);

  document.getElementById('queue-add-form').style.display = 'none';
  document.getElementById('queue-task-name').value = '';
  const titleEl = document.getElementById('queue-form-title');
  if (titleEl) titleEl.textContent = '+ Добавить задачу';
  renderQueueTaskList();
}

// ── Удалить задачу ────────────────────────────────────────────────
function queueDeleteTask(id) {
  _queueUnchecked.delete(id);
  _queueSaveTasks(_queueLoadTasks().filter(t => t.id !== id));
  renderQueueTaskList();
}

// ── Переместить задачу вверх/вниз ────────────────────────────────
function queueMoveTask(id, dir) {
  const tasks = _queueLoadTasks();
  const idx   = tasks.findIndex(t => t.id === id);
  if (idx < 0) return;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= tasks.length) return;
  [tasks[idx], tasks[newIdx]] = [tasks[newIdx], tasks[idx]];
  _queueSaveTasks(tasks);
  renderQueueTaskList();
}

// ── Очистить всю очередь ─────────────────────────────────────────
function queueClearAll() {
  if (!confirm('Очистить всю очередь задач?')) return;
  _queueSaveTasks([]);
  renderQueueTaskList();
}

// ── Отрисовать список задач ───────────────────────────────────────
function renderQueueTaskList() {
  const el = document.getElementById('queue-task-list');
  if (!el) return;
  const tasks = _queueLoadTasks();
  if (tasks.length === 0) {
    el.innerHTML = '<div style="color:var(--text3);text-align:center;padding:10px">Очередь пуста — нажми «+ Задача» чтобы добавить</div>';
    return;
  }
  const selRow = `<div style="display:flex;gap:2px;padding:0 2px;margin-bottom:2px">
    <button onclick="queueCheckAll(true)"  style="background:transparent;border:none;color:var(--text3);cursor:pointer;font-size:.72em;padding:1px 5px" title="Выбрать все">✓ все</button>
    <button onclick="queueCheckAll(false)" style="background:transparent;border:none;color:var(--text3);cursor:pointer;font-size:.72em;padding:1px 5px" title="Снять все">✕ все</button>
  </div>`;
  el.innerHTML = selRow + tasks.map((t, i) => {
    const desc    = _queueSnapDesc(t.snapshot);
    const checked = !_queueUnchecked.has(t.id);
    const dimmed  = checked ? '' : 'opacity:.45;';
    return `<div style="display:flex;align-items:center;gap:6px;padding:5px 7px;background:var(--bg3);border-radius:5px;border:1px solid var(--border);${dimmed}">
      <input type="checkbox" ${checked ? 'checked' : ''} onchange="queueToggleCheck(${t.id}, this.checked)" style="cursor:pointer;accent-color:var(--accent);flex-shrink:0" title="Включить/отключить задачу">
      <span style="color:var(--text3);font-size:.75em;min-width:16px">${i+1}.</span>
      <div style="flex:1;overflow:hidden">
        <div style="color:var(--text);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.name}</div>
        <div style="color:var(--text2);font-size:.75em">${desc} · ×${t.repeats} повтор${t.repeats===1?'':'ов'}</div>
      </div>
      <button onclick="queueEditTask(${t.id})" style="background:transparent;border:none;color:var(--text2);cursor:pointer;font-size:.85em;padding:1px 4px" title="Редактировать">✏</button>
      <button onclick="queueDuplicateTask(${t.id})" style="background:transparent;border:none;color:var(--text2);cursor:pointer;font-size:.85em;padding:1px 4px" title="Дублировать">⧉</button>
      <button onclick="queueMoveTask(${t.id}, -1)" style="${i===0?'opacity:.3;pointer-events:none;':''} background:transparent;border:none;color:var(--text3);cursor:pointer;font-size:.9em;padding:1px 4px" title="Вверх">▲</button>
      <button onclick="queueMoveTask(${t.id}, 1)"  style="${i===tasks.length-1?'opacity:.3;pointer-events:none;':''} background:transparent;border:none;color:var(--text3);cursor:pointer;font-size:.9em;padding:1px 4px" title="Вниз">▼</button>
      <button onclick="queueDeleteTask(${t.id})" style="background:transparent;border:none;color:#ff5555;cursor:pointer;font-size:.9em;padding:1px 4px" title="Удалить">🗑</button>
    </div>`;
  }).join('');
}

// ── Запустить очередь ─────────────────────────────────────────────
async function runQueue() {
  if (_queueRunning) return;
  const tasks = _queueGetActive();
  if (tasks.length === 0) { alert(_queueLoadTasks().length === 0 ? 'Очередь пуста' : 'Нет выбранных задач — отметь хотя бы одну'); return; }

  _queueRunning  = true;
  _queueStopFlag = false;
  window._queueMode = true;

  const runBtn  = document.getElementById('queue-run-btn');
  const stopBtn = document.getElementById('queue-stop-btn');
  const progEl  = document.getElementById('queue-progress');
  if (runBtn)  runBtn.style.display  = 'none';
  if (stopBtn) stopBtn.style.display = 'inline-block';
  if (progEl)  progEl.style.display  = 'block';

  const totalRepeats = tasks.reduce((s, t) => s + t.repeats, 0);
  let doneRepeats = 0;

  try {
    for (let ti = 0; ti < tasks.length; ti++) {
      if (_queueStopFlag) break;
      const task = tasks[ti];

      for (let rep = 0; rep < task.repeats; rep++) {
        if (_queueStopFlag) break;

        _queueRestore(task.snapshot);
        // Один macrotask чтобы DOM-изменения применились до runOpt.
        // yieldToUI = MessageChannel — не тротлится в фоновых вкладках.
        await yieldToUI();
        if (_queueStopFlag) break;

        if (progEl) progEl.textContent =
          `Задача ${ti+1}/${tasks.length} · Повтор ${rep+1}/${task.repeats} · Найдено: ${(window.results||[]).length.toLocaleString()} результатов`;

        // Запустить — results НЕ сбрасываются (window._queueMode=true).
        // runOptMultiTF читает c_tf_range из снапшота и ресэмплирует DATA.
        const _queueRunner = typeof window.runOptMultiTF === 'function' ? window.runOptMultiTF : window.runOpt;
        if (_queueRunner) await _queueRunner();

        doneRepeats++;
        // Если пользователь нажал "Стоп" в runOpt — прерываем очередь
        if (typeof stopped !== 'undefined' && stopped && !_queueStopFlag) {
          _queueStopFlag = true; break;
        }

        // Авто-очистка по порогам отсечки
        if (!_queueStopFlag && task.snapshot?.checks?.['queue-task-autoclean']) {
          const removed = _queueApplyCutoff();
          if (progEl && removed > 0) {
            progEl.textContent = `🗑 Удалено ${removed} слабых результатов · Задача ${ti+1}/${tasks.length} · Повтор ${rep+1}/${task.repeats}`;
            await yieldToUI(); // не тротлится в фоне
          }
        }

        // Rob-тест после оптимизации
        if (!_queueStopFlag && task.snapshot?.checks?.['queue-task-rob']) {
          if (progEl) progEl.textContent = `🔬 Rob-тест · Задача ${ti+1}/${tasks.length} · Повтор ${rep+1}/${task.repeats} · ${(window.results||[]).length} результатов`;
          // applyFilters заблокирован в queue-режиме, поэтому _visibleResults может быть устаревшим.
          // Синхронизируем вручную — чтобы runMassRobust видел актуальные результаты.
          _visibleResults = (window.results || results || []).filter(r => !!r.cfg);
          await yieldToUI(); // не тротлится в фоне
          if (typeof runMassRobust === 'function') await runMassRobust();
        }
      }
    }
  } finally {
    _queueRunning = false;
    window._queueMode = false;
    if (runBtn)  runBtn.style.display  = 'inline-block';
    if (stopBtn) stopBtn.style.display = 'none';
    if (progEl) {
      const total = (window.results || []).length;
      progEl.textContent = _queueStopFlag
        ? `⏹ Остановлено · Найдено: ${total.toLocaleString()} результатов`
        : `✅ Готово · Все задачи выполнены · Найдено: ${total.toLocaleString()} результатов`;
      progEl.style.color = _queueStopFlag ? '#ff5555' : 'var(--accent)';
    }
    // Финальный рендер: применяем текущие фильтры без сброса
    if (typeof applyFilters === 'function') applyFilters();
    $('mass-rob-bar').style.display = (window.results||[]).length > 0 ? 'flex' : 'none';
    $('mass-rob-info').textContent = `${(window.results||[]).length} результатов`;
  }
}

// ── Остановить очередь ────────────────────────────────────────────
function stopQueue() {
  _queueStopFlag = true;
  if (typeof stopOpt === 'function') stopOpt();
  // Останавливаем rob-тест если он сейчас работает
  if (typeof _massRobRunning !== 'undefined') _massRobRunning = false;
  if (typeof _hcRobRunning   !== 'undefined') _hcRobRunning   = false;
}

// ── Серии ─────────────────────────────────────────────────────────
function seriesSaveCurrent() {
  const name = (document.getElementById('series-save-name')?.value || '').trim();
  if (!name) { alert('Введи название серии'); return; }
  const tasks = _queueGetActive();
  if (tasks.length === 0) { alert(_queueLoadTasks().length === 0 ? 'Очередь пуста' : 'Нет выбранных задач — отметь хотя бы одну'); return; }
  const series = _seriesLoad();
  series.push({ id: Date.now(), name, tasks: JSON.parse(JSON.stringify(tasks)) });
  _seriesSave(series);
  document.getElementById('series-save-name').value = '';
  renderSeriesList();
  toast('💾 Серия «' + name + '» сохранена', 1800);
}

function seriesLoad(id) {
  const series = _seriesLoad();
  const s = series.find(x => x.id === id);
  if (!s) return;
  if (_queueLoadTasks().length > 0 && !confirm('Заменить текущую очередь задачами из серии «' + s.name + '»?')) return;
  _queueSaveTasks(JSON.parse(JSON.stringify(s.tasks)));
  renderQueueTaskList();
  toast('📂 Серия «' + s.name + '» загружена в очередь', 1800);
}

function seriesDelete(id) {
  _seriesSave(_seriesLoad().filter(s => s.id !== id));
  renderSeriesList();
}

function renderSeriesList() {
  const el = document.getElementById('series-list');
  if (!el) return;
  const series = _seriesLoad();
  if (series.length === 0) {
    el.innerHTML = '<div style="color:var(--text3);text-align:center;padding:6px">Серий нет</div>';
    return;
  }
  el.innerHTML = series.map(s =>
    `<div style="display:flex;align-items:center;gap:6px;padding:4px 7px;background:var(--bg3);border-radius:4px;border:1px solid var(--border)">
      <div style="flex:1">
        <span style="color:var(--text)">${s.name}</span>
        <span style="color:var(--text3);font-size:.75em;margin-left:6px">${s.tasks.length} задач · ${s.tasks.reduce((a,t)=>a+t.repeats,0)} повт.</span>
      </div>
      <button onclick="seriesLoad(${s.id})" style="background:rgba(100,180,255,.15);border:1px solid rgba(100,180,255,.3);color:#64b5f6;border-radius:3px;padding:2px 8px;cursor:pointer;font-size:.8em">Загрузить</button>
      <button onclick="seriesDelete(${s.id})" style="background:transparent;border:none;color:#ff5555;cursor:pointer;font-size:.85em" title="Удалить серию">🗑</button>
    </div>`
  ).join('');
}

// ── Отсечка перед запуском тестов ──────────────────────────────
// Возвращает подмножество _visibleResults, прошедших пороги pre-run фильтра.
function _getPreRunFiltered() {
  const minPnl    = parseFloat(document.getElementById('prf_minpnl')?.value) ?? 0;
  const minWR     = parseFloat(document.getElementById('prf_minwr')?.value)  ?? 0;
  const minSig    = parseFloat(document.getElementById('prf_minsig')?.value) ?? 0;
  const minGT     = parseFloat(document.getElementById('prf_mingt')?.value)  ?? 0;
  const minOosPnl = parseFloat(document.getElementById('prf_min_oos_pnl')?.value);
  const minRet    = parseFloat(document.getElementById('prf_min_retention')?.value);
  return _visibleResults.filter(r => {
    if (!r.cfg) return false;
    if (r.pnl < (isNaN(minPnl) ? 0 : minPnl)) return false;
    if (r.wr  < (isNaN(minWR)  ? 0 : minWR))  return false;
    if ((r.sig ?? 0) < (isNaN(minSig) ? 0 : minSig)) return false;
    if ((r.gt  ?? -2) < (isNaN(minGT) ? 0 : minGT))  return false;
    // OOS-фильтры: применяются только если значение задано И у результата есть OOS-данные
    const fwd = r.cfg._oos?.forward;
    if (fwd && !isNaN(minOosPnl) && fwd.pnl    < minOosPnl) return false;
    if (fwd && !isNaN(minRet)    && fwd.retention < minRet)  return false;
    return true;
  });
}

// Фильтрует window.results по тем же порогам что _getPreRunFiltered().
// Используется очередью после каждой оптимизации (авто-очистка мусора).
// Возвращает кол-во удалённых результатов.
function _queueApplyCutoff() {
  const minPnl    = parseFloat(document.getElementById('prf_minpnl')?.value);
  const minWR     = parseFloat(document.getElementById('prf_minwr')?.value);
  const minSig    = parseFloat(document.getElementById('prf_minsig')?.value);
  const minGT     = parseFloat(document.getElementById('prf_mingt')?.value);
  const minOosPnl = parseFloat(document.getElementById('prf_min_oos_pnl')?.value);
  const minRet    = parseFloat(document.getElementById('prf_min_retention')?.value);
  const p = isNaN(minPnl) ? 0 : minPnl;
  const w = isNaN(minWR)  ? 0 : minWR;
  const s = isNaN(minSig) ? 0 : minSig;
  const g = isNaN(minGT)  ? 0 : minGT;
  const before = (window.results || []).length;
  window.results = (window.results || []).filter(r => {
    if (!r.cfg) return false;
    if (r.pnl < p || r.wr < w) return false;
    if ((r.sig ?? 0) < s || (r.gt ?? -2) < g) return false;
    const fwd = r.cfg._oos?.forward;
    if (fwd && !isNaN(minOosPnl) && fwd.pnl       < minOosPnl) return false;
    if (fwd && !isNaN(minRet)    && fwd.retention  < minRet)    return false;
    return true;
  });
  const removed = before - window.results.length;
  if (removed > 0 && typeof renderResults === 'function') renderResults();
  return removed;
}

const _PRF_LS_KEY = 'use_opt_prf_cutoff';
const _PRF_FIELDS = ['prf_minpnl','prf_minwr','prf_minsig','prf_mingt','prf_min_oos_pnl','prf_min_retention'];

function _savePrfCutoff() {
  try {
    const vals = {};
    _PRF_FIELDS.forEach(id => { const el = document.getElementById(id); if (el) vals[id] = el.value; });
    localStorage.setItem(_PRF_LS_KEY, JSON.stringify(vals));
  } catch(e) {}
}

function _loadPrfCutoff() {
  try {
    const raw = localStorage.getItem(_PRF_LS_KEY);
    if (!raw) return;
    const vals = JSON.parse(raw);
    _PRF_FIELDS.forEach(id => {
      const el = document.getElementById(id);
      if (el && vals[id] !== undefined) el.value = vals[id];
    });
  } catch(e) {}
}

function updatePreRunCount() {
  const el = document.getElementById('prf-count');
  if (!el) return;
  _savePrfCutoff(); // persist on every change
  const total = _visibleResults.filter(r => r.cfg).length;
  if (total === 0) { el.textContent = ''; return; }
  const filtered = _getPreRunFiltered();
  el.textContent = `→ ${filtered.length} из ${total}`;
  el.style.color = filtered.length < total ? 'var(--orange)' : 'var(--accent)';
}
try { window.updatePreRunCount = updatePreRunCount; } catch(e) {}

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
    _robSliceCacheSet(_hcsk, _hcRes);
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
    // ATR Breakout multiplier — HC варьирует его, cfgDist должен это учитывать
    if (a.useAtrBo && b.useAtrBo)
      d += Math.abs((a.atrBoMult||2) - (b.atrBoMult||2)) / step;
    // Confirm MA period — варьируется через vConf
    if (a.useConfirm && b.useConfirm)
      d += Math.abs((a.confN||14) - (b.confN||14)) / 10;
    // ADX threshold
    if (a.useADX && b.useADX)
      d += Math.abs((a.adxThresh||20) - (b.adxThresh||20)) / 10;
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
      dwr: r.dwr||0, avg: r.avg||0, p1: r.p1||0, p2: r.p2||0, c1: r.c1||0, c2: r.c2||0,
      nL: r.nL||0, pL: r.pL||0, wrL: r.wrL, nS: r.nS||0, pS: r.pS||0, wrS: r.wrS, dwrLS: r.dwrLS,
      sig: r.sig, gt: r.gt, cvr: r.cvr, upi: r.upi,
      sortino: r.sortino, kRatio: r.kRatio, sqn: r.sqn,
      omega: r.omega, pain: r.pain, burke: r.burke, serenity: r.serenity, ir: r.ir,
      cpcvScore: r.cpcvScore,
      eq: r.eq,
      robScore: x.robScore, robMax: x.robMax, robDetails: x.robDetails
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
    'clr-btn':     function(){ clearResults(); },
    'clr-btn-all': function(){ clearAllResults(); }
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
      `<td style="text-align:center;font-size:.9em" data-fav="${globalIdx}" data-level="${oosLvl}" onclick="toggleOOSFav(${globalIdx},event)">${fav}</td>` +
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


// Детальный вид OOS результата (дабл-клик по строке)
function showOOSDetail(idx) {
  const r = _oosTableResults[idx];
  if (!r || !r.cfg) return;
  // showDetail ожидает r.eq для построения equity-графика;
  // маппируем old_eq → eq (история = то, на чём стратегия была найдена)
  if (!r.eq && r.old_eq) r.eq = r.old_eq;
  showDetail(r);
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
  if (!canvas || !wrap) return;
  const r = _oosTableResults[idx];
  if (!r || !r.old_eq || !r.old_eq.length || !r.new_eq || !r.new_eq.length) {
    wrap.style.display = 'none'; return;
  }
  wrap.style.display = 'block';

  const eq_old = r.old_eq;
  const eq_new = r.new_eq;
  // Concatenate: новый сегмент продолжает с последнего значения истории
  const lastOld = eq_old[eq_old.length - 1];
  const combined = [...eq_old, ...eq_new.map(v => v + lastOld)];
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
      old_eq:    rOld ? rOld.eq  : null,   // equity curve на истории
      new_eq:    rNew ? rNew.eq  : null,   // equity curve на новых данных
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

  // Clear stale data from previous project before loading new one
  DATA = null; _rawDATA = null;
  _rawDataInfo = '';
  if ($('finfo')) $('finfo').textContent = 'Нет данных';
  results = []; equities = {};
  if ($('tb')) $('tb').innerHTML = '';
  if ($('eqc')) $('eqc').style.display = 'none';
  if ($('rbtn')) $('rbtn').disabled = true;

  // Update UI
  _updateProjBar(proj);
  renderFavBar();
  const nsEl = document.getElementById('fav-ns-label');
  if (nsEl) nsEl.textContent = _favNs ? _favNs : '';

  // Helper: try to restore CSV from localStorage cache (no permission needed)
  function _restoreFromCache(filename) {
    const cached = localStorage.getItem(`use6_csv_${id}`);
    if (!cached) return false;
    parseCSV(cached);
    _rawDATA = DATA;
    _rawDataInfo = '✅ ' + (filename || 'данные') + ' (кэш)';
    applyMaxBars();
    if ($('rbtn')) $('rbtn').disabled = false;
    updateVolStatus();
    updatePreview();
    return true;
  }

  // Auto-load last CSV from project folder
  if (proj.lastFile) {
    const file = await ProjectManager.readCSVFile(id, proj.lastFile);
    if (file) loadFile(file);
    else _restoreFromCache(proj.lastFile); // fallback: restore from cache on reload
  } else {
    // No lastFile — try to pick the most recent CSV
    const files = await ProjectManager.listCSVFiles(id);
    if (files.length > 0) {
      const file = await ProjectManager.readCSVFile(id, files[0].name);
      if (file) { loadFile(file); ProjectManager.updateLastFile(files[0].name); }
      else _restoreFromCache(files[0].name);
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
  // Force close even if firstLaunch (guard in closeProjCreate would block it)
  _projCreateFirstLaunch = false;
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
    // Use IfGranted variant — doesn't call requestPermission (requires user gesture)
    const newFiles = await ProjectManager.checkNewFilesIfGranted(id);
    const badge = document.getElementById('proj-new-badge');
    // null = permission not yet granted → don't hide badge (it may have been set earlier)
    if (badge && newFiles !== null) badge.style.display = newFiles.length > 0 ? 'inline' : 'none';
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

// ── ML Model Manager ──────────────────────────────────────────

// IndexedDB хранилище моделей
const _MLModelDB = (() => {
  const DB = 'use-ml-models', STORE = 'models';
  function open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = e => e.target.result.createObjectStore(STORE, { keyPath: 'id' });
      r.onsuccess = e => res(e.target.result);
      r.onerror   = e => rej(e.target.error);
    });
  }
  async function tx(mode, fn) {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(STORE, mode);
      t.onerror = e => rej(e.target.error);
      fn(t.objectStore(STORE), res, rej);
    });
  }
  return {
    save:   m  => tx('readwrite', (s, res) => { s.put(m).onsuccess = () => res(); }),
    load:   id => tx('readonly',  (s, res) => { s.get(id).onsuccess = e => res(e.target.result); }),
    list:   () => tx('readonly',  (s, res) => { s.getAll().onsuccess = e => res(
                  e.target.result.map(m => ({ id: m.id, name: m.name, auc: m.auc,
                    bars: m.bars, signals: m.signals, date: m.date }))); }),
    remove: id => tx('readwrite', (s, res) => { s.delete(id).onsuccess = () => res(); }),
  };
})();

// Состояние: ID активной модели ('__builtin__' = встроенная скомпилированная)
let _mlActiveId   = localStorage.getItem('_mlActiveId')   || '__builtin__';
let _mlActiveName = localStorage.getItem('_mlActiveName') || 'Встроенная';

// Активировать модель по коду JS (изолированное выполнение)
function _mlActivateCode(code) {
  try {
    const fn = new Function(code + '\nreturn typeof mlScore!=="undefined"?mlScore:null;');
    const scoreFn = fn();
    if (!scoreFn) throw new Error('mlScore not found');
    window.mlScore = scoreFn;
    if (typeof mlResetCache === 'function') mlResetCache();
    // Инвалидируем кеш ML-скоров при смене модели (opt.js)
    if (typeof _mlScoresArrCache     !== 'undefined') _mlScoresArrCache     = { arr: null, len: -1 };
    if (typeof _mlHighScoresArrCache !== 'undefined') _mlHighScoresArrCache = { arr: null, len: -1 };
    return true;
  } catch(e) {
    console.error('[ML activate]', e);
    return false;
  }
}

// Активировать модель из IndexedDB по id
async function _mlActivateById(id) {
  if (id === '__builtin__') {
    _mlActiveId = '__builtin__';
    _mlActiveName = 'Встроенная';
    localStorage.setItem('_mlActiveId', '__builtin__');
    localStorage.setItem('_mlActiveName', 'Встроенная');
    toast('Перезагрузите страницу чтобы восстановить встроенную модель', 3500);
    return true;
  }
  const model = await _MLModelDB.load(id);
  if (!model) { toast('Модель не найдена в БД', 2000); return false; }
  if (!_mlActivateCode(model.code)) { toast('⚠️ Ошибка загрузки модели', 2500); return false; }
  _mlActiveId   = id;
  _mlActiveName = model.name;
  localStorage.setItem('_mlActiveId',   id);
  localStorage.setItem('_mlActiveName', model.name);
  toast('✅ Модель активирована: ' + model.name, 2000);
  return true;
}

// Извлечь метаданные из заголовка model_generated.js
function _mlParseMeta(code) {
  const g = (re, def) => { const m = code.match(re); return m ? m[1] : def; };
  return {
    auc:     parseFloat(g(/AUC:\s*([\d.]+)/, '0')) || null,
    bars:    parseInt(g(/Баров:\s*(\d+)/, '0'))    || null,
    signals: parseInt(g(/Сигналов:\s*(\d+)/, '0')) || null,
  };
}

// Главный ML-модал (tab: 'models' | 'scan')
async function openMLModal(tab) {
  tab = tab || 'models';
  document.getElementById('ml-modal')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'ml-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;display:flex;align-items:center;justify-content:center';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);

  const box = document.createElement('div');
  box.style.cssText = 'background:var(--bg2,#1e1e2e);border:1px solid rgba(139,92,246,.45);border-radius:8px;padding:20px;width:min(640px,95vw);max-height:86vh;overflow-y:auto;color:var(--fg,#cdd6f4)';
  overlay.appendChild(box);

  const models   = await _MLModelDB.list();
  const activeId = _mlActiveId;
  const hasBuiltin = typeof mlScore === 'function';

  const hasBuiltinHigh = typeof mlScoreHigh === 'function';

  const tabBtn = (id, label) =>
    `<button onclick="openMLModal('${id}')" style="background:${tab===id?'rgba(139,92,246,.2)':'none'};border:1px solid ${tab===id?'rgba(139,92,246,.6)':'#444'};color:var(--fg,#cdd6f4);border-radius:4px;padding:4px 14px;cursor:pointer;font-size:.82em">${label}</button>`;

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <span style="font-weight:600">🤖 ML-модели</span>
      <button onclick="document.getElementById('ml-modal').remove()" style="background:none;border:none;color:var(--fg,#cdd6f4);cursor:pointer;font-size:1.2em">✕</button>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap">
      ${tabBtn('models','📉 Доньи')} ${tabBtn('tops','📈 Вершины')} ${tabBtn('scan','🔍 Скан')}
    </div>
    <div id="ml-modal-content">
      ${tab === 'models' ? _mlModelsTab(models, activeId, hasBuiltin)
        : tab === 'tops' ? _mlTopsTab(hasBuiltinHigh)
        : _mlScanTab()}
    </div>`;
}

function _mlModelsTab(models, activeId, hasBuiltin) {
  const hl = 'rgba(139,92,246,.15)';

  const builtinRow = `
    <tr style="background:${activeId==='__builtin__'?hl:''}">
      <td style="padding:6px 8px">${activeId==='__builtin__'?'●':'○'} Встроенная</td>
      <td style="padding:6px 8px;color:#888;font-size:.8em">${hasBuiltin?'загружена':'—'}</td>
      <td style="padding:6px 8px;text-align:center">—</td>
      <td style="padding:6px 8px;text-align:center">—</td>
      <td style="padding:6px 8px;text-align:right">
        ${activeId!=='__builtin__'
          ? `<button onclick="_mlActivateById('__builtin__').then(()=>openMLModal('models'))"
               style="font-size:.72em;padding:2px 8px;background:rgba(139,92,246,.15);border:1px solid rgba(139,92,246,.4);color:var(--fg,#cdd6f4);border-radius:4px;cursor:pointer">Активировать</button>`
          : `<span style="font-size:.7em;padding:2px 8px;background:rgba(139,92,246,.2);border:1px solid rgba(139,92,246,.5);border-radius:4px;color:#a78bfa">Активна</span>`}
      </td>
    </tr>`;

  const modelRows = models.map(m => `
    <tr style="background:${activeId===m.id?hl:''}">
      <td style="padding:6px 8px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${m.name}">${activeId===m.id?'●':'○'} ${m.name}</td>
      <td style="padding:6px 8px;color:#888;font-size:.8em">${m.date||'—'}</td>
      <td style="padding:6px 8px;text-align:center;color:${(m.auc||0)>=0.6?'#a6e3a1':(m.auc||0)>=0.55?'#f9e2af':'#888'}">${m.auc?m.auc.toFixed(3):'—'}</td>
      <td style="padding:6px 8px;text-align:center;color:#888;font-size:.8em">${m.bars?m.bars.toLocaleString():'—'}</td>
      <td style="padding:6px 8px;text-align:right;white-space:nowrap">
        ${activeId!==m.id
          ? `<button onclick="_mlActivateById('${m.id}').then(()=>openMLModal('models'))"
               style="font-size:.72em;padding:2px 8px;background:rgba(139,92,246,.15);border:1px solid rgba(139,92,246,.4);color:var(--fg,#cdd6f4);border-radius:4px;cursor:pointer;margin-right:4px">Активировать</button>`
          : `<span style="font-size:.7em;padding:2px 8px;background:rgba(139,92,246,.2);border:1px solid rgba(139,92,246,.5);border-radius:4px;color:#a78bfa;margin-right:4px">Активна</span>`}
        <button onclick="_mlDeleteModel('${m.id}')"
          style="font-size:.72em;padding:2px 6px;background:rgba(255,60,60,.1);border:1px solid rgba(255,60,60,.3);color:#f38ba8;border-radius:4px;cursor:pointer">🗑</button>
      </td>
    </tr>`).join('');

  return `
    <table style="width:100%;border-collapse:collapse;font-size:.82em;margin-bottom:16px">
      <thead>
        <tr style="color:#666;border-bottom:1px solid #333;font-size:.78em">
          <th style="padding:4px 8px;text-align:left">Название</th>
          <th style="padding:4px 8px;text-align:left">Загружена</th>
          <th style="padding:4px 8px;text-align:center">AUC</th>
          <th style="padding:4px 8px;text-align:center">Баров</th>
          <th style="padding:4px 8px"></th>
        </tr>
      </thead>
      <tbody>
        ${builtinRow}
        ${modelRows || '<tr><td colspan="5" style="padding:10px 8px;color:#555;font-size:.82em">Нет сохранённых моделей</td></tr>'}
      </tbody>
    </table>
    <div style="border-top:1px solid #333;padding-top:14px;display:flex;flex-direction:column;gap:12px">

      <div>
        <div style="font-size:.8em;font-weight:600;color:#a78bfa;margin-bottom:8px">▶ Обучить на текущих данных</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
          <label style="font-size:.78em;color:#888;display:flex;flex-direction:column;gap:3px">Название
            <input id="ml-train-name" type="text" placeholder="BTCUSDT 1H"
              style="padding:4px 7px;background:var(--bg3,#313244);border:1px solid #555;border-radius:4px;color:var(--fg,#cdd6f4);font-size:1em">
          </label>
          <label style="font-size:.78em;color:#888;display:flex;flex-direction:column;gap:3px">Деревьев
            <input id="ml-train-ntrees" type="number" value="100" min="20" max="400"
              style="padding:4px 7px;background:var(--bg3,#313244);border:1px solid #555;border-radius:4px;color:var(--fg,#cdd6f4);font-size:1em">
          </label>
          <label style="font-size:.78em;color:#888;display:flex;flex-direction:column;gap:3px">Глубина дерева
            <input id="ml-train-depth" type="number" value="5" min="2" max="8"
              style="padding:4px 7px;background:var(--bg3,#313244);border:1px solid #555;border-radius:4px;color:var(--fg,#cdd6f4);font-size:1em">
          </label>
          <label style="font-size:.78em;color:#888;display:flex;flex-direction:column;gap:3px">Баров обучения
            <input id="ml-train-bars" type="number" value="" placeholder="все"
              style="padding:4px 7px;background:var(--bg3,#313244);border:1px solid #555;border-radius:4px;color:var(--fg,#cdd6f4);font-size:1em">
          </label>
          <label style="font-size:.78em;color:#888;display:flex;flex-direction:column;gap:3px" title="Максимум баров ожидания результата">Горизонт (баров)
            <input id="ml-train-label" type="number" value="30" min="5" max="200"
              style="padding:4px 7px;background:var(--bg3,#313244);border:1px solid #555;border-radius:4px;color:var(--fg,#cdd6f4);font-size:1em">
          </label>
          <label style="font-size:.78em;color:#888;display:flex;flex-direction:column;gap:3px" title="TP: цена выросла на X% — метка=1 (прибыльный вход)">TP порог %
            <input id="ml-train-target" type="number" value="1.0" min="0.1" max="20" step="0.1"
              style="padding:4px 7px;background:var(--bg3,#313244);border:1px solid #555;border-radius:4px;color:var(--fg,#cdd6f4);font-size:1em">
          </label>
          <label style="font-size:.78em;color:#888;display:flex;flex-direction:column;gap:3px" title="SL: цена упала на X% — метка=0 (убыточный вход)">SL порог %
            <input id="ml-train-stop" type="number" value="0.5" min="0.1" max="20" step="0.1"
              style="padding:4px 7px;background:var(--bg3,#313244);border:1px solid #555;border-radius:4px;color:var(--fg,#cdd6f4);font-size:1em">
          </label>
        </div>
        <div style="font-size:.72em;color:#555;margin-bottom:8px">
          Метка=1 если цена достигла +TP% раньше чем -SL% в течение «горизонт» баров.
          Для 5min TF: TP=1%, SL=0.5%, горизонт=30. Для 1h TF: TP=3%, SL=1.5%, горизонт=20.
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <button onclick="_mlStartTraining()"
            style="padding:5px 18px;background:rgba(139,92,246,.25);border:1px solid rgba(139,92,246,.6);border-radius:4px;color:#a78bfa;cursor:pointer;font-size:.82em;font-weight:600">
            ⚡ Обучить
          </button>
          <div id="ml-train-status" style="font-size:.78em;color:#888"></div>
        </div>
        <div id="ml-train-bar-wrap" style="margin-top:8px;display:none">
          <div style="background:#333;border-radius:4px;height:6px;overflow:hidden">
            <div id="ml-train-bar" style="background:#7c3aed;height:100%;width:0%;transition:width .1s"></div>
          </div>
        </div>
      </div>

      <div style="border-top:1px solid #222;padding-top:12px">
        <div style="font-size:.78em;color:#666;margin-bottom:8px">Или загрузить готовую модель из файла
          <code style="color:#666">model_generated.js</code> (python3 ml/train.py)</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input id="ml-name-input" type="text" placeholder="Название"
            style="flex:1;min-width:120px;padding:5px 8px;background:var(--bg3,#313244);border:1px solid #555;border-radius:4px;color:var(--fg,#cdd6f4);font-size:.82em">
          <label style="cursor:pointer;padding:5px 12px;background:rgba(100,100,120,.15);border:1px solid #555;border-radius:4px;font-size:.82em;color:#888;white-space:nowrap">
            📂 Выбрать .js
            <input type="file" accept=".js" style="display:none" onchange="_mlHandleFile(this)">
          </label>
        </div>
      </div>

    </div>`;
}

function _mlTopsTab(hasBuiltinHigh) {
  return `
    <div style="font-size:.82em;color:#888;margin-bottom:10px">
      Модель вершин: <span style="color:#a78bfa">${hasBuiltinHigh ? '✅ загружена' : '—'}</span>
      ${!hasBuiltinHigh ? ' <span style="color:#f9e2af">Обучите модель ниже для коротких сигналов</span>' : ''}
    </div>
    <div style="font-size:.75em;color:#555;margin-bottom:12px;line-height:1.6">
      Обучает отдельную модель для <b>обнаружения вершин</b> (сигнал на шорт).<br>
      Использует зеркальные признаки: верхний хвост свечи, перекупленность RSI,
      цена выше EMA, бычья серия баров, наклон тренда вверх.<br>
      После обучения функция <code>mlScoreHigh()</code> используется для фильтрации шорт-входов.
    </div>

    <div style="font-size:.8em;font-weight:600;color:#a78bfa;margin-bottom:8px">▶ Методы разметки (что считать «хорошей вершиной»)</div>
    <div style="background:var(--bg3,#313244);border-radius:6px;padding:10px 12px;margin-bottom:10px;display:flex;flex-direction:column;gap:8px">

      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:.82em">
        <input type="checkbox" id="ml-high-m1" checked onchange="_mlTopsUpdateUI()">
        <span style="color:#cdd6f4">Метод 1: % падение</span>
        <span style="color:#555;margin-left:auto">цена упала на</span>
        <input id="ml-high-pct" type="number" value="2.0" min="0.1" max="30" step="0.1"
          style="width:55px;padding:2px 5px;background:var(--bg2,#1e1e2e);border:1px solid #555;border-radius:3px;color:var(--fg,#cdd6f4);font-size:.9em">
        <span style="color:#555">% в течение</span>
        <input id="ml-high-bars" type="number" value="20" min="5" max="200"
          style="width:48px;padding:2px 5px;background:var(--bg2,#1e1e2e);border:1px solid #555;border-radius:3px;color:var(--fg,#cdd6f4);font-size:.9em">
        <span style="color:#555">баров</span>
      </label>

      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:.82em">
        <input type="checkbox" id="ml-high-m2" onchange="_mlTopsUpdateUI()">
        <span style="color:#cdd6f4">Метод 2: ATR-падение</span>
        <span style="color:#555;margin-left:auto">упала на</span>
        <input id="ml-high-atr" type="number" value="2.0" min="0.1" max="20" step="0.1"
          style="width:55px;padding:2px 5px;background:var(--bg2,#1e1e2e);border:1px solid #555;border-radius:3px;color:var(--fg,#cdd6f4);font-size:.9em">
        <span style="color:#555">× ATR</span>
      </label>

      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:.82em">
        <input type="checkbox" id="ml-high-m3" onchange="_mlTopsUpdateUI()">
        <span style="color:#cdd6f4">Метод 3: структурный разрыв</span>
        <span style="color:#888;font-size:.9em">следующий пивот-лоу ниже предыдущего</span>
      </label>
    </div>

    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;font-size:.82em">
      <span style="color:#888">Комбинация методов:</span>
      <label style="display:flex;align-items:center;gap:4px;cursor:pointer;color:#cdd6f4">
        <input type="radio" name="ml-high-combine" value="or" checked> ИЛИ (OR) — хотя бы один
      </label>
      <label style="display:flex;align-items:center;gap:4px;cursor:pointer;color:#cdd6f4">
        <input type="radio" name="ml-high-combine" value="and"> И (AND) — все сразу
      </label>
    </div>

    <div style="font-size:.8em;font-weight:600;color:#a78bfa;margin-bottom:8px">▶ Параметры обучения</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
      <label style="font-size:.78em;color:#888;display:flex;flex-direction:column;gap:3px">Название
        <input id="ml-high-name" type="text" placeholder="TOPS BTC 1H"
          style="padding:4px 7px;background:var(--bg3,#313244);border:1px solid #555;border-radius:4px;color:var(--fg,#cdd6f4);font-size:1em">
      </label>
      <label style="font-size:.78em;color:#888;display:flex;flex-direction:column;gap:3px">Деревьев
        <input id="ml-high-ntrees" type="number" value="100" min="20" max="400"
          style="padding:4px 7px;background:var(--bg3,#313244);border:1px solid #555;border-radius:4px;color:var(--fg,#cdd6f4);font-size:1em">
      </label>
      <label style="font-size:.78em;color:#888;display:flex;flex-direction:column;gap:3px">Глубина дерева
        <input id="ml-high-depth" type="number" value="5" min="2" max="8"
          style="padding:4px 7px;background:var(--bg3,#313244);border:1px solid #555;border-radius:4px;color:var(--fg,#cdd6f4);font-size:1em">
      </label>
      <label style="font-size:.78em;color:#888;display:flex;flex-direction:column;gap:3px">Баров обучения
        <input id="ml-high-trainbars" type="number" value="" placeholder="все"
          style="padding:4px 7px;background:var(--bg3,#313244);border:1px solid #555;border-radius:4px;color:var(--fg,#cdd6f4);font-size:1em">
      </label>
    </div>

    <div style="display:flex;align-items:center;gap:10px">
      <button onclick="_mlStartTrainingHigh()"
        style="padding:5px 18px;background:rgba(139,92,246,.25);border:1px solid rgba(139,92,246,.6);border-radius:4px;color:#a78bfa;cursor:pointer;font-size:.82em;font-weight:600">
        ⚡ Обучить модель вершин
      </button>
      <div id="ml-high-status" style="font-size:.78em;color:#888"></div>
    </div>
    <div id="ml-high-bar-wrap" style="margin-top:8px;display:none">
      <div style="background:#333;border-radius:4px;height:6px;overflow:hidden">
        <div id="ml-high-bar" style="background:#7c3aed;height:100%;width:0%;transition:width .1s"></div>
      </div>
    </div>

    <div style="margin-top:14px;font-size:.72em;color:#555;line-height:1.5">
      Модель сохраняется в памяти браузера как <code>mlScoreHigh()</code>.<br>
      Чтобы использовать: в настройках стратегии включите <b>ML-фильтр шортов</b> (шорт-сторона требует mlScoreHigh ≥ порога).
    </div>`;
}

function _mlTopsUpdateUI() { /* placeholder — layout static */ }

async function _mlStartTrainingHigh() {
  if (typeof mlTrainHighInBrowser !== 'function') {
    toast('⚠️ Модуль обучения не загружен', 2500); return;
  }
  if (!DATA || DATA.length < 100) {
    toast('⚠️ Нет данных. Загрузите CSV.', 2500); return;
  }
  const nameEl = document.getElementById('ml-high-name');
  const name = nameEl?.value.trim();
  if (!name) { toast('Введите название модели', 2000); nameEl?.focus(); return; }

  const useMethodPct    = document.getElementById('ml-high-m1')?.checked ?? true;
  const useMethodAtr    = document.getElementById('ml-high-m2')?.checked ?? false;
  const useMethodStruct = document.getElementById('ml-high-m3')?.checked ?? false;
  if (!useMethodPct && !useMethodAtr && !useMethodStruct) {
    toast('⚠️ Выберите хотя бы один метод разметки', 2500); return;
  }

  const fallPct  = (parseFloat(document.getElementById('ml-high-pct')?.value)   || 2.0) / 100;
  const fallAtr  = parseFloat(document.getElementById('ml-high-atr')?.value)    || 2.0;
  const labelBars = parseInt(document.getElementById('ml-high-bars')?.value)    || 20;
  const nTrees   = parseInt(document.getElementById('ml-high-ntrees')?.value)   || 100;
  const depth    = parseInt(document.getElementById('ml-high-depth')?.value)    || 5;
  const nBars    = parseInt(document.getElementById('ml-high-trainbars')?.value)|| DATA.length;
  const combineMode = document.querySelector('input[name="ml-high-combine"]:checked')?.value || 'or';

  const statusEl = document.getElementById('ml-high-status');
  const barWrap  = document.getElementById('ml-high-bar-wrap');
  const barEl    = document.getElementById('ml-high-bar');
  const btn      = document.querySelector('[onclick="_mlStartTrainingHigh()"]');

  if (btn)     btn.disabled = true;
  if (barWrap) barWrap.style.display = 'block';
  if (statusEl) statusEl.textContent = 'Строим датасет вершин...';

  try {
    const result = await mlTrainHighInBrowser(
      { nTrees, maxDepth: depth, nBars, labelBars,
        useMethodPct, fallPct, useMethodAtr, fallAtr, useMethodStruct, combineMode },
      (frac, done, total, phase) => {
        if (barEl)    barEl.style.width = (frac * 100).toFixed(1) + '%';
        if (statusEl) statusEl.textContent =
          phase === 'dataset'  ? 'Строим датасет вершин...' :
          phase === 'training' ? `Обучение: дерево ${done}/${total}` : 'Готово';
      }
    );

    // Activate mlScoreHigh in current page context
    try {
      const fn = new Function(result.code + '\nreturn mlScoreHigh;');
      window.mlScoreHigh = fn();
    } catch(e) {
      console.warn('[mlTops] activate error', e);
    }

    // Save to DB with type marker
    const id = 'mlh_' + Date.now();
    await _MLModelDB.save({
      id, name: '📈 ' + name, code: result.code,
      auc: result.auc, bars: result.bars, signals: result.n,
      date: new Date().toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit', year:'2-digit' }),
    });

    const posPct = (100 * result.nPos / result.n).toFixed(0);
    const aucColor = result.auc >= 0.62 ? '✅' : result.auc >= 0.55 ? '⚠️' : '❌';
    toast(`${aucColor} Вершины «${name}» AUC=${result.auc.toFixed(3)} · сигналов=${result.n} · вершин=${posPct}%`, 4000);
    mlResetCache();
    await openMLModal('tops');

  } catch(e) {
    if (statusEl) statusEl.textContent = '⚠️ ' + e.message;
    if (btn) btn.disabled = false;
    console.error('[mlTrainHigh]', e);
  }
}

function _mlScanTab() {
  const activeLow  = typeof mlScore     === 'function';
  const activeHigh = typeof mlScoreHigh === 'function';
  // Check feature mismatch for lows model
  let featWarn = '';
  if (activeLow && typeof ML_FEAT_N !== 'undefined') {
    try {
      const dummy = new Float64Array(ML_FEAT_N);
      const r = mlScore(dummy);
      if (r === 0.5 && ML_FEAT_N !== 21) featWarn = `
        <div style="margin-top:6px;padding:5px 8px;background:rgba(249,226,175,.08);border:1px solid rgba(249,226,175,.3);border-radius:4px;font-size:.78em;color:#f9e2af">
          ⚠️ Модель доньев обучена на старых признаках. Перейдите в «📉 Доньи» → ⚡ Обучить заново.
        </div>`;
    } catch(e) {}
  }
  return `
    <div style="font-size:.82em;color:#888;margin-bottom:10px;display:flex;flex-wrap:wrap;gap:12px">
      <span>📉 Доньи: <span style="color:${activeLow?'#a78bfa':'#f38ba8'}">${activeLow?(_mlActiveName||'Встроенная'):'не загружена'}</span></span>
      <span>📈 Вершины: <span style="color:${activeHigh?'#a78bfa':'#555'}">${activeHigh?'загружена':'—'}</span></span>
    </div>
    ${featWarn}
    <div style="font-size:.75em;color:#555;margin-bottom:12px;line-height:1.5">
      Сканирует pivot-low/high сигналы и оценивает каждый по 33 признакам.
    </div>
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
      <label style="font-size:.82em;color:#aaa">Последних баров:</label>
      <input id="ml-scan-bars" type="number" value="500" min="50" max="50000"
        style="width:80px;padding:4px 6px;background:var(--bg3,#313244);border:1px solid #555;border-radius:4px;color:var(--fg,#cdd6f4);font-size:.82em">
      <button onclick="_mlRunScan('low')"
        style="padding:5px 14px;background:rgba(139,92,246,.2);border:1px solid rgba(139,92,246,.5);border-radius:4px;color:#a78bfa;cursor:pointer;font-size:.82em">
        📉 Доньи
      </button>
      <button onclick="_mlRunScan('high')"
        style="padding:5px 14px;background:rgba(139,92,246,.2);border:1px solid rgba(249,226,175,.4);border-radius:4px;color:#f9e2af;cursor:pointer;font-size:.82em">
        📈 Вершины
      </button>
    </div>
    <div id="ml-scan-results" style="font-size:.82em;color:#666">Нажмите кнопку для сканирования</div>`;
}

function _mlRunScan(type) {
  type = type || 'low';
  const isHigh = type === 'high';
  const res = document.getElementById('ml-scan-results');

  if (isHigh && typeof mlScoreHigh !== 'function') {
    res.innerHTML = '<span style="color:#f38ba8">⚠️ Модель вершин не загружена. Перейдите на вкладку «📈 Вершины» → ⚡ Обучить</span>';
    return;
  }
  if (!isHigh && typeof mlScore !== 'function') {
    res.innerHTML = '<span style="color:#f38ba8">⚠️ Модель доньев не загружена. Перейдите на вкладку «📉 Доньи» → ⚡ Обучить</span>';
    return;
  }
  if (!DATA || DATA.length < 50) {
    res.innerHTML = '<span style="color:#f38ba8">⚠️ Нет данных</span>';
    return;
  }
  const nBars = parseInt(document.getElementById('ml-scan-bars')?.value) || 500;
  res.innerHTML = '<span style="color:#888">Сканирование...</span>';

  setTimeout(() => {
    const results = isHigh ? mlScanHighSignals(nBars) : mlScanSignals(nBars);
    if (!results.length) { res.innerHTML = '<span style="color:#888">Сигналов не найдено</span>'; return; }

    const fmt = ts => {
      if (!ts) return '—';
      const d = new Date(ts * 1000);
      return d.toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit', year:'2-digit' });
    };
    const rows = results.slice(0, 50).map((r, i) => {
      const pct = (r.score * 100).toFixed(1);
      const col = r.score >= 0.65 ? '#a6e3a1' : r.score >= 0.5 ? '#f9e2af' : '#f38ba8';
      return `<tr>
        <td style="padding:3px 8px;color:#555">${i+1}</td>
        <td style="padding:3px 8px">${fmt(r.time)}</td>
        <td style="padding:3px 8px;text-align:right;color:#aaa">${r.close.toFixed(2)}</td>
        <td style="padding:3px 8px;text-align:right;color:${col};font-weight:600">${pct}%</td>
      </tr>`;
    }).join('');

    const label = isHigh ? 'вершин (📈 шорт-сигналов)' : 'доньев (📉 лонг-сигналов)';
    const hint  = isHigh
      ? '≥65% высокая вероятность значимого падения · <50% слабый сигнал'
      : '≥65% высокая · 50–65% средняя · <50% низкая вероятность прибыльного входа';
    res.innerHTML = `
      <div style="color:#666;margin-bottom:8px">Найдено: ${results.length} ${label} · топ-50 по ML-оценке</div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="color:#555;border-bottom:1px solid #333">
          <th style="padding:3px 8px;text-align:left">#</th>
          <th style="padding:3px 8px;text-align:left">Дата</th>
          <th style="padding:3px 8px;text-align:right">Цена</th>
          <th style="padding:3px 8px;text-align:right">ML-оценка</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="color:#555;margin-top:8px">${hint}</div>`;
  }, 20);
}

async function _mlStartTraining() {
  if (typeof mlTrainInBrowser !== 'function') {
    toast('⚠️ Модуль обучения не загружен', 2500); return;
  }
  if (!DATA || DATA.length < 100) {
    toast('⚠️ Нет данных. Загрузите CSV.', 2500); return;
  }
  const nameEl   = document.getElementById('ml-train-name');
  const name     = nameEl?.value.trim();
  if (!name) { toast('Введите название модели', 2000); nameEl?.focus(); return; }

  const nTrees    = parseInt(document.getElementById('ml-train-ntrees')?.value)  || 100;
  const depth     = parseInt(document.getElementById('ml-train-depth')?.value)   || 5;
  const labelBars = parseInt(document.getElementById('ml-train-label')?.value)   || 30;
  const nBars     = parseInt(document.getElementById('ml-train-bars')?.value)    || DATA.length;
  const targetPct = (parseFloat(document.getElementById('ml-train-target')?.value) || 1.0) / 100;
  const stopPct   = (parseFloat(document.getElementById('ml-train-stop')?.value)   || 0.5) / 100;

  const statusEl  = document.getElementById('ml-train-status');
  const barWrap   = document.getElementById('ml-train-bar-wrap');
  const barEl     = document.getElementById('ml-train-bar');
  const trainBtn  = document.querySelector('[onclick="_mlStartTraining()"]');

  if (trainBtn) trainBtn.disabled = true;
  if (barWrap)  barWrap.style.display = 'block';
  if (statusEl) statusEl.textContent = 'Строим датасет...';

  try {
    const result = await mlTrainInBrowser(
      { nTrees, maxDepth: depth, nBars, labelBars, targetPct, stopPct },
      (frac, done, total, phase) => {
        if (barEl)    barEl.style.width = (frac * 100).toFixed(1) + '%';
        if (statusEl) statusEl.textContent =
          phase === 'dataset'  ? 'Строим датасет...' :
          phase === 'training' ? `Обучение: дерево ${done}/${total}` :
                                 'Сохраняем...';
      }
    );

    const id = 'ml_' + Date.now();
    await _MLModelDB.save({
      id, name, code: result.code,
      auc: result.auc, bars: result.bars, signals: result.n,
      date: new Date().toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit', year:'2-digit' }),
    });

    // Activate immediately
    _mlActivateCode(result.code);
    _mlActiveId   = id;
    _mlActiveName = name;
    localStorage.setItem('_mlActiveId',   id);
    localStorage.setItem('_mlActiveName', name);

    const posPct = (100 * result.nPos / result.n).toFixed(0);
    const aucColor = result.auc >= 0.62 ? '✅' : result.auc >= 0.55 ? '⚠️' : '❌';
    toast(`${aucColor} «${name}» AUC=${result.auc.toFixed(3)} · сигналов=${result.n} · TP-доля=${posPct}%`, 4000);
    await openMLModal('models');

  } catch(e) {
    if (statusEl) statusEl.textContent = '⚠️ ' + e.message;
    if (trainBtn) trainBtn.disabled = false;
    console.error('[mlTrain]', e);
  }
}

async function _mlHandleFile(input) {
  const file = input.files[0];
  if (!file) return;
  const code = await file.text();
  const nameEl = document.getElementById('ml-name-input');
  const name = nameEl?.value.trim() || file.name.replace('.js','');
  if (!name) { toast('Введите название модели', 2000); return; }
  try {
    const fn = new Function(code + '\nreturn typeof mlScore!=="undefined"?mlScore:null;');
    if (!fn()) throw new Error('no mlScore');
  } catch(e) {
    toast('⚠️ Файл не является валидной моделью (нет функции mlScore)', 3000);
    return;
  }
  const meta = _mlParseMeta(code);
  const id = 'ml_' + Date.now();
  await _MLModelDB.save({
    id, name, code,
    auc: meta.auc, bars: meta.bars, signals: meta.signals,
    date: new Date().toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit', year:'2-digit' }),
  });
  toast('✅ Модель «' + name + '» сохранена', 2000);
  await openMLModal('models');
}

async function _mlDeleteModel(id) {
  if (!confirm('Удалить модель?')) return;
  await _MLModelDB.remove(id);
  if (_mlActiveId === id) {
    _mlActiveId = '__builtin__';
    _mlActiveName = 'Встроенная';
    localStorage.setItem('_mlActiveId', '__builtin__');
    localStorage.setItem('_mlActiveName', 'Встроенная');
  }
  await openMLModal('models');
}

// При старте — восстановить последнюю сохранённую модель из IndexedDB
(async () => {
  if (_mlActiveId && _mlActiveId !== '__builtin__') {
    const model = await _MLModelDB.load(_mlActiveId);
    if (model) _mlActivateCode(model.code);
  }
})();

// Алиас для обратной совместимости
function openMLScanModal() { openMLModal('scan'); }

// ─── ML Feature Screening ─────────────────────────────────────────────────

function _mlscrPearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return 0;
  let sx=0,sy=0,sx2=0,sy2=0,sxy=0;
  for(let i=0;i<n;i++){sx+=xs[i];sy+=ys[i];sx2+=xs[i]*xs[i];sy2+=ys[i]*ys[i];sxy+=xs[i]*ys[i];}
  const num=n*sxy-sx*sy, den=Math.sqrt((n*sx2-sx*sx)*(n*sy2-sy*sy));
  return den>0?num/den:0;
}

function _mlscrVariance(xs) {
  const n=xs.length; if(n<2)return 0;
  let s=0,s2=0; for(let i=0;i<n;i++){s+=xs[i];s2+=xs[i]*xs[i];}
  return s2/n-(s/n)*(s/n);
}

function _mlscrLinFit(ys, xs) {
  const n=xs.length; let sx=0,sy=0,sxy=0,sx2=0;
  for(let i=0;i<n;i++){sx+=xs[i];sy+=ys[i];sxy+=xs[i]*ys[i];sx2+=xs[i]*xs[i];}
  const d=n*sx2-sx*sx;
  if(Math.abs(d)<1e-12)return{slope:0,intercept:sy/n};
  const slope=(n*sxy-sx*sy)/d;
  return{slope,intercept:(sy-slope*sx)/n};
}

function _mlscrGreedyR2(trades, featDefs, scores) {
  const totalVar=_mlscrVariance(scores);
  if(totalVar<=0)return[];
  const res=scores.slice();
  const selected=[], remaining=featDefs.map(fd=>({...fd}));
  for(let step=0;step<Math.min(8,remaining.length);step++){
    let bestC=0,bestRi=-1;
    for(let ri=0;ri<remaining.length;ri++){
      const fv=trades.map(t=>t.feat[remaining[ri].idx]);
      const c=_mlscrPearson(fv,res);
      if(Math.abs(c)>Math.abs(bestC)){bestC=c;bestRi=ri;}
    }
    if(bestRi<0||Math.abs(bestC)<0.04)break;
    const fd=remaining.splice(bestRi,1)[0];
    const fv=trades.map(t=>t.feat[fd.idx]);
    const {slope,intercept}=_mlscrLinFit(res,fv);
    for(let i=0;i<res.length;i++)res[i]-=slope*fv[i]+intercept;
    const cumR2=Math.min(1,Math.max(0,1-_mlscrVariance(res)/totalVar));
    selected.push({...fd,stepC:bestC,cumR2});
    if(cumR2>=0.95)break;
  }
  return selected;
}

function _mlscrOptThresh(trades, featIdx, dir, scoreThresh) {
  if(dir===0)return{thresh:NaN,f1:0,prec:0,rec:0,blocked:0};
  const vals=trades.map(t=>t.feat[featIdx]);
  const scores=trades.map(t=>t.score);
  const sorted=[...vals].sort((a,b)=>a-b);
  let bestF1=-1,bestThresh=sorted[0],bestPrec=0,bestRec=0,bestBlocked=0;
  for(let qi=2;qi<=22;qi++){
    const thresh=sorted[Math.floor(sorted.length*qi/24)];
    let tp=0,fp=0,fn=0,tn=0;
    for(let i=0;i<trades.length;i++){
      const pass=dir>0?vals[i]>=thresh:vals[i]<=thresh;
      const good=scores[i]>=scoreThresh;
      if(pass&&good)tp++;else if(pass&&!good)fp++;else if(!pass&&good)fn++;else tn++;
    }
    const prec=tp+fp>0?tp/(tp+fp):0,rec=tp+fn>0?tp/(tp+fn):1;
    const f1=prec+rec>0?2*prec*rec/(prec+rec):0;
    if(rec>=0.65&&f1>bestF1){bestF1=f1;bestThresh=thresh;bestPrec=prec;bestRec=rec;bestBlocked=fp+tn;}
  }
  return{thresh:bestThresh,f1:bestF1,prec:bestPrec,rec:bestRec,blocked:bestBlocked};
}

function _mlscrPairSynergy(trades, topFeats, scores) {
  const n=topFeats.length, totalVar=_mlscrVariance(scores);
  const indR2=topFeats.map(fd=>{
    const fv=trades.map(t=>t.feat[fd.idx]);
    const c=_mlscrPearson(fv,scores);
    return c*c;
  });
  const matrix=[];
  for(let i=0;i<n;i++){
    matrix[i]=[];
    for(let j=0;j<n;j++){
      if(i===j){matrix[i][j]=null;continue;}
      const fi=trades.map(t=>t.feat[topFeats[i].idx]);
      const fj=trades.map(t=>t.feat[topFeats[j].idx]);
      const {slope:si,intercept:ii}=_mlscrLinFit(scores,fi);
      const res_i=scores.map((s,k)=>s-si*fi[k]-ii);
      const cj=_mlscrPearson(fj,res_i);
      matrix[i][j]=Math.max(0,cj*cj*(1-indR2[i]));
    }
  }
  return{matrix,indR2,topFeats};
}

async function _mlscrCompareBt(cfg, ind, topRules, mlThresh) {
  const N=DATA.length;
  // Run with full ML model
  const mlArr=new Float32Array(N).fill(-1);
  for(let i=52;i<N;i++){const f=mlComputeFeatures(i);if(f)try{mlArr[i]=mlScore(f);}catch(e){mlArr[i]=0.5;}}
  const btML=buildBtCfg({...cfg,useMLFilter:false},ind);
  btML.mlScoresArr=mlArr;btML.mlThreshold=mlThresh;
  const rML=backtest(ind.pvLo,ind.pvHi,ind.atrArr,btML);
  await new Promise(r=>setTimeout(r,0));
  // Run with simple rules
  const rulesArr=new Float32Array(N).fill(-1);
  const activeRules=topRules.filter(fd=>fd.dir!==0&&fd.optThresh&&!isNaN(fd.optThresh.thresh));
  for(let i=52;i<N;i++){
    const f=mlComputeFeatures(i);
    if(!f){rulesArr[i]=-1;continue;}
    let pass=true;
    for(const fd of activeRules){
      const v=f[fd.idx];
      if(fd.dir>0&&v<fd.optThresh.thresh){pass=false;break;}
      if(fd.dir<0&&v>fd.optThresh.thresh){pass=false;break;}
    }
    rulesArr[i]=pass?1.0:0.0;
  }
  const btRules=buildBtCfg({...cfg,useMLFilter:false},ind);
  btRules.mlScoresArr=rulesArr;btRules.mlThreshold=0.5;
  const rRules=backtest(ind.pvLo,ind.pvHi,ind.atrArr,btRules);
  return{rML,rRules};
}

function _mlscrRender({trades,sorted,greedy,synergy,rNoML,rML,rRules,topRules,ML_THRESH,srcCfg,srcR_name}) {
  const n=trades.length;
  const nGood=trades.filter(t=>t.score>=ML_THRESH).length;
  const cc=v=>{const a=Math.abs(v);return a>=0.3?(v>0?'pos':'neg'):a>=0.15?'warn':'muted';};
  const r2c=v=>v>=0.8?'pos':v>=0.55?'warn':'neg';
  const fmtN=(v,d=1)=>isNaN(v)?'—':v.toFixed(d);
  const pRow=(label,r,cls='')=>{
    if(!r)return'';
    const pdd=r.dd>0?r.pnl/r.dd:0;
    return`<tr style="border-top:1px solid var(--border)">
      <td style="padding:4px 8px" class="${cls}">${label}</td>
      <td style="padding:4px 8px;text-align:center">${r.n}</td>
      <td style="padding:4px 8px;text-align:center">${Math.round(r.wr)}%</td>
      <td style="padding:4px 8px;text-align:center;color:${r.pnl>=0?'var(--pos)':'var(--neg)'}">${r.pnl>=0?'+':''}${fmtN(r.pnl,0)}%</td>
      <td style="padding:4px 8px;text-align:center">${fmtN(r.dd,1)}%</td>
      <td style="padding:4px 8px;text-align:center" class="${pdd>=5?'pos':pdd>=2?'warn':'neg'}">${fmtN(pdd,1)}</td>
    </tr>`;
  };

  let h=`<div style="display:grid;gap:18px">`;

  // Header
  h+=`<div style="background:var(--bg2);border-radius:6px;padding:10px 14px;display:grid;gap:6px;font-size:.82em">
    <div style="color:var(--fg3);font-size:.78em">Анализируется результат:</div>
    <div style="color:var(--fg);font-size:.8em;word-break:break-all">${srcR_name||'—'}</div>
    <div style="display:flex;gap:20px;flex-wrap:wrap;margin-top:2px">
      <span>📊 Сделок: <b>${n}</b></span>
      <span>✅ Хороших (≥${Math.round(ML_THRESH*100)}%): <b>${nGood}</b> (${Math.round(nGood/n*100)}%)</span>
      <span>📈 Данных: <b>${DATA.length}</b> баров</span>
    </div>
  </div>`;

  // 1. Feature rankings
  h+=`<div><h3 style="font-size:.8em;color:var(--fg2);text-transform:uppercase;letter-spacing:.06em;margin:0 0 8px">① Ранжирование признаков</h3>
  <table style="width:100%;border-collapse:collapse;font-size:.8em">
  <thead><tr style="color:var(--fg3);font-size:.75em">
    <th style="text-align:left;padding:3px 8px">Признак</th>
    <th style="padding:3px 6px" title="Корреляция с ML-оценкой">Corr(ML)</th>
    <th style="padding:3px 6px" title="Корреляция с реальным PnL сделки">Corr(PnL)</th>
    <th style="padding:3px 6px">Знак</th>
    <th style="padding:3px 6px">Порог</th>
    <th style="padding:3px 6px" title="% сделок заблокированных этим правилом">Блок%</th>
    <th style="padding:3px 6px" title="F1-мера правила">F1</th>
  </tr></thead><tbody>`;
  for(const fd of sorted){
    const t=fd.optThresh;
    const sign=fd.dir===0?'±':fd.dir>0?'≥':'≤';
    const blPct=n>0?Math.round(t.blocked/n*100):0;
    h+=`<tr style="border-top:1px solid var(--border)">
      <td style="padding:3px 8px" title="${fd.hint}">${fd.label}</td>
      <td style="padding:3px 6px;text-align:center" class="${cc(fd.corrScore)}">${(fd.corrScore>=0?'+':'')+fmtN(fd.corrScore,2)}</td>
      <td style="padding:3px 6px;text-align:center" class="${cc(fd.corrPnl)}">${(fd.corrPnl>=0?'+':'')+fmtN(fd.corrPnl,2)}</td>
      <td style="padding:3px 6px;text-align:center;color:var(--fg2)">${fd.dir===0?'±':sign}</td>
      <td style="padding:3px 6px;text-align:center;font-family:monospace">${fd.dir===0?'—':fmtN(t.thresh,3)}</td>
      <td style="padding:3px 6px;text-align:center;color:var(--fg2)">${fd.dir===0?'—':blPct+'%'}</td>
      <td style="padding:3px 6px;text-align:center" class="${t.f1>=0.7?'pos':t.f1>=0.5?'warn':'neg'}">${fd.dir===0?'—':fmtN(t.f1,2)}</td>
    </tr>`;
  }
  h+=`</tbody></table></div>`;

  // 2. Greedy R²
  h+=`<div><h3 style="font-size:.8em;color:var(--fg2);text-transform:uppercase;letter-spacing:.06em;margin:0 0 8px">② Жадный отбор — сколько признаков нужно</h3>
  <table style="width:100%;border-collapse:collapse;font-size:.8em">
  <thead><tr style="color:var(--fg3);font-size:.75em">
    <th style="padding:3px 6px">#</th>
    <th style="text-align:left;padding:3px 8px">Признак</th>
    <th style="padding:3px 6px">+R²</th>
    <th style="padding:3px 6px">Кум. R²</th>
    <th style="padding:3px 6px">Покрытие</th>
    <th style="text-align:left;padding:3px 8px">Правило</th>
  </tr></thead><tbody>`;
  let prevR2=0;
  for(let i=0;i<greedy.length;i++){
    const g=greedy[i];
    const stepR2=g.cumR2-prevR2;
    const hit90=g.cumR2>=0.90&&prevR2<0.90;
    const hit80=g.cumR2>=0.80&&prevR2<0.80;
    const hl=hit90?'background:rgba(100,220,130,.07)':hit80?'background:rgba(220,180,50,.05)':'';
    const sign=g.dir===0?'':g.dir>0?'≥':'≤';
    const thresh=g.dir===0?'—':(g.optThresh&&!isNaN(g.optThresh.thresh)?`${sign} ${fmtN(g.optThresh.thresh,3)}`:'—');
    h+=`<tr style="border-top:1px solid var(--border);${hl}">
      <td style="padding:3px 6px;text-align:center;color:var(--fg3)">${i+1}</td>
      <td style="padding:3px 8px">${g.label}${hit90?' <span style="color:var(--pos);font-size:.75em">← 90%</span>':hit80?' <span style="color:var(--warn);font-size:.75em">← 80%</span>':''}</td>
      <td style="padding:3px 6px;text-align:center;color:var(--pos)">+${(stepR2*100).toFixed(1)}%</td>
      <td style="padding:3px 6px;text-align:center" class="${r2c(g.cumR2)}"><b>${(g.cumR2*100).toFixed(1)}%</b></td>
      <td style="padding:3px 6px;min-width:80px">
        <div style="background:var(--border);border-radius:3px;height:5px">
          <div style="background:var(--pos);border-radius:3px;height:5px;width:${(g.cumR2*100).toFixed(0)}%"></div>
        </div>
      </td>
      <td style="padding:3px 8px;font-family:monospace;font-size:.82em;color:var(--fg2)">${thresh}</td>
    </tr>`;
    prevR2=g.cumR2;
  }
  h+=`</tbody></table></div>`;

  // 3. Pairwise synergy
  const{matrix,indR2,topFeats}=synergy;
  h+=`<div><h3 style="font-size:.8em;color:var(--fg2);text-transform:uppercase;letter-spacing:.06em;margin:0 0 4px">③ Синергия пар (топ-5)</h3>
  <p style="font-size:.75em;color:var(--fg3);margin:0 0 8px">Прирост R² при добавлении столбца к строке. Зелёный = взаимодополняющие.</p>
  <table style="border-collapse:collapse;font-size:.78em">
  <thead><tr><th style="padding:3px 6px"></th>`;
  for(const fd of topFeats)h+=`<th style="padding:3px 8px;color:var(--fg2);font-size:.82em;max-width:90px;overflow:hidden;white-space:nowrap" title="${fd.label}">${fd.label.substring(0,11)}</th>`;
  h+=`</tr></thead><tbody>`;
  for(let i=0;i<topFeats.length;i++){
    h+=`<tr><td style="padding:3px 8px;color:var(--fg2);font-size:.82em;white-space:nowrap" title="${topFeats[i].label}">${topFeats[i].label.substring(0,11)}</td>`;
    for(let j=0;j<topFeats.length;j++){
      if(i===j){h+=`<td style="padding:3px 8px;text-align:center;color:var(--fg3)">—</td>`;}
      else{
        const v=matrix[i][j];
        const cls=v>=0.08?'pos':v>=0.03?'warn':'muted';
        h+=`<td style="padding:3px 8px;text-align:center" class="${cls}">+${(v*100).toFixed(0)}%</td>`;
      }
    }
    h+=`</tr>`;
  }
  h+=`</tbody></table></div>`;

  // 4. Comparison
  const ruleNames=topRules.filter(r=>r.dir!==0).map(r=>r.label.substring(0,10)).join(', ');
  const nRules=topRules.filter(r=>r.dir!==0).length;
  let covTxt='';
  if(rML&&rNoML&&rRules){
    const mlGain=rML.pnl-rNoML.pnl;
    const rulesGain=rRules.pnl-rNoML.pnl;
    if(mlGain>0.5){
      const cov=Math.round(rulesGain/mlGain*100);
      const verdict=cov>=85?' ✅ гипотеза подтверждена':cov>=65?' ⚠️ частично':' ❌ недостаточно';
      covTxt=`<tr><td colspan="6" style="padding:6px 8px;font-size:.8em;color:var(--fg2);border-top:2px solid var(--border)">
        💡 <b>${nRules} простых правил</b> дают <b style="color:${cov>=85?'var(--pos)':cov>=65?'var(--warn)':'var(--neg)'}">${cov}%</b> эффекта ML по приросту PnL${verdict}
      </td></tr>`;
    }
  }
  h+=`<div><h3 style="font-size:.8em;color:var(--fg2);text-transform:uppercase;letter-spacing:.06em;margin:0 0 8px">④ Сравнение подходов (полные данные)</h3>
  <table style="width:100%;border-collapse:collapse;font-size:.8em">
  <thead><tr style="color:var(--fg3);font-size:.75em">
    <th style="text-align:left;padding:3px 8px">Подход</th>
    <th style="padding:3px 6px">Сделок</th>
    <th style="padding:3px 6px">WR%</th>
    <th style="padding:3px 6px">PnL%</th>
    <th style="padding:3px 6px">DD%</th>
    <th style="padding:3px 6px">P/DD</th>
  </tr></thead><tbody>
  ${pRow('Без фильтра',rNoML)}
  ${pRow('ML модель',rML,'pos')}
  ${pRow(`${nRules} правил (${ruleNames})`,rRules,'warn')}
  ${covTxt}
  </tbody></table></div>`;

  h+=`</div>`;
  return h;
}

async function runMLFeatureScreening() {
  const modal=$('ml-screening-modal');
  const body=$('ml-screening-body');
  if(!modal)return;
  if(typeof mlModelLoaded!=='function'||!mlModelLoaded()){
    body.innerHTML='<p style="color:var(--neg);padding:20px">❌ ML модель не загружена. Сначала загрузите модель в разделе ML.</p>';
    modal.style.display='flex';return;
  }
  if(!DATA||DATA.length<100){
    body.innerHTML='<p style="color:var(--neg);padding:20px">❌ Нет данных.</p>';
    modal.style.display='flex';return;
  }
  body.innerHTML='<div style="text-align:center;padding:60px;color:var(--fg2)">⏳ Собираю точки входа и вычисляю ML признаки…</div>';
  modal.style.display='flex';
  await new Promise(r=>setTimeout(r,20));
  try{
    // Get cfg from selected result or first visible
    const srcR=_tvCmpCurrentResult??_visibleResults?.[0]??null;
    if(!srcR?.cfg){
      body.innerHTML='<p style="color:var(--warn);padding:20px">⚠️ Нет выбранного результата. Нажмите на строку результата чтобы открыть детали, затем запустите скрининг кнопкой внизу панели.</p>';
      return;
    }
    // Показываем имя результата сразу чтобы пользователь видел что анализируется
    body.innerHTML=`<div style="text-align:center;padding:40px;color:var(--fg2)">
      ⏳ Анализирую: <b style="color:var(--fg)">${(srcR.name||'результат').substring(0,80)}</b><br>
      <small style="color:var(--fg3)">Собираю точки входа и вычисляю ML признаки…</small>
    </div>`;
    await new Promise(r=>setTimeout(r,20));
    const cfg={...srcR.cfg,useMLFilter:false};
    // Run backtest on full DATA without ML filter, collect trade entries + pnl
    const ind=_calcIndicators(cfg);
    const btCfg=buildBtCfg(cfg,ind);
    btCfg.useMLFilter=false;btCfg.collectTrades=true;btCfg.tradeLog=[];
    const rNoML=backtest(ind.pvLo,ind.pvHi,ind.atrArr,btCfg);
    const trLog=btCfg.tradeLog||[];
    const trPnl=rNoML?.tradePnl||[];
    const nMin=Math.min(trLog.length,trPnl.length);
    if(nMin<15){
      body.innerHTML=`<p style="color:var(--neg);padding:20px">❌ Мало сделок (${nMin}). Нужно ≥ 15. Выберите результат с большим количеством сделок.</p>`;
      return;
    }
    // Compute features + scores per trade entry
    const trades=[];
    for(let ti=0;ti<nMin;ti++){
      const t=trLog[ti];
      const feat=mlComputeFeatures(t.entryBar);
      if(!feat)continue;
      let score;try{score=mlScore(feat);}catch(e){continue;}
      if(isNaN(score))continue;
      trades.push({bar:t.entryBar,dir:t.dir,feat,score,pnl:trPnl[ti]??0});
    }
    if(trades.length<10){
      body.innerHTML=`<p style="color:var(--neg);padding:20px">❌ Недостаточно точек (${trades.length}) после вычисления признаков (нужно bar≥52).</p>`;
      return;
    }
    await new Promise(r=>setTimeout(r,0));
    const ML_THRESH=parseFloat($('c_ml_thresh')?.value)||0.55;
    const FDEFS=[
      {id:'wick',  label:'Нижний хвост/ATR', idx:26,dir:+1,hint:'Сила отбоя на пивоте (выше → лучше для лонга)'},
      {id:'rsi',   label:'RSI(14)',           idx:23,dir:-1,hint:'Перепроданность (ниже → лучше)'},
      {id:'chan',  label:'Позиция в канале',   idx:30,dir:-1,hint:'0=дно 20-бар канала, 1=вершина'},
      {id:'ema50', label:'Откат EMA50/ATR',    idx:25,dir:+1,hint:'Насколько цена ниже EMA50 (>0 = ниже EMA)'},
      {id:'ema20', label:'Откат EMA20/ATR',    idx:24,dir:+1,hint:'Насколько цена ниже EMA20'},
      {id:'body',  label:'Тело пивота/ATR',    idx:27,dir:-1,hint:'Меньше тело → молоткообразная свеча'},
      {id:'streak',label:'Серия падений/10',   idx:29,dir:+1,hint:'Подряд медвежьих закрытий (капитуляция)'},
      {id:'er',    label:'Eff.Ratio (10б)',    idx:20,dir:-1,hint:'Ниже ER → более разворотный рынок'},
      {id:'atr_r', label:'ATR режим',          idx:28,dir: 0,hint:'Текущий ATR vs 50-бар среднего (нелинейный)'},
      {id:'slope', label:'Наклон LR(20)/ATR',  idx:31,dir:-1,hint:'Отрицательный наклон → нисходящий тренд'},
      {id:'bb_w',  label:'Ширина BB',          idx:32,dir:+1,hint:'Шире → расширение, уже → сжатие'},
      {id:'vol',   label:'Объём/средний(20)',  idx:21,dir:+1,hint:'> 1 = объём выше среднего'},
    ];
    // Correlations
    const scoreArr=trades.map(t=>t.score);
    const pnlArr=trades.map(t=>t.pnl);
    for(const fd of FDEFS){
      const fv=trades.map(t=>t.feat[fd.idx]);
      fd.corrScore=_mlscrPearson(fv,scoreArr);
      fd.corrPnl=_mlscrPearson(fv,pnlArr);
      fd.optThresh=_mlscrOptThresh(trades,fd.idx,fd.dir,ML_THRESH);
    }
    const sorted=[...FDEFS].sort((a,b)=>Math.abs(b.corrScore)-Math.abs(a.corrScore));
    const greedy=_mlscrGreedyR2(trades,FDEFS,scoreArr);
    // Top features for synergy + comparison (up to first ≥90% R², min 3, max 6)
    let topN=greedy.findIndex(g=>g.cumR2>=0.90);
    if(topN<0)topN=greedy.length;else topN++;
    topN=Math.max(3,Math.min(6,topN));
    const topRules=greedy.slice(0,topN);
    const synergy=_mlscrPairSynergy(trades,sorted.slice(0,5),scoreArr);
    body.innerHTML='<div style="text-align:center;padding:40px;color:var(--fg2)">⏳ Запускаю сравнительные бэктесты…</div>';
    await new Promise(r=>setTimeout(r,0));
    const{rML,rRules}=await _mlscrCompareBt(cfg,ind,topRules,ML_THRESH);
    body.innerHTML=_mlscrRender({trades,sorted,greedy,synergy,rNoML,rML,rRules,topRules,ML_THRESH,srcCfg:srcR.cfg,srcR_name:srcR.name||''});
  }catch(e){
    console.error('[MLScreening]',e);
    body.innerHTML=`<div style="color:var(--neg);padding:20px">❌ Ошибка: ${e.message}</div>`;
  }
}
try{window.runMLFeatureScreening=runMLFeatureScreening;}catch(e){}
