# Состояние исследовательского агента

> Обновляется автоматически после каждого цикла агента.
> Также обновляй вручную когда вливаешь ветки в main.

## Последний цикл
- **Дата:** 2026-03-01
- **Ветка:** `claude/continue-project-112-ODvvw`
- **Статус:** ВЫПОЛНЕНО
- **Реализовано:** Sharpe Ratio колонка + Profit Factor колонка + CPCV upgrade CVR%
- **Стоимость:** ручная сессия

## Агент
- **Cron:** `5 * * * * /home/user/night_research.sh`
- **Groq ключ:** `/home/user/.groq_key`
- **Скрипты:** `/home/user/112/agent/` (симлинки в `/home/user/`)
- **Отчёты:** `/home/user/112/research_reports/`

## Очередь задач (приоритет)
1. **GT-Score** ✅ — влито в main
2. **CVR% → CPCV** ✅ — CVR переработана в leave-one-out CPCV retention метрику
3. **Sharpe Ratio** ✅ — новая колонка в таблице
4. **Profit Factor** ✅ — новая колонка + трекинг в core.js
5. **WASM** — Rust+WASM для x15 ускорения backtest-цикла
6. **TradingAgents** — LLM multi-agent анализ стратегий

## Влито в main
| Дата | Фича | Ветка |
|------|------|-------|
| 2026-02-28 | Sig% колонка + Pine v6 active= | claude/research-2026-02-28-08 |

## Следующий цикл
- **Ожидается:** 2026-02-28 09:05
- **Источники:** см. `agent/sources.txt`
