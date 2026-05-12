/**
 * @file punchHandler.js
 * @description 打卡儀式的紀錄 - 處理所有與打卡相關的邏輯 (已修正判定優先級：卡號 > 密碼)
 */
import { ui } from '../ui.js';
import * as state from '../state.js';
import { setState } from '../state.js';
import { dbRequest } from '../api.js';
import { showToast, showMessage } from '../utils.js';
import { triggerPunchEffect } from './themeHandler.js';

function describePunchCredential(value) {
    const text = String(value || '');
    if (!text) return '空白';
    const suffix = text.length <= 4 ? text : text.slice(-4);
    return `長度 ${text.length}，後 4 碼 ${suffix}`;
}

function getPunchCredentialMeta(value) {
    const text = String(value || '');
    return {
        length: text.length,
        suffix: text.length <= 4 ? text : text.slice(-4)
    };
}

async function hashPunchCredential(value) {
    const text = String(value || '');
    if (!text) return '';
    try {
        const data = new TextEncoder().encode(`card-id:${text}`);
        const digest = await window.crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(digest))
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join('');
    } catch {
        let hash = 2166136261;
        for (let index = 0; index < text.length; index += 1) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
    }
}

function matchesPunchCredential(employee, punchValue) {
    const card = String(employee.card || '').trim();
    const password = String(employee.password || '').trim();
    return card === punchValue || password === punchValue;
}

function showPunchSaveError(errorMessage, code = 'P003') {
    showMessage(`[${code}] 打卡紀錄儲存失敗。請回報 ${code}、畫面時間與姓名給管理者。系統訊息：${errorMessage || '未知錯誤'}`, 'error');
}

async function writePunchFailureAuditLog({ code, reason, punchValue, employee = null, extra = {} }) {
    const credentialMeta = getPunchCredentialMeta(punchValue);
    const cardHash = await hashPunchCredential(punchValue);
    try {
        await dbRequest('addAuditLog', {
            timestamp: Date.now(),
            actor_id: employee?.id || 'desktop',
            actor_name: employee?.name || '桌面端打卡',
            role: 'desktop',
            channel: 'desktop',
            action: 'punch',
            target_type: 'punch_record',
            target_id: employee?.id || null,
            summary: `桌面端打卡失敗（${code}）：${reason}`,
            after_data: {
                failure_code: code,
                failure_reason: reason,
                input_length: credentialMeta.length,
                input_suffix: credentialMeta.suffix || '',
                card_hash: cardHash,
                employee_catalog_count: state.employees.length,
                ...extra
            },
            success: false
        });
    } catch (error) {
        console.error('寫入打卡失敗稽核紀錄失敗:', error);
    }
}

/**
 * 處理感應/輸入後的打卡邏輯
 */
export async function handlePunch() {
    clearTimeout(state.punchInputTimeout);
    clearTimeout(state.manualSelectionTimeout);
    
    const punchValue = ui.punchInput.value.trim();
    if (!punchValue) return;

    const employee = state.employees.find(e => matchesPunchCredential(e, punchValue));
    if (!employee) {
        await writePunchFailureAuditLog({
            code: 'P001',
            reason: '找不到卡號或密碼對應的員工',
            punchValue
        });
        showMessage(`[P001] 找不到卡號或密碼。讀到：${describePunchCredential(punchValue)}。請確認人員名冊的卡號沒有多餘空白，並回報 P001 給管理者。`, 'error');
        ui.punchInput.value = '';
        return;
    }

    // ✨ 魔法修正：判定優先級邏輯
    // 1. 先看是否符合密碼 (假設是密碼輸入)
    // 2. 再看是否符合卡號 (如果是卡號，無論是否跟密碼一樣，都優先視為感應 auto)
    // 這樣當 (卡號 == 密碼) 時，會被判定為 auto (現場感應)，避免誤判為密碼輸入。
    let punchSource = 'password'; 
    if (employee.card === punchValue) {
        punchSource = 'auto';
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
            source: punchSource // ✨ 使用修正後的來源判定
        };
        const result = await dbRequest('addPunchRecord', duplicateRecord);
        if (!result.success) {
            await writePunchFailureAuditLog({
                code: 'P004',
                reason: '重複打卡紀錄儲存失敗',
                punchValue,
                employee,
                extra: {
                    record_id: duplicateRecord.id,
                    punch_type: duplicateRecord.type,
                    punch_status: duplicateRecord.status,
                    source: duplicateRecord.source,
                    error: result.error || ''
                }
            });
            showPunchSaveError(result.error, 'P004');
            ui.punchInput.value = '';
            resetSelectorsToAuto();
            return;
        }
        const updatedRecords = [duplicateRecord, ...state.punchRecords];
        setState({ punchRecords: updatedRecords });
        showMessage(`[P002] ${employee.name}，您在 1 分鐘內已打過【${punchStatusText}】卡，系統已記錄為重複打卡。若不是本人剛打過，請回報 P002。`, 'info');
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
        source: punchSource // ✨ 使用修正後的來源判定
    };

    const result = await dbRequest('addPunchRecord', newRecord);
    if (result.success) {
        const updatedRecords = [newRecord, ...state.punchRecords];
        setState({ punchRecords: updatedRecords });

        // 問候語選擇邏輯
        const employeeGreetings = state.greetings.filter(g => g.employee_id === employee.id && g.type === punchType);
        const generalGreetings = state.greetings.filter(g => !g.employee_id && g.type === punchType);
        
        let greetingList = [];
        if (employeeGreetings.length > 0) {
            greetingList = employeeGreetings.flatMap(g => g.message.split('\n'));
        } else if (generalGreetings.length > 0) {
            greetingList = generalGreetings.flatMap(g => g.message.split('\n'));
        }

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
        await writePunchFailureAuditLog({
            code: 'P003',
            reason: '打卡紀錄儲存失敗',
            punchValue,
            employee,
            extra: {
                record_id: newRecord.id,
                punch_type: newRecord.type,
                punch_status: newRecord.status,
                source: newRecord.source,
                error: result.error || ''
            }
        });
        showPunchSaveError(result.error);
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

    const employee = state.employees.find(e =>
        String(e.id || '').trim() === empIdValue || matchesPunchCredential(e, empIdValue)
    );
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
        source: 'manual' // 手動補登維持 manual
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
