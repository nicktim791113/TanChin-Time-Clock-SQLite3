const assert = require('node:assert/strict');
const { test } = require('node:test');
const Database = require('better-sqlite3');
const { startFixture } = require('./fixtures/browser-server');

test('metric review actors distinguish live pending votes, actual approvals, management stage and unknown identities', async (t) => {
    const fixture = await startFixture(), { db, url } = fixture;
    const sql = new Database(fixture.databasePath);
    t.after(async () => { sql.close(); await fixture.close(); });
    db.setSetting('browserSecuritySettings', { deviceBindingEnabled: false, gpsRequiredOnPunch: false });
    const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10), now = Date.parse(today + 'T09:00:00+08:00');
    const seed = (kind, id, extra = {}) => db[kind === 'leave' ? 'createLeaveRequest' : 'createOvertimeRequest']({
        id, employee_id: 'E001', applicant_id: 'E001', applicant_role: 'employee', leave_type_id: db.loadLeaveTypes()[0].id,
        supervisor_id: 'A001', status: 'pending_supervisor', start_at: now, end_at: now + 3600000, duration_hours: 1, reason: 'Fixture only', created_at: now, updated_at: now, ...extra });
    seed('leave', 'legacy-pending');
    seed('leave', 'unknown-supervisor', { supervisor_id: 'MISSING', applicant_id: null });
    sql.prepare("UPDATE leave_requests SET applicant_id=NULL WHERE id='unknown-supervisor'").run();
    seed('leave', 'legacy-expired', { supervisor_id: 'D001' });
    sql.prepare('INSERT OR REPLACE INTO request_review_epochs VALUES (?, ?)').run('D001', now + 1);
    const policy = { supervisorIds: ['A001', 'A002', 'D001'], requiredSupervisorIds: ['A001', 'A002'], mode: 'required' };
    seed('leave', 'multi-partial', { applicant_id: 'A002', review_policy: policy });
    seed('overtime', 'overtime-partial', { applicant_id: 'A002', review_policy: policy });
    for (const kind of ['leave', 'overtime']) {
        const id = kind === 'leave' ? 'multi-partial' : 'overtime-partial';
        sql.prepare("UPDATE request_review_votes SET decision='approved', decided_at=? WHERE kind=? AND request_id=? AND reviewer_id='A001'").run(now + 100, kind, id);
        sql.prepare("UPDATE request_review_votes SET decision='approved', decided_at=?, revoked=1 WHERE kind=? AND request_id=? AND reviewer_id='D001'").run(now + 200, kind, id);
    }
    seed('leave', 'multi-any', { review_policy: { supervisorIds: ['A001', 'A002'], requiredSupervisorIds: [], mode: 'any' } });
    seed('leave', 'management-pending', { status: 'pending_admin', supervisor_decision: 'approved', supervisor_decided_at: now + 300, admin_decision_by: 'D001' });
    seed('leave', 'approved-both', { status: 'approved', supervisor_decision: 'approved', supervisor_decided_at: now + 400, admin_decision_by: 'A002', admin_decided_at: now + 500 });
    seed('leave', 'approved-unknown', { status: 'approved', supervisor_id: null, supervisor_decision: null });
    // Existing policy takes precedence over a stale single-supervisor decision.
    sql.prepare("UPDATE leave_requests SET supervisor_decision='approved', supervisor_id='D001' WHERE id='multi-any'").run();
    const call = async (route, token, body) => {
        const response = await fetch(url + '/api/browser' + route, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
        return { status: response.status, ...await response.json() };
    };
    const login = async (id, role) => { const account = await call('/login', null, { employeeId: id, secret: id + '-test-password', role: 'account' }); return call('/workspace', account.token, { role }); };
    const admin = await login('A001', 'admin'), limited = await login('A002', 'admin'), employee = await login('A001', 'employee');
    const snapshot = () => JSON.stringify(['leave_requests', 'overtime_requests', 'request_review_votes', 'request_review_epochs'].map((table) => sql.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
    const before = snapshot();
    const pending = await call('/admin/dashboard-metrics/detail?key=leavePendingSupervisor', admin.token);
    assert.equal(pending.status, 200);
    const row = (id) => pending.detail.records.find((item) => item.id === id);
    assert.deepEqual(row('legacy-pending').reviewActors.pendingSupervisors, [{ id: 'A001', name: 'Test Manager', required: false }]);
    assert.equal(row('legacy-pending').applicantIsSelf, true);
    assert.equal(row('unknown-supervisor').applicantIsSelf, false);
    assert.equal(row('unknown-supervisor').applicantId, '');
    assert.deepEqual(row('unknown-supervisor').reviewActors.pendingSupervisors, []);
    assert.deepEqual(row('legacy-expired').reviewActors.pendingSupervisors, []);
    const partial = row('multi-partial');
    assert.equal(partial.applicantIsSelf, false);
    assert.deepEqual(partial.reviewActors.pendingSupervisors, [{ id: 'A002', name: 'Delegated Manager', required: true }]);
    assert.deepEqual(partial.reviewActors.approvedSupervisors, [{ id: 'A001', name: 'Test Manager', required: true, decidedAt: now + 100, revoked: false }]);
    assert.equal(partial.reviewPolicy.reviewers.find((reviewer) => reviewer.id === 'D001').revoked, 1, 'revoked history is retained only in original policy');
    assert.deepEqual(row('multi-any').reviewActors.pendingSupervisors.map((person) => person.id), ['A001', 'A002']);
    assert.deepEqual(row('multi-any').reviewActors.approvedSupervisors, [], 'do not infer approval from stale legacy data when a vote policy exists');
    const management = await call('/admin/dashboard-metrics/detail?key=leavePendingAdmin', admin.token);
    const managementActors = management.detail.records.find((item) => item.id === 'management-pending').reviewActors;
    assert.equal(managementActors.pendingAdmin, true);
    assert.deepEqual(managementActors.pendingSupervisors, []);
    assert.deepEqual(managementActors.approvedSupervisors.map((person) => person.id), ['A001']);
    assert.equal(managementActors.approvedAdmin, null, 'pending management stage is not assigned to a guessed person or stale recorded actor');
    const approved = await call('/admin/dashboard-metrics/detail?key=leaveDay:0&date=' + today, admin.token);
    const both = approved.detail.records.find((item) => item.id === 'approved-both').reviewActors;
    assert.deepEqual(both.approvedAdmin, { id: 'A002', name: 'Delegated Manager', decidedAt: now + 500 });
    assert.equal(both.pendingAdmin, false);
    assert.deepEqual(both.pendingSupervisors, []);
    const unknown = approved.detail.records.find((item) => item.id === 'approved-unknown').reviewActors;
    assert.deepEqual(unknown.approvedSupervisors, []); assert.equal(unknown.approvedAdmin, null);
    const overtime = await call('/admin/dashboard-metrics/detail?key=overtimePendingSupervisor', admin.token);
    assert.deepEqual(overtime.detail.records[0].reviewActors.pendingSupervisors.map((person) => person.id), ['A002']);
    assert.equal(overtime.detail.records[0].reviewActors.pendingAdmin, false);
    for (const token of [null, limited.token, employee.token]) assert.ok([401, 403].includes((await call('/admin/dashboard-metrics/detail?key=leavePendingSupervisor', token)).status));
    assert.equal(snapshot(), before, 'read-only detail projections do not alter requests or review votes');
});
