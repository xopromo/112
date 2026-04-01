'use strict';
/**
 * tests/unit/ui_parse.test.cjs
 * Unit-тесты parseTextToSettings() из ui_parse.js.
 *
 * Функция работает в 4 режимах:
 *   -1  Comparator JSON {apply:{...}, hints:[...]}
 *    0  CFG JSON блок --- CFG JSON ---...--- /CFG JSON ---
 *    1  buildCopyText формат (содержит --- ПАТТЕРНЫ ВХОДА ---)
 *    2  Свободный текст (regex-парсинг)
 *
 * Запуск: node --test tests/unit/ui_parse.test.cjs
 */
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { createUICtx } = require('../harness.cjs');

let ctx;
before(() => { ctx = createUICtx([]); });

// ─────────────────────────────────────────────────────────────────────────────
// Хелпер: найти изменение по id
// ─────────────────────────────────────────────────────────────────────────────
function find(changes, id) {
  return changes.find(c => c.id === id);
}
function findVal(changes, id) {
  const c = find(changes, id);
  return c ? c.value : undefined;
}
function parse(text) {
  return ctx.parseTextToSettings(text);
}

// ─────────────────────────────────────────────────────────────────────────────
describe('parseTextToSettings() — режим -1: Comparator JSON {apply:{...}}', () => {
  it('базовый apply-объект', () => {
    const json = JSON.stringify({ apply: { 'e_pv': true, 'e_pvl': 5 } });
    const ch = parse(json);
    assert.ok(ch.length >= 2);
  });

  it('boolean → type=chk', () => {
    const json = JSON.stringify({ apply: { 'e_pv': true } });
    const ch = parse(json);
    const c = find(ch, 'e_pv');
    assert.ok(c, 'нет изменения e_pv');
    assert.equal(c.type, 'chk');
    assert.equal(c.value, true);
  });

  it('число → type=val, value=строка', () => {
    const json = JSON.stringify({ apply: { 'e_pvl': 5 } });
    const ch = parse(json);
    const c = find(ch, 'e_pvl');
    assert.ok(c);
    assert.equal(c.type, 'val');
    assert.equal(c.value, '5');
  });

  it('строка → type=val', () => {
    const json = JSON.stringify({ apply: { 'f_mat': 'EMA' } });
    const ch = parse(json);
    const c = find(ch, 'f_mat');
    assert.ok(c);
    assert.equal(c.value, 'EMA');
  });

  it('пустой apply → НЕ возвращает Comparator результат', () => {
    const json = JSON.stringify({ apply: {} });
    // ch.length === 0 → падает в fallthrough, парсится как JSON-строка без ключевых блоков
    const ch = parse(json);
    assert.equal(ch.length, 0);
  });

  it('JSON без apply → не режим -1', () => {
    const json = JSON.stringify({ someOtherKey: 123 });
    const ch = parse(json);
    // не падает, возвращает []
    assert.ok(Array.isArray(ch));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('parseTextToSettings() — режим 0: CFG JSON блок', () => {
  function makeCfgBlock(obj) {
    return `--- CFG JSON ---\n${JSON.stringify(obj)}\n--- /CFG JSON ---`;
  }

  it('commission → c_comm', () => {
    const ch = parse(makeCfgBlock({ commission: 0.04, baseComm: 0.04 }));
    const c = find(ch, 'c_comm');
    assert.ok(c, 'нет c_comm');
    assert.equal(c.value, '0.04');
  });

  it('baseComm имеет приоритет над commission', () => {
    const ch = parse(makeCfgBlock({ commission: 0.08, baseComm: 0.04 }));
    const c = find(ch, 'c_comm');
    assert.equal(c.value, '0.04');
  });

  it('slPair.a (ATR) → hasSLA + slMult', () => {
    const ch = parse(makeCfgBlock({ slPair: { a: { type: 'atr', m: 2.5 } } }));
    const sAtr = find(ch, 's_atr');
    const sAtrV = find(ch, 's_atrv');
    assert.ok(sAtr);
    assert.equal(sAtr.value, true);
    assert.ok(sAtrV);
    assert.equal(sAtrV.value, '2.5');
  });

  it('slPair без a → s_atr=false', () => {
    const ch = parse(makeCfgBlock({ slPair: {} }));
    const sAtr = find(ch, 's_atr');
    assert.ok(sAtr);
    assert.equal(sAtr.value, false);
  });

  it('tpPair.a (rr) → t_rr=true + t_rrv', () => {
    const ch = parse(makeCfgBlock({ tpPair: { a: { type: 'rr', m: 3.0 } } }));
    const tRR = find(ch, 't_rr');
    assert.ok(tRR);
    assert.equal(tRR.value, true);
    const tRRv = find(ch, 't_rrv');
    assert.equal(tRRv.value, '3');
  });

  it('tpPair.a (atr) → t_atr=true', () => {
    const ch = parse(makeCfgBlock({ tpPair: { a: { type: 'atr', m: 2.0 } } }));
    assert.equal(find(ch, 't_atr').value, true);
  });

  it('slLogic → _slLogic', () => {
    const ch = parse(makeCfgBlock({ slLogic: 'and' }));
    const lg = find(ch, '_slLogic');
    assert.ok(lg);
    assert.equal(lg.value, 'and');
    assert.equal(lg.type, 'logic');
  });

  it('tpLogic → _tpLogic', () => {
    const ch = parse(makeCfgBlock({ tpLogic: 'or' }));
    const lg = find(ch, '_tpLogic');
    assert.ok(lg);
    assert.equal(lg.value, 'or');
  });

  it('revMode → _xm_rev', () => {
    const ch = parse(makeCfgBlock({ revMode: 'candle' }));
    const xm = find(ch, '_xm_rev');
    assert.ok(xm);
    assert.equal(xm.value, 'candle');
    assert.equal(xm.type, 'xmode');
  });

  it('spreadVal → c_spread', () => {
    const ch = parse(makeCfgBlock({ spreadVal: 0.5 }));
    const sp = find(ch, 'c_spread');
    assert.ok(sp);
    assert.equal(sp.value, '0.5');
  });

  it('CFG_HTML_MAP поля маппятся (usePivot → e_pv)', () => {
    const ch = parse(makeCfgBlock({ usePivot: true }));
    const c = find(ch, 'e_pv');
    assert.ok(c, 'нет e_pv из CFG_HTML_MAP');
    assert.equal(c.value, true);
  });

  it('CFG_HTML_MAP val-поле (pvL → e_pvl)', () => {
    const ch = parse(makeCfgBlock({ pvL: 7 }));
    const c = find(ch, 'e_pvl');
    assert.ok(c);
    assert.equal(c.value, '7');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('parseTextToSettings() — режим 1: buildCopyText формат', () => {
  // Минимальный текст в формате buildCopyText
  function copyFmt(sections) {
    return `--- ПАТТЕРНЫ ВХОДА ---\n${sections.join('\n')}`;
  }

  it('Pivot ВКЛ с Left/Right', () => {
    const text = copyFmt(['Pivot Points: ВКЛ (Left=5, Right=3)']);
    const ch = parse(text);
    const pv = find(ch, 'e_pv');
    assert.ok(pv);
    assert.equal(pv.value, true);
    assert.equal(findVal(ch, 'e_pvl'), '5');
    assert.equal(findVal(ch, 'e_pvr'), '3');
  });

  it('Pivot ВЫКЛ', () => {
    const text = copyFmt(['Pivot Points: ВЫКЛ']);
    const ch = parse(text);
    const pv = find(ch, 'e_pv');
    assert.equal(pv.value, false);
  });

  it('Поглощение ВКЛ', () => {
    const text = copyFmt(['Поглощение: ВКЛ']);
    const ch = parse(text);
    assert.equal(find(ch, 'e_eng').value, true);
  });

  it('SL ATR × 2', () => {
    const text = copyFmt([]) + '\n--- СТОП-ЛОСС / ТЕЙК-ПРОФИТ ---\nStop Loss: ATR × 2';
    const ch = parse(text);
    assert.equal(find(ch, 's_atr').value, true);
    assert.equal(findVal(ch, 's_atrv'), '2');
    assert.equal(find(ch, 's_pct').value, false);
  });

  it('SL 1.5% от цены', () => {
    const text = copyFmt([]) + '\n--- СТОП-ЛОСС / ТЕЙК-ПРОФИТ ---\nStop Loss: 1.5% от цены';
    const ch = parse(text);
    assert.equal(find(ch, 's_pct').value, true);
    assert.equal(findVal(ch, 's_pctv'), '1.5');
    assert.equal(find(ch, 's_atr').value, false);
  });

  it('SL комбо ATR и %', () => {
    const text = copyFmt([]) + '\n--- СТОП-ЛОСС / ТЕЙК-ПРОФИТ ---\nStop Loss: [ИЛИ ATR × 2.5 ИЛИ 1% от цены]';
    const ch = parse(text);
    assert.equal(find(ch, 's_atr').value, true);
    assert.equal(find(ch, 's_pct').value, true);
  });

  it('SL логика [И ...] → and', () => {
    const text = copyFmt([]) + '\n--- СТОП-ЛОСС / ТЕЙК-ПРОФИТ ---\nStop Loss: [И ATR × 2 И 1%]';
    const ch = parse(text);
    const lg = find(ch, '_slLogic');
    assert.ok(lg);
    assert.equal(lg.value, 'and');
  });

  it('TP R:R = 2.5', () => {
    const text = copyFmt([]) + '\n--- СТОП-ЛОСС / ТЕЙК-ПРОФИТ ---\nTake Profit: R:R = 2.5';
    const ch = parse(text);
    assert.equal(find(ch, 't_rr').value, true);
    assert.equal(findVal(ch, 't_rrv'), '2.5');
  });

  it('TP ATR × 3', () => {
    const text = copyFmt([]) + '\n--- СТОП-ЛОСС / ТЕЙК-ПРОФИТ ---\nTake Profit: ATR × 3';
    const ch = parse(text);
    assert.equal(find(ch, 't_atr').value, true);
    assert.equal(findVal(ch, 't_atrv'), '3');
    assert.equal(find(ch, 't_rr').value, false);
  });

  it('BE ВКЛ с триггером и оффсетом', () => {
    const text = copyFmt([]) + '\nБезубыток: ВКЛ (триггер=1.5, оффсет=0.2)';
    const ch = parse(text);
    assert.equal(find(ch, 'x_be').value, true);
    assert.equal(findVal(ch, 'x_bet'), '1.5');
    assert.equal(findVal(ch, 'x_beo'), '0.2');
  });

  it('MA фильтр ВКЛ с типом и периодом', () => {
    const text = copyFmt([]) + '\nMA фильтр: ВКЛ (EMA, период=50)';
    const ch = parse(text);
    assert.equal(find(ch, 'f_ma').value, true);
    assert.equal(findVal(ch, 'f_mat'), 'EMA');
    assert.equal(findVal(ch, 'f_map'), '50');
  });

  it('ADX ВКЛ с порогом', () => {
    const text = copyFmt([]) + '\nADX: ВКЛ (ADX > 25)';
    const ch = parse(text);
    assert.equal(find(ch, 'f_adx').value, true);
    assert.equal(findVal(ch, 'f_adxt'), '25');
  });

  it('RSI с OS/OB', () => {
    const text = copyFmt([]) + '\nRSI: ВКЛ (лонг<30, шорт>70)';
    const ch = parse(text);
    assert.equal(find(ch, 'f_rsi').value, true);
    assert.equal(findVal(ch, 'f_rsios'), '30');
    assert.equal(findVal(ch, 'f_rsiob'), '70');
  });

  it('ATR период', () => {
    const text = copyFmt([]) + '\nATR период: 14';
    const ch = parse(text);
    assert.equal(findVal(ch, 'c_atr'), '14');
  });

  it('Комиссия удваивается (per-leg → round-trip)', () => {
    const text = copyFmt([]) + '\nКомиссия: 0.05%';
    const ch = parse(text);
    const c = find(ch, 'c_comm');
    assert.ok(c);
    // 0.05 * 2 = 0.100
    assert.equal(parseFloat(c.value), 0.1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('parseTextToSettings() — режим 2: свободный текст', () => {
  it('ATR = 14', () => {
    const ch = parse('atr = 14');
    assert.equal(findVal(ch, 'c_atr'), '14');
  });

  it('sl atr 2.5', () => {
    const ch = parse('sl atr 2.5');
    const sAtr = find(ch, 's_atr');
    assert.ok(sAtr);
    assert.equal(sAtr.value, true);
    assert.equal(findVal(ch, 's_atrv'), '2.5');
  });

  it('sl 1.5%', () => {
    const ch = parse('sl 1.5%');
    assert.equal(find(ch, 's_pct').value, true);
    assert.equal(findVal(ch, 's_pctv'), '1.5');
  });

  it('tp rr = 3', () => {
    const ch = parse('tp rr = 3');
    assert.equal(find(ch, 't_rr').value, true);
    assert.equal(findVal(ch, 't_rrv'), '3');
  });

  it('ema 20 → MA фильтр ВКЛ + тип EMA', () => {
    const ch = parse('ema 20');
    assert.equal(find(ch, 'f_ma').value, true);
    assert.equal(findVal(ch, 'f_map'), '20');
    assert.equal(findVal(ch, 'f_mat'), 'EMA');
  });

  it('sma 50 → тип SMA', () => {
    const ch = parse('sma 50');
    assert.equal(findVal(ch, 'f_mat'), 'SMA');
    assert.equal(findVal(ch, 'f_map'), '50');
  });

  it('adx > 25', () => {
    const ch = parse('adx > 25');
    assert.equal(find(ch, 'f_adx').value, true);
    assert.equal(findVal(ch, 'f_adxt'), '25');
  });

  it('pivot left=5 right=2', () => {
    const ch = parse('pivot left=5 right=2');
    assert.equal(find(ch, 'e_pv').value, true);
    assert.equal(findVal(ch, 'e_pvl'), '5');
    assert.equal(findVal(ch, 'e_pvr'), '2');
  });

  it('rsi < 30 → RSI ВКЛ, OS=30', () => {
    const ch = parse('rsi < 30');
    assert.equal(find(ch, 'f_rsi').value, true);
    assert.equal(findVal(ch, 'f_rsios'), '30');
  });

  it('пустая строка → пустой массив', () => {
    assert.equal(parse('').length, 0);
  });

  it('случайный текст без ключевых слов → пустой массив', () => {
    assert.equal(parse('hello world foo bar').length, 0);
  });

  it('несколько параметров в одном тексте', () => {
    const ch = parse('sl atr 2 tp r:r 3 ema 20');
    assert.equal(find(ch, 's_atr').value, true);
    assert.equal(find(ch, 't_rr').value, true);
    assert.equal(find(ch, 'f_ma').value, true);
  });
});
