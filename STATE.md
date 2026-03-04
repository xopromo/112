# Состояние исследовательского агента

> Обновляется автоматически после каждого цикла агента.
> Также обновляй вручную когда вливаешь ветки в main.

## Последняя ручная сессия
- **Дата:** 2026-03-04 08:36
- **Ветка:** `main`
- **Последние коммиты:**
  - 7698ab7 fix: 3 критических бага — TPE slowdown, Pine minval, результаты ≠ TV
  - 77db51c perf: fix progressive TPE slowdown — 3 optimizations
  - 4357121 chore: update STATE.md
  - 37aac7a perf: cache tfSigL/tfSigS in _calcIndicators to fix TPE slowdown
  - b64ff96 chore: update STATE.md

## Последний цикл
- **Дата:** 2026-03-03-20 (ручной исследовательский цикл)
- **Статус:** ВЫПОЛНЕН — найдено 3 новые задачи
- **Поиски:** SQN+K-Ratio+Sortino / Regime detection / Bootstrap permutation test
- **Отчёт:** `research_reports/2026030320.md`

## Агент
- **Cron:** `5 * * * * /home/user/night_research.sh`
- **Groq ключ:** `/home/user/.groq_key`
- **Скрипты:** `/home/user/112/agent/` (симлинки в `/home/user/`)
- **Отчёты:** `/home/user/112/research_reports/`

## Очередь задач (приоритет)
1. **Sortino Ratio** — pnl/downside_vol, как UPI но для волатильности потерь. Только equity[], ~15 строк
2. **K-Ratio** — линейная регрессия log(equity), измеряет равномерность роста. OLS ~25 строк
3. **SQN + per-trade array** — добавить trades:[{pnl}] в backtest() return → SQN + будущий MC permutation test
4. **WASM** — Rust+WASM для x15 ускорения backtest-цикла
5. **TradingAgents** — LLM multi-agent анализ стратегий

## Влито в main
| Дата | Фича | Ветка |
|------|------|-------|
| 2026-02-28 | Sig% колонка + Pine v6 active= | claude/research-2026-02-28-08 |
| 2026-03-01 | GT-Score как цель оптимизации TPE | claude/gt-score-merge-session_01B6Qi3ErCmMAnoAKSAEpQ7c |
| 2026-03-03 | UPI (Ulcer Performance Index) | main direct |
| 2026-03-03 | CPCV блочная валидация | main direct |

## Следующий цикл
- **Ожидается:** auto (cron 5 * * * *)
- **Источники:** см. `agent/sources.txt`
