const approvedVoidKinds = {
    leave: { label: '請假', view: 'admin.leave.review', modes: ['employee_request', 'supervisor_proxy'],
        impact: '作廢後，這張單不再列為已核准請假，原扣抵的請假額度會回補；若涉及已結算特休額度，系統會阻止作廢。已取消的午餐不會自動恢復，既有週六加班複核紀錄仍會保留。' },
    overtime: { label: '加班', view: 'admin.overtime.view', modes: ['self_request', 'supervisor_proxy', 'supervisor_proxy_auto_approved'],
        impact: '作廢後，這張單不再列為已核准加班。' }
};
let approvedVoidDialog = null;
const avEscape = value => escapeHtml(String(value ?? ''));

function approvedVoidStatusText(row) {
    return row.status === 'cancelled' && row.voidSummary?.id ? '已作廢' : row.statusText;
}

function avIdentity(dashboard = state.dashboard) {
    return JSON.stringify([state.token, dashboard?.role, dashboard?.user?.id, Boolean(dashboard?.impersonation?.active),
        dashboard?.impersonation?.realEmployeeId, ...(dashboard?.permissions?.admin || []).slice().sort()]);
}

function avCanRead(kind) {
    return Object.hasOwn(approvedVoidKinds, kind) && state.dashboard?.role === 'admin' &&
        hasCurrentAdminPermission(approvedVoidKinds[kind].view);
}

function avCanVoid(kind) {
    return avCanRead(kind) && !state.dashboard?.impersonation?.active && hasCurrentAdminPermission(`admin.${kind}.approvedVoid`);
}

function renderApprovedVoidAction(kind, row) {
    if (!avCanRead(kind) || !approvedVoidKinds[kind].modes.includes(row.approval_mode)) return '';
    const history = row.status === 'cancelled' && Boolean(row.voidSummary?.id);
    if (!history && !(row.status === 'approved' && avCanVoid(kind))) return '';
    return `<button type="button" class="mini-btn${history ? '' : ' danger-text'}" data-approved-void-open="${avEscape(row.id)}" data-kind="${kind}">${history ? '查看作廢歷程' : `作廢已核准${approvedVoidKinds[kind].label}`}</button>`;
}

function avRender(kind, data) {
    const { record, history } = data;
    const { label, impact } = approvedVoidKinds[kind];
    return `<section><h4>${label}申請</h4><p>單號 ${avEscape(record.id)} · ${avEscape(record.status === 'cancelled' ? '已作廢' : record.statusText || '已核准')}</p>
        <p>員工：${avEscape(record.employeeId || record.employee_id)} ${avEscape(record.employeeName)} · 申請人：${avEscape(record.applicantId || record.applicant_id || '未記錄')} ${avEscape(record.applicantName)}</p>
        ${acSnapshot(record, kind)}${renderRequestReviewProgress(record)}</section>
        <section><h4>作廢歷程</h4>${history.length ? `<ol>${history.map(event => `<li><strong>${avEscape(acActor(event.actorId))}</strong> · ${avEscape(acTime(event.voidedAt))}
            <p>作廢原因：${avEscape(event.reason)}</p><p>狀態：${avEscape(event.before?.statusText || '已核准')} → 已作廢</p></li>`).join('')}</ol>` : '<p>尚無作廢紀錄。</p>'}</section>
        ${data.canVoid && avCanVoid(kind) ? `<form data-approved-void-form class="stack-form">
            <p class="approved-void-impact">${impact}原申請、審核及更正歷程會保留。已匯出或結算的資料須另外核對。</p>
            <label class="field"><span>作廢原因（必填）</span><textarea name="reason" rows="3" maxlength="500" required></textarea></label>
            <label class="approved-void-confirm"><input type="checkbox" name="confirm" required>我已核對這張${label}單及作廢影響</label>
            <button type="submit" class="primary-btn">確認作廢</button></form>` : ''}`;
}

function avClose() {
    if (!approvedVoidDialog) return;
    const { dialog } = approvedVoidDialog;
    approvedVoidDialog = null;
    dialog.close();
    dialog.remove();
}

async function avOpen(kind, id) {
    if (approvedVoidDialog || !avCanRead(kind) || !id) return;
    const { label } = approvedVoidKinds[kind];
    const path = `/api/browser/admin/${kind}/approved-void`;
    const dialog = document.createElement('dialog');
    const current = { dialog, identity: avIdentity(), data: null, loading: false, busy: false };
    approvedVoidDialog = current;
    dialog.id = 'approved-void-dialog';
    dialog.dataset.kind = kind;
    dialog.className = 'ac-dialog approved-void-dialog';
    dialog.setAttribute('aria-labelledby', 'approved-void-title');
    dialog.innerHTML = `<header><h3 id="approved-void-title">已核准線上${label}作廢／歷程</h3><div class="ac-header-actions"><button type="button" class="outline-btn" data-approved-void-help>操作說明</button><button type="button" class="outline-btn" data-approved-void-close autofocus>關閉</button></div></header><p data-approved-void-error role="status" aria-live="polite"></p><button type="button" class="outline-btn" data-approved-void-reload hidden>重新讀取原單</button><div data-approved-void-content>讀取中…</div>`;
    const content = dialog.querySelector('[data-approved-void-content]');
    const message = dialog.querySelector('[data-approved-void-error]');
    const reload = dialog.querySelector('[data-approved-void-reload]');
    const live = () => approvedVoidDialog === current && current.identity === avIdentity() && dialog.isConnected;
    const close = () => { if (!current.busy) avClose(); };
    const load = async () => {
        if (!live() || current.loading || current.busy) return;
        current.loading = true; reload.hidden = true; message.textContent = '';
        const reason = content.querySelector('textarea')?.value;
        try {
            const result = await requestJson(`${path}?requestId=${encodeURIComponent(id)}`, { auth: true });
            if (!live()) return;
            current.data = result.voiding;
            content.innerHTML = avRender(kind, current.data);
            const textarea = content.querySelector('textarea');
            if (textarea && reason) textarea.value = reason;
        } catch (error) {
            if (live()) {
                if (!current.data) content.textContent = '';
                message.textContent = error.message; reload.hidden = false;
            }
        } finally { current.loading = false; }
    };
    dialog.querySelector('[data-approved-void-close]').onclick = close;
    dialog.querySelector('[data-approved-void-help]').onclick = () => { if (typeof openWorkbenchHelp === 'function') openWorkbenchHelp(); };
    reload.onclick = load;
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('submit', async event => {
        const form = event.target;
        if (!form.matches('[data-approved-void-form]')) return;
        event.preventDefault();
        if (!live() || current.loading || current.busy || !current.data?.canVoid || !avCanVoid(kind) || !reload.hidden || !form.reportValidity()) return;
        const reason = form.elements.reason.value.trim();
        if (!reason || reason.length > 500 || !form.elements.confirm.checked) { message.textContent = '請填作廢原因（最多 500 字）並勾選確認。'; return; }
        current.busy = true; message.textContent = '正在作廢…';
        const submit = form.querySelector('button[type="submit"]');
        submit.disabled = true;
        try {
            const result = await requestJson(path, { auth: true, method: 'POST', body: {
                requestId: id, revision: current.data.revision, reason, confirm: true
            } });
            if (!live()) return;
            current.data = result.voiding;
            content.innerHTML = avRender(kind, current.data);
            message.textContent = '已作廢，原紀錄保留。';
            await reloadDashboard(`已作廢線上${label}，原紀錄保留。`, 'success', { resetRequestKinds: [kind] });
        } catch (error) {
            if (live()) {
                message.textContent = current.data?.record.status === 'cancelled' ? '已作廢，工作台更新失敗。請重新整理工作台。' : error.message;
                if (error.status === 409 && current.data?.record.status !== 'cancelled') {
                    message.textContent += ' 請重新讀取並核對後再確認。';
                    reload.hidden = false;
                    form.elements.confirm.checked = false;
                }
            }
        } finally { current.busy = false; submit.disabled = false; }
    });
    document.body.append(dialog);
    dialog.showModal();
    await load();
}

document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-approved-void-open]');
    if (button) avOpen(button.dataset.kind, button.dataset.approvedVoidOpen);
});
const avPreviousRender = renderDashboard;
renderDashboard = function renderDashboardWithApprovedVoid(dashboard) {
    if (approvedVoidDialog && approvedVoidDialog.identity !== avIdentity(dashboard)) avClose();
    return avPreviousRender(dashboard);
};
const avPreviousLogout = handleLogout;
handleLogout = function logoutWithApprovedVoid(...args) {
    avClose();
    return avPreviousLogout(...args);
};
