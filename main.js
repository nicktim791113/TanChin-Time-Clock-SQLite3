// main.js

const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const dbModule = require('./database');
const {
  buildAttendanceExportCsv,
  normalizeAttendanceExportCustomFields
} = require('./attendance-export');
const serverModule = require('./server'); // ✨ 魔法新增：召喚信使驛站的卷軸 ✨

// --- 魔法新增：為信鴿設定詳細的飛行日誌 ---
log.transports.file.level = 'info';
autoUpdater.logger = log;
log.info('App starting...');

let mainWindow;
let bellInterval;
let automationInterval;
const gotSingleInstanceLock = app.requestSingleInstanceLock();

function focusMainWindow() {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
}

function broadcastBrowserUpdate(type, meta = {}) {
  if (!type || typeof serverModule.broadcastDataUpdate !== 'function') return;
  serverModule.broadcastDataUpdate(type, meta);
}

function getDbSyncType(operation, args) {
  if (operation === 'saveEmployees') return 'employees';
  if (operation === 'addPunchRecord') return 'punchRecords';
  if (operation === 'addAuditLog') return 'auditLogs';
  if (operation === 'saveShifts') return 'shifts';
  if (operation === 'saveGreetings') return 'greetings';
  if (operation === 'saveBellSchedules') return 'bellSchedules';
  if (operation === 'saveCustomSounds') return 'customSounds';
  if (operation === 'clearBellHistory') return 'bellHistory';
  if (operation === 'saveSpecialEffects') return 'specialEffects';
  if (operation === 'saveThemeSchedules') return 'themeSchedules';
  if (operation === 'saveCustomThemes') return 'customThemes';
  if (operation === 'saveAutomationTasks') return 'automationTasks';
  if (operation === 'clearAutomationLog') return 'automationLog';
  if (operation === 'setSetting' && args[0] === 'adminPassword') return 'adminPassword';
  if (operation === 'setSetting' && (args[0] === 'mainTitle' || args[0] === 'subtitle')) return 'displaySettings';
  if (operation === 'setSetting' && args[0] === 'systemPassword') return 'systemPassword';
  if (operation === 'setSetting' && args[0] === 'attendanceExportCustomFields') return 'attendanceExportSettings';
  if (operation === 'setSetting' && args[0] === 'automationExportDirectory') return 'automationExportDirectory';
  if (operation === 'setSetting' && (args[0] === 'externalApiEnabled' || args[0] === 'externalApiKey')) return 'externalApiSettings';
  return null;
}

const DESKTOP_AUDIT_MASKED_KEYS = new Set([
  'password',
  'newPassword',
  'currentPassword',
  'currentSystemPassword',
  'secret',
  'card',
  'bank_account',
  'national_id',
  'mobile_phone',
  'emergency_phone',
  'externalApiKey',
  'adminPassword',
  'systemPassword'
]);

const DESKTOP_AUDIT_TRACKED_SETTINGS = new Set([
  'adminPassword',
  'mainTitle',
  'subtitle',
  'systemPassword',
  'attendanceExportCustomFields',
  'automationExportDirectory',
  'externalApiEnabled',
  'externalApiKey'
]);

function maskDesktopAuditValue(key, value) {
  if (value == null) return value;
  if (!DESKTOP_AUDIT_MASKED_KEYS.has(key)) return value;
  const text = String(value).trim();
  if (!text) return '';
  if (key.toLowerCase().includes('password') || key.toLowerCase().includes('key') || key === 'secret') {
    return '[MASKED]';
  }
  if (text.length <= 4) return '[MASKED]';
  return `${text.slice(0, 2)}***${text.slice(-2)}`;
}

function sanitizeDesktopAuditSnapshot(value, key = '') {
  if (value == null) return value;
  if (Array.isArray(value)) {
    if (value.length > 10) {
      return {
        count: value.length,
        preview: value.slice(0, 10).map((item) => sanitizeDesktopAuditSnapshot(item, key)),
        truncated: true
      };
    }
    return value.map((item) => sanitizeDesktopAuditSnapshot(item, key));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [entryKey, sanitizeDesktopAuditSnapshot(entryValue, entryKey)])
    );
  }
  return maskDesktopAuditValue(key, value);
}

function summarizeDesktopCollection(items, projector = null) {
  const list = Array.isArray(items) ? items : [];
  const summary = { count: list.length };
  if (typeof projector === 'function') {
    const preview = list.slice(0, 10).map((item) => projector(item)).filter(Boolean);
    if (preview.length) summary.preview = preview;
    if (list.length > preview.length) summary.truncated = true;
  }
  return summary;
}

function getDesktopPunchFailureCode(record = {}) {
  return record.status === '重複打卡' ? 'P004' : 'P003';
}

function getDesktopSettingLabel(key) {
  if (key === 'adminPassword') return '管理員密碼';
  if (key === 'mainTitle') return '主標題';
  if (key === 'subtitle') return '副標題';
  if (key === 'systemPassword') return '系統密碼';
  if (key === 'attendanceExportCustomFields') return '考勤匯出欄位設定';
  if (key === 'automationExportDirectory') return '自動化匯出資料夾';
  if (key === 'externalApiEnabled') return '外部 API 保護開關';
  if (key === 'externalApiKey') return '外部 API 金鑰';
  return key;
}

function captureDesktopAuditContext(operation, args = []) {
  try {
    if (operation === 'saveEmployees') {
      return { before: summarizeDesktopCollection(dbModule.loadEmployees(), (item) => item.id) };
    }
    if (operation === 'saveShifts') {
      return { before: summarizeDesktopCollection(dbModule.loadShifts(), (item) => item.name) };
    }
    if (operation === 'saveGreetings') {
      return { before: summarizeDesktopCollection(dbModule.loadGreetings(), (item) => item.id) };
    }
    if (operation === 'saveBellSchedules') {
      return { before: summarizeDesktopCollection(dbModule.loadBellSchedules(), (item) => item.id || item.title) };
    }
    if (operation === 'saveCustomSounds') {
      return { before: summarizeDesktopCollection(dbModule.loadCustomSounds(), (item) => item.id || item.name) };
    }
    if (operation === 'clearBellHistory') {
      return { before: { count: dbModule.loadBellHistory().length } };
    }
    if (operation === 'saveSpecialEffects') {
      return { before: summarizeDesktopCollection(dbModule.loadSpecialEffects(), (item) => item.id || item.name) };
    }
    if (operation === 'saveThemeSchedules') {
      return { before: summarizeDesktopCollection(dbModule.loadThemeSchedules(), (item) => item.id || item.name) };
    }
    if (operation === 'saveCustomThemes') {
      return { before: summarizeDesktopCollection(dbModule.loadCustomThemes(), (item) => item.id || item.name) };
    }
    if (operation === 'saveAutomationTasks') {
      return { before: summarizeDesktopCollection(dbModule.loadAutomationTasks(), (item) => item.id) };
    }
    if (operation === 'clearAutomationLog') {
      return { before: { count: dbModule.loadAutomationLog().length } };
    }
    if (operation === 'setSetting' && DESKTOP_AUDIT_TRACKED_SETTINGS.has(args[0])) {
      return { before: dbModule.getSetting(args[0]) };
    }
  } catch (error) {
    log.warn(`[audit] Failed to capture desktop audit context for ${operation}: ${error.message}`);
  }
  return {};
}

function buildDesktopAuditEntry(operation, args = [], context = {}, result = null, error = null) {
  const failed = Boolean(error);
  let entry = null;

  if (operation === 'saveEmployees') {
    const employees = Array.isArray(args[0]) ? args[0] : [];
    entry = {
      action: 'save',
      target_type: 'employee',
      summary: `桌面端批次儲存員工資料（${employees.length} 筆）`,
      before_data: context.before || { count: 0 },
      after_data: summarizeDesktopCollection(employees, (item) => item?.id)
    };
  } else if (operation === 'addPunchRecord') {
    const record = args[0] || {};
    entry = {
      action: 'create',
      target_type: 'punch_record',
      target_id: record.id || null,
      summary: `桌面端新增打卡紀錄（${record.id || '-'}）`,
      after_data: {
        id: record.id || '',
        timestamp: record.timestamp || null,
        type: record.type || '',
        shift: record.shift || '',
        status: record.status || '',
        source: record.source || ''
      }
    };
  } else if (operation === 'saveShifts') {
    const shifts = Array.isArray(args[0]) ? args[0] : [];
    entry = {
      action: 'save',
      target_type: 'shift',
      summary: `桌面端批次儲存班別設定（${shifts.length} 筆）`,
      before_data: context.before || { count: 0 },
      after_data: summarizeDesktopCollection(shifts, (item) => item?.name)
    };
  } else if (operation === 'saveGreetings') {
    const greetings = Array.isArray(args[0]) ? args[0] : [];
    entry = {
      action: 'save',
      target_type: 'greeting',
      summary: `桌面端批次儲存問候語（${greetings.length} 筆）`,
      before_data: context.before || { count: 0 },
      after_data: summarizeDesktopCollection(greetings, (item) => item?.id)
    };
  } else if (operation === 'saveBellSchedules') {
    const schedules = Array.isArray(args[0]) ? args[0] : [];
    entry = {
      action: 'save',
      target_type: 'bell_schedule',
      summary: `桌面端批次儲存作息響鈴排程（${schedules.length} 筆）`,
      before_data: context.before || { count: 0 },
      after_data: summarizeDesktopCollection(schedules, (item) => item?.id || item?.title)
    };
  } else if (operation === 'saveCustomSounds') {
    const sounds = Array.isArray(args[0]) ? args[0] : [];
    entry = {
      action: 'save',
      target_type: 'custom_sound',
      summary: `桌面端批次儲存自訂音效（${sounds.length} 筆）`,
      before_data: context.before || { count: 0 },
      after_data: summarizeDesktopCollection(sounds, (item) => item?.id || item?.name)
    };
  } else if (operation === 'clearBellHistory') {
    entry = {
      action: 'clear',
      target_type: 'bell_history',
      summary: '桌面端清除響鈴歷史紀錄',
      before_data: context.before || { count: 0 },
      after_data: { count: 0, changes: Number(result?.changes || 0) }
    };
  } else if (operation === 'saveSpecialEffects') {
    const effects = Array.isArray(args[0]) ? args[0] : [];
    entry = {
      action: 'save',
      target_type: 'special_effect',
      summary: `桌面端批次儲存節日特效（${effects.length} 筆）`,
      before_data: context.before || { count: 0 },
      after_data: summarizeDesktopCollection(effects, (item) => item?.id || item?.name)
    };
  } else if (operation === 'saveThemeSchedules') {
    const schedules = Array.isArray(args[0]) ? args[0] : [];
    entry = {
      action: 'save',
      target_type: 'theme_schedule',
      summary: `桌面端批次儲存主題排程（${schedules.length} 筆）`,
      before_data: context.before || { count: 0 },
      after_data: summarizeDesktopCollection(schedules, (item) => item?.id || item?.name)
    };
  } else if (operation === 'saveCustomThemes') {
    const themes = Array.isArray(args[0]) ? args[0] : [];
    entry = {
      action: 'save',
      target_type: 'custom_theme',
      summary: `桌面端批次儲存自訂主題（${themes.length} 筆）`,
      before_data: context.before || { count: 0 },
      after_data: summarizeDesktopCollection(themes, (item) => item?.id || item?.name)
    };
  } else if (operation === 'saveAutomationTasks') {
    const tasks = Array.isArray(args[0]) ? args[0] : [];
    entry = {
      action: 'save',
      target_type: 'automation_task',
      summary: `桌面端批次儲存自動化任務（${tasks.length} 筆）`,
      before_data: context.before || { count: 0 },
      after_data: summarizeDesktopCollection(tasks, (item) => item?.id)
    };
  } else if (operation === 'clearAutomationLog') {
    entry = {
      action: 'clear',
      target_type: 'automation_log',
      summary: '桌面端清除自動化日誌',
      before_data: context.before || { count: 0 },
      after_data: { count: 0 }
    };
  } else if (operation === 'setSetting' && DESKTOP_AUDIT_TRACKED_SETTINGS.has(args[0])) {
    const [key, value] = args;
    const action = key === 'adminPassword' || key === 'systemPassword'
      ? 'change_password'
      : 'update';
    entry = {
      action,
      target_type: 'setting',
      target_id: key,
      summary: `桌面端更新${getDesktopSettingLabel(key)}`,
      before_data: { value: context.before ?? null },
      after_data: { value: value ?? null }
    };
  }

  if (!entry) return null;
  if (!failed) return entry;
  const failureCode = operation === 'addPunchRecord'
    ? getDesktopPunchFailureCode(args[0] || {})
    : null;
  return {
    ...entry,
    success: false,
    summary: `${entry.summary}失敗${failureCode ? `（${failureCode}）` : ''}：${error.message}`,
    after_data: {
      ...(entry.after_data || {}),
      ...(failureCode ? {
        failure_code: failureCode,
        failure_reason: failureCode === 'P004'
          ? '重複打卡紀錄寫入資料庫失敗'
          : '打卡紀錄寫入資料庫失敗'
      } : {}),
      error: error.message
    }
  };
}

function writeDesktopAuditLog(entry) {
  if (!entry) return;
  try {
    dbModule.addAuditLog({
      timestamp: Date.now(),
      actor_id: 'desktop',
      actor_name: '桌面端操作',
      role: 'desktop',
      channel: 'desktop',
      action: entry.action || 'update',
      target_type: entry.target_type || null,
      target_id: entry.target_id || null,
      summary: entry.summary || '',
      before_data: sanitizeDesktopAuditSnapshot(entry.before_data),
      after_data: sanitizeDesktopAuditSnapshot(entry.after_data),
      success: entry.success !== false
    });
    broadcastBrowserUpdate('auditLogs', { origin: 'desktop' });
  } catch (error) {
    log.error('[audit] Failed to write desktop audit log:', error);
  }
}

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});


// --- 自動更新相關 ---
autoUpdater.on('checking-for-update', () => log.info('正在檢查更新...'));
autoUpdater.on('update-available', (info) => {
  log.info('發現可用更新！');
  dialog.showMessageBox({
    type: 'info',
    title: '發現新版本',
    message: `偵測到新版本 ${info.version}，是否要立即下載更新？`,
    buttons: ['立即下載', '稍後再說']
  }).then(result => {
    if (result.response === 0) autoUpdater.downloadUpdate();
  });
});
autoUpdater.on('update-not-available', () => log.info('目前為最新版本。'));

// ★ [1-START] 優化離線錯誤處理：若偵測到無網路連線，則安靜地略過，不彈出錯誤視窗打擾使用者
autoUpdater.on('error', (err) => {
  const errorMessage = err.message || '';
  const isOfflineError = errorMessage.includes('net::ERR_INTERNET_DISCONNECTED') || 
                         errorMessage.includes('net::ERR_NAME_NOT_RESOLVED') || 
                         errorMessage.includes('getaddrinfo ENOTFOUND');

  if (isOfflineError) {
      log.info('目前處於離線狀態，略過自動更新提示。');
  } else {
      log.error('更新發生錯誤: ' + err);
      dialog.showMessageBox({
          type: 'error',
          title: '更新失敗',
          message: `自動更新時發生錯誤，請稍後再試。\n錯誤訊息: ${err.message}`
      });
  }
});
// ★ [1-END]

autoUpdater.on('update-downloaded', (info) => {
  log.info('更新已下載完成！');
  dialog.showMessageBox({
    type: 'info',
    title: '安裝更新',
    message: `新版本 ${info.version} 已下載完成，是否要立即安裝並重新啟動？`,
    buttons: ['立即安裝', '稍後手動安裝']
  }).then(result => {
    if (result.response === 0) autoUpdater.quitAndInstall();
  });
});


// --- IPC 通訊處理 ---
ipcMain.handle('db-request', async (event, operation, ...args) => {
  if (typeof dbModule[operation] === 'function') {
    const auditContext = captureDesktopAuditContext(operation, args);
    try {
      const result = await dbModule[operation](...args); 
      const syncType = getDbSyncType(operation, args);
      if (syncType) {
        broadcastBrowserUpdate(syncType, { origin: 'desktop' });
      }
      writeDesktopAuditLog(buildDesktopAuditEntry(operation, args, auditContext, result));
      return { success: true, data: result };
    } catch (error) {
      log.error(`Database operation '${operation}' with args ${JSON.stringify(args)} failed:`, error);
      writeDesktopAuditLog(buildDesktopAuditEntry(operation, args, auditContext, null, error));
      return { success: false, error: error.message };
    }
  }
  return { success: false, error: `Unknown database operation: ${operation}` };
});

ipcMain.handle('execute-task-now', async (event, task) => {
    try {
        const result = await executeAutomationTask(task);
        writeDesktopAuditLog({
          action: 'execute',
          target_type: 'automation_task',
          target_id: task?.id || null,
          summary: `桌面端立即執行自動化任務（${task?.id || '-'})`,
          after_data: {
            taskId: task?.id || null,
            frequency: task?.frequency || '',
            task_type: task?.task_type || '',
            target: task?.target || '',
            notificationType: result?.notificationType || null,
            message: result?.message || ''
          }
        });
        return { success: true, notificationType: result.notificationType, message: result.message };
    } catch (error) {
        log.error(`Immediate task execution for task ID ${task.id} failed:`, error);
        writeDesktopAuditLog({
          action: 'execute',
          target_type: 'automation_task',
          target_id: task?.id || null,
          summary: `桌面端立即執行自動化任務失敗（${task?.id || '-'})：${error.message}`,
          after_data: {
            taskId: task?.id || null,
            frequency: task?.frequency || '',
            task_type: task?.task_type || '',
            target: task?.target || '',
            error: error.message
          },
          success: false
        });
        return { success: false, error: error.message };
    }
});

// --- 檔案處理 ---
ipcMain.handle('download-file', async (event, defaultFilename, content) => {
  if (!mainWindow) return { success: false, error: '主視窗不存在' };
  try {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: '儲存檔案',
      defaultPath: defaultFilename,
      filters: [
          { name: 'CSV 檔案', extensions: ['csv'] }, 
          { name: 'JSON 檔案', extensions: ['json'] }, 
          { name: '所有檔案', extensions: ['*'] }
        ]
    });
    if (canceled || !filePath) return { success: false, message: '使用者取消儲存' };
    const bom = Buffer.from('\uFEFF', 'utf8');
    const fileContent = filePath.endsWith('.csv') ? Buffer.concat([bom, Buffer.from(content)]) : Buffer.from(content);
    fs.writeFileSync(filePath, fileContent);
    return { success: true, path: filePath };
  } catch (error) {
    log.error('儲存檔案失敗:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('select-directory', async (event, defaultPath = '') => {
  if (!mainWindow) return { success: false, error: '主視窗不存在' };
  try {
    const normalizedDefaultPath = String(defaultPath || '').trim();
    const options = {
      title: '選擇資料夾',
      properties: ['openDirectory', 'createDirectory']
    };
    if (normalizedDefaultPath && fs.existsSync(normalizedDefaultPath)) {
      options.defaultPath = normalizedDefaultPath;
    }
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, options);
    if (canceled || !filePaths || filePaths.length === 0) {
      return { success: false, canceled: true, message: '使用者取消選擇' };
    }
    return { success: true, path: path.resolve(filePaths[0]) };
  } catch (error) {
    log.error('選擇資料夾失敗:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-csv-file', async () => {
  if (!mainWindow) return { success: false, error: '主視窗不存在' };
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: '選擇要匯入的檔案',
        filters: [{ name: '支援的檔案', extensions: ['csv', 'json'] }, { name: '所有檔案', extensions: ['*'] }],
        properties: ['openFile']
    });
    if (canceled || filePaths.length === 0) return { success: false, message: '使用者取消選擇' };
    const filePath = filePaths[0];
    const content = fs.readFileSync(filePath, 'utf8');
    return { success: true, content: content, fileName: path.basename(filePath) };
  } catch (error) {
    log.error('讀取檔案失敗:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('import-audio-file', async () => {
    if (!mainWindow) return { success: false, error: '主視窗不存在' };
    const userDataPath = app.getPath('userData');
    const customSoundsPath = path.join(userDataPath, 'CustomSounds');
    if (!fs.existsSync(customSoundsPath)) fs.mkdirSync(customSoundsPath);
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: '選擇音效檔案',
        filters: [{ name: '音訊檔案', extensions: ['mp3', 'wav', 'ogg'] }],
        properties: ['openFile']
    });
    if (canceled || !filePaths || filePaths.length === 0) return { success: false, message: '使用者取消選擇' };
    const sourcePath = filePaths[0];
    const fileName = path.basename(sourcePath);
    const destinationPath = path.join(customSoundsPath, fileName);
    try {
        fs.copyFileSync(sourcePath, destinationPath);
        log.info(`音效檔案已複製到: ${destinationPath}`);
        return { success: true, path: destinationPath, name: fileName };
    } catch (error) {
        log.error('複製音效檔案失敗:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('import-theme-image', async () => {
  if (!mainWindow) return { success: false, error: '主視窗不存在' };
  const userDataPath = app.getPath('userData');
  const themeImagesPath = path.join(userDataPath, 'ThemeImages');
  if (!fs.existsSync(themeImagesPath)) fs.mkdirSync(themeImagesPath, { recursive: true });
  
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: '選擇背景圖片',
      filters: [{ name: '圖片檔案', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
      properties: ['openFile']
  });

  if (canceled || !filePaths || filePaths.length === 0) {
      return { success: false, message: '使用者取消選擇' };
  }

  const sourcePath = filePaths[0];
  const fileName = `${Date.now()}-${path.basename(sourcePath)}`;
  const destinationPath = path.join(themeImagesPath, fileName);

  try {
      fs.copyFileSync(sourcePath, destinationPath);
      log.info(`主題圖片已複製到: ${destinationPath}`);
      const fileUri = `file://${destinationPath.replace(/\\/g, '/')}`;
      return { success: true, path: fileUri, name: path.basename(sourcePath) };
  } catch (error) {
      log.error('複製主題圖片失敗:', error);
      return { success: false, error: error.message };
  }
});


// --- 皇家守鐘人 ---
function normalizeBellScheduleTime(value) {
  return String(value || '').trim().slice(0, 5);
}

function startBellScheduler() {
  if (bellInterval) clearInterval(bellInterval);
  
  bellInterval = setInterval(async () => {
    try {
      const schedules = dbModule.loadBellSchedules(); 
      if (!schedules || schedules.length === 0) return;

      const now = new Date();
      const dayOfWeek = now.getDay();
      const currentTime = now.toTimeString().slice(0, 5);
      const oneMinuteAgo = now.getTime() - 60000;
      let historyTimestampOffset = 0;

      for (const schedule of schedules) {
        const activeDays = String(schedule.days || '').split(',').map((value) => value.trim()).filter(Boolean);
        const scheduleTime = normalizeBellScheduleTime(schedule.time);

        if (schedule.enabled && activeDays.includes(dayOfWeek.toString()) && scheduleTime === currentTime) {
          const alreadyRang = dbModule.hasBellHistorySince(schedule.id, oneMinuteAgo);

          if (!alreadyRang) {
            log.info(`敲響鐘聲: ${schedule.title} at ${schedule.time}`);
            if (mainWindow) {
                mainWindow.webContents.send('play-sound', { 
                    sound: schedule.sound, 
                    duration: schedule.duration 
                });
            }
            const historyTimestamp = now.getTime() + historyTimestampOffset;
            historyTimestampOffset += 1;
            const newHistoryRecord = { 
                timestamp: historyTimestamp, 
                scheduleId: schedule.id, 
                time: schedule.time, 
                sound: schedule.sound 
            };
            dbModule.addBellHistory(newHistoryRecord);
            if (mainWindow) {
                mainWindow.webContents.send('bell-history-updated', newHistoryRecord);
            }
          }
        }
      }
    } catch (error) {
      log.error('響鈴排程器發生錯誤:', error);
    }
  }, 1000);
}

// --- AI 自動化排程核心 ---

// ★ [2-START] 修復時區偏移問題：新增本地時間格式化工具，取代會轉換成 UTC 時間的 toISOString()
function formatLocalDate(date, format = 'YYYY-MM-DD') {
    const pad = (n) => n.toString().padStart(2, '0');
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    if (format === 'YYYY-MM') return `${y}-${m}`;
    return `${y}-${m}-${d}`;
}

function isValidDateObject(value) {
    return value instanceof Date && !Number.isNaN(value.getTime());
}

function sanitizeFileNameSegment(value) {
    return String(value || '')
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, ' ')
        .trim();
}

function buildExportFileName(prefix, startDate, endDate, rangeLabel = '') {
    const exportDate = formatLocalDate(new Date());
    if (isValidDateObject(startDate) && isValidDateObject(endDate)) {
        const dataRange = `${formatLocalDate(startDate)}~${formatLocalDate(endDate)}`;
        return `${prefix}_資料期間(${dataRange})_匯出於${exportDate}.csv`;
    }

    const safeRangeLabel = sanitizeFileNameSegment(rangeLabel || '全部資料');
    return `${prefix}_${safeRangeLabel}_匯出於${exportDate}.csv`;
}
// ★ [2-END]

function normalizeExportDirectoryPath(directoryPath) {
    const trimmed = String(directoryPath || '').trim();
    if (!trimmed) return '';
    if (!path.isAbsolute(trimmed)) {
        throw new Error('匯出資料夾必須是完整路徑。');
    }
    const resolvedPath = path.resolve(trimmed);
    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`匯出資料夾不存在：${resolvedPath}`);
    }
    if (!fs.statSync(resolvedPath).isDirectory()) {
        throw new Error(`匯出位置不是資料夾：${resolvedPath}`);
    }
    return resolvedPath;
}

function getAutomationExportDirectoryInfo(task = {}) {
    const taskDirectory = normalizeExportDirectoryPath(task.export_directory);
    if (taskDirectory) {
        return { directoryPath: taskDirectory, sourceLabel: '任務自訂資料夾' };
    }

    const defaultDirectory = normalizeExportDirectoryPath(dbModule.getSetting('automationExportDirectory'));
    if (defaultDirectory) {
        return { directoryPath: defaultDirectory, sourceLabel: '預設匯出資料夾' };
    }

    return { directoryPath: app.getPath('desktop'), sourceLabel: '桌面資料夾' };
}

async function executeAutomationTask(task) {
    log.info(`Executing automation task: ${task.task_type} - ${task.target}`);
    let notificationType = null; 
    try {
        let message = '';
        let status = 'info';
        let result;

        const today = new Date();
        // ★ [3-START] 修復時區偏移問題：使用本地時間格式化工具
        const todayString = formatLocalDate(today);
        // ★ [3-END]
        let descriptiveDateRange = '';
        let startTime, endTime;

        switch (task.target) {
            case 'last_week_records':
                const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
                endTime = new Date(new Date().setDate(today.getDate() - dayOfWeek));
                startTime = new Date(new Date(endTime).setDate(endTime.getDate() - 6));
                startTime.setHours(0, 0, 0, 0);
                endTime.setHours(23, 59, 59, 999);
                // ★ [4-START] 修復時區偏移問題：使用本地時間格式化工具
                descriptiveDateRange = `上週(${formatLocalDate(startTime)}至${formatLocalDate(endTime)})`;
                // ★ [4-END]
                break;
            case 'last_month_records':
                const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                startTime = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
                endTime = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);
                startTime.setHours(0, 0, 0, 0);
                endTime.setHours(23, 59, 59, 999);
                // ★ [5-START] 修復時區偏移問題：使用本地時間格式化工具，指定只顯示年月
                descriptiveDateRange = `上月(${formatLocalDate(startTime, 'YYYY-MM')})`;
                // ★ [5-END]
                break;
            case 'manual_records': descriptiveDateRange = `手動補登紀錄`; break;
            case 'all_records': descriptiveDateRange = `全部打卡紀錄`; break;
            case 'all_employees': descriptiveDateRange = `所有人員資料`; break;
            case 'all_bell_records': descriptiveDateRange = `全部響鈴紀錄`; break;
            case 'log': descriptiveDateRange = `系統日誌`; break;
        }

        if (task.task_type === 'export') {
            const exportDirectoryInfo = getAutomationExportDirectoryInfo(task);
            const exportBasePath = exportDirectoryInfo.directoryPath;
            const bom = Buffer.from('\uFEFF', 'utf8');
            let csvContent = '';
            let fileName = '';

            if (task.target === 'all_employees') {
                const employees = dbModule.loadEmployees();
                if (employees.length === 0) {
                    message = `任務執行完畢：沒有任何人員資料可匯出。`;
                } else {
                    const headers = ['id', 'name', 'gender', 'department', 'card', 'password', 'nationality', 'birth_date', 'hire_date', 'termination_date', 'notes'];
                    const headers_tw = ['工號', '姓名', '性別', '部門', '卡號', '密碼', '國籍', '出生日', '到職日', '離職日', '備註'];
                    csvContent = headers_tw.join(',') + '\r\n';
                    employees.forEach(emp => {
                        const row = headers.map(header => `"${emp[header] || ''}"`);
                        csvContent += row.join(',') + '\r\n';
                    });
                    fileName = `人員總名冊_(匯出於${todayString}).csv`;
                    const filePath = path.join(exportBasePath, fileName);
                    fs.writeFileSync(filePath, Buffer.concat([bom, Buffer.from(csvContent)]));
                    message = `任務成功：已將 ${employees.length} 筆人員資料匯出至 ${exportDirectoryInfo.sourceLabel}：${exportBasePath}`;
                    status = 'success';
                }
            } else if (task.target === 'log') {
                const logs = dbModule.loadAutomationLog();
                 if (logs.length === 0) {
                    message = `任務執行完畢：沒有任何系統日誌可匯出。`;
                } else {
                    // ★ 系統日誌排序: 由舊到新
                    logs.sort((a, b) => a.timestamp - b.timestamp);
                    const headers = ['時間戳', '狀態', '訊息'];
                    const rows = logs.map(l => {
                        return [ `"${new Date(l.timestamp).toLocaleString()}"`, `"${l.status}"`, `"${l.message.replace(/"/g, '""')}"` ].join(',');
                    });
                    csvContent = headers.join(',') + '\r\n' + rows.join('\r\n');
                    fileName = `系統任務日誌_(匯出於${todayString}).csv`;
                    const filePath = path.join(exportBasePath, fileName);
                    fs.writeFileSync(filePath, Buffer.concat([bom, Buffer.from(csvContent)]));
                    message = `任務成功：已將 ${logs.length} 筆系統日誌匯出至 ${exportDirectoryInfo.sourceLabel}：${exportBasePath}`;
                    status = 'success';
                }
            } else if (task.target === 'all_bell_records') {
                const bellHistory = dbModule.loadBellHistory();
                if (bellHistory.length === 0) {
                    message = `任務執行完畢：沒有任何響鈴紀錄可匯出。`;
                } else {
                    // ★ 響鈴紀錄排序: 由舊到新
                    bellHistory.sort((a, b) => a.timestamp - b.timestamp);
                    const headers = ['響鈴時間戳', '排程ID', '排程時間', '音效檔名'];
                    const rows = bellHistory.map(h => {
                        return [ `"${new Date(h.timestamp).toLocaleString()}"`, `"${h.scheduleId}"`, `"${h.time}"`, `"${h.sound.split(/[\\/]/).pop()}"` ].join(',');
                    });
                    csvContent = headers.join(',') + '\r\n' + rows.join('\r\n');
                    fileName = `響鈴歷史紀錄_(匯出於${todayString}).csv`;
                    const filePath = path.join(exportBasePath, fileName);
                    fs.writeFileSync(filePath, Buffer.concat([bom, Buffer.from(csvContent)]));
                    message = `任務成功：已將 ${bellHistory.length} 筆響鈴紀錄匯出至 ${exportDirectoryInfo.sourceLabel}：${exportBasePath}`;
                    status = 'success';
                }
            } else {
                const allRecords = dbModule.loadPunchRecords();
                const employees = dbModule.loadEmployees();
                let recordsToExport = [];

                if (task.target === 'last_week_records' || task.target === 'last_month_records') {
                    recordsToExport = allRecords.filter(p => p.timestamp >= startTime.getTime() && p.timestamp <= endTime.getTime());
                } else if (task.target === 'manual_records') {
                    recordsToExport = allRecords.filter(p => p.source === 'manual');
                } else if (task.target === 'all_records') {
                    recordsToExport = allRecords;
                }

                if (recordsToExport.length === 0) {
                    message = `任務執行完畢：範圍 [${descriptiveDateRange}] 無任何符合的打卡紀錄可匯出。`;
                } else {
                    // ★ 考勤打卡紀錄排序: 由舊到新 (Ascending)
                    recordsToExport.sort((a, b) => a.timestamp - b.timestamp);
                    const customFieldIds = normalizeAttendanceExportCustomFields(dbModule.getSetting('attendanceExportCustomFields'));
                    csvContent = buildAttendanceExportCsv(recordsToExport, employees, {
                        templateId: task.export_template,
                        customFieldIds
                    });
                    fileName = buildExportFileName('考勤報表', startTime, endTime, descriptiveDateRange);
                    const filePath = path.join(exportBasePath, fileName);
                    fs.writeFileSync(filePath, Buffer.concat([bom, Buffer.from(csvContent)]));
                    message = `任務成功：已將 [${descriptiveDateRange}] 的 ${recordsToExport.length} 筆考勤紀錄匯出至 ${exportDirectoryInfo.sourceLabel}：${exportBasePath}`;
                    status = 'success';
                }
            }
        } else if (task.task_type === 'delete') {
            switch (task.target) {
                case 'last_week_records':
                case 'last_month_records':
                    result = dbModule.deletePunchRecordsByDateRange(startTime.getTime(), endTime.getTime());
                    message = `任務成功：已刪除 [${descriptiveDateRange}] 的 ${result.changes} 筆打卡紀錄。`;
                    if (result.changes > 0) notificationType = 'punchRecords';
                    status = 'success';
                    break;
                case 'manual_records':
                    result = dbModule.deletePunchRecordsBySource('manual');
                    message = `任務成功：已刪除 ${result.changes} 筆手動補登紀錄。`;
                    if (result.changes > 0) notificationType = 'punchRecords';
                    status = 'success';
                    break;
                case 'all_records':
                    result = dbModule.deletePunchRecordsByDateRange(0, Date.now());
                    message = `任務成功：已刪除全部 ${result.changes} 筆打卡紀錄。`;
                    if (result.changes > 0) notificationType = 'punchRecords';
                    status = 'success';
                    break;
                case 'all_employees':
                    result = dbModule.deleteAllEmployees();
                    message = `任務成功：已刪除所有 ${result.changes} 位人員資料。此操作無法復原。`;
                    if (result.changes > 0) notificationType = 'employees';
                    status = 'success';
                    break;
                case 'all_bell_records':
                    result = dbModule.clearBellHistory();
                    message = `任務成功：已刪除所有 ${result.changes} 筆響鈴紀錄。`;
                    if (result.changes > 0) notificationType = 'bellHistory';
                    status = 'success';
                    break;
                case 'log':
                    result = dbModule.clearAutomationLog();
                    message = `任務成功：已刪除所有 ${result.changes} 筆系統任務日誌。`;
                    status = 'success';
                    break;
            }
        }
        
        dbModule.addAutomationLog({ timestamp: Date.now(), message, status });
        log.info(message);

        if (mainWindow) {
            mainWindow.webContents.send('data-updated', { type: 'automationLog' });
        }
        broadcastBrowserUpdate('automationLog', { origin: 'desktop' });
        if (notificationType) {
            broadcastBrowserUpdate(notificationType, { origin: 'desktop' });
        }
        return { notificationType, message };

    } catch (error) {
        log.error('Automation task execution failed:', error);
        dbModule.addAutomationLog({ timestamp: Date.now(), message: `任務失敗: ${error.message}`, status: 'error' });
        if (mainWindow) {
            mainWindow.webContents.send('data-updated', { type: 'automationLog' });
        }
        broadcastBrowserUpdate('automationLog', { origin: 'desktop' });
        throw error;
    }
}

function startAutomationScheduler() {
    if (automationInterval) clearInterval(automationInterval);

    automationInterval = setInterval(() => {
        try {
            const tasks = dbModule.loadAutomationTasks();
            if (!tasks || tasks.length === 0) return;

            const now = new Date();
            const currentDayOfWeek = now.getDay().toString();
            const currentDayOfMonth = now.getDate().toString();
            const currentTime = now.toTimeString().slice(0, 5);

            for (const task of tasks) {
                if (!task.enabled || task.frequency === 'immediate') continue;

                const isTimeMatch = task.time === currentTime;
                let isDayMatch = false;

                if (task.frequency === 'daily') {
                    isDayMatch = true;
                } else if (task.frequency === 'weekly') {
                    isDayMatch = task.day === currentDayOfWeek;
                } else if (task.frequency === 'monthly') {
                    isDayMatch = task.day === currentDayOfMonth;
                }

                if (isTimeMatch && isDayMatch) {
                    const log = dbModule.loadAutomationLog();
                    const fiveMinutesAgo = now.getTime() - 5 * 60 * 1000;
                    const alreadyRan = log.some(l => 
                        (l.timestamp > fiveMinutesAgo) && l.message.includes(task.target) && l.message.includes(task.task_type)
                    );
                    
                    if (!alreadyRan) {
                        executeAutomationTask(task);
                    }
                }
            }
        } catch (error) {
            log.error('Automation scheduler error:', error);
        }
    }, 60000);
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: false
        }
    });
    mainWindow.loadFile(path.join(__dirname, 'index.html'));
    // mainWindow.webContents.openDevTools();
    mainWindow.on('closed', () => { mainWindow = null; });
}

if (!gotSingleInstanceLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        focusMainWindow();
    });

    app.whenReady().then(() => {
      const userDataPath = app.getPath('userData');
      const dbPath = path.join(userDataPath, 'app_data.db');
      dbModule.init(dbPath);
      createWindow();
      app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

      mainWindow.webContents.on('did-finish-load', () => {
        autoUpdater.checkForUpdates();
      });

      startBellScheduler();
      startAutomationScheduler();

      // ✨ 魔法施展處：國王下令，啟動信使驛站，並交給它傳訊號角！ ✨
      serverModule.startServer(mainWindow);
    });
}

app.on('window-all-closed', () => {
  if (bellInterval) clearInterval(bellInterval);
  if (automationInterval) clearInterval(automationInterval);
  if (process.platform !== 'darwin') app.quit();
});
