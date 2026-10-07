const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const Database = require('better-sqlite3');
const { test } = require('node:test');
const { startFixture } = require('./fixtures/browser-server');
const dbModule = require('../database');
const { requirePersonalSupervisor, createSupervisorStore } = require('../supervisor-management');
const { requestPeriod } = require('../supervisor-routes');
const { taipeiDate } = require('../meal-management');

test('supervisor helpers validate personal identity and Taipei periods', () => {
    const session = { role: 'employee', employeeId: 'S1', authMethod: 'web_password' };
    assert.doesNotThrow(() => requirePersonalSupervisor(session));
    for (const change of [{ authMethod: 'card' }, { role: 'admin' }, { realEmployeeId: 'OTHER' }, { impersonation: { active: true } }]) {
        assert.throws(() => requirePersonalSupervisor({ ...session, ...change }), /本人/);
    }
    const body = { startDate: '2026-10-05', startTime: '08:00', endDate: '2026-10-05', endTime: '17:00', durationHours: 8 };
    assert.equal(requestPeriod(body, 'leave').start_at, Date.parse('2026-10-05T08:00:00+08:00'));
    for (const change of [{ startDate: '2026-02-30' }, { startTime: '24:00' }, { durationHours: -1 }, { durationHours: 0.001 }, { durationHours: 'NaN' }, { endTime: '07:00' }]) {
        assert.throws(() => requestPeriod({ ...body, ...change }, 'leave'));
    }
});

test('explicit supervisor APIs enforce multiple supervisors, scope, final review, deadline and audit', async (t) => {
    const fixture = await startFixture();
    const { db, url, databasePath } = fixture;
    const inspection = new Database(databasePath);
    t.after(async () => { inspection.close(); await fixture.close(); });
    db.setSetting('browserSecuritySettings', { deviceBindingEnabled: false, gpsRequiredOnPunch: false });
    const employees = db.loadEmployees();
    employees.find((e) => e.id === 'A002').department = 'Another department';
    db.saveEmployees(employees);
    db.saveLeaveApprovalRoutes([{ department: 'Test', supervisor_id: 'A001', enabled: true }, { department: 'Another department', supervisor_id: 'D001', enabled: true }]);
    async function request(route, body, token) {
        const response = await fetch(url + '/api/browser' + route, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
        return { status: response.status, ...await response.json() };
    }
    async function login(id, secret, role = 'employee') {
        const result = await request('/login', { employeeId: id, secret, role: 'account' });
        assert.equal(result.status, 200);
        return result.dashboard.role === 'workspace' ? request('/workspace', { role }, result.token) : result;
    }
    const system = await request('/login', { employeeId: 'system-admin', secret: 'system-admin-test', role: 'system_admin' });
    const supervisor = await login('A001', 'A001-test-password');
    const second = await login('A002', 'A002-test-password');
    const admin = await login('A001', 'A001-test-password', 'admin');
    const restrictedAdmin = await login('A002', 'A002-test-password', 'admin');
    const card = await login('A001', 'manager-card');
    const employee = await login('E001', 'employee-card');
    const month = '2026-10';
    const getProxy = (token, id = 'E001', extra = '') => request(`/employee/supervisor?month=${month}&employeeId=${id}${extra}`, null, token);
    const getAssignments = () => request('/supervisors/assignments', null, system.token);
    async function assign(ids, token = system.token, reason = 'Explicit cross-team assignment') {
        const current = (await getAssignments()).assignments.employees.find((e) => e.id === 'E001');
        return request('/supervisors/assignments', { employeeId: 'E001', supervisorIds: ids, revision: current.revision, reason }, token);
    }
    const leaveTypeId = db.loadLeaveTypes().find((type) => type.enabled).id;
    const leaveBody = { employeeId: 'E001', leaveTypeId, startDate: '2026-10-12', startTime: '09:00', endDate: '2026-10-12', endTime: '18:00', durationHours: 8, reason: 'Employee requested assistance', proxyReason: 'Employee cannot use portal', confirmApproval: true };
    let leaveId;

    await t.test('assignment is empty on upgrade; department supervisor is not automatically delegated', async () => {
        assert.equal(db.getSupervisors().assignedEmployees('A001').length, 0);
        assert.equal((await getProxy(supervisor.token)).status, 403);
        assert.equal((await request('/supervisors/assignments', null, restrictedAdmin.token)).status, 403);
        assert.equal((await request('/supervisors/assignments', null, employee.token)).status, 403);
    });
    await t.test('one employee supports multiple cross-department supervisors with optimistic writes and audit', async () => {
        const previous = (await getAssignments()).assignments.employees.find((e) => e.id === 'E001');
        assert.equal((await assign(['A001', 'A002'])).status, 200);
        assert.equal((await request('/supervisors/assignments', { employeeId: 'E001', supervisorIds: [], revision: previous.revision, reason: 'stale' }, system.token)).status, 409);
        assert.equal((await assign(['E001'])).status, 400);
        assert.equal((await assign(['MISSING'])).status, 400);
        assert.equal((await assign(['A001'], system.token, '')).status, 400);
        for (const token of [supervisor.token, second.token]) {
            const result = await getProxy(token);
            assert.equal(result.status, 200);
            assert.deepEqual(result.proxy.employees.map((e) => e.id), ['E001']);
            assert.equal(JSON.stringify(result.proxy).includes('employee-card'), false);
        }
        assert.equal((await getProxy(second.token, 'D001')).status, 403);
        assert.equal((await getProxy(card.token)).status, 403);
        assert.equal((await getProxy(employee.token)).status, 403);
        assert.equal((await assign(['A001', 'A002'], admin.token)).status, 200);
    });
    await t.test('proxy leave records real actor and supervisor approval but still requires management final review', async () => {
        assert.equal((await request('/employee/supervisor/leave', { ...leaveBody, confirmApproval: false }, second.token)).status, 400);
        assert.equal((await request('/employee/supervisor/leave', { ...leaveBody, proxyReason: '' }, second.token)).status, 400);
        assert.equal((await request('/employee/supervisor/leave', { ...leaveBody, employeeId: 'D001' }, second.token)).status, 403);
        const result = await request('/employee/supervisor/leave', leaveBody, second.token);
        assert.equal(result.status, 200);
        leaveId = result.requestId;
        const row = db.getLeaveRequestById(leaveId);
        assert.equal(row.status, 'pending_admin');
        assert.equal(row.applicant_id, 'A002');
        assert.equal(row.applicant_role, 'supervisor_proxy');
        assert.equal(row.proxy_reason, leaveBody.proxyReason);
        const steps = inspection.prepare('SELECT * FROM leave_approval_steps WHERE request_id = ? ORDER BY step_order').all(leaveId);
        assert.deepEqual(steps.map((s) => s.status), ['approved', 'pending']);
        assert.equal(steps[0].reviewer_id, 'A002');
        assert.equal((await request('/employee/supervisor/leave', leaveBody, supervisor.token)).status, 409);
        const audit = db.queryAuditLogs({ limit: 200 }).find((log) => log.target_id === leaveId && log.action === 'supervisor_proxy_create');
        assert.equal(audit.actor_id, 'A002');
        assert.equal(audit.after_data.employee_id, 'E001');
        assert.equal((await request('/employee/leave/calendar?month=2026-10', null, employee.token)).calendar.totalCount, 1);
    });
    await t.test('withdraw updates the same row, rejects stale and approved records, and requires active delegation', async () => {
        const row = db.getLeaveRequestById(leaveId);
        const body = { requestId: leaveId, updatedAt: row.updated_at, reason: 'Employee requested withdrawal' };
        assert.equal((await request('/employee/supervisor/leave/withdraw', { ...body, updatedAt: 0 }, second.token)).status, 409);
        assert.equal((await request('/employee/supervisor/leave/withdraw', body, supervisor.token)).status, 200);
        assert.equal(db.getLeaveRequestById(leaveId).status, 'withdrawn');
        const log = db.queryAuditLogs({ limit: 200 }).find((r) => r.action === 'supervisor_proxy_withdraw');
        assert.equal(log.after_data.proxy_reason, row.proxy_reason);
        assert.equal(log.after_data.withdrawal_reason, body.reason);
        assert.equal(db.countLeaveRequests({ employeeId: 'E001' }), 1);
        db.createLeaveRequest({ ...row, id: 'approved-original', status: 'approved' });
        assert.equal((await request('/employee/supervisor/leave/withdraw', { ...body, requestId: 'approved-original' }, second.token)).status, 409);
    });
    await t.test('employees retain self overtime requests; explicitly assigned supervisor can proxy without department route', async () => {
        const own = await request('/employee/overtime/request', { startDate: '2026-10-13', startTime: '18:00', endDate: '2026-10-13', endTime: '20:00', reason: 'Self request' }, employee.token);
        assert.equal(own.status, 200);
        assert.equal(db.queryOvertimeRequests({ employeeId: 'E001' })[0].status, 'pending_supervisor');
        const proxy = await request('/employee/supervisor/overtime', { ...leaveBody, startDate: '2026-10-14', endDate: '2026-10-14', startTime: '18:00', endTime: '20:00', durationHours: 2 }, second.token);
        assert.equal(proxy.status, 200);
        assert.equal(db.getOvertimeRequestById(proxy.requestId).status, 'approved');
        assert.equal(db.getOvertimeRequestById(proxy.requestId).supervisor_id, 'A002');
        assert.equal(db.getOvertimeRequestById(proxy.requestId).proxy_reason, leaveBody.proxyReason);
    });
    await t.test('meal proxy stays deadline-bound, scoped and same-row; no organization counts or supplier lists leak', async () => {
        const tomorrow = taipeiDate(Date.now() + 86400000), store = db.getMeals();
        const manager = { manager: true, actorId: 'A001', audit: (entry) => ({ ...entry, actor_id: 'A001' }) };
        store.saveDay({ date: tomorrow, serving: true, cutoff: '23:59', reason: 'test day' }, manager);
        store.saveMember({ employeeId: 'E001', effectiveDate: tomorrow, participating: true, reason: 'test join' }, manager);
        const body = { employeeId: 'E001', date: tomorrow, eating: false, reason: 'Employee cannot use calendar', version: store.dayState(tomorrow).version };
        assert.equal((await request('/employee/supervisor/meals/choice', { ...body, reason: '' }, second.token)).status, 400);
        assert.equal((await request('/employee/supervisor/meals/choice', { ...body, employeeId: 'D001' }, second.token)).status, 403);
        assert.equal((await request('/employee/supervisor/meals/choice', body, second.token)).status, 200);
        const after = store.dayState(tomorrow);
        assert.equal(after.rows[0].eating, false);
        assert.equal((await request('/employee/supervisor/meals/choice', { ...body, eating: true }, second.token)).status, 409);
        const calendar = (await request(`/employee/supervisor?month=${tomorrow.slice(0, 7)}&employeeId=E001`, null, second.token)).proxy.meals;
        assert.equal(calendar.employees, undefined);
        assert.equal(calendar.days[0].currentCount, undefined);
        assert.equal(calendar.days[0].orders, undefined);
        assert.equal((await request('/employee/supervisor/meals/choice', { ...body, eating: true, version: after.version }, second.token)).status, 200);
        assert.equal(inspection.prepare('SELECT COUNT(*) n FROM meal_choices WHERE employee_id = ? AND date = ?').get('E001', tomorrow).n, 1);
        const day = store.dayState(tomorrow);
        store.closeOrder({ date: tomorrow, version: day.version, reason: 'supplier informed' }, manager);
        assert.equal((await request('/employee/supervisor/meals/choice', { ...body, version: store.dayState(tomorrow).version, manager: true }, second.token)).status, 403);
        assert.equal(store.dayState(tomorrow).submittedCount, 1);
        const log = db.queryAuditLogs({ limit: 200 }).find((r) => r.action === 'meal_choice' && r.actor_id === 'A002');
        assert.equal(log.after_data.reason, body.reason);
    });
    await t.test('audit failure rolls back proxy request, withdrawal and assignment changes', async () => {
        inspection.exec("CREATE TRIGGER fail_proxy_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(FAIL, 'test audit failure'); END");
        try {
            const count = db.countLeaveRequests({ employeeId: 'E001' });
            assert.equal((await request('/employee/supervisor/leave', { ...leaveBody, startDate: '2026-10-15', endDate: '2026-10-15' }, second.token)).status, 500);
            assert.equal(db.countLeaveRequests({ employeeId: 'E001' }), count);
            assert.equal((await assign([])).status, 500);
            assert.equal(db.getSupervisors().assignedEmployees('A002').length, 1);
            const pending = db.queryOvertimeRequests({ employeeId: 'E001' }).find((r) => r.status === 'pending_supervisor');
            db.createLeaveRequest({ ...db.getLeaveRequestById(leaveId), id: 'withdraw-rollback', status: 'pending_admin', updated_at: pending.updated_at });
            assert.equal((await request('/employee/supervisor/leave/withdraw', { requestId: 'withdraw-rollback', updatedAt: pending.updated_at, reason: 'rollback' }, second.token)).status, 500);
            assert.equal(db.getLeaveRequestById('withdraw-rollback').status, 'pending_admin');
        } finally { inspection.exec('DROP TRIGGER fail_proxy_audit'); }
    });
    await t.test('proxy calendar pages include every scoped record and cross-month overlap without changing history', async () => {
        const start = Date.parse('2026-11-01T08:00:00+08:00');
        for (let i = 0; i < 60; i += 1) db.createLeaveRequest({ ...leaveBody, id: `paged-${i}`, employee_id: 'E001', leave_type_id: leaveTypeId,
            supervisor_id: 'A002', start_at: start, end_at: start + 3600000, duration_hours: 1, status: 'rejected', created_at: i + 1, updated_at: i + 1 });
        db.createLeaveRequest({ id: 'cross-month', employee_id: 'E001', leave_type_id: leaveTypeId, start_at: start - 12 * 3600000,
            supervisor_id: 'A002', end_at: start + 3600000, duration_hours: 13, reason: 'cross month', status: 'rejected', created_at: 0, updated_at: 0 });
        const before = inspection.prepare('SELECT * FROM leave_requests ORDER BY id').all();
        const route = '/employee/supervisor?month=2026-11&date=2026-11-01&employeeId=E001';
        const first = (await request(route, null, second.token)).proxy.calendar;
        const next = (await request(route + '&page=2', null, second.token)).proxy.calendar;
        assert.equal(first.totalCount, 61);
        assert.equal(first.detail.totalPages, 2);
        assert.equal(first.detail.records.length, 50);
        assert.equal(next.detail.records.length, 11);
        assert.equal(new Set([...first.detail.records, ...next.detail.records].map((row) => row.id)).size, 61);
        assert.equal((await request(route + '&page=1.5', null, second.token)).status, 400);
        assert.equal((await request('/employee/supervisor?month=2026-11&date=2026-12-01&employeeId=E001', null, second.token)).status, 400);
        assert.deepEqual(inspection.prepare('SELECT * FROM leave_requests ORDER BY id').all(), before);
    });
    await t.test('authorization removal applies immediately to existing sessions without rewriting records', async () => {
        const before = inspection.prepare('SELECT * FROM leave_requests ORDER BY id').all();
        assert.equal((await assign(['A001'])).status, 200);
        assert.equal((await getProxy(second.token)).status, 403);
        assert.equal((await request('/employee/supervisor/leave', leaveBody, second.token)).status, 403);
        assert.deepEqual(inspection.prepare('SELECT * FROM leave_requests ORDER BY id').all(), before);
    });
    await t.test('deleted supervisor does not regain authorization if their id is reused', () => {
        const current = db.loadEmployees();
        db.saveEmployees(current.filter((e) => e.id !== 'A001'));
        db.saveEmployees(current);
        assert.equal(db.getSupervisors().assignedEmployees('A001').length, 0);
    });
});

test('supervisor UI escapes staff text, uses inline withdrawal and discards stale cross-account responses', async () => {
    const state = { token: 'first-token', dashboard: { role: 'employee' }, activeSections: {} };
    const context = vm.createContext({ state, Date, URLSearchParams, auditActionLabels: {}, auditTargetTypeLabels: {}, ui: {},
        escapeHtml: (text) => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'),
        document: { addEventListener() {}, getElementById() { return null; } }, renderDashboard() {}, renderEmployeeWorkspaceItems() { return []; },
        renderAdminPermissionAwareContent() {}, renderSystemAdminDashboard() {}, postRenderSetup() {}, handleDashboardClick() {},
        handleDashboardChange() {}, handleDashboardSubmit() {}, handleRealtimeSyncMessage() {}, handleLogout() {}, setMessage() {},
        hasCurrentAdminPermission(code) { return (state.dashboard.permissions?.admin || []).includes(code); }, renderAdminLeaveRouteRows() { return ''; } });
    const source = fs.readFileSync(path.join(__dirname, '../browser-client/supervisor.js'), 'utf8');
    vm.runInContext(source, context);
    assert.equal(source.includes('window.prompt('), false);
    assert.equal(source.includes('window.confirm('), false);
    assert.ok(source.includes('name="confirmAssignment" required'));
    context.staff = [{ id: 'E1', name: '<script>private</script>', department: 'Test' }];
    const options = vm.runInContext("spOptions(staff, 'E1')", context);
    assert.ok(!options.includes('<script>')); assert.ok(options.includes('&lt;script&gt;'));
    vm.runInContext("renderDashboard({ role: 'employee', user: { id: 'S1' } })", context);
    const pending = [];
    context.requestJson = () => new Promise((resolve) => pending.push(resolve));
    const first = vm.runInContext('spLoad()', context);
    const second = vm.runInContext('spLoad()', context);
    pending[0]({ proxy: { employeeId: 'E1', private: 'old' } }); await first;
    assert.equal(vm.runInContext('supervisorState.data', context), null);
    pending[1]({ proxy: { employeeId: 'E1', private: 'latest' } }); await second;
    assert.equal(vm.runInContext('supervisorState.data.private', context), 'latest');
    const late = vm.runInContext('spLoad()', context);
    state.token = 'another-account';
    vm.runInContext("renderDashboard({ role: 'employee', user: { id: 'S2' } })", context);
    pending[2]({ proxy: { employeeId: 'E1', private: 'old-account' } }); await late;
    assert.equal(vm.runInContext('supervisorState.data', context), null);
    vm.runInContext('supervisorState.assignments = { secret: 1 }; handleLogout()', context);
    assert.equal(vm.runInContext('supervisorState.assignments', context), null);
    vm.runInContext('supervisorState.data = { retained: true }; supervisorState.busy = true', context);
    await vm.runInContext("handleRealtimeSyncMessage({ type: 'supervisorAssignments', sessionToken: 'another-account' })", context);
    assert.equal(vm.runInContext('supervisorState.data.retained', context), true, 'own save notifications must not erase the success refresh');
    state.dashboard = { role: 'admin', permissions: { admin: ['admin.leave.settings'] } };
    state.activeSections.admin = 'supervisors';
    vm.runInContext('supervisorState.busy = false', context);
    const requested = [];
    context.requestJson = async (url) => { requested.push(url); return { routes: { approvalRoutes: [], employees: [], departments: [] } }; };
    await vm.runInContext('spLoad()', context);
    assert.deepEqual(requested, ['/api/browser/supervisors/reviewers']);
    const html = vm.runInContext('renderSupervisorAssignments()', context);
    assert.ok(html.includes('請假／加班共用主管審核路徑')); assert.ok(!html.includes('指定代辦主管'));
});

test('legacy schema upgrade and cross-directory restore preserve original records and new supervisor assignments', async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tanchin-supervisor-migration-'));
    const original = path.join(directory, 'old.db');
    const legacy = new Database(original);
    legacy.exec(`CREATE TABLE leave_requests (id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, leave_type_id TEXT NOT NULL,
        start_at INTEGER NOT NULL, end_at INTEGER NOT NULL, duration_hours REAL, reason TEXT, status TEXT,
        supervisor_id TEXT, supervisor_decision TEXT, supervisor_comment TEXT, supervisor_decided_at INTEGER,
        admin_decision_by TEXT, admin_comment TEXT, admin_decided_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        withdrawn_at INTEGER, cancelled_at INTEGER);
        INSERT INTO leave_requests (id, employee_id, leave_type_id, start_at, end_at, duration_hours, reason, status, created_at, updated_at)
        VALUES ('original', 'E1', 'annual', 1000, 2000, 8, 'original reason', 'approved', 1000, 1000);`);
    const before = legacy.prepare('SELECT * FROM leave_requests').get(); legacy.close();
    dbModule.init(original);
    t.after(() => { dbModule.close(); fs.rmSync(directory, { recursive: true, force: true }); });
    const upgraded = dbModule.getLeaveRequestById('original');
    for (const [key, value] of Object.entries(before)) assert.equal(upgraded[key], value);
    assert.equal(upgraded.applicant_id, null);
    dbModule.saveEmployees([{ id: 'E1', name: 'Employee', card: '1' }, { id: 'S1', name: 'Supervisor', card: '2' }]);
    const store = dbModule.getSupervisors();
    store.saveAssignments({ employeeId: 'E1', supervisorIds: ['S1'], revision: store.assignmentsState().employees[0].revision, reason: 'migration test' }, (entry) => ({ ...entry, actor_id: 'admin' }));
    const backup = path.join(directory, 'backup.db'); await dbModule.backupDatabase(backup);
    dbModule.close();
    const restored = path.join(directory, 'restored.db'); fs.copyFileSync(backup, restored); dbModule.init(restored);
    assert.equal(dbModule.getSupervisors().isAssigned('S1', 'E1'), true);
    assert.equal(dbModule.getLeaveRequestById('original').id, before.id);
    assert.equal(dbModule.getLeaveRequestById('original').status, before.status);
    const sql = new Database(':memory:');
    sql.exec('CREATE TABLE employees (id TEXT, name TEXT, department TEXT)');
    createSupervisorStore(sql, () => {}).assignmentsState(); sql.close();
});
