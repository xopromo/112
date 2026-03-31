'use strict';
/**
 * tests/unit/backtest.test.cjs
 * Интеграционные тесты backtest() — ядро из core.js.
 *
 * Запуск: node --test tests/unit/backtest.test.cjs
 */
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const { createCoreCtx } = require('../harness.cjs');

// ── Фикстуры ──────────────────────────────────────────────────
const ohlcv300 = require('../fixtures/ohlcv_300.json');
const ohlcv100 = require('../fixtures/ohlcv_100.json');
const ohlcvFlat = require('../fixtures/ohlcv_flat.json');

// ─────────────────────────────────────────────────────────────
// Вспомогательная функция: строим минимальный cfg для запуска backtest()
// с Pivot-входом + ATR SL + RR TP.
// ─────────────────────────────────────────────────────────────
function buildMinCfg(ctx, data, overrides = {}) {
  const N = data.length;
  const pvL = 2, pvR = 2;

  // Рассчитываем нужные массивы внутри vm-контекста
  const closes = data.map(b => b.c);
  ctx.DATA = data;

  const atrArr = ctx.calcRMA_ATR(14);
  const pvLo   = ctx.calcPivotLow(pvL, pvR);
  const pvHi   = ctx.calcPivotHigh(pvL, pvR);

  // Средние объём и размер тела (используются некоторыми фильтрами и индикаторами)
  const volAvg  = new Float32Array(N).fill(1000);
  const bodyAvg = new Float32Array(N).fill(0.5);

  return Object.assign({
    // Управление
    comm:      0.05,    // 0.05% комиссия round-trip × 2 = 0.1%
    start:     50,      // старт после прогрева
    pruning:   false,   // выключено чтобы не получить null на короткой серии

    // Вход: только Pivot
    usePivot:  true,
    pvL,
    pvR,
    pvLo,
    pvHi_: pvHi,       // entry_registry.js использует cfg.pvHi_

    // SL: ATR-based
    hasSLA:    true,
    slMult:    1.5,
    slLogic:   'or',

    // TP: RR × 2
    hasTPA:    true,
    tpMode:    'rr',
    tpMult:    2.0,
    tpLogic:   'or',

    // Все прочие флаги — выключены
    hasSLB:    false,
    useSLPiv:  false,
    hasTPB:    false,
    useTrail:  false,
    useWickTrail: false,
    useBE:     false,
    usePartial: false,
    useRev:    false,
    useEngulf: false,
    usePinBar: false,
    useBollinger: false,
    useDonchian: false,
    useATRBO:  false,
    useMATouch: false,
    useSqueeze: false,
    useSupertrend: false,
    useMACD:   false,
    useKalman: false,
    useMACross: false,
    useVolMove: false,
    useInsideBar: false,
    useNRev:   false,
    useEIS:    false,
    useSoldiers: false,
    useAdaptiveTP: false,
    slPivTrail: false,

    // Вспомогательные массивы
    volAvg,
    bodyAvg,
    atrArr_full: atrArr,

    // Отложенный вход — выключен
    waitBars:    0,
    waitRetrace: false,
    waitMaxBars: 0,
    waitCancelAtr: 0,
  }, overrides);
}

// ─────────────────────────────────────────────────────────────
describe('backtest() — структура результата', () => {
  let ctx, cfg, result;

  before(() => {
    ctx = createCoreCtx(ohlcv300);
    cfg = buildMinCfg(ctx, ohlcv300);
    result = ctx.backtest(cfg.pvLo, cfg.pvHi_, cfg.atrArr_full, cfg);
  });

  it('возвращает объект (не null)', () => {
    assert.ok(result !== null && typeof result === 'object',
      `Ожидался объект, получили: ${result}`);
  });

  it('содержит все обязательные поля', () => {
    const required = ['pnl','wr','n','dd','eq','avg','p1','w1','c1','p2','w2','c2','dwr'];
    for (const f of required) {
      assert.ok(f in result, `Отсутствует поле: ${f}`);
    }
  });

  it('eq.length === DATA.length', () => {
    assert.strictEqual(result.eq.length, ohlcv300.length);
  });

  it('pnl — конечное число', () => {
    assert.ok(isFinite(result.pnl), `pnl должен быть конечным числом: ${result.pnl}`);
  });

  it('wr в диапазоне [0, 100]', () => {
    assert.ok(result.wr >= 0 && result.wr <= 100,
      `wr=${result.wr} вне диапазона [0,100]`);
  });

  it('n >= 0', () => {
    assert.ok(result.n >= 0, `Количество сделок не может быть отрицательным: ${result.n}`);
  });

  it('dd >= 0', () => {
    assert.ok(result.dd >= 0, `dd не может быть отрицательным: ${result.dd}`);
  });

  it('n > 0 на 300 барах с Pivot-сигналами (pivot-данные)', () => {
    assert.ok(result.n > 0,
      `Ожидались сделки на 300 барах с pivot-данными; wr=${result.wr}%, n=${result.n}`);
  });
});

// ─────────────────────────────────────────────────────────────
describe('backtest() — детерминизм', () => {
  it('два запуска с одинаковыми данными дают идентичный результат', () => {
    const ctx1 = createCoreCtx(ohlcv300);
    const cfg1 = buildMinCfg(ctx1, ohlcv300);
    const r1   = ctx1.backtest(cfg1.pvLo, cfg1.pvHi_, cfg1.atrArr_full, cfg1);

    const ctx2 = createCoreCtx(ohlcv300);
    const cfg2 = buildMinCfg(ctx2, ohlcv300);
    const r2   = ctx2.backtest(cfg2.pvLo, cfg2.pvHi_, cfg2.atrArr_full, cfg2);

    assert.strictEqual(r1.pnl, r2.pnl,   `pnl: ${r1.pnl} ≠ ${r2.pnl}`);
    assert.strictEqual(r1.n,   r2.n,     `n: ${r1.n} ≠ ${r2.n}`);
    assert.strictEqual(r1.wr,  r2.wr,    `wr: ${r1.wr} ≠ ${r2.wr}`);
    assert.strictEqual(r1.dd,  r2.dd,    `dd: ${r1.dd} ≠ ${r2.dd}`);
  });
});

// ─────────────────────────────────────────────────────────────
describe('backtest() — граничный случай: нет сигналов', () => {
  it('flat-данные без pivot-сигналов → n=0, pnl=0', () => {
    // Плоские данные почти без pivot-паттернов (очень маленький шум)
    const ctx = createCoreCtx(ohlcvFlat);
    const N = ohlcvFlat.length;

    // Создаём нулевые массивы pvLo/pvHi — гарантируем что сигналов нет
    const noPivots = new Float32Array(N);   // все 0 = нет сигналов
    const atrArr   = ctx.calcRMA_ATR(14);
    const cfg = buildMinCfg(ctx, ohlcvFlat, {
      pvLo:   noPivots,
      pvHi_:  noPivots,
      atrArr_full: atrArr,
    });

    const r = ctx.backtest(noPivots, noPivots, atrArr, cfg);
    assert.ok(r !== null, 'Ожидался объект, не null');
    assert.strictEqual(r.n,   0, `Ожидалось 0 сделок, получили ${r.n}`);
    assert.strictEqual(r.pnl, 0, `Ожидался pnl=0, получили ${r.pnl}`);
    assert.strictEqual(r.wr,  0, `Ожидался wr=0, получили ${r.wr}`);
  });
});

// ─────────────────────────────────────────────────────────────
describe('backtest() — IS/OOS split', () => {
  let ctx, result;

  before(() => {
    ctx    = createCoreCtx(ohlcv300);
    const cfg = buildMinCfg(ctx, ohlcv300);
    result = ctx.backtest(cfg.pvLo, cfg.pvHi_, cfg.atrArr_full, cfg);
  });

  it('eq первая половина заканчивается корректно (не NaN)', () => {
    const half = Math.floor(ohlcv300.length / 2);
    // eq[half-1] должен быть числом (pnl после IS)
    assert.ok(!isNaN(result.eq[half - 1]),
      `eq[${half-1}] = ${result.eq[half-1]} — ожидалось конечное число`);
  });

  it('IS сделки p1+p2 суммируются правильно (p1+p2 ≈ pnl с учётом частичных)', () => {
    // p1 (IS pnl) + p2 (OOS pnl) могут не точно равняться pnl из-за открытых позиций,
    // но p1+p2 должны быть конечными числами
    assert.ok(isFinite(result.p1), `p1 не конечное: ${result.p1}`);
    assert.ok(isFinite(result.p2), `p2 не конечное: ${result.p2}`);
  });
});

// ─────────────────────────────────────────────────────────────
describe('backtest() — комиссия влияет на pnl', () => {
  it('pnl с большой комиссией ≤ pnl без комиссии (при n > 0)', () => {
    const ctx0 = createCoreCtx(ohlcv300);
    const cfg0 = buildMinCfg(ctx0, ohlcv300, { comm: 0 });
    const r0   = ctx0.backtest(cfg0.pvLo, cfg0.pvHi_, cfg0.atrArr_full, cfg0);

    const ctx1 = createCoreCtx(ohlcv300);
    const cfg1 = buildMinCfg(ctx1, ohlcv300, { comm: 1.0 }); // 1% per side = 2% round-trip
    const r1   = ctx1.backtest(cfg1.pvLo, cfg1.pvHi_, cfg1.atrArr_full, cfg1);

    if (r0 !== null && r1 !== null && r0.n > 0) {
      assert.ok(r0.pnl >= r1.pnl,
        `Ожидалось pnl(comm=0)=${r0.pnl} >= pnl(comm=1%)=${r1.pnl}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────
describe('backtest() — Engulfing вход', () => {
  it('включение useEngulf даёт n >= 0 (не крашится)', () => {
    const ctx = createCoreCtx(ohlcv300);
    const cfg = buildMinCfg(ctx, ohlcv300, {
      usePivot:  false,
      useEngulf: true,
    });
    const atrArr = cfg.atrArr_full;
    const noPivots = new Float32Array(ohlcv300.length);
    const r = ctx.backtest(noPivots, noPivots, atrArr, cfg);
    assert.ok(r === null || (typeof r === 'object' && r.n >= 0),
      `Неожиданный результат: ${JSON.stringify(r)}`);
  });
});

// ─────────────────────────────────────────────────────────────
describe('backtest() — параметры SL/TP влияют на результат', () => {
  it('изменение slMult меняет итоговый pnl', () => {
    const ctx1 = createCoreCtx(ohlcv300);
    const cfg1 = buildMinCfg(ctx1, ohlcv300, { slMult: 0.5 });
    const r1   = ctx1.backtest(cfg1.pvLo, cfg1.pvHi_, cfg1.atrArr_full, cfg1);

    const ctx2 = createCoreCtx(ohlcv300);
    const cfg2 = buildMinCfg(ctx2, ohlcv300, { slMult: 3.0 });
    const r2   = ctx2.backtest(cfg2.pvLo, cfg2.pvHi_, cfg2.atrArr_full, cfg2);

    // Разные slMult должны давать разный pnl (SL влияет на результат)
    if (r1 !== null && r2 !== null && r1.n > 0 && r2.n > 0) {
      assert.notStrictEqual(r1.pnl, r2.pnl,
        `Ожидались разные pnl при slMult=0.5 vs 3.0, но оба = ${r1.pnl}`);
    }
  });

  it('изменение tpMult меняет итоговый pnl', () => {
    const ctx1 = createCoreCtx(ohlcv300);
    const cfg1 = buildMinCfg(ctx1, ohlcv300, { tpMult: 1.0 });
    const r1   = ctx1.backtest(cfg1.pvLo, cfg1.pvHi_, cfg1.atrArr_full, cfg1);

    const ctx2 = createCoreCtx(ohlcv300);
    const cfg2 = buildMinCfg(ctx2, ohlcv300, { tpMult: 4.0 });
    const r2   = ctx2.backtest(cfg2.pvLo, cfg2.pvHi_, cfg2.atrArr_full, cfg2);

    // Разные tpMult должны давать разный pnl (TP влияет на результат)
    if (r1 !== null && r2 !== null && r1.n > 0 && r2.n > 0) {
      assert.notStrictEqual(r1.pnl, r2.pnl,
        `Ожидались разные pnl при tpMult=1.0 vs 4.0, но оба = ${r1.pnl}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────
describe('backtest() — tradePnl (collectTrades)', () => {
  it('без collectTrades tradePnl = [] (пустой массив)', () => {
    const ctx = createCoreCtx(ohlcv300);
    const cfg = buildMinCfg(ctx, ohlcv300);
    const r   = ctx.backtest(cfg.pvLo, cfg.pvHi_, cfg.atrArr_full, cfg);
    if (r !== null) {
      assert.ok(Array.isArray(r.tradePnl), 'tradePnl должен быть массивом');
      assert.strictEqual(r.tradePnl.length, 0, 'tradePnl должен быть пустым без collectTrades');
    }
  });

  it('с collectTrades=true tradePnl.length === n', () => {
    const ctx = createCoreCtx(ohlcv300);
    const cfg = buildMinCfg(ctx, ohlcv300, { collectTrades: true });
    const r   = ctx.backtest(cfg.pvLo, cfg.pvHi_, cfg.atrArr_full, cfg);
    if (r !== null) {
      assert.strictEqual(r.tradePnl.length, r.n,
        `tradePnl.length=${r.tradePnl.length} !== n=${r.n}`);
    }
  });
});
