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
    let localBlocked = false, localReadOnly = false, cookieBlocked = false, sequence = 0;
    const storage = {
        getItem(key) { if (localBlocked) throw new Error('blocked'); return local.get(key) || null; },
        setItem(key, value) { if (localBlocked || localReadOnly) throw new Error('blocked'); local.set(key, value); },
        removeItem(key) { if (localBlocked) throw new Error('blocked'); local.delete(key); }
    };
    const document = {
        get cookie() { return cookieBlocked ? '' : [...cookies].map(([key, value]) => key + '=' + value).join('; '); },
        set cookie(value) {
            writes.push(value); if (cookieBlocked) return;
            const pair = value.split(';')[0], at = pair.indexOf('='); cookies.set(pair.slice(0, at), pair.slice(at + 1));
        }
    };
    const options = { storage: () => storage, document, origin: 'http://tc-150:3000', protocol: 'http:', generateId: () => 'new-' + ++sequence, defaultName: () => 'Windows / Edge' };
    return { local, cookies, writes, options, fresh: () => createStore(options),
        blockLocal(value = true) { localBlocked = value; }, readOnlyLocal(value = true) { localReadOnly = value; }, blockCookie(value = true) { cookieBlocked = value; } };
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
