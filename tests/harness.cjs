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
    requestAnimationFrame: (fn) => fn(0),
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

module.exports = { createCoreCtx, createOptCtx, createPineCtx };
