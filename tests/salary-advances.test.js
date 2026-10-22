'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const Database = require('better-sqlite3');
const XLSX = require('xlsx');
const express = require('express');
const { createSalaryAdvanceStore } = require('../salary-advances');
const { attachSalaryAdvanceRoutes, SALARY_ADVANCE_PERMISSIONS: P, createSalaryAdvanceWorkbook } = require('../salary-advance-routes');

function fixture() {
    const sql = new Database(':memory:');
    sql.exec("CREATE TABLE employees(id TEXT PRIMARY KEY,name TEXT,department TEXT,termination_date TEXT); CREATE TABLE audit_logs(data TEXT); INSERT INTO employees VALUES ('085','=FORMULA()','測試部門',NULL),('088','Test Two','測試部門',NULL),('EXIT','Test Exit','測試部門','2026-10-01');");
    let time = Date.parse('2026-10-15T00:00:00+08:00'), throwAudit = false;
    const addAudit = (entry) => { if (throwAudit) throw new Error('audit database private error'); sql.prepare('INSERT INTO audit_logs VALUES (?)').run(JSON.stringify(entry)); };
    const store = createSalaryAdvanceStore(sql, addAudit, { now: () => time });
    const audit = (entry) => ({ ...entry, actor_id: 'test-actor' });
    const save = (extra = {}) => store.saveSettings({ ...store.settings(), enabled: true, maxAmount: 15000, maxActivePerMonth: 1, deductionMonthOffset: null, reason: 'Confirmed test policy', ...extra }, audit);
    const body = (extra = {}) => ({ applicationMonth: '2026-10', requestedAmount: 5000, note: 'Test note', idempotencyKey: 'test-one', ...extra });
    return { sql, store, audit, save, body, addAudit, time: (value) => { time = Date.parse(value); }, auditFailure: (value) => { throwAudit = value; }, close: () => sql.close() };
}

test('salary advance activities require confirmed limits and enforce Taiwan opening/closing dates', () => {
    const f = fixture(); try {
        assert.equal(f.store.settings().enabled, false);
        assert.equal(f.store.settings().maxAmount, null);
        assert.throws(() => f.store.submit('085', f.body(), f.audit), /登記期間/);
        assert.throws(() => f.save({ maxAmount: null }), /啟用前/);
        assert.throws(() => f.save({ maxActivePerMonth: null }), /啟用前/);
        assert.throws(() => f.save({ startDay: 20, endDay: 15 }), /截止日/);
        assert.throws(() => f.save({ maxAmount: '15000' }), /整數/);
        const first = f.save();
        assert.equal(f.store.currentWindow().isOpen, true);
        assert.throws(() => f.save({ revision: first.revision - 1 }), /已變更/);
        f.time('2026-10-14T23:59:59+08:00'); assert.equal(f.store.currentWindow().isOpen, false);
        f.time('2026-10-20T23:59:59+08:00'); assert.equal(f.store.currentWindow().isOpen, true);
        f.time('2026-10-21T00:00:00+08:00'); assert.equal(f.store.currentWindow().isOpen, false);
        assert.throws(() => f.store.submit('085', f.body(), f.audit), /登記期間/);
        f.save({ startDay: 30, endDay: 31 }); f.time('2027-02-28T12:00:00+08:00');
        assert.equal(f.store.currentWindow().opensOn, '2027-02-28'); assert.equal(f.store.currentWindow().closesOn, '2027-02-28');
        assert.equal(f.store.currentWindow().isOpen, true);
    } finally { f.close(); }
});

test('salary advance submissions are atomic, idempotent, preserve policy snapshots and only reserve active monthly slots', () => {
    const f = fixture(); try {
        f.save();
        for (const amount of [0, -1, 1.5, Infinity, '5000', 15001]) assert.throws(() => f.store.submit('085', f.body({ requestedAmount: amount }), f.audit));
        assert.throws(() => f.store.submit('EXIT', f.body(), f.audit), /離職/);
        assert.throws(() => f.store.submit('085', f.body({ applicationMonth: '2026-11' }), f.audit), /登記期間/);
        f.auditFailure(true);
        assert.throws(() => f.store.submit('085', f.body(), f.audit), /audit/);
        assert.equal(f.store.list().length, 0); assert.equal(f.store.external().data.length, 0);
        f.auditFailure(false);
        const initial = f.store.submit('085', f.body(), f.audit).request;
        assert.equal(initial.employeeId, '085'); assert.equal(initial.status, 'pending_admin'); assert.equal(initial.deductionMonth, null);
        assert.equal(initial.approvedAmount, null); assert.equal(initial.rulesSnapshot.maxAmount, 15000);
        assert.equal(f.store.submit('085', f.body(), f.audit).replayed, true);
        assert.throws(() => f.store.submit('085', f.body({ requestedAmount: 6000 }), f.audit), /識別碼/);
        assert.throws(() => f.store.submit('085', f.body({ idempotencyKey: 'second' }), f.audit), /筆數上限/);
        assert.throws(() => f.store.withdraw('088', { requestId: initial.requestId, revision: 1, reason: 'wrong owner' }, f.audit), /本人/);
        const withdrawn = f.store.withdraw('085', { requestId: initial.requestId, revision: 1, reason: 'Changed plans' }, f.audit);
        assert.equal(withdrawn.status, 'withdrawn'); assert.equal(withdrawn.revision, 2);
        const second = f.store.submit('085', f.body({ idempotencyKey: 'second' }), f.audit).request;
        f.save({ maxAmount: 2000 });
        assert.equal(f.store.get(second.requestId).rulesSnapshot.maxAmount, 15000);
        f.time('2026-10-22T09:00:00+08:00');
        assert.equal(f.store.submit('085', f.body({ idempotencyKey: 'second' }), f.audit).replayed, true);
        assert.throws(() => f.store.submit('088', f.body(), f.audit), /登記期間/);
    } finally { f.close(); }
});

test('salary advance review cancellation and audit rollback retain revisions without recording payment', () => {
    const f = fixture(); try {
        f.save(); const initial = f.store.submit('085', f.body(), f.audit).request;
        const input = { requestId: initial.requestId, revision: 1, decision: 'approved', approvedAmount: 4000, reason: 'Reviewed test amount' };
        assert.throws(() => f.store.review({ ...input, approvedAmount: 6000 }, f.audit, 'reviewer'), /核准金額/);
        f.auditFailure(true); assert.throws(() => f.store.review(input, f.audit, 'reviewer'), /audit/);
        assert.equal(f.store.get(initial.requestId).revision, 1); assert.equal(f.store.external().data.length, 1);
        f.auditFailure(false); const approved = f.store.review(input, f.audit, 'reviewer');
        assert.equal(approved.status, 'approved'); assert.equal(approved.approvedAmount, 4000); assert.equal(approved.reviewerId, 'reviewer');
        assert.equal(approved.paidAt, undefined); assert.equal(approved.paidAmount, undefined);
        assert.throws(() => f.store.review(input, f.audit, 'reviewer'), /已被更新/);
        assert.throws(() => f.store.withdraw('085', { requestId: approved.requestId, revision: 2, reason: 'Try withdraw' }, f.audit), /只有待/);
        const cancelled = f.store.cancel({ requestId: approved.requestId, revision: 2, reason: 'Not issued' }, f.audit, 'admin');
        assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.approvedAmount, 4000);
        assert.equal(f.store.state().summary.approvedAmount, 0);
        assert.deepEqual(f.store.external().data.map((r) => r.status), ['pending_admin', 'approved', 'cancelled']);
        assert.equal(f.store.external().meta.paymentRecorded, false);
    } finally { f.close(); }
});

test('salary advance revision feed handles bounded pages, future changes, leading-zero filters and invalid cursors', () => {
    const f = fixture(); try {
        f.save(); const one = f.store.submit('085', f.body(), f.audit).request;
        const two = f.store.submit('088', f.body(), f.audit).request;
        f.store.review({ requestId: one.requestId, revision: 1, decision: 'approved', reason: 'Approved' }, f.audit, 'reviewer');
        const page1 = f.store.external({ limit: '1' }); assert.equal(page1.meta.hasMore, true); assert.equal(page1.meta.untilCursor, '3');
        f.store.cancel({ requestId: one.requestId, revision: 2, reason: 'Cancelled later' }, f.audit, 'reviewer');
        const page2 = f.store.external({ cursor: page1.meta.nextCursor, cursorEventId: page1.meta.nextCursorEventId, untilCursor: page1.meta.untilCursor, untilEventId: page1.meta.untilEventId, limit: '100' });
        assert.equal(page2.data.length, 2); assert.equal(page2.meta.hasMore, false); assert.equal(page2.meta.nextCursor, '3');
        const updates = f.store.external({ cursor: page2.meta.nextCursor, cursorEventId: page2.meta.nextCursorEventId }); assert.equal(updates.data[0].status, 'cancelled'); assert.equal(updates.meta.nextCursor, '4');
        const filtered = f.store.external({ employeeId: '085' }); assert.equal(filtered.data.length, 3); assert.ok(filtered.data.every((r) => r.employeeId === '085'));
        assert.equal(f.store.external({ employeeId: '85' }).data.length, 0);
        assert.equal(f.store.external({ applicationMonth: '2026-11' }).meta.nextCursor, '4');
        for (const query of [{ cursor: '99' }, { untilCursor: '99' }, { cursor: '-1' }, { limit: '0' }, { limit: '1001' }, { status: 'approved' }, { updatedSince: '2026-10-01' }, { applicationMonth: '2026-13' }]) assert.throws(() => f.store.external(query));
        for (const entry of filtered.data) { assert.equal(entry.note, undefined); assert.equal(entry.employeeName, undefined); assert.equal(entry.rulesSnapshot, undefined); }
        assert.equal(f.store.employeeState('088').requests[0].requestId, two.requestId);
        const excel = XLSX.read(createSalaryAdvanceWorkbook(f.store.list(), '2026-10'), { type: 'buffer' });
        assert.deepEqual(excel.SheetNames, ['借支申請明細', '總表']);
        const sheet = excel.Sheets['借支申請明細'];
        const employeeRow = [2, 3].find((index) => sheet[`D${index}`]?.v === '085');
        assert.ok(employeeRow); assert.equal(sheet[`D${employeeRow}`].t, 's'); assert.equal(sheet[`E${employeeRow}`].v, '=FORMULA()'); assert.equal(sheet[`E${employeeRow}`].f, undefined);
    } finally { f.close(); }
});

test('salary advance feed rejects reused sequence checkpoints after a restore instead of silently skipping cancellation', () => {
    const f = fixture(); try {
        f.save();
        const original = f.store.submit('085', f.body(), f.audit).request;
        const restorePoint = f.sql.serialize();
        f.store.review({ requestId: original.requestId, revision: 1, decision: 'approved', reason: 'Approved old timeline' }, f.audit, 'reviewer');
        f.store.cancel({ requestId: original.requestId, revision: 2, reason: 'Cancelled old timeline' }, f.audit, 'reviewer');
        const previous = f.store.external().meta;
        assert.equal(previous.nextCursor, '3');
        const restoredSql = new Database(restorePoint);
        try {
            const restored = createSalaryAdvanceStore(restoredSql, () => {}, { now: () => Date.parse('2026-10-16T09:00:00+08:00') });
            restored.review({ requestId: original.requestId, revision: 1, decision: 'approved', reason: 'Approved restored timeline' }, f.audit, 'reviewer');
            restored.cancel({ requestId: original.requestId, revision: 2, reason: 'Cancelled restored timeline' }, f.audit, 'reviewer');
            assert.equal(restored.external().meta.nextCursor, '3');
            assert.notEqual(restored.external().meta.nextCursorEventId, previous.nextCursorEventId);
            assert.throws(() => restored.external({ cursor: '3', cursorEventId: previous.nextCursorEventId }), (error) => error.statusCode === 409);
            assert.throws(() => restored.external({ untilCursor: '3', untilEventId: previous.untilEventId }), (error) => error.statusCode === 409);
            assert.throws(() => restored.external({ cursor: '3' }), /事件識別碼/);
            assert.throws(() => restored.external({ untilCursor: '3' }), /事件識別碼/);
        } finally { restoredSql.close(); }
    } finally { f.close(); }
});

async function routeFixture() {
    const f = fixture(); f.save();
    const sessions = new Map([
        ['employee', { role: 'employee', employeeId: '085', authMethod: 'card' }],
        ['other', { role: 'employee', employeeId: '088', authMethod: 'web_password' }],
        ['supervisor', { role: 'employee', employeeId: '088', permissions: Object.values(P) }],
        ['view', { role: 'admin', employeeId: 'admin-view', permissions: [P.view] }],
        ['review', { role: 'admin', employeeId: 'admin-review', permissions: [P.review] }],
        ['settings', { role: 'admin', employeeId: 'admin-settings', permissions: [P.settings] }],
        ['export', { role: 'admin', employeeId: 'admin-export', permissions: [P.export] }],
        ['developer', { role: 'developer', employeeId: 'developer', permissions: Object.values(P) }],
        ['simulation', { role: 'employee', employeeId: '085', realEmployeeId: 'developer', impersonation: { active: true } }],
        ['system', { role: 'system_admin', employeeId: '__system_admin__' }]
    ]);
    let blockedDevice = false, notices = 0;
    const app = express(); app.use(express.json());
    attachSalaryAdvanceRoutes(app, {
        db: { getSalaryAdvances: () => f.store, addAuditLog: f.addAudit },
        requireSession: (req, res, next) => { const session = sessions.get(String(req.headers.authorization || '').replace('Bearer ', '')); if (!session) return res.status(401).json({ success: false }); req.browserSession = session; next(); },
        hasPermission: (session, code) => (session.permissions || []).includes(code),
        auditEntry: (req, entry) => ({ ...entry, actor_id: req.browserSession.employeeId }),
        validateBoundDevice: () => { if (blockedDevice) throw Object.assign(new Error('Bound device revoked'), { statusCode: 403 }); },
        notify: () => { notices++; },
        requireExternalApiAccess: (req, res, next) => { if (!req.headers['x-api-key']) return res.status(401).json({ success: false }); req.externalApiKey = { permissions: req.headers['x-api-key'] === 'financial-test-scope' ? ['salary_advances'] : ['employees', 'attendance'] }; next(); }
    });
    const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
    const request = async (route, token = 'employee', body, extraHeaders = {}) => {
        const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extraHeaders }, body: body === undefined ? undefined : JSON.stringify(body) });
        if (response.headers.get('content-type')?.includes('spreadsheet')) return { status: response.status, workbook: XLSX.read(Buffer.from(await response.arrayBuffer()), { type: 'buffer' }) };
        return { status: response.status, headers: response.headers, ...(await response.json()) };
    };
    return { ...f, sessions, request, blockDevice: (value) => { blockedDevice = value; }, notices: () => notices,
        close: async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); f.close(); } };
}

test('salary advance routes isolate own records, financial permissions, simulation, devices and external scope', async (t) => {
    const f = await routeFixture(); t.after(f.close);
    const own = '/api/browser/employee/salary-advances', admin = '/api/browser/salary-advances';
    for (const token of ['supervisor', 'developer', 'employee']) assert.equal((await f.request(admin, token)).status, 403);
    for (const token of ['view', 'review', 'settings', 'export', 'system']) assert.equal((await f.request(admin, token)).status, 200);
    assert.equal((await f.request(own, 'simulation')).status, 403);
    assert.equal((await f.request(`${own}?employeeId=088`)).status, 403);
    assert.equal((await f.request(`${own}/submit`, 'employee', { ...f.body(), employeeId: '088' })).status, 403);
    f.blockDevice(true); assert.equal((await f.request(`${own}/submit`, 'employee', f.body())).status, 403); f.blockDevice(false);
    const submit = await f.request(`${own}/submit`, 'employee', { ...f.body(), actorId: 'forged', approvedAmount: 999, status: 'approved' });
    assert.equal(submit.status, 200); assert.equal(submit.request.status, 'pending_admin'); assert.equal(submit.request.approvedAmount, null);
    assert.equal((await f.request(own, 'other')).requests.length, 0);
    const action = { requestId: submit.request.requestId, revision: 1, decision: 'approved', approvedAmount: 3000, reason: 'Verified', actorId: 'forged' };
    assert.equal((await f.request(`${admin}/review`, 'view', action)).status, 403);
    const approval = await f.request(`${admin}/review`, 'review', action); assert.equal(approval.status, 200); assert.equal(approval.request.reviewerId, 'admin-review');
    assert.equal((await f.request(`${admin}/export`, 'view')).status, 403); assert.equal((await f.request(`${admin}/export`, 'export')).workbook.SheetNames.length, 2);
    assert.equal((await f.request(`${admin}/settings`, 'review', {})).status, 403);
    assert.equal((await f.request('/api/salary-advance-requests')).status, 401);
    assert.equal((await f.request('/api/salary-advance-requests', '', undefined, { 'X-API-Key': 'attendance-only-test-scope' })).status, 403);
    const external = await f.request('/api/salary-advance-requests', '', undefined, { 'X-API-Key': 'financial-test-scope' });
    assert.equal(external.status, 200); assert.equal(external.data.length, 2); assert.equal(external.headers.get('cache-control'), 'no-store');
    const audits = f.sql.prepare('SELECT data FROM audit_logs').all().map((r) => JSON.parse(r.data));
    assert.equal(audits.find((r) => r.action === 'salary_advance_submitted').actor_id, '085');
    assert.equal(audits.find((r) => r.action === 'salary_advance_approved').actor_id, 'admin-review');
    assert.equal(f.notices(), 2);
});
