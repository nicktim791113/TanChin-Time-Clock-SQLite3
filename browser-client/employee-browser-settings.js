const employeeBrowserSettingsUi = { busy: false, sequence: 0 };
const employeePunchHistoryModes = { recent7: '近 7 日紀錄', current_month: '當月紀錄', current_previous_month: '當月紀錄＋上月紀錄' };
function ebsIdentity() { return `${state.token}/${state.dashboard?.role}/${state.dashboard?.user?.id || ''}/${Boolean(state.dashboard?.impersonation?.active)}`; }
function ebsData() { return state.dashboard?.datasets?.security?.employeeBrowserSettings || state.dashboard?.datasets?.employeeBrowserSettings; }
function ebsCanManage() { return !state.dashboard?.impersonation?.active && (state.dashboard?.role === 'system_admin' || hasCurrentAdminPermission('admin.security.manage')); }
function ebsSetData(data) {
    const datasets = state.dashboard?.datasets;
    if (!datasets) return;
    if (datasets.security) datasets.security.employeeBrowserSettings = data;
    if (state.dashboard.role === 'system_admin') datasets.employeeBrowserSettings = data;
}
function renderEmployeeBrowserSettings(data, kind) {
    if (!data) return '';
    const history = kind === 'history', editable = ebsCanManage(), title = history ? '每位員工的打卡紀錄可見範圍' : '每位員工的裝置上限';
    return `<section class="ebs-panel" aria-label="${title}"><h3>${title}</h3>
        <p class="helper-text">${history ? '預設僅顯示本人近 7 日紀錄；可個別開放當月或當月加上月，以台北日期計算至目前時間。上方近 7 日摘要不隨此範圍改變。' : '未個別設定者沿用全域上限；個別可設 1～4 台。降低上限不解除既有合法裝置，只會限制新增綁定。'}</p>
        <form data-ebs-kind="${kind}" class="stack-form">
            <input type="hidden" name="revision" value="${escapeHtml(data.revision)}">
            <label class="field ebs-search"><span>搜尋員工</span><input type="search" data-ebs-search aria-label="${title}搜尋" placeholder="工號、姓名或部門"></label>
            <div class="ebs-table-scroll"><table class="ebs-table"><thead><tr><th>員工</th><th>部門</th>${history ? '<th>可查閱本人打卡紀錄</th>' : '<th>已綁裝置</th><th>個別裝置上限</th><th>生效上限</th>'}</tr></thead><tbody>
                ${data.employees.map((row) => `<tr data-ebs-id="${escapeHtml(row.id)}"><td><strong>${escapeHtml(row.id)}</strong> ${escapeHtml(row.name)}</td><td>${escapeHtml(row.department || '—')}</td>${history
                    ? `<td><select data-ebs-value aria-label="${escapeHtml(row.id)} 打卡紀錄可見範圍" ${editable ? '' : 'disabled'}>${Object.entries(employeePunchHistoryModes).map(([value,label]) => `<option value="${value}" ${row.punchHistoryMode === value ? 'selected' : ''}>${label}</option>`).join('')}</select></td>`
                    : `<td>${Number(row.boundDeviceCount || 0)} 台</td><td><select data-ebs-value aria-label="${escapeHtml(row.id)} 個別裝置上限" ${editable ? '' : 'disabled'}><option value="" ${row.deviceLimit == null ? 'selected' : ''}>沿用全域（${data.globalDeviceLimit} 台）</option>${[1,2,3,4].map((n) => `<option value="${n}" ${row.deviceLimit === n ? 'selected' : ''}>${n} 台</option>`).join('')}</select></td><td><span data-ebs-effective>${row.effectiveDeviceLimit}</span> 台${row.boundDeviceCount > row.effectiveDeviceLimit ? '<small class="ebs-retained">既有裝置保留，暫不能新增</small>' : ''}</td>`}</tr>`).join('')}
                </tbody></table></div><p data-ebs-empty ${data.employees.length ? 'hidden' : ''}>目前沒有符合條件的員工。</p>
            ${editable ? `<label class="field"><span>設定原因</span><input name="reason" maxlength="500" required></label><label class="sp-confirm"><input type="checkbox" name="confirm" required>確認儲存員工個別${history ? '打卡紀錄可見範圍' : '裝置上限'}</label><div class="inline-actions"><button type="submit" class="primary-btn">${history ? '儲存個別紀錄範圍' : '儲存個別裝置上限'}</button><button type="button" class="outline-btn" data-ebs-refresh>重新載入個別設定</button></div>` : '<p class="helper-text">目前僅有檢視權限；身份模擬不能儲存員工個別設定。</p>'}
            <div class="inline-message" data-ebs-message role="status" aria-live="polite"></div>
        </form></section>`;
}
function ebsCollect(form, data) {
    const controls = new Map([...form.querySelectorAll('[data-ebs-id]')].map((row) => [row.dataset.ebsId, row.querySelector('[data-ebs-value]').value]));
    if (controls.size !== data.employees.length || data.employees.some((row) => !controls.has(row.id))) throw new Error('員工名單已變更，請重新載入後再儲存。');
    const history = form.dataset.ebsKind === 'history';
    return { revision: form.elements.revision.value, reason: form.elements.reason.value.trim(), confirm: form.elements.confirm.checked,
        employees: data.employees.map((row) => ({ id: row.id, punchHistoryMode: history ? controls.get(row.id) : row.punchHistoryMode,
            deviceLimit: history ? row.deviceLimit : controls.get(row.id) === '' ? null : Number(controls.get(row.id)) })) };
}
function ebsPaintForm(form, data, message = '') {
    const kind = form.dataset.ebsKind, section = form.closest('.ebs-panel');
    section.outerHTML = renderEmployeeBrowserSettings(data, kind);
    const current = document.querySelector(`[data-ebs-kind="${kind}"]`);
    if (current && message) setMessage(current.querySelector('[data-ebs-message]'), message, 'success');
}
document.addEventListener('input', (event) => {
    const form = event.target.closest('[data-ebs-kind]'); if (!form) return;
    if (event.target.matches('[data-ebs-search]')) {
        const keyword = event.target.value.trim().toLocaleLowerCase(); let visible = 0;
        form.querySelectorAll('[data-ebs-id]').forEach((row) => { row.hidden = !row.textContent.toLocaleLowerCase().includes(keyword); if (!row.hidden) visible++; });
        form.querySelector('[data-ebs-empty]').hidden = visible > 0; return;
    }
    form.dataset.ebsDirty = 'true';
});
document.addEventListener('change', (event) => {
    const form = event.target.closest('[data-ebs-kind]'); if (!form) return;
    form.dataset.ebsDirty = 'true';
    if (form.dataset.ebsKind === 'devices' && event.target.matches('[data-ebs-value]')) {
        event.target.closest('[data-ebs-id]').querySelector('[data-ebs-effective]').textContent = event.target.value || ebsData().globalDeviceLimit;
    }
});
document.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-ebs-kind]'); if (!form) return;
    event.preventDefault(); if (employeeBrowserSettingsUi.busy || !ebsCanManage()) return;
    const identity = ebsIdentity(), sequence = ++employeeBrowserSettingsUi.sequence;
    const controls = [...form.querySelectorAll('input,select,button')].map((control) => [control, control.disabled]);
    try {
        const body = ebsCollect(form, ebsData());
        employeeBrowserSettingsUi.busy = true; controls.forEach(([control]) => { control.disabled = true; });
        const result = await requestJson('/api/browser/employee-browser-settings', { auth: true, method: 'POST', body });
        if (identity !== ebsIdentity() || sequence !== employeeBrowserSettingsUi.sequence || !form.isConnected) return;
        ebsSetData(result.settings);
        // The other form edits a separate field; preserve its draft and use the newly saved counterpart.
        document.querySelectorAll('[data-ebs-kind] [name="revision"]').forEach((control) => {
            if (control.value === body.revision) control.value = result.settings.revision;
        });
        ebsPaintForm(form, result.settings, '員工個別設定已儲存。');
    } catch (error) { if (identity === ebsIdentity() && form.isConnected) setMessage(form.querySelector('[data-ebs-message]'), error.message, 'error'); }
    finally { if (identity === ebsIdentity() && sequence === employeeBrowserSettingsUi.sequence) employeeBrowserSettingsUi.busy = false; controls.forEach(([control, disabled]) => { if (control.isConnected) control.disabled = disabled; }); }
});
document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-ebs-refresh]'); if (!button) return;
    const form = button.closest('[data-ebs-kind]'); if (employeeBrowserSettingsUi.busy) return;
    if (form.dataset.ebsDirty === 'true' && !window.confirm('捨棄這頁尚未儲存的個別設定，重新載入？')) return;
    const identity = ebsIdentity();
    try {
        const result = await requestJson('/api/browser/employee-browser-settings', { auth: true });
        if (identity !== ebsIdentity() || !form.isConnected) return;
        ebsSetData(result.settings); ebsPaintForm(form, result.settings);
    } catch (error) { if (identity === ebsIdentity() && form.isConnected) setMessage(form.querySelector('[data-ebs-message]'), error.message, 'error'); }
});
const ebsPreviousSync = handleRealtimeSyncMessage;
handleRealtimeSyncMessage = async function syncEmployeeBrowserSettings(payload) {
    if (payload?.type === 'securitySettings') {
        const drafts = [...document.querySelectorAll('[data-ebs-kind][data-ebs-dirty="true"]')];
        if (drafts.length) {
            if (!employeeBrowserSettingsUi.busy) drafts.forEach((form) => setMessage(form.querySelector('[data-ebs-message]'), '安全設定已變更；未儲存內容已保留，請重新載入個別設定後再核對。', 'info'));
            return;
        }
    }
    return ebsPreviousSync(payload);
};
const ebsPreviousRender = renderDashboard;
renderDashboard = function renderEmployeeBrowserSettingsDashboard(dashboard) {
    if (state.dashboard?.role !== dashboard?.role || state.dashboard?.user?.id !== dashboard?.user?.id) { employeeBrowserSettingsUi.busy = false; employeeBrowserSettingsUi.sequence++; }
    return ebsPreviousRender(dashboard);
};
const ebsPreviousLogout = handleLogout;
handleLogout = function logoutEmployeeBrowserSettings(...args) { employeeBrowserSettingsUi.busy = false; employeeBrowserSettingsUi.sequence++; return ebsPreviousLogout(...args); };
