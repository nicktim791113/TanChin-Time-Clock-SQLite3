(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory;
    else root.createBrowserDeviceIdentityStore = factory;
})(typeof window === 'object' ? window : globalThis, function createBrowserDeviceIdentityStore(options) {
    'use strict';
    const ID = 'tanchin.browser.device.id', NAME = 'tanchin.browser.device.name';
    const TOKENS = 'browserPortalAccountDeviceTokens', LEGACY_TOKEN = 'tanchin.browser.device.token';
    // Cookies are host-only and additionally scoped by origin in their names: ports and schemes
    // must not accidentally share credentials. No hardware identity is inferred from metadata.
    const prefix = 'tanchin_device_v1_' + encodeURIComponent(options.origin) + '_';
    const text = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
    const parse = (value) => { try { const result = JSON.parse(value); return result && typeof result === 'object' && !Array.isArray(result) ? result : {}; } catch { return {}; } };
    function localGet(key) { try { return options.storage().getItem(key) || ''; } catch { return ''; } }
    function localPut(key, value) {
        try { const storage = options.storage(); storage.setItem(key, value); return storage.getItem(key) === value; } catch { return false; }
    }
    function cookieGet(key) {
        try {
            const name = prefix + key + '=';
            const found = String(options.document.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(name));
            return found ? decodeURIComponent(found.slice(name.length)) : '';
        } catch { return ''; }
    }
    function cookiePut(key, value) {
        try {
            options.document.cookie = prefix + key + '=' + encodeURIComponent(value) + '; Max-Age=15552000; Path=/browser/; SameSite=Strict' + (options.protocol === 'https:' ? '; Secure' : '');
            return cookieGet(key) === value;
        } catch { return false; }
    }
    const accountKey = (employeeId) => 'account_' + encodeURIComponent(employeeId);
    function existing(employeeId) {
        const backup = parse(cookieGet('identity'));
        const account = employeeId ? parse(cookieGet(accountKey(employeeId))) : {};
        const localId = text(localGet(ID), 160);
        const cookieId = text(backup.deviceId, 160) || text(account.deviceId, 160);
        const tokens = parse(localGet(TOKENS));
        const ownToken = employeeId && Object.hasOwn(tokens, 'id:' + employeeId) ? text(tokens['id:' + employeeId], 256) : '';
        const cookieToken = text(account.token, 256);
        const legacyToken = text(localGet(LEGACY_TOKEN), 256);
        return { deviceId: localId || cookieId, deviceName: text(localGet(NAME), 120) || text(backup.deviceName, 120) || options.defaultName(),
            deviceToken: ownToken || cookieToken || legacyToken, identitySource: localId ? 'local_storage' : cookieId ? 'cookie' : 'generated',
            tokenSource: ownToken ? 'local_storage' : cookieToken ? 'cookie' : legacyToken ? 'legacy' : 'none' };
    }
    function persist(identity, employeeId) {
        const localId = localPut(ID, identity.deviceId);
        localPut(NAME, identity.deviceName);
        let localToken = true;
        if (identity.deviceToken) {
            if (employeeId) {
                const tokens = parse(localGet(TOKENS));
                tokens['id:' + employeeId] = identity.deviceToken;
                localToken = localPut(TOKENS, JSON.stringify(tokens));
            } else localToken = localPut(LEGACY_TOKEN, identity.deviceToken);
        } else {
            // Verify that more than the short ID can be written before requesting a new binding.
            const probe = 'tanchin.browser.device.storage-check';
            localToken = localPut(probe, '0'.repeat(256));
            try { options.storage().removeItem(probe); } catch { /* no credential is stored here */ }
        }
        const cookieId = cookiePut('identity', JSON.stringify({ deviceId: identity.deviceId, deviceName: identity.deviceName }));
        const cookieToken = employeeId ? cookiePut(accountKey(employeeId), JSON.stringify({ deviceId: identity.deviceId, token: identity.deviceToken })) : cookieId;
        return { localStorageStatus: localId && localToken ? 'available' : 'unavailable',
            cookieStorageStatus: cookieId && cookieToken ? 'available' : 'unavailable' };
    }
    function storageError() {
        return new Error('[P216] 無法保存裝置綁定資料。請允許此網站使用網站資料或 Cookie，並以一般瀏覽視窗登入；尚未送出新的裝置綁定。');
    }
    return {
        read(employeeId = '') {
            const identity = existing(employeeId);
            if (!identity.deviceId) identity.deviceId = options.generateId();
            const status = persist(identity, employeeId);
            if (!identity.deviceToken && status.localStorageStatus !== 'available' && status.cookieStorageStatus !== 'available') throw storageError();
            return { ...identity, ...status };
        },
        save(token, employeeId = '', canonicalDeviceId = '') {
            const identity = existing(employeeId);
            const previousId = identity.deviceId, previousToken = identity.deviceToken;
            identity.deviceId = text(canonicalDeviceId, 160) || identity.deviceId;
            identity.deviceToken = text(token, 256) || identity.deviceToken;
            if (!identity.deviceId) return;
            const status = persist(identity, employeeId);
            if (status.localStorageStatus !== 'available' && status.cookieStorageStatus !== 'available') {
                // Existing persisted proof is still usable when a storage policy becomes read-only.
                if (previousId === identity.deviceId && previousToken && previousToken === identity.deviceToken) return;
                throw new Error('[P216] 登入已驗證，但裝置綁定資料無法保存。請保留此畫面並聯絡管理者，不要清除網站資料或反覆新增綁定。');
            }
        }
    };
});
