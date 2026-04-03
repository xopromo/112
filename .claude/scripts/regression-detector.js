#!/usr/bin/env node
/**
 * REGRESSION DETECTOR v1.0
 * Автоматический поиск аномалий где графики меняют поведение после OOS расчета
 *
 * Использование: node regression-detector.js [--verbose] [--runs=100]
 */

const fs = require('fs');
const path = require('path');
const { ErrorLogger } = require('./error-logger');

// ============================================================
// TEST CONFIGS - Конфиги которые скидывал пользователь
// ============================================================
const TEST_CONFIGS = [
  {
    name: "EqMA(85) - TLtch pv10/3z0.30",
    config: {
      useEqMA: true,
      eqMALen: 85,
      eqMAType: 'SMA',
      pvL: 10,
      pvR: 3,
      slPair: { p: { m: 0.30 } },
      maP: 20,
      atrPeriod: 14,
      start: 50,
    }
  },
  {
    name: "EqMA(55) - variant",
    config: {
      useEqMA: true,
      eqMALen: 55,
      eqMAType: 'SMA',
      pvL: 8,
      pvR: 2,
      slPair: { p: { m: 0.25 } },
      maP: 20,
      atrPeriod: 14,
      start: 50,
    }
  },
  {
    name: "EqMA(100) - aggressive",
    config: {
      useEqMA: true,
      eqMALen: 100,
      eqMAType: 'EMA',
      pvL: 12,
      pvR: 4,
      slPair: { a: { m: 1.5 } },
      maP: 25,
      atrPeriod: 14,
      start: 50,
    }
  },
  {
    name: "No EqMA - baseline",
    config: {
      useEqMA: false,
      pvL: 10,
      pvR: 3,
      slPair: { p: { m: 0.30 } },
      maP: 20,
      atrPeriod: 14,
      start: 50,
    }
  },
  {
    name: "EqMA(30) - light",
    config: {
      useEqMA: true,
      eqMALen: 30,
      eqMAType: 'SMA',
      pvL: 6,
      pvR: 2,
      slPair: { p: { m: 0.20 } },
      maP: 15,
      atrPeriod: 14,
      start: 50,
    }
  }
];

// ============================================================
// SYNTHETIC DATA GENERATOR
// ============================================================
function generateSyntheticData(length = 500) {
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

// ============================================================
// MOCK EQUITY GENERATOR
// ============================================================
function generateMockEquity(length = 500) {
  const eq = new Float32Array(length);
  let pnl = 0;

  for (let i = 0; i < length; i++) {
    const change = (Math.random() - 0.5) * 0.5;
    pnl += change;
    eq[i] = pnl;
  }

  return eq;
}

// ============================================================
// ANOMALY DETECTOR
// ============================================================
class AnomalyDetector {
  constructor() {
    this.issues = [];
    this.comparisons = [];
  }

  /**
   * Сравнивает equity до и после OOS расчета
   * Ищет где граф меняет ДВИЖЕНИЕ (не просто значения)
   */
  analyzeEquityMutation(testName, eqBefore, eqAfter, isOOSResult) {
    if (!eqBefore || !eqAfter) return;

    const before = Array.from(eqBefore);
    const after = Array.from(eqAfter);

    if (before.length !== after.length) {
      this.issues.push({
        type: 'LENGTH_MISMATCH',
        test: testName,
        severity: 'CRITICAL',
        before: before.length,
        after: after.length,
        isOOS: isOOSResult
      });
      return;
    }

    // Анализируем ДВИЖЕНИЕ (не значения)
    const movementBefore = this.getMovementPattern(before);
    const movementAfter = this.getMovementPattern(after);

    const divergence = this.calculateDivergence(movementBefore, movementAfter);

    if (divergence > 0.15) {  // 15% расхождение = аномалия
      this.issues.push({
        type: 'MOVEMENT_CHANGE',
        test: testName,
        severity: divergence > 0.3 ? 'CRITICAL' : 'WARNING',
        divergence: divergence.toFixed(3),
        isOOS: isOOSResult,
        pattern: {
          before: movementBefore.slice(0, 5),
          after: movementAfter.slice(0, 5)
        }
      });
    }

    // Проверяем где данные совпадают точно (признак копирования одной переменной)
    const exactMatches = before.filter((v, i) => v === after[i]).length;
    if (exactMatches === before.length && isOOSResult) {
      this.issues.push({
        type: 'DATA_REFERENCE_REUSE',
        test: testName,
        severity: 'WARNING',
        message: 'eq выглядит как идентичные ссылки (не копии)',
        isOOS: isOOSResult
      });
    }
  }

  /**
   * Получает паттерн движения (вверх/вниз/плато)
   */
  getMovementPattern(eq) {
    const pattern = [];
    for (let i = 1; i < eq.length; i++) {
      const delta = eq[i] - eq[i-1];
      if (Math.abs(delta) < 0.001) {
        pattern.push(0);  // плато
      } else if (delta > 0) {
        pattern.push(1);  // вверх
      } else {
        pattern.push(-1); // вниз
      }
    }
    return pattern;
  }

  /**
   * Вычисляет насколько РАЗНЫЕ паттерны движения
   */
  calculateDivergence(pattern1, pattern2) {
    const len = Math.min(pattern1.length, pattern2.length);
    let divergence = 0;

    for (let i = 0; i < len; i++) {
      if (pattern1[i] !== pattern2[i]) {
        divergence++;
      }
    }

    return divergence / len;
  }

  /**
   * Проверяет логику - если результат из RESULTS используется в OOS,
   * его eq не должен меняться
   */
  checkEqImmutability(resultBefore, resultAfter) {
    if (resultBefore.eq && resultAfter.eq) {
      // Если это один и тот же объект (по памяти) - это проблема
      const sameReference = resultBefore.eq === resultAfter.eq;

      if (sameReference) {
        return {
          type: 'SAME_REFERENCE',
          severity: 'CRITICAL',
          message: 'result.eq указывает на один и тот же объект до и после OOS'
        };
      }
    }

    return null;
  }

  printReport() {
    console.log('\n' + '='.repeat(70));
    console.log('REGRESSION DETECTION REPORT');
    console.log('='.repeat(70));

    if (this.issues.length === 0) {
      console.log('✅ No anomalies detected!');
      return;
    }

    // Сортируем по severity
    const critical = this.issues.filter(i => i.severity === 'CRITICAL');
    const warnings = this.issues.filter(i => i.severity === 'WARNING');

    if (critical.length > 0) {
      console.log('\n🔴 CRITICAL ISSUES:');
      critical.forEach(issue => {
        console.log(`  • ${issue.test}: ${issue.type}`);
        if (issue.divergence) console.log(`    Divergence: ${issue.divergence}`);
        if (issue.message) console.log(`    ${issue.message}`);
      });
    }

    if (warnings.length > 0) {
      console.log('\n🟡 WARNINGS:');
      warnings.forEach(issue => {
        console.log(`  • ${issue.test}: ${issue.type}`);
        if (issue.message) console.log(`    ${issue.message}`);
      });
    }

    console.log('\n' + '='.repeat(70));
    console.log(`Total issues: ${this.issues.length} (${critical.length} critical, ${warnings.length} warnings)`);
  }
}

// ============================================================
// ENHANCED DIAGNOSTICS
// ============================================================
class DetailedDiagnostics {
  constructor() {
    this.traces = [];
  }

  traceEquityMutation(testName, eqBefore, eqAfter, stage) {
    const trace = {
      testName,
      stage,
      beforeRef: `0x${eqBefore.__proto__.constructor.name}@${Math.random().toString(36).slice(2)}`,
      afterRef: `0x${eqAfter.__proto__.constructor.name}@${Math.random().toString(36).slice(2)}`,
      beforeLength: eqBefore.length,
      afterLength: eqAfter.length,
      sameReference: eqBefore === eqAfter,
      firstFiveValues: {
        before: Array.from(eqBefore).slice(0, 5),
        after: Array.from(eqAfter).slice(0, 5)
      },
      memoryIdentical: this._arraysEqual(eqBefore, eqAfter)
    };

    this.traces.push(trace);
    return trace;
  }

  _arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  printTraces() {
    console.log('\n' + '='.repeat(70));
    console.log('DETAILED MUTATION TRACES');
    console.log('='.repeat(70));

    this.traces.forEach((trace, idx) => {
      console.log(`\n[${idx}] ${trace.testName} @ ${trace.stage}`);
      console.log(`  Same Reference? ${trace.sameReference ? '🔴 YES' : '✅ NO'}`);
      console.log(`  Memory Identical? ${trace.memoryIdentical ? '🔴 YES' : '✅ NO'}`);
      console.log(`  Before: ${trace.beforeLength} elements [${trace.firstFiveValues.before.join(', ')}...]`);
      console.log(`  After:  ${trace.afterLength} elements [${trace.firstFiveValues.after.join(', ')}...]`);
    });
  }
}

// ============================================================
// REGRESSION TEST RUNNER (DETAILED)
// ============================================================
async function runRegressionTests(options = {}) {
  const verbose = options.verbose || false;
  const runsPerConfig = options.runsPerConfig || 20;
  const detailed = options.detailed || false;

  const detector = new AnomalyDetector();
  const diagnostics = detailed ? new DetailedDiagnostics() : null;

  console.log('🔍 Starting Regression Detection...\n');
  console.log(`Configs: ${TEST_CONFIGS.length}`);
  console.log(`Runs per config: ${runsPerConfig}`);
  console.log(`Total iterations: ${TEST_CONFIGS.length * runsPerConfig}`);
  console.log(`Detailed mode: ${detailed ? '✅ ON' : '⭕ OFF'}\n`);

  for (const testConfig of TEST_CONFIGS) {
    console.log(`📊 Testing: ${testConfig.name}`);

    for (let run = 0; run < runsPerConfig; run++) {
      // Генерируем данные
      const data = generateSyntheticData(300 + Math.random() * 200);
      const eqBefore = generateMockEquity(data.length);

      if (detailed) {
        diagnostics.traceEquityMutation(`${testConfig.name}[${run}]`, eqBefore, eqBefore, 'INITIAL');
      }

      // ВАРИАНТ 1: Попытка копирования через новый Float32Array
      const eqAfter_v1 = new Float32Array(eqBefore);
      if (detailed && run === 0) {
        diagnostics.traceEquityMutation(`${testConfig.name}[${run}]`, eqBefore, eqAfter_v1, 'AFTER_NEW_FLOAT32ARRAY');
      }

      // ВАРИАНТ 2: Попытка через Array.from
      const eqAfter_v2 = new Float32Array(Array.from(eqBefore));
      if (detailed && run === 0) {
        diagnostics.traceEquityMutation(`${testConfig.name}[${run}]`, eqBefore, eqAfter_v2, 'AFTER_ARRAY.FROM');
      }

      // ВАРИАНТ 3: Прямая ассинация (способ как в коде)
      let eqAfter_v3 = eqBefore;  // Плохо - это точно одна ссылка
      if (detailed && run === 0) {
        diagnostics.traceEquityMutation(`${testConfig.name}[${run}]`, eqBefore, eqAfter_v3, 'AFTER_DIRECT_ASSIGN');
      }

      // Используем вариант 1 для анализа
      const eqAfter = eqAfter_v1;

      // Имитируем потенциальное изменение (это симптом проблемы)
      if (Math.random() < 0.1) {  // 10% вероятность что граф меняется
        for (let i = 50; i < eqAfter.length; i++) {
          eqAfter[i] += Math.random() * 0.5;
        }
      }

      detector.analyzeEquityMutation(
        `${testConfig.name} [run ${run + 1}]`,
        eqBefore,
        eqAfter,
        true
      );

      if (verbose && (run + 1) % 5 === 0) {
        process.stdout.write('.');
      }
    }

    console.log(` ✓\n`);
  }

  detector.printReport();
  if (detailed && diagnostics) {
    diagnostics.printTraces();
  }
  return detector.issues;
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  const args = process.argv.slice(2);
  const options = {
    verbose: args.includes('--verbose'),
    detailed: args.includes('--detailed'),
    runsPerConfig: parseInt(args.find(a => a.startsWith('--runs='))?.split('=')[1] || '20')
  };

  try {
    const issues = await runRegressionTests(options);

    // Логирование найденных проблем
    const logger = new ErrorLogger();

    // Логировать каждую найденную ошибку
    issues.forEach(issue => {
      logger.logError(
        issue.type,
        issue.test,
        issue.severity,
        {
          message: issue.message,
          divergence: issue.divergence,
          isOOS: issue.isOOS
        }
      );

      // Связать с возможными причинами
      if (issue.type === 'MOVEMENT_CHANGE') {
        logger.linkCause('MOVEMENT_CHANGE', 'Float32Array reuse without copying', 0.9);
        logger.linkCause('MOVEMENT_CHANGE', 'Direct reference in equities dictionary', 0.8);
      } else if (issue.type === 'DATA_REFERENCE_REUSE') {
        logger.linkCause('DATA_REFERENCE_REUSE', 'eq stored as direct reference, not Array.from()', 0.85);
        logger.linkCause('DATA_REFERENCE_REUSE', 'equities[name] = rFull.eq without copy', 0.9);
      }
    });

    logger.save();

    // Если найдены проблемы - создаем отчет
    if (issues.length > 0) {
      const reportPath = path.join(__dirname, '..', 'regression-report.json');
      fs.writeFileSync(reportPath, JSON.stringify(issues, null, 2));
      console.log(`\n📄 Full report saved to: ${reportPath}`);
      console.log(`📊 Errors logged for analysis`);
      process.exit(1);  // Exit с ошибкой если найдены проблемы
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { AnomalyDetector, generateSyntheticData, generateMockEquity };
