# USE Optimizer v6 — MANIFEST

> **Для Claude: читай этот файл ПЕРВЫМ перед любым изменением кода.**
> После любого изменения — обновляй раздел "История изменений" и проверяй "Контрольный список".

---

## Как работать с проектом

### Структура файлов
```
shell.html      — HTML разметка + CSS (~1756 строк)
ui.js           — UI JavaScript (~4722 строк)
core.js         — индикаторы + движок бэктеста (~754 строк)
opt.js          — оптимизатор + тесты устойчивости + OOS (~2290 строк)
pine_export.js  — генератор Pine Script v5 (~1081 строк)
build.py        — сборщик HTML из четырёх файлов (~70 строк)
```

### Важное правило
**Никогда не читать и не редактировать `USE_Optimizer_v6_built.html` напрямую.**
Это артефакт сборки. Все правки — только в исходных файлах выше, затем `python3 build.py`.

### Сборка + проверка синтаксиса (одна команда)
```bash
bash check.sh
```

### Обновить номера строк в MANIFEST.md
```bash
python3 refresh_manifest.py           # обновить
python3 refresh_manifest.py --check   # только показать расхождения
```
Запускай после любой правки, которая добавляет/удаляет строки в исходниках.

---

## Правила для Claude

1. **Перед изменением любого файла** — открой его и найди место которое будешь менять.
   Убедись что рядом нет критичных функций из контрольного списка ниже.

2. **Используй точечные правки** (Edit tool) — никогда не переписывай большие блоки целиком.

3. **После каждого изменения** — пересобери HTML и проверь синтаксис.

4. **После каждого изменения** — обнови раздел "История изменений" в этом файле.

5. **Никогда не трогай** функции из раздела "Критически важные функции" без явной просьбы.

6. **Если загружены старые исходники** (без каких-то функций из списка) —
   восстанови их из транскриптов ПЕРЕД тем как делать новые правки.

---

## Контрольный список: что должно быть в каждом файле

> ⚠️ Номера строк приблизительны — сдвигаются при правках. Ориентируйся на **маркеры секций** (`##SECTION_A##`, `<!-- ##SECTION_DATA## -->` и т.д.) — они стабильны.

### opt.js — обязательные функции
| Функция | Маркер / Строка | Примечание |
|---------|-----------------|------------|
| `parseRange(id)` | `##SECTION_A##` (~23) | парсинг диапазонов параметров |
| `buildName(cfg, ...)` | `##SECTION_B##` (~42) | построение имени стратегии |
| `runOpt()` | `##SECTION_B##` (~173) | главный цикл оптимизатора |
| `_runOOS(slice, cfg)` | внутри runOpt (~214) | бэктест на срезе данных |
| `_attachOOS(cfg)` | внутри runOpt (~227) | расчёт OOS⚡ метрики (retention) |
| `_calcIndicators(cfg)` | `##SECTION_C##` (~1620) | ⚠️ КРИТИЧНО: дважды терялась. Нужна для тестов устойчивости |
| `buildBtCfg(cfg, ind)` | `##SECTION_C##` (~1789) | ⚠️ КРИТИЧНО: дважды терялась. Нужна для тестов устойчивости |
| `runMassRobust()` | `##SECTION_C##` (~1928) | массовый тест устойчивости |
| `runRobustScoreFor(...)` | `##SECTION_C##` (~1994) | тест одной стратегии |
| `runRobustScoreForDetailed(...)` | `##SECTION_C##` (~2161) | детальный тест |
| кэши robustness | `##SECTION_D##` (~2212) | _robCacheGet/Set/Load |

### ui.js — секции (grep по `##UI_*##`)
| Маркер | ~Строка | Содержимое |
|--------|---------|------------|
| `##UI_DATA##` | ~39 | loadFile, parseCSV, setLogic, updateVolStatus |
| `##UI_TABLE##` | ~246 | switchTableMode, applyFilters, renderVisibleResults |
| `##UI_DETAIL##` | ~595 | showDetail, buildCopyText, closeDetail |
| `##UI_OPT##` | ~842 | setOptMode, setXMode, checkPause, yieldToUI, stopOpt |
| `##UI_TPL##` | ~998 | gatherSettings, applySettings, saveTpl, loadTpl, saveSession |
| `##UI_ROBUST##` | ~1424 | updateClxExitVisibility, openRobustModal, runRobustTest, runOOSScan |
| `##UI_PARSE##` | ~1706 | parseTextToSettings, flashField, applyParsedText |
| `##UI_EQUITY##` | ~2157 | showBestStats, drawEquityData, drawEquity, doSort |
| `##UI_HC##` | ~2795 | openHCModal, runHillClimbing, _runGA, _hcRunBacktest |
| `##UI_OOSCMP##` | ~4176 | loadNewData, openOOSCompareModal, runOOSOnNewData |
| `##UI_HEATMAP##` | ~4652 | openHeatmapModal, runHeatmap, _hmRender |

### ui.js — обязательные функции
| Функция | Строка | Примечание |
|---------|--------|------------|
| `yieldToUI()` | ~939 | ⚠️ Должна создавать НОВЫЙ MessageChannel на каждый вызов |
| `checkPause()` | ~928 | проверка паузы оптимизатора |
| `gatherSettings()` | ~1061 | ⚠️ Должна пропускать `type="file"` inputs |
| `applySettings(s)` | ~1082 | применение настроек шаблона |
| `setXMode(type, val)` | ~903 | ⚠️ Все ветки должны иметь null-check на элементы |
| `renderVisibleResults()` | ~444 | ⚠️ Не должно быть лишних `}` в конце функции |
| `runRobustTest()` | ~1461 | одиночный тест устойчивости |
| `_hcRunBacktest(cfg)` | ~3054 | запуск бэктеста для HC/robust |
| `saveSession()` / `loadSession(file)` | ~1353 / ~1381 | сохранение/загрузка сессии |
| `openRobustModal()` | ~1444 | открытие модала теста устойчивости |
| `runOOSScan()` | ~2618 | OOS-скан всех стратегий |

### core.js — обязательные функции
| Функция | Строка | Примечание |
|---------|--------|------------|
| `backtest(pvLo, pvHi, atrArr, cfg)` | ~256 | ⚠️ КРИТИЧНО: основа всего. Не трогать без крайней необходимости |
| `calcPivotLow(left, right)` | ~153 | пивоты |
| `calcPivotHigh(left, right)` | ~165 | пивоты |
| `calcRMA_ATR(period)` | ~141 | ATR (Wilder's smoothing) |
| `calcMA(data, period, type)` | ~126 | MA с поддержкой EMA/SMA/WMA |
| `calcADX(period)` | ~177 | ADX через RMA (как Pine ta.adx) |

### pine_export.js — секции и функции
| Маркер / Функция | Строка | Содержимое |
|------------------|--------|------------|
| `generatePineScript(r)` | ~28 | основная функция |
| `##PINE_HELPERS##` | ~32 | вспомогательные fn (b, f) |
| `##PINE_SLTP##` | ~37 | SL/TP helpers |
| `##PINE_HEADER##` | ~65 | //@version=5, indicator() |
| `##PINE_INPUTS##` | ~75 | все input-переменные Pine |
| `##PINE_INDICATORS##` | ~250 | индикаторы и фильтры |
| `##PINE_ENTRIES##` | ~343 | логика сигналов входа |
| `##PINE_SLTP_CALC##` | ~421 | расчёт SL/TP |
| `##PINE_BACKTEST##` | ~501 | движок бэктеста/equity |
| `##PINE_PLOT##` | ~696 | отрисовка equity |
| `##PINE_VISUAL##` | ~705 | визуализация сигналов |
| `##PINE_TABLE##` | ~917 | таблица статистики |
| `##PINE_ALERTS##` | ~981 | алерты |
| `fixPineScript(code)` | ~1005 | ⚠️ КРИТИЧНО: автофикс Pine v5, не трогать |

### shell.html — секции и критичные элементы
Маркеры: `<!-- ##SECTION_NAME## -->` — ищи grep'ом, номера строк нестабильны.

| Маркер | Содержимое |
|--------|------------|
| `##SECTION_HEATMAP##` | модал тепловой карты параметров (2026-02-27) |
| `##SECTION_DATA##` | загрузка данных, настройки OOS/комиссий |
| `##SECTION_ENTRIES##` | паттерны входа (Pivot, Engulf, PinBar, ...) |
| `##SECTION_SLTP##` | SL/TP настройки |
| `##SECTION_EXIT##` | механика выхода (BE, Trail, Rev, Time) |
| `##SECTION_FILTERS##` | фильтры (MA, ADX, RSI, Structure, ...) |
| `##SECTION_VOLUME##` | фильтры объёма (VSA, Liq, WT, ...) |
| `##SECTION_CONTROLS##` | кнопки запуска, режимы, прогресс-бар |
| `##SECTION_TPL##` | модал шаблонов |
| `##SECTION_FAVBAR##` | панель избранного |
| `##SECTION_TABLE##` | таблица результатов (`#rtbl`, `#tb`, `#oos-rtbl`) |
| `##SECTION_DETAIL##` | детальная панель стратегии |
| `##SECTION_PINE##` | модал Pine Script |
| `##SECTION_ROBUST##` | модал теста устойчивости |
| `##SECTION_HC##` | модал Hill Climbing |
| `##SECTION_PARSE##` | модал парсинга текста |
| `##SECTION_OOSCMP##` | модал OOS-сравнения на новых данных |

Критичные ID/классы:
- `#panels` — НЕ должны попадать `type="file"` inputs в gatherSettings
- `#tb`, `#rtbl` — таблица результатов
- `#pbar` — прогресс-бар
- `revact_exit`, `revact_rev` — кнопки реверса (`revact_skip` в HTML НЕТ — норма)
- `.col-oos-auto` — OOS⚡ (новый, retention)
- `.col-rob-oos` — OOS в блоке Rob (старый, 3 участка)

---

## Критически важные исправления (нельзя откатывать)

### Pine Script — приоритет выхода (2026-02-25)
**Файл:** `pine_export.js`
**Суть:** RevSig не должен блокировать SL/TP выходы.
**Было:** `if not frc and not hsl` → **Стало:** `if not hsl`
Без этого исправления Pine Script даёт на ~44% меньше PnL чем оптимизатор.

### yieldToUI — новый MessageChannel на каждый вызов (2026-02-25)
**Файл:** `ui.js`, line 1014
**Суть:** Использовать `new MessageChannel()` внутри функции, не переиспользовать глобальный.
**Было:** один глобальный `_yieldMC` — optimizer зависал навсегда при concurrent вызовах.

### _calcIndicators + buildBtCfg (2026-02-25)
**Файл:** `opt.js`, перед `##SECTION_C##` (line 1905)
**Суть:** Функции нужны для тестов устойчивости (runOnSlice). Терялись дважды при загрузке старых исходников.

### OOS⚡ — retention-метрика вместо raw PnL (2026-02-26/27)
**Файл:** `opt.js` (`_attachOOS`) + `ui.js` (рендер ячейки)
**Суть:** Бэктест на полных данных + split equity-кривой по `_isN`. Показывает retention = скорость роста OOS / IS.
**Было:** отдельный бэктест на `_oosForwardData` (последние 30%), показывал сырой OOS PnL в %.
**Стало:** один бэктест на `_fullDATA`, retention = `(oosGain/oosBars) / (isGain/isBars)`, ограничен [-2, +2].
**Порог фильтра:** retention ≥ 0.3 = проходит.

### TPE — кэш atrAvg (2026-02-26)
**Файл:** `opt.js`
**Суть:** atrAvg кэшируется до TPE-цикла, устранено O(N×50) пересчётов за итерацию.

### Equity chart — sticky + crosshair (2026-02-26)
**Файл:** `ui.js`
**Суть:** График equity зафиксирован вверху viewport при скролле. Crosshair-точка снэпится к кривой.

---

## Как откатить тепловую карту параметров

Три точечных удаления:
1. **shell.html** `##SECTION_DETAIL##` — удалить кнопку `btn-open-heatmap` (одна строка)
2. **shell.html** — удалить блок `<!-- ##SECTION_HEATMAP## -->` целиком (последний блок перед `</body>`)
3. **ui.js** — удалить блок `// ##UI_HEATMAP##` целиком (последний блок файла)

Больше ничего трогать не нужно — код изолирован, существующие функции не затронуты.

---

## Открытые решения (обсуждаются — не менять без явного согласования)

| Тема | Текущее решение | Альтернатива | Статус |
|------|----------------|--------------|--------|
| OOS⚡ метрика | retention (скорость роста OOS/IS) | raw OOS PnL в % | обсуждается — retention показывает хуже но честнее |
| Порог retention | ≥0.3 = проходит | другое значение | не финализировано |

> ⚠️ Если возникнет желание вернуть raw PnL — сначала обсуди с пользователем.
> Логика retention объяснена в комментариях `_attachOOS` (opt.js, ~227).

---

## Два OOS-столбца в таблице (важно не путать)

| Столбец | CSS класс | Название | Тип теста |
|---------|-----------|----------|-----------|
| OOS⚡ | `.col-oos-auto` | **Новый** | IS/OOS split на полных данных, retention-метрика |
| OOS | `.col-rob-oos` | **Старый** | Часть блока робастности (Rob/OOS/WF/Param/Noise/MC), 3 участка |

---

## История изменений

| Дата | Файл | Что изменено |
|------|------|--------------|
| 2026-02-24 | ui.js, opt.js | Добавлен экспорт Pine Script v5 |
| 2026-02-24 | ui.js | Исправлен лишний `}` в renderVisibleResults |
| 2026-02-24 | opt.js | Восстановлены _calcIndicators + buildBtCfg |
| 2026-02-25 | pine_export.js | Исправлен приоритет выхода (RevSig vs SL/TP) |
| 2026-02-25 | pine_export.js | Исправлены длинные строки label.new() |
| 2026-02-25 | ui.js | gatherSettings: пропуск type="file" |
| 2026-02-25 | ui.js | setXMode: null-check для всех элементов |
| 2026-02-25 | ui.js | yieldToUI: новый MessageChannel на каждый вызов |
| 2026-02-25 | opt.js | TPE: yield каждые 5 итераций вместо 50/30 |
| 2026-02-26 | opt.js | Кэш atrAvg: устранено O(N×50) пересчётов в TPE |
| 2026-02-26 | ui.js | Equity chart: sticky top + crosshair snap |
| 2026-02-26 | opt.js, ui.js | OOS⚡: retention-метрика (бэктест на fullDATA + split equity) |
| 2026-02-27 | opt.js | OOS⚡: защита от near-zero IS gain (minIsGain = 40% от totalGain) |
| 2026-02-27 | shell.html | Добавлено оглавление + маркеры `<!-- ##SECTION_NAME## -->` |
| 2026-02-27 | pine_export.js | Добавлено оглавление + маркеры `// ##PINE_NAME##` |
| 2026-02-27 | MANIFEST.md | Создан файл; обновлены секции с маркерами и ~ для нестабильных строк |
| 2026-02-27 | opt.js | Добавлены "почему" комментарии в _attachOOS (retention, fullDATA, minIsGain) |
| 2026-02-27 | ui.js | Добавлен "почему" комментарий к OOS-ячейке |
| 2026-02-27 | MANIFEST.md | Добавлен раздел "Открытые решения" |
| 2026-02-27 | check.sh, refresh_manifest.py | Скрипты автоматизации сборки и обновления MANIFEST |
| 2026-02-27 | ui.js | Заменено стале оглавление на 10 маркеров `##UI_*##`; секции в MANIFEST |
| 2026-02-27 | ui.js, shell.html | Добавлена тепловая карта параметров (`##UI_HEATMAP##` + `##SECTION_HEATMAP##`) |
| 2026-02-27 | refresh_manifest.py | Добавлен трекинг 10 маркеров `##UI_*##` в ui.js |
| 2026-02-27 | .gitignore | Создан; исключён USE_Optimizer_v6_built.html (артефакт сборки) |

---

## Как загружать файлы в новой сессии

Загружай ВСЕ эти файлы (не `USE_Optimizer_v6_built.html` — он генерируется):
```
MANIFEST.md         ← этот файл (читать первым)
shell.html
ui.js
core.js
opt.js
pine_export.js
build.py
```

Claude прочитает MANIFEST.md и будет знать контекст без необходимости читать все исходники целиком.
