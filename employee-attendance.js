'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { punchHistoryWindow } = require('./employee-browser-settings');
const { getLeaveDateSegments } = require('./leave-date-selection');
const { lunchWindow } = require('./overtime-duration');

const MINUTE = 60000;
const DAY = 86400000;
const DEFAULT_WORKDAYS = [1, 2, 3, 4, 5];
const SCHEDULE = { startTime: '08:20', endTime: '17:00', lunchStart: '12:20', lunchEnd: '13:00' };
const SETTINGS_KEY = 'employeeAttendanceCalendar';
const taipeiDate = at => new Date(at + 8 * 3600000).toISOString().slice(0, 10);
const midnight = date => Date.parse(date + 'T00:00:00+08:00');
const validDate = date => typeof date === 'string' && /^(20\d\d|2100)-\d\d-\d\d$/.test(date) && Number.isFinite(midnight(date)) && taipeiDate(midnight(date)) === date;
const minutes = milliseconds => Math.floor(milliseconds / MINUTE);
function fail(message, status = 400) {
    throw Object.assign(new Error(message), { status });
}

function createAttendanceCalendarStore(sql, addAuditLog) {
    const read = sql.prepare('SELECT value FROM settings WHERE key=?');
    const write = sql.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES (?,?)');
    const state = () => {
        const raw = read.get(SETTINGS_KEY)?.value;
        const saved = raw ? JSON.parse(raw) : { workdays: DEFAULT_WORKDAYS, exceptions: [] };
        return {
            workdays: saved.workdays,
            exceptions: saved.exceptions,
            configured: Boolean(raw),
            revision: createHash('sha256').update(raw || 'default').digest('hex')
        };
    };
    const save = (body, auditEntry) => sql.transaction(() => {
        const before = state();
        if (body.revision !== before.revision) fail('出勤日曆已變更，請重新讀取。', 409);
        const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
        if (body.confirm !== true || !reason || reason.length > 500) fail('請確認儲存並填寫設定原因（最多 500 字）。');
        if (!Array.isArray(body.workdays) || body.workdays.length > 7 ||
            body.workdays.some(day => !Number.isInteger(day) || day < 0 || day > 6) ||
            new Set(body.workdays).size !== body.workdays.length) fail('請提供有效且不重複的每週工作日。');
        if (!Array.isArray(body.exceptions) || body.exceptions.length > 3660 ||
            body.exceptions.some(item => !item || !validDate(item.date) || !['workday', 'offday'].includes(item.kind) ||
                typeof item.note !== 'string' || item.note.trim().length > 500) ||
            new Set(body.exceptions.map(item => item.date)).size !== body.exceptions.length) fail('請提供有效且日期不重複的出勤日例外。');
        const workdays = [...body.workdays].sort((a, b) => a - b);
        const exceptions = body.exceptions.map(({ date, kind, note }) => ({ date, kind, note: note.trim() })).sort((a, b) => a.date.localeCompare(b.date));
        write.run(SETTINGS_KEY, JSON.stringify({ workdays, exceptions, editId: randomUUID() }));
        const after = state();
        addAuditLog(auditEntry({
            action: 'attendance_calendar_update', target_type: 'attendance_calendar', target_id: SETTINGS_KEY,
            summary: '更新出勤日曆：' + reason, before_data: before, after_data: { ...after, reason }
        }));
        return after;
    })();
    return { state, save };
}

function attendanceMonth(month, historyWindow) {
    const currentMonth = taipeiDate(historyWindow.endAt).slice(0, 7);
    const selected = month ?? currentMonth;
    if (typeof selected !== 'string' || !validDate(selected + '-01')) fail('月份須為 YYYY-MM。');
    const [year, number] = selected.split('-').map(Number);
    const start = Math.max(midnight(selected + '-01'), historyWindow.startAt);
    const end = Math.min(Date.UTC(year, number, 1) - 8 * 3600000, historyWindow.endAt + 1);
    if (start >= end) fail('這個月份超出個人打卡紀錄的查閱範圍。', 403);
    return { month: selected, start, end };
}

const period = (startAt, endAt) => ({ startAt, endAt });
const clip = (a, b) => period(Math.max(a.startAt, b.startAt), Math.min(a.endAt, b.endAt));
const nonempty = range => range.endAt > range.startAt;
const overlaps = (a, b) => nonempty(clip(a, b));
const duration = periods => periods.reduce((sum, range) => sum + range.endAt - range.startAt, 0);

function subtract(periods, exclusion) {
    return periods.flatMap(range => {
        if (!overlaps(range, exclusion)) return [range];
        return [
            period(range.startAt, Math.min(range.endAt, exclusion.startAt)),
            period(Math.max(range.startAt, exclusion.endAt), range.endAt)
        ].filter(nonempty);
    });
}

function matchPunches(punches, now) {
    const pairs = [], issues = [];
    let open = null, ambiguous = false;
    for (const punch of punches) {
        if (punch.reason === 'duplicate') continue;
        if (open !== null && punch.timestamp - open >= DAY) {
            issues.push({ range: period(open, open + DAY), code: 'missing_out' });
            open = null;
            ambiguous = false;
        }
        if (punch.excluded) {
            issues.push({ range: period(punch.timestamp, punch.timestamp + 1), code: punch.reason });
            if (open !== null) ambiguous = true;
            continue;
        }
        if (punch.type === 'in') {
            if (open === null) open = punch.timestamp;
            else ambiguous = true;
        } else if (open === null) {
            issues.push({ range: period(punch.timestamp, punch.timestamp + 1), code: 'missing_in' });
        } else {
            const range = period(open, punch.timestamp);
            if (ambiguous || !nonempty(range)) issues.push({ range, code: 'ambiguous_punches' });
            else pairs.push(range);
            open = null;
            ambiguous = false;
        }
    }
    if (open !== null) {
        const range = period(open, Math.min(open + DAY, now + 1));
        const code = ambiguous ? 'ambiguous_punches' : taipeiDate(open) === taipeiDate(now) ? 'open_punch' : 'missing_out';
        issues.push({ range, code });
    }
    return { pairs, issues, open: ambiguous ? null : open };
}

const PENDING = new Set(['pending_supervisor', 'pending_admin']);
const relevantStatus = row => row.status === 'approved' || PENDING.has(row.status);
const requestPeriod = row => period(row.start_at, row.end_at);
const punchView = row => {
    const status = String(row.status || '正常').trim();
    const reason = ['重複打卡', 'duplicate'].includes(status) ? 'duplicate' :
        !['in', 'out'].includes(row.type) ? 'unsupported_type' :
            !['正常', 'normal'].includes(status) || row.risk_flags?.length ? 'abnormal_punch' : null;
    return { timestamp: row.timestamp, type: row.type, status: row.status, source: row.source, excluded: reason !== null, reason };
};

function assessEdges(required, attendance, now) {
    if (!required.length) return { lateMs: null, earlyMs: null, status: 'excused' };
    const start = required[0].startAt, end = required.at(-1).endAt;
    const evidence = attendance.pairs.filter(range => overlaps(range, period(start, end)));
    const open = attendance.open;
    const openRelevant = open !== null && open < end && open + DAY > start && taipeiDate(now) === taipeiDate(open);
    const first = evidence[0]?.startAt ?? (openRelevant ? open : null);
    const last = evidence.at(-1)?.endAt ?? null;
    const uncertain = attendance.issues.some(item => item.code !== 'open_punch' &&
        (overlaps(item.range, period(start, end)) || taipeiDate(item.range.startAt) === taipeiDate(start)));
    const lateMs = !uncertain && now >= start && first !== null ? duration(required.map(range => clip(range, period(start, first))).filter(nonempty)) : null;
    const earlyMs = !uncertain && now >= end && last !== null && !openRelevant ? duration(required.map(range => clip(range, period(last, end))).filter(nonempty)) : null;
    const status = now < end ? 'in_progress' : lateMs === null || earlyMs === null ? 'unknown' : 'completed';
    return { lateMs, earlyMs, status };
}

const displayMinutes = value => value === null ? null : minutes(value);

function assessOvertime(requests, day, normal, attendance, now) {
    const views = requests.map(row => {
        const full = requestPeriod(row);
        const clipped = clip(full, day);
        let eligible = normal.reduce(subtract, [clipped]);
        const automaticLunch = row.break_source === 'automatic_lunch';
        const lunch = lunchWindow(day.startAt);
        if (automaticLunch && full.startAt <= lunch.startAt && full.endAt >= lunch.endAt) {
            eligible = subtract(eligible, lunch);
        }
        const elapsed = duration(eligible);
        const isWhole = elapsed === full.endAt - full.startAt;
        const rest = row.break_minutes ?? null;
        const recorded = Number.isFinite(row.duration_hours) && row.duration_hours > 0;
        const approved = row.status === 'approved';
        const knownRest = Number.isInteger(rest) && rest >= 0 && rest * MINUTE < full.endAt - full.startAt;
        const approvedMs = !approved ? null : elapsed === 0 ? 0 :
            automaticLunch ? elapsed : isWhole && knownRest ? elapsed - rest * MINUTE :
                rest === 0 ? elapsed : isWhole && recorded ? Math.round(row.duration_hours * 3600000) : null;
        const edges = approved && elapsed ? assessEdges(eligible, attendance, now) : { lateMs: null, earlyMs: null, status: approved ? 'normal_overlap' : 'pending' };
        const unlocatedRest = !automaticLunch && rest !== 0 && (edges.lateMs > 0 || edges.earlyMs > 0);
        const lateMs = unlocatedRest && edges.lateMs > 0 ? null : edges.lateMs;
        const earlyMs = unlocatedRest && edges.earlyMs > 0 ? null : edges.earlyMs;
        const covered = duration(eligible.flatMap(range => attendance.pairs.map(pair => clip(range, pair)).filter(nonempty)));
        const completeEvidence = edges.status === 'completed';
        const coveredMs = !approved ? null : elapsed === 0 ? 0 : completeEvidence && covered === elapsed ? approvedMs :
            completeEvidence && (automaticLunch || rest === 0) ? covered : null;
        return {
            id: row.id, startAt: row.start_at, endAt: row.end_at, status: row.status,
            breakMinutes: rest, breakSource: row.break_source ?? null,
            durationHours: recorded ? row.duration_hours : null,
            assessmentStatus: unlocatedRest && completeEvidence ? 'unknown' : edges.status,
            issues: unlocatedRest ? ['unlocated_overtime_rest'] : [],
            eligible, approvedMs, coveredMs, lateMs, earlyMs
        };
    });
    const approved = views.filter(row => row.status === 'approved');
    const pendingCount = views.length - approved.length;
    const active = approved.filter(row => row.assessmentStatus !== 'normal_overlap');
    const overlapping = active.some((row, index) => active.slice(index + 1).some(other =>
        row.eligible.some(a => other.eligible.some(b => overlaps(a, b)))));
    const sum = (rows, key) => overlapping || !rows.length || rows.some(row => row[key] === null) ? null :
        minutes(rows.reduce((total, row) => total + row[key], 0));
    const status = !approved.length ? pendingCount ? 'pending' : 'none' :
        !active.length ? 'normal_overlap' : overlapping || active.some(row => row.assessmentStatus === 'unknown') ? 'unknown' :
            active.some(row => row.assessmentStatus === 'in_progress') ? 'in_progress' :
                active.some(row => row.coveredMs === null) ? 'unknown' : 'completed';
    return {
        approvedCount: approved.length, pendingCount, status,
        issues: [...new Set(approved.flatMap(row => row.issues))],
        requests: views.map(({ eligible, approvedMs, coveredMs, lateMs, earlyMs, ...row }) => ({
            ...row, approvedMinutes: displayMinutes(approvedMs), coveredMinutes: displayMinutes(coveredMs),
            lateMinutes: displayMinutes(lateMs), earlyMinutes: displayMinutes(earlyMs)
        })),
        approvedMinutes: sum(approved, 'approvedMs'), coveredMinutes: sum(approved, 'coveredMs'),
        lateMinutes: sum(active, 'lateMs'), earlyMinutes: sum(active, 'earlyMs')
    };
}

function buildEmployeeAttendance({ range, historyWindow, calendar, punches, leaveRequests, overtimeRequests, leaveTypes }) {
    const now = historyWindow.endAt;
    const punchViews = punches.map(punchView);
    const attendance = matchPunches(punchViews, now);
    const exceptions = new Map(calendar.exceptions.map(row => [row.date, row]));
    const types = new Map(leaveTypes.map(row => [row.id, row.name]));
    const leave = leaveRequests.filter(relevantStatus).map(row => ({ row, segments: getLeaveDateSegments(row) }));
    const overtime = overtimeRequests.filter(row => relevantStatus(row) || row.status === 'pending_additional');
    const days = [];
    for (let start = range.start; start < range.end; start += DAY) {
        const date = taipeiDate(start);
        const day = period(start, start + DAY);
        const exception = exceptions.get(date);
        const weekday = new Date(start + 8 * 3600000).getUTCDay();
        const isWorkday = exception ? exception.kind === 'workday' : calendar.workdays.includes(weekday);
        const at = time => Date.parse(date + 'T' + time + ':00+08:00');
        const normal = isWorkday ? [
            period(at(SCHEDULE.startTime), at(SCHEDULE.lunchStart)),
            period(at(SCHEDULE.lunchEnd), at(SCHEDULE.endTime))
        ] : [];
        const dayPunches = punchViews.filter(punch => punch.timestamp >= start && punch.timestamp < Math.min(day.endAt, range.end));
        const dayLeave = leave.filter(item => item.segments.some(segment => overlaps(segment, day)));
        const approved = dayLeave.filter(item => item.row.status === 'approved');
        const pendingCount = dayLeave.length - approved.length;
        let requiredSegments = normal;
        let uncertain = false;
        for (const { row, segments } of approved) {
            for (const segment of segments.filter(item => overlaps(item, day))) {
                if (!normal.some(item => overlaps(item, segment))) continue;
                const exact = row.date_selection_mode === 'explicit_segments';
                const recordedDay = row.date_selection_mode === 'explicit_dates' ||
                    taipeiDate(row.start_at) === taipeiDate(row.end_at - 1) && row.duration_hours >= 8;
                const fullDay = recordedDay && segment.hours >= 8 && segment.startAt <= normal[0].startAt && segment.endAt >= normal.at(-1).endAt;
                if (exact || fullDay) requiredSegments = subtract(requiredSegments, segment);
                else uncertain = true;
            }
        }
        const edges = !isWorkday ? { lateMs: null, earlyMs: null, status: 'offday' } :
            uncertain ? { lateMs: null, earlyMs: null, status: 'unknown' } : assessEdges(requiredSegments, attendance, now);
        const issues = attendance.issues.filter(item => overlaps(item.range, day)).map(item => item.code);
        if (uncertain) issues.push('uncertain_leave');
        if (edges.status === 'unknown' && !issues.length) issues.push('missing_punches');
        const visiblePunches = dayPunches.filter(punch => !punch.excluded);
        days.push({
            date, isWorkday, calendarNote: exception?.note || '', status: edges.status, requiredSegments,
            lateMinutes: displayMinutes(edges.lateMs), earlyMinutes: displayMinutes(edges.earlyMs),
            firstInAt: visiblePunches.find(punch => punch.type === 'in')?.timestamp ?? null,
            lastOutAt: visiblePunches.findLast(punch => punch.type === 'out')?.timestamp ?? null,
            punchCount: dayPunches.length, punches: dayPunches, issues: [...new Set(issues)],
            leave: {
                approvedCount: approved.length, pendingCount, uncertain,
                requests: dayLeave.map(({ row, segments }) => ({
                    id: row.id, startAt: row.start_at, endAt: row.end_at, status: row.status,
                    leaveTypeName: types.get(row.leave_type_id) || row.leave_type_id,
                    dateSelectionMode: row.date_selection_mode, segments: segments.filter(segment => overlaps(segment, day))
                }))
            },
            overtime: assessOvertime(overtime.filter(row => overlaps(requestPeriod(row), day)), day, normal, attendance, now)
        });
    }
    return {
        month: range.month, historyWindow,
        minMonth: taipeiDate(historyWindow.startAt).slice(0, 7), maxMonth: taipeiDate(now).slice(0, 7),
        schedule: { ...SCHEDULE, workdays: calendar.workdays, configured: calendar.configured }, days
    };
}

function attachEmployeeAttendanceRoutes(server, { db, requireSession, requireEmployee, requireCalendarPermission, auditEntry, notify }) {
    const handle = callback => (request, response) => {
        try {
            response.set('Cache-Control', 'no-store');
            response.json({ success: true, ...callback(request) });
        } catch (error) {
            response.status(error.status || error.statusCode || 500).json({ success: false, error: error.status || error.statusCode ? error.message : '出勤資料處理失敗。' });
        }
    };
    server.get('/api/browser/employee/attendance', requireSession, requireEmployee, handle(request => {
        const employeeId = request.browserSession.employeeId;
        if (Object.keys(request.query).some(key => key !== 'month')) fail('僅可查詢本人出勤月份。');
        const historyWindow = punchHistoryWindow(db.getEmployeeBrowserSettings().forEmployee(employeeId).punchHistoryMode);
        const range = attendanceMonth(request.query.month, historyWindow);
        const filters = { employeeId, overlapStartAt: range.start, overlapEndAt: range.end - 1, limit: null };
        return { attendance: buildEmployeeAttendance({
            range, historyWindow, calendar: db.getAttendanceCalendar().state(),
            // Pair across midnight and month boundaries without exposing context punches.
            punches: db.queryEmployeeAttendancePunches(employeeId, range.start - DAY, Math.min(historyWindow.endAt, range.end + DAY)),
            leaveRequests: db.queryLeaveRequests(filters), overtimeRequests: db.queryOvertimeRequests(filters),
            leaveTypes: db.loadLeaveTypes()
        }) };
    }));
    const adminPath = '/api/browser/admin/attendance-calendar';
    server.get(adminPath, requireSession, requireCalendarPermission, handle(request => ({
        calendar: { ...db.getAttendanceCalendar().state(), canEdit: !request.browserSession.impersonation?.active }
    })));
    server.post(adminPath, requireSession, requireCalendarPermission, handle(request => {
        if (request.browserSession.impersonation?.active) fail('身份模擬不能變更出勤日曆。', 403);
        const calendar = db.getAttendanceCalendar().save(request.body || {}, entry => auditEntry(request, entry));
        notify(request);
        return { calendar: { ...calendar, canEdit: true } };
    }));
}

module.exports = { createAttendanceCalendarStore, attendanceMonth, buildEmployeeAttendance, attachEmployeeAttendanceRoutes };
