'use strict';

const crypto = require('node:crypto');
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

function tokenCandidates(info = {}) {
    return [...new Set([info.deviceToken, ...(Array.isArray(info.deviceTokenCandidates) ? info.deviceTokenCandidates.slice(0, 3) : [])]
        .filter((value) => typeof value === 'string' && value.trim() && value.trim().length <= 256)
        .map((value) => value.trim()))].slice(0, 3);
}

// A device ID or matching network metadata is never an authentication proof.
function verifyDeviceProof(devices, info) {
    const candidates = tokenCandidates(info);
    const matches = [];
    for (const token of candidates) {
        for (const device of devices) if (device.device_token_hash && device.device_token_hash === hash(token)) matches.push({ device, token });
    }
    const unique = new Map(matches.map((entry) => [entry.device.device_id, entry]));
    if (unique.size > 1) return { verification: 'ambiguous', candidateCount: candidates.length };
    if (unique.size === 1) return { ...unique.values().next().value, verification: 'verified', candidateCount: candidates.length };
    return { verification: candidates.length ? 'invalid' : 'missing', candidateCount: candidates.length };
}

module.exports = { tokenCandidates, verifyDeviceProof };
