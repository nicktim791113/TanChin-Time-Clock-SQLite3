'use strict';

const saToday = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const saState = { identity: '', role: '', month: saToday().slice(0, 7), data: null, loading: false, busy: false, sequence: 0, message: '', error: false, action: null, draft: {}, submitKey: '' };
const saEsc = (value) => escapeHtml(String(value ?? ''));
const saStatus = (status) => ({ pending_admin: '待管理部審核', approved: '已核准', rejected: '已退回', withdrawn: '已撤回', cancelled: '已取消' }[status] || status);
const saMoney = (value) => value == null ? '—' : `NT$ ${Number(value).toLocaleString('zh-TW')}`;
const saTime = (value) => value ? new Date(value).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }) : '—';
const saCan = (permission) => Boolean(saState.data?.permissions?.[permission]);
const saOwn = () => saState.role === 'employee';
const saRootApi = () => saOwn() ? '/api/browser/employee/salary-advances' : '/api/browser/salary-advances';
const saButton = (action, label, attrs = '', primary = false) => `<button type="button" class="${primary ? 'primary' : 'outline'}-btn" data-sa-action="${action}" ${attrs}>${saEsc(label)}</button>`;
const saInput = (label, name, value, type = 'text', attrs = '') => `<label class="field"><span>${saEsc(label)}</span><input name="${name}" type="${type}" value="${saEsc(value)}" ${attrs}></label>`;
const saNote = (label, name, value = '', required = false) => `<label class="field"><span>${saEsc(label)}</span><textarea name="${name}" maxlength="500" rows="2" ${required ? 'required' : ''}>${saEsc(value)}</textarea></label>`;
function saNewSubmissionKey() {
    if (typeof window.crypto?.randomUUID === 'function') return window.crypto.randomUUID();
    // randomUUID requires HTTPS, but getRandomValues is also available on the company's HTTP LAN origin.
    if (typeof window.crypto?.getRandomValues !== 'function') throw new Error('此瀏覽器無法產生送件識別碼，請更新瀏覽器後再試。');
    const bytes = new Uint8Array(16); window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function saReset(identity = '') {
    Object.assign(saState, { identity, role: '', month: saToday().slice(0, 7), data: null, loading: false, busy: false, sequence: saState.sequence + 1, message: '', error: false, action: null, draft: {}, submitKey: '' });
}
function saHelp() {
    return `<details class="sa-help"><summary>借支申請操作說明</summary><ol><li>在活動開放期間填入整數新臺幣金額，核對後送交管理部；不經主管審核，也不開放主管代辦。</li><li>每月有效筆數只計待審及已核准申請；退回、撤回及取消不占有效筆數。未過截止時間時可重新送出。</li><li>待審申請可自行撤回；已核准需聯絡管理部。既有申請保留送件時的活動規則，不因後續設定變更而自動改額。</li><li>管理部核准只表示申請通過，實際發放與薪資扣回須依公司後續作業；此頁不會發放款項或扣薪。</li><li>管理者總表包含各狀態明細，核准總額排除已取消申請；ERP 可讀取修訂與取消紀錄，管理部仍須核對實際發放。</li></ol></details>`;
}
function saSubmission() {
    const data = saState.data, rules = data.settings, window = data.window, enabled = window.isOpen;
    return `<section class="sa-card"><h4>本月借支申請</h4><p>${saEsc(window.applicationMonth)} 登記期間：<strong>${saEsc(window.opensOn)} 至 ${saEsc(window.closesOn)} 23:59（臺北時間）</strong></p><p>單筆上限 ${saMoney(rules.maxAmount)}；每月待審與核准合計上限 ${rules.maxActivePerMonth ?? '待設定'} 筆。${rules.deductionMonthOffset == null ? '扣回月份由管理部另行確認。' : `預計於申請月後 ${rules.deductionMonthOffset} 個月扣回，實際發放仍須確認。`}</p>
        ${enabled ? `<form data-sa-form="submit"><div class="sa-grid">${saInput('申請金額（新臺幣元）', 'requestedAmount', saState.draft.requestedAmount || '', 'number', `required min="1" max="${rules.maxAmount}" step="1" inputmode="numeric"`)}${saNote('申請備註（選填）', 'note', saState.draft.note || '')}</div><p class="sa-note">請確認金額及活動規則；送出後由管理部審核。</p><button class="primary-btn" type="submit">送交管理部審核</button></form>` : `<p class="sa-notice">${rules.enabled ? '目前不在開放登記期間。' : '目前借支活動尚未啟用，請聯絡管理部。'}</p>`}</section>`;
}
function saSettings() {
    if (!saCan('settings')) return '';
    const s = saState.data.settings, draft = saState.draft.settings || s;
    return `<details class="sa-card"><summary><strong>活動設定</strong></summary><p>每月依下列日期開放；月份沒有指定日期時，採該月最後一天。金額及筆數未設定前不可啟用。修改只影響之後新送出的申請。</p>
        <form data-sa-form="settings"><label class="sa-check"><input type="checkbox" name="enabled" ${draft.enabled ? 'checked' : ''}>啟用每月借支登記</label><div class="sa-grid">${saInput('每月開始日', 'startDay', draft.startDay, 'number', 'required min="1" max="31" step="1"')}${saInput('每月截止日（含當日）', 'endDay', draft.endDay, 'number', 'required min="1" max="31" step="1"')}${saInput('單筆金額上限（新臺幣元）', 'maxAmount', draft.maxAmount ?? '', 'number', 'min="1" max="1000000000" step="1" placeholder="請填已確認的公司上限"')}${saInput('每月有效申請筆數上限', 'maxActivePerMonth', draft.maxActivePerMonth ?? '', 'number', 'min="1" max="12" step="1" placeholder="請填已確認筆數"')}<label class="field"><span>預計扣回月份</span><select name="deductionMonthOffset">${[['', '尚待確認'], ...Array.from({ length: 13 }, (_, n) => [String(n), n === 0 ? '申請當月' : `申請月後 ${n} 個月`])].map(([value, label]) => `<option value="${value}" ${String(draft.deductionMonthOffset ?? '') === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>${saNote('設定原因', 'reason', draft.reason || '', true)}</div><button class="primary-btn" type="submit">儲存活動設定</button></form></details>`;
}
function saActionForm() {
    if (!saState.action) return '';
    const { kind, requestId } = saState.action, row = saState.data.requests.find((r) => r.requestId === requestId);
    if (!row) return '';
    const label = { review: '管理部審核', withdraw: '撤回申請', cancel: '取消申請' }[kind];
    const saved = saState.draft.action, draft = saved?.kind === kind && saved?.requestId === requestId ? saved.values : {};
    const decision = draft.decision || 'approved';
    return `<section class="sa-card sa-decision" role="region" aria-label="${label}"><h4>${label}：${saEsc(row.employeeId)} ${saEsc(row.employeeName)}</h4><p>申請 ${saMoney(row.requestedAmount)} · ${saEsc(row.applicationMonth)} · ${saEsc(row.requestId)}</p><form data-sa-form="${kind}" data-sa-id="${saEsc(requestId)}" data-sa-revision="${row.revision}"><div class="sa-grid">${kind === 'review' ? `<label class="field"><span>審核結果</span><select name="decision"><option value="approved" ${decision === 'approved' ? 'selected' : ''}>核准</option><option value="rejected" ${decision === 'rejected' ? 'selected' : ''}>退回</option></select></label>${saInput('核准金額（退回時不使用）', 'approvedAmount', draft.approvedAmount ?? row.requestedAmount, 'number', `min="1" max="${row.requestedAmount}" step="1"`)}` : ''}${saNote(kind === 'review' ? '審核說明' : '操作原因', 'reason', draft.reason || '', true)}</div>${kind === 'cancel' ? '<p class="sa-notice">若 ERP 已入借支帳或薪資，取消來源申請後仍須在 ERP 核對差異，不會自動沖回已發放款項。</p>' : ''}<div class="sa-actions"><button class="primary-btn" type="submit">確認${label}</button>${saButton('dismiss', '返回')}</div></form></section>`;
}
function saRequests() {
    const rows = saState.data.requests;
    if (!rows.length) return '<p class="sa-empty">此月份尚無借支申請。</p>';
    return `<div class="sa-table-wrap"><table class="sa-table"><thead><tr>${saOwn() ? '' : '<th>員工</th>'}<th>月份／單號</th><th>申請／核准金額</th><th>狀態</th><th>說明／時間</th><th>操作</th></tr></thead><tbody>${rows.map((r) => `<tr>${saOwn() ? '' : `<td>${saEsc(r.employeeId)} ${saEsc(r.employeeName)}<small>${saEsc(r.department)}</small></td>`}<td>${saEsc(r.applicationMonth)}<small>${saEsc(r.requestId)}</small><small>扣回月份：${saEsc(r.deductionMonth || '待確認')}</small></td><td>${saMoney(r.requestedAmount)}<small>核准：${saMoney(r.approvedAmount)}</small></td><td><span class="sa-status sa-status-${saEsc(r.status)}">${saEsc(saStatus(r.status))}</span>${r.status === 'approved' ? '<small>核准不表示已發放</small>' : ''}</td><td>${r.status === 'cancelled' ? `<div>取消原因：${saEsc(r.cancellationReason)}</div>` : ''}${r.status === 'withdrawn' ? `<div>撤回原因：${saEsc(r.withdrawalReason)}</div>` : ''}${r.reviewNote ? `<div>審核說明：${saEsc(r.reviewNote)}</div>` : ''}${r.note ? `<div>申請備註：${saEsc(r.note)}</div>` : ''}<small>送出 ${saEsc(saTime(r.submittedAt))}</small><small>更新 ${saEsc(saTime(r.updatedAt))} · v${r.revision}</small></td><td><div class="sa-actions">${saOwn() && r.status === 'pending_admin' ? saButton('withdraw', '撤回', `data-sa-id="${saEsc(r.requestId)}"`) : ''}${!saOwn() && saCan('review') && r.status === 'pending_admin' ? saButton('review', '審核', `data-sa-id="${saEsc(r.requestId)}"`, true) : ''}${!saOwn() && saCan('review') && ['pending_admin', 'approved'].includes(r.status) ? saButton('cancel', '取消', `data-sa-id="${saEsc(r.requestId)}"`) : ''}</div></td></tr>`).join('')}</tbody></table></div>`;
}
function renderSalaryAdvanceWorkspace(role) {
    const nextRole = role || state.dashboard?.role || 'employee';
    const identity = `${state.token}/${nextRole}/${state.dashboard?.user?.id || ''}`;
    if (saState.identity !== identity) { saReset(identity); saState.role = nextRole; }
    const data = saState.data;
    return `<section id="salary-advance-workspace" class="sa-workspace" aria-label="借支申請"><div class="sa-header"><div><h3>${saOwn() ? '借支申請' : '借支申請管理'}</h3><p>員工登記 → 管理部審核 → 後續發放核對</p></div>${saButton('refresh', '重新整理')}</div><div class="sa-message ${saState.error ? 'sa-error' : ''}" role="status" aria-live="polite">${saEsc(saState.message)}</div>${saHelp()}${!data ? '<p>正在讀取借支申請…</p>' : `${saOwn() ? saSubmission() : `<div class="sa-summary"><span>申請筆數 <strong>${data.summary.count}</strong></span><span>待審 <strong>${data.summary.pendingCount}</strong></span><span>有效申請 <strong>${saMoney(data.summary.requestedAmount)}</strong></span><span>核准合計 <strong>${saMoney(data.summary.approvedAmount)}</strong></span></div>${saSettings()}`}<section class="sa-card"><div class="sa-toolbar">${saInput('查看登記月份', 'applicationMonth', saState.month, 'month', 'data-sa-month min="2020-01" max="2100-12"')}${!saOwn() && saCan('export') ? saButton('export', '下載 Excel 總表及明細') : ''}</div>${saActionForm()}${saRequests()}</section>`}</section>`;
}
function saPaint() {
    const root = document.getElementById('salary-advance-workspace');
    if (root) { root.outerHTML = renderSalaryAdvanceWorkspace(saState.role); saBusy(saState.busy); }
}
function saBusy(value) {
    saState.busy = value;
    document.querySelectorAll('#salary-advance-workspace button, #salary-advance-workspace input, #salary-advance-workspace textarea, #salary-advance-workspace select').forEach((node) => { node.disabled = value; });
}
async function saLoad() {
    const sequence = ++saState.sequence, identity = saState.identity;
    saState.loading = true;
    try {
        const data = await requestJson(`${saRootApi()}?applicationMonth=${encodeURIComponent(saState.month)}`, { auth: true });
        if (sequence !== saState.sequence || identity !== saState.identity) return;
        saState.data = data;
    } catch (error) {
        if (sequence !== saState.sequence || identity !== saState.identity) return;
        saState.message = error.message || '讀取失敗，請重新整理。'; saState.error = true;
    } finally {
        if (sequence === saState.sequence && identity === saState.identity) { saState.loading = false; saPaint(); }
    }
}
const saPreviousPostRender = postRenderSetup;
postRenderSetup = function setupSalaryAdvances() {
    saPreviousPostRender();
    if (document.getElementById('salary-advance-workspace') && !saState.data && !saState.loading) saLoad();
};
const saPreviousLogout = handleLogout;
handleLogout = function logoutSalaryAdvances(...args) { saReset(); return saPreviousLogout(...args); };
const saPreviousDashboard = renderDashboard;
renderDashboard = function renderSalaryAdvanceIdentity(dashboard) {
    const role = dashboard?.role || '';
    if (saState.identity && saState.identity !== `${state.token}/${role}/${dashboard?.user?.id || ''}`) saReset();
    return saPreviousDashboard(dashboard);
};
document.addEventListener('input', (event) => {
    const form = event.target.closest('[data-sa-form]');
    if (!form || saState.busy) return;
    if (form.dataset.saForm === 'submit') {
        saState.draft.requestedAmount = form.elements.requestedAmount.value;
        saState.draft.note = form.elements.note.value;
        saState.submitKey = '';
    } else if (form.dataset.saForm === 'settings') {
        saState.draft.settings = Object.fromEntries(new FormData(form));
        saState.draft.settings.enabled = form.elements.enabled.checked;
    } else if (['review', 'withdraw', 'cancel'].includes(form.dataset.saForm)) {
        saState.draft.action = { kind: form.dataset.saForm, requestId: form.dataset.saId, values: Object.fromEntries(new FormData(form)) };
    }
});
document.addEventListener('change', async (event) => {
    if (!event.target.matches('[data-sa-month]') || saState.busy) return;
    if (!/^\d{4}-\d{2}$/.test(event.target.value)) return;
    saState.month = event.target.value; saState.action = null; await saLoad();
});
document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-sa-action]');
    if (!button || saState.busy) return;
    const action = button.dataset.saAction;
    if (action === 'refresh') { saState.message = ''; saState.error = false; await saLoad(); return; }
    if (action === 'dismiss') { saState.action = null; delete saState.draft.action; saPaint(); return; }
    if (['review', 'withdraw', 'cancel'].includes(action)) { saState.action = { kind: action, requestId: button.dataset.saId }; delete saState.draft.action; saPaint(); document.querySelector('.sa-decision')?.scrollIntoView({ block: 'nearest' }); return; }
    if (action !== 'export') return;
    const identity = saState.identity; saBusy(true);
    try {
        const response = await fetch(`/api/browser/salary-advances/export?applicationMonth=${encodeURIComponent(saState.month)}`, { headers: { Authorization: `Bearer ${state.token}` } });
        if (!response.ok) { const result = await response.json(); throw new Error(result.error || '匯出失敗。'); }
        const blob = await response.blob();
        if (identity !== saState.identity) return;
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = `借支申請總表-${saState.month}.xlsx`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        saState.message = '已下載借支總表及明細；內容不代表已發放或已扣薪。'; saState.error = false;
    } catch (error) { if (identity === saState.identity) { saState.message = error.message; saState.error = true; } }
    finally { if (identity === saState.identity) { saBusy(false); saPaint(); } }
});
document.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-sa-form]');
    if (!form) return;
    event.preventDefault(); if (saState.busy) return;
    const operation = form.dataset.saForm, values = Object.fromEntries(new FormData(form)), identity = saState.identity;
    let body;
    if (operation === 'submit') {
        try { saState.submitKey ||= saNewSubmissionKey(); } catch (error) { saState.message = error.message; saState.error = true; saPaint(); return; }
        body = { requestedAmount: Number(values.requestedAmount), note: values.note, applicationMonth: saState.data.window.applicationMonth, idempotencyKey: saState.submitKey };
    } else if (operation === 'settings') {
        const optional = (name) => values[name] === '' ? null : Number(values[name]);
        body = { revision: saState.data.settings.revision, enabled: form.elements.enabled.checked, startDay: Number(values.startDay), endDay: Number(values.endDay), maxAmount: optional('maxAmount'), maxActivePerMonth: optional('maxActivePerMonth'), deductionMonthOffset: optional('deductionMonthOffset'), reason: values.reason };
    } else {
        saState.draft.action = { kind: operation, requestId: form.dataset.saId, values };
        body = { requestId: form.dataset.saId, revision: Number(form.dataset.saRevision), reason: values.reason };
        if (operation === 'review') { body.decision = values.decision; if (values.decision === 'approved') body.approvedAmount = Number(values.approvedAmount); }
    }
    saBusy(true);
    try {
        const result = await requestJson(`${saRootApi()}/${operation}`, { method: 'POST', auth: true, body });
        if (identity !== saState.identity) return;
        saState.message = result.message || '已完成。'; saState.error = false; saState.action = null; saState.draft = {}; saState.submitKey = '';
        if (operation === 'submit') saState.month = saState.data.window.applicationMonth;
        await saLoad();
    } catch (error) { if (identity === saState.identity) { saState.message = error.message || '作業失敗，請重新整理後再試。'; saState.error = true; } }
    finally { if (identity === saState.identity) { saBusy(false); saPaint(); } }
});
