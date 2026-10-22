'use strict';

const crypto = require('node:crypto');
const STATUS = Object.freeze(['pending_admin', 'approved', 'rejected', 'withdrawn', 'cancelled']);
const DEFAULT_SETTINGS = Object.freeze({ enabled: false, startDay: 15, endDay: 20, maxAmount: null, maxActivePerMonth: null, deductionMonthOffset: null });
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const stringify = JSON.stringify;
const taipeiDate = (value) => new Date(value + 8 * 3600000).toISOString().slice(0, 10);
function text(value, label, max = 500, required = false) {
    if (value == null && !required) return '';
    if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) fail(`${label}須為${required ? '非空白' : ''}文字，最多 ${max} 字。`);
    return value.trim();
}
function integer(value, label, minimum, maximum) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) fail(`${label}須為 ${minimum} 至 ${maximum} 的整數。`);
    return value;
}
function month(value) {
    if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value) || value < '2020-01' || value > '2100-12') fail('月份須為有效的 YYYY-MM。');
    return value;
}
function shiftedMonth(value, offset) {
    if (offset == null) return null;
    const [year, mon] = value.split('-').map(Number);
    return new Date(Date.UTC(year, mon - 1 + offset, 1)).toISOString().slice(0, 7);
}

function createSalaryAdvanceStore(sql, addAuditLog, options = {}) {
    const now = options.now || Date.now;
    sql.exec(`
        CREATE TABLE IF NOT EXISTS salary_advance_settings (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, data_json TEXT NOT NULL, updated_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS salary_advance_requests (
            id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, application_month TEXT NOT NULL, status TEXT NOT NULL,
            revision INTEGER NOT NULL, idempotency_key TEXT NOT NULL, input_hash TEXT NOT NULL, data_json TEXT NOT NULL,
            created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(employee_id,idempotency_key)
        );
        CREATE INDEX IF NOT EXISTS salary_advance_employee_month ON salary_advance_requests(employee_id,application_month,status);
        CREATE INDEX IF NOT EXISTS salary_advance_month ON salary_advance_requests(application_month,created_at);
        CREATE TABLE IF NOT EXISTS salary_advance_events (
            sequence INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL UNIQUE, request_id TEXT NOT NULL, revision INTEGER NOT NULL,
            employee_id TEXT NOT NULL, application_month TEXT NOT NULL, status TEXT NOT NULL, data_json TEXT NOT NULL,
            created_at INTEGER NOT NULL, UNIQUE(request_id,revision)
        );
    `);
    // Upgrade local prerelease databases too. UUIDs distinguish reused sequences after a database restore.
    if (!sql.prepare('PRAGMA table_info(salary_advance_events)').all().some((column) => column.name === 'event_id')) {
        sql.transaction(() => {
            sql.exec('ALTER TABLE salary_advance_events ADD COLUMN event_id TEXT');
            const fill = sql.prepare('UPDATE salary_advance_events SET event_id=? WHERE sequence=?');
            for (const event of sql.prepare('SELECT sequence FROM salary_advance_events').all()) fill.run(crypto.randomUUID(), event.sequence);
            sql.exec('CREATE UNIQUE INDEX IF NOT EXISTS salary_advance_event_identity ON salary_advance_events(event_id)');
        })();
    }
    sql.prepare('INSERT OR IGNORE INTO salary_advance_settings VALUES (1,1,?,?)').run(stringify(DEFAULT_SETTINGS), now());
    function settings() {
        const row = sql.prepare('SELECT * FROM salary_advance_settings WHERE id=1').get();
        return { ...DEFAULT_SETTINGS, ...JSON.parse(row.data_json), revision: row.revision, updatedAt: new Date(row.updated_at).toISOString() };
    }
    function audit(auditEntry, action, id, before, after, reason) {
        if (typeof auditEntry !== 'function') fail('缺少借支操作紀錄來源。', 500);
        addAuditLog(auditEntry({ action, target_type: 'salary_advance', target_id: id, summary: reason, before_data: before, after_data: after }));
    }
    function get(id) {
        const row = sql.prepare('SELECT data_json FROM salary_advance_requests WHERE id=?').get(text(id, '申請單號', 100, true));
        if (!row) fail('找不到借支申請。', 404);
        return JSON.parse(row.data_json);
    }
    function employee(employeeId) {
        const row = sql.prepare('SELECT id,name,department,termination_date FROM employees WHERE id=?').get(text(employeeId, '員工工號', 100, true));
        if (!row) fail('找不到員工資料。', 404);
        return row;
    }
    function activeEmployee(employeeId) {
        const row = employee(employeeId);
        if (row.termination_date && row.termination_date <= taipeiDate(now())) fail('已離職員工不能送出新的借支申請。', 403);
        return row;
    }
    function currentWindow() {
        const policy = settings(), currentDate = taipeiDate(now()), applicationMonth = currentDate.slice(0, 7);
        const day = Number(currentDate.slice(8)), [year, mon] = applicationMonth.split('-').map(Number);
        const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
        const startDay = Math.min(policy.startDay, lastDay), endDay = Math.min(policy.endDay, lastDay);
        return { applicationMonth, currentDate, opensOn: `${applicationMonth}-${String(startDay).padStart(2, '0')}`, closesOn: `${applicationMonth}-${String(endDay).padStart(2, '0')}`,
            isOpen: Boolean(policy.enabled && policy.maxAmount && policy.maxActivePerMonth && day >= startDay && day <= endDay), timeZone: 'Asia/Taipei' };
    }
    function saveSettings(input, auditEntry) {
        return sql.transaction(() => {
            const previous = settings();
            if (input.revision !== previous.revision) fail('活動設定已變更，請重新整理。', 409);
            if (typeof input.enabled !== 'boolean') fail('活動啟用狀態須為布林值。');
            const next = {
                enabled: input.enabled,
                startDay: integer(input.startDay, '開始日', 1, 31), endDay: integer(input.endDay, '截止日', 1, 31),
                maxAmount: input.maxAmount == null ? null : integer(input.maxAmount, '單筆借支上限', 1, 1000000000),
                maxActivePerMonth: input.maxActivePerMonth == null ? null : integer(input.maxActivePerMonth, '每月有效申請上限', 1, 12),
                deductionMonthOffset: input.deductionMonthOffset == null ? null : integer(input.deductionMonthOffset, '扣回月份差', 0, 12)
            };
            if (next.startDay > next.endDay) fail('截止日不能早於開始日；登記期間須在同一月份。');
            if (next.enabled && (!next.maxAmount || !next.maxActivePerMonth)) fail('啟用前請先設定金額及每月有效申請上限。');
            const reason = text(input.reason, '設定原因', 500, true);
            sql.prepare('UPDATE salary_advance_settings SET revision=revision+1,data_json=?,updated_at=? WHERE id=1').run(stringify(next), now());
            const saved = settings();
            audit(auditEntry, 'salary_advance_settings_saved', 'settings', previous, saved, reason);
            return saved;
        })();
    }
    function emit(snapshot) {
        sql.prepare('INSERT INTO salary_advance_events(event_id,request_id,revision,employee_id,application_month,status,data_json,created_at) VALUES (?,?,?,?,?,?,?,?)')
            .run(crypto.randomUUID(), snapshot.requestId, snapshot.revision, snapshot.employeeId, snapshot.applicationMonth, snapshot.status, stringify(snapshot), now());
    }
    function submit(employeeId, input, auditEntry) {
        return sql.transaction(() => {
            const person = activeEmployee(employeeId);
            const requestedAmount = integer(input.requestedAmount, '申請金額', 1, 1000000000);
            const applicationMonth = month(input.applicationMonth), note = text(input.note, '申請備註');
            const key = text(input.idempotencyKey, '送件識別碼', 100, true);
            const hash = crypto.createHash('sha256').update(stringify({ applicationMonth, requestedAmount, note })).digest('hex');
            const replay = sql.prepare('SELECT input_hash,data_json FROM salary_advance_requests WHERE employee_id=? AND idempotency_key=?').get(employeeId, key);
            if (replay) {
                if (replay.input_hash !== hash) fail('送件識別碼已用於不同內容；請重新整理後確認。', 409);
                return { request: JSON.parse(replay.data_json), replayed: true };
            }
            const policy = settings(), window = currentWindow();
            if (!window.isOpen || applicationMonth !== window.applicationMonth) fail(`目前不在借支登記期間（${window.opensOn} 至 ${window.closesOn}）；請聯絡管理部。`, 403);
            if (requestedAmount > policy.maxAmount) fail(`申請金額不得超過本次上限 ${policy.maxAmount.toLocaleString('zh-TW')} 元。`);
            const count = sql.prepare("SELECT COUNT(*) AS total FROM salary_advance_requests WHERE employee_id=? AND application_month=? AND status IN ('pending_admin','approved')").get(employeeId, applicationMonth).total;
            if (count >= policy.maxActivePerMonth) fail('本月待審及核准申請已達有效筆數上限，請先查看既有申請。', 409);
            const at = new Date(now()).toISOString();
            const record = { sourceSystem: 'tanchin-time-clock', requestId: crypto.randomUUID(), employeeId, employeeName: person.name || '', department: person.department || '',
                applicationMonth, deductionMonth: shiftedMonth(applicationMonth, policy.deductionMonthOffset), currency: 'TWD', requestedAmount, approvedAmount: null,
                status: 'pending_admin', revision: 1, note, reviewNote: '', reviewerId: null, createdAt: at, submittedAt: at, reviewedAt: null, updatedAt: at,
                rulesSnapshot: { startDay: policy.startDay, endDay: policy.endDay, maxAmount: policy.maxAmount, maxActivePerMonth: policy.maxActivePerMonth, deductionMonthOffset: policy.deductionMonthOffset, settingsRevision: policy.revision } };
            sql.prepare('INSERT INTO salary_advance_requests VALUES (?,?,?,?,?,?,?,?,?,?)').run(record.requestId, employeeId, applicationMonth, record.status, 1, key, hash, stringify(record), now(), now());
            emit(record);
            audit(auditEntry, 'salary_advance_submitted', record.requestId, null, record, '員工送出借支申請，待管理部審核。');
            return { request: record, replayed: false };
        })();
    }
    function transition(id, input, auditEntry, actorId, operation, employeeId) {
        return sql.transaction(() => {
            const previous = get(id);
            if (employeeId && previous.employeeId !== employeeId) fail('只能操作本人的借支申請。', 403);
            if (input.revision !== previous.revision) fail('此申請已被更新，請重新整理後再操作。', 409);
            const reason = text(input.reason, '操作原因', 500, true);
            const at = new Date(now()).toISOString(), next = { ...previous, revision: previous.revision + 1, updatedAt: at };
            if (operation === 'withdraw') {
                if (previous.status !== 'pending_admin') fail('只有待管理部審核的申請可以自行撤回。', 409);
                next.status = 'withdrawn'; next.withdrawnAt = at; next.withdrawalReason = reason;
            } else if (operation === 'cancel') {
                if (!['pending_admin', 'approved'].includes(previous.status)) fail('只有待審或已核准申請可取消。', 409);
                next.status = 'cancelled'; next.cancelledAt = at; next.cancelledBy = actorId; next.cancellationReason = reason;
            } else {
                if (previous.status !== 'pending_admin') fail('此申請已不在待管理部審核狀態。', 409);
                if (!['approved', 'rejected'].includes(input.decision)) fail('審核結果須為核准或退回。');
                next.status = input.decision; next.reviewedAt = at; next.reviewerId = actorId; next.reviewNote = reason;
                next.approvedAmount = input.decision === 'approved'
                    ? integer(input.approvedAmount ?? previous.requestedAmount, '核准金額', 1, previous.requestedAmount) : null;
            }
            const changed = sql.prepare('UPDATE salary_advance_requests SET status=?,revision=?,data_json=?,updated_at=? WHERE id=? AND revision=?')
                .run(next.status, next.revision, stringify(next), now(), previous.requestId, previous.revision);
            if (changed.changes !== 1) fail('此申請已被更新，請重新整理後再操作。', 409);
            emit(next);
            audit(auditEntry, `salary_advance_${next.status}`, previous.requestId, previous, next, reason);
            return next;
        })();
    }
    function list(filters = {}) {
        const parts = [], values = [];
        if (filters.applicationMonth) { parts.push('application_month=?'); values.push(month(filters.applicationMonth)); }
        if (filters.employeeId) { parts.push('employee_id=?'); values.push(text(filters.employeeId, '員工工號', 100, true)); }
        if (filters.status) {
            if (!STATUS.includes(filters.status)) fail('申請狀態不正確。');
            parts.push('status=?'); values.push(filters.status);
        }
        return sql.prepare(`SELECT data_json FROM salary_advance_requests${parts.length ? ' WHERE ' + parts.join(' AND ') : ''} ORDER BY created_at DESC,id`).all(...values).map((row) => JSON.parse(row.data_json));
    }
    function state(filters = {}) {
        const rows = list(filters);
        return { settings: settings(), window: currentWindow(), requests: rows,
            summary: { count: rows.length, pendingCount: rows.filter((r) => r.status === 'pending_admin').length,
                requestedAmount: rows.filter((r) => ['pending_admin', 'approved'].includes(r.status)).reduce((sum, r) => sum + r.requestedAmount, 0),
                approvedAmount: rows.filter((r) => r.status === 'approved').reduce((sum, r) => sum + r.approvedAmount, 0) } };
    }
    function employeeState(employeeId, filters = {}) {
        employee(employeeId);
        return state({ applicationMonth: filters.applicationMonth, employeeId });
    }
    function external(query = {}) {
        // A durable revision feed retains cancellation evidence, including revisions newer than an earlier page.
        const readCursor = (value, label, fallback) => {
            if (value === undefined || value === '') return fallback;
            if (typeof value !== 'string' || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) fail(`${label}須為非負整數字串。`);
            return Number(value);
        };
        const cursor = readCursor(query.cursor, 'cursor', 0), limit = readCursor(query.limit, 'limit', 200);
        if (limit < 1 || limit > 1000) fail('limit 須為 1 至 1000。');
        const latest = sql.prepare('SELECT sequence,event_id FROM salary_advance_events ORDER BY sequence DESC LIMIT 1').get();
        const max = latest?.sequence || 0;
        const until = readCursor(query.untilCursor, 'untilCursor', max);
        if (until > max || cursor > until) fail('同步游標超出目前來源範圍；請核對是否連到不同資料庫。', 409);
        const checkpoint = (sequence, suppliedId, label) => {
            if (!sequence) return null;
            if (typeof suppliedId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(suppliedId)) fail(`${label}須提供對應的事件識別碼，避免資料庫還原後漏讀異動。`);
            const actual = sql.prepare('SELECT event_id FROM salary_advance_events WHERE sequence=?').get(sequence);
            if (!actual || actual.event_id !== suppliedId) fail('來源事件已與同步檢查點不同，可能曾還原資料庫；請人工核對並重新建立同步基準。', 409);
            return actual.event_id;
        };
        checkpoint(cursor, query.cursorEventId, 'cursorEventId');
        const explicitUntil = query.untilCursor !== undefined && query.untilCursor !== '';
        const untilEventId = explicitUntil ? checkpoint(until, query.untilEventId, 'untilEventId') : latest?.event_id || null;
        const parts = ['sequence>?', 'sequence<=?'], values = [cursor, until];
        const filters = {};
        if (query.applicationMonth) { filters.applicationMonth = month(query.applicationMonth); parts.push('application_month=?'); values.push(filters.applicationMonth); }
        if (query.employeeId) { filters.employeeId = text(query.employeeId, '員工工號', 100, true); parts.push('employee_id=?'); values.push(filters.employeeId); }
        // Status filtering would hide cancellation transitions and is intentionally unsupported.
        if (query.status || query.updatedSince) fail('同步介面以 cursor 讀取各狀態的完整修訂；不支援 status 或 updatedSince。');
        const rows = sql.prepare(`SELECT sequence,event_id,data_json FROM salary_advance_events WHERE ${parts.join(' AND ')} ORDER BY sequence LIMIT ?`).all(...values, limit + 1);
        const hasMore = rows.length > limit, page = rows.slice(0, limit);
        return { data: page.map((r) => {
            const row = JSON.parse(r.data_json);
            const { rulesSnapshot, note, employeeName, department, ...publicRecord } = row;
            return { ...publicRecord, changeSequence: r.sequence, changeEventId: r.event_id };
        }), meta: { schemaVersion: 1, feedType: 'request_revisions', filters, hasMore, nextCursor: String(hasMore ? page.at(-1).sequence : until),
            nextCursorEventId: hasMore ? page.at(-1).event_id : untilEventId, untilCursor: String(until), untilEventId,
            paymentRecorded: false, note: '核准申請不是已發放或已扣薪；請依 requestId/revision 更新來源暫存。' } };
    }
    return { settings, currentWindow, saveSettings, get, list, state, employeeState, submit, external,
        review: (input, auditEntry, actorId) => transition(input.requestId, input, auditEntry, actorId, 'review'),
        withdraw: (employeeId, input, auditEntry) => transition(input.requestId, input, auditEntry, employeeId, 'withdraw', employeeId),
        cancel: (input, auditEntry, actorId) => transition(input.requestId, input, auditEntry, actorId, 'cancel') };
}

module.exports = { createSalaryAdvanceStore, SALARY_ADVANCE_STATUSES: STATUS, DEFAULT_SALARY_ADVANCE_SETTINGS: DEFAULT_SETTINGS };
