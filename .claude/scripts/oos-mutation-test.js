#!/usr/bin/env node
/**
 * OOS MUTATION TEST v1.0
 * Проверяет реально ли меняется eq во время OOS расчета
 * Симулирует реальный поток: сохраняем eq, запускаем OOS, проверяем не изменилась ли
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// MOCK DATA STRUCTURES
// ============================================================

/**
 * Имитирует результат из таблицы результатов
 */
function createMockResult(configName) {
  const eqLength = 300 + Math.floor(Math.random() * 200);
  const eq = new Float32Array(eqLength);
  let pnl = 0;
  for (let i = 0; i < eqLength; i++) {
    const change = (Math.random() - 0.5) * 0.5;
    pnl += change;
    eq[i] = pnl;
  }

  return {
    name: configName,
    eq: eq,
    pnl: pnl,
    wr: Math.random() * 100,
    dd: Math.random() * 50,
    _cached: true
  };
}

/**
 * Генерирует синтетические данные как NEW_DATA в реальном коде
 */
function generateNewData(length) {
  const data = [];
  let price = 100;

  for (let i = 0; i < length; i++) {
    const change = (Math.random() - 0.5) * 2;
    price = Math.max(price + change, 90);

    data.push({
      t: i,
      o: price + (Math.random() - 0.5),
      h: price + Math.abs(Math.random()),
      l: price - Math.abs(Math.random()),
      c: price + (Math.random() - 0.5) * 0.5,
      v: Math.random() * 1000000
    });
  }

  return data;
}

/**
 * Имитирует OOS сканирование - как оно работает в ui_oos.js
 * Ключевой момент: результаты из RESULTS[oi] переиспользуются
 */
function simulateOOSScan(results, newData) {
  // Копируем eq перед OOS (как должно быть)
  const originalEqs = results.map(r => {
    if (!r.eq) return null;

    // ВАРИАНТ 1: Неправильно - просто ссылка
    // return r.eq;

    // ВАРИАНТ 2: Правильно - копируем
    return new Float32Array(r.eq);
  });

  // Имитируем расчёт OOS (может быть долгий процесс)
  // ПРОБЛЕМА: Если использовать r.eq напрямую, он может быть изменён
  for (let oosRunIdx = 0; oosRunIdx < 3; oosRunIdx++) {
    for (let i = 0; i < results.length; i++) {
      const r = results[i];

      // Симулируем что-то что может случайно изменить r.eq
      // (это может быть побочный эффект в backtest, переиспользование буфера и т.д.)
      if (Math.random() < 0.05) {  // 5% шанс "случайной" модификации
        // Плохой код где-то в цепочке может сделать так:
        for (let j = Math.floor(Math.random() * r.eq.length); j < r.eq.length; j++) {
          r.eq[j] *= (0.95 + Math.random() * 0.1);  // Модифицируем eq!
        }
      }
    }
  }

  return {
    originalEqs,
    resultsAfterOOS: results,
    mutationDetected: results.some((r, i) => {
      if (!originalEqs[i]) return false;

      // Проверяем изменилась ли
      for (let j = 0; j < r.eq.length; j++) {
        if (r.eq[j] !== originalEqs[i][j]) {
          return true;  // Обнаружено изменение!
        }
      }
      return false;
    })
  };
}

/**
 * Проверяет конкретное место где может быть проблема
 * Как в opt.js строка 2315: eq: r.eq (без копирования)
 */
function checkDirectAssignment() {
  console.log('\n' + '='.repeat(70));
  console.log('CHECK 1: Direct Assignment (opt.js line 2315)');
  console.log('='.repeat(70));

  const result = createMockResult('TEST1');
  const originalRef = result.eq;

  // Симулируем как это делается в opt.js (неправильно):
  const pushed = { eq: result.eq };  // ПРЯМАЯ ССЫЛКА!

  console.log(`Original eq reference: ${originalRef === result.eq ? '✅ Same' : '❌ Different'}`);
  console.log(`Pushed eq reference: ${originalRef === pushed.eq ? '✅ Same' : '❌ Different'}`);

  // Теперь кто-то может изменить это:
  for (let i = 100; i < 110; i++) {
    result.eq[i] *= 0.9;  // Изменяем исходный
  }

  // Проверяем что pushed тоже изменился (плохо!)
  const pushedAlsoChanged = pushed.eq[100] === result.eq[100];
  console.log(`After modifying result.eq, pushed.eq also changed? ${pushedAlsoChanged ? '🔴 YES (BAD!)' : '✅ NO (GOOD!)'}`);

  return !pushedAlsoChanged;  // Тест пройден если они независимы
}

/**
 * Проверяет проблему с переиспользованием буфера
 */
function checkBufferReuse() {
  console.log('\n' + '='.repeat(70));
  console.log('CHECK 2: Buffer Reuse (Shared Float32Array)');
  console.log('='.repeat(70));

  // Симулируем ситуацию где один буфер переиспользуется
  const sharedBuffer = new Float32Array(500);
  for (let i = 0; i < sharedBuffer.length; i++) {
    sharedBuffer[i] = Math.random();
  }

  // Результат 1 использует этот буфер
  const result1 = {
    name: 'Result1',
    eq: sharedBuffer.subarray(0, 250)  // Подмассив!
  };

  // Результат 2 использует ту же память (другую часть)
  const result2 = {
    name: 'Result2',
    eq: sharedBuffer.subarray(250, 500)  // Подмассив же самого буфера!
  };

  console.log(`Result1 eq length: ${result1.eq.length}`);
  console.log(`Result2 eq length: ${result2.eq.length}`);
  console.log(`Shared buffer? ${result1.eq.buffer === result2.eq.buffer ? '🔴 YES (BAD!)' : '✅ NO'}`);

  // Если модифицируем один - влияет ли на другой?
  const val1Before = result2.eq[0];
  // Пытаемся изменить result1
  for (let i = 0; i < result1.eq.length; i++) {
    result1.eq[i] = 999;
  }
  const val1After = result2.eq[0];

  console.log(`Result2 eq[0] before: ${val1Before}`);
  console.log(`Result2 eq[0] after modifying Result1: ${val1After}`);
  console.log(`Mutation leaked? ${val1Before !== val1After ? '🔴 YES (BAD!)' : '✅ NO'}`);

  return result1.eq.buffer !== result2.eq.buffer;
}

/**
 * Проверяет конкретно что происходит в analyzeEquityMutation
 * когда я беру Array.from(eqBefore)
 */
function checkArrayFrom() {
  console.log('\n' + '='.repeat(70));
  console.log('CHECK 3: Array.from() Conversion');
  console.log('='.repeat(70));

  const original = new Float32Array([1, 2, 3, 4, 5]);

  // Способ 1: новый Float32Array
  const copy1 = new Float32Array(original);

  // Способ 2: Array.from
  const copy2 = new Float32Array(Array.from(original));

  // Способ 3: прямая ссылка
  const copy3 = original;

  console.log(`new Float32Array(original) - Same ref? ${original === copy1 ? '🔴 YES' : '✅ NO'}`);
  console.log(`new Float32Array(Array.from(original)) - Same ref? ${original === copy2 ? '🔴 YES' : '✅ NO'}`);
  console.log(`Direct assignment - Same ref? ${original === copy3 ? '🔴 YES' : '✅ NO'}`);

  // Тест модификации
  original[0] = 999;

  console.log(`After modifying original[0] to 999:`);
  console.log(`  copy1[0] = ${copy1[0]} (should be 1)`);
  console.log(`  copy2[0] = ${copy2[0]} (should be 1)`);
  console.log(`  copy3[0] = ${copy3[0]} (should be 999)`);

  const copy1Safe = copy1[0] === 1;
  const copy2Safe = copy2[0] === 1;
  const copy3Safe = copy3[0] === 999;

  console.log(`\nResults: copy1=${copy1Safe ? '✅' : '❌'}, copy2=${copy2Safe ? '✅' : '❌'}, copy3=${copy3Safe ? '✅' : '❌'}`);

  return copy1Safe && copy2Safe && copy3Safe;
}

/**
 * Главный тест OOS flow
 */
function runOOSMutationTest() {
  console.log('\n' + '='.repeat(70));
  console.log('CHECK 4: OOS Scan Flow');
  console.log('='.repeat(70));

  // Создаём результаты как в реальном коде
  const results = [
    createMockResult('Config1'),
    createMockResult('Config2'),
    createMockResult('Config3')
  ];

  console.log(`Created ${results.length} mock results`);

  // Сохраняем исходные значения
  const originalValues = results.map(r => {
    return Array.from(r.eq).slice(0, 10);  // Первые 10 значений
  });

  // Запускаем OOS (где может быть проблема)
  const oosResult = simulateOOSScan(results, generateNewData(400));

  console.log(`\nAfter OOS scan:`);
  console.log(`  Mutation detected in results? ${oosResult.mutationDetected ? '🔴 YES (BAD!)' : '✅ NO (GOOD!)'}`);

  // Проверяем каждый результат
  results.forEach((r, idx) => {
    const before = originalValues[idx];
    const after = Array.from(r.eq).slice(0, 10);

    const same = before.every((v, i) => v === after[i]);
    console.log(`  Result[${idx}] values same? ${same ? '✅ YES' : '🔴 NO (CHANGED!)'}`);

    if (!same) {
      console.log(`    Before: [${before.join(', ')}...]`);
      console.log(`    After:  [${after.join(', ')}...]`);
    }
  });

  return !oosResult.mutationDetected;
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log('🔬 OOS MUTATION TEST\n');

  const tests = [
    { name: 'Direct Assignment', fn: checkDirectAssignment },
    { name: 'Buffer Reuse', fn: checkBufferReuse },
    { name: 'Array.from()', fn: checkArrayFrom },
    { name: 'OOS Flow', fn: runOOSMutationTest }
  ];

  let passCount = 0;
  const results = [];

  for (const test of tests) {
    try {
      const passed = test.fn();
      results.push({ test: test.name, passed });
      if (passed) passCount++;
    } catch (err) {
      console.error(`\n❌ Error in ${test.name}:`, err.message);
      results.push({ test: test.name, passed: false, error: err.message });
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  results.forEach(r => {
    const icon = r.passed ? '✅' : '❌';
    console.log(`${icon} ${r.test}${r.error ? ` (${r.error})` : ''}`);
  });
  console.log(`\nPassed: ${passCount}/${tests.length}`);

  process.exit(passCount === tests.length ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { createMockResult, generateNewData, simulateOOSScan };
