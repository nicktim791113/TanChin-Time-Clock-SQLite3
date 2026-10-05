const supervisorState = { identity: '', data: null, assignments: null, routes: null, month: '', employeeId: '',
    date: '', kind: 'leave', page: 1, form: '', loading: false, busy: false, dirty: false, sequence: 0, error: '' };
Object.assign(auditActionLabels, { supervisor_assignment: '指定代辦主管', supervisor_proxy_create: '主管代申請', supervisor_proxy_withdraw: '主管代撤回' });
auditActionLabels.browser_punch_permission = '網頁打卡權限設定';
auditTargetTypeLabels.browser_punch_permission = '網頁打卡權限';
auditTargetTypeLabels.supervisor_assignment = '主管指定';
const spEscape = (value) => escapeHtml(String(value ?? ''));
function spToday() { return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10); }
function spManagement() { return state.dashboard?.role === 'system_admin' || (state.dashboard?.role === 'admin' && state.activeSections.admin === 'supervisors'); }
function spRoot() { return document.getElementById(spManagement() ? 'supervisor-assignment-workspace' : 'supervisor-workspace'); }
function spMessage(message, type = 'error') { setMessage(spRoot()?.querySelector('.sp-message') || ui.dashboardMessage, message, type); }
async function spDiscard() {
    if (!supervisorState.dirty) return true;
    if (document.querySelector('.sp-discard-dialog')) return false;
    return new Promise((resolve) => {
        const dialog = document.createElement('dialog');
        dialog.className = 'sp-discard-dialog'; dialog.setAttribute('aria-label', '未儲存的代辦內容');
        dialog.innerHTML = '<p>尚有未儲存的代辦內容，確定捨棄並切換？</p><div class="inline-actions"><button type="button" class="outline-btn" data-sp-discard="no">繼續編輯</button><button type="button" class="primary-btn" data-sp-discard="yes">捨棄並切換</button></div>';
        const finish = (confirmed) => { dialog.close(); dialog.remove(); resolve(confirmed); };
        dialog.addEventListener('cancel', (event) => { event.preventDefault(); finish(false); });
        dialog.addEventListener('click', (event) => { const button = event.target.closest('[data-sp-discard]'); if (button) finish(button.dataset.spDiscard === 'yes'); });
        document.body.append(dialog); dialog.showModal();
    });
}
function spButton(action, label, extra = '', disabled = false) {
    return `<button type="button" class="outline-btn" data-action="sp-${action}" ${extra} ${disabled || supervisorState.busy ? 'disabled' : ''}>${label}</button>`;
}
function spOptions(employees, selected) { return employees.map((e) => `<option value="${spEscape(e.id)}" ${e.id === selected ? 'selected' : ''}>${spEscape(e.id)} ${spEscape(e.name)}${e.department ? ` · ${spEscape(e.department)}` : ''}</option>`).join(''); }
function spField(label, name, type, value = '', extra = '') {
    return `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${spEscape(value)}" ${extra} required></label>`;
}
function spCanAssignments() { return state.dashboard?.role === 'system_admin' || hasCurrentAdminPermission('admin.supervisors.manage'); }
function spCanRoutes() { return state.dashboard?.role === 'system_admin' || hasCurrentAdminPermission('admin.leave.settings'); }
function spRenderRoutes() {
    if (!spCanRoutes()) return '';
    const data = supervisorState.routes;
    return `<section class="sp-route-section"><h3>請假／加班共用主管審核路徑</h3>${!data ? '<p role="status">讀取共用審核路徑中…</p>' : `
        <form data-sp-form="routes" class="sp-form">${renderAdminLeaveRouteRows(data.approvalRoutes, data.employees, data.departments)}
        <button class="primary-btn" type="submit">儲存共用審核路徑</button></form>`}</section>`;
}
function spTargets(meal = false) {
    const employees = supervisorState.data.employees;
    const disabledIds = meal ? employees.filter((e) => !supervisorState.data.batchMeal.employees.find((m) => m.id === e.id)?.canChange).map((e) => e.id) : [];
    return renderAdminPaperEmployeePicker(employees, '代辦員工', [], {
        selectedIds: disabledIds.includes(supervisorState.employeeId) ? [] : [supervisorState.employeeId], disabledIds, maxSelection: 100,
        notes: Object.fromEntries(disabledIds.map((id) => [id, '本日無法代登午餐']))
    });
}
function renderSupervisorAssignments() {
    const data = supervisorState.assignments;
    if (!spCanAssignments()) return `<section id="supervisor-assignment-workspace" class="sp-workspace" aria-label="主管指定"><div class="inline-message sp-message" aria-live="polite">${spEscape(supervisorState.error)}</div>${spRenderRoutes()}</section>`;
    return `<section id="supervisor-assignment-workspace" class="sp-workspace" aria-label="主管指定">
        ${spRenderRoutes()}
        <div class="sp-toolbar"><h3>指定代辦主管</h3>${spButton('refresh', '重新整理')}</div>
        <div class="inline-message sp-message" aria-live="polite">${spEscape(supervisorState.error)}</div>
        ${!data ? '<p role="status">讀取主管指定資料中…</p>' : `${data.employees.length ? `<form data-sp-form="assignments/batch" class="sp-form">
            ${renderAdminPaperEmployeePicker(data.employees, '設定主管的員工', [], { name: 'assignmentEmployeeIds', maxSelection: 100 })}
            ${renderAdminPaperEmployeePicker(data.employees, '指定的代辦主管', [], { name: 'supervisorIds', maxSelection: 100 })}
            <label class="field"><span>設定模式</span><select name="mode">
                <option value="add">新增主管（保留原指定）</option><option value="replace">取代主管（改為本次勾選）</option>
            </select></label>
            ${spField('設定原因', 'reason', 'text', '', 'maxlength="500"')}
            <label class="sp-confirm" data-sp-clear-confirm hidden><input type="checkbox" name="confirmClear" disabled>確認清除所有勾選員工的全部代辦主管授權（未選主管）</label>
            <label class="sp-confirm"><input type="checkbox" name="confirmAssignment" required>確認依所選模式更新所有勾選員工的代辦主管授權</label>
            <button type="submit" class="primary-btn" ${supervisorState.busy ? 'disabled' : ''}>批量儲存主管指定</button>
        </form>` : '<p>尚無可設定的員工。</p>'}
        <div class="sp-table-scroll"><table class="sp-table"><thead><tr><th>員工</th><th>部門</th><th>指定代辦主管</th></tr></thead><tbody>
        ${data.employees.map((e) => `<tr><td>${spEscape(e.id)} ${spEscape(e.name)}</td><td>${spEscape(e.department)}</td><td>${e.supervisorIds.map((id) => spEscape(`${id} ${data.employees.find((s) => s.id === id)?.name || '（已不存在）'}`)).join('、') || '未指定'}</td></tr>`).join('')}
        </tbody></table></div>`}
    </section>`;
}
function spCalendar(data) {
    const calendar = data.calendar;
    const days = supervisorState.kind === 'meals' ? data.meals.days : calendar.days;
    const offset = new Date(`${supervisorState.month}-01T00:00:00Z`).getUTCDay();
    return `<div class="meal-calendar sp-calendar" role="group" aria-label="${spEscape(supervisorState.month)} 主管代辦日曆">
        ${['日', '一', '二', '三', '四', '五', '六'].map((day) => `<div class="meal-weekday">${day}</div>`).join('')}
        ${Array.from({ length: offset }, () => '<div class="meal-date-empty" aria-hidden="true"></div>').join('')}
        ${days.map((day) => {
            const meal = supervisorState.kind === 'meals', row = meal ? day.rows[0] : null;
            const label = meal ? !day.serving ? '未供餐' : !row.eligible ? '未參加' : row.eating ? '用餐' : '不用餐' : `${day.totalCount} 件`;
            return `<button type="button" class="meal-date ${day.date === supervisorState.date ? 'is-selected' : ''} ${meal && row.eating ? 'is-eating' : ''}" data-action="sp-date" data-date="${day.date}" aria-pressed="${day.date === supervisorState.date}" aria-label="${day.date} ${label}">
                <span class="meal-date-number">${Number(day.date.slice(-2))}${day.date === spToday() ? '<small>今天</small>' : ''}</span><span class="meal-date-status">${label}</span>
                <small class="meal-date-deadline">${meal ? !day.serving ? '&nbsp;' : day.locked ? `<span>${day.revision ? '已結單' : '已截止'}</span>` : `<span>${day.cutoff}</span><span>截止</span>` : `<span>核准 ${day.approvedCount}</span><span>待審 ${day.pendingCount}</span>`}</small>
                ${row?.warning ? '<span class="meal-warning-dot" title="全日請假仍預訂午餐">請假</span>' : ''}</button>`;
        }).join('')}</div>`;
}
function spRequestForm() {
    const kind = supervisorState.kind, leave = kind === 'leave', date = supervisorState.date;
    return `<form data-sp-form="${kind}" class="sp-form">
        <h4>代申請${leave ? '請假' : '加班'}</h4>${spTargets()}
        <div class="request-period-grid">${spField('開始日期', 'startDate', 'date', date)}${spField('開始時間', 'startTime', 'time', leave ? '09:00' : '18:00')}
        ${spField('結束日期', 'endDate', 'date', date)}${spField('結束時間', 'endTime', 'time', leave ? '18:00' : '20:00')}</div>
        <div class="sp-form-grid">${leave ? `<label class="field"><span>假別</span><select name="leaveTypeId" required>${supervisorState.data.leaveTypes.map((t) => `<option value="${spEscape(t.id)}">${spEscape(t.name)}</option>`).join('')}</select></label>` : ''}
        ${spField('每人整筆時數', 'durationHours', 'number', leave ? '8' : '2', 'min="0.01" step="0.01"')}</div>
        ${spField('申請事由', 'reason', 'text', '', 'maxlength="2000"')}${spField('代辦原因', 'proxyReason', 'text', '', 'maxlength="500"')}
        <label class="sp-confirm"><input type="checkbox" name="confirmApproval" required>確認替所有勾選員工代申請相同內容並由本人核准${leave ? '，送管理部終審' : ''}</label>
        <div class="inline-actions"><button class="primary-btn" type="submit" ${supervisorState.busy ? 'disabled' : ''}>${leave ? '送管理部終審' : '代申請並核准'}</button>${spButton('reset-form', '重設表單')}</div>
    </form>`;
}
function spMealDetail() {
    const day = supervisorState.data.meals.days.find((d) => d.date === supervisorState.date);
    if (!day) return '';
    const row = day.rows[0], allowed = day.serving && !day.locked && Date.now() < day.deadline;
    return `<section class="sp-day-detail"><h4>${day.date} 午餐</h4><p>${day.serving ? '供餐' : '未供餐'} · ${day.cutoff} 截止（台北時間） · ${row.eating ? '用餐' : '不用餐'}${day.revision ? ' · 已結單' : ''}${row.submittedEating == null ? '' : ` · 已交單：${row.submittedEating ? '用餐' : '不用餐'}`}</p>
        ${row.warning ? `<div class="meal-warning-row"><span>全日請假仍預訂午餐</span>${spButton('cancel-meal', '確認取消餐點', '', !allowed)}</div>` : ''}
        ${allowed ? `<form data-sp-form="meals" class="sp-form">${spTargets(true)}<label class="field"><span>是否用餐</span><select name="eating"><option value="true" ${row.eating ? 'selected' : ''}>用餐</option><option value="false" ${!row.eating ? 'selected' : ''}>不用餐</option></select></label>
        ${spField('代辦原因', 'reason', 'text', '', 'maxlength="500"')}<button class="primary-btn" type="submit" ${supervisorState.busy ? 'disabled' : ''}>儲存午餐代登</button></form>` : `<p class="meal-lock">${!day.serving ? '本日未供餐' : !row.eligible ? '本日未參加團膳' : '已截止或已結單，請聯絡團膳管理者。'}</p>`}</section>`;
}
function spRequestDetail() {
    const detail = supervisorState.data.calendar.detail;
    return `<section class="sp-day-detail"><div class="sp-toolbar"><h4>${supervisorState.date} ${supervisorState.kind === 'leave' ? '請假' : '加班'}</h4></div>
        ${spRequestForm()}
        <div class="sp-records">${detail.records.map((row) => `<article class="sp-record"><div class="sp-toolbar"><strong>${spEscape(row.leaveTypeName || '加班')} · ${spEscape(row.statusText)}</strong>
            ${row.canProxyWithdraw ? spButton('withdraw', '代撤回', `data-id="${spEscape(row.id)}"`) : ''}</div>
            <p>${spEscape(row.startText)} 至 ${spEscape(row.endText)} · ${spEscape(row.duration_hours)} 小時</p><p>${spEscape(row.reason)}</p>
            <p>${spEscape(row.approvalModeText)}${row.applicantId || row.applicant_id ? ` · 申請人：${spEscape(row.applicantName || row.applicantId || row.applicant_id)}` : ''}</p>
            ${row.proxyReason || row.proxy_reason ? `<p>代辦原因：${spEscape(row.proxyReason || row.proxy_reason)}</p>` : ''}
            ${supervisorState.form === `withdraw:${row.id}` && row.canProxyWithdraw ? `<form data-sp-form="leave/withdraw" class="sp-form">
                <input type="hidden" name="requestId" value="${spEscape(row.id)}"><input type="hidden" name="updatedAt" value="${row.updated_at}">
                ${spField('代撤回原因', 'reason', 'text', '', 'maxlength="500"')}
                <label class="sp-confirm"><input type="checkbox" name="confirmWithdrawal" required>確認代 ${spEscape(supervisorState.employeeId)} 撤回這筆請假</label>
                <div class="inline-actions"><button class="primary-btn" type="submit">確認代撤回</button>${spButton('cancel-form', '取消')}</div>
            </form>` : ''}</article>`).join('') || '<p>本日沒有申請紀錄。</p>'}</div>
        ${detail.totalPages > 1 ? `<div class="inline-actions">${spButton('page', '←', `data-page="${detail.page - 1}" aria-label="上一頁"`, detail.page <= 1)}<span>${detail.page} / ${detail.totalPages}</span>${spButton('page', '→', `data-page="${detail.page + 1}" aria-label="下一頁"`, detail.page >= detail.totalPages)}</div>` : ''}</section>`;
}
function renderSupervisorWorkspace() {
    const data = supervisorState.data, canUse = state.dashboard?.supervisorProxy?.canUse;
    return `<section id="supervisor-workspace" class="sp-workspace" aria-label="主管代辦">
        <div class="sp-toolbar"><h3>主管代辦</h3>${spButton('refresh', '重新整理', '', !canUse)}</div>
        <div class="inline-message sp-message" aria-live="polite">${spEscape(supervisorState.error)}</div>
        ${!canUse ? '<p>請以主管本人的個人網頁密碼重新登入。</p>' : !data ? '<p role="status">讀取代辦資料中…</p>' : !data.employees.length ? '<p>目前沒有獲指定的代辦員工。</p>' : `
        ${renderAdminPaperEmployeePicker(data.employees, '查看紀錄員工', [], {
            name: 'viewEmployeeId', single: true, selectedIds: [supervisorState.employeeId], inputAttributes: 'data-sp-employee'
        })}
        <div class="sp-toolbar"><div class="meal-month-controls">${spButton('month', '←', 'data-offset="-1" aria-label="上個月"')}<input type="month" data-sp-month aria-label="代辦月份" value="${supervisorState.month}" min="2000-01" max="2100-12">${spButton('month', '→', 'data-offset="1" aria-label="下個月"')}</div></div>
        <div class="meal-tabs" role="tablist" aria-label="代辦項目">${[['leave', '請假'], ['overtime', '加班'], ['meals', '午餐團膳']].map(([kind, label]) => `<button type="button" role="tab" data-action="sp-kind" data-kind="${kind}" aria-selected="${supervisorState.kind === kind}" class="${supervisorState.kind === kind ? 'is-active' : ''}">${label}</button>`).join('')}</div>
        ${spCalendar(data)}${supervisorState.kind === 'meals' ? spMealDetail() : spRequestDetail()}`}
    </section>`;
}
function spPaint() {
    const root = spRoot();
    if (root) {
        root.outerHTML = spManagement() ? renderSupervisorAssignments() : renderSupervisorWorkspace();
        setupPaperEmployeePickerSizes();
    }
}
function spSyncAssignmentClear(form, reset = false) {
    if (form?.dataset.spForm !== 'assignments/batch') return;
    const clearing = form.querySelector('[name="mode"]').value === 'replace' && !form.querySelector('[name="supervisorIds"]:checked');
    const label = form.querySelector('[data-sp-clear-confirm]'), control = label.querySelector('input');
    label.hidden = !clearing; control.disabled = !clearing; control.required = clearing;
    if (reset || !clearing) control.checked = false;
}
async function spLoad() {
    const identity = supervisorState.identity, sequence = ++supervisorState.sequence, managing = spManagement();
    supervisorState.loading = true;
    try {
        const url = managing ? spCanAssignments() ? '/api/browser/supervisors/assignments' : '/api/browser/supervisors/routes' : `/api/browser/employee/supervisor?${new URLSearchParams({
            month: supervisorState.month, kind: supervisorState.kind === 'meals' ? 'leave' : supervisorState.kind, page: supervisorState.page,
            ...(supervisorState.employeeId ? { employeeId: supervisorState.employeeId } : {}), ...(supervisorState.date ? { date: supervisorState.date } : {}) })}`;
        const result = await requestJson(url, { auth: true });
        const routes = managing && spCanRoutes() ? spCanAssignments() ? (await requestJson('/api/browser/supervisors/routes', { auth: true })).routes : result.routes : null;
        if (identity !== supervisorState.identity || sequence !== supervisorState.sequence) return;
        if (managing) {
            supervisorState.routes = routes; supervisorState.assignments = result.assignments || null;
        } else { supervisorState.data = result.proxy; supervisorState.employeeId = result.proxy.employeeId || ''; }
        supervisorState.dirty = false; supervisorState.error = ''; spPaint(); return true;
    } catch (error) {
        if (identity !== supervisorState.identity || sequence !== supervisorState.sequence) return;
        supervisorState.error = error.message; supervisorState.data = null; supervisorState.assignments = null; supervisorState.routes = null;
        spPaint(); spMessage(error.message); return false;
    } finally { if (identity === supervisorState.identity && sequence === supervisorState.sequence) supervisorState.loading = false; }
}
const spPreviousRender = renderDashboard;
renderDashboard = function renderDashboardWithSupervisor(dashboard) {
    const identity = `${state.token}/${dashboard.role}/${dashboard.user?.id || ''}`;
    if (identity !== supervisorState.identity) Object.assign(supervisorState, { identity, data: null, assignments: null, routes: null, month: spToday().slice(0, 7),
        date: spToday(), employeeId: '', assignmentId: '', kind: 'leave', page: 1, form: '', loading: false, busy: false, dirty: false, error: '', sequence: supervisorState.sequence + 1 });
    return spPreviousRender(dashboard);
};
const spPreviousItems = renderEmployeeWorkspaceItems;
renderEmployeeWorkspaceItems = function renderEmployeeItemsWithSupervisor(dashboard) {
    const items = spPreviousItems(dashboard);
    return dashboard.supervisorProxy?.count ? [...items, { id: 'supervisor', label: '主管代辦', meta: `${dashboard.supervisorProxy.count} 位員工`, html: renderSupervisorWorkspace() }] : items;
};
const spPreviousAdmin = renderAdminPermissionAwareContent;
renderAdminPermissionAwareContent = function renderAdminWithSupervisor(section, datasets) { return section === 'supervisors' ? renderSupervisorAssignments() : spPreviousAdmin(section, datasets); };
const spPreviousSystemAdmin = renderSystemAdminDashboard;
renderSystemAdminDashboard = function renderSystemAdminWithSupervisor(dashboard) { return `${spPreviousSystemAdmin(dashboard)}${renderBrowserPunchPermissions(dashboard.datasets?.browserPunchPermissions)}${renderSupervisorAssignments()}`; };
const spPreviousPostRender = postRenderSetup;
postRenderSetup = function postRenderWithSupervisor() {
    spPreviousPostRender();
    if (spRoot() && !supervisorState.loading && !supervisorState.error && (spManagement() ? spCanAssignments() ? !supervisorState.assignments : !supervisorState.routes : !supervisorState.data && state.dashboard?.supervisorProxy?.canUse)) spLoad();
};
const spPreviousClick = handleDashboardClick;
handleDashboardClick = async function handleSupervisorClick(event) {
    const button = event.target.closest('[data-action]'), action = button?.dataset.action;
    if (['paper-select-visible-employees', 'paper-clear-employees'].includes(action) && button.closest('[data-sp-form]')) {
        event.preventDefault(); if (supervisorState.busy) return;
        const field = button.closest('[data-paper-employee-field]');
        const before = [...field.querySelectorAll('[data-paper-employee-checkbox]:checked')].map((input) => input.value).join('\n');
        await spPreviousClick(event);
        const after = [...field.querySelectorAll('[data-paper-employee-checkbox]:checked')].map((input) => input.value).join('\n');
        if (before !== after) {
            supervisorState.dirty = true;
            spSyncAssignmentClear(button.closest('[data-sp-form]'), true);
        }
        return;
    }
    if (!action?.startsWith('sp-')) {
        if (supervisorState.dirty && button && (button.dataset.action.includes('workspace') || button.dataset.action.includes('section'))) {
            if (!await spDiscard()) { event.preventDefault(); return; }
            supervisorState.dirty = false; supervisorState.form = '';
        }
        return spPreviousClick(event);
    }
    event.preventDefault(); if (supervisorState.busy) return;
    if (action === 'sp-cancel-meal') {
        const form = spRoot()?.querySelector('[data-sp-form="meals"]');
        if (form) {
            form.querySelectorAll('[name="employeeIds"]').forEach((input) => { input.checked = input.value === supervisorState.employeeId && !input.disabled; });
            syncAdminPaperEmployeePicker(form.querySelector('[data-paper-employee-field]'));
            form.elements.eating.value = 'false'; form.elements.reason.value = '全日請假提醒：主管代確認取消餐點'; supervisorState.dirty = true; form.elements.reason.focus();
        }
        return;
    }
    if (action === 'sp-withdraw') {
        if (!await spDiscard()) return;
        supervisorState.dirty = false; supervisorState.form = `withdraw:${button.dataset.id}`; spPaint(); return;
    }
    if (!await spDiscard()) return;
    supervisorState.dirty = false; supervisorState.form = ''; supervisorState.page = 1;
    if (action === 'sp-reset-form' || action === 'sp-cancel-form') { spPaint(); return; }
    if (action === 'sp-date') supervisorState.date = button.dataset.date;
    if (action === 'sp-kind') supervisorState.kind = button.dataset.kind;
    if (action === 'sp-page') supervisorState.page = Number(button.dataset.page);
    if (action === 'sp-month') {
        const date = new Date(`${supervisorState.month}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + Number(button.dataset.offset));
        supervisorState.month = date.toISOString().slice(0, 7); supervisorState.date = `${supervisorState.month}-01`;
    }
    await spLoad();
};
const spPreviousChange = handleDashboardChange;
handleDashboardChange = async function handleSupervisorChange(event) {
    const target = event.target;
    if (target.id === 'workspace-switch' && supervisorState.dirty) {
        if (!await spDiscard()) { target.value = state.dashboard.role; return; }
        supervisorState.dirty = false;
    }
    if (target.matches('[data-sp-employee], [data-sp-month]')) {
        if (supervisorState.busy) return;
        if (!await spDiscard()) {
            if (target.hasAttribute('data-sp-month')) target.value = supervisorState.month;
            else {
                const selectedId = supervisorState.employeeId;
                const field = target.closest('[data-paper-employee-field]');
                field.querySelectorAll('[data-paper-employee-checkbox]').forEach((input) => { input.checked = input.value === selectedId; });
                syncAdminPaperEmployeePicker(field);
            }
            return;
        }
        supervisorState.dirty = false; supervisorState.form = ''; supervisorState.page = 1;
        if (target.hasAttribute('data-sp-employee')) supervisorState.employeeId = target.value;
        else { supervisorState.month = target.value; supervisorState.date = `${target.value}-01`; }
        await spLoad(); return;
    }
    if (target.matches('[data-paper-employee-height]')) return;
    if (target.matches('[data-paper-employee-department]')) return spPreviousChange(event);
    if (target.closest('[data-sp-form]')) {
        if (supervisorState.busy) return;
        if (target.matches('[data-paper-employee-checkbox]')) await spPreviousChange(event);
        spSyncAssignmentClear(target.closest('[data-sp-form]'), target.matches('[name="mode"], [data-paper-employee-checkbox]'));
        supervisorState.dirty = true; return;
    }
    return spPreviousChange(event);
};
async function spSave(operation, body) {
    const identity = supervisorState.identity, managing = ['assignments/batch', 'routes'].includes(operation);
    const controls = [...(spRoot()?.querySelectorAll('input, select, button') || [])].map((input) => [input, input.disabled]);
    supervisorState.busy = true; controls.forEach(([input]) => { input.disabled = true; });
    try {
        const result = await requestJson(managing ? `/api/browser/supervisors/${operation}` : `/api/browser/employee/supervisor/${operation}`, { auth: true, method: 'POST', body });
        if (identity !== supervisorState.identity) return;
        supervisorState.busy = false; supervisorState.dirty = false; supervisorState.form = '';
        if (await spLoad()) spMessage(result.message, 'success');
    } finally {
        if (identity === supervisorState.identity) { supervisorState.busy = false; controls.forEach(([input, disabled]) => { if (input.isConnected) input.disabled = disabled; }); }
    }
}
const spPreviousSubmit = handleDashboardSubmit;
handleDashboardSubmit = async function handleSupervisorSubmit(event) {
    const form = event.target.closest('[data-sp-form]'); if (!form) return spPreviousSubmit(event);
    event.preventDefault(); if (supervisorState.busy) return;
    const fields = new FormData(form), operation = form.dataset.spForm, body = Object.fromEntries(fields);
    if (operation === 'assignments/batch') {
        body.employeeIds = fields.getAll('assignmentEmployeeIds'); body.supervisorIds = fields.getAll('supervisorIds');
        body.confirmAssignment = fields.has('confirmAssignment');
        body.confirmClear = fields.has('confirmClear');
        if (!body.employeeIds.length || body.employeeIds.length > 100) { spMessage('請選擇 1 至 100 位設定員工。'); return; }
        if (body.employeeIds.some((id) => body.supervisorIds.includes(id))) { spMessage('設定員工與主管不可包含相同的人（不可指定本人）。'); return; }
        if (body.mode === 'add' && !body.supervisorIds.length) { spMessage('新增模式請至少選擇一位主管。'); return; }
        body.revisions = Object.fromEntries(supervisorState.assignments.employees.filter((e) => body.employeeIds.includes(e.id)).map((e) => [e.id, e.revision]));
        delete body.assignmentEmployeeIds;
    } else if (operation === 'routes') {
        body.approvalRoutes = collectAdminLeaveRoutes(form);
        body.revision = supervisorState.routes.revision;
    } else {
        body.employeeId = supervisorState.employeeId;
        if (operation !== 'leave/withdraw') {
            body.employeeIds = fields.getAll('employeeIds');
            if (!body.employeeIds.length || body.employeeIds.length > 100) { spMessage('請選擇 1 至 100 位代辦員工。'); return; }
        }
        if (operation === 'meals') { body.date = supervisorState.date; body.eating = body.eating === 'true'; body.version = supervisorState.data.meals.days.find((d) => d.date === body.date).version; }
        else if (operation === 'leave/withdraw') body.updatedAt = Number(body.updatedAt);
        else body.confirmApproval = fields.has('confirmApproval');
    }
    try { await spSave(operation === 'meals' ? 'meals/choice' : operation, body); } catch (error) { spMessage(error.message); }
};
const spPreviousSync = handleRealtimeSyncMessage;
handleRealtimeSyncMessage = async function handleSupervisorSync(payload) {
    if (['supervisorAssignments', 'employees', 'leaveSettings'].includes(payload?.type)) {
        if (payload.sessionToken === state.token && supervisorState.busy) return;
        if (spRoot() && supervisorState.dirty) { spMessage('主管設定或名冊有異動，請先確認並重新整理；未儲存內容已保留。', 'info'); return; }
        supervisorState.data = null; supervisorState.assignments = null; supervisorState.routes = null; supervisorState.sequence += 1;
        if (spRoot() && !supervisorState.busy) { supervisorState.dirty = false; supervisorState.form = ''; await spLoad(); return; }
        if (payload.type === 'supervisorAssignments') return reloadDashboard();
    }
    if (spRoot() && ['leaveRequests', 'overtimeRequests', 'meals'].includes(payload?.type)) {
        if (payload.sessionToken === state.token || supervisorState.busy) return;
        if (supervisorState.dirty) { spMessage('資料有異動，請先儲存或重新整理確認。', 'info'); return; }
        await spLoad(); return;
    }
    return spPreviousSync(payload);
};
document.addEventListener('input', (event) => {
    if (!supervisorState.busy && !event.target.matches('[data-paper-employee-search], [data-paper-employee-height]') && event.target.closest('[data-sp-form]')) supervisorState.dirty = true;
});
const spPreviousLogout = handleLogout;
handleLogout = function logoutWithSupervisorCleanup(...args) {
    Object.assign(supervisorState, { identity: '', data: null, assignments: null, routes: null, dirty: false, loading: false, busy: false, error: '', sequence: supervisorState.sequence + 1 });
    return spPreviousLogout(...args);
};
