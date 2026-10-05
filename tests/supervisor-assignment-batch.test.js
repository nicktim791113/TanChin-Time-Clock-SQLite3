const assert = require('node:assert/strict');
const { test } = require('node:test');
const Database = require('better-sqlite3');
const { startFixture } = require('./fixtures/browser-server');
const { createSupervisorStore } = require('../supervisor-management');

test('batch assignment API preserves permissions, versions, additive and replacement contracts', async (t) => {
    const fixture = await startFixture(), { db, url } = fixture;
    const inspection = new Database(fixture.databasePath);
    t.after(async () => { inspection.close(); await fixture.close(); });
    db.setSetting('browserSecuritySettings', { deviceBindingEnabled: false, gpsRequiredOnPunch: false });
    const staff = Array.from({ length: 101 }, (_, i) => ({ id: `B${String(i).padStart(3, '0')}`, name: `Batch ${i}`, department: 'Batch', card: `BATCH-CARD-${i}` }));
    db.saveEmployees([...db.loadEmployees(), ...staff]);
    async function request(route, body, token) {
        const response = await fetch(`${url}/api/browser${route}`, { method: body ? 'POST' : 'GET',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
        return { status: response.status, ...await response.json() };
    }
    async function login(id, secret, role) {
        const account = await request('/login', { employeeId: id, secret, role: 'account' });
        assert.equal(account.status, 200, JSON.stringify(account));
        return account.dashboard.role === 'workspace' ? request('/workspace', { role }, account.token) : account;
    }
    const system = await request('/login', { employeeId: 'system-admin', secret: 'system-admin-test', role: 'system_admin' });
    const admin = await login('A001', 'A001-test-password', 'admin');
    const restricted = await login('A002', 'A002-test-password', 'admin');
    const employee = await login('E001', 'employee-card', 'employee');
    const state = () => db.getSupervisors().assignmentsState();
    function body(ids = ['B000', 'B001'], supervisors = ['A001', 'A002'], mode = 'add') {
        return { employeeIds: ids, supervisorIds: supervisors, mode, reason: 'Batch assignment test', confirmAssignment: true,
            revisions: Object.fromEntries(state().employees.filter((e) => ids.includes(e.id)).map((e) => [e.id, e.revision])) };
    }
    const save = (value, token = system.token) => request('/supervisors/assignments/batch', value, token);
    const selected = (id) => state().employees.find((e) => e.id === id).supervisorIds;

    await t.test('only authorized managers and independent system administrators may use the batch endpoint', async () => {
        const before = state();
        for (const token of [null, restricted.token, employee.token]) assert.ok([401, 403].includes((await save(body(), token)).status));
        assert.deepEqual(state(), before);
        assert.equal((await save(body(), admin.token)).status, 200);
        assert.deepEqual(selected('B000'), ['A001', 'A002']);
        assert.deepEqual(selected('B002'), []);
    });
    await t.test('add mode retains existing grants and metadata, is duplicate-free and audits every employee with a common batch', async () => {
        const before = inspection.prepare('SELECT * FROM supervisor_assignments WHERE employee_id = ? ORDER BY supervisor_id').all('B000');
        const result = await save(body(['B000', 'B001'], ['A002', 'D001']));
        assert.equal(result.status, 200); assert.equal(result.updatedCount, 2);
        assert.deepEqual(selected('B000'), ['A001', 'A002', 'D001']);
        assert.deepEqual(selected('B001'), ['A001', 'A002', 'D001']);
        const logs = db.queryAuditLogs({ limit: 1000 }).filter((e) => e.after_data?.batchId === result.batchId);
        assert.equal(logs.length, 2); assert.ok(logs.every((e) => e.after_data.batchSize === 2 && e.actor_id));
        const log = logs.find((e) => e.target_id === 'B000');
        assert.deepEqual(log.before_data, before);
        assert.deepEqual(inspection.prepare("SELECT * FROM supervisor_assignments WHERE employee_id = ? AND supervisor_id IN ('A001','A002') ORDER BY supervisor_id").all('B000'), before);
    });
    await t.test('one stale target, changed roster, invalid or self supervisor never partially updates another target', async () => {
        const stale = body(['B001', 'B002'], ['D001']);
        await save(body(['B001'], ['A001'], 'replace'));
        const before = state();
        assert.equal((await save(stale)).status, 409); assert.deepEqual(state(), before);
        for (const invalid of [body(['B001', 'B002'], ['B002']), body(['B001', 'B002'], ['MISSING']), body(['B001', 'MISSING'])]) {
            assert.ok([400, 409].includes((await save(invalid)).status)); assert.deepEqual(state(), before);
        }
        const rosterStale = body(); db.saveEmployees([...db.loadEmployees(), { id: 'NEW', name: 'New staff', card: 'NEW-TEST-CARD' }]);
        const changed = state(); assert.equal((await save(rosterStale)).status, 409); assert.deepEqual(state(), changed);
    });
    await t.test('replacement and explicit empty replacement update exactly the selected employees; legacy single API remains compatible', async () => {
        assert.equal((await save(body(['B000', 'B001'], ['D001'], 'replace'))).status, 200);
        assert.deepEqual(selected('B000'), ['D001']); assert.deepEqual(selected('B001'), ['D001']);
        assert.equal((await save({ ...body(['B000'], [], 'replace'), confirmClear: true })).status, 200);
        assert.deepEqual(selected('B000'), []); assert.deepEqual(selected('B001'), ['D001']);
        const row = state().employees.find((e) => e.id === 'B000');
        assert.equal((await request('/supervisors/assignments', { employeeId: row.id, revision: row.revision, supervisorIds: ['A001'], reason: 'Legacy API' }, system.token)).status, 200);
        assert.deepEqual(selected('B000'), ['A001']);
    });
    await t.test('validation requires explicit mode, confirmation, reason, unique ids and complete revisions with a 100 employee limit', async () => {
        const before = state(), valid = body();
        const invalid = [ { ...valid, employeeIds: [] }, { ...valid, employeeIds: ['B000', 'B000'] }, { ...valid, supervisorIds: ['A001', 'A001'] },
            { ...valid, supervisorIds: [] }, { ...valid, confirmAssignment: false }, { ...valid, mode: 'unknown' }, { ...valid, reason: '' },
            { ...valid, revisions: {} }, { ...valid, revisions: [] }, body(['B000'], [], 'replace'), body(staff.map((e) => e.id)), { ...valid, supervisorIds: staff.map((e) => e.id) } ];
        for (const value of invalid) { assert.ok([400, 409].includes((await save(value)).status)); assert.deepEqual(state(), before); }
        assert.equal((await save(body(staff.slice(0, 100).map((e) => e.id), ['A001']))).updatedCount, 100);
    });
});

test('second-employee audit failure rolls back every assignment and the first audit row', () => {
    const sql = new Database(':memory:');
    try {
        sql.exec("CREATE TABLE employees (id TEXT PRIMARY KEY, name TEXT, department TEXT); INSERT INTO employees VALUES ('E1','One','A'),('E2','Two','B'),('S1','Supervisor','C'); CREATE TABLE audit_test (target TEXT)");
        const store = createSupervisorStore(sql, (entry) => {
            sql.prepare('INSERT INTO audit_test VALUES (?)').run(entry.target_id);
            if (entry.target_id === 'E2') throw new Error('Second audit failure');
        });
        const before = store.assignmentsState();
        assert.throws(() => store.saveAssignmentsBatch({ employeeIds: ['E1', 'E2'], supervisorIds: ['S1'], mode: 'add', confirmAssignment: true, reason: 'Test rollback',
            revisions: Object.fromEntries(before.employees.map((e) => [e.id, e.revision])) }, (entry) => ({ ...entry, actor_id: 'ADMIN' })), /Second audit failure/);
        assert.deepEqual(store.assignmentsState(), before);
        assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM audit_test').get().n, 0);
    } finally { sql.close(); }
});
