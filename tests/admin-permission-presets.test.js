const assert = require('node:assert/strict');
const { test } = require('node:test');
const { startFixture } = require('./fixtures/browser-server');

test('complete management is explicitly assigned while legacy presets and developer boundaries remain intact', async (t) => {
    const fixture = await startFixture();
    t.after(fixture.close);
    const { db, url } = fixture;
    async function request(route, body, token) {
        const response = await fetch(url + '/api/browser' + route, {
            method: body ? 'POST' : 'GET',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: body ? JSON.stringify(body) : undefined
        });
        return { status: response.status, ...await response.json() };
    }
    const login = (id, password, role = 'account') => request('/login', { employeeId: id, secret: password, role });
    const workspace = (token, role) => request('/workspace', { role }, token);
    const system = await login('system-admin', 'system-admin-test', 'system_admin');
    assert.equal(system.status, 200);
    const catalog = system.dashboard.permissionCatalog;
    const allCodes = catalog.adminPermissions.map((item) => item.code);
    const explicitCodes = catalog.adminPermissions.filter((item) => item.delegatedOnly).map((item) => item.code);
    assert.equal(explicitCodes.length, 9);
    const legacy = catalog.adminPresets.find((preset) => preset.id === 'full_admin');
    const complete = catalog.adminPresets.find((preset) => preset.id === 'complete_admin');
    assert.equal(legacy.label, '一般管理者（既有模板）');
    assert.equal(complete.label, '完整管理者');
    assert.deepEqual(complete.permissions, allCodes);
    assert.deepEqual(system.dashboard.permissions.admin, allCodes);

    let manager = await workspace((await login('A001', 'A001-test-password')).token, 'admin');
    assert.equal(manager.status, 200);
    assert.deepEqual(manager.dashboard.permissions.admin, legacy.permissions);
    for (const code of explicitCodes) assert.ok(!manager.dashboard.permissions.admin.includes(code));
    assert.equal((await request('/salary-advances', null, manager.token)).status, 403);
    assert.equal((await request('/annual-leave/policy', {}, manager.token)).status, 403);
    assert.equal(manager.dashboard.webAccount.canReveal, false);

    await t.test('saving unchanged legacy settings never grants excluded permissions', async () => {
        const accounts = db.loadAccountAccessRecords();
        assert.equal((await request('/admin/account-access/save', { accounts }, system.token)).status, 200);
        const refreshed = await request('/dashboard', null, manager.token);
        assert.deepEqual(refreshed.dashboard.permissions.admin, legacy.permissions);
        assert.equal(db.getAccountAccessRecord('A001').admin_preset, 'full_admin');
    });

    await t.test('selecting complete management grants all management functions without granting developer authority', async () => {
        const accounts = db.loadAccountAccessRecords().map((record) => record.employee_id === 'A001'
            ? { ...record, admin_preset: 'complete_admin', admin_permissions: [] } : record);
        assert.equal((await request('/admin/account-access/save', { accounts }, manager.token)).status, 403);
        assert.equal((await request('/admin/account-access/save', { accounts }, system.token)).status, 200);
        const refreshed = await request('/dashboard', null, manager.token);
        assert.deepEqual(refreshed.dashboard.permissions.admin, allCodes);
        assert.ok(refreshed.dashboard.permissions.sections.some((section) => section.id === 'salaryAdvances'));
        assert.equal(refreshed.dashboard.webAccount.canReset, true);
        assert.equal(refreshed.dashboard.webAccount.canReveal, true);
        assert.equal(refreshed.dashboard.webAccount.canManagePrivilegedAccess, false);
        assert.deepEqual(refreshed.dashboard.webAccount.credentialAccounts.map((employee) => employee.id), ['E001']);
        const salary = await request('/salary-advances', null, manager.token);
        assert.equal(salary.status, 200);
        assert.deepEqual(salary.permissions, { view: true, review: true, settings: true, export: true });
        const annual = await request('/annual-leave?year=2026', null, manager.token);
        assert.equal(annual.status, 200);
        for (const key of ['policyManage', 'grant', 'close', 'adjust']) assert.equal(annual.permissions[key], true);
        assert.equal((await request('/annual-leave/policy', { revision: annual.annualLeave.revision }, manager.token)).status, 400, 'Authorized requests reach validation');
        assert.equal((await request('/accounts/password/reveal', { employeeId: 'D001', currentPassword: 'A001-test-password' }, manager.token)).status, 403);
        assert.equal((await request('/admin/account-access/save', { accounts }, manager.token)).status, 403);
        assert.equal((await workspace(manager.token, 'developer')).status, 403);
        assert.deepEqual(db.getAccountAccessRecord('A001').allowed_roles, ['employee', 'admin']);
    });

    await t.test('revoking complete management applies to the current session and custom access stays explicit', async () => {
        const accounts = db.loadAccountAccessRecords().map((record) => record.employee_id === 'A001'
            ? { ...record, admin_preset: 'custom', admin_permissions: ['admin.reports.view'] } : record);
        assert.equal((await request('/admin/account-access/save', { accounts }, system.token)).status, 200);
        assert.equal((await request('/salary-advances', null, manager.token)).status, 403);
        const refreshed = await request('/dashboard', null, manager.token);
        assert.deepEqual(refreshed.dashboard.permissions.admin, ['admin.reports.view']);
        assert.equal(refreshed.dashboard.webAccount.canReveal, false);
        assert.equal((await request('/annual-leave?year=2026', null, manager.token)).status, 403);
    });

    await t.test('ordinary developer-to-admin switching honors assigned scope while simulation retains sensitive-operation restrictions', async () => {
        const developerAccount = await login('D001', 'D001-test-password');
        const ordinaryAdmin = await workspace(developerAccount.token, 'admin');
        assert.deepEqual(ordinaryAdmin.dashboard.permissions.admin, legacy.permissions);
        assert.equal((await request('/salary-advances', null, ordinaryAdmin.token)).status, 403);
        const developer = await workspace(ordinaryAdmin.token, 'developer');
        assert.equal(developer.status, 200);
        assert.equal(developer.dashboard.webAccount.canManagePrivilegedAccess, true);
        db.setSetting('developerImpersonationEnabled', true);
        const simulated = await request('/developer/impersonation/start', { targetRole: 'admin', systemPassword: '0000' }, developer.token);
        assert.equal(simulated.status, 200);
        assert.deepEqual(simulated.dashboard.permissions.admin, allCodes);
        assert.equal(simulated.dashboard.webAccount.canReveal, false);
        assert.equal((await request('/salary-advances', null, developer.token)).status, 403);
        assert.equal((await request('/annual-leave/policy', {}, developer.token)).status, 403);
        assert.equal((await request('/admin/account-access/save', { accounts: db.loadAccountAccessRecords() }, developer.token)).status, 200,
            'Existing real-developer account maintenance remains available during simulation');
    });
});
