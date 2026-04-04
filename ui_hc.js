function openHCModal(mode) {
  if (!DATA) { alert('Нет данных'); return; }
  const modeMap = {
    'selected':    'hc_src_sel',
    'visible':     'hc_src_top',
    'all_visible': 'hc_src_all_vis',
    'fav':         'hc_src_fav',
    'all_fav':     'hc_src_all_fav',
    'rob_filtered':'hc_src_rob',
  };
  const radioId = modeMap[mode] || 'hc_src_sel';
  const radio = document.getElementById(radioId);
  if (radio) radio.checked = true;

  _updateHCSrcCounts();

  document.getElementById('hc-results').innerHTML = '';
  document.getElementById('hc-progress').style.display = 'none';
  document.getElementById('hc-overlay').classList.add('open');
}

function closeHCModal() {
  _hcRunning = false;
  document.getElementById('hc-overlay').classList.remove('open');
}

function stopHillClimbing() {
  _hcRunning = false;
  _hcRobRunning = false; // прерывает текущий тест устойчивости
  document.getElementById('btn-stop-hc').style.display = 'none';
  document.getElementById('btn-run-hc').style.display = '';
  document.getElementById('hc-status').textContent = '⏹ Остановлено';
}

// Получаем метрику из результата бэктеста
function _hcMetric(r, metric) {
  if (!r || r.n < 5) return -Infinity;
  switch(metric) {
    case 'pdd': return r.dd > 0 ? r.pnl / r.dd : r.pnl > 0 ? 99 : 0;
    case 'pnl': return r.pnl;
    case 'wr':  return r.wr;
    case 'avg': return r.avg;
    case 'rob': {
      // robScore * 100 + P/DD как тай-брейкер
      const pdd = r.dd > 0 ? r.pnl / r.dd : (r.pnl > 0 ? 99 : 0);
      const rob = r._robScore || 0;
      return rob * 100 + Math.min(pdd, 99); // 500 max + pdd tiebreak
    }
    default:    return r.dd > 0 ? r.pnl / r.dd : 0;
  }
}

// TV-метрика: запускает IS (70%) и полный бэктест, делит equity-кривую по splitIdx.
// IS/OOS gains берётся из ОДНОГО полного бэктеста — корректное сравнение без edge-эффектов.
function _hcTvScore(cfg, metric) {
  const N = DATA.length;
  const isN = Math.round(N * 0.70);
  const origData = DATA;
  // IS-only run нужен только для DD-базиса
  DATA = origData.slice(0, isN);
  const rIS = _hcRunBacktest(cfg);
  DATA = origData;
  const rFull = _hcRunBacktest(cfg);
  if (!rIS || !rFull || rIS.n < 3 || rFull.n < 3) return -Infinity;
  if (!rFull.eq || rFull.eq.length < isN + 5) return -Infinity;
  // IS/OOS gains из equity-кривой ОДНОГО полного бэктеста
  const eq = rFull.eq;
  const N_eq = eq.length;
  const splitIdx = Math.min(isN - 1, N_eq - 2);
  const isGain  = eq[splitIdx];
  const oosGain = eq[N_eq - 1] - isGain;
  const isRate  = splitIdx > 0 ? isGain / (splitIdx + 1) : 0;
  const oosBars = N_eq - 1 - splitIdx;
  const oosRate = oosBars > 0 ? oosGain / oosBars : 0;
  // rateRatio: скорость OOS / скорость IS × 100. 100% = одинаково, >100% = ускоряется
  const rateRatio = isRate > 0 ? oosRate / isRate * 100
                  : (oosGain > 0 ? 200 : (oosGain < 0 ? -100 : 0));
  // DD: сравниваем IS-only бэктест с полным (оба — честные срезы данных)
  const mulDd  = rIS.dd > 0 ? rFull.dd / rIS.dd : (rFull.dd > 0 ? 99 : 1);
  const pddIS   = rIS.dd > 0 ? rIS.pnl / rIS.dd : (rIS.pnl > 0 ? 99 : 0);
  const pddFull = rFull.dd > 0 ? rFull.pnl / rFull.dd : (rFull.pnl > 0 ? 99 : 0);
  const retPdd = pddIS > 0 ? pddFull / pddIS * 100 : 0;
  switch (metric) {
    case 'tv_pnl': return oosGain;    // максимизировать OOS-прибыль напрямую
    case 'tv_pdd': return retPdd;     // максимизировать удержание P/DD
    case 'tv_score': {
      // OOS должен быть прибыльным — жёсткое требование
      if (oosGain <= 0) return -100 - mulDd;
      const sRate = Math.min(Math.max(rateRatio, 0), 150); // 0-150
      const sDd   = Math.max(0, 200 - mulDd * 100);        // 200 = без роста DD, 0 = удвоился
      const sPdd  = Math.min(Math.max(retPdd, 0), 150);    // 0-150
      return (sRate + sDd + sPdd) / 3;
    }
    default: return oosGain;
  }
}

// Полные тесты устойчивости для одного cfg (все 5: OOS+Walk+Param+Noise+MC)
// Возвращает {score, pdd} синхронно-совместимо (возвращает Promise)
async function _hcRobScore(cfg) {
  if (!_hcRunning) return 0;
  _hcRobRunning = true;
  const fakeR = { cfg };
  try {
    const score = await runRobustScoreFor(fakeR, ['oos', 'walk', 'param', 'noise', 'mc'], true);
    return score; // 0-5
  } finally {
    _hcRobRunning = false;
  }
}

// Запуск бэктеста для cfg объекта на полных данных
// Возвращает {n, pnl, wr, dd, avg, pdd} или null
// ─────────────────────────────────────────────────────────────────────────────
// ИДЕЯ 6: Surrogate model — online линейная регрессия cfg → pdd
// Быстрый предсказатель: пропускаем явно плохих кандидатов до полного бэктеста
// ─────────────────────────────────────────────────────────────────────────────
const _surrogate = {
  // Обучающая выборка: массивы X (features) и y (pdd)
  Xdata: [], ydata: [],
  // Веса модели (ridge regression, λ=0.1)
  w: null, bias: 0,
  // Нормализация
  xMean: null, xStd: null,
  trained: false,
  minSamples: 20, // минимум точек для обучения

  // Извлекаем числовые признаки из cfg
  features(cfg) {
    const c = cfg;
    return [
      c.slPair?.a?.m || 0,    // SL ATR mult
      c.slPair?.p?.m || 0,    // SL pct
      c.tpPair?.a?.m || 0,    // TP ATR mult
      c.tpPair?.b?.m || 0,    // TP2 mult
      c.atrPeriod || 14,
      c.pvL || 5,
      c.pvR || 2,
      c.beTrig || 0,
      c.trTrig || 0,
      c.adxThresh || 0,
    ];
  },

  // Добавляем точку в обучающую выборку
  addPoint(cfg, pdd) {
    if (!isFinite(pdd) || pdd > 500) return;
    this.Xdata.push(this.features(cfg));
    this.ydata.push(Math.min(pdd, 50)); // cap для стабильности
    // Обучаем каждые 10 новых точек
    if (this.Xdata.length >= this.minSamples && this.Xdata.length % 10 === 0) {
      this._train();
    }
  },

  // Ridge regression (матричный расчёт на Float64Array)
  _train() {
    const n = this.Xdata.length, d = this.Xdata[0].length;
    // Нормализация X
    const mean = new Array(d).fill(0), std = new Array(d).fill(0);
    for (const x of this.Xdata) for (let j = 0; j < d; j++) mean[j] += x[j];
    for (let j = 0; j < d; j++) mean[j] /= n;
    for (const x of this.Xdata) for (let j = 0; j < d; j++) std[j] += (x[j]-mean[j])**2;
    for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j]/n) || 1;
    this.xMean = mean; this.xStd = std;
    // Нормализуем X
    const Xn = this.Xdata.map(x => x.map((v,j) => (v - mean[j]) / std[j]));
    // y — центрируем
    const yMean = this.ydata.reduce((a,b)=>a+b,0) / n;
    const yn = this.ydata.map(v => v - yMean);
    // Gradient descent (100 итераций, lr=0.01, λ=0.1)
    const w = new Array(d).fill(0);
    const lr = 0.01, lam = 0.1;
    for (let iter = 0; iter < 100; iter++) {
      const grad = new Array(d).fill(0);
      let loss = 0;
      for (let i = 0; i < n; i++) {
        let pred = 0;
        for (let j = 0; j < d; j++) pred += w[j] * Xn[i][j];
        const err = pred - yn[i];
        loss += err * err;
        for (let j = 0; j < d; j++) grad[j] += err * Xn[i][j];
      }
      for (let j = 0; j < d; j++) w[j] -= lr * (grad[j]/n + lam * w[j]);
    }
    this.w = w; this.bias = yMean; this.trained = true;
  },

  // Предсказываем pdd для cfg. Возвращает null если нет модели.
  predict(cfg) {
    if (!this.trained || !this.w) return null;
    const x = this.features(cfg);
    let pred = this.bias;
    for (let j = 0; j < x.length; j++) {
      pred += this.w[j] * (x[j] - this.xMean[j]) / this.xStd[j];
    }
    return Math.max(0, pred);
  },

  reset() { this.Xdata = []; this.ydata = []; this.w = null; this.trained = false; }
};

// ── ROB-SURROGATE: предсказание robScore по cfg (Идея 10) ──────────────────
const _robSurrogate = {
  Xdata: [], ydata: [],
  w: null, bias: 0,
  xMean: null, xStd: null,
  trained: false,
  minSamples: 15,
  _saveTimer: null,

  features(cfg) {
    // Те же признаки что у _surrogate
    const c = cfg;
    return [
      c.slPair?.a?.m || 0,
      c.slPair?.p?.m || 0,
      c.tpPair?.a?.m || 0,
      c.tpPair?.b?.m || 0,
      c.atrPeriod || 14,
      c.pvL || 5,
      c.pvR || 2,
      c.beTrig || 0,
      c.trTrig || 0,
      c.adxThresh || 0,
    ];
  },

  addPoint(cfg, robScore) {
    if (!isFinite(robScore)) return;
    this.Xdata.push(this.features(cfg));
    this.ydata.push(Math.min(robScore, 5));
    if (this.Xdata.length >= this.minSamples && this.Xdata.length % 5 === 0) {
      this._train();
    }
    // Отложенное сохранение в localStorage (debounce 2с)
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._save(), 2000);
  },

  _train() {
    const n = this.Xdata.length, d = this.Xdata[0].length;
    const mean = new Array(d).fill(0), std = new Array(d).fill(0);
    for (const x of this.Xdata) for (let j = 0; j < d; j++) mean[j] += x[j];
    for (let j = 0; j < d; j++) mean[j] /= n;
    for (const x of this.Xdata) for (let j = 0; j < d; j++) std[j] += (x[j]-mean[j])**2;
    for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j]/n) || 1;
    this.xMean = mean; this.xStd = std;
    const Xn = this.Xdata.map(x => x.map((v,j) => (v-mean[j])/std[j]));
    const yMean = this.ydata.reduce((a,b)=>a+b,0)/n;
    const yn = this.ydata.map(v => v-yMean);
    const w = new Array(d).fill(0);
    const lr = 0.02, lam = 0.1;
    for (let iter = 0; iter < 80; iter++) {
      const grad = new Array(d).fill(0);
      for (let i = 0; i < n; i++) {
        let pred = 0;
        for (let j = 0; j < d; j++) pred += w[j]*Xn[i][j];
        const err = pred - yn[i];
        for (let j = 0; j < d; j++) grad[j] += err*Xn[i][j];
      }
      for (let j = 0; j < d; j++) w[j] -= lr*(grad[j]/n + lam*w[j]);
    }
    this.w = w; this.bias = yMean; this.trained = true;
  },

  predict(cfg) {
    if (!this.trained || !this.w) return null;
    const x = this.features(cfg);
    let pred = this.bias;
    for (let j = 0; j < x.length; j++) pred += this.w[j]*(x[j]-this.xMean[j])/this.xStd[j];
    return Math.max(0, Math.min(5, pred));
  },

  // Сохраняем в localStorage с привязкой к dataHash
  _save() {
    try {
      const key = 'robSurrogate_' + (window._dataHash || 'default');
      const payload = { Xdata: this.Xdata.slice(-500), ydata: this.ydata.slice(-500), ts: Date.now() };
      localStorage.setItem(key, JSON.stringify(payload));
    } catch(e) {}
  },

  // Загружаем из localStorage
  load(dataHash) {
    try {
      const key = 'robSurrogate_' + (dataHash || 'default');
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const saved = JSON.parse(raw);
      // Не загружаем данные старше 30 дней
      if (Date.now() - saved.ts > 30*24*3600*1000) { localStorage.removeItem(key); return; }
      this.Xdata = saved.Xdata || [];
      this.ydata = saved.ydata || [];
      if (this.Xdata.length >= this.minSamples) this._train();
      console.log('[RobSurrogate] Загружено', this.Xdata.length, 'точек из кэша');
    } catch(e) {}
  },

  reset() { this.Xdata = []; this.ydata = []; this.w = null; this.trained = false; }
};


function _hcRunBacktest(cfg) {
  if (!DATA || DATA.length < 40) return null;
  if (_robSliceCacheDataHash !== _getDataHash()) { _robSliceCache.clear(); _robSliceCacheDataHash = _getDataHash(); }
  const _hcsk = _getRobSliceKey(cfg, DATA);
  if (_robSliceCache.has(_hcsk)) return _robSliceCache.get(_hcsk);
  try {
    const ind    = _calcIndicators(cfg);
    const btCfg  = buildBtCfg(cfg, ind);

    // ##EQ_MA_FILTER## Двухпроходный цикл для базовой линии
    // КРИТИЧНО: ВСЕГДА рассчитываем baseline (нужна для оранжевой линии в графике OOS)
    // даже если useEqMA=false
    const _shadowCfg = JSON.parse(JSON.stringify(btCfg));
    _shadowCfg.useEqMA = false;
    const _shadowRes = backtest(ind.pvLo, ind.pvHi, ind.atrArr, _shadowCfg);

    if (window.__DEBUG_HC_BASELINE) {
      console.log('[_hcRunBacktest] Baseline calculation:');
      console.log('  cfg.useEqMA:', cfg.useEqMA);
      console.log('  _shadowRes:', _shadowRes ? 'OK' : 'NULL');
      console.log('  _shadowRes.eq:', _shadowRes?.eq ? `array[${_shadowRes.eq.length}]` : 'NULL');
    }

    if (_shadowRes && _shadowRes.eq && _shadowRes.eq.length > 0) {
      // ВСЕГДА сохраняем baseline
      btCfg.eqCalcBaselineArr = Array.from(_shadowRes.eq);
      if (window.__DEBUG_HC_BASELINE) {
        console.log('  ✅ btCfg.eqCalcBaselineArr created:', `array[${btCfg.eqCalcBaselineArr.length}]`);
      }

      // MA рассчитываем ТОЛЬКО если включен фильтр
      if (cfg.useEqMA) {
        const maLen = cfg.eqMALen || 20;
        const maType = cfg.eqMAType || 'SMA';
        btCfg.eqCalcMAArr = calcMA(Array.from(_shadowRes.eq), maLen, maType);
        if (window.__DEBUG_HC_BASELINE) {
          console.log('  ✅ btCfg.eqCalcMAArr created:', `array[${btCfg.eqCalcMAArr.length}]`);
        }
      } else {
        if (window.__DEBUG_HC_BASELINE) {
          console.log('  ⚠️  useEqMA=false, MA не создаётся');
        }
      }
    } else {
      if (window.__DEBUG_HC_BASELINE) {
        console.log('  ❌ BASELINE NOT CREATED: _shadowRes or eq is NULL');
      }
    }

    const _hcRes = backtest(ind.pvLo, ind.pvHi, ind.atrArr, btCfg);

    // ##EQ_MA_FILTER## ВСЕГДА копируем baseline в результат
    // (была ошибка: копировалась ТОЛЬКО если useEqMA=true, но baseline нужна всегда!)
    if (_hcRes) {
      if (window.__DEBUG_HC_BASELINE) {
        console.log('  Copying to _hcRes:');
        console.log('    btCfg.eqCalcBaselineArr:', btCfg.eqCalcBaselineArr ? `array[${btCfg.eqCalcBaselineArr.length}]` : 'NULL');
        console.log('    btCfg.eqCalcMAArr:', btCfg.eqCalcMAArr ? `array[${btCfg.eqCalcMAArr.length}]` : 'NULL');
      }
      if (btCfg.eqCalcBaselineArr) {
        _hcRes.eqCalcBaselineArr = Array.from(btCfg.eqCalcBaselineArr);
        if (window.__DEBUG_HC_BASELINE) {
          console.log('    ✅ _hcRes.eqCalcBaselineArr set:', `array[${_hcRes.eqCalcBaselineArr.length}]`);
        }
      }
      if (btCfg.eqCalcMAArr) {
        _hcRes.eqCalcMAArr = Array.from(btCfg.eqCalcMAArr);
        if (window.__DEBUG_HC_BASELINE) {
          console.log('    ✅ _hcRes.eqCalcMAArr set:', `array[${_hcRes.eqCalcMAArr.length}]`);
        }
      }
    } else {
      if (window.__DEBUG_HC_BASELINE) {
        console.log('  ❌ _hcRes is NULL');
      }
    }

    // КРИТИЧНО: Копируем eq перед сохранением в кэш - иначе все пользователи кэша
    // будут использовать один и тот же Float32Array и повредят друг другу данные
    if (_hcRes && _hcRes.eq) {
      _hcRes.eq = Array.from(_hcRes.eq);
    }

    _robSliceCacheSet(_hcsk, _hcRes);
    return _hcRes;
  } catch(e) { return null; }
}

// Вычисляет _oos и IS-статы для HC соседа.
// Запускает IS-бэктест (70%) и полный (100%), строит cfg._oos аналогично _attachOOS в opt.js.
// Возвращает { _oos, isStats } — isStats содержат метрики IS-периода для строки детальной статистики.
function _hcBuildOOS(cfg) {
  if (!DATA || DATA.length < 100) return null;
  const N = DATA.length;
  const isN = Math.round(N * 0.70);
  const origData = DATA;

  // Внутренний прогон без взаимодействия с _robSliceCache:
  // смена DATA при использовании _hcRunBacktest сбрасывает весь кеш,
  // поэтому используем прямой вызов _calcIndicators + buildBtCfg + backtest.
  function _runDirect(slice) {
    if (!slice || slice.length < 40) return null;
    DATA = slice;
    try {
      const ind = _calcIndicators(cfg);
      const btCfg = buildBtCfg(cfg, ind);

      // ##EQ_MA_FILTER## Двупроходный цикл для базовой линии, если фильтр включен
      if (cfg.useEqMA) {
        const _shadowCfg = JSON.parse(JSON.stringify(btCfg));
        _shadowCfg.useEqMA = false;
        const _shadowRes = backtest(ind.pvLo, ind.pvHi, ind.atrArr, _shadowCfg);
        if (_shadowRes && _shadowRes.eq && _shadowRes.eq.length > 0) {
          const maLen = cfg.eqMALen || 20;
          const maType = cfg.eqMAType || 'SMA';
          btCfg.eqCalcMAArr = calcMA(Array.from(_shadowRes.eq), maLen, maType);
          btCfg.eqCalcBaselineArr = Array.from(_shadowRes.eq);
        }
      }

      const r = backtest(ind.pvLo, ind.pvHi, ind.atrArr, btCfg);

      // ##EQ_MA_FILTER## Сохраняем baseline в результат если он был рассчитан
      if (cfg.useEqMA && r) {
        if (btCfg.eqCalcBaselineArr) r.eqCalcBaselineArr = Array.from(btCfg.eqCalcBaselineArr);
        if (btCfg.eqCalcMAArr) r.eqCalcMAArr = Array.from(btCfg.eqCalcMAArr);
      }

      return r;
    } catch(e) { return null; }
    finally { DATA = origData; }
  }

  // IS-прогон: только первые 70% данных
  const rIS = _runDirect(origData.slice(0, isN));

  // Полный TV-прогон: все 100% данных (используем кеш если доступен)
  const rFull = _hcRunBacktest(cfg);

  if (!rFull || !rFull.eq || rFull.eq.length < isN + 5) return null;

  // Делим equity-кривую по splitIdx (аналогично _attachOOS в opt.js)
  const eq = rFull.eq;
  const N_eq = eq.length;
  // КРИТИЧНО: isN это индекс в DATA, но eq может быть короче из-за warmup!
  // Пересчитываем splitIdx как пропорцию от длины equity кривой, не data
  // splitIdx должен быть 70% от N_eq, аналогично тому как isN это 70% от N
  const splitIdx = Math.min(Math.round(0.70 * N_eq), N_eq - 2);
  const isGain  = eq[splitIdx];
  const oosGain = eq[N_eq - 1] - isGain;
  const isRate  = splitIdx > 0 ? isGain / (splitIdx + 1) : 0;
  const oosBars = N_eq - 1 - splitIdx;
  const oosRate = oosBars > 0 ? oosGain / oosBars : 0;

  const totalGain = eq[N_eq - 1];
  const minIsGain = totalGain > 0 ? Math.max(totalGain * 0.4, 0.1) : 0.1;
  let retention;
  if (isGain < minIsGain) {
    retention = -1;
  } else if (oosGain <= 0) {
    retention = Math.max(isRate > 0 ? oosRate / isRate : -2, -2.0);
  } else {
    retention = Math.min(isRate > 0 ? oosRate / isRate : 2, 2.0);
  }

  const pddFull = rFull.dd > 0 ? rFull.pnl / rFull.dd : (rFull.pnl > 0 ? 50 : 0);

  const _oos = {
    isPct: Math.round(isN / N * 100),
    forward: {
      pnl: oosGain, retention, isGain, n: rFull.n, wr: rFull.wr, dd: rFull.dd,
      pnlFull: rFull.pnl, avg: rFull.avg, pdd: pddFull,
      dwr: rFull.dwr, p1: rFull.p1, p2: rFull.p2, c1: rFull.c1, c2: rFull.c2,
      wrL: rFull.wrL ?? null, nL: rFull.nL || 0, wrS: rFull.wrS ?? null, nS: rFull.nS || 0,
      dwrLS: rFull.dwrLS ?? null, cvr: _calcCVR(rFull.eq), upi: _calcUlcerIdx(rFull.eq),
      sortino: _calcSortino(rFull.eq), kRatio: _calcKRatio(rFull.eq), sqn: rFull.sqn??null, // ##SOR ##KR ##SQN
      omega: _calcOmega(rFull.eq), pain: _calcPainRatio(rFull.eq) // ##OMG ##PAIN
    }
  };

  // IS-статы для первой строки детальной статистики
  // Если IS-прогон успешен — используем его метрики; иначе fallback на IS-часть полной equity
  const isStats = rIS ? {
    pnl: rIS.pnl, wr: rIS.wr, n: rIS.n, dd: rIS.dd,
    pdd: rIS.dd > 0 ? rIS.pnl / rIS.dd : (rIS.pnl > 0 ? 50 : 0),
    avg: rIS.avg || 0, dwr: rIS.dwr || 0,
    p1: rIS.p1 || 0, p2: rIS.p2 || 0, c1: rIS.c1 || 0, c2: rIS.c2 || 0,
    nL: rIS.nL || 0, pL: rIS.pL || 0, wrL: rIS.wrL ?? null,
    nS: rIS.nS || 0, pS: rIS.pS || 0, wrS: rIS.wrS ?? null,
    dwrLS: rIS.dwrLS ?? null, cvr: _calcCVR(rIS.eq), upi: _calcUlcerIdx(rIS.eq),
    sortino: _calcSortino(rIS.eq), // ##SOR
    kRatio:  _calcKRatio(rIS.eq),  // ##KR
    sqn:     rIS.sqn ?? null,       // ##SQN
    omega:   _calcOmega(rIS.eq),   // ##OMG
    pain:    _calcPainRatio(rIS.eq) // ##PAIN
  } : null;

  return { _oos, isStats, eq: Array.from(rFull.eq), eqCalcMAArr: rFull.eqCalcMAArr ? Array.from(rFull.eqCalcMAArr) : undefined }; // ##EQ_MA_FILTER##
}

// ── MULTI-START: генерирует N случайных стартовых точек ──────────────────────
// Берёт структуру (паттерны, фильтры) из шаблона, рандомизирует числовые параметры
function _hcMultiStartPoints(template, n, opts) {
  const points = [];

  // Диапазоны для случайной генерации каждого числового параметра
  // [min, max, step] — шаг определяет гранулярность
  const numRanges = {
    // SL ATR multiplier
    sl_a_m:   [0.5,  5.0,  0.25],
    // SL PCT multiplier
    sl_p_m:   [0.5,  8.0,  0.5],
    // TP ATR/RR multiplier (первый)
    tp_a_m:   [0.5,  8.0,  0.25],
    // TP второй (если есть)
    tp_b_m:   [0.5,  8.0,  0.25],
    // ATR период
    atrPeriod:[5,    30,   1],
    // Pivot L
    pvL:      [2,    10,   1],
    // Pivot R
    pvR:      [1,    5,    1],
    // MA период (если useMA)
    maP:      [10,   200,  5],
    // BE trigger
    beTrig:   [0.5,  3.0,  0.25],
    // Trail trigger
    trTrig:   [0.5,  3.0,  0.25],
    // Trail dist
    trDist:   [0.3,  2.0,  0.25],
    // ADX threshold
    adxThresh:[15,   40,   5],
  };

  function randFromRange(min, max, step) {
    const steps = Math.floor((max - min) / step);
    return +(min + Math.floor(Math.random() * (steps + 1)) * step).toFixed(4);
  }

  for (let i = 0; i < n; i++) {
    const c = JSON.parse(JSON.stringify(template));

    // Рандомизируем SL
    if (opts.vSL) {
      if (c.slPair?.a) c.slPair.a.m = randFromRange(...numRanges.sl_a_m);
      if (c.slPair?.p) c.slPair.p.m = randFromRange(...numRanges.sl_p_m);
    }
    // Рандомизируем TP
    if (opts.vTP) {
      if (c.tpPair?.a) c.tpPair.a.m = randFromRange(...numRanges.tp_a_m);
      if (c.tpPair?.b) c.tpPair.b.m = randFromRange(...numRanges.tp_b_m);
    }
    // Рандомизируем ATR период
    if (opts.vATR) {
      c.atrPeriod = randFromRange(...numRanges.atrPeriod);
    }
    // Рандомизируем Pivot
    if (opts.vPV) {
      c.pvL = randFromRange(...numRanges.pvL);
      c.pvR = randFromRange(...numRanges.pvR);
    }
    // Рандомизируем MA период (только если MA включён)
    if (opts.vMA && c.maP > 0) {
      c.maP = randFromRange(...numRanges.maP);
    }
    // Рандомизируем BE trigger
    if (opts.vBE && c.useBE) {
      c.beTrig = randFromRange(...numRanges.beTrig);
    }
    // Рандомизируем Trail
    if (opts.vTrail && c.useTrail) {
      c.trTrig = randFromRange(...numRanges.trTrig);
      c.trDist = randFromRange(...numRanges.trDist);
    }
    // Рандомизируем ADX threshold
    if (opts.vADX && c.useADX) {
      c.adxThresh = randFromRange(...numRanges.adxThresh);
    }

    points.push(c);
  }

  return points;
}

// Генерирует список соседних cfg на расстоянии одного шага
function _hcNeighbours(cfg, opts) {
  const nb = [];
  const step  = opts.step  || 0.5;
  const pvStp = opts.pvStep || 1;

  function mutate(key, delta) {
    const c = JSON.parse(JSON.stringify(cfg));
    delete c._oos; // не наследовать IS/OOS данные от родительского cfg — они устарели для нового соседа
    if (key === 'sl_a')  { if (c.slPair&&c.slPair.a)  c.slPair.a.m  = Math.max(0.2, +(c.slPair.a.m  + delta).toFixed(2)); else return null; }
    else if (key === 'sl_p') { if (c.slPair&&c.slPair.p)  c.slPair.p.m  = Math.max(0.5, +(c.slPair.p.m  + delta).toFixed(1)); else return null; }
    else if (key === 'tp_a') { if (c.tpPair&&c.tpPair.a)  c.tpPair.a.m  = Math.max(0.2, +(c.tpPair.a.m  + delta).toFixed(2)); else return null; }
    else if (key === 'tp_b') { if (c.tpPair&&c.tpPair.b)  c.tpPair.b.m  = Math.max(0.2, +(c.tpPair.b.m  + delta).toFixed(2)); else return null; }
    else if (key === 'atr') { c.atrPeriod = Math.max(5, Math.round(c.atrPeriod + delta)); }
    else if (key === 'pvL') { c.pvL = Math.max(2, Math.round(c.pvL + delta)); }
    else if (key === 'pvR') { c.pvR = Math.max(1, Math.round(c.pvR + delta)); }
    else if (key === 'maP') { c.maP = Math.max(5, Math.round(c.maP + delta)); }
    else if (key === 'beTrig') { c.beTrig = Math.max(0.3, +(c.beTrig + delta).toFixed(2)); }
    else if (key === 'trTrig') { c.trTrig = Math.max(0.3, +(c.trTrig + delta).toFixed(2)); }
    else if (key === 'trDist') { c.trDist = Math.max(0.3, +(c.trDist + delta).toFixed(2)); }
    else if (key === 'adxT')  { c.adxThresh = Math.max(10, Math.round(c.adxThresh + delta)); }
    else if (key === 'revSkip')     { c.revSkip     = Math.max(0, Math.round((c.revSkip||0)     + delta)); }
    else if (key === 'revCooldown') { c.revCooldown = Math.max(0, Math.round((c.revCooldown||0) + delta)); }
    else if (key === 'revBars')     { c.revBars     = Math.max(1, Math.round((c.revBars||2)     + delta)); }
    else if (key === 'beOff')       { c.beOff       = Math.max(0, +(  (c.beOff||0)       + delta).toFixed(2)); }
    else if (key === 'timeBars')    { c.timeBars    = Math.max(5, Math.round((c.timeBars||20)  + delta)); }
    else if (key === 'confN')       { c.confN       = Math.max(2, Math.round((c.confN||2)      + delta)); }
    else if (key === 'sTrendWin')   { c.sTrendWin   = Math.max(3, Math.round((c.sTrendWin||10) + delta)); }
    else if (key === 'adxLen')      { c.adxLen      = Math.max(5, Math.round((c.adxLen||14)    + delta)); }
    else if (key === 'atrBoMult')   { c.atrBoMult   = Math.max(0.5, +((c.atrBoMult||2.0)      + delta).toFixed(2)); }
    else if (key === 'rsiOS')       { c.rsiOS       = Math.max(10, Math.min(45, Math.round((c.rsiOS||30)  + delta))); }
    else if (key === 'rsiOB')       { c.rsiOB       = Math.max(55, Math.min(90, Math.round((c.rsiOB||70)  + delta))); }
    else if (key === 'volFMult')    { c.volFMult    = Math.max(0.5, +((c.volFMult||1.5)        + delta).toFixed(2)); }
    else if (key === 'vsaMult')     { c.vsaMult     = Math.max(0.5, +((c.vsaMult||1.5)         + delta).toFixed(2)); }
    else if (key === 'wtThresh')    { c.wtThresh    = Math.max(1,   Math.round((c.wtThresh||10) + delta)); }
    else if (key === 'freshMax')    { c.freshMax    = Math.max(3,   Math.round((c.freshMax||10) + delta)); }
    else if (key === 'maDistMax')   { c.maDistMax   = Math.max(0.5, +((c.maDistMax||2.0)       + delta).toFixed(2)); }
    return c;
  }

  // SL
  if (opts.vSL) {
    [-step, +step].forEach(d => { const c=mutate('sl_a', d); if(c) nb.push(c); });
    [-step, +step].forEach(d => { const c=mutate('sl_p', d*2); if(c) nb.push(c); });
  }
  // TP
  if (opts.vTP) {
    [-step, +step].forEach(d => { const c=mutate('tp_a', d); if(c) nb.push(c); });
    [-step, +step].forEach(d => { const c=mutate('tp_b', d); if(c) nb.push(c); });
  }
  // ATR период
  if (opts.vATR) {
    [-2, +2, -4, +4].forEach(d => { const c=mutate('atr', d); if(c) nb.push(c); });
  }
  // Pivot
  if (opts.vPV) {
    [-pvStp, +pvStp].forEach(d => { const c=mutate('pvL', d); if(c) nb.push(c); });
    [-pvStp, +pvStp].forEach(d => { const c=mutate('pvR', d); if(c) nb.push(c); });
  }
  // MA период
  if (opts.vMA && cfg.useMA) {
    [-5, +5, -10, +10].forEach(d => { const c=mutate('maP', d); if(c) nb.push(c); });
  }
  // BE trigger
  if (opts.vBE && cfg.useBE) {
    [-step, +step].forEach(d => { const c=mutate('beTrig', d); if(c) nb.push(c); });
  }
  // Trail
  if (opts.vTrail && cfg.useTrail) {
    [-step, +step].forEach(d => { const c=mutate('trTrig', d); if(c) nb.push(c); });
    [-step, +step].forEach(d => { const c=mutate('trDist', d); if(c) nb.push(c); });
  }
  // ADX
  if (opts.vADX && cfg.useADX) {
    [-5, +5].forEach(d => { const c=mutate('adxT', d); if(c) nb.push(c); });
  }
  // RevSig skip / cooldown / bars — расширенные шаги для преодоления локальных плато
  if (opts.vRev && cfg.useRev) {
    // revSkip: шаги ±1,±2,±3,±5 + абсолютные значения 0..15 (полный диапазон)
    [-1,+1,-2,+2,-3,+3,-5,+5].forEach(d => { const c=mutate('revSkip', d); if(c) nb.push(c); });
    for (let v=0; v<=15; v++) {
      if (v !== (cfg.revSkip||0)) {
        const c = JSON.parse(JSON.stringify(cfg));
        c.revSkip = v;
        nb.push(c);
      }
    }
    // revCooldown: шаги ±1,±2,±3,±5
    [-1,+1,-2,+2,-3,+3,-5,+5].forEach(d => { const c=mutate('revCooldown', d); if(c) nb.push(c); });
    // revBars: шаги ±1,±2
    [-1,+1,-2,+2].forEach(d => { const c=mutate('revBars', d); if(c) nb.push(c); });
  }
  // BE offset
  if (opts.vBE && cfg.useBE) {
    [-step, +step].forEach(d => { const c=mutate('beOff', d); if(c) nb.push(c); });
  }
  // Time bars
  if (opts.vTime && cfg.useTime) {
    [-5,+5,-10,+10,-20,+20,-30,+30].forEach(d => { const c=mutate('timeBars', d); if(c) nb.push(c); });
  }
  // Confirm MA period
  if (opts.vConf && cfg.useConfirm) {
    [-1,+1,-2,+2,-5,+5].forEach(d => { const c=mutate('confN', d); if(c) nb.push(c); });
  }
  // Simple Trend window
  if (opts.vSTrend && cfg.useSTrend) {
    [-2,+2,-5,+5,-10,+10].forEach(d => { const c=mutate('sTrendWin', d); if(c) nb.push(c); });
  }
  // ADX length
  if (opts.vADX && cfg.useADX) {
    [-2, +2].forEach(d => { const c=mutate('adxLen', d); if(c) nb.push(c); });
  }
  // ATR Breakout multiplier
  if (opts.vATR && cfg.useAtrBo) {
    [-step, +step].forEach(d => { const c=mutate('atrBoMult', d); if(c) nb.push(c); });
  }
  // RSI levels
  if (opts.vRSI && cfg.useRSI) {
    [-5, +5].forEach(d => { const c=mutate('rsiOS', d); if(c) nb.push(c); });
    [-5, +5].forEach(d => { const c=mutate('rsiOB', d); if(c) nb.push(c); });
  }
  // Volume filters
  if (opts.vVol && cfg.useVolF)  { [-step, +step].forEach(d => { const c=mutate('volFMult',  d); if(c) nb.push(c); }); }
  if (opts.vVol && cfg.useVSA)   { [-step, +step].forEach(d => { const c=mutate('vsaMult',   d); if(c) nb.push(c); }); }
  if (opts.vVol && cfg.useWT)    { [-2,+2,-5,+5,-10,+10,-15,+15].forEach(d => { const c=mutate('wtThresh', d); if(c) nb.push(c); }); }
  // Freshness / MA distance
  if (opts.vFilt && cfg.useFresh)  { [-3,+3,-5,+5,-10,+10,-20,+20].forEach(d => { const c=mutate('freshMax', d); if(c) nb.push(c); }); }
  if (opts.vFilt && cfg.useMaDist) { [-step, +step].forEach(d => { const c=mutate('maDistMax', d); if(c) nb.push(c); }); }

  return nb;
}

async function runHillClimbing() {
  if (!DATA) { alert('Нет данных'); return; }
  if (_hcRunning) return;

  // Определяем стартовый результат
  const srcMode = document.querySelector('input[name="hc_source"]:checked').value;
  const metric  = document.querySelector('input[name="hc_metric"]:checked').value;
  const maxIter = parseInt(document.getElementById('hc_maxiter').value) || 200;
  const minTr   = parseInt(document.getElementById('hc_mintr').value)   || 30;
  const step    = parseFloat(document.getElementById('hc_step').value)  || 0.5;
  const pvStep  = parseInt(document.getElementById('hc_pvstep').value)  || 1;

  const isRobMetric = metric === 'rob';
  const isTvMetric  = metric === 'tv_score' || metric === 'tv_pnl' || metric === 'tv_pdd';
  const _metricLbl  = {pdd:'P/DD',pnl:'PnL%',wr:'WR%',avg:'Avg%',rob:'Rob',
                       tv_score:'TV Score',tv_pnl:'TV PnL ret%',tv_pdd:'TV P/DD ret%'}[metric]||'Score';
  // В режиме устойчивости ограничиваем итерации — каждая стоит ~300мс
  const effectiveMaxIter = isRobMetric ? Math.min(maxIter, 30) : maxIter;

  const opts = {
    step, pvStep,
    vSL:    document.getElementById('hc_v_sl').checked,
    vTP:    document.getElementById('hc_v_tp').checked,
    vATR:   document.getElementById('hc_v_atr').checked,
    vPV:    document.getElementById('hc_v_pv').checked,
    vMA:    document.getElementById('hc_v_ma').checked,
    vBE:    document.getElementById('hc_v_be').checked,
    vTrail: document.getElementById('hc_v_trail').checked,
    vADX:   document.getElementById('hc_v_adx').checked,
    vRev:   document.getElementById('hc_v_rev')?.checked  ?? true,
    vTime:  document.getElementById('hc_v_time')?.checked  ?? false,
    vConf:  document.getElementById('hc_v_conf')?.checked  ?? false,
    vSTrend:document.getElementById('hc_v_stw')?.checked   ?? false,
    vRSI:   document.getElementById('hc_v_rsi')?.checked   ?? false,
    vVol:   document.getElementById('hc_v_vol')?.checked   ?? false,
    vFilt:  document.getElementById('hc_v_filt')?.checked  ?? false,
  };

  // Собираем стартовые точки
  const topN = parseInt(document.getElementById('hc_src_topn')?.value) || 5;
  let startCfgs = [];
  if (srcMode === 'selected') {
    if (!_robustResult || !_robustResult.cfg) { alert('Сначала выбери результат (открой детали)'); return; }
    startCfgs = [_robustResult.cfg];
  } else if (srcMode === 'fav') {
    // Лучший из избранных по P/DD
    const best = favourites.slice().sort((a,b) => {
      const pddA = a.stats.dd>0 ? a.stats.pnl/a.stats.dd : 0;
      const pddB = b.stats.dd>0 ? b.stats.pnl/b.stats.dd : 0;
      return pddB - pddA;
    })[0];
    if (!best || !best.cfg) { alert('Нет избранных с настройками'); return; }
    startCfgs = [best.cfg];
  } else if (srcMode === 'all_fav') {
    // Все избранные как стартовые точки
    startCfgs = favourites.filter(f => f.cfg).map(f => f.cfg);
    if (!startCfgs.length) { alert('Нет избранных с настройками'); return; }
  } else if (srcMode === 'all_visible') {
    startCfgs = _visibleResults.filter(r => r.cfg).map(r => r.cfg);
    if (!startCfgs.length) { alert('Нет видимых результатов с настройками'); return; }
  } else if (srcMode === 'rob_filtered') {
    // ── ИДЕЯ 8: Все результаты с robScore >= N как стартовые точки
    const minR = parseInt(document.getElementById('hc_src_rob_min')?.value) || 3;
    const robFiltered = results.filter(r => r.cfg && r.robScore !== undefined && r.robScore >= minR);
    if (!robFiltered.length) {
      alert(`Нет результатов с robScore ≥ ${minR}. Сначала запусти OOS-скан или массовый тест.`);
      return;
    }
    startCfgs = robFiltered.map(r => r.cfg);
    toast(`🛡 Старт от ${startCfgs.length} точек с robScore ≥ ${minR}`);
  } else if (srcMode === 'multistart') {
    // ── MULTI-START: генерируем N случайных точек из пространства параметров ──
    const msN = Math.max(5, Math.min(200, parseInt(document.getElementById('hc_ms_n')?.value) || 20));
    if (!_visibleResults.length && !results.length) { alert('Нет результатов для определения пространства параметров'); return; }
    // Берём шаблон из лучшего видимого — только структура (паттерны, фильтры)
    const _msTemplate = (_visibleResults[0] || results[0])?.cfg;
    if (!_msTemplate) { alert('Нет cfg для шаблона'); return; }
    startCfgs = _hcMultiStartPoints(_msTemplate, msN, opts);
    toast(`🎲 Multi-start: ${startCfgs.length} случайных точек`);
  } else {
    // top N visible
    const n = Math.min(topN, _visibleResults.length);
    if (n === 0) { alert('Нет видимых результатов'); return; }
    for (let i = 0; i < n; i++) {
      if (_visibleResults[i].cfg) startCfgs.push(_visibleResults[i].cfg);
    }
  }
  if (!startCfgs.length) { alert('Нет cfg для старта'); return; }
  // Дедуплицируем стартовые точки
  const _startSeen = new Set();
  startCfgs = startCfgs.filter(c => {
    const k = JSON.stringify(c);
    if (_startSeen.has(k)) return false;
    _startSeen.add(k); return true;
  });

  _hcRunning = true;
  const _hcStartTime = Date.now(); // для ETA
  document.getElementById('btn-run-hc').style.display   = 'none';
  document.getElementById('btn-stop-hc').style.display  = '';
  document.getElementById('hc-progress').style.display  = 'block';
  document.getElementById('hc-pbar').style.width = '0%';
  document.getElementById('hc-results').innerHTML = '';

  const allFound = []; // все найденные результаты
  _surrogate.reset(); // сбрасываем surrogate для нового поиска

  for (let si = 0; si < startCfgs.length; si++) {
    if (!_hcRunning) break;
    const startCfg = startCfgs[si];
    const _srcLabel = srcMode === 'multistart'
      ? `🎲 Точка ${si+1}/${startCfgs.length}`
      : `Старт ${si+1}/${startCfgs.length}: ${(startCfg.usePivot?'Pivot':'')+(startCfg.useEngulf?'Engulf':'')||'cfg'}`;
    const _bestSoFar = allFound.length > 0
      ? ` | Лучший: ${Math.max(...allFound.map(x=>x.score)).toFixed(2)}`
      : '';
    document.getElementById('hc-status').textContent = _srcLabel + _bestSoFar;

    // Базовый результат для этой стартовой точки
    const baseR = _hcRunBacktest(startCfg);
    if (!baseR || baseR.n < minTr) continue;

    const baseScore = isTvMetric ? _hcTvScore(startCfg, metric) : _hcMetric(baseR, metric);

    const visited = new Set();
    visited.add(JSON.stringify(startCfg));
    let iter = 0;

    // Список тестов устойчивости (читается один раз для всего HC)
    const robTests = [];
    if (document.getElementById('hcr_oos')?.checked)   robTests.push('oos');
    if (document.getElementById('hcr_walk')?.checked)  robTests.push('walk');
    if (document.getElementById('hcr_param')?.checked) robTests.push('param');
    if (document.getElementById('hcr_noise')?.checked) robTests.push('noise');
    if (document.getElementById('hcr_mc')?.checked)    robTests.push('mc');
    // Если ни один не выбран — используем все 5 по умолчанию
    if (isRobMetric && robTests.length === 0) robTests.push('oos','walk','param','noise','mc');

    if (isRobMetric) {
      // ── ROB РЕЖИМ: ДВУХПРОХОДНЫЙ ПОИСК УСТОЙЧИВЫХ ──────────────────
      // Проход 1 (быстрый): бэктест + только OOS-фильтр → отсев слабых кандидатов
      // Проход 2 (полный): все 5 тестов на отобранных кандидатах
      // ── ИДЕЯ 7 (LHS): добавляем случайные точки из расширенного радиуса

      const robMinThresh = parseInt(document.getElementById('hc_rob_min')?.value) || 0;
      const useLHSExpand = document.getElementById('hc_lhs_expand')?.checked;

      // ── Фаза 1: генерируем кандидатов (level1 + level2 + LHS расширение) ──
      const level1 = _hcNeighbours(startCfg, opts);
      const allCandidates = [];
      const candSeen = new Set([JSON.stringify(startCfg)]);
      for (const nc of level1) {
        const k = JSON.stringify(nc);
        if (!candSeen.has(k)) { candSeen.add(k); allCandidates.push(nc); }
      }
      // Level 2 — жёсткий cap effectiveMaxIter
      outer2: for (const nc of level1) {
        for (const nc2 of _hcNeighbours(nc, opts)) {
          if (allCandidates.length >= effectiveMaxIter) break outer2;
          const k = JSON.stringify(nc2);
          if (!candSeen.has(k)) { candSeen.add(k); allCandidates.push(nc2); }
        }
      }

      // ── ИДЕЯ 7: LHS-расширение — добавляем случайные точки в ±2×step радиусе
      if (useLHSExpand) {
        const lhsCount = Math.min(effectiveMaxIter, 20); // добавляем до 20 LHS точек
        const lhsStep = (opts.step || 0.5) * 2;
        const lhsPvStep = (opts.pvStep || 1) * 2;
        const lhsOpts = { ...opts, step: lhsStep, pvStep: lhsPvStep };
        // Берём всех соседей с удвоенным шагом
        const wideNeighbours = _hcNeighbours(startCfg, lhsOpts);
        // LHS: делим на страты и берём по одному из каждой
        const lhsStrat = Math.max(1, Math.floor(wideNeighbours.length / lhsCount));
        for (let li = 0; li < wideNeighbours.length && allCandidates.length < effectiveMaxIter + lhsCount; li += lhsStrat) {
          const nc = wideNeighbours[li + Math.floor(Math.random() * Math.min(lhsStrat, wideNeighbours.length - li))];
          if (!nc) continue;
          const k = JSON.stringify(nc);
          if (!candSeen.has(k)) { candSeen.add(k); allCandidates.push(nc); }
        }
      }

      const totalCandidates = allCandidates.length;
      document.getElementById('hc-status').textContent =
        `🔎 Фаза 1: предварительный отбор из ${totalCandidates} кандидатов…`;
      await yieldToUI();

      // ── Фаза 1: быстрый бэктест + OOS предотбор ──────────────────────
      const phase1Passed = []; // кандидаты прошедшие OOS
      for (let ci = 0; ci < totalCandidates && _hcRunning; ci++) {
        const nc = allCandidates[ci];
        const r = _hcRunBacktest(nc);
        iter++;
        if (r && r.n >= minTr) {
          // Быстрый OOS: последние 20% данных должны быть прибыльными
          const N = DATA.length, cut = Math.floor(N * 0.8);
          const origData = DATA;
          DATA = origData.slice(cut);
          const rOOS = _hcRunBacktest(nc);
          DATA = origData;
          const oosOk = rOOS && rOOS.n >= 3 && rOOS.pnl > 0;
          if (oosOk) phase1Passed.push({ nc, r });
        }

        const pct = Math.round((ci + 1) / totalCandidates * 50); // первые 50%
        document.getElementById('hc-pbar').style.width = pct + '%';
        if (ci % 5 === 0) {
          document.getElementById('hc-status').textContent =
            `🔎 Фаза 1: ${ci+1}/${totalCandidates} | OOS прошли: ${phase1Passed.length}`;
          await yieldToUI();
        }
      }

      if (!_hcRunning) { /* прерван */ }
      else {
        // ── Фаза 2: полные тесты устойчивости на прошедших OOS ───────────
        const totalPhase2 = phase1Passed.length;
        document.getElementById('hc-status').textContent =
          `🛡 Фаза 2: полные тесты на ${totalPhase2} кандидатах (OOS прошли)…`;
        await yieldToUI();

        _hcRobRunning = true; // разрешаем noise/MC работать в фазе 2
        for (let pi = 0; pi < totalPhase2 && _hcRunning; pi++) {
          const { nc, r } = phase1Passed[pi];
          const fakeR2 = { cfg: nc };
          const { score: robScore, details: robDetails2 } = await runRobustScoreForDetailed(fakeR2, robTests, true); // fastMode=true для скорости
          if (!_hcRunning) break;
          r._robScore = robScore; r.robDetails = robDetails2;
          const pdd = r.dd > 0 ? r.pnl / r.dd : (r.pnl > 0 ? 99 : 0);
          const score = robScore * 100 + Math.min(pdd, 99);
          // Сохраняем ВСЕ — фильтруем при отображении по robMinThresh
          allFound.push({ cfg: nc, score, r, delta: score - baseScore, robScore, robMax: robTests.length, robDetails: robDetails2 });

          const pct = 50 + Math.round((pi + 1) / totalPhase2 * 50); // вторые 50%
          document.getElementById('hc-pbar').style.width = pct + '%';
          const withRob = allFound.filter(x => x.robScore >= Math.max(1, robMinThresh)).length;
          const elapsed = Date.now() - _hcStartTime;
          const msPerIter = (elapsed / (pi + 1));
          const remaining = Math.round((totalPhase2 - pi - 1) * msPerIter / 1000);
          const etaStr = remaining > 60 ? Math.round(remaining/60) + 'м ' + (remaining%60) + 'с' : remaining + 'с';
          document.getElementById('hc-status').textContent =
            `🛡 Фаза 2: ${pi+1}/${totalPhase2} | ≥${robMinThresh}🛡: ${withRob} | ~${etaStr} осталось`;
          await yieldToUI();
        }
        _hcRobRunning = false; // сбрасываем после фазы 2
      }

    } else {
      // ── ОБЫЧНЫЙ РЕЖИМ: BEAM SEARCH ──────────────────────────────────
      let beam = [{ cfg: JSON.parse(JSON.stringify(startCfg)), score: baseScore, r: baseR }];
      let improved = true;

      while (improved && iter < effectiveMaxIter && _hcRunning) {
        improved = false;
        const candidates = [];

        for (const pos of beam) {
          for (const nc of _hcNeighbours(pos.cfg, opts)) {
            const key = JSON.stringify(nc);
            if (visited.has(key)) continue;
            visited.add(key);

            // ── ИДЕЯ 6+10: surrogate ансамбль (PDD + robScore) — пропускаем явно слабых
            {
              const predPdd = _surrogate.trained ? _surrogate.predict(nc) : null;
              const predRob = _robSurrogate.trained ? _robSurrogate.predict(nc) : null;
              const bestPdd = beam[0]?.r?.dd > 0 ? beam[0].r.pnl/beam[0].r.dd : 0;
              // Фильтр по PDD (оригинальный)
              const skipByPdd = predPdd !== null && bestPdd > 1 && predPdd < bestPdd * 0.25;
              // Фильтр по rob: если предсказанный robScore < 1 с высокой уверенностью
              const skipByRob = predRob !== null && _robSurrogate.Xdata.length > 50 && predRob < 0.8;
              if (skipByPdd || skipByRob) {
                iter++; continue; // surrogate ансамбль: явно слабый, пропускаем
              }
            }
            const r = _hcRunBacktest(nc);
            iter++;
            if (r && r.n >= minTr) {
              // Обучаем surrogate на каждом бэктесте
              const _rpdd = r.dd > 0 ? r.pnl/r.dd : (r.pnl > 0 ? 50 : 0);
              _surrogate.addPoint(nc, _rpdd);
              const score = isTvMetric ? _hcTvScore(nc, metric) : _hcMetric(r, metric);
              candidates.push({ cfg: nc, score, r });
              // Сохраняем все соседи не хуже 90% базы — чтобы показывать альтернативы
              // Порог: baseScore - 10% от |baseScore| (корректно и для отрицательных значений)
              if (score >= baseScore - Math.abs(baseScore) * 0.10) {
                allFound.push({ cfg: nc, score, r, delta: score - baseScore });
              }
            }

            const pct = Math.min(99, Math.round(iter / effectiveMaxIter * 100));
            document.getElementById('hc-pbar').style.width = pct + '%';
            document.getElementById('hc-status').textContent =
              `⚡ Итер. ${iter}/${effectiveMaxIter} | Луч: ${beam.length} | Находки: ${allFound.length} | ${_metricLbl}: ${beam[0].score.toFixed(1)}`;

            if (iter % 10 === 0) {
              await yieldToUI();
              if (!_hcRunning) break;
            }
          }
          if (!_hcRunning) break;
        }

        const allBeam = [...beam, ...candidates];
        allBeam.sort((a, b) => b.score - a.score);
        const newBeam = [];
        const bSeen = new Set();
        for (const x of allBeam) {
          const k = JSON.stringify(x.cfg);
          if (!bSeen.has(k)) { bSeen.add(k); newBeam.push(x); }
          if (newBeam.length >= 3) break;
        }
        if (newBeam.length && newBeam[0].score > beam[0].score + 0.01) {
          improved = true; beam = newBeam;
        }
      }
    } // end if isRobMetric

    // ── GA-фаза: если включён, запускаем GA поверх beam/rob результатов
    const doGA = document.getElementById('hc_use_ga')?.checked;
    if (doGA && _hcRunning) {
      document.getElementById('hc-status').textContent = '🧬 GA-поиск запущен…';
      await yieldToUI();
      const gaProgress = (gen, maxGen, best, total) => {
        document.getElementById('hc-pbar').style.width = Math.round(gen/maxGen*100) + '%';
        const bestRob = best.robScore !== undefined ? best.robScore+'/5' : best.score.toFixed(1);
        document.getElementById('hc-status').textContent =
          `🧬 GA поколение ${gen+1}/${maxGen} | Лучший: ${bestRob} | Всего найдено: ${total}`;
      };
      await _runGA([startCfg], opts, minTr, isRobMetric, allFound, baseScore, gaProgress);
    }
  }

  if (!_hcRunning) {
    document.getElementById('hc-status').textContent = '⏹ Остановлено';
  } else {
    document.getElementById('hc-pbar').style.width = '100%';
    document.getElementById('hc-status').textContent =
      `✅ Готово. Найдено улучшений: ${allFound.length}`;
  }

  _hcRunning = false;
  document.getElementById('btn-stop-hc').style.display = 'none';
  document.getElementById('btn-run-hc').style.display  = '';

  // Фаза 2: тест устойчивости для найденных (если включён)
  const doRobFilter = document.getElementById('hc_rob_filter') && document.getElementById('hc_rob_filter').checked;
  const robTopN = doRobFilter ? (parseInt(document.getElementById('hc_rob_top').value) || 5) : 0;
  let _phase2Stopped = false;
  if (doRobFilter && allFound.length > 0) {
    const robTests = [];
    if (document.getElementById('hcr_oos').checked)   robTests.push('oos');
    if (document.getElementById('hcr_walk').checked)  robTests.push('walk');
    if (document.getElementById('hcr_param').checked) robTests.push('param');
    if (document.getElementById('hcr_noise').checked) robTests.push('noise');
    if (document.getElementById('hcr_mc').checked)    robTests.push('mc');

    if (robTests.length > 0) {
      // Дедуплицируем и берём топ-100 для проверки
      const seenPre = new Set();
      const toCheck = [];
      allFound.sort((a,b) => b.score - a.score);
      for (const x of allFound) {
        const k = JSON.stringify(x.cfg);
        if (!seenPre.has(k)) { seenPre.add(k); toCheck.push(x); }
        if (toCheck.length >= 100) break;
      }

      document.getElementById('btn-run-hc').style.display = 'none';
      document.getElementById('btn-stop-hc').style.display = '';

      _hcRunning = true;    // реактивируем для фазы 2 (стоп-кнопка)
      _hcRobRunning = true; // разрешаем runRobustScoreFor работать (иначе _stopCheck()=true сразу)
      document.getElementById('btn-stop-hc').style.display = '';
      document.getElementById('btn-run-hc').style.display = 'none';
      for (let ri = 0; ri < toCheck.length; ri++) {
        if (!_hcRunning) { _phase2Stopped = true; break; }
        const x = toCheck[ri];
        document.getElementById('hc-status').textContent =
          `🔬 Тест устойчивости ${ri+1}/${toCheck.length}…`;
        document.getElementById('hc-pbar').style.width = Math.round(ri/toCheck.length*100) + '%';
        // Оборачиваем cfg в объект с нужным полем для runRobustScoreFor
        const fakeR = { cfg: x.cfg };
        const { score, details } = await runRobustScoreForDetailed(fakeR, robTests, true);
        x.robScore = score;
        x.robMax   = robTests.length;
        x.robDetails = details;
        await yieldToUI();
      }

      // Сортируем: сначала по robScore, потом по основной метрике
      allFound.sort((a,b) => {
        const aRob = a.robScore !== undefined ? a.robScore : -1;
        const bRob = b.robScore !== undefined ? b.robScore : -1;
        if (bRob !== aRob) return bRob - aRob;
        return b.score - a.score;
      });

      _hcRunning = false;
      _hcRobRunning = false;
      document.getElementById('btn-stop-hc').style.display = 'none';
      document.getElementById('btn-run-hc').style.display = '';
      document.getElementById('hc-pbar').style.width = '100%';
      document.getElementById('hc-status').textContent = _phase2Stopped ? '⏹ Остановлено' : '✅ Тест устойчивости завершён';
    }
  }

  // Конвертируем HC результаты в формат основной таблицы
  const _hcMaxRes = parseInt(document.getElementById('hc_maxres')?.value) || 500;
  // Применяем кластеризацию если включена
  const doCluster = document.getElementById('hc_cluster')?.checked !== false;
  let _allFoundFinal = allFound;
  if (doCluster && allFound.length > 1) {
    const _beforeCluster = allFound.length;
    _allFoundFinal = _hcCluster(allFound, step, pvStep);
    const hint = document.getElementById('hc-status');
    if (hint) hint.textContent += ' | Кластеризация: ' + _beforeCluster + ' → ' + _allFoundFinal.length;
  }

  _hcTableResults = [];
  const seenHC = new Set();
  // Сортируем финальный список (кластеризация могла нарушить порядок)
  if (doRobFilter) {
    _allFoundFinal.sort((a,b) => {
      const aR = a.robScore !== undefined ? a.robScore : -1;
      const bR = b.robScore !== undefined ? b.robScore : -1;
      if (bR !== aR) return bR - aR;
      return b.score - a.score;
    });
  } else {
    _allFoundFinal.sort((a,b) => b.score - a.score);
  }
  // В ROB режиме фильтруем по порогу robScore
  const _robFilterThresh = isRobMetric
    ? (parseInt(document.getElementById('hc_rob_min')?.value) || 0)
    : -1;
  for (const x of _allFoundFinal) {
    const key = JSON.stringify(x.cfg);
    if (seenHC.has(key)) continue;
    seenHC.add(key);
    // Фильтр: в rob режиме показываем только >= threshold (0 = показать все)
    if (_robFilterThresh > 0 && (x.robScore === undefined || x.robScore < _robFilterThresh)) continue;
    const raw = x.r;
    const c = x.cfg;
    // Вычисляем IS/OOS данные для HC соседа — строим _oos и IS-статы
    const _oosData = _hcBuildOOS(c);
    if (_oosData) {
      c._oos = _oosData._oos;
      // ⚠️ ВАЖНО: Сохраняем полный eq в отдельное поле, НЕ перезаписываем x.r.eq!
      // x.r.eq это оригинальный результат HC, он должен остаться без изменений.
      // Используем _fullEq для OOS отрисовки, если график с OOS-расчетом.
      if (_oosData.eq) x.r._fullEq = Array.from(_oosData.eq);
    }
    // IS-статы: из IS-прогона (70%) если доступны, иначе из HC full-data прогона
    const _is = _oosData?.isStats || null;
    const pdd = _is
      ? _is.pdd
      : (raw.dd > 0 ? raw.pnl / raw.dd : (raw.pnl > 0 ? 999 : 0));
    // Строим имя через buildName — как в основных результатах
    let slStr = ''; let tpStr = '';
    if (c.slPair) { slStr = (c.slPair.combo ? `SL(ATR×${c.slPair.a?.m||0}|${c.slLogic==='or'?'OR':'AND'}|${c.slPair.p?.m||0}%)` : c.slPair.a ? `SL×${c.slPair.a.m}ATR` : `SL${c.slPair.p?.m||0}%`); }
    if (c.tpPair) { const ta=c.tpPair.a; const tb=c.tpPair.b; tpStr = c.tpPair.combo ? `TP(${ta?.type==='rr'?'RR'+ta.m:ta?.type==='atr'?'TP×'+ta.m+'ATR':'TP'+ta.m+'%'}|${c.tpLogic==='or'?'OR':'AND'}|${tb?.type==='rr'?'RR'+tb.m:tb?.type==='atr'?'TP×'+tb.m+'ATR':'TP'+tb.m+'%'})` : ta ? (ta.type==='rr'?`RR×${ta.m}`:ta.type==='atr'?`TP×${ta.m}ATR`:`TP${ta.m}%`) : ''; }
    const name = typeof buildName === 'function'
      ? buildName(c, c.pvL, c.pvR, slStr, tpStr, {}, {maP: c.maP, maType: c.maType||'EMA', htfRatio: c.htfRatio||1, stw: c.sTrendWin, atrP: c.atrPeriod, adxL: c.adxLen})
      : ['SL('+slStr+')', 'TP('+tpStr+')', 'pv(L'+c.pvL+'R'+c.pvR+')', 'ATR'+c.atrPeriod].filter(Boolean).join(' ');
    // IS-статы для первой строки в таблице и детальной статистике
    const _isR = _is || raw;
    _hcTableResults.push({
      name, cfg: x.cfg,
      pnl: _isR.pnl, wr: _isR.wr, n: _isR.n, dd: _isR.dd, pdd,
      avg: _isR.avg||0, dwr: _isR.dwr||0,
      p1: _isR.p1||0, p2: _isR.p2||0, c1: _isR.c1||0, c2: _isR.c2||0,
      sig: _calcStatSig(_isR), gt: _calcGTScore(_isR), cvr: _isR.cvr != null ? _isR.cvr : _calcCVR(_isR.eq),
      upi: _isR.upi != null ? _isR.upi : _calcUlcerIdx(_isR.eq),
      sortino: _isR.sortino != null ? _isR.sortino : _calcSortino(_isR.eq), // ##SOR
      kRatio:  _isR.kRatio  != null ? _isR.kRatio  : _calcKRatio(_isR.eq),  // ##KR
      sqn:     _isR.sqn     != null ? _isR.sqn     : null,                   // ##SQN (нет eq→sqn нет fallback)
      omega:   _isR.omega   != null ? _isR.omega   : _calcOmega(_isR.eq),   // ##OMG
      pain:    _isR.pain    != null ? _isR.pain    : _calcPainRatio(_isR.eq), // ##PAIN
      robScore: x.robScore, robMax: x.robMax, robDetails: x.robDetails,
      eq: Array.from(x.r.eq),
      nL: _isR.nL||0, pL: _isR.pL||0, wrL: _isR.wrL,
      nS: _isR.nS||0, pS: _isR.pS||0, wrS: _isR.wrS, dwrLS: _isR.dwrLS,
      _hcScore: x.score, _hcDelta: x.delta
    });
    if (_hcTableResults.length >= _hcMaxRes) break;
  }

  // Переключаем таблицу на HC режим если есть результаты
  if (_hcTableResults.length > 0) {
    switchTableMode('hc');
    const minT  = parseInt(document.getElementById('hc_rob_min')?.value) || 0;
    const full5 = allFound.filter(r => r.robScore >= 5).length;
    const full3 = allFound.filter(r => r.robScore >= 3).length;
    const msg = isRobMetric
      ? `🛡 Таблица: ${_hcTableResults.length} (порог ≥${minT}). Всего проверено: ${allFound.length} | ≥3: ${full3} | 5/5: ${full5}`
      : '🧗 Найдено ' + _hcTableResults.length + ' улучшений — показаны в таблице';
    toast(msg, 8000);
  } else if (isRobMetric) {
    const minT = parseInt(document.getElementById('hc_rob_min')?.value) || 0;
    toast(`🛡 Проверено ${allFound.length} кандидатов, ни один не прошёл порог ≥${minT || 1}. Снизь порог до 0 чтобы увидеть все, или смени стартовую точку.`, 8000);
  }

  // Рендерим результаты в модале HC (компактно)
  _hcRenderResults(allFound, metric);
}

// ============================================================
// КЛАСТЕРИЗАЦИЯ HC результатов
// Из группы похожих (отличающихся на 1 шаг) оставляем только лучший
// ============================================================
function _hcCluster(found, step, pvStep) {
  if (!found.length) return found;

  // Расстояние между двумя cfg (нормализованное)
  function cfgDist(a, b) {
    let d = 0;
    // ATR период
    d += Math.abs((a.atrPeriod||14) - (b.atrPeriod||14)) / 2;
    // Pivot
    d += Math.abs((a.pvL||5) - (b.pvL||5)) / pvStep;
    d += Math.abs((a.pvR||2) - (b.pvR||2)) / pvStep;
    // SL
    const saM = (a.slPair&&a.slPair.a) ? a.slPair.a.m : 0;
    const sbM = (b.slPair&&b.slPair.a) ? b.slPair.a.m : 0;
    d += Math.abs(saM - sbM) / step;
    const spM = (a.slPair&&a.slPair.p) ? a.slPair.p.m : 0;
    const spbM = (b.slPair&&b.slPair.p) ? b.slPair.p.m : 0;
    d += Math.abs(spM - spbM) / (step*2);
    // TP
    const taM = (a.tpPair&&a.tpPair.a) ? a.tpPair.a.m : 0;
    const tbM = (b.tpPair&&b.tpPair.a) ? b.tpPair.a.m : 0;
    d += Math.abs(taM - tbM) / step;
    // BE / Trail
    if (a.useBE && b.useBE)   d += Math.abs((a.beTrig||1) - (b.beTrig||1)) / step;
    if (a.useTrail && b.useTrail) d += Math.abs((a.trTrig||1) - (b.trTrig||1)) / step;
    // MA
    d += Math.abs((a.maP||0) - (b.maP||0)) / 5;
    // ATR Breakout multiplier — HC варьирует его, cfgDist должен это учитывать
    if (a.useAtrBo && b.useAtrBo)
      d += Math.abs((a.atrBoMult||2) - (b.atrBoMult||2)) / step;
    // Confirm MA period — варьируется через vConf
    if (a.useConfirm && b.useConfirm)
      d += Math.abs((a.confN||14) - (b.confN||14)) / 10;
    // ADX threshold
    if (a.useADX && b.useADX)
      d += Math.abs((a.adxThresh||20) - (b.adxThresh||20)) / 10;
    return d;
  }

  // Greedy clustering: порог = 1.5 (меньше 1.5 нормализованных шагов = "одна группа")
  const THRESH = 1.5;
  const centers = []; // выбранные представители кластеров

  for (const x of found) {
    let tooClose = false;
    for (const c of centers) {
      if (cfgDist(x.cfg, c.cfg) < THRESH) { tooClose = true; break; }
    }
    if (!tooClose) centers.push(x);
  }
  return centers;
}

// ─────────────────────────────────────────────────────────────────────────────
// ИДЕЯ 10: Генетический алгоритм для поиска устойчивых параметров
// Популяция → оценка → отбор → скрещивание → мутация → новое поколение
// ─────────────────────────────────────────────────────────────────────────────

// Скрещивание двух cfg: берём параметры от родителей случайно
function _gaCrossover(cfgA, cfgB) {
  const c = JSON.parse(JSON.stringify(cfgA));
  // Для каждого числового параметра — 50/50 берём от A или B
  const keys = ['atrPeriod','pvL','pvR','maP','beTrig','trTrig','trDist','adxThresh','revSkip','revCooldown','revBars','volFMult','vsaMult','wtThresh','freshMax','maDistMax','rsiOS','rsiOB'];
  for (const k of keys) {
    if (Math.random() < 0.5 && cfgB[k] !== undefined) c[k] = cfgB[k];
  }
  // SL/TP — берём целиком от одного из родителей
  if (Math.random() < 0.5 && cfgB.slPair) c.slPair = JSON.parse(JSON.stringify(cfgB.slPair));
  if (Math.random() < 0.5 && cfgB.tpPair) c.tpPair = JSON.parse(JSON.stringify(cfgB.tpPair));
  return c;
}

// Мутация: случайный сдвиг 1-2 параметров на ±step
function _gaMutate(cfg, opts, mutRate) {
  const c = JSON.parse(JSON.stringify(cfg));
  const step = opts.step || 0.5;
  const pvStp = opts.pvStep || 1;
  const candidates = [];
  if (opts.vSL && c.slPair?.a) candidates.push(() => { c.slPair.a.m = Math.max(0.2, +(c.slPair.a.m + (Math.random()<0.5?1:-1)*step).toFixed(2)); });
  if (opts.vTP && c.tpPair?.a) candidates.push(() => { c.tpPair.a.m = Math.max(0.2, +(c.tpPair.a.m + (Math.random()<0.5?1:-1)*step).toFixed(2)); });
  if (opts.vATR) candidates.push(() => { c.atrPeriod = Math.max(5, c.atrPeriod + (Math.random()<0.5?1:-1)); });
  if (opts.vPV) candidates.push(() => { c.pvL = Math.max(2, c.pvL + (Math.random()<0.5?1:-1)*pvStp); c.pvR = Math.max(1, c.pvR + (Math.random()<0.5?1:-1)*pvStp); });
  if (opts.vBE && c.useBE) candidates.push(() => { c.beTrig = Math.max(0.3, +(c.beTrig + (Math.random()<0.5?1:-1)*step).toFixed(2)); });
  if (opts.vTrail && c.useTrail) candidates.push(() => { c.trTrig = Math.max(0.3, +(c.trTrig + (Math.random()<0.5?1:-1)*step).toFixed(2)); });
  if (opts.vRev && c.useRev) {
    candidates.push(() => { c.revSkip     = Math.max(0, (c.revSkip||0)     + (Math.random()<0.5?1:-1)); });
    candidates.push(() => { c.revCooldown = Math.max(0, (c.revCooldown||0) + (Math.random()<0.5?1:-1)); });
    candidates.push(() => { c.revBars     = Math.max(1, (c.revBars||2)     + (Math.random()<0.5?1:-1)); });
  }
  if (opts.vADX && c.useADX) candidates.push(() => { c.adxThresh = Math.max(10, c.adxThresh + (Math.random()<0.5?5:-5)); });
  if (opts.vMA && c.useMA)   candidates.push(() => { c.maP = Math.max(5, c.maP + (Math.random()<0.5?5:-5)); });
  if (opts.vRSI && c.useRSI) { candidates.push(() => { c.rsiOS = Math.max(10, Math.min(45, c.rsiOS + (Math.random()<0.5?5:-5))); }); candidates.push(() => { c.rsiOB = Math.max(55, Math.min(90, c.rsiOB + (Math.random()<0.5?5:-5))); }); }
  if (opts.vVol && c.useVolF)  candidates.push(() => { c.volFMult  = Math.max(0.5, +(c.volFMult  + (Math.random()<0.5?1:-1)*step).toFixed(2)); });
  if (opts.vVol && c.useVSA)   candidates.push(() => { c.vsaMult   = Math.max(0.5, +(c.vsaMult   + (Math.random()<0.5?1:-1)*step).toFixed(2)); });
  if (opts.vFilt && c.useFresh)  candidates.push(() => { c.freshMax  = Math.max(3, c.freshMax  + (Math.random()<0.5?3:-3)); });
  if (opts.vFilt && c.useMaDist) candidates.push(() => { c.maDistMax = Math.max(0.5, +(c.maDistMax + (Math.random()<0.5?1:-1)*step).toFixed(2)); });
  // Мутируем от 1 до 3 параметров
  const nMut = Math.floor(Math.random() * 3) + 1;
  for (let m = 0; m < nMut && candidates.length; m++) {
    const idx = Math.floor(Math.random() * candidates.length);
    if (Math.random() < mutRate) candidates[idx]();
  }
  return c;
}

// Генетический алгоритм поиска устойчивых параметров
// Возвращает Promise, обновляет allFound напрямую
async function _runGA(startCfgs, opts, minTr, isRobMetric, allFound, baseScore, onProgress) {
  const POP_SIZE = 16;       // размер популяции
  const MAX_GEN = 15;        // максимум поколений
  const SURVIVE_RATE = 0.5;  // выживаемость (топ-50%)
  const MUT_RATE = 0.7;      // вероятность мутации параметра
  const seen = new Set();

  // Инициализация популяции: стартовые точки + мутации
  let population = [];
  for (const cfg of startCfgs.slice(0, 4)) {
    population.push(cfg);
    for (let i = 0; i < Math.floor(POP_SIZE / startCfgs.slice(0,4).length) - 1; i++) {
      population.push(_gaMutate(cfg, opts, MUT_RATE));
    }
  }
  // Если популяция мала — добиваем мутациями от лучшего
  while (population.length < POP_SIZE) {
    population.push(_gaMutate(population[0], opts, MUT_RATE));
  }
  population = population.slice(0, POP_SIZE);

  let bestScore = -Infinity;
  let noImprovGen = 0;

  for (let gen = 0; gen < MAX_GEN && _hcRunning; gen++) {
    // Оцениваем популяцию
    const scored = [];
    for (const cfg of population) {
      if (!_hcRunning) break;
      const key = JSON.stringify(cfg);
      if (seen.has(key)) {
        // Берём из allFound если уже считали
        const cached = allFound.find(x => JSON.stringify(x.cfg) === key);
        if (cached) { scored.push({ cfg, score: cached.score, r: cached.r, robScore: cached.robScore }); }
        continue;
      }
      seen.add(key);
      const r = _hcRunBacktest(cfg);
      if (!r || r.n < minTr) continue;
      // Обучаем surrogate
      const _rpdd = r.dd > 0 ? r.pnl/r.dd : (r.pnl > 0 ? 50 : 0);
      _surrogate.addPoint(cfg, _rpdd);
      let robScore = undefined;
      if (isRobMetric) {
        robScore = await _hcRobScore(cfg);
        if (!_hcRunning) break;
        r._robScore = robScore;
      }
      const pdd = r.dd > 0 ? r.pnl/r.dd : (r.pnl > 0 ? 99 : 0);
      const score = isRobMetric ? (robScore * 100 + Math.min(pdd, 99)) : _hcMetric(r, 'pdd');
      scored.push({ cfg, score, r, robScore });
      // Сохраняем в allFound
      allFound.push({ cfg, score, r, delta: score - baseScore,
        robScore: robScore, robMax: isRobMetric ? 5 : undefined });
      await yieldToUI();
    }
    if (!scored.length) break;
    scored.sort((a,b) => b.score - a.score);
    // Проверяем улучшение
    if (scored[0].score > bestScore + 0.5) {
      bestScore = scored[0].score; noImprovGen = 0;
    } else { noImprovGen++; }
    if (onProgress) onProgress(gen, MAX_GEN, scored[0], allFound.length);
    if (noImprovGen >= 3) break; // сходится — стоп
    // Отбор: топ-50% выживают
    const survivors = scored.slice(0, Math.ceil(POP_SIZE * SURVIVE_RATE));
    // Новое поколение
    const newPop = survivors.map(x => x.cfg); // элита
    while (newPop.length < POP_SIZE) {
      const pA = survivors[Math.floor(Math.random() * survivors.length)].cfg;
      const pB = survivors[Math.floor(Math.random() * survivors.length)].cfg;
      let child = pA === pB ? _gaMutate(pA, opts, MUT_RATE) : _gaCrossover(pA, pB);
      if (Math.random() < 0.5) child = _gaMutate(child, opts, MUT_RATE * 0.5);
      newPop.push(child);
    }
    population = newPop;
  }
}


function _hcRenderResults(found, metric) {
  const el = document.getElementById('hc-results');
  if (!found.length) {
    el.innerHTML = '<div style="color:var(--text3);font-size:.7em;padding:8px">Улучшений не найдено. Попробуй увеличить шаг или кол-во итераций.</div>';
    return;
  }
  // Сортируем по score desc, дедуплицируем
  found.sort((a, b) => b.score - a.score);
  const seen = new Set();
  const uniq = found.filter(x => { const k = JSON.stringify(x.cfg); if(seen.has(k)) return false; seen.add(k); return true; });
  const top = uniq.slice(0, 20);

  // Сохраняем в глобальный массив для безопасного доступа по индексу
  _hcFoundResults = top.map((x, i) => {
    const c = x.cfg;
    let slStr = '';
    if (c.slPair) {
      if (c.slPair.a) slStr += 'SL×' + c.slPair.a.m + 'ATR';
      if (c.slPair.p) slStr += (slStr?' ':'') + 'SL' + c.slPair.p.m + '%';
    }
    let tpStr = '';
    if (c.tpPair) {
      if (c.tpPair.a) tpStr += 'TP×' + c.tpPair.a.m;
      if (c.tpPair.b) tpStr += (tpStr?' ':'') + 'TP2×' + c.tpPair.b.m;
    }
    const descParts = [
      'pv(L'+c.pvL+'R'+c.pvR+')',
      'ATR'+c.atrPeriod,
      slStr, tpStr,
      c.useBE  ? 'BE'   +c.beTrig  : '',
      c.useTrail ? 'Trail'+c.trTrig : '',
    ].filter(Boolean).join(' ');
    const name = 'HC-' + (i+1) + ': ' + descParts;
    return { ...x, name, descParts };
  });

  const metricLabel = {pdd:'P/DD',pnl:'PnL%',wr:'WR%',avg:'Avg%',tv_score:'TV Score',tv_pnl:'TV PnL ret%',tv_pdd:'TV P/DD ret%'}[metric]||'Score';
  let html = '<div style="font-size:.65em;font-weight:600;color:var(--text3);margin-bottom:6px">ТОП УЛУЧШЕНИЙ (' + top.length + ' из ' + found.length + '):</div>';
  html += '<div style="display:flex;flex-direction:column;gap:4px">';

  for (let i = 0; i < _hcFoundResults.length; i++) {
    const x = _hcFoundResults[i];
    const r = x.r;
    const pddCls = r.dd>0 && r.pnl/r.dd>=5 ? 'pos' : 'warn';
    const pdd = r.dd > 0 ? r.pnl/r.dd : 0;
    const deltaSign = x.delta >= 0 ? '+' : '';
    const favStar = favourites.some(f => f.name === x.name) ? '⭐' : '☆';
    html += '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:5px;padding:5px 8px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:3px">' +
        '<span style="font-size:.82em;color:var(--accent);font-family:var(--font-mono);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer" onclick="_hcOpenDetail(' + i + ')" title="Открыть детали">' + x.descParts + '</span>' +
        '<span class="' + pddCls + '" style="font-weight:600;white-space:nowrap;font-size:.82em">' + metricLabel + ': ' + x.score.toFixed(2) + '</span>' +
      '</div>' +
      '<div style="display:flex;gap:8px;font-size:.72em;color:var(--text2);align-items:center">' +
        '<span class="' + (r.pnl>=0?'pos':'neg') + '">PnL ' + r.pnl.toFixed(1) + '%</span>' +
        '<span>WR ' + r.wr.toFixed(1) + '%</span>' +
        '<span class="muted">' + r.n + ' сд.</span>' +
        '<span class="neg">DD ' + r.dd.toFixed(1) + '%</span>' +
        '<span class="' + pddCls + '">P/DD ' + pdd.toFixed(2) + '</span>' +
        '<span style="color:var(--green)">' + deltaSign + (x.delta).toFixed(2) + '</span>' +
        '<span style="margin-left:auto;display:flex;gap:5px">' +
          '<button onclick="_hcOpenDetail(' + i + ')" style="font-size:.9em;padding:1px 7px;background:rgba(0,212,255,.1);border:1px solid var(--accent);border-radius:3px;color:var(--accent);cursor:pointer" title="Открыть детали">🔍 Детали</button>' +
          '<button onclick="_hcAddToFav(' + i + ',this)" style="font-size:.9em;padding:1px 7px;background:rgba(255,170,0,.1);border:1px solid rgba(255,170,0,.4);border-radius:3px;color:var(--orange);cursor:pointer" title="В избранное">' + favStar + ' В избр.</button>' +
        '</span>' +
      '</div>' +
    '</div>';
  }
  html += '</div>';
  el.innerHTML = html;
}

// Открываем найденный результат в детальной панели
function _hcOpenDetail(idx) {
  const x = _hcFoundResults[idx];
  if (!x) return;
  // Прикрепляем IS/OOS данные лениво — только при открытии деталей
  if (!x.cfg._oos) {
    const _oosData = _hcBuildOOS(x.cfg);
    if (_oosData) {
      x.cfg._oos = _oosData._oos;
      // ⚠️ ВАЖНО: Сохраняем полный eq в отдельное поле, НЕ перезаписываем x.r.eq!
      // x.r.eq это оригинальный результат HC, он должен остаться без изменений.
      // КРИТИЧНО: Копируем массив! Иначе _oosData.eq может мутироваться при пересчёте OOS
      if (_oosData.eq) x.r._fullEq = Array.from(_oosData.eq);
    }
  }
  const raw = x.r;
  // showDetail ожидает pdd и dwr — досчитываем
  const pdd = raw.dd > 0 ? raw.pnl / raw.dd : (raw.pnl > 0 ? 999 : 0);
  const r = Object.assign({}, raw, {
    name: x.name,
    cfg:  x.cfg,
    pdd,
    dwr:  raw.dwr || 0,
    avg:  raw.avg || 0,
    p1:   raw.p1  || 0,
    p2:   raw.p2  || 0,
  });
  _robustResult = r;
  showDetail(r);
  // Рисуем график с baseline (если доступен) ##EQ_MA_FILTER##
  drawEquityForResult(r);
  // Показываем контролы baseline если есть данные
  const baselineCtrl = document.getElementById('eq-baseline-controls');
  if (baselineCtrl) {
    if (r.eqCalcMAArr && r.eqCalcMAArr.length) {
      baselineCtrl.style.display = 'flex';
    } else {
      baselineCtrl.style.display = 'none';
    }
  }
}

// Добавляем HC результат в избранное
function _hcAddToFav(idx, btn) {
  const x = _hcFoundResults[idx];
  if (!x) return;
  const r = x.r;
  const name = x.name;
  const fi = favourites.findIndex(f => f.name === name);
  if (fi >= 0) {
    favourites.splice(fi, 1);
    btn.textContent = '☆ В избр.';
  } else {
    const pdd = r.dd > 0 ? r.pnl / r.dd : 0;
    favourites.push({ name, cfg: x.cfg, stats: {
      pnl: r.pnl, wr: r.wr, n: r.n, dd: r.dd, pdd,
      dwr: r.dwr||0, avg: r.avg||0, p1: r.p1||0, p2: r.p2||0, c1: r.c1||0, c2: r.c2||0,
      nL: r.nL||0, pL: r.pL||0, wrL: r.wrL, nS: r.nS||0, pS: r.pS||0, wrS: r.wrS, dwrLS: r.dwrLS,
      sig: r.sig, gt: r.gt, cvr: r.cvr, upi: r.upi,
      sortino: r.sortino, kRatio: r.kRatio, sqn: r.sqn,
      omega: r.omega, pain: r.pain, burke: r.burke, serenity: r.serenity, ir: r.ir,
      cpcvScore: r.cpcvScore,
      eq: Array.from(r.eq),
      robScore: x.robScore, robMax: x.robMax, robDetails: x.robDetails
    }});
    btn.textContent = '⭐ В избр.';
    btn.style.background = 'rgba(255,170,0,.2)';
  }
  storeSave(_favKey(), favourites);
  renderFavBar();
}


// ── Expose all functions globally for inline event handlers ──
// ── Expose functions to window for sandbox compatibility ──
try { window.applyFilters = applyFilters; window.applyFiltersDebounced = applyFiltersDebounced; } catch(e) { /* skip */ }
try { window.openHCModal = openHCModal; } catch(e) {}
try { window.toggleFavBody = toggleFavBody; } catch(e) {}
try { window.switchTableMode = switchTableMode; } catch(e) {}
try { window._getFavAsResults = _getFavAsResults; } catch(e) {}
try { window.runOOSScan = runOOSScan; } catch(e) {}
try { window._updateHCSrcCounts = _updateHCSrcCounts; } catch(e) {}
try { window.drawEquityForResult = drawEquityForResult; } catch(e) {}
try { window._refreshFavStars = _refreshFavStars; } catch(e) {}
try { window.appendFile = appendFile; } catch(e) {}
try { window.clearAppendedData = clearAppendedData; } catch(e) {}
try { window.closeHCModal = closeHCModal; } catch(e) {}
try { window.runHillClimbing = runHillClimbing; } catch(e) {}
try { window.stopHillClimbing = stopHillClimbing; } catch(e) {}
try { window._hcOpenDetail = _hcOpenDetail; } catch(e) {}
try { window._hcAddToFav = _hcAddToFav; } catch(e) {}
try { window.applyParsedText = applyParsedText; } catch(e) { /* skip */ }
try { window.closeDetail = closeDetail; } catch(e) { /* skip */ }
try { window.closeParseModal = closeParseModal; } catch(e) { /* skip */ }
try { window.closeRobustModal = closeRobustModal; } catch(e) { /* skip */ }
try { window.closeTplModal = closeTplModal; } catch(e) { /* skip */ }
try { window.copyDetail = copyDetail; } catch(e) { /* skip */ }
try { window.deleteTpl = deleteTpl; } catch(e) { /* skip */ }
try { window.doSort = doSort; } catch(e) { /* skip */ }
try { window.exportTpl = exportTpl; } catch(e) { /* skip */ }
try { window.importTplFromText = importTplFromText; } catch(e) { /* skip */ }
try { window.loadFavAsTpl = loadFavAsTpl; } catch(e) { /* skip */ }
try { window.loadTpl = loadTpl; } catch(e) { /* skip */ }
try { window.openParseModal = openParseModal; } catch(e) { /* skip */ }
try { window.openRobustModal = openRobustModal; } catch(e) { /* skip */ }
try { window.openTplModal = openTplModal; } catch(e) { /* skip */ }
try { window.pauseOpt = pauseOpt; } catch(e) { /* skip */ }
try { window.previewParsedText = previewParsedText; } catch(e) { /* skip */ }
try { window.removeFav = removeFav; } catch(e) { /* skip */ }
try { window.removeFavByName = removeFavByName; } catch(e) { /* skip */ }
try { window.runMassRobust = runMassRobust; } catch(e) { /* skip */ }
try { window.runOpt = runOpt; } catch(e) { /* skip */ }
try { window.runRobustTest = runRobustTest; } catch(e) { /* skip */ }
try { window.saveTpl = saveTpl; } catch(e) { /* skip */ }
try { window.selectFastOnly = selectFastOnly; } catch(e) { /* skip */ }
try { window.setDefaultTpl = setDefaultTpl; } catch(e) { /* skip */ }
try { window.setLogic = setLogic; } catch(e) { /* skip */ }
try { window.setOptMode = setOptMode; } catch(e) { /* skip */ }
try { window.setXMode = setXMode; } catch(e) { /* skip */ }
try { window.stopOpt = stopOpt; } catch(e) { /* skip */ }
try { window.toggleFav = toggleFav; } catch(e) { /* skip */ }

// ── Fallback: bind events via addEventListener for strict sandboxes ──
document.addEventListener('DOMContentLoaded', function() {
  var btnMap = {
    // Mode buttons
    'mode_full':  function(){ setOptMode('full'); },
    'mode_prune': function(){ setOptMode('prune'); },
    'mode_mc':    function(){ setOptMode('mc'); },
    'mode_tpe':   function(){ setOptMode('tpe'); },
    // Rev mode
    'revmode_any':   function(){ setXMode('rev','any'); },
    'revmode_plus':  function(){ setXMode('rev','plus'); },
    'revmode_minus': function(){ setXMode('rev','minus'); },
    // Rev action
    'revact_exit':  function(){ setXMode('revact','exit'); },
    'revact_rev':   function(){ setXMode('revact','rev'); },
    'revact_skip':  function(){ setXMode('revact','skip'); },
    // Time mode
    'timemode_any':  function(){ setXMode('time','any'); },
    'timemode_plus': function(){ setXMode('time','plus'); },
    // Clx mode
    'clxmode_any':  function(){ setXMode('clx','any'); },
    'clxmode_plus': function(){ setXMode('clx','plus'); },
    // Logic buttons
    'sl_or':  function(){ setLogic('sl','or'); },
    'sl_and': function(){ setLogic('sl','and'); },
    'tp_or':  function(){ setLogic('tp','or'); },
    'tp_and': function(){ setLogic('tp','and'); },
    // Main controls
    'rbtn': runOpt,
    'pbtn': pauseOpt,
    'sbtn': stopOpt,
    // Template/modal buttons
    // Template modal buttons
    'btn-open-tpl':   openTplModal,
    'btn-open-parse': openParseModal,
    'btn-save-tpl':   saveTpl,
    'btn-close-tpl':  closeTplModal,
    'btn-import-tpl': importTplFromText,
    'btn-mass-robust': runMassRobust,
    // Detail modal buttons
    'btn-close-detail': closeDetail,
    'btn-copy-detail':  copyDetail,
    'btn-open-robust-from-detail': function(){ openRobustModal(); },
    // Robust modal buttons
    'btn-run-robust':   runRobustTest,
    'btn-close-robust': closeRobustModal,
    // Parse text modal buttons
    'btn-apply-parse':   applyParsedText,
    'btn-preview-parse': previewParsedText,
    'btn-close-parse':   closeParseModal,
    'clr-btn':     function(){ clearResults(); },
    'clr-btn-all': function(){ clearAllResults(); }
  };
  Object.keys(btnMap).forEach(function(id) {
    var el = document.getElementById(id);
    // Не добавляем listener если уже есть inline onclick — иначе двойной вызов!
    if (el && !el.hasAttribute('onclick')) {
      el.addEventListener('click', function(e) {
        btnMap[id]();
      });
    }
  });
});
