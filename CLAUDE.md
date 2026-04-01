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
| `ui.js` | Таблица, фильтры, детали, очередь, TV-comparator |
| `ui_hc.js` | Hill Climbing + GA (~1558 строк) |
| `ui_ml.js` | ML модели + feature screening (~999 строк) |
| `ui_heatmap.js` | Карта параметров (~260 строк) |
| `ui_projects.js` | Управление проектами (~230 строк) |
| `ui_oos.js` | OOS-скан + OOS-сравнение (~1348 строк) |
| `ui_comparator.js` | MSC конфиг + OOS торговая диагностика (~578 строк) |
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
- `_calcIndicators` (3469) — пересчёт MA, ATR и др.
- `runOpt` (939) — главный цикл (MC/TPE/Ex)
- `_runOOS` (1002) — OOS прогон
- `_attachOOS` (1017) — IS/OOS split
- `buildBtCfg` (3843) — сборка cfg для бэктеста
- `runMassRobust` (4099) — массовый тест устойчивости
- `HC_NUMERIC_PARAMS` (4419) — список параметров HC

**ui.js**:
- `showDetail` (20) — standard detail панель
- `switchTableMode` (15) — HC/Fav/Results
- `applyFilters` (412) — применение фильтров таблицы
- `resetAllFilters` (396) — сброс фильтров
- `runOOSScan` (3) — OOS сканирование (→ ui_oos.js:3)

**ui_hc.js**:
- `openHCModal` (1) — открыть HC окно
- `_hcRunBacktest` (304) — HC бэктест с кэшем
- `_hcNeighbours` (491) — поиск соседей HC
- `runHillClimbing` (622) — главный HC цикл
- `_hcOpenDetail` (1389) — HC detail панель

**ui_ml.js**:
- `openMLModal` (86) — открыть ML модал
- `openMLScanModal` (622) — открыть вкладку скан
- `runMLFeatureScreening` (900) — ML feature screening

**ui_oos.js**:
- `runOOSScan` (3) — массовый OOS-скан видимых результатов
- `openOOSCompareModal` (379) — открыть OOS-сравнение
- `openOOSDiagnostic` (716) — запуск OOS диагностики
- `runOOSOnNewData` (1169) — OOS-прогон на новых данных

**ui_comparator.js**:
- `_checkMSCConfig` (3) — загрузить настройки из MSC
- `parseTextToSettings` (→ ui.js) — парсинг текста настроек
- `showOOSTradeDiag` (479) — UI диагностики расхождений
- `runOOSTradeDiag` (534) — запуск сравнения сделок

**core.js**:
- `_calcAdaptiveMultipliers` (520) — расчет адаптивных множителей TP/SL
- `backtest` (564) — основной бэктест (принимает pvLo,pvHi,atrArr,cfg)
- `calcHTFADX` (231) — ADX на HTF через группировку баров

**pine_export.js**:
- `generatePineScript` (20) — экспорт Pine индикатора
- `generatePineStrategy` (1842) — экспорт Pine стратегии (strategy.exit)
- `fixPineScript` (1851) — автоисправление Pine v5→v6
- `_addActivePinev6` (1967) — toggle-группы Pine v6

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
