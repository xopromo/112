// ============================================================
// pine_export.js — генератор Pine Script v6 из конфига оптимизатора
// ============================================================
//
// ФУНКЦИИ (карта для навигации):
//   generatePineScript(r)          line 8     — главная функция экспорта
//   fixPineScript(code)            line 987   — автоисправление ошибок Pine v5/v6
//   _addActivePinev6(code)         line 1103  — добавляет active= для toggle-групп (Pine v6)
//
// Вызов: generatePineScript(r)  где r — объект результата из results[]
// Возвращает строку — готовый Pine Script v6 индикатор
//
// ── ПОКРЫТИЕ ФИЛЬТРОВ (читается test/pine_check.js) ─────────
// PINE_EXPORTED_FILTERS: useMA, useConfirm, useMaDist, useADX, useVolF, useAtrExp, useCandleF, useStruct, useVSA, useLiq, useVolDir, useSTrend
// PINE_NOT_EXPORTED: useRSI, useConsec, useFresh, useWT, useFat
// ─────────────────────────────────────────────────────────────
// ============================================================

function generatePineScript(r) {
  if (!r || !r.cfg) return '// Нет конфига';
  const c = r.cfg;

  // ── helpers ──────────────────────────────────────────────
  const b = (v) => v ? 'true' : 'false';
  const f = (v, d=1) => (typeof v === 'number') ? v.toFixed(d) : String(v);

  // ── SL / TP helpers ──────────────────────────────────────
  const slPair = c.slPair || {a:{type:'atr',m:1.5}, p:null, combo:false};
  const tpPair = c.tpPair || {a:{type:'rr',m:2}, b:null, combo:false};

  const useSlAtr = !!(slPair.a || slPair.combo);
  const useSlPct = !!(slPair.p || slPair.combo);
  const slAtrVal = slPair.a ? slPair.a.m : 1.5;
  const slPctVal = slPair.p ? slPair.p.m : 2.0;
  const slLogicOr = (c.slLogic !== 'and');

  const tp1 = tpPair.a;
  const tp2 = tpPair.b;
  const useTpRR  = (tp1 && tp1.type === 'rr')  || (tp2 && tp2.type === 'rr');
  const useTpATR = (tp1 && tp1.type === 'atr') || (tp2 && tp2.type === 'atr');
  const useTpPct = (tp1 && tp1.type === 'pct') || (tp2 && tp2.type === 'pct');
  const tpRRVal  = (tp1 && tp1.type === 'rr')  ? tp1.m : (tp2 && tp2.type === 'rr')  ? tp2.m : 2.0;
  const tpATRVal = (tp1 && tp1.type === 'atr') ? tp1.m : (tp2 && tp2.type === 'atr') ? tp2.m : 3.0;
  const tpPctVal = (tp1 && tp1.type === 'pct') ? tp1.m : (tp2 && tp2.type === 'pct') ? tp2.m : 5.0;
  const tpLogicOr = (c.tpLogic !== 'and');

  const atrP   = c.atrPeriod || 14;
  const comm   = (c.baseComm !== undefined ? c.baseComm : c.commission) || 0.08;
  const spread = (c.spreadVal !== undefined ? c.spreadVal : 0);

  // ── Формируем Pine Script ─────────────────────────────────
  const lines = [];

  lines.push(`//@version=6`);
  lines.push(`// ============================================================`);
  lines.push(`// USE Strategy Engine — экспорт из оптимизатора`);
  lines.push(`// Конфиг: ${r.name}`);
  lines.push(`// PnL: ${r.pnl.toFixed(1)}%  WR: ${r.wr.toFixed(1)}%  Сделок: ${r.n}  DD: ${r.dd.toFixed(1)}%`);
  lines.push(`// ============================================================`);
  lines.push(`indicator("USE [${r.name}]", shorttitle="USE_EXP", overlay=true, max_lines_count=500, max_labels_count=500, max_boxes_count=500)`);
  lines.push(``);

  // ── INPUTS ───────────────────────────────────────────────
  lines.push(`// ==========================================`);
  lines.push(`// 1. ВХОДНЫЕ ДАННЫЕ`);
  lines.push(`// ==========================================`);

  // Entry patterns — из ENTRY_REGISTRY
  lines.push(`grp_entry = "🎯 ПАТТЕРНЫ ВХОДА"`);
  for (const _e of ENTRY_REGISTRY) {
    const _entryLines = _e.pineLines(c, b, f);
    for (const _l of _entryLines) lines.push(_l);
  }
  lines.push(``);

  // MA filter
  lines.push(`grp_ma   = "📈 MA ФИЛЬТР"`);
  lines.push(`use_int_ma = input.bool(${b(c.useMA)}, "Включить MA фильтр", group=grp_ma)`);
  lines.push(`ma_type      = input.string("${c.maType||'EMA'}", "Тип", options=["SMA","EMA","WMA","HMA","VWMA","DEMA","TEMA","Kalman"], group=grp_ma)`);
  lines.push(`ma_len       = input.int(${c.maP||200}, "Период", group=grp_ma)`);
  lines.push(`ma_htf_ratio = input.int(${c.htfRatio||1}, "HTF ratio (1=текущий ТФ)", minval=1, maxval=1000, group=grp_ma)`);
  lines.push(``);

  // Confirm MA filter
  lines.push(`grp_conf     = "🔍 CONFIRM MA"`);
  lines.push(`use_conf_ma  = input.bool(${b(c.useConfirm)}, "Включить Confirm MA", group=grp_conf)`);
  lines.push(`conf_ma_type = input.string("${c.confMatType||'EMA'}", "Тип", options=["SMA","EMA","WMA","HMA","DEMA","TEMA","Kalman"], group=grp_conf)`);
  lines.push(`conf_ma_len  = input.int(${c.confN||100}, "Период", group=grp_conf)`);
  lines.push(`conf_ma_htf  = input.int(${c.confHtfRatio||1}, "HTF ratio (1=текущий ТФ)", minval=1, maxval=1000, group=grp_conf)`);
  lines.push(``);

  // Simple trend
  lines.push(`grp_wtrend = "📊 ПРОСТОЙ ТРЕНД"`);
  lines.push(`use_simple_trend = input.bool(${b(c.useSTrend)}, "Свечи выше/ниже MA", group=grp_wtrend)`);
  lines.push(`st_depth   = input.int(${Math.max(3, c.sTrendWin||10)}, "Период (баров)", minval=3, maxval=50, group=grp_wtrend)`);
  lines.push(``);

  // MA distance
  lines.push(`grp_ma_dist = "📏 ДИСТАНЦИЯ ОТ MA"`);
  lines.push(`use_ma_dist = input.bool(${b(c.useMaDist)}, "Фильтр расстояния", group=grp_ma_dist)`);
  lines.push(`ma_dist_max = input.float(${f(c.maDistMax||3.0,1)}, "Макс дистанция ×ATR", step=0.5, group=grp_ma_dist)`);
  lines.push(``);

  // ADX
  lines.push(`grp_adx  = "📊 ADX"`);
  lines.push(`use_adx       = input.bool(${b(c.useADX)}, "ADX фильтр", group=grp_adx)`);
  lines.push(`adx_len       = input.int(${c.adxLen||14}, "Период", group=grp_adx)`);
  lines.push(`adx_thresh    = input.float(${f(c.adxThresh||20.0,1)}, "Мин ADX", step=1.0, group=grp_adx)`);
  lines.push(`adx_htf_ratio = input.int(${c.adxHtfRatio||1}, "HTF ratio (1=текущий ТФ)", minval=1, maxval=1000, group=grp_adx)`);
  lines.push(`adx_slope     = input.bool(${b(c.useAdxSlope)}, "ADX растёт (slope)", group=grp_adx)`);
  lines.push(`adx_slope_bars= input.int(${c.adxSlopeBars||3}, "Slope: баров назад", minval=1, maxval=20, group=grp_adx)`);
  lines.push(``);

  // Volume
  lines.push(`grp_vsa  = "🐳 ОБЪЁМ"`);
  lines.push(`use_vsa    = input.bool(${b(c.useVSA)},  "Подтверждение объёмом", group=grp_vsa)`);
  lines.push(`vol_len    = input.int(${c.vsaPeriod||20}, "Период среднего", group=grp_vsa)`);
  lines.push(`vol_mult   = input.float(${f(c.vsaMult||1.8,1)}, "Множитель", step=0.1, group=grp_vsa)`);
  lines.push(`use_liq_f  = input.bool(${b(c.useLiq)},  "Фильтр ликвидности", group=grp_vsa)`);
  lines.push(`liq_min_mult = input.float(${f(c.liqMin||0.5,1)}, "Мин объём / средний", step=0.1, group=grp_vsa)`);
  lines.push(`use_vol_dir = input.bool(${b(c.useVolDir)}, "Направление объёма", group=grp_vsa)`);
  lines.push(`vol_dir_len = input.int(${Math.max(3, c.volDirPeriod||10)}, "Период направления", minval=3, maxval=50, group=grp_vsa)`);
  lines.push(``);

  // Candle filter
  lines.push(`grp_candle = "📏 ФИЛЬТР СВЕЧИ"`);
  lines.push(`use_candle_f = input.bool(${b(c.useCandleF)}, "Фильтр размера свечи", group=grp_candle)`);
  lines.push(`candle_min   = input.float(${f(c.candleMin||0.3,1)}, "Мин размер ×ATR (0=выкл)", step=0.1, group=grp_candle)`);
  lines.push(`candle_max   = input.float(${f(c.candleMax||3.0,1)}, "Макс размер ×ATR (0=выкл)", step=0.1, group=grp_candle)`);
  lines.push(``);

  // Volatility filter
  lines.push(`grp_volf = "🌊 ВОЛАТИЛЬНОСТЬ"`);
  lines.push(`use_vol_f   = input.bool(${b(c.useVolF)},  "Фильтр волатильности", group=grp_volf)`);
  lines.push(`vol_f_mult  = input.float(${f(c.volFMult||2.0,1)}, "Макс ATR/средний", step=0.1, group=grp_volf)`);
  lines.push(`vol_f_len   = input.int(50, "Период", group=grp_volf)`);
  lines.push(`use_atr_exp  = input.bool(${b(c.useAtrExp)}, "ATR расширяется (антифлет)", group=grp_volf)`);
  lines.push(`atr_exp_mult = input.float(${f(c.atrExpMult||1.0,1)}, "Мин ATR/средний (антифлет)", step=0.1, group=grp_volf)`);
  lines.push(``);

  // Market structure
  lines.push(`grp_struct = "🏗️ СТРУКТУРА"`);
  lines.push(`use_struct   = input.bool(${b(c.useStruct)}, "Структура рынка HH/HL", group=grp_struct)`);
  lines.push(`struct_pv_l  = input.int(${Math.max(2, c.strPvL||5)}, "Pivot left",  minval=2, maxval=100, group=grp_struct)`);
  lines.push(`struct_pv_r  = input.int(${Math.max(1, c.strPvR||2)}, "Pivot right", minval=1, maxval=5,   group=grp_struct)`);
  lines.push(``);

  // SL / TP
  lines.push(`// ===== СТОП-ЛОССЫ =====`);
  lines.push(`grp_sl = "🛑 STOP LOSS"`);
  lines.push(`sl_logic   = input.string("${slLogicOr ? 'ИЛИ (первый сработавший)' : 'И (оба нарушены)'}", "Логика SL", options=["ИЛИ (первый сработавший)","И (оба нарушены)"], group=grp_sl)`);
  lines.push(`use_sl_atr = input.bool(${b(useSlAtr)}, "✅ SL по ATR",    group=grp_sl)`);
  lines.push(`sl_atr_val = input.float(${f(slAtrVal,1)}, "  ATR множитель", step=0.1, group=grp_sl)`);
  lines.push(`use_sl_pct = input.bool(${b(useSlPct)}, "✅ SL по %",      group=grp_sl)`);
  lines.push(`sl_pct_val = input.float(${f(slPctVal,1)}, "  Процент %",    step=0.1, group=grp_sl)`);
  lines.push(`use_sl_piv = input.bool(${b(c.useSLPiv||false)}, "✅ SL pivot (динам)", group=grp_sl)`);
  lines.push(`sl_piv_off  = input.float(${f(c.slPivOff||0.2,1)}, "  Отступ ×ATR",  step=0.1, group=grp_sl)`);
  lines.push(`sl_piv_max  = input.float(${f(c.slPivMax||3.0,1)}, "  Макс ×ATR",    step=0.1, group=grp_sl)`);
  lines.push(`sl_piv_trail= input.bool(${b(c.slPivTrail||false)}, "  Подтягивать", group=grp_sl)`);
  lines.push(`sl_piv_look = input.int(${c.slPivL||3}, "  Баров слева", minval=1, maxval=10, group=grp_sl)`);
  lines.push(`sl_piv_right_v = input.int(${c.slPivR||1}, "  Баров справа", minval=1, maxval=5, group=grp_sl)`);
  lines.push(``);

  lines.push(`// ===== ТЕЙК-ПРОФИТЫ =====`);
  lines.push(`grp_tp = "🎯 TAKE PROFIT"`);
  lines.push(`tp_logic   = input.string("${tpLogicOr ? 'ИЛИ (первый сработавший)' : 'И (оба достигнуты)'}", "Логика TP", options=["ИЛИ (первый сработавший)","И (оба достигнуты)"], group=grp_tp)`);
  lines.push(`use_tp_atr = input.bool(${b(useTpATR)}, "✅ TP по ATR",       group=grp_tp)`);
  lines.push(`tp_atr_val = input.float(${f(tpATRVal,1)}, "  ATR множитель", step=0.1, group=grp_tp)`);
  lines.push(`use_tp_pct = input.bool(${b(useTpPct)}, "✅ TP по %",         group=grp_tp)`);
  lines.push(`tp_pct_val = input.float(${f(tpPctVal,1)}, "  Процент %",     step=0.1, group=grp_tp)`);
  lines.push(`use_tp_rr  = input.bool(${b(useTpRR)},  "✅ TP по R:R от SL", group=grp_tp)`);
  lines.push(`tp_rr_val  = input.float(${f(tpRRVal,1)}, "  R:R множитель", step=0.1, group=grp_tp)`);
  lines.push(``);

  // BE
  lines.push(`grp_be = "🔒 БЕЗУБЫТОК"`);
  lines.push(`use_be    = input.bool(${b(c.useBE)}, "Безубыток", group=grp_be)`);
  lines.push(`be_trig   = input.float(${f(c.beTrig||1.0,1)}, "Триггер (×ATR)", step=0.1, group=grp_be)`);
  lines.push(`be_offset = input.float(${f(c.beOff||0.0,1)}, "Оффсет (×ATR)",  step=0.1, group=grp_be)`);
  lines.push(``);

  // Trailing
  lines.push(`grp_trail = "⛓️ TRAILING"`);
  lines.push(`use_trail  = input.bool(${b(c.useTrail)}, "Trailing stop", group=grp_trail)`);
  lines.push(`trail_trig = input.float(${f(c.trTrig||2.0,1)}, "Активация (×ATR)", step=0.1, group=grp_trail)`);
  lines.push(`trail_dist = input.float(${f(c.trDist||1.0,1)}, "Дистанция (×ATR)", step=0.1, group=grp_trail)`);
  lines.push(``);

  // Exits
  lines.push(`grp_exit = "🚪 ВЫХОД"`);
  lines.push(`use_sig_ex      = input.bool(${b(c.useRev)}, "Обратный сигнал", group=grp_exit)`);
  lines.push(`sig_ex_skip     = input.int(${c.revSkip||0}, "Пропустить обратных", minval=0, maxval=50, group=grp_exit)`);
  lines.push(`sig_ex_cooldown = input.int(${c.revCooldown||0}, "Кулдаун баров", minval=0, maxval=50, group=grp_exit)`);
  lines.push(`sig_ex_min_bars = input.int(${c.revBars||2}, "Мин баров в сделке", minval=1, maxval=50, group=grp_exit)`);
  lines.push(`sig_ex_mode     = input.string("${c.revMode||'any'}", "Режим выхода (any/plus/minus)", options=["any","plus","minus"], group=grp_exit)`);
  lines.push(`use_time_ex = input.bool(${b(c.useTime)}, "Выход по времени", group=grp_exit)`);
  lines.push(`max_bars_in = input.int(${Math.max(2, c.timeBars||50)}, "Макс баров в сделке", minval=2, maxval=500, group=grp_exit)`);
  lines.push(`use_climax  = input.bool(${b(c.useClimax)}, "Climax выход (только в плюс)", group=grp_exit)`);
  lines.push(`use_clx_any = input.bool(false, "Climax± (любой)", group=grp_exit)`);
  lines.push(`use_st_exit = input.bool(${b(c.useStExit)}, "Supertrend-выход (смена тренда против позиции)", group=grp_exit)`);
  lines.push(``);

  // Delayed entry
  lines.push(`grp_wait = "⏳ ОТЛОЖЕННЫЙ ВХОД"`);
  lines.push(`use_wait    = input.bool(${b(c.waitBars > 0 || c.waitRetrace)}, "Ждать отката", group=grp_wait)`);
  lines.push(`wait_bars   = input.int(${c.waitBars||0}, "Баров ожидания (Bars)", minval=0, maxval=20, group=grp_wait)`);
  lines.push(`wait_ret    = input.bool(${b(c.waitRetrace)}, "Требовать откат цены (Retrace)", group=grp_wait)`);
  lines.push(`wait_max_b  = input.int(${c.waitMaxBars||10}, "Отменить после N баров", minval=0, maxval=100, group=grp_wait)`);
  lines.push(`wait_catr   = input.float(${c.waitCancelAtr||0}, "Отменить при уходе ×ATR", minval=0, step=0.1, group=grp_wait)`);
  lines.push(``);

  // Capital/costs
  lines.push(`grp_strat = "⚙️ КАПИТАЛ"`);
  lines.push(`start_cap  = input.float(1000.0, "Депозит $", group=grp_strat)`);
  lines.push(`comm_rate  = input.float(${f(comm,3)}, "Комиссия %", step=0.01, group=grp_strat)`);
  lines.push(`use_spread = input.bool(${b(spread > 0)}, "Учитывать спред", group=grp_strat)`);
  lines.push(`spread_pct = input.float(${f(spread,3)}, "Спред %", step=0.05, group=grp_strat)`);
  lines.push(`atr_len    = input.int(${atrP}, "Период ATR", group=grp_strat)`);
  lines.push(`atr_step   = input.int(2, "Шаг вариаций ATR", group=grp_strat)`);
  // Align max_bars with optimizer's dataset: subtract MA/confirm warmup so TV starts from same bar
  const _maWarmup   = (c.useMA      && c.maP   > 0) ? c.maP   * (c.htfRatio     || 1) : 0;
  const _confWarmup = (c.useConfirm && c.confN  > 0) ? c.confN * (c.confHtfRatio || 1) : 0;
  const _effWarmup  = Math.max(_maWarmup, _confWarmup, 50) + 2;
  const _dataN      = typeof DATA !== 'undefined' && DATA.length > 0 ? DATA.length : 50000;
  const _maxBars    = Math.max(100, _dataN - _effWarmup);
  lines.push(`max_bars   = input.int(${_maxBars}, "Глубина теста", minval=100, maxval=500000, group=grp_strat)`);
  lines.push(``);

  // Visual
  lines.push(`grp_vis = "🎨 ВИЗУАЛИЗАЦИЯ"`);
  lines.push(`show_tr   = input.bool(true, "Разметка сделок", group=grp_vis)`);
  lines.push(`show_eq   = input.bool(true, "Equity", group=grp_vis)`);
  lines.push(`eq_color  = input.color(color.new(color.yellow,20), "Цвет Equity", group=grp_vis)`);
  lines.push(`eq_width  = input.int(2, "Толщина Equity", minval=1, maxval=4, group=grp_vis)`);
  lines.push(`lbl_off_m = input.float(0.4, "Отступ ярлыков", step=0.1, group=grp_vis)`);
  lines.push(`lbl_size  = input.string(size.small, "Размер текста", options=[size.tiny,size.small,size.normal,size.large], group=grp_vis)`);
  lines.push(`c_win     = input.color(color.new(color.green,85), "Win", group=grp_vis)`);
  lines.push(`c_loss    = input.color(color.new(color.red,85), "Loss", group=grp_vis)`);
  lines.push(`c_neu     = input.color(color.new(color.gray,90), "Active", group=grp_vis)`);
  lines.push(`c_tp_line = input.color(color.lime, "TP линия", group=grp_vis)`);
  lines.push(`c_sl_line = input.color(color.red,  "SL линия", group=grp_vis)`);
  lines.push(``);
  lines.push(`grp_tab = "📊 ТАБЛИЦА"`);
  lines.push(`pos_main  = input.string(position.top_right, "Позиция", group=grp_tab)`);
  lines.push(`table_sz  = input.string(size.small, "Размер", options=[size.tiny,size.small,size.normal], group=grp_tab)`);
  lines.push(`c_bg      = input.color(color.new(color.black,40), "Фон", group=grp_tab)`);
  lines.push(``);

  // ── INDICATORS & FILTERS ─────────────────────────────────
  lines.push(`// ==========================================`);
  lines.push(`// 2. ИНДИКАТОРЫ И ФИЛЬТРЫ`);
  lines.push(`// ==========================================`);
  lines.push(`float atr_v  = ta.atr(atr_len)`);
  lines.push(`float atr_m1 = ta.atr(math.max(1, atr_len - atr_step))`);
  lines.push(`float atr_p1 = ta.atr(atr_len + atr_step)`);
  lines.push(`float total_cost = comm_rate * 2 + (use_spread ? spread_pct : 0)`);
  lines.push(`float entry_price = close`);
  lines.push(``);
  lines.push(`// Helper: convert seconds to TF string`);
  lines.push(`f_tf_str(int secs) =>`);
  lines.push(`    secs < 60 ? str.tostring(secs) + "S" : secs < 86400 ? str.tostring(math.round(secs / 60)) : str.tostring(math.round(secs / 86400)) + "D"`);
  lines.push(``);
  lines.push(`// ADX (Wilder's)`);
  lines.push(`dirmov(len) =>`);
    lines.push(`    up = ta.change(high)`);
    lines.push(`    dn = -ta.change(low)`);
  lines.push(`    pDM = na(up) ? na : (up > dn and up > 0 ? up : 0)`);
  lines.push(`    mDM = na(dn) ? na : (dn > up and dn > 0 ? dn : 0)`);
  lines.push(`    tr2 = ta.rma(ta.tr, len)`);
  lines.push(`    [100 * ta.rma(pDM, len) / tr2, 100 * ta.rma(mDM, len) / tr2]`);
  lines.push(`adx_calc(len) =>`);
  lines.push(`    [pd, md] = dirmov(len)`);
  lines.push(`    s = pd + md`);
  lines.push(`    100 * ta.rma(math.abs(pd - md) / (s == 0 ? 1 : s), len)`);
  lines.push(`string _adx_tf_str = adx_htf_ratio <= 1 ? timeframe.period : f_tf_str(timeframe.in_seconds() * adx_htf_ratio)`);
  lines.push(`float adx_val = request.security(syminfo.tickerid, _adx_tf_str, adx_calc(adx_len)[1], barmerge.gaps_off, barmerge.lookahead_on)`);
  lines.push(`float adx_val_prev = request.security(syminfo.tickerid, _adx_tf_str, adx_calc(adx_len)[1 + adx_slope_bars], barmerge.gaps_off, barmerge.lookahead_on)`);
  lines.push(`bool adx_thresh_ok = use_adx ? (not na(adx_val) and adx_val >= adx_thresh) : true`);
  lines.push(`bool adx_slope_ok  = not use_adx or not adx_slope or (not na(adx_val) and not na(adx_val_prev) and adx_val > adx_val_prev)`);
  lines.push(`bool adx_ok        = adx_thresh_ok and adx_slope_ok`);
  lines.push(``);
  lines.push(`// Volatility filter`);
  lines.push(`float atr_avg = ta.sma(atr_v, vol_f_len)`);
  lines.push(`bool vol_f_ok   = use_vol_f   ? (atr_v[1] <= atr_avg[1] * vol_f_mult)  : true`);
  lines.push(`bool atr_exp_ok = use_atr_exp ? (atr_v[1] >= atr_avg[1] * atr_exp_mult) : true`);
  lines.push(``);
  lines.push(`// Candle size filter`);
  lines.push(`float candle_size_1 = high[1] - low[1]`);
  lines.push(`bool candle_f_ok = not use_candle_f or (candle_size_1 >= candle_min * atr_v[1] and (candle_max <= 0 or candle_size_1 <= candle_max * atr_v[1]))`);
  lines.push(``);
  lines.push(`// Market structure`);
  lines.push(`struct_pv_hi_v = ta.pivothigh(high, struct_pv_l, struct_pv_r)`);
  lines.push(`struct_pv_lo_v = ta.pivotlow(low,  struct_pv_l, struct_pv_r)`);
    lines.push(`var float struct_hi1 = na`);
    lines.push(`var float struct_hi2 = na`);
    lines.push(`var float struct_lo1 = na`);
    lines.push(`var float struct_lo2 = na`);
  lines.push(`if not na(struct_pv_hi_v)`);
    lines.push(`    struct_hi2 := struct_hi1`);
    lines.push(`    struct_hi1 := high[struct_pv_r]`);
  lines.push(`if not na(struct_pv_lo_v)`);
    lines.push(`    struct_lo2 := struct_lo1`);
    lines.push(`    struct_lo1 := low[struct_pv_r]`);
  lines.push(`bool struct_bull = not na(struct_hi1) and not na(struct_hi2) and not na(struct_lo1) and not na(struct_lo2) and struct_hi1 > struct_hi2 and struct_lo1 > struct_lo2`);
  lines.push(`bool struct_bear = not na(struct_hi1) and not na(struct_hi2) and not na(struct_lo1) and not na(struct_lo2) and struct_hi1 < struct_hi2 and struct_lo1 < struct_lo2`);
  lines.push(`bool struct_ok_l = not use_struct or struct_bull`);
  lines.push(`bool struct_ok_s = not use_struct or struct_bear`);
  lines.push(``);
  lines.push(`// MA helpers`);
  lines.push(`f_dema(s, l) =>`);
  lines.push(`    e1 = ta.ema(s, l)`);
  lines.push(`    2.0 * e1 - ta.ema(e1, l)`);
  lines.push(`f_tema(s, l) =>`);
  lines.push(`    e1 = ta.ema(s, l)`);
  lines.push(`    e2 = ta.ema(e1, l)`);
  lines.push(`    3.0 * e1 - 3.0 * e2 + ta.ema(e2, l)`);
  lines.push(`f_kalman(s, len) =>`);
  lines.push(`    var float _kx = na`);
  lines.push(`    var float _kp = 1.0`);
  lines.push(`    float _kq = 1.0 / math.max(len * len, 1.0)`);
  lines.push(`    if na(_kx)`);
  lines.push(`        _kx := s`);
  lines.push(`    float _kk = _kp / (_kp + 1.0)`);
  lines.push(`    _kx := _kx + _kk * (s - _kx)`);
  lines.push(`    _kp := (1.0 - _kk) * _kp + _kq`);
  lines.push(`    _kx`);
  lines.push(`calc_ma(t, s, l) =>`);
  lines.push(`    t == "SMA" ? ta.sma(s,l) : t == "EMA" ? ta.ema(s,l) : t == "WMA" ? ta.wma(s,l) : t == "VWMA" ? ta.vwma(s,l) : t == "DEMA" ? f_dema(s,l) : t == "TEMA" ? f_tema(s,l) : t == "Kalman" ? f_kalman(s,l) : ta.hma(s,l)`);
  lines.push(`string _ma_tf_str   = ma_htf_ratio   <= 1 ? timeframe.period : f_tf_str(timeframe.in_seconds() * ma_htf_ratio)`);
  lines.push(`string _conf_tf_str = conf_ma_htf <= 1 ? timeframe.period : f_tf_str(timeframe.in_seconds() * conf_ma_htf)`);
  lines.push(`float ma_raw = request.security(syminfo.tickerid, _ma_tf_str, calc_ma(ma_type, close, ma_len)[1], barmerge.gaps_off, barmerge.lookahead_on)`);
  lines.push(`float ma_val = ma_raw`);
  lines.push(`float conf_ma_raw = request.security(syminfo.tickerid, _conf_tf_str, calc_ma(conf_ma_type, close, conf_ma_len)[1], barmerge.gaps_off, barmerge.lookahead_on)`);
  lines.push(`float conf_ma_val = conf_ma_raw`);
  lines.push(`bool conf_ok_l = not use_conf_ma or (not na(conf_ma_val) and close[1] > conf_ma_val)`);
  lines.push(`bool conf_ok_s = not use_conf_ma or (not na(conf_ma_val) and close[1] < conf_ma_val)`);
  lines.push(`plot(use_int_ma ? ma_val : na, "MA", color=color.new(color.blue,50), linewidth=2)`);
  lines.push(`plot(use_conf_ma ? conf_ma_val : na, "Confirm MA", color=color.new(color.orange,50), linewidth=1)`);
  lines.push(``);
  lines.push(`// Simple trend`);
    lines.push(`int st_above = 0`);
    lines.push(`int st_below = 0`);
  lines.push(`if use_simple_trend`);
  lines.push(`    for i = 1 to st_depth`);
  lines.push(`        if close[i] > ma_val`);
  lines.push(`            st_above += 1`);
  lines.push(`        else`);
  lines.push(`            st_below += 1`);
  lines.push(`bool st_ok_l = not use_simple_trend or st_above > st_below`);
  lines.push(`bool st_ok_s = not use_simple_trend or st_below > st_above`);
  lines.push(``);
  lines.push(`// MA filters`);
  lines.push(`bool ma_ok_l = use_int_ma ? close[1] > ma_val : true`);
  lines.push(`bool ma_ok_s = use_int_ma ? close[1] < ma_val : true`);
  lines.push(`float ma_dist = use_int_ma and atr_v > 0 ? math.abs(close[1] - ma_val) / atr_v : 0`);
  lines.push(`bool ma_dist_ok = not use_ma_dist or not use_int_ma or ma_dist <= ma_dist_max`);
  lines.push(``);
  lines.push(`// Volume`);
  lines.push(`float vol_avg2      = ta.sma(volume, vol_len)`);
  lines.push(`float body_sma20    = ta.sma(math.abs(close - open), 20)`);
  lines.push(`bool is_whale       = volume[1] > vol_avg2[1] * vol_mult`);
  lines.push(`bool is_climax_v    = volume[1] > vol_avg2[1] * 3 and math.abs(close[1] - open[1]) > body_sma20[1] * 1.5`);
  lines.push(`bool liq_ok      = not use_liq_f or volume[1] >= vol_avg2[1] * liq_min_mult`);
    lines.push(`float bull_vol = 0.0`);
    lines.push(`float bear_vol = 0.0`);
  lines.push(`for i = 1 to vol_dir_len`);
  lines.push(`    if close[i] > open[i]`);
  lines.push(`        bull_vol += volume[i]`);
  lines.push(`    else`);
  lines.push(`        bear_vol += volume[i]`);
  lines.push(`bool vol_dir_ok_l = not use_vol_dir or bull_vol > bear_vol`);
  lines.push(`bool vol_dir_ok_s = not use_vol_dir or bear_vol > bull_vol`);
  lines.push(``);

  // Entry patterns logic
  lines.push(`// ── Entry Patterns ──`);
  if (c.usePivot) {
    lines.push(`pv_hi = ta.pivothigh(high, pivot_left, pivot_right)`);
    lines.push(`pv_lo = ta.pivotlow(low,   pivot_left, pivot_right)`);
    lines.push(`bool pivot_l = use_pivot and not na(pv_lo)`);
    lines.push(`bool pivot_s = use_pivot and not na(pv_hi)`);
  } else {
    lines.push(`bool pivot_l = false`);
    lines.push(`bool pivot_s = false`);
  }
  lines.push(`body_cur  = math.abs(close - open)`);
  lines.push(`body_prev = math.abs(close[1] - open[1])`);
  lines.push(`bull_engulf = close[1] < open[1] and close > open and body_cur >= body_prev * 0.7 and close >= open[1] and open <= close[1]`);
  lines.push(`bear_engulf = close[1] > open[1] and close < open and body_cur >= body_prev * 0.7 and close <= open[1] and open >= close[1]`);
  lines.push(`safe_body   = math.max(body_cur, syminfo.mintick)`);
  lines.push(`bull_pin = (math.min(close,open) - low)  > safe_body * pin_ratio and (high - math.max(close,open)) < safe_body`);
  lines.push(`bear_pin = (high - math.max(close,open)) > safe_body * pin_ratio and (math.min(close,open) - low)  < safe_body`);
  lines.push(`donch_hi = ta.highest(high, donch_len)[2]`);
  lines.push(`donch_lo = ta.lowest(low,   donch_len)[2]`);
  lines.push(`bool donch_l = use_donch and high[1] > donch_hi`);
  lines.push(`bool donch_s = use_donch and low[1]  < donch_lo`);
  lines.push(`boll_basis = ta.sma(close, boll_len)`);
  lines.push(`boll_dev   = ta.stdev(close, boll_len) * boll_mult`);
  lines.push(`bool boll_l = use_boll and close[1] > (boll_basis + boll_dev)[1]`);
  lines.push(`bool boll_s = use_boll and close[1] < (boll_basis - boll_dev)[1]`);
  lines.push(`atr_bo_ma  = ta.ema(close, atr_bo_len)`);
  lines.push(`atr_bo_atr = ta.atr(atr_bo_len)`);
  lines.push(`bool atr_bo_l = use_atr_bo and close[1] > (atr_bo_ma + atr_bo_atr * atr_bo_mult)[1]`);
  lines.push(`bool atr_bo_s = use_atr_bo and close[1] < (atr_bo_ma - atr_bo_atr * atr_bo_mult)[1]`);
  lines.push(``);
  lines.push(`// MA Touch — использует отдельную MA (mat_len/mat_type), не фильтр-MA`);
  lines.push(`float _mat_raw = request.security(syminfo.tickerid, timeframe.period, calc_ma(mat_type, close, mat_len)[1], barmerge.gaps_off, barmerge.lookahead_on)`);
  lines.push(`float mat_val = _mat_raw`);
  lines.push(`bool ma_touch_l = false`);
  lines.push(`bool ma_touch_s = false`);
  lines.push(`if use_ma_touch and not na(mat_val)`);
  lines.push(`    float _mat_zone = mat_val * mat_zone_pct / 100`);
  lines.push(`    bool crossed_up = close[1] > mat_val and close[2] <= mat_val[1]`);
  lines.push(`    bool crossed_dn = close[1] < mat_val and close[2] >= mat_val[1]`);
  lines.push(`    if crossed_up`);
  lines.push(`        ma_touch_l := low[1] <= mat_val + _mat_zone`);
  lines.push(`    if crossed_dn`);
  lines.push(`        ma_touch_s := high[1] >= mat_val - _mat_zone`);
  lines.push(``);

  // ── Trendline Figures ────────────────────────────────────────────────────
  lines.push(`// ── Trendline Figures ──`);
  lines.push(`float tl_z   = tl_zone_pct / 100`);
  lines.push(`tl_pv_lo_v   = ta.pivotlow(low,  tl_pv_l, tl_pv_r)`);
  lines.push(`tl_pv_hi_v   = ta.pivothigh(high, tl_pv_l, tl_pv_r)`);
  lines.push(`var float tl_sl1v = na`);
  lines.push(`var int   tl_sl1b = 0`);
  lines.push(`var float tl_sl2v = na`);
  lines.push(`var int   tl_sl2b = 0`);
  lines.push(`var float tl_rl1v = na`);
  lines.push(`var int   tl_rl1b = 0`);
  lines.push(`var float tl_rl2v = na`);
  lines.push(`var int   tl_rl2b = 0`);
  lines.push(`if not na(tl_pv_lo_v)`);
  lines.push(`    tl_sl2v := tl_sl1v`);
  lines.push(`    tl_sl2b := tl_sl1b`);
  lines.push(`    tl_sl1v := low[tl_pv_r]`);
  lines.push(`    tl_sl1b := bar_index - tl_pv_r`);
  lines.push(`if not na(tl_pv_hi_v)`);
  lines.push(`    tl_rl2v := tl_rl1v`);
  lines.push(`    tl_rl2b := tl_rl1b`);
  lines.push(`    tl_rl1v := high[tl_pv_r]`);
  lines.push(`    tl_rl1b := bar_index - tl_pv_r`);
  lines.push(`float tl_sup = na`);
  lines.push(`float tl_res = na`);
  lines.push(`if not na(tl_sl1v) and not na(tl_sl2v) and tl_sl1b != tl_sl2b`);
  lines.push(`    tl_sup := tl_sl1v + (tl_sl1v - tl_sl2v) / (tl_sl1b - tl_sl2b) * (bar_index - tl_sl1b)`);
  lines.push(`if not na(tl_rl1v) and not na(tl_rl2v) and tl_rl1b != tl_rl2b`);
  lines.push(`    tl_res := tl_rl1v + (tl_rl1v - tl_rl2v) / (tl_rl1b - tl_rl2b) * (bar_index - tl_rl1b)`);
  lines.push(`bool tl_touch_l = false`);
  lines.push(`bool tl_touch_s = false`);
  lines.push(`bool tl_break_l = false`);
  lines.push(`bool tl_break_s = false`);
  lines.push(`if not na(tl_sup) and tl_sup > 0`);
  lines.push(`    if use_tl_touch and low[1] <= tl_sup * (1 + tl_z) and low[1] >= tl_sup * (1 - tl_z)`);
  lines.push(`        tl_touch_l := true`);
  lines.push(`    if use_tl_break and close[1] > tl_sup * (1 + tl_z) and close[2] <= tl_sup * (1 + tl_z)`);
  lines.push(`        tl_break_l := true`);
  lines.push(`    if use_tl_break and close[1] < tl_sup * (1 - tl_z) and close[2] >= tl_sup * (1 - tl_z)`);
  lines.push(`        tl_break_s := true`);
  lines.push(`if not na(tl_res) and tl_res > 0`);
  lines.push(`    if use_tl_touch and high[1] >= tl_res * (1 - tl_z) and high[1] <= tl_res * (1 + tl_z)`);
  lines.push(`        tl_touch_s := true`);
  lines.push(`    if use_tl_break and close[1] > tl_res * (1 + tl_z) and close[2] <= tl_res * (1 + tl_z)`);
  lines.push(`        tl_break_l := true`);
  lines.push(`    if use_tl_break and close[1] < tl_res * (1 - tl_z) and close[2] >= tl_res * (1 - tl_z)`);
  lines.push(`        tl_break_s := true`);
  // Flag
  lines.push(`var bool tl_flag_on   = false`);
  lines.push(`var bool tl_flag_bull = false`);
  lines.push(`var int  tl_flag_bar  = 0`);
  lines.push(`var float tl_flag_hi  = na`);
  lines.push(`var float tl_flag_lo  = na`);
  lines.push(`bool flag_l = false`);
  lines.push(`bool flag_s = false`);
  lines.push(`if use_flag`);
  lines.push(`    if not tl_flag_on`);
  lines.push(`        bool bull_imp = high[1] - low[6] > atr_v * flag_imp_atr and close[1] > open[1]`);
  lines.push(`        bool bear_imp = high[6] - low[1] > atr_v * flag_imp_atr and close[1] < open[1]`);
  lines.push(`        if bull_imp`);
  lines.push(`            tl_flag_on   := true`);
  lines.push(`            tl_flag_bull := true`);
  lines.push(`            tl_flag_bar  := bar_index`);
  lines.push(`            tl_flag_hi   := high[1]`);
  lines.push(`            tl_flag_lo   := low[6]`);
  lines.push(`        else if bear_imp`);
  lines.push(`            tl_flag_on   := true`);
  lines.push(`            tl_flag_bull := false`);
  lines.push(`            tl_flag_bar  := bar_index`);
  lines.push(`            tl_flag_hi   := high[6]`);
  lines.push(`            tl_flag_lo   := low[1]`);
  lines.push(`    if tl_flag_on`);
  lines.push(`        int   elapsed   = bar_index - tl_flag_bar`);
  lines.push(`        float imp_range = math.max(tl_flag_hi - tl_flag_lo, syminfo.mintick)`);
  lines.push(`        float ret_pct   = tl_flag_bull ? (tl_flag_hi - math.min(low, low[1])) / imp_range : (math.max(high, high[1]) - tl_flag_lo) / imp_range`);
  lines.push(`        if ret_pct > flag_ret or elapsed > flag_max_b`);
  lines.push(`            tl_flag_on := false`);
  lines.push(`        else if elapsed >= 2`);
  lines.push(`            if tl_flag_bull and close > tl_flag_hi * (1 - tl_z)`);
  lines.push(`                flag_l       := true`);
  lines.push(`                tl_flag_on   := false`);
  lines.push(`            else if not tl_flag_bull and close < tl_flag_lo * (1 + tl_z)`);
  lines.push(`                flag_s       := true`);
  lines.push(`                tl_flag_on   := false`);
  // Triangle
  lines.push(`bool tri_l = false`);
  lines.push(`bool tri_s = false`);
  lines.push(`if use_tri and not na(tl_sl1v) and not na(tl_sl2v) and not na(tl_rl1v) and not na(tl_rl2v)`);
  lines.push(`    bool res_fall = tl_rl1v < tl_rl2v`);
  lines.push(`    bool sup_rise = tl_sl1v > tl_sl2v`);
  lines.push(`    bool is_tri   = (res_fall and sup_rise) or (math.abs(tl_rl1v - tl_rl2v) / math.max(tl_rl1v, 0.0001) < 0.005 and sup_rise) or (res_fall and math.abs(tl_sl1v - tl_sl2v) / math.max(tl_sl1v, 0.0001) < 0.005)`);
  lines.push(`    if is_tri and not na(tl_res) and not na(tl_sup)`);
  lines.push(`        if close[1] > tl_res * (1 + tl_z) and close[2] <= tl_res * (1 + tl_z)`);
  lines.push(`            tri_l := true`);
  lines.push(`        if close[1] < tl_sup * (1 - tl_z) and close[2] >= tl_sup * (1 - tl_z)`);
  lines.push(`            tri_s := true`);
  lines.push(``);

  // ── RSI выход из зоны OB/OS ──────────────────────────────
  lines.push(`float rsi_exit_val = ta.rsi(close, rsi_exit_per)`);
  lines.push(`bool rsix_l = use_rsi_exit and rsi_exit_val[2] < rsi_exit_os and rsi_exit_val[1] >= rsi_exit_os`);
  lines.push(`bool rsix_s = use_rsi_exit and rsi_exit_val[2] > rsi_exit_ob and rsi_exit_val[1] <= rsi_exit_ob`);
  lines.push(``);

  // ── MA кросс-овер ────────────────────────────────────────
  lines.push(`float ma_cross_val = ma_cross_type == "EMA" ? ta.ema(close, ma_cross_p) : ma_cross_type == "SMA" ? ta.sma(close, ma_cross_p) : ta.wma(close, ma_cross_p)`);
  lines.push(`bool macr_l = use_ma_cross and close[2] <= ma_cross_val[2] and close[1] > ma_cross_val[1]`);
  lines.push(`bool macr_s = use_ma_cross and close[2] >= ma_cross_val[2] and close[1] < ma_cross_val[1]`);
  lines.push(``);

  // ── Свободный вход ───────────────────────────────────────
  lines.push(`bool free_l = use_free_entry`);
  lines.push(`bool free_s = use_free_entry`);
  lines.push(``);

  // ── MACD кросс-овер ──────────────────────────────────────
  lines.push(`[macd_line_val, macd_sig_val, _macd_hist] = ta.macd(close, macd_fast, macd_slow, macd_signal)`);
  lines.push(`bool macd_l = use_macd and macd_line_val[2] <= macd_sig_val[2] and macd_line_val[1] > macd_sig_val[1]`);
  lines.push(`bool macd_s = use_macd and macd_line_val[2] >= macd_sig_val[2] and macd_line_val[1] < macd_sig_val[1]`);
  lines.push(``);

  // ── Stochastic выход из зоны OB/OS ───────────────────────
  lines.push(`float stoch_k_raw = ta.stoch(close, high, low, stoch_k_per)`);
  lines.push(`float stoch_d_val = ta.sma(stoch_k_raw, stoch_d_per)`);
  lines.push(`bool stx_l = use_stoch_exit and stoch_d_val[2] < stoch_os and stoch_d_val[1] >= stoch_os`);
  lines.push(`bool stx_s = use_stoch_exit and stoch_d_val[2] > stoch_ob and stoch_d_val[1] <= stoch_ob`);
  lines.push(``);

  // ── Объём + движение ─────────────────────────────────────
  lines.push(`float vol_move_avg = ta.sma(volume, 20)`);
  lines.push(`bool volmv_l = use_vol_move and volume[1] > vol_move_avg[1] * vol_move_mult and close[1] > open[1] and (close[1] - low[1]) > (high[1] - close[1])`);
  lines.push(`bool volmv_s = use_vol_move and volume[1] > vol_move_avg[1] * vol_move_mult and close[1] < open[1] and (high[1] - close[1]) > (close[1] - low[1])`);
  lines.push(``);

  // ── Inside Bar пробой ────────────────────────────────────
  lines.push(`bool inb_l = use_inside_bar and high[2] < high[3] and low[2] > low[3] and close[1] > high[3]`);
  lines.push(`bool inb_s = use_inside_bar and high[2] < high[3] and low[2] > low[3] and close[1] < low[3]`);
  lines.push(``);

  // ── Разворот после N свечей ──────────────────────────────
  lines.push(`bool nrev_bear = true`);
  lines.push(`bool nrev_bull = true`);
  lines.push(`if use_n_reversal`);
  lines.push(`    for j = 2 to n_reversal_n + 1`);
  lines.push(`        if close[j] >= open[j]`);
  lines.push(`            nrev_bear := false`);
  lines.push(`        if close[j] <= open[j]`);
  lines.push(`            nrev_bull := false`);
  lines.push(`bool nrev_l = use_n_reversal and close[1] > open[1] and nrev_bear`);
  lines.push(`bool nrev_s = use_n_reversal and close[1] < open[1] and nrev_bull`);
  lines.push(``);

  // ── Supertrend ────────────────────────────────────────────
  lines.push(`[st_val, st_dir_raw] = ta.supertrend(st_mult, st_atr_p)`);
  lines.push(`bool st_bull = st_dir_raw < 0  // Pine: -1 = bullish, +1 = bearish`);
  lines.push(`bool st_flip_bull = st_bull[1] and not st_bull[2]   // prev bar turned bullish (was bearish)`);
  lines.push(`bool st_flip_bear = not st_bull[1] and st_bull[2]  // prev bar turned bearish (was bullish)`);
  lines.push(`bool st_l = use_supertrend and st_flip_bull`);
  lines.push(`bool st_s = use_supertrend and st_flip_bear`);
  lines.push(``);

  lines.push(`bool pat_l = pivot_l or (use_engulf and bull_engulf[1]) or (use_pinbar and bull_pin[1]) or donch_l or boll_l or atr_bo_l or (use_ma_touch and ma_touch_l) or tl_touch_l or tl_break_l or flag_l or tri_l or rsix_l or macr_l or free_l or macd_l or stx_l or volmv_l or inb_l or nrev_l or st_l`);
  lines.push(`bool pat_s = pivot_s or (use_engulf and bear_engulf[1]) or (use_pinbar and bear_pin[1]) or donch_s or boll_s or atr_bo_s or (use_ma_touch and ma_touch_s) or tl_touch_s or tl_break_s or flag_s or tri_s or rsix_s or macr_s or free_s or macd_s or stx_s or volmv_s or inb_s or nrev_s or st_s`);
  lines.push(``);
  lines.push(`// SL pivot for dynamic SL`);
  lines.push(`sl_pv_lo = ta.pivotlow(low,  sl_piv_look, sl_piv_right_v)`);
  lines.push(`sl_pv_hi = ta.pivothigh(high, sl_piv_look, sl_piv_right_v)`);
    lines.push(`var float last_pv_lo = na`);
    lines.push(`var float last_pv_hi = na`);
    lines.push(`var int last_pv_lo_bar = 0`);
    lines.push(`var int last_pv_hi_bar = 0`);
  lines.push(`if not na(sl_pv_lo)`);
    lines.push(`    last_pv_lo := low[sl_piv_right_v]`);
    lines.push(`    last_pv_lo_bar := bar_index - sl_piv_right_v`);
  lines.push(`if not na(sl_pv_hi)`);
    lines.push(`    last_pv_hi := high[sl_piv_right_v]`);
    lines.push(`    last_pv_hi_bar := bar_index - sl_piv_right_v`);
  lines.push(`float dyn_sl_long_raw  = use_sl_piv and not na(last_pv_lo) and (bar_index - last_pv_lo_bar) <= 30 ? last_pv_lo - atr_v * sl_piv_off : na`);
  lines.push(`float dyn_sl_short_raw = use_sl_piv and not na(last_pv_hi) and (bar_index - last_pv_hi_bar) <= 30 ? last_pv_hi + atr_v * sl_piv_off : na`);
  lines.push(``);
  lines.push(`// All filters combined`);
  lines.push(`bool all_filt_l = ma_ok_l and conf_ok_l and ma_dist_ok and adx_ok and vol_f_ok and atr_exp_ok and candle_f_ok and struct_ok_l and (not use_vsa or is_whale) and liq_ok and vol_dir_ok_l and st_ok_l`);
  lines.push(`bool all_filt_s = ma_ok_s and conf_ok_s and ma_dist_ok and adx_ok and vol_f_ok and atr_exp_ok and candle_f_ok and struct_ok_s and (not use_vsa or is_whale) and liq_ok and vol_dir_ok_s and st_ok_s`);
  lines.push(``);
  lines.push(`// ПРАВИЛО: сигнал только на закрытии подтверждённой свечи`);
  lines.push(`bool confirmed = barstate.isconfirmed`);
  lines.push(`bool sig_l = pat_l and all_filt_l and confirmed`);
  lines.push(`bool sig_s = pat_s and all_filt_s and confirmed`);
  lines.push(``);

  // ── SL/TP calc ───────────────────────────────────────────
  lines.push(`// ==========================================`);
  lines.push(`// 3. РАСЧЁТ SL / TP`);
  lines.push(`// ==========================================`);
  lines.push(`bool sl_is_or = sl_logic == "ИЛИ (первый сработавший)"`);
  lines.push(`bool tp_is_or = tp_logic == "ИЛИ (первый сработавший)"`);
  lines.push(``);
  lines.push(`calc_sl_level(int dir, float ep, float ac) =>`);
    lines.push(`    float sl_atr_lvl = na`);
    lines.push(`    float sl_pct_lvl = na`);
    lines.push(`    float sl_piv_lvl = na`);
  lines.push(`    int cnt = 0`);
  lines.push(`    if use_sl_atr`);
  lines.push(`        cnt += 1`);
  lines.push(`        sl_atr_lvl := dir == 1 ? ep - ac * sl_atr_val : ep + ac * sl_atr_val`);
  lines.push(`    if use_sl_pct`);
  lines.push(`        cnt += 1`);
  lines.push(`        sl_pct_lvl := dir == 1 ? ep * (1 - sl_pct_val/100) : ep * (1 + sl_pct_val/100)`);
  lines.push(`    if use_sl_piv`);
  lines.push(`        cnt += 1`);
  lines.push(`        float raw = dir == 1 ? dyn_sl_long_raw : dyn_sl_short_raw`);
  lines.push(`        float max_d = ac * sl_piv_max`);
  lines.push(`        if not na(raw)`);
  lines.push(`            float dist = math.abs(ep - raw)`);
  lines.push(`            if dist > max_d`);
  lines.push(`                raw := dir == 1 ? ep - max_d : ep + max_d`);
  lines.push(`            if (dir == 1 and raw < ep) or (dir == -1 and raw > ep)`);
  lines.push(`                sl_piv_lvl := raw`);
  lines.push(`    float result = na`);
  lines.push(`    if cnt == 0`);
  lines.push(`        result := na`);
  lines.push(`    else if cnt == 1`);
  lines.push(`        result := not na(sl_atr_lvl) ? sl_atr_lvl : not na(sl_pct_lvl) ? sl_pct_lvl : sl_piv_lvl`);
  lines.push(`    else`);
    lines.push(`        float closest = na`);
    lines.push(`        float farthest = na`);
  lines.push(`        for lv in array.from(sl_atr_lvl, sl_pct_lvl, sl_piv_lvl)`);
  lines.push(`            if not na(lv)`);
  lines.push(`                float d = math.abs(ep - lv)`);
  lines.push(`                if na(closest) or d < math.abs(ep - closest)`);
  lines.push(`                    closest := lv`);
  lines.push(`                if na(farthest) or d > math.abs(ep - farthest)`);
  lines.push(`                    farthest := lv`);
  lines.push(`        result := sl_is_or ? closest : farthest`);
  lines.push(`    result`);
  lines.push(``);
  lines.push(`calc_tp_level(int dir, float ep, float ac, float sl_dist) =>`);
    lines.push(`    float tp_atr_lvl = na`);
    lines.push(`    float tp_pct_lvl = na`);
    lines.push(`    float tp_rr_lvl = na`);
  lines.push(`    int cnt = 0`);
  lines.push(`    if use_tp_atr`);
  lines.push(`        cnt += 1`);
  lines.push(`        tp_atr_lvl := dir == 1 ? ep + ac * tp_atr_val : ep - ac * tp_atr_val`);
  lines.push(`    if use_tp_pct`);
  lines.push(`        cnt += 1`);
  lines.push(`        tp_pct_lvl := dir == 1 ? ep * (1 + tp_pct_val/100) : ep * (1 - tp_pct_val/100)`);
  lines.push(`    if use_tp_rr`);
  lines.push(`        cnt += 1`);
  lines.push(`        tp_rr_lvl := dir == 1 ? ep + sl_dist * tp_rr_val : ep - sl_dist * tp_rr_val`);
  lines.push(`    float result = na`);
  lines.push(`    if cnt == 0`);
  lines.push(`        result := na`);
  lines.push(`    else if cnt == 1`);
  lines.push(`        result := not na(tp_atr_lvl) ? tp_atr_lvl : not na(tp_pct_lvl) ? tp_pct_lvl : tp_rr_lvl`);
  lines.push(`    else`);
    lines.push(`        float closest = na`);
    lines.push(`        float farthest = na`);
  lines.push(`        for lv in array.from(tp_atr_lvl, tp_pct_lvl, tp_rr_lvl)`);
  lines.push(`            if not na(lv)`);
  lines.push(`                float d = math.abs(lv - ep)`);
  lines.push(`                if na(closest) or d < math.abs(closest - ep)`);
  lines.push(`                    closest := lv`);
  lines.push(`                if na(farthest) or d > math.abs(farthest - ep)`);
  lines.push(`                    farthest := lv`);
  lines.push(`        result := tp_is_or ? closest : farthest`);
  lines.push(`    result`);
  lines.push(``);

  // ── BACKTEST / EQUITY ENGINE ─────────────────────────────
  lines.push(`// ==========================================`);
  lines.push(`// 4. БЭКТЕСТ (вариации ATR / SL / TP)`);
  lines.push(`// ==========================================`);
  lines.push(`float base_sl = use_sl_atr ? sl_atr_val : 1.5`);
  lines.push(`float base_tp = use_tp_atr ? tp_atr_val : use_tp_rr ? tp_rr_val : 3.0`);
  lines.push(``);
  lines.push(`solve_core(bool _b, bool _s, float _ac, float _sl_over, float _tp_over) =>`);
    lines.push(`    var bool _in = false`);
    lines.push(`    var int _dir = 0`);
    lines.push(`    var float _ep = 0.0`);
    lines.push(`    var float _pnl = 0.0`);
    lines.push(`    var int _cnt = 0`);
    lines.push(`    var int _wins = 0`);
    lines.push(`    var float _dsl = 0.0`);
    lines.push(`    var float _dtp = 0.0`);
    lines.push(`    var bool _tra = false`);
    lines.push(`    var bool _bea = false`);
    lines.push(`    var int _eb = -1`);
    lines.push(`    var int _xb = -1`);
    lines.push(`    var float _mpnl = 0.0`);
    lines.push(`    var float _dd = 0.0`);
    lines.push(`    var float _pnl1 = 0.0`);
    lines.push(`    var int _cnt1 = 0`);
    lines.push(`    var int _wins1 = 0`);
    lines.push(`    var float _pnl2 = 0.0`);
    lines.push(`    var int _cnt2 = 0`);
    lines.push(`    var int _wins2 = 0`);
  lines.push(`    int _eff = math.min(max_bars, last_bar_index + 1)`);
  lines.push(`    int _split = last_bar_index - _eff + _eff / 2`);
  lines.push(`    var float _eq = 0.0`);
    lines.push(`    var int _sig_skip = 0`)
    // Pending entry state
    lines.push(`    var int _pd = 0`)           // pending dir: 1=long,-1=short,0=none
    lines.push(`    var int _pb = -1`)           // pending bar_index
    lines.push(`    var float _psc = 0.0`)       // pending signal close;
    lines.push(`    var int _cd_bar = -1`);
  lines.push(`    if bar_index > (last_bar_index - max_bars)`);
  lines.push(`        if _in and bar_index > _eb`);
  lines.push(`            float _u = _ac`);
  lines.push(`            float cpnl = _dir == 1 ? (close - _ep) / _ep * 100 : (_ep - close) / _ep * 100`);
    lines.push(`            bool frc = false`);
    lines.push(`            bool hsl = false`);
    lines.push(`            bool htp = false`);
    lines.push(`            bool htr = false`);
  lines.push(`            float xp = close`);
  lines.push(`            // Reverse signal exit`);
  lines.push(`            bool rev_sig = use_sig_ex and ((_dir == 1 and pat_s) or (_dir == -1 and pat_l))`);
  lines.push(`            bool rev_bars_ok = (bar_index - _eb) >= sig_ex_min_bars`);
  lines.push(`            bool rev_mode_ok = sig_ex_mode == "any" or (sig_ex_mode == "plus" and cpnl > 0) or (sig_ex_mode == "minus" and cpnl < 0)`);
  lines.push(`            if use_sig_ex and rev_sig and rev_bars_ok`);
  lines.push(`                if sig_ex_cooldown > 0`);
  lines.push(`                    if _cd_bar < 0`);
  lines.push(`                        _cd_bar := bar_index`);
  lines.push(`                    if (bar_index - _cd_bar) >= sig_ex_cooldown`);
  lines.push(`                        if rev_mode_ok`);
  lines.push(`                            if _sig_skip >= sig_ex_skip`);
  lines.push(`                                frc := true`);
  lines.push(`                            else`);
  lines.push(`                                _sig_skip += 1`);
  lines.push(`                        _cd_bar := -1`);
  lines.push(`                else`);
  lines.push(`                    if rev_mode_ok`);
  lines.push(`                        if _sig_skip >= sig_ex_skip`);
  lines.push(`                            frc := true`);
  lines.push(`                        else`);
  lines.push(`                            _sig_skip += 1`);
  lines.push(`            if not rev_sig`);
  lines.push(`                _cd_bar := -1`);
  lines.push(`            // Climax exit`);
  lines.push(`            if use_climax and is_climax_v and not frc`);
  lines.push(`                if (_dir == 1 and close[1] > _ep) or (_dir == -1 and close[1] < _ep)`);
  lines.push(`                    frc := true`);
  lines.push(`            if use_clx_any and is_climax_v and not frc`);
  lines.push(`                frc := true`);
  lines.push(`            // Supertrend exit`);
  lines.push(`            if use_st_exit and not frc`);
  lines.push(`                if (_dir == 1 and st_flip_bear) or (_dir == -1 and st_flip_bull)`);
  lines.push(`                    frc := true`);
  lines.push(`            // BE`);
  lines.push(`            if use_be and not _bea and be_offset >= be_trig and not frc`);
  lines.push(`                if (_dir == 1 and high >= _ep + _u * be_trig) or (_dir == -1 and low <= _ep - _u * be_trig)`);
      lines.push(`                    hsl := true`);
      lines.push(`                    xp := _ep + _dir * _u * be_trig`);
    lines.push(`                    _bea := true`);
  lines.push(`            if not hsl`);
  lines.push(`                if _dir == 1`);
  lines.push(`                    if not na(_dsl) and low <= _dsl`);
    lines.push(`                        hsl := true`);
    lines.push(`                        xp := _dsl`);
  lines.push(`                    else if not na(_dtp) and high >= _dtp`);
    lines.push(`                        htp := true`);
    lines.push(`                        xp := _dtp`);
  lines.push(`                else`);
  lines.push(`                    if not na(_dsl) and high >= _dsl`);
    lines.push(`                        hsl := true`);
    lines.push(`                        xp := _dsl`);
  lines.push(`                    else if not na(_dtp) and low <= _dtp`);
    lines.push(`                        htp := true`);
    lines.push(`                        xp := _dtp`);
  lines.push(`            // Trailing stop`);
  lines.push(`            if not hsl and not htp and use_trail and _in`);
  lines.push(`                if _dir == 1`);
  lines.push(`                    if high >= _ep + _u * trail_trig`);
  lines.push(`                        _tra := true`);
  lines.push(`                    if _tra`);
  lines.push(`                        float ns = high - _u * trail_dist`);
  lines.push(`                        if ns > _dsl`);
  lines.push(`                            if low <= ns`);
    lines.push(`                                htr := true`);
    lines.push(`                                xp := ns`);
  lines.push(`                            _dsl := ns`);
  lines.push(`                else`);
  lines.push(`                    if low <= _ep - _u * trail_trig`);
  lines.push(`                        _tra := true`);
  lines.push(`                    if _tra`);
  lines.push(`                        float ns = low + _u * trail_dist`);
  lines.push(`                        if ns < _dsl`);
  lines.push(`                            if high >= ns`);
    lines.push(`                                htr := true`);
    lines.push(`                                xp := ns`);
  lines.push(`                            _dsl := ns`);
  lines.push(`            if frc and not hsl and not htp and not htr`);
  lines.push(`                xp := close`);
  lines.push(`                if (_tra or _bea) and _dir == 1 and _dsl > _ep`);
  lines.push(`                    xp := math.max(_dsl, close)`);
  lines.push(`                if (_tra or _bea) and _dir == -1 and _dsl < _ep`);
  lines.push(`                    xp := math.min(_dsl, close)`);
  lines.push(`            if frc or hsl or htp or htr`);
  lines.push(`                float tr2 = ((_dir == 1 ? (xp - _ep)/_ep*100 : (_ep - xp)/_ep*100) - total_cost)`);
    lines.push(`                _pnl += tr2`);
    lines.push(`                _cnt += 1`);
    lines.push(`                _eq := _pnl`);
  lines.push(`                if bar_index <= _split`);
    lines.push(`                    _pnl1 += tr2`);
    lines.push(`                    _cnt1 += 1`);
    lines.push(`                    if tr2 > 0`);
    lines.push(`                        _wins1 += 1`);
  lines.push(`                else`);
    lines.push(`                    _pnl2 += tr2`);
    lines.push(`                    _cnt2 += 1`);
    lines.push(`                    if tr2 > 0`);
    lines.push(`                        _wins2 += 1`);
  lines.push(`                _mpnl := math.max(_mpnl, _eq)`);
  lines.push(`                _dd   := math.max(_dd, _mpnl - _eq)`);
    lines.push(`                if tr2 > 0`);
    lines.push(`                    _wins += 1`);
    lines.push(`                _in := false`);
    lines.push(`                _xb := bar_index`);
    lines.push(`                _sig_skip := 0`);
    lines.push(`                _cd_bar := -1`);
  lines.push(`            if _in and not htr and use_be and not _bea and be_offset < be_trig`);
  lines.push(`                if (_dir == 1 and high >= _ep + _u * be_trig) or (_dir == -1 and low <= _ep - _u * be_trig)`);
    lines.push(`                    float _be_sl = _ep + _dir * _u * be_offset`);
    lines.push(`                    _dsl := _dir == 1 ? math.max(_dsl, _be_sl) : math.min(_dsl, _be_sl)`);
    lines.push(`                    _bea := true`);
  lines.push(`            if _in and use_sl_piv and sl_piv_trail`);
  lines.push(`                if _dir == 1 and not na(sl_pv_lo)`);
  lines.push(`                    float new_sl = low[sl_piv_right_v] - _u * sl_piv_off`);
  lines.push(`                    if new_sl > _dsl and new_sl < close`);
  lines.push(`                        _dsl := new_sl`);
  lines.push(`                if _dir == -1 and not na(sl_pv_hi)`);
  lines.push(`                    float new_sl = high[sl_piv_right_v] + _u * sl_piv_off`);
  lines.push(`                    if new_sl < _dsl and new_sl > close`);
  lines.push(`                        _dsl := new_sl`);
  lines.push(`        _eq := _in ? _pnl + (_dir == 1 ? (close-_ep)/_ep*100 : (_ep-close)/_ep*100) : _pnl`);
  lines.push(`        if not _in and bar_index > _xb`);
  lines.push(`            float _sl_ov = _sl_over > 0 ? _sl_over : (use_sl_atr ? sl_atr_val : 0)`);
  lines.push(`            float _tp_ov = _tp_over > 0 ? _tp_over : 0`);
  lines.push(`            bool _do_enter = false`);
  lines.push(`            int  _do_dir   = 0`);
  lines.push(`            // A. Проверка отложенного входа`);
  lines.push(`            if use_wait and _pd != 0`);
  lines.push(`                int _bw = bar_index - _pb`);
  lines.push(`                bool _cncl = (wait_max_b > 0 and _bw > wait_max_b) or (wait_catr > 0 and _pd * (close - _psc) > wait_catr * _ac)`);
  lines.push(`                if _cncl`);
  lines.push(`                    _pd := 0`);
  lines.push(`                else`);
  lines.push(`                    bool _bk = _bw >= wait_bars`);
  lines.push(`                    bool _rk = not wait_ret or (_pd == 1 and close < _psc) or (_pd == -1 and close > _psc)`);
  lines.push(`                    if _bk and _rk`);
  lines.push(`                        _do_enter := true`);
  lines.push(`                        _do_dir   := _pd`);
  lines.push(`                        _pd       := 0`);
  lines.push(`            // B. Новый сигнал (только если нет pending)`);
  lines.push(`            if not _do_enter and _pd == 0`);
  lines.push(`                if _b or _s`);
  lines.push(`                    bool _use_delay = use_wait and (wait_bars > 0 or wait_ret)`);
  lines.push(`                    if _use_delay`);
  lines.push(`                        _pd  := _b ? 1 : -1`);
  lines.push(`                        _pb  := bar_index`);
  lines.push(`                        _psc := close`);
  lines.push(`                    else`);
  lines.push(`                        _do_enter := true`);
  lines.push(`                        _do_dir   := _b ? 1 : -1`);
  lines.push(`            // C. Исполнение входа`);
  lines.push(`            if _do_enter`);
  lines.push(`                if _do_dir == 1`);
    lines.push(`                    _in := true`);
    lines.push(`                    _dir := 1`);
    lines.push(`                    _ep := entry_price`);
    lines.push(`                    _tra := false`);
    lines.push(`                    _bea := false`);
    lines.push(`                    _sig_skip := 0`);
    lines.push(`                    _cd_bar := -1`);
  lines.push(`                    _dsl := _sl_over > 0 ? (entry_price - _ac * _sl_ov) : calc_sl_level(1, entry_price, _ac)`);
  lines.push(`                    float sl_d = math.abs(entry_price - _dsl)`);
  lines.push(`                    _dtp := _tp_over > 0 ? (entry_price + _ac * _tp_ov) : calc_tp_level(1, entry_price, _ac, sl_d)`);
  lines.push(`                    _eb := bar_index`);
  lines.push(`                else if _do_dir == -1`);
    lines.push(`                    _in := true`);
    lines.push(`                    _dir := -1`);
    lines.push(`                    _ep := entry_price`);
    lines.push(`                    _tra := false`);
    lines.push(`                    _bea := false`);
    lines.push(`                    _sig_skip := 0`);
    lines.push(`                    _cd_bar := -1`);
  lines.push(`                    _dsl := _sl_over > 0 ? (entry_price + _ac * _sl_ov) : calc_sl_level(-1, entry_price, _ac)`);
  lines.push(`                    float sl_d = math.abs(entry_price - _dsl)`);
  lines.push(`                    _dtp := _tp_over > 0 ? (entry_price - _ac * _tp_ov) : calc_tp_level(-1, entry_price, _ac, sl_d)`);
  lines.push(`                    _eb := bar_index`);
  lines.push(`    float _wr1 = _cnt1 > 0 ? _wins1 * 100.0 / _cnt1 : 0.0`);
  lines.push(`    float _wr2 = _cnt2 > 0 ? _wins2 * 100.0 / _cnt2 : 0.0`);
  lines.push(`    [_pnl, _cnt > 0 ? _wins * 100.0 / _cnt : 0.0, _cnt, _dd, _eq, _pnl1, _wr1, _cnt1, _pnl2, _wr2, _cnt2]`);
  lines.push(``);
  lines.push(`[p_m, w_m, c_m, dd_m, eq_m, sp_pnl1, sp_wr1, sp_c1, sp_pnl2, sp_wr2, sp_c2] = solve_core(sig_l, sig_s, atr_v[1], 0, 0)`);
  lines.push(`[p_a1, w_a1, c_a1, dd_a1, _z1, _x1,_x2,_x3,_x4,_x5,_x6] = solve_core(sig_l, sig_s, atr_m1[1], 0, 0)`);
  lines.push(`[p_a2, w_a2, c_a2, dd_a2, _z2, _x7,_x8,_x9,_x10,_x11,_x12] = solve_core(sig_l, sig_s, atr_p1[1], 0, 0)`);
  lines.push(`[p_t1, w_t1, c_t1, dd_t1, _z3, _x13,_x14,_x15,_x16,_x17,_x18] = solve_core(sig_l, sig_s, atr_v[1], 0, base_tp - 0.5)`);
  lines.push(`[p_t2, w_t2, c_t2, dd_t2, _z4, _x19,_x20,_x21,_x22,_x23,_x24] = solve_core(sig_l, sig_s, atr_v[1], 0, base_tp + 0.5)`);
  lines.push(`[p_l1, w_l1, c_l1, dd_l1, _z6, _x25,_x26,_x27,_x28,_x29,_x30] = solve_core(sig_l, sig_s, atr_v[1], base_sl - 0.2, 0)`);
  lines.push(`[p_l2, w_l2, c_l2, dd_l2, _z7, _x31,_x32,_x33,_x34,_x35,_x36] = solve_core(sig_l, sig_s, atr_v[1], base_sl + 0.2, 0)`);
  lines.push(``);

  // ── EQUITY PLOT ──────────────────────────────────────────
  lines.push(`// ==========================================`);
  lines.push(`// 5. EQUITY`);
  lines.push(`// ==========================================`);
  lines.push(`plot(show_eq ? eq_m : na, "Equity %", color=eq_m >= 0 ? eq_color : color.new(color.red,30), linewidth=eq_width, display=display.pane)`);
  lines.push(`plot(0, "Zero", color=color.new(color.gray,70), style=plot.style_circles, display=display.pane)`);
  lines.push(``);

  // ── VISUAL ENGINE ────────────────────────────────────────
  lines.push(`// ==========================================`);
  lines.push(`// 6. ВИЗУАЛИЗАЦИЯ СДЕЛОК`);
  lines.push(`// ==========================================`);
    lines.push(`var bool v_in = false`);
    lines.push(`var int v_dir = 0`);
    lines.push(`var float v_ep = 0.0`);
    lines.push(`var float v_sl = 0.0`);
    lines.push(`var float v_tp = 0.0`);
    lines.push(`var bool v_tra = false`);
    lines.push(`var bool v_bea = false`);
    lines.push(`var int v_sig_skip = 0`);
    lines.push(`var int v_cd_bar = -1`);
    lines.push(`var box b_trade = na`);
    lines.push(`var line l_tp = na`);
    lines.push(`var line l_sl = na`);
    lines.push(`var int v_eb = -1`);
    lines.push(`var int v_xb = -1`);
    // Pending entry state (vectorized)
    lines.push(`var int v_pd = 0`)
    lines.push(`var int v_pb = -1`)
    lines.push(`var float v_psc = 0.0`)
    lines.push(`bool a_le = false`);
    lines.push(`bool a_se = false`);
    lines.push(`bool a_lx = false`);
    lines.push(`bool a_sx = false`);
  lines.push(``);
  // ── INTRA-BAR TP/SL BLOCK ───────────────────────────────────────────────
  // Runs on every tick (not confirmed) to fire alerts and update box immediately
  // when TP/SL is touched intra-bar (before bar close).
  lines.push(`// Intra-bar TP/SL: fire alert and update trade box immediately on touch`);
  lines.push(`if v_in and bar_index > v_eb and bar_index > (last_bar_index - max_bars) and not barstate.isconfirmed`);
  lines.push(`    bool _ib_htp = v_dir == 1 ? (high >= v_tp) : (low <= v_tp)`);
  lines.push(`    bool _ib_hsl = v_dir == 1 ? (low <= v_sl) : (high >= v_sl)`);
  lines.push(`    if _ib_hsl or _ib_htp`);
  lines.push(`        float _ib_xp = _ib_hsl ? v_sl : v_tp`);
  lines.push(`        string _ib_xt = _ib_hsl ? "SL" : "TP"`);
  lines.push(`        if show_tr and not na(b_trade)`);
  lines.push(`            bool _ib_win = v_dir == 1 ? _ib_xp > v_ep : _ib_xp < v_ep`);
  lines.push(`            box.set_top(b_trade, math.max(v_ep, _ib_xp))`);
  lines.push(`            box.set_bottom(b_trade, math.min(v_ep, _ib_xp))`);
  lines.push(`            box.set_right(b_trade, bar_index)`);
  lines.push(`            box.set_bgcolor(b_trade, _ib_win ? c_win : c_loss)`);
  lines.push(`        if v_dir == 1`);
  lines.push(`            alert("XL " + _ib_xt + " @" + str.tostring(_ib_xp, "#.####"), alert.freq_once_per_bar)`);
  lines.push(`        else`);
  lines.push(`            alert("XS " + _ib_xt + " @" + str.tostring(_ib_xp, "#.####"), alert.freq_once_per_bar)`);
  lines.push(``);
  lines.push(`if bar_index > (last_bar_index - max_bars) and confirmed`);
  lines.push(`    if v_in and bar_index > v_eb`);
  lines.push(`        float _u  = atr_v[1]`);
  lines.push(`        float cpnl = v_dir == 1 ? (close - v_ep) / v_ep * 100 : (v_ep - close) / v_ep * 100`);
    lines.push(`        bool frc = false`);
    lines.push(`        bool hsl = false`);
    lines.push(`        bool htp = false`);
    lines.push(`        bool htr = false`);
    lines.push(`        float vxp = close`);
    lines.push(`        string vxt = ""`);
  lines.push(`        bool rev_sig = use_sig_ex and ((v_dir == 1 and pat_s) or (v_dir == -1 and pat_l))`);
  lines.push(`        bool rev_bars_ok = (bar_index - v_eb) >= sig_ex_min_bars`);
  lines.push(`        bool rev_mode_ok = sig_ex_mode == "any" or (sig_ex_mode == "plus" and cpnl > 0) or (sig_ex_mode == "minus" and cpnl < 0)`);
  lines.push(`        if use_sig_ex and rev_sig and rev_bars_ok`);
  lines.push(`            if sig_ex_cooldown > 0`);
  lines.push(`                if v_cd_bar < 0`);
  lines.push(`                    v_cd_bar := bar_index`);
  lines.push(`                if (bar_index - v_cd_bar) >= sig_ex_cooldown`);
  lines.push(`                    if rev_mode_ok`);
  lines.push(`                        if v_sig_skip >= sig_ex_skip`);
    lines.push(`                            frc := true`);
    lines.push(`                            vxt := "SIG"`);
  lines.push(`                        else`);
  lines.push(`                            v_sig_skip += 1`);
  lines.push(`                    v_cd_bar := -1`);
  lines.push(`            else`);
  lines.push(`                if rev_mode_ok`);
  lines.push(`                    if v_sig_skip >= sig_ex_skip`);
    lines.push(`                        frc := true`);
    lines.push(`                        vxt := "SIG"`);
  lines.push(`                    else`);
  lines.push(`                        v_sig_skip += 1`);
  lines.push(`        if not rev_sig`);
  lines.push(`            v_cd_bar := -1`);
  lines.push(`        if use_climax and is_climax_v and not frc`);
  lines.push(`            if (v_dir == 1 and close[1] > v_ep) or (v_dir == -1 and close[1] < v_ep)`);
    lines.push(`                frc := true`);
    lines.push(`                vxt := "CLX"`);
  lines.push(`        if use_clx_any and is_climax_v and not frc`);
    lines.push(`            frc := true`);
    lines.push(`            vxt := "CLX!"`);
  lines.push(`        // Supertrend exit`);
  lines.push(`        if use_st_exit and not frc`);
  lines.push(`            if (v_dir == 1 and st_flip_bear) or (v_dir == -1 and st_flip_bull)`);
    lines.push(`                frc := true`);
    lines.push(`                vxt := "ST"`);
  lines.push(`        // Time exit`);
  lines.push(`        if use_time_ex and (bar_index - v_eb) >= max_bars_in and not frc`);
    lines.push(`            frc := true`);
    lines.push(`            vxt := "TIME"`);
  lines.push(`        // BE immediate exit (beOff >= beTrig)`);
  lines.push(`        if use_be and not v_bea and be_offset >= be_trig and not frc`);
  lines.push(`            if (v_dir == 1 and high >= v_ep + _u * be_trig) or (v_dir == -1 and low <= v_ep - _u * be_trig)`);
    lines.push(`                hsl := true`);
    lines.push(`                vxp := v_ep + v_dir * _u * be_trig`);
    lines.push(`                v_bea := true`);
    lines.push(`                vxt := "BE"`);
  lines.push(`        if not hsl`);
  lines.push(`            if v_dir == 1`);
  lines.push(`                if not na(v_sl) and low <= v_sl`);
    lines.push(`                    hsl := true`);
    lines.push(`                    vxp := v_sl`);
    lines.push(`                    vxt := "SL"`);
  lines.push(`                else if not na(v_tp) and high >= v_tp`);
    lines.push(`                    htp := true`);
    lines.push(`                    vxp := v_tp`);
    lines.push(`                    vxt := "TP"`);
  lines.push(`            else`);
  lines.push(`                if not na(v_sl) and high >= v_sl`);
    lines.push(`                    hsl := true`);
    lines.push(`                    vxp := v_sl`);
    lines.push(`                    vxt := "SL"`);
  lines.push(`                else if not na(v_tp) and low <= v_tp`);
    lines.push(`                    htp := true`);
    lines.push(`                    vxp := v_tp`);
    lines.push(`                    vxt := "TP"`);
  lines.push(`        // Trailing`);
  lines.push(`        if not hsl and not htp and use_trail and v_in`);
  lines.push(`            if v_dir == 1`);
  lines.push(`                if high >= v_ep + _u * trail_trig`);
  lines.push(`                    v_tra := true`);
  lines.push(`                if v_tra`);
  lines.push(`                    float ns = high - _u * trail_dist`);
  lines.push(`                    if ns > v_sl`);
  lines.push(`                        if low <= ns`);
    lines.push(`                            htr := true`);
    lines.push(`                            vxp := ns`);
    lines.push(`                            vxt := "TRAIL"`);
  lines.push(`                        v_sl := ns`);
  lines.push(`            else`);
  lines.push(`                if low <= v_ep - _u * trail_trig`);
  lines.push(`                    v_tra := true`);
  lines.push(`                if v_tra`);
  lines.push(`                    float ns = low + _u * trail_dist`);
  lines.push(`                    if ns < v_sl`);
  lines.push(`                        if high >= ns`);
    lines.push(`                            htr := true`);
    lines.push(`                            vxp := ns`);
    lines.push(`                            vxt := "TRAIL"`);
  lines.push(`                        v_sl := ns`);
  lines.push(`        if frc and not hsl and not htp and not htr`);
  lines.push(`            vxp := close`);
  lines.push(`            if (v_tra or v_bea) and v_dir == 1 and v_sl > v_ep`);
  lines.push(`                vxp := math.max(v_sl, close)`);
  lines.push(`            if (v_tra or v_bea) and v_dir == -1 and v_sl < v_ep`);
  lines.push(`                vxp := math.min(v_sl, close)`);
  lines.push(`        // Update live box/lines`);
  lines.push(`        if show_tr`);
  lines.push(`            if not na(l_tp)`);
  lines.push(`                line.set_x2(l_tp, bar_index)`);
  lines.push(`            if not na(l_sl)`);
    lines.push(`                line.set_x2(l_sl, bar_index)`);
    lines.push(`                line.set_y1(l_sl, v_sl)`);
    lines.push(`                line.set_y2(l_sl, v_sl)`);
  lines.push(`            if not na(b_trade)`);
    lines.push(`                box.set_right(b_trade, bar_index)`);
    lines.push(`                box.set_top(b_trade, math.max(v_ep, close))`);
    lines.push(`                box.set_bottom(b_trade, math.min(v_ep, close))`);
  lines.push(`        if frc or hsl or htp or htr`);
  lines.push(`            float vtr = (v_dir == 1 ? (vxp - v_ep)/v_ep*100 : (v_ep - vxp)/v_ep*100) - total_cost`);
  lines.push(`            if v_dir == 1`);
    lines.push(`                a_lx := true`);
    lines.push(`                alert("XL " + vxt + " @" + str.tostring(vxp,"#.####"), alert.freq_once_per_bar)`);
  lines.push(`            else`);
    lines.push(`                a_sx := true`);
    lines.push(`                alert("XS " + vxt + " @" + str.tostring(vxp,"#.####"), alert.freq_once_per_bar)`);
  lines.push(`            if show_tr`);
  lines.push(`                bool win = v_dir == 1 ? vxp > v_ep : vxp < v_ep`);
    lines.push(`                box.set_top(b_trade, math.max(v_ep, vxp))`);
    lines.push(`                box.set_bottom(b_trade, math.min(v_ep, vxp))`);
    lines.push(`                box.set_right(b_trade, bar_index)`);
    lines.push(`                box.set_bgcolor(b_trade, win ? c_win : c_loss)`);
    lines.push(`                // Удаляем TP/SL линии при закрытии — чтобы не путать с уровнями следующей сделки`);
    lines.push(`                line.delete(l_tp)`);
    lines.push(`                line.delete(l_sl)`);
    lines.push(`                l_tp := na`);
    lines.push(`                l_sl := na`);
  lines.push(`                float vpct = v_dir == 1 ? (vxp - v_ep)/v_ep*100 : (v_ep - vxp)/v_ep*100`);
    lines.push(`                label.new(`);
    lines.push(`                    bar_index,`);
    lines.push(`                    v_dir == 1 ? vxp + atr_v[1] * lbl_off_m : vxp - atr_v[1] * lbl_off_m,`);
    lines.push(`                    vxt + " " + str.tostring(vpct, "#.#") + "%",`);
    lines.push(`                    color=win ? color.green : color.red,`);
    lines.push(`                    style=v_dir == 1 ? label.style_label_down : label.style_label_up,`);
    lines.push(`                    size=size.tiny,`);
    lines.push(`                    textcolor=color.white)`);
    lines.push(`            v_in := false`);
    lines.push(`            v_xb := bar_index`);
    lines.push(`            v_sig_skip := 0`);
    lines.push(`            v_cd_bar := -1`);
  lines.push(`        if v_in and not htr and use_be and not v_bea and be_offset < be_trig`);
  lines.push(`            if (v_dir == 1 and high >= v_ep + _u * be_trig) or (v_dir == -1 and low <= v_ep - _u * be_trig)`);
    lines.push(`                float v_be_sl = v_ep + v_dir * _u * be_offset`);
    lines.push(`                v_sl := v_dir == 1 ? math.max(v_sl, v_be_sl) : math.min(v_sl, v_be_sl)`);
    lines.push(`                v_bea := true`);
  lines.push(`        if v_in and use_sl_piv and sl_piv_trail`);
  lines.push(`            if v_dir == 1 and not na(sl_pv_lo)`);
  lines.push(`                float new_sl = low[sl_piv_right_v] - _u * sl_piv_off`);
  lines.push(`                if new_sl > v_sl and new_sl < close`);
  lines.push(`                    v_sl := new_sl`);
  lines.push(`            if v_dir == -1 and not na(sl_pv_hi)`);
  lines.push(`                float new_sl = high[sl_piv_right_v] + _u * sl_piv_off`);
  lines.push(`                if new_sl < v_sl and new_sl > close`);
  lines.push(`                    v_sl := new_sl`);
  lines.push(`    if not v_in and bar_index > v_xb`);
  lines.push(`        bool v_do_enter = false`);
  lines.push(`        int  v_do_dir   = 0`);
  lines.push(`        // A. Pending entry`);
  lines.push(`        if use_wait and v_pd != 0`);
  lines.push(`            int _bw = bar_index - v_pb`);
  lines.push(`            bool _cncl = (wait_max_b > 0 and _bw > wait_max_b) or (wait_catr > 0 and v_pd * (close - v_psc) > wait_catr * atr_v[1])`);
  lines.push(`            if _cncl`);
  lines.push(`                v_pd := 0`);
  lines.push(`            else`);
  lines.push(`                bool _bk = _bw >= wait_bars`);
  lines.push(`                bool _rk = not wait_ret or (v_pd == 1 and close < v_psc) or (v_pd == -1 and close > v_psc)`);
  lines.push(`                if _bk and _rk`);
  lines.push(`                    v_do_enter := true`);
  lines.push(`                    v_do_dir   := v_pd`);
  lines.push(`                    v_pd       := 0`);
  lines.push(`        // B. New signal`);
  lines.push(`        if not v_do_enter and v_pd == 0`);
  lines.push(`            if sig_l or sig_s`);
  lines.push(`                bool _use_delay = use_wait and (wait_bars > 0 or wait_ret)`);
  lines.push(`                if _use_delay`);
  lines.push(`                    v_pd  := sig_l ? 1 : -1`);
  lines.push(`                    v_pb  := bar_index`);
  lines.push(`                    v_psc := close`);
  lines.push(`                else`);
  lines.push(`                    v_do_enter := true`);
  lines.push(`                    v_do_dir   := sig_l ? 1 : -1`);
  lines.push(`        // C. Execute`);
  lines.push(`        if v_do_enter`);
  lines.push(`            v_in  := true`);
  lines.push(`            v_dir := v_do_dir`);
  lines.push(`            v_ep  := entry_price`);
  lines.push(`            v_tra := false`);
  lines.push(`            v_bea := false`);
  lines.push(`            v_sig_skip := 0`);
  lines.push(`            v_cd_bar := -1`);
  lines.push(`            float _u = atr_v[1]`);
  lines.push(`            v_sl := calc_sl_level(v_dir, entry_price, _u)`);
  lines.push(`            float sl_d = math.abs(entry_price - v_sl)`);
  lines.push(`            v_tp := calc_tp_level(v_dir, entry_price, _u, sl_d)`);
  lines.push(`            v_eb := bar_index`);
  lines.push(`            if v_dir == 1`);
    lines.push(`                a_le := true`);
    lines.push(`                alert("LONG @" + str.tostring(entry_price,"#.####") + " SL:" + str.tostring(v_sl,"#.####") + " TP:" + str.tostring(v_tp,"#.####"), alert.freq_once_per_bar)`);
  lines.push(`            else`);
    lines.push(`                a_se := true`);
    lines.push(`                alert("SHORT @" + str.tostring(entry_price,"#.####") + " SL:" + str.tostring(v_sl,"#.####") + " TP:" + str.tostring(v_tp,"#.####"), alert.freq_once_per_bar)`);
  lines.push(`            if show_tr`);
  lines.push(`                bool is_pv = (v_dir == 1 and pivot_l) or (v_dir == -1 and pivot_s)`);
  lines.push(`                string elbl = is_pv ? (v_dir == 1 ? "PvL" : "PvS") : (v_dir == 1 ? "L" : "S")`);
  lines.push(`                color ecol = is_pv ? (v_dir == 1 ? color.teal : color.maroon) : (v_dir == 1 ? color.green : color.red)`);
    lines.push(`                label.new(`);
    lines.push(`                    bar_index,`);
    lines.push(`                    v_dir == 1 ? low - _u * lbl_off_m : high + _u * lbl_off_m,`);
    lines.push(`                    elbl,`);
    lines.push(`                    color=ecol,`);
    lines.push(`                    style=v_dir == 1 ? label.style_label_up : label.style_label_down,`);
    lines.push(`                    textcolor=color.white,`);
    lines.push(`                    size=lbl_size)`);
  lines.push(`                l_tp := line.new(bar_index, v_tp, bar_index, v_tp, color=color.new(c_tp_line,40), style=line.style_dotted, width=1)`);
  lines.push(`                l_sl := line.new(bar_index, v_sl, bar_index, v_sl, color=color.new(c_sl_line,40), style=line.style_dotted, width=1)`);
  lines.push(`                b_trade := box.new(bar_index, v_ep, bar_index, v_ep, bgcolor=c_neu, border_width=0)`);
  lines.push(``);

  // ── TABLE ────────────────────────────────────────────────
  lines.push(`// ==========================================`);
  lines.push(`// 7. ТАБЛИЦА СТАТИСТИКИ`);
  lines.push(`// ==========================================`);
  lines.push(`var table t = table.new(pos_main, 6, 20, bgcolor=c_bg, border_width=1, force_overlay=true)`);
  lines.push(`d(r, l, v, p, w, c, dd, b) =>`);
  lines.push(`    cl = b ? color.new(color.yellow,30) : c_bg`);
  lines.push(`    table.cell(t, 0, r, l,                          bgcolor=cl, text_color=color.white,  text_size=table_sz)`);
  lines.push(`    table.cell(t, 1, r, str.tostring(v,"#.##"),     bgcolor=cl, text_color=color.yellow, text_size=table_sz)`);
  lines.push(`    table.cell(t, 2, r, str.tostring(p,"#.##")+"%", bgcolor=cl, text_color=p>0?color.green:color.red, text_size=table_sz)`);
  lines.push(`    table.cell(t, 3, r, str.tostring(w,"#.#")+"%",  bgcolor=cl, text_color=w>50?color.green:color.orange, text_size=table_sz)`);
  lines.push(`    table.cell(t, 4, r, str.tostring(c),            bgcolor=cl, text_color=color.gray,   text_size=table_sz)`);
  lines.push(`    table.cell(t, 5, r, str.tostring(dd,"#.#")+"%", bgcolor=cl, text_color=dd<10?color.green:dd<25?color.orange:color.red, text_size=table_sz)`);
  lines.push(`if barstate.islast`);
  lines.push(`    best = math.max(p_m, p_a1, p_a2, p_t1, p_t2, p_l1, p_l2)`);
  lines.push(`    cpnl = start_cap * math.pow(1 + p_m/100/math.max(1,c_m), c_m) - start_cap`);
  lines.push(`    rf2  = dd_m > 0 ? p_m / dd_m : 0`);
  lines.push(`    // Optimizer reference stats`);
  lines.push(`    string opt_stats = "OPT: PnL=${r.pnl.toFixed(1)}% WR=${r.wr.toFixed(1)}% n=${r.n} DD=${r.dd.toFixed(1)}%"`);
  lines.push(`    table.cell(t, 0, 0, opt_stats, bgcolor=color.new(color.teal,30), text_color=color.white, text_size=size.tiny)`);
  lines.push(`    table.merge_cells(t, 0, 0, 5, 0)`);
  lines.push(`    string hdr = "💰 " + str.tostring(cpnl,"#") + "$ | " + str.tostring(p_m,"#.##") + "% DD:" + str.tostring(dd_m,"#.#") + "% RF:" + str.tostring(rf2,"#.##")`);
  lines.push(`    table.cell(t, 0, 1, hdr, bgcolor=color.blue, text_color=color.white, text_size=size.normal)`);
  lines.push(`    table.merge_cells(t, 0, 1, 5, 1)`);
  lines.push(`    table.cell(t, 0, 2, "Параметр", bgcolor=color.new(color.gray,60), text_color=color.white, text_size=table_sz)`);
  lines.push(`    table.cell(t, 1, 2, "Значение", bgcolor=color.new(color.gray,60), text_color=color.white, text_size=table_sz)`);
  lines.push(`    table.cell(t, 2, 2, "PnL%",     bgcolor=color.new(color.gray,60), text_color=color.white, text_size=table_sz)`);
  lines.push(`    table.cell(t, 3, 2, "WR",        bgcolor=color.new(color.gray,60), text_color=color.white, text_size=table_sz)`);
  lines.push(`    table.cell(t, 4, 2, "#",          bgcolor=color.new(color.gray,60), text_color=color.white, text_size=table_sz)`);
  lines.push(`    table.cell(t, 5, 2, "DD",         bgcolor=color.new(color.gray,60), text_color=color.white, text_size=table_sz)`);
  lines.push(`    d(3, "ATR", atr_len - atr_step, p_a1, w_a1, c_a1, dd_a1, p_a1 == best)`);
  lines.push(`    d(4, "ATR◀", atr_len,           p_m,  w_m,  c_m,  dd_m,  p_m  == best)`);
  lines.push(`    d(5, "ATR", atr_len + atr_step, p_a2, w_a2, c_a2, dd_a2, p_a2 == best)`);
    lines.push(`    table.cell(t, 0, 6, "─────", bgcolor=c_bg, text_color=color.gray, text_size=table_sz)`);
    lines.push(`    table.merge_cells(t, 0, 6, 5, 6)`);
  lines.push(`    d(7,  "TP",  base_tp - 0.5, p_t1, w_t1, c_t1, dd_t1, p_t1 == best)`);
  lines.push(`    d(8,  "TP◀", base_tp,       p_m,  w_m,  c_m,  dd_m,  p_m  == best)`);
  lines.push(`    d(9,  "TP",  base_tp + 0.5, p_t2, w_t2, c_t2, dd_t2, p_t2 == best)`);
    lines.push(`    table.cell(t, 0, 10, "─────", bgcolor=c_bg, text_color=color.gray, text_size=table_sz)`);
    lines.push(`    table.merge_cells(t, 0, 10, 5, 10)`);
  lines.push(`    d(11, "SL",  base_sl - 0.2, p_l1, w_l1, c_l1, dd_l1, p_l1 == best)`);
  lines.push(`    d(12, "SL◀", base_sl,       p_m,  w_m,  c_m,  dd_m,  p_m  == best)`);
  lines.push(`    d(13, "SL",  base_sl + 0.2, p_l2, w_l2, c_l2, dd_l2, p_l2 == best)`);
    lines.push(`    table.cell(t, 0, 14, "─────", bgcolor=c_bg, text_color=color.gray, text_size=table_sz)`);
    lines.push(`    table.merge_cells(t, 0, 14, 5, 14)`);
  lines.push(`    float sl_ref = use_sl_atr ? sl_atr_val : use_sl_pct ? sl_pct_val : 1.5`);
  lines.push(`    float tp_ref = use_tp_atr ? tp_atr_val : use_tp_rr ? tp_rr_val : 3.0`);
  lines.push(`    float ev   = w_m/100 * tp_ref - (1-w_m/100) * sl_ref`);
  lines.push(`    float avg_t = c_m > 0 ? p_m / c_m : 0`);
  lines.push(`    float pf   = ((1-w_m/100)*sl_ref) > 0 ? (w_m/100*tp_ref) / ((1-w_m/100)*sl_ref) : 0`);
  lines.push(`    table.cell(t, 0, 15, "EV:" + str.tostring(ev,"#.##") + " Avg:" + str.tostring(avg_t,"#.##") + "% PF:" + str.tostring(pf,"#.##") + " RF:" + str.tostring(rf2,"#.##"), bgcolor=color.new(ev>0?color.green:color.red,70), text_color=color.white, text_size=table_sz)`);
  lines.push(`    table.merge_cells(t, 0, 15, 5, 15)`);
  lines.push(`    if sp_c1 > 0 and sp_c2 > 0`);
  lines.push(`        float sp_diff = math.abs(sp_wr1 - sp_wr2)`);
  lines.push(`        color sp_col  = sp_diff < 10 ? color.green : sp_diff < 20 ? color.orange : color.red`);
  lines.push(`        string sp_gr  = sp_diff < 10 ? "✅ Устойч" : sp_diff < 20 ? "⚠️ Слабо" : "❌ Overfit"`);
  lines.push(`        table.cell(t, 0, 16, "🔀 1п:" + str.tostring(sp_pnl1,"#.#") + "% WR:" + str.tostring(sp_wr1,"#") + "% n=" + str.tostring(sp_c1) + " | 2п:" + str.tostring(sp_pnl2,"#.#") + "% WR:" + str.tostring(sp_wr2,"#") + "% n=" + str.tostring(sp_c2) + " " + sp_gr, bgcolor=color.new(sp_col,60), text_color=color.white, text_size=table_sz)`);
  lines.push(`        table.merge_cells(t, 0, 16, 5, 16)`);
  lines.push(`    if c_m == 0`);
  lines.push(`        table.cell(t, 0, 17, "⚠️ 0 сделок — проверь настройки и глубину теста", bgcolor=color.red, text_color=color.white, text_size=size.normal)`);
  lines.push(`        table.merge_cells(t, 0, 17, 5, 17)`);
  lines.push(`    else if max_bars < last_bar_index + 1`);
  lines.push(`        int _missing = last_bar_index + 1 - max_bars`);
  lines.push(`        table.cell(t, 0, 17, "⚠️ Данные охвачены не полностью: пропущено " + str.tostring(_missing) + " баров. Увеличь Глубину теста до " + str.tostring(last_bar_index + 1), bgcolor=color.new(color.orange,40), text_color=color.white, text_size=size.tiny)`);
  lines.push(`        table.merge_cells(t, 0, 17, 5, 17)`);
  lines.push(``);

  // ── ALERTS ───────────────────────────────────────────────
  lines.push(`// ==========================================`);
  lines.push(`// 8. АЛЕРТЫ`);
  lines.push(`// ==========================================`);
  lines.push(`alertcondition(a_le, "Long Entry",  "Long Entry")`);
  lines.push(`alertcondition(a_se, "Short Entry", "Short Entry")`);
  lines.push(`alertcondition(a_lx, "Exit Long",   "Exit Long")`);
  lines.push(`alertcondition(a_sx, "Exit Short",  "Exit Short")`);
  lines.push(`plotshape(a_lx, "XL", shape.xcross,      location.abovebar, color.new(color.red,0),   size=size.tiny)`);
  lines.push(`plotshape(a_sx, "XS", shape.xcross,      location.belowbar, color.new(color.blue,0),  size=size.tiny)`);
  lines.push(`plotshape(a_le, "EL", shape.triangleup,  location.belowbar, color.new(color.green,0), size=size.tiny)`);
  lines.push(`plotshape(a_se, "ES", shape.triangledown, location.abovebar, color.new(color.fuchsia,0), size=size.tiny)`);

  const rawCode = lines.join('\n');
  // Фаза 1: исправляем известные ошибки
  const fixed = (typeof fixPineScript === 'function') ? fixPineScript(rawCode) : rawCode;
  // Фаза 2 (Hyp 4): добавляем active= к зависимым инпутам (Pine v6)
  return _addActivePinev6(fixed);
}

// ============================================================
// fixPineScript(code) — автоматически исправляет известные
// ошибки Pine v5 в сгенерированном коде.
// Вызывается внутри generatePineScript() перед возвратом.
// ============================================================
function fixPineScript(code) {
  const inputLines = code.split('\n');
  const out = [];
  let fixed = 0;

  // Утилита: получить ведущие пробелы строки
  const getIndent = s => s.match(/^(\s*)/)[1];

  // Утилита: разбить строку на топ-уровне по запятым перед "следующим оператором"
  // Возвращает массив частей или [original] если нечего делить
  function splitTopCommas(s, isStmt) {
    const parts = [];
    let cur = [];
    let depth = 0;
    let k = 0;
    while (k < s.length) {
      const ch = s[k];
      if (ch === '(' || ch === '[') { depth++; cur.push(ch); }
      else if (ch === ')' || ch === ']') { depth--; cur.push(ch); }
      else if (ch === ',' && depth === 0) {
        const rest = s.slice(k + 1).trimStart();
        if (isStmt(rest)) {
          parts.push(cur.join('').trim());
          cur = [];
          k++;
          while (k < s.length && s[k] === ' ') k++;
          continue;
        } else { cur.push(ch); }
      } else { cur.push(ch); }
      k++;
    }
    if (cur.length) parts.push(cur.join('').trim());
    return parts.filter(Boolean);
  }

  // Детекторы "следующий токен — начало нового оператора"
  const isAssign   = r => /^[a-z_]\w*\s*(?::=|[+\-]=)/.test(r);
  const isDecl     = r => /^(?:var\s+)?(?:float|int|bool|string)\s+/.test(r);
  const isCall     = r => /^[a-z_]\w*(?:\.[a-z_]\w*)*\s*\(/.test(r);
  const isSimpleEq = r => /^[a-z_]\w*\s*=\s*[^=>]/.test(r);
  const isAlert    = r => /^alert\s*\(/.test(r);
  const isAny      = r => isAssign(r) || isDecl(r) || isCall(r) || isSimpleEq(r) || isAlert(r);

  // Проверка: нужно ли пробовать склеить multiline вызов
  // (строка заканчивается на запятую и парные скобки не закрыты)
  function openParens(s) {
    let d = 0;
    for (const ch of s) { if (ch === '(') d++; else if (ch === ')') d--; }
    return d;
  }

  let i = 0;
  while (i < inputLines.length) {
    const raw = inputLines[i];
    const indent = getIndent(raw);
    const s = raw.trimEnd();
    const stripped = s.trimStart();

    // ── A. Склеить multiline function calls (label.new, line.new, box.new etc.) ──
    // Признак: строка заканчивается запятой И незакрытая скобка
    const op = openParens(s);
    if (op > 0 && s.trimEnd().endsWith(',') &&
        /(?:label|line|box|array|table)\.\w+\s*\(/.test(stripped)) {
      const collected = [s.trimEnd()];
      let j = i + 1;
      let depth = op;
      while (j < inputLines.length && depth > 0) {
        const next = inputLines[j].trimEnd();
        collected.push(next.trimStart());
        depth += openParens(next);
        j++;
      }
      const joined = indent + collected[0].trimStart() + ' ' + collected.slice(1).join(' ');
      // Normalize: remove double spaces around commas
      const clean = joined.replace(/\s*,\s*/g, ', ').replace(/\s{2,}/g, ' ');
      out.push(clean);
      fixed++;
      i = j;
      continue;
    }

    // ── B. Разбить строку с несколькими операторами через запятую ─────
    const parts = splitTopCommas(stripped, isAny);
    if (parts.length > 1) {
      for (const p of parts) out.push(indent + p);
      fixed++;
      i++;
      continue;
    }

    // ── C. "if COND, stmt" → разбить ─────────────────────────────────
    const ifComma = stripped.match(/^(if\s+[^,]+?),\s*(.+)$/);
    if (ifComma && !/\?.*:/.test(ifComma[1])) {
      out.push(indent + ifComma[1]);
      out.push(indent + '    ' + ifComma[2]);
      fixed++;
      i++;
      continue;
    }

    out.push(raw.trimEnd());
    i++;
  }

  if (fixed > 0) {
    console.log('[PineExport] Auto-fixed ' + fixed + ' Pine v5 issues');
  }
  return out.join('\n');
}

// ============================================================
// _addActivePinev6(code) — Hyp 4: добавляет active=<toggle>
// к зависимым input.*() вызовам (Pine Script v6).
// Каждая группа: toggleVar → массив переменных-зависимостей.
// Работает на regex-replace, безопасен для отсутствующих групп.
// ============================================================
function _addActivePinev6(code) {
  if (!code) return code;
  // [toggleVar, [...depVars]]
  const groups = [
    ['use_pivot',      ['pivot_left','pivot_right']],
    ['use_pinbar',     ['pin_ratio']],
    ['use_donch',      ['donch_len']],
    ['use_boll',       ['boll_len','boll_mult']],
    ['use_atr_bo',     ['atr_bo_len','atr_bo_mult']],
    ['use_ma_touch',   ['mat_type','mat_len','mat_zone_pct']],
    ['use_rsi',        ['rsi_os','rsi_ob']],
    ['use_ma',         ['ma_period','ma_type']],
    ['use_adx',        ['adx_thresh','adx_len']],
    ['use_vol_filter', ['vol_mult']],
    ['use_squeeze',    ['sqz_bb_len','sqz_kc_mult','sqz_min_bars']],
    ['use_trail',      ['trail_trig','trail_dist']],
    ['use_be',         ['be_trig','be_off']],
    ['use_partial',    ['part_rr','part_pct','part_be']],
  ];
  let result = code;
  let count = 0;
  for (const [toggle, deps] of groups) {
    // Пропускаем группу если переключатель отсутствует в коде
    if (!result.includes(toggle + ' ')) continue;
    for (const dep of deps) {
      // Ищем: dep = input.*(... без уже существующего active=
      const re = new RegExp(
        `(${dep}\\s*=\\s*input\\.\\w+\\([^)]*?)\\)`,
        'gm'
      );
      result = result.replace(re, (m, before) => {
        if (m.includes('active=')) return m; // уже есть
        count++;
        return `${before}, active=${toggle})`;
      });
    }
  }
  if (count > 0) console.log(`[PineExport] Pine v6 active=: ${count} инпутов скрыто`);
  return result;
}
