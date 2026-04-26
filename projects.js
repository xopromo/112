// USE Optimizer — Project Manager
// Handles project CRUD, folder access (File System Access API),
// per-project favourites isolation and last-state restore.

const ProjectManager = (() => {
  const LS_KEY     = 'use6_projects_v1';
  const LS_CURRENT = 'use6_current_project';
  const IDB_NAME   = 'use6db';
  const IDB_STORE  = 'proj_handles';
  const IDB_VER    = 1;

  let _projects   = [];
  let _currentId  = null;
  let _db         = null;
  const _handles  = new Map();

  // ─── IndexedDB (for FileSystemDirectoryHandle) ─────────────

  async function _openDB() {
    if (_db) return _db;
    if (typeof indexedDB === 'undefined') throw new Error('IndexedDB unavailable');
    return new Promise((res, rej) => {
      const tid = setTimeout(() => rej(new Error('IndexedDB open timeout')), 1500);
      const req = indexedDB.open(IDB_NAME, IDB_VER);
      req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE);
      req.onsuccess  = e => { clearTimeout(tid); _db = e.target.result; res(_db); };
      req.onerror    = e => { clearTimeout(tid); rej(e.target.error); };
    });
  }

  async function _putHandle(id, handle) {
    if (handle) _handles.set(id, handle);
    try {
      const db = await _openDB();
      return await new Promise((res, rej) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(handle, id);
        tx.oncomplete = () => res(true);
        tx.onerror    = e => rej(e.target.error);
      });
    } catch(e) {
      console.warn('[ProjectManager] folder handle was kept for this session only', e);
      return false;
    }
  }

  async function _getHandle(id) {
    if (_handles.has(id)) return _handles.get(id);
    try {
      const db = await _openDB();
      return await new Promise((res, rej) => {
        const tx  = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(id);
        req.onsuccess = e => {
          const handle = e.target.result || null;
          if (handle) _handles.set(id, handle);
          res(handle);
        };
        req.onerror   = e => rej(e.target.error);
      });
    } catch(e) {
      return null;
    }
  }

  async function _delHandle(id) {
    _handles.delete(id);
    try {
      const db = await _openDB();
      return await new Promise((res, rej) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(id);
        tx.oncomplete = res;
        tx.onerror    = e => rej(e.target.error);
      });
    } catch(e) {}
  }

  // ─── localStorage (project list + current id) ──────────────

  function _loadLS() {
    try {
      _projects  = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
      _currentId = localStorage.getItem(LS_CURRENT) || null;
    } catch(e) { _projects = []; _currentId = null; }
  }

  function _isQuotaError(e) {
    return e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);
  }

  function _cleanupStorageForProjectSave() {
    const prefixes = ['use6_csv_', 'rob_', 'robSurrogate_'];
    let count = 0;
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && prefixes.some(pfx => key.startsWith(pfx))) keys.push(key);
      }
      keys.forEach(key => {
        localStorage.removeItem(key);
        count++;
      });
    } catch(e) {}
    return count;
  }

  function _saveLS() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(_projects));
      if (_currentId) localStorage.setItem(LS_CURRENT, _currentId);
      else            localStorage.removeItem(LS_CURRENT);
      return true;
    } catch(e) {
      if (!_isQuotaError(e)) throw e;
      const removed = _cleanupStorageForProjectSave();
      console.warn(`[ProjectManager] localStorage quota exceeded; removed ${removed} cache keys and retrying`);
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(_projects));
        if (_currentId) localStorage.setItem(LS_CURRENT, _currentId);
        else            localStorage.removeItem(LS_CURRENT);
        return true;
      } catch(e2) {
        console.warn('[ProjectManager] project list was kept for this session only', e2);
        return false;
      }
    }
  }

  function _uuid() {
    return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ─── Public: getters ───────────────────────────────────────

  function getAll()       { return _projects; }
  function getCurrentId() { return _currentId; }
  function getCurrent()   { return _projects.find(p => p.id === _currentId) || null; }
  function getById(id)    { return _projects.find(p => p.id === id) || null; }

  // ─── Public: CRUD ──────────────────────────────────────────

  async function create(name, dirHandle, templateSnapshot) {
    const id   = _uuid();
    const proj = {
      id,
      name,
      templateSnapshot: templateSnapshot || null,
      createdAt:  Date.now(),
      lastFile:   null,
      knownFiles: [],
    };
    await _putHandle(id, dirHandle);
    _projects.unshift(proj);
    _currentId = id;
    _saveLS();
    return proj;
  }

  async function switchTo(id) {
    if (!_projects.find(p => p.id === id)) return false;
    _currentId = id;
    _saveLS();
    return true;
  }

  async function duplicate(srcId) {
    const src = _projects.find(p => p.id === srcId);
    if (!src) return null;
    let newHandle;
    try {
      newHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    } catch(e) { return null; }
    const newName = src.name + ' (копия)';
    return await create(newName, newHandle, src.templateSnapshot);
  }

  async function rename(id, newName) {
    const proj = _projects.find(p => p.id === id);
    if (!proj) return;
    proj.name = newName;
    _saveLS();
  }

  async function remove(id) {
    const idx = _projects.findIndex(p => p.id === id);
    if (idx < 0) return;
    _projects.splice(idx, 1);
    await _delHandle(id);
    localStorage.removeItem(`use6_state_${id}`);
    localStorage.removeItem(`use6_csv_${id}`);
    localStorage.removeItem(`use6_fav_${id}`);
    if (_currentId === id) {
      _currentId = _projects[0]?.id || null;
    }
    _saveLS();
  }

  // ─── Folder access ─────────────────────────────────────────

  // Returns handle with permission granted, or null
  async function getHandle(id) {
    const handle = await _getHandle(id || _currentId);
    if (!handle) return null;
    try {
      let perm = await handle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        perm = await handle.requestPermission({ mode: 'readwrite' });
      }
      return perm === 'granted' ? handle : null;
    } catch(e) { return null; }
  }

  // Returns handle only if permission already granted (no requestPermission — safe in setInterval)
  async function getHandleIfGranted(id) {
    const handle = await _getHandle(id || _currentId);
    if (!handle) return null;
    try {
      const perm = await handle.queryPermission({ mode: 'readwrite' });
      return perm === 'granted' ? handle : null;
    } catch(e) { return null; }
  }

  // Returns new CSV filenames without requesting permission (safe to call from setInterval)
  // Returns null if permission not yet granted, [] if granted but no new files
  async function checkNewFilesIfGranted(id) {
    const proj = _projects.find(p => p.id === (id || _currentId));
    if (!proj) return null;
    const handle = await getHandleIfGranted(id || _currentId);
    if (!handle) return null; // permission not granted — skip silently
    const known = new Set(proj.knownFiles || []);
    const files = [];
    try {
      for await (const [name, entry] of handle.entries()) {
        if (entry.kind === 'file' && name.toLowerCase().endsWith('.csv')) {
          files.push(name);
        }
      }
    } catch(e) { return null; }
    return files.filter(n => !known.has(n));
  }

  // Returns sorted array: [{ name, size, lastModified }]
  async function listCSVFiles(id) {
    const handle = await getHandle(id || _currentId);
    if (!handle) return [];
    const files = [];
    try {
      for await (const [name, entry] of handle.entries()) {
        if (entry.kind === 'file' && name.toLowerCase().endsWith('.csv')) {
          const f = await entry.getFile();
          files.push({ name, size: f.size, lastModified: f.lastModified });
        }
      }
      files.sort((a, b) => b.lastModified - a.lastModified);
    } catch(e) {}
    return files;
  }

  // Returns a File object or null
  async function readCSVFile(id, filename) {
    const handle = await getHandle(id || _currentId);
    if (!handle) return null;
    try {
      const fh   = await handle.getFileHandle(filename);
      return await fh.getFile();
    } catch(e) { return null; }
  }

  // Saves text content to a file in the project folder
  async function saveToFolder(id, filename, content) {
    const handle = await getHandle(id || _currentId);
    if (!handle) return false;
    try {
      const fh = await handle.getFileHandle(filename, { create: true });
      const w  = await fh.createWritable();
      await w.write(content);
      await w.close();
      return true;
    } catch(e) { return false; }
  }

  // ─── New files detection ────────────────────────────────────

  // Returns array of CSV filenames not yet in knownFiles
  async function checkNewFiles(id) {
    const proj = _projects.find(p => p.id === (id || _currentId));
    if (!proj) return [];
    const known   = new Set(proj.knownFiles || []);
    const current = await listCSVFiles(id || _currentId);
    return current.filter(f => !known.has(f.name)).map(f => f.name);
  }

  function markFilesKnown(id, filenames) {
    const proj = _projects.find(p => p.id === (id || _currentId));
    if (!proj) return;
    const known = new Set(proj.knownFiles || []);
    filenames.forEach(f => known.add(f));
    proj.knownFiles = [...known];
    _saveLS();
  }

  function updateLastFile(filename, id) {
    const proj = _projects.find(p => p.id === (id || _currentId));
    if (!proj) return;
    proj.lastFile = filename;
    _saveLS();
  }

  // ─── Per-project state ─────────────────────────────────────

  function saveState(state, id) {
    const key = `use6_state_${id || _currentId}`;
    try { localStorage.setItem(key, JSON.stringify(state)); } catch(e) {}
  }

  function loadState(id) {
    const key = `use6_state_${id || _currentId}`;
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch(e) { return null; }
  }

  // ─── Init ──────────────────────────────────────────────────

  function init() {
    _loadLS();
    console.log('[ProjectManager.init] проектов найдено:', _projects.length, 'текущий ID:', _currentId);

    // Очищаем осиротевшие CSV/fav из localStorage (от удалённых проектов)
    const knownIds = new Set(_projects.map(p => p.id));
    console.log('[ProjectManager.init] известные IDs:', Array.from(knownIds));

    const orphanPrefixes = ['use6_csv_', 'use6_fav_', 'use6_state_'];
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      for (const pfx of orphanPrefixes) {
        if (k.startsWith(pfx)) {
          const id = k.slice(pfx.length);
          // ВАЖНО: не удаляем пустой ID (это старые ключи вроде 'use6_fav' без ID)
          // и не удаляем ключи которые принадлежат известным проектам
          if (id && !knownIds.has(id)) {
            console.log(`[ProjectManager.init] осиротевший ключ (ID="${id}" не найден): ${k}`);
            toRemove.push(k);
          }
        }
      }
    }
    if (toRemove.length > 0) {
      console.log('[ProjectManager.init] удаляем осиротевшие ключи:', toRemove);
      toRemove.forEach(k => localStorage.removeItem(k));
    }
  }

  // ─── Exports ───────────────────────────────────────────────

  return {
    init,
    getAll, getCurrentId, getCurrent, getById,
    create, switchTo, duplicate, rename, remove,
    getHandle, getHandleIfGranted, listCSVFiles, readCSVFile, saveToFolder,
    checkNewFiles, checkNewFilesIfGranted, markFilesKnown, updateLastFile,
    saveState, loadState,
  };
})();
