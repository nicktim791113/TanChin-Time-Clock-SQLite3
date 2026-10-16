const assert = require('node:assert/strict');
const { test } = require('node:test');
const Database = require('better-sqlite3');
const XLSX = require('xlsx');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { startFixture } = require('./fixtures/browser-server');

test('employee leave entitlements preserve history and enforce accounting, import and permission boundaries', async (t) => {
    const fixture = await startFixture(), { db, url } = fixture, sql = new Database(fixture.databasePath);
    t.after(async () => { sql.close(); await fixture.close(); });
    db.setSetting('browserSecuritySettings', { deviceBindingEnabled: false, gpsRequiredOnPunch: false });
    db.saveLeaveApprovalRoutes([{ department: '*', supervisor_id: 'A001', enabled: true }]);
    const store = db.getLeaveEntitlements(), audit = (entry) => ({ ...entry, actor_id: '__test__', actor_role: 'system' });
    const type = db.loadLeaveTypes().find((row) => row.deducts_balance).id;
    const row = (employeeId = 'E001', y = 2026, extra = {}) => ({ employeeId, leaveTypeId: type, year: y, grantDays: 10, carryHours: 0, adjustmentHours: 0, mode: 'total', accountingStart: `${y}-01-01`, reason: 'Confirmed entitlement', ...extra });
    function save(rows) { const body = { rows, revision: store.revision() }, preview = store.preview(body); return store.save({ ...body, digest: preview.digest, confirm: true }, audit); }
    const balance = (y = 2026, id = 'E001') => store.balances([id], y)[0];
    function legacy(id, startDate, endDate = startDate, extra = {}) {
        db.createLeaveRequest({ id, employee_id: 'E001', leave_type_id: type, start_at: Date.parse(`${startDate}T09:00:00+08:00`), end_at: Date.parse(`${endDate}T18:00:00+08:00`),
            duration_hours: 8, status: 'approved', supervisor_id: 'A001', reason: 'Historical record', created_at: 1, updated_at: 1, ...extra });
    }
    async function request(route, body, token) {
        const response = await fetch(url + '/api/browser' + route, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
        return { status: response.status, ...await response.json() };
    }
    async function login(employeeId, secret, role = 'employee') {
        let result = await request('/login', { employeeId, secret, role: 'account' });
        if (result.dashboard.role === 'workspace') result = await request('/workspace', { role }, result.token);
        assert.equal(result.status, 200); return result.token;
    }
    const admin = await login('A001', 'A001-test-password', 'admin'), supervisor = await login('A001', 'A001-test-password'), limited = await login('A002', 'A002-test-password', 'admin'), employee = await login('E001', 'employee-card');
    legacy('old-approved', '2026-02-10'); const original = db.getLeaveRequestById('old-approved');
    await t.test('calendar totals include existing approved hours exactly once without rewriting any original data', () => {
        assert.equal(store.settings().dayHours, 8); save([row()]);
        assert.equal(balance().usedHours, 8); assert.equal(balance().availableHours, 72);
        save([row('E001', 2026, { grantDays: 11 })]);
        assert.equal(balance().usedHours, 8); assert.deepEqual(db.getLeaveRequestById('old-approved'), original);
        db.saveEmployees(db.loadEmployees().map((e) => ({ ...e, id: ` ${e.id} ` })));
        assert.equal(balance().usedHours, 8); assert.equal(balance().grantHours, 88);
    });
    await t.test('self and proxy pending are held, management approval converts once and withdrawal/rejection releases', async () => {
        save([row()]);
        const period = { startDate: '2026-10-20', endDate: '2026-10-20', startTime: '09:00', endTime: '18:00', durationHours: 8, leaveTypeId: type, reason: 'Time off' };
        assert.equal((await request('/employee/leave/request', { ...period, durationHours: '' }, employee)).status, 400);
        assert.equal((await request('/employee/leave/request', period, employee)).status, 200);
        const pending = db.queryLeaveRequests({ employeeId: 'E001', status: 'pending_supervisor' })[0];
        assert.equal(balance().heldHours, 8); assert.equal(balance().usedHours, 8);
        assert.equal((await request('/employee/leave/supervisor-decision', { requestId: pending.id, decision: 'approved' }, supervisor)).status, 200);
        assert.equal(balance().heldHours, 8);
        assert.equal((await request('/admin/leave/final-decision', { requestId: pending.id, decision: 'approved' }, admin)).status, 200);
        assert.equal(balance().heldHours, 0); assert.equal(balance().usedHours, 16);
        assert.equal((await request('/admin/leave/final-decision', { requestId: pending.id, decision: 'approved' }, admin)).status, 400);
        assert.equal((await request('/employee/leave/request', { ...period, startDate: '2026-10-21', endDate: '2026-10-21' }, employee)).status, 200);
        const withdraw = db.queryLeaveRequests({ employeeId: 'E001', status: 'pending_supervisor' })[0];
        assert.equal((await request('/employee/leave/withdraw', { requestId: withdraw.id }, employee)).status, 200);
        assert.equal(balance().heldHours, 0);
        const grants = db.getSupervisors(); grants.saveAssignments({ employeeId: 'E001', supervisorIds: ['A001'], reason: 'Proxy assignment', revision: grants.assignmentsState().employees.find((e) => e.id === 'E001').revision }, audit);
        const result = await request('/employee/supervisor/leave', { ...period, startDate: '2026-10-22', endDate: '2026-10-22', employeeIds: ['E001'], proxyReason: 'Assistance', confirmApproval: true }, supervisor);
        assert.equal(result.status, 200); assert.equal(balance().heldHours, 8);
        assert.equal((await request('/admin/leave/final-decision', { requestId: result.requestId, decision: 'rejected' }, admin)).status, 200);
        assert.equal(balance().heldHours, 0);
    });
    await t.test('same-ID paper correction and cancellation update usage delta; failed audit rolls back charges and record', async () => {
        const body = { employeeIds: ['E001'], leaveTypeId: type, startDate: '2026-10-23', endDate: '2026-10-23', startTime: '09:00', endTime: '18:00', durationHours: 8, reason: 'Paper approved' };
        assert.equal((await request('/admin/leave/paper-approved', body, admin)).status, 200);
        const paper = db.queryLeaveRequests({ employeeId: 'E001' }).find((r) => r.approval_mode === 'admin_paper_approved');
        const count = db.countLeaveRequests(), used = balance().usedHours;
        assert.equal((await request('/admin/leave/paper-approved/correct', { ...body, requestId: paper.id, durationHours: 4 }, admin)).status, 200);
        assert.equal(db.countLeaveRequests(), count); assert.equal(balance().usedHours, used - 4);
        assert.deepEqual(store.charges(paper.id), [{ date: '2026-10-23', hours: 4 }]);
        const dashboard = await request('/dashboard', null, admin);
        assert.deepEqual(dashboard.dashboard.datasets.leave.requests.find((r) => r.id === paper.id).dailyHours, store.charges(paper.id));
        sql.exec("CREATE TRIGGER quota_paper_fail BEFORE INSERT ON audit_logs WHEN NEW.target_type='leave_request' BEGIN SELECT RAISE(FAIL,'paper audit failure'); END");
        assert.equal((await request('/admin/leave/paper-approved/correct', { ...body, requestId: paper.id, durationHours: 2 }, admin)).status, 500);
        assert.equal(balance().usedHours, used - 4); assert.equal(db.getLeaveRequestById(paper.id).duration_hours, 4);
        sql.exec('DROP TRIGGER quota_paper_fail');
        assert.equal((await request('/admin/leave/paper-approved/cancel', { requestId: paper.id }, admin)).status, 200);
        assert.equal(balance().usedHours, used - 8); assert.equal(db.countLeaveRequests(), count);
    });
    await t.test('explicit daily allocation handles cross-year, weekends and opening cutover without changing old requests', () => {
        legacy('old-cross-year', '2026-12-31', '2027-01-04', { duration_hours: 16 });
        const old = db.getLeaveRequestById('old-cross-year');
        save([row('E001', 2027)]);
        assert.equal(balance().availableHours, null); assert.equal(balance(2027).availableHours, null);
        store.allocateLegacy({ requestId: old.id, dailyHours: '2026-12-31=8\n2027-01-04=8', revision: store.revision(), usageRevision: store.usageRevision(), reason: 'Confirmed working dates', confirm: true }, audit);
        assert.equal(balance(2027).usedHours, 8); assert.deepEqual(db.getLeaveRequestById(old.id), old);
        save([row('E001', 2026, { mode: 'remaining', accountingStart: '2026-10-15', grantDays: 5 })]);
        assert.equal(balance().usedHours, 16); assert.equal(balance().availableHours, 24);
        legacy('old-cutover', '2026-10-14', '2026-10-15', { duration_hours: 16 });
        assert.equal(balance().availableHours, null);
        store.allocateLegacy({ requestId: 'old-cutover', dailyHours: [{ date: '2026-10-14', hours: 8 }, { date: '2026-10-15', hours: 8 }], revision: store.revision(), usageRevision: store.usageRevision(), reason: 'Cutover split', confirm: true }, audit);
        assert.equal(balance().usedHours, 24); assert.equal(balance().availableHours, 16);
        assert.throws(() => store.allocation({ ...old }, '2026-12-31=7\n2027-01-04=8', 16), /加總/);
        assert.throws(() => store.allocation({ ...old }, '2026-12-31=8\n2026-12-31=8', 16), /不重複/);
        assert.throws(() => store.allocation({ ...old }, '2026-02-30=16', 16), /有效日期/);
    });
    await t.test('configurable day hours apply to new grants; previous hours stay frozen, unconfigured and exhausted balances never silently deny leave', () => {
        store.saveSettings({ revision: store.settings().revision, dayHours: 7.5, period: 'calendar_year', reason: 'New workday conversion', confirm: true }, audit);
        save([row('A001', 2026), row('E001', 2028)]);
        assert.equal(balance().dayHours, 8); assert.equal(balance(2028).dayHours, 7.5); assert.equal(balance(2026, 'A001').grantHours, 75);
        assert.throws(() => save([row('E001', 2026, { dayHours: 7.5 })]), /不可改寫/);
        assert.deepEqual(store.balances(['A002'], 2026), []);
        save([row('E001', 2026, { grantDays: 0 })]); assert.ok(balance().availableHours < 0);
        db.getRequestHistory().save({ revision: db.getRequestHistory().state().revision, settings: { leave: 0, overtime: 0 }, reason: 'Visibility only', confirmHistory: true }, audit);
        assert.ok(balance().usedHours >= 24); assert.deepEqual(db.getLeaveRequestById('old-approved'), original);
    });
    await t.test('new cross-year requests require explicit daily hours; zero entitlement warns without denying submission', async () => {
        const body = { startDate: '2030-12-31', endDate: '2031-01-02', startTime: '09:00', endTime: '18:00', durationHours: 16, leaveTypeId: type, reason: 'Confirmed working hours' };
        save([row('E001', 2030, { grantDays: 0 }), row('E001', 2031, { grantDays: 0 })]);
        assert.equal((await request('/employee/leave/request', body, employee)).status, 400);
        assert.equal((await request('/employee/leave/request', { ...body, durationHours: 'not-a-number' }, employee)).status, 400);
        assert.equal((await request('/employee/leave/request', { ...body, dailyHours: '2030-12-31=8\n2031-01-02=8' }, employee)).status, 200);
        assert.equal(balance(2030).heldHours, 8); assert.equal(balance(2031).heldHours, 8); assert.equal(balance(2030).availableHours, -8);
    });
    await t.test('leave final approval and bulk paper audit failures roll back all status, steps and charge writes', async () => {
        const pending = db.queryLeaveRequests({ employeeId: 'E001', status: 'pending_supervisor' })[0];
        assert.equal((await request('/employee/leave/supervisor-decision', { requestId: pending.id, decision: 'approved' }, supervisor)).status, 200);
        const before = db.getLeaveRequestById(pending.id), balances = balance(2030);
        sql.exec("CREATE TRIGGER quota_leave_fail BEFORE INSERT ON audit_logs WHEN NEW.target_type='leave_request' BEGIN SELECT RAISE(FAIL,'leave audit failure'); END");
        assert.equal((await request('/admin/leave/final-decision', { requestId: pending.id, decision: 'approved' }, admin)).status, 500);
        assert.deepEqual(db.getLeaveRequestById(pending.id), before); assert.deepEqual(balance(2030), balances);
        sql.exec('DROP TRIGGER quota_leave_fail');
        const counts = () => ['leave_requests', 'leave_approval_steps', 'leave_entitlement_charges'].map((table) => sql.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n);
        const previous = counts();
        sql.exec("CREATE TRIGGER quota_bulk_fail BEFORE INSERT ON audit_logs WHEN NEW.target_type='leave_request' AND NEW.summary LIKE '%A002%' BEGIN SELECT RAISE(FAIL,'second paper audit failure'); END");
        assert.equal((await request('/admin/leave/paper-approved', { employeeIds: ['A001', 'A002'], leaveTypeId: type, startDate: '2026-10-24', endDate: '2026-10-24', startTime: '09:00', endTime: '18:00', durationHours: 8 }, admin)).status, 500);
        assert.deepEqual(counts(), previous); sql.exec('DROP TRIGGER quota_bulk_fail');
    });
    await t.test('Excel export-fill-preview-save round trip supports zero/blank, identifiers, stale versions and formula rejection', () => {
        const book = XLSX.read(store.workbook(2026, type), { type: 'buffer' }), sheet = book.Sheets['假別額度'];
        assert.equal(sheet.A1.v, '員工編號'); assert.equal(sheet.A2.t, 's'); assert.equal(sheet.E2.t, 'n');
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        for (let i = 1; i < rows.length; i++) { rows[i][8] = rows[i][0] === 'A002' ? 0 : null; rows[i][11] = 'Spreadsheet confirmed'; }
        book.Sheets['假別額度'] = XLSX.utils.aoa_to_sheet(rows);
        const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
        const currentRevision = store.revision();
        legacy('during-excel-fill', '2026-11-02', '2026-11-02', { employee_id: 'A001', status: 'pending_admin' });
        assert.equal(store.revision(), currentRevision);
        const imported = store.readWorkbook(buffer);
        assert.equal(imported.rows.length, 1); assert.equal(imported.rows[0].employeeId, 'A002');
        store.save({ rows: imported.rows, revision: imported.revision, digest: imported.preview.digest, confirm: true }, audit);
        assert.equal(balance(2026, 'A002').grantHours, 0);
        assert.throws(() => store.readWorkbook(buffer), /版本/);
        book.Sheets['假別額度'].I2 = { t: 'n', f: '1+1', v: 2 };
        assert.throws(() => store.readWorkbook(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })), /公式/);
        assert.throws(() => store.readWorkbook(Buffer.alloc(5 * 1024 * 1024 + 1)), /5 MB/);
        const expanded = Buffer.from(buffer), signature = Buffer.from([0x50, 0x4b, 0x01, 0x02]), central = expanded.indexOf(signature);
        expanded.writeUInt32LE(30 * 1024 * 1024, central + 24);
        assert.throws(() => store.readWorkbook(expanded), /20 MB/);
        assert.throws(() => store.readWorkbook(Buffer.from('invalid workbook')), /有效/);
        assert.throws(() => save([row('A002'), row('A002')]), /重複/);
        assert.throws(() => save([row('A002', 2026, { grantDays: '' })]), /數字/);
    });
    await t.test('batch quota audit failure is atomic; stale/digest/confirmation cannot overwrite data', () => {
        const before = store.state(2026), body = { revision: store.revision(), rows: [row('A001'), row('A002')] }, preview = store.preview(body);
        sql.exec("CREATE TRIGGER quota_fail BEFORE INSERT ON audit_logs WHEN NEW.target_type='leave_entitlement' AND NEW.target_id LIKE 'A002/%' BEGIN SELECT RAISE(FAIL,'quota audit failure'); END");
        assert.throws(() => store.save({ ...body, digest: preview.digest, confirm: true }, audit), /audit failure/);
        assert.deepEqual(store.state(2026), before); sql.exec('DROP TRIGGER quota_fail');
        assert.throws(() => store.save({ ...body, digest: 'changed', confirm: true }, audit), /預覽/);
        assert.throws(() => store.save({ ...body, digest: preview.digest, confirm: false }, audit), /確認/);
        assert.throws(() => store.preview({ ...body, revision: 'stale' }), /異動/);
        const fresh = { rows: [row('A001')], revision: store.revision() }, heldPreview = store.preview(fresh);
        db.withdrawLeaveRequest({ requestId: 'during-excel-fill', withdrawnAt: Date.now() });
        assert.equal(store.revision(), fresh.revision);
        assert.throws(() => store.save({ ...fresh, digest: heldPreview.digest, confirm: true }, audit), /重新預覽/);
    });
    await t.test('permission boundaries apply to admin view/manage, employee own and explicitly assigned supervisor; unauthorized imports never parse', async () => {
        assert.equal((await request('/leave-entitlements?year=2026', null, limited)).status, 403);
        assert.equal((await request('/leave-entitlements?year=2026', null, employee)).status, 403);
        assert.equal((await request('/leave-entitlements?year=2026', null, admin)).status, 200);
        assert.equal((await request('/leave-entitlements/import-preview', { content: 'not Excel' }, limited)).status, 403);
        const own = await request('/employee/leave/balances?year=2026', null, employee); assert.equal(own.status, 200);
        assert.ok(own.balances.every((b) => b.employee_id === 'E001' && !b.records));
        assert.equal((await request('/employee/leave/balances?year=2026&employeeId=A001', null, employee)).status, 403);
        assert.equal((await request('/employee/leave/balances?year=2026&employeeId=E001', null, supervisor)).status, 200);
        assert.equal((await request('/employee/leave/balances?year=2026&employeeId=A002', null, supervisor)).status, 403);
        db.saveAccountAccessRecord({ employee_id: 'A002', allowed_roles: ['employee', 'admin'], admin_preset: 'custom', admin_permissions: ['admin.leave.balances.view'] });
        assert.equal((await request('/leave-entitlements?year=2026', null, limited)).status, 200);
        assert.equal((await request('/leave-entitlements/preview', { rows: [row()] }, limited)).status, 403);
        db.saveAccountAccessRecord({ employee_id: 'A002', allowed_roles: ['employee', 'admin'], admin_preset: 'custom', admin_permissions: ['admin.leave.balances.manage'] });
        assert.equal((await request('/leave-entitlements?year=2026', null, limited)).status, 200);
        const system = await request('/login', { role: 'system_admin', employeeId: 'system-admin', secret: 'system-admin-test' });
        assert.equal(system.status, 200); assert.equal((await request('/leave-entitlements?year=2026', null, system.token)).status, 200);
        db.setSetting('developerImpersonationEnabled', true);
        const developer = await login('D001', 'D001-test-password', 'developer');
        const impersonated = await request('/developer/impersonation/start', { targetRole: 'admin', targetEmployeeId: 'A001', systemPassword: '0000' }, developer);
        assert.equal(impersonated.status, 200, JSON.stringify(impersonated));
        assert.equal((await request('/leave-entitlements/import-preview', { content: 'not Excel' }, developer)).status, 403);
    });
    await t.test('SQLite backup/reopen retains accounting, and deleted reused employee IDs never inherit past entitlement or consumption', () => {
        const backup = path.join(fixture.directory, 'quotas-backup.db'); sql.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
        const restored = new Database(backup), { createLeaveEntitlementStore } = require('../leave-entitlements');
        const restoredStore = createLeaveEntitlementStore(restored, () => {}); assert.deepEqual(restoredStore.balances(['E001'], 2026), store.balances(['E001'], 2026)); restored.close();
        const people = db.loadEmployees(); db.saveEmployees(people.filter((e) => e.id !== 'E001')); db.saveEmployees(people);
        assert.deepEqual(store.balances(['E001'], 2026), []); save([row()]); assert.equal(balance().usedHours, 0);
        assert.deepEqual(db.getLeaveRequestById('old-approved'), original);
    });
});

test('quota frontend keeps preview confirmation and emits explicit accounting inputs', () => {
    const source = fs.readFileSync(path.join(__dirname, '../browser-client/leave-entitlements.js'), 'utf8');
    const noop = () => {}, context = { state: { dashboard: { role: 'admin' } }, auditActionLabels: {}, auditTargetTypeLabels: {}, escapeHtml: (s) => String(s),
        renderDashboard: noop, renderSystemAdminDashboard: noop, postRenderSetup: noop, handleDashboardClick: noop, handleDashboardChange: noop, handleDashboardSubmit: noop,
        handleRealtimeSyncMessage: noop, handleLogout: noop, document: { addEventListener: noop, querySelector: () => null }, hasCurrentAdminPermission: () => true, renderAdminPaperEmployeePicker: () => '<picker>', setMessage: noop };
    vm.createContext(context); vm.runInContext(source, context);
    vm.runInContext(`leState.data = { settings: { dayHours: 8 }, employees: [], leaveTypes: [
        { id: 'annual', name: '特休', unit: 'day', enabled: true, deducts_balance: true },
        { id: 'sick', name: '病假', unit: 'hour', enabled: true, deducts_balance: false },
        { id: 'personal', name: '事假', unit: 'hour', enabled: true, deducts_balance: false }
    ], balances: [] }; leState.preview = { rows: [], digest: 'preview' }; leState.body = { rows: [] };`, context);
    for (const typeId of ['annual', 'sick', 'personal']) {
        vm.runInContext(`leState.typeId = '${typeId}'`, context);
        const html = vm.runInContext('renderLeaveEntitlementWorkspace()', context);
        assert.match(html, /共用額度換算設定/);
        assert.match(html, /name="dayHours" type="number" value="8"/);
        assert.match(html, /額度天數（換算用）/); assert.match(html, /扣抵起日/);
        assert.match(html, /data-le-form="save"/);
        assert.match(html, /type="checkbox" name="confirm" required>確認上述額度、扣抵起日及既有時數/);
        if (typeId === 'annual') {
            assert.match(html, /特休額度記帳期間/);
            assert.match(html, /<select name="period"><option value="calendar_year">曆年記帳/);
            assert.match(html, /假別申請單位：天/);
            assert.match(html, /特休遞延小時（人工確認）/);
        } else {
            assert.doesNotMatch(html, /特休額度記帳期間|<select name="period">|年度制度/);
            assert.match(html, /<input name="period" type="hidden" value="calendar_year">/);
            assert.match(html, /假別申請單位：小時/);
            assert.match(html, /上期轉入小時（人工）/);
        }
    }
    vm.runInContext(`handleDashboardChange({ target: { closest: (s) => s === '[data-le-form]' || s === '[data-le-form="save"]' ? {} : null, matches: () => false } })`, context);
    assert.equal(vm.runInContext('leState.preview.digest', context), 'preview');
    const app = fs.readFileSync(path.join(__dirname, '../browser-client/app.js'), 'utf8');
    assert.match(app, /dailyHours: values.dailyHours/); assert.match(app, /label: "假別額度", panelIndex: 6/);
    assert.match(app, /setPaperFormValue\(form, "dailyHours"/);
});
