'use strict';

const { createHash, randomUUID } = require('node:crypto');
const kinds = ['leave', 'overtime'];
const actions = ['correction', 'void'];
const onlineModes = { leave:['employee_request','supervisor_proxy'], overtime:['self_request','supervisor_proxy','supervisor_proxy_auto_approved'] };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const text = (value, label, max) => {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(`請填寫${label}（最多 ${max} 字）。`);
    return value.trim();
};
function editableValues(kind, row) {
    const common = [row.start_at, row.end_at, row.duration_hours, row.reason];
    if (kind === 'overtime') return [...common, row.break_minutes];
    return [...common, row.leave_type_id, row.date_selection_mode, row.accountingDailyHours,
        (row.leave_segments || []).map(({ date, startAt, endAt, hours, breakMinutes }) =>
            [date, startAt, endAt, hours, breakMinutes])];
}

function createApprovedChangeStore(sql, { getRecord, corrections, voids, supervisors, reviewSupervisors, addAuditLog }) {
    sql.exec(`CREATE TABLE IF NOT EXISTS approved_change_requests (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL, request_id TEXT NOT NULL, action TEXT NOT NULL,
        employee_id TEXT NOT NULL, proposer_id TEXT NOT NULL, proposed_at INTEGER NOT NULL,
        reason TEXT NOT NULL, proposal TEXT NOT NULL, original_revision TEXT NOT NULL, status TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS approved_change_one_pending ON approved_change_requests(kind,request_id) WHERE status='pending';
      CREATE INDEX IF NOT EXISTS approved_change_proposer ON approved_change_requests(proposer_id,proposed_at);
      CREATE INDEX IF NOT EXISTS approved_change_leave_proxy ON leave_requests(applicant_id) WHERE applicant_role='supervisor_proxy';
      CREATE INDEX IF NOT EXISTS approved_change_leave_reviewer ON leave_approval_steps(reviewer_id,request_id) WHERE reviewer_role='supervisor' AND status='approved';
      CREATE INDEX IF NOT EXISTS approved_change_overtime_reviewer ON overtime_approval_steps(reviewer_id,request_id) WHERE reviewer_role='supervisor' AND status='approved';
      CREATE TABLE IF NOT EXISTS approved_change_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, change_id TEXT NOT NULL REFERENCES approved_change_requests(id),
        action TEXT NOT NULL, actor_id TEXT NOT NULL, occurred_at INTEGER NOT NULL, reason TEXT NOT NULL,
        before_json TEXT NOT NULL, after_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS approved_change_events_case ON approved_change_events(change_id,id);
      CREATE TRIGGER IF NOT EXISTS approved_change_events_immutable_update BEFORE UPDATE ON approved_change_events
      BEGIN SELECT RAISE(ABORT,'Change history is immutable'); END;
      CREATE TRIGGER IF NOT EXISTS approved_change_events_immutable_delete BEFORE DELETE ON approved_change_events
      BEGIN SELECT RAISE(ABORT,'Change history is immutable'); END;`);
    const epoch = actorId => sql.prepare('SELECT after_at FROM request_review_epochs WHERE employee_id=?').get(actorId)?.after_at ?? -1;
    const exists = id => Boolean(sql.prepare('SELECT 1 FROM employees WHERE id=?').get(id));
    const historical = kind => `(r.applicant_id=@actorId AND r.applicant_role='supervisor_proxy'
        OR EXISTS(SELECT 1 FROM ${kind}_approval_steps WHERE request_id=r.id AND reviewer_role='supervisor' AND reviewer_id=@actorId AND status='approved')
        OR EXISTS(SELECT 1 FROM request_review_votes WHERE kind='${kind}' AND request_id=r.id AND reviewer_id=@actorId AND decision='approved' AND revoked=0))`;
    function hasRelationship(kind, row, actorId) {
        if (!kinds.includes(kind) || !row || !actorId || actorId === row.employee_id || !exists(actorId) || !exists(row.employee_id)) return false;
        if (row.created_at <= epoch(row.employee_id)) return false;
        if (supervisors().isAssigned(actorId, row.employee_id) || reviewSupervisors().policy(row.employee_id).supervisorIds.includes(actorId)) return true;
        if (row.created_at <= Math.max(epoch(actorId), epoch(row.employee_id))) return false;
        if (row.applicant_id === actorId && row.applicant_role === 'supervisor_proxy') return true;
        return Boolean(sql.prepare(`SELECT 1 FROM ${kind}_requests r WHERE r.id=@requestId AND ${historical(kind)}`)
            .get({ actorId,requestId:row.id }));
    }
    const canEnterReview = actorId => exists(actorId) && (
        supervisors().assignedEmployees(actorId).length > 0 ||
        Boolean(sql.prepare('SELECT 1 FROM approved_change_requests WHERE proposer_id=? AND proposed_at>? LIMIT 1').get(actorId,epoch(actorId))) ||
        kinds.some(kind => Boolean(sql.prepare(`WITH related(id) AS (
            SELECT id FROM ${kind}_requests WHERE applicant_id=@actorId AND applicant_role='supervisor_proxy'
            UNION ALL SELECT request_id FROM ${kind}_approval_steps WHERE reviewer_role='supervisor' AND status='approved' AND reviewer_id=@actorId
            UNION ALL SELECT request_id FROM request_review_votes WHERE kind='${kind}' AND reviewer_id=@actorId AND decision='approved' AND revoked=0
          )
          SELECT 1 FROM related JOIN ${kind}_requests r ON r.id=related.id JOIN employees e ON e.id=r.employee_id
            LEFT JOIN request_review_epochs target ON target.employee_id=r.employee_id
            WHERE r.employee_id<>@actorId AND r.status<>'pending_supervisor' AND r.created_at>@epoch AND r.created_at>COALESCE(target.after_at,-1) LIMIT 1`)
            .get({ actorId,epoch:epoch(actorId) })))
    );
    const canPropose = (kind, row, actorId) => row?.status === 'approved' &&
        Boolean(Object.hasOwn(onlineModes,kind) && onlineModes[kind].includes(row.approval_mode) && hasRelationship(kind,row,actorId));
    function original(kind, requestId, action) {
        if (!kinds.includes(kind) || !actions.includes(action) || typeof requestId !== 'string' || !requestId.trim() || requestId.length > 200) fail('申請類別或單號無效。');
        const current = (action === 'void' ? voids() : corrections()).state(kind, requestId);
        if (current.record.status !== 'approved') fail('目前僅可對已核准線上申請提出異動。', 409);
        return current;
    }
    function preview(kind, requestId, actorId) {
        if (!kinds.includes(kind) || typeof requestId !== 'string' || !requestId.trim() || requestId.length > 200) fail('申請類別或單號無效。');
        if (!canPropose(kind, getRecord(kind, requestId), actorId)) fail('無權提出這筆申請的異動需求。', 403);
        const correction = original(kind, requestId, 'correction');
        const voiding = original(kind, requestId, 'void');
        const pending = sql.prepare("SELECT * FROM approved_change_requests WHERE kind=? AND request_id=? AND status='pending'").get(kind, requestId);
        return { record: correction.record, revisions: { correction: correction.revision, void: voiding.revision },
            pending: pending ? pending.proposer_id === actorId && pending.proposed_at > epoch(actorId) ? dto(pending) : { status:'pending' } : null,
            canRequest: !pending };
    }
    const getRow = id => {
        if (typeof id !== 'string' || !id.length || id.length > 200) fail('異動需求單號無效。');
        const row = sql.prepare('SELECT * FROM approved_change_requests WHERE id=?').get(id);
        if (!row) fail('找不到異動需求。', 404);
        return row;
    };
    const events = id => sql.prepare('SELECT * FROM approved_change_events WHERE change_id=? ORDER BY id').all(id)
        .map(row => ({ id:row.id, action:row.action, actorId:row.actor_id, occurredAt:row.occurred_at, reason:row.reason,
            before:JSON.parse(row.before_json), after:JSON.parse(row.after_json) }));
    const name = id => id ? sql.prepare('SELECT name FROM employees WHERE id=?').get(id)?.name || '' : '';
    const dto = row => {
        const history = events(row.id);
        const handlerId = history.length > 1 ? history.at(-1).actorId : null;
        return { id:row.id, kind:row.kind, requestId:row.request_id, action:row.action, employeeId:row.employee_id, employeeName:name(row.employee_id),
            proposerId:row.proposer_id, proposedAt:row.proposed_at, reason:row.reason, proposal:row.proposal, status:row.status,
            proposerName:name(row.proposer_id), handlerId, handlerName:name(handlerId), handledAt:handlerId ? history.at(-1).occurredAt : null,
            record:history[0]?.before, revision:hash([row.id, row.status, history.at(-1)?.id]), history };
    };
    function event(id, action, actorId, reason, before, after, auditEntry, now = Date.now()) {
        sql.prepare('INSERT INTO approved_change_events(change_id,action,actor_id,occurred_at,reason,before_json,after_json) VALUES(?,?,?,?,?,?,?)')
            .run(id, action, actorId, now, reason, JSON.stringify(before), JSON.stringify(after));
        addAuditLog(auditEntry({ action:'approved_change_' + action, target_type:'approved_change_request', target_id:id,
            summary:reason, before_data:before, after_data:after }));
    }
    const submit = (body, actorId, auditEntry) => sql.transaction(() => {
        const { kind, requestId, action } = body;
        if (body.confirm !== true) fail('請確認提出異動需求。');
        if (!actions.includes(action)) fail('請選擇更正或作廢。');
        const current = preview(kind, requestId, actorId);
        if (current.revisions[action] !== body.revision) fail('原申請已變更，請重新確認。', 409);
        if (!current.canRequest) fail('這筆原申請已有待處理的異動需求。', 409);
        const reason = text(body.reason, '提出原因', 500);
        const proposal = action === 'correction' ? text(body.proposal, '擬修改內容', 2000) : '';
        const id = randomUUID();
        const now = Date.now();
        sql.prepare(`INSERT INTO approved_change_requests(id,kind,request_id,action,employee_id,proposer_id,proposed_at,reason,proposal,original_revision,status)
            VALUES(?,?,?,?,?,?,?,?,?,?,'pending')`).run(id, kind, requestId, action, current.record.employee_id, actorId, now, reason, proposal, body.revision);
        event(id, 'submitted', actorId, reason, current.record, { kind,requestId,action,proposal,status:'pending' }, auditEntry, now);
        return dto(getRow(id));
    })();
    const adminDto = (row, canManage) => {
        const canAct = row.status === 'pending' && canManage(row.kind,row.action);
        let readyToComplete = false;
        if (row.status === 'pending') {
            try { readyToComplete = original(row.kind,row.request_id,row.action).revision === row.original_revision; }
            catch (error) { if (![403,404,409].includes(error.statusCode)) throw error; }
        }
        return { ...dto(row), currentRecord:getRecord(row.kind,row.request_id) || null, canManage:canAct, readyToComplete };
    };
    const list = (scope, scopeParams, filters, format) => {
        const pageSize = 15;
        const { status, query, page } = filters;
        const clauses = [scope], params = [...scopeParams];
        if (status) {
            if (!['pending','returned','closed','completed'].includes(status)) fail('異動需求狀態無效。');
            clauses.push('status=?');
            params.push(status);
        }
        if (query) {
            clauses.push(`(instr(lower(employee_id),?)>0 OR instr(lower(proposer_id),?)>0 OR instr(lower(reason),?)>0
                OR EXISTS(SELECT 1 FROM employees e WHERE e.id IN (employee_id,proposer_id) AND instr(lower(e.name),?)>0))`);
            params.push(...Array(4).fill(text(query,'搜尋文字',200).toLowerCase()));
        }
        const where = clauses.join(' AND ');
        const total = sql.prepare(`SELECT COUNT(*) AS n FROM approved_change_requests WHERE ${where}`).get(...params).n;
        const pendingTotalCount = sql.prepare(`SELECT COUNT(*) AS n FROM approved_change_requests WHERE (${scope}) AND status='pending'`).get(...scopeParams).n;
        const summary = { total, pendingTotalCount };
        const totalPages = Math.max(1,Math.ceil(summary.total / pageSize));
        const currentPage = Math.min(totalPages,Math.max(1,Number.isSafeInteger(page) ? page : 1));
        const requests = sql.prepare(`SELECT * FROM approved_change_requests WHERE ${where} ORDER BY proposed_at DESC,id DESC LIMIT ? OFFSET ?`)
            .all(...params,pageSize,(currentPage - 1) * pageSize).map(format);
        return { requests, summary, pagination:{ page:currentPage, pageSize, totalPages, total:summary.total } };
    };
    const listOwn = (actorId,filters) => {
        const { kind } = filters;
        if (kind !== undefined && !kinds.includes(kind)) fail('申請類別無效。');
        const params = [actorId,epoch(actorId)];
        if (kind) params.push(kind);
        return list('proposer_id=? AND proposed_at>?' + (kind ? ' AND kind=?' : ''),params,filters,dto);
    };
    const ownDetail = (id, actorId, kind) => {
        const row = getRow(id);
        if (row.proposer_id !== actorId || row.proposed_at <= epoch(actorId) || (kind !== undefined && row.kind !== kind)) {
            fail('找不到異動需求。',404);
        }
        return dto(row);
    };
    const listAdmin = (kind,filters,canManage) => list('kind=?',[kind],filters,row => adminDto(row,canManage));
    const pendingCount = kind => sql.prepare("SELECT COUNT(*) AS n FROM approved_change_requests WHERE kind=? AND status='pending'").get(kind).n;
    const adminDetail = (id, canView, canManage) => {
        const row = getRow(id);
        if (!canView(row.kind)) fail('沒有查看這類異動需求的權限。',403);
        return adminDto(row,canManage);
    };
    const resolve = (body, actorId, canManage, auditEntry) => sql.transaction(() => {
        const row = getRow(body.id);
        if (!canManage(row.kind, row.action)) fail('沒有處理這類異動需求的權限。', 403);
        if (row.status !== 'pending' || dto(row).revision !== body.revision) fail('異動需求已變更，請重新讀取。', 409);
        if (body.confirm !== true) fail('請確認處理異動需求。');
        if (!['return','close'].includes(body.decision)) fail('請選擇退回或結案。');
        const reason = text(body.reason, '處理原因', 500);
        const status = body.decision === 'return' ? 'returned' : 'closed';
        sql.prepare('UPDATE approved_change_requests SET status=? WHERE id=?').run(status, row.id);
        const record = getRecord(row.kind, row.request_id) || null;
        event(row.id, status, actorId, reason, { status:row.status, record }, { status, record }, auditEntry);
        return dto(getRow(row.id));
    })();
    const complete = (id, kind, requestId, action, actorId, reason, auditEntry, mutate) => sql.transaction(() => {
        if (id === undefined) return mutate();
        const row = getRow(id);
        if (row.kind !== kind || row.request_id !== requestId || row.action !== action) fail('異動需求與本次操作不符。', 409);
        if (row.status !== 'pending') fail('異動需求已處理。', 409);
        let current;
        try { current = original(kind, requestId, action); }
        catch (error) {
            if ([403,404,409].includes(error.statusCode)) fail('原申請已變更，請重新檢視異動需求。', 409);
            throw error;
        }
        if (current.revision !== row.original_revision) fail('原申請已變更，請重新檢視異動需求。', 409);
        const value = mutate();
        if (action === 'correction' && hash(editableValues(kind,current.record)) === hash(editableValues(kind,value.record))) {
            fail('原申請未有實質修改，異動需求仍待處理。', 409);
        }
        sql.prepare("UPDATE approved_change_requests SET status='completed' WHERE id=?").run(id);
        event(id, 'completed', actorId, reason.trim(), current.record, value.record, auditEntry);
        return { ...value, completedChange: dto(getRow(id)) };
    })();
    return { preview, submit, listOwn, ownDetail, listAdmin, pendingCount, adminDetail, resolve, complete, canPropose, hasRelationship, canEnterReview };
}

module.exports = { createApprovedChangeStore };
