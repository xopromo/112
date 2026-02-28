// ============================================================
// EXPERIMENT: Гипотеза 2 — Pine Script v6 экспорт
// ============================================================
// Источник: TradingView Pine Script v6 Release Notes (март 2025)
//   https://www.tradingview.com/pine-script-docs/migration-guides/v6/
//
// Проблема: pine_export.js генерирует //@version=5
//   Pine v6 вышел в марте 2025 — более чистый синтаксис,
//   динамические request.security() вызовы, строгая типизация bool,
//   новые встроенные функции.
//
// Изменения v5 → v6 (релевантные для USE экспортера):
//   1. //@version=6
//   2. bool-выражения: na теперь false (не ошибка) — убирает workaround
//   3. matrix.* функции (для будущего equity matrix)
//   4. strategy() — убран параметр `pyramiding` (теперь int, не float)
//   5. indicator() — max_lines_count до 500 (уже есть), новый limit 9999 в v6
//   6. input.source() — deprecate в v5, в v6 правильный способ
//   7. Строгая проверка типов: int != float явно
//
// Что делает этот файл:
//   patchPineV5toV6(code) — принимает строку Pine v5 кода,
//   возвращает строку Pine v6 кода с автоматическими исправлениями
// ============================================================

'use strict';

// ── Патч: конвертация Pine Script v5 → v6 ────────────────────
// Принимает строку сгенерированного кода из pine_export.js
// Возвращает строку с изменениями для v6
function patchPineV5toV6(code) {
  if (!code || typeof code !== 'string') return code;

  const patches = [];
  let result = code;

  // 1. Версия
  if (result.includes('//@version=5')) {
    result = result.replace('//@version=5', '//@version=6');
    patches.push('version 5→6');
  }

  // 2. indicator() — в v6 max_lines_count/labels/boxes лимит 9999
  //    Меняем 500 → 9999 чтобы использовать новые лимиты
  const indicatorOld = /max_lines_count=500,\s*max_labels_count=500,\s*max_boxes_count=500/;
  if (indicatorOld.test(result)) {
    result = result.replace(
      indicatorOld,
      'max_lines_count=9999, max_labels_count=9999, max_boxes_count=9999'
    );
    patches.push('indicator limits 500→9999');
  }

  // 3. Pine v6 строгая типизация: float-деление где ожидается int
  //    Паттерн: math.round(...) / 2 → теперь // оператор для int деления
  //    (minor: только для явных случаев int/int)
  // Пока skip — требует полного AST-анализа

  // 4. Deprecated: nz(x, 0.0) → в v6 можно использовать x ?? 0.0
  //    Заменяем простые nz(x, 0) → x != na ? x : 0 (v6-style)
  //    Это необязательно, nz() всё ещё работает в v6, пропускаем

  // 5. string concatenation: в v6 предпочтителен str.format()
  //    Пропускаем — обратно совместимо

  // 6. Добавляем комментарий в header о версии
  result = result.replace(
    '// USE Strategy Engine — экспорт из оптимизатора',
    '// USE Strategy Engine — экспорт из оптимизатора (Pine Script v6)'
  );
  patches.push('header comment updated');

  return { code: result, patches };
}

// ── Тест ─────────────────────────────────────────────────────
function runPineV6Demo() {
  const sampleV5 = `
//@version=5
// ============================================================
// USE Strategy Engine — экспорт из оптимизатора
// Конфиг: Pivot_MA20_SL2ATR_RR2
// PnL: 45.3%  WR: 62.1%  Сделок: 148  DD: 8.2%
// ============================================================
indicator("USE [Pivot_MA20_SL2ATR_RR2]", shorttitle="USE_EXP", overlay=true, max_lines_count=500, max_labels_count=500, max_boxes_count=500)
`.trim();

  console.log('=== Pine v5 → v6 патч ===\n');
  console.log('--- ВХОД (v5) ---');
  console.log(sampleV5);
  console.log('');

  const { code: v6code, patches } = patchPineV5toV6(sampleV5);
  console.log('--- ВЫХОД (v6) ---');
  console.log(v6code);
  console.log('');
  console.log(`Применено патчей: ${patches.length}`);
  patches.forEach(p => console.log(`  ✓ ${p}`));

  // Diff-стиль
  console.log('\n=== Изменения ===');
  const oldLines = sampleV5.split('\n');
  const newLines = v6code.split('\n');
  oldLines.forEach((line, i) => {
    if (line !== newLines[i]) {
      console.log(`- ${line}`);
      console.log(`+ ${newLines[i]}`);
    }
  });
}

// ── Как интегрировать в pine_export.js ───────────────────────
//
// Вариант A (простой переключатель):
//   В generatePineScript(r) — добавить параметр версии:
//     const useV6 = (typeof $c === 'function') && $c('pine_v6_export');
//     lines.push(useV6 ? '//@version=6' : '//@version=5');
//     if (useV6) {
//       // обновить max_lines_count до 9999
//     }
//
// Вариант B (полный переход):
//   Изменить дефолт на v6, добавить все v6-специфичные улучшения.
//   Риск: пользователи на старых TV аккаунтах могут иметь проблемы.
//   Рекомендация: Вариант A с чекбоксом "Pine v6 (beta)"
//
// UI добавление:
//   В shell.html, рядом с кнопкой экспорта Pine:
//   <label><input type="checkbox" id="pine_v6_export"> v6 (новые лимиты)</label>
// ============================================================

if (typeof module !== 'undefined') {
  module.exports = { patchPineV5toV6 };
  if (require.main === module) runPineV6Demo();
}
