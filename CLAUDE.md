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

### Перед пушем

```bash
bash .claude/scripts/dumb-checks.sh  # Блокирует пуш если есть ошибки
```

**Детали**: см. `.claude/memory/push-checklist.md`

### 🎯 Pattern-First подход (ВАЖНО!)

Когда находишь баг:

0. **Классифицируй БАГ** (CLASS A или CLASS B?)
   - CLASS A (ПАТТЕРН) → обобщить в правило ОБЯЗАТЕЛЬНО
   - CLASS B (случайная ошибка) → просто исправить
   - Подробнее: `.claude/memory/pattern-classification-guide.md`

1. **Определи ПАТТЕРН** (это класс проблем, а не один баг)
   - Float32Array corruption → Reference Sharing Corruption (общий паттерн)

2. **Напиши ПРАВИЛО** (обобщенное решение)
   - Copy-on-Storage Pattern → все Array/Object должны копироваться

3. **Добавь в АУДИТ** (проверка в dumb-checks.sh, не отдельный скрипт!)
   - Rule 10 проверяет ВСЕ случаи этого паттерна

4. **Исправь ВСЕ СРАЗУ** (не волнами!)
   - FULL SEARCH → находишь все 22 места → исправляешь за один раз

5. **Документируй** (whiteboard + whitelist)
   - .claude/memory/pattern-bugs-whiteboard.md отслеживает все cases
   - .claude/rules/forbidden-patterns.md описывает что нельзя

**Запрещено:**
- ❌ Частные скрипты (float32-audit.sh, eq-check.sh) БЕЗ обобщения
- ❌ Исправления волнами (волна 1, потом волна 2, потом волна 3)
- ❌ Paттерн-специфичные проверки вместо универсальных
- ❌ Классифицировать CLASS A баг как CLASS B (забывание)

**Детали**: см. 
- `.claude/rules/pattern-bug-methodology.md` — как мыслить паттернами
- `.claude/memory/pattern-classification-guide.md` — как определить CLASS

### 🎯 3-Уровневый Подход к Решению Проблем

**УРОК из ВОЛНЫ 10-14 (бандл конфликты):**

Когда встречишь НОВУЮ проблему - проверь уровни в этом порядке:

**Уровень 1: КОРНЕВАЯ ПРИЧИНА (обязательно первым!)**
```
Вопросы:
✅ Это генерируемый файл? (*.built.html, dist/, build/) → .gitignore
✅ Это конфигурация? → конфиг файлы в repo
✅ Это данные/артефакты? → .gitignore
✅ Это исходник? → в git

❌ ЗАПРЕЩЕНО: Защищать артефакты в git
✅ ПРАВИЛЬНО: Удалить из git и добавить в .gitignore
```

**Уровень 2: ЗАЩИТА ПРОЦЕССА (только если нужна)**
```
Если ЛЮДИ забывают делать что-то:
- RULE в dumb-checks.sh (локальная защита перед пушем)
- Только для человеческих ошибок
- Работает: локально до пуша
- НЕ работает: в GitHub, после пуша
```

**Уровень 3: ДОКУМЕНТАЦИЯ**
```
- forbidden-patterns.md (для памяти)
- CLAUDE.md (для навигации)
- Это просто информация, не защита
```

**Анти-паттерн (НЕ делай!):**
```
❌ Уровень 3 (документация) → Уровень 2 (защита) → Уровень 1 (корень)
   Это НАЗАД - сначала пробуешь защищать, потом документируешь

✅ Уровень 1 (корень) → Уровень 2 (защита) → Уровень 3 (документ)
   Сначала решаешь причину, потом защищаешь процесс, потом документируешь
```

### 🔐 Loop Prevention (защита от infinite loops)

**Уровень 1: В МОМЕНТ ИСПОЛНЕНИЯ (за минуту)**

```
TIMEOUT: максимум 5 минут работы
    └─ Если дольше → exit с ошибкой

MAX PASSES: максимум 50 проходов
    └─ Если больше → exit с ошибкой

CONVERGENCE: результат не меняется?
    └─ Если 2 раза подряд = одинаково → выход
```

Реализовано в: `regression-detector.js` (защита на уровне скрипта)

**Уровень 2: НА УРОВНЕ КОММИТОВ (за месяц)**

Каждый паттерн имеет **STATUS**:

```
OPEN    — Паттерн открыт, можно исправлять
PARTIAL — Часть исправлена, нужно доисправить
CLOSED  — ВСЕ исправлено → дальше ЗАПРЕЩЕНО искать
```

RULE 13 в dumb-checks.sh (защита перед пушем)

**Процесс:**
```
Диагностика находит баг
    ↓
ПРОВЕРЯЕМ WHITEBOARD: статус паттерна?
    ├─ CLOSED → "Уже исправлен, дальше не ищем"
    ├─ PARTIAL → "Нужно доисправить"
    └─ OPEN → "Новый, начинаем"
    ↓
Исправляем ВСЕ СРАЗУ → STATUS: CLOSED
    ↓
RULE 13 блокирует волны (паттерн закрыт → волна 5 запрещена)
```

**Результат:** Двойная защита!
- ✅ В момент: скрипт упадёт за 5 минут (не сделает миллион проверок)
- ✅ На коммит: RULE 13 блокирует волны (месячная защита)

**Детали**: см. `.claude/rules/loop-prevention-policy.md`

### Критичные правила

| Правило | Файл | Штраф |
|---------|------|-------|
| **Классифицируй баг** (CLASS A паттерн vs CLASS B ошибка) | .claude/memory/pattern-classification-guide.md | Amnesia-driven development |
| **Pattern-First подход** (определи паттерн перед исправлением) | .claude/rules/pattern-bug-methodology.md | Инкрементальные исправления |
| **Copy-on-Storage Pattern** (Array/Object ВСЕГДА копировать) | dumb-checks.sh (Rule 10) | Reference corruption |
| **Loop Prevention** (паттерны имеют STATUS: OPEN/PARTIAL/CLOSED) | .claude/rules/loop-prevention-policy.md (Rule 13) | Infinite loops |
| **FULL SEARCH перед фиксом паттерна** | dumb-checks.sh (Rule 8,9,10) | Pre-push блокирует |
| 3 версии _cfg (_cfg, _cfg_tpe, _cfg_ex) одновременно | opt.js:1909,2265,2847 | OOS скалывается |
| Все фильтры WITH warmup проверка (indicator <= 0) | filter_registry.js | JS ≠ TV |
| Новый фильтр в 4 местах (ui, opt, filter_registry, buildBtCfg) | Сеч. 🚫 | Баг |
| Запрещены: console.log, hardcoded цвета, частные скрипты БЕЗ обобщения | .claude/rules/ | Pre-push блокирует |

---

## 📚 Документация

- **`.claude/memory/architecture-decisions.md`** — какие решения приняты и почему
- **`.claude/memory/integration-contracts.md`** — контракты между модулями (backtest, cfg, result)
- **`.claude/memory/eq-reference-bug-analysis.md`** — анализ Float32Array corruption bug + fix
- **`.claude/memory/investigation-methodology.md`** — FULL SEARCH правило (сохранено как напоминание)
- **`.claude/memory/tasks-completed.md`** — архив решённых задач
- **`.claude/rules/forbidden-patterns.md`** — запрещённые паттерны (dumb-checks.sh их блокирует)
- **`.claude/rules/regression-testing-policy.md`** — VERIFICATION-FIRST: только правила с 0 issues
- **`.claude/rules/deployment-safety-policy.md`** — ⚠️ **КРИТИЧНО!** Защита от потери кода (инцидент 2026-04-04)
  - 4-уровневая система: Backup, CI/CD, Pre-push Protection, Monitoring
  - RULE 17 в dumb-checks.sh блокирует удаление критичных файлов
  - Чёткий процесс развёртывания без ручных ошибок

## 🧪 Инструменты

**Регрессионное тестирование**: `.claude/memory/testing-tools.md`
**Логирование ошибок & синтез правил**: `.claude/memory/knowledge-accumulation.md`

---

## 🔍 Ключевые функции (компактная карта)

> Номера строк обновляются автоматически хуком post-commit (`agent/sync_claude_md.sh`)

**opt.js**:
- `parseRange` (23) — парсер диапазона
- `_calcStatSig` (95) — z-тест WR > 50%
- `_calcGTScore` (110) — anti-overfitting метрика
- `_calcIndicators` (3689) — пересчёт MA, ATR и др.
- `runOpt` (991) — главный цикл (MC/TPE/Ex)
- `_runOOS` (1054) — OOS прогон
- `_attachOOS` (1072) — IS/OOS split
- `buildBtCfg` (4082) — сборка cfg для бэктеста
- `runMassRobust` (4358) — массовый тест устойчивости
- `HC_NUMERIC_PARAMS` (4678) — список параметров HC

**ui.js**:
- `showDetail` (20) — standard detail панель
- `switchTableMode` (15) — HC/Fav/Results
- `applyFilters` (412) — применение фильтров таблицы
- `resetAllFilters` (396) — сброс фильтров
- `runOOSScan` (39) — OOS сканирование (→ ui_oos.js:3)

**ui_hc.js**:
- `openHCModal` (1) — открыть HC окно
- `_hcRunBacktest` (304) — HC бэктест с кэшем
- `_hcNeighbours` (590) — поиск соседей HC
- `runHillClimbing` (721) — главный HC цикл
- `_hcOpenDetail` (1490) — HC detail панель

**ui_ml.js**:
- `openMLModal` (86) — открыть ML модал
- `openMLScanModal` (622) — открыть вкладку скан
- `runMLFeatureScreening` (900) — ML feature screening

**ui_oos.js**:
- `runOOSScan` (3) — массовый OOS-скан видимых результатов
- `openOOSCompareModal` (379) — открыть OOS-сравнение
- `openOOSDiagnostic` (752) — запуск OOS диагностики
- `runOOSOnNewData` (1169) — OOS-прогон на новых данных

**ui_comparator.js**:
- `_checkMSCConfig` (3) — загрузить настройки из MSC
- `parseTextToSettings` (→ ui.js) — парсинг текста настроек
- `showOOSTradeDiag` (479) — UI диагностики расхождений
- `runOOSTradeDiag` (534) — запуск сравнения сделок

**core.js**:
- `_calcAdaptiveMultipliers` (520) — расчет адаптивных множителей TP/SL
- `backtest` (621) — основной бэктест (принимает pvLo,pvHi,atrArr,cfg)
- `calcHTFADX` (231) — ADX на HTF через группировку баров

**pine_export.js**:
- `generatePineScript` (20) — экспорт Pine индикатора
- `generatePineStrategy` (1890) — экспорт Pine стратегии (strategy.exit)
- `fixPineScript` (1899) — автоисправление Pine v5→v6
- `_addActivePinev6` (2015) — toggle-группы Pine v6

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
