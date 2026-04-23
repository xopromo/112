// ============================================================
// core.js — ОГЛАВЛЕНИЕ
// ============================================================
// ИНДИКАТОРЫ:
//   calcEMA(data, period)                          line 16
//   calcSMA(data, period)                          line 23
//   calcWMA(data, period)                          line 32
//   calcStructPivots(data, pvL, pvR)               line 43
//   calcPivotLoHi(data, pvL, pvR)                  line 68
//   calcMA(data, period, type)                     line 99
//   calcRMA(data, period)           [NEW v6_86]    line 105
//   calcRMA_ATR(period)                            line 118
//   calcPivotLow(left, right)                      line 132
//   calcPivotHigh(left, right)                     line 143
//   calcADX(period)         [RMA fix v6_86]        line 155
//   calcRSI(period)                                line 178
//   calcVolSMA(period)                             line 194
//   calcBodySMA(period)                            line 198
//   calcWeightedTrend(...)                         line 206
//
// БЭКТЕСТ:
//   backtest(pvLo, pvHi, atrArr, cfg)              line 223
//     Возвращает: {pnl, wr, n, dd, p1, p2, dwr,
//                  wrL, wrS, dwrLS, nL, nS, eq, avg}
//
// ИСПРАВЛЕНИЯ v6_86 (синхронизация с Pine USE v40.11):
//   FIX1: MA фильтр → prev.c > maArr[i-1]  (было bar.c > maArr[i])
//   FIX2: MA дистанция → prev.c vs maArr[i-1]
//   FIX3: STrend → все j vs maArr[i-1] фиксированное (было maArr[i-j])
//   FIX4: useFresh → непрерывная серия (было: поиск первого бара)
//   FIX5: useFat → volRecent включает текущий бар (как Pine ta.sma)
//   FIX6: ADX → RMA вместо SMA (Wilder's smoothing как Pine ta.adx)
//   FIX7: CandleF → bar.h/l вместо prev.h/l (текущий бар)
//   FIX8: PivotLow/High → строгое неравенство справа (как Pine ta.pivotlow)
//
// ВАЖНО: при добавлении новых параметров в btCfg —
//   обновить buildBtCfg() в opt.js (единая точка сборки)
// ============================================================

// ============================================================
// INDICATORS
// ============================================================
function calcEMA(data, period) {
  const N = data.length, r = new Float64Array(N);
  r[0] = data[0];
  const k = 2 / (period + 1);
  for (let i = 1; i < N; i++) r[i] = data[i] * k + r[i-1] * (1 - k);
  return r;
}
function calcSMA(data, period) {
  const N = data.length, r = new Float64Array(N);
  if (period <= 0 || N < period) return r;
  // Running sum: O(N) вместо O(N*period)
  let s = 0;
  for (let j = 0; j < period; j++) s += data[j];
  r[period - 1] = s / period;
  for (let i = period; i < N; i++) {
    s += data[i] - data[i - period];
    r[i] = s / period;
  }
  return r;
}
function calcWMA(data, period) {
  const N = data.length, r = new Float64Array(N);
  const denom = period * (period + 1) / 2;
  for (let i = period - 1; i < N; i++) {
    let s = 0;
    for (let j = 0; j < period; j++) s += data[i - period + 1 + j] * (j + 1);
    r[i] = s / denom;
  }
  return r;
}
// HMA(n) = WMA(2*WMA(n/2) - WMA(n), floor(sqrt(n)))
function calcHMA(data, period) {
  const half  = Math.max(1, Math.floor(period / 2));
  const sqrtP = Math.max(1, Math.floor(Math.sqrt(period)));
  const wma1  = calcWMA(data, half);
  const wma2  = calcWMA(data, period);
  const N = data.length;
  const diff = new Float64Array(N);
  for (let i = 0; i < N; i++) diff[i] = 2 * wma1[i] - wma2[i];
  return calcWMA(diff, sqrtP);
}
function calcStructPivots(data, pvL, pvR) {
  const N=data.length;
  const bull=new Uint8Array(N), bear=new Uint8Array(N);
  let pvHiArr=[],pvLoArr=[];
  for(let i=pvL;i<N-pvR;i++){
    let isH=true,isL=true;
    for(let j=1;j<=pvL;j++){if(data[i].h<=data[i-j].h){isH=false;break;}}
    if(isH)for(let j=1;j<=pvR;j++){if(data[i].h<=data[i+j].h){isH=false;break;}}
    for(let j=1;j<=pvL;j++){if(data[i].l>=data[i-j].l){isL=false;break;}}
    if(isL)for(let j=1;j<=pvR;j++){if(data[i].l>=data[i+j].l){isL=false;break;}}
    if(isH)pvHiArr.push({idx:i,v:data[i].h});
    if(isL)pvLoArr.push({idx:i,v:data[i].l});
  }
  let hi1=NaN,hi2=NaN,lo1=NaN,lo2=NaN,pH=0,pL=0;
  for(let i=pvL+pvR;i<N;i++){
    while(pH<pvHiArr.length&&pvHiArr[pH].idx+pvR<=i){hi2=hi1;hi1=pvHiArr[pH].v;pH++;}
    while(pL<pvLoArr.length&&pvLoArr[pL].idx+pvR<=i){lo2=lo1;lo1=pvLoArr[pL].v;pL++;}
    if(!isNaN(hi1)&&!isNaN(hi2)&&!isNaN(lo1)&&!isNaN(lo2)){
      if(hi1>hi2&&lo1>lo2)bull[i]=1;
      if(hi1<hi2&&lo1<lo2)bear[i]=1;
    }
  }
  return{bull,bear};
}
// Pivot-based SL: массив pivot lo/hi для каждого бара
function calcPivotLoHi(data, pvL, pvR) {
  // Возвращает {lo[], hi[], loAge[], hiAge[]}
  // lo/hi — значение последнего пивота (fill-forward)
  // loAge/hiAge — индекс бара пивота (для проверки свежести, как в Pine: bar_index - last_pv_lo_bar <= 30)
  const N=data.length;
  const lo=new Float64Array(N).fill(NaN);
  const hi=new Float64Array(N).fill(NaN);
  const loAge=new Int32Array(N).fill(-1);  // -1 = пивота ещё не было
  const hiAge=new Int32Array(N).fill(-1);
  let lastLo=NaN, lastHi=NaN, lastLoBar=-1, lastHiBar=-1;
  for(let i=pvL;i<N-pvR;i++){
    // Pivot low: LEFT нестрогое (>, ничья = ok), RIGHT строгое (>=, ничья = fail) — как Pine ta.pivotlow
    let isL=true;
    for(let j=1;j<=pvL;j++){if(data[i].l>data[i-j].l){isL=false;break;}}
    if(isL)for(let j=1;j<=pvR;j++){if(data[i].l>=data[i+j].l){isL=false;break;}}
    if(isL){lastLo=data[i].l; lastLoBar=i; lo[i]=lastLo; loAge[i]=lastLoBar;}
    // Pivot high: LEFT нестрогое (<, ничья = ok), RIGHT строгое (<=, ничья = fail) — как Pine ta.pivothigh
    let isH=true;
    for(let j=1;j<=pvL;j++){if(data[i].h<data[i-j].h){isH=false;break;}}
    if(isH)for(let j=1;j<=pvR;j++){if(data[i].h<=data[i+j].h){isH=false;break;}}
    if(isH){lastHi=data[i].h; lastHiBar=i; hi[i]=lastHi; hiAge[i]=lastHiBar;}
  }
  // Заполняем пробелы вперёд
  let curLo=NaN, curHi=NaN, curLoBar=-1, curHiBar=-1;
  for(let i=0;i<N;i++){
    if(!isNaN(lo[i])){curLo=lo[i]; curLoBar=loAge[i];}
    else{lo[i]=curLo; loAge[i]=curLoBar;}
    if(!isNaN(hi[i])){curHi=hi[i]; curHiBar=hiAge[i];}
    else{hi[i]=curHi; hiAge[i]=curHiBar;}
  }
  return{lo,hi,loAge,hiAge};
}
function calcDEMA(data, period) {
  const ema1 = calcEMA(data, period);
  const ema2 = calcEMA(Array.from(ema1), period);
  const N = data.length, r = new Float64Array(N);
  for (let i = 0; i < N; i++) r[i] = 2 * ema1[i] - ema2[i];
  return r;
}
function calcTEMA(data, period) {
  const ema1 = calcEMA(data, period);
  const ema2 = calcEMA(Array.from(ema1), period);
  const ema3 = calcEMA(Array.from(ema2), period);
  const N = data.length, r = new Float64Array(N);
  for (let i = 0; i < N; i++) r[i] = 3 * ema1[i] - 3 * ema2[i] + ema3[i];
  return r;
}
function calcMA(data, period, type) {
  if (type === 'SMA') return calcSMA(data, period);
  if (type === 'WMA') return calcWMA(data, period);
  if (type === 'HMA') return calcHMA(data, period);
  if (type === 'DEMA') return calcDEMA(data, period);
  if (type === 'TEMA') return calcTEMA(data, period);
  if (type === 'Kalman') return _buildKalmanMA(data, period); // ##KALMAN_TYPE##
  return calcEMA(data, period);
}
// HTF MA: строит MA на барах старшего ТФ (ratio=4 → 4x текущего).
// Lookahead-free + timestamp-aligned: HTF-бары группируются по реальным timestamp-периодам,
// как это делает Pine request.security с lookahead_on + [1]:
//   aligned[i] = MA HTF-бара ПРЕДШЕСТВУЮЩЕГО тому, в котором находится base-бар i.
// Это исправляет смещение на 1 бар когда первый base-бар CSV не совпадает
// с началом HTF-периода (например, CSV начинается на 15:25 вместо 15:20 для 20-мин HTF).
function calcHTFMA(data, htfRatio, period, type) {
  const N = data.length;
  if (N < 2) return new Float64Array(N);

  // Определяем базовый интервал из timestamps (в секундах)
  const baseInterval = Math.round(parseInt(data[1].t) - parseInt(data[0].t));
  const htfPeriod = baseInterval * htfRatio;

  // Если нет timestamps (тест без .t) — старый алгоритм как fallback
  if (!baseInterval || !data[0].t) {
    const htfN = Math.ceil(N / htfRatio);
    const htfCloses = new Float64Array(htfN);
    for (let k = 0; k < htfN; k++) {
      htfCloses[k] = data[Math.min((k + 1) * htfRatio - 1, N - 1)].c;
    }
    const htfMA = calcMA(htfCloses, period, type);
    const aligned = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const lastHTF = Math.floor((i + 1) / htfRatio) - 1;
      aligned[i] = lastHTF >= 0 ? htfMA[lastHTF] : 0;
    }
    const shifted = new Float64Array(N);
    for (let i = 0; i + 1 < N; i++) shifted[i] = aligned[i + 1];
    return shifted;
  }

  // Шаг 1: группируем base-бары по HTF-периодам через timestamp
  // htfBars[k] = { close, lastBaseBar } — последний base-бар в периоде k
  const htfBars = [];
  let prevHtfId = -1;
  for (let i = 0; i < N; i++) {
    const htfId = Math.floor(parseInt(data[i].t) / htfPeriod);
    if (htfId !== prevHtfId) {
      htfBars.push({ close: data[i].c, lastBaseBar: i });
      prevHtfId = htfId;
    } else {
      htfBars[htfBars.length - 1].close = data[i].c;
      htfBars[htfBars.length - 1].lastBaseBar = i;
    }
  }

  // Шаг 2: вычисляем MA на HTF-закрытиях
  const htfCloses = new Float64Array(htfBars.length);
  for (let k = 0; k < htfBars.length; k++) htfCloses[k] = htfBars[k].close;
  const htfMA = calcMA(htfCloses, period, type);

  // Шаг 3: выравниваем обратно к base-таймфрейму
  // Pine: ma_val = request.security(..., calc_ma[1], lookahead_on)
  // На base-баре i видим MA HTF-бара, предшествующего текущему HTF-бару (сдвиг [1])
  const aligned = new Float64Array(N);
  let ki = 0;
  for (let i = 0; i < N; i++) {
    // Продвигаем ki: ki = индекс HTF-бара, содержащего base-бар i
    while (ki < htfBars.length - 1 && htfBars[ki].lastBaseBar < i) ki++;
    // С сдвигом [1]: видим MA HTF-бара ki-1
    const visibleHtf = ki - 1;
    aligned[i] = visibleHtf >= 0 ? htfMA[visibleHtf] : 0;
  }
  // Фикс Pine-выравнивания: фильтр в JS обращается к maArr[i-1], но Pine сравнивает
  // close[1] > ma_val[i] = aligned[i]. Сдвигаем на 1 влево: arr[i-1] = aligned[i].
  const shifted = new Float64Array(N);
  for (let i = 0; i + 1 < N; i++) shifted[i] = aligned[i + 1];
  return shifted;
}
function calcHTFADX(data, htfRatio, period) {
  const N = data.length;
  if (N < 2) return new Float64Array(N);

  // Timestamp-aligned HTF grouping (same logic as calcHTFMA)
  const baseInterval = Math.round(parseInt(data[1].t) - parseInt(data[0].t));
  const htfPeriod = baseInterval * htfRatio;

  if (!baseInterval || !data[0].t) {
    // Fallback: old algorithm without timestamp alignment
    const htfN = Math.ceil(N / htfRatio);
    const htfH = new Float64Array(htfN), htfL = new Float64Array(htfN), htfC = new Float64Array(htfN);
    for (let k = 0; k < htfN; k++) {
      const s = k * htfRatio, e = Math.min((k+1)*htfRatio-1, N-1);
      let h = -Infinity, l = Infinity;
      for (let j = s; j <= e; j++) { h = Math.max(h, data[j].h); l = Math.min(l, data[j].l); }
      htfH[k] = h; htfL[k] = l; htfC[k] = data[e].c;
    }
    const pdm = new Float64Array(htfN), mdm = new Float64Array(htfN), tr = new Float64Array(htfN);
    for (let i = 1; i < htfN; i++) {
      const up = htfH[i]-htfH[i-1], dn = htfL[i-1]-htfL[i];
      pdm[i] = (up > dn && up > 0) ? up : 0;
      mdm[i] = (dn > up && dn > 0) ? dn : 0;
      tr[i]  = Math.max(htfH[i]-htfL[i], Math.abs(htfH[i]-htfC[i-1]), Math.abs(htfL[i]-htfC[i-1]));
    }
    const atrR = calcRMA(Array.from(tr), period);
    const pdmR = calcRMA(Array.from(pdm), period);
    const mdmR = calcRMA(Array.from(mdm), period);
    const dx = new Float64Array(htfN);
    for (let i = period; i < htfN; i++) {
      if (atrR[i] > 0) { const pi=pdmR[i]/atrR[i]*100, mi=mdmR[i]/atrR[i]*100, s=pi+mi; dx[i]=s>0?Math.abs(pi-mi)/s*100:0; }
    }
    const htfADX = _rmaFromFirstNonZero(Array.from(dx), period);
    const aligned = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const last = Math.floor(i/htfRatio)-1;
      aligned[i] = last >= 0 ? htfADX[last] : 0;
    }
    const shifted = new Float64Array(N);
    for (let i = 0; i + 1 < N; i++) shifted[i] = aligned[i + 1];
    return shifted;
  }

  // Group bars into HTF periods by timestamp
  const htfBars = []; // { H, L, C, lastBaseBar }
  let prevHtfId = -1;
  for (let i = 0; i < N; i++) {
    const htfId = Math.floor(parseInt(data[i].t) / htfPeriod);
    if (htfId !== prevHtfId) {
      htfBars.push({ H: data[i].h, L: data[i].l, C: data[i].c, lastBaseBar: i });
      prevHtfId = htfId;
    } else {
      const b = htfBars[htfBars.length - 1];
      if (data[i].h > b.H) b.H = data[i].h;
      if (data[i].l < b.L) b.L = data[i].l;
      b.C = data[i].c;
      b.lastBaseBar = i;
    }
  }

  const htfN = htfBars.length;
  const htfH = new Float64Array(htfN), htfL = new Float64Array(htfN), htfC = new Float64Array(htfN);
  for (let k = 0; k < htfN; k++) { htfH[k]=htfBars[k].H; htfL[k]=htfBars[k].L; htfC[k]=htfBars[k].C; }

  const pdm = new Float64Array(htfN), mdm = new Float64Array(htfN), tr = new Float64Array(htfN);
  for (let i = 1; i < htfN; i++) {
    const up = htfH[i]-htfH[i-1], dn = htfL[i-1]-htfL[i];
    pdm[i] = (up > dn && up > 0) ? up : 0;
    mdm[i] = (dn > up && dn > 0) ? dn : 0;
    tr[i]  = Math.max(htfH[i]-htfL[i], Math.abs(htfH[i]-htfC[i-1]), Math.abs(htfL[i]-htfC[i-1]));
  }
  const atrR = calcRMA(Array.from(tr), period);
  const pdmR = calcRMA(Array.from(pdm), period);
  const mdmR = calcRMA(Array.from(mdm), period);
  const dx = new Float64Array(htfN);
  for (let i = period; i < htfN; i++) {
    if (atrR[i] > 0) { const pi=pdmR[i]/atrR[i]*100, mi=mdmR[i]/atrR[i]*100, s=pi+mi; dx[i]=s>0?Math.abs(pi-mi)/s*100:0; }
  }
  const htfADX = _rmaFromFirstNonZero(Array.from(dx), period);

  // Align to base timeframe with lookahead-free [1] shift
  const aligned = new Float64Array(N);
  let ki = 0;
  for (let i = 0; i < N; i++) {
    while (ki < htfBars.length - 1 && htfBars[ki].lastBaseBar < i) ki++;
    const visibleHtf = ki - 1;
    aligned[i] = visibleHtf >= 0 ? htfADX[visibleHtf] : 0;
  }
  const shifted = new Float64Array(N);
  for (let i = 0; i + 1 < N; i++) shifted[i] = aligned[i + 1];
  return shifted;
}
// RMA (Wilder's smoothing) — как в Pine ta.rma: seed=SMA первых period баров, alpha=1/period
function calcRMA(data, period) {
  const N = data.length, r = new Float64Array(N);
  const alpha = 1 / period;
  let s = 0;
  for (let i = 0; i < period && i < N; i++) s += data[i];
  if (N >= period) { r[period - 1] = s / period; }
  for (let i = period; i < N; i++) r[i] = alpha * data[i] + (1 - alpha) * r[i-1];
  return r;
}
// RMA seeded from first `period` non-zero values.
// Matches Pine ta.rma behaviour on a series with leading na/0:
// Pine seeds from SMA of the first `period` non-na values, not from the series start.
// Used for the dx→ADX step where dx[0..period-1] = 0 (not real values).
function _rmaFromFirstNonZero(data, period) {
  const N = data.length, r = new Float64Array(N);
  const alpha = 1 / period;
  let first = -1;
  for (let i = 0; i < N; i++) { if (data[i] > 0) { first = i; break; } }
  if (first < 0 || first + period > N) return r;
  let s = 0;
  for (let j = first; j < first + period; j++) s += data[j];
  r[first + period - 1] = s / period;
  for (let i = first + period; i < N; i++) r[i] = alpha * data[i] + (1 - alpha) * r[i-1];
  return r;
}
function calcRMA_ATR(period) {
  const N = DATA.length;
  const tr = new Float64Array(N), rma = new Float64Array(N);
  // tr[0] = H-L (ta.tr(true) в Pine: первый бар не имеет prevClose → H-L)
  if (N > 0) tr[0] = DATA[0].h - DATA[0].l;
  for (let i = 1; i < N; i++)
    tr[i] = Math.max(DATA[i].h - DATA[i].l, Math.abs(DATA[i].h - DATA[i-1].c), Math.abs(DATA[i].l - DATA[i-1].c));
  let s = 0;
  for (let i = 0; i < Math.min(period, N); i++) s += tr[i];
  if (N >= period) rma[period - 1] = s / period;
  const alpha = 1 / period;
  for (let i = period; i < N; i++) rma[i] = alpha * tr[i] + (1 - alpha) * rma[i-1];
  return rma;
}
function calcPivotLow(left, right) {
  // Pine ta.pivotlow:
  //   LEFT  (нестрого): левый бар дисквалифицирует только если low СТРОГО меньше центра (ничья = ok)
  //   RIGHT (строго):   правый бар дисквалифицирует если low меньше ИЛИ равен центру (ничья = fail)
  // Следствие: при двух равных low подряд pivot — на БОЛЕЕ ПОЗДНЕМ баре (как в Pine)
  const N = DATA.length, res = new Uint8Array(N);
  for (let i = left + right; i < N; i++) {
    const idx = i - right, v = DATA[idx].l;
    let ok = true;
    for (let j = idx - left; j < idx; j++) { if (DATA[j].l < v) { ok = false; break; } }
    if (ok) for (let j = idx + 1; j <= Math.min(idx + right, N-1); j++) { if (DATA[j].l <= v) { ok = false; break; } }
    if (ok) res[i] = 1;
  }
  return res;
}
function calcPivotHigh(left, right) {
  // Pine ta.pivothigh:
  //   LEFT  (нестрого): левый бар дисквалифицирует только если high СТРОГО больше центра (ничья = ok)
  //   RIGHT (строго):   правый бар дисквалифицирует если high больше ИЛИ равен центру (ничья = fail)
  const N = DATA.length, res = new Uint8Array(N);
  for (let i = left + right; i < N; i++) {
    const idx = i - right, v = DATA[idx].h;
    let ok = true;
    for (let j = idx - left; j < idx; j++) { if (DATA[j].h > v) { ok = false; break; } }
    if (ok) for (let j = idx + 1; j <= Math.min(idx + right, N-1); j++) { if (DATA[j].h >= v) { ok = false; break; } }
    if (ok) res[i] = 1;
  }
  return res;
}
function calcADX(period) {
  // Pine ta.adx использует RMA (Wilder's smoothing), не SMA
  const N = DATA.length;
  const pdm = new Float64Array(N), mdm = new Float64Array(N), tr = new Float64Array(N);
  for (let i = 1; i < N; i++) {
    const up = DATA[i].h - DATA[i-1].h, dn = DATA[i-1].l - DATA[i].l;
    pdm[i] = (up > dn && up > 0) ? up : 0;
    mdm[i] = (dn > up && dn > 0) ? dn : 0;
    tr[i] = Math.max(DATA[i].h - DATA[i].l, Math.abs(DATA[i].h - DATA[i-1].c), Math.abs(DATA[i].l - DATA[i-1].c));
  }
  // Используем RMA как в Pine
  const atrR = calcRMA(Array.from(tr), period);
  const pdmR = calcRMA(Array.from(pdm), period);
  const mdmR = calcRMA(Array.from(mdm), period);
  const dx = new Float64Array(N);
  for (let i = period; i < N; i++) {
    if (atrR[i] > 0) {
      const pi = pdmR[i]/atrR[i]*100, mi = mdmR[i]/atrR[i]*100, s = pi+mi;
      dx[i] = s > 0 ? Math.abs(pi-mi)/s*100 : 0;
    }
  }
  // ADX = RMA(dx, period), seeded from first non-zero dx (matching Pine ta.rma na-seed behaviour)
  return _rmaFromFirstNonZero(Array.from(dx), period);
}
function calcRSI(period) {
  const N = DATA.length, r = new Float64Array(N).fill(50);
  let ag = 0, al = 0;
  for (let i = 1; i <= Math.min(period, N-1); i++) {
    const d = DATA[i].c - DATA[i-1].c;
    if (d > 0) ag += d; else al -= d;
  }
  ag /= period; al /= period;
  for (let i = period+1; i < N; i++) {
    const d = DATA[i].c - DATA[i-1].c;
    ag = (ag*(period-1) + (d>0?d:0))/period;
    al = (al*(period-1) + (d<0?-d:0))/period;
    r[i] = al > 0 ? 100 - 100/(1+ag/al) : 100;
  }
  return r;
}
function calcVolSMA(period) {
  const vols = DATA.map(d => d.v);
  return calcSMA(vols, period);
}
function calcBodySMA(period) {
  const bodies = DATA.map(d => Math.abs(d.c - d.o));
  return calcSMA(bodies, period);
}
// MACD: line = EMA(fast) - EMA(slow), signal = EMA(line, signalP)
function calcMACD(fast, slow, signalP) {
  const closes = DATA.map(d => d.c);
  const emaFast = calcEMA(closes, fast);
  const emaSlow = calcEMA(closes, slow);
  const N = DATA.length;
  const line = new Float64Array(N);
  for (let i = 0; i < N; i++) line[i] = emaFast[i] - emaSlow[i];
  const signal = calcEMA(Array.from(line), signalP);
  return { line, signal };
}
// Supertrend: возвращает Int8Array dir (+1 = бычий, -1 = медвежий)
function calcSupertrend(atrP, mult) {
  const N = DATA.length;
  const atr = calcRMA_ATR(atrP);
  const dir   = new Int8Array(N);
  const upper = new Float64Array(N);
  const lower = new Float64Array(N);
  if (N === 0) return dir;
  const hl2_0 = (DATA[0].h + DATA[0].l) / 2;
  upper[0] = hl2_0 + mult * (atr[0] || 0);
  lower[0] = hl2_0 - mult * (atr[0] || 0);
  dir[0] = 1;
  for (let i = 1; i < N; i++) {
    const hl2   = (DATA[i].h + DATA[i].l) / 2;
    const rawUp = hl2 + mult * atr[i];
    const rawLo = hl2 - mult * atr[i];
    upper[i] = (rawUp < upper[i-1] || DATA[i-1].c > upper[i-1]) ? rawUp : upper[i-1];
    lower[i] = (rawLo > lower[i-1] || DATA[i-1].c < lower[i-1]) ? rawLo : lower[i-1];
    if (dir[i-1] === -1) {
      dir[i] = DATA[i].c > upper[i] ? 1 : -1;
    } else {
      dir[i] = DATA[i].c < lower[i] ? -1 : 1;
    }
  }
  return dir;
}
// Stochastic %K и %D (SMA of %K)
function calcStochastic(kPeriod, dPeriod) {
  const N = DATA.length;
  const kArr = new Float64Array(N);
  for (let i = kPeriod - 1; i < N; i++) {
    let lo = DATA[i].l, hi = DATA[i].h;
    for (let j = i - kPeriod + 1; j < i; j++) {
      if (DATA[j].l < lo) lo = DATA[j].l;
      if (DATA[j].h > hi) hi = DATA[j].h;
    }
    kArr[i] = hi > lo ? (DATA[i].c - lo) / (hi - lo) * 100 : 50;
  }
  const dArr = calcSMA(Array.from(kArr), dPeriod);
  return { kArr, dArr };
}

// ============================================================
// WEIGHTED TREND SCORE
// ============================================================
function calcWeightedTrend(maArr, atrArr, period, volW, bodyW, distW, useDistMA) {
  const N = DATA.length;
  const scores = new Float64Array(N);
  const volAvg = calcVolSMA(period);
  const bodyAvg = calcBodySMA(period);
  for (let i = period; i < N; i++) {
    let score = 0;
    for (let k = 1; k <= period; k++) {
      const idx = i - k;
      const decay = Math.pow((period - k + 1) / period, 3.0);
      const dir = DATA[idx].c > DATA[idx].o ? 1 : -1;
      let s = dir * decay;
      const body = Math.abs(DATA[idx].c - DATA[idx].o);
      if (bodyAvg[idx] > 0) s += dir * decay * (body / bodyAvg[idx]) * bodyW;
      if (HAS_VOLUME && volAvg[idx] > 0) s += dir * decay * (DATA[idx].v / volAvg[idx]) * volW;
      if (useDistMA && maArr && atrArr && atrArr[idx] > 0)
        s += ((DATA[idx].c - maArr[idx]) / atrArr[idx]) * decay * distW;
      score += s;
    }
    scores[i] = score;
  }
  return scores;
}

// ============================================================
// Расчет адаптивных множителей TP/SL на основе ATR
function _calcAdaptiveMultipliers(atrArr, i, cfg) {
  let tpAdaptMult = 1.0, slAdaptMult = 1.0;

  // Адаптивный TP: зависит от текущего ATR vs среднего ATR
  if (cfg.useAdaptiveTP && cfg.tpAtrLen > 0) {
    // SMA от ATR за период * 2 (как в Pine: ta.sma(atr_tp, tp_atr_len * 2))
    const avgLen = Math.min(cfg.tpAtrLen * 2, i);
    let atrSum = 0;
    for (let k = 0; k < avgLen; k++) {
      atrSum += atrArr[i - 1 - k];
    }
    const atrAvg = atrSum / avgLen;
    const atrCurr = atrArr[i - 1];
    if (atrAvg > 0) {
      const atrRatio = atrCurr / atrAvg;
      // TP формула: 0.5 + 0.5 * sqrt(ratio)
      tpAdaptMult = 0.5 + 0.5 * Math.sqrt(atrRatio);
    }
  }

  // Адаптивный SL: зависит от ATR мультипликатора
  if (cfg.useAdaptiveSL && cfg.slAtrLen > 0) {
    // SMA от ATR за период * 2 (как в Pine: ta.sma(atr_sl, sl_atr_len * 2))
    const avgLen = Math.min(cfg.slAtrLen * 2, i);
    let atrSum = 0;
    for (let k = 0; k < avgLen; k++) {
      atrSum += atrArr[i - 1 - k];
    }
    const atrAvg = atrSum / avgLen;
    const atrCurr = atrArr[i - 1];
    if (atrAvg > 0) {
      const atrRatio = atrCurr / atrAvg;
      // SL формула: 1.0 - mult*0.5 + mult*0.5*sqrt(ratio)
      const m = cfg.slAtrMult || 0.5;
      slAdaptMult = 1.0 - m * 0.5 + m * 0.5 * Math.sqrt(atrRatio);
    }
  }

  return { tpAdaptMult, slAdaptMult };
}

// ============================================================
// BACKTEST ENGINE
// ============================================================
function backtest(pvLo, pvHi, atrArr, cfg) {
  const N = DATA.length;
  const split = N >> 1;
  const comm = cfg.comm * 2; // round trip

  let inTrade = false, dir = 0, entry = 0;
  let sl1 = 0, sl2 = 0, tp1 = 0, tp2 = 0; // dual SL/TP support
  let hasSL2 = false, hasTP2 = false;
  let exitBar = -1, entryBar = -1;
  let beActive = false, trailActive = false, partialDone = false, posSize = 1.0;
  let wickSL = NaN;
  let revSkipCount = 0, revCooldownBar = -1; // счётчики skip/cooldown для обратного сигнала
  // Отложенный вход (Bars / Retrace)
  let pendingDir = 0, pendingBar = -1, pendingSigClose = 0;
  let pnl = 0, trades = 0, wins = 0, maxPnl = 0, dd = 0;
  let p1 = 0, c1 = 0, w1 = 0, p2 = 0, c2 = 0, w2 = 0;
  let nL = 0, wL = 0, pL = 0, nS = 0, wS = 0, pS = 0; // лонг/шорт стат
  const eq = new Float32Array(N);
  let _mlScoreSum = 0, _mlScoreN = 0; // ##ML_FILTER — средний скор принятых сделок
  // ##SQN_LAZY## — collectTrades для per-trade анализа в showDetail (не в горячем цикле)
  // Откат: удалить эти 2 строки + tradePnl в return ниже
  const _trPnl = cfg.collectTrades ? [] : null;
  // ##SQN_HOT_START## — SQN без аллокации через сумму квадратов (O(1) per trade, нет GC)
  // Откат: удалить sumPnl2 здесь + +=tradePnl² в trade close + sqn в return
  let sumPnl2 = 0;
  // ##SQN_HOT_END##
  const start = cfg.start || 50;
  const volAvg = cfg.volAvg;
  const bodyAvg = cfg.bodyAvg;
  // Pre-filter active registries to avoid per-bar flag checks in hot loop
  const activeEntries = ENTRY_REGISTRY.filter(e => cfg[e.flag]);
  const activeFilters = FILTER_REGISTRY.filter(f => cfg[f.flag]);
  const activeExits   = EXIT_REGISTRY.filter(x => cfg[x.flag]);

  // Pre-calculate pruning thresholds outside hot loop (10-15% speedup)
  let p5 = -1, p15 = -1, p35 = -1, p60 = -1;
  if (cfg.pruning) {
    const span = N - start;
    p5  = start + Math.floor(span * 0.05);
    p15 = start + Math.floor(span * 0.15);
    p35 = start + Math.floor(span * 0.35);
    p60 = start + Math.floor(span * 0.60);
  }

  for (let i = start; i < N; i++) {
    const ac = atrArr[i-1];
    const bar = DATA[i];
    const prev = DATA[i-1];

    // ===== EXIT =====
    // Порядок точно как в Pine USE solve_core:
    // 1. Rev signal → frc  2. Climax → frc  3. Time → frc
    // 4. BE Ветка 1 (beOff>=beTrig, !frc) → hsl (немедленный выход по цене триггера)
    // 5. SL/TP (только если !hsl) → hsl/htp
    // 6. Trailing (только если !hsl && !htp) → htr + обновление SL
    // 7. frc && !hsl && !htp && !htr → выход по close/sl
    // 8. Закрытие (frc||hsl||htp||htr)
    // 9. BE Ветка 2 (beOff<beTrig, inTrade, !htr) → обновить SL (math.max/min)
    if (inTrade && i > entryBar) {

      // Pruning: четырёхуровневый — 5%, 15%, 35%, 60% данных
      if (cfg.pruning) {
        if (i === p5) {
          if (trades === 0) return null;
        } else if (i === p15) {
          if (dd > cfg.maxDDLimit * 0.6 || trades < 1) return null;
        } else if (i === p35) {
          if (dd > cfg.maxDDLimit * 0.5 || trades < 3) return null;
        } else if (i === p60) {
          if (dd > cfg.maxDDLimit * 0.7) return null;
          if (trades >= 5 && pnl < 0) return null;
        }
      }

      // --- Шаг 1: Rev signal → frc ---
      let frc = false, revNewDir = 0;
      if (cfg.useRev && (i-entryBar) >= cfg.revBars) {
        // oppSig: сигнал противоположного направления из любого включённого типа входа
        let oppSig = false;
        for (let _ei = 0; _ei < activeEntries.length && !oppSig; _ei++) {
          const _e = activeEntries[_ei];
          if (dir === 1) {
            const fn = _e.revDetectS || _e.detectS;
            if (fn(cfg, i)) oppSig = true;
          } else {
            const fn = _e.revDetectL || _e.detectL;
            if (fn(cfg, i)) oppSig = true;
          }
        }
        // Применяем фильтры входа для противоположного направления
        // (только если cfg.revNoFilters !== true; иначе RevSig срабатывает на любой паттерн)
        if (oppSig && !cfg.revNoFilters) {
          for (let _fi = 0; _fi < activeFilters.length && oppSig; _fi++) {
            const _f = activeFilters[_fi];
            if (dir === 1 && _f.blocksS(cfg, i, ac)) oppSig = false;
            if (dir === -1 && _f.blocksL(cfg, i, ac)) oppSig = false;
          }
        }
        if (oppSig) {
          if (cfg.revCooldown > 0) {
            if (revCooldownBar < 0) revCooldownBar = i;
            if ((i - revCooldownBar) >= cfg.revCooldown) {
              const cpnl = dir*(bar.c-entry)/entry*100;
              const condOk = cfg.revMode==='any' || (cfg.revMode==='plus'&&cpnl>0) || (cfg.revMode==='minus'&&cpnl<0);
              if (condOk) {
                if (revSkipCount >= (cfg.revSkip||0)) {
                  frc = true;
                  if ((cfg.revAct||'exit')==='rev') revNewDir = -dir;
                } else { revSkipCount++; }
              }
              revCooldownBar = -1;
            }
          } else {
            const cpnl = dir*(bar.c-entry)/entry*100;
            const condOk = cfg.revMode==='any' || (cfg.revMode==='plus'&&cpnl>0) || (cfg.revMode==='minus'&&cpnl<0);
            if (condOk) {
              if (revSkipCount >= (cfg.revSkip||0)) {
                frc = true;
                if ((cfg.revAct||'exit')==='rev') revNewDir = -dir;
              } else { revSkipCount++; }
            }
          }
        } else {
          revCooldownBar = -1; // нет сигнала → сброс кулдауна
        }
      }

      // --- Шаги 2-3: Forced exits (Climax, Time) из EXIT_REGISTRY ---
      if (!frc) {
        const _ts = { dir, entry, entryBar };
        for (let _xi = 0; _xi < activeExits.length && !frc; _xi++) {
          if (activeExits[_xi].check(cfg, i, _ts)) frc = true;
        }
      }

      // --- Шаг 4: BE Ветка 1 (beOff >= beTrig, !frc) → немедленный выход ---
      let hsl = false, htp = false, htr = false;
      let exitPrice = bar.c;

      if (cfg.useBE && !beActive && cfg.beOff >= cfg.beTrig && !frc) {
        if ((dir===1 && bar.h >= entry + ac*cfg.beTrig) || (dir===-1 && bar.l <= entry - ac*cfg.beTrig)) {
          hsl = true;
          exitPrice = entry + dir * ac * cfg.beTrig;
          beActive = true;
        }
      }

      // --- Шаг 5: SL/TP (только если !hsl) ---
      if (!hsl) {
        if (dir===1) {
          const slHit1 = bar.l <= sl1;
          const slHit2 = hasSL2 ? bar.l <= sl2 : false;
          const tpHit1 = bar.h >= tp1;
          const tpHit2 = hasTP2 ? bar.h >= tp2 : false;
          const slTriggered = cfg.slLogic==='or' ? slHit1 : (slHit1&&slHit2);
          const tpTriggered = cfg.tpLogic==='or' ? tpHit1 : (hasTP2?(tpHit1&&tpHit2):tpHit1);
          // sl1/tp1: nearest for OR, farthest for AND — both are the correct exit level
          if (slTriggered) { hsl=true; exitPrice=sl1; }
          else if (tpTriggered) { htp=true; exitPrice=tp1; }
        } else {
          const slHit1 = bar.h >= sl1;
          const slHit2 = hasSL2 ? bar.h >= sl2 : false;
          const tpHit1 = bar.l <= tp1;
          const tpHit2 = hasTP2 ? bar.l <= tp2 : false;
          const slTriggered = cfg.slLogic==='or' ? slHit1 : (slHit1&&slHit2);
          const tpTriggered = cfg.tpLogic==='or' ? tpHit1 : (hasTP2?(tpHit1&&tpHit2):tpHit1);
          if (slTriggered) { hsl=true; exitPrice=sl1; }
          else if (tpTriggered) { htp=true; exitPrice=tp1; }
        }
      }

      // --- Шаг 5b: Partial TP (обновление posSize, не выход, только если нет hsl/htp) ---
      if (!hsl && !htp && cfg.usePartial && !partialDone) {
        const ptpLevel = entry + dir * Math.abs(entry - sl1) * cfg.partRR;
        if ((dir===1 && bar.h >= ptpLevel) || (dir===-1 && bar.l <= ptpLevel)) {
          pnl += (dir*(ptpLevel - entry)/entry*100 - comm) * cfg.partPct/100;
          posSize = 1 - cfg.partPct/100;
          partialDone = true;
          if (cfg.partBE) {
            const beSL = entry;
            sl1 = dir===1 ? Math.max(sl1, beSL) : Math.min(sl1, beSL);
            if (hasSL2) sl2 = dir===1 ? Math.max(sl2, beSL) : Math.min(sl2, beSL);
            beActive = true;
          }
        }
      }

      // --- Шаг 6: Trailing (только если !hsl && !htp, точно как в Pine) ---
      if (!hsl && !htp) {
        // SL Pivot Trailing
        if (cfg.useSLPiv && cfg.slPivTrail && cfg.pivSLLo && cfg.pivSLHi) {
          if (dir===1 && !isNaN(cfg.pivSLLo[i])) {
            const newSL = cfg.pivSLLo[i] - ac*cfg.slPivOff;
            if (newSL > sl1 && newSL < bar.c) sl1 = newSL;
          } else if (dir===-1 && !isNaN(cfg.pivSLHi[i])) {
            const newSL = cfg.pivSLHi[i] + ac*cfg.slPivOff;
            if (newSL < sl1 && newSL > bar.c) sl1 = newSL;
          }
        }
        // Trailing stop — обновляем SL и проверяем срабатывание
        if (cfg.useTrail) {
          if ((dir===1 && bar.h >= entry + ac*cfg.trTrig) || (dir===-1 && bar.l <= entry - ac*cfg.trTrig))
            trailActive = true;
          if (trailActive) {
            if (dir===1) {
              const ns = bar.h - ac*cfg.trDist;
              if (ns > sl1) {
                if (bar.l <= ns) { htr=true; exitPrice=ns; }
                sl1 = ns;
                if (hasSL2 && ns > sl2) sl2 = ns;
              }
            } else {
              const ns = bar.l + ac*cfg.trDist;
              if (ns < sl1) {
                if (bar.h >= ns) { htr=true; exitPrice=ns; }
                sl1 = ns;
                if (hasSL2 && ns < sl2) sl2 = ns;
              }
            }
          }
        }

        // Wick Trailing SL: двигается от фитиля предыдущей свечи, только в пользу позиции
        if (cfg.useWickTrail && i > 0) {
          const wickOffset = cfg.wickOffType === 'pct'
            ? DATA[i].c * cfg.wickMult / 100
            : cfg.wickOffType === 'pts'
              ? cfg.wickMult  // Points: абсолютное значение цены (как в Pine)
              : atrArr[i] * cfg.wickMult; // ATR (default)
          const wickRaw = dir === 1
            ? DATA[i-1].l - wickOffset   // Long: ниже нижнего фитиля предыдущей свечи
            : DATA[i-1].h + wickOffset;  // Short: выше верхнего фитиля
          // Ratchet: движется только в пользу позиции
          if (isNaN(wickSL)) {
            wickSL = wickRaw;
          } else {
            wickSL = dir === 1 ? Math.max(wickSL, wickRaw) : Math.min(wickSL, wickRaw);
          }
          // Проверка срабатывания (параллельно с основным SL)
          if (!hsl && !htp && !htr) {
            if (dir === 1 && bar.l <= wickSL) { hsl = true; exitPrice = wickSL; }
            else if (dir === -1 && bar.h >= wickSL) { hsl = true; exitPrice = wickSL; }
          }
        }
      }

      // --- Шаг 7: frc без hsl/htp/htr → выход по close (с учётом BE/trail SL) ---
      if (frc && !hsl && !htp && !htr) {
        exitPrice = bar.c;
        if ((trailActive || beActive) && dir===1 && sl1 > entry) exitPrice = Math.max(sl1, bar.c);
        if ((trailActive || beActive) && dir===-1 && sl1 < entry) exitPrice = Math.min(sl1, bar.c);
      }

      // --- Шаг 8: Закрытие сделки ---
      if (frc || hsl || htp || htr) {
        const tradePnl = (dir*(exitPrice-entry)/entry*100 - comm)*posSize;
        pnl += tradePnl; trades++;
        sumPnl2 += tradePnl * tradePnl; // ##SQN_HOT##
        if (_trPnl) _trPnl.push(tradePnl); // ##SQN_LAZY##
        if (cfg.tradeLog && cfg.tradeLog.length) { const tl=cfg.tradeLog[cfg.tradeLog.length-1]; tl.exitBar=i; tl.exit=exitPrice; tl.pnl=tradePnl; }
        if (tradePnl > 0) wins++;
        if (i <= split) { p1+=tradePnl; c1++; if(tradePnl>0) w1++; }
        else { p2+=tradePnl; c2++; if(tradePnl>0) w2++; }
        if (dir===1) { pL+=tradePnl; nL++; if(tradePnl>0) wL++; }
        else         { pS+=tradePnl; nS++; if(tradePnl>0) wS++; }
        maxPnl = Math.max(maxPnl, pnl); dd = Math.max(dd, maxPnl-pnl);
        inTrade = false; exitBar = i;
        revSkipCount=0; revCooldownBar=-1;

        // revAct='rev': сразу открываем в противоположном направлении
        if (revNewDir !== 0) {
          dir = revNewDir; entry = bar.c;
          const ac2 = atrArr[i];
          hasSL2 = cfg.hasSLA && cfg.hasSLB;
          if (cfg.hasSLA) sl1 = entry - dir*ac2*cfg.slMult;
          if (cfg.hasSLB) { const slB2 = entry*(1-dir*cfg.slPctMult/100); sl1 = cfg.hasSLA ? (dir===1?Math.max(sl1,slB2):Math.min(sl1,slB2)) : slB2; }
          if (hasSL2) sl2 = entry*(1-dir*cfg.slPctMult/100);
          const slDist2 = Math.abs(entry-sl1)||ac2;
          hasTP2 = cfg.hasTPA && cfg.hasTPB;
          if (cfg.hasTPA) tp1 = _calcTP(entry, dir, slDist2, ac2, cfg.tpMode,  cfg.tpMult);
          if (cfg.hasTPB) tp2 = _calcTP(entry, dir, slDist2, ac2, cfg.tpModeB, cfg.tpMultB);
          inTrade = true; entryBar = i; posSize = 1.0;
          beActive = false; trailActive = false; partialDone = false;
          eq[i] = pnl;
          continue;
        }
      }

      // --- Шаг 9: BE Ветка 2 (beOff < beTrig) — только если сделка ещё открыта и trailing не закрыл ---
      // math.max/min — не откатываем SL если trailing уже улучшил его
      if (inTrade && !htr && cfg.useBE && !beActive && cfg.beOff < cfg.beTrig) {
        if ((dir===1 && bar.h >= entry + ac*cfg.beTrig) || (dir===-1 && bar.l <= entry - ac*cfg.beTrig)) {
          const newSL = entry + dir * ac * cfg.beOff;
          sl1 = dir===1 ? Math.max(sl1, newSL) : Math.min(sl1, newSL);
          if (hasSL2) sl2 = dir===1 ? Math.max(sl2, newSL) : Math.min(sl2, newSL);
          beActive = true;
        }
      }
    }

    // ===== ENTRY =====
    if (!inTrade && i > exitBar) {
      let doDir = 0; // направление входа: 0 = нет, 1 = лонг, -1 = шорт

      // --- A. Проверка отложенного входа ---
      if (pendingDir !== 0) {
        const barsWaited = i - pendingBar;
        let cancel = false;
        // Отмена если превышен лимит ожидания
        if (cfg.waitMaxBars > 0 && barsWaited > cfg.waitMaxBars) cancel = true;
        // Отмена если цена ушла слишком далеко в нашу сторону (пропустили движение)
        if (!cancel && cfg.waitCancelAtr > 0 && ac > 0) {
          if (pendingDir * (bar.c - pendingSigClose) > cfg.waitCancelAtr * ac) cancel = true;
        }
        if (cancel) {
          pendingDir = 0;
        } else {
          const barsOk    = barsWaited >= cfg.waitBars;
          const retraceOk = !cfg.waitRetrace ||
            (pendingDir === 1  && bar.c < pendingSigClose) ||
            (pendingDir === -1 && bar.c > pendingSigClose);
          if (barsOk && retraceOk) {
            doDir = pendingDir;
            pendingDir = 0;
          }
        }
      }

      // --- B. Новые сигналы (только если нет активного pending и pending не сработал) ---
      if (doDir === 0 && pendingDir === 0) {
        let sigL = false, sigS = false;

        // ENTRY SIGNALS — из activeEntries (pre-filtered)
        for (let _ei = 0; _ei < activeEntries.length; _ei++) {
          const _e = activeEntries[_ei];
          if (!sigL && _e.detectL(cfg, i)) sigL = true;
          if (!sigS && _e.detectS(cfg, i)) sigS = true;
        }

        // FILTERS — из activeFilters (pre-filtered)
        for (let _fi = 0; _fi < activeFilters.length && (sigL || sigS); _fi++) {
          const _f = activeFilters[_fi];
          if (sigL && _f.blocksL(cfg, i, ac)) sigL = false;
          if (sigS && _f.blocksS(cfg, i, ac)) sigS = false;
        }

        if (sigL || sigS) {
          const useDelay = cfg.waitBars > 0 || cfg.waitRetrace;
          if (useDelay) {
            // Сохраняем pending — войдём позже
            pendingDir = sigL ? 1 : -1;
            pendingBar = i;
            pendingSigClose = bar.c;
          } else {
            doDir = sigL ? 1 : -1;
          }
        }
      }

      // --- C. Исполнение входа ---
      if (doDir !== 0 && ac > 0) {
        // ML-фильтр лонгов: блокировать лонг-вход если ML-оценка ниже порога ##ML_FILTER
        if (doDir === 1 && cfg.mlScoresArr && cfg.mlScoresArr[i] >= 0 &&
            cfg.mlScoresArr[i] < (cfg.mlThreshold || 0.5)) {
          doDir = 0;
        }
        // ML-фильтр шортов: блокировать шорт-вход если оценка вершины ниже порога ##ML_FILTER_HIGH
        if (doDir === -1 && cfg.mlHighScoresArr && cfg.mlHighScoresArr[i] >= 0 &&
            cfg.mlHighScoresArr[i] < (cfg.mlHighThreshold || 0.5)) {
          doDir = 0;
        }
      }
      if (doDir !== 0 && ac > 0) {
        // Трекинг среднего ML-скора принятых сделок ##ML_FILTER
        if (cfg.mlScoresArr && cfg.mlScoresArr[i] >= 0) {
          _mlScoreSum += cfg.mlScoresArr[i]; _mlScoreN++;
        }
        inTrade=true; dir=doDir;
        entry=bar.c; entryBar=i;
        beActive=false; trailActive=false; partialDone=false; posSize=1.0; wickSL=NaN;
        revSkipCount=0; revCooldownBar=-1;
        if (cfg.tradeLog) cfg.tradeLog.push({ entryBar: i, dir, entry: bar.c });

        // Compute SL levels — из SL_REGISTRY
        const slCandidates = SL_REGISTRY
          .filter(s => cfg[s.flag])
          .map(s => s.calc(cfg, entry, dir, ac, i))
          .filter(v => !isNaN(v));

        // Resolve SL by logic
        if (slCandidates.length >= 2) {
          const dists = slCandidates.map(s => Math.abs(entry-s));
          const minIdx = dists.indexOf(Math.min(...dists));
          const maxIdx = dists.indexOf(Math.max(...dists));
          if (cfg.slLogic==='or') {
            sl1 = slCandidates[minIdx]; // ближний
            sl2 = slCandidates[maxIdx]; // дальний (для отображения)
          } else {
            sl1 = slCandidates[maxIdx]; // дальний (AND = оба нужны)
            sl2 = slCandidates[minIdx];
          }
          hasSL2 = slCandidates.length >= 2;
        } else if (slCandidates.length===1) { sl1=slCandidates[0]; hasSL2=false; }
        else { sl1 = NaN; hasSL2=false; } // noSL: no exit, matches Pine na

        // Apply adaptive SL multiplier (зависит от волатильности)
        if (cfg.useAdaptiveSL && !isNaN(sl1)) {
          const { slAdaptMult } = _calcAdaptiveMultipliers(atrArr, i, cfg);
          const slDist = Math.abs(entry - sl1);
          const newSlDist = slDist * slAdaptMult;
          sl1 = dir === 1 ? entry - newSlDist : entry + newSlDist;
          if (hasSL2) {
            const sl2Dist = Math.abs(entry - sl2);
            const newSl2Dist = sl2Dist * slAdaptMult;
            sl2 = dir === 1 ? entry - newSl2Dist : entry + newSl2Dist;
          }
        }

        // Dynamic SL by structure break: if structure broken, tighten SL
        if (cfg.useDynSLStruct && !isNaN(sl1) && cfg.structBull && cfg.structBear) {
          const structOk = cfg.structBull[i] || cfg.structBear[i];
          if (!structOk) {
            // Structure broken: move SL closer to entry by multiplier
            const slDist = Math.abs(entry - sl1);
            const newSlDist = slDist * cfg.dynSLStructMult;
            sl1 = dir === 1 ? entry - newSlDist : entry + newSlDist;
            if (hasSL2) sl2 = sl1; // sync sl2
          }
        }

        // Compute TP levels — через _calcTP из sl_tp_registry.js
        const slDist = !isNaN(sl1) ? Math.abs(entry-sl1) : ac; // fallback to 1×ATR for R:R TP when no fixed SL
        let tpA = NaN, tpB = NaN;
        if (cfg.hasTPA) tpA = _calcTP(entry, dir, slDist, ac, cfg.tpMode,  cfg.tpMult);
        if (cfg.hasTPB) tpB = _calcTP(entry, dir, slDist, ac, cfg.tpModeB, cfg.tpMultB);

        // Apply adaptive TP multiplier (зависит от волатильности)
        if (cfg.useAdaptiveTP && (cfg.hasTPA || cfg.hasTPB)) {
          const { tpAdaptMult } = _calcAdaptiveMultipliers(atrArr, i, cfg);
          if (!isNaN(tpA)) {
            const tpDist = Math.abs(tpA - entry);
            const newTpDist = tpDist * tpAdaptMult;
            tpA = dir === 1 ? entry + newTpDist : entry - newTpDist;
          }
          if (!isNaN(tpB)) {
            const tpDist = Math.abs(tpB - entry);
            const newTpDist = tpDist * tpAdaptMult;
            tpB = dir === 1 ? entry + newTpDist : entry - newTpDist;
          }
        }

        if (!isNaN(tpA) && !isNaN(tpB)) {
          const distA=Math.abs(tpA-entry), distB=Math.abs(tpB-entry);
          if (cfg.tpLogic==='or') {
            tp1=distA<=distB?tpA:tpB; tp2=distA<=distB?tpB:tpA;
          } else {
            tp1=distA>=distB?tpA:tpB; tp2=distA>=distB?tpB:tpA;
          }
          hasTP2=true;
        } else if (!isNaN(tpA)) { tp1=tpA; hasTP2=false; }
        else if (!isNaN(tpB)) { tp1=tpB; hasTP2=false; }
        else { tp1=NaN; hasTP2=false; } // noTP: no exit, matches Pine na
      }
    }
    // DD tracked only at trade close (matches Pine solve_core: _mpnl/_dd updated on exit).
    // markToMarket=true: eq includes unrealized PnL, matches TV indicator plot.
    // markToMarket=false (default): eq updates only on trade close (faster, consistent IS/OOS DD).
    eq[i] = (cfg.markToMarket && inTrade)
      ? pnl + (dir * (bar.c - entry) / entry * 100) * posSize
      : pnl;
  }

  const wr=trades>0?wins/trades*100:0;
  const wr1=c1>0?w1/c1*100:0, wr2=c2>0?w2/c2*100:0;
  const wrL=nL>0?wL/nL*100:null, wrS=nS>0?wS/nS*100:null;
  // ##SQN_HOT_START## вычисляем SQN аналитически из суммы квадратов
  const _sqnAvg = trades > 0 ? pnl / trades : 0;
  const _sqnVar = trades > 1 ? sumPnl2 / trades - _sqnAvg * _sqnAvg : 0;
  const sqn = trades >= 10 && _sqnVar > 1e-10
    ? Math.round(_sqnAvg / Math.sqrt(_sqnVar) * Math.sqrt(trades) * 10) / 10
    : null;
  // ##SQN_HOT_END##
  return { pnl, wr, n:trades, dd, p1, w1:wr1, c1, p2, w2:wr2, c2, eq,
           dwr:Math.abs(wr1-wr2), avg:trades>0?pnl/trades:0,
           nL, pL, wrL, nS, pS, wrS,
           dwrLS: (wrL!==null&&wrS!==null) ? Math.abs(wrL-wrS) : null,
           sqn, // ##SQN_HOT## всегда вычисляется
           mlAvg: _mlScoreN > 0 ? Math.round(_mlScoreSum / _mlScoreN * 100) : null, // ##ML_FILTER
           tradePnl: _trPnl??[] }; // ##SQN_LAZY## пусто если collectTrades не задан
}

