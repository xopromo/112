// ============================================================
// entry_registry.js — реестр точек входа
// ============================================================
// ENTRY_REGISTRY: массив объектов, описывающих каждый тип входа.
// Единственный источник правды для:
//   • core.js   — detectL/detectS (вход), revDetectS/revDetectL (обратный сигнал)
//   • opt.js    — buildName (части названия результата)
//   • pine_export.js — pineLines (Pine Script inputs)
//
// ДОБАВИТЬ НОВЫЙ ВХОд: добавить 1 объект в ENTRY_REGISTRY + чекбокс в shell.html
// + индикатор в _calcIndicators + поля в buildBtCfg. core/buildName/pine — автоматически.
// ============================================================

const ENTRY_REGISTRY = [
  // ── Pivot Low / High ─────────────────────────────────────
  {
    id:        'pivot',
    flag:      'usePivot',
    htmlId:    'e_pv',
    shortName: c => `Pv(L${c.pvL||5}R${c.pvR||2})`,
    detectL:   (cfg, i) => cfg.pvLo && cfg.pvLo[i] === 1,
    detectS:   (cfg, i) => cfg.pvHi_ && cfg.pvHi_[i] === 1,
    // reverse: same timing as entry (pivot already "confirmed")
    pineLines: (c, b, f) => {
      const on = c.usePivot;
      return [
        `use_pivot    = input.bool(${b(on)},   "Pivot Points",       group=grp_entry)`,
        `pivot_left   = input.int(${on?c.pvL:5},  "Pivot — баров слева",  minval=1, maxval=20,  group=grp_entry)`,
        `pivot_right  = input.int(${on?c.pvR:2},  "Pivot — баров справа", minval=1, maxval=10,  group=grp_entry)`,
      ];
    },
  },

  // ── Engulfing ────────────────────────────────────────────
  {
    id:        'engulf',
    flag:      'useEngulf',
    htmlId:    'e_eng',
    shortName: () => 'Engulf',
    detectL: (cfg, i) => {
      if (i < 3) return false;
      const d = DATA, d2 = d[i-2], p = d[i-1];
      const bp = Math.abs(d2.c-d2.o), bc = Math.abs(p.c-p.o);
      return d2.c < d2.o && p.c > p.o && bc >= bp*0.7 && p.c >= d2.o;
    },
    detectS: (cfg, i) => {
      if (i < 3) return false;
      const d = DATA, d2 = d[i-2], p = d[i-1];
      const bp = Math.abs(d2.c-d2.o), bc = Math.abs(p.c-p.o);
      return d2.c > d2.o && p.c < p.o && bc >= bp*0.7 && p.c <= d2.o;
    },
    // Обратный сигнал: паттерн engulf на текущем баре (i-1 и i), не на prev
    revDetectS: (cfg, i) => {
      if (i < 1) return false;
      const p = DATA[i-1], bar = DATA[i];
      const bPrev = Math.abs(p.o-p.c), bCur = Math.abs(bar.o-bar.c);
      return p.c > p.o && bar.c < bar.o && bCur >= bPrev*0.7 && bar.c <= p.o && bar.o >= p.c;
    },
    revDetectL: (cfg, i) => {
      if (i < 1) return false;
      const p = DATA[i-1], bar = DATA[i];
      const bPrev = Math.abs(p.o-p.c), bCur = Math.abs(bar.o-bar.c);
      return p.c < p.o && bar.c > bar.o && bCur >= bPrev*0.7 && bar.c >= p.o && bar.o <= p.c;
    },
    pineLines: (c, b) => [
      `use_engulf   = input.bool(${b(c.useEngulf)}, "Engulfing",          group=grp_entry)`,
    ],
  },

  // ── Pin Bar ──────────────────────────────────────────────
  {
    id:        'pinbar',
    flag:      'usePinBar',
    htmlId:    'e_pin',
    shortName: c => `PinBar×${c.pinRatio||2}`,
    detectL: (cfg, i) => {
      if (i < 2) return false;
      const p = DATA[i-1];
      const body = Math.abs(p.c-p.o) || 0.0000001;
      const lw = Math.min(p.c,p.o)-p.l, uw = p.h-Math.max(p.c,p.o);
      return lw > body*cfg.pinRatio && uw < body;
    },
    detectS: (cfg, i) => {
      if (i < 2) return false;
      const p = DATA[i-1];
      const body = Math.abs(p.c-p.o) || 0.0000001;
      const lw = Math.min(p.c,p.o)-p.l, uw = p.h-Math.max(p.c,p.o);
      return uw > body*cfg.pinRatio && lw < body;
    },
    pineLines: (c, b, f) => [
      `use_pinbar   = input.bool(${b(c.usePinBar)}, "Pin Bar",            group=grp_entry)`,
      `pin_ratio    = input.float(${f(c.pinRatio||1.5,1)}, "Pin Bar тень/тело",  step=0.5, group=grp_entry)`,
    ],
  },

  // ── Bollinger Band Breakout ───────────────────────────────
  {
    id:        'boll',
    flag:      'useBoll',
    htmlId:    'e_bol',
    shortName: () => 'BBproboj',
    // Используем полосы [i-2] (без включения сигнального бара) — как Дончиан.
    // [i-1] было self-referential: экстремальный close[i-1] расширял свою же полосу → сигнал не срабатывал.
    detectL: (cfg, i) => cfg.bbB && i >= 2 && cfg.bbD[i-2] > 0 && DATA[i-1].c > cfg.bbB[i-2]+cfg.bbD[i-2],
    detectS: (cfg, i) => cfg.bbB && i >= 2 && cfg.bbD[i-2] > 0 && DATA[i-1].c < cfg.bbB[i-2]-cfg.bbD[i-2],
    pineLines: (c, b, f) => [
      `use_boll     = input.bool(${b(c.useBoll)},   "Пробой Боллинджера", group=grp_entry)`,
      `boll_len     = input.int(${Math.max(5, c.bbLen||20)}, "Боллинджер период",  minval=5, maxval=200, group=grp_entry)`,
      `boll_mult    = input.float(${f(c.bbMult||2.0,1)}, "Боллинджер σ",       step=0.1, group=grp_entry)`,
    ],
  },

  // ── Donchian Breakout ────────────────────────────────────
  {
    id:        'donch',
    flag:      'useDonch',
    htmlId:    'e_don',
    shortName: () => 'Donch',
    detectL: (cfg, i) => cfg.donH && DATA[i-1].h > cfg.donH[i],
    detectS: (cfg, i) => cfg.donL && DATA[i-1].l < cfg.donL[i],
    pineLines: (c, b, f) => [
      `use_donch    = input.bool(${b(c.useDonch)},  "Пробой Дончиана",    group=grp_entry)`,
      `donch_len    = input.int(${Math.max(5, c.donLen||20)}, "Дончиан период",     minval=5, maxval=200, group=grp_entry)`,
    ],
  },

  // ── ATR Channel Breakout ─────────────────────────────────
  {
    id:        'atrbo',
    flag:      'useAtrBo',
    htmlId:    'e_atrbo',
    shortName: c => `ATRbo×${c.atrBoMult||2}`,
    detectL: (cfg, i) => cfg.atrBoMA && cfg.atrBoATR[i-1] > 0 &&
      DATA[i-1].c > cfg.atrBoMA[i-1]+cfg.atrBoATR[i-1]*cfg.atrBoMult,
    detectS: (cfg, i) => cfg.atrBoMA && cfg.atrBoATR[i-1] > 0 &&
      DATA[i-1].c < cfg.atrBoMA[i-1]-cfg.atrBoATR[i-1]*cfg.atrBoMult,
    pineLines: (c, b, f) => [
      `use_atr_bo   = input.bool(${b(c.useAtrBo)},  "Пробой ATR-канала",  group=grp_entry)`,
      `atr_bo_len   = input.int(${Math.max(5, c.atrBoLen||14)}, "ATR-канал EMA",      minval=5, maxval=200, group=grp_entry)`,
      `atr_bo_mult  = input.float(${f(c.atrBoMult||2.0,1)}, "ATR-канал множитель", step=0.1, group=grp_entry)`,
    ],
  },

  // ── MA Touch ─────────────────────────────────────────────
  {
    id:        'matouch',
    flag:      'useMaTouch',
    htmlId:    'e_mat',
    shortName: c => `MAToch${c.matPeriod||20}`,
    detectL: (cfg, i) => {
      if (!cfg.matMA || i < 3) return false;
      const crossUp = DATA[i-1].c > cfg.matMA[i-1] && DATA[i-2].c <= cfg.matMA[i-2];
      const zone = cfg.matMA[i-1] * cfg.matZone / 100;
      return crossUp && DATA[i-1].l <= cfg.matMA[i-1] + zone;
    },
    detectS: (cfg, i) => {
      if (!cfg.matMA || i < 3) return false;
      const crossDn = DATA[i-1].c < cfg.matMA[i-1] && DATA[i-2].c >= cfg.matMA[i-2];
      const zone = cfg.matMA[i-1] * cfg.matZone / 100;
      return crossDn && DATA[i-1].h >= cfg.matMA[i-1] - zone;
    },
    pineLines: (c, b) => [
      `use_ma_touch  = input.bool(${b(c.useMaTouch)}, "Касание MA",                                                    group=grp_entry)`,
      `mat_type      = input.string("${c.matType||'EMA'}", "  Тип MA касания", options=["SMA","EMA","WMA","HMA","DEMA","TEMA","Kalman"], group=grp_entry)`,
      `mat_len       = input.int(${c.matPeriod||20}, "  Период MA касания", minval=1, maxval=500,                       group=grp_entry)`,
      `mat_zone_pct  = input.float(${+(c.matZone||0.2).toFixed(3)}, "  Зона %", step=0.05, minval=0,                   group=grp_entry)`,
    ],
  },

  // ── Squeeze (BB + Keltner) ───────────────────────────────
  {
    id:        'squeeze',
    flag:      'useSqueeze',
    htmlId:    'e_sqz',
    shortName: () => 'Squeeze',
    detectL: (cfg, i) => {
      if (!cfg.sqzOn) return false;
      const minBars = cfg.sqzMinBars || 1;
      return !cfg.sqzOn[i] && cfg.sqzCount[i-1] >= minBars && DATA[i].c > DATA[i].o;
    },
    detectS: (cfg, i) => {
      if (!cfg.sqzOn) return false;
      const minBars = cfg.sqzMinBars || 1;
      return !cfg.sqzOn[i] && cfg.sqzCount[i-1] >= minBars && DATA[i].c < DATA[i].o;
    },
    pineLines: (c, b, f) => [
      `use_squeeze   = input.bool(${b(c.useSqueeze)}, "Squeeze (BB+Keltner)", group=grp_entry)`,
      `sqz_bb_len    = input.int(${c.sqzBBLen||20}, "  Squeeze BB период", minval=5, maxval=200, group=grp_entry)`,
      `sqz_kc_mult   = input.float(${f(c.sqzKCMult||1.5,1)}, "  KC множитель", step=0.1, group=grp_entry)`,
      `sqz_min_bars  = input.int(${c.sqzMinBars||1}, "  Мин баров в сжатии", minval=1, maxval=20, group=grp_entry)`,
    ],
  },

  // ── Trendline Touch ──────────────────────────────────────
  {
    id:        'tltouch',
    flag:      'useTLTouch',
    htmlId:    'e_tl_touch',
    shortName: () => 'TLtch',
    detectL: (cfg, i) => !!(cfg.tfSigL && (cfg.tfSigL[i] & 1)),
    detectS: (cfg, i) => !!(cfg.tfSigS && (cfg.tfSigS[i] & 1)),
    pineLines: (c, b) => [
      `use_tl_touch = input.bool(${b(c.useTLTouch)}, "Касание TL (линия)", group=grp_entry)`,
    ],
  },

  // ── Trendline Breakout ───────────────────────────────────
  {
    id:        'tlbreak',
    flag:      'useTLBreak',
    htmlId:    'e_tl_break',
    shortName: () => 'TLbrk',
    detectL: (cfg, i) => !!(cfg.tfSigL && (cfg.tfSigL[i] & 2)),
    detectS: (cfg, i) => !!(cfg.tfSigS && (cfg.tfSigS[i] & 2)),
    pineLines: (c, b) => [
      `use_tl_break = input.bool(${b(c.useTLBreak)}, "Пробой TL (линия)",  group=grp_entry)`,
    ],
  },

  // ── Flag Pattern ─────────────────────────────────────────
  {
    id:        'flag',
    flag:      'useFlag',
    htmlId:    'e_flag',
    shortName: () => 'Flag',
    detectL: (cfg, i) => !!(cfg.tfSigL && (cfg.tfSigL[i] & 4)),
    detectS: (cfg, i) => !!(cfg.tfSigS && (cfg.tfSigS[i] & 4)),
    pineLines: (c, b) => [
      `use_flag     = input.bool(${b(c.useFlag)},    "Флаг",               group=grp_entry)`,
    ],
  },

  // ── Triangle Pattern ──────────────────────────────────────
  {
    id:        'triangle',
    flag:      'useTri',
    htmlId:    'e_tri',
    shortName: () => 'Tri',
    detectL: (cfg, i) => !!(cfg.tfSigL && (cfg.tfSigL[i] & 8)),
    detectS: (cfg, i) => !!(cfg.tfSigS && (cfg.tfSigS[i] & 8)),
    pineLines: (c, b, f) => {
      // Shared TL params: only emit once (after Triangle, as last TL type)
      const on = c.useTLTouch || c.useTLBreak || c.useFlag || c.useTri;
      return [
        `use_tri      = input.bool(${b(c.useTri)},     "Треугольник",        group=grp_entry)`,
        `tl_pv_l      = input.int(${Math.max(2, c.tlPvL||5)},  "TL Pivot Left",  minval=2, maxval=20, group=grp_entry)`,
        `tl_pv_r      = input.int(${Math.max(1, c.tlPvR||3)},  "TL Pivot Right", minval=1, maxval=10, group=grp_entry)`,
        `tl_zone_pct  = input.float(${f(c.tlZonePct||0.3,1)}, "TL Зона ±%",      step=0.1,  group=grp_entry)`,
        `flag_imp_atr = input.float(${f(c.flagImpMin||2.0,1)}, "Флаг Импульс ×ATR", step=0.5, group=grp_entry)`,
        `flag_max_b   = input.int(${Math.max(5, c.flagMaxBars||20)}, "Флаг Макс баров",   minval=5, maxval=50, group=grp_entry)`,
        `flag_ret     = input.float(${f(c.flagRetrace||0.618,3)}, "Флаг Откат",  step=0.01, group=grp_entry)`,
      ];
    },
  },

  // ── RSI выход из зоны OB/OS ──────────────────────────────
  // Лонг: RSI пересекает уровень перепроданности СНИЗУ ВВЕРХ
  // Шорт: RSI пересекает уровень перекупленности СВЕРХУ ВНИЗ
  {
    id:        'rsiexit',
    flag:      'useRsiExit',
    htmlId:    'e_rsix',
    shortName: c => `RSIexit(${c.rsiExitPeriod||14},${c.rsiExitOS||30}/${c.rsiExitOB||70})`,
    detectL: (cfg, i) => {
      if (!cfg.rsiExitArr || i < 2) return false;
      return cfg.rsiExitArr[i-2] < cfg.rsiExitOS && cfg.rsiExitArr[i-1] >= cfg.rsiExitOS;
    },
    detectS: (cfg, i) => {
      if (!cfg.rsiExitArr || i < 2) return false;
      return cfg.rsiExitArr[i-2] > cfg.rsiExitOB && cfg.rsiExitArr[i-1] <= cfg.rsiExitOB;
    },
    pineLines: (c, b) => [
      `use_rsi_exit  = input.bool(${b(c.useRsiExit)}, "RSI выход из зоны", group=grp_entry)`,
      `rsi_exit_per  = input.int(${c.rsiExitPeriod||14}, "  RSI период", minval=2, maxval=50, group=grp_entry)`,
      `rsi_exit_os   = input.int(${c.rsiExitOS||30}, "  RSI OS уровень", minval=5, maxval=49, group=grp_entry)`,
      `rsi_exit_ob   = input.int(${c.rsiExitOB||70}, "  RSI OB уровень", minval=51, maxval=95, group=grp_entry)`,
    ],
  },

  // ── МА кросс-овер (пересечение) ──────────────────────────
  // Отличие от MA Touch: НЕ требует касания зоны MA.
  // Лонг: свеча [i-1] закрылась выше MA, [i-2] закрылась ниже или на MA.
  {
    id:        'macross',
    flag:      'useMaCross',
    htmlId:    'e_macr',
    shortName: c => `${c.maCrossType||'EMA'}cross(${c.maCrossP||20})`,
    detectL: (cfg, i) => {
      if (!cfg.maCrossArr || i < 2) return false;
      return DATA[i-1].c > cfg.maCrossArr[i-1] && DATA[i-2].c <= cfg.maCrossArr[i-2];
    },
    detectS: (cfg, i) => {
      if (!cfg.maCrossArr || i < 2) return false;
      return DATA[i-1].c < cfg.maCrossArr[i-1] && DATA[i-2].c >= cfg.maCrossArr[i-2];
    },
    pineLines: (c, b) => [
      `use_ma_cross  = input.bool(${b(c.useMaCross)}, "МА кросс-овер", group=grp_entry)`,
      `ma_cross_type = input.string("${c.maCrossType||'EMA'}", "  МА тип", options=["EMA","SMA","WMA"], group=grp_entry)`,
      `ma_cross_p    = input.int(${c.maCrossP||20}, "  МА период", minval=2, maxval=500, group=grp_entry)`,
    ],
  },

  // ── Supertrend ────────────────────────────────────────────
  // Лонг: направление флипнулось с -1 на +1 на предыдущем баре.
  // Шорт: направление флипнулось с +1 на -1 на предыдущем баре.
  {
    id:        'supertrend',
    flag:      'useSupertrend',
    htmlId:    'e_st',
    shortName: c => `ST(${c.stAtrP||10},${c.stMult||3})`,
    detectL: (cfg, i) => {
      if (!cfg.stDir || i < 3) return false;
      return cfg.stDir[i-1] === 1 && cfg.stDir[i-2] === -1;
    },
    detectS: (cfg, i) => {
      if (!cfg.stDir || i < 3) return false;
      return cfg.stDir[i-1] === -1 && cfg.stDir[i-2] === 1;
    },
    pineLines: (c, b) => [
      `use_supertrend = input.bool(${b(c.useSupertrend)}, "Supertrend смена тренда", group=grp_entry)`,
      `st_atr_p       = input.int(${c.stAtrP||10}, "  ST ATR период", minval=1, maxval=200, group=grp_entry)`,
      `st_mult        = input.float(${c.stMult||3.0}, "  ST множитель", minval=0.1, maxval=20, step=0.1, group=grp_entry)`,
    ],
  },

  // ── Kalman Crossover ─────────────────────────────────────
  // Вход по пересечению цены с адаптивной Kalman MA.
  // Лонг: close[i-1] > Kalman[i-1] AND close[i-2] <= Kalman[i-2].
  // Отличие от MA Crossover: Kalman адаптирует скорость к волатильности —
  // быстрее при высокой, медленнее при низкой → меньше ложных пробоев.
  // FIX: kalmanCrossArr[i-1] <= 0 → не прогрелся → не торговать.
  // Откат: удалить этот объект + kalmanCrossArr в opt.js + #e_kalcr в shell.html
  {
    id:        'kalmancross',
    flag:      'useKalmanCross',
    htmlId:    'e_kalcr',
    shortName: c => `KalmanX(${c.kalmanCrossLen || 20})`,
    detectL: (cfg, i) => {
      if (!cfg.kalmanCrossArr || i < 2) return false;
      const k1 = cfg.kalmanCrossArr[i-1], k2 = cfg.kalmanCrossArr[i-2];
      return k1 > 0 && k2 > 0 && DATA[i-1].c > k1 && DATA[i-2].c <= k2;
    },
    detectS: (cfg, i) => {
      if (!cfg.kalmanCrossArr || i < 2) return false;
      const k1 = cfg.kalmanCrossArr[i-1], k2 = cfg.kalmanCrossArr[i-2];
      return k1 > 0 && k2 > 0 && DATA[i-1].c < k1 && DATA[i-2].c >= k2;
    },
    pineLines: (c, b) => [
      `use_kalman_cross = input.bool(${b(c.useKalmanCross)}, "Kalman кросс", group=grp_entry)`,
      `kalman_cross_len = input.int(${c.kalmanCrossLen || 20}, "  Kalman период", minval=5, maxval=500, group=grp_entry)`,
    ],
  },

  // ── Свободный вход (Free Entry) ───────────────────────────
  // Вход разрешён всегда. Ограничивают только фильтры (AND-логика).
  // Полезно: тест чистой системы фильтров без сигнала входа.
  {
    id:        'free',
    flag:      'useFreeEntry',
    htmlId:    'e_free',
    shortName: () => 'Free',
    detectL:   () => true,
    detectS:   () => true,
    pineLines: (c, b) => [
      `use_free_entry = input.bool(${b(c.useFreeEntry)}, "Свободный вход", group=grp_entry)`,
    ],
  },

  // ── MACD кросс-овер ───────────────────────────────────────
  // Лонг: MACD линия пересекает сигнальную СНИЗУ ВВЕРХ
  // Шорт: MACD линия пересекает сигнальную СВЕРХУ ВНИЗ
  {
    id:        'macd',
    flag:      'useMacd',
    htmlId:    'e_macd',
    shortName: c => `MACD(${c.macdFast||12}/${c.macdSlow||26}/${c.macdSignalP||9})`,
    detectL: (cfg, i) => {
      if (!cfg.macdLine || !cfg.macdSignal || i < 2) return false;
      return cfg.macdLine[i-1] > cfg.macdSignal[i-1] && cfg.macdLine[i-2] <= cfg.macdSignal[i-2];
    },
    detectS: (cfg, i) => {
      if (!cfg.macdLine || !cfg.macdSignal || i < 2) return false;
      return cfg.macdLine[i-1] < cfg.macdSignal[i-1] && cfg.macdLine[i-2] >= cfg.macdSignal[i-2];
    },
    pineLines: (c, b) => [
      `use_macd      = input.bool(${b(c.useMacd)}, "MACD кросс", group=grp_entry)`,
      `macd_fast     = input.int(${c.macdFast||12}, "  MACD быстрый", minval=2, maxval=100, group=grp_entry)`,
      `macd_slow     = input.int(${c.macdSlow||26}, "  MACD медленный", minval=3, maxval=200, group=grp_entry)`,
      `macd_signal   = input.int(${c.macdSignalP||9}, "  MACD сигнал", minval=2, maxval=50, group=grp_entry)`,
    ],
  },

  // ── Stochastic выход из зоны OB/OS ───────────────────────
  // Используется %D (сглаженный). Лонг: %D выходит из OS снизу вверх.
  {
    id:        'stochexit',
    flag:      'useStochExit',
    htmlId:    'e_stx',
    shortName: c => `Stoch(${c.stochKP||14}/${c.stochDP||3},${c.stochOS||20}/${c.stochOB||80})`,
    detectL: (cfg, i) => {
      if (!cfg.stochD || i < 2) return false;
      return cfg.stochD[i-2] < cfg.stochOS && cfg.stochD[i-1] >= cfg.stochOS;
    },
    detectS: (cfg, i) => {
      if (!cfg.stochD || i < 2) return false;
      return cfg.stochD[i-2] > cfg.stochOB && cfg.stochD[i-1] <= cfg.stochOB;
    },
    pineLines: (c, b) => [
      `use_stoch_exit = input.bool(${b(c.useStochExit)}, "Stochastic выход из зоны", group=grp_entry)`,
      `stoch_k_per   = input.int(${c.stochKP||14}, "  Stoch K период", minval=2, maxval=100, group=grp_entry)`,
      `stoch_d_per   = input.int(${c.stochDP||3},  "  Stoch D период", minval=2, maxval=20, group=grp_entry)`,
      `stoch_os      = input.int(${c.stochOS||20}, "  Stoch OS уровень", minval=5, maxval=49, group=grp_entry)`,
      `stoch_ob      = input.int(${c.stochOB||80}, "  Stoch OB уровень", minval=51, maxval=95, group=grp_entry)`,
    ],
  },

  // ── Объём + направленное движение ────────────────────────
  // Лонг: предыдущая свеча бычья + объём > avg×mult + закрытие в верхней половине
  // Шорт: предыдущая свеча медвежья + объём > avg×mult + закрытие в нижней половине
  {
    id:        'volmove',
    flag:      'useVolMove',
    htmlId:    'e_volmv',
    shortName: c => `VolMove(${c.volMoveMult||1.5}×)`,
    detectL: (cfg, i) => {
      if (!HAS_VOLUME || !cfg.volAvg || i < 1) return false;
      const p = DATA[i-1];
      return p.v > cfg.volAvg[i-1] * cfg.volMoveMult &&
             p.c > p.o && (p.c - p.l) > (p.h - p.c);
    },
    detectS: (cfg, i) => {
      if (!HAS_VOLUME || !cfg.volAvg || i < 1) return false;
      const p = DATA[i-1];
      return p.v > cfg.volAvg[i-1] * cfg.volMoveMult &&
             p.c < p.o && (p.h - p.c) > (p.c - p.l);
    },
    pineLines: (c, b, f) => [
      `use_vol_move  = input.bool(${b(c.useVolMove)}, "Объём + движение", group=grp_entry)`,
      `vol_move_mult = input.float(${f(c.volMoveMult||1.5,1)}, "  Объём ×avg", step=0.1, group=grp_entry)`,
    ],
  },

  // ── Inside Bar пробой ─────────────────────────────────────
  // mother bar [i-3], inside bar [i-2], breakout bar [i-1] закрылся за пределами mother.
  // Лонг: закрытие выше хая mother bar. Шорт: ниже лоу mother bar.
  {
    id:        'insidebar',
    flag:      'useInsideBar',
    htmlId:    'e_inb',
    shortName: () => 'InsideBar',
    detectL: (cfg, i) => {
      if (i < 4) return false;
      const m = DATA[i-3], ins = DATA[i-2], brk = DATA[i-1];
      return ins.h < m.h && ins.l > m.l && brk.c > m.h;
    },
    detectS: (cfg, i) => {
      if (i < 4) return false;
      const m = DATA[i-3], ins = DATA[i-2], brk = DATA[i-1];
      return ins.h < m.h && ins.l > m.l && brk.c < m.l;
    },
    pineLines: (c, b) => [
      `use_inside_bar = input.bool(${b(c.useInsideBar)}, "Inside Bar пробой", group=grp_entry)`,
    ],
  },

  // ── Elder Impulse System (EIS) ───────────────────────────
  // Лонг: EMA растёт И MACD гистограмма растёт (двойное согласование)
  // Шорт: EMA падает И MACD гистограмма падает
  {
    id:        'eis',
    flag:      'useEIS',
    htmlId:    'e_eis',
    shortName: c => `EIS(${c.eisPeriod||13})`,
    detectL: (cfg, i) => {
      if (!cfg.eisEMAArr || !cfg.eisHistArr || i < 3) return false;
      return cfg.eisEMAArr[i-1] > cfg.eisEMAArr[i-2] && cfg.eisHistArr[i-1] > cfg.eisHistArr[i-2];
    },
    detectS: (cfg, i) => {
      if (!cfg.eisEMAArr || !cfg.eisHistArr || i < 3) return false;
      return cfg.eisEMAArr[i-1] < cfg.eisEMAArr[i-2] && cfg.eisHistArr[i-1] < cfg.eisHistArr[i-2];
    },
    pineLines: (c, b) => [
      `use_eis     = input.bool(${b(c.useEIS)}, "Elder Impulse System", group=grp_entry)`,
      `eis_ema_p   = input.int(${c.eisPeriod||13}, "  EIS EMA период", minval=2, maxval=200, group=grp_entry)`,
    ],
  },

  // ── Three White Soldiers / Three Black Crows ─────────────
  // Лонг: 3 бычьих свечи подряд, каждая открывается внутри тела предыдущей, каждая закрывается выше
  // Шорт: 3 медвежьих свечи подряд, аналогично
  {
    id:        'soldiers',
    flag:      'useSoldiers',
    htmlId:    'e_soldiers',
    shortName: () => '3Soldiers',
    detectL: (cfg, i) => {
      if (i < 4) return false;
      const a = DATA[i-3], b = DATA[i-2], c = DATA[i-1];
      return a.c > a.o && b.c > b.o && c.c > c.o
        && b.o >= a.o && b.o <= a.c
        && c.o >= b.o && c.o <= b.c
        && b.c > a.c && c.c > b.c;
    },
    detectS: (cfg, i) => {
      if (i < 4) return false;
      const a = DATA[i-3], b = DATA[i-2], c = DATA[i-1];
      return a.c < a.o && b.c < b.o && c.c < c.o
        && b.o <= a.o && b.o >= a.c
        && c.o <= b.o && c.o >= b.c
        && b.c < a.c && c.c < b.c;
    },
    pineLines: (c, b) => [
      `use_soldiers = input.bool(${b(c.useSoldiers)}, "3 White Soldiers / 3 Black Crows", group=grp_entry)`,
    ],
  },

  // ── Разворот после N однонаправленных свечей ─────────────
  // Лонг: N (или более) медвежьих свечей подряд, затем бычья → разворот вверх
  // Шорт: N (или более) бычьих свечей подряд, затем медвежья → разворот вниз
  {
    id:        'nreversal',
    flag:      'useNReversal',
    htmlId:    'e_nrev',
    shortName: c => `NRev(${c.nReversalN||3})`,
    detectL: (cfg, i) => {
      const n = cfg.nReversalN || 3;
      if (i < n + 1) return false;
      if (DATA[i-1].c <= DATA[i-1].o) return false; // prev должна быть бычьей
      for (let j = 2; j <= n + 1; j++) {
        if (DATA[i-j].c >= DATA[i-j].o) return false; // серия медвежьих
      }
      return true;
    },
    detectS: (cfg, i) => {
      const n = cfg.nReversalN || 3;
      if (i < n + 1) return false;
      if (DATA[i-1].c >= DATA[i-1].o) return false; // prev должна быть медвежьей
      for (let j = 2; j <= n + 1; j++) {
        if (DATA[i-j].c <= DATA[i-j].o) return false; // серия бычьих
      }
      return true;
    },
    pineLines: (c, b) => [
      `use_n_reversal = input.bool(${b(c.useNReversal)}, "Разворот после N свечей", group=grp_entry)`,
      `n_reversal_n  = input.int(${c.nReversalN||3}, "  Мин свечей серии", minval=2, maxval=20, group=grp_entry)`,
    ],
  },

  // ── % изменения цены за N свечей ─────────────────────────────
  // Лонг: close вырос на ≥ pct% за последние period×htf свечей
  // Шорт: close упал на ≥ pct% за последние period×htf свечей
  // Поддерживает 2 условия (AND): A и B с разными параметрами/HTF
  {
    id:        'pchg',
    flag:      'usePChg',
    htmlId:    'e_pchg',
    shortName: c => {
      const htfA = c.pChgHtfA > 1 ? `×${c.pChgHtfA}` : '';
      const a = `${c.pChgPctA||1}%/${c.pChgPeriodA||10}b${htfA}`;
      if (!c.usePChgB) return `PChg(${a})`;
      const htfB = c.pChgHtfB > 1 ? `×${c.pChgHtfB}` : '';
      const b = `${c.pChgPctB||1}%/${c.pChgPeriodB||20}b${htfB}`;
      return `PChg(${a}+${b})`;
    },
    detectL: (cfg, i) => {
      // thr > 0: price went UP by >=thr% | thr < 0: price went DOWN by >=|thr|%
      const _ok = (chg, thr) => thr >= 0 ? chg >= thr : chg <= thr;
      const lookA = (cfg.pChgPeriodA || 10) * (cfg.pChgHtfA || 1);
      if (i <= lookA) return false;
      const chgA = (DATA[i-1].c - DATA[i-1-lookA].c) / DATA[i-1-lookA].c * 100;
      if (!_ok(chgA, cfg.pChgPctA || 1)) return false;
      if (cfg.usePChgB) {
        const lookB = (cfg.pChgPeriodB || 20) * (cfg.pChgHtfB || 1);
        if (i <= lookB) return false;
        const chgB = (DATA[i-1].c - DATA[i-1-lookB].c) / DATA[i-1-lookB].c * 100;
        if (!_ok(chgB, cfg.pChgPctB || 1)) return false;
      }
      return true;
    },
    detectS: (cfg, i) => {
      // Short mirrors Long: negate threshold (up→down, down→up)
      const _ok = (chg, thr) => thr >= 0 ? chg >= thr : chg <= thr;
      const lookA = (cfg.pChgPeriodA || 10) * (cfg.pChgHtfA || 1);
      if (i <= lookA) return false;
      const chgA = (DATA[i-1].c - DATA[i-1-lookA].c) / DATA[i-1-lookA].c * 100;
      if (!_ok(chgA, -(cfg.pChgPctA || 1))) return false;
      if (cfg.usePChgB) {
        const lookB = (cfg.pChgPeriodB || 20) * (cfg.pChgHtfB || 1);
        if (i <= lookB) return false;
        const chgB = (DATA[i-1].c - DATA[i-1-lookB].c) / DATA[i-1-lookB].c * 100;
        if (!_ok(chgB, -(cfg.pChgPctB || 1))) return false;
      }
      return true;
    },
    pineLines: (c, b) => [
      `use_pchg     = input.bool(${b(c.usePChg)}, "% Price Change Entry", group=grp_entry)`,
      `pchg_pct_a   = input.float(${c.pChgPctA||1}, "  А: мин.% изм. (+вверх/-вниз)", step=0.1, group=grp_entry)`,
      `pchg_per_a   = input.int(${c.pChgPeriodA||10}, "  А: период (свечей)", minval=1, group=grp_entry)`,
      `pchg_htf_a   = input.int(${c.pChgHtfA||1}, "  А: HTF множитель", minval=1, group=grp_entry)`,
      `use_pchg_b   = input.bool(${b(c.usePChgB)}, "  Условие B (AND)", group=grp_entry)`,
      `pchg_pct_b   = input.float(${c.pChgPctB||1}, "  B: мин.% изм. (+вверх/-вниз)", step=0.1, group=grp_entry)`,
      `pchg_per_b   = input.int(${c.pChgPeriodB||20}, "  B: период (свечей)", minval=1, group=grp_entry)`,
      `pchg_htf_b   = input.int(${c.pChgHtfB||1}, "  B: HTF множитель", minval=1, group=grp_entry)`,
    ],
  },
];
