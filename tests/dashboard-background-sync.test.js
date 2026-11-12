const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture() {
    const source = fs.readFileSync(require.resolve('../browser-client/app.js'), 'utf8');
    const dashboard = { role: 'admin', user: { id: 'A1' }, permissions: { admin: ['admin.overtime.view'] } };
    const editedForm = { isConnected: true };
    const notices = new Map();
    const context = vm.createContext({
        state: { token: 'session', dashboard },
        document: { activeElement: null, getElementById: id => notices.get(id), querySelector: () => null,
            createElement: () => ({ setAttribute() {} }) },
        ui: { dashboardContent: { contains: node => node === editedForm && node.isConnected, querySelector: () => null,
            before: notice => notices.set(notice.id, notice) } },
        console, setTimeout, ensureAdminReportState: () => ({ queried: false }),
        getScopedAttendanceSummary: () => ({ normalEmployees: [], abnormalRecords: [], failureLogs: [] }),
        renderDashboard: next => { context.state.dashboard = next; },
        editedForm
    });
    vm.runInContext(source.slice(source.indexOf('const dashboardSyncEdits ='), source.indexOf('async function pickAutomationExportDirectory')), context);
    return { context, dashboard, notices, run: code => vm.runInContext(code, context) };
}

test('background sync preserves a connected edited form, but permission changes apply immediately', async () => {
    const { context, dashboard, notices, run } = fixture();
    const refreshed = { ...dashboard, summary: { todayPunchCount: 1 } };
    context.fetchDashboard = async () => refreshed;
    run('dashboardSyncEdits.add(editedForm)');
    await run("reloadDashboard('', 'info', { background: true })");
    assert.equal(context.state.dashboard, dashboard);
    assert.match(notices.get('dashboard-sync-notice').textContent, /已保留目前輸入/);

    const revoked = { ...refreshed, permissions: { admin: [] } };
    context.fetchDashboard = async () => revoked;
    await run("reloadDashboard('', 'info', { background: true })");
    assert.equal(context.state.dashboard, revoked);
});

test('an in-flight dashboard from another session cannot apply after the workspace changes', async () => {
    const { context, dashboard, run } = fixture();
    let resolveFetch;
    context.fetchDashboard = () => new Promise(resolve => { resolveFetch = resolve; });
    const reload = run("reloadDashboard('', 'info', { background: true })");
    const newDashboard = { role: 'admin', user: { id: 'A2' } };
    context.state.token = 'new-session';
    context.state.dashboard = newDashboard;
    resolveFetch(dashboard);
    await reload;
    assert.equal(context.state.dashboard, newDashboard);
});

test('a draft first edited while the background request is in flight is preserved', async () => {
    const { context, dashboard, notices, run } = fixture();
    let resolveFetch;
    context.fetchDashboard = () => new Promise(resolve => { resolveFetch = resolve; });
    const reload = run("reloadDashboard('', 'info', { background: true })");
    run('dashboardSyncEdits.add(editedForm)');
    resolveFetch({ ...dashboard });
    await reload;
    assert.equal(context.state.dashboard, dashboard);
    assert.ok(notices.has('dashboard-sync-notice'));
});
