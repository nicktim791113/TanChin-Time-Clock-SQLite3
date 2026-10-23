const assert = require('node:assert/strict');
const { test } = require('node:test');
const { startFixture } = require('./fixtures/browser-server');

const at = (date, time) => Date.parse(`${date}T${time}:00+08:00`);
const minute = 60 * 1000;

test('leave attendance tolerance includes exactly 20 minutes, retains interior conflicts and exports its status', async (t) => {
    const originalNow = Date.now;
    Date.now = () => at('2026-10-23', '12:00');
    let fixture;
    t.after(async () => { if (fixture) await fixture.close(); Date.now = originalNow; });
    fixture = await startFixture();
    const { db } = fixture;
    db.setSetting('browserSecuritySettings', { deviceBindingEnabled: false, gpsRequiredOnPunch: false });
    const api = async (route, token, body) => {
        const response = await fetch(fixture.url + '/api/browser' + route, {
            method: body ? 'POST' : 'GET',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            ...(body ? { body: JSON.stringify(body) } : {})
        });
        return { status: response.status, ...await response.json() };
    };
    const account = await api('/login', null, { employeeId: 'A001', secret: 'A001-test-password', role: 'account' });
    const admin = await api('/workspace', account.token, { role: 'admin' });
    assert.equal(admin.status, 200, admin.error);
    const leaveTypeId = db.loadLeaveTypes().find((row) => row.enabled && !row.deducts_balance).id;
    const create = (id, segments) => db.createLeaveRequest({ id, employee_id: 'E001', leave_type_id: leaveTypeId,
        status: 'approved', supervisor_id: 'A001', date_selection_mode: 'explicit_segments',
        leave_segments: segments.map(([startAt, endAt, hours]) => ({ startAt, endAt, hours })),
        reason: 'Attendance audit test', created_at: 1, updated_at: 1 });
    const punch = (timestamp, extra = {}) => db.addPunchRecord({ id: 'E001', timestamp, type: 'in',
        shift: 'Test', status: '正常', source: 'manual', ...extra });
    const start = at('2026-10-10', '09:00'), end = at('2026-10-10', '11:00');
    create('boundary-matrix', [[start, end, 2]]);
    const expected = new Map([
        [start - 20 * minute - 1, null], [start - 20 * minute, 'warning'],
        [start, 'warning'], [start + 20 * minute, 'warning'], [start + 20 * minute + 1, 'danger'],
        [end - 20 * minute - 1, 'danger'], [end - 20 * minute, 'warning'],
        [end, 'warning'], [end + 20 * minute, 'warning'], [end + 20 * minute + 1, null]
    ]);
    for (const timestamp of expected.keys()) punch(timestamp);
    punch(start + 10 * minute, { status: '重複打卡' });
    punch(start + 11 * minute, { type: 'unknown' });
    const originals = db.loadPunchRecords();
    const dashboard = await api('/dashboard', admin.token);
    assert.equal(dashboard.status, 200, dashboard.error);
    const rows = dashboard.dashboard.datasets.leave.alerts.filter((row) => row.requestId === 'boundary-matrix');
    assert.equal(rows.length, [...expected.values()].filter(Boolean).length);
    for (const [timestamp, severity] of expected) {
        const matches = rows.filter((row) => row.punchAt === timestamp);
        assert.equal(matches.length, severity ? 1 : 0, `one classification for ${timestamp}`);
        if (!severity) continue;
        assert.equal(matches[0].severity, severity);
        assert.equal(matches[0].alertType, severity === 'warning' ? 'leave_boundary_tolerance' : 'leave_window_punch_conflict');
        assert.equal(matches[0].alertText, severity === 'warning' ? '容許時間範圍' : '請假期間有打卡');
        assert.equal(matches[0].startAt, start);
        assert.equal(matches[0].endAt, end);
    }
    const exported = await api('/admin/leave-audit/export', admin.token, {});
    assert.equal(exported.status, 200, exported.error);
    assert.match(exported.data.csvContent, /容許時間範圍/);
    assert.match(exported.data.csvContent, /請假期間有打卡/);
    assert.deepEqual(db.loadPunchRecords(), originals, 'classification and CSV export do not rewrite punches');
    assert.equal(db.getLeaveRequestById('boundary-matrix').status, 'approved');

    const employee = await api('/login', null, { employeeId: 'E001', secret: 'employee-card', role: 'account' });
    assert.equal((await api('/admin/leave-audit/export', employee.token, {})).status, 403);
});

test('actual segment boundaries handle gaps and midnight without suppressing independent daily attendance warnings', async (t) => {
    const originalNow = Date.now;
    Date.now = () => at('2026-10-23', '12:00');
    let fixture;
    t.after(async () => { if (fixture) await fixture.close(); Date.now = originalNow; });
    fixture = await startFixture();
    const { db } = fixture;
    db.setSetting('browserSecuritySettings', { deviceBindingEnabled: false, gpsRequiredOnPunch: false });
    const api = async (route, token, body) => {
        const response = await fetch(fixture.url + '/api/browser' + route, {
            method: body ? 'POST' : 'GET',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            ...(body ? { body: JSON.stringify(body) } : {})
        });
        const result = await response.json();
        assert.equal(response.status, 200, result.error);
        return result;
    };
    const account = await api('/login', null, { employeeId: 'A001', secret: 'A001-test-password', role: 'account' });
    const admin = await api('/workspace', account.token, { role: 'admin' });
    const leaveTypeId = db.loadLeaveTypes().find((row) => row.enabled && !row.deducts_balance).id;
    const create = (id, segments) => db.createLeaveRequest({ id, employee_id: 'E001', leave_type_id: leaveTypeId,
        status: 'approved', supervisor_id: 'A001', date_selection_mode: 'explicit_segments',
        leave_segments: segments.map(([startAt, endAt, hours]) => ({ startAt, endAt, hours })),
        reason: 'Precise segment audit test', created_at: 1, updated_at: 1 });
    const punch = (timestamp) => db.addPunchRecord({ id: 'E001', timestamp, type: 'out', shift: 'Test', status: '正常', source: 'manual' });
    create('gaps', [[at('2026-10-10', '09:00'), at('2026-10-10', '11:00'), 2],
        [at('2026-10-10', '11:20'), at('2026-10-10', '13:20'), 2],
        [at('2026-10-10', '15:00'), at('2026-10-10', '16:00'), 1]]);
    for (const time of ['09:40', '11:10', '14:00']) punch(at('2026-10-10', time));
    create('full-day', [[at('2026-10-11', '08:20'), at('2026-10-11', '17:00'), 8]]);
    for (const time of ['08:00', '18:00']) punch(at('2026-10-11', time));
    create('missing-day', [[at('2026-10-12', '09:00'), at('2026-10-12', '11:00'), 2],
        [at('2026-10-12', '14:00'), at('2026-10-12', '16:00'), 2]]);
    create('midnight-start', [[at('2026-10-15', '00:00'), at('2026-10-15', '02:00'), 2]]);
    punch(at('2026-10-14', '23:40'));
    punch(at('2026-10-14', '23:40') - 1);
    punch(at('2026-10-15', '01:00'));
    create('midnight-end', [[at('2026-10-16', '22:00'), at('2026-10-17', '00:00'), 2]]);
    punch(at('2026-10-16', '23:00'));
    punch(at('2026-10-17', '00:20'));
    punch(at('2026-10-17', '00:20') + 1);
    // The request starts just outside the default report end (now), while the
    // actual punch is in range. The widened leave query must still find it.
    create('upcoming-boundary', [[at('2026-10-23', '12:10'), at('2026-10-23', '14:10'), 2]]);
    punch(at('2026-10-23', '11:50'));
    // The report covers the most recent 60 days. Exactly 20 minutes after a
    // leave's end still qualifies when that punch is the first report instant.
    const reportStart = Date.now() - 60 * 24 * 60 * minute;
    create('report-start-boundary', [[reportStart - 140 * minute, reportStart - 20 * minute, 2]]);
    punch(reportStart);
    create('touching-segments', [[at('2026-10-18', '09:00'), at('2026-10-18', '09:10'), 0.16],
        [at('2026-10-18', '09:10'), at('2026-10-18', '12:00'), 2.83]]);
    punch(at('2026-10-18', '09:15'));
    punch(at('2026-10-18', '09:30'));
    db.createLeaveRequest({ id: 'legacy-midnight', employee_id: 'E001', leave_type_id: leaveTypeId,
        start_at: at('2026-10-19', '08:20'), end_at: at('2026-10-21', '17:00'), duration_hours: 24,
        date_selection_mode: 'legacy_range', status: 'approved', supervisor_id: 'A001',
        reason: 'Legacy midnight is a report split, not an actual leave boundary', created_at: 1, updated_at: 1 });
    punch(at('2026-10-20', '00:00'));
    const alerts = (await api('/dashboard', admin.token)).dashboard.datasets.leave.alerts;
    const forRequest = (id) => alerts.filter((row) => row.requestId === id);
    const gaps = forRequest('gaps');
    assert.equal(gaps.length, 2);
    assert.equal(gaps.find((row) => row.punchAt === at('2026-10-10', '09:40')).severity, 'danger');
    assert.equal(gaps.find((row) => row.punchAt === at('2026-10-10', '11:10')).severity, 'warning');
    assert.equal(gaps.filter((row) => row.punchAt === at('2026-10-10', '11:10')).length, 1, 'a small gap between two boundaries gets one tolerance row');
    assert.equal(gaps.some((row) => row.punchAt === at('2026-10-10', '14:00')), false, 'a genuine gap outside tolerance is not a leave conflict');
    assert.deepEqual(forRequest('full-day').map((row) => row.alertType).sort(), ['full_day_leave_with_attendance', 'leave_boundary_tolerance']);
    const missing = forRequest('missing-day');
    assert.equal(missing.length, 1);
    assert.equal(missing[0].alertType, 'partial_leave_missing_attendance');
    assert.equal(missing[0].durationHours, 4);
    for (const [id, tolerancePunch] of [['midnight-start', at('2026-10-14', '23:40')], ['midnight-end', at('2026-10-17', '00:20')]]) {
        const rows = forRequest(id);
        assert.equal(rows.length, 2, 'midnight has one boundary warning and one genuine interior conflict');
        assert.equal(rows.find((row) => row.punchAt === tolerancePunch).alertType, 'leave_boundary_tolerance');
        assert.equal(rows.filter((row) => row.severity === 'danger').length, 1);
    }
    assert.equal(forRequest('upcoming-boundary').length, 1);
    assert.equal(forRequest('upcoming-boundary')[0].alertType, 'leave_boundary_tolerance');
    assert.equal(forRequest('report-start-boundary').length, 1);
    assert.equal(forRequest('report-start-boundary')[0].alertType, 'leave_boundary_tolerance',
        'an end exactly 20 minutes before the report lower bound remains inclusive');
    assert.equal(forRequest('report-start-boundary')[0].punchAt, reportStart);
    assert.equal(forRequest('touching-segments').find((row) => row.punchAt === at('2026-10-18', '09:15')).severity, 'warning',
        'the original continuous block start remains eligible across a touching row');
    assert.equal(forRequest('touching-segments').find((row) => row.punchAt === at('2026-10-18', '09:30')).severity, 'danger',
        'an internal touching endpoint does not create a new tolerance window');
    assert.equal(forRequest('legacy-midnight').length, 1);
    assert.equal(forRequest('legacy-midnight')[0].severity, 'danger', 'daily report splits must not downgrade a conflict deep inside legacy leave');
});
