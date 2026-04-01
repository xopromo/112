// ═══════════════════════════════════════════════════════════════
// RESEARCH AGENT v1
// Автоматическое накопление и анализ результатов оптимизации
// ═══════════════════════════════════════════════════════════════

const ResearchAgent = (() => {
  // ─── IndexedDB Config ───────────────────────────────────────
  const IDB_NAME = 'use6_research';
  const IDB_VERSION = 1;
  const STORE_RUNS = 'runs';           // История прогонов
  const STORE_INSIGHTS = 'insights';   // Кэшированные инсайты

  let _db = null;
  let _currentRunId = null;
  let _resultsBuffer = [];
  let _saveTimer = null;

  // ─── Инициализация IndexedDB ────────────────────────────────

  async function _initDB() {
    if (_db) return _db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        // Хранилище: runs — история прогонов
        if (!db.objectStoreNames.contains(STORE_RUNS)) {
          const store = db.createObjectStore(STORE_RUNS, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('projectId', 'projectId', { unique: false });
        }
        // Хранилище: insights — кэш анализа
        if (!db.objectStoreNames.contains(STORE_INSIGHTS)) {
          db.createObjectStore(STORE_INSIGHTS, { keyPath: 'id' });
        }
      };
      req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
      req.onerror = () => reject(req.error);
    });
  }

  // ─── API: Начать новый прогон ──────────────────────────────

  async function startRun(taskInfo = {}) {
    const db = await _initDB();
    _currentRunId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    _resultsBuffer = [];

    console.log('[ResearchAgent] ▶️  Новый прогон:', _currentRunId);
  }

  // ─── API: Добавить результаты в буфер (вызывается из runOpt) ──

  function addResults(newResults) {
    if (!Array.isArray(newResults) || newResults.length === 0) return;
    _resultsBuffer.push(...newResults);

    // Автосохранение каждые 100 результатов или через 30 сек
    _debounceSave();
  }

  // ─── API: Завершить прогон и сохранить ─────────────────────

  async function finishRun(metadata = {}) {
    if (!_currentRunId || _resultsBuffer.length === 0) return;

    clearTimeout(_saveTimer);
    const db = await _initDB();

    const run = {
      id: _currentRunId,
      timestamp: Date.now(),
      projectId: ProjectManager?.getCurrentId() || 'default',
      metadata,
      resultCount: _resultsBuffer.length,
      results: _resultsBuffer.map(r => ({
        name: r.name,
        pnl: r.pnl,
        wr: r.wr,
        n: r.n,
        dd: r.dd,
        pdd: r.pdd,
        sig: r.sig,
        gt: r.gt,
        cfg: r.cfg  // конфиг для анализа
      })),
      equities: window.equities || {}
    };

    // Сохранить в IndexedDB
    return new Promise((resolve) => {
      const tx = db.transaction([STORE_RUNS], 'readwrite');
      const store = tx.objectStore(STORE_RUNS);
      store.add(run);

      tx.oncomplete = async () => {
        console.log(`[ResearchAgent] 💾 Сохранено: ${run.resultCount} результатов (${_currentRunId})`);

        // Экспортировать в папку проекта
        if (ProjectManager?.getCurrentId()) {
          await _exportToProjectFolder(run);
        }

        _currentRunId = null;
        _resultsBuffer = [];
        resolve(run);
      };
    });
  }

  // ─── Автосохранение (debounced) ────────────────────────────

  function _debounceSave() {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(async () => {
      if (_resultsBuffer.length >= 100) {
        console.log(`[ResearchAgent] 📊 Промежуточное сохранение: ${_resultsBuffer.length} результатов`);
        // Можно добавить промежуточное сохранение если нужно
      }
    }, 30000);
  }

  // ─── Экспорт в папку проекта (.research/YYYY-MM-DD.json) ───

  async function _exportToProjectFolder(run) {
    try {
      const projId = ProjectManager?.getCurrentId();
      if (!projId) return;

      const dirHandle = await ProjectManager.getDirectoryHandle(projId);
      if (!dirHandle) return;

      // Создать подпапку .research
      let researchDir;
      try {
        researchDir = await dirHandle.getDirectoryHandle('.research', { create: true });
      } catch (e) {
        console.warn('[ResearchAgent] Не удалось создать .research:', e);
        return;
      }

      // Имя файла: YYYY-MM-DD_HH-mm-ss.json
      const date = new Date(run.timestamp);
      const filename = date.toISOString().slice(0, 19).replace(/T/, '_').replace(/:/g, '-') + '.json';

      // Записать файл
      const fileHandle = await researchDir.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(run, null, 2));
      await writable.close();

      console.log(`[ResearchAgent] 📁 Экспортировано: .research/${filename}`);
    } catch (e) {
      console.warn('[ResearchAgent] Ошибка экспорта:', e);
    }
  }

  // ─── API: Загрузить историю из IndexedDB ────────────────────

  async function loadHistory(projectId, limit = 100) {
    const db = await _initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_RUNS], 'readonly');
      const store = tx.objectStore(STORE_RUNS);
      const index = store.index('projectId');

      const req = index.getAll(projectId);
      req.onsuccess = () => {
        const runs = req.result
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, limit);
        resolve(runs);
      };
      req.onerror = () => reject(req.error);
    });
  }

  // ─── API: Получить все результаты из истории ────────────────

  async function getAllResultsFromHistory(projectId, timeWindow = null) {
    const runs = await loadHistory(projectId, 1000);
    const results = [];
    const cutoff = timeWindow ? Date.now() - timeWindow : 0;

    for (const run of runs) {
      if (run.timestamp < cutoff) break;
      results.push(...(run.results || []));
    }

    return results;
  }

  // ─── Public API ─────────────────────────────────────────────

  return {
    startRun,
    addResults,
    finishRun,
    loadHistory,
    getAllResultsFromHistory
  };
})();

// ─── Интеграция с runOpt: автоматическое сохранение ────────────
// Добавить в конец runOpt() в opt.js:
//   window._queueMode && ResearchAgent.addResults(results);
// Добавить в finally блок runQueue() в ui.js:
//   ResearchAgent.finishRun({ queueTaskCount: tasks.length });
