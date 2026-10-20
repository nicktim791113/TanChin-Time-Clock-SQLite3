const { requirePersonalSupervisor } = require('./supervisor-management');
function attachLeaveEntitlementRoutes(server, { db, requireSession, requirePermission, hasPermission, auditEntry, notify, validateBoundDevice }) {
    const store = () => db.getLeaveEntitlements();
    const permit = (permission, write = false) => (request, response, next) => {
        if (request.browserSession.impersonation?.active && write) return response.status(403).json({ success: false, error: '身份模擬不能修改假別額度。' });
        if (request.browserSession.role === 'system_admin') return next();
        if (!write && request.browserSession.role === 'admin' && hasPermission(request.browserSession, 'admin.leave.balances.manage')) return next();
        return requirePermission(permission)(request, response, next);
    };
    const handle = (callback) => (request, response) => {
        try { callback(request, response); } catch (error) {
            response.status(error.statusCode || error.status || 500).json({ success: false, error: error.statusCode || error.status ? error.message : '額度處理失敗，沒有儲存任何異動。' });
        }
    };
    const read = permit('admin.leave.balances.view'), write = permit('admin.leave.balances.manage', true);
    server.get('/api/browser/leave-entitlements', requireSession, read, handle((request, response) => {
        response.json({ success: true, entitlements: store().state(request.query.year) });
    }));
    server.post('/api/browser/leave-entitlements/preview', requireSession, write, handle((request, response) => {
        response.json({ success: true, preview: store().preview(request.body || {}) });
    }));
    server.post('/api/browser/leave-entitlements/save', requireSession, write, handle((request, response) => {
        const result = store().save(request.body || {}, (entry) => auditEntry(request, entry)); notify(request);
        response.json({ success: true, ...result, message: `已儲存 ${result.updatedCount} 筆假別額度。` });
    }));
    server.post('/api/browser/leave-entitlements/settings', requireSession, write, handle((request, response) => {
        store().saveSettings(request.body || {}, (entry) => auditEntry(request, entry)); notify(request);
        response.json({ success: true, message: '額度制度已儲存；既有年度換算工時保持不變。' });
    }));
    server.post('/api/browser/leave-entitlements/allocate', requireSession, write, handle((request, response) => {
        store().allocateLegacy(request.body || {}, (entry) => auditEntry(request, entry)); notify(request);
        response.json({ success: true, message: '扣抵分配已儲存，原請假單資料未改寫。' });
    }));
    server.get('/api/browser/leave-entitlements/export', requireSession, read, handle((request, response) => {
        const buffer = store().workbook(request.query.year, request.query.leaveTypeId);
        response.set('Cache-Control', 'no-store');
        response.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        response.set('Content-Disposition', `attachment; filename="leave-entitlements-${Number(request.query.year)}.xlsx"`);
        response.send(buffer);
    }));
    server.post('/api/browser/leave-entitlements/import-preview', requireSession, write, handle((request, response) => {
        const content = request.body?.content;
        if (typeof content !== 'string' || content.length > 7 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(content)) throw Object.assign(new Error('Excel 檔案格式不正確或超過 5 MB。'), { statusCode: 400 });
        response.json({ success: true, ...store().readWorkbook(Buffer.from(content, 'base64')) });
    }));
    server.get('/api/browser/employee/leave/balances', requireSession, handle((request, response) => {
        const session = request.browserSession;
        if (session.role !== 'employee') return response.status(403).json({ success: false, error: '請從員工工作台查詢。' });
        const requested = String(request.query.employeeId || session.employeeId);
        if (requested !== session.employeeId) {
            requirePersonalSupervisor(session);
            validateBoundDevice(session);
            if (!db.getSupervisors().isAssigned(session.employeeId, requested)) return response.status(403).json({ success: false, error: '沒有該員工的代辦授權。' });
        }
        const balances = store().balances([requested], request.query.year).map(({ records, updated_by, revision, ...row }) => row);
        response.json({ success: true, balances, employeeId: requested, year: Number(request.query.year) });
    }));
}
module.exports = { attachLeaveEntitlementRoutes };
