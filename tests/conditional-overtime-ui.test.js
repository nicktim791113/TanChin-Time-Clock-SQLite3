const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

const moduleCode = fs.readFileSync(require.resolve('../browser-client/conditional-overtime.js'), 'utf8');
function loadUi() {
    const calls = [];
    const state = { token: 'login-1', dashboard: { role: 'employee', user: { id: 'E001' } } };
    const listeners = {};
    const context = vm.createContext({
        state, document: { addEventListener(type, listener) { (listeners[type] ||= []).push(listener); } },
        escapeHtml(text) { return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); },
        renderDashboard() {}, postRenderSetup() {}, handleLogout() {}, handleRealtimeSyncMessage() {}, renderRequestReviewProgress() { return '原主管審核'; },
        requestJson(url, options) { return new Promise((resolve, reject) => calls.push({ url, options, resolve, reject })); }
    });
    vm.runInContext(moduleCode, context);
    return { context, calls, state, listeners, run: code => vm.runInContext(code, context) };
}

function formFixture() {
    const body = { startDate: '2026-11-14', startTime: '08:20', endDate: '2026-11-14', endTime: '17:00' };
    const checked = [{ value: 'E001' }];
    const ack = { checked: false, focus() {} };
    const host = { textContent: '', innerHTML: '', querySelector: () => ack };
    const form = { isConnected: true, querySelector: () => host, querySelectorAll: () => checked,
        elements: { namedItem: name => ({ value: body[name] }) } };
    return { form, body, checked, host, ack };
}

const previewRow = { employeeId: 'E001', required: true, fingerprint: 'observed-rule-1',
    evidence: [{ weekSaturday: '2026-11-14', leaveDate: '2026-11-11', leaveReason: 'private medical note' }],
    reviewers: [{ id: 'R01', name: '<Review>' }] };

test('proxy and paper form gate require a displayed and acknowledged server preview for the current period and employee set', async () => {
    const ui = loadUi();
    const fixture = formFixture();
    Object.assign(ui.context, fixture);
    const request = "cotReviewForm(form,body,cotCurrentIds(form,'employeeIds'),'employeeIds')";
    const initial = ui.run(request);
    assert.equal(ui.calls[0].url, '/api/browser/supervisors/conditional-overtime/preview');
    assert.deepEqual(JSON.parse(JSON.stringify(ui.calls[0].options.body)), { employeeIds: ['E001'], ...fixture.body });
    ui.calls[0].resolve({ previews: [previewRow] });
    assert.equal(await initial, null);
    assert.match(fixture.host.innerHTML, /條件複核預覽[\s\S]*2026-11-11[\s\S]*R01 &lt;Review&gt;[\s\S]*data-cot-ack/);
    assert.doesNotMatch(fixture.host.innerHTML, /private medical note|observed-rule-1/);
    assert.equal(await ui.run(request), null);
    fixture.ack.checked = true;
    assert.equal((await ui.run(request)).E001, 'observed-rule-1');
    fixture.checked[0].value = 'E002';
    const changed = ui.run(request);
    assert.equal(ui.calls.length, 2);
    fixture.body.endTime = '18:00';
    ui.calls[1].resolve({ previews: [{ employeeId: 'E002', required: false }] });
    assert.equal(await changed, null, 'never acknowledge a response for a changed period');
    const retry = ui.run(request);
    assert.equal(ui.calls[2].options.body.endTime, '18:00');
    ui.calls[2].resolve({ previews: [{ employeeId: 'E002', required: true, blockedReason: '沒有有效複核人' }] });
    assert.equal(await retry, null);
    assert.match(fixture.host.innerHTML, /目前無可用複核人，送出後需由管理者重新指派/);
    assert.doesNotMatch(fixture.host.innerHTML, /data-cot-ack/);
    const unassigned = ui.run(request);
    ui.calls[3].resolve({ previews: [{ employeeId: 'E002', required: true, blockedReason: '沒有有效複核人', fingerprint: 'pending-assignment' }] });
    assert.equal(await unassigned, null);
    assert.match(fixture.host.innerHTML, /目前無可用複核人[\s\S]*data-cot-ack/);
    assert.equal((await ui.run(request)).E002, 'pending-assignment');
});

test('a cross-identity preview cannot update another account form', async () => {
    const ui = loadUi();
    const fixture = formFixture();
    Object.assign(ui.context, fixture);
    const pending = ui.run("cotReviewForm(form,body,['E001'],'employeeIds')");
    ui.state.token = 'login-2';
    ui.state.dashboard.user.id = 'E002';
    ui.calls[0].resolve({ previews: [previewRow] });
    assert.equal(await pending, null);
    assert.doesNotMatch(fixture.host.innerHTML, /2026-11-11|data-cot-ack/);
});

test('conditional settings default disabled, offer all leave types, and never preselect reviewers', () => {
    const ui = loadUi();
    ui.state.dashboard = { role: 'admin', user: { id: 'A01' }, permissions: { admin: ['admin.overtime.conditionalSettings'] } };
    ui.context.settingsData = { settings: { enabled: false, revision: 0, reviewerIds: [], leaveTypeIds: [] },
        employees: [{ id: 'A02', name: 'Reviewer' }], leaveTypes: [{ id: 'annual', name: '特休' }], canEdit: true };
    assert.equal(ui.run('cotCanSettings()'), true);
    ui.run('cotSettings.data=settingsData; cotSettings.draft=cotSettingsDraft(settingsData)');
    let html = ui.run('cotRenderSettings()');
    assert.match(html, /name="enabled" >啟用/);
    assert.match(html, /name="leaveTypeIds" value="annual" checked/);
    assert.doesNotMatch(html, /value="A02" selected/);
    ui.state.dashboard.impersonation = { active: true };
    html = ui.run('cotRenderSettings()');
    assert.match(html, /fieldset disabled/);
    ui.state.dashboard.permissions.admin = ['admin.leave.settings'];
    assert.equal(ui.run('cotCanSettings()'), false);
});

test('the approval history adds a separate second stage, names the actual reviewer, and omits private leave metadata', () => {
    const ui = loadUi();
    ui.context.row = { id: 'OT-1', additionalReview: { required: true, status: 'pending', reconciliationRequired: true,
        evidence: [{ ...previewRow.evidence[0], leaveTypeId: 'health-sensitive' }],
        reviewerIds: ['R01'], reviewers: previewRow.reviewers, canReview: true,
        reviewerVotes: [{ reviewerId: 'R02', decision: 'approved', decidedAt: Date.parse('2026-11-14T17:00+08:00') }] } };
    const html = ui.run('renderRequestReviewProgress(row)');
    assert.match(html, /<details class="cot-progress"><summary>[^<]*待額外複核[\s\S]*?原已核准，待補複核<\/span><\/summary>/);
    assert.doesNotMatch(html, /<details[^>]*\bopen\b/);
    assert.match(html, /<\/summary>[\s\S]*data-cot-open="OT-1"/);
    assert.match(html, /原主管審核[\s\S]*第二階段[\s\S]*待額外複核[\s\S]*補複核[\s\S]*R02[\s\S]*2026-11-14 17:00/);
    assert.match(html, /data-cot-open="OT-1">辦理複核/);
    assert.doesNotMatch(html, /private medical note|health-sensitive/);
});

test('admin-view inbox uses the complete scoped endpoint and displays at most 15 compact rows per page', async () => {
    const ui = loadUi();
    ui.state.dashboard = { role: 'admin', user: { id: 'A01' }, permissions: { admin: ['admin.overtime.view'] } };
    const host = { outerHTML: '' };
    ui.context.document.getElementById = id => id === 'conditional-overtime-inbox' ? host : null;
    const records = Array.from({ length: 52 }, (_, index) => ({
        id: `OT-${index + 1}`, employeeName: '<Name>', employeeId: `EMP-${index + 1}`, startText: '2026-11-14 08:20',
        endText: '2026-11-14 17:00', duration_hours: 8,
        additionalReview: {
            status: 'pending', required: true, reconciliationRequired: index === 0,
            evidence: [{ weekSaturday: '2026-11-14', leaveDate: '2026-11-11' }, { weekSaturday: '2026-11-14', leaveDate: '2026-11-12' }],
            eligibleReviewerIds: index === 0 ? [] : ['R01'], reviewers: previewRow.reviewers
        }
    }));
    const loading = ui.run('cotLoadInbox()');
    assert.equal(ui.calls[0].url, '/api/browser/supervisors/conditional-overtime/inbox');
    ui.calls[0].resolve({ records });
    await loading;
    assert.equal((host.outerHTML.match(/data-cot-open=/g) || []).length, 15);
    assert.match(host.outerHTML, /第 1／4 頁 · 共 52 筆/);
    assert.match(host.outerHTML, /&lt;Name&gt;[\s\S]*待管理者指派[\s\S]*原已核准，待補複核/);
    assert.match(host.outerHTML, /R01 &lt;Review&gt;/);
    assert.doesNotMatch(host.outerHTML, /2026-11-11|data-cot-open="OT-16"/);
    const target = { closest: selector => selector === '[data-cot-page]' ? { dataset: { cotPage: '4' } } : null };
    for (const click of ui.listeners.click) await click({ target });
    assert.match(host.outerHTML, /第 4／4 頁 · 共 52 筆/);
    assert.equal((host.outerHTML.match(/data-cot-open=/g) || []).length, 7);
    assert.match(host.outerHTML, /data-cot-open="OT-52"/);
});
