const crypto = require('node:crypto');
const { monthRange, buildCalendar } = require('./request-calendar');
const { proxyReason, requirePersonalSupervisor, isSupervisorSimulation } = require('./supervisor-management');
const { normalizeLeaveDateSelection, leaveOverlapsRange, getLeaveDateSegments } = require('./leave-date-selection');

function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function requestPeriod(body, kind) {
    if (kind === 'leave' && body.dateSelectionMode === 'explicit_segments') {
        const period = normalizeLeaveDateSelection({ date_selection_mode: 'explicit_segments', leave_segments: body.leaveSegments });
        for (const segment of period.leave_segments) {
            if (!Object.hasOwn(segment, 'breakMinutes')) fail('每段請假須填寫休息分鐘。');
            const minutes = (segment.endAt - segment.startAt) / 60000;
            if (!Number.isInteger(minutes) || segment.startAt % 60000 || segment.endAt % 60000 ||
                segment.hours !== Math.floor((minutes - segment.breakMinutes) * 100 / 60) / 100) fail('請假時數須依起訖時間扣除休息分鐘自動計算。');
        }
        return period;
    }
    const parse = (date, time) => {
        if (typeof date !== 'string' || !monthRange(date.slice(0, 7)).dates.includes(date) ||
            typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) fail('請輸入有效日期與時間。');
        return Date.parse(`${date}T${time}:00+08:00`);
    };
    const start = parse(body.startDate, body.startTime || (kind === 'leave' ? '08:20' : '17:30'));
    const end = parse(body.endDate, body.endTime || (kind === 'leave' ? '17:00' : '19:30'));
    if (end <= start) fail('結束時間必須晚於開始時間。');
    if (kind === 'leave' && body.dateSelectionMode === 'explicit_dates') {
        return { start_at: start, end_at: end, ...normalizeLeaveDateSelection({ start_at: start, end_at: end,
            date_selection_mode: body.dateSelectionMode, daily_hours: body.dailyHours }) };
    }
    if (kind === 'leave' && body.dateSelectionMode != null && body.dateSelectionMode !== 'legacy_range') fail('請假日期選取模式不正確。');
    const hours = kind === 'overtime' ? Math.floor((end - start) / 60000 * 100 / 60) / 100 :
        body.durationHours == null || body.durationHours === '' ? (end - start) / 3600000 : Number(body.durationHours);
    if (!Number.isFinite(hours) || Math.round(hours * 100) <= 0) fail('請輸入有效時數。');
    return { start_at: start, end_at: end, duration_hours: Math.round(hours * 100) / 100 };
}
function attachSupervisorRoutes(server, context) {
    const { db, requireSession, requireRole, requirePermission, auditEntry, notify, buildLookup, formatRecord, validateBoundDevice } = context;
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
        const assignments = store().assignmentsState();
        assignments.reviewOnly = db.getReviewSupervisors().rows().filter((row) => row.supervisor_id &&
            assignments.employees.some((e) => e.id === row.employee_id && !e.supervisorIds.includes(row.supervisor_id)))
            .map(({ employee_id, supervisor_id }) => ({ employeeId: employee_id, supervisorId: supervisor_id }));
        response.json({ success: true, assignments });
    }));
    server.post('/api/browser/supervisors/assignments', requireSession, requireManage, handle((request, response) => {
        store().saveAssignments(request.body || {}, (entry) => auditEntry(request, entry));
        notify(request, 'supervisorAssignments');
        response.json({ success: true, message: '指定代辦主管已儲存。', assignments: store().assignmentsState() });
    }));
    server.post('/api/browser/supervisors/assignments/batch', requireSession, requireManage, handle((request, response) => {
        const result = store().saveAssignmentsBatch(request.body || {}, (entry) => auditEntry(request, entry));
        notify(request, 'supervisorAssignments');
        response.json({ success: true, ...result, message: `${result.updatedCount} 位員工的指定代辦主管已批量儲存。`, assignments: store().assignmentsState() });
    }));
    function requireSupervisor(request, readOnly = false) {
        if (!(readOnly && isSupervisorSimulation(request.browserSession))) {
            requirePersonalSupervisor(request.browserSession);
            validateBoundDevice(request.browserSession);
        }
        if (!readOnly && !store().assignedEmployees(request.browserSession.employeeId).length) fail('目前沒有指定代辦員工。', 403);
    }
    function targetFor(request, employeeId, readOnly = false) {
        requireSupervisor(request, readOnly);
        const target = store().assignedEmployees(request.browserSession.employeeId).find((e) => e.id === employeeId);
        if (!target) fail('只能代辦目前明確指定給自己的員工，主管授權可能已變更。', 403);
        return target;
    }
    function targetsFor(request, body, readOnly = false) {
        const ids = body.employeeIds === undefined ? [body.employeeId] : body.employeeIds;
        if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some((id) => typeof id !== 'string' || !id)) fail('請選擇 1 至 100 位代辦員工。');
        if (new Set(ids).size !== ids.length) fail('代辦員工不可重複。');
        return ids.map((id) => targetFor(request, id, readOnly));
    }
    server.post('/api/browser/employee/supervisor/reason-presets', requireSession, requireRole('employee'), handle((request, response) => {
        requireSupervisor(request);
        const reasonPresets = store().saveReasonPresets(request.browserSession.employeeId, request.body || {}, (entry) => auditEntry(request, entry));
        response.json({ success: true, reasonPresets: { ...reasonPresets, canEdit: true } });
    }));
    server.get('/api/browser/employee/supervisor', requireSession, requireRole('employee'), handle((request, response) => {
        requireSupervisor(request, true);
        const canWrite = !isSupervisorSimulation(request.browserSession);
        const range = monthRange(request.query.month);
        const employees = store().assignedEmployees(request.browserSession.employeeId);
        const employeeId = request.query.employeeId || employees[0]?.id;
        if (!employeeId) return response.json({ success: true, proxy: { employees, calendar: null, meals: null, leaveTypes: [] } });
        targetFor(request, employeeId, true);
        const kind = request.query.kind || 'leave';
        if (!['leave', 'overtime'].includes(kind)) fail('無效的代辦項目。');
        if (request.query.date && !range.dates.includes(request.query.date)) fail('日期必須位於選取月份。');
        const page = request.query.page == null ? 1 : Number(request.query.page);
        if (!Number.isSafeInteger(page) || page < 1) fail('無效頁碼。');
        const rows = (kind === 'leave' ? db.queryLeaveRequests : db.queryOvertimeRequests)({ employeeId,
            overlapStartAt: range.start, overlapEndAt: range.end - 1, limit: null }).filter((row) => leaveOverlapsRange(row, range.start, range.end));
        const calendar = buildCalendar(range.month, rows);
        const start = request.query.date ? Date.parse(`${request.query.date}T00:00:00+08:00`) : null;
        const details = start == null ? rows : rows.filter((row) => leaveOverlapsRange(row, start, start + 86400000));
        const totalPages = Math.max(1, Math.ceil(details.length / 50));
        const current = Math.min(page, totalPages);
        const lookup = buildLookup(kind);
        calendar.detail = { page: current, totalPages, totalCount: details.length, records: details.slice((current - 1) * 50, current * 50).map((row) => ({
            ...formatRecord(kind, row, lookup), canProxyWithdraw: kind === 'leave' && ['pending_supervisor', 'pending_admin'].includes(row.status)
        })) };
        const mealDate = request.query.date || range.dates[0];
        const mealDay = db.getMeals().dayState(mealDate);
        response.json({ success: true, proxy: { employees, employeeId, kind, calendar, canWrite,
            reasonPresets: { ...store().reasonPresets(request.browserSession.employeeId), canEdit: canWrite },
            batchMeal: { date: mealDate, version: mealDay.version, employees: employees.map((employee) => {
                const row = mealDay.rows.find((item) => item.employee_id === employee.id);
                return { id: employee.id, eligible: Boolean(row?.eligible), canChange: Boolean(row?.canChange), eating: Boolean(row?.eating) };
            }) },
            leaveTypes: db.loadLeaveTypes().filter((type) => type.enabled).map(({ id, name }) => ({ id, name })),
            leaveBalances: db.getLeaveEntitlements().balances([employeeId], Number(range.month.slice(0, 4))).map(({ records, updated_by, revision, ...row }) => row),
            meals: db.getMeals().calendar({ month: range.month, employeeId }) } });
    }));
    server.post('/api/browser/employee/supervisor/leave/meal-options', requireSession, requireRole('employee'), handle((request, response) => {
        const targets = targetsFor(request, request.body || {}, true);
        const period = requestPeriod(request.body || {}, 'leave');
        response.json({ success: true, options: db.getMeals().getLeaveMealOptions(targets.map((row) => row.id), getLeaveDateSegments(period)) });
    }));
    for (const kind of ['leave', 'overtime']) {
        server.post(`/api/browser/employee/supervisor/${kind}`, requireSession, requireRole('employee'), handle((request, response) => {
            const body = request.body || {};
            const targets = targetsFor(request, body);
            const reason = proxyReason(body.proxyReason);
            if (kind === 'leave' && (typeof body.reason !== 'string' || !body.reason.trim())) fail('請填寫請假事由。');
            if (body.confirmApproval !== true) fail('請確認主管代申請並核准。');
            const period = requestPeriod(body, kind);
            const type = kind === 'leave' ? db.loadLeaveTypes().find((row) => row.id === body.leaveTypeId && row.enabled) : null;
            if (kind === 'leave' && !type) fail('請選擇有效假別。');
            const now = Date.now();
            const actorId = request.browserSession.employeeId;
            const batchId = crypto.randomUUID();
            const records = targets.map((target) => ({ id: `${kind}_${now}_${crypto.randomBytes(8).toString('hex')}`, employee_id: target.id,
                applicant_id: actorId, applicant_role: 'supervisor_proxy', proxy_reason: reason, ...period,
                reason: typeof body.reason === 'string' ? body.reason.trim().slice(0, 2000) : '',
                status: kind === 'leave' ? 'pending_admin' : 'approved', supervisor_id: actorId,
                supervisor_decision: 'approved', supervisor_comment: `指定主管代申請並核准：${reason}`, supervisor_decided_at: now,
                approval_mode: kind === 'leave' ? 'supervisor_proxy' : 'supervisor_proxy_auto_approved', created_at: now, updated_at: now,
                ...(type ? { leave_type_id: type.id, daily_hours: period.daily_hours ?? body.dailyHours,
                    explicit_duration_hours: period.date_selection_mode === 'explicit_dates' ? period.duration_hours : body.durationHours || '' } : {}) }));
            records.forEach((record) => {
                const policy = db.getReviewSupervisors().policy(record.employee_id);
                if (policy.supervisorIds.length > 1 || policy.mode === 'required') Object.assign(record, {
                    status: 'pending_supervisor', supervisor_id: policy.supervisorId, supervisor_decision: null,
                    supervisor_comment: null, supervisor_decided_at: null, approval_mode: 'supervisor_proxy', review_policy: policy
                });
            });
            store().transaction(() => {
                const overlap = kind === 'leave' ? db.hasOverlappingLeaveRequest : db.hasOverlappingOvertimeRequest;
                targets.forEach((target) => targetFor(request, target.id));
                const conflicts = targets.filter((target) => overlap(target.id, period.start_at, period.end_at, '', kind === 'leave' ? period : undefined));
                if (conflicts.length) fail(`${conflicts.map((e) => `${e.id} ${e.name}`).join('、')} 這段時間已有待審或已核准的申請；整批未建立。`, 409);
                records.forEach((record, index) => {
                    (kind === 'leave' ? db.createLeaveRequest : db.createOvertimeRequest)(record);
                    if (kind === 'leave' && body.mealOptOuts !== undefined) {
                        if (!Array.isArray(body.mealOptOuts) || body.mealOptOuts.some((item) => !item || !targets.some((target) => target.id === item.employeeId))) fail('不用餐對象必須是本次授權代辦的員工。', 403);
                        db.getMeals().applyLeaveMealOptOut({ employeeIds: [record.employee_id], periods: getLeaveDateSegments(period),
                            selections: body.mealOptOuts.filter((item) => item.employeeId === record.employee_id), requestId: record.id },
                            { actorId, label: '指定主管代請假並取消午餐', audit: (entry) => auditEntry(request, entry) }, now);
                    }
                    const target = targets[index];
                    db.addAuditLog(auditEntry(request, { action: 'supervisor_proxy_create', target_type: `${kind}_request`, target_id: record.id,
                        summary: `指定主管代 ${target.id} ${target.name} 申請${kind === 'leave' ? '請假' : '加班'}（${record.status === 'pending_supervisor' ? '依多主管規則送審' : record.status === 'pending_admin' ? '送管理部終審' : '已核准'}）：${reason}`,
                        after_data: { ...(kind === 'leave' ? db.getLeaveRequestById(record.id) : record), batchId, batchSize: targets.length } }));
                });
            });
            notify(request, kind === 'leave' ? 'leaveRequests' : 'overtimeRequests');
            if (kind === 'leave' && body.mealOptOuts?.length) notify(request, 'meals');
            response.json({ success: true, requestId: records[0].id, requestIds: records.map((row) => row.id), createdCount: records.length,
                message: `${records.length} 位員工的代辦${kind === 'leave' ? '請假' : '加班'}已依各人審核規則建立。` });
        }));
    }
    server.post('/api/browser/employee/supervisor/leave/withdraw', requireSession, requireRole('employee'), handle((request, response) => {
        const body = request.body || {};
        requireSupervisor(request);
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
        const targets = targetsFor(request, body);
        const reason = proxyReason(body.reason);
        const meals = db.getMeals(), now = Date.now();
        store().transaction(() => {
            targets.forEach((target) => targetFor(request, target.id));
            const day = meals.dayState(body.date, now);
            if (body.version !== day.version) fail('資料已變更，請重新整理後再確認。', 409);
            if (day.locked) fail('已達變更截止時間或已結單，請聯絡團膳管理者。', 403);
            const unavailable = targets.filter((target) => !day.serving || !day.rows.find((row) => row.employee_id === target.id)?.eligible);
            if (unavailable.length) fail(`${unavailable.map((e) => `${e.id} ${e.name}`).join('、')} 本日未供餐或未參加團膳；整批未儲存。`);
            targets.forEach((target) => meals.saveChoice({ ...body, employeeId: target.id, reason, version: meals.dayState(body.date, now).version },
                { manager: false, actorId: request.browserSession.employeeId, label: '指定主管代登午餐', audit: (entry) => auditEntry(request, entry) }, now));
        });
        notify(request, 'meals');
        response.json({ success: true, message: `${targets.length} 位員工的午餐代登已儲存。` });
    }));
}
module.exports = { attachSupervisorRoutes, requestPeriod };
