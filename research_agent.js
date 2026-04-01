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
  let _dbPromise = null;  // Кэш для защиты от параллельной инициализации
  let _currentRunId = null;
  let _resultsBuffer = [];
  let _pendingResultsQueues = [];  // ОЧЕРЕДЬ для защиты от race condition
  let _lastAnalysisTime = localStorage.getItem('_raLastAnalysisTime') || null;
  let _totalDataPoints = 0;
  let _totalRuns = 0;
  let _isAnalyzing = false;
  let _isFinishingRun = false;  // Флаг для защиты от параллельных finishRun()

  // ─── Инициализация IndexedDB ────────────────────────────────

  async function _initDB() {
    // Если уже инициализирована, вернуть существующее подключение
    if (_db) return _db;

    // Если инициализация уже в процессе, вернуть обещание о завершении
    if (_dbPromise) return _dbPromise;

    _dbPromise = new Promise((resolve, reject) => {
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
      req.onsuccess = (e) => {
        _db = e.target.result;
        _dbPromise = null;  // Очистить кэш промиса после успеха
        resolve(_db);
      };
      req.onerror = () => {
        _dbPromise = null;  // Очистить кэш промиса при ошибке
        reject(req.error);
      };
    });

    return _dbPromise;
  }

  // ─── API: Начать новый прогон ──────────────────────────────

  async function startRun(taskInfo = {}) {
    const db = await _initDB();
    _currentRunId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    _resultsBuffer = [];
    _pendingResultsQueues = [];  // Очистить очередь при новом прогоне

    console.log('[ResearchAgent] ▶️  Новый прогон:', _currentRunId, 'mode=' + (taskInfo?.mode || 'unknown'));
  }

  // ─── API: Добавить результаты в буфер (вызывается из runOpt) ──

  function addResults(newResults) {
    if (!Array.isArray(newResults) || newResults.length === 0) {
      console.log('[ResearchAgent] ⚠️  addResults: невалидные данные', { isArray: Array.isArray(newResults), len: newResults?.length });
      return;
    }
    if (!_currentRunId) {
      console.log('[ResearchAgent] ⚠️  addResults: нет активного прогона (_currentRunId не установлен)');
      return;
    }

    // Защита от race condition: если finishRun выполняется, добавляем в очередь
    if (_isFinishingRun) {
      console.log('[ResearchAgent] ⚠️  addResults: finishRun выполняется, добавляю в очередь');
      _pendingResultsQueues.push(newResults);
      return;
    }

    console.log('[ResearchAgent] 📥 addResults:', newResults.length, 'результатов, всего в буфере:', _resultsBuffer.length + newResults.length);
    _resultsBuffer.push(...newResults);
  }

  // ─── API: Завершить прогон и сохранить ─────────────────────

  async function finishRun(metadata = {}) {
    console.log('[ResearchAgent] finishRun: вызована', { _currentRunId, bufLen: _resultsBuffer.length, _isFinishingRun, metadata });

    // Защита от параллельных вызовов finishRun()
    if (_isFinishingRun) {
      console.log('[ResearchAgent] finishRun: уже выполняется, пропуск');
      return;
    }

    if (!_currentRunId) {
      console.error('[ResearchAgent] finishRun: ОШИБКА - нет _currentRunId! startRun() не был вызван или был очищен раньше времени');
      return;
    }

    if (_resultsBuffer.length === 0) {
      console.log('[ResearchAgent] finishRun: пропуск - буфер пустой (очередь переместится в finishRun)');
      // Это может быть OK если есть очередь
      if (_pendingResultsQueues.length === 0) {
        console.log('[ResearchAgent] finishRun: нет данных в буфере и очереди');
        return;
      }
    }

    _isFinishingRun = true;

    const db = await _initDB();
    const projectId = ProjectManager?.getCurrentId() || 'default';

    // Синхронизировать projectId в localStorage для консистентности
    localStorage.setItem('_currentProjectId', projectId);

    console.log('[ResearchAgent] 💾 finishRun: сохраняю', _resultsBuffer.length, 'результатов, projectId=' + projectId);

    const run = {
      id: _currentRunId,
      timestamp: Date.now(),
      projectId: projectId,
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

    // 🤖 Анализ результатов (если доступен ResearchAnalysis)
    if (typeof ResearchAnalysis !== 'undefined' && run.results.length >= 10) {
      try {
        run.analysis = await ResearchAnalysis.analyzeResults(run.results);
        console.log(`[ResearchAgent] 📊 Анализ завершён: ${run.analysis.insights.length} инсайтов`);
      } catch (e) {
        console.warn('[ResearchAgent] Ошибка анализа:', e);
      }
    }

    // Сохранить в IndexedDB
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_RUNS], 'readwrite');
      const store = tx.objectStore(STORE_RUNS);
      const addReq = store.add(run);

      addReq.onerror = () => {
        console.warn('[ResearchAgent] Ошибка добавления в IndexedDB:', addReq.error);
      };

      tx.oncomplete = async () => {
        console.log(`[ResearchAgent] 💾 Сохранено: ${run.resultCount} результатов (${_currentRunId})`);

        // Экспортировать в папку проекта (ошибки экспорта не должны блокировать finishRun)
        try {
          if (ProjectManager?.getCurrentId()) {
            await _exportToProjectFolder(run);
          }
        } catch (e) {
          console.warn('[ResearchAgent] Ошибка экспорта (некритичная):', e);
        }

        // Перенести очереди результатов обратно в буфер если есть новые результаты
        if (_pendingResultsQueues.length > 0) {
          console.log('[ResearchAgent] ℹ️  Обработка', _pendingResultsQueues.length, 'очередей результатов');
          const allQueued = [];
          for (const queue of _pendingResultsQueues) {
            allQueued.push(...queue);
          }
          _resultsBuffer = allQueued;
          _pendingResultsQueues = [];
        } else {
          _resultsBuffer = [];
        }

        _currentRunId = null;
        _isFinishingRun = false;
        resolve(run);
      };

      tx.onerror = () => {
        console.error('[ResearchAgent] Транзакция IndexedDB ошибка:', tx.error);
        // Перенести очередь обратно в буфер для переПопытки
        if (_pendingResultsQueues.length > 0) {
          const allQueued = [];
          for (const queue of _pendingResultsQueues) {
            allQueued.push(...queue);
          }
          _resultsBuffer = allQueued;
          _pendingResultsQueues = [];
        }
        _currentRunId = null;
        _isFinishingRun = false;
        reject(tx.error);
      };
    });
  }

  // ─── Экспорт в папку проекта (.research/YYYY-MM-DD.json) ───

  async function _exportToProjectFolder(run) {
    try {
      const projId = ProjectManager?.getCurrentId();
      if (!projId) return;

      // Проверяем наличие API File System Access
      if (typeof ProjectManager.getDirectoryHandle !== 'function') {
        console.warn('[ResearchAgent] ProjectManager.getDirectoryHandle не доступен (нет File System Access API)');
        return;
      }

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
        const allRuns = req.result || [];
        if (!Array.isArray(allRuns)) {
          console.error('[ResearchAgent] loadHistory: req.result не массив', typeof allRuns);
          resolve([]);
          return;
        }
        const runs = allRuns
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, limit);
        console.log('[ResearchAgent] loadHistory: найдено', allRuns.length, 'runs, возвращаю', runs.length);
        resolve(runs);
      };
      req.onerror = () => reject(req.error);
      tx.onerror = () => reject(tx.error);
    });
  }

  // ─── API: Получить все результаты из истории ────────────────

  async function getAllResultsFromHistory(projectId, timeWindow = null) {
    const runs = await loadHistory(projectId, 1000);
    console.log('[ResearchAgent] getAllResultsFromHistory: получено', runs.length, 'runs');

    const results = [];
    const cutoff = timeWindow ? Date.now() - timeWindow : 0;

    for (const run of runs) {
      if (!run || !run.timestamp) {
        console.log('[ResearchAgent] getAllResultsFromHistory: пропуск null run');
        continue;
      }
      if (run.timestamp < cutoff) {
        console.log('[ResearchAgent] getAllResultsFromHistory: timestamp < cutoff, break');
        break;
      }
      if (run.results && Array.isArray(run.results)) {
        console.log('[ResearchAgent] getAllResultsFromHistory: добавляю', run.results.length, 'результатов из run');
        results.push(...run.results);
      } else {
        console.log('[ResearchAgent] getAllResultsFromHistory: run.results не массив или не существует', { hasResults: !!run.results, isArray: Array.isArray(run.results) });
      }
    }

    console.log('[ResearchAgent] getAllResultsFromHistory: итого', results.length, 'результатов');
    return results;
  }

  // ─── API: Получить статус агента ──────────────────────────────

  async function getStatus() {
    const db = await _initDB();
    const projectId = ProjectManager?.getCurrentId() || localStorage.getItem('_currentProjectId') || 'default';

    console.log('[ResearchAgent] getStatus: ищу данные для projectId=' + projectId);

    return new Promise((resolve) => {
      const tx = db.transaction([STORE_RUNS], 'readonly');
      const store = tx.objectStore(STORE_RUNS);
      const index = store.index('projectId');

      const req = index.getAll(projectId);
      req.onsuccess = () => {
        const runs = req.result || [];
        const totalData = runs.reduce((sum, r) => sum + (r.resultCount || 0), 0);
        const lastRun = runs.length > 0 ? runs[runs.length - 1] : null;

        console.log('[ResearchAgent] getStatus результат:', { runs: runs.length, totalData, projectId });

        resolve({
          totalRuns: runs.length,
          totalDataPoints: totalData,
          lastAnalysisTime: _lastAnalysisTime ? new Date(_lastAnalysisTime) : null,
          lastRunTime: lastRun ? new Date(lastRun.timestamp) : null,
          isAnalyzing: _isAnalyzing,
          lastAnalysisRunId: runs[0]?.id || null
        });
      };
      req.onerror = () => {
        console.error('[ResearchAgent] getStatus: ошибка запроса', req.error);
        resolve({ totalRuns: 0, totalDataPoints: 0, lastAnalysisTime: null, lastRunTime: null, isAnalyzing: false });
      };
      tx.onerror = () => {
        console.error('[ResearchAgent] getStatus: ошибка транзакции', tx.error);
        resolve({ totalRuns: 0, totalDataPoints: 0, lastAnalysisTime: null, lastRunTime: null, isAnalyzing: false });
      };
    });
  }

  // ─── API: Запустить анализ вручную ────────────────────────────

  async function runAnalysisManually() {
    if (_isAnalyzing) {
      console.warn('[ResearchAgent] Анализ уже запущен');
      return null;
    }

    _isAnalyzing = true;
    const projectId = ProjectManager?.getCurrentId() || localStorage.getItem('_currentProjectId') || 'default';
    console.log('[ResearchAgent] runAnalysisManually: projectId=' + projectId);

    try {
      // Получить все накопленные результаты
      const allResults = await getAllResultsFromHistory(projectId);
      console.log('[ResearchAgent] runAnalysisManually: получено', allResults.length, 'результатов');

      if (allResults.length === 0) {
        console.warn('[ResearchAgent] Нет результатов для анализа');
        _isAnalyzing = false;
        return null;
      }

      // Запустить анализ
      if (typeof ResearchAnalysis === 'undefined') {
        console.error('[ResearchAgent] ResearchAnalysis не загружен');
        _isAnalyzing = false;
        return null;
      }

      const analysis = await ResearchAnalysis.analyzeResults(allResults);

      // 🔥 СОХРАНИТЬ ИНСАЙТЫ В INDEXEDDB
      const db = await _initDB();
      const insightRecord = {
        id: `insight_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        timestamp: Date.now(),
        projectId: projectId,
        analysis: analysis,
        resultCount: allResults.length
      };

      await new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_INSIGHTS], 'readwrite');
        const store = tx.objectStore(STORE_INSIGHTS);
        const req = store.add(insightRecord);

        req.onerror = () => reject(req.error);
        tx.oncomplete = () => {
          console.log('[ResearchAgent] 💾 Инсайты сохранены в IndexedDB');
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      });

      // Обновить время последнего анализа
      _lastAnalysisTime = new Date().toISOString();
      localStorage.setItem('_raLastAnalysisTime', _lastAnalysisTime);

      _isAnalyzing = false;
      console.log('[ResearchAgent] ✅ Анализ завершён:', analysis.summary);

      return analysis;
    } catch (e) {
      console.error('[ResearchAgent] Ошибка анализа:', e);
      _isAnalyzing = false;
      return null;
    }
  }

  async function getLatestInsights(projectId, limit = 1) {
    const db = await _initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_INSIGHTS], 'readonly');
      const store = tx.objectStore(STORE_INSIGHTS);

      // Если есть индекс по projectId, использовать его, иначе использовать getAll
      let req;
      try {
        const index = store.index('projectId');
        req = index.getAll(projectId);
      } catch (e) {
        // Если индекса нет, получить все и отфильтровать
        req = store.getAll();
      }

      req.onsuccess = () => {
        const records = (req.result || [])
          .filter(r => !projectId || r.projectId === projectId)
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, limit);
        resolve(records);
      };

      req.onerror = () => reject(req.error);
      tx.onerror = () => reject(tx.error);
    });
  }

  // ─── Диагностика (для отладки) ──────────────────────────────

  function getDebugInfo() {
    return {
      currentRunId: _currentRunId,
      bufferSize: _resultsBuffer.length,
      isAnalyzing: _isAnalyzing,
      dbInitialized: _db !== null,
      lastAnalysisTime: _lastAnalysisTime
    };
  }

  // ─── Public API ─────────────────────────────────────────────

  return {
    startRun,
    addResults,
    finishRun,
    loadHistory,
    getAllResultsFromHistory,
    getStatus,
    runAnalysisManually,
    getLatestInsights,
    getDebugInfo
  };
})();

// ─── Интеграция с runOpt: автоматическое сохранение ────────────
// Добавить в конец runOpt() в opt.js:
//   window._queueMode && ResearchAgent.addResults(results);
// Добавить в finally блок runQueue() в ui.js:
//   ResearchAgent.finishRun({ queueTaskCount: tasks.length });
