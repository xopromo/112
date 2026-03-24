// ============================================================
// sl_tp_registry.js — реестры типов стоп-лосса и тейк-профита
// ============================================================
//
// SL_REGISTRY: массив типов стоп-лосса.
//   flag: поле в cfg, которое включает этот тип SL
//   calc(cfg, entry, dir, ac, i): вычислить уровень SL (NaN если не применимо)
//
// TP_REGISTRY: массив режимов расчёта тейк-профита.
//   mode: строка ('rr', 'atr', 'pct') — значение cfg.tpMode / cfg.tpModeB
//   calc(entry, dir, slDist, ac, mult): вычислить уровень TP
//
// Использование в core.js:
//   SL: const slCandidates = SL_REGISTRY.filter(s => cfg[s.flag]).map(s => s.calc(...)).filter(v => !isNaN(v));
//   TP: const tpA = _calcTP(entry, dir, slDist, ac, cfg.tpMode, cfg.tpMult);
//
// ДОБАВИТЬ НОВЫЙ ТИП SL: добавить объект в SL_REGISTRY + UI + buildBtCfg.
// ДОБАВИТЬ НОВЫЙ РЕЖИМ TP: добавить объект в TP_REGISTRY + UI + buildBtCfg.
// ============================================================

const SL_REGISTRY = [
  // ── ATR-based SL ─────────────────────────────────────────
  {
    id:   'atr',
    flag: 'hasSLA',
    calc: (cfg, entry, dir, ac, i) => entry - dir * ac * cfg.slMult,
  },

  // ── Percent-based SL ─────────────────────────────────────
  {
    id:   'pct',
    flag: 'hasSLB',
    calc: (cfg, entry, dir, ac, i) => entry * (1 - dir * cfg.slPctMult / 100),
  },

  // ── Pivot-based SL ───────────────────────────────────────
  {
    id:   'pivot',
    flag: 'useSLPiv',
    calc: (cfg, entry, dir, ac, i) => {
      if (!cfg.pivSLLo || !cfg.pivSLHi) return NaN;
      const pivLevel = dir === 1 ? cfg.pivSLLo[i] : cfg.pivSLHi[i];
      if (isNaN(pivLevel)) return NaN;
      // Проверка свежести: как Pine (bar_index - last_pv_lo_bar) <= 30
      if (cfg.pivSLLoAge && cfg.pivSLHiAge) {
        const pivBar = dir === 1 ? cfg.pivSLLoAge[i] : cfg.pivSLHiAge[i];
        if (pivBar < 0 || (i - pivBar) > 30) return NaN;
      }
      const rawSL = dir === 1
        ? pivLevel - ac * cfg.slPivOff
        : pivLevel + ac * cfg.slPivOff;
      const dist = Math.abs(entry - rawSL);
      const sl = dist > ac * cfg.slPivMax ? entry - dir * ac * cfg.slPivMax : rawSL;
      if ((dir === 1 && sl >= entry) || (dir === -1 && sl <= entry)) return NaN;
      return sl;
    },
  },
];

// ─────────────────────────────────────────────────────────────
// TP_REGISTRY: режимы расчёта тейк-профита
// ─────────────────────────────────────────────────────────────
const TP_REGISTRY = [
  // ── Risk/Reward ratio ─────────────────────────────────────
  {
    mode: 'rr',
    calc: (entry, dir, slDist, ac, mult) => entry + dir * slDist * mult,
  },

  // ── ATR multiplier ────────────────────────────────────────
  {
    mode: 'atr',
    calc: (entry, dir, slDist, ac, mult) => entry + dir * ac * mult,
  },

  // ── Percent from entry ────────────────────────────────────
  {
    mode: 'pct',
    calc: (entry, dir, slDist, ac, mult) => entry * (1 + dir * mult / 100),
  },
];

// Хелпер: вычислить TP по режиму и множителю
function _calcTP(entry, dir, slDist, ac, mode, mult) {
  const t = TP_REGISTRY.find(t => t.mode === mode);
  return t ? t.calc(entry, dir, slDist, ac, mult) : NaN;
}
