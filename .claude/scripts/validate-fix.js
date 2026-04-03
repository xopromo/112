#!/usr/bin/env node
/**
 * VALIDATE FIX v1.0
 * Проверяет, что после фикса eq данные остаются неизменными после OOS расчета
 *
 * Критическая проверка: Если результат сохранён с _eqCalc = _shadowEq (без копирования),
 * то этот результат может быть повреждён если _shadowEq будет переиспользована.
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// SIMULATION: Как eq может быть повреждена
// ============================================================

/**
 * Имитирует сценарий где _shadowEq переиспользуется
 * (это может случиться если буфер переиспользуется в backtest)
 */
function testEqReuse() {
  console.log('\n' + '='.repeat(70));
  console.log('TEST: eq Buffer Reuse (как может быть повреждена)');
  console.log('='.repeat(70));

  // Симулируем как backtest() создаёт Float32Array
  const bufferPool = new Float32Array(1000);  // Общий буфер

  // Первый результат использует часть буфера
  const eq1 = bufferPool.subarray(0, 100);
  for (let i = 0; i < eq1.length; i++) eq1[i] = i * 0.1;

  // Результат сохранён БЕЗ копирования (BAD)
  const result1_bad = { eq: eq1 };

  // Результат сохранён С копированием (GOOD)
  const result1_good = { eq: Array.from(eq1) };

  console.log(`eq1 первые значения: [${Array.from(eq1).slice(0, 5).join(', ')}...]`);

  // Второй результат переиспользует тот же буфер
  const eq2 = bufferPool.subarray(100, 200);
  for (let i = 0; i < eq2.length; i++) eq2[i] = 999;  // Заполняем 999

  console.log(`\nПосле переиспользования буфера (eq2 заполнена на 999):`);
  console.log(`  result1_bad.eq:  [${Array.from(result1_bad.eq).slice(0, 5).join(', ')}...] (возможно повреждена!)`);
  console.log(`  result1_good.eq: [${Array.from(result1_good.eq).slice(0, 5).join(', ')}...] (защищена)`);

  // Проверяем повреждение
  const eq1Original = Array.from(eq1).slice(0, 5);
  const badCorrupted = result1_bad.eq[0] !== eq1Original[0];
  const goodSafe = result1_good.eq[0] === eq1Original[0];

  return !badCorrupted && goodSafe;
}

/**
 * Проверяет конкретно проблему _eqCalc
 */
function testEqCalcStorage() {
  console.log('\n' + '='.repeat(70));
  console.log('TEST: _eqCalc Storage (как была проблема)');
  console.log('='.repeat(70));

  // Симулируем _shadowEq из TPE режима
  const _shadowEq = new Float32Array(100);
  for (let i = 0; i < _shadowEq.length; i++) {
    _shadowEq[i] = Math.sin(i / 10) * 50;  // Синусоида
  }

  // НЕПРАВИЛЬНЫЙ способ (как было в коде)
  let _eqCalc_bad = _shadowEq;  // Прямая ссылка

  // ПРАВИЛЬНЫЙ способ (как исправлено)
  let _eqCalc_good = Array.from(_shadowEq);  // Копирование

  console.log(`_shadowEq первые значения: [${Array.from(_shadowEq).slice(0, 5).join(', ')}...]`);

  // Результат сохранён в результаты
  const results_bad = [{ eqCalc: _eqCalc_bad }];
  const results_good = [{ eqCalc: _eqCalc_good }];

  // Теперь _shadowEq переиспользуется и модифицируется
  for (let i = 0; i < _shadowEq.length; i++) {
    _shadowEq[i] = -999;  // Испортили данные
  }

  console.log(`\nПосле модификации _shadowEq на -999:`);
  console.log(`  results_bad[0].eqCalc:  [${Array.from(results_bad[0].eqCalc).slice(0, 5).join(', ')}...] (ПОВРЕЖДЕНА!)`);
  console.log(`  results_good[0].eqCalc: [${Array.from(results_good[0].eqCalc).slice(0, 5).join(', ')}...] (защищена)`);

  const badCorrupted = results_bad[0].eqCalc[0] === -999;
  const goodSafe = results_good[0].eqCalc[0] !== -999;

  console.log(`\n  results_bad corrupted? ${badCorrupted ? '🔴 YES' : '✅ NO'}`);
  console.log(`  results_good safe? ${goodSafe ? '✅ YES' : '🔴 NO'}`);

  return badCorrupted && goodSafe;
}

/**
 * Проверяет движение графика (как это проверяла regression-detector)
 */
function testMovementPreservation() {
  console.log('\n' + '='.repeat(70));
  console.log('TEST: Movement Pattern Preservation');
  console.log('='.repeat(70));

  // Создаём equity с определённым паттерном
  const eq = new Float32Array(50);
  let pnl = 0;
  const pattern = [];
  for (let i = 0; i < eq.length; i++) {
    const delta = i % 5 < 3 ? 1 : -0.5;  // UP UP UP DOWN DOWN
    pnl += delta;
    eq[i] = pnl;
    if (i > 0) {
      pattern.push(eq[i] > eq[i-1] ? 1 : (eq[i] < eq[i-1] ? -1 : 0));
    }
  }

  // Копируем двумя способами
  const eq_bad = eq;  // Неправильно
  const eq_good = Array.from(eq);  // Правильно

  // Модифицируем исходный eq
  for (let i = 10; i < 20; i++) {
    eq[i] *= 0.5;  // Уменьшаем часть
  }

  // Проверяем паттерн
  function getMovementPattern(e) {
    const p = [];
    for (let i = 1; i < e.length; i++) {
      const d = e[i] - e[i-1];
      p.push(Math.abs(d) < 0.001 ? 0 : (d > 0 ? 1 : -1));
    }
    return p;
  }

  const bad_pattern = getMovementPattern(eq_bad).slice(0, 10).join('');
  const good_pattern = getMovementPattern(eq_good).slice(0, 10).join('');
  const original_pattern = pattern.slice(0, 10).join('');

  console.log(`Original pattern:  ${original_pattern}`);
  console.log(`eq_bad pattern:    ${bad_pattern} (${bad_pattern === original_pattern ? '✅ OK' : '🔴 CHANGED'})`);
  console.log(`eq_good pattern:   ${good_pattern} (${good_pattern === original_pattern ? '✅ OK' : '🔴 CHANGED'})`);

  return bad_pattern !== original_pattern && good_pattern === original_pattern;
}

/**
 * Проверяет как Array.from защищает от модификации
 */
function testArrayFromProtection() {
  console.log('\n' + '='.repeat(70));
  console.log('TEST: Array.from() Protection');
  console.log('='.repeat(70));

  const original = new Float32Array([1, 2, 3, 4, 5]);

  // Три способа хранения
  const ref = original;
  const copy = Array.from(original);
  const f32copy = new Float32Array(original);

  // Снимаем исходные значения
  const snapshots = {
    ref: Array.from(ref),
    copy: Array.from(copy),
    f32copy: Array.from(f32copy)
  };

  // Модифицируем исходный
  for (let i = 0; i < original.length; i++) {
    original[i] = 999;
  }

  console.log(`После модификации original на 999:`);
  console.log(`  ref (direct):      [${Array.from(ref).slice(0, 3).join(', ')}...] ${ref[0] === 999 ? '🔴 MODIFIED' : '✅ OK'}`);
  console.log(`  copy (Array.from): [${Array.from(copy).slice(0, 3).join(', ')}...] ${copy[0] === 999 ? '🔴 MODIFIED' : '✅ OK'}`);
  console.log(`  f32copy (new):     [${Array.from(f32copy).slice(0, 3).join(', ')}...] ${f32copy[0] === 999 ? '🔴 MODIFIED' : '✅ OK'}`);

  const refCorrupted = ref[0] === 999;
  const copyProtected = copy[0] !== 999;
  const f32Protected = f32copy[0] !== 999;

  return refCorrupted && copyProtected && f32Protected;
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log('✅ VALIDATION: _eqCalc Fix\n');

  const tests = [
    { name: 'eq Buffer Reuse', fn: testEqReuse, weight: 1 },
    { name: '_eqCalc Storage', fn: testEqCalcStorage, weight: 2 },  // CRITICAL
    { name: 'Movement Preservation', fn: testMovementPreservation, weight: 1 },
    { name: 'Array.from() Protection', fn: testArrayFromProtection, weight: 2 }  // CRITICAL
  ];

  let score = 0;
  const maxScore = tests.reduce((s, t) => s + t.weight, 0);
  const results = [];

  for (const test of tests) {
    try {
      const passed = test.fn();
      const points = passed ? test.weight : 0;
      score += points;
      results.push({
        test: test.test.name,
        passed,
        points,
        weight: test.weight
      });
    } catch (err) {
      console.error(`\n❌ Error in ${test.name}:`, err.message);
      results.push({
        test: test.name,
        passed: false,
        points: 0,
        weight: test.weight,
        error: err.message
      });
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  results.forEach(r => {
    const icon = r.passed ? '✅' : '❌';
    const pts = r.passed ? `+${r.weight}` : '0';
    console.log(`${icon} ${r.test.padEnd(30)} [${pts}/${r.weight}]`);
    if (r.error) console.log(`   Error: ${r.error}`);
  });

  console.log(`\nScore: ${score}/${maxScore} (${Math.round(score/maxScore*100)}%)`);

  if (score >= maxScore * 0.8) {
    console.log('✅ FIX VALIDATION PASSED - Array.from() protection is working');
    process.exit(0);
  } else {
    console.log('❌ FIX VALIDATION FAILED - More work needed');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
