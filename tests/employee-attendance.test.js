'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Database = require('better-sqlite3');
const { attendanceMonth, buildEmployeeAttendance } = require('../employee-attendance');
const { punchHistoryWindow } = require('../employee-browser-settings');
const { startFixture } = require('./fixtures/browser-server');

const at = (date, time = '00:00') => Date.parse(date + 'T' + time + '+08:00');
const punch = (date, time, type, status = '正常') => ({ timestamp: at(date, time), type, status, source: 'manual' });
const request = (id, start_at, end_at, details = {}) => ({ id, start_at, end_at, status: 'approved', ...details });
const day = (date, inputs = {}) => {
    const historyWindow = punchHistoryWindow('current_previous_month', inputs.now ?? at('2026-11-12', '15:00'));
    return buildEmployeeAttendance({
        range: attendanceMonth(date.slice(0, 7), historyWindow), historyWindow,
        calendar: { workdays: [1, 2, 3, 4, 5], exceptions: inputs.exceptions ?? [], configured: Boolean(inputs.exceptions) },
        punches: (inputs.punches ?? []).sort((a, b) => a.timestamp - b.timestamp),
        leaveRequests: inputs.leave ?? [], overtimeRequests: inputs.overtime ?? [], leaveTypes: []
    }).days.find(row => row.date === date);
};

test('continuous work and approved overtime use the same pair without counting early arrival, late exit or regular overlap', () => {
    const date = '2026-11-09';
    const result = day(date, {
        punches: [punch(date,'08:15','in'), punch(date,'08:15:30','out','重複打卡'), punch(date,'19:10','out')],
        overtime: [
            request('inside', at(date,'14:00'), at(date,'15:00'), { duration_hours: 1, break_minutes: 0 }),
            request('outside', at(date,'17:00'), at(date,'19:01'), { duration_hours: 1.51, break_minutes: 30 }),
            request('pending', at(date,'20:00'), at(date,'21:00'), { status: 'pending_supervisor', duration_hours: 1, break_minutes: 0 }),
            request('additional', at(date,'21:00'), at(date,'22:00'), { status: 'pending_additional', duration_hours: 1, break_minutes: 0 })
        ]
    });
    assert.equal(result.status, 'completed');
    assert.deepEqual([result.lateMinutes,result.earlyMinutes], [0,0]);
    assert.equal(result.punches[1].excluded, true);
    assert.equal(result.overtime.status,'completed');
    assert.deepEqual([result.overtime.approvedMinutes,result.overtime.coveredMinutes,result.overtime.lateMinutes,result.overtime.earlyMinutes], [91,91,0,0]);
    assert.equal(result.overtime.pendingCount,2);
    const additional = result.overtime.requests.find(row => row.id === 'additional');
    assert.equal(additional.status, 'pending_additional');
    assert.equal(additional.assessmentStatus, 'pending');
    assert.equal(additional.approvedMinutes, null);
    assert.equal(result.overtime.requests.find(row => row.id === 'inside').assessmentStatus,'normal_overlap');
});

test('normal day subtracts lunch and precise approved leave and distinguishes legacy uncertainty and open or ambiguous punches', () => {
    const date = '2026-11-10';
    const exact = request('precise',at(date,'08:20'),at(date,'09:20'),{
        date_selection_mode:'explicit_segments', leave_segments:[{id:'segment',date,startAt:at(date,'08:20'),endAt:at(date,'09:20'),hours:1,breakMinutes:0}]
    });
    const result = day(date, {punches:[punch(date,'13:10:45','in'),punch(date,'16:45:15','out')],leave:[exact,{...exact,id:'pending',status:'pending_admin'}]});
    assert.deepEqual([result.lateMinutes,result.earlyMinutes], [190,14]);
    assert.equal(result.leave.pendingCount,1);
    assert.equal(result.requiredSegments[0].startAt,at(date,'09:20'));
    const legacy = request('legacy',at(date,'08:20'),at('2026-11-11','17:00'),{date_selection_mode:'legacy_range',duration_hours:30});
    const old = day(date,{punches:[punch(date,'08:20','in'),punch(date,'17:00','out')],leave:[legacy]});
    assert.equal(old.leave.uncertain,true);
    assert.equal(old.lateMinutes,null);
    const today = day('2026-11-12',{punches:[punch('2026-11-12','08:32:59','in')]});
    assert.deepEqual([today.status,today.lateMinutes,today.earlyMinutes],['in_progress',12,null]);
    const missing = day(date,{punches:[punch(date,'17:00','out')]});
    assert.deepEqual([missing.status,missing.lateMinutes,missing.earlyMinutes],['unknown',null,null]);
    assert.ok(missing.issues.includes('missing_in'));
    const ambiguous = day(date,{punches:[punch(date,'08:25','in'),punch(date,'09:00','in'),punch(date,'17:00','out')]});
    assert.equal(ambiguous.status,'unknown');
    assert.ok(ambiguous.issues.includes('ambiguous_punches'));
    const abnormal = day(date,{punches:[punch(date,'08:20','in'),{...punch(date,'17:00','out'),risk_flags:['gps_accuracy_warning']}]});
    assert.equal(abnormal.status,'unknown');
    assert.equal(abnormal.punches[1].reason,'abnormal_punch');
    assert.ok(abnormal.issues.includes('abnormal_punch'));
});

test('offday and overnight overtime retain wall-clock boundaries and refuse to allocate unlocated rest', () => {
    const date = '2026-11-08';
    const overtime = request('cross',at(date,'22:00'),at('2026-11-09','02:00'),{break_minutes:30,duration_hours:3.5});
    const inputs = {punches:[punch(date,'22:10','in'),punch('2026-11-09','01:45','out')],overtime:[overtime]};
    const sunday = day(date,inputs);
    const monday = day('2026-11-09',inputs);
    assert.equal(sunday.status,'offday');
    assert.deepEqual([sunday.overtime.lateMinutes,monday.overtime.earlyMinutes],[null,null]);
    assert.ok(sunday.overtime.issues.includes('unlocated_overtime_rest'));
    assert.deepEqual([sunday.overtime.approvedMinutes,sunday.overtime.coveredMinutes,monday.overtime.coveredMinutes],[null,null,null]);
    const noRest = day(date,{...inputs,overtime:[{...overtime,break_minutes:0,duration_hours:4}]});
    assert.deepEqual([noRest.overtime.approvedMinutes,noRest.overtime.coveredMinutes],[120,110]);
    assert.equal(noRest.overtime.lateMinutes,10);
    assert.equal(day('2026-11-09',{...inputs,overtime:[{...overtime,break_minutes:0,duration_hours:4}]}).overtime.earlyMinutes,15);
    const weekend = day(date,{
        punches:[punch(date,'13:10','in'),punch(date,'17:00','out')],
        overtime:[request('weekend',at(date,'08:20'),at(date,'17:00'),{break_minutes:40,duration_hours:8})]
    });
    assert.deepEqual([weekend.overtime.approvedMinutes,weekend.overtime.lateMinutes,weekend.overtime.earlyMinutes],[480,null,0]);
    const auto = request('auto-weekend',at(date,'08:20'),at(date,'17:00'),{break_minutes:40,break_source:'automatic_lunch',duration_hours:8});
    const morning = day(date,{punches:[punch(date,'08:25','in'),punch(date,'17:00','out')],overtime:[auto]});
    assert.deepEqual([morning.overtime.approvedMinutes,morning.overtime.lateMinutes,morning.overtime.earlyMinutes,morning.overtime.coveredMinutes],[480,5,0,475]);
    const afternoon = day(date,{punches:[punch(date,'13:10','in'),punch(date,'17:00','out')],overtime:[auto]});
    assert.deepEqual([afternoon.overtime.lateMinutes,afternoon.overtime.coveredMinutes],[250,230]);
    const moved = day(date,{exceptions:[{date,kind:'workday',note:'補班'}]});
    assert.equal(moved.isWorkday,true);
    assert.equal(moved.calendarNote,'補班');
});

test('attendance month intersects Taipei policy, including a seven-day window crossing month/year boundaries', () => {
    const now = at('2027-01-02','00:00');
    const week = punchHistoryWindow('recent7',now);
    assert.deepEqual(attendanceMonth('2026-12',week),{month:'2026-12',start:at('2026-12-27'),end:at('2027-01-01')});
    assert.equal(attendanceMonth('2027-01',week).end,now+1);
    assert.throws(()=>attendanceMonth('2027-02',week),{status:403});
    assert.throws(()=>attendanceMonth('2026-12',punchHistoryWindow('current_month',now)),{status:403});
    assert.equal(attendanceMonth('2026-12',punchHistoryWindow('current_previous_month',now)).start,at('2026-12-01'));
    assert.throws(()=>attendanceMonth(['2027-01'],week),{status:400});
});

test('attendance HTTP scopes to the session employee and authorized dates, and calendar writes enforce permissions, CAS, audit rollback and simulation', async t => {
    const fixture = await startFixture(), { db, url } = fixture;
    const sql = new Database(fixture.databasePath);
    t.after(async () => { sql.close(); await fixture.close(); });
    db.setSetting('browserSecuritySettings',{deviceBindingEnabled:false,gpsRequiredOnPunch:false});
    const api = async (route, token, body) => {
        const response = await fetch(url+'/api/browser'+route,{
            method: body ? 'POST' : 'GET', headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+token },
            ...(body ? {body:JSON.stringify(body)} : {})
        });
        return {status:response.status,...await response.json()};
    };
    const login = async (id, role) => {
        const account = await api('/login','',{employeeId:id,secret:id+'-test-password',role:'account'});
        return (await api('/workspace',account.token,{role})).token;
    };
    const employee = await login('A001','employee'), admin = await login('A001','admin'), limited = await login('A002','admin');
    const attendance = '/employee/attendance', calendar = '/admin/attendance-calendar';
    const now = Date.now(), date = new Date(now + 8 * 3600000 - 86400000).toISOString().slice(0,10);
    const month = date.slice(0,7), beforeMonth = new Date(now + 8 * 3600000 - 40 * 86400000).toISOString().slice(0,7);
    db.addPunchRecord({id:'A001',...punch(date,'08:20','in'),shift:'day',ip_address:'PRIVATE'});
    db.addPunchRecord({id:'A002',...punch(date,'08:21','in'),shift:'day'});
    for (let index=0; index<81; index++) {
        db.createOvertimeRequest({
            id:'fixture-ot-'+index,employee_id:'A001',applicant_id:'A001',applicant_role:'self',start_at:at(date,'17:00'),end_at:at(date,'18:00'),
            duration_hours:1,break_minutes:0,reason:'Fixture own',status:'pending_supervisor',supervisor_id:'A002',approval_mode:'self_request',created_at:1,updated_at:1
        });
    }
    db.createOvertimeRequest({
        id:'other-ot',employee_id:'A002',applicant_id:'A001',applicant_role:'supervisor_proxy',start_at:at(date,'17:00'),end_at:at(date,'18:00'),
        duration_hours:1,break_minutes:0,reason:'Fixture other employee',status:'approved',supervisor_id:'A001',approval_mode:'supervisor_proxy_auto_approved',created_at:1,updated_at:1
    });
    const found = await api(attendance+'?month='+month,employee);
    assert.equal(found.status,200,JSON.stringify(found));
    const row = found.attendance.days.find(item=>item.date===date);
    assert.equal(row.punches.length,1);
    assert.equal(row.punches[0].timestamp,at(date,'08:20'));
    assert.ok(!JSON.stringify(found).includes('PRIVATE'));
    assert.equal(row.overtime.pendingCount,81);
    assert.equal(row.overtime.approvedCount,0);
    assert.equal(db.getOvertimeRequestById('fixture-ot-0').break_source,null);
    assert.equal((await api(attendance+'?month='+beforeMonth,employee)).status,403);
    assert.equal((await api(attendance+'?employeeId=A002',employee)).status,400);
    assert.equal((await api(attendance,admin)).status,403);
    assert.equal((await api(calendar,limited)).status,403);
    assert.equal((await api(calendar,employee)).status,403);
    const initial=(await api(calendar,admin)).calendar;
    assert.deepEqual(initial.workdays,[1,2,3,4,5]);
    assert.equal(initial.configured,false);
    const body={revision:initial.revision,workdays:[1,2,3,4,5],exceptions:[{date,kind:'offday',note:'Fixture closure'}],reason:'Fixture policy',confirm:true};
    assert.equal((await api(calendar,admin,{...body,exceptions:[body.exceptions[0],body.exceptions[0]]})).status,400);
    const saved=await api(calendar,admin,body);
    assert.equal(saved.status,200,JSON.stringify(saved));
    assert.equal((await api(calendar,admin,body)).status,409);
    assert.equal((await api(attendance+'?month='+month,employee)).attendance.days.find(item=>item.date===date).status,'offday');
    assert.equal(sql.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='attendance_calendar_update'").get().n,1);
    sql.exec("CREATE TRIGGER fixture_calendar_audit BEFORE INSERT ON audit_logs WHEN NEW.action='attendance_calendar_update' BEGIN SELECT RAISE(ABORT,'fixture audit failure'); END");
    assert.equal((await api(calendar,admin,{...body,revision:saved.calendar.revision,exceptions:[]})).status,500);
    assert.deepEqual((await api(calendar,admin)).calendar,saved.calendar);
    const audit = entry => ({actor_id:'fixture',...entry});
    const reviewers = db.getReviewSupervisors();
    reviewers.saveBatch({employeeIds:['A001'],supervisorId:'A002',confirmReview:true,reason:'Fixture reviewer',
        revisions:{A001:reviewers.state().employees.find(item=>item.id==='A001').revision}},audit);
    const grants = db.getSupervisors();
    grants.saveAssignments({employeeId:'A002',supervisorIds:['A001'],reason:'Fixture proxy',
        revision:grants.assignmentsState().employees.find(item=>item.id==='A002').revision},audit);
    const submitted = {startDate:'2035-04-01',endDate:'2035-04-01',startTime:'08:20',endTime:'17:00',
        breakMinutes:40,breakSource:'automatic_lunch',reason:'Fixture automatic lunch'};
    assert.equal((await api('/employee/overtime/request',employee,{...submitted,breakMinutes:39})).status,400);
    assert.equal((await api('/employee/overtime/request',employee,{...submitted,startTime:'12:21'})).status,400);
    assert.equal((await api('/employee/overtime/request',employee,submitted)).status,200);
    const self = db.queryOvertimeRequests({employeeId:'A001',limit:null}).find(item=>item.reason===submitted.reason);
    assert.equal(self.break_source,'automatic_lunch');
    const proxy = await api('/employee/supervisor/overtime',employee,{...submitted,employeeIds:['A002'],proxyReason:'Fixture authorization',confirmApproval:true});
    assert.equal(proxy.status,200,JSON.stringify(proxy));
    assert.equal(db.queryOvertimeRequests({employeeId:'A002',limit:null}).find(item=>item.reason===submitted.reason).break_source,'automatic_lunch');
    const paperPath = '/admin/overtime/paper-approved';
    const paperBody = {...submitted,startDate:'2035-04-02',endDate:'2035-04-02',employeeIds:['A001'],paperNo:'AUTO-TEST',approvedBy:'Fixture'};
    assert.equal((await api(paperPath,admin,paperBody)).status,200);
    const paper = db.queryOvertimeRequests({employeeId:'A001',limit:null}).find(item=>item.paper_no==='AUTO-TEST');
    assert.equal(paper.break_source,'automatic_lunch');
    const {breakSource, ...correctablePaper} = paperBody;
    const paperCorrection = await api(paperPath+'/correct',admin,{...correctablePaper,requestId:paper.id,startTime:'08:25'});
    assert.equal(paperCorrection.status,200,JSON.stringify(paperCorrection));
    assert.equal(db.getOvertimeRequestById(paper.id).break_source,null);
    db.setSetting('systemPassword','calendar-fixture');db.setSetting('developerImpersonationEnabled',true);
    const developer=await login('D001','developer');
    assert.equal((await api('/developer/impersonation/start',developer,{targetRole:'admin',targetEmployeeId:'A001',systemPassword:'calendar-fixture'})).status,200);
    assert.equal((await api(calendar,developer)).calendar.canEdit,false);
    assert.equal((await api(calendar,developer,{...body,revision:saved.calendar.revision})).status,403);
});
