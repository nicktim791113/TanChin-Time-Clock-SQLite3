/**
 * @file automationHandler.js
 * @description AI 系統控制 - 自動化排程 UI 與資料夾設定
 */

import { ui } from '../ui.js';
import * as state from '../state.js';
import { setState } from '../state.js';
import { dbRequest, executeTaskNow, selectDirectory } from '../api.js';
import { showToast } from '../utils.js';
import { showModal, hideModal, showConfirm } from './modalHandler.js';
import { refreshData } from '../main.js';

const ATTENDANCE_EXPORT_TARGETS = ['last_week_records', 'last_month_records', 'manual_records', 'all_records'];

const DAY_NAMES = {
    '0': '週日',
    '1': '週一',
    '2': '週二',
    '3': '週三',
    '4': '週四',
    '5': '週五',
    '6': '週六'
};

const FREQUENCY_NAMES = {
    immediate: '立即',
    daily: '每日',
    weekly: '每週',
    monthly: '每月'
};

const TASK_TYPE_NAMES = {
    export: '匯出',
    delete: '刪除'
};

const TARGET_NAMES = {
    last_week_records: '上週打卡紀錄',
    last_month_records: '上月打卡紀錄',
    manual_records: '手動補登紀錄',
    all_records: '全部打卡紀錄',
    all_employees: '全部員工資料',
    all_bell_records: '全部響鈴紀錄',
    log: '系統日誌'
};

const EXPORT_TEMPLATE_NAMES = {
    payroll: '薪資系統',
    anomaly: '異常稽核',
    analysis: '報表分析',
    full: '完整格式',
    custom: '自訂格式'
};

function getAutomationModal() {
    return ui.modals.automation;
}

function isAttendanceExportTask(taskType, target) {
    return taskType === 'export' && ATTENDANCE_EXPORT_TARGETS.includes(target);
}

function isExportTask(taskType) {
    return taskType === 'export';
}

function getAutomationDefaultDirectoryInput() {
    return getAutomationModal()?.querySelector('#automation-export-directory-default');
}

function getAutomationDefaultDirectorySummary() {
    return getAutomationModal()?.querySelector('#automation-export-directory-summary');
}

function getAutomationTaskDirectoryInput() {
    return getAutomationModal()?.querySelector('#auto-task-export-directory');
}

function getExternalApiEnabledInput() {
    return getAutomationModal()?.querySelector('#external-api-enabled');
}

function getExternalApiKeyInput() {
    return getAutomationModal()?.querySelector('#external-api-key');
}

function getExternalApiSettingsSummary() {
    return getAutomationModal()?.querySelector('#external-api-settings-summary');
}

function normalizeSettingBoolean(value) {
    return value === true || value === 1 || value === '1' || value === 'true';
}

function getResolvedExportDirectoryLabel(task = {}) {
    return String(task.export_directory || '').trim()
        || String(state.automationExportDirectory || '').trim()
        || '桌面資料夾';
}

function syncAutomationExportDirectoryControls() {
    const defaultInput = getAutomationDefaultDirectoryInput();
    const summary = getAutomationDefaultDirectorySummary();
    if (defaultInput && document.activeElement !== defaultInput) {
        defaultInput.value = state.automationExportDirectory || '';
    }
    if (summary) {
        summary.textContent = state.automationExportDirectory
            ? `目前預設匯出資料夾：${state.automationExportDirectory}`
            : '目前未設定預設匯出資料夾，匯出時會改用桌面資料夾。';
    }
}

export async function loadAutomationExportDirectory() {
    const result = await dbRequest('getSetting', 'automationExportDirectory');
    if (result.success) {
        setState({ automationExportDirectory: result.data || '' });
    }
    syncAutomationExportDirectoryControls();
}

export function syncExternalApiSettingsControls() {
    const enabledInput = getExternalApiEnabledInput();
    const keyInput = getExternalApiKeyInput();
    const summary = getExternalApiSettingsSummary();
    const enabled = normalizeSettingBoolean(state.externalApiEnabled);
    const hasKey = Boolean(String(state.externalApiKey || '').trim());

    if (enabledInput) enabledInput.checked = enabled;
    if (keyInput) {
        keyInput.disabled = !enabled;
        if (document.activeElement !== keyInput) {
            keyInput.value = state.externalApiKey || '';
        }
    }
    if (summary) {
        summary.textContent = enabled
            ? (hasKey
                ? '目前外部 API 已啟用，所有 /api/* 外部入口都需要 API 金鑰。'
                : '目前外部 API 已啟用，但尚未設定金鑰，外部裝置將無法通過驗證。')
            : '目前外部 API 功能已停用。';
    }
}

export async function loadExternalApiSettings() {
    const [enabledResult, keyResult] = await Promise.all([
        dbRequest('getSetting', 'externalApiEnabled'),
        dbRequest('getSetting', 'externalApiKey')
    ]);

    setState({
        externalApiEnabled: enabledResult.success ? normalizeSettingBoolean(enabledResult.data) : false,
        externalApiKey: keyResult.success ? String(keyResult.data || '') : ''
    });
    syncExternalApiSettingsControls();
}

export function clearExternalApiKey() {
    const keyInput = getExternalApiKeyInput();
    if (keyInput) keyInput.value = '';
}

export async function saveExternalApiSettings() {
    const enabled = Boolean(getExternalApiEnabledInput()?.checked);
    const apiKey = String(getExternalApiKeyInput()?.value || '').trim();

    if (enabled && !apiKey) {
        showToast('啟用外部 API 前，請先輸入自訂 API 金鑰。', 'error');
        return;
    }

    const [enabledResult, keyResult] = await Promise.all([
        dbRequest('setSetting', 'externalApiEnabled', enabled ? 'true' : 'false'),
        dbRequest('setSetting', 'externalApiKey', apiKey)
    ]);

    if (!enabledResult.success || !keyResult.success) {
        showToast(`儲存外部 API 設定失敗: ${enabledResult.error || keyResult.error}`, 'error');
        return;
    }

    setState({ externalApiEnabled: enabled, externalApiKey: apiKey });
    syncExternalApiSettingsControls();
    showToast(enabled ? '外部 API 保護設定已更新。' : '外部 API 已停用。', 'success');
}

export async function chooseAutomationExportDirectory(target = 'default') {
    const sourceInput = target === 'task'
        ? getAutomationTaskDirectoryInput()
        : getAutomationDefaultDirectoryInput();
    const currentPath = sourceInput?.value?.trim() || state.automationExportDirectory || '';
    const result = await selectDirectory(currentPath);
    if (result.success && sourceInput) {
        sourceInput.value = result.path || '';
    } else if (!result.success && !result.canceled) {
        showToast(`選擇資料夾失敗: ${result.error || result.message}`, 'error');
    }
}

export function clearAutomationExportDirectory(target = 'default') {
    const targetInput = target === 'task'
        ? getAutomationTaskDirectoryInput()
        : getAutomationDefaultDirectoryInput();
    if (targetInput) targetInput.value = '';
}

export async function saveAutomationExportDirectorySetting() {
    const input = getAutomationDefaultDirectoryInput();
    if (!input) return;

    const directoryPath = input.value.trim();
    const result = await dbRequest('setSetting', 'automationExportDirectory', directoryPath);
    if (result.success) {
        setState({ automationExportDirectory: directoryPath });
        syncAutomationExportDirectoryControls();
        showToast(
            directoryPath
                ? '預設匯出資料夾已更新。'
                : '已改回使用桌面資料夾作為預設匯出位置。',
            'success'
        );
    } else {
        showToast(`儲存預設匯出資料夾失敗: ${result.error}`, 'error');
    }
}

export function updateAutomationTaskFormVisibility() {
    const modal = getAutomationModal();
    if (!modal) return;

    const frequency = modal.querySelector('#auto-task-frequency')?.value || 'immediate';
    const taskType = modal.querySelector('#auto-task-type')?.value || 'export';
    const target = modal.querySelector('#auto-task-target')?.value || 'last_week_records';

    modal.querySelector('#auto-task-day-weekly-container')?.classList.toggle('hidden', frequency !== 'weekly');
    modal.querySelector('#auto-task-day-monthly-container')?.classList.toggle('hidden', frequency !== 'monthly');
    modal.querySelector('#auto-task-time-container')?.classList.toggle('hidden', frequency === 'immediate');
    modal.querySelector('#auto-task-export-template-container')?.classList.toggle('hidden', !isAttendanceExportTask(taskType, target));
    modal.querySelector('#auto-task-export-directory-container')?.classList.toggle('hidden', !isExportTask(taskType));
}

export async function openAutomationModal() {
    const [tasksResult] = await Promise.all([
        dbRequest('loadAutomationTasks'),
        loadAutomationExportDirectory(),
        loadExternalApiSettings()
    ]);
    if (tasksResult.success) {
        setState({ automationTasks: tasksResult.data });
    }
    renderAutomationTasks();
    await renderAutomationLogs();
    resetAutomationTaskForm();
    showModal('automation-modal');
}

export function renderAutomationTasks() {
    const modal = getAutomationModal();
    const list = modal?.querySelector('#automation-tasks-list');
    if (!list) return;

    list.innerHTML = '';
    if (state.automationTasks.length === 0) {
        list.innerHTML = '<p class="text-gray-400 text-center p-4">尚未建立自動化任務。</p>';
        return;
    }

    state.automationTasks
        .slice()
        .sort((left, right) => (left.time || '23:59').localeCompare(right.time || '23:59'))
        .forEach((task) => {
            const dayText = task.frequency === 'weekly'
                ? DAY_NAMES[task.day] || ''
                : task.frequency === 'monthly'
                    ? `${task.day} 日`
                    : '';
            const timeText = task.time ? `${dayText ? `${dayText} ` : ''}${task.time}` : (dayText || '立即');
            const templateText = isAttendanceExportTask(task.task_type, task.target)
                ? ` / 模板：${EXPORT_TEMPLATE_NAMES[task.export_template] || EXPORT_TEMPLATE_NAMES.full}`
                : '';
            const exportDirectoryText = task.task_type === 'export'
                ? ` / 匯出資料夾：${getResolvedExportDirectoryLabel(task)}`
                : '';

            const item = document.createElement('div');
            item.className = 'p-3 bg-white rounded-lg border flex items-center justify-between';
            item.dataset.id = task.id;
            item.innerHTML = `
                <div class="flex items-center flex-grow">
                    <div class="flex-grow">
                        <p class="font-bold text-gray-800">${FREQUENCY_NAMES[task.frequency] || task.frequency} ${timeText}</p>
                        <p class="text-sm text-gray-600">
                            任務：${TASK_TYPE_NAMES[task.task_type] || task.task_type}
                            ${TARGET_NAMES[task.target] || task.target}
                            ${templateText}
                            ${exportDirectoryText}
                        </p>
                    </div>
                </div>
                <div class="space-x-2 flex-shrink-0">
                    <button class="text-blue-600 hover:underline edit-auto-task-btn">編輯</button>
                    <button class="text-red-600 hover:underline delete-auto-task-btn">刪除</button>
                </div>
            `;
            list.appendChild(item);
        });
}

export async function renderAutomationLogs() {
    const result = await dbRequest('loadAutomationLog');
    if (result.success) {
        setState({ automationLogs: result.data });
    }

    const list = getAutomationModal()?.querySelector('#automation-log-list');
    if (!list) return;

    list.innerHTML = '';
    if (state.automationLogs.length === 0) {
        list.innerHTML = '<p class="text-gray-400 text-center p-4">目前沒有自動化日誌。</p>';
        return;
    }

    const statusIcons = {
        success: '<span class="text-green-500">✓</span>',
        error: '<span class="text-red-500">✕</span>',
        info: '<span class="text-blue-500">i</span>'
    };

    state.automationLogs
        .slice()
        .sort((left, right) => right.timestamp - left.timestamp)
        .forEach((logEntry) => {
            const item = document.createElement('div');
            item.className = 'p-2 bg-white rounded border';
            item.innerHTML = `
                <p class="text-gray-500 text-xs">${new Date(logEntry.timestamp).toLocaleString()}</p>
                <p class="text-gray-800">${statusIcons[logEntry.status] || ''} ${logEntry.message}</p>
            `;
            list.appendChild(item);
        });
}

export function resetAutomationTaskForm() {
    const modal = getAutomationModal();
    if (!modal) return;

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
    modal.querySelector('#auto-task-export-template').value = 'full';
    const exportDirectoryInput = getAutomationTaskDirectoryInput();
    if (exportDirectoryInput) exportDirectoryInput.value = '';
    syncAutomationExportDirectoryControls();
    updateAutomationTaskFormVisibility();
}

export async function saveAutomationTask() {
    const modal = getAutomationModal();
    if (!modal) return;

    const frequency = modal.querySelector('#auto-task-frequency').value;
    const taskType = modal.querySelector('#auto-task-type').value;
    const target = modal.querySelector('#auto-task-target').value;
    const day = frequency === 'monthly'
        ? modal.querySelector('#auto-task-day-monthly').value
        : modal.querySelector('#auto-task-day-weekly').value;
    const time = modal.querySelector('#auto-task-time').value;
    const exportTemplate = isAttendanceExportTask(taskType, target)
        ? modal.querySelector('#auto-task-export-template').value
        : 'full';
    const exportDirectory = isExportTask(taskType)
        ? getAutomationTaskDirectoryInput()?.value?.trim() || ''
        : '';

    if (frequency !== 'immediate' && !time) {
        showToast('請設定排程時間。', 'error');
        return;
    }

    const taskData = {
        frequency,
        day,
        time: frequency === 'immediate' ? '' : time,
        task_type: taskType,
        target,
        export_template: exportTemplate,
        export_directory: exportDirectory
    };

    if (frequency === 'immediate') {
        showToast('正在執行立即任務...', 'info');
        const result = await executeTaskNow({ ...taskData, id: `immediate_${Date.now()}` });
        if (result.success) {
            if (result.notificationType) {
                await refreshData(result.notificationType);
            }
            showToast(result.message || '立即任務已完成。', 'success');
        } else {
            showToast(`立即任務執行失敗: ${result.error}`, 'error');
        }
        return;
    }

    let updatedTasks = [...state.automationTasks];
    if (state.editingAutomationTaskId) {
        updatedTasks = updatedTasks.map((task) => (
            task.id === state.editingAutomationTaskId
                ? { ...task, ...taskData }
                : task
        ));
    } else {
        updatedTasks.push({ id: `auto_task_${Date.now()}`, ...taskData, enabled: true });
    }

    const result = await dbRequest('saveAutomationTasks', updatedTasks);
    if (result.success) {
        setState({ automationTasks: updatedTasks });
        showToast(`自動化任務已${state.editingAutomationTaskId ? '更新' : '新增'}。`, 'success');
        renderAutomationTasks();
        resetAutomationTaskForm();
    } else {
        showToast(`儲存自動化任務失敗: ${result.error}`, 'error');
    }
}

export async function handleAutomationTaskAction(event) {
    const taskElement = event.target.closest('[data-id]');
    if (!taskElement) return;

    const taskId = taskElement.dataset.id;
    const task = state.automationTasks.find((item) => item.id === taskId);
    if (!task) return;

    if (event.target.classList.contains('edit-auto-task-btn')) {
        const modal = getAutomationModal();
        setState({ editingAutomationTaskId: taskId });
        modal.querySelector('#auto-task-form-title').textContent = '編輯自動任務';
        modal.querySelector('#save-automation-task-btn').textContent = '儲存變更';
        modal.querySelector('#cancel-auto-task-edit-btn').classList.remove('hidden');
        modal.querySelector('#auto-task-frequency').value = task.frequency;
        if (task.frequency === 'weekly') {
            modal.querySelector('#auto-task-day-weekly').value = task.day;
        } else if (task.frequency === 'monthly') {
            modal.querySelector('#auto-task-day-monthly').value = task.day;
        }
        modal.querySelector('#auto-task-time').value = task.time || '';
        modal.querySelector('#auto-task-type').value = task.task_type;
        modal.querySelector('#auto-task-target').value = task.target;
        modal.querySelector('#auto-task-export-template').value = task.export_template || 'full';
        const exportDirectoryInput = getAutomationTaskDirectoryInput();
        if (exportDirectoryInput) exportDirectoryInput.value = task.export_directory || '';
        updateAutomationTaskFormVisibility();
        return;
    }

    if (event.target.classList.contains('delete-auto-task-btn')) {
        showConfirm('刪除任務', '確定要刪除這個自動化任務嗎？', async () => {
            const updatedTasks = state.automationTasks.filter((item) => item.id !== taskId);
            const result = await dbRequest('saveAutomationTasks', updatedTasks);
            if (result.success) {
                setState({ automationTasks: updatedTasks });
                renderAutomationTasks();
                showToast('自動化任務已刪除。', 'success');
            } else {
                showToast(`刪除自動化任務失敗: ${result.error}`, 'error');
            }
            hideModal('confirm-modal');
        });
    }
}

export async function clearAutomationLogs() {
    showConfirm('清空日誌', '確定要清空全部自動化日誌嗎？', async () => {
        const result = await dbRequest('clearAutomationLog');
        if (result.success) {
            setState({ automationLogs: [] });
            renderAutomationLogs();
            showToast('自動化日誌已清空。', 'success');
        } else {
            showToast(`清空自動化日誌失敗: ${result.error}`, 'error');
        }
        hideModal('confirm-modal');
    });
}
