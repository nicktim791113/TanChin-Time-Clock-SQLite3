/**
 * @file utils.js
 * @description 魔法工具箱 - 存放共用的輔助咒語
 */
import { ui } from './ui.js';

/**
 * 顯示一個短暫的魔法氣泡訊息 (Toast)
 * @param {string} message - 要顯示的訊息
 * @param {'info' | 'success' | 'error'} type - 訊息類型
 */
export function showToast(message, type = 'info') {
    const container = ui.toastContainer;
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast-bubble ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

/**
 * 在主畫面上顯示訊息
 * @param {string} msg - 訊息內容
 * @param {'info' | 'success' | 'error'} type - 訊息類型
 */
export function showMessage(msg, type = 'info') {
    const box = ui.messageBox;
    if (!box) return;
    box.innerText = msg;
    box.className = 'message-box min-h-[60px] p-4 mb-6 rounded-lg text-center font-semibold text-lg show';
    const colors = {
        error: ['text-red-600', 'bg-red-100'],
        success: ['text-green-600', 'bg-green-100'],
        info: ['text-blue-600', 'bg-blue-100']
    };
    // 先移除所有可能的顏色 class
    box.classList.remove('text-red-600', 'bg-red-100', 'text-green-600', 'bg-green-100', 'text-blue-600', 'bg-blue-100');
    // 再加入對應的顏色 class
    box.classList.add(...(colors[type] || colors.info));
    setTimeout(() => box.classList.remove('show'), 4000);
}


/**
 * 更新管理者面板的高度以適應內容
 */
export function updateManagementPanelHeight() {
    const panel = ui.managementPanel;
    if (panel && panel.style.maxHeight && panel.style.maxHeight !== '0px') {
        panel.style.maxHeight = panel.scrollHeight + "px";
    }
}
