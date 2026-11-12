'use strict';

function overtimeDefaultBreakMinutes(startDate, startTime, endDate, endTime) {
    const day = 86400000;
    const taipeiOffset = 8 * 3600000;
    const parse = (date, time) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return NaN;
        const timestamp = Date.parse(`${date}T${time}:00Z`);
        return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date
            ? timestamp - taipeiOffset : NaN;
    };
    const start = parse(startDate, startTime), end = parse(endDate, endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
    const firstLunch = Math.ceil((start + taipeiOffset - (12 * 60 + 20) * 60000) / day);
    const lastLunch = Math.floor((end + taipeiOffset - 13 * 3600000) / day);
    return Math.max(0, lastLunch - firstLunch + 1) * 40;
}

function captureOvertimeTiming(form) {
    if (!form) return null;
    return {
        manual: form.dataset.overtimeBreakManual === 'true',
        values: Object.fromEntries(['startDate', 'startTime', 'endDate', 'endTime', 'breakMinutes']
            .map((name) => [name, form.elements.namedItem(name).value]))
    };
}

function overtimeBreakProvenance(manual, minutes) {
    if (manual) return 'manual';
    return Number(minutes) > 0 ? 'automatic_lunch' : null;
}

function restoreOvertimeTiming(form, draft) {
    if (!form || !draft) return;
    form.dataset.overtimeBreakManual = String(draft.manual);
    for (const [name, value] of Object.entries(draft.values)) form.elements.namedItem(name).value = value;
}
