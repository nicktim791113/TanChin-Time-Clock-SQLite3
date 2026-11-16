const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeRequestReason } = require('../request-reason');
const { startFixture } = require('./fixtures/browser-server');

test('online reason requires five non-whitespace Unicode characters and preserves text', () => {
    for (const kind of ['leave', 'overtime']) {
        for (const value of [undefined, null, {}, 12345, '', ' \t\n　', '四個字元', '四 個 字 元 ', '𠮷𠮷文字']) {
            assert.throws(() => normalizeRequestReason(kind, value), error => error.statusCode === 400 && /5 個非空白字元/.test(error.message));
        }
        assert.equal(normalizeRequestReason(kind, '  安排家庭事  '), '安排家庭事');
        assert.equal(normalizeRequestReason(kind, '𠮷𠮷𠮷𠮷𠮷'), '𠮷𠮷𠮷𠮷𠮷');
        assert.equal(normalizeRequestReason(kind, '安排\n家庭事'), '安排\n家庭事');
    }
    assert.equal(normalizeRequestReason('overtime', 'a'.repeat(2001)).length, 2001);
    assert.equal(normalizeRequestReason('overtime', 'a'.repeat(2001), { maxLength: 2000 }).length, 2000);
});

test('all four online submission APIs reject blank/short reasons without creating records', async t => {
    const fixture = await startFixture(), { db, url } = fixture;
    t.after(() => fixture.close());
    db.setSetting('browserSecuritySettings', { deviceBindingEnabled: false, gpsRequiredOnPunch: false });
    db.saveLeaveApprovalRoutes([{ department: '*', supervisor_id: 'A001', enabled: true }]);
    const grants = db.getSupervisors();
    grants.saveAssignments({ employeeId: 'E001', supervisorIds: ['A001'], reason: 'Fixture proxy authorization',
        revision: grants.assignmentsState().employees.find(row => row.id === 'E001').revision },
    entry => ({ ...entry, actor_id: 'fixture', actor_role: 'system' }));
    async function api(route, token, body) {
        const response = await fetch(`${url}/api/browser${route}`, { method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
        return { status: response.status, ...await response.json() };
    }
    async function login(employeeId, secret) {
        let result = await api('/login', '', { employeeId, secret, role: 'account' });
        assert.equal(result.status, 200, JSON.stringify(result));
        if (result.dashboard.role === 'workspace') result = await api('/workspace', result.token, { role: 'employee' });
        assert.equal(result.status, 200, JSON.stringify(result));
        return result.token;
    }
    const employee = await login('E001', 'employee-card');
    const manager = await login('A001', 'A001-test-password');
    const leaveTypeId = db.loadLeaveTypes().find(row => row.enabled).id;
    let day = 16;
    for (const kind of ['leave', 'overtime']) for (const proxy of [false, true]) {
        const date = `2026-11-${day++}`;
        const body = { startDate: date, endDate: date, startTime: '09:00', endTime: '10:00', durationHours: 1, breakMinutes: 0,
            ...(kind === 'leave' ? { leaveTypeId } : {}),
            ...(proxy ? { employeeIds: ['E001'], proxyReason: '依員工通知協助登記', confirmApproval: true } : {}) };
        const route = proxy ? `/employee/supervisor/${kind}` : `/employee/${kind}/request`;
        const token = proxy ? manager : employee;
        const records = () => (kind === 'leave' ? db.queryLeaveRequests : db.queryOvertimeRequests)({ employeeId: 'E001', limit: null });
        const before = records().length;
        for (const reason of [undefined, '', ' \t\n　', '四個字元', '四 個 字 元 ', '𠮷𠮷文字', { text: '安排家庭事' }]) {
            const result = await api(route, token, { ...body, reason });
            assert.equal(result.status, 400, `${route}: ${JSON.stringify(result)}`);
            assert.match(result.error, new RegExp(`${kind === 'leave' ? '請假' : '加班'}事由.*5 個非空白字元`));
            assert.equal(records().length, before, `${route} must not partially save`);
        }
        const accepted = await api(route, token, { ...body, reason: '  安排家庭事  ' });
        assert.equal(accepted.status, 200, `${route}: ${JSON.stringify(accepted)}`);
        assert.equal(records().length, before + 1);
        const saved = records().find(row => row.start_at === Date.parse(`${date}T09:00:00+08:00`));
        assert.equal(saved.reason, '安排家庭事');
        if (proxy) assert.equal(saved.proxy_reason, body.proxyReason);
    }
});
