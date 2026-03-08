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

  // ─── IndexedDB (for FileSystemDirectoryHandle) ─────────────

  async function _openDB() {
    if (_db) return _db;
    return new Promise((res, rej) => {
      const req = indexedDB.open(IDB_NAME, IDB_VER);
      req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE);
      req.onsuccess  = e => { _db = e.target.result; res(_db); };
      req.onerror    = e => rej(e.target.error);
    });
  }

  async function _putHandle(id, handle) {
    const db = await _openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(handle, id);
      tx.oncomplete = res;
      tx.onerror    = e => rej(e.target.error);
    });
  }

  async function _getHandle(id) {
    const db = await _openDB();
    return new Promise((res, rej) => {
      const tx  = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(id);
      req.onsuccess = e => res(e.target.result || null);
      req.onerror   = e => rej(e.target.error);
    });
  }

  async function _delHandle(id) {
    const db = await _openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(id);
      tx.oncomplete = res;
      tx.onerror    = e => rej(e.target.error);
    });
  }

  // ─── localStorage (project list + current id) ──────────────

  function _loadLS() {
    try {
      _projects  = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
      _currentId = localStorage.getItem(LS_CURRENT) || null;
    } catch(e) { _projects = []; _currentId = null; }
  }

  function _saveLS() {
    localStorage.setItem(LS_KEY, JSON.stringify(_projects));
    if (_currentId) localStorage.setItem(LS_CURRENT, _currentId);
    else            localStorage.removeItem(LS_CURRENT);
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
    _projects.unshift(proj);
    _currentId = id;
    await _putHandle(id, dirHandle);
    _saveLS();
    return proj;
  }

  async function switchTo(id) {
    if (!_projects.find(p => p.id === id)) return false;
    _currentId = id;
    // Keep recently used at top
    const idx = _projects.findIndex(p => p.id === id);
    if (idx > 0) {
      const [proj] = _projects.splice(idx, 1);
      _projects.unshift(proj);
    }
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

  function init() { _loadLS(); }

  // ─── Exports ───────────────────────────────────────────────

  return {
    init,
    getAll, getCurrentId, getCurrent, getById,
    create, switchTo, duplicate, rename, remove,
    getHandle, listCSVFiles, readCSVFile, saveToFolder,
    checkNewFiles, markFilesKnown, updateLastFile,
    saveState, loadState,
  };
})();
