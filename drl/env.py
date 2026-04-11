"""
drl/env.py — минимальная торговая среда для проверки DRL гипотезы

Наблюдение (25 признаков):
  [0-19]  z-score нормализованные лог-доходности последних 20 баров
  [20]    ATR / close (режим волатильности)
  [21]    RSI(14) / 100
  [22]    В позиции (0 или 1)
  [23]    Нереализованный P&L / ATR (0 если флэт)
  [24]    Баров в сделке / 50 (нормализовано)

Действия:
  0 = HOLD  (ничего не делать)
  1 = LONG  (войти в лонг; игнорируется если уже в позиции)
  2 = EXIT  (выйти; запрещён в первые MIN_HOLD_BARS баров)

Награда:
  % доходность за бар (mark-to-market) пока в позиции
  сильный штраф при каждом входе (= 10x комиссия) — борьба с over-trading
  штраф при просадке > 15%
"""

import numpy as np
import gymnasium as gym
from gymnasium import spaces

# Агент не может выйти раньше чем через N баров после входа.
# Это физически запрещает 1-2-барные сделки которые убиваются комиссией.
MIN_HOLD_BARS = 5

# Штраф за вход = реальная комиссия × этот множитель.
# Агент "чувствует" комиссию в 15 раз сильнее — учится не торговать зря.
COMMISSION_SCALE = 15


class TradingEnv(gym.Env):
    metadata = {'render_modes': []}

    def __init__(self, df, commission=0.001, window=20):
        super().__init__()

        self.closes = df['close'].values.astype(np.float64)
        self.highs  = df['high'].values.astype(np.float64)
        self.lows   = df['low'].values.astype(np.float64)
        self.commission = commission
        self.window  = window
        self.n       = len(self.closes)

        # Предвычисляем индикаторы (Wilder RMA — совпадает с core.js)
        self._atr = self._calc_atr(14)
        self._rsi = self._calc_rsi(14)

        self._start = max(window + 1, 30)

        self.observation_space = spaces.Box(
            low=-5.0, high=5.0, shape=(25,), dtype=np.float32
        )
        self.action_space = spaces.Discrete(3)

    # ── Индикаторы ────────────────────────────────────────────────

    def _calc_atr(self, period=14):
        n   = self.n
        tr  = np.zeros(n)
        atr = np.zeros(n)
        for i in range(1, n):
            tr[i] = max(
                self.highs[i]  - self.lows[i],
                abs(self.highs[i]  - self.closes[i - 1]),
                abs(self.lows[i]   - self.closes[i - 1]),
            )
        if n > period:
            atr[period] = tr[1:period + 1].mean()
        alpha = 1.0 / period
        for i in range(period + 1, n):
            atr[i] = alpha * tr[i] + (1.0 - alpha) * atr[i - 1]
        return atr

    def _calc_rsi(self, period=14):
        n   = self.n
        rsi = np.full(n, 50.0)
        avg_u = avg_d = 0.0
        for i in range(1, n):
            chg = self.closes[i] - self.closes[i - 1]
            u, d = max(chg, 0.0), max(-chg, 0.0)
            if i <= period:
                avg_u += u / period
                avg_d += d / period
                if i == period and avg_d > 0:
                    rsi[i] = 100.0 - 100.0 / (1.0 + avg_u / avg_d)
            else:
                avg_u = (avg_u * (period - 1) + u) / period
                avg_d = (avg_d * (period - 1) + d) / period
                rsi[i] = 100.0 - 100.0 / (1.0 + avg_u / avg_d) if avg_d > 0 else 100.0
        return rsi

    # ── Наблюдение ────────────────────────────────────────────────

    def _obs(self):
        i  = min(self.bar, self.n - 1)
        c0 = self.closes[i - 1]
        a0 = max(self._atr[i - 1], 1e-8)

        # Лог-доходности (window баров), z-score нормализация
        lr = np.zeros(self.window, dtype=np.float64)
        for k in range(self.window):
            bi = i - self.window + k
            if bi >= 1:
                ca = self.closes[bi - 1]
                cb = self.closes[bi]
                if ca > 0 and cb > 0:
                    lr[k] = np.log(cb / ca)
        std = lr.std() + 1e-8
        lr_norm = np.clip((lr - lr.mean()) / std, -5.0, 5.0)

        # Портфельное состояние
        in_tr  = float(self.in_trade)
        unreal = 0.0
        if self.in_trade and self.entry_price > 0:
            unreal = np.clip((c0 - self.entry_price) / a0, -5.0, 5.0)
        bars_n = np.clip(self.bars_in / 50.0, 0.0, 1.0)

        return np.concatenate([
            lr_norm,
            [
                np.clip(a0 / max(c0, 1e-8), 0.0, 5.0),  # ATR-режим
                self._rsi[i - 1] / 100.0,                # RSI
                in_tr,
                unreal,
                bars_n,
            ],
        ]).astype(np.float32)

    # ── Gymnasium API ─────────────────────────────────────────────

    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        self.bar          = self._start
        self.in_trade     = False
        self.entry_price  = 0.0
        self.bars_in      = 0
        self.equity       = 1.0
        self.max_equity   = 1.0
        self.eq_curve     = [1.0]
        self.trades       = 0
        self.wins         = 0
        return self._obs(), {}

    def step(self, action):
        i     = self.bar
        c     = self.closes[i]       # текущий close (цена исполнения)
        c_p   = self.closes[i - 1]   # предыдущий close

        reward = 0.0

        # ── Вход ──
        if action == 1 and not self.in_trade:
            self.in_trade    = True
            self.entry_price = c
            self.bars_in     = 0
            self.equity     *= (1.0 - self.commission)
            # Штраф усиленный — агент должен ОЧЕНЬ хотеть войти чтобы
            # оправдать этот штраф. Учит не торговать каждый бар.
            reward          -= self.commission * COMMISSION_SCALE
            self.trades     += 1

        # ── Выход (только после MIN_HOLD_BARS баров в позиции) ──
        elif action == 2 and self.in_trade and self.bars_in >= MIN_HOLD_BARS:
            step_ret = (c - c_p) / max(c_p, 1e-8)
            self.equity *= (1.0 + step_ret) * (1.0 - self.commission)
            reward      += step_ret - self.commission * COMMISSION_SCALE

            trade_ret = (c / self.entry_price) - 1.0 - 2.0 * self.commission
            if trade_ret > 0:
                self.wins += 1

            self.in_trade    = False
            self.entry_price = 0.0
            self.bars_in     = 0

        # ── Держим позицию: mark-to-market ──
        elif self.in_trade:
            step_ret = (c - c_p) / max(c_p, 1e-8)
            self.equity *= (1.0 + step_ret)
            reward      += step_ret
            self.bars_in += 1

        # ── Штраф за просадку > 15% ──
        self.max_equity = max(self.max_equity, self.equity)
        dd = (self.max_equity - self.equity) / max(self.max_equity, 1e-8)
        if dd > 0.15:
            reward -= dd * 0.1

        self.eq_curve.append(self.equity)
        self.bar += 1
        terminated = self.bar >= self.n - 1

        # Принудительное закрытие в конце эпизода
        if terminated and self.in_trade:
            c_last    = self.closes[-1]
            trade_ret = (c_last / self.entry_price) - 1.0 - 2.0 * self.commission
            if trade_ret > 0:
                self.wins += 1
            self.equity  *= (c_last / c) * (1.0 - self.commission)
            self.in_trade = False

        obs = self._obs() if not terminated else np.zeros(25, dtype=np.float32)
        return obs, float(reward), terminated, False, {
            'equity': self.equity,
            'trades': self.trades,
            'wins':   self.wins,
        }
