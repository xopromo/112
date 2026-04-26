// ============================================================
// VERSIONS VIEWER — простые ссылки на отдельные Pages-снимки
// ============================================================

const VERSIONS_DATA = [
  {
    key: 'current',
    title: 'Текущая версия',
    version: 'Current build',
    date: '2026-04-26',
    status: 'LIVE',
    emoji: '🟦',
    note: 'Актуальная сборка оптимизатора',
    url: './USE_Optimizer_v6_built.html'
  },
  {
    key: 'stable-2026-03-03',
    title: 'Стабильная версия',
    version: 'stable-2026-03-03',
    date: '2026-03-03',
    status: 'STABLE',
    emoji: '🟢',
    note: 'Стабильный снимок двухмесячной давности',
    url: './stable/2026-03-03/'
  },
  {
    key: 'stable-2026-03-07',
    title: 'Стабильная версия',
    version: 'stable-2026-03-07',
    date: '2026-03-07',
    status: 'STABLE',
    emoji: '🟢',
    note: 'Более поздняя мартовская стабильная версия',
    url: './stable/2026-03-07/'
  },
  {
    key: 'v6.2.2-before-audit',
    title: 'Версия перед аудитом',
    version: 'v6.2.2-before-audit',
    date: '2026-04-19',
    status: 'SNAPSHOT',
    emoji: '🟠',
    note: 'Рабочий снимок прямо перед стабилизационным аудитом',
    url: './stable/v6.2.2-before-audit/'
  }
];

function openVersionsModal() {
  _ensureVersionsModal();
  const overlay = document.getElementById('versions-modal-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  _renderVersionsList();
}

function closeVersionsModal() {
  const overlay = document.getElementById('versions-modal-overlay');
  if (overlay) overlay.style.display = 'none';
}

function _renderVersionsList() {
  const list = document.getElementById('versions-list');
  if (!list) return;
  list.innerHTML = VERSIONS_DATA.map(v => `
    <div style="border-bottom:1px solid var(--border);padding:16px 20px;display:flex;gap:14px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap">
      <div style="display:flex;gap:12px;align-items:flex-start;min-width:280px;flex:1">
        <div style="font-size:1.2em;line-height:1.2">${v.emoji}</div>
        <div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
            <strong style="color:var(--accent)">${v.version}</strong>
            <span style="color:var(--text3);font-size:.8em">${v.date}</span>
            <span style="color:var(--text3);font-size:.75em;background:var(--bg3);padding:2px 8px;border-radius:3px">${v.status}</span>
          </div>
          <div style="color:var(--text);font-size:.92em;margin-bottom:4px">${v.title}</div>
          <div style="color:var(--text2);font-size:.84em">${v.note}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <a href="${v.url}" target="_blank" rel="noopener noreferrer"
           style="padding:8px 12px;background:rgba(0,212,255,.15);border:1px solid var(--accent);border-radius:6px;color:var(--accent);font-size:.85em;text-decoration:none;white-space:nowrap">
          Открыть версию
        </a>
      </div>
    </div>
  `).join('');
}

function _ensureVersionsModal() {
  if (document.getElementById('versions-modal-overlay')) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div id="versions-modal-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;align-items:center;justify-content:center;padding:24px" onclick="if(event.target===this)closeVersionsModal()">
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;width:100%;max-width:900px;max-height:85vh;display:flex;flex-direction:column;overflow:hidden">
        <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
          <div style="display:flex;align-items:center;gap:12px">
            <span style="font-size:1.4em">🗂</span>
            <div>
              <h2 style="margin:0;color:var(--accent)">Версии</h2>
              <div style="font-size:.8em;color:var(--text3)">Отдельные страницы по датам: стабильные снимки и версия перед аудитом</div>
            </div>
          </div>
          <button onclick="closeVersionsModal()" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:1.3em">✕</button>
        </div>
        <div style="padding:12px 20px;background:var(--bg3);border-bottom:1px solid var(--border);font-size:.85em;color:var(--text2)">
          У каждой версии видны подпись, дата и тип. Открытие идет на отдельной надежной странице.
        </div>
        <div id="versions-list" style="flex:1;overflow-y:auto;padding:0">
          <div style="padding:20px;text-align:center;color:var(--text3)">Загрузка...</div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrap.firstElementChild);
}

try { window.openVersionsModal = openVersionsModal; } catch(e) {}
try { window.closeVersionsModal = closeVersionsModal; } catch(e) {}
