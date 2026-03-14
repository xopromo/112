#!/usr/bin/env node
// Быстрая проверка совпадения пивотов JS vs TradingView
// Использует ohlcv.csv (DATA) и PV_HI/PV_LO из того же файла

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function parseCSV(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  return lines.slice(1).map(line => {
    const vals = line.split(',');
    const obj = {};
    headers.forEach((h, i) => obj[h] = vals[i]?.trim() ?? '');
    return obj;
  });
}

const rows = parseCSV(path.join(ROOT, 'test_data/ohlcv.csv'));
const N = rows.length;

const DATA = rows.map(r => ({
  t: parseInt(r.time),
  o: parseFloat(r.open),
  h: parseFloat(r.high),
  l: parseFloat(r.low),
  c: parseFloat(r.close),
}));

const tvHi = new Uint8Array(N);
const tvLo = new Uint8Array(N);
for (let i = 0; i < N; i++) {
  tvHi[i] = parseInt(rows[i].pv_hi) || 0;
  tvLo[i] = parseInt(rows[i].pv_lo) || 0;
}

const tvHiCount = tvHi.reduce((s, v) => s + v, 0);
const tvLoCount = tvLo.reduce((s, v) => s + v, 0);

// Параметры — подбери по своей стратегии (по умолчанию 6/5)
const LEFT  = parseInt(process.argv[2]) || 6;
const RIGHT = parseInt(process.argv[3]) || 5;

console.log(`\n=== ПРОВЕРКА ПИВОТОВ JS vs TV | left=${LEFT} right=${RIGHT} | bars=${N} ===\n`);
console.log(`TV: PV_HI=${tvHiCount}  PV_LO=${tvLoCount}`);

// ── JS calcPivotHigh ───────────────────────────────────────────────────────
const jsHi = new Uint8Array(N);
for (let i = LEFT + RIGHT; i < N; i++) {
  const idx = i - RIGHT, v = DATA[idx].h;
  let ok = true;
  for (let j = idx - LEFT; j < idx; j++) { if (DATA[j].h > v) { ok = false; break; } }
  if (ok) for (let j = idx + 1; j <= Math.min(idx + RIGHT, N-1); j++) { if (DATA[j].h >= v) { ok = false; break; } }
  if (ok) jsHi[i] = 1;
}

// ── JS calcPivotLow ────────────────────────────────────────────────────────
const jsLo = new Uint8Array(N);
for (let i = LEFT + RIGHT; i < N; i++) {
  const idx = i - RIGHT, v = DATA[idx].l;
  let ok = true;
  for (let j = idx - LEFT; j < idx; j++) { if (DATA[j].l < v) { ok = false; break; } }
  if (ok) for (let j = idx + 1; j <= Math.min(idx + RIGHT, N-1); j++) { if (DATA[j].l <= v) { ok = false; break; } }
  if (ok) jsLo[i] = 1;
}

const jsHiCount = jsHi.reduce((s, v) => s + v, 0);
const jsLoCount = jsLo.reduce((s, v) => s + v, 0);
console.log(`JS: PV_HI=${jsHiCount}  PV_LO=${jsLoCount}\n`);

// ── Сравнение ──────────────────────────────────────────────────────────────
function compare(jsArr, tvArr, label) {
  let tp=0, fp=0, fn=0, tn=0;
  const missedTV=[], extraJS=[], sharedOk=[];
  for (let i = 0; i < N; i++) {
    const j = jsArr[i], t = tvArr[i];
    if (j && t)  { tp++; sharedOk.push(i); }
    else if (j)  { fp++; extraJS.push(i); }
    else if (t)  { fn++; missedTV.push(i); }
    else           tn++;
  }
  const total = tp + fn;
  const precision = total ? (tp / (tp + fp) * 100).toFixed(1) : '—';
  const recall    = total ? (tp / total * 100).toFixed(1) : '—';
  console.log(`── ${label} ──────────────────────────────`);
  console.log(`  TP (совпало):      ${tp}`);
  console.log(`  FP (лишних в JS): ${fp}`);
  console.log(`  FN (пропущено):   ${fn}`);
  console.log(`  Precision: ${precision}%   Recall: ${recall}%`);

  if (fp > 0) {
    console.log(`\n  Лишние JS (первые 10):`);
    extraJS.slice(0, 10).forEach(i => {
      const d = DATA[i - RIGHT], bar = i;
      console.log(`    бар#${bar}  центр#${i-RIGHT}  ${label==='HI' ? 'h' : 'l'}=${(d?.[label==='HI'?'h':'l']??'?').toFixed?.(d?.[label==='HI'?'h':'l']) || d?.[label==='HI'?'h':'l']}`);
    });
  }
  if (fn > 0) {
    console.log(`\n  Пропущенные TV (первые 10):`);
    missedTV.slice(0, 10).forEach(i => {
      const d = DATA[i - RIGHT];
      console.log(`    бар#${i}  центр#${i-RIGHT}  ${label==='HI' ? 'h' : 'l'}=${d?.[label==='HI'?'h':'l']?.toFixed?.(6) ?? '?'}`);
    });
  }
  console.log('');
  return { tp, fp, fn, missedTV, extraJS };
}

const hiRes = compare(jsHi, tvHi, 'HI');
const loRes = compare(jsLo, tvLo, 'LO');

// ── Сводка ────────────────────────────────────────────────────────────────
const totalTV = tvHiCount + tvLoCount;
const totalTP  = hiRes.tp + loRes.tp;
const totalFP  = hiRes.fp + loRes.fp;
const totalFN  = hiRes.fn + loRes.fn;
console.log('══════════════════════════════════════════');
console.log(`ИТОГ: TP=${totalTP}  FP=${totalFP}  FN=${totalFN}`);
console.log(`Precision: ${totalTP ? (totalTP/(totalTP+totalFP)*100).toFixed(1) : '—'}%`);
console.log(`Recall:    ${totalTP ? (totalTP/(totalTP+totalFN)*100).toFixed(1) : '—'}%`);
if (totalFP === 0 && totalFN === 0) {
  console.log('\n✅ Полное совпадение JS == TV');
} else {
  console.log('\n⚠️  Расхождение есть');
}
