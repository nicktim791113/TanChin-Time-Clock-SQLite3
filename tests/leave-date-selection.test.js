const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const db = require('../database');
const { normalizeLeaveDateSelection, getLeaveDateSegments, leaveOverlapsRange } = require('../leave-date-selection');
const { compare } = require('../annual-leave-calculator');
const at = (text) => Date.parse(`${text}+08:00`);
const selected = (extra = {}) => ({ start_at: at('2026-10-23T09:00'), end_at: at('2026-10-26T18:00'),
    date_selection_mode: 'explicit_dates', daily_hours: [{ date: '2026-10-23', hours: 8 }, { date: '2026-10-26', hours: 8 }], ...extra });

test('explicit dates omit unchecked days, accept weekend shifts, derive totals and preserve legacy ranges', () => {
    const input = selected({ duration_hours: 999 }), normalized = normalizeLeaveDateSelection(input);
    assert.equal(normalized.duration_hours, 16);
    assert.deepEqual(getLeaveDateSegments(input).map((s) => [s.date, s.hours]), [['2026-10-23', 8], ['2026-10-26', 8]]);
    assert.equal(leaveOverlapsRange(input, at('2026-10-24T00:00'), at('2026-10-25T00:00')), false);
    assert.equal(leaveOverlapsRange(input, at('2026-10-26T00:00'), at('2026-10-27T00:00')), true);
    const weekend = selected({ daily_hours: [{ date: '2026-10-24', hours: '7.5' }] });
    assert.equal(normalizeLeaveDateSelection(weekend).duration_hours, 7.5);
    const legacy = { ...input, date_selection_mode: 'legacy_range', duration_hours: 16 };
    assert.equal(getLeaveDateSegments(legacy).length, 4);
    assert.equal(getLeaveDateSegments(legacy).reduce((sum, s) => sum + Math.round(s.hours * 100), 0), 1600);
    assert.equal(leaveOverlapsRange(legacy, at('2026-10-24T00:00'), at('2026-10-25T00:00')), true);
    assert.equal(normalizeLeaveDateSelection(legacy).duration_hours, 16);
});

test('date selection validates bounds, midnight, leap dates, decimal precision and nonempty bounded ranges', () => {
    const overnight = selected({ start_at: at('2028-02-29T22:00'), end_at: at('2028-03-01T02:00'), daily_hours: [{ date: '2028-02-29', hours: 2 }, { date: '2028-03-01', hours: 2 }] });
    assert.equal(normalizeLeaveDateSelection(overnight).duration_hours, 4);
    assert.equal(getLeaveDateSegments(overnight)[1].startAt, at('2028-03-01T00:00'));
    for (const daily_hours of [undefined, [], [{ date: '2026-10-22', hours: 1 }], [{ date: '2026-10-23', hours: 0 }],
        [{ date: '2026-10-23', hours: -1 }], [{ date: '2026-10-23', hours: 1.001 }], [{ date: '2026-10-23', hours: 'NaN' }],
        [{ date: '2026-10-23', hours: 16 }], [{ date: '2026-10-26', hours: 19 }],
        [{ date: '2026-10-23', hours: 8 }, { date: '2026-10-23', hours: 8 }], [{ date: '2026-02-30', hours: 8 }]]) {
        assert.throws(() => normalizeLeaveDateSelection(selected({ daily_hours })), { statusCode: 400 });
    }
    assert.throws(() => normalizeLeaveDateSelection(selected({ date_selection_mode: 'anything' })), /模式/);
    assert.throws(() => normalizeLeaveDateSelection(selected({ end_at: at('2026-10-26T00:00') })), /起訖/);
    assert.throws(() => normalizeLeaveDateSelection(selected({ end_at: at('2027-11-01T00:00') })), /370/);
    assert.deepEqual(normalizeLeaveDateSelection(selected({ daily_hours: '2026-10-26=8\n2026-10-23=7.25' })).daily_hours,
        [{ date: '2026-10-23', hours: 7.25 }, { date: '2026-10-26', hours: 8 }]);
    assert.equal(leaveOverlapsRange(overnight, at('2028-03-01T02:00'), at('2028-03-01T03:00')), false);
});

test('stored selection keeps queries, overlaps, manual quotas and historical corrections consistent and atomic', async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tanchin-leave-dates-'));
    const databasePath = path.join(directory, 'isolated.db');
    db.init(databasePath);
    const sql = new Database(databasePath), quota = db.getLeaveEntitlements();
    t.after(() => { sql.close(); db.close(); fs.rmSync(directory, { recursive: true, force: true }); });
    db.saveEmployees([{ id: 'E1', name: 'Isolated employee', card: 'e1', hire_date: '2024-07-01' }, { id: 'S1', name: 'Isolated supervisor', card: 's1' }]);
    const audit = (entry) => ({ actor_id: 'test', role: 'system_admin', action: 'test', target_type: 'leave_request', summary: 'Isolated test', ...entry });
    const create = (id, extra = {}) => db.createLeaveRequest({ id, employee_id: 'E1', leave_type_id: 'annual', status: 'approved', supervisor_id: 'S1',
        approval_mode: 'admin_paper_approved', reason: 'Isolated selected dates', duration_hours: 999, created_at: Date.now(), updated_at: Date.now(), ...selected(), ...extra });
    const saveGrant = (year) => {
        const body = { revision: quota.revision(), rows: [{ employeeId: 'E1', leaveTypeId: 'annual', year, grantDays: 20, carryHours: 0, adjustmentHours: 0, mode: 'total', accountingStart: `${year}-01-01`, reason: 'Verified fixture' }] };
        quota.save({ ...body, digest: quota.preview(body).digest, confirm: true }, audit);
    };
    saveGrant(2026); saveGrant(2027);
    await t.test('creation stores computed total and selected dates; exclusion is honored before pagination and count', () => {
        create('selected');
        const saved = db.getLeaveRequestById('selected');
        assert.equal(saved.duration_hours, 16); assert.equal(saved.date_selection_mode, 'explicit_dates');
        assert.deepEqual(saved.daily_hours, selected().daily_hours);
        assert.equal(quota.balances(['E1'], 2026)[0].usedHours, 16);
        const saturday = { overlapStartAt: at('2026-10-24T00:00'), overlapEndAt: at('2026-10-24T23:59:59.999') };
        assert.equal(db.countLeaveRequests(saturday), 0); assert.deepEqual(db.queryLeaveRequests(saturday), []);
        create('sat', { ...selected({ start_at: at('2026-10-24T09:00'), end_at: at('2026-10-24T18:00'), daily_hours: [{ date: '2026-10-24', hours: 8 }] }), created_at: 1 });
        assert.equal(db.countLeaveRequests(saturday), 1);
        assert.deepEqual(db.queryLeaveRequests({ ...saturday, limit: 1 }).map((r) => r.id), ['sat']);
        assert.deepEqual(db.queryLeaveRequests({ ...saturday, limit: 1, offset: 1 }), []);
        assert.equal(db.hasOverlappingLeaveRequest('E1', at('2026-10-25T09:00'), at('2026-10-25T18:00')), false);
        assert.equal(db.hasOverlappingLeaveRequest('E1', at('2026-10-23T09:00'), at('2026-10-26T18:00'), 'sat', selected({ daily_hours: [{ date: '2026-10-24', hours: 8 }] })), false);
        assert.equal(db.hasOverlappingLeaveRequest('E1', at('2026-10-23T09:00'), at('2026-10-23T12:00')), true);
        assert.equal(db.countLeaveRequests({ endAfterAt: at('2026-10-26T18:00') }), 0);
    });
    await t.test('same-ID correction derives total, preserves selection when omitted and forbids downgrade or accounting-only reassignment', () => {
        const original = db.getLeaveRequestById('selected');
        const updated = db.updatePaperLeaveRequest({ requestId: original.id, updates: { ...original, daily_hours: [{ date: '2026-10-26', hours: 4 }], duration_hours: 100, updated_at: Date.now() }, auditLog: audit({ target_id: original.id }) });
        assert.equal(updated.duration_hours, 4); assert.equal(db.countLeaveRequests(), 2);
        assert.equal(quota.balances(['E1'], 2026)[0].usedHours, 12);
        const omitted = { ...updated, reason: 'Changed note', updated_at: Date.now() }; delete omitted.date_selection_mode; delete omitted.daily_hours;
        const kept = db.updatePaperLeaveRequest({ requestId: original.id, updates: omitted, auditLog: audit({ target_id: original.id }) });
        assert.equal(kept.date_selection_mode, 'explicit_dates'); assert.deepEqual(kept.daily_hours, updated.daily_hours);
        assert.throws(() => db.updatePaperLeaveRequest({ requestId: original.id, updates: { ...kept, date_selection_mode: 'legacy_range' }, auditLog: audit({ target_id: original.id }) }), /不可改回/);
        assert.throws(() => quota.allocateLegacy({ requestId: original.id, dailyHours: [{ date: '2026-10-23', hours: 4 }], revision: quota.revision(), usageRevision: quota.usageRevision(), reason: 'Wrong path', confirm: true }, audit), /實際請假日期/);
        sql.exec("CREATE TRIGGER selected_fail BEFORE INSERT ON audit_logs WHEN NEW.target_id='selected' BEGIN SELECT RAISE(FAIL,'audit rollback'); END");
        assert.throws(() => db.updatePaperLeaveRequest({ requestId: original.id, updates: { ...kept, daily_hours: [{ date: '2026-10-23', hours: 2 }] }, auditLog: audit({ target_id: original.id }) }), /rollback/);
        assert.deepEqual(db.getLeaveRequestById(original.id), kept); assert.equal(quota.balances(['E1'], 2026)[0].usedHours, 12);
        sql.exec('DROP TRIGGER selected_fail');
        db.cancelPaperLeaveRequest({ requestId: original.id, cancelledAt: Date.now(), auditLog: audit({ target_id: original.id }) });
        assert.equal(quota.balances(['E1'], 2026)[0].usedHours, 8);
    });
    await t.test('cross-year reservations convert and release on approval, rejection and withdrawal', () => {
        const period = selected({ start_at: at('2026-12-31T09:00'), end_at: at('2027-01-04T18:00'), daily_hours: [{ date: '2026-12-31', hours: 8 }, { date: '2027-01-04', hours: 7.5 }] });
        create('cross-year', { ...period, status: 'pending_supervisor', approval_mode: 'employee_request' });
        assert.equal(quota.balances(['E1'], 2026)[0].heldHours, 8); assert.equal(quota.balances(['E1'], 2027)[0].heldHours, 7.5);
        db.updateLeaveRequestSupervisorDecision({ requestId: 'cross-year', decision: 'approved', reviewerId: 'S1', decidedAt: Date.now() });
        db.updateLeaveRequestAdminDecision({ requestId: 'cross-year', decision: 'approved', adminId: 'S1', decidedAt: Date.now() });
        assert.equal(quota.balances(['E1'], 2027)[0].usedHours, 7.5); assert.equal(quota.balances(['E1'], 2027)[0].heldHours, 0);
        create('withdraw', { ...period, status: 'pending_supervisor', approval_mode: 'employee_request' });
        db.withdrawLeaveRequest({ requestId: 'withdraw', withdrawnAt: Date.now() });
        assert.equal(quota.balances(['E1'], 2027)[0].heldHours, 0);
        create('reject', { ...period, status: 'pending_admin', approval_mode: 'employee_request' });
        db.updateLeaveRequestAdminDecision({ requestId: 'reject', decision: 'rejected', adminId: 'S1', decidedAt: Date.now() });
        assert.equal(quota.balances(['E1'], 2027)[0].heldHours, 0);
    });
    await t.test('historical range and independent accounting allocation retain their original date meaning after reopening', () => {
        create('legacy', { date_selection_mode: 'legacy_range', daily_hours: undefined, duration_hours: 16, created_at: 2 });
        const before = db.getLeaveRequestById('legacy');
        quota.allocateLegacy({ requestId: before.id, dailyHours: selected().daily_hours, revision: quota.revision(), usageRevision: quota.usageRevision(), reason: 'Accounting only', confirm: true }, audit);
        assert.deepEqual(db.getLeaveRequestById(before.id), before);
        assert.equal(getLeaveDateSegments(before).length, 4);
        db.close(); db.init(databasePath);
        assert.deepEqual(db.getLeaveRequestById(before.id), before);
        assert.deepEqual(db.getLeaveRequestById('cross-year').daily_hours, [{ date: '2026-12-31', hours: 8 }, { date: '2027-01-04', hours: 7.5 }]);
    });
});

test('precise annual source allocations consume only selected dates and roll back correction failures', (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tanchin-selected-annual-')), databasePath = path.join(directory, 'isolated.db');
    db.init(databasePath); const sql = new Database(databasePath), store = db.getAnnualLeave();
    t.after(() => { sql.close(); db.close(); fs.rmSync(directory, { recursive: true, force: true }); });
    db.saveEmployees([{ id: 'E1', name: 'Annual fixture', hire_date: '2024-07-01' }]);
    const audit = (entry) => ({ actor_id: 'test', role: 'system_admin', action: 'test', target_type: 'leave_request', summary: 'Annual selected date test', ...entry });
    const context = { actorId: 'test', sessionKey: 'isolated' };
    const policy = store.savePolicy({ revision: store.revision(), name: 'Fixture annual', leaveTypeId: 'annual', period: 'calendar_year', prorationBasis: 'calendar_month', rounding: 'raw', effectiveFrom: '2025-01-01', agreementReference: 'Fixture agreement', confirmAnnualLeave: true, reason: 'Fixture policy', confirm: true }, audit).policy;
    store.saveService({ revision: store.revision(), employeeId: 'E1', serviceDate: '2024-07-01', excludedPeriods: [], dayHours: '8', employmentType: 'full_time', entitlementFactor: '1', edgeDateConfirmed: true, verified: true,
        cutoverDate: '2025-01-01', openingHours: '0', openingExpires: '2025-12-31', takeoverConfirmed: true, openingSource: 'Fixture opening', reason: 'Fixture service', confirm: true }, audit);
    const preview = store.grantPreview({ revision: store.revision(), policyId: policy.id, employeeIds: ['E1'], year: 2025, asOf: '2025-12-31', reason: 'Fixture rights' }, context);
    store.grantConfirm({ previewId: preview.previewId, digest: preview.digest, revision: preview.revision, confirm: true, reason: 'Confirmed rights', idempotencyKey: 'selected-fixture', }, audit, context);
    const request = { id: 'annual-selected', employee_id: 'E1', leave_type_id: 'annual', supervisor_id: null, reason: 'Fixture leave', status: 'pending_admin', approval_mode: 'admin_paper_approved', duration_hours: 500,
        start_at: at('2025-12-31T09:00'), end_at: at('2026-01-05T18:00'), date_selection_mode: 'explicit_dates', daily_hours: [{ date: '2025-12-31', hours: 8 }, { date: '2026-01-05', hours: 4 }], created_at: Date.now(), updated_at: Date.now() };
    db.createLeaveRequest(request);
    assert.equal(compare(store.balances(['E1'], 2025)[0].exact.heldHours, '8'), 0);
    assert.equal(compare(store.balances(['E1'], 2026)[0].exact.heldHours, '4'), 0);
    db.updateLeaveRequestAdminDecision({ requestId: request.id, decision: 'approved', adminId: 'test', decidedAt: Date.now() });
    const original = db.getLeaveRequestById(request.id), snapshot = store.balances(['E1'], 2026);
    const ledgerBefore = sql.prepare('SELECT * FROM annual_leave_ledger ORDER BY rowid').all();
    sql.exec("CREATE TRIGGER annual_selected_fail BEFORE INSERT ON audit_logs WHEN NEW.target_id='annual-selected' BEGIN SELECT RAISE(FAIL,'annual rollback'); END");
    assert.throws(() => db.updatePaperLeaveRequest({ requestId: request.id, updates: { ...original, daily_hours: [{ date: '2026-01-05', hours: 2 }] }, auditLog: audit({ target_id: request.id }) }), /rollback/);
    assert.deepEqual(store.balances(['E1'], 2026), snapshot); assert.deepEqual(sql.prepare('SELECT * FROM annual_leave_ledger ORDER BY rowid').all(), ledgerBefore);
    sql.exec('DROP TRIGGER annual_selected_fail');
    db.updatePaperLeaveRequest({ requestId: request.id, updates: { ...original, daily_hours: [{ date: '2026-01-05', hours: 2 }] }, auditLog: audit({ target_id: request.id }) });
    assert.equal(compare(store.balances(['E1'], 2025)[0].exact.usedHours, '0'), 0);
    assert.equal(compare(store.balances(['E1'], 2026)[0].exact.usedHours, '2'), 0);
    db.cancelPaperLeaveRequest({ requestId: request.id, cancelledAt: Date.now(), auditLog: audit({ target_id: request.id }) });
    assert.equal(compare(store.balances(['E1'], 2026)[0].exact.usedHours, '0'), 0);
});

test('upgrade adds only the legacy marker without changing historical dates, hours or accounting allocations', (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tanchin-selection-migration-')), databasePath = path.join(directory, 'old.db');
    db.init(databasePath);
    db.createLeaveRequest({ id: 'old', employee_id: 'old-person', leave_type_id: 'personal', start_at: at('2026-10-23T09:00'), end_at: at('2026-10-26T18:00'),
        duration_hours: 16, reason: 'Original historical range', status: 'approved', supervisor_id: null, created_at: 1, updated_at: 1 });
    db.close();
    const sql = new Database(databasePath);
    sql.exec('ALTER TABLE leave_requests DROP COLUMN date_selection_mode');
    sql.prepare('INSERT INTO leave_entitlement_charges VALUES (?, ?, ?)').run('old', '2026-10-23', 1600);
    const before = sql.prepare('SELECT * FROM leave_requests WHERE id=?').get('old'), charges = sql.prepare('SELECT * FROM leave_entitlement_charges').all();
    t.after(() => { sql.close(); db.close(); fs.rmSync(directory, { recursive: true, force: true }); });
    db.init(databasePath);
    const after = db.getLeaveRequestById('old'), { date_selection_mode, daily_hours, ...original } = after;
    assert.equal(date_selection_mode, 'legacy_range'); assert.deepEqual(daily_hours, []); assert.deepEqual(original, before);
    assert.deepEqual(sql.prepare('SELECT * FROM leave_entitlement_charges').all(), charges);
    assert.equal(getLeaveDateSegments(after).length, 4);
});
