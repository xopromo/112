// ============================================================
// DETAIL PANEL
// ============================================================
let _detailText = '';

function row(label, val, cls='') {
  return `<div class="dp-row"><span class="dp-label">${label}</span><span class="dp-val ${cls}">${val}</span></div>`;
}
function section(icon, title, content) {
  if (!content) return '';
  return `<div class="dp-section">
    <div class="dp-section-title">${icon} ${title}</div>
    ${content}
  </div>`;
}
function onoff(v, onLabel='', offLabel='ВЫКЛ') {
  return v ? `<span class="on">ВКЛ${onLabel?' · '+onLabel:''}</span>` : `<span class="off">${offLabel}</span>`;
}

function showDetail(r) {
  if (!r.cfg) return;
  _robustResult = r;  // запоминаем для теста устойчивости
  _tvCmpCurrentResult = r; // для loadTVcsv
  const c = r.cfg;

  $('dp-title').textContent = r.name;

  // Stats bar — unified IS + TV rows via CSS grid
  const _fwd = r.cfg && r.cfg._oos && r.cfg._oos.forward;
  const _hasLS = r.wrL != null;
  // Column count: PnL WinRate Сделок MaxDD P/DD UPI Sortino Omega Pain Burke Serenity = 11
  const _ncols = 11;

  // Build one row of dp-stat cells (same structure for both IS and TV)
  function _statsRow(v) {
    const pddC = v.pdd>=10?'pos':v.pdd>=5?'warn':'neg';
    const dwrC = v.dwr<10?'ok':v.dwr<20?'warn':'bad';
    const cvrC = v.cvr!=null ? (v.cvr>=80?'pos':v.cvr>=50?'warn':'neg') : 'muted';
    const cvrV = v.cvr!=null ? v.cvr+'%' : '—';
    const upiC = v.upi!=null ? (v.upi>=5?'pos':v.upi>=2?'warn':'neg') : 'muted';
    const upiV = v.upi!=null ? v.upi.toFixed(1) : '—';
    const sorC = v.sortino!=null ? (v.sortino>=3?'pos':v.sortino>=2?'warn':'neg') : 'muted'; // ##SOR
    const sorV = v.sortino!=null ? v.sortino.toFixed(1) : '—'; // ##SOR
    const omgC = v.omega!=null ? (v.omega>=3?'pos':v.omega>=2?'warn':'neg') : 'muted'; // ##OMG
    const omgV = v.omega!=null ? v.omega.toFixed(1) : '—'; // ##OMG
    const painC   = v.pain!=null   ? (v.pain>=5?'pos':v.pain>=3?'warn':'neg')     : 'muted'; // ##PAIN
    const painV   = v.pain!=null   ? v.pain.toFixed(1)   : '—'; // ##PAIN
    const burkeC  = v.burke!=null  ? (v.burke>=3?'pos':v.burke>=2?'warn':'neg')   : 'muted'; // ##BURKE
    const burkeV  = v.burke!=null  ? v.burke.toFixed(1)  : '—'; // ##BURKE
    const srntyC  = v.serenity!=null ? (v.serenity>=5?'pos':v.serenity>=3?'warn':'neg') : 'muted'; // ##SRNTY
    const srntyV  = v.serenity!=null ? v.serenity.toFixed(1) : '—'; // ##SRNTY
    const irC     = v.ir!=null ? (v.ir>=1?'pos':v.ir>=0?'warn':'neg') : 'muted'; // ##IR
    const irV     = v.ir!=null ? v.ir.toFixed(1) : '—'; // ##IR
    const h =
      `<div class="dp-stat"><div class="v ${(v.pnl??0)>=0?'pos':'neg'}">${(v.pnl??0).toFixed(1)}%</div><div class="l">PnL</div></div>`+
      `<div class="dp-stat"><div class="v">${(v.wr??0).toFixed(1)}%</div><div class="l">WinRate</div></div>`+
      `<div class="dp-stat"><div class="v muted">${v.n??0}</div><div class="l">Сделок</div></div>`+
      `<div class="dp-stat"><div class="v neg">${(v.dd??0).toFixed(1)}%</div><div class="l">MaxDD</div></div>`+
      `<div class="dp-stat"><div class="v ${(v.pdd??0)>=10?'pos':(v.pdd??0)>=5?'warn':'neg'}">${(v.pdd??0).toFixed(1)}</div><div class="l">P/DD</div></div>`+
      `<div class="dp-stat" title="Ulcer Performance Index = PnL / sqrt(mean(просадка²))\nЛучше Calmar: учитывает длительность и частоту просадок.\n≥5 = устойчива ✅ | 2–5 = умеренно | &lt;2 = нестабильна"><div class="v ${upiC}">${upiV}</div><div class="l">UPI</div></div>`+
      `<div class="dp-stat" title="Sortino Ratio = PnL / downside_dev\ndownside_dev = sqrt(mean(min(Δeq,0)²)) — только отриц. движения.\n≥3 = отлично ✅ | ≥2 = хорошо | &lt;1 = нестабильно"><div class="v ${sorC}">${sorV}</div><div class="l">Sortino</div></div>`+
      `<div class="dp-stat" title="Omega Ratio = Σприросты / Σпадения (уровень баров)\nProfit factor без предположения о нормальности. ≥3 = отлично ✅ | ≥2 = хорошо."><div class="v ${omgC}">${omgV}</div><div class="l">Omega</div></div>`+
      `<div class="dp-stat" title="Pain Ratio = PnL / Pain Index\nPain Index = mean(просадка от пика). Штрафует за длительность любых просадок.\n≥5 = отлично ✅ | ≥3 = хорошо | &lt;1 = плохо"><div class="v ${painC}">${painV}</div><div class="l">Pain</div></div>`+
      `<div class="dp-stat" title="Burke Ratio = PnL / √(Σ просадок²)\nУчитывает ВСЕ события просадок, не только максимальную.\n≥3 = отлично ✅ | ≥2 = хорошо | &lt;0.5 = плохо"><div class="v ${burkeC}">${burkeV}</div><div class="l">Burke</div></div>`+
      `<div class="dp-stat" title="Serenity = PnL / (UlcerIdx × TailFactor)\nTailFactor = CVaR(5%) / mean(убытков). Штраф за хвостовые риски.\n≥5 = отлично ✅ | ≥3 = хорошо | &lt;1 = плохо"><div class="v ${srntyC}">${srntyV}</div><div class="l">Serenity</div></div>`;
    return h;
  }

  const _isLabel = _fwd ? `<div class="dp-stats-lbl" title="Отдельный бэктест только на IS-данных (первые ${r.cfg._oos.isPct}%). Используется для отбора стратегий. PnL может отличаться от IS-части графика из-за разной инициализации индикаторов.">IS · оптимизация (${r.cfg._oos.isPct}%) <span style="font-size:.75em;opacity:.6">· изолированный прогон</span></div>` : '';
  const dp = $('dp-stats');
  dp.style.setProperty('--ncols', _ncols);
  dp.innerHTML = _isLabel + _statsRow({
    pnl: r.pnl, wr: r.wr, n: r.n, dd: r.dd, pdd: r.pdd, dwr: r.dwr,
    p1: r.p1, p2: r.p2, c1: r.c1, c2: r.c2, avg: r.avg, cvr: r.cvr??null, upi: r.upi??null,
    sortino: r.sortino??null, // ##SOR
    omega: r.omega??null, pain: r.pain??null, // ##OMG ##PAIN
    burke: r.burke??null, serenity: r.serenity??null, ir: r.ir??null, // ##BURKE ##SRNTY ##IR
    dwrLS: r.dwrLS??null, wrL: r.wrL??null, nL: r.nL||0, wrS: r.wrS??null, nS: r.nS||0
  });

  // TradingView row (full data) — only when IS/OOS was enabled
  if (_fwd && _fwd.pnlFull != null) {
    const oosPct = 100 - r.cfg._oos.isPct;
    dp.innerHTML +=
      `<div class="dp-stats-lbl tv" title="Полный бэктест на всех данных (IS+OOS). Соответствует equity-графику.">${r.cfg.useMLFilter ? '' : 'TradingView · '}полный бэктест (IS+${oosPct}%) <span style="font-size:.75em;opacity:.6">· см. график</span></div>` +
      _statsRow({
        pnl: _fwd.pnlFull, wr: _fwd.wr, n: _fwd.n, dd: _fwd.dd, pdd: _fwd.pdd??0,
        dwr: _fwd.dwr??0, p1: _fwd.p1??0, p2: _fwd.p2??0, c1: _fwd.c1??0, c2: _fwd.c2??0,
        avg: _fwd.avg??0, cvr: _fwd.cvr??null, upi: _fwd.upi??null,
        sortino: _fwd.sortino??null, // ##SOR
        omega: _fwd.omega??null, pain: _fwd.pain??null, // ##OMG ##PAIN
        burke: _fwd.burke??null, serenity: _fwd.serenity??null, ir: _fwd.ir??null, // ##BURKE ##SRNTY ##IR
        dwrLS: _fwd.dwrLS??null, wrL: _fwd.wrL??null, nL: _fwd.nL||0, wrS: _fwd.wrS??null, nS: _fwd.nS||0
      });
  }

  // Helper: SL name
  function slName(pair) {
    if (!pair) return '—';
    if (pair.combo) {
      const lg = c.slLogic==='or' ? 'ИЛИ (выход по ближнему)' : 'И (выход по дальнему)';
      return `ATR ×${pair.a?.m??0}  ${c.slLogic.toUpperCase()}  ${pair.p?.m??0}%  [${lg}]`;
    }
    if (pair.a) return `ATR × ${pair.a.m??0}`;
    if (pair.p) return `${pair.p.m??0}% от цены`;
    return '—';
  }
  function tpName(pair) {
    if (!pair) return '—';
    function one(t) {
      if (!t) return '—';
      if (t.type==='rr') return `R:R = ${t.m??0} (от SL)`;
      if (t.type==='atr') return `ATR × ${t.m??0}`;
      return `${t.m??0}% от цены`;
    }
    if (pair.combo) {
      const lg = c.tpLogic==='or' ? 'ИЛИ (выход по ближнему)' : 'И (выход по дальнему)';
      return `${one(pair.a)}  ${c.tpLogic.toUpperCase()}  ${one(pair.b)}  [${lg}]`;
    }
    return one(pair.a);
  }

  // Build sections HTML
  let html = '';

  // 1. ENTRY PATTERNS
  let ent = '';
  ent += row('Pivot Points',        c.usePivot  ? `ВКЛ · Left=${c.pvL??0} баров, Right=${c.pvR??0} баров` : 'ВЫКЛ', c.usePivot?'on':'off');
  ent += row('Поглощение Engulfing',c.useEngulf ? 'ВКЛ' : 'ВЫКЛ',                                              c.useEngulf?'on':'off');
  ent += row('Pin Bar',             c.usePinBar ? `ВКЛ · тень/тело ≥ ${c.pinRatio??0}` : 'ВЫКЛ',                  c.usePinBar?'on':'off');
  ent += row('Пробой Боллинджера',  c.useBoll   ? `ВКЛ · период=${c.bbLen??0}, σ=${c.bbMult??0}` : 'ВЫКЛ',           c.useBoll?'on':'off');
  ent += row('Пробой Дончиана',     c.useDonch  ? `ВКЛ · период=${c.donLen??0} баров` : 'ВЫКЛ',                   c.useDonch?'on':'off');
  ent += row('ATR-канал пробой',    c.useAtrBo  ? `ВКЛ · EMA ${c.atrBoLen??0} баров, множитель=${c.atrBoMult??0}` : 'ВЫКЛ', c.useAtrBo?'on':'off');
  ent += row('Касание MA',          c.useMaTouch? `ВКЛ · ${c.matType||'EMA'} ${c.matPeriod??0}, зона=${c.matZone??0}%` : 'ВЫКЛ', c.useMaTouch?'on':'off');
  ent += row('Squeeze (BB+Keltner)',c.useSqueeze? `ВКЛ · BB ${c.sqzBBLen??0}, KC mult=${c.sqzKCMult??0}, мин ${c.sqzMinBars??0} баров в сжатии` : 'ВЫКЛ', c.useSqueeze?'on':'off');
  ent += row('Касание трендовой линии', c.useTLTouch ? `ВКЛ · пивот ${c.tlPvL??0}/${c.tlPvR??0}, зона ±${c.tlZonePct??0}%` : 'ВЫКЛ', c.useTLTouch?'on':'off');
  ent += row('Пробой трендовой линии',  c.useTLBreak ? `ВКЛ · пивот ${c.tlPvL??0}/${c.tlPvR??0}, зона ±${c.tlZonePct??0}%` : 'ВЫКЛ', c.useTLBreak?'on':'off');
  ent += row('Флаг (Flag)',             c.useFlag    ? `ВКЛ · импульс ≥${c.flagImpMin??0}×ATR, макс ${c.flagMaxBars??0} баров, откат ≤${c.flagRetrace??0}` : 'ВЫКЛ', c.useFlag?'on':'off');
  ent += row('Треугольник (Triangle)',  c.useTri     ? 'ВКЛ · симм./восх./нисх., пробой' : 'ВЫКЛ', c.useTri?'on':'off');
  ent += row('RSI выход из зоны',   c.useRsiExit  ? `ВКЛ · период=${c.rsiExitPeriod||14}, OS=${c.rsiExitOS||30} / OB=${c.rsiExitOB||70}` : 'ВЫКЛ', c.useRsiExit?'on':'off');
  ent += row('МА кросс-овер',       c.useMaCross  ? `ВКЛ · ${c.maCrossType||'EMA'} период=${c.maCrossP||20}` : 'ВЫКЛ', c.useMaCross?'on':'off');
  ent += row('Свободный вход',      c.useFreeEntry? 'ВКЛ · сигнал на каждом баре' : 'ВЫКЛ', c.useFreeEntry?'on':'off');
  ent += row('MACD кросс',          c.useMacd     ? `ВКЛ · ${c.macdFast||12}/${c.macdSlow||26}/${c.macdSignalP||9}` : 'ВЫКЛ', c.useMacd?'on':'off');
  ent += row('Stochastic выход',    c.useStochExit? `ВКЛ · K=${c.stochKP||14} D=${c.stochDP||3}, OS=${c.stochOS||20} / OB=${c.stochOB||80}` : 'ВЫКЛ', c.useStochExit?'on':'off');
  ent += row('Объём + движение',    c.useVolMove  ? `ВКЛ · объём ≥ ${c.volMoveMult||1.5}×avg` : 'ВЫКЛ', c.useVolMove?'on':'off');
  ent += row('Inside Bar пробой',   c.useInsideBar? 'ВКЛ' : 'ВЫКЛ', c.useInsideBar?'on':'off');
  ent += row('Разворот N свечей',   c.useNReversal? `ВКЛ · серия ≥ ${c.nReversalN||3} свечей` : 'ВЫКЛ', c.useNReversal?'on':'off');
  if (c.usePChg) {
    const htfA = (c.pChgHtfA||1) > 1 ? ` · HTF×${c.pChgHtfA}` : '';
    ent += row('% изменения цены A', `ВКЛ · ≥${c.pChgPctA||1}% за ${c.pChgPeriodA||10} св.${htfA}`, 'on');
    if (c.usePChgB) {
      const htfB = (c.pChgHtfB||1) > 1 ? ` · HTF×${c.pChgHtfB}` : '';
      ent += row('% изменения цены B (AND)', `ВКЛ · ≥${c.pChgPctB||1}% за ${c.pChgPeriodB||20} св.${htfB}`, 'on');
    }
  } else {
    ent += row('% изменения цены', 'ВЫКЛ', 'off');
  }
  html += section('🎯', 'ПАТТЕРНЫ ВХОДА', ent);

  // 2. SL / TP
  let sltp = '';
  sltp += row('Stop Loss', slName(c.slPair), 'hi');
  sltp += row('Take Profit', tpName(c.tpPair), 'hi');
  if (c.slPair && c.slPair.combo)
    sltp += row('Логика SL (И/ИЛИ)', c.slLogic==='or' ? 'ИЛИ — выход по первому (ближнему) SL' : 'И — выход только когда оба SL пробиты', 'warn');
  if (c.tpPair && c.tpPair.combo)
    sltp += row('Логика TP (И/ИЛИ)', c.tpLogic==='or' ? 'ИЛИ — выход по первому (ближнему) TP' : 'И — выход только когда оба TP пробиты', 'warn');
  sltp += row('SL Pivot (динам)', c.useSLPiv ? `ВКЛ · Left=${c.slPivL||3}, Right=${c.slPivR||1}, оффсет=${c.slPivOff||0.2}×ATR, макс=${c.slPivMax||3}×ATR${c.slPivTrail?' · трейлинг':''}` : 'ВЫКЛ', c.useSLPiv?'on':'off');
  html += section('🛑', 'СТОП-ЛОСС И ТЕЙК-ПРОФИТ', sltp);

  // 3. EXIT MECHANICS
  let ex = '';
  ex += row('Безубыток (BE)',       c.useBE      ? `ВКЛ · триггер ${c.beTrig??0}×ATR от входа, оффсет SL=${c.beOff??0}×ATR (≈0=точный BE)` : 'ВЫКЛ', c.useBE?'on':'off');
  ex += row('Trailing Stop',        c.useTrail   ? `ВКЛ · триггер ${c.trTrig??0}×ATR, дистанция ${c.trDist??0}×ATR` : 'ВЫКЛ', c.useTrail?'on':'off');
  ex += row('Wick Trailing SL', c.useWickTrail ? `ВКЛ · отступ ${c.wickMult??1}×${c.wickOffType||'atr'}` : 'ВЫКЛ', c.useWickTrail?'on':'off');
  ex += row('Обратный сигнал', c.useRev ? [
    `ВКЛ · мин баров в сделке: <b>${c.revBars??0}</b>`,
    `Пропустить N сигналов (skip): <b>${c.revSkip||0}</b>`,
    `Кулдаун после сигнала (cooldown): <b>${c.revCooldown||0}</b> баров`,
    `Режим (mode): <b>${c.revMode||'any'}</b>`,
    `Действие (act): <b>${c.revAct||'exit'}</b>`,
    `Источник (src): <b>${c.revSrc||'same'}</b>`,
  ].join('<br>') : 'ВЫКЛ', c.useRev?'on':'off');
  ex += row('Выход по времени',     c.useTime    ? `ВКЛ · максимум ${c.timeBars??0} баров` : 'ВЫКЛ',                c.useTime?'on':'off');
  ex += row('Частичный TP1',        c.usePartial ? `ВКЛ · уровень SL×${c.partRR??0}, закрыть ${c.partPct??0}%${c.partBE?', затем BE':''}` : 'ВЫКЛ', c.usePartial?'on':'off');
  ex += row('Выход на Climax',      c.useClimax  ? `ВКЛ · объём >${c.clxVolMult??0}×средн, тело >${c.clxBodyMult??0}×средн` : 'ВЫКЛ', c.useClimax?'on':'off');
  html += section('🚪', 'МЕХАНИКИ ВЫХОДА', ex);

  // 4. TREND FILTERS
  let filt = '';
  filt += row('MA фильтр тренда',   c.useMA      ? `ВКЛ · ${c.maType||'EMA'} период=${c.maP??0}${(c.htfRatio&&c.htfRatio>1)?' · HTF ×'+c.htfRatio+'tf':''}` : 'ВЫКЛ',               c.useMA?'on':'off');
  filt += row('ADX (сила тренда)',  c.useADX ? `ВКЛ · ADX(${c.adxLen||14}) > ${c.adxThresh??0}${(c.adxHtfRatio&&c.adxHtfRatio>1)?' · HTF ×'+c.adxHtfRatio+'tf':''}${c.useAdxSlope?' · slope↑('+(c.adxSlopeBars??0)+'b)':''}` : 'ВЫКЛ', c.useADX?'on':'off');
  filt += row('ATR расширяется',   c.useAtrExp  ? `ВКЛ · ATR > ${c.atrExpMult??1}× среднего (антифлет)` : 'ВЫКЛ',  c.useAtrExp?'on':'off');
  filt += row('RSI перекуп/перепрод', c.useRSI   ? `ВКЛ · лонг если RSI < ${c.rsiOS??0}, шорт если RSI > ${c.rsiOB??0}` : 'ВЫКЛ', c.useRSI?'on':'off');
  filt += row('Простой тренд MA',   c.useSTrend  ? `ВКЛ · окно ${c.sTrendWin??0} баров` : 'ВЫКЛ',                  c.useSTrend?'on':'off');
  filt += row('Структура рынка HH/LL', c.useStruct ? `ВКЛ · L${c.strPvL||5} R${c.strPvR||2} · окно ${c.structLen||200}` : 'ВЫКЛ', c.useStruct?'on':'off');
  filt += row('Свежесть тренда',    c.useFresh   ? `ВКЛ · макс ${c.freshMax??0} баров от пересечения MA` : 'ВЫКЛ', c.useFresh?'on':'off');
  filt += row('Волатильность ATR',  c.useVolF    ? `ВКЛ · ATR < ${c.volFMult??0}× среднего` : 'ВЫКЛ',              c.useVolF?'on':'off');
  filt += row('Дистанция от MA',    c.useMaDist  ? `ВКЛ · не дальше ${c.maDistMax??0}×ATR от MA` : 'ВЫКЛ',         c.useMaDist?'on':'off');
  filt += row('Размер свечи',       c.useCandleF ? `ВКЛ · от ${c.candleMin??0}×ATR до ${c.candleMax??0}×ATR` : 'ВЫКЛ', c.useCandleF?'on':'off');
  filt += row('Серия одноцв. свечей', c.useConsec ? `ВКЛ · блок если ≥ ${c.consecMax??0} одноцветных подряд` : 'ВЫКЛ', c.useConsec?'on':'off');
  filt += row('Подтв. МА (вторая)',  c.useConfirm ? `ВКЛ · ${c.confMatType||'EMA'} период=${c.confN??0}${(c.confHtfRatio&&c.confHtfRatio>1)?' · HTF ×'+c.confHtfRatio+'tf':''} · лонг только если цена > MA, шорт только если цена < MA` : 'ВЫКЛ', c.useConfirm?'on':'off');
  html += section('📊', 'ФИЛЬТРЫ — ТРЕНД И ЦЕНА', filt);

  // 5. VOLUME FILTERS
  let vol = '';
  vol += row('Объём ≥ среднего',    c.useVSA     ? `ВКЛ · объём > ${c.vsaMult??0}× среднего за ${c.vsaPeriod??0} баров` : 'ВЫКЛ', c.useVSA?'on':'off');
  vol += row('Ликвидность (мин)',   c.useLiq     ? `ВКЛ · объём > ${c.liqMin??0}× среднего` : 'ВЫКЛ',              c.useLiq?'on':'off');
  vol += row('Направление объёма',  c.useVolDir  ? `ВКЛ · окно ${c.volDirPeriod??0} баров` : 'ВЫКЛ',               c.useVolDir?'on':'off');
  vol += row('Взвешенный тренд',    c.useWT      ? `ВКЛ · порог score=${c.wtThresh??0}, глубина N=${c.wtN??0}, вес объёма=${c.wtVolW??0}, вес тела=${c.wtBodyW??0}${c.wtUseDist?', + дист. от MA':''}` : 'ВЫКЛ', c.useWT?'on':'off');
  vol += row('Усталость тренда',    c.useFat     ? `ВКЛ · ${c.fatConsec??0} свечей подряд + объём падает до ${c.fatVolDrop??0}× среднего` : 'ВЫКЛ', c.useFat?'on':'off');
  html += section('📦', 'ОБЪЁМНЫЕ ФИЛЬТРЫ', vol);

  // 6. GENERAL
  let gen = '';
  gen += row('ATR период',      `${c.atrPeriod??0} баров`, 'hi');
  const _baseC = (c.baseComm !== undefined ? c.baseComm : c.commission) ?? 0;
  const _spr   = (c.spreadVal !== undefined ? c.spreadVal : 0) ?? 0;
  gen += row('Комиссия (1 сторона)', `${_baseC.toFixed(3)}%  (туда+обратно = ${(_baseC*2).toFixed(3)}%)`, '');
  if (_spr > 0) {
    gen += row('Спред (round-trip)', `${_spr.toFixed(3)}%  (${(_spr/2).toFixed(3)}% за сторону)`, '');
    gen += row('Итого затраты (round-trip)', `${(_baseC*2 + _spr).toFixed(3)}%`, 'hi');
  }
  html += section('⚙️', 'ОБЩИЕ ПАРАМЕТРЫ', gen);

  // ##CPCV_START## — удалить этот блок для отката (вместе с _calcCPCVScore в opt.js)
  {
    const _cpcv = _calcCPCVScore(r.cfg);
    if (_cpcv) r.cpcvScore = _cpcv.score; // ##CPCV кэшируем для колонки таблицы
    let _cpcvHtml = '';
    if (_cpcv) {
      const _sc = _cpcv.score >= 80 ? 'pos' : _cpcv.score >= 60 ? 'warn' : 'neg';
      _cpcvHtml += row('Счёт',
        `<span class="${_sc}">${_cpcv.wins} / ${_cpcv.valid} блоков прибыльны · ${_cpcv.score}%</span>`, '');
      const _bHtml = _cpcv.blocks.map((b, i) => {
        if (!b) return `<span style="display:inline-block;min-width:52px;padding:3px 5px;border-radius:4px;background:var(--bg2);color:var(--muted);font-size:.78em;text-align:center">Б${i+1}<br>нет сд</span>`;
        const _bc = b.pnl > 0 ? 'var(--pos)' : 'var(--neg)';
        return `<span style="display:inline-block;min-width:52px;padding:3px 5px;border-radius:4px;background:var(--bg2);color:${_bc};font-size:.78em;text-align:center">Б${i+1}<br>${b.pnl>0?'+':''}${b.pnl.toFixed(1)}%<br>${b.n}сд WR${b.wr}%</span>`;
      }).join('');
      _cpcvHtml += `<div class="dp-row"><span class="dp-label">Блоки</span><span class="dp-val" style="display:flex;gap:5px;flex-wrap:wrap">${_bHtml}</span></div>`;
    } else {
      _cpcvHtml += row('Статус', 'нет данных — нужно ≥300 баров и ≥3 блока с ≥2 сделками', 'muted');
    }
    html = section('📊', 'CPCV — БЛОЧНАЯ ВАЛИДАЦИЯ', _cpcvHtml) + html;
  }
  // ##CPCV_END##

  // ##KR_SQN_START## — удалить для отката (вместе с _calcKRatio/_calcMCPerm в opt.js)
  // SQN теперь из r.sqn (core.js sumPnl2); K-Ratio и MC Perm требуют re-run
  // collectTrades=true нужен для MC Permutation Test (##MC_PERM)
  {
    let _rKS = null;
    try {
      const _ind = _calcIndicators(r.cfg);
      const _btc = buildBtCfg(r.cfg, _ind);
      _btc.collectTrades = true; // ##MC_PERM — нужен tradePnl[] для permutation test
      _rKS = backtest(_ind.pvLo, _ind.pvHi, _ind.atrArr, _btc);
    } catch(_) {}

    const _kr  = _rKS ? _calcKRatio(_rKS.eq) : (r.kRatio ?? null);
    const _sqn = r.sqn ?? (_rKS ? _rKS.sqn : null);
    if (_rKS && _kr != null) r.kRatio = _kr; // кэшируем для колонки таблицы

    let _ksHtml = '';
    if (_kr !== null) {
      const _kc = _kr >= 2 ? 'pos' : _kr >= 1 ? 'warn' : 'neg';
      _ksHtml += row('K-Ratio',
        `<span class="${_kc}">${_kr.toFixed(1)}</span>` +
        ` <span style="opacity:.6;font-size:.85em">${_kr >= 2 ? 'равномерный рост' : _kr >= 1 ? 'умеренная стабильность' : 'нестабильный рост'}</span>`, '');
    } else {
      _ksHtml += row('K-Ratio', 'нет данных', 'muted');
    }
    if (_sqn !== null) {
      const _sc = _sqn >= 5 ? 'pos' : _sqn >= 2 ? 'warn' : 'neg';
      _ksHtml += row('SQN',
        `<span class="${_sc}">${_sqn.toFixed(1)}</span>` +
        ` <span style="opacity:.6;font-size:.85em">${_sqn >= 5 ? 'excellent ✅' : _sqn >= 3 ? 'good' : _sqn >= 1 ? 'average' : 'poor'}</span>`, '');
    } else {
      _ksHtml += row('SQN', 'нет данных — нужно ≥10 сделок', 'muted');
    }
    html = section('📐', 'K-RATIO · SQN', _ksHtml) + html;
  }
  // ##KR_SQN_END##

  // ##MC_PERM_START## — удалить для отката (вместе с _calcMCPerm в opt.js)
  //                   + убрать collectTrades=true в ##KR_SQN_START## выше
  {
    const _pArr = typeof _rKS !== 'undefined' && _rKS ? _rKS.tradePnl : null;
    const _pval = _calcMCPerm(_pArr);
    let _mpHtml = '';
    if (_pval !== null) {
      const _pc = _pval <= 0.01 ? 'pos' : _pval <= 0.05 ? 'warn' : 'neg';
      const _plabel = _pval <= 0.01 ? 'очень значимо ✅' : _pval <= 0.05 ? 'значимо' : 'незначимо';
      _mpHtml += row('p-value',
        `<span class="${_pc}">${_pval.toFixed(3)}</span>` +
        ` <span style="opacity:.6;font-size:.85em">${_plabel}</span>`, '');
      _mpHtml += row('Интерпретация',
        `${_pval <= 0.05 ? 'Стратегия статистически значима — порядок сделок важен' : 'Результат может быть случайностью порядка сделок'}`, 'muted');
    } else {
      _mpHtml += row('p-value', 'нет данных — нужно ≥10 сделок', 'muted');
    }
    html = section('🎲', 'MC PERMUTATION TEST (1000 итераций)', _mpHtml) + html;
  }
  // ##MC_PERM_END##

  // ##AIC_BIC_MDL_START## — удалить для отката: эти строки + _countCfgParams/_calcInfoCriteria в opt.js
  {
    const _ic = _calcInfoCriteria(r.n, r.wr, r.cfg);
    let _icHtml = '';
    if (_ic) {
      const { k, aic, bic, mdl, deltaBic } = _ic;
      const kLabel = k <= 5 ? 'простая' : k <= 10 ? 'умеренная' : k <= 16 ? 'сложная' : 'очень сложная';
      const dC = deltaBic > 10 ? 'pos' : deltaBic > 0 ? 'warn' : 'neg';
      const dLabel = deltaBic > 10 ? 'стратегия оправдывает сложность ✅' : deltaBic > 0 ? 'слабое превосходство над случайной' : 'хуже случайного — возможный перефиттинг';
      _icHtml += row('k (параметров)', `${k} <span style="opacity:.6;font-size:.85em">${kLabel} стратегия</span>`, '');
      _icHtml += row('AIC', `${aic.toFixed(1)} <span style="opacity:.5;font-size:.8em">↓ лучше · 2k − 2·logL</span>`, 'muted');
      _icHtml += row('BIC', `${bic.toFixed(1)} <span style="opacity:.5;font-size:.8em">↓ лучше · k·ln(n) − 2·logL</span>`, 'muted');
      _icHtml += row('MDL (bits)', `${mdl.toFixed(1)} <span style="opacity:.5;font-size:.8em">↓ лучше · BIC/2</span>`, 'muted');
      _icHtml += row('ΔBIC vs случайной', `<span class="${dC}">${deltaBic > 0 ? '+' : ''}${deltaBic.toFixed(1)}</span> <span style="opacity:.6;font-size:.85em">${dLabel}</span>`, '');
    } else {
      _icHtml += row('IC', 'нет данных — нужно ≥5 сделок', 'muted');
    }
    html = section('🧮', 'AIC · BIC · MDL (сложность модели)', _icHtml) + html;
  }
  // ##AIC_BIC_MDL_END##

  // ##PSR_START## — удалить для отката: эти строки + _calcPSR/_normCDF в opt.js
  {
    const _pArr2 = typeof _rKS !== 'undefined' && _rKS ? _rKS.tradePnl : null;
    const _psr   = _calcPSR(_pArr2);
    let _psrHtml = '';
    if (_psr !== null) {
      const _psrC = _psr >= 95 ? 'pos' : _psr >= 70 ? 'warn' : 'neg';
      const _psrLabel = _psr >= 95 ? 'статистически значимо ✅' : _psr >= 70 ? 'умеренно значимо' : 'недостаточно значимо';
      _psrHtml += row('PSR',
        `<span class="${_psrC}">${_psr.toFixed(1)}%</span>` +
        ` <span style="opacity:.6;font-size:.85em">${_psrLabel}</span>`, '');
      _psrHtml += row('Интерпретация',
        'Вероятность что SR > 0 с учётом skewness и kurtosis сделок. PSR ≥ 95% = уверенный позитивный Sharpe.', 'muted');
    } else {
      _psrHtml += row('PSR', 'нет данных — нужно ≥20 сделок', 'muted');
    }
    html = section('📈', 'PSR — ВЕРОЯТНОСТНЫЙ SHARPE RATIO', _psrHtml) + html;
  }
  // ##PSR_END##

  // ##ABLATION_START## — удалить для отката: эти строки + _calcFilterAblation в opt.js
  {
    const _abl = _calcFilterAblation(r.cfg);
    let _ablHtml = '';
    if (_abl && _abl.items.length > 0) {
      _ablHtml += row('Базовый PnL', `${_abl.basePnl.toFixed(1)}%`, 'muted');
      for (const itm of _abl.items) {
        const dC = itm.delta <= -1 ? 'pos' : itm.delta >= 1 ? 'neg' : 'muted';
        const sign = itm.delta > 0 ? '+' : '';
        const label = itm.delta <= -2 ? '🔑 критичен' : itm.delta <= -0.5 ? '✅ важен' : itm.delta >= 2 ? '❌ мешает' : itm.delta >= 0.5 ? '⚠️ лишний?' : '→ нейтральный';
        _ablHtml += row(`${itm.id}`, `<span class="${dC}">${sign}${itm.delta.toFixed(1)}%</span> <span style="opacity:.55;font-size:.82em">${label}</span>`, '');
      }
    } else {
      _ablHtml += row('Статус', 'нет активных фильтров для анализа', 'muted');
    }
    html = section('🔬', 'FEATURE IMPORTANCE (ABLATION)', _ablHtml) + html;
  }
  // ##ABLATION_END##

  // ##HMM_START## — удалить для отката: эти строки + _calcHMM/_calcRegimePerf в opt.js
  {
    const _hmm = _calcHMM();
    let _hmmHtml = '';
    if (_hmm) {
      const bState = _hmm.bullState, beState = 1 - bState;
      const bMean  = bState === 0 ? _hmm.m0 : _hmm.m1;
      const bkMean = bState === 0 ? _hmm.m1 : _hmm.m0;
      const bStay  = _hmm.stayProb[bState], beStay = _hmm.stayProb[beState];
      const bullC  = _hmm.bullPct >= 60 ? 'pos' : _hmm.bullPct >= 40 ? 'warn' : 'neg';
      _hmmHtml += row('Bull режим', `<span class="${bullC}">${_hmm.bullPct}% баров</span> · ср.return ${bMean > 0 ? '+' : ''}${bMean.toFixed(3)}%/бар · остаётся ${bStay}% времени`, '');
      _hmmHtml += row('Bear режим', `<span class="neg">${_hmm.bearPct}% баров</span> · ср.return ${bkMean > 0 ? '+' : ''}${bkMean.toFixed(3)}%/бар · остаётся ${beStay}% времени`, '');
      // Regime Performance
      const _rp = _calcRegimePerf(r.cfg, _hmm);
      if (_rp) {
        const bpC = _rp.bullPnl >= 0 ? 'pos' : 'neg', bkpC = _rp.bearPnl >= 0 ? 'pos' : 'neg';
        _hmmHtml += row('PnL в bull', `<span class="${bpC}">${_rp.bullPnl > 0 ? '+' : ''}${_rp.bullPnl.toFixed(1)}%</span> <span style="opacity:.55;font-size:.82em">(${_rp.bullN} баров)</span>`, '');
        _hmmHtml += row('PnL в bear', `<span class="${bkpC}">${_rp.bearPnl > 0 ? '+' : ''}${_rp.bearPnl.toFixed(1)}%</span> <span style="opacity:.55;font-size:.82em">(${_rp.bearN} баров)</span>`, '');
        const regimeBias = _rp.bullPnl > _rp.bearPnl ? 'тренд-стратегия ✅' : _rp.bearPnl > _rp.bullPnl ? 'боковик-стратегия' : 'нейтральная';
        _hmmHtml += row('Характер', regimeBias, 'muted');
      }
    } else {
      _hmmHtml += row('HMM', 'нет данных — нужно ≥100 баров', 'muted');
    }
    html = section('🌊', 'HMM РЕЖИМЫ + ПРОИЗВОДИТЕЛЬНОСТЬ', _hmmHtml) + html;
  }
  // ##HMM_END##

  // ##TVCOMPARE_START##
  {
    const _tvSec = `<div style="font-size:.78em;color:var(--text3);margin-bottom:6px">Загрузи CSV из TradingView (индикатор USE_EXP → Table Mode → ⬇). Сравниваем <b>Equity%</b> с JS-бэктестом построчно.</div>`+
      `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">`+
      `<input type="file" id="fi-tv-csv" accept=".csv,.tsv" style="display:none" onchange="loadTVcsv(event)">`+
      `<button class="tpl-btn2" style="padding:3px 10px;font-size:.85em" onclick="document.getElementById('fi-tv-csv').click()">📂 TV CSV</button>`+
      `<button class="tpl-btn2" style="padding:3px 10px;font-size:.85em;border-color:#fbbf24;color:#fbbf24" onclick="openOOSDiagnostic()">🔍 OOS Диагностика</button>`+
      (_tableMode === 'oos' && NEW_DATA && NEW_DATA.length ? `<button class="tpl-btn2" style="padding:3px 10px;font-size:.85em;border-color:#c792ea;color:#c792ea" onclick="showOOSTradeDiag(${_oosTableResults.indexOf(r)})">🔬 Диагностика расхождений</button>` : '')+
      `<span id="tv-cmp-status" style="font-size:.78em;color:var(--text3)">файл не загружен</span>`+
      `</div><div id="tv-cmp-results" style="margin-top:6px"></div>`;
    html = section('📡', 'СРАВНЕНИЕ С TRADINGVIEW (E2E)', _tvSec) + html;
  }
  // ##TVCOMPARE_END##

  $('dp-body').innerHTML = html;

  // Build copy text
  _detailText = buildCopyText(r, c, slName, tpName);

  $('detail-overlay').classList.add('open');
  $('detail-panel').classList.add('open');
}

// Карта: поле cfg → {id: HTML-элемент, type: 'chk'|'val'|'sel'}
// Используется для автоматического восстановления настроек из JSON блока
const CFG_HTML_MAP = {
  // ── Паттерны входа ─────────────────────────────────────────────────────────
  usePivot:       {id:'e_pv',            type:'chk'},
  pvL:            {id:'e_pvl',           type:'val'},
  pvR:            {id:'e_pvr',           type:'val'},
  useEngulf:      {id:'e_eng',           type:'chk'},
  usePinBar:      {id:'e_pin',           type:'chk'},
  pinRatio:       {id:'e_pinr',          type:'val'},
  useBoll:        {id:'e_bol',           type:'chk'},
  bbLen:          {id:'e_bbl',           type:'val'},
  bbMult:         {id:'e_bbm',           type:'val'},
  useDonch:       {id:'e_don',           type:'chk'},
  donLen:         {id:'e_donl',          type:'val'},
  useAtrBo:       {id:'e_atrbo',         type:'chk'},
  atrBoLen:       {id:'e_atbl',          type:'val'},
  atrBoMult:      {id:'e_atbm',          type:'val'},
  useMaTouch:     {id:'e_mat',           type:'chk'},
  matType:        {id:'e_matt',          type:'sel'},
  matPeriod:      {id:'e_matp',          type:'val'},
  matZone:        {id:'e_matz',          type:'val'},
  useSqueeze:     {id:'e_sqz',           type:'chk'},
  sqzBBLen:       {id:'e_sqbl',          type:'val'},
  sqzKCMult:      {id:'e_sqkm',          type:'val'},
  sqzMinBars:     {id:'e_sqzb',          type:'val'},
  useTLTouch:     {id:'e_tl_touch',      type:'chk'},
  useTLBreak:     {id:'e_tl_break',      type:'chk'},
  useFlag:        {id:'e_flag',          type:'chk'},
  useTri:         {id:'e_tri',           type:'chk'},
  useRsiExit:     {id:'e_rsix',          type:'chk'},
  rsiExitPeriod:  {id:'e_rsix_p',        type:'val'},
  rsiExitOS:      {id:'e_rsix_os',       type:'val'},
  rsiExitOB:      {id:'e_rsix_ob',       type:'val'},
  useKalmanCross: {id:'e_kalcr',         type:'chk'},
  kalmanCrossLen: {id:'e_kalcrl',        type:'val'},
  useMaCross:     {id:'e_macr',          type:'chk'},
  maCrossP:       {id:'e_macr_p',        type:'val'},
  maCrossType:    {id:'e_macr_t',        type:'sel'},
  useFreeEntry:   {id:'e_free',          type:'chk'},
  useMacd:        {id:'e_macd',          type:'chk'},
  macdFast:       {id:'e_macd_f',        type:'val'},
  macdSlow:       {id:'e_macd_s',        type:'val'},
  macdSignalP:    {id:'e_macd_sg',       type:'val'},
  useEIS:         {id:'e_eis',           type:'chk'},
  eisPeriod:      {id:'e_eis_p',         type:'val'},
  useSoldiers:    {id:'e_soldiers',      type:'chk'},
  useStochExit:   {id:'e_stx',           type:'chk'},
  stochKP:        {id:'e_stx_k',         type:'val'},
  stochDP:        {id:'e_stx_d',         type:'val'},
  stochOS:        {id:'e_stx_os',        type:'val'},
  stochOB:        {id:'e_stx_ob',        type:'val'},
  useVolMove:     {id:'e_volmv',         type:'chk'},
  volMoveMult:    {id:'e_volmv_m',       type:'val'},
  useInsideBar:   {id:'e_inb',           type:'chk'},
  useNReversal:   {id:'e_nrev',          type:'chk'},
  nReversalN:     {id:'e_nrev_n',        type:'val'},
  usePChg:        {id:'e_pchg',          type:'chk'},
  pChgPctA:       {id:'e_pchg_pct_a',    type:'val'},
  pChgPeriodA:    {id:'e_pchg_per_a',    type:'val'},
  pChgHtfA:       {id:'e_pchg_htf_a',    type:'val'},
  usePChgB:       {id:'e_pchgb',         type:'chk'},
  pChgPctB:       {id:'e_pchg_pct_b',    type:'val'},
  pChgPeriodB:    {id:'e_pchg_per_b',    type:'val'},
  pChgHtfB:       {id:'e_pchg_htf_b',    type:'val'},
  useSupertrend:  {id:'e_st',            type:'chk'},
  stAtrP:         {id:'e_st_atrp',       type:'val'},
  stMult:         {id:'e_st_mult',       type:'val'},
  useStExit:      {id:'x_st',            type:'chk'},
  useWaitEntry:   {id:'e_wait_on',       type:'chk'},
  waitBars:       {id:'e_wait_bars',     type:'val'},
  useWaitRetrace: {id:'e_wait_retrace',  type:'chk'},
  waitMaxBars:    {id:'e_wait_maxb',     type:'val'},
  waitCancelAtr:  {id:'e_wait_catr',     type:'val'},
  // ── SL/TP специфика ────────────────────────────────────────────────────────
  useSLPiv:       {id:'s_piv',           type:'chk'},
  slPivTrail:     {id:'s_pivtr',         type:'chk'},
  slPivOff:       {id:'s_pivoff',        type:'val'},
  slPivMax:       {id:'s_pivmax',        type:'val'},
  slPivL:         {id:'s_pivl',          type:'val'},
  slPivR:         {id:'s_pivr',          type:'val'},
  // ── Адаптивные TP/SL (по волатильности) ────────────────────────────────────
  useAdaptiveTP:  {id:'x_adaptive_tp',   type:'chk'},
  tpAtrLen:       {id:'x_tp_atr_len',    type:'val'},
  tpAtrMult:      {id:'x_tp_atr_mult',   type:'val'},
  useAdaptiveSL:  {id:'x_adaptive_sl',   type:'chk'},
  slAtrLen:       {id:'x_sl_atr_len',    type:'val'},
  slAtrMult:      {id:'x_sl_atr_mult',   type:'val'},
  useDynSLStruct: {id:'x_dynsl',         type:'chk'},
  dynSLStructMult:{id:'x_dynsl_m',       type:'val'},
  // ── Механики выхода ────────────────────────────────────────────────────────
  useBE:          {id:'x_be',            type:'chk'},
  beTrig:         {id:'x_bet',           type:'val'},
  beOff:          {id:'x_beo',           type:'val'},
  useTrail:       {id:'x_tr',            type:'chk'},
  trTrig:         {id:'x_trt',           type:'val'},
  trDist:         {id:'x_trd',           type:'val'},
  useWickTrail:   {id:'x_wt',            type:'chk'},
  wickMult:       {id:'x_wt_mult',       type:'val'},
  wickOffType:    {id:'x_wt_type',       type:'sel'},
  useRev:         {id:'x_rev',           type:'chk'},
  revBars:        {id:'x_revb',          type:'val'},
  revSkip:        {id:'x_revskip',       type:'val'},
  revCooldown:    {id:'x_revcd',         type:'val'},
  useTime:        {id:'x_time',          type:'chk'},
  timeBars:       {id:'x_timeb',         type:'val'},
  usePartial:     {id:'x_part',          type:'chk'},
  partRR:         {id:'x_partr',         type:'val'},
  partPct:        {id:'x_partp',         type:'val'},
  partBE:         {id:'x_partbe',        type:'chk'},
  useClimax:      {id:'f_clx',           type:'chk'},
  clxVolMult:     {id:'f_clxm',          type:'val'},
  clxBodyMult:    {id:'f_clxb',          type:'val'},
  // ── Фильтры тренда ─────────────────────────────────────────────────────────
  useMA:          {id:'f_ma',            type:'chk'},
  maType:         {id:'f_mat',           type:'sel'},
  maP:            {id:'f_map',           type:'val'},
  htfRatio:       {id:'f_ma_htf',        type:'val'},
  useADX:         {id:'f_adx',           type:'chk'},
  adxThresh:      {id:'f_adxt',          type:'val'},
  adxLen:         {id:'f_adxl',          type:'val'},
  adxHtfRatio:    {id:'f_adx_htf',       type:'val'},
  useAdxSlope:    {id:'f_adx_slope',     type:'chk'},
  adxSlopeBars:   {id:'f_adx_slope_bars',type:'val'},
  useRSI:         {id:'f_rsi',           type:'chk'},
  rsiOS:          {id:'f_rsios',         type:'val'},
  rsiOB:          {id:'f_rsiob',         type:'val'},
  useAtrExp:      {id:'f_atrexp',        type:'chk'},
  atrExpMult:     {id:'f_atrexpm',       type:'val'},
  useSTrend:      {id:'f_strend',        type:'chk'},
  sTrendWin:      {id:'f_stw',           type:'val'},
  useStruct:      {id:'f_struct',        type:'chk'},
  strPvL:         {id:'f_strpvl',        type:'val'},
  strPvR:         {id:'f_strpvr',        type:'val'},
  useFresh:       {id:'f_fresh',         type:'chk'},
  freshMax:       {id:'f_freshm',        type:'val'},
  useVolF:        {id:'f_volf',          type:'chk'},
  volFMult:       {id:'f_vfm',           type:'val'},
  useMaDist:      {id:'f_madist',        type:'chk'},
  maDistMax:      {id:'f_madv',          type:'val'},
  useCandleF:     {id:'f_candle',        type:'chk'},
  candleMin:      {id:'f_cmin',          type:'val'},
  candleMax:      {id:'f_cmax',          type:'val'},
  useConsec:      {id:'f_consec',        type:'chk'},
  consecMax:      {id:'f_concm',         type:'val'},
  useConfirm:     {id:'f_confirm',       type:'chk'},
  confN:          {id:'f_confn',         type:'val'},
  confMatType:    {id:'f_conf_mat',      type:'sel'},
  confHtfRatio:   {id:'f_conf_htf',      type:'val'},
  // ── Объёмные фильтры ───────────────────────────────────────────────────────
  useVSA:         {id:'f_vsa',           type:'chk'},
  vsaMult:        {id:'f_vsam',          type:'val'},
  vsaPeriod:      {id:'f_vsap',          type:'val'},
  useLiq:         {id:'f_liq',           type:'chk'},
  liqMin:         {id:'f_liqm',          type:'val'},
  useVolDir:      {id:'f_vdir',          type:'chk'},
  volDirPeriod:   {id:'f_vdirp',         type:'val'},
  useWT:          {id:'f_wt',            type:'chk'},
  wtThresh:       {id:'f_wtt',           type:'val'},
  wtN:            {id:'f_wtn',           type:'val'},
  wtVolW:         {id:'f_wtv',           type:'val'},
  wtBodyW:        {id:'f_wtb',           type:'val'},
  wtUseDist:      {id:'f_wtdist',        type:'chk'},
  useFat:         {id:'f_fat',           type:'chk'},
  fatConsec:      {id:'f_fatc',          type:'val'},
  fatVolDrop:     {id:'f_fatv',          type:'val'},
  useKalmanMA:    {id:'f_kalman',        type:'chk'},
  kalmanLen:      {id:'f_kalmanl',       type:'val'},
  useMacdFilter:  {id:'f_macd',          type:'chk'},
  useER:          {id:'f_er',            type:'chk'},
  erPeriod:       {id:'f_erp',           type:'val'},
  erThresh:       {id:'f_ert',           type:'val'},
  // ── Общие настройки ────────────────────────────────────────────────────────
  atrPeriod:      {id:'c_atr',           type:'val'},
};

function buildCopyText(r, c, slName, tpName) {
  const lines = [];
  const on = (flag, text) => flag ? ('ВКЛ' + (text ? ', ' + text : '')) : 'ВЫКЛ';
  lines.push('=== USE OPTIMIZER v6 — НАСТРОЙКИ ===');
  lines.push('Конфиг: ' + r.name);
  lines.push('');
  lines.push('PnL: ' + (r.pnl??0).toFixed(1) + '%   WR: ' + (r.wr??0).toFixed(1) + '%   Сделок: ' + (r.n??0));
  lines.push('MaxDD: ' + (r.dd??0).toFixed(1) + '%   P/DD: ' + (r.pdd??0).toFixed(1) + '   Avg: ' + (r.avg??0).toFixed(2) + '%');
  lines.push('1п: ' + (r.p1??0).toFixed(1) + '% (' + (r.c1??0) + ' сд)   2п: ' + (r.p2??0).toFixed(1) + '% (' + (r.c2??0) + ' сд)   ΔWR: ' + (r.dwr??0).toFixed(1) + '%');
  if (r.wrL != null && r.wrS != null) lines.push('Лонг: WR ' + r.wrL.toFixed(0) + '% (' + (r.nL??0) + ' сд)   Шорт: WR ' + r.wrS.toFixed(0) + '% (' + (r.nS??0) + ' сд)   ΔWR L/S: ' + (r.dwrLS != null ? r.dwrLS.toFixed(0) : '?') + '%');
  lines.push('');
  lines.push('--- ПАТТЕРНЫ ВХОДА ---');
  lines.push('Pivot Points:       ' + on(c.usePivot,  'Left=' + c.pvL + ', Right=' + c.pvR));
  lines.push('Поглощение:         ' + on(c.useEngulf));
  lines.push('Pin Bar:            ' + on(c.usePinBar, 'тень/тело>=' + c.pinRatio));
  lines.push('Боллинджер пробой:  ' + on(c.useBoll,   'период=' + c.bbLen + ', sigma=' + c.bbMult));
  lines.push('Дончиан пробой:     ' + on(c.useDonch,  'период=' + c.donLen));
  lines.push('ATR-канал пробой:   ' + on(c.useAtrBo,  'EMA=' + c.atrBoLen + ', mult=' + c.atrBoMult));
  lines.push('Касание MA:         ' + on(c.useMaTouch,'тип=' + c.matType + ', период=' + c.matPeriod + ', зона=' + c.matZone + '%'));
  lines.push('Squeeze:            ' + on(c.useSqueeze,'BB=' + c.sqzBBLen + ', KC mult=' + c.sqzKCMult + ', мин=' + c.sqzMinBars + ' баров'));
  if (c.usePChg) {
    const htfA = (c.pChgHtfA||1) > 1 ? ` HTF×${c.pChgHtfA}` : '';
    lines.push('% изм. цены (A):    ВКЛ · ≥' + (c.pChgPctA||1) + '% за ' + (c.pChgPeriodA||10) + ' св.' + htfA);
    if (c.usePChgB) {
      const htfB = (c.pChgHtfB||1) > 1 ? ` HTF×${c.pChgHtfB}` : '';
      lines.push('% изм. цены (B AND):ВКЛ · ≥' + (c.pChgPctB||1) + '% за ' + (c.pChgPeriodB||20) + ' св.' + htfB);
    }
  } else {
    lines.push('% изменения цены:   ВЫКЛ');
  }
  lines.push('');
  lines.push('--- СТОП-ЛОСС / ТЕЙК-ПРОФИТ ---');
  lines.push('Stop Loss:    ' + slName(c.slPair));
  lines.push('Take Profit:  ' + tpName(c.tpPair));
  if (c.slPair && c.slPair.combo) lines.push('Логика SL: ' + (c.slLogic==='or' ? 'ИЛИ (выход по ближнему)' : 'И (выход по дальнему)'));
  if (c.tpPair && c.tpPair.combo) lines.push('Логика TP: ' + (c.tpLogic==='or' ? 'ИЛИ (выход по ближнему)' : 'И (выход по дальнему)'));
  lines.push('');
  lines.push('--- МЕХАНИКИ ВЫХОДА ---');
  lines.push('Безубыток:       ' + on(c.useBE,      'триггер=' + (c.beTrig??0) + 'xATR, оффсет=' + (c.beOff??0) + 'xATR'));
  lines.push('Trailing Stop:   ' + on(c.useTrail,   'триггер=' + (c.trTrig??0) + 'xATR, дист=' + (c.trDist??0) + 'xATR'));
  lines.push('Wick Trail SL:   ' + on(c.useWickTrail, 'отступ=' + (c.wickMult??1) + 'x' + (c.wickOffType||'atr')));
  lines.push('Обратный сигнал: ' + on(c.useRev,
    'мин=' + (c.revBars??0) + ' баров' +
    ' | skip=' + (c.revSkip||0) +
    ' | cooldown=' + (c.revCooldown||0) +
    ' | mode=' + (c.revMode||'any') +
    ' | act=' + (c.revAct||'exit') +
    ' | src=' + (c.revSrc||'same')
  ));
  lines.push('Выход по времени:' + on(c.useTime,    'макс=' + (c.timeBars??0) + ' баров'));
  lines.push('Частичный TP1:   ' + on(c.usePartial, 'уровень=SLx' + (c.partRR??0) + ', закрыть ' + (c.partPct??0) + '%' + (c.partBE ? ', потом BE' : '')));
  lines.push('Climax выход:    ' + on(c.useClimax,  'объём>' + (c.clxVolMult??0) + 'x, тело>' + (c.clxBodyMult??0) + 'x'));
  lines.push('');
  lines.push('--- ФИЛЬТРЫ ТРЕНДА ---');
  lines.push('MA фильтр:        ' + on(c.useMA,      (c.maType||'EMA') + ' период=' + (c.maP??0) + ((c.htfRatio&&c.htfRatio>1) ? ' HTF×'+c.htfRatio+'tf' : '')));
  lines.push('ADX:              ' + on(c.useADX,     'ADX>' + (c.adxThresh??0) + ((c.adxHtfRatio&&c.adxHtfRatio>1) ? ' HTF×'+c.adxHtfRatio+'tf' : '') + (c.useAdxSlope ? ' slope↑('+(c.adxSlopeBars??0)+'b)' : '')));
  lines.push('ATR расширяется:  ' + on(c.useAtrExp,  'ATR>' + (c.atrExpMult||1.0) + 'x среднего'));
  lines.push('RSI:              ' + on(c.useRSI,     'лонг<' + (c.rsiOS??0) + ', шорт>' + (c.rsiOB??0)));
  lines.push('Простой тренд:    ' + on(c.useSTrend,  'окно=' + (c.sTrendWin??0) + ' баров'));
  lines.push('Структура рынка:  ' + on(c.useStruct,  'pvl=' + (c.strPvL||5) + ' pvr=' + (c.strPvR||2)));
  lines.push('Свежесть тренда:  ' + on(c.useFresh,   'макс=' + (c.freshMax??0) + ' баров'));
  lines.push('Волатильность ATR:' + on(c.useVolF,    'ATR<' + (c.volFMult??0) + 'x среднего'));
  lines.push('Дистанция от MA:  ' + on(c.useMaDist,  'макс=' + (c.maDistMax??0) + 'xATR'));
  lines.push('Размер свечи:     ' + on(c.useCandleF, '' + (c.candleMin??0) + '-' + (c.candleMax??0) + 'xATR'));
  lines.push('Серия свечей:     ' + on(c.useConsec,  'макс=' + (c.consecMax??0) + ' одноцветных'));
  lines.push('Подтв. тренда:    ' + on(c.useConfirm, 'MA тип=' + (c.confMatType||'EMA') + ' период=' + (c.confN??0) + ((c.confHtfRatio&&c.confHtfRatio>1) ? ' HTF×'+c.confHtfRatio+'tf' : '')));
  lines.push('');
  lines.push('--- ОБЪЁМНЫЕ ФИЛЬТРЫ ---');
  lines.push('VSA (объём):      ' + on(c.useVSA,     'объём>' + (c.vsaMult??0) + 'x за ' + (c.vsaPeriod??0) + ' баров'));
  lines.push('Ликвидность:      ' + on(c.useLiq,     'мин=' + (c.liqMin??0) + 'x среднего'));
  lines.push('Направл. объёма:  ' + on(c.useVolDir,  'окно=' + (c.volDirPeriod??0) + ' баров'));
  lines.push('Взвеш. тренд WT:  ' + on(c.useWT,      'score>' + (c.wtThresh??0) + ', N=' + (c.wtN??0) + ', volW=' + (c.wtVolW??0) + ', bodyW=' + (c.wtBodyW??0) + (c.wtUseDist ? ', distMA=да' : '')));
  lines.push('Усталость тренда: ' + on(c.useFat,     (c.fatConsec??0) + ' свечей, vol<' + (c.fatVolDrop??0) + 'x'));
  lines.push('');
  lines.push('--- ОБЩЕЕ ---');
  lines.push('ATR период: ' + (c.atrPeriod??0));
  const _cc = (c.baseComm !== undefined ? c.baseComm : c.commission) ?? 0;
  const _sp = (c.spreadVal !== undefined ? c.spreadVal : 0) ?? 0;
  lines.push('Комиссия: ' + _cc.toFixed(3) + '% (1 ст.) = ' + (_cc*2).toFixed(3) + '% (round-trip)' + (_sp>0 ? ', Спред: ' + _sp.toFixed(3) + '% (r/t)' : ''));

  // ── JSON блок для точного восстановления всех настроек ────────────────────
  // Сериализуем все скалярные поля cfg + объекты slPair/tpPair
  // Массивы (Float64Array, Uint8Array, обычные) намеренно исключаем — они runtime-кэш
  const _jsonCfg = {};
  for (const [k, v] of Object.entries(c)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'boolean' || typeof v === 'number' || typeof v === 'string') {
      _jsonCfg[k] = v;
    } else if (typeof v === 'object' && !Array.isArray(v) &&
               !(v instanceof Float64Array) && !(v instanceof Uint8Array) &&
               !(v instanceof Int8Array) && !(v instanceof Int32Array)) {
      // Включаем plain объекты: slPair, tpPair и т.д.
      _jsonCfg[k] = v;
    }
  }
  lines.push('');
  lines.push('--- CFG JSON ---');
  lines.push(JSON.stringify(_jsonCfg));
  lines.push('--- /CFG JSON ---');
  return lines.join('\n');
}
function closeDetail() {
  $('detail-overlay').classList.remove('open');
  $('detail-panel').classList.remove('open');
}

function copyDetail() {
  if (!_detailText) return;
  navigator.clipboard.writeText(_detailText).then(() => {
    const btn = document.querySelector('.dp-copy-btn');
    const orig = btn.textContent;
    btn.textContent = '✅ Скопировано!';
    setTimeout(() => btn.textContent = orig, 2000);
  });
}
