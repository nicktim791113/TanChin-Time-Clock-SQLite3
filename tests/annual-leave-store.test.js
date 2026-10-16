const assert = require('node:assert/strict');
const { test } = require('node:test');
const Database = require('better-sqlite3');
const { startFixture } = require('./fixtures/browser-server');
const { compare, add, rational } = require('../annual-leave-calculator');
const eq = (actual, expected) => assert.equal(compare(actual, expected), 0, `${JSON.stringify(actual)} != ${expected}`);

test('precise annual rights, carryovers and request movements preserve atomic source accounting', async (t) => {
    const fixture = await startFixture(), { db } = fixture, sql = new Database(fixture.databasePath), store = db.getAnnualLeave();
    t.after(async () => { sql.close(); await fixture.close(); });
    db.saveEmployees(db.loadEmployees().map((e) => ({ ...e, hire_date: '2024-07-01' })));
    const audit = (entry) => ({ actor_id: 'auditor', actor_role: 'system_admin', ...entry });
    const context = { actorId: 'auditor', sessionKey: 'isolated-session' };
    const policy = (overrides = {}) => store.savePolicy({ revision: store.revision(), name: 'Confirmed annual policy', leaveTypeId: 'annual', period: 'calendar_year', prorationBasis: 'calendar_month', rounding: 'raw',
        effectiveFrom: '2025-01-01', agreementReference: 'Test agreement', confirmAnnualLeave: true, reason: 'Test confirmed policy', confirm: true, ...overrides }, audit).policy;
    const p = policy();
    function service(employeeId, extra = {}) { return store.saveService({ revision: store.revision(), employeeId, serviceDate: '2024-07-01', excludedPeriods: [], dayHours: '8',
        employmentType: 'full_time', entitlementFactor: '1', edgeDateConfirmed: true, verified: true, cutoverDate: '2025-01-01', openingHours: '0', openingExpires: '2025-12-31',
        takeoverConfirmed: true, openingSource: 'Test reconciled source', reason: 'Test confirmed service', confirm: true, ...extra }, audit); }
    const grantBody = (employeeIds = ['E001'], extra = {}) => ({ revision: store.revision(), policyId: p.id, employeeIds, year: 2025, asOf: '2025-12-31', reason: 'Due annual rights', ...extra });
    function confirm(kind, preview, extra = {}) { return store[`${kind}Confirm`]({ previewId: preview.previewId, digest: preview.digest, revision: preview.revision, confirm: true, reason: 'Confirmed preview', idempotencyKey: require('node:crypto').randomUUID(), ...extra }, audit, context); }
    const count = (table) => sql.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
    function leave(requestId, employeeId, date, durationHours, status = 'approved', extra = {}) {
        db.createLeaveRequest({ id: requestId, employee_id: employeeId, leave_type_id: 'annual', start_at: Date.parse(`${date}T09:00:00+08:00`), end_at: Date.parse(`${date}T18:00:00+08:00`),
            duration_hours: durationHours, explicit_duration_hours: durationHours, daily_hours: [{ date, hours: durationHours }], status, supervisor_id: 'A001', approval_mode: 'admin_paper_approved',
            reason: 'Isolated test leave', created_at: Date.now(), updated_at: Date.now(), ...extra });
    }
    await t.test('preview writes no business rows, exact year allocation remains distinct from full source rights', () => {
        service('E001');
        const before = count('annual_leave_grant_lots'), preview = store.grantPreview(grantBody(), context);
        assert.equal(preview.blocked, false); assert.equal(count('annual_leave_grant_lots'), before);
        eq(preview.rows[0].rawDays, '6.5'); eq(preview.rows[0].grantHours, '52'); eq(preview.rows[0].totalPostedHours, '80'); eq(preview.rows[0].futureAllocationHours, '28');
        const result = confirm('grant', preview); assert.equal(result.addedLots, 2);
        const state = store.state(2025); eq(state.balances[0].exact.availableHours, '52');
        eq(store.state(2026).balances[0].exact.grantHours, '28');
        eq(state.lots.map((l) => l.statutoryDays).reduce(add, rational('0')), '10');
        assert.equal(db.getLeaveEntitlements().balances(['E001'], 2025)[0].mode, 'annual_ledger');
        assert.equal(count('leave_entitlements'), 0);
    });
    await t.test('same preview idempotency, fresh revision, cross-session rejection, and unique qualification events', () => {
        const preview = store.grantPreview(grantBody(), context), args = { previewId: preview.previewId, digest: preview.digest, revision: preview.revision, confirm: true, reason: 'Same request', idempotencyKey: 'same-grant' };
        assert.throws(() => store.grantConfirm(args, audit, { ...context, sessionKey: 'other' }), /身份/);
        const first = store.grantConfirm(args, audit, context), second = store.grantConfirm(args, audit, context);
        assert.equal(first.batchId, second.batchId); assert.equal(second.replayed, true); assert.equal(count('annual_leave_grant_lots'), 2);
        assert.throws(() => store.grantConfirm({ ...args, reason: 'Different' }, audit, context), /識別碼/);
        const stale = store.grantPreview(grantBody(), context);
        db.saveEmployees(db.loadEmployees().map((e) => ({ ...e, department: 'Changed' })));
        assert.throws(() => confirm('grant', stale), /已變更/);
    });
    await t.test('approved use, reservation, rejection and withdrawal create reversible precise source movements', () => {
        leave('annual-used', 'E001', '2025-05-20', 8);
        leave('annual-held', 'E001', '2025-08-20', 4, 'pending_admin');
        let row = store.balances(['E001'], 2025)[0]; eq(row.exact.usedHours, '8'); eq(row.exact.heldHours, '4'); eq(row.exact.availableHours, '40');
        const original = db.getLeaveRequestById('annual-used');
        db.withdrawLeaveRequest({ requestId: 'annual-held', withdrawnAt: Date.now() });
        row = store.balances(['E001'], 2025)[0]; eq(row.exact.heldHours, '0'); eq(row.exact.availableHours, '44');
        assert.deepEqual(db.getLeaveRequestById('annual-used'), original);
        const entries = sql.prepare("SELECT data_json FROM annual_leave_ledger WHERE request_id='annual-held' AND action='reservation_delta'").all().map((r) => JSON.parse(r.data_json).delta);
        eq(entries.reduce(add, rational('0')), '0'); assert.ok(entries.length >= 2);
    });
    await t.test('carry requires agreement and closed period; source is debited once and carry is spent first', () => {
        const allocations = store.state(2025).allocations.filter((a) => a.employeeId === 'E001' && a.year === 2025);
        const input = { revision: store.revision(), year: 2025, asOf: '2026-01-01', closureType: 'year_end', reason: 'Agreed carry', rows: allocations.map((a) => ({ allocationId: a.id, mode: 'carry', agreementDate: '2025-12-30', evidence: 'Signed employee agreement' })) };
        assert.throws(() => store.closePreview({ ...input, rows: [{ ...input.rows[0], evidence: '' }] }, context), /同意/);
        assert.equal(store.closePreview({ ...input, asOf: '2025-12-31' }, context).blocked, true);
        const preview = store.closePreview(input, context), original = db.getLeaveRequestById('annual-used');
        assert.equal(preview.blocked, false); confirm('close', preview);
        eq(store.balances(['E001'], 2025)[0].exact.availableHours, '0');
        eq(store.balances(['E001'], 2026)[0].exact.carryHours, '44');
        eq(store.balances(['E001'], 2026)[0].exact.availableHours, '72');
        leave('after-carry', 'E001', '2026-02-20', 8);
        const after = store.state(2026).allocations.filter((a) => a.employeeId === 'E001');
        eq(after.filter((a) => a.kind === 'carry').map((a) => a.usedHours).reduce(add, rational('0')), '8');
        eq(after.filter((a) => a.kind === 'grant' && a.year === 2026).map((a) => a.usedHours).reduce(add, rational('0')), '0');
        assert.deepEqual(db.getLeaveRequestById('annual-used'), original);
        const repeated = store.closePreview({ ...input, revision: store.revision() }, context); assert.equal(repeated.blocked, true);
    });
    await t.test('cancellation after closing restores original source only, without double crediting carry', () => {
        db.cancelPaperLeaveRequest({ requestId: 'annual-used', cancelledAt: Date.now(), auditLog: audit({ action: 'test_cancel', target_type: 'leave_request', target_id: 'annual-used', summary: 'Source refund' }) });
        eq(store.balances(['E001'], 2025)[0].exact.availableHours, '8');
        eq(store.balances(['E001'], 2026)[0].exact.carryHours, '44');
        const source = store.state(2025).allocations.find((a) => a.employeeId === 'E001' && a.year === 2025 && compare(a.availableHours, '0') > 0);
        const preview = store.closePreview({ revision: store.revision(), year: 2025, asOf: '2026-01-02', rows: [{ allocationId: source.id, mode: 'wage' }], reason: 'Refund after prior close' }, context);
        confirm('close', preview); eq(store.balances(['E001'], 2025)[0].exact.availableHours, '0');
        assert.ok(store.state(2025).closures.some((c) => c.status === 'wage_pending'));
        assert.equal(JSON.stringify(store.employeeView(['E001'], 2025)).includes('Signed employee agreement'), false);
    });
    await t.test('exact manual correction is independently previewed, auditable, and cannot remove consumed rights', () => {
        const allocation = store.state(2026).allocations.find((a) => a.employeeId === 'E001' && a.year === 2026 && a.kind === 'grant');
        const before = store.balances(['E001'], 2026)[0].exact.availableHours;
        const preview = store.correctionPreview({ revision: store.revision(), allocationId: allocation.id, quantity: '1/3', reason: 'Exact adjustment' }, context);
        confirm('correction', preview); eq(store.balances(['E001'], 2026)[0].exact.availableHours, add(before, '1/3'));
        assert.throws(() => store.correctionPreview({ revision: store.revision(), allocationId: allocation.id, quantity: '-10000', reason: 'Too much' }, context), /負調整/);
        const legacy = db.getLeaveEntitlements();
        assert.throws(() => legacy.preview({ revision: legacy.revision(), rows: [{ employeeId: 'E001', leaveTypeId: 'annual', year: 2026, grantDays: 30, reason: 'Would overwrite' }] }), /精確權利帳/);
    });
    await t.test('fractional rights retain full precision, and sensitive service evidence never enters personal payloads', () => {
        service('A001', { employmentType: 'part_time_proportional', entitlementFactor: '1/3', factorBasis: 'PRIVATE service evidence' });
        const preview = store.grantPreview(grantBody(['A001']), context); assert.equal(preview.blocked, false); confirm('grant', preview);
        eq(store.balances(['A001'], 2025)[0].exact.grantHours, '52/3');
        const personal = store.employeeView(['A001'], 2025);
        assert.equal(JSON.stringify(personal).includes('PRIVATE service evidence'), false);
        assert.ok(personal.employees.every((e) => e.employeeId === 'A001'));
    });
    await t.test('an audit failure rolls back the whole batch and a second blocked employee prevents partial posting', () => {
        service('A002');
        const bad = store.grantPreview(grantBody(['A002', 'D001']), context);
        assert.equal(bad.blocked, true); assert.throws(() => confirm('grant', bad), /整批/);
        assert.equal(store.state(2025).accounts.some((a) => a.employeeId === 'A002'), false);
        const preview = store.grantPreview(grantBody(['A002']), context), before = count('annual_leave_grant_lots');
        sql.exec("CREATE TRIGGER annual_audit_fail BEFORE INSERT ON audit_logs WHEN NEW.target_type='annual_leave' BEGIN SELECT RAISE(FAIL,'audit failure'); END");
        assert.throws(() => confirm('grant', preview), /audit failure/);
        assert.equal(count('annual_leave_grant_lots'), before); assert.equal(store.state(2025).accounts.some((a) => a.employeeId === 'A002'), false);
        sql.exec('DROP TRIGGER annual_audit_fail');
        confirm('grant', preview); assert.equal(store.state(2025).accounts.some((a) => a.employeeId === 'A002'), true);
    });
    await t.test('future previews cannot be confirmed and reusing an employee code cannot inherit prior lots', () => {
        const future = store.grantPreview(grantBody(['E001'], { year: 2027, asOf: '2027-12-31' }), context);
        assert.throws(() => confirm('grant', future), /未來/);
        const before = count('annual_leave_grant_lots');
        db.saveEmployees(db.loadEmployees().filter((e) => e.id !== 'A002'));
        db.saveEmployees([...db.loadEmployees(), { id: 'A002', name: 'New identity', hire_date: '2026-01-01' }]);
        assert.deepEqual(store.employeeView(['A002'], 2025).employees, []);
        assert.equal(store.state(2025).services.some((s) => s.employeeId === 'A002'), false); assert.equal(count('annual_leave_grant_lots'), before);
    });
});
