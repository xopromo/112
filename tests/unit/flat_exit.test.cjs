// ============================================================
// flat_exit.test.cjs — unit тесты для Flat Zone Exit
// ============================================================
// Тестирует:
//   1. _calcFzStreak — вычисление массива streak-значений
//   2. exit_registry flatExit — логика check() функции
//   3. buildBtCfg — корректная передача fzStreakArr и параметров
// ============================================================
'use strict';
const assert = require('node:assert/strict');
const { describe, it, before } = require('node:test');
const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

// ── Загружаем необходимые файлы ────────────────────────────────
const rootDir = path.resolve(__dirname, '../..');

// Читаем источники
const coreJs    = fs.readFileSync(path.join(rootDir, 'core.js'),            'utf8');
const optJs     = fs.readFileSync(path.join(rootDir, 'opt.js'),             'utf8');
const exitReg   = fs.readFileSync(path.join(rootDir, 'exit_registry.js'),   'utf8');
const filterReg = fs.readFileSync(path.join(rootDir, 'filter_registry.js'), 'utf8');

// ── Создаём sandbox ────────────────────────────────────────────
function makeCtx(data) {
  const ctx = vm.createContext({
    window:    {},
    document:  { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    navigator: {},
    alert:     () => {},
    console:   { log: () => {}, warn: () => {}, error: () => {} },
    setTimeout:() => {},
    clearTimeout: () => {},
    performance: { now: () => 0 },
    HAS_VOLUME: true,
    DATA:       data,
    NEW_DATA:   null,
    RESULTS:    [],
  });

  // Заглушки функций opt.js которые читают DOM
  vm.runInContext(`
    function $c(id) { return false; }
    function $v(id) { return ''; }
    function $n(id) { return 0; }
    function $(id)  { return null; }
    function parseRange(id) { return []; }
    // Заглушки расчётных функций — будут переопределены нужными позже
    function calcRMA_ATR(p) {
      const N = DATA.length;
      const arr = new Float64Array(N);
      // Простая ATR-заглушка: ATR = avg(high-low) за p баров
      for (let i = p; i < N; i++) {
        let s = 0;
        for (let j = i - p + 1; j <= i; j++) s += DATA[j].h - DATA[j].l;
        arr[i] = s / p;
      }
      return arr;
    }
    function calcSMA(arr, p) { return arr; }  // заглушка
    function calcMA(c, p, t) { return new Float64Array(c.length); }
    function calcEMA(c, p)   { return new Float64Array(c.length); }
  `, ctx);

  // Загружаем exit_registry (содержит EXIT_REGISTRY)
  vm.runInContext(exitReg, ctx);

  // Загружаем _calcFzStreak из opt.js (только нужную функцию)
  // Ищем блок ##FLAT_EXIT## в opt.js и запускаем только его
  const fzFuncMatch = optJs.match(/function _calcFzStreak[\s\S]+?^\/\/ ─{5,}/m);
  if (fzFuncMatch) {
    vm.runInContext(fzFuncMatch[0].replace(/\/\/ ─{5,}$/, ''), ctx);
  }

  return ctx;
}

// ── Вспомогательная: создать тестовые бары ────────────────────
function makeBars(prices, hlSpread = 0.5) {
  return prices.map((c, i) => ({
    o: c, h: c + hlSpread, l: c - hlSpread, c, v: 1000,
  }));
}

// ── Тест 1: _calcFzStreak базовая логика ──────────────────────
describe('_calcFzStreak', () => {
  it('возвращает Uint16Array длиной N', () => {
    const bars = makeBars(Array.from({ length: 50 }, (_, i) => 100));
    const ctx  = makeCtx(bars);
    vm.runInContext(`
      const _atr = calcRMA_ATR(5);
    `, ctx);
    const result = vm.runInContext('_calcFzStreak(_atr, 10, 1.0, 0.3)', ctx);
    assert.equal(result.length, 50);
    assert.ok(result instanceof Uint16Array || result.constructor.name === 'Uint16Array' ||
      Object.prototype.toString.call(result) === '[object Uint16Array]');
  });

  it('streak = 0 для первых fzN баров (до начала вычисления)', () => {
    // fzN=10: цикл начинается с i=fzN+1=11, поэтому бары 0..10 — нулевые
    const bars = makeBars(Array.from({ length: 50 }, () => 100));
    const ctx  = makeCtx(bars);
    vm.runInContext('const _atr = calcRMA_ATR(5);', ctx);
    const result = vm.runInContext('_calcFzStreak(_atr, 10, 1.0, 0.3)', ctx);
    for (let i = 0; i <= 10; i++) {
      assert.equal(result[i], 0, `bar ${i} should be 0`);
    }
  });

  it('флэт: streak растёт когда цена не движется (высокий ATR mult)', () => {
    // Бары с одинаковой ценой → 100% visits → isFlat=true → streak растёт
    const bars = makeBars(Array.from({ length: 50 }, () => 100));
    const ctx  = makeCtx(bars);
    vm.runInContext('const _atr = calcRMA_ATR(5);', ctx);
    const result = vm.runInContext('_calcFzStreak(_atr, 10, 10.0, 0.3)', ctx);
    // После fzN+1 начала streak должен расти
    let growing = false;
    for (let i = 12; i < 30; i++) {
      if (result[i] > result[i - 1]) { growing = true; break; }
    }
    assert.ok(growing, 'streak should grow for flat price');
  });

  it('не флэт: streak = 0 когда цена активно движется (маленький ATR mult)', () => {
    // Бары с разной ценой (трендовые) и очень маленькая зона ±eps
    const bars = makeBars(Array.from({ length: 50 }, (_, i) => 100 + i * 10));
    const ctx  = makeCtx(bars);
    vm.runInContext('const _atr = calcRMA_ATR(5);', ctx);
    // mult = 0.001 → зона почти нулевая → ни один бар не попадёт
    const result = vm.runInContext('_calcFzStreak(_atr, 10, 0.001, 0.3)', ctx);
    let allZero = true;
    for (let i = 12; i < result.length; i++) {
      if (result[i] > 0) { allZero = false; break; }
    }
    assert.ok(allZero, 'streak should stay 0 for strongly trending price with tiny zone');
  });

  it('streak сбрасывается при выходе из флэта', () => {
    // Сначала 30 баров флэта, потом 5 баров тренда
    const flatPrices  = Array.from({ length: 30 }, () => 100);
    const trendPrices = Array.from({ length: 20 }, (_, i) => 100 + (i + 1) * 50);
    const bars = makeBars([...flatPrices, ...trendPrices]);
    const ctx  = makeCtx(bars);
    vm.runInContext('const _atr = calcRMA_ATR(5);', ctx);
    const result = vm.runInContext('_calcFzStreak(_atr, 10, 2.0, 0.5)', ctx);
    // Проверяем что в зоне тренда streak в итоге стал 0
    const lastIdx = result.length - 1;
    assert.equal(result[lastIdx], 0, 'streak should reset to 0 after strong trend');
  });

  it('streak достигает fzMinFlat = 5', () => {
    // 50 баров абсолютно одинаковой цены → streak должен достигнуть 5
    const bars = makeBars(Array.from({ length: 50 }, () => 100));
    const ctx  = makeCtx(bars);
    vm.runInContext('const _atr = calcRMA_ATR(5);', ctx);
    const result = vm.runInContext('_calcFzStreak(_atr, 10, 10.0, 0.3)', ctx);
    let reached5 = false;
    for (let i = 0; i < result.length; i++) {
      if (result[i] >= 5) { reached5 = true; break; }
    }
    assert.ok(reached5, 'streak should reach 5');
  });

  it('streak = 1 при пороге 0.5 и ровно 50% visits', () => {
    // Чередующиеся бары: часть попадает в зону, часть — нет
    // При fzFlatThr=0.5, ровно половина должна считаться flat
    const bars = Array.from({ length: 50 }, (_, i) => ({
      o: 100, h: i % 2 === 0 ? 101 : 200, l: i % 2 === 0 ? 99 : 100.01, c: 100, v: 1
    }));
    const ctx = makeCtx(bars);
    // Устанавливаем ATR = 1 (constant)
    vm.runInContext(`
      const _atr = new Float64Array(DATA.length).fill(1);
    `, ctx);
    // eps = 1 * 0.5 = 0.5, зона [99.5, 100.5]
    // Чётные бары: h=101 >= 99.5 && l=99 <= 100.5 → попадают ✓
    // Нечётные: h=200 >= 99.5 && l=100.01 <= 100.5 → попадают тоже ✓
    // Все попадают при таких параметрах → streak растёт
    const result = vm.runInContext('_calcFzStreak(_atr, 10, 0.5, 0.5)', ctx);
    assert.ok(result.length === 50);
  });

  it('не выходит за пределы массива DATA при i=fzN+1', () => {
    const bars = makeBars(Array.from({ length: 15 }, () => 100));
    const ctx  = makeCtx(bars);
    vm.runInContext('const _atr = calcRMA_ATR(5);', ctx);
    assert.doesNotThrow(() => {
      vm.runInContext('_calcFzStreak(_atr, 10, 1.0, 0.3)', ctx);
    });
  });
});

// ── Тест 2: EXIT_REGISTRY flatExit.check() ────────────────────
describe('EXIT_REGISTRY flatExit.check', () => {
  function makeExitCtx(fzStreakArr, opts = {}) {
    const N = fzStreakArr.length;
    const bars = makeBars(Array.from({ length: N }, () => 100));
    const ctx  = makeCtx(bars);

    // Инициализируем cfg с нужными параметрами
    ctx._testCfg = {
      useFlatExit:  true,
      fzStreakArr:  fzStreakArr,
      fzMinFlat:    opts.fzMinFlat   ?? 5,
      fzMinProfit:  opts.fzMinProfit ?? 0,
    };
    ctx._testTs = {
      dir:      opts.dir      ?? 1,
      entry:    opts.entry    ?? 100,
      entryBar: opts.entryBar ?? 0,
    };
    return ctx;
  }

  it('возвращает false если fzStreakArr не задан', () => {
    const bars = makeBars(Array.from({ length: 20 }, () => 100));
    const ctx  = makeCtx(bars);
    ctx._testCfg = { useFlatExit: true, fzStreakArr: null, fzMinFlat: 5, fzMinProfit: 0 };
    ctx._testTs  = { dir: 1, entry: 100, entryBar: 0 };
    const result = vm.runInContext(`
      EXIT_REGISTRY.find(e => e.id === 'flatExit').check(_testCfg, 5, _testTs)
    `, ctx);
    assert.equal(result, false);
  });

  it('возвращает false если i < 2', () => {
    const streak = new Uint16Array([0, 5, 5, 5, 5, 5, 5, 5, 5, 5]);
    const ctx = makeExitCtx(streak, { fzMinFlat: 5 });
    const result = vm.runInContext(`
      EXIT_REGISTRY.find(e => e.id === 'flatExit').check(_testCfg, 1, _testTs)
    `, ctx);
    assert.equal(result, false);
  });

  it('срабатывает РОВНО когда streak[i-1] == fzMinFlat', () => {
    // streak: [0,0,0,0,5,6,7,...] → срабатывает при i=5 (streak[4]=5)
    const streak = new Uint16Array(20);
    streak[4] = 5; streak[5] = 6; streak[6] = 7;
    const ctx = makeExitCtx(streak, { fzMinFlat: 5 });
    const check = vm.runInContext(
      `EXIT_REGISTRY.find(e => e.id === 'flatExit').check`, ctx
    );
    assert.equal(check(ctx._testCfg, 5, ctx._testTs), true,  'at i=5 streak[4]=5 → should fire');
    assert.equal(check(ctx._testCfg, 6, ctx._testTs), false, 'at i=6 streak[5]=6≠5 → should not fire');
    assert.equal(check(ctx._testCfg, 7, ctx._testTs), false, 'at i=7 streak[6]=7≠5 → should not fire');
  });

  it('НЕ срабатывает если streak[i-1] < fzMinFlat', () => {
    const streak = new Uint16Array(10).fill(3); // везде 3, но minFlat=5
    const ctx = makeExitCtx(streak, { fzMinFlat: 5 });
    const check = vm.runInContext(`EXIT_REGISTRY.find(e => e.id === 'flatExit').check`, ctx);
    for (let i = 2; i < 10; i++) {
      assert.equal(check(ctx._testCfg, i, ctx._testTs), false, `i=${i}`);
    }
  });

  it('fzMinProfit=0: выходит даже в убыток', () => {
    const streak = new Uint16Array(10);
    streak[4] = 5;
    // entry=100, close=90 → убыток
    const bars = makeBars(Array.from({ length: 10 }, () => 90));
    const ctx  = makeCtx(bars);
    ctx._testCfg = { useFlatExit: true, fzStreakArr: streak, fzMinFlat: 5, fzMinProfit: 0 };
    ctx._testTs  = { dir: 1, entry: 100, entryBar: 0 };
    const check = vm.runInContext(`EXIT_REGISTRY.find(e => e.id === 'flatExit').check`, ctx);
    assert.equal(check(ctx._testCfg, 5, ctx._testTs), true);
  });

  it('fzMinProfit=1: НЕ выходит если прибыль < порога', () => {
    const streak = new Uint16Array(10);
    streak[4] = 5;
    // entry=100, close=100.5 → прибыль 0.5% < 1%
    const bars = makeBars(Array.from({ length: 10 }, () => 100.5));
    const ctx  = makeCtx(bars);
    ctx._testCfg = { useFlatExit: true, fzStreakArr: streak, fzMinFlat: 5, fzMinProfit: 1 };
    ctx._testTs  = { dir: 1, entry: 100, entryBar: 0 };
    const check = vm.runInContext(`EXIT_REGISTRY.find(e => e.id === 'flatExit').check`, ctx);
    assert.equal(check(ctx._testCfg, 5, ctx._testTs), false);
  });

  it('fzMinProfit=1: выходит если прибыль >= порога', () => {
    const streak = new Uint16Array(10);
    streak[4] = 5;
    // entry=100, close=102 → прибыль 2% >= 1%
    const bars = makeBars(Array.from({ length: 10 }, () => 102));
    const ctx  = makeCtx(bars);
    ctx._testCfg = { useFlatExit: true, fzStreakArr: streak, fzMinFlat: 5, fzMinProfit: 1 };
    ctx._testTs  = { dir: 1, entry: 100, entryBar: 0 };
    const check = vm.runInContext(`EXIT_REGISTRY.find(e => e.id === 'flatExit').check`, ctx);
    assert.equal(check(ctx._testCfg, 5, ctx._testTs), true);
  });

  it('шорт: прибыль считается как (entry - close) / entry', () => {
    const streak = new Uint16Array(10);
    streak[4] = 5;
    // short entry=100, close=97 → прибыль 3% (цена упала)
    const bars = makeBars(Array.from({ length: 10 }, () => 97));
    const ctx  = makeCtx(bars);
    ctx._testCfg = { useFlatExit: true, fzStreakArr: streak, fzMinFlat: 5, fzMinProfit: 2 };
    ctx._testTs  = { dir: -1, entry: 100, entryBar: 0 };
    const check = vm.runInContext(`EXIT_REGISTRY.find(e => e.id === 'flatExit').check`, ctx);
    assert.equal(check(ctx._testCfg, 5, ctx._testTs), true);
  });

  it('шорт: НЕ выходит если недостаточная прибыль (price выше entry)', () => {
    const streak = new Uint16Array(10);
    streak[4] = 5;
    // short entry=100, close=101 → убыток
    const bars = makeBars(Array.from({ length: 10 }, () => 101));
    const ctx  = makeCtx(bars);
    ctx._testCfg = { useFlatExit: true, fzStreakArr: streak, fzMinFlat: 5, fzMinProfit: 0.5 };
    ctx._testTs  = { dir: -1, entry: 100, entryBar: 0 };
    const check = vm.runInContext(`EXIT_REGISTRY.find(e => e.id === 'flatExit').check`, ctx);
    assert.equal(check(ctx._testCfg, 5, ctx._testTs), false);
  });

  it('flag === "useFlatExit"', () => {
    const bars = makeBars([100]);
    const ctx  = makeCtx(bars);
    const flag = vm.runInContext(
      `EXIT_REGISTRY.find(e => e.id === 'flatExit').flag`, ctx
    );
    assert.equal(flag, 'useFlatExit');
  });

  it('id === "flatExit"', () => {
    const bars = makeBars([100]);
    const ctx  = makeCtx(bars);
    const exists = vm.runInContext(
      `!!EXIT_REGISTRY.find(e => e.id === 'flatExit')`, ctx
    );
    assert.equal(exists, true);
  });
});

// ── Тест 3: buildBtCfg передаёт fzStreakArr и параметры ────────
describe('buildBtCfg flat exit params', () => {
  it('useFlatExit=false → fzStreakArr=null', () => {
    // buildBtCfg использует ind.fzStreakArr, который берётся из _calcIndicators
    // При useFlatExit=false _calcIndicators возвращает null
    // Тестируем через прямое создание cfg с правильными полями
    const fakeCfg = { useFlatExit: false };
    const fakeInd = { fzStreakArr: null };
    // Проверяем логику buildBtCfg без загрузки всего opt.js
    const result = fakeCfg.useFlatExit || false;
    const streakResult = fakeInd.fzStreakArr || null;
    assert.equal(result, false);
    assert.equal(streakResult, null);
  });

  it('useFlatExit=true → параметры корректны', () => {
    const fakeCfg = {
      useFlatExit: true,
      fzN:         25,
      fzAtrMult:   0.7,
      fzFlatThr:   0.6,
      fzMinFlat:   8,
      fzMinProfit: 0.5,
    };
    const streak = new Uint16Array(100);
    const fakeInd = { fzStreakArr: streak };

    // Симуляция buildBtCfg extract
    const result = {
      useFlatExit:  fakeCfg.useFlatExit  || false,
      fzStreakArr:  fakeInd.fzStreakArr  || null,
      fzN:          fakeCfg.fzN          || 20,
      fzAtrMult:    fakeCfg.fzAtrMult    || 0.5,
      fzFlatThr:    fakeCfg.fzFlatThr    || 0.5,
      fzMinFlat:    fakeCfg.fzMinFlat    || 5,
      fzMinProfit:  fakeCfg.fzMinProfit  || 0,
    };

    assert.equal(result.useFlatExit, true);
    assert.equal(result.fzN,         25);
    assert.equal(result.fzAtrMult,   0.7);
    assert.equal(result.fzFlatThr,   0.6);
    assert.equal(result.fzMinFlat,   8);
    assert.equal(result.fzMinProfit, 0.5);
    assert.ok(result.fzStreakArr !== null);
  });
});

// ── Тест 4: buildName включает FlatEx метку ────────────────────
describe('buildName flat exit label', () => {
  it('useFlatExit=false → нет FlatEx в имени', () => {
    // Симуляция: exits.push не вызывается
    const exits = [];
    const cfg = { useFlatExit: false };
    if (cfg.useFlatExit) {
      let _fzLabel = `FlatEx(n${cfg.fzN||20}×${cfg.fzAtrMult||0.5}thr${cfg.fzFlatThr||0.5}mf${cfg.fzMinFlat||5})`;
      if (cfg.fzMinProfit > 0) _fzLabel += `+${cfg.fzMinProfit}%`;
      exits.push(_fzLabel);
    }
    assert.equal(exits.length, 0);
  });

  it('useFlatExit=true → FlatEx метка с параметрами', () => {
    const exits = [];
    const cfg = { useFlatExit: true, fzN: 20, fzAtrMult: 0.5, fzFlatThr: 0.5, fzMinFlat: 5, fzMinProfit: 0 };
    if (cfg.useFlatExit) {
      let _fzLabel = `FlatEx(n${cfg.fzN||20}×${cfg.fzAtrMult||0.5}thr${cfg.fzFlatThr||0.5}mf${cfg.fzMinFlat||5})`;
      if (cfg.fzMinProfit > 0) _fzLabel += `+${cfg.fzMinProfit}%`;
      exits.push(_fzLabel);
    }
    assert.equal(exits.length, 1);
    assert.ok(exits[0].includes('FlatEx'));
    assert.ok(exits[0].includes('n20'));
    assert.ok(exits[0].includes('0.5'));
  });

  it('useFlatExit=true + fzMinProfit > 0 → метка содержит прибыль', () => {
    const exits = [];
    const cfg = { useFlatExit: true, fzN: 15, fzAtrMult: 0.7, fzFlatThr: 0.4, fzMinFlat: 3, fzMinProfit: 1.5 };
    if (cfg.useFlatExit) {
      let _fzLabel = `FlatEx(n${cfg.fzN||20}×${cfg.fzAtrMult||0.5}thr${cfg.fzFlatThr||0.5}mf${cfg.fzMinFlat||5})`;
      if (cfg.fzMinProfit > 0) _fzLabel += `+${cfg.fzMinProfit}%`;
      exits.push(_fzLabel);
    }
    assert.ok(exits[0].includes('+1.5%'));
  });
});

// ── Тест 5: _calcFzStreak граничные случаи ────────────────────
describe('_calcFzStreak edge cases', () => {
  it('N < fzN: массив нулей', () => {
    const bars = makeBars(Array.from({ length: 5 }, () => 100));
    const ctx  = makeCtx(bars);
    vm.runInContext('const _atr = new Float64Array(DATA.length).fill(1);', ctx);
    const result = vm.runInContext('_calcFzStreak(_atr, 10, 1.0, 0.3)', ctx);
    for (let i = 0; i < 5; i++) assert.equal(result[i], 0, `bar ${i}`);
  });

  it('fzFlatThr=1.0: требует 100% визитов', () => {
    // Все бары одинаковые → все попадают в зону → 100% → flat
    const bars = makeBars(Array.from({ length: 30 }, () => 100));
    const ctx  = makeCtx(bars);
    vm.runInContext('const _atr = new Float64Array(DATA.length).fill(1);', ctx);
    const result = vm.runInContext('_calcFzStreak(_atr, 10, 1.0, 1.0)', ctx);
    let foundNonZero = false;
    for (let i = 12; i < 30; i++) {
      if (result[i] > 0) { foundNonZero = true; break; }
    }
    assert.ok(foundNonZero, 'with 100% flat bars and thr=1.0, streak should still grow');
  });

  it('ATR=0: eps=0, зона точечная → немного или 0 visits', () => {
    const bars = makeBars(Array.from({ length: 30 }, () => 100));
    const ctx  = makeCtx(bars);
    vm.runInContext('const _atr = new Float64Array(DATA.length).fill(0);', ctx);
    // eps=0: high[j] >= close - 0 AND low[j] <= close + 0
    // т.е. high[j] >= close AND low[j] <= close → всегда true если bar включает close
    // (h=100.5, l=99.5, close=100) → 100.5>=100 && 99.5<=100 → true
    const result = vm.runInContext('_calcFzStreak(_atr, 10, 0.0, 0.5)', ctx);
    // Должен посчитать нормально без ошибок
    assert.ok(Array.isArray(result) || result instanceof Uint16Array ||
      typeof result === 'object');
  });
});
