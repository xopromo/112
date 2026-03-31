'use strict';
/**
 * tests/fixtures/generate.cjs
 * Генерирует детерминированные OHLCV-фикстуры для тестов.
 *
 * Запуск: node tests/fixtures/generate.cjs
 * Создаёт: ohlcv_100.json (простой тренд) + ohlcv_300.json (с пивотами)
 */

/** Детерминированный LCG-генератор (seed-based) */
function mkRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0xFFFFFFFF;
  };
}

/**
 * Генерирует N баров OHLCV.
 * trendPerBar — уклон цены за бар (положительный = восходящий)
 * noiseMult   — амплитуда шума относительно цены
 */
function generateOHLCV(N, { startPrice = 100, trendPerBar = 0.05, noiseMult = 0.008, volBase = 1000, seed = 42 } = {}) {
  const rng = mkRng(seed);
  const bars = [];
  let price = startPrice;
  let ts = 1700000000000; // фиксированный старт (ms)

  for (let i = 0; i < N; i++) {
    const noise = () => (rng() - 0.5) * 2 * price * noiseMult;
    const o  = price + noise();
    const h  = Math.max(o, price + noise() + price * noiseMult * 0.5);
    const l  = Math.min(o, price + noise() - price * noiseMult * 0.5);
    const c  = price + noise() + trendPerBar;
    const v  = Math.round(volBase * (0.5 + rng()));

    bars.push({
      t: ts,
      o: +o.toFixed(4),
      h: +Math.max(o, c, h).toFixed(4),
      l: +Math.min(o, c, l).toFixed(4),
      c: +c.toFixed(4),
      v,
    });

    price = bars[i].c;
    ts   += 3600 * 1000; // 1-hour bars
  }
  return bars;
}

/**
 * Генерирует данные с выраженными пивотами (синусоида + тренд).
 * pvL=2, pvR=2 → нужно 4+ бара вокруг пивота.
 */
function generatePivotOHLCV(N, { startPrice = 100, amplitude = 3, period = 20, trendPerBar = 0.02, seed = 99 } = {}) {
  const rng = mkRng(seed);
  const bars = [];
  let ts = 1700000000000;

  for (let i = 0; i < N; i++) {
    const base = startPrice + i * trendPerBar + amplitude * Math.sin(2 * Math.PI * i / period);
    const noise = (rng() - 0.5) * 0.1;
    const o = base + noise;
    const c = base + (rng() - 0.5) * 0.1;
    const h = Math.max(o, c) + rng() * 0.2;
    const l = Math.min(o, c) - rng() * 0.2;
    const v = Math.round(1000 * (0.5 + rng()));

    bars.push({
      t: ts,
      o: +o.toFixed(4),
      h: +h.toFixed(4),
      l: +l.toFixed(4),
      c: +c.toFixed(4),
      v,
    });
    ts += 3600 * 1000;
  }
  return bars;
}

// Генерируем и сохраняем
const path = require('path');
const fs   = require('fs');
const OUT  = __dirname;

const ohlcv100  = generateOHLCV(100,  { seed: 42, trendPerBar: 0.05 });
const ohlcv300  = generatePivotOHLCV(300, { seed: 77, amplitude: 5, period: 25, trendPerBar: 0.03 });
const ohlcvFlat = generateOHLCV(200,  { seed: 13, trendPerBar: 0.0, noiseMult: 0.003 });

fs.writeFileSync(path.join(OUT, 'ohlcv_100.json'),  JSON.stringify(ohlcv100,  null, 2));
fs.writeFileSync(path.join(OUT, 'ohlcv_300.json'),  JSON.stringify(ohlcv300,  null, 2));
fs.writeFileSync(path.join(OUT, 'ohlcv_flat.json'), JSON.stringify(ohlcvFlat, null, 2));

console.log(`ohlcv_100.json  → ${ohlcv100.length} баров`);
console.log(`ohlcv_300.json  → ${ohlcv300.length} баров`);
console.log(`ohlcv_flat.json → ${ohlcvFlat.length} баров`);

module.exports = { generateOHLCV, generatePivotOHLCV };
