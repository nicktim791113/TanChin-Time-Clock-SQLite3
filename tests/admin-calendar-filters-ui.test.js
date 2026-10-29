const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function fixture() {
    const listeners = {}, requests = [];
    const context = vm.createContext({ state: { token: 'admin', dashboard: { role: 'admin' } }, URLSearchParams,
        escapeHtml: (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'), hasCurrentAdminPermission: () => true,
        document: { getElementById: () => null, querySelectorAll: () => [], addEventListener(type, listener) { (listeners[type] ||= []).push(listener); } },
        renderDashboard() {}, renderEmployeeWorkspaceItems: () => [], getWorkspaceSubnavItemPanelHtml() {}, getAdminPaperRequest() {}, postRenderSetup() {}, handleDashboardClick() {}, handleRealtimeSyncMessage() {}, handleLogout() {},
        workspaceSubnavConfigs: { admin: Object.fromEntries(['leave','overtime'].map((kind) => [kind, { groups: [{ items: [{ id: 'records' }] }] }])) },
        requestJson: async (url) => { requests.push(url); return { calendar: { employees: [], days: [], detail: { page: 1, totalPages: 1, totalCount: 0, records: [] } } }; } });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../browser-client/request-calendar.js'), 'utf8'), context);
    const run = (code) => vm.runInContext(code, context);
    run("Object.assign(rcState('leave'),{month:'2026-10',date:'2026-10-01',data:{employees:[{id:'E10',name:'Ten'},{id:'E2',name:'Two'},{id:'E02',name:'Zero Two'}],days:[],totalCount:0,detail:{records:[],page:1,totalPages:1,totalCount:0}}})");
    return { run, context, listeners, requests };
}
test('admin calendar naturally sorts ids with stable lexical ties and requires two characters for scoped search', () => {
    const f = fixture();
    assert.deepEqual(JSON.parse(f.run("JSON.stringify(rcSortedEmployees(rcState('leave').data.employees).map(e=>e.id))")), ['E02','E2','E10']);
    assert.equal(f.run("rcEmployeeMatches(rcState('leave').data.employees,'E').length"), 0);
    assert.deepEqual(JSON.parse(f.run("JSON.stringify(rcEmployeeMatches(rcState('leave').data.employees,'e1').map(e=>e.id))")), ['E10']);
    f.run("rcState('leave').filters.employeeId='E1'");
    const html = f.run("rcRender('leave')");
    assert.ok(html.indexOf('value="E1" selected') < html.indexOf('value="E02"'));
    assert.match(html, /<span>工號<\/span>/);
    assert.match(html, /aria-label="請假工號"/);
    assert.ok(html.indexOf('data-rc-employee-query') < html.indexOf('data-rc-filter="employeeId"'));
    f.run("state.dashboard.role='employee'");
    assert.doesNotMatch(f.run("rcRender('leave')"), /data-rc-employee-query/);
});
test('compact admin records retain every detail, paper evidence, review progress, actions and pagination', () => {
    const f = fixture();
    f.context.renderLeaveDaysSummary = () => '<details>各段日期與淨時數完整</details>';
    f.context.renderRequestReviewProgress = () => '<details>指定主管票權完整</details>';
    f.context.row = { id: 'paper-one', employeeId: 'E2', employeeName: 'Employee', employeeDepartment: 'Quality', leaveTypeName: 'Leave',
        status: 'approved', statusText: 'Approved', startText: '2026-10-01 08:20', endText: '2026-10-01 17:00', duration_hours: 8,
        approvalModeText: 'Paper approved', approval_mode: 'admin_paper_approved', paperNo: 'PAPER-123', paperApprovedBy: 'Approver',
        paperComment: 'Long evidence comment', reason: '完整理由\n第二行理由', applicantId: 'A1', applicantName: 'Applicant', calendarActions: {} };
    const leave = f.run("rcEntries('leave',{records:[row]})");
    for (const text of ['E2', 'Employee', 'Quality', '2026-10-01 08:20', '2026-10-01 17:00', '8 小時', 'Paper approved', 'PAPER-123', 'Approver', 'Long evidence comment', '完整理由\n第二行理由', '各段日期與淨時數完整', '指定主管票權完整', 'paper-leave-correct', 'paper-leave-cancel']) assert.ok(leave.includes(text), text);
    const overtime = f.run("rcEntries('overtime',{records:[row]})");
    assert.match(overtime, /申請人/); assert.match(overtime, /A1 Applicant/);
    assert.match(f.run("rcRender('leave')"), /rc-admin-workspace/);
    assert.match(f.run("rcRender('leave')"), /rc-pagination/);
    f.run("state.dashboard.role='employee'");
    assert.doesNotMatch(f.run("rcRender('leave')"), /rc-admin-workspace/);
});
test('fuzzy choice, direct employee selection, month and clear share exactly the same filters', async () => {
    const f = fixture();
    f.run("Object.assign(rcState('leave'),{employeeQuery:'E1',filters:{status:'approved',department:'QA'}})");
    f.context.target = { dataset: { kind: 'leave' }, value: 'E10', matches: () => true, hasAttribute: (name) => name === 'data-rc-employee-match' };
    for (const listener of f.listeners.change) listener({ target: f.context.target });
    await new Promise(setImmediate);
    let params = new URL(f.requests.at(-1), 'http://fixture').searchParams;
    assert.equal(params.get('employeeId'), 'E10'); assert.equal(params.get('status'), 'approved'); assert.equal(params.get('department'), 'QA');
    assert.equal(f.run("rcState('leave').employeeQuery"), 'E10');
    assert.equal(f.run("rcState('leave').employeeSearchOpen"), false);
    assert.match(f.run("rcEmployeeSearch('leave',rcState('leave'),[{id:'E10',name:'Ten'}])"), /size="4" hidden/);
    f.context.target = { dataset: { kind: 'leave' }, value: '2026-11', matches: () => true, hasAttribute: (name) => name === 'data-rc-month' };
    for (const listener of f.listeners.change) listener({ target: f.context.target });
    await new Promise(setImmediate);
    params = new URL(f.requests.at(-1), 'http://fixture').searchParams;
    assert.equal(params.get('month'), '2026-11'); assert.equal(params.get('employeeId'), 'E10');
    f.context.target = { dataset: { kind: 'leave', rcFilter: 'employeeId' }, value: '', matches: () => true, hasAttribute: () => false };
    for (const listener of f.listeners.change) listener({ target: f.context.target });
    await new Promise(setImmediate);
    assert.equal(f.run("rcState('leave').employeeQuery"), '');
    f.context.button = { dataset: { kind: 'leave', action: 'rc-clear' } };
    await f.run("handleDashboardClick({target:{closest(){return button}},preventDefault(){}})");
    assert.equal(f.run("Object.keys(rcState('leave').filters).length"), 0);
    assert.equal(f.run("rcState('leave').employeeQuery"), '');
});
test('Escape closes employee candidates without clearing selected filters, and input can reopen the list', () => {
    const f = fixture();
    f.run("Object.assign(rcState('leave'),{employeeQuery:'E1',employeeSearchOpen:true,filters:{employeeId:'E10',status:'approved'}})");
    const list = { hidden: false, innerHTML: '' }, hint = { textContent: '' };
    const input = { dataset: { kind: 'leave' }, value: 'E1', matches: (selector) => selector === '[data-rc-employee-query]', focus() {}, closest: () => field };
    const field = { querySelector: (selector) => selector === '[data-rc-employee-query]' ? input : selector === '[data-rc-employee-match]' ? list : hint };
    for (const listener of f.listeners.keydown) listener({ target: input, key: 'Escape', preventDefault() {} });
    assert.equal(list.hidden, true);
    assert.equal(f.run("rcState('leave').employeeSearchOpen"), false);
    assert.equal(f.run("rcState('leave').employeeQuery"), 'E1');
    assert.equal(f.run("rcState('leave').filters.employeeId"), 'E10');
    assert.equal(f.run("rcState('leave').filters.status"), 'approved');
    for (const listener of f.listeners.click) listener({ target: input });
    assert.equal(list.hidden, false);
    assert.equal(f.run("rcState('leave').employeeSearchOpen"), true);
    assert.match(list.innerHTML, /E10/);
});
test('cancelled filter changes retain review comments and stale roster names are cleared without repainting', () => {
    const f = fixture();
    f.run("Object.assign(rcState('leave'),{employeeQuery:'E1',employees:[{id:'E10',name:'Private old name'}],filters:{employeeId:'E10'}}); rcConfirmDiscard=()=>false; rcPaint=()=>{throw new Error('must not replace review comment DOM')}");
    f.context.target = { dataset: { kind: 'leave' }, value: '2026-11', matches: () => true, hasAttribute: (name) => name === 'data-rc-month' };
    for (const listener of f.listeners.change) listener({ target: f.context.target });
    assert.equal(f.context.target.value, '2026-10');
    assert.equal(f.requests.length, 0);
    f.context.target = { dataset: { kind: 'leave' }, value: 'E02', matches: () => true, hasAttribute: (name) => name === 'data-rc-employee-match' };
    for (const listener of f.listeners.change) listener({ target: f.context.target });
    assert.equal(f.context.target.value, 'E10');
    f.run("rcForgetEmployeeNames('leave',rcState('leave'))");
    assert.equal(f.run("rcState('leave').employees.length"), 0);
    assert.equal(f.run("rcState('leave').data.employees.length"), 0);
    assert.equal(f.run("rcState('leave').filters.employeeId"), 'E10');
});
