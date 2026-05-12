/**
 * @file modalHandler.js
 * @description 幻術視窗的召喚 - 處理所有與Modal彈窗相關的操作
 */

import { ui } from '../ui.js';
import { setState } from '../state.js';

// 用於儲存每個 modal 的焦點陷阱事件處理函式
const trapFocusHandlers = new Map();

/**
 * 召喚一個幻術視窗 (顯示 Modal)
 * @param {string} modalId - 視窗的ID (e.g., 'password-modal')
 * @param {string | null} focusElementId - 視窗開啟後要自動對焦的元素ID
 */
export function showModal(modalId, focusElementId = null) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('show');
        
        // ✨ 魔法新增：設定焦點陷阱 ✨
        const focusableElements = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusableElements.length > 0) {
            const firstFocusable = focusableElements[0];
            const lastFocusable = focusableElements[focusableElements.length - 1];

            const handleTrapFocus = (e) => {
                if (e.key !== 'Tab') return;

                if (e.shiftKey) { // Shift + Tab
                    if (document.activeElement === firstFocusable) {
                        e.preventDefault();
                        lastFocusable.focus();
                    }
                } else { // Tab
                    if (document.activeElement === lastFocusable) {
                        e.preventDefault();
                        firstFocusable.focus();
                    }
                }
            };
            
            modal.addEventListener('keydown', handleTrapFocus);
            // 儲存處理函式以便之後移除
            trapFocusHandlers.set(modalId, handleTrapFocus);
        }

        // 自動對焦到指定元素
        if (focusElementId) {
            setTimeout(() => {
                const focusElement = modal.querySelector(`#${focusElementId}`);
                if (focusElement) {
                    focusElement.focus();
                }
            }, 100); 
        } else if (focusableElements.length > 0) {
             // 如果沒有指定，就自動對焦到第一個可互動元素
            setTimeout(() => {
                focusableElements[0].focus();
            }, 100);
        }
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
        
        // ✨ 魔法新增：解除焦點陷阱的事件監聽 ✨
        if (trapFocusHandlers.has(modalId)) {
            modal.removeEventListener('keydown', trapFocusHandlers.get(modalId));
            trapFocusHandlers.delete(modalId);
        }
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
    showModal('confirm-modal', 'confirm-confirm-btn');
}
