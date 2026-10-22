const assert = require('node:assert/strict');
const { test } = require('node:test');
const { startFixture } = require('./fixtures/browser-server');
const at = (date, time) => Date.parse(`${date}T${time}:00+08:00`);

test('one multi-segment application retains one review, exact gaps, reports, calendars and meal warnings', async (t) => {
    const f = await startFixture(), { db } = f;
    t.after(() => f.close());
    db.setSetting('browserSecuritySettings', { deviceBindingEnabled: false, gpsRequiredOnPunch: false });
    db.saveLeaveApprovalRoutes([{ department: '*', supervisor_id: 'A001', enabled: true }]);
    const api = async (route, token, body) => {
        const response = await fetch(f.url + '/api/browser' + route, { method: body ? 'POST' : 'GET',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            ...(body ? { body: JSON.stringify(body) } : {}) });
        return { status: response.status, ...await response.json() };
    };
    const login = async (employeeId, secret, role) => {
        let result = await api('/login', null, { employeeId, secret, role: 'account' });
        if (result.dashboard.role === 'workspace') result = await api('/workspace', result.token, { role });
        assert.equal(result.status, 200, result.error); return result.token;
    };
    const employee = await login('E001', 'employee-card', 'employee');
    const supervisor = await login('A001', 'A001-test-password', 'employee');
    const admin = await login('A001', 'A001-test-password', 'admin');
    const leaveTypeId = db.loadLeaveTypes().find((row) => row.enabled && !row.deducts_balance).id;
    const segment = (date, start, end, hours) => ({ startAt: at(date, start), endAt: at(date, end), hours });
    const body = { leaveTypeId, dateSelectionMode: 'explicit_segments', durationHours: 999, reason: 'Test separate periods',
        leaveSegments: [segment('2026-10-12', '09:00', '11:00', 2), segment('2026-10-12', '14:00', '16:00', 2),
            segment('2026-10-15', '08:00', '12:00', 4), segment('2026-10-15', '13:00', '17:00', 4)] };
    const result = await api('/employee/leave/request', employee, body);
    assert.equal(result.status, 200, result.error);
    const saved = db.queryLeaveRequests({ employeeId: 'E001' })[0];
    assert.equal(db.countLeaveRequests({ employeeId: 'E001' }), 1);
    assert.equal(saved.duration_hours, 12);
    assert.equal(saved.leave_segments.length, 4);
    assert.equal(new Set(saved.leave_segments.map((row) => row.id)).size, 4);
    assert.deepEqual(saved.daily_hours, [{ date: '2026-10-12', hours: 4 }, { date: '2026-10-15', hours: 8 }]);
    const gap = await api('/employee/leave/request', employee, { ...body,
        leaveSegments: [segment('2026-10-12', '11:00', '12:00', 1)] });
    assert.equal(gap.status, 200, gap.error);
    assert.equal((await api('/employee/leave/request', employee, { ...body,
        leaveSegments: [segment('2026-10-12', '10:30', '11:30', 1)] })).status, 409);
    const count = db.countLeaveRequests();
    assert.equal((await api('/employee/leave/request', employee, { ...body,
        leaveSegments: [segment('2026-10-20', '09:00', '12:00', 3), segment('2026-10-20', '11:00', '13:00', 2)] })).status, 400);
    assert.equal(db.countLeaveRequests(), count);
    assert.equal((await api('/employee/leave/supervisor-decision', supervisor, { requestId: saved.id, decision: 'approved' })).status, 200);
    assert.equal((await api('/admin/leave/final-decision', admin, { requestId: saved.id, decision: 'approved' })).status, 200);
    const dashboard = await api('/dashboard', employee);
    const visible = dashboard.dashboard.leave.myRequests.find((row) => row.id === saved.id);
    assert.deepEqual(visible.leaveSegments, db.getLeaveRequestById(saved.id).leave_segments);
    const report = await api('/admin/reports/query', admin, { employeeId: 'E001', startDate: '2026-10-12', endDate: '2026-10-15' });
    const rows = report.data.records.filter((row) => row.recordKind === 'leave');
    assert.equal(rows.length, 4);
    assert.equal(new Set(rows.map((row) => row.leaveSegmentId)).size, 4);
    assert.equal(rows.reduce((sum, row) => sum + row.leaveDurationHours, 0), 12);
    const empty = await api('/admin/reports/query', admin, { employeeId: 'E001', startDate: '2026-10-13', endDate: '2026-10-14' });
    assert.equal(empty.data.summary.leaveCount, 0);
    const calendar = await api('/employee/leave/calendar?month=2026-10&date=2026-10-15', employee);
    assert.equal(calendar.calendar.detail.totalCount, 1);
    assert.equal(calendar.calendar.days[14].approvedCount, 1, 'two segments must count as one application on the calendar');
    const now = at('2026-10-01', '08:00');
    const manager = { manager: true, actorId: 'A001', audit: (entry) => ({ ...entry, actor_id: 'A001', role: 'admin', timestamp: now }) };
    const meals = db.getMeals();
    meals.saveSchedule({ effectiveDate: '2026-10-01', weekdays: [1, 2, 3, 4, 5], cutoff: '09:00', leaveStart: '08:00', leaveEnd: '17:00', reason: 'Test schedule' }, manager, now);
    meals.saveMember({ employeeId: 'E001', effectiveDate: '2026-10-01', participating: true, reason: 'Test membership' }, manager, now);
    assert.equal(meals.dayState('2026-10-15', now).rows[0].warning, true);
    assert.equal(meals.dayState('2026-10-12', now).rows[0].warning, false);
    assert.equal(meals.dayState('2026-10-13', now).rows[0].warning, false);
    db.createLeaveRequest({ id: 'off-shift-gap', employee_id: 'E001', leave_type_id: leaveTypeId, status: 'approved', supervisor_id: 'A001',
        date_selection_mode: 'explicit_segments', leave_segments: [segment('2026-10-16', '00:00', '04:00', 4), segment('2026-10-16', '16:00', '20:00', 4)],
        reason: 'Off-shift periods do not establish full daytime leave', created_at: now, updated_at: now });
    assert.equal(meals.dayState('2026-10-16', now).rows[0].warning, false, 'off-shift hours cannot fill a large daytime gap');
    const assignment = db.getSupervisors().assignmentsState().employees.find((row) => row.id === 'E001');
    db.getSupervisors().saveAssignments({ employeeId: 'E001', supervisorIds: ['A001'], revision: assignment.revision, reason: 'Test delegated scope' }, manager.audit);
    const proxy = await api('/employee/supervisor/leave', supervisor, { ...body, employeeIds: ['E001'],
        proxyReason: 'Employee requested assistance', confirmApproval: true,
        leaveSegments: [segment('2026-11-02', '09:00', '11:00', 2), segment('2026-11-05', '14:00', '16:00', 2)] });
    assert.equal(proxy.status, 200, proxy.error);
    assert.equal(proxy.createdCount, 1);
    assert.equal(db.getLeaveRequestById(proxy.requestId).leave_segments.length, 2);
    const paper = await api('/admin/leave/paper-approved', admin, { ...body, employeeIds: ['E001'],
        leaveSegments: [segment('2026-06-02', '09:00', '11:00', 2), segment('2026-06-04', '14:00', '16:00', 2)] });
    assert.equal(paper.status, 200, paper.error);
    const original = db.queryLeaveRequests({ employeeId: 'E001' }).find((row) => row.approval_mode === 'admin_paper_approved');
    const correction = await api('/admin/leave/paper-approved/correct', admin, { ...body, requestId: original.id, employeeIds: ['E001'],
        leaveSegments: original.leave_segments.map((row, i) => i === 0 ? { ...row, hours: 1.5 } : row) });
    assert.equal(correction.status, 200, correction.error);
    assert.deepEqual(db.getLeaveRequestById(original.id).leave_segments.map((row) => row.id), original.leave_segments.map((row) => row.id));
});

test('daily attendance alerts wait for all precise segments and display the complete same-day hours once', async (t) => {
    const originalNow = Date.now;
    let current = at('2026-10-22', '11:00');
    Date.now = () => current;
    const f = await startFixture(), { db } = f;
    t.after(async () => { await f.close(); Date.now = originalNow; });
    db.setSetting('browserSecuritySettings', { deviceBindingEnabled: false, gpsRequiredOnPunch: false });
    const api = async (route, token, body) => {
        const response = await fetch(f.url + '/api/browser' + route, { method: body ? 'POST' : 'GET',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            ...(body ? { body: JSON.stringify(body) } : {}) });
        const result = await response.json(); assert.equal(response.status, 200, result.error); return result;
    };
    const adminLogin = async () => {
        const login = await api('/login', null, { employeeId: 'A001', secret: 'A001-test-password', role: 'account' });
        return (await api('/workspace', login.token, { role: 'admin' })).token;
    };
    const leaveTypeId = db.loadLeaveTypes().find((row) => row.enabled && !row.deducts_balance).id;
    db.createLeaveRequest({ id: 'same-day-later-segment', employee_id: 'E001', leave_type_id: leaveTypeId, status: 'approved', supervisor_id: 'A001',
        date_selection_mode: 'explicit_segments', leave_segments: [
            { startAt: at('2026-10-22', '09:00'), endAt: at('2026-10-22', '10:00'), hours: 1 },
            { startAt: at('2026-10-22', '14:00'), endAt: at('2026-10-22', '16:00'), hours: 2 }],
        reason: 'Daily alert should use all segments', created_at: current, updated_at: current });
    const early = await api('/dashboard', await adminLogin());
    assert.equal(early.dashboard.datasets.leave.alerts.filter((row) => row.requestId === 'same-day-later-segment' && row.alertType === 'partial_leave_missing_attendance').length, 0,
        'the afternoon segment has not ended; the default now-bounded query must not forget it');
    current = at('2026-10-22', '17:00');
    const late = await api('/dashboard', await adminLogin());
    const alerts = late.dashboard.datasets.leave.alerts.filter((row) => row.requestId === 'same-day-later-segment' && row.alertType === 'partial_leave_missing_attendance');
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].durationHours, 3);
    assert.equal(alerts[0].startAt, at('2026-10-22', '09:00'));
    assert.equal(alerts[0].endAt, at('2026-10-22', '16:00'));
});
