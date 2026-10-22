const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const db = require('../database');
const { normalizeLeaveDateSelection, getLeaveDateSegments, leaveOverlapsRange, guaranteedLeaveHoursInRange, MAX_LEAVE_SEGMENTS } = require('../leave-date-selection');
const { compare } = require('../annual-leave-calculator');

process.env.TZ = 'UTC';
const at = (value) => Date.parse(`${value}+08:00`);
const segment = (date, from, to, hours, extra = {}) => ({ startAt: at(`${date}T${from}`), endAt: at(`${date}T${to}`), hours, ...extra });
const selected = (rows, extra = {}) => ({ date_selection_mode: 'explicit_segments', leave_segments: rows, ...extra });
const sample = () => [segment('2026-11-03', '09:00', '11:00', 2), segment('2026-11-03', '14:00', '16:00', 1.25), segment('2026-11-10', '13:00', '16:00', 3)];
const audit = (entry) => ({ actor_id: 'S1', role: 'system_admin', action: 'test', target_type: 'leave_request', summary: 'Isolated precise segments', ...entry });

test('precise segments derive sorted envelope and daily totals without treating intra-day or skipped-date gaps as leave', () => {
    const rows = sample(), input = { dateSelectionMode: 'explicit_segments', leaveSegments: [...rows].reverse(), start_at: 1, end_at: 2, duration_hours: 999, dailyHours: [{ date: '2026-11-04', hours: 999 }] };
    const normalized = normalizeLeaveDateSelection(input);
    assert.equal(normalized.start_at, rows[0].startAt);
    assert.equal(normalized.end_at, rows[2].endAt);
    assert.equal(normalized.duration_hours, 6.25);
    assert.deepEqual(normalized.daily_hours, [{ date: '2026-11-03', hours: 3.25 }, { date: '2026-11-10', hours: 3 }]);
    assert.deepEqual(normalized.leave_segments.map(({ id, date, ...row }) => row), rows);
    assert.deepEqual(getLeaveDateSegments(normalized), normalized.leave_segments);
    assert.equal(leaveOverlapsRange(input, at('2026-11-03T11:00'), at('2026-11-03T14:00')), false);
    assert.equal(leaveOverlapsRange(input, at('2026-11-04T00:00'), at('2026-11-10T13:00')), false);
    assert.equal(leaveOverlapsRange(input, at('2026-11-03T10:59'), at('2026-11-03T11:30')), true);
    const midnight = { startAt: at('2028-02-29T22:00'), endAt: at('2028-03-01T00:00'), hours: 2 };
    assert.deepEqual(normalizeLeaveDateSelection(selected([midnight])).daily_hours, [{ date: '2028-02-29', hours: 2 }]);
    assert.equal(normalizeLeaveDateSelection(selected([segment('2026-11-03', '09:00', '10:00', 1), segment('2026-11-03', '10:00', '11:00', 1)])).duration_hours, 2);
});

test('precise segment validation rejects malformed rows, overlap, ambiguous cross-midnight allocation and unsafe sizes', () => {
    const row = sample()[0];
    const invalid = [undefined, null, [], [null], [row, row], Array(MAX_LEAVE_SEGMENTS + 1).fill(row),
        [{ ...row, endAt: row.startAt }], [{ ...row, startAt: true }], [{ ...row, startAt: '' }], [{ ...row, startAt: Infinity }],
        [{ ...row, hours: 0 }], [{ ...row, hours: -1 }], [{ ...row, hours: 2.01 }], [{ ...row, hours: 1.001 }], [{ ...row, hours: 'NaN' }],
        [{ ...row, date: '2026-11-04' }], [{ ...row, id: '<script>' }], [{ ...row, endAt: at('2026-11-04T01:00') }],
        [row, segment('2026-11-03', '10:00', '12:00', 2)],
        [{ ...row, id: 'same' }, segment('2026-11-03', '14:00', '16:00', 2, { id: 'same' })],
        [row, segment('2027-12-01', '09:00', '10:00', 1)]];
    for (const rows of invalid) assert.throws(() => normalizeLeaveDateSelection(selected(rows)), { statusCode: 400 });
    const limit = Array.from({ length: MAX_LEAVE_SEGMENTS }, (_, index) => ({ startAt: row.startAt + index * 120000,
        endAt: row.startAt + index * 120000 + 60000, hours: 0.01 }));
    // Construct valid per-date rows at the size boundary; no row crosses midnight.
    const bounded = limit.map((entry, index) => ({ ...entry, startAt: at('2026-11-03T00:00') + index * 120000, endAt: at('2026-11-03T00:00') + index * 120000 + 60000 }));
    assert.equal(normalizeLeaveDateSelection(selected(bounded)).leave_segments.length, MAX_LEAVE_SEGMENTS);
});

test('full-day meal evidence counts only hours certain to fall within its configured work window', () => {
    const date = '2026-11-03', start = at(`${date}T08:00`), end = at(`${date}T17:00`);
    const hours = (rows) => guaranteedLeaveHoursInRange(rows, start, end);
    assert.equal(hours([segment(date, '08:00', '12:00', 4), segment(date, '13:00', '17:00', 4)]), 8);
    assert.equal(hours([segment(date, '00:00', '04:00', 4), segment(date, '16:00', '20:00', 4)]), 1, 'large gaps and off-shift hours do not count as full-day leave');
    assert.equal(hours([segment(date, '00:00', '08:00', 7.5), segment(date, '08:00', '17:00', 0.5)]), 0.5, 'time-span overlap alone cannot replace actual hours');
    assert.equal(hours([segment(date, '07:00', '18:00', 8)]), 6, 'unlocated breaks are assigned conservatively when the period extends outside the window');
});

test('precise storage keeps one reviewed request, stable server IDs, exact query gaps and atomic accounting/audit corrections', async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tanchin-leave-segments-')), databasePath = path.join(directory, 'isolated.db');
    db.init(databasePath); const sql = new Database(databasePath), quota = db.getLeaveEntitlements();
    t.after(() => { sql.close(); db.close(); fs.rmSync(directory, { recursive: true, force: true }); });
    db.saveEmployees([{ id: 'E1', name: 'Isolated employee', card: 'e1' }, { id: 'S1', name: 'Isolated reviewer', card: 's1' }]);
    for (const year of [2026, 2027]) {
        const body = { revision: quota.revision(), rows: [{ employeeId: 'E1', leaveTypeId: 'annual', year, grantDays: 20, carryHours: 0,
            adjustmentHours: 0, mode: 'total', accountingStart: `${year}-01-01`, reason: 'Fixture quota' }] };
        quota.save({ ...body, digest: quota.preview(body).digest, confirm: true }, audit);
    }
    const create = (id, extra = {}) => db.createLeaveRequest({ id, employee_id: 'E1', leave_type_id: 'annual', status: 'approved', supervisor_id: 'S1',
        approval_mode: 'admin_paper_approved', reason: 'Precise periods', created_at: Date.now(), updated_at: Date.now(), ...selected(sample()), ...extra });
    let original;
    await t.test('server-generated identities and canonical totals persist on reopening with one review flow', () => {
        original = create('precise', { leave_segments: sample().map((row, index) => ({ ...row, id: `client_${index}` })) });
        assert.deepEqual(original, db.getLeaveRequestById('precise'));
        assert.equal(original.duration_hours, 6.25);
        assert.equal(original.leave_segments.length, 3);
        original.leave_segments.forEach((row) => assert.match(row.id, /^segment_[0-9a-f-]{36}$/));
        assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM leave_approval_steps WHERE request_id=?').get('precise').n, 2);
        assert.equal(db.countLeaveRequests(), 1);
        assert.equal(quota.balances(['E1'], 2026)[0].usedHours, 6.25);
        db.close(); db.init(databasePath);
        assert.deepEqual(db.getLeaveRequestById('precise'), original);
    });
    await t.test('SQL filtering precedes pagination and exact overlap checks permit adjacent or gap periods', () => {
        const gap = { overlapStartAt: at('2026-11-03T11:00'), overlapEndAt: at('2026-11-03T13:59:59.999') };
        assert.equal(db.countLeaveRequests(gap), 0);
        assert.deepEqual(db.queryLeaveRequests({ ...gap, limit: 1 }), []);
        assert.equal(db.hasOverlappingLeaveRequest('E1', gap.overlapStartAt, gap.overlapEndAt + 1), false);
        assert.equal(db.hasOverlappingLeaveRequest('E1', at('2026-11-03T10:00'), at('2026-11-03T12:00')), true);
        assert.equal(db.hasOverlappingLeaveRequest('E1', 0, 1, '', selected([segment('2026-11-03', '09:30', '10:00', 0.5)])), true, 'candidate bounds derive from submitted segments');
        create('gap', { ...selected([segment('2026-11-03', '12:00', '13:00', 1)]), created_at: 1 });
        assert.equal(db.countLeaveRequests(gap), 1);
        assert.deepEqual(db.queryLeaveRequests({ ...gap, limit: 1 }).map((row) => row.id), ['gap']);
        assert.deepEqual(db.queryLeaveRequests({ ...gap, limit: 1, offset: 1 }), []);
        assert.equal(db.countLeaveRequests({ overlapStartAt: at('2026-11-04T00:00'), overlapEndAt: at('2026-11-09T23:59:59.999') }), 0);
        assert.equal(db.countLeaveRequests({ endAfterAt: at('2026-11-10T16:00') }), 0);
    });
    await t.test('correction preserves existing IDs, rejects foreign IDs, and commits segments/charges/audit together', () => {
        const foreign = db.getLeaveRequestById('gap').leave_segments[0].id;
        const correct = (leave_segments) => db.updatePaperLeaveRequest({ requestId: 'precise', updates: { ...original, leave_segments, updated_at: Date.now() }, auditLog: audit({ target_id: 'precise' }) });
        assert.throws(() => correct([{ ...sample()[0], id: foreign }]), { statusCode: 409 });
        assert.deepEqual(db.getLeaveRequestById('precise'), original);
        const revised = correct([{ ...original.leave_segments[0], hours: 1.5 }, segment('2026-11-12', '10:00', '11:00', 1)]);
        assert.equal(revised.leave_segments[0].id, original.leave_segments[0].id);
        assert.ok(!original.leave_segments.some((row) => row.id === revised.leave_segments[1].id));
        assert.equal(revised.duration_hours, 2.5);
        assert.deepEqual(revised.daily_hours, [{ date: '2026-11-03', hours: 1.5 }, { date: '2026-11-12', hours: 1 }]);
        assert.equal(db.getLeaveEntitlements().balances(['E1'], 2026)[0].usedHours, 3.5);
        const audited = JSON.parse(sql.prepare("SELECT after_json FROM audit_logs WHERE target_id='precise' ORDER BY rowid DESC LIMIT 1").get().after_json);
        assert.deepEqual(audited.leave_segments, revised.leave_segments);
        for (const mode of ['explicit_dates', 'legacy_range']) assert.throws(() => db.updatePaperLeaveRequest({ requestId: 'precise', updates: { ...revised, date_selection_mode: mode }, auditLog: audit({ target_id: 'precise' }) }), /不可改回/);
        assert.throws(() => db.getLeaveEntitlements().allocateLegacy({ requestId: 'precise', dailyHours: revised.daily_hours,
            revision: db.getLeaveEntitlements().revision(), usageRevision: db.getLeaveEntitlements().usageRevision(), reason: 'Wrong path', confirm: true }, audit), /實際請假日期/);
        sql.exec("CREATE TRIGGER precise_audit_failure BEFORE INSERT ON audit_logs WHEN NEW.target_id='precise' BEGIN SELECT RAISE(FAIL,'precise rollback'); END");
        assert.throws(() => correct([segment('2026-11-14', '09:00', '11:00', 2)]), /precise rollback/);
        assert.deepEqual(db.getLeaveRequestById('precise'), revised);
        assert.equal(db.getLeaveEntitlements().balances(['E1'], 2026)[0].usedHours, 3.5);
        sql.exec('DROP TRIGGER precise_audit_failure');
        const omitted = { ...revised, reason: 'Note only' }; delete omitted.leave_segments; delete omitted.daily_hours; delete omitted.date_selection_mode;
        const kept = db.updatePaperLeaveRequest({ requestId: 'precise', updates: omitted, auditLog: audit({ target_id: 'precise' }) });
        assert.deepEqual(kept.leave_segments, revised.leave_segments);
        db.cancelPaperLeaveRequest({ requestId: 'precise', cancelledAt: Date.now(), auditLog: audit({ target_id: 'precise' }) });
        assert.equal(db.getLeaveEntitlements().balances(['E1'], 2026)[0].usedHours, 1);
    });
    await t.test('failed segment insert leaves no parent, allocations or approval steps', () => {
        const before = db.countLeaveRequests();
        sql.exec("CREATE TRIGGER precise_create_failure BEFORE INSERT ON leave_request_segments WHEN NEW.request_id='fail' BEGIN SELECT RAISE(FAIL,'segment insert rollback'); END");
        assert.throws(() => create('fail'), /segment insert rollback/);
        assert.equal(db.countLeaveRequests(), before);
        assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM leave_approval_steps WHERE request_id='fail'").get().n, 0);
        assert.equal(db.getLeaveEntitlements().charges('fail').length, 0);
        sql.exec('DROP TRIGGER precise_create_failure');
    });
    await t.test('cross-year holds move to usage or release for the complete request after review/withdrawal/rejection', () => {
        const rows = [segment('2026-12-31', '09:00', '12:00', 3), segment('2026-12-31', '13:00', '15:00', 2), segment('2027-01-04', '09:00', '13:00', 4)];
        create('year', { ...selected(rows), status: 'pending_supervisor', approval_mode: 'employee_request' });
        assert.equal(db.getLeaveEntitlements().balances(['E1'], 2026)[0].heldHours, 5);
        assert.equal(db.getLeaveEntitlements().balances(['E1'], 2027)[0].heldHours, 4);
        db.updateLeaveRequestSupervisorDecision({ requestId: 'year', reviewerId: 'S1', decision: 'approved', decidedAt: Date.now() });
        assert.equal(db.getLeaveRequestById('year').status, 'pending_admin');
        db.updateLeaveRequestAdminDecision({ requestId: 'year', adminId: 'S1', decision: 'approved', decidedAt: Date.now() });
        assert.equal(db.getLeaveEntitlements().balances(['E1'], 2027)[0].usedHours, 4);
        assert.equal(db.getLeaveEntitlements().balances(['E1'], 2027)[0].heldHours, 0);
        create('withdraw', { ...selected(rows), status: 'pending_supervisor', approval_mode: 'employee_request' });
        db.withdrawLeaveRequest({ requestId: 'withdraw', withdrawnAt: Date.now() });
        create('reject', { ...selected(rows), status: 'pending_admin', approval_mode: 'employee_request' });
        db.updateLeaveRequestAdminDecision({ requestId: 'reject', adminId: 'S1', decision: 'rejected', decidedAt: Date.now() });
        assert.equal(db.getLeaveEntitlements().balances(['E1'], 2027)[0].heldHours, 0);
    });
});

test('precise segments reconcile annual source rights and roll back failed corrections without changing the ledger', (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tanchin-segment-annual-')), databasePath = path.join(directory, 'isolated.db');
    db.init(databasePath); const sql = new Database(databasePath), store = db.getAnnualLeave();
    t.after(() => { sql.close(); db.close(); fs.rmSync(directory, { recursive: true, force: true }); });
    db.saveEmployees([{ id: 'E1', name: 'Annual fixture', hire_date: '2024-07-01' }]);
    const context = { actorId: 'S1', sessionKey: 'isolated' };
    const policy = store.savePolicy({ revision: store.revision(), name: 'Segment annual', leaveTypeId: 'annual', period: 'calendar_year', prorationBasis: 'calendar_month', rounding: 'raw', effectiveFrom: '2025-01-01', agreementReference: 'Fixture agreement', confirmAnnualLeave: true, reason: 'Fixture policy', confirm: true }, audit).policy;
    store.saveService({ revision: store.revision(), employeeId: 'E1', serviceDate: '2024-07-01', excludedPeriods: [], dayHours: '8', employmentType: 'full_time', entitlementFactor: '1', edgeDateConfirmed: true, verified: true,
        cutoverDate: '2025-01-01', openingHours: '0', openingExpires: '2025-12-31', takeoverConfirmed: true, openingSource: 'Fixture opening', reason: 'Fixture service', confirm: true }, audit);
    const preview = store.grantPreview({ revision: store.revision(), policyId: policy.id, employeeIds: ['E1'], year: 2025, asOf: '2025-12-31', reason: 'Fixture rights' }, context);
    store.grantConfirm({ previewId: preview.previewId, digest: preview.digest, revision: preview.revision, confirm: true, reason: 'Confirmed rights', idempotencyKey: 'segment-fixture' }, audit, context);
    db.createLeaveRequest({ id: 'annual-precise', employee_id: 'E1', leave_type_id: 'annual', supervisor_id: null, reason: 'Fixture leave', status: 'pending_admin', approval_mode: 'admin_paper_approved',
        ...selected([segment('2025-12-31', '09:00', '12:00', 3), segment('2025-12-31', '13:00', '17:00', 4), segment('2026-01-05', '09:00', '13:00', 4)]), created_at: Date.now(), updated_at: Date.now() });
    assert.equal(compare(store.balances(['E1'], 2025)[0].exact.heldHours, '7'), 0);
    assert.equal(compare(store.balances(['E1'], 2026)[0].exact.heldHours, '4'), 0);
    db.updateLeaveRequestAdminDecision({ requestId: 'annual-precise', decision: 'approved', adminId: 'S1', decidedAt: Date.now() });
    const original = db.getLeaveRequestById('annual-precise'), snapshot = store.balances(['E1'], 2026), ledger = sql.prepare('SELECT * FROM annual_leave_ledger ORDER BY rowid').all();
    sql.exec("CREATE TRIGGER annual_precise_failure BEFORE INSERT ON audit_logs WHEN NEW.target_id='annual-precise' BEGIN SELECT RAISE(FAIL,'annual precise rollback'); END");
    const correction = { requestId: original.id, updates: { ...original, leave_segments: [segment('2026-01-05', '09:00', '11:00', 2)] }, auditLog: audit({ target_id: original.id }) };
    assert.throws(() => db.updatePaperLeaveRequest(correction), /annual precise rollback/);
    assert.deepEqual(store.balances(['E1'], 2026), snapshot);
    assert.deepEqual(sql.prepare('SELECT * FROM annual_leave_ledger ORDER BY rowid').all(), ledger);
    assert.deepEqual(db.getLeaveRequestById(original.id), original);
    sql.exec('DROP TRIGGER annual_precise_failure');
    db.updatePaperLeaveRequest(correction);
    assert.equal(compare(store.balances(['E1'], 2025)[0].exact.usedHours, '0'), 0);
    assert.equal(compare(store.balances(['E1'], 2026)[0].exact.usedHours, '2'), 0);
});
