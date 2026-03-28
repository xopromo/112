#!/usr/bin/env python3
"""
ml/train.py — обучение ML-фильтра сигналов для USE Optimizer

Вход:  CSV из TradingView (OHLCV, минимум 2000 баров)
Выход: ml/model_generated.js — чистый JS-предиктор (без зависимостей)
       ml/train_report.txt — метрики качества модели

Признаки (21):
  19 нормализованных лог-возвратов последних 20 баров
  + ATR-нормализованная волатильность
  + Efficiency Ratio (10 баров)

Разметка:
  1 = цена через LABEL_BARS баров > цена входа × (1 + 2×commission)
  0 = иначе (убыток или около нуля)

Запуск:
  python3 ml/train.py [путь/к/ohlcv.csv]
  python3 ml/train.py  # использует test_data/ohlcv.csv по умолчанию
"""

import sys
import os
import numpy as np
import pandas as pd
import m2cgen as m2c
from xgboost import XGBClassifier
from sklearn.metrics import roc_auc_score, classification_report

# ── Параметры ─────────────────────────────────────────────────
WINDOW       = 20      # баров истории для признаков
LABEL_BARS   = 10      # через сколько баров смотрим результат
COMMISSION   = 0.001   # 0.1% в одну сторону
PVL, PVR     = 3, 4    # pivot left/right (как в оптимизаторе)
TRAIN_RATIO  = 0.70    # walk-forward: 70% train, 30% test
MIN_SAMPLES  = 200     # минимум примеров для обучения
N_TREES      = 150
MAX_DEPTH    = 4
LR           = 0.05
# ──────────────────────────────────────────────────────────────

def compute_atr_rma(highs, lows, closes, period=14):
    """Wilder's RMA ATR — совпадает с calcRMA_ATR в core.js"""
    n = len(closes)
    tr = np.zeros(n)
    for i in range(1, n):
        tr[i] = max(highs[i] - lows[i],
                    abs(highs[i] - closes[i-1]),
                    abs(lows[i]  - closes[i-1]))
    rma = np.zeros(n)
    if n > period:
        rma[period] = tr[1:period+1].mean()
    alpha = 1.0 / period
    for i in range(period + 1, n):
        rma[i] = alpha * tr[i] + (1 - alpha) * rma[i-1]
    return rma


def compute_er(closes, end_idx, period=10):
    """Efficiency Ratio — совпадает с erArr в opt.js"""
    if end_idx < period:
        return 0.0
    net = abs(closes[end_idx] - closes[end_idx - period])
    path = sum(abs(closes[j] - closes[j-1])
               for j in range(end_idx - period + 1, end_idx + 1))
    return net / path if path > 0 else 0.0


def find_pivot_lows(lows, pvL, pvR):
    """
    Возвращает массив confirmation-баров (i = pivot_bar + pvR),
    совпадает с calcPivotLow в core.js.
    LEFT нестрого (ничья = ok), RIGHT строго (ничья = fail).
    """
    n = len(lows)
    signals = []
    for i in range(pvL + pvR, n):
        idx = i - pvR
        v = lows[idx]
        ok = True
        for j in range(idx - pvL, idx):
            if lows[j] < v:
                ok = False
                break
        if ok:
            for j in range(idx + 1, idx + pvR + 1):
                if j < n and lows[j] <= v:
                    ok = False
                    break
        if ok:
            signals.append(i)
    return signals


def compute_features(closes, highs, lows, atr_arr, bar_idx):
    """
    21 признак для бара bar_idx.
    Должны совпадать с вычислениями в ml_signal.js.
    """
    if bar_idx < WINDOW + 1:
        return None

    # 19 нормализованных лог-возвратов [bar_idx-19 .. bar_idx-1]
    log_rets = np.diff(np.log(closes[bar_idx - WINDOW: bar_idx]))  # 19 значений
    std = log_rets.std() + 1e-8
    ret_norm = log_rets / std

    # ATR / close (нормализованная волатильность)
    atr_norm = atr_arr[bar_idx - 1] / closes[bar_idx - 1] if closes[bar_idx - 1] > 0 else 0.0

    # Efficiency Ratio (10 баров)
    er = compute_er(closes, bar_idx - 1, period=10)

    return np.concatenate([ret_norm, [atr_norm, er]])  # shape (21,)


def make_feature_names():
    names = [f'ret_{i}' for i in range(19)]
    names += ['atr_norm', 'er_10']
    return names


def build_dataset(df):
    closes = df['close'].values.astype(float)
    highs  = df['high'].values.astype(float)
    lows   = df['low'].values.astype(float)
    n      = len(closes)

    atr_arr = compute_atr_rma(highs, lows, closes)
    signals = find_pivot_lows(lows, PVL, PVR)

    X_rows, y_rows, bar_indices = [], [], []

    for sig_bar in signals:
        if sig_bar + LABEL_BARS >= n:
            continue
        feat = compute_features(closes, highs, lows, atr_arr, sig_bar)
        if feat is None or np.any(np.isnan(feat)):
            continue

        # Метка: выгодно ли войти на этом баре?
        entry_price  = closes[sig_bar]
        exit_price   = closes[sig_bar + LABEL_BARS]
        min_gain     = 1 + 2 * COMMISSION       # нужно перекрыть комиссию
        label        = 1 if exit_price > entry_price * min_gain else 0

        X_rows.append(feat)
        y_rows.append(label)
        bar_indices.append(sig_bar)

    return np.array(X_rows), np.array(y_rows), bar_indices


def train(csv_path):
    print(f'📂 Загрузка данных: {csv_path}')
    df = pd.read_csv(csv_path)

    # Нормализуем названия колонок (разные варианты из TV)
    df.columns = [c.lower().strip() for c in df.columns]
    rename = {'o': 'open', 'h': 'high', 'l': 'low', 'c': 'close', 'v': 'volume'}
    df = df.rename(columns=rename)
    for col in ['open', 'high', 'low', 'close']:
        if col not in df.columns:
            raise ValueError(f'Колонка "{col}" не найдена в CSV')

    print(f'   Баров: {len(df)}')

    X, y, bars = build_dataset(df)
    print(f'   Сигналов (pivot lows L{PVL}R{PVR}): {len(X)}')
    print(f'   Положительных (прибыльных): {y.sum()} ({100*y.mean():.1f}%)')

    if len(X) < MIN_SAMPLES:
        print(f'❌ Слишком мало данных (нужно ≥{MIN_SAMPLES} сигналов)')
        sys.exit(1)

    # Walk-forward split
    split = int(len(X) * TRAIN_RATIO)
    X_train, X_test = X[:split], X[split:]
    y_train, y_test = y[:split], y[split:]
    print(f'\n   Train: {len(X_train)} | Test: {len(X_test)}')

    # Обучение
    print('\n🚀 Обучение XGBoost...')
    model = XGBClassifier(
        n_estimators    = N_TREES,
        max_depth       = MAX_DEPTH,
        learning_rate   = LR,
        subsample       = 0.8,
        colsample_bytree= 0.8,
        base_score      = 0.5,   # нужно для m2cgen (XGBoost 3.x)
        eval_metric     = 'auc',
        random_state    = 42,
        verbosity       = 0,
    )
    model.fit(
        X_train, y_train,
        eval_set        = [(X_test, y_test)],
        verbose         = False,
    )

    # Метрики
    proba_test  = model.predict_proba(X_test)[:, 1]
    auc         = roc_auc_score(y_test, proba_test)
    y_pred      = (proba_test >= 0.5).astype(int)
    report      = classification_report(y_test, y_pred, target_names=['loss', 'profit'])

    # Feature importance
    feat_names = make_feature_names()
    importances = sorted(zip(feat_names, model.feature_importances_),
                         key=lambda x: -x[1])

    print(f'\n📊 Результаты (test set, walk-forward):')
    print(f'   AUC-ROC: {auc:.4f}')
    print(report)
    print('   Top-5 признаков:')
    for name, imp in importances[:5]:
        print(f'     {name}: {imp:.4f}')

    # Экспорт в JS
    out_dir  = os.path.dirname(os.path.abspath(__file__))
    js_path  = os.path.join(out_dir, 'model_generated.js')
    txt_path = os.path.join(out_dir, 'train_report.txt')

    print(f'\n💾 Экспорт модели в JS: {js_path}')
    js_code = m2c.export_to_javascript(model, function_name='_mlPredict')

    # Оборачиваем в модуль с удобным API
    header = f"""// AUTO-GENERATED by ml/train.py — не редактировать вручную
// Данные: {csv_path}  Баров: {len(df)}  Сигналов: {len(X)}
// AUC: {auc:.4f}  Train/Test: {len(X_train)}/{len(X_test)}
// Признаки: 19×log_ret_norm + atr_norm + er_10  (21 total)
// Разметка: proba(close[+{LABEL_BARS}] > entry×{1+2*COMMISSION:.4f})
// m2cgen {m2c.__version__}

"""
    footer = """
// Входная точка: принимает Float64Array(21), возвращает вероятность [0..1]
function mlScore(features) {
    const input = Array.from(features);
    const result = _mlPredict(input);
    // m2cgen для бинарной XGB возвращает [prob_0, prob_1]
    return Array.isArray(result) ? result[1] : (1 / (1 + Math.exp(-result)));
}
"""
    with open(js_path, 'w') as f:
        f.write(header + js_code + footer)

    # Отчёт
    with open(txt_path, 'w') as f:
        f.write(f'AUC-ROC: {auc:.4f}\n')
        f.write(f'Баров: {len(df)}  Сигналов: {len(X)}\n')
        f.write(f'Положительных: {y.sum()} ({100*y.mean():.1f}%)\n\n')
        f.write(report + '\n')
        f.write('Feature importances:\n')
        for name, imp in importances:
            f.write(f'  {name}: {imp:.4f}\n')

    print(f'✅ Готово! Модель сохранена.')
    print(f'   JS: {js_path}')
    print(f'   Отчёт: {txt_path}')
    print(f'\n   Следующий шаг: собрать проект  python build.py')


if __name__ == '__main__':
    csv_path = sys.argv[1] if len(sys.argv) > 1 else 'test_data/ohlcv.csv'
    if not os.path.exists(csv_path):
        print(f'❌ Файл не найден: {csv_path}')
        sys.exit(1)
    train(csv_path)
