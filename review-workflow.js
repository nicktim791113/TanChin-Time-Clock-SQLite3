function fail(message, statusCode = 400) { throw Object.assign(new Error(message), { statusCode }); }
function createReviewWorkflow(sql) {
    sql.exec(`CREATE TABLE IF NOT EXISTS request_review_policies (kind TEXT NOT NULL, request_id TEXT NOT NULL, mode TEXT NOT NULL, PRIMARY KEY(kind, request_id));
        CREATE TABLE IF NOT EXISTS request_review_votes (kind TEXT NOT NULL, request_id TEXT NOT NULL, reviewer_id TEXT NOT NULL, required INTEGER NOT NULL,
            decision TEXT NOT NULL DEFAULT 'pending', comment TEXT, decided_at INTEGER, revoked INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(kind, request_id, reviewer_id));
        CREATE INDEX IF NOT EXISTS request_review_pending ON request_review_votes(kind, reviewer_id, decision, revoked);
        CREATE TABLE IF NOT EXISTS request_review_epochs (employee_id TEXT PRIMARY KEY, after_at INTEGER NOT NULL);`);
    const state = (kind, requestId) => {
        const policy = sql.prepare('SELECT mode FROM request_review_policies WHERE kind = ? AND request_id = ?').get(kind, requestId);
        return policy ? { ...policy, reviewers: sql.prepare('SELECT reviewer_id AS id, required, decision, comment, decided_at AS decidedAt, revoked FROM request_review_votes WHERE kind = ? AND request_id = ? ORDER BY reviewer_id').all(kind, requestId) } : null;
    };
    const snapshot = (kind, row, policy) => {
        if (!policy) return;
        const ids = policy.supervisorIds, required = policy.requiredSupervisorIds;
        const staff = new Set(sql.prepare('SELECT id FROM employees').all().map((e) => e.id));
        if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length || !Array.isArray(required) || ids.some((id) => !staff.has(id) || id === row.employee_id) ||
            !['any', 'required'].includes(policy.mode) || (policy.mode === 'required' && (!required.length || required.some((id) => !ids.includes(id))))) fail('審核主管設定不完整，請聯絡管理者重新指定。');
        sql.prepare('INSERT INTO request_review_policies VALUES (?, ?, ?)').run(kind, row.id, policy.mode);
        const insert = sql.prepare('INSERT INTO request_review_votes (kind, request_id, reviewer_id, required) VALUES (?, ?, ?, ?)');
        ids.forEach((id) => insert.run(kind, row.id, id, Number(required.includes(id))));
    };
    const filter = (kind, actorId) => {
        const table = kind === 'leave' ? 'leave_requests' : 'overtime_requests';
        return { sql: `(${table}.employee_id <> ? AND ((EXISTS (SELECT 1 FROM request_review_votes v WHERE v.kind = ? AND v.request_id = ${table}.id AND v.reviewer_id = ? AND v.decision = 'pending' AND v.revoked = 0)) OR
            (NOT EXISTS (SELECT 1 FROM request_review_policies p WHERE p.kind = ? AND p.request_id = ${table}.id) AND ${table}.supervisor_id = ? AND ${table}.created_at > COALESCE((SELECT after_at FROM request_review_epochs WHERE employee_id = ?), -1))))`,
            params: [actorId, kind, actorId, kind, actorId, actorId] };
    };
    const canReview = (kind, row, actorId) => {
        if (row.status !== 'pending_supervisor' || row.employee_id === actorId) return false;
        const policy = state(kind, row.id);
        if (policy) return policy.reviewers.some((r) => r.id === actorId && !r.revoked && r.decision === 'pending');
        return row.supervisor_id === actorId && row.created_at > (sql.prepare('SELECT after_at FROM request_review_epochs WHERE employee_id = ?').get(actorId)?.after_at ?? -1);
    };
    const vote = (kind, row, actorId, decision, comment, now) => {
        if (!['approved', 'rejected'].includes(decision)) fail('審核結果不正確。');
        if (!canReview(kind, row, actorId)) fail('已審核、案件狀態已變更或沒有此案件的審核權限。', 409);
        const policy = state(kind, row.id); if (!policy) return decision;
        const changed = sql.prepare("UPDATE request_review_votes SET decision = ?, comment = ?, decided_at = ? WHERE kind = ? AND request_id = ? AND reviewer_id = ? AND decision = 'pending' AND revoked = 0").run(decision, comment || '', now, kind, row.id, actorId);
        if (changed.changes !== 1) fail('審核結果已變更，請重新整理。', 409);
        const after = state(kind, row.id);
        if (after.reviewers.some((r) => r.decision === 'rejected')) return 'rejected';
        const complete = policy.mode === 'any' ? after.reviewers.some((r) => r.decision === 'approved') : after.reviewers.filter((r) => r.required).every((r) => !r.revoked && r.decision === 'approved');
        return complete ? 'approved' : 'pending';
    };
    const removeEmployees = (ids) => ids.forEach((id) => {
        sql.prepare('UPDATE request_review_votes SET revoked = 1 WHERE reviewer_id = ?').run(id);
        sql.prepare('INSERT OR REPLACE INTO request_review_epochs VALUES (?, ?)').run(id, Date.now());
    });
    return { state, snapshot, filter, canReview, vote, removeEmployees };
}
module.exports = { createReviewWorkflow };
