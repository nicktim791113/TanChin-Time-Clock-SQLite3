/**
 * @file reportHandler.js
 * @description 考勤歷史卷宗 - 處理所有與報表相關的邏輯
 */
import { ui } from '../ui.js';
import * as state from '../state.js';
import { setState } from '../state.js';
import { downloadFile } from '../api.js';
import { showModal, hideModal } from './modalHandler.js';
import { showToast } from '../utils.js';

/**
 * 顯示報表登入視窗
 */
export function showReportLogin() {
    ui.modals.reportLogin.querySelector('#report-login-input').value = '';
    showModal('report-login-modal');
}

/**
 * 處理報表登入邏輯
 */
export async function handleReportLogin() {
    const input = ui.modals.reportLogin.querySelector('#report-login-input').value.trim();
    if (!input) return;

    if (input === state.adminPassword) {
        setState({ reportLoginIdentity: 'admin' });
    } else {
        const employee = state.employees.find(e => e.card === input || e.password === input || e.id === input);
        if (employee) {
            setState({ reportLoginIdentity: employee.id });
        } else {
            showToast('卡號或密碼錯誤。', 'error');
            return;
        }
    }
    hideModal('report-login-modal');
    
    const today = new Date().toISOString().slice(0, 10);
    ui.modals.reportDateRange.querySelector('#report-start-date').value = today;
    ui.modals.reportDateRange.querySelector('#report-end-date').value = today;
    showModal('report-date-range-modal');
}

/**
 * 處理報表日期範圍選擇
 */
export function handleReportDateRange() {
    const startDateStr = ui.modals.reportDateRange.querySelector('#report-start-date').value;
    const endDateStr = ui.modals.reportDateRange.querySelector('#report-end-date').value;

    if (!startDateStr || !endDateStr) {
        showToast('請選擇開始與結束日期', 'error');
        return;
    }

    const startTime = new Date(startDateStr).getTime();
    const endTime = new Date(endDateStr).setHours(23, 59, 59, 999);

    if (startTime > endTime) {
        showToast('開始日期不能晚於結束日期', 'error');
        return;
    }

    // --- ✨ 魔法修正施展處：讓館長在訪客登記簿上寫下紀錄！ ✨ ---
    setState({ lastReportDateRange: { start: startTime, end: endTime } });
    // --- ✨ 魔法契約已簽訂 ✨ ---

    let recordsToView;
    if (state.reportLoginIdentity === 'admin') {
        recordsToView = state.punchRecords.filter(p => p.timestamp >= startTime && p.timestamp <= endTime);
    } else {
        recordsToView = state.punchRecords.filter(p => p.id === state.reportLoginIdentity && p.timestamp >= startTime && p.timestamp <= endTime);
    }

    hideModal('report-date-range-modal');
    renderReport(recordsToView.sort((a, b) => b.timestamp - a.timestamp));
}

/**
 * 渲染報表內容
 * @param {Array<object>} records - 要顯示的打卡紀錄
 */
export function renderReport(records) {
    const tbody = ui.modals.reportView.querySelector('#report-table-body');
    tbody.innerHTML = '';
    if (records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center p-8">查無紀錄</td></tr>`;
    } else {
        records.forEach(r => {
            const emp = state.employees.find(e => e.id === r.id) || { name: '未知員工' };
            const d = new Date(r.timestamp);
            const tr = document.createElement('tr');
            tr.className = 'bg-white border-b';
            tr.innerHTML = `
                <td class="px-4 py-2">${r.id}</td>
                <td class="px-4 py-2">${emp.name}</td>
                <td class="px-4 py-2">${d.toLocaleDateString()}</td>
                <td class="px-4 py-2">${d.toLocaleTimeString()}</td>
                <td class="px-4 py-2">${r.shift}</td>
                <td class="px-4 py-2">${r.status}</td>
            `;
            tbody.appendChild(tr);
        });
    }
    showModal('report-view-modal');

    if (state.reportTimerInterval) clearInterval(state.reportTimerInterval);
    if (state.reportViewTimeout) clearTimeout(state.reportViewTimeout);

    let secondsLeft = 300;
    const timerElem = ui.modals.reportView.querySelector('#report-auto-close-timer');
    
    const updateTimer = () => {
        if (secondsLeft <= 0) {
            clearInterval(state.reportTimerInterval);
            hideModal('report-view-modal');
            showToast('報表視窗已自動關閉。', 'info');
            return;
        }
        timerElem.textContent = `(將於 ${Math.floor(secondsLeft / 60)}:${(secondsLeft % 60).toString().padStart(2, '0')} 後自動關閉)`;
        secondsLeft--;
    };
    
    updateTimer();
    const newInterval = setInterval(updateTimer, 1000);
    const newTimeout = setTimeout(() => {
        clearInterval(newInterval);
        hideModal('report-view-modal');
    }, secondsLeft * 1000 + 500);

    setState({
        reportTimerInterval: newInterval,
        reportViewTimeout: newTimeout,
    });
}

/**
 * 將目前顯示的報表匯出為 CSV
 */
export async function exportReportToCsv() {
    const headers = ['工號', '姓名', '打卡日期', '打卡時間', '班別', '狀態'];
    const tableRows = ui.modals.reportView.querySelectorAll('#report-table-body tr');
    if (tableRows.length === 0 || (tableRows.length === 1 && tableRows[0].children[0].colSpan === 6)) {
        showToast('沒有資料可匯出。', 'info');
        return;
    }

    const rows = Array.from(tableRows).map(tr => 
        Array.from(tr.querySelectorAll('td')).map(td => `"${td.textContent}"`).join(',')
    );

    let csvContent = headers.join(',') + '\r\n' + rows.join('\r\n');
    const result = await downloadFile(`考勤報表_${new Date().toISOString().slice(0,10)}.csv`, csvContent);
    if (result.success) {
        showToast('報表匯出成功！', 'success');
    } else if (result.message !== '使用者取消儲存') {
        showToast(`匯出失敗: ${result.error}`, 'error');
    }
}
