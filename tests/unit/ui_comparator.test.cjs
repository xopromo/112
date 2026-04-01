'use strict';
/**
 * tests/unit/ui_comparator.test.cjs
 * Тесты parseTextToSettings() — функция применяет настройки из текстового
 * источника (три режима: comparator JSON, CFG JSON блок, legacy строки).
 * Цель: регрессионная защита при перемещении в ui_comparator.js
 *
 * Запуск: node --test tests/unit/ui_comparator.test.cjs
 */
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { createUICtx } = require('../harness.cjs');

let ctx;
before(() => { ctx = createUICtx([]); });

// ─────────────────────────────────────────────────────────────────────────────
describe('parseTextToSettings() — режим -1 (Comparator JSON)', () => {
  it('базовый comparator JSON → список изменений', () => {
    const json = JSON.stringify({
      apply: { e_atrp: 14, e_pvl: 5, s_atr: true },
      hints: [],
      meta: { symbol: 'BTCUSDT' },
    });
    const changes = ctx.parseTextToSettings(json);
    assert.ok(Array.isArray(changes) && changes.length > 0);
    const atrpChange = changes.find(c => c.id === 'e_atrp');
    assert.ok(atrpChange, 'не найден e_atrp');
    assert.equal(atrpChange.value, '14');
    assert.equal(atrpChange.type, 'val');
  });

  it('булевые значения → type=chk', () => {
    const json = JSON.stringify({ apply: { s_atr: true, s_pct: false }, hints: [] });
    const changes = ctx.parseTextToSettings(json);
    const atr = changes.find(c => c.id === 's_atr');
    assert.ok(atr, 'не найден s_atr');
    assert.equal(atr.type, 'chk');
    assert.equal(atr.value, true);
  });

  it('пустой apply → fallback (не режим -1)', () => {
    // apply пустой → ch.length === 0 → должен пройти в следующий режим
    const json = JSON.stringify({ apply: {}, hints: [] });
    // parseTextToSettings возвращает null или массив из другого режима
    // важно что не крашится
    assert.doesNotThrow(() => ctx.parseTextToSettings(json));
  });

  it('не JSON строка → fallback без краша', () => {
    assert.doesNotThrow(() => ctx.parseTextToSettings('не JSON вообще'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('parseTextToSettings() — режим 0 (CFG JSON блок)', () => {
  it('CFG JSON блок с ATR параметрами', () => {
    const cfgJson = JSON.stringify({
      atrPeriod: 21,
      slPair: { a: { type: 'atr', m: 1.5 } },
      tpPair: { a: { type: 'rr',  m: 2.5 } },
    });
    const text = `--- CFG JSON ---\n${cfgJson}\n--- /CFG JSON ---`;
    const changes = ctx.parseTextToSettings(text);
    assert.ok(Array.isArray(changes) && changes.length > 0, 'нет изменений');
    // Должен найти SL ATR включённым
    const slAtr = changes.find(c => c.id === 's_atr');
    assert.ok(slAtr, 'не найден s_atr');
    assert.equal(slAtr.value, true);
  });

  it('CFG JSON с TP RR', () => {
    const cfgJson = JSON.stringify({
      tpPair: { a: { type: 'rr', m: 3.0 } },
    });
    const text = `--- CFG JSON ---\n${cfgJson}\n--- /CFG JSON ---`;
    const changes = ctx.parseTextToSettings(text);
    const rrChk = changes.find(c => c.id === 't_rr');
    assert.ok(rrChk, 'не найден t_rr');
    assert.equal(rrChk.value, true);
    const rrVal = changes.find(c => c.id === 't_rrv');
    assert.ok(rrVal, 'не найден t_rrv');
    assert.equal(rrVal.value, '3');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('parseTextToSettings() — граничные случаи', () => {
  it('полностью пустая строка', () => {
    // Не должно крашиться, возвращает null или пустой массив
    const r = ctx.parseTextToSettings('');
    assert.ok(r === null || (Array.isArray(r) && r.length === 0));
  });

  it('невалидный CFG JSON блок → не крашится', () => {
    const text = '--- CFG JSON ---\nне JSON!!!\n--- /CFG JSON ---';
    assert.doesNotThrow(() => ctx.parseTextToSettings(text));
  });
});
