// ── TV COMPARE ────────────────────────────────────────────────

let _tvCmpCurrentResult = null;
let _tvCmpDiag = null; // хранит данные для copyTVdiag()

function _normTime(t) {
  if (!t && t !== 0) return '';
  const s = String(t).trim();
  // Unix timestamp в секундах (9-10 цифр) или миллисекундах (13 цифр)
  if (/^\d{9,10}$/.test(s)) return new Date(parseInt(s) * 1000).toISOString().substring(0, 16).replace('T', ' ');
  if (/^\d{13}$/.test(s))   return new Date(parseInt(s)).toISOString().substring(0, 16).replace('T', ' ');
  // ISO/date string: убираем зону, T→пробел, секунды+мс, берём 16 символов
  return s
    .replace(/ UTC$/i, '').replace(/ GMT$/i, '').replace(/Z$/, '')
    .replace('T', ' ')
    .replace(/(\d{2}:\d{2}):\d{2}(\.\d+)?$/, '$1')  // только секунды, не минуты
    .substring(0, 16);
}

function _parseTVcsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return null;
  const sep = lines[0].includes('\t') ? '\t' : ',';
  const hdrs = lines[0].split(sep).map(h => h.trim().replace(/"/g, '').toLowerCase());

  const tIdx  = hdrs.findIndex(h => h.includes('time') || h.includes('date')) >= 0
                ? hdrs.findIndex(h => h.includes('time') || h.includes('date')) : 0;
  const eqIdx = hdrs.findIndex(h => h.includes('equity'));
  const elIdx = hdrs.indexOf('el');
  const esIdx = hdrs.indexOf('es');
  const xlIdx = hdrs.indexOf('xl');
  const xsIdx = hdrs.indexOf('xs');
  const maIdx = hdrs.indexOf('ma'); // exact match, не попадает в 'confirm ma'
  const confIdx = hdrs.findIndex(h => h.includes('confirm'));

  if (eqIdx < 0) return null;

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map(c => c.trim().replace(/"/g, ''));
    if (cols.length <= eqIdx) continue;
    const t  = _normTime(cols[tIdx]);
    const eq = parseFloat(cols[eqIdx]);
    if (!t || isNaN(eq)) continue;
    rows.push({
      t, eq,
      el: elIdx >= 0 ? (parseFloat(cols[elIdx]) || 0) : null,
      es: esIdx >= 0 ? (parseFloat(cols[esIdx]) || 0) : null,
      xl: xlIdx >= 0 ? (parseFloat(cols[xlIdx]) || 0) : null,
      xs: xsIdx >= 0 ? (parseFloat(cols[xsIdx]) || 0) : null,
      ma: maIdx >= 0 ? parseFloat(cols[maIdx]) : NaN,
      confMa: confIdx >= 0 ? parseFloat(cols[confIdx]) : NaN,
    });
  }
  return rows.length >= 2 ? rows : null;
}

function loadTVcsv(event) {
  const file = event.target.files[0];
  if (!file) return;
  const statusEl = document.getElementById('tv-cmp-status');
  const resultsEl = document.getElementById('tv-cmp-results');
  if (statusEl) statusEl.textContent = '⏳ Читаю файл...';
  const reader = new FileReader();
  reader.onload = function(e) {
    const tvRows = _parseTVcsv(e.target.result);
    if (!tvRows) {
      if (statusEl) statusEl.textContent = '❌ Не удалось прочитать. Нужна колонка «Equity %» из TV Table Mode';
      return;
    }
    if (statusEl) statusEl.textContent = `✅ ${file.name} · ${tvRows.length} строк`;
    _runTVcompare(tvRows, resultsEl);
  };
  reader.readAsText(file);
}

function _runTVcompare(tvRows, resultsEl) {
  const r = _tvCmpCurrentResult;
  if (!r || !r.cfg) {
    resultsEl.innerHTML = '<span style="color:var(--neg);font-size:.8em">❌ Нет текущего результата.</span>';
    return;
  }

  // Use equities[r.name] as primary source (same as showDetail equity chart = full IS+OOS run)
  // Fall back to fresh backtest if equities map is unavailable, then to r.eq
  let fullEq = r.eq; // fallback
  let isFullRun = false;
  let fullRunErr = '';
  if (typeof equities !== 'undefined' && equities[r.name] && equities[r.name].length > 0) {
    fullEq = equities[r.name];
    isFullRun = true;
  } else {
    try {
      const _ind   = typeof _calcIndicators === 'function' ? _calcIndicators(r.cfg) : null;
      const _btCfg = (_ind && typeof buildBtCfg === 'function') ? buildBtCfg(r.cfg, _ind) : null;
      if (_btCfg && typeof backtest === 'function') {
        const rFull = backtest(_ind.pvLo, _ind.pvHi, _ind.atrArr, _btCfg);
        if (rFull && rFull.eq && rFull.eq.length > 0) {
          fullEq = rFull.eq;
          isFullRun = true;
        } else { fullRunErr = 'backtest вернул пустой eq'; }
      } else { fullRunErr = '_calcIndicators/buildBtCfg/backtest не найдены'; }
    } catch(e) { fullRunErr = e.message; }
  }

  if (!fullEq || !fullEq.length) {
    resultsEl.innerHTML = '<span style="color:var(--neg);font-size:.8em">❌ Нет equity для текущего результата.</span>';
    return;
  }

  // Build time→row map
  const tvMap = Object.create(null);
  for (const row of tvRows) tvMap[row.t] = row;

  // Align with DATA[]
  const pairs = [];
  for (let i = 0; i < DATA.length; i++) {
    const nt = _normTime(DATA[i]?.t || '');
    const tv = tvMap[nt];
    if (tv && fullEq[i] !== undefined) pairs.push({ i, jsEq: fullEq[i], tvEq: tv.eq, tvRow: tv });
  }

  if (pairs.length < 5) {
    const tvFirst = tvRows[0]?.t || '?';
    const tvLast  = tvRows[tvRows.length - 1]?.t || '?';
    const jsFirst = _normTime(DATA[0]?.t || '');
    const jsLast  = _normTime(DATA[DATA.length - 1]?.t || '');
    const overlap = tvFirst <= jsLast && tvLast >= jsFirst;
    resultsEl.innerHTML = `<span style="color:var(--neg);font-size:.8em">❌ Совпало ${pairs.length} баров.`
      + `<br>TV диапазон: ${tvFirst} … ${tvLast}`
      + `<br>JS диапазон: ${jsFirst} … ${jsLast}`
      + (overlap ? '<br>⚠️ Диапазоны перекрываются — возможно несовпадение тикера или ТФ.'
                 : '<br>⛔ Диапазоны НЕ пересекаются — загрузи CSV за тот же период что и JS данные.')
      + `</span>`;
    return;
  }

  const c = r.cfg || {};

  // Warmup: skip first N bars where indicators aren't settled (MA, pivots)
  const _maTypeW = c.useMA ? (c.maType || 'EMA') : '';
  const _temaMult = (_maTypeW === 'TEMA' || _maTypeW === 'DEMA' || _maTypeW === 'EMA') ? 3 : 1;
  const _confTypeW = c.useConfirm ? (c.confMatType || 'EMA') : '';
  const _confMult = (_confTypeW === 'TEMA' || _confTypeW === 'DEMA' || _confTypeW === 'EMA') ? 3 : 1;
  const warmupN = Math.max(
    (c.pvL || 5) + (c.pvR || 2) + 5,
    c.useMA ? (c.maP || 0) * (c.htfRatio || 1) * _temaMult : 0,
    c.useConfirm ? (c.confN || 0) * (c.confHtfRatio || 1) * _confMult : 0,
    (c.atrPeriod || 14) * 3,
    50
  );
  const pairsPost = pairs.filter(p => p.i >= warmupN);

  const jsArr = pairs.map(p => p.jsEq);
  const tvArr = pairs.map(p => p.tvEq);

  // Correlation
  const jsMean = jsArr.reduce((s, v) => s + v, 0) / jsArr.length;
  const tvMean = tvArr.reduce((s, v) => s + v, 0) / tvArr.length;
  let num = 0, denJ = 0, denT = 0;
  for (let k = 0; k < jsArr.length; k++) {
    const dj = jsArr[k] - jsMean, dt = tvArr[k] - tvMean;
    num += dj * dt; denJ += dj * dj; denT += dt * dt;
  }
  const corr = (denJ > 0 && denT > 0) ? num / Math.sqrt(denJ * denT) : 0;

  // RMSE
  const rmse = Math.sqrt(pairs.reduce((s, p) => s + Math.pow(p.jsEq - p.tvEq, 2), 0) / pairs.length);

  // Max divergence
  let maxDiff = 0, maxDiffBar = 0, maxDiffTime = '';
  for (const p of pairs) {
    const d = Math.abs(p.jsEq - p.tvEq);
    if (d > maxDiff) { maxDiff = d; maxDiffBar = p.i; maxDiffTime = DATA[p.i]?.t || ''; }
  }

  // First divergence > 0.5%
  let firstDivBar = -1, firstDivTime = '';
  for (const p of pairs) {
    if (Math.abs(p.jsEq - p.tvEq) > 0.5) { firstDivBar = p.i; firstDivTime = DATA[p.i]?.t || ''; break; }
  }

  const jsLast = jsArr[jsArr.length - 1];
  const tvLast = tvArr[tvArr.length - 1];
  const finalDiff = jsLast - tvLast;

  // Post-warmup stats (skip first warmupN bars — MA/pivot not settled yet)
  let statsPost = null;
  if (pairsPost.length >= 5) {
    const jsAP = pairsPost.map(p => p.jsEq), tvAP = pairsPost.map(p => p.tvEq);
    const jsMeanP = jsAP.reduce((s,v)=>s+v,0)/jsAP.length, tvMeanP = tvAP.reduce((s,v)=>s+v,0)/tvAP.length;
    let nP=0, djP=0, dtP=0;
    for (let k=0; k<jsAP.length; k++) { const a=jsAP[k]-jsMeanP, b=tvAP[k]-tvMeanP; nP+=a*b; djP+=a*a; dtP+=b*b; }
    const corrP = (djP>0&&dtP>0) ? nP/Math.sqrt(djP*dtP) : 0;
    const rmseP = Math.sqrt(pairsPost.reduce((s,p)=>s+Math.pow(p.jsEq-p.tvEq,2),0)/pairsPost.length);
    let fdP=-1, ftP='', mdP=0, mbP=0, mtP='';
    for (const p of pairsPost) {
      const d = Math.abs(p.jsEq-p.tvEq);
      if (fdP<0 && d>0.5) { fdP=p.i; ftP=DATA[p.i]?.t||''; }
      if (d>mdP) { mdP=d; mbP=p.i; mtP=DATA[p.i]?.t||''; }
    }
    const jLP=jsAP[jsAP.length-1], tLP=tvAP[tvAP.length-1];
    statsPost = { corr:corrP, rmse:rmseP, firstDiv:fdP, firstTime:ftP, maxDiff:mdP, maxBar:mbP, maxTime:mtP, jsLast:jLP, tvLast:tLP, finalDiff:jLP-tLP, n:pairsPost.length };
  }

  // Signal stats
  const hasSigs = pairs[0]?.tvRow.el !== null;
  let tvSigCount = 0;
  if (hasSigs) for (const p of pairs) {
    if (p.tvRow.el === 1 || p.tvRow.es === 1 || p.tvRow.xl === 1 || p.tvRow.xs === 1) tvSigCount++;
  }

  // Coverage: detect if TV CSV ends before DATA ends
  const lastPairBar = pairs.length > 0 ? pairs[pairs.length - 1].i : -1;
  const missingEnd  = DATA.length - 1 - lastPairBar;   // bars at end not covered by TV
  const jsFullFinal = fullEq[DATA.length - 1] ?? NaN;  // equity at very last DATA bar

  const corrC = corr >= 0.99 ? 'pos' : corr >= 0.95 ? 'warn' : 'neg';
  const rmseC = rmse < 1 ? 'pos' : rmse < 5 ? 'warn' : 'neg';
  const fdC   = Math.abs(finalDiff) < 1 ? 'pos' : Math.abs(finalDiff) < 5 ? 'warn' : 'neg';

  // Compute JS tradeLog for diagnostic (separate lightweight run with collectTrades=true)
  let jsTradeLog = [];
  try {
    const _tli = typeof _calcIndicators === 'function' ? _calcIndicators(r.cfg) : null;
    const _tlC = (_tli && typeof buildBtCfg === 'function') ? buildBtCfg(r.cfg, _tli) : null;
    if (_tlC && typeof backtest === 'function') {
      _tlC.collectTrades = true; _tlC.tradeLog = [];
      backtest(_tli.pvLo, _tli.pvHi, _tli.atrArr, _tlC);
      jsTradeLog = _tlC.tradeLog || [];
    }
  } catch(e) {}

  // Сохраняем диагностику для copyTVdiag()
  _tvCmpDiag = { r, pairs, corr, rmse, finalDiff, jsLast, tvLast, firstDivBar, firstDivTime, maxDiff, maxDiffBar, maxDiffTime, hasSigs, tvSigCount, fullEq, isFullRun, missingEnd, jsFullFinal, fullRunErr, warmupN, statsPost, jsTradeLog };

  let html = '';
  html += row('Режим сравнения', isFullRun
    ? `<span class="pos">IS+OOS (полный прогон)</span>`
    : `<span class="warn">fallback (r.eq)</span>${fullRunErr ? ` · ${fullRunErr}` : ''}`, '');
  html += row('Совпало баров', `${pairs.length} / ${tvRows.length} TV · ${DATA.length} JS`, 'muted');
  if (missingEnd > 0) {
    const missedPnl = !isNaN(jsFullFinal) ? (jsFullFinal - jsLast).toFixed(1) : '?';
    html += row('⚠️ TV CSV не покрывает конец', `<span class="warn">последние ${missingEnd} баров DATA без TV данных · пропущено JS PnL ≈ ${missedPnl}%</span>`, '');
  }
  html += row('JS полный итог', `<span class="${isNaN(jsFullFinal) ? 'muted' : 'pos'}">${isNaN(jsFullFinal) ? '—' : jsFullFinal.toFixed(1) + '%'}</span> (бар ${DATA.length-1})`, 'muted');
  html += row('Корреляция equity', `<span class="${corrC}">${(corr * 100).toFixed(2)}%</span>${corr >= 0.99 ? ' ✅' : corr < 0.95 ? ' ⚠️' : ''}`, '');
  html += row('RMSE equity', `<span class="${rmseC}">${rmse.toFixed(2)}%</span>`, '');
  html += row('JS итог / TV итог', `<span class="${fdC}">JS ${jsLast.toFixed(1)}% · TV ${tvLast.toFixed(1)}% · Δ${finalDiff >= 0 ? '+' : ''}${finalDiff.toFixed(1)}%</span> (бар ${lastPairBar})`, '');
  if (firstDivBar >= 0) {
    html += row('Первое расхождение >0.5%', `<span class="warn">бар #${firstDivBar} · ${firstDivTime}</span>`, '');
    html += `<button class="tpl-btn2" style="margin-top:6px;padding:4px 12px;font-size:.82em;border-color:#c792ea;color:#c792ea;width:100%" onclick="copyTVdiag()">📋 Скопировать диагностику для Claude</button>`;
  } else {
    html += row('Расхождение >0.5%', '<span class="pos">не обнаружено ✅</span>', '');
  }
  html += row('Макс. расхождение', `${maxDiff.toFixed(2)}% · бар #${maxDiffBar} · ${maxDiffTime}`, 'muted');
  if (hasSigs) html += row('TV сигналов (EL/ES/XL/XS)', `${tvSigCount} из ${pairs.length} совпавших баров`, 'muted');
  if (statsPost) {
    const spC = statsPost.corr >= 0.99 ? 'pos' : statsPost.corr >= 0.95 ? 'warn' : 'neg';
    const srC = statsPost.rmse < 1 ? 'pos' : statsPost.rmse < 5 ? 'warn' : 'neg';
    const sfC = Math.abs(statsPost.finalDiff) < 1 ? 'pos' : Math.abs(statsPost.finalDiff) < 5 ? 'warn' : 'neg';
    html += row(`После прогрева (бар ${warmupN}+, ${statsPost.n} баров)`,
      `Корр: <span class="${spC}">${(statsPost.corr*100).toFixed(1)}%</span>${statsPost.corr>=0.99?' ✅':statsPost.corr<0.95?' ⚠️':''} · RMSE: <span class="${srC}">${statsPost.rmse.toFixed(2)}%</span> · Δ итог: <span class="${sfC}">${statsPost.finalDiff>=0?'+':''}${statsPost.finalDiff.toFixed(1)}%</span>`, 'muted');
  }

  resultsEl.innerHTML = html;

  // Draw TV equity overlay on existing canvas
  _tvDrawOverlay(pairs, fullEq);
}

function _tvDrawOverlay(pairs, jsEq) {
  const canvas = document.getElementById('eqc');
  if (!canvas || !_eqChartParams) return;
  const ctx = canvas.getContext('2d');
  const { mn, range, pad, W, H } = _eqChartParams;
  if (!range) return;

  // Build dense array: tvAtBar[jsBarIndex] = tvEquity (NaN where no match)
  const tvAtBar = new Float64Array(jsEq.length).fill(NaN);
  for (const p of pairs) { if (p.i < tvAtBar.length) tvAtBar[p.i] = p.tvEq; }

  const nPx  = W - 2 * pad;
  const nLast = Math.max(jsEq.length - 1, 1);

  ctx.save();
  ctx.strokeStyle = 'rgba(255,200,60,0.9)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 2]);
  ctx.beginPath();
  let started = false;
  for (let px = 0; px < nPx; px++) {
    const i = Math.round(px * nLast / (nPx - 1));
    const v = tvAtBar[i];
    if (isNaN(v)) { started = false; continue; }
    const x = pad + px;
    const y = H - pad - ((v - mn) / range * (H - 2 * pad));
    if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Legend label
  ctx.fillStyle = 'rgba(255,200,60,0.85)';
  ctx.font = '8px JetBrains Mono,monospace';
  ctx.fillText('TV', W - 24, 9);
  ctx.restore();
}

function copyTVdiag() {
  const d = _tvCmpDiag;
  if (!d) { alert('Нет данных диагностики — сначала загрузи TV CSV'); return; }
  const { r, pairs, corr, rmse, finalDiff, jsLast, tvLast,
          firstDivBar, firstDivTime, maxDiff, maxDiffBar, maxDiffTime, hasSigs, isFullRun,
          missingEnd, jsFullFinal, fullRunErr, warmupN, statsPost, jsTradeLog, fullEq } = d;
  const c = r.cfg;
  const lastPairBar2 = pairs.length > 0 ? pairs[pairs.length - 1].i : -1;

  const lines = [];
  lines.push('=== TV vs JS ДИАГНОСТИКА РАСХОЖДЕНИЯ ===');
  lines.push(`Результат: ${r.name}`);
  lines.push(`Режим: ${isFullRun ? 'IS+OOS (полный прогон)' : `fallback (r.eq)${fullRunErr ? ' — ' + fullRunErr : ''}`} | Данные: ${pairs.length}/${DATA.length} баров`);
  if (missingEnd > 0) {
    const missedPnl = !isNaN(jsFullFinal) ? (jsFullFinal - jsLast).toFixed(1) : '?';
    lines.push(`⚠️ TV CSV НЕ ПОКРЫВАЕТ последние ${missingEnd} баров DATA (пропущено JS PnL ≈ ${missedPnl}%)`);
    lines.push(`   JS полный итог (бар ${DATA.length-1}): ${isNaN(jsFullFinal) ? '—' : jsFullFinal.toFixed(2) + '%'}`);
    lines.push(`   JS @ последний TV бар (#${lastPairBar2}): ${jsLast.toFixed(2)}%`);
    lines.push(`   → Загрузи TV CSV за весь период оптимизатора чтобы покрыть все ${DATA.length} баров`);
  }
  lines.push(`Совпало баров: ${pairs.length} | Корреляция: ${(corr*100).toFixed(2)}% | RMSE: ${rmse.toFixed(2)}%`);
  lines.push(`JS итог (@ посл. TV бар): ${jsLast.toFixed(2)}%  TV итог: ${tvLast.toFixed(2)}%  Δ: ${finalDiff>=0?'+':''}${finalDiff.toFixed(2)}%`);
  lines.push(`Первое расхождение >0.5%: бар #${firstDivBar} (${firstDivTime})`);
  lines.push(`Макс. расхождение: ${maxDiff.toFixed(2)}% на баре #${maxDiffBar} (${maxDiffTime})`);
  lines.push('');

  // Config summary
  lines.push('=== КОНФИГ СТРАТЕГИИ ===');
  const slName = c.slPair ? JSON.stringify(c.slPair) : '—';
  const tpName = c.tpPair ? JSON.stringify(c.tpPair) : '—';
  lines.push(`SL: ${slName}`);
  lines.push(`TP: ${tpName}`);
  lines.push(`ATR период: ${c.atrPeriod||14}`);
  lines.push(`Комиссия: ${c.baseComm??c.commission??0.08}%  Спред: ${c.spreadVal||0}%`);
  lines.push(`useMA: ${!!c.useMA}  maType: ${c.maType||'EMA'}  maP: ${c.maP||200}`);
  lines.push(`useConfirm: ${!!c.useConfirm}  confN: ${c.confN||100}`);
  lines.push(`useSTrend: ${!!c.useSTrend}  sTrendWin: ${c.sTrendWin||10}`);
  lines.push(`useBE: ${!!c.useBE}  beTrig: ${c.beTrig||0}  beOff: ${c.beOff||0}`);
  lines.push(`useTrail: ${!!c.useTrail}  trTrig: ${c.trTrig||0}  trDist: ${c.trDist||0}`);
  lines.push(`useWickTrail: ${!!c.useWickTrail}  wickMult: ${c.wickMult||0}  wickOffType: ${c.wickOffType||'ATR'}`);
  lines.push(`usePartial: ${!!c.usePartial}  partRR: ${c.partRR||0}  partPct: ${c.partPct||0}`);
  lines.push(`useTime: ${!!c.useTime}  timeBars: ${c.timeBars||0}`);
  lines.push(`waitBars: ${c.waitBars||0}  waitRetrace: ${!!c.waitRetrace}  waitMaxBars: ${c.waitMaxBars||0}  waitCancelAtr: ${c.waitCancelAtr||0}`);
  lines.push(`usePivot: ${!!c.usePivot}  pvL: ${c.pvL||5}  pvR: ${c.pvR||2}`);
  lines.push(`useEngulf: ${!!c.useEngulf}  usePinBar: ${!!c.usePinBar}  useBoll: ${!!c.useBoll}`);
  lines.push(`useDonch: ${!!c.useDonch}  useAtrBo: ${!!c.useAtrBo}  useSqueeze: ${!!c.useSqueeze}`);
  lines.push(`useMaTouch: ${!!c.useMaTouch}  useRev: ${!!c.useRev}  useClimax: ${!!c.useClimax}`);
  lines.push(`longOnly: ${!!c.longOnly}  shortOnly: ${!!c.shortOnly}`);
  lines.push(`entry_price_mode: ${c.entryMode||'close'}  confirmed: ${c.confirmed!==false}`);
  lines.push('');

  // Bars around first divergence: -15 to +5
  const fromBar = Math.max(0, firstDivBar - 15);
  const toBar   = Math.min(DATA.length - 1, firstDivBar + 5);
  const pairMap = Object.create(null);
  for (const p of pairs) pairMap[p.i] = p;

  lines.push(`=== БАРЫ ВОКРУГ ПЕРВОГО РАСХОЖДЕНИЯ (бар #${firstDivBar}) ===`);
  // Пересчитываем btCfg — r.cfg хранит только скаляры, массивы не сохраняются в результат
  let pvLo = null, pvHi_ = null, maArr = null, confArr = null, atrArr = null, _btCfgRef = null;
  try {
    const _ind   = typeof _calcIndicators === 'function' ? _calcIndicators(c) : null;
    const _btCfg = (_ind && typeof buildBtCfg === 'function') ? buildBtCfg(c, _ind) : null;
    _btCfgRef = _btCfg;
    if (_btCfg) {
      pvLo    = _btCfg.pvLo          || null;
      pvHi_   = _btCfg.pvHi_         || null;
      maArr   = _btCfg.maArr         || null;
      confArr = _btCfg.maArrConfirm  || null;
      atrArr  = _ind.atrArr          || null;
    }
    lines.push(`btCfg пересчитан: pvLo=${pvLo?'✅':'❌'} maArr=${maArr?'✅':'❌'} confArr=${confArr?'✅':'—'}`);
  } catch(e) { lines.push(`⚠️ Не удалось пересчитать btCfg: ${e.message}`); }
  const confLabel = c.useConfirm ? `Conf(i-1)` : null;
  lines.push('Бар# | Дата              | Open     | High     | Low      | Close    | JS_eq%   | TV_eq%   | Δeq%  | TV:EL ES XL XS | pvLo pvHi | JS_MA(i-1) | TV_MA(i-1) | MA_Δ%    | MA_blk   | ATR(i)   ' + (confLabel ? `| ${confLabel.padEnd(10)} | Cf_blk` : ''));
  lines.push('-'.repeat(confLabel ? 175 : 150));
  for (let i = fromBar; i <= toBar; i++) {
    const bar  = DATA[i] || {};
    const p    = pairMap[i];
    const jsEq = p ? p.jsEq.toFixed(3) : '—      ';
    const tvEq = p ? p.tvEq.toFixed(3) : '—      ';
    const diff = p ? (p.jsEq - p.tvEq).toFixed(3) : '—    ';
    const sigs = p && hasSigs
      ? `${p.tvRow.el||0} ${p.tvRow.es||0} ${p.tvRow.xl||0} ${p.tvRow.xs||0}`
      : '— — — —';
    const pvLoVal = pvLo ? pvLo[i] : '?';
    const pvHiVal = pvHi_ ? pvHi_[i] : '?';
    const maVal   = (maArr && i > 0) ? maArr[i-1] : null;
    const maStr   = maVal != null ? maVal.toFixed(6) : '—';
    let maBlock = c.useMA ? '—' : 'off';
    if (c.useMA && maArr && i > 0) {
      const prevC = DATA[i-1]?.c || 0;
      const ma = maArr[i-1];
      maBlock = (ma <= 0) ? 'WARMUP' : (prevC <= ma ? 'BLK_L' : 'ok');
    }
    let confPart = '';
    if (confLabel) {
      const cma = (confArr && i > 0) ? confArr[i-1] : null;
      const cmaStr = cma != null ? cma.toFixed(6) : '—';
      let cfBlock = '—';
      if (confArr && i > 0) {
        const prevC = DATA[i-1]?.c || 0;
        const cmaV = confArr[i-1];
        cfBlock = (cmaV <= 0) ? 'WARMUP' : (prevC <= cmaV ? 'BLK_L' : 'ok');
      }
      confPart = ` | ${cmaStr.padStart(10)} | ${cfBlock}`;
    }
    // TV MA from CSV (p.tvRow.ma is the MA value exported by the TV indicator)
    const tvMaRaw = (p && !isNaN(p.tvRow?.ma) && p.tvRow.ma > 0) ? p.tvRow.ma : null;
    const tvMaStr = tvMaRaw != null ? tvMaRaw.toFixed(6) : (p ? 'empty' : 'NO_TV');
    // Difference JS_MA vs TV_MA in percent
    const maDiffPct = (maVal != null && tvMaRaw != null && maVal > 0)
      ? ((maVal - tvMaRaw) / tvMaRaw * 100).toFixed(3) : '—';
    const atrVal = (atrArr && atrArr[i] > 0) ? atrArr[i].toFixed(5) : '—';
    const marker = i === firstDivBar ? ' ◄ ПЕРВОЕ' : i === maxDiffBar ? ' ◄ МАКС' : '';
    // Show actual JS equity for bars without TV data (where p is null)
    const jsEqActual = (!p && fullEq && fullEq[i] !== undefined) ? fullEq[i].toFixed(3) : jsEq;
    const tvEqStr = !p ? 'NO_TV  ' : String(tvEq).padStart(8);
    const t = String(bar.t || '—').padEnd(18);
    lines.push(
      `${String(i).padStart(5)} | ${t} | ${(bar.o||0).toFixed(4).padStart(8)} | ${(bar.h||0).toFixed(4).padStart(8)} | ` +
      `${(bar.l||0).toFixed(6).padStart(10)} | ${(bar.c||0).toFixed(6).padStart(10)} | ` +
      `${String(jsEqActual).padStart(8)} | ${tvEqStr} | ${String(diff).padStart(6)} | ${sigs.padEnd(14)} | ` +
      `${String(pvLoVal).padStart(4)}  ${String(pvHiVal).padStart(4)} | ${maStr.padStart(11)} | ${tvMaStr.padStart(11)} | ${String(maDiffPct).padStart(8)} | ${maBlock.padEnd(7)} | ${String(atrVal).padStart(8)}${confPart}${marker}`
    );
  }
  lines.push('');

  // JS сделки вокруг первого расхождения
  const _tLog = jsTradeLog || [];
  const _win = 60;
  const _trNear = _tLog.filter(t =>
    (t.exitBar  != null && t.exitBar  >= firstDivBar - _win && t.exitBar  <= firstDivBar + 10) ||
    (t.entryBar != null && t.entryBar >= firstDivBar - _win && t.entryBar <= firstDivBar + 10)
  );
  if (_trNear.length > 0) {
    lines.push(`=== JS СДЕЛКИ ВОКРУГ БАР #${firstDivBar} (окно ±${_win}) ===`);
    lines.push(`  # | Вход  | Выход | Тип   | Цена вх    | Цена вых   | ATR вх   | PnL%    | Причина`);
    lines.push('-'.repeat(95));
    _trNear.forEach((t, k) => {
      const dir    = t.dir === 1 ? 'LONG' : 'SHORT';
      const atrE   = (atrArr && t.entryBar != null && atrArr[t.entryBar] > 0) ? atrArr[t.entryBar].toFixed(5) : '—';
      const exitB  = t.exitBar  != null ? String(t.exitBar).padStart(5)  : '  —  ';
      const entryB = t.entryBar != null ? String(t.entryBar).padStart(5) : '  —  ';
      lines.push(
        `${String(k+1).padStart(3)} | ${entryB} | ${exitB} | ${dir.padEnd(5)} | ` +
        `${(t.entry||0).toFixed(6)} | ${(t.exit||0).toFixed(6)} | ${String(atrE).padStart(8)} | ` +
        `${((t.pnl||0)).toFixed(3).padStart(7)}% | ${t.reason||'—'}`
      );
    });
    lines.push('');
  } else if (_tLog.length === 0) {
    lines.push(`=== JS СДЕЛКИ: tradeLog пуст — collectTrades не включён ===`);
    lines.push('');
  } else {
    lines.push(`=== JS СДЕЛКИ: нет в окне [${firstDivBar-_win}..${firstDivBar+10}] · всего JS сделок: ${_tLog.length} ===`);
    lines.push('');
  }

  // Also show 5 bars before first divergence where they still matched (last matching bars)
  let lastMatchBar = -1;
  for (const p of pairs) { if (p.i < firstDivBar && Math.abs(p.jsEq - p.tvEq) <= 0.5) lastMatchBar = p.i; }
  if (lastMatchBar >= 0) {
    lines.push(`Последний совпадающий бар (Δ≤0.5%): #${lastMatchBar} (${DATA[lastMatchBar]?.t||''})`);
    const pm = pairMap[lastMatchBar];
    if (pm) lines.push(`  JS_eq: ${pm.jsEq.toFixed(3)}%  TV_eq: ${pm.tvEq.toFixed(3)}%`);
  }
  lines.push('');
  // Post-warmup section
  if (statsPost) {
    lines.push(`=== ПОСТ-ПРОГРЕВ (бар ${warmupN}+, ${statsPost.n} баров) ===`);
    lines.push(`Прогрев пропускает первые ${warmupN} баров (MA=${c.useMA?`${c.maType||'EMA'}(${c.maP||0})×${c.htfRatio||1}tf`:'off'}, Conf=${c.useConfirm?`${c.confMatType||'EMA'}(${c.confN||0})×${c.confHtfRatio||1}tf`:'off'}, pvL+pvR+5=${(c.pvL||5)+(c.pvR||2)+5}, ATR×3=${(c.atrPeriod||14)*3})`);
    lines.push(`Корреляция: ${(statsPost.corr*100).toFixed(2)}%  RMSE: ${statsPost.rmse.toFixed(2)}%`);
    lines.push(`JS итог: ${statsPost.jsLast.toFixed(2)}%  TV итог: ${statsPost.tvLast.toFixed(2)}%  Δ: ${statsPost.finalDiff>=0?'+':''}${statsPost.finalDiff.toFixed(2)}%`);
    if (statsPost.firstDiv >= 0)
      lines.push(`Первое расхождение >0.5% (пост-прогрев): бар #${statsPost.firstDiv} (${statsPost.firstTime})`);
    else
      lines.push(`Первое расхождение >0.5% (пост-прогрев): не обнаружено ✅`);
    lines.push(`Макс. расхождение (пост-прогрев): ${statsPost.maxDiff.toFixed(2)}% на баре #${statsPost.maxBar}`);
    const verdict = statsPost.corr >= 0.99 ? '✅ ПРОГРЕВ БЫЛ ПРИЧИНОЙ — пост-warmup корреляция отличная' :
                    statsPost.corr >= 0.95 ? '⚠️ Улучшилось после прогрева, но есть остаточное расхождение' :
                    statsPost.corr >= 0 ?    '❌ Расхождение сохраняется после прогрева — есть баг в логике' :
                                             '❌❌ Отрицательная корреляция даже после прогрева — серьёзный баг';
    lines.push(verdict);
    lines.push('');
  }
  // Автоматический анализ первичной причины
  lines.push('=== АВТО-ДИАГНОЗ ===');
  // Ищем TV EL/ES сигнал в окне [firstDivBar-6 .. firstDivBar] — он мог быть чуть раньше
  let entrySignalBar = -1, entryDir = 0;
  for (let _si = Math.max(0, firstDivBar - 6); _si <= firstDivBar; _si++) {
    const _p = pairMap[_si];
    if (!_p) continue;
    if (_p.tvRow.el === 1) { entrySignalBar = _si; entryDir = 1; break; }
    if (_p.tvRow.es === 1) { entrySignalBar = _si; entryDir = -1; break; }
  }
  // Ищем TV XL/XS в том же окне
  let exitSignalBar = -1;
  for (let _si = Math.max(0, firstDivBar - 6); _si <= firstDivBar; _si++) {
    const _p = pairMap[_si];
    if (!_p) continue;
    if (_p.tvRow.xl === 1 || _p.tvRow.xs === 1) { exitSignalBar = _si; break; }
  }

  if (entrySignalBar >= 0) {
    const dirStr = entryDir === 1 ? 'LONG' : 'SHORT';
    lines.push(`TV открыл ${dirStr} на баре #${entrySignalBar}`);
    const waitB = c.waitBars || 0;

    // Ищем реальный сигнальный бар JS с учётом waitBars
    let jsSigBar = -1;
    if (pvLo && pvHi_ && c.usePivot) {
      // Сигнал должен быть на баре entrySignalBar - waitBars (± небольшое окно)
      const searchFrom = Math.max(0, entrySignalBar - waitB - 3);
      const searchTo   = Math.min(DATA.length - 1, entrySignalBar);
      for (let _k = searchTo; _k >= searchFrom; _k--) {
        const pv = entryDir === 1 ? pvLo[_k] : pvHi_[_k];
        if (pv === 1) { jsSigBar = _k; break; }
      }
    }

    if (pvLo && pvHi_) {
      const pvAtEntry = entryDir === 1 ? pvLo[entrySignalBar] : pvHi_[entrySignalBar];
      lines.push(`JS pvLo[${entrySignalBar}]=${pvLo[entrySignalBar]}  pvHi_[${entrySignalBar}]=${pvHi_[entrySignalBar]}`);
      if (pvAtEntry === 1) {
        lines.push(`✅ JS тоже видит pivot на баре #${entrySignalBar} — причина не в pivot detection`);
      } else if (waitB > 0 && jsSigBar >= 0) {
        const delay = entrySignalBar - jsSigBar;
        lines.push(`ℹ️  waitBars=${waitB}: JS видит pvSig на баре #${jsSigBar}, вход должен быть на #${jsSigBar}+${waitB}=${jsSigBar+waitB}`);
        if (jsSigBar + waitB === entrySignalBar) {
          lines.push(`✅ Задержка совпадает с TV (сигнал #${jsSigBar} + ${waitB}б = #${entrySignalBar}) — проверить фильтры на баре #${jsSigBar}`);
        } else {
          lines.push(`⚠️  Задержка не совпадает: JS вошёл бы на #${jsSigBar+waitB}, TV на #${entrySignalBar} (разница ${entrySignalBar-(jsSigBar+waitB)} бара)`);
        }
        // Анализ фильтров на СИГНАЛЬНОМ баре jsSigBar
        lines.push(`--- Фильтры на сигнальном баре JS #${jsSigBar} (bar.i-1=${jsSigBar-1}) ---`);
        if (maArr && jsSigBar > 0 && c.useMA) {
          const prevC2 = DATA[jsSigBar-1]?.c || 0;
          const ma2 = maArr[jsSigBar-1] || 0;
          const blocked2 = ma2 > 0 && (entryDir===1 ? prevC2 <= ma2 : prevC2 >= ma2);
          lines.push(`MA(${c.maP}×${c.htfRatio||1}tf)[${jsSigBar-1}] = ${ma2>0?ma2.toFixed(6):'0(warmup)'}  close=${prevC2.toFixed(6)}`);
          lines.push(ma2 <= 0 ? `⚠️  MA warmup → блокирует` : blocked2 ? `⚠️  MA БЛОКИРУЕТ (close${entryDir===1?'<=':'>='}MA)` : `✅ MA ok`);
        } else if (maArr && jsSigBar > 0 && !c.useMA) {
          lines.push(`MA(${c.maP}×${c.htfRatio||1}tf) — отключён (useMA=false), не влияет`);
        }
        if (confArr && jsSigBar > 0) {
          const prevC3 = DATA[jsSigBar-1]?.c || 0;
          const cf3 = confArr[jsSigBar-1] || 0;
          const cfBlocked = cf3 > 0 && (entryDir===1 ? prevC3 <= cf3 : prevC3 >= cf3);
          lines.push(`ConfMA(${c.confN}×${c.confHtfRatio||1}tf)[${jsSigBar-1}] = ${cf3>0?cf3.toFixed(6):'0(warmup)'}  close=${prevC3.toFixed(6)}`);
          lines.push(cf3 <= 0 ? `⚠️  ConfMA warmup → блокирует` : cfBlocked ? `⚠️  CONFIRM MA БЛОКИРУЕТ (close${entryDir===1?'<=':'>='}ConfMA)` : `✅ ConfMA ok`);
        }
      } else {
        lines.push(`⚠️  ПРИЧИНА: JS НЕ видит pivot вблизи бара #${entrySignalBar} (waitBars=${waitB})`);
        // показываем близкие бары где JS видит pivot
        for (let _k = Math.max(0,entrySignalBar-waitB-3); _k <= entrySignalBar+3; _k++) {
          if (_k >= DATA.length) break;
          if (pvLo[_k] === 1) lines.push(`   JS видит pvLo на баре #${_k}`);
          if (pvHi_[_k] === 1) lines.push(`   JS видит pvHi на баре #${_k}`);
        }
      }
    }
    // MA и Confirm MA filter на БАРЕ ВХОДА (для справки)
    const checkBar = (jsSigBar >= 0 && waitB > 0) ? jsSigBar : entrySignalBar;
    if (checkBar !== jsSigBar && c.useMA && maArr && entrySignalBar > 0) {
      // только если уже не показали выше
      const prevC = DATA[entrySignalBar - 1]?.c || 0;
      const ma = maArr[entrySignalBar - 1] || 0;
      if (ma > 0) {
        const blocked = entryDir === 1 ? prevC <= ma : prevC >= ma;
        lines.push(`MA(${c.maP}×${c.htfRatio||1}tf)[${entrySignalBar-1}] = ${ma.toFixed(6)}  close[${entrySignalBar-1}] = ${prevC.toFixed(6)}`);
        lines.push(blocked
          ? `⚠️  ПРИЧИНА: JS MA_FILTER БЛОКИРУЕТ ${dirStr} (close ${entryDir===1?'<=':'>='}  MA)`
          : `✅ MA filter не блокирует ${dirStr}`);
      } else {
        lines.push(`⚠️  ПРИЧИНА: MA[${entrySignalBar-1}] = 0 (warmup) → JS MA_FILTER БЛОКИРУЕТ`);
      }
    }
  } else if (exitSignalBar >= 0) {
    lines.push(`TV закрыл сделку (XL/XS=1) на баре #${exitSignalBar}. JS вероятно закрыл позже или по другой цене.`);
    if (maArr && exitSignalBar > 0) {
      const ma = maArr[exitSignalBar - 1] || 0;
      lines.push(`MA[${exitSignalBar-1}] = ${ma > 0 ? ma.toFixed(6) : '0 (warmup)'}`);
    }
  } else {
    lines.push(`TV не показывает явного EL/ES/XL/XS в окне [${firstDivBar-6}..${firstDivBar}].`);
    lines.push(`Возможна разница в цене входа/SL/TP расчёте.`);
    // Dump MA values near first divergence
    if (maArr) {
      for (let _k = firstDivBar - 2; _k <= firstDivBar + 1; _k++) {
        if (_k < 1 || _k >= DATA.length) continue;
        const ma = maArr[_k-1], cl = DATA[_k-1]?.c || 0;
        lines.push(`  MA[${_k-1}]=${ma>0?ma.toFixed(6):'warmup'}  close[${_k-1}]=${cl.toFixed(6)}`);
      }
    }
  }

  const text = lines.join('\n');
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector('#tv-cmp-results button');
    if (btn) { const orig = btn.textContent; btn.textContent = '✅ Скопировано!'; setTimeout(() => { btn.textContent = orig; }, 2000); }
  }).catch(() => {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
  });
}
