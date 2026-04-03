# Knowledge Accumulation System

## Pipeline

```
Error Found → regression-detector → error-logger → rule-synthesizer
    ↓              ↓                      ↓                  ↓
Anomaly      Finds issues         Logs in JSON        Proposes rules
             (or 0 issues)        + Causes             + Confidence
```

## Error Logger

```bash
node .claude/scripts/error-logger.js
```

**Output**:
- `.claude/logs/error-log.json` — Complete history of all errors
- `.claude/logs/error-patterns.json` — Grouped by type with trends

Tracks:
- When errors first appeared
- When they disappeared
- Possible causes and confidence levels
- Patterns in error types

## Rule Synthesizer

```bash
node .claude/scripts/rule-synthesizer.js
```

Analyzes accumulated error patterns and generates hypotheses for new audit rules.

**Output**: `.claude/rules/rule-hypotheses.md`

Rules are ONLY SAVED if:
- ✅ regression-detector.js shows 0 issues for that rule
- ✅ Pattern appears in multiple test runs
- ✅ Confidence level >= 75%

## Creating New Rules (Workflow)

1. **Errors accumulate** (regression-detector logs them)
2. **Patterns emerge** (rule-synthesizer analyzes)
3. **Hypothesis proposed** (rule-hypotheses.md)
4. **Developer implements fix**
5. **Validation** (`regression-detector --runs=50`)
   - If issues = 0 → Rule is VERIFIED
   - If issues > 0 → Continue searching
6. **Save rule** (add to audit-patterns.md)

## Key Principle: VERIFICATION-FIRST

Do NOT save rules based on reasoning.
DO save rules based on:
- Evidence (multiple occurrences)
- Verification (regression-detector proof)
- Confidence (statistical threshold)

## Files

- **error-log.json** — NOT committed (grows over time)
- **error-patterns.json** — NOT committed (analysis state)
- **rule-hypotheses.md** — Proposed rules (for review)
- **audit-patterns.md** — VERIFIED rules only (enforced by checks)
