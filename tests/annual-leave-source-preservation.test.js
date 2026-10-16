'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createAnnualLeaveStore } = require('../annual-leave-store');
const { compare, sum } = require('../annual-leave-calculator');
const eq = (actual, expected) => assert.equal(compare(actual, expected), 0, `${JSON.stringify(actual)} !== ${expected}`);

function fixture(t, { period = 'calendar_year', initialAsOf = '2025-12-31' } = {}) {
    const sql = new Database(':memory:'); t.after(() => sql.close());
    sql.exec(`
      CREATE TABLE employees(id TEXT PRIMARY KEY,name TEXT,department TEXT,hire_date TEXT,termination_date TEXT);
      CREATE TABLE leave_types(id TEXT PRIMARY KEY,name TEXT,enabled INTEGER,deducts_balance INTEGER,display_order INTEGER);
      CREATE TABLE leave_entitlements(employee_id TEXT,leave_type_id TEXT,year INTEGER);
      CREATE TABLE leave_entitlement_employee_epochs(employee_id TEXT,after_at INTEGER);
      CREATE TABLE leave_requests(id TEXT PRIMARY KEY,employee_id TEXT,leave_type_id TEXT,start_at INTEGER,end_at INTEGER,duration_hours REAL,status TEXT,created_at INTEGER,updated_at INTEGER);
      CREATE TABLE leave_entitlement_charges(request_id TEXT,date TEXT,units INTEGER,PRIMARY KEY(request_id,date));
      INSERT INTO employees VALUES ('E001','Source test','QA','2024-07-01','');
      INSERT INTO leave_types VALUES ('annual','特休',1,1,0);
    `);
    const store = createAnnualLeaveStore(sql, () => {}, { now: () => Date.parse('2026-12-31T12:00:00+08:00') });
    const audit = (entry) => ({ actor_id: 'admin', ...entry }), context = { actorId: 'admin', sessionKey: 'source-regression' };
    const policy = store.savePolicy({ revision: store.revision(), name: 'Source preservation', leaveTypeId: 'annual', period, prorationBasis: 'calendar_month', rounding: 'raw', effectiveFrom: '2025-01-01', agreementReference: 'Verified agreement', reason: 'Fixture policy', confirm: true, confirmAnnualLeave: true }, audit).policy;
    const serviceInput = { employeeId: 'E001', serviceDate: '2024-07-01', serviceEffectiveFrom: '2025-01-01', excludedPeriods: [], dayHours: '8', employmentType: 'full_time', entitlementFactor: '1', edgeDateConfirmed: true, verified: true,
        cutoverDate: '2025-01-01', openingHours: '0', openingExpires: '2025-12-31', openingSource: 'Verified balance', takeoverConfirmed: true, reason: 'Fixture service', confirm: true };
    const service = (changes = {}) => store.saveService({ ...serviceInput, ...changes, revision: store.revision() }, audit);
    const confirm = (kind, preview) => store[`${kind}Confirm`]({ previewId: preview.previewId, digest: preview.digest, revision: preview.revision, confirm: true, reason: 'Confirmed fixture', idempotencyKey: require('node:crypto').randomUUID() }, audit, context);
    const grant = (year = 2025, asOf = `${year}-12-31`) => confirm('grant', store.grantPreview({ revision: store.revision(), policyId: policy.id, employeeIds: ['E001'], year, asOf, reason: 'Fixture grant' }, context));
    service(); grant(2025, initialAsOf);
    let counter = 1;
    const request = (requestId, date, hours, status = 'approved') => {
        sql.prepare('INSERT INTO leave_requests VALUES (?,?,?,?,?,?,?,?,?)').run(requestId, 'E001', 'annual', Date.parse(`${date}T09:00:00+08:00`), Date.parse(`${date}T18:00:00+08:00`), hours, status, counter, counter++);
        sql.prepare('INSERT INTO leave_entitlement_charges VALUES (?,?,?)').run(requestId, date, Math.round(hours * 100)); store.reconcile();
    };
    const change = (requestId, { status, date, hours } = {}) => {
        if (status) sql.prepare('UPDATE leave_requests SET status=?,updated_at=updated_at+1 WHERE id=?').run(status, requestId);
        if (date || hours != null) {
            const old = sql.prepare('SELECT * FROM leave_entitlement_charges WHERE request_id=?').get(requestId);
            const nextDate = date || old.date, nextHours = hours ?? old.units / 100;
            sql.prepare('UPDATE leave_requests SET start_at=?,end_at=?,duration_hours=?,updated_at=updated_at+1 WHERE id=?').run(Date.parse(`${nextDate}T09:00:00+08:00`), Date.parse(`${nextDate}T18:00:00+08:00`), nextHours, requestId);
            sql.prepare('DELETE FROM leave_entitlement_charges WHERE request_id=?').run(requestId);
            sql.prepare('INSERT INTO leave_entitlement_charges VALUES (?,?,?)').run(requestId, nextDate, Math.round(nextHours * 100));
        }
        store.reconcile();
    };
    const allocations = () => store.state(2025).allocations;
    const mapping = (requestId) => JSON.parse(sql.prepare('SELECT data_json FROM annual_leave_charge_state WHERE request_id=?').get(requestId).data_json);
    const carry = (selected) => confirm('close', store.closePreview({ revision: store.revision(), year: 2025, asOf: '2026-01-01', closureType: 'year_end', reason: 'Agreed carry', rows: selected.map((allocation) => ({ allocationId: allocation.id, mode: 'carry', agreementDate: '2025-12-31', evidence: 'Verified employee consent' })) }, context));
    return { sql, store, service, grant, request, change, allocations, mapping, carry };
}

test('cancellation restores its own source after closing, without migrating a later valid request', (t) => {
    const h = fixture(t);
    h.request('first', '2025-07-02', 10); h.request('later', '2025-08-02', 20);
    const a = h.allocations().find((row) => row.eventKey === 'm6'), b = h.allocations().find((row) => row.eventKey === 'y1' && row.year === 2025);
    eq(a.usedHours, '24'); eq(b.usedHours, '6'); eq(b.availableHours, '22');
    const laterMapping = h.mapping('later'), originalRequest = h.sql.prepare('SELECT * FROM leave_requests WHERE id=?').get('later');
    h.carry([b]);
    const laterLedgerCount = h.sql.prepare('SELECT COUNT(*) AS n FROM annual_leave_ledger WHERE request_id=?').get('later').n;
    h.change('first', { status: 'cancelled' });
    assert.deepEqual(h.mapping('later'), laterMapping);
    assert.deepEqual(h.sql.prepare('SELECT * FROM leave_requests WHERE id=?').get('later'), originalRequest);
    assert.equal(h.sql.prepare('SELECT COUNT(*) AS n FROM annual_leave_ledger WHERE request_id=?').get('later').n, laterLedgerCount);
    const after = h.allocations();
    eq(after.find((row) => row.id === a.id).availableHours, '10');
    eq(after.find((row) => row.id === b.id).availableHours, '0');
    eq(sum(after.filter((row) => row.kind === 'carry').map((row) => row.grantHours)), '22');
    const snapshots = h.sql.prepare("SELECT data_json FROM annual_leave_ledger WHERE request_id='first' AND action='allocation_snapshot' ORDER BY rowid").all().map((row) => JSON.parse(row.data_json));
    assert.deepEqual(snapshots.at(-1).after, []);
    assert.equal(snapshots.at(-1).before[0].allocationId, a.id);
});

test('new backdated requests cannot steal capacity already assigned to an unchanged later request', (t) => {
    const h = fixture(t);
    h.request('existing', '2025-08-02', 28);
    const preserved = h.mapping('existing');
    h.request('new-backdated', '2025-07-02', 10);
    assert.deepEqual(h.mapping('existing'), preserved);
    const newMapping = h.mapping('new-backdated'), source = h.allocations().find((row) => row.id === newMapping[0].allocationId);
    assert.equal(source.eventKey, 'y1'); eq(newMapping[0].amount, '10');
});

test('status changes and reduced or shifted paper leave preserve eligible original sources', (t) => {
    const h = fixture(t);
    h.request('pending', '2025-07-02', 28, 'pending_admin');
    const held = h.mapping('pending');
    h.change('pending', { status: 'approved' });
    assert.deepEqual(h.mapping('pending'), held.map((row) => ({ ...row, status: 'used' })));
    h.change('pending', { date: '2025-08-02', hours: 20 });
    const reduced = h.mapping('pending');
    assert.equal(reduced.length, 1); assert.equal(reduced[0].allocationId, held[0].allocationId); eq(reduced[0].amount, '20');
    assert.equal(reduced[0].date, '2025-08-02');
    h.change('pending', { date: '2026-02-02' });
    const moved = h.mapping('pending');
    assert.equal(moved.length, 1); assert.notEqual(moved[0].allocationId, reduced[0].allocationId);
    assert.equal(h.allocations().find((a) => a.id === moved[0].allocationId).year, 2026);
    eq(h.allocations().find((a) => a.id === reduced[0].allocationId).usedHours, '0');
    const count = h.sql.prepare('SELECT COUNT(*) AS n FROM annual_leave_ledger').get().n;
    h.store.reconcile(); h.store.reconcile();
    assert.equal(h.sql.prepare('SELECT COUNT(*) AS n FROM annual_leave_ledger').get().n, count);
});

test('new carry is used first by new requests while existing current-year deductions stay intact', (t) => {
    const h = fixture(t);
    h.request('before-carry', '2026-01-02', 8);
    const before = h.mapping('before-carry');
    h.carry(h.allocations().filter((row) => row.year === 2025));
    assert.deepEqual(h.mapping('before-carry'), before);
    h.request('after-carry', '2026-02-02', 10);
    assert.ok(h.mapping('after-carry').every((piece) => h.allocations().find((row) => row.id === piece.allocationId).kind === 'carry'));
    eq(sum(h.mapping('after-carry').map((piece) => piece.amount)), '10');
});

test('later grants fund only the previously unfunded remainder and preserve existing backed portions', (t) => {
    const h = fixture(t, { initialAsOf: '2025-01-01' });
    h.request('needs-more', '2025-08-02', 30);
    const before = h.mapping('needs-more');
    eq(before.find((piece) => piece.allocationId).amount, '24'); eq(before.find((piece) => !piece.allocationId).amount, '6');
    h.grant();
    const after = h.mapping('needs-more');
    eq(after.find((piece) => piece.allocationId === before[0].allocationId).amount, '24');
    assert.ok(after.every((piece) => piece.allocationId)); eq(sum(after.map((piece) => piece.amount)), '30');
    eq(h.store.balances(['E001'], 2025)[0].exact.availableHours, '22');
});

test('anniversary summaries convert overlapping eight-hour and four-hour sources independently', (t) => {
    const h = fixture(t, { period: 'anniversary' });
    h.service({ serviceEffectiveFrom: '2026-01-01', employmentType: 'part_time_same_days', dayHours: '4' });
    h.grant(2026);
    h.request('old-eight-hour', '2026-02-02', 8); h.request('new-four-hour', '2026-08-02', 4);
    const balance = h.store.balances(['E001'], 2026)[0];
    eq(balance.exact.grantHours, '96'); eq(balance.exact.availableHours, '84'); eq(balance.exact.availableDays, '15');
    assert.equal(balance.grantDays, 17); assert.equal(balance.mixedDayHours, true); assert.equal(balance.dayHours, null);
});
