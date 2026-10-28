const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
function client() {
    const context = { auditActionLabels: {}, auditTargetTypeLabels: {}, state: { dashboard: { supervisorProxy: { canView: true, canUse: false } } }, document: { addEventListener() {} }, escapeHtml: (x) => String(x), renderAdminPaperEmployeePicker: (_, __, ___, options) => JSON.stringify(options), renderLeaveDaysAddTools: () => 'TOOLS', renderLeaveDaysEditor: () => 'EDITOR' };
    for (const name of ['handleLogout', 'renderDashboard', 'renderEmployeeWorkspaceItems', 'renderAdminPermissionAwareContent', 'renderSystemAdminDashboard', 'postRenderSetup', 'handleDashboardClick', 'handleDashboardChange', 'handleDashboardSubmit', 'handleRealtimeSyncMessage']) context[name] = () => {};
    vm.createContext(context); vm.runInContext(fs.readFileSync(require.resolve('../browser-client/supervisor.js'), 'utf8'), context);
    return { run: (source) => vm.runInContext(source, context), context };
}
test('proxy simulated identity can inspect and draft but writes reject before network', async () => {
    const { run } = client();
    assert.equal(run('spCanView()'), true); assert.equal(run('spCanWrite()'), false);
    await assert.rejects(run("spSave('leave', {})"), /身份模擬/);
});
test('create form has empty target selection and required blank leave type, with tools above list', () => {
    const { run } = client();
    run("supervisorState.data = { employees: [{id:'E001'}], leaveTypes:[{id:1,name:'事假'}] }; supervisorState.employeeId='E001'; supervisorState.kind='leave'");
    const html = run('spRequestForm()');
    assert.match(html, /"selectedIds":\[\]/); assert.match(html, /<option value="">請選擇假別<\/option>/);
    assert.ok(html.indexOf('TOOLS') < html.indexOf('EDITOR')); assert.match(html, /disabled>送出代申請/);
    assert.equal((html.match(/class="sp-reason-pill"/g) || []).length, 2);
});
test('overtime hours follow dates and times with minute based two digit truncation', () => {
    const { run, context } = client();
    context.form = { dataset: { spForm: 'overtime' }, elements: Object.fromEntries(Object.entries({ startDate:'2026-10-29', endDate:'2026-10-30', startTime:'23:30', endTime:'00:31', durationHours:'' }).map(([key,value]) => [key,{value}])) };
    run('spSyncOvertime(form)'); assert.equal(context.form.elements.durationHours.value, '1.01');
    context.form.elements.endDate.value = '2026-10-29'; run('spSyncOvertime(form)'); assert.equal(context.form.elements.durationHours.value, '');
    context.form.elements.startDate.value = ''; run('spSyncOvertime(form)'); assert.equal(context.form.elements.durationHours.value, '');
});
test('overtime synchronization ignores other forms and incomplete controls', () => {
    const { run, context } = client();
    for (const form of [undefined, {}, { dataset: { spForm: 'leave' } }, { dataset: { spForm: 'overtime' } }, { dataset: { spForm: 'overtime' }, elements: {} }]) {
        context.form = form;
        assert.doesNotThrow(() => run('spSyncOvertime(form)'));
    }
});
