const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const Database = require('better-sqlite3');
const { calculateOvertimePeriod } = require('../overtime-duration');
const dbModule = require('../database');
const { startFixture } = require('./fixtures/browser-server');

test('net overtime floors actual elapsed milliseconds minus whole rest minutes and rejects ambiguous values', () => {
    assert.deepEqual(calculateOvertimePeriod(0, 121 * 60000, { breakMinutes: 30, durationHours: 999 }), { break_minutes: 30, duration_hours: 1.51 });
    assert.deepEqual(calculateOvertimePeriod(0, 3659000, {}), { break_minutes: 0, duration_hours: 1.01 });
    assert.equal(calculateOvertimePeriod(0, 61 * 60000, { breakMinutes: '1' }).duration_hours, 1);
    for (const value of ['', ' ', null, true, false, [], {}, -1, '1.5', 0.5, 'NaN', Infinity, 121, Number.MAX_SAFE_INTEGER]) {
        assert.throws(() => calculateOvertimePeriod(0, 121 * 60000, { breakMinutes: value }), (error) => error.statusCode === 400);
    }
    assert.throws(() => calculateOvertimePeriod(0, 3600000, { breakMinutes: 1, break_minutes: 2 }), /不一致/);
    assert.throws(() => calculateOvertimePeriod(0, 30000, { breakMinutes: 0 }), /大於 0/);
    assert.throws(() => calculateOvertimePeriod(0, 7200000, { durationHours: 1.5 }, { rejectLegacyHoursMismatch: true }), /重新載入/);
    assert.equal(calculateOvertimePeriod(0, 7200000, { durationHours: 2 }, { rejectLegacyHoursMismatch: true }).break_minutes, 0);
});

test('legacy SQLite upgrade leaves recorded overtime hours and unknown breaks unchanged across reopen', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tanchin-old-overtime-breaks-')), file = path.join(directory, 'old.db');
    const legacy = new Database(file);
    legacy.exec(`CREATE TABLE overtime_requests (id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, applicant_id TEXT NOT NULL, applicant_role TEXT,
        start_at INTEGER NOT NULL, end_at INTEGER NOT NULL, duration_hours REAL, reason TEXT, status TEXT, supervisor_id TEXT,
        supervisor_decision TEXT, supervisor_comment TEXT, supervisor_decided_at INTEGER, created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL, withdrawn_at INTEGER, cancelled_at INTEGER);
        INSERT INTO overtime_requests(id,employee_id,applicant_id,start_at,end_at,duration_hours,status,created_at,updated_at)
        VALUES('legacy','E1','E1',1000,7201000,1.33,'approved',1000,1000);`);
    const before = legacy.prepare('SELECT * FROM overtime_requests').get(); legacy.close();
    try {
        for (let attempt = 0; attempt < 2; attempt++) {
            dbModule.init(file);
            const row = dbModule.getOvertimeRequestById('legacy');
            for (const [key, value] of Object.entries(before)) assert.equal(row[key], value);
            assert.equal(row.break_minutes, null);
            dbModule.close();
        }
    } finally { dbModule.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});

test('self and supervisor HTTP requests store authoritative net hours, preserve history and export nullable rest', async (t) => {
    const fixture = await startFixture(), { db, url } = fixture, sql = new Database(fixture.databasePath);
    t.after(async () => { sql.close(); await fixture.close(); });
    db.setSetting('browserSecuritySettings', { deviceBindingEnabled: false, gpsRequiredOnPunch: false });
    db.saveLeaveApprovalRoutes([{ department: '*', supervisor_id: 'A001', enabled: true }]);
    const audit = (entry) => ({ ...entry, actor_id: '__fixture__' });
    for (const employeeId of ['E001', 'A002']) db.getSupervisors().saveAssignments({ employeeId, supervisorIds: ['A001'], reason: 'Fixture grant',
        revision: db.getSupervisors().assignmentsState().employees.find((row) => row.id === employeeId).revision }, audit);
    const api = async (route, body, token) => {
        const response = await fetch(url + '/api/browser' + route, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
        return { status: response.status, ...await response.json() };
    };
    const employee = await api('/login', { employeeId: 'E001', secret: 'employee-card', role: 'account' });
    const managerLogin = await api('/login', { employeeId: 'A001', secret: 'A001-test-password', role: 'account' });
    const manager = await api('/workspace', { role: 'employee' }, managerLogin.token);
    const base = { startDate: '2035-01-03', endDate: '2035-01-03', startTime: '18:00', endTime: '20:01', breakMinutes: 30, durationHours: 999, reason: 'Fixture employee rest' };
    const selfRoute = '/employee/overtime/request', proxyRoute = '/employee/supervisor/overtime';
    await t.test('explicit rest is authoritative and absent rest has safe legacy compatibility', async () => {
        assert.equal((await api(selfRoute, base, employee.token)).status, 200);
        const row = db.queryOvertimeRequests({ employeeId: 'E001' })[0];
        assert.equal(row.break_minutes, 30); assert.equal(row.duration_hours, 1.51); assert.equal(row.status, 'pending_supervisor');
        const { breakMinutes, ...old } = base;
        assert.equal((await api(selfRoute, { ...old, startDate: '2035-01-04', endDate: '2035-01-04', durationHours: 1.5 }, employee.token)).status, 400);
        assert.equal((await api(selfRoute, { ...old, startDate: '2035-01-04', endDate: '2035-01-04', durationHours: 2.01 }, employee.token)).status, 200);
        assert.equal(db.queryOvertimeRequests({ employeeId: 'E001' })[0].break_minutes, 0);
        const before = db.countOvertimeRequests();
        for (const value of [null, '', true, -1, 121, 1.5]) assert.equal((await api(selfRoute, { ...base, breakMinutes: value }, employee.token)).status, 400);
        assert.equal(db.countOvertimeRequests(), before);
        assert.equal((await api(selfRoute, { ...base, employeeId: 'A002' }, employee.token)).status, 403);
    });
    let batchIds;
    await t.test('overnight supervisor batch applies identical rest/net hours to each authorized employee', async () => {
        const body = { ...base, startDate: '2035-01-10', endDate: '2035-01-11', startTime: '23:30', endTime: '01:31', breakMinutes: 31,
            employeeIds: ['A002', 'E001'], proxyReason: 'Fixture authorized batch', confirmApproval: true };
        const result = await api(proxyRoute, body, manager.token);
        assert.equal(result.status, 200, result.error); batchIds = result.requestIds;
        for (const id of batchIds) { const row = db.getOvertimeRequestById(id); assert.equal(row.break_minutes, 31); assert.equal(row.duration_hours, 1.5); assert.equal(row.end_at - row.start_at, 121 * 60000); }
        const before = db.countOvertimeRequests();
        assert.equal((await api(proxyRoute, { ...body, breakMinutes: null }, manager.token)).status, 400);
        assert.equal((await api(proxyRoute, { ...body, employeeIds: ['E001', 'D001'] }, manager.token)).status, 403);
        assert.equal(db.countOvertimeRequests(), before);
    });
    await t.test('audit failure atomically rolls back new requests, approval steps and the first employee of a batch', async () => {
        const snapshot = () => JSON.stringify(['overtime_requests', 'overtime_approval_steps', 'audit_logs'].map((table) => sql.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
        const before = snapshot();
        sql.exec("CREATE TRIGGER fail_overtime_break BEFORE INSERT ON audit_logs WHEN NEW.target_type='overtime_request' AND json_extract(NEW.after_data,'$.employee_id')='E001' BEGIN SELECT RAISE(ABORT,'fixture audit failure'); END");
        try {
            assert.equal((await api(selfRoute, { ...base, startDate: '2035-01-20', endDate: '2035-01-20' }, employee.token)).status, 500);
            assert.equal(snapshot(), before);
            assert.equal((await api(proxyRoute, { ...base, startDate: '2035-01-21', endDate: '2035-01-21', employeeIds: ['A002', 'E001'], proxyReason: 'Fixture rollback', confirmApproval: true }, manager.token)).status, 500);
            assert.equal(snapshot(), before);
        } finally { sql.exec('DROP TRIGGER fail_overtime_break'); }
    });
    await t.test('dashboard, calendar, external request API and SQLite backup retain net hours and explicit/unknown rest', async () => {
        const legacyId = 'legacy-not-inferred';
        db.createOvertimeRequest({ id: legacyId, employee_id: 'E001', applicant_id: 'E001', applicant_role: 'employee', supervisor_id: 'A001', status: 'approved', start_at: Date.parse('2035-01-01T18:00:00+08:00'), end_at: Date.parse('2035-01-01T20:00:00+08:00'), duration_hours: 1.33, reason: 'Historical manual net hours', created_at: 1, updated_at: 1 });
        const calendar = await api('/employee/overtime/calendar?month=2035-01', null, employee.token);
        assert.equal(calendar.status, 200);
        const newEvent = calendar.calendar.events.find((row) => row.id === batchIds[1]);
        assert.equal(newEvent.breakMinutes, 31); assert.equal(newEvent.hours, 1.5);
        assert.equal(calendar.calendar.events.find((row) => row.id === legacyId).breakMinutes, null);
        const detail = calendar.calendar.detail.records.find((row) => row.id === batchIds[1]);
        assert.equal(detail.breakMinutes, 31); assert.equal(detail.break_minutes, 31);
        const secret = 'fixture-overtime-export-key';
        db.setSetting('externalApiEnabled', true); db.saveExternalApiKey({ id: 'fixture-overtime', name: 'Fixture only', key_hash: crypto.createHash('sha256').update(secret).digest('hex'), permissions: ['overtime'], enabled: true });
        const response = await fetch(url + '/api/overtime-requests?start=2035-01-01&end=2035-01-31', { headers: { 'X-API-Key': secret } });
        assert.equal(response.status, 200); const external = (await response.json()).data;
        assert.equal(external.find((row) => row.id === batchIds[1]).breakMinutes, 31);
        assert.equal(external.find((row) => row.id === legacyId).breakMinutes, null);
        assert.equal(external.find((row) => row.id === legacyId).duration_hours, 1.33);
        const backup = path.join(fixture.directory, 'rest-backup.db'); await db.backupDatabase(backup);
        const copy = new Database(backup, { readonly: true });
        try { assert.equal(copy.prepare('SELECT break_minutes FROM overtime_requests WHERE id=?').get(batchIds[1]).break_minutes, 31); }
        finally { copy.close(); }
        assert.throws(() => db.createOvertimeRequest({ ...db.getOvertimeRequestById(batchIds[1]), id: 'tampered-storage', duration_hours: 9 }), /不一致/);
    });
});

test('paper overtime create/correct authoritatively calculate rest and preserve legacy unknown hours until explicit confirmation', async (t) => {
    const fixture = await startFixture(), { db, url } = fixture, sql = new Database(fixture.databasePath);
    t.after(async () => { sql.close(); await fixture.close(); });
    db.setSetting('browserSecuritySettings', { deviceBindingEnabled: false, gpsRequiredOnPunch: false });
    const api = async (route, body, token) => { const response = await fetch(url + '/api/browser' + route, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: response.status, ...await response.json() }; };
    const login = async (id, role) => { const account = await api('/login', { employeeId: id, secret: id + '-test-password', role: 'account' }); return api('/workspace', { role }, account.token); };
    const admin = await login('A001', 'admin'), limited = await login('A002', 'admin'), employee = await login('A001', 'employee');
    const route = '/admin/overtime/paper-approved';
    const body = { employeeIds: ['E001', 'A002'], startDate: '2035-02-01', endDate: '2035-02-01', startTime: '18:00', endTime: '20:01', breakMinutes: 30, durationHours: 999, reason: 'Paper fixture', paperNo: 'TEST-01', approvedBy: 'Fixture approver' };
    for (const token of [limited.token, employee.token]) assert.equal((await api(route, body, token)).status, 403);
    db.setSetting('systemPassword', 'paper-rest-fixture'); db.setSetting('developerImpersonationEnabled', true);
    const developer = await login('D001', 'developer');
    assert.equal((await api('/developer/impersonation/start', { targetRole: 'admin', targetEmployeeId: 'A001', systemPassword: 'paper-rest-fixture' }, developer.token)).status, 200);
    assert.equal((await api(route, body, developer.token)).status, 403);
    assert.equal((await api(route, body, admin.token)).status, 200);
    const created = db.queryOvertimeRequests({ startAt: 0, limit: null });
    assert.equal(created.length, 2);
    assert.ok(created.every((row) => row.duration_hours === 1.51 && row.break_minutes === 30 && row.approval_mode === 'admin_paper_approved'));
    const original = created.find((row) => row.employee_id === 'E001');
    const corrected = { ...body, requestId: original.id, employeeIds: ['E001'], startDate: '2035-02-02', endDate: '2035-02-03', startTime: '23:30', endTime: '01:31', breakMinutes: 31 };
    assert.equal((await api(route + '/correct', corrected, developer.token)).status, 403);
    assert.equal((await api(route + '/correct', corrected, admin.token)).status, 200);
    assert.equal(db.getOvertimeRequestById(original.id).duration_hours, 1.5);
    assert.equal(db.getOvertimeRequestById(original.id).break_minutes, 31);
    assert.equal(db.countOvertimeRequests(), 2);
    const beforeBadCorrection = db.getOvertimeRequestById(original.id);
    assert.equal((await api(route + '/correct', { ...corrected, employeeIds: ['E001', 'A002'] }, admin.token)).status, 400);
    for (const value of ['', null, true, -1, 121, 0.5]) assert.equal((await api(route + '/correct', { ...corrected, breakMinutes: value }, admin.token)).status, 400);
    assert.deepEqual(db.getOvertimeRequestById(original.id), beforeBadCorrection);
    const legacy = { id: 'paper-legacy-null', employee_id: 'E001', applicant_id: 'A001', applicant_role: 'admin_paper_proxy', start_at: Date.parse('2035-02-10T18:00:00+08:00'), end_at: Date.parse('2035-02-10T20:00:00+08:00'), duration_hours: 1.5, status: 'approved', supervisor_id: 'A001', approval_mode: 'admin_paper_approved', reason: 'Historical net hours', created_at: 1, updated_at: 1 };
    db.createOvertimeRequest(legacy);
    const beforeLegacy = db.getOvertimeRequestById(legacy.id);
    const legacyEdit = { ...body, requestId: legacy.id, employeeIds: ['E001'], startDate: '2035-02-10', endDate: '2035-02-10', endTime: '20:00' };
    assert.equal((await api(route + '/correct', legacyEdit, admin.token)).status, 400);
    const { breakMinutes, ...missingRest } = legacyEdit;
    assert.equal((await api(route + '/correct', { ...missingRest, confirmLegacyBreak: true }, admin.token)).status, 400);
    assert.deepEqual(db.getOvertimeRequestById(legacy.id), beforeLegacy);
    assert.equal((await api(route + '/correct', { ...legacyEdit, confirmLegacyBreak: true }, admin.token)).status, 200);
    assert.equal(db.getOvertimeRequestById(legacy.id).duration_hours, 1.5);
    assert.equal(db.getOvertimeRequestById(legacy.id).break_minutes, 30);
    const { breakMinutes: unused, ...oldCreate } = body;
    assert.equal((await api(route, { ...oldCreate, startDate: '2035-02-11', endDate: '2035-02-11', durationHours: 1 }, admin.token)).status, 400);
    const snapshot = () => JSON.stringify(['overtime_requests', 'overtime_approval_steps', 'audit_logs'].map((table) => sql.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
    const beforeFailure = snapshot();
    sql.exec("CREATE TRIGGER fail_paper_rest BEFORE INSERT ON audit_logs WHEN NEW.target_type='overtime_request' AND json_extract(NEW.after_data,'$.employee_id')='A002' BEGIN SELECT RAISE(ABORT,'fixture second paper audit failure'); END");
    try {
        assert.equal((await api(route, { ...body, startDate: '2035-02-20', endDate: '2035-02-20' }, admin.token)).status, 500);
        assert.equal(snapshot(), beforeFailure, 'second employee audit failure rolls back the entire paper batch');
    } finally { sql.exec('DROP TRIGGER fail_paper_rest'); }
    sql.exec("CREATE TRIGGER fail_paper_rest_correct BEFORE INSERT ON audit_logs WHEN NEW.action='correct' AND NEW.target_type='overtime_request' BEGIN SELECT RAISE(ABORT,'fixture paper correction audit failure'); END");
    try {
        assert.equal((await api(route + '/correct', { ...corrected, breakMinutes: 30 }, admin.token)).status, 500);
        assert.equal(snapshot(), beforeFailure, 'correction failure preserves hours, rest and approval steps');
    } finally { sql.exec('DROP TRIGGER fail_paper_rest_correct'); }
    assert.throws(() => db.updatePaperOvertimeRequest({ requestId: original.id, updates: { ...beforeBadCorrection, break_minutes: 31, duration_hours: 99 }, auditLog: { action: 'correct' } }), /不一致/);
    assert.equal((await api(route + '/correct', { ...corrected, requestId: 'absent' }, admin.token)).status, 404);
});

test('paper overtime UI computes read-only net hours while legacy null rest retains recorded hours until explicit entry', () => {
    const source = fs.readFileSync(path.join(__dirname, '../browser-client/app.js'), 'utf8');
    const start = source.indexOf('function calculatePaperOvertimeNet('), end = source.indexOf('const previousPostRenderPaperOvertimeNet', start);
    const context = vm.createContext({ Date, Number, Object, Error });
    vm.runInContext(source.slice(start, end), context);
    context.values = { startDate: '2035-02-02', endDate: '2035-02-03', startTime: '23:30', endTime: '01:31', breakMinutes: '31' };
    assert.equal(vm.runInContext('calculatePaperOvertimeNet(values).durationHours', context), 1.5);
    const fields = Object.fromEntries(Object.entries(context.values).map(([name, value]) => [name, { value }]));
    fields.durationHours = { value: '1.33' }; fields.breakMinutes = { value: '', setCustomValidity(message) { this.validationMessage = message; } };
    fields.confirmLegacyBreak = { checked: false };
    const label = { hidden: true };
    context.form = { dataset: {}, elements: { namedItem: (name) => fields[name] }, querySelector: () => label };
    vm.runInContext('setPaperOvertimeRestState(form,{breakMinutes:null})', context);
    assert.equal(label.hidden, false); assert.equal(fields.confirmLegacyBreak.required, true);
    assert.equal(vm.runInContext('syncPaperOvertimeNet(form)', context), null);
    assert.equal(fields.durationHours.value, '1.33', 'opening old record does not infer zero rest or enlarge hours');
    fields.breakMinutes.value = '31';
    assert.equal(vm.runInContext('syncPaperOvertimeNet(form).durationHours', context), 1.5);
    assert.equal(fields.durationHours.value, '1.5');
    const renderStart = source.indexOf('function renderAdminPaperOvertimeForm('), renderEnd = source.indexOf('\nfunction ', renderStart + 1);
    const formMarkup = source.slice(renderStart, renderEnd);
    assert.match(formMarkup, /name="breakMinutes"[^>]*value="0" required/);
    assert.match(formMarkup, /name="durationHours"[^>]*readonly aria-readonly="true"/);
    assert.match(formMarkup, /data-paper-legacy-rest-confirm hidden/);
});
