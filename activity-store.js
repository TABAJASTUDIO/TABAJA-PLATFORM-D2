(() => {
  'use strict';

 const KEYS = {
  templates: 'tabaja-templates',
  cards: 'tabaja-recent-cards',
  jobs: 'tabaja-print-jobs',
  currentProject: 'tabaja-current-project-id-v1123'
};

function activeTenantId() {
  try {
    const activeId = localStorage.getItem('tabaja_card_designer_active_account_v11');
    if (activeId) return activeId;

    const account = JSON.parse(
      localStorage.getItem('tabaja_card_designer_account_v10') || 'null'
    );

    return String(
      account?.id || account?.email || account?.company || 'default'
    )
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_') || 'default';
  } catch (_) {
    return 'default';
  }
}

function tenantKey(key) {
  return `${key}__${activeTenantId()}`;
}

const readArray = (key) => {
  try {
    const value = JSON.parse(
      localStorage.getItem(tenantKey(key)) || '[]'
    );
    return Array.isArray(value) ? value : [];
  } catch (_) {
    return [];
  }
};

const writeArray = (key, value) => {
  localStorage.setItem(
    tenantKey(key),
    JSON.stringify(value)
  );
};


  const nowIso = () => new Date().toISOString();
  const makeId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  function getProjectId() {
    let id = sessionStorage.getItem(KEYS.currentProject);
    if (!id) {
      id = makeId('card');
      sessionStorage.setItem(KEYS.currentProject, id);
    }
    return id;
  }

  function startNewProject() {
    sessionStorage.setItem(KEYS.currentProject, makeId('card'));
  }

  function selectedEmployee() {
    try {
      const employee = JSON.parse(localStorage.getItem(tenantKey('tabaja-selected-employee-v11')) || 'null');
      return employee && typeof employee === 'object' ? employee : null;
    } catch (_) {
      return null;
    }
  }

  function employeeDisplay(employee) {
    if (!employee) return { name: 'Identity Card', company: 'Tabaja Solution', employeeId: '' };
    const name = employee.fullName || [employee.firstName, employee.lastName].filter(Boolean).join(' ') || employee.name || 'Identity Card';
    return {
      name,
      company: employee.company || employee.department || 'Tabaja Solution',
      employeeId: employee.employeeId || employee.id || ''
    };
  }

  function orientationLabel() {
    const select = document.getElementById('orientationSelect');
    return select?.value || 'landscape';
  }

  function upsertById(items, record) {
    const index = items.findIndex((item) => item && item.id === record.id);
    if (index >= 0) items[index] = { ...items[index], ...record };
    else items.push(record);
    return items;
  }

  function trim(items, limit) {
    return items.length > limit ? items.slice(items.length - limit) : items;
  }

  function notify() {
    window.dispatchEvent(new CustomEvent('tabaja:data-changed'));
  }

  function recordSavedCard(source) {
    const id = getProjectId();
    const employee = employeeDisplay(selectedEmployee());
    const timestamp = nowIso();

    let templates = readArray(KEYS.templates);
    templates = upsertById(templates, {
      id,
      name: employee.name,
      company: employee.company,
      employeeId: employee.employeeId,
      orientation: orientationLabel(),
      source,
      createdAt: templates.find((item) => item?.id === id)?.createdAt || timestamp,
      updatedAt: timestamp,
      date: timestamp.slice(0, 10),
      status: 'Saved'
    });
    writeArray(KEYS.templates, trim(templates, 500));

    let cards = readArray(KEYS.cards);
    cards = upsertById(cards, {
      id,
      name: employee.name,
      employee: employee.name,
      company: employee.company,
      employeeId: employee.employeeId,
      template: orientationLabel() === 'portrait' ? 'Portrait ID' : 'Landscape ID',
      date: timestamp.slice(0, 10),
      updatedAt: timestamp,
      status: 'Saved'
    });
    writeArray(KEYS.cards, trim(cards, 100));
    notify();
  }

  function recordPrint(buttonId) {
    const employee = employeeDisplay(selectedEmployee());
    const timestamp = nowIso();
    let count = 1;
    let name = 'Single Card Print';

    if (buttonId === 'printBothBtn') {
      count = 2;
      name = 'Front + Back Print';
    } else if (buttonId === 'vectorPrintBtn') {
      name = 'Vector Print';
    } else if (buttonId === 'batchPrint50Btn' || buttonId === 'batchReprintBtn') {
      const from = Number(document.getElementById('batchFrom')?.value || 1);
      const to = Number(document.getElementById('batchTo')?.value || from);
      count = Math.max(1, to - from + 1);
      name = buttonId === 'batchReprintBtn' ? 'Batch Reprint' : 'Batch Print';
    }

    const jobs = readArray(KEYS.jobs);
    jobs.push({
      id: makeId('job'),
      projectId: getProjectId(),
      name,
      employee: employee.name,
      company: employee.company,
      cards: count,
      count,
      completed: count,
      printed: count,
      status: 'completed',
      date: timestamp.slice(0, 10),
      createdAt: timestamp
    });
    writeArray(KEYS.jobs, trim(jobs, 500));

    const cards = readArray(KEYS.cards);
    const projectId = getProjectId();
    const cardIndex = cards.findIndex((card) => card?.id === projectId);
    if (cardIndex >= 0) {
      cards[cardIndex] = { ...cards[cardIndex], status: 'Printed', date: timestamp.slice(0, 10), updatedAt: timestamp };
      writeArray(KEYS.cards, trim(cards, 100));
    }
    notify();
  }

  document.addEventListener('DOMContentLoaded', () => {
    getProjectId();

    document.getElementById('saveBtn')?.addEventListener('click', () => recordSavedCard('project-save'));
    document.getElementById('saveTemplateBtn')?.addEventListener('click', () => recordSavedCard('template-save'));

    ['printBtn', 'printBothBtn', 'vectorPrintBtn', 'batchPrint50Btn', 'batchReprintBtn'].forEach((id) => {
      document.getElementById(id)?.addEventListener('click', () => recordPrint(id));
    });
  });

  window.TabajaActivityStore = { recordSavedCard, recordPrint, startNewProject };
})();
