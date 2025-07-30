/**
 * @file ui.js
 * @description 魔法物件名錄 - 集中管理所有DOM元素的參照
 * 將所有 getElementById 集中於此，方便管理與維護。
 */

// 輔助函式，簡化 getElementById
const getElem = (id) => document.getElementById(id);

// 導出一個包含所有UI元素參照的物件
export const ui = {
    // 主畫面元素
    mainTitle: getElem('main-title'),
    clockPanel: getElem('clock-panel'),
    currentDate: getElem('current-date'),
    currentTime: getElem('current-time'),
    clockDecorationContainer: getElem('clock-decoration-container'),
    clockSymbolsContainer: getElem('clock-panel-symbols-container'),
    punchInput: getElem('punch-input'),
    shiftSelector: getElem('shift-selector'),
    punchStatusSelector: getElem('punch-status-selector'),
    messageBox: getElem('message-box'),
    togglePanelBtn: getElem('toggle-panel-btn'),
    toggleReportBtn: getElem('toggle-report-btn'),
    openAutomationBtn: getElem('open-automation-btn'),
    punchEffectContainer: getElem('punch-effect-container'),
    dynamicThemeStyles: getElem('dynamic-theme-styles'),
    toastContainer: getElem('toast-container'),
    bellAudioPlayer: getElem('bell-audio-player'),

    // 管理者面板
    managementPanel: getElem('management-panel'),
    
    // 人員管理
    empIdInput: getElem('emp-id'),
    empNameInput: getElem('emp-name'),
    empGenderInput: getElem('emp-gender'),
    empDepartmentInput: getElem('emp-department'),
    empCardInput: getElem('emp-card'),
    empPasswordInput: getElem('emp-password'),
    empNationalityInput: getElem('emp-nationality'),
    empBirthDateInput: getElem('emp-birth-date'),
    empHireDateInput: getElem('emp-hire-date'),
    empTerminationDateInput: getElem('emp-termination-date'),
    empNotesInput: getElem('emp-notes'),
    saveEmployeeBtn: getElem('save-employee-btn'),
    importCsvBtn: getElem('import-csv-btn'),
    exportCsvBtn: getElem('export-csv-btn'),
    csvFileName: getElem('csv-file-name'),
    manageRosterBtn: getElem('manage-roster-btn'),

    // 班別設定
    shiftSettingsContainer: getElem('shift-settings-container'),
    saveShiftsBtn: getElem('save-shifts-btn'),

    // 手動補登
    manualEmpId: getElem('manual-emp-id'),
    manualDate: getElem('manual-date'),
    manualTime: getElem('manual-time'),
    manualShiftSelector: getElem('manual-shift-selector'),
    manualStatus: getElem('manual-status'),
    manualPunchBtn: getElem('manual-punch-btn'),

    // 特效與問候語
    editSpecialEffectsBtn: getElem('edit-special-effects-btn'),
    editThemeSchedulesBtn: getElem('edit-theme-schedules-btn'),
    editGreetingsInBtn: getElem('edit-greetings-in-btn'),
    editGreetingsOutBtn: getElem('edit-greetings-out-btn'),
    
    // 響鈴設定
    openBellHistoryModalBtn: getElem('open-bell-history-modal-btn'),
    openManageSoundsModalBtn: getElem('open-manage-sounds-modal-btn'),
    openAddBellModalBtn: getElem('open-add-bell-modal-btn'),
    bellScheduleList: getElem('bell-schedule-list'),

    // 所有 Modal 元素
    modals: {
        password: getElem('password-modal'),
        addBell: getElem('add-bell-modal'),
        manageSounds: getElem('manage-sounds-modal'),
        bellHistory: getElem('bell-history-modal'),
        roster: getElem('roster-modal'),
        confirm: getElem('confirm-modal'),
        reportLogin: getElem('report-login-modal'),
        reportDateRange: getElem('report-date-range-modal'),
        reportView: getElem('report-view-modal'),
        greetings: getElem('greetings-modal'),
        specialEffects: getElem('special-effects-modal'),
        themeSchedule: getElem('theme-schedule-modal'),
        themeEditor: getElem('theme-editor-modal'),
        aiPassword: getElem('ai-password-modal'),
        changePassword: getElem('change-password-modal'),
        automation: getElem('automation-modal'),
    },

    // 確認 Modal
    confirmTitle: getElem('confirm-title'),
    confirmMessage: getElem('confirm-message'),
    cancelConfirmBtn: getElem('cancel-confirm-btn'),
    confirmConfirmBtn: getElem('confirm-confirm-btn'),
    
    // 主題編輯器
    themeEditor: {
        name: getElem('theme-editor-name'),
        bgStart: getElem('theme-editor-bg-start'),
        bgEnd: getElem('theme-editor-bg-end'),
        mainTitleColor: getElem('theme-editor-main-title-color'),
        btnAdminBg: getElem('theme-editor-btn-admin-bg'),
        btnAdminText: getElem('theme-editor-btn-admin-text'),
        btnReportBg: getElem('theme-editor-btn-report-bg'),
        btnReportText: getElem('theme-editor-btn-report-text'),
        btnAiBg: getElem('theme-editor-btn-ai-bg'),
        btnAiText: getElem('theme-editor-btn-ai-text'),
        clockBg: getElem('theme-editor-clock-bg'),
        clockText: getElem('theme-editor-clock-text'),
        clockDecoLeft: getElem('theme-editor-clock-deco-left'),
        clockDecoRight: getElem('theme-editor-clock-deco-right'),
        clockSymbolsLeft: getElem('theme-editor-clock-symbols-left'),
        clockSymbolsRight: getElem('theme-editor-clock-symbols-right'),
        blinkEnabled: getElem('theme-editor-blink-enabled'),
        blinkColor: getElem('theme-editor-blink-color'),
        punchEffect: getElem('theme-editor-punch-effect'),
        punchEmojis: getElem('theme-editor-punch-emojis'),
        preview: getElem('theme-editor-preview'),
        loadSelect: getElem('theme-editor-load-select'),
        closeBtn: getElem('close-theme-editor-btn'),
        deleteBtn: getElem('delete-custom-theme-btn'),
        saveBtn: getElem('save-custom-theme-btn'),
    },
};
