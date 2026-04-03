#!/usr/bin/env node
/**
 * EQ MUTATION TRACKER v1.0
 * Отслеживает ТОЧНО где и когда eq данные меняют свои значения.
 *
 * Инструмент для диагностики: какие конкретно элементы eq меняются
 * и в какой момент времени это происходит.
 */

// ============================================================
// PROXY для отслеживания mutations
// ============================================================

/**
 * Создаёт proxy для Float32Array который логирует все изменения
 */
function createTrackedArray(original, name) {
  const handler = {
    set(target, prop, value) {
      if (typeof prop === 'string' && !isNaN(prop)) {
        const idx = parseInt(prop);
        const oldVal = target[idx];
        if (oldVal !== value) {
          console.log(`🔴 MUTATION: ${name}[${idx}] changed from ${oldVal.toFixed(4)} to ${value.toFixed(4)}`);
          console.trace('Stack trace:');
        }
      }
      target[prop] = value;
      return true;
    }
  };

  return new Proxy(original, handler);
}

/**
 * Отслеживает когда eq сохраняется и переиспользуется
 */
class EquityTracker {
  constructor() {
    this.savedArrays = new Map();  // name -> { array, refs, firstSave, modifications }
    this.sharedReferences = new Set();
  }

  /**
   * Регистрирует сохранение eq
   */
  registerEq(name, array, source) {
    if (!this.savedArrays.has(name)) {
      this.savedArrays.set(name, {
        array: array,
        arraySnapshot: Array.from(array),  // Снимок в момент сохранения
        source: source,
        firstSave: new Date().toISOString(),
        lastAccess: new Date().toISOString(),
        refCount: 1,
        mutations: []
      });
      console.log(`✓ Saved eq[${name}] from ${source}`);
    } else {
      const info = this.savedArrays.get(name);
      info.refCount++;
      info.lastAccess = new Date().toISOString();
      console.log(`⚠️  eq[${name}] already saved! RefCount=${info.refCount}`);
    }
  }

  /**
   * Проверяет если eq был повреждён (значения изменились)
   */
  checkMutation(name) {
    const info = this.savedArrays.get(name);
    if (!info) return null;

    const mutations = [];
    for (let i = 0; i < info.array.length; i++) {
      if (info.array[i] !== info.arraySnapshot[i]) {
        mutations.push({
          index: i,
          original: info.arraySnapshot[i],
          current: info.array[i],
          delta: info.array[i] - info.arraySnapshot[i]
        });
      }
    }

    if (mutations.length > 0) {
      info.mutations.push({
        timestamp: new Date().toISOString(),
        count: mutations.length,
        examples: mutations.slice(0, 5)
      });

      console.log(`\n🔴 MUTATION DETECTED in eq[${name}]:`);
      console.log(`   ${mutations.length} элементов изменилось`);
      console.log(`   First mutation: index ${mutations[0].index}`);
      console.log(`   ${mutations[0].original.toFixed(4)} → ${mutations[0].current.toFixed(4)}`);
    }

    return mutations;
  }

  /**
   * Проверяет если eq это одна и та же ссылка
   */
  checkReference(name1, name2) {
    const info1 = this.savedArrays.get(name1);
    const info2 = this.savedArrays.get(name2);

    if (!info1 || !info2) return false;

    const sameRef = info1.array === info2.array;
    if (sameRef) {
      console.log(`\n🔴 SHARED REFERENCE: eq[${name1}] and eq[${name2}] point to same array!`);
      this.sharedReferences.add(`${name1}↔${name2}`);
    }

    return sameRef;
  }

  /**
   * Отчет о проблемах
   */
  generateReport() {
    console.log('\n' + '='.repeat(70));
    console.log('EQUITY MUTATION REPORT');
    console.log('='.repeat(70));

    let hasIssues = false;

    // Проверить все сохранённые массивы на мутации
    this.savedArrays.forEach((info, name) => {
      this.checkMutation(name);

      if (info.mutations.length > 0) {
        hasIssues = true;
        console.log(`\n⚠️  eq[${name}]:`);
        console.log(`   Source: ${info.source}`);
        console.log(`   Refs: ${info.refCount}`);
        console.log(`   Mutations: ${info.mutations.length}`);
        console.log(`   First: ${info.firstSave}`);
        console.log(`   Last: ${info.lastAccess}`);
      }
    });

    // Проверить общие ссылки
    if (this.sharedReferences.size > 0) {
      hasIssues = true;
      console.log(`\n🔴 SHARED REFERENCES (${this.sharedReferences.size}):`);
      this.sharedReferences.forEach(pair => {
        console.log(`   ${pair}`);
      });
    }

    // Проверить RefCount > 1
    const multiRef = Array.from(this.savedArrays.entries()).filter(([_, info]) => info.refCount > 1);
    if (multiRef.length > 0) {
      console.log(`\n⚠️  MULTI-REFERENCED (используются > 1 раза):`);
      multiRef.forEach(([name, info]) => {
        console.log(`   eq[${name}]: ${info.refCount} refs`);
      });
    }

    if (!hasIssues) {
      console.log('✅ No mutations detected!');
    }

    console.log('\n' + '='.repeat(70));
    return hasIssues;
  }
}

// ============================================================
// SIMULATION TEST
// ============================================================

console.log('🧪 Testing Equity Mutation Scenarios\n');

const tracker = new EquityTracker();

// Сценарий 1: Правильное сохранение (с копией)
console.log('Scenario 1: Correct storage with Array.from()\n');
const eq1 = new Float32Array([1, 2, 3, 4, 5]);
const eq1Copy = Array.from(eq1);
tracker.registerEq('result1_correct', eq1Copy, 'Array.from()');
tracker.checkMutation('result1_correct');

// Сценарий 2: Неправильное сохранение (без копии)
console.log('\nScenario 2: Wrong storage without copy\n');
const eq2 = new Float32Array([1, 2, 3, 4, 5]);
tracker.registerEq('result2_wrong', eq2, 'Direct reference');

// Имитируем модификацию исходного массива
console.log('Modifying eq2...');
eq2[0] = 999;
eq2[2] = 888;

tracker.checkMutation('result2_wrong');

// Сценарий 3: Общая ссылка
console.log('\nScenario 3: Shared reference\n');
const eq3 = new Float32Array([1, 2, 3, 4, 5]);
tracker.registerEq('result3a_shared', eq3, 'Source A');
tracker.registerEq('result3b_shared', eq3, 'Source B (same ref!)');
tracker.checkReference('result3a_shared', 'result3b_shared');

// Генерируем отчет
tracker.generateReport();

// ============================================================
// EXPORTS
// ============================================================

module.exports = { EquityTracker, createTrackedArray };
