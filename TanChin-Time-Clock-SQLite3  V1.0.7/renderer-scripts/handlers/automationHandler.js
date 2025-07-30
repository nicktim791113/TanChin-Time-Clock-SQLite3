/**
 * @file automationHandler.js
 * @description AI管家工作手冊 - 處理自動化排程相關的UI與邏輯
 */
import { ui } from '../ui.js';
import * as state from '../state.js';
import { setState } from '../state.js';
import { dbRequest, executeTaskNow } from '../api.js';
import { showToast } from '../utils.js';
import { showModal, hideModal, showConfirm } from './modalHandler.js';

/**
 * 開啟自動化設定視窗
 */
export function openAutomationModal() {
    renderAutomationTasks();
    renderAutomationLogs();
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
                <button class="text-red-600 hover:underline delete-auto-task-btn" data-id="${task.id}">刪除</button>
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
 * 儲存新的自動化任務
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

    const newTask = {
        id: `auto_task_${Date.now()}`,
        frequency, day, time, task_type, target, enabled: 1
    };

    if (frequency === 'immediate') {
        showToast('正在立即執行任務...', 'info');
        const result = await executeTaskNow(newTask);
        if (result.success) {
            showToast('立即任務執行成功！', 'success');
        } else {
            showToast(`立即任務執行失敗: ${result.error}`, 'error');
        }
    } else {
        const updatedTasks = [...state.automationTasks, newTask];
        const result = await dbRequest('saveAutomationTasks', updatedTasks);
        if (result.success) {
            setState({ automationTasks: updatedTasks });
            showToast('自動化任務已新增！', 'success');
            renderAutomationTasks();
        } else {
            showToast(`新增任務失敗: ${result.error}`, 'error');
        }
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
