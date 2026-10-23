'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

function fixture() {
    const listeners = {}, calls = [];
    const data = { permissions: { own: true }, settings: { enabled: true, maxAmount: 15000, maxActivePerMonth: 1, deductionMonthOffset: null }, window: { applicationMonth: '2026-10', opensOn: '2026-10-15', closesOn: '2026-10-20', isOpen: true }, requests: [], summary: { count: 0, pendingCount: 0, requestedAmount: 0, approvedAmount: 0 } };
    let failPost = false;
    const context = vm.createContext({ console, Date, Number, String, Object, Array, Uint8Array, Map, Set, URL, setTimeout,
        window: { crypto: { getRandomValues: (value) => webcrypto.getRandomValues(value) } },
        state: { token: 'test-token', dashboard: { role: 'employee', user: { id: '085' } } },
        escapeHtml: (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
        document: { addEventListener: (name, callback) => { listeners[name] = callback; }, getElementById: () => null, querySelectorAll: () => [], querySelector: () => null },
        FormData: class { constructor(form) { return Object.entries(form.values); } },
        postRenderSetup() {}, handleLogout() {}, renderDashboard() {},
        requestJson: async (url, options) => {
            calls.push({ url, options });
            if (options.method === 'POST') { if (failPost) throw new Error('Network interrupted'); return { success: true, message: '已送出。' }; }
            return data;
        }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../browser-client/salary-advances.js'), 'utf8'), context);
    vm.runInContext('renderSalaryAdvanceWorkspace("employee")', context);
    context.fixtureData = data; vm.runInContext('saState.data = fixtureData', context);
    return { context, listeners, calls, data, failPost: (value) => { failPost = value; } };
}

test('salary advance submission works on HTTP LAN without randomUUID and reuses the same key after a network interruption', async () => {
    const f = fixture();
    assert.equal(f.context.window.crypto.randomUUID, undefined);
    const firstKey = vm.runInContext('saNewSubmissionKey()', f.context), secondKey = vm.runInContext('saNewSubmissionKey()', f.context);
    assert.match(firstKey, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/); assert.notEqual(firstKey, secondKey);
    const form = { dataset: { saForm: 'submit' }, values: { requestedAmount: '5000', note: 'test note' } };
    const event = { target: { closest: () => form }, preventDefault() {} };
    f.failPost(true); await f.listeners.submit(event);
    const failed = f.calls.find((call) => call.options.method === 'POST');
    assert.equal(failed.url, '/api/browser/employee/salary-advances/submit'); assert.equal(failed.options.body.requestedAmount, 5000);
    assert.equal(vm.runInContext('saState.error', f.context), true);
    f.failPost(false); await f.listeners.submit(event);
    const posts = f.calls.filter((call) => call.options.method === 'POST');
    assert.equal(posts.length, 2); assert.equal(posts[0].options.body.idempotencyKey, posts[1].options.body.idempotencyKey);
    assert.equal(vm.runInContext('saState.submitKey', f.context), ''); assert.equal(vm.runInContext('saState.error', f.context), false);
});

test('salary advance UI does not retain another identity financial data or submit when random generation is unavailable', async () => {
    const f = fixture();
    f.data.requests = [{ requestId: 'PRIVATE-TEST-ROW' }];
    f.context.state.token = 'other-token'; f.context.state.dashboard.user.id = '088';
    vm.runInContext('renderSalaryAdvanceWorkspace("employee")', f.context);
    assert.equal(vm.runInContext('saState.data', f.context), null);
    f.context.fixtureData = f.data; vm.runInContext('saState.data = fixtureData', f.context);
    f.context.window.crypto = {};
    const form = { dataset: { saForm: 'submit' }, values: { requestedAmount: '5000', note: '' } };
    await f.listeners.submit({ target: { closest: () => form }, preventDefault() {} });
    assert.equal(f.calls.length, 0); assert.equal(vm.runInContext('saState.error', f.context), true);
    assert.match(vm.runInContext('saState.message', f.context), /識別碼/);
});

test('salary advance failed review retains rejection, adjusted amount and reason instead of reverting to full approval', async () => {
    const f = fixture();
    f.context.state.dashboard.role = 'admin';
    vm.runInContext('renderSalaryAdvanceWorkspace("admin"); saState.data = fixtureData; saState.action = { kind: "review", requestId: "request-test" }', f.context);
    f.data.permissions = { view: true, review: true };
    f.data.requests = [{ requestId: 'request-test', employeeId: '085', employeeName: 'Test', applicationMonth: '2026-10', status: 'pending_admin', requestedAmount: 5000, approvedAmount: null, revision: 1 }];
    for (const decision of ['rejected', 'approved']) {
        f.failPost(true);
        const form = { dataset: { saForm: 'review', saId: 'request-test', saRevision: '1' }, values: { decision, approvedAmount: '3000', reason: 'Keep this deliberate decision' } };
        await f.listeners.submit({ target: { closest: () => form }, preventDefault() {} });
        const html = vm.runInContext('saActionForm()', f.context);
        assert.match(html, new RegExp(`value="${decision}" selected`));
        assert.match(html, /name="approvedAmount" type="number" value="3000"/);
        assert.match(html, /Keep this deliberate decision/);
        f.failPost(false);
        await f.listeners.submit({ target: { closest: () => form }, preventDefault() {} });
        const posts = f.calls.filter((call) => call.options.method === 'POST');
        assert.deepEqual(posts.at(-1).options.body, posts.at(-2).options.body);
        assert.equal(posts.at(-1).options.body.decision, decision);
        assert.equal(posts.at(-1).options.body.approvedAmount, decision === 'approved' ? 3000 : undefined);
        vm.runInContext('saState.action = { kind: "review", requestId: "request-test" }', f.context);
    }
});

function adminFixture() {
    const f = fixture();
    f.context.state.dashboard.role = 'admin';
    f.data.permissions = { view: true, review: true, paper: true, settings: true, export: true };
    f.data.employees = [{ id: '085', name: '員工甲', department: '製造部' }, { id: '088', name: '員工乙', department: '品保部' }, { id: '112', name: '主管丙', department: '品保部' }];
    f.data.settings = { ...f.data.settings, revision: 3, startDay: 15, endDay: 20 };
    vm.runInContext('renderSalaryAdvanceWorkspace("admin"); saState.month = "2026-10"; saState.data = fixtureData', f.context);
    return f;
}
function testRequest(overrides = {}) {
    return { requestId: 'request-085', employeeId: '085', employeeName: '員工甲', department: '製造部', applicationMonth: '2026-10', status: 'approved', requestedAmount: 5000, approvedAmount: 5000, revision: 2, note: '', updatedAt: '2026-10-16T08:00:00.000Z', ...overrides };
}
function submission(form) { return { target: { closest: () => form }, preventDefault() {} }; }

test('monthly query uses one latest row per employee, filters that status and deliberately expands all historical records', async () => {
    const f = adminFixture();
    f.data.requests = [testRequest({ requestId: 'request-cancelled', status: 'withdrawn', approvedAmount: null, createdAt: 1 }), testRequest({ requestId: 'request-paper', entryMode: 'admin_paper_approved', createdAt: 2 }), testRequest({ requestId: 'request-pending', status: 'pending_admin', approvedAmount: null, createdAt: 3 })];
    const html = vm.runInContext('renderSalaryAdvanceWorkspace("admin")', f.context);
    for (const label of ['員工甲', '員工乙', '主管丙', '無申請', '待複核 NT$ 5,000', '更新日期', '全部展開明細', '有申請紀錄']) assert.ok(html.includes(label), label);
    for (const hidden of ['request-cancelled', 'request-paper', 'request-pending', '補登記 NT$ 5,000']) assert.ok(!html.includes(hidden), hidden);
    assert.equal((html.match(/data-sa-person=/g) || []).length, 3);
    assert.doesNotMatch(html, /data-sa-action="(?:review|cancel)"/);
    vm.runInContext('saState.filters.query = { search: "", department: "", status: "none" }', f.context);
    assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(saFilteredRoster().map(e => e.id))', f.context)), ['088', '112']);
    vm.runInContext('saState.filters.query.status = "paper"', f.context);
    assert.equal(vm.runInContext('saFilteredRoster().length', f.context), 0);
    vm.runInContext('saState.filters.query.status = "has_application"', f.context);
    assert.equal(vm.runInContext('saFilteredRoster().length', f.context), 1);
    await f.listeners.click({ target: { closest: () => ({ dataset: { saAction: 'toggle-all-details' } }) } });
    let expanded = vm.runInContext('saRosterTable()', f.context);
    for (const id of ['request-cancelled', 'request-paper', 'request-pending']) assert.ok(expanded.includes(id));
    assert.match(expanded, /全部收合明細/);
    await f.listeners.click({ target: { closest: () => ({ dataset: { saAction: 'toggle-details', saEmployee: '085' } }) } });
    assert.doesNotMatch(vm.runInContext('saRosterTable()', f.context), /request-cancelled/);
});

test('all three operational salary pages place four relevant metrics before the content card and paper rows stay dense', () => {
    const f = adminFixture(); f.data.requests = [testRequest({ entryMode: 'admin_paper_approved', revision: 7 })];
    for (const page of ['query', 'review', 'paper']) {
        vm.runInContext(`saState.page = "${page}"`, f.context);
        const html = vm.runInContext('saAdminContent()', f.context);
        assert.match(html, /workspace-subnav-content"><div class="sa-summary"/);
        assert.ok(html.indexOf('class="sa-summary"') < html.indexOf('class="sa-card"'));
    }
    const html = vm.runInContext('saPaperTable()', f.context);
    for (const heading of ['編輯紀錄／版本', '補登金額', '備註', '儲存', '更新日期']) assert.ok(html.includes(`<th>${heading}</th>`));
    assert.match(html, /v7 · NT\$ 5,000 · request-085/);
    assert.match(html, /form="sa-paper-085" name="requestedAmount"/);
    assert.doesNotMatch(html, /<th>紀錄版本<\/th>/);
});

test('salary subpages follow granular permissions and work page defaults to pending with optional review notes in dialogs', () => {
    const f = adminFixture();
    f.data.requests = [testRequest({ status: 'pending_admin', approvedAmount: null }), testRequest({ requestId: 'approved-old' })];
    vm.runInContext('saState.page = "review"', f.context);
    let html = vm.runInContext('saAdminContent()', f.context);
    assert.match(html, /data-sa-action="review"/); assert.doesNotMatch(html, /approved-old/);
    vm.runInContext('saState.filters.review.status = ""', f.context);
    html = vm.runInContext('saAdminContent()', f.context); assert.match(html, /approved-old/);
    assert.match(vm.runInContext('saRequests([])', f.context), /目前篩選條件下沒有申請/);
    vm.runInContext('saState.filters.review.status = "pending_admin"', f.context);
    assert.match(vm.runInContext('saRequests([])', f.context), /目前篩選條件下沒有待複核申請/);
    vm.runInContext('saState.action = { kind: "review", requestId: "request-085" }', f.context);
    html = vm.runInContext('saActionForm()', f.context);
    assert.match(html, /<dialog /); assert.match(html, /審核說明（選填）/);
    assert.doesNotMatch(html.match(/<textarea[^>]*name="reason"[^>]*>/)[0], /required/);
    vm.runInContext('saState.action.kind = "cancel"', f.context);
    assert.match(vm.runInContext('saActionForm()', f.context).match(/<textarea[^>]*name="reason"[^>]*>/)[0], /required/);
    f.data.permissions = { view: true };
    html = vm.runInContext('saAdminContent()', f.context);
    for (const page of ['review', 'paper', 'settings']) assert.doesNotMatch(html, new RegExp(`data-sa-page="${page}"`));
    assert.equal(vm.runInContext('saState.page', f.context), 'query');
});

test('dense paper fields outside the form retain amount and note drafts before changing panels', () => {
    const f = adminFixture();
    const form = { dataset: { saForm: 'paper', saEmployee: '085', saId: 'request-paper', saRevision: '4' }, values: { requestedAmount: '6250', note: 'keep external fields' } };
    f.listeners.input({ target: { closest: () => null, form } });
    assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(saState.draft.paper["2026-10/085/request-paper"])', f.context)), { requestedAmount: '6250', note: 'keep external fields', revision: 4, idempotencyKey: '' });
});

test('paper roster confirms before creating, retains the HTTP idempotency key on retry and preserves other drafts', async () => {
    const f = adminFixture();
    vm.runInContext('saState.page = "paper"; saState.draft.paper = { "2026-10/088/": { requestedAmount: "2000", note: "keep me" } }', f.context);
    const form = { dataset: { saForm: 'paper', saEmployee: '085', saId: '', saRevision: '' }, values: { requestedAmount: '3500', note: '紙本核准' } };
    await f.listeners.submit(submission(form));
    assert.equal(f.calls.length, 0);
    assert.match(vm.runInContext('saActionForm()', f.context), /確認新增紙本核准補登/);
    const confirm = { dataset: { saForm: 'paper-confirm' }, values: {} };
    f.failPost(true); await f.listeners.submit(submission(confirm));
    const post = f.calls.find((c) => c.options.method === 'POST');
    assert.equal(post.url, '/api/browser/salary-advances/paper-approved');
    assert.equal(post.options.body.employeeId, '085'); assert.equal(post.options.body.confirm, true); assert.equal(post.options.body.requestedAmount, 3500);
    assert.match(post.options.body.idempotencyKey, /^[a-f0-9-]{36}$/);
    f.failPost(false); await f.listeners.submit(submission(confirm));
    const posts = f.calls.filter((c) => c.options.method === 'POST');
    assert.equal(posts[0].options.body.idempotencyKey, posts[1].options.body.idempotencyKey);
    assert.equal(vm.runInContext('saState.draft.paper["2026-10/088/"].note', f.context), 'keep me');
    assert.equal(vm.runInContext('saState.draft.paper["2026-10/085/"]', f.context), undefined);
    f.data.permissions.paper = false;
    await f.listeners.submit(submission(form)); assert.equal(f.calls.filter((c) => c.options.method === 'POST').length, 2);
});

test('paper correction uses the original request revision and original policy cap and employee records display the paper source', async () => {
    const f = adminFixture();
    f.data.settings.maxAmount = 2000;
    f.data.requests = [testRequest({ entryMode: 'admin_paper_approved', rulesSnapshot: { maxAmount: 15000 }, revision: 7 })];
    vm.runInContext('saState.page = "paper"', f.context);
    let html = vm.runInContext('saPaperTable()', f.context);
    assert.match(html, /max="15000"/); assert.match(html, /data-sa-revision="7"/);
    const form = { dataset: { saForm: 'paper', saEmployee: '085', saId: 'request-085', saRevision: '7' }, values: { requestedAmount: '4500', note: '調整金額' } };
    await f.listeners.submit(submission(form));
    await f.listeners.submit(submission({ dataset: { saForm: 'paper-confirm' }, values: {} }));
    const post = f.calls.find((c) => c.options.method === 'POST');
    assert.equal(post.url, '/api/browser/salary-advances/paper-approved/correct');
    assert.deepEqual(JSON.parse(JSON.stringify(post.options.body)), { requestId: 'request-085', revision: 7, requestedAmount: 4500, note: '調整金額', confirm: true });
    vm.runInContext('saState.role = "employee"', f.context);
    html = vm.runInContext('saRequests()', f.context); assert.match(html, /來源：紙本核准補登/); assert.match(html, /補登記 NT\$ 5,000/);
});

test('month and identity transitions discard stale salary responses without leaking the previous roster', async () => {
    const f = adminFixture(), resolvers = [];
    f.context.requestJson = () => new Promise((resolve) => resolvers.push(resolve));
    const october = vm.runInContext('saLoad()', f.context);
    vm.runInContext('saState.month = "2026-11"; saState.data = null', f.context);
    const november = vm.runInContext('saLoad()', f.context);
    const fresh = { ...f.data, marker: 'november' };
    resolvers[1](fresh); await november;
    resolvers[0]({ ...f.data, marker: 'october' }); await october;
    assert.equal(vm.runInContext('saState.data.marker', f.context), 'november');
    const previousIdentity = vm.runInContext('saLoad()', f.context);
    vm.runInContext('saReset("new-identity")', f.context);
    resolvers[2]({ ...f.data, marker: 'private-old-data' }); await previousIdentity;
    assert.equal(vm.runInContext('saState.data', f.context), null);
});
