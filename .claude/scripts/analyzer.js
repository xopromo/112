#!/usr/bin/env node
/**
 * ANALYZER v1.0
 * Анализирует статистику выполнения и вычисляет адаптивные лимиты
 *
 * Использование:
 *   node analyzer.js --update
 *   node analyzer.js --report=OOS-fullscan
 */

const fs = require('fs');
const path = require('path');

const STATS_DIR = path.join(__dirname, '..', 'memory', 'profiling-data');
const STATS_FILE = path.join(STATS_DIR, 'execution-stats.json');
const LIMITS_FILE = path.join(STATS_DIR, 'adaptive-limits.json');

// ============================================================
// ДЕФОЛТНЫЕ ЛИМИТЫ (когда нет статистики)
// ============================================================
const DEFAULT_LIMITS = {
  scenarios: {
    'default': {
      recommended_timeout_ms: 5 * 60 * 1000,  // 5 minutes
      max_passes: 50,
      confidence: 0.0  // 0% = нет данных
    }
  },
  generated_at: new Date().toISOString()
};

// ============================================================
// ВЫЧИСЛИТЬ СТАТИСТИКУ И ЛИМИТЫ
// ============================================================
function analyzeAndUpdateLimits() {
  if (!fs.existsSync(STATS_FILE)) {
    console.log('⚠️  No statistics collected yet. Using defaults.');
    fs.mkdirSync(STATS_DIR, { recursive: true });
    fs.writeFileSync(LIMITS_FILE, JSON.stringify(DEFAULT_LIMITS, null, 2));
    return DEFAULT_LIMITS;
  }

  try {
    const stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
    const scenarios = {};

    // Группируем по сценариям
    const scenarioMap = {};
    stats.executions
      .filter(e => e.status === 'completed')
      .forEach(e => {
        if (!scenarioMap[e.scenario]) {
          scenarioMap[e.scenario] = [];
        }
        scenarioMap[e.scenario].push({
          duration_ms: e.duration_ms,
          passes_completed: e.passes_completed
        });
      });

    // Анализируем каждый сценарий
    Object.entries(scenarioMap).forEach(([scenario, executions]) => {
      if (executions.length < 3) {
        // Недостаточно данных - используем консервативные значения
        scenarios[scenario] = {
          avg_duration_ms: 0,
          stdev_ms: 0,
          percentile_95_ms: 5 * 60 * 1000,  // 5 min default
          recommended_timeout_ms: 5 * 60 * 1000,
          max_passes_avg: 50,
          max_passes_percentile_95: 50,
          confidence: 0.3 * executions.length / 3,  // 30% per sample
          samples: executions.length,
          note: 'Low confidence - insufficient samples'
        };
        return;
      }

      const durations = executions.map(e => e.duration_ms);
      const passes = executions.map(e => e.passes_completed);

      // Фильтруем outliers (> 3 стандартных отклонения)
      const stats_dur = calculateStats(durations);
      const filteredDurations = durations.filter(d =>
        Math.abs(d - stats_dur.avg) <= 3 * stats_dur.stdev
      );

      const stats_filtered = calculateStats(filteredDurations);
      const stats_passes = calculateStats(passes);

      // Вычисляем лимиты
      // Timeout = P95 + 1 SD (или средний + 2 SD)
      const recommendedTimeout = Math.max(
        stats_filtered.percentile_95 + stats_filtered.stdev,
        stats_filtered.avg + 2 * stats_filtered.stdev
      );

      // Confidence растет с количеством samples
      // 100 samples = 95% confidence
      const confidence = Math.min(0.95, 0.5 + (executions.length / 100) * 0.45);

      scenarios[scenario] = {
        avg_duration_ms: Math.round(stats_filtered.avg),
        stdev_ms: Math.round(stats_filtered.stdev),
        percentile_95_ms: Math.round(stats_filtered.percentile_95),
        recommended_timeout_ms: Math.round(recommendedTimeout),
        max_passes_avg: Math.round(stats_passes.avg),
        max_passes_percentile_95: Math.round(stats_passes.percentile_95),
        confidence: Math.round(confidence * 100) / 100,
        samples: executions.length
      };
    });

    const result = {
      scenarios,
      generated_at: new Date().toISOString()
    };

    fs.writeFileSync(LIMITS_FILE, JSON.stringify(result, null, 2));
    return result;
  } catch (e) {
    console.error(`Error analyzing stats: ${e.message}`);
    return DEFAULT_LIMITS;
  }
}

// ============================================================
// ВЫЧИСЛИТЬ БАЗОВУЮ СТАТИСТИКУ
// ============================================================
function calculateStats(arr) {
  if (arr.length === 0) {
    return { avg: 0, stdev: 0, percentile_95: 0 };
  }

  const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((sum, x) => sum + Math.pow(x - avg, 2), 0) / arr.length;
  const stdev = Math.sqrt(variance);

  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((95 / 100) * sorted.length) - 1;
  const percentile_95 = sorted[Math.max(0, idx)];

  return { avg, stdev, percentile_95 };
}

// ============================================================
// ПОЛУЧИТЬ ЛИМИТЫ ДЛЯ СЦЕНАРИЯ
// ============================================================
function getLimits(scenario = 'default') {
  let limits = DEFAULT_LIMITS;

  if (fs.existsSync(LIMITS_FILE)) {
    try {
      limits = JSON.parse(fs.readFileSync(LIMITS_FILE, 'utf8'));
    } catch (e) {
      console.warn(`⚠️  Could not parse limits file: ${e.message}`);
    }
  }

  // Ищем точный сценарий, иначе используем default
  const scenarioLimits = limits.scenarios[scenario] || limits.scenarios['default'];

  return {
    timeoutMs: scenarioLimits.recommended_timeout_ms || 5 * 60 * 1000,
    maxPasses: scenarioLimits.max_passes || scenarioLimits.max_passes_percentile_95 || 50,
    confidence: scenarioLimits.confidence || 0
  };
}

// ============================================================
// ВЫВЕСТИ ОТЧЕТ
// ============================================================
function printReport(scenario = null) {
  if (!fs.existsSync(LIMITS_FILE)) {
    console.log('❌ No adaptive limits computed yet. Run with --update first.');
    return;
  }

  try {
    const limits = JSON.parse(fs.readFileSync(LIMITS_FILE, 'utf8'));

    console.log('\n' + '='.repeat(70));
    console.log('ADAPTIVE LIMITS REPORT');
    console.log('='.repeat(70));
    console.log(`Generated: ${limits.generated_at}\n`);

    if (scenario && limits.scenarios[scenario]) {
      const s = limits.scenarios[scenario];
      console.log(`📊 Scenario: ${scenario}`);
      console.log(`   Samples: ${s.samples}`);
      console.log(`   Confidence: ${(s.confidence * 100).toFixed(0)}%`);
      console.log(`   Avg Duration: ${s.avg_duration_ms}ms`);
      console.log(`   P95 Duration: ${s.percentile_95_ms}ms`);
      console.log(`   → Recommended Timeout: ${s.recommended_timeout_ms}ms (${(s.recommended_timeout_ms / 1000 / 60).toFixed(1)} min)`);
      console.log(`   → Max Passes: ${s.max_passes_percentile_95}`);
    } else {
      console.log('Available scenarios:\n');
      Object.entries(limits.scenarios).forEach(([name, s]) => {
        const confidence = ((s.confidence || 0) * 100).toFixed(0);
        const timeout = ((s.recommended_timeout_ms || 0) / 1000).toFixed(0);
        console.log(`  • ${name}`);
        console.log(`    Samples: ${s.samples}, Confidence: ${confidence}%, Timeout: ${timeout}s`);
      });
    }

    console.log('\n' + '='.repeat(70));
  } catch (e) {
    console.error(`Error reading limits: ${e.message}`);
  }
}

// ============================================================
// CLI
// ============================================================
const args = process.argv.slice(2);

if (args.includes('--update')) {
  console.log('📊 Analyzing execution statistics...');
  const result = analyzeAndUpdateLimits();
  console.log(`✅ Adaptive limits updated: ${Object.keys(result.scenarios).length} scenarios`);
  printReport();
} else if (args.some(a => a.startsWith('--report'))) {
  const arg = args.find(a => a.startsWith('--report'));
  const scenario = arg === '--report' ? null : arg.split('=')[1];
  printReport(scenario);
} else {
  console.log(`
ANALYZER - Execution Statistics Analysis

Usage:
  node analyzer.js --update
    Analyze stats and compute adaptive limits

  node analyzer.js --report
    Show all scenarios and their limits

  node analyzer.js --report=SCENARIO_NAME
    Show details for specific scenario

Examples:
  node analyzer.js --update
  node analyzer.js --report
  node analyzer.js --report=OOS-fullscan
  `);
}

module.exports = { analyzeAndUpdateLimits, getLimits, calculateStats };
