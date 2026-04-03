#!/usr/bin/env node
/**
 * ERROR LOGGER v1.0
 * Накапливает ошибки и аномалии для автоматического создания правил аудита.
 *
 * Система:
 * 1. error-log.json — база всех найденных issues (растёт со временем)
 * 2. error-patterns.json — группировка ошибок по типам и причинам
 * 3. Питает rule-synthesizer.js который автоматически создаёт гипотезы
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const ERROR_LOG = path.join(LOG_DIR, 'error-log.json');
const ERROR_PATTERNS = path.join(LOG_DIR, 'error-patterns.json');

// Убедиться что директория существует
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// ============================================================
// ERROR LOGGER CLASS
// ============================================================

class ErrorLogger {
  constructor() {
    this.errors = this.loadLog();
    this.patterns = this.loadPatterns();
  }

  loadLog() {
    if (fs.existsSync(ERROR_LOG)) {
      try {
        return JSON.parse(fs.readFileSync(ERROR_LOG, 'utf8'));
      } catch (e) {
        return [];
      }
    }
    return [];
  }

  loadPatterns() {
    if (fs.existsSync(ERROR_PATTERNS)) {
      try {
        return JSON.parse(fs.readFileSync(ERROR_PATTERNS, 'utf8'));
      } catch (e) {
        return {};
      }
    }
    return {};
  }

  /**
   * Логирует ошибку/аномалию
   * @param {string} type - тип ошибки (MOVEMENT_CHANGE, DATA_REFERENCE_REUSE и т.д.)
   * @param {string} test - описание теста где обнаружена ошибка
   * @param {string} severity - CRITICAL, WARNING, INFO
   * @param {object} details - дополнительная информация
   */
  logError(type, test, severity, details = {}) {
    const error = {
      timestamp: new Date().toISOString(),
      sessionDate: new Date().toISOString().split('T')[0],
      type,
      test,
      severity,
      details,
      hash: this.hashError(type, test, details)  // для дедупликации
    };

    this.errors.push(error);

    // Обновить pattern
    if (!this.patterns[type]) {
      this.patterns[type] = {
        count: 0,
        firstSeen: error.timestamp,
        lastSeen: error.timestamp,
        severity: severity,
        examples: [],
        possibleCauses: []
      };
    }

    this.patterns[type].count++;
    this.patterns[type].lastSeen = error.timestamp;
    if (this.patterns[type].severity === 'INFO' && severity !== 'INFO') {
      this.patterns[type].severity = severity;  // upgrade severity
    }

    // Сохранить примеры (максимум 5 последних)
    if (!this.patterns[type].examples.includes(test)) {
      this.patterns[type].examples.push(test);
      if (this.patterns[type].examples.length > 5) {
        this.patterns[type].examples.shift();
      }
    }

    return error;
  }

  /**
   * Связывает ошибку с возможной причиной
   */
  linkCause(errorType, cause, confidence = 0.5) {
    if (!this.patterns[errorType]) return;

    if (!this.patterns[errorType].possibleCauses) {
      this.patterns[errorType].possibleCauses = [];
    }

    const existing = this.patterns[errorType].possibleCauses.find(c => c.cause === cause);
    if (existing) {
      existing.confidence = Math.max(existing.confidence, confidence);
      existing.seen++;
    } else {
      this.patterns[errorType].possibleCauses.push({
        cause,
        confidence,  // 0.0 - 1.0
        seen: 1
      });
    }
  }

  /**
   * Простой хеш для дедупликации
   */
  hashError(type, test, details) {
    const str = `${type}:${test}:${JSON.stringify(details).slice(0, 50)}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;  // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Получить статистику за период
   */
  getStats(days = 7) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const recent = this.errors.filter(e => new Date(e.timestamp) > cutoff);

    return {
      totalErrors: recent.length,
      byType: this.groupBy(recent, 'type'),
      bySeverity: this.groupBy(recent, 'severity'),
      topErrors: this.getTopErrors(recent, 5),
      trend: this.calculateTrend(recent)
    };
  }

  groupBy(arr, key) {
    return arr.reduce((acc, item) => {
      acc[item[key]] = (acc[item[key]] || 0) + 1;
      return acc;
    }, {});
  }

  getTopErrors(arr, limit = 5) {
    const grouped = {};
    arr.forEach(e => {
      const key = `${e.type}:${e.severity}`;
      grouped[key] = (grouped[key] || 0) + 1;
    });

    return Object.entries(grouped)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([key, count]) => {
        const [type, severity] = key.split(':');
        return { type, severity, count };
      });
  }

  calculateTrend(arr) {
    if (arr.length < 2) return 'UNKNOWN';

    const mid = Math.floor(arr.length / 2);
    const firstHalf = arr.slice(0, mid).length;
    const secondHalf = arr.slice(mid).length;

    if (secondHalf > firstHalf * 1.2) return 'WORSENING';
    if (firstHalf > secondHalf * 1.2) return 'IMPROVING';
    return 'STABLE';
  }

  /**
   * Сохранить логи в файлы
   */
  save() {
    fs.writeFileSync(ERROR_LOG, JSON.stringify(this.errors, null, 2));
    fs.writeFileSync(ERROR_PATTERNS, JSON.stringify(this.patterns, null, 2));

    return {
      logFile: ERROR_LOG,
      patternsFile: ERROR_PATTERNS,
      totalErrors: this.errors.length,
      patternTypes: Object.keys(this.patterns).length
    };
  }

  /**
   * Вывести отчет
   */
  printReport(days = 7) {
    const stats = this.getStats(days);

    console.log('\n' + '='.repeat(70));
    console.log('ERROR ACCUMULATION REPORT');
    console.log('='.repeat(70));
    console.log(`Period: Last ${days} days`);
    console.log(`\nTotal Errors: ${stats.totalErrors}`);
    console.log(`Trend: ${stats.trend}`);

    console.log('\nBy Type:');
    Object.entries(stats.byType).forEach(([type, count]) => {
      console.log(`  ${type.padEnd(30)} ${count}`);
    });

    console.log('\nBy Severity:');
    Object.entries(stats.bySeverity).forEach(([sev, count]) => {
      const icon = sev === 'CRITICAL' ? '🔴' : sev === 'WARNING' ? '🟠' : '🟡';
      console.log(`  ${icon} ${sev.padEnd(25)} ${count}`);
    });

    console.log('\nTop Issues:');
    stats.topErrors.forEach((err, i) => {
      console.log(`  ${i + 1}. ${err.type} (${err.severity}): ${err.count}x`);
    });

    console.log('\nPattern Analysis:');
    Object.entries(this.patterns).forEach(([type, pattern]) => {
      if (pattern.count > 0) {
        console.log(`\n  ${type}:`);
        console.log(`    Seen: ${pattern.count}x (${pattern.severity})`);
        console.log(`    Range: ${pattern.firstSeen.split('T')[0]} → ${pattern.lastSeen.split('T')[0]}`);
        if (pattern.possibleCauses.length > 0) {
          console.log(`    Possible Causes:`);
          pattern.possibleCauses
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 3)
            .forEach(cause => {
              console.log(`      • ${cause.cause} (confidence: ${(cause.confidence * 100).toFixed(0)}%)`);
            });
        }
      }
    });

    console.log('\n' + '='.repeat(70));
  }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = { ErrorLogger, ERROR_LOG, ERROR_PATTERNS };

// ============================================================
// CLI USAGE
// ============================================================

if (require.main === module) {
  const logger = new ErrorLogger();

  // Примеры использования:
  // logger.logError('MOVEMENT_CHANGE', 'EqMA(85) Test', 'CRITICAL', { divergence: 0.25 });
  // logger.logError('DATA_REFERENCE_REUSE', 'OOS Scan', 'WARNING');
  // logger.linkCause('MOVEMENT_CHANGE', 'Float32Array reuse without copy', 0.8);
  // logger.linkCause('MOVEMENT_CHANGE', 'eq dictionary stores direct refs', 0.9);

  logger.printReport(7);
  const result = logger.save();
  console.log(`\n✅ Logs saved to: ${result.logFile}`);
  console.log(`✅ Patterns saved to: ${result.patternsFile}`);
  console.log(`📊 Total errors tracked: ${result.totalErrors}`);
  console.log(`📈 Pattern types: ${result.patternTypes}`);
}
