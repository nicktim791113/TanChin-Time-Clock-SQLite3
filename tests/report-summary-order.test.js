const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startFixture } = require('./fixtures/browser-server');

test('report summary order is validated, account-scoped and unavailable for simulated writes', async (t) => {
    const { db, url, close } = await startFixture();
    t.after(close);
    const path = '/admin/reports/summary-order';
    async function request(route, token, body) {
        const response = await fetch(url + '/api/browser' + route, {
            method: body === undefined ? 'GET' : 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            ...(body === undefined ? {} : { body: JSON.stringify(body) })
        });
        return { status: response.status, ...await response.json() };
    }
    async function login(id, role) {
        const account = await request('/login', null, { employeeId: id, secret: `${id}-test-password`, role: 'account' });
        assert.equal(account.status, 200);
        const workspace = await request('/workspace', account.token, { role });
        assert.equal(workspace.status, 200);
        return workspace.token;
    }
    const admin = await login('A001', 'admin');
    const other = await login('D001', 'admin');
    const limited = await login('A002', 'admin');
    const initial = await request(path, admin);
    assert.equal(initial.status, 200);
    const { defaultOrder, revision } = initial.preferences;
    assert.equal(initial.preferences.canEdit, true);
    assert.equal(defaultOrder.length, 11);
    assert.deepEqual(initial.preferences.order, defaultOrder);
    assert.equal((await request(path, null)).status, 401);
    assert.equal((await request(path, limited)).status, 403);
    assert.equal((await request(path, limited, { order: ['out'], revision })).status, 403);
    for (const invalid of [{ order: ['bad'], revision }, { order: [null], revision }, { order: ['out'], revision, employeeId: 'D001' }]) {
        assert.equal((await request(path, admin, invalid)).status, 400);
    }
    const saved = await request(path, admin, { order: ['out', 'out', 'in'], revision });
    assert.equal(saved.status, 200);
    const savedOrder = ['out', 'in', ...defaultOrder.filter(key => !['out', 'in'].includes(key))];
    assert.deepEqual(saved.preferences.order, savedOrder);
    assert.deepEqual((await request(path, await login('A001', 'admin'))).preferences.order, savedOrder);
    assert.deepEqual((await request(path, other)).preferences.order, defaultOrder);
    assert.equal((await request(path, admin, { order: defaultOrder, revision })).status, 409);

    db.setSetting('developerImpersonationEnabled', true);
    const developer = await login('D001', 'developer');
    const simulation = await request('/developer/impersonation/start', developer, { targetRole: 'admin', targetEmployeeId: 'A001', systemPassword: '0000' });
    assert.equal(simulation.status, 200);
    const simulated = await request(path, developer);
    assert.equal(simulated.status, 200);
    assert.equal(simulated.preferences.canEdit, false);
    assert.deepEqual(simulated.preferences.order, defaultOrder);
    assert.equal((await request(path, developer, { order: defaultOrder, revision: simulated.preferences.revision })).status, 403);
    assert.deepEqual((await request(path, admin)).preferences.order, savedOrder);
});
