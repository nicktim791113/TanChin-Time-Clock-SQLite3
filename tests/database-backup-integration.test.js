const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const backups = require('../database-backup');
const { startFixture } = require('./fixtures/browser-server');

test('real server preserves two-location configuration and old non-download backup workflows without probing the default NAS', async (t) => {
  const nasCalls = [], originals = new Map();
  // Fail before a network access can occur. Catching a filesystem error in the
  // application must not hide an unwanted probe from this test.
  for (const name of ['existsSync', 'statSync', 'lstatSync', 'readdirSync', 'mkdirSync', 'readFileSync', 'writeFileSync', 'openSync', 'createReadStream', 'createWriteStream', 'accessSync', 'realpathSync']) {
    const original = fs[name];
    originals.set(name, original);
    fs[name] = function (candidate, ...args) {
      if (typeof candidate === 'string' && /^\\\\Ts5600d494[\\/]/i.test(candidate)) {
        nasCalls.push({ name, candidate });
        throw new Error('A configured secondary NAS must not be probed during ordinary dashboard/configuration operations.');
      }
      return original.call(fs, candidate, ...args);
    };
  }
  let fixture;
  t.after(async () => {
    for (const [name, original] of originals) fs[name] = original;
    if (fixture) {
      fixture.server.listeners('request')[0].locals.disposeDatabaseBackupRoutes?.();
      await fixture.close();
    }
  });
  fixture = await startFixture();
  const { db, directory } = fixture;
  const request = async (route, body, token) => {
    const response = await fetch(fixture.url + '/api/browser' + route, {
      method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, ...await response.json() };
  };
  const account = await request('/login', { employeeId: 'D001', secret: 'D001-test-password', role: 'account' });
  assert.equal(account.status, 200);
  const developer = await request('/workspace', { role: 'developer' }, account.token);
  assert.equal(developer.status, 200);
  const token = developer.token;
  const defaultPrimary = path.join(directory, 'DatabaseBackups');
  const configuredPrimary = path.join(directory, 'primary-location');
  const configuredSecondary = path.join(directory, 'secondary-location');
  const save = (body) => request('/developer/database-backup-settings/save', { defaultDirectory: '', retentionCount: 30, ...body }, token);
  const dashboard = () => request('/dashboard', undefined, token);
  const downloads = (current = directory) => fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(current, entry.name);
    if (entry.isSymbolicLink()) return [];
    return entry.isDirectory() ? downloads(filePath) : entry.name.endsWith('.zip') ? [filePath] : [];
  });

  await t.test('missing secondary defaults to the requested NAS but does not read or create that destination', async () => {
    assert.equal(db.getSetting('databaseBackupSecondaryDirectory'), null);
    assert.equal(developer.dashboard.datasets.databaseBackup.secondaryDirectory, backups.DEFAULT_SECONDARY_DATABASE_BACKUP_DIRECTORY);
    assert.equal(developer.dashboard.datasets.databaseBackup.effectiveDirectory, defaultPrimary);
    assert.equal(developer.dashboard.datasets.databaseBackup.retentionCount, 30);
    assert.equal(fs.existsSync(defaultPrimary), false);
    const current = await dashboard();
    assert.equal(current.status, 200);
    assert.deepEqual(nasCalls, []);
  });

  await t.test('an explicit blank secondary remains disabled after save and dashboard reload', async () => {
    const saved = await save({ secondaryDirectory: '' });
    assert.equal(saved.status, 200);
    assert.equal(saved.data.secondaryDirectory, '');
    assert.equal(saved.dashboard.datasets.databaseBackup.secondaryDirectory, '');
    assert.equal(db.getSetting('databaseBackupSecondaryDirectory'), '');
    assert.equal((await dashboard()).dashboard.datasets.databaseBackup.secondaryDirectory, '');
    const run = await request('/developer/database-backup/run', { destination: 'secondary', download: true }, token);
    assert.equal(run.status, 400);
    assert.equal(fs.existsSync(defaultPrimary), false);
    assert.deepEqual(downloads(), []);
    assert.deepEqual(nasCalls, []);
  });

  await t.test('saving the configured NAS and restoring two local test paths updates dashboard without creating directories', async () => {
    const savedNas = await save({ secondaryDirectory: backups.DEFAULT_SECONDARY_DATABASE_BACKUP_DIRECTORY });
    assert.equal(savedNas.status, 200);
    assert.equal(savedNas.data.secondaryDirectory, backups.DEFAULT_SECONDARY_DATABASE_BACKUP_DIRECTORY);
    assert.equal((await dashboard()).dashboard.datasets.databaseBackup.secondaryDirectory, backups.DEFAULT_SECONDARY_DATABASE_BACKUP_DIRECTORY);
    assert.deepEqual(nasCalls, []);
    const local = await save({ defaultDirectory: configuredPrimary, secondaryDirectory: configuredSecondary, retentionCount: 12 });
    assert.equal(local.status, 200);
    assert.equal(local.dashboard.datasets.databaseBackup.effectiveDirectory, configuredPrimary);
    assert.equal(local.dashboard.datasets.databaseBackup.secondaryDirectory, configuredSecondary);
    assert.equal(local.dashboard.datasets.databaseBackup.retentionCount, 12);
    assert.equal(fs.existsSync(configuredPrimary), false);
    assert.equal(fs.existsSync(configuredSecondary), false);
  });

  await t.test('old run with an empty body still creates a complete primary backup without ZIP or download token', async () => {
    const run = await request('/developer/database-backup/run', {}, token);
    assert.equal(run.status, 200, run.error);
    assert.equal(run.data.destination, 'primary');
    assert.equal(path.dirname(run.data.filePath), configuredPrimary);
    assert.ok(fs.existsSync(run.data.filePath));
    assert.ok(fs.existsSync(run.data.manifestPath));
    assert.ok(run.data.credentialKeyFileName);
    assert.equal(run.data.download, undefined);
    assert.equal(run.data.downloadFilePath, undefined);
    assert.deepEqual(downloads(), []);
    assert.equal(fs.readdirSync(configuredPrimary).length, 3);
    assert.equal(run.dashboard.datasets.databaseBackup.recentBackups.length, 1);
  });

  await t.test('legacy automation uses the configured primary location and produces no download archive', async () => {
    const run = await request('/developer/automation-tasks/execute', { id: 'compat-primary', task_type: 'backup', target: 'database_full', frequency: 'immediate' }, token);
    assert.equal(run.status, 200, run.error);
    assert.equal(run.data.status, 'success');
    assert.match(run.message, /完整資料庫備份已建立/);
    const files = backups.listBackupFiles(configuredPrimary);
    assert.equal(files.length, 2);
    const automated = files.map((file) => JSON.parse(fs.readFileSync(file.filePath.replace(/\.db$/, '.manifest.json'), 'utf8'))).find((manifest) => manifest.reason === 'automation');
    assert.equal(automated.taskId, 'compat-primary');
    assert.equal(automated.actor, 'automation');
    assert.equal(fs.readdirSync(configuredPrimary).filter((name) => name.endsWith('.zip')).length, 0);
    assert.deepEqual(downloads(), []);
  });

  await t.test('automation task-specific destinations remain supported independently of both configured locations', async () => {
    const custom = path.join(directory, 'legacy-task-destination');
    const run = await request('/developer/automation-tasks/execute', { id: 'compat-custom', task_type: 'backup', target: 'database_full', export_directory: custom }, token);
    assert.equal(run.status, 200, run.error);
    assert.equal(run.data.status, 'success');
    assert.equal(backups.listBackupFiles(custom).length, 1);
    assert.equal(fs.readdirSync(custom).length, 3);
    assert.equal(backups.listBackupFiles(configuredPrimary).length, 2);
    assert.equal(fs.existsSync(configuredSecondary), false);
    assert.deepEqual(downloads(), []);
    assert.deepEqual(nasCalls, []);
  });

  await t.test('omitting secondary in a legacy settings save preserves a deliberately blank secondary', async () => {
    assert.equal((await save({ secondaryDirectory: '' })).status, 200);
    const legacy = await save({ retentionCount: 15 });
    assert.equal(legacy.status, 200);
    assert.equal(legacy.data.secondaryDirectory, '');
    assert.equal(legacy.data.retentionCount, 15);
    assert.equal((await dashboard()).dashboard.datasets.databaseBackup.secondaryDirectory, '');
    assert.deepEqual(nasCalls, []);
  });
});
