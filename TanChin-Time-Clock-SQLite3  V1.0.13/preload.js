// preload.js

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // 萬能的寶庫請求窗口
    dbRequest: (operation, ...args) => ipcRenderer.invoke('db-request', operation, ...args),

    // 皇家書記官服務
    downloadFile: (defaultFilename, content) => ipcRenderer.invoke('download-file', defaultFilename, content),
    importAudioFile: () => ipcRenderer.invoke('import-audio-file'),
    openCsvFile: () => ipcRenderer.invoke('open-csv-file'),
    // ✨ 新增魔法：讓信使學會傳遞導入主題圖片的請求 ✨
    importThemeImage: () => ipcRenderer.invoke('import-theme-image'),

    // ✨ 新增：立即執行任務的聖旨 ✨
    executeTaskNow: (task) => ipcRenderer.invoke('execute-task-now', task),

    // 聆聽來自國王的命令
    onPlaySound: (callback) => ipcRenderer.on('play-sound', (event, data) => callback(data)),
    onBellHistoryUpdated: (callback) => ipcRenderer.on('bell-history-updated', () => callback()),
    // ✨ 新增：聆聽來自總管家的心靈感應 ✨
    onDataUpdated: (callback) => ipcRenderer.on('data-updated', (event, arg) => callback(arg))
});
