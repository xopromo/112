#!/usr/bin/env node
/**
 * RULE SYNTHESIZER v1.0
 * Анализирует накопленные ошибки и автоматически создаёт гипотезы для новых правил аудита.
 *
 * Процесс:
 * 1. Читает error-log.json (все ошибки)
 * 2. Анализирует паттерны и возможные причины
 * 3. Предлагает новые правила с confidence уровнем
 * 4. Правила сохраняются ТОЛЬКО если regression-detector = 0 issues
 */

const fs = require('fs');
const path = require('path');
const { ErrorLogger, ERROR_LOG, ERROR_PATTERNS } = require('./error-logger');

const AUDIT_DIR = path.join(__dirname, '..', 'rules');
const AUDIT_RULES_FILE = path.join(AUDIT_DIR, 'audit-patterns.md');
const HYPOTHESIS_FILE = path.join(AUDIT_DIR, 'rule-hypotheses.md');

// ============================================================
// RULE SYNTHESIZER
// ============================================================

class RuleSynthesizer {
  constructor() {
    this.logger = new ErrorLogger();
    this.errors = this.logger.errors;
    this.patterns = this.logger.patterns;
    this.hypotheses = [];
  }

  /**
   * Синтезировать гипотезы на основе паттернов ошибок
   */
  synthesizeHypotheses() {
    console.log('\n🧠 Synthesizing hypotheses from error patterns...\n');

    Object.entries(this.patterns).forEach(([errorType, pattern]) => {
      if (pattern.count < 2) return;  // Нужно минимум 2 примера

      // Если ошибка повторяется часто и есть возможные причины
      if (pattern.possibleCauses.length > 0) {
        pattern.possibleCauses.forEach(cause => {
          if (cause.confidence >= 0.7) {  // Only high confidence causes
            const hypothesis = {
              title: this.generateRuleTitle(errorType, cause.cause),
              errorType,
              cause: cause.cause,
              confidence: cause.confidence,
              evidenceCount: pattern.count,
              firstSeen: pattern.firstSeen,
              lastSeen: pattern.lastSeen,
              examples: pattern.examples.slice(0, 3),
              suggestedCode: this.generateSuggestedCode(errorType, cause.cause),
              verificationNeeded: true
            };

            this.hypotheses.push(hypothesis);
            console.log(`✓ ${hypothesis.title}`);
            console.log(`  Confidence: ${(hypothesis.confidence * 100).toFixed(0)}% | Evidence: ${hypothesis.evidenceCount}x`);
          }
        });
      }
    });

    return this.hypotheses;
  }

  /**
   * Генерировать название правила
   */
  generateRuleTitle(errorType, cause) {
    if (errorType === 'MOVEMENT_CHANGE') {
      if (cause.includes('Float32Array')) {
        return 'Rule: Always copy Float32Array before storing in dictionaries';
      }
      if (cause.includes('reference')) {
        return 'Rule: Use Array.from() when storing eq in global equities dictionary';
      }
    }

    if (errorType === 'DATA_REFERENCE_REUSE') {
      if (cause.includes('Array.from')) {
        return 'Rule: Protect all eq arrays with Array.from() before saving';
      }
      if (cause.includes('slice')) {
        return 'Rule: Use Array.from(eq.slice()) to prevent view mutations';
      }
    }

    return `Rule: Fix ${errorType} caused by ${cause}`;
  }

  /**
   * Генерировать suggested code fix
   */
  generateSuggestedCode(errorType, cause) {
    if (cause.includes('Array.from') || cause.includes('copy')) {
      return {
        wrong: 'equities[name] = rFull.eq;',
        right: 'equities[name] = Array.from(rFull.eq);'
      };
    }

    if (cause.includes('slice')) {
      return {
        wrong: 'const arr = eq.slice(0, n);',
        right: 'const arr = Array.from(eq.slice(0, n));'
      };
    }

    if (cause.includes('reference')) {
      return {
        wrong: 'const eq = rFull.eq;',
        right: 'const eq = Array.from(rFull.eq);'
      };
    }

    return null;
  }

  /**
   * Проверить что гипотеза имеет достаточно доказательств
   */
  hasEnoughEvidence(hypothesis) {
    // Нужно минимум 3 примера одной ошибки
    if (hypothesis.evidenceCount < 3) return false;

    // Confidence должна быть >= 75%
    if (hypothesis.confidence < 0.75) return false;

    // Ошибка должна быть видна в нескольких тестах
    if (hypothesis.examples.length < 2) return false;

    return true;
  }

  /**
   * Сохранить гипотезы в файл
   */
  saveHypotheses() {
    let content = '# RULE HYPOTHESES\n\n';
    content += `Generated: ${new Date().toISOString()}\n\n`;
    content += 'These are candidate rules based on accumulated errors.\n';
    content += 'They are NOT yet verified and should NOT be added to audit-patterns.md\n';
    content += 'until regression-detector confirms they fix the issue.\n\n';

    this.hypotheses.forEach((h, idx) => {
      content += `## ${idx + 1}. ${h.title}\n\n`;
      content += `**Status**: ${h.verificationNeeded ? '⏳ NEEDS VERIFICATION' : '✅ VERIFIED'}\n`;
      content += `**Confidence**: ${(h.confidence * 100).toFixed(0)}%\n`;
      content += `**Evidence**: ${h.evidenceCount} occurrences\n`;
      content += `**Cause**: ${h.cause}\n`;
      content += `**First Seen**: ${h.firstSeen.split('T')[0]}\n`;
      content += `**Last Seen**: ${h.lastSeen.split('T')[0]}\n\n`;

      if (h.suggestedCode) {
        content += `**Suggested Fix**:\n\`\`\`javascript\n`;
        content += `// ❌ Wrong:\n${h.suggestedCode.wrong}\n\n`;
        content += `// ✅ Right:\n${h.suggestedCode.right}\n`;
        content += `\`\`\`\n\n`;
      }

      content += `**Examples**:\n`;
      h.examples.forEach(ex => {
        content += `- ${ex}\n`;
      });
      content += '\n';
    });

    content += '---\n\n';
    content += '## Verification Process\n\n';
    content += '1. Pick a hypothesis\n';
    content += '2. Implement the fix in the code\n';
    content += '3. Run: `node .claude/scripts/regression-detector.js --runs=50`\n';
    content += '4. If issues = 0, the rule is VERIFIED and can be added to audit-patterns.md\n';

    if (!fs.existsSync(AUDIT_DIR)) {
      fs.mkdirSync(AUDIT_DIR, { recursive: true });
    }

    fs.writeFileSync(HYPOTHESIS_FILE, content);
    return HYPOTHESIS_FILE;
  }

  /**
   * Вывести отчет
   */
  printReport() {
    console.log('\n' + '='.repeat(70));
    console.log('RULE SYNTHESIS REPORT');
    console.log('='.repeat(70));

    console.log(`\nError Patterns Analyzed: ${Object.keys(this.patterns).length}`);
    console.log(`Total Errors Seen: ${this.errors.length}`);
    console.log(`Hypotheses Generated: ${this.hypotheses.length}`);

    console.log('\n📋 HYPOTHESES:\n');

    const verified = this.hypotheses.filter(h => this.hasEnoughEvidence(h));
    const unverified = this.hypotheses.filter(h => !this.hasEnoughEvidence(h));

    if (verified.length > 0) {
      console.log(`✅ STRONG CANDIDATES (ready for verification):\n`);
      verified.forEach((h, i) => {
        console.log(`  ${i + 1}. ${h.title}`);
        console.log(`     Confidence: ${(h.confidence * 100).toFixed(0)}% | Evidence: ${h.evidenceCount}x`);
      });
    }

    if (unverified.length > 0) {
      console.log(`\n⏳ WEAK HYPOTHESES (need more evidence):\n`);
      unverified.forEach((h, i) => {
        console.log(`  ${i + 1}. ${h.title}`);
        console.log(`     Confidence: ${(h.confidence * 100).toFixed(0)}% | Evidence: ${h.evidenceCount}x`);
      });
    }

    console.log('\n' + '='.repeat(70));
  }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  const detailed = args.includes('--detailed');

  try {
    const synth = new RuleSynthesizer();

    if (synth.errors.length === 0) {
      console.log('ℹ️  No errors logged yet. Run regression-detector.js first.');
      process.exit(0);
    }

    synth.synthesizeHypotheses();
    synth.printReport();

    const hypFile = synth.saveHypotheses();
    console.log(`\n📄 Hypotheses saved to: ${hypFile}`);

    const verified = synth.hypotheses.filter(h => synth.hasEnoughEvidence(h));
    if (verified.length > 0) {
      console.log(`\n⚠️  ${verified.length} rule(s) ready for verification!`);
      console.log('To verify: implement fix → run regression-detector.js --runs=50');
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { RuleSynthesizer };
