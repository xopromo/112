// ============================================================
// TEXT PARSER
// ============================================================
function openParseModal() {
  $('parse-preview').innerHTML = '';
  $('parse-overlay').classList.add('open');
}
function closeParseModal() { $('parse-overlay').classList.remove('open'); }

function parseTextToSettings(text) {
  // ── РЕЖИМ -2: JSON блок из комментариев Pine скрипта (// ... JSON ... //) ──
  // Ищем блок --- CFG JSON --- в комментариях: каждая строка начинается с //
  const _pineCommentMatch = text.match(/\/\/\s*---\s*CFG JSON\s*---[\s\S]*?\/\/\s*---\s*\/CFG JSON\s*---/);
  if (_pineCommentMatch) {
    const commentBlock = _pineCommentMatch[0];
    const jsonLines = commentBlock.split('\n')
      .filter(line => line.trim().startsWith('//'))
      .map(line => line.replace(/^\s*\/\/\s?/, ''))
      .join('\n');
    const cleanJson = jsonLines
      .replace(/^---\s*CFG JSON\s*---/, '')
      .replace(/---\s*\/CFG JSON\s*---$/, '')
      .trim();
    try {
      const j = JSON.parse(cleanJson);
      if (j && typeof j === 'object') {
        const ch = [];
        // Парсим параметры выходов (useTrail, useBE, useAdaptiveTP/SL, usePartial, и т.д.)
        if (j.useTrail !== undefined) ch.push({ id: 'x_tr', value: j.useTrail, type: 'chk', label: `Trailing: ${j.useTrail?'✅':'❌'}` });
        if (j.trTrig !== undefined) ch.push({ id: 'x_trt', value: String(j.trTrig), type: 'val', label: `Trail Trig=${j.trTrig}` });
        if (j.trDist !== undefined) ch.push({ id: 'x_trd', value: String(j.trDist), type: 'val', label: `Trail Dist=${j.trDist}` });
        if (j.useBE !== undefined) ch.push({ id: 'x_be', value: j.useBE, type: 'chk', label: `BE: ${j.useBE?'✅':'❌'}` });
        if (j.beTrig !== undefined) ch.push({ id: 'x_bet', value: String(j.beTrig), type: 'val', label: `BE Trig=${j.beTrig}` });
        if (j.beOff !== undefined) ch.push({ id: 'x_beo', value: String(j.beOff), type: 'val', label: `BE Off=${j.beOff}` });
        if (j.useAdaptiveTP !== undefined) ch.push({ id: 'x_adaptive_tp', value: j.useAdaptiveTP, type: 'chk', label: `Adaptive TP: ${j.useAdaptiveTP?'✅':'❌'}` });
        if (j.tpAtrLen !== undefined) ch.push({ id: 'x_tp_atr_len', value: String(j.tpAtrLen), type: 'val', label: `TP ATR Len=${j.tpAtrLen}` });
        if (j.tpAtrMult !== undefined) ch.push({ id: 'x_tp_atr_mult', value: String(j.tpAtrMult), type: 'val', label: `TP ATR Mult=${j.tpAtrMult}` });
        if (j.useAdaptiveSL !== undefined) ch.push({ id: 'x_adaptive_sl', value: j.useAdaptiveSL, type: 'chk', label: `Adaptive SL: ${j.useAdaptiveSL?'✅':'❌'}` });
        if (j.slAtrLen !== undefined) ch.push({ id: 'x_sl_atr_len', value: String(j.slAtrLen), type: 'val', label: `SL ATR Len=${j.slAtrLen}` });
        if (j.slAtrMult !== undefined) ch.push({ id: 'x_sl_atr_mult', value: String(j.slAtrMult), type: 'val', label: `SL ATR Mult=${j.slAtrMult}` });
        if (j.useWickTrail !== undefined) ch.push({ id: 'x_wt', value: j.useWickTrail, type: 'chk', label: `Wick Trail: ${j.useWickTrail?'✅':'❌'}` });
        if (j.wickOffType !== undefined) document.getElementById('x_wt_type').value = j.wickOffType;
        if (j.wickMult !== undefined) ch.push({ id: 'x_wt_mult', value: String(j.wickMult), type: 'val', label: `Wick Mult=${j.wickMult}` });
        if (j.useDynSLStruct !== undefined) ch.push({ id: 'x_dynsl', value: j.useDynSLStruct, type: 'chk', label: `Dynamic SL: ${j.useDynSLStruct?'✅':'❌'}` });
        if (j.dynSLStructMult !== undefined) ch.push({ id: 'x_dynsl_m', value: String(j.dynSLStructMult), type: 'val', label: `Dyn SL Mult=${j.dynSLStructMult}` });
        if (j.usePartial !== undefined) ch.push({ id: 'x_part', value: j.usePartial, type: 'chk', label: `Partial TP: ${j.usePartial?'✅':'❌'}` });
        if (j.partRR !== undefined) ch.push({ id: 'x_partr', value: String(j.partRR), type: 'val', label: `Part R:R=${j.partRR}` });
        if (j.partPct !== undefined) ch.push({ id: 'x_partp', value: String(j.partPct), type: 'val', label: `Part %=${j.partPct}` });
        if (j.partBE !== undefined) ch.push({ id: 'x_partbe', value: j.partBE, type: 'chk', label: `Part BE: ${j.partBE?'✅':'❌'}` });
        if (j.useRev !== undefined) ch.push({ id: 'x_rev', value: j.useRev, type: 'chk', label: `Rev Signal: ${j.useRev?'✅':'❌'}` });
        if (j.revMode !== undefined) ch.push({ id: '_xm_rev', value: j.revMode, type: 'xmode', xmodeType: 'rev', label: `revMode=${j.revMode}` });
        if (j.revSkip !== undefined) ch.push({ id: 'x_revskip', value: String(j.revSkip), type: 'val', label: `Rev Skip=${j.revSkip}` });
        if (j.revCooldown !== undefined) ch.push({ id: 'x_revcd', value: String(j.revCooldown), type: 'val', label: `Rev Cooldown=${j.revCooldown}` });
        if (j.useTime !== undefined) ch.push({ id: 'x_time', value: j.useTime, type: 'chk', label: `Time Exit: ${j.useTime?'✅':'❌'}` });
        if (j.timeBars !== undefined) ch.push({ id: 'x_timeb', value: String(j.timeBars), type: 'val', label: `Time Bars=${j.timeBars}` });
        if (j.clxMode !== undefined) ch.push({ id: '_xm_clx', value: j.clxMode, type: 'xmode', xmodeType: 'clx', label: `clxMode=${j.clxMode}` });
        if (ch.length) return ch;
      }
    } catch(e) { /* не JSON блок в комментариях, переходим к следующему режиму */ }
  }

  // ── РЕЖИМ -1: Comparator JSON формат ({apply:{...}, hints:[...], meta:{...}}) ──
  try {
    const _cmpJson = JSON.parse(text.trim());
    if (_cmpJson && _cmpJson.apply && typeof _cmpJson.apply === 'object') {
      const ch = [];
      Object.entries(_cmpJson.apply).forEach(([id, val]) => {
        const type  = typeof val === 'boolean' ? 'chk' : 'val';
        const value = typeof val === 'boolean' ? val : String(val);
        ch.push({ id, value, type, label: `${id}=${val}` });
      });
      if (ch.length) return ch;
    }
  } catch(e) { /* not comparator JSON, fall through */ }

  // ── РЕЖИМ 0: JSON блок (buildCopyText формат с CFG JSON) ────────────────
  // Если текст содержит --- CFG JSON --- блок — используем точное восстановление
  const _jsonBlockMatch = text.match(/---\s*CFG JSON\s*---\s*\n([\s\S]*?)\n---\s*\/CFG JSON\s*---/);
  if (_jsonBlockMatch) {
    try {
      const j = JSON.parse(_jsonBlockMatch[1]);
      const ch = [];
      const _s = (id, value, type, label) => ch.push({id, value, type, label});
      // 1. Все поля из CFG_HTML_MAP
      for (const [field, {id, type}] of Object.entries(CFG_HTML_MAP)) {
        if (j[field] !== undefined) {
          _s(id, type === 'val' ? String(j[field]) : j[field], type, `${field}=${j[field]}`);
        }
      }
      // 2. SL пара (slPair)
      const slPair = j.slPair || {};
      const slA = slPair.a, slP = slPair.p;
      const hasSlAtr = !!(slA && slA.type === 'atr');
      const hasSlPct = !!(slA && slA.type === 'pct') || !!(slP && slP.type === 'pct');
      _s('s_atr', hasSlAtr, 'chk', 'SL ATR: ' + (hasSlAtr ? 'ВКЛ' : 'ВЫКЛ'));
      if (hasSlAtr) _s('s_atrv', String(slA.m), 'val', `SL ATR=${slA.m}`);
      _s('s_pct', hasSlPct, 'chk', 'SL %: ' + (hasSlPct ? 'ВКЛ' : 'ВЫКЛ'));
      const _slPctSrc = (slA && slA.type === 'pct') ? slA : slP;
      if (hasSlPct && _slPctSrc) _s('s_pctv', String(_slPctSrc.m), 'val', `SL %=${_slPctSrc.m}`);
      if (j.slLogic) ch.push({id:'_slLogic', value:j.slLogic, type:'logic', label:`SL логика=${j.slLogic}`});
      // 3. TP пара (tpPair)
      const tpPair = j.tpPair || {};
      const tpA = tpPair.a, tpB = tpPair.b;
      const hasTpRR  = !!(tpA && tpA.type === 'rr')  || !!(tpB && tpB.type === 'rr');
      const hasTpAtr = !!(tpA && tpA.type === 'atr') || !!(tpB && tpB.type === 'atr');
      const hasTpPct = !!(tpA && tpA.type === 'pct') || !!(tpB && tpB.type === 'pct');
      _s('t_rr',  hasTpRR,  'chk', 'TP RR: '  + (hasTpRR  ? 'ВКЛ' : 'ВЫКЛ'));
      _s('t_atr', hasTpAtr, 'chk', 'TP ATR: ' + (hasTpAtr ? 'ВКЛ' : 'ВЫКЛ'));
      _s('t_pct', hasTpPct, 'chk', 'TP %: '   + (hasTpPct ? 'ВКЛ' : 'ВЫКЛ'));
      const _rrSrc  = (tpA && tpA.type==='rr')  ? tpA : tpB;
      const _atrSrc = (tpA && tpA.type==='atr') ? tpA : tpB;
      const _pctSrc = (tpA && tpA.type==='pct') ? tpA : tpB;
      if (hasTpRR  && _rrSrc)  _s('t_rrv',  String(_rrSrc.m),  'val', `TP RR=${_rrSrc.m}`);
      if (hasTpAtr && _atrSrc) _s('t_atrv', String(_atrSrc.m), 'val', `TP ATR=${_atrSrc.m}`);
      if (hasTpPct && _pctSrc) _s('t_pctv', String(_pctSrc.m), 'val', `TP %=${_pctSrc.m}`);
      if (j.tpLogic) ch.push({id:'_tpLogic', value:j.tpLogic, type:'logic', label:`TP логика=${j.tpLogic}`});
      // 4. xmode кнопки (revMode, revAct, revSrc, timeMode, clxMode)
      if (j.revMode)  ch.push({id:'_xm_rev',     value:j.revMode,  type:'xmode', xmodeType:'rev',    label:`revMode=${j.revMode}`});
      if (j.revAct)   ch.push({id:'_xm_revact',  value:j.revAct,   type:'xmode', xmodeType:'revact', label:`revAct=${j.revAct}`});
      if (j.revSrc)   ch.push({id:'_xm_revsrc',  value:j.revSrc,   type:'xmode', xmodeType:'revsrc', label:`revSrc=${j.revSrc}`});
      if (j.timeMode) ch.push({id:'_xm_time',    value:j.timeMode, type:'xmode', xmodeType:'time',   label:`timeMode=${j.timeMode}`});
      if (j.clxMode)  ch.push({id:'_xm_clx',     value:j.clxMode,  type:'xmode', xmodeType:'clx',    label:`clxMode=${j.clxMode}`});
      // 5. Комиссия (baseComm = per-leg, не умножаем)
      const _comm = j.baseComm !== undefined ? j.baseComm : j.commission;
      if (_comm !== undefined) _s('c_comm', String(_comm), 'val', `Комиссия=${_comm}`);
      if (j.spreadVal !== undefined) _s('c_spread', String(j.spreadVal), 'val', `Спред=${j.spreadVal}`);
      if (ch.length) return ch;
    } catch(e) { /* fall through to legacy parsing */ }
  }

  const changes = [];
  const lines = text.split('\n');

  // ── Хелперы ─────────────────────────────────────────────────
  // Ищем строку вида "Ключевая фраза: значение"
  function getVal(key) {
    for (const ln of lines) {
      const i = ln.indexOf(key);
      if (i === -1) continue;
      const after = ln.slice(i + key.length).replace(/^[\s:=]+/, '').trim();
      return after;
    }
    return null;
  }
  // Ищем число после ключевой фразы
  function getNum(key) {
    const v = getVal(key);
    if (!v) return null;
    const m = v.match(/^[\d.]+/);
    return m ? parseFloat(m[0]) : null;
  }
  // Ищем bool (ВКЛ/ВЫКЛ)
  function getOnOff(key) {
    const v = getVal(key);
    if (!v) return null;
    return v.startsWith('ВКЛ') ? true : v.startsWith('ВЫКЛ') ? false : null;
  }
  // Задаём значение
  const set = (id, value, type, label) => changes.push({id, value, type, label});

  const t = text.toLowerCase();

  // ── Определяем: это формат buildCopyText или свободный текст ──
  const isCopyFormat = text.includes('--- ПАТТЕРНЫ ВХОДА ---') || text.includes('--- СТОП-ЛОСС / ТЕЙК-ПРОФИТ ---');

  if (isCopyFormat) {
    // ════════════════════════════════════════════════════════════
    // РЕЖИМ 1: Парсинг формата buildCopyText (скопировано из карточки)
    // ════════════════════════════════════════════════════════════

    // --- Паттерны входа ---
    const parsePiv = getVal('Pivot Points:');
    if (parsePiv !== null) {
      const isOn = parsePiv.startsWith('ВКЛ');
      set('e_pv', isOn, 'chk', `Pivot: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) {
        const lm = parsePiv.match(/Left=(\d+)/); const rm = parsePiv.match(/Right=(\d+)/);
        if (lm) set('e_pvl', lm[1], 'val', `Pivot Left=${lm[1]}`);
        if (rm) set('e_pvr', rm[1], 'val', `Pivot Right=${rm[1]}`);
      }
    }
    const parseEng = getOnOff('Поглощение:');
    if (parseEng !== null) set('e_eng', parseEng, 'chk', `Поглощение: ${parseEng?'ВКЛ':'ВЫКЛ'}`);

    const parsePin = getVal('Pin Bar:');
    if (parsePin !== null) {
      const isOn = parsePin.startsWith('ВКЛ');
      set('e_pin', isOn, 'chk', `Pin Bar: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) { const m = parsePin.match(/([\d.]+)$/); if(m) set('e_pinr', m[1], 'val', `Pin ratio=${m[1]}`); }
    }
    const parseBB = getVal('Боллинджер пробой:');
    if (parseBB !== null) {
      const isOn = parseBB.startsWith('ВКЛ');
      set('e_bol', isOn, 'chk', `BB: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) {
        const pm = parseBB.match(/период=(\d+)/); const sm = parseBB.match(/sigma=([\d.]+)/);
        if (pm) set('e_bbl', pm[1], 'val', `BB период=${pm[1]}`);
        if (sm) set('e_bbm', sm[1], 'val', `BB sigma=${sm[1]}`);
      }
    }
    const parseDon = getVal('Дончиан пробой:');
    if (parseDon !== null) {
      const isOn = parseDon.startsWith('ВКЛ');
      set('e_don', isOn, 'chk', `Donchian: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) { const m = parseDon.match(/период=(\d+)/); if(m) set('e_donl', m[1], 'val', `Don период=${m[1]}`); }
    }
    const parseAtrBo = getVal('ATR-канал пробой:');
    if (parseAtrBo !== null) {
      const isOn = parseAtrBo.startsWith('ВКЛ');
      set('e_atrbo', isOn, 'chk', `ATR-канал: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) {
        const mm = parseAtrBo.match(/mult=([\d.]+)/);
        if (mm) set('e_atbm', mm[1], 'val', `ATR mult=${mm[1]}`);
      }
    }
    const parseMaT = getVal('Касание MA:');
    if (parseMaT !== null) {
      const isOn = parseMaT.startsWith('ВКЛ');
      set('e_mat', isOn, 'chk', `MA Touch: ${isOn?'ВКЛ':'ВЫКЛ'}`);
    }
    const parseSqz = getVal('Squeeze:');
    if (parseSqz !== null) {
      const isOn = parseSqz.startsWith('ВКЛ');
      set('e_sqz', isOn, 'chk', `Squeeze: ${isOn?'ВКЛ':'ВЫКЛ'}`);
    }

    // --- SL ---
    const parseSL = getVal('Stop Loss:');
    if (parseSL) {
      // ATR × N
      const atrM = parseSL.match(/ATR\s*[×x]\s*([\d.]+)/i);
      // N% от цены
      const pctM = parseSL.match(/([\d.]+)%\s*от/i);
      // Комбо: ATR ... OR/AND ... %
      const isCombo = (atrM && pctM);
      if (atrM) {
        set('s_atr', true, 'chk', 'SL ATR ВКЛ');
        set('s_atrv', atrM[1], 'val', `SL ATR=${atrM[1]}`);
      } else { set('s_atr', false, 'chk', 'SL ATR ВЫКЛ'); }
      if (pctM) {
        set('s_pct', true, 'chk', 'SL % ВКЛ');
        set('s_pctv', pctM[1], 'val', `SL %=${pctM[1]}`);
      } else { set('s_pct', false, 'chk', 'SL % ВЫКЛ'); }
      // логика
      const lgSL = parseSL.match(/\[(ИЛИ|И)\s/i);
      if (lgSL) { /* setLogic вызовем ниже */ changes.push({id:'_slLogic', value: lgSL[1]==='ИЛИ'?'or':'and', type:'logic', label:`SL логика=${lgSL[1]}`}); }
    }

    // --- TP ---
    const parseTP = getVal('Take Profit:');
    if (parseTP) {
      // Извлекаем все TP части (может быть комбо: "R:R = 2 OR ATR × 3")
      // Форматы: "R:R = N", "ATR × N", "N% от цены"
      const rrMatches   = [...parseTP.matchAll(/R:R\s*=\s*([\d.]+)/gi)];
      const atrMatches  = [...parseTP.matchAll(/ATR\s*[×x]\s*([\d.]+)/gi)];
      const pctMatches  = [...parseTP.matchAll(/([\d.]+)%\s*от/gi)];

      // Выключаем все TP типы сначала, потом включаем что нашли
      set('t_rr',  rrMatches.length  > 0, 'chk', `TP RR: ${rrMatches.length>0?'ВКЛ':'ВЫКЛ'}`);
      set('t_atr', atrMatches.length > 0, 'chk', `TP ATR: ${atrMatches.length>0?'ВКЛ':'ВЫКЛ'}`);
      set('t_pct', pctMatches.length > 0, 'chk', `TP %: ${pctMatches.length>0?'ВКЛ':'ВЫКЛ'}`);

      if (rrMatches.length > 0) {
        // Записываем все значения через запятую если их несколько
        const vals = rrMatches.map(m=>m[1]).join(',');
        set('t_rrv', vals, 'val', `TP RR значения=${vals}`);
      }
      if (atrMatches.length > 0) {
        const vals = atrMatches.map(m=>m[1]).join(',');
        set('t_atrv', vals, 'val', `TP ATR значения=${vals}`);
      }
      if (pctMatches.length > 0) {
        const vals = pctMatches.map(m=>m[1]).join(',');
        set('t_pctv', vals, 'val', `TP % значения=${vals}`);
      }
      const lgTP = parseTP.match(/\[(ИЛИ|И)\s/i);
      if (lgTP) changes.push({id:'_tpLogic', value: lgTP[1]==='ИЛИ'?'or':'and', type:'logic', label:`TP логика=${lgTP[1]}`});
    }

    // --- Выходы ---
    const parseBE = getVal('Безубыток:');
    if (parseBE !== null) {
      const isOn = parseBE.startsWith('ВКЛ');
      set('x_be', isOn, 'chk', `BE: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) {
        const tm=parseBE.match(/триггер=([\d.]+)/); const om=parseBE.match(/оффсет=([\d.]+)/);
        if(tm) set('x_bet', tm[1], 'val', `BE триггер=${tm[1]}`);
        if(om) set('x_beo', om[1], 'val', `BE оффсет=${om[1]}`);
      }
    }
    const parseTrail = getVal('Trailing Stop:');
    if (parseTrail !== null) {
      const isOn = parseTrail.startsWith('ВКЛ');
      set('x_tr', isOn, 'chk', `Trail: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) {
        const tm=parseTrail.match(/триггер=([\d.]+)/); const dm=parseTrail.match(/дист=([\d.]+)/);
        if(tm) set('x_trt', tm[1], 'val', `Trail триггер=${tm[1]}`);
        if(dm) set('x_trd', dm[1], 'val', `Trail дист=${dm[1]}`);
      }
    }
    const parseRev = getVal('Обратный сигнал:');
    if (parseRev !== null) {
      const isOn = parseRev.startsWith('ВКЛ');
      set('x_rev', isOn, 'chk', `RevSig: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) { const m=parseRev.match(/мин=([\d.]+)/); if(m) set('x_revb', m[1], 'val', `RevSig мин=${m[1]}`); }
    }
    const parseTime = getVal('Выход по времени:');
    if (parseTime !== null) {
      const isOn = parseTime.startsWith('ВКЛ');
      set('x_time', isOn, 'chk', `Time exit: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) { const m=parseTime.match(/макс=([\d.]+)/); if(m) set('x_timeb', m[1], 'val', `Time макс=${m[1]}`); }
    }
    const parsePart = getVal('Частичный TP1:');
    if (parsePart !== null) {
      const isOn = parsePart.startsWith('ВКЛ');
      set('x_part', isOn, 'chk', `Partial TP: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) {
        const rm=parsePart.match(/уровень=SL\s*x([\d.]+)/); const pm=parsePart.match(/закрыть\s*([\d.]+)%/);
        if(rm) set('x_partr', rm[1], 'val', `Partial RR=${rm[1]}`);
        if(pm) set('x_partp', pm[1], 'val', `Partial %=${pm[1]}`);
        set('x_partbe', parsePart.includes('потом BE'), 'chk', 'Partial BE');
      }
    }

    // --- Фильтры тренда ---
    const parseMA = getVal('MA фильтр:');
    if (parseMA !== null) {
      const isOn = parseMA.startsWith('ВКЛ');
      set('f_ma', isOn, 'chk', `MA: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) {
        const tm = parseMA.match(/\b(EMA|SMA|WMA|HMA)\b/i);
        const pm = parseMA.match(/период=(\d+)/);
        if (tm) set('f_mat', tm[1].toUpperCase(), 'sel', `MA тип=${tm[1]}`);
        if (pm) set('f_map', pm[1], 'val', `MA период=${pm[1]}`);
      }
    }
    const parseADX = getVal('ADX:');
    if (parseADX !== null) {
      const isOn = parseADX.startsWith('ВКЛ');
      set('f_adx', isOn, 'chk', `ADX: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) {
        const m=parseADX.match(/ADX\s*>\s*([\d.]+)/);
        if(m) set('f_adxt', m[1], 'val', `ADX мин=${m[1]}`);
      }
    }
    const parseRSI = getVal('RSI:');
    if (parseRSI !== null) {
      const isOn = parseRSI.startsWith('ВКЛ');
      set('f_rsi', isOn, 'chk', `RSI: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) {
        const osm=parseRSI.match(/лонг<(\d+)/); const obm=parseRSI.match(/шорт>(\d+)/);
        if(osm) set('f_rsios', osm[1], 'val', `RSI OS=${osm[1]}`);
        if(obm) set('f_rsiob', obm[1], 'val', `RSI OB=${obm[1]}`);
      }
    }
    const parseSTrend = getVal('Простой тренд:');
    if (parseSTrend !== null) {
      const isOn = parseSTrend.startsWith('ВКЛ');
      set('f_strend', isOn, 'chk', `STrend: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) { const m=parseSTrend.match(/окно=(\d+)/); if(m) set('f_stw', m[1], 'val', `STrend окно=${m[1]}`); }
    }
    const parseStruct = getVal('Структура рынка:');
    if (parseStruct !== null) {
      const isOn = parseStruct.startsWith('ВКЛ');
      set('f_struct', isOn, 'chk', `Struct: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) {
        const ml=parseStruct.match(/pvl=(\d+)/), mr=parseStruct.match(/pvr=(\d+)/);
        if(ml) set('f_strpvl', ml[1], 'val', `Struct pvl=${ml[1]}`);
        if(mr) set('f_strpvr', mr[1], 'val', `Struct pvr=${mr[1]}`);
        const mOld=parseStruct.match(/lookback=(\d+)/); if(mOld) set('f_strl', mOld[1], 'val', `Struct lookback=${mOld[1]}`);
      }
    }
    const parseFresh = getVal('Свежесть тренда:');
    if (parseFresh !== null) {
      const isOn = parseFresh.startsWith('ВКЛ');
      set('f_fresh', isOn, 'chk', `Fresh: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) { const m=parseFresh.match(/макс=(\d+)/); if(m) set('f_freshm', m[1], 'val', `Fresh макс=${m[1]}`); }
    }
    const parseVolF = getVal('Волатильность ATR:');
    if (parseVolF !== null) {
      const isOn = parseVolF.startsWith('ВКЛ');
      set('f_volf', isOn, 'chk', `VolF: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) { const m=parseVolF.match(/ATR\s*<\s*([\d.]+)/); if(m) set('f_vfm', m[1], 'val', `VolF mult=${m[1]}`); }
    }
    const parseMaDist = getVal('Дистанция от MA:');
    if (parseMaDist !== null) {
      const isOn = parseMaDist.startsWith('ВКЛ');
      set('f_madist', isOn, 'chk', `MaDist: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) { const m=parseMaDist.match(/макс=([\d.]+)/); if(m) set('f_madv', m[1], 'val', `MaDist макс=${m[1]}`); }
    }
    const parseCandle = getVal('Размер свечи:');
    if (parseCandle !== null) {
      const isOn = parseCandle.startsWith('ВКЛ');
      set('f_candle', isOn, 'chk', `CandleF: ${isOn?'ВКЛ':'ВЫКЛ'}`);
    }
    const parseConsec = getVal('Серия свечей:');
    if (parseConsec !== null) {
      const isOn = parseConsec.startsWith('ВКЛ');
      set('f_consec', isOn, 'chk', `Consec: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) { const m=parseConsec.match(/макс=(\d+)/); if(m) set('f_concm', m[1], 'val', `Consec макс=${m[1]}`); }
    }
    // --- Объёмные фильтры ---
    const parseVSA = getVal('VSA (объём):');
    if (parseVSA !== null) {
      const isOn = parseVSA.startsWith('ВКЛ');
      set('f_vsa', isOn, 'chk', `VSA: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) {
        const mm=parseVSA.match(/объём\s*>([\d.]+)/); const pm=parseVSA.match(/за\s*(\d+)\s*баров/);
        if(mm) set('f_vsam', mm[1], 'val', `VSA mult=${mm[1]}`);
        if(pm) set('f_vsap', pm[1], 'val', `VSA период=${pm[1]}`);
      }
    }
    const parseLiq = getVal('Ликвидность:');
    if (parseLiq !== null) {
      const isOn = parseLiq.startsWith('ВКЛ');
      set('f_liq', isOn, 'chk', `Liq: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) { const m=parseLiq.match(/мин=([\d.]+)/); if(m) set('f_liqm', m[1], 'val', `Liq мин=${m[1]}`); }
    }
    const parseVolDir = getVal('Направл. объёма:');
    if (parseVolDir !== null) {
      const isOn = parseVolDir.startsWith('ВКЛ');
      set('f_vdir', isOn, 'chk', `VolDir: ${isOn?'ВКЛ':'ВЫКЛ'}`);
    }
    const parseWT = getVal('Взвеш. тренд WT:');
    if (parseWT !== null) {
      const isOn = parseWT.startsWith('ВКЛ');
      set('f_wt', isOn, 'chk', `WT: ${isOn?'ВКЛ':'ВЫКЛ'}`);
      if (isOn) {
        const sm=parseWT.match(/score>([\d.]+)/); const nm=parseWT.match(/N=(\d+)/);
        const vm=parseWT.match(/volW=([\d.]+)/); const bm=parseWT.match(/bodyW=([\d.]+)/);
        if(sm) set('f_wtt', sm[1], 'val', `WT score=${sm[1]}`);
        if(nm) set('f_wtn', nm[1], 'val', `WT N=${nm[1]}`);
        if(vm) set('f_wtv', vm[1], 'val', `WT volW=${vm[1]}`);
        if(bm) set('f_wtb', bm[1], 'val', `WT bodyW=${bm[1]}`);
      }
    }
    const parseFat = getVal('Усталость тренда:');
    if (parseFat !== null) {
      const isOn = parseFat.startsWith('ВКЛ');
      set('f_fat', isOn, 'chk', `Fatigue: ${isOn?'ВКЛ':'ВЫКЛ'}`);
    }
    // --- Общее ---
    const parseATRp = getVal('ATR период:');
    if (parseATRp !== null) { const m=parseATRp.match(/^(\d+)/); if(m) set('c_atr', m[1], 'val', `ATR период=${m[1]}`); }
    const parseComm = getVal('Комиссия:');
    if (parseComm !== null) { const m=parseComm.match(/^([\d.]+)/); if(m) set('c_comm', (parseFloat(m[1])*2).toFixed(3), 'val', `Комиссия=${m[1]}%`); }

  } else {
    // ════════════════════════════════════════════════════════════
    // РЕЖИМ 2: Свободный текст — прежняя логика с regex
    // ════════════════════════════════════════════════════════════
    const matchNum = (str, ...pats) => { for(const p of pats){const m=str.match(p);if(m)return m[1];} return null; };

    const atrV = matchNum(t, /atr\s*[=:]?\s*(\d+)\b/, /atr\s+период\s*[=:]?\s*(\d+)/);
    if (atrV) set('c_atr', atrV, 'val', `ATR период=${atrV}`);
    const commV = matchNum(t, /комисс\w*\s*[=:]?\s*([\d.]+)/, /comm\w*\s*[=:]?\s*([\d.]+)/);
    if (commV) set('c_comm', commV, 'val', `Комиссия=${commV}%`);
    const mintV = matchNum(t, /мин\s*сдел\w*\s*[=:]?\s*(\d+)/, /min.?trades?\s*[=:]?\s*(\d+)/);
    if (mintV) set('c_mint', mintV, 'val', `Мин сделок=${mintV}`);

    const slAtrV = matchNum(t, /sl\s*(?:×|x|atr\s*[×x]?)\s*([\d.]+)/, /стоп\s*(?:лосс)?\s*atr\s*[=:]?\s*([\d.]+)/);
    if (slAtrV && parseFloat(slAtrV)<20) {
      set('s_atr', true, 'chk', 'SL ATR ВКЛ'); set('s_atrv', slAtrV, 'val', `SL ATR=${slAtrV}`);
      set('s_pct', false, 'chk', 'SL % ВЫКЛ');
    }
    const slPctV = matchNum(t, /sl\s*([\d.]+)\s*%/, /стоп\s*([\d.]+)\s*%/);
    if (slPctV && !slAtrV) {
      set('s_pct', true, 'chk', 'SL % ВКЛ'); set('s_pctv', slPctV, 'val', `SL %=${slPctV}`);
      set('s_atr', false, 'chk', 'SL ATR ВЫКЛ');
    }
    const tpRRV = matchNum(t, /tp\s*(?:rr|r:r|r\/r)\s*[=×x]?\s*([\d.]+)/, /r[:\s]?r\s*[=:]?\s*([\d.]+)/);
    if (tpRRV) { set('t_rr', true, 'chk', 'TP RR ВКЛ'); set('t_rrv', tpRRV, 'val', `TP RR=${tpRRV}`); }
    const tpAtrV = matchNum(t, /tp\s*(?:atr|×atr)\s*[=×x]?\s*([\d.]+)/);
    if (tpAtrV && !tpRRV) { set('t_atr', true, 'chk', 'TP ATR ВКЛ'); set('t_atrv', tpAtrV, 'val', `TP ATR=${tpAtrV}`); }
    const maP = matchNum(t, /(?:ema|sma|wma|hma|ma)\s*[=:]?\s*(\d+)\b/);
    if (maP && parseInt(maP)>=5) {
      set('f_ma', true, 'chk', 'MA ВКЛ'); set('f_map', maP, 'val', `MA период=${maP}`);
      if(t.match(/\bema\b/)) set('f_mat','EMA','sel','MA=EMA');
      else if(t.match(/\bsma\b/)) set('f_mat','SMA','sel','MA=SMA');
      else if(t.match(/\bwma\b/)) set('f_mat','WMA','sel','MA=WMA');
    }
    const adxThV = matchNum(t, /adx\s*[>>=]?\s*(\d+)/);
    if (adxThV) { set('f_adx', true, 'chk', 'ADX ВКЛ'); set('f_adxt', adxThV, 'val', `ADX мин=${adxThV}`); }
    const adxLV = matchNum(t, /adx\s+период\s*[=:]?\s*(\d+)/);
    if (adxLV) set('f_adxl', adxLV, 'val', `ADX период=${adxLV}`);
    const pvLV = matchNum(t, /pivot\s*(?:left|l)\s*[=:]?\s*(\d+)/, /left\s*[=:]?\s*(\d+)/);
    const pvRV = matchNum(t, /pivot\s*(?:right|r)\s*[=:]?\s*(\d+)/, /right\s*[=:]?\s*(\d+)/);
    if (pvLV||pvRV) {
      set('e_pv', true, 'chk', 'Pivot ВКЛ');
      if(pvLV) set('e_pvl', pvLV, 'val', `Pivot Left=${pvLV}`);
      if(pvRV) set('e_pvr', pvRV, 'val', `Pivot Right=${pvRV}`);
    }
    const rsiOsV = matchNum(t, /rsi\s*(?:os|перепрод\w*|oversold)\s*[<<=]?\s*(\d+)/, /rsi\s*<\s*(\d+)/);
    const rsiObV = matchNum(t, /rsi\s*(?:ob|перекуп\w*|overbought)\s*[>>=]?\s*(\d+)/, /rsi\s*>\s*(\d+)/);
    if (rsiOsV||rsiObV) {
      set('f_rsi', true, 'chk', 'RSI ВКЛ');
      if(rsiOsV) set('f_rsios', rsiOsV, 'val', `RSI OS=${rsiOsV}`);
      if(rsiObV) set('f_rsiob', rsiObV, 'val', `RSI OB=${rsiObV}`);
    }
  }

  return changes;
}

// Подсветка полей при применении
function flashField(id) {
  const el = $(id);
  if (!el) return;
  el.style.transition = 'background 0.1s';
  el.style.background = 'rgba(0,212,120,0.35)';
  setTimeout(() => { el.style.background = ''; el.style.transition = ''; }, 900);
}

function showParseToast(changes) {
  // Удаляем старый тост если есть
  const old = document.getElementById('parse-toast');
  if (old) old.remove();
  const toast = document.createElement('div');
  toast.id = 'parse-toast';
  toast.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    background:var(--bg4);border:1px solid var(--accent2);color:var(--text);
    border-radius:8px;padding:10px 18px;font-size:.72em;z-index:9999;
    box-shadow:0 4px 20px rgba(0,0,0,.5);max-width:420px;text-align:center;
    animation:fadeInUp .25s ease`;
  const groups = [...new Set(changes.map(c=>c.group))];
  const summary = changes.filter(c=>c.type!=='chk'||c.value===true).map(c=>c.label).join(' · ');
  toast.innerHTML = `<b style="color:var(--accent2)">✅ Применено ${changes.length} изменений</b><br>
    <span style="color:var(--text2)">${summary.slice(0,200)}</span>`;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity='0'; toast.style.transition='opacity .4s'; setTimeout(()=>toast.remove(),400); }, 4000);
}

function previewParsedText() {
  const changes = parseTextToSettings($('parse-input').value);
  const el = $('parse-preview');
  const isCopy = $('parse-input').value.includes('--- ПАТТЕРНЫ ВХОДА ---');
  if (!changes.length) {
    el.innerHTML = '<span style="color:var(--neg)">⚠️ Ничего не распознано.<br>Примеры: <i>SL ATR 1.5 · TP RR 2.5 · EMA 200 · ADX > 20</i><br>Или вставьте текст из "Скопировать настройки".</span>';
    return;
  }
  const mode = isCopy ? '📋 Формат карточки (точное восстановление)' : '✍️ Свободный текст';
  el.innerHTML = `<b style="color:var(--accent2)">${mode} — ${changes.length} изменений:</b><br>` +
    changes.filter(c=>c.type!=='logic'||(c.type==='logic')).map(c =>
      `<span style="color:${c.value===false?'var(--text3)':'var(--text2)'}">• ${c.label}</span>`
    ).join('<br>');
}

function applyParsedText() {
  const changes = parseTextToSettings($('parse-input').value);
  if (!changes.length) {
    $('parse-preview').innerHTML = '<span style="color:var(--neg)">⚠️ Ничего не распознано</span>';
    return;
  }
  const changed_ids = new Set();
  changes.forEach(c => {
    if (c.type === 'logic') {
      // SL/TP логика: ищем radio-кнопки или select с нужным именем
      const prefix = c.id === '_slLogic' ? 's_lg' : 't_lg';
      const radio = document.querySelector(`input[name="${prefix}"][value="${c.value}"]`);
      if (radio) { radio.checked = true; changed_ids.add(prefix); }
      return;
    }
    if (c.type === 'xmode') {
      // Кнопки режима (revMode, revAct, revSrc, timeMode, clxMode)
      if (typeof setXMode === 'function') { setXMode(c.xmodeType, c.value); changed_ids.add(c.xmodeType); }
      return;
    }
    const el = $(c.id);
    if (!el) return;
    if (c.type === 'val') { el.value = c.value; changed_ids.add(c.id); }
    else if (c.type === 'chk') { el.checked = c.value; if(c.value) changed_ids.add(c.id); }
    else if (c.type === 'sel') { el.value = c.value; changed_ids.add(c.id); }
  });
  // Подсвечиваем изменённые поля
  changed_ids.forEach(id => flashField(id));
  updatePreview();
  closeParseModal();
  showParseToast(changes);
}
