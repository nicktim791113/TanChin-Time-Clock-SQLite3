'use strict';

const crypto = require('node:crypto');
const { requirePersonalSupervisor } = require('./supervisor-management');

const ANNUAL_LEAVE_PERMISSIONS = Object.freeze({
    view: 'admin.leave.balances.view',
    policyManage: 'admin.leave.entitlements.policy.manage',
    grant: 'admin.leave.entitlements.grant',
    close: 'admin.leave.entitlements.close',
    adjust: 'admin.leave.balances.manage'
});

function fail(message, status = 400) { throw Object.assign(new Error(message), { statusCode: status }); }

function readYear(value) {
    if (value === undefined || value === '') return Number(new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 4));
    if (typeof value !== 'string' && typeof value !== 'number') fail('年度格式不正確。');
    if (!/^\d{4}$/.test(String(value)) || Number(value) < 2017 || Number(value) > 2100) fail('年度須為 2017 至 2100。');
    return Number(value);
}

function requestBody(request) {
    const body = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail('請提供有效的作業資料。');
    // The actor and session context are server-owned; never honor client claims.
    const { actorId, actor_id, actor, sessionKey, sessionToken, token, context, ...safe } = body;
    return safe;
}

function confirmBody(request) {
    const body = requestBody(request);
    if (body.confirm !== true) fail('請核對預覽內容並明確確認本次異動。');
    for (const key of ['previewId', 'digest', 'revision', 'idempotencyKey']) {
        if (typeof body[key] !== 'string' || !body[key].trim() || body[key].length > 200) fail(`缺少有效的 ${key}，請重新預覽。`);
    }
    if (typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 500) fail('請填寫本次異動原因（最多 500 字）。');
    return { ...body, reason: body.reason.trim() };
}

function requestContext(request) {
    const session = request.browserSession;
    const sessionToken = String(session.token || request.headers.authorization || '');
    if (!sessionToken) fail('登入狀態不完整，請重新登入。', 401);
    return {
        actorId: String(session.realEmployeeId || session.employeeId || ''),
        sessionKey: crypto.createHash('sha256').update(sessionToken).digest('hex')
    };
}

function csvCell(value) {
    let text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
}

function exportSnapshot(state, year, employeeView) {
    // Keep evidence, service intervals and unrelated employee master data out of exports.
    const closureFields = ['id', 'allocationId', 'employeeId', 'year', 'sourceYear', 'targetYear', 'amount', 'mode', 'status',
        'periodStart', 'periodEndExclusive', 'originalPeriodStart', 'originalPeriodEndExclusive',
        'carryHours', 'settlementHours', 'pendingHours', 'unpaidHours', 'createdAt', 'calculatedAt'];
    const pick = (row, fields) => Object.fromEntries(fields.filter((key) => Object.hasOwn(row, key)).map((key) => [key, row[key]]));
    const allocationFields = ['id', 'sourceLotId', 'year', 'kind', 'periodStart', 'periodEndExclusive', 'sourceYear',
        'dayHours', 'grantHours', 'adjustedHours', 'closedHours', 'usedHours', 'heldHours', 'availableHours', 'warnings'];
    const lotFields = ['id', 'eventKey', 'serviceMonths', 'acquisitionDate', 'baseAcquisitionDate', 'periodStart', 'periodEndExclusive',
        'baselineStatutoryDays', 'statutoryDays', 'statutoryHours', 'status', 'policy', 'calculation'];
    return {
        year, generatedAt: new Date().toISOString(),
        note: '特休權利與額度核對資料；待核定項目不是已給假、已結薪或已付款。',
        balances: Array.isArray(state.balances) ? state.balances : [],
        closures: (state.closures || []).map((row) => pick(row, closureFields)),
        calculations: (employeeView?.employees || []).map((employee) => ({
            employeeId: employee.employeeId, name: employee.name, leaveTypeId: employee.leaveTypeId,
            // employeeView already strips service and consent evidence from calculation snapshots.
            lots: (employee.lots || []).map((row) => pick(row, lotFields)),
            allocations: (employee.allocations || []).map((row) => pick(row, allocationFields))
        }))
    };
}

function attachAnnualLeaveRoutes(server, { db, requireSession, hasPermission, auditEntry, notify }) {
    const store = () => db.getAnnualLeave();
    const permissions = (session) => {
        const systemAdmin = session.role === 'system_admin';
        const can = (permission) => systemAdmin || (session.role === 'admin' && hasPermission(session, permission));
        const access = Object.fromEntries(Object.entries(ANNUAL_LEAVE_PERMISSIONS).map(([key, code]) => [key, can(code)]));
        access.view = access.view || access.policyManage || access.grant || access.close || access.adjust;
        if (session.impersonation?.active) for (const key of ['policyManage', 'grant', 'close', 'adjust']) access[key] = false;
        return access;
    };
    const permit = (key, write = false) => (request, response, next) => {
        if (write && request.browserSession.impersonation?.active) return response.status(403).json({ success: false, error: '身份模擬不能修改特休制度、給假、結轉或額度。' });
        if (!permissions(request.browserSession)[key]) return response.status(403).json({ success: false, error: '尚未獲授權使用此特休功能。' });
        next();
    };
    const handle = (callback) => async (request, response) => {
        response.set('Cache-Control', 'no-store');
        try { await callback(request, response); } catch (error) {
            const status = error.statusCode || error.status || 500;
            response.status(status).json({ success: false, error: status < 500 ? error.message : '特休作業未完成，沒有確認本次異動；請重新整理後再試。' });
        }
    };
    const root = '/api/browser/annual-leave';
    server.get(root, requireSession, permit('view'), handle((request, response) => {
        response.json({ success: true, annualLeave: store().state(readYear(request.query.year)), permissions: permissions(request.browserSession) });
    }));
    server.get(`${root}/policies`, requireSession, permit('view'), handle((request, response) => {
        const state = store().state(readYear(request.query.year));
        response.json({ success: true, policies: state.policies, revision: state.revision, permissions: permissions(request.browserSession) });
    }));
    for (const [route, method, message] of [
        ['policy', 'savePolicy', '特休制度版本已儲存。'],
        ['service', 'saveService', '員工年資認列資料已儲存。']
    ]) {
        server.post(`${root}/${route}`, requireSession, permit('policyManage', true), handle((request, response) => {
            const body = requestBody(request);
            const result = store()[method](body, (entry) => auditEntry(request, entry));
            notify(request);
            response.json({ success: true, ...(result || {}), message: result?.reviewRequired
                ? '已記錄待核對，未套用新版本，後續給假已封鎖。' : message });
        }));
    }
    for (const [kind, permission] of [['grant', 'grant'], ['close', 'close'], ['correction', 'adjust']]) {
        server.post(`${root}/${kind}-preview`, requireSession, permit(kind === 'correction' ? 'adjust' : 'view'), handle((request, response) => {
            const body = requestBody(request), context = requestContext(request);
            const preview = store()[`${kind}Preview`](body, context);
            response.json({ success: true, preview });
        }));
        server.post(`${root}/${kind}-confirm`, requireSession, permit(permission, true), handle((request, response) => {
            const body = confirmBody(request), context = requestContext(request);
            const result = store()[`${kind}Confirm`](body, (entry) => auditEntry(request, entry), context);
            notify(request);
            response.json({ success: true, ...(result || {}) });
        }));
    }
    server.get(`${root}/export`, requireSession, permit('view'), handle((request, response) => {
        const year = readYear(request.query.year), format = request.query.format || 'json';
        if (!['json', 'csv'].includes(format)) fail('匯出格式僅支援 JSON 或 CSV。');
        const annualStore = store(), state = annualStore.state(year);
        const employeeIds = [...new Set((state.balances || []).map((row) => row.employee_id || row.employeeId).filter(Boolean))];
        const snapshot = exportSnapshot(state, year, format === 'json' ? annualStore.employeeView(employeeIds, year) : null);
        response.set('Content-Disposition', `attachment; filename="annual-leave-${year}.${format}"`);
        if (format === 'json') return response.type('application/json').send(JSON.stringify(snapshot, null, 2));
        const rows = snapshot.balances;
        const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
        const csv = [columns, ...rows.map((row) => columns.map((column) => row[column]))].map((row) => row.map(csvCell).join(',')).join('\r\n');
        response.type('text/csv; charset=utf-8').send('\uFEFF' + csv);
    }));
    server.get('/api/browser/employee/annual-leave', requireSession, handle((request, response) => {
        const session = request.browserSession;
        if (session.role !== 'employee') fail('請從員工工作台查看本人或明確授權員工的特休。', 403);
        if (request.query.employeeId !== undefined && typeof request.query.employeeId !== 'string') fail('員工工號格式不正確。');
        if (request.query.employeeIds !== undefined) fail('此入口每次只可查詢一位員工。');
        const employeeId = String(request.query.employeeId || session.employeeId).trim();
        if (employeeId !== session.employeeId) {
            requirePersonalSupervisor(session);
            if (!db.getSupervisors().isAssigned(session.employeeId, employeeId)) fail('沒有該員工的代辦授權。', 403);
        }
        response.json({ success: true, ...store().employeeView([employeeId], readYear(request.query.year)) });
    }));
}

module.exports = { attachAnnualLeaveRoutes, ANNUAL_LEAVE_PERMISSIONS };
