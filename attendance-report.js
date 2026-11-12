'use strict';

const DAY_MS = 86400000;
const TAIPEI_OFFSET = 8 * 3600000;
const taipeiDay = timestamp => Math.floor((timestamp + TAIPEI_OFFSET) / DAY_MS);
const rowKey = row => JSON.stringify([row.employeeId, row.timestamp]);

const DETAIL_CATEGORIES = new Set([
    'valid', 'abnormal', 'leave', 'overtime', 'duplicate', 'in', 'out',
    'missing_punch', 'pending_punch', 'raw_abnormal'
]);

function findUnpairedDays(punches, now, expectedEnd) {
    const employees = new Map();
    for (const punch of punches) {
        if (!Number.isFinite(punch.timestamp) || punch.timestamp > now ||
            !['in', 'out'].includes(punch.type) || punch.attendanceStatusText === '重複打卡') continue;
        if (!employees.has(punch.employeeId)) employees.set(punch.employeeId, []);
        employees.get(punch.employeeId).push(punch);
    }
    const flags = new Map();
    const today = taipeiDay(now);
    for (const rows of employees.values()) {
        rows.sort((a,b) => a.timestamp - b.timestamp);
        const days = new Map();
        let entry = null, entryEvidence = null;
        const addUnmatched = row => {
            const date = taipeiDay(row.timestamp);
            if (!days.has(date)) days.set(date, { in: [], out: [] });
            days.get(date)[row.type].push(row);
        };
        for (const row of rows) {
            if (row.type === 'in') {
                const sameDay = entry && taipeiDay(entry.timestamp) === taipeiDay(row.timestamp);
                if (entry && !sameDay) addUnmatched({ ...entry, representative: entryEvidence });
                // Consecutive entries on one date are one unresolved session.
                if (!sameDay || entryEvidence.attendanceStatusText === '正常' && row.attendanceStatusText !== '正常') {
                    entryEvidence = row;
                }
                entry = row;
            } else if (entry && row.timestamp > entry.timestamp && row.timestamp - entry.timestamp < DAY_MS) {
                entry = null;
            } else {
                if (entry) addUnmatched({ ...entry, representative: entryEvidence });
                addUnmatched(row);
                entry = null;
            }
        }
        if (entry) addUnmatched({ ...entry, representative: entryEvidence });
        for (const [date, day] of days) {
            const end = day.in.length ? expectedEnd?.(day.in.at(-1), date * DAY_MS - TAIPEI_OFFSET) : null;
            const waiting = end != null ? now <= end : date === today;
            const missingOut = day.in.length && !waiting;
            const group = missingOut ? day.in : day.out.length ? day.out : day.in;
            // Attach one daily finding to an existing row. Prefer a row already
            // abnormal to avoid counting the same evidence in both categories.
            const representatives = group.map(row => row.representative || row);
            const representative = representatives.find(row => row.attendanceStatusText !== '正常') || representatives[0];
            const flag = missingOut ? 'missing_out' : day.out.length ? 'missing_in' : 'awaiting_out';
            flags.set(rowKey(representative), flag);
        }
    }
    return flags;
}

function classifyAttendanceReport(records, contextPunches, now = Date.now(), expectedEnd) {
    const flags = findUnpairedDays(contextPunches, now, expectedEnd);
    return records.map(record => {
        const reportCategories = [];
        const attendanceFlags = [];
        if (record.recordKind === 'leave' || record.recordKind === 'overtime') {
            reportCategories.push(record.recordKind);
        } else if (record.recordKind === 'punch') {
            const flag = flags.get(rowKey(record));
            if (flag) attendanceFlags.push(flag);
            if (record.type === 'in' || record.type === 'out') reportCategories.push(record.type);
            if (record.attendanceStatusText === '重複打卡') {
                reportCategories.push('duplicate');
            } else {
                const rawAbnormal = record.attendanceStatusText !== '正常';
                const missing = flag === 'missing_in' || flag === 'missing_out';
                if (rawAbnormal) reportCategories.push('raw_abnormal');
                if (missing) reportCategories.push('missing_punch');
                if (flag === 'awaiting_out') reportCategories.push('pending_punch');
                if (rawAbnormal || missing) reportCategories.push('abnormal');
                else if (!flag) reportCategories.push('valid');
            }
        }
        return { ...record, reportCategories, attendanceFlags };
    });
}

module.exports = { classifyAttendanceReport, DETAIL_CATEGORIES, DAY_MS };
