# USE Optimizer — краткая навигация

> Этот файл — навигационный слой. Подробно — в `.claude/memory/` и `.claude/rules/`

---

## 📍 Проект: USE Optimizer

Web-инструмент оптимизации торговых стратегий TradingView (браузер, без сервера).
- **Repo**: `xopromo/112`
- **Branch**: `main` (пуш запрещён, используй `claude/*`)
- **Deploy**: GitHub Pages → `xopromo.github.io/112/USE_Optimizer_v6_built.html`

---

## 🗂️ Структура файлов

| Файл | Роль |
|------|------|
| `opt.js` | Оптимизатор: MC/TPE/Exhaustive, метрики |
| `core.js:378` | backtest() — ядро |
| `ui.js` | Таблица, фильтры, детали, HC |
| `pine_export.js:19` | Экспорт Pine v6 |
| `shell.html` | Точка входа |
| `USE_Optimizer_v6_built.html` | Бандл (python build.py) |

---

## 🤖 Исследовательский агент (запускается по крону)

**3-уровневый pipeline** (агент/research_pipeline.sh):
1. **Groq** (llama-3.3-70b) — 6 URL, дешево
2. **Haiku** (~$0.01) — фильтр к 1-2 гипотезам
3. **Sonnet** (~$0.10) — код (только если есть план)

Результат → `research_reports/YYYYMMDDHH.md`

---

## 🚀 Правила разработки

### Перед пушем всегда

```bash
git fetch origin main && git merge origin/main --no-edit || true
python build.py
bash .claude/scripts/dumb-checks.sh  # Проверка ошибок
git add -A && git commit -m "..."
git push -u origin claude/ваша-ветка
```

### Критичные правила

| Правило | Файл | Штраф |
|---------|------|-------|
| 3 версии _cfg (_cfg, _cfg_tpe, _cfg_ex) одновременно | opt.js:1909,2265,2847 | OOS скалывается |
| Все фильтры WITH warmup проверка (indicator <= 0) | filter_registry.js | JS ≠ TV |
| Новый фильтр в 4 местах (ui, opt, filter_registry, buildBtCfg) | Сеч. 🚫 | Баг |
| Запрещены: console.log, hardcoded цвета, вложенные ternary | .claude/rules/ | Pre-push блокирует |

---

## 📚 Документация

- **`.claude/memory/architecture-decisions.md`** — какие решения приняты и почему
- **`.claude/memory/integration-contracts.md`** — контракты между модулями (backtest, cfg, result)
- **`.claude/memory/tasks-completed.md`** — архив решённых задач
- **`.claude/rules/forbidden-patterns.md`** — запрещённые паттерны (dumb-checks.sh их блокирует)

---

## 🔍 Ключевые функции (компактная карта)

> Номера строк обновляются автоматически хуком post-commit (`agent/sync_claude_md.sh`)

**opt.js**:
- `parseRange` (23) — парсер диапазона
- `_calcStatSig` (67) — z-тест WR > 50%
- `_calcGTScore` (82) — anti-overfitting метрика
- `_calcIndicators` (3362) — пересчёт MA, ATR и др.
- `runOpt` (936) — главный цикл (MC/TPE/Ex)
- `_runOOS` (991) — OOS прогон
- `_attachOOS` (1006) — IS/OOS split
- `buildBtCfg` (3736) — сборка cfg для бэктеста
- `runMassRobust` (3984) — массовый тест устойчивости
- `HC_NUMERIC_PARAMS` (4304) — список параметров HC

**ui.js**:
- `showDetail` (1263) — standard detail панель
- `switchTableMode` (447) — HC/Fav/Results
- `applyFilters` (844) — применение фильтров таблицы
- `resetAllFilters` (828) — сброс фильтров
- `runOOSScan` (5286) — OOS сканирование
- `openHCModal` (5603) — открыть HC окно
- `_hcRunBacktest` (5906) — HC бэктест с кэшем
- `_hcNeighbours` (6093) — поиск соседей HC
- `runHillClimbing` (6224) — главный HC цикл
- `_hcOpenDetail` (6991) — HC detail панель
- `openOOSDiagnostic` (7562) — запуск OOS диагностики
- `showOOSTradeDiag` (10149) — UI диагностики расхождений

**core.js**:
- `backtest` (521) — основной бэктест (принимает pvLo,pvHi,atrArr,cfg)
- `calcHTFADX` (231) — ADX на HTF через группировку баров

**pine_export.js**:
- `generatePineScript` (20) — экспорт Pine индикатора
- `generatePineStrategy` (1791) — экспорт Pine стратегии (strategy.exit)
- `fixPineScript` (1800) — автоисправление Pine v5→v6
- `_addActivePinev6` (1916) — toggle-группы Pine v6

---

## ⚡ Быстрые действия

**Найти баг в расчётах**:
```bash
# 1. Загрузи TV CSV (кнопка в detail панели)
# 2. Сравни equity% поэтапно
# 3. Найди первое расхождение > 0.5%
# 4. Проверь SL/TP логику на этом баре
```

**Добавить новый параметр**:
1. Добавить в `_cfg` (opt.js ~1909)
2. Добавить в `_cfg_tpe` (opt.js ~2265)
3. Добавить в `_cfg_ex` (opt.js ~2847)
4. Добавить в `_calcIndicators` если нужен массив
5. Добавить в `buildBtCfg`
6. Добавить в UI если нужна настройка

**Добавить новый фильтр**:
1. Написать в `filter_registry.js`
2. Добавить в `buildBtCfg` (opt.js)
3. Добавить в 3 версии _cfg если параметр
4. ✅ Проверить warmup (indicator <= 0 блокирует)

---

## 🔗 Ссылки

- **PR**: https://github.com/xopromo/112/compare/main...<ветка>
- **Site**: https://xopromo.github.io/112/USE_Optimizer_v6_built.html
- **Memory**: `.claude/memory/` (архитектура, контракты, задачи)
- **Rules**: `.claude/rules/` (запрещённые паттерны)

---

## 📞 Когда нужна помощь

1. Прочитай `.claude/memory/architecture-decisions.md` — ответ часто там
2. Посмотри `.claude/memory/tasks-completed.md` — может уже реализовано
3. Запусти `bash .claude/scripts/dumb-checks.sh` — блокирует типичные ошибки
4. Спроси в PR комментарии

---

## 📝 История версий

- **v6** (текущая) — Pine v6 экспорт, GT-Score, IS/OOS split
- **v5** (deprecated) — Pine v5, нет IS/OOS

**Стабильные ветки**: `stable-YYYY-MM-DD*` (теги в GitHub)
