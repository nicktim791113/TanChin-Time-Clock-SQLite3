const requestCalendars = { identity: '', dashboard: null, leave: null, overtime: null, review: {}, reviewKind: 'leave' };
const requestCalendarLabels = { leave: '請假', overtime: '加班' };
const requestCalendarStatuses = { pending_supervisor: '待主管審核', pending_admin: '待管理部終審', approved: '已核准', rejected: '已駁回', withdrawn: '已撤回', cancelled: '已作廢' };
const rcEscape = (value) => escapeHtml(String(value ?? ''));
function rcToday() { return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10); }
function rcAdmin() { return state.dashboard?.role === 'admin'; }
function rcReviewer() { return state.dashboard?.role === 'employee' && state.employeeWorkspacePanel === 'supervisor-review'; }
function rcState(kind) {
    const states = rcReviewer() ? requestCalendars.review : requestCalendars;
    return states[kind] ||= { month: rcToday().slice(0, 7), date: rcToday(), view: 'calendar', scope: rcReviewer() ? 'review' : 'mine', filters: {}, page: 1, data: null, loading: false, sequence: 0, error: '', pending: false, cache: new Map() };
}
function rcAllStates() {
    return ['leave', 'overtime'].flatMap((kind) => [requestCalendars[kind], requestCalendars.review[kind]].filter(Boolean).map((current) => [kind, current]));
}
function rcHistoryWindow(kind) {
    return rcAdmin() || rcState(kind).scope !== 'mine' ? null : state.dashboard?.[kind]?.historyWindow;
}
function rcMinMonth(kind) { return rcHistoryWindow(kind)?.earliestMonth || '2000-01'; }
function rcResetHistory(kind) {
    const current = rcState(kind), minimum = rcMinMonth(kind);
    if (current.month < minimum) { current.month = minimum; current.date = `${minimum}-01`; current.page = 1; }
}
function rcButton(kind, action, label, attributes = '') {
    return `<button type="button" class="outline-btn" data-action="rc-${action}" data-kind="${kind}" ${attributes}>${label}</button>`;
}
function rcOptions(items, selected, allLabel) {
    if (selected && !items.some(([value]) => value === selected)) items = [...items, [selected, selected]];
    return `<option value="">${allLabel}</option>${items.map(([value, label]) => `<option value="${rcEscape(value)}" ${selected === value ? 'selected' : ''}>${rcEscape(label)}</option>`).join('')}`;
}
function rcSelect(kind, field, label, items, selected, allLabel) {
    return `<label class="field"><span>${label}</span><select data-rc-filter="${field}" data-kind="${kind}">${rcOptions(items, selected, allLabel)}</select></label>`;
}
function rcSortedEmployees(employees = []) {
    return [...employees].sort((a, b) => String(a.id).localeCompare(String(b.id), 'en', { numeric: true, sensitivity: 'base' }) || String(a.id).localeCompare(String(b.id), 'en'));
}
function rcEmployeeMatches(employees, query) {
    const key = String(query || '').trim().toLocaleLowerCase();
    return [...key].length < 2 ? [] : rcSortedEmployees(employees).filter((row) => String(row.id).toLocaleLowerCase().includes(key));
}
function rcEmployeeSearch(kind, current, employees) {
    const matches = rcEmployeeMatches(employees, current.employeeQuery);
    return `<label class="field rc-employee-search"><span>工號</span><input type="search" data-rc-employee-query data-kind="${kind}" value="${rcEscape(current.employeeQuery || '')}" placeholder="輸入至少 2 字元工號" aria-label="${requestCalendarLabels[kind]}工號" aria-controls="rc-${kind}-employee-matches" autocomplete="off"><select id="rc-${kind}-employee-matches" data-rc-employee-match data-kind="${kind}" aria-label="${requestCalendarLabels[kind]}工號符合名單" size="4" ${current.employeeSearchOpen && matches.length ? '' : 'hidden'}><option value="" disabled selected>請選擇員工</option>${matches.map((row) => `<option value="${rcEscape(row.id)}">${rcEscape(row.id)} ${rcEscape(row.name)}</option>`).join('')}</select><small data-rc-employee-hint>${[...String(current.employeeQuery || '').trim()].length < 2 ? '至少輸入 2 字元才顯示名單' : matches.length ? `${matches.length} 位符合` : '沒有符合工號'}</small></label>`;
}
function rcForgetEmployeeNames(kind, current) {
    current.sequence += 1; current.loading = false;
    current.employeeSearchOpen = false;
    current.employees = [];
    if (current.data) current.data = { ...current.data, employees: [] };
    const root = document.getElementById(`rc-${kind}`);
    const select = root?.querySelector('[data-rc-filter="employeeId"]');
    if (select) select.innerHTML = rcOptions(current.filters.employeeId ? [[current.filters.employeeId, current.filters.employeeId]] : [], current.filters.employeeId, '全部員工');
    const matches = root?.querySelector('[data-rc-employee-match]');
    if (matches) { matches.innerHTML = ''; matches.hidden = true; }
    const hint = root?.querySelector('[data-rc-employee-hint]');
    if (hint) hint.textContent = '員工資料已更新，重新整理後可搜尋';
}
function rcActions(kind, row) {
    const actions = row.calendarActions || {};
    const attrs = `data-id="${rcEscape(row.id)}"`;
    const decision = (value, label) => `<button type="button" class="mini-btn" data-action="${kind}-${actions.review}-decision" ${attrs} data-decision="${value}">${label}</button>`;
    if (actions.review) return `<div class="review-action-stack"><label class="field"><span>審核備註</span><input class="review-comment-input" type="text" data-${kind}-review-comment></label><div class="table-actions">${decision('approved', actions.review === 'admin' ? '終審核准' : '核准')}${decision('rejected', '駁回')}</div></div>`;
    if (actions.withdraw) return `<button type="button" class="mini-btn" data-action="${kind}-withdraw" ${attrs}>撤回</button>`;
    if (rcAdmin() && hasCurrentAdminPermission(`admin.${kind}.paperCreate`) && row.status === 'approved' && row.approval_mode === 'admin_paper_approved') {
        return `<div class="table-actions"><button type="button" class="mini-btn" data-action="paper-${kind}-correct" ${attrs}>修正</button><button type="button" class="mini-btn danger-text" data-action="paper-${kind}-cancel" ${attrs}>作廢</button></div>`;
    }
    return '';
}
function rcEntries(kind, detail) {
    if (!detail?.records.length) return '<p class="rc-empty">沒有符合條件的紀錄。</p>';
    return `<div class="rc-entries">${detail.records.map((row) => `<article class="rc-entry" data-no-collapsible="true" data-request-entry="${rcEscape(row.id)}">
        <div class="rc-entry-heading"><h4>${rcEscape(row.employeeId)} ${rcEscape(row.employeeName)}${kind === 'leave' ? ` · ${rcEscape(row.leaveTypeName)}` : ''}</h4><span class="rc-status rc-status-${rcEscape(row.status)}">${rcEscape(row.statusText)}</span></div>
        <dl class="rc-entry-meta"><div><dt>開始</dt><dd>${rcEscape(row.startText)}</dd></div><div><dt>結束</dt><dd>${rcEscape(row.endText)}</dd></div><div><dt>整筆時數</dt><dd>${rcEscape(row.duration_hours)} 小時</dd></div><div><dt>流程</dt><dd>${rcEscape(row.approvalModeText)}</dd></div>
        ${kind === 'overtime' ? `<div><dt>申請人</dt><dd>${rcEscape(row.applicantId)} ${rcEscape(row.applicantName)}</dd></div>` : ''}<div><dt>部門</dt><dd>${rcEscape(row.employeeDepartment || '-')}</dd></div></dl>
        <p class="rc-reason">${rcEscape(row.reason || '未填原因')}</p>
        ${kind === 'leave' ? renderLeaveDaysSummary(row) : ''}
        ${typeof renderRequestReviewProgress === 'function' ? renderRequestReviewProgress(row) : ''}
        ${row.approval_mode === 'admin_paper_approved' ? `<details class="rc-paper"><summary>紙本核准資料</summary><p>單號：${rcEscape(row.paperNo || '-')} · 核准者：${rcEscape(row.paperApprovedBy || '-')}</p><p>${rcEscape(row.paperComment || '')}</p></details>` : ''}
        <div class="rc-entry-actions">${rcActions(kind, row)}</div>
    </article>`).join('')}</div>`;
}
function rcReviewQueue(kind) {
    if (rcAdmin() || rcState(kind).scope !== 'review') return '';
    const rows = state.dashboard?.[kind]?.supervisorQueue || [];
    if (!rows.length) return '';
    const table = kind === 'leave' ? renderEmployeeLeaveRequestRows(rows, { showEmployee: true, reviewMode: 'supervisor' }) : renderOvertimeRequestRows(rows, { showEmployee: true, showApplicant: true, reviewMode: 'supervisor' });
    return `<section class="rc-detail rc-global-review" aria-label="跨月份待我審核"><div class="rc-toolbar"><h3>跨月份待我審核 <small>最近 ${rows.length} 筆</small></h3></div>${table}</section>`;
}
function rcGrid(kind, current) {
    const [year, month] = current.month.split('-').map(Number);
    const data = current.data || { today: rcToday(), days: Array.from({ length: new Date(Date.UTC(year, month, 0)).getUTCDate() }, (_, i) => ({ date: `${current.month}-${String(i + 1).padStart(2, '0')}`, loading: true })) };
    const offset = new Date(`${current.month}-01T00:00:00Z`).getUTCDay();
    return `<div class="meal-calendar rc-calendar" role="group" aria-label="${current.month} ${requestCalendarLabels[kind]}日曆">
        ${['日', '一', '二', '三', '四', '五', '六'].map((day) => `<div class="meal-weekday">${day}</div>`).join('')}
        ${Array.from({ length: offset }, () => '<div aria-hidden="true"></div>').join('')}
        ${data.days.map((day) => `<button type="button" data-action="rc-date" data-kind="${kind}" data-date="${day.date}" aria-label="${day.date} ${day.loading ? '讀取中' : `已核准 ${day.approvedPeople} 人 ${day.approvedCount} 筆，待審 ${day.pendingCount} 筆，其他 ${day.otherCount} 筆`}" aria-pressed="${current.date === day.date}" class="meal-date rc-date ${day.totalCount ? 'has-records' : 'is-off'} ${current.date === day.date ? 'is-selected' : ''}">
            <span class="meal-date-number">${Number(day.date.slice(-2))}${day.date === data.today ? '<small>今天</small>' : ''}</span>
            ${day.approvedCount ? `<span class="rc-approved">核准${day.approvedPeople}人<small>${day.approvedCount}筆</small></span>` : ''}
            ${day.pendingCount ? `<span class="rc-pending">待審${day.pendingCount}筆</span>` : ''}
            ${day.otherCount ? `<span class="rc-other">其他${day.otherCount}筆</span>` : ''}
            ${!day.totalCount && !day.loading ? '<span class="rc-other">無紀錄</span>' : ''}
        </button>`).join('')}</div>`;
}
function rcRender(kind, advancedHtml = '') {
    const current = rcState(kind), data = current.data, label = requestCalendarLabels[kind];
    const policy = rcHistoryWindow(kind), minimum = rcMinMonth(kind);
    if (current.view === 'advanced' && rcAdmin()) return `<section id="rc-${kind}" class="rc-workspace" data-kind="${kind}"><div class="rc-toolbar"><h3>${label}進階查詢</h3>${rcButton(kind, 'view', '返回日曆', 'data-view="calendar"')}</div>${advancedHtml}</section>`;
    const statuses = Object.entries(requestCalendarStatuses).filter(([id]) => kind === 'leave' || id !== 'pending_admin');
    const detail = data?.detail;
    const availableEmployees = data?.employees || current.employees || [];
    const selectedEmployee = current.filters.employeeId;
    const employees = rcSortedEmployees(selectedEmployee && !availableEmployees.some((row) => row.id === selectedEmployee)
        ? [...availableEmployees, current.employees?.find((row) => row.id === selectedEmployee) || { id: selectedEmployee, name: '' }] : availableEmployees);
    return `<section id="rc-${kind}" class="rc-workspace ${rcAdmin() ? 'rc-admin-workspace' : ''}" data-kind="${kind}" aria-label="${label}紀錄" aria-busy="${current.loading}">
        <div class="rc-toolbar"><h3>${current.scope === 'review' && !rcAdmin() ? '待審' + label : (rcAdmin() ? '' : '我的') + label + '紀錄'}</h3><div class="meal-month-controls">
            ${rcButton(kind, 'month', '←', `data-offset="-1" aria-label="上個月" title="上個月" ${current.month <= minimum ? 'disabled' : ''}`)}
            <input type="month" data-rc-month data-kind="${kind}" aria-label="${label}月份" min="${minimum}" max="2100-12" value="${current.month}">
            ${rcButton(kind, 'month', '→', `data-offset="1" aria-label="下個月" title="下個月" ${current.month === '2100-12' ? 'disabled' : ''}`)}
            ${rcButton(kind, 'today', '本月')}${rcButton(kind, 'refresh', '↻', 'aria-label="重新整理" title="重新整理"')}
        </div></div>
        <div class="rc-view-toolbar"><div class="rc-views" role="group" aria-label="紀錄呈現方式">${['calendar', 'list'].map((view) => `<button type="button" data-action="rc-view" data-kind="${kind}" data-view="${view}" aria-pressed="${current.view === view}">${view === 'calendar' ? '日曆' : '列表'}</button>`).join('')}</div>
        ${rcAdmin() ? rcButton(kind, 'view', '進階查詢／匯出', 'data-view="advanced"') : ''}</div>
        <div class="rc-filters">
            ${rcAdmin() ? rcEmployeeSearch(kind, current, employees) : ''}
            ${rcAdmin() || kind === 'overtime' || current.scope === 'review' ? rcSelect(kind, 'employeeId', '員工', employees.map((e) => [e.id, `${e.id} ${e.name}`]), current.filters.employeeId, '全部員工') : ''}
            ${rcAdmin() ? rcSelect(kind, 'department', '部門', (data?.departments || []).map((d) => [d, d]), current.filters.department, '全部部門') : ''}
            ${current.scope !== 'review' || rcAdmin() ? rcSelect(kind, 'status', '狀態', statuses, current.filters.status, '全部狀態') : ''}
            ${kind === 'leave' ? rcSelect(kind, 'leaveTypeId', '假別', (data?.leaveTypes || []).map((t) => [t.id, t.name]), current.filters.leaveTypeId, '全部假別') : ''}
            ${rcButton(kind, 'clear', '清除篩選')}
        </div>
        ${policy?.earliestMonth ? `<p class="helper-text">本人${label}紀錄可查看 ${rcEscape(policy.earliestMonth)} 起的月份；較早紀錄請洽有查詢權限的管理者。</p>` : ''}
        <div class="inline-message rc-message" aria-live="polite">${rcEscape(current.error || (current.pending ? '資料有異動，請重新整理確認最新紀錄。' : current.loading ? '讀取紀錄中…' : ''))}</div>
        <div class="rc-summary">${data ? `${current.month} · ${data.totalCount} 筆申請<span class="rc-status-approved">已核准</span><span class="rc-status-pending_supervisor">待審核</span><span class="rc-other">其他：駁回／撤回／作廢</span>` : '&nbsp;'}</div>
        ${current.view === 'calendar' ? rcGrid(kind, current) : ''}
        ${!data ? `<div class="rc-detail rc-loading-detail" role="status">${current.error ? '未載入紀錄，請重新整理。' : '讀取明細中…'}</div>` : `
            <section class="rc-detail" aria-label="${current.view === 'calendar' ? current.date + ' 明細' : '月內紀錄'}"><div class="rc-toolbar"><h3>${current.view === 'calendar' ? current.date : current.month + ' 月內紀錄'} <small>${detail.totalCount} 筆</small></h3>
                ${current.view === 'calendar' && ((!rcAdmin() && current.scope === 'mine') || (rcAdmin() && hasCurrentAdminPermission(`admin.${kind}.paperCreate`))) ? rcButton(kind, 'create', rcAdmin() ? '紙本補登' : `申請${label}`) : ''}
            </div>${rcEntries(kind, detail)}
            <div class="rc-pagination">${rcButton(kind, 'page', '←', `data-page="${detail.page - 1}" aria-label="上一頁" title="上一頁" ${detail.page <= 1 ? 'disabled' : ''}`)}<span>第 ${detail.page}／${detail.totalPages} 頁${rcAdmin() && kind === 'overtime' && current.view === 'list' && detail.pageSize ? ` · 每頁 ${detail.pageSize} 筆` : ''}</span>${rcButton(kind, 'page', '→', `data-page="${detail.page + 1}" aria-label="下一頁" title="下一頁" ${detail.page >= detail.totalPages ? 'disabled' : ''}`)}</div>
            </section>`}
        ${rcReviewQueue(kind)}
    </section>`;
}
function rcPaint(kind) {
    const root = document.getElementById(`rc-${kind}`);
    if (root && rcState(kind).view !== 'advanced') root.outerHTML = rcRender(kind);
}
async function rcLoad(kind) {
    rcResetHistory(kind);
    const current = rcState(kind), identity = requestCalendars.identity, token = state.token;
    const sequence = ++current.sequence;
    current.loading = true; current.error = ''; rcPaint(kind);
    const params = new URLSearchParams({ month: current.month, scope: current.scope, page: current.page, ...current.filters });
    if (current.view === 'calendar') params.set('date', current.date);
    try {
        const result = await requestJson(`/api/browser/${rcAdmin() ? 'admin' : 'employee'}/${kind}/calendar?${params}`, { auth: true });
        if (identity !== requestCalendars.identity || token !== state.token || sequence !== current.sequence) return;
        current.data = result.calendar; current.page = result.calendar.detail.page; current.pending = false;
        current.employees = result.calendar.employees || [];
        current.cache.clear(); result.calendar.detail.records.forEach((row) => current.cache.set(row.id, row));
    } catch (error) {
        if (identity !== requestCalendars.identity || token !== state.token || sequence !== current.sequence) return;
        current.data = null; current.employees = []; current.cache.clear(); current.error = error.message;
    } finally {
        if (identity === requestCalendars.identity && sequence === current.sequence) { current.loading = false; rcPaint(kind); }
    }
}
const rcPreviousDashboard = renderDashboard;
renderDashboard = function renderDashboardWithRequestCalendars(dashboard) {
    const identity = `${state.token}/${dashboard.role}/${dashboard.user?.id || ''}`;
    if (requestCalendars.identity !== identity) Object.assign(requestCalendars, { identity, leave: null, overtime: null, review: {}, reviewKind: 'leave' });
    else if (requestCalendars.dashboard !== dashboard) {
        for (const [, current] of rcAllStates()) {
            current.sequence += 1; current.data = null; current.employees = []; current.cache.clear(); current.loading = false;
        }
        for (const kind of ['leave', 'overtime']) rcResetHistory(kind);
    }
    requestCalendars.dashboard = dashboard;
    return rcPreviousDashboard(dashboard);
};
renderEmployeeLeaveRecordsPanel = () => rcRender('leave');
renderEmployeeOvertimeRecordsPanel = () => rcRender('overtime');
const rcPreviousEmployeeItems = renderEmployeeWorkspaceItems;
renderEmployeeWorkspaceItems = function renderEmployeeItemsWithCalendars(dashboard) {
    const items = rcPreviousEmployeeItems(dashboard).map((item) => ['leave-history', 'overtime-history'].includes(item.id) ? { ...item, meta: '日曆／列表' } : item);
    if (dashboard.supervisorReview?.canUse) items.push({ id: 'supervisor-review', label: '主管審核', meta: `${dashboard.supervisorReview.count} 筆待審`,
        html: `<section aria-label="主管審核"><h3>主管審核</h3><div class="meal-tabs" role="tablist" aria-label="審核項目">${['leave', 'overtime'].map((kind) => `<button type="button" role="tab" data-action="rc-review-kind" data-kind="${kind}" aria-selected="${requestCalendars.reviewKind === kind}">${requestCalendarLabels[kind]}</button>`).join('')}</div>${rcRender(requestCalendars.reviewKind)}</section>` });
    return items;
};
for (const kind of ['leave', 'overtime']) {
    const item = workspaceSubnavConfigs.admin[kind].groups.flatMap((group) => group.items).find((entry) => entry.id === 'records');
    item.calendarKind = kind;
}
const rcPreviousPanelHtml = getWorkspaceSubnavItemPanelHtml;
getWorkspaceSubnavItemPanelHtml = function getCalendarSubnavPanel(panels, item) {
    const original = rcPreviousPanelHtml(panels, item);
    return item.calendarKind ? rcRender(item.calendarKind, original) : original;
};
const rcPreviousPaperRequest = getAdminPaperRequest;
getAdminPaperRequest = function getCalendarPaperRequest(kind, id) {
    return rcState(kind).cache.get(id) || rcPreviousPaperRequest(kind, id);
};
const rcPreviousPostRender = postRenderSetup;
postRenderSetup = function postRenderWithRequestCalendars() {
    rcPreviousPostRender();
    for (const kind of ['leave', 'overtime']) {
        const current = rcState(kind);
        if (document.getElementById(`rc-${kind}`) && current.view !== 'advanced' && !current.data && !current.loading && !current.error) rcLoad(kind);
    }
};
function rcConfirmDiscard(kind) {
    const root = document.getElementById(`rc-${kind}`);
    return ![...(root?.querySelectorAll('.review-comment-input') || [])].some((input) => input.value.trim()) || window.confirm('尚有未送出的審核備註，確定切換？');
}
const rcPreviousClick = handleDashboardClick;
handleDashboardClick = async function handleRequestCalendarClick(event) {
    const target = event.target.closest('[data-action]');
    if (!target?.dataset.action?.startsWith('rc-')) {
        if (rcReviewer() && target?.dataset.action?.includes('workspace') && !rcConfirmDiscard(requestCalendars.reviewKind)) { event.preventDefault(); return; }
        return rcPreviousClick(event);
    }
    event.preventDefault();
    if (target.dataset.action === 'rc-review-kind') {
        if (!rcReviewer() || !['leave', 'overtime'].includes(target.dataset.kind) || !rcConfirmDiscard(requestCalendars.reviewKind)) return;
        requestCalendars.reviewKind = target.dataset.kind; renderDashboard(state.dashboard); return;
    }
    const kind = target.dataset.kind, current = rcState(kind), action = target.dataset.action;
    if (!rcConfirmDiscard(kind)) return;
    if (action === 'rc-create') {
        if (rcAdmin()) {
            activateWorkspaceSubsection('admin', kind, 'paper'); renderDashboard(state.dashboard);
        } else { state.employeeWorkspacePanel = `${kind}-request`; renderDashboard(state.dashboard); }
        const form = document.getElementById(rcAdmin() ? `admin-paper-${kind}-form` : `employee-${kind}-form`);
        if (form) { form.elements.startDate.value = current.date; form.elements.endDate.value = current.date; if (kind === 'leave') syncLeaveDaysEditor(form, { reset: true }); form.elements.startDate.focus(); }
        return;
    }
    if (action === 'rc-view') {
        current.view = target.dataset.view; current.page = 1; current.data = null; current.error = ''; current.sequence += 1; current.loading = false;
        renderDashboard(state.dashboard); return;
    }
    if (action === 'rc-date') current.date = target.dataset.date;
    if (action === 'rc-month') {
        const date = new Date(`${current.month}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + Number(target.dataset.offset));
        const month = date.toISOString().slice(0, 7);
        if (month < rcMinMonth(kind) || month > '2100-12') return;
        current.month = month; current.date = `${current.month}-01`;
    }
    if (action === 'rc-today') { current.month = rcToday().slice(0, 7); current.date = rcToday(); }
    if (['rc-month', 'rc-today', 'rc-clear'].includes(action)) current.employeeSearchOpen = false;
    if (action === 'rc-clear') { current.filters = {}; current.employeeQuery = ''; }
    current.page = action === 'rc-page' ? Number(target.dataset.page) : 1;
    current.data = null; await rcLoad(kind);
};
function rcUpdateEmployeeSearch(target) {
    if (!target.matches('[data-rc-employee-query]') || !rcAdmin()) return;
    const current = rcState(target.dataset.kind), employees = current.data?.employees || current.employees || [];
    current.employeeQuery = target.value; current.employeeSearchOpen = true;
    const matches = rcEmployeeMatches(employees, target.value), field = target.closest('.rc-employee-search'), list = field.querySelector('[data-rc-employee-match]');
    list.innerHTML = '<option value="" disabled selected>請選擇員工</option>' + matches.map((row) => `<option value="${rcEscape(row.id)}">${rcEscape(row.id)} ${rcEscape(row.name)}</option>`).join('');
    list.hidden = !matches.length;
    field.querySelector('[data-rc-employee-hint]').textContent = [...target.value.trim()].length < 2 ? '至少輸入 2 字元才顯示名單' : matches.length ? `${matches.length} 位符合` : '沒有符合工號';
}
document.addEventListener('input', (event) => rcUpdateEmployeeSearch(event.target));
document.addEventListener('focusin', (event) => rcUpdateEmployeeSearch(event.target));
document.addEventListener('click', (event) => rcUpdateEmployeeSearch(event.target));
function rcCloseEmployeeSearch(kind, field = null) {
    rcState(kind).employeeSearchOpen = false;
    const list = (field || document.getElementById(`rc-${kind}`))?.querySelector('[data-rc-employee-match]');
    if (list) list.hidden = true;
}
document.addEventListener('keydown', (event) => {
    const field = event.target.closest('.rc-employee-search');
    if (!field || event.key !== 'Escape') return;
    const input = field.querySelector('[data-rc-employee-query]');
    event.preventDefault(); rcCloseEmployeeSearch(input.dataset.kind, field); input.focus();
    // Focusing back from the list can fire focusin; keep Escape closed.
    rcCloseEmployeeSearch(input.dataset.kind, field);
});
document.addEventListener('pointerdown', (event) => {
    for (const [kind, current] of rcAllStates()) {
        if (!current.employeeSearchOpen) continue;
        const field = document.getElementById(`rc-${kind}`)?.querySelector('.rc-employee-search');
        if (field && !field.contains(event.target)) rcCloseEmployeeSearch(kind, field);
    }
});
document.addEventListener('change', (event) => {
    const target = event.target;
    if (!target.matches('[data-rc-month], [data-rc-filter], [data-rc-employee-match]')) return;
    const kind = target.dataset.kind, current = rcState(kind);
    if (!rcConfirmDiscard(kind)) {
        target.value = target.hasAttribute('data-rc-month') ? current.month : target.hasAttribute('data-rc-employee-match')
            ? current.filters.employeeId || '' : current.filters[target.dataset.rcFilter] || '';
        return;
    }
    if (target.hasAttribute('data-rc-month')) {
        if (!/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(target.value) || target.value < rcMinMonth(kind)) { rcPaint(kind); return; }
        current.month = target.value; current.date = `${target.value}-01`;
        current.employeeSearchOpen = false;
    } else if (target.hasAttribute('data-rc-employee-match')) {
        if (!rcAdmin() || !rcEmployeeMatches(current.data?.employees || current.employees || [], current.employeeQuery).some((row) => row.id === target.value)) return;
        current.filters.employeeId = target.value; current.employeeQuery = target.value; current.employeeSearchOpen = false;
    } else if (target.dataset.rcFilter === 'scope') return;
    else if (target.dataset.rcFilter === 'employeeId') { current.filters.employeeId = target.value; current.employeeQuery = target.value; current.employeeSearchOpen = false; }
    else current.filters[target.dataset.rcFilter] = target.value;
    current.page = 1; current.data = null; rcLoad(kind);
});
const rcPreviousSync = handleRealtimeSyncMessage;
handleRealtimeSyncMessage = async function handleCalendarSync(payload) {
    if (['employees', 'leaveSettings'].includes(payload?.type)) {
        for (const [kind, current] of rcAllStates()) rcForgetEmployeeNames(kind, current);
    }
    if (payload?.type === 'requestHistorySettings' && ['employee', 'admin', 'system_admin'].includes(state.dashboard?.role)) {
        const form = document.querySelector?.('[data-request-history-settings]');
        if (payload.sessionToken === state.token && form?.dataset.historyBusy === 'true') return;
        if (form?.dataset.historyDirty === 'true') {
            setMessage(form.querySelector('[data-history-message]'), '紀錄可見範圍已由其他連線更新；未儲存內容已保留，請重新整理後再儲存。', 'info'); return;
        }
        const keepReview = ['leave', 'overtime'].some((kind) => rcState(kind).scope === 'review' && !rcConfirmDiscardQuietly(kind));
        if (keepReview) {
            const token = state.token, result = await requestJson('/api/browser/dashboard', { auth: true });
            if (token !== state.token) return;
            state.dashboard = result.dashboard; requestCalendars.dashboard = result.dashboard;
            for (const [kind, current] of rcAllStates()) {
                if (current.scope === 'review') continue;
                current.sequence += 1; current.data = null; current.employees = []; current.cache.clear(); current.loading = false;
                const minimum = state.dashboard?.[kind]?.historyWindow?.earliestMonth || '2000-01';
                if (current.month < minimum) { current.month = minimum; current.date = `${minimum}-01`; current.page = 1; }
                if (current === rcState(kind)) rcPaint(kind);
            }
            return;
        }
        for (const [kind, current] of rcAllStates()) {
            current.sequence += 1; current.data = null; current.employees = []; current.cache.clear(); current.loading = false;
            if (current === rcState(kind)) rcPaint(kind);
        }
        await reloadDashboard('已同步員工紀錄可見範圍。', 'info'); return;
    }
    if (['leaveRequests', 'overtimeRequests', 'employees', 'leaveSettings'].includes(payload?.type)) {
        for (const kind of ['leave', 'overtime']) {
            if (!document.getElementById(`rc-${kind}`) || rcState(kind).view === 'advanced') continue;
            if (payload.sessionToken === state.token) return;
            if (!rcConfirmDiscardQuietly(kind)) {
                rcState(kind).pending = true;
                const message = document.querySelector(`#rc-${kind} .rc-message`);
                if (message) message.textContent = '資料有異動，請先送出備註或重新整理確認。';
                return;
            }
            await reloadDashboard(); return;
        }
    }
    return rcPreviousSync(payload);
};
function rcConfirmDiscardQuietly(kind) {
    return ![...document.querySelectorAll(`#rc-${kind} .review-comment-input`)].some((input) => input.value.trim() || input === document.activeElement);
}
const rcPreviousLogout = handleLogout;
handleLogout = function logoutWithCalendarCleanup(...args) {
    Object.assign(requestCalendars, { identity: '', dashboard: null, leave: null, overtime: null, review: {}, reviewKind: 'leave' });
    return rcPreviousLogout(...args);
};
