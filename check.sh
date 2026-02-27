#!/bin/bash
# check.sh — сборка + проверка синтаксиса за один вызов
# Использование: bash check.sh
set -e
cd "$(dirname "$0")"

echo "▶ Build..."
python3 build.py

echo ""
echo "▶ Syntax check..."
python3 - <<'EOF'
import re, subprocess, sys

with open('USE_Optimizer_v6_built.html', 'r') as f:
    html = f.read()

scripts = re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL)
ok = True

for i, s in enumerate(scripts):
    with open(f'/tmp/chk_{i}.js', 'w') as f2:
        f2.write(s)

for i in range(len(scripts)):
    r = subprocess.run(['node', '-c', f'/tmp/chk_{i}.js'], capture_output=True, text=True)
    if r.returncode == 0:
        print(f'  script[{i}]: OK')
    else:
        print(f'  script[{i}]: ERROR')
        print(f'    {r.stderr.strip()[:400]}')
        ok = False

sys.exit(0 if ok else 1)
EOF

echo ""
echo "▶ Regression check..."
python3 check_regression.py

echo ""
echo "✓ Done"
