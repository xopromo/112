# Стратегический анализ USE Optimizer v6
*Дата: 2026-03-31 | Модель: claude-opus-4-6*

---

## Масштаб проекта

| Модуль | Строк | Роль |
|--------|-------|------|
| opt.js | ~4300 | MC/TPE/BO/Exhaustive, 20+ метрик, HC |
| ui.js | ~10200 | 307 функций: таблицы, визуализации, robustness |
| core.js | ~740 | backtest() ядро, 15 индикаторов |
| pine_export.js | ~1900 | Pine v6 генератор (indicator + strategy) |
| filter_registry.js | ~370 | 28 фильтров с warmup |
| shell.html | ~2800 | HTML + CSS |
| **Бандл** | **~30700** | USE_Optimizer_v6_built.html |

---

## 1. ИССЛЕДОВАНИЯ

### Что реализовано
- 3-уровневый research pipeline (Groq → Haiku → Sonnet), $0.11/час
- 20+ метрик качества (PnL, DD, Sharpe, Sortino, K-Ratio, SQN, Omega, GT-Score, PSR...)
- HMM regime detection (2-state Gaussian, Baum-Welch + Viterbi)
- CPCV block walk-forward, MC permutation p-value
- Bayesian Optimization с Gaussian Process + EI acquisition

### Стратегические направления
**A. Адаптивные стратегии по режимам рынка**
- HMM определяет bull/bear, но не влияет на параметры
- Идея: автоматический switch MA-длины, SL-множителя при смене режима
- Ценность: стратегии, адаптирующиеся к волатильности, живут дольше

**B. Multi-asset корреляционный анализ**
- Сейчас: один инструмент в вакууме
- Идея: загрузить 3-5 CSV, найти стратегии стабильные на всех
- Ценность: защита от curve-fitting к конкретному инструменту

**C. Walk-Forward Matrix**
- Сейчас: один 70/30 split
- Идея: rolling-window матрица (train 1Y → test 3M → сдвиг 1M)
- Ценность: реальная проверка "что если торговал с 2020?"

**D. Feature Importance (Shapley Values)**
- Сейчас: per-parameter sensitivity ±10-20%
- Идея: SHAP-подобный анализ — какой параметр реально влияет
- Ценность: понимание "почему стратегия работает"

**E. Synthetic data stress-test**
- Генерация искусственных кризисов (flash crash -10%, V-recovery, flat 6м)
- Ценность: как стратегия переживёт чёрного лебедя

---

## 2. СТРАТЕГИИ ТОРГОВЛИ

### Что реализовано
- 30+ сигналов входа (Pivot, Engulfing, PinBar, Bollinger, Donchian, ATR BO, MA Touch, Squeeze, Supertrend, MACD, Kalman Cross, MA Cross, Volume Move, Inside Bar, N-Reversal, EIS, Soldiers...)
- 28 фильтров (MA, ADX, RSI, ATR, Volume, Structure, MACD, ER, Kalman, VSA, Squeezemod...)
- 8 механик выхода (BE, Trail, Wick Trail, Partial TP, Reverse, Time, Climax, Structure SL)
- Адаптивные SL/TP: `tpAdapt = 0.5 + 0.5 × √(currATR/avgATR)`

### Пробелы и рост

**A. Position Sizing — главный пробел**
- Сейчас: фиксированный 1 лот
- Нужно: Kelly Criterion, Fixed Fractional, Anti-Martingale
- Ценность: разница PnL +50% vs +200% при одном edge

**B. Портфельная логика**
- Нет одновременного удержания нескольких позиций
- Нужно: пирамидинг, хеджирование, correlation-aware sizing

**C. Слиппаж**
- Комиссия есть, slippage = 0
- Нужно: настраиваемый slippage (0.01-0.1% от ATR)
- Ценность: реальный backtest vs live разрыв

**D. Сезонность / время дня**
- Нет TimeFilter (часы, дни недели)
- Идея: торговать только London+NY session
- Простой фильтр даёт +15-20% WR на forex

**E. Полноценный MTF**
- Есть HTF для одного индикатора
- Нужно: "Тренд на D1, вход на H1, тайминг на M15"

---

## 3. ЭФФЕКТИВНОСТЬ

### Что реализовано
- Latin Hypercube Sampling (MC): равномерное покрытие vs random
- TPE с Laplace smoothing: быстрая сходимость к хорошим регионам
- Pruning на 5/15/35/60% данных: отсекает 70%+ плохих конфигов
- Surrogate model (ridge regression) в HC
- Кэширование индикаторов между итерациями

### Рост
**A. Web Workers** — backtest() в Worker, UI не фризит, 2-4x ускорение
**B. WASM-ядро** — Rust/C → WASM горячий цикл, 5-10x ускорение
**C. Инкрементальный бэктест** — при смене одного параметра пересчитывать дельту
**D. Виртуальный скролл** — render только 50 видимых строк, мгновенная таблица

---

## 4. НАДЁЖНОСТЬ

### Что реализовано
- 6 уровней анти-overfitting (от дизайна до HMM)
- 5 тестов устойчивости (OOS, Walk, Param, Noise, MC Permutation)
- TV-delta валидация (сравнение с TradingView до уровня бара)
- Warmup-проверка во всех 28 фильтрах
- dumb-checks.sh (автолинтер перед пушем)
- sync_claude_md.sh (обновление номеров строк post-commit)

### Критические пробелы
**A. Нет unit-тестов** — 15k+ строк без тестов, рефакторинг = русская рулетка
**B. Нет regression tests Pine** — сгенерированный код может сломаться незаметно
**C. Нет data integrity** — нет проверки CSV на gaps, нули, дубли
**D. Нет seedable PRNG** — MC/TPE нестабильны между запусками
**E. HC соседи без OOS** — найденный "лучший сосед" может быть перефиттированным

---

## 5. БЕЗОПАСНОСТЬ

### Текущее состояние
- Нет сервера — всё клиентское, данные не покидают браузер ✅
- Нет аутентификации (открытый HTML файл)
- Данные в localStorage/IndexedDB — доступны любому JS

### Направления
**A.** Content Security Policy (запрет внешних скриптов)
**B.** Опциональное AES-256 шифрование при экспорте конфигов
**C.** SHA-256 хэш бандла в README
**D.** Rate limiting + .env для Research Agent API keys

---

## 6. МОНЕТИЗАЦИЯ

| Вариант | Модель | Потенциал |
|---------|--------|-----------|
| Freemium SaaS | Free (1k итер) / Pro $29/мес (unlim) / Team $99/мес | ★★★★★ |
| Маркетплейс стратегий | 30% комиссия от продажи проверенных конфигов | ★★★★☆ |
| API для алготрейдеров | POST /optimize → results[] | ★★★★☆ |
| Образовательный курс | "Systematic Trading" видеокурс | ★★★☆☆ |
| White-label для фондов | $5-50k за установку + поддержка | ★★★☆☆ |

**Самый перспективный**: Freemium SaaS — нужен Supabase/Firebase для auth и feature flags.

---

## 7. ПРИБЫЛЬНОСТЬ

### Разрыв backtest vs live
| Фактор | Backtest | Live | Дельта |
|--------|----------|------|--------|
| Слиппаж | 0 | 0.01-0.1% | -2..10% год |
| Спред | 0 | 0.5-3 pip | -5..15% |
| Исполнение | Мгновенное | 50-500ms | -1..5% |
| Психология | Нет | Есть | -20..50% |

### Направления
**A. Live execution bridge**: USE → Pine Strategy → Alert → 3Commas → Exchange
**B. Paper trading mode**: WebSocket real-time данные, виртуальная торговля
**C. Circuit breaker**: автоотключение стратегии при DD > 2x исторический
**D. Portfolio optimization**: Markowitz/Risk Parity по результатам оптимизации

---

## ИНСАЙТЫ

### Крутые моменты
1. **Архитектура одного файла** — весь бэктестер в одном HTML, offline, GitHub Pages
2. **GT-Score** — PnL/DD × статзначимость × консистентность — академически обосновано
3. **6 уровней анти-overfitting** — уровень hedge fund research desk
4. **Адаптивные SL/TP через ATR** — автоматически расширяет цели при высокой волатильности
5. **Research pipeline за $0.11/час** — экономит 85% токенов
6. **TV-delta валидация** — побарное сравнение с TradingView

### Слабые места
1. **Нет автотестов** — главный технический долг
2. **Однопоточность** — UI фризится на 50k итераций
3. **Нет position sizing** — стратегия без money management
4. **Один инструмент** — нельзя проверить на 5 парах одновременно
5. **HC без OOS split** — зафиксировано в architecture-decisions, не исправлено
6. **Нет seed PRNG** — нестабильные результаты между запусками

---

## Приоритетная дорожная карта

| # | Задача | Влияние | Усилия |
|---|--------|---------|--------|
| 1 | **Unit-тесты** для backtest() + метрик | Надёжность | Мало |
| 2 | **Web Workers** для backtest | Производительность ×3 | Средне |
| 3 | **Position Sizing** (Kelly/FF) | Прибыльность | Средне |
| 4 | **Multi-asset** загрузка | Anti-overfitting | Много |
| 5 | **Walk-Forward Matrix** | Валидация | Средне |
| 6 | **Seedable PRNG** (xoshiro128) | Воспроизводимость | Мало |
| 7 | **Виртуальный скролл** | UX | Мало |
| 8 | **Live execution bridge** | Монетизация | Много |
| 9 | **Freemium SaaS** | Монетизация | Много |
| 10 | **Portfolio optimization** | Прибыльность | Много |
