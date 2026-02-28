// ============================================================
// EXPERIMENT: Гипотеза 1 — GT-Score (Anti-Overfitting Metric)
// ============================================================
// Источник: "The GT-Score: A Robust Objective Function for Reducing
//   Overfitting in Data-Driven Trading Strategies", MDPI 2026
//   https://www.mdpi.com/1911-8074/19/1/60
//
// Проблема: текущий score = pnl/dd. Оптимизатор легко находит
//   параметры с большим pnl/dd на IS, но они плохо обобщаются:
//   маленький n, нестабильный WR, высокий dwr (разница между периодами).
//
// Идея GT-Score: составная метрика, которая одновременно учитывает
//   • Performance     (доходность / просадка)
//   • Statistical significance (z-тест винрейта > 50%)
//   • Consistency     (стабильность между периодами)
//   • Downside risk   (просадка)
//
// Формула:
//   GT = (pnl/dd) × sig_multiplier × consistency_multiplier
//   sig_multiplier    = 1 + clamp(z, 0, 3) × 0.3        [0..1.9]
//   consistency_mult  = 0.5 + clamp(1-dwr/100, 0, 1) × 0.5 [0.5..1]
//   z = (wr% - 50) / sqrt(2500/n)
//
// Эффект: стратегия с pnl/dd=5, n=200, wr=60%, dwr=5%
//   получает GT ≈ 5 × (1+1.26×0.3) × (0.5+0.95×0.5) = 5 × 1.38 × 0.975 ≈ 6.7
//   а стратегия с pnl/dd=5, n=20, wr=55%, dwr=30%
//   получает GT ≈ 5 × (1+0.45×0.3) × (0.5+0.70×0.5) = 5 × 1.135 × 0.85 ≈ 4.82
//   → GT правильно предпочитает первую
// ============================================================

'use strict';

// ── Вычисление GT-Score ──────────────────────────────────────
// Принимает объект r (результат backtest из core.js):
//   r.pnl  — суммарный PnL %
//   r.dd   — макс. просадка %
//   r.n    — кол-во сделок
//   r.wr   — win rate %
//   r.dwr  — разница WR между первой и второй половиной (нестабильность)
// Возвращает число (сопоставимо с pnl/dd, но штрафует за ненадёжность)
function calcGTScore(r) {
  if (!r || r.n < 1) return -2;

  // Performance: pnl/dd (базовый Calmar-like)
  const pdd = r.dd > 0 ? r.pnl / r.dd : (r.pnl > 0 ? 50 : -2);
  if (pdd <= 0) return Math.max(-2, pdd);

  // Statistical significance: z-тест (H0: wr = 50%)
  // z = (wr/100 - 0.5) / sqrt(0.25/n) = (wr% - 50) / sqrt(2500/n)
  const z = (r.wr - 50) / Math.sqrt(2500 / Math.max(r.n, 1));
  const sigMult = 1 + Math.min(Math.max(z, 0), 3) * 0.3; // [1.0 .. 1.9]

  // Consistency: чем меньше разница WR между половинами, тем лучше
  // dwr=0% → mult=1.0; dwr=50% → mult=0.5; dwr>=100% → mult=0.5
  const dwr = r.dwr !== undefined ? r.dwr : 0;
  const consistMult = 0.5 + Math.min(Math.max(1 - dwr / 100, 0), 1) * 0.5; // [0.5..1.0]

  return pdd * sigMult * consistMult;
}

// ── Тест: демонстрация разницы GT vs P/DD ────────────────────
function runGTScoreDemo() {
  const cases = [
    {
      label: 'Хорошая: много сделок, стабильный WR',
      r: { pnl: 50, dd: 10, n: 200, wr: 62, dwr: 5 }
    },
    {
      label: 'Overfitted: мало сделок, нестабильный WR',
      r: { pnl: 50, dd: 10, n: 20, wr: 60, dwr: 30 }
    },
    {
      label: 'Удачное везение: 5 сделок, WR=80%',
      r: { pnl: 50, dd: 10, n: 5, wr: 80, dwr: 0 }
    },
    {
      label: 'Скромная но надёжная: WR=55%, n=500',
      r: { pnl: 25, dd: 10, n: 500, wr: 55, dwr: 8 }
    }
  ];

  console.log('=== GT-Score vs P/DD ===\n');
  cases.forEach(({ label, r }) => {
    const pdd = r.dd > 0 ? r.pnl / r.dd : 0;
    const gt = calcGTScore(r);
    const zVal = ((r.wr - 50) / Math.sqrt(2500 / r.n)).toFixed(2);
    console.log(`${label}`);
    console.log(`  n=${r.n}, WR=${r.wr}%, dwr=${r.dwr}% → z=${zVal}`);
    console.log(`  P/DD = ${pdd.toFixed(2)}   GT-Score = ${gt.toFixed(2)}`);
    console.log('');
  });

  // Вывод ожидаемого ранжирования
  const ranked = cases
    .map(({ label, r }) => ({ label, pdd: r.dd > 0 ? r.pnl / r.dd : 0, gt: calcGTScore(r) }))
    .sort((a, b) => b.gt - a.gt);

  console.log('=== Ранжирование по GT-Score (лучший первый) ===');
  ranked.forEach((x, i) => console.log(`  ${i + 1}. ${x.label} (GT=${x.gt.toFixed(2)}, P/DD=${x.pdd.toFixed(2)})`));
}

// ── Как интегрировать в opt.js ───────────────────────────────
//
// 1) Добавить в UI чекбокс/радио "Метрика оптимизации":
//      ○ P/DD (текущая)
//      ● GT-Score (анти-overfitting)
//
// 2) В _tpeRunPoint заменить блок score на:
//
//   const _useGT = $c('opt_use_gt');  // новый чекбокс
//   if (r && r.n >= minTrades && r.dd <= maxDD) {
//     score = _useGT ? calcGTScore(r) : (r.dd > 0 ? r.pnl / r.dd : 50);
//   } ...
//
// 3) Экспортировать calcGTScore из opt.js (добавить в window или
//    вызывать напрямую, т.к. все файлы конкатенируются в built.html)
//
// 4) Отображать GT-Score в таблице результатов как дополнительную колонку
// ============================================================

// Запуск теста в Node.js: node experiments/hypothesis_1_gtscore.js
if (typeof module !== 'undefined') {
  module.exports = { calcGTScore };
  if (require.main === module) runGTScoreDemo();
}
