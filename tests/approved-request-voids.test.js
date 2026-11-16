const assert = require('node:assert/strict');
const { test } = require('node:test');
const Database = require('better-sqlite3');
const { startFixture } = require('./fixtures/browser-server');

async function setup(t) {
    const fixture = await startFixture(), { db, url } = fixture;
    const sql = new Database(fixture.databasePath);
    t.after(async () => { sql.close(); await fixture.close(); });
    db.setSetting('browserSecuritySettings', { deviceBindingEnabled: false, gpsRequiredOnPunch: false });
    db.setSetting('developerImpersonationEnabled', true);
    const api = async (path, token, body) => {
        const response = await fetch(url + '/api/browser' + path, {
            method: body ? 'POST' : 'GET',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
            ...(body ? { body: JSON.stringify(body) } : {})
        });
        return { status: response.status, ...await response.json() };
    };
    const login = async (id, role = 'admin') => {
        const account = await api('/login', '', { employeeId: id, secret: id + '-test-password', role: 'account' });
        const workspace = await api('/workspace', account.token, { role });
        assert.equal(workspace.status, 200, JSON.stringify(workspace));
        return workspace.token;
    };
    const setPermissions = permissions => db.saveAccountAccessRecord({
        employee_id: 'A002', allowed_roles: ['employee','admin'], admin_preset: 'custom', admin_permissions: permissions
    });
    return { db, sql, api, login, setPermissions };
}

test('approved overtime void is independently delegated, atomic, audited, and preserves the original review evidence', async t => {
    const { db, sql, api, login, setPermissions } = await setup(t);
    const route = '/admin/overtime/approved-void';
    const permission = 'admin.overtime.approvedVoid';
    const start = Date.parse('2036-01-02T18:00:00+08:00');
    for (const [index, id, mode, status] of [
        [0, 'online', 'self_request', 'pending_supervisor'], [1, 'paper', 'admin_paper_approved', 'approved'],
        [2, 'pending', 'self_request', 'pending_supervisor'], [3, 'proxy', 'supervisor_proxy_auto_approved', 'approved']
    ]) {
        const startAt = start + index * 86400000;
        db.createOvertimeRequest({
            id, start_at: startAt, end_at: startAt + 7200000, break_minutes: 0, duration_hours: 2,
            employee_id: 'E001', applicant_id: id === 'proxy' ? 'A001' : 'E001', applicant_role: id === 'proxy' ? 'supervisor_proxy' : 'self',
            approval_mode: mode, supervisor_id: 'A001', status, reason: 'Original application',
            review_policy: { supervisorIds: ['A001'], requiredSupervisorIds: [], mode: 'any' }, created_at: 1, updated_at: 1
        });
    }
    db.updateOvertimeRequestSupervisorDecision({ requestId: 'online', reviewerId: 'A001', decision: 'approved', comment: 'Original decision', decidedAt: 2 });
    const ordinary = await login('A001');
    const ordinaryPreview = await api(route + '?requestId=online', ordinary);
    assert.equal(ordinaryPreview.status, 200);
    assert.equal(ordinaryPreview.voiding.canVoid, false);
    const body = { requestId: 'online', revision: ordinaryPreview.voiding.revision, reason: 'Approved in error', confirm: true };
    assert.equal((await api(route, ordinary, body)).status, 403);
    setPermissions([permission]);
    const withoutView = await login('A002');
    assert.equal((await api(route + '?requestId=online', withoutView)).status, 403);
    assert.equal((await api(route, withoutView, body)).status, 403);
    setPermissions(['admin.overtime.view', 'admin.overtime.approvedCorrect', permission]);
    const delegated = await login('A002');
    const developer = await login('D001', 'developer');
    assert.equal((await api('/developer/impersonation/start', developer, { targetRole:'admin', targetEmployeeId:'A002', systemPassword:'0000' })).status, 200);
    assert.equal((await api(route + '?requestId=online', developer)).voiding.canVoid, false);
    assert.equal((await api(route, developer, body)).status, 403);
    for (const item of ['paper','pending']) assert.equal((await api(route + '?requestId=' + item, delegated)).status, 403);
    for (const changes of [{reason:'  '},{reason:'a'.repeat(501)},{confirm:false},{status:'approved'}]) {
        assert.equal((await api(route, delegated, {...body,...changes})).status, 400);
    }
    assert.equal((await api(route, delegated, {...body,revision:'stale'})).status, 409);
    const correctionRoute = '/admin/overtime/approved-correction';
    const correction = await api(correctionRoute + '?requestId=online', delegated);
    assert.equal((await api(correctionRoute, delegated, {
        requestId:'online', revision:correction.correction.revision, correctionReason:'Original changed', reason:'Updated original', confirm:true
    })).status, 200);
    assert.equal((await api(route, delegated, body)).status, 409);
    const read = await api(route + '?requestId=online', delegated);
    const latest = { ...body, revision: read.voiding.revision };
    const original = db.getOvertimeRequestById('online');
    const steps = sql.prepare("SELECT * FROM overtime_approval_steps WHERE request_id='online'").all();
    const votes = db.getReviewWorkflow().state('overtime','online');
    sql.exec("CREATE TRIGGER fixture_fail_void BEFORE INSERT ON audit_logs WHEN NEW.action='approved_void' BEGIN SELECT RAISE(ABORT,'fixture rollback'); END");
    assert.equal((await api(route, delegated, latest)).status, 500);
    assert.deepEqual(db.getOvertimeRequestById('online'), original);
    assert.deepEqual(db.getApprovedRequestVoids().history('overtime','online'), []);
    sql.exec('DROP TRIGGER fixture_fail_void');
    const saved = await api(route, delegated, latest);
    assert.equal(saved.status, 200, JSON.stringify(saved));
    assert.equal(saved.voiding.canVoid, false);
    assert.equal(saved.voiding.record.status, 'cancelled');
    assert.equal(saved.voiding.record.voidSummary.reason, body.reason);
    assert.equal(saved.voiding.history[0].before.status,'approved');
    assert.equal(saved.voiding.history[0].after.status,'cancelled');
    assert.deepEqual(saved.voiding.history[0].before.approvals.steps, steps);
    assert.deepEqual(sql.prepare("SELECT * FROM overtime_approval_steps WHERE request_id='online'").all(), steps);
    assert.deepEqual(db.getReviewWorkflow().state('overtime','online'), votes);
    assert.equal(db.countOvertimeRequests({status:'approved',employeeId:'E001'}),2);
    assert.equal(db.hasOverlappingOvertimeRequest('E001', start, start + 7200000),false);
    assert.equal((await api(route, delegated, latest)).status,409);
    assert.equal(db.getApprovedRequestVoids().history('overtime','online').length,1);
    assert.throws(()=>sql.exec('DELETE FROM approved_request_voids'),/immutable/);
    assert.throws(()=>sql.exec("UPDATE approved_request_voids SET reason='tampered'"),/immutable/);
    const previous = await api(correctionRoute + '?requestId=online', delegated);
    assert.equal(previous.correction.canCorrect, false);
    assert.equal(previous.correction.history.length,1);
    const conditional = db.getConditionalOvertimeReview();
    const audit = entry => ({ actor_id:'A002', actor_role:'admin', ...entry });
    conditional.save({
        enabled:true, effectiveDate:'2036-01-01', leaveTypeIds:['personal'], reviewerIds:['A002'],
        revision:conditional.state().revision, reason:'Fixture conditional rule', confirm:true
    }, audit);
    db.createLeaveRequest({
        id:'trigger', employee_id:'E001', leave_type_id:'personal', status:'approved', supervisor_id:'A001', reason:'Fixture leave',
        start_at:start - 9 * 3600000, end_at:start - 8 * 3600000, duration_hours:1, created_at:1, updated_at:1
    });
    const pending = conditional.detail('proxy');
    assert.equal(pending.status,'pending');
    assert.equal((await api(route + '?requestId=proxy', delegated)).status,403);
    conditional.decide({ requestId:'proxy', revision:pending.revision, decision:'approved', comment:'Independent approval' }, 'A002', audit);
    const conditionalApproved = conditional.detail('proxy');
    const proxy = await api(route + '?requestId=proxy', delegated);
    assert.equal((await api(route, delegated, {...body,requestId:'proxy',revision:proxy.voiding.revision})).status,200);
    const conditionalVoided = conditional.detail('proxy');
    assert.equal(conditionalVoided.status,'cancelled');
    assert.deepEqual(conditionalVoided.reviewerVotes,conditionalApproved.reviewerVotes);
    assert.deepEqual(conditionalVoided.ruleSnapshot,conditionalApproved.ruleSnapshot);
    assert.equal(conditional.history('proxy').at(-1).action,'cancelled');
});

test('approved online leave void releases quota and preserves charges and conditional review evidence', async t => {
    const { db, sql, api, login, setPermissions } = await setup(t);
    const route = '/admin/leave/approved-void';
    const audit = entry => ({ actor_id:'A002', actor_role:'admin', ...entry });
    const entitlements = db.getLeaveEntitlements();
    entitlements.saveDefault({
        leaveTypeId:'personal', effectiveYear:2036, grantHours:80, dayHours:8, enabled:true, futureYears:false,
        confirm:true, reason:'Fixture policy', revision:entitlements.revision()
    }, audit);
    const overtimeStart = Date.parse('2036-01-05T18:00:00+08:00');
    db.createOvertimeRequest({
        id:'saturday', start_at:overtimeStart, end_at:overtimeStart + 7200000, break_minutes:0, duration_hours:2,
        employee_id:'E001', applicant_id:'E001', applicant_role:'self', approval_mode:'self_request', supervisor_id:'A001',
        status:'approved', reason:'Fixture overtime', created_at:1, updated_at:1
    });
    const conditional = db.getConditionalOvertimeReview();
    conditional.save({
        enabled:true, effectiveDate:'2036-01-01', leaveTypeIds:['personal'], reviewerIds:['A002'],
        revision:conditional.state().revision, reason:'Fixture rule', confirm:true
    }, audit);
    const start = Date.parse('2036-01-02T09:00:00+08:00');
    db.createLeaveRequest({
        id:'leave-online', employee_id:'E001', applicant_id:'A001', applicant_role:'supervisor_proxy',
        leave_type_id:'personal', status:'approved', approval_mode:'supervisor_proxy', supervisor_id:'A001',
        start_at:start, end_at:start + 3600000, duration_hours:1, daily_hours:[{date:'2036-01-02',hours:1}],
        reason:'Original leave', created_at:1, updated_at:1
    });
    const usedHours = () => entitlements.balances(['E001'],2036).find(row => row.leave_type_id === 'personal').usedHours;
    assert.equal(usedHours(),1);
    const original = db.getLeaveRequestById('leave-online');
    const charges = entitlements.charges('leave-online');
    assert.ok(charges.length);
    const pending = conditional.detail('saturday');
    assert.equal(pending.status,'pending');
    assert.ok(pending.currentEvidence.length);
    const readPath = route + '?requestId=leave-online';
    const ordinary = await login('A001');
    const read = await api(readPath, ordinary);
    assert.equal(read.status,200);
    assert.equal(read.voiding.canVoid,false);
    const body = { requestId:'leave-online', revision:read.voiding.revision, reason:'Verified duplicate', confirm:true };
    assert.equal((await api(route, ordinary, body)).status,403);
    setPermissions(['admin.leave.approvedVoid']);
    const withoutReview = await login('A002');
    assert.equal((await api(readPath, withoutReview)).status,403);
    assert.equal((await api(route, withoutReview, body)).status,403);
    setPermissions(['admin.leave.review','admin.leave.approvedVoid']);
    const delegated = await login('A002');
    assert.equal((await api(readPath, delegated)).voiding.canVoid,true);
    const developer = await login('D001','developer');
    assert.equal((await api('/developer/impersonation/start',developer,{
        targetRole:'admin',targetEmployeeId:'A002',systemPassword:'0000'
    })).status,200);
    assert.equal((await api(readPath,developer)).voiding.canVoid,false);
    assert.equal((await api(route,developer,body)).status,403);
    sql.exec("CREATE TRIGGER fixture_fail_leave_void BEFORE INSERT ON audit_logs WHEN NEW.action='approved_void' BEGIN SELECT RAISE(ABORT,'fixture rollback'); END");
    assert.equal((await api(route, delegated, body)).status,500);
    assert.deepEqual(db.getLeaveRequestById('leave-online'),original);
    assert.deepEqual(conditional.detail('saturday'),pending);
    assert.deepEqual(db.getApprovedRequestVoids().history('leave','leave-online'),[]);
    assert.equal(usedHours(),1);
    sql.exec('DROP TRIGGER fixture_fail_leave_void');
    const saved = await api(route, delegated, body);
    assert.equal(saved.status,200,JSON.stringify(saved));
    assert.equal(saved.voiding.record.status,'cancelled');
    assert.equal(saved.voiding.record.applicantId,'A001');
    assert.equal(saved.voiding.record.voidSummary.reason,body.reason);
    assert.equal(saved.voiding.canVoid,false);
    assert.deepEqual(saved.voiding.history[0].before.accountingDailyHours,charges);
    assert.deepEqual(saved.voiding.history[0].after.accountingDailyHours,charges);
    assert.deepEqual(entitlements.charges('leave-online'),charges);
    assert.equal(usedHours(),0);
    const stillPending = conditional.detail('saturday');
    assert.equal(stillPending.status,'pending');
    assert.deepEqual(stillPending.evidence,pending.evidence);
    assert.deepEqual(stillPending.currentEvidence,[]);
    assert.equal((await api(readPath, ordinary)).voiding.history.length,1);
    assert.equal((await api(route, delegated, body)).status,409);
});
