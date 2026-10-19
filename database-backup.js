const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const yazl = require('yazl');

const BACKUP_FILE_PREFIX = 'TanChin-Time-Clock-SQLite3-db';
const BACKUP_MANIFEST_VERSION = 1;
const DEFAULT_DATABASE_BACKUP_RETENTION_COUNT = 30;
const DEFAULT_SECONDARY_DATABASE_BACKUP_DIRECTORY = '\\\\Ts5600d494\\oms\\TanChin-Time-Clock-SQLite3 DB備份資料';
const directoryOperations = new Map();

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatBackupTimestamp(date = new Date()) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}

function getDefaultDatabaseBackupDirectory(userDataPath) {
  return path.join(userDataPath, 'DatabaseBackups');
}

function validateDirectoryPath(directoryPath, fallbackDirectory) {
  const candidate = String(directoryPath ?? '').trim() || String(fallbackDirectory ?? '').trim();
  // A drive-relative path (C:backup) or root-relative path (\backup) is not a
  // stable backup destination. Do not resolve it against the service's cwd.
  const driveAbsolute = /^[a-z]:[\\/]/i.test(candidate);
  const uncParts = /^(?:\\\\|\/\/)([^\\/]+)[\\/]([^\\/]+)(?:[\\/]|$)/.exec(candidate);
  const uncAbsolute = !!uncParts && !['.', '..', '?'].includes(uncParts[1]) && !['.', '..'].includes(uncParts[2]);
  const nativeAbsolute = process.platform !== 'win32' && path.isAbsolute(candidate);
  if (!candidate || candidate.includes('\0') || (!driveAbsolute && !uncAbsolute && !nativeAbsolute)) {
    throw new Error('資料庫備份資料夾必須是絕對路徑。');
  }
  return driveAbsolute || uncAbsolute ? path.win32.normalize(candidate) : path.normalize(candidate);
}

function resolveDatabaseBackupLocations({ primaryDirectory, secondaryDirectory, userDataPath }) {
  return {
    primaryDirectory: validateDirectoryPath(primaryDirectory, getDefaultDatabaseBackupDirectory(userDataPath)),
    secondaryDirectory: secondaryDirectory == null
      ? DEFAULT_SECONDARY_DATABASE_BACKUP_DIRECTORY
      : String(secondaryDirectory).trim() ? validateDirectoryPath(secondaryDirectory) : ''
  };
}

function normalizeBackupDirectoryPath(directoryPath, fallbackDirectory) {
  const resolvedPath = validateDirectoryPath(directoryPath, fallbackDirectory);
  if (fs.existsSync(resolvedPath) && !fs.statSync(resolvedPath).isDirectory()) {
    throw new Error(`資料庫備份路徑不是資料夾：${resolvedPath}`);
  }
  fs.mkdirSync(resolvedPath, { recursive: true });
  return resolvedPath;
}

function inBackupDirectoryOrder(directoryPath, operation) {
  const canonicalPath = path.resolve(directoryPath);
  const key = process.platform === 'win32' ? canonicalPath.toLowerCase() : canonicalPath;
  const previous = directoryOperations.get(key) || Promise.resolve();
  const result = previous.then(operation);
  const settled = result.catch(() => {});
  directoryOperations.set(key, settled);
  settled.then(() => { if (directoryOperations.get(key) === settled) directoryOperations.delete(key); });
  return result;
}

function normalizeRetentionCount(value, fallbackValue = DEFAULT_DATABASE_BACKUP_RETENTION_COUNT) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallbackValue;
  return Math.max(3, Math.min(Math.floor(numericValue), 3650));
}

function getBackupKindPrefix(kind = 'standard') {
  return kind === 'emergency'
    ? `${BACKUP_FILE_PREFIX}-emergency`
    : BACKUP_FILE_PREFIX;
}

function buildBackupBaseName(kind = 'standard', date = new Date()) {
  return `${getBackupKindPrefix(kind)}-${formatBackupTimestamp(date)}-${String(date.getMilliseconds()).padStart(3, '0')}-${crypto.randomBytes(6).toString('hex')}`;
}

function buildBackupFilePath(directoryPath, kind = 'standard', date = new Date()) {
  return path.join(directoryPath, `${buildBackupBaseName(kind, date)}.db`);
}

function computeFileSha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function writeBackupManifest(filePath, manifest) {
  const manifestPath = filePath.replace(/\.db$/i, '.manifest.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return manifestPath;
}

function listBackupFiles(directoryPath, kind = 'standard') {
  const prefix = `${getBackupKindPrefix(kind)}-`;
  const emergencyPrefix = `${getBackupKindPrefix('emergency')}-`;
  if (!fs.existsSync(directoryPath)) return [];
  return fs.readdirSync(directoryPath)
    .filter((fileName) => (
      fileName.startsWith(prefix)
      && fileName.toLowerCase().endsWith('.db')
      && (kind !== 'standard' || !fileName.startsWith(emergencyPrefix))
    ))
    .flatMap((fileName) => {
      const filePath = path.join(directoryPath, fileName);
      const stat = fs.statSync(filePath);
      return stat.isFile() ? [{ fileName, filePath, createdTime: stat.birthtimeMs || stat.mtimeMs, modifiedTime: stat.mtimeMs }] : [];
    })
    .sort((a, b) => b.modifiedTime - a.modifiedTime);
}

function enforceBackupRetention(directoryPath, retentionCount, kind = 'standard', latestFilePath = '') {
  const keepCount = normalizeRetentionCount(retentionCount);
  const files = listBackupFiles(directoryPath, kind);
  // File timestamp resolution may be coarser than concurrent backup requests.
  // Always keep the completed backup this operation is about to return.
  if (latestFilePath) files.sort((a, b) => Number(b.filePath === latestFilePath) - Number(a.filePath === latestFilePath));
  const removed = [];
  for (const file of files.slice(keepCount)) {
    fs.unlinkSync(file.filePath);
    const manifestPath = file.filePath.replace(/\.db$/i, '.manifest.json');
    if (fs.existsSync(manifestPath)) {
      fs.unlinkSync(manifestPath);
    }
    removed.push(file.filePath);
    const credentialKeyPath = `${file.filePath}.web-credentials.json`;
    if (fs.existsSync(credentialKeyPath)) fs.unlinkSync(credentialKeyPath);
  }
  return removed;
}

async function writeDownloadArchive(filePaths, downloadFilePath) {
  const zip = new yazl.ZipFile();
  const inputs = [], closedInputs = [];
  let stopped = false;
  zip.on('error', (error) => {
    stopped = true;
    for (const input of inputs) input.destroy();
    zip.outputStream.destroy(error);
  });
  const output = fs.createWriteStream(downloadFilePath, { flags: 'wx', mode: 0o600 });
  const completed = pipeline(zip.outputStream, output);
  try {
    for (const filePath of filePaths) {
      const stat = fs.statSync(filePath);
      zip.addReadStreamLazy(path.basename(filePath), { size: stat.size, mtime: stat.mtime, mode: stat.mode }, (callback) => {
        if (stopped) return callback(new Error('備份下載壓縮已停止。'));
        const input = fs.createReadStream(filePath);
        inputs.push(input);
        closedInputs.push(new Promise((resolve) => input.once('close', resolve)));
        input.on('error', (error) => zip.emit('error', error));
        callback(null, input);
      });
    }
    zip.end();
  } catch (error) {
    zip.emit('error', error);
  }
  try {
    await completed;
  } catch (error) {
    zip.emit('error', error);
    throw error;
  } finally {
    // Windows cannot unlink a failed batch until every ZIP input handle is
    // closed. Pipeline only owns the output side, so close tracked inputs too.
    await Promise.all(closedInputs);
  }
}

async function createFullDatabaseBackup({
  dbModule,
  directoryPath,
  fallbackDirectory,
  retentionCount = DEFAULT_DATABASE_BACKUP_RETENTION_COUNT,
  kind = 'standard',
  reason = 'manual',
  actor = 'system',
  metadata = {},
  downloadDirectory
}) {
  const backupDirectory = validateDirectoryPath(directoryPath, fallbackDirectory);
  const archiveDirectory = downloadDirectory == null ? '' : validateDirectoryPath(downloadDirectory);
  return inBackupDirectoryOrder(backupDirectory, async () => {
    normalizeBackupDirectoryPath(backupDirectory);
    if (archiveDirectory) normalizeBackupDirectoryPath(archiveDirectory);
    const createdAt = new Date();
    const filePath = buildBackupFilePath(backupDirectory, kind, createdAt);
    const manifestPath = filePath.replace(/\.db$/i, '.manifest.json');
    const credentialKeyPath = `${filePath}.web-credentials.json`;
    const downloadFileName = archiveDirectory ? `${path.basename(filePath, '.db')}.zip` : '';
    const downloadFilePath = archiveDirectory ? path.join(archiveDirectory, downloadFileName) : '';
    const ownedPaths = [filePath, manifestPath, credentialKeyPath, `${filePath}-wal`, `${filePath}-shm`, `${filePath}-journal`, downloadFilePath].filter(Boolean);
    // Random names are unique in practice, and this guard also protects files
    // if a clock/random source is replaced or a stale file happens to exist.
    if (ownedPaths.some((ownedPath) => fs.existsSync(ownedPath))) throw new Error('備份檔名已存在，請重新執行備份。');
    let complete = false;
    try {
      const result = await dbModule.backupDatabase(filePath);
      if (path.resolve(result.filePath) !== path.resolve(filePath)
          || (result.credentialKeyPath && path.resolve(result.credentialKeyPath) !== path.resolve(credentialKeyPath))) {
        throw new Error('備份回傳的檔案位置與本次目標不一致。');
      }
      const checksum = computeFileSha256(result.filePath);
      const manifest = {
        ...metadata,
        formatVersion: BACKUP_MANIFEST_VERSION,
        type: 'sqlite-full-database-backup',
        appName: 'TanChin-Time-Clock-SQLite3',
        createdAt: createdAt.getTime(),
        createdAtText: createdAt.toLocaleString('zh-TW', { hour12: false }),
        reason,
        actor,
        kind,
        sourceDatabasePath: dbModule.getDatabasePath(),
        databaseFilePath: result.filePath,
        databaseFileName: path.basename(result.filePath),
        sizeBytes: result.sizeBytes,
        sha256: checksum,
        credentialKeyFileName: result.credentialKeyPath ? path.basename(result.credentialKeyPath) : '',
        credentialKeySha256: result.credentialKeyPath ? computeFileSha256(result.credentialKeyPath) : ''
      };
      writeBackupManifest(result.filePath, manifest);
      if (downloadFilePath) {
        await writeDownloadArchive([result.filePath, manifestPath, ...(result.credentialKeyPath ? [result.credentialKeyPath] : [])], downloadFilePath);
      }
      complete = true;
      let removedFiles = [], retentionWarning = '';
      try { removedFiles = enforceBackupRetention(backupDirectory, retentionCount, kind, filePath); }
      catch (error) { retentionWarning = `備份已完成，但舊備份清理未完成：${error.message}`; }
      return {
        ...manifest,
        directoryPath: backupDirectory,
        filePath: result.filePath,
        manifestPath,
        removedFiles,
        ...(downloadFilePath ? { downloadFilePath, downloadFileName } : {}),
        ...(retentionWarning ? { retentionWarning } : {})
      };
    } catch (error) {
      if (!complete) {
        for (const ownedPath of ownedPaths) {
          try { fs.unlinkSync(ownedPath); }
          catch (cleanupError) { if (cleanupError.code !== 'ENOENT') error.cleanupError = '未完成的備份檔案無法全部清理，請檢查資料夾權限。'; }
        }
      }
      throw error;
    }
  });
}

function validateRestoreSourceFile(sourceFilePath) {
  const sourceText = String(sourceFilePath || '').trim();
  if (!sourceText) {
    throw new Error('請先選擇要還原的資料庫備份檔。');
  }
  const resolvedSource = path.resolve(sourceText);
  if (!fs.existsSync(resolvedSource)) {
    throw new Error(`找不到要還原的資料庫備份檔：${resolvedSource}`);
  }
  if (!fs.statSync(resolvedSource).isFile()) {
    throw new Error('要還原的路徑不是檔案。');
  }
  const extension = path.extname(resolvedSource).toLowerCase();
  if (!['.db', '.sqlite', '.sqlite3'].includes(extension)) {
    throw new Error('目前只支援還原 .db、.sqlite、.sqlite3 資料庫備份檔。');
  }
  return resolvedSource;
}

async function restoreDatabaseFromBackup({
  dbModule,
  sourceFilePath,
  emergencyDirectoryPath,
  fallbackDirectory,
  emergencyRetentionCount = DEFAULT_DATABASE_BACKUP_RETENTION_COUNT,
  actor = 'system',
  metadata = {}
}) {
  const resolvedSource = validateRestoreSourceFile(sourceFilePath);
  const emergencyDirectory = validateDirectoryPath(emergencyDirectoryPath, fallbackDirectory);
  return inBackupDirectoryOrder(emergencyDirectory, async () => {
    normalizeBackupDirectoryPath(emergencyDirectory);
    const restoredAt = new Date();
    const emergencyBackupPath = buildBackupFilePath(emergencyDirectory, 'emergency', restoredAt);
    const restoreResult = await dbModule.replaceDatabaseFromBackup(resolvedSource, { emergencyBackupPath });
    const emergencyManifest = restoreResult.emergencyBackup
      ? {
          formatVersion: BACKUP_MANIFEST_VERSION,
          type: 'sqlite-full-database-backup',
          appName: 'TanChin-Time-Clock-SQLite3',
          createdAt: restoredAt.getTime(),
          createdAtText: restoredAt.toLocaleString('zh-TW', { hour12: false }),
          reason: 'pre_restore_emergency',
          actor,
          kind: 'emergency',
          sourceDatabasePath: restoreResult.restoredPath,
          databaseFilePath: restoreResult.emergencyBackup.filePath,
          databaseFileName: path.basename(restoreResult.emergencyBackup.filePath),
          sizeBytes: restoreResult.emergencyBackup.sizeBytes,
          sha256: computeFileSha256(restoreResult.emergencyBackup.filePath),
          restoreSourcePath: resolvedSource,
          credentialKeyFileName: restoreResult.emergencyBackup.credentialKeyPath ? path.basename(restoreResult.emergencyBackup.credentialKeyPath) : '',
          credentialKeySha256: restoreResult.emergencyBackup.credentialKeyPath ? computeFileSha256(restoreResult.emergencyBackup.credentialKeyPath) : '',
          ...metadata
        }
      : null;
    const emergencyManifestPath = emergencyManifest
      ? writeBackupManifest(restoreResult.emergencyBackup.filePath, emergencyManifest)
      : '';
    const removedFiles = enforceBackupRetention(emergencyDirectory, emergencyRetentionCount, 'emergency', restoreResult.emergencyBackup?.filePath);
    return {
      restoredAt: restoredAt.getTime(),
      restoredAtText: restoredAt.toLocaleString('zh-TW', { hour12: false }),
      sourceFilePath: resolvedSource,
      restoredPath: restoreResult.restoredPath,
      emergencyBackup: emergencyManifest
        ? {
            ...emergencyManifest,
            filePath: restoreResult.emergencyBackup.filePath,
            manifestPath: emergencyManifestPath,
            directoryPath: emergencyDirectory
          }
        : null,
      removedFiles
    };
  });
}

module.exports = {
  DEFAULT_DATABASE_BACKUP_RETENTION_COUNT,
  DEFAULT_SECONDARY_DATABASE_BACKUP_DIRECTORY,
  getDefaultDatabaseBackupDirectory,
  validateDirectoryPath,
  resolveDatabaseBackupLocations,
  normalizeBackupDirectoryPath,
  normalizeRetentionCount,
  buildBackupFilePath,
  createFullDatabaseBackup,
  restoreDatabaseFromBackup,
  validateRestoreSourceFile,
  listBackupFiles
};
