const leaveUsageState = { identity: '', data: null, filters: null, page: 1, sequence: 0, loading: false, error: '' };
const luEscape = (value) => escapeHtml(String(value ?? ''));
const luNumber = (value) => Number(value || 0).toLocaleString('zh-TW', { maximumFractionDigits: 2 });
function luDefaultFilters() {
    const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10), [year, month] = today.split('-').map(Number);
    return { startDate: `${today.slice(0, 7)}-01`, endDate: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10), keyword: '', department: '' };
}
function luPager(data, detail = false) {
    return `<div class="lu-pagination"><span>共 ${data.totalCount} ${detail ? '筆申請' : '位員工'} · 每頁 ${data.pageSize} 筆</span><button type="button" class="outline-btn" data-lu-action="${detail ? 'detail-page' : 'page'}" data-page="${data.page - 1}" ${data.page <= 1 ? 'disabled' : ''}>上一頁</button><span>${data.page} / ${data.pages}</span><button type="button" class="outline-btn" data-lu-action="${detail ? 'detail-page' : 'page'}" data-page="${data.page + 1}" ${data.page >= data.pages ? 'disabled' : ''}>下一頁</button></div>`;
}
function renderLeaveUsageWorkspace() {
    const s = leaveUsageState, f = s.filters ||= luDefaultFilters(), data = s.data;
    const field = (label, name, type) => `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${luEscape(f[name])}" ${type === 'date' ? 'required min="2000-01-01" max="2100-12-31"' : 'maxlength="200"'}></label>`;
    return `<section id="leave-usage-workspace" class="lu-workspace" aria-label="請假使用總覽" aria-busy="${s.loading}">
        <h3>請假使用總覽</h3><p class="helper-text">以實際請假日期統計所有假別；點時數查看原申請。已核准與待審分開，額度餘額請至「假別額度」。</p>
        <form data-lu-form class="lu-filters">${field('開始日期', 'startDate', 'date')}${field('結束日期', 'endDate', 'date')}${field('工號／姓名', 'keyword', 'search')}
        <label class="field"><span>部門</span><select name="department"><option value="">全部部門</option>${(data?.departments || []).map((d) => `<option value="${luEscape(d)}" ${f.department === d ? 'selected' : ''}>${luEscape(d)}</option>`).join('')}</select></label>
        <button class="primary-btn" type="submit" ${s.loading ? 'disabled' : ''}>查詢</button><button class="outline-btn" type="button" data-lu-action="reset">本月／清除</button><button class="outline-btn" type="button" data-lu-action="export" ${!data || s.loading ? 'disabled' : ''}>匯出 Excel</button></form>
        <p class="inline-message error" role="status">${luEscape(s.error)}</p>
        ${s.loading ? '<p role="status">讀取請假使用資訊…</p>' : ''}
        ${!data ? '' : `<div class="lu-totals"><span>${luEscape(data.range.startDate)} ～ ${luEscape(data.range.endDate)}</span><strong>已核准 ${luNumber(data.total.approvedHours)} 小時</strong><strong>待審 ${luNumber(data.total.pendingHours)} 小時</strong><span class="lu-unknown">待確認 ${data.total.unknownCount} 筆</span></div>
        <p class="helper-text">每格：已核准／待審小時。待確認表示舊單缺少每日時數，或分配資料異常，未加進小時合計；已駁回、撤回與作廢不計使用。</p>
        <div class="lu-table-scroll" role="region" aria-label="各員工假別使用表，可左右捲動" tabindex="0"><table class="lu-table"><thead><tr><th scope="col">工號／員工</th><th scope="col">部門</th>${data.types.map((t) => `<th scope="col">${luEscape(t.name)}${t.enabled ? '' : '（停用）'}<small>已核准／待審</small></th>`).join('')}<th scope="col">合計<small>已核准／待審</small></th></tr></thead><tbody>
        ${data.employees.map((p) => `<tr><th scope="row">${luEscape(p.employeeId)}<small>${luEscape(p.name)}</small></th><td>${luEscape(p.department || '—')}</td>${data.types.map((t) => {
            const c = p.cells[t.id]; return `<td>${c ? `<button type="button" class="lu-cell" data-lu-action="detail" data-employee="${luEscape(p.employeeId)}" data-type="${luEscape(t.id)}" aria-label="${luEscape(`${p.name} ${t.name}，查看申請`)}">${luNumber(c.approvedHours)} / ${luNumber(c.pendingHours)}${c.unknownCount ? `<small class="lu-unknown">${c.unknownCount} 筆待確認</small>` : ''}</button>` : '<span class="lu-zero">0 / 0</span>'}</td>`;
        }).join('')}<td>${luNumber(p.total.approvedHours)} / ${luNumber(p.total.pendingHours)}${p.total.unknownCount ? `<small class="lu-unknown">${p.total.unknownCount} 筆待確認</small>` : ''}</td></tr>`).join('') || `<tr><td colspan="${data.types.length + 3}">沒有符合條件的員工。</td></tr>`}</tbody></table></div>${luPager(data)}`}
    </section>`;
}
function luPaint() { const root = document.getElementById('leave-usage-workspace'); if (root) root.outerHTML = renderLeaveUsageWorkspace(); }
async function luLoad() {
    const s = leaveUsageState, identity = s.identity, token = state.token, sequence = ++s.sequence;
    s.loading = true; s.error = ''; s.data = null; luPaint();
    try {
        const result = await requestJson(`/api/browser/admin/leave/usage?${new URLSearchParams({ ...s.filters, page: s.page })}`, { auth: true });
        if (s.identity !== identity || token !== state.token || s.sequence !== sequence) return;
        s.data = result.usage; s.page = result.usage.page;
    } catch (error) { if (s.identity === identity && token === state.token && s.sequence === sequence) s.error = error.message; }
    finally { if (s.identity === identity && s.sequence === sequence) { s.loading = false; luPaint(); } }
}
const luPreviousDashboard = renderDashboard;
renderDashboard = function renderWithLeaveUsage(dashboard) {
    const identity = `${state.token}/${dashboard.role}/${dashboard.user?.id || ''}`;
    if (leaveUsageState.identity !== identity) {
        document.getElementById('leave-usage-detail')?.remove();
        Object.assign(leaveUsageState, { identity, filters: luDefaultFilters(), page: 1, sequence: leaveUsageState.sequence + 1 });
    }
    Object.assign(leaveUsageState, { data: null, loading: false, error: '', sequence: leaveUsageState.sequence + 1 });
    return luPreviousDashboard(dashboard);
};
const luPreviousPost = postRenderSetup;
postRenderSetup = function setupLeaveUsage() { luPreviousPost(); if (document.getElementById('leave-usage-workspace') && !leaveUsageState.data && !leaveUsageState.loading && !leaveUsageState.error) luLoad(); };
document.addEventListener('submit', (event) => {
    if (!event.target.matches('[data-lu-form]')) return;
    event.preventDefault(); leaveUsageState.filters = Object.fromEntries(new FormData(event.target)); leaveUsageState.page = 1; luLoad();
});
async function luDetail(dialog, page = 1) {
    const identity = leaveUsageState.identity, token = state.token, sequence = (Number(dialog.dataset.sequence) || 0) + 1;
    dialog.dataset.sequence = sequence;
    dialog.querySelector('.lu-detail-body').innerHTML = '<p role="status">讀取原申請…</p>';
    try {
        const result = await requestJson(`/api/browser/admin/leave/usage?${new URLSearchParams({ ...leaveUsageState.filters, employeeId: dialog.dataset.employee, leaveTypeId: dialog.dataset.type, page })}`, { auth: true });
        if (!dialog.isConnected || identity !== leaveUsageState.identity || token !== state.token || String(sequence) !== dialog.dataset.sequence) return;
        const data = result.usage;
        dialog.querySelector('.lu-detail-body').innerHTML = `<p class="helper-text">${luEscape(data.range.startDate)} ～ ${luEscape(data.range.endDate)}，唯讀原申請；「區間時數」僅含查詢日期內的實際時數。</p><div class="lu-table-scroll"><table class="lu-table"><thead><tr><th>員工／假別</th><th>申請期間</th><th>狀態</th><th>區間時數</th><th>原申請</th></tr></thead><tbody>${data.details.map((r) => `<tr><td>${luEscape(r.employeeId)} ${luEscape(r.employeeName)}<small>${luEscape(r.leaveTypeName)}</small></td><td>${luEscape(luTime(r.start_at))}<small>至 ${luEscape(luTime(r.end_at))}</small></td><td>${luEscape(r.statusText)}</td><td>${r.usageHours == null ? '<span class="lu-unknown">待確認</span>' : luNumber(r.usageHours)}</td><td><details><summary>查看內容</summary><p>單號：${luEscape(r.id)}</p><p>申請人：${luEscape(r.applicantId)} ${luEscape(r.applicantName)}</p><p>整張時數：${luNumber(r.duration_hours)} 小時</p><p>${luEscape(r.reason || '未填原因')}</p>${r.usageHours == null ? '<p class="lu-unknown">缺少可核對的每日時數，請至假別額度核對舊單每日分配。</p>' : ''}${typeof renderLeaveDaysSummary === 'function' ? renderLeaveDaysSummary(r) : ''}${typeof renderRequestReviewProgress === 'function' ? renderRequestReviewProgress(r) : ''}</details></td></tr>`).join('') || '<tr><td colspan="5">沒有符合條件的原申請。</td></tr>'}</tbody></table></div>${luPager(data, true)}`;
    } catch (error) { if (dialog.isConnected && identity === leaveUsageState.identity && token === state.token && String(sequence) === dialog.dataset.sequence) dialog.querySelector('.lu-detail-body').textContent = error.message; }
}
function luTime(at) { return new Date(Number(at)).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }); }
document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-lu-action]'); if (!button) return;
    const action = button.dataset.luAction; event.preventDefault();
    if (action === 'close') { button.closest('dialog').close(); return; }
    if (action === 'detail-page') { luDetail(button.closest('dialog'), Number(button.dataset.page)); return; }
    if (action === 'detail') {
        document.getElementById('leave-usage-detail')?.remove();
        const dialog = document.createElement('dialog'); dialog.id = 'leave-usage-detail'; dialog.className = 'lu-dialog';
        dialog.dataset.employee = button.dataset.employee; dialog.dataset.type = button.dataset.type;
        dialog.setAttribute('aria-labelledby', 'lu-detail-title');
        dialog.innerHTML = '<header><h3 id="lu-detail-title">請假原申請</h3><button type="button" class="outline-btn" data-lu-action="close" autofocus>關閉</button></header><div class="lu-detail-body"></div>';
        dialog.addEventListener('close', () => { dialog.remove(); if (button.isConnected) button.focus(); }, { once: true });
        document.body.append(dialog); dialog.showModal(); luDetail(dialog); return;
    }
    if (action === 'page') { leaveUsageState.page = Number(button.dataset.page); luLoad(); }
    if (action === 'reset') { leaveUsageState.filters = luDefaultFilters(); leaveUsageState.page = 1; luLoad(); }
    if (action === 'export') {
        const identity = leaveUsageState.identity, token = state.token, filters = { ...leaveUsageState.filters };
        const current = () => identity === leaveUsageState.identity && token === state.token;
        button.disabled = true;
        try {
            const response = await fetch(`/api/browser/admin/leave/usage/export?${new URLSearchParams(filters)}`, { headers: { Authorization: `Bearer ${token}` } });
            if (!current()) return;
            if (!response.ok) throw new Error((await response.json()).error);
            const blob = await response.blob(); if (!current()) return;
            const url = URL.createObjectURL(blob), link = document.createElement('a');
            link.href = url; link.download = `請假使用總覽-${filters.startDate}-${filters.endDate}.xlsx`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) { if (current()) { leaveUsageState.error = error.message; luPaint(); } }
        finally { if (button.isConnected) button.disabled = false; }
    }
});

const luPreviousLogout = handleLogout;
handleLogout = function logoutWithLeaveUsageCleanup(...args) {
    document.getElementById('leave-usage-detail')?.remove();
    Object.assign(leaveUsageState, { identity: '', data: null, filters: null, page: 1, loading: false, error: '', sequence: leaveUsageState.sequence + 1 });
    return luPreviousLogout(...args);
};
const luPreviousSync = handleRealtimeSyncMessage;
handleRealtimeSyncMessage = async function syncLeaveUsage(payload) {
    const affected = state.dashboard?.role === 'admin' && ['leaveRequests', 'employees', 'leaveSettings'].includes(payload?.type);
    if (affected) {
        document.getElementById('leave-usage-detail')?.remove();
        Object.assign(leaveUsageState, { data: null, loading: false, error: '', sequence: leaveUsageState.sequence + 1 });
        luPaint();
    }
    const result = await luPreviousSync(payload);
    if (affected && state.dashboard?.role === 'admin' && document.getElementById('leave-usage-workspace') && !leaveUsageState.loading && !leaveUsageState.data && !leaveUsageState.error) await luLoad();
    return result;
};
