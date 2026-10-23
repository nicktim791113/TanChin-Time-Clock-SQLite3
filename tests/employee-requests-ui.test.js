const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadUi() {
    const state = { token: 'session-E001', employeeWorkspacePanel: 'leave', dashboard: { role: 'employee', user: { id: 'E001', name: 'Employee' }, leave: { leaveTypes: [{ id: 'annual', name: '特休' }], historyWindow: { earliestMonth: '2026-01' } }, overtime: { historyWindow: { earliestMonth: '2026-01' } } } };
    const requests = [], pending = [], listeners = {}, confirmations = [], messages = [];
    const document = { activeElement: null, getElementById() { return null; }, querySelectorAll() { return []; }, addEventListener(type, handler) { (listeners[type] ||= []).push(handler); } };
    const context = vm.createContext({ state, document, window: { matchMedia() { return { matches: false, addEventListener() {} }; }, addEventListener() {}, confirm(message) { confirmations.push(message); return true; } },
        escapeHtml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }, URLSearchParams,
        renderDashboard(dashboard) { state.dashboard = dashboard; }, postRenderSetup() {}, handleDashboardClick() {}, handleDashboardSubmit() {},
        handleLogout() { state.token = ''; state.dashboard = null; }, ui: { dashboardMessage: {} }, setMessage(_node, message) { messages.push(message); },
        requestJson(route, options) { requests.push({ route, options }); return new Promise((resolve, reject) => pending.push({ resolve, reject })); } });
    for (const file of ['leave-days.js', 'employee-requests.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../browser-client', file), 'utf8'), context);
    const run = (expression) => vm.runInContext(expression, context);
    run('renderDashboard(state.dashboard)');
    return { run, state, requests, pending, confirmations, messages, context, listeners };
}
function calendar({ id = 'one', month = '2026-10', page = 1 } = {}) { return { month, totalCount: 1, days: [], events: [], detail: { records: [{ id }], page, totalPages: 1, totalCount: 1 } }; }
function input(ui, expression, field, value, row = null) {
    ui.context.target = { dataset: { kind: expression, ...(row === null ? { erField: field } : { erRowField: field, row: String(row) }) }, value, closest() { return null; } };
    ui.run('erUpdateDraftInput(target)');
}

test('leave reason is mandatory and lunch options are scoped, default checked, editable and participant-only', async () => {
    const ui = loadUi();
    ui.run("erState('leave').draft=erNewDraft('leave'); erState('leave').draft.rows=[erNewRow(erState('leave').draft,'2035-01-02')]");
    assert.throws(() => ui.run("erBuildPayload('leave',erState('leave').draft)"), /請填寫請假事由/);
    input(ui, 'leave', 'reason', 'Family care');
    const load = ui.run('erLoadMealOptions()');
    assert.equal(ui.requests[0].route, '/api/browser/employee/leave/meal-options');
    assert.deepEqual(JSON.parse(JSON.stringify(ui.requests[0].options.body.employeeIds)), ['E001']);
    ui.pending[0].resolve({ options: [
        { employeeId: 'E001', date: '2035-01-02', participates: true, serving: true, canChange: true, eating: true },
        { employeeId: 'E001', date: '2035-01-03', participates: false, serving: true, canChange: false, eating: false },
        { employeeId: 'E001', date: '2035-01-04', participates: true, serving: true, canChange: false, eating: true, reason: '已截止' }
    ] }); await load;
    const html = ui.run("renderLeaveMealOptions(erState('leave').draft)");
    assert.match(html, /2035-01-02[\s\S]*當天不用餐/); assert.match(html, /checked/); assert.match(html, /leave-meal-choice/);
    assert.doesNotMatch(html, /2035-01-03/); assert.match(html, /disabled[\s\S]*2035-01-04/);
    let body = JSON.parse(ui.run("JSON.stringify(erBuildPayload('leave',erState('leave').draft))"));
    assert.deepEqual(body.mealOptOuts, [{ employeeId: 'E001', date: '2035-01-02' }]);
    ui.run("leaveMealState(erState('leave').draft).selected['E001/2035-01-02']=false");
    body = JSON.parse(ui.run("JSON.stringify(erBuildPayload('leave',erState('leave').draft))")); assert.deepEqual(body.mealOptOuts, []);
    ui.run("state.dashboard.impersonation={active:true}; leaveMealState(erState('leave').draft).selected['E001/2035-01-02']=true");
    assert.match(ui.run("renderLeaveMealOptions(erState('leave').draft)"), /身份模擬不能修改午餐/);
    assert.deepEqual(JSON.parse(ui.run("JSON.stringify(erBuildPayload('leave',erState('leave').draft).mealOptOuts)")), []);
});

test('lunch eligibility ignores stale dates and accounts and preserves an explicit unchecked choice', async () => {
    const ui = loadUi();
    ui.run("erState('leave').draft=erNewDraft('leave'); erState('leave').draft.reason='Care'; erState('leave').draft.rows=[erNewRow(erState('leave').draft,'2035-01-02')]");
    const first = ui.run('erLoadMealOptions()');
    ui.run("erState('leave').draft.rows[0].date='2035-01-03'"); const second = ui.run('erLoadMealOptions()');
    ui.pending[1].resolve({ options: [{ employeeId: 'E001', date: '2035-01-03', participates: true, serving: true, canChange: true, eating: true }] }); await second;
    ui.pending[0].resolve({ options: [{ employeeId: 'E001', date: '2035-01-02', participates: true, serving: true, canChange: true, eating: true }] }); await first;
    assert.equal(ui.run("leaveMealState(erState('leave').draft).options[0].date"), '2035-01-03');
    ui.run("leaveMealState(erState('leave').draft).selected['E001/2035-01-03']=false");
    const refresh = ui.run('erLoadMealOptions(true)'); ui.pending[2].resolve({ options: [{ employeeId: 'E001', date: '2035-01-03', participates: true, serving: true, canChange: true, eating: true }] }); await refresh;
    assert.equal(ui.run("erBuildPayload('leave',erState('leave').draft).mealOptOuts.length"), 0);
    const stale = ui.run('erLoadMealOptions(true)');
    ui.run("state.token='other'; renderDashboard({...state.dashboard,user:{id:'E002'}}); erState('leave').draft=erNewDraft('leave')");
    ui.pending[3].resolve({ options: [{ employeeId: 'E001', date: '2035-01-03', participates: true }] }); await stale;
    assert.equal(ui.run("leaveMealState(erState('leave').draft).options.length"), 0);
});

test('employee calendar sends disjoint leave segments as one exact request without filling gaps', () => {
    const ui = loadUi();
    ui.run("erState('leave').draft=erNewDraft('leave'); erState('leave').draft.reason='Test leave reason'; erState('leave').draft.rows=[{date:'2026-10-26',startTime:'09:00',endTime:'12:00',hours:'3'},{date:'2026-10-28',startTime:'14:00',endTime:'17:30',hours:'2.5'}]");
    const body = JSON.parse(ui.run("JSON.stringify(erBuildPayload('leave',erState('leave').draft))"));
    assert.equal(body.durationHours, 5.5); assert.equal(body.dateSelectionMode, 'explicit_segments');
    assert.deepEqual(body.dailyHours, [{ date: '2026-10-26', hours: 3 }, { date: '2026-10-28', hours: 2.5 }]);
    assert.equal(body.leaveSegments.length, 2); assert.equal(body.startDate, '2026-10-26'); assert.equal(body.endDate, '2026-10-28');
    ui.run("erState('leave').draft.rows.push({date:'2026-10-26',startTime:'11:00',endTime:'14:00',hours:'3'})");
    assert.throws(() => ui.run("erBuildPayload('leave',erState('leave').draft)"), /重疊/);
});

test('automatic hours never exceed minute intervals and manual adjustments survive later edits', () => {
    const ui = loadUi();
    for (let minutes = 1; minutes < 60; minutes++) {
        const text = String(minutes).padStart(2, '0'), hours = Number(ui.run(`erWallHours('2026-10-26','09:00','2026-10-26','09:${text}')`));
        assert.ok(hours <= minutes / 60, `${minutes} minutes must not round above the interval`);
        ui.run(`collectLeaveSegments([{date:'2026-10-26',startTime:'09:00',endTime:'09:${text}',hours:'${hours}'}])`);
    }
    ui.run("erState('leave').draft=erNewDraft('leave'); erState('leave').draft.reason='Test leave reason'; erState('leave').draft.rows=[{date:'2026-10-26',startTime:'09:00',endTime:'12:00',hours:'3',manual:false}]");
    input(ui, 'leave', 'endTime', '13:00', 0); assert.equal(ui.run("erState('leave').draft.rows[0].hours"), '3.33');
    input(ui, 'leave', 'hours', '2.5', 0); input(ui, 'leave', 'endTime', '14:00', 0);
    assert.equal(ui.run("erState('leave').draft.rows[0].hours"), '2.5');
    input(ui, 'leave', 'commonHours', '7.5'); input(ui, 'leave', 'commonEnd', '19:00');
    assert.equal(ui.run("erState('leave').draft.commonHours"), '7.5');
    input(ui, 'leave', 'endTime', '10:00', 0);
    assert.throws(() => ui.run("erBuildPayload('leave',erState('leave').draft)"), /不得超過/);
});

test('employee defaults separate lunch break from net leave hours and retain overtime two-hour duration', () => {
    const ui = loadUi();
    ui.run("erState('leave').draft=erNewDraft('leave'); erState('leave').draft.reason='Test leave reason'; erState('leave').draft.rows=[erNewRow(erState('leave').draft,'2026-10-26')]; erState('overtime').draft=erNewDraft('overtime')");
    const leave = ui.run("erState('leave').draft"), overtime = ui.run("erState('overtime').draft");
    assert.equal(leave.rows[0].startTime, '08:20'); assert.equal(leave.rows[0].endTime, '17:00');
    assert.equal(leave.rows[0].breakMinutes, '40'); assert.equal(leave.rows[0].hours, '8');
    assert.equal(overtime.startTime, '17:30'); assert.equal(overtime.endTime, '19:30'); assert.equal(overtime.durationHours, '2');
    const body = JSON.parse(ui.run("JSON.stringify(erBuildPayload('leave',erState('leave').draft))"));
    assert.equal(body.leaveSegments[0].breakMinutes, 40); assert.equal(body.durationHours, 8);
    assert.match(ui.run("erEditor('leave')"), /data-er-row-field="breakMinutes"/);
    assert.match(ui.run("erConfirmation('leave',erState('leave').draft)"), /休息 40 分鐘/);
});

test('leave auto break tracks full lunch boundaries, manual rest persists, and restore auto recalculates net', async () => {
    const ui = loadUi();
    ui.run("erState('leave').draft=erNewDraft('leave'); erState('leave').draft.reason='Test leave reason'; erState('leave').draft.rows=[erNewRow(erState('leave').draft,'2026-10-26')]");
    const row = ui.run("erState('leave').draft.rows[0]");
    input(ui, 'leave', 'endTime', '12:59', 0); assert.equal(row.breakMinutes, '0'); assert.equal(row.hours, '4.65');
    input(ui, 'leave', 'endTime', '13:00', 0); assert.equal(row.breakMinutes, '40'); assert.equal(row.hours, '4');
    input(ui, 'leave', 'startTime', '12:20', 0); assert.equal(row.breakMinutes, '40'); assert.equal(row.hours, '');
    input(ui, 'leave', 'startTime', '12:21', 0); assert.equal(row.breakMinutes, '0'); assert.equal(row.hours, '0.65');
    input(ui, 'leave', 'startTime', '08:20', 0); input(ui, 'leave', 'endTime', '17:00', 0);
    input(ui, 'leave', 'breakMinutes', '60', 0); assert.equal(row.hours, '7.66');
    input(ui, 'leave', 'endTime', '18:00', 0); assert.equal(row.breakMinutes, '60'); assert.equal(row.hours, '8.66');
    input(ui, 'leave', 'hours', '7.5', 0); input(ui, 'leave', 'endTime', '19:00', 0); assert.equal(row.hours, '7.5');
    input(ui, 'leave', 'breakMinutes', '30', 0); assert.equal(row.manual, false); assert.equal(row.hours, '10.16');
    await ui.run("erHandleAction({dataset:{kind:'leave',action:'er-auto-break',row:'0'}})");
    assert.equal(row.breakMinutes, '40'); assert.equal(row.hours, '10'); assert.equal(row.breakManual, false);
    input(ui, 'leave', 'endTime', '12:20', 0); assert.equal(row.breakMinutes, '0'); assert.equal(row.hours, '4');
});

test('common break settings copy into new days and invalid or excessive rest cannot be submitted', async () => {
    const ui = loadUi();
    ui.run("erState('leave').draft=erNewDraft('leave')");
    input(ui, 'leave', 'commonHours', '7'); input(ui, 'leave', 'commonBreakMinutes', '60');
    const draft = ui.run("erState('leave').draft");
    assert.equal(draft.commonHours, '7.66'); assert.equal(draft.commonManual, false);
    input(ui, 'leave', 'commonEnd', '18:00'); assert.equal(draft.commonBreakMinutes, '60'); assert.equal(draft.commonHours, '8.66');
    ui.run("erState('leave').draft.rows=[erNewRow(erState('leave').draft,'2026-10-26')]");
    assert.equal(draft.rows[0].breakMinutes, '60'); assert.equal(draft.rows[0].breakManual, true);
    for (const invalid of ['', '-1', '0.5', '580']) {
        input(ui, 'leave', 'breakMinutes', invalid, 0);
        assert.throws(() => ui.run("erBuildPayload('leave',erState('leave').draft)"), /休息|時數/);
    }
    input(ui, 'leave', 'breakMinutes', '60', 0); input(ui, 'leave', 'hours', '9', 0);
    assert.throws(() => ui.run("erBuildPayload('leave',erState('leave').draft)"), /休息|不得超過/);
    await ui.run("erHandleAction({dataset:{kind:'leave',action:'er-auto-break'}})");
    assert.equal(draft.commonBreakMinutes, '40'); assert.equal(draft.commonHours, '9');
    await ui.run("erHandleAction({dataset:{kind:'leave',action:'er-apply-time'}})");
    await ui.run("erHandleAction({dataset:{kind:'leave',action:'er-confirm-apply-time'}})");
    assert.equal(draft.rows[0].breakMinutes, '40'); assert.equal(draft.rows[0].hours, '9');
});

test('overtime keeps full continuous end date and manual hours, including more than one midnight', () => {
    const ui = loadUi();
    ui.run("erState('overtime').draft=erNewDraft('overtime')");
    input(ui, 'overtime', 'startDate', '2026-12-31'); input(ui, 'overtime', 'startTime', '22:00'); input(ui, 'overtime', 'endDate', '2027-01-02'); input(ui, 'overtime', 'endTime', '02:00');
    assert.equal(ui.run("erState('overtime').draft.durationHours"), '28');
    input(ui, 'overtime', 'durationHours', '18.5'); input(ui, 'overtime', 'endTime', '03:00');
    const body = JSON.parse(ui.run("JSON.stringify(erBuildPayload('overtime',erState('overtime').draft))"));
    assert.equal(body.endDate, '2027-01-02'); assert.equal(body.durationHours, 18.5); assert.equal(body.employeeId, 'E001');
    input(ui, 'overtime', 'endDate', '2026-12-31');
    assert.throws(() => ui.run("erBuildPayload('overtime',erState('overtime').draft)"), /結束必須晚於/);
});

test('drafts survive dashboard refresh and kind switches, but logout and account changes clear them', () => {
    const ui = loadUi();
    ui.run("erState('leave').draft=erNewDraft('leave'); erState('leave').draft.reason='Test leave reason'; erState('leave').draft.reason='Confidential'; erState('overtime').draft=erNewDraft('overtime')");
    const draft = ui.run("erState('leave').draft");
    ui.run("erState('leave').month='2026-11'; erState('leave').view='list'; state.employeeWorkspacePanel='overtime'; renderDashboard({...state.dashboard})");
    assert.equal(ui.run("erState('leave').draft"), draft); assert.equal(draft.reason, 'Confidential');
    ui.run("state.token='session-E002'; renderDashboard({...state.dashboard,user:{id:'E002'}})");
    assert.equal(ui.run("erState('leave').draft"), null); assert.equal(ui.run("erState('overtime').draft"), null);
    ui.run("erState('leave').draft=erNewDraft('leave'); erState('leave').draft.reason='Test leave reason'; handleLogout()");
    assert.equal(ui.run('employeeRequests.leave'), null); assert.equal(ui.run('employeeRequests.identity'), '');
});

test('month loader ignores out-of-order and cross-account responses and passes server filters', async () => {
    const ui = loadUi();
    ui.run("Object.assign(erState('overtime'),{month:'2026-10',date:'2026-10-22',filters:{relation:'proxy',status:'approved'},page:2,view:'list'})");
    const first = ui.run("erLoad('overtime')");
    assert.match(ui.requests[0].route, /relation=proxy/); assert.match(ui.requests[0].route, /page=2/); assert.doesNotMatch(ui.requests[0].route, /[?&]date=/);
    ui.run("erState('overtime').month='2026-11'"); const second = ui.run("erLoad('overtime')");
    ui.pending[1].resolve({ calendar: calendar({ id: 'newest', month: '2026-11' }) }); await second;
    ui.pending[0].resolve({ calendar: calendar({ id: 'stale' }) }); await first;
    assert.equal(ui.run("erState('overtime').data.detail.records[0].id"), 'newest');
    const third = ui.run("erLoad('overtime')"); ui.run("state.token='different-session'; renderDashboard({...state.dashboard,user:{id:'E002'}})");
    ui.pending[2].resolve({ calendar: calendar({ id: 'other-persons-record' }) }); await third;
    assert.equal(ui.run("erState('overtime').data"), null);
});

test('request detail uses scoped month endpoint and history clamp without losing a draft', async () => {
    const ui = loadUi();
    ui.run("Object.assign(erState('leave'),{month:'2025-12',date:'2025-12-01',mode:'record',requestId:'old'}); erState('leave').draft=erNewDraft('leave'); erState('leave').draft.reason='Test leave reason'; erState('leave').draft.reason='keep'");
    const first = ui.run("erLoad('leave')");
    assert.match(ui.requests[0].route, /month=2026-01/); assert.doesNotMatch(ui.requests[0].route, /requestId=/);
    ui.pending[0].resolve({ calendar: calendar({ month: '2026-01' }) }); await first;
    assert.equal(ui.run("erState('leave').draft.reason"), 'keep');
    ui.run("erState('leave').requestId='full-record'; erState('leave').mode='record'"); const second = ui.run("erLoad('leave')");
    assert.match(ui.requests[1].route, /requestId=full-record/);
    ui.pending[1].resolve({ calendar: { ...calendar(), request: { id: 'full-record', leaveSegments: [{ date: '2025-12-31' }, { date: '2026-01-01' }] } } }); await second;
    assert.equal(ui.run("erState('leave').request.leaveSegments.length"), 2);
});

test('double submission is blocked, failure keeps every field, and success posts one original API request', async () => {
    const ui = loadUi();
    ui.run("erState('overtime').draft={startDate:'2026-10-26',startTime:'22:00',endDate:'2026-10-27',endTime:'02:00',durationHours:'3.5',hoursManual:true,reason:'retain me',confirming:true,error:''}");
    const first = ui.run("erSend('overtime')"); await ui.run("erSend('overtime')");
    assert.equal(ui.requests.length, 1); assert.equal(ui.requests[0].route, '/api/browser/employee/overtime/request');
    ui.pending[0].reject(new Error('network failed')); await first;
    assert.equal(ui.run("erState('overtime').draft.reason"), 'retain me'); assert.equal(ui.run("erState('overtime').draft.durationHours"), '3.5');
    assert.equal(ui.run("erState('overtime').draft.error"), 'network failed'); assert.equal(ui.run("erState('overtime').busy"), false);
    const retry = ui.run("erSend('overtime')"); ui.pending[1].resolve({ data: { dashboard: { ...ui.state.dashboard } }, message: 'sent' }); await retry;
    assert.equal(ui.run("erState('overtime').draft"), null); assert.equal(ui.run("erState('overtime').month"), '2026-10');
    assert.equal(ui.messages.at(-1), 'sent');
});

test('late submit response after account change cannot overwrite the new dashboard or clear its draft', async () => {
    const ui = loadUi();
    const oldDashboard = ui.state.dashboard;
    ui.run("erState('overtime').draft={startDate:'2026-10-26',startTime:'18:00',endDate:'2026-10-26',endTime:'20:00',durationHours:'2',reason:'old secret',confirming:true}");
    const submit = ui.run("erSend('overtime')");
    ui.run("state.token='new-session'; renderDashboard({...state.dashboard,user:{id:'E002'}}); erState('overtime').draft=erNewDraft('overtime'); erState('overtime').draft.reason='new secret'");
    ui.pending[0].resolve({ data: { dashboard: oldDashboard } }); await submit;
    assert.equal(ui.state.dashboard.user.id, 'E002'); assert.equal(ui.run("erState('overtime').draft.reason"), 'new secret'); assert.equal(ui.messages.length, 0);
});

test('server conflict keeps the exact leave draft and inline discard or apply requires explicit confirmation', async () => {
    const ui = loadUi();
    ui.run("erState('leave').draft=erNewDraft('leave'); erState('leave').draft.reason='Test leave reason'; erState('leave').draft.rows=[{date:'2026-10-26',startTime:'09:00',endTime:'12:00',hours:'2.5',manual:true}]; erState('leave').draft.reason='Conflicting requested time'; erState('leave').draft.confirming=true");
    const original = ui.run("erState('leave').draft"), submit = ui.run("erSend('leave')");
    const conflict = new Error('這段時間已經有待審或已核准的請假申請。'); conflict.status = 409;
    ui.pending[0].reject(conflict); await submit;
    assert.equal(ui.run("erState('leave').draft"), original); assert.equal(original.rows[0].hours, '2.5'); assert.equal(original.reason, 'Conflicting requested time');
    assert.match(original.error, /已經有待審/);
    await ui.run("erHandleAction({dataset:{kind:'leave',action:'er-discard'}})");
    assert.equal(ui.run("erState('leave').draft"), original);
    await ui.run("erHandleAction({dataset:{kind:'leave',action:'er-cancel-confirm'}})");
    assert.equal(ui.run("erState('leave').draft"), original); assert.equal(ui.run("erState('leave').confirmation"), null);
    await ui.run("erHandleAction({dataset:{kind:'leave',action:'er-apply-time'}})");
    assert.equal(original.rows[0].hours, '2.5');
    await ui.run("erHandleAction({dataset:{kind:'leave',action:'er-confirm-apply-time'}})");
    assert.equal(original.rows[0].hours, '8');
    await ui.run("erHandleAction({dataset:{kind:'leave',action:'er-discard'}})");
    await ui.run("erHandleAction({dataset:{kind:'leave',action:'er-confirm-discard'}})");
    assert.equal(ui.run("erState('leave').draft"), null); assert.equal(ui.confirmations.length, 0);
});

test('whole-request withdrawal uses actual segment summary and server action permissions', async () => {
    const ui = loadUi();
    ui.context.record = { id: 'leave-one', dateSelectionMode: 'explicit_segments', duration_hours: 5, calendarActions: { withdraw: true }, leaveSegments: [
        { startAt: Date.parse('2026-10-26T09:00:00+08:00'), endAt: Date.parse('2026-10-26T12:00:00+08:00'), hours: 3 },
        { startAt: Date.parse('2026-10-28T14:00:00+08:00'), endAt: Date.parse('2026-10-28T16:00:00+08:00'), hours: 2 }
    ] };
    ui.run("erState('leave').request=record"); await ui.run("erWithdraw('leave','leave-one')");
    assert.equal(ui.requests.length, 0, 'opening inline confirmation must not withdraw');
    const confirmation = ui.run("erActionConfirmation('leave')");
    assert.match(confirmation, /2026-10-26 09:00–12:00/); assert.match(confirmation, /2026-10-28 14:00–16:00/); assert.match(confirmation, /所有時段/);
    assert.equal(ui.confirmations.length, 0, 'no blocking browser confirm dialog');
    const withdraw = ui.run("erWithdraw('leave','leave-one',true)");
    assert.equal(ui.requests[0].route, '/api/browser/employee/leave/withdraw');
    ui.pending[0].reject(new Error('already approved')); await withdraw;
    assert.match(ui.run("erState('leave').error"), /already approved/); assert.equal(ui.run("erState('leave').request"), null);
    ui.run("erState('leave').request={...record,calendarActions:{withdraw:false}}"); await ui.run("erWithdraw('leave','leave-one')");
    assert.equal(ui.requests.length, 1);
});

test('records distinguish precise leave from continuous legacy records and preserve original approval flow', () => {
    const ui = loadUi();
    assert.match(ui.run("erRecordPeriodLabel({dateSelectionMode:'explicit_segments',leaveSegments:[{date:'2026-10-26'},{date:'2026-10-28'},{date:'2026-10-28'}]})"), /實際 2 日 · 3 段/);
    assert.match(ui.run("erRecordPeriodLabel({dateSelectionMode:'explicit_dates',dailyHours:[{},{}]})"), /實際 2 日/);
    assert.match(ui.run("erRecordPeriodLabel({})"), /舊單沿用/);
    const html = ui.run("erFullRecord('leave',{id:'one',employeeId:'E001',employeeName:'<script>',status:'approved',approval_mode:'admin_paper_approved',approvalModeText:'管理部紙本核准',duration_hours:2,calendarActions:{withdraw:false}})");
    assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /指定主管審核 → 管理部終審/); assert.doesNotMatch(html, /data-action="er-withdraw"/);
});

test('leaving withdrawal confirmation for a new or existing draft does not leave its submit controls locked', async () => {
    for (const action of ['new', 'create-date', 'resume']) {
        const ui = loadUi();
        ui.run("Object.assign(erState('leave'),{mode:'record',date:'2026-10-26',requestId:'old-request',request:{id:'old-request',calendarActions:{withdraw:true}}}); erState('leave').draft=erNewDraft('leave'); erState('leave').draft.reason='Test leave reason'; erState('leave').draft.rows=[{date:'2026-10-26',startTime:'09:00',endTime:'12:00',hours:'3'}]; erState('leave').draft.reason='keep this draft'");
        await ui.run("erWithdraw('leave','old-request')");
        assert.equal(ui.run("erState('leave').confirmation.type"), 'withdraw');
        await ui.run(`erHandleAction({dataset:{kind:'leave',action:'er-${action}'}})`);
        assert.equal(ui.run("erState('leave').confirmation"), null, action);
        assert.equal(ui.run("erState('leave').draft.reason"), 'keep this draft');
        assert.doesNotMatch(ui.run("erEditor('leave')"), /type="submit"[^>]*disabled/, action);
        ui.context.form = { dataset: { erForm: 'leave' } };
        await ui.run("handleDashboardSubmit({preventDefault(){},target:{closest(){return form}}})");
        assert.equal(ui.run("erState('leave').draft.confirming"), true, `${action}: next-step validation must remain usable`);
        assert.equal(ui.requests.length, 0, 'navigation must not confirm the pending withdrawal');
    }
    const ui = loadUi();
    for (const action of [{ action: 'date', date: '2026-10-26' }, { action: 'month', offset: '1' }, { action: 'view', view: 'list' }, { action: 'today' }, { action: 'clear-filters' }, { action: 'page', page: '2' }]) {
        ui.run("erState('leave').confirmation={type:'withdraw',id:'old-request'}");
        const result = ui.run(`erHandleAction({dataset:${JSON.stringify({ kind: 'leave', ...action, action: `er-${action.action}` })}})`);
        assert.equal(ui.run("erState('leave').confirmation"), null, action.action);
        ui.pending.at(-1).resolve({ calendar: calendar() }); await result;
    }
});
