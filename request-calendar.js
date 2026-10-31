const DAY_MS = 86400000;
const TAIPEI_OFFSET = 8 * 3600000;
const PAGE_SIZE = 50;
const REQUEST_STATUSES = ['pending_supervisor', 'pending_admin', 'approved', 'rejected', 'withdrawn', 'cancelled'];
const STATUS_LABELS = { pending_supervisor: '主管審核中', pending_admin: '管理部複核中', approved: '已核准', rejected: '已駁回', withdrawn: '已撤回', cancelled: '已取消' };
const { getLeaveDateSegments, leaveOverlapsRange } = require('./leave-date-selection');

function invalid(message) {
    return Object.assign(new Error(message), { status: 400 });
}

function taipeiDate(timestamp = Date.now()) {
    return new Date(Number(timestamp) + TAIPEI_OFFSET).toISOString().slice(0, 10);
}

function monthRange(month = taipeiDate().slice(0, 7)) {
    if (typeof month !== 'string' || !/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(month)) throw invalid('請選擇有效月份（2000 至 2100 年）。');
    const [year, number] = month.split('-').map(Number);
    const start = Date.UTC(year, number - 1, 1) - TAIPEI_OFFSET;
    const end = Date.UTC(year, number, 1) - TAIPEI_OFFSET;
    return { month, start, end, dates: Array.from({ length: (end - start) / DAY_MS }, (_, i) => taipeiDate(start + i * DAY_MS)) };
}

function buildCalendar(month, records, now = Date.now()) {
    const range = monthRange(month);
    const days = range.dates.map((date) => ({ date, totalCount: 0, approvedCount: 0, approvedPeople: 0, pendingCount: 0, otherCount: 0 }));
    const people = days.map(() => new Set());
    const requestIds = new Set();
    let totalCount = 0;
    for (const row of records) {
        if (row.id != null && requestIds.has(row.id)) continue;
        const indexes = new Set(getLeaveDateSegments(row)
            .filter((segment) => segment.startAt < range.end && segment.endAt > range.start)
            .map((segment) => Math.floor((Math.max(segment.startAt, range.start) - range.start) / DAY_MS)));
        if (!indexes.size) continue;
        if (row.id != null) requestIds.add(row.id);
        totalCount += 1;
        for (const index of indexes) {
            const day = days[index];
            day.totalCount += 1;
            if (row.status === 'approved') {
                day.approvedCount += 1;
                people[index].add(row.employee_id);
            } else if (row.status === 'pending_supervisor' || row.status === 'pending_admin') day.pendingCount += 1;
            else day.otherCount += 1;
        }
    }
    days.forEach((day, i) => { day.approvedPeople = people[i].size; });
    return { month, today: taipeiDate(now), timeZone: 'Asia/Taipei', totalCount, days };
}

function attachRequestCalendarRoutes(server, context) {
    const { db, requireSession, requireRole, requirePermission, buildLookup, formatRecord } = context;
    const timeText = (timestamp) => new Date(Number(timestamp)).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
    for (const kind of ['leave', 'overtime']) {
        for (const role of ['employee', 'admin']) {
            server.get(`/api/browser/${role}/${kind}/calendar`, requireSession,
                role === 'employee' ? requireRole('employee') : requirePermission(kind === 'leave' ? 'admin.leave.review' : 'admin.overtime.view'),
                (request, response) => {
                    try {
                        const input = request.query;
                        const range = monthRange(input.month);
                        const scope = input.scope || 'mine';
                        if (!['mine', 'review'].includes(scope)) throw invalid('無效的紀錄範圍。');
                        const historyWindow = role === 'employee' && scope === 'mine' ? db.getRequestHistory().window(kind) : null;
                        if (historyWindow?.earliestMonth && range.month < historyWindow.earliestMonth) throw Object.assign(new Error(`本人${kind === 'leave' ? '請假' : '加班'}紀錄最早可查看 ${historyWindow.earliestMonth}；更早紀錄請洽有查詢權限的管理者。`), { status: 403 });
                        if (input.status && !REQUEST_STATUSES.includes(input.status)) throw invalid('無效的申請狀態。');
                        if (kind === 'overtime' && input.status === 'pending_admin') throw invalid('無效的加班狀態。');
                        const relation = input.relation || 'all';
                        if (!['all', 'self', 'proxy'].includes(relation) || (relation !== 'all' && !(role === 'employee' && scope === 'mine' && kind === 'overtime'))) throw invalid('無效的本人／代申請範圍。');
                        if (input.requestId != null && (typeof input.requestId !== 'string' || !input.requestId.trim() || input.requestId.length > 200)) throw invalid('無效的申請識別碼。');
                        if (input.date && !range.dates.includes(input.date)) throw invalid('日期必須在選取月份內。');
                        const page = input.page == null ? 1 : Number(input.page);
                        if (!Number.isSafeInteger(page) || page < 1) throw invalid('無效的頁碼。');
                        const filters = { overlapStartAt: range.start, overlapEndAt: range.end - 1, limit: null };
                        const actorId = request.browserSession.employeeId;
                        if (role === 'employee') {
                            if (scope === 'review') {
                                filters.supervisorId = actorId;
                                filters.status = 'pending_supervisor';
                            } else if (kind === 'leave') filters.employeeId = actorId;
                            else filters.employeeOrApplicantId = actorId;
                        }
                        const lookup = buildLookup(kind);
                        const query = kind === 'leave' ? db.queryLeaveRequests : db.queryOvertimeRequests;
                        const scopedRows = query(filters).filter((row) => leaveOverlapsRange(row, range.start, range.end));
                        const employeeFor = (row) => lookup.employeeMap.get(row.employee_id) || {};
                        const rows = scopedRows.filter((row) => (
                            (!input.employeeId || row.employee_id === input.employeeId) &&
                            (!input.department || (employeeFor(row).department || '') === input.department) &&
                            (!input.status || row.status === input.status) &&
                            (!input.leaveTypeId || (kind === 'leave' && row.leave_type_id === input.leaveTypeId)) &&
                            (relation === 'all' || (relation === 'self' ? row.employee_id === actorId : row.employee_id !== actorId && row.applicant_id === actorId))
                        ));
                        const actionsFor = (row) => ({
                            review: role === 'employee' && scope === 'review' ? 'supervisor' : role === 'admin' && kind === 'leave' && row.status === 'pending_admin' ? 'admin' : '',
                            withdraw: role === 'employee' && scope === 'mine' && (row.employee_id === actorId || (kind === 'overtime' && row.applicant_id === actorId)) &&
                                (row.status === 'pending_supervisor' || (kind === 'leave' && row.status === 'pending_admin'))
                        });
                        const detailFor = (row) => ({
                            ...formatRecord(kind, row, lookup), startText: timeText(row.start_at), endText: timeText(row.end_at), calendarActions: actionsFor(row)
                        });
                        // Resolve from the same authorized month and filters, never by an
                        // unrestricted ID lookup. The whole request can span other months.
                        const selected = input.requestId == null ? null : rows.find((row) => row.id === input.requestId);
                        if (input.requestId != null && !selected) throw Object.assign(new Error('找不到此範圍內的申請。'), { status: 404 });
                        const calendar = buildCalendar(range.month, rows);
                        calendar.historyWindow = historyWindow;
                        calendar.request = selected ? detailFor(selected) : null;
                        // The calendar gets every authorized event in one response. Avoid
                        // formatRecord here: monthly summaries must not expose reasons or
                        // review comments, nor trigger per-record accounting/review reads.
                        calendar.events = rows.map((row) => ({
                            id: row.id, kind,
                            employeeId: row.employee_id, employeeName: employeeFor(row).name || row.employee_id,
                            employeeDepartment: employeeFor(row).department || '',
                            applicantId: row.applicant_id || row.employee_id,
                            applicantName: lookup.employeeMap.get(row.applicant_id || row.employee_id)?.name || row.applicant_id || row.employee_id,
                            leaveTypeId: kind === 'leave' ? row.leave_type_id : '',
                            leaveTypeName: kind === 'leave' ? lookup.typeMap.get(row.leave_type_id)?.name || row.leave_type_id : '加班',
                            status: row.status, statusText: STATUS_LABELS[row.status] || row.status || '-',
                            startAt: row.start_at, endAt: row.end_at, hours: row.duration_hours,
                            dateSelectionMode: row.date_selection_mode || 'legacy_range',
                            segmentHoursSource: ['explicit_dates', 'explicit_segments'].includes(row.date_selection_mode) ? 'recorded' : 'legacy_allocation',
                            segments: getLeaveDateSegments(row).filter((segment) => segment.startAt < range.end && segment.endAt > range.start),
                            calendarActions: actionsFor(row)
                        }));
                        // Filter options are derived only from authorized records, never the whole roster.
                        const employeeIds = [...new Set(scopedRows.map((row) => row.employee_id))];
                        calendar.employees = employeeIds.map((id) => ({ id, name: lookup.employeeMap.get(id)?.name || id, department: lookup.employeeMap.get(id)?.department || '' }));
                        calendar.departments = [...new Set(calendar.employees.map((e) => e.department))].filter(Boolean).sort();
                        calendar.leaveTypes = kind === 'leave' ? [...new Set(scopedRows.map((row) => row.leave_type_id))].map((id) => ({ id, name: lookup.typeMap.get(id)?.name || id })) : [];
                        let detailRows = rows;
                        if (input.date) {
                            const start = Date.parse(`${input.date}T00:00:00+08:00`);
                            detailRows = rows.filter((row) => leaveOverlapsRange(row, start, start + DAY_MS));
                        }
                        const pageSize = role === 'admin' && kind === 'overtime' && !input.date ? 15 : PAGE_SIZE;
                        const totalPages = Math.max(1, Math.ceil(detailRows.length / pageSize));
                        const currentPage = Math.min(page, totalPages);
                        calendar.detail = {
                            date: input.date || '', totalCount: detailRows.length, page: currentPage, totalPages, pageSize,
                            records: detailRows.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(detailFor)
                        };
                        response.json({ success: true, calendar });
                    } catch (error) {
                        console.error('[申請日曆]', error.message);
                        response.status(error.status || 500).json({ success: false, error: error.status ? error.message : '日曆資料讀取失敗，請重新整理。' });
                    }
                });
        }
    }
}

module.exports = { monthRange, buildCalendar, attachRequestCalendarRoutes };
