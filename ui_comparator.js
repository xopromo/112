// ─── Market Structure Comparator config reader ───────────────────────────────

function _checkMSCConfig() {
  const raw = localStorage.getItem('msc_config');
  if (!raw) return;
  let cfg;
  try { cfg = JSON.parse(raw); } catch(e) { localStorage.removeItem('msc_config'); return; }
  if (!cfg || !cfg.apply) return;

  localStorage.removeItem('msc_config');

  const meta = cfg.meta || {};
  const periodB = meta.periodB || {};
  const periodLabel = (periodB.start && periodB.end)
    ? `${periodB.start} — ${periodB.end}`
    : new Date().toLocaleDateString('ru-RU');
  const tplName = `📊 Comparator · ${periodLabel}`;

  // ── Build template settings: start from current DOM, then wipe entries/filters ──
  const settings = gatherSettings();

  // Disable ALL entry (e_*), filter (f_*), SL (s_*), TP (t_*) checkboxes → clean slate
  Object.keys(settings.chks).forEach(k => {
    if (/^[efst]_/.test(k)) settings.chks[k] = false;
  });

  // Apply comparator recommendations on top
  Object.entries(cfg.apply).forEach(([id, val]) => {
    if (typeof val === 'boolean') settings.chks[id] = val;
    else settings.vals[id] = String(val);
  });

  // Save as named template
  const existIdx = templates.findIndex(t => t.name === tplName);
  if (existIdx >= 0) {
    templates[existIdx].settings = settings;
    templates[existIdx].ts = Date.now();
    _activeTplIdx = existIdx;
  } else {
    templates.push({ name: tplName, settings, isDefault: false, ts: Date.now() });
    _activeTplIdx = templates.length - 1;
  }
  storeSave('use6_tpl', templates);

  // Build hints HTML
  const hintsHtml = (cfg.hints || []).map(h =>
    `<div style="font-size:12px;color:var(--fg2);line-height:1.5">${h.icon || '•'} ${h.text}</div>`
  ).join('');

  // Build what-was-enabled summary
  const enabledRows = Object.entries(cfg.apply).map(([id, val]) => {
    const label = { f_ma:'MA-фильтр', f_strend:'Простой тренд', s_atr:'SL ×ATR',
      s_atrv:'Множитель ATR', t_rr:'TP R:R', t_rrv:'Множитель R:R' }[id] || id;
    const display = typeof val === 'boolean' ? (val ? '✅' : '❌') : `<b style="color:var(--accent)">${val}</b>`;
    return `<span style="display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,.06);
      border-radius:5px;padding:2px 8px;font-size:12px;white-space:nowrap">
      ${display} <span style="color:var(--fg2)">${label}</span>
    </span>`;
  }).join('');

  // Show banner
  const banner = document.createElement('div');
  banner.id = 'msc-banner';
  banner.style.cssText = `
    position:fixed;bottom:16px;left:50%;transform:translateX(-50%);
    background:var(--bg2,#1e1e2e);border:1px solid rgba(137,220,235,.4);
    border-radius:10px;padding:14px 18px;z-index:9999;
    box-shadow:0 4px 20px rgba(0,0,0,.5);max-width:700px;width:calc(100vw - 32px);
    display:flex;flex-direction:column;gap:10px;
  `;
  banner.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
      <div>
        <span style="font-size:13px;font-weight:600;color:var(--accent)">📊 Шаблон от Comparator</span>
        <span style="color:var(--fg2);font-size:12px;margin-left:8px">${periodLabel}</span>
      </div>
      <button onclick="document.getElementById('msc-banner').remove()" style="
        background:none;border:none;color:var(--fg2);cursor:pointer;font-size:16px;padding:0;flex-shrink:0">✕</button>
    </div>
    <div style="font-size:11px;color:var(--fg2)">
      Все входные сигналы, фильтры, SL и TP <b style="color:var(--fg)">отключены</b>. Включено только:
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:5px">${enabledRows}</div>
    ${hintsHtml ? `
    <div id="msc-hints" style="display:none;flex-direction:column;gap:4px;border-top:1px solid rgba(255,255,255,.08);padding-top:8px">
      ${hintsHtml}
    </div>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <button id="msc-apply-btn" style="
        background:var(--accent,#89dceb);color:#1e1e2e;border:none;border-radius:6px;
        padding:7px 18px;font-size:13px;font-weight:700;cursor:pointer
      ">✅ Применено · Закрыть</button>
      ${hintsHtml ? `<button onclick="
        const h=document.getElementById('msc-hints');
        if(h){h.style.display=h.style.display==='none'?'flex':'none';
              this.textContent=h.style.display==='none'?'💡 Советы':'💡 Скрыть';}
      " style="background:rgba(255,255,255,.07);color:var(--fg);border:1px solid rgba(255,255,255,.15);
        border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer">💡 Советы</button>` : ''}
      <span style="font-size:11px;color:var(--fg2)">Шаблон «${tplName}» уже сохранён в 📂 Шаблоны</span>
    </div>
  `;
  document.body.appendChild(banner);

  // Auto-apply immediately — button "Открыть оптимизатор и применить" обещает применить
  applySettings(settings);
  _updateActiveTplBadge();
  showTplToast(`📊 Шаблон "${tplName}" загружен`);

  document.getElementById('msc-apply-btn').addEventListener('click', function() {
    const b = document.getElementById('msc-banner');
    if (b) b.remove();
  });
}

// ── OOS Trade Comparison Diagnostic ──────────────────────────────────────
// Сравнивает сделки оптимизатора (период B) с реальными сделками TradingView.
// Находит ВСЕ расхождения и классифицирует их по типу причины.

function _fmtBarDate(bar) {
  if (!bar || bar.t == null) return '?';
  return _normTime(bar.t);
}

function _tradeDiagTimeMs(t) {
  if (!t && t !== 0) return NaN;
  const s = String(t).trim();
  if (/^\d{9,10}$/.test(s)) return parseInt(s, 10) * 1000;
  if (/^\d{13}$/.test(s)) return parseInt(s, 10);
  const ms = new Date(s.replace(' ', 'T')).getTime();
  return isNaN(ms) ? new Date(s).getTime() : ms;
}

function _tradeDiagRangeFromTrades(trades) {
  let first = Infinity, last = -Infinity;
  for (const t of trades || []) {
    for (const v of [t.entryDateStr, t.exitDateStr]) {
      const ms = _tradeDiagTimeMs(v);
      if (!isNaN(ms)) { first = Math.min(first, ms); last = Math.max(last, ms); }
    }
  }
  return first !== Infinity ? { first, last } : null;
}

function _tradeDiagRangeFromBars(bars) {
  if (!bars || !bars.length) return null;
  const first = _tradeDiagTimeMs(bars[0].t);
  const last = _tradeDiagTimeMs(bars[bars.length - 1].t);
  return !isNaN(first) && !isNaN(last) ? { first, last } : null;
}

function _tradeDiagDataRange() {
  if (!NEW_DATA || !NEW_DATA.length) return null;
  const first = _tradeDiagTimeMs(_fmtBarDate(NEW_DATA[0]));
  const last = _tradeDiagTimeMs(_fmtBarDate(NEW_DATA[NEW_DATA.length - 1]));
  return !isNaN(first) && !isNaN(last) ? { first, last } : null;
}

function _tradeDiagFmtMs(ms) {
  if (ms == null || isNaN(ms)) return '?';
  return new Date(ms).toISOString().substring(0, 16).replace('T', ' ');
}

function _tradeInRange(trade, range) {
  if (!range) return true;
  const ms = _tradeDiagTimeMs(trade.entryDateStr);
  return !isNaN(ms) && ms >= range.start && ms <= range.end;
}

function _computeTradeOverlap(optTrades, tvTrades) {
  const jsRange = _tradeDiagDataRange() || _tradeDiagRangeFromTrades(optTrades);
  const tvRange = _tradeDiagRangeFromBars(tvTrades && tvTrades._sourceBars) || _tradeDiagRangeFromTrades(tvTrades);
  if (!jsRange || !tvRange) return null;
  const start = Math.max(jsRange.first, tvRange.first);
  const end = Math.min(jsRange.last, tvRange.last);
  if (!(start <= end)) return { jsRange, tvRange, start, end, empty: true };
  const optIn = (optTrades || []).filter(t => _tradeInRange(t, { start, end }));
  const tvIn = (tvTrades || []).filter(t => _tradeInRange(t, { start, end }));
  return {
    jsRange, tvRange, start, end,
    optIn, tvIn,
    optSkippedBefore: (optTrades || []).filter(t => _tradeDiagTimeMs(t.entryDateStr) < start).length,
    optSkippedAfter: (optTrades || []).filter(t => _tradeDiagTimeMs(t.entryDateStr) > end).length,
    tvSkippedBefore: (tvTrades || []).filter(t => _tradeDiagTimeMs(t.entryDateStr) < start).length,
    tvSkippedAfter: (tvTrades || []).filter(t => _tradeDiagTimeMs(t.entryDateStr) > end).length,
  };
}

function _plainDiagObject(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v == null) continue;
    if (typeof v === 'boolean' || typeof v === 'number' || typeof v === 'string') out[k] = v;
    else if (Array.isArray(v)) out[k] = v.slice(0, 100);
    else if (typeof v === 'object' &&
             !(v instanceof Float64Array) && !(v instanceof Uint8Array) &&
             !(v instanceof Int8Array) && !(v instanceof Int32Array)) out[k] = v;
  }
  return out;
}

function _findNewDataBarByTime(timeStr) {
  if (!NEW_DATA || !timeStr) return -1;
  const needle = _normTime(timeStr);
  for (let i = 0; i < NEW_DATA.length; i++) {
    if (_fmtBarDate(NEW_DATA[i]) === needle) return i;
  }
  return -1;
}

function _parseListOfTrades(csvText) {
  const lines = csvText.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return null;
  const sep = lines[0].includes('\t') ? '\t' : ',';
  const hdrs = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());

  const colIdx = name => hdrs.findIndex(h => h.includes(name));
  const typeIdx  = colIdx('type');
  const signIdx  = colIdx('signal');
  const dateIdx  = colIdx('date') >= 0 ? colIdx('date') : colIdx('time');
  const priceIdx = colIdx('price');
  const profIdx  = hdrs.findIndex(h => h.startsWith('profit'));
  const numIdx   = hdrs.findIndex(h => h.includes('#') || h === 'trade');

  const getCol = (cols, idx) => idx >= 0 && cols[idx] != null ? cols[idx].trim().replace(/^"|"$/g, '') : '';

  const trades = [];
  let pending = null;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep);
    const type = getCol(cols, typeIdx).toLowerCase();
    const sig  = getCol(cols, signIdx);
    const date = _normTime(getCol(cols, dateIdx));
    const price = parseFloat(getCol(cols, priceIdx));
    const numRaw = getCol(cols, numIdx);

    if (type.includes('entry')) {
      pending = {
        num: parseInt(numRaw) || (trades.length + 1),
        dir: type.includes('long') ? 1 : -1,
        entryDateStr: date,
        entryPrice: isNaN(price) ? null : price,
        exitDateStr: null,
        exitPrice: null,
        pnlPct: null,
        exitReason: null,
      };
    } else if (type.includes('exit') && pending) {
      pending.exitDateStr = date;
      pending.exitPrice = isNaN(price) ? null : price;
      const pnlRaw = getCol(cols, profIdx).replace('%', '').replace(',', '.');
      pending.pnlPct = parseFloat(pnlRaw);
      if (isNaN(pending.pnlPct)) pending.pnlPct = null;
      pending.exitReason = sig || '?';
      trades.push(pending);
      pending = null;
    }
  }
  if (trades.length) trades._sourceFormat = 'list-of-trades';
  return trades.length ? trades : null;
}

// Парсит стандартный экспорт индикатора USE (time,open,high,low,close,...,EL,ES,XL,XS,...)
// Реконструирует сделки из сигнальных колонок EL/ES/XL/XS
function _parseIndicatorExport(csvText) {
  const lines = csvText.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return null;
  const sep = lines[0].includes('\t') ? '\t' : ',';
  const hdrs = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());

  const eqIdx = hdrs.findIndex(h => h.includes('equity'));
  if (eqIdx < 0) return null; // не тот формат

  const tIdx  = hdrs.findIndex(h => h === 'time' || h.includes('time'));
  const cIdx  = hdrs.findIndex(h => h === 'close');
  const elIdx = hdrs.indexOf('el');
  const esIdx = hdrs.indexOf('es');
  const xlIdx = hdrs.indexOf('xl');
  const xsIdx = hdrs.indexOf('xs');

  if (elIdx < 0 && esIdx < 0) return null; // нет сигналов входа

  const getF = (cols, idx) => idx >= 0 && cols[idx] != null ? parseFloat(cols[idx].trim().replace(/^"|"$/g, '')) : NaN;
  const getT = (cols) => tIdx >= 0 && cols[tIdx] != null ? _normTime(cols[tIdx].trim().replace(/^"|"$/g, '')) : null;

  const bars = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep);
    const t = getT(cols);
    if (!t) continue;
    const c = getF(cols, cIdx);
    bars.push({
      t,
      c: isNaN(c) ? null : c,
      el: elIdx >= 0 && getF(cols, elIdx) > 0,
      es: esIdx >= 0 && getF(cols, esIdx) > 0,
      xl: xlIdx >= 0 && getF(cols, xlIdx) > 0,
      xs: xsIdx >= 0 && getF(cols, xsIdx) > 0,
    });
  }
  if (!bars.length) return null;

  // Реконструируем сделки из сигналов
  const trades = [];
  let inTrade = false, dir = 0, entryIdx = -1;

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    if (!inTrade) {
      if (b.el) { inTrade = true; dir = 1;  entryIdx = i; }
      else if (b.es) { inTrade = true; dir = -1; entryIdx = i; }
    } else {
      const exitSignal = (dir === 1 && b.xl) || (dir === -1 && b.xs);
      const revSignal  = (dir === 1 && b.es) || (dir === -1 && b.el);
      if (exitSignal || revSignal) {
        const eb = bars[entryIdx];
        const ep = eb.c, xp = b.c;
        const pnlPct = ep && xp ? (xp - ep) / ep * dir * 100 : null;
        trades.push({
          num: trades.length + 1,
          dir,
          entryDateStr: eb.t,
          entryPrice: ep,
          exitDateStr: b.t,
          exitPrice: xp,
          pnlPct,
          exitReason: revSignal ? 'Rev' : 'Signal',
        });
        if (revSignal) {
          dir = -dir; entryIdx = i; // разворот — сразу открываем противоположную
        } else {
          inTrade = false; dir = 0; entryIdx = -1;
        }
      }
    }
  }
  if (trades.length) {
    trades._sourceFormat = 'indicator-export';
    trades._sourceBars = bars;
  }
  return trades.length ? trades : null;
}

function _rerunWithTradeLog(cfg) {
  if (!NEW_DATA || NEW_DATA.length < 10) return null;
  const origDATA = DATA;
  try {
    DATA = NEW_DATA;
    const ind   = _calcIndicators(cfg);
    const btCfg = buildBtCfg(cfg, ind);
    btCfg.tradeLog = [];
    backtest(ind.pvLo, ind.pvHi, ind.atrArr, btCfg);
    return btCfg.tradeLog.map(t => ({
      dir:          t.dir,
      entryBar:     t.entryBar,
      entryDateStr: _fmtBarDate(NEW_DATA[t.entryBar]),
      entryPrice:   t.entry,
      exitBar:      t.exitBar,
      exitDateStr:  t.exitBar != null ? _fmtBarDate(NEW_DATA[t.exitBar]) : null,
      exitPrice:    t.exit,
      pnlPct:       t.pnl,
    }));
  } catch(e) {
    return null;
  } finally {
    DATA = origDATA;
  }
}

function _matchTrades(optTrades, tvTrades, meta = {}) {
  // Вычисляем интервал бара (мс) для нечёткого матчинга по дате
  let barIntervalMs = 24 * 3600 * 1000;
  if (NEW_DATA && NEW_DATA.length >= 2) {
    const t0 = parseInt(NEW_DATA[0].t), t1 = parseInt(NEW_DATA[1].t);
    if (t0 && t1) {
      const factor = String(t0).length <= 10 ? 1000 : 1;
      barIntervalMs = Math.abs(t1 - t0) * factor;
    }
  }

  const issues = [];
  const usedTV = new Set();

  for (let i = 0; i < optTrades.length; i++) {
    const opt = optTrades[i];
    let tvMatch = null, tvMatchIdx = -1;

    // Точное совпадение: направление + дата
    for (let j = 0; j < tvTrades.length; j++) {
      if (usedTV.has(j)) continue;
      const tv = tvTrades[j];
      if (tv.dir === opt.dir && tv.entryDateStr === opt.entryDateStr) {
        tvMatch = tv; tvMatchIdx = j; break;
      }
    }
    // Нечёткое совпадение: ±2 бара по времени
    if (!tvMatch) {
      const optMs = new Date(opt.entryDateStr).getTime();
      if (!isNaN(optMs)) {
        for (let j = 0; j < tvTrades.length; j++) {
          if (usedTV.has(j)) continue;
          const tv = tvTrades[j];
          if (tv.dir !== opt.dir) continue;
          const tvMs = new Date(tv.entryDateStr).getTime();
          if (!isNaN(tvMs) && Math.abs(optMs - tvMs) <= barIntervalMs * 2) {
            tvMatch = tv; tvMatchIdx = j; break;
          }
        }
      }
    }

    if (!tvMatch) {
      issues.push({ num: i + 1, opt, tv: null, types: ['MISSING_TV'] });
      continue;
    }
    usedTV.add(tvMatchIdx);

    const types = [];

    if (tvMatch.entryDateStr !== opt.entryDateStr) types.push('ENTRY_TIMING');

    if (opt.entryPrice != null && tvMatch.entryPrice != null) {
      const diff = Math.abs(opt.entryPrice - tvMatch.entryPrice) / opt.entryPrice * 100;
      if (diff > 0.01) types.push('ENTRY_PRICE');
    }

    if (opt.pnlPct != null && tvMatch.pnlPct != null) {
      const optWin = opt.pnlPct >= 0, tvWin = tvMatch.pnlPct >= 0;
      if (optWin !== tvWin) {
        types.push('EXIT_TYPE');
        if (!optWin && tvWin) types.push('INTRABAR_SL');
      } else if (opt.exitPrice != null && tvMatch.exitPrice != null) {
        const diff = Math.abs(opt.exitPrice - tvMatch.exitPrice) / Math.abs(opt.exitPrice) * 100;
        if (diff > 0.01) types.push('EXIT_PRICE');
      }
    }

    if (types.length > 0) issues.push({ num: i + 1, opt, tv: tvMatch, types });
  }

  // TV сделки без пары
  for (let j = 0; j < tvTrades.length; j++) {
    if (!usedTV.has(j)) {
      issues.push({ num: -1, opt: null, tv: tvTrades[j], types: ['MISSING_OPT'] });
    }
  }

  return { issues, totalOpt: optTrades.length, totalTV: tvTrades.length, meta };
}

function _getBarsContext(barIdx, count, markLabel) {
  if (!NEW_DATA || barIdx == null) return '';
  const start = Math.max(0, barIdx - 1);
  const end   = Math.min(NEW_DATA.length - 1, barIdx + count);
  let s = '';
  for (let i = start; i <= end; i++) {
    const b = NEW_DATA[i];
    const mark = i === barIdx ? ` ← ${markLabel || 'бар'}` : (i === barIdx - 1 ? ' ← предыдущий бар' : '');
    s += `  ${_fmtBarDate(b)}: O=${b.o?.toFixed(4)} H=${b.h?.toFixed(4)} L=${b.l?.toFixed(4)} C=${b.c?.toFixed(4)}${mark}\n`;
  }
  return s;
}

function _buildTradeDiagPayload(r, optTrades, tvTrades, matchResult) {
  const meta = matchResult?.meta || {};
  const payload = {
    app: 'USE Optimizer v6',
    reportKind: 'trade-comparison-diagnostic',
    generatedAt: new Date().toISOString(),
    result: {
      name: r?.name || '',
      pnl: r?.pnl ?? null,
      wr: r?.wr ?? null,
      n: r?.n ?? null,
      dd: r?.dd ?? null,
      pdd: r?.pdd ?? null,
      avg: r?.avg ?? null,
    },
    data: {
      optimizerBars: NEW_DATA?.length || 0,
      optimizerFirst: NEW_DATA?.length ? _fmtBarDate(NEW_DATA[0]) : null,
      optimizerLast: NEW_DATA?.length ? _fmtBarDate(NEW_DATA[NEW_DATA.length - 1]) : null,
      tvFormat: meta.csvFormat || tvTrades?._sourceFormat || null,
      tvBars: tvTrades?._sourceBars?.length || null,
      tvFirst: tvTrades?._sourceBars?.length ? tvTrades._sourceBars[0].t : null,
      tvLast: tvTrades?._sourceBars?.length ? tvTrades._sourceBars[tvTrades._sourceBars.length - 1].t : null,
      overlapStart: meta.overlap && !meta.overlap.empty ? _tradeDiagFmtMs(meta.overlap.start) : null,
      overlapEnd: meta.overlap && !meta.overlap.empty ? _tradeDiagFmtMs(meta.overlap.end) : null,
    },
    counts: {
      optimizerTradesCompared: matchResult?.totalOpt ?? null,
      tvTradesCompared: matchResult?.totalTV ?? null,
      issues: matchResult?.issues?.length ?? null,
      optimizerTradesOriginal: meta.originalOptCount ?? null,
      tvTradesOriginal: meta.originalTVCount ?? null,
      skippedOutsideOverlap: meta.overlap ? {
        optBefore: meta.overlap.optSkippedBefore || 0,
        optAfter: meta.overlap.optSkippedAfter || 0,
        tvBefore: meta.overlap.tvSkippedBefore || 0,
        tvAfter: meta.overlap.tvSkippedAfter || 0,
      } : null,
    },
    config: _plainDiagObject(r?.cfg || {}),
    firstOptTrades: (optTrades || []).slice(0, 12),
    firstTVTrades: (tvTrades || []).slice(0, 12),
  };
  return `\n### Полный диагностический пакет\nСкопируй весь отчет целиком: ниже уже есть конфигурация, диапазоны данных и первые сделки.\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n`;
}

function _generateTradeCompReport(r, optTrades, tvTrades, matchResult) {
  const { issues, totalOpt, totalTV, meta = {} } = matchResult;

  const typeCounts = {};
  for (const iss of issues) {
    for (const t of iss.types) typeCounts[t] = (typeCounts[t] || 0) + 1;
  }

  const typeDesc = {
    ENTRY_TIMING: 'Разный бар входа',
    ENTRY_PRICE:  'Разная цена входа при одинаковом баре',
    EXIT_TYPE:    'Противоположный исход (прибыль vs убыток)',
    EXIT_PRICE:   'Разная цена выхода',
    INTRABAR_SL:  'Разный intrabar/уровневый выход',
    MISSING_TV:   'Есть в оптимизаторе, нет в индикаторном экспорте TV на общем участке',
    MISSING_OPT:  'Есть в индикаторном экспорте TV, нет в оптимизаторе на общем участке',
    DIR_MISMATCH: 'Разное направление (Long vs Short)',
  };

  const c = r.cfg;
  const cfgParts = [];
  if (c.hasSLA || c.hasSLB) cfgParts.push(`SL: ${c.hasSLA ? 'ATR×' + c.slMult : ''}${c.hasSLB ? ' | PCT ' + c.slPctMult + '%' : ''}`.trim());
  if (c.hasTPA || c.hasTPB) cfgParts.push(`TP: ${c.hasTPA ? 'ATR×' + c.tpMult : ''}${c.hasTPB ? ' | PCT ' + c.tpPctMult + '%' : ''}`.trim());
  if (c.maLen)    cfgParts.push(`MA: ${c.maType || 'EMA'} ${c.maLen}`);
  if (c.direction) cfgParts.push(`Dir: ${c.direction}`);
  if (c.useRev)   cfgParts.push(`Rev: каждые ${c.revBars} баров`);

  const period = NEW_DATA && NEW_DATA.length
    ? `${_fmtBarDate(NEW_DATA[0])} — ${_fmtBarDate(NEW_DATA[NEW_DATA.length - 1])} (${NEW_DATA.length} баров)`
    : '?';

  const diverged = issues.filter(x => !x.types.includes('MISSING_TV') && !x.types.includes('MISSING_OPT')).length;
  const missingTV  = typeCounts['MISSING_TV']  || 0;
  const missingOpt = typeCounts['MISSING_OPT'] || 0;
  const perfect = totalOpt - diverged - missingTV;

  let rep = `## Trade Comparison: ${r.name}\n\n`;
  rep += `### Режим диагностики\n`;
  rep += `Источник TV: ${meta.csvFormat || tvTrades._sourceFormat || 'unknown'}; сравнение идет только по общему участку времени.\n`;
  if (meta.overlap && !meta.overlap.empty) {
    const o = meta.overlap;
    rep += `Общий участок: ${_tradeDiagFmtMs(o.start)} — ${_tradeDiagFmtMs(o.end)}\n`;
    rep += `Диапазон оптимизатора: ${_tradeDiagFmtMs(o.jsRange.first)} — ${_tradeDiagFmtMs(o.jsRange.last)}\n`;
    rep += `Диапазон TV CSV: ${_tradeDiagFmtMs(o.tvRange.first)} — ${_tradeDiagFmtMs(o.tvRange.last)}\n`;
    rep += `Вне общего участка отброшено: OPT до=${o.optSkippedBefore}, после=${o.optSkippedAfter}; TV до=${o.tvSkippedBefore}, после=${o.tvSkippedAfter}\n`;
  } else if (meta.overlap && meta.overlap.empty) {
    rep += `Общий участок не найден: диапазоны данных не пересекаются.\n`;
  }
  rep += `Важно: диагностика использует индикаторные EL/ES/XL/XS-сигналы, без предположений про strategy.close/strategy.exit.\n\n`;
  rep += `### Конфигурация\n${cfgParts.join(' | ') || '(нет данных)'}\n\n`;
  rep += `### Период B\n${period}\n\n`;
  rep += `### Сводка\n`;
  rep += `Оптимизатор: ${totalOpt} сделок | TradingView: ${totalTV} сделок\n`;
  rep += `Совпадают полностью: ${perfect}`;
  if (diverged)    rep += ` | Расходятся: ${diverged}`;
  if (missingTV)   rep += ` | Только в оптимизаторе: ${missingTV}`;
  if (missingOpt)  rep += ` | Только в TV: ${missingOpt}`;
  rep += '\n\n';

  if (!Object.keys(typeCounts).length) {
    rep += `### ✅ Расхождений не найдено\nВсе ${totalOpt} сделок оптимизатора совпадают с TradingView.\n`;
    rep += _buildTradeDiagPayload(r, optTrades, tvTrades, matchResult);
    return rep;
  }

  rep += `### Найденные причины расхождений\n`;
  for (const [type, count] of Object.entries(typeCounts)) {
    rep += `  ${type.padEnd(14)} — ${count} сд.  (${typeDesc[type] || ''})\n`;
  }
  rep += '\n';

  rep += `### Детали расхождений\n\n`;
  for (const iss of issues) {
    const { num, opt, tv, types } = iss;
    rep += `#### Сделка #${num} [${types.join(' + ')}]\n`;

    if (opt) {
      const d = opt.dir === 1 ? 'LONG' : 'SHORT';
      const ep = opt.entryPrice != null ? opt.entryPrice.toFixed(4) : '?';
      const xp = opt.exitPrice  != null ? opt.exitPrice.toFixed(4)  : '?';
      const pnl = opt.pnlPct != null ? (opt.pnlPct >= 0 ? '+' : '') + opt.pnlPct.toFixed(2) + '%' : '?';
      rep += `Оптимизатор: ${d} вход ${opt.entryDateStr} @ ${ep} → выход ${opt.exitDateStr} @ ${xp} (${pnl})\n`;
    } else {
      rep += `Оптимизатор: — (сделки нет)\n`;
    }

    if (tv) {
      const d = tv.dir === 1 ? 'LONG' : 'SHORT';
      const ep = tv.entryPrice != null ? tv.entryPrice.toFixed(4) : '?';
      const xp = tv.exitPrice  != null ? tv.exitPrice.toFixed(4)  : '?';
      const pnl = tv.pnlPct != null ? (tv.pnlPct >= 0 ? '+' : '') + tv.pnlPct.toFixed(2) + '%' : '?';
      rep += `TradingView:  ${d} вход ${tv.entryDateStr} @ ${ep} → выход ${tv.exitDateStr} @ ${xp} (${pnl}) [${tv.exitReason}]\n`;
    } else {
      rep += `TradingView:  — (сделки нет)\n`;
    }

    if (opt && opt.entryBar != null) {
      rep += `\nБары NEW_DATA вокруг входа оптимизатора:\n`;
      rep += _getBarsContext(opt.entryBar, 2, 'вход opt');
    }

    if (opt && opt.exitBar != null) {
      rep += `\nБары NEW_DATA вокруг выхода оптимизатора:\n`;
      rep += _getBarsContext(opt.exitBar, 2, 'выход opt');
    } else if (tv && tv.exitDateStr) {
      const tvExitBar = _findNewDataBarByTime(tv.exitDateStr);
      if (tvExitBar >= 0) {
        rep += `\nБары NEW_DATA вокруг выхода TV:\n`;
        rep += _getBarsContext(tvExitBar, 2, 'выход TV');
      }
    }

    if (types.includes('ENTRY_TIMING')) {
      rep += `\n→ Оптимизатор входит на CLOSE бара ${opt.entryDateStr}\n`;
      rep += `→ TradingView входит на OPEN бара ${tv?.entryDateStr} (следующий)\n`;
      rep += `→ Разница цен: ${opt.entryPrice != null && tv?.entryPrice != null ? (tv.entryPrice - opt.entryPrice > 0 ? '+' : '') + (tv.entryPrice - opt.entryPrice).toFixed(4) : '?'}\n`;
    }
    if (types.includes('INTRABAR_SL') && opt && opt.entryBar != null && NEW_DATA) {
      const nextBar = NEW_DATA[opt.entryBar + 1];
      if (nextBar) {
        rep += `\n→ Intrabar SL: Low следующего бара = ${nextBar.l?.toFixed(4)}\n`;
        rep += `→ Оптимизатор закрывается только по CLOSE, не проверяет Low внутри бара\n`;
      }
    }
    rep += '\n';
  }

  rep += _buildTradeDiagPayload(r, optTrades, tvTrades, matchResult);
  return rep;
}

function showOOSTradeDiag(oosIdx) {
  const existing = document.getElementById('oos-trade-diag-modal');
  if (existing) existing.remove();

  const r = _oosTableResults[oosIdx];
  if (!r || !r.cfg) return;

  const modal = document.createElement('div');
  modal.id = 'oos-trade-diag-modal';
  modal.className = 'tpl-overlay open';
  modal.style.zIndex = '9999';
  modal.onclick = e => { if (e.target === modal) modal.remove(); };

  const content = document.createElement('div');
  content.className = 'tpl-content';
  content.style.cssText = 'max-width:860px;width:95vw;max-height:88vh;overflow-y:auto';

  content.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <b>🔬 Диагностика расхождений: ${r.name}</b>
      <button class="tpl-btn2" style="padding:2px 10px" onclick="document.getElementById('oos-trade-diag-modal').remove()">✕</button>
    </div>
    <div style="font-size:.8em;color:var(--text3);margin-bottom:10px;line-height:1.5">
      Загрузи CSV из индикатора USE с колонками <b>EL/ES/XL/XS</b>.<br>
      Если попадется старый List of Trades, он тоже прочитается, но полная диагностика лучше по индикаторному CSV.
    </div>
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
      <input type="file" id="oos-diag-file" accept=".csv,.tsv" style="display:none"
             onchange="runOOSTradeDiag(${oosIdx}, event)">
      <button class="tpl-btn2" style="padding:5px 14px"
              onclick="document.getElementById('oos-diag-file').click()">
        📂 Загрузить TV CSV
      </button>
      <span id="oos-diag-status" style="font-size:.8em;color:var(--text3)">файл не загружен</span>
    </div>
    <div id="oos-diag-report" style="display:none">
      <textarea id="oos-diag-text" readonly
        style="width:100%;height:420px;background:var(--bg2);color:var(--text);
               border:1px solid var(--border);border-radius:4px;padding:10px;
               font-size:.75em;font-family:monospace;resize:vertical;box-sizing:border-box">
      </textarea>
      <div style="margin-top:8px;display:flex;gap:8px">
        <button class="tpl-btn2" style="padding:6px 18px;border-color:#4ade80;color:#4ade80"
                onclick="navigator.clipboard.writeText(document.getElementById('oos-diag-text').value)
                  .then(()=>{this.textContent='✅ Скопировано!';setTimeout(()=>this.textContent='📋 Скопировать полный пакет',2000)})">
          📋 Скопировать полный пакет
        </button>
      </div>
    </div>
  `;

  modal.appendChild(content);
  document.body.appendChild(modal);
}

function runOOSTradeDiag(oosIdx, event) {
  const file = event.target.files[0];
  if (!file) return;

  const statusEl  = document.getElementById('oos-diag-status');
  const reportEl  = document.getElementById('oos-diag-report');
  const textEl    = document.getElementById('oos-diag-text');
  if (statusEl) statusEl.textContent = '⏳ Анализируем...';

  const r = _oosTableResults[oosIdx];
  if (!r || !r.cfg) return;

  const reader = new FileReader();
  reader.onload = e => {
    const csvText = e.target.result;
    // Автодетекция формата: List of Trades или экспорт индикатора (EL/ES/XL/XS)
    let tvTrades = _parseListOfTrades(csvText);
    let csvFormat = 'list-of-trades';
    if (!tvTrades || !tvTrades.length) {
      tvTrades = _parseIndicatorExport(csvText);
      csvFormat = 'indicator-export';
    }
    if (!tvTrades || !tvTrades.length) {
      if (statusEl) statusEl.textContent = '❌ Не удалось прочитать CSV. Нужен: List of Trades или экспорт индикатора USE с колонками EL/ES/XL/XS';
      return;
    }

    const optTrades = _rerunWithTradeLog(r.cfg);
    if (!optTrades) {
      if (statusEl) statusEl.textContent = '❌ Ошибка бэктеста на NEW_DATA — данные периода Б загружены?';
      return;
    }

    const overlap = _computeTradeOverlap(optTrades, tvTrades);
    let optForCompare = optTrades;
    let tvForCompare = tvTrades;
    if (overlap && !overlap.empty) {
      optForCompare = overlap.optIn;
      tvForCompare = overlap.tvIn;
      tvForCompare._sourceFormat = tvTrades._sourceFormat;
      tvForCompare._sourceBars = tvTrades._sourceBars;
    }

    const matchResult = _matchTrades(optForCompare, tvForCompare, {
      csvFormat,
      overlap,
      originalOptCount: optTrades.length,
      originalTVCount: tvTrades.length,
    });
    const report      = _generateTradeCompReport(r, optForCompare, tvForCompare, matchResult);

    const divCount = matchResult.issues.filter(x => !x.types.includes('MISSING_TV') && !x.types.includes('MISSING_OPT')).length;
    const fmtLabel = csvFormat === 'indicator-export' ? ' [формат: индикатор EL/ES/XL/XS]' : ' [формат: List of Trades]';
    if (statusEl) statusEl.textContent =
      `✅ TV: ${tvForCompare.length}/${tvTrades.length} сд. | Опт: ${optForCompare.length}/${optTrades.length} сд. | Расхождений: ${matchResult.issues.length} (${divCount} с парой)${fmtLabel}`;
    if (textEl)   textEl.value = report;
    if (reportEl) reportEl.style.display = 'block';
  };
  reader.readAsText(file);
}
