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
function setup({ manage = true, view = true, datasets = {}, queryResponse } = {}) {
    const listeners = {}, requests = [], messages = [];
    const diagnosticResults = { innerHTML: '' };
    let mounted = false;
    const diagnosticSection = { dataset: { directoryKind: 'diagnostics' }, querySelector: () => diagnosticResults };
    const state = { token: 'session-one', dashboard: { role: 'admin', user: { id: 'A001' }, datasets } };
    class Form {
        constructor(values = {}) { this.values = values; }
        getAttribute(name) { return name === 'id' ? 'security-settings-form' : null; }
    }
    const context = vm.createContext({ state, Date, URLSearchParams, window: {}, ui: {}, HTMLFormElement: Form,
        FormData: class { constructor(form) { this.form = form; } entries() { return Object.entries(this.form.values); } },
        document: { addEventListener(type, fn) { (listeners[type] ||= []).push(fn); }, querySelector: () => mounted ? diagnosticSection : null },
        getDatasets: () => state.dashboard.datasets,
        hasCurrentAdminPermission: (permission) => permission === 'admin.security.view' ? view : manage && permission === 'admin.security.manage',
        escapeHtml: (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'),
        renderEmptyState: (message) => `<p>${message}</p>`,
        renderBrowserPunchPermissions: () => '', renderRequestHistorySettings: () => '',
        renderDashboard() {}, handleLogout() {}, handleDashboardSubmit() {}, setMessage() {},
        setFormMessage: (...args) => messages.push(args), reloadDashboard: async () => {},
        requestJson: async (url, options) => { requests.push({ url, ...options }); return queryResponse ? queryResponse(url, options) : {}; }
    });
    vm.runInContext(section('function renderBadge(', 'function renderEmployeeDashboard('), context);
    vm.runInContext(directory, context);
    vm.runInContext(section('function renderAdminSecuritySection(', 'const originalRenderEmployeeDashboardWithSecurity'), context);
    vm.runInContext(section('const originalHandleDashboardSubmitWithSecurity', 'const originalHandleDashboardClickWithCardCapture'), context);
    const emit = (type, event) => Promise.all((listeners[type] || []).map((fn) => fn(event)));
    const filter = (kind, name, value) => {
        const results = { innerHTML: '' }, container = { dataset: { directoryKind: kind }, querySelector: () => results };
        const control = { value, dataset: { directoryFilter: name }, matches: () => true,
            closest: (selector) => selector === '[data-directory-kind]' ? container : null };
        emit('input', { target: control });
        return results.innerHTML;
    };
    const submitQuery = () => emit('submit', { target: { closest: (selector) => selector === '[data-directory-diagnostics-query]' ? { checkValidity: () => true } : null }, preventDefault() {} });
    const page = (action) => emit('click', { target: { closest: () => ({ dataset: { directoryAction: `diagnostics-${action}` } }) } });
    return { context, state, emit, filter, requests, messages, Form, submitQuery, page, diagnosticResults,
        mount: () => { mounted = true; }, directory: context.window.AdminDirectory };
}
function diagnostic(employeeId, extra = {}) {
    return { id: `event-${employeeId}`, timestampText: '2026/10/20 08:00:00', employeeId, employeeName: `Person ${employeeId}`, department: 'Test',
        stage: 'login', success: false, failureCode: 'P211', reason: 'Device limit reached', deviceId: `device-${employeeId}`,
        deviceName: 'Test browser', platform: 'Windows', browserName: 'Chrome', siteOrigin: 'http://test-host:3000',
        ipAddress: '192.0.2.1', userAgent: 'Synthetic test agent', tokenPresent: false, boundDeviceCount: 4, maxDevicesPerEmployee: 4, ...extra };
}

test('diagnostics query the selected employee on the server before pagination and label the old summary separately', async () => {
    const datasets = { employees: [{ id: 'E001', name: 'Person E001' }, { id: 'E002', name: 'Person E002' }], security: { deviceLoginDiagnostics: { records: [diagnostic('E001')], limit: 200 } } };
    const f = setup({ datasets, queryResponse: (url) => { const p = new URL(url, 'http://fixture.invalid').searchParams; return { records: [diagnostic('E002', { success: true, failureCode: '', tokenPresent: true })], total: 51, page: Number(p.get('page')), pageSize: 25, startDate: p.get('startDate'), endDate: p.get('endDate') }; } });
    const html = f.directory.renderDiagnostics(datasets);
    assert.match(html, /value="failure" selected/);
    assert.match(html, /工作台載入時摘要（僅最近 14 日最新 200 筆，不套用上方查詢）/);
    assert.match(html, /<details class="directory-diagnostic-preview">/);
    f.filter('diagnostics', 'employeeId', 'E002'); f.filter('diagnostics', 'status', 'all');
    f.filter('diagnostics', 'startDate', '2026-10-01'); f.filter('diagnostics', 'endDate', '2026-10-28');
    f.mount(); await f.submitQuery();
    const params = new URL(f.requests[0].url, 'http://fixture.invalid').searchParams;
    assert.equal(params.get('employeeId'), 'E002'); assert.equal(params.get('result'), 'all');
    assert.equal(params.get('page'), '1'); assert.equal(params.get('pageSize'), '25');
    assert.equal(f.requests[0].auth, true);
    assert.match(f.diagnosticResults.innerHTML, /Person E002/); assert.doesNotMatch(f.diagnosticResults.innerHTML, /Person E001/);
    assert.match(f.diagnosticResults.innerHTML, /共 51 筆/); assert.match(f.diagnosticResults.innerHTML, /第 1 \/ 3 頁/);
    f.filter('diagnostics', 'employeeId', 'E001'); // Unsaved filters must not change the next page's query.
    await f.page('next'); await new Promise(resolve => setImmediate(resolve));
    const next = new URL(f.requests.at(-1).url, 'http://fixture.invalid').searchParams;
    assert.equal(next.get('page'), '2'); assert.equal(next.get('employeeId'), 'E002');
    assert.match(f.diagnosticResults.innerHTML, /第 2 \/ 3 頁/);
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

test('empty diagnostics explain the collection boundary and account change resets the employee query', () => {
    const datasets = { security: { deviceLoginDiagnostics: { records: [diagnostic('E001')] } } };
    const f = setup({ datasets });
    f.filter('diagnostics', 'startDate', '2020-01-01');
    assert.match(f.directory.renderDiagnostics(datasets), /value="2020-01-01"/);
    f.emit('DOMContentLoaded');
    f.state.token = 'session-two';
    f.context.renderDashboard(f.state.dashboard);
    const restored = f.directory.renderDiagnostics(datasets);
    assert.doesNotMatch(restored, /value="2020-01-01"/);
    assert.match(restored, /value="failure" selected/);
    assert.match(f.directory.renderDiagnostics({}), /不會補記過去未留下的登入失敗/);
});

test('management without security viewing permission does not render or query diagnostics', async () => {
    const datasets = { security: { deviceLoginDiagnostics: { records: [diagnostic('E001')] } } };
    const f = setup({ manage: true, view: false, datasets });
    for (const html of [f.directory.renderDiagnostics(datasets)]) {
        assert.match(html, /沒有「安全設定檢視」權限/);
        assert.doesNotMatch(html, /Person E001|尚無最近|已載入紀錄/);
    }
    f.mount(); await f.submitQuery(); assert.equal(f.requests.length, 0);
});

test('diagnostics explain retained cookie recovery separately from new identities and unrecorded legacy storage', () => {
    const datasets = { security: { deviceLoginDiagnostics: { records: [diagnostic('E001', {
        identitySource: 'cookie', tokenSource: 'cookie', localStorageStatus: 'unavailable', cookieStorageStatus: 'available', identityRecovered: true
    }), diagnostic('E002')] } } };
    const html = setup({ datasets }).directory.renderDiagnostics(datasets);
    assert.match(html, /從 Cookie 備援恢復/); assert.match(html, /已用有效憑證找回原綁定/);
    assert.match(html, /不可用 \/ 可用/); assert.match(html, /舊紀錄未記錄/);
});

test('diagnostics auto-load once after mounting and use Taipei dates rather than the machine time zone', async () => {
    const f = setup({ queryResponse: () => ({ records: [], total: 0, page: 1, pageSize: 25, startDate: '2026-10-15', endDate: '2026-10-28' }) });
    f.mount(); f.directory.renderDiagnostics({}); f.directory.renderDiagnostics({});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.requests.length, 1);
    const params = new URL(f.requests[0].url, 'http://fixture.invalid').searchParams;
    const today = new Date(Date.now() + 8 * 60 * 60 * 1000);
    assert.equal(params.get('endDate'), today.toISOString().slice(0, 10));
    assert.equal(params.get('startDate'), new Date(today.getTime() - 13 * 86400000).toISOString().slice(0, 10));
    assert.match(f.diagnosticResults.innerHTML, /這個查詢範圍沒有紀錄/);
});

test('newer employee queries win and responses from a previous login never reappear', async () => {
    const pending = [];
    const f = setup({ queryResponse: () => new Promise(resolve => pending.push(resolve)) });
    f.emit('DOMContentLoaded'); f.mount();
    f.filter('diagnostics', 'employeeId', 'E001'); const first = f.submitQuery();
    f.filter('diagnostics', 'employeeId', 'E002'); const second = f.submitQuery();
    const result = (id) => ({ records: [diagnostic(id)], total: 1, page: 1, pageSize: 25, startDate: '2026-10-15', endDate: '2026-10-28' });
    pending[1](result('E002')); await second;
    pending[0](result('E001')); await first;
    assert.match(f.diagnosticResults.innerHTML, /Person E002/); assert.doesNotMatch(f.diagnosticResults.innerHTML, /Person E001/);
    const stale = f.submitQuery();
    f.state.token = 'another-login'; f.context.renderDashboard(f.state.dashboard);
    f.diagnosticResults.innerHTML = 'New session content';
    pending[2](result('E002')); await stale;
    assert.equal(f.diagnosticResults.innerHTML, 'New session content');
    assert.doesNotMatch(f.directory.renderDiagnostics({}), /Person E002/);
});

test('query errors are escaped and do not leave old successful results on screen', async () => {
    let fail = false;
    const f = setup({ queryResponse: () => {
        if (fail) throw new Error('<img src=x onerror=alert(1)>');
        return { records: [diagnostic('E001')], total: 1, page: 1, pageSize: 25, startDate: '2026-10-15', endDate: '2026-10-28' };
    } });
    f.mount(); await f.submitQuery(); assert.match(f.diagnosticResults.innerHTML, /Person E001/);
    fail = true; await f.submitQuery();
    assert.match(f.diagnosticResults.innerHTML, /role="alert"/); assert.match(f.diagnosticResults.innerHTML, /&lt;img/);
    assert.doesNotMatch(f.diagnosticResults.innerHTML, /<img|Person E001/);
});

test('diagnostic outcome details distinguish proof verification from persistence and escape device IDs', () => {
    const datasets = { security: { deviceLoginDiagnostics: { records: [diagnostic('E001', {
        originalDeviceId: '<script>request</script>', canonicalDeviceId: '<script>canonical</script>', bindingOutcome: 'recovered',
        boundDeviceCountBefore: 4, boundDeviceCountAfter: 4, tokenVerification: 'verified', tokenCandidateCount: 2, persistenceStatus: 'partial'
    })] } } };
    const html = setup({ datasets }).directory.renderDiagnostics(datasets);
    assert.doesNotMatch(html, /<script>/); assert.match(html, /&lt;script&gt;request/);
    assert.match(html, /恢復原綁定/); assert.match(html, /4 → 4/); assert.match(html, /有效 · 2 份候選/);
    assert.match(html, /僅部分位置保存成功/);
});

test('manual recovery is distinct from automatic credential recovery and retained proof is not a save failure', () => {
    const datasets = { security: { deviceLoginDiagnostics: { records: [diagnostic('E001', {
        stage: 'device_recovery', identityRecovered: true, persistenceStatus: 'retained'
    })] } } };
    const html = setup({ datasets }).directory.renderDiagnostics(datasets);
    assert.match(html, /已經管理者確認恢復/); assert.doesNotMatch(html, /已用有效憑證找回原綁定/);
    assert.match(html, /沿用既存憑證（無法重新寫入）/);
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
