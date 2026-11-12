'use strict';
function fail(message) { throw Object.assign(new Error(message), { status: 400, statusCode: 400 }); }
function restMinutes(value) {
    if (!['number', 'string'].includes(typeof value) || !/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value))) fail('加班休息時間須為 0 以上的整數分鐘。');
    return Number(value);
}
function calculateOvertimePeriod(startAt, endAt, body = {}, { rejectLegacyHoursMismatch = false } = {}) {
    if (!Number.isSafeInteger(startAt) || !Number.isSafeInteger(endAt) || endAt <= startAt || !Number.isSafeInteger(endAt - startAt)) fail('加班結束時間必須晚於有效的開始時間。');
    const camel = Object.hasOwn(body, 'breakMinutes'), snake = Object.hasOwn(body, 'break_minutes');
    const minutes = camel ? restMinutes(body.breakMinutes) : snake ? restMinutes(body.break_minutes) : 0;
    if (camel && snake && restMinutes(body.break_minutes) !== minutes) fail('加班休息分鐘欄位不一致。');
    const elapsed = endAt - startAt;
    if (minutes * 60000 >= elapsed) fail('加班休息分鐘須小於起訖總時間。');
    // Integer milliseconds avoid rounding a fractional minute up to another hundredth.
    const hours = Math.floor((elapsed - minutes * 60000) / 36000) / 100;
    if (!(hours > 0)) fail('扣除休息後須有大於 0 的加班時數。');
    if (rejectLegacyHoursMismatch && !camel && !snake && body.durationHours != null && body.durationHours !== '') {
        if (!['number', 'string'].includes(typeof body.durationHours) || !/^\d+(\.\d{1,2})?$/.test(String(body.durationHours)) || Number(body.durationHours) !== hours) {
            fail('加班時數計算方式已更新，請重新載入表單並填寫休息分鐘後再送出。');
        }
    }
    return { break_minutes: minutes, duration_hours: hours };
}
const DAY_MS = 86400000, TAIPEI_OFFSET = 8 * 3600000;
const lunchWindow = dayStart => ({ startAt: dayStart + 740 * 60000, endAt: dayStart + 780 * 60000 });

function resolveOvertimeBreakSource(startAt, endAt, breakMinutes, source) {
    if (source === undefined || source === null) return null;
    if (source === 'manual') return source;
    if (source !== 'automatic_lunch') fail('加班休息來源不正確。');
    const dayStart = Math.floor((startAt + TAIPEI_OFFSET) / DAY_MS) * DAY_MS - TAIPEI_OFFSET;
    let firstLunch = lunchWindow(dayStart);
    if (firstLunch.startAt < startAt) firstLunch = lunchWindow(dayStart + DAY_MS);
    const lunchCount = Math.max(0, Math.floor((endAt - firstLunch.endAt) / DAY_MS) + 1);
    if (!lunchCount || breakMinutes !== lunchCount * 40) fail('自動午休須符合完整涵蓋的台北時間 12:20–13:00。');
    return source;
}

module.exports = { calculateOvertimePeriod, resolveOvertimeBreakSource, lunchWindow };
