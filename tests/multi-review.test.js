const assert = require('node:assert/strict');
const { test } = require('node:test');
const Database = require('better-sqlite3');
const { startFixture } = require('./fixtures/browser-server');

test('multi-review snapshots, partial decisions, veto, audit rollback, proxy and deleted reviewer isolation', async (t) => {
    const fixture = await startFixture(), { db, url } = fixture, sql = new Database(fixture.databasePath);
    t.after(async () => { sql.close(); await fixture.close(); });
    db.setSetting('browserSecuritySettings', { deviceBindingEnabled: false, gpsRequiredOnPunch: false });
    async function request(route, body, token) {
        const response = await fetch(url + '/api/browser' + route, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
        return { status: response.status, ...await response.json() };
    }
    const tokens = {};
    for (const [id, secret] of [['E001', 'employee-card'], ['A001', 'A001-test-password'], ['A002', 'A002-test-password'], ['D001', 'D001-test-password']]) {
        const login = await request('/login', { employeeId: id, secret, role: 'account' });
        assert.equal(login.status, 200);
        tokens[id] = login.dashboard.role === 'workspace' ? (await request('/workspace', { role: 'employee' }, login.token)).token : login.token;
    }
    const store = db.getReviewSupervisors(), workflow = db.getReviewWorkflow();
    function setPolicy(mode, required = []) {
        store.saveBatch({ employeeIds: ['E001'], supervisorIds: ['A001', 'A002', 'D001'], mode, requiredSupervisorIds: required,
            reason: 'Multi review test', confirmReview: true, revisions: { E001: store.state().employees.find((e) => e.id === 'E001').revision } }, (e) => ({ ...e, actor_id: 'A001' }));
    }
    let day = 1;
    const get = (kind, id) => (kind === 'leave' ? db.getLeaveRequestById : db.getOvertimeRequestById)(id);
    async function create(kind) {
        const date = `2027-01-${String(day++).padStart(2, '0')}`;
        const result = await request(`/employee/${kind}/request`, { startDate: date, endDate: date, startTime: '18:00', endTime: '20:00', durationHours: 2, leaveTypeId: db.loadLeaveTypes()[0].id, reason: 'Multi review test' }, tokens.E001);
        assert.equal(result.status, 200, JSON.stringify(result));
        return (kind === 'leave' ? db.queryLeaveRequests : db.queryOvertimeRequests)({ employeeId: 'E001', limit: null }).find((r) => r.start_at === Date.parse(`${date}T18:00:00+08:00`));
    }
    const vote = (kind, id, actor, decision = 'approved') => request(`/employee/${kind}/supervisor-decision`, { requestId: id, decision, comment: `${actor} ${decision}` }, tokens[actor]);
    setPolicy('any');
    for (const changes of [{ mode: 'required', requiredSupervisorIds: [] }, { mode: 'required', requiredSupervisorIds: ['E001'] },
        { mode: 'any', requiredSupervisorIds: ['A001'] }, { supervisorIds: ['A001', 'A001'] }, { supervisorIds: ['E001'] }]) {
        const before = store.state();
        assert.throws(() => store.saveBatch({ employeeIds: ['E001'], supervisorIds: ['A001', 'D001'], mode: 'any', requiredSupervisorIds: [], reason: 'Invalid policy', confirmReview: true,
            revisions: { E001: before.employees.find((e) => e.id === 'E001').revision }, ...changes }, (e) => e));
        assert.deepEqual(store.state(), before);
    }
    for (const kind of ['leave', 'overtime']) {
        await t.test(`${kind}: frozen required set, optional vote, exact personal queues and atomic audit`, async () => {
            setPolicy('required', ['A001', 'D001']);
            const row = await create(kind), before = JSON.stringify(workflow.state(kind, row.id));
            setPolicy('any');
            assert.equal(JSON.stringify(workflow.state(kind, row.id)), before, 'future policies do not rewrite submitted cases');
            assert.equal((await vote(kind, row.id, 'E001')).status, 403);
            assert.equal((await vote(kind, row.id, 'A001', 'invalid')).status, 400);
            assert.equal((await vote(kind, row.id, 'A001')).status, 200);
            assert.equal(get(kind, row.id).status, 'pending_supervisor');
            assert.equal(get(kind, row.id).supervisor_decided_at, null);
            const step = sql.prepare(`SELECT * FROM ${kind}_approval_steps WHERE request_id = ? AND reviewer_role = 'supervisor'`).get(row.id);
            assert.equal(step.status, 'pending'); assert.equal(step.decided_at, null);
            assert.ok(!db[kind === 'leave' ? 'queryLeaveRequests' : 'queryOvertimeRequests']({ supervisorId: 'A001', status: 'pending_supervisor', limit: null }).some((r) => r.id === row.id));
            assert.ok(db[kind === 'leave' ? 'queryLeaveRequests' : 'queryOvertimeRequests']({ supervisorId: 'D001', status: 'pending_supervisor', limit: null }).some((r) => r.id === row.id));
            assert.equal((await vote(kind, row.id, 'A001')).status, 403);
            assert.equal((await vote(kind, row.id, 'A002')).status, 200);
            assert.equal(get(kind, row.id).status, 'pending_supervisor', 'optional approval cannot replace required approvals');
            const snapshot = () => JSON.stringify([get(kind, row.id), workflow.state(kind, row.id), sql.prepare(`SELECT * FROM ${kind}_approval_steps WHERE request_id = ?`).all(row.id)]);
            const rollback = snapshot();
            sql.exec("CREATE TRIGGER fail_review_audit BEFORE INSERT ON audit_logs WHEN NEW.action = 'approve' BEGIN SELECT RAISE(ABORT, 'audit failure'); END");
            const failure = await vote(kind, row.id, 'D001');
            sql.exec('DROP TRIGGER fail_review_audit');
            // Both request kinds must roll back their vote if the audit cannot be written.
            assert.equal(failure.status, 500); assert.equal(snapshot(), rollback);
            assert.equal((await vote(kind, row.id, 'D001')).status, 200);
            assert.equal(get(kind, row.id).status, kind === 'leave' ? 'pending_admin' : 'approved');
            assert.equal((await vote(kind, row.id, 'A002', 'rejected')).status, 403);
        });
        await t.test(`${kind}: any approval completes and any pending reviewer can veto required flow`, async () => {
            setPolicy('any'); const any = await create(kind);
            assert.equal((await vote(kind, any.id, 'A002')).status, 200);
            assert.equal(get(kind, any.id).status, kind === 'leave' ? 'pending_admin' : 'approved');
            assert.equal((await vote(kind, any.id, 'D001', 'rejected')).status, 403);
            setPolicy('required', ['A001', 'D001']); const veto = await create(kind);
            assert.equal((await vote(kind, veto.id, 'A001')).status, 200);
            assert.equal((await vote(kind, veto.id, 'A002', 'rejected')).status, 200);
            assert.equal(get(kind, veto.id).status, 'rejected');
            assert.equal((await vote(kind, veto.id, 'D001')).status, 403);
        });
    }
    await t.test('proxy cannot bypass multiple required reviewers; snapshots survive backup', async () => {
        setPolicy('required', ['A001', 'D001']);
        const assignments = db.getSupervisors().assignmentsState();
        db.getSupervisors().saveAssignmentsBatch({ employeeIds: ['E001'], supervisorIds: ['A001'], mode: 'add', reason: 'Proxy test', confirmAssignment: true,
            revisions: { E001: assignments.employees.find((e) => e.id === 'E001').revision } }, (entry) => ({ ...entry, actor_id: 'A001' }));
        for (const kind of ['leave', 'overtime']) {
            const result = await request(`/employee/supervisor/${kind}`, { employeeIds: ['E001'], startDate: '2027-02-01', endDate: '2027-02-01', startTime: '18:00', endTime: '20:00', durationHours: 2,
                leaveTypeId: db.loadLeaveTypes()[0].id, reason: 'Proxy request', proxyReason: 'Employee assistance', confirmApproval: true }, tokens.A001);
            assert.equal(result.status, 200, JSON.stringify(result));
            const row = db[kind === 'leave' ? 'queryLeaveRequests' : 'queryOvertimeRequests']({ employeeId: 'E001', limit: null }).find((r) => r.approval_mode === 'supervisor_proxy');
            assert.equal(row.status, 'pending_supervisor'); assert.equal(workflow.state(kind, row.id).mode, 'required');
        }
        const file = require('node:path').join(fixture.directory, 'review.db'); await db.backupDatabase(file);
        const copy = new Database(file);
        try { assert.deepEqual(copy.prepare('SELECT * FROM request_review_votes ORDER BY rowid').all(), sql.prepare('SELECT * FROM request_review_votes ORDER BY rowid').all()); }
        finally { copy.close(); }
    });
    await t.test('deleted and reused reviewer IDs cannot inherit pending votes; missing required reviewer blocks new cases', async () => {
        const row = await create('overtime'), original = db.loadEmployees();
        db.saveEmployees(original.filter((e) => e.id !== 'D001')); db.saveEmployees(original);
        assert.equal(workflow.canReview('overtime', row, 'D001'), false);
        assert.equal(workflow.state('overtime', row.id).reviewers.find((r) => r.id === 'D001').revoked, 1);
        await assert.rejects(async () => create('overtime'));
    });
});
