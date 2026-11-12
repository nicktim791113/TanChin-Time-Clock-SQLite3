const crypto = require('node:crypto');
const { calculateOvertimePeriod } = require('./overtime-duration');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };

function createApprovedCorrectionStore(sql, dependencies) {
    const { getRecord, normalizeLeave, replaceSegments, entitlements, annual, audit } = dependencies;
    sql.exec(`CREATE TABLE IF NOT EXISTS approved_request_corrections (
      id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, request_id TEXT NOT NULL,
      actor_id TEXT NOT NULL, corrected_at INTEGER NOT NULL, reason TEXT NOT NULL,
      before_json TEXT NOT NULL, after_json TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS approved_request_corrections_request ON approved_request_corrections(kind,request_id,id);
      CREATE TRIGGER IF NOT EXISTS approved_correction_immutable_update BEFORE UPDATE ON approved_request_corrections BEGIN SELECT RAISE(ABORT,'Correction history is immutable'); END;
      CREATE TRIGGER IF NOT EXISTS approved_correction_immutable_delete BEFORE DELETE ON approved_request_corrections BEGIN SELECT RAISE(ABORT,'Correction history is immutable'); END;`);
    const history = (kind, id) => sql.prepare('SELECT * FROM approved_request_corrections WHERE kind=? AND request_id=? ORDER BY id').all(kind, id)
        .map(row => ({ id: row.id, actorId: row.actor_id, correctedAt: row.corrected_at, reason: row.reason, before: JSON.parse(row.before_json), after: JSON.parse(row.after_json) }));
    const record = (kind, id) => {
        if (!['leave', 'overtime'].includes(kind)) fail('無效的申請類別。');
        const row = getRecord(kind, id);
        if (!row) fail('找不到申請。', 404);
        const onlineModes = kind === 'leave' ? ['employee_request','supervisor_proxy'] : ['self_request','supervisor_proxy','supervisor_proxy_auto_approved'];
        if (row.status !== 'approved' || !onlineModes.includes(row.approval_mode)) fail('只能修正已核准的線上申請。', 403);
        return row;
    };
    const state = (kind, id) => {
        const row = record(kind, id), entries = history(kind, id);
        const charges = kind === 'leave' ? entitlements().charges(id) : [];
        const steps = sql.prepare(`SELECT * FROM ${kind}_approval_steps WHERE request_id=? ORDER BY id`).all(id);
        const policy = sql.prepare('SELECT * FROM request_review_policies WHERE kind=? AND request_id=?').all(kind,id);
        const votes = sql.prepare('SELECT * FROM request_review_votes WHERE kind=? AND request_id=? ORDER BY reviewer_id').all(kind,id);
        return { record: kind === 'leave' ? { ...row, accountingDailyHours: charges } : row, history: entries, revision: hash({ row, charges, entries, steps, policy, votes }) };
    };
    const closedUsage = (employeeId, oldType, newType) => {
        const closed = sql.prepare(`SELECT c.allocation_id FROM annual_leave_year_closures c JOIN annual_leave_accounts a ON a.id=c.account_id
          WHERE a.employee_id=? AND a.leave_type_id IN (?,?)`).all(employeeId,oldType,newType);
        const ids = new Set(closed.map(row => row.allocation_id));
        if (!ids.size) return [];
        // Compare every request drawing on a closed source, including indirect
        // reallocations caused by this correction. Unclosed carry is independent.
        return sql.prepare(`SELECT s.* FROM annual_leave_charge_state s JOIN annual_leave_accounts a ON a.id=s.account_id
          WHERE a.employee_id=? AND a.leave_type_id IN (?,?)`).all(employeeId,oldType,newType)
            .flatMap(row => JSON.parse(row.data_json).filter(item => ids.has(item.allocationId)).map(item => JSON.stringify({
                accountId:row.account_id,requestId:row.request_id,allocationId:item.allocationId,date:item.date,status:item.status,amount:item.amount
            }))).sort();
    };
    const correct = (kind, body, updates, actorId, auditEntry) => sql.transaction(() => {
        const current = state(kind, body.requestId);
        const allowed = new Set(kind === 'leave' ? ['leave_type_id','start_at','end_at','duration_hours','date_selection_mode','daily_hours','leave_segments','explicit_duration_hours','reason'] : ['start_at','end_at','duration_hours','break_minutes','reason']);
        if (Object.keys(updates).some(key => !allowed.has(key))) fail('包含不可修正的申請欄位。');
        if (body.revision !== current.revision) fail('申請已變更，請重新讀取後確認。', 409);
        if (body.confirm !== true || typeof body.correctionReason !== 'string' || !body.correctionReason.trim() || body.correctionReason.trim().length > 500) fail('請確認修正並填寫原因（最多 500 字）。');
        let next = { ...current.record, ...updates, updated_at: Date.now() };
        if (kind === 'leave') {
            next = normalizeLeave(next, current.record);
            const accountingChanged = ['leave_type_id','start_at','end_at','duration_hours','date_selection_mode'].some(key => next[key] !== current.record[key]) ||
                (updates.daily_hours != null && JSON.stringify(updates.daily_hours) !== JSON.stringify(current.record.daily_hours)) || JSON.stringify(next.leave_segments) !== JSON.stringify(current.record.leave_segments);
            const closedBefore = accountingChanged ? closedUsage(next.employee_id,current.record.leave_type_id,next.leave_type_id) : null;
            if (accountingChanged) {
                entitlements().replaceCharges(next.id, entitlements().allocation(next, updates.daily_hours, updates.explicit_duration_hours ?? next.duration_hours));
            }
            sql.prepare('UPDATE leave_requests SET leave_type_id=?,start_at=?,end_at=?,duration_hours=?,date_selection_mode=?,reason=?,updated_at=? WHERE id=?').run(next.leave_type_id,next.start_at,next.end_at,next.duration_hours,next.date_selection_mode,next.reason,next.updated_at,next.id);
            replaceSegments(next);
            if (accountingChanged) {
                annual().reconcile();
                if (hash(closedBefore) !== hash(closedUsage(next.employee_id,current.record.leave_type_id,next.leave_type_id))) fail('修正會改變已有結算來源的扣抵，請先核對結算資料。',409);
            }
        } else {
            if (next.break_minutes != null) {
                const calculated = calculateOvertimePeriod(next.start_at,next.end_at,{breakMinutes:next.break_minutes});
                if (calculated.duration_hours !== next.duration_hours) fail('加班淨時數與起訖扣除休息後的計算不一致。');
            } else if (next.start_at !== current.record.start_at || next.end_at !== current.record.end_at || next.duration_hours !== current.record.duration_hours) fail('舊加班修正時間須明確記錄休息分鐘。');
            const original = current.record;
            const timingChanged = next.start_at !== original.start_at || next.end_at !== original.end_at || next.break_minutes !== original.break_minutes;
            const breakSource = timingChanged ? null : original.break_source;
            sql.prepare('UPDATE overtime_requests SET start_at=?,end_at=?,duration_hours=?,break_minutes=?,break_source=?,reason=?,updated_at=? WHERE id=?').run(next.start_at,next.end_at,next.duration_hours,next.break_minutes,breakSource,next.reason,next.updated_at,next.id);
        }
        next = getRecord(kind, next.id);
        if (kind === 'leave') next = { ...next, accountingDailyHours: entitlements().charges(next.id) };
        sql.prepare('INSERT INTO approved_request_corrections(kind,request_id,actor_id,corrected_at,reason,before_json,after_json) VALUES(?,?,?,?,?,?,?)').run(kind,next.id,actorId,next.updated_at,body.correctionReason.trim(),JSON.stringify(current.record),JSON.stringify(next));
        audit(auditEntry({ action:'approved_correct', target_type:kind + '_request', target_id:next.id, summary:'修正已核准線上申請：' + body.correctionReason.trim(), before_data:current.record, after_data:next }));
        return state(kind,next.id);
    })();
    const summary = (kind,id) => {
        const row = sql.prepare(`SELECT actor_id,corrected_at,reason,
          (SELECT COUNT(*) FROM approved_request_corrections WHERE kind=? AND request_id=?) AS count
          FROM approved_request_corrections WHERE kind=? AND request_id=? ORDER BY id DESC LIMIT 1`).get(kind,id,kind,id);
        return row ? {count:row.count,lastAt:row.corrected_at,lastActorId:row.actor_id,lastReason:row.reason} : {count:0,lastAt:null,lastActorId:null,lastReason:null};
    };
    return { state, correct, history, summary };
}
module.exports = { createApprovedCorrectionStore };
