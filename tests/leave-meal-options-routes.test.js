const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { startFixture } = require('./fixtures/browser-server');
const at = (date, time) => Date.parse(`${date}T${time}:00+08:00`);

test('leave lunch selection preserves employee/proxy scope, deadline, complete rollback and withdrawal semantics', async (t) => {
    const fixture = await startFixture(), { db } = fixture;
    const sql = new Database(fixture.databasePath);
    t.after(async () => { sql.close(); await fixture.close(); });
    db.setSetting('browserSecuritySettings', { deviceBindingEnabled: false, gpsRequiredOnPunch: false });
    db.saveLeaveApprovalRoutes([{ department: '*', supervisor_id: 'A001', enabled: true }]);
    const api = async (route, token, body) => {
        const response = await fetch(fixture.url + '/api/browser' + route, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
        return { status: response.status, ...await response.json() };
    };
    const login = async (employeeId, secret) => {
        let result = await api('/login', null, { employeeId, secret, role: 'account' });
        if (result.dashboard.role === 'workspace') result = await api('/workspace', result.token, { role: 'employee' });
        assert.equal(result.status, 200, result.error); return result.token;
    };
    const employee = await login('E001', 'employee-card'), supervisor = await login('A001', 'manager-card');
    const manager = { manager: true, actorId: 'A001', audit: (entry) => ({ ...entry, actor_id: 'A001', role: 'admin' }) };
    const meals = db.getMeals(), supervisors = db.getSupervisors();
    for (const employeeId of ['E001', 'A002']) {
        meals.saveMember({ employeeId, effectiveDate: '2035-01-01', participating: true, reason: 'Fixture membership' }, manager);
        const row = supervisors.assignmentsState().employees.find((item) => item.id === employeeId);
        supervisors.saveAssignments({ employeeId, supervisorIds: ['A001'], revision: row.revision, reason: 'Fixture scope' }, manager.audit);
    }
    for (let day = 1; day <= 10; day++) meals.saveDay({ date: `2035-01-${String(day).padStart(2, '0')}`, serving: true, cutoff: '09:00', reason: 'Fixture serving day' }, manager);
    const leaveTypeId = db.loadLeaveTypes().find((type) => type.enabled && !type.deducts_balance).id;
    const period = (date, start = '12:30', end = '14:00', hours = 1.5) => ({ date, startAt: at(date, start), endAt: at(date, end), hours,
        breakMinutes: (at(date, end) - at(date, start)) / 60000 - hours * 60 });
    const body = (date, extra = {}) => ({ leaveTypeId, dateSelectionMode: 'explicit_segments', leaveSegments: [period(date)], reason: 'Medical appointment', ...extra });
    const choice = (date, employeeId = 'E001') => ({ employeeId, date });
    const eating = (date, employeeId = 'E001') => meals.dayState(date).rows.find((row) => row.employee_id === employeeId).eating;
    const count = () => db.countLeaveRequests();

    await t.test('new requests require a nonblank reason and eligibility cannot disclose other employee scope', async () => {
        for (const reason of ['', '  ', null]) {
            assert.equal((await api('/employee/leave/request', employee, body('2035-01-01', { reason }))).status, 400);
            assert.equal((await api('/employee/supervisor/leave', supervisor, body('2035-01-01', { reason, employeeIds: ['E001'], proxyReason: 'Assist', confirmApproval: true }))).status, 400);
        }
        const options = await api('/employee/leave/meal-options', employee, body('2035-01-01', { employeeIds: ['A002'] }));
        assert.equal(options.status, 200, options.error); assert.deepEqual(options.options.map((row) => row.employeeId), ['E001']);
        assert.equal(options.options[0].participates, true);
        const boundary = await api('/employee/leave/meal-options', employee, body('2035-01-01', { leaveSegments: [period('2035-01-01', '11:20', '12:20', 1), period('2035-01-01', '13:00', '14:00', 1)] }));
        assert.deepEqual(boundary.options, [], 'touching lunch endpoints does not cancel lunch');
        assert.equal((await api('/employee/supervisor/leave/meal-options', supervisor, body('2035-01-01', { employeeIds: ['D001'] }))).status, 403);
        assert.equal(count(), 0);
    });
    await t.test('exact dates cancel immediately and withdrawing leave never restores lunch', async () => {
        const result = await api('/employee/leave/request', employee, body('2035-01-01', { leaveSegments: [period('2035-01-01'), period('2035-01-02', '09:00', '10:00', 1)], mealOptOuts: [choice('2035-01-01')] }));
        assert.equal(result.status, 200, result.error); assert.equal(eating('2035-01-01'), false); assert.equal(eating('2035-01-02'), true);
        const row = db.queryLeaveRequests({ employeeId: 'E001' })[0]; assert.equal(row.status, 'pending_supervisor');
        assert.equal((await api('/employee/leave/withdraw', employee, { requestId: row.id })).status, 200);
        assert.equal(eating('2035-01-01'), false);
        assert.ok(db.queryAuditLogs({ limit: 100 }).some((item) => item.action === 'meal_choice' && item.after_data.reason.includes(row.id)));
    });
    await t.test('forged employee or non-noon date cannot modify a meal or leave', async () => {
        const before = count();
        assert.equal((await api('/employee/leave/request', employee, body('2035-01-03', { mealOptOuts: [choice('2035-01-03', 'A002')] }))).status, 403);
        assert.equal((await api('/employee/leave/request', employee, body('2035-01-03', { mealOptOuts: [choice('2035-01-04')] }))).status, 400);
        assert.equal((await api('/employee/supervisor/leave', supervisor, body('2035-01-03', { employeeIds: ['E001'], proxyReason: 'Assist', confirmApproval: true, mealOptOuts: [choice('2035-01-03', 'A002')] }))).status, 403);
        assert.equal(count(), before); assert.equal(eating('2035-01-03'), true);
    });
    await t.test('a closed order returns 409 and can be bypassed only by removing the meal selection', async () => {
        const date = '2035-01-04', day = meals.dayState(date);
        meals.closeOrder({ date, version: day.version, reason: 'Supplier already notified' }, manager);
        const before = count(), failed = await api('/employee/leave/request', employee, body(date, { mealOptOuts: [choice(date)] }));
        assert.equal(failed.status, 409, failed.error); assert.match(failed.error, /取消.*勾選/); assert.equal(count(), before); assert.equal(eating(date), true);
        assert.equal((await api('/employee/leave/request', employee, body(date, { mealOptOuts: [] }))).status, 200); assert.equal(eating(date), true);
    });
    await t.test('meal audit failure rolls back the employee request and every batch employee together', async () => {
        const before = count(), balances = db.getLeaveEntitlements().balances(['E001', 'A002'], 2035);
        sql.exec("CREATE TRIGGER fail_employee_lunch BEFORE INSERT ON audit_logs WHEN NEW.action = 'meal_choice' AND NEW.target_id = '2035-01-05/E001' BEGIN SELECT RAISE(ABORT, 'meal audit failure'); END;");
        const failed = await api('/employee/leave/request', employee, body('2035-01-05', { mealOptOuts: [choice('2035-01-05')] }));
        assert.equal(failed.status, 500); assert.equal(count(), before); assert.equal(eating('2035-01-05'), true);
        sql.exec('DROP TRIGGER fail_employee_lunch');
        sql.exec("CREATE TRIGGER fail_second_lunch BEFORE INSERT ON audit_logs WHEN NEW.action = 'meal_choice' AND NEW.target_id = '2035-01-06/A002' BEGIN SELECT RAISE(ABORT, 'second employee failure'); END;");
        const batch = await api('/employee/supervisor/leave', supervisor, body('2035-01-06', { employeeIds: ['E001', 'A002'], proxyReason: 'Assist both employees', confirmApproval: true, mealOptOuts: [choice('2035-01-06'), choice('2035-01-06', 'A002')] }));
        assert.equal(batch.status, 500); assert.equal(count(), before);
        assert.equal(eating('2035-01-06'), true); assert.equal(eating('2035-01-06', 'A002'), true);
        assert.deepEqual(db.getLeaveEntitlements().balances(['E001', 'A002'], 2035), balances);
        sql.exec('DROP TRIGGER fail_second_lunch');
    });
    await t.test('authorized proxy batch cancels each selected participant and rejection does not restore lunch', async () => {
        const batch = await api('/employee/supervisor/leave', supervisor, body('2035-01-07', { employeeIds: ['E001', 'A002'], proxyReason: 'Assist both employees', confirmApproval: true, mealOptOuts: [choice('2035-01-07'), choice('2035-01-07', 'A002')] }));
        assert.equal(batch.status, 200, batch.error); assert.equal(batch.createdCount, 2);
        assert.equal(eating('2035-01-07'), false); assert.equal(eating('2035-01-07', 'A002'), false);
        const result = await api('/employee/leave/request', employee, body('2035-01-08', { mealOptOuts: [choice('2035-01-08')] }));
        assert.equal(result.status, 200, result.error);
        const row = db.queryLeaveRequests({ employeeId: 'E001' }).find((item) => item.start_at === at('2035-01-08', '12:30'));
        const rejected = await api('/employee/leave/supervisor-decision', supervisor, { requestId: row.id, decision: 'rejected', comment: 'Reschedule' });
        assert.equal(rejected.status, 200, rejected.error); assert.equal(eating('2035-01-08'), false);
    });
});
