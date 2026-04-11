#!/usr/bin/env python3
"""
drl/test_hypothesis.py — проверка гипотезы DRL агента

ВОПРОС: Способен ли агент торговать в плюс на данных, которых он НЕ видел?

ЧТО ДЕЛАЕТ:
  1. Загружает CSV (уже есть: test_data/ohlcv.csv — 11 000 реальных баров)
  2. Делит: 70% агент УЧИТСЯ, 30% агент ТОРГУЕТ (эти данные он не видел)
  3. Обучает PPO агента на 70% данных
  4. Запускает его на 30% новых данных — смотрим заработал ли
  5. Строит ГРАФИК: кривая капитала агента vs просто держать актив

ЗАПУСК:
  python drl/test_hypothesis.py                         # встроенные данные
  python drl/test_hypothesis.py my_data.csv             # свой файл
  python drl/test_hypothesis.py my_data.csv --steps 500000
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
    df = df[['open', 'high', 'low', 'close']].dropna().reset_index(drop=True)
    return df.astype(float)


def calc_metrics(eq_curve):
    """Sharpe (annualized), доходность %, max drawdown %."""
    eq = np.array(eq_curve, dtype=np.float64)
    if len(eq) < 2:
        return 0.0, 0.0, 0.0
    rets  = np.diff(eq) / np.maximum(eq[:-1], 1e-10)
    sharpe = (rets.mean() / (rets.std() + 1e-10)) * np.sqrt(252)
    total  = (eq[-1] / max(eq[0], 1e-10) - 1.0) * 100.0
    running_max = np.maximum.accumulate(eq)
    dd = ((running_max - eq) / np.maximum(running_max, 1e-10)).max() * 100.0
    return round(sharpe, 2), round(total, 1), round(dd, 1)


# ── Оценка + сбор сделок ───────────────────────────────────────────────────────

def evaluate(model, df, label, commission=0.001):
    """Прогнать обученную модель на df, вывести метрики, вернуть данные для графика."""
    env = TradingEnv(df, commission=commission)
    obs, _ = env.reset()

    # Запись сделок для лога
    trades_log = []
    in_trade   = False
    entry_bar  = 0
    entry_px   = 0.0

    bar = env._start
    done = False
    while not done:
        action, _ = model.predict(obs, deterministic=True)
        action = int(action)

        # Логируем сделки
        if action == 1 and not in_trade:
            in_trade  = True
            entry_bar = bar
            entry_px  = df['close'].iloc[min(bar, len(df) - 1)]
        elif action == 2 and in_trade:
            exit_px  = df['close'].iloc[min(bar, len(df) - 1)]
            pnl_pct  = (exit_px / entry_px - 1.0) * 100.0
            duration = bar - entry_bar
            trades_log.append({
                'вход_бар':   entry_bar,
                'выход_бар':  bar,
                'баров':      duration,
                'вход_цена':  round(entry_px, 6),
                'выход_цена': round(exit_px, 6),
                'P&L%':       round(pnl_pct, 2),
                'результат':  '✅ прибыль' if pnl_pct > 0 else '❌ убыток',
            })
            in_trade = False

        obs, _, done, _, _ = env.step(action)
        bar += 1

    # Закрыть незакрытую позицию
    if in_trade:
        exit_px = df['close'].iloc[-1]
        pnl_pct = (exit_px / entry_px - 1.0) * 100.0
        trades_log.append({
            'вход_бар':   entry_bar,
            'выход_бар':  bar,
            'баров':      bar - entry_bar,
            'вход_цена':  round(entry_px, 6),
            'выход_цена': round(exit_px, 6),
            'P&L%':       round(pnl_pct, 2),
            'результат':  '✅ прибыль' if pnl_pct > 0 else '❌ убыток',
        })

    sharpe, ret, dd = calc_metrics(env.eq_curve)
    total_trades = len(trades_log)
    wins = sum(1 for t in trades_log if t['P&L%'] > 0)
    wr   = (wins / max(total_trades, 1)) * 100.0

    bh_ret = (df['close'].iloc[-1] / df['close'].iloc[env._start] - 1.0) * 100.0

    # ── Вывод в консоль ──
    print(f'\n  {"─" * 50}')
    print(f'  {label}')
    print(f'  {"─" * 50}')
    print(f'  Sharpe:         {sharpe:+.2f}')
    print(f'  Доходность:     {ret:+.1f}%')
    print(f'  Max Drawdown:   {dd:.1f}%')
    print(f'  Сделок:         {total_trades}  (Win Rate {wr:.0f}%)')
    print(f'  Buy & Hold:     {bh_ret:+.1f}%')

    if trades_log:
        print(f'\n  Последние сделки:')
        for t in trades_log[-5:]:
            print(f'    бар {t["вход_бар"]:>5} → {t["выход_бар"]:>5} '
                  f'({t["баров"]:>3} баров)  {t["P&L%"]:>+7.2f}%  {t["результат"]}')
        if len(trades_log) > 5:
            print(f'    ... и ещё {len(trades_log) - 5} сделок')

    return sharpe, ret, dd, total_trades, env.eq_curve, trades_log, env._start, bh_ret


# ── График ────────────────────────────────────────────────────────────────────

def plot_results(df_is, df_oos,
                 eq_is, eq_oos,
                 trades_is, trades_oos,
                 start_is, start_oos,
                 bh_ret_is, bh_ret_oos,
                 sharpe_oos, ret_oos):
    try:
        import matplotlib
        matplotlib.use('Agg')          # без GUI — сохраняем в файл
        import matplotlib.pyplot as plt
        import matplotlib.patches as mpatches
    except ImportError:
        print('\n  (График не построен — установи matplotlib: pip install matplotlib)')
        return None

    fig, axes = plt.subplots(2, 2, figsize=(14, 8))
    fig.suptitle('DRL Агент — Результаты теста гипотезы', fontsize=14, fontweight='bold')

    # Цвета
    C_AGENT = '#2196F3'   # синий — агент
    C_BH    = '#9E9E9E'   # серый — buy&hold
    C_WIN   = '#4CAF50'   # зелёный — прибыльная сделка
    C_LOSS  = '#F44336'   # красный — убыточная сделка
    C_IS    = '#FFF3E0'   # фон IS
    C_OOS   = '#E8F5E9'   # фон OOS

    def _plot_equity(ax, df, eq_curve, trades_log, start_idx, bh_ret, title, bg):
        ax.set_facecolor(bg)
        n_eq = len(eq_curve)
        xs   = list(range(n_eq))

        # Buy & Hold
        closes = df['close'].values
        bh_start = closes[start_idx]
        bh = [closes[min(start_idx + i, len(closes) - 1)] / bh_start
              for i in range(n_eq)]
        ax.plot(xs, bh, color=C_BH, linewidth=1, alpha=0.6, label='Buy & Hold')

        # Кривая капитала агента
        ax.plot(xs, eq_curve, color=C_AGENT, linewidth=2, label='DRL Агент')

        # Маркеры сделок
        for t in trades_log:
            ei = t['вход_бар'] - start_idx
            xi = t['выход_бар'] - start_idx
            if 0 <= ei < n_eq and 0 <= xi < n_eq:
                color = C_WIN if t['P&L%'] > 0 else C_LOSS
                ax.axvspan(ei, xi, alpha=0.12, color=color)
                ax.plot(ei, eq_curve[ei], '^', color=C_WIN, markersize=5, zorder=5)
                ax.plot(xi, eq_curve[xi], 'v', color=C_LOSS if t['P&L%'] <= 0 else C_WIN,
                        markersize=5, zorder=5)

        ax.axhline(1.0, color='black', linewidth=0.5, linestyle='--', alpha=0.4)
        ax.set_title(title, fontsize=11)
        ax.set_ylabel('Капитал (нач. = 1.0)')
        ax.set_xlabel('Бар')
        ax.legend(fontsize=9)
        ax.grid(True, alpha=0.3)

    def _plot_trades(ax, trades_log, title, bg):
        ax.set_facecolor(bg)
        if not trades_log:
            ax.text(0.5, 0.5, 'Нет сделок', ha='center', va='center',
                    transform=ax.transAxes, fontsize=12)
            ax.set_title(title)
            return

        pnls  = [t['P&L%'] for t in trades_log]
        colors = [C_WIN if p > 0 else C_LOSS for p in pnls]
        xs = range(len(pnls))
        bars = ax.bar(xs, pnls, color=colors, alpha=0.8, width=0.7)

        ax.axhline(0, color='black', linewidth=0.8)

        # Кумулятивная линия
        cum = np.cumsum(pnls)
        ax2 = ax.twinx()
        ax2.plot(xs, cum, color=C_AGENT, linewidth=1.5, label='Сумм. P&L%')
        ax2.set_ylabel('Накопленный P&L%', color=C_AGENT, fontsize=9)
        ax2.tick_params(axis='y', colors=C_AGENT)

        wins  = sum(1 for p in pnls if p > 0)
        wr    = wins / max(len(pnls), 1) * 100
        avg_w = np.mean([p for p in pnls if p > 0]) if wins else 0
        avg_l = np.mean([p for p in pnls if p <= 0]) if (len(pnls) - wins) else 0

        ax.set_title(f'{title}\n'
                     f'Сделок: {len(pnls)}  WR: {wr:.0f}%  '
                     f'Ср. прибыль: {avg_w:+.2f}%  Ср. убыток: {avg_l:+.2f}%',
                     fontsize=10)
        ax.set_xlabel('Сделка #')
        ax.set_ylabel('P&L%')
        ax.grid(True, alpha=0.3, axis='y')

        patch_w = mpatches.Patch(color=C_WIN, alpha=0.8, label=f'Прибыль ({wins})')
        patch_l = mpatches.Patch(color=C_LOSS, alpha=0.8, label=f'Убыток ({len(pnls)-wins})')
        ax.legend(handles=[patch_w, patch_l], fontsize=9)

    # IS — кривая капитала
    _plot_equity(axes[0, 0], df_is, eq_is, trades_is, start_is, bh_ret_is,
                 '📚 IS — Обучение (агент ЭТО ВИДЕЛ)', C_IS)

    # OOS — кривая капитала
    _plot_equity(axes[0, 1], df_oos, eq_oos, trades_oos, start_oos, bh_ret_oos,
                 f'🔍 OOS — Тест на новых данных (НЕ ВИДЕЛ)\n'
                 f'Sharpe: {sharpe_oos:+.2f}  Доходность: {ret_oos:+.1f}%', C_OOS)

    # IS — сделки
    _plot_trades(axes[1, 0], trades_is, 'Сделки IS (обучение)', C_IS)

    # OOS — сделки
    _plot_trades(axes[1, 1], trades_oos, 'Сделки OOS (ключевой тест)', C_OOS)

    plt.tight_layout()

    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'result.png')
    plt.savefig(out_path, dpi=120, bbox_inches='tight')
    print(f'\n  📊 График сохранён: {out_path}')
    return out_path


# ── Главная функция ────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='DRL гипотеза: торгует ли агент в плюс на новых данных?'
    )
    parser.add_argument('csv', nargs='?', default='test_data/ohlcv.csv')
    parser.add_argument('--steps', type=int, default=200_000)
    parser.add_argument('--commission', type=float, default=0.001)
    parser.add_argument('--split', type=float, default=0.70)
    args = parser.parse_args()

    try:
        from stable_baselines3 import PPO
        from stable_baselines3.common.callbacks import BaseCallback
    except ImportError:
        print('❌ Установи зависимости:\n   pip install -r drl/requirements.txt')
        sys.exit(1)

    # ── Данные ────────────────────────────────────────────────────────────────
    if not os.path.exists(args.csv):
        print(f'❌ Файл не найден: {args.csv}')
        sys.exit(1)

    print(f'\n📂 Данные: {args.csv}')
    df    = load_csv(args.csv)
    n     = len(df)
    split = int(n * args.split)

    df_is  = df.iloc[:split].reset_index(drop=True)
    df_oos = df.iloc[split:].reset_index(drop=True)

    print(f'   Всего баров:    {n}')
    print(f'   IS  (учёба):    {len(df_is)} баров  — агент учится на этом')
    print(f'   OOS (экзамен):  {len(df_oos)} баров  — агент ЭТОГО не видел')
    print(f'   Шагов PPO:      {args.steps:,}')
    print(f'   Комиссия:       {args.commission * 100:.2f}% на сторону\n')

    if len(df_is) < 60 or len(df_oos) < 60:
        print('❌ Слишком мало данных (нужно ≥ 200 баров)')
        sys.exit(1)

    # ── Обучение ──────────────────────────────────────────────────────────────

    class ProgressCB(BaseCallback):
        def __init__(self, total):
            super().__init__()
            self.total      = total
            self.milestones = [int(total * p) for p in (0.2, 0.4, 0.6, 0.8, 1.0)]
            self.next_idx   = 0

        def _on_step(self):
            if self.next_idx < len(self.milestones):
                if self.num_timesteps >= self.milestones[self.next_idx]:
                    pct = int(100 * self.milestones[self.next_idx] / self.total)
                    print(f'   {self.num_timesteps:>9,} шагов ({pct}%) ...')
                    self.next_idx += 1
            return True

    print('🚀 Обучение PPO на IS данных...')
    env_is = TradingEnv(df_is, commission=args.commission)

    model = PPO(
        'MlpPolicy',
        env_is,
        learning_rate = 3e-4,
        n_steps       = 1024,
        batch_size    = 64,
        n_epochs      = 10,
        gamma         = 0.99,
        gae_lambda    = 0.95,
        clip_range    = 0.2,
        ent_coef      = 0.01,
        policy_kwargs = dict(net_arch=[128, 64]),
        verbose       = 0,
    )
    model.learn(total_timesteps=args.steps, callback=ProgressCB(args.steps))
    print('✅ Обучение завершено\n')

    # ── Оценка ────────────────────────────────────────────────────────────────
    sharpe_is, ret_is, dd_is, trades_is, eq_is, tlog_is, start_is, bh_is = \
        evaluate(model, df_is, 'IS  — обучающие данные (агент это ВИДЕЛ)',
                 args.commission)

    sharpe_oos, ret_oos, dd_oos, trades_oos, eq_oos, tlog_oos, start_oos, bh_oos = \
        evaluate(model, df_oos,
                 'OOS — НОВЫЕ данные (агент их НЕ ВИДЕЛ) ← главный вопрос',
                 args.commission)

    # ── Вердикт ───────────────────────────────────────────────────────────────
    print(f'\n  {"═" * 50}')
    print(f'  ИТОГ: агент торгует в плюс на новых данных?')
    print(f'  {"═" * 50}')

    if sharpe_oos >= 1.0 and ret_oos > 0 and trades_oos >= 5:
        verdict = '✅ ДА — гипотеза подтверждена!'
    elif ret_oos > 0 and trades_oos >= 3:
        verdict = '⚠️  СЛАБО — прибыль есть, но нестабильно (Sharpe < 1.0)'
    else:
        verdict = '❌ НЕТ — агент не обобщил на новые данные'

    print(f'  {verdict}')
    print(f'  Sharpe OOS = {sharpe_oos:+.2f}  |  Доходность OOS = {ret_oos:+.1f}%')
    print(f'  {"═" * 50}')

    if sharpe_oos < 0.5:
        print('\n  Советы:')
        print('  • Больше шагов:  --steps 500000')
        print('  • Больше данных: нужно 2000+ баров')
        print('  • Другой инструмент/таймфрейм')

    # ── График ────────────────────────────────────────────────────────────────
    print()
    out = plot_results(
        df_is, df_oos,
        eq_is, eq_oos,
        tlog_is, tlog_oos,
        start_is, start_oos,
        bh_is, bh_oos,
        sharpe_oos, ret_oos,
    )
    if out:
        print(f'  Открой файл чтобы увидеть график:')
        print(f'  {out}')
    print()


if __name__ == '__main__':
    main()
