const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const BACKUP_FILE_PREFIX = 'TanChin-Time-Clock-SQLite3-db';
const BACKUP_MANIFEST_VERSION = 1;
const DEFAULT_DATABASE_BACKUP_RETENTION_COUNT = 30;

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

function normalizeBackupDirectoryPath(directoryPath, fallbackDirectory) {
  const trimmed = String(directoryPath || '').trim();
  const resolvedPath = path.resolve(trimmed || fallbackDirectory);
  if (!path.isAbsolute(resolvedPath)) {
    throw new Error('資料庫備份資料夾必須是絕對路徑。');
  }
  if (fs.existsSync(resolvedPath) && !fs.statSync(resolvedPath).isDirectory()) {
    throw new Error(`資料庫備份路徑不是資料夾：${resolvedPath}`);
  }
  fs.mkdirSync(resolvedPath, { recursive: true });
  return resolvedPath;
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
  return `${getBackupKindPrefix(kind)}-${formatBackupTimestamp(date)}`;
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
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
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
    .map((fileName) => {
      const filePath = path.join(directoryPath, fileName);
      const stat = fs.statSync(filePath);
      return { fileName, filePath, createdTime: stat.birthtimeMs || stat.mtimeMs, modifiedTime: stat.mtimeMs };
    })
    .sort((a, b) => b.modifiedTime - a.modifiedTime);
}

function enforceBackupRetention(directoryPath, retentionCount, kind = 'standard') {
  const keepCount = normalizeRetentionCount(retentionCount);
  const files = listBackupFiles(directoryPath, kind);
  const removed = [];
  for (const file of files.slice(keepCount)) {
    fs.unlinkSync(file.filePath);
    const manifestPath = file.filePath.replace(/\.db$/i, '.manifest.json');
    if (fs.existsSync(manifestPath)) {
      fs.unlinkSync(manifestPath);
    }
    removed.push(file.filePath);
  }
  return removed;
}

async function createFullDatabaseBackup({
  dbModule,
  directoryPath,
  fallbackDirectory,
  retentionCount = DEFAULT_DATABASE_BACKUP_RETENTION_COUNT,
  kind = 'standard',
  reason = 'manual',
  actor = 'system',
  metadata = {}
}) {
  const backupDirectory = normalizeBackupDirectoryPath(directoryPath, fallbackDirectory);
  const createdAt = new Date();
  const filePath = buildBackupFilePath(backupDirectory, kind, createdAt);
  const result = await dbModule.backupDatabase(filePath);
  const checksum = computeFileSha256(result.filePath);
  const manifest = {
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
    ...metadata
  };
  const manifestPath = writeBackupManifest(result.filePath, manifest);
  const removedFiles = enforceBackupRetention(backupDirectory, retentionCount, kind);
  return {
    ...manifest,
    directoryPath: backupDirectory,
    filePath: result.filePath,
    manifestPath,
    removedFiles
  };
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
  const emergencyDirectory = normalizeBackupDirectoryPath(emergencyDirectoryPath, fallbackDirectory);
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
        ...metadata
      }
    : null;
  const emergencyManifestPath = emergencyManifest
    ? writeBackupManifest(restoreResult.emergencyBackup.filePath, emergencyManifest)
    : '';
  const removedFiles = enforceBackupRetention(emergencyDirectory, emergencyRetentionCount, 'emergency');
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
}

module.exports = {
  DEFAULT_DATABASE_BACKUP_RETENTION_COUNT,
  getDefaultDatabaseBackupDirectory,
  normalizeBackupDirectoryPath,
  normalizeRetentionCount,
  buildBackupFilePath,
  createFullDatabaseBackup,
  restoreDatabaseFromBackup,
  validateRestoreSourceFile,
  listBackupFiles
};
