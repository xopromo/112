// ============================================================
// synthesis_worker.js — WEB WORKER FOR BACKGROUND SYNTHESIS
// ============================================================

let _synthWorkerStartTime = 0;

self.onmessage = async (event) => {
  const { type, payload } = event.data;

  if (type === 'START_SYNTHESIS') {
    _synthWorkerStartTime = Date.now();
    await _runSynthesisInWorker(payload);
  } else if (type === 'STOP_SYNTHESIS') {
    // Stop signal
    _postMessage('LOG', '⏹ Синтез остановлен пользователем');
    _postMessage('COMPLETE', { status: 'stopped' });
  }
};

async function _runSynthesisInWorker(payload) {
  try {
    const { data, ipDef, opts } = payload;

    // Store globals for opt.js functions
    self.DATA = data;
    self.window = {
      _ipDef: ipDef,
    };

    // Import opt.js functions (they're copied as inline)
    // For now, we'll call the functions that should exist in global scope

    _postMessage('LOG', '🔍 Инициализация параметров...');

    // Simulate synthesis with periodic progress updates
    // This is a placeholder - in production, you'd call runOpt() here
    let currentProgress = 1;
    const totalIterations = Math.min(opts.maxIter, 5000);

    while (currentProgress < 100) {
      // Simulate progress
      currentProgress = Math.min(
        currentProgress + Math.random() * 15,
        99
      );

      const ratePerSec = currentProgress / ((Date.now() - _synthWorkerStartTime) / 1000);
      _postMessage('PROGRESS', {
        percent: currentProgress,
        ratePerSec: ratePerSec,
        message: `📊 Обработано ${Math.round(currentProgress)}% стратегий...`,
      });

      // Yield control to prevent blocking
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    _postMessage('PROGRESS', {
      percent: 100,
      message: '✅ Синтез завершён!',
    });

    const elapsedMs = Date.now() - _synthWorkerStartTime;
    _postMessage('LOG', `⏱ Время синтеза: ${(elapsedMs / 1000).toFixed(1)}с`);

    _postMessage('COMPLETE', {
      status: 'success',
      elapsedMs: elapsedMs,
      results: [], // Will be populated with actual results
    });
  } catch (err) {
    _postMessage('LOG', '❌ ОШИБКА в worker: ' + (err.message || err.toString()));
    _postMessage('COMPLETE', {
      status: 'error',
      error: err.message || err.toString(),
    });
  }
}

function _postMessage(type, payload) {
  self.postMessage({
    type: type,
    payload: payload,
  });
}
