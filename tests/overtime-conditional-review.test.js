'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Database = require('better-sqlite3');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dbModule = require('../database');
const { startFixture } = require('./fixtures/browser-server');

const at = (date,time) => Date.parse(date + 'T' + time + ':00+08:00');
const audit = entry => ({ actor_id:'fixture', actor_role:'admin', ...entry });
function overtime(id, date, details = {}) {
    return {
        id, employee_id:'E001', applicant_id:'E001', applicant_role:'self',
        start_at:at(date,'08:20'), end_at:at(date,'10:20'), duration_hours:2, break_minutes:0,
        reason:'Fixture overtime', status:'pending_supervisor', supervisor_id:'A001', approval_mode:'self_request',
        review_policy:{ supervisorIds:['A001','D001'], requiredSupervisorIds:[], mode:'any' }, created_at:1, updated_at:1, ...details
    };
}
function leave(id, date, details = {}) {
    return {
        id, employee_id:'E001', applicant_id:'E001', leave_type_id:'personal', date_selection_mode:'legacy_range',
        start_at:at(date,'09:00'), end_at:at(date,'10:00'), duration_hours:1, status:'pending_supervisor',
        reason:'Private reason must never be in match evidence', supervisor_id:'A001', approval_mode:'employee_request',
        created_at:1, updated_at:1, ...details
    };
}
const preview = (store,row) => store.preview({employeeId:row.employee_id,applicantId:row.applicant_id,startAt:row.start_at,endAt:row.end_at});
const submission = (store,row) => ({ ...row, conditional_review_fingerprint:preview(store,row).fingerprint });

test('each Saturday uses its own Taipei workweek and excludes lunch, Sundays and company holidays', async t => {
    const fixture = await startFixture(), { db } = fixture;
    t.after(fixture.close);
    const store = db.getConditionalOvertimeReview();
    store.save({enabled:true,effectiveDate:'2026-11-01',leaveTypeIds:['personal'],reviewerIds:['A002'],
        revision:store.state().revision,confirm:true,reason:'Fixture calendar rule'},audit);
    db.createLeaveRequest(leave('first-monday','2026-11-09'));
    db.createLeaveRequest(leave('second-monday','2026-11-16'));
    assert.deepEqual(preview(store,overtime('cross-week','2026-11-14',{end_at:at('2026-11-21','10:20')})).evidence
        .map(({weekSaturday,leaveRequestId})=>[weekSaturday,leaveRequestId]), [
        ['2026-11-14','first-monday'], ['2026-11-21','second-monday']
    ]);
    assert.equal(preview(store,overtime('sunday','2026-11-15')).required,false);
    const calendar = db.getAttendanceCalendar();
    calendar.save({...calendar.state(),exceptions:[{date:'2026-11-23',kind:'offday',note:'Fixture holiday'}],confirm:true,reason:'Fixture holiday'},audit);
    db.createLeaveRequest(leave('holiday','2026-11-23'));
    db.createLeaveRequest(leave('lunch-only','2026-11-24',{
        start_at:at('2026-11-24','12:20'),end_at:at('2026-11-24','13:00'),duration_hours:0.66
    }));
    assert.equal(preview(store,overtime('no-weekday-overlap','2026-11-28')).required,false);
});

test('a legacy nullable applicant remains visible to the additional reviewer after late leave', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(),'tanchin-legacy-conditional-'));
    const filename = path.join(directory,'legacy.db');
    const legacy = new Database(filename);
    legacy.exec(`CREATE TABLE overtime_requests (
        id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, applicant_id TEXT, applicant_role TEXT,
        start_at INTEGER NOT NULL, end_at INTEGER NOT NULL, duration_hours REAL, reason TEXT,
        status TEXT, supervisor_id TEXT, supervisor_decision TEXT, supervisor_comment TEXT,
        supervisor_decided_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        withdrawn_at INTEGER, cancelled_at INTEGER
    )`);
    legacy.prepare(`INSERT INTO overtime_requests
        (id,employee_id,applicant_id,start_at,end_at,duration_hours,status,supervisor_id,supervisor_decision,created_at,updated_at)
        VALUES ('legacy-null','E001',NULL,?, ?,2,'approved','A001','approved',1,1)`)
        .run(at('2026-11-14','08:20'),at('2026-11-14','10:20'));
    legacy.close();
    try {
        dbModule.init(filename);
        dbModule.saveEmployees(['E001','A001','A002'].map(id=>({id,name:id,department:'Fixture',card:'card-'+id})));
        const store = dbModule.getConditionalOvertimeReview();
        store.save({enabled:true,effectiveDate:'2026-11-01',leaveTypeIds:['personal'],reviewerIds:['A001','A002'],
            revision:store.state().revision,confirm:true,reason:'Fixture rule'},audit);
        dbModule.createLeaveRequest(leave('late-legacy','2026-11-09'));
        const row = dbModule.getOvertimeRequestById('legacy-null');
        assert.equal(row.applicant_id,null);
        assert.equal(row.status,'pending_additional');
        assert.deepEqual(row.additionalReview.eligibleReviewerIds,['A002']);
        assert.equal(store.canReview(row,'A001'),false);
        assert.throws(()=>store.decide({requestId:row.id,revision:row.additionalReview.revision,decision:'approved'},'A001',audit),{status:403});
        assert.equal(dbModule.countOvertimeRequests({additionalReviewerId:'A001'}),0);
        assert.equal(store.canReview(row,'A002'),true);
        assert.deepEqual(dbModule.queryOvertimeRequests({additionalReviewerId:'A002'}).map(item=>item.id),[row.id]);
        assert.equal(dbModule.countOvertimeRequests({additionalReviewerId:'A002'}),1);
    } finally {
        dbModule.close();
        for (const file of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory,file));
        fs.rmdirSync(directory);
    }
});

test('conditional Saturday overtime requires the original any supervisor stage and an independent, ordered additional decision', async t => {
    const fixture = await startFixture(), { db } = fixture, sql = new Database(fixture.databasePath);
    t.after(async()=>{sql.close();await fixture.close();});
    const store = db.getConditionalOvertimeReview();
    const initial = store.state();
    const config = { enabled:true,effectiveDate:'2026-11-01',leaveTypeIds:['personal'],reviewerIds:['A001','A002'],revision:initial.revision,confirm:true,reason:'Fixture rule' };
    assert.equal(initial.enabled,false);
    assert.equal(initial.configured,false);
    for (const override of [{leaveTypeIds:[]},{reviewerIds:[]},{reviewerIds:['fake']},{effectiveDate:'2026-02-30'},{confirm:false}]) {
        assert.throws(()=>store.save({...config,...override},audit),{status:400});
    }
    const saved = store.save(config,audit);
    assert.equal(saved.configured,true);
    assert.throws(()=>store.save(config,audit),{status:409});
    db.createLeaveRequest(leave('weekday','2026-11-09'));
    db.createLeaveRequest(leave('lunch','2026-11-10',{start_at:at('2026-11-10','12:20'),end_at:at('2026-11-10','13:00'),duration_hours:0.66}));
    const row = overtime('online','2026-11-14'), matching = preview(store,row);
    assert.equal(matching.required,true);
    assert.deepEqual(matching.evidence.map(item=>item.leaveRequestId),['weekday']);
    assert.equal(matching.evidence[0].status,'pending_supervisor');
    assert.ok(!JSON.stringify(matching).includes('Private reason'));
    assert.equal(preview(store,overtime('old','2026-10-31')).required,false);
    assert.throws(()=>db.createOvertimeRequest(row),{status:409});
    db.createOvertimeRequest(submission(store,row));
    let current = db.getOvertimeRequestById(row.id);
    assert.equal(current.additionalReview.status,'waiting_supervisor');
    assert.equal(store.canReview(current,'A002'),false);
    db.updateOvertimeRequestSupervisorDecision({requestId:row.id,decision:'approved',comment:'Supervisor vote',decidedAt:Date.now(),reviewerId:'A001'});
    current = db.getOvertimeRequestById(row.id);
    assert.equal(current.status,'pending_additional');
    assert.deepEqual(current.additionalReview.eligibleReviewerIds,['A002']);
    assert.equal(current.additionalReview.reconciliationRequired,false);
    assert.equal(db.hasOverlappingOvertimeRequest('E001',row.start_at,row.end_at),true);
    assert.deepEqual(db.queryOvertimeRequests({additionalReviewerId:'A001'}),[]);
    assert.deepEqual(db.queryOvertimeRequests({additionalReviewerId:'A002'}).map(item=>item.id),[row.id]);
    const decision = {requestId:row.id,revision:current.additionalReview.revision,decision:'approved',comment:'Independent'};
    assert.throws(()=>store.decide(decision,'E001',audit),{status:403});
    assert.throws(()=>store.decide(decision,'A001',audit),{status:403});
    assert.throws(()=>store.reassign({...decision,reviewerIds:['A001'],confirm:true,reason:'Cannot reuse first reviewer'},'D001',audit),{status:400});
    const approved = store.decide(decision,'A002',audit);
    assert.equal(approved.status,'approved');
    assert.equal(db.getOvertimeRequestById(row.id).status,'approved');
    assert.equal(db.getReviewWorkflow().state('overtime',row.id).reviewers.find(vote=>vote.id==='A001').decision,'approved');
    assert.throws(()=>store.decide(decision,'A002',audit),{status:409});
    const alternate = overtime('actual-vote-not-listed-first','2026-11-14',{
        start_at:at('2026-11-14','13:00'),end_at:at('2026-11-14','15:00')
    });
    db.createOvertimeRequest(submission(store,alternate));
    db.updateOvertimeRequestSupervisorDecision({
        requestId:alternate.id,decision:'approved',comment:'Other supervisor voted',decidedAt:Date.now(),reviewerId:'D001'
    });
    const alternateRow = db.getOvertimeRequestById(alternate.id);
    assert.equal(alternateRow.supervisor_id,'A001');
    assert.deepEqual(alternateRow.additionalReview.eligibleReviewerIds,['A001']);
    assert.deepEqual(db.queryOvertimeRequests({additionalReviewerId:'A001'}).map(item=>item.id),[alternate.id]);
    const rejected=overtime('supervisor-rejected','2026-11-14',{start_at:at('2026-11-14','10:30'),end_at:at('2026-11-14','12:30')});
    db.createOvertimeRequest(submission(store,rejected));
    db.updateOvertimeRequestSupervisorDecision({requestId:rejected.id,decision:'rejected',comment:'Fixture reject',decidedAt:Date.now(),reviewerId:'A001'});
    assert.equal(store.detail(rejected.id).status,'rejected');
    assert.equal(store.history(rejected.id).at(-1).action,'rejected');
    store.save({...saved,enabled:false,confirm:true,reason:'Disable for new requests'},audit);
    assert.equal(store.detail(row.id).ruleSnapshot.enabled,true);
    assert.equal(store.detail(row.id).ruleRevision,saved.revision);
    db.updateLeaveRequestAdminDecision({requestId:'weekday',decision:'approved',adminId:'D001',decidedAt:Date.now()});
    assert.equal(db.getOvertimeRequestById(row.id).status,'pending_additional');
    assert.equal(store.detail(row.id).reconciliationRequired,true);
    assert.equal(store.detail(row.id).reviewerVotes.length,1);
    const reopened=store.detail(row.id);
    store.decide({requestId:row.id,revision:reopened.revision,decision:'approved'},'A002',audit);
    const corrections=db.getApprovedCorrections(), change=corrections.state('leave','weekday');
    corrections.correct('leave',{requestId:'weekday',revision:change.revision,correctionReason:'Same date timing',confirm:true},
        {start_at:at('2026-11-09','09:15'),end_at:at('2026-11-09','10:15'),duration_hours:1,explicit_duration_hours:1},'D001',audit);
    assert.equal(db.getOvertimeRequestById(row.id).status,'pending_additional');
    assert.equal(store.detail(row.id).reviewerVotes.length,2);
    assert.equal(store.detail(row.id).currentEvidence[0].leaveDate,'2026-11-09');
    assert.ok(store.history(row.id).some(event=>event.action==='decision'));
    assert.throws(()=>sql.exec('DELETE FROM overtime_additional_review_events'),/immutable/);
});

test('late leave reopens a previously approved proxy request, maintains sticky review, and rolls back a related mutation if audit fails',async t=>{
    const fixture=await startFixture(),{db}=fixture,sql=new Database(fixture.databasePath);
    t.after(async()=>{sql.close();await fixture.close();});
    const store=db.getConditionalOvertimeReview();
    store.save({enabled:true,effectiveDate:'2026-11-01',leaveTypeIds:['personal'],reviewerIds:['A001','A002'],revision:store.state().revision,confirm:true,reason:'Fixture'},audit);
    const proxyDetails={applicant_id:'A001',applicant_role:'supervisor_proxy',status:'approved',approval_mode:'supervisor_proxy_auto_approved',supervisor_decision:'approved'};
    const proxy=overtime('proxy','2026-11-21',proxyDetails);
    db.createOvertimeRequest(proxy);
    assert.equal(db.getOvertimeRequestById(proxy.id).status,'approved');
    db.createLeaveRequest(leave('later','2026-11-16'));
    let pending=store.detail(proxy.id);
    assert.equal(db.getOvertimeRequestById(proxy.id).status,'pending_additional');
    assert.equal(pending.reconciliationRequired,true);
    assert.deepEqual(pending.eligibleReviewerIds,['A002']);
    db.withdrawLeaveRequest({requestId:'later',withdrawnAt:Date.now()});
    pending=store.detail(proxy.id);
    assert.equal(pending.status,'pending');
    assert.equal(pending.evidence.length,1);
    assert.deepEqual(pending.currentEvidence,[]);
    const fallback=store.reassign({requestId:proxy.id,revision:pending.revision,reviewerIds:['D001','A002'],confirm:true,reason:'Primary unavailable'},'A001',audit);
    assert.deepEqual(fallback.eligibleReviewerIds,['D001']);
    assert.throws(()=>store.decide({requestId:proxy.id,revision:fallback.revision,decision:'approved'},'A002',audit),{status:403});
    assert.deepEqual(db.queryOvertimeRequests({additionalReviewerId:'A002'}),[]);
    const roster=db.loadEmployees();
    db.saveEmployees(roster.filter(employee=>employee.id!=='D001'));
    db.saveEmployees(roster);
    assert.deepEqual(store.detail(proxy.id).eligibleReviewerIds,['A002']);
    assert.equal(store.canReview(db.getOvertimeRequestById(proxy.id),'D001'),false);
    db.withdrawOvertimeRequest({requestId:proxy.id,withdrawnAt:Date.now(),actorId:'A001'});
    assert.equal(store.detail(proxy.id).status,'withdrawn');
    assert.equal(store.history(proxy.id).at(-1).action,'withdrawn');
    const paper=overtime('paper','2026-11-28',{...proxyDetails,approval_mode:'admin_paper_approved',applicant_role:'admin_paper_proxy'});
    db.createLeaveRequest(leave('paper-trigger','2026-11-23'));
    db.createOvertimeRequest(submission(store,paper));
    assert.equal(db.getOvertimeRequestById(paper.id).status,'pending_additional');
    assert.equal(store.detail(paper.id).reconciliationRequired,false);
    db.cancelPaperOvertimeRequest({requestId:paper.id,cancelledAt:Date.now(),auditLog:audit({action:'cancel',target_id:paper.id})});
    assert.equal(store.detail(paper.id).status,'cancelled');
    assert.equal(store.history(paper.id).at(-1).action,'cancelled');
    const later=overtime('rollback','2026-12-05',proxyDetails);
    db.createOvertimeRequest(later);
    sql.exec("CREATE TRIGGER fail_conditional_audit BEFORE INSERT ON audit_logs WHEN NEW.action='overtime_additional_trigger' BEGIN SELECT RAISE(ABORT,'fixture audit failure'); END");
    assert.throws(()=>db.createLeaveRequest(leave('rolled-back','2026-11-30')),/audit failure/);
    assert.equal(db.getLeaveRequestById('rolled-back'),null);
    assert.equal(db.getOvertimeRequestById(later.id).status,'approved');
    assert.deepEqual(store.history(later.id),[]);
});
