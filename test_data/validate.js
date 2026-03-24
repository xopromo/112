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
    cfg.useATRSL  = !!(sl.a);  cfg.atrSLMult  = sl.a ? sl.a.m : 1.5;
    cfg.usePercSL = !!(sl.p);  cfg.percSLMult = sl.p ? sl.p.m : 2.0;
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
    // SL/TP (выключены)
    useATRSL: false, atrSLMult: 1.5,
    usePercSL: false, percSLMult: 2.0,
    usePivotSL: false,
    hasTPA: false, tpMode: 'rr', tpMult: 2,
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

  // Всегда пересчитываем start из параметров индикаторов
  {
    const maType = cfg.maType || 'EMA';
    const cType  = cfg.confMatType || 'EMA';
    const tMult  = (maType==='TEMA'||maType==='DEMA'||maType==='EMA') ? 3 : 1;
    const cMult  = (cType==='TEMA'||cType==='DEMA'||cType==='EMA')   ? 3 : 1;
    cfg.start = Math.max(
      (cfg.pvL||5) + (cfg.pvR||2) + 5,
      cfg.useMA      ? (cfg.maP||0)  * (cfg.htfRatio||1)    * tMult : 0,
      cfg.useConfirm ? (cfg.confN||0)* (cfg.confHtfRatio||1)* cMult : 0,
      atrPeriod * 3,
      50
    ) + 2;
    console.log(`  ✓ start = ${cfg.start} баров прогрева`);
  }

  ctx._validateCfg    = cfg;
  ctx._validatePvLo   = cfg.pvLo  || new Float64Array(data.length);
  ctx._validatePvHi   = cfg.pvHi_ || new Float64Array(data.length);
  ctx._validateAtrArr = atrArr;

  const result = vm.runInContext(
    'backtest(_validatePvLo, _validatePvHi, _validateAtrArr, _validateCfg)',
    ctx
  );
  return result;
}

// ─────────────────────────────────────────────────────────────
// 5. СРАВНЕНИЕ EQUITY
// ─────────────────────────────────────────────────────────────
function compareEquity(tvSeries, jsEq, data) {
  // tvSeries: массив TV equity (может быть null для баров без данных)
  // jsEq: Float32Array из backtest()

  const N = Math.min(tvSeries.length, jsEq.length);

  // Собираем только бары с реальными TV данными (equity != 0 или был сигнал)
  const diffs = [];
  let maxAbsDiff = 0;
  let firstDivIdx = -1;
  const THRESHOLD = 0.01; // % — разница меньше которой считается совпадением

  for (let i = 0; i < N; i++) {
    const tvEq = tvSeries[i];
    if (tvEq === null) continue;

    const jsVal  = jsEq[i] || 0;
    const diff   = Math.abs(tvEq - jsVal);
    if (diff > maxAbsDiff) maxAbsDiff = diff;
    if (diff > THRESHOLD && firstDivIdx < 0) firstDivIdx = i;
    diffs.push({ i, t: data[i].t, tv: tvEq, js: jsVal, diff });
  }

  // Статистика расхождений
  const nonZero = diffs.filter(d => d.diff > THRESHOLD);
  const maxDiff = diffs.reduce((m, d) => d.diff > m ? d.diff : m, 0);
  const avgDiff = diffs.length > 0
    ? diffs.reduce((s, d) => s + d.diff, 0) / diffs.length
    : 0;

  return { diffs, nonZero, maxDiff, avgDiff, firstDivIdx, N };
}

// ─────────────────────────────────────────────────────────────
// 6. СРАВНЕНИЕ СИГНАЛОВ
// ─────────────────────────────────────────────────────────────
function compareSignals(tv, jsEq, data) {
  // Восстанавливаем JS-сигналы из изменений equity
  // Вход = equity[i] == equity[i-1] (сделка началась)
  // Выход = equity изменился
  // Для точного сравнения нужно добавить логику в core.js
  // Пока сравниваем TV сигналы по timestamp с equity-шагами

  const tvTrades = [];
  let tvDir = 0, tvEntry = -1;

  for (let i = 0; i < tv.length; i++) {
    const r = tv[i];
    if (r.el === 1 && tvDir <= 0) {
      if (tvDir === -1) tvTrades.push({ type: 'XS', bar: i, t: data[i].t });
      tvTrades.push({ type: 'EL', bar: i, t: data[i].t });
      tvDir = 1; tvEntry = i;
    }
    if (r.es === 1 && tvDir >= 0) {
      if (tvDir === 1) tvTrades.push({ type: 'XL', bar: i, t: data[i].t });
      tvTrades.push({ type: 'ES', bar: i, t: data[i].t });
      tvDir = -1; tvEntry = i;
    }
    if (r.xl === 1 && tvDir === 1) {
      tvTrades.push({ type: 'XL', bar: i, t: data[i].t });
      tvDir = 0;
    }
    if (r.xs === 1 && tvDir === -1) {
      tvTrades.push({ type: 'XS', bar: i, t: data[i].t });
      tvDir = 0;
    }
  }

  return tvTrades;
}

// ─────────────────────────────────────────────────────────────
// 7. ОТЧЁТ
// ─────────────────────────────────────────────────────────────
function printReport(csvFile, data, tv, jsResult, equityReport) {
  const { nonZero, maxDiff, avgDiff, firstDivIdx, diffs } = equityReport;
  const ok = nonZero.length === 0;

  console.log('\n' + '═'.repeat(60));
  console.log(`${ANSI_CYN}ФАЙЛ:${ANSI_RST} ${path.basename(csvFile)}`);
  console.log(`Баров данных: ${data.length} | Сделок JS: ${jsResult ? jsResult.n : '—'}`);
  if (jsResult) {
    console.log(`JS PnL: ${jsResult.pnl.toFixed(2)}%  WR: ${jsResult.wr.toFixed(1)}%  DD: ${jsResult.dd.toFixed(2)}%`);
  }
  console.log('─'.repeat(60));

  // Equity summary
  console.log(`\n${ANSI_CYN}EQUITY СРАВНЕНИЕ${ANSI_RST}`);
  if (diffs.length === 0) {
    console.log(`  ${ANSI_YLW}⚠  TV equity не найден в CSV (нет Equity % колонки или все 0)${ANSI_RST}`);
  } else if (ok) {
    console.log(`  ${ANSI_GRN}✓ Полное совпадение equity (отклонение < 0.01% на всех ${diffs.length} барах)${ANSI_RST}`);
  } else {
    console.log(`  ${ANSI_RED}✗ Расхождений: ${nonZero.length} / ${diffs.length} баров${ANSI_RST}`);
    console.log(`  Макс. отклонение: ${ANSI_RED}${maxDiff.toFixed(4)}%${ANSI_RST}  Среднее: ${avgDiff.toFixed(4)}%`);

    // Первое расхождение
    if (firstDivIdx >= 0) {
      const bar = data[firstDivIdx];
      const d   = diffs.find(d => d.i === firstDivIdx);
      const ts  = new Date(bar.t * 1000).toISOString().slice(0, 16).replace('T', ' ');
      console.log(`\n  ${ANSI_YLW}Первое расхождение: бар ${firstDivIdx} (${ts})${ANSI_RST}`);
      console.log(`    TV equity: ${d.tv.toFixed(4)}%  JS equity: ${d.js.toFixed(4)}%  Δ = ${d.diff.toFixed(4)}%`);
      console.log(`    OHLCV: O=${bar.o} H=${bar.h} L=${bar.l} C=${bar.c}`);
    }

    // Топ-5 расхождений
    const worst = [...nonZero].sort((a, b) => b.diff - a.diff).slice(0, 5);
    console.log(`\n  Топ-5 расхождений:`);
    console.log(`  ${'Бар'.padEnd(6)} ${'Время'.padEnd(17)} ${'TV%'.padEnd(12)} ${'JS%'.padEnd(12)} ${'Δ'.padEnd(10)}`);
    worst.forEach(d => {
      const ts = new Date(data[d.i].t * 1000).toISOString().slice(0, 16).replace('T', ' ');
      console.log(`  ${String(d.i).padEnd(6)} ${ts.padEnd(17)} ${d.tv.toFixed(4).padEnd(12)} ${d.js.toFixed(4).padEnd(12)} ${ANSI_RED}${d.diff.toFixed(4)}${ANSI_RST}`);
    });
  }

  // TV сигналы
  const tvTrades = compareSignals(tv, jsResult?.eq || [], data);
  const hasSignals = tvTrades.length > 0;
  console.log(`\n${ANSI_CYN}TV СИГНАЛЫ${ANSI_RST} (${tvTrades.length} событий)`);
  if (hasSignals) {
    tvTrades.slice(0, 20).forEach(t => {
      const ts  = new Date(data[t.bar].t * 1000).toISOString().slice(0, 16).replace('T', ' ');
      const sym = t.type.startsWith('E') ? ANSI_GRN : ANSI_RED;
      console.log(`  ${sym}${t.type}${ANSI_RST}  бар=${t.bar}  ${ts}`);
    });
    if (tvTrades.length > 20) console.log(`  ... ещё ${tvTrades.length - 20} событий`);
  } else {
    console.log(`  ${ANSI_YLW}⚠  XL/XS/EL/ES = 0 на всех барах${ANSI_RST}`);
  }

  // Итог
  console.log('\n' + '─'.repeat(60));
  if (ok && diffs.length > 0) {
    console.log(`${ANSI_GRN}ИТОГ: ✓ OK — JS движок совпадает с TradingView${ANSI_RST}`);
  } else if (diffs.length === 0) {
    console.log(`${ANSI_YLW}ИТОГ: ⚠  Нет TV equity для сравнения. Добавь в CSV колонку "Equity %".${ANSI_RST}`);
  } else {
    console.log(`${ANSI_RED}ИТОГ: ✗ РАСХОЖДЕНИЕ — нужна отладка${ANSI_RST}`);
    console.log(`  Следующий шаг: найди первое расхождение (бар ${firstDivIdx}) и сравни логику.`);
  }
  console.log('═'.repeat(60) + '\n');
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

    // Сравниваем equity
    const tvEquity = tv.map(r => r.equity);
    const jsEq     = jsResult?.eq || new Float32Array(data.length);
    const report   = compareEquity(tvEquity, jsEq, data);

    printReport(csvFile, data, tv, jsResult, report);

    if (report.nonZero.length > 0) allOk = false;
  }

  process.exit(allOk ? 0 : 1);
}

main();
