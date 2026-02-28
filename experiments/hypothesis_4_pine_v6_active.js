// ============================================================
// EXPERIMENT: Гипотеза 4 — Pine Script v6 `active` parameter
// ============================================================
// Источник: Pine Script v6 Release Notes
//   https://www.tradingview.com/pine-script-docs/release-notes/
//   "All input*() functions now feature a new parameter: active"
//
// Проблема: сейчас USE генерирует ВСЕГДА все инпуты, даже если
//   стратегия их не использует. Например, при экспорте стратегии
//   без RSI — инпут rsi_os/rsi_ob всё равно появляется в Settings.
//   Это загромождает UI TradingView и путает пользователей.
//
// Идея: Pine v6 `active=` позволяет скрывать инпуты динамически.
//   input.int(14, "RSI Period", active=use_rsi)
//   → инпут видим только когда use_rsi=true
//
// Результат: экспортированный скрипт имеет чистый, минималистичный
//   Settings UI — только те параметры, которые реально задействованы.
//   При этом чекбоксы (use_rsi, use_ma, etc.) остаются доступны
//   для ручной настройки прямо в TradingView.
//
// До (Pine v5):
//   use_rsi = input.bool(false, "RSI filter")
//   rsi_os  = input.int(30, "RSI oversold")    // <-- всегда видна
//   rsi_ob  = input.int(70, "RSI overbought")  // <-- всегда видна
//
// После (Pine v6):
//   use_rsi = input.bool(false, "RSI filter")
//   rsi_os  = input.int(30, "RSI oversold",   active=use_rsi) // скрыта!
//   rsi_ob  = input.int(70, "RSI overbought", active=use_rsi) // скрыта!
// ============================================================

'use strict';

// ── Патч: добавляем active= к зависимым инпутам ──────────────
// Принимает строку Pine v6 кода (уже сконвертированного из v5)
// Возвращает код с добавленным active= параметром там где нужно
function addActivePinev6(code) {
  if (!code || typeof code !== 'string') return { code, patches: [] };
  const patches = [];
  let result = code;

  // Маппинг: паттерн "переключателя" → паттерны "зависимых инпутов"
  // Каждый entry: { toggle: regex для строки с bool-инпутом, deps: [regex...] }
  const groups = [
    {
      // RSI filter
      toggleVar: 'use_rsi',
      toggleLine: /^(use_rsi\s*=\s*input\.bool\([^)]+\))\s*$/m,
      depLines: [
        { pattern: /^(rsi_os\s*=\s*input\.int\([^)]*)\)(\s*)$/m, name: 'rsi_os' },
        { pattern: /^(rsi_ob\s*=\s*input\.int\([^)]*)\)(\s*)$/m, name: 'rsi_ob' },
      ]
    },
    {
      // MA filter
      toggleVar: 'use_ma',
      toggleLine: /^(use_ma\s*=\s*input\.bool\([^)]+\))\s*$/m,
      depLines: [
        { pattern: /^(ma_period\s*=\s*input\.int\([^)]*)\)(\s*)$/m, name: 'ma_period' },
        { pattern: /^(ma_type\s*=\s*input\.string\([^)]*)\)(\s*)$/m, name: 'ma_type' },
      ]
    },
    {
      // ADX filter
      toggleVar: 'use_adx',
      toggleLine: /^(use_adx\s*=\s*input\.bool\([^)]+\))\s*$/m,
      depLines: [
        { pattern: /^(adx_thresh\s*=\s*input\.int\([^)]*)\)(\s*)$/m, name: 'adx_thresh' },
        { pattern: /^(adx_len\s*=\s*input\.int\([^)]*)\)(\s*)$/m, name: 'adx_len' },
      ]
    },
    {
      // Volume filter
      toggleVar: 'use_vol_filter',
      toggleLine: /^(use_vol_filter\s*=\s*input\.bool\([^)]+\))\s*$/m,
      depLines: [
        { pattern: /^(vol_mult\s*=\s*input\.float\([^)]*)\)(\s*)$/m, name: 'vol_mult' },
      ]
    },
    {
      // Squeeze
      toggleVar: 'use_squeeze',
      toggleLine: /^(use_squeeze\s*=\s*input\.bool\([^)]+\))\s*$/m,
      depLines: [
        { pattern: /^(sqz_bb_len\s*=\s*input\.int\([^)]*)\)(\s*)$/m, name: 'sqz_bb_len' },
        { pattern: /^(sqz_kc_mult\s*=\s*input\.float\([^)]*)\)(\s*)$/m, name: 'sqz_kc_mult' },
        { pattern: /^(sqz_min_bars\s*=\s*input\.int\([^)]*)\)(\s*)$/m, name: 'sqz_min_bars' },
      ]
    },
    {
      // Bollinger Bands
      toggleVar: 'use_boll',
      toggleLine: /^(use_boll\s*=\s*input\.bool\([^)]+\))\s*$/m,
      depLines: [
        { pattern: /^(bb_len\s*=\s*input\.int\([^)]*)\)(\s*)$/m, name: 'bb_len' },
        { pattern: /^(bb_mult\s*=\s*input\.float\([^)]*)\)(\s*)$/m, name: 'bb_mult' },
      ]
    },
    {
      // Trailing stop
      toggleVar: 'use_trail',
      toggleLine: /^(use_trail\s*=\s*input\.bool\([^)]+\))\s*$/m,
      depLines: [
        { pattern: /^(trail_trig\s*=\s*input\.float\([^)]*)\)(\s*)$/m, name: 'trail_trig' },
        { pattern: /^(trail_dist\s*=\s*input\.float\([^)]*)\)(\s*)$/m, name: 'trail_dist' },
      ]
    },
    {
      // Break-even
      toggleVar: 'use_be',
      toggleLine: /^(use_be\s*=\s*input\.bool\([^)]+\))\s*$/m,
      depLines: [
        { pattern: /^(be_trig\s*=\s*input\.float\([^)]*)\)(\s*)$/m, name: 'be_trig' },
        { pattern: /^(be_off\s*=\s*input\.float\([^)]*)\)(\s*)$/m, name: 'be_off' },
      ]
    },
  ];

  for (const group of groups) {
    // Проверяем что переключатель есть в коде
    if (!group.toggleLine.test(result)) continue;

    // Добавляем active= к зависимым инпутам
    for (const dep of group.depLines) {
      if (dep.pattern.test(result)) {
        result = result.replace(dep.pattern, (_, before, after) => {
          patches.push(`active=${group.toggleVar} → ${dep.name}`);
          return `${before}, active=${group.toggleVar})${after}`;
        });
      }
    }
  }

  return { code: result, patches };
}

// ── Тест ─────────────────────────────────────────────────────
function runActiveDemo() {
  // Симулируем фрагмент сгенерированного Pine v6 кода
  const sampleCode = `
//@version=6
// USE Strategy Engine — экспорт из оптимизатора (Pine Script v6)

grp_filters = "🔍 ФИЛЬТРЫ"
use_rsi = input.bool(false, "RSI фильтр", group=grp_filters)
rsi_os  = input.int(30, "RSI — перепроданность", minval=10, maxval=49, group=grp_filters)
rsi_ob  = input.int(70, "RSI — перекупленность", minval=51, maxval=90, group=grp_filters)

use_ma = input.bool(true, "MA фильтр", group=grp_filters)
ma_period = input.int(20, "MA период", minval=5, maxval=200, group=grp_filters)
ma_type   = input.string("EMA", "MA тип", options=["EMA","SMA","WMA"], group=grp_filters)

use_adx = input.bool(false, "ADX фильтр", group=grp_filters)
adx_thresh = input.int(25, "ADX порог", minval=10, maxval=50, group=grp_filters)
adx_len    = input.int(14, "ADX период", minval=5, maxval=30, group=grp_filters)

use_trail = input.bool(true, "Трейлинг стоп", group=grp_exits)
trail_trig = input.float(1.5, "Trail trigger RR", minval=0.5, maxval=5.0, group=grp_exits)
trail_dist = input.float(0.5, "Trail distance ATR", minval=0.1, maxval=3.0, group=grp_exits)
`.trim();

  console.log('=== Pine v6 active= parameter demo ===\n');
  console.log('--- ВХОД ---');
  console.log(sampleCode);
  console.log('');

  const { code: result, patches } = addActivePinev6(sampleCode);

  console.log('--- ВЫХОД (с active=) ---');
  console.log(result);
  console.log('');
  console.log(`Применено патчей: ${patches.length}`);
  patches.forEach(p => console.log(`  ✓ ${p}`));

  // Показываем только изменившиеся строки
  console.log('\n=== Изменения (diff) ===');
  const oldLines = sampleCode.split('\n');
  const newLines = result.split('\n');
  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    const o = oldLines[i] || '';
    const n = newLines[i] || '';
    if (o !== n) {
      console.log(`- ${o}`);
      console.log(`+ ${n}`);
    }
  }

  console.log('\n=== UX-эффект ===');
  console.log('В TradingView Settings:');
  console.log('  use_rsi = false  → rsi_os, rsi_ob СКРЫТЫ (не видны)');
  console.log('  use_rsi = true   → rsi_os, rsi_ob ПОЯВЛЯЮТСЯ');
  console.log('  use_ma = true    → ma_period, ma_type ВСЕГДА видны');
  console.log('  use_adx = false  → adx_thresh, adx_len СКРЫТЫ');
  console.log('');
  console.log('Результат: пользователь видит только параметры активных фильтров!');
}

// ── Как интегрировать в pine_export.js ───────────────────────
//
// 1. Сначала применить patchPineV5toV6() (из hypothesis_2)
// 2. Затем применить addActivePinev6() к результату
//
// В generatePineScript(r), в конце, перед return:
//   let code = lines.join('\n');
//   if (useV6) {
//     const v6 = patchPineV5toV6(code);
//     code = addActivePinev6(v6.code).code;
//   }
//   return code;
//
// Приоритет инпутов в USE для active=:
//   use_pivot  → pivot_left, pivot_right
//   use_engulf → (нет параметров)
//   use_pinbar → pin_ratio
//   use_boll   → bb_len, bb_mult
//   use_donch  → don_len
//   use_ma     → ma_period, ma_type (если ma_period > 0)
//   use_rsi    → rsi_os, rsi_ob
//   use_adx    → adx_thresh, adx_len
//   use_vol_filter → vol_mult
//   use_squeeze → sqz_bb_len, sqz_kc_mult, sqz_min_bars
//   use_be     → be_trig, be_off
//   use_trail  → trail_trig, trail_dist
//   use_partial → part_rr, part_pct, part_be
// ============================================================

if (typeof module !== 'undefined') {
  module.exports = { addActivePinev6 };
  if (require.main === module) runActiveDemo();
}
