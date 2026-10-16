'use strict';

// Remote-punch review uses Taiwan calendar days, independent of the server timezone.
function recentTaipeiDateRange(now = Date.now()) {
    const day = new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const todayStart = Date.parse(`${day}T00:00:00+08:00`);
    const startAt = todayStart - 13 * 86400000;
    const endAt = todayStart + 86400000;
    return {
        startAt, endAt, days: 14, timeZone: 'Asia/Taipei',
        startDate: new Date(startAt + 8 * 3600000).toISOString().slice(0, 10),
        endDate: day
    };
}

function groupBrowserPunches(records) {
    const groups = new Map();
    for (const record of records) {
        const employeeId = String(record.employeeId || '');
        if (!groups.has(employeeId)) groups.set(employeeId, {
            employeeId, employeeName: record.employeeName, department: record.department,
            employeeMissing: record.employeeMissing, totalCount: 0, riskyCount: 0,
            inCount: 0, outCount: 0, activeDays: 0, deviceCount: 0,
            latestAt: 0, latestText: '', records: [], days: new Set(), devices: new Set()
        });
        const group = groups.get(employeeId);
        group.totalCount += 1;
        if (record.riskFlags.length) group.riskyCount += 1;
        if (record.type === 'in') group.inCount += 1;
        if (record.type === 'out') group.outCount += 1;
        group.days.add(new Date(record.timestamp + 8 * 3600000).toISOString().slice(0, 10));
        if (record.deviceId || record.deviceName) group.devices.add(record.deviceId || record.deviceName);
        if (record.timestamp > group.latestAt) {
            group.latestAt = record.timestamp;
            group.latestText = record.timestampText;
        }
        group.records.push(record);
    }
    return [...groups.values()].map(({ days, devices, ...group }) => ({
        ...group, activeDays: days.size, deviceCount: devices.size,
        records: group.records.sort((a, b) => b.timestamp - a.timestamp)
    })).sort((a, b) => b.latestAt - a.latestAt || a.employeeId.localeCompare(b.employeeId));
}

function confirmedDeviceClear(body, devices) {
    const employeeId = String(body?.employeeId || '').trim();
    if (body?.confirmed !== true || String(body?.confirmEmployeeId || '').trim() !== employeeId) {
        return { status: 400, error: '請確認解除範圍，並輸入相同工號後再送出。' };
    }
    const expected = body?.expectedDeviceIds;
    if (!Array.isArray(expected) || expected.some((id) => typeof id !== 'string')) {
        return { status: 400, error: '缺少已確認的裝置清單，請重新開啟解除確認。' };
    }
    const actualIds = devices.map((device) => device.device_id).sort();
    const expectedIds = [...new Set(expected)].sort();
    if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
        return { status: 409, error: '此員工的裝置清單已變更，請重新整理並確認解除範圍。' };
    }
    if (!actualIds.length) return { status: 409, error: '此員工目前沒有綁定裝置。' };
    return null;
}

module.exports = { recentTaipeiDateRange, groupBrowserPunches, confirmedDeviceClear };
