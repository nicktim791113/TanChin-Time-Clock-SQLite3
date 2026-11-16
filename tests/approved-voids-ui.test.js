const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

function ui() {
    const calls = [], pending = [], handlers = {}, nodes = new Map();
    const content = { innerHTML: '', querySelector: () => null };
    const dialog = {
        isConnected: false, setAttribute() {}, showModal() { this.open = true; }, close() { this.open = false; }, remove() { this.isConnected = false; },
        querySelector(selector) {
            if (selector === '[data-approved-void-content]') return content;
            if (!nodes.has(selector)) nodes.set(selector, {});
            return nodes.get(selector);
        },
        addEventListener(type, handler) { handlers[type] = handler; }
    };
    const state = { token: 'admin-a', dashboard: { role: 'admin', user: { id: 'A1' }, permissions: { admin: ['admin.overtime.view', 'admin.overtime.approvedVoid'] } } };
    const context = vm.createContext({ state, document: { addEventListener() {}, createElement: () => dialog, body: { append() { dialog.isConnected = true; } } },
        hasCurrentAdminPermission: code => state.dashboard.permissions.admin.includes(code),
        escapeHtml: s => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
        acSnapshot: () => 'Original snapshot', renderRequestReviewProgress: () => 'Original approval', acTime: String, acActor: String,
        renderDashboard(dashboard) { state.dashboard = dashboard; }, handleLogout() {}, reloadDashboard() {},
        requestJson(url, options) { calls.push({ url, options }); return new Promise((resolve, reject) => pending.push({ resolve, reject })); }
    });
    vm.runInContext(fs.readFileSync(require.resolve('../browser-client/approved-voids.js'), 'utf8'), context);
    const run = code => vm.runInContext(code, context);
    return { run, state, context, calls, pending, handlers, dialog, content, nodes };
}
const approved = { id:'OT-1', status:'approved', approval_mode:'self_request', employeeName:'Worker' };
const cancelled = { ...approved, status:'cancelled', statusText:'已取消', voidSummary:{ id:'event' } };
const getBody = (record = approved, history = [], canVoid = true) => ({ voiding: { record, history, canVoid, revision:'rev-1' } });

test('online overtime has a distinct mutation permission and view-only history, with no paper or leave actions', () => {
    const f = ui();
    Object.assign(f.context, { approved, cancelled });
    assert.match(f.run("renderApprovedVoidAction('overtime',approved)"), /作廢已核准加班/);
    assert.equal(f.run("renderApprovedVoidAction('leave',approved)"), '');
    assert.equal(f.run("renderApprovedVoidAction('overtime',{...approved,approval_mode:'admin_paper_approved'})"), '');
    f.state.dashboard.permissions.admin = ['admin.overtime.view', 'admin.overtime.approvedCorrect'];
    assert.equal(f.run("renderApprovedVoidAction('overtime',approved)"), '');
    assert.match(f.run("renderApprovedVoidAction('overtime',cancelled)"), /查看作廢歷程/);
    assert.equal(f.run('approvedVoidStatusText(cancelled)'), '已作廢');
    assert.equal(f.run('approvedVoidStatusText({...cancelled,voidSummary:null})'), '已取消');
    assert.equal(f.run("approvedVoidStatusText({status:'withdrawn',statusText:'已撤回'})"), '已撤回');
    f.state.dashboard.impersonation = { active:true };
    f.state.dashboard.permissions.admin.push('admin.overtime.approvedVoid');
    assert.equal(f.run("renderApprovedVoidAction('overtime',approved)"), '');
});

test('void posts only after reason and confirmation, locks duplicate submission, and shows stored history', async () => {
    const f = ui();
    const opened = f.run("avOpen('OT-1')");
    assert.match(f.calls[0].url, /approved-void\?requestId=OT-1/);
    f.pending[0].resolve(getBody()); await opened;
    assert.match(f.content.innerHTML, /Original snapshot[\s\S]*Original approval[\s\S]*作廢影響/);
    const submit = { disabled:false };
    const form = { matches: () => true, reportValidity: () => true, querySelector: () => submit,
        elements: { reason:{ value:'  ' }, confirm:{ checked:false } } };
    const event = { target:form, preventDefault() {} };
    await f.handlers.submit(event);
    assert.equal(f.calls.length, 1);
    form.elements.reason.value = ' change <unsafe> ';
    form.elements.confirm.checked = true;
    const sent = f.handlers.submit(event);
    await f.handlers.submit(event);
    assert.equal(f.calls.length, 2);
    assert.deepEqual(JSON.parse(JSON.stringify(f.calls[1].options.body)), { requestId:'OT-1', revision:'rev-1', reason:'change <unsafe>', confirm:true });
    f.pending[1].resolve(getBody(cancelled, [{ actorId:'A1', voidedAt:10, reason:'change <unsafe>' }], false));
    await sent;
    assert.match(f.content.innerHTML, /A1[\s\S]*change &lt;unsafe>/);
    assert.match(f.content.innerHTML, /單號 OT-1 · 已作廢/);
    assert.doesNotMatch(f.content.innerHTML, /已取消/);
    assert.doesNotMatch(f.content.innerHTML, /data-approved-void-form/);
});

test('closing or switching accounts while the original is loading prevents stale data from rendering', async () => {
    const f = ui();
    const cancelling = f.run("avOpen('OT-1')");
    f.handlers.cancel({ preventDefault() {} });
    f.pending[0].resolve(getBody()); await cancelling;
    assert.equal(f.dialog.isConnected, false);
    assert.equal(f.content.innerHTML, '');
    const switching = f.run("avOpen('OT-2')");
    f.state.token = 'admin-b';
    f.run("renderDashboard({...state.dashboard,user:{id:'B2'}})");
    f.pending[1].resolve(getBody()); await switching;
    assert.equal(f.dialog.isConnected, false);
    assert.equal(f.content.innerHTML, '');
    assert.ok(f.calls.every(call => call.options.method !== 'POST'));
});

test('a stale revision requires reloading the record before another confirmation', async () => {
    const f = ui();
    const opening = f.run("avOpen('OT-1')");
    f.pending[0].resolve(getBody()); await opening;
    const reason = { value:'Please void the incorrect entry' }, confirm = { checked:true };
    f.content.querySelector = () => reason;
    const event = { preventDefault() {}, target: { matches: () => true, reportValidity: () => true,
        querySelector: () => ({}), elements: { reason, confirm } } };
    const first = f.handlers.submit(event);
    f.pending[1].reject(Object.assign(new Error('版本已變更'), { status:409 }));
    await first;
    assert.equal(confirm.checked, false);
    assert.match(f.nodes.get('[data-approved-void-error]').textContent, /版本已變更.*重新讀取/);
    confirm.checked = true;
    await f.handlers.submit(event);
    assert.equal(f.calls.length, 2);
    const reloading = f.nodes.get('[data-approved-void-reload]').onclick();
    f.pending[2].resolve({ voiding:{ ...getBody().voiding, revision:'rev-2' } });
    await reloading;
    assert.equal(reason.value, 'Please void the incorrect entry');
    confirm.checked = true;
    const second = f.handlers.submit(event);
    assert.equal(f.calls[3].options.body.revision, 'rev-2');
    f.pending[3].resolve(getBody(cancelled, [], false));
    await second;
});
