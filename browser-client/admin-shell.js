/* One admin page frame; module buttons retain their original handlers and guards. */
const adminPageFrames = {
    people: ['人員資料'], security: ['安全設定'], shifts: ['班別設定'], manualPunch: ['手動補登'],
    reports: ['考勤報表'], leave: ['請假管理'], overtime: ['加班管理'],
    meals: ['午餐團膳', '#meal-workspace'], salaryAdvances: ['借支管理', '#salary-advance-workspace'],
    supervisors: ['主管指定', '#supervisor-assignment-workspace'], system: ['系統設定'], bells: ['響鈴設定'], themes: ['主題特效']
};
const adminRefreshSelector = '[data-action="refresh-dashboard"],[data-action="meal-refresh"],[data-action="sp-refresh"],[data-action="le-refresh"],[data-action="rc-refresh"],[data-sa-action="refresh"]';
const adminEditedForms = new WeakSet();
function installAdminPageFrame() {
    if (state.dashboard?.role !== 'admin') return;
    const section = state.activeSections.admin, frame = adminPageFrames[section];
    if (!frame) return;
    const root = ui.dashboardContent.querySelector(frame[1] || `[data-workspace-role="admin"][data-workspace-section="${section}"]`);
    if (!root) return;
    root.classList.add('admin-page-frame');
    let header = root.querySelector(':scope > .workspace-summary-card');
    if (!header) {
        header = document.createElement('article');
        header.className = 'workspace-card workspace-summary-card';
        header.dataset.noCollapsible = 'true';
        header.innerHTML = '<div class="list-toolbar"><div><h3></h3></div><div class="badge-row"></div></div>';
        root.prepend(header);
    }
    header.classList.add('admin-page-header');
    header.querySelector('h3').textContent = frame[0];
    let actions = header.querySelector('.badge-row');
    if (!actions) { actions = document.createElement('div'); actions.className = 'badge-row'; header.querySelector('.list-toolbar').append(actions); }
    const refreshes = [...root.querySelectorAll(adminRefreshSelector)];
    // Prefer a newly painted module's control, so loading/permission disabled state stays current.
    let refresh = refreshes.find((button) => !header.contains(button)) || refreshes[0];
    if (!refresh) { refresh = document.createElement('button'); refresh.type = 'button'; refresh.dataset.action = 'refresh-dashboard'; }
    for (const button of refreshes) if (button !== refresh) button.remove();
    refresh.className = 'outline-btn admin-page-refresh';
    refresh.textContent = '重新整理'; refresh.setAttribute('aria-label', '重新整理');
    refresh.title = '重新取得目前頁面資料'; actions.append(refresh);
    // The older salary heading was explanatory copy in place of a page title.
    if (section === 'salaryAdvances') root.querySelector(':scope > .sa-header')?.remove();
    root.querySelectorAll('.sp-toolbar').forEach((toolbar) => { if (!toolbar.children.length) toolbar.remove(); });
}
document.addEventListener('input', rememberAdminFormEdit);
document.addEventListener('change', rememberAdminFormEdit);
function rememberAdminFormEdit(event) {
    if (state.dashboard?.role !== 'admin') return;
    const form = event.target.closest?.('.admin-page-frame form');
    if (form && form.id !== 'attendance-report-form' && form.querySelector('button[type="submit"]')) adminEditedForms.add(form);
}
// Global dashboard refresh replaces legacy forms; module-specific controls keep their own draft rules.
function confirmAdminPageRefresh() {
    return new Promise((resolve) => {
        if (document.getElementById('admin-refresh-dialog')) { resolve(false); return; }
        const dialog = document.createElement('dialog');
        dialog.id = 'admin-refresh-dialog'; dialog.className = 'wb-dialog';
        dialog.setAttribute('aria-labelledby', 'admin-refresh-title');
        dialog.innerHTML = '<header class="wb-dialog-header"><div><h2 id="admin-refresh-title">此頁有尚未儲存的內容</h2><p>重新整理會捨棄目前輸入，並取得最新資料。</p></div></header><div class="wb-dialog-body"><div class="form-actions"><button type="button" class="outline-btn" data-refresh-keep autofocus>繼續編輯</button><button type="button" class="primary-btn" data-refresh-discard>捨棄並重新整理</button></div></div>';
        let discard = false;
        dialog.querySelector('[data-refresh-keep]').onclick = () => dialog.close();
        dialog.querySelector('[data-refresh-discard]').onclick = () => { discard = true; dialog.close(); };
        dialog.addEventListener('close', () => { dialog.remove(); resolve(discard); }, { once: true });
        document.body.append(dialog); dialog.showModal();
    });
}
document.addEventListener('click', async (event) => {
    const button = event.target.closest('.admin-page-refresh[data-action="refresh-dashboard"]');
    if (!button || state.dashboard?.role !== 'admin') return;
    const root = button.closest('.admin-page-frame');
    if ([...root.querySelectorAll('form')].some((form) => adminEditedForms.has(form))) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (await confirmAdminPageRefresh() && button.isConnected && state.dashboard?.role === 'admin') {
            await handleDashboardClick({ target: button, preventDefault() {} });
        }
    }
}, true);
const adminFramePreviousPostRender = postRenderSetup;
postRenderSetup = function setupAdminPageFrame() { adminFramePreviousPostRender(); installAdminPageFrame(); };
for (const [name, paint] of [['mealPaint', mealPaint], ['spPaint', spPaint], ['saPaint', saPaint], ['lePaint', lePaint], ['rcPaint', rcPaint]]) {
    if (name === 'mealPaint') mealPaint = function (...args) { const result = paint(...args); installAdminPageFrame(); return result; };
    if (name === 'spPaint') spPaint = function (...args) { const result = paint(...args); installAdminPageFrame(); return result; };
    if (name === 'saPaint') saPaint = function (...args) { const result = paint(...args); installAdminPageFrame(); return result; };
    if (name === 'lePaint') lePaint = function (...args) { const result = paint(...args); installAdminPageFrame(); return result; };
    if (name === 'rcPaint') rcPaint = function (...args) { const result = paint(...args); installAdminPageFrame(); return result; };
}
