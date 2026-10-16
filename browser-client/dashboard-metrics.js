const dmState = { identity: '', detail: null, sequence: 0, draft: null, busy: false, dirty: false };
auditActionLabels.dashboard_metric_preferences = '個人指標設定';
auditTargetTypeLabels.dashboard_preferences = '管理者指標列';
const dmEscape = (value) => escapeHtml(String(value ?? ''));
function renderDashboardMetricStrip(dashboard) {
    const data = dashboard.dashboardMetrics;
    if (!data) return '';
    const attendance = getScopedAttendanceSummary(dashboard);
    return `<section class="dm-strip" aria-label="管理者八張指標"><div class="dm-toolbar"><button type="button" class="ghost-btn dm-icon" data-action="dm-settings" aria-label="設定八張指標" title="設定八張指標">&#9881;&#65038;</button></div>
        <div class="dm-scroll"><div class="dm-cards">${data.cardKeys.map((key, index) => {
            const item = data.catalog.find((c) => c.key === key);
            if (!item) return `<div class="stat-card dm-card dm-empty" data-metric-slot="${index}"><p class="stat-label">未授權位置</p><p class="stat-value">-</p></div>`;
            const legacy = ['employeeCount', 'shiftCount', 'todayPunchCount', 'todayAbnormalPunchCount', 'bellScheduleCount', 'greetingCount', 'customThemeCount'].includes(key);
            const value = key === 'todayPunchCount' ? attendance.normalEmployees.length : key === 'todayAbnormalPunchCount' ? attendance.abnormalRecords.length + attendance.failureLogs.length : item.value;
            const subtitle = key === 'todayPunchCount' ? getAdminMonitorScopeLabel(dashboard).replace('監測', '統計') : item.subtitle;
            return `<button type="button" class="stat-card stat-card-button dm-card" data-metric-slot="${index}" data-metric-key="${dmEscape(key)}" ${legacy ? `data-insight-key="${dmEscape(key)}"` : `data-action="dm-insight" data-key="${dmEscape(key)}"`} ${item.available ? '' : 'disabled'}><p class="stat-label">${dmEscape(item.label)}</p><p class="stat-value">${dmEscape(value)}</p><p class="stat-subtext">${dmEscape(subtitle)}</p></button>`;
        }).join('')}</div></div></section>`;
}
renderAdminEmployeeInsight = function renderRosterOverview(dashboard = state.dashboard) {
    const people = dashboard.dashboardMetrics?.roster || [], active = people.filter((e) => isActiveRosterEmployee(e));
    return `<section class="insight-section"><h3>員工名冊概況</h3><div class="badge-row">${renderBadge(`全部 ${people.length} 人`)}${renderBadge(`在職 ${active.length} 人`, 'success')}${renderBadge(`離職 ${people.length - active.length} 人`)}</div>${renderInsightEmployeeTable(people)}</section>`;
};
const dmPreviousNormal = renderAdminTodayNormalInsight, dmPreviousAbnormal = renderAdminAbnormalInsight;
renderAdminTodayNormalInsight = (dashboard = state.dashboard) => renderAdminInsightScopeControls(dashboard) + dmPreviousNormal(dashboard);
renderAdminAbnormalInsight = (dashboard = state.dashboard) => renderAdminInsightScopeControls(dashboard) + dmPreviousAbnormal(dashboard);
function dmDialog() { return document.getElementById('dashboard-metric-settings'); }
function dmMessage(text, type = 'error') { const target = dmDialog()?.querySelector('[data-dm-message]'); if (target) setMessage(target, text, type); }
function dmClose(force = false) {
    const dialog = dmDialog(); if (!dialog || dmState.busy) return;
    if (dmState.dirty && !force) { dialog.querySelector('[data-dm-discard-panel]').hidden = false; return; }
    dialog.close(); dialog.remove(); dmState.draft = null; dmState.dirty = false;
}
function dmOpenSettings() {
    if (dmDialog()) return;
    const data = state.dashboard.dashboardMetrics; dmState.draft = [...data.cardKeys]; dmState.dirty = false;
    const dialog = document.createElement('dialog'); dialog.id = 'dashboard-metric-settings'; dialog.className = 'dm-dialog'; dialog.setAttribute('aria-label', '設定八張指標');
    const groups = [...new Set(data.catalog.map((c) => c.category))];
    dialog.innerHTML = `<div class="modal-header"><h3>設定八張指標</h3><button class="ghost-btn dm-icon" type="button" data-dm-close aria-label="關閉" title="關閉">&times;</button></div><form data-dm-settings-form><div class="dm-slot-grid">${data.cardKeys.map((key, index) => `<label class="field"><span>第 ${index + 1} 張</span><select data-dm-position="${index}"><option value="" ${key ? '' : 'selected'}>未授權位置</option>${groups.map((group) => `<optgroup label="${dmEscape(group)}">${data.catalog.filter((c) => c.category === group).map((c) => `<option value="${dmEscape(c.key)}" ${key === c.key ? 'selected' : ''} ${c.available ? '' : 'disabled'}>${dmEscape(c.label)}${c.available ? '' : '（未授權）'}</option>`).join('')}</optgroup>`).join('')}</select></label>`).join('')}</div>
        <div class="inline-message" data-dm-message aria-live="polite"></div><div class="inline-actions dm-save-row"><label><input type="checkbox" name="confirm" required>確認儲存此帳號的指標與順序</label><button class="primary-btn" type="submit">儲存指標設定</button></div>
        <div data-dm-discard-panel hidden><p>有尚未儲存的設定。</p><button type="button" class="outline-btn" data-dm-keep>繼續編輯</button><button type="button" class="outline-btn" data-dm-discard>捨棄並關閉</button></div></form>`;
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); dmClose(); });
    dialog.addEventListener('click', (event) => {
        if (event.target.closest('[data-dm-close]')) dmClose();
        if (event.target.closest('[data-dm-discard]')) dmClose(true);
        if (event.target.closest('[data-dm-keep]')) dialog.querySelector('[data-dm-discard-panel]').hidden = true;
    });
    dialog.addEventListener('change', (event) => {
        if (dmState.busy) return;
        const input = event.target.closest('[data-dm-position]'); if (!input) return;
        const position = Number(input.dataset.dmPosition), previous = dmState.draft[position], other = dmState.draft.findIndex((key, i) => key && key === input.value && i !== position);
        if (other >= 0) { dmState.draft[other] = previous; dialog.querySelector(`[data-dm-position="${other}"]`).value = previous; }
        dmState.draft[position] = input.value; dmState.dirty = true; dialog.querySelector('[name="confirm"]').checked = false;
    });
    dialog.querySelector('form').addEventListener('submit', async (event) => {
        event.preventDefault(); if (dmState.busy) return;
        const identity = dmState.identity, body = { cardKeys: [...dmState.draft], revision: data.revision, confirm: dialog.querySelector('[name="confirm"]').checked };
        dmState.busy = true; dialog.querySelectorAll('input, select, button').forEach((c) => { c.disabled = true; });
        try {
            const result = await requestJson('/api/browser/admin/dashboard-metrics/preferences', { auth: true, method: 'POST', body });
            if (identity !== dmState.identity) return;
            Object.assign(state.dashboard.dashboardMetrics, result.preferences); dmState.dirty = false; dmState.busy = false; dmClose(true);
            renderDashboard(state.dashboard); setMessage(ui.dashboardMessage, result.message, 'success');
        } catch (error) { if (identity === dmState.identity) dmMessage(error.message); }
        finally { if (identity === dmState.identity) { dmState.busy = false; dialog.querySelectorAll('input, select, button').forEach((c) => { c.disabled = false; }); } }
    });
    document.body.append(dialog); dialog.showModal();
}
const dmPreviousInsightTitle = getAdminInsightTitle, dmPreviousInsight = renderAdminDashboardInsightContent;
getAdminInsightTitle = function metricInsightTitle(key) { return state.dashboard?.dashboardMetrics?.catalog.find((c) => c.key === key)?.label || dmPreviousInsightTitle(key); };
renderAdminDashboardInsightContent = function metricInsightContent(key, dashboard = state.dashboard) {
    if (!dashboard.dashboardMetrics?.catalog.some((c) => c.key === key && !['employeeCount', 'shiftCount', 'todayPunchCount', 'todayAbnormalPunchCount', 'bellScheduleCount', 'greetingCount', 'customThemeCount'].includes(key))) return dmPreviousInsight(key, dashboard);
    const data = dmState.detail; if (!data || data.metric.key !== key) return '<p role="status">讀取指標明細中…</p>';
    if (data.error) return `<p class="inline-message error">${dmEscape(data.error)}</p>`;
    const meal = data.kind === 'meal';
    return `<section class="insight-section"><p>${dmEscape(data.metric.date || '全部日期')} · ${dmEscape(data.metric.subtitle)} · 指標 ${dmEscape(data.metric.value)} · 明細 ${data.totalRecords} 筆</p>
        ${renderInsightTable(meal ? ['工號', '姓名', '部門', '目前用餐', '已交單'] : ['工號', '姓名', '部門', '開始', '結束', '時數', '狀態'], data.records.map((r) => `<tr><td>${dmEscape(r.employeeId)}</td><td>${dmEscape(r.employeeName)}</td><td>${dmEscape(r.employeeDepartment)}</td>${meal ? `<td>${r.eating ? '用餐' : '不用餐'}</td><td>${r.submittedEating == null ? '未交單' : r.submittedEating ? '用餐' : '不用餐'}</td>` : `<td>${dmEscape(r.startText)}</td><td>${dmEscape(r.endText)}</td><td>${dmEscape(r.duration_hours)}</td><td>${dmEscape(r.statusText)}</td>`}</tr>`))}
        <div class="inline-actions"><button type="button" class="outline-btn" data-dm-page="${data.page - 1}" aria-label="上一頁" title="上一頁" ${data.page <= 1 ? 'disabled' : ''}>&larr;</button><span>${data.page} / ${data.totalPages}</span><button type="button" class="outline-btn" data-dm-page="${data.page + 1}" aria-label="下一頁" title="下一頁" ${data.page >= data.totalPages ? 'disabled' : ''}>&rarr;</button></div></section>`;
};
async function dmLoadDetail(key, page = 1) {
    const identity = dmState.identity, sequence = ++dmState.sequence, item = state.dashboard.dashboardMetrics.catalog.find((c) => c.key === key);
    dmState.detail = null; openAdminDashboardInsight(key);
    try {
        const result = await requestJson(`/api/browser/admin/dashboard-metrics/detail?${new URLSearchParams({ key, page, ...(item.date ? { date: item.date } : {}) })}`, { auth: true });
        if (identity !== dmState.identity || sequence !== dmState.sequence || state.activeInsightKey !== key) return;
        dmState.detail = result.detail;
    } catch (error) { if (identity !== dmState.identity || sequence !== dmState.sequence || state.activeInsightKey !== key) return; dmState.detail = { metric: { key }, error: error.message }; }
    refreshAdminDashboardInsightModal();
}
ui.dashboardInsightContent?.addEventListener('click', (event) => { const button = event.target.closest('[data-dm-page]'); if (button) dmLoadDetail(state.activeInsightKey, Number(button.dataset.dmPage)); });
const dmPreviousClick = handleDashboardClick;
handleDashboardClick = async function metricDashboardClick(event) {
    const button = event.target.closest('[data-action]'), action = button?.dataset.action;
    if (action === 'dm-settings') { event.preventDefault(); dmOpenSettings(); return; }
    if (action === 'dm-insight') { event.preventDefault(); await dmLoadDetail(button.dataset.key); return; }
    if (action === 'dm-review') {
        event.preventDefault(); requestCalendars.reviewKind = button.dataset.kind || 'leave'; state.employeeWorkspacePanel = 'supervisor-review';
        renderDashboard(state.dashboard); document.getElementById(`rc-${requestCalendars.reviewKind}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); return;
    }
    return dmPreviousClick(event);
};
const dmPreviousEmployee = renderEmployeeDashboard;
renderEmployeeDashboard = function employeeReviewNotice(dashboard) {
    const html = dmPreviousEmployee(dashboard), review = dashboard.supervisorReview;
    if (!review?.canUse) return html;
    const notice = `<section class="dm-review-notice ${review.count ? 'has-pending' : ''}" aria-label="待主管審核事件"><div><h3>待我審核 <strong>${review.count}</strong> 筆</h3><span>請假 ${review.leaveCount || 0} 筆 · 加班 ${review.overtimeCount || 0} 筆</span></div><div class="inline-actions"><button type="button" class="outline-btn" data-action="dm-review" data-kind="leave">請假 ${review.leaveCount || 0}</button><button type="button" class="outline-btn" data-action="dm-review" data-kind="overtime">加班 ${review.overtimeCount || 0}</button></div></section>`;
    return notice + html;
};
function renderRequestReviewProgress(row) {
    const policy = row.reviewPolicy; if (!policy) return '';
    const required = policy.reviewers.filter((r) => r.required), approved = required.filter((r) => r.decision === 'approved' && !r.revoked).length;
    return `<details class="dm-review-progress"><summary>${policy.mode === 'required' ? `必審 ${approved}/${required.length} 已核准` : '任一主管核准即可'}</summary><ul>${policy.reviewers.map((r) => `<li>${dmEscape(r.id)} ${dmEscape(r.name)}${r.required ? '（必審）' : ''}：${r.revoked ? '已停用' : r.decision === 'approved' ? '已核准' : r.decision === 'rejected' ? '已駁回' : row.status === 'pending_supervisor' ? '待審核' : '免再審核'}${r.comment ? ` · ${dmEscape(r.comment)}` : ''}</li>`).join('')}</ul></details>`;
}
const dmPreviousRender = renderDashboard;
renderDashboard = function renderMetricsDashboard(dashboard) {
    const identity = `${state.token}/${dashboard.role}/${dashboard.user?.id || ''}`;
    if (identity !== dmState.identity) { dmState.busy = false; dmState.dirty = false; dmClose(true); Object.assign(dmState, { identity, detail: null, draft: null, sequence: dmState.sequence + 1 }); }
    const result = dmPreviousRender(dashboard);
    if (dashboard.role === 'admin' && dmState.detail && state.activeInsightKey === dmState.detail.metric.key) dmLoadDetail(state.activeInsightKey, dmState.detail.page || 1);
    return result;
};
const dmPreviousSync = handleRealtimeSyncMessage;
handleRealtimeSyncMessage = async function syncMetricDashboard(payload) {
    if (payload?.type === 'dashboardMetrics' && state.dashboard?.role === 'admin') {
        if (dmState.busy || dmState.dirty) return;
        return reloadDashboard();
    }
    if (payload?.type === 'meals' && state.dashboard?.role === 'admin') return reloadDashboard();
    return dmPreviousSync(payload);
};
const dmPreviousLogout = handleLogout;
handleLogout = function logoutMetrics(...args) { dmState.busy = false; dmState.dirty = false; dmClose(true); Object.assign(dmState, { identity: '', detail: null, sequence: dmState.sequence + 1 }); return dmPreviousLogout(...args); };
