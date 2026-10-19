'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const express = require('express');
const yazl = require('yazl');
const yauzl = require('yauzl');
const { attachDatabaseBackupRoutes } = require('../database-backup-routes');

async function writeZip(file, entries) {
  const zip = new yazl.ZipFile();
  for (const [name, content] of Object.entries(entries)) zip.addBuffer(Buffer.from(content), name);
  const done = new Promise((resolve, reject) => {
    const output = fs.createWriteStream(file);
    output.once('close', resolve); output.once('error', reject);
    zip.outputStream.once('error', reject).pipe(output);
  });
  zip.end(); await done;
}

function readZip(buffer, raw = false) {
  return new Promise((resolve, reject) => yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
    if (error) return reject(error);
    const entries = {};
    zip.on('error', reject); zip.on('end', () => resolve(entries));
    zip.on('entry', (entry) => zip.openReadStream(entry, (readError, stream) => {
      if (readError) return reject(readError);
      const chunks = []; stream.on('data', (data) => chunks.push(data)); stream.on('error', reject);
      stream.on('end', () => { const content = Buffer.concat(chunks); entries[entry.fileName] = raw ? content : content.toString(); zip.readEntry(); });
    }));
    zip.readEntry();
  }));
}

async function fixture(options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tanchin-backup-routes-test-'));
  const primary = path.join(directory, 'permanent-primary'), secondary = path.join(directory, 'permanent-secondary');
  const temp = path.join(directory, 'downloads');
  const downloadRoot = path.join(temp, 'TanChin-Time-Clock-SQLite3', 'database-backup-downloads');
  const sessions = new Map([
    ['developer-one', { token: 'developer-one', employeeId: 'D001', role: 'developer' }],
    ['developer-two', { token: 'developer-two', employeeId: 'D001', role: 'developer' }],
    ['employee', { token: 'employee', employeeId: 'E001', role: 'employee' }],
    ['admin', { token: 'admin', employeeId: 'A001', role: 'admin' }],
    ['impersonation', { token: 'impersonation', employeeId: 'D001', role: 'developer', impersonation: { active: true } }]
  ]);
  let clock = 1000, auditError = false, coreError = false, presentationError = false, coreGate = null;
  let settings = { databaseBackupDirectory: primary, databaseBackupSecondaryDirectory: secondary, databaseBackupRetentionCount: 30 };
  let audits = [], automation = [];
  const calls = [], notices = [];
  const getSettings = () => ({ defaultDirectory: settings.databaseBackupDirectory, secondaryDirectory: settings.databaseBackupSecondaryDirectory,
    effectiveDirectory: settings.databaseBackupDirectory || primary, fallbackDirectory: primary, retentionCount: settings.databaseBackupRetentionCount,
    recentBackups: [] });
  const db = {
    setSetting: (key, value) => { settings[key] = value; },
    addAuditLog: (entry) => { if (auditError) throw new Error('Audit store unavailable'); audits.push(entry); },
    addAutomationLog: (entry) => { automation.push(entry); },
    getSupervisors: () => ({ transaction: (callback) => {
      const before = structuredClone({ settings, audits, automation });
      try { return callback(); } catch (error) { ({ settings, audits, automation } = before); throw error; }
    } })
  };
  const app = express(); app.use(express.json());
  const routes = attachDatabaseBackupRoutes(app, {
    db, getSettings, now: () => clock, downloadTtlMs: 5000, maxDownloads: options.maxDownloads || 30,
    getTempDirectory: () => temp,
    requireSession: (request, response, next) => {
      const token = String(request.headers.authorization || '').replace(/^Bearer /, '');
      const session = sessions.get(token);
      if (!session) return response.status(401).json({ success: false });
      request.browserSession = session; next();
    },
    requireRole: (...roles) => (request, response, next) => roles.includes(request.browserSession?.role) ? next() : response.status(403).json({ success: false }),
    auditEntry: (request, entry) => ({ ...entry, actor_id: request.browserSession.employeeId }),
    notify: (request, events) => { if (presentationError) throw new Error('Notification unavailable'); notices.push(events); },
    buildDashboard: () => { if (presentationError) throw new Error('Summary unavailable'); return { kind: 'developer' }; },
    createBackup: async (args) => {
      calls.push(args);
      if (coreError) throw new Error('NAS permission denied');
      if (coreGate) await coreGate;
      fs.mkdirSync(args.directoryPath, { recursive: true });
      const name = `backup-${calls.length}.db`;
      const filePath = path.join(args.directoryPath, name), manifestPath = filePath.replace(/\.db$/, '.manifest.json');
      const entries = { [name]: 'SQLITE-TEST-CONTENT', [name.replace(/\.db$/, '.manifest.json')]: JSON.stringify({ type: 'sqlite-full-database-backup', credentialKeyFileName: `${name}.web-credentials.json` }),
        [`${name}.web-credentials.json`]: '{"key":"TEST-KEY-ONLY"}' };
      for (const [entryName, content] of Object.entries(entries)) fs.writeFileSync(path.join(args.directoryPath, entryName), content);
      const result = { filePath, manifestPath, sizeBytes: 19, sha256: 'test-hash', retentionWarning: 'TEST-RETENTION-WARNING' };
      if (args.downloadDirectory) {
        result.downloadFileName = name.replace(/\.db$/, '.zip');
        result.downloadFilePath = path.join(args.downloadDirectory, result.downloadFileName);
        await writeZip(result.downloadFilePath, entries);
      }
      return result;
    }
  });
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  const request = async (route, body, token = 'developer-one') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/browser/developer/${route}`, {
      method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    let json = {}; try { json = JSON.parse(buffer.toString()); } catch { /* ZIP response */ }
    return { status: response.status, headers: response.headers, buffer, text: buffer.toString(), ...json };
  };
  const close = async () => {
    routes.dispose(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
    assert.equal(path.dirname(directory), os.tmpdir());
    assert.ok(path.basename(directory).startsWith('tanchin-backup-routes-test-'));
    fs.rmSync(directory, { recursive: true, force: true });
  };
  return { directory, primary, secondary, temp, downloadRoot, sessions, request, calls, getSettings, routes, notices, close,
    audits: () => audits, automation: () => automation, advance: (ms) => { clock += ms; },
    auditError: (value) => { auditError = value; }, coreError: (value) => { coreError = value; },
    presentationError: (value) => { presentationError = value; }, gate: (value) => { coreGate = value; } };
}

test('backup HTTP routes require a current developer session and prohibit impersonation', async (t) => {
  const f = await fixture(); t.after(f.close);
  for (const token of ['', 'unknown', 'employee', 'admin', 'impersonation']) {
    const expected = ['', 'unknown'].includes(token) ? 401 : 403;
    assert.equal((await f.request('database-backup/run', { download: true }, token)).status, expected);
    assert.equal((await f.request('database-backup-settings/save', { defaultDirectory: f.primary, secondaryDirectory: f.secondary, retentionCount: 30 }, token)).status, expected);
    assert.equal((await f.request(`database-backup/download/${'a'.repeat(64)}`, undefined, token)).status, expected);
  }
  assert.equal(f.calls.length, 0);
});

test('backup settings validate paths without NAS I/O and rollback with a failed strict audit', async (t) => {
  const f = await fixture(); t.after(f.close);
  const nas = '\\\\Ts5600d494\\oms\\TanChin-Time-Clock-SQLite3 DB備份資料';
  const save = (body) => f.request('database-backup-settings/save', { defaultDirectory: f.primary, secondaryDirectory: nas, retentionCount: 30, ...body });
  const result = await save({}); assert.equal(result.status, 200, result.text);
  assert.equal(result.data.secondaryDirectory, nas); assert.equal(f.calls.length, 0);
  assert.equal(fs.existsSync(f.primary), false);
  const existing = f.getSettings();
  for (const body of [
    { defaultDirectory: 'relative/path' }, { defaultDirectory: 'C:relative' }, { defaultDirectory: '\\root-relative' },
    { secondaryDirectory: '..\\secret' }, { secondaryDirectory: 'C:\\backups\\..\\secret' },
    { secondaryDirectory: '\\\\?\\C:\\secret' }, { secondaryDirectory: ['C:\\backups'] },
    { secondaryDirectory: 1 }, { secondaryDirectory: '\\\\server' }, { secondaryDirectory: null },
    { retentionCount: 2 }, { retentionCount: 3651 }, { retentionCount: 3.5 }, { retentionCount: '3junk' },
    { retentionCount: true }, { retentionCount: '' }
  ]) assert.equal((await save(body)).status, 400, JSON.stringify(body));
  assert.deepEqual(f.getSettings(), existing);
  const legacy = await f.request('database-backup-settings/save', { defaultDirectory: '', retentionCount: 10 });
  assert.equal(legacy.status, 200); assert.equal(legacy.data.secondaryDirectory, nas);
  const before = f.getSettings(), auditCount = f.audits().length;
  f.auditError(true);
  assert.equal((await save({ defaultDirectory: f.secondary, secondaryDirectory: '', retentionCount: 50 })).status, 500);
  assert.deepEqual(f.getSettings(), before); assert.equal(f.audits().length, auditCount);
});

test('backup runs use only the selected saved location and never fall back from NAS failure', async (t) => {
  const f = await fixture(); t.after(f.close);
  for (const body of [{ destination: 'third' }, { destination: null }, { destination: {} }, { directoryPath: f.secondary }, { downloadDirectory: f.temp }, { download: 'true' }]) {
    const result = await f.request('database-backup/run', body);
    assert.equal(result.status, 400, result.text);
  }
  f.calls.length = 0;
  assert.equal((await f.request('database-backup/run', {})).status, 200);
  assert.equal(f.calls[0].directoryPath, f.primary); assert.equal(f.calls[0].downloadDirectory, undefined);
  const result = await f.request('database-backup/run', { destination: 'secondary', download: true });
  assert.equal(result.status, 200); assert.equal(f.calls[1].directoryPath, f.secondary);
  assert.equal(f.calls[1].metadata.destination, 'secondary'); assert.equal(result.data.retentionWarning, 'TEST-RETENTION-WARNING');
  assert.equal(result.data.downloadFilePath, undefined); assert.ok(!result.text.includes(f.calls[1].downloadDirectory));
  f.coreError(true); const callCount = f.calls.length;
  assert.equal((await f.request('database-backup/run', { destination: 'secondary', download: true })).status, 500);
  assert.equal(f.calls.length, callCount + 1); assert.equal(f.calls.at(-1).directoryPath, f.secondary);
  assert.equal(fs.existsSync(f.calls.at(-1).downloadDirectory), false);
  f.coreError(false);
  assert.equal((await f.request('database-backup-settings/save', { defaultDirectory: f.primary, secondaryDirectory: '', retentionCount: 30 })).status, 200);
  assert.equal((await f.request('database-backup/run', { destination: 'secondary' })).status, 400);
});

test('backup ZIP download is reusable, audited, complete, session-bound and revoked with role or session', async (t) => {
  const f = await fixture(); t.after(f.close);
  const result = await f.request('database-backup/run', { destination: 'primary', download: true });
  assert.equal(result.status, 200, result.text);
  const token = result.data.download.token, route = `database-backup/download/${token}`;
  assert.match(token, /^[a-f0-9]{64}$/); assert.ok(!token.includes('developer-one'));
  assert.equal((await f.request(route, undefined, 'developer-two')).status, 404);
  assert.equal((await f.request(route, undefined, '')).status, 401);
  assert.equal((await f.request(route + '?token=developer-one', undefined, '')).status, 401);
  const download = await f.request(route);
  assert.equal(download.status, 200); assert.equal(download.headers.get('cache-control'), 'no-store');
  assert.match(download.headers.get('content-disposition'), /^attachment;.*backup-1\.zip/);
  assert.match(download.headers.get('content-type'), /^application\/zip/);
  const entries = await readZip(download.buffer);
  assert.deepEqual(Object.keys(entries).sort(), ['backup-1.db', 'backup-1.db.web-credentials.json', 'backup-1.manifest.json']);
  assert.equal(entries['backup-1.db'], 'SQLITE-TEST-CONTENT');
  assert.equal(JSON.parse(entries['backup-1.manifest.json']).credentialKeyFileName, 'backup-1.db.web-credentials.json');
  assert.equal(JSON.parse(entries['backup-1.db.web-credentials.json']).key, 'TEST-KEY-ONLY');
  const retry = await f.request(route); assert.equal(retry.status, 200); assert.deepEqual(retry.buffer, download.buffer);
  assert.equal(f.audits().filter((entry) => entry.action === 'download').length, 2);
  assert.ok(f.audits().every((entry) => !JSON.stringify(entry).includes(token)));
  f.sessions.get('developer-one').role = 'employee'; assert.equal((await f.request(route)).status, 403);
  f.sessions.get('developer-one').role = 'developer';
  f.sessions.get('developer-one').impersonation = { active: true }; assert.equal((await f.request(route)).status, 403);
  delete f.sessions.get('developer-one').impersonation;
  f.sessions.delete('developer-one'); assert.equal((await f.request(route)).status, 401);
});

test('expired and malformed download tokens cannot read arbitrary paths and cleanup preserves permanent backups', async (t) => {
  const f = await fixture(); t.after(f.close);
  const result = await f.request('database-backup/run', { download: true });
  const entryDirectory = f.calls[0].downloadDirectory;
  for (const token of ['unknown', 'a'.repeat(64), '..%2F..%2Fsecret', '%2e%2e%5csecret', encodeURIComponent(f.calls[0].directoryPath)]) {
    assert.equal((await f.request(`database-backup/download/${token}`)).status, 404);
  }
  f.advance(5001);
  assert.equal((await f.request(`database-backup/download/${result.data.download.token}`)).status, 404);
  assert.equal(fs.existsSync(entryDirectory), false);
  assert.equal(fs.existsSync(result.data.filePath), true); assert.equal(fs.existsSync(result.data.manifestPath), true);
  assert.equal(fs.existsSync(result.data.filePath + '.web-credentials.json'), true);
});

test('download registry is bounded and does not clean an in-progress ZIP directory', async (t) => {
  const f = await fixture({ maxDownloads: 2 }); t.after(f.close);
  const first = await f.request('database-backup/run', { download: true });
  const second = await f.request('database-backup/run', { download: true });
  const third = await f.request('database-backup/run', { download: true });
  assert.equal((await f.request(`database-backup/download/${first.data.download.token}`)).status, 404);
  assert.equal((await f.request(`database-backup/download/${second.data.download.token}`)).status, 200);
  assert.equal((await f.request(`database-backup/download/${third.data.download.token}`)).status, 200);
  let release; f.gate(new Promise((resolve) => { release = resolve; }));
  const pending = f.request('database-backup/run', { download: true });
  await new Promise((resolve) => {
    const check = () => f.calls.length === 4 ? resolve() : setTimeout(check, 5); check();
  });
  const pendingDirectory = f.calls.at(-1).downloadDirectory;
  f.advance(6000); f.routes.cleanupDownloads();
  assert.equal(fs.existsSync(pendingDirectory), true, 'Active backup packaging must not be deleted by the expiry timer');
  release(); assert.equal((await pending).status, 200);
  assert.equal(fs.readdirSync(f.downloadRoot).length, 1);
});

test('failed backup and download audit do not expose a ZIP or issue success notifications', async (t) => {
  const f = await fixture(); t.after(f.close);
  f.auditError(true);
  const result = await f.request('database-backup/run', { download: true });
  assert.equal(result.status, 500); assert.equal(result.data, undefined);
  assert.match(result.error, /備份檔已建立並保留/);
  assert.equal(fs.existsSync(f.calls[0].downloadDirectory), false); assert.equal(f.notices.length, 0);
  assert.equal(f.automation().length, 0);
  f.auditError(false);
  const good = await f.request('database-backup/run', { download: true });
  f.auditError(true);
  const download = await f.request(`database-backup/download/${good.data.download.token}`);
  assert.equal(download.status, 500); assert.ok(!download.buffer.subarray(0, 2).equals(Buffer.from('PK')));
  f.auditError(false); assert.equal((await f.request(`database-backup/download/${good.data.download.token}`)).status, 200);
});

test('completed backup retains its download token when dashboard refresh or notification fails', async (t) => {
  const f = await fixture(); t.after(f.close); f.presentationError(true);
  const result = await f.request('database-backup/run', { download: true });
  assert.equal(result.status, 200, result.text); assert.equal(result.success, true); assert.equal(result.warnings.length, 2);
  assert.equal((await f.request(`database-backup/download/${result.data.download.token}`)).status, 200);
  const save = await f.request('database-backup-settings/save', { defaultDirectory: f.primary, secondaryDirectory: f.secondary, retentionCount: 50 });
  assert.equal(save.status, 200); assert.equal(save.success, true); assert.equal(f.getSettings().retentionCount, 50);
});

test('restart cleanup removes only expired owned packages whose process is dead', async (t) => {
  const f = await fixture(); t.after(f.close);
  const child = require('node:child_process').spawnSync(process.execPath, ['-e', ''], { windowsHide: true, env: process.env });
  assert.equal(child.status, 0); assert.ok(child.pid > 0);
  const create = (label, marker, parent = f.downloadRoot) => {
    fs.mkdirSync(parent, { recursive: true });
    const directory = fs.mkdtempSync(path.join(parent, `tanchin-db-download-${label}-`));
    fs.writeFileSync(path.join(directory, 'test.zip'), 'ZIP-PAYLOAD');
    if (marker) fs.writeFileSync(path.join(directory, '.owner.json'), JSON.stringify(marker));
    return directory;
  };
  const expiredMarker = { type: 'tanchin-database-backup-download', formatVersion: 1, pid: child.pid, createdAt: 0, expiresAt: 999 };
  const expired = create('expired', expiredMarker);
  const active = create('active', { ...expiredMarker, pid: process.pid });
  const future = create('future', { ...expiredMarker, expiresAt: 999999 });
  const unowned = create('unowned', null);
  const wrongMarker = create('wrong', { ...expiredMarker, type: 'another-application' });
  const outside = create('outside', expiredMarker, f.temp);
  const permanent = create('permanent', expiredMarker, f.primary);
  const junction = path.join(f.downloadRoot, 'tanchin-db-download-junction');
  fs.symlinkSync(permanent, junction, process.platform === 'win32' ? 'junction' : 'dir');
  f.routes.cleanupDownloads();
  assert.equal(fs.existsSync(expired), false);
  for (const directory of [active, future, unowned, wrongMarker, outside, permanent, junction]) assert.equal(fs.existsSync(directory), true, directory);
  assert.equal(fs.readFileSync(path.join(permanent, 'test.zip'), 'utf8'), 'ZIP-PAYLOAD');
  fs.unlinkSync(junction);
});

test('real server backs up SQLite with its matching credential key, rolls back settings audit, and rejects revoked developer sessions', async (t) => {
  const crypto = require('node:crypto');
  const { startFixture } = require('./fixtures/browser-server');
  const f = await startFixture();
  t.after(async () => { f.server.listeners('request')[0]?.locals?.disposeDatabaseBackupRoutes?.(); await f.close(); });
  const request = async (route, body, token) => {
    const response = await fetch(f.url + '/api/browser' + route, {
      method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    let json = {}; try { json = JSON.parse(buffer.toString()); } catch { /* ZIP */ }
    return { status: response.status, buffer, text: buffer.toString(), ...json };
  };
  const login = async () => {
    const account = await request('/login', { employeeId: 'D001', secret: 'D001-test-password', role: 'account' });
    assert.equal(account.status, 200, account.text);
    const developer = await request('/workspace', { role: 'developer' }, account.token);
    assert.equal(developer.status, 200, developer.text); return developer.token;
  };
  const token = await login(), otherToken = await login();
  const primary = path.join(f.directory, 'primary'), secondary = path.join(f.directory, 'secondary');
  const saved = await request('/developer/database-backup-settings/save', { defaultDirectory: primary, secondaryDirectory: secondary, retentionCount: 30 }, token);
  assert.equal(saved.status, 200, saved.text);
  const originalAudit = f.db.addAuditLog, original = f.db.getSetting('databaseBackupSecondaryDirectory');
  try {
    f.db.addAuditLog = () => { throw new Error('Synthetic strict audit failure'); };
    assert.equal((await request('/developer/database-backup-settings/save', { defaultDirectory: secondary, secondaryDirectory: '', retentionCount: 100 }, token)).status, 500);
    assert.deepEqual(f.db.getSetting('databaseBackupSecondaryDirectory'), original);
    assert.equal(f.db.getSetting('databaseBackupDirectory'), primary);
  } finally { f.db.addAuditLog = originalAudit; }
  const backup = await request('/developer/database-backup/run', { destination: 'secondary', download: true }, token);
  assert.equal(backup.status, 200, backup.text);
  assert.equal(path.dirname(backup.data.filePath), secondary); assert.equal(fs.existsSync(primary), false);
  const route = '/developer/database-backup/download/' + backup.data.download.token;
  assert.equal((await request(route, undefined, otherToken)).status, 404);
  const download = await request(route, undefined, token); assert.equal(download.status, 200, download.text.slice(0, 200));
  const entries = await readZip(download.buffer, true);
  const databaseName = path.basename(backup.data.filePath), manifestName = databaseName.replace(/\.db$/, '.manifest.json');
  const manifest = JSON.parse(entries[manifestName]);
  assert.equal(crypto.createHash('sha256').update(entries[databaseName]).digest('hex'), manifest.sha256);
  assert.equal(crypto.createHash('sha256').update(entries[manifest.credentialKeyFileName]).digest('hex'), manifest.credentialKeySha256);
  assert.deepEqual(entries[manifest.credentialKeyFileName], fs.readFileSync(backup.data.filePath + '.web-credentials.json'));
  f.db.saveAccountAccessRecords(f.db.loadAccountAccessRecords().map((record) => record.employee_id === 'D001' ? { ...record, allowed_roles: ['employee'] } : record));
  assert.equal((await request(route, undefined, token)).status, 401);
  assert.equal((await request('/developer/database-backup/run', { download: true }, token)).status, 401);
});
