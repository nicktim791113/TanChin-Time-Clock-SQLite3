'use strict';

// Online requests share the same business field across self-service and proxy entry.
// Keep historical/paper records readable; validate only when a new online request is submitted.
function normalizeRequestReason(kind, value, { maxLength = Infinity } = {}) {
    const label = kind === 'leave' ? '請假事由' : '加班事由';
    const reason = typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
    const count = Array.from(reason.replace(/\s/gu, '')).length;
    if (count < 5) {
        throw Object.assign(new Error(count === 0
            ? `請填寫${label}（至少 5 個非空白字元）。`
            : `${label}至少需要 5 個非空白字元。`), { status: 400, statusCode: 400 });
    }
    return reason;
}

module.exports = { normalizeRequestReason };
