const assert = require('node:assert/strict');
const { test } = require('node:test');
const { startFixture } = require('./fixtures/browser-server');

test('employee workbench order is account owned, persistent, validated and isolated from permissions and global defaults', async (t) => {
    const fixture = await startFixture();
    t.after(() => fixture.close());
    const { db, url } = fixture;
    db.setSetting('browserSecuritySettings', { deviceBindingEnabled: false, gpsRequiredOnPunch: false });
    const route = '/employee/workspace-nav-order';
    async function request(path, token, body) {
        const response = await fetch(url + '/api/browser' + path, {
            method: body === undefined ? 'GET' : 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        return { status: response.status, ...await response.json() };
    }
    const cardLogin = (employeeId, secret) => request('/login', null, { employeeId, secret, role: 'employee' });
    async function accountLogin(employeeId, role) {
        const login = await request('/login', null, { employeeId, secret: `${employeeId}-test-password`, role: 'account' });
        assert.equal(login.status, 200);
        return request('/workspace', login.token, { role });
    }
    const employee = await cardLogin('E001', 'employee-card');
    assert.equal(employee.status, 200);
    const defaults = employee.dashboard.employeeWorkspaceNav.defaultOrder;
    assert.deepEqual(defaults, ['leave-request', 'overtime-request', 'meals', 'salaryAdvances', 'leave-history',
        'overtime-history', 'records', 'supervisor-review', 'supervisor', 'private', 'security']);
    assert.equal(employee.dashboard.employeeWorkspaceNav.canEdit, true);
    assert.equal(employee.dashboard.employeeWorkspaceNav.source, 'default');

    await t.test('only an authenticated employee workspace may read or save personal order', async () => {
        assert.equal((await request(route)).status, 401);
        assert.equal((await request(route + '/save', null, { order: defaults })).status, 401);
        const admin = await accountLogin('A001', 'admin');
        assert.equal((await request(route, admin.token)).status, 403);
        assert.equal((await request(route + '/save', admin.token, { order: defaults })).status, 403);
        assert.equal((await request(route + '/reset', admin.token, {})).status, 403);
    });

    await t.test('card authenticated employees save only their own order without changing permissions', async () => {
        const other = await cardLogin('A001', 'manager-card');
        const globalOrder = ['security', 'employees'];
        db.saveWorkspaceNavOrderRecord({ role: 'admin', nav_type: 'main', scope: 'global', employee_id: '', order: globalOrder });
        const reversed = [...defaults].reverse();
        const saved = await request(route + '/save', employee.token, { order: reversed, employeeId: 'A001', role: 'developer', scope: 'global' });
        assert.equal(saved.status, 200);
        assert.deepEqual(saved.dashboard.employeeWorkspaceNav.order, reversed);
        assert.equal(saved.dashboard.employeeWorkspaceNav.source, 'custom');
        assert.equal(saved.dashboard.employeeWorkspaceNav.canEdit, true);
        assert.deepEqual(saved.dashboard.supervisorProxy, employee.dashboard.supervisorProxy);
        assert.deepEqual(saved.dashboard.supervisorReview, employee.dashboard.supervisorReview);
        assert.deepEqual(db.getWorkspaceNavOrderRecord('employee', 'main', 'personal', 'E001').order, reversed);
        assert.equal(db.getWorkspaceNavOrderRecord('employee', 'main', 'personal', 'A001'), null);
        assert.deepEqual((await request(route, other.token)).employeeWorkspaceNav.order, defaults);
        assert.deepEqual(db.getWorkspaceNavOrderRecord('admin', 'main', 'global', '').order, globalOrder);
        assert.equal(db.getAccountAccessRecord('E001'), null);
        const newLogin = await cardLogin('E001', 'employee-card');
        assert.deepEqual(newLogin.dashboard.employeeWorkspaceNav.order, reversed);
        assert.deepEqual((await request(route, newLogin.token)).employeeWorkspaceNav.order, reversed);
    });

    await t.test('malformed, unknown or duplicate ids are rejected without modifying saved order', async () => {
        const before = db.getWorkspaceNavOrderRecord('employee', 'main', 'personal', 'E001');
        for (const order of [null, 'private', ['unknown'], ['private', 'private'], [1], [' private'], Array(12).fill('private')]) {
            assert.equal((await request(route + '/save', employee.token, { order })).status, 400);
        }
        assert.equal((await request(route + '/save', employee.token, {})).status, 400);
        assert.deepEqual(db.getWorkspaceNavOrderRecord('employee', 'main', 'personal', 'E001'), before);
    });

    await t.test('new navigation items are appended while obsolete stored ids are omitted', async () => {
        db.saveWorkspaceNavOrderRecord({ role: 'employee', nav_type: 'main', scope: 'personal', employee_id: 'E001', order: ['private', 'removed-feature', 'records'] });
        const normalized = (await request(route, employee.token)).employeeWorkspaceNav;
        assert.deepEqual(normalized.order, ['private', 'records', ...defaults.filter((id) => !['private', 'records'].includes(id))]);
        const saved = await request(route + '/save', employee.token, { order: ['meals', 'private'] });
        assert.equal(saved.status, 200);
        assert.deepEqual(saved.dashboard.employeeWorkspaceNav.order, ['meals', 'private', ...defaults.filter((id) => !['meals', 'private'].includes(id))]);
    });

    await t.test('developer impersonation may view but cannot modify the target employee preference', async () => {
        db.setSetting('developerImpersonationEnabled', true);
        db.setSetting('systemPassword', 'nav-test-system-password');
        const developer = await accountLogin('D001', 'developer');
        const impersonated = await request('/developer/impersonation/start', developer.token, {
            targetRole: 'employee', targetEmployeeId: 'E001', systemPassword: 'nav-test-system-password'
        });
        assert.equal(impersonated.status, 200);
        assert.equal(impersonated.dashboard.employeeWorkspaceNav.canEdit, false);
        const before = db.getWorkspaceNavOrderRecord('employee', 'main', 'personal', 'E001');
        assert.equal((await request(route, developer.token)).employeeWorkspaceNav.canEdit, false);
        assert.equal((await request(route + '/save', developer.token, { order: defaults })).status, 403);
        assert.equal((await request(route + '/reset', developer.token, {})).status, 403);
        assert.deepEqual(db.getWorkspaceNavOrderRecord('employee', 'main', 'personal', 'E001'), before);
    });

    await t.test('reset and deleting an employee remove only personal preferences, with save/reset audits', async () => {
        db.saveWorkspaceNavOrderRecord({ role: 'employee', nav_type: 'main', scope: 'personal', employee_id: 'A001', order: ['private'] });
        const reset = await request(route + '/reset', employee.token, { employeeId: 'A001' });
        assert.equal(reset.status, 200);
        assert.equal(reset.dashboard.employeeWorkspaceNav.source, 'default');
        assert.deepEqual(reset.dashboard.employeeWorkspaceNav.order, defaults);
        assert.equal(db.getWorkspaceNavOrderRecord('employee', 'main', 'personal', 'E001'), null);
        assert.ok(db.getWorkspaceNavOrderRecord('employee', 'main', 'personal', 'A001'));
        const audits = db.queryAuditLogs({ limit: 100 }).filter((row) => row.target_type === 'employee_workspace_nav_order');
        assert.ok(audits.some((row) => row.action === 'save' && row.target_id === 'E001' && row.actor_id === 'E001'));
        assert.ok(audits.some((row) => row.action === 'reset' && row.target_id === 'E001'));
        db.saveEmployees(db.loadEmployees().filter((row) => row.id !== 'A001'));
        assert.equal(db.getWorkspaceNavOrderRecord('employee', 'main', 'personal', 'A001'), null);
        assert.ok(db.getWorkspaceNavOrderRecord('admin', 'main', 'global', ''));
        db.saveWorkspaceNavOrderRecord({ role: 'employee', nav_type: 'main', scope: 'personal', employee_id: 'E001', order: ['meals'] });
        db.deleteAllEmployees();
        assert.equal(db.getWorkspaceNavOrderRecord('employee', 'main', 'personal', 'E001'), null);
        assert.ok(db.getWorkspaceNavOrderRecord('admin', 'main', 'global', ''));
    });
});
