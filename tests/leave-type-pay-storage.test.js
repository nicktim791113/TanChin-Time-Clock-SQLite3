const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const db = require('../database');
const { startFixture } = require('./fixtures/browser-server');

test('old leave pay migrates without changing sick leave and half pay survives storage and backup', async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tanchin-leave-pay-'));
    const file = path.join(directory, 'legacy.db');
    t.after(() => { db.close(); fs.rmSync(directory, { recursive: true, force: true }); });
    const legacy = new Database(file);
    legacy.exec(`CREATE TABLE leave_types (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, unit TEXT,
        requires_attachment INTEGER NOT NULL DEFAULT 0, deducts_balance INTEGER NOT NULL DEFAULT 0,
        paid INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1, display_order INTEGER NOT NULL DEFAULT 0);
        INSERT INTO leave_types (id,name,unit,paid) VALUES ('annual','特休','hour',1),('sick','病假','hour',0);`);
    legacy.close(); db.init(file);
    assert.equal(db.loadLeaveTypes().find((row) => row.id === 'annual').pay_mode, 'full');
    assert.equal(db.loadLeaveTypes().find((row) => row.id === 'sick').pay_mode, 'unpaid');
    db.saveLeaveTypes(db.loadLeaveTypes().map((row) => row.id === 'sick' ? { ...row, pay_mode: 'half' } : row));
    const half = () => db.loadLeaveTypes().find((row) => row.id === 'sick');
    assert.equal(half().pay_rate, 0.5); assert.equal(half().paid, true);
    db.saveLeaveTypes(db.loadLeaveTypes().map(({ pay_mode, pay_rate, ...oldClientRow }) => oldClientRow));
    assert.equal(half().pay_mode, 'half');
    const beforeInvalid = db.loadLeaveTypes();
    assert.throws(() => db.saveLeaveTypes(beforeInvalid.map((row) => row.id === 'sick' ? { ...row, pay_mode: 'invalid' } : row)));
    assert.deepEqual(db.loadLeaveTypes(), beforeInvalid);
    const backupPath = path.join(directory, 'backup.db'); await db.backupDatabase(backupPath);
    const backup = new Database(backupPath, { readonly: true });
    assert.deepEqual(backup.prepare("SELECT paid,pay_mode FROM leave_types WHERE id='sick'").get(), { paid: 1, pay_mode: 'half' });
    backup.close(); db.close(); db.init(file);
    assert.equal(half().pay_mode, 'half'); assert.equal(half().pay_rate, 0.5);
});

test('HTTP leave pay supports half pay, legacy clients, permission rejection and failed-audit rollback', async (t) => {
    const fixture = await startFixture();
    const sql = new Database(fixture.databasePath);
    t.after(async () => { sql.close(); await fixture.close(); });
    async function request(route, body, token) {
        const response = await fetch(fixture.url + '/api/browser' + route, { method: body ? 'POST' : 'GET',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
        return { status: response.status, ...await response.json() };
    }
    async function login(id) {
        const account = await request('/login', { employeeId: id, secret: `${id}-test-password`, role: 'account' });
        return (await request('/workspace', { role: 'admin' }, account.token)).token;
    }
    const token = await login('A001'), limited = await login('A002');
    const oldTypes = fixture.db.loadLeaveTypes();
    const halfTypes = oldTypes.map((row) => row.id === 'sick' ? { ...row, pay_mode: 'half', paid: true } : row);
    assert.equal((await request('/admin/leave-types/save', { leaveTypes: halfTypes }, limited)).status, 403);
    assert.deepEqual(fixture.db.loadLeaveTypes(), oldTypes);
    assert.equal((await request('/admin/leave-types/save', { leaveTypes: halfTypes }, token)).status, 200);
    let types = fixture.db.loadLeaveTypes();
    assert.equal(types.find((row) => row.id === 'sick').pay_rate, 0.5);
    const oldClient = types.map(({ pay_mode, pay_rate, ...row }) => row);
    assert.equal((await request('/admin/leave-types/save', { leaveTypes: oldClient }, token)).status, 200);
    assert.equal(fixture.db.loadLeaveTypes().find((row) => row.id === 'sick').pay_mode, 'half');
    const invalid = types.map((row) => row.id === 'sick' ? { ...row, pay_mode: 'invalid' } : row);
    assert.equal((await request('/admin/leave-types/save', { leaveTypes: invalid }, token)).status, 400);
    assert.deepEqual(fixture.db.loadLeaveTypes(), types);
    sql.exec("CREATE TRIGGER pay_audit_failure BEFORE INSERT ON audit_logs WHEN NEW.target_type='leave_type' BEGIN SELECT RAISE(FAIL,'pay audit failure'); END");
    const fullTypes = types.map((row) => row.id === 'sick' ? { ...row, pay_mode: 'full' } : row);
    assert.equal((await request('/admin/leave-types/save', { leaveTypes: fullTypes }, token)).status, 500);
    assert.deepEqual(fixture.db.loadLeaveTypes(), types);
    sql.exec('DROP TRIGGER pay_audit_failure');
    const dashboard = await request('/dashboard', null, token);
    const exposed = dashboard.dashboard.datasets.leave.leaveTypes.find((row) => row.id === 'sick');
    assert.equal(exposed.pay_mode, 'half'); assert.equal(exposed.pay_rate, 0.5); assert.equal(exposed.paid, true);
});
