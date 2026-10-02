const crypto = require('node:crypto');
const { monthRange, buildCalendar } = require('./request-calendar');
const { proxyReason, requirePersonalSupervisor } = require('./supervisor-management');

function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function requestPeriod(body, kind) {
    const parse = (date, time) => {
        if (typeof date !== 'string' || !monthRange(date.slice(0, 7)).dates.includes(date) ||
            typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) fail('請輸入有效日期與時間。');
        return Date.parse(`${date}T${time}:00+08:00`);
    };
    const start = parse(body.startDate, body.startTime || (kind === 'leave' ? '09:00' : '18:00'));
    const end = parse(body.endDate, body.endTime || (kind === 'leave' ? '18:00' : '20:00'));
    if (end <= start) fail('結束時間必須晚於開始時間。');
    const hours = body.durationHours == null || body.durationHours === '' ? (end - start) / 3600000 : Number(body.durationHours);
    if (!Number.isFinite(hours) || Math.round(hours * 100) <= 0) fail('請輸入有效時數。');
    return { start_at: start, end_at: end, duration_hours: Math.round(hours * 100) / 100 };
}
function attachSupervisorRoutes(server, context) {
    const { db, requireSession, requireRole, requirePermission, auditEntry, notify, buildLookup, formatRecord } = context;
    const store = () => db.getSupervisors();
    const handle = (callback) => (request, response) => {
        try { callback(request, response); }
        catch (error) {
            console.error('[主管代辦]', error.message);
            response.status(error.status || error.statusCode || 500).json({ success: false,
                error: error.status || error.statusCode ? error.message : '主管代辦處理失敗，未儲存異動。' });
        }
    };
    const requireManage = (request, response, next) => {
        if (request.browserSession.impersonation?.active) return response.status(403).json({ success: false, error: '身份模擬不能修改主管授權。' });
        if (request.browserSession.role === 'system_admin') return next();
        return requirePermission('admin.supervisors.manage')(request, response, next);
    };
    server.get('/api/browser/supervisors/assignments', requireSession, requireManage, handle((request, response) => {
        response.json({ success: true, assignments: store().assignmentsState() });
    }));
    server.post('/api/browser/supervisors/assignments', requireSession, requireManage, handle((request, response) => {
        store().saveAssignments(request.body || {}, (entry) => auditEntry(request, entry));
        notify(request, 'supervisorAssignments');
        response.json({ success: true, message: '指定代辦主管已儲存。', assignments: store().assignmentsState() });
    }));
    function targetFor(request, employeeId) {
        requirePersonalSupervisor(request.browserSession);
        const target = store().assignedEmployees(request.browserSession.employeeId).find((e) => e.id === employeeId);
        if (!target) fail('只能代辦目前明確指定給自己的員工，主管授權可能已變更。', 403);
        return target;
    }
    server.get('/api/browser/employee/supervisor', requireSession, requireRole('employee'), handle((request, response) => {
        requirePersonalSupervisor(request.browserSession);
        const range = monthRange(request.query.month);
        const employees = store().assignedEmployees(request.browserSession.employeeId);
        const employeeId = request.query.employeeId || employees[0]?.id;
        if (!employeeId) return response.json({ success: true, proxy: { employees, calendar: null, meals: null, leaveTypes: [] } });
        targetFor(request, employeeId);
        const kind = request.query.kind || 'leave';
        if (!['leave', 'overtime'].includes(kind)) fail('無效的代辦項目。');
        if (request.query.date && !range.dates.includes(request.query.date)) fail('日期必須位於選取月份。');
        const page = request.query.page == null ? 1 : Number(request.query.page);
        if (!Number.isSafeInteger(page) || page < 1) fail('無效頁碼。');
        const rows = (kind === 'leave' ? db.queryLeaveRequests : db.queryOvertimeRequests)({ employeeId,
            overlapStartAt: range.start, overlapEndAt: range.end - 1, limit: null });
        const calendar = buildCalendar(range.month, rows);
        const start = request.query.date ? Date.parse(`${request.query.date}T00:00:00+08:00`) : null;
        const details = start == null ? rows : rows.filter((row) => row.start_at < start + 86400000 && row.end_at > start);
        const totalPages = Math.max(1, Math.ceil(details.length / 50));
        const current = Math.min(page, totalPages);
        const lookup = buildLookup(kind);
        calendar.detail = { page: current, totalPages, totalCount: details.length, records: details.slice((current - 1) * 50, current * 50).map((row) => ({
            ...formatRecord(kind, row, lookup), canProxyWithdraw: kind === 'leave' && ['pending_supervisor', 'pending_admin'].includes(row.status)
        })) };
        response.json({ success: true, proxy: { employees, employeeId, kind, calendar,
            leaveTypes: db.loadLeaveTypes().filter((type) => type.enabled).map(({ id, name }) => ({ id, name })),
            meals: db.getMeals().calendar({ month: range.month, employeeId }) } });
    }));
    for (const kind of ['leave', 'overtime']) {
        server.post(`/api/browser/employee/supervisor/${kind}`, requireSession, requireRole('employee'), handle((request, response) => {
            const body = request.body || {};
            const target = targetFor(request, body.employeeId);
            const reason = proxyReason(body.proxyReason);
            if (body.confirmApproval !== true) fail('請確認主管代申請並核准。');
            const period = requestPeriod(body, kind);
            const type = kind === 'leave' ? db.loadLeaveTypes().find((row) => row.id === body.leaveTypeId && row.enabled) : null;
            if (kind === 'leave' && !type) fail('請選擇有效假別。');
            const now = Date.now();
            const actorId = request.browserSession.employeeId;
            const record = { id: `${kind}_${now}_${crypto.randomBytes(4).toString('hex')}`, employee_id: target.id,
                applicant_id: actorId, applicant_role: 'supervisor_proxy', proxy_reason: reason, ...period,
                reason: typeof body.reason === 'string' ? body.reason.trim().slice(0, 2000) : '',
                status: kind === 'leave' ? 'pending_admin' : 'approved', supervisor_id: actorId,
                supervisor_decision: 'approved', supervisor_comment: `指定主管代申請並核准：${reason}`, supervisor_decided_at: now,
                approval_mode: kind === 'leave' ? 'supervisor_proxy' : 'supervisor_proxy_auto_approved', created_at: now, updated_at: now,
                ...(type ? { leave_type_id: type.id } : {}) };
            store().transaction(() => {
                targetFor(request, target.id);
                const overlap = kind === 'leave' ? db.hasOverlappingLeaveRequest : db.hasOverlappingOvertimeRequest;
                if (overlap(target.id, period.start_at, period.end_at)) fail('這段時間已有待審或已核准的申請。', 409);
                (kind === 'leave' ? db.createLeaveRequest : db.createOvertimeRequest)(record);
                db.addAuditLog(auditEntry(request, { action: 'supervisor_proxy_create', target_type: `${kind}_request`, target_id: record.id,
                    summary: `指定主管代 ${target.id} ${target.name} 申請${kind === 'leave' ? '請假，送管理部終審' : '加班並核准'}：${reason}`, after_data: record }));
            });
            notify(request, kind === 'leave' ? 'leaveRequests' : 'overtimeRequests');
            response.json({ success: true, requestId: record.id, message: kind === 'leave' ? '代辦請假已送管理部終審。' : '代辦加班已建立並核准。' });
        }));
    }
    server.post('/api/browser/employee/supervisor/leave/withdraw', requireSession, requireRole('employee'), handle((request, response) => {
        const body = request.body || {};
        requirePersonalSupervisor(request.browserSession);
        const reason = proxyReason(body.reason);
        store().transaction(() => {
            const row = db.getLeaveRequestById(body.requestId);
            if (!row) fail('找不到請假申請。', 404);
            targetFor(request, row.employee_id);
            if (!['pending_supervisor', 'pending_admin'].includes(row.status)) fail('只有尚未終審的請假可以代撤回，已核准案件請聯絡管理部。', 409);
            if (body.updatedAt !== row.updated_at) fail('請假資料已變更，請重新整理。', 409);
            db.withdrawLeaveRequest({ requestId: row.id, withdrawnAt: Date.now() });
            db.addAuditLog(auditEntry(request, { action: 'supervisor_proxy_withdraw', target_type: 'leave_request', target_id: row.id,
                summary: `指定主管代撤回請假：${reason}`, before_data: row, after_data: { ...db.getLeaveRequestById(row.id), withdrawal_reason: reason } }));
        });
        notify(request, 'leaveRequests');
        response.json({ success: true, message: '請假已代撤回。' });
    }));
    server.post('/api/browser/employee/supervisor/meals/choice', requireSession, requireRole('employee'), handle((request, response) => {
        const body = request.body || {};
        targetFor(request, body.employeeId);
        const reason = proxyReason(body.reason);
        db.getMeals().saveChoice({ ...body, reason }, { manager: false, actorId: request.browserSession.employeeId,
            label: '指定主管代登午餐', audit: (entry) => auditEntry(request, entry) });
        notify(request, 'meals');
        response.json({ success: true, message: '午餐代登已儲存。' });
    }));
}
module.exports = { attachSupervisorRoutes, requestPeriod };
