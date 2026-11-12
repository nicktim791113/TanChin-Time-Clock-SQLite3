const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { startFixture } = require('./fixtures/browser-server');

test('conditional overtime HTTP enforces independent review, scopes, preview acknowledgement and all creation paths', async t => {
    const fixture = await startFixture(), { db, url } = fixture, sql = new Database(fixture.databasePath);
    t.after(async () => { sql.close(); await fixture.close(); });
    db.setSetting('browserSecuritySettings', { deviceBindingEnabled: false, gpsRequiredOnPunch: false });
    db.saveAccountAccessRecord({ employee_id: 'A001', allowed_roles: ['employee','admin'], admin_preset: 'complete_admin', admin_permissions: [] });
    db.saveLeaveApprovalRoutes([{ department: '*', supervisor_id: 'A001', enabled: true }]);
    const grants = db.getSupervisors(), audit = entry => ({ ...entry, actor_id: 'fixture', actor_role: 'system' });
    grants.saveAssignments({ employeeId: 'E001', supervisorIds: ['A001'], reason: 'Fixture authorization', revision: grants.assignmentsState().employees.find(e => e.id === 'E001').revision }, audit);
    async function api(route, token, body) {
        const r = await fetch(url + '/api/browser' + route, { method: body === undefined ? 'GET' : 'POST',
            headers: { 'Content-Type':'application/json', ...(token ? { Authorization:'Bearer '+token } : {}) }, ...(body === undefined ? {} : { body:JSON.stringify(body) }) });
        return { status:r.status, ...await r.json() };
    }
    async function login(id, secret, role = 'employee') {
        let result = await api('/login', '', { employeeId:id, secret, role:'account' });
        assert.equal(result.status,200,JSON.stringify(result));
        if (result.dashboard.role === 'workspace') result = await api('/workspace',result.token,{role});
        return result.token;
    }
    const employee = await login('E001','employee-card'), manager = await login('A001','A001-test-password'), admin = await login('A001','A001-test-password','admin');
    const extra = await login('A002','A002-test-password'), limited = await login('A002','A002-test-password','admin'), backup = await login('D001','D001-test-password');
    db.setSetting('developerImpersonationEnabled',true);
    const developer = await login('D001','D001-test-password','developer');
    const base = '/supervisors/conditional-overtime';
    const types = db.loadLeaveTypes(), type = types.find(item => item.enabled) || types[0];
    const at = (date,time) => Date.parse(`${date}T${time}:00+08:00`);
    function leave(id,date) {
        db.createLeaveRequest({ id, employee_id:'E001', applicant_id:'E001', applicant_role:'self', leave_type_id:type.id,
            start_at:at(date,'09:00'), end_at:at(date,'10:00'), duration_hours:1, reason:'PRIVATE medical details',
            status:'pending_supervisor', supervisor_id:'A001', approval_mode:'self_request', date_selection_mode:'explicit_segments',
            leave_segments:[{startAt:at(date,'09:00'),endAt:at(date,'10:00'),hours:1,breakMinutes:0}], created_at:Date.now(),updated_at:Date.now() });
    }
    const period = date => ({employeeIds:['E001'],startDate:date,endDate:date,startTime:'08:20',endTime:'17:00',breakMinutes:40,breakSource:'automatic_lunch',durationHours:8,reason:'Fixture Saturday work'});
    const initial = await api(base+'/settings',admin);
    assert.equal(initial.settings.enabled,false);
    assert.equal((await api(base+'/settings',employee)).status,403);
    assert.equal((await api(base+'/settings',limited)).status,403);
    const settings = { ...initial.settings, enabled:true,effectiveDate:'2026-11-01',leaveTypeIds:[type.id],reviewerIds:['A002','D001'],reason:'Fixture enable',confirm:true };
    assert.equal((await api(base+'/settings',admin,{...settings,reviewerIds:[]})).status,400);
    assert.equal((await api(base+'/settings',admin,settings)).status,200);
    assert.equal((await api(base+'/settings',admin,settings)).status,409);
    leave('conditional-leave','2026-11-09');
    const body = period('2026-11-14'), {employeeIds,...selfBody} = body;
    const preview = await api(base+'/preview',employee,body);
    assert.equal(preview.status,200,JSON.stringify(preview));
    assert.equal(preview.previews[0].required,true);
    assert.ok(!JSON.stringify(preview).includes('PRIVATE medical'));
    assert.equal((await api(base+'/preview',extra,body)).status,403);
    assert.equal((await api('/employee/overtime/request',employee,selfBody)).status,409);
    const staleDate = '2026-12-12', stalePeriod = period(staleDate), { employeeIds: staleIds, ...staleBody } = stalePeriod;
    leave('withdrawn-after-preview','2026-12-07');
    const stale = await api(base+'/preview',employee,stalePeriod);
    assert.equal(stale.previews[0].required,true);
    db.withdrawLeaveRequest({requestId:'withdrawn-after-preview',withdrawnAt:Date.now()});
    const staleSubmission = await api('/employee/overtime/request',employee,{...staleBody,conditionalReviewFingerprints:{[staleIds[0]]:stale.previews[0].fingerprint}});
    assert.equal(staleSubmission.status,409);
    assert.ok(!db.queryOvertimeRequests({employeeId:'E001',limit:null}).some(row=>row.start_at===at(staleDate,'08:20')));
    const ack = { E001:preview.previews[0].fingerprint };
    const created = await api('/employee/overtime/request',employee,{...selfBody,conditionalReviewFingerprints:ack});
    assert.equal(created.status,200,JSON.stringify(created));
    const id = db.queryOvertimeRequests({employeeId:'E001',limit:null})[0].id;
    assert.equal(db.getOvertimeRequestById(id).status,'pending_supervisor');
    let detail = db.getConditionalOvertimeReview().detail(id);
    assert.equal((await api(base+'/'+id+'/decision',extra,{revision:detail.revision,decision:'approved',comment:'Too early',confirm:true})).status,403);
    assert.equal((await api('/employee/overtime/supervisor-decision',manager,{requestId:id,decision:'approved',comment:'First review'})).status,200);
    assert.equal(db.getOvertimeRequestById(id).status,'pending_additional');
    assert.equal((await api(base+'/inbox',extra)).records.length,1);
    assert.equal((await api(base+'/inbox',backup)).records.length,0);
    const dash = (await api('/dashboard',extra)).dashboard;
    assert.equal(dash.supervisorReview.canUse,true);assert.equal(dash.overtime.additionalQueueCount,1);
    detail = db.getConditionalOvertimeReview().detail(id);
    const decision = {revision:detail.revision,decision:'approved',comment:'Independent review',confirm:true};
    for (const token of [employee,manager,backup]) assert.equal((await api(base+'/'+id+'/decision',token,decision)).status,403);
    assert.equal((await api(base+'/'+id+'/decision',extra,{...decision,comment:''})).status,400);
    assert.equal((await api(base+'/'+id+'/decision',extra,decision)).status,200);
    assert.equal(db.getOvertimeRequestById(id).status,'approved');
    assert.equal((await api(base+'/'+id+'/decision',extra,decision)).status,409);
    const history = await api(base+'/'+id+'/history',employee);
    assert.ok(history.history.length >= 3);assert.ok(history.history.some(e=>e.action==='decision'));
    assert.ok(!JSON.stringify(history).includes('PRIVATE medical'));
    assert.equal((await api(base+'/'+id+'/history',backup)).status,404);

    await t.test('proxy and paper cannot bypass independent review',async()=>{
        for (const [date,leaveDate,route,token,extras] of [
            ['2026-11-21','2026-11-16','/employee/supervisor/overtime',manager,{proxyReason:'Fixture proxy',confirmApproval:true}],
            ['2026-11-28','2026-11-23','/admin/overtime/paper-approved',admin,{paperNo:'QA-only',approvedBy:'Fixture manager'}]
        ]) {
            leave('leave-'+date,leaveDate);
            const p = period(date), checked = await api(base+'/preview',token,p);
            assert.equal((await api(route,token,{...p,...extras})).status,409);
            const result = await api(route,token,{...p,...extras,conditionalReviewFingerprints:{E001:checked.previews[0].fingerprint}});
            assert.equal(result.status,200,JSON.stringify(result));
            const row = db.queryOvertimeRequests({employeeId:'E001',limit:null}).find(row=>row.start_at===at(date,'08:20'));
            assert.equal(row.status,'pending_additional');assert.equal(row.additionalReview.reconciliationRequired,false);
            assert.equal(db.hasOverlappingOvertimeRequest('E001',row.start_at,row.end_at),true);
            if (route === '/admin/overtime/paper-approved') {
                const cancel = route+'/cancel', cancellation = {requestId:row.id};
                const simulated = await api('/developer/impersonation/start',developer,{targetRole:'admin',targetEmployeeId:'A001',systemPassword:'0000'});
                assert.equal(simulated.status,200,JSON.stringify(simulated));
                assert.equal((await api(cancel,developer,cancellation)).status,403);
                assert.equal(db.getOvertimeRequestById(row.id).status,'pending_additional');
                assert.equal((await api('/developer/impersonation/stop',developer,{})).status,200);
                const cancelled = await api(cancel,admin,cancellation);
                assert.equal(cancelled.status,200,JSON.stringify(cancelled));
                const closed = db.getOvertimeRequestById(row.id);
                assert.equal(closed.status,'cancelled');
                assert.equal(closed.additionalReview.status,'cancelled');
                assert.equal(db.getConditionalOvertimeReview().history(row.id).at(-1).action,'cancelled');
                assert.equal(db.hasOverlappingOvertimeRequest('E001',row.start_at,row.end_at),false);
            }
        }
    });
    await t.test('late leave reopens approved overtime and admin can reassign with durable audit',async()=>{
        const date='2026-12-05', p=period(date), {employeeIds,...own}=p;
        assert.equal((await api('/employee/overtime/request',employee,own)).status,200);
        const row=db.queryOvertimeRequests({employeeId:'E001',limit:null}).find(row=>row.start_at===at(date,'08:20'));
        assert.equal((await api('/employee/overtime/supervisor-decision',manager,{requestId:row.id,decision:'approved'})).status,200);
        assert.equal(db.getOvertimeRequestById(row.id).status,'approved');
        for (const token of [employee,manager,admin]) assert.equal((await api(base+'/'+row.id+'/history',token)).status,404);
        leave('late-leave','2026-11-30');
        const saved=db.getOvertimeRequestById(row.id);assert.equal(saved.status,'pending_additional');assert.equal(saved.additionalReview.reconciliationRequired,true);
        const reassigned=await api(base+'/'+row.id+'/reassign',admin,{reviewerIds:['D001'],revision:saved.additionalReview.revision,reason:'Fixture primary unavailable',confirm:true});
        assert.equal(reassigned.status,200,JSON.stringify(reassigned));
        assert.ok((await api(base+'/inbox',backup)).records.some(r=>r.id===row.id));
        assert.equal((await api(base+'/'+row.id+'/history',employee)).history.at(-1).action,'reassign');
        assert.throws(()=>sql.prepare('DELETE FROM overtime_additional_review_events WHERE request_id=?').run(row.id),/immutable/);
        const simulated = await api('/developer/impersonation/start',developer,{targetRole:'employee',targetEmployeeId:'E001',systemPassword:'0000'});
        assert.equal(simulated.status,200,JSON.stringify(simulated));
        const withdrawal = {requestId:row.id};
        assert.equal((await api('/employee/overtime/withdraw',developer,withdrawal)).status,403);
        assert.equal(db.getOvertimeRequestById(row.id).status,'pending_additional');
        assert.equal((await api('/developer/impersonation/stop',developer,{})).status,200);
        assert.equal((await api('/employee/overtime/withdraw',employee,withdrawal)).status,200);
        assert.equal(db.getOvertimeRequestById(row.id).additionalReview.status,'withdrawn');
        const terminal = db.getConditionalOvertimeReview().history(row.id).at(-1);
        assert.equal(terminal.action,'withdrawn');
        assert.equal(terminal.actorId,'E001');
    });
    await t.test('simulated leave writes cannot directly or indirectly change conditional overtime',async()=>{
        const overtimeDate = '2027-01-09';
        const { employeeIds: ignored, ...ownOvertime } = period(overtimeDate);
        assert.equal((await api('/employee/overtime/request',employee,ownOvertime)).status,200);
        const overtime = db.queryOvertimeRequests({employeeId:'E001',limit:null}).find(row=>row.start_at===at(overtimeDate,'08:20'));
        assert.equal((await api('/employee/overtime/supervisor-decision',manager,{requestId:overtime.id,decision:'approved'})).status,200);
        const leaveBody = date => ({
            leaveTypeId:type.id, reason:'Fixture leave for simulation boundary', dateSelectionMode:'explicit_segments',
            leaveSegments:[{startAt:at(date,'09:00'),endAt:at(date,'10:00'),hours:1,breakMinutes:0}]
        });
        const simulate = async (targetRole,targetEmployeeId) => {
            const result = await api('/developer/impersonation/start',developer,{targetRole,targetEmployeeId,systemPassword:'0000'});
            assert.equal(result.status,200,JSON.stringify(result));
        };
        const stop = async () => assert.equal((await api('/developer/impersonation/stop',developer,{})).status,200);
        const own = leaveBody('2027-01-04');
        await simulate('employee','E001');
        const before = db.queryLeaveRequests({employeeId:'E001',limit:null}).length;
        assert.equal((await api('/employee/leave/request',developer,own)).status,403);
        assert.equal(db.queryLeaveRequests({employeeId:'E001',limit:null}).length,before);
        assert.equal(db.getOvertimeRequestById(overtime.id).status,'approved');
        await stop();
        const submitted = await api('/employee/leave/request',employee,own);
        assert.equal(submitted.status,200,JSON.stringify(submitted));
        const pending = db.queryLeaveRequests({employeeId:'E001',limit:null}).find(row=>row.start_at===at('2027-01-04','09:00'));
        const conditionalBefore = db.getConditionalOvertimeReview().detail(overtime.id);
        assert.equal(conditionalBefore.status,'pending');
        await simulate('employee','E001');
        assert.equal((await api('/employee/leave/withdraw',developer,{requestId:pending.id})).status,403);
        assert.equal(db.getLeaveRequestById(pending.id).status,'pending_supervisor');
        assert.deepEqual(db.getConditionalOvertimeReview().detail(overtime.id),conditionalBefore);
        await stop();
        assert.equal((await api('/employee/leave/supervisor-decision',manager,{requestId:pending.id,decision:'approved'})).status,200);
        const paperPath = '/admin/leave/paper-approved';
        const paper = { ...leaveBody('2027-01-11'), employeeIds:['E001'], paperNo:'FIXTURE-LEAVE', approvedBy:'Fixture admin' };
        const paperCreated = await api(paperPath,admin,paper);
        assert.equal(paperCreated.status,200,JSON.stringify(paperCreated));
        const paperRow = db.queryLeaveRequests({employeeId:'E001',limit:null}).find(row=>row.paper_no==='FIXTURE-LEAVE');
        const leaveBefore = db.queryLeaveRequests({employeeId:'E001',limit:null});
        const reviewBefore = db.getConditionalOvertimeReview().detail(overtime.id);
        await simulate('admin','A001');
        for (const [path,body] of [
            [paperPath,{...paper,...leaveBody('2027-01-12')}],
            [paperPath+'/correct',{...paper,requestId:paperRow.id,reason:'Simulated edit'}],
            [paperPath+'/cancel',{requestId:paperRow.id}],
            ['/admin/leave/final-decision',{requestId:pending.id,decision:'approved',comment:'Simulated review'}]
        ]) assert.equal((await api(path,developer,body)).status,403,path);
        assert.deepEqual(db.queryLeaveRequests({employeeId:'E001',limit:null}),leaveBefore);
        assert.deepEqual(db.getConditionalOvertimeReview().detail(overtime.id),reviewBefore);
        await stop();
        assert.equal((await api('/admin/leave/final-decision',admin,{requestId:pending.id,decision:'approved'})).status,200);
        assert.equal(db.getLeaveRequestById(pending.id).status,'approved');
    });
});
