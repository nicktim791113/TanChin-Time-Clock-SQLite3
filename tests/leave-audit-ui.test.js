const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function loadUi() {
    const initial = { filters: { month: '2026-10', employeeId: '', department: '', alertType: '' }, records: [], totalCount: 0,
        employees: [{ id: 'E001', name: '<Employee>', department: 'Test' }], departments: ['Test'], alertTypes: [{ id: 'leave_boundary_tolerance', label: '容許時間範圍' }] };
    const state = { token: 'admin-session', dashboard: { role: 'admin', user: { id: 'A001' }, datasets: { leave: { audit: initial, alerts: [] } } } };
    const requests = [], pending = [], downloads = [];
    const context = vm.createContext({ state, URLSearchParams, FormData, ui: { dashboardMessage: {} },
        document: { getElementById() { return null; } },
        escapeHtml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); },
        renderLeaveAuditAlertRows: () => '<table>rows</table>', renderDashboard(dashboard) { state.dashboard = dashboard; }, postRenderSetup() {},
        handleDashboardSubmit() {}, handleDashboardClick() {}, setMessage() {}, downloadTextFile(...args) { downloads.push(args); },
        requestJson(route, options) { requests.push({ route, options }); return new Promise((resolve, reject) => pending.push({ resolve, reject })); } });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../browser-client/leave-audit.js'), 'utf8'), context);
    const run = (source) => vm.runInContext(source, context);
    run('renderDashboard(state.dashboard)');
    return { state, context, run, requests, pending, downloads, initial };
}

test('audit queries retain applied filters for exports and ignore responses from a previous session', async () => {
    const ui = loadUi();
    assert.match(ui.run('renderLeaveAuditAlertRows()'), /&lt;Employee&gt;/);
    const query = ui.run("queryLeaveAudit({month:'2026-09',employeeId:'E001',department:'Test',alertType:'leave_boundary_tolerance'})");
    assert.match(ui.requests[0].route, /month=2026-09/);
    const filtered = { ...ui.initial, filters: { month: '2026-09', employeeId: 'E001', department: 'Test', alertType: 'leave_boundary_tolerance' },
        records: [{ id: 'old-warning' }], totalCount: 1 };
    ui.pending.shift().resolve({ data: filtered });
    await query;
    const click = ui.run("handleDashboardClick({target:{closest(){return {dataset:{action:'export-leave-audit-alerts'}}}},preventDefault(){}})");
    assert.deepEqual(ui.requests[1].options.body, filtered.filters);
    ui.pending.shift().resolve({ data: { fileName: 'test.csv', csvContent: 'filtered' }, message: 'done' });
    await click;
    assert.deepEqual(ui.downloads, [['test.csv', 'filtered']]);

    const stale = ui.run("queryLeaveAudit({month:'2026-08'})");
    ui.run("state.token='employee-session';renderDashboard({role:'employee',user:{id:'E002'}})");
    ui.pending.shift().resolve({ data: filtered });
    await stale;
    assert.equal(ui.run('leaveAuditView.data'), null);
    assert.equal(ui.state.dashboard.role, 'employee');
});
