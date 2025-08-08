/**
 * @file modalHandler.js
 * @description 幻術視窗的召喚 - 處理所有與Modal彈窗相關的操作
 */

import { ui } from '../ui.js';
import { setState } from '../state.js';

/**
 * 召喚一個幻術視窗 (顯示 Modal)
 * @param {string} modalId - 視窗的ID (e.g., 'password-modal')
 */
export function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('show');
    }
}

/**
 * 解除幻術視窗 (隱藏 Modal)
 * @param {string} modalId - 視窗的ID
 */
export function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('show');
    }
}

/**
 * 顯示一個需要使用者確認的魔法陣 (Confirm Modal)
 * @param {string} title - 魔法陣的標題
 * @param {string} message - 魔法陣中的訊息
 * @param {() => void} onConfirm - 使用者確認後要施展的咒語 (回呼函式)
 */
export function showConfirm(title, message, onConfirm) {
    ui.confirmTitle.textContent = title;
    ui.confirmMessage.textContent = message;
    setState({ confirmCallback: onConfirm });
    showModal('confirm-modal');
}
