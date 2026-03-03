# Состояние исследовательского агента

> Обновляется автоматически после каждого цикла агента.
> Также обновляй вручную когда вливаешь ветки в main.

## Последняя ручная сессия
- **Дата:** 2026-03-03 18:43
- **Ветка:** `main`
- **Последние коммиты:**
  - 25aafe2 fix: убрать несуществующую _hcBuildOOS из карты CLAUDE.md (функция не реализована)
  - 2191932 chore: автообновление CLAUDE.md через git post-commit хук
  - 419e1ad fix: HC results теперь имеют IS/OOS данные (split-линия, TV метрики, вторая строка)
  - fa4e11d fix: HC neighbor cfgs inherited stale _oos from parent, causing false IS>TV display
  - 4cb0e94 fix: IS>TV trades bug + missing indicators in MC/TPE btCfg

## Последний цикл
- **Дата:** 2026-03-03-07
- **Ветка:** `claude/research-2026-03-03-07`
- **Статус:** ПРОПУСТИТЬ (нет идей)
- **Реализовано:** Sig% колонка (z-тест) + Pine Script v6 с active=
- **Стоимость:** ~$0.014

## Агент
- **Cron:** `5 * * * * /home/user/night_research.sh`
- **Groq ключ:** `/home/user/.groq_key`
- **Скрипты:** `/home/user/112/agent/` (симлинки в `/home/user/`)
- **Отчёты:** `/home/user/112/research_reports/`

## Очередь задач (приоритет)
1. **CPCV валидация** — combinatorial IS/OOS вместо одного split
2. **WASM** — Rust+WASM для x15 ускорения backtest-цикла
3. **TradingAgents** — LLM multi-agent анализ стратегий

## Влито в main
| Дата | Фича | Ветка |
|------|------|-------|
| 2026-02-28 | Sig% колонка + Pine v6 active= | claude/research-2026-02-28-08 |
| 2026-03-01 | GT-Score как цель оптимизации TPE | claude/gt-score-merge-session_01B6Qi3ErCmMAnoAKSAEpQ7c |

## Следующий цикл
- **Ожидается:** 2026-02-28 09:05
- **Источники:** см. `agent/sources.txt`
