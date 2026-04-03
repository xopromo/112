#!/usr/bin/env node
/**
 * Инструмент для отслеживания где ИМЕННО начинают расходиться eq_old и eq_new
 *
 * Нужно добавить логирование в _drawOOSGraphicForResult перед рисованием
 * и распечатать эту информацию
 */

console.log('═'.repeat(80));
console.log('REQUIRED INSTRUMENTATION: _drawOOSGraphicForResult');
console.log('═'.repeat(80));

const code = `
// ДОБАВИТЬ В ui_equity.js ВНУ­ТРИ _drawOOSGraphicForResult ПОСЛЕ ВСЕЙ ОЧИСТКИ:

function _drawOOSGraphicForResult(r) {
  // ... весь существующий код ...

  // <<<< ДИАГНОСТИКА НАЧАЛО
  if (true) {  // CHANGE TO: if (r.name.includes('...')) для одного результата
    console.log('\\n=== OOS EQUITY DIVERGENCE TRACE ===');
    console.log('Result:', r.name);
    console.log('');

    // ДО очистки
    console.log('BEFORE CLEANING:');
    console.log('  eq_old[0-5]:', (r.old_eq || []).slice(0, 6).map(v => v.toFixed(2)).join(', '));
    console.log('  eq_old.length:', r.old_eq?.length);
    console.log('  eq_new[0-5]:', (r.new_eq || []).slice(0, 6).map(v => v.toFixed(2)).join(', '));
    console.log('  eq_new.length:', r.new_eq?.length);

    // После очистки но перед конкатенацией
    console.log('\\nAFTER CLEANING:');
    console.log('  oldEqClean[0-5]:', oldEqClean.slice(0, 6).map(v => v.toFixed(2)).join(', '));
    console.log('  oldEqClean.length:', oldEqClean.length);
    console.log('  newEqClean[0-5]:', newEqClean.slice(0, 6).map(v => v.toFixed(2)).join(', '));
    console.log('  newEqClean.length:', newEqClean.length);

    // После конкатенации
    console.log('\\nAFTER CONCATENATION:');
    console.log('  combined[0-5]:', combined.slice(0, 6).map(v => v.toFixed(2)).join(', '));
    console.log('  combined.length:', combined.length);
    console.log('  splitIdx:', splitIdx);

    // КЛЮЧЕВЫЕ ЗНАЧЕНИЯ
    console.log('\\nKEY VALUES:');
    console.log('  old_eq last 5:', r.old_eq.slice(-5).map(v => v.toFixed(2)).join(', '));
    console.log('  new_eq last 5:', r.new_eq.slice(-5).map(v => v.toFixed(2)).join(', '));
    console.log('  combined last 5:', combined.slice(-5).map(v => v.toFixed(2)).join(', '));

    // ПРОВЕРКА: расходятся ли значения?
    if (r.old_eq && r.new_eq) {
      const oldEnd = r.old_eq[r.old_eq.length - 1];
      const newStart = r.new_eq[0];  // Should connect here
      const diff = oldEnd - newStart;
      console.log('\\nCONNECTION POINT:');
      console.log('  old_eq[-1]:', oldEnd.toFixed(2));
      console.log('  new_eq[0]:', newStart.toFixed(2));
      console.log('  Difference:', diff.toFixed(2));
      console.log('  Expected newEqClean[0] after shift:', 0);
    }

    // Найти где начинается расхождение
    console.log('\\nDIVERGENCE SEARCH:');
    let maxDiv = 0;
    let maxDivIdx = 0;
    const minLen = Math.min(r.old_eq?.length || 0, r.new_eq?.length || 0);
    for (let i = 0; i < Math.min(minLen, 100); i++) {
      const ratio = r.new_eq[i] / (r.old_eq[i] || 1);
      if (ratio > 1.1 || ratio < 0.9) {  // >10% divergence
        if (Math.abs(ratio - 1) > maxDiv) {
          maxDiv = Math.abs(ratio - 1);
          maxDivIdx = i;
        }
      }
    }
    console.log('  First divergence at bar:', maxDivIdx);
    console.log('  old_eq[' + maxDivIdx + ']:', r.old_eq?.[maxDivIdx]?.toFixed(2));
    console.log('  new_eq[' + maxDivIdx + ']:', r.new_eq?.[maxDivIdx]?.toFixed(2));
    console.log('  Ratio:', (r.new_eq?.[maxDivIdx] / (r.old_eq?.[maxDivIdx] || 1))?.toFixed(3));
  }
  // >>>> ДИАГНОСТИКА КОНЕЦ
}
`;

console.log('\nДобавить этот код в ui_equity.js в функцию _drawOOSGraphicForResult');
console.log('\nКод:');
console.log(code);

console.log('\n' + '═'.repeat(80));
console.log('WHAT THIS WILL SHOW:');
console.log('═'.repeat(80));

console.log(`
1. BEFORE vs AFTER: Как меняются массивы после очистки
2. CONNECTION POINT: Где eq_old заканчивается и eq_new начинается
3. DIVERGENCE SEARCH: Первый бар где они начинают расходиться

Это позволит ТОЧНО определить:
  - Начинаются ли они расходиться с самого начала или позже?
  - Это систематическое расхождение (растущее) или локальное?
  - Связано ли с warmup или с самим расчетом eq?

════════════════════════════════════════════════════════════════════════════════

ГИПОТЕЗЫ для проверки по результатам логирования:

1. ❓ eq значения РАЗНЫЕ с самого начала (старт неправильный)
   → Может быть разные стартовые условия при рассчете на DATA vs NEW_DATA

2. ❓ eq расходятся ПОСТЕПЕННО (growth rate разный)
   → Может быть indicator warmup different
   → Или market conditions между IS/OOS периодами

3. ❓ eq одинаковые ДО какой-то точки, потом расходятся
   → Может быть specific logic branch (например EqMA filter)

4. ❓ ratio new_eq/old_eq СТАБИЛЬНО > 1.0 везде
   → Может быть данные НЕПРАВИЛЬНО разделены (overlapping или сместить)
`);
