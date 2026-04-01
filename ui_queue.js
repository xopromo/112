// ══════════════════════════════════════════════════════════════════
// ── ОЧЕРЕДЬ ЗАДАЧ TPE ─────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

const _QUEUE_LS_KEY    = 'use_queue_tasks_v1';
const _SERIES_LS_KEY   = 'use_queue_series_v1';
let   _queueRunning    = false;
let   _queueStopFlag   = false;
let   _queueUnchecked  = new Set(); // IDs задач, снятых с чекбокса
let   _queueEditId     = null;      // ID редактируемой задачи (null = добавление)

// ── Снапшот текущего состояния DOM ────────────────────────────────
// Фильтры таблицы результатов — НЕ сохранять в снапшот очереди.
// Они не относятся к параметрам оптимизации и ломают таблицу при восстановлении:
// snapshot восстанавливает f_tv_score/f_rob/etc., applyFilters фильтрует новые
// результаты без OOS-данных → всё исчезает.
const _QUEUE_SNAP_EXCLUDE = new Set([..._TF_NUM_IDS, ..._TF_SEL_IDS]);

function _queueSnapshot() {
  const inputs = {}, checks = {};
  document.querySelectorAll('input[id], select[id]').forEach(el => {
    if (!el.id) return;
    if (el.type === 'checkbox' || el.type === 'radio') {
      if (!_QUEUE_SNAP_EXCLUDE.has(el.id)) checks[el.id] = el.checked;
    } else if (el.type !== 'file') {
      // Не сохранять пустые поля — экономим место в localStorage
      // Не сохранять фильтры таблицы — они слетают при восстановлении снапшота
      // Не сохранять file-инпуты — браузер запрещает читать/писать их value
      if (el.value !== '' && !_QUEUE_SNAP_EXCLUDE.has(el.id)) inputs[el.id] = el.value;
    }
  });
  return {
    optMode: typeof optMode !== 'undefined' ? optMode : 'tpe',
    inputs,
    checks
  };
}

// ── Восстановить снапшот в DOM ────────────────────────────────────
function _queueRestore(snap) {
  if (!snap) return;
  if (snap.optMode && typeof setOptMode === 'function') setOptMode(snap.optMode);
  Object.entries(snap.inputs || {}).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el && el.tagName !== 'BUTTON' && el.type !== 'file') el.value = val;
  });
  Object.entries(snap.checks || {}).forEach(([id, checked]) => {
    const el = document.getElementById(id);
    if (el && (el.type === 'checkbox' || el.type === 'radio')) el.checked = checked;
  });
  // Применяем срез баров из снапшота (c_maxbars влияет на DATA/DATA_1M)
  if (typeof applyMaxBars === 'function') applyMaxBars();
  if (typeof updatePreview === 'function') updatePreview();
}

// ── localStorage helpers ──────────────────────────────────────────
// ── IndexedDB backend (задачи + серии) ───────────────────────────
// Кардинальная замена localStorage (~5MB) → IndexedDB (~GB).
// Синхронный API сохраняется через in-memory кэши (_tasksCache, _seriesCache).
// IndexedDB: запись async (fire-and-forget), чтение — из кэша (мгновенно).
let _tasksCache  = [];
let _seriesCache = [];
let _idb         = null;  // null = IDB недоступен, fallback на localStorage

async function _idbInit() {
  try {
    _idb = await new Promise((res, rej) => {
      const req = indexedDB.open('use_optimizer_v1', 1);
      req.onupgradeneeded = e => {
        if (!e.target.result.objectStoreNames.contains('blobs'))
          e.target.result.createObjectStore('blobs', { keyPath: 'k' });
      };
      req.onsuccess = e => res(e.target.result);
      req.onerror   = e => rej(e.target.error);
    });
    const _idbGet = k => new Promise((res, rej) => {
      const req = _idb.transaction('blobs','readonly').objectStore('blobs').get(k);
      req.onsuccess = e => res(e.target.result?.v ?? null);
      req.onerror   = e => rej(e.target.error);
    });
    // Однократная миграция из localStorage → IDB
    const lsTasks  = localStorage.getItem(_QUEUE_LS_KEY);
    const lsSeries = localStorage.getItem(_SERIES_LS_KEY);
    if (lsTasks  !== null) { await _idbWrite('tasks',  JSON.parse(lsTasks  || '[]')); localStorage.removeItem(_QUEUE_LS_KEY); }
    if (lsSeries !== null) { await _idbWrite('series', JSON.parse(lsSeries || '[]')); localStorage.removeItem(_SERIES_LS_KEY); }
    _tasksCache  = (await _idbGet('tasks'))  || [];
    _seriesCache = (await _idbGet('series')) || [];
    // Обновляем UI если панель уже открыта
    if (document.getElementById('queue-panel')?.style.display  !== 'none') renderQueueTaskList();
    if (document.getElementById('series-panel')?.style.display !== 'none') renderSeriesList();
  } catch(e) {
    console.warn('[_idbInit] IndexedDB недоступен, fallback на localStorage:', e);
    _idb = null;
    try { _tasksCache  = JSON.parse(localStorage.getItem(_QUEUE_LS_KEY)  || '[]'); } catch(_) {}
    try { _seriesCache = JSON.parse(localStorage.getItem(_SERIES_LS_KEY) || '[]'); } catch(_) {}
  }
}

function _idbWrite(key, val) {
  if (!_idb) {
    // localStorage fallback
    try { localStorage.setItem(key === 'tasks' ? _QUEUE_LS_KEY : _SERIES_LS_KEY, JSON.stringify(val)); } catch(_) {}
    return Promise.resolve();
  }
  return new Promise((res, rej) => {
    const tx = _idb.transaction('blobs', 'readwrite');
    tx.objectStore('blobs').put({ k: key, v: val });
    tx.oncomplete = () => res();
    tx.onerror    = e => rej(e.target.error);
  });
}

function _queueLoadTasks()    { return _tasksCache; }
function _queueSaveTasks(arr) {
  _tasksCache = arr;
  _idbWrite('tasks', arr).catch(e => console.error('[_queueSaveTasks] IDB:', e));
  return true;
}
function _seriesLoad()    { return _seriesCache; }
function _seriesSave(arr) {
  _seriesCache = arr;
  _idbWrite('series', arr).catch(e => console.error('[_seriesSave] IDB:', e));
  return true;
}

// ── Сгенерировать краткое описание снапшота ───────────────────────
function _queueSnapDesc(snap) {
  if (!snap) return '';
  const mode = snap.optMode || '?';
  const target = (snap.inputs || {})['tpe_target'] || '';
  const maxIter = (snap.inputs || {})['tpe_n'] || '';
  return `Режим: ${mode}` + (target ? ` · Цель: ${target}` : '') + (maxIter ? ` · Макс: ${maxIter}` : '');
}

// ── UI: показать/скрыть панель ────────────────────────────────────
function toggleQueuePanel() {
  const p = document.getElementById('queue-panel');
  if (!p) return;
  const open = p.style.display !== 'none';
  p.style.display = open ? 'none' : 'block';
  if (!open) renderQueueTaskList();
}

function toggleSeriesPanel() {
  const p = document.getElementById('series-panel');
  if (!p) return;
  p.style.display = p.style.display === 'none' ? 'block' : 'none';
  if (p.style.display !== 'none') renderSeriesList();
}

// ── Добавить задачу (открыть форму) ──────────────────────────────
function queueAddCurrent() {
  _queueEditId = null;
  const form = document.getElementById('queue-add-form');
  if (!form) return;
  form.style.display = 'block';
  const titleEl = document.getElementById('queue-form-title');
  if (titleEl) titleEl.textContent = '+ Добавить задачу';
  const prev = document.getElementById('queue-task-preview');
  if (prev) prev.textContent = 'Параметры сохранятся при нажатии ✓ Сохранить';
  document.getElementById('queue-task-name')?.focus();
}

// ── Закрыть форму (отмена) ────────────────────────────────────────
function queueCancelForm() {
  _queueEditId = null;
  const form = document.getElementById('queue-add-form');
  if (form) form.style.display = 'none';
}

// ── Редактировать существующую задачу ─────────────────────────────
function queueEditTask(id) {
  const tasks = _queueLoadTasks();
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  _queueEditId = id;
  _queueRestore(task.snapshot);
  const form = document.getElementById('queue-add-form');
  if (!form) return;
  form.style.display = 'block';
  const titleEl = document.getElementById('queue-form-title');
  if (titleEl) titleEl.textContent = '✏ Редактирование: ' + task.name;
  const nameEl = document.getElementById('queue-task-name');
  const repsEl = document.getElementById('queue-task-repeats');
  if (nameEl) nameEl.value = task.name;
  if (repsEl) repsEl.value = task.repeats;
  const prev = document.getElementById('queue-task-preview');
  if (prev) prev.textContent = 'Параметры восстановлены. Измени что нужно и нажми ✓ Сохранить';
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  nameEl?.focus();
}

function queueDuplicateTask(id) {
  const tasks = _queueLoadTasks();
  const idx = tasks.findIndex(t => t.id === id);
  if (idx < 0) return;
  const src = tasks[idx];
  // Deep copy snapshot so original and copy are fully independent
  const copy = JSON.parse(JSON.stringify({ ...src, id: Date.now() + Math.random(), name: src.name + ' (копия)' }));
  tasks.splice(idx + 1, 0, copy);
  _queueSaveTasks(tasks);
  renderQueueTaskList();
}

// ── Вспомогательные: чекбоксы задач ──────────────────────────────
function queueToggleCheck(id, checked) {
  if (checked) _queueUnchecked.delete(id);
  else _queueUnchecked.add(id);
  renderQueueTaskList();
}

function queueCheckAll(checked) {
  if (checked) {
    _queueUnchecked.clear();
  } else {
    _queueLoadTasks().forEach(t => _queueUnchecked.add(t.id));
  }
  renderQueueTaskList();
}

// Возвращает только отмеченные (активные) задачи
function _queueGetActive() {
  return _queueLoadTasks().filter(t => !_queueUnchecked.has(t.id));
}

// ── Сохранить задачу из формы (добавление или редактирование) ────
function queueSaveTask() {
  const snap    = _queueSnapshot(); // снапшот берётся здесь — в момент сохранения!
  const name    = (document.getElementById('queue-task-name')?.value || '').trim() || ('Задача ' + (_queueLoadTasks().length + 1));
  const repeats = Math.max(1, parseInt(document.getElementById('queue-task-repeats')?.value) || 1);
  let tasks = _queueLoadTasks();

  if (_queueEditId !== null) {
    const idx = tasks.findIndex(t => t.id === _queueEditId);
    if (idx >= 0) tasks[idx] = { ...tasks[idx], name, repeats, snapshot: snap };
    _queueEditId = null;
  } else {
    tasks.push({ id: Date.now() + Math.random(), name, repeats, snapshot: snap });
  }
  _queueSaveTasks(tasks);

  document.getElementById('queue-add-form').style.display = 'none';
  document.getElementById('queue-task-name').value = '';
  const titleEl = document.getElementById('queue-form-title');
  if (titleEl) titleEl.textContent = '+ Добавить задачу';
  renderQueueTaskList();
}

// ── Удалить задачу ────────────────────────────────────────────────
function queueDeleteTask(id) {
  _queueUnchecked.delete(id);
  _queueSaveTasks(_queueLoadTasks().filter(t => t.id !== id));
  renderQueueTaskList();
}

// ── Переместить задачу вверх/вниз ────────────────────────────────
function queueMoveTask(id, dir) {
  const tasks = _queueLoadTasks();
  const idx   = tasks.findIndex(t => t.id === id);
  if (idx < 0) return;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= tasks.length) return;
  [tasks[idx], tasks[newIdx]] = [tasks[newIdx], tasks[idx]];
  _queueSaveTasks(tasks);
  renderQueueTaskList();
}

// ── Очистить всю очередь ─────────────────────────────────────────
function queueClearAll() {
  if (!confirm('Очистить всю очередь задач?')) return;
  _queueSaveTasks([]);
  renderQueueTaskList();
}

// ── Отрисовать список задач ───────────────────────────────────────
function renderQueueTaskList() {
  const el = document.getElementById('queue-task-list');
  if (!el) return;
  const tasks = _queueLoadTasks();
  if (tasks.length === 0) {
    el.innerHTML = '<div style="color:var(--text3);text-align:center;padding:10px">Очередь пуста — нажми «+ Задача» чтобы добавить</div>';
    return;
  }
  const selRow = `<div style="display:flex;gap:2px;padding:0 2px;margin-bottom:2px">
    <button onclick="queueCheckAll(true)"  style="background:transparent;border:none;color:var(--text3);cursor:pointer;font-size:.72em;padding:1px 5px" title="Выбрать все">✓ все</button>
    <button onclick="queueCheckAll(false)" style="background:transparent;border:none;color:var(--text3);cursor:pointer;font-size:.72em;padding:1px 5px" title="Снять все">✕ все</button>
  </div>`;
  el.innerHTML = selRow + tasks.map((t, i) => {
    const desc    = _queueSnapDesc(t.snapshot);
    const checked = !_queueUnchecked.has(t.id);
    const dimmed  = checked ? '' : 'opacity:.45;';
    return `<div style="display:flex;align-items:center;gap:6px;padding:5px 7px;background:var(--bg3);border-radius:5px;border:1px solid var(--border);${dimmed}">
      <input type="checkbox" ${checked ? 'checked' : ''} onchange="queueToggleCheck(${t.id}, this.checked)" style="cursor:pointer;accent-color:var(--accent);flex-shrink:0" title="Включить/отключить задачу">
      <span style="color:var(--text3);font-size:.75em;min-width:16px">${i+1}.</span>
      <div style="flex:1;overflow:hidden">
        <div style="color:var(--text);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.name}</div>
        <div style="color:var(--text2);font-size:.75em">${desc} · ×${t.repeats} повтор${t.repeats===1?'':'ов'}</div>
      </div>
      <button onclick="queueEditTask(${t.id})" style="background:transparent;border:none;color:var(--text2);cursor:pointer;font-size:.85em;padding:1px 4px" title="Редактировать">✏</button>
      <button onclick="queueDuplicateTask(${t.id})" style="background:transparent;border:none;color:var(--text2);cursor:pointer;font-size:.85em;padding:1px 4px" title="Дублировать">⧉</button>
      <button onclick="queueMoveTask(${t.id}, -1)" style="${i===0?'opacity:.3;pointer-events:none;':''} background:transparent;border:none;color:var(--text3);cursor:pointer;font-size:.9em;padding:1px 4px" title="Вверх">▲</button>
      <button onclick="queueMoveTask(${t.id}, 1)"  style="${i===tasks.length-1?'opacity:.3;pointer-events:none;':''} background:transparent;border:none;color:var(--text3);cursor:pointer;font-size:.9em;padding:1px 4px" title="Вниз">▼</button>
      <button onclick="queueDeleteTask(${t.id})" style="background:transparent;border:none;color:#ff5555;cursor:pointer;font-size:.9em;padding:1px 4px" title="Удалить">🗑</button>
    </div>`;
  }).join('');
}

// ── Запустить очередь ─────────────────────────────────────────────
async function runQueue() {
  if (_queueRunning) return;
  const tasks = _queueGetActive();
  if (tasks.length === 0) { alert(_queueLoadTasks().length === 0 ? 'Очередь пуста' : 'Нет выбранных задач — отметь хотя бы одну'); return; }

  _queueRunning  = true;
  _queueStopFlag = false;
  window._queueMode = true;

  const runBtn  = document.getElementById('queue-run-btn');
  const stopBtn = document.getElementById('queue-stop-btn');
  const progEl  = document.getElementById('queue-progress');
  if (runBtn)  runBtn.style.display  = 'none';
  if (stopBtn) stopBtn.style.display = 'inline-block';
  if (progEl)  progEl.style.display  = 'block';

  const totalRepeats = tasks.reduce((s, t) => s + Math.max(1, parseInt(t.repeats) || 1), 0);
  let doneRepeats = 0;

  try {
    for (let ti = 0; ti < tasks.length; ti++) {
      if (_queueStopFlag) break;
      const task = tasks[ti];
      const repeats = Math.max(1, parseInt(task.repeats) || 1); // защита от undefined/0

      for (let rep = 0; rep < repeats; rep++) {
        if (_queueStopFlag) break;

        _queueRestore(task.snapshot);
        // Один macrotask чтобы DOM-изменения применились до runOpt.
        // yieldToUI = MessageChannel — не тротлится в фоновых вкладках.
        await yieldToUI();
        if (_queueStopFlag) break;

        if (progEl) progEl.textContent =
          `Задача ${ti+1}/${tasks.length} · Повтор ${rep+1}/${repeats} · Найдено: ${(window.results||[]).length.toLocaleString()} результатов`;

        // Запустить — results НЕ сбрасываются (window._queueMode=true).
        // runOptMultiTF читает c_tf_range из снапшота и ресэмплирует DATA.
        const _queueRunner = typeof window.runOptMultiTF === 'function' ? window.runOptMultiTF : window.runOpt;
        if (_queueRunner) await _queueRunner();

        doneRepeats++;
        // Если пользователь нажал "Стоп" в runOpt — прерываем очередь
        if (typeof stopped !== 'undefined' && stopped && !_queueStopFlag) {
          _queueStopFlag = true; break;
        }

        // Авто-очистка по порогам отсечки
        if (!_queueStopFlag && task.snapshot?.checks?.['queue-task-autoclean']) {
          const removed = _queueApplyCutoff();
          if (progEl && removed > 0) {
            progEl.textContent = `🗑 Удалено ${removed} слабых результатов · Задача ${ti+1}/${tasks.length} · Повтор ${rep+1}/${repeats}`;
            await yieldToUI(); // не тротлится в фоне
          }
        }

        // Rob-тест после оптимизации
        if (!_queueStopFlag && task.snapshot?.checks?.['queue-task-rob']) {
          if (progEl) progEl.textContent = `🔬 Rob-тест · Задача ${ti+1}/${tasks.length} · Повтор ${rep+1}/${repeats} · ${(window.results||[]).length} результатов`;
          // applyFilters заблокирован в queue-режиме, поэтому _visibleResults может быть устаревшим.
          // Синхронизируем вручную — чтобы runMassRobust видел актуальные результаты.
          _visibleResults = (window.results || results || []).filter(r => !!r.cfg);
          await yieldToUI(); // не тротлится в фоне
          if (typeof runMassRobust === 'function') await runMassRobust();
        }
      }
    }
  } catch (_queueErr) {
    console.error('[runQueue] Ошибка в очереди:', _queueErr);
    if (progEl) {
      progEl.textContent = `❌ Ошибка очереди: ${_queueErr?.message || String(_queueErr)}`;
      progEl.style.color = '#ff5555';
    }
  } finally {
    // 🤖 Research Agent: завершить прогон и сохранить результаты
    if (typeof ResearchAgent !== 'undefined') {
      try {
        await ResearchAgent.finishRun({
          taskCount: tasks.length,
          totalRepeats: totalRepeats,
          stopped: _queueStopFlag,
          resultCount: (window.results || []).length
        });
      } catch (e) {
        console.warn('[ResearchAgent] Ошибка при завершении:', e);
      }
    }

    _queueRunning = false;
    window._queueMode = false;
    if (runBtn)  runBtn.style.display  = 'inline-block';
    if (stopBtn) stopBtn.style.display = 'none';
    if (progEl) {
      const total = (window.results || []).length;
      progEl.textContent = _queueStopFlag
        ? `⏹ Остановлено · Найдено: ${total.toLocaleString()} результатов`
        : `✅ Готово · Все задачи выполнены · Найдено: ${total.toLocaleString()} результатов`;
      progEl.style.color = _queueStopFlag ? '#ff5555' : 'var(--accent)';
    }
    // Финальный рендер: применяем текущие фильтры без сброса
    if (typeof applyFilters === 'function') applyFilters();
    $('mass-rob-bar').style.display = (window.results||[]).length > 0 ? 'flex' : 'none';
    $('mass-rob-info').textContent = `${(window.results||[]).length} результатов`;
  }
}

// ── Остановить очередь ────────────────────────────────────────────
function stopQueue() {
  _queueStopFlag = true;
  if (typeof stopOpt === 'function') stopOpt();
  // Останавливаем rob-тест если он сейчас работает
  if (typeof _massRobRunning !== 'undefined') _massRobRunning = false;
  if (typeof _hcRobRunning   !== 'undefined') _hcRobRunning   = false;
}

// ── Серии ─────────────────────────────────────────────────────────
function seriesSaveCurrent() {
  const name = (document.getElementById('series-save-name')?.value || '').trim();
  if (!name) { alert('Введи название серии'); return; }
  const tasks = _queueGetActive();
  if (tasks.length === 0) { alert(_queueLoadTasks().length === 0 ? 'Очередь пуста' : 'Нет выбранных задач — отметь хотя бы одну'); return; }
  const series = _seriesLoad();
  series.push({ id: Date.now(), name, tasks: JSON.parse(JSON.stringify(tasks)) });
  _seriesSave(series);
  document.getElementById('series-save-name').value = '';
  renderSeriesList();
  toast('💾 Серия «' + name + '» сохранена', 1800);
}

function seriesLoad(id) {
  const series = _seriesLoad();
  const s = series.find(x => x.id === id);
  if (!s) return;
  if (_queueLoadTasks().length > 0 && !confirm('Заменить текущую очередь задачами из серии «' + s.name + '»?')) return;
  _queueSaveTasks(JSON.parse(JSON.stringify(s.tasks)));
  renderQueueTaskList();
  toast('📂 Серия «' + s.name + '» загружена в очередь', 1800);
}

function seriesDelete(id) {
  _seriesSave(_seriesLoad().filter(s => s.id !== id));
  renderSeriesList();
}

function renderSeriesList() {
  const el = document.getElementById('series-list');
  if (!el) return;
  const series = _seriesLoad();
  if (series.length === 0) {
    el.innerHTML = '<div style="color:var(--text3);text-align:center;padding:6px">Серий нет</div>';
    return;
  }
  el.innerHTML = series.map(s =>
    `<div style="display:flex;align-items:center;gap:6px;padding:4px 7px;background:var(--bg3);border-radius:4px;border:1px solid var(--border)">
      <div style="flex:1">
        <span style="color:var(--text)">${s.name}</span>
        <span style="color:var(--text3);font-size:.75em;margin-left:6px">${s.tasks.length} задач · ${s.tasks.reduce((a,t)=>a+t.repeats,0)} повт.</span>
      </div>
      <button onclick="seriesLoad(${s.id})" style="background:rgba(100,180,255,.15);border:1px solid rgba(100,180,255,.3);color:#64b5f6;border-radius:3px;padding:2px 8px;cursor:pointer;font-size:.8em">Загрузить</button>
      <button onclick="seriesDelete(${s.id})" style="background:transparent;border:none;color:#ff5555;cursor:pointer;font-size:.85em" title="Удалить серию">🗑</button>
    </div>`
  ).join('');
}

// ── Отсечка перед запуском тестов ──────────────────────────────
// Возвращает подмножество _visibleResults, прошедших пороги pre-run фильтра.
function _getPreRunFiltered() {
  const minPnl    = parseFloat(document.getElementById('prf_minpnl')?.value) ?? 0;
  const minWR     = parseFloat(document.getElementById('prf_minwr')?.value)  ?? 0;
  const minSig    = parseFloat(document.getElementById('prf_minsig')?.value) ?? 0;
  const minGT     = parseFloat(document.getElementById('prf_mingt')?.value)  ?? 0;
  const minOosPnl = parseFloat(document.getElementById('prf_min_oos_pnl')?.value);
  const minRet    = parseFloat(document.getElementById('prf_min_retention')?.value);
  return _visibleResults.filter(r => {
    if (!r.cfg) return false;
    if (r.pnl < (isNaN(minPnl) ? 0 : minPnl)) return false;
    if (r.wr  < (isNaN(minWR)  ? 0 : minWR))  return false;
    if ((r.sig ?? 0) < (isNaN(minSig) ? 0 : minSig)) return false;
    if ((r.gt  ?? -2) < (isNaN(minGT) ? 0 : minGT))  return false;
    // OOS-фильтры: применяются только если значение задано И у результата есть OOS-данные
    const fwd = r.cfg._oos?.forward;
    if (fwd && !isNaN(minOosPnl) && fwd.pnl    < minOosPnl) return false;
    if (fwd && !isNaN(minRet)    && fwd.retention < minRet)  return false;
    return true;
  });
}

// Фильтрует window.results по тем же порогам что _getPreRunFiltered().
// Используется очередью после каждой оптимизации (авто-очистка мусора).
// Возвращает кол-во удалённых результатов.
function _queueApplyCutoff() {
  const minPnl    = parseFloat(document.getElementById('prf_minpnl')?.value);
  const minWR     = parseFloat(document.getElementById('prf_minwr')?.value);
  const minSig    = parseFloat(document.getElementById('prf_minsig')?.value);
  const minGT     = parseFloat(document.getElementById('prf_mingt')?.value);
  const minOosPnl = parseFloat(document.getElementById('prf_min_oos_pnl')?.value);
  const minRet    = parseFloat(document.getElementById('prf_min_retention')?.value);
  const p = isNaN(minPnl) ? 0 : minPnl;
  const w = isNaN(minWR)  ? 0 : minWR;
  const s = isNaN(minSig) ? 0 : minSig;
  const g = isNaN(minGT)  ? 0 : minGT;
  const before = (window.results || []).length;
  window.results = (window.results || []).filter(r => {
    if (!r.cfg) return false;
    if (r.pnl < p || r.wr < w) return false;
    if ((r.sig ?? 0) < s || (r.gt ?? -2) < g) return false;
    const fwd = r.cfg._oos?.forward;
    if (fwd && !isNaN(minOosPnl) && fwd.pnl       < minOosPnl) return false;
    if (fwd && !isNaN(minRet)    && fwd.retention  < minRet)    return false;
    return true;
  });
  const removed = before - window.results.length;
  if (removed > 0 && typeof renderResults === 'function') renderResults();
  return removed;
}

const _PRF_LS_KEY = 'use_opt_prf_cutoff';
const _PRF_FIELDS = ['prf_minpnl','prf_minwr','prf_minsig','prf_mingt','prf_min_oos_pnl','prf_min_retention'];

function _savePrfCutoff() {
  try {
    const vals = {};
    _PRF_FIELDS.forEach(id => { const el = document.getElementById(id); if (el) vals[id] = el.value; });
    localStorage.setItem(_PRF_LS_KEY, JSON.stringify(vals));
  } catch(e) {}
}

function _loadPrfCutoff() {
  try {
    const raw = localStorage.getItem(_PRF_LS_KEY);
    if (!raw) return;
    const vals = JSON.parse(raw);
    _PRF_FIELDS.forEach(id => {
      const el = document.getElementById(id);
      if (el && vals[id] !== undefined) el.value = vals[id];
    });
  } catch(e) {}
}

function updatePreRunCount() {
  const el = document.getElementById('prf-count');
  if (!el) return;
  _savePrfCutoff(); // persist on every change
  const total = _visibleResults.filter(r => r.cfg).length;
  if (total === 0) { el.textContent = ''; return; }
  const filtered = _getPreRunFiltered();
  el.textContent = `→ ${filtered.length} из ${total}`;
  el.style.color = filtered.length < total ? 'var(--orange)' : 'var(--accent)';
}
try { window.updatePreRunCount = updatePreRunCount; } catch(e) {}
