(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);

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

  function localDateKey(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function recordDate(record) {
    const raw = record?.date || record?.createdAt || record?.updatedAt || '';
    if (/^\d{4}-\d{2}-\d{2}/.test(String(raw))) return String(raw).slice(0, 10);
    return localDateKey(raw);
  }

  function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = String(value);
  }

  function updateClock() {
    const now = new Date();
    const hour = now.getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const account = (() => { try { return JSON.parse(localStorage.getItem('tabaja_card_designer_account_v10') || 'null'); } catch (_) { return null; } })();
    const company = String(account?.company || 'Company').trim();
    setText('ccGreeting', `${greeting}, ${company}.`);
    setText('ccDate', now.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' }));
    setText('ccClock', now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' }));
  }

  function renderRecentCards(cards) {
    const target = $('ccRecentCards');
    if (!target) return;
    if (!cards.length) {
      target.innerHTML = '<div class="cc-card-row"><span class="cc-card-thumb">—</span><div><b>No cards saved yet</b><small>Your five most recent saved or printed cards will appear here.</small></div><em>EMPTY</em></div>';
      return;
    }
    target.innerHTML = cards
      .slice()
      .sort((a, b) => String(a.updatedAt || a.createdAt || a.date || '').localeCompare(String(b.updatedAt || b.createdAt || b.date || '')))
      .slice(-5)
      .reverse()
      .map((card) => `<div class="cc-card-row"><span class="cc-card-thumb">${String(card.name || card.employee || 'ID').slice(0,2).toUpperCase()}</span><div><b>${card.name || card.employee || 'Identity Card'}</b><small>${card.template || card.company || 'Tabaja Solution'} • ${card.date || 'Recent'}</small></div><em>${card.status || 'Saved'}</em></div>`)
      .join('');
  }

  function renderLastBatch(jobs) {
    if (!jobs.length) {
      setText('ccBatchName', 'No print jobs yet');
      setText('ccBatchNote', 'Your latest print job will appear here.');
      setText('ccBatchMeta', '0 cards • 0 completed');
      setText('ccBatchState', 'READY');
      const progress = $('ccBatchProgress');
      if (progress) progress.style.width = '0%';
      return;
    }
    const job = jobs[jobs.length - 1];
    const total = Number(job.cards || job.count || 0);
    const done = Number(job.completed || job.printed || 0);
    const percent = total ? Math.min(100, Math.round(done / total * 100)) : 0;
    setText('ccBatchName', job.name || 'Print Job');
    setText('ccBatchNote', job.note || `${job.employee || 'Card production'} • ${job.date || 'Recent'}`);
    setText('ccBatchMeta', `${total} cards • ${done} completed`);
    setText('ccBatchState', percent === 100 ? 'COMPLETED' : percent ? 'IN PROGRESS' : 'READY');
    const progress = $('ccBatchProgress');
    if (progress) progress.style.width = `${percent}%`;
  }

  function resetForAccountSwitch() {
    // Never leave another company's counts/content in the DOM while switching accounts.
    setText('ccEmployeeCount', 0);
    setText('ccActivityEmployees', '0 records available.');
    setText('ccTodayJobs', 0);
    setText('ccTodayCards', 0);
    setText('ccTemplateCount', 0);
    setText('ccQueueCount', '0 waiting');
    setText('reportCardsToday', 0);
    setText('reportEmployees', 0);
    setText('reportJobs', 0);
    setText('reportTemplates', 0);
    renderRecentCards([]);
    renderLastBatch([]);
  }

  function render() {
    const employees = readArray('tabaja-employees-v11');
    const jobs = readArray('tabaja-print-jobs');
    const cards = readArray('tabaja-recent-cards');
    const templates = readArray('tabaja-templates');
    const today = localDateKey();
    const todayJobs = jobs.filter((job) => recordDate(job) === today);
    const todayCards = todayJobs.reduce((sum, job) => sum + Number(job.cards || job.count || 0), 0);

    setText('ccEmployeeCount', employees.length);
    setText('ccActivityEmployees', `${employees.length} records available.`);
    setText('ccTodayJobs', todayJobs.length);
    setText('ccTodayCards', todayCards);
    setText('ccTemplateCount', templates.length);
    setText('ccQueueCount', `${jobs.filter((job) => job.status === 'queued').length} waiting`);
    setText('reportCardsToday', todayCards);
    setText('reportEmployees', employees.length);
    setText('reportJobs', jobs.length);
    setText('reportTemplates', templates.length);

    renderRecentCards(cards);
    renderLastBatch(jobs);
    updateClock();
  }

  document.addEventListener('DOMContentLoaded', () => {
    render();
    window.setInterval(updateClock, 30000);
    window.setInterval(render, 5000);
  });

  window.addEventListener('tabaja:data-changed', render);
  window.addEventListener('tabaja:account-changed', () => {
    resetForAccountSwitch();
    render();
  });
  window.addEventListener('storage', render);
  window.addEventListener('focus', render);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-page], [data-workspace], .sidebar a, .sidebar button')) window.setTimeout(render, 0);
  });

  window.TabajaRefreshCommandCenter = render;
  window.TabajaResetCommandCenter = resetForAccountSwitch;
})();
