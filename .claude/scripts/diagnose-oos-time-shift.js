#!/usr/bin/env node
/**
 * DIAGNOSTICS: OOS Time Shift Bug
 * Проверяем что DATA (IS) и NEW_DATA (OOS) не путаются при рисовании графика
 * 
 * Симптом: голубая линия смещена влево и повторяет оранжевую
 *          как будто повторяет прошлое вместо будущего
 */

console.log('🔍 OOS Time Shift Diagnosis');
console.log('============================\n');

console.log('Гипотезы что может быть:');
console.log('');
console.log('1️⃣  DATA и NEW_DATA перепутаны');
console.log('   - При вычислении eq_new используется неправильный DATA source');
console.log('   - Вместо NEW_DATA используется DATA');
console.log('');

console.log('2️⃣  Индексирование при concatenation ошибочно');
console.log('   - Line _drawOOSGraphicForResult:228: newEqClean = eq_new.slice(overlapIdx)');
console.log('   - Может быть overlapIdx считается неправильно');
console.log('');

console.log('3️⃣  Warmup смещение неправильное');
console.log('   - Line _drawOOSGraphicForResult:243-252');
console.log('   - warmupEndIdx может смещать данные неправильно');
console.log('');

console.log('4️⃣  Baseline filtering (EqMA) путает данные');
console.log('   - Если useEqMA=true, может быть проблема в расчёте MA на новых данных');
console.log('   - Индикатор может использовать исторические данные вместо новых');
console.log('');

console.log('5️⃣  Split index расчёт неверный');
console.log('   - Line _drawOOSGraphicForResult:267-268');
console.log('   - splitIdx должен быть длина eq_old, но может быть неправильный');
console.log('');

console.log('6️⃣  EqMA фильтр использует неправильные данные');
console.log('   - Если eqCalcBaselineArr это результат на DATA (не NEW_DATA)');
console.log('   - То baseline_new содержит историю вместо будущего');
console.log('');

console.log('============================\n');
console.log('🎯 Первый чек: посмотрим есть ли путаница DATA/NEW_DATA');
console.log('');

const fs = require('fs');
const path = require('path');

// Ищем где вычисляется eq_new
const uiOosPath = path.join(__dirname, '..', '..', 'ui_oos.js');
const content = fs.readFileSync(uiOosPath, 'utf8');
const lines = content.split('\n');

// Ищем _runOOS функцию где вычисляется rNew
let inRunOOS = false;
let rNewAssignments = [];

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('_runOOS(') || lines[i].includes('const _runOOS =')) {
    inRunOOS = true;
  }
  
  if (inRunOOS && lines[i].includes('rNew =') && !lines[i].includes('rNew_')) {
    rNewAssignments.push({
      line: i + 1,
      code: lines[i].trim()
    });
  }
  
  if (inRunOOS && lines[i].includes('return')) {
    break;
  }
}

if (rNewAssignments.length > 0) {
  console.log('Found rNew assignments in _runOOS:');
  rNewAssignments.forEach(a => {
    console.log(`  Line ${a.line}: ${a.code.substring(0, 80)}...`);
  });
} else {
  console.log('⚠️  Could not find rNew assignments - need to check structure');
}

console.log('\n');
console.log('🎯 Второй чек: есть ли DATA vs NEW_DATA путаница');
console.log('');

// Ищем где вычисляется eq для NEW_DATA
const lines2 = content.split('\n');
let globalDataUsage = [];

for (let i = 1350; i < 1450; i++) {
  if (i >= lines2.length) break;
  
  if (lines2[i].includes('DATA[') || lines2[i].includes('DATA.length')) {
    globalDataUsage.push({
      line: i + 1,
      code: lines2[i].trim(),
      context: '(в блоке OOS)'
    });
  }
}

if (globalDataUsage.length > 0) {
  console.log('❌ FOUND: DATA usage in OOS block (может быть ошибка!):');
  globalDataUsage.slice(0, 5).forEach(u => {
    console.log(`  Line ${u.line}: ${u.code.substring(0, 80)}...`);
  });
  console.log('  ^ Это может быть причина! OOS должен использовать NEW_DATA, а не DATA');
} else {
  console.log('✅ No direct DATA usage found in OOS block');
}

