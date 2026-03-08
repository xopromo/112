// ============================================================
// pine_check.js — валидация покрытия и корректности Pine-экспорта
// Запуск: node test/pine_check.js
//
// Тест A — Структурный: all_filt_l/s содержит переменные для всех
//           экспортируемых фильтров; f_tf_str определён до первого вызова
// Тест B — Покрытие:    PINE_EXPORTED_FILTERS в pine_export.js соответствует
//           флагам в FILTER_REGISTRY (нет пропущенных, нет лишних)
// Тест C — Параметры:   значения из конфига попадают в Pine-код корректно
// ============================================================
'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');
const root = path.join(__dirname, '..');

// ── Мок браузерных глобалей ──────────────────────────────────
global.DATA       = [];
global.HAS_VOLUME = false;
global.equities   = {};
global.results    = [];
global.favourites = [];
global.stopped    = false;
global.paused     = false;
global.document   = { getElementById: () => ({ value: '', checked: false }) };
global.$          = () => ({ value: '', checked: false, textContent: '', innerHTML: '' });
global.$v         = () => '';
global.$c         = () => false;
global.$n         = () => 0;

function load(file) {
  vm.runInThisContext(fs.readFileSync(path.join(root, file), 'utf8'), { filename: file });
}
load('entry_registry.js');
load('filter_registry.js');
load('exit_registry.js');
load('sl_tp_registry.js');
load('core.js');
load('opt.js');
load('pine_export.js');

// ── Счётчик ───────────────────────────────────────────────────
let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; }
  else { console.error(`  FAIL: ${msg}`); fail++; }
}

// ════════════════════════════════════════════════════════════
// B. Покрытие: PINE_EXPORTED_FILTERS vs FILTER_REGISTRY
// ════════════════════════════════════════════════════════════
console.log('B. Покрытие фильтров (coverage map)');

const pineExportSrc = fs.readFileSync(path.join(root, 'pine_export.js'), 'utf8');

const mExported    = pineExportSrc.match(/\/\/\s*PINE_EXPORTED_FILTERS\s*:\s*([^\n]+)/);
const mNotExported = pineExportSrc.match(/\/\/\s*PINE_NOT_EXPORTED\s*:\s*([^\n]+)/);

assert(mExported,    'pine_export.js содержит комментарий PINE_EXPORTED_FILTERS');
assert(mNotExported, 'pine_export.js содержит комментарий PINE_NOT_EXPORTED');

const declaredExported    = mExported    ? mExported[1].split(',').map(s => s.trim()).filter(Boolean)    : [];
const declaredNotExported = mNotExported ? mNotExported[1].split(',').map(s => s.trim()).filter(Boolean) : [];

const allFlags = FILTER_REGISTRY.map(f => f.flag);

// Каждый флаг должен быть ровно в одном списке
for (const flag of allFlags) {
  const inExp    = declaredExported.includes(flag);
  const inNotExp = declaredNotExported.includes(flag);
  assert(inExp || inNotExp,    `Флаг '${flag}' указан в EXPORTED или NOT_EXPORTED`);
  assert(!(inExp && inNotExp), `Флаг '${flag}' не указан одновременно в обоих списках`);
}

// Нет несуществующих флагов в списках
const allDeclared = [...declaredExported, ...declaredNotExported];
for (const flag of allDeclared) {
  assert(allFlags.includes(flag), `Флаг '${flag}' из комментария существует в FILTER_REGISTRY`);
}

// ════════════════════════════════════════════════════════════
// A. Структурный: генерируем Pine из полного конфига
// ════════════════════════════════════════════════════════════
console.log('A. Структурный (generate Pine из полного конфига)');

// Полный конфиг со всеми включёнными фильтрами
const fullCfg = {
  // Паттерны входа
  usePivot: true,    pivotLeft: 5,  pivotRight: 2,
  useEngulf: true,
  usePinBar: true,   pinRatio: 2.5,
  useDonch: true,    donchLen: 20,
  useBoll: true,     bollLen: 20,   bollMult: 2.0,
  useAtrBo: true,    atrBoLen: 14,  atrBoMult: 1.5,
  useMaTouch: true,  maTouchBars: 5,
  useSupertrend: true, stAtrP: 10,  stMult: 3.0,
  useTLTouch: true,  useTLBreak: true,
  useFlag: false,    useTri: false,
  useSqueeze: false, useMaCross: false, useInsideBar: false,
  useNReversal: false, useVolMove: false, useMacd: false, useFreeEntry: false,

  // MA фильтры
  useMA: true,      maType: 'EMA',  maP: 200,  htfRatio: 4,
  useConfirm: true, confMatType: 'EMA', confN: 50, confHtfRatio: 2,
  useMaDist: true,  maDistMax: 3.0,
  useSTrend: true,  sTrendWin: 10,

  // ADX
  useADX: true, adxLen: 14, adxThresh: 25.0, adxHtfRatio: 4,
  useAdxSlope: true, adxSlopeBars: 3,

  // Объём
  useVSA: true,    vsaMult: 1.8,  vsaPeriod: 20,
  useLiq: true,    liqMin: 0.5,
  useVolDir: true, volDirPeriod: 10,

  // Свечи / Волатильность
  useCandleF: true, candleMin: 0.3, candleMax: 3.0,
  useVolF: true,    volFMult: 2.5,
  useAtrExp: true,  atrExpMult: 0.9,

  // Структура
  useStruct: true, strPvL: 5, strPvR: 2,

  // Не экспортируемые (должны просто игнорироваться)
  useRSI: true,    rsiOS: 30,  rsiOB: 70,
  useConsec: true, consecMax: 3,
  useFresh: true,  freshMax: 20,
  useWT: true,     wtThresh: 2,
  useFat: true,

  // SL / TP
  slPair: { a: { type: 'atr', m: 1.5 }, p: null, combo: false },
  tpPair: { a: { type: 'rr',  m: 2.0 }, b: null, combo: false },
  slLogic: 'or', tpLogic: 'or',

  // BE / Trail / Exits
  useBE: true,    beTrig: 1.0,  beOff: 0.1,
  useTrail: true, trTrig: 2.0,  trDist: 1.0,
  useRev: true,   revBars: 2,   revMode: 'any', revSkip: 0, revCooldown: 0,
  useTime: true,  timeBars: 50,
  useClimax: true, useStExit: true,

  // Misc
  atrPeriod: 14, baseComm: 0.08, spreadVal: 0,
};

const mockResult = { name: 'PineCheckTest', cfg: fullCfg,
  pnl: 100.0, wr: 60.0, n: 100, dd: 20.0 };

let pineScript = '';
try {
  pineScript = generatePineScript(mockResult);
  assert(typeof pineScript === 'string' && pineScript.length > 500,
    'generatePineScript() вернул непустую строку');
} catch (e) {
  assert(false, 'generatePineScript() бросил исключение: ' + e.message);
}

// Находим all_filt_l и all_filt_s в Pine-коде
const mFiltL = pineScript.match(/bool all_filt_l\s*=\s*([^\n]+)/);
const mFiltS = pineScript.match(/bool all_filt_s\s*=\s*([^\n]+)/);
assert(mFiltL, 'all_filt_l определён в Pine-коде');
assert(mFiltS, 'all_filt_s определён в Pine-коде');
const filtL = mFiltL ? mFiltL[1] : '';
const filtS = mFiltS ? mFiltS[1] : '';

// Для каждого экспортируемого фильтра — его Pine-переменная должна быть в all_filt
// Формат: { flag → [возможные переменные, хотя бы одна должна быть в all_filt] }
const FILTER_TO_PINE_VARS_L = {
  useMA:      ['ma_ok_l'],
  useConfirm: ['conf_ok_l'],
  useMaDist:  ['ma_dist_ok'],
  useADX:     ['adx_ok'],
  useVolF:    ['vol_f_ok'],
  useAtrExp:  ['atr_exp_ok'],
  useCandleF: ['candle_f_ok'],
  useStruct:  ['struct_ok_l'],
  useVSA:     ['is_whale', 'use_vsa'],
  useLiq:     ['liq_ok'],
  useVolDir:  ['vol_dir_ok_l'],
  useSTrend:  ['st_ok_l'],
};
const FILTER_TO_PINE_VARS_S = {
  useMA:      ['ma_ok_s'],
  useConfirm: ['conf_ok_s'],
  useMaDist:  ['ma_dist_ok'],
  useADX:     ['adx_ok'],
  useVolF:    ['vol_f_ok'],
  useAtrExp:  ['atr_exp_ok'],
  useCandleF: ['candle_f_ok'],
  useStruct:  ['struct_ok_s'],
  useVSA:     ['is_whale', 'use_vsa'],
  useLiq:     ['liq_ok'],
  useVolDir:  ['vol_dir_ok_s'],
  useSTrend:  ['st_ok_s'],
};

for (const flag of declaredExported) {
  const varsL = FILTER_TO_PINE_VARS_L[flag];
  const varsS = FILTER_TO_PINE_VARS_S[flag];
  if (varsL) {
    const found = varsL.some(v => filtL.includes(v));
    assert(found, `Фильтр '${flag}' → переменная (${varsL.join('/')}) есть в all_filt_l`);
  }
  if (varsS) {
    const found = varsS.some(v => filtS.includes(v));
    assert(found, `Фильтр '${flag}' → переменная (${varsS.join('/')}) есть в all_filt_s`);
  }
}

// f_tf_str определён ДО первого вызова
const idxDef = pineScript.indexOf('f_tf_str(int secs)');
const idxUse = pineScript.indexOf('f_tf_str(timeframe');
assert(idxDef !== -1, 'f_tf_str() определена в Pine-коде');
assert(idxUse !== -1, 'f_tf_str() используется в Pine-коде');
assert(idxDef < idxUse, `f_tf_str() определена (${idxDef}) ДО первого вызова (${idxUse})`);

// ════════════════════════════════════════════════════════════
// C. Параметры: значения из конфига правильно попадают в Pine
// ════════════════════════════════════════════════════════════
console.log('C. Параметры (значения конфига в Pine-коде)');

// Каждая запись: [описание, строка которую ищем в pineScript]
const paramChecks = [
  ['maP=200',           'input.int(200'],
  ['htfRatio=4 (MA)',   'ma_htf_ratio = input.int(4'],
  ['confN=50',          'input.int(50'],
  ['confHtfRatio=2',    'conf_ma_htf'],
  ['adxThresh=25.0',    '25.0'],
  ['adxLen=14',         'input.int(14'],
  ['adxHtfRatio=4',     'adx_htf_ratio = input.int(4'],
  ['adxSlopeBars=3',    'adx_slope_bars= input.int(3'],
  ['volFMult=2.5',      '2.5'],
  ['atrExpMult=0.9',    '0.9'],
  ['candleMin=0.3',     '0.3'],
  ['candleMax=3.0',     '3.0'],
  ['maDistMax=3.0',     'input.float(3.0'],
  ['slAtrMult=1.5',     '1.5'],
  ['tpRRMult=2.0',      '2.0'],
  ['beTrig=1.0',        'be_trig   = input.float(1.0'],
  ['trDist=1.0',        'trail_dist = input.float(1.0'],
  ['comm=0.08',         '0.080'],
];

for (const [label, needle] of paramChecks) {
  assert(pineScript.includes(needle), `Параметр ${label}: '${needle}' есть в Pine-коде`);
}

// Булевые флаги (проверяем наличие input + значение true рядом)
function hasBoolInput(src, varName, val) {
  const re = new RegExp(varName + '\\s*=\\s*input\\.bool\\(' + val);
  return re.test(src);
}
assert(hasBoolInput(pineScript, 'use_adx',     'true'),  'use_adx = input.bool(true)');
assert(hasBoolInput(pineScript, 'use_atr_exp', 'true'),  'use_atr_exp = input.bool(true)');
assert(hasBoolInput(pineScript, 'adx_slope',   'true'),  'adx_slope = input.bool(true)');
assert(hasBoolInput(pineScript, 'use_conf_ma', 'true'),  'use_conf_ma = input.bool(true)');
assert(hasBoolInput(pineScript, 'use_int_ma',  'true'),  'use_int_ma = input.bool(true)');

// ════════════════════════════════════════════════════════════
// Итог
// ════════════════════════════════════════════════════════════
const total = pass + fail;
if (fail === 0) {
  console.log(`\n✓ ${total} assertions passed`);
} else {
  console.error(`\n✗ ${fail}/${total} assertions FAILED`);
  process.exit(1);
}
