const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function annualUi({ canRevise = true, canManage = true } = {}) {
    const listeners = {}, requests = [];
    const policy = { id: 'policy-original', name: '曆年特休', effectiveFrom: '2026-11-01', leaveTypeId: 'annual',
        period: 'calendar_year', prorationBasis: 'calendar_month', rounding: 'raw', agreementReference: '核對紀錄', canRevise };
    const data = { revision: 'current-revision', today: '2026-10-28', policies: [policy], employees: [], services: [], accounts: [] };
    const permissions = { policyManage: canManage, grant: true };
    const context = vm.createContext({
        state: { dashboard: { role: 'admin' } },
        escapeHtml: (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
        hasCurrentAdminPermission: () => true,
        document: { addEventListener(type, fn) { listeners[type] = fn; }, getElementById: () => null, querySelector: () => null },
        window: { addEventListener() {}, confirm: () => true, crypto: { randomUUID: () => 'fixture-id' } },
        renderDashboard() {}, renderLeaveEntitlementWorkspace() {}, postRenderSetup() {}, handleLogout() {},
        handleDashboardClick() {}, handleDashboardChange() {}, handleRealtimeSyncMessage() {}, setMessage() {},
        FormData: class { constructor(form) { return Object.entries(form.values); } },
        async requestJson(route, options) { requests.push({ route, options }); return { annualLeave: data, permissions }; },
        fixtureData: data, fixturePermissions: permissions
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../browser-client/annual-leave.js'), 'utf8'), context);
    const run = (source) => vm.runInContext(source, context);
    run("Object.assign(alState, { identity: 'fixture', data: fixtureData, permissions: fixturePermissions });");
    return { run, requests, policy, data,
        async click(action, policyId = policy.id) {
            return listeners.click({ preventDefault() {}, target: { closest: () => ({ dataset: { alAction: action, policyId } }) } });
        },
        async submit(operation, values) {
            context.fixtureForm = { dataset: { alForm: operation }, values, reportValidity: () => true,
                querySelectorAll: () => Object.entries(values).filter(([, value]) => typeof value === 'boolean').map(([name, checked]) => ({ name, checked })) };
            return run('alSubmit(fixtureForm)');
        }
    };
}

test('unused policy revision preserves identity and effective date, uses revision endpoint and never posts grants', async () => {
    const ui = annualUi();
    await ui.click('revise-policy');
    assert.equal(ui.run('alState.tab'), 'policy');
    assert.equal(ui.run('alState.dirty'), true, 'The revision form must retain the revision it was opened against');
    assert.equal(ui.run('alState.drafts.policy.policyId'), ui.policy.id);
    assert.equal(ui.run('alState.drafts.policy.effectiveFrom'), '2026-11-01');
    assert.match(ui.run('alRenderPolicy()'), /name="effectiveFrom"[^>]*readonly/);
    const draft = JSON.parse(ui.run('JSON.stringify(alState.drafts.policy)'));
    await ui.submit('policy-revision', { ...draft, halfYearMode: 'full_at_acquisition_year_end',
        reason: '半年整筆給，年底結清', confirmAnnualLeave: true, confirmUnusedRevision: true });
    assert.equal(ui.requests[0].route, '/api/browser/annual-leave/policy-revision');
    const body = ui.requests[0].options.body;
    assert.equal(body.policyId, ui.policy.id);
    assert.equal(body.revision, 'current-revision');
    assert.equal(body.effectiveFrom, '2026-11-01');
    assert.equal(body.halfYearMode, 'full_at_acquisition_year_end');
    assert.equal(body.confirmUnusedRevision, true);
    assert.equal(body.confirm, true);
    assert.ok(ui.requests.every(({ route }) => !/grant|service|close/.test(route)));
    assert.equal(ui.run('alState.drafts.policy'), undefined);
});

test('canceling a revision discards its target so a later create cannot revise the prior policy', async () => {
    const ui = annualUi();
    await ui.click('revise-policy');
    ui.run("alState.dirty = true; alState.drafts.policy.name = 'Unsaved';");
    await ui.click('cancel-policy-revision');
    assert.equal(ui.run('alState.drafts.policy'), undefined);
    assert.equal(ui.run('alState.dirty'), false);
    assert.match(ui.run('alRenderPolicy()'), /data-al-form="policy"/);
    assert.doesNotMatch(ui.run('alRenderPolicy()'), /name="policyId"/);
    assert.equal(ui.requests.length, 0);
});

test('revocation or newly used policy blocks revision before submitting any mutation', async () => {
    for (const change of [
        (ui) => { ui.policy.canRevise = false; },
        (ui) => ui.run('alState.permissions.policyManage = false;')
    ]) {
        const ui = annualUi();
        await ui.click('revise-policy');
        change(ui);
        await assert.rejects(ui.submit('policy-revision', { policyId: ui.policy.id, confirmUnusedRevision: true }), /不能修訂|沒有制度設定權限/);
        assert.equal(ui.requests.length, 0);
        assert.doesNotMatch(ui.run('alPolicyList()'), /data-al-action="revise-policy"/);
    }
});

test('legacy policies remain prorated and anniversary submissions cannot enable year-end half-year mode', async () => {
    const ui = annualUi();
    assert.match(ui.run('alRenderPolicy()'), /value="prorated" selected/);
    await ui.submit('policy', { name: '週年制', period: 'anniversary', halfYearMode: 'full_at_acquisition_year_end' });
    assert.equal(ui.requests[0].options.body.halfYearMode, 'prorated');
});

test('full half-year previews explain immediate source availability, year-end wage status and no January regrant', () => {
    const ui = annualUi();
    const html = ui.run("alRenderCalculation({ calculation: { policy: { halfYearMode: 'full_at_acquisition_year_end' } } })");
    assert.match(html, /不拆到明年/);
    assert.match(html, /不代表已付款/);
    assert.match(html, /1\/1 不重發半年假/);
    assert.match(html, /滿一年才取得另一筆 7 天/);
    assert.match(html, /不會背景自動入帳/);
});

test('an already posted opening balance preserves its half-year restriction when service data is revised', async () => {
    const ui = annualUi();
    ui.data.services.push({ employeeId: 'E088', openingHalfYearOnly: true, frozen: true });
    ui.data.accounts.push({ employeeId: 'E088' });
    await ui.submit('service', { employeeId: 'E088', employmentType: 'full_time', openingHalfYearOnly: false });
    assert.equal(ui.requests[0].route, '/api/browser/annual-leave/service');
    assert.equal(ui.requests[0].options.body.openingHalfYearOnly, true);
    assert.ok(ui.requests.every(({ route }) => !/grant-confirm|close-confirm/.test(route)));
});
