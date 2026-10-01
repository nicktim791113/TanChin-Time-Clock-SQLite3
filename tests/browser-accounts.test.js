const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Database = require('better-sqlite3');
const { test } = require('node:test');
const { startFixture } = require('./fixtures/browser-server');
const credentials = require('../web-credentials');

test('personal web accounts enforce identity, workspace, password and backup boundaries', async (t) => {
    const fixture = await startFixture();
    t.after(() => fixture.close());
    const { db, url, databasePath } = fixture;
    async function request(route, body, token) {
        const response = await fetch(url + '/api/browser' + route, {
            method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: body ? JSON.stringify(body) : undefined
        });
        return { status: response.status, cacheControl: response.headers.get('cache-control'), ...await response.json() };
    }
    const login = (employeeId, secret, role = 'account', deviceInfo) => request('/login', { employeeId, secret, role, deviceInfo });
    const select = (token, role, deviceInfo) => request('/workspace', { role, deviceInfo }, token);
    const system = await login('system-admin', 'system-admin-test', 'system_admin');
    assert.equal(system.status, 200);

    await t.test('card login never grants privileged roles and legacy shared passwords are rejected', async () => {
        const card = await login('A001', 'manager-card', 'developer', { deviceId: 'manager-device' });
        assert.equal(card.dashboard.role, 'employee');
        assert.equal((await select(card.token, 'admin')).status, 403);
        assert.equal((await login('A001', 'TC5128', 'admin')).status, 401);
        assert.equal((await login('D001', '0000', 'developer')).status, 401);
        assert.equal((await request('/accounts/password/reveal', { employeeId: 'A001', currentPassword: 'A001-test-password' }, card.token)).status, 403);
    });

    let manager, developer;
    await t.test('personal login chooses only authorized workspaces and rotates the session token', async () => {
        manager = await login('A001', 'A001-test-password');
        assert.equal(manager.dashboard.role, 'workspace');
        assert.equal(manager.dashboard.datasets, undefined);
        assert.deepEqual(manager.dashboard.webAccount.availableRoles.map((item) => item.id), ['employee', 'admin']);
        assert.equal((await select(manager.token, 'developer')).status, 403);
        assert.equal((await request('/admin/employees/save', { employees: [] }, manager.token)).status, 403);
        const admin = await select(manager.token, 'admin');
        assert.equal(admin.dashboard.role, 'admin');
        assert.equal(admin.dashboard.webAccount.canReveal, false);
        assert.equal((await request('/dashboard', null, manager.token)).status, 401);
        manager = admin;
        const initial = await login('D001', 'D001-test-password');
        developer = await select(initial.token, 'developer');
        assert.equal(developer.dashboard.webAccount.canReveal, true);
        assert.equal((await select(developer.token, 'employee', { deviceId: 'test-dev-device' })).status, 200);
        assert.equal(db.loadEmployeeDevices('D001').length, 1);
        const initialAgain = await login('D001', 'D001-test-password');
        developer = await select(initialAgain.token, 'developer');
        assert.equal((await select(developer.token, 'employee', { deviceId: 'different-device' })).status, 403);
        assert.equal((await request('/dashboard', null, developer.token)).dashboard.role, 'developer');
    });

    await t.test('reset requires reauthentication, forces a change, and reveal returns only the current password with audit', async () => {
        const body = { employeeId: 'E001', currentPassword: 'wrong', newPassword: 'temporary-password', confirmPassword: 'temporary-password' };
        assert.equal((await request('/accounts/password/reset', body, system.token)).status, 403);
        body.currentPassword = 'system-admin-test';
        assert.equal((await request('/accounts/password/reset', body, system.token)).status, 200);
        const reveal = await request('/accounts/password/reveal', body, system.token);
        assert.equal(reveal.password, 'temporary-password');
        assert.equal(reveal.cacheControl, 'no-store');
        const stored = db.getWebCredential('E001');
        assert.ok(!stored.credential_json.includes('temporary-password'));
        assert.ok(await credentials.verifyPassword(stored.credential, 'temporary-password'));
        assert.equal(await credentials.verifyPassword(stored.credential, 'wrong'), false);
        assert.throws(() => credentials.revealPassword(databasePath, 'A001', stored.credential));
        const pending = await login('E001', 'temporary-password');
        assert.equal(pending.dashboard.role, 'password_change');
        assert.equal((await select(pending.token, 'employee')).status, 403);
        assert.equal(db.loadEmployeeDevices('E001').length, 0);
        const otherPending = await login('E001', 'temporary-password');
        assert.equal((await request('/account/password', { currentPassword: 'temporary-password', newPassword: 'new-personal-password', confirmPassword: 'new-personal-password' }, pending.token)).status, 200);
        assert.equal((await request('/dashboard', null, otherPending.token)).status, 401);
        assert.equal((await request('/dashboard', null, pending.token)).status, 401);
        assert.equal((await request('/accounts/password/reveal', { employeeId: 'E001', currentPassword: 'system-admin-test' }, system.token)).password, 'new-personal-password');
        const audit = db.queryAuditLogs({ limit: 200 });
        assert.ok(JSON.stringify(audit).includes('web_password_reveal'));
        assert.ok(!JSON.stringify(audit).includes('new-personal-password'));
        const dashboards = JSON.stringify((await request('/dashboard', null, system.token)).dashboard);
        assert.ok(!dashboards.includes('new-personal-password'));
        assert.ok(!dashboards.includes('ciphertext'));
    });

    await t.test('delegated managers cannot reveal or reset peer administrators or developers', async () => {
        const account = await login('A002', 'A002-test-password');
        const delegated = await select(account.token, 'admin');
        assert.deepEqual(delegated.dashboard.webAccount.credentialAccounts.map((item) => item.id), ['E001']);
        const body = { employeeId: 'D001', currentPassword: 'A002-test-password', newPassword: 'temporary-password', confirmPassword: 'temporary-password' };
        assert.equal((await request('/accounts/password/reset', body, delegated.token)).status, 403);
        assert.equal((await request('/accounts/password/reveal', body, delegated.token)).status, 403);
        body.employeeId = 'A001';
        assert.equal((await request('/accounts/password/reveal', body, delegated.token)).status, 403);
        body.employeeId = 'E001';
        assert.equal((await request('/accounts/password/reveal', body, delegated.token)).status, 200);
    });

    await t.test('ordinary workspace switching preserves fine-grained admin access, unlike developer impersonation', async () => {
        const access = db.getAccountAccessRecord('D001');
        db.saveAccountAccessRecord({ ...access, admin_preset: 'custom', admin_permissions: ['admin.reports.view'] });
        const admin = await select(developer.token, 'admin');
        assert.equal(admin.dashboard.webAccount.canReveal, false);
        assert.equal((await request('/admin/employee/delete', { employeeId: 'E001' }, admin.token)).status, 403);
        assert.equal((await request('/admin/account-access/save', { accounts: [] }, admin.token)).status, 403);
        const changed = await request('/account/password', { currentPassword: 'D001-test-password', newPassword: 'D001-changed-password', confirmPassword: 'D001-changed-password' }, admin.token);
        assert.equal(changed.status, 200);
        assert.equal((await login('D001', 'D001-test-password')).status, 401);
    });

    await t.test('audit failure rolls back password writes and prevents revealing secrets', async () => {
        const connection = new Database(databasePath);
        connection.exec("CREATE TRIGGER reject_web_audit BEFORE INSERT ON audit_logs WHEN NEW.action LIKE 'web_password_%' BEGIN SELECT RAISE(ABORT, 'test audit failure'); END;");
        const revision = db.getWebCredential('E001').revision;
        const body = { employeeId: 'E001', currentPassword: 'system-admin-test', newPassword: 'temporary-password', confirmPassword: 'temporary-password' };
        const reset = await request('/accounts/password/reset', body, system.token);
        assert.equal(reset.status, 500);
        assert.equal(db.getWebCredential('E001').revision, revision);
        const reveal = await request('/accounts/password/reveal', body, system.token);
        assert.equal(reveal.status, 500);
        assert.equal(reveal.password, undefined);
        connection.exec('DROP TRIGGER reject_web_audit');
        connection.close();
    });

    await t.test('backup includes portable keys; missing keys stop restore without overwriting the database', async () => {
        const backupPath = path.join(fixture.directory, 'backup.db');
        const backup = await db.backupDatabase(backupPath);
        assert.ok(fs.existsSync(backup.credentialKeyPath));
        const relocated = fs.mkdtempSync(path.join(os.tmpdir(), 'tanchin-relocated-'));
        try {
            const targetPath = path.join(relocated, 'app_data.db');
            credentials.prepareRestoreKeys(targetPath, backupPath, db.getWebCredentialKeyIds());
            assert.equal(credentials.revealPassword(targetPath, 'E001', db.getWebCredential('E001').credential), 'new-personal-password');
            fs.renameSync(backup.credentialKeyPath, `${backup.credentialKeyPath}.hidden`);
            fs.renameSync(credentials.keyPath(databasePath), `${credentials.keyPath(databasePath)}.hidden`);
            try {
                await assert.rejects(db.replaceDatabaseFromBackup(backupPath), /金鑰/);
                assert.equal(db.loadEmployees().length, 4);
            } finally {
                fs.renameSync(`${credentials.keyPath(databasePath)}.hidden`, credentials.keyPath(databasePath));
                fs.renameSync(`${backup.credentialKeyPath}.hidden`, backup.credentialKeyPath);
            }
        } finally { fs.rmSync(relocated, { recursive: true, force: true }); }
    });

    await t.test('desktop passwords remain independently editable and do not become web login secrets', async () => {
        const changed = await request('/admin/change-admin-password', { currentSystemPassword: '0000', newPassword: 'desktop-admin-only' }, manager.token);
        assert.equal(changed.status, 200);
        assert.equal((await login('A001', 'desktop-admin-only', 'admin')).status, 401);
        assert.equal((await login('A001', 'A001-test-password')).status, 200);
        assert.equal(db.getSetting('adminPassword'), 'desktop-admin-only');
    });

    await t.test('SSE rejects pending workspaces and terminates immediately when credentials are reset', async () => {
        const initial = await login('A001', 'A001-test-password');
        const pendingEvents = await fetch(`${url}/api/browser/events?token=${initial.token}`);
        assert.equal(pendingEvents.status, 401);
        const admin = await select(initial.token, 'admin');
        const events = await fetch(`${url}/api/browser/events?token=${admin.token}`);
        assert.equal(events.status, 200);
        const reader = events.body.getReader();
        assert.equal((await reader.read()).done, false);
        await request('/accounts/password/reset', { employeeId: 'A001', currentPassword: 'system-admin-test',
            newPassword: 'reset-manager-password', confirmPassword: 'reset-manager-password' }, system.token);
        assert.equal((await reader.read()).done, true);
        assert.equal((await request('/dashboard', null, admin.token)).status, 401);
    });

    await t.test('a deleted employee cannot regain their old personal credential when the id is reused', async () => {
        db.saveEmployees(db.loadEmployees().filter((employee) => employee.id !== 'E001'));
        assert.equal(db.getWebCredential('E001'), null);
        db.saveEmployees([...db.loadEmployees(), { id: 'E001', name: 'Replacement', card: 'new-card' }]);
        assert.equal((await login('E001', 'new-personal-password')).status, 401);
    });

    await t.test('system admin credential updates revoke the independent sessions', async () => {
        const second = await login('system-admin', 'system-admin-test', 'system_admin');
        const changed = await request('/system-admin/credentials/save', { username: 'system-admin', currentPassword: 'system-admin-test',
            newPassword: 'system-admin-new-test', confirmPassword: 'system-admin-new-test' }, system.token);
        assert.equal(changed.requiresLogin, true);
        assert.equal((await request('/dashboard', null, second.token)).status, 401);
        assert.equal((await request('/dashboard', null, system.token)).status, 401);
    });
});
