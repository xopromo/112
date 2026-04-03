# Push Checklist

## Before Push

1. **Merge main if needed**
   ```bash
   git fetch origin main
   git merge origin/main --no-edit || bash .claude/scripts/auto-resolve-conflicts.sh
   ```

2. **Run checks**
   ```bash
   bash .claude/scripts/dumb-checks.sh
   ```

3. **Commit and push**
   ```bash
   git add -A && git commit -m "..."
   git push -u origin claude/your-branch
   ```

## Auto-Resolve Conflicts

`auto-resolve-conflicts.sh` automatically resolves conflicts in:
- Generated files: `USE_Optimizer_v6_built.html`, `USE_Optimizer_v6_built.js`
  - Takes version from main
  - Rebuilds bundle via `python build.py`
- Source code conflicts: Requires manual resolution (safe!)

## Dumb Checks (Critical Rules)

Enforced by pre-push:

1. console.log in core (opt.js, core.js)
2. Hardcoded colors (warning only)
3. Nested ternary operators
4. Missing filter warmup checks
5. Config sync (_cfg, _cfg_tpe, _cfg_ex)
6. CLAUDE.md line numbers outdated
7. Unit tests failing
8. **Pattern-bug without FULL SEARCH**
   - Float32Array corruption fixes must be in multiple files
   - Blocks if only 1 file changed

## If Checks Fail

Read error message - it tells exactly what's wrong and how to fix.

Example: If pattern-bug detected:
```
❌ ОШИБКА: Float32Array fix в 1 файле(s)
   Float32Array corruption - это ПАТТЕРН, должны быть исправления в:
   - opt.js, ui_oos.js, ui_hc.js, ui_equity.js (минимум)
```

→ Do FULL SEARCH for all instances before fixing
