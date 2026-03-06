# Состояние исследовательского агента

> Обновляется автоматически после каждого цикла агента.
> Также обновляй вручную когда вливаешь ветки в main.

## Последняя ручная сессия
- **Дата:** 2026-03-06 20:57
- **Ветка:** `main`
- **Последние коммиты:**
  - 42cd56f feat: new entry params iterate ranges + showDetail entries section
  - 8a26e3d fix: missing closing paren in pine_export.js pat_s line
  - 3e6e401 chore: update STATE.md
  - 243dcc8 Fix CPCV batch, maxDD unrealized DD, Pine Script new entries
  - 8d37d4d fix: correct TL checkbox IDs in calcTotal and entry_registry

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
