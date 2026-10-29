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
    assert.ok(html.indexOf('TOOLS') < html.indexOf('EDITOR')); assert.match(html, /disabled>代送出請假申請/);
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
test('category cues cover all three proxy categories in create and records modes', () => {
    const { run } = client();
    run(`supervisorState.date='2026-10-29'; supervisorState.month='2026-10'; supervisorState.recordEmployeeIds=['E001'];
        supervisorState.data={ employees:[{id:'E001'}], leaveTypes:[{id:1,name:'事假'}], batchMeal:{employees:[{id:'E001',canChange:true}]},
        calendar:{days:[],detail:{records:[],totalPages:1}}, meals:{days:[{date:'2026-10-29',serving:true,locked:false,deadline:Date.now()+600000,cutoff:'12:00',rows:[{employee_id:'E001',eligible:true,eating:true}]}]} };`);
    for (const kind of ['leave','overtime','meals']) {
        for (const view of ['create','records']) {
            run(`supervisorState.kind='${kind}'; supervisorState.proxyView='${view}'`);
            const html = run('renderSupervisorWorkspace()');
            assert.match(html,new RegExp(`sp-category-panel sp-category-${kind}`));
            assert.match(html,/sp-kind-tabs/); assert.match(html,new RegExp(`sp-category-word-${kind}`));
            assert.match(html,/淡藍色.*淡紫色.*淡綠色/);
        }
    }
});
test('category-specific submit labels remain correct when busy, simulated, or resetting a blank draft', () => {
    const { run } = client();
    run(`supervisorState.date='2026-10-29'; supervisorState.data={employees:[{id:'E001'}],leaveTypes:[],batchMeal:{employees:[{id:'E001',canChange:true}]},meals:{days:[{date:'2026-10-29',serving:true,locked:false,deadline:Date.now()+600000,cutoff:'12:00',rows:[{eating:true}]}]}}; supervisorState.proxyView='create';`);
    for (const kind of ['leave','overtime','meals']) {
        for (const busy of [false,true]) {
            run(`supervisorState.kind='${kind}'; supervisorState.busy=${busy}`);
            const html = run(kind === 'meals' ? 'spMealDetail()' : 'spRequestForm()');
            const label = {leave:'請假',overtime:'加班',meals:'午餐團膳'}[kind];
            assert.match(html,new RegExp(`disabled>代送出${label}申請`));
            assert.doesNotMatch(html,/送出代申請|儲存午餐代登/);
            if (kind !== 'meals') { assert.match(html,/重設表單/); assert.match(html,/"selectedIds":\[\]/); }
        }
    }
});
test('shared leave tool hours title and saved period summary have precise category color hooks', () => {
    const { run, context } = client();
    vm.runInContext(fs.readFileSync(require.resolve('../browser-client/leave-days.js'), 'utf8'), context);
    const tools = run('renderLeaveDaysAddTools({autoHours:true})');
    assert.match(tools, /<label class="field"><span>每日實際請假時數（自動計算）<\/span><input[^>]*data-ls-batch-hours/);
    const css = fs.readFileSync(require.resolve('../browser-client/supervisor.css'), 'utf8');
    assert.match(css, /\.sp-category-leave \[data-ls-add-tools\] label:has\(> \[data-ls-batch-hours\]\) > span,\s*\.sp-category-leave \.ld-request-summary > summary \{ color: #205d91; \}/);
    assert.doesNotMatch(css, /\.sp-category-leave\s+(?:input|p|\.ls-rows)\s*\{[^}]*color:/);
});
