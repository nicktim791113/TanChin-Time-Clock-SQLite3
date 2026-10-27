'use strict';

// Diagnostic fields are allowlisted. Browser metadata is a clue, never proof of identity.
const REASONS = Object.freeze({
    P211: '缺少裝置識別，請確認瀏覽器允許儲存網站資料。',
    P212: '裝置識別相同，但綁定憑證缺少或不符。',
    P213: '這是未綁定的裝置識別，且已達每人綁定上限。',
    P214: '目前登入工作階段缺少裝置資訊。',
    P215: '目前登入工作階段的裝置綁定已解除。',
    P216: '無法保存裝置綁定資料，請允許此網站使用網站資料或 Cookie。',
    P217: '本機保存了多個不同綁定的有效憑證，須管理者確認原裝置。',
    DEVICE_STORAGE_FAILED: '登入成功後，瀏覽器回報無法保存裝置憑證。',
    AUTH_INPUT_INVALID: '登入欄位不完整或格式不正確。',
    AUTH_INVALID_CREDENTIALS: '帳號或登入憑證未通過驗證。',
    AUTH_RATE_LIMIT: '登入嘗試過於頻繁，請稍後再試。',
    SESSION_INVALID: '登入已失效，或帳號權限已變更。',
    WORKSPACE_DENIED: '帳號或登入方式沒有這個工作台權限。',
    INTERNAL_ERROR: '系統處理失敗，請聯絡管理者。'
});

function diagnosticText(value, limit = 160, secrets = []) {
    if (typeof value !== 'string') return '';
    let result = value;
    for (const secret of secrets) if (typeof secret === 'string' && secret) result = result.split(secret).join('[已遮罩]');
    return result.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit);
}

function siteOrigin(request) {
    const header = request.headers?.origin;
    const value = typeof header === 'string' && header ? header : `${request.protocol === 'https' ? 'https' : 'http'}://${request.headers?.host || ''}`;
    try {
        const parsed = new URL(value);
        return ['http:', 'https:'].includes(parsed.protocol) ? parsed.origin.slice(0, 256) : '';
    } catch { return ''; }
}

function failureCode(error, stage) {
    if (Object.hasOwn(REASONS, error?.diagnosticCode || '')) return error.diagnosticCode;
    const supportCode = typeof error?.message === 'string' ? error.message.match(/\bP21[1-7]\b/)?.[0] : '';
    if (supportCode) return supportCode;
    if (error?.statusCode === 429) return 'AUTH_RATE_LIMIT';
    if (error?.statusCode === 401) return stage === 'login' ? 'AUTH_INVALID_CREDENTIALS' : 'SESSION_INVALID';
    if (error?.statusCode === 403) return 'WORKSPACE_DENIED';
    if (error?.statusCode === 400) return 'AUTH_INPUT_INVALID';
    return 'INTERNAL_ERROR';
}

function successReason(stage) {
    if (stage === 'device_storage') return '裝置綁定憑證保存確認。';
    if (stage === 'device_recovery') return '管理者確認恢復原裝置完成。';
    return '登入或工作台驗證成功。';
}

function buildDeviceLoginDiagnostic({ request, employee, stage, success, error, settings, boundDeviceCount }) {
    const body = request.body && typeof request.body === 'object' ? request.body : {};
    const device = body.deviceInfo && typeof body.deviceInfo === 'object' ? body.deviceInfo : {};
    const session = ['punch', 'device_storage'].includes(stage) ? request.browserSession : null;
    const binding = request.deviceAuthorization || {};
    const authorization = typeof request.headers?.authorization === 'string' ? request.headers.authorization : '';
    const secrets = [body.secret, body.requestToken, device.deviceToken, ...(Array.isArray(device.deviceTokenCandidates) ? device.deviceTokenCandidates : []), authorization, authorization.replace(/^Bearer /, '')];
    const safe = (value, limit) => diagnosticText(value, limit, secrets);
    const code = success ? '' : failureCode(error, stage);
    return {
        employeeId: diagnosticText(employee?.id, 80),
        employeeName: diagnosticText(employee?.name, 120),
        department: diagnosticText(employee?.department, 120),
        submittedAccount: stage === 'login' ? safe(body.employeeId, 80) : '',
        stage: ['login', 'workspace_switch', 'punch', 'device_recovery', 'device_storage'].includes(stage) ? stage : 'login',
        success: success === true,
        failureCode: code,
        reason: success ? successReason(stage) : REASONS[code],
        deviceId: safe(session?.deviceId || device.deviceId, 160),
        deviceName: safe(session?.deviceName || device.deviceName, 120),
        platform: safe(session?.devicePlatform || device.platform, 80),
        browserName: safe(session?.deviceBrowserName || device.browserName, 80),
        siteOrigin: safe(siteOrigin(request), 256),
        // Use the actual peer; forwarded headers are not authenticated by this server.
        ipAddress: safe(request.socket?.remoteAddress, 80),
        userAgent: safe(request.headers?.['user-agent'], 512),
        tokenPresent: [device.deviceToken, ...(Array.isArray(device.deviceTokenCandidates) ? device.deviceTokenCandidates.slice(0, 3) : [])]
            .some((value) => typeof value === 'string' && value.trim().length > 0),
        identitySource: ['local_storage', 'cookie', 'generated'].includes(device.identitySource) ? device.identitySource : 'unknown',
        tokenSource: ['local_storage', 'cookie', 'legacy', 'none'].includes(device.tokenSource) ? device.tokenSource : 'unknown',
        localStorageStatus: ['available', 'unavailable'].includes(device.localStorageStatus) ? device.localStorageStatus : 'unknown',
        cookieStorageStatus: ['available', 'unavailable'].includes(device.cookieStorageStatus) ? device.cookieStorageStatus : 'unknown',
        identityRecovered: request.deviceIdentityRecovered === true || binding.bindingOutcome === 'recovered',
        originalDeviceId: safe(binding.originalDeviceId || device.deviceId, 160),
        canonicalDeviceId: safe(binding.canonicalDeviceId, 160),
        bindingOutcome: ['new', 'existing', 'recovered', 'disabled', 'blocked', 'persistence'].includes(binding.bindingOutcome) ? binding.bindingOutcome : 'blocked',
        tokenVerification: ['verified', 'missing', 'invalid', 'ambiguous', 'not_required'].includes(binding.tokenVerification) ? binding.tokenVerification : 'not_required',
        tokenCandidateCount: Math.max(0, Math.min(3, Number(binding.tokenCandidateCount) || 0)),
        boundDeviceCountBefore: Number.isInteger(binding.boundDeviceCountBefore) ? binding.boundDeviceCountBefore : boundDeviceCount || 0,
        boundDeviceCountAfter: Number.isInteger(binding.boundDeviceCountAfter) ? binding.boundDeviceCountAfter : boundDeviceCount || 0,
        persistenceStatus: ['saved', 'partial', 'retained', 'failed'].includes(request.devicePersistenceStatus) ? request.devicePersistenceStatus : 'unknown',
        boundDeviceCount: Number.isInteger(boundDeviceCount) && boundDeviceCount >= 0 ? boundDeviceCount : 0,
        maxDevicesPerEmployee: settings.maxDevicesPerEmployee
    };
}

// Keep dashboard projection allowlisted even if an older or manually inserted audit row differs.
function mapDeviceLoginDiagnostic(record) {
    const data = record.after_data && typeof record.after_data === 'object' ? record.after_data : {};
    const result = {};
    const fields = { employeeId: 80, employeeName: 120, department: 120, submittedAccount: 80,
        deviceId: 160, originalDeviceId: 160, canonicalDeviceId: 160, deviceName: 120, platform: 80, browserName: 80, siteOrigin: 256, ipAddress: 80, userAgent: 512 };
    for (const [field, limit] of Object.entries(fields)) result[field] = diagnosticText(data[field], limit);
    const code = Object.hasOwn(REASONS, data.failureCode || '') ? data.failureCode : 'INTERNAL_ERROR';
    return { id: Number(record.id), timestamp: Number(record.timestamp),
        timestampText: new Date(record.timestamp).toLocaleString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' }),
        ...result, stage: ['login', 'workspace_switch', 'punch', 'device_recovery', 'device_storage'].includes(data.stage) ? data.stage : 'login',
        success: record.success !== false, failureCode: record.success !== false ? '' : code,
        reason: record.success !== false ? successReason(data.stage) : REASONS[code],
        tokenPresent: data.tokenPresent === true,
        identitySource: ['local_storage', 'cookie', 'generated'].includes(data.identitySource) ? data.identitySource : 'unknown',
        tokenSource: ['local_storage', 'cookie', 'legacy', 'none'].includes(data.tokenSource) ? data.tokenSource : 'unknown',
        localStorageStatus: ['available', 'unavailable'].includes(data.localStorageStatus) ? data.localStorageStatus : 'unknown',
        cookieStorageStatus: ['available', 'unavailable'].includes(data.cookieStorageStatus) ? data.cookieStorageStatus : 'unknown',
        identityRecovered: data.identityRecovered === true,
        bindingOutcome: ['new', 'existing', 'recovered', 'disabled', 'blocked', 'persistence'].includes(data.bindingOutcome) ? data.bindingOutcome : '',
        tokenVerification: ['verified', 'missing', 'invalid', 'ambiguous', 'not_required'].includes(data.tokenVerification) ? data.tokenVerification : '',
        tokenCandidateCount: Math.max(0, Math.min(3, Number(data.tokenCandidateCount) || 0)),
        boundDeviceCountBefore: Number.isInteger(data.boundDeviceCountBefore) ? data.boundDeviceCountBefore : null,
        boundDeviceCountAfter: Number.isInteger(data.boundDeviceCountAfter) ? data.boundDeviceCountAfter : null,
        persistenceStatus: ['saved', 'partial', 'retained', 'failed'].includes(data.persistenceStatus) ? data.persistenceStatus : 'unknown',
        boundDeviceCount: Number.isInteger(data.boundDeviceCount) && data.boundDeviceCount >= 0 ? data.boundDeviceCount : 0,
        maxDevicesPerEmployee: [1, 2, 3, 4].includes(data.maxDevicesPerEmployee) ? data.maxDevicesPerEmployee : 4 };
}

module.exports = { buildDeviceLoginDiagnostic, mapDeviceLoginDiagnostic };
