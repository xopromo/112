#!/usr/bin/env bash
# sync_claude_md.sh — обновляет номера строк в CLAUDE.md
# Запускается автоматически git post-commit хуком, или вручную.
# Использование: bash agent/sync_claude_md.sh [--check]
#   --check  только проверить расхождение, не изменять файл

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CLAUDE_MD="$REPO_DIR/CLAUDE.md"
CHECK_ONLY=false
[[ "${1:-}" == "--check" ]] && CHECK_ONLY=true

python3 - "$REPO_DIR" "$CLAUDE_MD" "$CHECK_ONLY" <<'PYEOF'
import sys, re

repo, claude_md, check_only = sys.argv[1], sys.argv[2], sys.argv[3] == "true"

# Список: (файл, grep-паттерн, имя-в-карте)
# Паттерн должен однозначно матчить ОДНУ строку с определением функции/константы
FUNCS = [
    ("opt.js",        r"^function parseRange\(",              "parseRange"),
    ("opt.js",        r"^function _calcStatSig\(",            "_calcStatSig"),
    ("opt.js",        r"^function _calcGTScore\(",            "_calcGTScore"),
    ("opt.js",        r"^async function runOpt\(",            "runOpt"),
    ("opt.js",        r"^  function _runOOS\(",               "_runOOS"),
    ("opt.js",        r"^  function _attachOOS\(",            "_attachOOS"),
    ("opt.js",        r"^function _calcIndicators\(",         "_calcIndicators"),
    ("opt.js",        r"^function buildBtCfg\(",              "buildBtCfg"),
    ("opt.js",        r"^async function runMassRobust\(",     "runMassRobust"),
    ("opt.js",        r"^async function runRobustScoreFor\(", "runRobustScoreFor"),
    ("opt.js",        r"^const HC_NUMERIC_PARAMS\s*=",        "HC_NUMERIC_PARAMS"),
    ("ui_detail.js",     r"^function showDetail\(",              "showDetail"),
    ("ui_table.js",      r"^function switchTableMode\(",         "switchTableMode"),
    ("ui_table.js",      r"^function resetAllFilters\(",         "resetAllFilters"),
    ("ui_table.js",      r"^function applyFilters\(",            "applyFilters"),
    ("ui_oos.js",        r"^async function runOOSScan\(",        "runOOSScan"),
    ("ui_hc.js",         r"^function openHCModal\(",             "openHCModal"),
    ("ui_hc.js",         r"^async function _hcRobScore\(",       "_hcRobScore"),
    ("ui_hc.js",         r"^function _hcRunBacktest\(",          "_hcRunBacktest"),
    ("ui_hc.js",         r"^function _hcNeighbours\(",           "_hcNeighbours"),
    ("ui_hc.js",         r"^async function runHillClimbing\(",   "runHillClimbing"),
    ("ui_hc.js",         r"^function _hcOpenDetail\(",           "_hcOpenDetail"),
    ("ui_oos.js",        r"^function openOOSDiagnostic\(",       "openOOSDiagnostic"),
    ("ui_comparator.js", r"^function showOOSTradeDiag\(",        "showOOSTradeDiag"),    ("pine_export.js",r"^function generatePineScript\(",      "generatePineScript"),
    ("pine_export.js",r"^function generatePineStrategy\(",    "generatePineStrategy"),
    ("pine_export.js",r"^function fixPineScript\(",           "fixPineScript"),
    ("pine_export.js",r"^function _addActivePinev6\(",        "_addActivePinev6"),
    ("core.js",       r"^function backtest\(",                "backtest"),
    ("core.js",       r"^function calcHTFADX\(",              "calcHTFADX"),
]

with open(claude_md, "r") as f:
    content = f.read()

changes = []
not_found = []

for (fname, pattern, name) in FUNCS:
    filepath = f"{repo}/{fname}"
    try:
        with open(filepath) as f:
            lines = f.readlines()
    except FileNotFoundError:
        print(f"WARN: файл не найден: {fname}", file=sys.stderr)
        continue

    # Находим строку с определением функции
    lineno = None
    rx = re.compile(pattern)
    for i, line in enumerate(lines, 1):
        if rx.search(line):
            lineno = i
            break

    if lineno is None:
        not_found.append(f"{name} ({fname})")
        continue

    # Формат в CLAUDE.md: `name` (NUM) или `name(args)` (NUM)
    # Regex: backtick + name + любые символы кроме backtick + backtick + пробел + ( + digits + )
    bullet_rx = re.compile(r'(`' + re.escape(name) + r'[^`]*` \()(\d+)(\))')
    m = bullet_rx.search(content)
    if not m:
        continue  # функция не в карте CLAUDE.md — пропускаем

    old_num = int(m.group(2))
    if old_num == lineno:
        continue

    changes.append((name, old_num, lineno, fname, bullet_rx))

if not_found:
    print(f"WARN: не найдено в исходниках: {', '.join(not_found)}", file=sys.stderr)

if not changes:
    print("sync_claude_md: все номера строк актуальны")
    sys.exit(0)

for (name, old, new, fname, _) in changes:
    print(f"  {name}: {old} → {new} ({fname})")

if check_only:
    print(f"sync_claude_md: найдено {len(changes)} расхождений (запусти без --check чтобы исправить)")
    sys.exit(1)

# Применяем замены
for (name, old, new, fname, bullet_rx) in changes:
    content = bullet_rx.sub(r'\g<1>' + str(new) + r'\g<3>', content, count=1)

with open(claude_md, "w") as f:
    f.write(content)

print(f"sync_claude_md: обновлено {len(changes)} записей в CLAUDE.md")
PYEOF
