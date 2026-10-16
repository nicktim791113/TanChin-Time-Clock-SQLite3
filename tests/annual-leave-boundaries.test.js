const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');
const db = require('../database');
const { compare, add, rational } = require('../annual-leave-calculator');
const eq = (actual, expected) => assert.equal(compare(actual, expected), 0, `${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
const total = (values) => values.reduce(add, rational('0'));

function fixture(t, options = {}) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tanchin-annual-boundaries-'));
    const databasePath = path.join(directory, 'app_data.db');
    db.init(databasePath);
    const sql = new Database(databasePath);
    t.after(() => { sql.close(); db.close(); fs.rmSync(directory, { recursive: true, force: true }); });
    db.saveEmployees([{ id: 'E001', name: 'Boundary Employee', hire_date: '2024-07-01', card: 'boundary-employee' }, { id: 'A001', name: 'Reviewer', card: 'boundary-reviewer' }]);
    const store = db.getAnnualLeave(), audit = (entry) => ({ ...entry, actor_id: 'boundary-auditor', actor_role: 'system_admin' });
    const context = { actorId: 'boundary-auditor', sessionKey: 'isolated-boundary-session' };
    const policy = store.savePolicy({ revision: store.revision(), name: 'Boundary Policy', leaveTypeId: 'annual', period: 'calendar_year',
        prorationBasis: 'calendar_month', rounding: 'raw', effectiveFrom: '2025-01-01', agreementReference: 'Confirmed isolated agreement',
        confirmAnnualLeave: true, reason: 'Boundary test', confirm: true, ...options }, audit).policy;
    const service = (overrides = {}) => store.saveService({ revision: store.revision(), employeeId: 'E001', serviceDate: '2024-07-01',
        serviceEffectiveFrom: '2025-01-01', excludedPeriods: [], dayHours: '8', employmentType: 'full_time', entitlementFactor: '1',
        edgeDateConfirmed: true, verified: true, cutoverDate: '2025-01-01', openingHours: '0', openingExpires: '2025-12-31',
        openingSource: 'Confirmed opening source', takeoverConfirmed: true, reason: 'Confirmed baseline', confirm: true, ...overrides }, audit);
    const preview = (asOf = '2025-12-31', overrides = {}) => store.grantPreview({ revision: store.revision(), policyId: policy.id,
        employeeIds: ['E001'], year: 2025, asOf, reason: 'Due entitlement', ...overrides }, context);
    const confirm = (kind, value, overrides = {}) => store[`${kind}Confirm`]({ previewId: value.previewId, digest: value.digest,
        revision: value.revision, confirm: true, reason: 'Reviewed boundary preview', idempotencyKey: crypto.randomUUID(), ...overrides }, audit, context);
    const leave = (id, start, hours, status = 'approved', overrides = {}) => db.createLeaveRequest({ id, employee_id: 'E001', leave_type_id: 'annual',
        start_at: Date.parse(`${start}T09:00:00+08:00`), end_at: Date.parse(`${start}T18:00:00+08:00`), duration_hours: hours,
        explicit_duration_hours: hours, daily_hours: [{ date: start, hours }], status, supervisor_id: 'A001', approval_mode: 'admin_paper_approved',
        reason: 'Isolated boundary leave', created_at: Date.now(), updated_at: Date.now(), ...overrides });
    const closePreview = (overrides = {}) => store.closePreview({ revision: store.revision(), year: 2025, asOf: '2026-01-01',
        closureType: 'year_end', reason: 'Reviewed source settlement', rows: store.state(2025).allocations.filter((a) => a.year === 2025).map((a) => ({
            allocationId: a.id, mode: 'wage' })), ...overrides }, context);
    const snapshot = () => Object.fromEntries(sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'annual_leave_%' OR name LIKE 'leave_%' OR name='employee_service_periods' OR name='audit_logs') ORDER BY name").all()
        .map(({ name }) => [name, sql.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]));
    return { directory, databasePath, sql, store, audit, context, policy, service, preview, confirm, leave, closePreview, snapshot };
}

test('incremental ceil-to-tenth grants recompute the annual total once and preserve already consumed rights', (t) => {
    const f = fixture(t, { rounding: 'ceil_1_decimal' });
    f.service({ employmentType: 'part_time_proportional', entitlementFactor: '1/11', factorBasis: 'Verified normal-hours proportion' });
    const first = f.preview('2025-01-02'); assert.equal(first.blocked, false); f.confirm('grant', first);
    eq(f.store.balances(['E001'], 2025)[0].exact.grantHours, '2.4');
    f.leave('rounding-used', '2025-01-02', 2.4);
    eq(f.store.balances(['E001'], 2025)[0].exact.availableHours, '0');
    const second = f.preview('2025-07-02'); assert.equal(second.blocked, false); f.confirm('grant', second);
    const balance = f.store.balances(['E001'], 2025)[0];
    eq(add(balance.exact.grantHours, balance.exact.adjustmentHours), '4.8'); eq(balance.exact.usedHours, '2.4'); eq(balance.exact.availableHours, '2.4');
    const state = f.store.state(2025), annual = state.allocations.filter((row) => row.year === 2025);
    eq(total(annual.map((row) => row.grantHours)), '4.8');
    const usageRows = JSON.parse(f.sql.prepare("SELECT data_json FROM annual_leave_charge_state WHERE request_id='rounding-used'").get().data_json);
    assert.ok(usageRows.every((row) => row.allocationId), 'Recomputing rounding must not turn already funded leave into an unfunded historical request');
    const close = f.closePreview({ rows: annual.filter((row) => compare(row.availableHours, '0') > 0).map((row) => ({ allocationId: row.id, mode: 'wage' })) });
    assert.equal(close.blocked, false, JSON.stringify(close.rows));
});

test('incremental grants without prior usage apply only the difference from the annual rounded total', (t) => {
    const f = fixture(t, { rounding: 'ceil_1_decimal' });
    f.service({ employmentType: 'part_time_proportional', entitlementFactor: '1/11', factorBasis: 'Verified normal-hours proportion' });
    f.confirm('grant', f.preview('2025-01-02'));
    eq(f.store.balances(['E001'], 2025)[0].exact.availableHours, '2.4');
    f.confirm('grant', f.preview('2025-07-02'));
    eq(f.store.balances(['E001'], 2025)[0].exact.availableHours, '4.8');
    const before = f.store.employeeView(['E001'], 2025), repeated = f.preview('2025-07-03');
    assert.equal(repeated.rows[0].status, 'unchanged');
    f.confirm('grant', repeated);
    assert.deepEqual(f.store.employeeView(['E001'], 2025), before);
});

test('raw fractional rights survive database reopen and the production SQLite backup API exactly', async (t) => {
    const f = fixture(t);
    f.service({ employmentType: 'part_time_proportional', entitlementFactor: '1/3', factorBasis: 'Confirmed ratio' });
    f.confirm('grant', f.preview());
    const allocation = f.store.state(2025).allocations.find((row) => row.year === 2025);
    f.confirm('correction', f.store.correctionPreview({ revision: f.store.revision(), allocationId: allocation.id, quantity: '1/3', reason: 'Exact correction' }, f.context));
    eq(f.store.balances(['E001'], 2025)[0].exact.availableHours, '53/3');
    const original = f.store.employeeView(['E001'], 2025), backupPath = path.join(f.directory, 'official-backup.db');
    await db.backupDatabase(backupPath);
    const backup = new Database(backupPath, { readonly: true });
    assert.equal(backup.pragma('integrity_check', { simple: true }), 'ok');
    assert.deepEqual(backup.prepare('SELECT * FROM annual_leave_adjustments ORDER BY id').all(), f.sql.prepare('SELECT * FROM annual_leave_adjustments ORDER BY id').all());
    backup.close(); db.close(); db.init(f.databasePath);
    assert.deepEqual(db.getAnnualLeave().employeeView(['E001'], 2025), original);
    db.close(); db.init(backupPath);
    assert.deepEqual(db.getAnnualLeave().employeeView(['E001'], 2025), original);
    eq(db.getAnnualLeave().balances(['E001'], 2025)[0].exact.availableHours, '53/3');
});

test('manual balances require explicit reconciled takeover and Excel cannot overwrite a managed annual account', (t) => {
    const f = fixture(t), legacy = db.getLeaveEntitlements();
    const oldBody = { revision: legacy.revision(), rows: [{ employeeId: 'E001', leaveTypeId: 'annual', year: 2025,
        dayHours: 8, grantDays: 10, carryHours: 0, adjustmentHours: 0, reason: 'Historical manual grant' }] };
    const oldPreview = legacy.preview(oldBody); legacy.save({ ...oldBody, digest: oldPreview.digest, confirm: true }, f.audit);
    assert.throws(() => f.service({ openingHours: '5', takeoverConfirmed: false }), /確認接管/);
    assert.throws(() => f.service({ openingHours: '5', openingSource: '' }), /接管對帳依據/);
    f.service({ openingHours: '5' }); f.confirm('grant', f.preview());
    const balances = legacy.balances(['E001'], 2025);
    assert.equal(balances.length, 1); assert.equal(balances[0].mode, 'annual_ledger'); eq(balances[0].exact.availableHours, '57');
    assert.equal(f.sql.prepare("SELECT grant_units FROM leave_entitlements WHERE employee_id='E001'").get().grant_units, 8000);
    const before = f.snapshot(), XLSX = require('xlsx'), book = XLSX.read(legacy.workbook(2025, 'annual'), { type: 'buffer' });
    book.Sheets['假別額度'].I3 = { t: 'n', v: 99 }; book.Sheets['假別額度'].L3 = { t: 's', v: 'Attempted Excel overwrite' };
    assert.throws(() => legacy.readWorkbook(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })), /精確權利帳/);
    assert.deepEqual(f.snapshot(), before);
});

test('closing blocks pending reservations and ambiguous historical requests until exact daily allocation', (t) => {
    const f = fixture(t); f.service(); f.confirm('grant', f.preview());
    f.leave('pending-close', '2025-08-01', 8, 'pending_admin');
    let preview = f.closePreview(); assert.equal(preview.blocked, true); assert.ok(preview.rows.some((r) => r.warnings.some((w) => /待審預占/.test(w))));
    assert.throws(() => f.confirm('close', preview), /整批未寫入/);
    db.withdrawLeaveRequest({ requestId: 'pending-close', withdrawnAt: Date.now() });
    f.leave('legacy-cross-year', '2025-12-31', 8, 'approved', { end_at: Date.parse('2026-01-02T18:00:00+08:00') });
    // Legacy records can predate daily allocation; reproduce that persisted state, without rewriting the request.
    f.sql.prepare("DELETE FROM leave_entitlement_charges WHERE request_id='legacy-cross-year'").run();
    preview = f.closePreview(); assert.equal(preview.blocked, true); assert.ok(preview.rows.some((r) => r.warnings.some((w) => /跨來源期間/.test(w))));
    const original = db.getLeaveRequestById('legacy-cross-year'), legacy = db.getLeaveEntitlements();
    legacy.allocateLegacy({ revision: legacy.revision(), usageRevision: legacy.usageRevision(), requestId: original.id,
        dailyHours: [{ date: '2025-12-31', hours: 4 }, { date: '2026-01-02', hours: 4 }], reason: 'Verified daily allocation', confirm: true }, f.audit);
    assert.deepEqual(db.getLeaveRequestById(original.id), original);
    preview = f.closePreview(); assert.equal(preview.blocked, false, JSON.stringify(preview.rows));
});

test('termination forbids carrying rights even when the caller labels the operation year_end', (t) => {
    const f = fixture(t); f.service(); f.confirm('grant', f.preview());
    db.saveEmployees(db.loadEmployees().map((employee) => employee.id === 'E001' ? { ...employee, termination_date: '2025-12-31' } : employee));
    f.service({ serviceEffectiveFrom: '2025-12-31' });
    const rows = f.store.state(2025).allocations.filter((row) => row.year === 2025).map((row) => ({ allocationId: row.id, mode: 'carry', agreementDate: '2025-12-30', evidence: 'Former employee signed before termination' }));
    const preview = f.closePreview({ rows, closureType: 'year_end' });
    assert.equal(preview.blocked, true, 'A known terminated employment cannot create new carried leave under a year_end label');
    assert.throws(() => f.confirm('close', preview), /整批未寫入/);
});

test('termination settlement includes acquired rights allocated to later years and never marks wages paid', (t) => {
    const f = fixture(t); f.service(); f.confirm('grant', f.preview());
    db.saveEmployees(db.loadEmployees().map((employee) => employee.id === 'E001' ? { ...employee, termination_date: '2025-12-31' } : employee));
    f.service({ serviceEffectiveFrom: '2025-12-31' });
    const all = f.store.state(2025).allocations.filter((row) => row.employeeId === 'E001' && compare(row.availableHours, '0') > 0);
    assert.ok(all.some((row) => row.year === 2026));
    const options = { year: 2025, asOf: '2025-12-31', closureType: 'termination' };
    const partial = f.closePreview({ ...options, rows: all.filter((row) => row.year === 2025).map((row) => ({ allocationId: row.id, mode: 'wage' })) });
    assert.equal(partial.blocked, true);
    assert.ok(partial.rows.some((row) => row.warnings.some((warning) => /已取得來源未納入/.test(warning))));
    assert.ok(!partial.rows.some((row) => row.warnings.some((warning) => /名冊|歷史對帳/.test(warning))), 'The partial batch must fail for missing acquired sources, not an unverified termination date');
    assert.throws(() => f.confirm('close', partial), /整批未寫入/);
    const complete = f.closePreview({ ...options, rows: all.map((row) => ({ allocationId: row.id, mode: 'wage' })) });
    assert.equal(complete.blocked, false, JSON.stringify(complete.rows));
    f.confirm('close', complete);
    const closed = f.store.state(2025).closures;
    assert.equal(closed.length, all.length); assert.ok(closed.every((row) => row.status === 'wage_pending'));
    eq(total(closed.map((row) => row.amount)), '80');
    eq(f.store.balances(['E001'], 2025)[0].exact.availableHours, '0');
    eq(f.store.balances(['E001'], 2026)[0].exact.availableHours, '0');
});

test('historical service review proposals preserve old rights and block both future grants and closing', (t) => {
    const f = fixture(t); f.service(); f.confirm('grant', f.preview());
    const posted = f.sql.prepare('SELECT * FROM annual_leave_grant_lots ORDER BY id').all();
    const review = f.service({ serviceEffectiveFrom: '2026-01-01', serviceDate: '2023-07-01' });
    assert.equal(review.reviewRequired, true); assert.equal(review.service.serviceDate, '2024-07-01');
    assert.equal(review.service.proposedRevision.serviceDate, '2023-07-01');
    assert.deepEqual(f.sql.prepare('SELECT * FROM annual_leave_grant_lots ORDER BY id').all(), posted);
    const close = f.closePreview(); assert.equal(close.blocked, true);
    assert.ok(close.rows.some((row) => row.warnings.some((warning) => /歷史對帳/.test(warning))));
    assert.throws(() => f.confirm('close', close), /整批未寫入/);
    assert.equal(f.preview().blocked, true);
    const cleared = f.service({ serviceEffectiveFrom: '2026-01-02' });
    assert.equal(cleared.service.reviewRequired, false);
    assert.equal(f.closePreview().blocked, false);
    assert.deepEqual(f.sql.prepare('SELECT * FROM annual_leave_grant_lots ORDER BY id').all(), posted);
});

test('outer leave audit failures roll back the request, approval history, charges and exact annual ledger together', (t) => {
    const f = fixture(t); f.service(); f.confirm('grant', f.preview());
    f.leave('paper-audit', '2025-05-01', 8);
    const before = f.snapshot();
    f.sql.exec("CREATE TRIGGER boundary_request_audit_fail BEFORE INSERT ON audit_logs WHEN NEW.action='boundary_request_change' BEGIN SELECT RAISE(FAIL,'outer request audit failure'); END");
    assert.throws(() => db.getSupervisors().transaction(() => {
        db.cancelPaperLeaveRequest({ requestId: 'paper-audit', cancelledAt: Date.now() });
        db.addAuditLog(f.audit({ action: 'boundary_request_change', target_type: 'leave_request', target_id: 'paper-audit', summary: 'Cancel must remain atomic' }));
    }), /outer request audit failure/);
    assert.deepEqual(f.snapshot(), before);
    assert.throws(() => db.getSupervisors().transaction(() => {
        f.leave('paper-audit-new', '2025-05-02', 4);
        db.addAuditLog(f.audit({ action: 'boundary_request_change', target_type: 'leave_request', target_id: 'paper-audit-new', summary: 'Create must remain atomic' }));
    }), /outer request audit failure/);
    assert.deepEqual(f.snapshot(), before);
    f.sql.exec('DROP TRIGGER boundary_request_audit_fail');
    db.getSupervisors().transaction(() => {
        db.cancelPaperLeaveRequest({ requestId: 'paper-audit', cancelledAt: Date.now() });
        db.addAuditLog(f.audit({ action: 'boundary_request_change', target_type: 'leave_request', target_id: 'paper-audit', summary: 'Verified cancellation' }));
    });
    eq(f.store.balances(['E001'], 2025)[0].exact.usedHours, '0');
    const entries = f.sql.prepare("SELECT data_json FROM annual_leave_ledger WHERE request_id='paper-audit' AND action='usage_delta'").all().map((row) => JSON.parse(row.data_json).delta);
    eq(total(entries), '0'); assert.ok(entries.length >= 2);
});
