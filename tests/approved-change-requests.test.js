'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Database = require('better-sqlite3');
const { startFixture } = require('./fixtures/browser-server');

test('supervisor proposals are scoped, stale originals stay pending, and actual management changes complete atomically', async t => {
    const fixture = await startFixture(), { db, url } = fixture;
    const sql = new Database(fixture.databasePath);
    t.after(async () => { sql.close(); await fixture.close(); });
    db.setSetting('browserSecuritySettings', { deviceBindingEnabled:false, gpsRequiredOnPunch:false });
    db.setSetting('developerImpersonationEnabled', true);
    const employeePath = '/employee/supervisor/approved-changes';
    const adminPath = '/admin/approved-changes';
    const voidPath = '/admin/overtime/approved-void';
    const correctionPath = '/admin/leave/approved-correction';
    const api = async (path, token, body) => {
        const response = await fetch(url + '/api/browser' + path, {
            method: body ? 'POST' : 'GET',
            headers:{ 'Content-Type':'application/json', ...(token ? { Authorization:'Bearer ' + token } : {}) },
            body:body ? JSON.stringify(body) : undefined
        });
        return { status:response.status, ...await response.json() };
    };
    const login = async (id, role) => {
        const account = await api('/login','',{ employeeId:id, secret:id === 'E001' ? 'employee-card' : id + '-test-password', role:'account' });
        assert.equal(account.status,200,JSON.stringify(account));
        const selected = account.dashboard.role === 'workspace' ? await api('/workspace',account.token,{ role }) : account;
        assert.equal(selected.status,200,JSON.stringify(selected));
        return selected;
    };
    const start = Date.parse('2036-01-02T18:00:00+08:00');
    for (const [offset, id, approvalMode] of [[0,'proxy','supervisor_proxy_auto_approved'],[1,'paper','admin_paper_approved'],[2,'unrelated','self_request']]) {
        const startAt = start + offset * 86400000;
        const proxy = id === 'proxy';
        db.createOvertimeRequest({
            id, employee_id:'E001', applicant_id:proxy ? 'A001' : 'E001', applicant_role:proxy ? 'supervisor_proxy' : 'self',
            supervisor_id:proxy ? 'A001' : 'A002', approval_mode:approvalMode, status:'approved', reason:'Overtime original',
            start_at:startAt, end_at:startAt+7200000, duration_hours:2, break_minutes:0, created_at:1, updated_at:1
        });
    }
    db.createLeaveRequest({
        id:'leave', employee_id:'E001', applicant_id:'E001', applicant_role:'self', supervisor_id:'A001',
        approval_mode:'employee_request', status:'pending_supervisor', leave_type_id:'personal', reason:'Leave original',
        start_at:start-9*3600000, end_at:start-8*3600000, duration_hours:1, created_at:1, updated_at:1,
        review_policy:{supervisorIds:['A001'],requiredSupervisorIds:[],mode:'any'}
    });
    db.updateLeaveRequestSupervisorDecision({requestId:'leave',reviewerId:'A001',decision:'approved',comment:'Original review',decidedAt:2});
    sql.prepare("UPDATE leave_requests SET status='approved' WHERE id='leave'").run();
    const historicalSupervisor = await login('A001','employee');
    assert.equal(historicalSupervisor.dashboard.supervisorReview.canUse,true);
    assert.equal(historicalSupervisor.dashboard.supervisorReview.count,0);
    const supervisor = historicalSupervisor.token;
    const self = (await login('E001','employee')).token;
    const ordinary = (await login('A001','admin')).token;
    db.saveAccountAccessRecord({ employee_id:'A002', allowed_roles:['employee','admin'], admin_preset:'custom',
        admin_permissions:['admin.leave.review','admin.leave.approvedCorrect','admin.overtime.view','admin.overtime.approvedVoid','admin.overtime.approvedCorrect'] });
    const delegated = (await login('A002','admin')).token;
    const developer = (await login('D001','developer')).token;
    assert.equal((await api('/developer/impersonation/start',developer,{targetRole:'employee',targetEmployeeId:'A001',systemPassword:'0000'})).status,200);
    const source = (kind,id,token = supervisor) => api(employeePath + '?kind=' + kind + '&requestId=' + id,token);
    const draft = async (kind,requestId,action) => {
        const result = await source(kind,requestId);
        assert.equal(result.status,200,JSON.stringify(result));
        return { kind, requestId, action, revision:result.changeRequest.revisions[action], reason:'Source needs correction', confirm:true,
            ...(action === 'correction' ? { proposal:'Correct recorded request reason' } : {}) };
    };
    assert.equal((await source('overtime','proxy',self)).status,403);
    assert.equal((await source('overtime','unrelated')).status,403);
    assert.equal((await source('overtime','paper')).status,403);
    const first = await draft('overtime','proxy','void');
    assert.equal((await source('overtime','proxy',developer)).changeRequest.canRequest,false);
    assert.equal((await api(employeePath,developer,first)).status,403);
    assert.equal((await api(employeePath,self,first)).status,403);
    assert.equal((await api(employeePath,supervisor,{...first,confirm:false})).status,400);
    const submitted = await api(employeePath,supervisor,first);
    assert.equal(submitted.status,200,JSON.stringify(submitted));
    const pending = submitted.changeRequest;
    assert.equal(pending.status,'pending');
    assert.equal(db.getOvertimeRequestById('proxy').status,'approved');
    assert.equal((await api(employeePath,supervisor,first)).status,409);
    assert.equal((await api(employeePath,self)).summary.total,0);
    assert.equal((await api(employeePath + '?kind=leave',supervisor)).summary.total,0);
    assert.equal((await api(employeePath + '?kind=overtime&id=' + pending.id,supervisor)).changeRequest.id,pending.id);
    assert.equal((await api(employeePath + '?kind=overtime&id=' + pending.id,self)).status,404);
    assert.equal((await source('overtime','proxy')).changeRequest.pending.id,pending.id);
    assert.equal((await api(adminPath + '?kind=overtime&status=pending&query=E001',ordinary)).summary.pendingTotalCount,1);
    assert.equal((await api(adminPath + '?kind=overtime&status=pending&query=Test%20Employee',ordinary)).requests[0].id,pending.id);
    assert.deepEqual((await api(adminPath + '?kind=overtime&status=closed',ordinary)).summary,{total:0,pendingTotalCount:1});
    const details = await api(adminPath + '?id=' + pending.id,ordinary);
    assert.equal(details.changeRequest.canManage,false);
    const finish = { id:pending.id, revision:pending.revision, decision:'close', reason:'Outside change', confirm:true };
    assert.equal((await api(adminPath + '/resolve',ordinary,finish)).status,403);
    assert.equal((await api(adminPath + '/resolve',delegated,{...finish,reason:' '})).status,400);
    assert.equal((await api(adminPath + '/resolve',delegated,{...finish,revision:'stale'})).status,409);
    const mutate = async (path,id,extra) => {
        const current = await api(path + '?requestId=' + id,delegated);
        return api(path,delegated,{ requestId:id, revision:(current.correction || current.voiding).revision, confirm:true, ...extra });
    };
    const otCorrection = '/admin/overtime/approved-correction';
    assert.equal((await mutate(otCorrection,'proxy',{correctionReason:'Revision changed separately',reason:'New overtime reason'})).status,200);
    assert.equal((await api(adminPath + '?id=' + pending.id,delegated)).changeRequest.readyToComplete,false);
    assert.equal((await mutate(voidPath,'proxy',{reason:'Should fail stale case',changeRequestId:pending.id})).status,409);
    assert.equal((await api(adminPath + '/resolve',delegated,finish)).changeRequest.status,'closed');
    const replacement = (await api(employeePath,supervisor,await draft('overtime','proxy','void'))).changeRequest;
    const approvedVoid = await mutate(voidPath,'proxy',{reason:'Duplicate booking verified',changeRequestId:replacement.id});
    assert.equal(approvedVoid.status,200,JSON.stringify(approvedVoid));
    assert.equal(approvedVoid.changeRequest.status,'completed');
    assert.equal(approvedVoid.changeRequest.history.at(-1).after.status,'cancelled');

    const leave = (await api(employeePath,supervisor,await draft('leave','leave','correction'))).changeRequest;
    const changes = {correctionReason:'Supported by submitted record',reason:'Corrected leave reason',changeRequestId:leave.id};
    const unchanged = await mutate(correctionPath,'leave',{...changes,reason:'Leave original'});
    assert.equal(unchanged.status,409);
    assert.match(unchanged.error,/未有實質修改/);
    assert.equal(db.getApprovedCorrections().history('leave','leave').length,0);
    assert.equal((await api(adminPath + '?id=' + leave.id,delegated)).changeRequest.status,'pending');
    sql.exec("CREATE TRIGGER fixture_fail_case_completion BEFORE INSERT ON audit_logs WHEN NEW.action='approved_change_completed' BEGIN SELECT RAISE(ABORT,'fixture rollback'); END");
    assert.equal((await mutate(correctionPath,'leave',changes)).status,500);
    assert.equal(db.getLeaveRequestById('leave').reason,'Leave original');
    assert.equal(db.getApprovedCorrections().history('leave','leave').length,0);
    assert.equal((await api(adminPath + '?id=' + leave.id,delegated)).changeRequest.status,'pending');
    sql.exec('DROP TRIGGER fixture_fail_case_completion');
    const corrected = await mutate(correctionPath,'leave',changes);
    assert.equal(corrected.status,200,JSON.stringify(corrected));
    assert.equal(corrected.changeRequest.history.at(-1).before.reason,'Leave original');
    assert.equal(corrected.changeRequest.history.at(-1).after.reason,'Corrected leave reason');
    assert.equal(corrected.changeRequest.handlerId,'A002');
    assert.equal(corrected.correction.record.status,'approved');
    assert.equal((await api(adminPath + '?kind=leave&status=completed',delegated)).summary.pendingTotalCount,0);
    assert.throws(() => sql.exec('DELETE FROM approved_change_events'),/immutable/);

    const assignments = db.getSupervisors();
    assignments.saveAssignments({
        employeeId:'E001', supervisorIds:['A002'], reason:'Proxy assignment only',
        revision:assignments.assignmentsState().employees.find(row => row.id === 'E001').revision
    }, entry => ({ actor_id:'A001',actor_role:'admin', ...entry }));
    const proxyOnly = await login('A002','employee');
    assert.equal(proxyOnly.dashboard.supervisorReview.canUse,true);
    assert.equal(proxyOnly.dashboard.supervisorReview.count,0);
    const calendar = await api('/employee/leave/calendar?scope=review&month=2036-01&status=approved',proxyOnly.token);
    assert.equal(calendar.status,200,JSON.stringify(calendar));
    const approved = calendar.calendar.detail.records.find(row => row.id === 'leave');
    assert.equal(approved.calendarActions.changeRequest,true);
    assert.equal(approved.calendarActions.review,'');
    assert.equal((await api('/employee/leave/supervisor-decision',proxyOnly.token,{
        requestId:'leave',decision:'approved'
    })).status,403);
});
