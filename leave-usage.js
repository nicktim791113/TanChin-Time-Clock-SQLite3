const XLSX = require('xlsx');
const { normalizeLeaveDateSelection, EXPLICIT_DATES, EXPLICIT_SEGMENTS } = require('./leave-date-selection');
const OFFSET = 8 * 3600000;
const DAY = 86400000;
const PAGE_SIZE = 15;
const fail = (message) => { throw Object.assign(new Error(message), { statusCode: 400 }); };
const day = (at) => new Date(Number(at) + OFFSET).toISOString().slice(0, 10);
function usageRange(input = {}) {
    const parse = (value) => {
        if (typeof value !== 'string' || !/^(20\d{2}|2100)-\d{2}-\d{2}$/.test(value)) fail('請填寫有效的開始及結束日期（2000 至 2100 年）。');
        const at = Date.parse(`${value}T00:00:00+08:00`);
        if (!Number.isFinite(at) || day(at) !== value) fail('日期不存在，請重新選擇。');
        return at;
    };
    const start = parse(input.startDate), last = parse(input.endDate);
    if (last < start) fail('結束日期不可早於開始日期。');
    return { startDate: input.startDate, endDate: input.endDate, start, end: last + DAY };
}
const blankCell = () => ({ approvedHours: 0, pendingHours: 0, approvedCount: 0, pendingCount: 0, unknownCount: 0 });
const add = (cell, value) => {
    for (const key of Object.keys(cell)) cell[key] = Math.round((cell[key] + value[key]) * 100) / 100;
};
// Only recorded daily allocations can split a request across a report boundary.
// Historical whole-request hours must never be spread evenly or treated as zero.
function usageAmount(request, range, charges = []) {
    const total = Number(request.duration_hours);
    let rows = charges;
    if ([EXPLICIT_DATES, EXPLICIT_SEGMENTS].includes(request.date_selection_mode)) {
        try { rows = normalizeLeaveDateSelection(request).daily_hours; }
        catch { return { hours: null, basis: 'invalid_daily' }; }
    }
    if (rows.length) {
        const valid = rows.every((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(Date.parse(row.date + 'T00:00:00+08:00')) && day(Date.parse(row.date + 'T00:00:00+08:00')) === row.date && Number.isFinite(row.hours) && row.hours > 0);
        const sum = rows.reduce((n, row) => n + Math.round(row.hours * 100), 0);
        if (!valid || sum !== Math.round(total * 100)) return { hours: null, basis: 'invalid_daily' };
        return { hours: rows.filter((row) => row.date >= range.startDate && row.date <= range.endDate).reduce((n, row) => n + Math.round(row.hours * 100), 0) / 100, basis: 'daily' };
    }
    if (!(total > 0) || !Number.isFinite(total)) return { hours: null, basis: 'missing_hours' };
    if (request.start_at < range.start || request.end_at > range.end) return { hours: null, basis: 'boundary_unknown' };
    return { hours: total, basis: 'whole_request' };
}
function buildLeaveUsage({ employees, types, requests, range, getCharges = () => [] }) {
    const typeMap = new Map(types.map((type) => [type.id, { id: type.id, name: type.name, enabled: Boolean(type.enabled) }]));
    const people = new Map(employees.map((person) => [person.id, { employeeId: person.id, name: person.name, department: person.department || '', cells: Object.create(null), total: blankCell() }]));
    const details = [];
    for (const request of requests) {
        if (!['approved', 'pending_supervisor', 'pending_admin'].includes(request.status) || request.start_at >= range.end || request.end_at <= range.start) continue;
        const amount = usageAmount(request, range, getCharges(request.id));
        if (amount.hours === 0) continue;
        if (!people.has(request.employee_id)) people.set(request.employee_id, { employeeId: request.employee_id, name: '名冊已無此人', department: '', cells: Object.create(null), total: blankCell() });
        if (!typeMap.has(request.leave_type_id)) typeMap.set(request.leave_type_id, { id: request.leave_type_id, name: request.leave_type_id, enabled: false });
        const value = blankCell(), pending = request.status !== 'approved';
        value[pending ? 'pendingCount' : 'approvedCount'] = 1;
        if (amount.hours == null) value.unknownCount = 1;
        else value[pending ? 'pendingHours' : 'approvedHours'] = amount.hours;
        const person = people.get(request.employee_id);
        add(person.cells[request.leave_type_id] ||= blankCell(), value); add(person.total, value);
        details.push({ request, hours: amount.hours, basis: amount.basis });
    }
    return { employees: [...people.values()].sort((a, b) => a.employeeId.localeCompare(b.employeeId, 'en', { numeric: true }) || a.employeeId.localeCompare(b.employeeId)), types: [...typeMap.values()], details };
}
function attachLeaveUsageRoutes(server, { db, requireSession, requirePermission, formatRecord }) {
    const read = requirePermission('admin.leave.review');
    function report(input) {
        const range = usageRange(input);
        for (const key of ['keyword', 'department', 'employeeId', 'leaveTypeId']) if (input[key] != null && (typeof input[key] !== 'string' || input[key].length > 200)) fail('篩選條件格式不正確。');
        const source = buildLeaveUsage({ employees: db.loadEmployees(), types: db.loadLeaveTypes(), range,
            requests: db.queryLeaveRequests({ overlapStartAt: range.start, overlapEndAt: range.end - 1, limit: null }), getCharges: (id) => db.getLeaveEntitlements().charges(id) });
        const keyword = String(input.keyword || '').trim().toLocaleLowerCase();
        const employees = source.employees.filter((person) => (!input.department || person.department === input.department) && (!input.employeeId || person.employeeId === input.employeeId) && (!keyword || `${person.employeeId} ${person.name}`.toLocaleLowerCase().includes(keyword)));
        if (input.leaveTypeId) for (const person of employees) {
            person.cells = person.cells[input.leaveTypeId] ? { [input.leaveTypeId]: person.cells[input.leaveTypeId] } : {};
            person.total = blankCell(); if (person.cells[input.leaveTypeId]) add(person.total, person.cells[input.leaveTypeId]);
        }
        const ids = new Set(employees.map((person) => person.employeeId));
        const details = source.details.filter(({ request }) => ids.has(request.employee_id) && (!input.leaveTypeId || request.leave_type_id === input.leaveTypeId));
        const total = blankCell(); employees.forEach((person) => add(total, person.total));
        return { range, employees, types: input.leaveTypeId ? source.types.filter((type) => type.id === input.leaveTypeId) : source.types, details, total, departments: [...new Set(source.employees.map((p) => p.department).filter(Boolean))].sort() };
    }
    const handle = (callback) => (request, response) => {
        try { response.set('Cache-Control', 'no-store'); callback(request, response); }
        catch (error) { response.status(error.statusCode || 500).json({ success: false, error: error.statusCode ? error.message : '請假使用總覽讀取失敗，請重新整理。' }); }
    };
    server.get('/api/browser/admin/leave/usage', requireSession, read, handle((request, response) => {
        const result = report(request.query);
        const pageInput = request.query.page == null ? 1 : Number(request.query.page);
        if (!Number.isSafeInteger(pageInput) || pageInput < 1) fail('頁碼須為正整數。');
        const isDetail = Boolean(request.query.employeeId && request.query.leaveTypeId);
        const rows = isDetail ? result.details : result.employees;
        const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE)), page = Math.min(pageInput, pages);
        const slice = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
        response.json({ success: true, usage: { range: result.range, types: result.types, departments: result.departments, total: result.total,
            totalCount: rows.length, page, pages, pageSize: PAGE_SIZE,
            employees: isDetail ? [] : slice,
            details: isDetail ? slice.map((item) => ({ ...formatRecord(item.request), usageHours: item.hours, usageBasis: item.basis })) : [] } });
    }));
    server.get('/api/browser/admin/leave/usage/export', requireSession, read, handle((request, response) => {
        const result = report(request.query);
        const rows = [['工號', '姓名', '部門', ...result.types.flatMap((t) => [`${t.name} 已核准小時`, `${t.name} 待審小時`, `${t.name} 待確認筆數`])],
            ...result.employees.map((person) => [person.employeeId, person.name, person.department, ...result.types.flatMap((t) => {
                const cell = person.cells[t.id] || blankCell(); return [cell.approvedHours, cell.pendingHours, cell.unknownCount];
            })])];
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), '請假使用總覽');
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['開始日期', result.range.startDate], ['結束日期', result.range.endDate], ['計算方式', '依實際每日時數；無每日分配且跨區間邊界的舊單列待確認，未包含於小時加總。已核准與待審分開；已駁回、撤回、作廢不計使用。'], ['篩選工號或姓名', request.query.keyword || ''], ['部門', request.query.department || '全部']]), '查詢說明');
        response.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').set('Content-Disposition', 'attachment; filename="leave-usage.xlsx"').send(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
    }));
}
module.exports = { usageRange, usageAmount, buildLeaveUsage, attachLeaveUsageRoutes };
