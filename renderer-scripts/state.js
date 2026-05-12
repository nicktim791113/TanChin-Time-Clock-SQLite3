/**
 * @file state.js
 * @description 城堡的記憶水晶 - 集中管理應用程式的狀態
 * 這裡存放著所有從資料庫讀取出來、會在應用程式執行期間變動的資料。
 */

export let employees = [];
export let shifts = [];
export let punchRecords = [];
export let bellSchedules = [];
export let customSounds = [];
export let bellHistory = [];
export let specialEffects = [];
export let themeSchedules = [];
export let customThemes = [];
export let automationTasks = [];
export let automationLogs = [];
export let automationExportDirectory = '';
export let externalApiEnabled = false;
export let externalApiKey = '';
export let greetings = []; 
export let adminPassword = 'TC5128'; // 預設管理者密碼
export let systemPassword = '0000'; // 預設系統密碼
export let mainTitle = '震欣科技AI作息系統'; // 預設主標題
// ★ [3] 新增副標題的狀態變數
export let subtitle = '您的 AI 智慧好夥伴'; // 預設副標題

// 用於計時器和暫存ID的變數
export let punchInputTimeout = null;
export let reportViewTimeout = null;
export let manualSelectionTimeout = null;
export let reportTimerInterval = null;
export let bellAudioTimeout = null;

// 用於追蹤當前操作狀態的變數
export let editingGreetingId = null;
export let currentPasswordChangeType = null;
export let reportLoginIdentity = null;
export let confirmCallback = null;
export let editingBellId = null;
export let editingEffectId = null;
export let editingThemeScheduleId = null;
export let editingThemeId = null;
export let editingAutomationTaskId = null;
export let lastReportDateRange = { start: null, end: null };

// 表格排序設定
export let sortConfig = { key: 'id', direction: 'ascending' };

// 提供一個統一的介面來更新狀態，這樣未來可以更容易地追蹤狀態變更
export function setState(newState) {
    if (newState.employees !== undefined) employees = newState.employees;
    if (newState.shifts !== undefined) shifts = newState.shifts;
    if (newState.punchRecords !== undefined) punchRecords = newState.punchRecords;
    if (newState.bellSchedules !== undefined) bellSchedules = newState.bellSchedules;
    if (newState.customSounds !== undefined) customSounds = newState.customSounds;
    if (newState.bellHistory !== undefined) bellHistory = newState.bellHistory;
    if (newState.specialEffects !== undefined) specialEffects = newState.specialEffects;
    if (newState.themeSchedules !== undefined) themeSchedules = newState.themeSchedules;
    if (newState.customThemes !== undefined) customThemes = newState.customThemes;
    if (newState.automationTasks !== undefined) automationTasks = newState.automationTasks;
    if (newState.automationLogs !== undefined) automationLogs = newState.automationLogs;
    if (newState.automationExportDirectory !== undefined) automationExportDirectory = newState.automationExportDirectory;
    if (newState.externalApiEnabled !== undefined) externalApiEnabled = newState.externalApiEnabled;
    if (newState.externalApiKey !== undefined) externalApiKey = newState.externalApiKey;
    if (newState.greetings !== undefined) greetings = newState.greetings;
    if (newState.adminPassword !== undefined) adminPassword = newState.adminPassword;
    if (newState.systemPassword !== undefined) systemPassword = newState.systemPassword;
    if (newState.mainTitle !== undefined) mainTitle = newState.mainTitle;
    // ★ [4] 讓 setState 函式能夠處理新的副標題狀態
    if (newState.subtitle !== undefined) subtitle = newState.subtitle;
    if (newState.punchInputTimeout !== undefined) punchInputTimeout = newState.punchInputTimeout;
    if (newState.reportViewTimeout !== undefined) reportViewTimeout = newState.reportViewTimeout;
    if (newState.manualSelectionTimeout !== undefined) manualSelectionTimeout = newState.manualSelectionTimeout;
    if (newState.reportTimerInterval !== undefined) reportTimerInterval = newState.reportTimerInterval;
    if (newState.bellAudioTimeout !== undefined) bellAudioTimeout = newState.bellAudioTimeout;
    if (newState.editingGreetingId !== undefined) editingGreetingId = newState.editingGreetingId;
    if (newState.currentPasswordChangeType !== undefined) currentPasswordChangeType = newState.currentPasswordChangeType;
    if (newState.reportLoginIdentity !== undefined) reportLoginIdentity = newState.reportLoginIdentity;
    if (newState.confirmCallback !== undefined) confirmCallback = newState.confirmCallback;
    if (newState.editingBellId !== undefined) editingBellId = newState.editingBellId;
    if (newState.editingEffectId !== undefined) editingEffectId = newState.editingEffectId;
    if (newState.editingThemeScheduleId !== undefined) editingThemeScheduleId = newState.editingThemeScheduleId;
    if (newState.editingThemeId !== undefined) editingThemeId = newState.editingThemeId;
    if (newState.editingAutomationTaskId !== undefined) editingAutomationTaskId = newState.editingAutomationTaskId;
    if (newState.lastReportDateRange !== undefined) lastReportDateRange = newState.lastReportDateRange;
    if (newState.sortConfig !== undefined) sortConfig = newState.sortConfig;
}
