'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const Database = require('better-sqlite3');
const { punchHistoryWindow, createEmployeeBrowserSettingsStore } = require('../employee-browser-settings');
const { startFixture } = require('./fixtures/browser-server');
const at = (text) => Date.parse(`${text}+08:00`);

test('Taipei punch windows include six prior dates and handle January, leap February and now boundary', () => {
    const now = at('2027-01-01T00:01:00');
    assert.equal(punchHistoryWindow('recent7', now).startAt, at('2026-12-26T00:00:00'));
    assert.equal(punchHistoryWindow('current_month', now).startAt, at('2027-01-01T00:00:00'));
    assert.equal(punchHistoryWindow('current_previous_month', now).startAt, at('2026-12-01T00:00:00'));
    assert.equal(punchHistoryWindow('current_previous_month', at('2028-03-01T00:00:00')).startAt, at('2028-02-01T00:00:00'));
    for (const mode of ['recent7', 'current_month', 'current_previous_month']) {
        assert.equal(punchHistoryWindow(mode, now).endAt, now);
        assert.equal(punchHistoryWindow(mode, now).timeZone, 'Asia/Taipei');
    }
});

test('settings store persists independently, rejects incomplete/stale edits and rolls back settings with audit', () => {
    const sql = new Database(':memory:');
    try {
        sql.exec("CREATE TABLE employees(id TEXT PRIMARY KEY,name TEXT,department TEXT); CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE employee_devices(employee_id TEXT); CREATE TABLE audit_test(target TEXT); INSERT INTO employees VALUES('E1','Employee','A'),('E2','Other','B');");
        let failAudit = false;
        const log = (entry) => { sql.prepare('INSERT INTO audit_test VALUES(?)').run(entry.target_id); if (failAudit) throw new Error('fixture audit failed'); };
        let store = createEmployeeBrowserSettingsStore(sql, log);
        const audit = (entry) => ({ ...entry, actor_id: 'ADMIN' });
        const body = (changes = {}) => { const state = store.state(); return { revision: state.revision, employees: state.employees.map((row) => ({ id: row.id, punchHistoryMode: row.punchHistoryMode, deviceLimit: row.deviceLimit, ...(row.id === 'E1' ? changes : {}) })), reason: 'Fixture setting', confirm: true }; };
        const original = store.state(), stale = body();
        assert.equal(original.globalDeviceLimit, 4);
        assert.equal(original.employees[0].punchHistoryMode, 'recent7');
        store.save(body({ punchHistoryMode: 'current_previous_month', deviceLimit: 2 }), audit);
        store = createEmployeeBrowserSettingsStore(sql, log);
        assert.deepEqual(store.forEmployee('E1'), { punchHistoryMode: 'current_previous_month', deviceLimit: 2, effectiveDeviceLimit: 2 });
        assert.equal(store.forEmployee('E2').effectiveDeviceLimit, 4);
        sql.prepare('INSERT INTO settings VALUES (?, ?)').run('browserSecuritySettings', JSON.stringify({ maxDevicesPerEmployee: 3 }));
        assert.equal(store.state().globalDeviceLimit, 3);
        assert.equal(store.forEmployee('E1').effectiveDeviceLimit, 2);
        assert.equal(store.forEmployee('E2').effectiveDeviceLimit, 3);
        assert.throws(() => store.save(stale, audit), (e) => e.status === 409);
        const before = store.state();
        for (const invalid of [{ ...body(), confirm: false }, { ...body(), reason: '' }, { ...body(), employees: [] }, body({ deviceLimit: 5 }), body({ deviceLimit: '2' }), body({ punchHistoryMode: 'all' })]) {
            assert.throws(() => store.save(invalid, audit), (e) => e.status === 400);
            assert.deepEqual(store.state(), before);
        }
        const auditCount = sql.prepare('SELECT COUNT(*) n FROM audit_test').get().n;
        failAudit = true;
        assert.throws(() => store.save(body({ deviceLimit: 1 }), audit), /fixture audit failed/);
        assert.deepEqual(store.state(), before);
        assert.equal(sql.prepare('SELECT COUNT(*) n FROM audit_test').get().n, auditCount);
        store.removeEmployees(['E1']);
        assert.deepEqual(store.forEmployee('E1'), { punchHistoryMode: 'recent7', deviceLimit: null, effectiveDeviceLimit: 3 });
    } finally { sql.close(); }
});

test('HTTP settings permissions, punch scope, per-employee binding limits and deletion remain fixture isolated', async (t) => {
    const fixture = await startFixture(), { db, url } = fixture;
    const sql = new Database(fixture.databasePath);
    t.after(async () => { sql.close(); await fixture.close(); });
    const request = async (route, body, token) => {
        const response = await fetch(`${url}/api/browser${route}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
        return { status: response.status, ...await response.json() };
    };
    const login = async (id, secret, role = 'employee', deviceInfo) => {
        const result = await request('/login', { employeeId: id, secret, role: 'account', deviceInfo });
        if (result.status === 200 && result.dashboard.role === 'workspace') return request('/workspace', { role, deviceInfo }, result.token);
        return result;
    };
    db.setSetting('browserSecuritySettings', { deviceBindingEnabled: false, maxDevicesPerEmployee: 1, gpsRequiredOnPunch: false });
    const manager = await login('A001', 'A001-test-password', 'admin');
    const viewer = await login('A002', 'A002-test-password', 'admin');
    const employee = await login('E001', 'employee-card');
    const system = await request('/login', { employeeId: 'system-admin', secret: 'system-admin-test', role: 'system_admin' });
    const route = '/employee-browser-settings';
    const saveBody = async (changes) => { const result = await request(route, null, manager.token); assert.equal(result.status, 200); return { revision: result.settings.revision, reason: 'Fixture HTTP settings', confirm: true,
        employees: result.settings.employees.map((row) => ({ id: row.id, punchHistoryMode: row.punchHistoryMode, deviceLimit: row.deviceLimit, ...(row.id === 'E001' ? changes : {}) })) }; };
    await t.test('viewers can inspect but only security managers/system administrator can write, and simulation cannot write', async () => {
        assert.equal((await request(route, null, viewer.token)).status, 200);
        assert.equal((await request(route, null, employee.token)).status, 403);
        const managerEmployee = await login('A001', 'A001-test-password', 'employee');
        assert.equal((await request(route, null, managerEmployee.token)).status, 403);
        assert.equal((await request(route, null, null)).status, 401);
        const body = await saveBody({});
        assert.equal((await request(route, body, viewer.token)).status, 403);
        assert.equal((await request(route, body, employee.token)).status, 403);
        assert.equal((await request(route, body, system.token)).status, 200);
        assert.deepEqual((await request('/dashboard', null, system.token)).dashboard.datasets.employeeBrowserSettings,
            (await request(route, null, manager.token)).settings);
        db.setSetting('systemPassword', 'fixture-password'); db.setSetting('developerImpersonationEnabled', true);
        const developer = await login('D001', 'D001-test-password', 'developer');
        assert.equal((await request('/developer/impersonation/start', { targetRole: 'admin', targetEmployeeId: 'A001', systemPassword: 'fixture-password' }, developer.token)).status, 200);
        assert.equal((await request(route, body, developer.token)).status, 403);
    });
    await t.test('employee dashboard filters exact own Taipei windows through now while summary always remains seven days', async () => {
        const now = Date.now(), week = punchHistoryWindow('recent7', now), previous = punchHistoryWindow('current_previous_month', now), month = punchHistoryWindow('current_month', now);
        const timestamps = [...new Set([previous.startAt - 1, previous.startAt, month.startAt - 1, month.startAt, week.startAt - 1, week.startAt, now - 1, now + 3600000])];
        for (const timestamp of timestamps) db.addPunchRecord({ id: 'E001', timestamp, type: 'in', shift: 'Test', status: '正常', source: 'browser' });
        db.addPunchRecord({ id: 'A002', timestamp: now - 2, type: 'in', shift: 'Private', status: '正常', source: 'browser' });
        const historyBefore = db.getRequestHistory().state();
        for (const mode of ['recent7', 'current_month', 'current_previous_month']) {
            const body = await saveBody({ punchHistoryMode: mode });
            assert.equal((await request(route, body, manager.token)).status, 200);
            const result = await request('/dashboard', null, employee.token), dashboard = result.dashboard;
            assert.equal(result.status, 200);
            assert.equal(dashboard.punchHistoryWindow.mode, mode);
            const range = dashboard.punchHistoryWindow;
            assert.deepEqual(dashboard.recentRecords.map((row) => row.timestamp).sort((a,b) => a-b), timestamps.filter((time) => time >= range.startAt && time <= range.endAt).sort((a,b) => a-b));
            assert.equal(dashboard.summary.weekRecordCount, timestamps.filter((time) => time >= week.startAt && time <= range.endAt).length);
            assert.equal(dashboard.summary.validRecordCount, dashboard.summary.weekRecordCount);
            assert.ok(dashboard.recentRecords.every((row) => row.id === 'E001'));
        }
        assert.deepEqual(db.getRequestHistory().state(), historyBefore);
    });
    await t.test('HTTP audit failure leaves both settings and revision unchanged', async () => {
        const before = (await request(route, null, manager.token)).settings;
        const body = await saveBody({ deviceLimit: 3 });
        sql.exec("CREATE TRIGGER fail_browser_setting BEFORE INSERT ON audit_logs WHEN NEW.action='employee_browser_settings_update' BEGIN SELECT RAISE(ABORT,'fixture setting audit failure'); END");
        try { assert.equal((await request(route, body, manager.token)).status, 500); assert.deepEqual((await request(route, null, manager.token)).settings, before); }
        finally { sql.exec('DROP TRIGGER fail_browser_setting'); }
    });
    await t.test('effective override permits additional new bindings, lowering preserves existing proofs and diagnostics report actual limit', async () => {
        assert.equal((await request(route, await saveBody({ deviceLimit: 2 }), manager.token)).status, 200);
        db.setSetting('browserSecuritySettings', { deviceBindingEnabled: true, maxDevicesPerEmployee: 1, gpsRequiredOnPunch: false });
        const first = await login('E001', 'employee-card', 'employee', { deviceId: 'first' });
        const second = await login('E001', 'employee-card', 'employee', { deviceId: 'second' });
        assert.equal(first.status, 200); assert.equal(second.status, 200);
        assert.equal(second.deviceBinding.maxDevicesPerEmployee, 2);
        assert.equal(second.dashboard.security.maxDevicesPerEmployee, 2);
        const blocked = await login('E001', 'employee-card', 'employee', { deviceId: 'third' });
        assert.equal(blocked.status, 403); assert.match(blocked.error, /P213.*2 台/);
        assert.equal((await request(route, await saveBody({ deviceLimit: 1 }), manager.token)).status, 200);
        const existing = await login('E001', 'employee-card', 'employee', { deviceId: 'second', deviceToken: second.deviceBinding.issuedDeviceToken });
        assert.equal(existing.status, 200); assert.equal(existing.dashboard.security.maxDevicesPerEmployee, 1);
        assert.equal(existing.deviceBinding.boundDeviceCount, 2); assert.equal(db.loadEmployeeDevices('E001').length, 2);
        const extra = await login('E001', 'employee-card', 'employee', { deviceId: 'fourth' });
        assert.equal(extra.status, 403); assert.match(extra.error, /P213.*1 台/);
        const diagnostics = (await request('/dashboard', null, manager.token)).dashboard.datasets.security.deviceLoginDiagnostics.records;
        assert.ok(diagnostics.some((row) => row.employeeId === 'E001' && row.failureCode === 'P213' && row.maxDevicesPerEmployee === 2));
        assert.ok(diagnostics.some((row) => row.employeeId === 'E001' && row.failureCode === 'P213' && row.maxDevicesPerEmployee === 1));
        assert.equal((await request(route, await saveBody({ deviceLimit: null }), manager.token)).status, 200);
        assert.equal(db.getEmployeeBrowserSettings().forEmployee('E001').effectiveDeviceLimit, 1);
    });
    await t.test('deleting and reusing an employee id never inherits individual settings', () => {
        const employees = db.loadEmployees(), old = employees.find((row) => row.id === 'E001');
        db.saveEmployees(employees.filter((row) => row.id !== 'E001'));
        db.saveEmployees([...db.loadEmployees(), old]);
        assert.deepEqual(db.getEmployeeBrowserSettings().forEmployee('E001'), { punchHistoryMode: 'recent7', deviceLimit: null, effectiveDeviceLimit: 1 });
        db.deleteAllEmployees();
        assert.equal(sql.prepare('SELECT COUNT(*) n FROM employee_browser_settings').get().n, 0);
    });
});
