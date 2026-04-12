#!/usr/bin/env python3
"""
drl/test_hypothesis.py — проверка гипотезы DRL агента (walk-forward)

ВОПРОС: Способен ли агент торговать в плюс на данных, которых он НЕ видел?

МЕТОД: Walk-forward — N скользящих окон.
  Каждое окно: учёба на 60% данных → тест на следующих 10%.
  Нет смещения режима (каждый тест-период разный).

ЗАПУСК:
  python drl/test_hypothesis.py                          # встроенные данные
  python drl/test_hypothesis.py data.csv
  python drl/test_hypothesis.py data.csv --steps 200000
"""

import sys, os, argparse
import numpy as np, pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from drl.env import TradingEnv


def load_csv(path):
    df = pd.read_csv(path)
    df.columns = [c.lower().strip() for c in df.columns]
    df = df.rename(columns={'o':'open','h':'high','l':'low','c':'close','v':'volume'})
    for col in ['open','high','low','close']:
        if col not in df.columns:
            raise ValueError(f'Column "{col}" not found. Available: {list(df.columns)}')
    return df[['open','high','low','close']].dropna().reset_index(drop=True).astype(float)


def calc_metrics(eq_curve):
    eq = np.array(eq_curve, dtype=np.float64)
    if len(eq) < 2: return 0.0, 0.0, 0.0
    rets   = np.diff(eq) / np.maximum(eq[:-1], 1e-10)
    sharpe = (rets.mean() / (rets.std() + 1e-10)) * np.sqrt(252)
    total  = (eq[-1] / max(eq[0], 1e-10) - 1.0) * 100.0
    dd     = ((np.maximum.accumulate(eq) - eq) / np.maximum.accumulate(eq)).max() * 100.0
    return round(sharpe, 2), round(total, 1), round(dd, 1)


def run_episode(model, df, commission):
    """Прогнать модель, вернуть метрики + лог сделок."""
    # reward_comm_scale=1 при оценке: используем реальную комиссию для equity
    env = TradingEnv(df, commission=commission, reward_comm_scale=1)
    obs, _ = env.reset()
    done = False

    trades_log = []
    prev_in_long = False
    entry_bar = entry_px = 0

    bar = env._start
    while not done:
        action, _ = model.predict(obs, deterministic=True)
        want_long = bool(int(action) == 1)
        px = df['close'].iloc[min(bar, len(df)-1)]

        # Вход
        if want_long and not prev_in_long:
            entry_bar = bar
            entry_px  = px
            prev_in_long = True

        # Выход
        elif not want_long and prev_in_long:
            pnl = (px / max(entry_px, 1e-10) - 1.0) * 100.0
            trades_log.append({
                'вход_бар':  entry_bar,
                'выход_бар': bar,
                'баров':     bar - entry_bar,
                'P&L%':      round(pnl, 2),
                'результат': '+ прибыль' if pnl > 0 else '- убыток',
            })
            prev_in_long = False

        obs, _, done, _, _ = env.step(int(action))
        bar += 1

    if prev_in_long:
        px = df['close'].iloc[-1]
        pnl = (px / max(entry_px, 1e-10) - 1.0) * 100.0
        trades_log.append({
            'вход_бар':  entry_bar,
            'выход_бар': bar,
            'баров':     bar - entry_bar,
            'P&L%':      round(pnl, 2),
            'результат': '+ прибыль' if pnl > 0 else '- убыток',
        })

    sharpe, ret, dd = calc_metrics(env.eq_curve)
    bh = (df['close'].iloc[-1] / df['close'].iloc[env._start] - 1.0) * 100.0
    return sharpe, ret, dd, len(trades_log), env.eq_curve, trades_log, env._start, round(bh, 1)


def train_agent(df_train, steps, commission, prefix=''):
    from stable_baselines3 import PPO
    from stable_baselines3.common.callbacks import BaseCallback

    class CB(BaseCallback):
        def __init__(self, total, pfx):
            super().__init__()
            self.total = total; self.pfx = pfx
            self.marks = [int(total * p) for p in (0.5, 1.0)]; self.ni = 0
        def _on_step(self):
            if self.ni < len(self.marks) and self.num_timesteps >= self.marks[self.ni]:
                print(f'    {self.pfx}{self.num_timesteps:,} / {self.total:,}'); self.ni += 1
            return True

    # reward_comm_scale=10: агент в RL чувствует 1% комиссию (не 0.1%)
    # random_start + episode_len=500: каждый эпизод — 500-барное случайное окно
    env   = TradingEnv(df_train, commission=commission, reward_comm_scale=10,
                       random_start=True, episode_len=500)
    model = PPO(
        'MlpPolicy', env,
        learning_rate = 1e-4,
        n_steps       = 2048,
        batch_size    = 128,
        n_epochs      = 10,
        gamma         = 0.9995,
        gae_lambda    = 0.95,
        clip_range    = 0.2,
        ent_coef      = 0.05,
        policy_kwargs = dict(net_arch=[128, 64]),
        verbose       = 0,
    )
    model.learn(total_timesteps=steps, callback=CB(steps, prefix))
    return model


def walk_forward(df, n_windows, train_frac, steps, commission):
    n        = len(df)
    test_sz  = int(n * (1.0 - train_frac) / n_windows)
    train_sz = int(n * train_frac)

    if test_sz < 100:
        raise ValueError('Not enough data for walk-forward. Need 2000+ bars.')

    results = []
    print(f'\n  Walk-forward: {n_windows} windows')
    print(f'  Train: {train_sz} bars  |  Test: {test_sz} bars per window\n')

    for w in range(n_windows):
        ts = w * test_sz
        te = ts + train_sz
        oe = te + test_sz
        if oe > n: break

        df_tr = df.iloc[ts:te].reset_index(drop=True)
        df_ts = df.iloc[te:oe].reset_index(drop=True)

        bh_tr = (df_tr.close.iloc[-1] / df_tr.close.iloc[0] - 1) * 100
        bh_ts = (df_ts.close.iloc[-1] / df_ts.close.iloc[0] - 1) * 100

        print(f'  Window {w+1}/{n_windows}: '
              f'train [{ts}..{te}] B&H={bh_tr:+.0f}%  '
              f'-> test [{te}..{oe}] B&H={bh_ts:+.0f}%')

        model = train_agent(df_tr, steps, commission, f'w{w+1} ')

        sh_is, ret_is, _, tr_is, eq_is, tlog_is, st_is, _ = run_episode(model, df_tr, commission)
        sh_os, ret_os, dd_os, tr_os, eq_os, tlog_os, st_os, _ = run_episode(model, df_ts, commission)

        print(f'    IS:  Sharpe {sh_is:+.2f}  Return {ret_is:+.1f}%  Trades {tr_is}')
        print(f'    OOS: Sharpe {sh_os:+.2f}  Return {ret_os:+.1f}%  Trades {tr_os}  B&H {bh_ts:+.1f}%')

        results.append({'window': w+1, 'sh_oos': sh_os, 'ret_oos': ret_os,
                        'dd_oos': dd_os, 'trades': tr_os, 'bh_test': bh_ts,
                        'eq_is': eq_is, 'eq_oos': eq_os, 'tlog_oos': tlog_os,
                        'sh_is': sh_is, 'ret_is': ret_is, 'bh_tr': bh_tr})
        print()

    return results


def plot_results(results, out_path):
    try:
        import matplotlib; matplotlib.use('Agg')
        import matplotlib.pyplot as plt, matplotlib.patches as mpatches
    except ImportError:
        print('  (install matplotlib for charts)'); return

    n = len(results)
    fig, axes = plt.subplots(2, n, figsize=(4*n, 8))
    if n == 1: axes = axes.reshape(2, 1)
    fig.suptitle('DRL Agent (binary actions) — Walk-Forward Results', fontsize=13, fontweight='bold')

    C_AGENT = '#2196F3'; C_BH = '#9E9E9E'
    C_WIN = '#4CAF50'; C_LOSS = '#F44336'

    for j, r in enumerate(results):
        # Верхняя строка: IS кривая
        ax = axes[0, j]
        eq_is = r['eq_is']
        ax.plot(range(len(eq_is)), eq_is, color=C_AGENT, lw=1.5, label='Agent')
        ax.axhline(1.0, color='black', lw=0.5, ls='--', alpha=0.4)
        ax.set_facecolor('#FFF8E1')
        ax.set_title(f'IS w{r["window"]}: {r["ret_is"]:+.1f}%\nB&H: {r["bh_tr"]:+.1f}%', fontsize=9)
        ax.set_ylabel('Equity'); ax.grid(True, alpha=0.3)

        # Нижняя строка: OOS кривая
        ax2 = axes[1, j]
        eq_os = r['eq_oos']
        color = C_WIN if r['ret_oos'] > 0 else C_LOSS
        ax2.plot(range(len(eq_os)), eq_os, color=color, lw=2, label='Agent OOS')
        ax2.axhline(1.0, color='black', lw=0.5, ls='--', alpha=0.4)
        ax2.set_facecolor('#E8F5E9' if r['ret_oos'] > 0 else '#FFF3E0')
        ax2.set_title(f'OOS w{r["window"]}: {r["ret_oos"]:+.1f}%  Sh:{r["sh_oos"]:+.2f}\nB&H: {r["bh_test"]:+.1f}%', fontsize=9)
        ax2.set_xlabel('Bar'); ax2.set_ylabel('Equity'); ax2.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig(out_path, dpi=110, bbox_inches='tight')
    print(f'\n  Chart saved: {out_path}')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('csv',          nargs='?',  default='test_data/ohlcv.csv')
    parser.add_argument('--steps',      type=int,   default=300_000)
    parser.add_argument('--windows',    type=int,   default=5)
    parser.add_argument('--train-frac', type=float, default=0.60)
    parser.add_argument('--commission', type=float, default=0.001)
    args = parser.parse_args()

    try:
        from stable_baselines3 import PPO  # noqa
    except ImportError:
        print('pip install -r drl/requirements.txt'); sys.exit(1)

    if not os.path.exists(args.csv):
        print(f'File not found: {args.csv}'); sys.exit(1)

    print(f'\nData: {args.csv}')
    df = load_csv(args.csv)
    print(f'Bars: {len(df)}  Steps/window: {args.steps:,}  Windows: {args.windows}')

    results = walk_forward(df, args.windows, args.train_frac, args.steps, args.commission)
    if not results:
        print('Not enough data.'); sys.exit(1)

    avg_sh    = np.mean([r['sh_oos']  for r in results])
    avg_ret   = np.mean([r['ret_oos'] for r in results])
    avg_dd    = np.mean([r['dd_oos']  for r in results])
    avg_bh    = np.mean([r['bh_test'] for r in results])
    avg_alpha = avg_ret - avg_bh           # outperformance vs buy-and-hold
    pos_oos   = sum(1 for r in results if r['ret_oos'] > 0)
    beats_bh  = sum(1 for r in results if r['ret_oos'] > r['bh_test'])

    print(f'  {"=" * 50}')
    print(f'  WALK-FORWARD SUMMARY ({len(results)} windows)')
    print(f'  {"=" * 50}')
    print(f'  Avg Sharpe OOS:   {avg_sh:+.2f}')
    print(f'  Avg Return OOS:   {avg_ret:+.1f}%')
    print(f'  Avg B&H OOS:      {avg_bh:+.1f}%')
    print(f'  Avg Alpha (vs BH):{avg_alpha:+.1f}%')
    print(f'  Avg Drawdown OOS: {avg_dd:.1f}%')
    print(f'  Profitable OOS:   {pos_oos}/{len(results)} windows')
    print(f'  Beats B&H OOS:    {beats_bh}/{len(results)} windows')
    print(f'  {"=" * 50}')

    n = len(results)
    if avg_sh >= 0.5 and beats_bh >= n * 0.6:
        verdict = 'YES — hypothesis confirmed'
    elif avg_alpha > 5 or (beats_bh >= n * 0.5 and avg_ret > avg_bh):
        verdict = 'WEAK — agent shows alpha vs B&H but inconsistent'
    elif avg_alpha > 0:
        verdict = 'MARGINAL — slight alpha vs B&H'
    else:
        verdict = 'NO — agent did not generalize'

    print(f'  Verdict: {verdict}')
    print(f'  {"=" * 50}\n')

    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'result.png')
    plot_results(results, out)


if __name__ == '__main__':
    main()
