const assert = require('node:assert/strict');
const { test } = require('node:test');
const { recentTaipeiDateRange } = require('../admin-security-data');
const { startFixture } = require('./fixtures/browser-server');

test('Taipei remote review range includes exactly today and the previous 13 local dates', () => {
    const range = recentTaipeiDateRange(Date.parse('2026-10-17T00:05:00+08:00'));
    assert.deepEqual([range.startDate, range.endDate, range.days], ['2026-10-04', '2026-10-17', 14]);
    assert.equal(range.startAt, Date.parse('2026-10-04T00:00:00+08:00'));
    assert.equal(range.endAt, Date.parse('2026-10-18T00:00:00+08:00'));
});

test('admin directories preserve complete date range, source boundaries, permissions and confirmed employee-only removal', async (t) => {
    const fixture = await startFixture();
    t.after(() => fixture.close());
    const { db, url } = fixture;
    async function request(route, body, token) {
        const response = await fetch(url + '/api/browser' + route, {
            method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: body ? JSON.stringify(body) : undefined
        });
        return { status: response.status, ...await response.json() };
    }
    async function login(employeeId) {
        const account = await request('/login', { employeeId, secret: `${employeeId}-test-password`, role: 'account' });
        return request('/workspace', { role: 'admin' }, account.token);
    }
    const range = recentTaipeiDateRange();
    const punch = (id, timestamp, source, extra = {}) => db.addPunchRecord({ id, timestamp, source, type: 'in', status: '正常', shift: '', ...extra });
    for (let index = 0; index < 65; index += 1) punch('E001', range.startAt + 1000 + index, 'browser', {
        device_id: index % 2 ? 'device-1' : 'device-2', risk_flags: index === 0 ? ['gps_missing'] : []
    });
    punch('DELETED', range.endAt - 1, 'browser');
    punch('E001', range.startAt - 1, 'browser');
    punch('E001', range.endAt, 'browser');
    for (let index = 0; index < 60; index += 1) punch('E001', range.startAt + 3000 + index, 'manual');
    punch('E001', range.endAt - 2, 'card');
    const device = (employeeId, deviceId) => db.saveEmployeeDevice({ employee_id: employeeId, device_id: deviceId, device_name: deviceId, device_token_hash: 'never-send-this-hash' });
    device('E001', 'device-1'); device('E001', 'device-2'); device('A001', 'other-employee-device');
    const admin = await login('A001');
    assert.equal(admin.status, 200);
    const security = admin.dashboard.datasets.security;
    assert.equal(security.recentBrowserPunches.length, 66);
    assert.equal(security.recentBrowserPunchEmployees.length, 2);
    const current = security.recentBrowserPunchEmployees.find((group) => group.employeeId === 'E001');
    assert.equal(current.totalCount, 65);
    assert.equal(current.riskyCount, 1);
    assert.equal(current.deviceCount, 2);
    assert.equal(current.records.length, 65);
    const historical = security.recentBrowserPunchEmployees.find((group) => group.employeeId === 'DELETED');
    assert.equal(historical.employeeMissing, true);
    assert.equal(historical.employeeName, '已刪除員工');
    assert.equal(admin.dashboard.datasets.recentManualPunches.length, 50);
    assert.ok(admin.dashboard.datasets.recentManualPunches.every((record) => record.source === 'manual'));
    assert.equal(admin.dashboard.datasets.recentManualPunches.at(-1).timestamp, range.startAt + 3010);
    assert.ok(!JSON.stringify(security.employeeDevices).includes('never-send-this-hash'));

    const readonly = await login('A002');
    assert.equal(readonly.dashboard.datasets.recentManualPunches.length, 0);
    const clear = { employeeId: 'E001', confirmed: true, confirmEmployeeId: 'E001', expectedDeviceIds: ['device-1', 'device-2'] };
    assert.equal((await request('/admin/employee-devices/clear', clear, readonly.token)).status, 403);
    assert.equal((await request('/admin/employee-device/delete', { employeeId: 'E001', deviceId: 'device-1' }, readonly.token)).status, 403);
    assert.equal((await request('/admin/employee-devices/clear', { employeeId: 'E001' }, admin.token)).status, 400);
    assert.equal((await request('/admin/employee-devices/clear', { ...clear, confirmEmployeeId: 'A001' }, admin.token)).status, 400);
    device('E001', 'new-device');
    assert.equal((await request('/admin/employee-devices/clear', clear, admin.token)).status, 409);
    assert.equal(db.loadEmployeeDevices('E001').length, 3);
    const originalAudit = db.addAuditLog;
    db.addAuditLog = () => { throw new Error('injected audit failure'); };
    try {
        assert.equal((await request('/admin/employee-device/delete', { employeeId: 'E001', deviceId: 'device-1' }, admin.token)).status, 500);
        assert.equal((await request('/admin/employee-devices/clear', { ...clear, expectedDeviceIds: [...clear.expectedDeviceIds, 'new-device'] }, admin.token)).status, 500);
        assert.equal(db.loadEmployeeDevices('E001').length, 3);
    } finally { db.addAuditLog = originalAudit; }
    const result = await request('/admin/employee-devices/clear', { ...clear, expectedDeviceIds: [...clear.expectedDeviceIds, 'new-device'] }, admin.token);
    assert.equal(result.status, 200);
    assert.equal(db.loadEmployeeDevices('E001').length, 0);
    assert.equal(db.loadEmployeeDevices('A001').length, 1);
    assert.equal(db.loadPunchRecords().filter((record) => record.source === 'browser').length, 68);
    assert.ok(db.queryAuditLogs({ limit: 100 }).some((entry) => entry.target_type === 'employee_device' && entry.target_id === 'E001' && entry.before_data.length === 3));

    db.saveAccountAccessRecords([{ employee_id: 'A002', allowed_roles: ['employee', 'admin'], admin_preset: 'custom', admin_permissions: ['admin.manualPunch.create'] }]);
    const manualOnly = await login('A002');
    assert.equal(manualOnly.dashboard.datasets.security, null);
    assert.equal(manualOnly.dashboard.datasets.recentManualPunches.length, 50);
});
