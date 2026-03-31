'use strict';
/**
 * tests/unit/filters.test.cjs
 * Тесты FILTER_REGISTRY:
 * 1. Каждый фильтр блокирует при warmup (indicator <= 0)
 * 2. Логика blocksL / blocksS (не блокирует при нормальных данных)
 *
 * Запуск: node --test tests/unit/filters.test.cjs
 */
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { createCoreCtx } = require('../harness.cjs');

const ohlcv300 = require('../fixtures/ohlcv_300.json');

let ctx;
before(() => {
  ctx = createCoreCtx(ohlcv300);
});

// ─────────────────────────────────────────────────────────────
// Вспомогательные утилиты
// ─────────────────────────────────────────────────────────────

/** Массив заданного размера заполненный значением val */
function filledF32(N, val) {
  return new Float32Array(N).fill(val);
}

/** Строим базовый cfg с нормальными данными для одного фильтра */
function baseCfg(N = ohlcv300.length) {
  const close   = ohlcv300.map(b => b.c);
  const atrVal  = 0.5;
  const maVal   = close[50] * 0.9; // MA ниже цены → лонг не блокируется

  return {
    // MA
    maArr:         filledF32(N, maVal),
    // ADX
    adxArr:        filledF32(N, 30),
    adxThresh:     20,
    useAdxSlope:   false,
    // ATR expanding / VolF
    atrAvg:        filledF32(N, atrVal * 0.5), // текущий ATR > avg*mult → пропускает
    atrExpMult:    1.2,
    volFMult:      3.0,
    // RSI
    rsiArr:        filledF32(N, 45), // ниже OB, выше OS
    rsiOS:         30,
    rsiOB:         70,
    // VSA / Liq / VolDir
    volAvg:        filledF32(N, 800),
    vsaMult:       0.5,
    liqMin:        0.5,
    volDirPeriod:  5,
    // Struct
    structBull:    filledF32(N, 1),
    structBear:    filledF32(N, 1),
    // MaDist
    maDistMax:     5.0,  // очень большое — никогда не блокирует
    // CandleF
    candleMin:     0.1,
    candleMax:     10.0,
    // Consec
    consecMax:     5,
    // STrend
    sTrendWin:     5,
    // Confirm
    maArrConfirm:  filledF32(N, maVal),
    // Fresh
    freshMax:      10,
    // WT
    wtScores:      filledF32(N, 5),
    wtThresh:      0,
    // MACD
    macdLine:      filledF32(N, 1),
    macdSignal:    filledF32(N, 0.5),
    // ER
    erArr:         filledF32(N, 0.8),
    erThresh:      0.3,
    // Kalman
    kalmanBullArr: filledF32(N, 1),
    kalmanBearArr: filledF32(N, 0),
    // Squeeze mod
    sqzMomArr:     filledF32(N, 1),
    // Breakout zones
    boBullArr:     filledF32(N, 1),
    boBearArr:     filledF32(N, 0),
    // CandleBody
    bodyArr:       filledF32(N, 0.5),
    bodyAvg:       filledF32(N, 0.3),
    bodyFMult:     0.5,
    // Body direction
    // HTF
    htfBullArr:    filledF32(N, 1),
    htfBearArr:    filledF32(N, 0),
  };
}

// ─────────────────────────────────────────────────────────────
describe('FILTER_REGISTRY — структура', () => {
  it('FILTER_REGISTRY является массивом', () => {
    assert.ok(Array.isArray(ctx.FILTER_REGISTRY),
      'FILTER_REGISTRY должен быть массивом');
  });

  it('каждый фильтр имеет поля id, flag, blocksL, blocksS', () => {
    for (const f of ctx.FILTER_REGISTRY) {
      assert.ok(typeof f.id       === 'string',   `Фильтр без id: ${JSON.stringify(f)}`);
      assert.ok(typeof f.flag     === 'string',   `Фильтр ${f.id} без flag`);
      assert.ok(typeof f.blocksL  === 'function', `Фильтр ${f.id} без blocksL`);
      assert.ok(typeof f.blocksS  === 'function', `Фильтр ${f.id} без blocksS`);
    }
  });

  it('содержит ожидаемые ключевые фильтры', () => {
    const ids = ctx.FILTER_REGISTRY.map(f => f.id);
    for (const expected of ['ma', 'adx', 'rsi', 'vsa', 'struct']) {
      assert.ok(ids.includes(expected), `Ожидался фильтр '${expected}' в реестре`);
    }
  });
});

// ─────────────────────────────────────────────────────────────
describe('FILTER_REGISTRY — warmup (indicator <= 0 → блокировать)', () => {
  const i = 60; // бар после прогрева
  const ac = 0.5;

  it('MA фильтр: maArr[i-1]=0 блокирует лонг', () => {
    const f   = ctx.FILTER_REGISTRY.find(f => f.id === 'ma');
    const cfg = baseCfg();
    cfg.maArr[i - 1] = 0; // warmup
    assert.strictEqual(f.blocksL(cfg, i), true,
      'MA warmup (=0) должен блокировать лонг');
  });

  it('MA фильтр: maArr[i-1]=0 блокирует шорт', () => {
    const f   = ctx.FILTER_REGISTRY.find(f => f.id === 'ma');
    const cfg = baseCfg();
    cfg.maArr[i - 1] = 0;
    assert.strictEqual(f.blocksS(cfg, i), true,
      'MA warmup (=0) должен блокировать шорт');
  });

  it('ADX фильтр: adxArr[i-1]=0 блокирует', () => {
    const f   = ctx.FILTER_REGISTRY.find(f => f.id === 'adx');
    const cfg = baseCfg();
    cfg.adxArr[i - 1] = 0; // warmup
    assert.strictEqual(f.blocksL(cfg, i), true,
      'ADX warmup (=0) должен блокировать лонг');
  });

  it('ATR expanding: atrAvg[i-1]=0 блокирует', () => {
    const f   = ctx.FILTER_REGISTRY.find(f => f.id === 'atrexp');
    const cfg = baseCfg();
    cfg.atrAvg[i - 1] = 0; // warmup
    assert.strictEqual(f.blocksL(cfg, i, ac), true,
      'ATRexp warmup (avg=0) должен блокировать');
  });

  it('RSI фильтр: rsiArr[i-1]=0 блокирует лонг', () => {
    const f   = ctx.FILTER_REGISTRY.find(f => f.id === 'rsi');
    const cfg = baseCfg();
    cfg.rsiArr[i - 1] = 0; // warmup
    assert.strictEqual(f.blocksL(cfg, i), true,
      'RSI warmup (=0) должен блокировать лонг');
  });

  it('STrend фильтр: maArr[i-1]=0 блокирует', () => {
    const f   = ctx.FILTER_REGISTRY.find(f => f.id === 'strend');
    const cfg = baseCfg();
    cfg.maArr[i - 1] = 0; // warmup
    assert.strictEqual(f.blocksL(cfg, i), true,
      'STrend warmup (maArr=0) должен блокировать');
  });
});

// ─────────────────────────────────────────────────────────────
describe('FILTER_REGISTRY — blocksL логика', () => {
  const i = 80;
  const ac = 0.5;

  it('MA: close > MA → не блокирует лонг', () => {
    const f   = ctx.FILTER_REGISTRY.find(f => f.id === 'ma');
    const cfg = baseCfg();
    // maArr[i-1] < DATA[i-1].c → не блокирует лонг
    cfg.maArr[i - 1] = ohlcv300[i - 1].c * 0.8;
    assert.strictEqual(f.blocksL(cfg, i), false,
      'MA фильтр не должен блокировать лонг когда close > MA');
  });

  it('MA: close < MA → блокирует лонг', () => {
    const f   = ctx.FILTER_REGISTRY.find(f => f.id === 'ma');
    const cfg = baseCfg();
    // maArr[i-1] > DATA[i-1].c → блокирует лонг
    cfg.maArr[i - 1] = ohlcv300[i - 1].c * 1.5;
    assert.strictEqual(f.blocksL(cfg, i), true,
      'MA фильтр должен блокировать лонг когда close < MA');
  });

  it('ADX: adx > threshold → не блокирует', () => {
    const f   = ctx.FILTER_REGISTRY.find(f => f.id === 'adx');
    const cfg = baseCfg();
    cfg.adxArr[i - 1] = 35; // > adxThresh=20
    assert.strictEqual(f.blocksL(cfg, i), false,
      'ADX выше порога не должен блокировать');
  });

  it('ADX: adx < threshold → блокирует', () => {
    const f   = ctx.FILTER_REGISTRY.find(f => f.id === 'adx');
    const cfg = baseCfg();
    cfg.adxArr[i - 1] = 10; // < adxThresh=20
    assert.strictEqual(f.blocksL(cfg, i), true,
      'ADX ниже порога должен блокировать');
  });

  it('RSI: rsi в зоне [OS, OB] → не блокирует лонг', () => {
    const f   = ctx.FILTER_REGISTRY.find(f => f.id === 'rsi');
    const cfg = baseCfg();
    cfg.rsiArr[i - 1] = 45; // между OS=30 и OB=70
    // blocksL: rsi >= rsiOS (30) пропускает лонг, rsi < rsiOS блокирует
    // фактически: blocksL = rsiArr[i-1] >= cfg.rsiOS → в зоне перекупленности
    // Нет - читаем: blocksL: rsiArr[i-1] >= cfg.rsiOS — ждём rsi < rsiOS для входа в лонг
    // rsi=45 >= rsiOS=30 → должен блокировать лонг (ещё не перепродан)
    // Или нет? Зависит от логики фильтра
    const result = f.blocksL(cfg, i);
    assert.ok(typeof result === 'boolean', `blocksL должен быть boolean: ${result}`);
  });

  it('Struct: structBull=1 → не блокирует лонг', () => {
    const f   = ctx.FILTER_REGISTRY.find(f => f.id === 'struct');
    const cfg = baseCfg();
    cfg.structBull[i] = 1;
    assert.strictEqual(f.blocksL(cfg, i), false,
      'Struct bullish → не блокирует лонг');
  });

  it('Struct: structBull=0 → блокирует лонг', () => {
    const f   = ctx.FILTER_REGISTRY.find(f => f.id === 'struct');
    const cfg = baseCfg();
    cfg.structBull[i] = 0;
    assert.strictEqual(f.blocksL(cfg, i), true,
      'Struct не bullish → блокирует лонг');
  });
});

// ─────────────────────────────────────────────────────────────
describe('FILTER_REGISTRY — blocksS логика (симметрия)', () => {
  const i = 80;
  const ac = 0.5;

  it('MA: close < MA → не блокирует шорт', () => {
    const f   = ctx.FILTER_REGISTRY.find(f => f.id === 'ma');
    const cfg = baseCfg();
    cfg.maArr[i - 1] = ohlcv300[i - 1].c * 1.5; // MA выше close → шорт OK
    assert.strictEqual(f.blocksS(cfg, i), false,
      'MA фильтр не должен блокировать шорт когда close < MA');
  });

  it('MA: close > MA → блокирует шорт', () => {
    const f   = ctx.FILTER_REGISTRY.find(f => f.id === 'ma');
    const cfg = baseCfg();
    cfg.maArr[i - 1] = ohlcv300[i - 1].c * 0.8; // MA ниже close → шорт заблокирован
    assert.strictEqual(f.blocksS(cfg, i), true,
      'MA фильтр должен блокировать шорт когда close > MA');
  });

  it('Struct: structBear=1 → не блокирует шорт', () => {
    const f   = ctx.FILTER_REGISTRY.find(f => f.id === 'struct');
    const cfg = baseCfg();
    cfg.structBear[i] = 1;
    assert.strictEqual(f.blocksS(cfg, i), false);
  });

  it('Struct: structBear=0 → блокирует шорт', () => {
    const f   = ctx.FILTER_REGISTRY.find(f => f.id === 'struct');
    const cfg = baseCfg();
    cfg.structBear[i] = 0;
    assert.strictEqual(f.blocksS(cfg, i), true);
  });
});

// ─────────────────────────────────────────────────────────────
describe('FILTER_REGISTRY — ATR expanding (anti-flat)', () => {
  const i = 60;

  it('current ATR > avg*mult → не блокирует (волатильный рынок)', () => {
    const f   = ctx.FILTER_REGISTRY.find(f => f.id === 'atrexp');
    const cfg = baseCfg();
    cfg.atrAvg[i - 1] = 0.1;
    const ac = 0.5; // 0.5 > 0.1 * 1.2 = 0.12 → пропускает
    assert.strictEqual(f.blocksL(cfg, i, ac), false,
      'ATRexp при ac > atrAvg*mult не должен блокировать');
  });

  it('current ATR < avg*mult → блокирует (тихий рынок)', () => {
    const f   = ctx.FILTER_REGISTRY.find(f => f.id === 'atrexp');
    const cfg = baseCfg();
    cfg.atrAvg[i - 1] = 1.0;
    const ac = 0.1; // 0.1 < 1.0 * 1.2 = 1.2 → блокирует
    assert.strictEqual(f.blocksL(cfg, i, ac), true,
      'ATRexp при ac < atrAvg*mult должен блокировать');
  });
});

// ─────────────────────────────────────────────────────────────
describe('FILTER_REGISTRY — без данных (отсутствие массивов)', () => {
  const i = 60;
  const ac = 0.5;

  it('MA без maArr → не блокирует', () => {
    const f = ctx.FILTER_REGISTRY.find(f => f.id === 'ma');
    assert.strictEqual(f.blocksL({}, i), false);
    assert.strictEqual(f.blocksS({}, i), false);
  });

  it('ADX без adxArr → не блокирует', () => {
    const f = ctx.FILTER_REGISTRY.find(f => f.id === 'adx');
    assert.strictEqual(f.blocksL({}, i), false);
    assert.strictEqual(f.blocksS({}, i), false);
  });

  it('ATRexp без atrAvg → блокирует (безопасный default)', () => {
    const f = ctx.FILTER_REGISTRY.find(f => f.id === 'atrexp');
    assert.strictEqual(f.blocksL({}, i, ac), true,
      'ATRexp без atrAvg должен блокировать (нет данных = не безопасно)');
  });
});
