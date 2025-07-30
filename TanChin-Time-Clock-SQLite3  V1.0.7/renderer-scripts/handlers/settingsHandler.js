/**
 * @file settingsHandler.js
 * @description 城堡設定總覽 - 處理班別、問候語、響鈴等設定
 */
import { ui } from '../ui.js';
import * as state from '../state.js';
import { setState } from '../state.js';
import { dbRequest, importAudioFile } from '../api.js';
import { showToast, updateManagementPanelHeight } from '../utils.js';
import { showModal, hideModal, showConfirm } from './modalHandler.js';
// ✨ 魔法修正：為健忘的信使補上遺失的鑰匙 (import) ✨
import { autoSelectShift } from './punchHandler.js';

// --- 班別設定相關 ---

/**
 * 將班別資料載入到設定面板
 */
export function loadShiftsToPanel() {
    ui.shiftSettingsContainer.innerHTML = '';
    const shiftsToRender = [...state.shifts];
    while (shiftsToRender.length < 6) {
        shiftsToRender.push({ name: '', start: '', end: '' });
    }
    shiftsToRender.forEach((shift) => {
        const div = document.createElement('div');
        div.className = 'grid grid-cols-8 gap-2 items-center';
        div.innerHTML = `
            <input type="text" value="${shift.name || ''}" placeholder="班別名稱" class="input-magic p-2 border rounded col-span-2">
            <input type="time" value="${shift.start || ''}" class="input-magic p-2 border rounded col-span-3">
            <input type="time" value="${shift.end || ''}" class="input-magic p-2 border rounded col-span-3">
        `;
        ui.shiftSettingsContainer.appendChild(div);
    });
}

/**
 * 儲存班別設定
 */
export async function saveShifts() {
    const shiftElements = ui.shiftSettingsContainer.querySelectorAll('div');
    const newShifts = Array.from(shiftElements).map(div => ({
        name: div.children[0].value,
        start: div.children[1].value,
        end: div.children[2].value,
    })).filter(s => s.name && s.start && s.end);

    const result = await dbRequest('saveShifts', newShifts);
    if (result.success) {
        const loadResult = await dbRequest('loadShifts');
        if (loadResult.success) {
            setState({ shifts: loadResult.data });
            populateShiftSelectors();
            showToast('班別設定已儲存！', 'success');
        }
    } else {
        showToast(`班別儲存失敗: ${result.error}`, 'error');
    }
}

/**
 * 將班別資料填入主畫面與手動補登的下拉選單
 */
export function populateShiftSelectors() {
    const mainSelector = ui.shiftSelector;
    const manualSelector = ui.manualShiftSelector;
    if (!mainSelector || !manualSelector) return;

    mainSelector.innerHTML = '';
    manualSelector.innerHTML = '';

    if (!state.shifts || state.shifts.length === 0) {
        const defaultOption = '<option>請先設定班別</option>';
        mainSelector.innerHTML = defaultOption;
        manualSelector.innerHTML = defaultOption;
        return;
    }

    state.shifts.forEach(shift => {
        const option = document.createElement('option');
        option.value = shift.id;
        option.textContent = `${shift.name} (${shift.start} - ${shift.end})`;
        mainSelector.appendChild(option.cloneNode(true));
        manualSelector.appendChild(option);
    });
    
    // 現在它可以成功地施展這個來自另一本書的法術了！
    autoSelectShift();
}


// --- 問候語相關 ---

/**
 * 開啟問候語編輯視窗
 * @param {'in' | 'out'} type - 問候語類型
 */
export function openGreetingsModal(type) {
    setState({ currentGreetingsType: type });
    const modal = ui.modals.greetings;
    const title = modal.querySelector('#greetings-title');
    const textarea = modal.querySelector('#greetings-textarea');
    
    if (type === 'in') {
        title.textContent = '編輯上班問候語';
        textarea.value = state.greetings.in.join('\n');
    } else {
        title.textContent = '編輯下班問候語';
        textarea.value = state.greetings.out.join('\n');
    }
    showModal('greetings-modal');
}

/**
 * 儲存問候語
 */
export async function saveGreetings() {
    const textarea = ui.modals.greetings.querySelector('#greetings-textarea');
    const newGreetings = textarea.value.split('\n').map(line => line.trim()).filter(line => line);
    
    const updatedGreetings = { ...state.greetings };
    updatedGreetings[state.currentGreetingsType] = newGreetings;

    const result = await dbRequest('saveGreetings', updatedGreetings);
    if (result.success) {
        setState({ greetings: updatedGreetings });
        showToast('問候語已儲存！', 'success');
        hideModal('greetings-modal');
    } else {
        showToast(`儲存失敗: ${result.error}`, 'error');
    }
}


// --- 響鈴與音效相關 ---

/**
 * 在管理者面板中渲染響鈴排程列表
 */
export function renderBellSchedulesInPanel() {
    const list = ui.bellScheduleList;
    list.innerHTML = '';
    if (state.bellSchedules.length === 0) {
        list.innerHTML = `<p class="text-gray-400 text-center p-4">還沒有設定任何響鈴喔！</p>`;
        updateManagementPanelHeight();
        return;
    }
    const daysOfWeek = ['日', '一', '二', '三', '四', '五', '六'];
    state.bellSchedules.sort((a,b) => a.time.localeCompare(b.time)).forEach(schedule => {
        const div = document.createElement('div');
        div.className = 'p-3 bg-white rounded-lg border flex items-center justify-between';
        const soundName = state.customSounds.find(s => s.path === schedule.sound)?.name || '未知音效';
        const repeatDays = schedule.days.split(',').map(d => daysOfWeek[d]).join(', ');

        div.innerHTML = `
            <div class="flex items-center flex-grow">
                <input type="checkbox" class="toggle-enabled w-5 h-5 mr-4 accent-green-500 flex-shrink-0" data-id="${schedule.id}" ${schedule.enabled ? 'checked' : ''}>
                <div class="flex-grow">
                    <p class="font-bold text-lg">${schedule.time} <span class="text-base font-normal text-gray-700 ml-2">${schedule.title || '未命名場景'}</span></p>
                    <p class="text-sm text-gray-500">重複: ${repeatDays}</p>
                    <p class="text-sm text-gray-500">音效: ${soundName} (${schedule.duration || 5}秒)</p>
                </div>
            </div>
            <div class="space-x-2 flex-shrink-0">
                <button class="text-blue-600 hover:underline edit-bell-btn" data-id="${schedule.id}">編輯</button>
                <button class="text-red-600 hover:underline delete-bell-btn" data-id="${schedule.id}">刪除</button>
            </div>
        `;
        list.appendChild(div);
    });
    updateManagementPanelHeight();
}

/**
 * 開啟新增/編輯響鈴視窗
 * @param {string | null} scheduleId - 要編輯的響鈴ID，若為null則為新增
 */
export function openAddBellModal(scheduleId = null) {
    setState({ editingBellId: scheduleId });
    const modal = ui.modals.addBell;
    const title = modal.querySelector('#add-bell-modal-title');
    const titleInput = modal.querySelector('#bell-title-input');
    const timeInput = modal.querySelector('#bell-time-input');
    const soundSelect = modal.querySelector('#bell-sound-select');
    const durationInput = modal.querySelector('#bell-duration-input');
    const weekdaysContainer = modal.querySelector('#bell-weekdays-container');
    
    soundSelect.innerHTML = '';
    state.customSounds.forEach(sound => {
        const option = new Option(sound.name, sound.path);
        soundSelect.add(option);
    });

    weekdaysContainer.innerHTML = '';
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    days.forEach((day, index) => {
        const btn = document.createElement('button');
        btn.className = 'weekday-btn p-2 border rounded';
        btn.textContent = day;
        btn.dataset.day = index;
        weekdaysContainer.appendChild(btn);
    });

    if (scheduleId) {
        title.textContent = '編輯響鈴場景';
        const schedule = state.bellSchedules.find(s => s.id === scheduleId);
        titleInput.value = schedule.title || '';
        timeInput.value = schedule.time;
        soundSelect.value = schedule.sound;
        durationInput.value = schedule.duration || 5;
        schedule.days.split(',').forEach(dayIndex => {
            weekdaysContainer.querySelector(`[data-day="${dayIndex}"]`)?.classList.add('active');
        });
    } else {
        title.textContent = '新增響鈴場景';
        titleInput.value = '';
        timeInput.value = '12:00';
        durationInput.value = 5;
        if(state.customSounds.length > 0) soundSelect.value = state.customSounds[0].path;
    }
    showModal('add-bell-modal');
}

/**
 * 儲存響鈴排程
 */
export async function saveBellSchedule() {
    const modal = ui.modals.addBell;
    const title = modal.querySelector('#bell-title-input').value.trim();
    const time = modal.querySelector('#bell-time-input').value;
    const sound = modal.querySelector('#bell-sound-select').value;
    const duration = modal.querySelector('#bell-duration-input').value;
    const activeDays = Array.from(modal.querySelectorAll('#bell-weekdays-container .active')).map(btn => btn.dataset.day);

    if (!title || !time || !sound || activeDays.length === 0) {
        showToast('請填寫所有欄位並至少選擇一天！', 'error');
        return;
    }

    const newSchedule = {
        id: state.editingBellId || `schedule_${Date.now()}`,
        title: title,
        time: time,
        sound: sound,
        duration: parseInt(duration, 10) || 5,
        days: activeDays.join(','),
        enabled: state.editingBellId ? state.bellSchedules.find(s => s.id === state.editingBellId).enabled : true
    };

    let updatedSchedules = [...state.bellSchedules];
    if (state.editingBellId) {
        const index = updatedSchedules.findIndex(s => s.id === state.editingBellId);
        if (index > -1) updatedSchedules[index] = newSchedule;
    } else {
        updatedSchedules.push(newSchedule);
    }

    const result = await dbRequest('saveBellSchedules', updatedSchedules);
    if (result.success) {
        setState({ bellSchedules: updatedSchedules });
        showToast('響鈴設定已儲存！', 'success');
        renderBellSchedulesInPanel();
        hideModal('add-bell-modal');
    } else {
        showToast(`儲存失敗: ${result.error}`, 'error');
    }
}

/**
 * 在音效管理視窗中渲染自訂音效列表
 */
export function renderCustomSoundsInModal() {
    const list = ui.modals.manageSounds.querySelector('#custom-sound-list-modal');
    list.innerHTML = '';
    if (state.customSounds.length === 0) {
        list.innerHTML = `<p class="text-gray-400 text-center p-4">尚無自訂音效</p>`;
        return;
    }
    state.customSounds.forEach(sound => {
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center p-2 bg-white rounded border';
        div.innerHTML = `
            <span>${sound.name}</span>
            <div>
                <button class="text-blue-500 mr-2 play-sound-btn" data-path="${sound.path}">▶</button>
                <button class="text-red-500 remove-sound-btn" data-id="${sound.id}">✖</button>
            </div>
        `;
        list.appendChild(div);
    });
}

/**
 * 匯入新的音效檔
 */
export async function importNewSound() {
    const result = await importAudioFile();
    if (result.success) {
        const newSound = { id: `sound_${Date.now()}`, name: result.name, path: result.path };
        const updatedSounds = [...state.customSounds, newSound];
        await dbRequest('saveCustomSounds', updatedSounds);
        setState({ customSounds: updatedSounds });
        renderCustomSoundsInModal();
        showToast('音效匯入成功！', 'success');
    } else if (result.message !== '使用者取消選擇') {
        showToast(`匯入失敗: ${result.error}`, 'error');
    }
}

/**
 * 在響鈴歷史視窗中渲染紀錄
 */
export function renderBellHistoryInModal() {
    const list = ui.modals.bellHistory.querySelector('#bell-history-list-modal');
    list.innerHTML = '';
    if (state.bellHistory.length === 0) {
        list.innerHTML = `<p class="text-gray-400 text-center p-4">尚無響鈴紀錄</p>`;
        return;
    }
    state.bellHistory.slice().sort((a,b) => b.timestamp - a.timestamp).forEach(h => {
        const div = document.createElement('div');
        div.textContent = `${new Date(h.timestamp).toLocaleString()} - ${h.sound.split(/[\\/]/).pop()}`;
        list.appendChild(div);
    });
}

/**
 * 清除所有響鈴歷史
 */
export async function clearAllBellHistory() {
    showConfirm('清除響鈴歷史', '您確定要清除所有響鈴歷史紀錄嗎？此操作無法復原。', async () => {
        const result = await dbRequest('clearBellHistory');
        if (result.success) {
            setState({ bellHistory: [] });
            renderBellHistoryInModal();
            showToast('響鈴歷史已清除。', 'success');
        } else {
            showToast(`清除失敗: ${result.error}`, 'error');
        }
        hideModal('confirm-modal');
    });
}

// --- ✨ 密碼修改魔法的歸宿 ✨ ---

/**
 * 開啟變更密碼視窗
 * @param {'admin' | 'system'} type - 要變更的密碼類型
 */
export function openChangePasswordModal(type) {
    setState({ currentPasswordChangeType: type });
    const modal = ui.modals.changePassword;
    const title = modal.querySelector('#change-password-title');
    const currentPassLabel = modal.querySelector('#current-password-label');
    
    if (type === 'admin') {
        title.textContent = '變更管理者密碼';
        currentPassLabel.textContent = '請輸入目前的管理者密碼';
    } else { // system
        title.textContent = '變更系統密碼';
        currentPassLabel.textContent = '請輸入目前的系統密碼';
    }
    
    modal.querySelector('#current-password-input').value = '';
    modal.querySelector('#new-password-input').value = '';
    modal.querySelector('#confirm-password-input').value = '';
    showModal('change-password-modal');
}

/**
 * 處理變更密碼的邏輯
 */
export async function handleChangePassword() {
    try {
        const modal = ui.modals.changePassword;
        const currentPass = modal.querySelector('#current-password-input').value;
        const newPass = modal.querySelector('#new-password-input').value;
        const confirmPass = modal.querySelector('#confirm-password-input').value;

        if (!currentPass || !newPass || !confirmPass) {
            showToast('所有欄位皆為必填！', 'error');
            return;
        }
        if (newPass !== confirmPass) {
            showToast('新的密碼兩次輸入不相符！', 'error');
            return;
        }

        if (state.currentPasswordChangeType === 'admin') {
            if (currentPass !== state.adminPassword) {
                showToast('目前的管理者密碼錯誤！', 'error');
                return;
            }
            await dbRequest('setSetting', 'adminPassword', newPass);
            setState({ adminPassword: newPass });
            showToast('管理者密碼已成功變更！', 'success');
        } else { // system
            if (currentPass !== state.systemPassword) {
                showToast('目前的系統密碼錯誤！', 'error');
                return;
            }
            await dbRequest('setSetting', 'systemPassword', newPass);
            setState({ systemPassword: newPass });
            showToast('系統密碼已成功變更！', 'success');
        }
        hideModal('change-password-modal');
    } catch (error) {
        console.error("變更密碼時發生錯誤:", error);
        showToast(`發生未預期的錯誤: ${error.message}`, 'error');
    }
}
