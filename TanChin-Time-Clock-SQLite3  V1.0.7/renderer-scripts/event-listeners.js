/**
 * @file event-listeners.js
 * @description 魔法契約與響應 - 集中設定所有DOM事件監聽器 (已修正)
 */
import { ui } from './ui.js';
import * as state from './state.js';
import { setState } from './state.js';
import { onPlaySound, onBellHistoryUpdated, onDataUpdated } from './api.js';
import { showModal, hideModal, showConfirm } from './handlers/modalHandler.js';
import { handlePunch, autoSelectShift, resetSelectorsToAuto, executeManualPunch } from './handlers/punchHandler.js';
import { showReportLogin, handleReportLogin, handleReportDateRange, exportReportToCsv } from './handlers/reportHandler.js';
import { saveEmployee, renderRosterModal, handleImportCsv, handleExportCsv, handleRosterAction } from './handlers/employeeHandler.js';
import { 
    saveShifts, openGreetingsModal, saveGreetings, renderBellSchedulesInPanel, openAddBellModal, saveBellSchedule, 
    renderCustomSoundsInModal, importNewSound, renderBellHistoryInModal, clearAllBellHistory, 
    openChangePasswordModal, handleChangePassword 
} from './handlers/settingsHandler.js';
import { 
    renderSpecialEffects, resetEffectForm, saveSpecialEffect, handleSpecialEffectAction,
    renderThemeSchedules, resetThemeScheduleForm, saveThemeSchedule, openThemeEditor, 
    updateThemeEditorPreview, saveCustomTheme, deleteCustomTheme, loadThemeForEditing, populateThemeScheduleSelector,
    handleThemeScheduleAction
} from './handlers/themeHandler.js';
import { openAutomationModal, saveAutomationTask, clearAutomationLogs, renderAutomationLogs } from './handlers/automationHandler.js';
import { showToast } from './utils.js';

/**
 * 初始化所有事件監聽器的咒語
 */
export function initializeEventListeners() {
    // --- 全域與主畫面監聽 ---
    document.addEventListener('keydown', handleGlobalInput);
    ui.punchInput.addEventListener('input', resetPunchInputTimeout);
    ui.punchInput.addEventListener('focus', resetPunchInputTimeout);
    ui.togglePanelBtn.addEventListener('click', () => {
        if (ui.managementPanel.style.maxHeight && ui.managementPanel.style.maxHeight !== '0px') {
            ui.managementPanel.style.maxHeight = '0px';
        } else {
            ui.modals.password.querySelector('#password-input').value = '';
            showModal('password-modal');
        }
    });
    ui.toggleReportBtn.addEventListener('click', showReportLogin);
    ui.openAutomationBtn.addEventListener('click', () => {
        ui.modals.aiPassword.querySelector('#ai-password-input').value = '';
        showModal('ai-password-modal');
    });
    [ui.shiftSelector, ui.punchStatusSelector].forEach(el => {
        el.addEventListener('change', () => {
            clearTimeout(state.manualSelectionTimeout);
            const newTimeout = setTimeout(() => {
                resetSelectorsToAuto();
            }, 10000);
            setState({ manualSelectionTimeout: newTimeout });
        });
    });

    // --- 各種 Modal 的關閉與確認按鈕 ---
    setupModalButtons();

    // --- 管理者面板 ---
    setupManagementPanelListeners();

    // --- Electron API 監聽 ---
    setupElectronApiListeners();
}

/**
 * 設定所有 Modal 內部按鈕的監聽
 */
function setupModalButtons() {
    // 密碼 Modal
    const adminPasswordInput = ui.modals.password.querySelector('#password-input');
    const confirmAdminPasswordBtn = ui.modals.password.querySelector('#confirm-password-btn');
    
    confirmAdminPasswordBtn.addEventListener('click', () => {
        if (adminPasswordInput.value === state.adminPassword) {
            hideModal('password-modal');
            ui.managementPanel.style.maxHeight = ui.managementPanel.scrollHeight + "px";
            adminPasswordInput.value = '';
        } else {
            adminPasswordInput.classList.add('shake-error');
            setTimeout(() => adminPasswordInput.classList.remove('shake-error'), 500);
            showToast('密碼錯誤!', 'error');
        }
    });
    adminPasswordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirmAdminPasswordBtn.click();
    });

    ui.modals.password.querySelector('#cancel-password-btn').addEventListener('click', () => hideModal('password-modal'));
    ui.modals.password.querySelector('#change-admin-password-btn').addEventListener('click', () => openChangePasswordModal('admin'));

    // 確認 Modal
    ui.cancelConfirmBtn.addEventListener('click', () => {
        hideModal('confirm-modal');
        setState({ confirmCallback: null });
    });
    ui.confirmConfirmBtn.addEventListener('click', () => {
        if (state.confirmCallback) state.confirmCallback();
    });

    // 報表登入 Modal
    const reportLoginInput = ui.modals.reportLogin.querySelector('#report-login-input');
    const confirmReportLoginBtn = ui.modals.reportLogin.querySelector('#confirm-report-login-btn');
    confirmReportLoginBtn.addEventListener('click', handleReportLogin);
    reportLoginInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirmReportLoginBtn.click();
    });
    ui.modals.reportLogin.querySelector('#cancel-report-login-btn').addEventListener('click', () => hideModal('report-login-modal'));
    
    // 報表日期 Modal
    ui.modals.reportDateRange.querySelector('#confirm-report-date-range-btn').addEventListener('click', handleReportDateRange);
    ui.modals.reportDateRange.querySelector('#cancel-report-date-range-btn').addEventListener('click', () => hideModal('report-date-range-modal'));

    // 報表檢視 Modal
    ui.modals.reportView.querySelector('#close-report-view-btn').addEventListener('click', () => {
        clearTimeout(state.reportViewTimeout);
        clearInterval(state.reportTimerInterval);
        hideModal('report-view-modal');
    });
    ui.modals.reportView.querySelector('#export-report-csv-btn').addEventListener('click', exportReportToCsv);

    // AI 密碼 Modal
    const aiPasswordInput = ui.modals.aiPassword.querySelector('#ai-password-input');
    const confirmAiPasswordBtn = ui.modals.aiPassword.querySelector('#confirm-ai-password-btn');
    confirmAiPasswordBtn.addEventListener('click', () => {
        if (aiPasswordInput.value === state.systemPassword) {
            hideModal('ai-password-modal');
            openAutomationModal();
            aiPasswordInput.value = '';
        } else {
            aiPasswordInput.classList.add('shake-error');
            setTimeout(() => aiPasswordInput.classList.remove('shake-error'), 500);
            showToast('系統密碼錯誤!', 'error');
        }
    });
    aiPasswordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirmAiPasswordBtn.click();
    });
    ui.modals.aiPassword.querySelector('#cancel-ai-password-btn').addEventListener('click', () => hideModal('ai-password-modal'));
    ui.modals.aiPassword.querySelector('#change-system-password-btn').addEventListener('click', () => openChangePasswordModal('system'));

    // 變更密碼 Modal
    ui.modals.changePassword.querySelector('#confirm-change-password-btn').addEventListener('click', handleChangePassword);
    ui.modals.changePassword.querySelector('#cancel-change-password-btn').addEventListener('click', () => hideModal('change-password-modal'));

    // 自動化 Modal
    ui.modals.automation.querySelector('#close-automation-modal-btn').addEventListener('click', () => hideModal('automation-modal'));
    ui.modals.automation.querySelector('#save-automation-task-btn').addEventListener('click', saveAutomationTask);
    ui.modals.automation.querySelector('#clear-automation-log-btn').addEventListener('click', clearAutomationLogs);

    // ------------------- ✨ 修正咒語施展處 ✨ ------------------- //
    // 將問候語 Modal 內部的按鈕契約，都集中到這個屬於 Modal 的章節
    ui.modals.greetings.querySelector('#save-greetings-btn').addEventListener('click', saveGreetings);
    ui.modals.greetings.querySelector('#cancel-greetings-btn').addEventListener('click', () => hideModal('greetings-modal'));
    // ------------------- ✨ 咒語施展完畢 ✨ ------------------- //

    // 為所有可關閉的視窗簽訂關閉契約
    ui.modals.roster.querySelector('#close-roster-btn').addEventListener('click', () => hideModal('roster-modal'));
    ui.modals.specialEffects.querySelector('#close-effects-modal-btn').addEventListener('click', () => hideModal('special-effects-modal'));
    ui.modals.addBell.querySelector('#cancel-add-bell-btn').addEventListener('click', () => hideModal('add-bell-modal'));
    ui.modals.manageSounds.querySelector('#close-manage-sounds-btn').addEventListener('click', () => hideModal('manage-sounds-modal'));
    ui.modals.bellHistory.querySelector('#close-bell-history-btn').addEventListener('click', () => hideModal('bell-history-modal'));
    ui.modals.themeSchedule.querySelector('#close-theme-schedule-modal-btn').addEventListener('click', () => hideModal('theme-schedule-modal'));
    ui.themeEditor.closeBtn.addEventListener('click', () => hideModal('theme-editor-modal'));
}

/**
 * 設定管理者面板內所有元素的監聽
 */
function setupManagementPanelListeners() {
    // 人員
    ui.saveEmployeeBtn.addEventListener('click', saveEmployee);
    ui.manageRosterBtn.addEventListener('click', renderRosterModal);
    ui.importCsvBtn.addEventListener('click', handleImportCsv);
    ui.exportCsvBtn.addEventListener('click', handleExportCsv);
    
    // 班別
    ui.saveShiftsBtn.addEventListener('click', saveShifts);

    // 手動補登
    ui.manualPunchBtn.addEventListener('click', executeManualPunch);

    // ------------------- ✨ 修正咒語施展處 ✨ ------------------- //
    // 確保開啟 Modal 的按鈕契約，被正確地記載於管理者面板的章節
    ui.editGreetingsInBtn.addEventListener('click', () => openGreetingsModal('in'));
    ui.editGreetingsOutBtn.addEventListener('click', () => openGreetingsModal('out'));
    // ------------------- ✨ 咒語施展完畢 ✨ ------------------- //
    
    ui.editSpecialEffectsBtn.addEventListener('click', () => {
        renderSpecialEffects();
        resetEffectForm();
        showModal('special-effects-modal');
    });
    ui.editThemeSchedulesBtn.addEventListener('click', () => {
        populateThemeScheduleSelector();
        renderThemeSchedules();
        resetThemeScheduleForm();
        showModal('theme-schedule-modal');
    });
    
    // 響鈴
    ui.openAddBellModalBtn.addEventListener('click', () => openAddBellModal());
    ui.modals.addBell.querySelector('#save-bell-btn').addEventListener('click', saveBellSchedule);
    ui.openManageSoundsModalBtn.addEventListener('click', () => { renderCustomSoundsInModal(); showModal('manage-sounds-modal'); });
    ui.modals.manageSounds.querySelector('#import-sound-btn').addEventListener('click', importNewSound);
    ui.openBellHistoryModalBtn.addEventListener('click', () => { renderBellHistoryInModal(); showModal('bell-history-modal'); });
    ui.modals.bellHistory.querySelector('#clear-bell-history-btn').addEventListener('click', clearAllBellHistory);

    // --- 各個 Modal 內部的動態事件監聽 ---
    setupDynamicModalListeners();
}

/**
 * 設定那些內容會動態生成的 Modal 的事件監聽 (使用事件委派)
 */
function setupDynamicModalListeners() {
    const rosterModal = ui.modals.roster;
    // 排序功能
    rosterModal.querySelector('thead').addEventListener('click', e => {
        const sortKey = e.target.closest('[data-sort]')?.dataset.sort;
        if (!sortKey) return;
        if (state.sortConfig.key === sortKey) {
            state.sortConfig.direction = state.sortConfig.direction === 'ascending' ? 'descending' : 'ascending';
        } else {
            state.sortConfig.key = sortKey;
            state.sortConfig.direction = 'ascending';
        }
        renderRosterModal();
    });
    // 編輯與刪除
    rosterModal.querySelector('tbody').addEventListener('click', handleRosterAction);

    // 響鈴排程列表
    ui.bellScheduleList.addEventListener('click', async e => {
        const scheduleId = e.target.closest('[data-id]')?.dataset.id;
        if (!scheduleId) return;
    
        if (e.target.classList.contains('edit-bell-btn')) {
            openAddBellModal(scheduleId);
        } else if (e.target.classList.contains('delete-bell-btn')) {
            showConfirm('刪除響鈴', '您確定要刪除此響鈴排程嗎？', async () => {
                const updatedSchedules = state.bellSchedules.filter(s => s.id !== scheduleId);
                await dbRequest('saveBellSchedules', updatedSchedules);
                setState({ bellSchedules: updatedSchedules });
                renderBellSchedulesInPanel();
                hideModal('confirm-modal');
            });
        } else if (e.target.classList.contains('toggle-enabled')) {
            const schedule = state.bellSchedules.find(s => s.id === scheduleId);
            if (schedule) {
                schedule.enabled = e.target.checked;
                await dbRequest('saveBellSchedules', state.bellSchedules);
                showToast(`響鈴 "${schedule.title}" 已${schedule.enabled ? '啟用' : '停用'}`, 'info');
            }
        }
    });

    // 為「新增響鈴視窗」的星期按鈕容器添加點擊監聽
    const addBellModal = ui.modals.addBell;
    addBellModal.querySelector('#bell-weekdays-container').addEventListener('click', e => {
        // 確保點擊的是按鈕
        if (e.target.classList.contains('weekday-btn')) {
            // 切換按鈕的 active 狀態
            e.target.classList.toggle('active');
        }
    });
    
    // 特效設定
    const effectsModal = ui.modals.specialEffects;
    effectsModal.querySelector('#save-effect-btn').addEventListener('click', saveSpecialEffect);
    effectsModal.querySelector('#cancel-effect-edit-btn').addEventListener('click', resetEffectForm);
    effectsModal.querySelector('#special-effects-list').addEventListener('click', handleSpecialEffectAction);

    // 主題排程
    const themeScheduleModal = ui.modals.themeSchedule;
    themeScheduleModal.querySelector('#save-theme-schedule-btn').addEventListener('click', saveThemeSchedule);
    themeScheduleModal.querySelector('#cancel-theme-edit-btn').addEventListener('click', resetThemeScheduleForm);
    themeScheduleModal.querySelector('#open-theme-editor-btn').addEventListener('click', openThemeEditor);
    themeScheduleModal.querySelector('#theme-schedules-list').addEventListener('click', handleThemeScheduleAction);


    // 主題編輯器
    ui.themeEditor.saveBtn.addEventListener('click', saveCustomTheme);
    ui.themeEditor.deleteBtn.addEventListener('click', deleteCustomTheme);
    ui.themeEditor.loadSelect.addEventListener('change', (e) => loadThemeForEditing(e.target.value));
    ui.modals.themeEditor.addEventListener('input', (e) => {
        if (e.target.closest('.col-span-1')) {
            updateThemeEditorPreview();
        }
    });
}

/**
 * 設定 Electron 主行程通訊的監聽
 */
function setupElectronApiListeners() {
    onPlaySound(data => {
        ui.bellAudioPlayer.src = data.sound;
        ui.bellAudioPlayer.play().catch(e => console.error("音效播放失敗:", e));
        
        clearTimeout(state.bellAudioTimeout);
        const newTimeout = setTimeout(() => {
            ui.bellAudioPlayer.pause();
            ui.bellAudioPlayer.currentTime = 0;
        }, (data.duration || 5) * 1000);
        setState({ bellAudioTimeout: newTimeout });
    });

    onBellHistoryUpdated(async () => {
        const result = await dbRequest('loadBellHistory');
        if (result.success) {
            setState({ bellHistory: result.data });
            if (ui.modals.bellHistory.classList.contains('show')) {
                renderBellHistoryInModal();
            }
        }
    });

    onDataUpdated(async ({ type }) => {
        showToast('偵測到背景資料更新，正在同步...', 'info');
        if (type === 'punchRecords') {
            const result = await dbRequest('loadPunchRecords');
            if (result.success) setState({ punchRecords: result.data });
        } else if (type === 'employees') {
            const result = await dbRequest('loadEmployees');
            if (result.success) {
                setState({ employees: result.data });
                if (ui.modals.roster.classList.contains('show')) {
                    renderRosterModal();
                }
            }
        } else if (type === 'automationLog') {
            renderAutomationLogs();
        }
    });
}

// --- 輔助函式 ---

function handleGlobalInput(e) {
    const activeElement = document.activeElement;
    const isModalOpen = document.querySelector('.modal-overlay.show');
    
    if (e.key === 'Enter' && !isModalOpen) {
        if (activeElement === ui.punchInput || (activeElement.tagName !== 'INPUT' && activeElement.tagName !== 'TEXTAREA' && activeElement.tagName !== 'BUTTON')) {
            handlePunch();
        }
        return;
    }

    const isTypingInAllowedInput = (activeElement.tagName === 'INPUT' && activeElement.id !== 'punch-input') || activeElement.tagName === 'TEXTAREA';
    if (!ui.punchInput || isModalOpen || isTypingInAllowedInput) return;

    if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Process') {
        ui.punchInput.focus();
    }
}

function resetPunchInputTimeout() {
    clearTimeout(state.punchInputTimeout);
    clearTimeout(state.manualSelectionTimeout);
    const newTimeout = setTimeout(() => {
        if (document.activeElement === ui.punchInput && ui.punchInput.value) {
            ui.punchInput.value = '';
            resetSelectorsToAuto();
            showToast('輸入超時，內容與選擇已重設。', 'info');
        }
    }, 10000);
    setState({ punchInputTimeout: newTimeout });
}
