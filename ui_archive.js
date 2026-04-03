// ##ARCHIVE## Управление архивом опций (параметров/фильтров)
// Позволяет скрывать неиспользуемые опции в отдельный архив
// Состояние сохраняется в localStorage и синхронизируется при загрузке страницы

const ARCHIVE_KEY = 'archived_filter_options';

function getArchivedOptions() {
  return JSON.parse(localStorage.getItem(ARCHIVE_KEY) || '{}');
}

function archiveOption(fieldId, fieldLabel) {
  const archived = getArchivedOptions();
  archived[fieldId] = { label: fieldLabel || fieldId, timestamp: Date.now() };
  localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archived));
  updateArchiveUI();

  // Скрываем родительский блок (.cb или .field), а не только input
  const el = document.getElementById(fieldId);
  if (el) {
    const block = el.closest('.cb, .field') || el;
    block.style.display = 'none';
  }
}

function unarchiveOption(fieldId) {
  const archived = getArchivedOptions();
  delete archived[fieldId];
  localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archived));
  updateArchiveUI();

  const el = document.getElementById(fieldId);
  if (el) {
    const block = el.closest('.cb, .field') || el;
    block.style.display = '';
  }
}

function updateArchiveUI() {
  const archived = getArchivedOptions();
  const count = Object.keys(archived).length;

  const countEl = document.getElementById('archive-count');
  if (countEl) countEl.textContent = count;

  const btnArchive = document.getElementById('btn-archive-tab');
  if (btnArchive) btnArchive.style.opacity = count > 0 ? '1' : '0.5';

  renderArchivedOptions();
}

function renderArchivedOptions() {
  const archived = getArchivedOptions();
  const container = document.getElementById('archived-options-list');
  const emptyMsg  = document.getElementById('archived-empty');
  if (!container) return;

  container.innerHTML = '';

  if (Object.keys(archived).length === 0) {
    if (emptyMsg) emptyMsg.style.display = 'block';
    return;
  }
  if (emptyMsg) emptyMsg.style.display = 'none';

  Object.entries(archived).forEach(([fieldId, data]) => {
    const item = document.createElement('div');
    item.className = 'archived-option';
    item.id = 'arch-' + fieldId;

    const name = document.createElement('span');
    name.className = 'archived-option-name';
    name.textContent = data.label || fieldId;

    const date = document.createElement('span');
    date.className = 'archived-option-date';
    date.textContent = new Date(data.timestamp).toLocaleDateString('ru-RU');

    item.appendChild(name);
    item.appendChild(date);

    // Двойной клик — быстрое восстановление
    item.addEventListener('dblclick', () => unarchiveOption(fieldId));

    container.appendChild(item);
  });
}

function toggleArchiveTab() {
  const panel = document.getElementById('archived-options-panel');
  if (panel) panel.classList.toggle('active');
}

// ── Единое делегированное контекстное меню ──────────────────────────────────
// Один обработчик на document (capture) вместо тысячи на каждый элемент.
// capture=true гарантирует срабатывание ДО того как браузер успевает показать своё меню.

document.addEventListener('contextmenu', (e) => {
  _handlePanelsContextMenu(e);
  _handleArchivedPanelContextMenu(e);
}, true);

function _handlePanelsContextMenu(e) {
  const panels = document.getElementById('panels');
  if (!panels || !panels.contains(e.target)) return;

  // Ищем ближайший блок опции
  const block = e.target.closest('.cb, .field');
  if (!block) return;

  // Ищем основной input/select с архивируемым ID
  const input = block.querySelector(
    'input[id^="e_"], input[id^="f_"], input[id^="x_"], ' +
    'select[id^="e_"], select[id^="f_"], select[id^="x_"]'
  );
  if (!input) return;

  e.preventDefault();
  e.stopPropagation();

  const label = block.querySelector('label')?.textContent?.trim() || input.id;
  _showOptionContextMenu(e, input.id, label);
}

function _handleArchivedPanelContextMenu(e) {
  const archList = document.getElementById('archived-options-list');
  if (!archList || !archList.contains(e.target)) return;

  const item = e.target.closest('.archived-option');
  if (!item) return;

  const fieldId = item.id.replace('arch-', '');
  if (!fieldId) return;

  e.preventDefault();
  e.stopPropagation();

  _showArchiveContextMenu(e, fieldId);
}

function _showOptionContextMenu(event, fieldId, fieldLabel) {
  _removeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  const safeName = fieldLabel.replace(/'/g, "\\'");
  menu.innerHTML = `<button onclick="archiveOption('${fieldId}', '${safeName}'); _removeContextMenu()">💾 Архивировать</button>`;
  _positionAndShow(menu, event);
}

function _showArchiveContextMenu(event, fieldId) {
  _removeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.innerHTML = `<button onclick="unarchiveOption('${fieldId}'); _removeContextMenu()">↩️ Восстановить</button>`;
  _positionAndShow(menu, event);
}

function _positionAndShow(menu, event) {
  // clientX/clientY корректны для position:fixed (не зависят от скролла)
  menu.style.left = event.clientX + 'px';
  menu.style.top  = event.clientY + 'px';
  document.body.appendChild(menu);

  const removeOnClick = (ev) => {
    if (!menu.contains(ev.target)) {
      _removeContextMenu();
      document.removeEventListener('mousedown', removeOnClick, true);
    }
  };
  // mousedown вместо click — срабатывает быстрее и не конфликтует с кнопками меню
  document.addEventListener('mousedown', removeOnClick, true);
}

function _removeContextMenu() {
  document.querySelectorAll('.context-menu').forEach(m => m.remove());
}

// ── Инициализация ────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const archived = getArchivedOptions();
  Object.keys(archived).forEach(fieldId => {
    const el = document.getElementById(fieldId);
    if (el) {
      const block = el.closest('.cb, .field') || el;
      block.style.display = 'none';
    }
  });
  updateArchiveUI();
});

window.archiveOptions = {
  archive:    archiveOption,
  unarchive:  unarchiveOption,
  getArchived: getArchivedOptions,
  updateUI:   updateArchiveUI
};
