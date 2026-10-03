const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { test } = require('node:test');
const { startFixture } = require('./fixtures/browser-server');
const { taipeiDate } = require('../meal-management');

test('batch proxy, shared routes and individual browser punching preserve scope and atomic writes', async (t) => {
    const fixture = await startFixture(), { db, url } = fixture;
    const sql = new Database(fixture.databasePath);
    t.after(async () => { sql.close(); await fixture.close(); });
    db.setSetting('browserSecuritySettings', { deviceBindingEnabled: false, gpsRequiredOnPunch: false });
    const roster = Array.from({ length: 10 }, (_, i) => ({ id: `B${String(i).padStart(2, '0')}`, name: `Batch Employee ${i}`, card: `batch-${i}`, department: 'Other' }));
    db.saveEmployees([...db.loadEmployees(), ...roster]);
    const assigned = db.getSupervisors();
    roster.forEach((e) => assigned.saveAssignments({ employeeId: e.id, supervisorIds: ['A001'], reason: 'test scope',
        revision: assigned.assignmentsState().employees.find((row) => row.id === e.id).revision }, (entry) => ({ ...entry, actor_id: 'system' })));
    async function request(route, body, token) {
        const result = await fetch(url + '/api/browser' + route, { method: body ? 'POST' : 'GET',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
        return { status: result.status, ...await result.json() };
    }
    async function login(id, secret, role = 'employee') {
        const result = await request('/login', { employeeId: id, secret, role: 'account' });
        assert.equal(result.status, 200);
        return result.dashboard.role === 'workspace' ? request('/workspace', { role }, result.token) : result;
    }
    const system = await request('/login', { employeeId: 'system-admin', secret: 'system-admin-test', role: 'system_admin' });
    const supervisor = await login('A001', 'A001-test-password');
    const admin = await login('A001', 'A001-test-password', 'admin');
    const limited = await login('A002', 'A002-test-password', 'admin');
    const employee = await login('E001', 'employee-card');
    const targets = roster.slice(0, 8).map((e) => e.id);
    const body = { employeeIds: targets, startDate: '2026-10-20', endDate: '2026-10-20', startTime: '18:00', endTime: '20:00',
        durationHours: 2, reason: 'Same plan', proxyReason: 'Requested assistance', confirmApproval: true };
    const leaveTypeId = db.loadLeaveTypes().find((type) => type.enabled).id;
    const post = (kind, data = body) => request(`/employee/supervisor/${kind}`, data, supervisor.token);
    const count = (kind) => sql.prepare(`SELECT COUNT(*) AS n FROM ${kind}_requests`).get().n;

    await t.test('eight selected employees get independent approved overtime records and attributable batch audit', async () => {
        const result = await post('overtime');
        assert.equal(result.status, 200); assert.equal(result.createdCount, 8);
        assert.equal(new Set(result.requestIds).size, 8);
        assert.equal(count('overtime'), 8);
        result.requestIds.forEach((id, i) => {
            const row = db.getOvertimeRequestById(id);
            assert.equal(row.employee_id, targets[i]); assert.equal(row.status, 'approved');
            assert.equal(row.applicant_id, 'A001'); assert.equal(row.duration_hours, 2);
        });
        const logs = db.queryAuditLogs({ limit: 100 }).filter((row) => row.action === 'supervisor_proxy_create');
        assert.equal(logs.length, 8); assert.equal(new Set(logs.map((row) => row.after_data.batchId)).size, 1);
        assert.ok(logs.every((row) => row.actor_id === 'A001' && row.after_data.batchSize === 8));
        assert.equal(db.countOvertimeRequests({ employeeId: 'B08' }), 0);
    });
    await t.test('one overlap, revoked scope, empty, duplicate or oversized selections cannot partially create a batch', async () => {
        assert.equal((await post('overtime', { ...body, employeeIds: ['B08', 'B01'] })).status, 409);
        assert.equal(count('overtime'), 8);
        assert.equal((await post('overtime', { ...body, employeeIds: ['B08', 'E001'] })).status, 403);
        for (const ids of [[], ['B08', 'B08'], Array(101).fill('B08'), ['B08', null]]) {
            assert.equal((await post('overtime', { ...body, employeeIds: ids })).status, 400);
        }
        const record = assigned.assignmentsState().employees.find((e) => e.id === 'B09');
        assigned.saveAssignments({ employeeId: 'B09', supervisorIds: [], revision: record.revision, reason: 'revoke' }, (entry) => entry);
        assert.equal((await post('overtime', { ...body, employeeIds: ['B08', 'B09'] })).status, 403);
        assert.equal(count('overtime'), 8);
    });
    await t.test('batch leave still requires management final review per employee and retains two approval steps', async () => {
        const result = await post('leave', { ...body, leaveTypeId, startTime: '09:00', endTime: '18:00', durationHours: 8 });
        assert.equal(result.status, 200); assert.equal(count('leave'), 8);
        result.requestIds.forEach((id) => {
            assert.equal(db.getLeaveRequestById(id).status, 'pending_admin');
            assert.deepEqual(sql.prepare('SELECT status FROM leave_approval_steps WHERE request_id = ? ORDER BY step_order').all(id).map((row) => row.status), ['approved', 'pending']);
        });
    });
    await t.test('an audit failure after the first employee rolls back every request and approval step', async () => {
        sql.exec(`CREATE TRIGGER fail_second_batch BEFORE INSERT ON audit_logs WHEN NEW.action = 'supervisor_proxy_create'
            AND json_extract(NEW.after_json, '$.employee_id') = 'B01' BEGIN SELECT RAISE(FAIL, 'batch audit failure'); END`);
        try {
            for (const kind of ['leave', 'overtime']) {
                const before = count(kind), steps = sql.prepare(`SELECT COUNT(*) AS n FROM ${kind}_approval_steps`).get().n;
                const result = await post(kind, { ...body, leaveTypeId, startDate: '2026-10-21', endDate: '2026-10-21' });
                assert.equal(result.status, 500); assert.equal(count(kind), before);
                assert.equal(sql.prepare(`SELECT COUNT(*) AS n FROM ${kind}_approval_steps`).get().n, steps);
            }
        } finally { sql.exec('DROP TRIGGER fail_second_batch'); }
    });
    await t.test('batch lunch is same-row, cutoff-bound, optimistic and all-or-nothing for eligibility and audit failures', async () => {
        const meals = db.getMeals(), date = taipeiDate(Date.now() + 86400000);
        const manager = { manager: true, actorId: 'A001', audit: (entry) => ({ ...entry, actor_id: 'A001' }) };
        meals.saveDay({ date, serving: true, cutoff: '23:59', reason: 'test day' }, manager);
        targets.forEach((id) => meals.saveMember({ employeeId: id, participating: true, effectiveDate: date, reason: 'join' }, manager));
        const mealBody = () => ({ employeeIds: targets, date, eating: false, reason: 'Same lunch choice', version: meals.dayState(date).version });
        const first = mealBody();
        assert.equal((await post('meals/choice', first)).status, 200);
        assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM meal_choices').get().n, 8);
        assert.equal((await post('meals/choice', first)).status, 409);
        assert.equal((await post('meals/choice', { ...mealBody(), employeeIds: ['B00', 'B08'], eating: true })).status, 400);
        assert.equal(meals.dayState(date).rows.find((row) => row.employee_id === 'B00').eating, false);
        sql.exec(`CREATE TRIGGER fail_second_meal BEFORE INSERT ON audit_logs WHEN NEW.target_id = '${date}/B01'
            BEGIN SELECT RAISE(FAIL, 'meal audit failure'); END`);
        try { assert.equal((await post('meals/choice', { ...mealBody(), eating: true })).status, 500); }
        finally { sql.exec('DROP TRIGGER fail_second_meal'); }
        assert.equal(meals.dayState(date).rows.filter((row) => row.eating).length, 0);
        assert.equal((await post('meals/choice', { ...mealBody(), eating: true })).status, 200);
        assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM meal_choices').get().n, 8);
        const proxy = await request(`/employee/supervisor?month=${date.slice(0, 7)}&date=${date}&employeeId=B00`, null, supervisor.token);
        assert.equal(proxy.proxy.batchMeal.employees.length, 9);
        assert.equal(proxy.proxy.batchMeal.employees.some((row) => row.id === 'E001'), false);
        assert.equal(proxy.proxy.batchMeal.currentCount, undefined);
        meals.closeOrder({ date, version: meals.dayState(date).version, reason: 'test close' }, manager);
        assert.equal((await post('meals/choice', { ...mealBody(), manager: true })).status, 403);
    });
    await t.test('shared routes preserve old API, grant route-only administrators the new menu, and drive both request kinds', async () => {
        assert.equal((await request('/supervisors/routes', null, limited.token)).status, 403);
        const current = await request('/supervisors/routes', null, system.token);
        const routes = [{ department: '*', supervisor_id: 'A001', enabled: true }];
        assert.equal((await request('/supervisors/routes', { approvalRoutes: routes, revision: current.routes.revision }, system.token)).status, 200);
        assert.equal((await request('/supervisors/routes', { approvalRoutes: [], revision: current.routes.revision }, system.token)).status, 409);
        assert.equal((await request('/admin/leave-routes/save', { approvalRoutes: routes }, admin.token)).status, 200);
        db.saveAccountAccessRecord({ employee_id: 'A002', allowed_roles: ['employee', 'admin'], admin_preset: 'custom', admin_permissions: ['admin.leave.settings'] });
        const fresh = await login('A002', 'A002-test-password', 'admin');
        assert.ok(fresh.dashboard.permissions.sections.some((row) => row.id === 'supervisors'));
        assert.equal((await request('/supervisors/routes', null, fresh.token)).status, 200);
        assert.equal((await request('/supervisors/assignments', null, fresh.token)).status, 403);
        for (const kind of ['leave', 'overtime']) {
            assert.equal((await request(`/employee/${kind}/request`, { ...body, employeeIds: undefined, leaveTypeId, startDate: '2026-10-23', endDate: '2026-10-23' }, employee.token)).status, 200);
            assert.equal((kind === 'leave' ? db.queryLeaveRequests : db.queryOvertimeRequests)({ employeeId: 'E001' })[0].supervisor_id, 'A001');
        }
        const before = db.loadLeaveApprovalRoutes();
        sql.exec("CREATE TRIGGER fail_route_audit BEFORE INSERT ON audit_logs WHEN NEW.target_type = 'leave_approval_route' BEGIN SELECT RAISE(FAIL, 'route audit failure'); END");
        try { assert.equal((await request('/supervisors/routes', { approvalRoutes: [], revision: (await request('/supervisors/routes', null, system.token)).routes.revision }, system.token)).status, 500); }
        finally { sql.exec('DROP TRIGGER fail_route_audit'); }
        assert.deepEqual(db.loadLeaveApprovalRoutes(), before);
    });
    await t.test('punch defaults preserve access, disabling applies to existing tokens but not login or other applications', async () => {
        assert.equal(employee.dashboard.punchAction.enabled, true);
        const store = db.getBrowserPunchPermissions(), before = store.state();
        const employees = before.employees.map((e) => ({ id: e.id, enabled: e.id !== 'E001' }));
        const payload = { revision: before.revision, employees, reason: 'Limit browser punching' };
        assert.equal((await request('/admin/browser-punch-permissions', payload, limited.token)).status, 403);
        assert.equal((await request('/admin/browser-punch-permissions', payload, admin.token)).status, 200);
        const countBefore = db.loadPunchRecords().length;
        const denied = await request('/punch', {}, employee.token);
        assert.equal(denied.status, 403); assert.match(denied.error, /P241/);
        assert.equal(db.loadPunchRecords().length, countBefore);
        assert.equal((await request('/admin/browser-punch-permissions', payload, admin.token)).status, 409);
        const logged = await login('E001', 'employee-card');
        assert.equal(logged.status, 200); assert.equal(logged.dashboard.punchAction.enabled, false);
        assert.equal((await request('/employee/overtime/request', { ...body, startDate: '2026-10-24', endDate: '2026-10-24' }, logged.token)).status, 200);
        const current = store.state();
        assert.equal((await request('/admin/browser-punch-permissions', { revision: current.revision, reason: 'Restore', employees: current.employees.map((e) => ({ id: e.id, enabled: true })) }, system.token)).status, 200);
        assert.equal((await request('/punch', {}, employee.token)).status, 200);
        const log = db.queryAuditLogs({ limit: 100 }).find((row) => row.action === 'browser_punch_permission');
        assert.ok(log.before_data.length); assert.equal(log.after_data.reason, 'Restore');
    });
    await t.test('permission writes validate whole roster, roll back on audit failure, and never change external card punching', async () => {
        const store = db.getBrowserPunchPermissions(), current = store.state();
        const payload = { revision: current.revision, reason: 'Deny browser', employees: current.employees.map((e) => ({ id: e.id, enabled: !['E001', 'B00'].includes(e.id) })) };
        assert.equal((await request('/admin/browser-punch-permissions', { ...payload, employees: [] }, system.token)).status, 400);
        sql.exec("CREATE TRIGGER fail_permission_audit BEFORE INSERT ON audit_logs WHEN NEW.action = 'browser_punch_permission' BEGIN SELECT RAISE(FAIL, 'permission audit failure'); END");
        try { assert.equal((await request('/admin/browser-punch-permissions', payload, system.token)).status, 500); }
        finally { sql.exec('DROP TRIGGER fail_permission_audit'); }
        assert.equal(store.allowed('E001'), true);
        assert.equal((await request('/admin/browser-punch-permissions', payload, system.token)).status, 200);
        const secret = 'fixture-external-card-key';
        db.setSetting('externalApiEnabled', true);
        db.saveExternalApiKey({ id: 'test-card', name: 'Test card device', key_hash: crypto.createHash('sha256').update(secret).digest('hex'), permissions: ['punch'], enabled: true });
        const response = await fetch(url + '/api/punch', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': secret }, body: JSON.stringify({ cardId: 'batch-0' }) });
        assert.equal(response.status, 200, JSON.stringify(await response.json()));
        assert.equal(store.allowed('E001'), false);
        assert.equal(store.allowed('B00'), false);
    });
    await t.test('complete backups retain permission choices; deleted ids lose old exceptions', async () => {
        const backup = path.join(fixture.directory, 'permission-backup.db'); await db.backupDatabase(backup);
        const copy = new Database(backup, { readonly: true });
        try { assert.equal(copy.prepare('SELECT enabled FROM browser_punch_permissions WHERE employee_id = ?').get('E001').enabled, 0); }
        finally { copy.close(); }
        const current = db.loadEmployees(); db.saveEmployees(current.filter((e) => e.id !== 'E001')); db.saveEmployees(current);
        assert.equal(db.getBrowserPunchPermissions().allowed('E001'), true);
    });
});

test('employee application markup groups chronological fields and does not duplicate inputs', () => {
    const source = fs.readFileSync(path.join(__dirname, '../browser-client/app.js'), 'utf8');
    for (const name of ['renderEmployeeLeaveApplicationPanel', 'renderEmployeeOvertimeApplicationPanel']) {
        const section = source.slice(source.indexOf(`function ${name}(`));
        const body = section.slice(0, section.indexOf('\nfunction ', 1));
        const period = body.slice(body.indexOf('class="request-period-grid'), body.indexOf('class="request-meta-grid'));
        assert.deepEqual([...period.matchAll(/name="(\w+)"/g)].map((m) => m[1]), ['startDate', 'startTime', 'endDate', 'endTime']);
        for (const field of ['startDate', 'startTime', 'endDate', 'endTime', 'durationHours', 'reason']) assert.equal([...body.matchAll(new RegExp(`name="${field}"`, 'g'))].length, 1);
    }
});
