'use strict';

const crypto = require('node:crypto');
const { deviceVersion } = require('./device-recovery-store');
const { recentTaipeiDateRange } = require('./admin-security-data');
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const httpError = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const clean = (value, limit = 500) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit) : '';

function attachDeviceRecoveryRoutes(server, context) {
    const { db, accounts, getEmployee, normalizeDeviceInfo, authorizeDevice, getSettings, buildDevice,
        requireSession, requirePermission, auditEntry, mapDevice, recordDiagnostic, mapDiagnostic, notify } = context;
    const completions = new Map();
    const proofAttempts = new Map();
    const lifetime = 15 * 60 * 1000;
    function proofThrottle(request) {
        const now = Date.now();
        for (const [key, value] of proofAttempts) if (value.until <= now) proofAttempts.delete(key);
        for (const [key, value] of completions) if (value.expiresAt <= now) completions.delete(key);
        const key = request.socket.remoteAddress || 'local';
        const item = proofAttempts.get(key) || { count: 0, until: now + 60000 };
        if (++item.count > 120) throw httpError('查詢過於頻繁，請稍後再試。', 429);
        proofAttempts.set(key, item);
    }
    const wrap = (handler) => async (request, response) => {
        response.setHeader('Cache-Control', 'no-store');
        try { await handler(request, response); }
        catch (error) { response.status(error.statusCode || 500).json({ success: false, error: error.statusCode ? error.message : '裝置恢復處理失敗，請稍後再試。' }); }
    };
    function status(row) {
        return { requestId: row.id, employeeId: row.employee_id, status: row.status, requestedAt: row.requested_at,
            expiresAt: row.expires_at, decisionReason: row.decision_reason || '' };
    }
    function proof(request) {
        proofThrottle(request);
        return db.getDeviceRecovery().authorize(clean(request.body?.requestId, 80), request.body?.requestToken);
    }
    function requestAudit(request, employee, action, data) {
        return { ...auditEntry(request, { action, target_type: 'device_recovery', target_id: employee.id,
            summary: '裝置綁定恢復申請。', after_data: data }), actor_id: employee.id, actor_name: employee.name, role: 'employee' };
    }
    server.post('/api/browser/device-recovery/request', wrap(async (request, response) => {
        let identity;
        try { identity = await accounts.authenticateRecovery(request); }
        catch (error) { recordDiagnostic(request, { stage: 'login', success: false, error }); throw error; }
        const { employee, authSignature } = identity;
        const rawDevice = request.body?.deviceInfo && typeof request.body.deviceInfo === 'object' ? request.body.deviceInfo : {};
        const device = normalizeDeviceInfo(rawDevice);
        let blocked;
        try { authorizeDevice(employee, request, device, { dryRun: true }); }
        catch (error) { blocked = error; }
        if (!blocked || !/\bP21[237]\b/.test(blocked.message)) throw httpError('僅限綁定憑證遺失或裝置額滿時申請恢復，請先嘗試正常登入。', 409);
        if (!device.deviceId || (device.localStorageStatus === 'unavailable' && device.cookieStorageStatus === 'unavailable')) {
            throw httpError('請先允許瀏覽器保存網站資料或 Cookie，再申請恢復原裝置。');
        }
        const secrets = [request.body.secret, rawDevice.deviceToken, ...(Array.isArray(rawDevice.deviceTokenCandidates) ? rawDevice.deviceTokenCandidates : [])]
            .filter((value) => typeof value === 'string' && value);
        const safe = (value, limit) => clean(secrets.reduce((text, secret) => text.split(secret).join('[已遮罩]'), typeof value === 'string' ? value : ''), limit);
        if (typeof rawDevice.deviceId !== 'string' || secrets.some((secret) => rawDevice.deviceId.includes(secret))) {
            throw httpError('裝置識別格式不正確，請重新載入頁面。');
        }
        // Redact the original input before normalization truncates metadata or builds a fallback name.
        const safeMetadata = normalizeDeviceInfo({ ...rawDevice, deviceName: safe(rawDevice.deviceName, 120),
            platform: safe(rawDevice.platform, 80), browserName: safe(rawDevice.browserName, 80) });
        const reason = safe(request.body.reason, 500);
        if (!reason) throw httpError('請填寫恢復原因，供管理者確認原裝置。');
        const now = Date.now(), id = crypto.randomUUID(), requestToken = crypto.randomBytes(32).toString('hex');
        let siteOrigin = '';
        try { siteOrigin = new URL(safe(request.headers.origin || `${request.protocol}://${request.headers.host}`, 4096)).origin; } catch { /* informational only */ }
        const sanitized = { deviceId: safe(device.deviceId, 160), deviceName: safeMetadata.deviceName,
            platform: safeMetadata.platform, browserName: safeMetadata.browserName,
            userAgent: safe(request.headers['user-agent'], 512), ipAddress: clean(request.socket.remoteAddress, 80), siteOrigin: safe(siteOrigin, 256) };
        // Reject identifiers containing submitted secrets rather than changing the target binding silently.
        if (sanitized.deviceId !== device.deviceId) throw httpError('裝置識別格式不正確，請重新載入頁面。');
        const snapshot = db.loadEmployeeDevices(employee.id).map((row) => ({ deviceId: row.device_id, version: deviceVersion(row) }));
        if (!accounts.validRecoveryIdentity(employee.id, authSignature)) throw httpError('登入資料已變更，請重新提出申請。', 409);
        const row = db.getDeviceRecovery().create({ id, employeeId: employee.id, proofHash: hash(requestToken), authSignature,
            device: sanitized, snapshot, reason, requestedAt: now, expiresAt: now + lifetime },
            requestAudit(request, employee, 'device_recovery_request', { requestId: id, deviceId: sanitized.deviceId, reason, boundDeviceCount: snapshot.length }));
        recordDiagnostic(request, { stage: 'login', success: false, error: blocked, employee });
        notify(request);
        response.json({ success: true, ...status(row), requestToken });
    }));
    server.post('/api/browser/device-recovery/status', wrap((request, response) => {
        response.json({ success: true, ...status(proof(request)) });
    }));
    server.get('/api/browser/admin/device-recovery-requests', requireSession, requirePermission('admin.security.view'), wrap((request, response) => {
        const requests = db.getDeviceRecovery().list(clean(request.query.employeeId, 80)).map((row) => {
            const employee = getEmployee(row.employee_id);
            const device = JSON.parse(row.device_json);
            return { ...status(row), employeeName: employee?.name || '已刪除員工', reason: row.reason, ...device,
                oldDeviceId: row.old_device_id || '', decidedBy: row.decided_by || '', decidedAt: row.decided_at || null,
                oldDevices: db.loadEmployeeDevices(row.employee_id).map((item) => mapDevice(item, new Map(employee ? [[employee.id, employee]] : []))) };
        });
        response.json({ success: true, requests });
    }));
    for (const [action, nextStatus] of [['approve', 'approved'], ['reject', 'rejected']]) {
        server.post(`/api/browser/admin/device-recovery/${action}`, requireSession, requirePermission('admin.security.manage'), wrap((request, response) => {
            if (request.browserSession.impersonation?.active) throw httpError('身份模擬不能核准或退回裝置恢復申請。', 403);
            const id = clean(request.body?.requestId, 80), reason = clean(request.body?.reason, 500);
            const row = db.getDeviceRecovery().get(id);
            if (!row) throw httpError('找不到恢復申請。', 404);
            if (!reason) throw httpError('請填寫確認或退回原因。');
            if (!getSettings().deviceBindingEnabled || !accounts.validRecoveryIdentity(row.employee_id, row.auth_signature)) {
                throw httpError('安全設定或員工登入資料已變更，請重新提出申請。', 409);
            }
            const oldDeviceId = clean(request.body?.oldDeviceId, 160);
            const result = db.getDeviceRecovery().decide(id, nextStatus, { oldDeviceId, reason, actorId: request.browserSession.employeeId },
                auditEntry(request, { action: `device_recovery_${action}`, target_type: 'device_recovery', target_id: row.employee_id,
                    summary: action === 'approve' ? '管理者確認恢復指定原裝置；待申請端完成。' : '管理者退回裝置恢復申請。',
                    after_data: { requestId: id, oldDeviceId, reason, status: nextStatus } }));
            notify(request);
            response.json({ success: true, ...status(result) });
        }));
    }
    server.post('/api/browser/device-recovery/complete', wrap((request, response) => {
        const row = proof(request);
        if (row.expires_at <= Date.now()) throw httpError('恢復憑證已逾期，請重新提出申請。', 409);
        if (!getSettings().deviceBindingEnabled || !accounts.validRecoveryIdentity(row.employee_id, row.auth_signature)) {
            throw httpError('安全設定或員工登入資料已變更，請重新提出申請。', 409);
        }
        if (row.status === 'completed' && completions.has(row.id)) {
            const entry = completions.get(row.id);
            if (entry.store !== db.getDeviceRecovery()) throw httpError('服務或資料庫已重新啟動，請重新提出申請。', 409);
            const cached = entry.response;
            const binding = db.getEmployeeDevice(row.employee_id, cached.deviceBinding.deviceId);
            if (!binding || binding.device_token_hash !== hash(cached.deviceBinding.issuedDeviceToken)) {
                throw httpError('恢復後的綁定已變更，請重新登入或提出申請。', 409);
            }
            return response.json(cached);
        }
        const token = crypto.randomBytes(32).toString('hex');
        const employee = getEmployee(row.employee_id);
        const device = JSON.parse(row.device_json);
        const result = db.getDeviceRecovery().complete(row.id, (current, old) => buildDevice(current.employee_id, device, request,
            { ...old, last_gps_lat: null, last_gps_lng: null, last_gps_accuracy: null, last_gps_at: null }, { deviceTokenHash: hash(token) }),
        (current, old, replacement, count) => requestAudit(request, employee, 'device_recovery_complete', {
            requestId: row.id, decisionBy: current.decided_by, reason: current.decision_reason,
            before: { deviceId: old.device_id, deviceName: old.device_name, boundDeviceCount: count },
            after: { deviceId: replacement.device_id, deviceName: replacement.device_name, boundDeviceCount: count }
        }));
        accounts.revokeDevice(employee.id, result.row.old_device_id);
        const payload = { success: true, employeeId: employee.id, ...status(result.row), deviceBinding: {
            enabled: true, deviceId: result.replacement.device_id, deviceName: result.replacement.device_name,
            issuedDeviceToken: token, maxDevicesPerEmployee: getSettings().maxDevicesPerEmployee,
            boundDeviceCount: result.count, newlyBound: false, recovered: true, identityRecovered: true } };
        completions.set(row.id, { expiresAt: row.expires_at, response: payload, store: db.getDeviceRecovery() });
        request.deviceAuthorization = { originalDeviceId: device.deviceId, canonicalDeviceId: result.replacement.device_id,
            bindingOutcome: 'recovered', tokenVerification: 'verified', boundDeviceCountBefore: result.count, boundDeviceCountAfter: result.count };
        request.body.deviceInfo = device;
        recordDiagnostic(request, { stage: 'device_recovery', success: true, employee });
        notify(request);
        response.json(payload);
    }));
    server.post('/api/browser/device-recovery/storage-status', wrap((request, response) => {
        const row = proof(request);
        if (row.status !== 'completed' || row.expires_at <= Date.now()) throw httpError('恢復尚未完成或憑證已逾期，無法回報保存結果。', 409);
        const device = JSON.parse(row.device_json);
        if (request.body?.deviceId !== device.deviceId) throw httpError('保存回報與恢復裝置不符。', 403);
        const local = request.body.localStorageStatus === 'available', cookie = request.body.cookieStorageStatus === 'available';
        const persisted = request.body.persisted === true;
        request.devicePersistenceStatus = persisted ? (local && cookie ? 'saved' : local || cookie ? 'partial' : 'retained') : 'failed';
        request.deviceAuthorization = { originalDeviceId: device.deviceId, canonicalDeviceId: device.deviceId, bindingOutcome: 'persistence', tokenVerification: 'verified' };
        request.body.deviceInfo = { ...device, localStorageStatus: local ? 'available' : 'unavailable', cookieStorageStatus: cookie ? 'available' : 'unavailable' };
        recordDiagnostic(request, { stage: 'device_storage', success: persisted, employee: getEmployee(row.employee_id),
            error: persisted ? null : Object.assign(httpError('裝置憑證保存失敗。'), { diagnosticCode: 'DEVICE_STORAGE_FAILED' }) });
        response.json({ success: true });
    }));
    server.post('/api/browser/device-storage-status', requireSession, wrap((request, response) => {
        const session = request.browserSession;
        if (session.role !== 'employee' || session.impersonation?.active || !session.deviceId || request.body?.deviceId !== session.deviceId
            || !db.getEmployeeDevice(session.employeeId, session.deviceId)) throw httpError('裝置保存回報與目前登入不符。', 403);
        const body = request.body;
        const local = body.localStorageStatus === 'available', cookie = body.cookieStorageStatus === 'available';
        const persisted = body.persisted === true;
        request.devicePersistenceStatus = persisted ? (local && cookie ? 'saved' : local || cookie ? 'partial' : 'retained') : 'failed';
        request.deviceAuthorization = { originalDeviceId: session.deviceId, canonicalDeviceId: session.deviceId, bindingOutcome: 'persistence', tokenVerification: 'verified' };
        request.body.deviceInfo = { deviceId: session.deviceId, localStorageStatus: local ? 'available' : 'unavailable', cookieStorageStatus: cookie ? 'available' : 'unavailable' };
        recordDiagnostic(request, { stage: 'device_storage', success: persisted, employee: getEmployee(session.employeeId),
            error: persisted ? null : Object.assign(httpError('裝置憑證保存失敗。'), { diagnosticCode: 'DEVICE_STORAGE_FAILED' }) });
        response.json({ success: true });
    }));
    server.get('/api/browser/admin/device-login-diagnostics', requireSession, requirePermission('admin.security.view'), wrap((request, response) => {
        const range = recentTaipeiDateRange();
        const startDate = clean(request.query.startDate, 10) || range.startDate, endDate = clean(request.query.endDate, 10) || range.endDate;
        const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00+08:00`))
            && new Date(Date.parse(`${value}T00:00:00+08:00`) + 8 * 3600000).toISOString().slice(0, 10) === value;
        if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) throw httpError('請選擇有效的診斷日期範圍。');
        const startAt = Date.parse(`${startDate}T00:00:00+08:00`), endAt = Date.parse(`${endDate}T00:00:00+08:00`) + 86400000;
        if (endAt - startAt > 366 * 86400000) throw httpError('每次最多查詢 366 天。');
        const result = request.query.result || 'all';
        if (!['all', 'success', 'failure'].includes(result)) throw httpError('診斷結果篩選值無效。');
        const page = Math.max(1, Math.min(1000000, Number.parseInt(request.query.page, 10) || 1));
        const pageSize = Math.max(1, Math.min(200, Number.parseInt(request.query.pageSize, 10) || 50));
        const employeeId = clean(request.query.employeeId, 80);
        const queried = db.queryDeviceLoginDiagnostics({ employeeId, startAt, endAt, result, page, pageSize });
        response.json({ success: true, records: queried.records.map(mapDiagnostic), total: queried.total, page, pageSize, startDate, endDate, result, employeeId });
    }));
}

module.exports = { attachDeviceRecoveryRoutes };
