#!/usr/bin/env node
/**
 * PROFILER v1.0
 * Собирает статистику выполнения для адаптивного watchdog
 *
 * Использование:
 *   node profiler.js --scenario=OOS-fullscan --duration=2150 --passes=45
 *   node profiler.js --init  (очистить старые данные)
 */

const fs = require('fs');
const path = require('path');

const STATS_DIR = path.join(__dirname, '..', 'memory', 'profiling-data');
const STATS_FILE = path.join(STATS_DIR, 'execution-stats.json');

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================
function initProfiler() {
  if (!fs.existsSync(STATS_DIR)) {
    fs.mkdirSync(STATS_DIR, { recursive: true });
  }

  const initial = {
    executions: [],
    last_updated: new Date().toISOString()
  };

  fs.writeFileSync(STATS_FILE, JSON.stringify(initial, null, 2));
  console.log(`✅ Profiler initialized: ${STATS_FILE}`);
}

// ============================================================
// ЗАПИСЬ МЕТРИКИ
// ============================================================
function recordExecution(scenario, durationMs, passesCompleted, status = 'completed') {
  // Убедимся что директория существует
  if (!fs.existsSync(STATS_DIR)) {
    fs.mkdirSync(STATS_DIR, { recursive: true });
  }

  let stats = { executions: [] };

  // Загружаем существующую статистику
  if (fs.existsSync(STATS_FILE)) {
    try {
      const content = fs.readFileSync(STATS_FILE, 'utf8');
      stats = JSON.parse(content);
      if (!Array.isArray(stats.executions)) {
        stats.executions = [];
      }
    } catch (e) {
      console.warn(`⚠️  Could not parse stats file, starting fresh: ${e.message}`);
      stats = { executions: [] };
    }
  }

  // Добавляем новую запись
  const execution = {
    timestamp: new Date().toISOString(),
    scenario,
    duration_ms: durationMs,
    passes_completed: passesCompleted,
    status
  };

  stats.executions.push(execution);
  stats.last_updated = new Date().toISOString();

  // Сохраняем (ограничиваем размер - держим последние 500 записей)
  if (stats.executions.length > 500) {
    stats.executions = stats.executions.slice(-500);
  }

  fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));

  if (process.env.PROFILER_VERBOSE) {
    console.log(`📊 Recorded: ${scenario} - ${durationMs}ms, ${passesCompleted} passes`);
  }
}

// ============================================================
// ПОЛУЧИТЬ СТАТИСТИКУ ПО СЦЕНАРИЮ
// ============================================================
function getScenarioStats(scenario) {
  if (!fs.existsSync(STATS_FILE)) {
    return null;
  }

  try {
    const content = fs.readFileSync(STATS_FILE, 'utf8');
    const stats = JSON.parse(content);

    const executions = stats.executions
      .filter(e => e.scenario === scenario && e.status === 'completed');

    if (executions.length === 0) {
      return null;
    }

    const durations = executions.map(e => e.duration_ms);
    const passes = executions.map(e => e.passes_completed);

    // Вычисляем статистику
    const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
    const stdev = (arr, mean) => {
      const variance = arr.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / arr.length;
      return Math.sqrt(variance);
    };
    const percentile = (arr, p) => {
      const sorted = [...arr].sort((a, b) => a - b);
      const idx = Math.ceil((p / 100) * sorted.length) - 1;
      return sorted[Math.max(0, idx)];
    };

    const durationAvg = avg(durations);
    const durationStdev = stdev(durations, durationAvg);
    const passesAvg = avg(passes);

    return {
      scenario,
      samples: executions.length,
      duration: {
        avg: durationAvg,
        stdev: durationStdev,
        percentile_95: percentile(durations, 95),
        min: Math.min(...durations),
        max: Math.max(...durations)
      },
      passes: {
        avg: passesAvg,
        percentile_95: percentile(passes, 95),
        min: Math.min(...passes),
        max: Math.max(...passes)
      }
    };
  } catch (e) {
    console.error(`Error reading stats: ${e.message}`);
    return null;
  }
}

// ============================================================
// CLI
// ============================================================
const args = process.argv.slice(2);

if (args.includes('--init')) {
  initProfiler();
} else if (args.some(a => a.startsWith('--scenario'))) {
  const scenarioArg = args.find(a => a.startsWith('--scenario'));
  const durationArg = args.find(a => a.startsWith('--duration'));
  const passesArg = args.find(a => a.startsWith('--passes'));

  if (!scenarioArg || !durationArg || !passesArg) {
    console.error('Usage: --scenario=NAME --duration=MS --passes=NUM');
    process.exit(1);
  }

  const scenario = scenarioArg.split('=')[1];
  const duration = parseInt(durationArg.split('=')[1]);
  const passes = parseInt(passesArg.split('=')[1]);

  recordExecution(scenario, duration, passes);
} else if (args.some(a => a.startsWith('--get'))) {
  const scenarioArg = args.find(a => a.startsWith('--get'));
  const scenario = scenarioArg.split('=')[1];

  const stats = getScenarioStats(scenario);
  console.log(JSON.stringify(stats, null, 2));
} else {
  console.log(`
PROFILER - Execution Statistics Collector

Usage:
  node profiler.js --init
    Initialize profiler (clear old data)

  node profiler.js --scenario=NAME --duration=MS --passes=NUM
    Record execution: NAME (string), MS (milliseconds), NUM (number of passes)

  node profiler.js --get=NAME
    Get statistics for scenario NAME (JSON output)

Examples:
  node profiler.js --init
  node profiler.js --scenario=OOS-fullscan --duration=2150 --passes=45
  node profiler.js --get=OOS-fullscan
  `);
}

module.exports = { recordExecution, getScenarioStats, initProfiler };
