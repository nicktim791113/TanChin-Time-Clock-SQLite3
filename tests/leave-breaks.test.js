const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const db = require('../database');
const { normalizeLeaveSegments } = require('../leave-date-selection');
const { startFixture } = require('./fixtures/browser-server');
const at = (date, time) => Date.parse(`${date}T${time}:00+08:00`);
const period = (date = '2026-11-03', extra = {}) => ({ startAt: at(date, '08:20'), endAt: at(date, '17:00'), hours: 8, breakMinutes: 40, ...extra });
const selection = (row) => ({ date_selection_mode: 'explicit_segments', leave_segments: [row] });

test('rest minutes are optional historic metadata but constrain new net hours on the server', () => {
    assert.equal(normalizeLeaveSegments(selection(period())).duration_hours, 8);
    assert.equal(normalizeLeaveSegments(selection(period(undefined, { breakMinutes: '40' }))).leave_segments[0].breakMinutes, 40);
    assert.equal(normalizeLeaveSegments(selection(period(undefined, { breakMinutes: 0 }))).leave_segments[0].breakMinutes, 0);
    assert.equal(normalizeLeaveSegments(selection(period(undefined, { hours: 7.5 }))).duration_hours, 7.5, 'manual net hours remain supported');
    const old = period(); delete old.breakMinutes;
    assert.equal(Object.hasOwn(normalizeLeaveSegments(selection(old)).leave_segments[0], 'breakMinutes'), false);
    for (const value of [-1, 0.5, '', '40.5', true, null, undefined, {}, Infinity, 520, 99999]) {
        assert.throws(() => normalizeLeaveSegments(selection(period(undefined, { breakMinutes: value }))), { statusCode: 400 });
    }
    assert.throws(() => normalizeLeaveSegments(selection(period(undefined, { hours: 8.01 }))), /扣除休息/);
});

test('rest migration leaves historic rows and charges intact; storage, reopen and correction retain explicit rest', (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tanchin-rest-'));
    const filename = path.join(directory, 'isolated.db');
    t.after(() => { db.close(); fs.rmSync(directory, { recursive: true, force: true }); });
    db.init(filename);
    db.saveEmployees([{ id: 'E1', name: 'Rest fixture', card: 'fixture-card' }]);
    const old = period(); delete old.breakMinutes;
    const make = (id, row) => db.createLeaveRequest({ id, employee_id: 'E1', leave_type_id: 'personal', supervisor_id: null, status: 'approved', approval_mode: 'admin_paper_approved',
        reason: 'Rest fixture', created_at: Date.now(), updated_at: Date.now(), ...selection(row) });
    const original = make('historic', old);
    db.close();
    const previousSchema = new Database(filename);
    previousSchema.exec('ALTER TABLE leave_request_segments DROP COLUMN break_minutes');
    previousSchema.close();
    db.init(filename);
    assert.deepEqual(db.getLeaveRequestById('historic'), original, 'upgrade must not infer lunch or deduct historic hours');
    const current = make('current', period('2026-11-04'));
    db.close(); db.init(filename);
    assert.deepEqual(db.getLeaveRequestById('current'), current);
    const revised = db.updatePaperLeaveRequest({ requestId: 'current', updates: { ...current,
        leave_segments: current.leave_segments.map((row) => ({ ...row, breakMinutes: 70, hours: 7.5 })) },
        auditLog: { actor_id: 'A1', role: 'admin', action: 'test', target_type: 'leave_request', target_id: 'current', summary: 'Rest correction' } });
    assert.equal(revised.leave_segments[0].breakMinutes, 70);
    assert.equal(revised.leave_segments[0].id, current.leave_segments[0].id);
    assert.equal(revised.duration_hours, 7.5);
    assert.deepEqual(revised.daily_hours, [{ date: '2026-11-04', hours: 7.5 }]);
    const inspect = new Database(filename);
    const audit = JSON.parse(inspect.prepare("SELECT after_json FROM audit_logs WHERE target_id='current' ORDER BY rowid DESC LIMIT 1").get().after_json);
    inspect.close();
    assert.equal(audit.leave_segments[0].breakMinutes, 70);
    const cachedRows = revised.leave_segments.map(({ breakMinutes, ...row }) => row);
    const noteOnly = db.updatePaperLeaveRequest({ requestId: 'current', updates: { ...revised, reason: 'Old cached client note', leave_segments: cachedRows },
        auditLog: { actor_id: 'A1', role: 'admin', action: 'test', target_type: 'leave_request', target_id: 'current', summary: 'Cached client correction' } });
    assert.equal(noteOnly.leave_segments[0].breakMinutes, 70, 'old cached clients cannot erase known rest on an unchanged period');
    assert.deepEqual(db.getLeaveRequestById('historic'), original);
});

test('employee and paper APIs retain net hours and rest through review, calendar, reports and correction', async (t) => {
    const f = await startFixture(); t.after(() => f.close());
    f.db.setSetting('browserSecuritySettings', { deviceBindingEnabled: false, gpsRequiredOnPunch: false });
    f.db.saveLeaveApprovalRoutes([{ department: '*', supervisor_id: 'A001', enabled: true }]);
    const api = async (route, token, body) => {
        const response = await fetch(f.url + '/api/browser' + route, { method: body ? 'POST' : 'GET',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
        return { status: response.status, ...await response.json() };
    };
    const login = async (employeeId, secret, role) => {
        let result = await api('/login', null, { employeeId, secret, role: 'account' });
        if (result.dashboard.role === 'workspace') result = await api('/workspace', result.token, { role });
        assert.equal(result.status, 200, result.error); return result.token;
    };
    const employee = await login('E001', 'employee-card', 'employee');
    const supervisor = await login('A001', 'A001-test-password', 'employee');
    const admin = await login('A001', 'A001-test-password', 'admin');
    const leaveTypeId = f.db.loadLeaveTypes().find((row) => row.enabled && !row.deducts_balance).id;
    const body = { leaveTypeId, dateSelectionMode: 'explicit_segments', leaveSegments: [period('2026-10-12')], reason: 'Rest API fixture' };
    const created = await api('/employee/leave/request', employee, body);
    assert.equal(created.status, 200, created.error);
    const saved = f.db.queryLeaveRequests({ employeeId: 'E001' })[0];
    assert.equal(saved.duration_hours, 8);
    assert.equal(saved.leave_segments[0].breakMinutes, 40);
    assert.equal((await api('/employee/leave/supervisor-decision', supervisor, { requestId: saved.id, decision: 'approved' })).status, 200);
    assert.equal((await api('/admin/leave/final-decision', admin, { requestId: saved.id, decision: 'approved' })).status, 200);
    const calendar = await api(`/employee/leave/calendar?month=2026-10&requestId=${saved.id}`, employee);
    assert.equal(calendar.calendar.request.leaveSegments[0].breakMinutes, 40);
    assert.equal(calendar.calendar.events[0].hours, 8);
    const report = await api('/admin/reports/query', admin, { employeeId: 'E001', startDate: '2026-10-12', endDate: '2026-10-12' });
    assert.equal(report.data.records.find((row) => row.recordKind === 'leave').leaveDurationHours, 8, 'downstream consumers receive net hours once');
    const paper = await api('/admin/leave/paper-approved', admin, { ...body, employeeIds: ['E001'], leaveSegments: [period('2026-10-13')] });
    assert.equal(paper.status, 200, paper.error);
    const original = f.db.queryLeaveRequests({ employeeId: 'E001' }).find((row) => row.approval_mode === 'admin_paper_approved');
    const corrected = await api('/admin/leave/paper-approved/correct', admin, { ...body, requestId: original.id, employeeIds: ['E001'],
        leaveSegments: original.leave_segments.map((row) => ({ ...row, breakMinutes: 70, hours: 7.5 })) });
    assert.equal(corrected.status, 200, corrected.error);
    assert.equal(f.db.getLeaveRequestById(original.id).leave_segments[0].breakMinutes, 70);
    const before = f.db.countLeaveRequests();
    const invalid = { ...body, leaveSegments: [period('2026-10-14', { hours: 8.01 })] };
    assert.equal((await api('/employee/leave/request', employee, invalid)).status, 400);
    assert.equal((await api('/admin/leave/paper-approved', admin, { ...invalid, employeeIds: ['E001'] })).status, 400);
    assert.equal(f.db.countLeaveRequests(), before);
});
