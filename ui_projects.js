
// ═══════════════════════════════════════════════════════════════
// PROJECT MANAGEMENT UI
// ═══════════════════════════════════════════════════════════════

// ── Core: switch to a project ──────────────────────────────────

async function setProject(id) {
  if (!id) return;
  // Save current project state before switching
  const curId = ProjectManager.getCurrentId();
  if (curId && curId !== id) {
    ProjectManager.saveState({ favNs: _favNs }, curId);
  }

  await ProjectManager.switchTo(id);
  const proj = ProjectManager.getCurrent();
  if (!proj) return;

  // Load per-project favourites
  favourites = (await storeLoad(_favKey())) || [];

  // 🔄 Миграция старых избранных (без ID проекта) в новый проект
  if (favourites.length === 0) {
    // Пробуем восстановить из всех возможных ключей (на случай потери currentId)
    const possibleKeys = [
      'use6_fav',           // старый формат без ID
      'use6_fav_' + id,     // текущий проект (на случай сохранения до инициализации)
    ];

    for (const tryKey of possibleKeys) {
      const tryFavs = await storeLoad(tryKey);
      if (tryFavs && tryFavs.length > 0) {
        favourites = tryFavs;
        // Если загрузили из другого ключа, сохраняем в правильный
        if (tryKey !== _favKey()) {
          _saveFavsSync(); // сохраняем синхронно в новый ключ
          // Очищаем старый ключ асинхронно (не критично если не завершится)
          storeSave(tryKey, null).catch(() => {});
        }
        break;
      }
    }
  }

  // Restore last state
  const state = ProjectManager.loadState(id);
  _favNs = (state && state.favNs) ? state.favNs : '';
  localStorage.setItem('use6_fav_ns', _favNs);

  // Clear stale data from previous project before loading new one
  DATA = null; _rawDATA = null;
  _rawDataInfo = '';
  if ($('finfo')) $('finfo').textContent = 'Нет данных';
  results = []; equities = {};
  if ($('tb')) $('tb').innerHTML = '';
  if ($('eqc')) $('eqc').style.display = 'none';
  document.body.classList.remove('chart-active');
  if ($('rbtn')) $('rbtn').disabled = true;

  // Update UI
  _updateProjBar(proj);
  renderFavBar();
  const nsEl = document.getElementById('fav-ns-label');
  if (nsEl) nsEl.textContent = _favNs ? _favNs : '';

  // Helper: try to restore CSV from localStorage cache (no permission needed)
  function _restoreFromCache(filename) {
    const cached = localStorage.getItem(`use6_csv_${id}`);
    if (!cached) return false;
    parseCSV(cached);
    _rawDATA = DATA;
    _rawDataInfo = '✅ ' + (filename || 'данные') + ' (кэш)';
    applyMaxBars();
    if ($('rbtn')) $('rbtn').disabled = false;
    updateVolStatus();
    updatePreview();
    return true;
  }

  // Auto-load last CSV from project folder
  if (proj.lastFile) {
    const file = await ProjectManager.readCSVFile(id, proj.lastFile);
    if (file) loadFile(file);
    else _restoreFromCache(proj.lastFile); // fallback: restore from cache on reload
  } else {
    // No lastFile — try to pick the most recent CSV
    const files = await ProjectManager.listCSVFiles(id);
    if (files.length > 0) {
      const file = await ProjectManager.readCSVFile(id, files[0].name);
      if (file) { loadFile(file); ProjectManager.updateLastFile(files[0].name); }
      else _restoreFromCache(files[0].name);
      ProjectManager.markFilesKnown(id, files.map(f => f.name));
    }
  }

  closeProjSwitcher();
}

function _updateProjBar(proj) {
  const el = document.getElementById('proj-name');
  if (el) el.textContent = proj ? proj.name : 'Нет проекта';
}

// ── Create project ─────────────────────────────────────────────

let _projCreateHandle = null;
let _projCreateFirstLaunch = false;

function openCreateProject(firstLaunch) {
  _projCreateHandle = null;
  _projCreateFirstLaunch = !!firstLaunch;
  const overlay = document.getElementById('proj-create-overlay');
  if (!overlay) return;
  document.getElementById('proj-create-name').value = '';
  document.getElementById('proj-create-folder').textContent = 'не выбрана';
  // Hide cancel button on first launch
  const cancelBtn = document.getElementById('proj-create-cancel');
  if (cancelBtn) cancelBtn.style.display = firstLaunch ? 'none' : '';
  overlay.style.display = 'flex';
  setTimeout(() => document.getElementById('proj-create-name').focus(), 50);
}

function closeProjCreate() {
  if (_projCreateFirstLaunch) return; // must create on first launch
  const overlay = document.getElementById('proj-create-overlay');
  if (overlay) overlay.style.display = 'none';
}

async function projPickFolder() {
  if (!window.showDirectoryPicker) {
    toast('File System Access API не поддерживается в этом браузере', 2500);
    return;
  }
  try {
    _projCreateHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    document.getElementById('proj-create-folder').textContent = _projCreateHandle.name;
  } catch(e) { /* user cancelled */ }
}

async function confirmCreateProject() {
  const name = (document.getElementById('proj-create-name').value || '').trim();
  if (!name) { toast('Введи название проекта', 1500); return; }
  if (!_projCreateHandle) { toast('Выбери папку', 1500); return; }

  // Snapshot current template
  const templateSnapshot = templates.find(t => t.isDefault) || null;

  const proj = await ProjectManager.create(name, _projCreateHandle, templateSnapshot);
  // Force close even if firstLaunch (guard in closeProjCreate would block it)
  _projCreateFirstLaunch = false;
  closeProjCreate();
  await setProject(proj.id);
  toast('✅ Проект создан: ' + name, 2000);
}

// ── Switch project ─────────────────────────────────────────────

function openProjSwitcher() {
  const overlay = document.getElementById('proj-switch-overlay');
  if (!overlay) return;
  _renderProjList();
  overlay.style.display = 'flex';
}

function closeProjSwitcher() {
  const overlay = document.getElementById('proj-switch-overlay');
  if (overlay) overlay.style.display = 'none';
}

function _renderProjList() {
  const list = document.getElementById('proj-switch-list');
  if (!list) return;
  const projects = ProjectManager.getAll();
  const curId    = ProjectManager.getCurrentId();

  if (!projects.length) {
    list.innerHTML = '<div style="font-size:.7em;color:var(--text3);padding:8px">Нет проектов</div>';
    return;
  }

  list.innerHTML = projects.map(p => {
    const active = p.id === curId;
    const dt = new Date(p.createdAt).toLocaleDateString('ru');
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:6px;border:1px solid ${active ? 'var(--accent)' : 'var(--border)'};background:${active ? 'rgba(0,212,255,.07)' : 'var(--bg)'};cursor:pointer"
      onclick="setProject('${p.id}')">
      <div style="flex:1;min-width:0">
        <div style="font-size:.78em;color:${active ? 'var(--accent)' : 'var(--text)'};font-weight:${active ? '700' : '400'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name}</div>
        <div style="font-size:.6em;color:var(--text3);margin-top:2px">${p.lastFile || 'нет файла'} · создан ${dt}</div>
      </div>
      ${active ? '<span style="color:var(--accent);font-size:.8em">✓</span>' : ''}
      <button onclick="event.stopPropagation();_dupProject('${p.id}')" title="Дублировать проект"
        style="padding:2px 7px;background:var(--bg3);border:1px solid var(--border2);border-radius:3px;color:var(--text3);font-size:.65em;cursor:pointer">⧉</button>
      <button onclick="event.stopPropagation();_delProject('${p.id}')" title="Удалить проект"
        style="padding:2px 7px;background:rgba(255,68,102,.08);border:1px solid rgba(255,68,102,.25);border-radius:3px;color:#ff4466;font-size:.65em;cursor:pointer">✕</button>
    </div>`;
  }).join('');
}

async function _dupProject(id) {
  const newProj = await ProjectManager.duplicate(id);
  if (newProj) {
    await setProject(newProj.id);
    closeProjSwitcher();
    toast('⧉ Проект продублирован: ' + newProj.name, 2000);
  }
}

async function _delProject(id) {
  const proj = ProjectManager.getById(id);
  if (!proj) return;
  if (!confirm(`Удалить проект "${proj.name}"?\nИзбранные и история будут удалены.`)) return;
  await ProjectManager.remove(id);
  const remaining = ProjectManager.getAll();
  if (remaining.length > 0) {
    await setProject(remaining[0].id);
  } else {
    _updateProjBar(null);
    favourites = [];
    renderFavBar();
  }
  _renderProjList();
}

// ── New files polling ──────────────────────────────────────────

async function _pollNewFiles() {
  const id = ProjectManager.getCurrentId();
  if (!id) return;
  try {
    // Use IfGranted variant — doesn't call requestPermission (requires user gesture)
    const newFiles = await ProjectManager.checkNewFilesIfGranted(id);
    const badge = document.getElementById('proj-new-badge');
    // null = permission not yet granted → don't hide badge (it may have been set earlier)
    if (badge && newFiles !== null) badge.style.display = newFiles.length > 0 ? 'inline' : 'none';
  } catch(e) {}
}

async function refreshProjectFiles() {
  const id = ProjectManager.getCurrentId();
  if (!id) return;
  const files = await ProjectManager.listCSVFiles(id);
  ProjectManager.markFilesKnown(id, files.map(f => f.name));
  document.getElementById('proj-new-badge').style.display = 'none';
  // Load the most recent file
  if (files.length > 0) {
    const file = await ProjectManager.readCSVFile(id, files[0].name);
    if (file) { loadFile(file); ProjectManager.updateLastFile(files[0].name); }
    toast('🔄 Данные обновлены: ' + files[0].name, 2000);
  }
}


