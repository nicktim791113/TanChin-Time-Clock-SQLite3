/**
 * @file event-listeners.js
 * @description 魔法契約與響應 - 集中設定所有DOM事件監聽器 (已修正)
 */
import { ui } from './ui.js';
import * as state from './state.js';
import { setState } from './state.js';
import { dbRequest, onPlaySound, onBellHistoryUpdated, onDataUpdated, importThemeImage } from './api.js';
import { showModal, hideModal, showConfirm } from './handlers/modalHandler.js';
import { handlePunch, autoSelectShift, resetSelectorsToAuto, executeManualPunch } from './handlers/punchHandler.js';
import { showReportLogin, handleReportLogin, handleReportDateRange, exportReportToCsv, renderReport } from './handlers/reportHandler.js';
import { saveEmployee, renderRosterModal, handleImportCsv, handleExportCsv, handleRosterAction, handleRosterColumnToggle, resetRosterColumns } from './handlers/employeeHandler.js';
// ★ [8] 引用 saveDataSettings 而不是 saveMainTitle
import { 
    loadShiftsToPanel, populateShiftSelectors, saveShifts, openGreetingsModal, renderGreetingsList, saveGreeting, handleGreetingAction, renderBellSchedulesInPanel, openAddBellModal, saveBellSchedule, 
    renderCustomSoundsInModal, importNewSound, renderBellHistoryInModal, clearAllBellHistory, 
    openChangePasswordModal, handleChangePassword, saveDataSettings
} from './handlers/settingsHandler.js';
import { 
    renderSpecialEffects, resetEffectForm, saveSpecialEffect, handleSpecialEffectAction,
    renderThemeSchedules, resetThemeScheduleForm, saveThemeSchedule, openThemeEditor, 
    updateThemeEditorPreview, saveCustomTheme, deleteCustomTheme, loadThemeForEditing, populateThemeScheduleSelector,
    handleThemeScheduleAction, checkAndApplyThemeSchedule, populateThemeEditorLoadSelector
} from './handlers/themeHandler.js';
import {
    openAutomationModal, saveAutomationTask, clearAutomationLogs, renderAutomationLogs,
    handleAutomationTaskAction, resetAutomationTaskForm, updateAutomationTaskFormVisibility,
    chooseAutomationExportDirectory, clearAutomationExportDirectory, saveAutomationExportDirectorySetting,
    loadAutomationExportDirectory, renderAutomationTasks, loadExternalApiSettings,
    saveExternalApiSettings, clearExternalApiKey, syncExternalApiSettingsControls
} from './handlers/automationHandler.js';
import { showToast } from './utils.js';
import { refreshData } from './main.js';

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
            showModal('password-modal', 'password-input');
        }
    });
    ui.toggleReportBtn.addEventListener('click', showReportLogin);
    ui.openAutomationBtn.addEventListener('click', () => {
        ui.modals.aiPassword.querySelector('#ai-password-input').value = '';
        showModal('ai-password-modal', 'ai-password-input');
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

    // --- 設定 Tab 鍵的循環路徑 ---
    setupTabFocusTrap();
}

/**
 * 設定主畫面的 Tab 鍵焦點循環
 */
function setupTabFocusTrap() {
    const focusableElements = [
        ui.punchInput,
        ui.shiftSelector,
        ui.punchStatusSelector,
        ui.togglePanelBtn,
        ui.toggleReportBtn,
        ui.openAutomationBtn
    ].filter(Boolean); 

    if (focusableElements.length < 2) return;

    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    lastFocusable.addEventListener('keydown', (e) => {
        if (e.key === 'Tab' && !e.shiftKey) {
            e.preventDefault();
            firstFocusable.focus();
        }
    });

    firstFocusable.addEventListener('keydown', (e) => {
        if (e.key === 'Tab' && e.shiftKey) {
            e.preventDefault();
            lastFocusable.focus();
        }
    });
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
    ui.modals.automation.querySelector('#cancel-auto-task-edit-btn').addEventListener('click', resetAutomationTaskForm);
    ui.modals.automation.querySelector('#select-automation-export-directory-btn').addEventListener('click', () => chooseAutomationExportDirectory('default'));
    ui.modals.automation.querySelector('#clear-automation-export-directory-btn').addEventListener('click', () => clearAutomationExportDirectory('default'));
    ui.modals.automation.querySelector('#save-automation-export-directory-btn').addEventListener('click', saveAutomationExportDirectorySetting);
    ui.modals.automation.querySelector('#external-api-enabled').addEventListener('change', (event) => {
        setState({
            externalApiEnabled: event.target.checked,
            externalApiKey: ui.modals.automation.querySelector('#external-api-key')?.value || ''
        });
        syncExternalApiSettingsControls();
    });
    ui.modals.automation.querySelector('#external-api-key').addEventListener('input', (event) => {
        setState({ externalApiKey: event.target.value || '' });
        syncExternalApiSettingsControls();
    });
    ui.modals.automation.querySelector('#clear-external-api-key-btn').addEventListener('click', () => {
        clearExternalApiKey();
        setState({ externalApiKey: '' });
        syncExternalApiSettingsControls();
    });
    ui.modals.automation.querySelector('#save-external-api-settings-btn').addEventListener('click', saveExternalApiSettings);
    ui.modals.automation.querySelector('#select-auto-task-export-directory-btn').addEventListener('click', () => chooseAutomationExportDirectory('task'));
    ui.modals.automation.querySelector('#clear-auto-task-export-directory-btn').addEventListener('click', () => clearAutomationExportDirectory('task'));
    
    ['auto-task-frequency', 'auto-task-type', 'auto-task-target'].forEach((id) => {
        const field = document.getElementById(id);
        if (field) field.addEventListener('change', updateAutomationTaskFormVisibility);
    });

    // 問候語 Modal
    const greetingsModal = ui.modals.greetings;
    greetingsModal.querySelector('#save-greeting-btn').addEventListener('click', saveGreeting);
    greetingsModal.querySelector('#close-greetings-btn').addEventListener('click', () => hideModal('greetings-modal'));
    greetingsModal.querySelector('#cancel-greeting-edit-btn').addEventListener('click', () => {
        const formTitle = greetingsModal.querySelector('#greetings-form-title');
        const saveBtn = greetingsModal.querySelector('#save-greeting-btn');
        const cancelEditBtn = greetingsModal.querySelector('#cancel-greeting-edit-btn');
        
        setState({ editingGreetingId: null });
        formTitle.textContent = '新增問候語';
        saveBtn.textContent = '儲存';
        cancelEditBtn.classList.add('hidden');
        greetingsModal.querySelector('#greeting-type').value = 'in';
        greetingsModal.querySelector('#greeting-message').value = '';
        greetingsModal.querySelector('#greeting-emp-id').value = '';
    });
    greetingsModal.querySelector('#greetings-list').addEventListener('click', handleGreetingAction);

    // 資料設定 Modal 的關閉按鈕
    ui.modals.dataSettings.querySelector('#cancel-data-settings-btn').addEventListener('click', () => hideModal('data-settings-modal'));

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

    // 系統設定相關
    ui.openDataSettingsBtn.addEventListener('click', () => showModal('data-settings-modal'));
    // ★ [9] 修改事件監聽，使其指向新的儲存按鈕和函式
    ui.saveDataSettingsBtn.addEventListener('click', saveDataSettings);
    
    // 特效與問候語
    ui.manageGreetingsBtn.addEventListener('click', openGreetingsModal);
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
    rosterModal.querySelector('#roster-column-toggle-list').addEventListener('change', handleRosterColumnToggle);
    rosterModal.querySelector('#reset-roster-columns-btn').addEventListener('click', resetRosterColumns);

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
        if (e.target.classList.contains('weekday-btn')) {
            e.target.classList.toggle('active');
        }
    });
    
    const manageSoundsModal = ui.modals.manageSounds;
    manageSoundsModal.addEventListener('click', async (e) => {
        const target = e.target;
        if (target.classList.contains('play-sound-btn')) {
            const soundPath = target.dataset.path;
            if (soundPath) {
                ui.bellAudioPlayer.src = soundPath;
                ui.bellAudioPlayer.play().catch(err => showToast(`播放失敗: ${err.message}`, 'error'));
            }
        } else if (target.classList.contains('remove-sound-btn')) {
            const soundId = target.dataset.id;
            const sound = state.customSounds.find(s => s.id === soundId);
            if (sound) {
                showConfirm('刪除音效', `您確定要刪除音效 "${sound.name}" 嗎？`, async () => {
                    try {
                        const updatedSounds = state.customSounds.filter(s => s.id !== soundId);
                        const result = await dbRequest('saveCustomSounds', updatedSounds);
                        if (result.success) {
                            setState({ customSounds: updatedSounds });
                            renderCustomSoundsInModal();
                            showToast('音效已刪除！', 'success');
                        } else {
                            throw new Error(result.error);
                        }
                    } catch (error) {
                        showToast(`刪除失敗: ${error.message}`, 'error');
                    } finally {
                        hideModal('confirm-modal');
                    }
                });
            }
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

    // AI 管家的任務列表
    const automationModal = ui.modals.automation;
    automationModal.querySelector('#automation-tasks-list').addEventListener('click', handleAutomationTaskAction);

    // 主題編輯器
    ui.themeEditor.saveBtn.addEventListener('click', saveCustomTheme);
    ui.themeEditor.deleteBtn.addEventListener('click', deleteCustomTheme);
    ui.themeEditor.loadSelect.addEventListener('change', (e) => loadThemeForEditing(e.target.value));
    ui.modals.themeEditor.addEventListener('input', (e) => {
        if (e.target.closest('.col-span-1')) {
            updateThemeEditorPreview();
        }
    });
    ui.themeEditor.selectBgImageBtn.addEventListener('click', async () => {
        const result = await importThemeImage();
        if (result.success) {
            ui.themeEditor.selectBgImageBtn.textContent = result.name;
            ui.themeEditor.selectBgImageBtn.dataset.path = result.path;
            updateThemeEditorPreview();
        }
    });
    ui.themeEditor.clearBgImageBtn.addEventListener('click', () => {
        ui.themeEditor.selectBgImageBtn.textContent = '選擇圖片...';
        delete ui.themeEditor.selectBgImageBtn.dataset.path;
        updateThemeEditorPreview();
    });
    ui.themeEditor.selectPageBgImageBtn?.addEventListener('click', async () => {
        const result = await importThemeImage();
        if (!result.success) return;
        ui.themeEditor.selectPageBgImageBtn.textContent = result.name;
        ui.themeEditor.preview.dataset.pageBgImage = result.path;
        updateThemeEditorPreview();
    });
    ui.themeEditor.clearPageBgImageBtn?.addEventListener('click', () => {
        ui.themeEditor.selectPageBgImageBtn.textContent = '選擇圖片...';
        ui.themeEditor.preview.dataset.pageBgImage = '';
        updateThemeEditorPreview();
    });
    ui.themeEditor.selectTitleBgImageBtn?.addEventListener('click', async () => {
        const result = await importThemeImage();
        if (!result.success) return;
        ui.themeEditor.selectTitleBgImageBtn.textContent = result.name;
        ui.themeEditor.preview.dataset.titleBgImage = result.path;
        updateThemeEditorPreview();
    });
    ui.themeEditor.clearTitleBgImageBtn?.addEventListener('click', () => {
        ui.themeEditor.selectTitleBgImageBtn.textContent = '選擇圖片...';
        ui.themeEditor.preview.dataset.titleBgImage = '';
        updateThemeEditorPreview();
    });
    ui.themeEditor.punchEffect.addEventListener('change', (e) => {
        const isFall = e.target.value === 'fall';
        const isFlash = e.target.value === 'flash';
        ui.themeEditor.punchFallContent.classList.toggle('hidden', !isFall);
        ui.themeEditor.punchFlashContent.classList.toggle('hidden', !isFlash);
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

    onBellHistoryUpdated((newRecord) => {
        if (newRecord) {
            const updatedHistory = [newRecord, ...state.bellHistory];
            setState({ bellHistory: updatedHistory });
            if (ui.modals.bellHistory.classList.contains('show')) {
                renderBellHistoryInModal();
            }
        }
    });

    onDataUpdated(async ({ type }) => {
        showToast('偵測到背景資料更新，正在同步...', 'info');

        await refreshData(type);

        if (type === 'shifts') {
            loadShiftsToPanel();
            populateShiftSelectors();
            showToast('班別設定已同步。', 'success');
        }
        if (type === 'greetings') {
            if (ui.modals.greetings.classList.contains('show')) {
                renderGreetingsList();
            }
            showToast('問候語已同步。', 'success');
        }
        if (type === 'bellSchedules') {
            renderBellSchedulesInPanel();
            showToast('響鈴場景已同步。', 'success');
        }
        if (type === 'customSounds') {
            renderBellSchedulesInPanel();
            if (ui.modals.manageSounds.classList.contains('show')) {
                renderCustomSoundsInModal();
            }
            showToast('聲音庫已同步。', 'success');
        }
        if (type === 'automationLog') {
            renderAutomationLogs();
        }
        if (type === 'automationTasks' && ui.modals.automation.classList.contains('show')) {
            renderAutomationTasks();
            showToast('自動化任務清單已自動同步！', 'success');
        }
        if (type === 'automationExportDirectory' && ui.modals.automation.classList.contains('show')) {
            await loadAutomationExportDirectory();
            renderAutomationTasks();
            showToast('自動化匯出資料夾設定已同步。', 'success');
        }
        if (type === 'externalApiSettings') {
            if (ui.modals.automation.classList.contains('show')) {
                await loadExternalApiSettings();
            }
            showToast('外部 API 保護設定已同步。', 'success');
        }
        if (type === 'systemPassword') {
            showToast('系統密碼已同步為最新版本。', 'success');
        }
        if (type === 'adminPassword') {
            showToast('管理者密碼已同步為最新版本。', 'success');
        }
        if (type === 'displaySettings') {
            showToast('主畫面資料設定已同步。', 'success');
        }
        if (type === 'attendanceExportSettings') {
            showToast('考勤報表匯出欄位設定已同步。', 'success');
        }
        if (type === 'bellHistory' && ui.modals.bellHistory.classList.contains('show')) {
            renderBellHistoryInModal();
        }
        if (type === 'specialEffects') {
            if (ui.modals.specialEffects.classList.contains('show')) {
                renderSpecialEffects();
            }
            showToast('節日特效已同步。', 'success');
        }
        if (type === 'themeSchedules') {
            populateThemeScheduleSelector();
            checkAndApplyThemeSchedule();
            if (ui.modals.themeSchedule.classList.contains('show')) {
                renderThemeSchedules();
            }
            showToast('主題排程已同步。', 'success');
        }
        if (type === 'customThemes') {
            populateThemeEditorLoadSelector();
            populateThemeScheduleSelector();
            checkAndApplyThemeSchedule();
            if (ui.modals.themeSchedule.classList.contains('show')) {
                renderThemeSchedules();
            }
            if (ui.modals.themeEditor.classList.contains('show')) {
                updateThemeEditorPreview();
            }
            showToast('自訂主題已同步。', 'success');
        }

        if (ui.modals.reportView.classList.contains('show') && (type === 'punchRecords' || type === 'employees')) {
            console.log("偵測到報表開啟中，正在自動刷新...");
            const { start, end } = state.lastReportDateRange;
            if (start && end) {
                let recordsToView;
                if (state.reportLoginIdentity === 'admin') {
                    recordsToView = state.punchRecords.filter(p => p.timestamp >= start && p.timestamp <= end);
                } else {
                    recordsToView = state.punchRecords.filter(p => p.id === state.reportLoginIdentity && p.timestamp >= start && p.timestamp <= end);
                }
                renderReport(recordsToView.sort((a, b) => b.timestamp - a.timestamp));
                showToast('報表內容已自動更新！', 'success');
            }
        }
        
        if (ui.modals.roster.classList.contains('show') && type === 'employees') {
            console.log("偵測到名冊開啟中，正在自動刷新...");
            renderRosterModal();
            showToast('人員名冊已自動更新！', 'success');
        }
    });
}

// --- 輔助函式 ---

function handleGlobalInput(e) {
    const activeElement = document.activeElement;
    const isModalOpen = document.querySelector('.modal-overlay.show');

    // ✨ 魔法新增：Escape 鍵的歸返咒語 ✨
    if (e.key === 'Escape') {
        if (isModalOpen) {
            hideModal(isModalOpen.id);
        }
        return;
    }
    
    if ((e.key === 'Enter' || e.key === 'Tab') && !isModalOpen && activeElement === ui.punchInput && ui.punchInput.value.trim()) {
        e.preventDefault();
        handlePunch();
        return;
    }

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
