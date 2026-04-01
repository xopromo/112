#!/usr/bin/env python3
"""
build.py — собирает USE_Optimizer_vX_XX.html из исходников.
Использование: python3 build.py [output.html]

  shell.html    (~1700 строк) — HTML разметка + CSS
  ui.js         (~8700 строк) — основной UI JavaScript
  ui_hc.js      (~1560 строк) — Hill Climbing / GA
  core.js       (~1060 строк) — индикаторы + backtest engine
  opt.js        (~4430 строк) — оптимизатор + тесты устойчивости

Порядок сборки:
  1. opt.js   → разрезаем по SECTION_A/B/C/D
  2. core.js  → убираем заголовок
  3. ui.js    → подставляем OPT_A, CORE, OPT_B, OPT_C, OPT_D, HC
  4. shell.html → подставляем готовый ui через ##UI##
"""
import sys, os, time

out  = sys.argv[1] if len(sys.argv) > 1 else 'USE_Optimizer_v6_built.html'
base = os.path.dirname(os.path.abspath(__file__))

shell    = open(os.path.join(base, 'shell.html'),    encoding='utf-8').read()
core     = open(os.path.join(base, 'core.js'),       encoding='utf-8').read()
opt      = open(os.path.join(base, 'opt.js'),        encoding='utf-8').read()
ui       = open(os.path.join(base, 'ui.js'),         encoding='utf-8').read()
ui_hc    = open(os.path.join(base, 'ui_hc.js'),      encoding='utf-8').read()
ui_ml       = open(os.path.join(base, 'ui_ml.js'),       encoding='utf-8').read()
ui_heatmap  = open(os.path.join(base, 'ui_heatmap.js'),  encoding='utf-8').read()
ui_projects = open(os.path.join(base, 'ui_projects.js'), encoding='utf-8').read()
ui_oos       = open(os.path.join(base, 'ui_oos.js'),       encoding='utf-8').read()
ui_comparator= open(os.path.join(base, 'ui_comparator.js'),encoding='utf-8').read()
ui_queue      = open(os.path.join(base, 'ui_queue.js'),    encoding='utf-8').read()
ui_tvcompare  = open(os.path.join(base, 'ui_tvcompare.js'),encoding='utf-8').read()
ui_detail     = open(os.path.join(base, 'ui_detail.js'),   encoding='utf-8').read()
ui_table      = open(os.path.join(base, 'ui_table.js'),    encoding='utf-8').read()
ui_equity     = open(os.path.join(base, 'ui_equity.js'),   encoding='utf-8').read()
ui_robust     = open(os.path.join(base, 'ui_robust.js'),   encoding='utf-8').read()
ui_parse      = open(os.path.join(base, 'ui_parse.js'),    encoding='utf-8').read()
pine          = open(os.path.join(base, 'pine_export.js'), encoding='utf-8').read()

# ── ML: model + inference + in-browser training ────────────────────────────
_ml_model_path  = os.path.join(base, 'ml', 'model_generated.js')
_ml_signal_path = os.path.join(base, 'ml_signal.js')
_ml_train_path  = os.path.join(base, 'ml_train_browser.js')
ml_parts = []
if os.path.exists(_ml_model_path):
    ml_parts.append(open(_ml_model_path, encoding='utf-8').read())
else:
    ml_parts.append('// ML model not generated yet. Run: python3 ml/train.py')
if os.path.exists(_ml_signal_path):
    ml_parts.append(open(_ml_signal_path, encoding='utf-8').read())
if os.path.exists(_ml_train_path):
    ml_parts.append(open(_ml_train_path, encoding='utf-8').read())
ml_code = '\n'.join(ml_parts)
projects = open(os.path.join(base, 'projects.js'),   encoding='utf-8').read()
research_agent = open(os.path.join(base, 'research_agent.js'), encoding='utf-8').read()
research_analysis = open(os.path.join(base, 'research_analysis.js'), encoding='utf-8').read()
synthesis = open(os.path.join(base, 'synthesis.js'),   encoding='utf-8').read()
synthesis_worker = open(os.path.join(base, 'synthesis_worker.js'), encoding='utf-8').read()
pareto   = open(os.path.join(base, 'pareto_front.js'), encoding='utf-8').read()
synthesis_ui = open(os.path.join(base, 'synthesis_ui.js'), encoding='utf-8').read()

# ── registry files: объединяем в один блок ────────────────────────────────
REGISTRY_FILES = [
    'entry_registry.js',
    'filter_registry.js',
    'exit_registry.js',
    'sl_tp_registry.js',
]
registries = '\n'.join(
    open(os.path.join(base, f), encoding='utf-8').read()
    for f in REGISTRY_FILES
)

# ── opt.js: разрезаем по маркерам секций ──────────────────────────────────
SECS = ['// ##SECTION_A##\n', '// ##SECTION_B##\n',
        '// ##SECTION_C##\n', '// ##SECTION_D##\n']
for s in SECS:
    assert s in opt, f"Marker not found in opt.js: {s!r}"

i_a = opt.index(SECS[0]) + len(SECS[0])
i_b = opt.index(SECS[1])
i_c = opt.index(SECS[2])
i_d = opt.index(SECS[3])

opt_A = opt[i_a              : i_b            ].rstrip('\n')
opt_B = opt[i_b+len(SECS[1]) : i_c            ].rstrip('\n')
opt_C = opt[i_c+len(SECS[2]) : i_d            ].rstrip('\n')
opt_D = opt[i_d+len(SECS[3]) :                ].rstrip('\n')

# ── core.js: отрезаем заголовок, берём только код ─────────────────────────
HDR_END = '// ============================================================\n\n'
assert HDR_END in core, "Header end marker not found in core.js"
core_code = core[core.rindex(HDR_END) + len(HDR_END):].rstrip('\n') + '\n'

# ── Шаг 1: подставляем секции opt/core/registries в ui.js ────────────────
ui_built = ui
for ph, content in [
    ('/* ##REGISTRIES## */', registries),
    ('/* ##OPT_A## */', opt_A),
    ('/* ##CORE## */',  core_code),
    ('/* ##OPT_B## */', opt_B),
    ('/* ##OPT_C## */', opt_C),
    ('/* ##OPT_D## */', opt_D),
    ('/* ##TABLE## */',    ui_table),
    ('/* ##DETAIL## */',   ui_detail),
    ('/* ##ROBUST## */',   ui_robust),
    ('/* ##PARSE## */',    ui_parse),
    ('/* ##EQUITY## */',   ui_equity),
    ('/* ##TVCOMPARE## */', ui_tvcompare),
    ('/* ##QUEUE## */',    ui_queue),
    ('/* ##HC## */',       ui_hc),
    ('/* ##ML_UI## */',    ui_ml),
    ('/* ##HEATMAP## */',    ui_heatmap),
    ('/* ##PROJECTS## */',  ui_projects),
    ('/* ##OOS## */',       ui_oos),
    ('/* ##COMPARATOR## */',ui_comparator),
]:
    assert ph in ui_built, f"Placeholder not found in ui.js: {ph!r}"
    ui_built = ui_built.replace(ph, content, 1)

# ── Шаг 2: подставляем готовый ui в shell ─────────────────────────────────
# ── Шаг 3: вставляем pine_export.js как отдельный <script> перед ##UI##
assert '/* ##ML## */' in shell, "Placeholder ##ML## not found in shell.html"
shell = shell.replace('/* ##ML## */', ml_code, 1)

assert '/* ##PINE## */' in shell, "Placeholder ##PINE## not found in shell.html"
shell = shell.replace('/* ##PINE## */', pine, 1)

assert '/* ##SYNTHESIS## */' in shell, "Placeholder ##SYNTHESIS## not found in shell.html"
shell = shell.replace('/* ##SYNTHESIS## */', synthesis, 1)

assert '/* ##SYNTHESIS_WORKER## */' in shell, "Placeholder ##SYNTHESIS_WORKER## not found in shell.html"
shell = shell.replace('/* ##SYNTHESIS_WORKER## */', synthesis_worker, 1)

assert '/* ##PARETO## */' in shell, "Placeholder ##PARETO## not found in shell.html"
shell = shell.replace('/* ##PARETO## */', pareto, 1)

assert '/* ##SYNTHESIS_UI## */' in shell, "Placeholder ##SYNTHESIS_UI## not found in shell.html"
shell = shell.replace('/* ##SYNTHESIS_UI## */', synthesis_ui, 1)

assert '/* ##RESEARCH_AGENT## */' in shell, "Placeholder ##RESEARCH_AGENT## not found in shell.html"
shell = shell.replace('/* ##RESEARCH_AGENT## */', research_agent, 1)

assert '/* ##RESEARCH_ANALYSIS## */' in shell, "Placeholder ##RESEARCH_ANALYSIS## not found in shell.html"
shell = shell.replace('/* ##RESEARCH_ANALYSIS## */', research_analysis, 1)

assert '/* ##PROJECTS## */' in shell, "Placeholder ##PROJECTS## not found in shell.html"
shell = shell.replace('/* ##PROJECTS## */', projects, 1)

assert '/* ##UI## */' in shell, "Placeholder ##UI## not found in shell.html"
result = shell.replace('/* ##UI## */', ui_built, 1)

# ── Inject build timestamp ─────────────────────────────────────────────────
build_ts_ms = int(time.time() * 1000)
result = result.replace('/* ##BUILD_TS## */ 0', str(build_ts_ms), 1)

open(out, 'w', encoding='utf-8').write(result)
print(f"✅  {out}  ({len(result.splitlines())} строк)")
