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
        const cookieId = text(account.deviceId, 160) || text(backup.deviceId, 160);
        const tokens = parse(localGet(TOKENS));
        const ownToken = employeeId && Object.hasOwn(tokens, 'id:' + employeeId) ? text(tokens['id:' + employeeId], 256) : '';
        const cookieToken = text(account.token, 256);
        const legacyToken = text(localGet(LEGACY_TOKEN), 256);
        const legacyMigrated = Boolean(employeeId && (tokens['verified:id:' + employeeId] === true || account.verified === true));
        // The old global token can belong to another binding/account. Once this account has
        // verified its own proof, keep the legacy value for others but stop resubmitting it.
        const legacyCandidate = legacyMigrated ? '' : legacyToken;
        return { localId, backup, account, ownToken, cookieToken, legacyToken, legacyMigrated,
            identity: { deviceId: localId || cookieId, deviceName: text(localGet(NAME), 120) || text(backup.deviceName, 120) || options.defaultName(),
                deviceToken: ownToken || cookieToken || legacyCandidate,
                deviceTokenCandidates: [...new Set([ownToken, cookieToken, legacyCandidate].filter(Boolean))].slice(0, 3),
                identitySource: localId ? 'local_storage' : cookieId ? 'cookie' : 'generated',
                tokenSource: ownToken ? 'local_storage' : cookieToken ? 'cookie' : legacyCandidate ? 'legacy' : 'none' } };
    }
    function persist(identity, employeeId, current, verified = false) {
        // Before server verification, only fill missing backups. Differing proofs and their
        // stored IDs must survive a read so the server can choose the valid candidate.
        const localDeviceId = verified ? identity.deviceId : current.localId || identity.deviceId;
        const localDeviceToken = verified ? identity.deviceToken : employeeId
            ? current.ownToken || current.cookieToken : current.legacyToken;
        let localToken = true;
        if (localDeviceToken) {
            if (employeeId) {
                const tokens = parse(localGet(TOKENS));
                tokens['id:' + employeeId] = localDeviceToken;
                if (verified || current.legacyMigrated) tokens['verified:id:' + employeeId] = true;
                localToken = localPut(TOKENS, JSON.stringify(tokens));
            } else localToken = localPut(LEGACY_TOKEN, localDeviceToken);
        } else {
            // Verify that more than the short ID can be written before requesting a new binding.
            const probe = 'tanchin.browser.device.storage-check';
            localToken = localPut(probe, '0'.repeat(256));
            try { options.storage().removeItem(probe); } catch { /* no credential is stored here */ }
        }
        // A failed new token write must not also replace the old local ID.
        const localId = localToken && localPut(ID, localDeviceId);
        localPut(NAME, identity.deviceName);
        const accountToken = verified ? identity.deviceToken : current.cookieToken || current.ownToken;
        const accountId = verified ? identity.deviceId : text(current.account.deviceId, 160) || identity.deviceId;
        const cookieToken = employeeId ? cookiePut(accountKey(employeeId), JSON.stringify({ deviceId: accountId, token: accountToken,
            ...((verified || current.legacyMigrated) ? { verified: true } : {}) })) : true;
        const backupId = verified ? identity.deviceId : text(current.backup.deviceId, 160) || identity.deviceId;
        const cookieId = cookieToken && cookiePut('identity', JSON.stringify({ deviceId: backupId, deviceName: identity.deviceName }));
        return { localStorageStatus: localId && localToken ? 'available' : 'unavailable',
            // The per-account cookie contains the complete pair even if the shared name/ID
            // backup could not be refreshed. Recovery must not discard that usable proof.
            cookieStorageStatus: (employeeId ? cookieToken : cookieId) ? 'available' : 'unavailable' };
    }
    function proofPersisted(identity, employeeId) {
        if (!identity.deviceToken) return false;
        const current = existing(employeeId);
        return (current.localId === identity.deviceId && (employeeId ? current.ownToken : current.legacyToken) === identity.deviceToken)
            || Boolean(employeeId && text(current.account.deviceId, 160) === identity.deviceId && current.cookieToken === identity.deviceToken);
    }
    function storageError() {
        return new Error('[P216] 無法保存裝置綁定資料。請允許此網站使用網站資料或 Cookie，並以一般瀏覽視窗登入；尚未送出新的裝置綁定。');
    }
    return {
        read(employeeId = '') {
            const current = existing(employeeId), identity = current.identity;
            if (!identity.deviceId) identity.deviceId = options.generateId();
            const status = persist(identity, employeeId, current);
            if (!identity.deviceToken && status.localStorageStatus !== 'available' && status.cookieStorageStatus !== 'available') throw storageError();
            return { ...identity, ...status };
        },
        save(token, employeeId = '', canonicalDeviceId = '') {
            const current = existing(employeeId), identity = current.identity;
            identity.deviceId = text(canonicalDeviceId, 160) || identity.deviceId;
            identity.deviceToken = text(token, 256) || identity.deviceToken;
            const status = persist(identity, employeeId, current, true);
            const persisted = proofPersisted(identity, employeeId);
            if (!identity.deviceId || !persisted) {
                const error = new Error('[P216] 登入已驗證，但裝置綁定資料無法保存。請保留此畫面並聯絡管理者，不要清除網站資料或反覆新增綁定。');
                error.devicePersistence = { ...status, persisted: false, deviceId: identity.deviceId };
                throw error;
            }
            return { ...status, persisted: true, deviceId: identity.deviceId };
        }
    };
});
