/* Supervisors propose changes; only authorized administrators alter the original. */
const approvedChangeInboxes = new Map();
let approvedChangeDialog = null;
const acrLabels = { leave: '請假', overtime: '加班' };
const acrStatuses = { pending: '待管理者處理', returned: '已退回', closed: '已結案（未執行）', completed: '已完成異動' };
const acrEscape = value => escapeHtml(String(value ?? ''));
const acrIdentity = (dashboard = state.dashboard) => JSON.stringify([state.token, dashboard?.role, dashboard?.user?.id,
    Boolean(dashboard?.impersonation?.active), ...(dashboard?.permissions?.admin || []).slice().sort()]);
const acrPath = () => state.dashboard?.role === 'admin' ? '/api/browser/admin/approved-changes' : '/api/browser/employee/supervisor/approved-changes';
function acrCanRead(kind) {
    return Object.hasOwn(acrLabels, kind) && (state.dashboard?.role === 'employee' || state.dashboard?.role === 'admin' &&
        hasCurrentAdminPermission(kind === 'leave' ? 'admin.leave.review' : 'admin.overtime.view'));
}
function acrInbox(kind) {
    const key = `${acrIdentity()}/${kind}`;
    if (!approvedChangeInboxes.has(key)) approvedChangeInboxes.set(key, { kind, identity: acrIdentity(), status: 'pending', query: '', page: 1, data: null, loading: false, error: '', sequence: 0 });
    return approvedChangeInboxes.get(key);
}
function renderApprovedChangeRequestAction(kind, row) {
    if (state.dashboard?.role !== 'employee' || state.dashboard?.impersonation?.active || row.status !== 'approved' || !row.calendarActions?.changeRequest) return '';
    return `<button type="button" class="mini-btn" data-acr-propose="${kind}" data-id="${acrEscape(row.id)}">提出更正／作廢需求</button>`;
}
function renderApprovedChangeInbox(kind) {
    if (!acrCanRead(kind)) return '';
    const current = acrInbox(kind), data = current.data, employee = state.dashboard?.role === 'employee';
    const rows = data?.requests || [], pagination = data?.pagination;
    return `<section id="approved-change-inbox-${kind}" class="acr-inbox" data-acr-kind="${kind}" aria-label="${acrLabels[kind]}更正與作廢需求">
        <div class="acr-heading"><h3>${employee ? '我提出的' : ''}更正／作廢需求</h3><button type="button" class="outline-btn" data-acr-refresh="${kind}">重新整理需求</button></div>
        <p>提出需求不會修改原單；由有權限的管理者核對後統一處理。${employee ? '此處可追蹤自己提出的需求與處理結果。' : '只有實際更正或作廢成功，才會標記為「已完成異動」。'}</p>
        <form data-acr-filter="${kind}" class="acr-filters"><label class="field"><span>處理狀態</span><select name="status"><option value="">全部狀態</option>${Object.entries(acrStatuses).map(([value, text]) => `<option value="${value}" ${current.status === value ? 'selected' : ''}>${text}</option>`).join('')}</select></label>
        <label class="field"><span>搜尋需求</span><input type="search" name="query" value="${acrEscape(current.query)}" placeholder="工號、姓名或需求原因"></label><button class="outline-btn" type="submit">查詢需求</button></form>
        ${current.error ? `<p role="alert">${acrEscape(current.error)}</p>` : ''}
        ${current.loading && !data ? '<p role="status">讀取需求中…</p>' : data ? `<p class="helper-text">${data.summary.total} 筆符合條件 · 全部日期待處理 ${data.summary.pendingTotalCount} 筆</p>
        ${rows.length ? `<div class="data-table-wrap acr-table-wrap" role="region" tabindex="0" aria-label="異動需求清單，可左右捲動"><table class="data-table"><thead><tr><th>員工</th><th>原申請時段</th><th>需求</th><th>提出者／時間</th><th>原因與內容</th><th>處理狀態</th><th>操作</th></tr></thead><tbody>${rows.map(row => `<tr><td>${acrEscape(row.employeeId)} ${acrEscape(row.employeeName)}</td><td>${acrEscape(acTime(row.record?.start_at))}<br>至 ${acrEscape(acTime(row.record?.end_at))}</td><td>${row.action === 'void' ? '作廢' : '更正'}</td><td>${acrEscape(row.proposerId)} ${acrEscape(row.proposerName)}<br>${acrEscape(acTime(row.proposedAt))}</td><td class="acr-reason">${acrEscape(row.reason)}${row.proposal ? `<small>${acrEscape(row.proposal)}</small>` : ''}</td><td>${acrEscape(acrStatuses[row.status] || row.status)}</td><td><button type="button" class="mini-btn" data-acr-detail="${acrEscape(row.id)}" data-kind="${kind}">查看${employee ? '進度' : '／處理'}</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="acr-empty">沒有符合條件的需求。</p>'}
        ${pagination ? `<nav class="acr-pagination" aria-label="異動需求分頁"><button type="button" class="outline-btn" data-acr-page="${pagination.page - 1}" data-kind="${kind}" ${pagination.page <= 1 ? 'disabled' : ''}>上一頁</button><span>第 ${pagination.page}／${pagination.totalPages} 頁 · 每頁 ${pagination.pageSize} 筆</span><button type="button" class="outline-btn" data-acr-page="${pagination.page + 1}" data-kind="${kind}" ${pagination.page >= pagination.totalPages ? 'disabled' : ''}>下一頁</button></nav>` : ''}` : ''}</section>`;
}
function acrPaint(kind) {
    const host = document.getElementById(`approved-change-inbox-${kind}`);
    if (host) host.outerHTML = renderApprovedChangeInbox(kind);
}
async function acrLoad(kind) {
    if (!acrCanRead(kind)) return;
    const current = acrInbox(kind), sequence = ++current.sequence;
    current.loading = true; current.error = ''; acrPaint(kind);
    try {
        const data = await requestJson(`${acrPath()}?${new URLSearchParams({ kind, status: current.status, query: current.query, page: current.page })}`, { auth: true });
        if (current.identity !== acrIdentity() || current.sequence !== sequence) return;
        current.data = data; current.page = data.pagination?.page || current.page;
    } catch (error) { if (current.identity === acrIdentity() && current.sequence === sequence) current.error = error.message; }
    finally { if (current.identity === acrIdentity() && current.sequence === sequence) { current.loading = false; acrPaint(kind); } }
}
function acrHistory(entries = [], kind) {
    const labels = { submitted: '提出需求', created: '提出需求', returned: '退回需求', return: '退回需求', closed: '結案（未執行）', close: '結案（未執行）', completed: '完成異動' };
    const statuses = { approved: '已核准', cancelled: '已作廢', pending_additional: '待額外複核' };
    const snapshot = (label, record) => record ? `<details><summary>${label}</summary><p>狀態：${acrEscape(record.statusText || (Object.hasOwn(statuses, record.status) ? statuses[record.status] : record.status) || '未記錄')}</p>${acSnapshot(record, kind)}</details>` : '';
    return `<section><h4>需求處理歷程</h4>${entries.length ? `<ol>${entries.map(entry => `<li><strong>${acrEscape(labels[entry.action] || entry.action)}</strong> · ${acrEscape(entry.actorId)} ${acrEscape(entry.actorName || '')} · ${acrEscape(acTime(entry.occurredAt))}<p>${acrEscape(entry.reason || '')}</p>${entry.action === 'completed' ? snapshot('此次異動前', entry.before) + snapshot('此次異動後', entry.after) : ''}</li>`).join('')}</ol>` : '<p>尚無需求歷程。</p>'}</section>`;
}
function acrClose(force = false) {
    const current = approvedChangeDialog;
    if (!current) return true;
    if (!force && current.busy) return false;
    if (!force && current.dirty && !window.confirm('尚有未送出的需求內容，確定關閉？')) return false;
    approvedChangeDialog = null; current.dialog.remove(); return true;
}
function acrCreateDialog(title) {
    if (!acrClose()) return null;
    const dialog = document.createElement('dialog');
    const current = { dialog, identity: acrIdentity(), busy: false, dirty: false, data: null };
    approvedChangeDialog = current; dialog.id = 'approved-change-dialog'; dialog.className = 'ac-dialog acr-dialog'; dialog.dataset.helpKey = 'approvedChanges';
    dialog.setAttribute('aria-labelledby', 'acr-dialog-title');
    dialog.innerHTML = `<header><h3 id="acr-dialog-title">${title}</h3><div class="ac-header-actions"><button type="button" class="outline-btn" data-acr-help>操作說明</button><button type="button" class="outline-btn" data-acr-close>關閉</button></div></header><p data-acr-message role="status" aria-live="polite"></p><div data-acr-body>讀取中…</div>`;
    dialog.addEventListener('cancel', event => { event.preventDefault(); acrClose(); });
    dialog.addEventListener('input', () => { current.dirty = true; });
    dialog.querySelector('[data-acr-close]').onclick = () => acrClose();
    dialog.querySelector('[data-acr-help]').onclick = () => { if (typeof openWorkbenchHelp === 'function') openWorkbenchHelp(); };
    document.body.append(dialog); dialog.showModal(); return current;
}
const acrLive = current => approvedChangeDialog === current && current.identity === acrIdentity() && current.dialog.isConnected;
function acrProposalBody(kind, data, draft = {}) {
    return `<h4>原${acrLabels[kind]}申請</h4>${acSnapshot(data.record, kind)}
        ${data.pending ? '<p class="acr-notice">這張單已有待處理需求，請等待管理者處理，避免重複提出。</p>' + acrHistory(data.pending.history || [], kind) : data.canRequest ? `<form data-acr-proposal class="stack-form">
        <p>送出後原單仍維持目前狀態，直到管理者完成更正或作廢。</p><label class="field"><span>需求類型</span><select name="action"><option value="correction" ${draft.action !== 'void' ? 'selected' : ''}>需要更正</option><option value="void" ${draft.action === 'void' ? 'selected' : ''}>需要作廢</option></select></label>
        <label class="field"><span>提出原因（必填）</span><textarea name="reason" rows="3" maxlength="500" required>${acrEscape(draft.reason || '')}</textarea></label>
        <label class="field"><span>希望如何更正（更正需求必填）</span><textarea name="proposal" rows="3" maxlength="2000" ${draft.action === 'void' ? '' : 'required'} placeholder="例如改為哪一天、何時開始與結束、休息分鐘或假別">${acrEscape(draft.proposal || '')}</textarea></label>
        <label class="ac-check"><input type="checkbox" name="confirm" required>我已核對原申請，請管理者處理</label><button type="submit" class="primary-btn">送出需求</button></form>` : '<p>此單目前不符合提出需求的條件。</p>'}`;
}
async function acrPropose(kind, id) {
    if (state.dashboard?.role !== 'employee' || state.dashboard?.impersonation?.active || !acrCanRead(kind)) return;
    const current = acrCreateDialog(`提出${acrLabels[kind]}更正／作廢需求`); if (!current) return;
    current.kind = kind; current.id = id;
    try {
        const data = await requestJson(`${acrPath()}?${new URLSearchParams({ kind, requestId: id })}`, { auth: true });
        if (!acrLive(current)) return;
        current.data = data.changeRequest; current.dialog.querySelector('[data-acr-body]').innerHTML = acrProposalBody(kind, current.data);
    } catch (error) { if (acrLive(current)) current.dialog.querySelector('[data-acr-message]').textContent = error.message; }
}
function acrAdminDetail(row) {
    const active = row.status === 'pending', canManage = row.canManage && !state.dashboard?.impersonation?.active;
    return `<p>${acrEscape(row.employeeId)} ${acrEscape(row.employeeName)} · ${acrEscape(acrStatuses[row.status])}</p><p>需求：${row.action === 'void' ? '作廢' : '更正'} · 提出者：${acrEscape(row.proposerId)} ${acrEscape(row.proposerName)} · ${acrEscape(acTime(row.proposedAt))}</p>
        <p class="acr-reason">提出原因：${acrEscape(row.reason)}</p>${row.proposal ? `<p class="acr-reason">希望更正內容：${acrEscape(row.proposal)}</p>` : ''}
        <details><summary>提出時的原申請</summary>${acSnapshot(row.record || {}, row.kind)}</details>
        ${row.currentRecord ? `<details><summary>目前原申請</summary><p>狀態：${acrEscape(row.currentRecord.statusText || row.currentRecord.status)}</p>${acSnapshot(row.currentRecord, row.kind)}</details>` : ''}
        ${acrHistory(row.history, row.kind)}${active && canManage ? `<section class="acr-resolution"><h4>管理者處理</h4>
        ${row.readyToComplete ? `<button type="button" class="primary-btn" data-acr-process>核對並${row.action === 'void' ? '作廢原單' : '更正原單'}</button>` : '<p class="acr-notice">原申請已變更或不再符合執行條件。請核對目前資料；可退回補充或說明後結案，不能直接標記已完成。</p>'}
        <form data-acr-resolve class="stack-form"><label class="field"><span>其他處理方式</span><select name="decision"><option value="return">退回需求</option><option value="close">結案（不執行異動）</option></select></label><label class="field"><span>處理說明（必填）</span><textarea name="reason" maxlength="500" rows="3" required></textarea></label><label class="ac-check"><input type="checkbox" name="confirm" required>確認這次處理結果與說明</label><button type="submit" class="outline-btn">保存處理結果</button></form></section>` : active ? (state.dashboard?.role === 'employee' ? '<p>請等待管理者處理；結果會保留在此需求歷程。</p>' : '<p>目前為唯讀，需具有本項更正或作廢權限才能處理。</p>') : ''}`;
}
async function acrDetail(kind, id) {
    if (!acrCanRead(kind)) return;
    const current = acrCreateDialog(`${acrLabels[kind]}更正／作廢需求`); if (!current) return;
    current.kind = kind;
    try {
        const result = await requestJson(`${acrPath()}?${new URLSearchParams({ id, kind })}`, { auth: true });
        if (!acrLive(current)) return;
        current.data = result.changeRequest; current.dialog.querySelector('[data-acr-body]').innerHTML = acrAdminDetail(current.data);
    } catch (error) { if (acrLive(current)) current.dialog.querySelector('[data-acr-message]').textContent = error.message; }
}
async function acrSubmit(form, proposal) {
    const current = approvedChangeDialog;
    if (!current || !acrLive(current) || current.busy || !current.data || state.dashboard?.impersonation?.active || !form.reportValidity()) return;
    const values = Object.fromEntries(new FormData(form)), reason = String(values.reason || '').trim();
    const message = current.dialog.querySelector('[data-acr-message]');
    if (!reason || reason.length > 500 || !values.confirm) { message.textContent = '請填寫原因（最多 500 字）並勾選確認。'; return; }
    const description = String(values.proposal || '').trim();
    if (proposal && (!current.data.canRequest || current.data.pending)) return;
    if (proposal && values.action === 'correction' && !description) { message.textContent = '請說明希望更正的內容。'; return; }
    if (proposal && description.length > 2000) { message.textContent = '希望更正內容最多 2000 字。'; return; }
    if (!proposal && (state.dashboard?.role !== 'admin' || !current.data.canManage || current.data.status !== 'pending')) return;
    const body = proposal ? { kind: current.kind, requestId: current.id, action: values.action,
        revision: current.data.revisions[values.action], reason, proposal: description, confirm: true } :
        { id: current.data.id, revision: current.data.revision, decision: values.decision, reason, confirm: true };
    current.busy = true; const submit = form.querySelector('button[type="submit"]'); submit.disabled = true;
    try {
        const result = await requestJson(`${acrPath()}${proposal ? '' : '/resolve'}`, { auth: true, method: 'POST', body });
        if (!acrLive(current)) return;
        current.data = result.changeRequest; current.dirty = false;
        current.dialog.querySelector('[data-acr-body]').innerHTML = acrAdminDetail(current.data);
        message.textContent = proposal ? '需求已送出，原申請尚未變更。' : '處理結果已保存，原申請未變更。';
        acrInvalidate(); await reloadDashboard(proposal ? '需求已送交管理者。' : '需求處理結果已保存。');
    } catch (error) { if (acrLive(current)) message.textContent = error.message; }
    finally { if (acrLive(current)) { current.busy = false; submit.disabled = false; } }
}
function acrInvalidate() {
    for (const current of approvedChangeInboxes.values()) { current.data = null; current.error = ''; current.loading = false; current.sequence++; }
}
document.addEventListener('submit', event => {
    const filter = event.target.closest?.('[data-acr-filter]');
    if (filter) { event.preventDefault(); const current = acrInbox(filter.dataset.acrFilter), values = new FormData(filter); current.status = String(values.get('status') || ''); current.query = String(values.get('query') || '').trim(); current.page = 1; acrLoad(current.kind); return; }
    const form = event.target.closest?.('[data-acr-proposal],[data-acr-resolve]');
    if (form) { event.preventDefault(); acrSubmit(form, form.matches('[data-acr-proposal]')); }
});
document.addEventListener('change', event => {
    const form = event.target.closest?.('[data-acr-proposal]');
    if (form && event.target.name === 'action') form.elements.proposal.required = event.target.value === 'correction';
});
document.addEventListener('click', event => {
    const propose = event.target.closest?.('[data-acr-propose]');
    if (propose) { event.preventDefault(); acrPropose(propose.dataset.acrPropose, propose.dataset.id); return; }
    const detail = event.target.closest?.('[data-acr-detail]');
    if (detail) { event.preventDefault(); acrDetail(detail.dataset.kind, detail.dataset.acrDetail); return; }
    const refresh = event.target.closest?.('[data-acr-refresh]'); if (refresh) { acrLoad(refresh.dataset.acrRefresh); return; }
    const page = event.target.closest?.('[data-acr-page]'); if (page) { const current = acrInbox(page.dataset.kind), next = Number(page.dataset.acrPage); if (next > 0 && next <= current.data?.pagination.totalPages) { current.page = next; acrLoad(current.kind); } return; }
    if (event.target.closest?.('[data-acr-process]')) {
        const current = approvedChangeDialog, row = current?.data;
        if (!current || !acrLive(current) || current.busy || state.dashboard?.role !== 'admin' || state.dashboard?.impersonation?.active || !row.canManage || !row.readyToComplete) return;
        if (!acrClose()) return;
        const context = { changeRequestId: row.id, reason: row.reason, proposal: row.proposal };
        if (row.action === 'void') avOpen(row.kind, row.requestId, context); else openApprovedCorrection(row.kind, row.requestId, context);
    }
});
const acrPreviousRender = renderDashboard;
let acrActiveIdentity = '';
renderDashboard = function renderWithApprovedChangeCleanup(dashboard) {
    const identity = acrIdentity(dashboard);
    if (identity !== acrActiveIdentity) { approvedChangeInboxes.clear(); acrClose(true); acrActiveIdentity = identity; }
    return acrPreviousRender(dashboard);
};
const acrPreviousSetup = postRenderSetup;
postRenderSetup = function setupApprovedChangeInboxes() {
    acrPreviousSetup();
    for (const kind of Object.keys(acrLabels)) { const current = acrInbox(kind); if (document.getElementById(`approved-change-inbox-${kind}`) && !current.data && !current.loading && !current.error) acrLoad(kind); }
};
const acrPreviousSync = handleRealtimeSyncMessage;
handleRealtimeSyncMessage = async function syncApprovedChanges(payload) {
    if (['approvedChangeRequests', 'leaveRequests', 'overtimeRequests'].includes(payload?.type)) acrInvalidate();
    if (payload?.type === 'approvedChangeRequests' && ['admin','employee'].includes(state.dashboard?.role)) {
        if (payload.origin === 'browser' && payload.sessionToken === state.token) return;
        await reloadDashboard('已同步更正／作廢需求。', 'info', { background: true });
        return;
    }
    return acrPreviousSync(payload);
};
const acrPreviousLogout = handleLogout;
handleLogout = function logoutApprovedChanges(...args) { approvedChangeInboxes.clear(); acrClose(true); acrActiveIdentity = ''; return acrPreviousLogout(...args); };
