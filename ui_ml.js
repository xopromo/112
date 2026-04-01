// ── ML Model Manager ──────────────────────────────────────────

// IndexedDB хранилище моделей
const _MLModelDB = (() => {
  const DB = 'use-ml-models', STORE = 'models';
  function open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = e => e.target.result.createObjectStore(STORE, { keyPath: 'id' });
      r.onsuccess = e => res(e.target.result);
      r.onerror   = e => rej(e.target.error);
    });
  }
  async function tx(mode, fn) {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(STORE, mode);
      t.onerror = e => rej(e.target.error);
      fn(t.objectStore(STORE), res, rej);
    });
  }
  return {
    save:   m  => tx('readwrite', (s, res) => { s.put(m).onsuccess = () => res(); }),
    load:   id => tx('readonly',  (s, res) => { s.get(id).onsuccess = e => res(e.target.result); }),
    list:   () => tx('readonly',  (s, res) => { s.getAll().onsuccess = e => res(
                  e.target.result.map(m => ({ id: m.id, name: m.name, auc: m.auc,
                    bars: m.bars, signals: m.signals, date: m.date }))); }),
    remove: id => tx('readwrite', (s, res) => { s.delete(id).onsuccess = () => res(); }),
  };
})();

// Состояние: ID активной модели ('__builtin__' = встроенная скомпилированная)
let _mlActiveId   = localStorage.getItem('_mlActiveId')   || '__builtin__';
let _mlActiveName = localStorage.getItem('_mlActiveName') || 'Встроенная';

// Активировать модель по коду JS (изолированное выполнение)
function _mlActivateCode(code) {
  try {
    const fn = new Function(code + '\nreturn typeof mlScore!=="undefined"?mlScore:null;');
    const scoreFn = fn();
    if (!scoreFn) throw new Error('mlScore not found');
    window.mlScore = scoreFn;
    if (typeof mlResetCache === 'function') mlResetCache();
    // Инвалидируем кеш ML-скоров при смене модели (opt.js)
    if (typeof _mlScoresArrCache     !== 'undefined') _mlScoresArrCache     = { arr: null, len: -1 };
    if (typeof _mlHighScoresArrCache !== 'undefined') _mlHighScoresArrCache = { arr: null, len: -1 };
    return true;
  } catch(e) {
    console.error('[ML activate]', e);
    return false;
  }
}

// Активировать модель из IndexedDB по id
async function _mlActivateById(id) {
  if (id === '__builtin__') {
    _mlActiveId = '__builtin__';
    _mlActiveName = 'Встроенная';
    localStorage.setItem('_mlActiveId', '__builtin__');
    localStorage.setItem('_mlActiveName', 'Встроенная');
    toast('Перезагрузите страницу чтобы восстановить встроенную модель', 3500);
    return true;
  }
  const model = await _MLModelDB.load(id);
  if (!model) { toast('Модель не найдена в БД', 2000); return false; }
  if (!_mlActivateCode(model.code)) { toast('⚠️ Ошибка загрузки модели', 2500); return false; }
  _mlActiveId   = id;
  _mlActiveName = model.name;
  localStorage.setItem('_mlActiveId',   id);
  localStorage.setItem('_mlActiveName', model.name);
  toast('✅ Модель активирована: ' + model.name, 2000);
  return true;
}

// Извлечь метаданные из заголовка model_generated.js
function _mlParseMeta(code) {
  const g = (re, def) => { const m = code.match(re); return m ? m[1] : def; };
  return {
    auc:     parseFloat(g(/AUC:\s*([\d.]+)/, '0')) || null,
    bars:    parseInt(g(/Баров:\s*(\d+)/, '0'))    || null,
    signals: parseInt(g(/Сигналов:\s*(\d+)/, '0')) || null,
  };
}

// Главный ML-модал (tab: 'models' | 'scan')
async function openMLModal(tab) {
  tab = tab || 'models';
  document.getElementById('ml-modal')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'ml-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;display:flex;align-items:center;justify-content:center';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);

  const box = document.createElement('div');
  box.style.cssText = 'background:var(--bg2,#1e1e2e);border:1px solid rgba(139,92,246,.45);border-radius:8px;padding:20px;width:min(640px,95vw);max-height:86vh;overflow-y:auto;color:var(--fg,#cdd6f4)';
  overlay.appendChild(box);

  const models   = await _MLModelDB.list();
  const activeId = _mlActiveId;
  const hasBuiltin = typeof mlScore === 'function';

  const hasBuiltinHigh = typeof mlScoreHigh === 'function';

  const tabBtn = (id, label) =>
    `<button onclick="openMLModal('${id}')" style="background:${tab===id?'rgba(139,92,246,.2)':'none'};border:1px solid ${tab===id?'rgba(139,92,246,.6)':'#444'};color:var(--fg,#cdd6f4);border-radius:4px;padding:4px 14px;cursor:pointer;font-size:.82em">${label}</button>`;

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <span style="font-weight:600">🤖 ML-модели</span>
      <button onclick="document.getElementById('ml-modal').remove()" style="background:none;border:none;color:var(--fg,#cdd6f4);cursor:pointer;font-size:1.2em">✕</button>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap">
      ${tabBtn('models','📉 Доньи')} ${tabBtn('tops','📈 Вершины')} ${tabBtn('scan','🔍 Скан')}
    </div>
    <div id="ml-modal-content">
      ${tab === 'models' ? _mlModelsTab(models, activeId, hasBuiltin)
        : tab === 'tops' ? _mlTopsTab(hasBuiltinHigh)
        : _mlScanTab()}
    </div>`;
}

function _mlModelsTab(models, activeId, hasBuiltin) {
  const hl = 'rgba(139,92,246,.15)';

  const builtinRow = `
    <tr style="background:${activeId==='__builtin__'?hl:''}">
      <td style="padding:6px 8px">${activeId==='__builtin__'?'●':'○'} Встроенная</td>
      <td style="padding:6px 8px;color:#888;font-size:.8em">${hasBuiltin?'загружена':'—'}</td>
      <td style="padding:6px 8px;text-align:center">—</td>
      <td style="padding:6px 8px;text-align:center">—</td>
      <td style="padding:6px 8px;text-align:right">
        ${activeId!=='__builtin__'
          ? `<button onclick="_mlActivateById('__builtin__').then(()=>openMLModal('models'))"
               style="font-size:.72em;padding:2px 8px;background:rgba(139,92,246,.15);border:1px solid rgba(139,92,246,.4);color:var(--fg,#cdd6f4);border-radius:4px;cursor:pointer">Активировать</button>`
          : `<span style="font-size:.7em;padding:2px 8px;background:rgba(139,92,246,.2);border:1px solid rgba(139,92,246,.5);border-radius:4px;color:#a78bfa">Активна</span>`}
      </td>
    </tr>`;

  const modelRows = models.map(m => `
    <tr style="background:${activeId===m.id?hl:''}">
      <td style="padding:6px 8px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${m.name}">${activeId===m.id?'●':'○'} ${m.name}</td>
      <td style="padding:6px 8px;color:#888;font-size:.8em">${m.date||'—'}</td>
      <td style="padding:6px 8px;text-align:center;color:${(m.auc||0)>=0.6?'#a6e3a1':(m.auc||0)>=0.55?'#f9e2af':'#888'}">${m.auc?m.auc.toFixed(3):'—'}</td>
      <td style="padding:6px 8px;text-align:center;color:#888;font-size:.8em">${m.bars?m.bars.toLocaleString():'—'}</td>
      <td style="padding:6px 8px;text-align:right;white-space:nowrap">
        ${activeId!==m.id
          ? `<button onclick="_mlActivateById('${m.id}').then(()=>openMLModal('models'))"
               style="font-size:.72em;padding:2px 8px;background:rgba(139,92,246,.15);border:1px solid rgba(139,92,246,.4);color:var(--fg,#cdd6f4);border-radius:4px;cursor:pointer;margin-right:4px">Активировать</button>`
          : `<span style="font-size:.7em;padding:2px 8px;background:rgba(139,92,246,.2);border:1px solid rgba(139,92,246,.5);border-radius:4px;color:#a78bfa;margin-right:4px">Активна</span>`}
        <button onclick="_mlDeleteModel('${m.id}')"
          style="font-size:.72em;padding:2px 6px;background:rgba(255,60,60,.1);border:1px solid rgba(255,60,60,.3);color:#f38ba8;border-radius:4px;cursor:pointer">🗑</button>
      </td>
    </tr>`).join('');

  return `
    <table style="width:100%;border-collapse:collapse;font-size:.82em;margin-bottom:16px">
      <thead>
        <tr style="color:#666;border-bottom:1px solid #333;font-size:.78em">
          <th style="padding:4px 8px;text-align:left">Название</th>
          <th style="padding:4px 8px;text-align:left">Загружена</th>
          <th style="padding:4px 8px;text-align:center">AUC</th>
          <th style="padding:4px 8px;text-align:center">Баров</th>
          <th style="padding:4px 8px"></th>
        </tr>
      </thead>
      <tbody>
        ${builtinRow}
        ${modelRows || '<tr><td colspan="5" style="padding:10px 8px;color:#555;font-size:.82em">Нет сохранённых моделей</td></tr>'}
      </tbody>
    </table>
    <div style="border-top:1px solid #333;padding-top:14px;display:flex;flex-direction:column;gap:12px">

      <div>
        <div style="font-size:.8em;font-weight:600;color:#a78bfa;margin-bottom:8px">▶ Обучить на текущих данных</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
          <label style="font-size:.78em;color:#888;display:flex;flex-direction:column;gap:3px">Название
            <input id="ml-train-name" type="text" placeholder="BTCUSDT 1H"
              style="padding:4px 7px;background:var(--bg3,#313244);border:1px solid #555;border-radius:4px;color:var(--fg,#cdd6f4);font-size:1em">
          </label>
          <label style="font-size:.78em;color:#888;display:flex;flex-direction:column;gap:3px">Деревьев
            <input id="ml-train-ntrees" type="number" value="100" min="20" max="400"
              style="padding:4px 7px;background:var(--bg3,#313244);border:1px solid #555;border-radius:4px;color:var(--fg,#cdd6f4);font-size:1em">
          </label>
          <label style="font-size:.78em;color:#888;display:flex;flex-direction:column;gap:3px">Глубина дерева
            <input id="ml-train-depth" type="number" value="5" min="2" max="8"
              style="padding:4px 7px;background:var(--bg3,#313244);border:1px solid #555;border-radius:4px;color:var(--fg,#cdd6f4);font-size:1em">
          </label>
          <label style="font-size:.78em;color:#888;display:flex;flex-direction:column;gap:3px">Баров обучения
            <input id="ml-train-bars" type="number" value="" placeholder="все"
              style="padding:4px 7px;background:var(--bg3,#313244);border:1px solid #555;border-radius:4px;color:var(--fg,#cdd6f4);font-size:1em">
          </label>
          <label style="font-size:.78em;color:#888;display:flex;flex-direction:column;gap:3px" title="Максимум баров ожидания результата">Горизонт (баров)
            <input id="ml-train-label" type="number" value="30" min="5" max="200"
              style="padding:4px 7px;background:var(--bg3,#313244);border:1px solid #555;border-radius:4px;color:var(--fg,#cdd6f4);font-size:1em">
          </label>
          <label style="font-size:.78em;color:#888;display:flex;flex-direction:column;gap:3px" title="TP: цена выросла на X% — метка=1 (прибыльный вход)">TP порог %
            <input id="ml-train-target" type="number" value="1.0" min="0.1" max="20" step="0.1"
              style="padding:4px 7px;background:var(--bg3,#313244);border:1px solid #555;border-radius:4px;color:var(--fg,#cdd6f4);font-size:1em">
          </label>
          <label style="font-size:.78em;color:#888;display:flex;flex-direction:column;gap:3px" title="SL: цена упала на X% — метка=0 (убыточный вход)">SL порог %
            <input id="ml-train-stop" type="number" value="0.5" min="0.1" max="20" step="0.1"
              style="padding:4px 7px;background:var(--bg3,#313244);border:1px solid #555;border-radius:4px;color:var(--fg,#cdd6f4);font-size:1em">
          </label>
        </div>
        <div style="font-size:.72em;color:#555;margin-bottom:8px">
          Метка=1 если цена достигла +TP% раньше чем -SL% в течение «горизонт» баров.
          Для 5min TF: TP=1%, SL=0.5%, горизонт=30. Для 1h TF: TP=3%, SL=1.5%, горизонт=20.
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <button onclick="_mlStartTraining()"
            style="padding:5px 18px;background:rgba(139,92,246,.25);border:1px solid rgba(139,92,246,.6);border-radius:4px;color:#a78bfa;cursor:pointer;font-size:.82em;font-weight:600">
            ⚡ Обучить
          </button>
          <div id="ml-train-status" style="font-size:.78em;color:#888"></div>
        </div>
        <div id="ml-train-bar-wrap" style="margin-top:8px;display:none">
          <div style="background:#333;border-radius:4px;height:6px;overflow:hidden">
            <div id="ml-train-bar" style="background:#7c3aed;height:100%;width:0%;transition:width .1s"></div>
          </div>
        </div>
      </div>

      <div style="border-top:1px solid #222;padding-top:12px">
        <div style="font-size:.78em;color:#666;margin-bottom:8px">Или загрузить готовую модель из файла
          <code style="color:#666">model_generated.js</code> (python3 ml/train.py)</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input id="ml-name-input" type="text" placeholder="Название"
            style="flex:1;min-width:120px;padding:5px 8px;background:var(--bg3,#313244);border:1px solid #555;border-radius:4px;color:var(--fg,#cdd6f4);font-size:.82em">
          <label style="cursor:pointer;padding:5px 12px;background:rgba(100,100,120,.15);border:1px solid #555;border-radius:4px;font-size:.82em;color:#888;white-space:nowrap">
            📂 Выбрать .js
            <input type="file" accept=".js" style="display:none" onchange="_mlHandleFile(this)">
          </label>
        </div>
      </div>

    </div>`;
}

function _mlTopsTab(hasBuiltinHigh) {
  return `
    <div style="font-size:.82em;color:#888;margin-bottom:10px">
      Модель вершин: <span style="color:#a78bfa">${hasBuiltinHigh ? '✅ загружена' : '—'}</span>
      ${!hasBuiltinHigh ? ' <span style="color:#f9e2af">Обучите модель ниже для коротких сигналов</span>' : ''}
    </div>
    <div style="font-size:.75em;color:#555;margin-bottom:12px;line-height:1.6">
      Обучает отдельную модель для <b>обнаружения вершин</b> (сигнал на шорт).<br>
      Использует зеркальные признаки: верхний хвост свечи, перекупленность RSI,
      цена выше EMA, бычья серия баров, наклон тренда вверх.<br>
      После обучения функция <code>mlScoreHigh()</code> используется для фильтрации шорт-входов.
    </div>

    <div style="font-size:.8em;font-weight:600;color:#a78bfa;margin-bottom:8px">▶ Методы разметки (что считать «хорошей вершиной»)</div>
    <div style="background:var(--bg3,#313244);border-radius:6px;padding:10px 12px;margin-bottom:10px;display:flex;flex-direction:column;gap:8px">

      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:.82em">
        <input type="checkbox" id="ml-high-m1" checked onchange="_mlTopsUpdateUI()">
        <span style="color:#cdd6f4">Метод 1: % падение</span>
        <span style="color:#555;margin-left:auto">цена упала на</span>
        <input id="ml-high-pct" type="number" value="2.0" min="0.1" max="30" step="0.1"
          style="width:55px;padding:2px 5px;background:var(--bg2,#1e1e2e);border:1px solid #555;border-radius:3px;color:var(--fg,#cdd6f4);font-size:.9em">
        <span style="color:#555">% в течение</span>
        <input id="ml-high-bars" type="number" value="20" min="5" max="200"
          style="width:48px;padding:2px 5px;background:var(--bg2,#1e1e2e);border:1px solid #555;border-radius:3px;color:var(--fg,#cdd6f4);font-size:.9em">
        <span style="color:#555">баров</span>
      </label>

      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:.82em">
        <input type="checkbox" id="ml-high-m2" onchange="_mlTopsUpdateUI()">
        <span style="color:#cdd6f4">Метод 2: ATR-падение</span>
        <span style="color:#555;margin-left:auto">упала на</span>
        <input id="ml-high-atr" type="number" value="2.0" min="0.1" max="20" step="0.1"
          style="width:55px;padding:2px 5px;background:var(--bg2,#1e1e2e);border:1px solid #555;border-radius:3px;color:var(--fg,#cdd6f4);font-size:.9em">
        <span style="color:#555">× ATR</span>
      </label>

      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:.82em">
        <input type="checkbox" id="ml-high-m3" onchange="_mlTopsUpdateUI()">
        <span style="color:#cdd6f4">Метод 3: структурный разрыв</span>
        <span style="color:#888;font-size:.9em">следующий пивот-лоу ниже предыдущего</span>
      </label>
    </div>

    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;font-size:.82em">
      <span style="color:#888">Комбинация методов:</span>
      <label style="display:flex;align-items:center;gap:4px;cursor:pointer;color:#cdd6f4">
        <input type="radio" name="ml-high-combine" value="or" checked> ИЛИ (OR) — хотя бы один
      </label>
      <label style="display:flex;align-items:center;gap:4px;cursor:pointer;color:#cdd6f4">
        <input type="radio" name="ml-high-combine" value="and"> И (AND) — все сразу
      </label>
    </div>

    <div style="font-size:.8em;font-weight:600;color:#a78bfa;margin-bottom:8px">▶ Параметры обучения</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
      <label style="font-size:.78em;color:#888;display:flex;flex-direction:column;gap:3px">Название
        <input id="ml-high-name" type="text" placeholder="TOPS BTC 1H"
          style="padding:4px 7px;background:var(--bg3,#313244);border:1px solid #555;border-radius:4px;color:var(--fg,#cdd6f4);font-size:1em">
      </label>
      <label style="font-size:.78em;color:#888;display:flex;flex-direction:column;gap:3px">Деревьев
        <input id="ml-high-ntrees" type="number" value="100" min="20" max="400"
          style="padding:4px 7px;background:var(--bg3,#313244);border:1px solid #555;border-radius:4px;color:var(--fg,#cdd6f4);font-size:1em">
      </label>
      <label style="font-size:.78em;color:#888;display:flex;flex-direction:column;gap:3px">Глубина дерева
        <input id="ml-high-depth" type="number" value="5" min="2" max="8"
          style="padding:4px 7px;background:var(--bg3,#313244);border:1px solid #555;border-radius:4px;color:var(--fg,#cdd6f4);font-size:1em">
      </label>
      <label style="font-size:.78em;color:#888;display:flex;flex-direction:column;gap:3px">Баров обучения
        <input id="ml-high-trainbars" type="number" value="" placeholder="все"
          style="padding:4px 7px;background:var(--bg3,#313244);border:1px solid #555;border-radius:4px;color:var(--fg,#cdd6f4);font-size:1em">
      </label>
    </div>

    <div style="display:flex;align-items:center;gap:10px">
      <button onclick="_mlStartTrainingHigh()"
        style="padding:5px 18px;background:rgba(139,92,246,.25);border:1px solid rgba(139,92,246,.6);border-radius:4px;color:#a78bfa;cursor:pointer;font-size:.82em;font-weight:600">
        ⚡ Обучить модель вершин
      </button>
      <div id="ml-high-status" style="font-size:.78em;color:#888"></div>
    </div>
    <div id="ml-high-bar-wrap" style="margin-top:8px;display:none">
      <div style="background:#333;border-radius:4px;height:6px;overflow:hidden">
        <div id="ml-high-bar" style="background:#7c3aed;height:100%;width:0%;transition:width .1s"></div>
      </div>
    </div>

    <div style="margin-top:14px;font-size:.72em;color:#555;line-height:1.5">
      Модель сохраняется в памяти браузера как <code>mlScoreHigh()</code>.<br>
      Чтобы использовать: в настройках стратегии включите <b>ML-фильтр шортов</b> (шорт-сторона требует mlScoreHigh ≥ порога).
    </div>`;
}

function _mlTopsUpdateUI() { /* placeholder — layout static */ }

async function _mlStartTrainingHigh() {
  if (typeof mlTrainHighInBrowser !== 'function') {
    toast('⚠️ Модуль обучения не загружен', 2500); return;
  }
  if (!DATA || DATA.length < 100) {
    toast('⚠️ Нет данных. Загрузите CSV.', 2500); return;
  }
  const nameEl = document.getElementById('ml-high-name');
  const name = nameEl?.value.trim();
  if (!name) { toast('Введите название модели', 2000); nameEl?.focus(); return; }

  const useMethodPct    = document.getElementById('ml-high-m1')?.checked ?? true;
  const useMethodAtr    = document.getElementById('ml-high-m2')?.checked ?? false;
  const useMethodStruct = document.getElementById('ml-high-m3')?.checked ?? false;
  if (!useMethodPct && !useMethodAtr && !useMethodStruct) {
    toast('⚠️ Выберите хотя бы один метод разметки', 2500); return;
  }

  const fallPct  = (parseFloat(document.getElementById('ml-high-pct')?.value)   || 2.0) / 100;
  const fallAtr  = parseFloat(document.getElementById('ml-high-atr')?.value)    || 2.0;
  const labelBars = parseInt(document.getElementById('ml-high-bars')?.value)    || 20;
  const nTrees   = parseInt(document.getElementById('ml-high-ntrees')?.value)   || 100;
  const depth    = parseInt(document.getElementById('ml-high-depth')?.value)    || 5;
  const nBars    = parseInt(document.getElementById('ml-high-trainbars')?.value)|| DATA.length;
  const combineMode = document.querySelector('input[name="ml-high-combine"]:checked')?.value || 'or';

  const statusEl = document.getElementById('ml-high-status');
  const barWrap  = document.getElementById('ml-high-bar-wrap');
  const barEl    = document.getElementById('ml-high-bar');
  const btn      = document.querySelector('[onclick="_mlStartTrainingHigh()"]');

  if (btn)     btn.disabled = true;
  if (barWrap) barWrap.style.display = 'block';
  if (statusEl) statusEl.textContent = 'Строим датасет вершин...';

  try {
    const result = await mlTrainHighInBrowser(
      { nTrees, maxDepth: depth, nBars, labelBars,
        useMethodPct, fallPct, useMethodAtr, fallAtr, useMethodStruct, combineMode },
      (frac, done, total, phase) => {
        if (barEl)    barEl.style.width = (frac * 100).toFixed(1) + '%';
        if (statusEl) statusEl.textContent =
          phase === 'dataset'  ? 'Строим датасет вершин...' :
          phase === 'training' ? `Обучение: дерево ${done}/${total}` : 'Готово';
      }
    );

    // Activate mlScoreHigh in current page context
    try {
      const fn = new Function(result.code + '\nreturn mlScoreHigh;');
      window.mlScoreHigh = fn();
    } catch(e) {
      console.warn('[mlTops] activate error', e);
    }

    // Save to DB with type marker
    const id = 'mlh_' + Date.now();
    await _MLModelDB.save({
      id, name: '📈 ' + name, code: result.code,
      auc: result.auc, bars: result.bars, signals: result.n,
      date: new Date().toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit', year:'2-digit' }),
    });

    const posPct = (100 * result.nPos / result.n).toFixed(0);
    const aucColor = result.auc >= 0.62 ? '✅' : result.auc >= 0.55 ? '⚠️' : '❌';
    toast(`${aucColor} Вершины «${name}» AUC=${result.auc.toFixed(3)} · сигналов=${result.n} · вершин=${posPct}%`, 4000);
    mlResetCache();
    await openMLModal('tops');

  } catch(e) {
    if (statusEl) statusEl.textContent = '⚠️ ' + e.message;
    if (btn) btn.disabled = false;
    console.error('[mlTrainHigh]', e);
  }
}

function _mlScanTab() {
  const activeLow  = typeof mlScore     === 'function';
  const activeHigh = typeof mlScoreHigh === 'function';
  // Check feature mismatch for lows model
  let featWarn = '';
  if (activeLow && typeof ML_FEAT_N !== 'undefined') {
    try {
      const dummy = new Float64Array(ML_FEAT_N);
      const r = mlScore(dummy);
      if (r === 0.5 && ML_FEAT_N !== 21) featWarn = `
        <div style="margin-top:6px;padding:5px 8px;background:rgba(249,226,175,.08);border:1px solid rgba(249,226,175,.3);border-radius:4px;font-size:.78em;color:#f9e2af">
          ⚠️ Модель доньев обучена на старых признаках. Перейдите в «📉 Доньи» → ⚡ Обучить заново.
        </div>`;
    } catch(e) {}
  }
  return `
    <div style="font-size:.82em;color:#888;margin-bottom:10px;display:flex;flex-wrap:wrap;gap:12px">
      <span>📉 Доньи: <span style="color:${activeLow?'#a78bfa':'#f38ba8'}">${activeLow?(_mlActiveName||'Встроенная'):'не загружена'}</span></span>
      <span>📈 Вершины: <span style="color:${activeHigh?'#a78bfa':'#555'}">${activeHigh?'загружена':'—'}</span></span>
    </div>
    ${featWarn}
    <div style="font-size:.75em;color:#555;margin-bottom:12px;line-height:1.5">
      Сканирует pivot-low/high сигналы и оценивает каждый по 33 признакам.
    </div>
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
      <label style="font-size:.82em;color:#aaa">Последних баров:</label>
      <input id="ml-scan-bars" type="number" value="500" min="50" max="50000"
        style="width:80px;padding:4px 6px;background:var(--bg3,#313244);border:1px solid #555;border-radius:4px;color:var(--fg,#cdd6f4);font-size:.82em">
      <button onclick="_mlRunScan('low')"
        style="padding:5px 14px;background:rgba(139,92,246,.2);border:1px solid rgba(139,92,246,.5);border-radius:4px;color:#a78bfa;cursor:pointer;font-size:.82em">
        📉 Доньи
      </button>
      <button onclick="_mlRunScan('high')"
        style="padding:5px 14px;background:rgba(139,92,246,.2);border:1px solid rgba(249,226,175,.4);border-radius:4px;color:#f9e2af;cursor:pointer;font-size:.82em">
        📈 Вершины
      </button>
    </div>
    <div id="ml-scan-results" style="font-size:.82em;color:#666">Нажмите кнопку для сканирования</div>`;
}

function _mlRunScan(type) {
  type = type || 'low';
  const isHigh = type === 'high';
  const res = document.getElementById('ml-scan-results');

  if (isHigh && typeof mlScoreHigh !== 'function') {
    res.innerHTML = '<span style="color:#f38ba8">⚠️ Модель вершин не загружена. Перейдите на вкладку «📈 Вершины» → ⚡ Обучить</span>';
    return;
  }
  if (!isHigh && typeof mlScore !== 'function') {
    res.innerHTML = '<span style="color:#f38ba8">⚠️ Модель доньев не загружена. Перейдите на вкладку «📉 Доньи» → ⚡ Обучить</span>';
    return;
  }
  if (!DATA || DATA.length < 50) {
    res.innerHTML = '<span style="color:#f38ba8">⚠️ Нет данных</span>';
    return;
  }
  const nBars = parseInt(document.getElementById('ml-scan-bars')?.value) || 500;
  res.innerHTML = '<span style="color:#888">Сканирование...</span>';

  setTimeout(() => {
    const results = isHigh ? mlScanHighSignals(nBars) : mlScanSignals(nBars);
    if (!results.length) { res.innerHTML = '<span style="color:#888">Сигналов не найдено</span>'; return; }

    const fmt = ts => {
      if (!ts) return '—';
      const d = new Date(ts * 1000);
      return d.toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit', year:'2-digit' });
    };
    const rows = results.slice(0, 50).map((r, i) => {
      const pct = (r.score * 100).toFixed(1);
      const col = r.score >= 0.65 ? '#a6e3a1' : r.score >= 0.5 ? '#f9e2af' : '#f38ba8';
      return `<tr>
        <td style="padding:3px 8px;color:#555">${i+1}</td>
        <td style="padding:3px 8px">${fmt(r.time)}</td>
        <td style="padding:3px 8px;text-align:right;color:#aaa">${r.close.toFixed(2)}</td>
        <td style="padding:3px 8px;text-align:right;color:${col};font-weight:600">${pct}%</td>
      </tr>`;
    }).join('');

    const label = isHigh ? 'вершин (📈 шорт-сигналов)' : 'доньев (📉 лонг-сигналов)';
    const hint  = isHigh
      ? '≥65% высокая вероятность значимого падения · <50% слабый сигнал'
      : '≥65% высокая · 50–65% средняя · <50% низкая вероятность прибыльного входа';
    res.innerHTML = `
      <div style="color:#666;margin-bottom:8px">Найдено: ${results.length} ${label} · топ-50 по ML-оценке</div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="color:#555;border-bottom:1px solid #333">
          <th style="padding:3px 8px;text-align:left">#</th>
          <th style="padding:3px 8px;text-align:left">Дата</th>
          <th style="padding:3px 8px;text-align:right">Цена</th>
          <th style="padding:3px 8px;text-align:right">ML-оценка</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="color:#555;margin-top:8px">${hint}</div>`;
  }, 20);
}

async function _mlStartTraining() {
  if (typeof mlTrainInBrowser !== 'function') {
    toast('⚠️ Модуль обучения не загружен', 2500); return;
  }
  if (!DATA || DATA.length < 100) {
    toast('⚠️ Нет данных. Загрузите CSV.', 2500); return;
  }
  const nameEl   = document.getElementById('ml-train-name');
  const name     = nameEl?.value.trim();
  if (!name) { toast('Введите название модели', 2000); nameEl?.focus(); return; }

  const nTrees    = parseInt(document.getElementById('ml-train-ntrees')?.value)  || 100;
  const depth     = parseInt(document.getElementById('ml-train-depth')?.value)   || 5;
  const labelBars = parseInt(document.getElementById('ml-train-label')?.value)   || 30;
  const nBars     = parseInt(document.getElementById('ml-train-bars')?.value)    || DATA.length;
  const targetPct = (parseFloat(document.getElementById('ml-train-target')?.value) || 1.0) / 100;
  const stopPct   = (parseFloat(document.getElementById('ml-train-stop')?.value)   || 0.5) / 100;

  const statusEl  = document.getElementById('ml-train-status');
  const barWrap   = document.getElementById('ml-train-bar-wrap');
  const barEl     = document.getElementById('ml-train-bar');
  const trainBtn  = document.querySelector('[onclick="_mlStartTraining()"]');

  if (trainBtn) trainBtn.disabled = true;
  if (barWrap)  barWrap.style.display = 'block';
  if (statusEl) statusEl.textContent = 'Строим датасет...';

  try {
    const result = await mlTrainInBrowser(
      { nTrees, maxDepth: depth, nBars, labelBars, targetPct, stopPct },
      (frac, done, total, phase) => {
        if (barEl)    barEl.style.width = (frac * 100).toFixed(1) + '%';
        if (statusEl) statusEl.textContent =
          phase === 'dataset'  ? 'Строим датасет...' :
          phase === 'training' ? `Обучение: дерево ${done}/${total}` :
                                 'Сохраняем...';
      }
    );

    const id = 'ml_' + Date.now();
    await _MLModelDB.save({
      id, name, code: result.code,
      auc: result.auc, bars: result.bars, signals: result.n,
      date: new Date().toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit', year:'2-digit' }),
    });

    // Activate immediately
    _mlActivateCode(result.code);
    _mlActiveId   = id;
    _mlActiveName = name;
    localStorage.setItem('_mlActiveId',   id);
    localStorage.setItem('_mlActiveName', name);

    const posPct = (100 * result.nPos / result.n).toFixed(0);
    const aucColor = result.auc >= 0.62 ? '✅' : result.auc >= 0.55 ? '⚠️' : '❌';
    toast(`${aucColor} «${name}» AUC=${result.auc.toFixed(3)} · сигналов=${result.n} · TP-доля=${posPct}%`, 4000);
    await openMLModal('models');

  } catch(e) {
    if (statusEl) statusEl.textContent = '⚠️ ' + e.message;
    if (trainBtn) trainBtn.disabled = false;
    console.error('[mlTrain]', e);
  }
}

async function _mlHandleFile(input) {
  const file = input.files[0];
  if (!file) return;
  const code = await file.text();
  const nameEl = document.getElementById('ml-name-input');
  const name = nameEl?.value.trim() || file.name.replace('.js','');
  if (!name) { toast('Введите название модели', 2000); return; }
  try {
    const fn = new Function(code + '\nreturn typeof mlScore!=="undefined"?mlScore:null;');
    if (!fn()) throw new Error('no mlScore');
  } catch(e) {
    toast('⚠️ Файл не является валидной моделью (нет функции mlScore)', 3000);
    return;
  }
  const meta = _mlParseMeta(code);
  const id = 'ml_' + Date.now();
  await _MLModelDB.save({
    id, name, code,
    auc: meta.auc, bars: meta.bars, signals: meta.signals,
    date: new Date().toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit', year:'2-digit' }),
  });
  toast('✅ Модель «' + name + '» сохранена', 2000);
  await openMLModal('models');
}

async function _mlDeleteModel(id) {
  if (!confirm('Удалить модель?')) return;
  await _MLModelDB.remove(id);
  if (_mlActiveId === id) {
    _mlActiveId = '__builtin__';
    _mlActiveName = 'Встроенная';
    localStorage.setItem('_mlActiveId', '__builtin__');
    localStorage.setItem('_mlActiveName', 'Встроенная');
  }
  await openMLModal('models');
}

// При старте — восстановить последнюю сохранённую модель из IndexedDB
(async () => {
  if (_mlActiveId && _mlActiveId !== '__builtin__') {
    const model = await _MLModelDB.load(_mlActiveId);
    if (model) _mlActivateCode(model.code);
  }
})();

// Алиас для обратной совместимости
function openMLScanModal() { openMLModal('scan'); }

// ─── ML Feature Screening ─────────────────────────────────────────────────

function _mlscrPearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return 0;
  let sx=0,sy=0,sx2=0,sy2=0,sxy=0;
  for(let i=0;i<n;i++){sx+=xs[i];sy+=ys[i];sx2+=xs[i]*xs[i];sy2+=ys[i]*ys[i];sxy+=xs[i]*ys[i];}
  const num=n*sxy-sx*sy, den=Math.sqrt((n*sx2-sx*sx)*(n*sy2-sy*sy));
  return den>0?num/den:0;
}

function _mlscrVariance(xs) {
  const n=xs.length; if(n<2)return 0;
  let s=0,s2=0; for(let i=0;i<n;i++){s+=xs[i];s2+=xs[i]*xs[i];}
  return s2/n-(s/n)*(s/n);
}

function _mlscrLinFit(ys, xs) {
  const n=xs.length; let sx=0,sy=0,sxy=0,sx2=0;
  for(let i=0;i<n;i++){sx+=xs[i];sy+=ys[i];sxy+=xs[i]*ys[i];sx2+=xs[i]*xs[i];}
  const d=n*sx2-sx*sx;
  if(Math.abs(d)<1e-12)return{slope:0,intercept:sy/n};
  const slope=(n*sxy-sx*sy)/d;
  return{slope,intercept:(sy-slope*sx)/n};
}

function _mlscrGreedyR2(trades, featDefs, scores) {
  const totalVar=_mlscrVariance(scores);
  if(totalVar<=0)return[];
  const res=scores.slice();
  const selected=[], remaining=featDefs.map(fd=>({...fd}));
  for(let step=0;step<Math.min(8,remaining.length);step++){
    let bestC=0,bestRi=-1;
    for(let ri=0;ri<remaining.length;ri++){
      const fv=trades.map(t=>t.feat[remaining[ri].idx]);
      const c=_mlscrPearson(fv,res);
      if(Math.abs(c)>Math.abs(bestC)){bestC=c;bestRi=ri;}
    }
    if(bestRi<0||Math.abs(bestC)<0.04)break;
    const fd=remaining.splice(bestRi,1)[0];
    const fv=trades.map(t=>t.feat[fd.idx]);
    const {slope,intercept}=_mlscrLinFit(res,fv);
    for(let i=0;i<res.length;i++)res[i]-=slope*fv[i]+intercept;
    const cumR2=Math.min(1,Math.max(0,1-_mlscrVariance(res)/totalVar));
    selected.push({...fd,stepC:bestC,cumR2});
    if(cumR2>=0.95)break;
  }
  return selected;
}

function _mlscrOptThresh(trades, featIdx, dir, scoreThresh) {
  if(dir===0)return{thresh:NaN,f1:0,prec:0,rec:0,blocked:0};
  const vals=trades.map(t=>t.feat[featIdx]);
  const scores=trades.map(t=>t.score);
  const sorted=[...vals].sort((a,b)=>a-b);
  let bestF1=-1,bestThresh=sorted[0],bestPrec=0,bestRec=0,bestBlocked=0;
  for(let qi=2;qi<=22;qi++){
    const thresh=sorted[Math.floor(sorted.length*qi/24)];
    let tp=0,fp=0,fn=0,tn=0;
    for(let i=0;i<trades.length;i++){
      const pass=dir>0?vals[i]>=thresh:vals[i]<=thresh;
      const good=scores[i]>=scoreThresh;
      if(pass&&good)tp++;else if(pass&&!good)fp++;else if(!pass&&good)fn++;else tn++;
    }
    const prec=tp+fp>0?tp/(tp+fp):0,rec=tp+fn>0?tp/(tp+fn):1;
    const f1=prec+rec>0?2*prec*rec/(prec+rec):0;
    if(rec>=0.65&&f1>bestF1){bestF1=f1;bestThresh=thresh;bestPrec=prec;bestRec=rec;bestBlocked=fp+tn;}
  }
  return{thresh:bestThresh,f1:bestF1,prec:bestPrec,rec:bestRec,blocked:bestBlocked};
}

function _mlscrPairSynergy(trades, topFeats, scores) {
  const n=topFeats.length, totalVar=_mlscrVariance(scores);
  const indR2=topFeats.map(fd=>{
    const fv=trades.map(t=>t.feat[fd.idx]);
    const c=_mlscrPearson(fv,scores);
    return c*c;
  });
  const matrix=[];
  for(let i=0;i<n;i++){
    matrix[i]=[];
    for(let j=0;j<n;j++){
      if(i===j){matrix[i][j]=null;continue;}
      const fi=trades.map(t=>t.feat[topFeats[i].idx]);
      const fj=trades.map(t=>t.feat[topFeats[j].idx]);
      const {slope:si,intercept:ii}=_mlscrLinFit(scores,fi);
      const res_i=scores.map((s,k)=>s-si*fi[k]-ii);
      const cj=_mlscrPearson(fj,res_i);
      matrix[i][j]=Math.max(0,cj*cj*(1-indR2[i]));
    }
  }
  return{matrix,indR2,topFeats};
}

async function _mlscrCompareBt(cfg, ind, topRules, mlThresh) {
  const N=DATA.length;
  // Run with full ML model
  const mlArr=new Float32Array(N).fill(-1);
  for(let i=52;i<N;i++){const f=mlComputeFeatures(i);if(f)try{mlArr[i]=mlScore(f);}catch(e){mlArr[i]=0.5;}}
  const btML=buildBtCfg({...cfg,useMLFilter:false},ind);
  btML.mlScoresArr=mlArr;btML.mlThreshold=mlThresh;
  const rML=backtest(ind.pvLo,ind.pvHi,ind.atrArr,btML);
  await new Promise(r=>setTimeout(r,0));
  // Run with simple rules
  const rulesArr=new Float32Array(N).fill(-1);
  const activeRules=topRules.filter(fd=>fd.dir!==0&&fd.optThresh&&!isNaN(fd.optThresh.thresh));
  for(let i=52;i<N;i++){
    const f=mlComputeFeatures(i);
    if(!f){rulesArr[i]=-1;continue;}
    let pass=true;
    for(const fd of activeRules){
      const v=f[fd.idx];
      if(fd.dir>0&&v<fd.optThresh.thresh){pass=false;break;}
      if(fd.dir<0&&v>fd.optThresh.thresh){pass=false;break;}
    }
    rulesArr[i]=pass?1.0:0.0;
  }
  const btRules=buildBtCfg({...cfg,useMLFilter:false},ind);
  btRules.mlScoresArr=rulesArr;btRules.mlThreshold=0.5;
  const rRules=backtest(ind.pvLo,ind.pvHi,ind.atrArr,btRules);
  return{rML,rRules};
}

function _mlscrRender({trades,sorted,greedy,synergy,rNoML,rML,rRules,topRules,ML_THRESH,srcCfg,srcR_name}) {
  const n=trades.length;
  const nGood=trades.filter(t=>t.score>=ML_THRESH).length;
  const cc=v=>{const a=Math.abs(v);return a>=0.3?(v>0?'pos':'neg'):a>=0.15?'warn':'muted';};
  const r2c=v=>v>=0.8?'pos':v>=0.55?'warn':'neg';
  const fmtN=(v,d=1)=>isNaN(v)?'—':v.toFixed(d);
  const pRow=(label,r,cls='')=>{
    if(!r)return'';
    const pdd=r.dd>0?r.pnl/r.dd:0;
    return`<tr style="border-top:1px solid var(--border)">
      <td style="padding:4px 8px" class="${cls}">${label}</td>
      <td style="padding:4px 8px;text-align:center">${r.n}</td>
      <td style="padding:4px 8px;text-align:center">${Math.round(r.wr)}%</td>
      <td style="padding:4px 8px;text-align:center;color:${r.pnl>=0?'var(--pos)':'var(--neg)'}">${r.pnl>=0?'+':''}${fmtN(r.pnl,0)}%</td>
      <td style="padding:4px 8px;text-align:center">${fmtN(r.dd,1)}%</td>
      <td style="padding:4px 8px;text-align:center" class="${pdd>=5?'pos':pdd>=2?'warn':'neg'}">${fmtN(pdd,1)}</td>
    </tr>`;
  };

  let h=`<div style="display:grid;gap:18px">`;

  // Header
  h+=`<div style="background:var(--bg2);border-radius:6px;padding:10px 14px;display:grid;gap:6px;font-size:.82em">
    <div style="color:var(--fg3);font-size:.78em">Анализируется результат:</div>
    <div style="color:var(--fg);font-size:.8em;word-break:break-all">${srcR_name||'—'}</div>
    <div style="display:flex;gap:20px;flex-wrap:wrap;margin-top:2px">
      <span>📊 Сделок: <b>${n}</b></span>
      <span>✅ Хороших (≥${Math.round(ML_THRESH*100)}%): <b>${nGood}</b> (${Math.round(nGood/n*100)}%)</span>
      <span>📈 Данных: <b>${DATA.length}</b> баров</span>
    </div>
  </div>`;

  // 1. Feature rankings
  h+=`<div><h3 style="font-size:.8em;color:var(--fg2);text-transform:uppercase;letter-spacing:.06em;margin:0 0 8px">① Ранжирование признаков</h3>
  <table style="width:100%;border-collapse:collapse;font-size:.8em">
  <thead><tr style="color:var(--fg3);font-size:.75em">
    <th style="text-align:left;padding:3px 8px">Признак</th>
    <th style="padding:3px 6px" title="Корреляция с ML-оценкой">Corr(ML)</th>
    <th style="padding:3px 6px" title="Корреляция с реальным PnL сделки">Corr(PnL)</th>
    <th style="padding:3px 6px">Знак</th>
    <th style="padding:3px 6px">Порог</th>
    <th style="padding:3px 6px" title="% сделок заблокированных этим правилом">Блок%</th>
    <th style="padding:3px 6px" title="F1-мера правила">F1</th>
  </tr></thead><tbody>`;
  for(const fd of sorted){
    const t=fd.optThresh;
    const sign=fd.dir===0?'±':fd.dir>0?'≥':'≤';
    const blPct=n>0?Math.round(t.blocked/n*100):0;
    h+=`<tr style="border-top:1px solid var(--border)">
      <td style="padding:3px 8px" title="${fd.hint}">${fd.label}</td>
      <td style="padding:3px 6px;text-align:center" class="${cc(fd.corrScore)}">${(fd.corrScore>=0?'+':'')+fmtN(fd.corrScore,2)}</td>
      <td style="padding:3px 6px;text-align:center" class="${cc(fd.corrPnl)}">${(fd.corrPnl>=0?'+':'')+fmtN(fd.corrPnl,2)}</td>
      <td style="padding:3px 6px;text-align:center;color:var(--fg2)">${fd.dir===0?'±':sign}</td>
      <td style="padding:3px 6px;text-align:center;font-family:monospace">${fd.dir===0?'—':fmtN(t.thresh,3)}</td>
      <td style="padding:3px 6px;text-align:center;color:var(--fg2)">${fd.dir===0?'—':blPct+'%'}</td>
      <td style="padding:3px 6px;text-align:center" class="${t.f1>=0.7?'pos':t.f1>=0.5?'warn':'neg'}">${fd.dir===0?'—':fmtN(t.f1,2)}</td>
    </tr>`;
  }
  h+=`</tbody></table></div>`;

  // 2. Greedy R²
  h+=`<div><h3 style="font-size:.8em;color:var(--fg2);text-transform:uppercase;letter-spacing:.06em;margin:0 0 8px">② Жадный отбор — сколько признаков нужно</h3>
  <table style="width:100%;border-collapse:collapse;font-size:.8em">
  <thead><tr style="color:var(--fg3);font-size:.75em">
    <th style="padding:3px 6px">#</th>
    <th style="text-align:left;padding:3px 8px">Признак</th>
    <th style="padding:3px 6px">+R²</th>
    <th style="padding:3px 6px">Кум. R²</th>
    <th style="padding:3px 6px">Покрытие</th>
    <th style="text-align:left;padding:3px 8px">Правило</th>
  </tr></thead><tbody>`;
  let prevR2=0;
  for(let i=0;i<greedy.length;i++){
    const g=greedy[i];
    const stepR2=g.cumR2-prevR2;
    const hit90=g.cumR2>=0.90&&prevR2<0.90;
    const hit80=g.cumR2>=0.80&&prevR2<0.80;
    const hl=hit90?'background:rgba(100,220,130,.07)':hit80?'background:rgba(220,180,50,.05)':'';
    const sign=g.dir===0?'':g.dir>0?'≥':'≤';
    const thresh=g.dir===0?'—':(g.optThresh&&!isNaN(g.optThresh.thresh)?`${sign} ${fmtN(g.optThresh.thresh,3)}`:'—');
    h+=`<tr style="border-top:1px solid var(--border);${hl}">
      <td style="padding:3px 6px;text-align:center;color:var(--fg3)">${i+1}</td>
      <td style="padding:3px 8px">${g.label}${hit90?' <span style="color:var(--pos);font-size:.75em">← 90%</span>':hit80?' <span style="color:var(--warn);font-size:.75em">← 80%</span>':''}</td>
      <td style="padding:3px 6px;text-align:center;color:var(--pos)">+${(stepR2*100).toFixed(1)}%</td>
      <td style="padding:3px 6px;text-align:center" class="${r2c(g.cumR2)}"><b>${(g.cumR2*100).toFixed(1)}%</b></td>
      <td style="padding:3px 6px;min-width:80px">
        <div style="background:var(--border);border-radius:3px;height:5px">
          <div style="background:var(--pos);border-radius:3px;height:5px;width:${(g.cumR2*100).toFixed(0)}%"></div>
        </div>
      </td>
      <td style="padding:3px 8px;font-family:monospace;font-size:.82em;color:var(--fg2)">${thresh}</td>
    </tr>`;
    prevR2=g.cumR2;
  }
  h+=`</tbody></table></div>`;

  // 3. Pairwise synergy
  const{matrix,indR2,topFeats}=synergy;
  h+=`<div><h3 style="font-size:.8em;color:var(--fg2);text-transform:uppercase;letter-spacing:.06em;margin:0 0 4px">③ Синергия пар (топ-5)</h3>
  <p style="font-size:.75em;color:var(--fg3);margin:0 0 8px">Прирост R² при добавлении столбца к строке. Зелёный = взаимодополняющие.</p>
  <table style="border-collapse:collapse;font-size:.78em">
  <thead><tr><th style="padding:3px 6px"></th>`;
  for(const fd of topFeats)h+=`<th style="padding:3px 8px;color:var(--fg2);font-size:.82em;max-width:90px;overflow:hidden;white-space:nowrap" title="${fd.label}">${fd.label.substring(0,11)}</th>`;
  h+=`</tr></thead><tbody>`;
  for(let i=0;i<topFeats.length;i++){
    h+=`<tr><td style="padding:3px 8px;color:var(--fg2);font-size:.82em;white-space:nowrap" title="${topFeats[i].label}">${topFeats[i].label.substring(0,11)}</td>`;
    for(let j=0;j<topFeats.length;j++){
      if(i===j){h+=`<td style="padding:3px 8px;text-align:center;color:var(--fg3)">—</td>`;}
      else{
        const v=matrix[i][j];
        const cls=v>=0.08?'pos':v>=0.03?'warn':'muted';
        h+=`<td style="padding:3px 8px;text-align:center" class="${cls}">+${(v*100).toFixed(0)}%</td>`;
      }
    }
    h+=`</tr>`;
  }
  h+=`</tbody></table></div>`;

  // 4. Comparison
  const ruleNames=topRules.filter(r=>r.dir!==0).map(r=>r.label.substring(0,10)).join(', ');
  const nRules=topRules.filter(r=>r.dir!==0).length;
  let covTxt='';
  if(rML&&rNoML&&rRules){
    const mlGain=rML.pnl-rNoML.pnl;
    const rulesGain=rRules.pnl-rNoML.pnl;
    if(mlGain>0.5){
      const cov=Math.round(rulesGain/mlGain*100);
      const verdict=cov>=85?' ✅ гипотеза подтверждена':cov>=65?' ⚠️ частично':' ❌ недостаточно';
      covTxt=`<tr><td colspan="6" style="padding:6px 8px;font-size:.8em;color:var(--fg2);border-top:2px solid var(--border)">
        💡 <b>${nRules} простых правил</b> дают <b style="color:${cov>=85?'var(--pos)':cov>=65?'var(--warn)':'var(--neg)'}">${cov}%</b> эффекта ML по приросту PnL${verdict}
      </td></tr>`;
    }
  }
  h+=`<div><h3 style="font-size:.8em;color:var(--fg2);text-transform:uppercase;letter-spacing:.06em;margin:0 0 8px">④ Сравнение подходов (полные данные)</h3>
  <table style="width:100%;border-collapse:collapse;font-size:.8em">
  <thead><tr style="color:var(--fg3);font-size:.75em">
    <th style="text-align:left;padding:3px 8px">Подход</th>
    <th style="padding:3px 6px">Сделок</th>
    <th style="padding:3px 6px">WR%</th>
    <th style="padding:3px 6px">PnL%</th>
    <th style="padding:3px 6px">DD%</th>
    <th style="padding:3px 6px">P/DD</th>
  </tr></thead><tbody>
  ${pRow('Без фильтра',rNoML)}
  ${pRow('ML модель',rML,'pos')}
  ${pRow(`${nRules} правил (${ruleNames})`,rRules,'warn')}
  ${covTxt}
  </tbody></table></div>`;

  h+=`</div>`;
  return h;
}

async function runMLFeatureScreening() {
  const modal=$('ml-screening-modal');
  const body=$('ml-screening-body');
  if(!modal)return;
  if(typeof mlModelLoaded!=='function'||!mlModelLoaded()){
    body.innerHTML='<p style="color:var(--neg);padding:20px">❌ ML модель не загружена. Сначала загрузите модель в разделе ML.</p>';
    modal.style.display='flex';return;
  }
  if(!DATA||DATA.length<100){
    body.innerHTML='<p style="color:var(--neg);padding:20px">❌ Нет данных.</p>';
    modal.style.display='flex';return;
  }
  body.innerHTML='<div style="text-align:center;padding:60px;color:var(--fg2)">⏳ Собираю точки входа и вычисляю ML признаки…</div>';
  modal.style.display='flex';
  await new Promise(r=>setTimeout(r,20));
  try{
    // Get cfg from selected result or first visible
    const srcR=_tvCmpCurrentResult??_visibleResults?.[0]??null;
    if(!srcR?.cfg){
      body.innerHTML='<p style="color:var(--warn);padding:20px">⚠️ Нет выбранного результата. Нажмите на строку результата чтобы открыть детали, затем запустите скрининг кнопкой внизу панели.</p>';
      return;
    }
    // Показываем имя результата сразу чтобы пользователь видел что анализируется
    body.innerHTML=`<div style="text-align:center;padding:40px;color:var(--fg2)">
      ⏳ Анализирую: <b style="color:var(--fg)">${(srcR.name||'результат').substring(0,80)}</b><br>
      <small style="color:var(--fg3)">Собираю точки входа и вычисляю ML признаки…</small>
    </div>`;
    await new Promise(r=>setTimeout(r,20));
    const cfg={...srcR.cfg,useMLFilter:false};
    // Run backtest on full DATA without ML filter, collect trade entries + pnl
    const ind=_calcIndicators(cfg);
    const btCfg=buildBtCfg(cfg,ind);
    btCfg.useMLFilter=false;btCfg.collectTrades=true;btCfg.tradeLog=[];
    const rNoML=backtest(ind.pvLo,ind.pvHi,ind.atrArr,btCfg);
    const trLog=btCfg.tradeLog||[];
    const trPnl=rNoML?.tradePnl||[];
    const nMin=Math.min(trLog.length,trPnl.length);
    if(nMin<15){
      body.innerHTML=`<p style="color:var(--neg);padding:20px">❌ Мало сделок (${nMin}). Нужно ≥ 15. Выберите результат с большим количеством сделок.</p>`;
      return;
    }
    // Compute features + scores per trade entry
    const trades=[];
    for(let ti=0;ti<nMin;ti++){
      const t=trLog[ti];
      const feat=mlComputeFeatures(t.entryBar);
      if(!feat)continue;
      let score;try{score=mlScore(feat);}catch(e){continue;}
      if(isNaN(score))continue;
      trades.push({bar:t.entryBar,dir:t.dir,feat,score,pnl:trPnl[ti]??0});
    }
    if(trades.length<10){
      body.innerHTML=`<p style="color:var(--neg);padding:20px">❌ Недостаточно точек (${trades.length}) после вычисления признаков (нужно bar≥52).</p>`;
      return;
    }
    await new Promise(r=>setTimeout(r,0));
    const ML_THRESH=parseFloat($('c_ml_thresh')?.value)||0.55;
    const FDEFS=[
      {id:'wick',  label:'Нижний хвост/ATR', idx:26,dir:+1,hint:'Сила отбоя на пивоте (выше → лучше для лонга)'},
      {id:'rsi',   label:'RSI(14)',           idx:23,dir:-1,hint:'Перепроданность (ниже → лучше)'},
      {id:'chan',  label:'Позиция в канале',   idx:30,dir:-1,hint:'0=дно 20-бар канала, 1=вершина'},
      {id:'ema50', label:'Откат EMA50/ATR',    idx:25,dir:+1,hint:'Насколько цена ниже EMA50 (>0 = ниже EMA)'},
      {id:'ema20', label:'Откат EMA20/ATR',    idx:24,dir:+1,hint:'Насколько цена ниже EMA20'},
      {id:'body',  label:'Тело пивота/ATR',    idx:27,dir:-1,hint:'Меньше тело → молоткообразная свеча'},
      {id:'streak',label:'Серия падений/10',   idx:29,dir:+1,hint:'Подряд медвежьих закрытий (капитуляция)'},
      {id:'er',    label:'Eff.Ratio (10б)',    idx:20,dir:-1,hint:'Ниже ER → более разворотный рынок'},
      {id:'atr_r', label:'ATR режим',          idx:28,dir: 0,hint:'Текущий ATR vs 50-бар среднего (нелинейный)'},
      {id:'slope', label:'Наклон LR(20)/ATR',  idx:31,dir:-1,hint:'Отрицательный наклон → нисходящий тренд'},
      {id:'bb_w',  label:'Ширина BB',          idx:32,dir:+1,hint:'Шире → расширение, уже → сжатие'},
      {id:'vol',   label:'Объём/средний(20)',  idx:21,dir:+1,hint:'> 1 = объём выше среднего'},
    ];
    // Correlations
    const scoreArr=trades.map(t=>t.score);
    const pnlArr=trades.map(t=>t.pnl);
    for(const fd of FDEFS){
      const fv=trades.map(t=>t.feat[fd.idx]);
      fd.corrScore=_mlscrPearson(fv,scoreArr);
      fd.corrPnl=_mlscrPearson(fv,pnlArr);
      fd.optThresh=_mlscrOptThresh(trades,fd.idx,fd.dir,ML_THRESH);
    }
    const sorted=[...FDEFS].sort((a,b)=>Math.abs(b.corrScore)-Math.abs(a.corrScore));
    const greedy=_mlscrGreedyR2(trades,FDEFS,scoreArr);
    // Top features for synergy + comparison (up to first ≥90% R², min 3, max 6)
    let topN=greedy.findIndex(g=>g.cumR2>=0.90);
    if(topN<0)topN=greedy.length;else topN++;
    topN=Math.max(3,Math.min(6,topN));
    const topRules=greedy.slice(0,topN);
    const synergy=_mlscrPairSynergy(trades,sorted.slice(0,5),scoreArr);
    body.innerHTML='<div style="text-align:center;padding:40px;color:var(--fg2)">⏳ Запускаю сравнительные бэктесты…</div>';
    await new Promise(r=>setTimeout(r,0));
    const{rML,rRules}=await _mlscrCompareBt(cfg,ind,topRules,ML_THRESH);
    body.innerHTML=_mlscrRender({trades,sorted,greedy,synergy,rNoML,rML,rRules,topRules,ML_THRESH,srcCfg:srcR.cfg,srcR_name:srcR.name||''});
  }catch(e){
    console.error('[MLScreening]',e);
    body.innerHTML=`<div style="color:var(--neg);padding:20px">❌ Ошибка: ${e.message}</div>`;
  }
}
try{window.runMLFeatureScreening=runMLFeatureScreening;}catch(e){}

