// ##ARCHIVE## Управление архивом опций (параметров/фильтров)
// Позволяет скрывать неиспользуемые опции в отдельный архив
// Состояние сохраняется в localStorage и синхронизируется при загрузке страницы

const ARCHIVE_KEY = 'archived_filter_options';

/**
 * Получить список архивированных опций из localStorage
 * @returns {Object} { fieldId: {label, timestamp}, ... }
 */
function getArchivedOptions() {
  return JSON.parse(localStorage.getItem(ARCHIVE_KEY) || '{}');
}

/**
 * Архивировать опцию (скрыть из основного списка)
 * @param {string} fieldId - ID элемента (например, 'f_ma', 'f_rsi')
 * @param {string} fieldLabel - Название опции для отображения в архиве
 */
function archiveOption(fieldId, fieldLabel) {
  const archived = getArchivedOptions();
  archived[fieldId] = {
    label: fieldLabel || fieldId,
    timestamp: Date.now()
  };
  localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archived));
  updateArchiveUI();

  // Скрыть элемент из основного интерфейса
  const element = document.getElementById(fieldId);
  if (element) {
    element.style.display = 'none';
  }
}

/**
 * Восстановить опцию из архива (показать в основном списке)
 * @param {string} fieldId - ID элемента
 */
function unarchiveOption(fieldId) {
  const archived = getArchivedOptions();
  delete archived[fieldId];
  localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archived));
  updateArchiveUI();

  // Показать элемент в основном интерфейсе
  const element = document.getElementById(fieldId);
  if (element) {
    element.style.display = '';
  }
}

/**
 * Обновить UI: счётчик архива и список архивированных опций
 */
function updateArchiveUI() {
  const archived = getArchivedOptions();
  const count = Object.keys(archived).length;

  // Обновить счётчик в кнопке
  const countEl = document.getElementById('archive-count');
  if (countEl) countEl.textContent = count;

  // Скрыть/показать кнопку если есть архивированные опции
  const btnArchive = document.getElementById('btn-archive-tab');
  if (btnArchive) {
    btnArchive.style.opacity = count > 0 ? '1' : '0.5';
  }

  // Отрендерить список архивированных опций
  renderArchivedOptions();
}

/**
 * Отрендерить список архивированных опций
 */
function renderArchivedOptions() {
  const archived = getArchivedOptions();
  const container = document.getElementById('archived-options-list');
  const emptyMsg = document.getElementById('archived-empty');

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
    const dateObj = new Date(data.timestamp);
    date.textContent = dateObj.toLocaleDateString('ru-RU');

    item.appendChild(name);
    item.appendChild(date);

    // Контекстное меню при правом клике
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showArchiveContextMenu(e, fieldId);
    });

    // Двойной клик для быстрого восстановления
    item.addEventListener('dblclick', () => {
      unarchiveOption(fieldId);
    });

    container.appendChild(item);
  });
}

/**
 * Показать контекстное меню для архивированной опции
 */
function showArchiveContextMenu(event, fieldId) {
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.innerHTML = `
    <button onclick="unarchiveOption('${fieldId}'); document.querySelector('.context-menu').remove()">
      ↩️ Восстановить
    </button>
  `;

  menu.style.left = event.pageX + 'px';
  menu.style.top = event.pageY + 'px';
  document.body.appendChild(menu);

  // Удалить меню при клике в другое место
  const removeMenu = () => {
    if (menu.parentNode) menu.remove();
    document.removeEventListener('click', removeMenu);
  };
  document.addEventListener('click', removeMenu);
}

/**
 * Переключить видимость панели архива
 */
function toggleArchiveTab() {
  const panel = document.getElementById('archived-options-panel');
  if (panel) {
    panel.classList.toggle('active');
  }
}

/**
 * Инициализировать архив при загрузке страницы
 */
document.addEventListener('DOMContentLoaded', () => {
  // Скрыть архивированные опции при загрузке
  const archived = getArchivedOptions();
  Object.keys(archived).forEach(fieldId => {
    const element = document.getElementById(fieldId);
    if (element) {
      element.style.display = 'none';
    }
  });

  // Обновить UI архива
  updateArchiveUI();

  // Привязать контекстные меню ко всем элементам опций
  attachContextMenusToAllOptions();
});

/**
 * Добавить контекстное меню ко всем элементам в панелях (label, checkbox, input и т.д.)
 * Вызывается динамически при создании новых элементов
 */
function attachArchiveContextMenu(element, label) {
  if (!element || !element.id) return;

  element.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showOptionContextMenu(e, element.id, label || element.textContent);
  });
}

/**
 * Показать контекстное меню для опции в основном списке
 */
function showOptionContextMenu(event, fieldId, fieldLabel) {
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.innerHTML = `
    <button onclick="archiveOption('${fieldId}', '${fieldLabel.replace(/'/g, "\\'")}'); document.querySelector('.context-menu').remove()">
      💾 Архивировать
    </button>
  `;

  menu.style.left = event.pageX + 'px';
  menu.style.top = event.pageY + 'px';
  document.body.appendChild(menu);

  // Удалить меню при клике в другое место
  const removeMenu = () => {
    if (menu.parentNode) menu.remove();
    document.removeEventListener('click', removeMenu);
  };
  document.addEventListener('click', removeMenu);
}

/**
 * Привязать контекстные меню ко всем элементам опций в панелях
 */
function attachContextMenusToAllOptions() {
  // Ищем все input и select элементы с ID начинающимся с e_, f_, x_, c_
  const optionElements = document.querySelectorAll('input[id^="e_"], input[id^="f_"], input[id^="x_"], input[id^="c_"], select[id^="e_"], select[id^="f_"], select[id^="x_"], select[id^="c_"]');

  optionElements.forEach(element => {
    if (!element.id) return;

    // Получить label если он есть
    let label = element.id;
    let labelEl = null;

    // Ищем label в нескольких местах
    if (element.parentElement) {
      labelEl = element.parentElement.querySelector('label');
      if (!labelEl && element.nextElementSibling?.tagName === 'LABEL') {
        labelEl = element.nextElementSibling;
      }
    }

    if (labelEl) {
      label = labelEl.textContent.trim() || element.id;
    }

    // Привязать контекстное меню к самому input/select
    attachArchiveContextMenu(element, label);

    // Привязать контекстное меню и к label элементу
    if (labelEl) {
      attachArchiveContextMenu(labelEl, label);
    }

    // Привязать также к родительскому div (если это .cb или .field)
    const parent = element.parentElement;
    if (parent && (parent.classList.contains('cb') || parent.classList.contains('field'))) {
      attachArchiveContextMenu(parent, label);
    }
  });
}

// Экспорт для использования в других модулях
window.archiveOptions = {
  archive: archiveOption,
  unarchive: unarchiveOption,
  attachContextMenu: attachArchiveContextMenu,
  getArchived: getArchivedOptions,
  updateUI: updateArchiveUI
};
