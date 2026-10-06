const crypto = require('node:crypto');
const SETTING_KEY = 'employeeRequestHistory';
const MAX_MONTHS = 120;
function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function historyWindow(lookbackMonths, now = Date.now()) {
    const today = new Date(now + 8 * 3600000).toISOString().slice(0, 10);
    const [year, month] = today.split('-').map(Number);
    const start = lookbackMonths == null ? null : Date.UTC(year, month - 1 - lookbackMonths, 1) - 8 * 3600000;
    return { lookbackMonths, earliestMonth: start == null ? null : new Date(start + 8 * 3600000).toISOString().slice(0, 7), startAt: start, timeZone: 'Asia/Taipei' };
}
function createRequestHistoryStore(sql, addAuditLog) {
    const state = () => {
        const value = sql.prepare('SELECT value FROM settings WHERE key = ?').get(SETTING_KEY)?.value;
        const saved = value == null ? { settings: { leave: null, overtime: null } } : JSON.parse(value);
        if (!saved?.settings || ['leave', 'overtime'].some((kind) => saved.settings[kind] !== null &&
            (!Number.isInteger(saved.settings[kind]) || saved.settings[kind] < 0 || saved.settings[kind] > MAX_MONTHS))) fail('員工紀錄可見範圍設定異常，請聯絡系統管理者。', 500);
        return { settings: saved.settings, revision: crypto.createHash('sha256').update(value || JSON.stringify(saved)).digest('hex'), maxMonths: MAX_MONTHS };
    };
    const window = (kind, now = Date.now()) => historyWindow(state().settings[kind], now);
    const filters = (kind, now = Date.now()) => {
        const policy = window(kind, now);
        return policy.startAt == null ? {} : { endAfterAt: policy.startAt };
    };
    const save = (body, audit, now = Date.now()) => sql.transaction(() => {
        const before = state();
        if (body.revision !== before.revision) fail('紀錄可見範圍已變更，請重新整理後再儲存。', 409);
        if (!body.settings || ['leave', 'overtime'].some((kind) => body.settings[kind] !== null &&
            (!Number.isInteger(body.settings[kind]) || body.settings[kind] < 0 || body.settings[kind] > MAX_MONTHS))) fail('回看月數須為 0 至 120 的整數，或不限制。');
        if (body.confirmHistory !== true) fail('請確認更新全體員工的紀錄可見範圍。');
        const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
        if (!reason || reason.length > 500) fail('請填寫設定原因（最多 500 字）。');
        const settings = { leave: body.settings.leave, overtime: body.settings.overtime };
        if (JSON.stringify(settings) === JSON.stringify(before.settings)) return;
        const entry = audit({ action: 'employee_request_history', target_type: 'employee_request_history', target_id: 'employees',
            summary: `更新員工請假／加班紀錄可見範圍：${reason}`, before_data: before.settings, after_data: { settings, reason } });
        sql.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(SETTING_KEY,
            JSON.stringify({ settings, revision: crypto.randomUUID(), updatedAt: now, updatedBy: entry.actor_id || '' }));
        addAuditLog(entry);
    })();
    return { state, window, filters, save };
}
function attachRequestHistoryRoutes(server, { db, requireSession, requirePermission, auditEntry, notify }) {
    const requireManage = (request, response, next) => {
        if (request.browserSession.impersonation?.active) return response.status(403).json({ success: false, error: '身份模擬不能修改員工紀錄可見範圍。' });
        if (request.browserSession.role === 'system_admin') return next();
        return requirePermission('admin.security.manage')(request, response, next);
    };
    const handle = (callback) => (request, response) => {
        try { callback(request, response); }
        catch (error) { response.status(error.status || 500).json({ success: false, error: error.status ? error.message : '紀錄可見範圍處理失敗，未儲存異動。' }); }
    };
    server.get('/api/browser/request-history/settings', requireSession, requireManage, handle((_request, response) => {
        response.json({ success: true, history: db.getRequestHistory().state() });
    }));
    server.post('/api/browser/request-history/settings', requireSession, requireManage, handle((request, response) => {
        db.getRequestHistory().save(request.body || {}, (entry) => auditEntry(request, entry));
        notify(request);
        response.json({ success: true, history: db.getRequestHistory().state(), message: '員工紀錄可見範圍已儲存。' });
    }));
}
module.exports = { historyWindow, createRequestHistoryStore, attachRequestHistoryRoutes };
