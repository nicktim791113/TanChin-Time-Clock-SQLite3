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
    const names=['createDefaultAdminReportState','ensureAdminReportState','renderStatsGrid','renderOptions','renderEmptyState','renderBadge','renderAdminReportRows','renderAdminReportSection','ensureWorkspaceSubnavState','flattenWorkspaceSubnavGroups','getWorkspaceSubnavItemPanelHtml','warnMissingWorkspaceSubnavPanel','compactWorkspaceSummaryCard','parseWorkspaceSubnavPanels','prepareWorkspaceSubnavGroups','getActiveWorkspaceSubnavItem','renderWorkspaceSubnav','renderWorkspaceSubnavSection','handleDashboardSubmit'];
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
        assert.match(html,/workspace-single-page-layout/);assert.doesNotMatch(html,/<aside|switch-workspace-subsection/);
        assert.equal((html.match(/data-action="export-admin-report"/g)||[]).length,2);
        assert.match(html,/data-template="payroll_leave_overtime"/);
    }
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
