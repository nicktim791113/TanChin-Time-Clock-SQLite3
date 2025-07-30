// main.js

const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const dbModule = require('./database');

log.transports.file.level = 'info';
log.info('App starting...');

let mainWindow;
let bellInterval;
let automationInterval;

// --- 萬能的寶庫請求處理中心 ---
ipcMain.handle('db-request', async (event, operation, ...args) => {
  if (typeof dbModule[operation] === 'function') {
    try {
      const result = await dbModule[operation](...args); 
      return { success: true, data: result };
    } catch (error) {
      log.error(`Database operation '${operation}' with args ${JSON.stringify(args)} failed:`, error);
      return { success: false, error: error.message };
    }
  }
  return { success: false, error: `Unknown database operation: ${operation}` };
});

// --- 魔法新增處：處理立即執行的任務 ---
ipcMain.handle('execute-task-now', async (event, task) => {
    try {
        await executeAutomationTask(task);
        return { success: true };
    } catch (error) {
        log.error(`Immediate task execution for task ID ${task.id} failed:`, error);
        return { success: false, error: error.message };
    }
});

// --- 皇家卷軸書記官 (檔案處理) ---
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

ipcMain.handle('open-csv-file', async () => {
  if (!mainWindow) return { success: false, error: '主視窗不存在' };
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: '選擇要匯入的檔案',
        filters: [
            { name: '支援的檔案', extensions: ['csv', 'json'] },
            { name: '所有檔案', extensions: ['*'] }
        ],
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

// --- 皇家守鐘人 ---
function startBellScheduler() {
  if (bellInterval) clearInterval(bellInterval);
  
  bellInterval = setInterval(async () => {
    try {
      const schedules = dbModule.loadBellSchedules(); 
      if (!schedules || schedules.length === 0) return;

      const now = new Date();
      const dayOfWeek = now.getDay();
      const currentTime = now.toTimeString().slice(0, 8);

      for (const schedule of schedules) {
        const scheduleTimeWithSeconds = `${schedule.time}:00`;

        if (schedule.enabled && schedule.days.includes(dayOfWeek.toString()) && scheduleTimeWithSeconds === currentTime) {
          
          const history = dbModule.loadBellHistory();
          const oneMinuteAgo = now.getTime() - 60000;
          const alreadyRang = history.some(h => h.scheduleId === schedule.id && h.timestamp > oneMinuteAgo);

          if (!alreadyRang) {
            log.info(`敲響鐘聲: ${schedule.title} at ${schedule.time}`);
            if (mainWindow) {
                mainWindow.webContents.send('play-sound', { 
                    sound: schedule.sound, 
                    duration: schedule.duration 
                });
            }
            dbModule.addBellHistory({ 
                timestamp: now.getTime(), 
                scheduleId: schedule.id, 
                time: schedule.time, 
                sound: schedule.sound 
            });
            if (mainWindow) {
                mainWindow.webContents.send('bell-history-updated');
            }
          }
        }
      }
    } catch (error) {
      log.error('響鈴排程器發生錯誤:', error);
    }
  }, 1000);
}

// ✨ 修改：AI 自動化排程核心，加入新目標與心靈感應 ✨
async function executeAutomationTask(task) {
    log.info(`Executing automation task: ${task.task_type} - ${task.target}`);
    try {
        let message = '';
        let status = 'info';
        let dateRangeStr = '';
        let shouldNotifyRenderer = false;
        let notificationType = '';
        let result;

        const today = new Date();
        let startTime, endTime;

        switch (task.target) {
            case 'last_week_records':
                const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
                endTime = new Date(new Date().setDate(today.getDate() - dayOfWeek));
                startTime = new Date(new Date(endTime).setDate(endTime.getDate() - 6));
                startTime.setHours(0, 0, 0, 0);
                endTime.setHours(23, 59, 59, 999);
                dateRangeStr = `上週_${startTime.toISOString().slice(0,10)}_to_${endTime.toISOString().slice(0,10)}`;
                break;
            case 'last_month_records':
                const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                startTime = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
                endTime = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);
                startTime.setHours(0, 0, 0, 0);
                endTime.setHours(23, 59, 59, 999);
                dateRangeStr = `上月_${startTime.toISOString().slice(0,7)}`;
                break;
            case 'manual_records': dateRangeStr = `手動補登紀錄`; break;
            case 'all_records': dateRangeStr = `全部打卡紀錄`; break;
            case 'all_employees': dateRangeStr = `所有人員資料`; break;
            case 'log': dateRangeStr = `系統日誌`; break;
        }

        if (task.task_type === 'export') {
            const desktopPath = app.getPath('desktop');
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
                    fileName = `人員總名冊_${today.toISOString().slice(0,10)}.csv`;
                    const filePath = path.join(desktopPath, fileName);
                    fs.writeFileSync(filePath, Buffer.concat([bom, Buffer.from(csvContent)]));
                    message = `任務成功：已將 ${employees.length} 筆人員資料匯出至桌面。`;
                    status = 'success';
                }
            // --- 魔法修改處 ---
            } else if (task.target === 'log') {
                const logs = dbModule.loadAutomationLog();
                 if (logs.length === 0) {
                    message = `任務執行完畢：沒有任何系統日誌可匯出。`;
                } else {
                    const headers = ['時間戳', '狀態', '訊息'];
                    const rows = logs.map(l => {
                        return [ `"${new Date(l.timestamp).toLocaleString()}"`, `"${l.status}"`, `"${l.message.replace(/"/g, '""')}"` ].join(',');
                    });
                    csvContent = headers.join(',') + '\r\n' + rows.join('\r\n');
                    fileName = `系統任務日誌_${today.toISOString().slice(0,10)}.csv`;
                    const filePath = path.join(desktopPath, fileName);
                    fs.writeFileSync(filePath, Buffer.concat([bom, Buffer.from(csvContent)]));
                    message = `任務成功：已將 ${logs.length} 筆系統日誌匯出至桌面。`;
                    status = 'success';
                }
            // --- 魔法修改處 ---
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
                    message = `任務執行完畢：範圍 [${dateRangeStr}] 無任何符合的打卡紀錄可匯出。`;
                } else {
                    const headers = ['工號', '姓名', '打卡日期', '打卡時間', '班別', '狀態', '來源'];
                    const rows = recordsToExport.map(r => {
                        const emp = employees.find(e => e.id === r.id) || { name: '未知員工' };
                        const d = new Date(r.timestamp);
                        return [ `"${r.id}"`, `"${emp.name}"`, `"${d.toLocaleDateString()}"`, `"${d.toLocaleTimeString()}"`, `"${r.shift}"`, `"${r.status}"`, `"${r.source || 'auto'}"` ].join(',');
                    });
                    csvContent = headers.join(',') + '\r\n' + rows.join('\r\n');
                    fileName = `考勤報表_${dateRangeStr}_${today.toISOString().slice(0,10)}.csv`;
                    const filePath = path.join(desktopPath, fileName);
                    fs.writeFileSync(filePath, Buffer.concat([bom, Buffer.from(csvContent)]));
                    message = `任務成功：已將 [${dateRangeStr}] 的 ${recordsToExport.length} 筆考勤紀錄匯出至桌面。`;
                    status = 'success';
                }
            }
        } else if (task.task_type === 'delete') {
            switch (task.target) {
                case 'last_week_records':
                case 'last_month_records':
                    result = dbModule.deletePunchRecordsByDateRange(startTime.getTime(), endTime.getTime());
                    message = `任務成功：已刪除 [${dateRangeStr}] 的 ${result.changes} 筆打卡紀錄。`;
                    if (result.changes > 0) { shouldNotifyRenderer = true; notificationType = 'punchRecords'; }
                    status = 'success';
                    break;
                case 'manual_records':
                    result = dbModule.deletePunchRecordsBySource('manual');
                    message = `任務成功：已刪除 ${result.changes} 筆手動補登紀錄。`;
                    if (result.changes > 0) { shouldNotifyRenderer = true; notificationType = 'punchRecords'; }
                    status = 'success';
                    break;
                case 'all_records':
                    result = dbModule.deletePunchRecordsByDateRange(0, Date.now());
                    message = `任務成功：已刪除全部 ${result.changes} 筆打卡紀錄。`;
                    if (result.changes > 0) { shouldNotifyRenderer = true; notificationType = 'punchRecords'; }
                    status = 'success';
                    break;
                case 'all_employees':
                    result = dbModule.deleteAllEmployees();
                    message = `任務成功：已刪除所有 ${result.changes} 位人員資料。此操作無法復原。`;
                    if (result.changes > 0) { shouldNotifyRenderer = true; notificationType = 'employees'; }
                    status = 'success';
                    break;
                case 'log':
                    dbModule.clearAutomationLog();
                    message = `任務成功：已刪除所有系統任務日誌。`;
                    status = 'success';
                    break;
            }
        }
        
        dbModule.addAutomationLog({ timestamp: Date.now(), message, status });
        log.info(message);

        if (mainWindow) {
            // 無論如何都通知渲染程序更新日誌
            mainWindow.webContents.send('data-updated', { type: 'automationLog' });
            if (shouldNotifyRenderer) {
                mainWindow.webContents.send('data-updated', { type: notificationType });
            }
        }

    } catch (error) {
        log.error('Automation task execution failed:', error);
        dbModule.addAutomationLog({ timestamp: Date.now(), message: `任務失敗: ${error.message}`, status: 'error' });
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

app.whenReady().then(() => {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'app_data.db');
  dbModule.init(dbPath); 
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  autoUpdater.checkForUpdatesAndNotify();
  startBellScheduler();
  startAutomationScheduler();
});

app.on('window-all-closed', () => {
  if (bellInterval) clearInterval(bellInterval);
  if (automationInterval) clearInterval(automationInterval);
  if (process.platform !== 'darwin') app.quit();
});
