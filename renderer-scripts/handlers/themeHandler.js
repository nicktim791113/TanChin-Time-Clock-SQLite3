/**
 * @file themeHandler.js
 * @description 主題與幻境魔法 - 處理所有與主題、特效相關的邏輯 (已修正預覽圖片範圍與背景色一致性)
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

export async function handleThemeScheduleAction(event) {
    const target = event.target;
    const scheduleId = target.closest('[data-id]')?.dataset.id;
    if (!scheduleId) return;

    const schedule = state.themeSchedules.find(s => s.id === scheduleId);
    if (!schedule) return;

    if (target.classList.contains('edit-theme-btn')) {
        setState({ editingThemeScheduleId: scheduleId });
        const modal = ui.modals.themeSchedule;
        modal.querySelector('#theme-form-title').textContent = '編輯主題排程';
        modal.querySelector('#theme-name-input').value = schedule.name;
        modal.querySelector('#theme-select-input').value = schedule.theme_name;
        modal.querySelector('#theme-start-date-input').value = schedule.start_date;
        modal.querySelector('#theme-end-date-input').value = schedule.end_date;
        modal.querySelector('#cancel-theme-edit-btn').classList.remove('hidden');
    } else if (target.classList.contains('delete-theme-btn')) {
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
        div.dataset.id = schedule.id;
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
    editor.bgDayStart.value = '#dfe9f3';
    editor.bgDayEnd.value = '#ffffff';
    editor.bgNightStart.value = '#2c3e50';
    editor.bgNightEnd.value = '#4ca1af';
    editor.dayStartTime.value = '05:00';
    editor.nightStartTime.value = '17:00';
    editor.mainTitleColor.value = '#1f2937';
    editor.btnAdminBg.value = '#8b5cf6';
    editor.btnAdminText.value = '#ffffff';
    editor.btnReportBg.value = '#10b981';
    editor.btnReportText.value = '#ffffff';
    editor.btnAiBg.value = '#3b82f6';
    editor.btnAiText.value = '#ffffff';
    editor.clockBg.value = '#374151';
    editor.clockText.value = '#ffffff';
    editor.clockBgPos.value = 'center';
    editor.clockSymbolsLeft.value = '';
    editor.clockSymbolsRight.value = '';
    editor.blinkEnabled.checked = false;
    editor.blinkDayColor.value = '#fbc02d';
    editor.blinkNightColor.value = '#29d9ff';
    editor.punchEffect.value = 'none';
    editor.punchFallContent.value = '✨,🎉,💖';
    editor.punchFlashContent.value = 'OK';
    
    const selectBtn = document.getElementById('theme-editor-select-bg-image-btn');
    if (selectBtn) {
        selectBtn.textContent = '選擇圖片...';
        delete selectBtn.dataset.path;
    }
    
    if (editor.preview) {
        editor.preview.dataset.pageBgImage = '';
        editor.preview.dataset.titleBgImage = '';
    }

    if (editor.selectPageBgImageBtn) {
        editor.selectPageBgImageBtn.textContent = '選擇圖片...';
    }
    if (editor.selectTitleBgImageBtn) {
        editor.selectTitleBgImageBtn.textContent = '選擇圖片...';
    }

    updateThemeEditorPreview();
}

function getThemeEditorStyles() {
    const editor = ui.themeEditor;
    return {
        bgDayStart: editor.bgDayStart.value,
        bgDayEnd: editor.bgDayEnd.value,
        bgNightStart: editor.bgNightStart.value,
        bgNightEnd: editor.bgNightEnd.value,
        dayStartTime: editor.dayStartTime.value,
        nightStartTime: editor.nightStartTime.value,
        mainTitleColor: editor.mainTitleColor.value,
        btnAdminBg: editor.btnAdminBg.value,
        btnAdminText: editor.btnAdminText.value,
        btnReportBg: editor.btnReportBg.value,
        btnReportText: editor.btnReportText.value,
        btnAiBg: editor.btnAiBg.value,
        btnAiText: editor.btnAiText.value,
        clockBg: editor.clockBg.value,
        clockText: editor.clockText.value,
        pageBgImage: editor.preview?.dataset?.pageBgImage || '',
        titleBgImage: editor.preview?.dataset?.titleBgImage || '',
        clockBgImage: document.getElementById('theme-editor-select-bg-image-btn').dataset.path || '',
        clockBgPos: editor.clockBgPos.value,
        clockSymbolsLeft: editor.clockSymbolsLeft.value,
        clockSymbolsRight: editor.clockSymbolsRight.value,
        blinkEnabled: editor.blinkEnabled.checked,
        blinkDayColor: editor.blinkDayColor.value,
        blinkNightColor: editor.blinkNightColor.value,
        punchEffect: editor.punchEffect.value,
        punchFallContent: editor.punchFallContent.value,
        punchFlashContent: editor.punchFlashContent.value,
    };
}

/**
 * 更新主題編輯器的預覽畫面
 * ★ [修正]: 使用固定寬度 1024px + zoom: 0.5 來模擬主畫面的寬度與圖片裁切範圍，確保與實際效果一致。
 */
function hexToRgba(color, alpha) {
    const value = String(color || '').trim();
    const normalized = value.replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return value || 'transparent';
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildThemeBackgroundCss(startColor, endColor, imagePath) {
    if (!imagePath) {
        return {
            image: `linear-gradient(to top, ${startColor} 0%, ${endColor} 100%)`,
            size: 'cover',
            position: 'center',
            repeat: 'no-repeat'
        };
    }

    const formattedPath = imagePath.replace(/\\/g, '/');
    return {
        image: `linear-gradient(to top, ${hexToRgba(startColor, 0.84)} 0%, ${hexToRgba(endColor, 0.44)} 100%), url('${formattedPath}')`,
        size: 'cover, cover',
        position: 'center, center',
        repeat: 'no-repeat, no-repeat'
    };
}

function buildTitleBannerCss(imagePath) {
    if (!imagePath) {
        return {
            image: 'none',
            shadow: 'none'
        };
    }

    const formattedPath = imagePath.replace(/\\/g, '/');
    return {
        image: `linear-gradient(135deg, rgba(255, 255, 255, 0.26) 0%, rgba(255, 255, 255, 0.08) 100%), url('${formattedPath}')`,
        shadow: '0 18px 38px rgba(15, 23, 42, 0.18)'
    };
}

export function updateThemeEditorPreview() {
    const styles = getThemeEditorStyles();
    const previewContainer = ui.themeEditor.preview;
    
    // ★ [重建結構] 使用 1024px 寬度容器配合 zoom 縮小 ★
    if (!previewContainer.querySelector('#preview-magic-container')) {
        previewContainer.innerHTML = `
            <div style="width: 1024px; zoom: 0.5; transform-origin: top left;"> 
                <div id="preview-page-shell" class="min-h-screen flex items-center justify-center p-4">
                    <div class="magic-container w-full p-8 rounded-2xl" id="preview-magic-container">
                    <header class="text-center mb-6">
                        <div id="preview-title-banner" class="title-banner-shell">
                            <h1 id="preview-main-title" class="text-4xl font-bold text-gray-800">震欣科技AI作息系統</h1>
                            <p id="preview-sub-title" class="text-xl text-gray-600 mt-1"></p>
                        </div>
                        <div id="preview-clock-panel" class="bg-gray-800 text-white rounded-lg p-4 mt-4 text-center shadow-inner relative">
                            <p id="preview-current-date" class="text-lg">2025年7月26日 星期六 農曆六月初二</p>
                            <p id="preview-current-time" class="text-5xl font-mono font-bold tracking-wider">下午 06:15:02</p>
                            <div id="preview-clock-symbols" class="absolute top-0 left-0 w-full h-full pointer-events-none flex justify-between items-center px-4 text-3xl opacity-80"></div>
                        </div>
                    </header>
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-2 text-left">感應或輸入卡號/密碼 (全域輸入)</label>
                        <input disabled class="w-full p-4 text-2xl text-center border border-gray-300 rounded-lg bg-white opacity-70" placeholder="...輸入區...">
                    </div>
                    <div class="grid grid-cols-2 gap-4 mb-6">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2 text-left">當前班別</label>
                            <div class="w-full p-3 text-lg border border-gray-300 rounded-lg bg-white h-14 opacity-70 flex items-center">早班 (08:00 - 17:00)</div>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2 text-left">打卡狀態</label>
                            <div class="w-full p-3 text-lg border border-gray-300 rounded-lg bg-white h-14 opacity-70 flex items-center">系統自動判斷</div>
                        </div>
                    </div>
                    <div class="message-box min-h-[60px] p-4 mb-6 rounded-lg text-center font-semibold text-4xl opacity-0"></div>
                    <div class="grid grid-cols-3 gap-4 text-center mb-6">
                        <button id="preview-btn-admin" class="btn-magic font-bold py-3 px-6">管理者設定</button>
                        <button id="preview-btn-report" class="btn-magic font-bold py-3 px-6">考勤報表</button>
                        <button id="preview-btn-ai" class="btn-magic font-bold py-3 px-6">AI系統控制</button>
                    </div>
                    </div>
                </div>
            </div>
        `;
    }

    const preview = {
        pageShell: document.getElementById('preview-page-shell'),
        container: document.getElementById('preview-magic-container'),
        titleBanner: document.getElementById('preview-title-banner'),
        mainTitle: document.getElementById('preview-main-title'),
        subTitle: document.getElementById('preview-sub-title'),
        clockPanel: document.getElementById('preview-clock-panel'),
        clockDate: document.getElementById('preview-current-date'),
        clockTime: document.getElementById('preview-current-time'),
        clockSymbols: document.getElementById('preview-clock-symbols'),
        btnAdmin: document.getElementById('preview-btn-admin'),
        btnReport: document.getElementById('preview-btn-report'),
        btnAi: document.getElementById('preview-btn-ai'),
    };

    const surfaceCss = buildThemeBackgroundCss(styles.bgDayStart, styles.bgDayEnd, styles.pageBgImage);
    const titleBannerCss = buildTitleBannerCss(styles.titleBgImage);

    preview.pageShell.style.backgroundImage = surfaceCss.image;
    preview.pageShell.style.backgroundSize = surfaceCss.size;
    preview.pageShell.style.backgroundPosition = surfaceCss.position;
    preview.pageShell.style.backgroundRepeat = surfaceCss.repeat;
    preview.container.style.backgroundImage = 'none';
    preview.titleBanner.style.backgroundImage = titleBannerCss.image;
    preview.titleBanner.style.boxShadow = titleBannerCss.shadow;
    preview.mainTitle.style.color = styles.mainTitleColor;
    preview.subTitle.textContent = state.subtitle || '您的 AI 智慧好夥伴';
    
    preview.btnAdmin.style.backgroundColor = styles.btnAdminBg;
    preview.btnAdmin.style.color = styles.btnAdminText;
    preview.btnReport.style.backgroundColor = styles.btnReportBg;
    preview.btnReport.style.color = styles.btnReportText;
    preview.btnAi.style.backgroundColor = styles.btnAiBg;
    preview.btnAi.style.color = styles.btnAiText;
    
    // ★ [修正] 確保背景顏色優先設定，解決透明圖背景色遺失問題
    preview.clockPanel.style.backgroundColor = styles.clockBg;

    if (styles.clockBgImage) {
        const formattedPath = styles.clockBgImage.replace(/\\/g, '/');
        preview.clockPanel.style.backgroundImage = `url('${formattedPath}')`;
        preview.clockPanel.style.backgroundSize = 'cover';
        preview.clockPanel.style.backgroundPosition = styles.clockBgPos;
    } else {
        preview.clockPanel.style.backgroundImage = 'none';
    }
    preview.clockPanel.style.border = 'none';

    preview.clockDate.style.color = styles.clockText;
    preview.clockTime.style.color = styles.clockText;
    preview.clockSymbols.innerHTML = `<span>${styles.clockSymbolsLeft || ''}</span><span>${styles.clockSymbolsRight || ''}</span>`;
    
    preview.clockPanel.classList.toggle('blinking-border', styles.blinkEnabled);
    preview.clockPanel.style.setProperty('--blink-color', styles.blinkDayColor);
}


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
 * ✨ 魔法修正施展處：這就是我為你重寫的咒語！✨
 * 這個咒語現在會明確地告訴魔法鏡，每一件飾品（主題設定）該放到哪個位置。
 * 尤其是那顆最特別的背景寶石（背景圖片），絕不會再忘記了！
 */
export function loadThemeForEditing(themeId) {
    if (!themeId) {
        resetThemeEditor();
        return;
    }
    
    let themeToLoadStyles = {};
    let themeName = '';
    let newEditingThemeId = null; 

    if (themeId === 'default') {
        themeName = '預設主題';
    } else {
        const theme = state.customThemes.find(t => t.id === themeId);
        if (!theme) return;
        themeToLoadStyles = theme.styles;
        themeName = theme.name;
        newEditingThemeId = theme.id;
    }
    
    resetThemeEditor();
    setState({ editingThemeId: newEditingThemeId });

    const editor = ui.themeEditor;
    const styles = themeToLoadStyles;

    if (editor.preview) {
        editor.preview.dataset.pageBgImage = styles.pageBgImage || '';
        editor.preview.dataset.titleBgImage = styles.titleBgImage || '';
    }

    // 明確地將主題樣式對應到UI元素上
    editor.name.value = themeName;
    editor.bgDayStart.value = styles.bgDayStart || '#dfe9f3';
    editor.bgDayEnd.value = styles.bgDayEnd || '#ffffff';
    editor.bgNightStart.value = styles.bgNightStart || '#2c3e50';
    editor.bgNightEnd.value = styles.bgNightEnd || '#4ca1af';
    editor.dayStartTime.value = styles.dayStartTime || '05:00';
    editor.nightStartTime.value = styles.nightStartTime || '17:00';
    editor.mainTitleColor.value = styles.mainTitleColor || '#1f2937';
    editor.btnAdminBg.value = styles.btnAdminBg || '#8b5cf6';
    editor.btnAdminText.value = styles.btnAdminText || '#ffffff';
    editor.btnReportBg.value = styles.btnReportBg || '#10b981';
    editor.btnReportText.value = styles.btnReportText || '#ffffff';
    editor.btnAiBg.value = styles.btnAiBg || '#3b82f6';
    editor.btnAiText.value = styles.btnAiText || '#ffffff';
    editor.clockBg.value = styles.clockBg || '#374151';
    editor.clockText.value = styles.clockText || '#ffffff';

    if (editor.selectPageBgImageBtn) {
        editor.selectPageBgImageBtn.textContent = styles.pageBgImage
            ? styles.pageBgImage.split(/[\\/]/).pop() || '選擇圖片...'
            : '選擇圖片...';
    }
    if (editor.selectTitleBgImageBtn) {
        editor.selectTitleBgImageBtn.textContent = styles.titleBgImage
            ? styles.titleBgImage.split(/[\\/]/).pop() || '選擇圖片...'
            : '選擇圖片...';
    }
    
    // 修正的核心：特別處理背景圖片
    if (styles.clockBgImage) {
        editor.selectBgImageBtn.dataset.path = styles.clockBgImage;
        editor.selectBgImageBtn.textContent = styles.clockBgImage.split(/[\\/]/).pop() || '選擇圖片...';
    } else {
        // 如果沒有圖片，也要確保UI是乾淨的
        delete editor.selectBgImageBtn.dataset.path;
        editor.selectBgImageBtn.textContent = '選擇圖片...';
    }

    editor.clockBgPos.value = styles.clockBgPos || 'center';
    editor.clockSymbolsLeft.value = styles.clockSymbolsLeft || '';
    editor.clockSymbolsRight.value = styles.clockSymbolsRight || '';
    editor.blinkEnabled.checked = styles.blinkEnabled || false;
    editor.blinkDayColor.value = styles.blinkDayColor || '#fbc02d';
    editor.blinkNightColor.value = styles.blinkNightColor || '#29d9ff';
    editor.punchEffect.value = styles.punchEffect || 'none';
    editor.punchFallContent.value = styles.punchFallContent || '✨,🎉,💖';
    editor.punchFlashContent.value = styles.punchFlashContent || 'OK';

    // 觸發 change 事件，確保依賴此選項的UI能正確更新
    editor.punchEffect.dispatchEvent(new Event('change'));

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
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    const dayStart = (styles.dayStartTime || "05:00").split(':').map(Number);
    const nightStart = (styles.nightStartTime || "17:00").split(':').map(Number);
    const dayStartMinutes = dayStart[0] * 60 + dayStart[1];
    const nightStartMinutes = nightStart[0] * 60 + nightStart[1];

    let period = 'night';
    if (dayStartMinutes < nightStartMinutes) { // 日夜不跨午夜
        if (currentTime >= dayStartMinutes && currentTime < nightStartMinutes) {
            period = 'day';
        }
    } else { // 夜晚時段跨午夜 (例如 17:00 ~ 05:00)
        if (currentTime < nightStartMinutes || currentTime >= dayStartMinutes) {
            period = 'day';
        }
    }

    const bgStart = period === 'day' ? styles.bgDayStart : styles.bgNightStart;
    const bgEnd = period === 'day' ? styles.bgDayEnd : styles.bgNightEnd;
    const blinkColor = period === 'day' ? styles.blinkDayColor : styles.blinkNightColor;

    const pageBackgroundCss = buildThemeBackgroundCss(bgStart, bgEnd, styles.pageBgImage);
    const titleBannerCss = buildTitleBannerCss(styles.titleBgImage);
    const formattedBgImage = styles.clockBgImage ? `url('${styles.clockBgImage.replace(/\\/g, '/')}')` : 'none';

    let css = `
        body { 
            background-image: ${pageBackgroundCss.image} !important;
            background-size: ${pageBackgroundCss.size} !important;
            background-position: ${pageBackgroundCss.position} !important;
            background-repeat: ${pageBackgroundCss.repeat} !important;
        }
        #title-banner {
            background-image: ${titleBannerCss.image} !important;
            box-shadow: ${titleBannerCss.shadow} !important;
        }
        #main-title { color: ${styles.mainTitleColor || '#1f2937'} !important; }
        #toggle-panel-btn { background-color: ${styles.btnAdminBg || '#8b5cf6'} !important; color: ${styles.btnAdminText || '#ffffff'} !important; }
        #toggle-report-btn { background-color: ${styles.btnReportBg || '#10b981'} !important; color: ${styles.btnReportText || '#ffffff'} !important; }
        #open-automation-btn { background-color: ${styles.btnAiBg || '#3b82f6'} !important; color: ${styles.btnAiText || '#ffffff'} !important; }
        #clock-panel {
            background-color: ${styles.clockBg || '#1f2937'} !important;
            background-image: ${formattedBgImage} !important;
            background-size: cover !important;
            background-position: ${styles.clockBgPos || 'center'} !important;
            border: none !important;
        }
        #clock-panel p { color: ${styles.clockText || '#ffffff'} !important; }
    `;
    ui.dynamicThemeStyles.innerHTML = css;
    
    ui.clockPanel.classList.toggle('blinking-border', styles.blinkEnabled);
    ui.clockPanel.style.setProperty('--blink-color', blinkColor || '#fbc02d');

    ui.clockSymbolsContainer.innerHTML = `<span>${styles.clockSymbolsLeft || ''}</span><span>${styles.clockSymbolsRight || ''}</span>`;
    ui.clockDecorationContainer.innerHTML = '';
}

export function populateThemeScheduleSelector() {
    const select = ui.modals.themeSchedule.querySelector('#theme-select-input');
    select.innerHTML = `<option value="default">預設主題</option>`;
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
    document.body.style.backgroundImage = '';
    document.body.className = 'flex items-center justify-center min-h-screen p-4';
    ui.mainTitle.style.color = '';
    ['toggle-panel-btn', 'toggle-report-btn', 'open-automation-btn'].forEach(id => {
        const btn = document.getElementById(id);
        if(btn) {
            btn.style.backgroundColor = '';
            btn.style.color = '';
        }
    });
    ui.clockPanel.className = 'bg-gray-800 text-white rounded-lg p-4 mt-4 text-center shadow-inner transition-all duration-500 relative';
    ui.clockPanel.style.backgroundImage = '';
    ui.clockPanel.style.backgroundPosition = '';
    ui.dynamicThemeStyles.innerHTML = '';
    ui.clockPanel.classList.remove('blinking-border');
    ui.clockDecorationContainer.innerHTML = '';
    ui.clockSymbolsContainer.innerHTML = '';

    // 應用新樣式
    if (themeToApply.startsWith('custom_')) {
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

    let effect, fallContent, flashContent;
    if (activeThemeId.startsWith('custom_')) {
        const theme = state.customThemes.find(t => t.id === activeThemeId);
        if (theme && theme.styles) {
            effect = theme.styles.punchEffect;
            fallContent = theme.styles.punchFallContent;
            flashContent = theme.styles.punchFlashContent;
        }
    }

    if (effect === 'fall') startFallingEffect(fallContent, 30);
    if (effect === 'flash') startFlashEffect(flashContent);
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

function startFlashEffect(content) {
    const container = ui.punchEffectContainer;
    if (!content) return;

    const el = document.createElement('div');
    el.className = 'flash-element';
    el.textContent = content;
    container.appendChild(el);
    setTimeout(() => el.remove(), 1500);
}
