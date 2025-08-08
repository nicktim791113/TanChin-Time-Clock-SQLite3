/**
 * @file themeHandler.js
 * @description 主題與幻境魔法 - 處理所有與主題、特效相關的邏輯 (已修正)
 */
import { ui } from '../ui.js';
import * as state from '../state.js';
import { setState } from '../state.js';
import { dbRequest } from '../api.js';
import { showToast } from '../utils.js';
import { showModal, hideModal, showConfirm } from './modalHandler.js';

// --- 節日特效相關 ---

/**
 * 處理特效列表中的所有操作 (編輯、刪除、啟用/停用)
 * @param {Event} event - 點擊事件
 */
export async function handleSpecialEffectAction(event) {
    const target = event.target;
    const effectId = target.closest('[data-id]')?.dataset.id;
    if (!effectId) return;

    const effect = state.specialEffects.find(e => e.id === effectId);
    if (!effect) return;

    if (target.classList.contains('edit-effect-btn')) {
        // 填充表單以供編輯
        setState({ editingEffectId: effectId });
        const modal = ui.modals.specialEffects;
        modal.querySelector('#effect-form-title').textContent = '編輯特效排程';
        modal.querySelector('#effect-name-input').value = effect.name;
        modal.querySelector('#effect-prefix-input').value = effect.prefix;
        modal.querySelector('#effect-suffix-input').value = effect.suffix;
        modal.querySelector('#effect-start-date-input').value = effect.start_date;
        modal.querySelector('#effect-end-date-input').value = effect.end_date;
        modal.querySelector('#cancel-effect-edit-btn').classList.remove('hidden');
    } else if (target.classList.contains('delete-effect-btn')) {
        // 刪除特效
        showConfirm('刪除特效', `您確定要刪除特效 "${effect.name}" 嗎？`, async () => {
            const updatedEffects = state.specialEffects.filter(e => e.id !== effectId);
            await dbRequest('saveSpecialEffects', updatedEffects);
            setState({ specialEffects: updatedEffects });
            renderSpecialEffects();
            showToast('特效已刪除！', 'success');
            hideModal('confirm-modal');
        });
    } else if (target.classList.contains('toggle-effect-enabled')) {
        // 切換啟用狀態
        effect.enabled = target.checked;
        await dbRequest('saveSpecialEffects', state.specialEffects);
        showToast(`特效 "${effect.name}" 已${effect.enabled ? '啟用' : '停用'}`, 'info');
    }
}


export function renderSpecialEffects() {
    const list = ui.modals.specialEffects.querySelector('#special-effects-list');
    list.innerHTML = '';
    if (state.specialEffects.length === 0) {
        list.innerHTML = `<p class="text-gray-400 text-center p-4">尚無特效排程</p>`;
        return;
    }
    state.specialEffects.forEach(effect => {
        const div = document.createElement('div');
        div.className = 'p-3 bg-gray-50 rounded-lg border flex items-center justify-between';
        div.dataset.id = effect.id;
        div.innerHTML = `
            <div class="flex items-center flex-grow">
                 <input type="checkbox" class="toggle-effect-enabled w-5 h-5 mr-4 accent-pink-500 flex-shrink-0" ${effect.enabled ? 'checked' : ''}>
                <div class="flex-grow">
                    <p class="font-bold text-gray-800">${effect.name}</p>
                    <p class="text-sm text-gray-600">${effect.start_date} ~ ${effect.end_date}</p>
                    <p class="text-sm text-gray-500">效果: ${effect.prefix} ... ${effect.suffix}</p>
                </div>
            </div>
            <div class="space-x-2 flex-shrink-0">
                <button class="text-blue-600 hover:underline edit-effect-btn">編輯</button>
                <button class="text-red-600 hover:underline delete-effect-btn">刪除</button>
            </div>
        `;
        list.appendChild(div);
    });
}

export function resetEffectForm() {
    setState({ editingEffectId: null });
    const modal = ui.modals.specialEffects;
    modal.querySelector('#effect-form-title').textContent = '新增特效排程';
    modal.querySelector('#effect-name-input').value = '';
    modal.querySelector('#effect-prefix-input').value = '';
    modal.querySelector('#effect-suffix-input').value = '';
    modal.querySelector('#effect-start-date-input').value = '';
    modal.querySelector('#effect-end-date-input').value = '';
    modal.querySelector('#cancel-effect-edit-btn').classList.add('hidden');
}

export async function saveSpecialEffect() {
    const modal = ui.modals.specialEffects;
    const effectData = {
        id: state.editingEffectId || `effect_${Date.now()}`,
        name: modal.querySelector('#effect-name-input').value.trim(),
        prefix: modal.querySelector('#effect-prefix-input').value.trim(),
        suffix: modal.querySelector('#effect-suffix-input').value.trim(),
        start_date: modal.querySelector('#effect-start-date-input').value,
        end_date: modal.querySelector('#effect-end-date-input').value,
        enabled: state.editingEffectId ? state.specialEffects.find(e => e.id === state.editingEffectId).enabled : true
    };

    if (!effectData.name || !effectData.start_date || !effectData.end_date) {
        showToast('特效名稱與起訖日期為必填！', 'error');
        return;
    }

    let updatedEffects = [...state.specialEffects];
    if (state.editingEffectId) {
        const index = updatedEffects.findIndex(e => e.id === state.editingEffectId);
        updatedEffects[index] = effectData;
    } else {
        updatedEffects.push(effectData);
    }

    const result = await dbRequest('saveSpecialEffects', updatedEffects);
    if (result.success) {
        setState({ specialEffects: updatedEffects });
        showToast('特效排程已儲存！', 'success');
        renderSpecialEffects();
        resetEffectForm();
    } else {
        showToast(`儲存失敗: ${result.error}`, 'error');
    }
}


// --- 主題排程相關 ---

/**
 * ✨ 新增的魔法：處理主題排程列表中的所有操作 (編輯、刪除、啟用/停用)
 * @param {Event} event - 點擊事件
 */
export async function handleThemeScheduleAction(event) {
    const target = event.target;
    const scheduleId = target.closest('[data-id]')?.dataset.id;
    if (!scheduleId) return;

    const schedule = state.themeSchedules.find(s => s.id === scheduleId);
    if (!schedule) return;

    if (target.classList.contains('edit-theme-btn')) {
        // 填充表單以供編輯
        setState({ editingThemeScheduleId: scheduleId });
        const modal = ui.modals.themeSchedule;
        modal.querySelector('#theme-form-title').textContent = '編輯主題排程';
        modal.querySelector('#theme-name-input').value = schedule.name;
        modal.querySelector('#theme-select-input').value = schedule.theme_name;
        modal.querySelector('#theme-start-date-input').value = schedule.start_date;
        modal.querySelector('#theme-end-date-input').value = schedule.end_date;
        modal.querySelector('#cancel-theme-edit-btn').classList.remove('hidden');
    } else if (target.classList.contains('delete-theme-btn')) {
        // 刪除排程
        showConfirm('刪除排程', `您確定要刪除排程 "${schedule.name}" 嗎？`, async () => {
            const updatedSchedules = state.themeSchedules.filter(s => s.id !== scheduleId);
            await dbRequest('saveThemeSchedules', updatedSchedules);
            setState({ themeSchedules: updatedSchedules });
            renderThemeSchedules();
            checkAndApplyThemeSchedule();
            showToast('排程已刪除！', 'success');
            hideModal('confirm-modal');
        });
    } else if (target.classList.contains('toggle-theme-enabled')) {
        // 切換啟用狀態
        schedule.enabled = target.checked;
        await dbRequest('saveThemeSchedules', state.themeSchedules);
        checkAndApplyThemeSchedule();
        showToast(`排程 "${schedule.name}" 已${schedule.enabled ? '啟用' : '停用'}`, 'info');
    }
}

export function renderThemeSchedules() {
    const list = ui.modals.themeSchedule.querySelector('#theme-schedules-list');
    const themeDisplayNames = { 'default': '預設主題' };
    state.customThemes.forEach(t => themeDisplayNames[t.id] = t.name);

    list.innerHTML = '';
    if (state.themeSchedules.length === 0) {
        list.innerHTML = `<p class="text-gray-400 text-center p-4">尚無主題排程</p>`;
        return;
    }
    state.themeSchedules.forEach(schedule => {
        const div = document.createElement('div');
        div.className = 'p-3 bg-gray-50 rounded-lg border flex items-center justify-between';
        div.dataset.id = schedule.id; // 為父元素添加ID，方便事件捕捉
        div.innerHTML = `
            <div class="flex items-center flex-grow">
                 <input type="checkbox" class="toggle-theme-enabled w-5 h-5 mr-4 accent-indigo-500 flex-shrink-0" ${schedule.enabled ? 'checked' : ''}>
                <div class="flex-grow">
                    <p class="font-bold text-gray-800">${schedule.name}</p>
                    <p class="text-sm text-gray-600">${schedule.start_date} ~ ${schedule.end_date}</p>
                    <p class="text-sm text-gray-500">主題: ${themeDisplayNames[schedule.theme_name] || '未知'}</p>
                </div>
            </div>
            <div class="space-x-2 flex-shrink-0">
                <button class="text-blue-600 hover:underline edit-theme-btn">編輯</button>
                <button class="text-red-600 hover:underline delete-theme-btn">刪除</button>
            </div>
        `;
        list.appendChild(div);
    });
}

export function resetThemeScheduleForm() {
    setState({ editingThemeScheduleId: null });
    const modal = ui.modals.themeSchedule;
    modal.querySelector('#theme-form-title').textContent = '新增主題排程';
    modal.querySelector('#theme-name-input').value = '';
    modal.querySelector('#theme-select-input').value = 'default';
    modal.querySelector('#theme-start-date-input').value = '';
    modal.querySelector('#theme-end-date-input').value = '';
    modal.querySelector('#cancel-theme-edit-btn').classList.add('hidden');
}

export async function saveThemeSchedule() {
    const modal = ui.modals.themeSchedule;
    const scheduleData = {
        id: state.editingThemeScheduleId || `theme_schedule_${Date.now()}`,
        name: modal.querySelector('#theme-name-input').value.trim(),
        theme_name: modal.querySelector('#theme-select-input').value,
        start_date: modal.querySelector('#theme-start-date-input').value,
        end_date: modal.querySelector('#theme-end-date-input').value,
        enabled: state.editingThemeScheduleId ? state.themeSchedules.find(s => s.id === state.editingThemeScheduleId).enabled : true
    };

    if (!scheduleData.name || !scheduleData.start_date || !scheduleData.end_date) {
        showToast('排程名稱與起訖日期為必填！', 'error');
        return;
    }

    let updatedSchedules = [...state.themeSchedules];
    if (state.editingThemeScheduleId) {
        const index = updatedSchedules.findIndex(s => s.id === state.editingThemeScheduleId);
        updatedSchedules[index] = scheduleData;
    } else {
        updatedSchedules.push(scheduleData);
    }

    const result = await dbRequest('saveThemeSchedules', updatedSchedules);
    if (result.success) {
        setState({ themeSchedules: updatedSchedules });
        showToast('主題排程已儲存！', 'success');
        renderThemeSchedules();
        resetThemeScheduleForm();
        checkAndApplyThemeSchedule();
    } else {
        showToast(`儲存失敗: ${result.error}`, 'error');
    }
}


// --- 主題編輯器相關 ---

export function openThemeEditor() {
    resetThemeEditor();
    populateThemeEditorLoadSelector();
    showModal('theme-editor-modal');
}

export function resetThemeEditor() {
    setState({ editingThemeId: null });
    const editor = ui.themeEditor;
    editor.name.value = '';
    editor.bgStart.value = '#dfe9f3';
    editor.bgEnd.value = '#ffffff';
    editor.mainTitleColor.value = '#1f2937';
    editor.btnAdminBg.value = '#8b5cf6';
    editor.btnAdminText.value = '#ffffff';
    editor.btnReportBg.value = '#10b981';
    editor.btnReportText.value = '#ffffff';
    editor.btnAiBg.value = '#3b82f6';
    editor.btnAiText.value = '#ffffff';
    editor.clockBg.value = '#374151';
    editor.clockText.value = '#ffffff';
    // ✨ 魔法修正：移除風格設計 ✨
    // editor.clockDecoLeft.value = '';
    // editor.clockDecoRight.value = '';
    editor.clockSymbolsLeft.value = '';
    editor.clockSymbolsRight.value = '';
    editor.blinkEnabled.checked = false;
    editor.blinkColor.value = '#fbc02d';
    editor.punchEffect.value = 'none';
    editor.punchEmojis.value = '✨,🎉,💖';
    
    // ✨ 魔法新增：重設背景圖片按鈕 ✨
    const selectBtn = document.getElementById('theme-editor-select-bg-image-btn');
    if (selectBtn) {
        selectBtn.textContent = '選擇圖片...';
        delete selectBtn.dataset.path;
    }
    
    updateThemeEditorPreview();
}

function getThemeEditorStyles() {
    const editor = ui.themeEditor;
    return {
        bgStart: editor.bgStart.value,
        bgEnd: editor.bgEnd.value,
        mainTitleColor: editor.mainTitleColor.value,
        btnAdminBg: editor.btnAdminBg.value,
        btnAdminText: editor.btnAdminText.value,
        btnReportBg: editor.btnReportBg.value,
        btnReportText: editor.btnReportText.value,
        btnAiBg: editor.btnAiBg.value,
        btnAiText: editor.btnAiText.value,
        clockBg: editor.clockBg.value,
        clockText: editor.clockText.value,
        // ✨ 魔法新增：取得背景圖片路徑 ✨
        clockBgImage: document.getElementById('theme-editor-select-bg-image-btn').dataset.path || '',
        clockSymbolsLeft: editor.clockSymbolsLeft.value,
        clockSymbolsRight: editor.clockSymbolsRight.value,
        blinkEnabled: editor.blinkEnabled.checked,
        blinkColor: editor.blinkColor.value,
        punchEffect: editor.punchEffect.value,
        punchEmojis: editor.punchEmojis.value,
    };
}

export function updateThemeEditorPreview() {
    const styles = getThemeEditorStyles();
    const previewContainer = ui.themeEditor.preview;
    
    if (!previewContainer.querySelector('#preview-magic-container')) {
        previewContainer.innerHTML = `
            <div class="magic-container w-full p-6 rounded-2xl" id="preview-magic-container">
                <header class="text-center mb-6">
                    <h1 id="preview-main-title" class="text-3xl font-bold">震欣科技AI作息系統</h1>
                    <div id="preview-clock-panel" class="bg-gray-800 text-white rounded-lg p-4 mt-4 text-center shadow-inner relative">
                        <!-- ✨ 魔法修正：移除舊的 decoration 容器 ✨ -->
                        <p id="preview-current-date" class="text-lg">2025年7月26日 星期六 農曆六月初二</p>
                        <p id="preview-current-time" class="text-5xl font-mono font-bold tracking-wider">下午 06:15:02</p>
                        <div id="preview-clock-symbols" class="absolute top-0 left-0 w-full h-full pointer-events-none flex justify-between items-center px-4 text-3xl opacity-80"></div>
                    </div>
                </header>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                    <button id="preview-btn-admin" class="btn-magic font-bold py-3 px-6">管理者設定</button>
                    <button id="preview-btn-report" class="btn-magic font-bold py-3 px-6">考勤報表</button>
                    <button id="preview-btn-ai" class="btn-magic font-bold py-3 px-6">AI系統控制</button>
                </div>
            </div>
        `;
    }

    const preview = {
        container: document.getElementById('preview-magic-container'),
        mainTitle: document.getElementById('preview-main-title'),
        clockPanel: document.getElementById('preview-clock-panel'),
        clockDate: document.getElementById('preview-current-date'),
        clockTime: document.getElementById('preview-current-time'),
        clockSymbols: document.getElementById('preview-clock-symbols'),
        btnAdmin: document.getElementById('preview-btn-admin'),
        btnReport: document.getElementById('preview-btn-report'),
        btnAi: document.getElementById('preview-btn-ai'),
    };

    preview.container.style.backgroundImage = `linear-gradient(to top, ${styles.bgStart} 0%, ${styles.bgEnd} 100%)`;
    preview.mainTitle.style.color = styles.mainTitleColor;
    preview.btnAdmin.style.backgroundColor = styles.btnAdminBg;
    preview.btnAdmin.style.color = styles.btnAdminText;
    preview.btnReport.style.backgroundColor = styles.btnReportBg;
    preview.btnReport.style.color = styles.btnReportText;
    preview.btnAi.style.backgroundColor = styles.btnAiBg;
    preview.btnAi.style.color = styles.btnAiText;
    
    // ✨ 魔法新增：處理時鐘面板背景 ✨
    if (styles.clockBgImage) {
        preview.clockPanel.style.backgroundImage = `url('${styles.clockBgImage}')`;
        preview.clockPanel.style.backgroundSize = 'cover';
        preview.clockPanel.style.backgroundPosition = 'center';
    } else {
        preview.clockPanel.style.backgroundImage = 'none';
        preview.clockPanel.style.backgroundColor = styles.clockBg;
    }
    preview.clockPanel.style.border = 'none';

    preview.clockDate.style.color = styles.clockText;
    preview.clockTime.style.color = styles.clockText;
    preview.clockSymbols.innerHTML = `<span>${styles.clockSymbolsLeft || ''}</span><span>${styles.clockSymbolsRight || ''}</span>`;
    
    preview.clockPanel.classList.toggle('blinking-border', styles.blinkEnabled);
    preview.clockPanel.style.setProperty('--blink-color', styles.blinkColor);
}


/**
 * 儲存自訂主題的魔法
 * 修正了內建主題的處理方式，並防止名稱重複
 */
export async function saveCustomTheme() {
    const name = ui.themeEditor.name.value.trim();
    if (!name) {
        showToast('請為您的主題命名！', 'error');
        return;
    }

    const isBuiltInName = ['預設主題'].includes(name);
    if (isBuiltInName && !state.editingThemeId) {
        showToast(`不能使用預設主題名稱 ("${name}") 儲存。請為您的新主題取一個獨一無二的名字！`, 'error');
        return;
    }

    const styles = getThemeEditorStyles();
    let newThemeId = state.editingThemeId;
    let updatedThemes = [...state.customThemes];

    if (state.editingThemeId) {
        const index = updatedThemes.findIndex(t => t.id === state.editingThemeId);
        if (index > -1) {
            const existingThemeWithName = updatedThemes.find(t => t.name === name && t.id !== state.editingThemeId);
            if (existingThemeWithName) {
                showToast(`名稱 "${name}" 已被另一個主題使用！`, 'error');
                return;
            }
            updatedThemes[index] = { ...updatedThemes[index], name, styles };
            showToast(`主題 "${name}" 已更新！`, 'success');
        }
    } else {
        const existingThemeWithName = updatedThemes.find(t => t.name === name);
        if (existingThemeWithName) {
            showToast(`名稱 "${name}" 已存在，請使用不同名稱。`, 'error');
            return;
        }

        newThemeId = `custom_${Date.now()}`;
        updatedThemes.push({ id: newThemeId, name, styles });
        showToast(`新主題 "${name}" 已儲存！`, 'success');
    }

    const result = await dbRequest('saveCustomThemes', updatedThemes);
    if (result.success) {
        setState({ customThemes: updatedThemes, editingThemeId: newThemeId });
        populateThemeEditorLoadSelector();
        populateThemeScheduleSelector();
        ui.themeEditor.loadSelect.value = newThemeId;
    } else {
        showToast(`儲存失敗: ${result.error}`, 'error');
    }
}

export function populateThemeEditorLoadSelector() {
    const select = ui.themeEditor.loadSelect;
    // ✨ 魔法修正：移除聖誕與春節主題選項 ✨
    select.innerHTML = `
        <option value="">從一個新的主題開始...</option>
        <option value="default">預設主題</option>
    `;
    state.customThemes.forEach(theme => {
        const option = new Option(theme.name, theme.id);
        select.add(option);
    });
    select.value = state.editingThemeId || "";
}

/**
 * 讀取一個主題到編輯器中
 * 修正了讀取內建主題時的行為
 * @param {string} themeId - 要讀取的主題ID或關鍵字
 */
export function loadThemeForEditing(themeId) {
    if (!themeId) {
        resetThemeEditor();
        return;
    }
    
    let themeToLoad = {};
    let themeName = '';
    let newEditingThemeId = null; 

    if (themeId === 'default') {
        themeToLoad = {}; 
        themeName = '預設主題'; 
    // ✨ 魔法修正：移除聖誕與春節主題的讀取邏輯 ✨
    } else {
        // 讀取自訂主題
        const theme = state.customThemes.find(t => t.id === themeId);
        if (!theme) return;
        themeToLoad = theme.styles;
        themeName = theme.name;
        newEditingThemeId = theme.id;
    }
    
    resetThemeEditor();
    setState({ editingThemeId: newEditingThemeId });
    ui.themeEditor.name.value = themeName;
    
    // 將主題樣式填充到表單中
    Object.keys(themeToLoad).forEach(key => {
        const mapping = {
            bgStart: 'theme-editor-bg-start', bgEnd: 'theme-editor-bg-end', mainTitleColor: 'theme-editor-main-title-color',
            btnAdminBg: 'theme-editor-btn-admin-bg', btnAdminText: 'theme-editor-btn-admin-text',
            btnReportBg: 'theme-editor-btn-report-bg', btnReportText: 'theme-editor-btn-report-text',
            btnAiBg: 'theme-editor-btn-ai-bg', btnAiText: 'theme-editor-btn-ai-text',
            clockBg: 'theme-editor-clock-bg', clockText: 'theme-editor-clock-text',
            clockBgImage: 'theme-editor-select-bg-image-btn', // ✨ 魔法新增：對應到按鈕
            clockSymbolsLeft: 'theme-editor-clock-symbols-left', clockSymbolsRight: 'theme-editor-clock-symbols-right',
            blinkEnabled: 'theme-editor-blink-enabled', blinkColor: 'theme-editor-blink-color',
            punchEffect: 'theme-editor-punch-effect', punchEmojis: 'theme-editor-punch-emojis',
        };
        const elem = document.getElementById(mapping[key]);
        if (elem) {
            if(elem.type === 'checkbox') {
                elem.checked = themeToLoad[key];
            } else if (key === 'clockBgImage') { // ✨ 魔法新增：特殊處理圖片按鈕
                if (themeToLoad[key]) {
                    elem.dataset.path = themeToLoad[key];
                    elem.textContent = themeToLoad[key].split('/').pop();
                }
            } else {
                elem.value = themeToLoad[key];
            }
        }
    });

    updateThemeEditorPreview();
}

export async function deleteCustomTheme() {
    if (!state.editingThemeId) {
        showToast('請先從下拉選單選擇一個您自訂的主題來刪除。', 'info');
        return;
    }

    const themeToDelete = state.customThemes.find(t => t.id === state.editingThemeId);
    if (!themeToDelete) {
         showToast('找不到要刪除的主題。', 'error');
         return;
    }

    showConfirm('刪除主題', `您確定要刪除主題 "${themeToDelete.name}" 嗎？`, async () => {
        const updatedThemes = state.customThemes.filter(t => t.id !== state.editingThemeId);
        await dbRequest('saveCustomThemes', updatedThemes);
        setState({ customThemes: updatedThemes });
        showToast('主題已刪除！', 'success');
        resetThemeEditor();
        populateThemeEditorLoadSelector();
        populateThemeScheduleSelector();
        hideModal('confirm-modal');
    });
}


// --- 主題應用 ---

function applyCustomTheme(styles) {
    let css = `
        body { 
            background-image: linear-gradient(to top, ${styles.bgStart} 0%, ${styles.bgEnd} 100%) !important;
        }
        #main-title { color: ${styles.mainTitleColor || '#1f2937'} !important; }
        #toggle-panel-btn { background-color: ${styles.btnAdminBg || '#8b5cf6'} !important; color: ${styles.btnAdminText || '#ffffff'} !important; }
        #toggle-report-btn { background-color: ${styles.btnReportBg || '#10b981'} !important; color: ${styles.btnReportText || '#ffffff'} !important; }
        #open-automation-btn { background-color: ${styles.btnAiBg || '#3b82f6'} !important; color: ${styles.btnAiText || '#ffffff'} !important; }
        #clock-panel {
            background-color: ${styles.clockBg || '#1f2937'} !important;
            /* ✨ 魔法新增：應用背景圖片 ✨ */
            background-image: ${styles.clockBgImage ? `url('${styles.clockBgImage.replace(/\\/g, '/')}')` : 'none'} !important;
            background-size: cover !important;
            background-position: center !important;
            border: none !important;
        }
        #clock-panel p { color: ${styles.clockText || '#ffffff'} !important; }
    `;
    ui.dynamicThemeStyles.innerHTML = css;
    
    ui.clockPanel.classList.toggle('blinking-border', styles.blinkEnabled);
    ui.clockPanel.style.setProperty('--blink-color', styles.blinkColor || '#fbc02d');

    ui.clockSymbolsContainer.innerHTML = `<span>${styles.clockSymbolsLeft || ''}</span><span>${styles.clockSymbolsRight || ''}</span>`;
    
    // ✨ 魔法修正：移除風格設計的應用 ✨
    ui.clockDecorationContainer.innerHTML = '';
}

export function populateThemeScheduleSelector() {
    const select = ui.modals.themeSchedule.querySelector('#theme-select-input');
    // ✨ 魔法修正：移除聖誕與春節主題選項 ✨
    select.innerHTML = `
        <option value="default">預設主題</option>
    `;
    state.customThemes.forEach(theme => {
        const option = new Option(theme.name, theme.id);
        select.add(option);
    });
}

export function checkAndApplyThemeSchedule() {
    const today = new Date().toISOString().slice(0, 10);
    const activeSchedule = state.themeSchedules.find(s => s.enabled && today >= s.start_date && today <= s.end_date);
    
    let themeToApply = 'default';
    if (activeSchedule) {
        themeToApply = activeSchedule.theme_name;
    }
    
    // 清理舊樣式
    document.body.className = 'flex items-center justify-center min-h-screen p-4';
    ui.clockPanel.className = 'bg-gray-800 text-white rounded-lg p-4 mt-4 text-center shadow-inner transition-all duration-500 relative';
    ui.dynamicThemeStyles.innerHTML = '';
    ui.clockPanel.classList.remove('blinking-border');
    ui.clockDecorationContainer.innerHTML = '';
    ui.clockSymbolsContainer.innerHTML = '';

    // 應用新樣式
    if (themeToApply === 'default') {
        // 預設樣式，不做事
    // ✨ 魔法修正：移除聖誕與春節主題的直接應用 ✨
    } else {
        const customTheme = state.customThemes.find(t => t.id === themeToApply);
        if (customTheme) {
            applyCustomTheme(customTheme.styles);
        }
    }
}

export function triggerPunchEffect() {
    const today = new Date().toISOString().slice(0, 10);
    const activeSchedule = state.themeSchedules.find(s => s.enabled && today >= s.start_date && today <= s.end_date);
    let activeThemeId = activeSchedule ? activeSchedule.theme_name : 'default';

    let effect, emojis;
    if (activeThemeId.startsWith('custom_')) {
        const theme = state.customThemes.find(t => t.id === activeThemeId);
        if (theme) {
            effect = theme.styles.punchEffect;
            emojis = theme.styles.punchEmojis;
        }
    // ✨ 魔法修正：移除聖誕與春節主題的特效判斷 ✨
    }

    if (effect === 'emoji') startFallingEffect(emojis, 30);
}

function startFallingEffect(content, count) {
    const container = ui.punchEffectContainer;
    if (!content) return;
    const elements = content.split(',').map(s => s.trim()).filter(Boolean);
    if (elements.length === 0) return;

    for (let i = 0; i < count; i++) {
        const el = document.createElement('div');
        el.className = 'falling-element';
        el.textContent = elements[Math.floor(Math.random() * elements.length)];
        el.style.left = `${Math.random() * 100}vw`;
        el.style.fontSize = `${Math.random() * 1.5 + 0.75}rem`;
        el.style.animationDuration = `${Math.random() * 3 + 4}s`;
        el.style.animationDelay = `${Math.random() * 2}s`;
        container.appendChild(el);
        setTimeout(() => el.remove(), 7000);
    }
}
