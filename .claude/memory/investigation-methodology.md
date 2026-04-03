# Investigation Methodology Rules

## КРИТИЧЕСКОЕ ПРАВИЛО: Full Pattern Search Before Fixing

### The Problem
When I identify a **pattern of corruption** (e.g., "Float32Array not copied"), I must:
- ❌ NOT fix only a few instances
- ❌ NOT create tools first and fix later
- ✅ FIND ALL INSTANCES FIRST
- ✅ FIX THEM ALL AT ONCE
- ✅ THEN create verification tools

### Real Example: Float32Array Corruption Bug

**What I did WRONG** (April 3, 2026):
```
1. Found: opt.js:2647 - _eqCalc = _shadowEq (no copy)
2. Fixed: Added Array.from() to 2 places
3. Created: regression-detector.js (tool)
4. User said: "Problem persists"
5. THEN searched: ui_hc.js, ui_equity.js
   Found: 7 MORE places without copying!
```

**Result**: Wasted time, incomplete fix, user frustrated

---

## CORRECT APPROACH: Systematic Full Search

When identifying corruption pattern:

```bash
# STEP 1: Understand the pattern
Symptom: "Graphs change movement after OOS calculation"
    ↓
Root cause: "Float32Array stored by reference, reused later"
    ↓

# STEP 2: Search EVERYWHERE that pattern appears
grep -r "\.eq\s*=" *.js          # Find ALL assignments
grep -r "equities\[" *.js         # Find ALL dictionary stores
grep -r "_hcRunBacktest\|\.cache" *.js  # Find ALL caches
grep -r "subarray\|slice" *.js    # Find ALL views that could share memory
    ↓

# STEP 3: Categorize findings
- Direct assignments without copy: [list all]
- Dictionary stores without copy: [list all]
- Cache returns without copy: [list all]
- Slice/subarray without Array.from: [list all]
    ↓

# STEP 4: Fix ALL at once (not incrementally)
# Commit message should list all locations
    ↓

# STEP 5: Create verification tools
regression-detector.js, eq-mutation-tracker.js, etc
```

---

## Applied to This Bug

**All 9 places where Float32Array wasn't copied:**

| Location | Type | Fix |
|----------|------|-----|
| opt.js:1125 | Direct assign to equities dict | Array.from() |
| opt.js:1142 | Read from equities dict | Array.from() |
| opt.js:2318, 2765, 3473 | _eqCalc dict store | Array.from() |
| opt.js:2647, 3365 | _eqCalc assignment | Array.from() |
| ui_oos.js:1342, 1443 | slice() without copy | Array.from(slice()) |
| ui_equity.js:177 | HC cache assign | Array.from() |
| ui_hc.js:335 | HC cache store | Array.from() |

**Should have been found in ONE search pass**, not discovered incrementally.

---

## Why This Matters

### False Economy
```
Time spent:
- Partial fix: 30 min
- Tool creation: 2 hours
- User testing: 15 min
- "Problem persists" → realization: WASTED 2.5 hours
- Complete search: 10 min (if done first!)
- Correct fix: 30 min
TOTAL WRONG WAY: 2.5 + 10 + 30 = 2h 50m
TOTAL RIGHT WAY: 10 + 30 = 40m
```

### Trust Erosion
- User asks: "Why didn't you find this the first time?"
- Answer: "I didn't search thoroughly"
- This makes user doubt all future fixes

---

## Decision Tree for Bug Investigation

```
Found a bug!
    |
    +-- Is it a LOCALIZED bug? (one function, one file)
    |   YES → Fix that location only
    |
    +-- Is it a PATTERN bug? (e.g., "never copy Float32Array")
        YES → STOP and do FULL SEARCH first
              |
              +-- Find ALL instances of pattern
              +-- Categorize them
              +-- Fix ALL simultaneously
              +-- THEN create tools
              +-- NEVER fix incrementally
```

---

## Checklist Before Committing Pattern Fixes

- [ ] Identified root cause pattern (not just symptom)
- [ ] Searched codebase THOROUGHLY for all instances
  - Used grep/ripgrep with multiple query patterns
  - Checked all related files (opt.js, ui.js, ui_*.js)
  - Looked for related patterns (dict stores, cache returns, slice ops)
- [ ] Listed ALL findings in commit message
- [ ] Fixed ALL instances in ONE commit
- [ ] Did NOT create tools before fixing
- [ ] Commit message shows systematic search was done

---

## Forbidden Anti-Patterns

❌ **Don't do this:**
```javascript
// Found bug in one place
opt.js:2647 - _eqCalc = _shadowEq

// Fix only that
_eqCalc = Array.from(_shadowEq);

// Assume problem solved
// Create tools to verify

// User: "Still broken" → Realize 8 more places exist
```

✅ **Do this instead:**
```javascript
// Found pattern: "Float32Array stored as reference"

// Search:
grep -r "equities\[.*\].*=" opt.js ui*.js
grep -r "\.eq\s*=" opt.js ui*.js
grep -r "cache.*\=" ui_hc.js
// Result: 9 locations

// Fix all 9 in ONE commit
// Document: "Fixed 9 locations where Float32Array was stored by reference"

// THEN create verification tools
```

---

## How to Remember This

This rule is STORED in:
- **This file**: `.claude/rules/investigation-methodology.md`
- **CLAUDE.md**: Added to critical rules section
- **Commit message**: Every pattern-fix should reference this rule

Every time I investigate a pattern-based bug, I should:
1. Read this file
2. Do systematic full search
3. Fix all at once
4. Reference this rule in commit message

If I skip this → user will remind me → shame on me
