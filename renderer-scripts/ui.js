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
    // ★ [5] 新增副標題的UI參照
    subTitle: getElem('sub-title'),
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
    empNationalIdInput: getElem('emp-national-id'),
    empBirthDateInput: getElem('emp-birth-date'),
    empHireDateInput: getElem('emp-hire-date'),
    empTerminationDateInput: getElem('emp-termination-date'),
    empBankAccountInput: getElem('emp-bank-account'),
    empMobilePhoneInput: getElem('emp-mobile-phone'),
    empEmergencyContactInput: getElem('emp-emergency-contact'),
    empEmergencyPhoneInput: getElem('emp-emergency-phone'),
    empContactAddressInput: getElem('emp-contact-address'),
    empRegisteredAddressInput: getElem('emp-registered-address'),
    empFamilyStatusInput: getElem('emp-family-status'),
    empNotesInput: getElem('emp-notes'),
    empJobTitleInput: getElem('emp-job-title'), // ✨ 魔法新增
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

    // 系統設定
    appVersion: getElem('app-version'),
    openDataSettingsBtn: getElem('open-data-settings-btn'),
    mainTitleInput: getElem('main-title-input'),
    // ★ [6] 區塊開始: 新增副標題輸入框並修改儲存按鈕的參照
    subTitleInput: getElem('sub-title-input'),
    saveDataSettingsBtn: getElem('save-data-settings-btn'),
    // ★ [6] 區塊結束
    
    // 特效與問候語
    editSpecialEffectsBtn: getElem('edit-special-effects-btn'),
    editThemeSchedulesBtn: getElem('edit-theme-schedules-btn'),
    manageGreetingsBtn: getElem('manage-greetings-btn'),
    
    // 響鈴設定
    openBellHistoryModalBtn: getElem('open-bell-history-modal-btn'),
    openManageSoundsModalBtn: getElem('open-manage-sounds-modal-btn'),
    openAddBellModalBtn: getElem('open-add-bell-modal-btn'),
    bellScheduleList: getElem('bell-schedule-list'),

    // 所有 Modal 元素
    modals: {
        password: getElem('password-modal'),
        dataSettings: getElem('data-settings-modal'),
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
    
    themeEditor: {
        name: getElem('theme-editor-name'),
        bgDayStart: getElem('theme-editor-bg-day-start'),
        bgDayEnd: getElem('theme-editor-bg-day-end'),
        bgNightStart: getElem('theme-editor-bg-night-start'),
        bgNightEnd: getElem('theme-editor-bg-night-end'),
        dayStartTime: getElem('theme-editor-day-start-time'),
        nightStartTime: getElem('theme-editor-night-start-time'),
        mainTitleColor: getElem('theme-editor-main-title-color'),
        btnAdminBg: getElem('theme-editor-btn-admin-bg'),
        btnAdminText: getElem('theme-editor-btn-admin-text'),
        btnReportBg: getElem('theme-editor-btn-report-bg'),
        btnReportText: getElem('theme-editor-btn-report-text'),
        btnAiBg: getElem('theme-editor-btn-ai-bg'),
        btnAiText: getElem('theme-editor-btn-ai-text'),
        clockBg: getElem('theme-editor-clock-bg'),
        clockText: getElem('theme-editor-clock-text'),
        selectPageBgImageBtn: getElem('theme-editor-select-page-bg-image-btn'),
        clearPageBgImageBtn: getElem('theme-editor-clear-page-bg-image-btn'),
        selectTitleBgImageBtn: getElem('theme-editor-select-title-bg-image-btn'),
        clearTitleBgImageBtn: getElem('theme-editor-clear-title-bg-image-btn'),
        selectBgImageBtn: getElem('theme-editor-select-bg-image-btn'),
        clearBgImageBtn: getElem('theme-editor-clear-bg-image-btn'),
        clockBgPos: getElem('theme-editor-clock-bg-pos'),
        clockSymbolsLeft: getElem('theme-editor-clock-symbols-left'),
        clockSymbolsRight: getElem('theme-editor-clock-symbols-right'),
        blinkEnabled: getElem('theme-editor-blink-enabled'),
        blinkDayColor: getElem('theme-editor-blink-day-color'),
        blinkNightColor: getElem('theme-editor-blink-night-color'),
        punchEffect: getElem('theme-editor-punch-effect'),
        punchFallContent: getElem('theme-editor-punch-fall-content'),
        punchFlashContent: getElem('theme-editor-punch-flash-content'),
        preview: getElem('theme-editor-preview'),
        loadSelect: getElem('theme-editor-load-select'),
        closeBtn: getElem('close-theme-editor-btn'),
        deleteBtn: getElem('delete-custom-theme-btn'),
        saveBtn: getElem('save-custom-theme-btn'),
    },
};
