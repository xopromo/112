#!/usr/bin/env python3
"""
drl/test_hypothesis.py — проверка гипотезы DRL агента

ВОПРОС: Способен ли агент торговать в плюс на данных, которых он НЕ видел?

Что делает:
  1. Загружает CSV (OHLCV из TradingView)
  2. Делит 70% IS / 30% OOS
  3. Обучает PPO агента на IS (не видит OOS ни разу)
  4. Тестирует на OOS — это и есть ответ
  5. Выводит вердикт

Запуск:
  pip install -r drl/requirements.txt
  python drl/test_hypothesis.py                        # test_data/ohlcv.csv, 200K шагов
  python drl/test_hypothesis.py data.csv               # свой файл
  python drl/test_hypothesis.py data.csv --steps 500000  # дольше = лучше
"""

import sys
import os
import argparse

import numpy as np
import pandas as pd

# ── Импорт среды ───────────────────────────────────────────────────────────────
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from drl.env import TradingEnv


def load_csv(path):
    df = pd.read_csv(path)
    df.columns = [c.lower().strip() for c in df.columns]
    rename = {'o': 'open', 'h': 'high', 'l': 'low', 'c': 'close', 'v': 'volume'}
    df = df.rename(columns=rename)
    for col in ['open', 'high', 'low', 'close']:
        if col not in df.columns:
            raise ValueError(f'Колонка "{col}" не найдена. Есть: {list(df.columns)}')
    df = df[['open', 'high', 'low', 'close']].dropna().reset_index(drop=True)
    df = df.astype(float)
    return df


def calc_metrics(eq_curve):
    """Sharpe (annуализованный), доходность %, max drawdown %."""
    eq = np.array(eq_curve, dtype=np.float64)
    if len(eq) < 2:
        return 0.0, 0.0, 0.0
    rets = np.diff(eq) / np.maximum(eq[:-1], 1e-10)
    mean_r = rets.mean()
    std_r  = rets.std() + 1e-10
    sharpe = (mean_r / std_r) * np.sqrt(252)
    total  = (eq[-1] / max(eq[0], 1e-10) - 1.0) * 100.0
    running_max = np.maximum.accumulate(eq)
    dd = ((running_max - eq) / np.maximum(running_max, 1e-10)).max() * 100.0
    return round(sharpe, 2), round(total, 1), round(dd, 1)


def evaluate(model, df, label, commission=0.001):
    """Прогнать обученную модель на df, вывести метрики."""
    from stable_baselines3 import PPO  # импорт здесь, чтобы не мешал --help

    env = TradingEnv(df, commission=commission)
    obs, _ = env.reset()
    done = False
    while not done:
        action, _ = model.predict(obs, deterministic=True)
        obs, _, done, _, _ = env.step(int(action))

    sharpe, ret, dd = calc_metrics(env.eq_curve)
    wr = (env.wins / max(env.trades, 1)) * 100.0

    # Buy & Hold baseline: от стартового бара до конца
    bh_start = env.closes[env._start]
    bh_end   = env.closes[-1]
    bh_ret   = (bh_end / max(bh_start, 1e-10) - 1.0) * 100.0

    print(f'\n  {"─" * 46}')
    print(f'  {label}')
    print(f'  {"─" * 46}')
    print(f'  Sharpe:        {sharpe:+.2f}')
    print(f'  Доходность:    {ret:+.1f}%')
    print(f'  Max Drawdown:  {dd:.1f}%')
    print(f'  Сделок:        {env.trades}  (Win Rate {wr:.0f}%)')
    print(f'  Buy & Hold:    {bh_ret:+.1f}%')

    return sharpe, ret, dd, env.trades


def main():
    parser = argparse.ArgumentParser(
        description='DRL гипотеза: торгует ли агент в плюс на новых данных?'
    )
    parser.add_argument('csv', nargs='?', default='test_data/ohlcv.csv',
                        help='Путь к OHLCV CSV (default: test_data/ohlcv.csv)')
    parser.add_argument('--steps', type=int, default=200_000,
                        help='Шагов обучения PPO (default: 200000, быстрее = 50000)')
    parser.add_argument('--commission', type=float, default=0.001,
                        help='Комиссия на сторону, напр. 0.001 = 0.1%%')
    parser.add_argument('--split', type=float, default=0.70,
                        help='Доля IS данных (default: 0.70)')
    args = parser.parse_args()

    # ── Зависимости (импортируем поздно, чтобы --help работал без torch) ──────
    try:
        from stable_baselines3 import PPO
        from stable_baselines3.common.callbacks import BaseCallback
    except ImportError:
        print('❌ Установи зависимости:\n   pip install -r drl/requirements.txt')
        sys.exit(1)

    # ── Загрузка данных ───────────────────────────────────────────────────────
    csv_path = args.csv
    if not os.path.exists(csv_path):
        print(f'❌ Файл не найден: {csv_path}')
        sys.exit(1)

    print(f'\n📂 Данные: {csv_path}')
    df    = load_csv(csv_path)
    n     = len(df)
    split = int(n * args.split)

    df_is  = df.iloc[:split].reset_index(drop=True)
    df_oos = df.iloc[split:].reset_index(drop=True)

    print(f'   Всего баров:    {n}')
    print(f'   IS  (обучение): {len(df_is)} баров  [{0}..{split-1}]')
    print(f'   OOS (проверка): {len(df_oos)} баров  [{split}..{n-1}]')
    print(f'   Шагов PPO:      {args.steps:,}')
    print(f'   Комиссия:       {args.commission*100:.2f}% на сторону')

    MIN_BARS = 60
    if len(df_is) < MIN_BARS or len(df_oos) < MIN_BARS:
        print(f'\n❌ Слишком мало данных (нужно ≥ {MIN_BARS * 2} баров)')
        sys.exit(1)

    # ── Обучение ──────────────────────────────────────────────────────────────

    class ProgressCB(BaseCallback):
        """Печатает прогресс обучения каждые 20%."""
        def __init__(self, total):
            super().__init__()
            self.total      = total
            self.milestones = [int(total * p) for p in (0.2, 0.4, 0.6, 0.8, 1.0)]
            self.next_idx   = 0

        def _on_step(self):
            if self.next_idx < len(self.milestones):
                if self.num_timesteps >= self.milestones[self.next_idx]:
                    pct = int(100 * self.milestones[self.next_idx] / self.total)
                    print(f'   {self.num_timesteps:>9,} шагов ({pct}%)')
                    self.next_idx += 1
            return True

    print(f'\n🚀 Обучение PPO на IS данных...')
    env_is = TradingEnv(df_is, commission=args.commission)

    model = PPO(
        'MlpPolicy',
        env_is,
        learning_rate  = 3e-4,
        n_steps        = 1024,
        batch_size     = 64,
        n_epochs       = 10,
        gamma          = 0.99,
        gae_lambda     = 0.95,
        clip_range     = 0.2,
        ent_coef       = 0.01,   # энтропийный бонус → исследование → устойчивость
        policy_kwargs  = dict(net_arch=[128, 64]),
        verbose        = 0,
    )
    model.learn(total_timesteps=args.steps, callback=ProgressCB(args.steps))
    print('✅ Обучение завершено')

    # ── Оценка ────────────────────────────────────────────────────────────────
    evaluate(model, df_is,  'IS  — обучающие данные (ожидаем хорошо)',
             args.commission)
    sharpe_oos, ret_oos, dd_oos, trades_oos = evaluate(
        model, df_oos,
        'OOS — данные которых агент НЕ ВИДЕЛ (ключевой ответ)',
        args.commission,
    )

    # ── Вердикт ───────────────────────────────────────────────────────────────
    print(f'\n  {"═" * 46}')
    print(f'  ГИПОТЕЗА: агент торгует в плюс на новых данных?')
    print(f'  {"═" * 46}')

    if sharpe_oos >= 1.0 and ret_oos > 0 and trades_oos >= 5:
        verdict = '✅ ДА, гипотеза подтверждена'
    elif ret_oos > 0 and trades_oos >= 3:
        verdict = '⚠️  СЛАБО — прибыль есть, но Sharpe < 1.0'
    else:
        verdict = '❌ НЕТ — агент не смог обобщить на новые данные'

    print(f'  {verdict}')
    print(f'  Sharpe OOS = {sharpe_oos:+.2f}  |  Return OOS = {ret_oos:+.1f}%')
    print(f'  {"═" * 46}')

    if sharpe_oos < 0.5:
        print('\n  Советы если не работает:')
        print('  • Больше данных (нужно 2000+ баров)')
        print('  • Больше шагов: --steps 500000')
        print('  • Другой инструмент (не все торгуются одинаково)')
        print('  • Проверь колонки CSV: нужны open/high/low/close')
    print()


if __name__ == '__main__':
    main()
