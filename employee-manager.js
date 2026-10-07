(() => {
  'use strict';

  const STORAGE_KEY = 'tabaja-employees-v11';
  function activeTenantId() {
    try {
      const activeId = localStorage.getItem('tabaja_card_designer_active_account_v11');
      if (activeId) return activeId;
      const account = JSON.parse(localStorage.getItem('tabaja_card_designer_account_v10') || 'null');
      return String(account?.id || account?.email || account?.company || 'default').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'default';
    } catch (_) { return 'default'; }
  }
  const tenantKey = (key) => `${key}__${activeTenantId()}`;

  let employees = [];
let photoData = '';
let loadedCompanyId = null;

  const $ = (id) => document.getElementById(id);
  const safe = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));

  function employeeDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('tabaja-employee-backups-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('companies');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  window.TabajaEmployeeStore = { async read(tenantId) {
    const key = `${STORAGE_KEY}__${tenantId}`;
    try {
      const db = await employeeDatabase();
      try {
        const value = await new Promise((resolve, reject) => {
          const req = db.transaction('companies').objectStore('companies').get(key);
          req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
        });
        if (Array.isArray(value)) return value;
      } finally { db.close(); }
    } catch (_) {}
    try { const value=JSON.parse(localStorage.getItem(key)||'[]'); return Array.isArray(value)?value:[]; }
    catch (_) { return []; }
  }};

  async function loadEmployees() {
    const key = tenantKey(STORAGE_KEY);
    try {
      const db = await employeeDatabase();
      const saved = await new Promise((resolve, reject) => {
        const request = db.transaction('companies').objectStore('companies').get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();
      if (Array.isArray(saved)) { employees = saved; return; }
    } catch (error) { console.warn('Employee database unavailable:', error); }
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '[]');
      employees = Array.isArray(parsed) ? parsed : [];
    } catch (error) { console.error('Unable to load employees:', error); employees = []; }
  }

  async function saveEmployees() {
    const key = tenantKey(STORAGE_KEY);
    const records = JSON.parse(JSON.stringify(employees));
    try {
      const db = await employeeDatabase();
      await new Promise((resolve, reject) => {
        const transaction = db.transaction('companies', 'readwrite');
        transaction.objectStore('companies').put(records, key);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('Save aborted'));
      });
      db.close();
    } catch (error) {
      // Legacy fallback must retain photos too; never silently strip them.
      localStorage.setItem(key, JSON.stringify(records));
    }
  }

  function fullName(employee) {
    return [employee.firstName, employee.lastName].filter(Boolean).join(' ').trim() || 'Unnamed Employee';
  }

  function initials(employee) {
    return [employee.firstName, employee.lastName].filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'E';
  }

  function updateStats() {
    $('employeeTotal').textContent = employees.length;
    $('employeeActive').textContent = employees.filter((item) => item.status === 'Active').length;
    $('employeeInactive').textContent = employees.filter((item) => item.status === 'Inactive').length;
    $('employeeDepartments').textContent = new Set(employees.map((item) => item.department.trim().toLowerCase()).filter(Boolean)).size;
  }

  function filteredEmployees() {
    const query = $('employeeSearch').value.trim().toLowerCase();
    const status = $('employeeStatusFilter').value;
    return employees.filter((employee) => {
      const text = [employee.employeeId, fullName(employee), employee.department, employee.jobTitle, employee.company, employee.email, employee.phone]
        .join(' ').toLowerCase();
      return (!query || text.includes(query)) && (status === 'all' || employee.status === status);
    });
  }

  function renderEmployees() {
    const rows = filteredEmployees();
    const tbody = $('employeeTableBody');
    const empty = $('employeeEmptyState');
    tbody.innerHTML = '';

    rows.forEach((employee) => {
      const tr = document.createElement('tr');
      const avatar = employee.photo
        ? `<img class="employee-avatar" src="${employee.photo}" alt="">`
        : `<span class="employee-avatar">${safe(initials(employee))}</span>`;
      tr.innerHTML = `
        <td>${avatar}</td>
        <td><b>${safe(employee.employeeId)}</b><span class="employee-muted">${safe(employee.company || '—')}</span></td>
        <td><span class="employee-name">${safe(fullName(employee))}</span><span class="employee-muted">${safe(employee.email || employee.phone || 'No contact details')}</span></td>
        <td>${safe(employee.department || '—')}</td>
        <td>${safe(employee.jobTitle || '—')}</td>
        <td><span class="employee-status ${employee.status.toLowerCase()}">${safe(employee.status)}</span></td>
        <td><div class="employee-actions">
          <button type="button" data-action="designer" data-key="${safe(employee.key)}">Use in Designer</button>
          <button type="button" data-action="edit" data-key="${safe(employee.key)}">Edit</button>
          <button type="button" class="danger" data-action="delete" data-key="${safe(employee.key)}">Delete</button>
        </div></td>`;
      tbody.appendChild(tr);
    });

    empty.classList.toggle('hidden', employees.length > 0 || rows.length > 0);
    if (!rows.length && employees.length) {
      empty.classList.remove('hidden');
      empty.querySelector('h3').textContent = 'No matching employees';
      empty.querySelector('p').textContent = 'Try another search or status filter.';
      $('emptyAddEmployeeBtn').style.display = 'none';
    } else {
      empty.querySelector('h3').textContent = 'No employees yet';
      empty.querySelector('p').textContent = 'Add your first employee to start building the company directory.';
      $('emptyAddEmployeeBtn').style.display = '';
    }
    updateStats();
  }

  function resetForm() {
    $('employeeForm').reset();
    $('employeeRecordKey').value = '';
    $('employeeStatusInput').value = 'Active';
    $('employeeModalTitle').textContent = 'Add Employee';
    $('employeeFormMessage').textContent = '';
    $('employeeFormMessage').className = 'employee-form-message';
    photoData = '';
    renderPhotoPreview();
  }

  function renderPhotoPreview() {
    $('employeePhotoPreview').innerHTML = photoData ? `<img src="${photoData}" alt="Employee photo preview">` : '<span>Photo</span>';
  }

  function openModal(employee = null) {
    resetForm();
    if (employee) {
      $('employeeModalTitle').textContent = 'Edit Employee';
      $('employeeRecordKey').value = employee.key;
      $('employeeIdInput').value = employee.employeeId || '';
      $('employeeStatusInput').value = employee.status || 'Active';
      $('employeeFirstNameInput').value = employee.firstName || '';
      $('employeeLastNameInput').value = employee.lastName || '';
      $('employeeDepartmentInput').value = employee.department || '';
      $('employeeJobTitleInput').value = employee.jobTitle || '';
      $('employeeCompanyInput').value = employee.company || '';
      $('employeePhoneInput').value = employee.phone || '';
      $('employeeEmailInput').value = employee.email || '';
      $('employeeIssueDateInput').value = employee.issueDate || '';
      $('employeeExpiryDateInput').value = employee.expiryDate || '';
      $('employeeNotesInput').value = employee.notes || '';
      photoData = employee.photo || '';
      renderPhotoPreview();
    }
    $('employeeModal').classList.remove('hidden');
    setTimeout(() => $('employeeIdInput').focus(), 50);
  }

  function closeModal() {
    $('employeeModal').classList.add('hidden');
  }

  function resizePhoto(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith('image/')) return reject(new Error('Please choose a valid image.'));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Unable to read the selected image.'));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error('Unable to process the selected image.'));
        image.onload = () => {
          const maxWidth = 420;
          const maxHeight = 520;
          const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.84));
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function saveForm(event) {
    event.preventDefault();
    const key = $('employeeRecordKey').value;
    const employeeId = $('employeeIdInput').value.trim();
    const firstName = $('employeeFirstNameInput').value.trim();
    const duplicate = employees.find((item) => item.employeeId.toLowerCase() === employeeId.toLowerCase() && item.key !== key);
    if (duplicate) {
      $('employeeFormMessage').textContent = 'Employee ID already exists.';
      return;
    }

    const record = {
      key: key || (crypto.randomUUID ? crypto.randomUUID() : `emp-${Date.now()}-${Math.random().toString(16).slice(2)}`),
      employeeId,
      status: $('employeeStatusInput').value,
      firstName,
      lastName: $('employeeLastNameInput').value.trim(),
      department: $('employeeDepartmentInput').value.trim(),
      jobTitle: $('employeeJobTitleInput').value.trim(),
      company: $('employeeCompanyInput').value.trim(),
      phone: $('employeePhoneInput').value.trim(),
      email: $('employeeEmailInput').value.trim(),
      issueDate: $('employeeIssueDateInput').value,
      expiryDate: $('employeeExpiryDateInput').value,
      notes: $('employeeNotesInput').value.trim(),
      photo: photoData,
      updatedAt: new Date().toISOString()
    };

    if (!key) {
  record.createdAt = new Date().toISOString();
}

try {
  const account = JSON.parse(
    localStorage.getItem('tabaja_card_designer_account_v10') || 'null'
  );

  const companyId = account?.companyId || account?.id;

  // Cloud first — Local Storage must never block the real save.
  if (
    account?.cloud &&
    companyId &&
    window.TabajaCloud?.saveEmployeeToCloud
  ) {
    const cloudId = await window.TabajaCloud.saveEmployeeToCloud(
      companyId,
      record
    );

    if (cloudId) {
      record.id = cloudId;
      record.key = cloudId;
    }
  }

  if (key) {
    const index = employees.findIndex((item) => item.key === key);

    if (index >= 0) {
      employees[index] = {
        ...employees[index],
        ...record
      };
    }
  } else {
    employees.unshift(record);
  }

  await saveEmployees();
  renderEmployees();
  closeModal();

} catch (error) {
  console.error('Unable to save employee:', error);

  $('employeeFormMessage').textContent =
    'Unable to save employee to Cloud. Please check your connection and try again.';
}
  }

  function useInDesigner(employee) {
    localStorage.setItem(tenantKey('tabaja-selected-employee-v11'), JSON.stringify(employee));
    document.querySelector('.v8-nav-btn[data-view="designer"]')?.click();
    window.dispatchEvent(new CustomEvent('tabaja:employee-selected', { detail: employee }));
    alert(`${fullName(employee)} is selected for the Card Designer.\n\nThis V11.0 test stores the selected record safely. Automatic template-field mapping comes in V11.1.`);
  }

  async function handleTableClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const employee = employees.find((item) => item.key === button.dataset.key);
    if (!employee) return;
    if (button.dataset.action === 'edit') openModal(employee);
    if (button.dataset.action === 'designer') useInDesigner(employee);
    if (button.dataset.action === 'delete' && confirm(`Delete ${fullName(employee)}?`)) {
  const account = JSON.parse(
    localStorage.getItem('tabaja_card_designer_account_v10') || 'null'
  );

  const companyId = account?.companyId || account?.id;

  if (
    account?.cloud &&
    companyId &&
    employee.id &&
    window.TabajaCloud?.archiveEmployeeInCloud
  ) {
    window.TabajaCloud.archiveEmployeeInCloud(companyId, employee.id)
      .then(async () => {
        employees = employees.filter((item) => item.key !== employee.key);
        await saveEmployees();
        renderEmployees();
      })
      .catch((error) => {
        console.error('Unable to archive employee:', error);
        alert('Unable to delete employee. Please try again.');
      });

    return;
  }

  employees = employees.filter((item) => item.key !== employee.key);
  await saveEmployees();
  renderEmployees();
}
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify({ version: '11.0', exportedAt: new Date().toISOString(), employees }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `tabaja-employees-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importBackup(file) {
    try {
      const data = JSON.parse(await file.text());
      const records = Array.isArray(data) ? data : data.employees;
      if (!Array.isArray(records)) throw new Error('Invalid backup');
      const valid = records.filter((item) => item && item.employeeId && item.firstName).map((item) => ({
        ...item,
        key: item.key || (crypto.randomUUID ? crypto.randomUUID() : `emp-${Date.now()}-${Math.random().toString(16).slice(2)}`),
        status: item.status === 'Inactive' ? 'Inactive' : 'Active'
      }));
      if (!confirm(`Import ${valid.length} employee record(s)? Existing records with the same Employee ID will be replaced.`)) return;
      const map = new Map(employees.map((item) => [item.employeeId.toLowerCase(), item]));
      const account = JSON.parse(localStorage.getItem('tabaja_card_designer_account_v10') || 'null');
      const companyId = account?.companyId || account?.id;
      for (const item of valid) {
        // Backup IDs belong to the source company. Resolve by employee code in the destination.
        if (account?.cloud && companyId) {
          if (!window.TabajaCloud?.saveEmployeeToCloud) throw new Error('Cloud save unavailable');
          const destination = { ...item };
          delete destination.id;
          delete destination.key;
          const id = await window.TabajaCloud.saveEmployeeToCloud(companyId, destination);
          if (!id) throw new Error('Cloud save did not return an employee ID');
          item.id = id;
          item.key = id;
        }
        map.set(item.employeeId.toLowerCase(), item);
      }
      employees = Array.from(map.values());
      await saveEmployees();
      renderEmployees();
    } catch (error) {
      console.error('Employee import failed:', error);
      alert('Import could not complete: ' + error.message + '. Keep the original backup; some cloud records may already be saved.');
    } finally {
      $('importEmployeesFile').value = '';
    }
  }

  async function init() {
  if (!$('employeeWorkspace')) return;

  const account = JSON.parse(
    localStorage.getItem('tabaja_card_designer_account_v10') || 'null'
  );

  const companyId = account?.companyId || account?.id;
loadedCompanyId = companyId || null;
  if (
    account?.cloud &&
    companyId &&
    window.TabajaCloud?.loadEmployeesFromCloud
  ) {
    try {
      employees = await window.TabajaCloud.loadEmployeesFromCloud(companyId);

      // Keep a local cache for this company, but Cloud is the source of truth.
      await saveEmployees();
    } catch (error) {
      console.error('Unable to load cloud employees:', error);

      // If Cloud is temporarily unavailable, fall back to this company's cache.
      await loadEmployees();
    }
  } else {
    await loadEmployees();
  }

  renderEmployees();
    $('addEmployeeBtn').addEventListener('click', () => openModal());
    $('emptyAddEmployeeBtn').addEventListener('click', () => openModal());
    $('closeEmployeeModalBtn').addEventListener('click', closeModal);
    $('cancelEmployeeBtn').addEventListener('click', closeModal);
    $('employeeModal').addEventListener('click', (event) => { if (event.target === $('employeeModal')) closeModal(); });
    $('employeeForm').addEventListener('submit', saveForm);
    $('employeeSearch').addEventListener('input', renderEmployees);
    $('employeeStatusFilter').addEventListener('change', renderEmployees);
    $('employeeTableBody').addEventListener('click', handleTableClick);
    $('employeePhotoInput').addEventListener('change', async (event) => {
      try {
        photoData = await resizePhoto(event.target.files[0]);
        renderPhotoPreview();
      } catch (error) {
        $('employeeFormMessage').textContent = error.message;
      }
      event.target.value = '';
    });
    $('removeEmployeePhotoBtn').addEventListener('click', () => { photoData = ''; renderPhotoPreview(); });
    $('exportEmployeesBtn').addEventListener('click', exportBackup);
    $('importEmployeesBtn').addEventListener('click', () => $('importEmployeesFile').click());
    $('importEmployeesFile').addEventListener('change', (event) => { if (event.target.files[0]) importBackup(event.target.files[0]); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('employeeModal').classList.contains('hidden')) closeModal(); });
  }
window.addEventListener('tabaja:account-changed', async () => {
  if (!$('employeeWorkspace')) return;

  const account = JSON.parse(
    localStorage.getItem('tabaja_card_designer_account_v10') || 'null'
  );

  const companyId = account?.companyId || account?.id || null;

  if (companyId === loadedCompanyId) return;

  loadedCompanyId = companyId;

  employees = [];
  renderEmployees();

  if (
    account?.cloud &&
    companyId &&
    window.TabajaCloud?.loadEmployeesFromCloud
  ) {
    try {
      employees = await window.TabajaCloud.loadEmployeesFromCloud(companyId);
      await saveEmployees();
    } catch (error) {
      console.error('Unable to reload employees after account change:', error);
      await loadEmployees();
    }
  } else {
    await loadEmployees();
  }

  renderEmployees();
});
  window.addEventListener('DOMContentLoaded', init);
})();
