const DAY_MS = 86400000;
const TAIPEI_OFFSET = 8 * 3600000;
const EXPLICIT_DATES = 'explicit_dates';
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

// Selection is an explicit request property. Historical accounting allocations
// must never silently turn an old continuous request into a date selection.
function normalizeLeaveDateSelection(request = {}) {
    const mode = modeOf(request);
    if (![LEGACY_RANGE, EXPLICIT_DATES].includes(mode)) fail('請假日期選擇模式不正確。');
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

module.exports = { normalizeLeaveDateSelection, getLeaveDateSegments, leaveOverlapsRange, EXPLICIT_DATES, LEGACY_RANGE };
