function showBestStats() { /* removed */ }

// Параметры последнего нарисованного графика — для crosshair
let _eqChartParams = null;

// Настройки отображения MA Equity Filter
let _eqMAFilterShowBaseline = true;
let _eqMAFilterBaselineColor = '#00b4d8'; // голубой по умолчанию (вместо красного)

// Загружаем сохранённый цвет из localStorage
function loadBaselineColorFromStorage() {
  const saved = localStorage.getItem('eqMAFilterBaselineColor');
  if (saved) {
    _eqMAFilterBaselineColor = saved;
    // Обновляем value в color picker если он существует
    const picker = document.getElementById('baseline-color-picker');
    if (picker) picker.value = saved;
  }
}

// Сохраняем цвет в localStorage
function saveBaselineColorToStorage(color) {
  localStorage.setItem('eqMAFilterBaselineColor', color);
}

function drawEquityData(eq, label, splitPct, baselineEq=null) {
  if (!eq || !eq.length) {
    if (window.__DEBUG_EQUITY) console.log('  ❌ drawEquityData REJECTED: no eq data');
    return;
  }

  if (window.__DEBUG_EQUITY) {
    console.log('');
    console.log('📊 drawEquityData() CALLED:');
    console.log('  eq.length:', eq.length, '← 🔴 ORANGE LINE WILL BE THIS LENGTH');
    console.log('  label:', label);
    console.log('  splitPct:', splitPct, '← will draw split at', splitPct ? (splitPct + '% position') : '50% (default)');
    console.log('  baselineEq:', baselineEq ? `array[${baselineEq.length}]` : 'null');
    console.log('  eq[0..5]:', eq.slice(0, 5).map(v => v.toFixed(1)).join(', '));
    console.log('  eq[-5..-1]:', eq.slice(-5).map(v => v.toFixed(1)).join(', '));
  }

  const wrap = document.getElementById('eq-wrap');
  const canvas=$('eqc');
  if (!canvas) {
    if (window.__DEBUG_EQUITY) console.log('  ❌ Canvas element not found');
    return;
  }

  if (window.__DEBUG_EQUITY) console.log('  ✅ Canvas found, clearing and resizing...');
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

  if (window.__DEBUG_EQUITY) {
    console.log('  📐 Canvas dimensions:');
    console.log('    canvas.offsetWidth:', canvas.offsetWidth);
    console.log('    Setting canvas.width to:', canvas.offsetWidth * 2);
  }

  canvas.width=canvas.offsetWidth*2; canvas.height=300;
  ctx.scale(2,2);
  const W=canvas.offsetWidth,H=150;

  if (window.__DEBUG_EQUITY) {
    console.log('    ctx.scale(2, 2) applied');
    console.log('    W (working width):', W);
    console.log('    H (working height):', H);
    console.log('  🧹 Clearing canvas with black background...');
  }

  ctx.fillStyle='#080b10'; ctx.fillRect(0,0,W,H);

  // Рассчитываем min/max для обеих линий
  let mn=0,mx=0;
  for(let i=0;i<eq.length;i++) {if(eq[i]<mn)mn=eq[i];if(eq[i]>mx)mx=eq[i];}
  if (_eqMAFilterShowBaseline && baselineEq && baselineEq.length) {
    for(let i=0;i<baselineEq.length;i++) {if(baselineEq[i]<mn)mn=baselineEq[i];if(baselineEq[i]>mx)mx=baselineEq[i];}
  }
  const range=mx-mn||1, pad=14;

  if (window.__DEBUG_EQUITY) {
    console.log('  📈 Line drawing setup:');
    console.log('    _eqMAFilterShowBaseline:', _eqMAFilterShowBaseline);
    console.log('    Will draw MAIN line (eq['+eq.length+']):', _eqMAFilterShowBaseline ? 'YES (with baseline overlay)' : 'YES (main only)');
    if (_eqMAFilterShowBaseline && baselineEq && baselineEq.length) {
      console.log('    Will ALSO draw BASELINE line (baselineEq['+baselineEq.length+']): YES');
      console.log('    ⚠️  BASELINE IS SHORTER:', baselineEq.length, 'vs EQ:', eq.length);
    }
    console.log('    Data range: min='+mn.toFixed(2)+', max='+mx.toFixed(2)+', range='+range.toFixed(2));
  }

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
    if (window.__DEBUG_EQUITY) {
      console.log('  🟠 Drawing BASELINE (secondary line):');
      console.log('    baselineEq.length:', baselineEq.length);
      console.log('    color:', _eqMAFilterBaselineColor);
      console.log('    This baseline line may appear as orange if enabled!');
    }
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

  if (window.__DEBUG_EQUITY) {
    console.log('  ✅ drawEquityData COMPLETE - Chart rendered to canvas');
    console.log('═══════════════════════════════════════════════════════');
  }
}

function drawEquity(name) {
  const eq=equities[name]; if(!eq) return;
  drawEquityData(eq, name);
}

// Обёртка для режимов hc/fav — рисует equity из объекта результата
function drawEquityForResult(r) {
  if (!r) return;

  if (window.__DEBUG_EQUITY) {
    console.log('');
    console.log('🎨 drawEquityForResult() ENTRY:');
    console.log('  r.name:', r.name);
    console.log('  r._isOOSResult:', r._isOOSResult ?? 'undefined');
  }

  // ##EQ_MA_FILTER## Если результат из OOS (имеет old_eq и new_eq), рисуем полный OOS график
  // WAVE 8 FIX: Достаточно проверить наличие OOS данных, флаг не обязателен
  // (Некоторые результаты могут иметь old_eq/new_eq через копирование без флага)
  const hasOOSData = r.old_eq && r.old_eq.length && r.new_eq && r.new_eq.length;

  if (window.__DEBUG_EQUITY) {
    console.log('  ┌─ OOS DATA CHECK:');
    console.log('  │  r.old_eq:', r.old_eq ? `array[${r.old_eq.length}]` : 'NULL');
    console.log('  │  r.new_eq:', r.new_eq ? `array[${r.new_eq.length}]` : 'NULL');
    console.log('  │  hasOOSData:', hasOOSData);
    console.log('  └─');
    if (hasOOSData) {
      console.log('  ✅ PATH: _drawOOSGraphicForResult() - OOS split rendering');
    }
  }

  if (hasOOSData) {
    if (window.__DEBUG_EQUITY) console.log('  → CALLING _drawOOSGraphicForResult()');
    _drawOOSGraphicForResult(r);  // WAVE 8: используем OOS рисование если есть OOS данные
    return;
  }

  const splitPct = r.cfg?._oos?.isPct ?? null;
  const baselineEq = r.eqCalcBaselineArr || null; // Baseline для MA Equity Filter (саму эквити, не MA) ##EQ_MA_FILTER##

  // ⚠️ Для HC результатов: используем _fullEq если доступен (полный eq с OOS split)
  // Это полный backtest(100%), а не оригинальный HC результат
  let eqToDisplay = r._fullEq || r.eq;

  // 🔧 WAVE 10 FIX: Если baselineEq короче чем eq, они из разных периодов (IS vs полный)
  // Baseline была рассчитана на 70% IS данных, а eq это полные 100% данные
  // Показывать baseline только если оба из одного периода (одинаковой длины)
  const baselineEqToUse = (baselineEq && eqToDisplay && baselineEq.length === eqToDisplay.length) ? baselineEq : null;

  if (window.__DEBUG_EQUITY) {
    console.log('  ┌─ FALLBACK RENDERING (no OOS data):');
    console.log('  │  splitPct:', splitPct);
    console.log('  │  r._fullEq:', r._fullEq ? `array[${r._fullEq.length}]` : 'NULL');
    console.log('  │  r.eq:', r.eq ? `array[${r.eq.length}]` : 'NULL');
    console.log('  │  eqToDisplay:', eqToDisplay ? `array[${eqToDisplay.length}]` : 'NULL');
    console.log('  │  equities[r.name]:', equities[r.name] ? `array[${equities[r.name].length}]` : 'NULL');
    console.log('  │  baselineEq (raw):', baselineEq ? `array[${baselineEq.length}]` : 'NULL');
    console.log('  │  baselineEqToUse (WAVE 10 FIX):', baselineEqToUse ? `array[${baselineEqToUse.length}]` : 'NULL (mismatched lengths)');
  }

  // Проверяем доступные источники equity
  if (eqToDisplay && eqToDisplay.length) {
    if (window.__DEBUG_EQUITY) console.log('  │  ✅ Using r._fullEq/r.eq');
    console.log('  └─');
    console.log('  → CALLING drawEquityData(eqToDisplay, splitPct=' + splitPct + ')');
    drawEquityData(eqToDisplay, r.name, splitPct, baselineEqToUse);
  } else if (equities[r.name]) {
    if (window.__DEBUG_EQUITY) console.log('  │  ✅ Using equities[r.name] FALLBACK');
    console.log('  └─');
    console.log('  → CALLING drawEquityData(equities[r.name], splitPct=' + splitPct + ')');
    drawEquityData(equities[r.name], r.name, splitPct, baselineEq);
  } else if (r.cfg) {
    if (window.__DEBUG_EQUITY) console.log('  │  ✅ Running _hcRunBacktest()');
    console.log('  └─');
    // Для fav и hc результатов без eq — запускаем лёгкий бэктест
    const raw = _hcRunBacktest(r.cfg);
    if (raw && raw.eq) {
      if (window.__DEBUG_EQUITY) console.log('  → CALLING drawEquityData(backtest result, splitPct=' + splitPct + ')');
      // КРИТИЧНО: Копируем eq - иначе кэш может быть переиспользован и результат повреждён
      r.eq = Array.from(raw.eq);
      drawEquityData(r.eq, r.name, splitPct, baselineEq);
    }
  } else {
    if (window.__DEBUG_EQUITY) {
      console.log('  └─');
      console.log('  ❌ NO EQUITY DATA FOUND - Cannot render!');
    }
  }
}

// Рисует полный OOS график (история + новые данные) для избранных результатов
function _drawOOSGraphicForResult(r) {
  if (window.__DEBUG_EQUITY) {
    console.log('');
    console.log('🔷 _drawOOSGraphicForResult() CALLED - OOS SPLIT RENDERING:');
    console.log('  r.name:', r.name);
  }

  const canvas = document.getElementById('eqc');
  if (!canvas) {
    if (window.__DEBUG_EQUITY) console.log('  ❌ Canvas not found');
    return;
  }

  if (window.__DEBUG_EQUITY) console.log('  ✅ Canvas found');

  const eq_old = r.old_eq;
  const eq_new = r.new_eq;
  const baseline_old = r.old_eqCalcBaselineArr; // baseline на истории ##EQ_MA_FILTER##
  const baseline_new = r.new_eqCalcBaselineArr; // baseline на новых данных ##EQ_MA_FILTER##

  if (window.__DEBUG_EQUITY) {
    console.log('  📊 Data sources:');
    console.log('    eq_old (BLUE/IS):', eq_old ? `array[${eq_old.length}]` : 'NULL');
    console.log('    eq_new (ORANGE/OOS):', eq_new ? `array[${eq_new.length}]` : 'NULL');
    console.log('    baseline_old:', baseline_old ? `array[${baseline_old.length}]` : 'NULL');
    console.log('    baseline_new:', baseline_new ? `array[${baseline_new.length}]` : 'NULL');
  }

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

  // КРИТИЧНО: eq_new это ПОЛНЫЙ eq (включая пересечение и warmup)
  // ВОЛНА 7: ТАКЖЕ очищаем eq_old от warmup чтобы обе кривые выравнены
  // Проблема: eq_old содержала warmup бары (0-29), eq_new их удаляла
  // Результат: синие линия казалась "впереди" потому что не имела flat warmup-периода
  // Решение: удалить warmup из ОБЕИХ кривых перед конкатенацией

  let oldEqClean = eq_old;  // ВОЛНА 7: Новое - очищение eq_old
  let oldBaselineClean = baseline_old;
  let newEqClean = eq_new;
  let newBaselineClean = baseline_new;

  if ((oldEqClean || newEqClean) && (oldEqClean?.length > 0 || newEqClean?.length > 0)) {
    const cfg = r.cfg || {};

    // Рассчитываем warmup (используется для ОБЕИХ кривых)
    const maWarmup = cfg.useMA ? (cfg.maP || 20) : 0;
    const pivotWarmup = cfg.usePivot ? ((cfg.pvL || 5) + (cfg.pvR || 2) + 5) : 0;
    const atrWarmup = cfg.useATR ? (cfg.atrPeriod || 14) * 3 : 0;
    const eqMAWarmup = cfg.useEqMA ? (cfg.eqMALen || 20) : 0;
    const warmup = Math.max(maWarmup, pivotWarmup, atrWarmup, eqMAWarmup, 1);

    // ВОЛНА 7: Очищаем eq_old от warmup (просто удаляем первые warmup баров)
    if (oldEqClean && oldEqClean.length > warmup) {
      const startValOld = oldEqClean[warmup];
      oldEqClean = oldEqClean.slice(warmup).map(v => v - startValOld);

      if (oldBaselineClean && oldBaselineClean.length > warmup) {
        const startValOldBL = oldBaselineClean[warmup];
        oldBaselineClean = oldBaselineClean.slice(warmup).map(v => v - startValOldBL);
      }
    }

    // ГЛАВНОЕ: обрезаем eq_new по МАКСИМУМУ из (overlapIdx, warmup)
    // Это гарантирует что оба удалены и warmup совпадает
    const minCleanIdx = Math.max(overlapIdx, warmup);

    if (newEqClean && minCleanIdx < newEqClean.length) {
      // Вычитаем значение при окончании warmup из ВСЕХ данных
      const warmupValue = newEqClean[minCleanIdx];
      newEqClean = newEqClean.map(v => v - warmupValue);

      if (newBaselineClean && newBaselineClean.length > minCleanIdx) {
        const warmupValueBL = newBaselineClean[minCleanIdx];
        newBaselineClean = newBaselineClean.map(v => v - warmupValueBL);
      }
    }

    // Теперь обрезаем eq_new по minCleanIdx чтобы убрать overlap и warmup
    if (newEqClean) {
      newEqClean = newEqClean.slice(minCleanIdx);
      if (newBaselineClean) newBaselineClean = newBaselineClean.slice(minCleanIdx);
    }
  }

  // Concatenate: новый сегмент продолжает с последнего значения истории (без пересечения)
  const lastOld = oldEqClean[oldEqClean.length - 1];
  const combined = [...oldEqClean, ...newEqClean.map(v => v + lastOld)];

  if (window.__DEBUG_EQUITY) {
    console.log('  🔗 After cleaning & concatenation:');
    console.log('    oldEqClean.length:', oldEqClean.length, '← BLUE will draw this many points');
    console.log('    newEqClean.length:', newEqClean.length, '← ORANGE will add this many points');
    console.log('    combined.length:', combined.length, '← TOTAL points to render');
    console.log('    lastOld:', lastOld, '← transition point value');
  }

  // 🔍 ДИАГНОСТИКА: Отследить расхождение eq_old vs eq_new
  if (typeof window !== 'undefined' && window.__DEBUG_OOS) {
    console.log('\n╔════════════════════════════════════════════════════════════════════╗');
    console.log('║ OOS EQUITY DIVERGENCE TRACE                                          ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝');
    console.log('Result:', r.name || 'unknown');
    console.log('');

    console.log('📊 ORIGINAL (r.old_eq, r.new_eq):');
    console.log('  old_eq[0-10]:', (r.old_eq || []).slice(0, 10).map(v => v.toFixed(1)).join(', '));
    console.log('  new_eq[0-10]:', (r.new_eq || []).slice(0, 10).map(v => v.toFixed(1)).join(', '));
    console.log('  old_eq.length:', r.old_eq?.length, '| new_eq.length:', r.new_eq?.length);
    console.log('');

    console.log('🧹 AFTER CLEANING (oldEqClean, newEqClean):');
    console.log('  oldEqClean[0-10]:', oldEqClean.slice(0, 10).map(v => v.toFixed(1)).join(', '));
    console.log('  newEqClean[0-10]:', newEqClean.slice(0, 10).map(v => v.toFixed(1)).join(', '));
    console.log('  oldEqClean.length:', oldEqClean.length, '| newEqClean.length:', newEqClean.length);
    console.log('');

    console.log('🔗 CONNECTION (lastOld):');
    console.log('  lastOld:', lastOld.toFixed(2));
    console.log('  oldEqClean[-5]:', oldEqClean.slice(-5).map(v => v.toFixed(1)).join(', '));
    console.log('  newEqClean[-5]:', newEqClean.slice(-5).map(v => v.toFixed(1)).join(', '));
    console.log('');

    console.log('📈 COMBINED (final):');
    console.log('  combined[0-10]:', combined.slice(0, 10).map(v => v.toFixed(1)).join(', '));
    console.log('  combined[-5]:', combined.slice(-5).map(v => v.toFixed(1)).join(', '));
    console.log('  combined.length:', combined.length);
    console.log('');

    // Поиск расхождения
    console.log('🔎 DIVERGENCE ANALYSIS:');
    const minLen = Math.min(r.old_eq?.length || 0, r.new_eq?.length || 0);
    let maxRatioDiff = 0;
    let maxRatioDiffIdx = 0;
    for (let i = 1; i < Math.min(minLen, 100); i++) {
      const oldVal = r.old_eq[i] || 0.001;
      const newVal = r.new_eq[i] || 0.001;
      const ratio = newVal / oldVal;
      const ratioDiff = Math.abs(ratio - 1);
      if (ratioDiff > maxRatioDiff) {
        maxRatioDiff = ratioDiff;
        maxRatioDiffIdx = i;
      }
    }
    console.log('  First major divergence at bar:', maxRatioDiffIdx);
    console.log('  old_eq[' + maxRatioDiffIdx + ']:', r.old_eq?.[maxRatioDiffIdx]?.toFixed(2));
    console.log('  new_eq[' + maxRatioDiffIdx + ']:', r.new_eq?.[maxRatioDiffIdx]?.toFixed(2));
    console.log('  Ratio (new/old):', (r.new_eq?.[maxRatioDiffIdx] / (r.old_eq?.[maxRatioDiffIdx] || 1))?.toFixed(3));
    console.log('');
    console.log('💡 TIP: Откройте DevTools (F12) чтобы увидеть эту информацию!');
    console.log('    Установите: window.__DEBUG_OOS = true перед открытием результата');
  }

  // Аналогично для baseline ##EQ_MA_FILTER##
  let combined_baseline = null;
  if (_eqMAFilterShowBaseline && oldBaselineClean && newBaselineClean) {
    const lastOldBL = oldBaselineClean[oldBaselineClean.length - 1];
    combined_baseline = [...oldBaselineClean, ...newBaselineClean.map(v => v + lastOldBL)];
  }

  const splitIdx  = oldEqClean.length;  // ВОЛНА 7: использовать очищенную длину
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

  // Линия — история (BLUE/CYAN)
  if (window.__DEBUG_EQUITY) {
    console.log('  🎨 Drawing lines:');
    console.log('    BLUE line (IS/History): from pixel 0 to', pxSp);
  }
  pathSeg(0, pxSp);
  const gOld = ctx.createLinearGradient(pad, 0, pad + pxSp, 0);
  gOld.addColorStop(0, 'rgba(0,212,255,0.7)'); gOld.addColorStop(1, 'rgba(0,212,255,0.9)');
  ctx.strokeStyle = gOld; ctx.lineWidth = 1.5; ctx.stroke();

  // Линия — новые данные (ORANGE)
  if (window.__DEBUG_EQUITY) {
    console.log('    ORANGE line (OOS): from pixel', pxSp, 'to', nPx - 1);
  }
  pathSeg(pxSp, nPx - 1);
  const gNew = ctx.createLinearGradient(pad + pxSp, 0, W - pad, 0);
  gNew.addColorStop(0, 'rgba(255,160,40,0.9)'); gNew.addColorStop(1, 'rgba(255,100,20,0.8)');
  ctx.strokeStyle = gNew; ctx.lineWidth = 1.5; ctx.stroke();

  // Рисуем baseline (без фильтра) если доступен и включен ##EQ_MA_FILTER##
  if (_eqMAFilterShowBaseline && combined_baseline && combined_baseline.length === combined.length) {
    const toYBL = v => H - pad - ((v - mn) / range * (H - 2 * pad));

    function pathSegBL(pxA, pxB) {
      ctx.beginPath();
      for (let px = pxA; px <= pxB; px++) {
        const i = Math.round(px * nLst / (nPx - 1));
        const x = pad + px, y = toYBL(combined_baseline[Math.min(i, combined_baseline.length - 1)]);
        px === pxA ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
    }

    ctx.strokeStyle = _eqMAFilterBaselineColor;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1.2;
    pathSegBL(0, nPx - 1);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  if (window.__DEBUG_EQUITY) {
    console.log('  ✅ _drawOOSGraphicForResult COMPLETE - OOS split chart rendered');
    console.log('═══════════════════════════════════════════════════════');
  }
}
