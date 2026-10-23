const assert = require('node:assert/strict');
const { test } = require('node:test');
const { startFixture } = require('./fixtures/browser-server');
const at = (date, time) => Date.parse(`${date}T${time}:00+08:00`);

test('monthly leave audit returns complete results, honors filters and exports the same scope', async (t) => {
    const oldNow = Date.now;
    Date.now = () => at('2026-10-24', '12:00');
    const f = await startFixture(), { db } = f;
    t.after(async () => { await f.close(); Date.now = oldNow; });
    db.setSetting('browserSecuritySettings', { deviceBindingEnabled: false, gpsRequiredOnPunch: false });
    const api = async (route, token, body) => {
        const response = await fetch(`${f.url}/api/browser${route}`, { method: body ? 'POST' : 'GET',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            ...(body ? { body: JSON.stringify(body) } : {}) });
        return { status: response.status, ...await response.json() };
    };
    const login = async (id, secret, role) => {
        const account = await api('/login', null, { employeeId: id, secret, role: 'account' });
        return account.dashboard.role === 'workspace' ? (await api('/workspace', account.token, { role })).token : account.token;
    };
    const admin = await login('A001', 'A001-test-password', 'admin');
    const limited = await login('A002', 'A002-test-password', 'admin');
    const employee = await login('E001', 'employee-card', 'employee');
    const typeId = db.loadLeaveTypes().find((row) => row.enabled && !row.deducts_balance).id;
    const create = (id, date, employeeId = 'E001') => db.createLeaveRequest({ id, employee_id: employeeId,
        leave_type_id: typeId, supervisor_id: 'A001', status: 'approved', date_selection_mode: 'explicit_segments',
        leave_segments: [{ startAt: at(date, '09:00'), endAt: at(date, '15:00'), hours: 6 }], reason: id, created_at: 1, updated_at: 1 });
    create('october-many', '2026-10-10');
    create('september-missing', '2026-09-15');
    create('october-manager', '2026-10-11', 'A001');
    // More than the former 200-row cap must remain visible and exportable.
    for (let i = 0; i < 210; i++) db.addPunchRecord({ id: 'E001', timestamp: at('2026-10-10', '09:30') + i * 60000,
        type: 'in', shift: 'Test', status: '正常', source: 'manual' });
    const current = await api('/admin/leave-audit', admin);
    assert.equal(current.status, 200, current.error);
    assert.equal(current.data.filters.month, '2026-10');
    assert.equal(current.data.totalCount, 211);
    assert.equal(current.data.records.some((row) => row.requestId === 'september-missing'), false);
    assert.deepEqual(Object.keys(current.data.employees[0]).sort(), ['department', 'id', 'name']);
    const dashboard = await api('/dashboard', admin);
    assert.equal(dashboard.dashboard.datasets.leave.alerts.length, 211);
    assert.equal(dashboard.dashboard.datasets.leave.audit.filters.month, '2026-10');
    const filtered = await api('/admin/leave-audit?month=2026-10&employeeId=E001&department=Test&alertType=leave_window_punch_conflict', admin);
    assert.equal(filtered.data.totalCount, 210);
    assert.ok(filtered.data.records.every((row) => row.employeeId === 'E001' && row.alertType === 'leave_window_punch_conflict'));
    const exported = await api('/admin/leave-audit/export', admin, filtered.data.filters);
    assert.equal(exported.status, 200, exported.error);
    assert.equal(exported.data.totalCount, 210);
    assert.equal(exported.data.csvContent.split('\r\n').length, 211);
    assert.equal(exported.data.fileName, '請假出勤查核_2026-10.csv');
    assert.equal(exported.data.csvContent.includes('october-manager'), false);
    const prior = await api('/admin/leave-audit?month=2026-09', admin);
    assert.equal(prior.data.totalCount, 1);
    assert.equal(prior.data.records[0].requestId, 'september-missing');
    assert.equal((await api('/admin/leave-audit?month=2026-11', admin)).data.totalCount, 0);
    assert.equal((await api('/admin/leave-audit?month=2026-10&department=NoMatch', admin)).data.totalCount, 0);
    for (const query of ['month=2026-13', 'month=not-a-month', 'month=2026-10&month=2026-09', 'alertType=unknown']) {
        assert.equal((await api(`/admin/leave-audit?${query}`, admin)).status, 400);
    }
    for (const token of [limited, employee]) {
        assert.equal((await api('/admin/leave-audit?month=2026-10', token)).status, 403);
        assert.equal((await api('/admin/leave-audit/export', token, { month: '2026-10' })).status, 403);
    }
    assert.equal((await api('/admin/leave-audit', null)).status, 401);
    assert.equal((await api('/admin/leave-audit/export', admin, {})).data.totalCount, 211);
});
