const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { test } = require('node:test');
const db = require('../database');
const { startFixture } = require('./fixtures/browser-server');
const { taipeiDate, monthDates } = require('../meal-management');

test('lunch registrations preserve deadlines, same-row corrections, audit and supplier snapshots', async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tanchin-meals-'));
    const databasePath = path.join(directory, 'app_data.db');
    db.init(databasePath);
    const inspection = new Database(databasePath);
    t.after(() => { inspection.close(); db.close(); fs.rmSync(directory, { recursive: true, force: true }); });
    db.saveEmployees([{ id: 'E001', name: 'Employee', department: 'Test', card: 'card' }, { id: 'E002', name: 'Half day', card: 'card2' }]);
    const store = () => db.getMeals();
    const now = Date.parse('2026-10-01T08:00:00+08:00');
    const manager = { manager: true, actorId: 'A001', label: 'test', audit: (entry) => ({ ...entry, actor_id: 'A001', role: 'admin', timestamp: now }) };
    const employee = { manager: false, actorId: 'E001', audit: (entry) => ({ ...entry, actor_id: 'E001', role: 'employee', timestamp: now }) };
    const change = (id, date, eating, context = employee, time = now) => store().saveChoice({ employeeId: id, date, eating, version: store().dayState(date, time).version, reason: 'test correction' }, context, time);

    await t.test('empty initial calendar, valid leap dates and explicit Taipei timezone', () => {
        assert.equal(store().dayState('2026-10-01', now).serving, false);
        assert.equal(monthDates('2028-02').length, 29);
        assert.throws(() => monthDates('2026-13'));
        assert.throws(() => store().dayState('2026-02-30'));
        assert.equal(taipeiDate(Date.parse('2026-09-30T16:01:00Z')), '2026-10-01');
    });
    await t.test('membership defaults to lunch only on configured serving days; holiday and stop overrides work', () => {
        store().saveSchedule({ effectiveDate: '2026-10-01', weekdays: [4], cutoff: '09:00', leaveStart: '08:00', leaveEnd: '17:00', reason: 'schedule' }, manager, now);
        for (const id of ['E001', 'E002']) store().saveMember({ employeeId: id, effectiveDate: '2026-10-01', participating: true, reason: 'join' }, manager, now);
        assert.equal(store().dayState('2026-10-01', now).currentCount, 2);
        assert.equal(store().dayState('2026-10-02', now).currentCount, 0);
        store().saveDay({ date: '2026-10-04', serving: true, cutoff: '10:00', reason: 'holiday lunch' }, manager, now);
        assert.equal(store().dayState('2026-10-04', now).currentCount, 2);
        store().saveDay({ date: '2026-10-08', serving: false, cutoff: '09:00', reason: 'stop lunch' }, manager, now);
        assert.equal(store().dayState('2026-10-08', now).currentCount, 0);
    });
    await t.test('employee free changes before cutoff update one row; exact cutoff denies and manager requires reason', () => {
        change('E001', '2026-10-01', false);
        change('E001', '2026-10-01', true);
        assert.equal(inspection.prepare('SELECT COUNT(*) AS n FROM meal_choices').get().n, 1);
        const cutoff = Date.parse('2026-10-01T09:00:00+08:00');
        assert.throws(() => change('E001', '2026-10-01', false, employee, cutoff), /截止/);
        const day = store().dayState('2026-10-01', cutoff);
        assert.throws(() => store().saveChoice({ employeeId: 'E001', date: day.date, eating: false, version: day.version }, manager, cutoff), /原因/);
        change('E001', day.date, false, manager, cutoff);
        const logs = db.queryAuditLogs({ limit: 100 }).filter((row) => row.action === 'meal_choice');
        const correction = logs.find((row) => row.actor_id === 'A001');
        assert.equal(correction.before_data.eating, 1);
        assert.equal(correction.after_data.eating, false);
        assert.equal(correction.after_data.reason, 'test correction');
    });
    await t.test('supplier snapshots remain immutable and resubmission is explicit; stale writes fail', () => {
        const day = store().dayState('2026-10-01', now);
        store().closeOrder({ date: day.date, version: day.version, reason: 'supplier sent' }, manager, now);
        assert.throws(() => change('E002', day.date, false), /結單/);
        const original = inspection.prepare('SELECT snapshot_json FROM meal_orders WHERE revision = 1').get().snapshot_json;
        change('E001', day.date, true, manager);
        const after = store().dayState(day.date, now);
        assert.equal(after.currentCount, 2);
        assert.equal(after.submittedCount, 1);
        assert.equal(after.changes.length, 1);
        assert.throws(() => store().closeOrder({ date: day.date, version: day.version, reason: 'stale' }, manager, now), /變更/);
        store().closeOrder({ date: day.date, version: after.version, reason: 'supplier amendment' }, manager, now);
        assert.equal(store().dayState(day.date, now).submittedCount, 2);
        assert.equal(inspection.prepare('SELECT snapshot_json FROM meal_orders WHERE revision = 1').get().snapshot_json, original);
        assert.equal(inspection.prepare('SELECT COUNT(*) AS n FROM meal_choices WHERE employee_id = ? AND date = ?').get('E001', day.date).n, 1);
    });
    await t.test('approved full-day leave warns without cancelling, half-day does not warn', () => {
        for (const [id, end] of [['E001', '17:00'], ['E002', '12:00']]) {
            inspection.prepare('INSERT INTO leave_requests (id, employee_id, leave_type_id, start_at, end_at, duration_hours, reason, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                .run(`leave-${id}`, id, 'annual', now, Date.parse(`2026-10-01T${end}:00+08:00`), end === '17:00' ? 8 : 4, 'test', 'approved', now, now);
        }
        const day = store().dayState('2026-10-01', now);
        assert.equal(day.rows.find((row) => row.employee_id === 'E001').warning, true);
        assert.equal(day.rows.find((row) => row.employee_id === 'E002').warning, false);
        assert.equal(day.currentCount, 2);
        change('E001', day.date, false, manager);
        assert.equal(store().dayState(day.date, now).rows[0].warning, false);
    });
    await t.test('effective-dated settings and memberships cannot rewrite prior dates', () => {
        const next = Date.parse('2026-10-02T08:00:00+08:00');
        const count = store().dayState('2026-10-01', next).currentCount;
        store().saveMember({ employeeId: 'E002', effectiveDate: '2026-10-02', participating: false, reason: 'stop' }, manager, next);
        store().saveSchedule({ effectiveDate: '2026-10-02', weekdays: [], cutoff: '10:00', leaveStart: '08:00', leaveEnd: '17:00', reason: 'new rule' }, manager, next);
        assert.equal(store().dayState('2026-10-01', next).currentCount, count);
        assert.throws(() => store().saveDay({ date: '2026-10-01', serving: false, cutoff: '10:00', reason: 'past' }, manager, next), /歷史/);
        assert.throws(() => store().saveMember({ employeeId: 'E001', effectiveDate: '2026-10-01', participating: false, reason: 'past' }, manager, next), /歷史/);
    });
    await t.test('per-day cutoff overrides the weekly rule and closed days remain locked after extension', () => {
        const time = Date.parse('2026-10-04T09:59:59+08:00');
        change('E001', '2026-10-04', false, employee, time);
        assert.throws(() => change('E001', '2026-10-04', true, employee, time + 1000), /截止/);
        const day = store().dayState('2026-10-04', time);
        store().closeOrder({ date: day.date, version: day.version, reason: 'supplier lunch' }, manager, time);
        store().saveDay({ date: day.date, serving: true, cutoff: '23:59', reason: 'extend' }, manager, time);
        assert.throws(() => change('E001', day.date, true, employee, time), /結單/);
        assert.throws(() => store().saveDay({ date: '2026-10-05', serving: true, cutoff: '24:00', reason: 'bad time' }, manager, time), /時間/);
    });
    await t.test('later membership changes retain submitted people and disclose equal-total substitutions', () => {
        store().saveDay({ date: '2026-10-11', serving: true, cutoff: '10:00', reason: 'lunch' }, manager, now);
        const day = store().dayState('2026-10-11', now);
        assert.equal(day.currentCount, 1);
        store().closeOrder({ date: day.date, version: day.version, reason: 'sent' }, manager, now);
        store().saveMember({ employeeId: 'E002', effectiveDate: '2026-10-10', participating: true, reason: 'rejoin' }, manager, now);
        change('E001', day.date, false, manager);
        const after = store().dayState(day.date, now);
        assert.equal(after.currentCount, 1);
        assert.equal(after.submittedCount, 1);
        assert.equal(after.differenceCount, 0);
        assert.equal(after.changes.length, 2);
        assert.equal(after.orders[0].snapshot.rows.find((row) => row.employee_id === 'E001').eating, true);
    });
    await t.test('deleted employee participation stays visible until the manager explicitly stops it', () => {
        const employees = db.loadEmployees();
        db.saveEmployees(employees.filter((e) => e.id !== 'E002'));
        const day = store().dayState('2026-10-11', now);
        assert.equal(day.rows.find((row) => row.employee_id === 'E002').formerEmployee, true);
        assert.equal(day.currentCount, 1);
        change('E002', day.date, false, manager);
        store().saveMember({ employeeId: 'E002', effectiveDate: '2026-10-12', participating: false, reason: 'stop former employee' }, manager, now);
        assert.equal(store().dayState('2026-10-12', now).rows.find((row) => row.employee_id === 'E002')?.eligible || false, false);
        assert.throws(() => store().saveMember({ employeeId: 'E002', effectiveDate: '2026-10-13', participating: true, reason: 'invalid former join' }, manager, now), /員工/);
        db.saveEmployees(employees);
    });
    await t.test('all meal writes roll back if audit fails, including order snapshots', () => {
        inspection.exec("CREATE TRIGGER reject_meal_audit BEFORE INSERT ON audit_logs WHEN NEW.action LIKE 'meal_%' BEGIN SELECT RAISE(ABORT, 'audit failure'); END;");
        const snapshot = (table) => inspection.prepare(`SELECT * FROM ${table}`).all();
        const cases = [
            ['meal_choices', () => change('E001', '2026-10-01', true, manager)],
            ['meal_memberships', () => store().saveMember({ employeeId: 'E001', effectiveDate: '2026-10-05', participating: false, reason: 'stop' }, manager, now)],
            ['meal_schedules', () => store().saveSchedule({ effectiveDate: '2026-10-05', weekdays: [], cutoff: '09:00', leaveStart: '08:00', leaveEnd: '17:00', reason: 'stop' }, manager, now)],
            ['meal_days', () => store().saveDay({ date: '2026-10-04', serving: false, cutoff: '10:00', reason: 'stop' }, manager, now)],
            ['meal_orders', () => store().closeOrder({ date: '2026-10-01', version: store().dayState('2026-10-01', now).version, reason: 'resend' }, manager, now)]
        ];
        for (const [table, callback] of cases) { const before = snapshot(table); assert.throws(callback, /audit failure/); assert.deepEqual(snapshot(table), before); }
        inspection.exec('DROP TRIGGER reject_meal_audit');
    });
    await t.test('complete SQLite backup restores registrations and order snapshots across directories', async () => {
        const before = store().dayState('2026-10-01', now);
        const backup = path.join(directory, 'copy', 'backup.db');
        await db.backupDatabase(backup);
        change('E001', '2026-10-01', true, manager);
        await db.replaceDatabaseFromBackup(backup, { emergencyBackupPath: path.join(directory, 'emergency.db') });
        const restored = store().dayState('2026-10-01', now);
        assert.equal(restored.currentCount, before.currentCount);
        assert.deepEqual(restored.orders, before.orders);
    });
});

test('meal browser APIs isolate employee ownership and fine-grained management permissions', async (t) => {
    const fixture = await startFixture();
    t.after(() => fixture.close());
    async function request(route, body, token) {
        const response = await fetch(fixture.url + '/api/browser' + route, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
        return { status: response.status, ...await response.json() };
    }
    const account = await request('/login', { employeeId: 'A001', secret: 'A001-test-password', role: 'account' });
    assert.equal((await request('/admin/meals', null, account.token)).status, 403);
    const manager = await request('/workspace', { role: 'admin' }, account.token);
    const delegatedAccount = await request('/login', { employeeId: 'A002', secret: 'A002-test-password', role: 'account' });
    const delegated = await request('/workspace', { role: 'admin' }, delegatedAccount.token);
    assert.equal((await request('/admin/meals', null, delegated.token)).status, 403);
    assert.equal(delegated.dashboard.datasets.meals, null);
    const member = await request('/login', { employeeId: 'E001', secret: 'employee-card', role: 'account', deviceInfo: { deviceId: 'meal-device' } });
    assert.equal((await request('/admin/meals', null, member.token)).status, 403);
    const future = new Date(Date.now() + 3 * 86400000 + 8 * 3600000).toISOString().slice(0, 10);
    const month = future.slice(0, 7);
    assert.equal((await request('/admin/meals/membership', { employeeId: 'E001', effectiveDate: future, participating: true, reason: 'join' }, manager.token)).status, 200);
    assert.equal((await request('/admin/meals/day', { date: future, serving: true, cutoff: '09:00', reason: 'holiday' }, manager.token)).status, 200);
    const own = await request(`/employee/meals?month=${month}&employeeId=A001`, null, member.token);
    assert.equal(own.meals.employees, undefined);
    assert.ok(own.meals.days.every((day) => day.rows.length === 1 && day.rows[0].employee_id === 'E001' && day.currentCount === undefined));
    const day = own.meals.days.find((row) => row.date === future);
    assert.equal((await request('/employee/meals/choice', { date: future, employeeId: 'A001', eating: false, version: day.version }, member.token)).status, 200);
    const after = fixture.db.getMeals().dayState(future);
    assert.equal(after.rows.find((row) => row.employee_id === 'E001').eating, false);
    const csv = await fetch(fixture.url + `/api/browser/admin/meals/export?month=${month}`, { headers: { Authorization: `Bearer ${manager.token}` } });
    assert.equal(csv.status, 200);
    assert.ok((await csv.text()).includes('已交供應商份數'));
    fixture.db.saveEmployees(fixture.db.loadEmployees().map((e) => e.id === 'E001' ? { ...e, name: '  =1+1,"CSV"\nname' } : e));
    const escapedCsv = await fetch(fixture.url + `/api/browser/admin/meals/export?month=${month}`, { headers: { Authorization: `Bearer ${manager.token}` } });
    assert.ok((await escapedCsv.text()).includes("\"'=1+1,\"\"CSV\"\""));
    assert.equal((await request('/employee/meals?month=2026-13', null, member.token)).status, 400);
    assert.equal((await request('/employee/meals/choice', { date: '2026-02-30', eating: false, version: 'wrong' }, member.token)).status, 400);
    const access = fixture.db.getAccountAccessRecord('A001');
    fixture.db.saveAccountAccessRecord({ ...access, admin_preset: 'custom', admin_permissions: ['admin.meals.view'] });
    assert.equal((await request('/admin/meals', null, manager.token)).status, 200);
    for (const route of ['choice', 'day', 'schedule', 'membership', 'close']) assert.equal((await request(`/admin/meals/${route}`, { date: future }, manager.token)).status, 403);
});
