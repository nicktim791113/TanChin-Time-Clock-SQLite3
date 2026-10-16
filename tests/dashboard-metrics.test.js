const assert = require('node:assert/strict');
const { test } = require('node:test');
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildDashboardMetrics, createDashboardMetricStore } = require('../dashboard-metrics');
const { startFixture } = require('./fixtures/browser-server');

test('seven Taipei dates count unique approved people, actual leave days, midnight boundaries and current versus submitted meals', () => {
    const at = (s) => Date.parse(s + '+08:00'), now = at('2027-01-01T00:01:00');
    const leaves = [
        { id: 'gap', employee_id: 'E1', status: 'approved', start_at: at('2026-12-30T09:00:00'), end_at: at('2027-01-02T00:00:00') },
        { id: 'same', employee_id: 'E1', status: 'approved', start_at: at('2027-01-01T10:00:00'), end_at: at('2027-01-01T11:00:00') },
        { id: 'second', employee_id: 'E2', status: 'approved', start_at: at('2027-01-01T10:00:00'), end_at: at('2027-01-01T11:00:00') },
        { id: 'pending', employee_id: 'E3', status: 'pending_admin', start_at: at('2027-01-01T10:00:00'), end_at: at('2027-01-01T11:00:00') }
    ];
    const db = { queryLeaveRequests: () => leaves, queryOvertimeRequests: () => leaves,
        getLeaveEntitlements: () => ({ charges: (id) => id === 'gap' ? [{ date: '2026-12-30', hours: 8 }, { date: '2027-01-01', hours: 8 }] : [] }),
        loadEmployees: () => [{ id: 'E1', name: 'Name', card: 'secret-card', salary: 123 }],
        getMeals: () => ({ dayState: (date) => ({ date, serving: date === '2027-01-01', currentCount: date === '2027-01-01' ? 2 : 0, submittedCount: 3, rows: [{ eligible: true }, { eligible: true }, { eligible: false }] }) }) };
    const metrics = buildDashboardMetrics(db, () => true, {}, now), get = (key) => metrics.catalog.find((c) => c.key === key);
    assert.equal(metrics.catalog.length, 27);
    assert.deepEqual(metrics.catalog.filter((c) => c.key.startsWith('leaveDay:')).map((c) => c.date), ['2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03', '2027-01-04']);
    assert.equal(get('leaveDay:-1').value, 0); assert.equal(get('overtimeDay:-1').value, 1);
    assert.equal(get('leaveDay:0').value, 2); assert.equal(get('leaveDay:1').value, 0);
    assert.equal(get('leavePendingAdmin').value, 1);
    assert.equal(get('mealToday').value, 2); assert.match(get('mealToday').subtitle, /已交單 3/);
    assert.equal(get('mealTomorrow').value, 0); assert.match(get('mealTomorrow').subtitle, /未供餐/);
    assert.equal(get('mealParticipants').value, 2);
    assert.ok(!JSON.stringify(metrics.roster).includes('secret-card')); assert.ok(!JSON.stringify(metrics.roster).includes('salary'));
    const limited = buildDashboardMetrics(db, (p) => p === 'admin.leave.balances.view', {}, now);
    assert.equal(limited.catalog.find((c) => c.key === 'leaveDay:0').value, null);
    assert.equal(limited.roster.length, 1);
});

test('eight slots persist per account, enforce revision and permissions, and roll back audit failure', () => {
    const sql = new Database(':memory:'); let failAudit = false;
    const store = createDashboardMetricStore(sql, () => { if (failAudit) throw Error('audit failed'); });
    const catalog = Array.from({ length: 12 }, (_, i) => ({ key: String(i), available: true }));
    try {
        const initial = store.preferences('A', catalog), keys = [...initial.cardKeys].reverse();
        const body = { cardKeys: keys, confirm: true, revision: initial.revision };
        const saved = store.save('A', body, catalog, (e) => e);
        assert.deepEqual(store.preferences('A', catalog).cardKeys, keys);
        assert.notDeepEqual(store.preferences('B', catalog).cardKeys, keys);
        assert.throws(() => store.save('A', body, catalog, (e) => e), (e) => e.statusCode === 409);
        for (const changes of [{ cardKeys: ['0'] }, { cardKeys: Array(8).fill('0') }, { cardKeys: [...keys.slice(1), 'forbidden'] }, { confirm: false }])
            assert.throws(() => store.save('A', { ...body, revision: saved.revision, ...changes }, catalog, (e) => e));
        failAudit = true;
        assert.throws(() => store.save('A', { ...body, revision: saved.revision, cardKeys: initial.cardKeys }, catalog, (e) => e), /audit failed/);
        assert.deepEqual(store.preferences('A', catalog), saved);
        const restricted = store.preferences('A', catalog.map((c, i) => ({ ...c, available: i < 3 })));
        assert.equal(restricted.cardKeys.length, 8); assert.equal(restricted.cardKeys.filter(Boolean).length, 3);
        store.removeEmployees(['A']); assert.equal(store.preferences('A', catalog).revision, 'new');
    } finally { sql.close(); }
});

test('dashboard and detail routes use complete counts, authorized data, pagination and account-owned settings', async (t) => {
    const fixture = await startFixture(), { db, url } = fixture;
    t.after(() => fixture.close());
    db.setSetting('browserSecuritySettings', { deviceBindingEnabled: false, gpsRequiredOnPunch: false });
    const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10), start = Date.parse(today + 'T09:00:00+08:00');
    for (let i = 0; i < 123; i++) for (const kind of ['leave', 'overtime'])
        db[kind === 'leave' ? 'createLeaveRequest' : 'createOvertimeRequest']({ id: `${kind}-${i}`, employee_id: 'E001', applicant_id: 'E001', applicant_role: 'employee', leave_type_id: db.loadLeaveTypes()[0].id,
            supervisor_id: 'A001', status: i < 120 ? 'pending_supervisor' : 'approved', start_at: start, end_at: start + 3600000, duration_hours: 1, reason: '', created_at: i + 1, updated_at: i + 1 });
    async function request(route, token, body) {
        const response = await fetch(url + '/api/browser' + route, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
        return { status: response.status, ...await response.json() };
    }
    async function login(id, role) {
        const a = await request('/login', null, { employeeId: id, secret: `${id}-test-password`, role: 'account' });
        return request('/workspace', a.token, { role });
    }
    const admin = await login('A001', 'admin'), supervisor = await login('A001', 'employee'), limited = await login('A002', 'admin');
    const dashboard = (await request('/dashboard', admin.token)).dashboard;
    assert.equal(dashboard.dashboardMetrics.cardKeys.length, 8);
    assert.equal(dashboard.dashboardMetrics.catalog.find((c) => c.key === 'leavePendingSupervisor').value, 120);
    assert.equal(dashboard.dashboardMetrics.catalog.find((c) => c.key === 'leaveDay:0').value, 1);
    const review = (await request('/dashboard', supervisor.token)).dashboard;
    assert.equal(review.supervisorReview.count, 240); assert.equal(review.supervisorReview.leaveCount, 120);
    const seen = new Set();
    for (let page = 1; page <= 3; page++) {
        const result = await request(`/admin/dashboard-metrics/detail?key=leavePendingSupervisor&page=${page}`, admin.token);
        assert.equal(result.status, 200); assert.equal(result.detail.totalRecords, 120);
        result.detail.records.forEach((r) => { assert.ok(!seen.has(r.id)); seen.add(r.id); });
    }
    assert.equal(seen.size, 120);
    assert.equal((await request('/admin/dashboard-metrics/detail?key=leaveDay:0&date=2000-01-01', admin.token)).status, 409);
    assert.equal((await request('/admin/dashboard-metrics/detail?key=leavePendingSupervisor&page=0', admin.token)).status, 400);
    for (const token of [undefined, supervisor.token, limited.token]) assert.ok([401, 403].includes((await request('/admin/dashboard-metrics/detail?key=leavePendingSupervisor', token)).status));
    const body = { cardKeys: [...dashboard.dashboardMetrics.cardKeys].reverse(), revision: dashboard.dashboardMetrics.revision, confirm: true, employeeId: 'A002' };
    assert.equal((await request('/admin/dashboard-metrics/preferences', admin.token, body)).status, 200);
    assert.deepEqual(db.getDashboardMetrics().preferences('A001', dashboard.dashboardMetrics.catalog).cardKeys, body.cardKeys);
    assert.equal(db.getDashboardMetrics().preferences('A002', dashboard.dashboardMetrics.catalog).revision, 'new');
    const access = db.getAccountAccessRecord('A002');
    db.saveAccountAccessRecord({ ...access, admin_permissions: ['admin.leave.balances.view'] });
    const quotaOnly = (await request('/dashboard', limited.token)).dashboard;
    assert.equal(quotaOnly.dashboardMetrics.roster.length, 4);
    assert.equal(quotaOnly.summary.todayPunchCount, 0);
    assert.equal(quotaOnly.insights.todayAttendance.records.length, 0);
    assert.ok(quotaOnly.dashboardMetrics.catalog.filter((c) => !c.available).every((c) => c.value === null));
});

test('metric rendering has eight cards, escapes reviewer data, exposes jump controls and rejects stale details', async () => {
    const context = vm.createContext({ URLSearchParams, state: {}, ui: {}, auditActionLabels: {}, auditTargetTypeLabels: {}, document: { getElementById() {} },
        escapeHtml: (v) => String(v).replaceAll('<', '&lt;').replaceAll('"', '&quot;'), getScopedAttendanceSummary: () => ({ normalEmployees: [], abnormalRecords: [], failureLogs: [] }),
        renderAdminEmployeeInsight() {}, renderAdminTodayNormalInsight() {}, renderAdminAbnormalInsight() {}, getAdminInsightTitle() {}, renderAdminDashboardInsightContent() {},
        handleDashboardClick() {}, renderEmployeeDashboard: () => '<main></main>', renderDashboard() {}, handleRealtimeSyncMessage() {}, handleLogout() {} });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../browser-client/dashboard-metrics.js'), 'utf8'), context);
    context.dashboard = { dashboardMetrics: { cardKeys: Array.from({ length: 8 }, (_, i) => `leaveDay:${i}`), catalog: Array.from({ length: 8 }, (_, i) => ({ key: `leaveDay:${i}`, label: `<unsafe${i}>`, available: true, value: i })) } };
    const html = vm.runInContext('renderDashboardMetricStrip(dashboard)', context);
    assert.equal((html.match(/data-metric-slot=/g) || []).length, 8); assert.ok(!html.includes('<unsafe'));
    const notice = vm.runInContext("renderEmployeeDashboard({supervisorReview:{canUse:true,count:240,leaveCount:120,overtimeCount:120}})", context);
    assert.match(notice, /待我審核/); assert.match(notice, /data-kind="overtime"/);
    const progress = vm.runInContext("renderRequestReviewProgress({status:'pending_supervisor',reviewPolicy:{mode:'required',reviewers:[{id:'A',name:'<script>',required:1,decision:'approved',comment:'<evil>'}]}})", context);
    assert.match(progress, /必審 1\/1/); assert.ok(!progress.includes('<script>')); assert.ok(!progress.includes('<evil>'));
    context.state.dashboard = context.dashboard;
    context.openAdminDashboardInsight = (key) => { context.state.activeInsightKey = key; };
    context.refreshAdminDashboardInsightModal = () => {};
    const pending = []; context.requestJson = () => new Promise((resolve) => pending.push(resolve));
    const first = vm.runInContext("dmLoadDetail('leaveDay:0')", context), second = vm.runInContext("dmLoadDetail('leaveDay:1')", context);
    pending[1]({ detail: { metric: { key: 'leaveDay:1' } } }); await second;
    pending[0]({ detail: { metric: { key: 'leaveDay:0' } } }); await first;
    assert.equal(vm.runInContext('dmState.detail.metric.key', context), 'leaveDay:1');
});
