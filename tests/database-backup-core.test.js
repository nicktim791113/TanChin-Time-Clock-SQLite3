const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { test } = require('node:test');
const backups = require('../database-backup');
const db = require('../database');
const credentials = require('../web-credentials');

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tanchin-backup-core-'));
  t.after(() => {
    db.close();
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('tanchin-backup-core-'));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}

function sha256(content) { return crypto.createHash('sha256').update(content).digest('hex'); }

// Inspect the ZIP's central directory, including streamed entries whose sizes
// are in data descriptors. This intentionally uses no packaging-only dependency.
function unzip(filePath) {
  const zip = fs.readFileSync(filePath);
  let end = zip.length - 22;
  while (end >= 0 && zip.readUInt32LE(end) !== 0x06054b50) end--;
  assert.ok(end >= 0, 'ZIP end record exists');
  const count = zip.readUInt16LE(end + 10);
  let cursor = zip.readUInt32LE(end + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    assert.equal(zip.readUInt32LE(cursor), 0x02014b50);
    const method = zip.readUInt16LE(cursor + 10);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const uncompressedSize = zip.readUInt32LE(cursor + 24);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    assert.equal(name, path.basename(name), 'archive contains only direct backup files');
    assert.equal(zip.readUInt32LE(localOffset), 0x04034b50);
    const contentStart = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
    const compressed = zip.subarray(contentStart, contentStart + compressedSize);
    const content = method === 8 ? zlib.inflateRawSync(compressed) : compressed;
    assert.equal(content.length, uncompressedSize);
    assert.ok(!files.has(name));
    files.set(name, content);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

function fakeDatabase(options = {}) {
  return {
    getDatabasePath: () => 'isolated-test-only.db',
    async backupDatabase(filePath) {
      const content = Buffer.from(`test fixture ${crypto.randomUUID()}`);
      fs.writeFileSync(filePath, content, { flag: 'wx' });
      const credentialKeyPath = options.keys ? `${filePath}.web-credentials.json` : '';
      if (credentialKeyPath) fs.writeFileSync(credentialKeyPath, JSON.stringify({ fixture: true }), { flag: 'wx' });
      await options.beforeFinish?.(filePath);
      if (options.fail) throw new Error('controlled fixture backup failure');
      return { filePath, sizeBytes: content.length, credentialKeyPath };
    }
  };
}

test('backup destinations reject relative paths and resolve two locations without filesystem access', (t) => {
  const directory = temporaryDirectory(t);
  const future = path.join(directory, 'not-created');
  assert.equal(backups.validateDirectoryPath('', future), future);
  assert.equal(fs.existsSync(future), false);
  for (const value of ['relative', '.\\backups', 'C:backups', '\\backups', '\\\\server', '\\\\?\\C:\\backups', '']) {
    assert.throws(() => backups.validateDirectoryPath(value), /絕對路徑/);
  }
  assert.equal(backups.validateDirectoryPath(' C:\\backup\\..\\backup '), 'C:\\backup');
  assert.equal(backups.validateDirectoryPath('\\\\server.local\\share\\backup'), '\\\\server.local\\share\\backup');
  const locations = backups.resolveDatabaseBackupLocations({ primaryDirectory: '', userDataPath: directory });
  assert.equal(locations.primaryDirectory, path.join(directory, 'DatabaseBackups'));
  assert.equal(locations.secondaryDirectory, '\\\\Ts5600d494\\oms\\TanChin-Time-Clock-SQLite3 DB備份資料');
  assert.equal(fs.existsSync(locations.primaryDirectory), false);
  assert.equal(backups.resolveDatabaseBackupLocations({ primaryDirectory: future, secondaryDirectory: '', userDataPath: directory }).secondaryDirectory, '');
  assert.equal(backups.resolveDatabaseBackupLocations({ primaryDirectory: future, secondaryDirectory: 'D:\\custom', userDataPath: directory }).secondaryDirectory, 'D:\\custom');
  assert.throws(() => backups.normalizeBackupDirectoryPath('relative', future), /絕對路徑/);
  assert.equal(fs.existsSync(future), false);
});

test('download ZIP preserves manifest, database and credentials and restores on another local database', async (t) => {
  const directory = temporaryDirectory(t);
  const sourcePath = path.join(directory, 'source', 'app_data.db');
  fs.mkdirSync(path.dirname(sourcePath));
  db.init(sourcePath);
  db.saveEmployees([{ id: 'ZIP001', name: 'ZIP Restore Fixture', card: 'zip-test-card' }]);
  const credential = await credentials.createCredential(sourcePath, 'ZIP001', 'isolated-zip-password');
  db.saveWebCredential({ employee_id: 'ZIP001', credential, revision: crypto.randomUUID(), must_change_password: false, updated_by: 'test' }, { action: 'test_seed' });
  const result = await backups.createFullDatabaseBackup({ dbModule: db, directoryPath: path.join(directory, 'backups'), downloadDirectory: path.join(directory, 'downloads'), metadata: { appVersion: 'test-version', sha256: 'must-not-override' } });
  const entries = unzip(result.downloadFilePath);
  assert.equal(entries.size, 3);
  assert.equal(result.downloadFileName, path.basename(result.downloadFilePath));
  const manifest = JSON.parse(entries.get(path.basename(result.manifestPath)).toString('utf8'));
  assert.equal(manifest.sha256, sha256(entries.get(manifest.databaseFileName)));
  assert.equal(manifest.credentialKeySha256, sha256(entries.get(manifest.credentialKeyFileName)));
  assert.equal(manifest.appVersion, 'test-version');
  assert.ok(!Object.hasOwn(manifest, 'downloadFilePath'));
  assert.deepEqual(fs.readdirSync(path.join(directory, 'downloads')), [result.downloadFileName]);
  assert.equal(fs.readdirSync(path.join(directory, 'backups')).filter((file) => file.endsWith('.zip')).length, 0);
  const extracted = path.join(directory, 'extracted');
  fs.mkdirSync(extracted);
  for (const [name, content] of entries) fs.writeFileSync(path.join(extracted, name), content);
  db.close();
  const targetPath = path.join(directory, 'target', 'app_data.db');
  fs.mkdirSync(path.dirname(targetPath));
  db.init(targetPath);
  db.saveEmployees([{ id: 'OLD', name: 'Before Restore', card: 'old-card' }]);
  const restored = await backups.restoreDatabaseFromBackup({ dbModule: db, sourceFilePath: path.join(extracted, manifest.databaseFileName), emergencyDirectoryPath: path.join(directory, 'emergency') });
  assert.ok(fs.existsSync(restored.emergencyBackup.filePath));
  assert.deepEqual(db.loadEmployees().map((employee) => employee.id), ['ZIP001']);
  const restoredCredential = db.getWebCredential('ZIP001').credential;
  assert.equal(await credentials.verifyPassword(restoredCredential, 'isolated-zip-password'), true);
  assert.equal(credentials.revealPassword(targetPath, 'ZIP001', restoredCredential), 'isolated-zip-password');
});

test('credential-free backups package exactly database and manifest and optional ZIP remains opt-in', async (t) => {
  const directory = temporaryDirectory(t);
  const result = await backups.createFullDatabaseBackup({ dbModule: fakeDatabase(), directoryPath: path.join(directory, 'backups'), downloadDirectory: path.join(directory, 'downloads') });
  const entries = unzip(result.downloadFilePath);
  assert.equal(entries.size, 2);
  assert.equal(result.credentialKeyFileName, '');
  assert.equal(result.credentialKeySha256, '');
  assert.equal(sha256(entries.get(result.databaseFileName)), result.sha256);
  const serverOnly = await backups.createFullDatabaseBackup({ dbModule: fakeDatabase(), directoryPath: path.join(directory, 'backups') });
  assert.ok(!Object.hasOwn(serverOnly, 'downloadFilePath'));
  assert.equal(fs.readdirSync(path.join(directory, 'downloads')).length, 1);
});

test('same-millisecond names are unique and concurrent operations serialize complete batches before retention', async (t) => {
  const directory = temporaryDirectory(t), backupDirectory = path.join(directory, 'backups'), downloadDirectory = path.join(directory, 'downloads');
  const fixedDate = new Date('2026-10-19T00:00:00.123Z');
  const names = new Set(Array.from({ length: 100 }, () => backups.buildBackupFilePath(backupDirectory, 'standard', fixedDate)));
  assert.equal(names.size, 100);
  let active = 0, peak = 0;
  const fixture = fakeDatabase({ keys: true, beforeFinish: async () => { active++; peak = Math.max(active, peak); await new Promise((resolve) => setTimeout(resolve, 8)); active--; } });
  const results = await Promise.all(Array.from({ length: 8 }, () => backups.createFullDatabaseBackup({ dbModule: fixture, directoryPath: backupDirectory, downloadDirectory, retentionCount: 3 })));
  assert.equal(peak, 1);
  assert.equal(new Set(results.map((result) => result.filePath)).size, 8);
  assert.equal(backups.listBackupFiles(backupDirectory).length, 3);
  assert.equal(fs.readdirSync(backupDirectory).length, 9);
  assert.ok(fs.existsSync(results.at(-1).filePath));
  assert.equal(fs.readdirSync(downloadDirectory).length, 8);
  for (const result of results) {
    const entries = unzip(result.downloadFilePath);
    assert.equal(entries.size, 3);
    assert.equal(sha256(entries.get(result.databaseFileName)), result.sha256);
  }
  assert.equal(results.reduce((total, result) => total + result.removedFiles.length, 0), 5);
});

test('failed partial backup cleans its own files only, does not run retention, and releases the directory queue', async (t) => {
  const directory = temporaryDirectory(t), backupDirectory = path.join(directory, 'backups'), downloadDirectory = path.join(directory, 'downloads');
  for (let i = 0; i < 4; i++) await backups.createFullDatabaseBackup({ dbModule: fakeDatabase({ keys: true }), directoryPath: backupDirectory, downloadDirectory, retentionCount: 10 });
  const oldFiles = fs.readdirSync(backupDirectory).sort();
  const before = new Map(oldFiles.map((name) => [name, sha256(fs.readFileSync(path.join(backupDirectory, name)))]));
  await assert.rejects(backups.createFullDatabaseBackup({ dbModule: fakeDatabase({ keys: true, fail: true }), directoryPath: backupDirectory, downloadDirectory, retentionCount: 3 }), /controlled fixture/);
  assert.deepEqual(fs.readdirSync(backupDirectory).sort(), oldFiles);
  assert.equal(fs.readdirSync(downloadDirectory).length, 4);
  for (const [name, checksum] of before) assert.equal(sha256(fs.readFileSync(path.join(backupDirectory, name))), checksum);
  const afterFailure = await backups.createFullDatabaseBackup({ dbModule: fakeDatabase(), directoryPath: backupDirectory, retentionCount: 10 });
  assert.ok(fs.existsSync(afterFailure.manifestPath));
});

test('ZIP stream failure removes incomplete batch but preserves all previously successful backups', async (t) => {
  const directory = temporaryDirectory(t), backupDirectory = path.join(directory, 'backups'), downloadDirectory = path.join(directory, 'downloads');
  const old = await backups.createFullDatabaseBackup({ dbModule: fakeDatabase({ keys: true }), directoryPath: backupDirectory, downloadDirectory });
  const originalCreateWriteStream = fs.createWriteStream;
  fs.createWriteStream = function (filePath, ...args) {
    if (String(filePath).endsWith('.zip')) {
      const { Writable } = require('node:stream');
      return new Writable({ write(chunk, encoding, callback) { callback(new Error('controlled ZIP disk failure')); } });
    }
    return originalCreateWriteStream.call(fs, filePath, ...args);
  };
  try {
    await assert.rejects(backups.createFullDatabaseBackup({ dbModule: fakeDatabase({ keys: true }), directoryPath: backupDirectory, downloadDirectory, retentionCount: 3 }), /controlled ZIP disk failure/);
  } finally { fs.createWriteStream = originalCreateWriteStream; }
  assert.deepEqual(fs.readdirSync(backupDirectory).sort(), [path.basename(old.filePath), path.basename(old.manifestPath), old.credentialKeyFileName].sort());
  assert.deepEqual(fs.readdirSync(downloadDirectory), [old.downloadFileName]);
  assert.equal(unzip(old.downloadFilePath).size, 3);
});

test('retention preserves legacy names, separates emergency backups and removes complete old families', async (t) => {
  const directory = temporaryDirectory(t), backupDirectory = path.join(directory, 'backups');
  fs.mkdirSync(backupDirectory);
  const oldNames = ['TanChin-Time-Clock-SQLite3-db-20260101-000001', 'TanChin-Time-Clock-SQLite3-db-20260101-000002', 'TanChin-Time-Clock-SQLite3-db-20260101-000003'];
  for (let i = 0; i < oldNames.length; i++) {
    const base = path.join(backupDirectory, oldNames[i]);
    for (const suffix of ['.db', '.manifest.json', '.db.web-credentials.json']) fs.writeFileSync(`${base}${suffix}`, 'legacy fixture');
    fs.utimesSync(`${base}.db`, i + 1, i + 1);
  }
  const emergencyFile = path.join(backupDirectory, 'TanChin-Time-Clock-SQLite3-db-emergency-20260101-000001.db');
  fs.writeFileSync(emergencyFile, 'emergency fixture');
  const unrelated = path.join(backupDirectory, 'unrelated.db'); fs.writeFileSync(unrelated, 'keep');
  const result = await backups.createFullDatabaseBackup({ dbModule: fakeDatabase(), directoryPath: backupDirectory, retentionCount: 3 });
  assert.deepEqual(result.removedFiles, [path.join(backupDirectory, `${oldNames[0]}.db`)]);
  for (const suffix of ['.db', '.manifest.json', '.db.web-credentials.json']) assert.equal(fs.existsSync(path.join(backupDirectory, `${oldNames[0]}${suffix}`)), false);
  assert.ok(fs.existsSync(emergencyFile)); assert.ok(fs.existsSync(unrelated));
  assert.equal(backups.listBackupFiles(backupDirectory).length, 3);
  assert.equal(backups.listBackupFiles(backupDirectory, 'emergency').length, 1);
});

test('a locked old backup reports a retention warning without removing the completed new backup or ZIP', async (t) => {
  const directory = temporaryDirectory(t), backupDirectory = path.join(directory, 'backups'), downloadDirectory = path.join(directory, 'downloads');
  for (let i = 0; i < 3; i++) await backups.createFullDatabaseBackup({ dbModule: fakeDatabase({ keys: true }), directoryPath: backupDirectory });
  const oldFiles = new Set(backups.listBackupFiles(backupDirectory).map((file) => file.filePath));
  const originalUnlink = fs.unlinkSync;
  fs.unlinkSync = function (filePath) {
    if (oldFiles.has(filePath)) throw new Error('controlled locked old backup');
    return originalUnlink.call(fs, filePath);
  };
  let result;
  try {
    result = await backups.createFullDatabaseBackup({ dbModule: fakeDatabase({ keys: true }), directoryPath: backupDirectory, downloadDirectory, retentionCount: 3 });
  } finally { fs.unlinkSync = originalUnlink; }
  assert.match(result.retentionWarning, /備份已完成.*controlled locked old backup/);
  assert.ok(fs.existsSync(result.filePath));
  assert.ok(fs.existsSync(result.manifestPath));
  assert.equal(unzip(result.downloadFilePath).size, 3);
  assert.equal(backups.listBackupFiles(backupDirectory).length, 4);
});
