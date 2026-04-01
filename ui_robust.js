// ============================================================
// ROBUST TEST
// ============================================================
let _robustResult = null; // текущий результат для теста

function openRobustModal() {
  if (!_robustResult) { alert('Сначала выберите результат из таблицы'); return; }
  $('robust-results').innerHTML = '';
  $('robust-progress').style.display = 'none';
  $('robust-overlay').classList.add('open');
}
function closeRobustModal() { $('robust-overlay').classList.remove('open'); }
function selectFastOnly() {
  $('rb_walk').checked = true;
  $('rb_param').checked = true;
  $('rb_mc').checked = false;
  $('rb_noise').checked = false;
  $('rb_oos').checked = true;
}

// _robustResult обновляется внутри showDetail (см. оригинал функции выше)

async function runRobustTest() {
  if (!_robustResult || !DATA) { alert('Нет данных для теста'); return; }
  const r = _robustResult, cfg = r.cfg;
  if (!cfg) { alert('Нет cfg для этого результата'); return; }


  const tests = [];
  if ($c('rb_walk'))  tests.push('walk');
  if ($c('rb_param')) tests.push('param');
  if ($c('rb_oos'))   tests.push('oos');
  if ($c('rb_mc'))    tests.push('mc');
  if ($c('rb_noise')) tests.push('noise');
  if (!tests.length) { alert('Выбери хотя бы один тест'); return; }

  $('robust-results').innerHTML = '';
  $('robust-progress').style.display = 'block';
  $('rb-pbar').style.width = '0%';
  $('rb-status').textContent = 'Запуск...';

  // Сбрасываем кэш: настройки param_spread/noise_runs могли измениться
  if (typeof _robCache !== 'undefined') _robCache.clear();
  if (typeof _robSliceCache !== 'undefined') _robSliceCache.clear();

  const results_html = [];
  const fullDATA = DATA; // сохраняем оригинал

  // ── Конвертация saved cfg → btCfg формат и запуск backtest ──
  // saved cfg хранит slPair/tpPair объекты и commission,
  // но backtest ожидает hasSLA/slMult/tpMode/comm и предвычисленные массивы
  function runOnSlice(slice) {
    if (!slice || slice.length < 40) return null;
    const origDATA = DATA;
    DATA = slice;
    try {
      const ind   = _calcIndicators(cfg);
      const btCfg = buildBtCfg(cfg, ind);
      return backtest(ind.pvLo, ind.pvHi, ind.atrArr, btCfg);
    } catch(e) {
      console.error('runOnSlice error:', e);
      return null;
    } finally {
      DATA = origDATA;
    }
  }

  // Базовый прогон на полном наборе (для сравнения)
  const base = runOnSlice(fullDATA);
  if (!base || base.n < 5) {
    $('rb-status').textContent = '❌ Базовый бэктест дал < 5 сделок — тест невозможен';
    return;
  }

  const setProgress = (pct, txt) => {
    $('rb-pbar').style.width = pct+'%';
    $('rb-status').textContent = txt;
  };
  const addResult = (icon, cls, title, detail) => {
    results_html.push(`<div class="rb-row ${cls}"><span class="rb-icon">${icon}</span><span class="rb-title">${title}</span><span class="rb-detail">${detail}</span></div>`);
    $('robust-results').innerHTML = results_html.join('');
  };

  await yieldToUI();

  // ── 1. Walk-Forward ─────────────────────────────────────────
  if (tests.includes('walk')) {
    setProgress(5, '🔄 Walk-Forward...');
    await yieldToUI();
    const N = fullDATA.length;
    const r1 = runOnSlice(fullDATA.slice(0, Math.floor(N*0.33)));
    const r2 = runOnSlice(fullDATA.slice(Math.floor(N*0.33), Math.floor(N*0.66)));
    const r3 = runOnSlice(fullDATA.slice(Math.floor(N*0.66)));
    const parts = [r1,r2,r3].filter(x=>x&&x.n>=5);
    if (parts.length < 2) {
      addResult('⚠️','warn','Walk-Forward','Мало сделок на периодах (нужно ≥5 каждый)');
    } else {
      const pnls = parts.map(x=>x.pnl), wrs = parts.map(x=>x.wr);
      const allPos = pnls.every(p=>p>0);
      const wrSpread = Math.max(...wrs) - Math.min(...wrs);
      const pnlStr = pnls.map(p=>`${p>0?'+':''}${p.toFixed(1)}%`).join(' | ');
      const wrStr  = wrs.map(w=>w.toFixed(1)+'%').join(' | ');
      const cls = allPos && wrSpread<20 ? 'pass' : allPos ? 'warn' : 'fail';
      addResult(cls==='pass'?'✅':cls==='warn'?'⚠️':'❌', cls,
        `Walk-Forward: ${pnlStr}`,
        `WR: ${wrStr} (разброс ${wrSpread.toFixed(1)}%)`);
    }
  }

  // ── 2. OOS ──────────────────────────────────────────────────
  if (tests.includes('oos')) {
    setProgress(25, '🔬 OOS (3 участка: начало/середина/конец)...');
    await yieldToUI();
    const N = fullDATA.length;
    const segLen = Math.floor(N * 0.20);
    // Три OOS участка
    const segs = [
      { label: 'Начало (0-20%)',    data: fullDATA.slice(0, segLen) },
      { label: 'Середина (40-60%)', data: fullDATA.slice(Math.floor(N*0.40), Math.floor(N*0.60)) },
      { label: 'Конец (80-100%)',   data: fullDATA.slice(N - segLen) },
    ];
    const rFull = runOnSlice(fullDATA);
    const pnlPerBar = rFull && rFull.pnl && N > 0 ? rFull.pnl / N : 0;
    let passCount = 0;
    const segResults = [];
    for (const seg of segs) {
      const rSeg = runOnSlice(seg.data);
      if (!rSeg || rSeg.n < 3) {
        segResults.push({ label: seg.label, ok: false, detail: 'мало сделок' });
        continue;
      }
      const retention = pnlPerBar > 0 ? rSeg.pnl / (pnlPerBar * seg.data.length) : (rSeg.pnl > 0 ? 1 : 0);
      const ok = rSeg.pnl > 0 && retention >= 0.1;
      if (ok) passCount++;
      segResults.push({ label: seg.label, ok, pnl: rSeg.pnl, wr: rSeg.wr, n: rSeg.n, retention });
    }
    // Итог: 2+ из 3 = пройден
    const oosOverall = passCount >= 2;
    const overallCls = passCount === 3 ? 'pass' : passCount === 2 ? 'warn' : 'fail';
    const overallIcon = passCount === 3 ? '✅' : passCount === 2 ? '⚠️' : '❌';
    addResult(overallIcon, overallCls,
      `OOS: ${passCount}/3 участков прибыльны`,
      `IS полная выборка: ${rFull ? rFull.pnl.toFixed(1)+'%' : '-'} | Пройден если ≥2/3`);
    for (const sr of segResults) {
      if (sr.detail) {
        addResult('⚠️','warn', `  └ ${sr.label}`, sr.detail);
      } else {
        const retPct = sr.retention !== undefined ? (sr.retention*100).toFixed(0) : '?';
        const retStr = ` | Retention: ${retPct}%`;
        const retWarn = sr.retention < 0.1 ? ' ⚠️ <10% — слишком слабо' : sr.retention < 0.3 ? ' (слабо)' : '';
        const cls2 = sr.ok ? (sr.retention >= 0.3 ? 'pass' : 'warn') : 'fail';
        const icon2 = sr.ok ? (sr.retention >= 0.3 ? '✅' : '⚠️') : (sr.pnl > 0 ? '⚠️' : '❌');
        addResult(icon2, cls2,
          `  └ ${sr.label}: ${sr.pnl>0?'+':''}${sr.pnl.toFixed(1)}% WR ${sr.wr.toFixed(1)}% (${sr.n} сд.)`,
          `IS: ${rFull?rFull.pnl.toFixed(1)+'%':'-'}${retStr}${retWarn}`);
      }
    }
  }

  // ── 3. Параметрическая чувствительность ─────────────────────
  if (tests.includes('param')) {
    setProgress(45, '🎛 Параметрическая чувствительность...');
    await yieldToUI();

    const mutateSlPair = (pair, mult) => {
      if (!pair) return pair;
      const np = JSON.parse(JSON.stringify(pair));
      if (np.a && np.a.m) np.a.m = +(np.a.m * mult).toFixed(2);
      if (np.p && np.p.m) np.p.m = +(np.p.m * mult).toFixed(2);
      return np;
    };

    const variants = [];
    const savedSl = cfg.slPair, savedTp = cfg.tpPair;
    const _pSpread = Math.max(5, Math.min(50, parseInt(document.getElementById('param_spread')?.value) || 30)) / 100;
    const _pLo = +(1 - _pSpread).toFixed(2), _pHi = +(1 + _pSpread).toFixed(2);
    for (const slM of [_pLo, _pHi]) {
      for (const tpM of [_pLo, _pHi]) {
        cfg.slPair = mutateSlPair(savedSl, slM);
        cfg.tpPair = mutateSlPair(savedTp, tpM);
        const rv = runOnSlice(fullDATA);
        if (rv && rv.n >= 5) variants.push(rv.pnl);
      }
    }
    cfg.slPair = savedSl; cfg.tpPair = savedTp;

    if (!variants.length) {
      addResult('⚠️','warn','Параметрическая чувствительность','Нет данных SL/TP для мутации');
    } else {
      const minV=Math.min(...variants), maxV=Math.max(...variants), spread=maxV-minV;
      const passedCount = variants.filter(v=>v>0).length;
      const pSpreadPct = Math.round(_pSpread * 100);
      const cls = passedCount >= 4 && spread < Math.abs(base.pnl)*0.7 ? 'pass'
                : passedCount >= 3 ? 'warn' : 'fail';
      addResult(cls==='pass'?'✅':cls==='warn'?'⚠️':'❌', cls,
        `SL/TP ±${pSpreadPct}%: ${passedCount}/4 вариантов прибыльны (min ${minV.toFixed(1)}% / max ${maxV.toFixed(1)}%)`,
        `Разброс ${spread.toFixed(1)}% при базе ${base.pnl.toFixed(1)}%. Пройден если ≥3/4 прибыльны.`);
    }
  }

  // ── 4. Monte Carlo (перестановки PnL по сделкам) ────────────
  if (tests.includes('mc')) {
    setProgress(60, '🎲 Monte Carlo (1000 перестановок)...');
    await yieldToUI();

    // Собираем PnL сделок из базового прогона через equity diff
    const eq = base.eq;
    const tradePnls = [];
    for (let i=1;i<eq.length;i++) {
      const diff = eq[i]-eq[i-1];
      if (Math.abs(diff)>0.001) tradePnls.push(diff);
    }

    if (tradePnls.length < 10) {
      addResult('⚠️','warn','Monte Carlo','Мало сделок для симуляции (нужно ≥10)');
    } else {
      const N_MC=1000; const dds=[];
      for (let sim=0;sim<N_MC;sim++) {
        const t=[...tradePnls];
        for(let i=t.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[t[i],t[j]]=[t[j],t[i]];}
        let eq2=0,peak=0,dd=0;
        t.forEach(p=>{eq2+=p;if(eq2>peak)peak=eq2;dd=Math.max(dd,peak-eq2);});
        dds.push(dd);
      }
      dds.sort((a,b)=>a-b);
      const p50=dds[Math.floor(N_MC*0.5)], p95=dds[Math.floor(N_MC*0.95)];
      const cls = p95 < Math.abs(base.pnl)*0.6 ? 'pass' : p95 < Math.abs(base.pnl) ? 'warn' : 'fail';
      addResult(cls==='pass'?'✅':cls==='warn'?'⚠️':'❌', cls,
        `MC maxDD: медиана ${p50.toFixed(1)}% / p95 ${p95.toFixed(1)}%`,
        `1000 перестановок сделок. База: ${base.pnl.toFixed(1)}%`);
    }
    await yieldToUI();
  }

  // ── 5. Шум данных ───────────────────────────────────────────
  if (tests.includes('noise')) {
    setProgress(78, '📡 Шум данных (100 прогонов)...');
    await yieldToUI();

    const N_NOISE = Math.max(5, Math.min(200, parseInt(document.getElementById('noise_runs')?.value) || 20));
    const NOISE   = (parseFloat(document.getElementById('noise_level')?.value) || 0.2) / 100;
    const pnls=[];
    for (let sim=0;sim<N_NOISE;sim++) {
      const noisy = fullDATA.map(b=>{
        const f=1+(Math.random()-0.5)*2*NOISE;
        return {o:b.o*f,h:b.h*f,l:b.l*f,c:b.c*f,v:b.v};
      });
      const rv = runOnSlice(noisy);
      if (rv && rv.n>=5) pnls.push(rv.pnl);
      if (sim%10===0) await yieldToUI();
    }
    if (pnls.length<10) {
      addResult('⚠️','warn','Шум данных','Недостаточно результатов');
    } else {
      const avg=pnls.reduce((a,b)=>a+b,0)/pnls.length;
      const minP=Math.min(...pnls), maxP=Math.max(...pnls);
      const cls = avg>0&&minP>0 ? 'pass' : avg>0 ? 'warn' : 'fail';
      addResult(cls==='pass'?'✅':cls==='warn'?'⚠️':'❌', cls,
        `Шум ±0.05%: avg ${avg.toFixed(1)}% / min ${minP.toFixed(1)}%`,
        `Разброс ${(maxP-minP).toFixed(1)}% по ${pnls.length} прогонам`);
    }
    await yieldToUI();
  }

  setProgress(100, '✅ Готово');
}
