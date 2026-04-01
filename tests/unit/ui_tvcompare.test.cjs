'use strict';
/**
 * tests/unit/ui_tvcompare.test.cjs
 * Unit-тесты функций из ui_tvcompare.js:
 *   - _normTime()   — нормализация временных меток в "YYYY-MM-DD HH:MM"
 *   - _parseTVcsv() — парсинг CSV/TSV экспорта из TradingView Table Mode
 *
 * Запуск: node --test tests/unit/ui_tvcompare.test.cjs
 */
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { createUICtx } = require('../harness.cjs');

let ctx;
before(() => { ctx = createUICtx([]); });

// ─────────────────────────────────────────────────────────────────────────────
describe('_normTime() — пустые/null значения', () => {
  it('null → ""', () => assert.equal(ctx._normTime(null), ''));
  it('undefined → ""', () => assert.equal(ctx._normTime(undefined), ''));
  it('пустая строка → ""', () => assert.equal(ctx._normTime(''), ''));
  // 0 специально НЕ фильтруется (t !== 0 в условии), возвращает строку '0'
  it('0 как число — не фильтруется', () => assert.notEqual(ctx._normTime(0), undefined));
});

describe('_normTime() — Unix timestamp секунды (9–10 цифр)', () => {
  // 2024-01-15 10:30 UTC → 1705314600
  it('10-значный timestamp', () => {
    const r = ctx._normTime('1705314600');
    assert.equal(r.length, 16);
    assert.match(r, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it('9-значный timestamp', () => {
    // 2001-09-09 01:46:40 UTC = 1000000000
    const r = ctx._normTime('1000000000');
    assert.match(r, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it('timestamp как число (не строка)', () => {
    const r = ctx._normTime(1705314600);
    assert.match(r, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it('секунды и миллисекунды — разные результаты', () => {
    const rSec = ctx._normTime('1705314600');
    const rMs  = ctx._normTime('1705314600000');
    assert.equal(rSec, rMs); // оба должны дать одно время
  });
});

describe('_normTime() — Unix timestamp миллисекунды (13 цифр)', () => {
  it('13-значный timestamp', () => {
    const r = ctx._normTime('1705314600000');
    assert.match(r, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    assert.equal(r.length, 16);
  });
});

describe('_normTime() — ISO строки', () => {
  it('ISO с T и Z', () => {
    const r = ctx._normTime('2024-01-15T10:30:00Z');
    assert.equal(r, '2024-01-15 10:30');
  });

  it('ISO с T без Z', () => {
    const r = ctx._normTime('2024-01-15T10:30:00');
    assert.equal(r, '2024-01-15 10:30');
  });

  it('ISO с секундами — секунды отрезаются', () => {
    const r = ctx._normTime('2024-01-15T10:30:45');
    assert.equal(r, '2024-01-15 10:30');
  });

  it('ISO с миллисекундами — отрезаются', () => {
    const r = ctx._normTime('2024-01-15T10:30:45.123Z');
    assert.equal(r, '2024-01-15 10:30');
  });

  it('строка с UTC суффиксом', () => {
    const r = ctx._normTime('2024-01-15 10:30:00 UTC');
    assert.equal(r, '2024-01-15 10:30');
  });

  it('строка с GMT суффиксом', () => {
    const r = ctx._normTime('2024-01-15 10:30:00 GMT');
    assert.equal(r, '2024-01-15 10:30');
  });

  it('уже нормализованная строка "YYYY-MM-DD HH:MM"', () => {
    const r = ctx._normTime('2024-01-15 10:30');
    assert.equal(r, '2024-01-15 10:30');
  });

  it('результат всегда 16 символов', () => {
    const cases = [
      '2024-01-15T10:30:00Z',
      '2024-01-15 10:30:00 UTC',
      '1705314600',
      '1705314600000',
    ];
    for (const c of cases) {
      const r = ctx._normTime(c);
      assert.equal(r.length, 16, `длина != 16 для "${c}": "${r}"`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Хелпер: строит CSV из массива строк
function makeCsv(rows, sep = ',') {
  return rows.map(r => r.join(sep)).join('\n');
}

describe('_parseTVcsv() — некорректный ввод', () => {
  it('пустая строка → null', () => {
    assert.equal(ctx._parseTVcsv(''), null);
  });

  it('только заголовок, нет данных → null', () => {
    assert.equal(ctx._parseTVcsv('time,equity'), null);
  });

  it('нет колонки equity → null', () => {
    const csv = makeCsv([['time', 'open', 'close'], ['2024-01-01 10:00', '100', '101']]);
    assert.equal(ctx._parseTVcsv(csv), null);
  });

  it('данные без валидного времени → null', () => {
    const csv = makeCsv([['time', 'equity'], ['badtime', '1.5']]);
    assert.equal(ctx._parseTVcsv(csv), null);
  });

  it('одна строка данных (< 2) → null', () => {
    const csv = makeCsv([['time', 'equity'], ['2024-01-15 10:00', '1.5']]);
    assert.equal(ctx._parseTVcsv(csv), null);
  });
});

describe('_parseTVcsv() — базовый CSV', () => {
  const csv = makeCsv([
    ['time', 'equity'],
    ['2024-01-15 10:00', '1.5'],
    ['2024-01-15 11:00', '2.0'],
    ['2024-01-15 12:00', '1.8'],
  ]);

  it('возвращает массив строк', () => {
    const r = ctx._parseTVcsv(csv);
    assert.ok(Array.isArray(r));
  });

  it('правильное количество строк', () => {
    assert.equal(ctx._parseTVcsv(csv).length, 3);
  });

  it('поле t нормализовано', () => {
    const r = ctx._parseTVcsv(csv);
    assert.equal(r[0].t, '2024-01-15 10:00');
  });

  it('поле eq парсится как число', () => {
    const r = ctx._parseTVcsv(csv);
    assert.equal(r[0].eq, 1.5);
    assert.equal(r[2].eq, 1.8);
  });

  it('отсутствующие сигнал-колонки → null', () => {
    const r = ctx._parseTVcsv(csv);
    assert.equal(r[0].el, null);
    assert.equal(r[0].es, null);
    assert.equal(r[0].xl, null);
    assert.equal(r[0].xs, null);
  });

  it('ma и confMa → NaN если колонок нет', () => {
    const r = ctx._parseTVcsv(csv);
    assert.ok(isNaN(r[0].ma));
    assert.ok(isNaN(r[0].confMa));
  });
});

describe('_parseTVcsv() — TSV (разделитель таб)', () => {
  const tsv = makeCsv([
    ['Time', 'Equity %', 'EL', 'ES'],
    ['2024-01-15 10:00', '1.5', '1', '0'],
    ['2024-01-15 11:00', '2.0', '0', '1'],
  ], '\t');

  it('TSV парсится корректно', () => {
    const r = ctx._parseTVcsv(tsv);
    assert.ok(r !== null);
    assert.equal(r.length, 2);
  });

  it('equity из TSV', () => {
    const r = ctx._parseTVcsv(tsv);
    assert.equal(r[0].eq, 1.5);
  });
});

describe('_parseTVcsv() — колонки сигналов (el, es, xl, xs)', () => {
  const csv = makeCsv([
    ['time', 'equity', 'el', 'es', 'xl', 'xs'],
    ['2024-01-15 10:00', '1.5', '1', '0', '0', '0'],
    ['2024-01-15 11:00', '2.0', '0', '1', '1', '0'],
  ]);

  it('el парсится', () => {
    const r = ctx._parseTVcsv(csv);
    assert.equal(r[0].el, 1);
    assert.equal(r[1].el, 0);
  });

  it('es парсится', () => {
    const r = ctx._parseTVcsv(csv);
    assert.equal(r[0].es, 0);
    assert.equal(r[1].es, 1);
  });

  it('xl парсится', () => {
    const r = ctx._parseTVcsv(csv);
    assert.equal(r[0].xl, 0);
    assert.equal(r[1].xl, 1);
  });

  it('xs парсится', () => {
    const r = ctx._parseTVcsv(csv);
    assert.equal(r[0].xs, 0);
  });
});

describe('_parseTVcsv() — заголовки с кавычками и регистр', () => {
  it('заголовки с кавычками ("Time","Equity %")', () => {
    const csv = '"Time","Equity %"\n"2024-01-15 10:00","1.5"\n"2024-01-15 11:00","2.0"';
    const r = ctx._parseTVcsv(csv);
    assert.ok(r !== null);
    assert.equal(r[0].eq, 1.5);
  });

  it('заголовок "date" тоже считается временем', () => {
    const csv = makeCsv([
      ['date', 'equity'],
      ['2024-01-15 10:00', '1.5'],
      ['2024-01-15 11:00', '2.0'],
    ]);
    const r = ctx._parseTVcsv(csv);
    assert.ok(r !== null);
  });
});

describe('_parseTVcsv() — Unix timestamps в данных', () => {
  it('секундный timestamp в колонке time', () => {
    const csv = makeCsv([
      ['time', 'equity'],
      ['1705314600', '1.5'],
      ['1705318200', '2.0'],
    ]);
    const r = ctx._parseTVcsv(csv);
    assert.ok(r !== null);
    assert.match(r[0].t, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });
});

describe('_parseTVcsv() — строки с невалидными данными пропускаются', () => {
  it('строки с NaN equity пропускаются', () => {
    const csv = makeCsv([
      ['time', 'equity'],
      ['2024-01-15 10:00', '1.5'],
      ['2024-01-15 11:00', 'n/a'],  // плохое значение
      ['2024-01-15 12:00', '2.0'],
    ]);
    const r = ctx._parseTVcsv(csv);
    assert.equal(r.length, 2); // средняя строка пропущена
  });
});
