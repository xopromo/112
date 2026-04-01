'use strict';
/**
 * tests/unit/ui_pure.test.cjs
 * Тесты чистых (без DOM) вычислительных функций ui.js.
 * Цель: регрессионная защита при разбиении ui.js на модули.
 *
 * Запуск: node --test tests/unit/ui_pure.test.cjs
 */
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { createUICtx } = require('../harness.cjs');

let ctx;
before(() => { ctx = createUICtx([]); });

// ─────────────────────────────────────────────────────────────────────────────
describe('fmtSec()', () => {
  it('секунды < 60', () => assert.equal(ctx.fmtSec(45), '45с'));
  it('округляет вверх', () => assert.equal(ctx.fmtSec(45.3), '46с'));
  it('минуты', () => assert.equal(ctx.fmtSec(90), '2мин'));
  it('часы', () => {
    const r = ctx.fmtSec(3600);
    assert.ok(r.includes('ч'), `ожидали "ч", получили "${r}"`);
  });
  it('ровно 60с', () => assert.equal(ctx.fmtSec(60), '1мин'));
});

// ─────────────────────────────────────────────────────────────────────────────
describe('_calcDDFromEq()', () => {
  it('пустой массив → 0', () => assert.equal(ctx._calcDDFromEq([]), 0));
  it('null → 0', () => assert.equal(ctx._calcDDFromEq(null), 0));
  it('плоская кривая → 0', () => assert.equal(ctx._calcDDFromEq([100, 100, 100]), 0));
  it('простая просадка', () => assert.equal(ctx._calcDDFromEq([100, 90, 80, 95]), 20));
  it('восстановление после просадки', () => {
    // пик 200, потом 150, восстановление до 180 — просадка = 50
    assert.equal(ctx._calcDDFromEq([100, 200, 150, 180, 200]), 50);
  });
  it('постоянный рост → 0', () => assert.equal(ctx._calcDDFromEq([1, 2, 3, 4, 5]), 0));
});

// ─────────────────────────────────────────────────────────────────────────────
describe('_hcMetric()', () => {
  const r = { n: 10, pnl: 50, dd: 10, wr: 65, avg: 2.5 };

  it('слишком мало сделок → -Infinity', () => {
    assert.equal(ctx._hcMetric({ n: 4, pnl: 50, dd: 10 }, 'pnl'), -Infinity);
  });
  it('метрика pnl', () => assert.equal(ctx._hcMetric(r, 'pnl'), 50));
  it('метрика wr', () => assert.equal(ctx._hcMetric(r, 'wr'), 65));
  it('метрика avg', () => assert.equal(ctx._hcMetric(r, 'avg'), 2.5));
  it('метрика pdd = pnl/dd', () => assert.equal(ctx._hcMetric(r, 'pdd'), 5));
  it('pdd без dd: pnl>0 → 99', () => {
    assert.equal(ctx._hcMetric({ n: 10, pnl: 50, dd: 0 }, 'pdd'), 99);
  });
  it('метрика rob возвращает число', () => {
    const v = ctx._hcMetric({ ...r, _robScore: 0.8 }, 'rob');
    assert.ok(typeof v === 'number' && v > 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('_mlscrPearson()', () => {
  it('идеальная корреляция +1', () => {
    assert.ok(Math.abs(ctx._mlscrPearson([1,2,3,4],[1,2,3,4]) - 1) < 1e-9);
  });
  it('идеальная корреляция -1', () => {
    assert.ok(Math.abs(ctx._mlscrPearson([1,2,3,4],[4,3,2,1]) + 1) < 1e-9);
  });
  it('нулевая корреляция', () => {
    assert.ok(Math.abs(ctx._mlscrPearson([1,2,3,4],[2,2,2,2])) < 1e-9);
  });
  it('менее 3 элементов → 0', () => {
    assert.equal(ctx._mlscrPearson([1,2],[1,2]), 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('_mlscrVariance()', () => {
  it('одинаковые значения → 0', () => assert.equal(ctx._mlscrVariance([5,5,5,5]), 0));
  it('менее 2 элементов → 0', () => assert.equal(ctx._mlscrVariance([3]), 0));
  it('[1,2,3] → 2/3', () => {
    assert.ok(Math.abs(ctx._mlscrVariance([1,2,3]) - 2/3) < 1e-10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('_mlscrLinFit()', () => {
  it('идеальная прямая y=2x+1', () => {
    const xs = [0,1,2,3,4];
    const ys = xs.map(x => 2*x + 1);
    const fit = ctx._mlscrLinFit(ys, xs);
    assert.ok(Math.abs(fit.slope - 2) < 1e-9, `slope=${fit.slope}`);
    assert.ok(Math.abs(fit.intercept - 1) < 1e-9, `intercept=${fit.intercept}`);
  });
  it('горизонтальная прямая → slope=0', () => {
    const fit = ctx._mlscrLinFit([3,3,3,3], [0,1,2,3]);
    assert.equal(fit.slope, 0);
    assert.ok(Math.abs(fit.intercept - 3) < 1e-9);
  });
  it('вертикальные x → slope=0 (деление на 0 защищено)', () => {
    const fit = ctx._mlscrLinFit([1,2,3,4], [0,0,0,0]);
    assert.equal(fit.slope, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('_parseCSVtoArray()', () => {
  const csv = [
    'time,open,high,low,close,volume',
    '1700000000,100,110,90,105,1000',
    '1700000060,105,115,95,110,2000',
  ].join('\n');

  it('парсит OHLCV правильно', () => {
    const arr = ctx._parseCSVtoArray(csv);
    assert.equal(arr.length, 2);
    assert.equal(arr[0].o, 100);
    assert.equal(arr[0].h, 110);
    assert.equal(arr[0].l, 90);
    assert.equal(arr[0].c, 105);
    assert.equal(arr[0].v, 1000);
  });
  it('без заголовков возвращает []', () => {
    const r = ctx._parseCSVtoArray('');
    assert.ok(Array.isArray(r) && r.length === 0);
  });
  it('отсутствие обязательных колонок → []', () => {
    const r = ctx._parseCSVtoArray('time,foo\n1,2');
    assert.ok(Array.isArray(r) && r.length === 0);
  });
  it('строки с NaN пропускаются', () => {
    const csvBad = [
      'open,high,low,close',
      'abc,110,90,105',
      '105,115,95,110',
    ].join('\n');
    const arr = ctx._parseCSVtoArray(csvBad);
    assert.equal(arr.length, 1);
  });
  it('CSV без volume — поле v=0', () => {
    const csvNoVol = ['open,high,low,close', '100,110,90,105'].join('\n');
    const arr = ctx._parseCSVtoArray(csvNoVol);
    assert.equal(arr[0].v, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('_hcCluster()', () => {
  function makeCfg(atrP, pvL, pvR, slM, tpM) {
    return { atrPeriod: atrP, pvL, pvR, slPair: { a: { m: slM, type: 'atr' } }, tpPair: { a: { m: tpM, type: 'rr' } } };
  }

  it('пустой массив → пустой массив', () => {
    assert.deepEqual(ctx._hcCluster([], 0.5, 1), []);
  });

  it('один элемент → один кластер', () => {
    const found = [{ score: 10, cfg: makeCfg(14, 5, 2, 1.5, 3.0) }];
    assert.equal(ctx._hcCluster(found, 0.5, 1).length, 1);
  });

  it('два очень близких cfg → один кластер', () => {
    const cfgA = makeCfg(14, 5, 2, 1.5, 3.0);
    const cfgB = makeCfg(14, 5, 2, 1.6, 3.0); // почти идентичны
    const found = [
      { score: 10, cfg: cfgA },
      { score: 9,  cfg: cfgB },
    ];
    assert.equal(ctx._hcCluster(found, 0.5, 1).length, 1);
  });

  it('два далёких cfg → два кластера', () => {
    const cfgA = makeCfg(14, 5, 2, 1.5, 3.0);
    const cfgB = makeCfg(30, 10, 5, 4.0, 8.0); // очень разные параметры
    const found = [
      { score: 10, cfg: cfgA },
      { score: 9,  cfg: cfgB },
    ];
    assert.equal(ctx._hcCluster(found, 0.5, 1).length, 2);
  });
});
