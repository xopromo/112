"""
drl/env.py — торговая среда с трендовыми и паттерн фичами (v3)

ДИЗАЙН:
  Действия: 0 = FLAT, 1 = LONG
  Комиссия платится при смене позиции.

НАБЛЮДЕНИЕ (30 признаков):
  [0-18]   z-score лог-доходности последних 19 баров
  [19]     ATR / close  (волатильность)
  [20]     RSI(14) / 100
  [21]     Текущая позиция (0 или 1)
  ── Трендовые фичи (новые) ──
  [22]     (close - EMA20) / ATR      ← насколько цена выше/ниже быстрой МА
  [23]     (close - EMA50) / ATR      ← насколько цена выше/ниже медленной МА
  [24]     sign(EMA20 - EMA50)        ← тренд вверх (+1) или вниз (-1)
  [25]     ADX(14) / 100              ← сила тренда (0=боковик, 1=сильный тренд)
  [26]     Bollinger %B               ← где цена в BB(20): 0=нижняя, 1=верхняя
  ── Паттерн сигналы (новые) ──
  [27]     Pivot Low в последних 8 барах (0/1)
  [28]     Pivot High в последних 8 барах (0/1)
  [29]     Momentum: (close - close[10]) / ATR  ← скорость движения

НАГРАДА:
  Когда LONG:  log(c_cur / c_prev) — лог-доходность бара
  Когда FLAT:  0
  При смене:   −commission
  При DD>20%:  −0.005 per bar
"""

import numpy as np
import gymnasium as gym
from gymnasium import spaces


class TradingEnv(gym.Env):
    metadata = {'render_modes': []}

    def __init__(self, df, commission=0.001, window=19, reward_comm_scale=10,
                 random_start=False):
        super().__init__()

        self.closes = df['close'].values.astype(np.float64)
        self.highs  = df['high'].values.astype(np.float64)
        self.lows   = df['low'].values.astype(np.float64)
        self.commission = commission
        self.reward_comm_scale = reward_comm_scale  # RL чувствует комиссию сильнее
        self.random_start = random_start  # случайный старт эпизода при обучении
        self.window = window
        self.n      = len(self.closes)

        # Предвычисляем все индикаторы один раз
        self._atr   = self._calc_atr(14)
        self._rsi   = self._calc_rsi(14)
        self._ema20 = self._calc_ema(20)
        self._ema50 = self._calc_ema(50)
        self._adx   = self._calc_adx(14)
        self._bb_b  = self._calc_bb_b(20)  # Bollinger %B
        self._pvlo  = self._calc_pivots(pvl=3, pvr=3, mode='low')
        self._pvhi  = self._calc_pivots(pvl=3, pvr=3, mode='high')

        self._start = max(window + 2, 55)  # прогрев EMA50

        self.action_space      = spaces.Discrete(2)
        self.observation_space = spaces.Box(
            low=-5.0, high=5.0, shape=(30,), dtype=np.float32
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

    def _calc_ema(self, period):
        ema = np.zeros(self.n)
        ema[0] = self.closes[0]
        alpha = 2.0 / (period + 1)
        for i in range(1, self.n):
            ema[i] = alpha * self.closes[i] + (1 - alpha) * ema[i-1]
        return ema

    def _calc_adx(self, period=14):
        """Wilder ADX: мера силы тренда, 0..100."""
        n  = self.n
        dm_p = np.zeros(n)   # +DM
        dm_m = np.zeros(n)   # -DM
        tr   = np.zeros(n)

        for i in range(1, n):
            h_diff = self.highs[i]  - self.highs[i-1]
            l_diff = self.lows[i-1] - self.lows[i]
            tr[i]   = max(self.highs[i] - self.lows[i],
                          abs(self.highs[i] - self.closes[i-1]),
                          abs(self.lows[i]  - self.closes[i-1]))
            dm_p[i] = max(h_diff, 0) if h_diff > l_diff else 0
            dm_m[i] = max(l_diff, 0) if l_diff > h_diff else 0

        # Wilder RMA сглаживание
        atr_w  = np.zeros(n)
        dmp_w  = np.zeros(n)
        dmm_w  = np.zeros(n)
        if n > period:
            atr_w[period]  = tr[1:period+1].sum()
            dmp_w[period]  = dm_p[1:period+1].sum()
            dmm_w[period]  = dm_m[1:period+1].sum()
        a = 1.0 / period
        for i in range(period + 1, n):
            atr_w[i] = atr_w[i-1] - atr_w[i-1]*a + tr[i]
            dmp_w[i] = dmp_w[i-1] - dmp_w[i-1]*a + dm_p[i]
            dmm_w[i] = dmm_w[i-1] - dmm_w[i-1]*a + dm_m[i]

        with np.errstate(divide='ignore', invalid='ignore'):
            di_p   = np.where(atr_w > 0, 100 * dmp_w / atr_w, 0)
            di_m   = np.where(atr_w > 0, 100 * dmm_w / atr_w, 0)
            di_sum = di_p + di_m
            dx     = np.where(di_sum > 0, 100 * np.abs(di_p - di_m) / di_sum, 0)

        adx = np.zeros(n)
        start2 = period * 2
        if n > start2:
            adx[start2] = dx[period+1:start2+1].mean()
        for i in range(start2 + 1, n):
            adx[i] = (adx[i-1] * (period-1) + dx[i]) / period
        return adx

    def _calc_bb_b(self, period=20):
        """%B = (close - lower) / (upper - lower), клипируется в [-0.5, 1.5]."""
        bb_b = np.full(self.n, 0.5)
        for i in range(period, self.n):
            sl = self.closes[i-period:i]
            mean, std = sl.mean(), sl.std() + 1e-8
            upper = mean + 2 * std
            lower = mean - 2 * std
            bb_b[i] = (self.closes[i] - lower) / (upper - lower)
        return np.clip(bb_b, -0.5, 1.5)

    def _calc_pivots(self, pvl=3, pvr=3, mode='low'):
        """
        Возвращает булев массив: True = на баре i был подтверждён пивот.
        Индекс = confirmation bar (= pivot bar + pvr).
        """
        sig = np.zeros(self.n, dtype=bool)
        src = self.lows if mode == 'low' else self.highs
        for i in range(pvl + pvr, self.n):
            idx = i - pvr        # сам пивот
            v   = src[idx]
            ok  = True
            if mode == 'low':
                for j in range(idx - pvl, idx):
                    if src[j] < v:  ok = False; break
                if ok:
                    for j in range(idx + 1, idx + pvr + 1):
                        if j < self.n and src[j] <= v:  ok = False; break
            else:
                for j in range(idx - pvl, idx):
                    if src[j] > v:  ok = False; break
                if ok:
                    for j in range(idx + 1, idx + pvr + 1):
                        if j < self.n and src[j] >= v:  ok = False; break
            sig[i] = ok
        return sig

    # ── Наблюдение ────────────────────────────────────────────────

    def _obs(self):
        i  = min(self.bar, self.n - 1)
        c0 = self.closes[i - 1]
        a0 = max(self._atr[i - 1], 1e-8)

        # [0-18] z-score лог-доходности
        lr = np.array([
            np.log(max(self.closes[i - self.window + k], 1e-10) /
                   max(self.closes[i - self.window + k - 1], 1e-10))
            for k in range(self.window)
        ])
        std  = lr.std() + 1e-8
        lr_n = np.clip((lr - lr.mean()) / std, -5.0, 5.0)

        # [19] ATR-режим
        atr_f = np.clip(a0 / max(c0, 1e-8), 0, 5)

        # [20] RSI
        rsi_f = self._rsi[i-1] / 100.0

        # [21] Позиция
        pos_f = float(self.in_long)

        # [22] (close - EMA20) / ATR
        e20_f = np.clip((c0 - self._ema20[i-1]) / a0, -5, 5)

        # [23] (close - EMA50) / ATR
        e50_f = np.clip((c0 - self._ema50[i-1]) / a0, -5, 5)

        # [24] Тренд: +1 (EMA20>EMA50), -1 (EMA20<EMA50)
        trend_f = np.sign(self._ema20[i-1] - self._ema50[i-1])

        # [25] ADX / 100
        adx_f = np.clip(self._adx[i-1] / 100.0, 0, 1)

        # [26] Bollinger %B
        bb_f = np.clip(self._bb_b[i-1], -0.5, 1.5)

        # [27] Pivot Low в последних 8 барах
        pv_lo = float(self._pvlo[max(0, i-8):i].any())

        # [28] Pivot High в последних 8 барах
        pv_hi = float(self._pvhi[max(0, i-8):i].any())

        # [29] Momentum: (close - close[-10]) / ATR
        c10 = self.closes[max(0, i - 11)]
        mom_f = np.clip((c0 - c10) / a0, -5, 5)

        return np.array([
            *lr_n,
            atr_f, rsi_f, pos_f,
            e20_f, e50_f, trend_f, adx_f, bb_f,
            pv_lo, pv_hi, mom_f,
        ], dtype=np.float32)

    # ── Gymnasium API ─────────────────────────────────────────────

    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        # Случайный старт эпизода при обучении: агент видит разные участки
        if self.random_start and self.n - self._start > 400:
            max_start = self.n - 200
            self.bar = int(self.np_random.integers(self._start, max_start))
        else:
            self.bar = self._start
        self.in_long     = False
        self.entry_bar   = 0
        self.entry_price = 0.0
        self.equity      = 1.0
        self.max_equity  = 1.0
        self.eq_curve    = [1.0]
        self.trades      = 0
        self.wins        = 0
        self.in_trade    = False
        self.direction   = 0
        return self._obs(), {}

    def step(self, action):
        i   = self.bar
        c   = self.closes[i]
        c_p = self.closes[i - 1]

        reward    = 0.0
        want_long = bool(action == 1)

        if want_long and not self.in_long:          # FLAT → LONG
            self.equity     *= (1.0 - self.commission)
            reward          -= self.commission * self.reward_comm_scale
            self.in_long     = True
            self.entry_bar   = i
            self.entry_price = c
            self.trades     += 1

        elif not want_long and self.in_long:         # LONG → FLAT
            self.equity    *= (1.0 - self.commission)
            reward         -= self.commission * self.reward_comm_scale
            if c / self.entry_price - 1.0 - 2*self.commission > 0:
                self.wins += 1
            self.in_long = False

        if self.in_long:
            log_ret = np.log(max(c, 1e-10) / max(c_p, 1e-10))
            self.equity *= np.exp(log_ret)
            reward      += log_ret

        self.max_equity = max(self.max_equity, self.equity)
        dd = (self.max_equity - self.equity) / max(self.max_equity, 1e-8)
        if dd > 0.20:
            reward -= 0.005

        self.eq_curve.append(self.equity)
        self.in_trade  = self.in_long
        self.direction = 1 if self.in_long else 0
        self.bar      += 1
        terminated     = self.bar >= self.n - 1

        if terminated and self.in_long:
            c_last = self.closes[-1]
            if c_last / self.entry_price - 1.0 - 2*self.commission > 0:
                self.wins += 1
            self.equity  *= (1.0 - self.commission)
            self.in_long  = False

        obs = self._obs() if not terminated else np.zeros(30, dtype=np.float32)
        return obs, float(reward), terminated, False, {
            'equity': self.equity, 'trades': self.trades, 'wins': self.wins,
        }
