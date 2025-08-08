/**
 * @file automationHandler.js
 * @description AI管家工作手冊 - 處理自動化排程相關的UI與邏輯 (已修正)
 */
import { ui } from '../ui.js';
import * as state from '../state.js';
import { setState } from '../state.js';
import { dbRequest, executeTaskNow } from '../api.js';
import { showToast } from '../utils.js';
import { showModal, hideModal, showConfirm } from './modalHandler.js';
// ✨ 魔法新增：引入總圖書館長的刷新咒語 ✨
import { refreshData } from '../main.js';

/**
 * 開啟自動化設定視窗
 */
export function openAutomationModal() {
    renderAutomationTasks();
    renderAutomationLogs();
    resetAutomationTaskForm(); 
    showModal('automation-modal');
}

/**
 * 渲染自動化任務列表
 */
export function renderAutomationTasks() {
    const list = ui.modals.automation.querySelector('#automation-tasks-list');
    list.innerHTML = '';
    if (state.automationTasks.length === 0) {
        list.innerHTML = `<p class="text-gray-400 text-center p-4">尚無自動化任務</p>`;
        return;
    }

    const dayNames = { '0': '週日', '1': '週一', '2': '週二', '3': '週三', '4': '週四', '5': '週五', '6': '週六' };
    const freqNames = { 'immediate': '立即', 'daily': '每日', 'weekly': '每週', 'monthly': '每月' };
    const taskNames = { 'export': '匯出', 'delete': '刪除' };
    const targetNames = { 
        'last_week_records': '上週打卡紀錄', 
        'last_month_records': '上月打卡紀錄',
        'manual_records': '手動補登紀錄',
        'all_records': '全部打卡紀錄',
        'all_employees': '所有人員資料',
        'log': '系統任務日誌' 
    };

    state.automationTasks.sort((a,b) => (a.time || '23:59').localeCompare(b.time || '23:59')).forEach(task => {
        const div = document.createElement('div');
        div.className = 'p-3 bg-white rounded-lg border flex items-center justify-between';
        div.dataset.id = task.id; 
        let dayText = '';
        if (task.frequency === 'weekly') {
            dayText = dayNames[task.day];
        } else if (task.frequency === 'monthly') {
            dayText = `${task.day}號`;
        }
        
        let timeText = task.time ? `${dayText} ${task.time}` : dayText;

        div.innerHTML = `
            <div class="flex items-center flex-grow">
                <div class="flex-grow">
                    <p class="font-bold text-gray-800">${freqNames[task.frequency]} ${timeText}</p>
                    <p class="text-sm text-gray-600">任務: ${taskNames[task.task_type]} ${targetNames[task.target]}</p>
                </div>
            </div>
            <div class="space-x-2 flex-shrink-0">
                <button class="text-blue-600 hover:underline edit-auto-task-btn">編輯</button>
                <button class="text-red-600 hover:underline delete-auto-task-btn">刪除</button>
            </div>
        `;
        list.appendChild(div);
    });
}

/**
 * 渲染自動化日誌
 */
export async function renderAutomationLogs() {
    const result = await dbRequest('loadAutomationLog');
    if(result.success) {
        setState({ automationLogs: result.data });
    }
    const list = ui.modals.automation.querySelector('#automation-log-list');
    list.innerHTML = '';
    if (state.automationLogs.length === 0) {
        list.innerHTML = `<p class="text-gray-400 text-center p-4">尚無日誌紀錄</p>`;
        return;
    }

    const statusIcons = {
        'success': '<span class="text-green-500">✔</span>',
        'error': '<span class="text-red-500">✖</span>',
        'info': '<span class="text-blue-500">ℹ</span>'
    };

    state.automationLogs.slice().sort((a,b) => b.timestamp - a.timestamp).forEach(log => {
        const div = document.createElement('div');
        div.className = 'p-2 bg-white rounded border';
        div.innerHTML = `
            <p class="text-gray-500 text-xs">${new Date(log.timestamp).toLocaleString()}</p>
            <p class="text-gray-800">${statusIcons[log.status] || ''} ${log.message}</p>
        `;
        list.appendChild(div);
    });
}

/**
 * 重設自動化任務表單
 */
export function resetAutomationTaskForm() {
    const modal = ui.modals.automation;
    setState({ editingAutomationTaskId: null });
    modal.querySelector('#auto-task-form-title').textContent = '新增自動任務';
    modal.querySelector('#save-automation-task-btn').textContent = '新增任務';
    modal.querySelector('#cancel-auto-task-edit-btn').classList.add('hidden');
    modal.querySelector('#auto-task-frequency').value = 'immediate';
    modal.querySelector('#auto-task-day-weekly').value = '1';
    modal.querySelector('#auto-task-day-monthly').value = '1';
    modal.querySelector('#auto-task-time').value = '';
    modal.querySelector('#auto-task-type').value = 'export';
    modal.querySelector('#auto-task-target').value = 'last_week_records';
    modal.querySelector('#auto-task-frequency').dispatchEvent(new Event('change'));
}


/**
 * 儲存新增或編輯的自動化任務
 */
export async function saveAutomationTask() {
    const modal = ui.modals.automation;
    const frequency = modal.querySelector('#auto-task-frequency').value;
    const day = frequency === 'monthly' 
        ? modal.querySelector('#auto-task-day-monthly').value
        : modal.querySelector('#auto-task-day-weekly').value;
    const time = modal.querySelector('#auto-task-time').value;
    const task_type = modal.querySelector('#auto-task-type').value;
    const target = modal.querySelector('#auto-task-target').value;

    if (frequency !== 'immediate' && !time) {
        showToast('請設定任務時間！', 'error');
        return;
    }

    const taskData = { frequency, day, time, task_type, target };

    if (frequency === 'immediate') {
        showToast('正在立即執行任務...', 'info');
        const result = await executeTaskNow({ ...taskData, id: `immediate_${Date.now()}` });
        
        if (result.success) {
            // ✨ 魔法修正：在收到成功回覆後，檢查是否需要刷新資料 ✨
            if (result.notificationType) {
                await refreshData(result.notificationType);
                showToast('立即任務執行成功，資料已同步！', 'success');
            } else {
                showToast('立即任務執行成功！', 'success');
            }
        } else {
            showToast(`立即任務執行失敗: ${result.error}`, 'error');
        }
        return;
    }

    let updatedTasks = [...state.automationTasks];
    if (state.editingAutomationTaskId) {
        const index = updatedTasks.findIndex(t => t.id === state.editingAutomationTaskId);
        if (index > -1) {
            updatedTasks[index] = { ...updatedTasks[index], ...taskData };
        }
    } else {
        const newTask = { id: `auto_task_${Date.now()}`, ...taskData, enabled: 1 };
        updatedTasks.push(newTask);
    }
    
    const result = await dbRequest('saveAutomationTasks', updatedTasks);
    if (result.success) {
        setState({ automationTasks: updatedTasks });
        showToast(`自動化任務已${state.editingAutomationTaskId ? '更新' : '新增'}！`, 'success');
        renderAutomationTasks();
        resetAutomationTaskForm();
    } else {
        showToast(`任務儲存失敗: ${result.error}`, 'error');
    }
}

/**
 * 處理任務列表中的點擊事件（編輯或刪除）
 * @param {Event} event
 */
export async function handleAutomationTaskAction(event) {
    const target = event.target;
    const taskElement = target.closest('[data-id]');
    if (!taskElement) return;

    const taskId = taskElement.dataset.id;
    const task = state.automationTasks.find(t => t.id === taskId);
    if (!task) return;

    if (target.classList.contains('edit-auto-task-btn')) {
        setState({ editingAutomationTaskId: taskId });
        const modal = ui.modals.automation;
        modal.querySelector('#auto-task-form-title').textContent = '編輯自動任務';
        modal.querySelector('#save-automation-task-btn').textContent = '儲存變更';
        modal.querySelector('#cancel-auto-task-edit-btn').classList.remove('hidden');
        
        modal.querySelector('#auto-task-frequency').value = task.frequency;
        if (task.frequency === 'weekly') {
            modal.querySelector('#auto-task-day-weekly').value = task.day;
        } else if (task.frequency === 'monthly') {
            modal.querySelector('#auto-task-day-monthly').value = task.day;
        }
        modal.querySelector('#auto-task-time').value = task.time;
        modal.querySelector('#auto-task-type').value = task.task_type;
        modal.querySelector('#auto-task-target').value = task.target;
        
        modal.querySelector('#auto-task-frequency').dispatchEvent(new Event('change'));

    } else if (target.classList.contains('delete-auto-task-btn')) {
        showConfirm('刪除任務', '您確定要刪除此自動化任務嗎？', async () => {
            const updatedTasks = state.automationTasks.filter(t => t.id !== taskId);
            const result = await dbRequest('saveAutomationTasks', updatedTasks);
            if (result.success) {
                setState({ automationTasks: updatedTasks });
                renderAutomationTasks();
                showToast('任務已刪除！', 'success');
            } else {
                showToast(`刪除失敗: ${result.error}`, 'error');
            }
            hideModal('confirm-modal');
        });
    }
}


/**
 * 清除自動化日誌
 */
export async function clearAutomationLogs() {
    showConfirm('清除日誌', '您確定要清除所有系統任務日誌嗎？', async () => {
        const result = await dbRequest('clearAutomationLog');
        if(result.success) {
            setState({ automationLogs: [] });
            renderAutomationLogs();
            showToast('日誌已清除', 'success');
        } else {
            showToast(`清除失敗: ${result.error}`, 'error');
        }
        hideModal('confirm-modal');
    });
}
