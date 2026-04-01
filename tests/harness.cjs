'use strict';
/**
 * tests/harness.cjs
 * Загружает source-файлы (core.js, registries, opt.js, pine_export.js)
 * в изолированный vm-контекст с нужными глобалами.
 *
 * Использование:
 *   const { createCoreCtx, createOptCtx, createPineCtx } = require('./harness.cjs');
 *   const ctx = createCoreCtx(myDataArray);
 *   ctx.DATA = [...];
 *   const result = ctx.calcEMA([1,2,3,4,5], 3);
 */
const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function readSrc(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

/** Базовый контекст с браузерными заглушками */
function baseContext(data) {
  return {
    // Стандартные JS-глобалы
    Float32Array, Float64Array, Float64Array, Uint8Array, Int32Array,
    Math, console, Array, Object, Promise, Map, Set, WeakMap,
    isNaN, isFinite, parseInt, parseFloat, Number, String, Boolean,
    JSON, Error, TypeError, RangeError,
    setTimeout: (fn) => fn(),  // синхронные заглушки
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    performance: { now: () => Date.now() },

    // Приложение-глобалы
    DATA: data || [],
    NEW_DATA: null,
    HAS_VOLUME: true,
    results: [],
    favourites: {},
    equities: {},
    stopped: false,
    paused: false,

    // UI-заглушки (нужны opt.js, ui.js)
    $:  (id) => null,
    $v: (id) => '',
    $c: (id) => false,
    $n: (id) => 0,
    document: { getElementById: () => null, querySelectorAll: () => [] },
    window:   {},
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    indexedDB: null,

    // Вспомогательные функции которые иногда вызываются при инициализации
    requestAnimationFrame: () => 0,  // НЕ вызываем fn — иначе RAF-цикл → stack overflow
    cancelAnimationFrame: () => {},
  };
}

/**
 * После загрузки источников — экспортируем const/let переменные на globalThis,
 * чтобы они были доступны как ctx.FOO из Node.js кода вне vm.
 * (В vm-контексте const/let не становятся свойствами context-объекта автоматически.)
 */
const EXPOSE_SCRIPT = `
(function _expose() {
  // Registries (const в registry-файлах)
  var _names = [
    'FILTER_REGISTRY','ENTRY_REGISTRY','EXIT_REGISTRY','SL_REGISTRY','TP_REGISTRY',
  ];
  _names.forEach(function(n) {
    try { if (typeof eval(n) !== 'undefined') globalThis[n] = eval(n); } catch(e) {}
  });
  // Метрики и утилиты из opt.js section A (тоже function-декларации, уже на globalThis)
  // Индикаторы из core.js — function-декларации, уже на globalThis
})();
`;

/**
 * createCoreCtx(data?)
 * Загружает: registries + core.js
 * Доступны: calcEMA, calcSMA, calcATR, backtest, FILTER_REGISTRY, ENTRY_REGISTRY...
 */
function createCoreCtx(data) {
  const ctx = vm.createContext(baseContext(data));
  const files = [
    'filter_registry.js',
    'entry_registry.js',
    'exit_registry.js',
    'sl_tp_registry.js',
    'core.js',
  ];
  for (const f of files) {
    try {
      vm.runInContext(readSrc(f), ctx, { filename: f });
    } catch (e) {
      throw new Error(`Harness: ошибка загрузки ${f}: ${e.message}`);
    }
  }
  // Экспортируем const-переменные registries на globalThis контекста
  vm.runInContext(EXPOSE_SCRIPT, ctx);
  return ctx;
}

/**
 * createOptCtx(data?)
 * Загружает: registries + core.js + opt.js (SECTION_A — метрики и parseRange)
 * Доступны всё из createCoreCtx + _calcGTScore, _calcStatSig, _calcCVR, _calcKRatio...
 */
function createOptCtx(data) {
  const ctx = createCoreCtx(data);
  // Загружаем SECTION_A + SECTION_B (метрики + оптимизатор), но не C/D (массовый rob — UI-зависим)
  const optFull = readSrc('opt.js');
  const markerC = '// ##SECTION_C##';
  const cutoff  = optFull.indexOf(markerC);
  const optA    = cutoff > 0 ? optFull.slice(0, cutoff) : optFull;
  try {
    vm.runInContext(optA, ctx, { filename: 'opt.js (section A)' });
  } catch (e) {
    throw new Error(`Harness: ошибка загрузки opt.js section A: ${e.message}`);
  }
  return ctx;
}

/**
 * createPineCtx(data?)
 * Загружает: registries + core.js + pine_export.js
 * Доступны: generatePineScript, generatePineStrategy
 */
function createPineCtx(data) {
  const ctx = createCoreCtx(data);
  try {
    vm.runInContext(readSrc('pine_export.js'), ctx, { filename: 'pine_export.js' });
  } catch (e) {
    throw new Error(`Harness: ошибка загрузки pine_export.js: ${e.message}`);
  }
  return ctx;
}

/**
 * createUICtx(data?)
 * Загружает полный ui.js (с подстановкой ##-маркеров как в build.py).
 * Доступны все функции ui.js: parseTextToSettings, _hcMetric, _hcCluster,
 * _calcDDFromEq, _mlscrPearson, _parseCSVtoArray, _parseListOfTrades, и др.
 *
 * DOMContentLoaded/load-хендлеры регистрируются но НЕ запускаются —
 * document.addEventListener является заглушкой () => {}.
 */
function createUICtx(data) {
  const noop = () => {};
  const domEl = () => ({
    value: '', checked: false, textContent: '', innerHTML: '',
    style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: noop, removeEventListener: noop,
    appendChild: noop, remove: noop,
  });

  const base = baseContext(data);
  // Расширяем document и window чтобы принимали addEventListener без краша
  base.document = {
    getElementById:     () => null,
    querySelector:      () => null,
    querySelectorAll:   () => [],
    createElement:      () => domEl(),
    createElementNS:    () => domEl(),
    addEventListener:   noop,
    removeEventListener: noop,
    head:  { appendChild: noop },
    body:  { appendChild: noop, style: {} },
  };
  base.window = {
    addEventListener:   noop,
    removeEventListener: noop,
    location: { href: '' },
    onerror: null,
  };
  // Дополнительные браузерные API, которые ui.js может использовать на верхнем уровне
  base.AudioContext = function() { return { createOscillator: () => ({ connect: noop, start: noop, stop: noop, frequency: { setValueAtTime: noop }, type: '' }), createGain: () => ({ connect: noop, gain: { setValueAtTime: noop, exponentialRampToValueAtTime: noop } }), currentTime: 0, destination: {} }; };
  base.Worker        = function() { return { postMessage: noop, terminate: noop, addEventListener: noop }; };
  base.URL           = { createObjectURL: () => '', revokeObjectURL: noop };
  base.Blob          = function() { return {}; };
  base.MessageChannel = function() { return { port1: { onmessage: null, postMessage: noop }, port2: { onmessage: null, postMessage: noop } }; };
  base.crypto        = { getRandomValues: (arr) => { for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256); return arr; } };

  const ctx = vm.createContext(base);

  // ── Подставляем ##-маркеры как build.py ──────────────────────────────────
  const REGISTRY_FILES = [
    'entry_registry.js', 'filter_registry.js',
    'exit_registry.js',  'sl_tp_registry.js',
  ];
  const registries = REGISTRY_FILES.map(f => readSrc(f)).join('\n');

  const optFull = readSrc('opt.js');
  const SEC = ['// ##SECTION_A##\n', '// ##SECTION_B##\n', '// ##SECTION_C##\n', '// ##SECTION_D##\n'];
  const iA = optFull.indexOf(SEC[0]) + SEC[0].length;
  const iB = optFull.indexOf(SEC[1]);
  const iC = optFull.indexOf(SEC[2]);
  const iD = optFull.indexOf(SEC[3]);
  const optA = optFull.slice(iA, iB).trimEnd();
  const optB = optFull.slice(iB + SEC[1].length, iC).trimEnd();
  const optC = optFull.slice(iC + SEC[2].length, iD).trimEnd();
  const optD = optFull.slice(iD + SEC[3].length).trimEnd();

  const HDR_END = '// ============================================================\n\n';
  const coreFull = readSrc('core.js');
  const coreCode = coreFull.slice(coreFull.lastIndexOf(HDR_END) + HDR_END.length).trimEnd();

  let uiCode = readSrc('ui.js');
  uiCode = uiCode.replace('/* ##REGISTRIES## */', registries);
  uiCode = uiCode.replace('/* ##OPT_A## */', optA);
  uiCode = uiCode.replace('/* ##CORE## */',  coreCode);
  uiCode = uiCode.replace('/* ##OPT_B## */', optB);
  uiCode = uiCode.replace('/* ##OPT_C## */', optC);
  uiCode = uiCode.replace('/* ##OPT_D## */', optD);
  uiCode = uiCode.replace('/* ##HC## */',   readSrc('ui_hc.js'));
  uiCode = uiCode.replace('/* ##ML_UI## */',    readSrc('ui_ml.js'));
  uiCode = uiCode.replace('/* ##HEATMAP## */',  readSrc('ui_heatmap.js'));
  uiCode = uiCode.replace('/* ##PROJECTS## */', readSrc('ui_projects.js'));

  try {
    vm.runInContext(uiCode, ctx, { filename: 'ui.js' });
  } catch (e) {
    throw new Error(`Harness createUICtx: ошибка загрузки ui.js: ${e.message}\n  at line ~${e.stack}`);
  }

  // Экспортируем let/const верхнего уровня ui.js на globalThis контекста
  vm.runInContext(`
    (function _exposeUI() {
      var names = [
        'CFG_HTML_MAP','_TF_NUM_IDS','_TF_SEL_IDS','_COL_DEFS','_OOS_COL_DEFS',
        'fmtSec','_calcDDFromEq','_parseCSVtoArray','_parseListOfTrades',
        '_hcMetric','_hcCluster','_gaCrossover','_gaMutate',
        '_mlscrPearson','_mlscrVariance','_mlscrLinFit','_mlscrGreedyR2',
        'parseTextToSettings','_oosGetBadge','_getOOSSortVal',
        '_normTime','parseCSV','_mergeMultiResults',
      ];
      names.forEach(function(n) {
        try { if (typeof eval(n) !== 'undefined') globalThis[n] = eval(n); } catch(e) {}
      });
    })();
  `, ctx);

  return ctx;
}

module.exports = { createCoreCtx, createOptCtx, createPineCtx, createUICtx };
