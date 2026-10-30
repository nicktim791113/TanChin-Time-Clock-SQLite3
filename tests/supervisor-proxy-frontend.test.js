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
            assert.doesNotMatch(html,/sp-category-help/);
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
test('supervisor keyword markup colors only static category words and is opt-in for shared leave UI', () => {
    const { run, context } = client();
    vm.runInContext(fs.readFileSync(require.resolve('../browser-client/leave-days.js'), 'utf8'), context);
    const plain = run('renderLeaveDaysAddTools({autoHours:true})');
    assert.match(plain, /<span>每日實際請假時數（自動計算）<\/span>/); assert.doesNotMatch(plain, /ld-category-keyword/);
    const tools = run('renderLeaveDaysAddTools({autoHours:true,categoryKeywords:true})');
    assert.match(tools, /<span>每日實際<span class="ld-category-keyword ld-category-leave">請假<\/span>時數（自動計算）<\/span>/);
    assert.match(tools, /aria-label="加入區間的每日實際請假時數"/);
    const editor = run('renderLeaveDaysEditor({externalTools:true,categoryKeywords:true})');
    assert.match(editor, /<h4>同一張單的<span class="ld-category-keyword ld-category-leave">請假<\/span>時段<\/h4>/);
    const summary = run("renderLeaveDaysSummary({dateSelectionMode:'explicit_segments',leaveSegments:[]},{categoryKeywords:true})");
    assert.match(summary, /<summary>實際<span class="ld-category-keyword ld-category-leave">請假<\/span> 0 日/);
    context.holder={}; context.state.dashboard.impersonation={active:false};
    run("leaveMealState(holder).options=[{participates:true,date:'2026-10-29',employeeId:'E001',serving:true,canChange:true,eating:true}]");
    const meal = run('renderLeaveMealOptions(holder,[],{categoryKeywords:true})');
    assert.match(meal, /<legend><span class="ld-category-keyword ld-category-meals">午餐<\/span>安排<\/legend>/);
    const css = fs.readFileSync(require.resolve('../browser-client/supervisor.css'), 'utf8');
    assert.match(css, /ld-category-leave \{ color: #b42332;/); assert.match(css, /sp-category-word-overtime \{ color: #9a4300;/); assert.match(css, /ld-category-meals \{ color: #174ea6;/);
    assert.doesNotMatch(css, /\.sp-category-leave \.ld-heading h4|label:has|\.ld-request-summary > summary|leave-meal-options > legend/);
});
test('supervisor leave entry packs eight fields and overtime five, with compact opt-in steps and readonly hours', () => {
    const { run, context } = client();
    vm.runInContext(fs.readFileSync(require.resolve('../browser-client/leave-days.js'), 'utf8'), context);
    run("supervisorState.data={employees:[],leaveTypes:[]}; supervisorState.kind='leave'");
    const html = run('spRequestForm()');
    const entry = html.slice(html.indexOf('class="sp-entry-grid'), html.indexOf('<section class="ld-editor'));
    assert.equal((entry.match(/class="field"/g)||[]).length,8);
    assert.match(entry,/開始日期/); assert.match(entry,/每日開始時間/); assert.match(entry,/每日結束時間/);
    assert.doesNotMatch(entry,/新增區間開始日期|新增區間結束日期|時數（自動計算）/);
    assert.match(entry,/data-ls-batch-hours readonly aria-readonly="true"/);
    assert.match(entry,/<details class="sp-time-details">/);
    assert.match(html,/1　填日期時間/); assert.match(html,/2　加入清單/); assert.match(html,/3　核對後代送出/);
    assert.equal((html.match(/<svg /g)||[]).length,3);
    assert.match(html,/同日不同時段/); assert.match(html,/不同班表請分開申請/);
    run("supervisorState.kind='overtime'");
    const overtime = run('spRequestForm()');
    const overtimeEntry = overtime.slice(overtime.indexOf('class="sp-entry-grid'), overtime.indexOf('</div>', overtime.indexOf('class="sp-entry-grid')));
    assert.equal((overtimeEntry.match(/class="field"/g)||[]).length,5);
    assert.match(overtime,/sp-entry-overtime/);
    const shared = run('renderLeaveDaysEditor({batch:true})');
    assert.doesNotMatch(shared,/sp-leave-steps/); assert.match(shared,/先填上方的新增區間/);
});
test('real leave sync keeps supervisor short date labels while paper retains range labels and automatic hours', () => {
    const { run, context } = client();
    vm.runInContext(fs.readFileSync(require.resolve('../browser-client/leave-days.js'), 'utf8'), context);
    run(`var labels=Object.fromEntries(['startDate','startTime','endDate','endTime'].map(key=>[key,{textContent:key,dataset:{}}]));
        var values={startDate:'2026-10-30',startTime:'08:20',endDate:'2026-10-30',endTime:'17:00',durationHours:'',dailyHours:''};
        var controls=Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{value,closest:()=>({querySelector:()=>labels[key]})}]));
        var rest={value:''}, hours={value:'',readOnly:true}, summary={}, message={};
        var editor={dataset:{ldMode:'segments',lsAutoHours:'true',lsExternalTools:'true',lsSupervisorSteps:'true'},querySelector(selector){return selector.includes('summary')?summary:message;}};
        var form={elements:{namedItem:key=>controls[key]},querySelectorAll:()=>[],querySelector(selector){return selector==='[data-leave-days]'?editor:selector.includes('batch-break')?rest:hours;}};
        syncLeaveDaysEditor(form);`);
    assert.equal(run('labels.startDate.textContent'),'開始日期'); assert.equal(run('labels.endDate.textContent'),'結束日期');
    assert.equal(run('hours.value'),'8'); assert.equal(run('hours.readOnly'),true);
    run("controls.endTime.value='12:20'; syncLeaveDaysEditor(form)");
    assert.equal(run('labels.startDate.textContent'),'開始日期'); assert.equal(run('hours.value'),'4');
    run("editor.dataset.lsSupervisorSteps='false'; syncLeaveDaysEditor(form)");
    assert.equal(run('labels.startDate.textContent'),'新增區間開始日期'); assert.equal(run('labels.endDate.textContent'),'新增區間結束日期');
});
test('supervisor steps replace the old batch paragraph through render and mode-reset sync; paper retains it', () => {
    const { run, context } = client();
    vm.runInContext(fs.readFileSync(require.resolve('../browser-client/leave-days.js'), 'utf8'), context);
    assert.doesNotMatch(run('renderLeaveDaysEditor({batch:true,supervisorSteps:true})'),/所選員工共用下方所有時段/);
    assert.match(run('renderLeaveDaysEditor({batch:true})'),/所選員工共用下方所有時段/);
    assert.match(run('renderLegacyLeaveDaysEditor({batch:true})'),/所選員工共用以下日期/);
    run(`var rebuilt=''; var initialEditor={dataset:{ldMode:'legacy',ldBatch:'true',lsAutoHours:'true',lsExternalTools:'true',lsSupervisorSteps:'true',lsCategoryKeywords:'true'},set outerHTML(html){rebuilt=html;this.dataset.ldMode='segments';}};
        var form={querySelector:()=>initialEditor,elements:{namedItem:()=>null}};
        var savedSync=lsSyncBatch, savedPaint=lsPaintRows; lsSyncBatch=()=>{};lsPaintRows=()=>{};
        syncLeaveDaysEditor(form,{reset:true}); lsSyncBatch=savedSync;lsPaintRows=savedPaint;`);
    const rebuilt=run('rebuilt'); assert.match(rebuilt,/sp-leave-steps/);assert.match(rebuilt,/不同班表請分開申請/);assert.doesNotMatch(rebuilt,/所選員工共用下方所有時段/);
});
