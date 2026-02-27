#!/usr/bin/env python3
"""
refresh_manifest.py — автоматически обновляет номера строк в MANIFEST.md

Грепает исходные файлы по именам функций и маркерам,
находит соответствующие строки в таблицах MANIFEST.md
и заменяет устаревшие ~NNN на актуальные.

Использование:
  python3 refresh_manifest.py           # обновить MANIFEST.md
  python3 refresh_manifest.py --check   # только показать расхождения
"""
import re, sys
from pathlib import Path

ROOT         = Path(__file__).parent
MANIFEST_PATH = ROOT / 'MANIFEST.md'
DRY_RUN      = '--check' in sys.argv

# ─────────────────────────────────────────────────────────────────────────────
# Вспомогательные функции
# ─────────────────────────────────────────────────────────────────────────────

def find_line(filename, pattern):
    """Возвращает номер первой строки файла, соответствующей regex-паттерну."""
    path = ROOT / filename
    try:
        for i, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
            if re.search(pattern, line):
                return i
    except FileNotFoundError:
        return None
    return None

def replace_nth_tilde(text, n, new_val):
    """Заменяет n-е вхождение ~\\d+ в строке text на ~new_val."""
    count = 0
    def replacer(m):
        nonlocal count
        count += 1
        return f'~{new_val}' if count == n else m.group(0)
    return re.sub(r'~\d+', replacer, text)

# ─────────────────────────────────────────────────────────────────────────────
# Таблица элементов для обновления
#
# Формат каждой записи:
#   (source_file, source_pattern, manifest_key, occurrence)
#
#   source_file    — файл для поиска (относительно ROOT)
#   source_pattern — regex для поиска строки в source_file
#   manifest_key   — regex для поиска нужной строки в MANIFEST.md
#   occurrence     — которое по счёту ~\d+ заменять в найденной строке MANIFEST
#
# Особые случаи:
#   saveSession / loadSession — на одной строке MANIFEST, occurrence 1 и 2
#   Маркеры ##PINE_*## — ищем с ^  // чтобы не попасть в оглавление файла
# ─────────────────────────────────────────────────────────────────────────────

ITEMS = [
    # ── opt.js ───────────────────────────────────────────────────────────────
    ('opt.js', r'^function parseRange',                  r'`parseRange',                  1),
    ('opt.js', r'^function buildName',                   r'`buildName',                   1),
    ('opt.js', r'^async function runOpt',                r'`runOpt',                      1),
    ('opt.js', r'^  function _runOOS',                   r'`_runOOS',                     1),
    ('opt.js', r'^  function _attachOOS',                r'`_attachOOS',                  1),
    ('opt.js', r'^function _calcIndicators',             r'`_calcIndicators',             1),
    ('opt.js', r'^function buildBtCfg',                  r'`buildBtCfg',                  1),
    ('opt.js', r'^async function runMassRobust',         r'`runMassRobust',               1),
    ('opt.js', r'^async function runRobustScoreFor\b',   r'`runRobustScoreFor\b',         1),
    ('opt.js', r'^async function runRobustScoreForDetailed', r'`runRobustScoreForDetailed', 1),
    ('opt.js', r'^// ##SECTION_D##',                    r'`##SECTION_D##`',              1),

    # ── ui.js — секции ($ исключает строки TOC с описанием после маркера) ──────
    ('ui.js',  r'^// ##UI_DATA##$',                      r'`##UI_DATA##`',                1),
    ('ui.js',  r'^// ##UI_TABLE##$',                     r'`##UI_TABLE##`',               1),
    ('ui.js',  r'^// ##UI_DETAIL##$',                    r'`##UI_DETAIL##`',              1),
    ('ui.js',  r'^// ##UI_OPT##$',                       r'`##UI_OPT##`',                 1),
    ('ui.js',  r'^// ##UI_TPL##$',                       r'`##UI_TPL##`',                 1),
    ('ui.js',  r'^// ##UI_ROBUST##$',                    r'`##UI_ROBUST##`',              1),
    ('ui.js',  r'^// ##UI_PARSE##$',                     r'`##UI_PARSE##`',               1),
    ('ui.js',  r'^// ##UI_EQUITY##$',                    r'`##UI_EQUITY##`',              1),
    ('ui.js',  r'^// ##UI_HC##$',                        r'`##UI_HC##`',                  1),
    ('ui.js',  r'^// ##UI_OOSCMP##$',                    r'`##UI_OOSCMP##`',              1),

    # ── ui.js — критичные функции ─────────────────────────────────────────────
    ('ui.js',  r'^function yieldToUI',                   r'`yieldToUI',                   1),
    ('ui.js',  r'^async function checkPause',            r'`checkPause',                  1),
    ('ui.js',  r'^function gatherSettings',              r'`gatherSettings',              1),
    ('ui.js',  r'^function applySettings',               r'`applySettings',               1),
    ('ui.js',  r'^function setXMode',                    r'`setXMode',                    1),
    ('ui.js',  r'^function renderVisibleResults',        r'`renderVisibleResults',        1),
    ('ui.js',  r'^async function runRobustTest',         r'`runRobustTest',               1),
    ('ui.js',  r'^function _hcRunBacktest',              r'`_hcRunBacktest',              1),
    ('ui.js',  r'^function saveSession',                 r'`saveSession',                 1),  # 1-е ~NNN в строке
    ('ui.js',  r'^function loadSession',                 r'`saveSession',                 2),  # 2-е ~NNN в той же строке
    ('ui.js',  r'^function openRobustModal',             r'`openRobustModal',             1),
    ('ui.js',  r'^async function runOOSScan',            r'`runOOSScan',                  1),

    # ── core.js ──────────────────────────────────────────────────────────────
    ('core.js', r'^function backtest\b',                 r'`backtest',                    1),
    ('core.js', r'^function calcPivotLow',               r'`calcPivotLow',                1),
    ('core.js', r'^function calcPivotHigh',              r'`calcPivotHigh',               1),
    ('core.js', r'^function calcRMA_ATR',                r'`calcRMA_ATR',                 1),
    ('core.js', r'^function calcMA\b',                   r'`calcMA',                      1),
    ('core.js', r'^function calcADX',                    r'`calcADX',                     1),

    # ── pine_export.js ────────────────────────────────────────────────────────
    # Паттерн ^function — вне функции (глобальный уровень)
    ('pine_export.js', r'^function generatePineScript',  r'`generatePineScript',          1),
    ('pine_export.js', r'^function fixPineScript',       r'`fixPineScript',               1),
    # Паттерн ^  // ##PINE_*## — внутри функции (2 пробела), не в оглавлении
    ('pine_export.js', r'^  // ##PINE_HELPERS##',        r'`##PINE_HELPERS##`',           1),
    ('pine_export.js', r'^  // ##PINE_SLTP##',           r'`##PINE_SLTP##`',              1),
    ('pine_export.js', r'^  // ##PINE_HEADER##',         r'`##PINE_HEADER##`',            1),
    ('pine_export.js', r'^  // ##PINE_INPUTS##',         r'`##PINE_INPUTS##`',            1),
    ('pine_export.js', r'^  // ##PINE_INDICATORS##',     r'`##PINE_INDICATORS##`',        1),
    ('pine_export.js', r'^  // ##PINE_ENTRIES##',        r'`##PINE_ENTRIES##`',           1),
    ('pine_export.js', r'^  // ##PINE_SLTP_CALC##',      r'`##PINE_SLTP_CALC##`',         1),
    ('pine_export.js', r'^  // ##PINE_BACKTEST##',       r'`##PINE_BACKTEST##`',          1),
    ('pine_export.js', r'^  // ##PINE_PLOT##',           r'`##PINE_PLOT##`',              1),
    ('pine_export.js', r'^  // ##PINE_VISUAL##',         r'`##PINE_VISUAL##`',            1),
    ('pine_export.js', r'^  // ##PINE_TABLE##',          r'`##PINE_TABLE##`',             1),
    ('pine_export.js', r'^  // ##PINE_ALERTS##',         r'`##PINE_ALERTS##`',            1),
]

# ─────────────────────────────────────────────────────────────────────────────

def main():
    manifest_lines = MANIFEST_PATH.read_text(encoding='utf-8').splitlines()
    changed        = 0
    errors         = []

    for src_file, src_pattern, mf_key, occurrence in ITEMS:
        # 1. Найти строку в исходнике
        actual = find_line(src_file, src_pattern)
        if actual is None:
            errors.append(f'НЕ НАЙДЕНО в {src_file}: {src_pattern}')
            continue

        # 2. Найти нужную строку в MANIFEST.md
        mf_idx = None
        for i, line in enumerate(manifest_lines):
            if re.search(mf_key, line):
                mf_idx = i
                break

        if mf_idx is None:
            errors.append(f'НЕ НАЙДЕНО в MANIFEST: {mf_key}')
            continue

        # 3. Заменить occurrence-е вхождение ~NNN
        old = manifest_lines[mf_idx]
        new = replace_nth_tilde(old, occurrence, actual)

        if new != old:
            # Определить старое значение для вывода
            matches = list(re.finditer(r'~(\d+)', old))
            old_val = matches[occurrence - 1].group(1) if len(matches) >= occurrence else '?'
            label   = mf_key.strip('`').strip()
            print(f'  {src_file:<18} {label:<32} ~{old_val} → ~{actual}')
            manifest_lines[mf_idx] = new
            changed += 1

    print()

    if errors:
        print('⚠️  Ошибки:')
        for e in errors:
            print(f'   {e}')
        print()

    if changed == 0:
        print('✓ Все номера строк актуальны, изменений нет.')
        return

    if DRY_RUN:
        print(f'[--check] Было бы обновлено {changed} записей. MANIFEST.md не изменён.')
    else:
        MANIFEST_PATH.write_text('\n'.join(manifest_lines) + '\n', encoding='utf-8')
        print(f'✓ Обновлено {changed} записей в MANIFEST.md')

if __name__ == '__main__':
    main()
