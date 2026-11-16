'use strict';

const { createHash } = require('node:crypto');
const ONLINE_OVERTIME = new Set(['self_request', 'supervisor_proxy', 'supervisor_proxy_auto_approved']);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = (message, statusCode) => { throw Object.assign(new Error(message), { statusCode }); };

function createApprovedRequestVoidStore(sql, { getRecord, corrections, conditional, addAuditLog }) {
    sql.exec(`CREATE TABLE IF NOT EXISTS approved_request_voids (
      id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, request_id TEXT NOT NULL, actor_id TEXT NOT NULL,
      voided_at INTEGER NOT NULL, reason TEXT NOT NULL, before_json TEXT NOT NULL, after_json TEXT NOT NULL,
      UNIQUE(kind, request_id));
      CREATE TRIGGER IF NOT EXISTS approved_void_immutable_update BEFORE UPDATE ON approved_request_voids
      BEGIN SELECT RAISE(ABORT,'Void history is immutable'); END;
      CREATE TRIGGER IF NOT EXISTS approved_void_immutable_delete BEFORE DELETE ON approved_request_voids
      BEGIN SELECT RAISE(ABORT,'Void history is immutable'); END;`);
    function history(kind, id) {
        const row = sql.prepare('SELECT * FROM approved_request_voids WHERE kind=? AND request_id=?').get(kind, id);
        return row ? [{ id: row.id, actorId: row.actor_id, voidedAt: row.voided_at, reason: row.reason,
            before: JSON.parse(row.before_json), after: JSON.parse(row.after_json) }] : [];
    }
    function state(kind, id) {
        if (kind !== 'overtime') fail('不支援此類申請。', 400);
        if (typeof id !== 'string' || !id.trim() || id.length > 200) fail('請提供有效的申請單號。', 400);
        const row = getRecord(id);
        if (!row) fail('找不到指定的加班申請。', 404);
        const entries = history(kind, id);
        if (!ONLINE_OVERTIME.has(row.approval_mode) || !(row.status === 'approved' || row.status === 'cancelled' && entries.length)) {
            fail('只有已核准的本人或主管代辦線上加班可以作廢。', 403);
        }
        const steps = sql.prepare('SELECT * FROM overtime_approval_steps WHERE request_id=? ORDER BY id').all(id);
        const policy = sql.prepare("SELECT * FROM request_review_policies WHERE kind='overtime' AND request_id=?").all(id);
        const votes = sql.prepare("SELECT * FROM request_review_votes WHERE kind='overtime' AND request_id=? ORDER BY reviewer_id").all(id);
        const approvals = { steps, policy, votes };
        return { record: row, history: entries, approvals, revision: hash({ row, entries, approvals, corrections: corrections().history(kind, id) }) };
    }
    function voidRequest(kind, body, actorId, auditEntry) {
        return sql.transaction(() => {
            const current = state(kind, body?.requestId);
            if (current.record.status !== 'approved' || body.revision !== current.revision) {
                fail('加班申請已變更，請重新讀取後確認。', 409);
            }
            const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
            if (body.confirm !== true || !reason || reason.length > 500) fail('請確認作廢並填寫原因（最多 500 字）。', 400);
            const now = Date.now();
            const id = current.record.id;
            const result = sql.prepare("UPDATE overtime_requests SET status='cancelled',cancelled_at=?,updated_at=? WHERE id=? AND status='approved'")
                .run(now, now, id);
            if (result.changes !== 1) fail('加班申請已變更，請重新讀取。', 409);
            conditional().refreshRequest(id, auditEntry, { actorId });
            const before = { ...current.record, approvals: current.approvals };
            const after = { ...getRecord(id), approvals: current.approvals };
            sql.prepare('INSERT INTO approved_request_voids(kind,request_id,actor_id,voided_at,reason,before_json,after_json) VALUES(?,?,?,?,?,?,?)')
                .run(kind, id, actorId, now, reason, JSON.stringify(before), JSON.stringify(after));
            addAuditLog(auditEntry({
                action: 'approved_void', target_type: 'overtime_request', target_id: id,
                summary: '作廢已核准線上加班：' + reason, before_data: before, after_data: after
            }));
            return state(kind, id);
        })();
    }
    const summary = (kind, id) => {
        const row = sql.prepare('SELECT id,actor_id,voided_at,reason FROM approved_request_voids WHERE kind=? AND request_id=?').get(kind, id);
        return row ? { id: row.id, actorId: row.actor_id, voidedAt: row.voided_at, reason: row.reason } : null;
    };
    return { state, history, summary, voidRequest };
}

module.exports = { createApprovedRequestVoidStore };
