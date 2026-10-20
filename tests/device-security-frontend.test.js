const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const app = fs.readFileSync(path.join(__dirname, '../browser-client/app.js'), 'utf8');
const directory = fs.readFileSync(path.join(__dirname, '../browser-client/admin-directory.js'), 'utf8');
function section(start, end) {
    const from = app.indexOf(start), until = app.indexOf(end, from);
    assert.ok(from >= 0 && until > from, `Missing frontend section: ${start}`);
    return app.slice(from, until);
}
function setup({ manage = true, view = true, datasets = {} } = {}) {
    const listeners = {}, requests = [], messages = [];
    const state = { token: 'session-one', dashboard: { role: 'admin', user: { id: 'A001' }, datasets } };
    class Form {
        constructor(values = {}) { this.values = values; }
        getAttribute(name) { return name === 'id' ? 'security-settings-form' : null; }
    }
    const context = vm.createContext({ state, Date, window: {}, ui: {}, HTMLFormElement: Form,
        FormData: class { constructor(form) { this.form = form; } entries() { return Object.entries(this.form.values); } },
        document: { addEventListener(type, fn) { (listeners[type] ||= []).push(fn); } },
        getDatasets: () => state.dashboard.datasets,
        hasCurrentAdminPermission: (permission) => permission === 'admin.security.view' ? view : manage && permission === 'admin.security.manage',
        escapeHtml: (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'),
        renderEmptyState: (message) => `<p>${message}</p>`,
        renderBrowserPunchPermissions: () => '', renderRequestHistorySettings: () => '',
        renderDashboard() {}, handleLogout() {}, handleDashboardSubmit() {}, setMessage() {},
        setFormMessage: (...args) => messages.push(args), reloadDashboard: async () => {},
        requestJson: async (url, options) => { requests.push({ url, ...options }); return {}; }
    });
    vm.runInContext(section('function renderBadge(', 'function renderEmployeeDashboard('), context);
    vm.runInContext(directory, context);
    vm.runInContext(section('function renderAdminSecuritySection(', 'const originalRenderEmployeeDashboardWithSecurity'), context);
    vm.runInContext(section('const originalHandleDashboardSubmitWithSecurity', 'const originalHandleDashboardClickWithCardCapture'), context);
    const emit = (type, event) => listeners[type].forEach((fn) => fn(event));
    const filter = (kind, name, value) => {
        const results = { innerHTML: '' }, container = { dataset: { directoryKind: kind }, querySelector: () => results };
        const control = { value, dataset: { directoryFilter: name }, matches: () => true,
            closest: (selector) => selector === '[data-directory-kind]' ? container : null };
        emit('input', { target: control });
        return results.innerHTML;
    };
    return { context, state, emit, filter, requests, messages, Form, directory: context.window.AdminDirectory };
}
function diagnostic(employeeId, extra = {}) {
    return { id: `event-${employeeId}`, timestampText: '2026/10/20 08:00:00', employeeId, employeeName: `Person ${employeeId}`, department: 'Test',
        stage: 'login', success: false, failureCode: 'P211', reason: 'Device limit reached', deviceId: `device-${employeeId}`,
        deviceName: 'Test browser', platform: 'Windows', browserName: 'Chrome', siteOrigin: 'http://test-host:3000',
        ipAddress: '192.0.2.1', userAgent: 'Synthetic test agent', tokenPresent: false, boundDeviceCount: 4, maxDevicesPerEmployee: 4, ...extra };
}

test('diagnostic results default to failures, support employee/device search and retain success context', () => {
    const datasets = { security: { deviceLoginDiagnostics: { records: [diagnostic('E001'), diagnostic('E002', { success: true, failureCode: '', tokenPresent: true })], limit: 200,
        range: { startDate: '2026-10-07', endDate: '2026-10-20' } } } };
    const f = setup({ datasets });
    const html = f.directory.renderDiagnostics(datasets);
    assert.match(html, /value="failure" selected/);
    assert.match(html, /Person E001/); assert.doesNotMatch(html, /Person E002/);
    assert.match(html, /2026-10-07/); assert.match(html, /最新 200 筆/);
    const all = f.filter('diagnostics', 'status', '');
    assert.match(all, /Person E001/); assert.match(all, /Person E002/);
    assert.match(all, /有提供（不代表驗證有效）/);
    const searched = f.filter('diagnostics', 'query', 'device-E002');
    assert.doesNotMatch(searched, /Person E001/); assert.match(searched, /Person E002/);
    const mismatch = f.filter('diagnostics', 'status', 'failure');
    assert.match(mismatch, /沒有符合條件/);
});

test('all diagnostic request fields are escaped and unverified input never appears as a confirmed employee', () => {
    const hostile = '<img src=x onerror="alert(1)">';
    const row = diagnostic('', Object.fromEntries(['employeeName', 'submittedAccount', 'department', 'timestampText', 'stage', 'failureCode', 'reason', 'deviceId', 'deviceName', 'platform', 'browserName', 'siteOrigin', 'ipAddress', 'userAgent', 'boundDeviceCount', 'maxDevicesPerEmployee'].map((key) => [key, hostile])));
    const datasets = { security: { deviceLoginDiagnostics: { records: [row], range: { startDate: hostile, endDate: hostile }, limit: hostile } } };
    const f = setup({ datasets }), html = f.directory.renderDiagnostics(datasets);
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /&lt;img/);
    assert.match(html, /未確認帳號/); assert.match(html, /尚未驗證身分/);
    assert.match(html, /<details class="directory-user-agent">/);
});

test('empty diagnostics explain the collection boundary and account change resets the diagnostic search', () => {
    const datasets = { security: { deviceLoginDiagnostics: { records: [diagnostic('E001')] } } };
    const f = setup({ datasets });
    f.filter('diagnostics', 'query', 'other-person');
    assert.match(f.directory.renderDiagnostics(datasets), /value="other-person"/);
    f.emit('DOMContentLoaded');
    f.state.token = 'session-two';
    f.context.renderDashboard(f.state.dashboard);
    const restored = f.directory.renderDiagnostics(datasets);
    assert.doesNotMatch(restored, /value="other-person"/);
    assert.match(restored, /value="failure" selected/);
    assert.match(f.directory.renderDiagnostics({}), /不會補記過去未留下的登入失敗/);
});

test('management without security viewing permission does not render diagnostics or imply the log is empty', () => {
    const datasets = { security: { deviceLoginDiagnostics: { records: [diagnostic('E001')] } } };
    const f = setup({ manage: true, view: false, datasets });
    for (const html of [f.directory.renderDiagnostics(datasets), f.filter('diagnostics', 'status', '')]) {
        assert.match(html, /沒有「安全設定檢視」權限/);
        assert.doesNotMatch(html, /Person E001|尚無最近|已載入紀錄/);
    }
});

test('device review filter selects only employees with at least three bindings and shows the configured limit', () => {
    const employees = ['E001', 'E002', 'E003'].map((id) => ({ id, name: `Person ${id}` }));
    const employeeDevices = employees.flatMap((person, index) => Array.from({ length: index + 2 }, (_, i) => ({ employee_id: person.id, device_id: `${person.id}-${i}` })));
    const datasets = { employees, security: { settings: { maxDevicesPerEmployee: 4 }, employeeDevices } };
    const f = setup({ datasets }), all = f.directory.renderDevices(datasets);
    assert.match(all, /目前每人上限 4 台/);
    const reviewed = f.filter('devices', 'status', 'review');
    assert.doesNotMatch(reviewed, /Person E001/);
    assert.match(reviewed, /Person E002/); assert.match(reviewed, /Person E003/);
    assert.match(reviewed, /已達目前 4 台上限/);
    assert.equal(f.requests.length, 0);
});

test('security policy view defaults to four slots and disables saving without management permission', async () => {
    const f = setup({ manage: false });
    const html = f.context.renderAdminSecuritySection({});
    assert.match(html, /<select name="maxDevicesPerEmployee" disabled>/);
    assert.match(html, /<option value="4" selected>4 台/);
    assert.doesNotMatch(html, /type="submit">儲存安全設定/);
    await f.context.handleDashboardSubmit({ target: new f.Form({ maxDevicesPerEmployee: '4' }), preventDefault() {} });
    assert.equal(f.requests.length, 0);
    assert.match(f.messages.at(-1)[1], /沒有修改安全設定的權限/);
});

test('security policy submission sends the selected device limit and rejects invalid values', async () => {
    const f = setup();
    const submit = (value) => f.context.handleDashboardSubmit({ target: new f.Form({ deviceBindingEnabled: 'true', maxDevicesPerEmployee: value, gpsRequiredOnPunch: 'false', maxGpsAccuracyMeters: '300' }), preventDefault() {} });
    await submit('4');
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].body.maxDevicesPerEmployee, 4);
    assert.equal(f.requests[0].body.deviceBindingEnabled, true);
    assert.equal(f.requests[0].body.gpsRequiredOnPunch, false);
    for (const invalid of ['0', '5', '2.5', 'x', '']) await submit(invalid);
    assert.equal(f.requests.length, 1);
    assert.match(f.messages.at(-1)[1], /1 至 4/);
});
