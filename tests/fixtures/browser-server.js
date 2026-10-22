const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const crypto = require('node:crypto');
const http = require('node:http');
const db = require('../../database');
const credentials = require('../../web-credentials');

async function listenForFetch(server, initialPort = 0) {
    // Windows can allocate port 0 from a range containing fetch-blocked ports
    // (for example 6000 or 6667). Retry only that transport restriction; keep
    // genuine startup/health failures visible, including their address/cause.
    for (let attempt = 0; attempt < 16; attempt++) {
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(attempt === 0 ? initialPort : 0, '127.0.0.1', () => {
                server.off('error', reject);
                resolve();
            });
        });
        const url = `http://127.0.0.1:${server.address().port}`;
        try {
            const response = await fetch(`${url}/api/browser/health`);
            await response.arrayBuffer();
            if (!response.ok) throw new Error(`health returned HTTP ${response.status}`);
            return url;
        } catch (error) {
            server.closeAllConnections();
            await new Promise((resolve) => server.close(resolve));
            if (error.cause?.message === 'bad port') continue;
            throw new Error(`Browser fixture unavailable at ${url}: ${error.cause?.message || error.message}`, { cause: error });
        }
    }
    throw new Error('Could not allocate a fetch-compatible browser fixture port.');
}

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
    db.setSetting('browserSecuritySettings', { deviceBindingEnabled: true, maxDevicesPerEmployee: 1, gpsRequiredOnPunch: true, maxGpsAccuracyMeters: 300 });
    for (const id of ['A001', 'A002', 'D001']) {
        db.saveWebCredential({ employee_id: id, credential: await credentials.createCredential(databasePath, id, `${id}-test-password`),
            revision: crypto.randomUUID(), must_change_password: false, privileged_access_enabled: true, updated_by: '__test__' },
            { action: 'test_seed', target_id: id, summary: 'Test fixture only' });
    }
    const originalLoad = Module._load;
    Module._load = function fixtureLoad(id, ...args) {
        if (id === 'electron') return { app: { getPath: () => directory, getVersion: () => require('../../package.json').version, quit() {} }, dialog: {} };
        return originalLoad.call(this, id, ...args);
    };
    let serverModule;
    try { serverModule = require('../../server'); } finally { Module._load = originalLoad; }
    const server = http.createServer(serverModule.createServerApp());
    let url;
    try { url = await listenForFetch(server); }
    catch (error) {
        db.close();
        fs.rmSync(directory, { recursive: true, force: true });
        throw error;
    }
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

module.exports = { startFixture, listenForFetch };
