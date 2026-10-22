'use strict';

const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { recentTaipeiDateRange } = require('../admin-security-data');
const { startFixture } = require('./fixtures/browser-server');

test('device binding retains credentials, enforces configurable limits, and exposes safe authorized diagnostics', async (t) => {
    const fixture = await startFixture();
    t.after(() => fixture.close());
    const { db, url, directory, databasePath } = fixture;

    // Every write below is confined to the fixture's generated temporary database.
    const relativeDirectory = path.relative(os.tmpdir(), directory);
    assert.ok(relativeDirectory && !relativeDirectory.startsWith('..') && !path.isAbsolute(relativeDirectory));
    assert.match(path.basename(directory), /^tanchin-web-account-/);
    assert.equal(path.resolve(databasePath), path.join(path.resolve(directory), 'app_data.db'));
    assert.equal(path.resolve(db.getDatabasePath()), path.resolve(databasePath));
    assert.equal(new URL(url).hostname, '127.0.0.1');

    const issuedTokens = [];
    const userAgent = 'DeviceBindingFixture/1.0';
    async function request(route, body, token, headers = {}) {
        const response = await fetch(url + '/api/browser' + route, {
            method: body == null ? 'GET' : 'POST',
            headers: { 'Content-Type': 'application/json', 'User-Agent': userAgent,
                ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
            body: body == null ? undefined : JSON.stringify(body)
        });
        return { status: response.status, ...await response.json() };
    }
    const device = (deviceId, extra = {}) => ({
        deviceId, deviceName: `Fixture ${deviceId}`, platform: 'Windows', browserName: 'Edge', ...extra
    });
    const login = (employeeId, secret, deviceInfo, headers) => request('/login', {
        employeeId, secret, role: 'account', deviceInfo
    }, null, headers);
    const select = (token, role, deviceInfo) => request('/workspace', { role, deviceInfo }, token);
    const saveSettings = (token, extra = {}) => request('/admin/security-settings/save', {
        deviceBindingEnabled: true, gpsRequiredOnPunch: true, maxGpsAccuracyMeters: 300, ...extra
    }, token);
    async function adminLogin(employeeId) {
        const account = await login(employeeId, `${employeeId}-test-password`);
        assert.equal(account.status, 200);
        const selected = await select(account.token, 'admin');
        assert.equal(selected.status, 200);
        return selected;
    }
    async function securityFor(token) {
        const response = await request('/dashboard', null, token);
        assert.equal(response.status, 200);
        return response.dashboard.datasets.security;
    }
    function assertFailure(response, status, code) {
        assert.equal(response.status, status, JSON.stringify(response));
        assert.equal(response.success, false);
        assert.match(response.error, new RegExp(code));
        assert.equal(response.token, undefined);
        assert.equal(response.deviceBinding, undefined);
    }
    function bindingSnapshot(employeeId) {
        return db.loadEmployeeDevices(employeeId).map((entry) => ({
            employeeId: entry.employee_id, deviceId: entry.device_id, hash: entry.device_token_hash
        })).sort((left, right) => left.deviceId.localeCompare(right.deviceId));
    }
    const manager = await adminLogin('A001');
    let readOnly, employeeSession, diagnosticSample;

    await t.test('legacy settings default to four and only security managers can save an integer limit', async () => {
        db.setSetting('browserSecuritySettings', {
            deviceBindingEnabled: true, gpsRequiredOnPunch: true, maxGpsAccuracyMeters: 300
        });
        assert.equal((await securityFor(manager.token)).settings.maxDevicesPerEmployee, 4);
        assert.equal(db.getSetting('browserSecuritySettings').maxDevicesPerEmployee, undefined);

        readOnly = await adminLogin('A002');
        assert.equal(readOnly.dashboard.datasets.security.settings.maxDevicesPerEmployee, 4);
        assert.ok(Array.isArray(readOnly.dashboard.datasets.security.deviceLoginDiagnostics.records));
        assert.equal((await saveSettings(readOnly.token, { maxDevicesPerEmployee: 2 })).status, 403);
        assert.equal((await securityFor(manager.token)).settings.maxDevicesPerEmployee, 4);

        for (const limit of [1, 2, 3, 4, '3']) {
            assert.equal((await saveSettings(manager.token, { maxDevicesPerEmployee: limit })).status, 200);
            assert.equal((await securityFor(manager.token)).settings.maxDevicesPerEmployee, Number(limit));
        }
        for (const invalid of [0, -1, 5, 1.5, '', 'oops', null, true, [], {}]) {
            assert.equal((await saveSettings(manager.token, { maxDevicesPerEmployee: invalid })).status, 400,
                `invalid limit ${JSON.stringify(invalid)} must not be saved`);
            assert.equal(db.getSetting('browserSecuritySettings').maxDevicesPerEmployee, 3);
        }
        assert.equal((await saveSettings(manager.token, { maxDevicesPerEmployee: 2 })).status, 200);
        assert.equal((await saveSettings(manager.token, { maxGpsAccuracyMeters: 450 })).status, 200);
        assert.equal(db.getSetting('browserSecuritySettings').maxDevicesPerEmployee, 2);
        assert.equal(db.getSetting('browserSecuritySettings').maxGpsAccuracyMeters, 450);
        assert.equal((await saveSettings(manager.token, { maxDevicesPerEmployee: 4 })).status, 200);
    });

    await t.test('the first four devices bind; a fifth fails while all original credentials remain valid', async () => {
        for (let number = 1; number <= 4; number += 1) {
            const result = await login('E001', 'employee-card', device(`employee-${number}`), {
                Origin: 'http://fixture-origin.invalid:3000', 'X-Forwarded-Host': 'untrusted.invalid'
            });
            assert.equal(result.status, 200, JSON.stringify(result));
            assert.equal(result.dashboard.role, 'employee');
            assert.equal(result.deviceBinding.enabled, true);
            assert.equal(result.deviceBinding.newlyBound, true);
            assert.equal(result.deviceBinding.boundDeviceCount, number);
            assert.equal(result.deviceBinding.maxDevicesPerEmployee, 4);
            assert.match(result.deviceBinding.issuedDeviceToken, /^[a-f0-9]{64}$/);
            issuedTokens.push(result.deviceBinding.issuedDeviceToken);
            employeeSession = result;
        }
        assert.equal(new Set(issuedTokens).size, 4);
        const before = bindingSnapshot('E001');
        assertFailure(await login('E001', 'employee-card', device('employee-5')), 403, 'P213');
        assert.deepEqual(bindingSnapshot('E001'), before);
        for (let index = 0; index < issuedTokens.length; index += 1) {
            const result = await login('E001', 'employee-card', device(`employee-${index + 1}`, {
                deviceToken: issuedTokens[index]
            }));
            assert.equal(result.status, 200);
            assert.equal(result.deviceBinding.newlyBound, false);
            assert.equal(result.deviceBinding.issuedDeviceToken, '');
            assert.equal(result.deviceBinding.boundDeviceCount, 4);
        }
        assert.deepEqual(bindingSnapshot('E001'), before);
    });

    await t.test('retained verified tokens recover lost IDs at the four-device cap without changing binding rows', async () => {
        const before = bindingSnapshot('E001');
        for (const missingId of ['', 'regenerated-local-id', 'employee-2']) {
            const recovered = await login('E001', 'employee-card', device(missingId, {
                deviceToken: issuedTokens[0], identitySource: 'generated', tokenSource: 'cookie',
                localStorageStatus: 'unavailable', cookieStorageStatus: 'available'
            }));
            assert.equal(recovered.status, 200, JSON.stringify(recovered));
            assert.equal(recovered.deviceBinding.deviceId, 'employee-1');
            assert.equal(recovered.deviceBinding.newlyBound, false);
            assert.equal(recovered.deviceBinding.boundDeviceCount, 4);
            assert.equal(recovered.dashboard.security.currentDeviceTrusted, true);
            const dashboard = await request('/dashboard', null, recovered.token);
            assert.equal(dashboard.dashboard.security.currentDeviceTrusted, true);
        }
        assert.deepEqual(bindingSnapshot('E001'), before);
        assertFailure(await login('E001', 'employee-card', device('unknown-id', { deviceToken: 'invalid-proof' })), 403, 'P213');
        const recovery = (await securityFor(manager.token)).deviceLoginDiagnostics.records.find((row) => row.identityRecovered);
        assert.ok(recovery); assert.equal(recovery.identitySource, 'generated'); assert.equal(recovery.tokenSource, 'cookie');
        assert.equal(recovery.localStorageStatus, 'unavailable'); assert.equal(recovery.cookieStorageStatus, 'available');
        // Another employee cannot consume the recovered employee's secret as a binding proof.
        const foreign = await login('A002', 'delegated-card', device('foreign-device', { deviceToken: issuedTokens[0] }));
        assert.equal(foreign.status, 200); assert.equal(foreign.deviceBinding.newlyBound, true);
        assert.notEqual(foreign.deviceBinding.issuedDeviceToken, issuedTokens[0]);
        assert.equal(foreign.deviceBinding.deviceId, 'foreign-device');
        db.deleteEmployeeDevicesByEmployee('A002');
        const blocked = await login('A002', 'delegated-card', device('storage-blocked', {
            localStorageStatus: 'unavailable', cookieStorageStatus: 'unavailable'
        }));
        assertFailure(blocked, 400, 'P216'); assert.equal(db.loadEmployeeDevices('A002').length, 0);
    });

    await t.test('lowering the limit never removes devices or bypasses a missing or incorrect credential', async () => {
        const before = bindingSnapshot('E001');
        assert.equal((await saveSettings(manager.token, { maxDevicesPerEmployee: 1 })).status, 200);
        assertFailure(await login('E001', 'employee-card', device('employee-1')), 403, 'P212');
        assertFailure(await login('E001', 'employee-card', device('employee-1', { deviceToken: 'wrong-device-token' })), 403, 'P212');
        const mismatchedId = await login('E001', 'employee-card', device('employee-1', { deviceToken: issuedTokens[1] }));
        assert.equal(mismatchedId.status, 200); assert.equal(mismatchedId.deviceBinding.deviceId, 'employee-2');
        assert.equal(mismatchedId.deviceBinding.newlyBound, false);
        assertFailure(await login('E001', 'employee-card', device('employee-5')), 403, 'P213');
        assertFailure(await login('E001', 'employee-card', {}), 400, 'P211');
        const valid = await login('E001', 'employee-card', device('employee-1', { deviceToken: issuedTokens[0] }));
        assert.equal(valid.status, 200);
        assert.equal(valid.deviceBinding.maxDevicesPerEmployee, 1);
        assert.equal(valid.deviceBinding.boundDeviceCount, 4);
        assert.equal(valid.dashboard.security.maxDevicesPerEmployee, 1);
        assert.equal((await request('/dashboard', null, employeeSession.token)).status, 200);
        assert.deepEqual(bindingSnapshot('E001'), before);

        assert.equal((await saveSettings(manager.token, { deviceBindingEnabled: false, maxDevicesPerEmployee: 1 })).status, 200);
        const disabled = await login('E001', 'employee-card', device('unbound-while-disabled'));
        assert.equal(disabled.status, 200);
        assert.equal(disabled.deviceBinding.enabled, false);
        assert.deepEqual(bindingSnapshot('E001'), before);
        assert.equal((await saveSettings(manager.token, { maxDevicesPerEmployee: 4 })).status, 200);
    });

    await t.test('employee workspace selection applies the same four-device and credential rules', async () => {
        const workspaceTokens = [];
        for (let number = 1; number <= 4; number += 1) {
            const account = await login('D001', 'D001-test-password');
            assert.equal(account.dashboard.role, 'workspace');
            const selected = await select(account.token, 'employee', device(`workspace-${number}`));
            assert.equal(selected.status, 200);
            assert.equal(selected.deviceBinding.boundDeviceCount, number);
            workspaceTokens.push(selected.deviceBinding.issuedDeviceToken);
        }
        issuedTokens.push(...workspaceTokens);
        const before = bindingSnapshot('D001');
        const pending = await login('D001', 'D001-test-password');
        assertFailure(await select(pending.token, 'employee', device('workspace-5')), 403, 'P213');
        assert.equal((await request('/dashboard', null, pending.token)).dashboard.role, 'workspace');
        assertFailure(await select(pending.token, 'employee', device('workspace-1')), 403, 'P212');
        assertFailure(await select(pending.token, 'employee', device('workspace-1', { deviceToken: 'wrong-workspace-token' })), 403, 'P212');
        assertFailure(await select(pending.token, 'employee', {}), 400, 'P211');
        const valid = await select(pending.token, 'employee', device('workspace-1', { deviceToken: workspaceTokens[0] }));
        assert.equal(valid.status, 200);
        assert.equal(valid.deviceBinding.newlyBound, false);
        const recoveryAccount = await login('D001', 'D001-test-password');
        const recoveredWorkspace = await select(recoveryAccount.token, 'employee', device('workspace-2', { deviceToken: workspaceTokens[0] }));
        assert.equal(recoveredWorkspace.status, 200);
        assert.equal(recoveredWorkspace.deviceBinding.deviceId, 'workspace-1');
        assert.equal(recoveredWorkspace.dashboard.security.currentDeviceTrusted, true);
        assert.equal(recoveredWorkspace.deviceBinding.boundDeviceCount, 4);
        assert.deepEqual(bindingSnapshot('D001'), before);
    });

    await t.test('diagnostics distinguish authenticated device failures from unverified account submissions without leaking secrets', async () => {
        assert.equal((await login('E001', 'wrong-personal-password', device('bad-password-device', {
            deviceName: 'wrong-personal-password', deviceToken: 'bogus-diagnostic-token', browserName: 'bogus-diagnostic-token'
        }))).status, 401);
        assert.equal((await login('UNKNOWN', 'unknown-card-secret', device('unknown-account-device'))).status, 401);
        assert.equal((await login('', '', device('missing-input-device'))).status, 400);
        assert.equal((await select('invalid-session-token', 'employee', device('invalid-session-device'))).status, 401);
        const unauthorized = await login('A001', 'A001-test-password');
        assert.equal((await select(unauthorized.token, 'developer', device('workspace-denied-device'))).status, 403);

        const security = await securityFor(readOnly.token);
        const diagnostics = security.deviceLoginDiagnostics;
        assert.equal(diagnostics.limit, 200);
        assert.equal(diagnostics.range.days, 14);
        assert.equal(diagnostics.range.timeZone, 'Asia/Taipei');
        const { records } = diagnostics;
        const authFailure = records.find((entry) => entry.deviceId === 'bad-password-device');
        assert.ok(authFailure);
        assert.equal(authFailure.failureCode, 'AUTH_INVALID_CREDENTIALS');
        assert.equal(authFailure.success, false);
        assert.equal(authFailure.submittedAccount, 'E001');
        assert.ok(!authFailure.employeeId && !authFailure.employeeName && !authFailure.department);
        assert.equal(authFailure.deviceName, '[已遮罩]');
        assert.equal(authFailure.browserName, '[已遮罩]');
        const unknown = records.find((entry) => entry.deviceId === 'unknown-account-device');
        assert.ok(unknown);
        assert.equal(unknown.submittedAccount, 'UNKNOWN');
        assert.ok(!unknown.employeeId && !unknown.employeeName && !unknown.department);
        assert.equal(records.find((entry) => entry.deviceId === 'missing-input-device')?.failureCode, 'AUTH_INPUT_INVALID');
        const invalidSession = records.find((entry) => entry.deviceId === 'invalid-session-device');
        assert.equal(invalidSession?.failureCode, 'SESSION_INVALID');
        assert.ok(!invalidSession.employeeId && !invalidSession.employeeName);
        assert.equal(records.find((entry) => entry.deviceId === 'workspace-denied-device')?.failureCode, 'WORKSPACE_DENIED');

        for (const [stage, employeeId] of [['login', 'E001'], ['workspace_switch', 'D001']]) {
            for (const code of ['P211', 'P212', 'P213']) {
                const record = records.find((entry) => entry.stage === stage && entry.employeeId === employeeId && entry.failureCode === code);
                assert.ok(record, `${stage} ${code} must be diagnosable`);
                assert.equal(record.success, false);
                assert.ok(record.employeeName && record.department && record.reason && record.timestampText && record.id);
                assert.equal(record.boundDeviceCount, 4);
            }
        }
        const original = records.find((entry) => entry.deviceId === 'employee-1'
            && entry.success && entry.siteOrigin === 'http://fixture-origin.invalid:3000');
        assert.ok(original);
        assert.equal(original.stage, 'login');
        assert.equal(original.deviceName, 'Fixture employee-1');
        assert.equal(original.platform, 'Windows');
        assert.equal(original.browserName, 'Edge');
        assert.equal(original.userAgent, userAgent);
        assert.ok(original.ipAddress.includes('127.0.0.1'));
        assert.equal(original.tokenPresent, false);
        assert.equal(original.boundDeviceCount, 1);
        assert.equal(original.maxDevicesPerEmployee, 4);
        assert.ok(records.some((entry) => entry.deviceId === 'employee-1' && entry.success && entry.tokenPresent));
        assert.ok(records.some((entry) => entry.deviceId === 'employee-5' && entry.siteOrigin === url));
        assert.ok(records.every((entry) => !entry.siteOrigin.includes('untrusted.invalid')));

        diagnosticSample = db.queryAuditLogs({ targetType: 'device_login', limit: 200 })
            .find((entry) => entry.after_data?.deviceId === 'employee-1' && entry.success);
        assert.ok(diagnosticSample);
        const diagnosticAudit = db.queryAuditLogs({ targetType: 'device_login', limit: 200 });
        assert.ok(diagnosticAudit.every((entry) => !entry.session_token_suffix));
        assert.ok(diagnosticAudit.filter((entry) => entry.after_data?.deviceId === 'bad-password-device')
            .every((entry) => !entry.actor_id && !entry.actor_name && !entry.target_id));
        const serialized = JSON.stringify({ security, diagnosticAudit });
        for (const secret of [...issuedTokens, ...db.loadEmployeeDevices().map((entry) => entry.device_token_hash),
            'employee-card', 'D001-test-password', 'A001-test-password', 'wrong-personal-password', 'unknown-card-secret',
            'wrong-device-token', 'wrong-workspace-token', 'invalid-session-token', 'bogus-diagnostic-token']) {
            assert.ok(!serialized.includes(secret), `diagnostics must not expose a credential (${secret.length} characters)`);
        }
        assert.ok(!/"(?:deviceToken|device_token_hash|secret|password|card|credential_json|ciphertext)"\s*:/.test(serialized));
    });

    await t.test('diagnostic viewing and security management remain separately permissioned', async () => {
        const previous = db.getAccountAccessRecord('A002');
        db.saveAccountAccessRecord({ ...previous, admin_preset: 'custom', admin_permissions: ['admin.reports.view'] });
        try {
            const limited = await adminLogin('A002');
            assert.equal(limited.dashboard.datasets.security, null);
            assert.ok(!JSON.stringify(limited.dashboard).includes('deviceLoginDiagnostics'));
            assert.equal((await saveSettings(limited.token, { maxDevicesPerEmployee: 1 })).status, 403);

            for (const permission of ['admin.security.password', 'admin.security.manage']) {
                db.saveAccountAccessRecord({ ...previous, admin_preset: 'custom', admin_permissions: [permission] });
                const limitedSecurity = await adminLogin('A002');
                assert.deepEqual(limitedSecurity.dashboard.datasets.security.deviceLoginDiagnostics.records, []);
                const saved = await saveSettings(limitedSecurity.token, { maxDevicesPerEmployee: 4 });
                assert.equal(saved.status, permission === 'admin.security.manage' ? 200 : 403);
            }
        } finally {
            db.saveAccountAccessRecord(previous);
        }
        const employee = await request('/dashboard', null, employeeSession.token);
        assert.equal(employee.status, 200);
        assert.ok(!JSON.stringify(employee.dashboard).includes('deviceLoginDiagnostics'));
    });

    await t.test('diagnostic persistence errors do not turn a valid login into a failure', async () => {
        const original = db.addAuditLog;
        let attempted = false;
        db.addAuditLog = (entry) => {
            if (entry.target_type === 'device_login') {
                attempted = true;
                throw new Error('fixture-only diagnostic persistence failure');
            }
            return original(entry);
        };
        try {
            const valid = await login('E001', 'employee-card', device('employee-1', { deviceToken: issuedTokens[0] }));
            assert.equal(valid.status, 200);
            assert.equal(valid.dashboard.role, 'employee');
            assert.equal(attempted, true);
        } finally {
            db.addAuditLog = original;
        }
    });

    function clearDiagnosticSamples() {
        assert.equal(path.resolve(db.getDatabasePath()), path.resolve(databasePath));
        let entries;
        do {
            entries = db.queryAuditLogs({ targetType: 'device_login', limit: 200 });
            if (entries.length) db.deleteAuditLogsByIds(entries.map((entry) => entry.id));
        } while (entries.length === 200);
    }
    function seedDiagnostic(timestamp, deviceId) {
        db.addAuditLog({ ...diagnosticSample, timestamp,
            after_data: { ...diagnosticSample.after_data, deviceId, deviceName: `Fixture ${deviceId}` }
        });
    }

    await t.test('diagnostic history uses inclusive start and exclusive end of fourteen Taipei calendar dates', async () => {
        assert.ok(diagnosticSample);
        clearDiagnosticSamples();
        const range = recentTaipeiDateRange();
        seedDiagnostic(range.startAt - 1, 'outside-before');
        seedDiagnostic(range.startAt, 'included-start');
        seedDiagnostic(range.endAt - 1, 'included-end');
        seedDiagnostic(range.endAt, 'outside-after');
        const diagnostics = (await securityFor(manager.token)).deviceLoginDiagnostics;
        assert.deepEqual(diagnostics.records.map((entry) => entry.deviceId), ['included-end', 'included-start']);
        assert.deepEqual([diagnostics.range.startDate, diagnostics.range.endDate], [range.startDate, range.endDate]);
    });

    await t.test('diagnostic history returns only the latest two hundred records within the date range', async () => {
        clearDiagnosticSamples();
        const range = recentTaipeiDateRange();
        for (let index = 0; index < 205; index += 1) seedDiagnostic(range.startAt + 10000 + index, `bounded-${index}`);
        const diagnostics = (await securityFor(manager.token)).deviceLoginDiagnostics;
        assert.equal(diagnostics.limit, 200);
        assert.equal(diagnostics.records.length, 200);
        assert.deepEqual(diagnostics.records.map((entry) => entry.deviceId),
            Array.from({ length: 200 }, (_, index) => `bounded-${204 - index}`));
    });

    await t.test('a next-day login retains the same device binding after IP and browser metadata change', async () => {
        const previous = db.getEmployeeDevice('E001', 'employee-1');
        db.saveEmployeeDevice({ ...previous, last_ip: '192.0.2.10', user_agent: 'PreviousBrowserVersion/1.0' });
        const snapshot = bindingSnapshot('E001');
        const originalNow = Date.now;
        const tomorrow = originalNow() + 24 * 60 * 60 * 1000;
        let result;
        try {
            Date.now = () => tomorrow;
            result = await login('E001', 'employee-card', device('employee-1', {
                deviceToken: issuedTokens[0], browserName: 'Updated Edge', platform: 'Updated Windows'
            }), { 'User-Agent': 'UpdatedBrowserVersion/2.0' });
        } finally {
            Date.now = originalNow;
        }
        assert.equal(result.status, 200);
        assert.equal(result.deviceBinding.newlyBound, false);
        assert.equal(result.deviceBinding.boundDeviceCount, 4);
        assert.deepEqual(bindingSnapshot('E001'), snapshot);
        const updated = db.getEmployeeDevice('E001', 'employee-1');
        assert.equal(updated.created_at, previous.created_at);
        assert.equal(updated.last_seen_at, tomorrow);
        assert.equal(updated.user_agent, 'UpdatedBrowserVersion/2.0');
        assert.ok(updated.last_ip.includes('127.0.0.1'));
    });
});
