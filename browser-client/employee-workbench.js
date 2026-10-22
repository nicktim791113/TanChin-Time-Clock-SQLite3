// Personal employee navigation preferences. The renderer still decides which functions are authorized.
auditTargetTypeLabels.employee_workspace_nav_order = '員工個人功能順序';
function orderEmployeeWorkspaceItems(items, dashboard) {
    const order = dashboard.employeeWorkspaceNav?.order || [];
    const byId = new Map(items.map((item) => [item.id, item]));
    return [...new Set([...order, ...items.map((item) => item.id)])].map((id) => byId.get(id)).filter(Boolean);
}

function openEmployeeWorkspaceOrder() {
    const dashboard = state.dashboard;
    if (dashboard?.role !== 'employee' || !dashboard.employeeWorkspaceNav?.canEdit || document.getElementById('employee-order-dialog')) return;
    const identity = state.token;
    const employeeId = dashboard.user.id;
    const preferences = dashboard.employeeWorkspaceNav;
    const items = renderEmployeeWorkspaceItems(dashboard);
    const labels = new Map(items.map((item) => [item.id, item.label]));
    let draft = [...preferences.order], dirty = false, reset = false, busy = false;
    const dialog = document.createElement('dialog');
    dialog.id = 'employee-order-dialog';
    dialog.className = 'employee-order-dialog';
    dialog.setAttribute('aria-labelledby', 'employee-order-title');
    dialog.innerHTML = `<div class="modal-header"><div><h2 id="employee-order-title">調整我的功能順序</h2><p>只套用於你的帳號，換電腦登入也會沿用。</p></div><button class="ghost-btn" type="button" data-employee-order-close>關閉</button></div>
        <form data-employee-order-form><p class="helper-text">使用上移、下移排列常用功能。功能權限不受排序影響。</p><ol class="employee-order-list"></ol>
        <p class="inline-message" data-employee-order-message role="status"></p>
        <div class="employee-order-footer"><button class="outline-btn" type="button" data-employee-order-reset>恢復預設</button><button class="primary-btn" type="submit">儲存排序</button></div>
        <div class="employee-order-discard" hidden><p>尚有未儲存的排序。</p><button type="button" class="outline-btn" data-employee-order-keep>繼續編輯</button><button type="button" class="outline-btn" data-employee-order-discard>捨棄並關閉</button></div></form>`;
    const list = dialog.querySelector('ol');
    const message = dialog.querySelector('[data-employee-order-message]');
    const visibleOrder = () => draft.filter((id) => labels.has(id));
    const renderRows = () => {
        const visible = visibleOrder();
        list.innerHTML = visible.map((id, index) => `<li><span class="employee-order-number">${index + 1}</span><strong>${escapeHtml(labels.get(id))}</strong><div><button type="button" class="outline-btn" data-employee-order-move="${escapeHtml(id)}" data-direction="-1" ${index === 0 ? 'disabled' : ''} aria-label="上移${escapeHtml(labels.get(id))}">上移</button><button type="button" class="outline-btn" data-employee-order-move="${escapeHtml(id)}" data-direction="1" ${index === visible.length - 1 ? 'disabled' : ''} aria-label="下移${escapeHtml(labels.get(id))}">下移</button></div></li>`).join('');
    };
    const close = (discard = false) => {
        if (busy) return;
        if (dirty && !discard) { dialog.querySelector('.employee-order-discard').hidden = false; return; }
        dialog.close(); dialog.remove();
        document.querySelector('[data-employee-order-open]')?.focus({ preventScroll: true });
    };
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
    dialog.addEventListener('click', (event) => {
        if (busy) return;
        if (event.target.closest('[data-employee-order-close]')) close();
        if (event.target.closest('[data-employee-order-discard]')) close(true);
        if (event.target.closest('[data-employee-order-keep]')) dialog.querySelector('.employee-order-discard').hidden = true;
        if (event.target.closest('[data-employee-order-reset]')) {
            draft = [...preferences.defaultOrder]; dirty = true; reset = true; renderRows();
            setMessage(message, '已回到預設順序，按儲存排序後生效。', 'info');
        }
        const move = event.target.closest('[data-employee-order-move]');
        if (!move) return;
        const visible = visibleOrder(), id = move.dataset.employeeOrderMove;
        const target = visible.indexOf(id) + Number(move.dataset.direction);
        if (target < 0 || target >= visible.length) return;
        const fromIndex = draft.indexOf(id), toIndex = draft.indexOf(visible[target]);
        [draft[fromIndex], draft[toIndex]] = [draft[toIndex], draft[fromIndex]];
        dirty = true; reset = false; renderRows();
        setMessage(message, `已將${labels.get(id)}移至第 ${target + 1} 位，尚未儲存。`, 'info');
        const buttons = [...list.querySelectorAll('[data-employee-order-move]')].filter((button) => button.dataset.employeeOrderMove === id);
        (buttons.find((button) => button.dataset.direction === move.dataset.direction && !button.disabled) || buttons.find((button) => !button.disabled))?.focus();
    });
    dialog.querySelector('form').addEventListener('submit', async (event) => {
        event.preventDefault();
        if (busy) return;
        const sameSession = () => state.token === identity && state.dashboard?.role === 'employee' && state.dashboard.user?.id === employeeId && state.dashboard.employeeWorkspaceNav?.canEdit;
        if (!sameSession()) { dialog.remove(); return; }
        busy = true;
        dialog.querySelectorAll('button').forEach((button) => { button.dataset.wasDisabled = String(button.disabled); button.disabled = true; });
        try {
            const result = await requestJson(`/api/browser/employee/workspace-nav-order/${reset ? 'reset' : 'save'}`, { auth: true, method: 'POST', body: reset ? {} : { order: draft } });
            if (!sameSession()) { dialog.remove(); return; }
            state.dashboard.employeeWorkspaceNav = result.dashboard.employeeWorkspaceNav;
            // Move existing buttons only: an open application form may contain an unsaved draft.
            const tablist = document.querySelector('.employee-workbench-tabs');
            const buttons = new Map([...tablist.querySelectorAll('[data-panel]')].map((button) => [button.dataset.panel, button]));
            for (const id of result.dashboard.employeeWorkspaceNav.order) {
                if (buttons.has(id)) tablist.append(buttons.get(id));
            }
            const orderedTabs = [...tablist.querySelectorAll('[role="tab"]')];
            const active = orderedTabs.find((button) => button.dataset.panel === state.employeeWorkspacePanel) || orderedTabs[0];
            orderedTabs.forEach((button) => { button.tabIndex = button === active ? 0 : -1; });
            dirty = false; busy = false; close(true);
            document.querySelector('[data-employee-order-open]')?.focus({ preventScroll: true });
            setMessage(ui.dashboardMessage, result.message, 'success');
        } catch (error) {
            if (sameSession()) setMessage(message, error.message, 'error');
            else dialog.remove();
        } finally {
            busy = false;
            dialog.querySelectorAll('button').forEach((button) => { button.disabled = button.dataset.wasDisabled === 'true'; });
        }
    });
    renderRows(); document.body.append(dialog); dialog.showModal();
}

document.addEventListener('click', (event) => {
    if (event.target.closest('[data-employee-order-open]')) openEmployeeWorkspaceOrder();
});
document.addEventListener('keydown', (event) => {
    const current = event.target.closest('.employee-workbench-tab');
    if (!current || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...current.parentElement.querySelectorAll('[role="tab"]')];
    const index = tabs.indexOf(current);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1) + tabs.length) % tabs.length;
    event.preventDefault(); tabs.forEach((tab, i) => { tab.tabIndex = i === next ? 0 : -1; }); tabs[next].focus();
});
const employeeOrderPreviousLogout = handleLogout;
handleLogout = function employeeOrderLogout(...args) {
    document.getElementById('employee-order-dialog')?.remove();
    return employeeOrderPreviousLogout(...args);
};
