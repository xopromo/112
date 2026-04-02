function showBestStats() { /* removed */ }

// Параметры последнего нарисованного графика — для crosshair
let _eqChartParams = null;

// Настройки отображения MA Equity Filter
let _eqMAFilterShowBaseline = true;
let _eqMAFilterBaselineColor = '#00b4d8'; // голубой по умолчанию (вместо красного)

function drawEquityData(eq, label, splitPct, baselineEq=null) {
  if (!eq || !eq.length) return;
  const wrap = document.getElementById('eq-wrap');
  const canvas=$('eqc');
  if (!canvas) return;
  // Сохраняем позицию скролла — браузер может прыгнуть к canvas при display:none→block
  const _scrollEl = document.querySelector('.tbl-scroll') || document.documentElement;
  const _scrollY = window.scrollY;
  const _scrollT = _scrollEl.scrollTop;
  if (wrap) wrap.style.display = 'block';
  canvas.style.display='block';
  document.body.classList.add('chart-active');
  // Восстанавливаем позицию немедленно
  window.scrollTo({top: _scrollY, behavior: 'instant'});
  _scrollEl.scrollTop = _scrollT;
  const ctx=canvas.getContext('2d');
  canvas.width=canvas.offsetWidth*2; canvas.height=300;
  ctx.scale(2,2);
  const W=canvas.offsetWidth,H=150;
  ctx.fillStyle='#080b10'; ctx.fillRect(0,0,W,H);

  // Рассчитываем min/max для обеих линий
  let mn=0,mx=0;
  for(let i=0;i<eq.length;i++) {if(eq[i]<mn)mn=eq[i];if(eq[i]>mx)mx=eq[i];}
  if (_eqMAFilterShowBaseline && baselineEq && baselineEq.length) {
    for(let i=0;i<baselineEq.length;i++) {if(baselineEq[i]<mn)mn=baselineEq[i];if(baselineEq[i]>mx)mx=baselineEq[i];}
  }
  const range=mx-mn||1, pad=14;

  ctx.strokeStyle='rgba(30,42,56,0.8)'; ctx.lineWidth=0.5;
  for(let v=-3;v<=3;v++) {
    const y=H-pad-((v*(range/4)+(mn+range/2)-mn)/range*(H-2*pad));
    if(y>pad&&y<H-pad) { ctx.beginPath(); ctx.moveTo(pad,y); ctx.lineTo(W-pad,y); ctx.stroke(); }
  }
  const zy=H-pad-((0-mn)/range*(H-2*pad));
  ctx.strokeStyle='rgba(255,255,255,0.15)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(pad,zy); ctx.lineTo(W-pad,zy); ctx.stroke();
  // IS/OOS or 1п/2п split line
  const _splitFrac = (splitPct != null && splitPct > 0 && splitPct < 100) ? splitPct / 100 : 0.5;
  const sx = pad + (W - 2*pad) * _splitFrac;
  const _isOOS = splitPct != null;
  ctx.strokeStyle = _isOOS ? 'rgba(255,160,40,0.7)' : 'rgba(255,170,0,0.4)';
  ctx.lineWidth = _isOOS ? 1.5 : 1;
  ctx.setLineDash([3,3]);
  ctx.beginPath(); ctx.moveTo(sx,pad); ctx.lineTo(sx,H-pad); ctx.stroke();
  ctx.setLineDash([]);
  if (_isOOS) {
    // Shaded OOS region
    ctx.fillStyle='rgba(255,160,40,0.04)';
    ctx.fillRect(sx, pad, W-pad-sx, H-2*pad);
  }
  // Pixel-exact mapping: nPx пикселей → eq[round(px*(n-1)/(nPx-1))]
  // Гарантирует заполнение ровно W-2*pad пикселей и точное совпадение с crosshair
  const nPx = W - 2 * pad;
  const nLast = Math.max(eq.length - 1, 1);
  ctx.beginPath();
  let firstX=pad;
  for(let px=0;px<nPx;px++) {
    const x=pad+px;
    const i=Math.round(px*(nLast)/(nPx-1));
    const y=H-pad-((eq[i]-mn)/range*(H-2*pad));
    if(px===0){ctx.moveTo(x,y);firstX=x;}else ctx.lineTo(x,y);
  }
  ctx.lineTo(W-pad,zy); ctx.lineTo(firstX,zy); ctx.closePath();
  ctx.fillStyle='rgba(0,212,255,0.06)'; ctx.fill();
  const grd=ctx.createLinearGradient(pad,0,W-pad,0);
  grd.addColorStop(0,'rgba(0,212,255,0.6)');
  grd.addColorStop(0.5,'rgba(0,230,118,0.8)');
  grd.addColorStop(1,'rgba(0,212,255,0.6)');
  ctx.strokeStyle=grd; ctx.lineWidth=1.5;
  ctx.beginPath();
  for(let px=0;px<nPx;px++) {
    const x=pad+px;
    const i=Math.round(px*(nLast)/(nPx-1));
    const y=H-pad-((eq[i]-mn)/range*(H-2*pad));
    if(px===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
  }
  ctx.stroke();

  // Рисуем baseline (без фильтра) если доступен и включен
  if (_eqMAFilterShowBaseline && baselineEq && baselineEq.length) {
    const baselineNLast = Math.max(baselineEq.length - 1, 1);
    ctx.strokeStyle = _eqMAFilterBaselineColor;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for(let px=0;px<nPx;px++) {
      const x=pad+px;
      const i=Math.round(px*(baselineNLast)/(nPx-1));
      const y=H-pad-((baselineEq[i]-mn)/range*(H-2*pad));
      if(px===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle='rgba(180,200,220,0.6)'; ctx.font='8px JetBrains Mono,monospace';
  ctx.fillText(mx.toFixed(1)+'%',1,pad+7);
  ctx.fillText(mn.toFixed(1)+'%',1,H-pad-2);
  ctx.fillStyle='rgba(0,212,255,0.7)'; ctx.font='8px JetBrains Mono,monospace';
  // Полное название с ★ если избранное, перенос по словам
  const _favPrefix = (typeof isFav === 'function' && isFav(label)) ? '★ ' : '';
  const _fullLabel = _favPrefix + (label||'');
  const _maxLabelW = W - pad - 4;
  const _labelWords = _fullLabel.split(' ');
  const _labelLines = [];
  let _curLine = '';
  for (const _w of _labelWords) {
    const _test = _curLine ? _curLine + ' ' + _w : _w;
    if (ctx.measureText(_test).width > _maxLabelW && _curLine) {
      _labelLines.push(_curLine); _curLine = _w;
    } else { _curLine = _test; }
  }
  if (_curLine) _labelLines.push(_curLine);
  _labelLines.slice(0, 3).forEach((_line, _li) => ctx.fillText(_line, pad, 9 + _li * 9));
  ctx.fillStyle='rgba(255,160,40,0.6)';
  if (_isOOS) {
    ctx.fillText(`◄ IS (${splitPct}%)`, sx-38, H-4);
    ctx.fillText(`OOS (${100-splitPct}%) ►`, sx+4, H-4);
  } else {
    ctx.fillText('◄ 1п      2п ►', sx-24, H-4);
  }

  // Сохраняем параметры для crosshair
  _eqChartParams = { eq, mn, mx, range, pad, W, H, label };

  // Синхронизируем размер crosshair-canvas
  const ch = document.getElementById('eq-crosshair');
  if (ch) { ch.width = canvas.width; ch.height = canvas.height; ch.style.width = canvas.style.width || canvas.offsetWidth+'px'; ch.style.height = '150px'; }
}

function drawEquity(name) {
  const eq=equities[name]; if(!eq) return;
  drawEquityData(eq, name);
}

// Обёртка для режимов hc/fav — рисует equity из объекта результата
function drawEquityForResult(r) {
  if (!r) return;

  // Если результат из OOS (имеет old_eq и new_eq), рисуем полный OOS график
  if (r.old_eq && r.old_eq.length && r.new_eq && r.new_eq.length) {
    _drawOOSGraphicForResult(r);
    return;
  }

  const splitPct = r.cfg?._oos?.isPct ?? null;
  const baselineEq = r.eqCalcMAArr || null; // Baseline для MA Equity Filter

  // Проверяем доступные источники equity
  if (r.eq && r.eq.length) {
    drawEquityData(r.eq, r.name, splitPct, baselineEq);
  } else if (equities[r.name]) {
    drawEquityData(equities[r.name], r.name, splitPct, baselineEq);
  } else if (r.cfg) {
    // Для fav и hc результатов без eq — запускаем лёгкий бэктест
    const raw = _hcRunBacktest(r.cfg);
    if (raw && raw.eq) {
      r.eq = raw.eq; // кэшируем
      drawEquityData(raw.eq, r.name, splitPct, baselineEq);
    }
  }
}

// Рисует полный OOS график (история + новые данные) для избранных результатов
function _drawOOSGraphicForResult(r) {
  const canvas = document.getElementById('eqc');
  if (!canvas) return;

  const eq_old = r.old_eq;
  const eq_new = r.new_eq;

  // Определяем пересечение данных по timestamps
  let overlapIdx = 0; // индекс в NEW_DATA где начинаются новые бары без пересечения
  if (DATA && NEW_DATA && DATA.length > 0 && NEW_DATA.length > 0) {
    const lastOldT = DATA[DATA.length - 1].t;
    const firstNewT = NEW_DATA[0].t;

    if (lastOldT && firstNewT) {
      // Есть timestamps - ищем пересечение
      for (let i = 0; i < NEW_DATA.length; i++) {
        if (NEW_DATA[i].t && NEW_DATA[i].t > lastOldT) {
          overlapIdx = i;
          break;
        }
      }
    }
  }

  // Пропускаем пересекающиеся бары из eq_new
  let newEqClean = eq_new.slice(overlapIdx);

  // Рассчитаем прогрев для новых данных (игнорируем первые N баров)
  if (newEqClean && newEqClean.length > 0) {
    const cfg = r.cfg || {};
    // Минимальный прогрев: макс из MA, pivot, ATR периодов
    const maWarmup = cfg.useMA ? (cfg.maP || 20) : 0;
    const pivotWarmup = cfg.usePivot ? ((cfg.pvL || 5) + (cfg.pvR || 2) + 5) : 0;
    const atrWarmup = cfg.useATR ? (cfg.atrPeriod || 14) * 3 : 0;
    const warmup = Math.max(maWarmup, pivotWarmup, atrWarmup, 1);

    // Пропускаем первые warmup баров из equity кривой (убираем прогрев)
    const warmupEndIdx = Math.min(warmup, newEqClean.length - 1);
    if (warmupEndIdx > 0 && warmupEndIdx < newEqClean.length) {
      // Берём значение при окончании прогрева и смещаем
      const warmupValue = newEqClean[warmupEndIdx];
      newEqClean = newEqClean.slice(warmupEndIdx).map(v => v - warmupValue);
    }
  }

  // Concatenate: новый сегмент продолжает с последнего значения истории (без пересечения)
  const lastOld = eq_old[eq_old.length - 1];
  const combined = [...eq_old, ...newEqClean.map(v => v + lastOld)];
  const splitIdx  = eq_old.length;
  const splitFrac = (splitIdx - 1) / (combined.length - 1);

  const dpr = window.devicePixelRatio || 1;
  canvas.width  = canvas.offsetWidth  * dpr;
  canvas.height = canvas.offsetHeight * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const W = canvas.offsetWidth, H = canvas.offsetHeight;
  const pad = 16;

  ctx.fillStyle = '#080b10';
  ctx.fillRect(0, 0, W, H);

  // Диапазон значений
  let mn = 0, mx = 0;
  for (const v of combined) { if (v < mn) mn = v; if (v > mx) mx = v; }
  const range = mx - mn || 1;
  const toY = v => H - pad - ((v - mn) / range * (H - 2 * pad));

  // Сетка
  ctx.strokeStyle = 'rgba(30,42,56,0.8)'; ctx.lineWidth = 0.5;
  for (let i = 1; i < 4; i++) {
    const y = pad + (H - 2 * pad) * i / 4;
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke();
  }
  // Нулевая линия
  const zy = toY(0);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad, zy); ctx.lineTo(W - pad, zy); ctx.stroke();

  // Вертикальная линия разделения
  const sx = pad + (W - 2 * pad) * splitFrac;
  ctx.strokeStyle = 'rgba(255,160,40,0.6)'; ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(sx, pad - 4); ctx.lineTo(sx, H - pad + 4); ctx.stroke();
  ctx.setLineDash([]);
  // Подсветка зоны новых данных
  ctx.fillStyle = 'rgba(255,160,40,0.04)';
  ctx.fillRect(sx, pad, W - pad - sx, H - 2 * pad);

  const nPx  = W - 2 * pad;
  const nLst = Math.max(combined.length - 1, 1);
  const pxSp = Math.round(splitFrac * (nPx - 1)); // пиксель разделения

  // Функция пути по сегменту [pxA..pxB]
  function pathSeg(pxA, pxB) {
    ctx.beginPath();
    for (let px = pxA; px <= pxB; px++) {
      const i = Math.round(px * nLst / (nPx - 1));
      const x = pad + px, y = toY(combined[Math.min(i, combined.length - 1)]);
      px === pxA ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
  }

  // Заливка — история
  pathSeg(0, pxSp);
  ctx.lineTo(pad + pxSp, zy); ctx.lineTo(pad, zy); ctx.closePath();
  ctx.fillStyle = 'rgba(0,212,255,0.06)'; ctx.fill();

  // Заливка — новые данные
  pathSeg(pxSp, nPx - 1);
  ctx.lineTo(W - pad, zy); ctx.lineTo(pad + pxSp, zy); ctx.closePath();
  ctx.fillStyle = 'rgba(255,160,40,0.06)'; ctx.fill();

  // Линия — история
  pathSeg(0, pxSp);
  const gOld = ctx.createLinearGradient(pad, 0, pad + pxSp, 0);
  gOld.addColorStop(0, 'rgba(0,212,255,0.7)'); gOld.addColorStop(1, 'rgba(0,212,255,0.9)');
  ctx.strokeStyle = gOld; ctx.lineWidth = 1.5; ctx.stroke();

  // Линия — новые данные
  pathSeg(pxSp, nPx - 1);
  const gNew = ctx.createLinearGradient(pad + pxSp, 0, W - pad, 0);
  gNew.addColorStop(0, 'rgba(255,160,40,0.9)'); gNew.addColorStop(1, 'rgba(255,100,20,0.8)');
  ctx.strokeStyle = gNew; ctx.lineWidth = 1.5; ctx.stroke();
}
