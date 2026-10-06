const assert = require('node:assert/strict');
const { test } = require('node:test');
const Database = require('better-sqlite3');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { historyWindow, createRequestHistoryStore } = require('../request-history');
const { startFixture } = require('./fixtures/browser-server');
const monthOf = (at) => new Date(at + 8 * 3600000).toISOString().slice(0, 7);

test('history windows use Taipei calendar months, including current-only, year changes and leap months', () => {
    const now = Date.parse('2026-09-30T16:00:00Z');
    assert.equal(historyWindow(3, now).earliestMonth, '2026-07');
    assert.equal(historyWindow(0, now).startAt, now);
    assert.equal(historyWindow(3, Date.parse('2026-01-01T00:00:00+08:00')).earliestMonth, '2025-10');
    assert.equal(historyWindow(1, Date.parse('2028-03-31T12:00:00+08:00')).earliestMonth, '2028-02');
    assert.equal(historyWindow(null, now).earliestMonth, null);
});

test('history setting validation, revisions, atomic audit and portable SQLite persistence', async () => {
    const sql = new Database(':memory:');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tanchin-history-backup-'));
    try {
        sql.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE audit_test (value TEXT)');
        let failAudit = false;
        const store = createRequestHistoryStore(sql, (entry) => {
            sql.prepare('INSERT INTO audit_test VALUES (?)').run(JSON.stringify(entry));
            if (failAudit) throw new Error('Audit unavailable');
        });
        const before = store.state(), audit = (entry) => ({ ...entry, actor_id: 'ADMIN' });
        assert.deepEqual(before.settings, { leave: null, overtime: null });
        const valid = { revision: before.revision, settings: { leave: 3, overtime: 6 }, reason: 'Company policy', confirmHistory: true };
        for (const settings of [{ leave: -1, overtime: 3 }, { leave: 121, overtime: 3 }, { leave: 1.5, overtime: 3 }, { leave: '3', overtime: 3 }, { leave: false, overtime: 3 }, {}, []]) {
            assert.throws(() => store.save({ ...valid, settings }, audit)); assert.deepEqual(store.state(), before);
        }
        for (const patch of [{ reason: '' }, { reason: 'x'.repeat(501) }, { confirmHistory: false }, { revision: 'stale' }]) assert.throws(() => store.save({ ...valid, ...patch }, audit));
        failAudit = true; assert.throws(() => store.save(valid, audit), /Audit unavailable/);
        assert.deepEqual(store.state(), before); assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM audit_test').get().n, 0);
        failAudit = false; store.save(valid, audit);
        const saved = store.state(); assert.deepEqual(saved.settings, valid.settings);
        assert.throws(() => store.save(valid, audit), (error) => error.status === 409);
        const log = JSON.parse(sql.prepare('SELECT value FROM audit_test').get().value);
        assert.deepEqual(log.before_data, before.settings); assert.deepEqual(log.after_data.settings, valid.settings); assert.equal(log.actor_id, 'ADMIN');
        const backup = path.join(directory, 'restored.db'); await sql.backup(backup);
        const restored = new Database(backup);
        try { assert.deepEqual(createRequestHistoryStore(restored, () => {}).state(), saved); } finally { restored.close(); }
        sql.prepare('UPDATE settings SET value = ?').run('{"settings":{"leave":"invalid","overtime":null}}');
        assert.throws(() => store.window('leave'), (error) => error.status === 500);
    } finally { sql.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});

test('employee history APIs constrain existing sessions and dashboards without changing requests or authorized review', async (t) => {
    const fixture = await startFixture(), { db, url } = fixture;
    const inspection = new Database(fixture.databasePath);
    t.after(async () => { inspection.close(); await fixture.close(); });
    db.setSetting('browserSecuritySettings', { deviceBindingEnabled: false, gpsRequiredOnPunch: false });
    const start = historyWindow(3).startAt, allowedMonth = monthOf(start), oldMonth = monthOf(start - 86400000), currentMonth = monthOf(Date.now());
    for (const kind of ['leave', 'overtime']) {
        const create = kind === 'leave' ? db.createLeaveRequest : db.createOvertimeRequest;
        const seed = (id, from, until, status = 'approved', created = 1) => create({ id: `${kind}-${id}`, employee_id: 'E001', applicant_id: 'E001', applicant_role: 'employee',
            leave_type_id: 'annual', supervisor_id: 'A001', start_at: from, end_at: until, status, duration_hours: 2, reason: `PRIVATE ${id}`, created_at: created, updated_at: created });
        for (let i = 0; i < 90; i++) seed(`old-${i}`, start - 86400000, start - 80000000, 'approved', 1000 + i);
        seed('boundary', start - 3600000, start);
        seed('cross', start - 3600000, start + 3600000);
        seed('new', Date.now(), Date.now() + 3600000);
        seed('old-review', start - 86400000, start - 82800000, 'pending_supervisor');
    }
    const snapshot = () => JSON.stringify(['leave_requests', 'overtime_requests', 'leave_approval_steps', 'overtime_approval_steps'].map((table) => inspection.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
    const before = snapshot();
    async function request(route, token, body) {
        const response = await fetch(url + '/api/browser' + route, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
        return { status: response.status, ...await response.json() };
    }
    async function login(id, secret, role) {
        const account = await request('/login', null, { employeeId: id, secret, role: 'account' });
        assert.equal(account.status, 200, JSON.stringify(account));
        return account.dashboard.role === 'workspace' ? request('/workspace', account.token, { role }) : account;
    }
    const employee = await login('E001', 'employee-card', 'employee');
    const admin = await login('A001', 'A001-test-password', 'admin');
    const restricted = await login('A002', 'A002-test-password', 'admin');
    const supervisor = await login('A001', 'manager-card', 'employee');
    const system = await request('/login', null, { employeeId: 'system-admin', secret: 'system-admin-test', role: 'system_admin' });
    const settings = () => ({ settings: { leave: 3, overtime: 3 }, revision: db.getRequestHistory().state().revision, reason: 'Privacy policy', confirmHistory: true });
    await t.test('default upgrade is unrestricted; only security managers and independent system administrators may configure', async () => {
        assert.ok((await request('/employee/leave/calendar?month=' + oldMonth, employee.token)).calendar.totalCount > 0);
        for (const token of [null, employee.token, restricted.token]) {
            assert.ok([401, 403].includes((await request('/request-history/settings', token, settings())).status));
        }
        assert.deepEqual(db.getRequestHistory().state().settings, { leave: null, overtime: null });
        db.setSetting('developerImpersonationEnabled', true);
        const developer = await login('D001', 'D001-test-password', 'developer');
        assert.equal((await request('/developer/impersonation/start', developer.token, { targetRole: 'admin', systemPassword: '0000' })).status, 200);
        assert.equal((await request('/request-history/settings', developer.token, settings())).status, 403);
        assert.deepEqual(db.getRequestHistory().state().settings, { leave: null, overtime: null });
        assert.equal((await request('/request-history/settings', admin.token, settings())).status, 200);
        assert.ok(system.dashboard.datasets.requestHistorySettings);
    });
    await t.test('older months, forged employee ids, dates, scope and claimed bypass are rejected or remain scoped', async () => {
        for (const kind of ['leave', 'overtime']) {
            const blocked = await request(`/employee/${kind}/calendar?month=${oldMonth}&employeeId=A001&unlimited=true`, employee.token);
            assert.equal(blocked.status, 403); assert.ok(!JSON.stringify(blocked).includes('PRIVATE'));
            const current = await request(`/employee/${kind}/calendar?month=${allowedMonth}`, employee.token);
            assert.ok(current.calendar.detail.records.some((row) => row.id === `${kind}-cross`));
            assert.ok(!current.calendar.detail.records.some((row) => row.id === `${kind}-boundary`));
            const fakeReview = await request(`/employee/${kind}/calendar?month=${oldMonth}&scope=review`, employee.token);
            assert.equal(fakeReview.calendar.totalCount, 0);
            assert.equal((await request(`/employee/${kind}/calendar?month=${allowedMonth}&date=${oldMonth}-01`, employee.token)).status, 400);
            assert.equal((await request(`/employee/${kind}/calendar?month=${oldMonth}&scope=all`, employee.token)).status, 400);
        }
    });
    await t.test('dashboard filters before recent limits; old review, admin calendars and delegated supervisor history remain accessible', async () => {
        const dashboard = (await request('/dashboard', employee.token)).dashboard;
        for (const kind of ['leave', 'overtime']) {
            assert.deepEqual(dashboard[kind].myRequests.map((row) => row.id).sort(), [`${kind}-cross`, `${kind}-new`]);
            assert.equal(dashboard[kind].historyWindow.earliestMonth, allowedMonth);
            const review = await request(`/employee/${kind}/calendar?month=${oldMonth}&scope=review`, supervisor.token);
            assert.equal(review.calendar.detail.records[0].id, `${kind}-old-review`);
            const privileged = await request(`/admin/${kind}/calendar?month=${oldMonth}`, admin.token);
            assert.ok(privileged.calendar.totalCount >= 90);
            assert.equal((await request(`/admin/${kind}/calendar?month=${oldMonth}`, restricted.token)).status, 403);
        }
        db.getSupervisors().saveAssignments({ employeeId: 'E001', supervisorIds: ['A001'], revision: db.getSupervisors().assignmentsState().employees.find((e) => e.id === 'E001').revision, reason: 'Scoped history' }, (entry) => ({ ...entry, actor_id: 'SYSTEM' }));
        const supervisorAccount = await login('A001', 'A001-test-password', 'employee');
        const proxy = await request(`/employee/supervisor?month=${oldMonth}&employeeId=E001&kind=leave`, supervisorAccount.token);
        assert.equal(proxy.status, 200); assert.ok(proxy.proxy.calendar.totalCount >= 90);
    });
    await t.test('independent policies, current-month-only and restoring unlimited apply to the same employee token', async () => {
        const zero = { ...settings(), settings: { leave: 0, overtime: null } };
        assert.equal((await request('/request-history/settings', system.token, zero)).status, 200);
        assert.equal((await request('/employee/leave/calendar?month=' + allowedMonth, employee.token)).status, 403);
        assert.equal((await request('/employee/overtime/calendar?month=' + oldMonth, employee.token)).status, 200);
        assert.equal((await request('/dashboard', employee.token)).dashboard.leave.historyWindow.earliestMonth, currentMonth);
        assert.equal((await request('/request-history/settings', admin.token, { ...settings(), settings: { leave: null, overtime: null } })).status, 200);
        assert.equal((await request('/employee/leave/calendar?month=' + oldMonth, employee.token)).status, 200);
    });
    assert.equal(snapshot(), before, 'visibility settings must not rewrite any request, approval, status, hours or id');
});

test('employee calendar minimum, review exemption, stale cache cleanup and read-only setting markup', async () => {
    const state = { token: 'employee-token', dashboard: { role: 'employee', leave: { historyWindow: { earliestMonth: '2026-07', lookbackMonths: 3 } } } };
    const context = vm.createContext({ state, Date, Map, URLSearchParams, escapeHtml: (text) => String(text), hasCurrentAdminPermission: () => false,
        document: { addEventListener() {}, getElementById: () => null }, renderDashboard() {}, renderEmployeeLeaveRecordsPanel() {}, renderEmployeeOvertimeRecordsPanel() {}, renderEmployeeWorkspaceItems: () => [],
        getWorkspaceSubnavItemPanelHtml() {}, getAdminPaperRequest() {}, postRenderSetup() {}, handleDashboardClick() {}, handleRealtimeSyncMessage() {}, handleLogout() {},
        workspaceSubnavConfigs: { admin: { leave: { groups: [{ items: [{ id: 'records' }] }] }, overtime: { groups: [{ items: [{ id: 'records' }] }] } } },
        renderEmployeeLeaveRequestRows() {}, renderOvertimeRequestRows() {}, reloadDashboard: async () => {} });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../browser-client/request-calendar.js'), 'utf8'), context);
    const html = vm.runInContext("rcState('leave').month='2026-07'; rcRender('leave')", context);
    assert.match(html, /min="2026-07"/); assert.match(html, /aria-label="上個月"[^>]*disabled/); assert.match(html, /較早紀錄請洽/);
    assert.equal(vm.runInContext("rcState('leave').scope='review'; rcMinMonth('leave')", context), '2000-01');
    vm.runInContext("rcState('leave').scope='mine'; rcState('leave').month='2026-01'; rcResetHistory('leave')", context);
    assert.equal(vm.runInContext("rcState('leave').month", context), '2026-07');
    vm.runInContext("rcState('leave').cache.set('private', {}); rcState('leave').data = { private: true }", context);
    await vm.runInContext("handleRealtimeSyncMessage({ type: 'requestHistorySettings' })", context);
    assert.equal(vm.runInContext("rcState('leave').cache.size", context), 0); assert.equal(vm.runInContext("rcState('leave').data", context), null);
    let message = '', reloads = 0;
    context.document.querySelector = () => ({ dataset: { historyDirty: 'true' }, querySelector: () => ({}) });
    context.setMessage = (_element, text) => { message = text; };
    context.reloadDashboard = async () => { reloads++; };
    state.dashboard.role = 'admin';
    await vm.runInContext("handleRealtimeSyncMessage({ type: 'requestHistorySettings', sessionToken: 'peer' })", context);
    assert.match(message, /未儲存內容已保留/); assert.equal(reloads, 0);
    context.document.querySelector = () => null;
    context.document.querySelectorAll = () => [{ value: 'Unsaved review comment' }];
    state.dashboard.role = 'employee';
    context.requestJson = async () => ({ dashboard: { role: 'employee', leave: { historyWindow: { earliestMonth: '2026-10' } } } });
    vm.runInContext("rcState('leave').scope='review'; rcState('leave').data={reviewDraft: true}; rcState('leave').cache.set('review', {})", context);
    await vm.runInContext("handleRealtimeSyncMessage({ type: 'requestHistorySettings', sessionToken: 'peer' })", context);
    assert.equal(vm.runInContext("rcState('leave').data.reviewDraft", context), true);
    assert.equal(state.dashboard.leave.historyWindow.earliestMonth, '2026-10');
    const source = fs.readFileSync(path.join(__dirname, '../browser-client/app.js'), 'utf8');
    vm.runInContext(source.slice(source.indexOf('function renderRequestHistorySettings('), source.indexOf('function renderAdminSecuritySection(')), context);
    context.data = { settings: { leave: 0, overtime: null }, revision: 'r' };
    assert.match(vm.runInContext('renderRequestHistorySettings(data)', context), /fieldset[^>]*disabled/);
    state.dashboard.role = 'system_admin';
    const form = vm.runInContext('renderRequestHistorySettings(data)', context);
    assert.match(form, /name="leaveMonths"[^>]*value="0"/); assert.match(form, /name="overtimeMonths"[^>]*disabled/); assert.match(form, /確認更新全體員工/);
    assert.match(source, /id: "requestHistory", label: "員工紀錄可見範圍", panelIndex: 5/);
});
