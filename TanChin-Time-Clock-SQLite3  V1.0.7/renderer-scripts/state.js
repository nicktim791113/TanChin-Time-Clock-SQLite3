/**
 * @file state.js
 * @description 城堡的記憶水晶 - 集中管理應用程式的狀態
 * 這裡存放著所有從資料庫讀取出來、會在應用程式執行期間變動的資料。
 * 透過 `export let`，我們允許其他魔法書讀取和修改這些狀態。
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
export let adminPassword = 'TC5128'; // 預設管理者密碼
export let systemPassword = '0000'; // 預設系統密碼

// 用於計時器和暫存ID的變數
export let punchInputTimeout = null;
export let reportViewTimeout = null;
export let manualSelectionTimeout = null;
export let reportTimerInterval = null;
export let bellAudioTimeout = null;

// 用於追蹤當前操作狀態的變數
export let currentGreetingsType = null;
export let currentPasswordChangeType = null;
export let reportLoginIdentity = null;
export let confirmCallback = null;
export let editingBellId = null;
export let editingEffectId = null;
export let editingThemeScheduleId = null;
export let editingThemeId = null;

// 表格排序設定
export let sortConfig = { key: 'id', direction: 'ascending' };

// 提供一個統一的介面來更新狀態，這樣未來可以更容易地追蹤狀態變更
export function setState(newState) {
    if (newState.employees) employees = newState.employees;
    if (newState.shifts) shifts = newState.shifts;
    if (newState.punchRecords) punchRecords = newState.punchRecords;
    if (newState.bellSchedules) bellSchedules = newState.bellSchedules;
    if (newState.customSounds) customSounds = newState.customSounds;
    if (newState.bellHistory) bellHistory = newState.bellHistory;
    if (newState.specialEffects) specialEffects = newState.specialEffects;
    if (newState.themeSchedules) themeSchedules = newState.themeSchedules;
    if (newState.customThemes) customThemes = newState.customThemes;
    if (newState.automationTasks) automationTasks = newState.automationTasks;
    if (newState.automationLogs) automationLogs = newState.automationLogs;
    if (newState.adminPassword) adminPassword = newState.adminPassword;
    if (newState.systemPassword) systemPassword = newState.systemPassword;
    if (newState.punchInputTimeout !== undefined) punchInputTimeout = newState.punchInputTimeout;
    if (newState.reportViewTimeout !== undefined) reportViewTimeout = newState.reportViewTimeout;
    if (newState.manualSelectionTimeout !== undefined) manualSelectionTimeout = newState.manualSelectionTimeout;
    if (newState.reportTimerInterval !== undefined) reportTimerInterval = newState.reportTimerInterval;
    if (newState.bellAudioTimeout !== undefined) bellAudioTimeout = newState.bellAudioTimeout;
    if (newState.currentGreetingsType) currentGreetingsType = newState.currentGreetingsType;
    if (newState.currentPasswordChangeType) currentPasswordChangeType = newState.currentPasswordChangeType;
    if (newState.reportLoginIdentity !== undefined) reportLoginIdentity = newState.reportLoginIdentity;
    if (newState.confirmCallback !== undefined) confirmCallback = newState.confirmCallback;
    if (newState.editingBellId !== undefined) editingBellId = newState.editingBellId;
    if (newState.editingEffectId !== undefined) editingEffectId = newState.editingEffectId;
    if (newState.editingThemeScheduleId !== undefined) editingThemeScheduleId = newState.editingThemeScheduleId;
    if (newState.editingThemeId !== undefined) editingThemeId = newState.editingThemeId;
    if (newState.sortConfig) sortConfig = newState.sortConfig;
}
