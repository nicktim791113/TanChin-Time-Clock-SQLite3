const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const crypto = require('node:crypto');
const db = require('../../database');
const credentials = require('../../web-credentials');

async function startFixture() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tanchin-web-account-'));
    const databasePath = path.join(directory, 'app_data.db');
    db.init(databasePath);
    db.saveEmployees([
        { id: 'E001', name: 'Test Employee', department: 'Test', card: 'employee-card' },
        { id: 'A001', name: 'Test Manager', department: 'Test', card: 'manager-card' },
        { id: 'A002', name: 'Delegated Manager', department: 'Test', card: 'delegated-card' },
        { id: 'D001', name: 'Test Developer', department: 'Test', card: 'developer-card' }
    ]);
    db.saveAccountAccessRecords([
        { employee_id: 'A001', allowed_roles: ['employee', 'admin'], admin_preset: 'full_admin', admin_permissions: [] },
        { employee_id: 'A002', allowed_roles: ['employee', 'admin'], admin_preset: 'custom', admin_permissions: ['admin.security.view', 'admin.accounts.password.reset', 'admin.accounts.password.reveal'] },
        { employee_id: 'D001', allowed_roles: ['employee', 'admin', 'developer'], admin_preset: 'full_admin', admin_permissions: [] }
    ]);
    db.setSetting('systemAdminPassword', 'system-admin-test');
    db.setSetting('browserSecuritySettings', { deviceBindingEnabled: true, gpsRequiredOnPunch: true, maxGpsAccuracyMeters: 300 });
    for (const id of ['A001', 'A002', 'D001']) {
        db.saveWebCredential({ employee_id: id, credential: await credentials.createCredential(databasePath, id, `${id}-test-password`),
            revision: crypto.randomUUID(), must_change_password: false, updated_by: '__test__' },
            { action: 'test_seed', target_id: id, summary: 'Test fixture only' });
    }
    const originalLoad = Module._load;
    Module._load = function fixtureLoad(id, ...args) {
        if (id === 'electron') return { app: { getPath: () => directory, getVersion: () => require('../../package.json').version, quit() {} }, dialog: {} };
        return originalLoad.call(this, id, ...args);
    };
    let serverModule;
    try { serverModule = require('../../server'); } finally { Module._load = originalLoad; }
    const server = serverModule.createServerApp().listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    return { directory, databasePath, db, url, server,
        async close() {
            server.closeAllConnections();
            await new Promise((resolve) => server.close(resolve));
            db.close();
            fs.rmSync(directory, { recursive: true, force: true });
        }
    };
}

if (require.main === module) {
    startFixture().then((fixture) => {
        console.log(`FIXTURE_URL=${fixture.url}`);
        process.on('SIGINT', async () => { await fixture.close(); process.exit(0); });
        process.on('SIGTERM', async () => { await fixture.close(); process.exit(0); });
    }).catch((error) => { console.error(error); process.exit(1); });
}

module.exports = { startFixture };
