#!/usr/bin/env python3
"""
check_regression.py — регрессионный чекер структуры кода

Режимы:
  python3 check_regression.py          # сравнить с baseline (создаст если нет)
  python3 check_regression.py --save   # принудительно обновить baseline
"""
import re, json, sys
from pathlib import Path

BASE_DIR = Path(__file__).parent
BASELINE_FILE = BASE_DIR / 'regression_baseline.json'

# Паттерны для каждого файла: (категория, regex)
SCAN_CONFIG = {
    'ui.js': [
        ('functions', r'\bfunction\s+(\w+)\s*\('),
        ('markers',   r'(##[A-Z][A-Z_0-9]*##)'),
    ],
    'core.js': [
        ('functions', r'\bfunction\s+(\w+)\s*\('),
    ],
    'opt.js': [
        ('functions', r'\bfunction\s+(\w+)\s*\('),
        ('markers',   r'(##[A-Z][A-Z_0-9]*##)'),
    ],
    'pine_export.js': [
        ('functions', r'\bfunction\s+(\w+)\s*\('),
        ('markers',   r'(##[A-Z][A-Z_0-9]*##)'),
    ],
    'shell.html': [
        ('ids', r'\bid=["\']([^"\'>\s]+)["\']'),
    ],
}

# Критичные элементы — проверяются явно вне baseline
MUST_EXIST = {
    'core.js': {
        'functions': ['backtest', 'calcEMA', 'calcSMA', 'calcRMA_ATR', 'calcRSI', 'calcADX'],
    },
    'opt.js': {
        'functions': ['runOpt', 'parseRange', '_calcIndicators', 'buildBtCfg', '_attachOOS',
                      'runMassRobust', 'runRobustScoreFor'],
        'markers': ['##SECTION_A##', '##SECTION_B##', '##SECTION_C##'],
    },
    'ui.js': {
        'functions': ['yieldToUI', 'gatherSettings', 'renderVisibleResults',
                      'runRobustTest', 'runHillClimbing', 'runOOSScan'],
        'markers': ['##UI_DATA##', '##UI_TABLE##', '##UI_OPT##',
                    '##UI_ROBUST##', '##UI_HC##', '##UI_OOSCMP##'],
    },
    'pine_export.js': {
        'functions': ['generatePineScript', 'fixPineScript'],
        'markers': ['##PINE_HEADER##', '##PINE_ENTRIES##',
                    '##PINE_SLTP_CALC##', '##PINE_BACKTEST##'],
    },
}


def scan_file(filepath, patterns):
    try:
        text = Path(filepath).read_text(encoding='utf-8')
    except FileNotFoundError:
        return None  # сигнал что файл пропал

    results = {}
    for category, pattern in patterns:
        matches = re.findall(pattern, text, re.MULTILINE)
        results.setdefault(category, set()).update(matches)

    return {k: sorted(v) for k, v in results.items()}


def scan_all():
    snapshot = {}
    for filename, patterns in SCAN_CONFIG.items():
        data = scan_file(BASE_DIR / filename, patterns)
        snapshot[filename] = data  # None если файл пропал
    return snapshot


def save_baseline(snapshot):
    with open(BASELINE_FILE, 'w', encoding='utf-8') as f:
        json.dump(snapshot, f, ensure_ascii=False, indent=2)
    print(f'✓ Baseline сохранён → {BASELINE_FILE.name}')
    for filename, data in snapshot.items():
        if data is None:
            print(f'  {filename}: ФАЙЛ НЕ НАЙДЕН')
        else:
            parts = [f'{len(v)} {k}' for k, v in data.items()]
            print(f'  {filename}: {", ".join(parts)}')


def check_must_exist(current):
    errors = []
    for filename, categories in MUST_EXIST.items():
        file_data = current.get(filename)
        if file_data is None:
            errors.append(f'[{filename}] ФАЙЛ ОТСУТСТВУЕТ')
            continue
        for category, items in categories.items():
            current_set = set(file_data.get(category, []))
            for item in items:
                if item not in current_set:
                    errors.append(f'[{filename}] критичное пропало ({category}): {item}')
    return errors


def compare_baseline(baseline, current):
    errors = []
    for filename, baseline_data in baseline.items():
        if baseline_data is None:
            continue  # файла не было и в baseline — пропускаем
        current_data = current.get(filename)
        if current_data is None:
            errors.append(f'[{filename}] ФАЙЛ ИСЧЕЗ')
            continue
        for category, baseline_items in baseline_data.items():
            current_set = set(current_data.get(category, []))
            missing = sorted(set(baseline_items) - current_set)
            for item in missing:
                errors.append(f'[{filename}] пропало ({category}): {item}')
    return errors


def main():
    save_mode = '--save' in sys.argv
    current = scan_all()

    if save_mode:
        save_baseline(current)
        return 0

    # Сначала проверяем критичные функции (независимо от baseline)
    critical_errors = check_must_exist(current)

    # Затем сравниваем с baseline
    baseline_errors = []
    if not BASELINE_FILE.exists():
        print('⚠ Baseline не найден — создаю из текущего состояния.')
        save_baseline(current)
        print('  Запустите снова после следующего изменения для реальной проверки.')
    else:
        with open(BASELINE_FILE, encoding='utf-8') as f:
            baseline = json.load(f)
        baseline_errors = compare_baseline(baseline, current)

    all_errors = critical_errors + baseline_errors

    if not all_errors:
        print('✓ Regression check: OK')
        return 0
    else:
        print(f'✗ Regression check: {len(all_errors)} проблем(а)')
        if critical_errors:
            print('\n  [КРИТИЧНЫЕ]')
            for e in critical_errors:
                print(f'    {e}')
        if baseline_errors:
            print('\n  [РЕГРЕССИИ vs baseline]')
            for e in baseline_errors:
                print(f'    {e}')
        print('\n  Если удаление намеренное: python3 check_regression.py --save')
        return 1


if __name__ == '__main__':
    sys.exit(main())
