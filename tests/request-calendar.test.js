const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { test } = require('node:test');
const Database = require('better-sqlite3');
const { monthRange, buildCalendar } = require('../request-calendar');
const { startFixture, listenForFetch } = require('./fixtures/browser-server');
const at = (date) => Date.parse(`${date}+08:00`);

test('calendar dates use Taipei, validate months and include leap days', () => {
    assert.equal(monthRange('2028-02').dates.length, 29);
    assert.equal(monthRange('2026-02').dates.length, 28);
    assert.equal(monthRange('2026-10').start, Date.parse('2026-09-30T16:00:00Z'));
    for (const month of ['2026-00', '2026-13', '2026-1', '1999-12', '2101-01', ['2026-10']]) assert.throws(() => monthRange(month));
    assert.equal(buildCalendar('2026-10', [], Date.parse('2026-09-30T16:01:00Z')).today, '2026-10-01');
});

test('multi-day and cross-month display preserves one record and excludes ending midnight', () => {
    const records = [
        { id: 'cross', employee_id: 'E1', start_at: at('2026-09-30T22:00:00'), end_at: at('2026-10-02T00:00:00'), duration_hours: 8, status: 'approved' },
        { id: 'same', employee_id: 'E1', start_at: at('2026-10-01T10:00:00'), end_at: at('2026-10-01T11:00:00'), duration_hours: 1, status: 'approved' },
        { id: 'pending', employee_id: 'E2', start_at: at('2026-10-01T23:00:00'), end_at: at('2026-10-02T01:00:00'), duration_hours: 2, status: 'pending_supervisor' },
        { id: 'next', employee_id: 'E3', start_at: at('2026-11-01T00:00:00'), end_at: at('2026-11-01T01:00:00'), status: 'approved' },
        { id: 'cancelled', employee_id: 'E4', start_at: at('2026-10-01T08:00:00'), end_at: at('2026-10-01T09:00:00'), status: 'cancelled' }
    ];
    const before = JSON.stringify(records);
    const result = buildCalendar('2026-10', records);
    assert.equal(result.totalCount, 4);
    assert.deepEqual(result.days[0], { date: '2026-10-01', totalCount: 4, approvedCount: 2, approvedPeople: 1, pendingCount: 1, otherCount: 1 });
    assert.deepEqual(result.days[1], { date: '2026-10-02', totalCount: 1, approvedCount: 0, approvedPeople: 0, pendingCount: 1, otherCount: 0 });
    assert.equal(JSON.stringify(records), before);
});

test('calendar totals count each request once while precise gaps and multiple segments stay distinct', () => {
    const row = { id: 'precise', employee_id: 'E1', status: 'approved', date_selection_mode: 'explicit_segments', leave_segments: [
        { startAt: at('2026-10-01T09:00:00'), endAt: at('2026-10-01T11:00:00'), hours: 2 },
        { startAt: at('2026-10-01T14:00:00'), endAt: at('2026-10-01T16:00:00'), hours: 1.5 },
        { startAt: at('2026-10-05T09:00:00'), endAt: at('2026-10-05T10:00:00'), hours: 1 }
    ] };
    const result = buildCalendar('2026-10', [row, row]);
    assert.equal(result.totalCount, 1);
    assert.equal(result.days[0].totalCount, 1);
    assert.equal(result.days[4].totalCount, 1);
    assert.ok(result.days.slice(1, 4).every((day) => day.totalCount === 0));
});

test('calendar browser endpoints retain complete history, permission scopes, filters and unchanged stored data', async (t) => {
    const fixture = await startFixture();
    const inspection = new Database(fixture.databasePath);
    t.after(async () => { inspection.close(); await fixture.close(); });
    // Seed the large history before opening the HTTP test phase. Synchronous
    // SQLite writes must not leave the startup health connection idle while
    // its keep-alive timers and client socket events cannot be processed.
    fixture.server.closeAllConnections();
    await new Promise((resolve) => fixture.server.close(resolve));
    const db = fixture.db;
    for (const kind of ['leave', 'overtime']) {
        const create = (row) => (kind === 'leave' ? db.createLeaveRequest : db.createOvertimeRequest)({ reason: '', supervisor_id: null, applicant_role: 'employee', updated_at: row.created_at, ...row });
        for (let i = 0; i < 620; i += 1) create({
            id: `${kind}-${String(i).padStart(4, '0')}`, employee_id: i === 619 ? 'A001' : 'E001', leave_type_id: 'annual',
            applicant_id: i === 619 ? 'E001' : 'A001', applicant_role: 'employee', supervisor_id: 'A001',
            start_at: at('2026-10-01T08:00:00'), end_at: at('2026-10-01T17:00:00'), duration_hours: 7.5,
            status: i < 600 ? 'approved' : 'pending_supervisor', reason: `reason ${i}`,
            approval_mode: 'online', created_at: i + 1, updated_at: i + 1
        });
        create({ id: `${kind}-cross`, employee_id: 'E001', leave_type_id: 'annual', applicant_id: 'E001', supervisor_id: 'A001',
            start_at: at('2026-09-30T22:00:00'), end_at: at('2026-10-02T00:00:00'), duration_hours: 8, status: 'approved', created_at: 0 });
        create({ id: `${kind}-next`, employee_id: 'E001', leave_type_id: 'annual', applicant_id: 'E001',
            start_at: at('2026-11-01T00:00:00'), end_at: at('2026-11-01T01:00:00'), duration_hours: 1, status: 'approved', created_at: 0 });
    }
    fixture.url = await listenForFetch(fixture.server);
    async function request(route, token, body) {
        const response = await fetch(fixture.url + '/api/browser' + route, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
        return { status: response.status, ...await response.json() };
    }
    const account = await request('/login', null, { employeeId: 'A001', secret: 'A001-test-password', role: 'account' });
    assert.equal((await request('/admin/leave/calendar?month=2026-10', account.token)).status, 403);
    const manager = await request('/workspace', account.token, { role: 'admin' });
    const employee = await request('/login', null, { employeeId: 'E001', secret: 'employee-card', role: 'account', deviceInfo: { deviceId: 'calendar-device' } });
    const delegatedAccount = await request('/login', null, { employeeId: 'A002', secret: 'A002-test-password', role: 'account' });
    const delegated = await request('/workspace', delegatedAccount.token, { role: 'admin' });
    const supervisor = await request('/login', null, { employeeId: 'A001', secret: 'manager-card', role: 'account', deviceInfo: { deviceId: 'supervisor-calendar' } });
    const snapshot = () => crypto.createHash('sha256').update(JSON.stringify(['leave_requests', 'overtime_requests', 'leave_approval_steps', 'overtime_approval_steps', 'audit_logs'].map((table) => inspection.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()))).digest('hex');
    const before = snapshot();
    await t.test('summary includes over 500 records; detail pagination covers each id exactly once', async () => {
        for (const kind of ['leave', 'overtime']) {
            const route = `/admin/${kind}/calendar?month=2026-10&date=2026-10-01`;
            const result = await request(route, manager.token);
            assert.equal(result.status, 200);
            assert.equal(result.calendar.totalCount, 621);
            assert.equal(result.calendar.days[0].totalCount, 621);
            assert.equal(result.calendar.days[0].approvedPeople, 1);
            assert.equal(result.calendar.detail.totalPages, 13);
            assert.equal(result.calendar.events.length, 621, 'month events are not limited by detail pagination');
            assert.equal(new Set(result.calendar.events.map((row) => row.id)).size, 621);
            assert.ok(result.calendar.events.every((row) => !('reason' in row) && !('proxyReason' in row) && !('reviewPolicy' in row)));
            assert.ok(!JSON.stringify(result.calendar.events).includes('reason '));
            const cross = result.calendar.events.find((row) => row.id === `${kind}-cross`);
            assert.deepEqual(cross.segments.map((segment) => segment.date), ['2026-10-01']);
            assert.equal(cross.segmentHoursSource, 'legacy_allocation');
            assert.equal(cross.hours, 8);
            assert.equal(result.calendar.request, null);
            const selected = await request(route + `&requestId=${kind}-0000`, manager.token);
            assert.equal(selected.calendar.request.id, `${kind}-0000`, 'detail resolves a record beyond the first 50 rows');
            assert.equal(selected.calendar.request.reason, 'reason 0');
            const ids = new Set();
            for (let page = 1; page <= 13; page += 1) {
                const pageData = (await request(route + `&page=${page}`, manager.token)).calendar.detail;
                assert.ok(pageData.records.length <= 50);
                pageData.records.forEach((row) => { assert.ok(!ids.has(row.id)); ids.add(row.id); });
            }
            assert.equal(ids.size, 621);
            assert.ok(ids.has(`${kind}-cross`));
            const nextDay = await request(`/admin/${kind}/calendar?month=2026-10&date=2026-10-02`, manager.token);
            assert.equal(nextDay.calendar.detail.totalCount, 0);
            assert.equal(result.calendar.days[0].pendingCount, 20);
        }
    });
    await t.test('employee scopes ignore attempts to claim another employee, retain overtime proxy and isolate review queue', async () => {
        const own = await request('/employee/leave/calendar?month=2026-10', employee.token);
        assert.equal(own.calendar.totalCount, 620);
        assert.ok(own.calendar.detail.records.every((row) => row.employee_id === 'E001'));
        assert.deepEqual(own.calendar.employees.map((row) => row.id), ['E001']);
        const attack = await request('/employee/leave/calendar?month=2026-10&employeeId=A001', employee.token);
        assert.equal(attack.calendar.totalCount, 0);
        assert.ok(!JSON.stringify(attack.calendar).includes('Test Manager'));
        const proxy = await request('/employee/overtime/calendar?month=2026-10', employee.token);
        assert.equal(proxy.calendar.totalCount, 621);
        assert.ok(proxy.calendar.detail.records.every((row) => row.employee_id === 'E001' || row.applicant_id === 'E001'));
        const ownOvertime = await request('/employee/overtime/calendar?month=2026-10&relation=self', employee.token);
        assert.equal(ownOvertime.calendar.totalCount, 620);
        assert.ok(ownOvertime.calendar.events.every((row) => row.employeeId === 'E001'));
        const proxyOvertime = await request('/employee/overtime/calendar?month=2026-10&relation=proxy', employee.token);
        assert.equal(proxyOvertime.calendar.totalCount, 1);
        assert.deepEqual(proxyOvertime.calendar.events.map((row) => row.id), ['overtime-0619']);
        assert.equal(proxyOvertime.calendar.detail.records[0].applicant_id, 'E001');
        assert.equal((await request('/employee/leave/calendar?month=2026-10&requestId=leave-0619', employee.token)).status, 404);
        assert.equal((await request('/employee/overtime/calendar?month=2026-10&requestId=overtime-0619', employee.token)).calendar.request.employee_id, 'A001');
        assert.equal((await request('/employee/overtime/calendar?month=2026-10&relation=self&requestId=overtime-0619', employee.token)).status, 404);
        assert.equal((await request('/employee/leave/calendar?month=2026-10&requestId=leave-next', employee.token)).status, 404);
        assert.equal((await request('/employee/leave/calendar?month=2026-10&requestId=missing', employee.token)).status, 404);
        const emptyReview = await request('/employee/leave/calendar?month=2026-10&scope=review', employee.token);
        assert.equal(emptyReview.calendar.totalCount, 0);
        for (const kind of ['leave', 'overtime']) {
            const review = await request(`/employee/${kind}/calendar?month=2026-10&scope=review`, supervisor.token);
            assert.equal(review.calendar.totalCount, 19);
            assert.ok(review.calendar.detail.records.every((row) => row.employee_id !== 'A001' && row.supervisor_id === 'A001' && row.status === 'pending_supervisor' && row.calendarActions.review === 'supervisor'));
            assert.equal(review.calendar.events.length, 19);
            assert.ok(review.calendar.events.every((row) => row.status === 'pending_supervisor' && row.calendarActions.review === 'supervisor'));
            assert.equal((await request(`/employee/${kind}/calendar?month=2026-10&scope=review&requestId=${kind}-0000`, supervisor.token)).status, 404);
            assert.equal((await request(`/employee/${kind}/calendar?month=2026-10&scope=review&requestId=${kind}-0600`, supervisor.token)).calendar.request.calendarActions.review, 'supervisor');
        }
    });
    await t.test('role and fine-grained permissions are enforced on every read', async () => {
        for (const kind of ['leave', 'overtime']) {
            const route = `/admin/${kind}/calendar?month=2026-10`;
            assert.equal((await request(route)).status, 401);
            assert.equal((await request(route, account.token)).status, 401);
            assert.equal((await request(route, employee.token)).status, 403);
            assert.equal((await request(route, delegated.token)).status, 403);
            const access = db.getAccountAccessRecord('A002');
            db.saveAccountAccessRecord({ ...access, admin_permissions: [`admin.${kind}.paperCreate`] });
            assert.equal((await request(route, delegated.token)).status, 403);
            db.saveAccountAccessRecord({ ...access, admin_permissions: [kind === 'leave' ? 'admin.leave.review' : 'admin.overtime.view'] });
            assert.equal((await request(route, delegated.token)).status, 200);
            db.saveAccountAccessRecord(access);
        }
    });
    await t.test('filters, invalid dates and deleted employees are handled without mutations', async () => {
        const pending = await request('/admin/leave/calendar?month=2026-10&status=pending_supervisor&department=Test&leaveTypeId=annual', manager.token);
        assert.equal(pending.calendar.totalCount, 20);
        assert.equal((await request('/admin/leave/calendar?month=2026-10&employeeId=A001', manager.token)).calendar.totalCount, 1);
        for (const query of ['month=2026-13', 'month=2026-02&date=2026-02-30', 'month=2026-10&date=2026-11-01', 'month=2026-10&page=1.5', 'month=2026-10&scope=all', 'month=2026-10&status=unknown', 'month=2026-10&relation=self', 'month=2026-10&requestId=', 'month=2026-10&requestId=a&requestId=b']) {
            assert.equal((await request('/admin/leave/calendar?' + query, manager.token)).status, 400);
        }
        const employees = db.loadEmployees();
        db.saveEmployees(employees.filter((row) => row.id !== 'E001'));
        const deleted = await request('/admin/leave/calendar?month=2026-10', manager.token);
        assert.equal(deleted.calendar.totalCount, 621);
        assert.ok(deleted.calendar.employees.some((row) => row.id === 'E001'));
        db.saveEmployees(employees);
    });
    assert.equal(snapshot(), before, 'calendar reads must not change requests, approval steps, audit, IDs, hours or statuses');
});

test('month events retain exact leave segments and overnight overtime; full details cannot bypass history or ownership', async (t) => {
    const fixture = await startFixture(), db = fixture.db;
    t.after(() => fixture.close());
    db.setSetting('browserSecuritySettings', { deviceBindingEnabled: false, gpsRequiredOnPunch: false });
    const segments = [
        { startAt: at('2026-09-30T23:00:00'), endAt: at('2026-10-01T00:00:00'), hours: 1 },
        { startAt: at('2026-10-01T09:00:00'), endAt: at('2026-10-01T12:00:00'), hours: 2.5 },
        { startAt: at('2026-10-01T14:00:00'), endAt: at('2026-10-01T16:00:00'), hours: 2 },
        { startAt: at('2026-10-05T09:00:00'), endAt: at('2026-10-05T10:00:00'), hours: 1 },
        { startAt: at('2026-11-02T09:00:00'), endAt: at('2026-11-02T10:00:00'), hours: 1 }
    ];
    db.createLeaveRequest({ id: 'precise', employee_id: 'E001', applicant_id: 'E001', applicant_role: 'employee', supervisor_id: 'A001',
        leave_type_id: 'annual', status: 'pending_admin', reason: 'PRIVATE reason', proxy_reason: 'PRIVATE proxy', supervisor_comment: 'PRIVATE decision',
        date_selection_mode: 'explicit_segments', leave_segments: segments, created_at: 1, updated_at: 1 });
    const overtime = (id, employee, applicant, start, end, hours) => db.createOvertimeRequest({ id, employee_id: employee, applicant_id: applicant,
        applicant_role: 'employee', supervisor_id: 'A001', status: 'pending_supervisor', reason: 'PRIVATE overtime', start_at: at(start), end_at: at(end), duration_hours: hours, created_at: 1, updated_at: 1 });
    overtime('overnight', 'E001', 'E001', '2026-10-31T22:00:00', '2026-11-01T02:00:00', 3);
    overtime('foreign', 'A002', 'A002', '2026-10-31T22:00:00', '2026-11-01T02:00:00', 4);
    for (const kind of ['leave', 'overtime']) {
        const create = kind === 'leave' ? db.createLeaveRequest : db.createOvertimeRequest;
        create({ id: `${kind}-old`, employee_id: 'E001', applicant_id: 'E001', applicant_role: 'employee', leave_type_id: 'annual', supervisor_id: 'A001',
            status: 'pending_supervisor', reason: 'PRIVATE old request', start_at: at('2000-01-01T09:00:00'), end_at: at('2000-01-01T10:00:00'), duration_hours: 1, created_at: 1, updated_at: 1 });
    }
    async function request(route, token, body) {
        const response = await fetch(fixture.url + '/api/browser' + route, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
        return { status: response.status, ...await response.json() };
    }
    const employee = await request('/login', null, { employeeId: 'E001', secret: 'employee-card', role: 'account' });
    const supervisor = await request('/login', null, { employeeId: 'A001', secret: 'manager-card', role: 'account' });
    const result = await request('/employee/leave/calendar?month=2026-10&requestId=precise', employee.token);
    assert.equal(result.status, 200);
    assert.equal(result.calendar.totalCount, 1);
    assert.equal(result.calendar.days[0].totalCount, 1);
    assert.equal(result.calendar.days[4].totalCount, 1);
    assert.ok(result.calendar.days.slice(1, 4).every((day) => day.totalCount === 0));
    assert.equal(result.calendar.events.length, 1);
    const event = result.calendar.events[0];
    assert.deepEqual(event.segments.map(({ date, hours }) => ({ date, hours })), [
        { date: '2026-10-01', hours: 2.5 }, { date: '2026-10-01', hours: 2 }, { date: '2026-10-05', hours: 1 }
    ]);
    assert.equal(event.hours, 7.5);
    assert.equal(event.segmentHoursSource, 'recorded');
    assert.equal(event.dateSelectionMode, 'explicit_segments');
    assert.equal(event.statusText, '管理部複核中');
    assert.equal(event.calendarActions.withdraw, true);
    assert.ok(!JSON.stringify(event).includes('PRIVATE'));
    assert.equal(result.calendar.request.leaveSegments.length, 5, 'selected detail is the whole request including other months');
    assert.equal(result.calendar.request.reason, 'PRIVATE reason');
    assert.equal(result.calendar.request.duration_hours, 7.5);
    const emptyDay = await request('/employee/leave/calendar?month=2026-10&date=2026-10-03', employee.token);
    assert.equal(emptyDay.calendar.detail.totalCount, 0);
    assert.equal(emptyDay.calendar.events.length, 1, 'date detail filtering must not discard the rest of the month');
    const october = await request('/employee/overtime/calendar?month=2026-10&requestId=overnight', employee.token);
    const november = await request('/employee/overtime/calendar?month=2026-11&requestId=overnight', employee.token);
    for (const data of [october, november]) {
        assert.equal(data.calendar.totalCount, 1);
        assert.equal(data.calendar.events[0].hours, 3);
        assert.equal(data.calendar.events[0].segments.length, 1);
        assert.equal(data.calendar.events[0].segments[0].hours, 1.5);
        assert.equal(data.calendar.events[0].segmentHoursSource, 'legacy_allocation');
        assert.equal(data.calendar.request.end_at, at('2026-11-01T02:00:00'));
    }
    assert.equal(october.calendar.events[0].segments[0].date, '2026-10-31');
    assert.equal(november.calendar.events[0].segments[0].date, '2026-11-01');
    const forbidden = await request('/employee/overtime/calendar?month=2026-10&requestId=foreign', employee.token);
    assert.equal(forbidden.status, 404);
    assert.ok(!JSON.stringify(forbidden).includes('PRIVATE'));
    assert.equal((await request('/employee/overtime/calendar?month=2026-10&relation=unknown', employee.token)).status, 400);
    assert.equal((await request('/employee/leave/calendar?month=2026-10&relation=self', employee.token)).status, 400);
    db.getRequestHistory().save({ settings: { leave: 0, overtime: 0 }, revision: db.getRequestHistory().state().revision,
        reason: 'Test current month only', confirmHistory: true }, (entry) => ({ ...entry, actor_id: 'A001' }));
    for (const kind of ['leave', 'overtime']) {
        const blocked = await request(`/employee/${kind}/calendar?month=2000-01&requestId=${kind}-old`, employee.token);
        assert.equal(blocked.status, 403);
        assert.ok(!JSON.stringify(blocked).includes('PRIVATE'));
        const current = monthRange().month;
        assert.equal((await request(`/employee/${kind}/calendar?month=${current}&requestId=${kind}-old`, employee.token)).status, 404);
        const review = await request(`/employee/${kind}/calendar?month=2000-01&scope=review&requestId=${kind}-old`, supervisor.token);
        assert.equal(review.status, 200, 'existing review scope remains outside the personal history restriction');
        assert.equal(review.calendar.request.id, `${kind}-old`);
        const fakeReview = await request(`/employee/${kind}/calendar?month=2000-01&scope=review&requestId=${kind}-old`, employee.token);
        assert.equal(fakeReview.status, 404);
    }
});

test('calendar action rendering retains paper permissions, escapes text and rejects stale asynchronous results', async () => {
    const state = { dashboard: { role: 'admin' } };
    let permitted = false;
    const context = vm.createContext({ state, Date, Map, URLSearchParams, escapeHtml: (text) => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'),
        hasCurrentAdminPermission: () => permitted, document: { addEventListener() {} }, renderDashboard() {},
        renderEmployeeLeaveRecordsPanel() {}, renderEmployeeOvertimeRecordsPanel() {}, renderEmployeeWorkspaceItems() { return []; }, getWorkspaceSubnavItemPanelHtml() {}, getAdminPaperRequest() {},
        postRenderSetup() {}, handleDashboardClick() {}, handleRealtimeSyncMessage() {}, handleLogout() {},
        workspaceSubnavConfigs: { admin: { leave: { groups: [{ items: [{ id: 'records' }] }] }, overtime: { groups: [{ items: [{ id: 'records' }] }] } } }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../browser-client/leave-days.js'), 'utf8'), context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../browser-client/request-calendar.js'), 'utf8'), context);
    const row = { id: 'paper', approval_mode: 'admin_paper_approved', status: 'approved', reason: '<script>bad</script>', calendarActions: {} };
    context.row = row;
    assert.equal(vm.runInContext("rcActions('leave', row)", context), '');
    permitted = true;
    assert.match(vm.runInContext("rcActions('leave', row)", context), /paper-leave-correct/);
    assert.match(vm.runInContext("rcActions('overtime', row)", context), /paper-overtime-cancel/);
    row.status = 'cancelled';
    assert.equal(vm.runInContext("rcActions('leave', row)", context), '');
    const html = vm.runInContext("rcEntries('leave', { records: [row] })", context);
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
    Object.assign(row, { date_selection_mode: 'explicit_dates', start_at: at('2026-10-16T08:00:00'), end_at: at('2026-10-19T17:00:00'),
        dailyHours: [{ date: '2026-10-16', hours: 8 }, { date: '2026-10-19', hours: 4 }] });
    const selectedHtml = vm.runInContext("rcEntries('leave', { records: [row] })", context);
    assert.match(selectedHtml, /實際請假 2 日/);
    assert.match(selectedHtml, /排除 2 日/);
    assert.match(selectedHtml, /不請假：2026-10-17、2026-10-18/);
    state.dashboard.role = 'employee'; row.calendarActions = { withdraw: true };
    assert.match(vm.runInContext("rcActions('leave', row)", context), /leave-withdraw/);
    context.document.getElementById = () => null;
    const pending = [];
    context.requestJson = () => new Promise((resolve) => pending.push(resolve));
    state.token = 'initial-token';
    const first = vm.runInContext("rcState('leave').month = '2026-09'; rcLoad('leave')", context);
    const second = vm.runInContext("rcState('leave').month = '2026-10'; rcLoad('leave')", context);
    pending[0]({ calendar: { month: '2026-09', detail: { page: 1, records: [] } } });
    await first;
    assert.equal(vm.runInContext("rcState('leave').data", context), null);
    pending[1]({ calendar: { month: '2026-10', detail: { page: 1, records: [] } } });
    await second;
    assert.equal(vm.runInContext("rcState('leave').data.month", context), '2026-10');
    const late = vm.runInContext("rcLoad('leave')", context);
    state.token = 'other-employee-token';
    vm.runInContext("renderDashboard({ role: 'employee', user: { id: 'E002' } })", context);
    pending[2]({ calendar: { month: '2026-10', detail: { page: 1, records: [{ id: 'private-old-record' }] } } });
    await late;
    assert.equal(vm.runInContext("rcState('leave').data", context), null);
    assert.equal(vm.runInContext("rcState('leave').cache.size", context), 0);
});
