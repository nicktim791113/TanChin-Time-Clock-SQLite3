/**
 * @file api.js
 * @description 信使的通訊法典 - 封裝所有與主行程(main.js)的通訊
 * 這裡的咒語負責與城堡的總管家溝通，請求資料庫操作或系統級功能。
 */

// 從 'preload.js' 取得信使安全遞送的魔法水晶球
const electronAPI = window.electronAPI;

/**
 * 向主行程發送一個資料庫操作請求
 * @param {string} operation - 要執行的操作名稱 (e.g., 'loadEmployees')
 * @param  {...any} args - 傳遞給操作的參數
 * @returns {Promise<{success: boolean, data?: any, error?: string}>} 操作結果
 */
export const dbRequest = (operation, ...args) => {
    return electronAPI.dbRequest(operation, ...args);
};

/**
 * 請求主行程下載檔案
 * @param {string} defaultFilename - 預設檔名
 * @param {string} content - 檔案內容
 * @returns {Promise<{success: boolean, path?: string, error?: string}>}
 */
export const downloadFile = (defaultFilename, content) => {
    return electronAPI.downloadFile(defaultFilename, content);
};

/**
 * 請求主行程開啟音訊檔案選擇對話框並複製檔案
 * @returns {Promise<{success: boolean, path?: string, name?: string, error?: string}>}
 */
export const importAudioFile = () => {
    return electronAPI.importAudioFile();
};

/**
 * ✨ 新增魔法：請求主行程開啟圖片選擇對話框並複製檔案 ✨
 * @returns {Promise<{success: boolean, path?: string, name?: string, error?: string}>}
 */
export const importThemeImage = () => {
    return electronAPI.importThemeImage();
};


/**
 * 請求主行程開啟CSV/JSON檔案選擇對話框並讀取內容
 * @returns {Promise<{success: boolean, content?: string, fileName?: string, error?: string}>}
 */
export const openCsvFile = () => {
    return electronAPI.openCsvFile();
};

/**
 * 請求主行程立即執行一個自動化任務
 * @param {object} task - 任務物件
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export const executeTaskNow = (task) => {
    return electronAPI.executeTaskNow(task);
};

/**
 * 監聽來自國王的命令：播放聲音
 * @param {(data: {sound: string, duration: number}) => void} callback - 收到命令時執行的回呼函式
 */
export const onPlaySound = (callback) => {
    electronAPI.onPlaySound(callback);
};

/**
 * 監聽來自國王的訊息：響鈴歷史已更新
 * @param {() => void} callback - 收到訊息時執行的回呼函式
 */
export const onBellHistoryUpdated = (callback) => {
    electronAPI.onBellHistoryUpdated(callback);
};

/**
 * 監聽來自總管家的心靈感應：資料已更新
 * @param {(arg: {type: string}) => void} callback - 收到感應時執行的回呼函式
 */
export const onDataUpdated = (callback) => {
    electronAPI.onDataUpdated(callback);
};
