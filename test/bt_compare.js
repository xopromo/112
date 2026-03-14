#!/usr/bin/env node
// ============================================================
// bt_compare.js — универсальный инструмент сверки JS backtest vs TradingView
//
// Использование:
//   node test/bt_compare.js                          # дефолтный конфиг
//   node test/bt_compare.js --config path/to/cfg.json
//   node test/bt_compare.js --config path/to/cfg.json --pvcsv path/to/pivots.csv
//
// Формат CSV (tv_equity.csv):
//   Обязательные колонки: time, equity_%  (или equity_pct)
//   Опциональные:         el, es, xl, xs  (сигналы входа/выхода)
//                         ma              (значения MA из TV)
//                         pv_hi, pv_lo    (пивоты из TV, для сравнения)
//
// Формат конфига (JSON):
//   см. DEFAULT_CONFIG ниже — все поля с описаниями
//
// Ключевые инсайты (из калибровки 2026-03-14):
//   1. revMode='plus'    — разворот только когда сделка в плюсе
//   2. revNoFilters=true — разворот использует pat_s (без MA-фильтра), как в Pine
//   3. maSource='tv'     — MA берётся из TV-экспорта, а не вычисляется JS
//   4. comm=0.05%        — одна сторона; round-trip 0.1%; net TP = 1.9% при TP=2%
// ============================================================

'use strict';
const fs   = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ── Загрузка JS-модулей в глобальный контекст ───────────────
const _geval = eval;
const _load  = f => {
  let code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  code = code.replace(/^const ([A-Za-z_]\w*\s*=)/mg, 'var $1');
  code = code.replace(/^let ([A-Za-z_]\w*\s*=)/mg,   'var $1');
  _geval(code);
};
_load('sl_tp_registry.js');
_load('exit_registry.js');
_load('entry_registry.js');
_load('filter_registry.js');
_load('core.js');

// ── Дефолтный конфиг (откалиброван под TV) ──────────────────
const DEFAULT_CONFIG = {
  // Метаданные
  name:        'Unnamed Strategy',
  dataFile:    'test_data/ohlcv.csv',
  tvFile:      'test_data/tv_equity.csv',
  // Количество баров: "auto" = последние 10000, или число
  sliceOffset: 'auto10000',

  btf: {
    // SL: тип A = ATR-мульт, тип B = %
    hasSLA: false, slMult:    0,
    hasSLB: true,  slPctMult: 10, slLogic: 'or',

    // TP: тип A = RR или %, тип B = второй уровень
    hasTPA: true,  tpMult:  2,   tpMode:  'pct',
    hasTPB: false, tpMultB: 0,   tpModeB: 'rr', tpLogic: 'or',

    // Комиссия (одна сторона, backtest умножает на 2)
    // 0.05% → round-trip 0.1% → net на 2% TP = 1.9%
    comm: 0.05,

    // MA-фильтр
    // maSource: 'tv'  — берём из CSV-колонки "ma" (рекомендуется)
    //           'js'  — вычисляем в JS через calcHTFMA()
    //           'none'— MA-фильтр отключён
    useMA: true, maSource: 'tv', maType: 'WMA', maP: 75, htfRatio: 4,

    // Пивот-вход
    usePivot: true, pvL: 6, pvR: 5,

    // Разворотный сигнал
    // revNoFilters=true  → разворот = pat_s (чистый пивот, без MA-фильтра)
    // revMode='plus'     → срабатывает только когда сделка в плюсе
    useRev:      true,
    revBars:     1,        // минимум N баров в сделке до разворота
    revSkip:     1,        // пропустить N сигналов, выйти на (N+1)-м
    revMode:     'plus',   // 'any' | 'plus' | 'minus'
    revAct:      'exit',
    revSrc:      'same',
    revCooldown: 0,
    revNoFilters: true,    // ВАЖНО: без MA-фильтра на разворот

    // ATR
    atrPeriod: 10,

    // Всё остальное
    useEngulf:  false, usePinBar: false, useBoll:   false, useDonch:   false,
    useAtrBo:   false, useSqueeze:false, useMaTouch:false, useClimax:  false,
    useBE:      false, beTrig:    0.5,   beOff:     0,
    useTrail:   false, trTrig:    0.5,   trDist:    0.5,
    usePartial: false, partRR:    1,     partPct:   50,
    useTime:    false, timeBars:  0,
    longOnly:   false, shortOnly: false,
    useADX:     false, useRSI:    false, useAtrExp: false,
    useSTrend:  false, sTrendWin: 1,
    useConfirm: false, confN:     0,
    waitBars:   0, waitRetrace: false, waitMaxBars: 0, waitCancelAtr: 0,
    // start вычисляется автоматически если не задан
    start: null,
  },
};

// ── Утилиты ──────────────────────────────────────────────────
function parseCSV(filepath) {
  const lines = fs.readFileSync(filepath, 'utf8').trim().split('\n');
  const hdrs  = lines[0].split(',').map(h =>
    h.trim().toLowerCase().replace(/\s+/g, '_').replace(/%/g, 'pct')
  );
  return { hdrs, rows: lines.slice(1).map(line => {
    const cols = line.split(',');
    const obj  = {};
    hdrs.forEach((h, i) => { obj[h] = cols[i] !== undefined ? cols[i].trim() : ''; });
    return obj;
  }).filter(r => r[hdrs[0]] !== '') };
}

function deepMerge(base, override) {
  const result = Object.assign({}, base);
  for (const k of Object.keys(override || {})) {
    if (k === 'btf') {
      result.btf = Object.assign({}, base.btf, override.btf);
    } else {
      result[k] = override[k];
    }
  }
  return result;
}

// ── Корреляция Пирсона ────────────────────────────────────────
function pearsonCorr(xs, ys) {
  const n = xs.length;
  let sx = 0, sy = 0, sxy = 0, sx2 = 0, sy2 = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i]; sy += ys[i]; sxy += xs[i]*ys[i];
    sx2 += xs[i]*xs[i]; sy2 += ys[i]*ys[i];
  }
  const num = n*sxy - sx*sy;
  const den = Math.sqrt((n*sx2 - sx*sx) * (n*sy2 - sy*sy));
  return den === 0 ? 1 : num/den;
}

// ── Загрузка и подготовка данных ─────────────────────────────
function loadData(cfg) {
  const { hdrs: oHdrs, rows: ohlcvRows } = parseCSV(path.join(ROOT, cfg.dataFile));
  const { hdrs: tHdrs, rows: tvRows }    = parseCSV(path.join(ROOT, cfg.tvFile));

  // Slice
  let offset = 0;
  if (cfg.sliceOffset === 'auto10000') {
    offset = Math.max(0, ohlcvRows.length - 10000);
  } else if (typeof cfg.sliceOffset === 'number') {
    offset = cfg.sliceOffset;
  }

  global.DATA = ohlcvRows.slice(offset).map(r => ({
    t: r.time,
    o: parseFloat(r.open),
    h: parseFloat(r.high),
    l: parseFloat(r.low),
    c: parseFloat(r.close),
  }));
  const N = DATA.length;

  // TV map по времени
  const tvMap = Object.create(null);
  for (const r of tvRows) tvMap[r.time] = r;

  // Определяем доступные колонки TV
  const hasTvMA    = tHdrs.includes('ma');
  const hasTvEq    = tHdrs.includes('equity_pct') || tHdrs.includes('equity_%');
  const hasTvSigs  = tHdrs.includes('el');
  const hasTvPivHi = tHdrs.includes('pv_hi');
  const hasTvPivLo = tHdrs.includes('pv_lo');

  const eqCol = tHdrs.includes('equity_pct') ? 'equity_pct' : 'equity_%';

  // MA array
  const tvMAArr = new Float64Array(N);
  if (hasTvMA) {
    for (let i = 0; i < N; i++) {
      const tv = tvMap[DATA[i].t];
      tvMAArr[i] = tv && tv.ma !== '' ? parseFloat(tv.ma) : 0;
    }
  }

  // Equity
  const tvEqArr = new Float64Array(N);
  let tvMatchCount = 0;
  for (let i = 0; i < N; i++) {
    const tv = tvMap[DATA[i].t];
    if (tv) {
      tvMatchCount++;
      tvEqArr[i] = hasTvEq && tv[eqCol] !== '' ? parseFloat(tv[eqCol]) : NaN;
    } else {
      tvEqArr[i] = NaN;
    }
  }

  // Сигналы EL/ES/XL/XS
  const tvEL = new Uint8Array(N), tvES = new Uint8Array(N);
  const tvXL = new Uint8Array(N), tvXS = new Uint8Array(N);
  if (hasTvSigs) {
    for (let i = 0; i < N; i++) {
      const tv = tvMap[DATA[i].t];
      if (tv) {
        tvEL[i] = parseFloat(tv.el) || 0;
        tvES[i] = parseFloat(tv.es) || 0;
        tvXL[i] = parseFloat(tv.xl) || 0;
        tvXS[i] = parseFloat(tv.xs) || 0;
      }
    }
  }

  // Пивоты из TV
  const tvPvHi = new Uint8Array(N), tvPvLo = new Uint8Array(N);
  if (hasTvPivHi) {
    for (let i = 0; i < N; i++) {
      const tv = tvMap[DATA[i].t];
      if (tv) {
        tvPvHi[i] = parseFloat(tv.pv_hi) > 0 ? 1 : 0;
        tvPvLo[i] = parseFloat(tv.pv_lo) > 0 ? 1 : 0;
      }
    }
  }

  // Дополнительный CSV с пивотами (--pvcsv)
  const pvCsvArg = process.argv.indexOf('--pvcsv');
  if (pvCsvArg >= 0) {
    const { rows: pvRows, hdrs: pvHdrs } = parseCSV(process.argv[pvCsvArg + 1]);
    const pvMap = Object.create(null);
    for (const r of pvRows) pvMap[r.time] = r;
    for (let i = 0; i < N; i++) {
      const r = pvMap[DATA[i].t];
      if (r) {
        const cHi = pvHdrs.find(k => k.includes('pv_hi') || k.includes('pvhi'));
        const cLo = pvHdrs.find(k => k.includes('pv_lo') || k.includes('pvlo'));
        if (cHi) tvPvHi[i] = parseFloat(r[cHi]) > 0 ? 1 : 0;
        if (cLo) tvPvLo[i] = parseFloat(r[cLo]) > 0 ? 1 : 0;
      }
    }
  }

  return {
    N, tvMap, tvMatchCount,
    tvMAArr, tvEqArr,
    tvEL, tvES, tvXL, tvXS,
    tvPvHi, tvPvLo,
    hasTvMA, hasTvEq, hasTvSigs,
    hasTvPivHi: hasTvPivHi || pvCsvArg >= 0,
  };
}

// ── Построение BTF ────────────────────────────────────────────
function buildBTF(cfg, data) {
  const b   = cfg.btf;
  const N   = data.N;
  const btf = Object.assign({}, b);

  // ATR
  btf.atrPeriod = b.atrPeriod || 10;
  const atrArr  = calcRMA_ATR(btf.atrPeriod);

  // Пивоты
  let pvLo = new Uint8Array(N), pvHi = new Uint8Array(N);
  if (b.usePivot) {
    pvLo = calcPivotLow(b.pvL || 6, b.pvR || 5);
    pvHi = calcPivotHigh(b.pvL || 6, b.pvR || 5);
  }
  btf.pvLo  = pvLo;
  btf.pvHi_ = pvHi;

  // MA array
  if (b.useMA) {
    if (b.maSource === 'tv' && data.hasTvMA) {
      btf.maArr = data.tvMAArr;
    } else if (b.maSource === 'js' || (b.maSource === 'tv' && !data.hasTvMA)) {
      btf.maArr = calcHTFMA(DATA, b.htfRatio || 1, b.maP || 75, b.maType || 'WMA');
    } else {
      btf.useMA = false;
    }
  }

  // start: автовычисление на основе прогрева MA
  if (!btf.start) {
    const warmup = b.useMA ? (b.maP || 75) * (b.htfRatio || 1) : 50;
    btf.start = warmup + 2;
  }

  return { btf, atrArr, pvLo, pvHi };
}

// ── Сравнение equity ─────────────────────────────────────────
function compareEquity(result, data) {
  const { N, tvEqArr } = data;
  const pairs = [];
  for (let i = 0; i < N; i++) {
    if (!isNaN(tvEqArr[i])) {
      const jsEq = (result.eq[i] !== undefined ? result.eq[i] : 0);
      pairs.push({ i, jsEq, tvEq: tvEqArr[i] });
    }
  }
  if (pairs.length === 0) return null;

  const jsArr  = pairs.map(p => p.jsEq);
  const tvArr  = pairs.map(p => p.tvEq);
  const corr   = pearsonCorr(jsArr, tvArr);
  const rmse   = Math.sqrt(pairs.reduce((s,p) => s + (p.jsEq-p.tvEq)**2, 0) / pairs.length);
  const jsLast = pairs[pairs.length-1].jsEq;
  const tvLast = pairs[pairs.length-1].tvEq;

  // Первое расхождение > 0.5%
  let firstDiv = -1;
  for (let k = 0; k < pairs.length; k++) {
    if (Math.abs(pairs[k].jsEq - pairs[k].tvEq) > 0.5) { firstDiv = k; break; }
  }

  // Макс расхождение
  let maxDiff = 0, maxDiffBar = 0;
  for (const p of pairs) {
    const d = Math.abs(p.jsEq - p.tvEq);
    if (d > maxDiff) { maxDiff = d; maxDiffBar = p.i; }
  }

  // Блоки расхождений > 2%
  let inDiv = false, divStart = -1;
  const divergences = [];
  for (let k = 0; k < pairs.length; k++) {
    const d = Math.abs(pairs[k].jsEq - pairs[k].tvEq);
    if (!inDiv && d > 2.0)  { inDiv = true; divStart = k; }
    else if (inDiv && d < 0.5) { divergences.push({ start: divStart, end: k-1, pairs }); inDiv = false; }
  }
  if (inDiv) divergences.push({ start: divStart, end: pairs.length-1, pairs });

  return { pairs, corr, rmse, jsLast, tvLast, finalDiff: jsLast-tvLast, firstDiv, maxDiff, maxDiffBar, divergences };
}

// ── Трекинг сделок JS ─────────────────────────────────────────
// Упрощённый трекер для сравнения с TV (для сложных стратегий может отличаться от backtest)
function trackJSTrades(btf, atrArr, pvLo, pvHi) {
  const trades = [];
  const N = DATA.length;
  let inT = false, dir = 0, entry = 0, entryBar = -1, exitBar = -1, revSkip = 0;

  for (let i = btf.start; i < N; i++) {
    const bar = DATA[i];
    if (inT && i > entryBar) {
      let frc = false, exitP = 0, exitReason = '';

      // Rev (упрощённо: только pivots + revMode + revSkip)
      if (btf.useRev && (i - entryBar) >= (btf.revBars || 1)) {
        const piv    = dir === 1 ? pvHi[i] === 1 : pvLo[i] === 1;
        const cpnl   = dir * (bar.c - entry) / entry * 100;
        const modeOk = btf.revMode === 'any'
                    || (btf.revMode === 'plus'  && cpnl > 0)
                    || (btf.revMode === 'minus' && cpnl < 0);
        // MA-фильтр на rev (если revNoFilters=false)
        let maBlock = false;
        if (!btf.revNoFilters && btf.useMA && btf.maArr) {
          const ma = btf.maArr[i-1], c = DATA[i-1].c;
          maBlock = dir === 1 ? (ma > 0 && c <= ma) : (ma > 0 && c >= ma);
        }
        if (piv && modeOk && !maBlock) {
          if (revSkip >= (btf.revSkip || 0)) { frc = true; exitReason = 'Rev'; }
          else revSkip++;
        }
      }

      // SL
      if (!frc && btf.hasSLB) {
        const sl = entry * (1 - dir * btf.slPctMult / 100);
        if (dir === 1 && bar.l <= sl) { exitP = sl; exitReason = 'SL'; frc = true; }
        if (dir ===-1 && bar.h >= sl) { exitP = sl; exitReason = 'SL'; frc = true; }
      }
      // TP
      if (!frc && btf.hasTPA && btf.tpMode === 'pct') {
        const tp = entry * (1 + dir * btf.tpMult / 100);
        if (dir === 1 && bar.h >= tp) { exitP = tp; exitReason = 'TP'; frc = true; }
        if (dir ===-1 && bar.l <= tp) { exitP = tp; exitReason = 'TP'; frc = true; }
      }

      if (frc) {
        if (!exitP) exitP = bar.c;
        const pnl = dir * (exitP - entry) / entry * 100 - (btf.comm || 0) * 2;
        trades.push({ entryBar, exitBar: i, dir, entry, exit: exitP, pnl, reason: exitReason });
        inT = false; exitBar = i; revSkip = 0;
      }
    }

    if (!inT && i > exitBar) {
      const ma = (btf.useMA && btf.maArr) ? btf.maArr[i-1] : 0;
      const c  = DATA[i-1].c;
      const sigL = pvLo[i] === 1 && (ma <= 0 || c > ma);
      const sigS = pvHi[i] === 1 && (ma <= 0 || c < ma);
      if (sigL || sigS) {
        dir = sigL ? 1 : -1; entry = bar.c; inT = true; entryBar = i; revSkip = 0;
      }
    }
  }
  return trades;
}

// ── TV список сделок (из EL/ES/XL/XS) ────────────────────────
function buildTVTrades(data) {
  const { N, tvEL, tvES, tvXL, tvXS } = data;
  const trades = [];
  let inT = false, dir = 0, entryBar = -1, entryPrice = 0;
  for (let i = 0; i < N; i++) {
    if (!inT) {
      if (tvEL[i]) { inT = true; dir = 1;  entryBar = i; entryPrice = DATA[i].c; }
      if (tvES[i]) { inT = true; dir = -1; entryBar = i; entryPrice = DATA[i].c; }
    } else {
      if ((dir === 1 && tvXL[i]) || (dir === -1 && tvXS[i]) ||
          (dir === 1 && tvES[i]) || (dir === -1 && tvEL[i])) {
        const pnl = dir * (DATA[i].c - entryPrice) / entryPrice * 100;
        trades.push({ entryBar, exitBar: i, dir, entryPrice, exitPrice: DATA[i].c, pnl });
        inT = false;
        // Если это одновременно новый вход — фиксируем
        if ((dir === -1 && tvEL[i]) || (dir === 1 && tvES[i])) {
          dir = tvEL[i] ? 1 : -1; entryBar = i; entryPrice = DATA[i].c; inT = true;
        }
      }
    }
  }
  return trades;
}

// ── Сравнение пивотов ─────────────────────────────────────────
function comparePivots(pvLo, pvHi, data) {
  const { N, tvPvHi, tvPvLo } = data;
  let matchHi = 0, mismatchHi = 0, extraHi = 0;
  let matchLo = 0, mismatchLo = 0, extraLo = 0;
  const mismatchBarsHi = [], mismatchBarsLo = [];

  for (let i = 0; i < N; i++) {
    if (tvPvHi[i] || pvHi[i]) {
      if (tvPvHi[i] && pvHi[i])     matchHi++;
      else if (tvPvHi[i] && !pvHi[i]) { mismatchHi++; if (mismatchBarsHi.length < 5) mismatchBarsHi.push({ i, side: 'TV only' }); }
      else                             { extraHi++;    if (mismatchBarsHi.length < 5) mismatchBarsHi.push({ i, side: 'JS only' }); }
    }
    if (tvPvLo[i] || pvLo[i]) {
      if (tvPvLo[i] && pvLo[i])     matchLo++;
      else if (tvPvLo[i] && !pvLo[i]) { mismatchLo++; if (mismatchBarsLo.length < 5) mismatchBarsLo.push({ i, side: 'TV only' }); }
      else                             { extraLo++;    if (mismatchBarsLo.length < 5) mismatchBarsLo.push({ i, side: 'JS only' }); }
    }
  }
  return { matchHi, mismatchHi, extraHi, matchLo, mismatchLo, extraLo, mismatchBarsHi, mismatchBarsLo };
}

// ── Диагностика расхождения ───────────────────────────────────
function diagnoseDivergence(div, data, btf, pvLo, pvHi) {
  const { pairs } = div;
  const barI = pairs[div.start].i;
  const { tvEL, tvES, tvXL, tvXS, tvMAArr } = data;

  // Найти TV-сигнал ±20 баров от начала расхождения
  let tvSigBar = -1, tvSigType = '';
  for (let b = Math.max(0, barI - 20); b <= Math.min(DATA.length-1, barI + 5); b++) {
    if (tvEL[b]) { tvSigBar = b; tvSigType = 'EL'; break; }
    if (tvES[b]) { tvSigBar = b; tvSigType = 'ES'; break; }
  }

  const lines = [];
  lines.push(`   Δ при старте: ${(pairs[div.start].jsEq - pairs[div.start].tvEq).toFixed(2)}%  JS=${pairs[div.start].jsEq.toFixed(2)}%  TV=${pairs[div.start].tvEq.toFixed(2)}%`);

  if (tvSigBar >= 0) {
    lines.push(`   TV сигнал: ${tvSigType} бар #${tvSigBar} (${DATA[tvSigBar].t})  close=${DATA[tvSigBar].c}`);
    const sigType = tvSigType === 'EL' ? 'LONG' : 'SHORT';
    const needPiv = tvSigType === 'EL' ? pvLo[tvSigBar] : pvHi[tvSigBar];
    lines.push(`   JS pivot[${tvSigBar}] = ${needPiv} (${needPiv === 1 ? '✅ есть' : '❌ нет'})`);

    if (needPiv !== 1) {
      // Объяснить почему нет пивота
      const pvR = btf.pvR || 5, pvL2 = btf.pvL || 6;
      const center = tvSigBar - pvR;
      if (center >= 0) {
        const v = tvSigType === 'EL' ? DATA[center].l : DATA[center].h;
        lines.push(`   Центр пивота: бар #${center}  val=${v}`);
        let failBar = -1, failSide = '';
        for (let j = center - pvL2; j < center; j++) {
          const vj = tvSigType === 'EL' ? DATA[j].l : DATA[j].h;
          if (tvSigType === 'EL' ? vj < v : vj > v) { failBar = j; failSide = 'left'; break; }
        }
        for (let j = center + 1; j <= center + pvR; j++) {
          const vj = tvSigType === 'EL' ? DATA[j].l : DATA[j].h;
          if (tvSigType === 'EL' ? vj <= v : vj >= v) { failBar = j; failSide = 'right'; break; }
        }
        if (failBar >= 0) lines.push(`   ❌ Дисквалифицирован: бар #${failBar} (${failSide})`);
        else              lines.push(`   ⚠️  Pivot должен быть — проверь смещение индексов`);
      }
    }

    // MA-фильтр на вход
    if (btf.useMA && tvMAArr[tvSigBar-1]) {
      const ma = tvMAArr[tvSigBar-1], cl = DATA[tvSigBar-1].c;
      const blocks = tvSigType === 'EL' ? cl <= ma : cl >= ma;
      lines.push(`   MA вход: MA[${tvSigBar-1}]=${ma.toFixed(6)} close=${cl} → ${blocks ? '🚫 БЛОКИРУЕТ' : '✅ ok'}`);
    }
  }

  // Показать несколько баров вокруг начала
  lines.push(`   Бар#   | JS_eq%   | TV_eq%   | Δ%     | pvLo pvHi`);
  for (let k = Math.max(0, div.start-2); k <= Math.min(pairs.length-1, div.start+3); k++) {
    const p = pairs[k];
    const mark = k === div.start ? ' ◄' : '';
    lines.push(`   #${String(p.i).padStart(5)} | ${p.jsEq.toFixed(3).padStart(8)} | ${p.tvEq.toFixed(3).padStart(8)} | ${(p.jsEq-p.tvEq).toFixed(3).padStart(6)} | ${pvLo[p.i]}     ${pvHi[p.i]}${mark}`);
  }
  return lines.join('\n');
}

// ── Печать сводки MA ──────────────────────────────────────────
function compareMA(data, btf) {
  const { N, tvMAArr, hasTvMA } = data;
  if (!hasTvMA || !btf.useMA || btf.maSource !== 'tv') return null;

  // Для сравнения вычислим JS MA
  const jsMAArr = calcHTFMA(DATA, btf.htfRatio || 1, btf.maP || 75, btf.maType || 'WMA');
  let maxDiff = 0, maxBar = 0, diffCount = 0;
  for (let i = 0; i < N; i++) {
    if (!tvMAArr[i] || !jsMAArr[i]) continue;
    const d = Math.abs(jsMAArr[i] - tvMAArr[i]);
    if (d > maxDiff) { maxDiff = d; maxBar = i; }
    if (d / tvMAArr[i] > 0.0001) diffCount++;
  }
  return { maxDiff, maxBar, diffCount,
    tvVal: tvMAArr[maxBar], jsVal: jsMAArr[maxBar] };
}

// ── Главная функция ───────────────────────────────────────────
function run() {
  // Разбор аргументов
  const cfgArg = process.argv.indexOf('--config');
  let cfg = deepMerge(DEFAULT_CONFIG, {});

  if (cfgArg >= 0) {
    const cfgPath = process.argv[cfgArg + 1];
    try {
      const override = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      cfg = deepMerge(DEFAULT_CONFIG, override);
      console.log(`Конфиг: ${cfgPath}`);
    } catch (e) {
      console.error(`Ошибка чтения конфига ${cfgPath}: ${e.message}`);
      process.exit(1);
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  bt_compare: ${cfg.name}`);
  console.log(`${'═'.repeat(60)}\n`);

  // Загрузка данных
  const data = loadData(cfg);
  const N = data.N;
  console.log(`Данные: ${N} баров  (совпало с TV: ${data.tvMatchCount})`);
  console.log(`MA источник: ${data.hasTvMA && cfg.btf.maSource === 'tv' ? 'TV CSV ✅' : 'JS вычисление'}`);
  console.log(`Сигналы EL/ES/XL/XS: ${data.hasTvSigs ? 'есть ✅' : 'нет (торговой статистики не будет)'}`);

  // Построение BTF
  const { btf, atrArr, pvLo, pvHi } = buildBTF(cfg, data);

  // Вывод ключевых параметров BTF
  console.log(`\n── Параметры стратегии ──────────────────────────────`);
  console.log(`  SL: ${btf.hasSLB ? btf.slPctMult+'% pct' : btf.hasSLA ? btf.slMult+'×ATR' : 'нет'}`);
  console.log(`  TP: ${btf.hasTPA ? btf.tpMult+'% '+btf.tpMode : 'нет'}`);
  console.log(`  Comm: ${btf.comm}% / side  (round-trip ${(btf.comm*2).toFixed(2)}%)`);
  if (btf.useMA)    console.log(`  MA: ${btf.maType}(${btf.maP}) × ${btf.htfRatio}tf`);
  if (btf.usePivot) console.log(`  Pivot: pvL=${btf.pvL} pvR=${btf.pvR}`);
  if (btf.useRev)   console.log(`  Rev: skip=${btf.revSkip} bars=${btf.revBars} mode=${btf.revMode} noFilters=${btf.revNoFilters}`);
  console.log(`  ATR период: ${btf.atrPeriod}  start: ${btf.start}`);

  // Запуск backtest
  const result = backtest(pvLo, pvHi, atrArr, btf);

  // Сравнение equity
  const eq = compareEquity(result, data);

  // ── ИТОГ ───────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ИТОГ`);
  console.log(`${'─'.repeat(60)}`);

  if (eq) {
    const diffMark = Math.abs(eq.finalDiff) < 0.1 ? '✅' : Math.abs(eq.finalDiff) < 1 ? '⚠️ ' : '❌';
    console.log(`  PnL     JS: ${eq.jsLast.toFixed(2)}%    TV: ${eq.tvLast.toFixed(2)}%    Δ: ${eq.finalDiff.toFixed(2)}% ${diffMark}`);
    console.log(`  Корреляция: ${(eq.corr*100).toFixed(2)}%    RMSE: ${eq.rmse.toFixed(2)}%`);
    const firstDivBar = eq.firstDiv >= 0 ? `бар #${eq.pairs[eq.firstDiv].i}` : 'нет';
    console.log(`  Первое расхождение >0.5%: ${firstDivBar}`);
    console.log(`  Макс расхождение: ${eq.maxDiff.toFixed(2)}% на баре #${eq.maxDiffBar}`);
  } else {
    console.log(`  ⚠️  TV equity недоступна — сравнение невозможно`);
    console.log(`  JS PnL: ${result.pnl.toFixed(2)}%`);
  }

  // ── СДЕЛКИ ─────────────────────────────────────────────────
  console.log(`\n── Сделки ───────────────────────────────────────────`);
  console.log(`  JS (backtest): ${result.n} сделок  L=${result.nL} S=${result.nS}  WR=${result.wr.toFixed(1)}%`);
  if (data.hasTvSigs) {
    let tvELc = 0, tvESc = 0;
    for (let i = 0; i < N; i++) { if (data.tvEL[i]) tvELc++; if (data.tvES[i]) tvESc++; }
    const tvTotal = tvELc + tvESc;
    const countMark = Math.abs(result.n - tvTotal) <= 2 ? '✅' : Math.abs(result.n - tvTotal) <= 10 ? '⚠️ ' : '❌';
    console.log(`  TV (сигналы): ${tvTotal} сделок  EL=${tvELc} ES=${tvESc} ${countMark}`);
  }

  // ── ПИВОТЫ ─────────────────────────────────────────────────
  if (data.hasTvPivHi && btf.usePivot) {
    const pv = comparePivots(pvLo, pvHi, data);
    console.log(`\n── Пивоты (TV vs JS) ────────────────────────────────`);
    const hiMark = pv.mismatchHi === 0 && pv.extraHi === 0 ? '✅' : '❌';
    const loMark = pv.mismatchLo === 0 && pv.extraLo === 0 ? '✅' : '❌';
    console.log(`  pvHi: совпало=${pv.matchHi}  TV-only=${pv.mismatchHi}  JS-only=${pv.extraHi} ${hiMark}`);
    console.log(`  pvLo: совпало=${pv.matchLo}  TV-only=${pv.mismatchLo}  JS-only=${pv.extraLo} ${loMark}`);
    if (pv.mismatchBarsHi.length) console.log(`  Первые расхождения pvHi: ` + pv.mismatchBarsHi.map(b=>`#${b.i}(${b.side})`).join(', '));
    if (pv.mismatchBarsLo.length) console.log(`  Первые расхождения pvLo: ` + pv.mismatchBarsLo.map(b=>`#${b.i}(${b.side})`).join(', '));
  } else if (btf.usePivot) {
    console.log(`\n  ℹ️  TV пивоты не экспортированы. Добавь --pvcsv path/to/pivots.csv для сравнения.`);
  }

  // ── MA ─────────────────────────────────────────────────────
  const maComp = compareMA(data, btf);
  if (maComp) {
    console.log(`\n── MA (TV vs JS-вычисление) ─────────────────────────`);
    const maMark = maComp.diffCount === 0 ? '✅' : maComp.diffCount < 10 ? '⚠️ ' : '❌';
    console.log(`  Баров с расхождением >0.01%: ${maComp.diffCount} ${maMark}`);
    if (maComp.diffCount > 0)
      console.log(`  Макс: ${(maComp.maxDiff*100).toFixed(4)}% на баре #${maComp.maxBar}  TV=${maComp.tvVal.toFixed(8)}  JS=${maComp.jsVal.toFixed(8)}`);
  }

  // ── ПЕРВЫЕ 30 СДЕЛОК TV и JS ────────────────────────────────
  if (data.hasTvSigs) {
    const tvTrades = buildTVTrades(data);
    const jsTrades = trackJSTrades(btf, atrArr, pvLo, pvHi);

    const SHOW = 20;
    console.log(`\n── Первые ${SHOW} TV сделок ──────────────────────────────`);
    tvTrades.slice(0, SHOW).forEach((t, k) => {
      const dir = t.dir === 1 ? 'LONG ' : 'SHORT';
      console.log(`  TV#${String(k+1).padStart(2)}: бар #${t.entryBar}→#${t.exitBar || '?'} ${dir} @ ${t.entryPrice.toFixed(6)}`);
    });

    console.log(`\n── Первые ${SHOW} JS сделок (трекер) ────────────────────`);
    jsTrades.slice(0, SHOW).forEach((t, k) => {
      const dir = t.dir === 1 ? 'LONG ' : 'SHORT';
      console.log(`  JS#${String(k+1).padStart(2)}: бар #${t.entryBar}→#${t.exitBar} ${dir} @ ${t.entry.toFixed(6)} → ${t.exit.toFixed(6)} PnL=${t.pnl.toFixed(3)}% [${t.reason}]`);
    });

    // Синхронные/расходящиеся входы
    console.log(`\n── Сравнение входов (первые ${SHOW}) ─────────────────────`);
    const maxK = Math.max(tvTrades.length, jsTrades.length);
    let matchCount = 0, missTV = 0, missJS = 0;
    // Простое сравнение по порядку (без матчинга по времени)
    for (let k = 0; k < Math.min(SHOW, Math.max(tvTrades.length, jsTrades.length)); k++) {
      const tv = tvTrades[k], js = jsTrades[k];
      if (!tv && !js) break;
      const tvStr = tv ? `#${tv.entryBar}${tv.dir===1?'L':'S'}` : '---';
      const jsStr = js ? `#${js.entryBar}${js.dir===1?'L':'S'}` : '---';
      const match = tv && js && tv.entryBar === js.entryBar && tv.dir === js.dir;
      const mark  = match ? '✅' : (tv && js ? '⚠️' : '❌');
      console.log(`  ${String(k+1).padStart(2)}: TV=${tvStr.padEnd(7)} JS=${jsStr.padEnd(7)} ${mark}`);
      if (match) matchCount++;
    }
    const shown = Math.min(SHOW, Math.max(tvTrades.length, jsTrades.length));
    console.log(`  Совпадений: ${matchCount}/${shown}`);
  }

  // ── РАСХОЖДЕНИЯ ────────────────────────────────────────────
  if (eq && eq.divergences.length > 0) {
    const SHOW_DIV = Math.min(5, eq.divergences.length);
    console.log(`\n── Расхождения >2% (показываю ${SHOW_DIV} из ${eq.divergences.length}) ──────────`);
    for (let di = 0; di < SHOW_DIV; di++) {
      const div = eq.divergences[di];
      const barI   = div.pairs[div.start].i;
      const barEnd = div.pairs[div.end].i;
      console.log(`\n  Блок #${di+1}: бары #${barI}–#${barEnd}`);
      console.log(diagnoseDivergence(div, data, btf, pvLo, pvHi));
    }
  } else if (eq) {
    console.log(`\n  ✅ Нет расхождений >2%`);
  }

  // ── ИТОГОВЫЙ ВЕРДИКТ ───────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`);
  if (eq) {
    const ok = Math.abs(eq.finalDiff) < 0.1 && (eq.corr * 100) > 99;
    if (ok) {
      console.log(`  ✅ ОТЛИЧНО: JS точно воспроизводит TV`);
    } else if (Math.abs(eq.finalDiff) < 5) {
      console.log(`  ⚠️  БЛИЗКО: финальный PnL сходится, но есть временны́е расхождения`);
      console.log(`     Проверь: revMode, revNoFilters, revSkip, revBars`);
    } else {
      console.log(`  ❌ РАСХОЖДЕНИЕ: JS не совпадает с TV`);
      console.log(`     Рекомендации:`);
      if (!data.hasTvSigs)  console.log(`     • Добавь EL/ES/XL/XS в CSV для точного сравнения сделок`);
      if (!data.hasTvMA)    console.log(`     • Добавь колонку MA в CSV (maSource='tv') вместо JS-вычисления`);
      if (!data.hasTvPivHi) console.log(`     • Добавь пивоты в CSV (--pvcsv) для сравнения pivot-алгоритма`);
      console.log(`     • Проверь: revMode='plus', revNoFilters=true, revSkip, revBars`);
    }
  }
  console.log(`${'═'.repeat(60)}\n`);
}

run();
