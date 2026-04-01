'use strict';
/**
 * tests/unit/opt_utils.test.cjs
 * Unit-тесты утилит из opt.js:
 *   - parseRange()  — парсинг диапазонов параметров
 *   - buildBtCfg()  — сборка конфига для backtest из saved cfg + ind
 *   - resampleData() — ресэмплинг OHLCV данных
 *
 * Запуск: node --test tests/unit/opt_utils.test.cjs
 */
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { createOptCtx } = require('../harness.cjs');

let ctx;
before(() => { ctx = createOptCtx([]); });

// ─────────────────────────────────────────────────────────────────────────────
// Хелпер: подменяем $v и вызываем parseRange
// ─────────────────────────────────────────────────────────────────────────────
function parseRange(ctxRef, value) {
  ctxRef.$v = () => value;
  // Array.from нужен: массивы из vm-контекста имеют другой прототип,
  // и assert.deepEqual fails на "Values have same structure but are not reference-equal"
  return Array.from(ctxRef.parseRange('dummy'));
}

// ─────────────────────────────────────────────────────────────────────────────
describe('parseRange() — пустой / null вход', () => {
  it('пустая строка → []', () => {
    assert.deepEqual(parseRange(ctx, ''), []);
  });
  it('null → []', () => {
    assert.deepEqual(parseRange(ctx, null), []);
  });
  it('undefined → []', () => {
    assert.deepEqual(parseRange(ctx, undefined), []);
  });
  it('пробел → []', () => {
    assert.deepEqual(parseRange(ctx, '  '), []);
  });
});

describe('parseRange() — запятые', () => {
  it('одно значение', () => {
    assert.deepEqual(parseRange(ctx, '5'), [5]);
  });
  it('несколько через запятую', () => {
    assert.deepEqual(parseRange(ctx, '1,2,3'), [1, 2, 3]);
  });
  it('дробные числа через запятую', () => {
    assert.deepEqual(parseRange(ctx, '1.5,2.5,3.5'), [1.5, 2.5, 3.5]);
  });
  it('пробелы вокруг запятых', () => {
    assert.deepEqual(parseRange(ctx, '1 , 2 , 3'), [1, 2, 3]);
  });
  it('мусорные значения пропускаются', () => {
    assert.deepEqual(parseRange(ctx, '1,abc,3'), [1, 3]);
  });
});

describe('parseRange() — двоеточие без шага (start:end)', () => {
  it('два значения через двоеточие → массив двух чисел', () => {
    assert.deepEqual(parseRange(ctx, '1:5'), [1, 5]);
  });
  it('одинаковые → два одинаковых числа', () => {
    assert.deepEqual(parseRange(ctx, '3:3'), [3, 3]);
  });
});

describe('parseRange() — start:end:step (диапазон)', () => {
  it('целые числа вверх', () => {
    assert.deepEqual(parseRange(ctx, '1:5:1'), [1, 2, 3, 4, 5]);
  });
  it('дробный шаг', () => {
    const r = parseRange(ctx, '1:2:0.5');
    assert.deepEqual(r, [1, 1.5, 2]);
  });
  it('шаг 0.1 — точность не теряется', () => {
    const r = parseRange(ctx, '1:1.3:0.1');
    assert.equal(r.length, 4);
    assert.equal(r[0], 1);
    assert.equal(r[3], 1.3);
  });
  it('обратный диапазон (start > end)', () => {
    assert.deepEqual(parseRange(ctx, '5:1:1'), [5, 4, 3, 2, 1]);
  });
  it('шаг 0 → возвращает start и end', () => {
    // step=0 не удовлетворяет parts[2]>0 → fallback на parts.filter
    const r = parseRange(ctx, '1:5:0');
    assert.equal(Array.isArray(r), true);
  });
  it('отрицательный шаг → parts.filter (не падает)', () => {
    const r = parseRange(ctx, '1:5:-1');
    assert.equal(Array.isArray(r), true);
  });
  it('большой диапазон — количество точек правильное', () => {
    const r = parseRange(ctx, '10:20:2');
    assert.deepEqual(r, [10, 12, 14, 16, 18, 20]);
  });
  it('дробный шаг 0.25', () => {
    const r = parseRange(ctx, '1:2:0.25');
    assert.equal(r.length, 5);
    assert.equal(r[4], 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Хелпер: минимальный ind для buildBtCfg
// ─────────────────────────────────────────────────────────────────────────────
function makeInd(overrides = {}) {
  return {
    pvLo: null, pvHi: null,
    bbB: null, bbD: null, donH: null, donL: null,
    atrBoMA: null, atrBoATR2: null, matMA: null, matZone: null,
    sqzOn: null, sqzCount: null,
    tfSigL: null, tfSigS: null,
    rsiExitArr: null, maCrossArr: null, macdLine: null, macdSignal: null,
    eisEMAArr: null, eisHistArr: null, erArr: null, stochD: null,
    stDir: null, maArr: null, adxArr: null, rsiArr: null, atrAvg: null,
    structBull: null, structBear: null, pivSLLo: null, pivSLHi: null,
    pivSLLoAge: null, pivSLHiAge: null, maArrConfirm: null, wtScores: null,
    bodyAvgArr: null, volAvgArr: null, kalmanArr: null, kalmanCrossArr: null,
    mlScoresArr: null, mlHighScoresArr: null,
    ...overrides
  };
}

// ─────────────────────────────────────────────────────────────────────────────
describe('buildBtCfg() — базовые свойства', () => {
  it('возвращает объект', () => {
    const cfg = {};
    const result = ctx.buildBtCfg(cfg, makeInd());
    assert.equal(typeof result, 'object');
    assert.notEqual(result, null);
  });

  it('commission передаётся', () => {
    const cfg = { commission: 0.05 };
    const result = ctx.buildBtCfg(cfg, makeInd());
    assert.equal(result.comm, 0.05);
  });

  it('commission по умолчанию = 0', () => {
    const result = ctx.buildBtCfg({}, makeInd());
    assert.equal(result.comm, 0);
  });

  it('markToMarket передаётся', () => {
    const cfg = { markToMarket: true };
    const result = ctx.buildBtCfg(cfg, makeInd());
    assert.equal(result.markToMarket, true);
  });
});

describe('buildBtCfg() — SL/TP маппинг', () => {
  it('slPair.a.m → slMult', () => {
    const cfg = { slPair: { a: { m: 2.5 } } };
    const r = ctx.buildBtCfg(cfg, makeInd());
    assert.equal(r.hasSLA, true);
    assert.equal(r.slMult, 2.5);
  });

  it('без slPair → hasSLA=false, slMult=0', () => {
    const r = ctx.buildBtCfg({}, makeInd());
    assert.equal(r.hasSLA, false);
    assert.equal(r.slMult, 0);
  });

  it('tpPair.a → hasTPA, tpMult, tpMode', () => {
    const cfg = { tpPair: { a: { m: 3.0, type: 'rr' } } };
    const r = ctx.buildBtCfg(cfg, makeInd());
    assert.equal(r.hasTPA, true);
    assert.equal(r.tpMult, 3.0);
    assert.equal(r.tpMode, 'rr');
  });

  it('tpPair.b → hasTPB, tpMultB', () => {
    const cfg = { tpPair: { b: { m: 1.5, type: 'atr' } } };
    const r = ctx.buildBtCfg(cfg, makeInd());
    assert.equal(r.hasTPB, true);
    assert.equal(r.tpMultB, 1.5);
    assert.equal(r.tpModeB, 'atr');
  });

  it('slPair.p.m → hasSLB, slPctMult', () => {
    const cfg = { slPair: { p: { m: 1.0 } } };
    const r = ctx.buildBtCfg(cfg, makeInd());
    assert.equal(r.hasSLB, true);
    assert.equal(r.slPctMult, 1.0);
  });

  it('slLogic/tpLogic передаются', () => {
    const cfg = { slLogic: 'and', tpLogic: 'and' };
    const r = ctx.buildBtCfg(cfg, makeInd());
    assert.equal(r.slLogic, 'and');
    assert.equal(r.tpLogic, 'and');
  });

  it('slLogic по умолчанию = "or"', () => {
    const r = ctx.buildBtCfg({}, makeInd());
    assert.equal(r.slLogic, 'or');
  });
});

describe('buildBtCfg() — поля индикаторов пробрасываются', () => {
  it('pvLo пробрасывается из ind', () => {
    const pvLo = [1, 2, 3];
    const r = ctx.buildBtCfg({}, makeInd({ pvLo }));
    assert.equal(r.pvLo, pvLo);
  });

  it('maArr пробрасывается из ind', () => {
    const maArr = new Float32Array([100, 101, 102]);
    const r = ctx.buildBtCfg({}, makeInd({ maArr }));
    assert.equal(r.maArr, maArr);
  });
});

describe('buildBtCfg() — поля с defaults', () => {
  it('pinRatio по умолчанию = 2', () => {
    assert.equal(ctx.buildBtCfg({}, makeInd()).pinRatio, 2);
  });
  it('beTrig по умолчанию = 1', () => {
    assert.equal(ctx.buildBtCfg({}, makeInd()).beTrig, 1);
  });
  it('trTrig по умолчанию = 1', () => {
    assert.equal(ctx.buildBtCfg({}, makeInd()).trTrig, 1);
  });
  it('trDist по умолчанию = 0.5', () => {
    assert.equal(ctx.buildBtCfg({}, makeInd()).trDist, 0.5);
  });
  it('timeBars по умолчанию = 20', () => {
    assert.equal(ctx.buildBtCfg({}, makeInd()).timeBars, 20);
  });
  it('adxThresh по умолчанию = 25', () => {
    assert.equal(ctx.buildBtCfg({}, makeInd()).adxThresh, 25);
  });
  it('rsiOS по умолчанию = 30', () => {
    assert.equal(ctx.buildBtCfg({}, makeInd()).rsiOS, 30);
  });
  it('rsiOB по умолчанию = 70', () => {
    assert.equal(ctx.buildBtCfg({}, makeInd()).rsiOB, 70);
  });
});

describe('buildBtCfg() — start (warmup)', () => {
  it('без MA: start = 52', () => {
    // min is max(0, 0, 50) + 2 = 52
    const r = ctx.buildBtCfg({}, makeInd());
    assert.equal(r.start, 52);
  });

  it('с useMA + maP=20 EMA: start > 52', () => {
    const cfg = { useMA: true, maP: 20, maType: 'EMA', htfRatio: 1 };
    const r = ctx.buildBtCfg(cfg, makeInd());
    assert.ok(r.start > 52, `ожидали > 52, получили ${r.start}`);
  });

  it('с useMA + маленький maP: start = 52 (min)', () => {
    const cfg = { useMA: true, maP: 5, maType: 'SMA', htfRatio: 1 };
    const r = ctx.buildBtCfg(cfg, makeInd());
    assert.equal(r.start, 52); // max(5*1*1, 0, 50) + 2 = 52
  });

  it('pruning всегда false', () => {
    assert.equal(ctx.buildBtCfg({}, makeInd()).pruning, false);
  });
});

describe('buildBtCfg() — useMA выключен если maP=0', () => {
  it('useMA:true но maP:0 → useMA в btCfg = false', () => {
    const cfg = { useMA: true, maP: 0 };
    const r = ctx.buildBtCfg(cfg, makeInd());
    assert.equal(r.useMA, false);
  });
  it('useMA:true и maP:20 → useMA в btCfg = true', () => {
    const cfg = { useMA: true, maP: 20 };
    const r = ctx.buildBtCfg(cfg, makeInd());
    assert.equal(r.useMA, true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('resampleData()', () => {
  // Создаём тестовые данные
  function makeBar(o, h, l, c, v = 1000, t = 0) {
    return { o, h, l, c, v, t };
  }

  const bars = [
    makeBar(100, 110, 90,  105, 1000, 0),
    makeBar(105, 115, 100, 110, 2000, 1),
    makeBar(110, 120, 105, 108, 1500, 2),
    makeBar(108, 112, 100, 115, 800,  3),
    makeBar(115, 125, 110, 120, 2500, 4),
    makeBar(120, 130, 115, 125, 1200, 5),
  ];

  it('mult=1 → возвращает те же данные', () => {
    const r = ctx.resampleData(bars, 1);
    assert.equal(r, bars);
  });

  it('mult=2 → вдвое меньше баров', () => {
    const r = ctx.resampleData(bars, 2);
    assert.equal(r.length, 3);
  });

  it('mult=3 → 2 бара', () => {
    const r = ctx.resampleData(bars, 3);
    assert.equal(r.length, 2);
  });

  it('open = open первого sub-бара', () => {
    const r = ctx.resampleData(bars, 2);
    assert.equal(r[0].o, 100);
  });

  it('close = close последнего sub-бара', () => {
    const r = ctx.resampleData(bars, 2);
    assert.equal(r[0].c, 110); // close bars[1]
  });

  it('high = max среди sub-баров', () => {
    const r = ctx.resampleData(bars, 2);
    assert.equal(r[0].h, 115); // max(110, 115)
  });

  it('low = min среди sub-баров', () => {
    const r = ctx.resampleData(bars, 2);
    assert.equal(r[0].l, 90); // min(90, 100)
  });

  it('volume = сумма sub-баров', () => {
    const r = ctx.resampleData(bars, 2);
    assert.equal(r[0].v, 3000); // 1000 + 2000
  });

  it('time = time первого sub-бара', () => {
    const r = ctx.resampleData(bars, 2);
    assert.equal(r[0].t, 0);
    assert.equal(r[1].t, 2);
  });

  it('неполный последний бар включается', () => {
    // 6 баров, mult=4 → 2 бара: [0..3] и [4..5]
    const r = ctx.resampleData(bars, 4);
    assert.equal(r.length, 2);
    assert.equal(r[1].o, bars[4].o);
    assert.equal(r[1].c, bars[5].c);
  });

  it('пустой массив → пустой массив', () => {
    const r = ctx.resampleData([], 2);
    assert.equal(r.length, 0);
  });

  it('один бар + mult=3 → один бар', () => {
    const r = ctx.resampleData([makeBar(50, 60, 40, 55)], 3);
    assert.equal(r.length, 1);
  });
});
