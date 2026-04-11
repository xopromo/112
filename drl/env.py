"""
drl/env.py — торговая среда с поддержкой LONG и SHORT

Наблюдение (25 признаков):
  [0-19]  z-score нормализованные лог-доходности последних 20 баров
  [20]    ATR / close (режим волатильности)
  [21]    RSI(14) / 100
  [22]    Направление позиции: +1=лонг, 0=флэт, -1=шорт
  [23]    Нереализованный P&L / ATR (0 если флэт)
  [24]    Баров в сделке / 50 (нормализовано)

Действия:
  0 = HOLD   (оставить как есть)
  1 = LONG   (войти в лонг; если в шорте — закрыть и войти в лонг)
  2 = SHORT  (войти в шорт; если в лонге — закрыть и войти в шорт)
  3 = EXIT   (закрыть любую позицию)

Награда:
  % доходность за бар (mark-to-market, знак зависит от направления)
  штраф за вход = комиссия × COMMISSION_SCALE (борьба с over-trading)
  штраф при просадке > 15%
"""

import numpy as np
import gymnasium as gym
from gymnasium import spaces

MIN_HOLD_BARS    = 5   # нельзя выйти раньше чем через N баров после входа
COMMISSION_SCALE = 15  # агент "чувствует" комиссию в 15 раз сильнее


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

        self._atr = self._calc_atr(14)
        self._rsi = self._calc_rsi(14)
        self._start = max(window + 1, 30)

        self.observation_space = spaces.Box(
            low=-5.0, high=5.0, shape=(25,), dtype=np.float32
        )
        # 4 действия: 0=hold, 1=long, 2=short, 3=exit
        self.action_space = spaces.Discrete(4)

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

        unreal = 0.0
        if self.direction != 0 and self.entry_price > 0:
            # Для лонга: прибыль когда цена растёт
            # Для шорта: прибыль когда цена падает
            raw = (c0 - self.entry_price) / a0 * self.direction
            unreal = np.clip(raw, -5.0, 5.0)
        bars_n = np.clip(self.bars_in / 50.0, 0.0, 1.0)

        return np.concatenate([
            lr_norm,
            [
                np.clip(a0 / max(c0, 1e-8), 0.0, 5.0),
                self._rsi[i - 1] / 100.0,
                float(self.direction),   # -1, 0, или +1
                unreal,
                bars_n,
            ],
        ]).astype(np.float32)

    # ── Вспомогательный: открытие новой позиции ───────────────────

    def _open_position(self, direction, price):
        """direction: +1 (лонг) или -1 (шорт)"""
        self.direction   = direction
        self.entry_price = price
        self.bars_in     = 0
        self.equity     *= (1.0 - self.commission)
        self.trades     += 1
        return -self.commission * COMMISSION_SCALE

    def _close_position(self, price):
        """Закрыть текущую позицию. Вернуть P&L reward."""
        if self.direction == 0:
            return 0.0
        # Реализованный P&L с учётом направления
        raw_ret = (price - self.entry_price) / max(self.entry_price, 1e-8)
        trade_ret = raw_ret * self.direction - 2.0 * self.commission
        if trade_ret > 0:
            self.wins += 1
        self.equity     *= (1.0 - self.commission)
        self.direction   = 0
        self.entry_price = 0.0
        self.bars_in     = 0
        return -self.commission * COMMISSION_SCALE

    # ── Gymnasium API ─────────────────────────────────────────────

    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        self.bar          = self._start
        self.direction    = 0       # 0=флэт, +1=лонг, -1=шорт
        self.entry_price  = 0.0
        self.bars_in      = 0
        self.equity       = 1.0
        self.max_equity   = 1.0
        self.eq_curve     = [1.0]
        self.trades       = 0
        self.wins         = 0
        # для совместимости с логером в test_hypothesis.py
        self.in_trade     = False
        return self._obs(), {}

    def step(self, action):
        i   = self.bar
        c   = self.closes[i]
        c_p = self.closes[i - 1]

        reward      = 0.0
        can_exit    = self.bars_in >= MIN_HOLD_BARS
        step_ret_l  = (c - c_p) / max(c_p, 1e-8)   # доходность бара для лонга
        step_ret_s  = -step_ret_l                    # доходность бара для шорта

        # ── Mark-to-market ДО действия ──
        if self.direction == 1:
            self.equity *= (1.0 + step_ret_l)
            reward      += step_ret_l
            self.bars_in += 1
        elif self.direction == -1:
            self.equity *= (1.0 + step_ret_s)
            reward      += step_ret_s
            self.bars_in += 1

        # ── Исполнение действия ──
        if action == 1 and self.direction != 1:        # GO LONG
            if self.direction == -1 and can_exit:      # закрыть шорт
                reward += self._close_position(c)
            if self.direction == 0:                    # открыть лонг
                reward += self._open_position(1, c)

        elif action == 2 and self.direction != -1:     # GO SHORT
            if self.direction == 1 and can_exit:       # закрыть лонг
                reward += self._close_position(c)
            if self.direction == 0:                    # открыть шорт
                reward += self._open_position(-1, c)

        elif action == 3 and self.direction != 0 and can_exit:  # EXIT
            reward += self._close_position(c)

        # ── Обновляем in_trade для совместимости ──
        self.in_trade = (self.direction != 0)

        # ── Штраф за просадку > 15% ──
        self.max_equity = max(self.max_equity, self.equity)
        dd = (self.max_equity - self.equity) / max(self.max_equity, 1e-8)
        if dd > 0.15:
            reward -= dd * 0.1

        self.eq_curve.append(self.equity)
        self.bar  += 1
        terminated = self.bar >= self.n - 1

        # Принудительное закрытие в конце эпизода
        if terminated and self.direction != 0:
            c_last = self.closes[-1]
            raw    = (c_last - self.entry_price) / max(self.entry_price, 1e-8)
            if raw * self.direction - 2.0 * self.commission > 0:
                self.wins += 1
            self.equity  *= (1.0 - self.commission)
            self.direction = 0
            self.in_trade  = False

        obs = self._obs() if not terminated else np.zeros(25, dtype=np.float32)
        return obs, float(reward), terminated, False, {
            'equity':    self.equity,
            'trades':    self.trades,
            'wins':      self.wins,
            'direction': self.direction,
        }
