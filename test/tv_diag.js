#!/usr/bin/env node
// ============================================================
// tv_diag.js — автоматическая диагностика TV vs JS расхождений
// Запуск: node test/tv_diag.js
// ============================================================

const fs   = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ── Загрузка JS-модулей в глобальный контекст ──────────────
// Заменяем const/let верхнего уровня на var чтобы попали в global через indirect eval
const _geval = eval; // indirect eval → global scope
const _load = f => {
  let code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  // Заменяем только top-level const/let (не внутри функций)
  code = code.replace(/^const ([A-Za-z_]\w*\s*=)/mg, 'var $1');
  code = code.replace(/^let ([A-Za-z_]\w*\s*=)/mg, 'var $1');
  _geval(code);
};

_load('sl_tp_registry.js');
_load('exit_registry.js');
_load('entry_registry.js');
_load('filter_registry.js');
_load('core.js');

// ── Парсинг CSV ─────────────────────────────────────────────
function parseCSV(filepath) {
  const lines = fs.readFileSync(filepath, 'utf8').trim().split('\n');
  const hdrs  = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g,'_').replace(/%/g,'pct'));
  return lines.slice(1).map(line => {
    const cols = line.split(',');
    const obj  = {};
    hdrs.forEach((h, i) => { obj[h] = cols[i] !== undefined ? cols[i].trim() : ''; });
    return obj;
  }).filter(r => r[hdrs[0]] !== '');
}

const ohlcvRows  = parseCSV(path.join(ROOT, 'test_data/ohlcv.csv'));
const tvRows     = parseCSV(path.join(ROOT, 'test_data/tv_equity.csv'));

// ── Построение DATA[] ────────────────────────────────────────
// Пользователь загрузил последние 10000 баров из 11480.
// Срез с бара SLICE_OFFSET: EL первой TV сделки попадает на бар ~310 среза (как в диагнозе #309)
const SLICE_OFFSET = ohlcvRows.length - 10000; // = 1480
global.DATA = ohlcvRows.slice(SLICE_OFFSET).map(r => ({
  t: r.time,
  o: parseFloat(r.open),
  h: parseFloat(r.high),
  l: parseFloat(r.low),
  c: parseFloat(r.close),
}));
const N = DATA.length; // ~10000

// ── MA из tv_equity.csv (WMA75×4tf — TV-значения) ───────────
const tvMap = Object.create(null);
for (const r of tvRows) tvMap[r.time] = r;

const tvMAArr = new Float64Array(N);
for (let i = 0; i < N; i++) {
  const tv = tvMap[DATA[i].t];
  tvMAArr[i] = tv && tv.ma !== '' ? parseFloat(tv.ma) : 0;
}

// ── Вычисляем MA через JS (для сравнения) ───────────────────
const jsMAArr = calcHTFMA(DATA, 4, 75, 'WMA');

// ── TV equity ────────────────────────────────────────────────
const tvEqArr = new Float64Array(N);
for (let i = 0; i < N; i++) {
  const tv = tvMap[DATA[i].t];
  tvEqArr[i] = tv && tv.equity_pct !== '' ? parseFloat(tv.equity_pct) : NaN;
}

// ── Сигналы TV (EL/ES/XL/XS) ────────────────────────────────
const tvEL = new Uint8Array(N), tvES = new Uint8Array(N);
const tvXL = new Uint8Array(N), tvXS = new Uint8Array(N);
for (let i = 0; i < N; i++) {
  const tv = tvMap[DATA[i].t];
  if (tv) {
    tvEL[i] = parseFloat(tv.el) || 0;
    tvES[i] = parseFloat(tv.es) || 0;
    tvXL[i] = parseFloat(tv.xl) || 0;
    tvXS[i] = parseFloat(tv.xs) || 0;
  }
}

// ── ATR ──────────────────────────────────────────────────────
const atrArr = calcRMA_ATR(10);

// ── Pivot arrays ─────────────────────────────────────────────
const pvLo = calcPivotLow(6, 5);
const pvHi = calcPivotHigh(6, 5);

// Тест: строгая pvHi (оба бока strict) — может совпасть с TV?
function calcPivotHighStrict(left, right) {
  // Оба бока строгие: центр > левые И центр > правые (равные с любой стороны дисквалиф)
  const N = DATA.length, res = new Uint8Array(N);
  for (let i = left + right; i < N; i++) {
    const idx = i - right, v = DATA[idx].h;
    let ok = true;
    for (let j = idx - left; j < idx; j++) { if (DATA[j].h >= v) { ok = false; break; } }
    if (ok) for (let j = idx + 1; j <= Math.min(idx + right, N-1); j++) { if (DATA[j].h >= v) { ok = false; break; } }
    if (ok) res[i] = 1;
  }
  return res;
}
// Альтернативная pvHi: LEFT strict (>=), RIGHT non-strict (>) → ранний бар выигрывает
function calcPivotHighLeftStrict(left, right) {
  const N = DATA.length, res = new Uint8Array(N);
  for (let i = left + right; i < N; i++) {
    const idx = i - right, v = DATA[idx].h;
    let ok = true;
    for (let j = idx - left; j < idx; j++) { if (DATA[j].h >= v) { ok = false; break; } }
    if (ok) for (let j = idx + 1; j <= Math.min(idx + right, N-1); j++) { if (DATA[j].h > v) { ok = false; break; } }
    if (ok) res[i] = 1;
  }
  return res;
}
const pvHiStrict = calcPivotHighStrict(6, 5);
const pvHiLeftStrict = calcPivotHighLeftStrict(6, 5);

// ── btCfg ────────────────────────────────────────────────────
// SL: pct 10%  TP: pct 2%  Commission: 0.1%
// useMA: WMA75×4tf  usePivot: pvL6 pvR5  useRev: mb1 sk1
const BTF = {
  // SL / TP
  hasSLA: false, slMult: 0,
  hasSLB: true,  slPctMult: 10, slLogic: 'or',
  hasTPA: true,  tpMult: 2,  tpMode: 'pct',
  hasTPB: false, tpMultB: 0, tpModeB: 'rr', tpLogic: 'or',
  // Commission (одна сторона, backtest умножает на 2)
  // TV показывает 1.9% на 2% TP-сделках → round-trip комиссия = 0.1% → одна сторона = 0.05%
  comm: 0.05,
  // MA filter
  useMA: true, maArr: tvMAArr, maType: 'WMA', maP: 75, htfRatio: 4,
  // Pivot entry
  usePivot: true, pvLo, pvHi_: pvHi, pvL: 6, pvR: 5,
  // Rev signal
  useRev: true, revBars: 1, revSkip: 1, revMode: 'any', revAct: 'exit',
  revSrc: 'same', revCooldown: 0,
  // Other flags off
  useEngulf: false, usePinBar: false, useBoll: false, useDonch: false,
  useAtrBo: false, useSqueeze: false, useMaTouch: false, useClimax: false,
  useBE: false, beTrig: 0.5, beOff: 0,
  useTrail: false, trTrig: 0.5, trDist: 0.5,
  usePartial: false, partRR: 1, partPct: 50,
  useTime: false, timeBars: 0,
  longOnly: false, shortOnly: false,
  useADX: false, useRSI: false, useAtrExp: false,
  useSTrend: false, sTrendWin: 1,
  useConfirm: false, confN: 0,
  // Start: Math.max(75*4, 50) + 2
  start: 302,
  // Other
  waitBars: 0, waitRetrace: false, waitMaxBars: 0, waitCancelAtr: 0,
  atrPeriod: 10,
};

// ── Запуск backtest с записью сделок ─────────────────────────
// Патчим backtest чтобы захватить индивидуальные сделки
const jsTrades = []; // {entryBar, exitBar, dir, entry, exit, pnl}
const _origBacktest = backtest;
function backtestWithTrades(pvLo, pvHi, atrArr, cfg) {
  // Запустим вручную упрощённый трекинг поверх результата backtest
  const r = _origBacktest(pvLo, pvHi, atrArr, cfg);
  return r;
}

// Инструментируем через прокси-логику: прогоним простой трекер
(function trackTrades() {
  let inT = false, dir = 0, entry = 0, entryBar = -1;
  let exitBar = -1;
  let revSkip = 0;
  const start = BTF.start;
  const hasSLB = BTF.hasSLB, slPct = BTF.slPctMult;
  const hasTPA = BTF.hasTPA, tpPct = BTF.tpMult;

  for (let i = start; i < N; i++) {
    const bar = DATA[i];
    const ac = atrArr[i-1];
    if (inT && i > entryBar) {
      let frc = false;
      // RevSig (revBars=1, revSkip=1)
      if ((i - entryBar) >= BTF.revBars) {
        const oppSig = dir === 1 ? pvHi[i] === 1 : pvLo[i] === 1;
        if (oppSig) {
          if (revSkip >= BTF.revSkip) { frc = true; }
          else { revSkip++; }
        }
      }
      // SL/TP
      const sl = entry * (1 - dir * slPct / 100);
      const tp = entry * (1 + dir * tpPct / 100);
      let exitP = 0, exitReason = '';
      if (!frc) {
        if (dir === 1 && bar.l <= sl) { exitP = sl; exitReason = 'SL'; frc = true; }
        else if (dir === -1 && bar.h >= sl) { exitP = sl; exitReason = 'SL'; frc = true; }
        else if (dir === 1 && bar.h >= tp) { exitP = tp; exitReason = 'TP'; frc = true; }
        else if (dir === -1 && bar.l <= tp) { exitP = tp; exitReason = 'TP'; frc = true; }
      }
      if (frc) {
        if (!exitP) { exitP = bar.c; exitReason = exitReason || 'Rev'; }
        const pnl = dir * (exitP - entry) / entry * 100 - BTF.comm * 2;
        jsTrades.push({ entryBar, exitBar: i, dir, entry, exit: exitP, pnl, reason: exitReason });
        inT = false; exitBar = i; revSkip = 0;
      }
    }
    if (!inT && i > exitBar) {
      // MA filter
      const ma = tvMAArr[i-1];
      const c = DATA[i-1].c;
      let sigL = pvLo[i] === 1 && (ma <= 0 || c > ma);
      let sigS = pvHi[i] === 1 && (ma <= 0 || c < ma);
      if (sigL || sigS) {
        dir = sigL ? 1 : -1;
        entry = bar.c;
        inT = true; entryBar = i; revSkip = 0;
      }
    }
  }
})();

const result = backtest(pvLo, pvHi, atrArr, BTF);
if (!result) { console.error('backtest вернул null'); process.exit(1); }

const jsEq = result.eq;

// ── Сравнение equity ─────────────────────────────────────────
const pairs = [];
for (let i = 0; i < N; i++) {
  if (!isNaN(tvEqArr[i])) pairs.push({ i, jsEq: jsEq[i], tvEq: tvEqArr[i] });
}

const jsArr = pairs.map(p => p.jsEq);
const tvArr = pairs.map(p => p.tvEq);

// Корреляция
const jsMean = jsArr.reduce((s,v) => s+v, 0) / jsArr.length;
const tvMean = tvArr.reduce((s,v) => s+v, 0) / tvArr.length;
let num=0, denJ=0, denT=0;
for (let k=0; k<jsArr.length; k++) {
  const dj=jsArr[k]-jsMean, dt=tvArr[k]-tvMean;
  num+=dj*dt; denJ+=dj*dj; denT+=dt*dt;
}
const corr  = (denJ>0&&denT>0) ? num/Math.sqrt(denJ*denT) : 0;
const rmse  = Math.sqrt(pairs.reduce((s,p)=>s+Math.pow(p.jsEq-p.tvEq,2),0)/pairs.length);
const jsLast = jsArr[jsArr.length-1];
const tvLast = tvArr[tvArr.length-1];
const finalDiff = jsLast - tvLast;

// Первое расхождение > 0.5%
let firstDivIdx = -1;
for (let k=0; k<pairs.length; k++) {
  if (Math.abs(pairs[k].jsEq - pairs[k].tvEq) > 0.5) { firstDivIdx = k; break; }
}

// Макс расхождение
let maxDiff=0, maxDiffBar=0;
for (const p of pairs) {
  const d = Math.abs(p.jsEq-p.tvEq);
  if (d>maxDiff) { maxDiff=d; maxDiffBar=p.i; }
}

// ── Сравнение MA arrays ──────────────────────────────────────
let maMaxDiff=0, maMaxBar=0, maDiffCount=0;
for (let i=0; i<N; i++) {
  if (tvMAArr[i]===0 || jsMAArr[i]===0) continue;
  const d = Math.abs(jsMAArr[i]-tvMAArr[i]);
  if (d>maMaxDiff) { maMaxDiff=d; maMaxBar=i; }
  if (d/tvMAArr[i]>0.0001) maDiffCount++;
}

// ── Вывод сводки ─────────────────────────────────────────────
console.log('=== TV vs JS ДИАГНОСТИКА ===');
console.log(`Баров: ${N} (DATA) / ${pairs.length} (совпало с TV)`);
console.log(`Корреляция: ${(corr*100).toFixed(2)}%  RMSE: ${rmse.toFixed(2)}%`);
console.log(`JS итог: ${jsLast.toFixed(2)}%  TV итог: ${tvLast.toFixed(2)}%  Δ: ${finalDiff.toFixed(2)}%`);
console.log(`Первое расхождение >0.5%: ${firstDivIdx>=0 ? `бар #${pairs[firstDivIdx].i} (${DATA[pairs[firstDivIdx].i].t})` : 'нет'}`);
console.log(`Макс расхождение: ${maxDiff.toFixed(2)}% на баре #${maxDiffBar}`);
console.log(`JS PnL: ${result.pnl.toFixed(2)}%  trades: ${result.n}  WR: ${result.wr.toFixed(1)}%`);

console.log('\n=== СРАВНЕНИЕ MA (JS vs TV) ===');
console.log(`Макс расхождение MA: ${(maMaxDiff*100).toFixed(6)}% на баре #${maMaxBar}`);
console.log(`Баров с расхождением MA > 0.01%: ${maDiffCount}`);
if (maMaxBar > 0) {
  console.log(`  TV MA[${maMaxBar}] = ${tvMAArr[maMaxBar].toFixed(8)}`);
  console.log(`  JS MA[${maMaxBar}] = ${jsMAArr[maMaxBar].toFixed(8)}`);
}

// ── Детальный анализ расхождений ─────────────────────────────
console.log('\n=== ВСЕ РАСХОЖДЕНИЯ > 2% ===');

// Группируем: расхождение "началось" когда Δ > 2% и прошлое было < 1%
let inDivergence = false;
let divStart = -1;
const divergences = [];
for (let k=0; k<pairs.length; k++) {
  const d = Math.abs(pairs[k].jsEq - pairs[k].tvEq);
  if (!inDivergence && d > 2.0) {
    inDivergence = true; divStart = k;
  } else if (inDivergence && d < 0.5) {
    divergences.push({ start: divStart, end: k-1 });
    inDivergence = false;
  }
}
if (inDivergence) divergences.push({ start: divStart, end: pairs.length-1 });

if (divergences.length === 0) {
  console.log('Нет расхождений > 2%');
} else {
  console.log(`Обнаружено ${divergences.length} блоков расхождений\n`);
}

// Показываем первые 5 расхождений подробно
const SHOW = Math.min(5, divergences.length);
for (let di=0; di<SHOW; di++) {
  const { start, end } = divergences[di];
  const barI   = pairs[start].i;
  const barEnd = pairs[end].i;

  // Найти первый TV сигнал до или в этой точке (±20 баров)
  let tvSigBar = -1, tvSigType = '';
  for (let b = Math.max(0, barI-20); b <= Math.min(N-1, barI+5); b++) {
    if (tvEL[b]) { tvSigBar=b; tvSigType='EL'; break; }
    if (tvES[b]) { tvSigBar=b; tvSigType='ES'; break; }
  }

  console.log(`── Блок #${di+1}: бары #${barI}–#${barEnd} ──`);
  console.log(`   Δ при старте: ${(pairs[start].jsEq - pairs[start].tvEq).toFixed(2)}%  JS=${pairs[start].jsEq.toFixed(2)}%  TV=${pairs[start].tvEq.toFixed(2)}%`);
  if (tvSigBar>=0) console.log(`   TV сигнал: ${tvSigType} на баре #${tvSigBar} (${DATA[tvSigBar].t})  close=${DATA[tvSigBar].c}`);

  // Показать 5 баров вокруг начала расхождения
  console.log(`   Бар#  | JS_eq%   | TV_eq%   | Δ%     | pvLo pvHi | EL ES XL XS`);
  for (let b = Math.max(0, barI-3); b <= Math.min(N-1, barI+4); b++) {
    const p = pairs.find(p=>p.i===b);
    if (!p) continue;
    const mark = b===barI ? '◄' : ' ';
    console.log(
      `   #${String(b).padStart(5)} | ${p.jsEq.toFixed(3).padStart(8)} | ${p.tvEq.toFixed(3).padStart(8)} | ${(p.jsEq-p.tvEq).toFixed(3).padStart(6)} | ${pvLo[b]}     ${pvHi[b]}   | ${tvEL[b]} ${tvES[b]} ${tvXL[b]} ${tvXS[b]} ${mark}`
    );
  }

  // Если TV открыл сделку но JS не открыл — показать
  if (tvSigBar >= 0) {
    const sigType = tvSigType === 'EL' ? 'LONG' : 'SHORT';
    const needPiv = tvSigType === 'EL' ? pvLo[tvSigBar] : pvHi[tvSigBar];
    console.log(`\n   ДИАГНОЗ: TV открыл ${sigType} на баре #${tvSigBar}`);
    console.log(`   JS pivot[${tvSigBar}] = ${needPiv} (${needPiv===1 ? '✅' : '❌ НЕ ВИДИТ'})`);

    if (needPiv !== 1) {
      // Проверить почему нет pivot
      const pvR = 5, pvL = 6;
      if (tvSigType === 'EL') {
        const center = tvSigBar - pvR;
        const v = DATA[center].l;
        console.log(`   Центр pivot: бар #${center}  low=${v}`);
        // Проверить левые бары
        let failBar = -1, failSide = '';
        for (let j=center-pvL; j<center; j++) {
          if (DATA[j].l < v) { failBar=j; failSide='left'; break; }
        }
        for (let j=center+1; j<=center+pvR; j++) {
          if (DATA[j].l <= v) { failBar=j; failSide='right'; break; }
        }
        if (failBar>=0) console.log(`   ❌ Дисквалифицирован: бар #${failBar} (${failSide}) low=${DATA[failBar].l} ${failSide==='left'?'<':'<='} center=${v}`);
        else console.log(`   ⚠️  Pivot должен быть обнаружен — проверь смещение индексов`);
      }
    }

    // Проверить MA filter
    const maVal = tvMAArr[tvSigBar-1];
    const closeVal = DATA[tvSigBar-1].c;
    const maBlock = maVal > 0 && (tvSigType==='EL' ? closeVal <= maVal : closeVal >= maVal);
    console.log(`   MA filter: MA[${tvSigBar-1}]=${maVal.toFixed(6)} close[${tvSigBar-1}]=${closeVal} → ${maBlock ? '🚫 БЛОКИРУЕТ' : '✅ ok'}`);
  }
  console.log('');
}

// ── Сравнение trade count ────────────────────────────────────
let tvTrades = 0, tvELcount = 0, tvEScount = 0;
for (let i=0; i<N; i++) {
  if (tvEL[i]) { tvTrades++; tvELcount++; }
  if (tvES[i]) { tvTrades++; tvEScount++; }
}
console.log(`=== СДЕЛКИ ===`);
console.log(`JS: ${result.n} сделок (L=${result.nL} S=${result.nS})  TV: ${tvTrades} (EL=${tvELcount} ES=${tvEScount})`);
console.log(`JS трекер записал: ${jsTrades.length} сделок`);

// Первые 30 TV сделок (по EL/ES)
console.log('\n=== ПЕРВЫЕ 30 TV СДЕЛОК ===');
const tvTradeList = [];
for (let i=0; i<N; i++) {
  if (tvEL[i] || tvES[i]) tvTradeList.push({ bar: i, dir: tvEL[i] ? 1 : -1, t: DATA[i].t, c: DATA[i].c });
}
tvTradeList.slice(0, 30).forEach((t, k) => {
  console.log(`  TV#${k+1}: бар #${t.bar} ${t.dir===1?'LONG':'SHORT'} @ ${t.c} (${t.t})`);
});

// Первые 30 JS сделок из трекера
console.log('\n=== ПЕРВЫЕ 30 JS СДЕЛОК (трекер) ===');
jsTrades.slice(0, 30).forEach((t, k) => {
  console.log(`  JS#${k+1}: бар #${t.entryBar}→#${t.exitBar} ${t.dir===1?'LONG':'SHORT'} @ ${t.entry.toFixed(6)} → ${t.exit.toFixed(6)} PnL=${t.pnl.toFixed(3)}% [${t.reason}]`);
});

// ── MA сравнение по первым несовпадениям ─────────────────────
if (maDiffCount > 0) {
  console.log('\n=== ПЕРВЫЕ 5 РАСХОЖДЕНИЙ MA ===');
  let shown = 0;
  for (let i=0; i<N && shown<5; i++) {
    if (tvMAArr[i]===0||jsMAArr[i]===0) continue;
    const d = Math.abs(jsMAArr[i]-tvMAArr[i]);
    if (d/tvMAArr[i] > 0.0001) {
      console.log(`  бар #${i}: JS=${jsMAArr[i].toFixed(8)} TV=${tvMAArr[i].toFixed(8)} Δ=${((jsMAArr[i]-tvMAArr[i])/tvMAArr[i]*100).toFixed(4)}%`);
      shown++;
    }
  }
}

// ── Детальный трейс сделки #1 (бар 300-360) ─────────────────
console.log('\n=== ТРЕЙС СДЕЛКИ #1 (бары 300-360) с OHLC ===');
console.log('Бар#  | pvLo pvHi | TV sigs  | open        high        low         close      ');
for (let b = 300; b <= 360; b++) {
  const tvSig = tvEL[b]?'EL':tvES[b]?'ES':tvXL[b]?'XL':tvXS[b]?'XS':'--';
  const d = DATA[b];
  const pvH_mark = pvHi[b] ? ` ← pvHi (center=${b-5})` : '';
  const pvL_mark = pvLo[b] ? ` ← pvLo (center=${b-5})` : '';
  console.log(`  #${String(b).padStart(5)} | ${pvLo[b]}     ${pvHi[b]}   | ${tvSig}       | ${d.o.toFixed(6)}  ${d.h.toFixed(6)}  ${d.l.toFixed(6)}  ${d.c.toFixed(6)}${pvH_mark}${pvL_mark}`);
}

// ── Анализ pivot HIGH центр #308 (pvHi[313]) ────────────────
console.log('\n=== АНАЛИЗ pvHi центр #308 (pvHi[313]=1 в JS) ===');
const ctr308 = 308, pvL=6, pvR=5;
const v308 = DATA[ctr308].h;
console.log(`Центр #308: high=${v308}`);
console.log('Левые бары (302-307):');
for (let j=ctr308-pvL; j<ctr308; j++) {
  const cond = DATA[j].h > v308 ? '❌ ДИСКВАЛИФ(>)' : DATA[j].h === v308 ? '⚠️ РАВНО' : '✅ ok';
  console.log(`  бар #${j}: high=${DATA[j].h} ${cond}`);
}
console.log('Правые бары (309-313):');
for (let j=ctr308+1; j<=ctr308+pvR; j++) {
  const cond = DATA[j].h >= v308 ? '❌ ДИСКВАЛИФ(>=)' : '✅ ok';
  console.log(`  бар #${j}: high=${DATA[j].h} ${cond}`);
}

// ── Анализ pivot HIGH центр #318 (pvHi[323]=1 в JS) ────────────────
console.log('\n=== АНАЛИЗ pvHi центр #318 (pvHi[323]=1 в JS) ===');
const ctr318 = 318;
const v318 = DATA[ctr318].h;
console.log(`Центр #318: high=${v318}`);
console.log('Левые бары (312-317):');
for (let j=ctr318-pvL; j<ctr318; j++) {
  const cond = DATA[j].h > v318 ? '❌ ДИСКВАЛИФ(>)' : DATA[j].h === v318 ? '⚠️ РАВНО' : '✅ ok';
  console.log(`  бар #${j}: high=${DATA[j].h} ${cond}`);
}
console.log('Правые бары (319-323):');
for (let j=ctr318+1; j<=ctr318+pvR; j++) {
  const cond = DATA[j].h >= v318 ? '❌ ДИСКВАЛИФ(>=)' : '✅ ok';
  console.log(`  бар #${j}: high=${DATA[j].h} ${cond}`);
}

// ── Тест альтернативных pvHi ────────────────────────────────
console.log('\n=== ТЕСТ АЛЬТЕРНАТИВНЫХ pvHi ===');
function countTradesWithPvHi(pvHiAlt) {
  let inT = false, dir = 0, entry = 0, entryBar = -1, exitBar = -1, revSkip = 0, cnt = 0;
  const start2 = BTF.start;
  for (let i = start2; i < N; i++) {
    const bar = DATA[i];
    if (inT && i > entryBar) {
      let frc = false;
      if ((i - entryBar) >= BTF.revBars) {
        const oppSig = dir === 1 ? pvHiAlt[i] === 1 : pvLo[i] === 1;
        if (oppSig) {
          if (revSkip >= BTF.revSkip) { frc = true; }
          else { revSkip++; }
        }
      }
      const sl = entry * (1 - dir * BTF.slPctMult / 100);
      const tp = entry * (1 + dir * BTF.tpMult / 100);
      if (!frc) {
        if (dir===1 && bar.l<=sl) frc=true;
        else if (dir===-1 && bar.h>=sl) frc=true;
        else if (dir===1 && bar.h>=tp) frc=true;
        else if (dir===-1 && bar.l<=tp) frc=true;
      }
      if (frc) { inT=false; exitBar=i; revSkip=0; cnt++; }
    }
    if (!inT && i > exitBar) {
      const ma = tvMAArr[i-1];
      const c = DATA[i-1].c;
      const sigL = pvLo[i] === 1 && (ma <= 0 || c > ma);
      const sigS = pvHiAlt[i] === 1 && (ma <= 0 || c < ma);
      if (sigL || sigS) { dir=sigL?1:-1; entry=bar.c; inT=true; entryBar=i; revSkip=0; }
    }
  }
  return cnt;
}
const cnt_curr    = countTradesWithPvHi(pvHi);
const cnt_strict  = countTradesWithPvHi(pvHiStrict);
const cnt_lstric  = countTradesWithPvHi(pvHiLeftStrict);
console.log(`Текущая pvHi (left non-strict, right strict):  ${cnt_curr} сделок`);
console.log(`Строгая pvHi (оба strict):                     ${cnt_strict} сделок`);
console.log(`Left-strict pvHi (left strict, right loose):  ${cnt_lstric} сделок`);
console.log(`TV: 155 сделок`);

// Показать pvHi[313] для каждого варианта
console.log(`\npvHi[313] (center=308): curr=${pvHi[313]} strict=${pvHiStrict[313]} lstric=${pvHiLeftStrict[313]}`);
console.log(`pvHi[323] (center=318): curr=${pvHi[323]} strict=${pvHiStrict[323]} lstric=${pvHiLeftStrict[323]}`);
console.log(`pvHi[334] (center=329): curr=${pvHi[334]} strict=${pvHiStrict[334]} lstric=${pvHiLeftStrict[334]}`);
console.log(`pvHi[344] (center=339): curr=${pvHi[344]} strict=${pvHiStrict[344]} lstric=${pvHiLeftStrict[344]}`);

// ── ГИПОТЕЗА: RevSig использует sig_s (с MA-фильтром) вместо pat_s ──────────
// Пользователь намекнул: "не ищет другие точки входа во время сделки"
// → RevSig проверяет не просто pvHi, а pvHi + MA filter (как при входе)
console.log('\n=== ТЕСТ: RevSig с MA-фильтром (sig_s вместо pat_s) ===');
function countTradesRevFiltered() {
  let inT = false, dir = 0, entry = 0, entryBar = -1, exitBar = -1, revSkip = 0, cnt = 0;
  const start2 = BTF.start;
  for (let i = start2; i < N; i++) {
    const bar = DATA[i];
    if (inT && i > entryBar) {
      let frc = false;
      if ((i - entryBar) >= BTF.revBars) {
        const ma   = tvMAArr[i-1];
        const prev = DATA[i-1].c;
        // MA-фильтрованный RevSig: как при входе
        const oppSig = dir === 1
          ? (pvHi[i] === 1 && (ma <= 0 || prev < ma))   // SHORT entry allowed (below MA)
          : (pvLo[i] === 1 && (ma <= 0 || prev > ma));   // LONG entry allowed (above MA)
        if (oppSig) {
          if (revSkip >= BTF.revSkip) { frc = true; }
          else { revSkip++; }
        }
      }
      const sl = entry * (1 - dir * BTF.slPctMult / 100);
      const tp = entry * (1 + dir * BTF.tpMult / 100);
      if (!frc) {
        if (dir===1 && bar.l<=sl) frc=true;
        else if (dir===-1 && bar.h>=sl) frc=true;
        else if (dir===1 && bar.h>=tp) frc=true;
        else if (dir===-1 && bar.l<=tp) frc=true;
      }
      if (frc) { inT=false; exitBar=i; revSkip=0; cnt++; }
    }
    if (!inT && i > exitBar) {
      const ma = tvMAArr[i-1];
      const c = DATA[i-1].c;
      const sigL = pvLo[i] === 1 && (ma <= 0 || c > ma);
      const sigS = pvHi[i] === 1 && (ma <= 0 || c < ma);
      if (sigL || sigS) { dir=sigL?1:-1; entry=bar.c; inT=true; entryBar=i; revSkip=0; }
    }
  }
  return cnt;
}
const cnt_rev_filt = countTradesRevFiltered();
console.log(`RevSig с MA-фильтром: ${cnt_rev_filt} сделок  (TV: 155)`);

// Детальный трекер с MA-фильтрованным RevSig (первые 30 сделок)
console.log('\n=== ПЕРВЫЕ 30 JS СДЕЛОК (RevSig с MA-фильтром) ===');
{
  const filtTrades = [];
  let inT=false, dir=0, entry=0, entryBar=-1, exitBar=-1, revSkip=0;
  for (let i = BTF.start; i < N; i++) {
    const bar = DATA[i];
    if (inT && i > entryBar) {
      let frc=false, exitP=0, exitReason='';
      if ((i - entryBar) >= BTF.revBars) {
        const ma=tvMAArr[i-1], prev=DATA[i-1].c;
        const oppSig = dir===1
          ? (pvHi[i]===1 && (ma<=0 || prev<ma))
          : (pvLo[i]===1 && (ma<=0 || prev>ma));
        if (oppSig) {
          if (revSkip >= BTF.revSkip) { frc=true; exitReason='Rev'; }
          else revSkip++;
        }
      }
      const sl=entry*(1-dir*BTF.slPctMult/100), tp=entry*(1+dir*BTF.tpMult/100);
      if (!frc) {
        if (dir===1&&bar.l<=sl){exitP=sl;exitReason='SL';frc=true;}
        else if(dir===-1&&bar.h>=sl){exitP=sl;exitReason='SL';frc=true;}
        else if(dir===1&&bar.h>=tp){exitP=tp;exitReason='TP';frc=true;}
        else if(dir===-1&&bar.l<=tp){exitP=tp;exitReason='TP';frc=true;}
      }
      if (frc) {
        if (!exitP) exitP=bar.c;
        const pnl=dir*(exitP-entry)/entry*100-BTF.comm*2;
        filtTrades.push({entryBar,exitBar:i,dir,entry,exit:exitP,pnl,reason:exitReason});
        inT=false; exitBar=i; revSkip=0;
      }
    }
    if (!inT && i>exitBar) {
      const ma=tvMAArr[i-1], c=DATA[i-1].c;
      const sigL=pvLo[i]===1&&(ma<=0||c>ma);
      const sigS=pvHi[i]===1&&(ma<=0||c<ma);
      if (sigL||sigS){dir=sigL?1:-1;entry=bar.c;inT=true;entryBar=i;revSkip=0;}
    }
  }
  filtTrades.slice(0,30).forEach((t,k)=>{
    console.log(`  JS#${k+1}: бар #${t.entryBar}→#${t.exitBar} ${t.dir===1?'LONG':'SHORT'} @ ${t.entry.toFixed(6)} → ${t.exit.toFixed(6)} PnL=${t.pnl.toFixed(3)}% [${t.reason}]`);
  });
}

// ── Детальное сравнение TV vs JS (MA-фильтрованный RevSig) ──────────────────
console.log('\n=== ПОДРОБНОЕ СРАВНЕНИЕ TV vs JS(MA-фильтр) — первые 60 сделок ===');
{
  // Перестраиваем JS сделки с MA-фильтром RevSig
  const jsFT = [];
  let inT=false, dir=0, entry=0, entryBar=-1, exitBar=-1, revSkip=0;
  for (let i = BTF.start; i < N; i++) {
    const bar = DATA[i];
    if (inT && i > entryBar) {
      let frc=false, exitP=0, exitReason='';
      if ((i - entryBar) >= BTF.revBars) {
        const ma=tvMAArr[i-1], prev=DATA[i-1].c;
        const oppSig = dir===1
          ? (pvHi[i]===1 && (ma<=0 || prev<ma))
          : (pvLo[i]===1 && (ma<=0 || prev>ma));
        if (oppSig) {
          if (revSkip >= BTF.revSkip) { frc=true; exitReason='Rev'; }
          else revSkip++;
        }
      }
      const sl=entry*(1-dir*BTF.slPctMult/100), tp=entry*(1+dir*BTF.tpMult/100);
      if (!frc) {
        if (dir===1&&bar.l<=sl){exitP=sl;exitReason='SL';frc=true;}
        else if(dir===-1&&bar.h>=sl){exitP=sl;exitReason='SL';frc=true;}
        else if(dir===1&&bar.h>=tp){exitP=tp;exitReason='TP';frc=true;}
        else if(dir===-1&&bar.l<=tp){exitP=tp;exitReason='TP';frc=true;}
      }
      if (frc) {
        if (!exitP) exitP=bar.c;
        const pnl=dir*(exitP-entry)/entry*100-BTF.comm*2;
        jsFT.push({entryBar,exitBar:i,dir,entry,exit:exitP,pnl,reason:exitReason});
        inT=false; exitBar=i; revSkip=0;
      }
    }
    if (!inT && i>exitBar) {
      const ma=tvMAArr[i-1], c=DATA[i-1].c;
      const sigL=pvLo[i]===1&&(ma<=0||c>ma);
      const sigS=pvHi[i]===1&&(ma<=0||c<ma);
      if (sigL||sigS){dir=sigL?1:-1;entry=bar.c;inT=true;entryBar=i;revSkip=0;}
    }
  }

  const SHOW2 = 60;
  let jk = 0, tk = 0;
  const rows2 = [];
  while (jk < jsFT.length || tk < tvTradeList.length) {
    const jt = jsFT[jk], tt = tvTradeList[tk];
    if (!jt && !tt) break;
    const jBar = jt ? jt.entryBar : Infinity;
    const tBar = tt ? tt.bar : Infinity;
    if (jBar <= tBar) {
      rows2.push({
        jBar: jt.entryBar, jXBar: jt.exitBar, jDir: jt.dir===1?'L':'S', jReason: jt.reason,
        tBar: tt && tt.bar === jt.entryBar ? tt.bar : -1,
        tDir: tt && tt.bar === jt.entryBar ? (tt.dir===1?'L':'S') : '',
        match: tt && tt.bar === jt.entryBar,
      });
      jk++;
      if (tt && tt.bar === jt.entryBar) tk++;
    } else {
      rows2.push({
        jBar: -1, tBar: tt.bar, tDir: tt.dir===1?'L':'S', match: false
      });
      tk++;
    }
    if (rows2.length >= SHOW2) break;
  }
  console.log('JS_entry→exit(reason)  vs  TV_entry  | match?');
  rows2.forEach(r => {
    const jsStr = r.jBar>=0 ? `JS #${r.jBar}→#${r.jXBar}(${r.jDir},${r.jReason})`.padEnd(25) : ' '.repeat(25);
    const tvStr = r.tBar>=0 ? `TV #${r.tBar}(${r.tDir})` : '  (no TV match)';
    const mark = r.match ? '✅' : '❌';
    console.log(`  ${jsStr} ${tvStr} ${mark}`);
  });

  // Показать бары где TV открывается а JS нет
  console.log('\n=== TV сделки без JS-пары (первые 20) ===');
  let shown3=0;
  for (let tk2=0; tk2<tvTradeList.length && shown3<20; tk2++) {
    const tt=tvTradeList[tk2];
    const jMatch = jsFT.find(j=>j.entryBar===tt.bar);
    if (!jMatch) {
      // Найти ближайший JS
      const jNear = jsFT.filter(j=>Math.abs(j.entryBar-tt.bar)<=5);
      console.log(`  TV #${tt.bar}(${tt.dir===1?'L':'S'}) — нет JS. Ближайший JS: ${jNear.map(j=>'#'+j.entryBar+'→#'+j.exitBar+'('+j.reason+')').join(', ') || 'нет'}`);
      shown3++;
    }
  }
}

console.log('\nГотово.');
