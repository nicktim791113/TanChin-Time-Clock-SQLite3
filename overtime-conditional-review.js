'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { getLeaveDateSegments } = require('./leave-date-selection');

const DAY = 86400000;
const OFFSET = 8 * 3600000;
const SETTINGS_KEY = 'overtimeConditionalReview';
const ACTIVE = ['pending_supervisor', 'pending_additional', 'approved'];
const LEAVE_ACTIVE = new Set(['pending_supervisor', 'pending_admin', 'approved']);
const dayText = at => new Date(at + OFFSET).toISOString().slice(0, 10);
const dayStart = date => Date.parse(date + 'T00:00:00+08:00');
const weekday = at => new Date(at + OFFSET).getUTCDay();
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const overlaps = (start, end, low, high) => start < high && end > low;
function fail(message, statusCode = 400) {
    throw Object.assign(new Error(message), { statusCode, status: statusCode });
}

function createConditionalOvertimeStore(sql, { queryLeave, calendar, addAuditLog }) {
    sql.exec(`CREATE TABLE IF NOT EXISTS overtime_additional_reviews (
        request_id TEXT PRIMARY KEY, data_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS overtime_additional_review_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT NOT NULL, at INTEGER NOT NULL, action TEXT NOT NULL, data_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS overtime_additional_event_request ON overtime_additional_review_events(request_id,id);
      CREATE TRIGGER IF NOT EXISTS overtime_additional_event_immutable_update BEFORE UPDATE ON overtime_additional_review_events
        BEGIN SELECT RAISE(ABORT,'Additional review history is immutable'); END;
      CREATE TRIGGER IF NOT EXISTS overtime_additional_event_immutable_delete BEFORE DELETE ON overtime_additional_review_events
        BEGIN SELECT RAISE(ABORT,'Additional review history is immutable'); END;`);
    const rawRule = () => sql.prepare('SELECT value FROM settings WHERE key=?').get(SETTINGS_KEY)?.value;
    const state = () => {
        const raw = rawRule();
        const config = raw ? JSON.parse(raw) : { enabled: false, effectiveDate: '', leaveTypeIds: [], reviewerIds: [] };
        const { editId, configuredAt, ...publicFields } = config;
        return { ...publicFields, configured: Boolean(raw), revision: digest(raw || 'default') };
    };
    const read = id => {
        const raw = sql.prepare('SELECT data_json FROM overtime_additional_reviews WHERE request_id=?').get(id)?.data_json;
        return raw ? JSON.parse(raw) : null;
    };
    const rowFor = id => sql.prepare('SELECT * FROM overtime_requests WHERE id=?').get(id);
    const history = id => sql.prepare('SELECT id,at,action,data_json FROM overtime_additional_review_events WHERE request_id=? ORDER BY id').all(id)
        .map(({ id: eventId, at, action, data_json }) => ({ id: eventId, at, action, ...JSON.parse(data_json) }));
    const activeStaff = id => Boolean(sql.prepare('SELECT 1 FROM employees WHERE id=?').get(id));
    const epoch = id => sql.prepare('SELECT after_at FROM request_review_epochs WHERE employee_id=?').get(id)?.after_at ?? -1;
    const firstActors = row => {
        const votes = sql.prepare("SELECT reviewer_id FROM request_review_votes WHERE kind='overtime' AND request_id=? AND decision='approved'").all(row.id);
        const steps = sql.prepare("SELECT reviewer_id FROM overtime_approval_steps WHERE request_id=? AND reviewer_role='supervisor' AND status='approved'").all(row.id);
        if (!votes.length && !steps.length && row.supervisor_decision === 'approved' && row.supervisor_id) {
            return new Set([row.supervisor_id]);
        }
        return new Set([...votes, ...steps].map(item => item.reviewer_id).filter(Boolean));
    };
    const eligibleCandidates = (row, snapshot) => {
        const excluded = new Set([row.employee_id, row.applicant_id, ...firstActors(row)]);
        return snapshot.reviewerIds.filter(id => !excluded.has(id) && activeStaff(id) && epoch(id) < snapshot.assignedAt);
    };
    const eligible = (row, snapshot) => eligibleCandidates(row, snapshot).slice(0, 1);
    const detail = id => {
        const snapshot = read(id), row = snapshot && rowFor(id);
        if (!row) return null;
        const { assignedAt, editId, matchFingerprint, periodFingerprint, criteriaFingerprint, ...publicFields } = snapshot;
        return {
            ...publicFields,
            reviewerVotes: snapshot.reviewerVotes.map(({ reviewerId, decision, decidedAt }) => ({ reviewerId, decision, decidedAt })),
            eligibleReviewerIds: eligible(row, snapshot), fingerprint: matchFingerprint, revision: digest(snapshot)
        };
    };
    const canReview = (row, actorId) => {
        if (!row || row.status !== 'pending_additional') return false;
        const snapshot = read(row.id);
        return snapshot?.status === 'pending' && eligible(row, snapshot).includes(actorId);
    };
    const recordChange = (id, action, before, after, auditEntry, actorId, reason) => {
        const now = Date.now();
        const entry = { action: 'overtime_additional_' + action, target_type: 'overtime_request', target_id: id,
            summary: reason || '週六加班追加複核狀態更新', before_data: before, after_data: after };
        const audit = auditEntry ? auditEntry(entry) : { actor_id: actorId || 'system', actor_role: 'system', ...entry };
        sql.prepare('INSERT OR REPLACE INTO overtime_additional_reviews VALUES (?,?)').run(id, JSON.stringify(after));
        sql.prepare('INSERT INTO overtime_additional_review_events(request_id,at,action,data_json) VALUES (?,?,?,?)')
            .run(id, now, action, JSON.stringify({ actorId: actorId || audit.actor_id, reason, before, after }));
        addAuditLog(audit);
    };

    function evaluate({ employeeId, startAt, endAt, applicantId = employeeId }, rule = state()) {
        if (!activeStaff(employeeId) || !Number.isSafeInteger(startAt) || !Number.isSafeInteger(endAt) || endAt <= startAt) fail('請提供有效員工及加班起訖。');
        const evidence = [], evidenceVersions = [];
        if (rule.enabled) {
            const from = Math.max(dayStart(dayText(startAt)), dayStart(rule.effectiveDate));
            const saturday = from + ((6 - weekday(from) + 7) % 7) * DAY;
            const company = calendar();
            const exceptions = new Map(company.exceptions.map(item => [item.date, item.kind]));
            for (let at = saturday; at < endAt; at += 7 * DAY) {
                if (!overlaps(startAt,endAt,at,at + DAY)) continue;
                const weekStart = at - 5 * DAY;
                const leaves = queryLeave({ employeeId, overlapStartAt: weekStart, overlapEndAt: at - 1, limit: null })
                    .filter(row => LEAVE_ACTIVE.has(row.status) && rule.leaveTypeIds.includes(row.leave_type_id));
                for (const leave of leaves) {
                    let segments, uncertain = leave.date_selection_mode !== 'explicit_segments';
                    try {
                        segments = getLeaveDateSegments(leave);
                    } catch {
                        uncertain = true;
                        segments = [{ startAt: leave.start_at, endAt: leave.end_at }];
                    }
                    for (let dateAt = weekStart; dateAt < at; dateAt += DAY) {
                        const date = dayText(dateAt);
                        const override = exceptions.get(date);
                        if (!(override ? override === 'workday' : company.workdays.includes(weekday(dateAt)))) continue;
                        const windows = [[500,740],[780,1020]];
                        const matched = segments.filter(segment => windows.some(([a,b]) =>
                            overlaps(segment.startAt, segment.endAt, dateAt + a * 60000, dateAt + b * 60000)));
                        if (!matched.length) continue;
                        evidence.push({ weekSaturday:dayText(at), leaveRequestId:leave.id, leaveDate:date,
                            leaveTypeId:leave.leave_type_id, status:leave.status, uncertain });
                        evidenceVersions.push({ id:leave.id, version:leave.updated_at, date, segments:matched,
                            startAt:leave.start_at, endAt:leave.end_at, durationHours:leave.duration_hours, mode:leave.date_selection_mode });
                    }
                }
            }
        }
        evidence.sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
        evidenceVersions.sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
        const assignedAt = rawRule() ? JSON.parse(rawRule()).configuredAt : 0;
        const reviewerIds = rule.reviewerIds.filter(id => id !== employeeId && id !== applicantId && activeStaff(id) && epoch(id) < assignedAt);
        return {
            required:evidence.length > 0, evidence, reviewerIds, ruleRevision:rule.revision,
            fingerprint:digest({ employeeId,startAt,endAt,revision:rule.revision,evidence,evidenceVersions }),
            criteriaFingerprint:digest({ evidence, records:evidenceVersions.map(({ version, ...record }) => record) }),
            blockedReason:evidence.length && !reviewerIds.length ? '目前沒有符合獨立條件的追加複核人，案件須等待重新指派。' : null
        };
    }
    const preview = input => {
        const { criteriaFingerprint, ...result } = evaluate(input);
        return result;
    };

    const checkSubmission = request => {
        const result = evaluate({ employeeId:request.employee_id, applicantId:request.applicant_id, startAt:request.start_at, endAt:request.end_at });
        const acknowledged = request.conditional_review_fingerprint;
        if ((result.required || acknowledged !== undefined) && acknowledged !== result.fingerprint) {
            fail('週六加班的追加複核條件已變更，請重新預覽並確認。',409);
        }
        return result;
    };

    const refreshRequest = (id, auditEntry, options = {}) => sql.transaction(() => {
        const row = rowFor(id), before = read(id);
        if (!row) return null;
        if (!ACTIVE.includes(row.status)) {
            if (before && ['rejected','withdrawn','cancelled'].includes(row.status) && before.status !== row.status) {
                recordChange(id, row.status, before, { ...before, status:row.status, editId:randomUUID() }, auditEntry, options.actorId);
            }
            return detail(id);
        }
        if (!activeStaff(row.employee_id)) return detail(id);
        if (!before && !state().enabled) return null;
        const ruleSnapshot = before?.ruleSnapshot || state();
        const match = options.preview || evaluate({ employeeId:row.employee_id, applicantId:row.applicant_id, startAt:row.start_at, endAt:row.end_at }, ruleSnapshot);
        if (!before && !match.required) return null;
        const periodFingerprint = digest([row.employee_id,row.start_at,row.end_at,row.break_minutes,row.reason]);
        const evidenceChanged = match.required && before?.criteriaFingerprint !== match.criteriaFingerprint;
        const reopen = !before || before.status !== 'approved' || evidenceChanged || before.periodFingerprint !== periodFingerprint;
        const status = row.status === 'pending_supervisor' ? 'waiting_supervisor' : reopen ? 'pending' : 'approved';
        const reconciliationRequired = Boolean(before?.reconciliationRequired || (row.status === 'approved' && status === 'pending' && !options.newApproval));
        const snapshot = {
            required:true, status, ruleRevision:before?.ruleRevision || match.ruleRevision,
            ruleSnapshot,
            evidence:match.required ? match.evidence : before?.evidence || [],
            currentEvidence:match.evidence,
            reviewerIds:before?.reviewerIds || match.reviewerIds,
            reviewerVotes:before?.reviewerVotes || [],
            reconciliationRequired, periodFingerprint,
            matchFingerprint:match.fingerprint,
            criteriaFingerprint:match.criteriaFingerprint,
            assignedAt:before?.assignedAt ?? (rawRule() ? JSON.parse(rawRule()).configuredAt : Date.now()),
            editId:before?.editId || randomUUID()
        };
        if (status === 'pending' && row.status !== 'pending_additional') {
            sql.prepare("UPDATE overtime_requests SET status='pending_additional',updated_at=? WHERE id=?").run(Date.now(),id);
        }
        if (digest(snapshot) !== digest(before)) recordChange(id, before ? 'refresh' : 'trigger', before, snapshot, auditEntry, options.actorId);
        return detail(id);
    })();
    const refreshAll = (auditEntry, employeeIds = []) => sql.transaction(() => {
        const config = state();
        if (!config.enabled && !sql.prepare('SELECT 1 FROM overtime_additional_reviews LIMIT 1').get()) return;
        const ids = [...new Set(employeeIds)];
        const employeeFilter = ids.length ? ' AND employee_id IN (' + ids.map(() => '?').join(',') + ')' : '';
        const rows = sql.prepare(`SELECT id,employee_id FROM overtime_requests WHERE status IN ('pending_supervisor','pending_additional','approved')
          AND (end_at>? OR id IN (SELECT request_id FROM overtime_additional_reviews))${employeeFilter}`).all(config.enabled ? dayStart(config.effectiveDate) : Number.MAX_SAFE_INTEGER, ...ids);
        for (const row of rows) refreshRequest(row.id,auditEntry);
    })();

    function validatedReviewers(ids) {
        if (!Array.isArray(ids) || ids.length > 2 || new Set(ids).size !== ids.length ||
            ids.some(id => typeof id !== 'string' || !activeStaff(id))) fail('請選擇有效且不同的主要／備援複核人。');
        return ids;
    }
    const requireReason = body => {
        const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
        if (body.confirm !== true || !reason || reason.length > 500) fail('請確認並填寫原因（最多500字）。');
        return reason;
    };
    const save = (body, auditEntry) => sql.transaction(() => {
        const before = state(), reason = requireReason(body);
        if (body.revision !== before.revision) fail('週六加班複核設定已變更，請重新讀取。',409);
        if (typeof body.enabled !== 'boolean' || !Array.isArray(body.leaveTypeIds) || new Set(body.leaveTypeIds).size !== body.leaveTypeIds.length ||
            body.leaveTypeIds.some(id => typeof id !== 'string' || !sql.prepare('SELECT 1 FROM leave_types WHERE id=?').get(id))) fail('請提供有效假別。');
        const reviewerIds = validatedReviewers(body.reviewerIds);
        const effectiveDate = body.effectiveDate || '';
        const validDate = typeof effectiveDate === 'string' && /^20\d\d-\d\d-\d\d$/.test(effectiveDate) &&
            Number.isFinite(dayStart(effectiveDate)) && dayText(dayStart(effectiveDate)) === effectiveDate;
        if ((effectiveDate && !validDate) || body.enabled && (!validDate || !body.leaveTypeIds.length || !reviewerIds.length)) fail('啟用時須設定生效日、假別與複核人。');
        sql.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES (?,?)').run(SETTINGS_KEY, JSON.stringify({
            enabled:body.enabled, effectiveDate, leaveTypeIds:[...body.leaveTypeIds].sort(), reviewerIds, configuredAt:Date.now(), editId:randomUUID()
        }));
        const after = state();
        addAuditLog(auditEntry({ action:'overtime_additional_settings', target_type:'overtime_additional_review', target_id:SETTINGS_KEY,
            summary:reason, before_data:before, after_data:{ ...after,reason } }));
        refreshAll(auditEntry);
        return after;
    })();

    const decide = (body, actorId, auditEntry) => sql.transaction(() => {
        const row = rowFor(body.requestId), before = row && read(row.id);
        if (!row || !before) fail('找不到追加複核案件。',404);
        if (body.revision !== digest(before)) fail('追加複核資料已變更，請重新讀取。',409);
        if (!canReview(row,actorId)) fail('只有本案獨立追加複核人可以操作。',403);
        const refreshed = refreshRequest(row.id,auditEntry);
        if (refreshed.revision !== body.revision) fail('追加複核依據已變更，請重新讀取。',409);
        if (!['approved','rejected'].includes(body.decision)) fail('複核結果不正確。');
        const comment = typeof body.comment === 'string' ? body.comment.trim() : '';
        if (comment.length > 1000 || body.decision === 'rejected' && !comment) fail('駁回須填寫原因（最多1000字）。');
        const now = Date.now();
        const after = { ...before, status:body.decision, editId:randomUUID(),
            reviewerVotes:[...before.reviewerVotes,{reviewerId:actorId,decision:body.decision,decidedAt:now,comment}] };
        sql.prepare('UPDATE overtime_requests SET status=?,updated_at=? WHERE id=?').run(body.decision,now,row.id);
        recordChange(row.id,'decision',before,after,auditEntry,actorId,comment);
        return detail(row.id);
    })();

    const reassign = (body, actorId, auditEntry) => sql.transaction(() => {
        const reason = requireReason(body), row = rowFor(body.requestId), before = row && read(row.id);
        if (!row || !before) fail('找不到追加複核案件。',404);
        if (body.revision !== digest(before)) fail('追加複核資料已變更，請重新讀取。',409);
        if (!['pending','waiting_supervisor'].includes(before.status) || !ACTIVE.includes(row.status)) fail('只能重新指派未完成的追加複核。',409);
        const reviewerIds = validatedReviewers(body.reviewerIds);
        const after = { ...before, reviewerIds, assignedAt:Date.now(), editId:randomUUID() };
        if (!reviewerIds.length || eligibleCandidates(row,after).length !== reviewerIds.length) fail('不能指派本人、代辦人或已核准本案的第一關主管。');
        recordChange(row.id,'reassign',before,after,auditEntry,actorId,reason);
        return detail(row.id);
    })();

    return { state, save, preview, checkSubmission, detail, history, canReview, refreshRequest, refreshAll, decide, reassign };
}

module.exports = { createConditionalOvertimeStore };
