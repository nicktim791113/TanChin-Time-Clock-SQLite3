'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');
const db = require('../database');
const calc = require('../annual-leave-calculator');
const { createAnnualLeaveStore } = require('../annual-leave-store');
const FULL = 'full_at_acquisition_year_end';
const eq = (a, b) => assert.equal(calc.compare(a, b), 0, `${JSON.stringify(a)} != ${b}`);
const calculate = (extra = {}) => calc.calculate({ employeeId: 'E001', hireDate: '2026-03-17', serviceDate: '2026-03-17',
    year: 2026, asOf: '2026-10-28', dayHours: '8', period: 'calendar_year', halfYearMode: FULL, ...extra });

test('full half-year right is available on qualification, expires at year end and never partitions into next year', () => {
    const full = calculate(), lot = full.sourceLots[0];
    eq(full.annual.acquiredRawDays, '3'); eq(lot.statutoryDays, '3');
    assert.equal(lot.acquisitionDate, '2026-09-17'); assert.equal(lot.periodEndExclusive, '2027-01-01');
    assert.equal(lot.statutoryPeriodEndExclusive, '2027-03-17'); assert.equal(lot.settlementRule, 'year_end_wage_only');
    eq(calc.partitionLot(lot, { year: 2026 }).rawDays, '3'); assert.equal(calc.partitionLot(lot, { year: 2027 }), null);
    eq(calculate({ asOf: '2026-09-16' }).annual.acquiredRawDays, '0');
    eq(calculate({ asOf: '2026-09-17' }).annual.acquiredRawDays, '3');
    const gap = calculate({ year: 2027, asOf: '2027-03-16' });
    eq(gap.annual.acquiredRawDays, '0'); assert.ok(gap.sourceLots.every((l) => l.eventKey !== 'm6'));
    const firstYear = calculate({ year: 2027, asOf: '2027-03-17' });
    eq(firstYear.statutory.acquiredSourceDays, '7'); eq(firstYear.annual.acquiredRawDays, '343/62');
    const firstYearLot = firstYear.sourceLots.find((l) => l.eventKey === 'y1');
    eq(calc.add(calc.partitionLot(firstYearLot, { year: 2027 }).rawDays, calc.partitionLot(firstYearLot, { year: 2028 }).rawDays), '7');
});

test('existing prorated policies and anniversary mode stay compatible; full mode validates and preserves proportional employment', () => {
    const legacy = calculate({ halfYearMode: undefined });
    assert.equal(legacy.sourceLots[0].periodEndExclusive, '2027-03-17');
    eq(legacy.annual.rawDays, '186/107');
    eq(calc.add(legacy.annual.rawDays, calc.partitionLot(legacy.sourceLots[0], { year: 2027 }).rawDays), '3');
    assert.throws(() => calculate({ period: 'anniversary' }), /只適用曆年制/);
    assert.throws(() => calculate({ halfYearMode: 'unknown' }), /只適用曆年制/);
    eq(calculate({ employmentType: 'part_time_proportional', entitlementFactor: '1/2', factorBasis: 'Verified proportional schedule' }).annual.rawDays, '1.5');
    for (const hire of ['2026-01-01', '2026-06-30', '2026-07-01']) {
        const result = calculate({ hireDate: hire, serviceDate: hire, edgeDateConfirmed: true, asOf: '2026-12-31' });
        for (const lot of result.sourceLots.filter((l) => l.eventKey === 'm6')) eq(result.annual.rawDays, '3');
    }
});

function fixture(t, extra = {}) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tanchin-half-year-')), databasePath = path.join(directory, 'data.db');
    db.init(databasePath);
    db.saveEmployees([{ id: 'E001', name: 'Half year employee', hire_date: '2026-03-17', card: 'half-year-card' }]);
    db.close();
    const sql = new Database(databasePath); let day = '2026-10-28';
    const now = () => Date.parse(`${day}T12:00:00+08:00`);
    const store = createAnnualLeaveStore(sql, (entry) => sql.prepare('INSERT INTO audit_logs(timestamp,action,target_type,target_id,before_json,after_json) VALUES (?,?,?,?,?,?)')
        .run(now(), entry.action, entry.target_type, entry.target_id, JSON.stringify(entry.before_data), JSON.stringify(entry.after_data)), { now });
    t.after(() => { sql.close(); fs.rmSync(directory, { recursive: true, force: true }); });
    const audit = (entry) => ({ ...entry, actor_id: 'isolated-auditor' }), context = { actorId: 'isolated-auditor', sessionKey: 'test-session' };
    const policyBody = (overrides = {}) => ({ revision: store.revision(), name: 'Full half year calendar policy', leaveTypeId: 'annual', period: 'calendar_year',
        prorationBasis: 'calendar_month', rounding: 'raw', halfYearMode: FULL, effectiveFrom: '2026-01-01', agreementReference: 'Confirmed year-end settlement rule',
        reason: 'Confirmed policy', confirm: true, confirmAnnualLeave: true, ...overrides });
    const policy = store.savePolicy(policyBody(extra), audit).policy;
    const service = (overrides = {}) => store.saveService({ revision: store.revision(), employeeId: 'E001', serviceDate: '2026-03-17', dayHours: '8',
        cutoverDate: '2026-03-17', openingHours: '0', openingExpires: '2026-12-31', openingSource: 'Reconciled source', takeoverConfirmed: true,
        edgeDateConfirmed: true, verified: true, confirm: true, reason: 'Verified service', ...overrides }, audit);
    const preview = (asOf = day, overrides = {}) => store.grantPreview({ revision: store.revision(), policyId: policy.id, employeeIds: ['E001'],
        year: Number(asOf.slice(0, 4)), asOf, reason: 'Grant acquired rights', ...overrides }, context);
    const confirm = (kind, value) => store[`${kind}Confirm`]({ previewId: value.previewId, digest: value.digest, revision: value.revision,
        confirm: true, reason: 'Reviewed exact result', idempotencyKey: crypto.randomUUID() }, audit, context);
    const count = (table) => sql.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
    return { sql, store, audit, context, policy, policyBody, service, preview, confirm, count, clock: (value) => { day = value; } };
}

test('posting is idempotent, full m6 disallows carry after corrections, year-end remains unpaid wages and first-year is independent', (t) => {
    const f = fixture(t); f.service(); f.clock('2026-09-16');
    const early = f.preview(); eq(early.rows[0].grantHours, '0'); f.confirm('grant', early); assert.equal(f.count('annual_leave_grant_lots'), 0);
    const future = f.preview('2026-09-17'); assert.throws(() => f.confirm('grant', future), /未來/);
    f.clock('2026-09-17'); f.confirm('grant', f.preview());
    eq(f.store.balances(['E001'], 2026)[0].exact.grantHours, '24');
    f.confirm('grant', f.preview()); assert.equal(f.count('annual_leave_grant_lots'), 1);
    const allocation = f.store.state(2026).allocations[0]; assert.equal(allocation.canCarry, false);
    const correction = f.store.correctionPreview({ revision: f.store.revision(), allocationId: allocation.id, quantity: '-8', reason: 'Prior documented use correction' }, f.context);
    f.confirm('correction', correction);
    const close = (mode, asOf = '2027-01-01') => f.store.closePreview({ revision: f.store.revision(), year: 2026, asOf, reason: 'Close half-year right',
        rows: [{ allocationId: allocation.id, mode, agreementDate: '2026-12-31', evidence: 'Cannot override policy' }] }, f.context);
    assert.equal(close('wage', '2026-12-31').blocked, true);
    assert.equal(close('carry').blocked, true); assert.throws(() => f.confirm('close', close('carry')), /整批/);
    f.clock('2027-01-01'); f.confirm('close', close('wage'));
    const closure = f.store.state(2026).closures[0]; assert.equal(closure.status, 'wage_pending'); eq(closure.amount, '16');
    assert.equal(f.store.state(2027).allocations.some((a) => a.year === 2027), false);
    f.clock('2027-03-16'); f.confirm('grant', f.preview()); eq(f.store.balances(['E001'], 2027)[0].exact.grantHours, '0');
    f.clock('2027-03-17'); f.confirm('grant', f.preview());
    eq(f.store.balances(['E001'], 2027)[0].exact.grantHours, '1372/31');
    assert.deepEqual(f.store.state(2027).lots.map((l) => l.eventKey).sort(), ['m6', 'y1']);
});

test('November opening preserves the already-granted half-year source, exact remainder, expiry and historic working hours', (t) => {
    const f = fixture(t, { effectiveFrom: '2026-11-01' });
    const opening = { cutoverDate: '2026-11-01', openingHours: '16', openingHalfYearOnly: true };
    assert.throws(() => f.service({ ...opening, openingHours: '25' }), /不得超過/);
    assert.throws(() => f.service({ ...opening, openingExpires: '2027-03-16' }), /12\/31/);
    assert.throws(() => f.service({ ...opening, cutoverDate: '2026-09-16' }), /未取得/);
    f.service({ ...opening, openingHalfYearOnly: false });
    assert.equal(f.preview('2026-11-01').blocked, true);
    f.service(opening);
    const planned = f.preview('2026-11-01'); eq(planned.rows[0].totalPostedHours, '16'); assert.equal(planned.rows[0].lots.length, 0);
    assert.throws(() => f.confirm('grant', planned), /未來/);
    f.clock('2026-11-01'); f.confirm('grant', f.preview());
    const row = f.store.state(2026).allocations[0];
    assert.equal(row.eventKey, 'm6'); assert.equal(row.canCarry, false); assert.equal(row.periodEndExclusive, '2027-01-01');
    eq(row.openingHalfYearSource.statutoryHours, '24'); eq(row.openingHalfYearSource.previouslyUsedOrSettledHours, '8');
    f.service({ ...opening, dayHours: '4', serviceEffectiveFrom: '2027-01-01' });
    eq(f.store.state(2026).services[0].openingHalfYearSource.statutoryHours, '24');
    eq(f.store.state(2026).allocations[0].dayHours, '8');
    f.clock('2027-01-01'); f.confirm('grant', f.preview());
    eq(f.store.balances(['E001'], 2027)[0].exact.grantHours, '0');
    assert.equal(f.count('annual_leave_grant_lots'), 0);
});

test('rounding bonus originating from a full half-year source cannot bypass year-end wage-only settlement', (t) => {
    const f = fixture(t, { rounding: 'ceil_1_decimal' });
    f.service({ employmentType: 'part_time_proportional', entitlementFactor: '0.37', factorBasis: 'Verified proportional normal hours' });
    f.confirm('grant', f.preview());
    const allocations = f.store.state(2026).allocations;
    assert.equal(allocations.length, 2); assert.ok(allocations.some((a) => a.kind === 'rounding'));
    assert.ok(allocations.every((a) => !a.canCarry));
    eq(allocations.reduce((n, a) => calc.add(n, a.grantHours), calc.rational('0')), '9.6');
    const carry = f.store.closePreview({ revision: f.store.revision(), year: 2026, asOf: '2027-01-01', reason: 'Cannot carry half-year rounding',
        rows: allocations.map((a) => ({ allocationId: a.id, mode: 'carry', agreementDate: '2026-12-31', evidence: 'Cannot override rule' })) }, f.context);
    assert.equal(carry.blocked, true);
});

test('a mixed half-year and first-year generic opening cannot discard the cash-only source restriction', (t) => {
    const f = fixture(t, { effectiveFrom: '2026-11-01' });
    f.sql.prepare('UPDATE employees SET hire_date=? WHERE id=?').run('2025-08-17', 'E001');
    const opening = { serviceDate: '2025-08-17', cutoverDate: '2026-11-01', openingHours: '32', openingHalfYearOnly: false };
    f.service(opening); f.clock('2026-11-01');
    const blocked = f.preview();
    assert.equal(blocked.blocked, true); assert.match(blocked.rows[0].warnings.join(' '), /本版尚不支援混合來源直接接管/);
    assert.throws(() => f.confirm('grant', blocked), /整批/);
    assert.equal(f.count('annual_leave_accounts'), 0);
    // A zero opening has no mixed balance to classify or silently carry.
    f.service({ ...opening, openingHours: '0' }); assert.equal(f.preview().blocked, false);
    // The legacy prorated policy continues to support its existing generic
    // opening behavior; this guard belongs only to the new full-half-year mode.
    f.store.reviseUnusedPolicy(f.policyBody({ policyId: f.policy.id, effectiveFrom: '2026-11-01', halfYearMode: 'prorated', confirmUnusedRevision: true }), f.audit);
    f.service(opening); assert.equal(f.preview().blocked, false);
    // Once explicitly verified as only a half-year remainder, the source is
    // permitted and retains its restriction despite a separate y1 milestone.
    f.store.reviseUnusedPolicy(f.policyBody({ policyId: f.policy.id, effectiveFrom: '2026-11-01', confirmUnusedRevision: true }), f.audit);
    f.service({ ...opening, openingHours: '16', openingHalfYearOnly: true });
    assert.equal(f.preview().blocked, false); f.confirm('grant', f.preview());
    assert.equal(f.store.state(2026).allocations[0].canCarry, false);
});

test('unused policy revision preserves effective date and history, requires fresh explicit confirmation and is atomic', (t) => {
    const f = fixture(t, { halfYearMode: 'prorated', effectiveFrom: '2026-11-01' });
    const body = () => f.policyBody({ policyId: f.policy.id, effectiveFrom: f.policy.effectiveFrom, confirmUnusedRevision: true });
    assert.equal(f.store.state(2026).policies[0].canRevise, true);
    assert.throws(() => f.store.reviseUnusedPolicy({ ...body(), confirmUnusedRevision: false }, f.audit), /明確確認/);
    assert.throws(() => f.store.reviseUnusedPolicy({ ...body(), revision: 'stale' }, f.audit), /已變更/);
    assert.throws(() => f.store.reviseUnusedPolicy({ ...body(), effectiveFrom: '2026-11-02' }, f.audit), /保留原假別與生效日/);
    f.sql.exec("CREATE TRIGGER deny_revision_audit BEFORE INSERT ON audit_logs WHEN NEW.action='annual_leave_policy_revision' BEGIN SELECT RAISE(FAIL,'audit unavailable'); END");
    assert.throws(() => f.store.reviseUnusedPolicy(body(), f.audit), /audit unavailable/);
    assert.equal(f.count('annual_leave_policy_revisions'), 0); assert.equal(f.store.policies()[0].halfYearMode, 'prorated');
    f.sql.exec('DROP TRIGGER deny_revision_audit');
    const revised = f.store.reviseUnusedPolicy(body(), f.audit).policy;
    assert.equal(revised.id, f.policy.id); assert.equal(revised.createdAt, f.policy.createdAt); assert.equal(revised.halfYearMode, FULL);
    assert.equal(f.count('annual_leave_accounts'), 0); assert.equal(f.count('annual_leave_ledger'), 0);
    const history = f.sql.prepare('SELECT * FROM annual_leave_policy_revisions').get();
    assert.equal(JSON.parse(history.before_json).halfYearMode, 'prorated'); assert.equal(JSON.parse(history.after_json).halfYearMode, FULL);
    f.service({ cutoverDate: '2026-11-01', openingHours: '16', openingHalfYearOnly: true }); f.clock('2026-11-01'); f.confirm('grant', f.preview());
    assert.equal(f.store.state(2026).policies[0].canRevise, false);
    f.sql.prepare('UPDATE annual_leave_accounts SET active=0').run();
    assert.equal(f.store.state(2026).policies[0].canRevise, false);
    assert.throws(() => f.store.reviseUnusedPolicy(body(), f.audit), /歷史權利帳/);
});
