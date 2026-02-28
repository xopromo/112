// ============================================================
// ⚠️  CLAUDE: ЧИТАЙ MANIFEST.md ПЕРВЫМ ПЕРЕД ЛЮБЫМ ИЗМЕНЕНИЕМ
// Контрольный список критичных функций — в MANIFEST.md
// Проверяй его ДО и ПОСЛЕ каждой правки.
// ============================================================

// ============================================================
// USE_Optimizer_v6 — OPT  (optimizer + robustness engine)
// ============================================================
// Зависимости: DATA, HAS_VOLUME, results, favourites, equities
//              stopped, paused, $(), $v(), $c(), $n()
//              backtest + calc* из core.js
//
// SECTION A: parseRange  (18 строк)
// SECTION B: buildName  fmtNum  calcTotal  updatePreview  runOpt  (900+ строк)
// SECTION C: runMassRobust  runRobustScoreFor  runRobustScoreForDetailed  (330 строк)
// SECTION D: _robCache*  _fastCfgKey  _getDataHash  _robCacheLoad  (70 строк)
// ============================================================

// ##SECTION_A##
// RANGE PARSER
// ============================================================
function parseRange(id) {
  const v = $v(id);
  if (!v) return [];
  if (v.includes(':')) {
    const parts = v.split(':').map(Number);
    if (parts.length >= 3 && parts[2] > 0) {
      const arr = [];
      for (let x = parts[0]; x <= parts[1] + parts[2] * 0.0001; x += parts[2])
        arr.push(Math.round(x * 10000) / 10000);
      return arr;
    }
    return parts.filter(x => !isNaN(x));
  }
  return v.split(',').map(x => parseFloat(x.trim())).filter(x => !isNaN(x));
}

// ##SECTION_B##
// ── Statistical Significance (Hyp 3) ─────────────────────────
// z-тест win rate: уверенность что WR > 50% не случайна.
// Возвращает sig_pct [0..99].
function _calcStatSig(r) {
  if (!r || r.n < 2) return 0;
  const z = (r.wr / 100 - 0.5) / Math.sqrt(0.25 / r.n);
  if (z <= 0) return 0;
  const t = 1 / (1 + 0.2316419 * z);
  const p = (1/Math.sqrt(2*Math.PI)) * Math.exp(-z*z/2) *
    t*(0.319382+t*(-0.356564+t*(1.781478+t*(-1.821256+t*1.330274))));
  return Math.min(99, Math.max(0, Math.round((1 - p) * 100)));
}
// ─────────────────────────────────────────────────────────────

// ── GT-Score (Hyp 1) ──────────────────────────────────────────
// Антиовефиттинг метрика: (pnl/dd) × sig_mult × consistency_mult
// sig_mult     = 1 + clamp(z, 0, 3) × 0.3   [1.0 .. 1.9]
// consistMult  = 0.5 + clamp(1-dwr/100,0,1) × 0.5  [0.5 .. 1.0]
function _calcGTScore(r) {
  if (!r || r.n < 1) return -2;
  const pdd = r.dd > 0 ? r.pnl / r.dd : (r.pnl > 0 ? 50 : -2);
  if (pdd <= 0) return Math.max(-2, pdd);
  const z = (r.wr - 50) / Math.sqrt(2500 / Math.max(r.n, 1));
  const sigMult = 1 + Math.min(Math.max(z, 0), 3) * 0.3;
  const dwr = r.dwr !== undefined ? r.dwr : 0;
  const consistMult = 0.5 + Math.min(Math.max(1 - dwr / 100, 0), 1) * 0.5;
  return pdd * sigMult * consistMult;
}
// ─────────────────────────────────────────────────────────────

// NAME BUILDER — подробный
// ============================================================
function buildName(cfg, pvL, pvR, slDesc, tpDesc, filters, extras) {
  const parts = [];
  const ex = extras||{};

  // Entry patterns
  const entries = [];
  if (cfg.usePivot) entries.push(`Pv(L${pvL}R${pvR})`);
  if (cfg.useEngulf) entries.push('Engulf');
  if (cfg.usePinBar) entries.push(`PinBar×${cfg.pinRatio}`);
  if (cfg.useBoll) entries.push('BBproboj');
  if (cfg.useDonch) entries.push('Donch');
  if (cfg.useAtrBo) entries.push(`ATRbo×${cfg.atrBoMult}`);
  if (cfg.useMaTouch) entries.push('MAToch');
  if (cfg.useSqueeze) entries.push('Squeeze');
  if (entries.length===0) entries.push('NoEntry');
  parts.push(entries.join('+'));

  // ATR period — always include so variants with different atrP are unique
  if (ex.atrP != null) parts.push(`ATR${ex.atrP}`);

  // SL
  parts.push(slDesc);

  // TP
  parts.push(tpDesc);

  // Exits
  const exits = [];
  if (cfg.useBE) exits.push(`BE(t${cfg.beTrig}o${cfg.beOff})`);
  if (cfg.useTrail) exits.push(`Trail(t${cfg.trTrig}d${cfg.trDist})`);
  if (cfg.useRev) { let _rs=`RevSig(mb${cfg.revBars})`; if(cfg.revSkip) _rs+=`sk${cfg.revSkip}`; if(cfg.revCooldown) _rs+=`cd${cfg.revCooldown}`; exits.push(_rs); }
  if (cfg.useTime) exits.push(`Time${cfg.timeBars}`);
  if (cfg.usePartial) exits.push(`Partial${cfg.partPct}%`);
  if (cfg.useClimax) exits.push('Clmx');
  if (exits.length>0) parts.push(exits.join('+'));

  // Filters
  const filts = [];
  if (cfg.useMA && ex.maP) filts.push(`${ex.maType}${ex.maP}`);
  if (cfg.useADX) filts.push(`ADX(${ex.adxL||cfg.adxLen}>${cfg.adxThresh})`);
  if (cfg.useRSI) filts.push(`RSI(${cfg.rsiOS}-${cfg.rsiOB})`);
  if (cfg.useVolF) filts.push(`VFilt<${cfg.volFMult}×`);
  if (cfg.useStruct) filts.push('Struct');
  if (cfg.useMaDist) filts.push(`MaDist<${cfg.maDistMax}×ATR`);
  if (cfg.useCandleF) filts.push(`Candle(${cfg.candleMin}-${cfg.candleMax})`);
  if (cfg.useConsec) filts.push(`Consec<${cfg.consecMax}`);
  if (cfg.useSTrend) filts.push(`STrend${ex.stw||cfg.sTrendWin||''}`);
  if (cfg.useFresh) filts.push(`Fresh<${cfg.freshMax}`);
  if (cfg.useConfirm && cfg.confN) filts.push(`Conf${cfg.confMatType||'EMA'}${cfg.confN}`);
  // Volume filters
  if (cfg.useVSA) filts.push(`Vol>${cfg.vsaMult}×`);
  if (cfg.useLiq) filts.push(`Liq>${cfg.liqMin}×`);
  if (cfg.useVolDir) filts.push('VolDir');
  if (cfg.useWT) filts.push(`WT>${cfg.wtThresh}`);
  if (cfg.useFat) filts.push(`Fat(${cfg.fatConsec}sv)`);
  if (filts.length>0) parts.push('['+filts.join('|')+']');

  return parts.join(' ');
}

// ============================================================
// MAIN OPTIMIZER
// ============================================================
function fmtNum(n) {
  return Math.round(n).toLocaleString('ru-RU');
}

function calcTotal() {
  if (!DATA) return 0;
  const usePv=$c('e_pv'),useAdx=$c('f_adx'),useRsi=$c('f_rsi');
  const useVolF=$c('f_volf'),useMaDist=$c('f_madist'),useFresh=$c('f_fresh');
  const useTrail=$c('x_tr'),useBE=$c('x_be'),useTime=$c('x_time');
  const useVSA=HAS_VOLUME&&$c('f_vsa'),useWT=HAS_VOLUME&&$c('f_wt');
  const useAtrBo=$c('e_atrbo');
  const pvLs=usePv?parseRange('e_pvl'):[5];
  const pvRs=usePv?parseRange('e_pvr'):[2];
  const atrPs=parseRange('c_atr');
  const maPs=$c('f_ma')?parseRange('f_map'):[0];
  const adxTs=useAdx?parseRange('f_adxt'):[0];
  const rsiOSA=useRsi?parseRange('f_rsios'):[30];
  const rsiOBA=useRsi?parseRange('f_rsiob'):[70];
  let rsiCount=0;
  if(useRsi){rsiOSA.forEach(os=>{rsiOBA.forEach(ob=>{if(os<ob)rsiCount++;});})}
  else rsiCount=1;
  const vfMs=useVolF?parseRange('f_vfm'):[0];
  const mdMaxs=useMaDist?parseRange('f_madv'):[0];
  const freshMaxs=useFresh?parseRange('f_freshm'):[20];
  const beOffs=useBE?parseRange('x_beo'):[0];
  const beTrigs_ct=useBE?parseRange('x_bet'):[1];
  let beCount=1;
  if(useBE){let v=0;beTrigs_ct.forEach(t=>{beOffs.forEach(o=>{if(o<t)v++;});});beCount=v||1;}
  const trTrigs=useTrail?parseRange('x_trt'):[1.5];
  const trDists=useTrail?parseRange('x_trd'):[1.0];
  const timeBarsA=useTime?parseRange('x_timeb'):[50];
  const revBarsA=($c('x_rev')&&$v('x_revb'))?parseRange('x_revb'):[2];
  const revSkipA=$c('x_rev')?parseRange('x_revskip'):[0];
  const revCooldownA=$c('x_rev')?parseRange('x_revcd'):[0];
  const wtTs=useWT?parseRange('f_wtt'):[0];
  const vsaMs=useVSA?parseRange('f_vsam'):[0];
  const atrBoMs=useAtrBo?parseRange('e_atbm'):[2.0];
  let slCfgs=[];
  if($c('s_atr')) parseRange('s_atrv').forEach(v=>slCfgs.push({type:'atr',m:v}));
  if($c('s_pct')) parseRange('s_pctv').forEach(v=>slCfgs.push({type:'pct',m:v}));
  const slA=slCfgs.filter(s=>s.type==='atr'),slP=slCfgs.filter(s=>s.type==='pct');
  let slCount=slA.length&&slP.length ? slA.length*slP.length+slA.length+slP.length : slCfgs.length||1;
  let tpCfgs=[];
  if($c('t_rr')) parseRange('t_rrv').forEach(v=>tpCfgs.push({type:'rr',m:v}));
  if($c('t_atr')) parseRange('t_atrv').forEach(v=>tpCfgs.push({type:'atr',m:v}));
  if($c('t_pct')) parseRange('t_pctv').forEach(v=>tpCfgs.push({type:'pct',m:v}));
  const activeTp=['rr','atr','pct'].filter(t=>tpCfgs.some(x=>x.type===t));
  let tpCount=activeTp.length>=2 ?
    tpCfgs.filter(t=>t.type===activeTp[0]).length*tpCfgs.filter(t=>t.type===activeTp[1]).length+tpCfgs.length :
    tpCfgs.length||1;
  const _ctAdxL=$c('f_adx')?parseRange('f_adxl'):[$n('f_adxl')||14];
  const _ctStw=$c('f_strend')?parseRange('f_stw'):[$n('f_stw')||10];
  const _ctConf=$c('f_confirm')?parseRange('f_confn'):[100];
  return pvLs.length*pvRs.length*atrPs.length*(maPs.length||1)*
    (adxTs.length||1)*(_ctAdxL.length||1)*rsiCount*(vfMs.length||1)*(mdMaxs.length||1)*
    slCount*tpCount*beCount*(trTrigs.length||1)*(trDists.length||1)*
    (timeBarsA.length||1)*(freshMaxs.length||1)*(wtTs.length||1)*
    (vsaMs.length||1)*(atrBoMs.length||1)*(revBarsA.length||1)*
    (revSkipA.length||1)*(revCooldownA.length||1)*
    (_ctConf.length||1)*(_ctStw.length||1);
}

function updatePreview() {
  if (!DATA) return;
  const t = calcTotal();
  $('prog').textContent = '≈ '+fmtNum(t)+' вар.';
}

async function runOpt() {
  if (!DATA) return;
  stopped=false; paused=false; results=[]; equities={};
  resultCache.clear();
  const _resultNames = new Set(); // П.1: дедупликация
  $('tb').innerHTML=''; $('bst').style.display='none'; $('eqc').style.display='none';
  // Show pause/stop, hide run
  $('rbtn').style.display='none';
  $('pbtn').style.display='inline-block'; $('pbtn').textContent='⏸ Пауза';
  $('pbtn').style.background=''; $('pbtn').style.borderColor=''; $('pbtn').style.color='';
  $('sbtn').style.display='inline-block';
  $('pbar').style.width='0%';
  _t0 = Date.now();

  const N=DATA.length;
  const closes=DATA.map(r=>r.c);
  const volumes=DATA.map(r=>r.v);

  // ── IS/OOS разделение ────────────────────────────────────────────────────
  // Если включено: оптимизация на IS, автопроверка на OOS после нахождения результата
  // IS = первые 70% данных, оптимизатор их не видит OOS = последние 30%
  // Три варианта OOS для перекрёстной проверки:
  //   forward:  IS=0..70%,  OOS=70..100%
  //   backward: IS=30..100%, OOS=0..30%
  //   middle:   IS=15..85%, OOS=0..15% + 85..100%
  const _useOOS = $c('c_oos');
  const _fullDATA = DATA; // сохраняем полный массив для восстановления после IS-бэктеста
  const _isN   = _useOOS ? Math.floor(N * 0.70) : N;
  const _isData = _useOOS ? DATA.slice(0, _isN) : DATA; // для forward IS
  // OOS срезы (для прогона после оптимизации)
  const _oosForwardData  = _useOOS ? DATA.slice(_isN) : null;                          // 70-100%
  const _oosBackwardData = _useOOS ? DATA.slice(0, Math.floor(N * 0.30)) : null;        // 0-30%
  const _oosMiddleData   = _useOOS ? [                                                  // 0-15% + 85-100%
    ...DATA.slice(0, Math.floor(N * 0.15)),
    ...DATA.slice(Math.floor(N * 0.85))
  ] : null;
  // backward IS = 30-100% (для backward OOS прогона нужен отдельный IS)
  const _isBackwardData  = _useOOS ? DATA.slice(Math.floor(N * 0.30)) : null;
  const _isMiddleData    = _useOOS ? DATA.slice(Math.floor(N * 0.15), Math.floor(N * 0.85)) : null;

  // Хелпер: прогнать cfg на срезе данных, возвращает {pnl, wr, n, dd} или null
  function _runOOS(slice, cfg) {
    if (!slice || slice.length < 50) return null;
    const origDATA = DATA;
    DATA = slice;
    try {
      const ind   = _calcIndicators(cfg);
      const btCfg = buildBtCfg(cfg, ind);
      return backtest(ind.pvLo, ind.pvHi, ind.atrArr, btCfg);
    } catch(e) { return null; }
    finally { DATA = origDATA; }
  }

  // Хелпер: добавить OOS результаты в cfg после нахождения результата
  function _attachOOS(cfg) {
    if (!_useOOS) return;
    // Запускаем бэктест на ПОЛНЫХ данных для непрерывной equity-кривой.
    // Делим её по _isN: нет проблемы прогрева индикаторов в OOS-части.
    const rFull = _runOOS(_fullDATA, cfg);
    cfg._oos = { forward: null, isPct: Math.round(_isN / N * 100) };
    if (!rFull || !rFull.eq || rFull.eq.length < _isN + 5) return;
    const eq       = rFull.eq;
    const N_eq     = eq.length;
    const splitIdx = Math.min(_isN - 1, N_eq - 2);
    const isGain   = eq[splitIdx];                       // IS PnL (0..splitIdx bars)
    const oosGain  = eq[N_eq - 1] - isGain;             // OOS PnL (splitIdx..end bars)
    const isRate   = splitIdx > 0 ? isGain / (splitIdx + 1) : 0;  // PnL per bar (IS)
    const oosBars  = N_eq - 1 - splitIdx;
    const oosRate  = oosBars > 0 ? oosGain / oosBars : 0;         // PnL per bar (OOS)
    // IS должен значимо вносить вклад, иначе retention не имеет смысла.
    // Частый ложный случай: стратегия с большой IS-просадкой восстанавливается
    // к ~0 к моменту split → isGain≈0 → oosRate/isRate→∞ → ложные тысячи %.
    const totalGain = eq[N_eq - 1];
    const minIsGain = totalGain > 0 ? Math.max(totalGain * 0.4, 0.1) : 0.1;
    let retention;
    if (isGain < minIsGain) {
      // IS не вырос значимо — стратегия НЕ является равномерно растущей
      retention = -1;
    } else if (oosGain <= 0) {
      // OOS убыточный: отрицательный retention, ограничен -2x
      retention = Math.max(oosRate / isRate, -2.0);
    } else {
      // Оба периода прибыльны: отношение скоростей роста, ограничено 2x сверху
      retention = Math.min(oosRate / isRate, 2.0);
    }
    cfg._oos.forward = { pnl: oosGain, retention, isGain, n: rFull.n, wr: rFull.wr, dd: rFull.dd };
  }
  const comm=$n('c_comm')||0.08;
  const spread=($n('c_spread')||0)/2; // спред делим на 2 стороны (как комиссия)
  const commTotal = comm + spread; // итоговая стоимость одной стороны сделки
  const minTrades=$n('c_mint')||30;
  const maxDD=$n('c_maxdd')||300;

  // Entry flags
  const usePv=$c('e_pv'),useEng=$c('e_eng'),usePin=$c('e_pin');
  const useBol=$c('e_bol'),useDon=$c('e_don'),useAtrBo=$c('e_atrbo');
  const useMaT=$c('e_mat'),useSqz=$c('e_sqz');

  // Trendline figures flags
  const useTLTouch=$c('e_tl_touch');
  const useTLBreak=$c('e_tl_break');
  const useFlag=$c('e_flag');
  const useTri=$c('e_tri');
  const useTrendFigures=useTLTouch||useTLBreak||useFlag||useTri;

  // Filter flags
  const useMa=$c('f_ma'),useAdx=$c('f_adx'),useRsi=$c('f_rsi');
  const useVolF=$c('f_volf'),useStruct=$c('f_struct'),useMaDist=$c('f_madist');
  const useCandleF=$c('f_candle'),useConsec=$c('f_consec');
  const useSTrend=$c('f_strend'),useFresh=$c('f_fresh');
  const useConfirm=$c('f_confirm');
  const confNArr=useConfirm?parseRange('f_confn'):[100];
  const confMatType=document.getElementById('f_conf_mat')?.value||'EMA';
  const confM=3; // не используется (оставлено для совместимости)
  const structHH=2; // убрано из USE — поле f_strpvl/f_strpvr используются

  // Volume filters
  const useVSA=HAS_VOLUME&&$c('f_vsa');
  const useLiq=HAS_VOLUME&&$c('f_liq');
  const useVolDir=HAS_VOLUME&&$c('f_vdir');
  const useClimaxExit=HAS_VOLUME&&$c('f_clx');
  const useWT=HAS_VOLUME&&$c('f_wt');
  const useFat=HAS_VOLUME&&$c('f_fat');

  // Exit flags
  const useBE=$c('x_be'),useTrail=$c('x_tr'),useRev=$c('x_rev');
  const revSrc=document.querySelector('.xmode-btn.active[id^="revsrc_"]')?.id?.replace('revsrc_','')||'same';
  const revSkipArr=useRev?parseRange('x_revskip'):[0];
  const revCooldownArr=useRev?parseRange('x_revcd'):[0];
  if(!revSkipArr.length) revSkipArr.push(0);
  if(!revCooldownArr.length) revCooldownArr.push(0);
  const useTime=$c('x_time'),usePartial=$c('x_part');
  const partBE=$c('x_partbe');

  // Ranges
  const pvLs=usePv?parseRange('e_pvl'):[5];
  const pvRs=usePv?parseRange('e_pvr'):[2];
  const atrPs=parseRange('c_atr');
  const maPs=useMa?parseRange('f_map'):[0];
  const adxTs=useAdx?parseRange('f_adxt'):[0];
  const vfMs=useVolF?parseRange('f_vfm'):[0];
  const mdMaxs=useMaDist?parseRange('f_madv'):[0];
  const wtThreshs=useWT?parseRange('f_wtt'):[0];
  const freshMaxs=useFresh?parseRange('f_freshm'):[20];
  const beOffs=useBE?parseRange('x_beo'):[0];
  if(!beOffs.length) beOffs.push(0);
  const trTrigs=useTrail?parseRange('x_trt'):[1.5];
  const trDists=useTrail?parseRange('x_trd'):[1.0];
  const timeBarsArr=useTime?parseRange('x_timeb'):[50];

  // SL configs
  let slCfgs=[];
  if ($c('s_atr')) parseRange('s_atrv').forEach(v=>slCfgs.push({type:'atr',m:v}));
  if ($c('s_pct')) parseRange('s_pctv').forEach(v=>slCfgs.push({type:'pct',m:v}));
  // Combinations AND/OR: generate pairs if both enabled
  let slPairs=[];
  const slATRs=slCfgs.filter(s=>s.type==='atr');
  const slPCTs=slCfgs.filter(s=>s.type==='pct');
  if (slATRs.length&&slPCTs.length) {
    // Both enabled: combine each ATR with each PCT
    slATRs.forEach(a=>{ slPCTs.forEach(p=>{ slPairs.push({a,p,combo:true}); }); });
    // Also single
    slATRs.forEach(a=>slPairs.push({a,p:null,combo:false}));
    slPCTs.forEach(p=>slPairs.push({a:null,p,combo:false}));
  } else {
    slCfgs.forEach(s=>{
      if(s.type==='atr') slPairs.push({a:s,p:null,combo:false});
      else slPairs.push({a:null,p:s,combo:false});
    });
  }
  if(slPairs.length===0) slPairs=[{a:{type:'atr',m:1.5},p:null,combo:false}];

  // TP configs — same approach
  let tpCfgs=[];
  if ($c('t_rr')) parseRange('t_rrv').forEach(v=>tpCfgs.push({type:'rr',m:v}));
  if ($c('t_atr')) parseRange('t_atrv').forEach(v=>tpCfgs.push({type:'atr',m:v}));
  if ($c('t_pct')) parseRange('t_pctv').forEach(v=>tpCfgs.push({type:'pct',m:v}));
  let tpPairs=[];
  const tpTypes=['rr','atr','pct'];
  const tpByType={rr:tpCfgs.filter(t=>t.type==='rr'),atr:tpCfgs.filter(t=>t.type==='atr'),pct:tpCfgs.filter(t=>t.type==='pct')};
  const activeTpTypes=tpTypes.filter(t=>tpByType[t].length>0);
  if(activeTpTypes.length>=2) {
    // Combinations of first two types + singles
    const t1=tpByType[activeTpTypes[0]], t2=tpByType[activeTpTypes[1]];
    t1.forEach(a=>{ t2.forEach(b=>{ tpPairs.push({a,b,combo:true}); }); });
    tpCfgs.forEach(t=>tpPairs.push({a:t,b:null,combo:false}));
  } else {
    tpCfgs.forEach(t=>tpPairs.push({a:t,b:null,combo:false}));
  }
  if(tpPairs.length===0) tpPairs=[{a:{type:'rr',m:2},b:null,combo:false}];

  // Fixed params — read as ranges; single value = no extra loop overhead
  const pinRatio=$n('e_pinr')||2;
  const beTrigs=useBE?parseRange('x_bet'):[1];
  if(!beTrigs.length) beTrigs.push(1);
  const revBarsArr=useRev?(()=>{const _a=parseRange('x_revb');return _a.length?_a:[2];})():[2];
  const partRR=$n('x_partr')||1;
  const partPct=$n('x_partp')||50;
  const rsiOS=parseRange('f_rsios');
  const rsiOB=parseRange('f_rsiob');
  const consecMax=$n('f_concm')||5;
  const sTrendWin=$n('f_stw')||10;
  const structLen=$n('f_strl')||20;
  const strPvL=$n('f_strpvl')||5;
  const strPvR=$n('f_strpvr')||2;
  // SL Pivot
  const useSLPiv=$c('s_piv');
  const slPivOff=$n('s_pivoff')||0.2;
  const slPivMax=$n('s_pivmax')||3.0;
  const slPivL=$n('s_pivl')||3;
  const slPivR=$n('s_pivr')||1;
  const slPivTrail=$c('s_pivtr');
  const vsaMult=$n('f_vsam')||1.5;
  const vsaP=$n('f_vsap')||20;
  const liqMin=$n('f_liqm')||0.5;
  const volDirP=$n('f_vdirp')||10;
  const clxVolMult=$n('f_clxm')||3.0;
  const clxBodyMult=$n('f_clxb')||1.5;
  const wtN=$n('f_wtn')||11;
  const wtVolW=$n('f_wtv')||3.5;
  const wtBodyW=$n('f_wtb')||3.5;
  const wtDistW=2.75;
  const wtUseDist=$c('f_wtdist');
  const fatConsec=$n('f_fatc')||6;
  const fatVolDrop=$n('f_fatv')||0.7;
  const candleMin=$n('f_cmin')||0.3;
  const candleMax=$n('f_cmax')||3.0;
  // ── New range arrays — only iterated if user typed a range (e.g. "14:20:2") ──
  const _adxLArr   = useAdx    ? parseRange('f_adxl') : [$n('f_adxl')||14];
  const _sTrendArr = useSTrend ? parseRange('f_stw')  : [sTrendWin];

  // RSI combos
  const rsiOSArr=useRsi?parseRange('f_rsios'):[30];
  const rsiOBArr=useRsi?parseRange('f_rsiob'):[70];
  const rsiPairs=[];
  if(useRsi) { rsiOSArr.forEach(os=>{ rsiOBArr.forEach(ob=>{ if(os<ob) rsiPairs.push({os,ob}); }); }); }
  else rsiPairs.push({os:30,ob:70});

  // Precompute indicators
  const pvCache={},atrCache={},atrAvgCache={},maCache={};
  // adxArr default (used when adxL not ranging); per-adxL computed in loop via adxCache
  const adxCache={};
  const adxArr=useAdx?(()=>{const l=_adxLArr[0];if(!adxCache[l])adxCache[l]=calcADX(l);return adxCache[l];})():null;
  const structData=(useStruct||useSTrend||useFresh||useMaDist||useMa)?null:null;
  let structBull=null,structBear=null;
  if(useStruct) {
    // Pivot-based структура как в Pine USE:
    // pivothigh/pivotlow → hi1>hi2 && lo1>lo2 = бычья структура
    const N2=DATA.length; structBull=new Uint8Array(N2); structBear=new Uint8Array(N2);
    const pvL=strPvL, pvR=strPvR;
    let pvHiArr=[], pvLoArr=[];
    // Вычисляем pivot high и low
    for(let i=pvL;i<N2-pvR;i++) {
      let isH=true, isL=true;
      for(let j=1;j<=pvL;j++) { if(DATA[i].h<=DATA[i-j].h){isH=false;break;} }
      if(isH) for(let j=1;j<=pvR;j++) { if(DATA[i].h<=DATA[i+j].h){isH=false;break;} }
      for(let j=1;j<=pvL;j++) { if(DATA[i].l>=DATA[i-j].l){isL=false;break;} }
      if(isL) for(let j=1;j<=pvR;j++) { if(DATA[i].l>=DATA[i+j].l){isL=false;break;} }
      if(isH) pvHiArr.push({idx:i,v:DATA[i].h});
      if(isL) pvLoArr.push({idx:i,v:DATA[i].l});
    }
    // Для каждого бара (с учётом задержки pvR) определяем структуру
    let hi1=NaN,hi2=NaN,lo1=NaN,lo2=NaN;
    let pHi=0,pLo=0;
    for(let i=pvL+pvR;i<N2;i++) {
      // Добавляем новые пивоты доступные на баре i
      while(pHi<pvHiArr.length && pvHiArr[pHi].idx+pvR<=i) {
        hi2=hi1; hi1=pvHiArr[pHi].v; pHi++;
      }
      while(pLo<pvLoArr.length && pvLoArr[pLo].idx+pvR<=i) {
        lo2=lo1; lo1=pvLoArr[pLo].v; pLo++;
      }
      if(!isNaN(hi1)&&!isNaN(hi2)&&!isNaN(lo1)&&!isNaN(lo2)) {
        if(hi1>hi2&&lo1>lo2) structBull[i]=1; // HH+HL = бычья
        if(hi1<hi2&&lo1<lo2) structBear[i]=1; // LH+LL = медвежья
      }
    }
  }

  // SL Pivot — предрасчёт pivot lo/hi массивов
  let pivSLLo=null, pivSLHi=null;
  if(useSLPiv) {
    const r=calcPivotLoHi(DATA, slPivL, slPivR);
    pivSLLo=r.lo; pivSLHi=r.hi;
  }

  let bbB=null,bbD=null,bbWarm=0;
  if(useBol) {
    const bl=$n('e_bbl')||20,bm=$n('e_bbm')||2;
    bbWarm=bl;
    bbB=calcSMA(closes,bl); bbD=new Float64Array(N);
    for(let i=bl-1;i<N;i++) {
      const mean=bbB[i];
      let s=0;
      for(let j=i-bl+1;j<=i;j++) s+=(closes[j]-mean)**2;
      bbD[i]=Math.sqrt(s/bl)*bm;
    }
  }
  let donH=null,donL=null;
  if(useDon) {
    const dl=$n('e_donl')||20; donH=new Float64Array(N);donL=new Float64Array(N);
    // donH[i] = max high за dl баров ДО i (не включая i и i-1)
    // Сигнал: prev.h > donH[i] означает пробой предыдущего максимума
    for(let i=dl+2;i<N;i++) {
      let mx=-Infinity,mn=Infinity;
      // берём [i-dl-1 .. i-2] — исключаем prev (i-1) из диапазона сравнения
      for(let j=i-dl-1;j<=i-2;j++) {if(DATA[j].h>mx)mx=DATA[j].h;if(DATA[j].l<mn)mn=DATA[j].l;}
      donH[i]=mx;donL[i]=mn;
    }
  }
  let atrBoMA=null,atrBoATR2=null;
  const atrBoMults=useAtrBo?parseRange('e_atbm'):[2.0];
  if(useAtrBo) {
    const al=$n('e_atbl')||14;
    atrBoMA=calcEMA(closes,al); atrBoATR2=calcRMA_ATR(al);
  }
  let matMA=null,matZone=0;
  if(useMaT) {
    const mp=$n('e_matp')||20,mt=$v('e_matt');
    matMA=calcMA(closes,mp,mt); matZone=$n('e_matz')||0.2;
  }
  let sqzOn=null,sqzCount=null;
  if(useSqz) {
    const sbl=$n('e_sqbl')||20,skm=$n('e_sqkm')||1.5;
    const bbBasis=calcSMA(closes,sbl);
    const bbDevSqz=new Float64Array(N);
    for(let i=sbl-1;i<N;i++) {
      let s=0;for(let j=i-sbl+1;j<=i;j++) s+=(closes[j]-bbBasis[i])**2;
      bbDevSqz[i]=Math.sqrt(s/sbl)*2;
    }
    const kcATR=calcRMA_ATR(sbl);
    const kcMA=calcEMA(closes,sbl);
    sqzOn=new Uint8Array(N); sqzCount=new Int32Array(N);
    for(let i=sbl;i<N;i++) {
      const bbU=bbBasis[i]+bbDevSqz[i],bbL=bbBasis[i]-bbDevSqz[i];
      const kcU=kcMA[i]+kcATR[i]*skm,kcL=kcMA[i]-kcATR[i]*skm;
      sqzOn[i]=(bbL>kcL&&bbU<kcU)?1:0;
      sqzCount[i]=sqzOn[i]?(sqzCount[i-1]||0)+1:0;
    }
  }
  const sqzMinBars=$n('e_sqzb')||1;
  const volAvgArr=HAS_VOLUME?calcVolSMA(vsaP):null;
  const bodyAvgArr=HAS_VOLUME?calcBodySMA(20):null;

  // ── Trendline Figures Precompute ─────────────────────────────
  // Все четыре паттерна вычисляются один раз перед основным циклом.
  // tfSigL[i] / tfSigS[i] — бит-флаг: какие именно фигуры дали сигнал
  // бит 0 = TL-touch, бит 1 = TL-break, бит 2 = flag, бит 3 = triangle
  const TF_TOUCH=1, TF_BREAK=2, TF_FLAG=4, TF_TRI=8;
  let tfSigL=null, tfSigS=null;

  if (useTrendFigures) {
    const tlPvL = $n('e_tl_pvl')||5;
    const tlPvR = $n('e_tl_pvr')||3;
    const tlZone = ($n('e_tl_zone')||0.3) / 100;
    const flagImpMin = $n('e_flag_imp')||2.0;
    const flagMaxBars = $n('e_flag_bars')||20;
    const flagRetrace = $n('e_flag_ret')||0.618;
    const atrBase = calcRMA_ATR(14); // ATR для расчёта импульса флага

    tfSigL = new Uint8Array(N);
    tfSigS = new Uint8Array(N);

    // Вычисляем pivot highs/lows для трендовых линий
    const tfPvLo = calcPivotLow(tlPvL, tlPvR);
    const tfPvHi = calcPivotHigh(tlPvL, tlPvR);

    // Запоминаем последние два пивота для построения линий
    let sl1b=0,sl1v=0,sl2b=0,sl2v=0; // support line pivot bars/vals
    let rl1b=0,rl1v=0,rl2b=0,rl2v=0; // resistance line

    // Флаг-состояние
    let flagActive=false, flagBull=false;
    let flagStartBar=0, flagImpHi=0, flagImpLo=0;

    const warm = Math.max(tlPvL+tlPvR+2, 20);

    for (let i=warm; i<N; i++) {
      const bar=DATA[i], prev=DATA[i-1];

      // Обновляем пивоты (они подтверждаются с задержкой tlPvR)
      if (tfPvLo[i]===1) {
        sl2b=sl1b; sl2v=sl1v;
        sl1b=i-tlPvR; sl1v=DATA[i-tlPvR].l;
      }
      if (tfPvHi[i]===1) {
        rl2b=rl1b; rl2v=rl1v;
        rl1b=i-tlPvR; rl1v=DATA[i-tlPvR].h;
      }

      // ── Уровень линии поддержки/сопротивления на баре i
      let supLevel=NaN, resLevel=NaN;
      if (sl1b>0 && sl2b>0 && sl1b!==sl2b) {
        const slope=(sl1v-sl2v)/(sl1b-sl2b);
        supLevel=sl1v+slope*(i-sl1b);
      }
      if (rl1b>0 && rl2b>0 && rl1b!==rl2b) {
        const slope=(rl1v-rl2v)/(rl1b-rl2b);
        resLevel=rl1v+slope*(i-rl1b);
      }

      // ── TL Touch & Break ────────────────────────────────────
      // Соглашение: сигнал пишем на бар i — вход на открытии бара i.
      // Касание:  бар i-1 коснулся линии своим low/high — вход сразу без подтверждения.
      // Пробой:   бар i-1 закрылся за линией, бар i-2 был по эту сторону.
      if (!isNaN(supLevel) && supLevel>0) {
        const zone=supLevel*tlZone;
        // Касание поддержки — лонг
        if (useTLTouch && DATA[i-1].l<=supLevel+zone && DATA[i-1].l>=supLevel-zone)
          tfSigL[i] |= TF_TOUCH;
        // Пробой поддержки вверх — лонг
        if (useTLBreak && i>=2 && DATA[i-1].c>supLevel+zone && DATA[i-2].c<=supLevel+zone)
          tfSigL[i] |= TF_BREAK;
        // Пробой поддержки вниз — шорт
        if (useTLBreak && i>=2 && DATA[i-1].c<supLevel-zone && DATA[i-2].c>=supLevel-zone)
          tfSigS[i] |= TF_BREAK;
      }
      if (!isNaN(resLevel) && resLevel>0) {
        const zone=resLevel*tlZone;
        // Касание сопротивления — шорт
        if (useTLTouch && DATA[i-1].h>=resLevel-zone && DATA[i-1].h<=resLevel+zone)
          tfSigS[i] |= TF_TOUCH;
        // Пробой сопротивления вверх — лонг
        if (useTLBreak && i>=2 && DATA[i-1].c>resLevel+zone && DATA[i-2].c<=resLevel+zone)
          tfSigL[i] |= TF_BREAK;
        // Пробой сопротивления вниз — шорт
        if (useTLBreak && i>=2 && DATA[i-1].c<resLevel-zone && DATA[i-2].c>=resLevel-zone)
          tfSigS[i] |= TF_BREAK;
      }

      // ── Flag ────────────────────────────────────────────────
      if (useFlag) {
        const atr=atrBase[i]||0.001;
        // Начало импульса: тело свечи > flagImpMin×ATR
        if (!flagActive) {
          const bullImp=(DATA[i-1].h-DATA[i-6>0?i-6:0].l)>atr*flagImpMin && prev.c>prev.o;
          const bearImp=(DATA[i-6>0?i-6:0].h-DATA[i-1].l)>atr*flagImpMin && prev.c<prev.o;
          if (bullImp) {
            flagActive=true; flagBull=true; flagStartBar=i;
            flagImpHi=prev.h; flagImpLo=DATA[Math.max(i-6,0)].l;
          } else if (bearImp) {
            flagActive=true; flagBull=false; flagStartBar=i;
            flagImpHi=DATA[Math.max(i-6,0)].h; flagImpLo=prev.l;
          }
        }
        if (flagActive) {
          const elapsed=i-flagStartBar;
          const impRange=Math.max(flagImpHi-flagImpLo,0.0000001);
          const retPct=flagBull
            ?(flagImpHi-Math.min(bar.l,prev.l))/impRange
            :(Math.max(bar.h,prev.h)-flagImpLo)/impRange;

          if (retPct>flagRetrace||elapsed>flagMaxBars) {
            flagActive=false; // слишком глубокий откат или устарел
          } else if (elapsed>=2) {
            // Пробой консолидации в направлении импульса
            if (flagBull && bar.c>flagImpHi*(1-tlZone)) {
              tfSigL[i] |= TF_FLAG;
              flagActive=false;
            } else if (!flagBull && bar.c<flagImpLo*(1+tlZone)) {
              tfSigS[i] |= TF_FLAG;
              flagActive=false;
            }
          }
        }
      }

      // ── Triangle ────────────────────────────────────────────
      if (useTri && sl1b>0 && sl2b>0 && rl1b>0 && rl2b>0) {
        const resFalling=rl1v<rl2v;
        const supRising=sl1v>sl2v;
        const symTri=resFalling&&supRising;
        const ascTri=Math.abs(rl1v-rl2v)/Math.max(rl1v,0.0001)<0.005&&supRising;
        const descTri=resFalling&&Math.abs(sl1v-sl2v)/Math.max(sl1v,0.0001)<0.005;
        if ((symTri||ascTri||descTri) && !isNaN(resLevel) && !isNaN(supLevel)) {
          const zone2=resLevel*tlZone;
          // Пробой вверх
          if (prev.c>resLevel+zone2 && DATA[i-2] && DATA[i-2].c<=resLevel+zone2) {
            tfSigL[i] |= TF_TRI;
          }
          // Пробой вниз
          if (prev.c<supLevel-supLevel*tlZone && DATA[i-2] && DATA[i-2].c>=supLevel-supLevel*tlZone) {
            tfSigS[i] |= TF_TRI;
          }
        }
      }
    }
  }
  // ── End Trendline Figures ─────────────────────────────────────

  // Count combos for progress
  const vsaMs=useVSA?parseRange('f_vsam'):[0];
  // Точное количество валидных BE комбинаций (beOff < beTrig)
  let beValidCount=1;
  if(useBE){let v=0;beTrigs.forEach(t=>{beOffs.forEach(o=>{if(o<t)v++;});});beValidCount=v||1;}
  let total=pvLs.length*pvRs.length*atrPs.length*(maPs.length||1)*
    (adxTs.length||1)*(rsiPairs.length||1)*(vfMs.length||1)*(mdMaxs.length||1)*
    slPairs.length*tpPairs.length*beValidCount*(trTrigs.length||1)*(trDists.length||1)*
    (timeBarsArr.length||1)*(freshMaxs.length||1)*(wtThreshs.length||1)*
    (vsaMs.length||1)*(atrBoMults.length||1)*(confNArr.length||1)*(revBarsArr.length||1)*
    (revSkipArr.length||1)*(revCooldownArr.length||1)*
    (_adxLArr.length||1)*(_sTrendArr.length||1);

  // Monte Carlo: shuffle and limit
  let mcTotal = total;
  let _mcIndices = null; // для MC — предвычисленная случайная последовательность (legacy, не используется)
  let _mcSampled = null; // новый MC: массив случайных индексов для прямого декодирования

  if (optMode === 'mc') {
    mcTotal = Math.min($n('mc_n')||5000, total);
    total = mcTotal;
    // Генерируем Set случайных индексов (без повторений)
    // Используем Fisher-Yates на диапазоне [0, realTotal)
    const realTotal = pvLs.length*pvRs.length*atrPs.length*(maPs.length||1)*
      (adxTs.length||1)*(rsiPairs.length||1)*(vfMs.length||1)*(mdMaxs.length||1)*
      slPairs.length*tpPairs.length*beValidCount*(trTrigs.length||1)*(trDists.length||1)*
      (timeBarsArr.length||1)*(freshMaxs.length||1)*(wtThreshs.length||1)*
      (vsaMs.length||1)*(atrBoMults.length||1)*(confNArr.length||1)*(revBarsArr.length||1)*
    (revSkipArr.length||1)*(revCooldownArr.length||1)*
    (_adxLArr.length||1)*(_sTrendArr.length||1);
    // ── ИДЕЯ 7: Latin Hypercube Sampling — равномерное покрытие пространства
    // Делим [0, realTotal) на mcTotal равных страт, из каждой берём 1 случайную точку.
    // Гарантирует что каждая зона пространства представлена, нет кластеризации.
    // LHS: делим пространство на mcTotal страт, из каждой берём случайную точку
    setMcPhase('🔀 LHS-генерация ' + mcTotal + ' из ' + realTotal.toExponential(1) + '…');
    _mcSampled = new Array(mcTotal);
    if (realTotal <= mcTotal) {
      for (let i = 0; i < realTotal; i++) _mcSampled[i] = i;
      // Заполняем оставшиеся случайными (если mcTotal > realTotal)
      for (let i = realTotal; i < mcTotal; i++) _mcSampled[i] = Math.floor(Math.random() * realTotal);
    } else {
      const stratSize = realTotal / mcTotal;
      for (let i = 0; i < mcTotal; i++) {
        const lo = Math.floor(i * stratSize);
        const hi = Math.floor((i + 1) * stratSize) - 1;
        _mcSampled[i] = lo + Math.floor(Math.random() * (hi - lo + 1));
      }
      // Fisher-Yates shuffle
      for (let i = mcTotal - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [_mcSampled[i], _mcSampled[j]] = [_mcSampled[j], _mcSampled[i]];
      }
    }
    setMcPhase('⚡ Перебор ' + mcTotal + ' из ' + realTotal.toExponential(1) + '…');
    if (stopped) return;
  }
  let _iterCount = 0; // глобальный счётчик итераций для MC

  // Фазовый статус для MC
  function setMcPhase(msg) {
    const el = $('mc-phase');
    if (!el) return;
    if (msg) { el.style.display='inline'; el.textContent = msg; }
    else { el.style.display='none'; el.textContent=''; }
  }
  if (optMode === 'mc') {
    // Предупреждение: если пространство меньше N — каждый запуск одинаков
    const _mcRealTotal = pvLs.length*pvRs.length*atrPs.length*(maPs.length||1)*
      (adxTs.length||1)*(rsiPairs.length||1)*(vfMs.length||1)*(mdMaxs.length||1)*
      slPairs.length*tpPairs.length*beValidCount*(trTrigs.length||1)*(trDists.length||1)*
      (timeBarsArr.length||1)*(freshMaxs.length||1)*(wtThreshs.length||1)*
      (vsaMs.length||1)*(atrBoMults.length||1)*(confNArr.length||1)*(revBarsArr.length||1)*
    (revSkipArr.length||1)*(revCooldownArr.length||1)*
    (_adxLArr.length||1)*(_sTrendArr.length||1);
    const _mcEffective = Math.min(mcTotal, _mcRealTotal);
    if (_mcRealTotal <= mcTotal) {
      setMcPhase('⚠️ Пространство (' + _mcRealTotal + ') < N (' + mcTotal + ') — полный перебор, результаты одинаковы каждый раз');
    } else {
      setMcPhase('🔀 Генерация выборки ' + mcTotal + ' из ' + _mcRealTotal + '…');
    }
  }

  let done=0;
  updateETA(0, total, 0);

  // ── _ipCombos: flat enumeration of new iterable inner params ─────────────
  // Rules:
  //   • Only params where the user typed a range (len > 1) add iterations
  //   • Single-value params contribute no overhead — just provide their default
  //   • This block runs ONCE before the main loop (not inside it!)
  {
    // Collect [name, array] only for params that actually vary
    const _allIp = [
      ['adxL',     _adxLArr],
      ['sTrendWin',_sTrendArr],
      ['confN',    confNArr.length ? confNArr : [2]],
      ['revBars',  revBarsArr],
      ['revSkip',  revSkipArr],
      ['revCooldown', revCooldownArr],
    ];
    // Defaults for all params (first element of each array)
    window._ipDef = Object.fromEntries(_allIp.map(([n,a])=>[n,a[0]]));
    // Only build cross-product for params with >1 value
    const _multi = _allIp.filter(([,a])=>a.length>1);
    let combos = [{}];
    for (const [n,arr] of _multi) {
      const next=[];
      for (const c of combos) for (const v of arr) next.push({...c,[n]:v});
      combos=next;
    }
    window._ipCombos = combos.length ? combos : [{}];
  }

  // _mcDims/_mcDimSizes — общие для MC и TPE, строятся ПОСЛЕ _ipCombos
  const _mcDims = [
    pvLs, pvRs, atrPs, (maPs.length?maPs:[maPs[0]||0]),
    (adxTs.length?adxTs:[0]), rsiPairs, (vfMs.length?vfMs:[0]),
    (mdMaxs.length?mdMaxs:[0]), (freshMaxs.length?freshMaxs:[20]),
    (wtThreshs.length?wtThreshs:[0]), (vsaMs.length?vsaMs:[0]),
    (atrBoMults.length?atrBoMults:[2.0]), slPairs, tpPairs,
    beOffs, beTrigs, trTrigs, trDists, (timeBarsArr.length?timeBarsArr:[50]),
    window._ipCombos
  ];
  const _mcDimSizes = _mcDims.map(d => d.length || 1);

  // ══════════════════════════════════════════════════════════════════════════
  // TPE — Tree-structured Parzen Estimator
  // Алгоритм:
  //   1. Фаза разведки: mcTotal*0.25 случайных точек (LHS) → строим историю
  //   2. Фаза эксплуатации: для каждой размерности строим два KDE:
  //      l(x) — плотность хороших точек (топ γ%), g(x) — плотность остальных
  //      Следующая точка = argmax [ l(x)/g(x) ] по кандидатам
  //   3. Повторяем до исчерпания бюджета
  // ══════════════════════════════════════════════════════════════════════════
  function _tpeSampleDim(goodVals, badVals, dimArr, nCandidates) {
    if (goodVals.length < 3) return Math.floor(Math.random() * dimArr.length);

    // Гистограмма вместо KDE — 13× быстрее, статистически достаточно
    const nBins = Math.min(dimArr.length, 10);
    const goodHist = new Float32Array(nBins);
    const badHist  = new Float32Array(nBins);
    for (const v of goodVals) goodHist[Math.min(nBins-1, v*nBins|0)]++;
    for (const v of badVals)  badHist [Math.min(nBins-1, v*nBins|0)]++;
    const gSum = goodVals.length + nBins; // Laplace smoothing
    const bSum = (badVals.length || 1) + nBins;

    const candidates = dimArr.length <= nCandidates
      ? Array.from({length:dimArr.length}, (_,i) => i)
      : Array.from({length:nCandidates}, () => Math.floor(Math.random()*dimArr.length));

    let bestRatio = -Infinity, bestIdx = 0;
    for (const idx of candidates) {
      const x   = idx / Math.max(dimArr.length-1, 1);
      const bin = Math.min(nBins-1, x*nBins|0);
      const ratio = (goodHist[bin]+1)/gSum / ((badHist[bin]+1)/bSum);
      if (ratio > bestRatio) { bestRatio = ratio; bestIdx = idx; }
    }
    return bestIdx;
  }

  // MAIN LOOP
  let _mcDone = false; // флаг досрочного выхода для MC/stop

  // ── MC РЕЖИМ: прямой цикл по предвычисленным индексам ──────────────────────
  if (optMode === 'mc' && _mcSampled) {
    const _mType = $v('f_mat') || 'EMA';
    for (let _mi = 0; _mi < mcTotal && !stopped; _mi++) {
      // Декодируем индекс в параметры через деление с остатком
      let _idx = _mcSampled[_mi];
      const _dims = _mcDims;
      const _dsz  = _mcDimSizes;
      const _di = new Array(_dims.length);
      for (let d = _dims.length - 1; d >= 0; d--) {
        _di[d] = _idx % _dsz[d];
        _idx = Math.floor(_idx / _dsz[d]);
      }
      let _d = 0;
      const pvL      = _dims[_d][_di[_d++]];
      const pvR      = _dims[_d][_di[_d++]];
      const atrP     = _dims[_d][_di[_d++]];
      const maP      = _dims[_d][_di[_d++]];
      const adxT     = _dims[_d][_di[_d++]];
      const rsiPair  = _dims[_d][_di[_d++]];
      const vfM      = _dims[_d][_di[_d++]];
      const mdMax    = _dims[_d][_di[_d++]];
      const freshMax = _dims[_d][_di[_d++]];
      const wtT      = _dims[_d][_di[_d++]];
      const vsaM     = _dims[_d][_di[_d++]];
      const atrBoM   = _dims[_d][_di[_d++]];
      const slPair   = _dims[_d][_di[_d++]];
      const tpPair   = _dims[_d][_di[_d++]];
      const beOff    = _dims[_d][_di[_d++]];
      const beTrig   = _dims[_d][_di[_d++]];
      const trTrig   = _dims[_d][_di[_d++]];
      const trDist   = _dims[_d][_di[_d++]];
      const timeBars = _dims[_d][_di[_d++]];
      const _ip      = _dims[_d][_di[_d++]];
      const adxL        = _ip.adxL        ?? window._ipDef.adxL;
      const sTrendWin   = _ip.sTrendWin   ?? window._ipDef.sTrendWin;
      const confN       = _ip.confN       ?? window._ipDef.confN;
      const revBars     = _ip.revBars     ?? window._ipDef.revBars;
      const revSkip     = _ip.revSkip     ?? window._ipDef.revSkip;
      const revCooldown = _ip.revCooldown ?? window._ipDef.revCooldown;

      // Пропускаем невалидные BE комбинации
      if (useBE && beOff >= beTrig) { continue; }

      // Кэши индикаторов
      const pk = pvL+'_'+pvR;
      if (!pvCache[pk]) pvCache[pk] = {lo:calcPivotLow(pvL,pvR), hi:calcPivotHigh(pvL,pvR)};
      if (!atrCache[atrP]) atrCache[atrP] = calcRMA_ATR(atrP);
      if (!atrAvgCache[atrP]) atrAvgCache[atrP] = calcSMA(atrCache[atrP], 50);
      const atrAvg = atrAvgCache[atrP];
      const mk = _mType+'_'+maP;
      let maArr = null;
      if (maP > 0) { if (!maCache[mk]) maCache[mk] = calcMA(closes, maP, _mType); maArr = maCache[mk]; }
      let wtScores = null;
      if (useWT && maArr) wtScores = calcWeightedTrend(maArr, atrCache[atrP], wtN, wtVolW, wtBodyW, wtDistW, wtUseDist);
      let confMAArr = null;
      if (useConfirm && confN > 0) {
        const ck = confN+'_'+(confMatType||'EMA');
        if (!maCache[ck]) maCache[ck] = calcMA(closes, confN, confMatType||'EMA');
        confMAArr = maCache[ck];
      }
      if (!adxCache[adxL]) adxCache[adxL] = calcADX(adxL);

      const btCfg = {
        comm: commTotal,
        usePivot:usePv,pvLo:pvCache[pk].lo,pvHi_:pvCache[pk].hi,
        useEngulf:useEng,usePinBar:usePin,pinRatio,
        useBoll:useBol,bbB:(()=>{const bl=$n('e_bbl')||20;const b=calcSMA(closes,bl);const d=new Float64Array(DATA.length);for(let i=bl-1;i<DATA.length;i++){let s=0;const m=b[i];for(let j=i-bl+1;j<=i;j++)s+=(closes[j]-m)**2;d[i]=Math.sqrt(s/bl)*($n('e_bbm')||2);}return b;})(),
        useDonch:useDon,
        useAtrBo,atrBoMult:atrBoM,
        useMaTouch:useMaT,matMA:useMaT?calcMA(closes,$n('e_matp')||20,$v('e_matt')||'EMA'):null,matZone:$n('e_matz')||0.2,
        useSqueeze:useSqz,sqzMinBars,
        useTLTouch:false,useTLBreak:false,useFlag:false,useTri:false,tfSigL:null,tfSigS:null,
        hasSLA:!!(slPair.a),slMult:slPair.a?slPair.a.m:0,hasSLB:!!(slPair.p),slPctMult:slPair.p?slPair.p.m:0,slLogic,
        hasTPA:!!(tpPair.a),tpMult:tpPair.a?tpPair.a.m:0,tpMode:tpPair.a?tpPair.a.type:'rr',
        hasTPB:!!(tpPair.b),tpMultB:tpPair.b?tpPair.b.m:0,tpModeB:tpPair.b?tpPair.b.type:'rr',tpLogic,
        useBE,beTrig,beOff,
        useTrail,trTrig,trDist,
        useRev,revBars,revMode,revAct,revSrc,revSkip,revCooldown,
        useTime,timeBars,timeMode,
        usePartial,partRR,partPct,partBE,
        useClimax:useClimaxExit&&HAS_VOLUME,clxVolMult,clxBodyMult,clxMode,
        useMA:maP>0,maArr,
        useADX:useAdx&&adxT>0,adxArr:adxCache[adxL],adxThresh:adxT,adxLen:adxL,
        useRSI:useRsi,rsiArr:useRsi?calcRSI(14):null,rsiOS:rsiPair.os,rsiOB:rsiPair.ob,
        useVolF:useVolF&&vfM>0,atrAvg,volFMult:vfM,
        useStruct,structBull,structBear,strPvL,strPvR,
        useSLPiv,slPivOff,slPivMax,slPivL,slPivR,pivSLLo,pivSLHi,
        useConfirm:useConfirm&&confN>0,confN,confMatType,maArrConfirm:confMAArr,
        useMaDist:useMaDist&&mdMax>0,maDistMax:mdMax,
        useCandleF,candleMin,candleMax,
        useConsec,consecMax,
        useSTrend,sTrendWin,
        useFresh:useFresh&&freshMax>0,freshMax,
        useVSA:useVSA&&vsaM>0,vsaMult:vsaM,volAvg:volAvgArr,
        useLiq,liqMin,
        useVolDir,volDirPeriod:volDirP,
        useWT:useWT&&wtT>0,wtScores,wtThresh:wtT,
        useFat,fatConsec,fatVolDrop,
        bodyAvg:bodyAvgArr,
        start:Math.max(maP||0,50)+2,
        pruning:false, maxDDLimit:maxDD
      };

      if (_useOOS) DATA = _isData;
      let r;
      try { r = backtest(pvCache[pk].lo, pvCache[pk].hi, atrCache[atrP], btCfg); }
      finally { if (_useOOS) DATA = _fullDATA; }
      done++;
      if (r && r.n >= minTrades && r.dd <= maxDD) {
        const pdd = r.dd>0 ? r.pnl/r.dd : 0;
        const sig = _calcStatSig(r);
        const gt = _calcGTScore(r);
        let slDesc = slPair.combo ? `SL(ATR×${slPair.a.m}${slLogic==='or'?'|OR|':'|AND|'}${slPair.p.m}%)` : slPair.a ? `SL×${slPair.a.m}ATR` : `SL${slPair.p.m}%`;
        let tpDesc = tpPair.combo ? (()=>{const n1=tpPair.a.type==='rr'?`RR${tpPair.a.m}`:tpPair.a.type==='atr'?`TP×${tpPair.a.m}ATR`:`TP${tpPair.a.m}%`;const n2=tpPair.b.type==='rr'?`RR${tpPair.b.m}`:tpPair.b.type==='atr'?`TP×${tpPair.b.m}ATR`:`TP${tpPair.b.m}%`;return `TP(${n1}${tpLogic==='or'?'|OR|':'|AND|'}${n2})`;})() : tpPair.a ? (tpPair.a.type==='rr'?`RR×${tpPair.a.m}`:tpPair.a.type==='atr'?`TP×${tpPair.a.m}ATR`:`TP${tpPair.a.m}%`) : '';
        const name = buildName(btCfg, pvL, pvR, slDesc, tpDesc, {}, {maP, maType:_mType, stw:sTrendWin, atrP, adxL});
        if (!_resultNames.has(name)) {
          _resultNames.add(name);
          const _cfg = {usePivot:usePv,pvL,pvR,useEngulf:useEng,usePinBar:usePin,pinRatio,
              useBoll:useBol,bbLen:$n('e_bbl')||20,bbMult:$n('e_bbm')||2,
              useDonch:useDon,donLen:$n('e_donl')||20,
              useAtrBo,atrBoLen:$n('e_atbl')||14,atrBoMult:atrBoM,
              useMaTouch:useMaT,matType:$v('e_matt'),matPeriod:$n('e_matp')||20,matZone:$n('e_matz')||0.2,
              useSqueeze:useSqz,sqzBBLen:$n('e_sqbl')||20,sqzKCMult:$n('e_sqkm')||1.5,sqzMinBars,
              useTLTouch,useTLBreak,useFlag,useTri,
              tlPvL:$n('e_tl_pvl')||5,tlPvR:$n('e_tl_pvr')||3,tlZonePct:$n('e_tl_zone')||0.3,
              flagImpMin:$n('e_flag_imp')||2.0,flagMaxBars:$n('e_flag_bars')||20,flagRetrace:$n('e_flag_ret')||0.618,
              slPair,slLogic,tpPair,tpLogic,
              useBE,beTrig,beOff,useTrail,trTrig,trDist,
              useRev,revBars,revMode,revAct,useTime,timeBars,timeMode,
              usePartial,partRR,partPct,partBE,
              useClimax:useClimaxExit&&HAS_VOLUME,clxVolMult,clxBodyMult,clxMode,
              useMA:maP>0,maType:_mType,maP,
              useADX:useAdx&&adxT>0,adxThresh:adxT,adxLen:adxL,
              useRSI:useRsi,rsiOS:rsiPair.os,rsiOB:rsiPair.ob,
              useVolF:useVolF&&vfM>0,volFMult:vfM,
              useStruct,structLen,strPvL,strPvR,
              useConfirm:useConfirm&&confN>0,confN,confMatType,
              useMaDist:useMaDist&&mdMax>0,maDistMax:mdMax,
              useCandleF,candleMin,candleMax,useConsec,consecMax,
              useSTrend,sTrendWin,useFresh:useFresh&&freshMax>0,freshMax,
              useVSA:useVSA&&vsaM>0,vsaMult:vsaM,vsaPeriod:vsaP,
              useLiq,liqMin,useVolDir,volDirPeriod:volDirP,
              useWT:useWT&&wtT>0,wtThresh:wtT,wtN,wtVolW,wtBodyW,wtUseDist,
              useFat,fatConsec,fatVolDrop,
              atrPeriod:atrP,commission:commTotal,baseComm:comm,spreadVal:spread*2,
              revSkip,revCooldown,revSrc};
          results.push({name,pnl:r.pnl,wr:r.wr,n:r.n,dd:r.dd,pdd,avg:r.avg,sig,gt,
            p1:r.p1,p2:r.p2,dwr:r.dwr,c1:r.c1,c2:r.c2,nL:r.nL||0,pL:r.pL||0,wrL:r.wrL,nS:r.nS||0,pS:r.pS||0,wrS:r.wrS,dwrLS:r.dwrLS,
            cfg:_cfg});
          equities[name] = r.eq;
        }
      }
      if (done % 300 === 0 || done === mcTotal) {
        updateETA(done, mcTotal, results.length);
        await yieldToUI();
        await checkPause();
      }
      if (stopped) break;
    }
    // MC завершён — батч OOS + финальная обработка
    if (_useOOS && results.length > 0) {
      setMcPhase(`⏳ OOS проверка ${results.length} результатов…`);
      for (let oi = 0; oi < results.length; oi++) {
        _attachOOS(results[oi].cfg);
        if (oi % 50 === 0) { await yieldToUI(); }
      }
    }
    results.sort((a,b) => b.pdd-a.pdd);
    if (typeof setMcPhase === 'function') setMcPhase(null);
    _curPage = 0;
    renderVisibleResults(); showBestStats(); updateETA(done, mcTotal, results.length);
    $('prog').textContent = '✅ ' + fmtNum(results.length) + ' / ' + fmtNum(done) + ' прошли фильтр';
    $('pbtn').style.display='none'; $('sbtn').style.display='none';
    $('rbtn').style.display=''; $('rbtn').disabled=false;
    playDone();
    return; // выходим из runOpt — основной цикл не нужен
  }

  // ── TPE РЕЖИМ ──────────────────────────────────────────────────────────────
  if (optMode === 'tpe') {
    // tpe_target = целевое кол-во результатов (TPE останавливается когда найдено)
    // tpe_n      = жёсткий лимит итераций (защита от бесконечного цикла)
    const tpeTarget  = Math.max(10, parseInt($v('tpe_target')||'1000') || 1000);
    const tpeMaxIter = Math.max(100, parseInt($v('tpe_n')||'50000') || 50000);
    const _mType    = $v('f_mat') || 'EMA';
    const _nCandidates = 32;
    const _exploreN = Math.max(20, Math.min(500, Math.floor(tpeMaxIter * 0.10))); // разведка = 10% бюджета, макс 500

    // История: для каждой размерности храним нормализованные индексы и метрику
    const _tpeHistory = []; // [{dimIndices: [...], score}]
    const _dims = _mcDims;
    const _dsz  = _mcDimSizes;
    const nDims = _dims.length;
    // Дедупликация: Set уже виденных комбинаций
    const _tpeSeen = new Set();

    setMcPhase('🔮 TPE разведка ' + _exploreN + ' точек…');

    // Вспомогательная функция: прогнать одну точку через backtest и сохранить результат
    async function _tpeRunPoint(dimIndices) {
      // Дедупликация: быстрый числовой хеш вместо медленного join(',')
      let _hash = 0;
      for (let i = 0; i < dimIndices.length; i++) _hash = (_hash * 131 + dimIndices[i]) >>> 0;
      if (_tpeSeen.has(_hash)) return null;
      _tpeSeen.add(_hash);
      let _d = 0;
      const pvL      = _dims[_d][dimIndices[_d++]];
      const pvR      = _dims[_d][dimIndices[_d++]];
      const atrP     = _dims[_d][dimIndices[_d++]];
      const maP      = _dims[_d][dimIndices[_d++]];
      const adxT     = _dims[_d][dimIndices[_d++]];
      const rsiPair  = _dims[_d][dimIndices[_d++]];
      const vfM      = _dims[_d][dimIndices[_d++]];
      const mdMax    = _dims[_d][dimIndices[_d++]];
      const freshMax = _dims[_d][dimIndices[_d++]];
      const wtT      = _dims[_d][dimIndices[_d++]];
      const vsaM     = _dims[_d][dimIndices[_d++]];
      const atrBoM   = _dims[_d][dimIndices[_d++]];
      const slPair   = _dims[_d][dimIndices[_d++]];
      const tpPair   = _dims[_d][dimIndices[_d++]];
      const beOff    = _dims[_d][dimIndices[_d++]];
      const beTrig   = _dims[_d][dimIndices[_d++]];
      const trTrig   = _dims[_d][dimIndices[_d++]];
      const trDist   = _dims[_d][dimIndices[_d++]];
      const timeBars = _dims[_d][dimIndices[_d++]];
      const _ip      = _dims[_d][dimIndices[_d++]];
      const adxL        = _ip.adxL        ?? window._ipDef.adxL;
      const sTrendWin   = _ip.sTrendWin   ?? window._ipDef.sTrendWin;
      const confN       = _ip.confN       ?? window._ipDef.confN;
      const revBars     = _ip.revBars     ?? window._ipDef.revBars;
      const revSkip     = _ip.revSkip     ?? window._ipDef.revSkip;
      const revCooldown = _ip.revCooldown ?? window._ipDef.revCooldown;

      // Пропускаем невалидные BE комбинации
      if (useBE && beOff >= beTrig) { return 0; }

      const pk = pvL+'_'+pvR;
      if (!pvCache[pk]) pvCache[pk] = {lo:calcPivotLow(pvL,pvR), hi:calcPivotHigh(pvL,pvR)};
      if (!atrCache[atrP]) atrCache[atrP] = calcRMA_ATR(atrP);
      if (!atrAvgCache[atrP]) atrAvgCache[atrP] = calcSMA(atrCache[atrP], 50);
      const atrAvg = atrAvgCache[atrP];
      const mk = _mType+'_'+maP;
      let maArr = null;
      if (maP > 0) { if (!maCache[mk]) maCache[mk] = calcMA(closes, maP, _mType); maArr = maCache[mk]; }
      let wtScores = null;
      if (useWT && maArr) wtScores = calcWeightedTrend(maArr, atrCache[atrP], wtN, wtVolW, wtBodyW, wtDistW, wtUseDist);
      let confMAArr = null;
      if (useConfirm && confN > 0) {
        const ck = confN+'_'+(confMatType||'EMA');
        if (!maCache[ck]) maCache[ck] = calcMA(closes, confN, confMatType||'EMA');
        confMAArr = maCache[ck];
      }
      if (!adxCache[adxL]) adxCache[adxL] = calcADX(adxL);

      const btCfg = {
        comm:commTotal,
        usePivot:usePv,pvLo:pvCache[pk].lo,pvHi_:pvCache[pk].hi,
        useEngulf:useEng,usePinBar:usePin,pinRatio,
        useBoll:useBol,bbB:(()=>{const bl=$n('e_bbl')||20;const b=calcSMA(closes,bl);const d=new Float64Array(DATA.length);for(let i=bl-1;i<DATA.length;i++){let s=0;const m=b[i];for(let j=i-bl+1;j<=i;j++)s+=(closes[j]-m)**2;d[i]=Math.sqrt(s/bl)*($n('e_bbm')||2);}return b;})(),
        useDonch:useDon,useAtrBo,atrBoMult:atrBoM,
        useMaTouch:useMaT,matMA:useMaT?calcMA(closes,$n('e_matp')||20,$v('e_matt')||'EMA'):null,matZone:$n('e_matz')||0.2,
        useSqueeze:useSqz,sqzMinBars,
        useTLTouch:false,useTLBreak:false,useFlag:false,useTri:false,tfSigL:null,tfSigS:null,
        hasSLA:!!(slPair.a),slMult:slPair.a?slPair.a.m:0,hasSLB:!!(slPair.p),slPctMult:slPair.p?slPair.p.m:0,slLogic,
        hasTPA:!!(tpPair.a),tpMult:tpPair.a?tpPair.a.m:0,tpMode:tpPair.a?tpPair.a.type:'rr',
        hasTPB:!!(tpPair.b),tpMultB:tpPair.b?tpPair.b.m:0,tpModeB:tpPair.b?tpPair.b.type:'rr',tpLogic,
        useBE,beTrig,beOff,useTrail,trTrig,trDist,
        useRev,revBars,revMode,revAct,revSrc,revSkip,revCooldown,
        useTime,timeBars,timeMode,usePartial,partRR,partPct,partBE,
        useClimax:useClimaxExit&&HAS_VOLUME,clxVolMult,clxBodyMult,clxMode,
        useMA:maP>0,maArr,
        useADX:useAdx&&adxT>0,adxArr:adxCache[adxL],adxThresh:adxT,adxLen:adxL,
        useRSI:useRsi,rsiArr:useRsi?calcRSI(14):null,rsiOS:rsiPair.os,rsiOB:rsiPair.ob,
        useVolF:useVolF&&vfM>0,atrAvg,volFMult:vfM,
        useStruct,structBull,structBear,strPvL,strPvR,
        useSLPiv,slPivOff,slPivMax,slPivL,slPivR,pivSLLo,pivSLHi,
        useConfirm:useConfirm&&confN>0,confN,confMatType,maArrConfirm:confMAArr,
        useMaDist:useMaDist&&mdMax>0,maDistMax:mdMax,
        useCandleF,candleMin,candleMax,useConsec,consecMax,
        useSTrend,sTrendWin,useFresh:useFresh&&freshMax>0,freshMax,
        useVSA:useVSA&&vsaM>0,vsaMult:vsaM,volAvg:volAvgArr,
        useLiq,liqMin,useVolDir,volDirPeriod:volDirP,
        useWT:useWT&&wtT>0,wtScores,wtThresh:wtT,
        useFat,fatConsec,fatVolDrop,bodyAvg:bodyAvgArr,
        start:Math.max(maP||0,50)+2,pruning:false,maxDDLimit:maxDD
      };

      if (_useOOS) DATA = _isData;
      let r;
      try { r = backtest(pvCache[pk].lo, pvCache[pk].hi, atrCache[atrP], btCfg); }
      finally { if (_useOOS) DATA = _fullDATA; }
      done++;
      // Мягкий score: градация для всех результатов, не только прошедших фильтр
      // Прошёл фильтр: P/DD (основная метрика)
      // Не прошёл: небольшой отрицательный score пропорционально насколько близко
      //   — помогает TPE уходить от совсем плохих зон
      let score;
      if (r && r.n >= minTrades && r.dd <= maxDD) {
        const pdd = r.dd > 0 ? r.pnl / r.dd : (r.pnl > 0 ? 50 : 0);
        score = Math.max(0, pdd);
      } else if (r && r.n > 0) {
        // Частичный score: pnl/maxDD нормализованный в [-1, 0)
        // Если pnl > 0 но DD превышает — слегка отрицательный
        // Если pnl < 0 — сильно отрицательный
        const softPnl = r.pnl / Math.max(maxDD, 1);
        const ddPenalty = r.dd > maxDD ? -(r.dd - maxDD) / Math.max(maxDD, 1) : 0;
        const tradePenalty = r.n < minTrades ? -0.5 * (1 - r.n / minTrades) : 0;
        score = Math.max(-2, softPnl * 0.1 + ddPenalty + tradePenalty);
      } else {
        score = -2; // нет сделок вообще
      }
      const pdd = (r && r.dd > 0) ? r.pnl/r.dd : (r && r.pnl > 0 ? 50 : 0);
      const sig = _calcStatSig(r);
      const gt = _calcGTScore(r);

      if (r && r.n >= minTrades && r.dd <= maxDD) {
        let slDesc = slPair.combo ? `SL(ATR×${slPair.a.m}${slLogic==='or'?'|OR|':'|AND|'}${slPair.p.m}%)` : slPair.a ? `SL×${slPair.a.m}ATR` : `SL${slPair.p.m}%`;
        let tpDesc = tpPair.combo ? (()=>{const n1=tpPair.a.type==='rr'?`RR${tpPair.a.m}`:tpPair.a.type==='atr'?`TP×${tpPair.a.m}ATR`:`TP${tpPair.a.m}%`;const n2=tpPair.b.type==='rr'?`RR${tpPair.b.m}`:tpPair.b.type==='atr'?`TP×${tpPair.b.m}ATR`:`TP${tpPair.b.m}%`;return `TP(${n1}${tpLogic==='or'?'|OR|':'|AND|'}${n2})`;})() : tpPair.a ? (tpPair.a.type==='rr'?`RR×${tpPair.a.m}`:tpPair.a.type==='atr'?`TP×${tpPair.a.m}ATR`:`TP${tpPair.a.m}%`) : '';
        const name = buildName(btCfg, pvL, pvR, slDesc, tpDesc, {}, {maP, maType:_mType, stw:sTrendWin, atrP, adxL});
        if (!_resultNames.has(name)) {
          _resultNames.add(name);
          const _cfg_tpe = {usePivot:usePv,pvL,pvR,useEngulf:useEng,usePinBar:usePin,pinRatio,
              useBoll:useBol,bbLen:$n('e_bbl')||20,bbMult:$n('e_bbm')||2,
              useDonch:useDon,donLen:$n('e_donl')||20,
              useAtrBo,atrBoLen:$n('e_atbl')||14,atrBoMult:atrBoM,
              useMaTouch:useMaT,matType:$v('e_matt'),matPeriod:$n('e_matp')||20,matZone:$n('e_matz')||0.2,
              useSqueeze:useSqz,sqzBBLen:$n('e_sqbl')||20,sqzKCMult:$n('e_sqkm')||1.5,sqzMinBars,
              useTLTouch,useTLBreak,useFlag,useTri,
              tlPvL:$n('e_tl_pvl')||5,tlPvR:$n('e_tl_pvr')||3,tlZonePct:$n('e_tl_zone')||0.3,
              flagImpMin:$n('e_flag_imp')||2.0,flagMaxBars:$n('e_flag_bars')||20,flagRetrace:$n('e_flag_ret')||0.618,
              slPair,slLogic,tpPair,tpLogic,
              useBE,beTrig,beOff,useTrail,trTrig,trDist,
              useRev,revBars,revMode,revAct,revSrc,revSkip,revCooldown,
              useTime,timeBars,timeMode,usePartial,partRR,partPct,partBE,
              useClimax:useClimaxExit&&HAS_VOLUME,clxVolMult,clxBodyMult,clxMode,
              useMA:maP>0,maType:_mType,maP,
              useADX:useAdx&&adxT>0,adxThresh:adxT,adxLen:adxL,
              useRSI:useRsi,rsiOS:rsiPair.os,rsiOB:rsiPair.ob,
              useVolF:useVolF&&vfM>0,volFMult:vfM,
              useStruct,structLen,strPvL,strPvR,
              useConfirm:useConfirm&&confN>0,confN,confMatType,
              useMaDist:useMaDist&&mdMax>0,maDistMax:mdMax,
              useCandleF,candleMin,candleMax,useConsec,consecMax,
              useSTrend,sTrendWin,useFresh:useFresh&&freshMax>0,freshMax,
              useVSA:useVSA&&vsaM>0,vsaMult:vsaM,vsaPeriod:vsaP,
              useLiq,liqMin,useVolDir,volDirPeriod:volDirP,
              useWT:useWT&&wtT>0,wtThresh:wtT,wtN,wtVolW,wtBodyW,wtUseDist,
              useFat,fatConsec,fatVolDrop,
              atrPeriod:atrP,commission:commTotal,baseComm:comm,spreadVal:spread*2};
          // OOS НЕ вызываем здесь — это горячий цикл (миллионы итераций)
          // _attachOOS будет вызван батчем после завершения TPE
          results.push({name,pnl:r.pnl,wr:r.wr,n:r.n,dd:r.dd,pdd,avg:r.avg,sig,gt,
            p1:r.p1,p2:r.p2,dwr:r.dwr,c1:r.c1,c2:r.c2,nL:r.nL||0,pL:r.pL||0,wrL:r.wrL,nS:r.nS||0,pS:r.pS||0,wrS:r.wrS,dwrLS:r.dwrLS,
            cfg:_cfg_tpe});
          equities[name] = r.eq;
        }
      }
      return score;
    }

    // ── Фаза 1: LHS разведка ─────────────────────────────────────────
    const _lhsIndices = [];
    {
      const realTotal2 = _mcDimSizes.reduce((a,b)=>a*b,1);
      if (realTotal2 <= _exploreN) {
        for (let i = 0; i < realTotal2; i++) _lhsIndices.push(i);
      } else {
        const stratSize = realTotal2 / _exploreN;
        for (let i = 0; i < _exploreN; i++) {
          const lo = Math.floor(i * stratSize);
          const hi = Math.floor((i+1)*stratSize)-1;
          _lhsIndices.push(lo + Math.floor(Math.random()*(hi-lo+1)));
        }
        for (let i = _exploreN-1; i > 0; i--) {
          const j = Math.floor(Math.random()*(i+1));
          [_lhsIndices[i],_lhsIndices[j]]=[_lhsIndices[j],_lhsIndices[i]];
        }
      }
    }

    for (let ei = 0; ei < _lhsIndices.length && !stopped; ei++) {
      let _idx = _lhsIndices[ei];
      const _di = new Array(nDims);
      for (let d = nDims-1; d >= 0; d--) { _di[d]=_idx%_dsz[d]; _idx=Math.floor(_idx/_dsz[d]); }
      const score = await _tpeRunPoint(_di);
      if (score !== null) _tpeHistory.push({dimIndices:[..._di], score});
      if (ei % 5 === 0) {
        setMcPhase(`🔮 TPE разведка ${ei+1}/${_exploreN} | Находки: ${results.length}/${tpeTarget}`);
        updateETA(done, tpeMaxIter, results.length);
        await yieldToUI();
        await checkPause();
      }
    }

    // ── Фаза 2: TPE эксплуатация — работаем пока не найдено tpeTarget результатов
    //   или не исчерпан бюджет tpeMaxIter итераций
    setMcPhase(`🎯 TPE эксплуатация | Цель: ${tpeTarget} результатов | Макс: ${tpeMaxIter} итераций…`);

    let _tpeSortedCache = null;
    let _tpeBestScore = 0;
    let _lastYieldTime = performance.now();
    // Предвычисленная матрица [dimIdx][histIdx] — обновляем только при изменении good/bad
    let _goodMat = null, _badMat = null, _lastGoodLen = -1, _lastBadLen = -1;

    for (let ti = 0; results.length < tpeTarget && done < tpeMaxIter && !stopped; ti++) {
      const progress = Math.min(1, done / Math.max(tpeMaxIter - 1, 1));
      const gamma = 0.25 - 0.10 * progress;

      // Пересортируем раз в 50 итераций
      if (done % 50 === 0 || _tpeSortedCache === null) {
        _tpeSortedCache = _tpeHistory.slice().sort((a,b)=>b.score-a.score);
      }
      const sorted = _tpeSortedCache;
      const nGood = Math.max(3, Math.floor(sorted.length * gamma));
      const goodEnd = Math.min(nGood, 150);
      const badEnd  = Math.min(nGood + 300, sorted.length);

      // Пересчитываем матрицы только когда изменились размеры срезов
      if (goodEnd !== _lastGoodLen || badEnd - nGood !== _lastBadLen) {
        _goodMat = new Float32Array(nDims * goodEnd);
        _badMat  = new Float32Array(nDims * (badEnd - nGood));
        for (let d = 0; d < nDims; d++) {
          const inv = 1 / Math.max(_dsz[d]-1, 1);
          for (let i = 0; i < goodEnd; i++)
            _goodMat[d * goodEnd + i] = sorted[i].dimIndices[d] * inv;
          for (let i = nGood; i < badEnd; i++)
            _badMat[d * (badEnd-nGood) + (i-nGood)] = sorted[i].dimIndices[d] * inv;
        }
        _lastGoodLen = goodEnd;
        _lastBadLen  = badEnd - nGood;
      }

      // Выбираем лучший индекс для каждой размерности через гистограмму
      const nextDi = new Array(nDims);
      for (let d = 0; d < nDims; d++) {
        const gv = _goodMat.subarray(d * goodEnd, d * goodEnd + goodEnd);
        const bv = _badMat.subarray(d * _lastBadLen, d * _lastBadLen + _lastBadLen);
        nextDi[d] = _tpeSampleDim(gv, bv, _dims[d], _nCandidates);
      }

      // Парные взаимодействия (числовой массив вместо объекта со строками)
      if (goodEnd >= 5) {
        const _pairDims = [[2,12],[12,13],[2,13],[14,15],[16,17]];
        for (const [da, db] of _pairDims) {
          if (da >= nDims || db >= nDims) continue;
          const szA = _dsz[da], szB = _dsz[db];
          const pSum = new Float32Array(szA * szB);
          const pCnt = new Uint16Array(szA * szB);
          for (let i = 0; i < goodEnd; i++) {
            const h = sorted[i];
            const k = h.dimIndices[da] * szB + h.dimIndices[db];
            pSum[k] += h.score; pCnt[k]++;
          }
          let bestK = -1, bestAvg = -Infinity;
          for (let k = 0; k < pSum.length; k++) {
            if (pCnt[k] > 0) { const avg = pSum[k]/pCnt[k]; if (avg > bestAvg) { bestAvg=avg; bestK=k; } }
          }
          if (bestK >= 0 && Math.random() < 0.5) {
            nextDi[da] = Math.floor(bestK / szB);
            nextDi[db] = bestK % szB;
          }
        }
      }

      // Мутация 15%
      if (Math.random() < 0.15) {
        const dm = Math.floor(Math.random() * nDims);
        nextDi[dm] = Math.floor(Math.random() * _dsz[dm]);
      }

      const score = await _tpeRunPoint(nextDi);
      if (score !== null) {
        _tpeHistory.push({dimIndices:[...nextDi], score});
        if (score > _tpeBestScore) _tpeBestScore = score;
        // Ограничиваем размер истории — не даём расти бесконечно
        if (_tpeHistory.length > 1200) {
          _tpeHistory.sort((a,b)=>b.score-a.score);
          _tpeHistory.length = 1000;
          _tpeSortedCache = null;
        }
      }

      if (done % 50 === 0) {
        const pct = Math.round(Math.min(results.length / tpeTarget, done / tpeMaxIter) * 100);
        setMcPhase(`🎯 TPE итер:${done} | γ=${gamma.toFixed(2)} | P/DD: ${_tpeBestScore.toFixed(2)} | ${results.length}/${tpeTarget} (${pct}%)`);
        updateETA(done, tpeMaxIter, results.length);
      }
      // Time-based yield: отдаём UI каждые ~12мс независимо от кол-ва итераций
      const _now = performance.now();
      if (_now - _lastYieldTime >= 12) {
        _lastYieldTime = _now;
        await yieldToUI();
        await checkPause();
      }
    }

    // TPE завершён — батч OOS для всех найденных результатов
    if (_useOOS && results.length > 0) {
      setMcPhase(`⏳ OOS проверка ${results.length} результатов…`);
      for (let oi = 0; oi < results.length; oi++) {
        _attachOOS(results[oi].cfg);
        if (oi % 50 === 0) { await yieldToUI(); }
      }
    }
    results.sort((a,b)=>b.pdd-a.pdd);
    if (typeof setMcPhase==='function') setMcPhase(null);
    _curPage=0;
    renderVisibleResults(); showBestStats(); updateETA(done, tpeMaxIter, results.length);
    const _tpeStopReason = results.length >= tpeTarget ? `✅ цель ${tpeTarget} достигнута` : `✅ бюджет ${tpeMaxIter} итераций исчерпан`;
    $('prog').textContent=`${_tpeStopReason} | ${fmtNum(results.length)} / ${fmtNum(done)} прошли фильтр`;
    $('pbtn').style.display='none'; $('sbtn').style.display='none';
    $('rbtn').style.display=''; $('rbtn').disabled=false;
    playDone();
    return;
  }

  for(const pvL of pvLs) { for(const pvR of pvRs) {
    if(_mcDone) break;
    const pk=pvL+'_'+pvR;
    if(!pvCache[pk]) pvCache[pk]={lo:calcPivotLow(pvL,pvR),hi:calcPivotHigh(pvL,pvR)};

    for(const atrP of atrPs) {
      if(_mcDone) break;
      if(!atrCache[atrP]) atrCache[atrP]=calcRMA_ATR(atrP);
      const atrAvg=calcSMA(Array.from(atrCache[atrP]),50);

      for(const maP of maPs) {
        if(_mcDone) break;
        const mType=$v('f_mat')||'EMA';
        const mk=mType+'_'+maP;
        let maArr=null;
        if(maP>0) {
          if(!maCache[mk]) maCache[mk]=calcMA(closes,maP,mType);
          maArr=maCache[mk];
        }

        for(const adxT of (adxTs.length?adxTs:[0])) {
          if(_mcDone) break;
          for(const rsiPair of rsiPairs) {
            if(_mcDone) break;
            for(const vfM of (vfMs.length?vfMs:[0])) {
              if(_mcDone) break;
              for(const mdMax of (mdMaxs.length?mdMaxs:[0])) {
                if(_mcDone) break;
                for(const freshMax of (freshMaxs.length?freshMaxs:[20])) {
                  if(_mcDone) break;
                  for(const wtT of (wtThreshs.length?wtThreshs:[0])) {
                    if(_mcDone) break;
                    // Weighted trend scores (if enabled)
                    let wtScores=null;
                    if(useWT && maArr) {
                      wtScores=calcWeightedTrend(maArr,atrCache[atrP],wtN,wtVolW,wtBodyW,wtDistW,wtUseDist);
                    }
                    for(const vsaM of (vsaMs.length?vsaMs:[0])) {
                      if(_mcDone) break;
                      for(const atrBoM of (atrBoMults.length?atrBoMults:[2.0])) {
                        if(_mcDone) break;
                        for(const slPair of slPairs) {
                          if(_mcDone) break;
                          for(const tpPair of tpPairs) {
                            if(_mcDone) break;
                            for(const beTrig of beTrigs) {
                            for(const beOff of beOffs) {
                              if(_mcDone) break;
                              if(useBE && beOff >= beTrig) continue; // только классический BE
                              for(const trTrig of trTrigs) {
                                for(const trDist of trDists) {
                                  for(const timeBars of (timeBarsArr.length?timeBarsArr:[50])) {
                                    for(const _ip of window._ipCombos) {
                                    if(_mcDone||stopped) break;
                                    const adxL     = _ip.adxL     ?? window._ipDef.adxL;
                                    const sTrendWin= _ip.sTrendWin?? window._ipDef.sTrendWin;
                                    const confN    = _ip.confN    ?? window._ipDef.confN;
                                    const revBars  = _ip.revBars  ?? window._ipDef.revBars;
                                    const revSkip  = _ip.revSkip  ?? window._ipDef.revSkip;
                                    const revCooldown = _ip.revCooldown ?? window._ipDef.revCooldown;
                                    if(stopped) break;

                                    // Вторая MA для фильтра (confMatType + confN)
                                     let confMAArr = null;
                                     if (useConfirm && confN > 0) {
                                       const ck = confN+'_'+(confMatType||'EMA');
                                       if (!maCache[ck]) maCache[ck] = calcMA(closes, confN, confMatType||'EMA');
                                       confMAArr = maCache[ck];
                                     }

                                     const btCfg={
                                      comm: commTotal,
                                      usePivot:usePv,useEngulf:useEng,usePinBar:usePin,pinRatio,
                                      useBoll:useBol,bbB,bbD,
                                      useDonch:useDon,donH,donL,
                                      useAtrBo,atrBoMA,atrBoATR:atrBoATR2,atrBoMult:atrBoM,
                                      useMaTouch:useMaT,matMA,matZone,
                                      useSqueeze:useSqz,sqzOn,sqzCount,sqzMinBars,
                                      // Trendline Figures
                                      useTLTouch,useTLBreak,useFlag,useTri,
                                      tfSigL,tfSigS,
                                      // SL
                                      hasSLA:!!slPair.a,
                                      slMult:slPair.a?slPair.a.m:0,
                                      hasSLB:!!slPair.p,
                                      slPctMult:slPair.p?slPair.p.m:0,
                                      slLogic,
                                      useSLPiv,slPivOff,slPivMax,slPivL,slPivR,slPivTrail,
                                      pivSLLo:useSLPiv?pivSLLo:null,pivSLHi:useSLPiv?pivSLHi:null,
                                      // TP
                                      hasTPA:!!tpPair.a,
                                      tpMult:tpPair.a?tpPair.a.m:0,
                                      tpMode:tpPair.a?tpPair.a.type:'rr',
                                      hasTPB:!!tpPair.b,
                                      tpMultB:tpPair.b?tpPair.b.m:0,
                                      tpModeB:tpPair.b?tpPair.b.type:'rr',
                                      tpLogic,
                                      // Exits
                                      useBE,beTrig,beOff,
                                      useTrail,trTrig,trDist,
                                      useRev,revBars,revMode,revAct,revSrc,revSkip,revCooldown,
                                      useTime,timeBars,timeMode,
                                      usePartial,partRR,partPct,partBE,
                                      useClimax:useClimaxExit&&HAS_VOLUME,clxVolMult,clxBodyMult,clxMode,
                                      // Filters
                                      useMA:maP>0,maArr,
                                      useADX:useAdx&&adxT>0,adxArr:(()=>{if(!adxCache[adxL])adxCache[adxL]=calcADX(adxL);return adxCache[adxL];})(),adxThresh:adxT,adxLen:adxL,
                                      useRSI:useRsi,rsiArr:useRsi?calcRSI(14):null,
                                      rsiOS:rsiPair.os,rsiOB:rsiPair.ob,
                                      useVolF:useVolF&&vfM>0,atrAvg,volFMult:vfM,
                                      useStruct,structBull,structBear,strPvL,strPvR,
                                      useConfirm:useConfirm&&confN>0,confN,confMatType,maArrConfirm:confMAArr,
                                      useMaDist:useMaDist&&mdMax>0,maDistMax:mdMax,
                                      useCandleF,candleMin,candleMax,
                                      useConsec,consecMax,
                                      useSTrend,sTrendWin,
                                      useFresh:useFresh&&freshMax>0,freshMax,
                                      useVSA:useVSA&&vsaM>0,vsaMult:vsaM,volAvg:volAvgArr,
                                      useLiq,liqMin,
                                      useVolDir,volDirPeriod:volDirP,
                                      useWT:useWT&&wtT>0,wtScores,wtThresh:wtT,
                                      useFat,fatConsec,fatVolDrop,
                                      bodyAvg:bodyAvgArr,
                                      start:Math.max(maP||0,50)+2,
                                      // Pruning
                                      pruning:optMode==='prune',maxDDLimit:maxDD
                                    };

                                    if (_useOOS) DATA = _isData;
                                    let r;
                                    try { r=backtest(pvCache[pk].lo,pvCache[pk].hi,atrCache[atrP],btCfg); }
                                    finally { if (_useOOS) DATA = _fullDATA; }
                                    done++;

                                    if(r && r.n>=minTrades && r.dd<=maxDD) {
                                      const pdd=r.dd>0?r.pnl/r.dd:0;
                                      const sig=_calcStatSig(r);
                                      const gt=_calcGTScore(r);
                                      // Build SL description
                                      let slDesc='';
                                      if(slPair.combo) {
                                        slDesc=`SL(ATR×${slPair.a.m}${slLogic==='or'?'|OR|':'|AND|'}${slPair.p.m}%)`;
                                      } else if(slPair.a) {
                                        slDesc=`SL×${slPair.a.m}ATR`;
                                      } else {
                                        slDesc=`SL${slPair.p.m}%`;
                                      }
                                      // Build TP description
                                      let tpDesc='';
                                      if(tpPair.combo) {
                                        const nm1=tpPair.a.type==='rr'?`RR${tpPair.a.m}`:tpPair.a.type==='atr'?`TP×${tpPair.a.m}ATR`:`TP${tpPair.a.m}%`;
                                        const nm2=tpPair.b.type==='rr'?`RR${tpPair.b.m}`:tpPair.b.type==='atr'?`TP×${tpPair.b.m}ATR`:`TP${tpPair.b.m}%`;
                                        tpDesc=`TP(${nm1}${tpLogic==='or'?'|OR|':'|AND|'}${nm2})`;
                                      } else if(tpPair.a) {
                                        tpDesc=tpPair.a.type==='rr'?`RR×${tpPair.a.m}`:tpPair.a.type==='atr'?`TP×${tpPair.a.m}ATR`:`TP${tpPair.a.m}%`;
                                      }
                                      const name=buildName(btCfg,pvL,pvR,slDesc,tpDesc,{},{
                                        maP,maType:mType,stw:sTrendWin,atrP,adxL
                                      });
                                      if (_resultNames.has(name)) { /* дубль — пропускаем */ } else {
                                      _resultNames.add(name);
                                      const _cfg_ex = {
                                          usePivot:usePv, pvL, pvR,
                                          useEngulf:useEng,
                                          usePinBar:usePin, pinRatio,
                                          useBoll:useBol, bbLen:$n('e_bbl')||20, bbMult:$n('e_bbm')||2,
                                          useDonch:useDon, donLen:$n('e_donl')||20,
                                          useAtrBo, atrBoLen:$n('e_atbl')||14, atrBoMult:atrBoM,
                                          useMaTouch:useMaT, matType:$v('e_matt'), matPeriod:$n('e_matp')||20, matZone:$n('e_matz')||0.2,
                                          useSqueeze:useSqz, sqzBBLen:$n('e_sqbl')||20, sqzKCMult:$n('e_sqkm')||1.5, sqzMinBars,
                                          useTLTouch, useTLBreak, useFlag, useTri,
                                          tlPvL:$n('e_tl_pvl')||5, tlPvR:$n('e_tl_pvr')||3, tlZonePct:$n('e_tl_zone')||0.3,
                                          flagImpMin:$n('e_flag_imp')||2.0, flagMaxBars:$n('e_flag_bars')||20, flagRetrace:$n('e_flag_ret')||0.618,
                                          slPair, slLogic, tpPair, tpLogic,
                                          useBE, beTrig, beOff,
                                          useTrail, trTrig, trDist,
                                          useRev, revBars, revMode, revAct, revSrc, revSkip, revCooldown,
                                          useTime, timeBars, timeMode,
                                          usePartial, partRR, partPct, partBE,
                                          useClimax:useClimaxExit&&HAS_VOLUME, clxVolMult, clxBodyMult, clxMode,
                                          useMA:maP>0, maType:mType, maP,
                                          useADX:useAdx&&adxT>0, adxThresh:adxT, adxLen:adxL,
                                          useRSI:useRsi, rsiOS:rsiPair.os, rsiOB:rsiPair.ob,
                                          useVolF:useVolF&&vfM>0, volFMult:vfM,
                                          useStruct, structLen, strPvL, strPvR,
                                          useConfirm:useConfirm&&confN>0, confN, confMatType,
                                          useMaDist:useMaDist&&mdMax>0, maDistMax:mdMax,
                                          useCandleF, candleMin, candleMax,
                                          useConsec, consecMax,
                                          useSTrend, sTrendWin,
                                          useFresh:useFresh&&freshMax>0, freshMax,
                                          useVSA:useVSA&&vsaM>0, vsaMult:vsaM, vsaPeriod:vsaP,
                                          useLiq, liqMin,
                                          useVolDir, volDirPeriod:volDirP,
                                          useWT:useWT&&wtT>0, wtThresh:wtT, wtN, wtVolW, wtBodyW, wtUseDist,
                                          useFat, fatConsec, fatVolDrop,
                                          atrPeriod:atrP, commission:commTotal, baseComm:comm, spreadVal:spread*2
                                        };
                                      results.push({name,pnl:r.pnl,wr:r.wr,n:r.n,dd:r.dd,pdd,avg:r.avg,sig,gt,
                                        p1:r.p1,p2:r.p2,dwr:r.dwr,c1:r.c1,c2:r.c2,nL:r.nL||0,pL:r.pL||0,wrL:r.wrL,nS:r.nS||0,pS:r.pS||0,wrS:r.wrS,dwrLS:r.dwrLS,
                                        cfg:_cfg_ex});
                                      equities[name]=r.eq;
                                      } // end else (не дубль)
                                    } // end if(r passed filter)
                                    // Yield: в prune режиме реже (1000 ит.), в обычном — чаще (300 ит.)
                                    const _yieldEvery = optMode === 'prune' ? 1000 : 300;
                                    if(done%_yieldEvery===0||done===total) {
                                      if(optMode==='mc' && done===300) setMcPhase('⚡ Перебор…');
                                      updateETA(done, total, results.length);
                                      await yieldToUI();
                                      await checkPause();
                                    }
                                    if(stopped) { _mcDone=true; break; }
                                  } // timeBars
                                  } // _ip combo
                                } // trDist
                              } // trTrig
                            } // beOff
                            } // beTrig
                          } // tpPair
                        } // slPair
                      } // atrBoM
                    } // vsaM
                  } // wtT
                } // freshMax
              } // mdMax
            } // vfM
          } // rsiPair
        } // adxT
      } // maP
    } // atrP
  }} // pvL pvR

  // Exhaustive завершён — батч OOS
  if (_useOOS && results.length > 0) {
    setMcPhase(`⏳ OOS проверка ${results.length} результатов…`);
    for (let oi = 0; oi < results.length; oi++) {
      _attachOOS(results[oi].cfg);
      if (oi % 50 === 0) { await yieldToUI(); }
    }
  }
  results.sort((a,b)=>b.pdd-a.pdd);
  if (typeof setMcPhase === 'function') setMcPhase(null);
  _curPage = 0;
  renderResults();
  if(results.length>0) showBestStats();
  updateETA(done, total, results.length);
  $('prog').textContent='✅ ' + fmtNum(results.length) + ' / ' + fmtNum(done) + ' прошли фильтр';
  // Restore buttons
  $('pbtn').style.display='none';
  $('sbtn').style.display='none';
  $('rbtn').style.display='';
  $('rbtn').disabled=false;
  playDone();
}

// ============================================================
// _calcIndicators / buildBtCfg — восстановлены из истории
// Используются тестами устойчивости (runOnSlice)
// ============================================================
// ============================================================
// _calcIndicators(cfg) — пересчитывает все индикаторные массивы
// из текущего DATA по параметрам cfg.
// Возвращает объект ind, который передаётся в buildBtCfg().
// ============================================================
function _calcIndicators(cfg) {
  const N = DATA.length;
  const closes = DATA.map(r => r.c);

  // ── Pivot Low / High (для входа) ──────────────────────────
  const pvL = cfg.pvL || 5;
  const pvR = cfg.pvR || 2;
  const pvLo = calcPivotLow(pvL, pvR);
  const pvHi = calcPivotHigh(pvL, pvR);

  // ── ATR ───────────────────────────────────────────────────
  const atrP = cfg.atrPeriod || 14;
  const atrArr = calcRMA_ATR(atrP);
  const atrAvg = calcSMA(Array.from(atrArr), 50);

  // ── MA (тренд-фильтр) ─────────────────────────────────────
  const maP  = cfg.maP  || 0;
  const maType = cfg.maType || 'EMA';
  const maArr = (maP > 0) ? calcMA(closes, maP, maType) : null;

  // ── Confirm MA ────────────────────────────────────────────
  const confN = cfg.confN || 0;
  const confMatType = cfg.confMatType || 'EMA';
  const maArrConfirm = (cfg.useConfirm && confN > 0)
    ? calcMA(closes, confN, confMatType)
    : null;

  // ── ADX ───────────────────────────────────────────────────
  const adxLen = cfg.adxLen || 14;
  const adxArr = cfg.useADX ? calcADX(adxLen) : null;

  // ── RSI ───────────────────────────────────────────────────
  const rsiArr = cfg.useRSI ? calcRSI(14) : null;

  // ── Bollinger Bands ───────────────────────────────────────
  let bbB = null;
  if (cfg.useBoll) {
    const bl = cfg.bbLen || 20;
    const bm = cfg.bbMult || 2;
    bbB = calcSMA(closes, bl);
    // bbD не нужен backtest напрямую — передаём только bbB (средняя линия)
  }

  // ── Donchian ──────────────────────────────────────────────
  let donH = null, donL = null;
  if (cfg.useDonch) {
    const dl = cfg.donLen || 20;
    donH = new Float64Array(N); donL = new Float64Array(N);
    for (let i = dl + 2; i < N; i++) {
      let mx = -Infinity, mn = Infinity;
      for (let j = i - dl - 1; j <= i - 2; j++) {
        if (DATA[j].h > mx) mx = DATA[j].h;
        if (DATA[j].l < mn) mn = DATA[j].l;
      }
      donH[i] = mx; donL[i] = mn;
    }
  }

  // ── ATR Breakout ──────────────────────────────────────────
  let atrBoMA = null, atrBoATR2 = null;
  if (cfg.useAtrBo) {
    const al = cfg.atrBoLen || 14;
    atrBoMA   = calcEMA(closes, al);
    atrBoATR2 = calcRMA_ATR(al);
  }

  // ── MA Touch ──────────────────────────────────────────────
  let matMA = null;
  const matZone = cfg.matZone || 0.2;
  if (cfg.useMaTouch) {
    const mp = cfg.matPeriod || 20;
    const mt = cfg.matType   || 'EMA';
    matMA = calcMA(closes, mp, mt);
  }

  // ── Squeeze ───────────────────────────────────────────────
  let sqzOn = null, sqzCount = null;
  if (cfg.useSqueeze) {
    const sbl = cfg.sqzBBLen  || 20;
    const skm = cfg.sqzKCMult || 1.5;
    const bbBasis = calcSMA(closes, sbl);
    const bbDevSqz = new Float64Array(N);
    for (let i = sbl - 1; i < N; i++) {
      let s = 0;
      for (let j = i - sbl + 1; j <= i; j++) s += (closes[j] - bbBasis[i]) ** 2;
      bbDevSqz[i] = Math.sqrt(s / sbl) * 2;
    }
    const kcATR = calcRMA_ATR(sbl);
    const kcMA  = calcEMA(closes, sbl);
    sqzOn = new Uint8Array(N); sqzCount = new Int32Array(N);
    for (let i = sbl; i < N; i++) {
      const bbU = bbBasis[i] + bbDevSqz[i], bbL = bbBasis[i] - bbDevSqz[i];
      const kcU = kcMA[i] + kcATR[i] * skm, kcL = kcMA[i] - kcATR[i] * skm;
      sqzOn[i]    = (bbL > kcL && bbU < kcU) ? 1 : 0;
      sqzCount[i] = sqzOn[i] ? (sqzCount[i-1] || 0) + 1 : 0;
    }
  }

  // ── Volume-based arrays ───────────────────────────────────
  const vsaP     = cfg.vsaPeriod || 20;
  const volAvgArr  = HAS_VOLUME ? calcVolSMA(vsaP) : null;
  const bodyAvgArr = HAS_VOLUME ? calcBodySMA(20)   : null;

  // ── Weighted Trend ────────────────────────────────────────
  let wtScores = null;
  if (cfg.useWT && maArr) {
    const wtN      = cfg.wtN      || 11;
    const wtVolW   = cfg.wtVolW   || 3.5;
    const wtBodyW  = cfg.wtBodyW  || 3.5;
    const wtDistW  = 2.75;
    const wtUseDist = cfg.wtUseDist || false;
    wtScores = calcWeightedTrend(maArr, atrArr, wtN, wtVolW, wtBodyW, wtDistW, wtUseDist);
  }

  // ── Market Structure (HH/HL) ──────────────────────────────
  let structBull = null, structBear = null;
  if (cfg.useStruct) {
    const spvL = cfg.strPvL || 5;
    const spvR = cfg.strPvR || 2;
    structBull = new Uint8Array(N);
    structBear = new Uint8Array(N);
    let pvHiArr = [], pvLoArr = [];
    for (let i = spvL; i < N - spvR; i++) {
      let isH = true, isL = true;
      for (let j = 1; j <= spvL; j++) { if (DATA[i].h <= DATA[i-j].h) { isH = false; break; } }
      if (isH) for (let j = 1; j <= spvR; j++) { if (DATA[i].h <= DATA[i+j].h) { isH = false; break; } }
      for (let j = 1; j <= spvL; j++) { if (DATA[i].l >= DATA[i-j].l) { isL = false; break; } }
      if (isL) for (let j = 1; j <= spvR; j++) { if (DATA[i].l >= DATA[i+j].l) { isL = false; break; } }
      if (isH) pvHiArr.push({ idx: i, v: DATA[i].h });
      if (isL) pvLoArr.push({ idx: i, v: DATA[i].l });
    }
    let hi1=NaN, hi2=NaN, lo1=NaN, lo2=NaN, pHi=0, pLo=0;
    for (let i = spvL + spvR; i < N; i++) {
      while (pHi < pvHiArr.length && pvHiArr[pHi].idx + spvR <= i) { hi2 = hi1; hi1 = pvHiArr[pHi].v; pHi++; }
      while (pLo < pvLoArr.length && pvLoArr[pLo].idx + spvR <= i) { lo2 = lo1; lo1 = pvLoArr[pLo].v; pLo++; }
      if (!isNaN(hi1) && !isNaN(hi2) && !isNaN(lo1) && !isNaN(lo2)) {
        if (hi1 > hi2 && lo1 > lo2) structBull[i] = 1;
        if (hi1 < hi2 && lo1 < lo2) structBear[i] = 1;
      }
    }
  }

  // ── SL Pivot ──────────────────────────────────────────────
  let pivSLLo = null, pivSLHi = null;
  if (cfg.useSLPiv) {
    const slPivL = cfg.slPivL || 3;
    const slPivR = cfg.slPivR || 1;
    const r = calcPivotLoHi(DATA, slPivL, slPivR);
    pivSLLo = r.lo; pivSLHi = r.hi;
  }

  return {
    pvLo, pvHi, atrArr, atrAvg,
    maArr, maArrConfirm, adxArr, rsiArr,
    bbB, donH, donL,
    atrBoMA, atrBoATR2,
    matMA, matZone,
    sqzOn, sqzCount,
    volAvgArr, bodyAvgArr,
    wtScores,
    structBull, structBear,
    pivSLLo, pivSLHi,
  };
}

// ============================================================
// buildBtCfg(cfg, ind) — собирает объект конфигурации бэктеста
// из сохранённого cfg результата и пересчитанных индикаторов ind.
// ============================================================
function buildBtCfg(cfg, ind) {
  const slPair  = cfg.slPair  || {};
  const tpPair  = cfg.tpPair  || {};
  const slLogic = cfg.slLogic || 'or';
  const tpLogic = cfg.tpLogic || 'or';
  const maP     = cfg.maP     || 0;

  return {
    comm: cfg.commission || 0,

    // ── Входные паттерны ──────────────────────────────────────
    usePivot:   cfg.usePivot   || false,
    pvLo:       ind.pvLo,
    pvHi_:      ind.pvHi,
    useEngulf:  cfg.useEngulf  || false,
    usePinBar:  cfg.usePinBar  || false,
    pinRatio:   cfg.pinRatio   || 2,
    useBoll:    cfg.useBoll    || false,
    bbB:        ind.bbB,
    useDonch:   cfg.useDonch   || false,
    useAtrBo:   cfg.useAtrBo   || false,
    atrBoMult:  cfg.atrBoMult  || 2,
    useMaTouch: cfg.useMaTouch || false,
    matMA:      ind.matMA,
    matZone:    ind.matZone,
    useSqueeze: cfg.useSqueeze || false,
    sqzMinBars: cfg.sqzMinBars || 1,
    // TL/Flag/Triangle — не оптимизируются, всегда false
    useTLTouch: false, useTLBreak: false,
    useFlag:    false, useTri:     false,
    tfSigL:     null,  tfSigS:     null,

    // ── SL / TP ───────────────────────────────────────────────
    hasSLA:    !!(slPair.a),
    slMult:    slPair.a ? slPair.a.m : 0,
    hasSLB:    !!(slPair.p),
    slPctMult: slPair.p ? slPair.p.m : 0,
    slLogic,
    hasTPA:    !!(tpPair.a),
    tpMult:    tpPair.a ? tpPair.a.m   : 0,
    tpMode:    tpPair.a ? tpPair.a.type : 'rr',
    hasTPB:    !!(tpPair.b),
    tpMultB:   tpPair.b ? tpPair.b.m   : 0,
    tpModeB:   tpPair.b ? tpPair.b.type : 'rr',
    tpLogic,

    // ── Exits ─────────────────────────────────────────────────
    useBE:    cfg.useBE    || false,
    beTrig:   cfg.beTrig   || 1,
    beOff:    cfg.beOff    || 0,
    useTrail: cfg.useTrail || false,
    trTrig:   cfg.trTrig   || 1,
    trDist:   cfg.trDist   || 0.5,
    useRev:   cfg.useRev   || false,
    revBars:  cfg.revBars  || 2,
    revMode:  cfg.revMode  || 'any',
    revAct:   cfg.revAct   || 'exit',
    revSrc:   cfg.revSrc   || 'same',
    revSkip:       cfg.revSkip       || 0,
    revCooldown:   cfg.revCooldown   || 0,
    useTime:  cfg.useTime  || false,
    timeBars: cfg.timeBars || 20,
    timeMode: cfg.timeMode || 'any',
    usePartial: cfg.usePartial || false,
    partRR:     cfg.partRR     || 1,
    partPct:    cfg.partPct    || 50,
    partBE:     cfg.partBE     || false,
    useClimax:  cfg.useClimax  || false,
    clxVolMult:  cfg.clxVolMult  || 3,
    clxBodyMult: cfg.clxBodyMult || 1.5,
    clxMode:     cfg.clxMode     || 'any',

    // ── Фильтры ───────────────────────────────────────────────
    useMA:    maP > 0,
    maArr:    ind.maArr,
    useADX:   cfg.useADX   || false,
    adxArr:   ind.adxArr,
    adxThresh: cfg.adxThresh || 25,
    adxLen:    cfg.adxLen    || 14,
    useRSI:   cfg.useRSI   || false,
    rsiArr:   ind.rsiArr,
    rsiOS:    cfg.rsiOS    || 30,
    rsiOB:    cfg.rsiOB    || 70,
    useVolF:  cfg.useVolF  || false,
    atrAvg:   ind.atrAvg,
    volFMult: cfg.volFMult || 1.5,
    useStruct:  cfg.useStruct  || false,
    structBull: ind.structBull,
    structBear: ind.structBear,
    strPvL:     cfg.strPvL     || 5,
    strPvR:     cfg.strPvR     || 2,
    useSLPiv:   cfg.useSLPiv   || false,
    slPivOff:   cfg.slPivOff   || 0.2,
    slPivMax:   cfg.slPivMax   || 3,
    slPivL:     cfg.slPivL     || 3,
    slPivR:     cfg.slPivR     || 1,
    pivSLLo:    ind.pivSLLo,
    pivSLHi:    ind.pivSLHi,
    useConfirm: cfg.useConfirm || false,
    confN:       cfg.confN       || 2,
    confMatType: cfg.confMatType || 'EMA',
    maArrConfirm: ind.maArrConfirm,
    useMaDist:  cfg.useMaDist  || false,
    maDistMax:  cfg.maDistMax  || 2,
    useCandleF: cfg.useCandleF || false,
    candleMin:  cfg.candleMin  || 0.3,
    candleMax:  cfg.candleMax  || 3,
    useConsec:  cfg.useConsec  || false,
    consecMax:  cfg.consecMax  || 5,
    useSTrend:  cfg.useSTrend  || false,
    sTrendWin:  cfg.sTrendWin  || 10,
    useFresh:   cfg.useFresh   || false,
    freshMax:   cfg.freshMax   || 10,
    useVSA:     cfg.useVSA     || false,
    vsaMult:    cfg.vsaMult    || 1.5,
    volAvg:     ind.volAvgArr,
    useLiq:     cfg.useLiq     || false,
    liqMin:     cfg.liqMin     || 0.5,
    useVolDir:  cfg.useVolDir  || false,
    volDirPeriod: cfg.volDirPeriod || 10,
    useWT:      cfg.useWT      || false,
    wtScores:   ind.wtScores,
    wtThresh:   cfg.wtThresh   || 15,
    useFat:     cfg.useFat     || false,
    fatConsec:  cfg.fatConsec  || 6,
    fatVolDrop: cfg.fatVolDrop || 0.7,
    bodyAvg:    ind.bodyAvgArr,

    start: Math.max(maP || 0, 50) + 2,
    pruning: false,
    maxDDLimit: 300,
  };
}

// ##SECTION_C##
// МАССОВЫЙ ТЕСТ УСТОЙЧИВОСТИ
// ============================================================
let _massRobRunning = false;

async function runMassRobust() {
  if (!DATA) { alert('Нет данных'); return; }
  if (_massRobRunning) {
    _massRobRunning = false;
    $('mass-rob-progress').textContent = '⏹ Остановлено';
    const btn = $('btn-mass-robust');
    if (btn) btn.textContent = '🔬 Тест всех видимых';
    return;
  }


  const tests = [];
  if ($c('mrb_walk'))  tests.push('walk');
  if ($c('mrb_oos'))   tests.push('oos');
  if ($c('mrb_param')) tests.push('param');
  if ($c('mrb_mc'))    tests.push('mc');
  if ($c('mrb_noise')) tests.push('noise');
  if (!tests.length) { alert('Выбери хотя бы один тест'); return; }

  // Снимаем СНАПШОТ результатов ДО начала теста
  // Используем results (полный массив) а не _visibleResults (меняется при applyFilters)
  // Фильтруем только видимые на момент нажатия — по индексам в _visibleResults
  const toTest = _visibleResults.filter(r => r.cfg);
  if (!toTest.length) { alert('Нет результатов с cfg'); return; }

  _massRobRunning = true;
  const btn = $('btn-mass-robust');
  if (btn) btn.textContent = '⏹ Стоп';

  // Инвалидируем кэш: настройки (param_spread, noise_runs и т.д.) могли измениться
  _robCache.clear();
  _robSliceCache.clear();

  for (let i = 0; i < toTest.length; i++) {
    if (!_massRobRunning) break;
    const r = toTest[i];
    $('mass-rob-progress').textContent = `⏳ ${i+1}/${toTest.length}: ${r.name.slice(0,35)}…`;
    if (i % 5 === 0) await yieldToUI();

    _robSliceCache.clear(); // очищаем кэш слайсов между стратегиями
    const { score, details } = await runRobustScoreForDetailed(r, tests);

    r.robScore = score;
    r.robMax   = tests.length;
    r.robDetails = details; // { oos:0..3, walk:0/1, param:0/1, noise:0/1, mc:0/1 }

    // Синхронизируем с favourites и results если это fav/hc режим
    const fIdx = favourites.findIndex(f => f.name === r.name);
    if (fIdx >= 0) {
      favourites[fIdx].stats.robScore = score;
      favourites[fIdx].stats.robMax = tests.length;
      favourites[fIdx].stats.robDetails = details;
    }
    const rIdx = results.findIndex(x => x.name === r.name);
    if (rIdx >= 0) { results[rIdx].robScore = score; results[rIdx].robMax = tests.length; results[rIdx].robDetails = details; }
    const hIdx = _hcTableResults ? _hcTableResults.findIndex(x => x.name === r.name) : -1;
    if (hIdx >= 0) { _hcTableResults[hIdx].robScore = score; _hcTableResults[hIdx].robMax = tests.length; _hcTableResults[hIdx].robDetails = details; }
  }

  _massRobRunning = false;
  if (btn) btn.textContent = '🔬 Тест всех видимых';
  $('mass-rob-progress').textContent = `✅ Готово: ${toTest.length} проверено`;
  renderVisibleResults();
}

// Запускает тесты для одного результата, возвращает число пройденных
async function runRobustScoreFor(r, tests, _fastMode) {
  const cfg = r.cfg;
  // ── ИДЕЯ 2: Проверяем кэш — fastMode и обычный режим хранятся раздельно
  // (разные параметры MC/Noise/порогов — результаты не взаимозаменяемы)
  const _cacheTests = _fastMode ? tests.map(t => t + '_fast') : tests;
  const _cached = _robCacheGet(cfg, _cacheTests);
  if (_cached !== null) return _cached;

  const fullDATA = DATA;
  let passed = 0;

  function runOnSlice(slice) {
    if (!slice || slice.length < 40) return null;
    const origDATA = DATA;
    DATA = slice;
    try {
      if (_robSliceCacheDataHash !== _getDataHash()) { _robSliceCache.clear(); _robSliceCacheDataHash = _getDataHash(); }
      const _sk = _getRobSliceKey(cfg, slice);
      if (_robSliceCache.has(_sk)) { DATA = origDATA; return _robSliceCache.get(_sk); }
      const ind   = _calcIndicators(cfg);
      const btCfg = buildBtCfg(cfg, ind);
      const _res  = backtest(ind.pvLo, ind.pvHi, ind.atrArr, btCfg);
      _robSliceCache.set(_sk, _res);
      return _res;
    } catch(e) { return null; }
    finally { DATA = origDATA; }
  }

  const base = runOnSlice(fullDATA);
  if (!base || base.n < 5) return 0;

  // ── ИДЕЯ 1: Каскадный порядок: OOS (быстрый) → Walk → Param → MC → Noise (медленный)
  // ── ИДЕЯ 4: Ранняя остановка — если оставшихся тестов не хватит для minNeeded
  const _stopCheck = () => !_massRobRunning && !_hcRobRunning;
  const _remaining = (already, total) => total - already;
  // minNeeded: в _fastMode хотим знать достижим ли максимум = tests.length
  // Если passed + remaining < tests.length → дальше нет смысла (для _fastMode)
  const _cascade = _fastMode; // каскад включён только в fastMode (HC rob режим)

  // ── 1. OOS — тест на трёх участках: первые/середина/последние 20%
  // Идея: если слабый только на 1 из 3 — это фаза рынка, а не слабость стратегии
  // Тест пройден если 2+ из 3 участков прибыльны
  if (tests.includes('oos')) {
    const N = fullDATA.length;
    const segLen = Math.floor(N * 0.20);
    const oosSegments = [
      fullDATA.slice(0, segLen),                               // первые 20%
      fullDATA.slice(Math.floor(N*0.40), Math.floor(N*0.60)), // середина 20%
      fullDATA.slice(N - segLen),                              // последние 20%
    ];
    // IS: полная выборка (для retention)
    const pnlFull = base.pnl;
    const pnlPerBar = pnlFull / N;
    let oosPassed = 0;
    const oosRetentions = [];
    for (const seg of oosSegments) {
      const rSeg = runOnSlice(seg);
      if (rSeg && rSeg.n >= 3) {
        const retained = pnlPerBar > 0 ? rSeg.pnl / (pnlPerBar * seg.length) : (rSeg.pnl > 0 ? 1 : 0);
        oosRetentions.push(retained);
        if (rSeg.pnl > 0 && retained >= 0.1) oosPassed++;
      }
    }
    // Пройден: >= 2 из 3 участков прибыльны
    const oosOk = oosPassed >= 2;
    if (oosOk) passed++;
    // Сохраняем детали для UI (опционально)
    if (r._oosDetail !== undefined) {
      r._oosDetail = { oosPassed, oosRetentions };
    }
    if (!oosOk && _cascade) {
      const remaining = tests.filter(t=>t!=='oos').length;
      if (passed + remaining < tests.length) return passed;
    }
  }
  if (_stopCheck()) return passed;

  // ── 2. Walk-Forward (~3 бэктеста)
  if (tests.includes('walk')) {
    const N=fullDATA.length;
    const r1=runOnSlice(fullDATA.slice(0,Math.floor(N*0.33)));
    const r2=runOnSlice(fullDATA.slice(Math.floor(N*0.33),Math.floor(N*0.66)));
    const r3=runOnSlice(fullDATA.slice(Math.floor(N*0.66)));
    const parts=[r1,r2,r3].filter(x=>x&&x.n>=5);
    if(parts.length>=2&&parts.every(x=>x.pnl>0)) passed++;
    else if(_cascade) {
      const remaining = tests.filter(t=>t!=='oos'&&t!=='walk').length;
      if (passed + remaining < tests.length) return passed;
    }
  }
  if (_stopCheck()) return passed;

  // ── 3. Param sensitivity (~4 бэктеста)
  if (tests.includes('param')) {
    const savedSl=cfg.slPair, savedTp=cfg.tpPair;
    const mut=(pair,m)=>{if(!pair)return pair;const np=JSON.parse(JSON.stringify(pair));if(np.a&&np.a.m)np.a.m=+(np.a.m*m).toFixed(2);if(np.p&&np.p.m)np.p.m=+(np.p.m*m).toFixed(2);return np;};
    const variants=[];
    // Разброс читается из UI (по умолчанию 30%)
    const _pSpread = Math.max(5, Math.min(50, parseInt(document.getElementById('param_spread')?.value) || 30)) / 100;
    const _pLo = +(1 - _pSpread).toFixed(2), _pHi = +(1 + _pSpread).toFixed(2);
    for(const sm of[_pLo,_pHi])for(const tm of[_pLo,_pHi]){cfg.slPair=mut(savedSl,sm);cfg.tpPair=mut(savedTp,tm);const rv=runOnSlice(fullDATA);if(rv&&rv.n>=5)variants.push(rv.pnl);}
    cfg.slPair=savedSl; cfg.tpPair=savedTp;
    // Пройден если хотя бы 3 из 4 вариантов прибыльны (не все — допускаем одну неудачу)
    const paramPassed = variants.filter(v=>v>0).length;
    if(variants.length>=3 && paramPassed>=3) passed++;
    else if(_cascade) {
      const remaining = tests.filter(t=>!['oos','walk','param'].includes(t)).length;
      if (passed + remaining < tests.length) return passed;
    }
  }
  if (_stopCheck()) return passed;

  // ── 4. MC (~150/500 перестановок) — до Noise т.к. детерминировано
  if (tests.includes('mc')) {
    const eq=base.eq; const tradePnls=[];
    for(let i=1;i<eq.length;i++){const d=eq[i]-eq[i-1];if(Math.abs(d)>0.001)tradePnls.push(d);}
    if(tradePnls.length>=10){
      const dds=[];
      const _mcN = _fastMode ? 150 : 500;
      for(let s=0;s<_mcN;s++){
        if(s%50===0 && _stopCheck()) break;
        if(s%25===0 && s>0) await yieldToUI();
        const t=[...tradePnls];
        for(let i=t.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[t[i],t[j]]=[t[j],t[i]];}
        let eq2=0,pk=0,dd=0;t.forEach(p=>{eq2+=p;if(eq2>pk)pk=eq2;dd=Math.max(dd,pk-eq2);});
        dds.push(dd);
      }
      dds.sort((a,b)=>a-b);
      if(dds.length>10 && dds[Math.floor(dds.length*0.95)]<Math.abs(base.pnl)) passed++;
      else if(_cascade) {
        const remaining = tests.includes('noise') ? 1 : 0;
        if (passed + remaining < tests.length) return passed;
      }
    }
  }
  if (_stopCheck()) return passed;

  // ── 5. Noise — самый медленный (20/50 бэктестов)
  // ── ИДЕЯ 4: ранняя остановка — если результат уже ясен
  if (tests.includes('noise')) {
    const pnls=[];
    const _noiseN = Math.max(5, Math.min(100, parseInt(document.getElementById('noise_runs')?.value) || (_fastMode ? 10 : 50)));
    const _noiseLevel = (parseFloat(document.getElementById('noise_level')?.value) || (_fastMode ? 0.2 : 0.05)) / 100;
    const _noiseThr = _fastMode ? 0.6 : 0.7;
    for(let s=0;s<_noiseN;s++){
      if(_stopCheck()) break;
      if(s%10===0 && s>0) await yieldToUI();
      const noisy=fullDATA.map(b=>{const f=1+(Math.random()-0.5)*2*_noiseLevel;return{o:b.o*f,h:b.h*f,l:b.l*f,c:b.c*f,v:b.v};});
      const rv=runOnSlice(noisy); if(rv&&rv.n>=5) pnls.push(rv.pnl);
      // ── Ранняя остановка (Идея 4): после ≥5 прогонов проверяем достижимость
      if(_fastMode && pnls.length>=5) {
        const okSoFar = pnls.filter(p=>p>0).length;
        const maxOk = okSoFar + (_noiseN - s - 1); // лучший возможный исход
        const minOk = okSoFar; // худший
        const need = Math.ceil(_noiseThr * _noiseN);
        if(maxOk < need) break; // даже при идеальном раскладе не пройдём
        if(minOk >= need) break; // уже точно прошли — не нужно продолжать
      }
    }
    if(pnls.length>=5&&pnls.filter(p=>p>0).length/pnls.length>=_noiseThr) passed++;
  }
  // ── Сохраняем в кэш (с учётом режима fastMode)
  _robCacheSet(cfg, _cacheTests, passed);
  return passed;
}

// Версия с деталями: возвращает { score, details }
async function runRobustScoreForDetailed(r, tests, _fastMode) {
  const cfg = r.cfg;
  const details = {};

  // ── OOS: проверяем 3 участка напрямую через _hcRunBacktest, возвращаем 0..3
  if (tests.includes('oos')) {
    const N = DATA.length;
    const segLen = Math.floor(N * 0.20);
    const oosSegs = [
      DATA.slice(0, segLen),                               // первые 20%
      DATA.slice(Math.floor(N*0.40), Math.floor(N*0.60)), // середина 20%
      DATA.slice(N - segLen),                              // последние 20%
    ];
    // IS baseline для retention
    const _rFull = _hcRunBacktest(cfg);
    const _pnlPerBarFull = (_rFull && _rFull.pnl && N > 0) ? _rFull.pnl / N : 0;
    let oosCount = 0;
    for (const seg of oosSegs) {
      const orig = DATA;
      DATA = seg;
      try {
        const rSeg = _hcRunBacktest(cfg);
        if (rSeg && rSeg.n >= 3 && rSeg.pnl > 0) {
          // Retention: сравниваем pnl/bar с IS
          const _segRetention = (_pnlPerBarFull > 0)
            ? rSeg.pnl / (_pnlPerBarFull * seg.length)
            : (rSeg.pnl > 0 ? 1 : 0);
          if (_segRetention >= 0.1) oosCount++;
        }
      } finally { DATA = orig; }
    }
    details['oos'] = oosCount; // 0, 1, 2 или 3
  }

  // ── Walk/Param/Noise/MC: запускаем по одному, возвращают 0 или 1
  for (const t of ['walk','param','noise','mc']) {
    if (!tests.includes(t)) continue;
    details[t] = await runRobustScoreFor({ cfg }, [t], _fastMode);
  }

  // ── Итоговый robScore: OOS пройден если >= 2/3, остальные 0/1
  let total = 0;
  if (details.oos !== undefined) total += (details.oos >= 2 ? 1 : 0);
  for (const t of ['walk','param','noise','mc']) {
    if (details[t] !== undefined) total += details[t];
  }
  // Идея 10: обучаем robSurrogate на полном результате
  _robSurrogate.addPoint(r.cfg || r, total);
  return { score: total, details };
}

// ##SECTION_D##
let _hcRunning = false;
let _hcRobRunning = false; // флаг прерывания теста устойчивости внутри HC
let _hcSourceResult = null;

// ── ИДЕЯ 2: Кэш результатов тестов в памяти (сбрасывается при смене DATA)
const _robCache = new Map(); // key → {score, tests, dataHash}
// Per-slice indicator+backtest result cache (shared across multiple rob test calls for same cfg)
// Key: cfgKey + '|' + sliceKey  Value: backtest result
const _robSliceCache = new Map();
let _robSliceCacheDataHash = '';
// ── HC_NUMERIC_PARAMS ────────────────────────────────────────────────
// ЕДИНЫЙ ИСТОЧНИК ИСТИНЫ для всех числовых параметров HC.
// Добавить новый параметр = добавить одну строку сюда.
// _fastCfgKey строится автоматически — не нужно обновлять вручную.
const HC_NUMERIC_PARAMS = [
  // Базовые
  ['pvL',5],['pvR',2],['atrPeriod',14],['maP',0],
  ['adxLen',14],['adxThresh',25],
  ['rsiOS',30],['rsiOB',70],['atrBoMult',2],
  // Выходы
  ['beTrig',1.0],['beOff',0],['trTrig',1.0],['trDist',0.5],['timeBars',20],
  // RevSig
  ['revBars',2],['revSkip',0],['revCooldown',0],
  // Фильтры
  ['confN',2],['sTrendWin',10],
  ['volFMult',1.5],['vsaMult',1.8],['wtThresh',15],
  ['freshMax',10],['maDistMax',2],
  // Структурные (не мутируются HC но нужны для уникальности кэша)
  ['bbLen',20],['bbMult',2],['donLen',20],['sqzBBLen',20],['matPeriod',20],
];

function _fastCfgKey(cfg) {
  // Автоматически строится из HC_NUMERIC_PARAMS — при добавлении параметра
  // достаточно добавить его в HC_NUMERIC_PARAMS выше.
  const parts = HC_NUMERIC_PARAMS.map(([k,def]) => cfg[k] ?? def);
  parts.push(
    cfg.slPair ? JSON.stringify(cfg.slPair) : '',
    cfg.tpPair ? JSON.stringify(cfg.tpPair) : '',
    cfg.maType||'EMA',
    cfg.useBE?1:0, cfg.useTrail?1:0, cfg.useRev?1:0, cfg.useTime?1:0,
    cfg.commission||0
  );
  return parts.join('|');
}
function _getRobSliceKey(cfg, slice) {
  return _fastCfgKey(cfg) + '||' + slice.length + '_' + (slice[0]?.c||0).toFixed(2) + '_' + (slice[slice.length-1]?.c||0).toFixed(2);
}
let _robCacheDataHash = ''; // хэш текущих данных

function _getRobCacheKey(cfg, tests) {
  return _fastCfgKey(cfg) + '|' + tests.slice().sort().join(',');
}
function _getDataHash() {
  if (!DATA || !DATA.length) return '';
  return DATA.length + '_' + (DATA[0]?.c||0).toFixed(3) + '_' + (DATA[DATA.length-1]?.c||0).toFixed(3);
}
function _robCacheGet(cfg, tests) {
  const hash = _getDataHash();
  if (hash !== _robCacheDataHash) {
    _robCache.clear(); // данные изменились — кэш невалиден
    _robCacheDataHash = hash;
  }
  const key = _getRobCacheKey(cfg, tests);
  return _robCache.has(key) ? _robCache.get(key) : null;
}
function _robCacheSet(cfg, tests, score) {
  _robCache.set(_getRobCacheKey(cfg, tests), score);
  // ── ИДЕЯ 9: localStorage persistence (dataHash в ключе = валидность между сессиями)
  try {
    const storeKey = 'rob_' + _getDataHash() + '|' + _getRobCacheKey(cfg, tests);
    if (storeKey.length < 300) { // не сохраняем слишком длинные ключи
      localStorage.setItem(storeKey, String(score));
      // Лимит: если >2000 записей — очищаем старые
      const keys = Object.keys(localStorage).filter(k => k.startsWith('rob_'));
      if (keys.length > 2000) {
        keys.slice(0, 500).forEach(k => localStorage.removeItem(k));
      }
    }
  } catch(e) {} // localStorage может быть недоступен
}
function _robCacheLoad() {
  // При старте загружаем кэш из localStorage для текущих данных
  try {
    const prefix = 'rob_' + _getDataHash() + '|';
    let loaded = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) {
        const cfgTestsKey = k.slice(prefix.length);
        const score = parseInt(localStorage.getItem(k));
        if (!isNaN(score)) { _robCache.set(cfgTestsKey, score); loaded++; }
      }
    }
    if (loaded > 0) console.log('[RobCache] Loaded ' + loaded + ' entries from localStorage');
  } catch(e) {}
}
