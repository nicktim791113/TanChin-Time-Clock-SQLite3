'use strict';

const crypto = require('node:crypto');
const error = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const deviceVersion = (row) => hash(JSON.stringify([row.employee_id, row.device_id, row.device_token_hash, row.created_at]));

function createDeviceRecoveryStore(db, audit) {
    db.exec(`CREATE TABLE IF NOT EXISTS device_recovery_requests (
      id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, proof_hash TEXT NOT NULL,
      auth_signature TEXT NOT NULL, device_json TEXT NOT NULL, snapshot_json TEXT NOT NULL,
      reason TEXT NOT NULL, requested_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
      status TEXT NOT NULL, decision_reason TEXT, decided_by TEXT, decided_at INTEGER,
      old_device_id TEXT, old_device_version TEXT, completed_at INTEGER
    ); CREATE INDEX IF NOT EXISTS device_recovery_employee ON device_recovery_requests(employee_id, requested_at);`);
    // Response secrets live only in this process. A restart requires a fresh approved request.
    db.prepare("UPDATE device_recovery_requests SET status = 'expired' WHERE status IN ('pending', 'approved')").run();
    const get = (id) => db.prepare('SELECT * FROM device_recovery_requests WHERE id = ?').get(id);
    function expire(now = Date.now()) {
        db.prepare("UPDATE device_recovery_requests SET status = 'expired' WHERE expires_at <= ? AND status IN ('pending', 'approved')").run(now);
    }
    function create(data, auditEntry) {
        return db.transaction(() => {
            expire(data.requestedAt);
            const count = db.prepare('SELECT COUNT(*) n FROM device_recovery_requests WHERE employee_id = ? AND requested_at > ?')
                .get(data.employeeId, data.requestedAt - 3600000).n;
            const active = db.prepare("SELECT COUNT(*) n FROM device_recovery_requests WHERE employee_id = ? AND status IN ('pending','approved')").get(data.employeeId).n;
            if (count >= 8 || active >= 3) throw error('恢復申請過於頻繁，請等待既有申請處理或稍後再試。', 429);
            db.prepare(`INSERT INTO device_recovery_requests
                (id,employee_id,proof_hash,auth_signature,device_json,snapshot_json,reason,requested_at,expires_at,status)
                VALUES (?,?,?,?,?,?,?,?,?,'pending')`).run(data.id, data.employeeId, data.proofHash, data.authSignature,
                JSON.stringify(data.device), JSON.stringify(data.snapshot), data.reason, data.requestedAt, data.expiresAt);
            audit(auditEntry);
            return get(data.id);
        })();
    }
    function authorize(id, token) {
        expire();
        const row = get(id);
        if (!row || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)
            || !crypto.timingSafeEqual(Buffer.from(row.proof_hash, 'hex'), Buffer.from(hash(token), 'hex'))) {
            throw error('恢復申請憑證無效，請重新提出申請。', 403);
        }
        return row;
    }
    function decide(id, status, decision, auditEntry) {
        return db.transaction(() => {
            expire();
            const row = get(id);
            if (!row || row.status !== 'pending') throw error('申請已處理或過期，請重新整理。');
            if (status === 'approved') {
                const old = db.prepare('SELECT * FROM employee_devices WHERE employee_id = ? AND device_id = ?').get(row.employee_id, decision.oldDeviceId);
                const expected = JSON.parse(row.snapshot_json).find((item) => item.deviceId === decision.oldDeviceId)?.version;
                if (!old || !expected || deviceVersion(old) !== expected) throw error('原裝置綁定已變更，請重新提出申請。');
                const device = JSON.parse(row.device_json);
                const conflict = db.prepare('SELECT device_id FROM employee_devices WHERE employee_id = ? AND device_id = ?').get(row.employee_id, device.deviceId);
                if (conflict && conflict.device_id !== old.device_id) throw error('新的瀏覽器識別對應另一個綁定，請選擇正確原裝置或重新提出申請。');
                decision.oldVersion = expected;
            }
            db.prepare(`UPDATE device_recovery_requests SET status=?,decision_reason=?,decided_by=?,decided_at=?,old_device_id=?,old_device_version=? WHERE id=?`)
                .run(status, decision.reason, decision.actorId, Date.now(), decision.oldDeviceId || null, decision.oldVersion || null, id);
            audit(auditEntry);
            return get(id);
        })();
    }
    function complete(id, makeReplacement, auditEntry) {
        return db.transaction(() => {
            expire();
            const row = get(id);
            if (!row || row.status !== 'approved') throw error('申請尚未核准、已完成或已過期，請確認狀態。');
            const old = db.prepare('SELECT * FROM employee_devices WHERE employee_id = ? AND device_id = ?').get(row.employee_id, row.old_device_id);
            if (!old || deviceVersion(old) !== row.old_device_version) throw error('核准後原裝置綁定已變更，請重新提出申請。');
            const desired = JSON.parse(row.device_json);
            const conflict = db.prepare('SELECT device_id FROM employee_devices WHERE employee_id=? AND device_id=?').get(row.employee_id, desired.deviceId);
            if (conflict && conflict.device_id !== old.device_id) throw error('新的瀏覽器識別已有綁定，請重新提出申請。');
            const count = db.prepare('SELECT COUNT(*) n FROM employee_devices WHERE employee_id=?').get(row.employee_id).n;
            const replacement = makeReplacement(row, old, count);
            db.prepare('DELETE FROM employee_devices WHERE employee_id=? AND device_id=?').run(row.employee_id, old.device_id);
            db.prepare(`INSERT INTO employee_devices (employee_id,device_id,device_name,device_token_hash,platform,user_agent,created_at,last_seen_at,last_ip,status)
                VALUES (@employee_id,@device_id,@device_name,@device_token_hash,@platform,@user_agent,@created_at,@last_seen_at,@last_ip,'active')`).run(replacement);
            db.prepare("UPDATE device_recovery_requests SET status='completed',completed_at=? WHERE id=?").run(Date.now(), id);
            audit(auditEntry(row, old, replacement, count));
            return { row: get(id), replacement, count };
        })();
    }
    return { create, authorize, decide, complete, get, list(employeeId = '') {
        expire();
        return employeeId
            ? db.prepare('SELECT * FROM device_recovery_requests WHERE employee_id=? ORDER BY requested_at DESC LIMIT 200').all(employeeId)
            : db.prepare("SELECT * FROM device_recovery_requests ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, requested_at DESC LIMIT 200").all();
    } };
}

module.exports = { createDeviceRecoveryStore, deviceVersion };
