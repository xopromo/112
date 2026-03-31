'use strict';
/**
 * tests/unit/pine_export.test.cjs
 * Регрессионные тесты генератора Pine Script v6.
 * Проверяем что generatePineScript() и generatePineStrategy() не ломаются
 * и продолжают генерировать валидный код при рефакторинге.
 *
 * Запуск: node --test tests/unit/pine_export.test.cjs
 */
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { createPineCtx } = require('../harness.cjs');

let ctx;
before(() => {
  ctx = createPineCtx([]);
});

// ─────────────────────────────────────────────────────────────
// Минимальный объект результата (r) для generatePineScript
// ─────────────────────────────────────────────────────────────
function makePivotResult(overrides = {}) {
  return Object.assign({
    // Поля результата backtest (нужны для заголовка Pine-кода)
    name:  'Pv(L5R2) ATR1.5 RR2.0',
    pnl:   15.3,
    wr:    62.5,
    n:     45,
    dd:    8.2,
    cfg: {
      // Базовые настройки
      comm:      0.05,
      atrPeriod: 14,
      baseComm:  0.05,
      spreadVal: 0,

      // Pivot вход
      usePivot:  true,
      pvL:       5,
      pvR:       2,

      // Все прочие входы — выключены
      useEngulf: false, usePinBar: false, useBollinger: false, useDonchian: false,
      useATRBO: false, useMATouch: false, useSqueeze: false, useSupertrend: false,
      useMACD: false, useKalman: false, useMACross: false, useVolMove: false,
      useInsideBar: false, useNRev: false, useEIS: false, useSoldiers: false,

      // Фильтры — выключены
      useMA: false, useADX: false, useAtrExp: false, useRSI: false, useVolF: false,
      useStruct: false, useMaDist: false, useCandleF: false, useConsec: false,
      useSTrend: false, useConfirm: false, useFresh: false, useVSA: false,
      useLiq: false, useVolDir: false, useWT: false, useMacdFilter: false,
      useER: false, useKalmanMA: false, useSqzMod: false, useFat: false,

      // SL/TP
      hasSLA: true, slMult: 1.5,
      hasSLB: false,
      hasTPA: true, tpMode: 'rr', tpMult: 2.0,
      hasTPB: false,
      slLogic: 'or', tpLogic: 'or',

      // Дополнительные выходы
      useTrail: false, useWickTrail: false, useBE: false, usePartial: false, useRev: false,
      useAdaptiveSL: false, useAdaptiveTP: false, useDynSLStruct: false, useSLPiv: false,
      waitBars: 0, waitRetrace: false,

      // Пары SL/TP для Pine генератора
      slPair: { a: { type: 'atr', m: 1.5 }, p: null, combo: false },
      tpPair: { a: { type: 'rr',  m: 2.0 }, b: null, combo: false },

      // MA настройки (нужны для Pine)
      maType: 'EMA', maP: 50,
      htfRatio: 1,
    },
  }, overrides);
}

// ─────────────────────────────────────────────────────────────
describe('generatePineScript() — базовая валидация', () => {
  it('возвращает строку (не null/undefined)', () => {
    const r = makePivotResult();
    const code = ctx.generatePineScript(r);
    assert.ok(typeof code === 'string', `Ожидалась строка, получили: ${typeof code}`);
    assert.ok(code.length > 100, `Код слишком короткий: ${code.length} символов`);
  });

  it('возвращает заглушку если r=null', () => {
    const code = ctx.generatePineScript(null);
    assert.ok(typeof code === 'string', 'Должна вернуться строка-заглушка');
    assert.ok(code.includes('//'), 'Заглушка должна содержать комментарий');
  });

  it('возвращает заглушку если r без cfg', () => {
    const code = ctx.generatePineScript({});
    assert.ok(typeof code === 'string', 'Должна вернуться строка');
  });
});

// ─────────────────────────────────────────────────────────────
describe('generatePineScript() — структура кода Pine v6', () => {
  let code;
  before(() => {
    code = ctx.generatePineScript(makePivotResult());
  });

  it('начинается с //@version=6', () => {
    assert.ok(code.startsWith('//@version=6'),
      `Код должен начинаться с //@version=6, начало: "${code.slice(0, 30)}"`);
  });

  it('содержит indicator() или strategy() вызов', () => {
    assert.ok(code.includes('indicator(') || code.includes('strategy('),
      'Код должен содержать indicator() или strategy()');
  });

  it('содержит объявление ATR (ta.rma или ta.tr)', () => {
    assert.ok(code.includes('ta.') || code.includes('atr'),
      'Код должен содержать TA-функции (ta.xxx или atr)');
  });

  it('содержит ta.pivotlow или pivot_', () => {
    // Pivot-вход должен генерировать ta.pivotlow/pivothigh или pivot_
    assert.ok(
      code.includes('ta.pivotlow') || code.includes('ta.pivothigh') || code.includes('pivot_'),
      `Pivot-вход должен генерировать pivot-переменные в коде`
    );
  });

  it('содержит SL/TP переменные', () => {
    // Должны быть sl_ и tp_ переменные или stop_loss / take_profit
    assert.ok(
      code.includes('sl_') || code.includes('stop_loss') || code.includes('slDist'),
      'Код должен содержать SL переменные'
    );
  });

  it('не содержит синтаксических маркеров заглушки', () => {
    // Убеждаемся что нет незакрытых TODO или заглушек
    assert.ok(!code.includes('TODO'), 'Код не должен содержать TODO');
    assert.ok(!code.includes('FIXME'), 'Код не должен содержать FIXME');
  });
});

// ─────────────────────────────────────────────────────────────
describe('generatePineScript() — влияние параметров cfg на вывод', () => {
  it('изменение pvL/pvR отражается в коде', () => {
    const r1 = makePivotResult();
    r1.cfg.pvL = 3; r1.cfg.pvR = 1;
    const code1 = ctx.generatePineScript(r1);

    const r2 = makePivotResult();
    r2.cfg.pvL = 8; r2.cfg.pvR = 3;
    const code2 = ctx.generatePineScript(r2);

    // Разные параметры → разный код
    assert.notStrictEqual(code1, code2,
      'Разные pvL/pvR должны давать разный Pine код');
  });

  it('включение useMA добавляет MA-условие в код', () => {
    const rNoMA = makePivotResult();
    rNoMA.cfg.useMA = false;
    const codeNoMA = ctx.generatePineScript(rNoMA);

    const rWithMA = makePivotResult();
    rWithMA.cfg.useMA = true;
    rWithMA.cfg.maType = 'EMA';
    rWithMA.cfg.maP = 50;
    const codeWithMA = ctx.generatePineScript(rWithMA);

    // С включённым MA код должен быть другим
    assert.notStrictEqual(codeNoMA, codeWithMA,
      'useMA=true должен изменить код');
  });

  it('изменение slMult отражается в коде', () => {
    const r1 = makePivotResult();
    r1.cfg.slMult = 1.5;
    r1.cfg.slPair = { a: { type: 'atr', m: 1.5 }, p: null, combo: false };
    const code1 = ctx.generatePineScript(r1);

    const r2 = makePivotResult();
    r2.cfg.slMult = 3.0;
    r2.cfg.slPair = { a: { type: 'atr', m: 3.0 }, p: null, combo: false };
    const code2 = ctx.generatePineScript(r2);

    assert.notStrictEqual(code1, code2,
      'Разный slMult должен давать разный Pine код');
    // Числа должны присутствовать в коде
    assert.ok(code1.includes('1.5') || code1.includes('1.50'),
      'slMult=1.5 должен присутствовать в коде');
    assert.ok(code2.includes('3.0') || code2.includes('3.00'),
      'slMult=3.0 должен присутствовать в коде');
  });
});

// ─────────────────────────────────────────────────────────────
describe('generatePineScript() — режим strategy', () => {
  it('mode="strategy" генерирует strategy() вместо indicator()', () => {
    const r = makePivotResult();
    const code = ctx.generatePineScript(r, 'strategy');
    assert.ok(typeof code === 'string' && code.length > 100,
      'Режим strategy должен вернуть непустую строку');
    // Либо strategy() прямо, либо generatePineStrategy вызывается внутри
    assert.ok(
      code.includes('strategy(') || code.includes('strategy.entry') || code.includes('strategy.exit'),
      'Режим strategy должен содержать strategy.* вызовы'
    );
  });
});

// ─────────────────────────────────────────────────────────────
describe('generatePineScript() — детерминизм', () => {
  it('два вызова с одинаковым cfg дают идентичный код', () => {
    const r = makePivotResult();
    const code1 = ctx.generatePineScript(r);
    const code2 = ctx.generatePineScript(r);
    assert.strictEqual(code1, code2,
      'generatePineScript должен быть детерминированным');
  });
});

// ─────────────────────────────────────────────────────────────
describe('fixPineScript()', () => {
  it('функция существует в контексте', () => {
    assert.ok(typeof ctx.fixPineScript === 'function',
      'fixPineScript должна быть доступна');
  });

  it('возвращает строку на валидном входе', () => {
    const code = '//@version=6\nindicator("Test")\nplot(close)';
    const fixed = ctx.fixPineScript(code);
    assert.ok(typeof fixed === 'string', 'fixPineScript должна вернуть строку');
  });

  it('не ломает уже корректный Pine v6 код', () => {
    const code = ctx.generatePineScript(makePivotResult());
    const fixed = ctx.fixPineScript(code);
    // После fix код не должен потерять версию
    assert.ok(fixed.includes('@version'), 'fixPineScript не должна удалять версию');
  });
});
