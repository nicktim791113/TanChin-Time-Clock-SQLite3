const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const { test } = require('node:test');
const { attachAnnualLeaveRoutes, ANNUAL_LEAVE_PERMISSIONS: P } = require('../annual-leave-routes');

async function fixture() {
    const sessions = new Map(), calls = [], previews = new Map(), delegated = new Set(['manager:E001']);
    let notifications = 0, nextError;
    const add = (token, role, employeeId, permissions = [], extra = {}) => sessions.set(token, { token, role, employeeId, permissions, authMethod: 'web_password', ...extra });
    add('employee', 'employee', 'E001'); add('manager', 'employee', 'manager');
    add('card-manager', 'employee', 'manager', [], { authMethod: 'card' });
    add('impersonated-manager', 'employee', 'manager', [], { impersonation: { active: true }, realEmployeeId: 'developer' });
    add('view', 'admin', 'viewer', [P.view]); add('policy', 'admin', 'policy-admin', [P.policyManage]);
    add('grant', 'admin', 'grant-admin', [P.grant]); add('close', 'admin', 'close-admin', [P.close]);
    add('adjust', 'admin', 'adjust-admin', [P.adjust]); add('none', 'admin', 'limited');
    add('system', 'system_admin', '__system_admin__');
    add('fake-role', 'employee', 'E001', Object.values(P));
    add('impersonated', 'admin', 'simulated', Object.values(P), { impersonation: { active: true }, realEmployeeId: 'developer' });
    add('grant-other-session', 'admin', 'grant-admin', [P.grant]);
    const state = (year) => ({ year, revision: 'current-revision', policies: [{ id: 'policy-v1' }],
        services: [{ employeeId: 'E001', evidence: 'PRIVATE-SERVICE-EVIDENCE' }],
        employees: [{ employeeId: 'E001', national_id: 'PRIVATE-NATIONAL-ID' }],
        balances: [{ employeeId: 'E001', name: '=HYPERLINK("bad")', year, availableHours: 24 }],
        closures: [{ employeeId: 'E001', year, status: 'pending', consentEvidence: 'PRIVATE-CONSENT' }]
    });
    const store = { state, employeeView: (ids, year) => {
        calls.push({ method: 'employeeView', ids, year });
        return { year, employees: ids.map((employeeId) => ({ employeeId, name: employeeId, balances: [], lots: [], closures: [], warnings: [] })) };
    } };
    for (const method of ['savePolicy', 'saveService']) store[method] = (body, audit) => {
        if (nextError) { const error = nextError; nextError = null; throw error; }
        calls.push({ method, body, audit: audit({ action: method }) }); return { saved: true };
    };
    for (const kind of ['grant', 'close', 'correction']) {
        store[`${kind}Preview`] = (body, context) => {
            const preview = { previewId: crypto.randomUUID(), digest: 'current-digest', revision: 'current-revision', rows: [] };
            previews.set(preview.previewId, { preview, context });
            calls.push({ method: `${kind}Preview`, body, context }); return preview;
        };
        store[`${kind}Confirm`] = (body, audit, context) => {
            if (nextError) { const error = nextError; nextError = null; throw error; }
            const original = previews.get(body.previewId);
            if (!original || original.context.actorId !== context.actorId || original.context.sessionKey !== context.sessionKey || body.revision !== original.preview.revision || body.digest !== original.preview.digest) {
                throw Object.assign(new Error('預覽已失效或不屬於目前操作者。'), { statusCode: 409 });
            }
            calls.push({ method: `${kind}Confirm`, body, context, audit: audit({ action: `${kind}Confirm` }) });
            return { updatedCount: 1 };
        };
    }
    const app = express(); app.use(express.json());
    attachAnnualLeaveRoutes(app, {
        db: { getAnnualLeave: () => store, getSupervisors: () => ({ isAssigned: (supervisor, employee) => delegated.has(`${supervisor}:${employee}`) }) },
        requireSession: (req, res, next) => { const token = String(req.headers.authorization || '').replace(/^Bearer /, ''); if (!sessions.has(token)) return res.status(401).json({ success: false }); req.browserSession = sessions.get(token); next(); },
        hasPermission: (session, code) => session.permissions.includes(code),
        auditEntry: (req, entry) => ({ ...entry, actor_id: req.browserSession.employeeId }),
        notify: () => { notifications++; }
    });
    const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
    const request = async (route = '', body, token = 'view') => {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/browser${route.startsWith('/employee') ? '' : '/annual-leave'}${route}`, {
            method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body)
        });
        const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = {}; }
        return { status: response.status, headers: response.headers, text, ...data };
    };
    return { sessions, calls, delegated, request, notifications: () => notifications, error: (e) => { nextError = e; },
        close: async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); } };
}

test('annual leave routes enforce separate permissions, server-owned actor context and stale preview errors', async (t) => {
    const f = await fixture(); t.after(f.close);
    const { request } = f;
    const confirmation = async (kind, token) => ({ ...(await request(`/${kind}-preview`, { year: 2026, employeeIds: ['E001'] }, token)).preview,
        confirm: true, reason: '核對後確認', idempotencyKey: crypto.randomUUID() });
    assert.equal((await request('', undefined, 'unknown')).status, 401);
    for (const token of ['employee', 'manager', 'none', 'fake-role']) assert.equal((await request('', undefined, token)).status, 403);
    for (const token of ['view', 'policy', 'grant', 'close', 'adjust', 'system']) {
        const result = await request('?year=2026', undefined, token);
        assert.equal(result.status, 200); assert.equal(result.annualLeave.year, 2026); assert.equal(result.headers.get('cache-control'), 'no-store');
    }
    assert.equal((await request('', undefined, 'view')).permissions.grant, false);
    assert.equal((await request('', undefined, 'grant')).permissions.adjust, false);
    assert.equal((await request('', undefined, 'adjust')).permissions.grant, false);
    assert.equal((await request('', undefined, 'system')).permissions.policyManage, true);

    for (const route of ['/policy', '/service']) {
        for (const token of ['view', 'grant', 'close', 'adjust', 'employee']) assert.equal((await request(route, { confirm: true }, token)).status, 403);
        const result = await request(route, { reason: 'test', actorId: 'forged', actor_id: 'forged', token: 'forged', context: { actorId: 'forged' } }, 'policy');
        assert.equal(result.status, 200);
        const call = f.calls.at(-1); assert.equal(call.audit.actor_id, 'policy-admin'); assert.equal(call.body.actorId, undefined); assert.equal(call.body.context, undefined); assert.equal(call.body.token, undefined);
    }
    for (const [kind, allowed] of [['grant', 'grant'], ['close', 'close'], ['correction', 'adjust']]) {
        if (kind !== 'correction') assert.equal((await request(`/${kind}-preview`, { year: 2026 }, 'view')).status, 200);
        else for (const denied of ['view', 'grant', 'close', 'policy']) assert.equal((await request('/correction-preview', { year: 2026 }, denied)).status, 403);
        const body = await confirmation(kind, allowed);
        for (const denied of ['view', 'policy', 'grant', 'close', 'adjust'].filter((token) => token !== allowed)) assert.equal((await request(`/${kind}-confirm`, body, denied)).status, 403);
        for (const key of ['previewId', 'digest', 'revision', 'idempotencyKey']) assert.equal((await request(`/${kind}-confirm`, { ...body, [key]: '' }, allowed)).status, 400);
        assert.equal((await request(`/${kind}-confirm`, { ...body, confirm: 'true' }, allowed)).status, 400);
        assert.equal((await request(`/${kind}-confirm`, { ...body, reason: '' }, allowed)).status, 400);
        assert.equal((await request(`/${kind}-confirm`, { ...body, revision: 'stale' }, allowed)).status, 409);
        assert.equal((await request(`/${kind}-confirm`, { ...body, digest: 'changed' }, allowed)).status, 409);
        assert.equal((await request(`/${kind}-confirm`, body, allowed)).status, 200);
        const call = f.calls.at(-1);
        assert.match(call.context.sessionKey, /^[a-f0-9]{64}$/); assert.notEqual(call.context.sessionKey, allowed); assert.equal(call.context.actorId, `${allowed}-admin`);
    }
    const body = await confirmation('grant', 'grant');
    assert.equal((await request('/grant-confirm', body, 'grant-other-session')).status, 409);
    f.sessions.get('grant').permissions = [];
    assert.equal((await request('/grant-confirm', body, 'grant')).status, 403);
    const before = f.notifications();
    f.error(new Error('SQL path or secret must not appear'));
    const failed = await request('/policy', { reason: 'audit failure' }, 'system');
    assert.equal(failed.status, 500); assert.ok(!failed.text.includes('SQL path')); assert.equal(f.notifications(), before);

    for (const route of ['/policy', '/service', '/grant-confirm', '/close-confirm', '/correction-confirm']) assert.equal((await request(route, body, 'impersonated')).status, 403);
    assert.equal((await request('', undefined, 'impersonated')).permissions.grant, false);
});

test('annual leave employee reads require self or explicit personal-password delegation and exports exclude service evidence', async (t) => {
    const f = await fixture(); t.after(f.close);
    const { request } = f;
    assert.deepEqual((await request('/employee/annual-leave?year=2026', undefined, 'employee')).employees.map((row) => row.employeeId), ['E001']);
    assert.equal((await request('/employee/annual-leave?employeeId=OTHER', undefined, 'employee')).status, 403);
    assert.equal((await request('/employee/annual-leave?employeeId=E001', undefined, 'view')).status, 403);
    assert.deepEqual((await request('/employee/annual-leave?employeeId=E001&year=2026', undefined, 'manager')).employees.map((row) => row.employeeId), ['E001']);
    assert.deepEqual(f.calls.at(-1).ids, ['E001']);
    for (const token of ['card-manager', 'impersonated-manager']) assert.equal((await request('/employee/annual-leave?employeeId=E001', undefined, token)).status, 403);
    f.delegated.delete('manager:E001');
    assert.equal((await request('/employee/annual-leave?employeeId=E001', undefined, 'manager')).status, 403);
    assert.equal((await request('/employee/annual-leave?employeeIds=E001&employeeIds=OTHER', undefined, 'employee')).status, 400);
    assert.equal((await request('/employee/annual-leave?employeeId=E001&employeeId=OTHER', undefined, 'employee')).status, 400);
    for (const query of ['?year=2026garbage', '?year=2026&year=2027', '?year=9999', '?year=2016', '?year=2101']) assert.equal((await request(query)).status, 400);
    const exported = await request('/export?year=2026&format=json');
    assert.equal(exported.status, 200); assert.equal(exported.year, 2026);
    assert.ok(!exported.text.includes('PRIVATE-')); assert.equal(exported.headers.get('cache-control'), 'no-store');
    const csv = await request('/export?year=2026&format=csv');
    assert.ok(csv.text.includes("'=HYPERLINK")); assert.ok(csv.headers.get('content-disposition').includes('annual-leave-2026.csv'));
    assert.equal((await request('/export?year=2026&format=html')).status, 400);
    assert.equal((await request('/export?year=2026', undefined, 'employee')).status, 403);
});

test('real server catalog does not silently grant annual policy/grant/close to existing full administrators', async (t) => {
    const { startFixture } = require('./fixtures/browser-server');
    const f = await startFixture(); t.after(f.close);
    async function request(route, body, token) {
        const response = await fetch(f.url + '/api/browser' + route, { method: body ? 'POST' : 'GET',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
        return { status: response.status, ...await response.json() };
    }
    const account = await request('/login', { employeeId: 'A001', secret: 'A001-test-password', role: 'account' });
    const admin = await request('/workspace', { role: 'admin' }, account.token);
    assert.equal(admin.status, 200);
    const catalog = admin.dashboard.permissionCatalog;
    for (const code of [P.policyManage, P.grant, P.close]) {
        assert.ok(catalog.adminPermissions.find((permission) => permission.code === code)?.delegatedOnly);
        assert.ok(!admin.dashboard.permissions.admin.includes(code));
        assert.ok(!catalog.adminPresets.find((preset) => preset.id === 'full_admin').permissions.includes(code));
    }
    for (const route of ['/annual-leave/policy', '/annual-leave/service', '/annual-leave/grant-confirm', '/annual-leave/close-confirm']) assert.equal((await request(route, {}, admin.token)).status, 403);
    assert.ok(admin.dashboard.permissions.admin.includes(P.adjust));
    const system = await request('/login', { employeeId: 'system-admin', secret: 'system-admin-test', role: 'system_admin' });
    const records = f.db.loadAccountAccessRecords().map((record) => record.employee_id === 'A002'
        ? { ...record, admin_preset: 'custom', admin_permissions: [P.grant] } : record);
    assert.equal((await request('/admin/account-access/save', { accounts: records }, admin.token)).status, 403);
    assert.equal((await request('/admin/account-access/save', { accounts: records }, system.token)).status, 200);
    const delegatedLogin = await request('/login', { employeeId: 'A002', secret: 'A002-test-password', role: 'account' });
    const delegated = await request('/workspace', { role: 'admin' }, delegatedLogin.token);
    assert.ok(delegated.dashboard.permissions.admin.includes(P.grant));
    assert.ok(!delegated.dashboard.permissions.admin.includes(P.policyManage));
    assert.ok(!delegated.dashboard.permissions.admin.includes(P.close));
    assert.ok(!delegated.dashboard.permissions.admin.includes(P.adjust));
    assert.equal((await request('/annual-leave/grant-confirm', {}, delegated.token)).status, 400);
    assert.equal((await request('/annual-leave/close-confirm', {}, delegated.token)).status, 403);
    assert.equal((await request('/annual-leave/correction-preview', {}, delegated.token)).status, 403);
    const revoked = records.map((record) => record.employee_id === 'A002' ? { ...record, admin_permissions: [P.view] } : record);
    assert.equal((await request('/admin/account-access/save', { accounts: revoked }, system.token)).status, 200);
    assert.equal((await request('/annual-leave/grant-confirm', {}, delegated.token)).status, 403, 'Existing sessions must honor revoked permissions');
});

test('real HTTP annual leave lifecycle preserves preview isolation, atomic audit, exact adjustments and employee privacy', async (t) => {
    const { startFixture } = require('./fixtures/browser-server');
    const Database = require('better-sqlite3');
    const f = await startFixture(), sql = new Database(f.databasePath);
    t.after(async () => { sql.close(); await f.close(); });
    f.db.saveEmployees(f.db.loadEmployees().map((employee) => ({ ...employee,
        ...(employee.id === 'E001' ? { hire_date: '2024-07-01', name: 'Annual Employee' } : {}) })));
    f.db.setSetting('browserSecuritySettings', { deviceBindingEnabled: false, gpsRequiredOnPunch: false });
    async function request(route, body, token) {
        const response = await fetch(f.url + '/api/browser' + route, { method: body === undefined ? 'GET' : 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: body === undefined ? undefined : JSON.stringify(body) });
        const raw = await response.text(); let data; try { data = JSON.parse(raw); } catch { data = {}; }
        return { httpStatus: response.status, raw, ...data };
    }
    const ok = (result) => { assert.equal(result.httpStatus, 200, result.raw); return result; };
    const fraction = (value) => value.denominator === '1' ? value.numerator : value.numerator + '/' + value.denominator;
    const loginSystem = async () => ok(await request('/login', { employeeId: 'system-admin', secret: 'system-admin-test', role: 'system_admin' })).token;
    const token = await loginSystem(), otherSession = await loginSystem();
    const state = async (year = 2025) => ok(await request(`/annual-leave?year=${year}`, undefined, token)).annualLeave;
    const tables = sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'annual_leave_%' OR name='employee_service_periods' OR name='audit_logs') ORDER BY name").all().map((r) => r.name);
    const snapshot = () => Object.fromEntries(tables.map((table) => [table, sql.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
    const confirm = (preview, overrides = {}) => ({ previewId: preview.previewId, digest: preview.digest,
        revision: preview.revision, confirm: true, reason: '已核對本次預覽', idempotencyKey: crypto.randomUUID(), ...overrides });
    const policy = ok(await request('/annual-leave/policy', { revision: (await state()).revision, confirm: true,
        name: '2025 年度特休', leaveTypeId: 'annual', period: 'calendar_year', prorationBasis: 'calendar_month', rounding: 'raw',
        effectiveFrom: '2025-01-01', agreementReference: 'PRIVATE-POLICY-EVIDENCE', confirmAnnualLeave: true, reason: '建立已核對制度' }, token));
    const service = { employeeId: 'E001', serviceDate: '2024-07-01', excludedPeriods: [], dayHours: '8', employmentType: 'full_time',
        entitlementFactor: '1', factorBasis: '', edgeDateConfirmed: true, verified: true, cutoverDate: '2025-01-01', openingHours: '0',
        openingExpires: '2025-12-31', openingSource: 'PRIVATE-SERVICE-EVIDENCE', takeoverConfirmed: true, reason: '核對年資及接管基準', confirm: true };
    ok(await request('/annual-leave/service', { ...service, revision: (await state()).revision }, token));
    const grantPreview = async () => ok(await request('/annual-leave/grant-preview', { revision: (await state()).revision,
        policyId: policy.policyId, employeeIds: ['E001'], year: 2025, asOf: '2025-12-31', reason: '核對 2025 已取得特休' }, token)).preview;
    const beforePreview = snapshot(), first = await grantPreview();
    assert.deepEqual(snapshot(), beforePreview, 'Preview must not change any annual, service or audit table');
    assert.equal(first.blocked, false, JSON.stringify(first.rows));
    assert.equal(fraction(first.rows[0].calculation.annual.acquiredGrantedDays), '13/2');
    const firstConfirm = confirm(first);
    assert.equal((await request('/annual-leave/grant-confirm', firstConfirm, otherSession)).httpStatus, 409);
    assert.equal((await request('/annual-leave/grant-confirm', { ...firstConfirm, digest: 'invalid-digest' }, token)).httpStatus, 409);
    assert.deepEqual(snapshot(), beforePreview);
    sql.prepare("UPDATE employees SET name='Updated Annual Employee' WHERE id='E001'").run();
    assert.equal((await request('/annual-leave/grant-confirm', firstConfirm, token)).httpStatus, 409);
    const preview = await grantPreview(), body = confirm(preview), beforeGrant = snapshot();
    sql.exec("CREATE TRIGGER annual_http_audit_failure BEFORE INSERT ON audit_logs WHEN NEW.action='annual_leave_grant' BEGIN SELECT RAISE(FAIL,'private audit error'); END");
    const auditFailure = await request('/annual-leave/grant-confirm', body, token);
    assert.equal(auditFailure.httpStatus, 500); assert.ok(!auditFailure.raw.includes('private audit error'));
    assert.deepEqual(snapshot(), beforeGrant, 'Audit failure must roll back rights, allocation, ledger and idempotency rows');
    sql.exec('DROP TRIGGER annual_http_audit_failure');
    const granted = ok(await request('/annual-leave/grant-confirm', body, token));
    assert.equal(granted.addedLots, 2); assert.equal(granted.replayed, false);
    const afterGrant = snapshot(), replay = ok(await request('/annual-leave/grant-confirm', body, token));
    assert.equal(replay.replayed, true); assert.equal(replay.batchId, granted.batchId); assert.deepEqual(snapshot(), afterGrant);
    assert.equal((await request('/annual-leave/grant-confirm', { ...body, reason: 'different' }, token)).httpStatus, 409);
    assert.equal((await request('/annual-leave/grant-confirm', { ...body, idempotencyKey: crypto.randomUUID() }, token)).httpStatus, 409);
    assert.equal((await grantPreview()).rows[0].status, 'unchanged');
    assert.equal(fraction((await state()).balances[0].exact.availableHours), '52');
    assert.equal(fraction((await state(2026)).balances[0].exact.availableHours), '28');
    assert.equal((await request('/annual-leave/service', { ...service, serviceDate: '2023-07-01', serviceEffectiveFrom: '2025-01-01', revision: (await state()).revision }, token)).httpStatus, 409);

    const employee = ok(await request('/login', { employeeId: 'E001', secret: 'employee-card', role: 'account' }));
    const ownView = ok(await request('/employee/annual-leave?year=2025', undefined, employee.token));
    assert.deepEqual(ownView.employees.map((row) => row.employeeId), ['E001']);
    assert.equal(ownView.employees[0].lots.length, 2); assert.ok(!ownView.raw.includes('PRIVATE-'));
    assert.equal((await request('/employee/annual-leave?employeeId=A002&year=2025', undefined, employee.token)).httpStatus, 403);
    assert.equal((await request('/annual-leave?year=2025', undefined, employee.token)).httpStatus, 403);
    const supervisors = f.db.getSupervisors();
    const assign = (supervisorIds) => supervisors.saveAssignments({ employeeId: 'E001', supervisorIds,
        revision: supervisors.assignmentsState().employees.find((row) => row.id === 'E001').revision,
        reason: '測試明確代辦範圍' }, (entry) => ({ ...entry, actor_id: '__test__' }));
    assign(['A001']);
    const managerLogin = ok(await request('/login', { employeeId: 'A001', secret: 'A001-test-password', role: 'account' }));
    const manager = managerLogin.dashboard.role === 'workspace' ? ok(await request('/workspace', { role: 'employee' }, managerLogin.token)) : managerLogin;
    const managerView = ok(await request('/employee/annual-leave?employeeId=E001&year=2025', undefined, manager.token));
    assert.deepEqual(managerView.employees.map((row) => row.employeeId), ['E001']); assert.ok(!managerView.raw.includes('PRIVATE-'));
    assert.equal((await request('/employee/annual-leave?employeeId=A002&year=2025', undefined, manager.token)).httpStatus, 403);
    assign([]);
    assert.equal((await request('/employee/annual-leave?employeeId=E001&year=2025', undefined, manager.token)).httpStatus, 403);

    const beforeCloseState = await state(), source = beforeCloseState.allocations.find((allocation) => allocation.year === 2025 && allocation.eventKey === 'y1');
    assert.ok(source, JSON.stringify(beforeCloseState.allocations));
    const closeInput = { revision: beforeCloseState.revision, year: 2025, asOf: '2026-01-01', closureType: 'year_end',
        rows: beforeCloseState.allocations.filter((allocation) => allocation.year === 2025).map((allocation) => ({ allocationId: allocation.id, mode: allocation.id === source.id ? 'carry' : 'wage',
            ...(allocation.id === source.id ? { agreementDate: '2025-12-31', evidence: 'PRIVATE-CONSENT-EVIDENCE' } : {}) })), reason: '逐來源核對未休權利' };
    assert.equal((await request('/annual-leave/close-preview', { ...closeInput, rows: [{ allocationId: source.id, mode: 'carry' }] }, token)).httpStatus, 400);
    assert.equal((await request('/annual-leave/close-preview', { ...closeInput, year: 2024 }, token)).httpStatus, 400);
    const beforeClose = snapshot(), closePreview = ok(await request('/annual-leave/close-preview', closeInput, token)).preview;
    assert.deepEqual(snapshot(), beforeClose); assert.equal(closePreview.blocked, false, JSON.stringify(closePreview.rows));
    const closed = ok(await request('/annual-leave/close-confirm', confirm(closePreview), token));
    assert.equal(closed.carriedCount, 1); assert.equal(closed.wagePendingCount, 1);
    const closedState = await state();
    assert.deepEqual(closedState.closures.map((row) => row.status).sort(), ['carried', 'wage_pending']);
    assert.equal(fraction(closedState.balances[0].exact.availableHours), '0');
    const current = await state(2026), carry = current.allocations.find((allocation) => allocation.kind === 'carry');
    assert.ok(carry); assert.equal(carry.canCarry, false); assert.equal(fraction(carry.availableHours), '28');
    const carryAgain = ok(await request('/annual-leave/close-preview', { revision: current.revision, year: 2026, asOf: '2027-01-01',
        closureType: 'year_end', rows: [{ allocationId: carry.id, mode: 'carry', agreementDate: '2026-12-31', evidence: 'PRIVATE-SECOND-CONSENT' }], reason: '測試禁止重複遞延' }, token)).preview;
    assert.equal(carryAgain.blocked, true);
    assert.equal((await request('/annual-leave/close-confirm', confirm(carryAgain), token)).httpStatus, 409);
    const correctionInput = { revision: current.revision, allocationId: carry.id, quantity: '0.125', reason: '精確差額核對' };
    const correction = ok(await request('/annual-leave/correction-preview', correctionInput, token)).preview;
    assert.equal(fraction(correction.rows[0].deltaHours), '1/8');
    ok(await request('/annual-leave/correction-confirm', confirm(correction), token));
    const corrected = await state(2026);
    assert.equal(fraction(corrected.allocations.find((allocation) => allocation.id === carry.id).availableHours), '225/8');
    assert.equal((await request('/annual-leave/correction-preview', { ...correctionInput, revision: corrected.revision, quantity: '-1000' }, token)).httpStatus, 400);
    const exportResult = ok(await request('/annual-leave/export?year=2025&format=json', undefined, token));
    assert.equal(exportResult.closures.length, 2); assert.ok(!exportResult.raw.includes('PRIVATE-'));
    assert.ok(exportResult.closures.every((row) => row.amount && row.mode && row.originalPeriodStart && row.originalPeriodEndExclusive));
    assert.deepEqual(exportResult.calculations.map((row) => row.employeeId), ['E001']);
    assert.equal(exportResult.calculations[0].lots.length, 2);
    assert.ok(exportResult.calculations[0].lots.every((lot) => lot.calculation?.steps.length > 0));
    const afterClosedView = ok(await request('/employee/annual-leave?year=2025', undefined, employee.token));
    assert.ok(!afterClosedView.raw.includes('PRIVATE-'));
    assert.ok(afterClosedView.employees[0].closures.some((row) => row.status === 'wage_pending'));
});
