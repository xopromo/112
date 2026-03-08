# USE Optimizer — контекст для Claude

> Этот файл читается автоматически при каждом старте Claude Code.
> Обновляй его когда меняется архитектура, статус задач или структура проекта.

---

## Проект: USE Optimizer

Web-инструмент для оптимизации торговых стратегий TradingView.
Принимает данные из Pine Script, запускает backtест по сетке параметров,
ранжирует результаты. Всё в браузере, без сервера.

**Репозиторий:** `112` (github)
**Основная ветка:** `main`
**Рабочая директория:** `/home/user/112/`

### Ключевые файлы проекта
| Файл | Роль |
|------|------|
| `opt.js` | Ядро оптимизатора: MC, TPE, exhaustive бэктест, метрики |
| `core.js` | Бэктест-движок: исполнение сделок, equity curve |
| `pine_export.js` | Генерация Pine Script v6 из результатов |
| `ui.js` | UI: таблица результатов, фильтры, сортировка |
| `shell.html` | Точка входа, импорт всех модулей |
| `USE_Optimizer_v6_built.html` | Собранный бандл (генерируется через `python build.py`) |
| `agent/` | Скрипты исследовательского агента (см. ниже) |

---

## Исследовательский агент

Автоматический pipeline, запускается каждый час по крону.
Исследует новые алгоритмические идеи и реализует лучшие в проект.

### Архитектура (3 уровня)

```
CRON (5 * * * *)
  └── agent/night_research.sh
        └── agent/research_pipeline.sh
              ├── УРОВЕНЬ 1: agent/groq_helper.sh  (Groq/llama-3.3-70b, бесплатно)
              │     • Скачивает 6 URL источников
              │     • Пересказывает каждый в 3-5 пунктов
              │     • Фильтрует "применимо к проекту ДА/НЕТ"
              │     • Оценивает по шкале 1-10
              │     • Генерирует черновик отчёта
              │     • Сохраняет: /tmp/research_digest_YYYY-MM-DD-HH.md
              │
              ├── УРОВЕНЬ 2: claude haiku (~$0.01/цикл)
              │     • Получает только дайджест (не сырые страницы)
              │     • Выбирает 1-2 лучшие гипотезы
              │     • Пишет структурированный план (название, оценка/10,
              │       файл для реализации, 3 пункта что делать)
              │     • Сохраняет: /tmp/research_plan_YYYY-MM-DD-HH.md
              │     • Если нечего делать — пишет "ПРОПУСТИТЬ"
              │
              └── УРОВЕНЬ 3: claude sonnet (~$0.10/цикл, только если есть план)
                    • Получает ТОЛЬКО план от Haiku
                    • Читает нужные файлы проекта
                    • Пишет рабочий JS-код
                    • Создаёт финальный отчёт: research_reports/YYYYMMDDHH.md
                    • Коммитит в ветку claude/research-YYYY-MM-DD-HH
```

**Экономия:** Sonnet токенов -85%, стоимость цикла $0.09 → $0.014

### Файлы агента
| Файл | Роль |
|------|------|
| `agent/groq_helper.sh` | Уровень 1: Groq API wrapper |
| `agent/research_pipeline.sh` | Главный pipeline (вызывает все 3 уровня) |
| `agent/night_research.sh` | Точка входа крона |
| `agent/setup.sh` | Первоначальная установка (cron + symlinks) |
| `agent/sources.txt` | 6 URL источников для исследования |

### API ключи
- Groq: `/home/user/.groq_key` (содержит только ключ, без пробелов)
- Anthropic: переменная `ANTHROPIC_API_KEY` или `/home/user/.anthropic_key`

### Запуск вручную
<!-- НЕ ВЫПОЛНЯТЬ АВТОМАТИЧЕСКИ — только по явной просьбе пользователя
```bash
cd /home/user/112
bash agent/research_pipeline.sh
# или через setup после установки:
bash /home/user/night_research.sh
```
-->

### Установка на новой машине
<!-- НЕ ВЫПОЛНЯТЬ АВТОМАТИЧЕСКИ — только по явной просьбе пользователя
```bash
cd /home/user/112
bash agent/setup.sh
```
-->

---

## Статус реализованных фич

### Влито в main
- [x] **Sig% колонка** — z-тест статистической значимости WR>50%
  - `opt.js`: `_calcStatSig()`, поле `sig` во всех `results.push()`
  - `ui.js`: колонка Sig%, зелёный ≥90%, красный <70%, фильтр + сортировка
- [x] **Pine Script v6** — перевод всех экспортов с v5 на v6
  - `pine_export.js`: `_addActivePinev6()`, 14 групп toggle→deps
  - `active=` скрывает rsi_os/ob, ma_period, pivot_left/right и др.
- [x] **GT-Score** — взвешенная анти-overfitting метрика как цель TPE
  - `opt.js`: `_calcGTScore()`, чекбокс `c_use_gt`, score = GT вместо P/DD
  - `ui.js`: колонка GT-Score, зелёный ≥5, красный <2, фильтр + сортировка
  - Формула: `(pnl/dd) × sig_mult × consistency_mult`
- [x] **UPI** — Ulcer Performance Index (pnl/ulcerIdx, sqrt(mean(dd²)))
  - `opt.js`: `_calcUlcerIdx(eq)`, поле `upi` в results.push()
  - `ui.js`: колонка UPI, зелёный ≥5, жёлтый 2-5, красный <2
- [x] **CPCV** — блочная walk-forward валидация (5 блоков, ленивый вызов)
  - `opt.js`: `_calcCPCVScore(cfg)` — НЕ в results.push(), только в showDetail
  - `ui.js`: секция «📊 CPCV» первой в detail-модале

### Очередь (приоритет по порядку)
1. **Sortino Ratio** — `pnl/downside_vol`, только equity[], ~15 строк в opt.js
   - downside_dev = sqrt(mean(min(Δeq_i, 0)²)); Sortino > 2 = хорошо
   - Источник: research_reports/2026030320.md (поиск 2026-03-03-20)
2. **K-Ratio** — линейная регрессия log(equity), измеряет равномерность роста
   - K = slope/se(slope); OLS ~25 строк; без изменений backtest()
   - Источник: research_reports/2026030320.md
3. **SQN + per-trade array** — добавить `trades:[{pnl}]` в backtest() return (core.js)
   - SQN = (mean_trade/std_trade)*sqrt(n); открывает MC permutation test
   - Источник: research_reports/2026030320.md
4. **WASM** — перевод backtest-цикла на Rust+WASM для x15 ускорения
5. **TradingAgents** — LLM multi-agent анализ стратегий

---

## Текущее состояние агента

Смотри: `STATE.md` — обновляется автоматически после каждого цикла агента и вручную при слиянии веток.
⚠️ Поле «Следующий цикл» в STATE.md может быть устаревшим — игнорируй его, агент запускается по крону `5 * * * *`.

---

## Workflow для новой сессии

1. Прочитай `STATE.md` — там последний цикл и текущие задачи
2. Прочитай `research_reports/` — отчёты агента с деталями
3. Ветки `claude/research-*` содержат готовый код для влития
4. Если агент не работает — сообщи пользователю, не запускай ничего самостоятельно

---

## Веб-поиск — ОБЯЗАТЕЛЬНОЕ ПРАВИЛО

> ⚠️ **ВСЕГДА использовать GitHub Actions для любого поиска.**
> Никогда не использовать встроенный инструмент `WebSearch` или MCP SearXNG.
> Единственное исключение — если пользователь явно разрешил.

### Как запустить поиск

```bash
# Запустить поиск через GitHub Actions (бесплатно, без ключей)
gh workflow run search.yml \
  --repo xopromo/112 \
  -f query="твой запрос" \
  -f mode="summarize" \
  -f max_urls=5

# Подождать завершения (~60-90 сек)
gh run list --repo xopromo/112 --workflow=search.yml --limit 1

# Получить результаты (из ветки search-results через GitHub API)
bash /home/user/112/agent/gh_search.sh "твой запрос" summarize 5
```

### Режимы поиска (mode)

| Mode | Когда использовать |
|------|--------------------|
| `snippets_only` | Нужно быстро посмотреть что вообще есть по теме |
| `summarize` | Нужен обзор темы — 3-5 пунктов на статью |
| `analyze` | Оценка применимости к USE Optimizer (1-10, идеи, файл) |
| `extract` | Нужны конкретные формулы / числа / алгоритмы |
| `full_text` | Нужен полный текст без обработки LLM |
| `custom` | Любая другая задача — задать свой промпт |

### Дедупликация

Workflow автоматически исключает URL из предыдущих поисков.
История хранится в `seen_urls.json` в ветке `search-results`.
Поле `new_results` в итоговом JSON содержит только новые результаты.

### Получение результатов

Результаты сохраняются в `results.json` в ветке `search-results`.
Для чтения — GitHub API (без checkout):
```bash
bash /home/user/112/agent/gh_search.sh <query> <mode> <max_urls>
```

### SearXNG (устарело, не использовать)
<!-- SearXNG был заменён на GitHub Actions search. Оставлен как справка.
- MCP: mcp__searxng__searxng_web_search
- URL: http://localhost:8888
-->

---

## Язык общения

> ⚠️ **ВСЕГДА отвечать и рассуждать на русском языке.**
> Это касается всех ответов, пояснений, комментариев и размышлений.
> Исключение — только сам код (переменные, функции, комментарии в коде на английском).

---

## Договорённости с пользователем

| Команда | Действие |
|---------|----------|
| `"сохрани"` | `git commit` + `git push` |
| `"сохрани стабильную"` | `git commit` + `git push` + тег `stable-YYYY-MM-DD` (если в день несколько — `stable-YYYY-MM-DD-2` и т.д.) |

---

## Сборка проекта

<!-- НЕ ВЫПОЛНЯТЬ АВТОМАТИЧЕСКИ — только по явной просьбе пользователя
```bash
cd /home/user/112
python build.py   # → USE_Optimizer_v6_built.html
```
-->

---

## Правила работы с кодовой базой (экономия токенов)

### ⚠️ Никогда не искать код в USE_Optimizer_v6_built.html
Используй ТОЛЬКО исходники: `opt.js`, `core.js`, `ui.js`, `pine_export.js`.
Builded HTML генерируется из них — он дублирует весь код, тратит вдвое больше токенов.
Проверять что фикс попал в build — только после `python build.py`, и только точечной grep.

### Автоматическое обновление карты функций

`agent/sync_claude_md.sh` — обновляет номера строк в этой карте автоматически.

```bash
bash agent/sync_claude_md.sh          # обновить
bash agent/sync_claude_md.sh --check  # только проверить расхождения
```

**Git post-commit хук** запускает скрипт после каждого коммита:
```bash
bash agent/setup.sh   # установить хук (и всё остальное)
```
Хук также включается при первоначальной установке агента. При обнаружении изменений строк — автоматически амендит предыдущий коммит.

**Когда обновлять вручную** (хук не поможет):
- При слиянии веток агента (`git merge`)
- При изменении архитектуры (новые функции, переименования)
- При изменении описания функции в карте

### Карта ключевых функций

**⚠️ Строки актуальны на момент последнего коммита.**

**opt.js** (оптимизатор + робастность):
| Функция | Строка | Описание |
|---------|--------|----------|
| `parseRange` | 23 | Парсит диапазон параметров |
| `_calcStatSig` | 43 | z-тест статистической значимости |
| `_calcGTScore` | 58 | GT-Score (anti-overfitting метрика) |
| `buildName` | 320 | Строит имя результата |
| `runOpt` | 452 | Основная оптимизация (MC/TPE/exhaustive) |
| `_runOOS` | 493 | Запуск бэктеста на срезе данных (внутри runOpt) |
| `_attachOOS` | 508 | Вычисляет IS/OOS split и прикрепляет к cfg._oos |
| `_calcIndicators` | 2267 | Вычисляет индикаторы по DATA |
| `buildBtCfg` | 2570 | Строит конфиг бэктеста из cfg+ind |
| `runMassRobust` | 2766 | Массовый тест устойчивости |
| `runRobustScoreFor` | 2832 | Тест устойчивости для одного результата |
| `runRobustScoreForDetailed` | 2999 | То же, но с деталями по каждому тесту |
| `HC_NUMERIC_PARAMS` | 3065 | Единый список числовых параметров HC |

**ui.js** (интерфейс + HC):
| Функция | Строка | Описание |
|---------|--------|----------|
| `switchTableMode` | 366 | Переключение HC/Fav/Results режимов |
| `resetAllFilters` | 424 | Сброс всех фильтров |
| `applyFilters` | 439 | Применение фильтров к таблице |
| `runOOSScan` | 2999 | OOS-скан видимых результатов |
| `openHCModal` | 3192 | Открыть модал поиска соседей |
| `_hcRobScore` | 3291 | Робастность для GA-поиска |
| `_hcRunBacktest` | 3495 | Быстрый бэктест для HC (с кэшем `_robSliceCache`) |
| `_hcNeighbours` | 3682 | Генерация соседних cfg (содержит `mutate()`) |
| `runHillClimbing` | 3813 | Главный HC алгоритм |
| `_hcOpenDetail` | 4574 | Открыть детальный вид из HC модала |

**pine_export.js** (экспорт Pine Script):
| Функция | Строка | Описание |
|---------|--------|----------|
| `generatePineScript` | 19 | Главная функция экспорта в Pine v6 |
| `fixPineScript` | 1259 | Автоисправление ошибок Pine |
| `_addActivePinev6` | 1375 | Добавляет `active=` для toggle-групп |

**core.js** (движок бэктеста):
| Функция | Строка | Описание |
|---------|--------|----------|
| `backtest` | 360 | Основной бэктест-цикл |

### Форматы ключевых объектов

Быстрая справка по полям — чтобы не читать код при каждой задаче.

**`backtest()` → результат** (core.js:749):
```
{ pnl, wr, n, dd, avg, dwr,
  p1, w1, c1, p2, w2, c2,   // p=период1/2 win%, w=wr1/2, c=count1/2
  eq[],                       // equity curve: cumPnL на каждом баре
  nL, pL, wrL,               // Long: кол-во, PnL, wr
  nS, pS, wrS,               // Short: кол-во, PnL, wr
  dwrLS }                    // |wrL - wrS|, null если нет обеих сторон
```

**`cfg._oos`** — прикрепляется `_attachOOS()` (opt.js:286):
```
{
  isPct: 70,          // % IS от общего DATA (обычно 70)
  forward: null       // null если rFull не прошёл проверку
    | {
        pnl,          // OOS PnL = eq[end] - eq[splitIdx]
        retention,    // oosRate/isRate, clamp[-2,2]; -1 если IS не вырос значимо
        isGain,       // IS PnL = eq[splitIdx]
        pnlFull,      // полный PnL (IS+OOS)
        n, wr, dd, avg, pdd,         // метрики полного прогона
        dwr, p1, p2, c1, c2,
        wrL, nL, wrS, nS, dwrLS,
        cvr           // _calcCVR(rFull.eq)
      }
}
```

**`results[]` / строка таблицы** (то что попадает в `_hcTableResults`, `results`):
```
{ name, cfg,
  pnl, wr, n, dd, pdd, avg, dwr,
  p1, p2, c1, c2,
  sig,               // _calcStatSig(r) — z-тест
  gt,                // _calcGTScore(r) — GT-Score
  cvr,               // Calmar-вариант
  eq[],              // equity curve (от _attachOOS или raw backtest)
  nL, pL, wrL, nS, pS, wrS, dwrLS,
  robScore?, robMax?, robDetails?   // только если был rob-тест
}
```

**`_hcFoundResults[i]`** (до push в таблицу):
```
{ cfg, r: <backtest result>, score, delta, robScore?, robMax?, robDetails? }
```

**`showDetail(r)` ожидает** (ui.js:761):
```
r.cfg._oos          → IS/OOS split + TV-строка (если null — только одна строка)
r.cfg._oos.forward  → данные TV-строки; null → TV-строка скрыта
r.eq[]              → equity curve для графика (с full-data если _oos есть)
r.pnl/wr/n/dd/...   → IS-метрики (первая строка)
```

### IS/OOS архитектура (как работает split)

Для каждого результата оптимизатора нужен `cfg._oos` чтобы:
- `drawEquityForResult` рисовал линию разделения IS/OOS на графике (70%/30%)
- `showDetail` показывал вторую строку "TradingView · полный бэктест"
- TV-колонки в таблице (`col-tv-score` и др.) не показывали `—`

**TPE/MC результаты** — `cfg._oos` вычисляется батчем в `runOpt()` → `_attachOOS()`:
- IS backtest = первые 70% данных (`_runOOS(DATA.slice(0, isN), cfg)`)
- Full backtest = 100% данных (`backtest(...)` на полных данных)
- `cfg._oos.forward` содержит PnL/DD full-prогона + метрики retention

**HC результаты** — соседи генерируются через `_hcNeighbours.mutate()`:
- `mutate()` делает `delete c._oos` → соседи НЕ наследуют `_oos` родителя
- HC результаты в таблице показывают метрики только полного прогона (без TV/IS split)
- Чтобы добавить split для HC — нужно реализовать `_hcBuildOOS(cfg)` аналогично `_attachOOS`
  (вызывать при `_hcTableResults.push` и в `_hcOpenDetail`)

### Правило: прогрев индикаторов (warmup) в filter_registry.js

> ⚠️ **При добавлении нового фильтра, использующего MA или любой другой индикатор с периодом прогрева:**
>
> JS инициализирует `Float64Array` нулями → первые `period-1` баров = 0.
> Pine возвращает `na` → любое сравнение с `na` = `false` → сигнал заблокирован.
>
> **Правило:** если `indicatorArr[i-1] <= 0` → **блокировать** сигнал (возвращать `true` из `blocksL`/`blocksS`).
>
> **Пример правильной реализации:**
> ```javascript
> blocksL: (cfg, i) => {
>   if (!cfg.maArr) return false;
>   const ma = cfg.maArr[i-1];
>   return ma <= 0 || DATA[i-1].c <= ma; // ma<=0 = не прогрелась
> }
> ```
>
> **Затронутые индикаторы:** WMA(N) и SMA(N) = 0 для первых N-1 баров. EMA не страдает (seed=close[0]).
> **Уже исправлено:** фильтры `ma`, `confirm`, `strend` (commit 991ebaf).

### Известные баги (зафиксированы)
- **_stopCheck() bug**: `_stopCheck = () => !_massRobRunning && !_hcRobRunning` — возвращает true если оба флага false. При запуске тестов всегда нужно установить один из флагов.
  - ✅ Исправлено для: HC doRobFilter Phase 2, HC rob-metric Phase 2, OOS scan, runHillClimbing (строки 3776, 3930).
  - ⚠️ НЕ исправлено для: прямых вызовов `runRobustScoreFor` / `runRobustScoreForDetailed` без контекста HC/Mass.
- **HC без IS/OOS split**: `mutate()` удаляет `cfg._oos` у соседей → HC результаты в таблице не имеют TV-колонок и split-линии на графике. Частично приемлемо (показываются full-data метрики). Полное решение — `_hcBuildOOS()` (не реализовано).
