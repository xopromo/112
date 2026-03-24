#!/usr/bin/env node
// ============================================================
// test_data/validate.js — Валидация JS-движка против TradingView
//
// Использование:
//   node test_data/validate.js [csv_file] [config_json_file]
//
// Примеры:
//   node test_data/validate.js                        # автодискавери + дефолтный cfg
//   node test_data/validate.js test_data/ohlcv.csv    # конкретный файл
//   node test_data/validate.js test_data/ohlcv.csv test_data/my_cfg.json
//
// Формат CSV: time,open,high,low,close,[Volume,][MA,][Confirm MA,][Equity %,][Zero,][XL,][XS,][EL,][ES]
//   Поля MA и Confirm MA инжектируются напрямую в cfg (bypassing JS-вычисление).
//
// Формат config JSON: объект с полями btCfg (любые параметры backtest()).
//   Минимальный пример: { "usePivot": true, "pvL": 5, "pvR": 2 }
// ============================================================

'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT      = path.resolve(__dirname, '..');
const ANSI_RED  = '\x1b[31m';
const ANSI_GRN  = '\x1b[32m';
const ANSI_YLW  = '\x1b[33m';
const ANSI_CYN  = '\x1b[36m';
const ANSI_RST  = '\x1b[0m';

// ─────────────────────────────────────────────────────────────
// 1. ЗАГРУЗКА JS-ДВИЖКА
// ─────────────────────────────────────────────────────────────
const ctx = vm.createContext({
  Math, Array, Float64Array, Float32Array, Int8Array, Uint8Array,
  Infinity, NaN, isNaN, isFinite, parseInt, parseFloat, Number,
  Object, String, Boolean, console,
  // Глобальные переменные движка
  DATA: null,
  ENTRY_REGISTRY: undefined,
  FILTER_REGISTRY: undefined,
  EXIT_REGISTRY: undefined,
  SL_REGISTRY: undefined,
  SL_TP_REGISTRY: undefined,
  _calcTP: undefined,
});

function loadFile(relPath) {
  let code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  // const REGISTRY_NAME = [...] → REGISTRY_NAME = [...]
  // чтобы top-level const стали видны в vm-контексте как свойства ctx
  code = code.replace(
    /^const\s+((?:ENTRY|FILTER|EXIT|SL|SL_TP)_REGISTRY)\s*=/gm,
    '$1 ='
  );
  // _calcTP тоже нужна глобально
  code = code.replace(/^const\s+(_calcTP)\s*=/gm, '$1 =');
  try {
    vm.runInContext(code, ctx);
  } catch (e) {
    console.error(`[loadFile] Ошибка при загрузке ${relPath}:`, e.message);
    process.exit(1);
  }
}

loadFile('entry_registry.js');
loadFile('filter_registry.js');
loadFile('exit_registry.js');
loadFile('sl_tp_registry.js');
loadFile('core.js');

// ─────────────────────────────────────────────────────────────
// 2. ПАРСИНГ CSV
// ─────────────────────────────────────────────────────────────
function parseCSV(filePath) {
  const text    = fs.readFileSync(filePath, 'utf8').trim();
  const lines   = text.split('\n');
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/ /g, '_'));
  const rows    = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',');
    const row  = {};
    headers.forEach((h, j) => { row[h] = vals[j]?.trim() ?? ''; });
    rows.push(row);
  }
  return { headers, rows };
}

// Строим массив DATA из строк CSV
function buildData(rows) {
  return rows.map(r => ({
    t: parseInt(r.time)   || 0,
    o: parseFloat(r.open) || 0,
    h: parseFloat(r.high) || 0,
    l: parseFloat(r.low)  || 0,
    c: parseFloat(r.close)|| 0,
    v: parseFloat(r.volume || r['volume_(btc)'] || '0') || 0,
  }));
}

// Извлекаем TV-сигналы и equity из CSV
function extractTV(rows, headers) {
  const hasCol = (n) => headers.includes(n);
  const getF   = (r, n) => { const v = parseFloat(r[n]); return isNaN(v) ? null : v; };
  const getI   = (r, n) => parseInt(r[n]) || 0;

  return rows.map(r => ({
    el:     getI(r, 'el'),    // Enter Long
    es:     getI(r, 'es'),    // Enter Short
    xl:     getI(r, 'xl'),    // Exit Long
    xs:     getI(r, 'xs'),    // Exit Short
    equity: hasCol('equity_%') ? getF(r, 'equity_%') : null,
    ma:     hasCol('ma')          ? (r.ma     !== '' ? parseFloat(r.ma)          : NaN) : NaN,
    cma:    hasCol('confirm_ma')  ? (r.confirm_ma !== '' ? parseFloat(r.confirm_ma) : NaN) : NaN,
    pv_hi:  hasCol('pv_hi') ? getI(r, 'pv_hi') : 0,
    pv_lo:  hasCol('pv_lo') ? getI(r, 'pv_lo') : 0,
  }));
}

// ─────────────────────────────────────────────────────────────
// 3. ПОСТРОЕНИЕ КОНФИГА
// ─────────────────────────────────────────────────────────────
// Разбирает slPair/tpPair формат оптимизатора в поля btCfg
function expandSlTpPair(cfg) {
  const sl = cfg.slPair;
  const tp = cfg.tpPair;
  if (sl) {
    // Новые имена полей (SL_REGISTRY: hasSLA=ATR, hasSLB=percent, useSLPiv=pivot)
    cfg.hasSLA    = !!(sl.a);  cfg.slMult     = sl.a ? sl.a.m : 1.5;
    cfg.hasSLB    = !!(sl.p);  cfg.slPctMult  = sl.p ? sl.p.m : 2.0;
    cfg.slLogic   = sl.combo ? 'or' : 'single';
  }
  if (tp) {
    const t1 = tp.a, t2 = tp.b;
    cfg.hasTPA = !!(t1); cfg.tpMode  = t1 ? t1.type : 'rr'; cfg.tpMult  = t1 ? t1.m : 2;
    cfg.hasTPB = !!(t2); cfg.tpModeB = t2 ? t2.type : 'rr'; cfg.tpMultB = t2 ? t2.m : 2;
    cfg.tpLogic = tp.combo ? 'or' : 'single';
  }
}

function buildDefaultCfg(tv, userCfg) {
  const N = tv.length;

  // Базовый cfg — минимально рабочий
  const cfg = {
    // Вход
    usePivot:   false,
    useEngulf:  false,
    // Фильтры
    useMA:      false,
    useConfirm: false,
    // SL/TP (выключены по умолчанию)
    // Новые имена полей core.js (SL_REGISTRY): hasSLA=ATR, hasSLB=percent, useSLPiv=pivot
    hasSLA: false, slMult: 1.5,
    hasSLB: false, slPctMult: 10.0,
    useSLPiv: false,
    hasTPA: false, tpMode: 'pct', tpMult: 2.0,
    hasTPB: false, tpModeB: 'rr', tpMultB: 2,
    slLogic: 'or', tpLogic: 'or',
    // Режимы
    useRev:     false,
    useBE:      false,
    waitBars:   0,
    start:      50,
    comm:       0.04,
    commission: 0.04,
    revBars:    1,
    revMode:    'any',
    revAct:     'exit',
    revSkip:    0,
    revCooldown:0,
    waitRetrace:false,
    waitMaxBars:0,
    waitCancelAtr:0,
    atrPeriod:  14,
    pruning:    false,
    collectTrades: true,
    tradeLog:   [],
    // Массивы
    maArr:         null,
    maArrConfirm:  null,
    pvLo:          null,
    pvHi_:         null,
    volAvg:        null,
    bodyAvg:       null,
    pvL:        5,
    pvR:        2,
    ...userCfg,
  };

  // Разворачиваем slPair/tpPair если переданы
  if (cfg.slPair || cfg.tpPair) expandSlTpPair(cfg);

  // Инжектируем TV-computed MA values напрямую из CSV (если есть в колонках)
  const maCol  = tv.map(r => r.ma);
  const cmaCol = tv.map(r => r.cma);
  const hasMa  = maCol.some(v => !isNaN(v) && v > 0);
  const hasCma = cmaCol.some(v => !isNaN(v) && v > 0);

  if (hasMa && !cfg.maArr) {
    cfg.maArr = new Float64Array(N);
    maCol.forEach((v, i) => { cfg.maArr[i] = isNaN(v) ? 0 : v; });
    cfg.useMA = true;
    console.log(`  ✓ maArr из CSV (TV-значения, ${maCol.filter(v => !isNaN(v) && v>0).length} баров)`);
  }
  if (hasCma && !cfg.maArrConfirm) {
    // ВАЖНО: поле называется maArrConfirm — именно его читает filter_registry.js
    cfg.maArrConfirm = new Float64Array(N);
    cmaCol.forEach((v, i) => { cfg.maArrConfirm[i] = isNaN(v) ? 0 : v; });
    cfg.useConfirm = true;
    console.log(`  ✓ maArrConfirm из CSV (TV-значения, ${cmaCol.filter(v => !isNaN(v) && v>0).length} баров)`);
  }

  // Pivot сигналы из CSV (колонки PV_HI, PV_LO)
  const hasPvSignals = tv.some(r => r.pv_hi > 0 || r.pv_lo > 0);
  if (hasPvSignals && !cfg.pvLo) {
    cfg.pvLo  = new Uint8Array(N);
    cfg.pvHi_ = new Uint8Array(N);
    tv.forEach((r, i) => { cfg.pvLo[i] = r.pv_lo; cfg.pvHi_[i] = r.pv_hi; });
    cfg.usePivot = true;
    console.log(`  ✓ Pivot сигналы из CSV (PV_HI/PV_LO)`);
  }

  return cfg;
}

// ─────────────────────────────────────────────────────────────
// 4. ЗАПУСК BACKTEST ЧЕРЕЗ VM
// ─────────────────────────────────────────────────────────────
function runBacktest(data, cfg) {
  ctx.DATA = data;

  // volAvg / bodyAvg нужны для некоторых фильтров
  if (!cfg.volAvg) cfg.volAvg = vm.runInContext('calcSMA(DATA.map(d=>d.v), 20)', ctx);
  if (!cfg.bodyAvg) cfg.bodyAvg = vm.runInContext('calcBodySMA(20)', ctx);

  // MA из конфига (если не инжектирован из CSV)
  if (cfg.useMA && cfg.maP > 0 && !cfg.maArr) {
    const htf = cfg.htfRatio || 1;
    const typ = cfg.maType || 'EMA';
    if (htf > 1) {
      cfg.maArr = vm.runInContext(`calcHTFMA(DATA, ${htf}, ${cfg.maP}, '${typ}')`, ctx);
      console.log(`  ✓ maArr вычислен JS: ${typ}(${cfg.maP})×${htf}tf`);
    } else {
      cfg.maArr = vm.runInContext(`calcMA(DATA.map(d=>d.c), ${cfg.maP}, '${typ}')`, ctx);
      console.log(`  ✓ maArr вычислен JS: ${typ}(${cfg.maP})`);
    }
  }

  // Confirm MA из конфига (если не инжектирован из CSV)
  if (cfg.useConfirm && cfg.confN > 0 && !cfg.maArrConfirm) {
    const htf = cfg.confHtfRatio || 1;
    const typ = cfg.confMatType || 'EMA';
    if (htf > 1) {
      cfg.maArrConfirm = vm.runInContext(`calcHTFMA(DATA, ${htf}, ${cfg.confN}, '${typ}')`, ctx);
      console.log(`  ✓ maArrConfirm вычислен JS: ${typ}(${cfg.confN})×${htf}tf`);
    } else {
      cfg.maArrConfirm = vm.runInContext(`calcMA(DATA.map(d=>d.c), ${cfg.confN}, '${typ}')`, ctx);
      console.log(`  ✓ maArrConfirm вычислен JS: ${typ}(${cfg.confN})`);
    }
  }

  // Pivot (если не инжектированы из CSV)
  if (!cfg.pvLo) {
    const pvL = cfg.pvL || 5, pvR = cfg.pvR || 2;
    cfg.pvLo  = vm.runInContext(`calcPivotLow(${pvL}, ${pvR})`,  ctx);
    cfg.pvHi_ = vm.runInContext(`calcPivotHigh(${pvL}, ${pvR})`, ctx);
    console.log(`  ✓ Pivot вычислен JS: L${pvL} R${pvR}`);
  }

  // ATR
  const atrPeriod = cfg.atrPeriod || 14;
  const atrArr = vm.runInContext(`calcRMA_ATR(${atrPeriod})`, ctx);

  // Вычисляем минимальный start из параметров индикаторов
  // Если пользователь явно задал start — берём максимум (user-start >= min-warmup)
  {
    const maType = cfg.maType || 'EMA';
    const cType  = cfg.confMatType || 'EMA';
    const tMult  = (maType==='TEMA'||maType==='DEMA'||maType==='EMA') ? 3 : 1;
    const cMult  = (cType==='TEMA'||cType==='DEMA'||cType==='EMA')   ? 3 : 1;
    const autoStart = Math.max(
      (cfg.pvL||5) + (cfg.pvR||2) + 5,
      cfg.useMA      ? (cfg.maP||0)  * (cfg.htfRatio||1)    * tMult : 0,
      cfg.useConfirm ? (cfg.confN||0)* (cfg.confHtfRatio||1)* cMult : 0,
      atrPeriod * 3,
      50
    ) + 2;
    // Явный start из userCfg переопределяет авто-расчёт (если он больше мин. прогрева)
    cfg.start = Math.max(cfg.start || 0, autoStart);
    console.log(`  ✓ start = ${cfg.start} баров прогрева${cfg.start > autoStart ? ` (явный, авто = ${autoStart})` : ''}`);
  }

  ctx._validateCfg    = cfg;
  ctx._validatePvLo   = cfg.pvLo  || new Float64Array(data.length);
  ctx._validatePvHi   = cfg.pvHi_ || new Float64Array(data.length);
  ctx._validateAtrArr = atrArr;

  const result = vm.runInContext(
    'backtest(_validatePvLo, _validatePvHi, _validateAtrArr, _validateCfg)',
    ctx
  );
  result.tradeLog = cfg.tradeLog || [];
  return result;
}

// ─────────────────────────────────────────────────────────────
// 5. ИЗВЛЕЧЕНИЕ СДЕЛОК ИЗ TV-ДАННЫХ
// ─────────────────────────────────────────────────────────────
function extractTVTrades(tv, data) {
  const trades = [];
  let dir = 0, entryBar = -1, entryC = 0;

  for (let i = 0; i < tv.length; i++) {
    const r = tv[i];
    if (r.el === 1) {
      if (dir !== 0) { /* переоткрытие — пропуск */ }
      dir = 1; entryBar = i; entryC = data[i].c;
    }
    if (r.es === 1) {
      if (dir !== 0) { /* переоткрытие — пропуск */ }
      dir = -1; entryBar = i; entryC = data[i].c;
    }
    if (r.xl === 1 && dir === 1) {
      const exitC = data[i].c;
      const pnl = (exitC - entryC) / entryC * 100;
      trades.push({ type: 'L', entryBar, exitBar: i, entryC, exitC, pnl });
      dir = 0;
    }
    if (r.xs === 1 && dir === -1) {
      const exitC = data[i].c;
      const pnl = (entryC - exitC) / entryC * 100;
      trades.push({ type: 'S', entryBar, exitBar: i, entryC, exitC, pnl });
      dir = 0;
    }
  }
  return trades;
}

// ─────────────────────────────────────────────────────────────
// 6. ИЗВЛЕЧЕНИЕ JS СДЕЛОК ИЗ tradeLog
// ─────────────────────────────────────────────────────────────
function extractJSTrades(jsResult) {
  if (jsResult?.tradeLog && jsResult.tradeLog.length > 0) {
    // Используем tradeLog (точные entryBar/exitBar/dir)
    return jsResult.tradeLog.filter(t => t.exitBar !== undefined);
  }
  // Fallback: из equity curve
  const jsEq = jsResult?.eq || [];
  const exits = [];
  for (let i = 1; i < jsEq.length; i++) {
    if (Math.abs(jsEq[i] - jsEq[i-1]) > 1e-9) {
      exits.push({ exitBar: i, pnl: jsEq[i] - jsEq[i-1] });
    }
  }
  return exits;
}

// ─────────────────────────────────────────────────────────────
// 7. СРАВНЕНИЕ СДЕЛОК TV vs JS
// ─────────────────────────────────────────────────────────────
function compareTrades(tvTrades, jsExits, data) {
  const WINDOW = 3; // допуск в барах для совпадения
  let matched = 0, tvOnly = 0, jsOnly = 0;
  const tvMatched = new Set();
  const jsMatched = new Set();

  // Для каждой TV сделки ищем соответствующий JS выход по exitBar
  for (const tv of tvTrades) {
    let found = false;
    for (let j = 0; j < jsExits.length; j++) {
      if (jsMatched.has(j)) continue;
      if (Math.abs(jsExits[j].exitBar - tv.exitBar) <= WINDOW) {
        matched++;
        tvMatched.add(tv.exitBar);
        jsMatched.add(j);
        found = true;
        break;
      }
    }
    if (!found) tvOnly++;
  }
  jsOnly = jsExits.length - jsMatched.size;

  return { matched, tvOnly, jsOnly, total: tvTrades.length, jsTotal: jsExits.length };
}

// Создаём выровненные пары TV↔JS по близости entryBar
// Алгоритм: жадная последовательная привязка
function buildTradePairs(tvTrades, jsTrades) {
  const pairs = [];
  let ji = 0;
  for (let ti = 0; ti < tvTrades.length; ti++) {
    const tv = tvTrades[ti];
    // Ищем ближайшую JS сделку после TV entry (или до ±5 баров)
    let best = null, bestDist = Infinity;
    const startJ = ji;
    for (let j = startJ; j < Math.min(startJ + 5, jsTrades.length); j++) {
      if (jsTrades[j] === undefined) break;
      const d = Math.abs(jsTrades[j].entryBar - tv.entryBar);
      if (d < bestDist) { bestDist = d; best = j; }
    }
    if (best !== null && bestDist <= 15) {
      pairs.push({ tv, js: jsTrades[best], entryDelta: jsTrades[best].entryBar - tv.entryBar, exitDelta: (jsTrades[best].exitBar || 0) - tv.exitBar });
      ji = best + 1;
    } else {
      // TV trade без JS пары
      pairs.push({ tv, js: null, entryDelta: null, exitDelta: null });
    }
  }
  return pairs;
}

// ─────────────────────────────────────────────────────────────
// 8. ОТЧЁТ
// ─────────────────────────────────────────────────────────────
function printReport(csvFile, data, tv, jsResult, tvTrades, jsExits, tradeMatch, tradePairs) {
  console.log('\n' + '═'.repeat(70));
  console.log(`${ANSI_CYN}ФАЙЛ:${ANSI_RST} ${path.basename(csvFile)}`);
  console.log(`Баров данных: ${data.length}`);
  console.log('─'.repeat(70));

  // JS результаты
  if (jsResult) {
    console.log(`\n${ANSI_CYN}JS BACKTEST${ANSI_RST}`);
    console.log(`  Сделок: ${jsResult.n}  PnL: ${jsResult.pnl.toFixed(2)}%  WR: ${jsResult.wr.toFixed(1)}%  DD: ${jsResult.dd.toFixed(2)}%`);
    const jsL = jsResult.nL || 0, jsS = jsResult.nS || 0;
    if (jsL + jsS > 0) console.log(`  Long: ${jsL}  Short: ${jsS}`);
  } else {
    console.log(`  ${ANSI_RED}✗ backtest() не запущен${ANSI_RST}`);
  }

  // TV результаты
  console.log(`\n${ANSI_CYN}TV СДЕЛКИ${ANSI_RST} (из CSV)`);
  if (tvTrades.length === 0) {
    console.log(`  ${ANSI_YLW}⚠  Нет TV сигналов (EL/XL/ES/XS = 0)${ANSI_RST}`);
  } else {
    const tvL = tvTrades.filter(t => t.type === 'L').length;
    const tvS = tvTrades.filter(t => t.type === 'S').length;
    const tvWins = tvTrades.filter(t => t.pnl > 0).length;
    const tvPnl = tvTrades.reduce((s, t) => s + t.pnl, 0);
    console.log(`  Сделок: ${tvTrades.length}  Long: ${tvL}  Short: ${tvS}`);
    console.log(`  WR по цене: ${tvTrades.length > 0 ? (tvWins/tvTrades.length*100).toFixed(1) : '—'}%  Сум.PnL (цена): ${tvPnl.toFixed(2)}%`);
    // Первая и последняя TV сделки
    const first = tvTrades[0];
    const last = tvTrades[tvTrades.length - 1];
    console.log(`  Первая: ${first.type}  бар ${first.entryBar}→${first.exitBar}`);
    console.log(`  Последняя: ${last.type}  бар ${last.entryBar}→${last.exitBar}`);
  }

  // Сравнение выходов (±3 бара, по всем сделкам)
  if (tvTrades.length > 0 && jsExits.length > 0) {
    console.log(`\n${ANSI_CYN}СРАВНЕНИЕ ВЫХОДОВ (±3 бара, по всем TV сделкам)${ANSI_RST}`);
    const pct = (tradeMatch.matched / tradeMatch.total * 100).toFixed(1);
    const color = tradeMatch.matched / tradeMatch.total > 0.8 ? ANSI_YLW : ANSI_RED;
    console.log(`  ${color}Совпадений: ${tradeMatch.matched} / ${tradeMatch.total} (${pct}%)${ANSI_RST}`);
    console.log(`  TV без JS: ${tradeMatch.tvOnly}  JS без TV: ${tradeMatch.jsOnly}  JS всего: ${tradeMatch.jsTotal}`);
  }

  // Последовательное сравнение (trade 1 vs trade 1, etc.)
  if (tradePairs && tradePairs.length > 0) {
    const paired = tradePairs.filter(p => p.js !== null);
    const exitExact = paired.filter(p => Math.abs(p.exitDelta) <= 3).length;
    const entryExact = paired.filter(p => Math.abs(p.entryDelta) <= 3).length;
    console.log(`\n${ANSI_CYN}ПОСЛЕДОВАТЕЛЬНОЕ СОВПАДЕНИЕ (TV[i] ↔ JS[i])${ANSI_RST}`);
    console.log(`  Спаровано: ${paired.length} / ${tradePairs.length}`);
    console.log(`  Входы совпали (±3 бара): ${entryExact} / ${paired.length} (${(entryExact/paired.length*100).toFixed(0)}%)`);
    console.log(`  Выходы совпали (±3 бара): ${exitExact} / ${paired.length} (${(exitExact/paired.length*100).toFixed(0)}%)`);

    // Первые 20 пар
    console.log(`\n${ANSI_CYN}ПЕРВЫЕ 20 ПАР TV[i] ↔ JS[i]${ANSI_RST}`);
    console.log(`  TV   TV_EL  TV_XL  pnl%  JS_EL  JS_XL  EΔ   XΔ`);
    const shown = Math.min(20, tradePairs.length);
    for (let i = 0; i < shown; i++) {
      const p = tradePairs[i];
      const jsEl = p.js ? p.js.entryBar : '—';
      const jsXl = p.js ? p.js.exitBar  : '—';
      const ed  = p.entryDelta !== null ? p.entryDelta : '—';
      const xd  = p.exitDelta  !== null ? p.exitDelta  : '—';
      const eSym = p.js && Math.abs(p.entryDelta) <= 3 ? `${ANSI_GRN}✓${ANSI_RST}` : `${ANSI_RED}✗${ANSI_RST}`;
      const xSym = p.js && Math.abs(p.exitDelta)  <= 3 ? `${ANSI_GRN}✓${ANSI_RST}` : `${ANSI_RED}✗${ANSI_RST}`;
      const pnlStr = p.tv.pnl.toFixed(2).padEnd(6);
      console.log(`  ${p.tv.type.padEnd(3)}  ${String(p.tv.entryBar).padEnd(6)} ${String(p.tv.exitBar).padEnd(6)} ${pnlStr} ${String(jsEl).padEnd(6)} ${String(jsXl).padEnd(6)} ${eSym}${String(ed).padStart(4)} ${xSym}${String(xd).padStart(4)}`);
    }
    if (tradePairs.length > 20) console.log(`  ... ещё ${tradePairs.length - 20} пар`);
  }

  // TV equity summary
  const hasEq = tv.some(r => r.equity !== null && r.equity !== 0);
  if (hasEq) {
    const lastEq = [...tv].reverse().find(r => r.equity !== null && r.equity !== undefined);
    const maxEq = tv.reduce((m, r) => (r.equity !== null && r.equity > m) ? r.equity : m, -Infinity);
    console.log(`\n${ANSI_CYN}TV EQUITY${ANSI_RST}`);
    console.log(`  Финальная: ${lastEq?.equity?.toFixed(2) ?? '—'}%  Макс: ${maxEq.toFixed(2)}%`);
    console.log(`  (TV использует перем. размер позиции — прямое сравнение с JS equity невозможно)`);
  }

  // Итог
  console.log('\n' + '─'.repeat(70));
  if (tvTrades.length === 0) {
    console.log(`${ANSI_YLW}ИТОГ: ⚠  Нет TV сигналов для сравнения${ANSI_RST}`);
  } else if (!jsResult) {
    console.log(`${ANSI_RED}ИТОГ: ✗ JS backtest не запущен${ANSI_RST}`);
  } else {
    const pct = tradeMatch.matched / tradeMatch.total * 100;
    if (pct >= 90) {
      console.log(`${ANSI_GRN}ИТОГ: ✓ Хорошее совпадение (${pct.toFixed(0)}% сделок)${ANSI_RST}`);
    } else if (pct >= 70) {
      console.log(`${ANSI_YLW}ИТОГ: ~ Частичное совпадение (${pct.toFixed(0)}% сделок)${ANSI_RST}`);
    } else {
      console.log(`${ANSI_RED}ИТОГ: ✗ Значительное расхождение (${pct.toFixed(0)}% совпадений)${ANSI_RST}`);
      if (jsResult.n !== tvTrades.length) {
        console.log(`  JS: ${jsResult.n} сделок  TV: ${tvTrades.length} сделок (разница: ${jsResult.n - tvTrades.length})`);
      }
    }
  }
  console.log('═'.repeat(70) + '\n');
}

// ─────────────────────────────────────────────────────────────
// 8. MAIN
// ─────────────────────────────────────────────────────────────
function discoverCSVs() {
  const dir   = path.join(ROOT, 'test_data');
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.csv'))
    .map(f => path.join(dir, f));
  return files;
}

function main() {
  const args = process.argv.slice(2);
  let csvFiles = [];
  let userCfg  = {};

  // Парсим аргументы
  for (let i = 0; i < args.length; i++) {
    if (args[i].endsWith('.csv')) {
      csvFiles.push(path.resolve(args[i]));
    } else if (args[i].endsWith('.json')) {
      try {
        userCfg = JSON.parse(fs.readFileSync(path.resolve(args[i]), 'utf8'));
        console.log(`Конфиг загружен из ${args[i]}`);
      } catch (e) {
        console.error(`Ошибка чтения конфига: ${e.message}`);
        process.exit(1);
      }
    } else if (args[i].startsWith('{')) {
      // Inline JSON конфиг
      try { userCfg = JSON.parse(args[i]); } catch (e) {}
    }
  }

  if (csvFiles.length === 0) {
    csvFiles = discoverCSVs();
    if (csvFiles.length === 0) {
      console.error('Нет CSV файлов в test_data/');
      process.exit(1);
    }
    console.log(`Найдено ${csvFiles.length} CSV файлов:`);
    csvFiles.forEach(f => console.log(`  ${path.basename(f)}`));
  }

  let allOk = true;

  for (const csvFile of csvFiles) {
    console.log(`\n${ANSI_CYN}▶ Обрабатываю: ${path.basename(csvFile)}${ANSI_RST}`);

    const { headers, rows } = parseCSV(csvFile);
    const data = buildData(rows);
    const tv   = extractTV(rows, headers);

    console.log(`  ${data.length} баров`);

    // Строим cfg
    const cfg = buildDefaultCfg(tv, userCfg);

    // Если нет ни одного активного entry — пробуем engulf как fallback
    const hasEntry = cfg.usePivot || cfg.useEngulf || userCfg.usePivot || userCfg.useEngulf;
    if (!hasEntry) {
      console.log(`  ${ANSI_YLW}⚠  Нет активного entry type. Включаю Engulf как fallback.${ANSI_RST}`);
      console.log(`     Для точного совпадения передай конфиг: node validate.js ${path.basename(csvFile)} cfg.json`);
      cfg.useEngulf = true;
    }

    // Запускаем backtest
    let jsResult = null;
    try {
      jsResult = runBacktest(data, cfg);
    } catch (e) {
      console.error(`  ${ANSI_RED}✗ backtest() упал: ${e.message}${ANSI_RST}`);
      console.error(e.stack);
    }

    // Извлекаем TV и JS сделки
    const tvTrades   = extractTVTrades(tv, data);
    const jsExits    = extractJSTrades(jsResult);
    const tradeMatch = compareTrades(tvTrades, jsExits, data);
    const tradePairs = buildTradePairs(tvTrades, jsExits);

    printReport(csvFile, data, tv, jsResult, tvTrades, jsExits, tradeMatch, tradePairs);

    if (tradeMatch.matched < tradeMatch.total * 0.9 && tvTrades.length > 0) allOk = false;
  }

  process.exit(allOk ? 0 : 1);
}

main();
