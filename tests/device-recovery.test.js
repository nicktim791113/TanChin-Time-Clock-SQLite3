'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Database = require('better-sqlite3');
const { startFixture } = require('./fixtures/browser-server');

test('verified backup candidates, manager recovery and employee diagnostics preserve device security', async (t) => {
    const fixture = await startFixture();
    const { db, url } = fixture;
    const sql = new Database(fixture.databasePath);
    t.after(async () => { sql.close(); await fixture.close(); });
    async function request(route, body, token) {
        const response = await fetch(`${url}/api/browser${route}`, { method: body == null ? 'GET' : 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: body == null ? undefined : JSON.stringify(body) });
        return { httpStatus: response.status, ...await response.json() };
    }
    const device = (id, extra = {}) => ({ deviceId: id, deviceName: 'Fixture browser', platform: 'Windows', browserName: 'Edge',
        localStorageStatus: 'available', cookieStorageStatus: 'available', ...extra });
    const login = (id, secret, info) => request('/login', { employeeId: id, secret, role: 'account', deviceInfo: info });
    async function admin(id) {
        const auth = await login(id, `${id}-test-password`);
        return request('/workspace', { role: 'admin' }, auth.token);
    }
    const manager = await admin('A001'), viewer = await admin('A002');
    db.setSetting('browserSecuritySettings', { deviceBindingEnabled: true, maxDevicesPerEmployee: 4 });
    const bound = [];
    for (let i = 1; i <= 4; i++) bound.push(await login('E001', 'employee-card', device(`old-${i}`)));
    const token1 = bound[0].deviceBinding.issuedDeviceToken;
    const token2 = bound[1].deviceBinding.issuedDeviceToken;
    const recover = (id, extra = {}) => request('/device-recovery/request', {
        employeeId: 'E001', secret: 'employee-card', deviceInfo: device(id), reason: '同一電腦網站資料遺失', ...extra
    });
    const proof = (row) => ({ requestId: row.requestId, requestToken: row.requestToken });

    await t.test('a valid backup wins over stale primary; ambiguity is rejected without mutation', async () => {
        const result = await login('E001', 'employee-card', device('regenerated', {
            deviceToken: 'stale-local-proof', deviceTokenCandidates: ['stale-local-proof', token1]
        }));
        assert.equal(result.httpStatus, 200);
        assert.equal(result.deviceBinding.deviceId, 'old-1');
        assert.equal(result.deviceBinding.verifiedDeviceToken, token1);
        assert.equal(result.deviceBinding.issuedDeviceToken, '');
        assert.equal(result.deviceBinding.identityRecovered, true);
        assert.equal(db.loadEmployeeDevices('E001').length, 4);
        const ambiguous = await login('E001', 'employee-card', device('old-1', { deviceTokenCandidates: [token1, token2] }));
        assert.equal(ambiguous.httpStatus, 403);
        assert.match(ambiguous.error, /P217/);
        const foreign = await login('A002', 'delegated-card', device('other-employee', { deviceTokenCandidates: [token1] }));
        assert.equal(foreign.httpStatus, 200);
        assert.notEqual(foreign.deviceBinding.issuedDeviceToken, token1);
    });

    let first, restoredDeviceName;
    await t.test('recovery requires correct employee credentials, an actual blocked binding and a retained opaque proof', async () => {
        assert.equal((await recover('new-1', { secret: 'wrong' })).httpStatus, 401);
        assert.equal((await recover('new-1', { deviceInfo: device('old-1', { deviceToken: token1 }) })).httpStatus, 409);
        assert.equal((await recover('new-1', { reason: '' })).httpStatus, 400);
        assert.equal((await recover('x'.repeat(155) + 'employee-card')).httpStatus, 400, 'raw identifier with credential across length boundary is rejected');
        const boundarySecret = 'secret-that-must-not-be-partially-recorded-at-the-length-boundary';
        first = await recover('new-1', { reason: 'x'.repeat(480) + boundarySecret, deviceInfo: device('new-1', {
            deviceToken: boundarySecret, deviceName: 'x'.repeat(115) + 'employee-card',
            platform: 'y'.repeat(75) + 'employee-card', browserName: 'z'.repeat(75) + 'employee-card'
        }) });
        assert.equal(first.httpStatus, 200, JSON.stringify(first));
        assert.equal(first.status, 'pending');
        assert.ok(!db.getDeviceRecovery().get(first.requestId).reason.includes('secret-that'));
        const metadata = JSON.parse(db.getDeviceRecovery().get(first.requestId).device_json);
        restoredDeviceName = metadata.deviceName;
        for (const name of ['deviceName', 'platform', 'browserName']) {
            assert.ok(!metadata[name].includes('emplo'), `${name} must not contain a partial credential`);
            assert.ok(metadata[name].includes('[已遮罩]'));
        }
        assert.match(first.requestToken, /^[a-f0-9]{64}$/);
        assert.ok(first.expiresAt > Date.now() && first.expiresAt <= Date.now() + 900000);
        assert.equal((await request('/device-recovery/status', { ...proof(first), requestToken: 'f'.repeat(64) })).httpStatus, 403);
        assert.equal((await request('/device-recovery/complete', proof(first))).httpStatus, 409);
        assert.equal(db.loadEmployeeDevices('E001').length, 4);
        const listing = await request('/admin/device-recovery-requests', null, viewer.token);
        assert.equal(listing.httpStatus, 200);
        assert.equal(listing.requests[0].oldDevices.length, 4);
        const serialized = JSON.stringify(listing);
        for (const secret of [first.requestToken, token1, 'device_token_hash', 'proof_hash', 'auth_signature']) assert.ok(!serialized.includes(secret));
        assert.equal((await request('/admin/device-recovery-requests', null, bound[0].token)).httpStatus, 403);
        assert.equal((await request('/admin/device-recovery/approve', { requestId: first.requestId, oldDeviceId: 'old-1', reason: '已確認' }, viewer.token)).httpStatus, 403);
        assert.equal((await request('/admin/device-recovery/approve', { requestId: first.requestId, oldDeviceId: 'old-1', reason: '' }, manager.token)).httpStatus, 400);
    });

    await t.test('developer identity simulation cannot approve or reject sensitive recovery requests', async () => {
        const developerLogin = await login('D001', 'D001-test-password');
        const developer = await request('/workspace', { role: 'developer' }, developerLogin.token);
        db.setSetting('developerImpersonationEnabled', true);
        const simulated = await request('/developer/impersonation/start', { targetRole: 'admin', systemPassword: '0000' }, developer.token);
        assert.equal(simulated.httpStatus, 200);
        for (const action of ['approve', 'reject']) {
            const result = await request(`/admin/device-recovery/${action}`, { requestId: first.requestId, oldDeviceId: 'old-1', reason: '模擬身份不可操作' }, developer.token);
            assert.equal(result.httpStatus, 403);
            assert.match(result.error, /身份模擬/);
        }
        assert.equal(db.getDeviceRecovery().get(first.requestId).status, 'pending');
        assert.equal(db.loadEmployeeDevices('E001').length, 4);
    });

    let complete;
    await t.test('approval only selects old binding; completion rotates once, keeps four, revokes old sessions and supports retry', async () => {
        const before = db.getEmployeeDevice('E001', 'old-1').device_token_hash;
        const approved = await request('/admin/device-recovery/approve', { requestId: first.requestId, oldDeviceId: 'old-1', reason: '管理者當面確認原電腦' }, manager.token);
        assert.equal(approved.httpStatus, 200, JSON.stringify(approved));
        assert.equal(approved.status, 'approved');
        assert.equal(db.getEmployeeDevice('E001', 'old-1').device_token_hash, before);
        const pair = await Promise.all([request('/device-recovery/complete', proof(first)), request('/device-recovery/complete', proof(first))]);
        assert.equal(pair[0].httpStatus, 200, JSON.stringify(pair[0]));
        assert.deepEqual(pair[0], pair[1]);
        complete = pair[0];
        assert.equal(complete.deviceBinding.boundDeviceCount, 4);
        assert.equal(db.loadEmployeeDevices('E001').length, 4);
        assert.equal(db.getEmployeeDevice('E001', 'old-1'), null);
        assert.equal((await request('/dashboard', null, bound[0].token)).httpStatus, 401);
        assert.equal((await login('E001', 'employee-card', device('old-1', { deviceToken: token1 }))).httpStatus, 403);
        assert.equal((await request('/device-recovery/storage-status', { ...proof(first), deviceId: 'new-1', persisted: false,
            localStorageStatus: 'unavailable', cookieStorageStatus: 'unavailable' })).httpStatus, 200);
        assert.equal((await request('/device-recovery/storage-status', { ...proof(first), deviceId: 'other-browser', persisted: true })).httpStatus, 403);
        const restored = await login('E001', 'employee-card', device('new-1', { deviceToken: complete.deviceBinding.issuedDeviceToken }));
        assert.equal(restored.httpStatus, 200);
        const ack = await request('/device-storage-status', { deviceId: 'new-1', persisted: false, localStorageStatus: 'unavailable', cookieStorageStatus: 'unavailable' }, restored.token);
        assert.equal(ack.httpStatus, 200);
        assert.equal((await request('/device-storage-status', { deviceId: 'new-1', persisted: true,
            localStorageStatus: 'unavailable', cookieStorageStatus: 'unavailable' }, restored.token)).httpStatus, 200);
        assert.equal((await request('/dashboard', null, restored.token)).httpStatus, 200);
        assert.equal((await request('/device-storage-status', { deviceId: 'old-2', persisted: true }, restored.token)).httpStatus, 403);
        const audits = db.queryAuditLogs({ targetType: 'device_recovery', limit: 200 });
        assert.equal(audits.filter((item) => item.action === 'device_recovery_complete').length, 1);
        const auditJson = JSON.stringify(audits);
        for (const secret of [first.requestToken, complete.deviceBinding.issuedDeviceToken, token1, 'device_token_hash']) assert.ok(!auditJson.includes(secret));
    });

    await t.test('reject, expiry and changing an approved original binding all fail closed', async () => {
        const rejected = await recover('denied');
        assert.equal((await request('/admin/device-recovery/reject', { requestId: rejected.requestId, reason: '未確認原電腦' }, manager.token)).httpStatus, 200);
        assert.equal((await request('/device-recovery/complete', proof(rejected))).httpStatus, 409);
        const expiring = await recover('expired');
        sql.prepare('UPDATE device_recovery_requests SET expires_at=? WHERE id=?').run(Date.now() - 1, expiring.requestId);
        assert.equal((await request('/device-recovery/status', proof(expiring))).status, 'expired');
        assert.equal((await request('/admin/device-recovery/approve', { requestId: expiring.requestId, oldDeviceId: 'old-2', reason: '已確認' }, manager.token)).httpStatus, 409);
        const stale = await recover('stale');
        assert.equal((await request('/admin/device-recovery/approve', { requestId: stale.requestId, oldDeviceId: 'old-2', reason: '已確認' }, manager.token)).httpStatus, 200);
        sql.prepare('UPDATE employee_devices SET device_token_hash=? WHERE employee_id=? AND device_id=?').run('changed-proof', 'E001', 'old-2');
        assert.equal((await request('/device-recovery/complete', proof(stale))).httpStatus, 409);
        assert.equal(db.loadEmployeeDevices('E001').length, 4);
    });

    await t.test('audit failure rolls back replacement and credential changes invalidate approved requests', async () => {
        const pending = await recover('audit-rollback');
        assert.equal((await request('/admin/device-recovery/approve', { requestId: pending.requestId, oldDeviceId: 'old-3', reason: '已確認' }, manager.token)).httpStatus, 200);
        sql.exec("CREATE TRIGGER reject_recovery_audit BEFORE INSERT ON audit_logs WHEN NEW.action = 'device_recovery_complete' BEGIN SELECT RAISE(ABORT, 'fixture audit failure'); END");
        assert.equal((await request('/device-recovery/complete', proof(pending))).httpStatus, 500);
        assert.ok(db.getEmployeeDevice('E001', 'old-3'));
        assert.equal(db.getEmployeeDevice('E001', 'audit-rollback'), null);
        assert.equal(db.getDeviceRecovery().get(pending.requestId).status, 'approved');
        sql.exec('DROP TRIGGER reject_recovery_audit');
        sql.prepare('UPDATE employees SET card=? WHERE id=?').run('changed-card', 'E001');
        assert.equal((await request('/device-recovery/complete', proof(pending))).httpStatus, 409);
        assert.equal((await request('/device-recovery/complete', proof(first))).httpStatus, 409, 'cached response also revalidates changed credentials');
        sql.prepare('UPDATE employees SET card=? WHERE id=?').run('employee-card', 'E001');
    });

    await t.test('server filters before pagination and retains original/canonical diagnostics without secrets', async () => {
        const now = Date.now();
        for (let i = 0; i < 220; i++) db.addAuditLog({ timestamp: now + i, target_type: 'device_login', target_id: 'A001', success: true, after_data: { employeeId: 'A001' } });
        const result = await request('/admin/device-login-diagnostics?employeeId=E001&result=all&page=1&pageSize=2', null, viewer.token);
        assert.equal(result.httpStatus, 200);
        assert.ok(result.total > 2);
        assert.equal(result.records.length, 2);
        assert.ok(result.records.every((row) => row.employeeId === 'E001' || row.submittedAccount === 'E001'));
        const all = await request('/admin/device-login-diagnostics?employeeId=E001&result=all&pageSize=200', null, viewer.token);
        assert.ok(all.records.some((row) => row.bindingOutcome === 'recovered' && row.originalDeviceId === 'regenerated' && row.canonicalDeviceId === 'old-1'));
        assert.ok(all.records.some((row) => row.persistenceStatus === 'failed'));
        assert.ok(all.records.some((row) => row.persistenceStatus === 'retained' && row.success));
        assert.ok(all.records.some((row) => row.stage === 'device_recovery' && row.deviceId === 'new-1' && row.deviceName === restoredDeviceName
            && row.reason === '管理者確認恢復原裝置完成。'));
        assert.ok(all.records.some((row) => row.failureCode === 'AUTH_INVALID_CREDENTIALS' && row.submittedAccount === 'E001' && !row.employeeId));
        const failures = await request('/admin/device-login-diagnostics?employeeId=E001&result=failure&pageSize=200', null, viewer.token);
        assert.ok(failures.records.every((row) => !row.success));
        assert.equal((await request('/admin/device-login-diagnostics?startDate=2026-02-31', null, viewer.token)).httpStatus, 400);
        assert.equal((await request('/admin/device-login-diagnostics', null, bound[1].token)).httpStatus, 403);
        const serialized = JSON.stringify(all);
        for (const secret of [token1, token2, first.requestToken, complete.deviceBinding.issuedDeviceToken]) assert.ok(!serialized.includes(secret));
    });
    await t.test('pending request limits and database restart never add bindings or preserve usable response secrets', async () => {
        const pending = await recover('pending-at-restart');
        assert.equal(pending.httpStatus, 200);
        assert.equal((await recover('pending-spam')).httpStatus, 429);
        const persisted = JSON.stringify(sql.prepare('SELECT * FROM device_recovery_requests').all());
        for (const secret of [first.requestToken, pending.requestToken, complete.deviceBinding.issuedDeviceToken, 'employee-card']) assert.ok(!persisted.includes(secret));
        db.close();
        db.init(fixture.databasePath);
        assert.equal((await request('/device-recovery/status', proof(pending))).status, 'expired');
        assert.equal((await request('/device-recovery/status', proof(first))).status, 'completed', 'restart retains completed business history');
        assert.equal((await request('/device-recovery/complete', proof(first))).httpStatus, 409);
        sql.prepare('UPDATE device_recovery_requests SET expires_at=? WHERE id=?').run(Date.now() - 1, first.requestId);
        assert.equal((await request('/device-recovery/status', proof(first))).status, 'completed', 'expiry retains completed business history');
        assert.equal((await request('/device-recovery/complete', proof(first))).httpStatus, 409);
        assert.equal(db.loadEmployeeDevices('E001').length, 4);
    });
});
