const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Database = require('better-sqlite3');
const { test } = require('node:test');
const { startFixture } = require('./fixtures/browser-server');

test('overtime self, proxy and review entry points enforce independent scopes and atomic audit', async (t) => {
    const fixture = await startFixture(), { db, url } = fixture, sql = new Database(fixture.databasePath);
    t.after(async () => { sql.close(); await fixture.close(); });
    db.setSetting('browserSecuritySettings', { deviceBindingEnabled: false, gpsRequiredOnPunch: false });
    db.saveLeaveApprovalRoutes([{ department: '*', supervisor_id: 'D001', enabled: true }]);
    const audit = (entry) => ({ ...entry, actor_id: '__test__', role: 'system' });
    const review = db.getReviewSupervisors(), grants = db.getSupervisors();
    function reviewer(employeeId, supervisorId) {
        review.saveBatch({ employeeIds: [employeeId], supervisorId, confirmReview: true, reason: 'Test reviewer',
            revisions: { [employeeId]: review.state().employees.find((e) => e.id === employeeId).revision } }, audit);
    }
    function grant(supervisorIds) {
        grants.saveAssignments({ employeeId: 'E001', supervisorIds, reason: 'Test grant',
            revision: grants.assignmentsState().employees.find((e) => e.id === 'E001').revision }, audit);
    }
    async function request(route, body, token) {
        const r = await fetch(url + '/api/browser' + route, { method: body ? 'POST' : 'GET',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: body ? JSON.stringify(body) : undefined });
        return { status: r.status, ...await r.json() };
    }
    async function login(employeeId, secret, role = 'employee') {
        let r = await request('/login', { employeeId, secret, role: 'account' });
        assert.equal(r.status, 200);
        if (r.dashboard.role === 'workspace') r = await request('/workspace', { role }, r.token);
        assert.equal(r.status, 200); return r;
    }
    const period = (day) => ({ startDate: `2026-10-${day}`, endDate: `2026-10-${day}`, startTime: '18:00', endTime: '20:00', durationHours: 2, reason: 'Entry test' });
    const self = (body, token) => request('/employee/overtime/request', body, token);
    const proxy = (body, token) => request('/employee/supervisor/overtime', body, token);
    const proxyBody = (day) => ({ ...period(day), employeeIds: ['E001'], proxyReason: 'Employee needs help', confirmApproval: true });
    reviewer('E001', 'A001'); grant(['A001']);
    db.createOvertimeRequest({ id: 'legacy-proxy', employee_id: 'E001', applicant_id: 'A001', applicant_role: 'supervisor_proxy',
        start_at: Date.parse('2026-09-01T18:00:00+08:00'), end_at: Date.parse('2026-09-01T20:00:00+08:00'), duration_hours: 2,
        reason: 'Legacy approved record', status: 'approved', supervisor_id: 'A001', supervisor_decision: 'approved',
        approval_mode: 'supervisor_proxy_auto_approved', created_at: 1, updated_at: 1 });
    const original = db.getOvertimeRequestById('legacy-proxy');
    const manager = await login('A001', 'A001-test-password'), card = await login('A001', 'manager-card');
    const employee = await login('E001', 'employee-card'), other = await login('D001', 'D001-test-password');
    await t.test('self API cannot target others through aliases, conflicting fields or batch payloads, even as reviewer/proxy', async () => {
        for (const token of [manager.token, card.token, employee.token]) {
            for (const fields of [{ employeeId: 'E001' }, { employee_id: 'E001' }, { employeeId: 'A001', employee_id: 'E001' },
                { employeeId: ['A001'] }, { employeeIds: ['A001'] }, { employeeId: 'DELETED' }]) {
                if (token === employee.token && (fields.employeeId === 'E001' || fields.employee_id === 'E001' && !fields.employeeId)) continue;
                assert.equal((await self({ ...period('20'), ...fields }, token)).status, 403);
            }
        }
        for (const token of [manager.token, card.token]) {
            const dashboard = (await request('/dashboard', null, token)).dashboard;
            assert.deepEqual(dashboard.overtime.eligibleEmployees.map((e) => e.id), ['A001']);
            assert.equal(dashboard.supervisorReview.canUse, true);
            assert.ok(dashboard.overtime.myRequests.some((r) => r.id === original.id));
        }
        assert.equal((await self(period('20'))).status, 401);
        db.setSetting('developerImpersonationEnabled', true);
        const developer = await login('D001', 'D001-test-password', 'developer');
        assert.equal((await request('/developer/impersonation/start', { targetRole: 'employee', targetEmployeeId: 'A001', systemPassword: '0000' }, developer.token)).status, 200);
        assert.equal((await self(period('30'), developer.token)).status, 403);
        assert.equal((await request('/developer/impersonation/stop', {}, developer.token)).status, 200);
        assert.deepEqual(db.getOvertimeRequestById(original.id), original);
    });
    await t.test('card/self and supervisor/self always wait for the designated reviewer; forged status cannot auto-approve', async () => {
        for (const [token, day] of [[card.token, '21'], [manager.token, '22'], [employee.token, '23']]) {
            assert.equal((await self({ ...period(day), status: 'approved', supervisor_id: 'A001', approval_mode: 'supervisor_proxy_auto_approved' }, token)).status, 200);
        }
        const own = db.queryOvertimeRequests({ employeeId: 'A001' });
        assert.equal(own.length, 2);
        assert.ok(own.every((r) => r.status === 'pending_supervisor' && r.supervisor_id === 'D001' && r.applicant_role === 'self' && r.approval_mode === 'self_request'));
        assert.equal((await self(period('21'), card.token)).status, 409);
    });
    await t.test('proxy is the only route for others: own card or password, explicit current grant, reason and confirmation', async () => {
        assert.equal((await proxy(proxyBody('24'), other.token)).status, 403);
        assert.equal((await proxy({ ...proxyBody('24'), proxyReason: '' }, manager.token)).status, 400);
        assert.equal((await proxy({ ...proxyBody('24'), confirmApproval: false }, manager.token)).status, 400);
        const saved = await proxy(proxyBody('24'), card.token);
        assert.equal(saved.status, 200);
        assert.equal(db.getOvertimeRequestById(saved.requestId).status, 'approved');
        assert.equal(db.getOvertimeRequestById(saved.requestId).applicant_id, 'A001');
        const beforeDuplicate = db.queryOvertimeRequests({ employeeId: 'E001', limit: null }).length;
        assert.equal((await proxy(proxyBody('24'), manager.token)).status, 409);
        assert.equal(db.queryOvertimeRequests({ employeeId: 'E001', limit: null }).length, beforeDuplicate);
        assert.equal((await proxy(proxyBody('27'), manager.token)).status, 200);
        assert.equal((await proxy(proxyBody('23'), manager.token)).status, 409);
        grant([]);
        assert.equal((await proxy(proxyBody('25'), manager.token)).status, 403);
        assert.equal((await proxy(proxyBody('25'), card.token)).status, 403);
        assert.equal((await self({ ...period('25'), employeeId: 'E001' }, manager.token)).status, 403);
    });
    await t.test('review-only roster is read-only, permission scoped and never silently grants leave/meal proxy access', async () => {
        const admin = await login('A001', 'A001-test-password', 'admin');
        const limited = await login('A002', 'A002-test-password', 'admin');
        assert.equal((await request('/supervisors/assignments', null, limited.token)).status, 403);
        const before = grants.assignmentsState();
        const response = await request('/supervisors/assignments', null, admin.token);
        assert.equal(response.status, 200);
        assert.ok(response.assignments.reviewOnly.some((r) => r.employeeId === 'E001' && r.supervisorId === 'A001'));
        assert.deepEqual(grants.assignmentsState(), before);
        assert.equal((await request('/employee/supervisor?month=2026-10', null, manager.token)).proxy.employees.length, 0);
        grant(['A001']);
        assert.ok(!(await request('/supervisors/assignments', null, admin.token)).assignments.reviewOnly.some((r) => r.employeeId === 'E001' && r.supervisorId === 'A001'));
    });
    await t.test('failed audit rolls back self request and approval steps, and proxy remains atomic', async () => {
        const counts = () => ['overtime_requests', 'overtime_approval_steps', 'audit_logs'].map((table) => sql.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n);
        const before = counts();
        sql.exec("CREATE TRIGGER fail_entry_audit BEFORE INSERT ON audit_logs WHEN NEW.target_type='overtime_request' BEGIN SELECT RAISE(FAIL,'entry audit failure'); END");
        try {
            assert.equal((await self(period('26'), manager.token)).status, 500);
            assert.deepEqual(counts(), before);
            assert.equal((await proxy(proxyBody('26'), manager.token)).status, 500);
            assert.deepEqual(counts(), before);
        } finally { sql.exec('DROP TRIGGER fail_entry_audit'); }
    });
    await t.test('old pending cases retain their original reviewer, and legacy records/steps are not rewritten', async () => {
        const pending = db.queryOvertimeRequests({ employeeId: 'E001', status: 'pending_supervisor' })[0];
        reviewer('E001', 'D001');
        assert.equal((await request('/employee/overtime/supervisor-decision', { requestId: pending.id, decision: 'approved' }, other.token)).status, 403);
        const dashboard = (await request('/dashboard', null, manager.token)).dashboard;
        assert.equal(dashboard.supervisorReview.canUse, true);
        assert.equal((await request('/employee/overtime/supervisor-decision', { requestId: pending.id, decision: 'approved' }, manager.token)).status, 200);
        assert.deepEqual(db.getOvertimeRequestById(original.id), original);
    });
});

test('employee review calendar and personal history keep separate state, controls, caches and draft confirmation', async () => {
    const state = { token: 'test', employeeWorkspacePanel: 'overtime-history', dashboard: { role: 'employee', user: { id: 'A001' }, supervisorReview: { canUse: true, count: 1 } } };
    const context = vm.createContext({ state, Date, Map, URLSearchParams, escapeHtml: String, hasCurrentAdminPermission: () => false,
        document: { addEventListener() {}, getElementById: () => null }, window: { confirm: () => false },
        renderDashboard() {}, renderEmployeeLeaveRecordsPanel() {}, renderEmployeeOvertimeRecordsPanel() {}, renderEmployeeWorkspaceItems: () => [],
        getWorkspaceSubnavItemPanelHtml() {}, getAdminPaperRequest() {}, postRenderSetup() {}, handleDashboardClick() {}, handleRealtimeSyncMessage() {}, handleLogout() {},
        workspaceSubnavConfigs: { admin: { leave: { groups: [{ items: [{ id: 'records' }] }] }, overtime: { groups: [{ items: [{ id: 'records' }] }] } } },
        renderEmployeeLeaveRequestRows: () => 'REVIEW TABLE', renderOvertimeRequestRows: () => 'REVIEW TABLE' });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../browser-client/request-calendar.js'), 'utf8'), context);
    const mine = vm.runInContext("rcState('overtime')", context);
    mine.cache.set('mine-private', {}); mine.month = '2026-07';
    let html = vm.runInContext("rcRender('overtime')", context);
    assert.ok(!html.includes('data-rc-filter="scope"')); assert.ok(!html.includes('跨月份待我審核'));
    state.employeeWorkspacePanel = 'supervisor-review';
    const review = vm.runInContext("rcState('overtime')", context);
    assert.notEqual(review, mine); assert.equal(review.scope, 'review'); assert.equal(review.cache.size, 0);
    review.cache.set('review-private', {}); review.month = '2026-01';
    html = vm.runInContext('renderEmployeeWorkspaceItems(state.dashboard)[0].html', context);
    assert.ok(html.includes('主管審核')); assert.ok(html.includes('rc-review-kind')); assert.ok(!html.includes('申請加班'));
    state.employeeWorkspacePanel = 'overtime-history';
    assert.equal(vm.runInContext("rcState('overtime').month", context), '2026-07');
    assert.equal(vm.runInContext("rcState('overtime').scope", context), 'mine');
    const pending = [];
    context.requestJson = () => new Promise((resolve) => pending.push(resolve));
    const mineLoad = vm.runInContext("rcLoad('overtime')", context);
    state.employeeWorkspacePanel = 'supervisor-review';
    const reviewLoad = vm.runInContext("rcLoad('overtime')", context);
    pending[1]({ calendar: { month: '2026-01', detail: { page: 1, records: [{ id: 'review-result' }] } } });
    await reviewLoad;
    pending[0]({ calendar: { month: '2026-07', detail: { page: 1, records: [{ id: 'mine-result' }] } } });
    await mineLoad;
    assert.equal(vm.runInContext("rcState('overtime').data.month", context), '2026-01');
    assert.equal(vm.runInContext("rcState('overtime').cache.has('mine-result')", context), false);
    state.employeeWorkspacePanel = 'supervisor-review';
    context.document.getElementById = () => ({ querySelectorAll: () => [{ value: 'Unsaved decision' }] });
    context.event = { preventDefault() {}, target: { closest: () => ({ dataset: { action: 'rc-review-kind', kind: 'overtime' } }) } };
    await vm.runInContext('handleDashboardClick(event)', context);
    assert.equal(vm.runInContext('requestCalendars.reviewKind', context), 'leave');
    state.dashboard.supervisorReview.canUse = false;
    assert.equal(vm.runInContext('renderEmployeeWorkspaceItems(state.dashboard).length', context), 0);
    vm.runInContext('handleLogout()', context);
    assert.equal(vm.runInContext('Object.keys(requestCalendars.review).length', context), 0);
});
