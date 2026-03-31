# Архив завершённых задач

Этот файл накапливает готовые задачи, чтобы:
1. Не создавать дублирующиеся решения
2. Быстро найти где уже реализовано что-то похожее
3. Отследить сроки и версии

---

## 2026-03-30: Исправлена OOS detail панель и canvas ошибки

**Задача**: OOS mode показывал кастомную диагностику, нужна стандартная detail панель
**Решение**: `showOOSDetail(idx)` → `showDetail(r)` вместо кастомного модала
**Файл**: ui.js ~7397
**Коммит**: 11eec67

**Что сделано**:
- ✅ Удалены старые функции (629 строк): `_showOOSDiagnostic`, `_renderOOSMetricsTable` и др.
- ✅ `showOOSDetail()` теперь вызывает стандартный `showDetail(r)`
- ✅ Кнопка "🔍 OOS Диагностика" открывает отдельный modal с анализом
- ✅ Исправлены canvas ошибки в 3 местах: drawEquityData, openHeatmapModal, _hmRender
- ✅ Добавлена проверка `if (!canvas) return;` везде

**Результат**: OOS режим использует же UI что основная таблица, нет custom модала

---

## 2026-03-25: Добавлены метрики K-Ratio, Sortino, SQN

**Задача**: Реализовать метрики из research_reports/2026030320.md
**Файлы**: opt.js (новые функции)
**Статус**: ⚠️ Частично (есть в коде, но не экспортируется)

**Что готово**:
- K-Ratio вычисляется через OLS регрессию log(equity)
- Sortino ratio считается из downside deviation
- SQN рассчитывается из trade-level PnL

**Что нужно**:
- Добавить в results.push() для экспорта
- Добавить колонки в ui.js таблицу
- Добавить в фильтры

---

## 2026-03-20: Исследовательский агент работает по крону

**Задача**: Автоматический поиск новых стратегических идей
**Файлы**: agent/research_pipeline.sh (главный), agent/groq_helper.sh (Groq wrapper)
**Статус**: ✅ Полностью рабочий

**3-уровневая архитектура**:
1. Groq (llama-3.3-70b) скачивает 6 URL источников
2. Haiku (~$0.01) фильтрует к 1-2 гипотезам
3. Sonnet (~$0.10) реализует код

**Результат**: /tmp/research_reports/YYYYMMDDHH.md с готовым кодом
**Экономия**: 85% токенов vs прямого использования Sonnet

---

## 2026-03-18: Pine Script v6 экспорт с toggle-группами

**Задача**: Экспортировать Pine v6 с зависимостями параметров
**Файлы**: pine_export.js:1376 (_addActivePinev6)
**Статус**: ✅ Полностью готово

**14 групп toggle параметров**:
- pivot группа: когда usePivot=true, значит pvL и pvR видны
- ma группа: useMA → показать maType, maP
- confirm группа: useConfirm → показать confN и т.д.

**Реализация**: `active=` переменная скрывает неиспользуемые параметры

---

## 2026-03-15: IS/OOS split валидация

**Задача**: Борьба с переоптимизацией через out-of-sample тестирование
**Файлы**: opt.js:941 (_attachOOS)
**Статус**: ✅ Работает, но неполно

**Как работает**:
- IS = первые 70% данных
- OOS = остаток
- Retention = OOS_PnL / IS_PnL (должна быть близка к 1.0)

**Известное ограничение**: HC соседи не имеют IS/OOS split

---

## 2026-03-10: GT-Score (anti-overfitting метрика)

**Задача**: Создать метрику которая штрафует переоптимизацию
**Файлы**: opt.js:58 (_calcGTScore)
**Статус**: ✅ Работает

**Формула**: `(pnl/dd) × sig_mult × consistency_mult`

Использует:
- Statistical Significance (z-тест WR > 50%)
- Consistency между периодами (P1 vs P2)

---

## 2026-03-05: Sig% — z-тест статистической значимости

**Задача**: Показать какие результаты статистически значимы
**Файлы**: opt.js:43 (_calcStatSig)
**Статус**: ✅ Работает

**Что считает**: z-score для гипотезы "WR > 50%"
**Интерпретация**:
- ≥ 90% = зелёный (высокая значимость)
- 70-90% = жёлтый (средняя)
- < 70% = красный (случайно может быть)

---

## 2026-02-28: Регулярные обновления sync_claude_md.sh

**Задача**: Держать номера строк в CLAUDE.md актуальными
**Файлы**: agent/sync_claude_md.sh (+ git hook)
**Статус**: ✅ Работает

**Когда срабатывает**:
- После каждого git commit (post-commit hook)
- Автоматически амендит коммит если найдены расхождения
- Показывает diff если есть изменения

**Ручная проверка**: `bash agent/sync_claude_md.sh --check`

---

## 2026-02-15: Фильтры WITH прогревом (warmup fix)

**Задача**: Исправить проблему с нулевыми MA значениями в начале
**Файлы**: filter_registry.js (фильтры `ma`, `confirm`, `strend`)
**Статус**: ✅ Исправлено (commit 991ebaf)

**Проблема**: JS инициализирует Float64Array нулями → Pine видит na → фильтр блокируется

**Решение**: Если `indicatorArr[i-1] <= 0` → блокировать сигнал (warmup период)

---

## 2026-03-31: OOS trade comparison diagnostic

**Задача**: Сравнить сделки JS оптимизатора с TV (List of Trades CSV)
**Файлы**: ui.js (`showOOSTradeDiag`, `_parseListOfTrades`, `_parseIndicatorExport`)
**Статус**: ✅ Готово (PR #173-175)

**Что реализовано**:
- Парсинг TV "List of Trades" CSV (стратегия) и индикаторного EL/ES/XL/XS CSV
- Классификация расхождений: EXIT_PRICE / MISSING_TV / MISSING_OPT / FULL_MATCH
- UI таблица с детализацией по каждой сделке

---

## 2026-03-31: ADX slope units + calcHTFADX fallback fix

**Задача**: Устранить расхождение JS vs Pine в ADX slope фильтре и HTF расчёте
**Файлы**: filter_registry.js, core.js
**Статус**: ✅ Готово (PR #176)

**Баги**:
- `adxSlopeBars` в JS был в базовых барах, Pine — в HTF барах → теперь `× htfRatio`
- `Math.floor((i+1)/htfRatio)-1` lookahead → исправлено на `Math.floor(i/htfRatio)-1`

---

## 2026-03-31: Pine Strategy export (strategy.exit с точными ценами)

**Задача**: Выход из сделок по точной цене SL/TP (не на закрытии свечи)
**Файлы**: pine_export.js, shell.html, ui.js
**Статус**: ✅ Готово (PR #176)

**Решение**: `generatePineStrategy(r)` генерирует `strategy()` с `strategy.exit(stop=sl, limit=tp)`.
TV исполняет SL/TP интрабарно. Для OOS сравнения — экспортировать "List of Trades" из стратегии.
UI: вкладки Индикатор / Стратегия в Pine Script модале.

---

## 2026-03-31: Починена инфраструктура (sync + hooks + dumb-checks)

**Задача**: sync_claude_md.sh не работал (устаревший regex), хуки не установлены
**Файлы**: agent/sync_claude_md.sh, .claude/scripts/dumb-checks.sh, .git/hooks/
**Статус**: ✅ Готово

**Что сделано**:
- Новый regex для bullet-формата `` `name` (NUM) `` вместо старого `| name | NUM |`
- Добавлены новые функции в FUNCS: generatePineStrategy, openOOSDiagnostic, showOOSTradeDiag, calcHTFADX
- Хуки установлены: pre-push (dumb-checks) + post-commit (sync номеров строк)
- dumb-checks: console.* в ядре (opt.js/core.js) → ERROR; warmup отсутствие → ERROR; sync CLAUDE.md → ERROR

---

## Форма для добавления нового решения

```markdown
## ДАТА: Название задачи

**Задача**: Что нужно было сделать

**Файлы**: Какие файлы изменены

**Статус**: ✅ Готово / ⚠️ Частично / 🔴 Отклонено

**Решение**: Как решено

**Результат**: Что получилось

**Если отклонено**: Почему и какая альтернатива выбрана
```
