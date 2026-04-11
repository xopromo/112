"""
drl/env.py — минимальная торговая среда (v2, бинарные действия)

ДИЗАЙН:
  Действия всего 2:
    0 = FLAT  (не в рынке; если были в позиции — выходим)
    1 = LONG  (в рынке; если не были — входим)

  Нет EXIT, нет SHORT, нет MIN_HOLD.
  Агент решает каждый бар: быть в рынке или нет.
  Комиссия платится при СМЕНЕ позиции (0→1 или 1→0).

НАБЛЮДЕНИЕ (22 признака):
  [0-18]  z-score лог-доходности последних 19 баров
  [19]    ATR / close  (волатильность)
  [20]    RSI(14) / 100
  [21]    Текущая позиция (0 или 1)

НАГРАДА:
  Когда LONG:  log(c_cur / c_prev)  — лог-доходность бара
  Когда FLAT:  0
  При смене:  −commission  (платится один раз при переходе)
"""

import numpy as np
import gymnasium as gym
from gymnasium import spaces


class TradingEnv(gym.Env):
    metadata = {'render_modes': []}

    def __init__(self, df, commission=0.001, window=19):
        super().__init__()

        self.closes = df['close'].values.astype(np.float64)
        self.highs  = df['high'].values.astype(np.float64)
        self.lows   = df['low'].values.astype(np.float64)
        self.commission = commission
        self.window = window
        self.n      = len(self.closes)

        self._atr = self._calc_atr(14)
        self._rsi = self._calc_rsi(14)
        self._start = max(window + 2, 30)

        # 2 действия: 0=flat, 1=long
        self.action_space      = spaces.Discrete(2)
        self.observation_space = spaces.Box(
            low=-5.0, high=5.0, shape=(22,), dtype=np.float32
        )

    # ── Индикаторы ────────────────────────────────────────────────

    def _calc_atr(self, period=14):
        n, tr, atr = self.n, np.zeros(self.n), np.zeros(self.n)
        for i in range(1, n):
            tr[i] = max(self.highs[i] - self.lows[i],
                        abs(self.highs[i] - self.closes[i-1]),
                        abs(self.lows[i]  - self.closes[i-1]))
        if n > period:
            atr[period] = tr[1:period+1].mean()
        a = 1.0 / period
        for i in range(period + 1, n):
            atr[i] = a * tr[i] + (1-a) * atr[i-1]
        return atr

    def _calc_rsi(self, period=14):
        n, rsi = self.n, np.full(self.n, 50.0)
        avg_u = avg_d = 0.0
        for i in range(1, n):
            chg = self.closes[i] - self.closes[i-1]
            u, d = max(chg, 0.0), max(-chg, 0.0)
            if i <= period:
                avg_u += u / period; avg_d += d / period
                if i == period and avg_d > 0:
                    rsi[i] = 100 - 100 / (1 + avg_u / avg_d)
            else:
                avg_u = (avg_u*(period-1) + u) / period
                avg_d = (avg_d*(period-1) + d) / period
                rsi[i] = 100 - 100 / (1 + avg_u / avg_d) if avg_d > 0 else 100.0
        return rsi

    # ── Наблюдение ────────────────────────────────────────────────

    def _obs(self):
        i  = min(self.bar, self.n - 1)
        c0 = self.closes[i - 1]
        a0 = max(self._atr[i - 1], 1e-8)

        # z-score лог-доходности (window баров)
        lr = np.array([
            np.log(max(self.closes[i - self.window + k], 1e-10) /
                   max(self.closes[i - self.window + k - 1], 1e-10))
            for k in range(self.window)
        ])
        std = lr.std() + 1e-8
        lr_n = np.clip((lr - lr.mean()) / std, -5.0, 5.0)

        return np.concatenate([
            lr_n,
            [np.clip(a0 / max(c0, 1e-8), 0, 5),   # ATR-режим
             self._rsi[i-1] / 100.0,                # RSI
             float(self.in_long)],                   # позиция
        ]).astype(np.float32)

    # ── Gymnasium API ─────────────────────────────────────────────

    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        self.bar        = self._start
        self.in_long    = False
        self.entry_bar  = 0
        self.entry_price = 0.0
        self.equity     = 1.0
        self.max_equity = 1.0
        self.eq_curve   = [1.0]
        self.trades     = 0
        self.wins       = 0
        # для совместимости с evaluate()
        self.in_trade   = False
        self.direction  = 0
        return self._obs(), {}

    def step(self, action):
        i   = self.bar
        c   = self.closes[i]
        c_p = self.closes[i - 1]

        reward = 0.0
        want_long = bool(action == 1)

        # ── Смена позиции → комиссия ──
        if want_long and not self.in_long:        # FLAT → LONG
            self.equity    *= (1.0 - self.commission)
            reward         -= self.commission
            self.in_long    = True
            self.entry_bar  = i
            self.entry_price = c
            self.trades    += 1

        elif not want_long and self.in_long:      # LONG → FLAT
            self.equity    *= (1.0 - self.commission)
            reward         -= self.commission
            trade_ret = c / self.entry_price - 1.0 - 2*self.commission
            if trade_ret > 0:
                self.wins += 1
            self.in_long = False

        # ── Mark-to-market ──
        if self.in_long:
            log_ret = np.log(max(c, 1e-10) / max(c_p, 1e-10))
            self.equity *= np.exp(log_ret)
            reward      += log_ret          # лог-доходность бара

        # ── Штраф за просадку > 20% ──
        self.max_equity = max(self.max_equity, self.equity)
        dd = (self.max_equity - self.equity) / max(self.max_equity, 1e-8)
        if dd > 0.20:
            reward -= 0.005                 # фиксированный штраф per bar

        self.eq_curve.append(self.equity)
        # для совместимости
        self.in_trade = self.in_long
        self.direction = 1 if self.in_long else 0

        self.bar += 1
        terminated = self.bar >= self.n - 1

        if terminated and self.in_long:
            c_last = self.closes[-1]
            trade_ret = c_last / self.entry_price - 1.0 - 2*self.commission
            if trade_ret > 0:
                self.wins += 1
            self.equity  *= (1.0 - self.commission)
            self.in_long  = False

        obs = self._obs() if not terminated else np.zeros(22, dtype=np.float32)
        return obs, float(reward), terminated, False, {
            'equity': self.equity, 'trades': self.trades, 'wins': self.wins,
        }
