const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Database = require('better-sqlite3');
const { test } = require('node:test');
const { createReviewSupervisorStore } = require('../review-supervisors');
const { startFixture } = require('./fixtures/browser-server');

test('legacy review migration is atomic, one-time, scoped to existing staff and never inherits department changes', () => {
    const sql = new Database(':memory:'), logs = [];
    sql.exec(`CREATE TABLE employees (id TEXT, name TEXT, department TEXT);
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE leave_approval_routes (department TEXT, supervisor_id TEXT, enabled INTEGER);
        INSERT INTO employees VALUES ('E1','One','A'),('E2','Two','B'),('E3','Three','C'),('S1','Supervisor1','A'),('S2','Supervisor2','B');
        INSERT INTO leave_approval_routes VALUES ('A','S1',1),('B','S1',0),('*','S2',1);`);
    try {
        assert.throws(() => createReviewSupervisorStore(sql, () => { throw Error('audit failure'); }), /audit failure/);
        assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM employee_review_supervisors').get().n, 0);
        assert.equal(sql.prepare("SELECT value FROM settings WHERE key='employeeReviewMigration'").get(), undefined);
        let store = createReviewSupervisorStore(sql, (entry) => logs.push(entry));
        const supervisor = (id) => store.state().employees.find((e) => e.id === id).supervisorId;
        assert.equal(supervisor('E1'), 'S1'); assert.equal(supervisor('E2'), 'S2'); assert.equal(supervisor('E3'), 'S2');
        assert.equal(supervisor('S1'), ''); assert.equal(supervisor('S2'), '');
        sql.exec("UPDATE employees SET department='B' WHERE id='E1'; INSERT INTO employees VALUES ('NEW','New hire','A');");
        store = createReviewSupervisorStore(sql, (entry) => logs.push(entry));
        assert.equal(supervisor('E1'), 'S1'); assert.equal(supervisor('NEW'), ''); assert.equal(logs.length, 1);
    } finally { sql.close(); }
});

test('individual review routing APIs preserve historical cases, scoped authorization, atomic writes and backups', async (t) => {
    const fixture = await startFixture(), { db, url } = fixture, sql = new Database(fixture.databasePath);
    t.after(async () => { sql.close(); await fixture.close(); });
    db.setSetting('browserSecuritySettings', { deviceBindingEnabled: false, gpsRequiredOnPunch: false });
    db.saveLeaveApprovalRoutes([{ department: '*', supervisor_id: 'A001', enabled: true }]);
    async function request(route, body, token) {
        const response = await fetch(url + '/api/browser' + route, { method: body ? 'POST' : 'GET',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
        return { status: response.status, ...await response.json() };
    }
    async function login(id, secret, role = 'employee') {
        const result = await request('/login', { employeeId: id, secret, role: 'account' });
        assert.equal(result.status, 200);
        return result.dashboard.role === 'workspace' ? request('/workspace', { role }, result.token) : result;
    }
    const system = await request('/login', { employeeId: 'system-admin', secret: 'system-admin-test', role: 'system_admin' });
    const admin = await login('A001', 'A001-test-password', 'admin'), employee = await login('E001', 'employee-card');
    const oldSupervisor = await login('A001', 'A001-test-password'), newSupervisor = await login('D001', 'D001-test-password');
    const limited = await login('A002', 'A002-test-password', 'admin');
    const state = () => db.getReviewSupervisors().state();
    const payload = (ids = ['E001'], supervisorId = 'D001') => ({ employeeIds: ids, supervisorId, reason: 'Individual assignment test', confirmReview: true,
        revisions: Object.fromEntries(state().employees.filter((e) => ids.includes(e.id)).map((e) => [e.id, e.revision])) });
    const post = (body, token = system.token) => request('/supervisors/reviewers/batch', body, token);
    const period = (day) => ({ startDate: `2026-10-${day}`, endDate: `2026-10-${day}`, startTime: '18:00', endTime: '20:00', durationHours: 2,
        leaveTypeId: db.loadLeaveTypes()[0].id, reason: 'Routing test' });
    const historical = {};
    for (const kind of ['leave', 'overtime']) {
        assert.equal((await request(`/employee/${kind}/request`, period('10'), employee.token)).status, 200);
        historical[kind] = (kind === 'leave' ? db.queryLeaveRequests : db.queryOvertimeRequests)({ employeeId: 'E001' })[0];
    }
    const snapshot = () => JSON.stringify(['leave_requests', 'overtime_requests', 'leave_approval_steps', 'overtime_approval_steps']
        .map((table) => sql.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
    const original = snapshot();
    await t.test('review setting permission is independent of proxy grants and rejects impersonation', async () => {
        for (const token of [undefined, employee.token, limited.token]) {
            assert.ok([401, 403].includes((await request('/supervisors/reviewers', null, token)).status));
            assert.ok([401, 403].includes((await request('/supervisors/reviewers/batch', payload(), token)).status));
        }
        assert.equal((await request('/supervisors/reviewers', null, admin.token)).status, 200);
        db.saveAccountAccessRecord({ employee_id: 'A002', allowed_roles: ['employee', 'admin'], admin_preset: 'custom', admin_permissions: ['admin.leave.settings'] });
        const routesOnly = await login('A002', 'A002-test-password', 'admin');
        assert.equal((await request('/supervisors/reviewers', null, routesOnly.token)).status, 200);
        assert.equal((await request('/supervisors/assignments', null, routesOnly.token)).status, 403);
        const developer = await login('D001', 'D001-test-password', 'developer');
        db.setSetting('developerImpersonationEnabled', true);
        const impersonated = await request('/developer/impersonation/start', { targetRole: 'admin', systemPassword: '0000' }, developer.token);
        assert.equal(impersonated.status, 200);
        assert.equal((await post(payload(), developer.token)).status, 403);
    });
    await t.test('same department staff can have different reviewers; changes never rewrite pending or historical cases', async () => {
        const staff = db.loadEmployees(); staff.find((e) => e.id === 'D001').department = 'Cross team'; db.saveEmployees(staff);
        assert.equal((await post(payload(['E001', 'A002']))).status, 200);
        assert.equal(snapshot(), original);
        assert.equal(state().employees.find((e) => e.id === 'E001').supervisorId, 'D001');
        assert.equal(state().employees.find((e) => e.id === 'A002').supervisorId, 'D001');
        assert.equal(state().employees.find((e) => e.id === 'D001').supervisorId, 'A001');
        assert.equal(db.getSupervisors().assignmentsState().employees.find((e) => e.id === 'E001').supervisorIds.length, 0);
        for (const kind of ['leave', 'overtime']) {
            assert.equal((await request(`/employee/${kind}/request`, period('11'), employee.token)).status, 200);
            const row = (kind === 'leave' ? db.queryLeaveRequests : db.queryOvertimeRequests)({ employeeId: 'E001' }).find((r) => r.id !== historical[kind].id);
            assert.equal(row.supervisor_id, 'D001'); assert.equal(row.status, 'pending_supervisor');
            assert.equal((await request(`/employee/${kind}/supervisor-decision`, { requestId: historical[kind].id, decision: 'approved' }, newSupervisor.token)).status, 403);
            assert.equal((await request(`/employee/${kind}/supervisor-decision`, { requestId: historical[kind].id, decision: 'approved' }, oldSupervisor.token)).status, 200);
            assert.equal((kind === 'leave' ? db.getLeaveRequestById : db.getOvertimeRequestById)(historical[kind].id).status, kind === 'leave' ? 'pending_admin' : 'approved');
        }
        for (const route of ['/admin/leave-routes/save', '/supervisors/routes'])
            assert.equal((await request(route, { approvalRoutes: [{ department: '*', supervisor_id: 'A001', enabled: true }] }, system.token)).status, 409);
        const dashboard = (await request('/dashboard', null, newSupervisor.token)).dashboard;
        assert.ok(dashboard.overtime.eligibleEmployees.some((e) => e.id === 'E001'));
        assert.equal((await request('/employee/overtime/request', { ...period('12'), employeeId: 'E001' }, oldSupervisor.token)).status, 403);
        assert.equal((await request('/employee/overtime/request', { ...period('12'), employeeId: 'E001' }, newSupervisor.token)).status, 200);
    });
    await t.test('every target revision and the roster are checked; invalid batches leave all assignments unchanged', async () => {
        const before = db.getReviewSupervisors().rows(), valid = payload(['E001', 'A002'], 'A001');
        for (const changes of [{ employeeIds: [] }, { employeeIds: ['E001', 'E001'] }, { employeeIds: Array(101).fill('E001') },
            { employeeIds: ['DELETED'] }, { supervisorId: 'DELETED' }, { supervisorId: 'E001' }, { supervisorId: ['D001'] },
            { revisions: { E001: valid.revisions.E001, A002: 'old' } }, { confirmReview: false }, { reason: ' ' }, { reason: 'a'.repeat(501) },
            { supervisorId: '', confirmClear: false }]) {
            assert.ok([400, 409].includes((await post({ ...valid, ...changes })).status));
            assert.deepEqual(db.getReviewSupervisors().rows(), before);
        }
        const stale = payload(); const staff = db.loadEmployees(); staff[0].name += ' renamed'; db.saveEmployees(staff);
        assert.equal((await post(stale)).status, 409);
        assert.deepEqual(db.getReviewSupervisors().rows(), before);
    });
    await t.test('failure on second audit rolls back both assignments, revisions and first audit', async () => {
        const before = db.getReviewSupervisors().rows(), auditCount = db.queryAuditLogs({ limit: null }).length;
        sql.exec("CREATE TRIGGER fail_second_review BEFORE INSERT ON audit_logs WHEN NEW.target_type='employee_review_supervisor' AND NEW.target_id='A002' BEGIN SELECT RAISE(FAIL,'test review audit failure'); END");
        try { assert.equal((await post(payload(['E001', 'A002'], 'A001'))).status, 500); }
        finally { sql.exec('DROP TRIGGER fail_second_review'); }
        assert.deepEqual(db.getReviewSupervisors().rows(), before); assert.equal(db.queryAuditLogs({ limit: null }).length, auditCount);
    });
    await t.test('clearing, new hires, deletion and reused ids cannot silently regain a department assignment', async () => {
        assert.equal((await post({ ...payload(), supervisorId: '', confirmClear: true })).status, 200);
        for (const kind of ['leave', 'overtime']) assert.equal((await request(`/employee/${kind}/request`, period('13'), employee.token)).status, 400);
        let staff = db.loadEmployees(); db.saveEmployees([...staff, { id: 'NEW', name: 'New hire', department: 'Test', card: 'new' }]);
        assert.equal(state().employees.find((e) => e.id === 'NEW').supervisorId, '');
        assert.equal((await post(payload())).status, 200);
        staff = db.loadEmployees(); db.saveEmployees(staff.filter((e) => e.id !== 'D001')); db.saveEmployees(staff);
        assert.equal(state().employees.find((e) => e.id === 'E001').supervisorId, '');
        assert.equal(db.getLeaveRequestById(historical.leave.id).supervisor_id, 'A001');
    });
    await t.test('SQLite backup restores individual assignments and migration markers without importing stale departments', async () => {
        assert.equal((await post(payload(['E001', 'A002'], 'A001'))).status, 200);
        const before = state(), saved = path.join(fixture.directory, 'review-backup.db'); await db.backupDatabase(saved);
        const restored = new Database(saved);
        try { assert.deepEqual(createReviewSupervisorStore(restored, () => { throw Error('must not remigrate'); }).state(), before); }
        finally { restored.close(); }
        const logs = db.queryAuditLogs({ targetType: 'employee_review_supervisor', limit: null }).filter((log) => log.action === 'employee_review_supervisor');
        assert.ok(logs.length >= 2); assert.ok(logs.every((log) => log.after_data.reason && log.after_data.batchId && log.actor_id));
    });
});

test('supervisor sidebar separates permissions and forms; compact action row retains confirmations and protects drafts', async () => {
    const source = fs.readFileSync(path.join(__dirname, '../browser-client/supervisor.js'), 'utf8');
    const permissions = new Set(['admin.leave.settings', 'admin.supervisors.manage']);
    const context = vm.createContext({ Date, URLSearchParams, state: { token: 'test', dashboard: { role: 'admin' }, activeSections: { admin: 'supervisors' } },
        ui: {}, auditActionLabels: {}, auditTargetTypeLabels: {}, escapeHtml: String, hasCurrentAdminPermission: (p) => permissions.has(p),
        renderAdminPaperEmployeePicker: (_staff, label, _selected, options) => `<div data-picker="${options.name}" data-single="${Boolean(options.single)}">${label}</div>`,
        document: { addEventListener() {}, getElementById() { return null; } }, renderDashboard() {}, renderEmployeeWorkspaceItems() { return []; },
        renderAdminPermissionAwareContent() {}, renderSystemAdminDashboard() {}, postRenderSetup() {}, handleDashboardClick() {}, handleDashboardChange() {},
        handleDashboardSubmit() {}, handleRealtimeSyncMessage() {}, handleLogout() {}, setMessage() {} });
    vm.runInContext(source, context);
    vm.runInContext("supervisorState.routes={employees:[{id:'E1',name:'Employee',supervisorId:'S1',revision:'r'}]};supervisorState.assignments={employees:[{id:'E1',name:'Employee',supervisorIds:['S1']}]}", context);
    let html = vm.runInContext('renderSupervisorAssignments()', context);
    assert.ok(html.includes('主管指定子導覽')); assert.ok(html.includes('data-view="review"')); assert.ok(html.includes('data-view="assignments"'));
    assert.ok(html.includes('data-picker="reviewEmployeeIds"')); assert.ok(html.includes('data-picker="reviewSupervisorId" data-single="true"'));
    assert.ok(!html.includes('data-sp-form="assignments/batch"')); assert.ok(!html.includes('name="department"'));
    vm.runInContext("supervisorState.managementView='assignments'", context); html = vm.runInContext('renderSupervisorAssignments()', context);
    const row = html.slice(html.indexOf('<div class="sp-assignment-submit-row">'), html.indexOf('</div><label class="sp-confirm" data-sp-clear-confirm'));
    for (const text of ['name="mode"', 'name="reason"', 'name="confirmAssignment"', '批量儲存主管指定']) assert.ok(row.includes(text));
    permissions.delete('admin.supervisors.manage'); html = vm.runInContext('renderSupervisorAssignments()', context);
    assert.ok(!html.includes('data-view="assignments"')); assert.ok(html.includes('reviewers/batch'));
    permissions.add('admin.supervisors.manage'); permissions.delete('admin.leave.settings'); html = vm.runInContext('renderSupervisorAssignments()', context);
    assert.ok(!html.includes('data-view="review"')); assert.ok(html.includes('assignments/batch'));
    permissions.add('admin.leave.settings'); context.spDiscard = async () => false;
    context.event = { preventDefault() {}, target: { closest: () => ({ dataset: { action: 'sp-management-view', view: 'review' } }) } };
    vm.runInContext('supervisorState.dirty=true', context); await vm.runInContext('handleDashboardClick(event)', context);
    assert.equal(vm.runInContext('supervisorState.managementView', context), 'assignments'); assert.equal(vm.runInContext('supervisorState.dirty', context), true);
});
