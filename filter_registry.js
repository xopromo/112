// ============================================================
// filter_registry.js — реестр фильтров входа
// ============================================================
// FILTER_REGISTRY: массив объектов, описывающих каждый фильтр.
// Единственный источник правды для:
//   • core.js   — blocksL/blocksS (применение фильтров)
//   • opt.js    — buildName (части названия результата)
//
// ДОБАВИТЬ НОВЫЙ ФИЛЬТР: добавить 1 объект в FILTER_REGISTRY + чекбокс в shell.html
// + индикатор в _calcIndicators (если нужен) + поля в buildBtCfg. core/buildName — автоматически.
//
// blocksL(cfg, i) → true: блокировать лонг-сигнал
// blocksS(cfg, i) → true: блокировать шорт-сигнал
// Некоторые фильтры блокируют оба направления одновременно (blocksL = blocksS = true).
// ============================================================

const FILTER_REGISTRY = [
  // ── MA Direction ─────────────────────────────────────────
  // Pine: close[1] > ma_val где ma_val = EMA[i-1]
  // FIX: ma <= 0 означает индикатор ещё не прогрелся → блокируем сигнал (как Pine: close[1] > na = false)
  {
    id:       'ma',
    flag:     'useMA',
    blocksL:  (cfg, i) => { if (!cfg.maArr) return false; const ma = cfg.maArr[i-1]; return ma <= 0 || DATA[i-1].c <= ma; },
    blocksS:  (cfg, i) => { if (!cfg.maArr) return false; const ma = cfg.maArr[i-1]; return ma <= 0 || DATA[i-1].c >= ma; },
    nameLabel: (cfg, ex) => ex && ex.maP ? `${ex.maType||'EMA'}${ex.maP}${(ex.htfRatio&&ex.htfRatio>1)?'×'+ex.htfRatio+'tf':''}` : null,
  },

  // ── ADX Strength ─────────────────────────────────────────
  {
    id:       'adx',
    flag:     'useADX',
    blocksL:  (cfg, i) => {
      if (!cfg.adxArr) return false;
      const adx = cfg.adxArr[i-1];
      if (adx <= 0 || adx < cfg.adxThresh) return true;
      if (cfg.useAdxSlope) {
        const sb = cfg.adxSlopeBars||3;
        if (i-1 > sb && cfg.adxArr[i-1-sb] > 0) return adx <= cfg.adxArr[i-1-sb];
      }
      return false;
    },
    blocksS:  (cfg, i) => {
      if (!cfg.adxArr) return false;
      const adx = cfg.adxArr[i-1];
      if (adx <= 0 || adx < cfg.adxThresh) return true;
      if (cfg.useAdxSlope) {
        const sb = cfg.adxSlopeBars||3;
        if (i-1 > sb && cfg.adxArr[i-1-sb] > 0) return adx <= cfg.adxArr[i-1-sb];
      }
      return false;
    },
    nameLabel: (cfg, ex) => {
      const l = (ex&&ex.adxL)||cfg.adxLen||14;
      const htf = (cfg.adxHtfRatio&&cfg.adxHtfRatio>1) ? '×'+cfg.adxHtfRatio+'tf' : '';
      const slope = cfg.useAdxSlope ? '↑' : '';
      return `ADX(${l}>${cfg.adxThresh})${htf}${slope}`;
    },
  },

  // ── ATR Expanding (anti-flat) ─────────────────────────────
  {
    id:       'atrexp',
    flag:     'useAtrExp',
    blocksL:  (cfg, i, ac) => !cfg.atrAvg || cfg.atrAvg[i-1] <= 0 || ac < cfg.atrAvg[i-1] * cfg.atrExpMult,
    blocksS:  (cfg, i, ac) => !cfg.atrAvg || cfg.atrAvg[i-1] <= 0 || ac < cfg.atrAvg[i-1] * cfg.atrExpMult,
    nameLabel: (cfg) => `AtrExp>${cfg.atrExpMult}×`,
  },

  // ── RSI Extremes ──────────────────────────────────────────
  {
    id:       'rsi',
    flag:     'useRSI',
    blocksL:  (cfg, i) => cfg.rsiArr && cfg.rsiArr[i-1] >= cfg.rsiOS,
    blocksS:  (cfg, i) => cfg.rsiArr && cfg.rsiArr[i-1] <= cfg.rsiOB,
    nameLabel: (cfg) => `RSI(${cfg.rsiOS}-${cfg.rsiOB})`,
  },

  // ── Volume / ATR Filter ───────────────────────────────────
  {
    id:       'volf',
    flag:     'useVolF',
    blocksL:  (cfg, i, ac) => cfg.atrAvg && ac > cfg.atrAvg[i-1] * cfg.volFMult,
    blocksS:  (cfg, i, ac) => cfg.atrAvg && ac > cfg.atrAvg[i-1] * cfg.volFMult,
    nameLabel: (cfg) => `VFilt<${cfg.volFMult}×`,
  },

  // ── Market Structure (HH/HL) ──────────────────────────────
  {
    id:       'struct',
    flag:     'useStruct',
    blocksL:  (cfg, i) => cfg.structBull && !cfg.structBull[i],
    blocksS:  (cfg, i) => cfg.structBear && !cfg.structBear[i],
    nameLabel: (cfg) => `Struct${cfg.structLen||20}(L${cfg.strPvL||5}R${cfg.strPvR||2})`,
  },

  // ── MA Distance ───────────────────────────────────────────
  // Pine: abs(close[1] - ma_val) / atr_v
  {
    id:       'madist',
    flag:     'useMaDist',
    blocksL:  (cfg, i, ac) => {
      if (!cfg.maArr || ac <= 0) return false;
      return Math.abs(DATA[i-1].c - cfg.maArr[i-1]) / ac > cfg.maDistMax;
    },
    blocksS:  (cfg, i, ac) => {
      if (!cfg.maArr || ac <= 0) return false;
      return Math.abs(DATA[i-1].c - cfg.maArr[i-1]) / ac > cfg.maDistMax;
    },
    nameLabel: (cfg) => `MaDist<${cfg.maDistMax}×ATR`,
  },

  // ── Candle Size ───────────────────────────────────────────
  // Pine: ТЕКУЩАЯ свеча (bar confirmed = close[0])
  {
    id:       'candlef',
    flag:     'useCandleF',
    blocksL:  (cfg, i, ac) => {
      if (ac <= 0) return false;
      const cs = DATA[i].h - DATA[i].l;
      return cs < ac * cfg.candleMin || cs > ac * cfg.candleMax;
    },
    blocksS:  (cfg, i, ac) => {
      if (ac <= 0) return false;
      const cs = DATA[i].h - DATA[i].l;
      return cs < ac * cfg.candleMin || cs > ac * cfg.candleMax;
    },
    nameLabel: (cfg) => `Candle(${cfg.candleMin}-${cfg.candleMax})`,
  },

  // ── Consecutive Bars ─────────────────────────────────────
  {
    id:       'consec',
    flag:     'useConsec',
    blocksL:  (cfg, i) => {
      if (i < cfg.consecMax + 1) return false;
      let bc = 0;
      for (let j = 1; j <= cfg.consecMax + 1; j++) {
        if (DATA[i-j].c > DATA[i-j].o) bc++; else { bc = 0; break; }
      }
      return bc >= cfg.consecMax;
    },
    blocksS:  (cfg, i) => {
      if (i < cfg.consecMax + 1) return false;
      let bca = 0;
      for (let j = 1; j <= cfg.consecMax + 1; j++) {
        if (DATA[i-j].c < DATA[i-j].o) bca++; else { bca = 0; break; }
      }
      return bca >= cfg.consecMax;
    },
    nameLabel: (cfg) => `Consec<${cfg.consecMax}`,
  },

  // ── SMA Trend (STrend) ────────────────────────────────────
  // Pine: close[1..N] vs одно значение EMA[i-1]
  {
    id:       'strend',
    flag:     'useSTrend',
    blocksL:  (cfg, i) => {
      if (!cfg.maArr || i < cfg.sTrendWin + 1) return false;
      const maRef = cfg.maArr[i-1];
      if (maRef <= 0) return true; // MA не прогрелась → блокировать
      let ab = 0, bl = 0;
      for (let j = 1; j <= cfg.sTrendWin; j++) {
        if (DATA[i-j].c > maRef) ab++; else bl++;
      }
      return ab <= bl;
    },
    blocksS:  (cfg, i) => {
      if (!cfg.maArr || i < cfg.sTrendWin + 1) return false;
      const maRef = cfg.maArr[i-1];
      if (maRef <= 0) return true; // MA не прогрелась → блокировать
      let ab = 0, bl = 0;
      for (let j = 1; j <= cfg.sTrendWin; j++) {
        if (DATA[i-j].c > maRef) ab++; else bl++;
      }
      return bl <= ab;
    },
    nameLabel: (cfg, ex) => `STrend${(ex&&ex.stw)||cfg.sTrendWin||''}`,
  },

  // ── Secondary MA Confirm ──────────────────────────────────
  {
    id:       'confirm',
    flag:     'useConfirm',
    blocksL:  (cfg, i) => {
      if (!cfg.maArrConfirm || i < 1) return false;
      const ma = cfg.maArrConfirm[i-1];
      return ma <= 0 || DATA[i-1].c <= ma;
    },
    blocksS:  (cfg, i) => {
      if (!cfg.maArrConfirm || i < 1) return false;
      const ma = cfg.maArrConfirm[i-1];
      return ma <= 0 || DATA[i-1].c >= ma;
    },
    nameLabel: (cfg) => `Conf${cfg.confMatType||'EMA'}${cfg.confN}${(cfg.confHtfRatio&&cfg.confHtfRatio>1)?'×'+cfg.confHtfRatio+'tf':''}`,
  },

  // ── Trend Freshness ───────────────────────────────────────
  // Pine: непрерывная серия баров подряд где close > MA
  {
    id:       'fresh',
    flag:     'useFresh',
    blocksL:  (cfg, i) => {
      if (!cfg.maArr) return false;
      let age = 0;
      for (let j = 1; j < Math.min(i, cfg.freshMax + 2); j++) {
        if (DATA[i-j].c > cfg.maArr[i-j-1]) age++; else break;
      }
      return age >= cfg.freshMax;
    },
    blocksS:  (cfg, i) => {
      if (!cfg.maArr) return false;
      let age = 0;
      for (let j = 1; j < Math.min(i, cfg.freshMax + 2); j++) {
        if (DATA[i-j].c < cfg.maArr[i-j-1]) age++; else break;
      }
      return age >= cfg.freshMax;
    },
    nameLabel: (cfg) => `Fresh<${cfg.freshMax}`,
  },

  // ── VSA — Volume Spike ────────────────────────────────────
  {
    id:       'vsa',
    flag:     'useVSA',
    volRequired: true,
    blocksL:  (cfg, i) => HAS_VOLUME && cfg.volAvg && DATA[i-1].v < cfg.volAvg[i-1] * cfg.vsaMult,
    blocksS:  (cfg, i) => HAS_VOLUME && cfg.volAvg && DATA[i-1].v < cfg.volAvg[i-1] * cfg.vsaMult,
    nameLabel: (cfg) => `Vol>${cfg.vsaMult}×`,
  },

  // ── Liquidity ─────────────────────────────────────────────
  {
    id:       'liq',
    flag:     'useLiq',
    volRequired: true,
    blocksL:  (cfg, i) => HAS_VOLUME && cfg.volAvg && DATA[i-1].v < cfg.volAvg[i-1] * cfg.liqMin,
    blocksS:  (cfg, i) => HAS_VOLUME && cfg.volAvg && DATA[i-1].v < cfg.volAvg[i-1] * cfg.liqMin,
    nameLabel: (cfg) => `Liq>${cfg.liqMin}×`,
  },

  // ── Volume Direction ──────────────────────────────────────
  {
    id:       'voldir',
    flag:     'useVolDir',
    volRequired: true,
    blocksL:  (cfg, i) => {
      if (!HAS_VOLUME || !cfg.volAvg || i < cfg.volDirPeriod) return false;
      let bullVol = 0, bearVol = 0;
      for (let j = 1; j <= cfg.volDirPeriod; j++) {
        if (DATA[i-j].c > DATA[i-j].o) bullVol += DATA[i-j].v; else bearVol += DATA[i-j].v;
      }
      return bullVol <= bearVol;
    },
    blocksS:  (cfg, i) => {
      if (!HAS_VOLUME || !cfg.volAvg || i < cfg.volDirPeriod) return false;
      let bullVol = 0, bearVol = 0;
      for (let j = 1; j <= cfg.volDirPeriod; j++) {
        if (DATA[i-j].c > DATA[i-j].o) bullVol += DATA[i-j].v; else bearVol += DATA[i-j].v;
      }
      return bearVol <= bullVol;
    },
    nameLabel: (cfg) => `VolDir${cfg.volDirPeriod||10}`,
  },

  // ── Weighted Trend ────────────────────────────────────────
  {
    id:       'wt',
    flag:     'useWT',
    blocksL:  (cfg, i) => cfg.wtScores && cfg.wtScores[i] <= cfg.wtThresh,
    blocksS:  (cfg, i) => cfg.wtScores && cfg.wtScores[i] >= -cfg.wtThresh,
    nameLabel: (cfg) => `WT>${cfg.wtThresh}`,
  },

  // ── MACD Direction ───────────────────────────────────────
  // Лонг: MACD line > signal line (бычий импульс)
  // Шорт: MACD line < signal line (медвежий импульс)
  {
    id:       'macdfilter',
    flag:     'useMacdFilter',
    blocksL:  (cfg, i) => cfg.macdLine && cfg.macdSignal && cfg.macdLine[i-1] <= cfg.macdSignal[i-1],
    blocksS:  (cfg, i) => cfg.macdLine && cfg.macdSignal && cfg.macdLine[i-1] >= cfg.macdSignal[i-1],
    nameLabel: () => 'MACDf',
  },

  // ── Efficiency Ratio (Kaufman) ────────────────────────────
  // ER = |net_change_N| / sum(|bar_changes_N|)
  // ER близко к 1 = сильный тренд, к 0 = хаос. Блокировать если ER < threshold.
  // FIX: первые erPeriod баров = 0 (не прогрет) → блокировать как Pine na
  {
    id:       'er',
    flag:     'useER',
    blocksL:  (cfg, i) => !cfg.erArr || cfg.erArr[i-1] <= 0 || cfg.erArr[i-1] < cfg.erThresh,
    blocksS:  (cfg, i) => !cfg.erArr || cfg.erArr[i-1] <= 0 || cfg.erArr[i-1] < cfg.erThresh,
    nameLabel: (cfg) => `ER>${cfg.erThresh}`,
  },

  // ── Fat Volume (Exhaustion) ───────────────────────────────
  {
    id:       'fat',
    flag:     'useFat',
    volRequired: true,
    blocksL:  (cfg, i) => {
      if (!HAS_VOLUME || !cfg.volAvg || i < 10) return false;
      const volRecent = (DATA[i].v + DATA[i-1].v + DATA[i-2].v) / 3;
      let volPrev10 = 0;
      for (let k = 0; k < 10; k++) volPrev10 += DATA[i-k].v;
      volPrev10 /= 10;
      const fatVol = volRecent < volPrev10 * cfg.fatVolDrop;
      let bullConsec = 0;
      for (let j = 1; j <= cfg.fatConsec + 1; j++) {
        if (DATA[i-j].c > DATA[i-j].o) {
          if (j === 1 || DATA[i-j+1].c > DATA[i-j+1].o) bullConsec++; else break;
        } else break;
      }
      return bullConsec >= cfg.fatConsec && fatVol;
    },
    blocksS:  (cfg, i) => {
      if (!HAS_VOLUME || !cfg.volAvg || i < 10) return false;
      const volRecent = (DATA[i].v + DATA[i-1].v + DATA[i-2].v) / 3;
      let volPrev10 = 0;
      for (let k = 0; k < 10; k++) volPrev10 += DATA[i-k].v;
      volPrev10 /= 10;
      const fatVol = volRecent < volPrev10 * cfg.fatVolDrop;
      let bearConsec = 0;
      for (let j = 1; j <= cfg.fatConsec + 1; j++) {
        if (DATA[i-j].c < DATA[i-j].o) {
          if (j === 1 || DATA[i-j+1].c < DATA[i-j+1].o) bearConsec++; else break;
        } else break;
      }
      return bearConsec >= cfg.fatConsec && fatVol;
    },
    nameLabel: (cfg) => `Fat(${cfg.fatConsec}sv)`,
  },

  // ── Kalman MA Direction (Tier 3) ─────────────────────────────
  // Адаптивная MA: период сжимается при высокой волатильности,
  // расширяется при низкой. Работает как обычный MA-фильтр по направлению,
  // но MA адаптируется к рыночным условиям автоматически.
  // FIX: kalmanArr[i-1] <= 0 → индикатор не прогрелся → блокировать.
  // Откат: удалить этот объект + _buildKalmanMA/_calcIndicators/buildBtCfg (opt.js)
  //        + чекбокс f_kalman (shell.html)
  {
    id:       'kalman',
    flag:     'useKalmanMA',
    blocksL:  (cfg, i) => {
      if (!cfg.kalmanArr) return false;
      const kma = cfg.kalmanArr[i - 1];
      return kma <= 0 || DATA[i - 1].c <= kma; // kma <= 0 = не прогрелась
    },
    blocksS:  (cfg, i) => {
      if (!cfg.kalmanArr) return false;
      const kma = cfg.kalmanArr[i - 1];
      return kma <= 0 || DATA[i - 1].c >= kma;
    },
    nameLabel: (cfg) => `KalmanMA(${cfg.kalmanLen || 20})`,
  },

  // ── Squeeze Modifier (пробой после сжатия) ────────────────
  // Блокирует вход если предыдущий бар НЕ был в сжатии (BB < KC).
  // Аналог is_sq[1] из индикатора "Ultimate Breakout":
  //   sig_long = close > upper AND is_sq[1]  ← вход только из сжатия
  // Использует sqzOn[] из Squeeze entry (вычисляется совместно).
  {
    id:       'sqzmod',
    flag:     'useSqzMod',
    blocksL:  (cfg, i) => !cfg.sqzOn || !cfg.sqzOn[i-1],
    blocksS:  (cfg, i) => !cfg.sqzOn || !cfg.sqzOn[i-1],
    nameLabel: () => 'SqzPrev',
  },
];
