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


/* ##TABLE## */

/* ##DETAIL## */

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
  const _freeAllCaches = () => {
    try { _freeRobCache(); } catch(_) {}
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith('robSurrogate_') || k.startsWith('use6_csv_'))
        .forEach(k => localStorage.removeItem(k));
    } catch(_) {}
  };
  try {
    await _write();
  } catch(e) {
    if (_isQuota(e)) {
      _freeAllCaches();
      try { await _write(); }
      catch(e2) {
        console.warn('[storeSave] quota exceeded after cleanup:', key, e2.message);
        if (typeof showTplToast === 'function') showTplToast('⚠️ Не удалось сохранить — нет места в localStorage');
      }
    } else {
      console.warn('[storeSave] ошибка сохранения:', key, e.message);
      if (typeof showTplToast === 'function') showTplToast('⚠️ Ошибка сохранения: ' + e.message);
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
// Web Worker работает в отдельном OS-потоке и доставляет сообщения через IPC
// браузера — этот канал НЕ подпадает под "intensive throttling" Chrome 86+,
// который тормозит MessageChannel/setTimeout в скрытых вкладках до 1 сек/1 мин.
// Это позволяет TPE, очереди задач и тестам устойчивости работать в фоне.
//
// ВАЖНО: onmessage — один слот. Если два корутина одновременно вызовут
// yieldToUI(), второй перезапишет первый callback → первый зависнет навсегда.
// Решение: очередь резолверов. Каждый postMessage обслуживает одного ожидающего.
const _yieldQueue = [];
const _yieldWorker = new Worker(URL.createObjectURL(
  new Blob(['self.onmessage=()=>self.postMessage(0)'], {type:'application/javascript'})
));
_yieldWorker.onmessage = () => { const cb = _yieldQueue.shift(); if (cb) cb(); };
function yieldToUI() {
  return new Promise(res => { _yieldQueue.push(res); _yieldWorker.postMessage(0); });
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

/* ##FAVS## */

/* ##ROBUST## */

/* ##PARSE## */
/* ##EQUITY## */
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
  // Используем drawEquityForResult для обоих режимов, чтобы baseline всегда отображался
  drawEquityForResult(r);

  // Показываем контролы baseline если есть данные MA Equity Filter
  const baselineCtrl = $('eq-baseline-controls');
  if (baselineCtrl) {
    if (r.eqCalcMAArr && r.eqCalcMAArr.length) {
      baselineCtrl.style.display = 'flex';
    } else {
      baselineCtrl.style.display = 'none';
    }
  }
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

/* ##RESEARCH_UI## */
