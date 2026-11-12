'use strict';

const SETTINGS_PERMISSION = 'admin.overtime.conditionalSettings';
function attachConditionalOvertimeRoutes(server, { db, requireSession, hasPermission, auditEntry, formatRecord, parseDateTime, validateBoundDevice, notify }) {
    const base = '/api/browser/supervisors/conditional-overtime';
    const store = () => db.getConditionalOvertimeReview();
    const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
    const manage = session => session.role === 'system_admin' || session.role === 'admin' && hasPermission(session, SETTINGS_PERMISSION);
    const adminView = session => manage(session) || session.role === 'admin' && hasPermission(session, 'admin.overtime.view');
    const ensureWrite = request => { if (request.browserSession.impersonation?.active) fail('身份模擬不能儲存或審核條件複核。', 403); };
    const employees = () => db.loadEmployees().map(({ id, name, department }) => ({ id, name, department }));
    const reviewers = ids => { const names = new Map(employees().map(row => [row.id, row.name])); return (ids || []).map(id => ({ id, name: names.get(id) || '已移除員工' })); };
    const readable = (row, session) => {
        if (adminView(session)) return true;
        if (session.role !== 'employee') return false;
        const actor = session.employeeId;
        const cutoff = db.getRequestHistory().window('overtime').startAt;
        const ownVisible = (row.employee_id === actor || row.applicant_id === actor) && (cutoff == null || row.end_at > cutoff);
        return ownVisible || db.getSupervisors().isAssigned(actor, row.employee_id) ||
            db.getReviewWorkflow().state('overtime', row.id)?.reviewers.some(r => r.id === actor && !r.revoked) ||
            (store().detail(row.id)?.eligibleReviewerIds || []).includes(actor);
    };
    const rowFor = request => {
        const row = db.getOvertimeRequestById(request.params.id);
        if (!row || !store().detail(row.id) || !readable(row, request.browserSession)) fail('找不到可查閱的加班複核紀錄。', 404);
        return row;
    };
    const formatted = (row, session) => {
        const record = formatRecord(row), extra = store().detail(row.id);
        return { ...record, additionalReview: extra ? { ...extra, reviewers: reviewers(extra.reviewerIds),
            canReview: session.role === 'employee' && !session.impersonation?.active && store().canReview(row, session.employeeId), canReassign: manage(session) && !session.impersonation?.active } : null };
    };
    const handle = fn => (request, response) => {
        try { response.json({ success: true, ...fn(request) }); }
        catch (error) { response.status(error.status || error.statusCode || 500).json({ success: false, error: error.status || error.statusCode ? error.message : '條件複核處理失敗，請重新整理後再試。' }); }
    };
    const settingsResult = session => ({ settings: store().state(), employees: employees(), leaveTypes: db.loadLeaveTypes().map(({ id, name, enabled }) => ({ id, name, enabled })), canEdit: manage(session) && !session.impersonation?.active });
    server.get(base + '/settings', requireSession, handle(request => {
        if (!manage(request.browserSession)) fail('沒有條件複核設定權限。', 403);
        return settingsResult(request.browserSession);
    }));
    server.post(base + '/settings', requireSession, handle(request => {
        if (!manage(request.browserSession)) fail('沒有條件複核設定權限。', 403);
        ensureWrite(request);
        db.getSupervisors().transaction(() => {
            store().save(request.body || {}, entry => auditEntry(request, entry));
        });
        notify(request);
        return { ...settingsResult(request.browserSession), message: '條件複核設定已儲存。' };
    }));
    server.post(base + '/preview', requireSession, handle(request => {
        const session = request.browserSession, body = request.body || {}, ids = body.employeeIds;
        if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) fail('請選擇 1 至 100 位不重複的申請員工。');
        const available = new Set(employees().map(e => e.id));
        if (ids.some(id => !available.has(id))) fail('申請員工已不存在。', 409);
        const paper = session.role === 'admin' && hasPermission(session, 'admin.overtime.paperCreate');
        if (!paper && (session.role !== 'employee' || ids.some(id => id !== session.employeeId && !db.getSupervisors().isAssigned(session.employeeId, id)))) fail('只能預覽本人或目前授權代辦員工。', 403);
        const startAt = parseDateTime(body.startDate, body.startTime, ''), endAt = parseDateTime(body.endDate, body.endTime, '');
        if (endAt <= startAt || endAt - startAt > 370 * 86400000) fail('請核對加班起訖，區間最多 370 日。');
        return { previews: ids.map(employeeId => { const value = store().preview({ employeeId, startAt, endAt, applicantId: session.employeeId }); return { ...value, employeeId, reviewers: reviewers(value.reviewerIds) }; }) };
    }));
    server.get(base + '/inbox', requireSession, handle(request => {
        const session = request.browserSession;
        if (session.role !== 'employee' && !adminView(session)) fail('沒有條件複核查閱權限。', 403);
        const filters = session.role === 'employee' ? { additionalReviewerId: session.employeeId } : {};
        return { records: db.queryOvertimeRequests({ ...filters, status: 'pending_additional', limit: null }).map(row => formatted(row, session)) };
    }));
    server.get(base + '/:id/history', requireSession, handle(request => {
        const row = rowFor(request);
        const record = formatted(row, request.browserSession);
        return { record, additionalReview: record.additionalReview, history: store().history(row.id),
            canReview: Boolean(record.additionalReview?.canReview), canReassign: Boolean(record.additionalReview?.canReassign),
            ...(manage(request.browserSession) ? { employees: employees() } : {}) };
    }));
    server.post(base + '/:id/decision', requireSession, handle(request => {
        const session = request.browserSession;
        ensureWrite(request);
        if (session.role !== 'employee' || !['card', 'web_password'].includes(session.authMethod) || session.realEmployeeId && session.realEmployeeId !== session.employeeId) fail('請以複核人本人的員工工作台登入。', 403);
        validateBoundDevice(session);
        const body = request.body || {};
        if (body.confirm !== true || typeof body.comment !== 'string' || !body.comment.trim() || body.comment.trim().length > 500) fail('請填寫複核意見（最多 500 字）並確認。');
        store().decide({ ...body, requestId: request.params.id }, session.employeeId, entry => auditEntry(request, entry));
        notify(request);
        return { record: formatted(db.getOvertimeRequestById(request.params.id), session), message: '額外複核結果已儲存。' };
    }));
    server.post(base + '/:id/reassign', requireSession, handle(request => {
        if (!manage(request.browserSession)) fail('沒有條件複核設定權限。', 403);
        ensureWrite(request);
        store().reassign({ ...(request.body || {}), requestId: request.params.id }, request.browserSession.employeeId, entry => auditEntry(request, entry));
        notify(request);
        return { record: formatted(db.getOvertimeRequestById(request.params.id), request.browserSession), message: '複核人已改派，原紀錄保留。' };
    }));
}
module.exports = { SETTINGS_PERMISSION, attachConditionalOvertimeRoutes };
