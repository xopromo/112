// ═══════════════════════════════════════════════════════════════════════════
// RESEARCH AGENT UI — Визуализация инсайтов из анализа результатов
// ═══════════════════════════════════════════════════════════════════════════

// Открыть модаль Research с инсайтами
async function openResearchModal() {
  document.getElementById('research-modal')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'research-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;display:flex;align-items:center;justify-content:center';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);

  const box = document.createElement('div');
  box.style.cssText = 'background:var(--bg2,#1e1e2e);border:1px solid rgba(139,92,246,.45);border-radius:8px;padding:20px;width:min(900px,95vw);max-height:90vh;overflow-y:auto;color:var(--fg,#cdd6f4)';
  overlay.appendChild(box);

  // Загружаем историю и статус из ResearchAgent
  let insights = null;
  let history = null;
  let status = null;

  if (typeof ResearchAgent !== 'undefined') {
    const currentProjectId = ProjectManager?.getCurrentId() || localStorage.getItem('_currentProjectId') || 'default';
    history = await ResearchAgent.loadHistory(currentProjectId, 50);
    status = await ResearchAgent.getStatus();

    // 🔥 ПРАВИЛЬНО: загружаем последний анализ отдельно, а не из latestRun
    const latestInsights = await ResearchAgent.getLatestInsights(currentProjectId, 1);
    if (latestInsights && latestInsights.length > 0) {
      insights = latestInsights[0].analysis;
    }
  }

  const headerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <span style="font-weight:600">📊 Research Agent</span>
      <button onclick="document.getElementById('research-modal').remove()" style="background:none;border:none;color:var(--fg,#cdd6f4);cursor:pointer;font-size:1.2em">✕</button>
    </div>`;

  // Статус панель
  const statusHTML = status ? `
    <div style="background:rgba(139,92,246,.08);border:1px solid rgba(139,92,246,.2);border-radius:6px;padding:12px;margin-bottom:12px;font-size:.85em">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:10px">
        <div>
          <div style="color:#888;font-size:.75em;margin-bottom:2px">📊 Накоплено данных</div>
          <div style="color:#a6e3a1;font-weight:600">${status.totalDataPoints} результатов</div>
        </div>
        <div>
          <div style="color:#888;font-size:.75em;margin-bottom:2px">🔄 Прогонов</div>
          <div style="color:#f9e2af;font-weight:600">${status.totalRuns}</div>
        </div>
        <div>
          <div style="color:#888;font-size:.75em;margin-bottom:2px">⏱️ Последний прогон</div>
          <div style="color:#cdd6f4;font-weight:600;font-size:.8em">${status.lastRunTime ? new Date(status.lastRunTime).toLocaleString('ru-RU').split(' ')[1] : '—'}</div>
        </div>
        <div>
          <div style="color:#888;font-size:.75em;margin-bottom:2px">✅ Последний анализ</div>
          <div style="color:${status.lastAnalysisTime ? '#a6e3a1' : '#888'};font-weight:600;font-size:.8em">${status.lastAnalysisTime ? new Date(status.lastAnalysisTime).toLocaleString('ru-RU').split(' ')[1] : 'не проводился'}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button onclick="_runResearchAnalysisManually()" style="background:rgba(166,227,161,.2);border:1px solid rgba(166,227,161,.6);color:#a6e3a1;border-radius:4px;padding:6px 12px;cursor:pointer;font-size:.8em;font-weight:600" ${status.isAnalyzing ? 'disabled style="opacity:.5;cursor:not-allowed"' : ''}>
          ${status.isAnalyzing ? '⏳ Анализирует...' : '▶️ Запустить анализ'}
        </button>
        <button onclick="openResearchModal()" style="background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.4);color:#a78bfa;border-radius:4px;padding:6px 12px;cursor:pointer;font-size:.8em" title="Обновить статус">🔄 Обновить</button>
      </div>
    </div>` : '';

  if (!insights && !status) {
    box.innerHTML = headerHTML + `
      <div style="color:#888;font-size:.9em;padding:20px;text-align:center">
        ℹ️ Research Agent не инициализирован. Запустите оптимизацию или очередь задач.
      </div>`;
    return;
  }

  if (!insights) {
    box.innerHTML = headerHTML + statusHTML + `
      <div style="color:#888;font-size:.9em;padding:20px;text-align:center">
        ℹ️ Нет накопленных результатов для анализа. Запустите оптимизацию или очередь задач.
      </div>`;
    return;
  }

  box.innerHTML = headerHTML + statusHTML + `
    <div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap;border-bottom:1px solid #444;padding-bottom:10px">
      <button onclick="document.querySelector('[data-tab=overview]')?.click()" style="background:rgba(139,92,246,.2);border:1px solid rgba(139,92,246,.6);color:var(--fg,#cdd6f4);border-radius:4px;padding:4px 12px;cursor:pointer;font-size:.82em">📊 Обзор</button>
      <button onclick="document.querySelector('[data-tab=correlations]')?.click()" style="background:none;border:1px solid #444;color:var(--fg,#cdd6f4);border-radius:4px;padding:4px 12px;cursor:pointer;font-size:.82em">🔗 Корреляции</button>
      <button onclick="document.querySelector('[data-tab=anomalies]')?.click()" style="background:none;border:1px solid #444;color:var(--fg,#cdd6f4);border-radius:4px;padding:4px 12px;cursor:pointer;font-size:.82em">⚠️ Аномалии</button>
      <button onclick="document.querySelector('[data-tab=clusters]')?.click()" style="background:none;border:1px solid #444;color:var(--fg,#cdd6f4);border-radius:4px;padding:4px 12px;cursor:pointer;font-size:.82em">🎯 Кластеры</button>
      <button onclick="document.querySelector('[data-tab=features]')?.click()" style="background:none;border:1px solid #444;color:var(--fg,#cdd6f4);border-radius:4px;padding:4px 12px;cursor:pointer;font-size:.82em">⭐ Факторы</button>
      <button onclick="document.querySelector('[data-tab=history]')?.click()" style="background:none;border:1px solid #444;color:var(--fg,#cdd6f4);border-radius:4px;padding:4px 12px;cursor:pointer;font-size:.82em">📈 История</button>
    </div>
    <div id="research-modal-content">
      ${_renderResearchOverview(insights, history)}
    </div>`;

  // Навешиваем обработчики для переключения вкладок
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.onclick = async (e) => {
      e.preventDefault();
      const tab = btn.dataset.tab;
      const content = document.getElementById('research-modal-content');
      if (!content) return;

      // Подсвечиваем активную кнопку
      document.querySelectorAll('[data-tab]').forEach(b => {
        b.style.background = b.dataset.tab === tab ? 'rgba(139,92,246,.2)' : 'none';
        b.style.borderColor = b.dataset.tab === tab ? 'rgba(139,92,246,.6)' : '#444';
      });

      if (tab === 'overview') {
        content.innerHTML = _renderResearchOverview(insights, history);
      } else if (tab === 'correlations') {
        content.innerHTML = _renderCorrelations(insights);
      } else if (tab === 'anomalies') {
        content.innerHTML = _renderAnomalies(insights);
      } else if (tab === 'clusters') {
        content.innerHTML = _renderClusters(insights);
      } else if (tab === 'features') {
        content.innerHTML = _renderFeatures(insights);
      } else if (tab === 'history') {
        content.innerHTML = await _renderHistory(history);
      }
    };
  });
}

function _renderResearchOverview(insights, history) {
  if (!insights) return '<p style="color:#888">No insights available</p>';

  const summary = insights.summary || {};
  const correlations = insights.correlations || [];
  const anomalies = insights.anomalies || [];
  const clusters = insights.clusters || [];

  const topCorr = correlations
    .filter(c => Math.abs(c.r) > 0.3)
    .sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
    .slice(0, 3);

  const topAnom = anomalies.slice(0, 3);
  const topClust = clusters.slice(0, 2);

  const historyStats = history && history.length > 0 ? {
    totalRuns: history.length,
    avgResults: Math.round(history.reduce((sum, h) => sum + (h.resultCount || 0), 0) / history.length),
    latestDate: new Date(history[0].timestamp).toLocaleString('ru-RU')
  } : null;

  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div style="background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.3);border-radius:6px;padding:12px">
        <div style="font-size:.9em;color:#a78bfa;margin-bottom:4px">📊 Статистика</div>
        <div style="font-size:.85em;color:#888">
          Успешных стратегий: <strong style="color:var(--fg,#cdd6f4)">${summary.successCount || 0}</strong><br/>
          Средний PnL: <strong style="color:#a6e3a1">${(summary.avgPnl || 0).toFixed(2)}%</strong><br/>
          Средний WR: <strong style="color:#f9e2af">${(summary.avgWr || 0).toFixed(1)}%</strong><br/>
          Средний DD: <strong style="color:#f38ba8">${(summary.avgDd || 0).toFixed(1)}%</strong>
        </div>
      </div>

      <div style="background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.3);border-radius:6px;padding:12px">
        <div style="font-size:.9em;color:#a78bfa;margin-bottom:4px">⏱️ История прогонов</div>
        <div style="font-size:.85em;color:#888">
          ${historyStats ? `
            Всего прогонов: <strong style="color:var(--fg,#cdd6f4)">${historyStats.totalRuns}</strong><br/>
            Средних результатов: <strong style="color:var(--fg,#cdd6f4)">${historyStats.avgResults}</strong><br/>
            Последний прогон: <strong style="color:#a78bfa">${historyStats.latestDate}</strong>
          ` : '—'}
        </div>
      </div>
    </div>

    <div style="margin-bottom:16px">
      <div style="font-size:.95em;color:#a78bfa;margin-bottom:8px;font-weight:600">🔗 Топ корреляции с результатами</div>
      <div style="display:grid;gap:6px">
        ${topCorr.length > 0 ? topCorr.map(c => `
          <div style="background:rgba(139,92,246,.08);border:1px solid rgba(139,92,246,.2);border-radius:4px;padding:8px;font-size:.85em">
            <div style="display:flex;justify-content:space-between">
              <span><strong>${c.param}</strong> ↔️ ${c.metric}</span>
              <span style="color:${c.r > 0.5 ? '#a6e3a1' : c.r > 0.3 ? '#f9e2af' : '#f38ba8'}">r = ${c.r.toFixed(3)}</span>
            </div>
          </div>
        `).join('') : '<div style="color:#666">Корреляции не найдены</div>'}
      </div>
    </div>

    <div style="margin-bottom:16px">
      <div style="font-size:.95em;color:#a78bfa;margin-bottom:8px;font-weight:600">⚠️ Аномальные конфигурации</div>
      <div style="display:grid;gap:6px">
        ${topAnom.length > 0 ? topAnom.map(a => `
          <div style="background:rgba(255,107,107,.1);border:1px solid rgba(255,107,107,.3);border-radius:4px;padding:8px;font-size:.85em">
            <div><strong>PnL: ${(a.pnl || 0).toFixed(2)}%</strong> (z-score: ${(a.z || 0).toFixed(2)})</div>
            <div style="color:#888;font-size:.8em;margin-top:4px">
              Параметры: ${Object.entries(a.config || {}).slice(0, 3).map(([k,v]) => k + '=' + v).join(', ')}
            </div>
          </div>
        `).join('') : '<div style="color:#666">Аномалии не найдены</div>'}
      </div>
    </div>

    <div style="margin-bottom:16px">
      <div style="font-size:.95em;color:#a78bfa;margin-bottom:8px;font-weight:600">🎯 Успешные кластеры</div>
      <div style="display:grid;gap:6px">
        ${topClust.length > 0 ? topClust.map((c, i) => `
          <div style="background:rgba(166,227,161,.1);border:1px solid rgba(166,227,161,.3);border-radius:4px;padding:8px;font-size:.85em">
            <div style="color:#a6e3a1;font-weight:600">Кластер ${i + 1}</div>
            <div style="color:#888;font-size:.8em;margin-top:4px">
              Размер: ${c.size} | Avg PnL: ${(c.avgPnl || 0).toFixed(2)}% | Avg WR: ${(c.avgWr || 0).toFixed(1)}%
            </div>
          </div>
        `).join('') : '<div style="color:#666">Кластеры не найдены</div>'}
      </div>
    </div>
  `;
}

function _renderCorrelations(insights) {
  const corr = insights?.correlations || [];
  if (corr.length === 0) return '<p style="color:#888">Корреляции не найдены</p>';

  // Группируем по метрикам
  const byMetric = {};
  corr.forEach(c => {
    if (!byMetric[c.metric]) byMetric[c.metric] = [];
    byMetric[c.metric].push(c);
  });

  return `
    <div style="display:grid;gap:12px">
      ${Object.entries(byMetric).map(([metric, items]) => `
        <div>
          <div style="font-weight:600;color:#a78bfa;margin-bottom:8px">📍 Корреляции с ${metric}</div>
          <div style="display:grid;gap:6px">
            ${items.sort((a, b) => Math.abs(b.r) - Math.abs(a.r)).slice(0, 8).map(c => `
              <div style="display:flex;justify-content:space-between;background:rgba(139,92,246,.08);border:1px solid rgba(139,92,246,.2);border-radius:4px;padding:8px;font-size:.85em">
                <span>${c.param}</span>
                <span style="color:${c.r > 0.5 ? '#a6e3a1' : c.r > 0.3 ? '#f9e2af' : '#f38ba8'};font-weight:600">r = ${c.r.toFixed(3)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function _renderAnomalies(insights) {
  const anom = insights?.anomalies || [];
  if (anom.length === 0) return '<p style="color:#888">Аномалии не обнаружены</p>';

  return `
    <div style="display:grid;gap:8px;max-height:500px;overflow-y:auto">
      ${anom.slice(0, 15).map((a, i) => `
        <div style="background:rgba(255,107,107,.1);border:1px solid rgba(255,107,107,.3);border-radius:4px;padding:10px;font-size:.85em">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px">
            <strong style="color:#f38ba8">#${i + 1}</strong>
            <span style="color:#f9e2af">z = ${(a.z || 0).toFixed(2)}</span>
          </div>
          <div style="color:var(--fg,#cdd6f4);margin-bottom:4px">
            <strong>PnL: ${(a.pnl || 0).toFixed(2)}%</strong>
            | WR: ${(a.wr || 0).toFixed(1)}%
            | DD: ${(a.dd || 0).toFixed(1)}%
          </div>
          <div style="color:#888;font-size:.8em">
            ${Object.entries(a.config || {}).map(([k, v]) => `${k}=${v}`).join(', ').substring(0, 80)}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function _renderClusters(insights) {
  const clusters = insights?.clusters || [];
  if (clusters.length === 0) return '<p style="color:#888">Кластеры не найдены</p>';

  return `
    <div style="display:grid;gap:12px">
      ${clusters.slice(0, 5).map((c, i) => `
        <div style="background:rgba(166,227,161,.1);border:1px solid rgba(166,227,161,.3);border-radius:4px;padding:12px">
          <div style="font-weight:600;color:#a6e3a1;margin-bottom:8px">🎯 Кластер ${i + 1}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;font-size:.85em">
            <div style="background:rgba(0,0,0,.2);padding:6px;border-radius:4px">
              <div style="color:#888;font-size:.8em">Размер</div>
              <div style="color:#a6e3a1;font-weight:600">${c.size} стратегий</div>
            </div>
            <div style="background:rgba(0,0,0,.2);padding:6px;border-radius:4px">
              <div style="color:#888;font-size:.8em">Avg PnL</div>
              <div style="color:#f9e2af;font-weight:600">${(c.avgPnl || 0).toFixed(2)}%</div>
            </div>
            <div style="background:rgba(0,0,0,.2);padding:6px;border-radius:4px">
              <div style="color:#888;font-size:.8em">Avg WR</div>
              <div style="color:#f9e2af;font-weight:600">${(c.avgWr || 0).toFixed(1)}%</div>
            </div>
            <div style="background:rgba(0,0,0,.2);padding:6px;border-radius:4px">
              <div style="color:#888;font-size:.8em">Avg DD</div>
              <div style="color:#f38ba8;font-weight:600">${(c.avgDd || 0).toFixed(1)}%</div>
            </div>
          </div>
          <div style="font-size:.85em">
            <div style="color:#a78bfa;margin-bottom:4px">🔝 Топ конфиги:</div>
            ${(c.topConfigs || []).slice(0, 3).map(cfg => `
              <div style="color:#888;font-size:.8em;margin-left:8px">
                PnL: ${(cfg.pnl || 0).toFixed(2)}% | WR: ${(cfg.wr || 0).toFixed(1)}%
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function _renderFeatures(insights) {
  const features = insights?.featureImportance || [];
  if (features.length === 0) return '<p style="color:#888">Анализ факторов не доступен</p>';

  return `
    <div>
      <div style="font-size:.9em;color:#888;margin-bottom:12px">
        ℹ️ Параметры отранжированы по дискриминативной силе (т-score).
        Высокие значения означают, что параметр сильнее различает успешные и неудачные стратегии.
      </div>
      <div style="display:grid;gap:6px">
        ${features.slice(0, 15).map((f, i) => {
          const barWidth = Math.min(100, Math.abs(f.tScore || 0) * 10);
          return `
            <div style="font-size:.85em">
              <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                <strong>${f.param || 'unknown'}</strong>
                <span style="color:#a78bfa">${(f.tScore || 0).toFixed(3)}</span>
              </div>
              <div style="background:rgba(0,0,0,.3);border-radius:2px;height:6px;overflow:hidden">
                <div style="background:linear-gradient(90deg, #a6e3a1, #f9e2af);height:100%;width:${barWidth}%" />
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

async function _renderHistory(history) {
  if (!history || history.length === 0) {
    return '<p style="color:#888">История не доступна</p>';
  }

  return `
    <div style="display:grid;gap:8px;max-height:600px;overflow-y:auto">
      <div style="font-size:.9em;color:#888;margin-bottom:8px">
        Последние ${Math.min(20, history.length)} прогонов
      </div>
      ${history.slice(0, 20).map((h, i) => `
        <div style="background:rgba(139,92,246,.08);border:1px solid rgba(139,92,246,.2);border-radius:4px;padding:10px;font-size:.85em">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <strong>#${i + 1}</strong>
            <span style="color:#a78bfa">${new Date(h.timestamp).toLocaleString('ru-RU')}</span>
          </div>
          <div style="color:#888;font-size:.8em;display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div>Результатов: <strong style="color:var(--fg,#cdd6f4)">${h.resultCount || 0}</strong></div>
            <div>Задач: <strong style="color:var(--fg,#cdd6f4)">${h.taskCount || 0}</strong></div>
          </div>
          ${h.analysis?.summary ? `
            <div style="color:#888;font-size:.8em;margin-top:6px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
              <div>Avg PnL: <strong style="color:#a6e3a1">${(h.analysis.summary.avgPnl || 0).toFixed(2)}%</strong></div>
              <div>Avg WR: <strong style="color:#f9e2af">${(h.analysis.summary.avgWr || 0).toFixed(1)}%</strong></div>
              <div>Успешных: <strong style="color:#a78bfa">${h.analysis.summary.successCount || 0}</strong></div>
            </div>
          ` : ''}
        </div>
      `).join('')}
    </div>
  `;
}

// ─── Вспомогательная функция: запустить анализ вручную ────────

async function _runResearchAnalysisManually() {
  if (typeof ResearchAgent === 'undefined') {
    toast('❌ Research Agent не загружен', 2000);
    return;
  }

  const btn = event.target;
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Анализирует...';

  try {
    const analysis = await ResearchAgent.runAnalysisManually();

    if (analysis) {
      toast('✅ Анализ завершён успешно', 2000);
      // Переоткрыть modal с обновленными данными
      setTimeout(() => {
        openResearchModal();
      }, 500);
    } else {
      toast('⚠️ Нет результатов для анализа', 2000);
      btn.disabled = false;
      btn.textContent = originalText;
    }
  } catch (e) {
    console.error('Ошибка анализа:', e);
    toast('❌ Ошибка при анализе', 2000);
    btn.disabled = false;
    btn.textContent = originalText;
  }
}
