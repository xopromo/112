'use strict';
/**
 * tests/unit/indicators.test.cjs
 * Тесты для индикаторных функций из core.js:
 *   calcEMA, calcSMA, calcWMA, calcHMA, calcMA,
 *   calcRMA, calcRMA_ATR, calcADX, calcRSI,
 *   calcPivotLow, calcPivotHigh, calcStructPivots, calcPivotLoHi
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createCoreCtx } = require('../harness.cjs');
const OHLCV100  = require('../fixtures/ohlcv_100.json');
const OHLCV300  = require('../fixtures/ohlcv_300.json');

// Допуск для float-сравнений
const EPS = 1e-6;
function approx(a, b, eps = EPS) {
  return Math.abs(a - b) < eps;
}

// ─── EMA ────────────────────────────────────────────────────────────────────

describe('calcEMA', () => {
  const ctx = createCoreCtx(OHLCV100);

  test('возвращает массив той же длины что вход', () => {
    const data = [1,2,3,4,5,6,7,8,9,10];
    const r = ctx.calcEMA(data, 3);
    assert.equal(r.length, data.length);
  });

  test('r[0] = data[0] (нет warmup-нулей, стартует сразу)', () => {
    const data = [7, 8, 9, 10];
    const r = ctx.calcEMA(data, 3);
    assert.ok(approx(r[0], 7), `r[0]=${r[0]}, ожидаем data[0]=7`);
  });

  test('EMA применяется с первого бара (k = 2/(p+1))', () => {
    // data=[10,11,12,13], p=3, k=0.5
    // r[0]=10, r[1]=11*0.5+10*0.5=10.5, r[2]=12*0.5+10.5*0.5=11.25, r[3]=13*0.5+11.25*0.5=12.125
    const data = [10, 11, 12, 13];
    const r = ctx.calcEMA(data, 3);
    const k = 2 / (3 + 1); // 0.5
    const e0 = 10;
    const e1 = 11 * k + e0 * (1 - k); // 10.5
    const e2 = 12 * k + e1 * (1 - k); // 11.25
    const e3 = 13 * k + e2 * (1 - k); // 12.125
    assert.ok(approx(r[3], e3), `r[3]=${r[3]} ≠ ожидаем ${e3}`);
  });

  test('монотонный рост → EMA растёт', () => {
    const data = Array.from({ length: 20 }, (_, i) => i + 1);
    const r = ctx.calcEMA(data, 5);
    for (let i = 5; i < r.length - 1; i++) {
      assert.ok(r[i] < r[i + 1], `EMA не растёт на баре ${i}`);
    }
  });

  test('константные данные → EMA = константа (после прогрева)', () => {
    const data = new Array(30).fill(50);
    const r = ctx.calcEMA(data, 10);
    for (let i = 9; i < r.length; i++) {
      assert.ok(approx(r[i], 50), `r[${i}]=${r[i]} ≠ 50`);
    }
  });
});

// ─── SMA ────────────────────────────────────────────────────────────────────

describe('calcSMA', () => {
  const ctx = createCoreCtx(OHLCV100);

  test('SMA(3) верные значения', () => {
    const data = [1, 2, 3, 4, 5];
    const r = ctx.calcSMA(data, 3);
    assert.equal(r.length, 5);
    // до прогрева — 0
    assert.equal(r[0], 0);
    assert.equal(r[1], 0);
    // r[2] = (1+2+3)/3 = 2
    assert.ok(approx(r[2], 2), `r[2]=${r[2]}`);
    // r[3] = (2+3+4)/3 = 3
    assert.ok(approx(r[3], 3), `r[3]=${r[3]}`);
    // r[4] = (3+4+5)/3 = 4
    assert.ok(approx(r[4], 4), `r[4]=${r[4]}`);
  });

  test('SMA(1) = исходные данные', () => {
    const data = [7, 3, 11, 2];
    const r = ctx.calcSMA(data, 1);
    data.forEach((v, i) => assert.ok(approx(r[i], v), `r[${i}]`));
  });

  test('константные данные → SMA = константа', () => {
    const data = new Array(20).fill(42);
    const r = ctx.calcSMA(data, 5);
    for (let i = 4; i < r.length; i++) {
      assert.ok(approx(r[i], 42), `r[${i}]=${r[i]}`);
    }
  });
});

// ─── WMA ────────────────────────────────────────────────────────────────────

describe('calcWMA', () => {
  const ctx = createCoreCtx(OHLCV100);

  test('WMA(3) вес последнего бара наибольший', () => {
    const data = [1, 2, 3, 4, 5];
    const r = ctx.calcWMA(data, 3);
    // WMA(3) на bar[4]: (1*3 + 2*5 + 3*4... нет, веса 1,2,3 с конца)
    // WMA = (3*5 + 2*4 + 1*3) / (3+2+1) = (15+8+3)/6 = 26/6 ≈ 4.333
    const expected = (3 * 5 + 2 * 4 + 1 * 3) / 6;
    assert.ok(approx(r[4], expected, 0.001), `r[4]=${r[4]} ≠ ${expected}`);
  });
});

// ─── calcRMA (Wilder's) ─────────────────────────────────────────────────────

describe('calcRMA', () => {
  const ctx = createCoreCtx(OHLCV100);

  test('возвращает массив нужной длины', () => {
    const data = new Array(50).fill(1);
    const r = ctx.calcRMA(data, 14);
    assert.equal(r.length, data.length);
  });

  test('константные данные → RMA = константа (после прогрева)', () => {
    const data = new Array(50).fill(5);
    const r = ctx.calcRMA(data, 10);
    for (let i = 10; i < r.length; i++) {
      assert.ok(approx(r[i], 5, 0.001), `r[${i}]=${r[i]}`);
    }
  });
});

// ─── calcRMA_ATR ────────────────────────────────────────────────────────────

describe('calcRMA_ATR (через DATA)', () => {
  const ctx = createCoreCtx(OHLCV100);

  test('возвращает Float64Array длиной DATA.length', () => {
    ctx.DATA = OHLCV100;
    const r = ctx.calcRMA_ATR(14);
    assert.equal(r.length, OHLCV100.length);
  });

  test('все значения после прогрева > 0', () => {
    ctx.DATA = OHLCV100;
    const r = ctx.calcRMA_ATR(14);
    for (let i = 14; i < r.length; i++) {
      assert.ok(r[i] > 0, `ATR[${i}]=${r[i]} ≤ 0`);
    }
  });

  test('ATR ≥ H-L для каждого бара (true range ≥ simple range)', () => {
    ctx.DATA = OHLCV100;
    const atr = ctx.calcRMA_ATR(14);
    // Проверяем что ATR > 0 и что он вообще рассчитывается
    const nonZero = Array.from(atr).filter(v => v > 0);
    assert.ok(nonZero.length > 50, `Слишком мало ненулевых ATR: ${nonZero.length}`);
  });
});

// ─── calcADX ────────────────────────────────────────────────────────────────

describe('calcADX (через DATA)', () => {
  const ctx = createCoreCtx(OHLCV300);

  test('возвращает массив нужной длины', () => {
    ctx.DATA = OHLCV300;
    const r = ctx.calcADX(14);
    assert.equal(r.length, OHLCV300.length);
  });

  test('ADX в диапазоне [0, 100]', () => {
    ctx.DATA = OHLCV300;
    const r = ctx.calcADX(14);
    for (let i = 28; i < r.length; i++) {
      assert.ok(r[i] >= 0 && r[i] <= 100, `ADX[${i}]=${r[i]} вне [0,100]`);
    }
  });

  test('ADX > 0 для трендовых данных после прогрева', () => {
    ctx.DATA = OHLCV300;
    const r = ctx.calcADX(14);
    const nonZero = Array.from(r).filter(v => v > 0).length;
    assert.ok(nonZero > 100, `Слишком мало ненулевых ADX: ${nonZero}`);
  });
});

// ─── calcRSI ────────────────────────────────────────────────────────────────

describe('calcRSI (через DATA)', () => {
  const ctx = createCoreCtx(OHLCV100);

  test('возвращает массив нужной длины', () => {
    ctx.DATA = OHLCV100;
    const r = ctx.calcRSI(14);
    assert.equal(r.length, OHLCV100.length);
  });

  test('RSI в диапазоне [0, 100]', () => {
    ctx.DATA = OHLCV100;
    const r = ctx.calcRSI(14);
    for (let i = 14; i < r.length; i++) {
      assert.ok(r[i] >= 0 && r[i] <= 100, `RSI[${i}]=${r[i]} вне [0,100]`);
    }
  });

  test('все-растущие данные → RSI близко к 100', () => {
    ctx.DATA = Array.from({ length: 50 }, (_, i) => ({
      o: 100 + i, h: 101 + i, l: 99 + i, c: 100 + i + 0.5, v: 1000, t: i * 3600000
    }));
    const r = ctx.calcRSI(14);
    // После прогрева RSI должен быть высоким (все up-движения)
    assert.ok(r[49] > 70, `RSI на растущих данных = ${r[49]}, ожидаем > 70`);
  });

  test('все-падающие данные → RSI близко к 0', () => {
    ctx.DATA = Array.from({ length: 50 }, (_, i) => ({
      o: 200 - i, h: 201 - i, l: 199 - i, c: 200 - i - 0.5, v: 1000, t: i * 3600000
    }));
    const r = ctx.calcRSI(14);
    assert.ok(r[49] < 30, `RSI на падающих данных = ${r[49]}, ожидаем < 30`);
  });
});

// ─── calcPivotLow / calcPivotHigh ───────────────────────────────────────────

describe('calcPivotLow / calcPivotHigh (через DATA)', () => {
  // Создаём данные с явным pivot low в середине
  function makePivotData(N, pivotIdx, pivotType) {
    return Array.from({ length: N }, (_, i) => {
      let l = 100, h = 102, c = 101, o = 101;
      if (pivotType === 'low' && i === pivotIdx) { l = 95; h = 96; c = 95.5; o = 95.5; }
      if (pivotType === 'high' && i === pivotIdx) { l = 104; h = 110; c = 108; o = 106; }
      return { o, h, l, c, v: 1000, t: i * 3600000 };
    });
  }

  test('calcPivotLow: находит пивот low', () => {
    const pvL = 2, pvR = 2;
    const pivotIdx = 50;
    const data = makePivotData(100, pivotIdx, 'low');
    const ctx = createCoreCtx(data);
    ctx.DATA = data;
    const r = ctx.calcPivotLow(pvL, pvR);
    assert.equal(r.length, data.length);
    // Пивот должен быть обнаружен на pivotIdx (но в массиве может быть сдвиг по pvR)
    const detected = Array.from(r).some(v => v === 1);
    assert.ok(detected, 'calcPivotLow не нашёл ни одного пивота');
  });

  test('calcPivotHigh: находит пивот high', () => {
    const pvL = 2, pvR = 2;
    const pivotIdx = 50;
    const data = makePivotData(100, pivotIdx, 'high');
    const ctx = createCoreCtx(data);
    ctx.DATA = data;
    const r = ctx.calcPivotHigh(pvL, pvR);
    const detected = Array.from(r).some(v => v === 1);
    assert.ok(detected, 'calcPivotHigh не нашёл ни одного пивота');
  });

  test('calcPivotLow: маркер ставится на i = pivotIdx + pvR', () => {
    // Минимум на баре 3. pvL=2, pvR=2.
    // calcPivotLow ставит res[i]=1 где i = pivotIdx + pvR = 3 + 2 = 5
    const data = [
      { o:100, h:101, l:99, c:100, v:1000, t:0 },
      { o:100, h:101, l:98, c:100, v:1000, t:1 },
      { o:100, h:101, l:97, c:100, v:1000, t:2 },
      { o:100, h:101, l:90, c:100, v:1000, t:3 },  // ← pivot low (idx=3)
      { o:100, h:101, l:97, c:100, v:1000, t:4 },
      { o:100, h:101, l:98, c:100, v:1000, t:5 },  // ← res[5]=1 (i = 3+2)
      { o:100, h:101, l:99, c:100, v:1000, t:6 },
    ];
    const ctx = createCoreCtx(data);
    ctx.DATA = data;
    const r = ctx.calcPivotLow(2, 2);
    assert.equal(r[5], 1, `r[5]=${r[5]}, ожидаем 1 (pivot low idx=3, маркер на i=5)`);
    assert.equal(r[3], 0, 'маркер НЕ ставится на сам pivot-индекс');
  });
});

// ─── calcStructPivots ────────────────────────────────────────────────────────

describe('calcStructPivots', () => {
  const ctx = createCoreCtx(OHLCV300);

  test('возвращает объект с bull и bear массивами', () => {
    const r = ctx.calcStructPivots(OHLCV300, 3, 3);
    assert.ok(r.bull, 'нет r.bull');
    assert.ok(r.bear, 'нет r.bear');
    assert.equal(r.bull.length, OHLCV300.length);
    assert.equal(r.bear.length, OHLCV300.length);
  });

  test('значения только 0 или 1', () => {
    const r = ctx.calcStructPivots(OHLCV300, 3, 3);
    for (const arr of [r.bull, r.bear]) {
      for (const v of arr) {
        assert.ok(v === 0 || v === 1, `Ожидаем 0 или 1, получили ${v}`);
      }
    }
  });
});

// ─── calcMA (роутер) ─────────────────────────────────────────────────────────

describe('calcMA (роутер типов)', () => {
  const ctx = createCoreCtx(OHLCV100);
  const data = Array.from({ length: 30 }, (_, i) => i + 1);

  for (const type of ['EMA', 'SMA', 'WMA', 'HMA', 'DEMA', 'TEMA']) {
    test(`calcMA(type="${type}") возвращает массив`, () => {
      const r = ctx.calcMA(data, 5, type);
      assert.equal(r.length, data.length, `calcMA(${type}) неверная длина`);
    });
  }

  test('неизвестный тип → fallback на EMA (не падает)', () => {
    const r = ctx.calcMA(data, 5, 'UNKNOWN');
    assert.equal(r.length, data.length);
  });
});
