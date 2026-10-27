'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../browser-client/device-recovery.js'), 'utf8');
const pendingKey = 'tanchin.pendingDeviceRecovery';
const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const applicant = (employeeId = 'SYNTHETIC_A') => ({ employeeId, requestId: 'synthetic-request', requestToken: 'synthetic-proof', expiresAt: Date.now() + 600000, status: 'pending' });
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }

function fixture({ pending, employeeId = 'SYNTHETIC_A', view = true, manage = true, admin = false } = {}) {
    const listeners = {}, local = new Map(), calls = [], saved = [], dialogs = [];
    if (pending) local.set(pendingKey, JSON.stringify(pending));
    let responder = async () => ({ success: true }), storeError = null, logoutCount = 0;
    class Node {
        constructor(tag = 'div') { this.tagName = tag; this.dataset = {}; this.isConnected = true; this.disabled = false; this.open = false; this.children = []; this.listeners = {}; this.controls = []; this.classList = { contains: () => false }; this.message = { textContent: '' }; }
        set innerHTML(value) {
            this.html = value; this.controls.forEach((control) => { control.isConnected = false; });
            this.controls = [...value.matchAll(/<(button|input|select|textarea)\b[^>]*>/g)].map(() => ({ isConnected: true, disabled: false }));
        }
        get innerHTML() { return this.html || ''; }
        append(child) { this.children.push(child); }
        setAttribute() {}
        addEventListener(type, fn) { this.listeners[type] = fn; }
        querySelector(selector) { if (selector === '[data-recovery-message]') return this.message; return this.children.find((child) => child.dataset.recoveryAction === 'request') || null; }
        querySelectorAll() { return this.controls; }
        showModal() { this.open = true; }
        close() { this.open = false; this.listeners.close?.(); }
        replaceChildren() { this.children = []; this.controls.forEach((control) => { control.isConnected = false; }); this.controls = []; }
        remove() { this.isConnected = false; }
        focus() {}
    }
    const adminTarget = new Node(), adminContainer = new Node();
    adminContainer.querySelector = () => adminTarget;
    const state = { token: 'synthetic-session', dashboard: admin ? { role: 'admin', user: { id: 'SYNTHETIC_MANAGER' } } : null };
    const context = vm.createContext({ console, Date, JSON, Object, String, Number, Map, Set,
        window: {}, state,
        sessionStorage: { getItem: (key) => local.get(key) || null, setItem: (key, value) => local.set(key, value), removeItem: (key) => local.delete(key) },
        ui: { employeeIdInput: { value: employeeId }, loginView: new Node(), dashboardContent: new Node() },
        document: { activeElement: new Node(), body: new Node(),
            createElement(tag) { const node = new Node(tag); if (tag === 'dialog') dialogs.push(node); return node; },
            addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
            querySelector: (selector) => admin && selector === '[data-recovery-admin]' ? adminContainer : null },
        escapeHtml: escape, renderBadge: (text) => `<span>${escape(text)}</span>`,
        hasCurrentAdminPermission: (permission) => permission === 'admin.security.view' ? view : manage,
        detectBrowserName: () => 'Synthetic browser', detectPlatformName: () => 'Synthetic platform',
        getBrowserDeviceIdentityStore: () => ({ read: () => ({ deviceId: 'synthetic-device', deviceTokenCandidates: [] }) }),
        storeIssuedDeviceToken(...args) { if (storeError) throw storeError; saved.push(args); return { persisted: true }; },
        renderDashboard(dashboard) { state.dashboard = dashboard; },
        handleLogout() { logoutCount++; state.token = ''; state.dashboard = null; },
        FormData: class { constructor(form) { this.form = form; } *[Symbol.iterator]() { yield* Object.entries(this.form.values); } },
        requestJson: async (url, options) => { calls.push({ url, options, channel: 'authenticated' }); return responder(url, options); },
        fetch: async (url, options) => {
            const body = JSON.parse(options.body); calls.push({ url, options: { ...options, body }, channel: 'anonymous' });
            const result = await responder(url, { ...options, body });
            return { ok: result.success !== false, json: async () => result };
        }
    });
    vm.runInContext(source, context);
    for (const callback of listeners.DOMContentLoaded || []) callback();
    const emit = async (kind, event) => { for (const callback of listeners[kind] || []) await callback(event); };
    return { context, state, calls, local, saved, adminTarget, dialogs,
        get dialog() { return dialogs.findLast((node) => node.isConnected) || null; },
        get logoutCount() { return logoutCount; },
        respond(fn) { responder = fn; }, failStorage(error) { storeError = error; },
        click(action, requestId = 'synthetic-request') { const button = { dataset: { recoveryAction: action, requestId } }; return emit('click', { target: { closest: () => button } }); },
        form(kind, values, requestId = 'synthetic-request') { return { dataset: { recoveryForm: kind, requestId }, values,
            elements: values.secret ? { secret: { value: values.secret } } : {}, checkValidity: () => true, reportValidity() {}, closest() { return this; } }; },
        submit(form, decision) { return emit('submit', { target: form, submitter: { value: decision }, preventDefault() {} }); }
    };
}

test('changing the login employee discards the other applicants pending proof before starting a recovery', async () => {
    const f = fixture({ pending: applicant('SYNTHETIC_A'), employeeId: 'SYNTHETIC_B' });
    await f.click('request');
    assert.equal(f.local.has(pendingKey), false);
    assert.match(f.dialog.innerHTML, /data-recovery-form="request"/);
    assert.match(f.dialog.innerHTML, /value="SYNTHETIC_B"/);
    assert.doesNotMatch(f.dialog.innerHTML, /synthetic-proof|synthetic-request/);
});

test('applicant credential errors clear the secret without logging out or hiding the actionable error', async () => {
    const f = fixture();
    f.respond(async () => ({ success: false, error: 'Synthetic credentials rejected' }));
    await f.click('request');
    const form = f.form('request', { employeeId: 'SYNTHETIC_A', secret: 'synthetic-secret', reason: 'Synthetic reason' });
    await f.submit(form);
    assert.equal(form.elements.secret.value, '');
    assert.equal(f.logoutCount, 0);
    assert.equal(f.dialog.message.textContent, 'Synthetic credentials rejected');
    assert.equal(f.dialog.open, true);
    assert.equal(f.dialog.dataset.busy, 'false');
    assert.equal(f.local.has(pendingKey), false);
    assert.equal(f.calls[0].channel, 'anonymous');
});

test('busy status requests deduplicate clicks and the replaced dialog remains usable after approval', async () => {
    const f = fixture({ pending: applicant() }), held = deferred();
    f.respond(() => held.promise);
    await f.click('request');
    const running = f.click('status');
    assert.equal(f.dialog.dataset.busy, 'true');
    await f.click('status');
    await f.click('close');
    assert.equal(f.calls.length, 1);
    assert.equal(f.dialog.open, true);
    held.resolve({ success: true, status: 'approved', decisionReason: 'Synthetic approval' });
    await running;
    assert.equal(f.dialog.dataset.busy, 'false');
    assert.match(f.dialog.innerHTML, /data-recovery-action="complete"/);
    assert.ok(f.dialog.controls.every((control) => !control.disabled));
    await f.click('close');
    assert.equal(f.dialog, null);
});

test('a stale recovery response cannot resurrect a proof after logout or expose it to the next account', async () => {
    const f = fixture(), held = deferred();
    f.respond(() => held.promise);
    await f.click('request');
    const form = f.form('request', { employeeId: 'SYNTHETIC_A', secret: 'synthetic-secret', reason: 'Synthetic reason' });
    const running = f.submit(form);
    f.context.handleLogout();
    f.state.token = 'synthetic-next-session';
    f.context.renderDashboard({ role: 'employee', user: { id: 'SYNTHETIC_B' } });
    held.resolve({ success: true, ...applicant() });
    await running;
    assert.equal(f.local.has(pendingKey), false);
    assert.equal(f.dialog, null);
    assert.equal(form.elements.secret.value, '');
    assert.equal(f.saved.length, 0);
});

test('a security viewer can read escaped requests but cannot open an approval form', async () => {
    const f = fixture({ admin: true, manage: false });
    const hostile = '<img src=x onerror=synthetic>';
    f.respond(async () => ({ requests: [{ ...applicant(), employeeName: hostile, reason: hostile, deviceName: hostile, status: 'pending' }] }));
    await f.click('refresh');
    assert.match(f.adminTarget.innerHTML, /&lt;img/);
    assert.doesNotMatch(f.adminTarget.innerHTML, /<img|data-recovery-action="review"/);
    await f.click('review');
    assert.equal(f.dialog, null);
    assert.equal(f.calls.length, 1);
});

test('failed credential persistence retains recovery proof and permits an explicit completion retry', async () => {
    const f = fixture({ pending: { ...applicant(), status: 'approved' } });
    f.respond(async (url) => url.endsWith('/status')
        ? { success: true, status: 'completed' }
        : { success: true, deviceBinding: { issuedDeviceToken: 'synthetic-issued', deviceId: 'synthetic-canonical' } });
    f.failStorage(Object.assign(new Error('[P216] Synthetic persistence failure'), { devicePersistence: { persisted: false } }));
    await f.click('request');
    await f.click('complete');
    assert.equal(JSON.parse(f.local.get(pendingKey)).requestToken, 'synthetic-proof');
    assert.match(f.dialog.message.textContent, /P216/);
    assert.doesNotMatch(f.dialog.innerHTML, /已恢復原裝置/);
    await f.click('status');
    assert.equal(JSON.parse(f.local.get(pendingKey)).status, 'completed');
    assert.match(f.dialog.innerHTML, /data-recovery-action="complete"/, 'a completed server request with locally unsaved proof must still offer a save retry');
    f.failStorage(null);
    await f.click('complete');
    assert.equal(f.local.has(pendingKey), false);
    assert.deepEqual(f.saved[0], ['synthetic-issued', 'SYNTHETIC_A', 'synthetic-canonical']);
    assert.match(f.dialog.innerHTML, /已恢復原裝置/);
});

test('login persistence telemetry allowlists the failed storage statuses without leaking a credential', async () => {
    const app = fs.readFileSync(path.join(__dirname, '../browser-client/app.js'), 'utf8');
    const start = app.indexOf('async function persistBrowserDeviceBinding('), end = app.indexOf('function describeGeolocationError(', start);
    assert.ok(start >= 0 && end > start);
    const requests = [];
    const context = vm.createContext({
        storeIssuedDeviceToken() { throw Object.assign(new Error('[P216] synthetic'), { devicePersistence: {
            persisted: false, localStorageStatus: 'unavailable', cookieStorageStatus: 'unavailable', deviceId: 'synthetic-device', secret: 'synthetic-secret'
        } }); },
        fetch: (url, options) => { requests.push({ url, options }); return Promise.resolve({ ok: true }); }
    });
    vm.runInContext(app.slice(start, end), context);
    await assert.rejects(context.persistBrowserDeviceBinding({ token: 'synthetic-session', dashboard: { user: { id: 'SYNTHETIC_A' } },
        deviceBinding: { enabled: true, deviceId: 'synthetic-device', verifiedDeviceToken: 'synthetic-device-token' } }), /P216/);
    assert.equal(requests.length, 1);
    assert.deepEqual(JSON.parse(requests[0].options.body), { deviceId: 'synthetic-device', persisted: false, localStorageStatus: 'unavailable', cookieStorageStatus: 'unavailable' });
    assert.doesNotMatch(requests[0].options.body, /synthetic-secret|synthetic-device-token|synthetic-session/);
});
