'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DOWNLOAD_TTL_MS = 15 * 60 * 1000;
const MAX_DOWNLOADS = 30;
const TEMP_PREFIX = 'tanchin-db-download-';
const TEMP_APP_DIRECTORY = 'TanChin-Time-Clock-SQLite3';
const TEMP_DOWNLOAD_DIRECTORY = 'database-backup-downloads';
const OWNER_FILE = '.owner.json';
const OWNER_TYPE = 'tanchin-database-backup-download';
const BASE_ROUTE = '/api/browser/developer';

function fail(message, statusCode = 400) { throw Object.assign(new Error(message), { statusCode }); }

// Validate configuration without stat/mkdir or probing a possibly unavailable NAS.
function validateDirectory(value, fieldName) {
  if (typeof value !== 'string' || value.length > 4096) fail(`${fieldName}必須是有效的絕對路徑字串。`);
  const text = value.trim();
  if (!text) return '';
  if (/[\x00-\x1f<>"|?*]/.test(text) || /^\\\\[?.]\\/.test(text)) fail(`${fieldName}含有不允許的路徑字元。`);
  const isWindowsDrive = /^[a-z]:[\\/]/i.test(text);
  const isUnc = /^\\\\[^\\/]+[\\/][^\\/]+(?:[\\/]|$)/.test(text);
  const isPosix = process.platform !== 'win32' && path.isAbsolute(text);
  if (!isWindowsDrive && !isUnc && !isPosix) fail(`${fieldName}必須使用完整絕對路徑，不能使用相對路徑。`);
  if (text.split(/[\\/]+/).some((part) => part === '..' || part === '.')) fail(`${fieldName}不能含有相對路徑片段。`);
  if ((isWindowsDrive && text.slice(2).includes(':')) || (!isWindowsDrive && text.includes(':'))) fail(`${fieldName}含有不允許的路徑格式。`);
  return isWindowsDrive || isUnc ? path.win32.normalize(text) : path.normalize(text);
}

function bodyOf(request) {
  const body = request.body ?? {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('請提供有效的備份操作資料。');
  return body;
}

function retentionOf(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) fail('備份保留份數必須是 3 至 3650 的整數。');
  const count = Number(value);
  if (!Number.isInteger(count) || count < 3 || count > 3650) fail('備份保留份數必須是 3 至 3650 的整數。');
  return count;
}

function attachDatabaseBackupRoutes(server, {
  db, requireSession, requireRole, getSettings, createBackup, auditEntry,
  notify = () => {}, buildDashboard = () => undefined, getTempDirectory = () => os.tmpdir(),
  now = () => Date.now(), downloadTtlMs = DOWNLOAD_TTL_MS, maxDownloads = MAX_DOWNLOADS
}) {
  const downloads = new Map();
  const ownedDirectories = new Map();
  const pendingDirectories = new Set();
  const tempAppDirectory = path.join(path.resolve(getTempDirectory()), TEMP_APP_DIRECTORY);
  const tempDirectory = path.join(tempAppDirectory, TEMP_DOWNLOAD_DIRECTORY);
  const isRealDirectory = (directory) => {
    try { const stat = fs.lstatSync(directory); return stat.isDirectory() && !stat.isSymbolicLink(); } catch { return false; }
  };
  const processAlive = (pid) => {
    try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
  };
  const saveOwner = (directory, expiresAt) => fs.writeFileSync(path.join(directory, OWNER_FILE), JSON.stringify({
    type: OWNER_TYPE, formatVersion: 1, pid: process.pid, createdAt: now(), expiresAt
  }), { mode: 0o600 });
  const sessionKey = (request) => {
    const token = request.browserSession?.token;
    if (typeof token !== 'string' || !token) fail('登入狀態不完整，請重新登入。', 401);
    return crypto.createHash('sha256').update(token).digest('hex');
  };
  const noImpersonation = (request, response, next) => {
    response.set('Cache-Control', 'no-store');
    if (request.browserSession?.impersonation?.active) return response.status(403).json({ success: false, error: '身份模擬不能修改備份設定、建立或下載完整資料庫備份。' });
    next();
  };
  const middleware = [requireSession, requireRole('developer'), noImpersonation];
  const audit = (request, entry) => db.addAuditLog(auditEntry(request, entry));
  const presentation = (request, events) => {
    const warnings = [];
    try { notify(request, events); } catch { warnings.push('操作已完成，但工作台同步通知失敗，請重新整理。'); }
    let dashboard;
    try { dashboard = buildDashboard(request.browserSession); } catch { warnings.push('操作已完成，但無法更新工作台摘要，請稍後重新整理。'); }
    return { ...(dashboard === undefined ? {} : { dashboard }), ...(warnings.length ? { warnings } : {}) };
  };
  const removeOwnedDirectory = (directory) => {
    const base = ownedDirectories.get(directory);
    if (!base || path.dirname(directory) !== base || !path.basename(directory).startsWith(TEMP_PREFIX)) return;
    try {
      // Only directories minted by this module can be removed; permanent backups never enter this registry.
      fs.rmSync(directory, { recursive: true, force: true });
      ownedDirectories.delete(directory);
    } catch { /* A busy download can be retried by a later cleanup. */ }
  };
  const removeDownload = (token) => {
    const entry = downloads.get(token);
    if (!entry || entry.activeDownloads) return false;
    downloads.delete(token);
    removeOwnedDirectory(entry.directory);
    return true;
  };
  const cleanupAbandonedDownloads = () => {
    // Restart recovery is restricted to our dedicated directory, a valid owner marker,
    // an expired lease and a process proven dead. Never scan the global temp directory.
    if (!isRealDirectory(tempAppDirectory) || !isRealDirectory(tempDirectory)) return;
    let entries, realBase;
    try { entries = fs.readdirSync(tempDirectory, { withFileTypes: true }); realBase = fs.realpathSync(tempDirectory); } catch { return; }
    for (const item of entries) {
      if (!item.name.startsWith(TEMP_PREFIX) || !item.isDirectory() || item.isSymbolicLink()) continue;
      const directory = path.join(tempDirectory, item.name);
      if (ownedDirectories.has(directory)) continue;
      try {
        if (!isRealDirectory(directory) || path.dirname(fs.realpathSync(directory)) !== realBase) continue;
        const markerPath = path.join(directory, OWNER_FILE), markerStat = fs.lstatSync(markerPath);
        if (!markerStat.isFile() || markerStat.isSymbolicLink() || markerStat.size > 2048) continue;
        const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
        if (marker.type !== OWNER_TYPE || marker.formatVersion !== 1 || !Number.isInteger(marker.pid) || marker.pid <= 0
          || !Number.isFinite(marker.createdAt) || marker.createdAt < 0 || !Number.isFinite(marker.expiresAt)
          || marker.expiresAt <= marker.createdAt || marker.expiresAt > now() || processAlive(marker.pid)) continue;
        fs.rmSync(directory, { recursive: true, force: true });
      } catch { /* Unknown markers, active files or uncertain ownership are left untouched. */ }
    }
  };
  const cleanupDownloads = () => {
    for (const [token, entry] of downloads) if (entry.expiresAt <= now()) removeDownload(token);
    const referenced = new Set(Array.from(downloads.values(), (entry) => entry.directory));
    for (const directory of ownedDirectories.keys()) if (!referenced.has(directory) && !pendingDirectories.has(directory)) removeOwnedDirectory(directory);
    cleanupAbandonedDownloads();
  };
  const reserveDownload = () => {
    cleanupDownloads();
    while (downloads.size + pendingDirectories.size >= maxDownloads) {
      const oldest = Array.from(downloads).find(([, entry]) => !entry.activeDownloads);
      if (!oldest) fail('目前下載作業較多，請稍後再建立下載備份。', 503);
      removeDownload(oldest[0]);
    }
    const base = tempDirectory;
    for (const directory of [tempAppDirectory, base]) {
      if (fs.existsSync(directory) && !isRealDirectory(directory)) throw new Error('Unsafe temporary backup directory.');
      fs.mkdirSync(directory, { recursive: true });
    }
    const directory = fs.mkdtempSync(path.join(base, TEMP_PREFIX));
    ownedDirectories.set(directory, base);
    pendingDirectories.add(directory);
    try { saveOwner(directory, now() + downloadTtlMs); }
    catch (error) { pendingDirectories.delete(directory); removeOwnedDirectory(directory); throw error; }
    return directory;
  };
  cleanupAbandonedDownloads();
  const timer = setInterval(cleanupDownloads, 60 * 1000);
  timer.unref?.();
  const handle = (callback) => async (request, response) => {
    try { await callback(request, response); }
    catch (error) {
      if (response.headersSent) { response.destroy(error); return; }
      const status = error.statusCode || 500;
      response.status(status).json({ success: false, error: status < 500 ? error.message : error.publicMessage || '完整備份作業未完成。請確認所選位置可存取、可寫入及稽核紀錄正常；系統不會改存另一位置。' });
    }
  };

  server.post(`${BASE_ROUTE}/database-backup-settings/save`, ...middleware, handle((request, response) => {
    const body = bodyOf(request), previous = getSettings();
    const defaultDirectory = validateDirectory(body.defaultDirectory, '打卡鐘備份位置');
    const secondaryDirectory = body.secondaryDirectory === undefined
      ? previous.secondaryDirectory || '' : validateDirectory(body.secondaryDirectory, '第二備份位置');
    const retentionCount = retentionOf(body.retentionCount);
    db.getSupervisors().transaction(() => {
      db.setSetting('databaseBackupDirectory', defaultDirectory);
      db.setSetting('databaseBackupSecondaryDirectory', secondaryDirectory);
      db.setSetting('databaseBackupRetentionCount', retentionCount);
      audit(request, { action: 'update', target_type: 'database_backup_setting', target_id: 'databaseBackupSettings',
        summary: '更新完整資料庫的兩個備份位置及保留份數',
        before_data: { defaultDirectory: previous.defaultDirectory, secondaryDirectory: previous.secondaryDirectory, retentionCount: previous.retentionCount },
        after_data: { defaultDirectory, secondaryDirectory, retentionCount } });
    });
    response.json({ success: true, message: '完整資料庫備份設定已儲存。', data: getSettings(), ...presentation(request, ['databaseBackup']) });
  }));

  server.post(`${BASE_ROUTE}/database-backup/run`, ...middleware, handle(async (request, response) => {
    const body = bodyOf(request);
    if (Object.keys(body).some((key) => !['destination', 'download'].includes(key))) fail('立即備份只能選擇已儲存的位置，不能傳入任意檔案或資料夾路徑。');
    const destination = Object.hasOwn(body, 'destination') ? body.destination : 'primary';
    if (!['primary', 'secondary'].includes(destination)) fail('請選擇打卡鐘備份位置或第二備份位置。');
    if (body.download !== undefined && typeof body.download !== 'boolean') fail('下載選項必須是布林值。');
    const settings = getSettings();
    const selected = destination === 'primary' ? settings.effectiveDirectory : settings.secondaryDirectory;
    if (!selected) fail('尚未設定這個備份位置，請先儲存位置設定。');
    const directoryPath = validateDirectory(selected, '所選備份位置');
    const key = body.download ? sessionKey(request) : null;
    let downloadDirectory = '', published = false;
    try {
      if (body.download) downloadDirectory = reserveDownload();
      const result = await createBackup({ directoryPath, retentionCount: settings.retentionCount, reason: 'manual',
        actor: request.browserSession.employeeId || request.browserSession.role || 'developer',
        metadata: { triggeredFrom: 'browser_developer_workspace', destination }, ...(downloadDirectory ? { downloadDirectory } : {}) });
      const { downloadFilePath, downloadFileName, ...publicResult } = result;
      let downloadEntry;
      if (body.download) {
        if (typeof downloadFilePath !== 'string' || path.dirname(path.resolve(downloadFilePath)) !== downloadDirectory
          || !/\.zip$/i.test(downloadFilePath) || !fs.lstatSync(downloadFilePath).isFile() || fs.lstatSync(downloadFilePath).isSymbolicLink()) {
          throw new Error('The backup download package must belong to its controlled temporary directory.');
        }
        const fileName = path.basename(downloadFilePath);
        if (downloadFileName && downloadFileName !== fileName) throw new Error('Unexpected backup download file name.');
        downloadEntry = { token: crypto.randomBytes(32).toString('hex'), sessionKey: key, filePath: downloadFilePath,
          fileName, directory: downloadDirectory, expiresAt: now() + downloadTtlMs, activeDownloads: 0 };
        saveOwner(downloadDirectory, downloadEntry.expiresAt);
      }
      const message = `完整資料庫備份已建立：${result.filePath}`;
      try {
        db.getSupervisors().transaction(() => {
          db.addAutomationLog({ timestamp: now(), message, status: 'success' });
          audit(request, { action: 'backup', target_type: 'database', target_id: 'app_data.db', summary: message,
            after_data: { filePath: result.filePath, manifestPath: result.manifestPath, sizeBytes: result.sizeBytes, sha256: result.sha256, destination, downloadPrepared: !!downloadEntry } });
        });
      } catch (error) {
        error.publicMessage = '備份檔已建立並保留在所選位置，但稽核紀錄未完成，尚未提供下載。請先確認主機稽核儲存狀態。';
        throw error;
      }
      if (downloadEntry) {
        downloads.set(downloadEntry.token, downloadEntry); published = true;
        publicResult.download = { token: downloadEntry.token, fileName: downloadEntry.fileName, expiresAt: downloadEntry.expiresAt };
      }
      response.json({ success: true, message, data: { ...publicResult, destination }, ...presentation(request, ['databaseBackup', 'automationLog']) });
    } finally {
      pendingDirectories.delete(downloadDirectory);
      if (downloadDirectory && !published) removeOwnedDirectory(downloadDirectory);
    }
  }));

  server.get(`${BASE_ROUTE}/database-backup/download/:token`, ...middleware, handle(async (request, response) => {
    cleanupDownloads();
    const token = request.params.token;
    const entry = /^[a-f0-9]{64}$/.test(token) ? downloads.get(token) : null;
    if (!entry || entry.expiresAt <= now() || entry.sessionKey !== sessionKey(request)) fail('下載連結已失效或不屬於目前登入，請重新建立完整備份。', 404);
    let stat;
    try { stat = fs.lstatSync(entry.filePath); } catch (error) {
      if (error.code === 'ENOENT') { removeDownload(token); fail('下載備份檔已失效，請重新建立完整備份。', 404); }
      throw error;
    }
    if (!stat.isFile() || stat.isSymbolicLink()) fail('下載備份檔已失效，請重新建立完整備份。', 404);
    audit(request, { action: 'download', target_type: 'database_backup', target_id: entry.fileName,
      summary: '下載完整資料庫備份 ZIP（包含資料庫、清單及存在時的密碼金鑰）', after_data: { fileName: entry.fileName, sizeBytes: stat.size } });
    response.set({ 'Cache-Control': 'no-store', 'Content-Type': 'application/zip', 'X-Content-Type-Options': 'nosniff' });
    entry.activeDownloads++;
    try {
      await new Promise((resolve, reject) => response.download(entry.filePath, entry.fileName, { dotfiles: 'deny', cacheControl: false, lastModified: false }, (error) => error ? reject(error) : resolve()));
    } finally {
      entry.activeDownloads--;
      if (entry.expiresAt <= now()) removeDownload(token);
    }
  }));

  return { cleanupDownloads, dispose() { clearInterval(timer); for (const token of downloads.keys()) removeDownload(token); cleanupDownloads(); } };
}

module.exports = { attachDatabaseBackupRoutes, validateDirectory, DOWNLOAD_TTL_MS, MAX_DOWNLOADS };
