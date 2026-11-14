const { createHash } = require('node:crypto');

const DEFAULT_ORDER = Object.freeze([
    'all', 'valid', 'leave', 'abnormal', 'raw_abnormal', 'missing_punch', 'pending_punch', 'duplicate', 'in', 'out', 'employees'
]);
const KEYS = new Set(DEFAULT_ORDER);
const NAV_TYPE = 'report-summary';

function normalizeOrder(order) {
    return [...new Set([...(Array.isArray(order) ? order.filter(key => KEYS.has(key)) : []), ...DEFAULT_ORDER])];
}

function fail(status, message) {
    throw Object.assign(new Error(message), { status });
}

function attachReportSummaryOrderRoutes(server, { db, requireSession, requirePermission, auditEntry }) {
    const path = '/api/browser/admin/reports/summary-order';
    const canEdit = session => Boolean(session.employeeId && !session.impersonation?.active &&
        (!session.realEmployeeId || session.realEmployeeId === session.employeeId));
    const preferences = (session) => {
        const editable = canEdit(session);
        const row = editable ? db.getWorkspaceNavOrderRecord('admin', NAV_TYPE, 'personal', session.realEmployeeId || session.employeeId) : null;
        const order = normalizeOrder(row?.order);
        const revision = createHash('sha256').update(JSON.stringify([row?.id ?? null, order])).digest('hex');
        return { order, defaultOrder: DEFAULT_ORDER, revision, canEdit: editable };
    };
    const respond = (callback) => (request, response) => {
        response.set('Cache-Control', 'no-store');
        try {
            response.json({ success: true, preferences: callback(request) });
        } catch (error) {
            response.status(error.status || 500).json({ success: false, error: error.status ? error.message : '無法處理考勤摘要排序。' });
        }
    };
    const view = requirePermission('admin.reports.view');
    server.get(path, requireSession, view, respond(request => preferences(request.browserSession)));
    server.post(path, requireSession, view, respond(request => {
        const session = request.browserSession;
        if (!canEdit(session)) fail(403, '身份模擬不能儲存考勤摘要排序。');
        const body = request.body;
        if (!body || Array.isArray(body) || typeof body !== 'object' ||
            Object.keys(body).some(key => !['order', 'revision'].includes(key)) ||
            !Array.isArray(body.order) || body.order.length > DEFAULT_ORDER.length || body.order.some(key => !KEYS.has(key)) ||
            typeof body.revision !== 'string') fail(400, '考勤摘要排序格式不正確。');
        return db.getSupervisors().transaction(() => {
            const before = preferences(session);
            if (before.revision !== body.revision) fail(409, '考勤摘要排序已變更，請重新讀取後再調整。');
            const employeeId = session.realEmployeeId || session.employeeId;
            const order = normalizeOrder(body.order);
            if (order.every((key, index) => key === before.order[index])) return before;
            db.saveWorkspaceNavOrderRecord({ role: 'admin', nav_type: NAV_TYPE, scope: 'personal', employee_id: employeeId, order, updated_by: employeeId });
            db.addAuditLog(auditEntry(request, {
                action: 'save', target_type: 'report_summary_order', target_id: employeeId,
                summary: '儲存個人考勤報表摘要卡片排序', before_data: { order: before.order }, after_data: { order }
            }));
            return preferences(session);
        });
    }));
}

module.exports = { attachReportSummaryOrderRoutes };
