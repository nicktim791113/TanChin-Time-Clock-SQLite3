/**
 * @file employeeHandler.js
 * @description Employee roster, CSV import/export, and form handling.
 */
import { ui } from '../ui.js';
import * as state from '../state.js';
import { setState } from '../state.js';
import { dbRequest, openCsvFile, downloadFile } from '../api.js';
import { showToast } from '../utils.js';
import { showConfirm, showModal, hideModal } from './modalHandler.js';

const ROSTER_VISIBLE_COLUMNS_STORAGE_KEY = 'tanchin.rosterVisibleColumns';
const FIXED_ROSTER_COLUMNS = ['id', 'name', 'gender', 'department', 'job_title', 'card', 'password', 'nationality'];

function fillEmployeeForm(employee) {
    if (!employee) return;

    ui.empIdInput.value = employee.id || '';
    ui.empIdInput.readOnly = true;
    ui.empNameInput.value = employee.name || '';
    ui.empGenderInput.value = employee.gender || '';
    ui.empDepartmentInput.value = employee.department || '';
    ui.empCardInput.value = employee.card || '';
    ui.empPasswordInput.value = employee.password || '';
    ui.empNationalityInput.value = employee.nationality || '';
    ui.empNationalIdInput.value = employee.national_id || '';
    ui.empBirthDateInput.value = employee.birth_date || '';
    ui.empHireDateInput.value = employee.hire_date || '';
    ui.empTerminationDateInput.value = employee.termination_date || '';
    ui.empBankAccountInput.value = employee.bank_account || '';
    ui.empMobilePhoneInput.value = employee.mobile_phone || '';
    ui.empEmergencyContactInput.value = employee.emergency_contact || '';
    ui.empEmergencyPhoneInput.value = employee.emergency_phone || '';
    ui.empContactAddressInput.value = employee.contact_address || '';
    ui.empRegisteredAddressInput.value = employee.registered_address || '';
    ui.empFamilyStatusInput.value = employee.family_status || '';
    ui.empNotesInput.value = employee.notes || '';
    ui.empJobTitleInput.value = employee.job_title || '';
}

function resetEmployeeFormFields() {
    ui.empIdInput.value = '';
    ui.empIdInput.readOnly = false;
    ui.empNameInput.value = '';
    ui.empGenderInput.value = '';
    ui.empDepartmentInput.value = '';
    ui.empCardInput.value = '';
    ui.empPasswordInput.value = '';
    ui.empNationalityInput.value = '';
    ui.empNationalIdInput.value = '';
    ui.empBirthDateInput.value = '';
    ui.empHireDateInput.value = '';
    ui.empTerminationDateInput.value = '';
    ui.empBankAccountInput.value = '';
    ui.empMobilePhoneInput.value = '';
    ui.empEmergencyContactInput.value = '';
    ui.empEmergencyPhoneInput.value = '';
    ui.empContactAddressInput.value = '';
    ui.empRegisteredAddressInput.value = '';
    ui.empFamilyStatusInput.value = '';
    ui.empNotesInput.value = '';
    ui.empJobTitleInput.value = '';
}

function normalizeEmployee(employee) {
    return {
        id: String(employee.id || '').trim(),
        name: String(employee.name || '').trim(),
        gender: String(employee.gender || '').trim(),
        department: String(employee.department || '').trim(),
        card: String(employee.card || '').trim(),
        password: String(employee.password || '').trim(),
        nationality: String(employee.nationality || '').trim(),
        national_id: String(employee.national_id || '').trim(),
        birth_date: String(employee.birth_date || '').trim(),
        hire_date: String(employee.hire_date || '').trim(),
        termination_date: String(employee.termination_date || '').trim(),
        bank_account: String(employee.bank_account || '').trim(),
        mobile_phone: String(employee.mobile_phone || '').trim(),
        emergency_contact: String(employee.emergency_contact || '').trim(),
        emergency_phone: String(employee.emergency_phone || '').trim(),
        contact_address: String(employee.contact_address || '').trim(),
        registered_address: String(employee.registered_address || '').trim(),
        family_status: String(employee.family_status || '').trim(),
        notes: String(employee.notes || '').trim(),
        job_title: String(employee.job_title || '').trim()
    };
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeCsvCell(value) {
    return `"${String(value || '').replace(/"/g, '""')}"`;
}

const ROSTER_COLUMNS = [
    { key: 'id', label: '工號', sortable: true, cellClass: 'px-4 py-2 whitespace-nowrap', render: (employee) => escapeHtml(employee.id) },
    { key: 'name', label: '姓名', sortable: true, cellClass: 'px-4 py-2 whitespace-nowrap', render: (employee) => escapeHtml(employee.name) },
    { key: 'gender', label: '性別', sortable: true, cellClass: 'px-4 py-2 whitespace-nowrap', render: (employee) => escapeHtml(employee.gender) },
    { key: 'department', label: '部門', sortable: true, cellClass: 'px-4 py-2 whitespace-nowrap', render: (employee) => escapeHtml(employee.department) },
    { key: 'job_title', label: '職稱', sortable: true, cellClass: 'px-4 py-2 whitespace-nowrap', render: (employee) => escapeHtml(employee.job_title) },
    { key: 'card', label: '卡號', sortable: true, cellClass: 'px-4 py-2 whitespace-nowrap', render: (employee) => escapeHtml(employee.card) },
    { key: 'password', label: '密碼', sortable: false, cellClass: 'px-4 py-2 whitespace-nowrap', render: () => '********' },
    { key: 'nationality', label: '國籍', sortable: true, cellClass: 'px-4 py-2 whitespace-nowrap', render: (employee) => escapeHtml(employee.nationality) },
    { key: 'national_id', label: '身分證字號', sortable: true, cellClass: 'px-4 py-2 whitespace-nowrap', render: (employee) => escapeHtml(employee.national_id) },
    { key: 'birth_date', label: '出生日', sortable: true, cellClass: 'px-4 py-2 whitespace-nowrap', render: (employee) => escapeHtml(employee.birth_date) },
    { key: 'hire_date', label: '到職日', sortable: true, cellClass: 'px-4 py-2 whitespace-nowrap', render: (employee) => escapeHtml(employee.hire_date) },
    { key: 'termination_date', label: '離職日', sortable: true, cellClass: 'px-4 py-2 whitespace-nowrap', render: (employee) => escapeHtml(employee.termination_date) },
    { key: 'bank_account', label: '銀行帳戶號碼', sortable: true, cellClass: 'px-4 py-2 whitespace-nowrap', render: (employee) => escapeHtml(employee.bank_account) },
    { key: 'mobile_phone', label: '聯絡手機', sortable: true, cellClass: 'px-4 py-2 whitespace-nowrap', render: (employee) => escapeHtml(employee.mobile_phone) },
    { key: 'emergency_contact', label: '緊急聯絡人', sortable: true, cellClass: 'px-4 py-2 whitespace-nowrap', render: (employee) => escapeHtml(employee.emergency_contact) },
    { key: 'emergency_phone', label: '緊急聯絡電話', sortable: true, cellClass: 'px-4 py-2 whitespace-nowrap', render: (employee) => escapeHtml(employee.emergency_phone) },
    { key: 'contact_address', label: '聯絡地址', sortable: true, cellClass: 'px-4 py-2 max-w-xs whitespace-pre-wrap break-words', render: (employee) => escapeHtml(employee.contact_address) },
    { key: 'registered_address', label: '戶籍地址', sortable: true, cellClass: 'px-4 py-2 max-w-xs whitespace-pre-wrap break-words', render: (employee) => escapeHtml(employee.registered_address) },
    { key: 'family_status', label: '家庭概況', sortable: true, cellClass: 'px-4 py-2 max-w-xs whitespace-pre-wrap break-words', render: (employee) => escapeHtml(employee.family_status) },
    { key: 'notes', label: '備註', sortable: true, cellClass: 'px-4 py-2 max-w-xs whitespace-pre-wrap break-words', render: (employee) => escapeHtml(employee.notes) }
];

const OPTIONAL_ROSTER_COLUMNS = ROSTER_COLUMNS.filter((column) => !FIXED_ROSTER_COLUMNS.includes(column.key));

let rosterVisibleColumns = loadStoredRosterVisibleColumns();

function loadStoredRosterVisibleColumns() {
    try {
        const rawValue = window.localStorage?.getItem(ROSTER_VISIBLE_COLUMNS_STORAGE_KEY);
        if (!rawValue) return [];
        const parsed = JSON.parse(rawValue);
        const validKeys = Array.isArray(parsed)
            ? OPTIONAL_ROSTER_COLUMNS.map((column) => column.key).filter((key) => parsed.includes(key))
            : [];
        return validKeys;
    } catch (error) {
        return [];
    }
}

function persistRosterVisibleColumns() {
    try {
        window.localStorage?.setItem(ROSTER_VISIBLE_COLUMNS_STORAGE_KEY, JSON.stringify(rosterVisibleColumns));
    } catch (error) {
        // Ignore local persistence issues and keep the current in-memory selection.
    }
}

function getVisibleRosterColumnDefinitions() {
    const fixedKeySet = new Set(FIXED_ROSTER_COLUMNS);
    const optionalKeySet = new Set(rosterVisibleColumns);
    return ROSTER_COLUMNS.filter((column) => fixedKeySet.has(column.key) || optionalKeySet.has(column.key));
}

function ensureRosterSortKey(visibleColumns) {
    const sortableColumns = visibleColumns.filter((column) => column.sortable !== false);
    if (sortableColumns.length === 0) return;

    const activeSortKey = state.sortConfig.key;
    if (sortableColumns.some((column) => column.key === activeSortKey)) return;

    setState({
        sortConfig: {
            key: sortableColumns[0].key,
            direction: 'ascending'
        }
    });
}

function setRosterVisibleColumns(nextColumns) {
    const normalizedColumns = OPTIONAL_ROSTER_COLUMNS
        .map((column) => column.key)
        .filter((key) => nextColumns.includes(key));

    rosterVisibleColumns = normalizedColumns;
    persistRosterVisibleColumns();
    ensureRosterSortKey(getVisibleRosterColumnDefinitions());
    return true;
}

function renderRosterColumnControls() {
    const container = ui.modals.roster.querySelector('#roster-column-toggle-list');
    const summary = ui.modals.roster.querySelector('#roster-column-summary');
    if (!container) return;

    container.innerHTML = OPTIONAL_ROSTER_COLUMNS.map((column) => `
        <label class="roster-column-chip">
            <input type="checkbox" class="roster-column-toggle h-4 w-4 shrink-0" data-column="${column.key}" ${rosterVisibleColumns.includes(column.key) ? 'checked' : ''}>
            <span>${column.label}</span>
        </label>
    `).join('');

    if (summary) {
        summary.textContent = `固定顯示核心 ${FIXED_ROSTER_COLUMNS.length} 欄，目前額外顯示 ${rosterVisibleColumns.length} / ${OPTIONAL_ROSTER_COLUMNS.length} 欄。`;
    }
}

function parseCsvText(text) {
    const rows = [];
    let current = '';
    let row = [];
    let inQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        const next = text[index + 1];

        if (char === '"') {
            if (inQuotes && next === '"') {
                current += '"';
                index += 1;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            row.push(current);
            current = '';
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && next === '\n') index += 1;
            row.push(current);
            if (row.some((value) => value.trim() !== '')) rows.push(row);
            row = [];
            current = '';
        } else {
            current += char;
        }
    }

    if (current !== '' || row.length) {
        row.push(current);
        if (row.some((value) => value.trim() !== '')) rows.push(row);
    }

    return rows;
}

function normalizeCsvHeader(header) {
    return String(header ?? '')
        .replace(/^\uFEFF/, '')
        .trim()
        .replace(/^"|"$/g, '');
}

function mergeImportedEmployees(currentEmployees, importedEmployees) {
    const mergedById = new Map(
        currentEmployees.map((employee) => [String(employee.id || ''), normalizeEmployee(employee)])
    );
    const incomingById = new Map();

    importedEmployees.forEach((employee) => {
        incomingById.set(employee.id, normalizeEmployee(employee));
    });

    let added = 0;
    let updated = 0;

    incomingById.forEach((employee, employeeId) => {
        const existing = mergedById.get(employeeId);
        if (existing) {
            updated += 1;
            mergedById.set(employeeId, { ...existing, ...employee });
            return;
        }

        const matchedByCard = Array.from(mergedById.values()).find((currentEmployee) =>
            currentEmployee.card === employee.card && currentEmployee.id !== employee.id
        );
        if (matchedByCard) {
            updated += 1;
            mergedById.set(matchedByCard.id, {
                ...matchedByCard,
                ...employee,
                id: matchedByCard.id
            });
            return;
        }

        added += 1;
        mergedById.set(employeeId, employee);
    });

    const employees = Array.from(mergedById.values())
        .sort((left, right) => String(left.id || '').localeCompare(String(right.id || '')));

    const cardOwners = new Map();
    const duplicateCards = [];
    employees.forEach((employee) => {
        const card = String(employee.card || '').trim();
        if (!card) return;
        const owner = cardOwners.get(card);
        if (owner && owner !== employee.id) {
            duplicateCards.push(`${card} (${owner}/${employee.id})`);
            return;
        }
        cardOwners.set(card, employee.id);
    });

    if (duplicateCards.length) {
        const sample = duplicateCards.slice(0, 5).join('、');
        const suffix = duplicateCards.length > 5 ? ' 等' : '';
        throw new Error(`CSV 匯入失敗，卡號重複：${sample}${suffix}`);
    }

    return { employees, added, updated };
}

export function handleRosterAction(event) {
    const target = event.target.closest('button');
    if (!target) return;

    const empId = target.dataset.id;
    if (!empId) return;

    if (target.classList.contains('edit-btn')) {
        const employeeToEdit = state.employees.find((employee) => employee.id === empId);
        if (employeeToEdit) {
            fillEmployeeForm(employeeToEdit);
            hideModal('roster-modal');
            showToast(`正在編輯員工 ${employeeToEdit.name} 的資料。`, 'info');
        }
        return;
    }

    if (!target.classList.contains('delete-btn')) return;

    const employeeToDelete = state.employees.find((employee) => employee.id === empId);
    if (!employeeToDelete) return;

    showConfirm('刪除員工', `您確定要刪除 ${employeeToDelete.name} (工號: ${empId}) 嗎？`, async () => {
        const newEmployees = state.employees.filter((employee) => employee.id !== empId);
        const result = await dbRequest('saveEmployees', newEmployees);
        if (result.success) {
            setState({ employees: newEmployees });
            showToast(`員工 ${employeeToDelete.name} 已刪除。`, 'success');
            renderRosterModal();
        } else {
            showToast(`刪除失敗: ${result.error}`, 'error');
        }
        hideModal('confirm-modal');
    });
}

export async function saveEmployee() {
    const employee = normalizeEmployee({
        id: ui.empIdInput.value,
        name: ui.empNameInput.value,
        gender: ui.empGenderInput.value,
        department: ui.empDepartmentInput.value,
        card: ui.empCardInput.value,
        password: ui.empPasswordInput.value,
        nationality: ui.empNationalityInput.value,
        national_id: ui.empNationalIdInput.value,
        birth_date: ui.empBirthDateInput.value,
        hire_date: ui.empHireDateInput.value,
        termination_date: ui.empTerminationDateInput.value,
        bank_account: ui.empBankAccountInput.value,
        mobile_phone: ui.empMobilePhoneInput.value,
        emergency_contact: ui.empEmergencyContactInput.value,
        emergency_phone: ui.empEmergencyPhoneInput.value,
        contact_address: ui.empContactAddressInput.value,
        registered_address: ui.empRegisteredAddressInput.value,
        family_status: ui.empFamilyStatusInput.value,
        notes: ui.empNotesInput.value,
        job_title: ui.empJobTitleInput.value
    });

    if (!employee.id || !employee.name || !employee.department || !employee.card || !employee.password) {
        showToast('工號、姓名、部門、卡號和密碼為必填欄位。', 'error');
        return;
    }

    const existingIndex = state.employees.findIndex((item) => String(item.id || '').trim() === employee.id);
    const cardExists = state.employees.some((item) =>
        String(item.card || '').trim() === employee.card && String(item.id || '').trim() !== employee.id
    );
    if (cardExists) {
        showToast('卡號不可與其他員工重複。', 'error');
        return;
    }

    const newEmployees = [...state.employees];
    if (existingIndex > -1) {
        newEmployees[existingIndex] = employee;
    } else {
        newEmployees.push(employee);
    }

    const result = await dbRequest('saveEmployees', newEmployees);
    if (!result.success) {
        showToast(`儲存失敗: ${result.error}`, 'error');
        return;
    }

    setState({ employees: newEmployees });
    showToast(`員工 ${employee.name} 的資料已儲存。`, 'success');
    resetEmployeeFormFields();

    if (ui.modals.roster.classList.contains('show')) {
        renderRosterModal();
    }
}

export function renderRosterModal() {
    const thead = ui.modals.roster.querySelector('#roster-table-head');
    const tbody = ui.modals.roster.querySelector('#roster-table-body');
    if (!thead || !tbody) return;

    const visibleColumns = getVisibleRosterColumnDefinitions();
    ensureRosterSortKey(visibleColumns);

    const sortedEmployees = [...state.employees].sort((left, right) => {
        const valueLeft = left[state.sortConfig.key] || '';
        const valueRight = right[state.sortConfig.key] || '';
        if (valueLeft < valueRight) return state.sortConfig.direction === 'ascending' ? -1 : 1;
        if (valueLeft > valueRight) return state.sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
    });

    thead.innerHTML = `
        <tr>
            ${visibleColumns.map((column) => `
                <th scope="col" class="px-4 py-3" ${column.sortable === false ? '' : `data-sort="${column.key}"`}>
                    ${column.label}
                    ${column.sortable === false ? '' : '<span class="sort-indicator"></span>'}
                </th>
            `).join('')}
            <th scope="col" class="px-4 py-3">操作</th>
        </tr>
    `;
    renderRosterColumnControls();

    const activeHeader = thead.querySelector(`th[data-sort="${state.sortConfig.key}"] .sort-indicator`);
    if (activeHeader) {
        activeHeader.textContent = state.sortConfig.direction === 'ascending' ? '▲' : '▼';
    }

    tbody.innerHTML = '';
    sortedEmployees.forEach((employee) => {
        const tr = document.createElement('tr');
        tr.className = 'bg-white border-b';
        tr.innerHTML = `
            ${visibleColumns.map((column) => `<td class="${column.cellClass}">${column.render(employee)}</td>`).join('')}
            <td class="px-4 py-2 space-x-4">
                <button class="text-blue-600 hover:text-blue-800 edit-btn" data-id="${escapeHtml(employee.id)}" title="編輯">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pointer-events-none" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg>
                </button>
                <button class="text-red-600 hover:text-red-800 delete-btn" data-id="${escapeHtml(employee.id)}" title="刪除">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pointer-events-none" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    showModal('roster-modal');
}

export function handleRosterColumnToggle(event) {
    const toggle = event.target.closest('.roster-column-toggle');
    if (!toggle) return;

    const columnKey = toggle.dataset.column;
    if (!columnKey) return;

    const nextColumns = toggle.checked
        ? [...new Set([...rosterVisibleColumns, columnKey])]
        : rosterVisibleColumns.filter((key) => key !== columnKey);

    setRosterVisibleColumns(nextColumns);
    renderRosterModal();
}

export function resetRosterColumns() {
    setRosterVisibleColumns([]);
    renderRosterModal();
    showToast('名冊欄位已還原為最精簡模式。', 'info');
}

export async function handleImportCsv() {
    const result = await openCsvFile();
    if (!result.success) {
        if (result.message !== '使用者取消選擇') {
            showToast(`讀取檔案失敗: ${result.error}`, 'error');
        }
        return;
    }

    ui.csvFileName.textContent = result.fileName;
    const rows = parseCsvText(result.content);
    const headerLine = (rows[0] || []).map(normalizeCsvHeader);
    const keyMap = {
        id: 'id', 工號: 'id',
        name: 'name', 姓名: 'name',
        gender: 'gender', 性別: 'gender',
        nationality: 'nationality', 國籍: 'nationality',
        department: 'department', 部門: 'department',
        job_title: 'job_title', 職稱: 'job_title',
        card: 'card', 卡號: 'card',
        password: 'password', 密碼: 'password',
        national_id: 'national_id', 身分證字號: 'national_id',
        birth_date: 'birth_date', 生日: 'birth_date', 出生日: 'birth_date',
        hire_date: 'hire_date', 到職日: 'hire_date',
        termination_date: 'termination_date', 離職日: 'termination_date',
        bank_account: 'bank_account', 銀行帳戶號碼: 'bank_account',
        mobile_phone: 'mobile_phone', 聯絡手機: 'mobile_phone',
        emergency_contact: 'emergency_contact', 緊急聯絡人: 'emergency_contact',
        emergency_phone: 'emergency_phone', 緊急聯絡電話: 'emergency_phone',
        contact_address: 'contact_address', 聯絡地址: 'contact_address',
        registered_address: 'registered_address', 戶籍地址: 'registered_address',
        family_status: 'family_status', 家庭概況: 'family_status',
        notes: 'notes', 備註: 'notes'
    };

    const parsedEmployees = rows.slice(1).map((row) => {
        const employee = {};
        headerLine.forEach((header, index) => {
            const key = keyMap[header];
            if (key) employee[key] = row[index] ? row[index].trim().replace(/^"|"$/g, '') : '';
        });
        return normalizeEmployee(employee);
    });

    const importedEmployees = parsedEmployees.filter((employee) =>
        employee.id && employee.name && employee.department && employee.card && employee.password
    );
    const skipped = parsedEmployees.length - importedEmployees.length;

    if (importedEmployees.length === 0) {
        showToast('CSV 內沒有符合格式的員工資料，或必要欄位不足。', 'error');
        return;
    }

    try {
        const mergedResult = mergeImportedEmployees(state.employees, importedEmployees);
        const saveResult = await dbRequest('saveEmployees', mergedResult.employees);
        if (!saveResult.success) {
            showToast(`匯入失敗: ${saveResult.error}`, 'error');
            return;
        }

        setState({ employees: mergedResult.employees });
        const summary = skipped > 0
            ? `CSV 匯入完成：新增 ${mergedResult.added} 筆、更新 ${mergedResult.updated} 筆、略過 ${skipped} 筆。`
            : `CSV 匯入完成：新增 ${mergedResult.added} 筆、更新 ${mergedResult.updated} 筆。`;
        showToast(summary, 'success');

        if (ui.modals.roster.classList.contains('show')) {
            renderRosterModal();
        }
    } catch (error) {
        showToast(error.message, 'error');
    }
}

export async function handleExportCsv() {
    if (state.employees.length === 0) {
        showToast('沒有員工資料可匯出。', 'info');
        return;
    }

    const headers = ['id', 'name', 'gender', 'department', 'job_title', 'card', 'password', 'nationality', 'national_id', 'birth_date', 'hire_date', 'termination_date', 'bank_account', 'mobile_phone', 'emergency_contact', 'emergency_phone', 'contact_address', 'registered_address', 'family_status', 'notes'];
    const headersTw = ['工號', '姓名', '性別', '部門', '職稱', '卡號', '密碼', '國籍', '身分證字號', '出生日', '到職日', '離職日', '銀行帳戶號碼', '聯絡手機', '緊急聯絡人', '緊急聯絡電話', '聯絡地址', '戶籍地址', '家庭概況', '備註'];

    let csvContent = headersTw.join(',') + '\r\n';
    state.employees.forEach((employee) => {
        const row = headers.map((header) => escapeCsvCell(employee[header]));
        csvContent += `${row.join(',')}\r\n`;
    });

    const result = await downloadFile(`員工名冊_${new Date().toISOString().slice(0, 10)}.csv`, csvContent);
    if (result.success) {
        showToast('員工名冊匯出成功。', 'success');
    } else if (result.message !== '使用者取消儲存') {
        showToast(`匯出失敗: ${result.error}`, 'error');
    }
}
