const supervisorState = { identity: '', data: null, assignments: null, routes: null, month: '', employeeId: '', recordEmployeeIds: null,
    date: '', kind: 'leave', proxyView: 'create', managementView: 'review', page: 1, form: '', loading: false, busy: false, dirty: false, sequence: 0, error: '' };
Object.assign(auditActionLabels, { supervisor_assignment: '指定代辦主管', supervisor_proxy_create: '主管代申請', supervisor_proxy_withdraw: '主管代撤回' });
auditActionLabels.browser_punch_permission = '網頁打卡權限設定';
auditTargetTypeLabels.browser_punch_permission = '網頁打卡權限';
auditTargetTypeLabels.supervisor_assignment = '主管指定';
auditActionLabels.employee_review_supervisor = '指定審核主管';
auditTargetTypeLabels.employee_review_supervisor = '員工審核主管';
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
function spManagementView() {
    if (supervisorState.managementView === 'review' && !spCanRoutes()) supervisorState.managementView = 'assignments';
    if (supervisorState.managementView === 'assignments' && !spCanAssignments()) supervisorState.managementView = 'review';
    return supervisorState.managementView;
}
function spReviewPolicyLabel(employee) {
    const missing = (employee.requiredSupervisorIds || []).filter((id) => !(employee.supervisorIds || []).includes(id));
    return `<small class="sp-policy-label">${employee.mode === 'required' ? '指定必審主管皆需核准' : '任一位核准即可'}${missing.length ? `；必審主管 ${spEscape(missing.join('、'))} 已停用，請重新指定後才能送新單` : ''}</small>`;
}
function spAssignmentTable(data, review = false) {
    return `<div class="sp-table-scroll"><table class="sp-table"><thead><tr><th>員工</th><th>部門</th><th>${review ? '審核主管' : '指定代辦主管'}</th></tr></thead><tbody>
        ${data.employees.map((e) => `<tr><td>${spEscape(e.id)} ${spEscape(e.name)}</td><td>${spEscape(e.department)}</td><td>${(review ? e.supervisorIds || [e.supervisorId].filter(Boolean) : e.supervisorIds).map((id) => spEscape(`${id} ${data.employees.find((s) => s.id === id)?.name || '（已不存在）'}${review && e.requiredSupervisorIds?.includes(id) ? '（必審）' : ''}`)).join('、') || '未指定'}${review ? spReviewPolicyLabel(e) : ''}</td></tr>`).join('')}
        </tbody></table></div>`;
}
function spRenderRoutes() {
    if (!spCanRoutes()) return '';
    const data = supervisorState.routes;
    return `<section class="sp-route-section"><h3>請假／加班共用主管審核路徑</h3>${!data ? '<p role="status">讀取共用審核路徑中…</p>' : `
        ${data.employees.length ? `<form data-sp-form="reviewers/batch" class="sp-form">
            ${renderAdminPaperEmployeePicker(data.employees, '設定審核主管的員工', [], { name: 'reviewEmployeeIds', maxSelection: 100 })}
            ${renderAdminPaperEmployeePicker(data.employees, '指定的審核主管', [], { name: 'reviewSupervisorIds', maxSelection: 100 })}
            <div data-sp-required hidden></div>
            <div class="sp-review-submit-row"><label class="field"><span>審核規則</span><select name="reviewMode"><option value="any">任一位核准即可</option><option value="required">指定必審主管皆需核准</option></select></label>${spField('設定原因', 'reason', 'text', '', 'maxlength="500"')}
                <label class="sp-confirm"><input type="checkbox" name="confirmReview" required>確認更新所有勾選員工的請假／加班審核主管</label>
                <button class="primary-btn" type="submit">批量儲存審核主管</button></div>
            <label class="sp-confirm" data-sp-review-clear-confirm><input type="checkbox" name="confirmClear" required>確認清除所選員工的審核主管（未選主管）</label>
        </form>` : '<p>尚無可設定的員工。</p>'}${spAssignmentTable(data, true)}`}</section>`;
}
function spTargets(meal = false) {
    const employees = supervisorState.data.employees;
    const disabledIds = meal ? employees.filter((e) => !supervisorState.data.batchMeal.employees.find((m) => m.id === e.id)?.canChange).map((e) => e.id) : [];
    return renderAdminPaperEmployeePicker(employees, '代辦員工', [], {
        selectedIds: [], disabledIds, maxSelection: 100,
        notes: Object.fromEntries(disabledIds.map((id) => [id, '本日無法代登午餐']))
    });
}
function renderSupervisorAssignments() {
    const data = supervisorState.assignments;
    const view = spManagementView();
    return `<section id="supervisor-assignment-workspace" class="sp-workspace" aria-label="主管指定">
        <div class="inline-message sp-message" aria-live="polite">${spEscape(supervisorState.error)}</div>
        <div class="workspace-subnav-layout">
            <aside class="workspace-subnav-sidebar" aria-label="主管指定子導覽"><nav class="workspace-subnav-card"><div class="workspace-subnav-items">
                ${[['review', '主管審核', spCanRoutes()], ['assignments', '代辦主管', spCanAssignments()]].filter(([, , visible]) => visible).map(([id, label]) => `<button type="button" class="workspace-subnav-item ${view === id ? 'is-active' : ''}" data-action="sp-management-view" data-view="${id}" aria-current="${view === id ? 'page' : 'false'}">${label}</button>`).join('')}
            </div></nav></aside><div class="workspace-subnav-content">
        ${view === 'review' ? `<div class="sp-toolbar">${spButton('refresh', '重新整理')}</div>${spRenderRoutes()}` : `
        <div class="sp-toolbar"><h3>指定代辦主管</h3>${spButton('refresh', '重新整理')}</div>
        ${!data ? '<p role="status">讀取主管指定資料中…</p>' : `${data.employees.length ? `<form data-sp-form="assignments/batch" class="sp-form">
            ${renderAdminPaperEmployeePicker(data.employees, '設定主管的員工', [], { name: 'assignmentEmployeeIds', maxSelection: 100 })}
            ${renderAdminPaperEmployeePicker(data.employees, '指定的代辦主管', [], { name: 'supervisorIds', maxSelection: 100 })}
            <div class="sp-assignment-submit-row"><label class="field"><span>設定模式</span><select name="mode">
                <option value="add">新增主管（保留原指定）</option><option value="replace">取代主管（改為本次勾選）</option>
            </select></label>
            ${spField('設定原因', 'reason', 'text', '', 'maxlength="500"')}
            <label class="sp-confirm"><input type="checkbox" name="confirmAssignment" required>確認依所選模式更新所有勾選員工的代辦主管授權</label>
            <button type="submit" class="primary-btn" ${supervisorState.busy ? 'disabled' : ''}>批量儲存主管指定</button>
            </div><label class="sp-confirm" data-sp-clear-confirm hidden><input type="checkbox" name="confirmClear" disabled>確認清除所有勾選員工的全部代辦主管授權（未選主管）</label>
        </form>` : '<p>尚無可設定的員工。</p>'}
        ${data.reviewOnly?.length ? `<section aria-label="審核主管代辦授權待確認"><h4>審核主管代辦授權待確認</h4>
            <div class="sp-table-scroll"><table class="sp-table"><thead><tr><th>員工</th><th>審核主管（尚未有代辦授權）</th></tr></thead><tbody>${data.reviewOnly.map((r) => `<tr><td>${spEscape(r.employeeId)} ${spEscape(data.employees.find((e) => e.id === r.employeeId)?.name || '')}</td><td>${spEscape(r.supervisorId)} ${spEscape(data.employees.find((e) => e.id === r.supervisorId)?.name || '')}</td></tr>`).join('')}</tbody></table></div>
        </section>` : ''}${spAssignmentTable(data)}`}`}
        </div></div>
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
            const meal = supervisorState.kind === 'meals', row = meal ? day.rows[0] : null, multi = meal && day.rows.length > 1;
            const choosing = supervisorState.proxyView === 'create';
            const label = choosing ? meal ? (day.serving ? '供餐' : '未供餐') : '選擇日期' : meal ? !day.serving ? '未供餐' : multi ? `用餐 ${day.rows.filter((r) => r.eating).length}／不用餐 ${day.rows.filter((r) => !r.eating).length}` : !row.eligible ? '未參加' : row.eating ? '用餐' : '不用餐' : `${day.totalCount} 件`;
            return `<button type="button" class="meal-date ${!choosing && !meal && day.totalCount > 0 ? 'has-records' : ''} ${day.date === supervisorState.date ? 'is-selected' : ''} ${meal && row.eating ? 'is-eating' : ''}" data-action="sp-date" data-date="${day.date}" aria-pressed="${day.date === supervisorState.date}" aria-label="${day.date} ${label}">
                <span class="meal-date-number">${Number(day.date.slice(-2))}${day.date === spToday() ? '<small>今天</small>' : ''}</span><span class="meal-date-status ${!choosing && !meal ? 'sp-record-count' : ''}">${label}</span>
                <small class="meal-date-deadline">${meal ? !day.serving ? '&nbsp;' : day.locked ? `<span>${day.revision ? '已結單' : '已截止'}</span>` : `<span>${day.cutoff}</span><span>截止</span>` : choosing ? '' : `<span class="${day.approvedCount > 0 ? 'sp-count-approved' : ''}">核准 ${day.approvedCount}</span><span class="${day.pendingCount > 0 ? 'sp-count-pending' : ''}">待審 ${day.pendingCount}</span>`}</small>
                ${row?.warning ? '<span class="meal-warning-dot" title="全日請假仍預訂午餐">請假</span>' : ''}</button>`;
        }).join('')}</div>`;
}
function spCategoryLabel(kind = supervisorState.kind) {
    return { leave: '請假', overtime: '加班', meals: '午餐團膳' }[kind] || '請假';
}
function spCategoryTitle(text) {
    return spEscape(text).replace(/午餐團膳|午餐|團膳|請假|加班/g, (word) => {
        const kind = word === '請假' ? 'leave' : word === '加班' ? 'overtime' : 'meals';
        return '<span class="sp-category-word sp-category-word-' + kind + '">' + word + '</span>';
    });
}
function spRequestForm() {
    const kind = supervisorState.kind, leave = kind === 'leave', date = supervisorState.date;
    return `<form data-sp-form="${kind}" class="sp-form">
        <h4>${spCategoryTitle(`代申請${spCategoryLabel(kind)}`)}</h4>${spTargets()}
        <div class="sp-entry-grid ${leave ? 'sp-entry-leave' : 'sp-entry-overtime'}">${spField('開始日期', 'startDate', 'date', date)}${spField(leave ? '每日開始時間' : '開始時間', 'startTime', 'time', leave ? '08:20' : '17:30')}
        ${spField('結束日期', 'endDate', 'date', date)}${spField(leave ? '每日結束時間' : '結束時間', 'endTime', 'time', leave ? '17:00' : '19:30')}
        ${leave ? `<label class="field"><span>假別</span><select name="leaveTypeId" required><option value="">請選擇假別</option>${supervisorState.data.leaveTypes.map((t) => `<option value="${spEscape(t.id)}">${spEscape(t.name)}</option>`).join('')}</select></label>` : ''}
         ${spField('每人整筆時數', 'durationHours', 'number', leave ? '' : '2', 'readonly placeholder="由時段自動計算" min="0.01" step="0.01"')}
        ${leave ? renderLeaveDaysAddTools({ autoHours: true, categoryKeywords: true, supervisorLayout: true }) : ''}</div>
        ${leave ? `${renderLeaveDaysEditor({ batch: true, autoHours: true, externalTools: true, categoryKeywords: true, supervisorSteps: true })}<div data-sp-leave-meals></div>` : ''}
        ${spField('申請事由', 'reason', 'text', '', 'maxlength="2000"')}${spReasonField('proxyReason')}
        <label class="sp-confirm"><input type="checkbox" name="confirmApproval" required>確認替所有勾選員工代申請相同內容；多主管設定依各人審核規則送審，原單主管代辦流程保留</label>
        <div class="inline-actions"><button class="primary-btn" type="submit" ${supervisorState.busy || !spCanWrite() ? 'disabled' : ''}>代送出${spCategoryLabel(kind)}申請</button>${spButton('reset-form', '重設表單')}</div>
    </form>`;
}
function spPaintLeaveMeals(form) {
    const host = form.querySelector('[data-sp-leave-meals]');
    if (host) host.innerHTML = renderLeaveMealOptions(form, supervisorState.data?.employees || [], { categoryKeywords: true });
}
async function spLoadLeaveMeals(form, force = false) {
    if (!form || form.dataset.spForm !== 'leave') return;
    const identity = supervisorState.identity;
    let body;
    try {
        body = { ...collectLeaveDays(form), employeeIds: [...form.querySelectorAll('[name="employeeIds"]:checked')].map((input) => input.value) };
        if (!body.employeeIds.length) throw new Error('請先選擇代辦員工。');
    } catch (error) {
        const meals = leaveMealState(form); meals.sequence += 1; meals.key = ''; meals.options = []; meals.loading = false; meals.error = ''; spPaintLeaveMeals(form);
        if (force) throw error; return;
    }
    await loadLeaveMealOptions(form, body, '/api/browser/employee/supervisor/leave/meal-options',
        () => form.isConnected && supervisorState.identity === identity, () => spPaintLeaveMeals(form), force);
}
function spMealDetail() {
    const day = supervisorState.data.meals.days.find((d) => d.date === supervisorState.date);
    if (!day) return '';
    if (supervisorState.proxyView === 'records' && day.rows.length > 1) return `<section class="sp-day-detail"><h4>${day.date} ${spCategoryTitle('午餐團膳紀錄')}</h4><p>${day.serving ? '供餐' : '未供餐'} · ${day.cutoff} 截止（台北時間）${day.revision ? ' · 已結單' : ''}</p>${day.rows.map((row) => `<article class="sp-record"><strong>${spEscape(row.employee_id)} ${spEscape(supervisorState.data.employees.find((e) => e.id === row.employee_id)?.name || '')}</strong><p>${!row.eligible ? '未參加' : row.eating ? '用餐' : '不用餐'}${row.submittedEating == null ? ' · 未交單' : row.submittedEating ? ' · 已交單：用餐' : ' · 已交單：不用餐'}${row.warning ? ' · 全日請假仍預訂午餐' : ''}</p></article>`).join('')}</section>`;
    const row = day.rows[0], allowed = day.serving && !day.locked && Date.now() < day.deadline;
    const creating = supervisorState.proxyView === 'create';
    return `<section class="sp-day-detail"><h4>${day.date} ${spCategoryTitle(`午餐團膳${creating ? '代登' : '紀錄'}`)}</h4><p>${day.serving ? '供餐' : '未供餐'} · ${day.cutoff} 截止（台北時間）${creating ? '' : ` · ${spEscape(supervisorState.employeeId)} · ${row.eating ? '用餐' : '不用餐'}`}${day.revision ? ' · 已結單' : ''}${creating || row.submittedEating == null ? '' : ` · 已交單：${row.submittedEating ? '用餐' : '不用餐'}`}</p>
        ${!creating && row.warning ? '<div class="meal-warning-row"><span>全日請假仍預訂午餐；請至「建立代辦申請」修改午餐安排。</span></div>' : ''}
        ${creating && allowed ? `<form data-sp-form="meals" class="sp-form">${spTargets(true)}<label class="field"><span>是否用餐</span><select name="eating"><option value="true">用餐</option><option value="false">不用餐</option></select></label>
        ${spReasonField('reason')}<button class="primary-btn" type="submit" ${supervisorState.busy || !spCanWrite() ? 'disabled' : ''}>代送出午餐團膳申請</button></form>` : creating ? `<p class="meal-lock">${!day.serving ? '本日未供餐' : '已截止或已結單，請聯絡團膳管理者。'}</p>` : ''}</section>`;
}
function spRequestDetail() {
    const detail = supervisorState.data.calendar.detail;
    return `<section class="sp-day-detail"><div class="sp-toolbar"><h4>${supervisorState.date} ${spCategoryTitle(spCategoryLabel())}</h4></div>
        ${supervisorState.kind === 'leave' && typeof leBalanceTable === 'function' ? leBalanceTable(supervisorState.data.leaveBalances || []) : ''}
        <div class="sp-records">${detail.records.map((row) => `<article class="sp-record"><div class="sp-toolbar"><strong>${row.leaveTypeName ? spEscape(row.leaveTypeName) : spCategoryTitle('加班')} · ${spEscape(row.statusText)}</strong>
            ${row.canProxyWithdraw ? spButton('withdraw', '代撤回', `data-id="${spEscape(row.id)}"`, !spCanWrite()) : ''}</div>
            <p>對象：${spEscape(row.employeeId)} ${spEscape(row.employeeName)}</p><p>${spEscape(row.startText)} 至 ${spEscape(row.endText)} · ${spEscape(row.duration_hours)} 小時</p><p>${spEscape(row.reason)}</p>
            ${supervisorState.kind === 'leave' ? renderLeaveDaysSummary(row, { categoryKeywords: true }) : ''}
            <p>${spEscape(row.approvalModeText)}${row.applicantId || row.applicant_id ? ` · 申請人：${spEscape(row.applicantId || row.applicant_id)} ${spEscape(row.applicantName || '姓名未記錄')}` : ' · 申請人：未記錄'}</p>
            ${row.proxyReason || row.proxy_reason ? `<p>代辦原因：${spEscape(row.proxyReason || row.proxy_reason)}</p>` : ''}
            ${supervisorState.form === `withdraw:${row.id}` && row.canProxyWithdraw ? `<form data-sp-form="leave/withdraw" class="sp-form">
                <input type="hidden" name="employeeId" value="${spEscape(row.employeeId)}"><input type="hidden" name="requestId" value="${spEscape(row.id)}"><input type="hidden" name="updatedAt" value="${row.updated_at}">
                ${spField('代撤回原因', 'reason', 'text', '', 'maxlength="500"')}
                <label class="sp-confirm"><input type="checkbox" name="confirmWithdrawal" required>確認代 ${spEscape(row.employeeId)} ${spEscape(row.employeeName)} 撤回這筆請假</label>
                <div class="inline-actions"><button class="primary-btn" type="submit" ${!spCanWrite() ? 'disabled' : ''}>確認代撤回</button>${spButton('cancel-form', '取消')}</div>
            </form>` : ''}</article>`).join('') || '<p>本日沒有申請紀錄。</p>'}</div>
        ${detail.totalPages > 1 ? `<div class="inline-actions">${spButton('page', '←', `data-page="${detail.page - 1}" aria-label="上一頁"`, detail.page <= 1)}<span>${detail.page} / ${detail.totalPages}</span>${spButton('page', '→', `data-page="${detail.page + 1}" aria-label="下一頁"`, detail.page >= detail.totalPages)}</div>` : ''}</section>`;
}
function renderSupervisorWorkspace() {
    const data = supervisorState.data, canUse = spCanView();
    return `<section id="supervisor-workspace" class="sp-workspace" aria-label="主管代辦">
        <div class="sp-toolbar"><h3>主管代辦</h3>${spButton('refresh', '重新整理', '', !canUse)}</div>
        <div class="inline-message sp-message" aria-live="polite">${spEscape(supervisorState.error)}</div>
        <p class="muted">指定代辦主管可用本人卡號或個人網頁密碼登入，僅能代辦明確指定的員工；申請仍依審核規則處理，並保留操作者與代辦原因。</p>
        ${!spCanWrite() && canUse ? '<p role="status">身份模擬可查看紀錄並試填草稿；送出、撤回及儲存常用原因需主管本人登入。</p>' : ''}${!canUse ? '<p>目前沒有主管代辦檢視權限。</p>' : !data ? `<p role="status">${supervisorState.error ? '無法讀取目前查詢；可清除名單後重新選擇。' : '讀取代辦資料中…'}</p>${supervisorState.error ? spButton('reset-record-selection', '重新選擇查詢員工') : ''}` : !data.employees.length ? '<p>目前沒有獲指定的代辦員工。</p>' : `
        <div class="sp-mode-tabs" role="tablist" aria-label="代辦工作模式">${[['create', '建立代辦申請'], ['records', '查看代辦紀錄']].map(([view, label]) => `<button type="button" role="tab" data-action="sp-proxy-view" data-view="${view}" aria-selected="${supervisorState.proxyView === view}" class="${supervisorState.proxyView === view ? 'is-active' : ''}">${label}</button>`).join('')}</div>
        <p class="sp-mode-description">${supervisorState.proxyView === 'create' ? '先選項目與日期，再在申請表勾選本次代辦對象。下方日曆僅用來選擇日期。' : '可多選已授權員工合併查看紀錄；查詢名單不會帶入新增申請。'}</p>
        ${supervisorState.proxyView === 'records' ? renderAdminPaperEmployeePicker(data.employees, '紀錄查詢對象', [], {
            name: 'viewEmployeeIds', maxSelection: 100, selectedIds: supervisorState.recordEmployeeIds || [], inputAttributes: 'data-sp-employee'
        }) : ''}
        <div class="sp-toolbar"><div class="meal-month-controls">${spButton('month', '←', 'data-offset="-1" aria-label="上個月"')}<input type="month" data-sp-month aria-label="代辦月份" value="${supervisorState.month}" min="2000-01" max="2100-12">${spButton('month', '→', 'data-offset="1" aria-label="下個月"')}</div></div>
        <section class="sp-category-panel sp-category-${supervisorState.kind}" aria-label="${spCategoryLabel()}代辦"><div class="meal-tabs sp-kind-tabs" role="tablist" aria-label="代辦項目">${[['leave', '請假'], ['overtime', '加班'], ['meals', '午餐團膳']].map(([kind, label]) => `<button type="button" role="tab" data-action="sp-kind" data-kind="${kind}" aria-selected="${supervisorState.kind === kind}" class="sp-kind-${kind} ${supervisorState.kind === kind ? 'is-active' : ''}">${label}</button>`).join('')}</div>

        ${supervisorState.proxyView === 'records' && !supervisorState.recordEmployeeIds?.length ? '<p class="sp-empty-records">請先選擇紀錄查詢員工。</p>' : `${spCalendar(data)}${supervisorState.kind === 'meals' ? spMealDetail() : supervisorState.proxyView === 'create' ? spRequestForm() : spRequestDetail()}`}</section>`}
    </section>`;
}
function spPaint() {
    const root = spRoot();
    if (root) {
        root.outerHTML = spManagement() ? renderSupervisorAssignments() : renderSupervisorWorkspace();
        setupPaperEmployeePickerSizes();
        setupLeaveDaysEditors();
        spLoadLeaveMeals(spRoot()?.querySelector('[data-sp-form="leave"]')).catch(() => {});
    }
}
function spSyncAssignmentClear(form, reset = false) {
    const review = form?.dataset.spForm === 'reviewers/batch';
    if (!review && form?.dataset.spForm !== 'assignments/batch') return;
    const clearing = review ? !form.querySelector('[name="reviewSupervisorIds"]:checked') : form.querySelector('[name="mode"]').value === 'replace' && !form.querySelector('[name="supervisorIds"]:checked');
    const label = form.querySelector(review ? '[data-sp-review-clear-confirm]' : '[data-sp-clear-confirm]'), control = label.querySelector('input');
    label.hidden = !clearing; control.disabled = !clearing; control.required = clearing;
    if (reset || !clearing) control.checked = false;
    if (review) spSyncRequired(form);
}
function spSyncRequired(form) {
    const root = form.querySelector('[data-sp-required]');
    const enabled = form.querySelector('[name="reviewMode"]').value === 'required'; root.hidden = !enabled;
    if (!enabled) { root.innerHTML = ''; return; }
    const ids = [...form.querySelectorAll('[name="reviewSupervisorIds"]:checked')].map((input) => input.value);
    const selectedIds = [...root.querySelectorAll('[name="requiredSupervisorIds"]:checked')].map((input) => input.value);
    root.innerHTML = renderAdminPaperEmployeePicker(supervisorState.routes.employees.filter((e) => ids.includes(e.id)), '必須核准的主管', [], { name: 'requiredSupervisorIds', selectedIds, maxSelection: 100 });
    root.querySelectorAll('[data-paper-employee-field]').forEach(syncAdminPaperEmployeePicker);
}
async function spLoad() {
    const identity = supervisorState.identity, sequence = ++supervisorState.sequence, managing = spManagement();
    supervisorState.loading = true;
    try {
        const url = managing ? spCanAssignments() ? '/api/browser/supervisors/assignments' : '/api/browser/supervisors/reviewers' : `/api/browser/employee/supervisor?${new URLSearchParams({
            month: supervisorState.month, kind: supervisorState.kind === 'meals' ? 'leave' : supervisorState.kind, page: supervisorState.page,
            ...(supervisorState.proxyView === 'records' && supervisorState.recordEmployeeIds !== null ? { employeeIds: supervisorState.recordEmployeeIds.join(',') } : supervisorState.employeeId ? { employeeId: supervisorState.employeeId } : {}), ...(supervisorState.date ? { date: supervisorState.date } : {}) })}`;
        const result = await requestJson(url, { auth: true });
        const routes = managing && spCanRoutes() ? spCanAssignments() ? (await requestJson('/api/browser/supervisors/reviewers', { auth: true })).routes : result.routes : null;
        if (identity !== supervisorState.identity || sequence !== supervisorState.sequence) return;
        if (managing) {
            supervisorState.routes = routes; supervisorState.assignments = result.assignments || null;
        } else { supervisorState.data = result.proxy; supervisorState.employeeId = result.proxy.employeeId || ''; if (supervisorState.proxyView === 'records' || supervisorState.recordEmployeeIds === null) supervisorState.recordEmployeeIds = result.proxy.employeeIds || (result.proxy.employeeId ? [result.proxy.employeeId] : []); }
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
    if (identity !== supervisorState.identity) (document.querySelectorAll?.('.sp-reasons-dialog') || []).forEach((dialog) => { dialog.close(); dialog.remove(); });
    if (identity !== supervisorState.identity) Object.assign(supervisorState, { identity, data: null, assignments: null, routes: null, month: spToday().slice(0, 7),
        date: spToday(), employeeId: '', recordEmployeeIds: null, assignmentId: '', kind: 'leave', proxyView: 'create', managementView: 'review', page: 1, form: '', loading: false, busy: false, dirty: false, error: '', sequence: supervisorState.sequence + 1 });
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
    if (spRoot() && !supervisorState.loading && !supervisorState.error && (spManagement() ? spCanAssignments() ? !supervisorState.assignments : !supervisorState.routes : !supervisorState.data && spCanView())) spLoad();
    spLoadLeaveMeals(spRoot()?.querySelector('[data-sp-form="leave"]')).catch(() => {});
};
const spPreviousClick = handleDashboardClick;
handleDashboardClick = async function handleSupervisorClick(event) {
    const button = event.target.closest('[data-action]'), action = button?.dataset.action;
    if (['paper-select-visible-employees', 'paper-clear-employees'].includes(action) && button.closest('[data-paper-employee-field]')?.querySelector('[data-sp-employee]')) {
        event.preventDefault(); if (supervisorState.busy || !await spDiscard()) return;
        const field = button.closest('[data-paper-employee-field]');
        await spPreviousClick(event);
        supervisorState.recordEmployeeIds = [...field.querySelectorAll('[data-sp-employee]:checked')].map((input) => input.value);
        supervisorState.form = ''; supervisorState.dirty = false; supervisorState.page = 1;
        await spLoad(); return;
    }
    if (['paper-select-visible-employees', 'paper-clear-employees'].includes(action) && button.closest('[data-sp-form]')) {
        event.preventDefault(); if (supervisorState.busy) return;
        const field = button.closest('[data-paper-employee-field]');
        const before = [...field.querySelectorAll('[data-paper-employee-checkbox]:checked')].map((input) => input.value).join('\n');
        await spPreviousClick(event);
        const after = [...field.querySelectorAll('[data-paper-employee-checkbox]:checked')].map((input) => input.value).join('\n');
        if (before !== after) {
            supervisorState.dirty = true;
            spSyncAssignmentClear(button.closest('[data-sp-form]'), true);
            spLoadLeaveMeals(button.closest('[data-sp-form]')).catch(() => {});
        }
        return;
    }
    if (!action?.startsWith('sp-')) {
        if (supervisorState.dirty && button && (button.dataset.action.includes('workspace') || button.dataset.action.includes('section'))) {
            if (!await spDiscard()) { event.preventDefault(); return; }
            supervisorState.dirty = false; supervisorState.form = '';
        }
        if (action === 'jump-leave-routes') supervisorState.managementView = 'review';
        return spPreviousClick(event);
    }
    event.preventDefault(); if (supervisorState.busy) return;
    if (action === 'sp-reason-preset') { const input = button.closest('[data-sp-form]').elements[button.dataset.field]; input.value = spPresets().values[Number(button.dataset.index)] || ''; input.dispatchEvent(new Event('input', { bubbles: true })); return; }
    if (action === 'sp-reason-settings') { spOpenReasons(); return; }
    if (action === 'sp-withdraw' && !spCanWrite()) { spMessage('身份模擬無法代撤回。'); return; }
    if (action === 'sp-management-view') {
        const view = button.dataset.view;
        if (!['review', 'assignments'].includes(view) || (view === 'review' ? !spCanRoutes() : !spCanAssignments()) || view === spManagementView()) return;
        if (!await spDiscard()) return;
        supervisorState.dirty = false; supervisorState.managementView = view; spPaint(); return;
    }
    if (action === 'sp-cancel-meal') {
        const form = spRoot()?.querySelector('[data-sp-form="meals"]');
        if (form) {
            form.querySelectorAll('[name="employeeIds"]').forEach((input) => { input.checked = false; });
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
    if (action === 'sp-reset-record-selection') { supervisorState.proxyView = 'records'; supervisorState.recordEmployeeIds = []; supervisorState.employeeId = ''; supervisorState.page = 1; await spLoad(); return; }
    if (action === 'sp-proxy-view') { if (!['create', 'records'].includes(button.dataset.view)) return; supervisorState.proxyView = button.dataset.view; supervisorState.page = 1; await spLoad(); return; }
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
                const selectedIds = supervisorState.recordEmployeeIds || [];
                const field = target.closest('[data-paper-employee-field]');
                field.querySelectorAll('[data-paper-employee-checkbox]').forEach((input) => { input.checked = selectedIds.includes(input.value); });
                syncAdminPaperEmployeePicker(field);
            }
            return;
        }
        supervisorState.dirty = false; supervisorState.form = ''; supervisorState.page = 1;
        if (target.hasAttribute('data-sp-employee')) supervisorState.recordEmployeeIds = [...target.closest('[data-paper-employee-field]').querySelectorAll('[data-sp-employee]:checked')].map((input) => input.value);
        else { supervisorState.month = target.value; supervisorState.date = `${target.value}-01`; }
        await spLoad(); return;
    }
    if (target.matches('[data-paper-employee-height]')) return;
    if (target.matches('[data-paper-employee-department]')) return spPreviousChange(event);
    if (target.closest('[data-sp-form]')) {
        spSyncOvertime(target.closest('[data-sp-form="overtime"]'));
        if (supervisorState.busy) return;
        if (target.matches('[data-paper-employee-checkbox]')) await spPreviousChange(event);
        spSyncAssignmentClear(target.closest('[data-sp-form]'), target.matches('[name="mode"], [data-paper-employee-checkbox]'));
        if (target.matches('[data-leave-meal-choice]')) leaveMealState(target.closest('[data-sp-form]')).selected[target.dataset.leaveMealChoice] = target.checked;
        else spLoadLeaveMeals(target.closest('[data-sp-form]')).catch(() => {});
        supervisorState.dirty = true; return;
    }
    return spPreviousChange(event);
};
async function spSave(operation, body) {
    const identity = supervisorState.identity, managing = ['assignments/batch', 'reviewers/batch'].includes(operation);
    if (!managing && !spCanWrite()) throw new Error('身份模擬無法送出代辦異動，請以主管本人登入。');
    const controls = [...(spRoot()?.querySelectorAll('input, select, button') || [])].map((input) => [input, input.disabled]);
    supervisorState.busy = true; controls.forEach(([input]) => { input.disabled = true; });
    try {
        const result = await requestJson(managing ? `/api/browser/supervisors/${operation}` : `/api/browser/employee/supervisor/${operation}`, { auth: true, method: 'POST', body });
        if (identity !== supervisorState.identity) return;
        supervisorState.busy = false; supervisorState.dirty = false; supervisorState.form = '';
        if (operation === 'reviewers/batch' && state.dashboard?.datasets?.leave) {
            state.dashboard.datasets.leave.approvalRoutes = result.routes.employees.flatMap((e) => e.supervisorIds.map((id) => ({ employee_id: e.id, supervisor_id: id })));
        }
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
    if (!['assignments/batch', 'reviewers/batch'].includes(operation) && !spCanWrite()) { spMessage('身份模擬無法送出代辦異動，請以主管本人登入。'); return; }
    if (operation === 'assignments/batch') {
        body.employeeIds = fields.getAll('assignmentEmployeeIds'); body.supervisorIds = fields.getAll('supervisorIds');
        body.confirmAssignment = fields.has('confirmAssignment');
        body.confirmClear = fields.has('confirmClear');
        if (!body.employeeIds.length || body.employeeIds.length > 100) { spMessage('請選擇 1 至 100 位設定員工。'); return; }
        if (body.employeeIds.some((id) => body.supervisorIds.includes(id))) { spMessage('設定員工與主管不可包含相同的人（不可指定本人）。'); return; }
        if (body.mode === 'add' && !body.supervisorIds.length) { spMessage('新增模式請至少選擇一位主管。'); return; }
        body.revisions = Object.fromEntries(supervisorState.assignments.employees.filter((e) => body.employeeIds.includes(e.id)).map((e) => [e.id, e.revision]));
        delete body.assignmentEmployeeIds;
    } else if (operation === 'reviewers/batch') {
        body.employeeIds = fields.getAll('reviewEmployeeIds'); body.supervisorIds = fields.getAll('reviewSupervisorIds');
        body.mode = fields.get('reviewMode'); body.requiredSupervisorIds = body.mode === 'required' ? fields.getAll('requiredSupervisorIds') : [];
        body.confirmReview = fields.has('confirmReview'); body.confirmClear = fields.has('confirmClear');
        if (!body.employeeIds.length || body.employeeIds.length > 100) { spMessage('請選擇 1 至 100 位設定員工。'); return; }
        if (body.employeeIds.some((id) => body.supervisorIds.includes(id))) { spMessage('不可指定員工本人為自己的審核主管。'); return; }
        body.revisions = Object.fromEntries(supervisorState.routes.employees.filter((e) => body.employeeIds.includes(e.id)).map((e) => [e.id, e.revision]));
        delete body.reviewEmployeeIds; delete body.reviewSupervisorIds; delete body.reviewMode;
    } else {
        body.employeeId = operation === 'leave/withdraw' ? fields.get('employeeId') : supervisorState.employeeId;
        if (operation !== 'leave/withdraw') {
            body.employeeIds = fields.getAll('employeeIds');
            if (!body.employeeIds.length || body.employeeIds.length > 100) { spMessage('請選擇 1 至 100 位代辦員工。'); return; }
        }
        if (operation === 'meals') { body.date = supervisorState.date; body.eating = body.eating === 'true'; body.version = supervisorState.data.meals.days.find((d) => d.date === body.date).version; }
        else if (operation === 'leave/withdraw') body.updatedAt = Number(body.updatedAt);
        else body.confirmApproval = fields.has('confirmApproval');
    }
    try {
        if (operation === 'overtime') { spSyncOvertime(form); body.durationHours = form.elements.durationHours.value; if (!body.durationHours) throw new Error('請填寫有效的加班開始與結束時段。'); }
        if (operation === 'leave') {
            if (!body.leaveTypeId) throw new Error('請選擇假別。');
            if (!String(body.reason || '').trim()) throw new Error('請填寫請假事由。');
            Object.assign(body, collectLeaveDays(form));
            await spLoadLeaveMeals(form);
            if (!form.isConnected) return;
            const latest = { ...collectLeaveDays(form), employeeIds: [...form.querySelectorAll('[name="employeeIds"]:checked')].map((input) => input.value) };
            if (leaveMealRequestKey(latest) !== leaveMealRequestKey(body)) throw new Error('代辦對象或時段已變更，請重新確認後送出。');
            requireLeaveMealOptionsReady(form, body);
            body.mealOptOuts = collectLeaveMealChoices(form, body);
        }
        await spSave(operation === 'meals' ? 'meals/choice' : operation, body);
    } catch (error) { spMessage(error.message); if (operation === 'leave') spLoadLeaveMeals(form, true).catch(() => {}); }
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
    if (!supervisorState.busy) spSyncOvertime(event.target.closest('[data-sp-form="overtime"]'));
    if (!supervisorState.busy) spLoadLeaveMeals(event.target.closest('[data-sp-form="leave"]')).catch(() => {});
});
document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-leave-meal-retry]')) { const form = event.target.closest('[data-sp-form="leave"]'); if (form) { event.preventDefault(); spLoadLeaveMeals(form, true).catch(() => {}); } }
});
const spPreviousLogout = handleLogout;
handleLogout = function logoutWithSupervisorCleanup(...args) {
    (document.querySelectorAll?.('.sp-reasons-dialog') || []).forEach((dialog) => { dialog.close(); dialog.remove(); });
    Object.assign(supervisorState, { identity: '', data: null, assignments: null, routes: null, dirty: false, loading: false, busy: false, error: '', sequence: supervisorState.sequence + 1 });
    return spPreviousLogout(...args);
};
function spCanView() { return Boolean(state.dashboard?.supervisorProxy?.canView || state.dashboard?.supervisorProxy?.canUse); }
function spCanWrite() { return Boolean(state.dashboard?.supervisorProxy?.canUse); }
function spPresets() { return supervisorState.data?.reasonPresets || { values: ['員工不便操作，主管代為申請', '依員工通知，主管協助登記'], revision: 0, canEdit: false }; }
function spReasonField(name) {
    return `<div class="field sp-reason-field"><div class="sp-reason-label"><label for="sp-${name}">代辦原因</label><div class="sp-reason-pills">${spPresets().values.map((value, index) => `<button type="button" class="sp-reason-pill" data-action="sp-reason-preset" data-field="${name}" data-index="${index}">${spEscape(value)}</button>`).join('')}</div>${spButton('reason-settings', '管理常用原因')}</div><input id="sp-${name}" name="${name}" type="text" maxlength="500" required></div>`;
}
function spSyncOvertime(form) {
    if (form?.dataset?.spForm !== 'overtime') return;
    const f = form.elements;
    if (!f?.startDate || !f.startTime || !f.endDate || !f.endTime || !f.durationHours) return;
    const start = new Date(`${f.startDate.value}T${f.startTime.value}:00+08:00`).getTime(), end = new Date(`${f.endDate.value}T${f.endTime.value}:00+08:00`).getTime();
    const minutes = (end - start) / 60000;
    f.durationHours.value = Number.isFinite(minutes) && minutes > 0 ? String(Math.floor(minutes * 100 / 60) / 100) : '';
}
function spOpenReasons() {
    if (document.querySelector('.sp-reasons-dialog')) return;
    const identity = supervisorState.identity, presets = spPresets(), editable = spCanWrite() && presets.canEdit;
    const dialog = document.createElement('dialog'); dialog.className = 'sp-reasons-dialog'; dialog.setAttribute('aria-labelledby', 'sp-reasons-title');
    dialog.innerHTML = `<form><h3 id="sp-reasons-title">管理常用原因</h3><p>請設定兩個常用代辦原因。</p>${presets.values.map((value, i) => `<label class="field" for="sp-preset-${i}"><span>常用原因 ${i + 1}</span><input id="sp-preset-${i}" name="preset${i}" value="${spEscape(value)}" maxlength="500" required></label>`).join('')}<p class="inline-message" role="status" aria-live="polite"></p>${!editable ? '<p>身份模擬只能試填，無法儲存設定。</p>' : ''}<div class="inline-actions"><button type="submit" class="primary-btn" ${!editable ? 'disabled' : ''}>儲存常用原因</button><button type="button" class="outline-btn" data-close>關閉</button></div></form>`;
    let saving = false;
    const close = () => { if (!saving) { dialog.close(); dialog.remove(); } };
    dialog.querySelector('[data-close]').addEventListener('click', close);
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
    dialog.querySelector('form').addEventListener('submit', async (event) => {
        event.preventDefault(); if (saving || !editable || !spCanWrite() || identity !== supervisorState.identity) return;
        const values = [0, 1].map((i) => dialog.querySelector(`[name="preset${i}"]`).value.trim());
        const message = dialog.querySelector('[role="status"]');
        if (values.some((value) => !value)) { message.textContent = '請填寫兩個常用原因。'; return; }
        saving = true; dialog.querySelectorAll('button, input').forEach((input) => { input.disabled = true; });
        try {
            const result = await requestJson('/api/browser/employee/supervisor/reason-presets', { auth: true, method: 'POST', body: { values, revision: presets.revision } });
            if (identity !== supervisorState.identity || !dialog.isConnected) return;
            supervisorState.data.reasonPresets = result.reasonPresets;
            // Update only the pills so that application drafts and dirty state remain intact.
            spRoot()?.querySelectorAll('[data-action="sp-reason-preset"]').forEach((button) => { button.textContent = result.reasonPresets.values[Number(button.dataset.index)]; });
            saving = false; close();
        } catch (error) { if (identity === supervisorState.identity && dialog.isConnected) message.textContent = error.message; }
        finally { saving = false; if (identity === supervisorState.identity && dialog.isConnected) dialog.querySelectorAll('button, input').forEach((input) => { input.disabled = false; }); }
    });
    document.body.append(dialog); dialog.showModal();
}
