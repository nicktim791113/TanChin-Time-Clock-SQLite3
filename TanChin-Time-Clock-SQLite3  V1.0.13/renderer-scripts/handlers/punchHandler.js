/**
 * @file punchHandler.js
 * @description 打卡儀式的紀錄 - 處理所有與打卡相關的邏輯
 */
import { ui } from '../ui.js';
import * as state from '../state.js';
// --- ✨ 魔法修正施展處：為信使補上遺失的魔法墨水！ ✨ ---
import { setState } from '../state.js';
import { dbRequest } from '../api.js';
import { showToast, showMessage } from '../utils.js';
import { triggerPunchEffect } from './themeHandler.js';

/**
 * 處理感應/輸入後的打卡邏輯
 */
export async function handlePunch() {
    clearTimeout(state.punchInputTimeout);
    clearTimeout(state.manualSelectionTimeout);
    
    const punchValue = ui.punchInput.value.trim();
    if (!punchValue) return;

    const employee = state.employees.find(e => e.card === punchValue || e.password === punchValue);
    if (!employee) {
        showMessage(`找不到卡號或密碼為 "${punchValue}" 的員工。`, 'error');
        ui.punchInput.value = '';
        return;
    }

    const now = new Date();
    const currentShiftId = ui.shiftSelector.value;
    const currentShift = state.shifts.find(s => s.id == currentShiftId);
    const manualStatus = ui.punchStatusSelector.value;
    
    let punchType = manualStatus;
    if (punchType === 'auto') {
        const todayStart = new Date().setHours(0, 0, 0, 0);
        const todaysPunches = state.punchRecords.filter(p => p.id === employee.id && p.timestamp >= todayStart && p.status !== '重複打卡');
        punchType = (todaysPunches.length % 2 === 0) ? 'in' : 'out';
    }

    const lastValidPunch = state.punchRecords
        .filter(p => p.id === employee.id && p.status !== '重複打卡')
        .sort((a, b) => b.timestamp - a.timestamp)[0];

    if (lastValidPunch && (now.getTime() - lastValidPunch.timestamp) < 60 * 1000) {
        const punchStatusText = lastValidPunch.type === 'in' ? '上班' : '下班';
        const duplicateRecord = {
            id: employee.id,
            timestamp: now.getTime(),
            type: lastValidPunch.type,
            shift: currentShift ? currentShift.name : "未設定",
            status: '重複打卡',
            source: 'auto'
        };
        await dbRequest('addPunchRecord', duplicateRecord);
        // --- ✨ 魔法修正施展處：統一使用新的 setState 咒語 ✨ ---
        const updatedRecords = [duplicateRecord, ...state.punchRecords];
        setState({ punchRecords: updatedRecords });
        // --- ✨ 魔法契約已簽訂 ✨ ---
        showMessage(`${employee.name}，您在1分鐘內已打過【${punchStatusText}】卡，此為重複打卡。`, 'info');
        ui.punchInput.value = '';
        resetSelectorsToAuto();
        return;
    }

    const newRecord = {
        id: employee.id,
        timestamp: now.getTime(),
        type: punchType,
        shift: currentShift ? currentShift.name : "未設定",
        status: '正常',
        source: 'auto'
    };

    const result = await dbRequest('addPunchRecord', newRecord);
    if (result.success) {
        // --- ✨ 魔法修正施展處：使用 setState 更新記憶水晶 ✨ ---
        const updatedRecords = [newRecord, ...state.punchRecords];
        setState({ punchRecords: updatedRecords });
        // --- ✨ 魔法契約已簽訂 ✨ ---
        const greetingList = (state.greetings && state.greetings[punchType]) ? state.greetings[punchType] : [];
        const randomGreeting = greetingList.length > 0 ? greetingList[Math.floor(Math.random() * greetingList.length)] : '';
        const punchStatusText = punchType === 'in' ? '上班' : '下班';
        const today = new Date().toISOString().slice(0, 10);
        const activeEffect = state.specialEffects.find(e => e.enabled && today >= e.start_date && today <= e.end_date);
        const prefix = activeEffect ? activeEffect.prefix : '';
        const suffix = activeEffect ? activeEffect.suffix : '';
        const finalMessage = `${prefix} ${employee.name}，打卡成功！(${punchStatusText}) ${randomGreeting} ${suffix}`.trim();
        showMessage(finalMessage, 'success');
        triggerPunchEffect();
        resetSelectorsToAuto();
    } else {
        showToast(`打卡紀錄儲存失敗: ${result.error}`, 'error');
    }
    ui.punchInput.value = '';
}

/**
 * 執行手動補登
 */
export async function executeManualPunch() {
    const empIdValue = ui.manualEmpId.value.trim();
    const dateValue = ui.manualDate.value;
    const timeValue = ui.manualTime.value;
    const statusValue = ui.manualStatus.value;
    const shiftId = ui.manualShiftSelector.value;
    const selectedShift = state.shifts.find(s => s.id == shiftId);

    if (!empIdValue || !dateValue || !timeValue) {
        showToast('請填寫完整的補登資訊！', 'error');
        return;
    }

    const employee = state.employees.find(e => e.id === empIdValue || e.card === empIdValue || e.password === empIdValue);
    if (!employee) {
        showToast(`找不到工號/卡號/密碼為 "${empIdValue}" 的員工。`, 'error');
        return;
    }

    const timestamp = new Date(`${dateValue}T${timeValue}`).getTime();
    const newRecord = {
        id: employee.id,
        timestamp: timestamp,
        type: statusValue,
        shift: selectedShift ? selectedShift.name : "手動補登",
        status: '正常',
        source: 'manual'
    };

    const result = await dbRequest('addPunchRecord', newRecord);
    if (result.success) {
        const updatedRecords = [newRecord, ...state.punchRecords].sort((a, b) => b.timestamp - a.timestamp);
        setState({ punchRecords: updatedRecords });
        showToast(`${employee.name} 的補登紀錄已成功新增！`, 'success');
    } else {
        showToast(`補登失敗: ${result.error}`, 'error');
    }
}

/**
 * 根據當前時間自動選擇班別
 */
export function autoSelectShift() {
    if (!state.shifts || state.shifts.length === 0) return;
    const now = new Date();
    const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();
    
    const timeToMinutes = (timeStr) => {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    };

    let currentShift = null;
    for (const shift of state.shifts) {
        if (shift.start && shift.end) {
            let startMinutes = timeToMinutes(shift.start);
            let endMinutes = timeToMinutes(shift.end);
            
            if (endMinutes < startMinutes) { // 跨夜班
                if (currentTimeInMinutes >= startMinutes || currentTimeInMinutes < endMinutes) {
                    currentShift = shift;
                    break;
                }
            } else { // 日班
                if (currentTimeInMinutes >= startMinutes && currentTimeInMinutes < endMinutes) {
                    currentShift = shift;
                    break;
                }
            }
        }
    }

    if (currentShift) {
        ui.shiftSelector.value = currentShift.id;
        return;
    }

    let nextShift = null;
    let smallestDiff = Infinity;

    state.shifts.forEach(shift => {
        if (shift.start) {
            const shiftStartTimeInMinutes = timeToMinutes(shift.start);
            let diff = shiftStartTimeInMinutes - currentTimeInMinutes;
            if (diff < 0) diff += 24 * 60;
            
            if (diff < smallestDiff) {
                smallestDiff = diff;
                nextShift = shift;
            }
        }
    });
    
    if (nextShift) {
        ui.shiftSelector.value = nextShift.id;
    }
}

/**
 * 重設打卡狀態和班別選擇器為自動模式
 */
export function resetSelectorsToAuto() {
    ui.punchStatusSelector.value = 'auto';
    autoSelectShift();
}
