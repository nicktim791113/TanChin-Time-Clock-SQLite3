'use strict';

// Diagnostic fields are allowlisted. Browser metadata is a clue, never proof of identity.
const REASONS = Object.freeze({
    P211: '缺少裝置識別，請確認瀏覽器允許儲存網站資料。',
    P212: '裝置識別相同，但綁定憑證缺少或不符。',
    P213: '這是未綁定的裝置識別，且已達每人綁定上限。',
    P214: '目前登入工作階段缺少裝置資訊。',
    P215: '目前登入工作階段的裝置綁定已解除。',
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
    const supportCode = typeof error?.message === 'string' ? error.message.match(/\bP21[1-5]\b/)?.[0] : '';
    if (supportCode) return supportCode;
    if (error?.statusCode === 429) return 'AUTH_RATE_LIMIT';
    if (error?.statusCode === 401) return stage === 'login' ? 'AUTH_INVALID_CREDENTIALS' : 'SESSION_INVALID';
    if (error?.statusCode === 403) return 'WORKSPACE_DENIED';
    if (error?.statusCode === 400) return 'AUTH_INPUT_INVALID';
    return 'INTERNAL_ERROR';
}

function buildDeviceLoginDiagnostic({ request, employee, stage, success, error, settings, boundDeviceCount }) {
    const body = request.body && typeof request.body === 'object' ? request.body : {};
    const device = body.deviceInfo && typeof body.deviceInfo === 'object' ? body.deviceInfo : {};
    const session = stage === 'punch' ? request.browserSession : null;
    const authorization = typeof request.headers?.authorization === 'string' ? request.headers.authorization : '';
    const secrets = [body.secret, device.deviceToken, authorization, authorization.replace(/^Bearer /, '')];
    const safe = (value, limit) => diagnosticText(value, limit, secrets);
    const code = success ? '' : failureCode(error, stage);
    return {
        employeeId: diagnosticText(employee?.id, 80),
        employeeName: diagnosticText(employee?.name, 120),
        department: diagnosticText(employee?.department, 120),
        submittedAccount: stage === 'login' ? safe(body.employeeId, 80) : '',
        stage: ['login', 'workspace_switch', 'punch'].includes(stage) ? stage : 'login',
        success: success === true,
        failureCode: code,
        reason: success ? '登入或工作台驗證成功。' : REASONS[code],
        deviceId: safe(session?.deviceId || device.deviceId, 160),
        deviceName: safe(session?.deviceName || device.deviceName, 120),
        platform: safe(session?.devicePlatform || device.platform, 80),
        browserName: safe(session?.deviceBrowserName || device.browserName, 80),
        siteOrigin: safe(siteOrigin(request), 256),
        // Use the actual peer; forwarded headers are not authenticated by this server.
        ipAddress: safe(request.socket?.remoteAddress, 80),
        userAgent: safe(request.headers?.['user-agent'], 512),
        tokenPresent: typeof device.deviceToken === 'string' && device.deviceToken.trim().length > 0,
        boundDeviceCount: Number.isInteger(boundDeviceCount) && boundDeviceCount >= 0 ? boundDeviceCount : 0,
        maxDevicesPerEmployee: settings.maxDevicesPerEmployee
    };
}

// Keep dashboard projection allowlisted even if an older or manually inserted audit row differs.
function mapDeviceLoginDiagnostic(record) {
    const data = record.after_data && typeof record.after_data === 'object' ? record.after_data : {};
    const result = {};
    const fields = { employeeId: 80, employeeName: 120, department: 120, submittedAccount: 80,
        deviceId: 160, deviceName: 120, platform: 80, browserName: 80, siteOrigin: 256, ipAddress: 80, userAgent: 512 };
    for (const [field, limit] of Object.entries(fields)) result[field] = diagnosticText(data[field], limit);
    const code = Object.hasOwn(REASONS, data.failureCode || '') ? data.failureCode : 'INTERNAL_ERROR';
    return { id: Number(record.id), timestamp: Number(record.timestamp),
        timestampText: new Date(record.timestamp).toLocaleString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' }),
        ...result, stage: ['login', 'workspace_switch', 'punch'].includes(data.stage) ? data.stage : 'login',
        success: record.success !== false, failureCode: record.success !== false ? '' : code,
        reason: record.success !== false ? '登入或工作台驗證成功。' : REASONS[code],
        tokenPresent: data.tokenPresent === true,
        boundDeviceCount: Number.isInteger(data.boundDeviceCount) && data.boundDeviceCount >= 0 ? data.boundDeviceCount : 0,
        maxDevicesPerEmployee: [1, 2, 3, 4].includes(data.maxDevicesPerEmployee) ? data.maxDevicesPerEmployee : 4 };
}

module.exports = { buildDeviceLoginDiagnostic, mapDeviceLoginDiagnostic };
