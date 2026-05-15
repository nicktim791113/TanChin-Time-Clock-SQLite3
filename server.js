const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { app, dialog } = require('electron');
const dbModule = require('./database');
const {
  ATTENDANCE_EXPORT_FIELD_DEFINITIONS,
  DEFAULT_ATTENDANCE_EXPORT_TEMPLATE_ID,
  buildAttendanceExportCsv,
  getAttendanceExportTemplateDefinitions,
  isAttendanceExportTarget,
  normalizeAttendanceExportCustomFields,
  normalizeAttendanceExportTemplateId
} = require('./attendance-export');

const PORT = 3000;
const DEFAULT_ADMIN_PASSWORD = 'TC5128';
const DEFAULT_SYSTEM_PASSWORD = '0000';
const DEFAULT_BROWSER_HERO_DESCRIPTION = '透過瀏覽器快速查看打卡資料、管理設定與系統狀態。';
const DEFAULT_MAIN_TITLE = '震欣科技AI作息系統';
const DEFAULT_SUBTITLE = '您的 AI 智慧好夥伴';
const DEFAULT_BROWSER_SECURITY_SETTINGS = {
  deviceBindingEnabled: true,
  gpsRequiredOnPunch: true,
  maxGpsAccuracyMeters: 300
};
const BROWSER_CLIENT_DIR = path.join(__dirname, 'browser-client');

let serverInstance = null;
let mainWindowRef = null;
let serverStartedAt = null;
let auditArchiveInterval = null;
let auditArchiveInProgress = false;

const browserSessions = new Map();
const browserEventClients = new Map();
const DEFAULT_AUDIT_LOG_RETENTION_DAYS = 180;
const AUDIT_ARCHIVE_BATCH_SIZE = 2000;
const AUDIT_ARCHIVE_INTERVAL_MS = 6 * 60 * 60 * 1000;

const SOURCE_LABELS = {
  auto: '卡號',
  password: '密碼',
  manual: '手動補登',
  api: '外部裝置',
  browser: '瀏覽器'
};

const THEME_STYLE_DEFAULTS = {
  bgDayStart: '#f5fbff',
  bgDayEnd: '#e8f2f8',
  bgNightStart: '#edf5fa',
  bgNightEnd: '#dce9f3',
  dayStartTime: '05:00',
  nightStartTime: '17:00',
  mainTitleColor: '#18384a',
  btnAdminBg: '#edf3f7',
  btnAdminText: '#0f556f',
  btnReportBg: '#e1f4fb',
  btnReportText: '#0d607a',
  btnAiBg: '#e6efff',
  btnAiText: '#154f78',
  clockBg: '#dff2fb',
  clockText: '#164b67',
  pageBgImage: '',
  titleBgImage: '',
  clockBgImage: '',
  clockBgPos: 'center',
  clockSymbolsLeft: '',
  clockSymbolsRight: '',
  blinkEnabled: false,
  blinkDayColor: '#fbc02d',
  blinkNightColor: '#29d9ff',
  punchEffect: 'none',
  punchFallContent: '★,☆',
  punchFlashContent: 'OK'
};

const API_ROUTE_CATALOG = [
  { category: '外部 API', method: 'GET', path: '/api/employees', auth: 'API Key', description: '查詢全部員工名冊' },
  { category: '外部 API', method: 'GET', path: '/api/employees/:id', auth: 'API Key', description: '查詢單一員工資料' },
  { category: '外部 API', method: 'GET', path: '/api/records', auth: 'API Key', description: '查詢全部打卡紀錄' },
  { category: '外部 API', method: 'GET', path: '/api/records/range?start=YYYY-MM-DD&end=YYYY-MM-DD', auth: 'API Key', description: '依日期區間查詢打卡紀錄' },
  { category: '外部 API', method: 'GET', path: '/api/records/employee/:id', auth: 'API Key', description: '查詢單一員工的打卡紀錄' },
  { category: '外部 API', method: 'POST', path: '/api/punch', auth: 'API Key', description: '外部裝置送出卡號打卡' },

  { category: '瀏覽器入口', method: 'GET', path: '/api/browser/health', auth: '公開', description: '查詢 Express 服務健康狀態摘要' },
  { category: '瀏覽器入口', method: 'POST', path: '/api/browser/login', auth: '公開', description: '瀏覽器入口登入，取得 Session Token' },
  { category: '瀏覽器入口', method: 'GET', path: '/api/browser/dashboard', auth: 'Session', description: '取得目前登入角色的儀表板資料' },
  { category: '瀏覽器入口', method: 'GET', path: '/api/browser/events?token=...', auth: 'Session', description: '即時同步事件流（SSE）' },
  { category: '瀏覽器入口', method: 'POST', path: '/api/browser/punch', auth: '員工', description: '瀏覽器版員工自行打卡' },
  { category: '瀏覽器入口', method: 'POST', path: '/api/browser/employee/leave/request', auth: '員工', description: '員工送出請假申請' },
  { category: '瀏覽器入口', method: 'POST', path: '/api/browser/employee/leave/withdraw', auth: '員工', description: '員工撤回尚未終審的請假申請' },
  { category: '瀏覽器入口', method: 'POST', path: '/api/browser/employee/leave/supervisor-decision', auth: '員工主管', description: '主管審核部門員工請假申請' },
  { category: '瀏覽器入口', method: 'POST', path: '/api/browser/logout', auth: 'Session', description: '登出目前瀏覽器 Session' },

  { category: '管理者 API', method: 'POST', path: '/api/browser/admin/employees/save', auth: '管理者', description: '整批覆寫員工資料' },
  { category: '管理者 API', method: 'POST', path: '/api/browser/admin/employee/save', auth: '管理者', description: '新增或更新單一員工' },
  { category: '管理者 API', method: 'POST', path: '/api/browser/admin/card-reader-test-log', auth: '管理者', description: '寫入讀卡測試診斷紀錄' },
  { category: '管理者 API', method: 'POST', path: '/api/browser/admin/employee/delete', auth: '管理者', description: '刪除單一員工' },
  { category: '管理者 API', method: 'POST', path: '/api/browser/admin/shifts/save', auth: '管理者', description: '儲存班別設定' },
  { category: '管理者 API', method: 'POST', path: '/api/browser/admin/manual-punch', auth: '管理者', description: '建立手動補登打卡' },
  { category: '管理者 API', method: 'POST', path: '/api/browser/admin/reports/query', auth: '管理者', description: '查詢考勤報表資料' },
  { category: '管理者 API', method: 'POST', path: '/api/browser/admin/reports/export', auth: '管理者', description: '匯出考勤報表 CSV' },
  { category: '管理者 API', method: 'POST', path: '/api/browser/admin/leave/final-decision', auth: '管理者', description: '管理部終審請假申請' },
  { category: '管理者 API', method: 'POST', path: '/api/browser/admin/leave-types/save', auth: '管理者', description: '儲存請假假別設定' },
  { category: '管理者 API', method: 'POST', path: '/api/browser/admin/leave-routes/save', auth: '管理者', description: '儲存請假主管審核路徑' },
  { category: '管理者 API', method: 'POST', path: '/api/browser/admin/data-settings', auth: '管理者', description: '更新主畫面標題與副標題' },
  { category: '管理者 API', method: 'POST', path: '/api/browser/admin/change-admin-password', auth: '管理者', description: '變更管理者密碼' },
  { category: '管理者 API', method: 'POST', path: '/api/browser/admin/greetings/save', auth: '管理者', description: '儲存問候語設定' },
  { category: '管理者 API', method: 'POST', path: '/api/browser/admin/bell-schedules/save', auth: '管理者', description: '儲存響鈴排程' },
  { category: '管理者 API', method: 'POST', path: '/api/browser/admin/custom-sounds/save', auth: '管理者', description: '儲存自訂聲音清單' },
  { category: '管理者 API', method: 'POST', path: '/api/browser/admin/custom-sounds/upload', auth: '管理者', description: '上傳自訂聲音檔' },
  { category: '管理者 API', method: 'POST', path: '/api/browser/admin/bell-history/clear', auth: '管理者', description: '清空響鈴歷史' },
  { category: '管理者 API', method: 'POST', path: '/api/browser/admin/special-effects/save', auth: '管理者', description: '儲存節日特效' },
  { category: '管理者 API', method: 'POST', path: '/api/browser/admin/theme-schedules/save', auth: '管理者', description: '儲存主題排程' },
  { category: '管理者 API', method: 'POST', path: '/api/browser/admin/custom-themes/save', auth: '管理者', description: '儲存自訂主題' },
  { category: '管理者 API', method: 'POST', path: '/api/browser/admin/custom-themes/upload-image', auth: '管理者', description: '上傳主題背景圖' },

  { category: '開發人員 API', method: 'POST', path: '/api/browser/developer/automation-tasks/save', auth: '開發人員', description: '儲存自動化任務清單' },
  { category: '開發人員 API', method: 'POST', path: '/api/browser/developer/automation-tasks/execute', auth: '開發人員', description: '立即執行自動化任務' },
  { category: '開發人員 API', method: 'POST', path: '/api/browser/developer/audit-logs/query', auth: '開發人員', description: '查詢操作稽核紀錄' },
  { category: '開發人員 API', method: 'POST', path: '/api/browser/developer/audit-archive-directory/select', auth: '開發人員', description: '開啟稽核封存資料夾選擇器' },
  { category: '開發人員 API', method: 'POST', path: '/api/browser/developer/audit-archive-settings/save', auth: '開發人員', description: '儲存稽核封存設定' },
  { category: '開發人員 API', method: 'POST', path: '/api/browser/developer/audit-archive/run', auth: '開發人員', description: '立即執行稽核封存' },
  { category: '開發人員 API', method: 'POST', path: '/api/browser/developer/attendance-export-settings/save', auth: '開發人員', description: '儲存考勤報表匯出欄位設定' },
  { category: '開發人員 API', method: 'POST', path: '/api/browser/developer/automation-log/clear', auth: '開發人員', description: '清空自動化日誌' },
  { category: '開發人員 API', method: 'POST', path: '/api/browser/developer/impersonation/settings', auth: '開發人員', description: '啟用或停用開發人員身份切換' },
  { category: '開發人員 API', method: 'POST', path: '/api/browser/developer/impersonation/start', auth: '開發人員', description: '切換到管理者或指定員工測試身份' },
  { category: '開發人員 API', method: 'POST', path: '/api/browser/developer/impersonation/stop', auth: '開發人員', description: '返回原本的開發人員身份' },
  { category: '開發人員 API', method: 'POST', path: '/api/browser/developer/change-system-password', auth: '開發人員', description: '變更系統密碼' },

  { category: '靜態入口', method: 'GET', path: '/', auth: '公開', description: '瀏覽器版入口導向 /browser/' },
  { category: '靜態入口', method: 'GET', path: '/browser/', auth: '公開', description: '瀏覽器版前端首頁' },
  { category: '靜態入口', method: 'GET', path: '/user-media/sounds/:file', auth: '公開', description: '自訂聲音檔靜態路徑' },
  { category: '靜態入口', method: 'GET', path: '/user-media/themes/:file', auth: '公開', description: '主題圖片靜態路徑' }
];

API_ROUTE_CATALOG.push(
  { category: '開發人員 API', method: 'POST', path: '/api/browser/developer/automation-export-directory/select', auth: '開發人員', description: '開啟自動化匯出資料夾選擇器' },
  { category: '開發人員 API', method: 'POST', path: '/api/browser/developer/automation-export-directory/save', auth: '開發人員', description: '儲存自動化匯出的預設資料夾' }
);

function ensureDirectory(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true });
  }
  return directoryPath;
}

function getUserDataPath() {
  return app.getPath('userData');
}

function getCustomSoundsDirectory() {
  return ensureDirectory(path.join(getUserDataPath(), 'CustomSounds'));
}

function getThemeImagesDirectory() {
  return ensureDirectory(path.join(getUserDataPath(), 'ThemeImages'));
}

function toFileSystemPath(filePath) {
  if (!filePath) return '';
  if (!filePath.startsWith('file://')) return filePath;

  let decoded = decodeURIComponent(filePath.replace('file://', ''));
  if (/^\/[A-Za-z]:/.test(decoded)) decoded = decoded.slice(1);
  return decoded.replace(/\//g, path.sep);
}

function toFileUri(filePath) {
  const normalized = path.resolve(filePath).replace(/\\/g, '/');
  return `file://${normalized}`;
}

function getBrowserMediaUrl(filePath) {
  const resolvedPath = toFileSystemPath(filePath);
  if (!resolvedPath) return '';

  const absolutePath = path.resolve(resolvedPath);
  const soundsDir = path.resolve(getCustomSoundsDirectory());
  const themesDir = path.resolve(getThemeImagesDirectory());

  if (absolutePath.startsWith(soundsDir)) {
    return `/user-media/sounds/${encodeURIComponent(path.basename(absolutePath))}`;
  }
  if (absolutePath.startsWith(themesDir)) {
    return `/user-media/themes/${encodeURIComponent(path.basename(absolutePath))}`;
  }
  return '';
}

function normalizeBoolean(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function formatLocalDate(date, format = 'YYYY-MM-DD') {
  const pad = (value) => String(value).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  if (format === 'YYYY-MM') return `${year}-${month}`;
  return `${year}-${month}-${day}`;
}

function formatLocalTime(date) {
  return date.toLocaleTimeString('zh-TW', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function getSettingValue(key, fallbackValue) {
  const value = dbModule.getSetting(key);
  return value === null || value === undefined || value === '' ? fallbackValue : value;
}

function getAttendanceExportCustomFields() {
  return normalizeAttendanceExportCustomFields(
    getSettingValue('attendanceExportCustomFields', null)
  );
}

function getExternalApiAccessSettings() {
  const apiKey = String(getSettingValue('externalApiKey', '') || '').trim();
  return {
    enabled: normalizeBoolean(getSettingValue('externalApiEnabled', false)),
    apiKey,
    keyConfigured: Boolean(apiKey)
  };
}

function isDeveloperImpersonationEnabled() {
  return normalizeBoolean(getSettingValue('developerImpersonationEnabled', false));
}

function getAttendanceExportSettings() {
  const customFields = getAttendanceExportCustomFields();
  return {
    defaultTemplateId: DEFAULT_ATTENDANCE_EXPORT_TEMPLATE_ID,
    customFields,
    fieldCatalog: ATTENDANCE_EXPORT_FIELD_DEFINITIONS,
    templates: getAttendanceExportTemplateDefinitions(customFields)
  };
}

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

function getAutomationExportDirectorySettings() {
  const defaultDirectory = normalizeExportDirectoryPath(getSettingValue('automationExportDirectory', ''));
  const fallbackDirectory = app.getPath('desktop');
  return {
    defaultDirectory,
    fallbackDirectory,
    effectiveDirectory: defaultDirectory || fallbackDirectory,
    usingFallback: !defaultDirectory
  };
}

function normalizeRetentionDays(value, fallbackValue = DEFAULT_AUDIT_LOG_RETENTION_DAYS) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallbackValue;
  return Math.max(30, Math.min(Math.floor(numericValue), 3650));
}

function normalizeArchiveDirectoryPath(directoryPath) {
  const trimmed = String(directoryPath || '').trim();
  if (!trimmed) return '';
  if (!path.isAbsolute(trimmed)) {
    throw new Error('封存資料夾必須是絕對路徑。');
  }
  const resolvedPath = path.resolve(trimmed);
  if (fs.existsSync(resolvedPath) && !fs.statSync(resolvedPath).isDirectory()) {
    throw new Error(`封存路徑不是資料夾：${resolvedPath}`);
  }
  return resolvedPath;
}

function getAuditArchiveDefaultDirectory() {
  return path.join(getUserDataPath(), 'AuditArchives');
}

function getAuditArchiveSettings() {
  const retentionDays = normalizeRetentionDays(getSettingValue('auditLogRetentionDays', DEFAULT_AUDIT_LOG_RETENTION_DAYS));
  const defaultDirectory = normalizeArchiveDirectoryPath(getSettingValue('auditArchiveDirectory', ''));
  const fallbackDirectory = getAuditArchiveDefaultDirectory();
  return {
    retentionDays,
    defaultDirectory,
    fallbackDirectory,
    effectiveDirectory: defaultDirectory || fallbackDirectory,
    usingFallback: !defaultDirectory
  };
}

function mapAuditArchiveRecord(archive) {
  return {
    ...archive,
    createdAtText: archive.created_at
      ? new Date(archive.created_at).toLocaleString('zh-TW', { hour12: false })
      : '-',
    startText: archive.start_timestamp
      ? new Date(archive.start_timestamp).toLocaleString('zh-TW', { hour12: false })
      : '-',
    endText: archive.end_timestamp
      ? new Date(archive.end_timestamp).toLocaleString('zh-TW', { hour12: false })
      : '-',
    fileName: path.basename(archive.file_path || '')
  };
}

function getAutomationExportDirectoryInfo(task = {}) {
  const taskDirectory = normalizeExportDirectoryPath(task.export_directory);
  if (taskDirectory) {
    return { directoryPath: taskDirectory, sourceLabel: '任務自訂資料夾' };
  }

  const settings = getAutomationExportDirectorySettings();
  if (settings.defaultDirectory) {
    return { directoryPath: settings.defaultDirectory, sourceLabel: '預設匯出資料夾' };
  }

  return { directoryPath: settings.fallbackDirectory, sourceLabel: '桌面資料夾' };
}

async function openDirectoryPicker(defaultPath = '') {
  const normalizedDefaultPath = String(defaultPath || '').trim();
  const options = {
    title: '選擇資料夾',
    properties: ['openDirectory', 'createDirectory']
  };
  if (normalizedDefaultPath && fs.existsSync(normalizedDefaultPath)) {
    options.defaultPath = normalizedDefaultPath;
  }

  const dialogInvoker = mainWindowRef && !mainWindowRef.isDestroyed?.()
    ? dialog.showOpenDialog.bind(dialog, mainWindowRef)
    : dialog.showOpenDialog.bind(dialog);
  const result = await dialogInvoker(options);
  if (result.canceled || !result.filePaths?.length) {
    return { success: false, canceled: true, message: '使用者取消選擇' };
  }
  return { success: true, path: path.resolve(result.filePaths[0]) };
}

function normalizePositiveInteger(value, fallbackValue, { min = 1, max = 10000 } = {}) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallbackValue;
  return Math.min(max, Math.max(min, Math.round(numericValue)));
}

function normalizeBrowserSecuritySettings(settings = {}) {
  return {
    deviceBindingEnabled: normalizeBoolean(settings.deviceBindingEnabled ?? DEFAULT_BROWSER_SECURITY_SETTINGS.deviceBindingEnabled),
    gpsRequiredOnPunch: normalizeBoolean(settings.gpsRequiredOnPunch ?? DEFAULT_BROWSER_SECURITY_SETTINGS.gpsRequiredOnPunch),
    maxGpsAccuracyMeters: normalizePositiveInteger(
      settings.maxGpsAccuracyMeters ?? DEFAULT_BROWSER_SECURITY_SETTINGS.maxGpsAccuracyMeters,
      DEFAULT_BROWSER_SECURITY_SETTINGS.maxGpsAccuracyMeters,
      { min: 30, max: 5000 }
    )
  };
}

function getBrowserSecuritySettings() {
  return normalizeBrowserSecuritySettings(
    getSettingValue('browserSecuritySettings', DEFAULT_BROWSER_SECURITY_SETTINGS)
  );
}

function hashDeviceToken(token) {
  return crypto.createHash('sha256').update(String(token || '').trim()).digest('hex');
}

function buildDefaultDeviceName(deviceInfo = {}) {
  const platform = String(deviceInfo.platform || '').trim();
  const browserName = String(deviceInfo.browserName || '').trim();
  const parts = [platform, browserName].filter(Boolean);
  return parts.join(' / ') || 'Browser Device';
}

function normalizeClientDeviceInfo(deviceInfo = {}) {
  const deviceId = String(deviceInfo.deviceId || '').trim().slice(0, 160);
  const deviceToken = String(deviceInfo.deviceToken || '').trim().slice(0, 256);
  const platform = String(deviceInfo.platform || '').trim().slice(0, 80);
  const browserName = String(deviceInfo.browserName || '').trim().slice(0, 80);
  const deviceName = String(deviceInfo.deviceName || '').trim().slice(0, 120) || buildDefaultDeviceName({ platform, browserName });
  return {
    deviceId,
    deviceToken,
    platform,
    browserName,
    deviceName
  };
}

function formatDeviceDisplayName(device = {}) {
  return String(device.device_name || '').trim() || buildDefaultDeviceName(device);
}

function normalizeBrowserLocation(location = {}) {
  if (!location || typeof location !== 'object') return null;
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  const accuracy = Number(location.accuracy);
  const capturedAt = Number(location.capturedAt) || Date.now();
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  if (!Number.isFinite(accuracy) || accuracy <= 0) return null;
  return {
    latitude,
    longitude,
    accuracy,
    capturedAt
  };
}

function formatLocationSummary(location = {}) {
  if (!Number.isFinite(Number(location.latitude)) || !Number.isFinite(Number(location.longitude))) {
    return '未提供定位';
  }
  const accuracy = Number(location.accuracy);
  const accuracyText = Number.isFinite(accuracy) ? `±${Math.round(accuracy)}m` : '精度未知';
  return `${Number(location.latitude).toFixed(5)}, ${Number(location.longitude).toFixed(5)} (${accuracyText})`;
}

function normalizePunchStatus(status) {
  return String(status || '正常').trim();
}

function isDuplicatePunchRecord(record = {}) {
  const status = normalizePunchStatus(record.status);
  return status === '重複打卡' || status === 'duplicate';
}

function getPunchRiskFlags(record = {}) {
  return Array.isArray(record.risk_flags) ? record.risk_flags : [];
}

function isNormalPunchRecord(record = {}) {
  const status = normalizePunchStatus(record.status);
  const hasRiskFlags = getPunchRiskFlags(record).length > 0;
  return !isDuplicatePunchRecord(record)
    && !hasRiskFlags
    && (!status || status === '正常' || status === 'normal');
}

function isAbnormalPunchRecord(record = {}) {
  return !isDuplicatePunchRecord(record) && !isNormalPunchRecord(record);
}

function getPunchAttendanceStatusText(record = {}) {
  if (isDuplicatePunchRecord(record)) return '重複打卡';
  if (isNormalPunchRecord(record)) return '正常';

  const status = normalizePunchStatus(record.status);
  if (status && status !== '正常' && status !== 'normal') return status;
  return '異常';
}

function mapEmployeeDeviceForDashboard(device, employeeMap = new Map()) {
  const employee = employeeMap.get(device.employee_id) || null;
  const location = {
    latitude: device.last_gps_lat,
    longitude: device.last_gps_lng,
    accuracy: device.last_gps_accuracy
  };
  return {
    ...device,
    employeeName: employee?.name || '',
    employeeDepartment: employee?.department || '',
    deviceDisplayName: formatDeviceDisplayName(device),
    createdAtText: device.created_at ? new Date(device.created_at).toLocaleString('zh-TW', { hour12: false }) : '-',
    lastSeenText: device.last_seen_at ? new Date(device.last_seen_at).toLocaleString('zh-TW', { hour12: false }) : '-',
    lastLocationText: device.last_gps_at ? formatLocationSummary(location) : '尚未記錄 GPS',
    lastLocationAtText: device.last_gps_at ? new Date(device.last_gps_at).toLocaleString('zh-TW', { hour12: false }) : '-'
  };
}

function sanitizeEmployeeForProfile(employee) {
  return {
    id: employee.id,
    name: employee.name,
    gender: employee.gender,
    nationality: employee.nationality,
    department: employee.department,
    job_title: employee.job_title,
    national_id: employee.national_id,
    birth_date: employee.birth_date,
    hire_date: employee.hire_date,
    termination_date: employee.termination_date,
    notes: employee.notes,
    bank_account: employee.bank_account,
    mobile_phone: employee.mobile_phone,
    emergency_contact: employee.emergency_contact,
    emergency_phone: employee.emergency_phone,
    contact_address: employee.contact_address,
    registered_address: employee.registered_address,
    family_status: employee.family_status
  };
}

function formatPunchRecord(record) {
  const date = new Date(record.timestamp);
  const typeText = record.type === 'in' ? '上班' : '下班';
  const attendanceStatusText = getPunchAttendanceStatusText(record);
  const statusText = isDuplicatePunchRecord(record)
    ? '重複打卡'
    : typeText;

  return {
    ...record,
    dateText: formatLocalDate(date),
    timeText: formatLocalTime(date),
    typeText,
    attendanceStatusText,
    statusText,
    sourceText: SOURCE_LABELS[record.source] || record.source || '卡號'
  };
}

function getAllEmployees() {
  return dbModule.loadEmployees();
}

function getAllPunchRecords() {
  return dbModule.loadPunchRecords();
}

function getEmployeeById(employeeId) {
  return getAllEmployees().find((employee) => employee.id === employeeId) || null;
}

function getEmployeeByCard(cardId) {
  const normalizedCardId = String(cardId || '').trim();
  return getAllEmployees().find((employee) => String(employee.card || '').trim() === normalizedCardId) || null;
}

function getEmployeeByAnyCredential(keyword) {
  const normalizedKeyword = String(keyword || '').trim();
  return getAllEmployees().find((employee) =>
    String(employee.id || '').trim() === normalizedKeyword ||
    String(employee.card || '').trim() === normalizedKeyword ||
    String(employee.password || '').trim() === normalizedKeyword
  ) || null;
}

function getLastValidPunch(employeeId) {
  return getAllPunchRecords()
    .filter((record) => record.id === employeeId && record.status !== '重複打卡')
    .sort((a, b) => b.timestamp - a.timestamp)[0] || null;
}

function determinePunchType(employeeId, punchDate = new Date()) {
  const dayStart = new Date(punchDate);
  dayStart.setHours(0, 0, 0, 0);
  const validPunches = getAllPunchRecords().filter((record) =>
    record.id === employeeId &&
    record.timestamp >= dayStart.getTime() &&
    record.status !== '重複打卡'
  );
  return validPunches.length % 2 === 0 ? 'in' : 'out';
}

function findShiftForDate(date = new Date()) {
  const shifts = dbModule.loadShifts();
  if (!shifts.length) return null;

  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const toMinutes = (timeText) => {
    const [hours, minutes] = String(timeText || '00:00').split(':').map(Number);
    return (hours * 60) + minutes;
  };

  for (const shift of shifts) {
    const startMinutes = toMinutes(shift.start);
    const endMinutes = toMinutes(shift.end);

    if (endMinutes < startMinutes) {
      if (currentMinutes >= startMinutes || currentMinutes < endMinutes) return shift;
    } else if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
      return shift;
    }
  }

  let nextShift = null;
  let smallestDifference = Number.POSITIVE_INFINITY;
  for (const shift of shifts) {
    const startMinutes = toMinutes(shift.start);
    let difference = startMinutes - currentMinutes;
    if (difference < 0) difference += 24 * 60;
    if (difference < smallestDifference) {
      smallestDifference = difference;
      nextShift = shift;
    }
  }
  return nextShift;
}

function createPunchRecord(employee, options = {}) {
  const timestamp = options.timestamp || Date.now();
  const source = options.source || 'browser';
  const shiftName = options.shift || findShiftForDate(new Date(timestamp))?.name || '未指定班別';
  const lastValidPunch = getLastValidPunch(employee.id);
  const securityFields = {
    ip_address: options.ip_address || null,
    user_agent: options.user_agent || null,
    device_id: options.device_id || null,
    device_name: options.device_name || null,
    gps_lat: options.gps_lat ?? null,
    gps_lng: options.gps_lng ?? null,
    gps_accuracy: options.gps_accuracy ?? null,
    gps_captured_at: options.gps_captured_at ?? null,
    gps_status: options.gps_status || null,
    risk_flags: Array.isArray(options.risk_flags) ? options.risk_flags : []
  };

  if (lastValidPunch && Math.abs(timestamp - lastValidPunch.timestamp) < 60 * 1000) {
    if (!options.allowDuplicateRecord) {
      const duplicateError = new Error(withSupportCode('P103', `${employee.name} 在 1 分鐘內已打過卡，請稍後再試。`));
      duplicateError.statusCode = 409;
      throw duplicateError;
    }

    const duplicateRecord = {
      id: employee.id,
      timestamp,
      type: lastValidPunch.type,
      shift: shiftName,
      status: '重複打卡',
      source,
      ...securityFields
    };
    dbModule.addPunchRecord(duplicateRecord);
    return { record: duplicateRecord, duplicate: true };
  }

  const type = options.type || determinePunchType(employee.id, new Date(timestamp));
  const record = {
    id: employee.id,
    timestamp,
    type,
    shift: shiftName,
    status: options.status || '正常',
    source,
    ...securityFields
  };
  dbModule.addPunchRecord(record);
  return { record, duplicate: false };
}

function getEmployeeRecentRecords(employeeId, days = 7) {
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  startDate.setDate(startDate.getDate() - (days - 1));

  return getAllPunchRecords()
    .filter((record) => record.id === employeeId && record.timestamp >= startDate.getTime())
    .sort((a, b) => b.timestamp - a.timestamp)
    .map(formatPunchRecord);
}

function buildAdminAttendanceReport(input = {}) {
  const employeeId = String(input.employeeId || '').trim();
  const startDate = String(input.startDate || '').trim();
  const endDate = String(input.endDate || '').trim();

  if (!startDate || !endDate) {
    const error = new Error('請選擇開始與結束日期。');
    error.statusCode = 400;
    throw error;
  }

  const rangeStart = new Date(`${startDate}T00:00:00`);
  const rangeEnd = new Date(`${endDate}T23:59:59.999`);
  if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) {
    const error = new Error('日期格式不正確，請重新選擇。');
    error.statusCode = 400;
    throw error;
  }
  if (rangeStart.getTime() > rangeEnd.getTime()) {
    const error = new Error('開始日期不能晚於結束日期。');
    error.statusCode = 400;
    throw error;
  }

  const employees = getAllEmployees();
  const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));
  const selectedEmployee = employeeId ? employeeMap.get(employeeId) : null;
  if (employeeId && !selectedEmployee) {
    const error = new Error('找不到指定的員工資料。');
    error.statusCode = 404;
    throw error;
  }

  const punchRecords = getAllPunchRecords()
    .filter((record) => record.timestamp >= rangeStart.getTime() && record.timestamp <= rangeEnd.getTime())
    .filter((record) => !employeeId || record.id === employeeId)
    .sort((a, b) => b.timestamp - a.timestamp)
    .map((record) => {
      const employee = employeeMap.get(record.id) || {};
      const formatted = formatPunchRecord(record);
      return {
        employeeId: record.id,
        employeeName: employee.name || '未知員工',
        department: employee.department || '',
        jobTitle: employee.job_title || '',
        shift: record.shift || '',
        timestamp: record.timestamp,
        dateText: formatted.dateText,
        timeText: formatted.timeText,
        type: record.type,
        typeText: formatted.typeText,
        status: record.status || '正常',
        attendanceStatusText: formatted.attendanceStatusText,
        source: record.source || '',
        sourceText: formatted.sourceText
      };
    });
  const leaveTypes = dbModule.loadLeaveTypes();
  const leaveLookup = buildLeaveLookup(employees, leaveTypes);
  const leaveRecords = dbModule.queryLeaveRequests({ status: 'approved', limit: 500 })
    .filter((request) => request.start_at <= rangeEnd.getTime() && request.end_at >= rangeStart.getTime())
    .filter((request) => !employeeId || request.employee_id === employeeId)
    .map((request) => {
      const employee = employeeMap.get(request.employee_id) || {};
      const formattedLeave = formatLeaveRequestForDashboard(request, leaveLookup);
      return {
        employeeId: request.employee_id,
        employeeName: employee.name || '未知員工',
        department: employee.department || '',
        jobTitle: employee.job_title || '',
        shift: '請假',
        timestamp: request.start_at,
        dateText: formatLocalDate(new Date(request.start_at)),
        timeText: `${formatLocalTime(new Date(request.start_at))} ~ ${formatLocalTime(new Date(request.end_at))}`,
        type: 'leave',
        typeText: `請假：${formattedLeave.leaveTypeName}`,
        status: '已核准請假',
        attendanceStatusText: '已核准請假',
        source: 'leave',
        sourceText: '請假模組',
        leaveRequestId: request.id,
        durationHours: request.duration_hours
      };
    });
  const records = [...punchRecords, ...leaveRecords].sort((a, b) => b.timestamp - a.timestamp);

  return {
    filters: {
      employeeId,
      employeeName: selectedEmployee?.name || '',
      startDate,
      endDate
    },
    summary: {
      recordCount: records.length,
      validCount: records.filter((record) => record.attendanceStatusText === '正常').length,
      abnormalCount: records.filter((record) =>
        record.attendanceStatusText !== '正常' &&
        record.attendanceStatusText !== '重複打卡' &&
        record.attendanceStatusText !== '已核准請假'
      ).length,
      leaveCount: records.filter((record) => record.attendanceStatusText === '已核准請假').length,
      duplicateCount: records.filter((record) => record.attendanceStatusText === '重複打卡').length,
      employeeCount: new Set(records.map((record) => record.employeeId)).size,
      inCount: records.filter((record) => record.type === 'in').length,
      outCount: records.filter((record) => record.type === 'out').length
    },
    records
  };
}

const LEAVE_STATUS_LABELS = {
  pending_supervisor: '主管審核中',
  pending_admin: '管理部複核中',
  approved: '已核准',
  rejected: '已駁回',
  withdrawn: '已撤回',
  cancelled: '已取消'
};

function getLeaveStatusText(status) {
  return LEAVE_STATUS_LABELS[status] || status || '-';
}

function formatDateTimeText(timestamp) {
  if (!timestamp) return '-';
  const date = new Date(timestamp);
  return `${formatLocalDate(date)} ${formatLocalTime(date)}`;
}

function normalizeLeaveTypePayload(type = {}, index = 0) {
  const id = String(type.id || type.name || `leave_${Date.now()}_${index}`).trim();
  return {
    id,
    name: String(type.name || id).trim(),
    description: String(type.description || '').trim(),
    unit: String(type.unit || 'hour').trim(),
    requires_attachment: normalizeBoolean(type.requires_attachment ?? type.requiresAttachment),
    deducts_balance: normalizeBoolean(type.deducts_balance ?? type.deductsBalance),
    paid: normalizeBoolean(type.paid),
    enabled: type.enabled === false || type.enabled === 0 || type.enabled === '0' || type.enabled === 'false' ? false : true,
    display_order: Number(type.display_order ?? type.displayOrder ?? index * 10) || 0
  };
}

function normalizeLeaveRoutePayload(route = {}) {
  return {
    id: Number(route.id) || null,
    department: String(route.department || '').trim(),
    supervisor_id: String(route.supervisor_id ?? route.supervisorId ?? '').trim(),
    enabled: route.enabled === false || route.enabled === 0 || route.enabled === '0' || route.enabled === 'false' ? false : true
  };
}

function parseLeaveDateTime(dateText, timeText, fallbackTime) {
  const dateValue = String(dateText || '').trim();
  const timeValue = String(timeText || fallbackTime || '00:00').trim();
  const timestamp = new Date(`${dateValue}T${timeValue}`).getTime();
  if (!dateValue || Number.isNaN(timestamp)) {
    throw createHttpError('請輸入有效的請假日期與時間。', 400);
  }
  return timestamp;
}

function calculateLeaveDurationHours(startAt, endAt, submittedHours) {
  const submitted = Number(submittedHours);
  if (Number.isFinite(submitted) && submitted > 0) return Math.round(submitted * 100) / 100;
  return Math.max(0, Math.round(((Number(endAt) - Number(startAt)) / 36_000) / 100));
}

function getLeaveSupervisorForEmployee(employee, routes = dbModule.loadLeaveApprovalRoutes()) {
  const department = String(employee?.department || '').trim();
  const route = routes.find((item) => item.enabled && String(item.department || '').trim() === department)
    || routes.find((item) => item.enabled && ['*', '全部', '預設'].includes(String(item.department || '').trim()));
  return route?.supervisor_id || '';
}

function buildLeaveLookup(employees = dbModule.loadEmployees(), types = dbModule.loadLeaveTypes()) {
  return {
    employeeMap: new Map(employees.map((employee) => [employee.id, employee])),
    typeMap: new Map(types.map((type) => [type.id, type]))
  };
}

function formatLeaveRequestForDashboard(request, lookup = buildLeaveLookup()) {
  const employee = lookup.employeeMap.get(request.employee_id) || {};
  const supervisor = lookup.employeeMap.get(request.supervisor_id) || {};
  const admin = lookup.employeeMap.get(request.admin_decision_by) || {};
  const type = lookup.typeMap.get(request.leave_type_id) || {};
  return {
    ...request,
    employeeId: request.employee_id,
    employeeName: employee.name || '',
    employeeDepartment: employee.department || '',
    leaveTypeId: request.leave_type_id,
    leaveTypeName: type.name || request.leave_type_id,
    supervisorId: request.supervisor_id || '',
    supervisorName: supervisor.name || '',
    adminDecisionBy: request.admin_decision_by || '',
    adminName: admin.name || '',
    statusText: getLeaveStatusText(request.status),
    startText: formatDateTimeText(request.start_at),
    endText: formatDateTimeText(request.end_at),
    createdText: formatDateTimeText(request.created_at),
    supervisorDecidedText: formatDateTimeText(request.supervisor_decided_at),
    adminDecidedText: formatDateTimeText(request.admin_decided_at)
  };
}

function getEmployeeLeaveState(employee) {
  const employees = dbModule.loadEmployees();
  const leaveTypes = dbModule.loadLeaveTypes();
  const lookup = buildLeaveLookup(employees, leaveTypes);
  return {
    leaveTypes: leaveTypes.filter((type) => type.enabled),
    myRequests: dbModule.queryLeaveRequests({ employeeId: employee.id, limit: 50 })
      .map((request) => formatLeaveRequestForDashboard(request, lookup)),
    supervisorQueue: dbModule.queryLeaveRequests({
      supervisorId: employee.id,
      status: 'pending_supervisor',
      limit: 100
    }).map((request) => formatLeaveRequestForDashboard(request, lookup))
  };
}

function getAdminLeaveState(employees = dbModule.loadEmployees()) {
  const leaveTypes = dbModule.loadLeaveTypes();
  const lookup = buildLeaveLookup(employees, leaveTypes);
  const allRequests = dbModule.queryLeaveRequests({ limit: 200 })
    .map((request) => formatLeaveRequestForDashboard(request, lookup));
  return {
    leaveTypes,
    approvalRoutes: dbModule.loadLeaveApprovalRoutes(),
    requests: allRequests,
    pendingAdmin: allRequests.filter((request) => request.status === 'pending_admin')
  };
}

function getAdminSecurityDatasets() {
  const employees = dbModule.loadEmployees();
  const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));
  const employeeDevices = dbModule.loadEmployeeDevices().map((device) => mapEmployeeDeviceForDashboard(device, employeeMap));
  const recentBrowserPunches = dbModule.loadPunchRecords()
    .filter((record) => record.source === 'browser')
    .slice(0, 50)
    .map((record) => {
      const employee = employeeMap.get(record.id) || null;
      const formatted = formatPunchRecord(record);
      const riskFlags = Array.isArray(record.risk_flags) ? record.risk_flags : [];
      return {
        employeeId: record.id,
        employeeName: employee?.name || '',
        department: employee?.department || '',
        timestamp: record.timestamp,
        timestampText: new Date(record.timestamp).toLocaleString('zh-TW', { hour12: false }),
        type: record.type,
        typeText: formatted.typeText,
        status: record.status,
        source: record.source,
        sourceText: formatted.sourceText,
        deviceId: record.device_id || '',
        deviceName: record.device_name || '',
        gpsStatus: record.gps_status || '',
        gpsAccuracy: record.gps_accuracy == null ? null : Number(record.gps_accuracy),
        locationText: formatLocationSummary({
          latitude: record.gps_lat,
          longitude: record.gps_lng,
          accuracy: record.gps_accuracy
        }),
        riskFlags
      };
    });
  const boundEmployeeIds = new Set(employeeDevices.map((device) => device.employee_id));
  return {
    settings: getBrowserSecuritySettings(),
    summary: {
      totalDevices: employeeDevices.length,
      boundEmployeeCount: boundEmployeeIds.size,
      unboundEmployeeCount: employees.filter((employee) => !boundEmployeeIds.has(employee.id)).length,
      recentPunchCount: recentBrowserPunches.length,
      riskyPunchCount: recentBrowserPunches.filter((item) => item.riskFlags.length > 0).length
    },
    employeeDevices,
    recentBrowserPunches
  };
}

function buildEmployeeSecurityState(employee, session = null) {
  const settings = getBrowserSecuritySettings();
  const devices = dbModule.loadEmployeeDevices(employee.id);
  const currentDevice = session?.deviceId
    ? devices.find((device) => device.device_id === session.deviceId) || null
    : null;
  return {
    settings,
    deviceBindingEnabled: settings.deviceBindingEnabled,
    gpsRequiredOnPunch: settings.gpsRequiredOnPunch,
    maxGpsAccuracyMeters: settings.maxGpsAccuracyMeters,
    boundDeviceCount: devices.length,
    currentDeviceTrusted: !settings.deviceBindingEnabled || Boolean(currentDevice),
    currentDeviceName: currentDevice ? formatDeviceDisplayName(currentDevice) : (session?.deviceName || ''),
    currentDeviceLastSeenText: currentDevice?.last_seen_at
      ? new Date(currentDevice.last_seen_at).toLocaleString('zh-TW', { hour12: false })
      : '尚未綁定',
    currentDeviceLastLocationText: currentDevice?.last_gps_at
      ? formatLocationSummary({
          latitude: currentDevice.last_gps_lat,
          longitude: currentDevice.last_gps_lng,
          accuracy: currentDevice.last_gps_accuracy
        })
      : '尚未記錄 GPS'
  };
}

function getSettingsSnapshot() {
  return {
    adminPassword: getSettingValue('adminPassword', DEFAULT_ADMIN_PASSWORD),
    systemPassword: getSettingValue('systemPassword', DEFAULT_SYSTEM_PASSWORD),
    mainTitle: getSettingValue('mainTitle', DEFAULT_MAIN_TITLE),
    subtitle: getSettingValue('subtitle', DEFAULT_SUBTITLE),
    heroDescription: getSettingValue('browserHeroDescription', DEFAULT_BROWSER_HERO_DESCRIPTION)
  };
}

function getBrowserDisplaySettings() {
  const settings = getSettingsSnapshot();
  return {
    mainTitle: settings.mainTitle,
    subtitle: settings.subtitle,
    heroDescription: settings.heroDescription
  };
}

function formatDuration(ms) {
  if (!ms || ms < 1000) return '剛啟動';

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (days) parts.push(`${days}天`);
  if (hours) parts.push(`${hours}小時`);
  if (minutes) parts.push(`${minutes}分鐘`);
  if (!days && !hours && parts.length < 2) parts.push(`${seconds}秒`);
  return parts.join(' ') || '剛啟動';
}

function getDatabaseFilePath() {
  return path.join(getUserDataPath(), 'app_data.db');
}

function getSystemHealthSnapshot() {
  const automationTasks = dbModule.loadAutomationTasks();
  const automationLog = dbModule.loadAutomationLog();
  const auditLogCount = dbModule.countAuditLogs();
  const auditArchiveCount = dbModule.countAuditArchives();
  const auditArchiveSettings = getAuditArchiveSettings();
  const automationExportSettings = getAutomationExportDirectorySettings();
  const externalApiSettings = getExternalApiAccessSettings();
  const desktopWindowAttached = Boolean(mainWindowRef && !mainWindowRef.isDestroyed?.());
  const startedAt = serverStartedAt || Date.now();
  const uptimeMs = Math.max(0, Date.now() - startedAt);
  const lastAutomationLog = automationLog[0] || null;

  return {
    status: serverInstance ? 'ok' : 'offline',
    statusText: serverInstance ? '運行中' : '未啟動',
    port: PORT,
    appVersion: app.getVersion(),
    startedAt,
    startedAtText: new Date(startedAt).toLocaleString('zh-TW', { hour12: false }),
    uptimeMs,
    uptimeText: formatDuration(uptimeMs),
    desktopWindowAttached,
    desktopWindowText: desktopWindowAttached ? '已連線' : '未連線',
    browserSessionCount: browserSessions.size,
    databasePath: getDatabaseFilePath(),
    employeeCount: dbModule.loadEmployees().length,
    boundDeviceCount: dbModule.loadEmployeeDevices().length,
    punchRecordCount: dbModule.loadPunchRecords().length,
    bellScheduleCount: dbModule.loadBellSchedules().length,
    bellHistoryCount: dbModule.loadBellHistory().length,
    customSoundCount: dbModule.loadCustomSounds().length,
    customThemeCount: dbModule.loadCustomThemes().length,
    automationTaskCount: automationTasks.length,
    enabledAutomationTaskCount: automationTasks.filter((task) => task.enabled).length,
    automationLogCount: automationLog.length,
    auditLogCount,
    auditArchiveCount,
    auditLogRetentionDays: auditArchiveSettings.retentionDays,
    automationExportDirectory: automationExportSettings.defaultDirectory,
    automationExportFallbackDirectory: automationExportSettings.fallbackDirectory,
    automationExportEffectiveDirectory: automationExportSettings.effectiveDirectory,
    automationExportUsingFallback: automationExportSettings.usingFallback,
    externalApiEnabled: externalApiSettings.enabled,
    externalApiKeyConfigured: externalApiSettings.keyConfigured,
    externalApiAuthMode: externalApiSettings.enabled ? 'api_key' : 'disabled',
    apiCount: API_ROUTE_CATALOG.length,
    systemPasswordSet: Boolean(getSettingValue('systemPassword', DEFAULT_SYSTEM_PASSWORD)),
    lastAutomationLog: lastAutomationLog
      ? {
          timestamp: lastAutomationLog.timestamp,
          timestampText: new Date(lastAutomationLog.timestamp).toLocaleString('zh-TW', { hour12: false }),
          status: lastAutomationLog.status,
          message: lastAutomationLog.message
        }
      : null
  };
}

function getAdminDatasets() {
  const settings = getSettingsSnapshot();
  const security = getAdminSecurityDatasets();
  const employees = dbModule.loadEmployees();
  const customSounds = dbModule.loadCustomSounds().map((sound) => ({
    ...sound,
    browserUrl: getBrowserMediaUrl(sound.path)
  }));
  const customThemes = dbModule.loadCustomThemes().map((theme) => ({
    ...theme,
    styles: {
      ...THEME_STYLE_DEFAULTS,
      ...theme.styles,
      browserPageBgImage: getBrowserMediaUrl(theme.styles.pageBgImage),
      browserTitleBgImage: getBrowserMediaUrl(theme.styles.titleBgImage),
      browserClockBgImage: getBrowserMediaUrl(theme.styles.clockBgImage)
    }
  }));

  return {
    employees,
    shifts: dbModule.loadShifts(),
    greetings: dbModule.loadGreetings(),
    bellSchedules: dbModule.loadBellSchedules(),
    bellHistory: dbModule.loadBellHistory().map((history) => ({
      ...history,
      soundName: String(history.sound || '').split(/[\\/]/).pop() || history.sound
    })),
    customSounds,
    specialEffects: dbModule.loadSpecialEffects(),
    themeSchedules: dbModule.loadThemeSchedules(),
    customThemes,
    leave: getAdminLeaveState(employees),
    security,
    settings: {
      mainTitle: settings.mainTitle,
      subtitle: settings.subtitle,
      heroDescription: settings.heroDescription
    }
  };
}

function getDeveloperDatasets() {
  const settings = getSettingsSnapshot();
  const externalApiSettings = getExternalApiAccessSettings();
  const auditLogs = dbModule.queryAuditLogs({ limit: 100 });
  const auditArchiveSettings = getAuditArchiveSettings();
  return {
    automationTasks: dbModule.loadAutomationTasks(),
    automationLog: dbModule.loadAutomationLog(),
    auditLogs,
    auditLogSummary: {
      total: dbModule.countAuditLogs(),
      defaultLimit: 100
    },
    auditArchive: {
      ...auditArchiveSettings,
      recentArchives: dbModule.loadAuditArchives(20).map(mapAuditArchiveRecord)
    },
    settings: {
      systemPasswordSet: Boolean(getSettingValue('systemPassword', DEFAULT_SYSTEM_PASSWORD)),
      developerImpersonationEnabled: isDeveloperImpersonationEnabled(),
      mainTitle: settings.mainTitle,
      subtitle: settings.subtitle,
      heroDescription: settings.heroDescription,
      externalApiEnabled: externalApiSettings.enabled,
      externalApiKeyConfigured: externalApiSettings.keyConfigured
    },
    employees: dbModule.loadEmployees().map(sanitizeEmployeeForProfile),
    automationExport: getAutomationExportDirectorySettings(),
    attendanceExport: getAttendanceExportSettings(),
    systemHealth: getSystemHealthSnapshot(),
    apiCatalog: API_ROUTE_CATALOG
  };
}

function buildEmployeeDashboard(employee, session = null) {
  const recentRecords = getEmployeeRecentRecords(employee.id, 7);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayRecordCount = recentRecords.filter((record) => record.timestamp >= todayStart.getTime()).length;
  const validRecordCount = recentRecords.filter((record) => record.status !== '重複打卡').length;
  const nextPunchType = determinePunchType(employee.id) === 'in' ? '上班' : '下班';
  const currentShift = findShiftForDate();

  return {
    role: 'employee',
    user: sanitizeEmployeeForProfile(employee),
    displaySettings: getBrowserDisplaySettings(),
    summary: {
      todayRecordCount,
      validRecordCount,
      weekRecordCount: recentRecords.length,
      currentShiftName: currentShift?.name || '未設定',
      nextPunchType,
      lastPunch: recentRecords[0] || null
    },
    security: buildEmployeeSecurityState(employee, session),
    punchAction: {
      label: `現在打卡（預計${nextPunchType}）`
    },
    leave: getEmployeeLeaveState(employee),
    recentRecords
  };
}

function getDayStartTimestamp(date = new Date()) {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  return dayStart.getTime();
}

function getDayEndTimestamp(date = new Date()) {
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);
  return dayEnd.getTime();
}

function getBellScheduleDaySet(schedule = {}) {
  const values = Array.isArray(schedule.days)
    ? schedule.days
    : String(schedule.days || '').split(',');
  const days = values
    .map((value) => Number(String(value).trim()))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);
  return new Set(days);
}

function getBellScheduleCandidateTimestamp(schedule = {}, baseDate = new Date()) {
  const [hours, minutes] = String(schedule.time || '').split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  const daySet = getBellScheduleDaySet(schedule);
  for (let offset = 0; offset <= 7; offset += 1) {
    const candidate = new Date(baseDate);
    candidate.setDate(baseDate.getDate() + offset);
    candidate.setHours(hours, minutes, 0, 0);
    if (daySet.size && !daySet.has(candidate.getDay())) continue;
    if (candidate.getTime() > baseDate.getTime()) {
      return candidate.getTime();
    }
  }
  return null;
}

function getNextBellSchedule(bellSchedules = [], now = new Date()) {
  return bellSchedules
    .filter((schedule) => schedule.enabled)
    .map((schedule) => ({
      ...schedule,
      nextTimestamp: getBellScheduleCandidateTimestamp(schedule, now)
    }))
    .filter((schedule) => Number.isFinite(schedule.nextTimestamp))
    .sort((a, b) => a.nextTimestamp - b.nextTimestamp)[0] || null;
}

function buildAdminDashboardInsights(datasets, allRecords) {
  const now = new Date();
  const todayStart = getDayStartTimestamp(now);
  const todayEnd = getDayEndTimestamp(now);
  const todayText = formatLocalDate(now);
  const employeeMap = new Map(datasets.employees.map((employee) => [employee.id, employee]));
  const currentShift = findShiftForDate(now);
  const todayRecords = allRecords
    .filter((record) => record.timestamp >= todayStart && record.timestamp <= todayEnd)
    .map((record) => {
      const employee = employeeMap.get(record.id) || {};
      return {
        ...formatPunchRecord(record),
        employeeName: employee.name || '',
        employeeDepartment: employee.department || '',
        isNormal: isNormalPunchRecord(record),
        isAbnormal: isAbnormalPunchRecord(record)
      };
    });
  const normalRecords = todayRecords.filter((record) => record.isNormal);
  const abnormalRecords = todayRecords.filter((record) => record.isAbnormal);
  const normalEmployeeIds = [...new Set(normalRecords.map((record) => record.id).filter(Boolean))];
  const abnormalEmployeeIds = [...new Set(abnormalRecords.map((record) => record.id).filter(Boolean))];
  const failureLogs = dbModule.queryAuditLogs({
    startDate: todayText,
    endDate: todayText,
    action: 'punch',
    targetType: 'punch_record',
    success: '0',
    limit: 200
  })
    .filter((log) => {
      const failureCode = String(log.after_data?.failure_code || '').trim();
      if (['P002', 'P004', 'P103'].includes(failureCode)) return false;
      if (!failureCode && String(log.summary || '').includes('重複打卡')) return false;
      return true;
    })
    .map((log) => ({
      id: log.id,
      timestamp: log.timestamp,
      timestampText: new Date(log.timestamp).toLocaleString('zh-TW', { hour12: false }),
      actorId: log.actor_id || '',
      actorName: log.actor_name || '',
      targetId: log.target_id || '',
      summary: log.summary || '',
      reason: log.after_data?.failure_reason || log.after_data?.error_message || log.summary || '',
      failureCode: log.after_data?.failure_code || ''
    }));
  const nextBellSchedule = getNextBellSchedule(datasets.bellSchedules, now);

  return {
    generatedAt: now.getTime(),
    today: todayText,
    shifts: {
      current: currentShift || null,
      items: datasets.shifts
    },
    todayAttendance: {
      records: todayRecords,
      normalRecords,
      abnormalRecords,
      normalEmployeeIds,
      abnormalEmployeeIds,
      failureLogs
    },
    bells: {
      totalCount: datasets.bellSchedules.length,
      enabledCount: datasets.bellSchedules.filter((schedule) => schedule.enabled).length,
      nextSchedule: nextBellSchedule
        ? {
          ...nextBellSchedule,
          nextDateText: formatLocalDate(new Date(nextBellSchedule.nextTimestamp)),
          nextTimeText: formatLocalTime(new Date(nextBellSchedule.nextTimestamp))
        }
        : null,
      schedules: datasets.bellSchedules
    },
    greetings: {
      totalCount: datasets.greetings.length,
      items: datasets.greetings
    },
    themes: {
      customThemeCount: datasets.customThemes.length,
      customThemes: datasets.customThemes,
      themeSchedules: datasets.themeSchedules,
      specialEffects: datasets.specialEffects
    }
  };
}

function buildManagerDashboard(employee) {
  const datasets = getAdminDatasets();
  const allRecords = getAllPunchRecords();
  const todayStart = getDayStartTimestamp();
  const todayRecords = allRecords.filter((record) => record.timestamp >= todayStart);
  const todayPunchCount = todayRecords.filter(isNormalPunchRecord).length;
  const todayPunchFailureCount = dbModule.countPunchFailureAuditLogsSince(todayStart, ['P002', 'P004', 'P103']);
  const todayAbnormalPunchCount = todayRecords.filter(isAbnormalPunchRecord).length + todayPunchFailureCount;
  const insights = buildAdminDashboardInsights(datasets, allRecords);

  return {
    role: 'admin',
    user: sanitizeEmployeeForProfile(employee),
    displaySettings: getBrowserDisplaySettings(),
    summary: {
      employeeCount: datasets.employees.length,
      shiftCount: datasets.shifts.length,
      todayPunchCount,
      todayAbnormalPunchCount,
      bellScheduleCount: datasets.bellSchedules.length,
      greetingCount: datasets.greetings.length,
      customThemeCount: datasets.customThemes.length
    },
    suggestions: [
      { title: '人員與班別', description: '已整合人員名冊、CSV 匯入匯出、班別設定與手動補登。' },
      { title: '作息與問候', description: '可直接維護響鈴場景、聲音庫、問候語與主畫面標題。' },
      { title: '主題與特效', description: '節日特效、主題排程與自訂主題編輯器都能在瀏覽器操作。' }
    ],
    insights,
    datasets
  };
}

function buildDeveloperDashboard(employee) {
  const datasets = getDeveloperDatasets();
  const enabledTaskCount = datasets.automationTasks.filter((task) => task.enabled).length;

  return {
    role: 'developer',
    user: sanitizeEmployeeForProfile(employee),
    displaySettings: getBrowserDisplaySettings(),
    summary: {
      automationTaskCount: datasets.automationTasks.length,
      enabledTaskCount,
      automationLogCount: datasets.automationLog.length,
      activeSessionCount: browserSessions.size
    },
    suggestions: [
      { title: '立即任務', description: '保留 AI 系統控制核心，可執行匯出與刪除型自動化任務。' },
      { title: '排程觀測', description: '可直接維護每日、每週、每月排程，並查看執行紀錄。' },
      { title: '安全維護', description: '系統密碼變更與 API 入口巡檢集中在同一個儀表板。' }
    ],
    datasets
  };
}

function appendImpersonationState(dashboard, session) {
  if (!dashboard || !session?.impersonation?.active) return dashboard;
  return {
    ...dashboard,
    impersonation: {
      active: true,
      realRole: session.realRole || 'developer',
      realEmployeeId: session.realEmployeeId || session.employeeId,
      realEmployeeName: session.realEmployeeName || '',
      activeRole: session.role,
      activeEmployeeId: session.employeeId,
      targetEmployeeId: session.impersonation.targetEmployeeId || '',
      targetEmployeeName: session.impersonation.targetEmployeeName || ''
    }
  };
}

function buildDashboardForSession(session) {
  const employee = getEmployeeById(session.employeeId);
  if (!employee) {
    const employeeMissingError = new Error('登入帳號對應的員工資料已不存在，請重新登入。');
    employeeMissingError.statusCode = 401;
    throw employeeMissingError;
  }

  if (session.role === 'employee') return appendImpersonationState(buildEmployeeDashboard(employee, session), session);
  if (session.role === 'admin') return appendImpersonationState(buildManagerDashboard(employee), session);
  return appendImpersonationState(buildDeveloperDashboard(employee), session);
}

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function hasSupportCode(message) {
  return /^\[[A-Z]\d{3}\]/.test(String(message || '').trim());
}

function extractSupportCode(message) {
  const match = String(message || '').match(/\[([A-Z]\d{3})\]/);
  return match ? match[1] : '';
}

function cleanSupportCodeMessage(message) {
  return String(message || '')
    .replace(/^\[[A-Z]\d{3}\]\s*/, '')
    .replace(/請把錯誤代碼\s+[A-Z]\d{3}\s+告知管理者。?$/, '')
    .trim();
}

function withSupportCode(code, message) {
  return `[${code}] ${message} 請把錯誤代碼 ${code} 告知管理者。`;
}

function formatGenericPunchFailure(error, code = 'P299') {
  const message = String(error?.message || '未知錯誤').trim();
  if (hasSupportCode(message)) return message;
  return withSupportCode(code, `打卡失敗，系統無法完成紀錄。系統訊息：${message}`);
}

function getCredentialAuditMeta(value) {
  const text = String(value || '').trim();
  return {
    credential_input: text,
    input_length: text.length,
    input_suffix: text.length <= 4 ? text : text.slice(-4)
  };
}

function hashCardIdentifier(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return crypto
    .createHash('sha256')
    .update(`card-id:${text}`)
    .digest('hex');
}

function writePunchFailureAuditLog({
  request = null,
  employee = null,
  channel = 'browser',
  code = 'P299',
  reason = '',
  credentialValue = '',
  targetId = null,
  extra = {}
} = {}) {
  const channelLabel = channel === 'api'
    ? '外部裝置'
    : channel === 'desktop'
      ? '桌面端'
      : '瀏覽器';
  const normalizedReason = cleanSupportCodeMessage(reason) || '未知打卡錯誤';
  const credentialMeta = credentialValue === '' ? {} : getCredentialAuditMeta(credentialValue);
  const cardHash = credentialValue === '' ? '' : hashCardIdentifier(credentialValue);
  const session = request?.browserSession || null;

  writeAuditLog({
    actor_id: employee?.id || session?.employeeId || (channel === 'api' ? 'api' : null),
    actor_name: employee?.name || (channel === 'api' ? '外部裝置' : null),
    role: channel === 'browser' ? 'employee' : 'system',
    channel,
    action: 'punch',
    target_type: 'punch_record',
    target_id: targetId || employee?.id || session?.employeeId || null,
    summary: `${channelLabel}打卡失敗（${code}）：${normalizedReason}`,
    after_data: sanitizeAuditSnapshot({
      failure_code: code,
      failure_reason: normalizedReason,
      ...credentialMeta,
      ...(cardHash ? { card_hash: cardHash } : {}),
      employee_id: employee?.id || session?.employeeId || '',
      employee_name: employee?.name || '',
      device_id: session?.deviceId || '',
      device_name: session?.deviceName || '',
      ...extra
    }),
    success: false,
    ip_address: request ? getRequestIpAddress(request) : null,
    session_token_suffix: getSessionTokenSuffix(session?.token)
  });
  notifyDesktop('auditLogs', request?.browserSession ? getBrowserSyncMeta(request) : { origin: channel });
}

function buildEmployeeDeviceRecord(employeeId, deviceInfo, request, existingDevice = null, options = {}) {
  const now = Date.now();
  const location = options.location || null;
  return {
    employee_id: employeeId,
    device_id: deviceInfo.deviceId,
    device_name: deviceInfo.deviceName || existingDevice?.device_name || buildDefaultDeviceName(deviceInfo),
    device_token_hash: options.deviceTokenHash || existingDevice?.device_token_hash || null,
    platform: deviceInfo.platform || existingDevice?.platform || null,
    user_agent: request.headers['user-agent'] || existingDevice?.user_agent || null,
    created_at: existingDevice?.created_at || now,
    last_seen_at: now,
    last_ip: getRequestIpAddress(request),
    last_gps_lat: location?.latitude ?? existingDevice?.last_gps_lat ?? null,
    last_gps_lng: location?.longitude ?? existingDevice?.last_gps_lng ?? null,
    last_gps_accuracy: location?.accuracy ?? existingDevice?.last_gps_accuracy ?? null,
    last_gps_at: location?.capturedAt ?? existingDevice?.last_gps_at ?? null,
    status: 'active'
  };
}

function authorizeEmployeeDeviceForLogin(employee, request, deviceInfo = {}) {
  const securitySettings = getBrowserSecuritySettings();
  if (!securitySettings.deviceBindingEnabled) {
    return {
      securitySettings,
      deviceRecord: null,
      issuedDeviceToken: null,
      newlyBound: false
    };
  }

  if (!deviceInfo.deviceId) {
    throw createHttpError(withSupportCode('P211', '此帳號已啟用裝置綁定，請使用支援本地儲存的瀏覽器登入。'), 400);
  }

  const existingDevice = dbModule.getEmployeeDevice(employee.id, deviceInfo.deviceId);
  if (existingDevice) {
    const providedHash = deviceInfo.deviceToken ? hashDeviceToken(deviceInfo.deviceToken) : '';
    if (!providedHash || existingDevice.device_token_hash !== providedHash) {
      throw createHttpError(withSupportCode('P212', '此裝置缺少有效綁定憑證，請改用原本綁定的裝置或請管理者解除後重新綁定。'), 403);
    }

    const updatedDevice = buildEmployeeDeviceRecord(employee.id, deviceInfo, request, existingDevice);
    dbModule.saveEmployeeDevice(updatedDevice);
    return {
      securitySettings,
      deviceRecord: updatedDevice,
      issuedDeviceToken: null,
      newlyBound: false
    };
  }

  const employeeDevices = dbModule.loadEmployeeDevices(employee.id);
  if (employeeDevices.length > 0) {
    throw createHttpError(withSupportCode('P213', '此裝置尚未綁定，請使用已綁定裝置登入，或請管理者先清除舊裝置。'), 403);
  }

  const issuedDeviceToken = crypto.randomBytes(32).toString('hex');
  const deviceRecord = buildEmployeeDeviceRecord(employee.id, deviceInfo, request, null, {
    deviceTokenHash: hashDeviceToken(issuedDeviceToken)
  });
  dbModule.saveEmployeeDevice(deviceRecord);
  return {
    securitySettings,
    deviceRecord,
    issuedDeviceToken,
    newlyBound: true
  };
}

function validateEmployeeSessionDevice(session, request) {
  const securitySettings = getBrowserSecuritySettings();
  if (!securitySettings.deviceBindingEnabled || session?.role !== 'employee') {
    return { securitySettings, deviceRecord: null };
  }
  if (session?.impersonation?.active && session?.realRole === 'developer') {
    return { securitySettings, deviceRecord: null };
  }

  if (!session?.deviceId) {
    throw createHttpError(withSupportCode('P214', '目前 Session 缺少綁定裝置資訊，請重新登入。'), 401);
  }

  const deviceRecord = dbModule.getEmployeeDevice(session.employeeId, session.deviceId);
  if (!deviceRecord) {
    throw createHttpError(withSupportCode('P215', '此帳號的綁定裝置已被解除，請重新登入。'), 403);
  }

  const updatedDevice = buildEmployeeDeviceRecord(session.employeeId, {
    deviceId: session.deviceId,
    deviceName: session.deviceName,
    platform: session.devicePlatform,
    browserName: session.deviceBrowserName
  }, request, deviceRecord);
  dbModule.saveEmployeeDevice(updatedDevice);

  return {
    securitySettings,
    deviceRecord: updatedDevice
  };
}

function validatePunchLocationPayload(locationPayload, securitySettings) {
  const normalizedLocation = normalizeBrowserLocation(locationPayload);
  if (!securitySettings.gpsRequiredOnPunch && !normalizedLocation) {
    return {
      normalizedLocation: null,
      gpsStatus: 'optional'
    };
  }

  if (!normalizedLocation) {
    throw createHttpError(withSupportCode('P221', '遠端打卡需要可用的 GPS 定位資訊，請開啟定位權限後再試一次。'), 400);
  }

  const locationAgeMs = Math.max(0, Date.now() - normalizedLocation.capturedAt);
  if (locationAgeMs > 2 * 60 * 1000) {
    throw createHttpError(withSupportCode('P222', 'GPS 定位已過期，請重新取得定位後再打卡。'), 400);
  }

  if (normalizedLocation.accuracy > securitySettings.maxGpsAccuracyMeters) {
    throw createHttpError(withSupportCode('P223', `目前 GPS 精度約 ±${Math.round(normalizedLocation.accuracy)} 公尺，超過系統允許的 ±${securitySettings.maxGpsAccuracyMeters} 公尺，請移動到收訊較好的地方後再試。`), 400);
  }

  const riskFlags = [];
  if (normalizedLocation.accuracy > securitySettings.maxGpsAccuracyMeters * 0.75) {
    riskFlags.push('gps_accuracy_warning');
  }

  return {
    normalizedLocation,
    gpsStatus: 'captured',
    riskFlags
  };
}

function updateEmployeeDeviceLocation(employeeId, deviceRecord, request, location = null) {
  if (!deviceRecord) return null;
  const updatedDevice = buildEmployeeDeviceRecord(employeeId, {
    deviceId: deviceRecord.device_id,
    deviceName: deviceRecord.device_name,
    platform: deviceRecord.platform
  }, request, deviceRecord, { location });
  dbModule.saveEmployeeDevice(updatedDevice);
  return updatedDevice;
}

function createBrowserSession(role, employeeId, metadata = {}) {
  const token = crypto.randomBytes(24).toString('hex');
  const realRole = metadata.realRole || role;
  const realEmployeeId = metadata.realEmployeeId || employeeId;
  browserSessions.set(token, {
    token,
    role,
    employeeId,
    realRole,
    realEmployeeId,
    realEmployeeName: metadata.realEmployeeName || '',
    impersonation: metadata.impersonation || null,
    createdAt: Date.now(),
    deviceId: metadata.deviceId || null,
    deviceName: metadata.deviceName || null,
    devicePlatform: metadata.devicePlatform || null,
    deviceBrowserName: metadata.deviceBrowserName || null,
    ipAddress: metadata.ipAddress || null,
    userAgent: metadata.userAgent || null
  });
  return token;
}

function getBrowserSessionFromRequest(request) {
  const authHeader = request.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return null;
  return browserSessions.get(token) || null;
}

function extractExternalApiKey(request) {
  const directHeaderKey = String(request.headers['x-api-key'] || '').trim();
  if (directHeaderKey) return directHeaderKey;

  const authHeader = String(request.headers.authorization || '').trim();
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  const queryKey = String(request.query?.apiKey || request.query?.api_key || '').trim();
  if (queryKey) return queryKey;

  return String(request.body?.apiKey || request.body?.api_key || '').trim();
}

function requireExternalApiAccess(request, response, next) {
  const settings = getExternalApiAccessSettings();
  if (!settings.enabled) {
    response.status(403).json({ success: false, error: withSupportCode('P091', '外部 API 功能目前已停用。') });
    return;
  }

  if (!settings.keyConfigured) {
    response.status(503).json({ success: false, error: withSupportCode('P092', '外部 API 已啟用，但尚未設定 API 金鑰。') });
    return;
  }

  const providedKey = extractExternalApiKey(request);
  if (!providedKey || providedKey !== settings.apiKey) {
    response.setHeader('WWW-Authenticate', 'Bearer realm="TanChin External API"');
    response.status(401).json({ success: false, error: withSupportCode('P093', 'API 金鑰無效，或尚未提供 API 金鑰。') });
    return;
  }

  next();
}

function requireBrowserSession(request, response, next) {
  const session = getBrowserSessionFromRequest(request);
  if (!session) {
    response.status(401).json({ success: false, error: withSupportCode('P230', '請先登入瀏覽器入口後再操作。') });
    return;
  }
  request.browserSession = session;
  next();
}

function requireBrowserRole(...roles) {
  return (request, response, next) => {
    const session = request.browserSession;
    if (!session || !roles.includes(session.role)) {
      response.status(403).json({ success: false, error: withSupportCode('P231', '目前登入角色沒有這個操作權限。') });
      return;
    }
    next();
  };
}

function requireDeveloperIdentity(request, response, next) {
  const session = request.browserSession;
  if (!session || (session.realRole || session.role) !== 'developer') {
    response.status(403).json({ success: false, error: '只有開發人員登入狀態可以使用開發人員身份切換。' });
    return;
  }
  next();
}

function broadcastBrowserDataUpdate(type, meta = {}) {
  const payload = JSON.stringify({
    type,
    timestamp: Date.now(),
    ...meta
  });

  browserEventClients.forEach((client, clientId) => {
    if (!browserSessions.has(client.token)) {
      clearInterval(client.heartbeat);
      browserEventClients.delete(clientId);
      try { client.response.end(); } catch (error) { /* noop */ }
      return;
    }

    try {
      client.response.write(`data: ${payload}\n\n`);
    } catch (error) {
      clearInterval(client.heartbeat);
      browserEventClients.delete(clientId);
      try { client.response.end(); } catch (closeError) { /* noop */ }
    }
  });
}

function notifyDesktop(type, meta = {}) {
  if (mainWindowRef) {
    mainWindowRef.webContents.send('data-updated', { type, ...meta });
  }
  broadcastBrowserDataUpdate(type, meta);
}

function getBrowserSyncMeta(request) {
  return {
    origin: 'browser',
    sessionToken: request?.browserSession?.token
  };
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
    return `${prefix}_資料(${dataRange})_匯出日期${exportDate}.csv`;
  }

  const safeRangeLabel = sanitizeFileNameSegment(rangeLabel || '全部資料');
  return `${prefix}_${safeRangeLabel}_匯出日期${exportDate}.csv`;
}

function normalizeEmployee(employee) {
  return {
    id: String(employee.id || '').trim(),
    name: String(employee.name || '').trim(),
    gender: String(employee.gender || '').trim(),
    nationality: String(employee.nationality || '').trim(),
    department: String(employee.department || '').trim(),
    job_title: String(employee.job_title || '').trim(),
    card: String(employee.card || '').trim(),
    password: String(employee.password || '').trim(),
    national_id: String(employee.national_id || '').trim(),
    birth_date: String(employee.birth_date || '').trim(),
    hire_date: String(employee.hire_date || '').trim(),
    termination_date: String(employee.termination_date || '').trim(),
    notes: String(employee.notes || '').trim(),
    bank_account: String(employee.bank_account || '').trim(),
    mobile_phone: String(employee.mobile_phone || '').trim(),
    emergency_contact: String(employee.emergency_contact || '').trim(),
    emergency_phone: String(employee.emergency_phone || '').trim(),
    contact_address: String(employee.contact_address || '').trim(),
    registered_address: String(employee.registered_address || '').trim(),
    family_status: String(employee.family_status || '').trim()
  };
}

function normalizeGreeting(greeting) {
  return {
    id: String(greeting.id || `greeting_${Date.now()}`),
    type: greeting.type === 'out' ? 'out' : 'in',
    message: String(greeting.message || '').trim(),
    employee_id: greeting.employee_id ? String(greeting.employee_id).trim() : null
  };
}

function normalizeBellSchedule(schedule) {
  const activeDays = Array.isArray(schedule.days)
    ? schedule.days
    : String(schedule.days || '').split(',').map((value) => value.trim()).filter(Boolean);

  return {
    id: String(schedule.id || `schedule_${Date.now()}`),
    title: String(schedule.title || '').trim(),
    time: String(schedule.time || '').trim(),
    days: activeDays.join(','),
    sound: String(schedule.sound || '').trim(),
    duration: Number(schedule.duration) || 5,
    enabled: normalizeBoolean(schedule.enabled)
  };
}

function normalizeSpecialEffect(effect) {
  return {
    id: String(effect.id || `effect_${Date.now()}`),
    name: String(effect.name || '').trim(),
    prefix: String(effect.prefix || '').trim(),
    suffix: String(effect.suffix || '').trim(),
    start_date: String(effect.start_date || '').trim(),
    end_date: String(effect.end_date || '').trim(),
    enabled: normalizeBoolean(effect.enabled)
  };
}

function normalizeThemeSchedule(schedule) {
  return {
    id: String(schedule.id || `theme_schedule_${Date.now()}`),
    name: String(schedule.name || '').trim(),
    theme_name: String(schedule.theme_name || 'default').trim() || 'default',
    start_date: String(schedule.start_date || '').trim(),
    end_date: String(schedule.end_date || '').trim(),
    enabled: normalizeBoolean(schedule.enabled)
  };
}

function normalizeThemeStyles(styles = {}) {
  const nextStyles = { ...THEME_STYLE_DEFAULTS, ...styles };
  delete nextStyles.browserPageBgImage;
  delete nextStyles.browserTitleBgImage;
  delete nextStyles.browserClockBgImage;
  nextStyles.blinkEnabled = normalizeBoolean(nextStyles.blinkEnabled);
  nextStyles.pageBgImage = nextStyles.pageBgImage || '';
  nextStyles.titleBgImage = nextStyles.titleBgImage || '';
  nextStyles.clockBgImage = nextStyles.clockBgImage || '';
  return nextStyles;
}

function normalizeCustomTheme(theme) {
  return {
    id: String(theme.id || `custom_${Date.now()}`),
    name: String(theme.name || '').trim(),
    styles: normalizeThemeStyles(theme.styles)
  };
}

function normalizeAutomationTask(task) {
  const taskType = String(task.task_type || 'export');
  const target = String(task.target || 'last_week_records');
  return {
    id: String(task.id || `auto_task_${Date.now()}`),
    frequency: String(task.frequency || 'immediate'),
    day: String(task.day || ''),
    time: String(task.time || ''),
    task_type: taskType,
    target,
    export_template: isAttendanceExportTarget(target) && taskType === 'export'
      ? normalizeAttendanceExportTemplateId(task.export_template)
      : DEFAULT_ATTENDANCE_EXPORT_TEMPLATE_ID,
    export_directory: taskType === 'export'
      ? String(task.export_directory || '').trim()
      : '',
    enabled: normalizeBoolean(task.enabled)
  };
}

const AUDIT_MASKED_KEYS = new Set([
  'password',
  'newPassword',
  'currentPassword',
  'currentSystemPassword',
  'secret',
  'card',
  'device_token_hash',
  'bank_account',
  'national_id',
  'mobile_phone',
  'emergency_phone'
]);

function maskAuditValue(key, value) {
  if (value == null) return value;
  if (!AUDIT_MASKED_KEYS.has(key)) return value;
  const text = String(value).trim();
  if (!text) return '';
  if (key.toLowerCase().includes('password') || key === 'secret') return '[已遮罩]';
  if (text.length <= 4) return '[已遮罩]';
  return `${text.slice(0, 2)}***${text.slice(-2)}`;
}

function sanitizeAuditSnapshot(value, key = '') {
  if (value == null) return value;
  if (Array.isArray(value)) {
    if (value.length > 10) {
      return {
        count: value.length,
        preview: value.slice(0, 10).map((item) => sanitizeAuditSnapshot(item, key)),
        truncated: true
      };
    }
    return value.map((item) => sanitizeAuditSnapshot(item, key));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [entryKey, sanitizeAuditSnapshot(entryValue, entryKey)])
    );
  }
  return maskAuditValue(key, value);
}

function getRequestIpAddress(request) {
  const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || request.socket?.remoteAddress || null;
}

function getSessionTokenSuffix(token) {
  const value = String(token || '').trim();
  return value ? value.slice(-8) : null;
}

function writeAuditLog(entry) {
  try {
    dbModule.addAuditLog({
      timestamp: Date.now(),
      ...entry
    });
  } catch (error) {
    console.error('[稽核] 寫入操作稽核紀錄失敗:', error.message);
  }
}

function writeBrowserAuditLog(request, entry) {
  const session = request?.browserSession || null;
  const actorId = session?.realEmployeeId || session?.employeeId || null;
  const actor = actorId ? getEmployeeById(actorId) : null;
  const role = session?.impersonation?.active
    ? `${session.realRole || 'developer'}:${session.role}`
    : session?.role;
  writeAuditLog({
    actor_id: entry.actor_id ?? actorId,
    actor_name: entry.actor_name ?? actor?.name ?? null,
    role: entry.role ?? role ?? null,
    channel: entry.channel ?? 'browser',
    action: entry.action || 'update',
    target_type: entry.target_type || null,
    target_id: entry.target_id || null,
    summary: entry.summary || '',
    before_data: sanitizeAuditSnapshot(entry.before_data),
    after_data: sanitizeAuditSnapshot(entry.after_data),
    success: entry.success !== false,
    ip_address: entry.ip_address ?? getRequestIpAddress(request),
    session_token_suffix: entry.session_token_suffix ?? getSessionTokenSuffix(session?.token)
  });
  if (request) {
    notifyDesktop('auditLogs', getBrowserSyncMeta(request));
  }
}

function buildAuditArchiveFilePayload(logs = []) {
  const normalizedLogs = Array.isArray(logs) ? logs : [];
  const lines = normalizedLogs.map((log) => JSON.stringify({
    id: log.id,
    timestamp: log.timestamp,
    actor_id: log.actor_id,
    actor_name: log.actor_name,
    role: log.role,
    channel: log.channel,
    action: log.action,
    target_type: log.target_type,
    target_id: log.target_id,
    summary: log.summary,
    before_data: log.before_data,
    after_data: log.after_data,
    success: log.success,
    ip_address: log.ip_address,
    session_token_suffix: log.session_token_suffix
  }));
  const content = lines.length ? `${lines.join('\n')}\n` : '';
  const checksum = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  return { content, checksum };
}

function archiveAuditLogGroup(logs, settings, createdAt, batchId) {
  const firstLog = logs[0];
  const lastLog = logs[logs.length - 1];
  const archiveMonth = formatLocalDate(new Date(firstLog.timestamp), 'YYYY-MM');
  const archiveYear = archiveMonth.slice(0, 4);
  const baseDirectory = ensureDirectory(settings.effectiveDirectory);
  const targetDirectory = ensureDirectory(path.join(baseDirectory, archiveYear));
  const fileName = `${archiveMonth}-${batchId}.audit.jsonl`;
  const filePath = path.join(targetDirectory, fileName);
  const tempPath = `${filePath}.tmp`;
  const { content, checksum } = buildAuditArchiveFilePayload(logs);

  fs.writeFileSync(tempPath, content, 'utf8');
  fs.renameSync(tempPath, filePath);
  try {
    dbModule.addAuditArchive({
      created_at: createdAt,
      archive_batch_id: batchId,
      source_table: 'audit_logs',
      archive_month: archiveMonth,
      start_timestamp: firstLog.timestamp,
      end_timestamp: lastLog.timestamp,
      record_count: logs.length,
      file_path: filePath,
      checksum,
      retention_days: settings.retentionDays
    });
  } catch (error) {
    try { fs.unlinkSync(filePath); } catch (cleanupError) { /* noop */ }
    throw error;
  }

  return {
    archiveMonth,
    filePath,
    checksum,
    recordCount: logs.length,
    startTimestamp: firstLog.timestamp,
    endTimestamp: lastLog.timestamp
  };
}

function archiveExpiredAuditLogs({ force = false, reason = 'manual' } = {}) {
  if (auditArchiveInProgress) {
    return {
      success: false,
      skipped: true,
      archivedCount: 0,
      deletedCount: 0,
      archiveFiles: [],
      message: '稽核封存正在執行中，請稍後再試。'
    };
  }

  auditArchiveInProgress = true;
  try {
    const settings = getAuditArchiveSettings();
    const cutoffTimestamp = Date.now() - (settings.retentionDays * 24 * 60 * 60 * 1000);
    const createdAt = Date.now();
    let archivedCount = 0;
    let deletedCount = 0;
    const archiveFiles = [];

    while (true) {
      const candidates = dbModule.getAuditLogsForArchive(cutoffTimestamp, AUDIT_ARCHIVE_BATCH_SIZE);
      if (!candidates.length) break;

      const groupedLogs = candidates.reduce((groups, log) => {
        const archiveMonth = formatLocalDate(new Date(log.timestamp), 'YYYY-MM');
        if (!groups.has(archiveMonth)) groups.set(archiveMonth, []);
        groups.get(archiveMonth).push(log);
        return groups;
      }, new Map());

      const archivedIds = [];
      for (const [archiveMonth, logs] of groupedLogs.entries()) {
        const batchId = `${archiveMonth}-${createdAt}-${crypto.randomUUID()}`;
        const archiveResult = archiveAuditLogGroup(logs, settings, createdAt, batchId);
        archiveFiles.push(archiveResult);
        archivedCount += logs.length;
        archivedIds.push(...logs.map((log) => log.id));
      }

      const deleteResult = dbModule.deleteAuditLogsByIds(archivedIds);
      const deletedChanges = Number(deleteResult?.changes || 0);
      if (deletedChanges !== archivedIds.length) {
        throw new Error(`稽核封存刪除熱資料筆數不一致，預期 ${archivedIds.length} 筆，實際 ${deletedChanges} 筆。`);
      }
      deletedCount += deletedChanges;

      if (!force || candidates.length < AUDIT_ARCHIVE_BATCH_SIZE) break;
    }

    const result = {
      success: true,
      skipped: false,
      reason,
      retentionDays: settings.retentionDays,
      cutoffTimestamp,
      archiveDirectory: settings.effectiveDirectory,
      archivedCount,
      deletedCount,
      archiveFiles,
      message: archivedCount
        ? `已封存 ${archivedCount} 筆稽核紀錄，共建立 ${archiveFiles.length} 個封存檔。`
        : '目前沒有超過保留天數的稽核紀錄。'
    };

    if (archivedCount > 0 && reason !== 'manual') {
      writeAuditLog({
        actor_id: 'system',
        actor_name: '系統排程',
        role: 'system',
        channel: 'system',
        action: 'archive',
        target_type: 'audit_log',
        target_id: 'expired',
        summary: result.message,
        after_data: {
          retentionDays: result.retentionDays,
          deletedCount: result.deletedCount,
          files: result.archiveFiles.map((item) => ({
            archiveMonth: item.archiveMonth,
            recordCount: item.recordCount,
            filePath: item.filePath
          }))
        }
      });
      notifyDesktop('auditLogs', { origin: 'system' });
      notifyDesktop('auditArchiveSettings', { origin: 'system' });
    }

    return result;
  } finally {
    auditArchiveInProgress = false;
  }
}

function scheduleAuditArchiveJob() {
  if (auditArchiveInterval) clearInterval(auditArchiveInterval);

  setTimeout(() => {
    try {
      archiveExpiredAuditLogs({ force: true, reason: 'startup' });
    } catch (error) {
      console.error('[稽核封存] 啟動封存失敗：', error.message);
    }
  }, 1500);

  auditArchiveInterval = setInterval(() => {
    try {
      archiveExpiredAuditLogs({ force: true, reason: 'scheduled' });
    } catch (error) {
      console.error('[稽核封存] 排程封存失敗：', error.message);
    }
  }, AUDIT_ARCHIVE_INTERVAL_MS);
}

function decodeDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(.+?);base64,(.+)$/);
  if (!match) {
    throw new Error('檔案內容格式不正確。');
  }
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64')
  };
}

function sanitizeFileName(fileName, fallbackExtension) {
  const safeName = path.basename(fileName || `upload.${fallbackExtension}`).replace(/[^\w.\-\u4e00-\u9fa5]/g, '_');
  if (path.extname(safeName)) return `${Date.now()}_${safeName}`;
  return `${Date.now()}_${safeName}.${fallbackExtension}`;
}

function saveUploadedSound(dataUrl, fileName) {
  const { mimeType, buffer } = decodeDataUrl(dataUrl);
  const extension = mimeType.split('/')[1] || 'mp3';
  const destinationName = sanitizeFileName(fileName, extension);
  const destinationPath = path.join(getCustomSoundsDirectory(), destinationName);
  fs.writeFileSync(destinationPath, buffer);
  return {
    id: `sound_${Date.now()}`,
    name: fileName || destinationName,
    path: destinationPath,
    browserUrl: getBrowserMediaUrl(destinationPath)
  };
}

function saveUploadedThemeImage(dataUrl, fileName) {
  const { mimeType, buffer } = decodeDataUrl(dataUrl);
  const extension = mimeType.split('/')[1] || 'png';
  const destinationName = sanitizeFileName(fileName, extension);
  const destinationPath = path.join(getThemeImagesDirectory(), destinationName);
  fs.writeFileSync(destinationPath, buffer);
  return {
    path: toFileUri(destinationPath),
    browserUrl: getBrowserMediaUrl(destinationPath),
    name: fileName || destinationName
  };
}

async function executeAutomationTask(task) {
  let message = '';
  let status = 'info';
  let notificationType = null;
  let startTime = null;
  let endTime = null;
  let descriptiveDateRange = '';
  const today = new Date();
  const todayString = formatLocalDate(today);

  switch (task.target) {
    case 'last_week_records': {
      const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
      endTime = new Date(today);
      endTime.setDate(today.getDate() - dayOfWeek);
      endTime.setHours(23, 59, 59, 999);
      startTime = new Date(endTime);
      startTime.setDate(endTime.getDate() - 6);
      startTime.setHours(0, 0, 0, 0);
      descriptiveDateRange = `上週 (${formatLocalDate(startTime)} ~ ${formatLocalDate(endTime)})`;
      break;
    }
    case 'last_month_records':
      startTime = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      endTime = new Date(today.getFullYear(), today.getMonth(), 0);
      startTime.setHours(0, 0, 0, 0);
      endTime.setHours(23, 59, 59, 999);
      descriptiveDateRange = `上月 (${formatLocalDate(startTime, 'YYYY-MM')})`;
      break;
    case 'manual_records':
      descriptiveDateRange = '手動補登紀錄';
      break;
    case 'all_records':
      descriptiveDateRange = '全部打卡紀錄';
      break;
    case 'all_employees':
      descriptiveDateRange = '全部員工資料';
      break;
    case 'all_bell_records':
      descriptiveDateRange = '全部響鈴紀錄';
      break;
    case 'log':
      descriptiveDateRange = '系統日誌';
      break;
    default:
      descriptiveDateRange = task.target;
      break;
  }

  if (task.task_type === 'export') {
    const exportDirectoryInfo = getAutomationExportDirectoryInfo(task);
    const exportBasePath = exportDirectoryInfo.directoryPath;
    const bom = Buffer.from('\uFEFF', 'utf8');
    let csvContent = '';
    let fileName = '';

    if (task.target === 'all_employees') {
      const employees = dbModule.loadEmployees();
      if (!employees.length) {
        message = '目前沒有員工資料可匯出。';
      } else {
        const headers = ['id', 'name', 'gender', 'department', 'job_title', 'card', 'password', 'nationality', 'national_id', 'birth_date', 'hire_date', 'termination_date', 'notes'];
        const headersTw = ['工號', '姓名', '性別', '部門', '職稱', '卡號', '密碼', '國籍', '身分證字號', '生日', '到職日', '離職日', '備註'];
        csvContent = `${headersTw.join(',')}\r\n`;
        employees.forEach((employee) => {
          const row = headers.map((header) => `"${String(employee[header] || '').replace(/"/g, '""')}"`);
          csvContent += `${row.join(',')}\r\n`;
        });
        fileName = `員工資料_(匯出日期${todayString}).csv`;
        fs.writeFileSync(path.join(exportBasePath, fileName), Buffer.concat([bom, Buffer.from(csvContent)]));
        message = `已匯出 ${employees.length} 筆員工資料至 ${exportDirectoryInfo.sourceLabel}：${exportBasePath}`;
        status = 'success';
      }
    } else if (task.target === 'log') {
      const logs = dbModule.loadAutomationLog().sort((a, b) => a.timestamp - b.timestamp);
      if (!logs.length) {
        message = '目前沒有系統日誌可匯出。';
      } else {
        const rows = logs.map((logEntry) => [
          `"${new Date(logEntry.timestamp).toLocaleString('zh-TW', { hour12: false })}"`,
          `"${logEntry.status}"`,
          `"${String(logEntry.message).replace(/"/g, '""')}"`
        ].join(','));
        csvContent = `時間,狀態,訊息\r\n${rows.join('\r\n')}`;
        fileName = `系統日誌_(匯出日期${todayString}).csv`;
        fs.writeFileSync(path.join(exportBasePath, fileName), Buffer.concat([bom, Buffer.from(csvContent)]));
        message = `已匯出 ${logs.length} 筆系統日誌至 ${exportDirectoryInfo.sourceLabel}：${exportBasePath}`;
        status = 'success';
      }
    } else if (task.target === 'all_bell_records') {
      const bellHistory = dbModule.loadBellHistory().sort((a, b) => a.timestamp - b.timestamp);
      if (!bellHistory.length) {
        message = '目前沒有響鈴紀錄可匯出。';
      } else {
        const rows = bellHistory.map((history) => [
          `"${new Date(history.timestamp).toLocaleString('zh-TW', { hour12: false })}"`,
          `"${history.scheduleId}"`,
          `"${history.time}"`,
          `"${String(history.sound || '').split(/[\\/]/).pop()}"`
        ].join(','));
        csvContent = `時間,場景ID,排程時間,聲音\r\n${rows.join('\r\n')}`;
        fileName = `響鈴紀錄_(匯出日期${todayString}).csv`;
        fs.writeFileSync(path.join(exportBasePath, fileName), Buffer.concat([bom, Buffer.from(csvContent)]));
        message = `已匯出 ${bellHistory.length} 筆響鈴紀錄至 ${exportDirectoryInfo.sourceLabel}：${exportBasePath}`;
        status = 'success';
      }
    } else {
      const allRecords = dbModule.loadPunchRecords();
      const employees = dbModule.loadEmployees();
      let recordsToExport = [];

      if (task.target === 'last_week_records' || task.target === 'last_month_records') {
        recordsToExport = allRecords.filter((record) => record.timestamp >= startTime.getTime() && record.timestamp <= endTime.getTime());
      } else if (task.target === 'manual_records') {
        recordsToExport = allRecords.filter((record) => record.source === 'manual');
      } else if (task.target === 'all_records') {
        recordsToExport = allRecords;
      }

      if (!recordsToExport.length) {
        message = `目前沒有符合「${descriptiveDateRange}」的打卡紀錄可匯出。`;
      } else {
        recordsToExport.sort((a, b) => a.timestamp - b.timestamp);
        const rows = recordsToExport.map((record) => {
          const employee = employees.find((item) => item.id === record.id) || { name: '未知員工' };
          const formatted = formatPunchRecord(record);
          return [
            `"${record.id}"`,
            `"${employee.name}"`,
            `"${formatted.dateText}"`,
            `"${formatted.timeText}"`,
            `"${record.shift}"`,
            `"${formatted.statusText}"`,
            `"${formatted.sourceText}"`
          ].join(',');
        });
        csvContent = buildAttendanceExportCsv(recordsToExport, employees, {
          templateId: task.export_template,
          customFieldIds: getAttendanceExportCustomFields()
        });
        fileName = buildExportFileName('考勤報表', startTime, endTime, descriptiveDateRange);
        fs.writeFileSync(path.join(exportBasePath, fileName), Buffer.concat([bom, Buffer.from(csvContent)]));
        message = `已匯出 ${recordsToExport.length} 筆 ${descriptiveDateRange} 至 ${exportDirectoryInfo.sourceLabel}：${exportBasePath}`;
        status = 'success';
      }
    }
  } else if (task.task_type === 'delete') {
    let result;
    switch (task.target) {
      case 'last_week_records':
      case 'last_month_records':
        result = dbModule.deletePunchRecordsByDateRange(startTime.getTime(), endTime.getTime());
        message = `已刪除 ${result.changes} 筆 ${descriptiveDateRange}。`;
        notificationType = 'punchRecords';
        status = 'success';
        break;
      case 'manual_records':
        result = dbModule.deletePunchRecordsBySource('manual');
        message = `已刪除 ${result.changes} 筆手動補登紀錄。`;
        notificationType = 'punchRecords';
        status = 'success';
        break;
      case 'all_records':
        result = dbModule.deletePunchRecordsByDateRange(0, Date.now());
        message = `已刪除全部 ${result.changes} 筆打卡紀錄。`;
        notificationType = 'punchRecords';
        status = 'success';
        break;
      case 'all_employees':
        result = dbModule.deleteAllEmployees();
        message = `已刪除全部 ${result.changes} 筆員工資料。`;
        notificationType = 'employees';
        status = 'success';
        break;
      case 'all_bell_records':
        result = dbModule.clearBellHistory();
        message = `已刪除全部 ${result.changes} 筆響鈴紀錄。`;
        notificationType = 'bellHistory';
        status = 'success';
        break;
      case 'log':
        result = dbModule.clearAutomationLog();
        message = `已清空 ${result.changes} 筆自動化日誌。`;
        notificationType = 'automationLog';
        status = 'success';
        break;
      default:
        message = `不支援的任務目標：${task.target}`;
        status = 'error';
        break;
    }
  }

  dbModule.addAutomationLog({
    timestamp: Date.now(),
    message,
    status
  });

  notifyDesktop(notificationType || 'automationLog');
  return { notificationType, message, status };
}

function attachExternalApiRoutes(server) {
  server.get('/api/employees', requireExternalApiAccess, (request, response) => {
    response.json({ success: true, data: dbModule.loadEmployees() });
  });

  server.get('/api/employees/:id', requireExternalApiAccess, (request, response) => {
    const employee = getEmployeeById(request.params.id);
    if (!employee) {
      response.status(404).json({ success: false, error: '找不到指定員工。' });
      return;
    }
    response.json({ success: true, data: employee });
  });

  server.get('/api/records', requireExternalApiAccess, (request, response) => {
    response.json({ success: true, data: dbModule.loadPunchRecords().map(formatPunchRecord) });
  });

  server.get('/api/records/range', requireExternalApiAccess, (request, response) => {
    const { start, end } = request.query;
    if (!start || !end) {
      response.status(400).json({ success: false, error: '請提供 start 與 end 日期。' });
      return;
    }

    const startDate = new Date(`${start}T00:00:00`);
    const endDate = new Date(`${end}T23:59:59.999`);
    const records = dbModule.loadPunchRecords()
      .filter((record) => record.timestamp >= startDate.getTime() && record.timestamp <= endDate.getTime())
      .map(formatPunchRecord);

    response.json({ success: true, data: records });
  });

  server.get('/api/records/employee/:id', requireExternalApiAccess, (request, response) => {
    const employeeId = request.params.id;
    const records = dbModule.loadPunchRecords()
      .filter((record) => record.id === employeeId)
      .sort((a, b) => b.timestamp - a.timestamp)
      .map(formatPunchRecord);

    response.json({ success: true, data: records });
  });

  server.post('/api/punch', requireExternalApiAccess, (request, response) => {
    let employee = null;
    let normalizedCardId = '';
    try {
      const { cardId } = request.body || {};
      normalizedCardId = String(cardId || '').trim();
      if (!normalizedCardId) {
        const errorMessage = withSupportCode('P101', '外部裝置沒有送出 cardId 欄位。');
        writePunchFailureAuditLog({
          request,
          channel: 'api',
          code: 'P101',
          reason: errorMessage
        });
        response.status(400).json({ success: false, error: errorMessage });
        return;
      }

      employee = getEmployeeByCard(normalizedCardId);
      if (!employee) {
        const errorMessage = withSupportCode('P102', `找不到外部裝置送出的卡號（後 4 碼：${normalizedCardId.slice(-4) || '空白'}）。`);
        writePunchFailureAuditLog({
          request,
          channel: 'api',
          code: 'P102',
          reason: errorMessage,
          credentialValue: normalizedCardId
        });
        response.status(404).json({ success: false, error: errorMessage });
        return;
      }

      const punchResult = createPunchRecord(employee, {
        source: 'api',
        shift: '外部裝置',
        allowDuplicateRecord: false
      });

      notifyDesktop('punchRecords');
      response.json({
        success: true,
        message: 'Punch record created successfully',
        data: {
          employeeName: employee.name,
          punchType: punchResult.record.type,
          timestamp: punchResult.record.timestamp
        }
      });
    } catch (error) {
      const errorMessage = formatGenericPunchFailure(error, 'P199');
      writePunchFailureAuditLog({
        request,
        employee,
        channel: 'api',
        code: extractSupportCode(errorMessage) || 'P199',
        reason: errorMessage,
        credentialValue: normalizedCardId
      });
      response.status(error.statusCode || 500).json({ success: false, error: errorMessage });
    }
  });
}

function attachBrowserRoutes(server) {
  server.get('/api/browser/health', (request, response) => {
    response.json({
      success: true,
      data: getSystemHealthSnapshot()
    });
  });

  server.get('/api/browser/public-settings', (request, response) => {
    response.json({
      success: true,
      data: {
        displaySettings: getBrowserDisplaySettings()
      }
    });
  });

  server.get('/api/browser/events', (request, response) => {
    const token = String(request.query?.token || '').trim();
    const session = browserSessions.get(token);
    if (!session) {
      response.status(401).json({ success: false, error: '無效的同步 Token。' });
      return;
    }

    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders?.();

    const clientId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const heartbeat = setInterval(() => {
      try {
        response.write(': heartbeat\n\n');
      } catch (error) {
        clearInterval(heartbeat);
      }
    }, 25000);

    browserEventClients.set(clientId, {
      token,
      response,
      heartbeat
    });

    response.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`);

    request.on('close', () => {
      clearInterval(heartbeat);
      browserEventClients.delete(clientId);
    });
  });

  server.post('/api/browser/login', (request, response) => {
    try {
      const { role, employeeId, secret, deviceInfo } = request.body || {};
      const normalizedRole = String(role || '').trim();
      const normalizedEmployeeId = String(employeeId || '').trim();
      const normalizedSecret = String(secret || '').trim();
      const normalizedDeviceInfo = normalizeClientDeviceInfo(deviceInfo || {});

      if (!['employee', 'admin', 'developer'].includes(normalizedRole)) {
        response.status(400).json({ success: false, error: withSupportCode('L100', '不支援的登入角色。') });
        return;
      }
      if (!normalizedEmployeeId || !normalizedSecret) {
        response.status(400).json({ success: false, error: withSupportCode('L101', '請輸入工號與卡號或密碼資訊。') });
        return;
      }

      const employee = getEmployeeById(normalizedEmployeeId);
      let deviceAuthorization = null;
      if (!employee) {
        response.status(404).json({ success: false, error: withSupportCode('L102', '找不到這個工號。') });
        return;
      }

      if (normalizedRole === 'employee' && String(employee.card || '').trim() !== normalizedSecret) {
        response.status(401).json({ success: false, error: withSupportCode('L103', '員工登入失敗，請確認工號與卡號。') });
        return;
      }
      if (normalizedRole === 'employee') {
        deviceAuthorization = authorizeEmployeeDeviceForLogin(employee, request, normalizedDeviceInfo);
      }
      if (normalizedRole === 'admin' && normalizedSecret !== getSettingValue('adminPassword', DEFAULT_ADMIN_PASSWORD)) {
        response.status(401).json({ success: false, error: '管理者登入失敗，請確認工號與管理者密碼。' });
        return;
      }
      if (normalizedRole === 'developer' && normalizedSecret !== getSettingValue('systemPassword', DEFAULT_SYSTEM_PASSWORD)) {
        response.status(401).json({ success: false, error: '開發人員登入失敗，請確認工號與系統密碼。' });
        return;
      }

      const token = createBrowserSession(normalizedRole, employee.id, {
        realEmployeeName: employee.name || '',
        deviceId: deviceAuthorization?.deviceRecord?.device_id || normalizedDeviceInfo.deviceId || null,
        deviceName: deviceAuthorization?.deviceRecord?.device_name || normalizedDeviceInfo.deviceName || null,
        devicePlatform: normalizedDeviceInfo.platform || null,
        deviceBrowserName: normalizedDeviceInfo.browserName || null,
        ipAddress: getRequestIpAddress(request),
        userAgent: request.headers['user-agent'] || null
      });
      writeAuditLog({
        actor_id: employee.id,
        actor_name: employee.name,
        role: normalizedRole,
        channel: 'browser',
        action: 'login',
        target_type: 'session',
        target_id: employee.id,
        summary: `瀏覽器${normalizedRole}登入成功`,
        after_data: {
          role: normalizedRole,
          device_binding_enabled: deviceAuthorization?.securitySettings?.deviceBindingEnabled ?? false,
          device_name: deviceAuthorization?.deviceRecord?.device_name || normalizedDeviceInfo.deviceName || '',
          newly_bound_device: deviceAuthorization?.newlyBound === true
        },
        success: true,
        ip_address: getRequestIpAddress(request),
        session_token_suffix: getSessionTokenSuffix(token)
      });
      response.json({
        success: true,
        token,
        dashboard: buildDashboardForSession(browserSessions.get(token)),
        deviceBinding: {
          enabled: deviceAuthorization?.securitySettings?.deviceBindingEnabled ?? false,
          newlyBound: deviceAuthorization?.newlyBound === true,
          deviceName: deviceAuthorization?.deviceRecord?.device_name || normalizedDeviceInfo.deviceName || '',
          issuedDeviceToken: deviceAuthorization?.issuedDeviceToken || ''
        }
      });
    } catch (error) {
      response.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
  });

  server.get('/api/browser/dashboard', requireBrowserSession, (request, response) => {
    try {
      response.json({ success: true, dashboard: buildDashboardForSession(request.browserSession) });
    } catch (error) {
      response.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
  });

  server.post('/api/browser/punch', requireBrowserSession, requireBrowserRole('employee'), (request, response) => {
    let employee = null;
    try {
      employee = getEmployeeById(request.browserSession.employeeId);
      if (!employee) {
        const errorMessage = withSupportCode('P240', '登入帳號對應的員工資料已不存在，請重新登入。');
        writePunchFailureAuditLog({
          request,
          channel: 'browser',
          code: 'P240',
          reason: errorMessage
        });
        response.status(401).json({ success: false, error: errorMessage });
        return;
      }
      const { securitySettings, deviceRecord } = validateEmployeeSessionDevice(request.browserSession, request);
      const locationValidation = validatePunchLocationPayload(request.body?.location, securitySettings);
      const updatedDevice = updateEmployeeDeviceLocation(
        employee.id,
        deviceRecord,
        request,
        locationValidation.normalizedLocation
      );
      const punchResult = createPunchRecord(employee, {
        source: 'browser',
        allowDuplicateRecord: true,
        ip_address: getRequestIpAddress(request),
        user_agent: request.headers['user-agent'] || null,
        device_id: request.browserSession.deviceId || updatedDevice?.device_id || null,
        device_name: request.browserSession.deviceName || updatedDevice?.device_name || null,
        gps_lat: locationValidation.normalizedLocation?.latitude ?? null,
        gps_lng: locationValidation.normalizedLocation?.longitude ?? null,
        gps_accuracy: locationValidation.normalizedLocation?.accuracy ?? null,
        gps_captured_at: locationValidation.normalizedLocation?.capturedAt ?? null,
        gps_status: locationValidation.gpsStatus,
        risk_flags: locationValidation.riskFlags
      });
      notifyDesktop('punchRecords');

      const message = punchResult.record.status === '重複打卡'
        ? `1 分鐘內已打過${punchResult.record.type === 'in' ? '上班' : '下班'}卡，系統已記錄為重複打卡。`
        : `${employee.name} 打卡成功（${punchResult.record.type === 'in' ? '上班' : '下班'}）`;

      writeBrowserAuditLog(request, {
        action: 'punch',
        target_type: 'punch_record',
        target_id: `${employee.id}_${punchResult.record.timestamp}`,
        summary: `${employee.id} ${employee.name} 於瀏覽器${punchResult.record.type === 'in' ? '上班' : '下班'}打卡`,
        after_data: {
          employee_id: employee.id,
          type: punchResult.record.type,
          status: punchResult.record.status,
          source: punchResult.record.source,
          device_id: punchResult.record.device_id,
          device_name: punchResult.record.device_name,
          gps_status: punchResult.record.gps_status,
          gps_accuracy: punchResult.record.gps_accuracy,
          risk_flags: punchResult.record.risk_flags
        }
      });

      response.json({
        success: true,
        message,
        data: {
          dashboard: buildDashboardForSession(request.browserSession)
        }
      });
    } catch (error) {
      const errorMessage = formatGenericPunchFailure(error);
      writePunchFailureAuditLog({
        request,
        employee,
        channel: 'browser',
        code: extractSupportCode(errorMessage) || 'P299',
        reason: errorMessage
      });
      response.status(error.statusCode || 500).json({ success: false, error: errorMessage });
    }
  });

  server.post('/api/browser/employee/leave/request', requireBrowserSession, requireBrowserRole('employee'), (request, response) => {
    try {
      const employee = getEmployeeById(request.browserSession.employeeId);
      if (!employee) throw createHttpError('登入帳號對應的員工資料已不存在，請重新登入。', 401);

      const leaveTypes = dbModule.loadLeaveTypes();
      const leaveTypeId = String(request.body?.leaveTypeId || request.body?.leave_type_id || '').trim();
      const leaveType = leaveTypes.find((type) => type.id === leaveTypeId && type.enabled);
      if (!leaveType) throw createHttpError('請選擇有效的假別。', 400);

      const startAt = parseLeaveDateTime(request.body?.startDate, request.body?.startTime, '09:00');
      const endAt = parseLeaveDateTime(request.body?.endDate, request.body?.endTime, '18:00');
      if (endAt <= startAt) throw createHttpError('請假結束時間必須晚於開始時間。', 400);

      const durationHours = calculateLeaveDurationHours(startAt, endAt, request.body?.durationHours);
      if (durationHours <= 0) throw createHttpError('請輸入有效的請假時數。', 400);
      if (dbModule.hasOverlappingLeaveRequest(employee.id, startAt, endAt)) {
        throw createHttpError('這段時間已經有待審或已核准的請假申請。', 409);
      }

      const supervisorId = getLeaveSupervisorForEmployee(employee);
      if (!supervisorId) {
        throw createHttpError(`尚未設定「${employee.department || '未指定部門'}」的請假主管審核路徑，請先聯絡管理者。`, 400);
      }
      if (!getEmployeeById(supervisorId)) {
        throw createHttpError('此部門設定的請假主管不存在，請先聯絡管理者修正。', 400);
      }

      const now = Date.now();
      const leaveRequest = {
        id: `leave_${now}_${crypto.randomBytes(4).toString('hex')}`,
        employee_id: employee.id,
        leave_type_id: leaveType.id,
        start_at: startAt,
        end_at: endAt,
        duration_hours: durationHours,
        reason: String(request.body?.reason || '').trim(),
        status: 'pending_supervisor',
        supervisor_id: supervisorId,
        created_at: now,
        updated_at: now
      };
      dbModule.createLeaveRequest(leaveRequest);
      writeBrowserAuditLog(request, {
        action: 'create',
        target_type: 'leave_request',
        target_id: leaveRequest.id,
        summary: `${employee.id} ${employee.name} 送出請假申請：${leaveType.name}`,
        after_data: leaveRequest
      });
      notifyDesktop('leaveRequests', getBrowserSyncMeta(request));
      response.json({
        success: true,
        message: '請假申請已送出，等待主管審核。',
        data: { dashboard: buildDashboardForSession(request.browserSession) }
      });
    } catch (error) {
      response.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
  });

  server.post('/api/browser/employee/leave/withdraw', requireBrowserSession, requireBrowserRole('employee'), (request, response) => {
    try {
      const requestId = String(request.body?.requestId || '').trim();
      const leaveRequest = dbModule.getLeaveRequestById(requestId);
      if (!leaveRequest) throw createHttpError('找不到指定的請假申請。', 404);
      if (leaveRequest.employee_id !== request.browserSession.employeeId) {
        throw createHttpError('只能撤回自己的請假申請。', 403);
      }
      if (!['pending_supervisor', 'pending_admin'].includes(leaveRequest.status)) {
        throw createHttpError('只有尚未終審的請假申請可以撤回。', 400);
      }
      dbModule.withdrawLeaveRequest({ requestId, withdrawnAt: Date.now() });
      writeBrowserAuditLog(request, {
        action: 'withdraw',
        target_type: 'leave_request',
        target_id: requestId,
        summary: `撤回請假申請 ${requestId}`,
        before_data: leaveRequest
      });
      notifyDesktop('leaveRequests', getBrowserSyncMeta(request));
      response.json({
        success: true,
        message: '請假申請已撤回。',
        data: { dashboard: buildDashboardForSession(request.browserSession) }
      });
    } catch (error) {
      response.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
  });

  server.post('/api/browser/employee/leave/supervisor-decision', requireBrowserSession, requireBrowserRole('employee'), (request, response) => {
    try {
      const requestId = String(request.body?.requestId || '').trim();
      const decision = String(request.body?.decision || '').trim() === 'approved' ? 'approved' : 'rejected';
      const leaveRequest = dbModule.getLeaveRequestById(requestId);
      if (!leaveRequest) throw createHttpError('找不到指定的請假申請。', 404);
      if (leaveRequest.supervisor_id !== request.browserSession.employeeId) {
        throw createHttpError('只有指定主管可以審核這張請假申請。', 403);
      }
      if (leaveRequest.status !== 'pending_supervisor') {
        throw createHttpError('這張請假申請目前不在主管審核階段。', 400);
      }
      const comment = String(request.body?.comment || '').trim();
      dbModule.updateLeaveRequestSupervisorDecision({
        requestId,
        decision,
        comment,
        decidedAt: Date.now()
      });
      writeBrowserAuditLog(request, {
        action: decision === 'approved' ? 'approve' : 'reject',
        target_type: 'leave_request',
        target_id: requestId,
        summary: `主管${decision === 'approved' ? '核准並送管理部複核' : '駁回'}請假申請 ${requestId}`,
        before_data: leaveRequest,
        after_data: { decision, comment }
      });
      notifyDesktop('leaveRequests', getBrowserSyncMeta(request));
      response.json({
        success: true,
        message: decision === 'approved' ? '已送交管理部複核。' : '請假申請已由主管駁回。',
        data: { dashboard: buildDashboardForSession(request.browserSession) }
      });
    } catch (error) {
      response.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
  });

  server.post('/api/browser/logout', requireBrowserSession, (request, response) => {
    writeBrowserAuditLog(request, {
      action: 'logout',
      target_type: 'session',
      target_id: request.browserSession.employeeId,
      summary: `瀏覽器${request.browserSession.role}登出`
    });
    browserSessions.delete(request.browserSession.token);
    response.json({ success: true });
  });

  server.post('/api/browser/admin/employees/save', requireBrowserSession, requireBrowserRole('admin'), (request, response) => {
    const previousEmployees = dbModule.loadEmployees();
    const employees = Array.isArray(request.body?.employees) ? request.body.employees.map(normalizeEmployee) : [];
    dbModule.saveEmployees(employees);
    const retainedIds = new Set(employees.map((employee) => employee.id));
    previousEmployees
      .filter((employee) => !retainedIds.has(employee.id))
      .forEach((employee) => dbModule.deleteEmployeeDevicesByEmployee(employee.id));
    writeBrowserAuditLog(request, {
      action: 'save',
      target_type: 'employee_batch',
      target_id: 'all',
      summary: `整批覆寫員工資料，共 ${employees.length} 筆`,
      before_data: { count: previousEmployees.length },
      after_data: { count: employees.length }
    });
    notifyDesktop('employees', getBrowserSyncMeta(request));
    response.json({ success: true, message: '員工資料已儲存。' });
  });

  server.post('/api/browser/admin/employee/save', requireBrowserSession, requireBrowserRole('admin'), (request, response) => {
    const originalId = String(request.body?.originalId || '').trim();
    const employee = normalizeEmployee(request.body?.employee || {});

    if (!employee.id || !employee.name || !employee.department || !employee.card || !employee.password) {
      response.status(400).json({ success: false, error: '工號、姓名、部門、卡號與密碼為必填。' });
      return;
    }

    const employees = dbModule.loadEmployees();
    const compareId = originalId || employee.id;
    const previousEmployee = employees.find((item) => item.id === compareId || item.id === employee.id) || null;
    const duplicateCard = employees.some((item) => item.card === employee.card && item.id !== compareId);
    if (duplicateCard) {
      response.status(400).json({ success: false, error: '卡號不可與其他員工重複。' });
      return;
    }

    const filteredEmployees = employees.filter((item) => item.id !== compareId && item.id !== employee.id);
    filteredEmployees.push(employee);
    filteredEmployees.sort((a, b) => String(a.id).localeCompare(String(b.id)));

    dbModule.saveEmployees(filteredEmployees);
    if (previousEmployee && compareId && compareId !== employee.id) {
      dbModule.deleteEmployeeDevicesByEmployee(compareId);
    }
    writeBrowserAuditLog(request, {
      action: previousEmployee ? 'update' : 'create',
      target_type: 'employee',
      target_id: employee.id,
      summary: `${previousEmployee ? '更新' : '新增'}員工 ${employee.id} ${employee.name}`,
      before_data: previousEmployee,
      after_data: employee
    });
    notifyDesktop('employees', getBrowserSyncMeta(request));
    response.json({ success: true, message: '員工資料已儲存。' });
  });

  server.post('/api/browser/admin/card-reader-test-log', requireBrowserSession, requireBrowserRole('admin'), (request, response) => {
    const success = request.body?.success !== false && String(request.body?.success || 'true') !== 'false';
    const failureCode = String(request.body?.failureCode || '').trim();
    const failureReason = String(request.body?.failureReason || '').trim();
    const warningCode = String(request.body?.warningCode || '').trim();
    const warningReason = String(request.body?.warningReason || '').trim();
    const credentialInput = String(request.body?.credentialInput || '').trim();
    const inputLength = Number(request.body?.inputLength || 0);
    const inputSuffix = String(request.body?.inputSuffix || '').trim();
    const cardHash = String(request.body?.cardHash || '').trim();
    const duplicateEmployeeId = String(request.body?.duplicateEmployeeId || '').trim();
    const duplicateEmployeeName = String(request.body?.duplicateEmployeeName || '').trim();
    const summary = success
      ? (warningCode
        ? `讀卡測試成功，但需要注意：${warningCode} ${warningReason || ''}`.trim()
        : '讀卡測試成功。')
      : `讀卡測試失敗：${failureCode || 'R000'} ${failureReason || ''}`.trim();

    writeBrowserAuditLog(request, {
      action: 'execute',
      target_type: 'card_reader_test',
      target_id: duplicateEmployeeId || null,
      summary,
      after_data: {
        diagnostic_type: 'card_reader_test',
        ...(failureCode ? { failure_code: failureCode } : {}),
        ...(failureReason ? { failure_reason: failureReason } : {}),
        ...(warningCode ? { warning_code: warningCode } : {}),
        ...(warningReason ? { warning_reason: warningReason } : {}),
        ...(credentialInput ? { credential_input: credentialInput } : {}),
        input_length: inputLength,
        input_suffix: inputSuffix,
        ...(cardHash ? { card_hash: cardHash } : {}),
        ...(duplicateEmployeeId ? { duplicate_employee_id: duplicateEmployeeId } : {}),
        ...(duplicateEmployeeName ? { duplicate_employee_name: duplicateEmployeeName } : {})
      },
      success
    });
    response.json({ success: true, message: '讀卡診斷已記錄。' });
  });

  server.post('/api/browser/admin/employee/delete', requireBrowserSession, requireBrowserRole('admin'), (request, response) => {
    const employeeId = String(request.body?.employeeId || '').trim();
    if (!employeeId) {
      response.status(400).json({ success: false, error: '缺少 employeeId。' });
      return;
    }

    const employees = dbModule.loadEmployees();
    const deletedEmployee = employees.find((item) => item.id === employeeId) || null;
    const updatedEmployees = employees.filter((item) => item.id !== employeeId);
    dbModule.saveEmployees(updatedEmployees);
    dbModule.deleteEmployeeDevicesByEmployee(employeeId);
    writeBrowserAuditLog(request, {
      action: 'delete',
      target_type: 'employee',
      target_id: employeeId,
      summary: `刪除員工 ${employeeId}`,
      before_data: deletedEmployee
    });
    notifyDesktop('employees', getBrowserSyncMeta(request));
    response.json({ success: true, message: '員工資料已刪除。' });
  });

  server.post('/api/browser/admin/security-settings/save', requireBrowserSession, requireBrowserRole('admin'), (request, response) => {
    try {
      const previousSettings = getBrowserSecuritySettings();
      const nextSettings = normalizeBrowserSecuritySettings(request.body || {});
      dbModule.setSetting('browserSecuritySettings', nextSettings);
      writeBrowserAuditLog(request, {
        action: 'update',
        target_type: 'browser_security_setting',
        target_id: 'browserSecuritySettings',
        summary: '更新遠端打卡安全設定',
        before_data: previousSettings,
        after_data: nextSettings
      });
      notifyDesktop('securitySettings', getBrowserSyncMeta(request));
      response.json({ success: true, message: '遠端打卡安全設定已更新。' });
    } catch (error) {
      response.status(error.statusCode || 400).json({ success: false, error: error.message });
    }
  });

  server.post('/api/browser/admin/employee-device/delete', requireBrowserSession, requireBrowserRole('admin'), (request, response) => {
    const employeeId = String(request.body?.employeeId || '').trim();
    const deviceId = String(request.body?.deviceId || '').trim();
    if (!employeeId || !deviceId) {
      response.status(400).json({ success: false, error: '缺少 employeeId 或 deviceId。' });
      return;
    }

    const device = dbModule.getEmployeeDevice(employeeId, deviceId);
    if (!device) {
      response.status(404).json({ success: false, error: '找不到指定的綁定裝置。' });
      return;
    }

    dbModule.deleteEmployeeDevice(employeeId, deviceId);
    writeBrowserAuditLog(request, {
      action: 'delete',
      target_type: 'employee_device',
      target_id: `${employeeId}:${deviceId}`,
      summary: `解除 ${employeeId} 的綁定裝置`,
      before_data: device
    });
    notifyDesktop('employeeDevices', getBrowserSyncMeta(request));
    response.json({ success: true, message: '裝置綁定已解除。' });
  });

  server.post('/api/browser/admin/employee-devices/clear', requireBrowserSession, requireBrowserRole('admin'), (request, response) => {
    const employeeId = String(request.body?.employeeId || '').trim();
    if (!employeeId) {
      response.status(400).json({ success: false, error: '缺少 employeeId。' });
      return;
    }

    const devices = dbModule.loadEmployeeDevices(employeeId);
    dbModule.deleteEmployeeDevicesByEmployee(employeeId);
    writeBrowserAuditLog(request, {
      action: 'clear',
      target_type: 'employee_device',
      target_id: employeeId,
      summary: `清除 ${employeeId} 的全部綁定裝置`,
      before_data: devices
    });
    notifyDesktop('employeeDevices', getBrowserSyncMeta(request));
    response.json({ success: true, message: '員工綁定裝置已全部清除。' });
  });

  server.post('/api/browser/admin/shifts/save', requireBrowserSession, requireBrowserRole('admin'), (request, response) => {
    const previousShifts = dbModule.loadShifts();
    const shifts = Array.isArray(request.body?.shifts)
      ? request.body.shifts.map((shift) => ({
        name: String(shift.name || '').trim(),
        start: String(shift.start || '').trim(),
        end: String(shift.end || '').trim()
      }))
      : [];
    dbModule.saveShifts(shifts);
    writeBrowserAuditLog(request, {
      action: 'save',
      target_type: 'shift_batch',
      target_id: 'all',
      summary: `儲存班別設定，共 ${shifts.length} 組`,
      before_data: { count: previousShifts.length },
      after_data: { count: shifts.length }
    });
    notifyDesktop('shifts', getBrowserSyncMeta(request));
    response.json({ success: true, message: '班別設定已更新。' });
  });

  server.post('/api/browser/admin/manual-punch', requireBrowserSession, requireBrowserRole('admin'), (request, response) => {
    const { employeeQuery, date, time, shift, status } = request.body || {};
    const employee = getEmployeeByAnyCredential(String(employeeQuery || '').trim());
    if (!employee) {
      response.status(404).json({ success: false, error: '找不到員工，請確認工號、卡號或密碼。' });
      return;
    }
    if (!date || !time) {
      response.status(400).json({ success: false, error: '請輸入補登日期與時間。' });
      return;
    }

    const timestamp = new Date(`${date}T${time}`).getTime();
    dbModule.addPunchRecord({
      id: employee.id,
      timestamp,
      type: status === 'out' ? 'out' : 'in',
      shift: String(shift || '').trim() || '手動補登',
      status: '正常',
      source: 'manual'
    });
    writeBrowserAuditLog(request, {
      action: 'punch',
      target_type: 'manual_punch',
      target_id: `${employee.id}_${timestamp}`,
      summary: `為 ${employee.id} ${employee.name} 建立手動補登`,
      after_data: {
        employee_id: employee.id,
        type: status === 'out' ? 'out' : 'in',
        shift: String(shift || '').trim() || '手動補登',
        date,
        time
      }
    });
    notifyDesktop('punchRecords', getBrowserSyncMeta(request));
    response.json({ success: true, message: `已為 ${employee.name} 補登打卡。` });
  });

  server.post('/api/browser/admin/reports/query', requireBrowserSession, requireBrowserRole('admin'), (request, response) => {
    try {
      const report = buildAdminAttendanceReport(request.body || {});
      response.json({
        success: true,
        message: '考勤報表查詢完成。',
        data: report
      });
    } catch (error) {
      response.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
  });

  server.post('/api/browser/admin/reports/export', requireBrowserSession, requireBrowserRole('admin'), (request, response) => {
    try {
      const report = buildAdminAttendanceReport(request.body || {});
      const startDate = new Date(`${report.filters.startDate}T00:00:00`);
      const endDate = new Date(`${report.filters.endDate}T23:59:59.999`);
      writeBrowserAuditLog(request, {
        action: 'export',
        target_type: 'attendance_report',
        target_id: `${report.filters.startDate}_${report.filters.endDate}`,
        summary: `匯出考勤報表，共 ${report.records.length} 筆`,
        after_data: {
          employee_id: report.filters.employeeId || '',
          start_date: report.filters.startDate,
          end_date: report.filters.endDate,
          record_count: report.records.length
        }
      });

      response.json({
        success: true,
        message: '考勤報表匯出內容已產生。',
        data: {
          fileName: buildExportFileName('考勤報表', startDate, endDate),
          csvContent: buildAttendanceExportCsv(report.records, [], {
            templateId: 'payroll',
            customFieldIds: getAttendanceExportCustomFields()
          })
        }
      });
    } catch (error) {
      response.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
  });

  server.post('/api/browser/admin/leave/final-decision', requireBrowserSession, requireBrowserRole('admin'), (request, response) => {
    try {
      const requestId = String(request.body?.requestId || '').trim();
      const decision = String(request.body?.decision || '').trim() === 'approved' ? 'approved' : 'rejected';
      const leaveRequest = dbModule.getLeaveRequestById(requestId);
      if (!leaveRequest) throw createHttpError('找不到指定的請假申請。', 404);
      if (leaveRequest.status !== 'pending_admin') {
        throw createHttpError('這張請假申請目前不在管理部複核階段。', 400);
      }
      const comment = String(request.body?.comment || '').trim();
      dbModule.updateLeaveRequestAdminDecision({
        requestId,
        decision,
        adminId: request.browserSession.employeeId,
        comment,
        decidedAt: Date.now()
      });
      writeBrowserAuditLog(request, {
        action: decision === 'approved' ? 'approve' : 'reject',
        target_type: 'leave_request',
        target_id: requestId,
        summary: `管理部${decision === 'approved' ? '終審核准' : '終審駁回'}請假申請 ${requestId}`,
        before_data: leaveRequest,
        after_data: { decision, comment }
      });
      notifyDesktop('leaveRequests', getBrowserSyncMeta(request));
      response.json({ success: true, message: decision === 'approved' ? '請假申請已核准生效。' : '請假申請已由管理部駁回。' });
    } catch (error) {
      response.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
  });

  server.post('/api/browser/admin/leave-types/save', requireBrowserSession, requireBrowserRole('admin'), (request, response) => {
    try {
      const types = Array.isArray(request.body?.leaveTypes)
        ? request.body.leaveTypes.map(normalizeLeaveTypePayload)
        : [];
      if (!types.some((type) => type.id && type.name)) {
        throw createHttpError('至少需要保留一個有效假別。', 400);
      }
      dbModule.saveLeaveTypes(types);
      writeBrowserAuditLog(request, {
        action: 'save',
        target_type: 'leave_type',
        target_id: 'all',
        summary: `儲存請假假別設定，共 ${types.length} 組`,
        after_data: { count: types.length }
      });
      notifyDesktop('leaveSettings', getBrowserSyncMeta(request));
      response.json({ success: true, message: '請假假別設定已更新。' });
    } catch (error) {
      response.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
  });

  server.post('/api/browser/admin/leave-routes/save', requireBrowserSession, requireBrowserRole('admin'), (request, response) => {
    try {
      const employees = dbModule.loadEmployees();
      const employeeIds = new Set(employees.map((employee) => employee.id));
      const routes = Array.isArray(request.body?.approvalRoutes)
        ? request.body.approvalRoutes.map(normalizeLeaveRoutePayload).filter((route) => route.department && route.supervisor_id)
        : [];
      const missingSupervisor = routes.find((route) => !employeeIds.has(route.supervisor_id));
      if (missingSupervisor) {
        throw createHttpError(`找不到主管員工：${missingSupervisor.supervisor_id}`, 400);
      }
      dbModule.saveLeaveApprovalRoutes(routes);
      writeBrowserAuditLog(request, {
        action: 'save',
        target_type: 'leave_approval_route',
        target_id: 'all',
        summary: `儲存請假審核路徑，共 ${routes.length} 組`,
        after_data: { count: routes.length }
      });
      notifyDesktop('leaveSettings', getBrowserSyncMeta(request));
      response.json({ success: true, message: '請假審核路徑已更新。' });
    } catch (error) {
      response.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
  });

  server.post('/api/browser/admin/data-settings', requireBrowserSession, requireBrowserRole('admin'), (request, response) => {
    const mainTitle = String(request.body?.mainTitle || '').trim();
    const subtitle = String(request.body?.subtitle || '').trim();
    const heroDescription = String(request.body?.heroDescription || '').trim();
    const previousSettings = getSettingsSnapshot();
    if (!mainTitle) {
      response.status(400).json({ success: false, error: '請輸入主標題。' });
      return;
    }
    dbModule.setSetting('mainTitle', mainTitle);
    dbModule.setSetting('subtitle', subtitle);
    dbModule.setSetting('browserHeroDescription', heroDescription);
    writeBrowserAuditLog(request, {
      action: 'update',
      target_type: 'display_settings',
      target_id: 'browser_home',
      summary: '更新主畫面顯示設定',
      before_data: previousSettings,
      after_data: getSettingsSnapshot()
    });
    notifyDesktop('displaySettings', getBrowserSyncMeta(request));
    response.json({ success: true, message: '主畫面標題已更新。' });
  });

  server.post('/api/browser/admin/change-admin-password', requireBrowserSession, requireBrowserRole('admin'), (request, response) => {
    const currentSystemPassword = String(request.body?.currentSystemPassword || '');
    const newPassword = String(request.body?.newPassword || '');
    if (currentSystemPassword !== getSettingValue('systemPassword', DEFAULT_SYSTEM_PASSWORD)) {
      response.status(400).json({ success: false, error: '系統密碼驗證失敗。' });
      return;
    }
    if (!newPassword) {
      response.status(400).json({ success: false, error: '請輸入新的管理者密碼。' });
      return;
    }
    dbModule.setSetting('adminPassword', newPassword);
    writeBrowserAuditLog(request, {
      action: 'change_password',
      target_type: 'admin_password',
      target_id: 'adminPassword',
      summary: '更新管理者密碼'
    });
    notifyDesktop('adminPassword', getBrowserSyncMeta(request));
    response.json({ success: true, message: '管理者密碼已更新。' });
  });

  server.post('/api/browser/admin/greetings/save', requireBrowserSession, requireBrowserRole('admin'), (request, response) => {
    const previousGreetings = dbModule.loadGreetings();
    const greetings = Array.isArray(request.body?.greetings) ? request.body.greetings.map(normalizeGreeting) : [];
    dbModule.saveGreetings(greetings);
    writeBrowserAuditLog(request, {
      action: 'save',
      target_type: 'greeting_batch',
      target_id: 'all',
      summary: `儲存問候語設定，共 ${greetings.length} 則`,
      before_data: { count: previousGreetings.length },
      after_data: { count: greetings.length }
    });
    notifyDesktop('greetings', getBrowserSyncMeta(request));
    response.json({ success: true, message: '問候語設定已更新。' });
  });

  server.post('/api/browser/admin/bell-schedules/save', requireBrowserSession, requireBrowserRole('admin'), (request, response) => {
    const previousBellSchedules = dbModule.loadBellSchedules();
    const bellSchedules = Array.isArray(request.body?.bellSchedules)
      ? request.body.bellSchedules.map(normalizeBellSchedule)
      : [];
    dbModule.saveBellSchedules(bellSchedules);
    writeBrowserAuditLog(request, {
      action: 'save',
      target_type: 'bell_schedule_batch',
      target_id: 'all',
      summary: `儲存響鈴排程，共 ${bellSchedules.length} 組`,
      before_data: { count: previousBellSchedules.length },
      after_data: { count: bellSchedules.length }
    });
    notifyDesktop('bellSchedules', getBrowserSyncMeta(request));
    response.json({ success: true, message: '響鈴排程已更新。' });
  });

  server.post('/api/browser/admin/custom-sounds/save', requireBrowserSession, requireBrowserRole('admin'), (request, response) => {
    const previousSounds = dbModule.loadCustomSounds();
    const customSounds = Array.isArray(request.body?.customSounds)
      ? request.body.customSounds.map((sound) => ({
          id: String(sound.id || `sound_${Date.now()}`),
          name: String(sound.name || '').trim(),
        path: String(sound.path || '').trim()
        }))
      : [];
    dbModule.saveCustomSounds(customSounds);
    writeBrowserAuditLog(request, {
      action: 'save',
      target_type: 'custom_sound_batch',
      target_id: 'all',
      summary: `儲存自訂聲音清單，共 ${customSounds.length} 筆`,
      before_data: { count: previousSounds.length },
      after_data: { count: customSounds.length }
    });
    notifyDesktop('customSounds', getBrowserSyncMeta(request));
    response.json({ success: true, message: '自訂聲音清單已更新。' });
  });

  server.post('/api/browser/admin/custom-sounds/upload', requireBrowserSession, requireBrowserRole('admin'), (request, response) => {
    try {
      const sound = saveUploadedSound(request.body?.dataUrl, request.body?.fileName);
      const updatedSounds = [...dbModule.loadCustomSounds(), { id: sound.id, name: sound.name, path: sound.path }];
      dbModule.saveCustomSounds(updatedSounds);
      writeBrowserAuditLog(request, {
        action: 'upload',
        target_type: 'custom_sound',
        target_id: sound.id,
        summary: `上傳自訂聲音 ${sound.name}`,
        after_data: sound
      });
      notifyDesktop('customSounds', getBrowserSyncMeta(request));
      response.json({ success: true, message: '聲音檔已上傳。', data: sound });
    } catch (error) {
      response.status(400).json({ success: false, error: error.message });
    }
  });

  server.post('/api/browser/admin/bell-history/clear', requireBrowserSession, requireBrowserRole('admin'), (request, response) => {
    const historyCount = dbModule.loadBellHistory().length;
    dbModule.clearBellHistory();
    writeBrowserAuditLog(request, {
      action: 'clear',
      target_type: 'bell_history',
      target_id: 'all',
      summary: `清空響鈴歷史，共 ${historyCount} 筆`,
      before_data: { count: historyCount },
      after_data: { count: 0 }
    });
    notifyDesktop('bellHistory', getBrowserSyncMeta(request));
    response.json({ success: true, message: '響鈴歷史已清空。' });
  });

  server.post('/api/browser/admin/special-effects/save', requireBrowserSession, requireBrowserRole('admin'), (request, response) => {
    const previousEffects = dbModule.loadSpecialEffects();
    const specialEffects = Array.isArray(request.body?.specialEffects)
      ? request.body.specialEffects.map(normalizeSpecialEffect)
      : [];
    dbModule.saveSpecialEffects(specialEffects);
    writeBrowserAuditLog(request, {
      action: 'save',
      target_type: 'special_effect_batch',
      target_id: 'all',
      summary: `儲存節日特效，共 ${specialEffects.length} 筆`,
      before_data: { count: previousEffects.length },
      after_data: { count: specialEffects.length }
    });
    notifyDesktop('specialEffects', getBrowserSyncMeta(request));
    response.json({ success: true, message: '節日特效設定已更新。' });
  });

  server.post('/api/browser/admin/theme-schedules/save', requireBrowserSession, requireBrowserRole('admin'), (request, response) => {
    const previousThemeSchedules = dbModule.loadThemeSchedules();
    const themeSchedules = Array.isArray(request.body?.themeSchedules)
      ? request.body.themeSchedules.map(normalizeThemeSchedule)
      : [];
    dbModule.saveThemeSchedules(themeSchedules);
    writeBrowserAuditLog(request, {
      action: 'save',
      target_type: 'theme_schedule_batch',
      target_id: 'all',
      summary: `儲存主題排程，共 ${themeSchedules.length} 筆`,
      before_data: { count: previousThemeSchedules.length },
      after_data: { count: themeSchedules.length }
    });
    notifyDesktop('themeSchedules', getBrowserSyncMeta(request));
    response.json({ success: true, message: '主題排程已更新。' });
  });

  server.post('/api/browser/admin/custom-themes/save', requireBrowserSession, requireBrowserRole('admin'), (request, response) => {
    const previousThemes = dbModule.loadCustomThemes();
    const customThemes = Array.isArray(request.body?.customThemes)
      ? request.body.customThemes.map(normalizeCustomTheme)
      : [];
    dbModule.saveCustomThemes(customThemes);
    writeBrowserAuditLog(request, {
      action: 'save',
      target_type: 'custom_theme_batch',
      target_id: 'all',
      summary: `儲存自訂主題，共 ${customThemes.length} 筆`,
      before_data: { count: previousThemes.length },
      after_data: { count: customThemes.length }
    });
    notifyDesktop('customThemes', getBrowserSyncMeta(request));
    response.json({ success: true, message: '自訂主題已更新。' });
  });

  server.post('/api/browser/admin/custom-themes/upload-image', requireBrowserSession, requireBrowserRole('admin'), (request, response) => {
    try {
      const image = saveUploadedThemeImage(request.body?.dataUrl, request.body?.fileName);
      writeBrowserAuditLog(request, {
        action: 'upload',
        target_type: 'theme_image',
        target_id: image.id,
        summary: `上傳主題圖片 ${image.name}`,
        after_data: image
      });
      response.json({ success: true, message: '主題背景圖已上傳。', data: image });
    } catch (error) {
      response.status(400).json({ success: false, error: error.message });
    }
  });

  server.post('/api/browser/developer/automation-tasks/save', requireBrowserSession, requireBrowserRole('developer'), (request, response) => {
    const previousTasks = dbModule.loadAutomationTasks();
    const tasks = Array.isArray(request.body?.automationTasks)
      ? request.body.automationTasks.map(normalizeAutomationTask)
      : [];
    dbModule.saveAutomationTasks(tasks);
    writeBrowserAuditLog(request, {
      action: 'save',
      target_type: 'automation_task_batch',
      target_id: 'all',
      summary: `儲存自動化任務，共 ${tasks.length} 筆`,
      before_data: { count: previousTasks.length },
      after_data: { count: tasks.length }
    });
    notifyDesktop('automationTasks', {
      origin: 'browser',
      sessionToken: request.browserSession.token
    });
    response.json({ success: true, message: '自動化任務已更新。' });
  });

  server.post('/api/browser/developer/automation-tasks/execute', requireBrowserSession, requireBrowserRole('developer'), async (request, response) => {
    try {
      const task = normalizeAutomationTask({
        ...request.body,
        id: request.body?.id || `immediate_${Date.now()}`,
        enabled: true
      });
      const result = await executeAutomationTask(task);
      writeBrowserAuditLog(request, {
        action: 'execute',
        target_type: 'automation_task',
        target_id: task.id,
        summary: `立即執行自動化任務 ${task.task_type} / ${task.target}`,
        after_data: {
          task_type: task.task_type,
          target: task.target,
          message: result.message || '立即任務已執行。'
        }
      });
      response.json({
        success: true,
        message: result.message || '立即任務已執行。',
        data: result
      });
    } catch (error) {
      response.status(500).json({ success: false, error: error.message });
    }
  });

  server.post('/api/browser/developer/audit-logs/query', requireBrowserSession, requireBrowserRole('developer'), (request, response) => {
    const filters = {
      startDate: String(request.body?.startDate || '').trim(),
      endDate: String(request.body?.endDate || '').trim(),
      actorId: String(request.body?.actorId || '').trim(),
      role: String(request.body?.role || '').trim(),
      action: String(request.body?.action || '').trim(),
      targetType: String(request.body?.targetType || '').trim(),
      success: String(request.body?.success || '').trim(),
      query: String(request.body?.query || '').trim(),
      limit: Number(request.body?.limit) || 100
    };
    const logs = dbModule.queryAuditLogs(filters);
    const total = dbModule.countAuditLogs(filters);
    response.json({
      success: true,
      message: `已查詢到 ${logs.length} 筆操作稽核紀錄。`,
      data: {
        filters,
        logs,
        total
      }
    });
  });

  server.post('/api/browser/developer/audit-archive-directory/select', requireBrowserSession, requireBrowserRole('developer'), async (request, response) => {
    try {
      const pickerResult = await openDirectoryPicker(request.body?.defaultPath);
      if (!pickerResult.success) {
        response.status(400).json({ success: false, error: pickerResult.message || '未選擇封存資料夾。' });
        return;
      }
      response.json({
        success: true,
        message: '已選擇稽核封存資料夾。',
        data: {
          path: pickerResult.path
        }
      });
    } catch (error) {
      response.status(500).json({ success: false, error: error.message });
    }
  });

  server.post('/api/browser/developer/audit-archive-settings/save', requireBrowserSession, requireBrowserRole('developer'), (request, response) => {
    try {
      const previousSettings = getAuditArchiveSettings();
      const retentionDays = normalizeRetentionDays(request.body?.retentionDays, DEFAULT_AUDIT_LOG_RETENTION_DAYS);
      const archiveDirectory = normalizeArchiveDirectoryPath(request.body?.archiveDirectory);
      dbModule.setSetting('auditLogRetentionDays', retentionDays);
      dbModule.setSetting('auditArchiveDirectory', archiveDirectory);
      writeBrowserAuditLog(request, {
        action: 'update',
        target_type: 'audit_archive_setting',
        target_id: 'auditArchiveSettings',
        summary: '更新稽核封存設定',
        before_data: {
          retentionDays: previousSettings.retentionDays,
          archiveDirectory: previousSettings.defaultDirectory
        },
        after_data: {
          retentionDays,
          archiveDirectory
        }
      });
      notifyDesktop('auditArchiveSettings', getBrowserSyncMeta(request));
      response.json({
        success: true,
        message: '稽核封存設定已更新。'
      });
    } catch (error) {
      response.status(400).json({ success: false, error: error.message });
    }
  });

  server.post('/api/browser/developer/audit-archive/run', requireBrowserSession, requireBrowserRole('developer'), (request, response) => {
    try {
      const result = archiveExpiredAuditLogs({ force: true, reason: 'manual' });
      if (!result.success) {
        writeBrowserAuditLog(request, {
          action: 'archive',
          target_type: 'audit_log',
          target_id: 'expired',
          summary: result.message,
          after_data: result,
          success: false
        });
        response.status(409).json({ success: false, error: result.message });
        return;
      }
      writeBrowserAuditLog(request, {
        action: 'archive',
        target_type: 'audit_log',
        target_id: 'expired',
        summary: result.message,
        after_data: {
          retentionDays: result.retentionDays,
          archivedCount: result.archivedCount,
          deletedCount: result.deletedCount,
          archiveFiles: result.archiveFiles.map((item) => ({
            archiveMonth: item.archiveMonth,
            recordCount: item.recordCount,
            filePath: item.filePath
          }))
        }
      });
      notifyDesktop('auditArchiveSettings', getBrowserSyncMeta(request));
      response.json({
        success: true,
        message: result.message,
        data: result
      });
    } catch (error) {
      response.status(500).json({ success: false, error: error.message });
    }
  });

  server.post('/api/browser/developer/automation-export-directory/select', requireBrowserSession, requireBrowserRole('developer'), async (request, response) => {
    try {
      const pickerResult = await openDirectoryPicker(request.body?.defaultPath);
      if (!pickerResult.success) {
        response.status(400).json({ success: false, error: pickerResult.message || '未選取資料夾。' });
        return;
      }
      response.json({
        success: true,
        message: '已選取匯出資料夾。',
        data: {
          path: pickerResult.path
        }
      });
    } catch (error) {
      response.status(500).json({ success: false, error: error.message });
    }
  });

  server.post('/api/browser/developer/automation-export-directory/save', requireBrowserSession, requireBrowserRole('developer'), (request, response) => {
    try {
      const directory = normalizeExportDirectoryPath(request.body?.defaultDirectory);
      const previousDirectory = getSettingValue('automationExportDirectory', '');
      dbModule.setSetting('automationExportDirectory', directory);
      writeBrowserAuditLog(request, {
        action: 'update',
        target_type: 'automation_export_directory',
        target_id: 'automationExportDirectory',
        summary: directory ? '更新預設匯出資料夾' : '清空預設匯出資料夾',
        before_data: { directory: previousDirectory },
        after_data: { directory }
      });
      notifyDesktop('automationExportDirectory', {
        origin: 'browser',
        sessionToken: request.browserSession.token
      });
      response.json({
        success: true,
        message: directory ? '預設匯出資料夾已更新。' : '已改回使用桌面資料夾作為預設匯出位置。'
      });
    } catch (error) {
      response.status(400).json({ success: false, error: error.message });
    }
  });

  server.post('/api/browser/developer/attendance-export-settings/save', requireBrowserSession, requireBrowserRole('developer'), (request, response) => {
    const previousCustomFields = getAttendanceExportCustomFields();
    const customFields = normalizeAttendanceExportCustomFields(request.body?.customFields);
    dbModule.setSetting('attendanceExportCustomFields', customFields);
    writeBrowserAuditLog(request, {
      action: 'save',
      target_type: 'attendance_export_settings',
      target_id: 'attendanceExportCustomFields',
      summary: `更新考勤報表匯出欄位，共 ${customFields.length} 項`,
      before_data: { customFields: previousCustomFields },
      after_data: { customFields }
    });
    notifyDesktop('attendanceExportSettings', {
      origin: 'browser',
      sessionToken: request.browserSession.token
    });
    response.json({ success: true, message: '考勤報表匯出欄位設定已更新。' });
  });

  server.post('/api/browser/developer/automation-log/clear', requireBrowserSession, requireBrowserRole('developer'), (request, response) => {
    const automationLogCount = dbModule.loadAutomationLog().length;
    dbModule.clearAutomationLog();
    writeBrowserAuditLog(request, {
      action: 'clear',
      target_type: 'automation_log',
      target_id: 'all',
      summary: `清空自動化日誌，共 ${automationLogCount} 筆`,
      before_data: { count: automationLogCount },
      after_data: { count: 0 }
    });
    notifyDesktop('automationLog', {
      origin: 'browser',
      sessionToken: request.browserSession.token
    });
    response.json({ success: true, message: '自動化日誌已清空。' });
  });

  server.post('/api/browser/developer/hero-description/save', requireBrowserSession, requireBrowserRole('developer'), (request, response) => {
    const heroDescription = String(request.body?.heroDescription || '').trim();
    const previousDescription = getSettingValue('browserHeroDescription', DEFAULT_DISPLAY_SETTINGS.heroDescription);
    dbModule.setSetting('browserHeroDescription', heroDescription);
    writeBrowserAuditLog(request, {
      action: 'update',
      target_type: 'hero_description',
      target_id: 'browserHeroDescription',
      summary: '更新頁首頁說明文字',
      before_data: { heroDescription: previousDescription },
      after_data: { heroDescription }
    });
    notifyDesktop('displaySettings', {
      origin: 'browser',
      sessionToken: request.browserSession.token
    });
    response.json({ success: true, message: '頁首頁說明已更新。' });
  });

  server.post('/api/browser/developer/impersonation/settings', requireBrowserSession, requireBrowserRole('developer'), (request, response) => {
    const currentPassword = String(request.body?.currentPassword || '');
    const enabled = normalizeBoolean(request.body?.enabled);
    if (currentPassword !== getSettingValue('systemPassword', DEFAULT_SYSTEM_PASSWORD)) {
      response.status(400).json({ success: false, error: '系統密碼錯誤，無法更新開發人員身份切換。' });
      return;
    }
    dbModule.setSetting('developerImpersonationEnabled', enabled);
    writeBrowserAuditLog(request, {
      action: 'update',
      target_type: 'setting',
      target_id: 'developerImpersonationEnabled',
      summary: `開發人員身份切換已${enabled ? '啟用' : '停用'}`,
      after_data: { enabled }
    });
    response.json({
      success: true,
      message: `開發人員身份切換已${enabled ? '啟用' : '停用'}。`,
      dashboard: buildDashboardForSession(request.browserSession)
    });
  });

  server.post('/api/browser/developer/impersonation/start', requireBrowserSession, requireDeveloperIdentity, (request, response) => {
    const session = request.browserSession;
    const targetRole = String(request.body?.targetRole || '').trim();
    const targetEmployeeId = String(request.body?.targetEmployeeId || '').trim();
    const systemPassword = String(request.body?.systemPassword || '');

    if (session.role !== 'developer') {
      response.status(400).json({ success: false, error: '請先返回開發人員頁面，再切換新的測試身份。' });
      return;
    }
    if (!isDeveloperImpersonationEnabled()) {
      response.status(403).json({ success: false, error: '開發人員身份切換尚未啟用。' });
      return;
    }
    if (systemPassword !== getSettingValue('systemPassword', DEFAULT_SYSTEM_PASSWORD)) {
      response.status(401).json({ success: false, error: '系統密碼錯誤，無法切換身份。' });
      return;
    }
    if (!['admin', 'employee'].includes(targetRole)) {
      response.status(400).json({ success: false, error: '請選擇要切換的身份。' });
      return;
    }

    const realEmployee = getEmployeeById(session.realEmployeeId || session.employeeId);
    const targetEmployee = targetRole === 'employee'
      ? getEmployeeById(targetEmployeeId)
      : realEmployee;

    if (!targetEmployee) {
      response.status(404).json({ success: false, error: '找不到要模擬的員工資料。' });
      return;
    }

    session.role = targetRole;
    session.employeeId = targetEmployee.id;
    session.realRole = 'developer';
    session.realEmployeeId = realEmployee?.id || session.realEmployeeId || session.employeeId;
    session.realEmployeeName = realEmployee?.name || session.realEmployeeName || '';
    session.impersonation = {
      active: true,
      startedAt: Date.now(),
      targetRole,
      targetEmployeeId: targetRole === 'employee' ? targetEmployee.id : '',
      targetEmployeeName: targetRole === 'employee' ? targetEmployee.name || '' : ''
    };

    writeBrowserAuditLog(request, {
      action: 'impersonate',
      target_type: 'session',
      target_id: targetRole === 'employee' ? targetEmployee.id : 'admin',
      summary: `開發人員身份切換：${targetRole === 'admin' ? '管理者' : `員工 ${targetEmployee.id}`}`,
      after_data: {
        targetRole,
        targetEmployeeId: session.impersonation.targetEmployeeId,
        targetEmployeeName: session.impersonation.targetEmployeeName
      }
    });

    response.json({
      success: true,
      message: targetRole === 'admin'
        ? '已切換到管理者測試身份。'
        : `已切換到員工 ${targetEmployee.id} ${targetEmployee.name || ''} 測試身份。`,
      dashboard: buildDashboardForSession(session)
    });
  });

  server.post('/api/browser/developer/impersonation/stop', requireBrowserSession, requireDeveloperIdentity, (request, response) => {
    const session = request.browserSession;
    const realEmployeeId = session.realEmployeeId || session.employeeId;
    const realEmployee = getEmployeeById(realEmployeeId);
    if (!realEmployee) {
      response.status(401).json({ success: false, error: '找不到原本的開發人員登入資料，請重新登入。' });
      return;
    }

    const previousImpersonation = session.impersonation || null;
    session.role = 'developer';
    session.employeeId = realEmployee.id;
    session.realRole = 'developer';
    session.realEmployeeId = realEmployee.id;
    session.realEmployeeName = realEmployee.name || '';
    session.impersonation = null;

    writeBrowserAuditLog(request, {
      action: 'stop_impersonation',
      target_type: 'session',
      target_id: realEmployee.id,
      summary: '開發人員身份切換已返回開發人員頁面',
      before_data: previousImpersonation
    });

    response.json({
      success: true,
      message: '已返回開發人員頁面。',
      dashboard: buildDashboardForSession(session)
    });
  });

  server.post('/api/browser/developer/change-system-password', requireBrowserSession, requireBrowserRole('developer'), (request, response) => {
    const currentPassword = String(request.body?.currentPassword || '');
    const newPassword = String(request.body?.newPassword || '');
    if (currentPassword !== getSettingValue('systemPassword', DEFAULT_SYSTEM_PASSWORD)) {
      response.status(400).json({ success: false, error: '目前系統密碼不正確。' });
      return;
    }
    if (!newPassword) {
      response.status(400).json({ success: false, error: '請輸入新的系統密碼。' });
      return;
    }
    dbModule.setSetting('systemPassword', newPassword);
    writeBrowserAuditLog(request, {
      action: 'change_password',
      target_type: 'system_password',
      target_id: 'systemPassword',
      summary: '更新系統密碼'
    });
    notifyDesktop('systemPassword', {
      origin: 'browser',
      sessionToken: request.browserSession.token
    });
    response.json({ success: true, message: '系統密碼已更新。' });
  });
}

function handleServerListenError(error) {
  const baseMessage = error?.code === 'EADDRINUSE'
    ? `Port ${PORT} is already in use. Please close the existing TanChin window or any other program using port ${PORT}, then start again.`
    : `The local browser server could not start.${error?.message ? ` ${error.message}` : ''}`;

  console.error(`[信使驛站] ${baseMessage}`);
  try {
    dialog.showErrorBox('TanChin-Time-Clock-SQLite3 startup failed', baseMessage);
  } catch (dialogError) {
    console.error('[信使驛站] Unable to show startup error dialog:', dialogError);
  }
  app.quit();
}

function startServer(mainWindow) {
  if (serverInstance) {
    mainWindowRef = mainWindow;
    return serverInstance;
  }

  mainWindowRef = mainWindow;

  const server = express();
  server.use(express.json({ limit: '30mb' }));

  server.use('/browser', express.static(BROWSER_CLIENT_DIR));
  server.use('/user-media/sounds', express.static(getCustomSoundsDirectory()));
  server.use('/user-media/themes', express.static(getThemeImagesDirectory()));

  server.get('/', (request, response) => {
    response.redirect('/browser/');
  });

  server.get('/browser', (request, response) => {
    response.redirect('/browser/');
  });

  attachExternalApiRoutes(server);
  attachBrowserRoutes(server);

  serverInstance = server.listen(PORT, () => {
    serverStartedAt = Date.now();
    console.log(`[信使驛站] 傳送門已在頻道 ${PORT} 開啟，等待遠方的訊息...`);
  });
  serverInstance.on('error', handleServerListenError);

  scheduleAuditArchiveJob();
  return serverInstance;
}

module.exports = {
  startServer,
  broadcastDataUpdate: broadcastBrowserDataUpdate
};
