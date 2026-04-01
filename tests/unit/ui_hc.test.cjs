'use strict';
/**
 * tests/unit/ui_hc.test.cjs
 * Unit-тесты _hcNeighbours() из ui_hc.js.
 *
 * _hcNeighbours(cfg, opts) — генерирует соседние конфиги для Hill Climbing.
 * Чистая функция (без DOM), поэтому тестируется через createUICtx.
 *
 * Запуск: node --test tests/unit/ui_hc.test.cjs
 */
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { createUICtx } = require('../harness.cjs');

let ctx;
before(() => { ctx = createUICtx([]); });

// ─────────────────────────────────────────────────────────────────────────────
// Хелпер: вызвать _hcNeighbours через vm-контекст (функция не экспортирована)
// ─────────────────────────────────────────────────────────────────────────────
const vm = require('vm');

function hcNeighbours(cfg, opts) {
  ctx._testCfg  = cfg;
  ctx._testOpts = opts;
  return vm.runInContext('_hcNeighbours(_testCfg, _testOpts)', ctx);
}

// ─────────────────────────────────────────────────────────────────────────────
// Базовый cfg с SL/TP
// ─────────────────────────────────────────────────────────────────────────────
function mkCfg(overrides = {}) {
  return {
    slPair: { a: { m: 2.0 }, p: { m: 1.0 } },
    tpPair: { a: { m: 3.0, type: 'rr' }, b: { m: 1.5, type: 'atr' } },
    atrPeriod: 14,
    pvL: 5, pvR: 2,
    maP: 20,
    useMA: false,
    useBE: false,
    useTrail: false,
    useADX: false,
    useRev: false,
    useTime: false,
    useConfirm: false,
    useSTrend: false,
    useRSI: false,
    useVolF: false, useVSA: false, useWT: false,
    useFresh: false, useMaDist: false, useAtrBo: false,
    ...overrides
  };
}

// ─────────────────────────────────────────────────────────────────────────────
describe('_hcNeighbours() — базовое поведение', () => {
  it('возвращает массив', () => {
    const nb = hcNeighbours(mkCfg(), {});
    assert.ok(Array.isArray(nb));
  });

  it('без опций — пустой массив', () => {
    const nb = hcNeighbours(mkCfg(), {});
    assert.equal(nb.length, 0);
  });

  it('каждый сосед — объект', () => {
    const nb = hcNeighbours(mkCfg(), { vSL: true });
    assert.ok(nb.length > 0);
    for (const c of nb) assert.equal(typeof c, 'object');
  });

  it('_oos удалён из каждого соседа', () => {
    const cfg = mkCfg();
    cfg._oos = { someData: true };
    const nb = hcNeighbours(cfg, { vSL: true });
    for (const c of nb) assert.equal(c._oos, undefined);
  });

  it('исходный cfg не мутируется', () => {
    const cfg = mkCfg();
    const origSlM = cfg.slPair.a.m;
    hcNeighbours(cfg, { vSL: true, vTP: true, vATR: true });
    assert.equal(cfg.slPair.a.m, origSlM);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('_hcNeighbours() — vSL (SL мутации)', () => {
  it('vSL:true → включает соседей', () => {
    const nb = hcNeighbours(mkCfg(), { vSL: true });
    assert.ok(nb.length > 0);
  });

  it('sl_a: шаг +step создаёт соседа', () => {
    const cfg = mkCfg();
    const nb = hcNeighbours(cfg, { vSL: true, step: 0.5 });
    const up = nb.find(c => c.slPair.a.m > 2.0);
    assert.ok(up, 'должен быть сосед с slPair.a.m > 2.0');
  });

  it('sl_a: шаг -step создаёт соседа', () => {
    const cfg = mkCfg();
    const nb = hcNeighbours(cfg, { vSL: true, step: 0.5 });
    const down = nb.find(c => c.slPair.a.m < 2.0);
    assert.ok(down, 'должен быть сосед с slPair.a.m < 2.0');
  });

  it('sl_a min = 0.2 (clamp)', () => {
    const cfg = mkCfg();
    cfg.slPair.a.m = 0.3;
    const nb = hcNeighbours(cfg, { vSL: true, step: 0.5 });
    for (const c of nb) {
      if (c.slPair?.a) assert.ok(c.slPair.a.m >= 0.2, `sl_a=${c.slPair.a.m} ниже минимума`);
    }
  });

  it('sl_p min = 0.5 (clamp)', () => {
    const cfg = mkCfg();
    cfg.slPair.p.m = 0.6;
    const nb = hcNeighbours(cfg, { vSL: true, step: 0.5 });
    for (const c of nb) {
      if (c.slPair?.p) assert.ok(c.slPair.p.m >= 0.5, `sl_p=${c.slPair.p.m} ниже минимума`);
    }
  });

  it('нет slPair → нет мутации sl_a', () => {
    const cfg = mkCfg();
    cfg.slPair = {};
    const nb = hcNeighbours(cfg, { vSL: true });
    // mutate возвращает null если нет slPair.a → соседи не добавляются
    assert.equal(nb.filter(c => c.slPair?.a).length, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('_hcNeighbours() — vTP (TP мутации)', () => {
  it('vTP:true → появляются соседи', () => {
    const nb = hcNeighbours(mkCfg(), { vTP: true });
    assert.ok(nb.length > 0);
  });

  it('tp_a мутирует в обе стороны', () => {
    const cfg = mkCfg();
    const nb = hcNeighbours(cfg, { vTP: true, step: 0.5 });
    const vals = nb.filter(c => c.tpPair?.a).map(c => c.tpPair.a.m);
    assert.ok(vals.some(v => v > 3.0), 'нет соседа с tp_a > 3.0');
    assert.ok(vals.some(v => v < 3.0), 'нет соседа с tp_a < 3.0');
  });

  it('tp_a min = 0.2 (clamp)', () => {
    const cfg = mkCfg();
    cfg.tpPair.a.m = 0.3;
    const nb = hcNeighbours(cfg, { vTP: true, step: 0.5 });
    for (const c of nb) {
      if (c.tpPair?.a) assert.ok(c.tpPair.a.m >= 0.2);
    }
  });

  it('tpPair.b мутирует независимо', () => {
    const cfg = mkCfg();
    const nb = hcNeighbours(cfg, { vTP: true, step: 0.5 });
    const bVals = nb.filter(c => c.tpPair?.b).map(c => c.tpPair.b.m);
    assert.ok(bVals.some(v => v > 1.5) || bVals.some(v => v < 1.5));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('_hcNeighbours() — vATR (ATR период)', () => {
  it('vATR → мутирует atrPeriod', () => {
    const cfg = mkCfg();
    const nb = hcNeighbours(cfg, { vATR: true });
    const periods = nb.map(c => c.atrPeriod).filter(Boolean);
    assert.ok(periods.length > 0);
  });

  it('atrPeriod min = 5', () => {
    const cfg = mkCfg();
    cfg.atrPeriod = 6;
    const nb = hcNeighbours(cfg, { vATR: true });
    for (const c of nb) {
      assert.ok(c.atrPeriod >= 5, `atrPeriod=${c.atrPeriod} ниже минимума`);
    }
  });

  it('шаги ±2 и ±4', () => {
    const cfg = mkCfg();
    const nb = hcNeighbours(cfg, { vATR: true });
    const vals = nb.map(c => c.atrPeriod);
    assert.ok(vals.includes(16), '+2: должен быть 16');
    assert.ok(vals.includes(12), '-2: должен быть 12');
    assert.ok(vals.includes(18), '+4: должен быть 18');
    assert.ok(vals.includes(10), '-4: должен быть 10');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('_hcNeighbours() — vPV (Pivot параметры)', () => {
  it('vPV → мутирует pvL и pvR', () => {
    const cfg = mkCfg();
    const nb = hcNeighbours(cfg, { vPV: true, pvStep: 1 });
    const pvLs = nb.map(c => c.pvL);
    const pvRs = nb.map(c => c.pvR);
    assert.ok(pvLs.some(v => v !== cfg.pvL));
    assert.ok(pvRs.some(v => v !== cfg.pvR));
  });

  it('pvL min = 2', () => {
    const cfg = mkCfg();
    cfg.pvL = 2;
    const nb = hcNeighbours(cfg, { vPV: true, pvStep: 1 });
    for (const c of nb) assert.ok(c.pvL >= 2);
  });

  it('pvR min = 1', () => {
    const cfg = mkCfg();
    cfg.pvR = 1;
    const nb = hcNeighbours(cfg, { vPV: true, pvStep: 1 });
    for (const c of nb) assert.ok(c.pvR >= 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('_hcNeighbours() — vMA (MA период)', () => {
  it('vMA без useMA → нет мутаций MA', () => {
    const cfg = mkCfg({ useMA: false });
    const nb = hcNeighbours(cfg, { vMA: true });
    assert.equal(nb.length, 0);
  });

  it('vMA + useMA → мутирует maP', () => {
    const cfg = mkCfg({ useMA: true });
    const nb = hcNeighbours(cfg, { vMA: true });
    assert.ok(nb.length > 0);
    const vals = nb.map(c => c.maP);
    assert.ok(vals.some(v => v !== cfg.maP));
  });

  it('maP min = 5', () => {
    const cfg = mkCfg({ useMA: true, maP: 5 });
    const nb = hcNeighbours(cfg, { vMA: true });
    for (const c of nb) assert.ok(c.maP >= 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('_hcNeighbours() — vBE (Break-Even)', () => {
  it('vBE без useBE → нет BE мутаций', () => {
    const cfg = mkCfg({ useBE: false });
    const nb = hcNeighbours(cfg, { vBE: true });
    assert.equal(nb.length, 0);
  });

  it('vBE + useBE → мутирует beTrig', () => {
    const cfg = mkCfg({ useBE: true, beTrig: 1.5 });
    const nb = hcNeighbours(cfg, { vBE: true, step: 0.5 });
    const vals = nb.map(c => c.beTrig);
    assert.ok(vals.some(v => v > 1.5) || vals.some(v => v < 1.5));
  });

  it('beTrig min = 0.3', () => {
    const cfg = mkCfg({ useBE: true, beTrig: 0.4 });
    const nb = hcNeighbours(cfg, { vBE: true, step: 0.5 });
    for (const c of nb) assert.ok(c.beTrig >= 0.3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('_hcNeighbours() — vADX', () => {
  it('vADX без useADX → нет мутаций', () => {
    const cfg = mkCfg({ useADX: false });
    const nb = hcNeighbours(cfg, { vADX: true });
    assert.equal(nb.length, 0);
  });

  it('vADX + useADX → мутирует adxThresh и adxLen', () => {
    const cfg = mkCfg({ useADX: true, adxThresh: 25, adxLen: 14 });
    const nb = hcNeighbours(cfg, { vADX: true });
    assert.ok(nb.length > 0);
  });

  it('adxThresh min = 10', () => {
    const cfg = mkCfg({ useADX: true, adxThresh: 12 });
    const nb = hcNeighbours(cfg, { vADX: true });
    for (const c of nb) assert.ok(c.adxThresh >= 10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('_hcNeighbours() — vRev (RevSig)', () => {
  it('vRev без useRev → нет мутаций', () => {
    const cfg = mkCfg({ useRev: false });
    const nb = hcNeighbours(cfg, { vRev: true });
    assert.equal(nb.length, 0);
  });

  it('vRev + useRev → большое количество вариантов (0..15 + шаги)', () => {
    const cfg = mkCfg({ useRev: true, revSkip: 3, revCooldown: 0, revBars: 2 });
    const nb = hcNeighbours(cfg, { vRev: true });
    // 16 абсолютных значений (0..15) - 1 текущее + 8 шагов ± = минимум > 16
    assert.ok(nb.length > 16, `ожидали > 16, получили ${nb.length}`);
  });

  it('revSkip min = 0', () => {
    const cfg = mkCfg({ useRev: true, revSkip: 1 });
    const nb = hcNeighbours(cfg, { vRev: true });
    for (const c of nb) assert.ok(c.revSkip >= 0);
  });

  it('revBars min = 1', () => {
    const cfg = mkCfg({ useRev: true, revBars: 1 });
    const nb = hcNeighbours(cfg, { vRev: true });
    for (const c of nb) assert.ok(c.revBars >= 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('_hcNeighbours() — комбинации опций', () => {
  it('vSL + vTP → больше соседей чем каждый по отдельности', () => {
    const cfg = mkCfg();
    const nbSL = hcNeighbours(cfg, { vSL: true });
    const nbTP = hcNeighbours(cfg, { vTP: true });
    const nbBoth = hcNeighbours(cfg, { vSL: true, vTP: true });
    assert.equal(nbBoth.length, nbSL.length + nbTP.length);
  });

  it('все опции → возвращает непустой массив', () => {
    const cfg = mkCfg({
      useMA: true, useBE: true, useTrail: true, useADX: true,
      useRev: true, useTime: true, useConfirm: true, useSTrend: true,
      useRSI: true, useVolF: true,
    });
    const nb = hcNeighbours(cfg, {
      vSL: true, vTP: true, vATR: true, vPV: true, vMA: true,
      vBE: true, vTrail: true, vADX: true, vRev: true, vTime: true,
      vConf: true, vSTrend: true, vRSI: true, vVol: true,
      step: 0.5, pvStep: 1,
    });
    assert.ok(nb.length > 20);
  });

  it('sl_a мутации: есть вариант выше и ниже базового', () => {
    const cfg = mkCfg();
    const nb = hcNeighbours(cfg, { vSL: true, step: 0.5 });
    const slVals = nb.filter(c => c.slPair?.a).map(c => c.slPair.a.m);
    assert.ok(slVals.some(v => v > 2.0), 'нет варианта sl_a > 2.0');
    assert.ok(slVals.some(v => v < 2.0), 'нет варианта sl_a < 2.0');
  });
});
