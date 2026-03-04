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
  for (let i = period - 1; i < N; i++) {
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += data[j];
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
// Pivot-based расчёт структуры рынка (как в Pine USE)
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
  // Возвращает {lo[], hi[]} — последний pivot low/high доступный на каждом баре
  const N=data.length;
  const lo=new Float64Array(N).fill(NaN);
  const hi=new Float64Array(N).fill(NaN);
  let lastLo=NaN, lastHi=NaN;
  for(let i=pvL;i<N-pvR;i++){
    // Pivot low
    let isL=true;
    for(let j=1;j<=pvL;j++){if(data[i].l>=data[i-j].l){isL=false;break;}}
    if(isL)for(let j=1;j<=pvR;j++){if(data[i].l>=data[i+j].l){isL=false;break;}}
    if(isL) lastLo=data[i].l;
    // Pivot high
    let isH=true;
    for(let j=1;j<=pvL;j++){if(data[i].h<=data[i-j].h){isH=false;break;}}
    if(isH)for(let j=1;j<=pvR;j++){if(data[i].h<=data[i+j].h){isH=false;break;}}
    if(isH) lastHi=data[i].h;
    // Заполняем с учётом задержки pvR
    const fillBar = i+pvR;
    if(fillBar<N){lo[fillBar]=lastLo; hi[fillBar]=lastHi;}
  }
  // Заполняем пробелы вперёд
  let curLo=NaN, curHi=NaN;
  for(let i=0;i<N;i++){
    if(!isNaN(lo[i]))curLo=lo[i];
    else lo[i]=curLo;
    if(!isNaN(hi[i]))curHi=hi[i];
    else hi[i]=curHi;
  }
  return{lo,hi};
}
function calcMA(data, period, type) {
  if (type === 'SMA') return calcSMA(data, period);
  if (type === 'WMA') return calcWMA(data, period);
  return calcEMA(data, period);
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
function calcRMA_ATR(period) {
  const N = DATA.length;
  const tr = new Float64Array(N), rma = new Float64Array(N);
  for (let i = 1; i < N; i++)
    tr[i] = Math.max(DATA[i].h - DATA[i].l, Math.abs(DATA[i].h - DATA[i-1].c), Math.abs(DATA[i].l - DATA[i-1].c));
  let s = 0;
  for (let i = 1; i <= Math.min(period, N-1); i++) s += tr[i];
  if (N > period) rma[period] = s / period;
  const alpha = 1 / period;
  for (let i = period + 1; i < N; i++) rma[i] = alpha * tr[i] + (1 - alpha) * rma[i-1];
  return rma;
}
function calcPivotLow(left, right) {
  // Pine ta.pivotlow: center СТРОГО меньше всех left И right баров
  const N = DATA.length, res = new Uint8Array(N);
  for (let i = left + right; i < N; i++) {
    const idx = i - right, v = DATA[idx].l;
    let ok = true;
    for (let j = idx - left; j < idx; j++) { if (DATA[j].l <= v) { ok = false; break; } }
    if (ok) for (let j = idx + 1; j <= Math.min(idx + right, N-1); j++) { if (DATA[j].l <= v) { ok = false; break; } }
    if (ok) res[i] = 1;
  }
  return res;
}
function calcPivotHigh(left, right) {
  // Pine ta.pivothigh: center СТРОГО больше всех left И right баров
  const N = DATA.length, res = new Uint8Array(N);
  for (let i = left + right; i < N; i++) {
    const idx = i - right, v = DATA[idx].h;
    let ok = true;
    for (let j = idx - left; j < idx; j++) { if (DATA[j].h >= v) { ok = false; break; } }
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
  // ADX = RMA(dx, period) как в Pine
  return calcRMA(Array.from(dx), period);
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
  let revSkipCount = 0, revCooldownBar = -1; // счётчики skip/cooldown для обратного сигнала
  let pnl = 0, trades = 0, wins = 0, maxPnl = 0, dd = 0;
  let p1 = 0, c1 = 0, w1 = 0, p2 = 0, c2 = 0, w2 = 0;
  let nL = 0, wL = 0, pL = 0, nS = 0, wS = 0, pS = 0; // лонг/шорт стат
  const eq = new Float32Array(N);
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
        const span = DATA.length - start;
        const p5  = start + Math.floor(span * 0.05);
        const p15 = start + Math.floor(span * 0.15);
        const p35 = start + Math.floor(span * 0.35);
        const p60 = start + Math.floor(span * 0.60);
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
        // oppSig: сигнал противоположного направления (те же типы входа, что включены)
        // Pivot: только если pivot-вход включён
        let oppSig = cfg.usePivot && (dir===1 ? pvHi[i]===1 : pvLo[i]===1);
        // TL-фигуры: tfSigS для длинной позиции, tfSigL для короткой
        if (!oppSig && cfg.tfSigL && cfg.tfSigS) {
          const tfM=(cfg.useTLTouch?1:0)|(cfg.useTLBreak?2:0)|(cfg.useFlag?4:0)|(cfg.useTri?8:0);
          if (tfM) {
            if (dir===1  && (cfg.tfSigS[i]&tfM)) oppSig=true;
            if (dir===-1 && (cfg.tfSigL[i]&tfM)) oppSig=true;
          }
        }
        // Engulf reverse
        if (!oppSig && cfg.useEngulf) {
          const bPrev=Math.abs(prev.o-prev.c), bCur=Math.abs(bar.o-bar.c);
          if (dir===1  && prev.c>prev.o && bar.c<bar.o && bCur>=bPrev*0.7 && bar.c<=prev.o && bar.o>=prev.c) oppSig=true;
          if (dir===-1 && prev.c<prev.o && bar.c>bar.o && bCur>=bPrev*0.7 && bar.c>=prev.o && bar.o<=prev.c) oppSig=true;
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

      // --- Шаг 2: Climax → frc ---
      if (!frc && cfg.useClimax && HAS_VOLUME && volAvg && bodyAvg) {
        const isClimaxBar = prev.v > volAvg[i-1]*cfg.clxVolMult &&
          Math.abs(prev.c - prev.o) > bodyAvg[i-1]*cfg.clxBodyMult;
        if (isClimaxBar) {
          const cpnl = dir*(bar.c - entry)/entry*100;
          if (cfg.clxMode==='any' || cpnl > 0) frc = true;
        }
      }

      // --- Шаг 3: Time → frc ---
      if (!frc && cfg.useTime && (i-entryBar) >= cfg.timeBars) {
        if (cfg.timeMode==='any') frc = true;
        else { const cpnl = dir*(bar.c-entry)/entry*100; if (cfg.timeMode==='plus'&&cpnl>0) frc=true; }
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
          if (slTriggered) { hsl=true; exitPrice=cfg.slLogic==='or'?sl1:(hasSL2?sl2:sl1); }
          else if (tpTriggered) { htp=true; exitPrice=cfg.tpLogic==='or'?tp1:(hasTP2?tp2:tp1); }
        } else {
          const slHit1 = bar.h >= sl1;
          const slHit2 = hasSL2 ? bar.h >= sl2 : false;
          const tpHit1 = bar.l <= tp1;
          const tpHit2 = hasTP2 ? bar.l <= tp2 : false;
          const slTriggered = cfg.slLogic==='or' ? slHit1 : (slHit1&&slHit2);
          const tpTriggered = cfg.tpLogic==='or' ? tpHit1 : (hasTP2?(tpHit1&&tpHit2):tpHit1);
          if (slTriggered) { hsl=true; exitPrice=cfg.slLogic==='or'?sl1:(hasSL2?sl2:sl1); }
          else if (tpTriggered) { htp=true; exitPrice=cfg.tpLogic==='or'?tp1:(hasTP2?tp2:tp1); }
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
          hasSL2 = hasSLA && hasSLB;
          if (hasSLA) sl1 = entry - dir*ac2*cfg.slMult;
          if (hasSLB) { const slB2 = entry*(1-dir*cfg.slPctMult/100); sl1 = hasSLA ? (dir===1?Math.max(sl1,slB2):Math.min(sl1,slB2)) : slB2; }
          if (hasSL2) sl2 = entry*(1-dir*cfg.slPctMult/100);
          const slDist2 = Math.abs(entry-sl1)||ac2;
          hasTP2 = hasTPA && hasTPB;
          if (hasTPA) { tp1 = cfg.tpMode==='rr' ? entry+dir*slDist2*cfg.tpMult : cfg.tpMode==='atr' ? entry+dir*ac2*cfg.tpMult : entry*(1+dir*cfg.tpMult/100); }
          if (hasTPB) { tp2 = cfg.tpModeB==='rr' ? entry+dir*slDist2*cfg.tpMultB : cfg.tpModeB==='atr' ? entry+dir*ac2*cfg.tpMultB : entry*(1+dir*cfg.tpMultB/100); }
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
      let sigL = false, sigS = false;

      if (cfg.usePivot) {
        if (pvLo[i]===1) sigL=true;
        if (pvHi[i]===1) sigS=true;
      }
      if (cfg.useEngulf && i>=3) {
        const bp=Math.abs(DATA[i-2].c-DATA[i-2].o), bc=Math.abs(prev.c-prev.o);
        if (DATA[i-2].c<DATA[i-2].o && prev.c>prev.o && bc>=bp*0.7 && prev.c>=DATA[i-2].o) sigL=true;
        if (DATA[i-2].c>DATA[i-2].o && prev.c<prev.o && bc>=bp*0.7 && prev.c<=DATA[i-2].o) sigS=true;
      }
      if (cfg.usePinBar && i>=2) {
        const body=Math.abs(prev.c-prev.o)||0.0000001;
        const lw=Math.min(prev.c,prev.o)-prev.l, uw=prev.h-Math.max(prev.c,prev.o);
        if (lw>body*cfg.pinRatio && uw<body) sigL=true;
        if (uw>body*cfg.pinRatio && lw<body) sigS=true;
      }
      if (cfg.useBoll && cfg.bbB && cfg.bbD[i-1]>0) {
        if (prev.c>cfg.bbB[i-1]+cfg.bbD[i-1]) sigL=true;
        if (prev.c<cfg.bbB[i-1]-cfg.bbD[i-1]) sigS=true;
      }
      if (cfg.useDonch && cfg.donH) {
        if (prev.h>cfg.donH[i]) sigL=true;
        if (prev.l<cfg.donL[i]) sigS=true;
      }
      if (cfg.useAtrBo && cfg.atrBoMA && cfg.atrBoATR[i-1]>0) {
        if (prev.c>cfg.atrBoMA[i-1]+cfg.atrBoATR[i-1]*cfg.atrBoMult) sigL=true;
        if (prev.c<cfg.atrBoMA[i-1]-cfg.atrBoATR[i-1]*cfg.atrBoMult) sigS=true;
      }
      if (cfg.useMaTouch && cfg.matMA && i>=3) {
        const crossUp=DATA[i-1].c>cfg.matMA[i-1]&&DATA[i-2].c<=cfg.matMA[i-2];
        const crossDn=DATA[i-1].c<cfg.matMA[i-1]&&DATA[i-2].c>=cfg.matMA[i-2];
        const zone=cfg.matMA[i-1]*cfg.matZone/100;
        if (crossUp&&DATA[i-1].l<=cfg.matMA[i-1]+zone) sigL=true;
        if (crossDn&&DATA[i-1].h>=cfg.matMA[i-1]-zone) sigS=true;
      }
      if (cfg.useSqueeze && cfg.sqzOn) {
        const minBars = cfg.sqzMinBars||1;
        if (!cfg.sqzOn[i] && cfg.sqzCount[i-1]>=minBars) {
          if (bar.c>bar.o) sigL=true;
          if (bar.c<bar.o) sigS=true;
        }
      }
      // Trendline Figures — TL touch, TL break, Flag, Triangle
      if (cfg.tfSigL && cfg.tfSigS) {
        if (cfg.useTLTouch && (cfg.tfSigL[i]&1)) sigL=true;
        if (cfg.useTLTouch && (cfg.tfSigS[i]&1)) sigS=true;
        if (cfg.useTLBreak && (cfg.tfSigL[i]&2)) sigL=true;
        if (cfg.useTLBreak && (cfg.tfSigS[i]&2)) sigS=true;
        if (cfg.useFlag    && (cfg.tfSigL[i]&4)) sigL=true;
        if (cfg.useFlag    && (cfg.tfSigS[i]&4)) sigS=true;
        if (cfg.useTri     && (cfg.tfSigL[i]&8)) sigL=true;
        if (cfg.useTri     && (cfg.tfSigS[i]&8)) sigS=true;
      }

      // FILTERS
      // MA фильтр: Pine проверяет close[1] > ma_val где ma_val = EMA[i-1]
      // → DATA[i-1].c > maArr[i-1], а не текущий бар
      if (cfg.useMA && cfg.maArr && cfg.maArr[i-1]>0) {
        if (prev.c<=cfg.maArr[i-1]) sigL=false;
        if (prev.c>=cfg.maArr[i-1]) sigS=false;
      }
      if (cfg.useADX && cfg.adxArr) {
        if (cfg.adxArr[i-1]<cfg.adxThresh) { sigL=false; sigS=false; }
      }
      if (cfg.useRSI && cfg.rsiArr) {
        if (cfg.rsiArr[i-1]>=cfg.rsiOS) sigL=false;
        if (cfg.rsiArr[i-1]<=cfg.rsiOB) sigS=false;
      }
      if (cfg.useVolF && cfg.atrAvg) {
        if (ac>cfg.atrAvg[i-1]*cfg.volFMult) { sigL=false; sigS=false; }
      }
      if (cfg.useStruct && cfg.structBull) {
        if (!cfg.structBull[i]) sigL=false;
        if (!cfg.structBear[i]) sigS=false;
      }
      // MA дистанция: Pine проверяет abs(close[1] - ma_val) / atr_v → [i-1] bars
      if (cfg.useMaDist && cfg.maArr && ac>0) {
        const dist=Math.abs(prev.c-cfg.maArr[i-1])/ac;
        if (dist>cfg.maDistMax) { sigL=false; sigS=false; }
      }
      // Размер свечи: Pine проверяет ТЕКУЩУЮ свечу (bar confirmed = close[0])
      // body_size = abs(close-open), candle_size = high-low — всё на текущем баре
      if (cfg.useCandleF && ac>0) {
        const cs=bar.h-bar.l;
        if (cs<ac*cfg.candleMin||cs>ac*cfg.candleMax) { sigL=false; sigS=false; }
      }
      if (cfg.useConsec && i>=cfg.consecMax+1) {
        let bc=0, bca=0;
        for (let j=1;j<=cfg.consecMax+1;j++) {
          if(DATA[i-j].c>DATA[i-j].o) bc++; else {bc=0;break;}
        }
        for (let j=1;j<=cfg.consecMax+1;j++) {
          if(DATA[i-j].c<DATA[i-j].o) bca++; else {bca=0;break;}
        }
        if(bc>=cfg.consecMax) sigL=false;
        if(bca>=cfg.consecMax) sigS=false;
      }
      // STrend: Pine сравнивает close[1..N] с ОДНИМ значением ma_val = EMA[i-1]
      // (не каждый бар со своей исторической EMA)
      if (cfg.useSTrend && cfg.maArr && i>=cfg.sTrendWin+1) {
        const maRef = cfg.maArr[i-1]; // одно фиксированное значение EMA
        let ab=0, bl2=0;
        for (let j=1;j<=cfg.sTrendWin;j++) {
          if(DATA[i-j].c>maRef) ab++; else bl2++;
        }
        if(ab<=bl2) sigL=false;
        if(bl2<=ab) sigS=false;
      }
      // Вторая MA (аналог MTF MA в USE): close > secondaryMA → Long OK, close < secondaryMA → Short OK
      if (cfg.useConfirm && cfg.maArrConfirm && cfg.maArrConfirm[i]>0 && i>=1) {
        const secMA = cfg.maArrConfirm[i-1];
        if (secMA > 0) {
          if (DATA[i-1].c <= secMA) sigL=false;
          if (DATA[i-1].c >= secMA) sigS=false;
        }
      }
      // Свежесть тренда: Pine считает непрерывную серию баров подряд где close > MA
      // trend_age_l += 1 пока close > ma_val, блокирует если trend_age_l >= fresh_max
      // MA для сравнения = EMA[i-1] (предыдущий бар)
      if (cfg.useFresh && cfg.maArr) {
        let ageL=0;
        for (let j=1;j<Math.min(i,cfg.freshMax+2);j++) {
          if(DATA[i-j].c>cfg.maArr[i-j-1]) ageL++;
          else break; // серия прервалась
        }
        if(ageL>=cfg.freshMax) sigL=false;
        let ageS=0;
        for (let j=1;j<Math.min(i,cfg.freshMax+2);j++) {
          if(DATA[i-j].c<cfg.maArr[i-j-1]) ageS++;
          else break;
        }
        if(ageS>=cfg.freshMax) sigS=false;
      }
      // VOLUME FILTERS
      if (HAS_VOLUME && cfg.useVSA && volAvg) {
        if (prev.v < volAvg[i-1]*cfg.vsaMult) { sigL=false; sigS=false; }
      }
      if (HAS_VOLUME && cfg.useLiq && volAvg) {
        if (prev.v < volAvg[i-1]*cfg.liqMin) { sigL=false; sigS=false; }
      }
      if (HAS_VOLUME && cfg.useVolDir && volAvg && i>=cfg.volDirPeriod) {
        let bullVol=0, bearVol=0;
        for (let j=1;j<=cfg.volDirPeriod;j++) {
          if(DATA[i-j].c>DATA[i-j].o) bullVol+=DATA[i-j].v; else bearVol+=DATA[i-j].v;
        }
        if(bullVol<=bearVol) sigL=false;
        if(bearVol<=bullVol) sigS=false;
      }
      if (cfg.useWT && cfg.wtScores) {
        if(cfg.wtScores[i]<=cfg.wtThresh) sigL=false;
        if(cfg.wtScores[i]>=-cfg.wtThresh) sigS=false;
      }
      if (HAS_VOLUME && cfg.useFat && volAvg && i>=10) {
        // Pine: fat_vol_recent = ta.sma(volume, 3) — включает текущий бар
        // fat_vol_prev = ta.sma(volume, 10) — включает текущий бар
        const volRecent = (bar.v + DATA[i-1].v + DATA[i-2].v) / 3;
        const volPrev10 = (bar.v + DATA[i-1].v + DATA[i-2].v + DATA[i-3].v + DATA[i-4].v +
                           DATA[i-5].v + DATA[i-6].v + DATA[i-7].v + DATA[i-8].v + DATA[i-9].v) / 10;
        const fatVol = volRecent < volPrev10 * cfg.fatVolDrop;
        let bullConsec=0, bearConsec=0;
        for(let j=1;j<=cfg.fatConsec+1;j++) {
          if(DATA[i-j].c>DATA[i-j].o) { if(j===1||DATA[i-j+1].c>DATA[i-j+1].o) bullConsec++; else break; }
          else break;
        }
        for(let j=1;j<=cfg.fatConsec+1;j++) {
          if(DATA[i-j].c<DATA[i-j].o) { if(j===1||DATA[i-j+1].c<DATA[i-j+1].o) bearConsec++; else break; }
          else break;
        }
        if(bullConsec>=cfg.fatConsec && fatVol) sigL=false;
        if(bearConsec>=cfg.fatConsec && fatVol) sigS=false;
      }

      // ENTRY EXECUTION
      if ((sigL||sigS) && ac>0) {
        inTrade=true; dir=sigL?1:-1;
        entry=bar.c; entryBar=i;
        beActive=false; trailActive=false; partialDone=false; posSize=1.0;
        revSkipCount=0; revCooldownBar=-1;

        // Compute SL levels
        let slA = NaN, slB = NaN, slC = NaN;
        if (cfg.hasSLA) slA = entry - dir*ac*cfg.slMult;
        if (cfg.hasSLB) slB = entry*(1 - dir*cfg.slPctMult/100);
        // SL Pivot: ставим на ближайший pivot + отступ, ограничиваем maxDist
        if (cfg.useSLPiv && cfg.pivSLLo && cfg.pivSLHi) {
          const pivLevel = dir===1 ? cfg.pivSLLo[i] : cfg.pivSLHi[i];
          if (!isNaN(pivLevel)) {
            const rawSL = dir===1 ? pivLevel - ac*cfg.slPivOff : pivLevel + ac*cfg.slPivOff;
            const maxDist = ac * cfg.slPivMax;
            const dist = Math.abs(entry - rawSL);
            slC = dist > maxDist ? entry - dir*maxDist : rawSL;
            // Проверяем что SL в правильную сторону
            if ((dir===1 && slC >= entry) || (dir===-1 && slC <= entry)) slC = NaN;
          }
        }

        // Собираем все SL в массив
        const slCandidates = [slA, slB, slC].filter(v => !isNaN(v));

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
        else { sl1=entry-dir*ac*1.5; hasSL2=false; }

        // Compute TP levels
        const slDist = Math.abs(entry-sl1);
        let tpA = NaN, tpB = NaN;
        if (cfg.hasTPA) {
          if (cfg.tpMode==='rr') tpA=entry+dir*slDist*cfg.tpMult;
          else if (cfg.tpMode==='atr') tpA=entry+dir*ac*cfg.tpMult;
          else tpA=entry*(1+dir*cfg.tpMult/100);
        }
        if (cfg.hasTPB) {
          if (cfg.tpModeB==='rr') tpB=entry+dir*slDist*cfg.tpMultB;
          else if (cfg.tpModeB==='atr') tpB=entry+dir*ac*cfg.tpMultB;
          else tpB=entry*(1+dir*cfg.tpMultB/100);
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
        else { tp1=entry+dir*slDist*2; hasTP2=false; }
      }
    }
    eq[i] = pnl;
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
           tradePnl: _trPnl??[] }; // ##SQN_LAZY## пусто если collectTrades не задан
}

