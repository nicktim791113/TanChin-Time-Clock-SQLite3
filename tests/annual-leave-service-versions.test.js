'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createAnnualLeaveStore } = require('../annual-leave-store');
const { compare } = require('../annual-leave-calculator');
const eq = (actual, expected) => assert.equal(compare(actual, expected), 0);

function fixture(t, { hireDate = '2024-07-01', cutoverDate = '2025-01-01', period = 'calendar_year' } = {}) {
    const sql = new Database(':memory:');
    t.after(() => sql.close());
    sql.exec(`
      CREATE TABLE employees(id TEXT PRIMARY KEY,name TEXT,department TEXT,hire_date TEXT,termination_date TEXT);
      CREATE TABLE leave_types(id TEXT PRIMARY KEY,name TEXT,enabled INTEGER,deducts_balance INTEGER,display_order INTEGER);
      CREATE TABLE leave_entitlements(employee_id TEXT,leave_type_id TEXT,year INTEGER);
      CREATE TABLE leave_entitlement_employee_epochs(employee_id TEXT,after_at INTEGER);
      CREATE TABLE leave_requests(id TEXT PRIMARY KEY,employee_id TEXT,leave_type_id TEXT,start_at INTEGER,end_at INTEGER,duration_hours REAL,status TEXT,created_at INTEGER,updated_at INTEGER);
      CREATE TABLE leave_entitlement_charges(request_id TEXT,date TEXT,units INTEGER);
      INSERT INTO leave_types VALUES ('annual','特休',1,1,0);
    `);
    sql.prepare('INSERT INTO employees VALUES (?,?,?,?,?)').run('E001', 'Version Test', 'QA', hireDate, '');
    const auditRows = [], store = createAnnualLeaveStore(sql, (entry) => auditRows.push(entry), { now: () => Date.parse('2026-12-31T12:00:00+08:00') });
    const audit = (entry) => ({ actor_id: 'admin', ...entry }), context = { actorId: 'admin', sessionKey: 'version-test' };
    const policy = store.savePolicy({ revision: store.revision(), name: 'Service version policy', leaveTypeId: 'annual', period, prorationBasis: 'calendar_month', rounding: 'raw', effectiveFrom: cutoverDate,
        agreementReference: 'Isolated fixture agreement', reason: 'Policy verification', confirm: true, confirmAnnualLeave: true }, audit).policy;
    const input = { employeeId: 'E001', serviceDate: hireDate, serviceEffectiveFrom: cutoverDate, excludedPeriods: [], dayHours: '8', employmentType: 'full_time', entitlementFactor: '1',
        edgeDateConfirmed: true, verified: true, cutoverDate, openingHours: '0', openingExpires: `${cutoverDate.slice(0, 4)}-12-31`, openingSource: 'Verified cutover', takeoverConfirmed: true, reason: 'Verified service', confirm: true };
    const save = (changes = {}) => store.saveService({ ...input, revision: store.revision(), ...changes }, audit);
    const preview = (year = 2025, asOf = `${year}-12-31`) => store.grantPreview({ revision: store.revision(), policyId: policy.id, employeeIds: ['E001'], year, asOf, reason: 'Verified grant' }, context);
    const confirm = (value) => store.grantConfirm({ previewId: value.previewId, digest: value.digest, revision: value.revision, confirm: true, reason: 'Reviewed grant', idempotencyKey: require('node:crypto').randomUUID() }, audit, context);
    return { sql, store, policy, save, preview, confirm, auditRows };
}

test('new leave-of-absence revision delays future qualification without rewriting an acquired lot', (t) => {
    const h = fixture(t);
    h.save(); h.confirm(h.preview(2025, '2025-01-01'));
    const before = h.sql.prepare('SELECT data_json FROM annual_leave_grant_lots').get().data_json;
    const update = h.save({ serviceEffectiveFrom: '2025-02-01', excludedPeriods: [{ start: '2025-02-01', end: '2025-03-01', reason: 'Verified leave without pay' }] });
    assert.equal(update.service.reviewRequired, false);
    assert.equal(update.service.versions.length, 2);
    assert.equal(update.service.versions[0].effectiveFrom, '2025-01-01');
    assert.equal(update.service.versions[1].effectiveFrom, '2025-02-01');
    assert.equal(h.sql.prepare('SELECT data_json FROM annual_leave_grant_lots').get().data_json, before);
    const beforeDue = h.preview(2025, '2025-07-28');
    assert.equal(beforeDue.blocked, false); assert.equal(beforeDue.rows[0].status, 'unchanged');
    const due = h.preview(2025, '2025-07-29');
    assert.equal(due.blocked, false); assert.equal(due.rows[0].lots[0].acquisitionDate, '2025-07-29');
    assert.equal(due.rows[0].lots[0].serviceVersionId, update.service.versions[1].id);
    h.confirm(due);
    assert.equal(h.sql.prepare("SELECT data_json FROM annual_leave_grant_lots WHERE event_key='m6'").get().data_json, before);
    assert.equal(h.sql.prepare('SELECT COUNT(*) AS n FROM annual_leave_grant_lots').get().n, 2);
});

test('future hours version applies on acquisition and cannot retroactively change prior-year rights', (t) => {
    const h = fixture(t, { hireDate: '2023-01-01', cutoverDate: '2024-01-01', period: 'anniversary' });
    h.save(); h.confirm(h.preview(2024));
    const original = h.sql.prepare('SELECT data_json FROM annual_leave_grant_lots').get().data_json;
    const update = h.save({ serviceEffectiveFrom: '2025-01-01', dayHours: '4', employmentType: 'part_time_same_days' });
    assert.equal(update.service.reviewRequired, false);
    const past = h.preview(2024); eq(past.rows[0].calculation.statutory.acquiredSourceHours, '56');
    const current = h.preview(2025);
    assert.equal(current.blocked, false);
    eq(current.rows[0].lots[0].statutoryDays, '10'); eq(current.rows[0].lots[0].statutoryHours, '40');
    eq(current.rows[0].allocations[0].dayHours, '4');
    h.confirm(current);
    eq(h.store.state(2025).allocations.find((a) => a.year === 2025).dayHours, '4');
    assert.equal(h.sql.prepare("SELECT data_json FROM annual_leave_grant_lots WHERE event_key='y1'").get().data_json, original);
});

test('same calendar allocation year cannot silently mix old and new normal-hour bases', (t) => {
    const h = fixture(t);
    h.save(); h.confirm(h.preview());
    h.save({ serviceEffectiveFrom: '2026-01-01', dayHours: '4', employmentType: 'part_time_same_days' });
    const preview = h.preview(2026);
    assert.equal(preview.blocked, true);
    assert.ok(preview.rows[0].warnings.some((warning) => warning.includes('同一配置年度')));
    assert.throws(() => h.confirm(preview), /整批/);
    assert.equal(h.sql.prepare('SELECT COUNT(*) AS n FROM annual_leave_grant_lots').get().n, 2);
});

test('future proportion versions saved before initial grant still retain the original effective terms', (t) => {
    const h = fixture(t);
    h.save();
    const future = h.save({ serviceEffectiveFrom: '2026-01-01', employmentType: 'part_time_proportional', entitlementFactor: '1/2', factorBasis: 'Verified normal work hours ratio' });
    assert.equal(future.service.versions.length, 2);
    const first = h.preview(2025);
    eq(first.rows[0].calculation.statutory.acquiredSourceDays, '10');
    h.confirm(first);
    const second = h.preview(2026);
    assert.equal(second.blocked, false);
    eq(second.rows[0].lots[0].baselineStatutoryDays, '10'); eq(second.rows[0].lots[0].statutoryDays, '5');
    eq(second.rows[0].calculation.annual.rawDays, '6');
    h.confirm(second);
    eq(h.store.balances(['E001'], 2026)[0].exact.grantHours, '48');
});

test('service history must cover cutover and later unposted versions never displace its baseline', (t) => {
    const h = fixture(t);
    assert.throws(() => h.save({ serviceEffectiveFrom: '2026-01-01', dayHours: '4' }), /首版年資版本須自接管日起/);
    assert.equal(h.store.state(2025).services.length, 0);
    const original = h.save().service.versions[0];
    h.save({ serviceEffectiveFrom: '2026-01-01', employmentType: 'part_time_proportional', entitlementFactor: '1/2', factorBasis: 'Confirmed future ratio' });
    const latest = h.save({ serviceEffectiveFrom: '2027-01-01', employmentType: 'part_time_proportional', entitlementFactor: '1/3', factorBasis: 'Later confirmed ratio' });
    assert.equal(latest.service.versions.length, 3);
    assert.deepEqual(latest.service.versions[0], original);
    eq(h.preview(2025).rows[0].calculation.statutory.acquiredSourceDays, '10');
    assert.throws(() => h.save({ cutoverDate: '2024-12-01', serviceEffectiveFrom: '2028-01-01', openingExpires: '2025-11-30' }), /接管日不得早於已核對的最早版本/);
});

test('a correction moving a posted milestone is durably held for review and blocks blind future grants', (t) => {
    const h = fixture(t);
    h.save(); h.confirm(h.preview(2025, '2025-01-01'));
    const oldLot = h.sql.prepare('SELECT data_json FROM annual_leave_grant_lots').get().data_json;
    const response = h.save({ serviceEffectiveFrom: '2025-02-01', excludedPeriods: [{ start: '2024-11-01', end: '2024-12-01', reason: 'Newly discovered historic pause' }] });
    assert.equal(response.reviewRequired, true);
    assert.equal(response.service.versions.length, 1);
    assert.equal(response.service.excludedPeriods.length, 0, 'proposal must not become effective calendar');
    assert.equal(response.service.proposedRevision.excludedPeriods.length, 1);
    assert.ok(response.service.reviewIssues.some((issue) => issue.includes('m6')));
    assert.equal(JSON.parse(h.sql.prepare('SELECT data_json FROM employee_service_periods').get().data_json).reviewRequired, true);
    assert.equal(h.preview(2026).blocked, true);
    assert.throws(() => h.confirm(h.preview(2026)), /整批/);
    assert.equal(h.sql.prepare('SELECT data_json FROM annual_leave_grant_lots').get().data_json, oldLot);
    assert.ok(h.auditRows.some((entry) => entry.action === 'annual_leave_service_review'));
    const resolved = h.save({ serviceEffectiveFrom: '2025-02-01', reason: 'Verified original service calendar is correct' });
    assert.equal(resolved.service.reviewRequired, false);
    assert.equal(resolved.service.proposedRevision, undefined);
    assert.equal(h.preview(2026).blocked, false);
});

test('posted rights also block retroactive factor changes and old version effective dates', (t) => {
    const h = fixture(t);
    h.save(); h.confirm(h.preview());
    assert.throws(() => h.save({ serviceEffectiveFrom: undefined }), /新版本生效日/);
    assert.throws(() => h.save({ serviceEffectiveFrom: '2025-01-01' }), /晚於所有舊版本/);
    const altered = h.save({ serviceEffectiveFrom: '2025-06-01', employmentType: 'part_time_proportional', entitlementFactor: '1/2', factorBasis: 'Proposed correction' });
    assert.equal(altered.reviewRequired, true);
    assert.ok(altered.service.reviewIssues.some((issue) => issue.includes('y1')));
});

test('master hire and termination edits stop grants until a compatible service revision is verified', (t) => {
    const h = fixture(t);
    h.save(); h.confirm(h.preview());
    h.sql.prepare('UPDATE employees SET hire_date=?').run('2024-07-02');
    assert.equal(h.preview(2026).blocked, true);
    const hireVerified = h.save({ serviceEffectiveFrom: '2026-01-01' });
    assert.equal(hireVerified.service.hireDate, '2024-07-02');
    assert.equal(h.preview(2026).blocked, false);
    h.sql.prepare('UPDATE employees SET termination_date=?').run('2026-11-30');
    assert.equal(h.preview(2026).blocked, true);
    const terminationVerified = h.save({ serviceEffectiveFrom: '2026-02-01' });
    assert.equal(terminationVerified.service.leaveDate, '2026-11-30');
    assert.equal(h.preview(2026).blocked, false);
    h.sql.prepare('UPDATE employees SET termination_date=?').run('2025-06-30');
    const invalidTermination = h.save({ serviceEffectiveFrom: '2026-03-01' });
    assert.equal(invalidTermination.reviewRequired, true);
    assert.equal(h.preview(2026).blocked, true);
});

test('takeover inputs stay frozen and omitted exact opening values never round-trip display decimals', (t) => {
    const h = fixture(t);
    h.save({ openingHours: '1/3' }); h.confirm(h.preview());
    assert.throws(() => h.save({ serviceEffectiveFrom: '2026-01-01', openingHours: '1' }), /接管後不可改寫/);
    assert.throws(() => h.save({ serviceEffectiveFrom: '2026-01-01', openingHours: '1/3', cutoverDate: '2025-02-01' }), /接管後不可改寫/);
    assert.throws(() => h.save({ serviceEffectiveFrom: '2026-01-01', openingHours: '1/3', openingSource: 'Different source' }), /接管後不可改寫/);
    const good = h.save({ serviceEffectiveFrom: '2026-01-01', openingHours: undefined });
    eq(good.service.openingHours, '1/3');
});
