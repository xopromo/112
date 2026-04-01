// ============================================================
// PARAMETER SENSITIVITY HEATMAP
// ============================================================
// Показывает устойчивость стратегии при изменении 2 параметров.
// Открывается кнопкой "🗺️ Карта параметров" в детальной панели.

const _HM_PARAMS = [
  { key: 'pvL',       label: 'Pivot Left',   step: 1,    min: 1,   max: 15  },
  { key: 'pvR',       label: 'Pivot Right',  step: 1,    min: 1,   max: 8   },
  { key: 'atrPeriod', label: 'ATR Period',   step: 1,    min: 3,   max: 35  },
  { key: 'sl_a_m',    label: 'SL ATR mult',  step: 0.5,  min: 0.5, max: 6   },
  { key: 'sl_p_m',    label: 'SL % mult',    step: 0.5,  min: 0.5, max: 8   },
  { key: 'tp_a_m',    label: 'TP mult',      step: 0.5,  min: 0.5, max: 8   },
  { key: 'tp_b_m',    label: 'TP-B mult',    step: 0.5,  min: 0.5, max: 8   },
  { key: 'maP',       label: 'MA Period',    step: 5,    min: 10,  max: 200 },
  { key: 'beTrig',    label: 'BE Trigger',   step: 0.25, min: 0.25, max: 4  },
  { key: 'trTrig',    label: 'Trail Trig',   step: 0.25, min: 0.25, max: 4  },
  { key: 'trDist',    label: 'Trail Dist',   step: 0.25, min: 0.1,  max: 3  },
  { key: 'adxThresh', label: 'ADX Thresh',   step: 5,    min: 10,  max: 55  },
  { key: 'revBars',   label: 'Rev Bars',     step: 1,    min: 1,   max: 15  },
];

let _hmRunning = false;
let _hmStop    = false;

function openHeatmapModal() {
  if (!_robustResult || !_robustResult.cfg) {
    alert('Сначала откройте стратегию из таблицы результатов');
    return;
  }
  const cfg = _robustResult.cfg;
  const available = _HM_PARAMS.filter(p => typeof cfg[p.key] === 'number' && isFinite(cfg[p.key]));
  if (available.length < 2) {
    alert('Недостаточно числовых параметров для построения карты (нужно минимум 2)');
    return;
  }

  const xSel = document.getElementById('hm-x-param');
  const ySel = document.getElementById('hm-y-param');
  xSel.innerHTML = '';
  ySel.innerHTML = '';
  available.forEach(p => {
    xSel.add(new Option(`${p.label}  [${cfg[p.key]}]`, p.key));
    ySel.add(new Option(`${p.label}  [${cfg[p.key]}]`, p.key));
  });
  if (available.length >= 2) ySel.selectedIndex = 1;

  document.getElementById('hm-status').textContent = '';
  const canvas = document.getElementById('hm-canvas');
  if (canvas) { canvas.width = 0; canvas.height = 0; }
  document.getElementById('hm-run-btn').textContent = '▶ Запустить';
  document.getElementById('heatmap-overlay').classList.add('open');
}

function closeHeatmapModal() {
  _hmStop = true;
  document.getElementById('heatmap-overlay').classList.remove('open');
}

async function runHeatmap() {
  if (!_robustResult || !_robustResult.cfg) return;
  if (_hmRunning) { _hmStop = true; return; }

  const cfg    = _robustResult.cfg;
  const xKey   = document.getElementById('hm-x-param').value;
  const yKey   = document.getElementById('hm-y-param').value;
  const nSteps = parseInt(document.getElementById('hm-steps').value);
  const metric = document.getElementById('hm-metric').value;

  if (xKey === yKey) { alert('Выберите разные параметры для осей X и Y'); return; }

  const xParam = _HM_PARAMS.find(p => p.key === xKey);
  const yParam = _HM_PARAMS.find(p => p.key === yKey);
  if (!xParam || !yParam) return;

  function genAxis(param) {
    const center = cfg[param.key];
    const vals = [];
    for (let i = -nSteps; i <= nSteps; i++) {
      const v = Math.round((center + i * param.step) * 10000) / 10000;
      if (v >= param.min && v <= param.max) vals.push(v);
    }
    return vals;
  }

  const xVals = genAxis(xParam);
  const yVals = genAxis(yParam);
  const total = xVals.length * yVals.length;

  _hmRunning = true;
  _hmStop    = false;
  const runBtn = document.getElementById('hm-run-btn');
  runBtn.textContent = '⏹ Стоп';

  const grid = [];
  let done = 0;

  for (let yi = 0; yi < yVals.length; yi++) {
    if (_hmStop) break;
    const row = [];
    for (let xi = 0; xi < xVals.length; xi++) {
      if (_hmStop) break;

      const testCfg = Object.assign({}, cfg, { [xKey]: xVals[xi], [yKey]: yVals[yi] });
      const res = _hcRunBacktest(testCfg);

      let val = null;
      if (res && res.n > 0) {
        if      (metric === 'pnl') val = res.pnl;
        else if (metric === 'wr')  val = res.wr;
        else if (metric === 'dd')  val = res.dd;
        else if (metric === 'pdd') val = res.dd > 0 ? res.pnl / res.dd : null;
        else if (metric === 'n')   val = res.n;
      }
      row.push(val);
      done++;

      if (done % 7 === 0) {
        document.getElementById('hm-status').textContent = `${done}/${total}`;
        _hmRender(grid.concat([row]), xVals, yVals, xParam, yParam, metric, cfg[xKey], cfg[yKey]);
        await yieldToUI();
      }
    }
    grid.push(row);
  }

  _hmRender(grid, xVals, yVals, xParam, yParam, metric, cfg[xKey], cfg[yKey]);
  document.getElementById('hm-status').textContent = _hmStop ? `⏹ ${done}/${total}` : `✓ ${total} ячеек`;
  _hmRunning = false;
  _hmStop    = false;
  runBtn.textContent = '▶ Запустить';
}

function _hmRender(grid, xVals, yVals, xParam, yParam, metric, cX, cY) {
  const canvas = document.getElementById('hm-canvas');
  const wrap   = document.getElementById('hm-canvas-wrap');
  if (!canvas || !wrap) return;

  const PAD_L = 66, PAD_R = 14, PAD_T = 34, PAD_B = 44;
  const cols = xVals.length, rows = yVals.length;
  const wrapW  = Math.max(wrap.clientWidth - 8, 300);
  const cellW  = Math.max(Math.floor((wrapW - PAD_L - PAD_R) / cols), 28);
  const cellH  = Math.max(cellW - 2, 26);
  const W = PAD_L + cols * cellW + PAD_R;
  const H = PAD_T + rows * cellH + PAD_B;

  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const flat = grid.flat().filter(v => v !== null && isFinite(v));
  if (!flat.length) return;

  const lowerBetter = (metric === 'dd');
  const minV = Math.min(...flat), maxV = Math.max(...flat);
  const range = maxV - minV || 1;

  function getColor(v) {
    if (v === null || !isFinite(v)) return '#1a1a1a';
    let t = (v - minV) / range;
    if (lowerBetter) t = 1 - t;
    const r = t < 0.5 ? 255 : Math.round(255 - (t - 0.5) * 2 * 205);
    const g = t < 0.5 ? Math.round(t * 2 * 185) : 185;
    const b = t < 0.5 ? 70  : Math.round(70 - (t - 0.5) * 2 * 50);
    return `rgba(${r},${g},${b},0.85)`;
  }

  const fSize = Math.max(9, Math.min(12, cellH - 10));
  ctx.font = `${fSize}px monospace`;

  for (let yi = 0; yi < grid.length; yi++) {
    const row = grid[yi];
    for (let xi = 0; xi < (row ? row.length : 0); xi++) {
      const v  = row[xi];
      const cx = PAD_L + xi * cellW;
      const cy = PAD_T + (rows - 1 - yi) * cellH;

      ctx.fillStyle = getColor(v);
      ctx.fillRect(cx, cy, cellW, cellH);

      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(cx, cy, cellW, cellH);

      if (xVals[xi] === cX && yVals[yi] === cY) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(cx + 1.5, cy + 1.5, cellW - 3, cellH - 3);
      }

      if (v !== null && cellW > 30) {
        const disp = metric === 'n'   ? String(v)
                   : metric === 'pdd' ? v.toFixed(2)
                   : metric === 'dd'  ? v.toFixed(1) + '%'
                   :                    v.toFixed(1);
        ctx.fillStyle = 'rgba(0,0,0,0.78)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(disp, cx + cellW / 2, cy + cellH / 2);
      }
    }
  }

  ctx.font = '10px monospace';
  ctx.textBaseline = 'top';
  for (let xi = 0; xi < xVals.length; xi++) {
    const cx = PAD_L + xi * cellW + cellW / 2;
    ctx.fillStyle = xVals[xi] === cX ? '#fff' : '#888';
    ctx.textAlign = 'center';
    ctx.fillText(xVals[xi], cx, PAD_T + rows * cellH + 5);
  }

  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let yi = 0; yi < yVals.length; yi++) {
    const cy = PAD_T + (rows - 1 - yi) * cellH + cellH / 2;
    ctx.fillStyle = yVals[yi] === cY ? '#fff' : '#888';
    ctx.fillText(yVals[yi], PAD_L - 6, cy);
  }

  ctx.fillStyle = '#ccc';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(xParam.label, PAD_L + cols * cellW / 2, H - 4);

  ctx.save();
  ctx.translate(11, PAD_T + rows * cellH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(yParam.label, 0, 0);
  ctx.restore();

  const legX = PAD_L, legY = 6, legW = cols * cellW, legH = 8;
  const grad = ctx.createLinearGradient(legX, 0, legX + legW, 0);
  if (lowerBetter) {
    grad.addColorStop(0,   'rgba(50,185,80,0.85)');
    grad.addColorStop(0.5, 'rgba(255,200,50,0.85)');
    grad.addColorStop(1,   'rgba(255,40,70,0.85)');
  } else {
    grad.addColorStop(0,   'rgba(255,40,70,0.85)');
    grad.addColorStop(0.5, 'rgba(255,185,50,0.85)');
    grad.addColorStop(1,   'rgba(50,185,80,0.85)');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(legX, legY, legW, legH);

  const fmt = v => metric === 'n'   ? String(Math.round(v))
                 : metric === 'pdd' ? v.toFixed(2)
                 :                    v.toFixed(1);
  ctx.fillStyle = '#777';
  ctx.font = '9px monospace';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(lowerBetter ? fmt(minV) + ' (лучше)' : fmt(minV), legX, legY + legH + 2);
  ctx.textAlign = 'right';
  ctx.fillText(lowerBetter ? fmt(maxV) : fmt(maxV) + ' (лучше)', legX + legW, legY + legH + 2);
}

