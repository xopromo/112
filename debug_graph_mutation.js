/**
 * DEBUG: Find where old_eq and new_eq are being added to regular results
 * This explains why graphs change after OOS calculation
 */

// Monkey-patch to detect mutations
const resultsProxy = new Proxy([], {
  set(target, prop, value) {
    if (typeof prop === 'string' && !isNaN(prop)) {
      const item = value;
      if (item && item.cfg && typeof item.cfg === 'object') {
        // Log when OOS-specific fields are added
        if (item.old_eq !== undefined || item.new_eq !== undefined) {
          console.warn(`⚠️ OOS fields detected on result: ${item.name}`);
          console.warn(`   old_eq: ${item.old_eq ? 'yes' : 'no'}`);
          console.warn(`   new_eq: ${item.new_eq ? 'yes' : 'no'}`);
          console.trace('Added at:');
        }
      }
    }
    return Reflect.set(target, prop, value);
  }
});

// After results array is created, replace with proxy
window.results = resultsProxy;

/**
 * CHECK 1: Are old_eq/new_eq being added to HC results?
 * Location: ui_hc.js line ~1443
 */
console.log('CHECK 1: HC Results Mutation');
console.log('-'.repeat(60));
console.log('Looking for: x.r.eq = _oosData.eq assignment that might');
console.log('cause old_eq/new_eq fields to appear on HC results');

/**
 * CHECK 2: Are results being reused/shared between tables?
 * Problem: If a result is in both results[] and _oosTableResults[],
 * modifying one affects the other
 */
console.log('\nCHECK 2: Results Sharing Between Tables');
console.log('-'.repeat(60));
console.log('Checking if same result object appears in multiple places:');
console.log('- results[i]');
console.log('- _visibleResults[j]');
console.log('- _hcTableResults[k]');
console.log('- _oosTableResults[m]');

/**
 * CHECK 3: Object.assign copying unwanted fields
 * Location: ui_hc.js line ~1449
 * const r = Object.assign({}, raw, { ... });
 * If raw has old_eq from OOS, it gets copied!
 */
console.log('\nCHECK 3: Object.assign Field Copying');
console.log('-'.repeat(60));
console.log('Problem: Object.assign({}, raw, {...})');
console.log('If raw has old_eq/new_eq from previous operation,');
console.log('they get copied to new object r and then r is drawn!');

/**
 * ANALYSIS
 */
console.log('\n' + '='.repeat(60));
console.log('ROOT CAUSE ANALYSIS');
console.log('='.repeat(60));

console.log(`
The graph redraw issue happens because:

1. Result object r from results[] has old_eq/new_eq added (incorrectly)
2. When drawEquityForResult(r) is called, it checks:
   if (r.old_eq && r.new_eq) → shows OOS graph
3. But the SAME result object is rendered multiple times with
   different eq values, causing the visual jump

TRACE:
1. HC creates neighbor → adds eq via _oosData.eq assignment
2. HC result r created with Object.assign copies that eq
3. If r happens to have old_eq/new_eq from previous OOS...
4. ...drawEquityForResult shows OOS graph for regular result!

FIX NEEDED:
- Ensure old_eq/new_eq are ONLY on actual OOS results
- NEVER add them to regular results or HC neighbors
- Use separate fields for different result types
- Don't let Object.assign copy unwanted fields
`);

console.log('\nPATCH SUGGESTION:');
console.log('-'.repeat(60));
console.log(`
// In drawEquityForResult - be more strict:
function drawEquityForResult(r) {
  if (!r) return;

  // Only show OOS graph if this is EXPLICITLY an OOS result
  // Check result type/source, not just field presence
  const isOOSResult = r._source === 'oos' ||
                      (r.old_eq && r.new_eq && r._oos);

  if (isOOSResult) {
    _drawOOSGraphicForResult(r);
    return;
  }

  // Regular result - don't check for old_eq/new_eq
  // They might exist from accidental copies
}

// In HC result creation - don't pollute the result:
const r = Object.assign({}, raw);  // Don't include _oos data!
r.name = ...;
r.cfg = x.cfg;
// r should NOT have old_eq/new_eq
`);
