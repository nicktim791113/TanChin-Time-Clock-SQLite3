'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const createStore = require('../browser-client/device-identity');
const ID = 'tanchin.browser.device.id', TOKENS = 'browserPortalAccountDeviceTokens';
function fixture() {
    const local = new Map(), cookies = new Map(), writes = [];
    let localBlocked = false, localReadOnly = false, cookieBlocked = false, cookieReadOnly = false, sequence = 0;
    const blockedLocalKeys = new Set(), blockedCookieKeys = new Set();
    const storage = {
        getItem(key) { if (localBlocked) throw new Error('blocked'); return local.get(key) || null; },
        setItem(key, value) { if (localBlocked || localReadOnly || blockedLocalKeys.has(key)) throw new Error('blocked'); local.set(key, value); },
        removeItem(key) { if (localBlocked) throw new Error('blocked'); local.delete(key); }
    };
    const document = {
        get cookie() { return cookieBlocked ? '' : [...cookies].map(([key, value]) => key + '=' + value).join('; '); },
        set cookie(value) {
            writes.push(value); if (cookieBlocked || cookieReadOnly) return;
            const pair = value.split(';')[0], at = pair.indexOf('=');
            if (!blockedCookieKeys.has(pair.slice(0, at))) cookies.set(pair.slice(0, at), pair.slice(at + 1));
        }
    };
    const options = { storage: () => storage, document, origin: 'http://tc-150:3000', protocol: 'http:', generateId: () => 'new-' + ++sequence, defaultName: () => 'Windows / Edge' };
    return { local, cookies, writes, options, fresh: () => createStore(options),
        blockLocal(value = true) { localBlocked = value; }, readOnlyLocal(value = true) { localReadOnly = value; }, blockCookie(value = true) { cookieBlocked = value; },
        readOnlyCookie(value = true) { cookieReadOnly = value; }, blockedLocalKeys, blockedCookieKeys,
        cookieKey(key) { return 'tanchin_device_v1_' + encodeURIComponent(options.origin) + '_' + key; },
        accountCookie(id) { return JSON.parse(decodeURIComponent(cookies.get(this.cookieKey('account_' + encodeURIComponent(id))) || '%7B%7D')); } };
}
test('existing per-account identities survive reload/logout and restore from cookies when localStorage is cleared or denied', () => {
    const f = fixture(); f.local.set(ID, 'old-device'); f.local.set(TOKENS, JSON.stringify({ 'id:085': 'a'.repeat(64), 'id:088': 'b'.repeat(64) }));
    assert.equal(f.fresh().read('085').identitySource, 'local_storage');
    f.fresh().read('088');
    f.local.clear(); f.blockLocal();
    const restored = f.fresh().read('085');
    assert.equal(restored.deviceId, 'old-device'); assert.equal(restored.deviceToken, 'a'.repeat(64));
    assert.equal(restored.identitySource, 'cookie'); assert.equal(restored.tokenSource, 'cookie');
    assert.equal(restored.localStorageStatus, 'unavailable'); assert.equal(restored.cookieStorageStatus, 'available');
    assert.equal(f.fresh().read('088').deviceToken, 'b'.repeat(64));
    assert.equal(f.fresh().read('112').deviceToken, '');
    assert.ok(f.writes.every((value) => value.includes('Path=/browser/; SameSite=Strict') && !value.includes('Domain=')));
    const otherOrigin = createStore({ ...f.options, origin: 'http://tc-150:3001' }).read('085');
    assert.notEqual(otherOrigin.deviceId, 'old-device'); assert.equal(otherOrigin.deviceToken, '');
});
test('missing ID retains its account token, and a verified server canonical ID is persisted without losing that token', () => {
    const f = fixture(); f.local.set(TOKENS, JSON.stringify({ 'id:085': 'c'.repeat(64) }));
    const before = f.fresh().read('085'); assert.equal(before.identitySource, 'generated'); assert.equal(before.deviceToken, 'c'.repeat(64));
    f.fresh().save('', '085', 'canonical-device');
    const restored = f.fresh().read('085'); assert.equal(restored.deviceId, 'canonical-device'); assert.equal(restored.deviceToken, before.deviceToken);
    f.local.clear(); assert.equal(f.fresh().read('085').deviceId, 'canonical-device');
});
test('localStorage remains sufficient with blocked cookies, but fully cleared stores create a new identity instead of claiming recovery', () => {
    const f = fixture(); f.blockCookie();
    const original = f.fresh().read('085'); f.fresh().save('d'.repeat(64), '085', original.deviceId);
    assert.equal(f.fresh().read('085').deviceToken, 'd'.repeat(64));
    f.local.clear(); const cleared = f.fresh().read('085');
    assert.notEqual(cleared.deviceId, original.deviceId); assert.equal(cleared.deviceToken, ''); assert.equal(cleared.identitySource, 'generated');
});
test('a lost token map is repaired from the per-account cookie and HTTPS backups use Secure', () => {
    const f = fixture(); f.options.origin = 'https://tc-150'; f.options.protocol = 'https:';
    const initial = f.fresh().read('085'); f.fresh().save('e'.repeat(64), '085', initial.deviceId);
    f.local.set(TOKENS, '{broken-json');
    assert.equal(f.fresh().read('085').tokenSource, 'cookie');
    assert.equal(JSON.parse(f.local.get(TOKENS))['id:085'], 'e'.repeat(64));
    assert.ok(f.writes.every((value) => value.endsWith('; Secure')));
});
test('read-only storage can retain unchanged verified proof, but a newly issued token must be saved successfully', () => {
    const f = fixture(); f.local.set(ID, 'saved-device'); f.local.set(TOKENS, JSON.stringify({ 'id:085': 'f'.repeat(64) }));
    f.readOnlyLocal(); f.blockCookie();
    assert.equal(f.fresh().read('085').deviceToken, 'f'.repeat(64));
    assert.doesNotThrow(() => f.fresh().save('', '085', 'saved-device'));
    assert.throws(() => f.fresh().save('a'.repeat(64), '085', 'saved-device'), /P216/);
    assert.equal(JSON.parse(f.local.get(TOKENS))['id:085'], 'f'.repeat(64));
});

test('reading conflicting local and cookie proofs never overwrites either candidate before server verification', () => {
    const f = fixture(), employeeId = 'SYNTHETIC_A';
    const initial = f.fresh().read(employeeId);
    f.fresh().save('synthetic-old-token', employeeId, initial.deviceId);
    f.readOnlyLocal();
    const saved = f.fresh().save('synthetic-new-token', employeeId, 'synthetic-canonical');
    assert.equal(saved.persisted, true);
    assert.equal(saved.localStorageStatus, 'unavailable');
    assert.equal(saved.cookieStorageStatus, 'available');
    f.readOnlyLocal(false);
    for (let attempt = 0; attempt < 3; attempt++) {
        const read = f.fresh().read(employeeId);
        assert.deepEqual(read.deviceTokenCandidates, ['synthetic-old-token', 'synthetic-new-token']);
        assert.equal(read.deviceToken, 'synthetic-old-token');
        assert.equal(f.local.get(ID), initial.deviceId);
        assert.deepEqual(f.accountCookie(employeeId), { deviceId: 'synthetic-canonical', token: 'synthetic-new-token', verified: true });
    }
    const verified = f.fresh().save('synthetic-new-token', employeeId, 'synthetic-canonical');
    assert.deepEqual(verified, { localStorageStatus: 'available', cookieStorageStatus: 'available', persisted: true, deviceId: 'synthetic-canonical' });
    assert.deepEqual(f.fresh().read(employeeId).deviceTokenCandidates, ['synthetic-new-token']);
    assert.equal(f.local.get(ID), 'synthetic-canonical');
});

test('reverse cookie/local conflicts and legacy candidates remain distinct until a verified save', () => {
    const f = fixture(), employeeId = 'SYNTHETIC_A';
    const initial = f.fresh().read(employeeId);
    f.fresh().save('synthetic-cookie-old', employeeId, initial.deviceId);
    f.readOnlyCookie();
    const saved = f.fresh().save('synthetic-local-new', employeeId, 'synthetic-local-canonical');
    assert.equal(saved.persisted, true);
    assert.equal(saved.cookieStorageStatus, 'unavailable');
    f.readOnlyCookie(false);
    f.local.set('tanchin.browser.device.token', 'synthetic-legacy');
    // Simulate an installation that has not yet recorded a verified per-account migration.
    const tokenMap = JSON.parse(f.local.get(TOKENS)); delete tokenMap['verified:id:' + employeeId];
    f.local.set(TOKENS, JSON.stringify(tokenMap));
    const previousCookie = f.accountCookie(employeeId); delete previousCookie.verified;
    f.cookies.set(f.cookieKey('account_' + employeeId), encodeURIComponent(JSON.stringify(previousCookie)));
    const read = f.fresh().read(employeeId);
    assert.deepEqual(read.deviceTokenCandidates, ['synthetic-local-new', 'synthetic-cookie-old', 'synthetic-legacy']);
    assert.equal(f.accountCookie(employeeId).token, 'synthetic-cookie-old');
    assert.equal(f.accountCookie(employeeId).deviceId, initial.deviceId);
    assert.equal(f.local.get('tanchin.browser.device.token'), 'synthetic-legacy');
    f.fresh().save('synthetic-local-new', employeeId, 'synthetic-local-canonical');
    assert.equal(f.accountCookie(employeeId).token, 'synthetic-local-new');
    // A verified per-account save does not overwrite the legacy token another account may need.
    assert.equal(f.local.get('tanchin.browser.device.token'), 'synthetic-legacy');
    const migrated = f.fresh().read(employeeId);
    assert.deepEqual(migrated.deviceTokenCandidates, ['synthetic-local-new']);
    const hash = (value) => require('node:crypto').createHash('sha256').update(value).digest('hex');
    const { verifyDeviceProof } = require('../device-proof');
    const records = [
        { device_id: 'synthetic-local-canonical', device_token_hash: hash('synthetic-local-new') },
        { device_id: 'synthetic-other-binding', device_token_hash: hash('synthetic-legacy') }
    ];
    assert.equal(verifyDeviceProof(records, read).verification, 'ambiguous');
    assert.equal(verifyDeviceProof(records, migrated).verification, 'verified', 'a verified recovery must not reintroduce a still-valid legacy binding on the next login');
    assert.deepEqual(f.fresh().read('SYNTHETIC_OTHER').deviceTokenCandidates, ['synthetic-legacy']);
});

test('candidates are bounded, unique, account scoped, and a legacy proof is not migrated before validation', () => {
    const f = fixture();
    const first = f.fresh().read('SYNTHETIC_A');
    f.fresh().save('synthetic-a-token', 'SYNTHETIC_A', first.deviceId);
    f.local.set('tanchin.browser.device.token', 'synthetic-a-token');
    assert.deepEqual(f.fresh().read('SYNTHETIC_A').deviceTokenCandidates, ['synthetic-a-token']);
    const second = f.fresh().read('SYNTHETIC_B');
    assert.deepEqual(second.deviceTokenCandidates, ['synthetic-a-token']);
    assert.equal(second.tokenSource, 'legacy');
    assert.equal(JSON.parse(f.local.get(TOKENS))['id:SYNTHETIC_B'], undefined);
    assert.equal(f.accountCookie('SYNTHETIC_B').token, '');
    f.fresh().save('synthetic-b-token', 'SYNTHETIC_B', first.deviceId);
    assert.equal(f.fresh().read('SYNTHETIC_A').deviceToken, 'synthetic-a-token');
    assert.deepEqual(f.fresh().read('SYNTHETIC_B').deviceTokenCandidates, ['synthetic-b-token']);
    assert.deepEqual(f.fresh().read('SYNTHETIC_C').deviceTokenCandidates, ['synthetic-a-token']);
    assert.ok(f.fresh().read('SYNTHETIC_B').deviceTokenCandidates.length <= 3);
});

test('saving returns readback persistence for a retained read-only proof and reports failed writes without replacing its ID', () => {
    const f = fixture(), employeeId = 'SYNTHETIC_A';
    const initial = f.fresh().read(employeeId);
    f.fresh().save('synthetic-valid-token', employeeId, initial.deviceId);
    f.readOnlyLocal(); f.blockCookie();
    assert.deepEqual(f.fresh().save('synthetic-valid-token', employeeId, initial.deviceId), {
        localStorageStatus: 'unavailable', cookieStorageStatus: 'unavailable', persisted: true, deviceId: initial.deviceId
    });
    f.readOnlyLocal(false); f.blockedLocalKeys.add(TOKENS);
    assert.throws(() => f.fresh().save('synthetic-replacement-token', employeeId, 'synthetic-replacement-id'), (error) => {
        assert.match(error.message, /P216/);
        assert.deepEqual(error.devicePersistence, { localStorageStatus: 'unavailable', cookieStorageStatus: 'unavailable', persisted: false, deviceId: 'synthetic-replacement-id' });
        assert.doesNotMatch(JSON.stringify(error), /synthetic-valid-token|synthetic-replacement-token/);
        return true;
    });
    assert.equal(f.local.get(ID), initial.deviceId);
    assert.equal(JSON.parse(f.local.get(TOKENS))['id:SYNTHETIC_A'], 'synthetic-valid-token');
});

test('a complete account cookie remains recoverable when the shared cookie cannot be refreshed', () => {
    const f = fixture(), employeeId = 'SYNTHETIC_A';
    const initial = f.fresh().read(employeeId);
    f.blockLocal(); f.blockedCookieKeys.add(f.cookieKey('identity'));
    const saved = f.fresh().save('synthetic-cookie-token', employeeId, 'synthetic-cookie-canonical');
    assert.deepEqual(saved, { localStorageStatus: 'unavailable', cookieStorageStatus: 'available', persisted: true, deviceId: 'synthetic-cookie-canonical' });
    const read = f.fresh().read(employeeId);
    assert.equal(read.deviceId, 'synthetic-cookie-canonical');
    assert.notEqual(read.deviceId, initial.deviceId);
    assert.equal(read.deviceToken, 'synthetic-cookie-token');
});
test('blocked persistent storage stops the real login handler before it creates a server binding', async () => {
    const f = fixture(); f.blockLocal(); f.blockCookie();
    assert.throws(() => f.fresh().read('085'), /P216/);
    let posts = 0; const messages = [];
    const app = fs.readFileSync(path.join(__dirname, '../browser-client/app.js'), 'utf8');
    const slice = (start, end) => app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start)));
    const window = { createBrowserDeviceIdentityStore: createStore, localStorage: f.options.storage(), location: { origin: f.options.origin, protocol: f.options.protocol } };
    const context = vm.createContext({ window, document: f.options.document, navigator: { userAgent: 'Edg/1', platform: 'Win32' },
        auditTargetTypeLabels: {}, state: { activeRole: 'account' },
        ui: { loginMessage: {}, loginSubmitBtn: {}, employeeIdInput: { value: '085' }, secretInput: { value: 'fixture-card' } },
        setMessage: (_node, message) => messages.push(message), handleLoginSubmit() {},
        requestJson: async () => { posts++; throw new Error('unexpected request'); } });
    vm.runInContext(slice('const BROWSER_DEVICE_ID_STORAGE_KEY', 'function describeGeolocationError'), context);
    vm.runInContext(slice('const originalHandleLoginSubmitWithSecurity', '// ★ [10] 瀏覽器打卡提交鎖'), context);
    await context.handleLoginSubmit({ preventDefault() {} });
    assert.equal(posts, 0); assert.match(messages.at(-1), /P216/); assert.equal(context.ui.loginSubmitBtn.disabled, false);
});
