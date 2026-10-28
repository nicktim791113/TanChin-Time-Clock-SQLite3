const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { metricApplicant } = require('../dashboard-metrics');
const employees = new Map([['E1', { name: '對象' }], ['A1', { name: '代辦主管' }]]);

test('metric applicant uses the recorded applicant for self and proxy, without inferring missing history', () => {
    assert.deepEqual(metricApplicant({ employee_id: 'E1', applicant_id: 'E1' }, employees), { applicantId: 'E1', applicantName: '對象' });
    assert.deepEqual(metricApplicant({ employee_id: 'E1', applicant_id: 'A1' }, employees), { applicantId: 'A1', applicantName: '代辦主管' });
    assert.deepEqual(metricApplicant({ employee_id: 'E1' }, employees), { applicantId: '', applicantName: '' });
    assert.deepEqual(metricApplicant({ employee_id: 'E1', applicant_id: 'deleted' }, employees), { applicantId: 'deleted', applicantName: '' });
});
function renderer() {
    const context = vm.createContext({ URLSearchParams, state: {}, ui: {}, auditActionLabels: {}, auditTargetTypeLabels: {}, document: { getElementById() {} },
        escapeHtml: (v) => String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
        renderInsightTable: (headers, rows) => '<table><thead>' + headers.map(h => '<th>' + h + '</th>').join('') + '</thead><tbody>' + rows.join('') + '</tbody></table>',
        renderLeaveDaysSummary: () => '', renderAdminEmployeeInsight() {}, renderAdminTodayNormalInsight() {}, renderAdminAbnormalInsight() {}, getAdminInsightTitle() {}, renderAdminDashboardInsightContent() {},
        handleDashboardClick() {}, renderEmployeeDashboard() {}, renderDashboard() {}, handleRealtimeSyncMessage() {}, handleLogout() {} });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../browser-client/dashboard-metrics.js'), 'utf8'), context);
    return context;
}
for (const key of ['leavePendingSupervisor', 'leavePendingAdmin', 'overtimePendingSupervisor']) test(key + ' shows a separate applicant column and preserves unknown applicants', () => {
    const context = renderer();
    context.key = key;
    context.dashboard = { dashboardMetrics: { catalog: [{ key, available: true, label: '待審核' }], groups: [] } };
    context.records = [
        { employeeId: 'E1', employeeName: '對象', ...metricApplicant({ applicant_id: 'E1' }, employees) },
        { employeeId: 'E1', employeeName: '對象', ...metricApplicant({ applicant_id: 'A1' }, employees) },
        { employeeId: 'E1', employeeName: '對象', ...metricApplicant({}, employees) },
        { employeeId: 'E1', employeeName: '對象', applicantId: '<evil>', applicantName: '<script>' }
    ];
    vm.runInContext("dmState.detail = { metric:{key},kind:key.startsWith('leave')?'leave':'overtime',records,summary:{},filters:{},page:1,totalPages:1,totalRecords:4,unfilteredRecords:4 }", context);
    const html = vm.runInContext('renderAdminDashboardInsightContent(key,dashboard)', context);
    assert.match(html, /<th>人員<\/th><th>申請人<\/th>/);
    assert.match(html, /<td><strong>對象<\/strong><small class="dm-cell-secondary">E1<\/small><\/td><td><strong>代辦主管<\/strong><small class="dm-cell-secondary">A1<\/small>/);
    assert.match(html, /<td><span class="dm-cell-secondary">未記錄<\/span><\/td>/);
    assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<evil>'));
});

test('detail endpoint overrides formatter employee fallback with recorded applicant identity for both request kinds', () => {
    const { attachDashboardMetricRoutes } = require('../dashboard-metrics');
    const routes = {};
    const source = [
        { id: 'self', employee_id: 'E1', applicant_id: 'E1' },
        { id: 'proxy', employee_id: 'E1', applicant_id: 'A1' },
        { id: 'legacy', employee_id: 'E1' }
    ];
    let status = 'pending_supervisor';
    const rows = () => source.map(r => ({ ...r, status, duration_hours: 1 }));
    attachDashboardMetricRoutes({ post() {}, get(route, ...handlers) { routes[route] = handlers.at(-1); } }, {
        db: { queryLeaveRequests: rows, queryOvertimeRequests: rows, loadEmployees: () => [...employees].map(([id, value]) => ({ id, ...value })) },
        requireSession() {}, requireAdmin() {}, can: (_session, p) => ['admin.leave.review', 'admin.overtime.view'].includes(p),
        formatRecord: (_kind, r) => ({ employeeId: r.employee_id, applicantId: r.applicant_id || r.employee_id, applicantName: 'unsafe fallback' })
    });
    for (const key of ['leavePendingSupervisor', 'leavePendingAdmin', 'overtimePendingSupervisor']) {
        status = key === 'leavePendingAdmin' ? 'pending_admin' : 'pending_supervisor';
        let response;
        routes['/api/browser/admin/dashboard-metrics/detail']({ query: { key }, browserSession: {} }, {
            json(value) { response = value; }, status(code) { assert.fail('unexpected HTTP ' + code); }
        });
        assert.equal(response.success, true);
        assert.deepEqual(response.detail.records.map(r => [r.employeeId, r.applicantId, r.applicantName]), [
            ['E1', 'E1', '對象'], ['E1', 'A1', '代辦主管'], ['E1', '', '']
        ]);
    }
});
