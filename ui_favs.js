// --- Favourites ---

// Синхронное сохранение избранных в localStorage
// (используется вместо storeSave для гарантированного сохранения)
function _saveFavsSync() {
  const key = _favKey();
  try {
    localStorage.setItem(key, JSON.stringify(favourites));
  } catch(e) {
    console.warn('[_saveFavsSync] Failed to save:', key, e.message);
  }
}

function isFav(name) {
  return favourites.some(f => f.name===name && (f.ns||'')===_favNs);
}
// Возвращает уровень яркости звезды: 0=нет, 1=тусклая, 2=золотая, 3=яркая
function getFavLevel(name) {
  const f = favourites.find(f => f.name===name && (f.ns||'')===_favNs);
  return f ? (f.level || 1) : 0;
}
// HTML звёздочки с уровнем яркости (через data-level на родителе td)
function _favStarText(name) {
  return getFavLevel(name) > 0 ? '★' : '☆';
}
// Добавить/обновить уровень избранного: 0→startLevel→2→3→0 (цикл)
function toggleFav(idx, event, startLevel) {
  if (event) event.stopPropagation();
  const r = typeof idx === 'number' ? results[idx] : idx;
  if (!r) return;
  const fi = favourites.findIndex(f => f.name===r.name && (f.ns||'')===_favNs);
  if (fi >= 0) {
    const cur = favourites[fi].level || 1;
    if (cur >= 3) {
      if (_tableMode === 'fav') {
        favourites[fi].level = 1; // в режиме Избранные — цикл 1→2→3→1, не удалять
      } else {
        favourites.splice(fi, 1); // убрать из избранного
      }
    } else {
      favourites[fi].level = cur + 1; // повысить уровень
    }
  } else {
    const favEntry = { name:r.name, ns:_favNs, level: startLevel || 1, stats:{
      pnl:r.pnl, wr:r.wr, n:r.n, dd:r.dd, pdd:r.pdd,
      dwr:r.dwr||0, avg:r.avg||0, p1:r.p1||0, p2:r.p2||0, c1:r.c1||0, c2:r.c2||0,
      nL:r.nL||0, pL:r.pL||0, wrL:r.wrL, nS:r.nS||0, pS:r.pS||0, wrS:r.wrS, dwrLS:r.dwrLS,
      sig:r.sig, gt:r.gt, cvr:r.cvr, upi:r.upi,
      sortino:r.sortino, kRatio:r.kRatio, sqn:r.sqn,
      omega:r.omega, pain:r.pain, burke:r.burke, serenity:r.serenity, ir:r.ir,
      cpcvScore:r.cpcvScore,
      eq:r.eq,
      old_eq:r.old_eq, new_eq:r.new_eq, // для полного OOS графика в режиме Избранное
      robScore:r.robScore, robMax:r.robMax, robDetails:r.robDetails
    }, cfg:r.cfg, ts:Date.now() };
    favourites.push(favEntry);
    // Асинхронно запустить быстрый тест устойчивости для нового избранного
    _autoRunRobustForFav(favEntry);
  }
  // Сохраняем в localStorage синхронно чтобы гарантировать сохранение
  _saveFavsSync();
  renderFavBar();
  _refreshFavStars();
}

// Запускает быстрый тест устойчивости для добавленного в Избранное результата
async function _autoRunRobustForFav(favEntry) {
  if (!favEntry || !favEntry.cfg) return;
  // Не запускаем если уже есть тест
  if (favEntry.stats.robScore !== undefined) return;

  try {
    const { score: robScore, details: robDetails } = await runRobustScoreForDetailed(
      { cfg: favEntry.cfg },
      ['oos', 'walk', 'param'],
      true // fastMode
    );
    // Сохраняем результаты теста
    favEntry.stats.robScore = robScore;
    favEntry.stats.robMax = 3; // 3 теста: oos(1) + walk(1) + param(1)
    favEntry.stats.robDetails = robDetails;
    _saveFavsSync();
    // Обновляем отображение если открыт режим Избранные
    if (_tableMode === 'fav') renderVisibleResults();
  } catch(e) {
    console.error('[_autoRunRobustForFav]', e);
  }
}
// Удалить из избранного по имени (для кнопки ✕ в режиме Избранные)
function removeFavByName(name, event) {
  if (event) event.stopPropagation();
  const fi = favourites.findIndex(f => f.name === name && (f.ns||'') === _favNs);
  if (fi >= 0) {
    favourites.splice(fi, 1);
    _saveFavsSync();
    renderFavBar();
    _refreshFavStars();
  }
}

// Добавить в избранное из OOS таблицы (уровень 2 — проверено на новых данных)
function toggleOOSFav(idx, event) {
  if (event) event.stopPropagation();
  const r = _oosTableResults[idx];
  if (!r) return;
  // Не сохраняем если бэктест на исходных данных упал — pnl/wr/dd будут null
  if (r.pnl == null || r.wr == null || r.dd == null) return;
  toggleFav(r, event, 2); // startLevel=2: из OOS = проверено на новых данных
}

// Обновляет только звёздочки в текущей таблице без сброса фильтров
function _refreshFavStars() {
  // Основная таблица результатов
  document.querySelectorAll('#tb tr[data-i]').forEach(tr => {
    const r = _visibleResults[+tr.dataset.i];
    if (!r) return;
    const starEl = tr.querySelector('[data-fav]');
    if (!starEl) return;
    const lvl = getFavLevel(r.name);
    starEl.textContent = lvl > 0 ? '★' : '☆';
    starEl.dataset.level = lvl;
  });
  // OOS таблица
  document.querySelectorAll('#oos-tb tr[data-i]').forEach(tr => {
    const r = _oosTableResults[+tr.dataset.i];
    if (!r) return;
    const starEl = tr.querySelector('[data-fav]');
    if (!starEl) return;
    const lvl = getFavLevel(r.name);
    starEl.textContent = lvl > 0 ? '★' : '☆';
    starEl.dataset.level = lvl;
    tr.classList.toggle('fav-row', lvl > 0);
  });
  if (_tableMode === 'fav') applyFilters(true);
}
function renderFavBar() { /* панель убрана — избранные доступны в таблице (вкладка Избранные) */ }
function toggleFavBody() {}
function removeFav(i) {
  favourites.splice(i,1);
  _saveFavsSync();
  renderFavBar();
  _refreshFavStars(); // не сбрасываем фильтры
}
function loadFavAsTpl(i) {
  const f = favourites[i];
  if (!f) return;
  // Показываем детальную карточку с настройками
  if (f.cfg) {
    // Строим объект результата из сохранённых данных
    const r = { name: f.name, cfg: f.cfg,
      pnl: f.stats.pnl||0, wr: f.stats.wr||0, n: f.stats.n||0,
      dd: f.stats.dd||0, pdd: f.stats.pdd||0, avg: f.stats.avg||0,
      p1: f.stats.p1||0, p2: f.stats.p2||0, c1: f.stats.c1||0,
      c2: f.stats.c2||0, dwr: f.stats.dwr||0,
      wrL: f.stats.wrL??null, wrS: f.stats.wrS??null,
      nL: f.stats.nL||0, nS: f.stats.nS||0, dwrLS: f.stats.dwrLS??null };
    showDetail(r);
  } else {
    alert('Нет сохранённых настроек для этого результата');
  }
}

// --- Climax exit visibility ---
// ── Неймспейс избранных ───────────────────────────────────────
// Позволяет хранить избранные для разных тикеров/ТФ одновременно.
// Пример: setFavNs('BTC_1h'), setFavNs('ETH_4h'), setFavNs('')
function setFavNs(ns) {
  _favNs = (ns || '').trim().replace(/[^a-zA-Z0-9_\-\.]/g, '_');
  localStorage.setItem('use6_fav_ns', _favNs);
  // Обновляем отображение
  const el = document.getElementById('fav-ns-label');
  if (el) el.textContent = _favNs ? ' [' + _favNs + ']' : '';
  _updateTableModeCounts();
  renderFavBar();
  _refreshFavStars();
  toast('📌 Неймспейс: ' + (_favNs || 'общий'), 1500);
}

function openNsModal() {
  // Собираем все существующие ns
  const allNs = [...new Set(favourites.map(f => f.ns||'').filter(Boolean))];
  const cur = _favNs;
  const items = [{ v:'', label:'общий (без метки)', cnt: favourites.filter(f=>!(f.ns||'')).length }]
    .concat(allNs.map(ns => ({ v:ns, label:ns, cnt: favourites.filter(f=>(f.ns||'')===ns).length })));
  
  let html = `<div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center" id="ns-overlay" onclick="if(event.target===this)closeNsModal()">
  <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:8px;padding:20px;min-width:320px;max-width:480px">
    <div style="font-size:.9em;font-weight:600;color:var(--accent);margin-bottom:12px">📌 Неймспейс избранных</div>
    <div style="font-size:.7em;color:var(--text3);margin-bottom:10px">Выбери или создай метку для текущего тикера/ТФ.<br>Избранные разных меток хранятся независимо.</div>
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px">`;
  
  for (const it of items) {
    const active = it.v === cur;
    html += `<div onclick="setFavNs('${it.v}');closeNsModal()"
      style="cursor:pointer;padding:6px 10px;border-radius:5px;border:1px solid ${active?'var(--accent)':'var(--border2)'};
             background:${active?'rgba(0,212,255,.1)':'var(--bg)'};display:flex;align-items:center;gap:8px">
      <span style="font-size:.75em;flex:1;color:${active?'var(--accent)':'var(--text)'}">${it.label || '(общий)'}</span>
      <span style="font-size:.65em;color:var(--text3)">${it.cnt} стратегий</span>
      ${active?'<span style="color:var(--accent);font-size:.8em">✓</span>':''}
    </div>`;
  }
  
  html += `</div>
    <div style="display:flex;gap:8px;align-items:center">
      <input id="ns-new-input" placeholder="Новая метка: BTC_1h" 
        style="flex:1;background:var(--bg);border:1px solid var(--border2);border-radius:4px;color:var(--text);font-size:.72em;padding:5px 8px;font-family:var(--font-mono)"
        onkeydown="if(event.key==='Enter')applyNsNew()">
      <button onclick="applyNsNew()"
        style="padding:4px 12px;background:rgba(0,212,255,.15);border:1px solid var(--accent);border-radius:4px;color:var(--accent);font-size:.72em;cursor:pointer">
        Создать
      </button>
    </div>
    <div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end">
      <button onclick="closeNsModal()" style="padding:4px 12px;background:var(--bg3);border:1px solid var(--border2);border-radius:4px;color:var(--text2);font-size:.72em;cursor:pointer">Закрыть</button>
    </div>
  </div></div>`;
  
  document.body.insertAdjacentHTML('beforeend', html);
}
function closeNsModal() { document.getElementById('ns-overlay')?.remove(); }
function applyNsNew() {
  const v = document.getElementById('ns-new-input')?.value?.trim();
  if (v) { setFavNs(v); closeNsModal(); }
}




function updateClxExitVisibility() {
  // Климакс-выход теперь только в панели объёма (f_clx)
  const cb = $('clx-cb');
  if (cb) cb.style.opacity = HAS_VOLUME ? '1' : '0.4';
}

// --- Confirm filter logic in backtest ---
// (injected into main backtest function via cfg.useConfirm, cfg.confN, cfg.confM)

// --- Escape key ---
document.addEventListener('keydown', e => {
  if (e.key==='Escape') { closeDetail(); closeTplModal(); closeRobustModal(); closeParseModal(); }
});
