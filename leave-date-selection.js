const DAY_MS = 86400000;
const TAIPEI_OFFSET = 8 * 3600000;
const EXPLICIT_DATES = 'explicit_dates';
const EXPLICIT_SEGMENTS = 'explicit_segments';
const MAX_LEAVE_SEGMENTS = 740;
const LEGACY_RANGE = 'legacy_range';

function fail(message) { throw Object.assign(new Error(message), { statusCode: 400 }); }
function dayText(timestamp) { return new Date(Number(timestamp) + TAIPEI_OFFSET).toISOString().slice(0, 10); }
function dayStart(date) { return Date.parse(`${date}T00:00:00+08:00`); }
function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const at = dayStart(value);
    return Number.isFinite(at) && dayText(at) === value;
}
function modeOf(request) { return request.date_selection_mode ?? request.dateSelectionMode ?? LEGACY_RANGE; }
function readDailyHours(value) {
    if (typeof value === 'string') {
        if (!value.trim()) return [];
        return value.trim().split(/\r?\n/).map((line) => {
            const parts = line.split('=');
            if (parts.length !== 2) fail('每日時數格式為 YYYY-MM-DD=小時，每日一列。');
            return { date: parts[0].trim(), hours: parts[1].trim() };
        });
    }
    return value;
}

// Each precise segment belongs to one Taipei date. A period crossing midnight
// must supply its actual hours for each date instead of guessing an allocation.
function normalizeLeaveSegments(request = {}) {
    const rows = request.leave_segments ?? request.leaveSegments;
    if (!Array.isArray(rows) || !rows.length || rows.length > MAX_LEAVE_SEGMENTS) fail(`請至少新增 1 段請假時段，最多 ${MAX_LEAVE_SEGMENTS} 段。`);
    const ids = new Set();
    const segments = rows.map((row) => {
        if (!row || typeof row !== 'object') fail('請假時段格式不正確。');
        const rawStart = row.startAt ?? row.start_at, rawEnd = row.endAt ?? row.end_at;
        const validTimestamp = (value) => ['number', 'string'].includes(typeof value) && /^\d+$/.test(String(value)) &&
            Number.isSafeInteger(Number(value)) && Number.isFinite(new Date(Number(value) + TAIPEI_OFFSET).getTime());
        if (!validTimestamp(rawStart) || !validTimestamp(rawEnd) || Number(rawEnd) <= Number(rawStart)) fail('每段請假須有有效且結束晚於開始的日期時間。');
        const startAt = Number(rawStart), endAt = Number(rawEnd), date = dayText(startAt);
        if (!validDate(date) || dayText(endAt - 1) !== date) fail('每段請假須在同一日期內；跨日時請分別填寫各日實際時數，可結束於隔日零時。');
        if (row.date != null && row.date !== date) fail('時段日期與開始時間不一致。');
        if (!['number', 'string'].includes(typeof row.hours) || !/^\d+(\.\d{1,2})?$/.test(String(row.hours))) fail('每段實際時數須為最多兩位小數的數字。');
        const units = Math.round(Number(row.hours) * 100);
        if (!Number.isSafeInteger(units) || units <= 0 || units > 2400 || units * 36000 > endAt - startAt) fail('每段實際時數須大於 0、不超過 24 小時，且不得超過該段起訖時間。');
        // Rest is optional on historical and older-client rows. Never infer or
        // deduct it again from their already recorded net hours.
        const rest = {};
        if (Object.hasOwn(row, 'breakMinutes')) {
            const value = row.breakMinutes;
            if (!['number', 'string'].includes(typeof value) || !/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value))) fail('每段休息時間須為 0 以上的整數分鐘。');
            const minutes = Number(value);
            if (minutes * 60000 >= endAt - startAt) fail('每段休息時間須小於該段起訖時間。');
            if (units * 36000 > endAt - startAt - minutes * 60000) fail('每段實際時數不得超過扣除休息後的時間。');
            rest.breakMinutes = minutes;
        }
        const id = row.id == null || row.id === '' ? null : row.id;
        if (id !== null && (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(id) || ids.has(id))) fail('請假時段識別碼格式不正確或重複。');
        if (id !== null) ids.add(id);
        return { id, date, startAt, endAt, hours: units / 100, ...rest };
    }).sort((a, b) => a.startAt - b.startAt || a.endAt - b.endAt);
    const daily = new Map();
    for (let index = 0; index < segments.length; index++) {
        const segment = segments[index];
        if (index && segments[index - 1].endAt > segment.startAt) fail('同一張請假單的時段不可重疊，請調整起訖時間。');
        daily.set(segment.date, (daily.get(segment.date) || 0) + Math.round(segment.hours * 100));
    }
    const start = segments[0].startAt, end = segments[segments.length - 1].endAt;
    if ((dayStart(dayText(end - 1)) - dayStart(dayText(start))) / DAY_MS + 1 > 370) fail('多時段請假期間不可超過 370 日，請分單申請。');
    return { date_selection_mode: EXPLICIT_SEGMENTS, start_at: start, end_at: end, leave_segments: segments,
        daily_hours: [...daily].map(([date, units]) => ({ date, hours: units / 100 })),
        duration_hours: [...daily.values()].reduce((sum, units) => sum + units, 0) / 100 };
}

// Selection is an explicit request property. Historical accounting allocations
// must never silently turn an old continuous request into a date selection.
function normalizeLeaveDateSelection(request = {}) {
    const mode = modeOf(request);
    if (![LEGACY_RANGE, EXPLICIT_DATES, EXPLICIT_SEGMENTS].includes(mode)) fail('請假日期選擇模式不正確。');
    if (mode === EXPLICIT_SEGMENTS) return normalizeLeaveSegments(request);
    if (mode === LEGACY_RANGE) return { date_selection_mode: mode, daily_hours: request.daily_hours ?? request.dailyHours, duration_hours: request.duration_hours };
    const start = Number(request.start_at), end = Number(request.end_at);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !Number.isFinite(new Date(start).getTime()) || !Number.isFinite(new Date(end).getTime())) fail('請輸入有效且結束晚於開始的請假期間。');
    const first = dayStart(dayText(start)), last = dayStart(dayText(end - 1));
    if ((last - first) / DAY_MS + 1 > 370) fail('逐日請假期間不可超過 370 日，請分單申請。');
    const rows = readDailyHours(request.daily_hours ?? request.dailyHours);
    if (!Array.isArray(rows) || !rows.length || rows.length > 370) fail('請至少勾選 1 個請假日期，最多 370 日，並填寫每日實際時數。');
    const seen = new Set();
    let totalUnits = 0;
    const normalized = rows.map((row) => {
        if (!row || !validDate(row.date)) fail('請假日期須為 YYYY-MM-DD 且為有效日期。');
        if (seen.has(row.date)) fail('請假日期不可重複。');
        seen.add(row.date);
        const at = dayStart(row.date), span = Math.min(end, at + DAY_MS) - Math.max(start, at);
        if (span <= 0) fail('所選日期須在請假起訖期間內，結束時間不包含隔日零時。');
        if (!['number', 'string'].includes(typeof row.hours) || !/^\d+(\.\d{1,2})?$/.test(String(row.hours))) fail('每日實際時數須為最多兩位小數的數字。');
        const units = Math.round(Number(row.hours) * 100);
        if (!Number.isSafeInteger(units) || units <= 0 || units > 2400 || units * 36000 > span) fail('每日實際時數須大於 0、不超過 24 小時，且不得超過該日與申請起訖重疊的時間。');
        totalUnits += units;
        return { date: row.date, hours: units / 100 };
    }).sort((a, b) => a.date.localeCompare(b.date));
    return { date_selection_mode: EXPLICIT_DATES, daily_hours: normalized, duration_hours: totalUnits / 100 };
}

function getLeaveDateSegments(request = {}) {
    if (modeOf(request) === EXPLICIT_SEGMENTS) return normalizeLeaveSegments(request).leave_segments;
    const start = Number(request.start_at), end = Number(request.end_at);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
    if (modeOf(request) === EXPLICIT_DATES) {
        const selected = normalizeLeaveDateSelection(request);
        return selected.daily_hours.map((row) => {
            const at = dayStart(row.date);
            return { date: row.date, startAt: Math.max(start, at), endAt: Math.min(end, at + DAY_MS), hours: row.hours };
        });
    }
    const segments = [];
    for (let at = dayStart(dayText(start)); at < end; at += DAY_MS) {
        const startAt = Math.max(start, at), endAt = Math.min(end, at + DAY_MS);
        segments.push({ date: dayText(at), startAt, endAt, hours: (endAt - startAt) / 3600000 });
    }
    const total = Number(request.duration_hours);
    if (!(total > 0)) return segments;
    let remaining = Math.round(total * 100);
    const totalUnits = remaining;
    return segments.map((segment, index) => {
        const units = index === segments.length - 1 ? remaining : Math.min(remaining, Math.round(totalUnits * (segment.endAt - segment.startAt) / (end - start)));
        remaining -= units;
        return { ...segment, hours: units / 100 };
    });
}

function leaveOverlapsRange(request, startAt, endAt) {
    const start = Number(startAt), end = Number(endAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
    return getLeaveDateSegments(request).some((segment) => segment.startAt < end && segment.endAt > start);
}

// A segment's actual hours exclude breaks whose position is not recorded.
// Subtract all time outside the target window first; only the remainder is
// certain to belong inside that window. This must not fill gaps between rows.
function guaranteedLeaveHoursInRange(segments, startAt, endAt) {
    const start = Number(startAt), end = Number(endAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
    return segments.reduce((total, segment) => {
        const overlapMs = Math.max(0, Math.min(end, segment.endAt) - Math.max(start, segment.startAt));
        const outsideMs = segment.endAt - segment.startAt - overlapMs;
        return total + Math.max(0, Math.round(segment.hours * 100) * 36000 - outsideMs);
    }, 0) / 3600000;
}

module.exports = { normalizeLeaveDateSelection, normalizeLeaveSegments, getLeaveDateSegments, leaveOverlapsRange, guaranteedLeaveHoursInRange, EXPLICIT_DATES, EXPLICIT_SEGMENTS, MAX_LEAVE_SEGMENTS, LEGACY_RANGE };
