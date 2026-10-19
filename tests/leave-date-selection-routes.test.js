const assert = require('node:assert/strict');
const { test } = require('node:test');
const Database = require('better-sqlite3');
const { startFixture } = require('./fixtures/browser-server');

// Run this worker outside Taipei to guard against host-local date regressions.
process.env.TZ = 'UTC';

test('selected leave dates flow through self approval, paper correction, reports and audit rollback', async (t) => {
    const originalNow = Date.now;
    Date.now = () => Date.parse('2026-10-19T12:00:00+08:00');
    t.after(() => { Date.now = originalNow; });
    const f = await startFixture(), { db } = f, sql = new Database(f.databasePath);
    t.after(async () => { sql.close(); f.server.listeners('request')[0].locals.disposeDatabaseBackupRoutes?.(); await f.close(); });
    db.setSetting('browserSecuritySettings', { deviceBindingEnabled: false, gpsRequiredOnPunch: false });
    db.saveLeaveApprovalRoutes([{ department: '*', supervisor_id: 'A001', enabled: true }]);
    const type = db.loadLeaveTypes().find((row) => row.deducts_balance).id;
    async function request(route, body, token) {
        const response = await fetch(f.url + '/api/browser' + route, { method: body ? 'POST' : 'GET', headers: {
            'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {})
        }, body: body ? JSON.stringify(body) : undefined });
        return { status: response.status, ...await response.json() };
    }
    async function login(employeeId, secret, role) {
        let result = await request('/login', { employeeId, secret, role: 'account' });
        if (result.dashboard.role === 'workspace') result = await request('/workspace', { role }, result.token);
        assert.equal(result.status, 200); return result.token;
    }
    const employee = await login('E001', 'employee-card', 'employee'), admin = await login('A001', 'A001-test-password', 'admin');
    const supervisor = await login('A001', 'A001-test-password', 'employee');
    const body = { startDate: '2026-10-09', endDate: '2026-10-12', startTime: '09:00', endTime: '18:00',
        leaveTypeId: type, dateSelectionMode: 'explicit_dates', durationHours: 999,
        dailyHours: [{ date: '2026-10-09', hours: 8 }, { date: '2026-10-12', hours: 8 }], reason: 'Only selected working dates' };
    let selected;
    await t.test('self requests use the sum of selected days and allow another application on an excluded date', async () => {
        assert.equal((await request('/employee/leave/request', body, employee)).status, 200);
        selected = db.queryLeaveRequests({ employeeId: 'E001', status: 'pending_supervisor' })[0];
        assert.equal(selected.duration_hours, 16); assert.equal(selected.date_selection_mode, 'explicit_dates');
        assert.deepEqual(db.getLeaveEntitlements().charges(selected.id), body.dailyHours);
        const dashboard = await request('/dashboard', null, employee);
        const visible = dashboard.dashboard.leave.myRequests.find((r) => r.id === selected.id);
        assert.equal(visible.dateSelectionMode, 'explicit_dates'); assert.deepEqual(visible.dailyHours, body.dailyHours);
        const saturday = { ...body, startDate: '2026-10-10', endDate: '2026-10-10', dailyHours: [{ date: '2026-10-10', hours: 8 }] };
        assert.equal((await request('/employee/leave/request', saturday, employee)).status, 200);
        const weekend = db.queryLeaveRequests({ employeeId: 'E001' }).find((r) => r.id !== selected.id);
        assert.equal((await request('/employee/leave/request', { ...body, endDate: '2026-10-09', dailyHours: [body.dailyHours[0]] }, employee)).status, 409);
        assert.equal((await request('/employee/leave/withdraw', { requestId: weekend.id }, employee)).status, 200);
        assert.equal((await request('/employee/leave/supervisor-decision', { requestId: selected.id, decision: 'approved' }, supervisor)).status, 200);
        assert.equal((await request('/admin/leave/final-decision', { requestId: selected.id, decision: 'approved' }, admin)).status, 200);
    });
    await t.test('reports omit excluded days and retain daily hours when the query narrows to a single day', async () => {
        const query = (startDate, endDate) => request('/admin/reports/query', { employeeId: 'E001', startDate, endDate }, admin);
        const full = await query('2026-10-09', '2026-10-12'); assert.equal(full.status, 200);
        const records = full.data.records.filter((r) => r.recordKind === 'leave');
        assert.deepEqual(records.map((r) => r.dateText).sort(), ['2026-10-09', '2026-10-12']);
        assert.ok(records.every((r) => r.leaveDurationHours === 8 && r.leaveRequestDurationHours === 16));
        const weekend = await query('2026-10-10', '2026-10-11'); assert.equal(weekend.data.summary.leaveCount, 0);
        const monday = await query('2026-10-12', '2026-10-12');
        assert.equal(monday.data.records.filter((r) => r.recordKind === 'leave')[0].leaveDurationHours, 8);
    });
    await t.test('excluded dates do not produce leave punch conflicts or full-day leave warnings', async () => {
        for (const date of ['2026-10-09', '2026-10-10']) db.addPunchRecord({ id: 'E001', timestamp: Date.parse(`${date}T10:00:00+08:00`), type: 'in', shift: 'Test', status: '正常', source: 'manual' });
        const dashboard = await request('/dashboard', null, admin), alerts = dashboard.dashboard.datasets.leave.alerts.filter((r) => r.requestId === selected.id);
        assert.ok(alerts.some((r) => r.punchAt === Date.parse('2026-10-09T10:00:00+08:00')));
        assert.ok(alerts.every((r) => r.punchAt !== Date.parse('2026-10-10T10:00:00+08:00')));
    });
    await t.test('paper correction updates the same record and cannot downgrade selection; audit failure rolls back', async () => {
        const paperBody = { ...body, employeeIds: ['E001'], startDate: '2026-06-12', endDate: '2026-06-15',
            dailyHours: [{ date: '2026-06-12', hours: 7.5 }, { date: '2026-06-15', hours: 8 }] };
        assert.equal((await request('/admin/leave/paper-approved', paperBody, admin)).status, 200);
        const paper = db.queryLeaveRequests({ employeeId: 'E001' }).find((r) => r.approval_mode === 'admin_paper_approved');
        assert.equal(paper.duration_hours, 15.5);
        const changed = { ...paperBody, requestId: paper.id, dailyHours: [{ date: '2026-06-13', hours: 6 }] };
        assert.equal((await request('/admin/leave/paper-approved/correct', changed, admin)).status, 200);
        const before = db.getLeaveRequestById(paper.id);
        assert.equal(before.duration_hours, 6); assert.deepEqual(before.daily_hours, changed.dailyHours);
        assert.equal((await request('/admin/leave/paper-approved/correct', { ...changed, dateSelectionMode: 'legacy_range' }, admin)).status, 400);
        sql.exec("CREATE TRIGGER selected_day_audit_failure BEFORE INSERT ON audit_logs WHEN NEW.target_type='leave_request' BEGIN SELECT RAISE(FAIL,'Test audit failure'); END");
        assert.equal((await request('/admin/leave/paper-approved/correct', { ...changed, dailyHours: paperBody.dailyHours }, admin)).status, 500);
        assert.deepEqual(db.getLeaveRequestById(paper.id), before);
        sql.exec('DROP TRIGGER selected_day_audit_failure');
        assert.equal((await request('/admin/leave/paper-approved/cancel', { requestId: paper.id }, admin)).status, 200);
        assert.equal(db.getLeaveRequestById(paper.id).status, 'cancelled');
    });
    await t.test('invalid or empty selections fail without creating any request', async () => {
        const count = db.countLeaveRequests();
        for (const dailyHours of [[], [{ date: '2026-10-10', hours: 25 }], [{ date: '2026-10-08', hours: 8 }],
            [{ date: '2026-10-10', hours: 8 }, { date: '2026-10-10', hours: 4 }]]) {
            assert.equal((await request('/employee/leave/request', { ...body, dailyHours }, employee)).status, 400);
        }
        assert.equal(db.countLeaveRequests(), count);
    });
});
