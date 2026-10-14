const leState = { identity: '', data: null, year: new Date(Date.now() + 8 * 3600000).getUTCFullYear(), typeId: 'annual', preview: null, body: null, loading: false, busy: false, dirty: false, sequence: 0, error: '' };
auditActionLabels.leave_entitlement = '設定假別額度';
auditActionLabels.leave_entitlement_settings = '額度制度設定';
auditActionLabels.leave_entitlement_allocation = '每日扣抵分配';
auditTargetTypeLabels.leave_entitlement = '假別額度';
const leEscape = (value) => escapeHtml(String(value ?? ''));
const leNumber = (value) => value == null ? '待確認' : Number(value.toFixed(2)).toString();
const leCanManage = () => state.dashboard?.role === 'system_admin' || hasCurrentAdminPermission('admin.leave.balances.manage');
const leField = (label, name, type, value, attributes = '') => `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${leEscape(value)}" ${attributes}></label>`;
function leBalanceTable(rows, people = [], types = [], preview = false) {
    if (!rows.length) return '<p class="helper-text">尚未設定假別額度；不代表沒有請假權利。</p>';
    const typeName = (row) => types.find((t) => t.id === row.leave_type_id)?.name || state.dashboard?.leave?.leaveTypes?.find((t) => t.id === row.leave_type_id)?.name || row.leave_type_id;
    const table = `<div class="le-table-scroll"><table class="le-table"><thead><tr>${people.length ? '<th>員工</th>' : ''}<th>假別</th><th>年度</th><th>額度小時</th><th>結轉</th><th>調整</th><th>已核准</th><th>待審預占</th><th>可用小時</th><th>可用天數</th><th>扣抵起日</th>${preview ? '<th>設定原因</th>' : ''}</tr></thead><tbody>${rows.map((r) => `<tr>
        ${people.length ? `<td>${leEscape(r.employee_id)} ${leEscape(people.find((e) => e.id === r.employee_id)?.name)}</td>` : ''}
        <td>${leEscape(types.find((t) => t.id === r.leave_type_id)?.name || state.dashboard?.leave?.leaveTypes?.find((t) => t.id === r.leave_type_id)?.name || r.leave_type_id)}<small>${leNumber(r.dayHours)} 小時／日</small></td>
        <td>${r.year}</td><td>${leNumber(r.grantHours)}</td><td>${leNumber(r.carryHours)}</td><td>${leNumber(r.adjustmentHours)}</td><td>${leNumber(r.usedHours)}</td><td>${leNumber(r.heldHours)}</td>
        <td class="${r.availableHours < 0 ? 'le-warning' : ''}">${leNumber(r.availableHours)}</td><td>${leNumber(r.availableDays)}</td><td>${leEscape(r.accounting_start)}<small>${r.mode === 'remaining' ? '期中剩餘額度' : '全年總額'}</small></td>${preview ? `<td class="le-reason">${leEscape(r.reason)}</td>` : ''}</tr>
        ${r.warnings?.length ? `<tr><td colspan="${(people.length ? 11 : 10) + (preview ? 1 : 0)}" class="le-warning">${r.warnings.map(leEscape).join('<br>')}</td></tr>` : ''}`).join('')}</tbody></table></div>`;
    if (people.length || preview) return table;
    return `<h4>${rows[0].year} 年假別餘額</h4><table class="le-table le-own-table"><thead><tr><th>假別</th><th>可用</th><th>已核准</th><th>預占</th></tr></thead><tbody>${rows.map((r) => `<tr>
        <td>${leEscape(typeName(r))}<small>${leNumber(r.dayHours)} 小時／日</small></td>
        <td class="${r.availableHours < 0 || r.availableHours == null ? 'le-warning' : ''}">${leNumber(r.availableHours)}${r.availableHours == null ? '' : ' 小時'}<small>${r.availableDays == null ? '需管理者確認' : `${leNumber(r.availableDays)} 天`}</small></td>
        <td>${leNumber(r.usedHours)} 小時</td><td>${leNumber(r.heldHours)} 小時</td></tr>`).join('')}</tbody></table><details class="le-own-details"><summary>額度明細</summary>${table}</details>`;
}
function renderLeaveEntitlementWorkspace() {
    const data = leState.data, manage = leCanManage();
    return `<section id="leave-entitlement-workspace" class="le-workspace" aria-label="假別額度">
        <div class="list-toolbar"><h3>假別額度</h3><button class="outline-btn" type="button" data-action="le-refresh" ${leState.busy ? 'disabled' : ''}>重新整理</button></div>
        <div class="inline-message le-message" aria-live="polite">${leEscape(leState.error)}</div>
        ${!data ? '<p role="status">讀取額度資料中…</p>' : `
        <div class="le-controls">${leField('年度（1 月至 12 月）', 'year', 'number', leState.year, 'min="2000" max="2100" data-le-year')}
        <label class="field"><span>假別</span><select data-le-type>${data.leaveTypes.map((t) => `<option value="${leEscape(t.id)}" ${leState.typeId === t.id ? 'selected' : ''}>${leEscape(t.name)}${t.enabled ? '' : '（停用）'}</option>`).join('')}</select></label>
        <button class="outline-btn" type="button" data-action="le-export">匯出 Excel 填寫表</button>
        ${manage ? '<label class="field"><span>匯入 Excel 預覽</span><input type="file" data-le-import accept=".xlsx"></label>' : ''}</div>
        ${manage ? `<form data-le-form="settings" class="le-controls">
            <label class="field"><span>年度制度</span><select name="period"><option value="calendar_year">曆年制（1 月至 12 月）</option></select></label>
            ${leField('新設定每日工時', 'dayHours', 'number', data.settings.dayHours, 'min="1" max="24" step="0.01" required')}
            ${leField('制度設定原因', 'reason', 'text', '', 'maxlength="500" required')}
            <label class="le-confirm"><input name="confirm" type="checkbox" required>確認更新新年度換算工時</label><button class="primary-btn" type="submit">儲存制度</button></form>
        <form data-le-form="batch" class="stack-form">
            ${renderAdminPaperEmployeePicker(data.employees, '設定額度的員工', [], { maxSelection: 100 })}
            <div class="le-controls"><label class="field"><span>設定方式</span><select name="mode"><option value="total">全年總額</option><option value="remaining">期中剩餘額度</option></select></label>
            ${leField('扣抵起日', 'accountingStart', 'date', `${leState.year}-01-01`, 'required')}
            ${leField('額度天數', 'grantDays', 'number', '', 'min="0" step="0.01" required')}
            ${leField('結轉小時', 'carryHours', 'number', '0', 'min="0" step="0.01" required')}
            ${leField('調整小時', 'adjustmentHours', 'number', '0', 'step="0.01" required')}
            ${leField('設定原因', 'reason', 'text', '', 'maxlength="500" required')}
            <button class="primary-btn" type="submit">預覽額度更新</button></div></form>` : ''}
        ${leState.preview ? `<section class="le-preview"><h4>待儲存額度 ${leState.preview.rows.length} 筆</h4>${leBalanceTable(leState.preview.rows, data.employees, data.leaveTypes, true)}
            <form data-le-form="save" class="le-controls"><label class="le-confirm"><input type="checkbox" name="confirm" required>確認上述額度、扣抵起日及既有時數</label><button type="submit" class="primary-btn">確認儲存全部額度</button><button type="button" class="outline-btn" data-action="le-cancel">取消預覽</button></form></section>` : ''}
        <section><h4>${leState.year} 年目前餘額</h4>${leBalanceTable(data.balances.filter((b) => b.leave_type_id === leState.typeId), data.employees, data.leaveTypes)}</section>
        ${manage ? `<details class="le-allocation"><summary>舊單／跨年每日扣抵分配</summary><form data-le-form="allocate" class="stack-form">
            <div class="le-controls">${leField('原請假單編號', 'requestId', 'text', '', 'required')}${leField('分配原因', 'reason', 'text', '', 'maxlength="500" required')}</div>
            <label class="field"><span>每日實際請假時數</span><textarea name="dailyHours" rows="3" required placeholder="2026-12-31=8&#10;2027-01-04=8" title="加總須等於原單時數；只變更扣抵分配，不改寫原請假單。"></textarea></label>
            <div class="le-controls"><label class="le-confirm"><input type="checkbox" name="confirm" required>確認每日分配及整筆時數一致</label><button type="submit" class="primary-btn">儲存扣抵分配</button></div></form></details>` : ''}`}
    </section>`;
}
function lePaint() { const root = document.getElementById('leave-entitlement-workspace'); if (root) { root.outerHTML = renderLeaveEntitlementWorkspace(); document.querySelectorAll('#leave-entitlement-workspace [data-paper-employee-field]').forEach(syncAdminPaperEmployeePicker); if (leState.busy) document.querySelectorAll('#leave-entitlement-workspace input, #leave-entitlement-workspace select, #leave-entitlement-workspace textarea, #leave-entitlement-workspace button').forEach((element) => { element.disabled = true; }); } }
function leMessage(message, type = 'error') { const target = document.querySelector('.le-message') || ui.dashboardMessage; setMessage(target, message, type); if (target !== ui.dashboardMessage) target.classList.add('le-message'); }
async function leLoad() {
    const identity = leState.identity, sequence = ++leState.sequence; leState.loading = true;
    try {
        const result = await requestJson(`/api/browser/leave-entitlements?year=${leState.year}`, { auth: true });
        if (identity !== leState.identity || sequence !== leState.sequence) return;
        leState.data = result.entitlements; leState.error = '';
        if (!leState.data.leaveTypes.some((t) => t.id === leState.typeId)) leState.typeId = leState.data.leaveTypes[0]?.id || '';
        lePaint();
    } catch (error) { if (identity === leState.identity && sequence === leState.sequence) { leState.error = error.message; lePaint(); } }
    finally { if (identity === leState.identity && sequence === leState.sequence) leState.loading = false; }
}
async function leDiscard() {
    if (!leState.dirty && !leState.preview) return true;
    if (document.querySelector('.le-discard')) return false;
    return new Promise((resolve) => {
        const dialog = document.createElement('dialog'); dialog.className = 'le-discard';
        dialog.innerHTML = '<p>尚有未儲存的額度設定，確定捨棄？</p><div class="inline-actions"><button type="button" data-le-discard="no" class="outline-btn">繼續編輯</button><button type="button" data-le-discard="yes" class="primary-btn">捨棄</button></div>';
        const finish = (yes) => { dialog.close(); dialog.remove(); resolve(yes); };
        dialog.addEventListener('cancel', (event) => { event.preventDefault(); finish(false); });
        dialog.addEventListener('click', (event) => { const button = event.target.closest('[data-le-discard]'); if (button) finish(button.dataset.leDiscard === 'yes'); });
        document.body.append(dialog); dialog.showModal();
    });
}
const lePrevRender = renderDashboard;
renderDashboard = function renderWithLeaveEntitlements(dashboard) {
    const identity = `${state.token}/${dashboard.role}/${dashboard.user?.id || ''}`;
    if (identity !== leState.identity) Object.assign(leState, { identity, data: null, preview: null, body: null, dirty: false, busy: false, loading: false, error: '', sequence: leState.sequence + 1 });
    return lePrevRender(dashboard);
};
const lePrevSystem = renderSystemAdminDashboard;
renderSystemAdminDashboard = function renderSystemWithLeaveEntitlements(dashboard) { return `${lePrevSystem(dashboard)}${renderLeaveEntitlementWorkspace()}`; };
let leEmployeeSequence = 0;
const lePrevPost = postRenderSetup;
postRenderSetup = function postRenderWithLeaveEntitlements() {
    lePrevPost();
    if (document.getElementById('leave-entitlement-workspace') && !leState.data && !leState.loading && !leState.error) leLoad();
    const root = document.getElementById('employee-leave-balances');
    if (root) {
        const sequence = ++leEmployeeSequence, identity = leState.identity;
        requestJson(`/api/browser/employee/leave/balances?year=${new Date(Date.now() + 8 * 3600000).getUTCFullYear()}`, { auth: true }).then((result) => {
            if (sequence === leEmployeeSequence && identity === leState.identity && root.isConnected) root.innerHTML = leBalanceTable(result.balances);
        }).catch((error) => { if (root.isConnected && identity === leState.identity) root.textContent = error.message; });
    }
};
const lePrevClick = handleDashboardClick;
handleDashboardClick = async function clickLeaveEntitlements(event) {
    const button = event.target.closest('[data-action]'), action = button?.dataset.action;
    if (leState.busy && button?.closest('#leave-entitlement-workspace')) { event.preventDefault(); return; }
    if (action?.startsWith('le-')) {
        event.preventDefault();
        if (action === 'le-export') {
            try {
                const response = await fetch(`/api/browser/leave-entitlements/export?year=${leState.year}&leaveTypeId=${encodeURIComponent(leState.typeId)}`, { headers: { Authorization: `Bearer ${state.token}` } });
                if (!response.ok) throw new Error((await response.json()).error);
                const url = URL.createObjectURL(await response.blob()), link = document.createElement('a'); link.href = url; link.download = `假別額度-${leState.year}.xlsx`; link.click(); URL.revokeObjectURL(url);
            } catch (error) { leMessage(error.message); } return;
        }
        if (!await leDiscard()) return;
        leState.dirty = false; leState.preview = null; leState.body = null;
        if (action === 'le-refresh') { leState.data = null; await leLoad(); } else lePaint(); return;
    }
    if (leState.dirty && button && (action?.includes('workspace') || action?.includes('section') || action === 'logout')) {
        if (!await leDiscard()) { event.preventDefault(); return; } leState.dirty = false; leState.preview = null;
    }
    if (['paper-select-visible-employees', 'paper-clear-employees'].includes(action) && button.closest('[data-le-form]')) leState.dirty = true;
    return lePrevClick(event);
};
const lePrevChange = handleDashboardChange;
handleDashboardChange = async function changeLeaveEntitlements(event) {
    const target = event.target;
    if (target.id === 'workspace-switch' && (leState.dirty || leState.preview)) {
        if (!await leDiscard()) { target.value = state.dashboard.role; return; } leState.dirty = false; leState.preview = null;
    }
    if (target.matches('[data-le-year], [data-le-type], [data-le-import]')) {
        if (leState.busy) return;
        if (!await leDiscard()) { if (target.matches('[data-le-year]')) target.value = leState.year; if (target.matches('[data-le-type]')) target.value = leState.typeId; if (target.matches('[data-le-import]')) target.value = ''; return; }
        leState.dirty = false; leState.preview = null; leState.body = null;
        if (target.matches('[data-le-year]')) { leState.year = Number(target.value); leState.data = null; await leLoad(); }
        else if (target.matches('[data-le-type]')) { leState.typeId = target.value; lePaint(); }
        else {
            const file = target.files?.[0]; if (!file) return;
            if (file.size > 5 * 1024 * 1024 || !file.name.toLowerCase().endsWith('.xlsx')) { leMessage('請選擇小於 5 MB 的 .xlsx 檔案。'); return; }
            await leWork(async (current) => {
                const content = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = reject; reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.readAsDataURL(file); });
                const result = await requestJson('/api/browser/leave-entitlements/import-preview', { auth: true, method: 'POST', body: { content } });
                if (!current()) return;
                leState.body = { rows: result.rows, revision: result.revision }; leState.preview = result.preview; leState.dirty = true; lePaint();
            });
        } return;
    }
    if (target.closest('[data-le-form]') && !target.closest('[data-le-form="save"]') && !target.matches('[data-paper-employee-height], [data-paper-employee-department]')) {
        leState.dirty = true; leState.preview = null; leState.body = null;
        if (!target.closest('[data-le-form="save"]')) document.querySelector('.le-preview')?.remove();
    }
    return lePrevChange(event);
};
async function leWork(callback) {
    const identity = leState.identity, controls = [...(document.querySelectorAll('#leave-entitlement-workspace input, #leave-entitlement-workspace select, #leave-entitlement-workspace textarea, #leave-entitlement-workspace button'))].map((element) => [element, element.disabled]);
    leState.busy = true; controls.forEach(([element]) => { element.disabled = true; });
    try { await callback(() => identity === leState.identity); } catch (error) { if (identity === leState.identity) leMessage(error.message); }
    finally { if (identity === leState.identity) { leState.busy = false; document.querySelectorAll('#leave-entitlement-workspace input, #leave-entitlement-workspace select, #leave-entitlement-workspace textarea, #leave-entitlement-workspace button').forEach((element) => { element.disabled = controls.find(([previous]) => previous === element)?.[1] || false; }); } }
}
const lePrevSubmit = handleDashboardSubmit;
handleDashboardSubmit = async function submitLeaveEntitlements(event) {
    const form = event.target.closest('[data-le-form]'); if (!form) return lePrevSubmit(event);
    event.preventDefault(); if (leState.busy) return;
    const fields = new FormData(form), kind = form.dataset.leForm, values = Object.fromEntries(fields);
    await leWork(async (current) => {
        if (kind === 'batch') {
            const ids = fields.getAll('employeeIds'); if (!ids.length || ids.length > 100) throw new Error('請選擇 1 至 100 位員工。');
            const body = { revision: leState.data.revision, rows: ids.map((employeeId) => {
                const previous = leState.data.balances.find((b) => b.employee_id === employeeId && b.leave_type_id === leState.typeId);
                return { ...values, employeeId, leaveTypeId: leState.typeId, year: leState.year, dayHours: previous?.dayHours || leState.data.settings.dayHours };
            }) };
            const result = await requestJson('/api/browser/leave-entitlements/preview', { auth: true, method: 'POST', body });
            if (!current()) return;
            leState.body = body; leState.preview = result.preview; leState.dirty = true; lePaint(); return;
        }
        let body = kind === 'save' ? { ...leState.body, digest: leState.preview?.digest, confirm: fields.has('confirm') } : { ...values, confirm: fields.has('confirm'), revision: kind === 'settings' ? leState.data.settings.revision : leState.data.revision };
        if (kind === 'allocate') body.usageRevision = leState.data.usageRevision;
        const result = await requestJson(`/api/browser/leave-entitlements/${kind}`, { auth: true, method: 'POST', body });
        if (!current()) return;
        leState.dirty = false; leState.preview = null; leState.body = null; await leLoad(); leMessage(result.message, 'success');
    });
};
document.addEventListener('input', (event) => {
    if (!leState.busy && event.target.closest('[data-le-form]') && !event.target.matches('[data-paper-employee-search], [data-paper-employee-height]')) {
        leState.dirty = true; if (!event.target.closest('[data-le-form="save"]')) { leState.preview = null; leState.body = null; document.querySelector('.le-preview')?.remove(); }
    }
});
const lePrevSync = handleRealtimeSyncMessage;
handleRealtimeSyncMessage = async function syncLeaveEntitlements(payload) {
    if (['leaveEntitlements', 'leaveRequests', 'leaveSettings', 'employees'].includes(payload?.type)) {
        if (payload.sessionToken === state.token && leState.busy) return;
        leEmployeeSequence++;
        if (document.getElementById('leave-entitlement-workspace')) {
            if (leState.dirty || leState.preview || leState.busy) { leMessage('額度、請假或名冊有異動，草稿已保留；請重新整理後預覽。', 'info'); return; }
            await leLoad(); if (payload.type === 'leaveEntitlements') return;
        } else leState.data = null;
        if (payload.type === 'leaveEntitlements') return reloadDashboard();
    }
    return lePrevSync(payload);
};
const lePrevLogout = handleLogout;
handleLogout = function logoutLeaveEntitlements(...args) { leEmployeeSequence++; Object.assign(leState, { identity: '', data: null, preview: null, body: null, dirty: false, error: '', sequence: leState.sequence + 1 }); return lePrevLogout(...args); };
