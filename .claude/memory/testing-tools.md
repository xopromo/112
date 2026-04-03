# Testing Tools

## Regression Detection

```bash
node .claude/scripts/regression-detector.js --runs=50 --verbose
```

Detects MOVEMENT_CHANGE and DATA_REFERENCE_REUSE anomalies in equity data through 100+ test iterations.

## Mutation Testing

```bash
node .claude/scripts/oos-mutation-test.js
```

Tests if Float32Array corruption prevention (Array.from()) actually works.

## Validation

```bash
node .claude/scripts/validate-fix.js
```

Validates that Array.from() properly protects data from mutations.

## Complete Test Suite

```bash
bash .claude/scripts/run-all-tests.sh [--quick]
```

Runs all tests + error analysis + rule synthesis.

## Mutation Tracking (Diagnostics)

```bash
node .claude/scripts/eq-mutation-tracker.js
```

Tracks exactly where and when eq data mutates.

## Auto-Resolve Conflicts

```bash
bash .claude/scripts/auto-resolve-conflicts.sh
```

Automatically resolves conflicts in generated files (bundles).
