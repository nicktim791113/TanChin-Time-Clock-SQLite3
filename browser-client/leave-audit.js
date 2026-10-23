// Month-scoped attendance audit. The server calculates the full month before
// applying filters, so older or more than 200 warnings remain queryable.
const leaveAuditView = { identity: '', dashboard: null, data: null, filters: null, loading: false, sequence: 0, refresh: false };
const leaveAuditTodayMonth = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 7);
function leaveAuditFilters() {
    return leaveAuditView.filters || { month: leaveAuditTodayMonth(), employeeId: '', department: '', alertType: '' };
}
function leaveAuditOptions(rows, selected, value = 'id', label = 'label') {
    return rows.map((row) => `<option value="${escapeHtml(row[value] || '')}" ${row[value] === selected ? 'selected' : ''}>${escapeHtml(row[label] || '')}</option>`).join('');
}
const previousLeaveAuditRows = renderLeaveAuditAlertRows;
renderLeaveAuditAlertRows = function renderMonthlyLeaveAuditRows(fallback = []) {
    const data = leaveAuditView.data || state.dashboard?.datasets?.leave?.audit;
    const filters = leaveAuditFilters();
    const employees = (data?.employees || []).map((row) => ({ id: row.id, label: `${row.id} ${row.name || ''}` }));
    const departments = (data?.departments || []).map((value) => ({ id: value, label: value }));
    return `<section id="leave-audit-view" aria-label="按月份查核請假出勤">
        <form id="leave-audit-filter-form" class="dense-form">
            <div class="field-grid four">
                <label class="field"><span>查核月份</span><input type="month" name="month" min="2000-01" max="2100-12" value="${escapeHtml(filters.month)}" required></label>
                <label class="field"><span>部門</span><select name="department"><option value="">全部部門</option>${leaveAuditOptions(departments, filters.department)}</select></label>
                <label class="field"><span>員工</span><select name="employeeId"><option value="">全部員工</option>${leaveAuditOptions(employees, filters.employeeId)}</select></label>
                <label class="field"><span>警示類型</span><select name="alertType"><option value="">全部警示</option>${leaveAuditOptions(data?.alertTypes || [], filters.alertType)}</select></label>
            </div>
            <div class="form-toolbar dense-toolbar"><button class="primary-btn" type="submit" ${leaveAuditView.loading ? 'disabled' : ''}>${leaveAuditView.loading ? '查詢中…' : '查詢'}</button><button class="outline-btn" type="button" data-action="leave-audit-reset" ${leaveAuditView.loading ? 'disabled' : ''}>回到本月</button></div>
        </form>
        <p class="helper-text" role="status">${escapeHtml(data?.filters?.month || filters.month)} · 共 ${data?.totalCount ?? fallback.length} 筆。打卡警示依打卡月份歸屬；無打卡警示依請假日期歸屬。匯出會使用已查詢的篩選條件。</p>
        ${previousLeaveAuditRows(data?.records || fallback)}
    </section>`;
};
async function queryLeaveAudit(filters) {
    const identity = leaveAuditView.identity, token = state.token, sequence = ++leaveAuditView.sequence;
    leaveAuditView.loading = true;
    try {
        const query = new URLSearchParams(filters);
        const result = await requestJson(`/api/browser/admin/leave-audit?${query}`, { auth: true });
        if (identity !== leaveAuditView.identity || token !== state.token || sequence !== leaveAuditView.sequence) return;
        leaveAuditView.data = result.data;
        leaveAuditView.filters = result.data.filters;
        if (state.dashboard?.datasets?.leave) {
            state.dashboard.datasets.leave.audit = result.data;
            state.dashboard.datasets.leave.alerts = result.data.records;
        }
        leaveAuditView.loading = false;
        renderDashboard(state.dashboard);
    } finally {
        if (sequence === leaveAuditView.sequence) leaveAuditView.loading = false;
    }
}
const previousLeaveAuditDashboard = renderDashboard;
renderDashboard = function renderDashboardWithLeaveAudit(dashboard) {
    const identity = `${state.token}/${dashboard.role}/${dashboard.user?.id || ''}`;
    const initial = dashboard.datasets?.leave?.audit || null;
    if (identity !== leaveAuditView.identity) {
        Object.assign(leaveAuditView, { identity, data: initial, filters: initial?.filters || null, loading: false, refresh: false, sequence: leaveAuditView.sequence + 1 });
    } else if (dashboard !== leaveAuditView.dashboard && initial) {
        if (JSON.stringify(leaveAuditFilters()) === JSON.stringify(initial.filters)) leaveAuditView.data = initial;
        else leaveAuditView.refresh = true;
    }
    leaveAuditView.dashboard = dashboard;
    return previousLeaveAuditDashboard(dashboard);
};
const previousLeaveAuditPostRender = postRenderSetup;
postRenderSetup = function postRenderWithLeaveAudit() {
    previousLeaveAuditPostRender();
    if (document.getElementById('leave-audit-view') && leaveAuditView.refresh && !leaveAuditView.loading) {
        leaveAuditView.refresh = false;
        queryLeaveAudit(leaveAuditFilters()).catch((error) => setMessage(ui.dashboardMessage, error.message, 'error'));
    }
};
const previousLeaveAuditSubmit = handleDashboardSubmit;
handleDashboardSubmit = async function handleLeaveAuditSubmit(event) {
    const form = event.target.closest?.('#leave-audit-filter-form');
    if (!form) return previousLeaveAuditSubmit(event);
    event.preventDefault();
    if (leaveAuditView.loading) return;
    try { await queryLeaveAudit(Object.fromEntries(new FormData(form))); }
    catch (error) { setMessage(ui.dashboardMessage, error.message, 'error'); }
};
const previousLeaveAuditClick = handleDashboardClick;
handleDashboardClick = async function handleLeaveAuditClick(event) {
    const action = event.target.closest?.('[data-action]')?.dataset.action;
    if (!['leave-audit-reset', 'export-leave-audit-alerts'].includes(action)) return previousLeaveAuditClick(event);
    event.preventDefault();
    if (leaveAuditView.loading) return;
    try {
        if (action === 'leave-audit-reset') return await queryLeaveAudit({ month: leaveAuditTodayMonth(), employeeId: '', department: '', alertType: '' });
        const identity = leaveAuditView.identity, token = state.token;
        const result = await requestJson('/api/browser/admin/leave-audit/export', { method: 'POST', auth: true, body: leaveAuditFilters() });
        if (identity !== leaveAuditView.identity || token !== state.token) return;
        downloadTextFile(result.data.fileName, result.data.csvContent);
        setMessage(ui.dashboardMessage, result.message, 'success');
    } catch (error) { setMessage(ui.dashboardMessage, error.message, 'error'); }
};
