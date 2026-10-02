const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { test } = require('node:test');
const Database = require('better-sqlite3');
const { monthRange, buildCalendar } = require('../request-calendar');
const { startFixture } = require('./fixtures/browser-server');
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

test('calendar browser endpoints retain complete history, permission scopes, filters and unchanged stored data', async (t) => {
    const fixture = await startFixture();
    const inspection = new Database(fixture.databasePath);
    t.after(async () => { inspection.close(); await fixture.close(); });
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
        const emptyReview = await request('/employee/leave/calendar?month=2026-10&scope=review', employee.token);
        assert.equal(emptyReview.calendar.totalCount, 0);
        for (const kind of ['leave', 'overtime']) {
            const review = await request(`/employee/${kind}/calendar?month=2026-10&scope=review`, supervisor.token);
            assert.equal(review.calendar.totalCount, 20);
            assert.ok(review.calendar.detail.records.every((row) => row.supervisor_id === 'A001' && row.status === 'pending_supervisor' && row.calendarActions.review === 'supervisor'));
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
        for (const query of ['month=2026-13', 'month=2026-02&date=2026-02-30', 'month=2026-10&date=2026-11-01', 'month=2026-10&page=1.5', 'month=2026-10&scope=all', 'month=2026-10&status=unknown']) {
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

test('calendar action rendering retains paper permissions, escapes text and rejects stale asynchronous results', async () => {
    const state = { dashboard: { role: 'admin' } };
    let permitted = false;
    const context = vm.createContext({ state, Date, Map, URLSearchParams, escapeHtml: (text) => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'),
        hasCurrentAdminPermission: () => permitted, document: { addEventListener() {} }, renderDashboard() {},
        renderEmployeeLeaveRecordsPanel() {}, renderEmployeeOvertimeRecordsPanel() {}, renderEmployeeWorkspaceItems() { return []; }, getWorkspaceSubnavItemPanelHtml() {}, getAdminPaperRequest() {},
        postRenderSetup() {}, handleDashboardClick() {}, handleRealtimeSyncMessage() {}, handleLogout() {},
        workspaceSubnavConfigs: { admin: { leave: { groups: [{ items: [{ id: 'records' }] }] }, overtime: { groups: [{ items: [{ id: 'records' }] }] } } }
    });
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
