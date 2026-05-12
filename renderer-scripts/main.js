/**
 * @file main.js
 * @description 總圖書館長 - 渲染行程的主入口
 * 負責初始化系統、載入資料、並設定所有事件監聽。
 */
import { ui } from './ui.js';
import * as state from './state.js';
import { setState } from './state.js';
import { dbRequest, getAppVersion } from './api.js';
import { updateClock } from './clock.js';
import { autoSelectShift } from './handlers/punchHandler.js';
import { loadShiftsToPanel, populateShiftSelectors, renderBellSchedulesInPanel } from './handlers/settingsHandler.js';
import { checkAndApplyThemeSchedule } from './handlers/themeHandler.js';
import { initializeEventListeners } from './event-listeners.js';
import { showToast } from './utils.js';

function normalizeBooleanSetting(value) {
    return value === true || value === 1 || value === '1' || value === 'true';
}

/**
 * ✨ 魔法新增：一個專門用來刷新城堡記憶的咒語 ✨
 * @param {'employees' | 'punchRecords' | 'shifts' | 'greetings' | 'bellSchedules' | 'customSounds' | 'bellHistory' | 'specialEffects' | 'themeSchedules' | 'customThemes' | 'displaySettings' | 'adminPassword' | 'automationTasks' | 'automationLog' | 'systemPassword' | 'automationExportDirectory' | 'externalApiSettings' | 'attendanceExportSettings' | 'all'} type - 要刷新的資料類型
 */
export async function refreshData(type) {
    console.log(`[記憶刷新咒] 正在刷新 ${type} 的資料...`);
    try {
        if (type === 'employees' || type === 'all') {
            const result = await dbRequest('loadEmployees');
            if (result.success) setState({ employees: result.data });
        }
        if (type === 'punchRecords' || type === 'all') {
            const result = await dbRequest('loadPunchRecords');
            if (result.success) setState({ punchRecords: result.data });
        }
        if (type === 'shifts' || type === 'all') {
            const result = await dbRequest('loadShifts');
            if (result.success) {
                setState({ shifts: result.data });
                populateShiftSelectors();
                loadShiftsToPanel();
            }
        }
        if (type === 'greetings' || type === 'all') {
            const result = await dbRequest('loadGreetings');
            if (result.success) setState({ greetings: result.data });
        }
        if (type === 'bellSchedules' || type === 'all') {
            const result = await dbRequest('loadBellSchedules');
            if (result.success) setState({ bellSchedules: result.data });
        }
        if (type === 'customSounds' || type === 'all') {
            const result = await dbRequest('loadCustomSounds');
            if (result.success) setState({ customSounds: result.data });
        }
        if (type === 'bellHistory' || type === 'all') {
            const result = await dbRequest('loadBellHistory');
            if (result.success) setState({ bellHistory: result.data });
        }
        if (type === 'specialEffects' || type === 'all') {
            const result = await dbRequest('loadSpecialEffects');
            if (result.success) setState({ specialEffects: result.data });
        }
        if (type === 'themeSchedules' || type === 'all') {
            const result = await dbRequest('loadThemeSchedules');
            if (result.success) setState({ themeSchedules: result.data });
        }
        if (type === 'customThemes' || type === 'all') {
            const result = await dbRequest('loadCustomThemes');
            if (result.success) setState({ customThemes: result.data });
        }
        if (type === 'displaySettings' || type === 'all') {
            const [mainTitleResult, subtitleResult] = await Promise.all([
                dbRequest('getSetting', 'mainTitle'),
                dbRequest('getSetting', 'subtitle')
            ]);
            if (mainTitleResult.success || subtitleResult.success) {
                const mainTitle = mainTitleResult.success ? (mainTitleResult.data || '震欣科技AI作息系統') : state.mainTitle;
                const subtitle = subtitleResult.success ? (subtitleResult.data || '您的 AI 智慧好夥伴') : state.subtitle;
                setState({ mainTitle, subtitle });
                ui.mainTitle.textContent = mainTitle;
                ui.subTitle.textContent = subtitle;
                if (ui.mainTitleInput) ui.mainTitleInput.value = mainTitle;
                if (ui.subTitleInput) ui.subTitleInput.value = subtitle;
            }
        }
        if (type === 'adminPassword' || type === 'all') {
            const result = await dbRequest('getSetting', 'adminPassword');
            if (result.success) setState({ adminPassword: result.data || 'TC5128' });
        }
        if (type === 'automationTasks' || type === 'all') {
            const result = await dbRequest('loadAutomationTasks');
            if (result.success) setState({ automationTasks: result.data });
        }
        if (type === 'automationLog' || type === 'all') {
            const result = await dbRequest('loadAutomationLog');
            if (result.success) setState({ automationLogs: result.data });
        }
        if (type === 'systemPassword' || type === 'all') {
            const result = await dbRequest('getSetting', 'systemPassword');
            if (result.success) setState({ systemPassword: result.data || '0000' });
        }
        if (type === 'automationExportDirectory' || type === 'all') {
            const result = await dbRequest('getSetting', 'automationExportDirectory');
            if (result.success) setState({ automationExportDirectory: result.data || '' });
        }
        if (type === 'externalApiSettings' || type === 'all') {
            const [enabledResult, keyResult] = await Promise.all([
                dbRequest('getSetting', 'externalApiEnabled'),
                dbRequest('getSetting', 'externalApiKey')
            ]);
            setState({
                externalApiEnabled: enabledResult.success ? normalizeBooleanSetting(enabledResult.data) : false,
                externalApiKey: keyResult.success ? (keyResult.data || '') : ''
            });
        }
        console.log(`[記憶刷新咒] ${type} 資料刷新完畢！`);
    } catch (error) {
        console.error(`刷新資料時發生錯誤 (${type}):`, error);
        showToast(`同步 ${type} 資料失敗`, 'error');
    }
}


/**
 * 初始化系統的核心咒語
 */
async function initializeSystem() {
    try {
        console.log("魔法系統開始初始化...");

        // ★ [10] 區塊開始: 修改初始化請求，增加讀取副標題
        // 一次性從資料庫喚醒所有記憶
        const results = await Promise.all([
            dbRequest('loadEmployees'),
            dbRequest('loadShifts'),
            dbRequest('loadPunchRecords'),
            dbRequest('loadBellSchedules'),
            dbRequest('loadCustomSounds'),
            dbRequest('loadBellHistory'),
            dbRequest('loadGreetings'),
            dbRequest('getSetting', 'adminPassword'),
            dbRequest('getSetting', 'systemPassword'),
            dbRequest('loadSpecialEffects'),
            dbRequest('loadThemeSchedules'),
            dbRequest('loadAutomationTasks'),
            dbRequest('loadAutomationLog'),
            dbRequest('loadCustomThemes'),
            dbRequest('getSetting', 'mainTitle'),
            dbRequest('getSetting', 'subtitle'), // ★ [10-1] 新增讀取副標題的請求
            dbRequest('getSetting', 'automationExportDirectory'),
            dbRequest('getSetting', 'externalApiEnabled'),
            dbRequest('getSetting', 'externalApiKey'),
        ]);

        // 將記憶注入記憶水晶
        setState({
            employees: results[0].data || [],
            shifts: results[1].data || [],
            punchRecords: results[2].data || [],
            bellSchedules: results[3].data || [],
            customSounds: results[4].data || [],
            bellHistory: results[5].data || [],
            greetings: results[6].data || [],
            adminPassword: results[7].data || 'TC5128',
            systemPassword: results[8].data || '0000',
            specialEffects: results[9].data || [],
            themeSchedules: results[10].data || [],
            automationTasks: results[11].data || [],
            automationLogs: results[12].data || [],
            customThemes: results[13].data || [],
            mainTitle: results[14].data || '震欣科技AI作息系統',
            subtitle: results[15].data || '您的 AI 智慧好夥伴', // ★ [10-2] 設定副標題的初始狀態
            automationExportDirectory: results[16].data || '',
            externalApiEnabled: normalizeBooleanSetting(results[17].data),
            externalApiKey: results[18].data || '',
        });
        // ★ [10] 區塊結束

        // 檢查並淨化舊的資料格式
        await sanitizeOldData();
        
        // 建立所有魔法契約
        initializeEventListeners();
        
        // 啟動城堡的日常運作
        startSystemRoutines();

        console.log("魔法系統初始化成功！所有裝置都已就位！");
    } catch (error) {
        console.error("初始化過程中發生嚴重錯誤:", error);
        showToast(`系統初始化失敗: ${error.message}`, 'error');
    }
}

/**
 * 檢查並修正舊資料格式的咒語
 */
async function sanitizeOldData() {
    let wasSanitized = false;
    const newEmployees = state.employees.map(emp => {
        const newEmp = { ...emp };
        for (const key in newEmp) {
            if (typeof newEmp[key] === 'string') {
                const originalValue = newEmp[key];
                const sanitizedValue = originalValue.trim().replace(/^"|"$/g, '');
                if (originalValue !== sanitizedValue) {
                    newEmp[key] = sanitizedValue;
                    wasSanitized = true;
                }
            }
        }
        return newEmp;
    });

    if (wasSanitized) {
        console.log('[淨化聖光] 偵測到需要淨化的舊資料，正在施法...');
        await dbRequest('saveEmployees', newEmployees);
        setState({ employees: newEmployees });
        showToast('已自動修正舊的人員資料格式。', 'info');
    }
}

/**
 * 啟動系統的日常循環魔法
 */
async function startSystemRoutines() {
    // 啟動時間魔法
    updateClock();
    setInterval(updateClock, 1000);

    // 準備班別相關設定
    populateShiftSelectors();
    loadShiftsToPanel();
    setInterval(autoSelectShift, 30000);

    // 準備響鈴排程顯示
    renderBellSchedulesInPanel();
    
    // 檢查並應用當前主題
    checkAndApplyThemeSchedule();
    setInterval(checkAndApplyThemeSchedule, 60 * 1000);

    // 設定手動補登的預設日期時間
    const today = new Date();
    if(ui.manualDate) ui.manualDate.value = today.toISOString().substring(0, 10);
    if(ui.manualTime) ui.manualTime.value = today.toTimeString().substring(0, 8);

    // ★ [11] 區塊開始: 設定主標題、副標題與版本號
    if (ui.mainTitle) ui.mainTitle.textContent = state.mainTitle;
    if (ui.mainTitleInput) ui.mainTitleInput.value = state.mainTitle;
    if (ui.subTitle) ui.subTitle.textContent = state.subtitle;
    if (ui.subTitleInput) ui.subTitleInput.value = state.subtitle;
    const version = await getAppVersion();
    if (ui.appVersion) ui.appVersion.textContent = `Version: ${version}`;
    // ★ [11] 區塊結束
}


// --- 城堡甦醒的儀式 ---
// 當大廳的結構都準備好時，就開始初始化
document.addEventListener('DOMContentLoaded', initializeSystem);
