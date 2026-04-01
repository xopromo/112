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
  _checkMSCConfig(); // apply Market Structure Comparator config if present

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
      `<button class="tpl-btn2" style="padding:3px 10px;font-size:.85em;border-color:#fbbf24;color:#fbbf24" onclick="openOOSDiagnostic()">🔍 OOS Диагностика</button>`+
      (_tableMode === 'oos' && NEW_DATA && NEW_DATA.length ? `<button class="tpl-btn2" style="padding:3px 10px;font-size:.85em;border-color:#c792ea;color:#c792ea" onclick="showOOSTradeDiag(${_oosTableResults.indexOf(r)})">🔬 Диагностика расхождений</button>` : '')+
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
  // ── Адаптивные TP/SL (по волатильности) ────────────────────────────────────
  useAdaptiveTP:  {id:'x_adaptive_tp',   type:'chk'},
  tpAtrLen:       {id:'x_tp_atr_len',    type:'val'},
  tpAtrMult:      {id:'x_tp_atr_mult',   type:'val'},
  useAdaptiveSL:  {id:'x_adaptive_sl',   type:'chk'},
  slAtrLen:       {id:'x_sl_atr_len',    type:'val'},
  slAtrMult:      {id:'x_sl_atr_mult',   type:'val'},
  useDynSLStruct: {id:'x_dynsl',         type:'chk'},
  dynSLStructMult:{id:'x_dynsl_m',       type:'val'},
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
let _pineMode = 'indicator'; // текущий режим: 'indicator' | 'strategy'

function openPineModal() {
  if (!_robustResult) { alert('Сначала откройте детали результата'); return; }
  _pineMode = 'indicator';
  _renderPineModal();
  $('pine-overlay').classList.add('open');
}

function switchPineTab(mode) {
  _pineMode = mode;
  _renderPineModal();
}

function _renderPineModal() {
  const r = _robustResult;
  if (!r) return;
  if (typeof generatePineScript !== 'function') {
    alert('Генератор Pine Script не загружен (pine_export.js)'); return;
  }
  const isStrategy = _pineMode === 'strategy';
  const code = isStrategy ? generatePineStrategy(r) : generatePineScript(r);
  $('pine-code').value = code;
  $('pine-desc').textContent = isStrategy
    ? `Стратегия: ${r.name}  ·  Использует strategy.exit(stop, limit) — точное исполнение SL/TP`
    : `Индикатор: ${r.name}  ·  PnL ${r.pnl.toFixed(1)}%  WR ${r.wr.toFixed(1)}%  Сделок ${r.n}  DD ${r.dd.toFixed(1)}%`;
  const tabInd = $('pine-tab-indicator');
  const tabStr = $('pine-tab-strategy');
  if (tabInd) {
    tabInd.style.background = isStrategy ? 'var(--bg2)' : '#c792ea';
    tabInd.style.color = isStrategy ? 'var(--text2)' : '#000';
    tabInd.style.borderColor = isStrategy ? 'var(--border)' : '#c792ea';
  }
  if (tabStr) {
    tabStr.style.background = isStrategy ? '#c792ea' : 'var(--bg2)';
    tabStr.style.color = isStrategy ? '#000' : 'var(--text2)';
    tabStr.style.borderColor = isStrategy ? '#c792ea' : 'var(--border)';
  }
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
      if (_tableMode === 'fav') {
        favourites[fi].level = 1; // в режиме Избранные — цикл 1→2→3→1, не удалять
      } else {
        favourites.splice(fi, 1); // убрать из избранного
      }
    } else {
      favourites[fi].level = cur + 1; // повысить уровень
    }
  } else {
    const favEntry = { name:r.name, ns:_favNs, level: startLevel || 1, stats:{
      pnl:r.pnl, wr:r.wr, n:r.n, dd:r.dd, pdd:r.pdd,
      dwr:r.dwr||0, avg:r.avg||0, p1:r.p1||0, p2:r.p2||0, c1:r.c1||0, c2:r.c2||0,
      nL:r.nL||0, pL:r.pL||0, wrL:r.wrL, nS:r.nS||0, pS:r.pS||0, wrS:r.wrS, dwrLS:r.dwrLS,
      sig:r.sig, gt:r.gt, cvr:r.cvr, upi:r.upi,
      sortino:r.sortino, kRatio:r.kRatio, sqn:r.sqn,
      omega:r.omega, pain:r.pain, burke:r.burke, serenity:r.serenity, ir:r.ir,
      cpcvScore:r.cpcvScore,
      eq:r.eq,
      old_eq:r.old_eq, new_eq:r.new_eq, // для полного OOS графика в режиме Избранное
      robScore:r.robScore, robMax:r.robMax, robDetails:r.robDetails
    }, cfg:r.cfg, ts:Date.now() };
    favourites.push(favEntry);
    // Асинхронно запустить быстрый тест устойчивости для нового избранного
    _autoRunRobustForFav(favEntry);
  }
  storeSave(_favKey(), favourites);
  renderFavBar();
  _refreshFavStars();
}

// Запускает быстрый тест устойчивости для добавленного в Избранное результата
async function _autoRunRobustForFav(favEntry) {
  if (!favEntry || !favEntry.cfg) return;
  // Не запускаем если уже есть тест
  if (favEntry.stats.robScore !== undefined) return;

  try {
    const { score: robScore, details: robDetails } = await runRobustScoreForDetailed(
      { cfg: favEntry.cfg },
      ['oos', 'walk', 'param'],
      true // fastMode
    );
    // Сохраняем результаты теста
    favEntry.stats.robScore = robScore;
    favEntry.stats.robMax = 3; // 3 теста: oos(1) + walk(1) + param(1)
    favEntry.stats.robDetails = robDetails;
    storeSave(_favKey(), favourites);
    // Обновляем отображение если открыт режим Избранные
    if (_tableMode === 'fav') renderVisibleResults();
  } catch(e) {
    console.error('[_autoRunRobustForFav]', e);
  }
}
// Удалить из избранного по имени (для кнопки ✕ в режиме Избранные)
function removeFavByName(name, event) {
  if (event) event.stopPropagation();
  const fi = favourites.findIndex(f => f.name === name && (f.ns||'') === _favNs);
  if (fi >= 0) {
    favourites.splice(fi, 1);
    storeSave(_favKey(), favourites);
    renderFavBar();
    _refreshFavStars();
  }
}

// Добавить в избранное из OOS таблицы (уровень 2 — проверено на новых данных)
function toggleOOSFav(idx, event) {
  if (event) event.stopPropagation();
  const r = _oosTableResults[idx];
  if (!r) return;
  // Не сохраняем если бэктест на исходных данных упал — pnl/wr/dd будут null
  if (r.pnl == null || r.wr == null || r.dd == null) return;
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
  // ── РЕЖИМ -1: Comparator JSON формат ({apply:{...}, hints:[...], meta:{...}}) ──
  try {
    const _cmpJson = JSON.parse(text.trim());
    if (_cmpJson && _cmpJson.apply && typeof _cmpJson.apply === 'object') {
      const ch = [];
      Object.entries(_cmpJson.apply).forEach(([id, val]) => {
        const type  = typeof val === 'boolean' ? 'chk' : 'val';
        const value = typeof val === 'boolean' ? val : String(val);
        ch.push({ id, value, type, label: `${id}=${val}` });
      });
      if (ch.length) return ch;
    }
  } catch(e) { /* not comparator JSON, fall through */ }

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
  if (!canvas) return;
  // Сохраняем позицию скролла — браузер может прыгнуть к canvas при display:none→block
  const _scrollEl = document.querySelector('.tbl-scroll') || document.documentElement;
  const _scrollY = window.scrollY;
  const _scrollT = _scrollEl.scrollTop;
  if (wrap) wrap.style.display = 'block';
  canvas.style.display='block';
  document.body.classList.add('chart-active');
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

  // Если результат из OOS (имеет old_eq и new_eq), рисуем полный OOS график
  if (r.old_eq && r.old_eq.length && r.new_eq && r.new_eq.length) {
    _drawOOSGraphicForResult(r);
    return;
  }

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

// Рисует полный OOS график (история + новые данные) для избранных результатов
function _drawOOSGraphicForResult(r) {
  const canvas = document.getElementById('eqc');
  if (!canvas) return;

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
}



/* ##TVCOMPARE## */
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

  // В OOS режиме показываем OOS график, а не основной
  if (_tableMode === 'oos') {
    const r = _visibleResults[idx];
    if (!r) return;
    // Найдём индекс в _oosTableResults (глобальный индекс для drawOOSChart)
    const globalIdx = _oosTableResults.indexOf(r);
    if (globalIdx >= 0) {
      const rowEl = document.querySelector(`#oos-rtbl tr[data-i="${globalIdx}"]`);
      drawOOSChart(globalIdx, rowEl);
      // Прокручиваем строку в видимую область OOS таблицы
      if (rowEl) {
        const oosTblWrap = document.getElementById('oos-tbl-wrap');
        if (oosTblWrap) {
          const trTop    = rowEl.offsetTop;
          const trBottom = trTop + rowEl.offsetHeight;
          const visTop   = oosTblWrap.scrollTop;
          const visBot   = visTop + oosTblWrap.clientHeight;
          if (trTop < visTop + 40)         oosTblWrap.scrollTop = trTop - 40;
          else if (trBottom > visBot - 10) oosTblWrap.scrollTop = trBottom - oosTblWrap.clientHeight + 10;
        }
      }
    }
    return;
  }

  // Обновляем выделение в основной таблице
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
    robDetails: f.stats.robDetails,
    old_eq: f.stats.old_eq, new_eq: f.stats.new_eq // полный график из OOS
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

/* ##QUEUE## */

/* ##HC## */

/* ##OOS## */

/* ##HEATMAP## */


/* ##PROJECTS## */

/* ##ML_UI## */



/* ##COMPARATOR## */
