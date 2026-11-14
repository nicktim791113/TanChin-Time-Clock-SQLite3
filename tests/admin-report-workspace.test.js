const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const app = fs.readFileSync(require.resolve('../browser-client/app.js'), 'utf8');
function functionSource(name) {
    const start = app.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
    assert.ok(start >= 0, `Missing real app function ${name}`);
    const closing = /^}\r?$/gm; closing.lastIndex = start; const match = closing.exec(app);
    assert.ok(match); return app.slice(start, match.index + 1);
}
// This fixture only parses the renderer's four sibling articles. It deliberately does
// not emulate browser layout or the unrelated intro-card help-button transformation.
function documentFixture() {
    return { createElement(tag) {
        assert.equal(tag, 'template');
        return { set innerHTML(html) {
            const children = [...html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g)].map(([markup]) => ({
                outerHTML: markup, matches: (selector) => selector === 'article',
                setAttribute(name,value) { this.outerHTML=this.outerHTML.replace('<article',`<article ${name}="${value}"`); }
            }));
            this.content={querySelector:()=>({children}),querySelectorAll:()=>[]};
        } };
    } };
}
function fixture() {
    class Form { constructor(values){this.values=values;} getAttribute(){return 'attendance-report-form';} }
    const state={adminReport:null,activeSubSections:{admin:{reports:'query'}},dashboard:{role:'admin'}};
    const requests=[],messages=[];
    const context=vm.createContext({state, document:documentFixture(), console, Date, Set, HTMLFormElement:Form,
        FormData:class{constructor(form){this.form=form;}entries(){return Object.entries(this.form.values);}},
        formatDateInputValue:()=> '2026-10-30',
        escapeHtml:(value)=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'),
        getDatasets:()=>({employees:[]}),setFormMessage:(...args)=>messages.push(args),setMessage:(...args)=>messages.push(args),ui:{},renderDashboard(){},
        requestJson:async(url,options)=>{requests.push({url,...options});throw new Error('fixture query failed');}
    });
    const names=['createDefaultAdminReportState','ensureAdminReportState','renderOptions','renderEmptyState','renderBadge','adminReportCategories','adminReportFilteredRows','adminReportMonthRange','adminReportMonthButtons','adminReportSummaryIdentity','adminReportSummaryPreference','adminReportSummaryOrder','moveAdminReportCard','paintAdminReportSummaryOrder','loadAdminReportSummaryOrder','saveAdminReportSummaryOrder','handleAdminReportCardDrag','adminReportColumns','adminReportSortedRows','syncAdminReportEmployee','renderAdminReportStats','renderAdminReportFilterNote','renderAdminReportRows','renderAdminReportSection','ensureWorkspaceSubnavState','flattenWorkspaceSubnavGroups','getWorkspaceSubnavItemPanelHtml','warnMissingWorkspaceSubnavPanel','compactWorkspaceSummaryCard','parseWorkspaceSubnavPanels','prepareWorkspaceSubnavGroups','getActiveWorkspaceSubnavItem','renderWorkspaceSubnav','renderWorkspaceSubnavSection','handleDashboardSubmit','handleDashboardClick'];
    for(const name of names)vm.runInContext(functionSource(name),context);
    const start=app.indexOf('        reports: {',app.indexOf('const workspaceSubnavConfigs'));
    const end=app.indexOf('        leave: {',start);
    assert.ok(start>=0&&end>start);vm.runInContext('const reportConfig=({'+app.slice(start,end)+'}).reports;',context);
    return {context,state,requests,messages,Form,run:(code)=>vm.runInContext(code,context),render:(datasets={employees:[]})=>{context.datasets=datasets;return vm.runInContext("renderWorkspaceSubnavSection('admin','reports',datasets,reportConfig,renderAdminReportSection)",context);}};
}
test('old report summary/detail subsection state converges to one query page with one form and all result panels',()=>{
    const f=fixture();
    for(const legacy of ['summary','details','detail','query']){
        f.state.activeSubSections.admin.reports=legacy;
        const html=f.render();
        assert.equal(f.state.activeSubSections.admin.reports,'query');
        assert.equal((html.match(/id="attendance-report-form"/g)||[]).length,1);
        for(const panel of ['report-query-panel','report-summary-panel','report-detail-panel'])assert.equal((html.match(new RegExp(panel,'g'))||[]).length,1);
        assert.doesNotMatch(html,/workspace-single-page-layout/);assert.match(html,/<aside/);assert.match(html,/switch-workspace-subsection/);
        assert.equal((html.match(/data-action="export-admin-report"/g)||[]).length,2);
        assert.match(html,/data-template="payroll_leave_overtime"/);
    }
});

test('Taipei shortcuts end the current month today and preserve full previous months', () => {
    const f = fixture();
    const now = Date.parse('2024-03-31T16:00:00Z');
    assert.equal(f.run(`JSON.stringify([0,-1,-2].map(offset => adminReportMonthRange(offset,${now})))`), JSON.stringify([
        { startDate:'2024-04-01', endDate:'2024-04-01' },
        { startDate:'2024-03-01', endDate:'2024-03-31' },
        { startDate:'2024-02-01', endDate:'2024-02-29' }
    ]));
    const newYear = Date.parse('2025-12-31T16:00:00Z');
    const buttons = f.run(`adminReportMonthButtons(${newYear})`);
    assert.match(buttons, /本月 2026\/01/);
    assert.match(buttons, /上月 2025\/12/);
    assert.match(buttons, /上上月 2025\/11/);
});

test('report sorting is stable, natural and numeric without altering CSV source records', () => {
    const f = fixture();
    f.context.rows = [
        { employeeId:'E10', employeeName:'Ten', leaveDurationHours:10, timeText:'12:05:00' },
        { employeeId:'E2', employeeName:'First two', leaveDurationHours:2.75, timeText:'09:50:00' },
        { employeeId:'E2', employeeName:'Second two', leaveDurationHours:2.5, timeText:'09:30:00' },
        { employeeId:'E3', employeeName:'No hours', timeText:'07:00:00' }
    ];
    const names = (key, direction) => JSON.parse(f.run(`JSON.stringify(adminReportSortedRows(rows, {key:'${key}',direction:'${direction}'}).map(row=>row.employeeName))`));
    assert.deepEqual(names('employeeId','ascending'), ['First two','Second two','No hours','Ten']);
    assert.deepEqual(names('leaveDurationHours','ascending'), ['Second two','First two','Ten','No hours']);
    assert.deepEqual(names('timeText','descending'), ['Ten','First two','Second two','No hours']);
    assert.equal(f.context.rows[0].employeeId, 'E10');
    f.state.adminReport = { queried: true, records: f.context.rows, sort: { key:'employeeId', direction:'ascending' } };
    const html = f.render();
    assert.match(html, /<th scope="col" aria-sort="ascending"><button[^>]+data-sort-key="employeeId"/);
    assert.equal((html.match(/data-action="sort-admin-report"/g) || []).length, 11);
});

test('summary card moves post a complete versioned order and ignore an old identity response', async () => {
    const f = fixture();
    f.state.token = 'first';
    f.state.dashboard.user = { id: 'Admin1' };
    f.context.document.querySelector = () => null;
    let complete;
    f.context.requestJson = (url, options) => {
        f.requests.push({ url, ...options });
        return new Promise(resolve => { complete = resolve; });
    };
    const initial = f.run('loadAdminReportSummaryOrder()');
    const defaults = JSON.parse(f.run('JSON.stringify(adminReportSummaryOrder())'));
    complete({ preferences: { order: defaults, defaultOrder: defaults, revision: 'rev1', canEdit: true } });
    await initial;
    const saving = f.run("moveAdminReportCard('leave',-1,true)");
    assert.equal(f.requests[1].body.revision, 'rev1');
    assert.equal(f.requests[1].body.order.join(','), ['all','leave','valid',...defaults.slice(3)].join(','));
    f.state.token = 'second';
    f.state.dashboard.user = { id: 'Admin2' };
    complete({ preferences: { order: f.requests[1].body.order, revision: 'rev2', canEdit: true } });
    await saving;
    assert.equal(f.run('adminReportSummaryPreference().data'), null);
    assert.deepEqual(JSON.parse(f.run('JSON.stringify(adminReportSummaryOrder())')), defaults);
});

test('employee code only selects an exact employee and invalid codes block a query', async () => {
    const f = fixture();
    const staff = [{ id: '001', name: 'One' }];
    f.context.getDatasets = () => ({ employees: staff });
    const code = { value: '01', setCustomValidity(message) { this.validationMessage = message; }, setAttribute() {}, removeAttribute() {} };
    const select = { value: '001' }, feedback = {};
    const form = new f.Form({employeeCode:'01', employeeId:'001', startDate:'2026-10-01', endDate:'2026-10-30'});
    form.elements = { employeeCode: code, employeeId: select };
    form.querySelector = () => feedback;
    await f.context.handleDashboardSubmit({target:form, preventDefault(){}});
    assert.equal(f.requests.length, 0);
    assert.match(feedback.textContent, /找不到此工號/);
    code.value = '001'; form.values.employeeCode = '001';
    await f.context.handleDashboardSubmit({target:form, preventDefault(){}});
    assert.equal(f.requests[0].body.employeeId, '001');
    assert.equal(select.value, '001');
    assert.equal(feedback.textContent, 'One');
});

test('summary category filters exact rows, keeps summary totals, and shows an explicit empty category', () => {
    const f = fixture();
    f.state.adminReport = {
        filters: { startDate:'2026-10-01', endDate:'2026-10-30' }, queried: true, category: 'missing_punch',
        summary: { recordCount: 2, missingPunchDayCount: 1 },
        records: [{ employeeId:'E1', employeeName:'Present', reportCategories:['valid'] },
            { employeeId:'E2', employeeName:'Missing', reportCategories:['abnormal','missing_punch'] }]
    };
    let html = f.render();
    assert.match(html, /data-category="missing_punch" aria-pressed="true"/);
    assert.match(html, /目前顯示與匯出：缺上／下班卡日數 · 明細 1 筆/);
    assert.match(html, /<td>Missing<\/td>/);
    assert.doesNotMatch(html, /<td>Present<\/td>/);
    f.state.adminReport.category = 'pending_punch';
    html = f.render();
    assert.match(html, /此摘要篩選沒有符合/);
    assert.match(html, /data-category="" aria-pressed="false"/);
});

test('clicking a summary updates the existing detail and passes the same category to both CSV exports', async () => {
    const f = fixture();
    f.state.adminReport = { filters:{ employeeId:'E1', startDate:'2026-10-01', endDate:'2026-10-31' }, queried:true,
        records:[{ employeeName:'Missing', reportCategories:['missing_punch'], attendanceFlags:['missing_out'] }, { employeeName:'Present', reportCategories:['valid'] }] };
    const detail = {}, note = {};
    f.context.document.getElementById = () => detail;
    f.context.document.querySelector = () => note;
    f.context.scheduleDataTableColumnFit = () => {};
    f.context.downloadTextFile = () => {};
    f.context.requestJson = async (url, options) => { f.requests.push({ url, ...options }); return { data:{ fileName:'result.csv', csvContent:'' } }; };
    const buttons = ['', 'missing_punch'].map(category => ({ dataset:{ action:'filter-admin-report', category },
        setAttribute(name, value) { this[name] = value; }, closest() { return {querySelectorAll:() => buttons}; } }));
    const click = button => f.context.handleDashboardClick({ target:{ closest: selector => selector === '[data-action]' ? button : null } });
    await click(buttons[1]);
    assert.equal(buttons[1]['aria-pressed'], 'true');
    assert.match(detail.innerHTML, /缺下班卡/);
    assert.doesNotMatch(detail.innerHTML, /Present/);
    assert.match(note.textContent, /缺上／下班卡日數/);
    for (const template of ['payroll', 'payroll_leave_overtime']) await click({ dataset:{ action:'export-admin-report', template } });
    assert.deepEqual(f.requests.map(({ body }) => [body.employeeId, body.category, body.templateId]), [
        ['E1', 'missing_punch', 'payroll'], ['E1', 'missing_punch', 'payroll_leave_overtime']
    ]);
    await click(buttons[1]);
    assert.equal(buttons[0]['aria-pressed'], 'true');
    assert.match(detail.innerHTML, /Present/);
});
test('unqueried and successfully queried zero records remain distinct while retaining query controls',()=>{
    const f=fixture();assert.match(f.render(),/尚未查詢/);assert.match(f.render(),/請先選擇日期區間並查詢考勤報表/);
    f.state.adminReport={filters:{startDate:'2026-10-01',endDate:'2026-10-30'},queried:true,records:[],summary:{recordCount:0,validCount:0}};
    const html=f.render();assert.doesNotMatch(html,/尚未查詢/);assert.match(html,/此條件下沒有查到任何出勤紀錄/);assert.match(html,/查詢筆數/);assert.match(html,/2026-10-01 至 2026-10-30/);
});
test('failed changed query preserves the last successful range and records; output escapes employee and record data',async()=>{
    const f=fixture(),unsafe='<img src=x onerror=alert(1)>';
    const successful={filters:{employeeId:'E001',employeeName:unsafe,startDate:'2026-10-01',endDate:'2026-10-02'},queried:true,summary:{recordCount:1},records:[{employeeId:'E001',employeeName:unsafe,department:'A&B',shift:'<script>bad</script>',sourceText:'"source"'}]};
    f.state.adminReport=successful;
    const form=new f.Form({employeeId:'E002',startDate:'2026-09-01',endDate:'2026-09-30'});
    await f.context.handleDashboardSubmit({target:form,preventDefault(){}});
    assert.equal(f.requests.length,1);assert.equal(f.requests[0].body.employeeId,'E002');
    assert.equal(f.state.adminReport.filters.startDate,'2026-10-01');assert.equal(f.state.adminReport.records.length,1);
    const html=f.render({employees:[{id:'E001',name:unsafe,department:'A&B'}]});
    assert.match(html,/2026-10-01 至 2026-10-02/);assert.match(html,/最後一次成功查詢為準/);
    assert.doesNotMatch(html,/<img|<script>/);assert.match(html,/&lt;img/);assert.match(html,/A&amp;B/);assert.match(html,/&lt;script&gt;bad/);
    assert.equal((html.match(/data-action="export-admin-report"/g)||[]).length,2);
});
