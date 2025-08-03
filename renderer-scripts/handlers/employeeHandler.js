/**
 * @file employeeHandler.js
 * @description 皇家成員名冊 - 處理所有與員工資料相關的邏輯
 */
import { ui } from '../ui.js';
import * as state from '../state.js';
import { setState } from '../state.js';
import { dbRequest, openCsvFile, downloadFile } from '../api.js';
import { showToast } from '../utils.js';
import { showConfirm, showModal, hideModal } from './modalHandler.js';

/**
 * ✨ 新魔法：將員工資料填入表單
 * @param {object} employee - 員工物件
 */
function fillEmployeeForm(employee) {
    if (!employee) return;
    ui.empIdInput.value = employee.id || '';
    ui.empIdInput.readOnly = true; // 編輯時鎖定工號，防止修改
    ui.empNameInput.value = employee.name || '';
    ui.empGenderInput.value = employee.gender || '';
    ui.empDepartmentInput.value = employee.department || '';
    ui.empCardInput.value = employee.card || '';
    ui.empPasswordInput.value = employee.password || '';
    ui.empNationalityInput.value = employee.nationality || '';
    ui.empBirthDateInput.value = employee.birth_date || '';
    ui.empHireDateInput.value = employee.hire_date || '';
    ui.empTerminationDateInput.value = employee.termination_date || '';
    ui.empNotesInput.value = employee.notes || '';
}

/**
 * ✨ 新魔法：處理人員名冊中的所有操作 (編輯與刪除)
 * @param {Event} event - 點擊事件
 */
export function handleRosterAction(event) {
    const target = event.target.closest('button');
    if (!target) return;

    const empId = target.dataset.id;
    if (!empId) return;

    // 處理編輯按鈕
    if (target.classList.contains('edit-btn')) {
        const employeeToEdit = state.employees.find(emp => emp.id === empId);
        if (employeeToEdit) {
            fillEmployeeForm(employeeToEdit);
            hideModal('roster-modal');
            showToast(`正在編輯員工 ${employeeToEdit.name} 的資料。`, 'info');
        }
    } 
    // 處理刪除按鈕
    else if (target.classList.contains('delete-btn')) {
        const employeeToDelete = state.employees.find(emp => emp.id === empId);
        if (!employeeToDelete) return;
        
        showConfirm('刪除員工', `您確定要刪除 ${employeeToDelete.name} (工號: ${empId}) 嗎？`, async () => {
            const newEmployees = state.employees.filter(emp => emp.id !== empId);
            const result = await dbRequest('saveEmployees', newEmployees);
            if (result.success) {
                setState({ employees: newEmployees });
                showToast(`員工 ${employeeToDelete.name} 已被刪除。`, 'success');
                renderRosterModal(); // 重新渲染更新後的名冊
            } else {
                showToast(`刪除失敗: ${result.error}`, 'error');
            }
            hideModal('confirm-modal');
        });
    }
}

/**
 * 儲存新增或更新的員工資料
 */
export async function saveEmployee() {
    const empData = {
        id: ui.empIdInput.value.trim(),
        name: ui.empNameInput.value.trim(),
        gender: ui.empGenderInput.value.trim(),
        department: ui.empDepartmentInput.value.trim(),
        card: ui.empCardInput.value.trim(),
        password: ui.empPasswordInput.value.trim(),
        nationality: ui.empNationalityInput.value.trim(),
        birth_date: ui.empBirthDateInput.value,
        hire_date: ui.empHireDateInput.value,
        termination_date: ui.empTerminationDateInput.value,
        notes: ui.empNotesInput.value.trim()
    };

    if (!empData.id || !empData.name || !empData.department || !empData.card || !empData.password) {
        showToast('工號、姓名、部門、卡號和密碼為必填欄位！', 'error');
        return;
    }

    const existingIndex = state.employees.findIndex(e => e.id === empData.id);
    const cardExists = state.employees.some(e => e.card === empData.card && e.id !== empData.id);
    
    if (cardExists) {
        showToast('此卡號已被其他員工使用！', 'error');
        return;
    }

    let newEmployees = [...state.employees];
    if (existingIndex > -1) {
        newEmployees[existingIndex] = empData;
    } else {
        newEmployees.push(empData);
    }
    
    const result = await dbRequest('saveEmployees', newEmployees);
    if (result.success) {
        setState({ employees: newEmployees });
        showToast(`員工 ${empData.name} 的資料已儲存！`, 'success');
        
        // 清空表單
        ui.empIdInput.value = '';
        ui.empIdInput.readOnly = false; // ✨ 魔法修正：儲存後解除工號欄位的鎖定
        ui.empNameInput.value = '';
        ui.empGenderInput.value = '';
        ui.empDepartmentInput.value = '';
        ui.empCardInput.value = '';
        ui.empPasswordInput.value = '';
        ui.empNationalityInput.value = '';
        ui.empBirthDateInput.value = '';
        ui.empHireDateInput.value = '';
        ui.empTerminationDateInput.value = '';
        ui.empNotesInput.value = '';
        
        if (ui.modals.roster.classList.contains('show')) {
            renderRosterModal();
        }
    } else {
        showToast(`儲存失敗: ${result.error}`, 'error');
    }
}

/**
 * 渲染人員名冊 Modal
 */
export function renderRosterModal() {
    const tbody = ui.modals.roster.querySelector('#roster-table-body');
    if (!tbody) return;
    
    const sortedEmployees = [...state.employees].sort((a, b) => {
        const valA = a[state.sortConfig.key] || '';
        const valB = b[state.sortConfig.key] || '';
        if (valA < valB) return state.sortConfig.direction === 'ascending' ? -1 : 1;
        if (valA > valB) return state.sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
    });
    
    ui.modals.roster.querySelectorAll('#roster-table th .sort-indicator').forEach(span => span.textContent = '');
    const activeHeader = ui.modals.roster.querySelector(`#roster-table th[data-sort="${state.sortConfig.key}"] .sort-indicator`);
    if (activeHeader) activeHeader.textContent = state.sortConfig.direction === 'ascending' ? '▲' : '▼';

    tbody.innerHTML = '';
    sortedEmployees.forEach(emp => {
        const tr = document.createElement('tr');
        tr.className = 'bg-white border-b';
        tr.innerHTML = `
            <td class="px-4 py-2">${emp.id || ''}</td>
            <td class="px-4 py-2">${emp.name || ''}</td>
            <td class="px-4 py-2">${emp.gender || ''}</td>
            <td class="px-4 py-2">${emp.department || ''}</td>
            <td class="px-4 py-2">${emp.card || ''}</td>
            <td class="px-4 py-2">********</td>
            <td class="px-4 py-2">${emp.nationality || ''}</td>
            <td class="px-4 py-2">${emp.birth_date || ''}</td>
            <td class="px-4 py-2">${emp.hire_date || ''}</td>
            <td class="px-4 py-2">${emp.termination_date || ''}</td>
            <td class="px-4 py-2">${emp.notes || ''}</td>
            <td class="px-4 py-2 space-x-4">
                <button class="text-blue-600 hover:text-blue-800 edit-btn" data-id="${emp.id}" title="編輯">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pointer-events-none" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg>
                </button>
                <button class="text-red-600 hover:text-red-800 delete-btn" data-id="${emp.id}" title="刪除">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pointer-events-none" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    showModal('roster-modal');
}

/**
 * 處理 CSV 檔案匯入
 */
export async function handleImportCsv() {
    const result = await openCsvFile();
    if (!result.success) {
        if (result.message !== '使用者取消選擇') {
            showToast(`讀取檔案失敗: ${result.error}`, 'error');
        }
        return;
    }

    ui.csvFileName.textContent = result.fileName;
    const lines = result.content.split(/\r?\n/).filter(line => line.trim() !== '');
    const headerLine = lines.length > 0 ? lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '')) : [];
    const newEmployees = [];
    
    lines.slice(1).forEach(line => {
        const values = line.split(',');
        const empData = {};
        const keyMap = {
            'id': 'id', '工號': 'id',
            'name': 'name', '姓名': 'name',
            'gender': 'gender', '性別': 'gender',
            'nationality': 'nationality', '國籍': 'nationality',
            'department': 'department', '部門': 'department',
            'card': 'card', '卡號': 'card',
            'password': 'password', '密碼': 'password',
            'birth_date': 'birth_date', '出生日': 'birth_date',
            'hire_date': 'hire_date', '到職日': 'hire_date',
            'termination_date': 'termination_date', '離職日': 'termination_date',
            'notes': 'notes', '備註': 'notes'
        };

        headerLine.forEach((header, i) => {
            if (keyMap[header]) {
                empData[keyMap[header]] = values[i] ? values[i].trim().replace(/^"|"$/g, '') : '';
            }
        });
        
        if(empData.id && empData.name && empData.department && empData.card && empData.password) {
            if (!state.employees.some(e => e.id === empData.id || e.card === empData.card)) {
                newEmployees.push(empData);
            }
        }
    });

    if (newEmployees.length > 0) {
        const updatedEmployees = [...state.employees, ...newEmployees];
        await dbRequest('saveEmployees', updatedEmployees);
        setState({ employees: updatedEmployees });
        showToast(`成功匯入 ${newEmployees.length} 位新員工！`, 'success');
        if (ui.modals.roster.classList.contains('show')) {
            renderRosterModal();
        }
    } else {
        showToast('CSV 檔案中沒有可匯入的新員工資料，或工號/卡號已存在。', 'info');
    }
}

/**
 * 匯出員工名冊為 CSV
 */
export async function handleExportCsv() {
    if (state.employees.length === 0) {
        showToast('沒有員工資料可匯出。', 'info');
        return;
    }
    const headers = ['id', 'name', 'gender', 'department', 'card', 'password', 'nationality', 'birth_date', 'hire_date', 'termination_date', 'notes'];
    const headers_tw = ['工號', '姓名', '性別', '部門', '卡號', '密碼', '國籍', '出生日', '到職日', '離職日', '備註'];
    
    let csvContent = headers_tw.join(',') + '\r\n';
    state.employees.forEach(emp => {
        const row = headers.map(header => `"${emp[header] || ''}"`);
        csvContent += row.join(',') + '\r\n';
    });

    const result = await downloadFile(`員工名冊_${new Date().toISOString().slice(0,10)}.csv`, csvContent);
    if (result.success) {
        showToast('員工名冊匯出成功！', 'success');
    } else if (result.message !== '使用者取消儲存') {
        showToast(`匯出失敗: ${result.error}`, 'error');
    }
}
