// ============================================================
// exit_registry.js — реестр принудительных выходов из сделки
// ============================================================
// EXIT_REGISTRY: массив объектов для статeless forced exits.
//
// Покрывает: Climax, Time (проверки без внутреннего состояния).
// НЕ покрывает: Rev (сложная state-machine со skip/cooldown/revNewDir).
// НЕ покрывает: BE, Trailing, Partial (не forced exits, а управление SL).
//
// ДОБАВИТЬ НОВЫЙ FORCED EXIT: добавить 1 объект ниже + чекбокс в shell.html
// + поля в buildBtCfg. core.js выход применяется автоматически.
//
// check(cfg, i, tradeState) → true: выход (frc = true)
//   tradeState: { dir, entry, entryBar }
//   ВАЖНО: check вызывается только если !frc (предыдущий exit не сработал)
// ============================================================

const EXIT_REGISTRY = [
  // ── Climax Bar Exit ──────────────────────────────────────
  // Огромный объём + большое тело на предыдущем баре → выход
  {
    id:    'climax',
    flag:  'useClimax',
    check: (cfg, i, ts) => {
      if (!HAS_VOLUME || !cfg.volAvg || !cfg.bodyAvg) return false;
      const prev = DATA[i-1];
      const isClimaxBar = prev.v > cfg.volAvg[i-1] * cfg.clxVolMult &&
        Math.abs(prev.c - prev.o) > cfg.bodyAvg[i-1] * cfg.clxBodyMult;
      if (!isClimaxBar) return false;
      const cpnl = ts.dir * (DATA[i].c - ts.entry) / ts.entry * 100;
      return cfg.clxMode === 'any' || cpnl > 0;
    },
  },

  // ── Time-Based Exit ───────────────────────────────────────
  // Выход через N баров после входа
  {
    id:    'time',
    flag:  'useTime',
    check: (cfg, i, ts) => {
      if ((i - ts.entryBar) < cfg.timeBars) return false;
      if (cfg.timeMode === 'any') return true;
      const cpnl = ts.dir * (DATA[i].c - ts.entry) / ts.entry * 100;
      return cfg.timeMode === 'plus' && cpnl > 0;
    },
  },

  // ── Supertrend Exit (Вариант A) ───────────────────────────
  // Выход когда Supertrend разворачивается против позиции.
  // Лонг: dir флипнулся с +1 на -1 на предыдущем баре → exit.
  // Шорт: dir флипнулся с -1 на +1 на предыдущем баре → exit.
  {
    id:    'stExit',
    flag:  'useStExit',
    check: (cfg, i, ts) => {
      if (!cfg.stDir || i < 2) return false;
      if (ts.dir === 1)  return cfg.stDir[i-1] === -1 && cfg.stDir[i-2] === 1;
      if (ts.dir === -1) return cfg.stDir[i-1] === 1  && cfg.stDir[i-2] === -1;
      return false;
    },
  },
];
