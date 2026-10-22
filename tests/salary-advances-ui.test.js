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
