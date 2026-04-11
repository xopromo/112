#!/usr/bin/env python3
"""
drl/test_hypothesis.py — проверка гипотезы DRL агента

ВОПРОС: Способен ли агент торговать в плюс на данных, которых он НЕ видел?

МЕТОД: Walk-forward — 5 скользящих окон вместо одного разреза 70/30.
  Каждое окно:  учёба на 60% данных  →  тест на следующих 10%
  Смысл: в каждой учёбе есть и рост и коррекции, нет смещения режима.

ЗАПУСК:
  python drl/test_hypothesis.py                         # test_data/ohlcv.csv
  python drl/test_hypothesis.py my_data.csv
  python drl/test_hypothesis.py my_data.csv --steps 200000
"""

import sys
import os
import argparse

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from drl.env import TradingEnv


# ── Утилиты ────────────────────────────────────────────────────────────────────

def load_csv(path):
    df = pd.read_csv(path)
    df.columns = [c.lower().strip() for c in df.columns]
    rename = {'o': 'open', 'h': 'high', 'l': 'low', 'c': 'close', 'v': 'volume'}
    df = df.rename(columns=rename)
    for col in ['open', 'high', 'low', 'close']:
        if col not in df.columns:
            raise ValueError(f'Колонка "{col}" не найдена. Есть: {list(df.columns)}')
    return df[['open', 'high', 'low', 'close']].dropna().reset_index(drop=True).astype(float)


def calc_metrics(eq_curve):
    eq = np.array(eq_curve, dtype=np.float64)
    if len(eq) < 2:
        return 0.0, 0.0, 0.0
    rets   = np.diff(eq) / np.maximum(eq[:-1], 1e-10)
    sharpe = (rets.mean() / (rets.std() + 1e-10)) * np.sqrt(252)
    total  = (eq[-1] / max(eq[0], 1e-10) - 1.0) * 100.0
    dd     = ((np.maximum.accumulate(eq) - eq) / np.maximum.accumulate(eq)).max() * 100.0
    return round(sharpe, 2), round(total, 1), round(dd, 1)


def run_episode(model, df, commission):
    """Прогнать модель на df, вернуть (sharpe, return%, dd%, n_trades, eq_curve)."""
    env  = TradingEnv(df, commission=commission)
    obs, _ = env.reset()
    done = False
    while not done:
        action, _ = model.predict(obs, deterministic=True)
        obs, _, done, _, _ = env.step(int(action))
    sharpe, ret, dd = calc_metrics(env.eq_curve)
    bh = (df['close'].iloc[-1] / df['close'].iloc[env._start] - 1.0) * 100.0
    return sharpe, ret, dd, env.trades, env.eq_curve, bh


# ── Обучение одного агента ────────────────────────────────────────────────────

def train_agent(df_train, steps, commission, prefix=''):
    from stable_baselines3 import PPO
    from stable_baselines3.common.callbacks import BaseCallback

    class ProgressCB(BaseCallback):
        def __init__(self, total, pfx):
            super().__init__()
            self.total    = total
            self.prefix   = pfx
            self.marks    = [int(total * p) for p in (0.5, 1.0)]
            self.next_idx = 0
        def _on_step(self):
            if self.next_idx < len(self.marks):
                if self.num_timesteps >= self.marks[self.next_idx]:
                    print(f'    {self.prefix}{self.num_timesteps:,} / {self.total:,}')
                    self.next_idx += 1
            return True

    env   = TradingEnv(df_train, commission=commission)
    model = PPO(
        'MlpPolicy', env,
        learning_rate = 3e-4,
        n_steps       = 1024,
        batch_size    = 64,
        n_epochs      = 10,
        gamma         = 0.99,
        gae_lambda    = 0.95,
        clip_range    = 0.2,
        ent_coef      = 0.005,
        policy_kwargs = dict(net_arch=[128, 64]),
        verbose       = 0,
    )
    model.learn(total_timesteps=steps,
                callback=ProgressCB(steps, prefix))
    return model


# ── Walk-forward ──────────────────────────────────────────────────────────────

def walk_forward(df, n_windows, train_frac, steps, commission):
    """
    Скользящие окна:
      train_end  = train_frac  доли данных для первого окна
      test_size  = (1 - train_frac) / n_windows  доли данных на одно тест-окно
      Каждое следующее окно сдвигается на test_size вперёд.
    """
    n        = len(df)
    test_sz  = int(n * (1.0 - train_frac) / n_windows)
    train_sz = int(n * train_frac)

    if test_sz < 100:
        raise ValueError('Слишком мало данных для walk-forward. Нужно 2000+ баров.')

    results = []
    print(f'\n  Walk-forward: {n_windows} окон')
    print(f'  Учёба: {train_sz} баров  |  Тест: {test_sz} баров на окно\n')

    for w in range(n_windows):
        train_start = w * test_sz
        train_end   = train_start + train_sz
        test_end    = train_end + test_sz

        if test_end > n:
            break

        df_train = df.iloc[train_start:train_end].reset_index(drop=True)
        df_test  = df.iloc[train_end:test_end].reset_index(drop=True)

        bh_train = (df_train['close'].iloc[-1] / df_train['close'].iloc[0] - 1) * 100
        bh_test  = (df_test['close'].iloc[-1]  / df_test['close'].iloc[0]  - 1) * 100

        print(f'  Окно {w+1}/{n_windows}: '
              f'учёба [{train_start}..{train_end}] B&H={bh_train:+.0f}%  '
              f'→ тест [{train_end}..{test_end}] B&H={bh_test:+.0f}%')

        model = train_agent(df_train, steps, commission, f'w{w+1} ')

        sh_is, ret_is, dd_is, tr_is, _, _ = run_episode(model, df_train, commission)
        sh_oos, ret_oos, dd_oos, tr_oos, eq_oos, _ = run_episode(model, df_test, commission)

        print(f'    IS:  Sharpe {sh_is:+.2f}  Return {ret_is:+.1f}%  Trades {tr_is}')
        print(f'    OOS: Sharpe {sh_oos:+.2f}  Return {ret_oos:+.1f}%  Trades {tr_oos}'
              f'  B&H {bh_test:+.1f}%')
        results.append({
            'window':    w + 1,
            'sh_oos':    sh_oos,
            'ret_oos':   ret_oos,
            'dd_oos':    dd_oos,
            'trades':    tr_oos,
            'bh_test':   bh_test,
            'eq_oos':    eq_oos,
        })
        print()

    return results


# ── График walk-forward ───────────────────────────────────────────────────────

def plot_walkforward(results, out_path):
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
    except ImportError:
        print('  (matplotlib не установлен — график пропущен)')
        return

    n = len(results)
    fig, axes = plt.subplots(1, n, figsize=(4 * n, 5), sharey=False)
    if n == 1:
        axes = [axes]

    fig.suptitle('DRL Agent — Walk-Forward OOS Results', fontsize=13, fontweight='bold')

    for ax, r in zip(axes, results):
        eq = r['eq_oos']
        xs = range(len(eq))
        color = '#2196F3' if r['ret_oos'] > 0 else '#F44336'
        ax.plot(xs, eq, color=color, linewidth=2)
        ax.axhline(1.0, color='black', linewidth=0.5, linestyle='--', alpha=0.5)
        ax.set_facecolor('#F9FBE7' if r['ret_oos'] > 0 else '#FFF3E0')
        ax.set_title(
            f'Window {r["window"]}\n'
            f'Return: {r["ret_oos"]:+.1f}%\n'
            f'Sharpe: {r["sh_oos"]:+.2f}  B&H: {r["bh_test"]:+.1f}%',
            fontsize=10,
        )
        ax.set_xlabel('Bar')
        ax.set_ylabel('Equity (start=1.0)')
        ax.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig(out_path, dpi=120, bbox_inches='tight')
    print(f'  Graph saved: {out_path}')


# ── Главная функция ────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('csv', nargs='?', default='test_data/ohlcv.csv')
    parser.add_argument('--steps',      type=int,   default=100_000,
                        help='PPO steps per window (default: 100000)')
    parser.add_argument('--windows',    type=int,   default=5,
                        help='Walk-forward windows (default: 5)')
    parser.add_argument('--train-frac', type=float, default=0.60,
                        help='Train fraction per window (default: 0.60)')
    parser.add_argument('--commission', type=float, default=0.001)
    args = parser.parse_args()

    try:
        from stable_baselines3 import PPO  # noqa: F401
    except ImportError:
        print('pip install -r drl/requirements.txt')
        sys.exit(1)

    if not os.path.exists(args.csv):
        print(f'File not found: {args.csv}')
        sys.exit(1)

    print(f'\nData: {args.csv}')
    df = load_csv(args.csv)
    print(f'Bars: {len(df)}  |  Steps/window: {args.steps:,}  |  Windows: {args.windows}')

    results = walk_forward(
        df,
        n_windows  = args.windows,
        train_frac = args.train_frac,
        steps      = args.steps,
        commission = args.commission,
    )

    if not results:
        print('Not enough data.')
        sys.exit(1)

    # ── Итог ──────────────────────────────────────────────────────────────────
    avg_sh  = np.mean([r['sh_oos']  for r in results])
    avg_ret = np.mean([r['ret_oos'] for r in results])
    avg_dd  = np.mean([r['dd_oos']  for r in results])
    pos_oos = sum(1 for r in results if r['ret_oos'] > 0)

    print(f'  {"=" * 50}')
    print(f'  WALK-FORWARD SUMMARY ({len(results)} windows)')
    print(f'  {"=" * 50}')
    print(f'  Avg Sharpe OOS:   {avg_sh:+.2f}')
    print(f'  Avg Return OOS:   {avg_ret:+.1f}%')
    print(f'  Avg Drawdown OOS: {avg_dd:.1f}%')
    print(f'  Profitable:       {pos_oos}/{len(results)} windows')
    print(f'  {"=" * 50}')

    if avg_sh >= 0.5 and pos_oos >= len(results) * 0.6:
        verdict = 'YES — hypothesis confirmed'
    elif avg_ret > 0 and pos_oos >= len(results) * 0.5:
        verdict = 'WEAK — profitable but Sharpe < 0.5'
    else:
        verdict = 'NO — agent did not generalize'

    print(f'  Verdict: {verdict}')
    print(f'  {"=" * 50}\n')

    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'result.png')
    plot_walkforward(results, out)


if __name__ == '__main__':
    main()
