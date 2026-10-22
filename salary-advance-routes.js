'use strict';

const XLSX = require('xlsx');
const SALARY_ADVANCE_PERMISSIONS = Object.freeze({ view: 'admin.salary_advances.view', review: 'admin.salary_advances.review', settings: 'admin.salary_advances.settings', export: 'admin.salary_advances.export' });
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const statusLabels = { pending_admin: '待管理部審核', approved: '已核准（未表示發放）', rejected: '已退回', withdrawn: '員工已撤回', cancelled: '管理部已取消' };
function requestBody(request) {
    if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) fail('請提供有效的申請資料。');
    return request.body;
}
function createSalaryAdvanceWorkbook(rows, applicationMonth) {
    const book = XLSX.utils.book_new();
    const headers = ['申請單號', '登記月份', '扣回月份（待確認時留白）', '工號', '姓名', '部門', '狀態', '申請金額（TWD）', '核准金額（TWD）', '送出時間', '審核時間', '審核人', '申請備註', '審核說明', '撤回／取消原因', '修訂版號'];
    const details = rows.map((r) => [r.requestId, r.applicationMonth, r.deductionMonth || '', r.employeeId, r.employeeName, r.department,
        statusLabels[r.status] || r.status, r.requestedAmount, r.approvedAmount ?? '', r.submittedAt, r.reviewedAt || '', r.reviewerId || '', r.note, r.reviewNote,
        r.cancellationReason || r.withdrawalReason || '', r.revision]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...details]);
    ws['!cols'] = headers.map((_, index) => ({ wch: index === 0 ? 38 : [12, 13, 14].includes(index) ? 36 : 20 }));
    ws['!autofilter'] = { ref: `A1:P${details.length + 1}` };
    XLSX.utils.book_append_sheet(book, ws, '借支申請明細');
    const current = rows.filter((r) => ['pending_admin', 'approved'].includes(r.status));
    const summary = [['借支申請總表', applicationMonth || '全部月份'], ['資料性質', '僅申請與審核資料；不表示已發放、已還款或已扣薪。'],
        ['總筆數', rows.length], ['有效申請金額', current.reduce((sum, r) => sum + r.requestedAmount, 0)],
        ['核准金額', rows.filter((r) => r.status === 'approved').reduce((sum, r) => sum + r.approvedAmount, 0)],
        ...Object.entries(statusLabels).map(([status, label]) => [label, rows.filter((r) => r.status === status).length])];
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(summary), '總表');
    return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
}

function attachSalaryAdvanceRoutes(server, { db, requireSession, hasPermission, auditEntry, notify = () => {}, validateBoundDevice, requireExternalApiAccess }) {
    const store = () => db.getSalaryAdvances();
    const permissions = (session) => {
        const simulated = Boolean(session.impersonation?.active);
        const can = (code) => !simulated && (session.role === 'system_admin' || (session.role === 'admin' && hasPermission(session, code)));
        const result = Object.fromEntries(Object.entries(SALARY_ADVANCE_PERMISSIONS).map(([key, code]) => [key, can(code)]));
        result.view = result.view || result.review || result.settings || result.export;
        return result;
    };
    const handle = (callback) => async (request, response) => {
        response.set('Cache-Control', 'no-store');
        try { await callback(request, response); } catch (error) {
            const status = error.statusCode || 500;
            response.status(status).json({ success: false, error: status < 500 ? error.message : '借支作業未完成，請重新整理後再試；若持續發生請聯絡管理部。' });
        }
    };
    const permit = (key) => (request, response, next) => {
        if (!permissions(request.browserSession)[key]) return response.status(403).json({ success: false, error: '未獲授權使用此借支管理功能。' });
        next();
    };
    const own = (request, response, next) => {
        const session = request.browserSession;
        try {
            if (session.role !== 'employee' || !session.employeeId || session.impersonation?.active || (session.realEmployeeId && session.realEmployeeId !== session.employeeId)) fail('請以員工本人帳號使用借支申請；此功能不開放代辦或身份模擬。', 403);
            if (request.query.employeeId !== undefined && request.query.employeeId !== session.employeeId) fail('只能查看本人的借支申請。', 403);
            if (request.query.employeeIds !== undefined || (request.body?.employeeId !== undefined && request.body.employeeId !== session.employeeId)) fail('借支申請不能指定其他員工。', 403);
            if (typeof validateBoundDevice !== 'function') fail('裝置驗證尚未完成設定。', 500);
            validateBoundDevice(session);
            next();
        } catch (error) {
            response.status(error.statusCode || 500).json({ success: false, error: error.statusCode ? error.message : '無法驗證目前登入狀態。' });
        }
    };
    const filters = (request) => ({ applicationMonth: request.query.applicationMonth, employeeId: request.query.employeeId, status: request.query.status });
    const actor = (request) => String(request.browserSession.realEmployeeId || request.browserSession.employeeId);
    const root = '/api/browser/salary-advances', employeeRoot = '/api/browser/employee/salary-advances';
    server.get(root, requireSession, permit('view'), handle((req, res) => res.json({ success: true, ...store().state(filters(req)), permissions: permissions(req.browserSession) })));
    server.get(employeeRoot, requireSession, own, handle((req, res) => res.json({ success: true, ...store().employeeState(req.browserSession.employeeId, { applicationMonth: req.query.applicationMonth }), permissions: { own: true } })));
    server.post(`${employeeRoot}/submit`, requireSession, own, handle((req, res) => {
        const result = store().submit(req.browserSession.employeeId, requestBody(req), (entry) => auditEntry(req, entry));
        if (!result.replayed) notify(req, 'salaryAdvances');
        res.json({ success: true, ...result, message: result.replayed ? '此申請已送出，未重複建立。' : '已送交管理部審核；核准不表示款項已發放。' });
    }));
    server.post(`${employeeRoot}/withdraw`, requireSession, own, handle((req, res) => {
        const result = store().withdraw(req.browserSession.employeeId, requestBody(req), (entry) => auditEntry(req, entry));
        notify(req, 'salaryAdvances'); res.json({ success: true, request: result, message: '借支申請已撤回。' });
    }));
    server.post(`${root}/settings`, requireSession, permit('settings'), handle((req, res) => {
        const result = store().saveSettings(requestBody(req), (entry) => auditEntry(req, entry));
        notify(req, 'salaryAdvances'); res.json({ success: true, settings: result, message: '借支活動設定已儲存；既有申請保留送件時的規則快照。' });
    }));
    for (const action of ['review', 'cancel']) server.post(`${root}/${action}`, requireSession, permit('review'), handle((req, res) => {
        const result = store()[action](requestBody(req), (entry) => auditEntry(req, entry), actor(req));
        notify(req, 'salaryAdvances'); res.json({ success: true, request: result, message: action === 'cancel' ? '申請已取消；若 ERP 已處理，請依差異紀錄核對。' : '管理部審核已儲存；此動作不會發放款項或扣薪。' });
    }));
    server.get(`${root}/export`, requireSession, permit('export'), handle((req, res) => {
        const rows = store().list(filters(req));
        const buffer = createSalaryAdvanceWorkbook(rows, req.query.applicationMonth);
        const filename = `salary-advances-${req.query.applicationMonth || 'all'}.xlsx`;
        db.addAuditLog(auditEntry(req, { action: 'salary_advance_exported', target_type: 'salary_advance', target_id: req.query.applicationMonth || 'all', summary: `匯出 ${rows.length} 筆借支申請明細及總表。` }));
        res.set('Content-Disposition', `attachment; filename="${filename}"`).type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(buffer);
    }));
    if (typeof requireExternalApiAccess !== 'function') throw new Error('Salary advance external API requires explicit key middleware.');
    server.get('/api/salary-advance-requests', requireExternalApiAccess, handle((req, res) => {
        if (!Array.isArray(req.externalApiKey?.permissions) || !req.externalApiKey.permissions.includes('salary_advances')) fail('這組 API Key 未開放借支申請讀取權限。', 403);
        res.json({ success: true, ...store().external(req.query) });
    }));
    return { permissions };
}

module.exports = { attachSalaryAdvanceRoutes, SALARY_ADVANCE_PERMISSIONS, createSalaryAdvanceWorkbook };
