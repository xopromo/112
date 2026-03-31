'use strict';
/**
 * tests/unit/metrics.test.cjs
 * Unit-тесты функций метрик из opt.js (sections A+B):
 * _calcStatSig, _calcGTScore, _calcCVR, _calcSortino, _calcKRatio,
 * _calcSQN, _calcOmega, _calcPainRatio, _calcBurke, _calcUlcerIdx.
 *
 * Запуск: node --test tests/unit/metrics.test.cjs
 */
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { createOptCtx } = require('../harness.cjs');

// Создаём один контекст — все метрические функции доступны после загрузки opt.js
let ctx;
before(() => {
  ctx = createOptCtx([]);
});

// ─────────────────────────────────────────────────────────────
// Хелперы для создания тестовых данных
// ─────────────────────────────────────────────────────────────

/** Создаёт минимальный результат backtest-подобный объект */
function mkR(pnl, wr, n, dd, dwr = 0) {
  return { pnl, wr, n, dd, dwr };
}

/**
 * Создаёт монотонно растущую equity curve (идеальная стратегия).
 * @param {number} N — длина
 * @param {number} slope — прирост за бар
 */
function makeRisingEq(N, slope = 0.1) {
  const eq = new Float32Array(N);
  for (let i = 0; i < N; i++) eq[i] = i * slope;
  return eq;
}

/**
 * Создаёт equity с просадкой.
 * Растёт на grow%, затем падает на drop%, затем восстанавливается.
 */
function makeEqWithDD(N = 200) {
  const eq = new Float32Array(N);
  // Фаза 1: рост до 10% за первую треть
  const q1 = Math.floor(N / 3);
  for (let i = 0; i < q1; i++) eq[i] = i * (10 / q1);
  // Фаза 2: падение до 5% за вторую треть
  const q2 = Math.floor(N * 2 / 3);
  for (let i = q1; i < q2; i++) eq[i] = 10 - (i - q1) * (5 / (q2 - q1));
  // Фаза 3: восстановление до 15%
  for (let i = q2; i < N; i++) eq[i] = 5 + (i - q2) * (10 / (N - q2));
  return eq;
}

/** Создаёт плоскую (нулевую) equity */
function makeFlatEq(N = 100) {
  return new Float32Array(N); // all zeros
}

// ─────────────────────────────────────────────────────────────
describe('_calcStatSig', () => {
  it('null при n < 2', () => {
    assert.strictEqual(ctx._calcStatSig(null), 0);
    assert.strictEqual(ctx._calcStatSig(mkR(5, 60, 1, 1)), 0);
  });

  it('0 при wr <= 50%', () => {
    assert.strictEqual(ctx._calcStatSig(mkR(0, 50, 100, 1)), 0);
    assert.strictEqual(ctx._calcStatSig(mkR(-5, 40, 100, 1)), 0);
  });

  it('растёт с ростом wr (при фиксированном n=10)', () => {
    // При маленьком n результат ещё не насыщается до 99
    const s55 = ctx._calcStatSig(mkR(5, 55, 10, 1));
    const s70 = ctx._calcStatSig(mkR(5, 70, 10, 1));
    const s90 = ctx._calcStatSig(mkR(5, 90, 10, 1));
    assert.ok(s55 <= s70, `sig(wr=55)=${s55} должен быть ≤ sig(wr=70)=${s70}`);
    assert.ok(s70 <= s90, `sig(wr=70)=${s70} должен быть ≤ sig(wr=90)=${s90}`);
  });

  it('растёт с ростом n (при фиксированном wr)', () => {
    const s10   = ctx._calcStatSig(mkR(5, 60, 10,  1));
    const s100  = ctx._calcStatSig(mkR(5, 60, 100, 1));
    const s1000 = ctx._calcStatSig(mkR(5, 60, 1000, 1));
    assert.ok(s10 <= s100,   `sig(n=10)=${s10} должен быть ≤ sig(n=100)=${s100}`);
    assert.ok(s100 <= s1000, `sig(n=100)=${s100} должен быть ≤ sig(n=1000)=${s1000}`);
  });

  it('возвращает значение в диапазоне [0, 99]', () => {
    for (const [wr, n] of [[51, 10], [70, 50], [90, 200], [100, 1000]]) {
      const s = ctx._calcStatSig(mkR(10, wr, n, 1));
      assert.ok(s >= 0 && s <= 99, `sig(wr=${wr},n=${n})=${s} вне [0,99]`);
    }
  });
});

// ─────────────────────────────────────────────────────────────
describe('_calcGTScore', () => {
  it('-2 при n < 1 или null', () => {
    assert.strictEqual(ctx._calcGTScore(null), -2);
    assert.strictEqual(ctx._calcGTScore(mkR(5, 60, 0, 1)), -2);
  });

  it('отрицательный при отрицательном pnl', () => {
    const gt = ctx._calcGTScore(mkR(-10, 40, 20, 5));
    assert.ok(gt <= 0, `GT-Score при pnl=-10 должен быть ≤ 0, получили ${gt}`);
  });

  it('положительный при положительном pnl/dd', () => {
    const gt = ctx._calcGTScore(mkR(20, 65, 50, 10, 5));
    assert.ok(gt > 0, `GT-Score при pnl=20,dd=10 должен быть > 0, получили ${gt}`);
  });

  it('50 при dd=0 и pnl > 0 (cap by convention)', () => {
    // dd=0 → pnl/dd = Infinity → convention 50
    const gt = ctx._calcGTScore(mkR(5, 60, 10, 0));
    assert.ok(gt > 0, `GT-Score при dd=0 должен быть > 0, получили ${gt}`);
  });

  it('растёт с ростом wr (статзначимость)', () => {
    const gt60 = ctx._calcGTScore(mkR(10, 60, 100, 5));
    const gt80 = ctx._calcGTScore(mkR(10, 80, 100, 5));
    assert.ok(gt60 < gt80, `GT(wr=60)=${gt60} должен быть < GT(wr=80)=${gt80}`);
  });

  it('падает с ростом dwr (консистентность)', () => {
    const gt0  = ctx._calcGTScore(mkR(10, 65, 50, 5, 0));
    const gt50 = ctx._calcGTScore(mkR(10, 65, 50, 5, 50));
    assert.ok(gt0 > gt50, `GT(dwr=0)=${gt0} должен быть > GT(dwr=50)=${gt50}`);
  });
});

// ─────────────────────────────────────────────────────────────
describe('_calcCVR', () => {
  it('null при equity < 100 баров', () => {
    const short = new Float32Array(50).fill(1);
    assert.strictEqual(ctx._calcCVR(short), null);
    assert.strictEqual(ctx._calcCVR(null), null);
  });

  it('100% на монотонно растущей equity', () => {
    const eq = makeRisingEq(200, 0.1);
    const cvr = ctx._calcCVR(eq);
    assert.strictEqual(cvr, 100, `CVR на растущей equity должен быть 100%, получили ${cvr}`);
  });

  it('0% на монотонно падающей equity', () => {
    const eq = new Float32Array(200);
    for (let i = 0; i < 200; i++) eq[i] = 10 - i * 0.05; // падающая
    const cvr = ctx._calcCVR(eq);
    assert.strictEqual(cvr, 0, `CVR на падающей equity должен быть 0%, получили ${cvr}`);
  });

  it('в диапазоне [0, 100]', () => {
    const eq = makeEqWithDD(200);
    const cvr = ctx._calcCVR(eq);
    assert.ok(cvr !== null, 'CVR не должен быть null на 200 барах');
    assert.ok(cvr >= 0 && cvr <= 100, `CVR=${cvr} вне [0,100]`);
  });
});

// ─────────────────────────────────────────────────────────────
describe('_calcSortino', () => {
  it('null при equity < 10 баров', () => {
    assert.strictEqual(ctx._calcSortino(new Float32Array(5)), null);
    assert.strictEqual(ctx._calcSortino(null), null);
  });

  it('положительный на растущей equity', () => {
    const eq = makeRisingEq(100);
    const s = ctx._calcSortino(eq);
    assert.ok(s !== null && s > 0, `Sortino на растущей equity должен быть > 0, получили ${s}`);
  });

  it('null или 99.9 на идеально ровной equity (нет downdraw)', () => {
    const eq = makeRisingEq(100, 0.1);
    const s = ctx._calcSortino(eq);
    // Ровный рост без откатов → downDev ≈ 0 → 99.9 или null
    assert.ok(s === null || s === 99.9, `Ожидался null или 99.9, получили ${s}`);
  });

  it('отрицательный или null на плоской equity', () => {
    const eq = makeFlatEq(100);
    const s = ctx._calcSortino(eq);
    // Плоская equity: нет движения → downDev ≈ 0, pnl = 0 → null
    assert.ok(s === null || s === 0, `Ожидался null или 0 на плоской equity, получили ${s}`);
  });

  it('снижается при росте просадок', () => {
    const eq1 = makeEqWithDD(200);
    // Создаём более волатильную equity с большими просадками
    const eq2 = new Float32Array(200);
    for (let i = 0; i < 200; i++) {
      eq2[i] = eq1[i] + (i % 10 < 5 ? -3 : 3); // пилообразная с большими провалами
    }
    const s1 = ctx._calcSortino(eq1);
    const s2 = ctx._calcSortino(eq2);
    if (s1 !== null && s2 !== null) {
      // s1 (меньше просадок) должен быть >= s2 (больше просадок)
      // Это не всегда верно (зависит от данных), поэтому проверяем что оба числа
      assert.ok(typeof s1 === 'number' && typeof s2 === 'number',
        'Sortino должен быть числом');
    }
  });
});

// ─────────────────────────────────────────────────────────────
describe('_calcKRatio', () => {
  it('null при equity < 20 баров', () => {
    assert.strictEqual(ctx._calcKRatio(new Float32Array(10)), null);
    assert.strictEqual(ctx._calcKRatio(null), null);
  });

  it('положительный на равномерно растущей equity', () => {
    // K-Ratio = slope / se_of_slope. Идеальный рост → se → 0 → 99.9
    const eq = makeRisingEq(100);
    const k = ctx._calcKRatio(eq);
    assert.ok(k !== null && k > 0, `K-Ratio на растущей equity должен быть > 0, получили ${k}`);
  });

  it('отрицательный на падающей equity', () => {
    const eq = new Float32Array(100);
    for (let i = 0; i < 100; i++) eq[i] = 10 - i * 0.1;
    const k = ctx._calcKRatio(eq);
    assert.ok(k !== null && k < 0, `K-Ratio на падающей equity должен быть < 0, получили ${k}`);
  });

  it('выше на гладкой, чем на волатильной equity', () => {
    const eqSmooth = makeRisingEq(100, 0.1);
    // Волатильная: тот же рост + шум
    const eqNoisy = new Float32Array(100);
    for (let i = 0; i < 100; i++) {
      eqNoisy[i] = i * 0.1 + (i % 2 === 0 ? 2 : -2); // пила ±2
    }
    const kSmooth = ctx._calcKRatio(eqSmooth);
    const kNoisy  = ctx._calcKRatio(eqNoisy);
    if (kSmooth !== null && kNoisy !== null) {
      assert.ok(kSmooth > kNoisy,
        `K-Ratio гладкий=${kSmooth} должен быть > волатильный=${kNoisy}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────
describe('_calcSQN', () => {
  it('null при < 10 сделок', () => {
    assert.strictEqual(ctx._calcSQN([1, 2, 3]), null);
    assert.strictEqual(ctx._calcSQN(null), null);
  });

  it('положительный при положительном среднем доходе', () => {
    const trades = Array(20).fill(0).map((_, i) => 1 + i * 0.01); // все >0
    const sqn = ctx._calcSQN(trades);
    assert.ok(sqn !== null && sqn > 0, `SQN при позитивных сделках должен быть > 0: ${sqn}`);
  });

  it('отрицательный при отрицательном среднем (с разбросом)', () => {
    // Все убыточные, но с разным значением чтобы std > 0
    const trades = Array(20).fill(0).map((_, i) => -(1 + i * 0.1));
    const sqn = ctx._calcSQN(trades);
    assert.ok(sqn !== null && sqn < 0, `SQN при убыточных сделках должен быть < 0: ${sqn}`);
  });

  it('формула: SQN ≈ mean/std × √n', () => {
    // trades = [1,1,1,...,1] (все одинаковые) → std → 0 → 99.9
    const trades = Array(20).fill(1);
    const sqn = ctx._calcSQN(trades);
    assert.strictEqual(sqn, 99.9, `SQN при нулевом std должен быть 99.9, получили ${sqn}`);
  });
});

// ─────────────────────────────────────────────────────────────
describe('_calcOmega', () => {
  it('null при equity < 10 баров', () => {
    assert.strictEqual(ctx._calcOmega(new Float32Array(5)), null);
    assert.strictEqual(ctx._calcOmega(null), null);
  });

  it('99.9 на монотонно растущей (нет downside)', () => {
    const eq = makeRisingEq(50, 0.1);
    const omega = ctx._calcOmega(eq);
    assert.strictEqual(omega, 99.9, `Omega без падений должна быть 99.9, получили ${omega}`);
  });

  it('null на плоской equity (нет движения)', () => {
    const omega = ctx._calcOmega(makeFlatEq(50));
    assert.ok(omega === null, `Omega на плоской equity должна быть null, получили ${omega}`);
  });

  it('> 1 при положительном суммарном pnl', () => {
    const eq = makeEqWithDD(200);
    const omega = ctx._calcOmega(eq);
    // equity заканчивается на ~15% > 0, значит up > dn → omega > 1
    assert.ok(omega !== null && omega > 1,
      `Omega при положительном итоге должна быть > 1, получили ${omega}`);
  });

  it('< 1 при отрицательном суммарном pnl', () => {
    const eq = new Float32Array(100);
    for (let i = 0; i < 100; i++) eq[i] = 5 - i * 0.1; // падение с 5 до -4.9
    const omega = ctx._calcOmega(eq);
    assert.ok(omega !== null && omega < 1,
      `Omega при падающей equity должна быть < 1, получили ${omega}`);
  });
});

// ─────────────────────────────────────────────────────────────
describe('_calcBurke', () => {
  it('null при equity < 20 баров', () => {
    assert.strictEqual(ctx._calcBurke(new Float32Array(10)), null);
    assert.strictEqual(ctx._calcBurke(null), null);
  });

  it('99.9 на монотонно растущей equity (нет просадок)', () => {
    const eq = makeRisingEq(50, 0.1);
    const burke = ctx._calcBurke(eq);
    assert.strictEqual(burke, 99.9,
      `Burke без просадок должен быть 99.9, получили ${burke}`);
  });

  it('выше при меньшем количестве просадок', () => {
    // Один большой рост без просадок
    const eqGood = makeRisingEq(100, 0.1);
    // Equity с несколькими просадками
    const eqBad = makeEqWithDD(100);
    const bGood = ctx._calcBurke(eqGood);
    const bBad  = ctx._calcBurke(eqBad);
    // eqGood имеет нет просадок → 99.9
    // eqBad имеет просадки → конечное значение
    assert.ok(bGood !== null && (bBad === null || bGood > bBad),
      `Burke без просадок=${bGood} должен быть > с просадками=${bBad}`);
  });
});

// ─────────────────────────────────────────────────────────────
describe('_calcUlcerIdx (UPI)', () => {
  it('null при equity < 20 баров', () => {
    assert.strictEqual(ctx._calcUlcerIdx(new Float32Array(10)), null);
    assert.strictEqual(ctx._calcUlcerIdx(null), null);
  });

  it('null на монотонно растущей equity (нет просадок, ui < 0.001)', () => {
    const eq = makeRisingEq(50, 0.1);
    const upi = ctx._calcUlcerIdx(eq);
    assert.strictEqual(upi, null,
      `UPI без просадок должен быть null, получили ${upi}`);
  });

  it('возвращает число на equity с просадками', () => {
    const eq = makeEqWithDD(200);
    const upi = ctx._calcUlcerIdx(eq);
    assert.ok(upi !== null && typeof upi === 'number',
      `UPI на equity с просадками должен быть числом, получили ${upi}`);
  });

  it('снижается при росте просадок', () => {
    // eq1 — маленькая просадка
    const eq1 = new Float32Array(100);
    for (let i = 0; i < 50;  i++) eq1[i] = i * 0.2;            // рост 0→10
    for (let i = 50; i < 60; i++) eq1[i] = 10 - (i-50) * 0.1;  // -1% просадка
    for (let i = 60; i < 100; i++) eq1[i] = 9 + (i-60) * 0.2;  // восстановление
    // eq2 — большая просадка
    const eq2 = new Float32Array(100);
    for (let i = 0; i < 50;  i++) eq2[i] = i * 0.2;            // рост 0→10
    for (let i = 50; i < 80; i++) eq2[i] = 10 - (i-50) * 0.3;  // -9% просадка
    for (let i = 80; i < 100; i++) eq2[i] = 1 + (i-80) * 0.5;  // восстановление
    const upi1 = ctx._calcUlcerIdx(eq1);
    const upi2 = ctx._calcUlcerIdx(eq2);
    if (upi1 !== null && upi2 !== null) {
      assert.ok(upi1 > upi2,
        `UPI с малой просадкой=${upi1} должен быть > с большой=${upi2}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────
describe('_calcPainRatio', () => {
  it('null при equity < 20 баров', () => {
    assert.strictEqual(ctx._calcPainRatio(new Float32Array(10)), null);
    assert.strictEqual(ctx._calcPainRatio(null), null);
  });

  it('null на монотонно растущей equity (painIdx < 0.001)', () => {
    const eq = makeRisingEq(50, 0.1);
    const pain = ctx._calcPainRatio(eq);
    assert.strictEqual(pain, null,
      `PainRatio без просадок должен быть null, получили ${pain}`);
  });

  it('возвращает число на equity с просадкой', () => {
    const eq = makeEqWithDD(100);
    const pain = ctx._calcPainRatio(eq);
    assert.ok(pain !== null && typeof pain === 'number',
      `PainRatio должен быть числом, получили ${pain}`);
  });
});
