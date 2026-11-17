const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

function fixture() {
    const calls = [], pending = [], elements = new Map();
    const state = { token: 'employee-token', dashboard: { role: 'employee', user: { id: 'S1' }, permissions: { admin: [] } } };
    const dialog = { isConnected: true, dataset: {}, setAttribute() {}, showModal() {}, remove() { this.isConnected = false; }, addEventListener() {},
        querySelector(selector) { if (!elements.has(selector)) elements.set(selector, { innerHTML: '', textContent: '' }); return elements.get(selector); } };
    class FormDataFixture { constructor(form) { this.fields = form.values; } *[Symbol.iterator]() { yield* Object.entries(this.fields); } get(key) { return this.fields[key]; } }
    const context = vm.createContext({ state, URLSearchParams, FormData: FormDataFixture, document: { addEventListener() {}, getElementById: () => null, createElement: () => dialog, body: { append() {} } },
        window: { confirm: () => true }, escapeHtml: value => String(value).replaceAll('&', '&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
        acSnapshot: () => 'original snapshot', acTime: String, hasCurrentAdminPermission: key => state.dashboard.permissions.admin.includes(key),
        renderDashboard() {}, postRenderSetup() {}, handleLogout() {}, handleRealtimeSyncMessage() {}, reloadDashboard: async () => {},
        requestJson(url, options) { calls.push({ url, options }); return new Promise((resolve,reject) => pending.push({resolve,reject})); } });
    vm.runInContext(fs.readFileSync(require.resolve('../browser-client/approved-change-requests.js'),'utf8'), context);
    return { state, calls, pending, dialog, elements, context, run: source => vm.runInContext(source,context) };
}
function form(values) { const button = {}; return { values, reportValidity: () => true, querySelector: () => button }; }
const preview = { record:{id:'OT1'}, revisions:{correction:'c1',void:'v1'}, pending:null, canRequest:true };
const dto = { id:'CHANGE1',kind:'overtime',requestId:'OT1',action:'void',status:'pending',employeeId:'E1',proposerId:'S1',reason:'取消加班',proposal:'',record:{},history:[] };

test('only eligible employee supervisors get proposal actions; admin read and mutation remain separate', () => {
    const f = fixture();
    f.context.row = { id:'OT1',status:'approved',calendarActions:{changeRequest:true} };
    assert.match(f.run("renderApprovedChangeRequestAction('overtime',row)"),/提出更正／作廢需求/);
    assert.equal(f.run("renderApprovedChangeRequestAction('overtime',{...row,status:'pending_supervisor'})"),'');
    assert.equal(f.run("renderApprovedChangeRequestAction('overtime',{...row,calendarActions:{}})"),'');
    f.state.dashboard.impersonation = {active:true};
    assert.equal(f.run("renderApprovedChangeRequestAction('overtime',row)"),'');
    f.state.dashboard.role = 'admin'; f.state.dashboard.impersonation = null;
    assert.equal(f.run("renderApprovedChangeInbox('leave')"),'');
    f.state.dashboard.permissions.admin = ['admin.leave.review'];
    assert.match(f.run("renderApprovedChangeInbox('leave')"),/待管理者處理/);
    f.context.caseRow = {...dto, canManage:false,readyToComplete:true};
    assert.doesNotMatch(f.run('acrAdminDetail(caseRow)'),/data-acr-process|data-acr-resolve/);
    f.context.caseRow.canManage = true; f.context.caseRow.readyToComplete = false;
    assert.doesNotMatch(f.run('acrAdminDetail(caseRow)'),/data-acr-process/);
    assert.match(f.run('acrAdminDetail(caseRow)'),/原申請已變更|data-acr-resolve/);
});

test('proposal requires reason, correction contents and confirmation; submits the action revision once', async () => {
    const f = fixture();
    const opening = f.run("acrPropose('overtime','OT1')"); f.pending[0].resolve({changeRequest:preview}); await opening;
    const fields = form({action:'correction',reason:'   ',proposal:'',confirm:'on'}); f.context.form = fields;
    await f.run('acrSubmit(form,true)'); assert.equal(f.calls.length,1);
    fields.values.reason = '需要調整時間';
    await f.run('acrSubmit(form,true)'); assert.equal(f.calls.length,1);
    fields.values.proposal = '改為 18:00 至 20:00，休息 0 分鐘'; fields.values.confirm = '';
    await f.run('acrSubmit(form,true)'); assert.equal(f.calls.length,1);
    fields.values.confirm = 'on';
    const submitted = f.run('acrSubmit(form,true)'); await f.run('acrSubmit(form,true)');
    assert.equal(f.calls.length,2);
    assert.deepEqual(JSON.parse(JSON.stringify(f.calls[1].options.body)), {kind:'overtime',requestId:'OT1',action:'correction',revision:'c1',reason:'需要調整時間',proposal:fields.values.proposal,confirm:true});
    f.pending[1].resolve({changeRequest:{...dto,action:'correction'}}); await submitted;
    assert.match(f.elements.get('[data-acr-message]').textContent,/需求已送出，原申請尚未變更/);
    assert.match(f.elements.get('[data-acr-body]').innerHTML,/待管理者處理/);
    assert.doesNotMatch(f.elements.get('[data-acr-body]').innerHTML,/data-acr-process/);
});

test('duplicate pending requests suppress submission and late results cannot cross accounts', async () => {
    const f = fixture();
    f.context.data = {...preview,pending:{status:'pending'},canRequest:false};
    assert.doesNotMatch(f.run("acrProposalBody('overtime',data)"),/data-acr-proposal/);
    const opening = f.run("acrPropose('overtime','OT1')");
    f.state.token = 'other-user'; f.run('renderDashboard(state.dashboard)');
    f.pending[0].resolve({changeRequest:preview}); await opening;
    assert.equal(f.dialog.isConnected,false);
    assert.doesNotMatch(f.elements.get('[data-acr-body]')?.innerHTML || '',/data-acr-proposal/);
});

test('failure never claims completion and returned/closed actions do not call original mutation routes', async () => {
    const f = fixture(); f.state.dashboard.role='admin'; f.state.dashboard.permissions.admin=['admin.overtime.view','admin.overtime.approvedVoid'];
    const opening=f.run("acrDetail('overtime','CHANGE1')"); f.pending[0].resolve({changeRequest:{...dto,canManage:true,readyToComplete:true,revision:'case1'}}); await opening;
    f.context.form=form({decision:'return',reason:'請補充原定時間與實際狀況',confirm:'on'});
    const returned=f.run('acrSubmit(form,false)');
    assert.equal(f.calls[1].url,'/api/browser/admin/approved-changes/resolve');
    f.pending[1].reject(new Error('異動需求已變更，請重新讀取。')); await returned;
    assert.match(f.elements.get('[data-acr-message]').textContent,/已變更/);
    assert.doesNotMatch(f.elements.get('[data-acr-message]').textContent,/已完成/);
    assert.ok(f.calls.every(call=>!call.url.includes('approved-void')&&!call.url.includes('approved-correction')));
});

test('case content is escaped and inbox includes date scope, pagination and original retained explanation', () => {
    const f=fixture(); f.context.row={...dto,reason:'<script>bad</script>',proposal:'<img src=x>',employeeName:'<worker>',proposerName:'<manager>'};
    assert.doesNotMatch(f.run('acrAdminDetail(row)'),/<script>|<img /);
    assert.match(f.run('acrAdminDetail(row)'),/&lt;script>/);
    f.run("acrInbox('overtime').data={requests:[row],summary:{total:1,pendingTotalCount:19},pagination:{page:1,pageSize:15,totalPages:1,total:1}}");
    const html=f.run("renderApprovedChangeInbox('overtime')");
    assert.match(html,/全部日期待處理 19 筆/); assert.match(html,/每頁 15 筆/); assert.match(html,/提出需求不會修改原單/);
});

test('completed history keeps its own escaped before and after snapshots when the original changes later', () => {
    const f = fixture();
    f.context.renderRequestReviewProgress = () => '';
    f.run(fs.readFileSync(require.resolve('../browser-client/approved-corrections.js'),'utf8'));
    f.context.row = {
        ...dto, status:'completed', currentRecord:{ status:'approved', reason:'Later edit', duration_hours:4 },
        history:[
            { action:'submitted', after:{ reason:'Submission metadata only' } },
            { action:'completed', before:{ status:'approved', reason:'<script>Before</script>', duration_hours:2 },
                after:{ status:'pending_additional', reason:'<img src=x>After', duration_hours:3, break_minutes:30 } }
        ]
    };
    const html = f.run('acrAdminDetail(row)');
    assert.match(html, /<summary>目前原申請<\/summary>[\s\S]*?Later edit/);
    const history = html.slice(html.indexOf('需求處理歷程'));
    assert.match(history, /<details><summary>此次異動前<\/summary><p>狀態：已核准<\/p>[\s\S]*?&lt;script>Before/);
    assert.match(history, /<details><summary>此次異動後<\/summary><p>狀態：待額外複核<\/p>[\s\S]*?30 分鐘[\s\S]*?&lt;img src=x>After/);
    assert.doesNotMatch(history, /Later edit|Submission metadata only|<script>|<img /);
});
