// ═══════════════════════════════════════════════════════════════
// CHANGELOG VIEWER — История изменений с поиском и фильтрами
// ═══════════════════════════════════════════════════════════════

// Данные логов (парсено из CHANGELOG.md)
const CHANGELOG_DATA = [
  {
    version: '6.2.2',
    date: '2026-04-14',
    status: 'STABLE',
    emoji: '🟢',
    sections: {
      'Исправлено': [
        { title: 'Избранные не сохранялись после перезагрузки (CRITICAL)', details: 'Повреждённые данные в localStorage/IndexedDB. Решение: очистка + валидация', link: 'https://github.com/xopromo/112/commit/39cc241' },
      ],
      'Добавлено': [
        { title: 'Валидация данных перед сохранением', details: 'Проверка целостности и required полей' },
        { title: 'Обработка ошибок при сохранении', details: 'QuotaExceededError, верификация, логирование, toast' },
      ],
      'Performance': [
        { title: 'Оптимизирована диагностика хранилища' },
        { title: 'Улучшена система двойного сохранения' },
      ],
    }
  },
  {
    version: '6.2.1',
    date: '2026-04-13',
    status: 'STABLE',
    emoji: '🟢',
    sections: {
      'Документация': [
        { title: 'Подробное логирование для диагностики' },
      ],
      'Исправлено': [
        { title: 'Логика удаления осиротевших ключей в ProjectManager' },
      ],
    }
  },
  {
    version: '6.2.0',
    date: '2026-04-12',
    status: 'STABLE',
    emoji: '🟢',
    sections: {
      'Добавлено': [
        { title: 'Система проектов', details: 'Управление несколькими проектами, per-project хранилище' },
        { title: 'Двойное сохранение избранных', details: 'В оба ключа для защиты от потери' },
      ],
    }
  },
  {
    version: '6.1.8',
    date: '2026-04-08',
    status: 'STABLE',
    emoji: '🟢',
    sections: {
      'Исправлено': [
        { title: 'Unicode поиск в результатах', details: 'Нормализация NFKD, поддержка ×, %, кириллицы', files: ['ui_table.js', 'ui_oos.js'] },
        { title: 'Wick Trailing SL с типом "Пункты"', details: 'Нормализация на 10000 для price space', files: ['core.js:788'] },
        { title: 'Отображение параметров BBprobe', details: 'Каждая конфигурация уникальна', files: ['entry_registry.js:101'] },
      ],
    }
  },
  {
    version: '6.1.7',
    date: '2026-04-05',
    status: 'STABLE',
    emoji: '🟢',
    sections: {
      'Исправлено': [
        { title: 'ReferenceError: _effUseEqMA is not defined', details: 'В Exhaustive режиме', files: ['opt.js:3295'] },
      ],
    }
  },
  {
    version: '6.1.6',
    date: '2026-04-02',
    status: 'STABLE',
    emoji: '🟢',
    sections: {
      'Исправлено': [
        { title: 'storeSave() сохраняет "null" строку вместо удаления', details: 'Исправлена проверка на null/undefined', files: ['ui.js:473-499'] },
      ],
    }
  },
  {
    version: '6.1.0',
    date: '2026-03-20',
    status: 'STABLE',
    emoji: '🟢',
    sections: {
      'Добавлено': [
        { title: 'Pine Script v6 Экспорт', details: 'strategy.exit, автоисправления, toggle-группы' },
      ],
    }
  },
  {
    version: '6.0.0',
    date: '2026-03-01',
    status: 'STABLE',
    emoji: '🟢',
    sections: {
      'Добавлено': [
        { title: 'IS/OOS Split', details: 'Разделение данных, OOS сканирование и диагностика' },
        { title: 'GT-Score Метрика', details: 'Anti-overfitting оценка качества' },
        { title: 'Pine Script v6 Support', details: 'Полная поддержка v6 и преобразование из v5' },
      ],
    }
  },
];

// Открыть модаль логов
function openChangelogModal() {
  const overlay = document.getElementById('changelog-modal-overlay');
  if (!overlay) return;

  overlay.style.display = 'flex';
  _renderChangelogList();

  // Фокус на поиск
  setTimeout(() => {
    const searchInput = document.getElementById('changelog-search');
    if (searchInput) searchInput.focus();
  }, 50);
}

// Закрыть модаль
function closeChangelogModal() {
  const overlay = document.getElementById('changelog-modal-overlay');
  if (overlay) overlay.style.display = 'none';
}

// Фильтрация и поиск
function _filterChangelog() {
  const searchText = document.getElementById('changelog-search')?.value?.toLowerCase() || '';
  const onlyStable = document.getElementById('changelog-filter-stable')?.checked;

  let filtered = CHANGELOG_DATA;

  // Фильтр по стабильности
  if (onlyStable) {
    filtered = filtered.filter(c => c.status === 'STABLE');
  }

  // Поиск по версии, дате, описанию
  if (searchText) {
    filtered = filtered.filter(c => {
      const matchVersion = c.version.toLowerCase().includes(searchText);
      const matchDate = c.date.includes(searchText);

      // Поиск в описаниях
      let matchDescription = false;
      Object.values(c.sections).forEach(items => {
        items.forEach(item => {
          if (item.title.toLowerCase().includes(searchText) ||
              (item.details && item.details.toLowerCase().includes(searchText))) {
            matchDescription = true;
          }
        });
      });

      return matchVersion || matchDate || matchDescription;
    });
  }

  _renderChangelogList(filtered);
}

// Отрендерить список логов
function _renderChangelogList(data = CHANGELOG_DATA) {
  const list = document.getElementById('changelog-list');
  if (!list) return;

  if (data.length === 0) {
    list.innerHTML = '<div style="padding:20px;color:var(--text3);text-align:center">Нет результатов</div>';
    return;
  }

  list.innerHTML = data.map(entry => `
    <div style="border-bottom:1px solid var(--border);padding:16px;cursor:pointer"
         onclick="this.classList.toggle('expanded');this.querySelector('[data-details]').style.display=this.classList.contains('expanded')?'block':'none'">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
        <span style="font-size:1.1em">${entry.emoji}</span>
        <strong style="color:var(--accent)">${entry.version}</strong>
        <span style="color:var(--text3);font-size:.8em">${entry.date}</span>
        <span style="color:var(--text3);font-size:.75em;background:var(--bg3);padding:2px 8px;border-radius:3px">${entry.status}</span>
      </div>
      <div data-details style="display:none;color:var(--text2);font-size:.9em;margin-top:12px">
        ${Object.entries(entry.sections).map(([title, items]) => `
          <div style="margin-bottom:10px">
            <div style="color:var(--accent);font-weight:600;margin-bottom:4px">${title}</div>
            ${items.map(item => `
              <div style="margin-left:16px;margin-bottom:6px;padding:6px;background:var(--bg3);border-radius:3px">
                <div>${item.title}</div>
                ${item.details ? `<div style="color:var(--text3);font-size:.9em;margin-top:2px">${item.details}</div>` : ''}
                ${item.files ? `<div style="color:var(--accent);font-size:.8em;margin-top:2px">📄 ${item.files.join(', ')}</div>` : ''}
                ${item.link ? `<div style="margin-top:4px"><a href="${item.link}" target="_blank" style="color:var(--accent);text-decoration:none">🔗 Ссылка</a></div>` : ''}
              </div>
            `).join('')}
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

// Экспортировать в JSON
function _exportChangelogJSON() {
  const data = JSON.stringify(CHANGELOG_DATA, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `USE-Optimizer-changelog-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('📥 Лог экспортирован', 1500);
}

// Expose to window
try { window.openChangelogModal = openChangelogModal; } catch(e) {}
try { window.closeChangelogModal = closeChangelogModal; } catch(e) {}
try { window._filterChangelog = _filterChangelog; } catch(e) {}
try { window._exportChangelogJSON = _exportChangelogJSON; } catch(e) {}
