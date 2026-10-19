const assert = require('node:assert/strict');
const { test } = require('node:test');
const { buildCalendar } = require('../request-calendar');
const { requestPeriod } = require('../supervisor-routes');
const { startFixture } = require('./fixtures/browser-server');

const at = (date, time = '00:00') => Date.parse(`${date}T${time}:00+08:00`);

test('selected dates drive month and day totals across year boundaries without changing legacy or midnight semantics', () => {
    const selected = { id: 'selected', employee_id: 'E001', status: 'approved', date_selection_mode: 'explicit_dates',
        start_at: at('2030-12-30', '08:00'), end_at: at('2031-01-03'), duration_hours: 16,
        daily_hours: [{ date: '2030-12-30', hours: 8 }, { date: '2031-01-02', hours: 8 }] };
    const december = buildCalendar('2030-12', [selected]), january = buildCalendar('2031-01', [selected]);
    assert.equal(december.totalCount, 1);
    assert.equal(december.days[29].approvedCount, 1);
    assert.equal(december.days[30].totalCount, 0);
    assert.equal(january.days[0].totalCount, 0);
    assert.equal(january.days[1].approvedCount, 1);
    assert.equal(january.days[2].totalCount, 0, 'exclusive ending midnight must not add another day');
    const noSelectedDaysThisMonth = { ...selected, end_at: at('2031-02-02'),
        daily_hours: [{ date: '2030-12-30', hours: 8 }, { date: '2031-02-01', hours: 8 }] };
    assert.equal(buildCalendar('2031-01', [noSelectedDaysThisMonth]).totalCount, 0);
    assert.equal(buildCalendar('2031-01', [{ ...selected, date_selection_mode: 'legacy_range' }]).days[0].approvedCount, 1);
});

test('proxy selected-date periods calculate hours on the server and reject empty or invalid selections', () => {
    const body = { startDate: '2026-10-16', startTime: '08:00', endDate: '2026-10-19', endTime: '17:00',
        dateSelectionMode: 'explicit_dates', dailyHours: [{ date: '2026-10-16', hours: 8 }, { date: '2026-10-19', hours: 4 }], durationHours: 999 };
    const period = requestPeriod(body, 'leave');
    assert.equal(period.duration_hours, 12);
    assert.equal(period.date_selection_mode, 'explicit_dates');
    for (const dailyHours of [[], null, [{ date: '2026-10-20', hours: 8 }], [{ date: '2026-10-16', hours: 8 }, { date: '2026-10-16', hours: 4 }]]) {
        assert.throws(() => requestPeriod({ ...body, dailyHours }, 'leave'));
    }
    assert.throws(() => requestPeriod({ ...body, dateSelectionMode: 'unknown' }, 'leave'));
    assert.equal(requestPeriod({ ...body, dateSelectionMode: undefined, durationHours: 7 }, 'leave').duration_hours, 7);
});

test('employee, management and delegated calendars plus meal warnings use selected days; proxy batches remain atomic and scoped', async (t) => {
    const fixture = await startFixture(), { db } = fixture;
    t.after(() => fixture.close());
    db.setSetting('browserSecuritySettings', { deviceBindingEnabled: false, gpsRequiredOnPunch: false });
    const api = async (route, token, body) => {
        const response = await fetch(fixture.url + '/api/browser' + route, { method: body ? 'POST' : 'GET',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            ...(body ? { body: JSON.stringify(body) } : {}) });
        return { status: response.status, ...await response.json() };
    };
    const login = async (employeeId, secret, role) => {
        const account = await api('/login', null, { employeeId, secret, role: 'account' });
        assert.equal(account.status, 200);
        return account.dashboard.role === 'workspace' ? api('/workspace', account.token, { role }) : account;
    };
    const supervisor = await login('A001', 'A001-test-password', 'employee');
    const employee = await login('E001', 'employee-card', 'employee');
    const admin = await login('A001', 'A001-test-password', 'admin');
    const audit = (entry) => ({ ...entry, actor_id: 'A001', role: 'admin', timestamp: at('2026-10-01') });
    for (const employeeId of ['E001', 'A002']) {
        const current = db.getSupervisors().assignmentsState().employees.find((row) => row.id === employeeId);
        db.getSupervisors().saveAssignments({ employeeId, supervisorIds: ['A001'], revision: current.revision, reason: 'Test explicit delegated scope' }, audit);
    }
    const leaveTypeId = db.loadLeaveTypes().find((row) => row.enabled).id;
    const create = (id, extra = {}) => db.createLeaveRequest({ id, employee_id: 'E001', leave_type_id: leaveTypeId,
        start_at: at('2026-10-15', '08:00'), end_at: at('2026-10-19', '17:00'), duration_hours: 24,
        daily_hours: [{ date: '2026-10-15', hours: 8 }, { date: '2026-10-16', hours: 8 }, { date: '2026-10-19', hours: 8 }],
        date_selection_mode: 'explicit_dates', status: 'approved', reason: 'Selected working dates', supervisor_id: 'A001',
        created_at: 1, updated_at: 1, ...extra });
    create('selected-workdays');
    const routes = [
        ['/employee/leave/calendar?month=2026-10&date=2026-10-17', employee.token, 'calendar'],
        ['/admin/leave/calendar?month=2026-10&date=2026-10-17&employeeId=E001', admin.token, 'calendar'],
        ['/employee/supervisor?month=2026-10&date=2026-10-17&employeeId=E001', supervisor.token, 'proxy']
    ];
    for (const [route, token, key] of routes) {
        const result = await api(route, token);
        assert.equal(result.status, 200, result.error);
        const calendar = key === 'proxy' ? result.proxy.calendar : result.calendar;
        assert.equal(calendar.totalCount, 1);
        assert.equal(calendar.days[16].totalCount, 0);
        assert.equal(calendar.detail.totalCount, 0);
        const selectedDay = await api(route.replace(/2026-10-17/g, '2026-10-19'), token);
        const detail = key === 'proxy' ? selectedDay.proxy.calendar.detail : selectedDay.calendar.detail;
        assert.equal(detail.totalCount, 1);
        assert.equal(detail.records[0].date_selection_mode, 'explicit_dates');
    }
    const now = at('2026-10-01', '08:00'), meals = db.getMeals(), manager = { manager: true, actorId: 'A001', audit };
    meals.saveSchedule({ effectiveDate: '2026-10-01', weekdays: [0, 1, 2, 3, 4, 5, 6], cutoff: '09:00', leaveStart: '08:00', leaveEnd: '17:00', reason: 'All days fixture' }, manager, now);
    meals.saveMember({ employeeId: 'E001', effectiveDate: '2026-10-01', participating: true, reason: 'Fixture member' }, manager, now);
    assert.equal(meals.dayState('2026-10-16', now).rows[0].warning, true);
    assert.equal(meals.dayState('2026-10-17', now).rows[0].warning, false);
    assert.equal(meals.dayState('2026-10-19', now).rows[0].warning, true);
    create('selected-partial-middle-day', { start_at: at('2026-11-02', '08:00'), end_at: at('2026-11-05', '17:00'),
        duration_hours: 12, daily_hours: [{ date: '2026-11-03', hours: 4 }, { date: '2026-11-04', hours: 8 }] });
    assert.equal(meals.dayState('2026-11-03', now).rows[0].warning, false, 'a selected middle day with four hours is not full-day leave');
    assert.equal(meals.dayState('2026-11-04', now).rows[0].warning, true, 'a selected middle day with eight hours can trigger the full-day reminder');
    create('legacy-partial-middle-day', { start_at: at('2026-11-09', '08:00'), end_at: at('2026-11-11', '17:00'),
        date_selection_mode: 'legacy_range', duration_hours: 4, daily_hours: [{ date: '2026-11-10', hours: 4 }] });
    assert.equal(meals.dayState('2026-11-10', now).rows[0].warning, true, 'legacy full-range reminder semantics remain unchanged');

    const proxyBody = { employeeIds: ['E001', 'A002'], leaveTypeId, startDate: '2026-10-22', startTime: '08:00', endDate: '2026-10-26', endTime: '17:00',
        dateSelectionMode: 'explicit_dates', dailyHours: [{ date: '2026-10-22', hours: 8 }, { date: '2026-10-26', hours: 8 }],
        durationHours: 999, reason: 'Two working dates', proxyReason: 'Employee requested assistance', confirmApproval: true };
    const batch = await api('/employee/supervisor/leave', supervisor.token, proxyBody);
    assert.equal(batch.status, 200, batch.error);
    assert.equal(batch.createdCount, 2);
    batch.requestIds.forEach((id) => {
        const row = db.getLeaveRequestById(id);
        assert.equal(row.duration_hours, 16);
        assert.equal(row.status, 'pending_admin');
        assert.equal(row.applicant_id, 'A001');
        assert.equal(row.date_selection_mode, 'explicit_dates');
        assert.deepEqual(db.getLeaveEntitlements().charges(id), proxyBody.dailyHours);
    });
    const excludedDate = await api('/employee/supervisor/leave', supervisor.token, { ...proxyBody, employeeIds: ['E001'],
        startDate: '2026-10-24', endDate: '2026-10-24', dailyHours: [{ date: '2026-10-24', hours: 8 }] });
    assert.equal(excludedDate.status, 200, excludedDate.error);
    const before = db.countLeaveRequests();
    assert.equal((await api('/employee/supervisor/leave', supervisor.token, proxyBody)).status, 409);
    assert.equal(db.countLeaveRequests(), before, 'conflicting batch must insert no rows');
    assert.equal((await api('/employee/supervisor/leave', supervisor.token, { ...proxyBody, employeeIds: ['E001', 'D001'] })).status, 403);
    assert.equal(db.countLeaveRequests(), before, 'unauthorized batch must insert no rows');
    assert.equal((await api('/employee/supervisor?month=2026-10&employeeId=D001', supervisor.token)).status, 403);

    const dateFor = (stamp) => new Date(stamp + 8 * 3600000).toISOString().slice(0, 10);
    const today = dateFor(Date.now()), tomorrow = dateFor(at(today) + 86400000);
    create('metric-daily-versus-request', { employee_id: 'D001', start_at: at(today, '08:00'), end_at: at(tomorrow, '17:00'),
        duration_hours: 8, daily_hours: [{ date: today, hours: 3 }, { date: tomorrow, hours: 5 }] });
    const metric = await api(`/admin/dashboard-metrics/detail?key=leaveDay:0&date=${today}&keyword=D001`, admin.token);
    assert.equal(metric.status, 200, metric.error);
    assert.equal(metric.detail.summary.dayHours, 3);
    assert.equal(metric.detail.summary.requestHours, 8);
    assert.equal(metric.detail.records[0].dayHours, 3);
});
