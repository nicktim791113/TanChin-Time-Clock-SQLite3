const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Database = require('better-sqlite3');
const { test } = require('node:test');
const { startFixture } = require('./fixtures/browser-server');
const credentials = require('../web-credentials');
const { randomUUID } = require('node:crypto');

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

test('employee self-service credentials keep privileged workspaces separately approved', async (t) => {
    const fixture = await startFixture();
    t.after(() => fixture.close());
    const { db, url, databasePath } = fixture;
    async function request(route, body, token) {
        const response = await fetch(url + '/api/browser' + route, {
            method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: body ? JSON.stringify(body) : undefined
        });
        return { status: response.status, ...await response.json() };
    }
    const login = (employeeId, secret, deviceId = `${employeeId}-self-device`, role = 'account') => request('/login', { employeeId, secret, role, deviceInfo: { deviceId } });
    const select = (token, role) => request('/workspace', { role }, token);
    const system = await login('system-admin', 'system-admin-test', '', 'system_admin');
    const setupBody = { currentCard: 'employee-card', newPassword: 'self-personal-password', confirmPassword: 'self-personal-password', privileged_access_enabled: true };
    const card = await login('E001', 'employee-card');
    assert.equal(card.dashboard.webAccount.canSetPassword, true);
    assert.equal(card.dashboard.webAccount.canChangePassword, false);

    await t.test('first setup requires own current card and valid binding, and audit failure leaves no credential', async () => {
        assert.equal((await request('/account/password/initialize', setupBody)).status, 401);
        assert.equal((await request('/account/password/initialize', { ...setupBody, currentCard: 'wrong' }, card.token)).status, 403);
        assert.equal((await request('/account/password/initialize', { ...setupBody, confirmPassword: 'different' }, card.token)).status, 400);
        assert.equal((await request('/account/password/initialize', { ...setupBody, newPassword: 'employee-card', confirmPassword: 'employee-card' }, card.token)).status, 400);
        const connection = new Database(databasePath);
        connection.exec("CREATE TRIGGER reject_setup_audit BEFORE INSERT ON audit_logs WHEN NEW.action = 'web_password_initialize' BEGIN SELECT RAISE(ABORT, 'setup audit failure'); END;");
        assert.equal((await request('/account/password/initialize', setupBody, card.token)).status, 500);
        assert.equal(db.getWebCredential('E001'), null);
        connection.exec('DROP TRIGGER reject_setup_audit');
        connection.close();
        db.deleteEmployeeDevice('E001', 'E001-self-device');
        assert.equal((await request('/account/password/initialize', setupBody, card.token)).status, 403);
        assert.equal(db.getWebCredential('E001'), null);
        assert.equal(db.loadEmployeeDevices('E001').length, 0);
    });

    let employeePassword = setupBody.newPassword;
    await t.test('first setup works without device policy and cannot overwrite an existing password', async () => {
        db.setSetting('browserSecuritySettings', { deviceBindingEnabled: false, maxDevicesPerEmployee: 4 });
        const created = await request('/account/password/initialize', setupBody, card.token);
        assert.equal(created.status, 200);
        assert.equal(created.requiresLogin, true);
        assert.equal(db.getWebCredential('E001').privileged_access_enabled, 0);
        assert.equal((await request('/dashboard', null, card.token)).status, 401);
        const freshCard = await login('E001', 'employee-card');
        assert.equal(freshCard.dashboard.webAccount.canSetPassword, false);
        assert.equal(freshCard.dashboard.webAccount.canChangePassword, true);
        const revision = db.getWebCredential('E001').revision;
        assert.equal((await request('/account/password/initialize', { ...setupBody, newPassword: 'overwrite-password', confirmPassword: 'overwrite-password' }, freshCard.token)).status, 409);
        assert.equal((await request('/account/password', { currentPassword: 'employee-card', newPassword: 'changed-password', confirmPassword: 'changed-password' }, freshCard.token)).status, 403);
        assert.equal(db.getWebCredential('E001').revision, revision);
        const changed = await request('/account/password', { currentPassword: employeePassword, newPassword: 'changed-personal-password', confirmPassword: 'changed-personal-password', privileged_access_enabled: true }, freshCard.token);
        assert.equal(changed.status, 200);
        employeePassword = 'changed-personal-password';
        assert.equal(db.getWebCredential('E001').privileged_access_enabled, 0);
        assert.equal((await login('E001', employeePassword)).dashboard.role, 'employee');
        assert.equal((await login('E001', 'employee-card')).status, 200);
    });

    await t.test('logout during password reauthentication aborts the pending change', async () => {
        const current = await login('E001', 'employee-card');
        const previous = db.getWebCredential('E001');
        const originalVerify = credentials.verifyPassword;
        credentials.verifyPassword = async (...args) => {
            const correct = await originalVerify(...args);
            assert.equal((await request('/logout', {}, current.token)).status, 200);
            return correct;
        };
        try {
            const changed = await request('/account/password', { currentPassword: employeePassword,
                newPassword: 'must-not-be-written', confirmPassword: 'must-not-be-written' }, current.token);
            assert.equal(changed.status, 401);
            assert.equal(db.getWebCredential('E001').revision, previous.revision);
            assert.ok(await originalVerify(db.getWebCredential('E001').credential, employeePassword));
            assert.equal((await request('/dashboard', null, current.token)).status, 401);
        } finally { credentials.verifyPassword = originalVerify; }
    });

    await t.test('logout during credential hashing aborts both own password changes and managed resets', async () => {
        for (const action of ['change', 'reset']) {
            const current = action === 'change' ? await login('E001', 'employee-card')
                : await login('system-admin', 'system-admin-test', '', 'system_admin');
            const previous = db.getWebCredential('E001');
            const originalCreate = credentials.createCredential;
            credentials.createCredential = async (...args) => {
                const credential = await originalCreate(...args);
                assert.equal((await request('/logout', {}, current.token)).status, 200);
                return credential;
            };
            try {
                const route = action === 'change' ? '/account/password' : '/accounts/password/reset';
                const changed = await request(route, { employeeId: 'E001',
                    currentPassword: action === 'change' ? employeePassword : 'system-admin-test',
                    newPassword: 'pending-hash-not-written', confirmPassword: 'pending-hash-not-written' }, current.token);
                assert.equal(changed.status, 401, action);
                assert.equal(db.getWebCredential('E001').revision, previous.revision, action);
                assert.ok(await credentials.verifyPassword(db.getWebCredential('E001').credential, employeePassword), action);
                assert.equal((await request('/dashboard', null, current.token)).status, 401, action);
            } finally { credentials.createCredential = originalCreate; }
        }
    });

    await t.test('assigned admin or developer roles stay closed until explicit independent approval', async () => {
        db.saveAccountAccessRecord({ employee_id: 'E001', allowed_roles: ['employee', 'admin', 'developer'], admin_preset: 'full_admin', admin_permissions: [] });
        const unapproved = await login('E001', employeePassword);
        assert.equal(unapproved.dashboard.role, 'employee');
        assert.deepEqual(unapproved.dashboard.webAccount.availableRoles.map((item) => item.id), ['employee']);
        assert.equal(unapproved.dashboard.webAccount.canManagePrivilegedAccess, false);
        assert.equal((await select(unapproved.token, 'admin')).status, 403);
        assert.equal((await select(unapproved.token, 'developer')).status, 403);
        assert.equal((await request('/developer/impersonation/start', { role: 'admin' }, unapproved.token)).status, 403);
        const accessBody = { employeeId: 'E001', currentPassword: 'system-admin-test', enabled: true, reason: 'Verified role activation' };
        assert.equal((await request('/accounts/privileged-access', accessBody, unapproved.token)).status, 403);
        assert.equal((await request('/accounts/privileged-access', { ...accessBody, currentPassword: 'wrong' }, system.token)).status, 403);
        assert.equal((await request('/accounts/privileged-access', { ...accessBody, enabled: 'true' }, system.token)).status, 400);
        assert.equal((await request('/accounts/privileged-access', { ...accessBody, reason: '' }, system.token)).status, 400);
        const managerLogin = await login('A001', 'A001-test-password');
        const manager = await select(managerLogin.token, 'admin');
        assert.equal(manager.dashboard.webAccount.canManagePrivilegedAccess, false);
        assert.equal((await request('/accounts/privileged-access', { ...accessBody, currentPassword: 'A001-test-password' }, manager.token)).status, 403);
        const enabled = await request('/accounts/privileged-access', accessBody, system.token);
        assert.equal(enabled.status, 200);
        assert.equal(db.getWebCredential('E001').privileged_access_enabled, 1);
        assert.equal((await request('/dashboard', null, unapproved.token)).status, 401);
        const approved = await login('E001', employeePassword);
        assert.equal(approved.dashboard.role, 'workspace');
        assert.deepEqual(approved.dashboard.webAccount.availableRoles.map((item) => item.id), ['employee', 'admin', 'developer']);
        const developer = await select(approved.token, 'developer');
        assert.equal(developer.status, 200);
        assert.equal(developer.dashboard.webAccount.canManagePrivilegedAccess, true);
        const ownAccount = developer.dashboard.webAccount.credentialAccounts.find((item) => item.id === 'E001');
        assert.deepEqual(ownAccount.allowedRoles, ['employee', 'admin', 'developer']);
        assert.equal(ownAccount.privilegedAccessEnabled, true);
        const connection = new Database(databasePath);
        connection.exec("CREATE TRIGGER reject_access_audit BEFORE INSERT ON audit_logs WHEN NEW.action = 'web_privileged_access_change' BEGIN SELECT RAISE(ABORT, 'access audit failure'); END;");
        assert.equal((await request('/accounts/privileged-access', { ...accessBody, enabled: false }, system.token)).status, 500);
        assert.equal(db.getWebCredential('E001').privileged_access_enabled, 1);
        connection.exec('DROP TRIGGER reject_access_audit');
        connection.close();
        assert.equal((await request('/accounts/privileged-access', { ...accessBody, enabled: false }, system.token)).status, 200);
        assert.equal((await request('/dashboard', null, developer.token)).status, 401);
        assert.equal((await login('E001', employeePassword)).dashboard.role, 'employee');
    });

    await t.test('managed reset keeps approval state and never activates newly provisioned privileged accounts', async () => {
        db.saveEmployees([...db.loadEmployees(), { id: 'N001', name: 'New Manager', card: 'new-manager-card' }, { id: 'N002', name: 'New Employee', card: 'new-employee-card' }]);
        db.saveAccountAccessRecord({ employee_id: 'N001', allowed_roles: ['employee', 'admin'], admin_preset: 'full_admin', admin_permissions: [] });
        const reset = (employeeId) => request('/accounts/password/reset', { employeeId, currentPassword: 'system-admin-test', newPassword: 'new-temporary-password', confirmPassword: 'new-temporary-password', privileged_access_enabled: true }, system.token);
        assert.equal((await reset('N001')).status, 200);
        assert.equal(db.getWebCredential('N001').privileged_access_enabled, 0);
        assert.equal((await reset('A001')).status, 200);
        assert.equal(db.getWebCredential('A001').privileged_access_enabled, 1);
        assert.equal((await reset('E001')).status, 200);
        assert.equal(db.getWebCredential('E001').privileged_access_enabled, 0);
        assert.equal((await request('/accounts/privileged-access', { employeeId: 'N002', currentPassword: 'system-admin-test', enabled: true, reason: 'No credential' }, system.token)).status, 404);
        assert.equal((await reset('N002')).status, 200);
        assert.equal((await request('/accounts/privileged-access', { employeeId: 'N002', currentPassword: 'system-admin-test', enabled: true, reason: 'No assigned role' }, system.token)).status, 403);
    });

    await t.test('impersonation cannot initialize accounts or activate privileges and live approval is checked on every protected request', async () => {
        const admin = await select((await login('D001', 'D001-test-password')).token, 'admin');
        const developer = await select((await login('D001', 'D001-test-password')).token, 'developer');
        db.setSetting('developerImpersonationEnabled', true);
        const impersonated = await request('/developer/impersonation/start', { targetRole: 'employee', targetEmployeeId: 'E001', systemPassword: '0000' }, developer.token);
        assert.equal(impersonated.status, 200);
        assert.equal(impersonated.dashboard.webAccount.canSetPassword, false);
        assert.equal(impersonated.dashboard.webAccount.canChangePassword, false);
        assert.equal(impersonated.dashboard.webAccount.canManagePrivilegedAccess, false);
        assert.equal((await request('/account/password/initialize', setupBody, developer.token)).status, 403);
        assert.equal((await request('/accounts/privileged-access', { employeeId: 'E001', currentPassword: 'D001-test-password', enabled: true, reason: 'Impersonation rejected' }, developer.token)).status, 403);
        const connection = new Database(databasePath);
        try {
            connection.prepare('UPDATE web_credentials SET privileged_access_enabled = 0 WHERE employee_id = ?').run('D001');
            assert.equal((await request('/dashboard', null, admin.token)).status, 401);
            assert.equal((await request('/dashboard', null, developer.token)).status, 401);
        } finally {
            connection.prepare('UPDATE web_credentials SET privileged_access_enabled = 1 WHERE employee_id = ?').run('D001');
            connection.close();
        }
    });

    await t.test('concurrent initialization commits exactly one credential and audit', async () => {
        db.saveEmployees([...db.loadEmployees(), { id: 'R001', name: 'Concurrent Employee', card: 'race-card' }]);
        const first = await login('R001', 'race-card');
        const second = await login('R001', 'race-card');
        const originalCreate = credentials.createCredential;
        let entered = 0;
        let release;
        const gate = new Promise((resolve) => { release = resolve; });
        credentials.createCredential = async (...args) => {
            const credential = await originalCreate(...args);
            entered++;
            if (entered === 2) release();
            await gate;
            return credential;
        };
        try {
            const body = { currentCard: 'race-card', newPassword: 'race-personal-password', confirmPassword: 'race-personal-password' };
            const results = await Promise.all([request('/account/password/initialize', body, first.token), request('/account/password/initialize', body, second.token)]);
            assert.equal(results.filter((item) => item.status === 200).length, 1);
            assert.ok(results.some((item) => item.status === 401 || item.status === 409));
            assert.equal(db.queryAuditLogs({ limit: 500 }).filter((item) => item.action === 'web_password_initialize' && item.target_id === 'R001').length, 1);
            assert.ok(await credentials.verifyPassword(db.getWebCredential('R001').credential, body.newPassword));
        } finally { credentials.createCredential = originalCreate; }
    });

    await t.test('card changes during credential creation abort without saving', async () => {
        db.saveEmployees([...db.loadEmployees(), { id: 'C001', name: 'Changed Card', card: 'old-self-card' }]);
        const current = await login('C001', 'old-self-card');
        const originalCreate = credentials.createCredential;
        credentials.createCredential = async (...args) => {
            const credential = await originalCreate(...args);
            db.saveEmployees(db.loadEmployees().map((employee) => employee.id === 'C001' ? { ...employee, card: 'replacement-self-card' } : employee));
            return credential;
        };
        try {
            assert.equal((await request('/account/password/initialize', { currentCard: 'old-self-card', newPassword: 'valid-personal-password', confirmPassword: 'valid-personal-password' }, current.token)).status, 401);
            assert.equal(db.getWebCredential('C001'), null);
        } finally { credentials.createCredential = originalCreate; }
        const auditJson = JSON.stringify(db.queryAuditLogs({ limit: 500 }));
        assert.ok(!auditJson.includes('self-personal-password'));
        assert.ok(!auditJson.includes('race-personal-password'));
        assert.ok(!auditJson.includes('system-admin-test'));
    });

    await t.test('device revocation during first setup aborts without registering a replacement', async () => {
        db.setSetting('browserSecuritySettings', { deviceBindingEnabled: true, maxDevicesPerEmployee: 4 });
        db.saveEmployees([...db.loadEmployees(), { id: 'B001', name: 'Revoked Binding', card: 'binding-test-card' }]);
        const current = await login('B001', 'binding-test-card');
        const originalCreate = credentials.createCredential;
        credentials.createCredential = async (...args) => {
            const credential = await originalCreate(...args);
            db.deleteEmployeeDevice('B001', 'B001-self-device');
            return credential;
        };
        try {
            assert.equal((await request('/account/password/initialize', { currentCard: 'binding-test-card', newPassword: 'binding-personal-password', confirmPassword: 'binding-personal-password' }, current.token)).status, 403);
            assert.equal(db.getWebCredential('B001'), null);
            assert.equal(db.loadEmployeeDevices('B001').length, 0);
        } finally { credentials.createCredential = originalCreate; }
    });
});

test('legacy credential migration retains access and new self-service approval persists after restart', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tanchin-account-migration-'));
    const databasePath = path.join(directory, 'legacy.db');
    const connection = new Database(databasePath);
    connection.exec(`CREATE TABLE web_credentials (employee_id TEXT PRIMARY KEY, credential_json TEXT NOT NULL, revision TEXT NOT NULL,
        must_change_password INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL, updated_by TEXT);`);
    connection.prepare('INSERT INTO web_credentials VALUES (?, ?, ?, 0, ?, ?)').run('LEGACY', JSON.stringify({ keyId: 'legacy-test' }), randomUUID(), Date.now(), '__test__');
    connection.close();
    const db = require('../database');
    try {
        db.init(databasePath);
        assert.equal(db.getWebCredential('LEGACY').privileged_access_enabled, 1);
        assert.equal(db.initializeWebCredential({ employee_id: 'NEW', credential: { keyId: 'new-test' }, revision: 'first-revision', updated_by: 'NEW' }, { action: 'test_setup', summary: 'test' }), true);
        assert.equal(db.initializeWebCredential({ employee_id: 'NEW', credential: { keyId: 'overwrite' }, revision: 'second-revision', updated_by: 'NEW' }, { action: 'test_setup', summary: 'test' }), false);
        assert.equal(db.getWebCredential('NEW').revision, 'first-revision');
        db.close();
        db.init(databasePath);
        assert.equal(db.getWebCredential('LEGACY').privileged_access_enabled, 1);
        assert.equal(db.getWebCredential('NEW').privileged_access_enabled, 0);
    } finally {
        db.close();
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
