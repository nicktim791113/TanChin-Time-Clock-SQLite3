const mealState = { identity: '', month: '', selectedDate: '', data: null, panel: 'calendar', employeeId: '', loading: false, busy: false, dirty: false, pending: false, dashboard: null, sequence: 0, memberFilters: { query: '', department: '', status: '' }, memberEdit: null };
const mealWeekLabels = ['日', '一', '二', '三', '四', '五', '六'];
Object.assign(auditActionLabels, { meal_choice: '午餐登記／修正', meal_membership: '團膳參加資格', meal_schedule: '供餐制度', meal_day: '每日供餐設定', meal_close: '供應商交單', meal_export: '團膳月報匯出' });
auditTargetTypeLabels.meal = '午餐團膳';
const mealEscape = (value) => escapeHtml(String(value ?? ''));
function mealIsAdmin() { return state.dashboard?.role === 'admin'; }
function mealCan(permission) { return mealIsAdmin() && getAdminPermissionSet().has(`admin.meals.${permission}`); }
function mealActive() { return mealIsAdmin() ? state.activeSections.admin === 'meals' : state.dashboard?.role === 'employee' && state.employeeWorkspacePanel === 'meals'; }
function mealToday() { return mealState.data?.today || state.dashboard?.meals?.today || new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10); }
function mealNextMonth() { const date = new Date(`${mealToday().slice(0, 7)}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + 1); return date.toISOString().slice(0, 10); }
function mealTimestamp(value) { return value ? new Date(value).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }) : '—'; }
function mealButton(action, label, attributes = '', disabled = false) {
    return `<button type="button" class="outline-btn" data-action="meal-${action}" ${attributes} ${disabled || mealState.busy ? 'disabled' : ''}>${label}</button>`;
}
function mealField(label, name, type, value = '', extra = '') {
    return `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${mealEscape(value)}" ${extra} required></label>`;
}
function mealReason() { return mealField('異動原因', 'reason', 'text', '', 'maxlength="500"'); }
function mealSubmit(label) { return `<button class="primary-btn" type="submit" ${mealState.busy ? 'disabled' : ''}>${label}</button>`; }
function mealStatus(day, row) {
    if (!day.serving) return '未供餐';
    if (mealIsAdmin()) return `${day.currentCount} 份`;
    if (!row?.eligible) return '未參加';
    return row.eating ? '用餐' : '不用餐';
}
function renderMealCalendar(data) {
    const offset = new Date(`${data.month}-01T00:00:00Z`).getUTCDay();
    return `<div class="meal-calendar" role="group" aria-label="${mealEscape(data.month)} 午餐日曆">
        ${mealWeekLabels.map((label) => `<div class="meal-weekday">${label}</div>`).join('')}
        ${Array.from({ length: offset }, () => '<div class="meal-date-empty" aria-hidden="true"></div>').join('')}
        ${data.days.map((day) => {
            const row = day.rows[0];
            const status = mealStatus(day, row);
            return `<button type="button" data-action="meal-select-date" data-date="${day.date}" aria-label="${day.date} ${status}${day.revision ? ' 已結單' : ''}" aria-pressed="${mealState.selectedDate === day.date}" class="meal-date ${!day.serving ? 'is-off' : !mealIsAdmin() && row?.eating ? 'is-eating' : ''} ${mealState.selectedDate === day.date ? 'is-selected' : ''}">
                <span class="meal-date-number">${Number(day.date.slice(-2))}${day.date === data.today ? '<small>今天</small>' : ''}</span>
                <span class="meal-date-status">${mealEscape(status)}</span><small class="meal-date-deadline">${!day.serving ? '&nbsp;' : day.revision ? '已結單' : day.locked ? '已截止' : `<span>${day.cutoff}</span><span>截止</span>`}</small>
            ${day.rows.some((item) => item.warning) ? '<span class="meal-warning-dot" title="全日請假仍預訂午餐">請假提醒</span>' : ''}
            </button>`;
        }).join('')}
    </div>`;
}
function mealChoiceForm(day, employeeId) {
    const row = day.rows.find((item) => item.employee_id === employeeId);
    if (!row) return '';
    const allowed = mealIsAdmin() ? mealCan('manage') && day.serving && row.eligible : row.canChange && Date.now() < day.deadline;
    return `<form data-meal-form="choice" class="meal-form meal-choice-form">
        <input type="hidden" name="employeeId" value="${mealEscape(employeeId)}"><input type="hidden" name="date" value="${day.date}">
        <h4>${mealIsAdmin() ? `代登：${mealEscape(row.name)} (${mealEscape(employeeId)})` : '午餐登記'}</h4>
        <label class="field"><span>是否用餐</span><select name="eating" ${allowed ? '' : 'disabled'}><option value="true" ${row.eating ? 'selected' : ''}>用餐</option><option value="false" ${!row.eating ? 'selected' : ''}>不用餐</option></select></label>
        ${mealIsAdmin() ? mealReason() : ''}
        ${allowed ? mealSubmit('儲存登記') : `<p class="meal-lock">${!day.serving ? '本日未供餐' : !row.eligible ? '本日未參加團膳' : '已截止或已結單，請聯絡團膳管理者。'}</p>`}
    </form>`;
}
function renderMealWarnings(data) {
    const warnings = data.days.flatMap((day) => day.rows.filter((row) => row.warning).map((row) => ({ day, row })));
    if (!warnings.length) return '';
    return `<section class="meal-warnings" aria-label="請假用餐提醒"><h4>全日請假仍預訂午餐</h4>
        ${warnings.map(({ day, row }) => `<div class="meal-warning-row"><span>${day.date} ${mealIsAdmin() ? mealEscape(row.name) : ''}</span>
            ${mealButton('cancel-warning', '確認取消餐點', `data-date="${day.date}" data-employee="${mealEscape(row.employee_id)}"`, mealIsAdmin() ? !mealCan('manage') : !row.canChange || Date.now() >= day.deadline)}
            ${!mealIsAdmin() && !row.canChange ? '<small>已截止，請聯絡管理者</small>' : ''}</div>`).join('')}</section>`;
}
function renderMealDay(day) {
    if (!day) return '';
    if (!mealIsAdmin()) {
        const row = day.rows[0];
        return `<section class="meal-day-detail"><div class="meal-section-heading"><h3>${day.date} 午餐</h3><span>${mealEscape(mealStatus(day, row))}</span></div>
            <p class="meal-day-meta">${day.cutoff} 截止（台北時間） · ${day.revision ? '已結單' : day.locked ? '已截止' : '尚未結單'}${row.submittedEating == null ? '' : ` · 已交單：${row.submittedEating ? '用餐' : '不用餐'}`}</p>
            ${day.note ? `<p>${mealEscape(day.note)}</p>` : ''}${mealChoiceForm(day, state.dashboard.user.id)}</section>`;
    }
    const stats = [['目前登記餐數', day.currentCount], ['已交給供應商', day.submittedCount ?? '未交單'], ['交單後差額', day.differenceCount ?? '-'], ['異動人數', day.changes.length]];
    return `<section class="meal-day-detail"><div class="meal-section-heading"><h3>${day.date} 午餐</h3><span>${day.serving ? '供餐' : '停供'} · ${day.cutoff} 截止 · ${day.revision ? `交單第 ${day.revision} 版` : '尚未交單'}</span></div>
        <div class="meal-counts">${stats.map(([label, value]) => `<div><span>${label}</span><strong>${mealEscape(value)}</strong></div>`).join('')}</div>
        ${day.note ? `<p>${mealEscape(day.note)}</p>` : ''}
        ${day.changes.length ? `<p class="meal-difference">尚未更新至供應商：${day.changes.map((row) => `${mealEscape(row.name)} ${row.before ? '用餐' : '不用餐'} → ${row.after ? '用餐' : '不用餐'}`).join('、')}</p>` : ''}
        <div class="meal-table-scroll"><table class="meal-table"><thead><tr><th>工號／姓名</th><th>部門</th><th>目前預訂</th><th>已交單</th><th>登記</th><th>操作</th></tr></thead><tbody>
            ${day.rows.map((row) => `<tr><td>${mealEscape(row.employee_id)}<br>${mealEscape(row.name)}${row.formerEmployee ? '<br><span class="meal-alert">員工已刪除，請處理參加資格</span>' : ''}</td><td>${mealEscape(row.department)}</td><td>${row.eating ? '用餐' : '不用餐'}${row.warning ? '<br><span class="meal-alert">全日請假</span>' : ''}${!row.eligible ? '<br>未參加' : ''}</td><td>${row.submittedEating == null ? '-' : row.submittedEating ? '用餐' : '不用餐'}</td><td>${row.choice === 'default' ? '預設' : '已登記'}</td><td>${mealCan('manage') && row.eligible && day.serving ? mealButton('edit-choice', '代登／修正', `data-employee="${mealEscape(row.employee_id)}"`) : ''}</td></tr>`).join('') || '<tr><td colspan="6">本日尚無參加人員。</td></tr>'}
        </tbody></table></div>
        ${mealState.employeeId ? mealChoiceForm(day, mealState.employeeId) : ''}
        ${mealCan('close') && (day.serving || day.revision) ? `<form class="meal-form meal-inline-form" data-meal-form="close"><input type="hidden" name="date" value="${day.date}">${mealReason()}${mealSubmit(day.revision ? '更新供應商交單' : '結單並記錄交單')}</form>` : ''}
        ${day.orders.length ? `<details class="meal-order-history"><summary>交單紀錄（${day.orders.length} 版）</summary>${day.orders.map((order) => `<div>第 ${order.revision} 版：${order.snapshot.count} 份 · ${mealEscape(new Date(order.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }))} · ${mealEscape(order.created_by)}<p>${mealEscape(order.reason)}</p></div>`).join('')}</details>` : ''}
        ${mealCan('settings') && day.date >= mealToday() ? `<details class="meal-day-settings"><summary>本日供餐／截止時間</summary><form class="meal-form meal-inline-form" data-meal-form="day"><input type="hidden" name="date" value="${day.date}">
            <label class="field"><span>供餐狀態</span><select name="serving"><option value="true" ${day.serving ? 'selected' : ''}>供餐</option><option value="false" ${!day.serving ? 'selected' : ''}>停供</option></select></label>${mealField('本日最晚變更時間', 'cutoff', 'time', day.cutoff)}${mealReason()}${mealSubmit('儲存本日設定')}</form></details>` : ''}
    </section>`;
}
function mealEmployeeOptions(data) { return data.employees.map((e) => `<option value="${mealEscape(e.id)}">${mealEscape(e.id)} ${mealEscape(e.name)} · ${mealEscape(e.department)}</option>`).join(''); }
function renderMealMembers(data) {
    const filters = mealState.memberFilters;
    const roster = [...data.employees].sort((a, b) => String(a.id).localeCompare(String(b.id), 'zh-TW', { numeric: true })).map((employee) => {
        const history = data.memberships.filter((m) => m.employee_id === employee.id).sort((a, b) => a.effective_date.localeCompare(b.effective_date));
        return { ...employee, history, current: history.filter((m) => m.effective_date <= mealToday()).at(-1), future: history.filter((m) => m.effective_date > mealToday()), latestEdit: [...history].sort((a, b) => b.updated_at - a.updated_at)[0] };
    });
    const rows = roster.filter((row) => (!filters.query || `${row.id} ${row.name}`.toLocaleLowerCase().includes(filters.query.toLocaleLowerCase())) &&
        (!filters.department || row.department === filters.department) && (!filters.status || (filters.status === 'joined' ? Boolean(row.current?.participating) : filters.status === 'not-joined' ? !row.current?.participating : row.future.length > 0)));
    const departments = [...new Set(roster.map((e) => e.department).filter(Boolean))].sort();
    return `<section class="meal-settings"><h3>參加資格</h3>
        <form class="meal-form meal-inline-form meal-member-filters" data-meal-form="member-filter">
            <label class="field"><span>工號／姓名</span><input name="query" type="search" value="${mealEscape(filters.query)}" placeholder="搜尋員工"></label>
            <label class="field"><span>部門</span><select name="department"><option value="">全部部門</option>${departments.map((d) => `<option value="${mealEscape(d)}" ${filters.department === d ? 'selected' : ''}>${mealEscape(d)}</option>`).join('')}</select></label>
            <label class="field"><span>目前參加狀態</span><select name="status">${[['', '全部員工'], ['joined', '目前加入'], ['not-joined', '目前不加入'], ['scheduled', '有預定異動']].map(([v, label]) => `<option value="${v}" ${filters.status === v ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
            <button type="submit" class="outline-btn">套用篩選</button>${mealButton('clear-member-filters', '清除篩選')}
        </form><p class="helper-text">共 ${rows.length}／${roster.length} 人；目前狀態依 ${mealToday()} 判定。點選加入或不加入後，預設從下個月 1 日生效；修改日期由系統記錄。<span class="meal-mobile-table-hint">清單可左右滑動，查看參加狀態、生效日期與操作按鈕。</span></p>
        <div class="meal-table-scroll"><table class="meal-table meal-members-table"><thead><tr><th>工號／姓名</th><th>部門</th><th>目前狀態</th><th>生效日期</th><th>修改日期</th><th>預定異動／紀錄</th><th>調整參加狀態</th></tr></thead><tbody>
        ${rows.map((row) => `<tr><td><strong>${mealEscape(row.id)} ${mealEscape(row.name)}</strong></td><td>${mealEscape(row.department) || '—'}</td>
            <td><span class="meal-member-status ${row.current?.participating ? 'is-joined' : ''}">${row.current?.participating ? '加入' : '不加入'}</span></td><td>${row.current?.effective_date || '尚未設定'}</td><td>${mealEscape(mealTimestamp(row.latestEdit?.updated_at))}</td>
            <td>${row.future.length ? row.future.map((m) => `<div>${m.effective_date} <strong>${m.participating ? '加入' : '不加入'}</strong></div>`).join('') : '無預定異動'}${row.history.length ? `<details class="meal-member-history"><summary>歷次設定（${row.history.length}）</summary>${row.history.map((m) => `<div>${m.effective_date} 生效 · ${m.participating ? '加入' : '不加入'}<small>修改：${mealEscape(mealTimestamp(m.updated_at))}</small></div>`).join('')}</details>` : ''}</td>
            <td><div class="meal-member-actions">${[true, false].map((participating) => mealButton('member-edit', participating ? '加入' : '不加入', `data-employee="${mealEscape(row.id)}" data-participating="${participating}"`, !mealCan('manage'))).join('')}</div></td></tr>`).join('') || '<tr><td colspan="7">沒有符合篩選條件的員工。</td></tr>'}</tbody></table></div></section>`;
}
function renderMealMemberDialog() {
    const edit = mealState.memberEdit;
    if (!edit || !mealCan('manage')) return '';
    const employee = mealState.data?.employees.find((e) => e.id === edit.employeeId);
    if (!employee) return '';
    return `<dialog id="meal-member-dialog" class="meal-member-dialog" aria-labelledby="meal-member-dialog-title"><form data-meal-form="membership" class="meal-form">
        <div class="meal-section-heading"><h3 id="meal-member-dialog-title">${edit.participating ? '加入團膳' : '不加入團膳'}</h3>${mealButton('member-cancel', '關閉', 'aria-label="關閉參加資格修改"')}</div>
        <p><strong>${mealEscape(employee.id)} ${mealEscape(employee.name)}</strong> · ${mealEscape(employee.department)}</p>
        <input type="hidden" name="employeeId" value="${mealEscape(edit.employeeId)}"><input type="hidden" name="participating" value="${edit.participating}"><input type="hidden" name="version" value="${mealEscape(edit.version)}">
        <label class="field"><span>修改日期（系統記錄）</span><input type="text" value="${mealEscape(mealTimestamp(edit.openedAt))}" readonly><small>儲存時記錄實際時間，不會改變生效日期。</small></label>
        ${mealField('生效日期', 'effectiveDate', 'date', edit.effectiveDate, `min="${mealToday()}"`)}
        <p class="helper-text">預設 ${mealNextMonth()} 起生效。既有日期前的餐數與交單紀錄保持原樣；其他預定異動仍依各自生效日期執行。</p>
        ${mealField('異動原因', 'reason', 'text', edit.reason || '', 'maxlength="500"')}<div id="meal-member-error" class="inline-message" aria-live="polite"></div><div class="meal-member-dialog-actions">${mealButton('member-cancel', '取消')}${mealSubmit('確認儲存參加資格')}</div>
    </form></dialog>`;
}
function renderMealSchedule(data) {
    const config = [...data.schedules].reverse().find((row) => row.effectiveDate <= mealToday()) || data.schedule;
    return `<section class="meal-settings"><h3>供餐制度</h3>${mealCan('settings') ? `<form data-meal-form="schedule" class="meal-form">
        ${mealField('生效日期', 'effectiveDate', 'date', mealToday(), `min="${mealToday()}"`)}
        <fieldset class="meal-weekdays"><legend>每週供餐日</legend>${mealWeekLabels.map((day, i) => `<label><input type="checkbox" name="weekdays" value="${i}" ${config.weekdays.includes(i) ? 'checked' : ''}>週${day}</label>`).join('')}</fieldset>
        <div class="meal-inline-form">${mealField('預設最晚變更時間', 'cutoff', 'time', config.cutoff)}${mealField('全日請假提醒：工作開始', 'leaveStart', 'time', config.leaveStart)}${mealField('全日請假提醒：工作結束', 'leaveEnd', 'time', config.leaveEnd)}</div>
        ${mealReason()}${mealSubmit('儲存供餐制度')}</form>` : ''}
        <div class="meal-table-scroll"><table class="meal-table"><thead><tr><th>生效日</th><th>供餐星期</th><th>截止時間</th><th>全日請假提醒區間</th></tr></thead><tbody>${data.schedules.map((s) => `<tr><td>${s.effectiveDate}</td><td>${s.weekdays.map((i) => `週${mealWeekLabels[i]}`).join('、') || '不供餐'}</td><td>${s.cutoff}</td><td>${s.leaveStart}–${s.leaveEnd}</td></tr>`).join('') || '<tr><td colspan="4">尚未設定供餐日。</td></tr>'}</tbody></table></div></section>`;
}
function renderMealWorkspace() {
    if (!/^\d{4}-\d{2}$/.test(mealState.month)) mealState.month = mealToday().slice(0, 7);
    const data = mealState.data;
    const admin = mealIsAdmin();
    const tabs = [['calendar', '午餐日曆'], ['membership', '參加資格'], ['schedule', '供餐制度']];
    if (!tabs.some(([id]) => id === mealState.panel)) mealState.panel = 'calendar';
    const controls = `<div class="meal-month-controls">
        ${mealButton('month', '←', 'data-offset="-1" aria-label="上個月" title="上個月"')}
        <input type="month" data-meal-month aria-label="團膳月份" value="${mealEscape(mealState.month)}" min="2000-01" max="2100-12">
        ${mealButton('month', '→', 'data-offset="1" aria-label="下個月" title="下個月"')}${mealButton('refresh', '重新整理')}
    </div>`;
    const message = `<div class="inline-message" id="meal-message" aria-live="polite">${mealState.loading ? '正在讀取團膳資料…' : mealState.pending ? '資料有異動，重新整理後可查看最新餐數。' : ''}</div>`;
    const panel = !data ? '<p role="status">讀取團膳資料中…</p>' : admin && mealState.panel === 'membership' ? renderMealMembers(data) : admin && mealState.panel === 'schedule' ? renderMealSchedule(data) :
        `${renderMealWarnings(data)}${renderMealCalendar(data)}${renderMealDay(data.days.find((day) => day.date === mealState.selectedDate))}`;
    if (!admin) return `<section id="meal-workspace" class="meal-workspace" aria-label="午餐團膳">
        <div class="meal-toolbar"><h3>我的午餐團膳</h3>${controls}</div>${message}${panel}</section>`;
    const sidebar = `<aside class="workspace-subnav-sidebar" aria-label="午餐團膳子導覽"><div class="workspace-subnav-card"><div class="workspace-subnav-group">
        <p class="workspace-subnav-group-title">午餐團膳</p><div class="workspace-subnav-items">${tabs.map(([id, label]) =>
            `<button type="button" class="workspace-subnav-item ${mealState.panel === id ? 'is-active' : ''}" data-action="meal-panel" data-panel="${id}" aria-current="${mealState.panel === id ? 'page' : 'false'}"><span>${label}</span></button>`).join('')}</div>
        </div></div></aside>`;
    return `<section id="meal-workspace" class="meal-workspace meal-admin-workspace workspace-stack workspace-subnav-stack" data-workspace-role="admin" data-workspace-section="meals" aria-label="午餐團膳">
        <article class="workspace-card workspace-summary-card" data-no-collapsible="true"><div class="list-toolbar"><div><p class="sub-kicker">管理者工作台</p><h3>午餐團膳</h3></div><div class="badge-row">${data ? `<span class="badge">目前月份 ${mealEscape(data.month)}</span><span class="badge">供餐 ${data.days.filter((day) => day.serving).length} 日</span>` : '<span class="badge">資料載入中</span>'}</div></div></article>
        <div class="workspace-subnav-layout">${sidebar}<section class="workspace-subnav-content" aria-live="polite">
            <article class="table-card meal-admin-panel" data-no-collapsible="true"><div class="meal-toolbar">
                ${mealState.panel === 'calendar' ? `${controls}${mealButton('export', '匯出月報')}` : mealButton('refresh', '重新整理')}</div>
                <p class="helper-text">${mealState.panel === 'calendar' ? '按日期查看登記人員、代登用餐與供應商交單；匯出使用目前月份。' : mealState.panel === 'membership' ? '設定員工參加或退出團膳的生效日期；修改會保留操作紀錄。' : '設定每週供餐日與截止時間；單日供餐例外請至午餐日曆選擇日期。'}</p>
                ${message}${panel}
            </article>
        </section></div>${renderMealMemberDialog()}
    </section>`;
}
function mealPaint() {
    const root = document.getElementById('meal-workspace');
    if (root) root.outerHTML = renderMealWorkspace();
    const dialog = document.getElementById('meal-member-dialog');
    if (dialog && !dialog.open) dialog.showModal();
    mealState.dirty = false;
}
function mealMessage(text, type = 'error') { setMessage(document.getElementById('meal-message') || ui.dashboardMessage, text, type); }
async function mealLoad() {
    if (!/^\d{4}-\d{2}$/.test(mealState.month)) mealState.month = mealToday().slice(0, 7);
    const identity = mealState.identity, month = mealState.month, token = state.token, sequence = ++mealState.sequence;
    mealState.loading = true;
    document.getElementById('meal-workspace')?.setAttribute('aria-busy', 'true');
    mealMessage('正在讀取團膳資料…', 'info');
    try {
        const route = mealIsAdmin() ? 'admin' : 'employee';
        const result = await requestJson(`/api/browser/${route}/meals?month=${encodeURIComponent(month)}`, { auth: true });
        if (identity !== mealState.identity || month !== mealState.month || token !== state.token || sequence !== mealState.sequence) return;
        mealState.data = result.meals;
        mealState.month = result.meals.month;
        mealState.pending = false;
        mealState.loading = false;
        if (!result.meals.days.some((day) => day.date === mealState.selectedDate)) mealState.selectedDate = result.meals.days.find((day) => day.date === result.meals.today)?.date || result.meals.days[0]?.date;
        mealPaint();
    } finally { if (identity === mealState.identity && token === state.token && sequence === mealState.sequence) { mealState.loading = false; document.getElementById('meal-workspace')?.removeAttribute('aria-busy'); } }
}
function mealDiscard() { return !mealState.dirty || window.confirm('尚有未儲存的團膳修改，確定離開？'); }
const previousMealRenderDashboard = renderDashboard;
renderDashboard = function renderDashboardWithMeals(dashboard) {
    const identity = `${state.token}/${dashboard.role}/${dashboard.user?.id || ''}`;
    const initial = dashboard.role === 'employee' ? dashboard.meals : dashboard.datasets?.meals;
    if (mealState.identity !== identity) {
        Object.assign(mealState, { identity, month: initial?.month || new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 7), data: initial || null, selectedDate: initial?.today || '', panel: 'calendar', employeeId: '', busy: false, dirty: false, pending: false, loading: false, memberFilters: { query: '', department: '', status: '' }, memberEdit: null });
    } else if (mealState.dashboard !== dashboard && initial) {
        mealState.data = initial.month === mealState.month ? initial : null;
    }
    mealState.dashboard = dashboard;
    return previousMealRenderDashboard(dashboard);
};
const previousMealEmployeeItems = renderEmployeeWorkspaceItems;
renderEmployeeWorkspaceItems = function renderEmployeeItemsWithMeals(dashboard) {
    const warnings = (mealState.data?.days || []).filter((day) => day.rows.some((row) => row.warning)).length;
    return [...previousMealEmployeeItems(dashboard), { id: 'meals', label: '我的午餐團膳', meta: warnings ? `${warnings} 日請假提醒` : '午餐預訂', html: renderMealWorkspace() }];
};
const previousMealAdminContent = renderAdminPermissionAwareContent;
renderAdminPermissionAwareContent = function renderAdminContentWithMeals(section, datasets) {
    return section === 'meals' ? renderMealWorkspace() : previousMealAdminContent(section, datasets);
};
const previousMealPostRender = postRenderSetup;
postRenderSetup = function postRenderWithMeals() {
    previousMealPostRender();
    const dialog = document.getElementById('meal-member-dialog');
    if (dialog && !dialog.open) dialog.showModal();
    if (mealActive() && !mealState.data && !mealState.loading) mealLoad().catch((error) => mealMessage(error.message));
};
const previousMealClick = handleDashboardClick;
handleDashboardClick = async function handleMealsClick(event) {
    const button = event.target.closest('[data-action]');
    const action = button?.dataset.action || '';
    if (!action.startsWith('meal-')) return previousMealClick(event);
    event.preventDefault();
    if (mealState.busy) return;
    try {
        if (action === 'meal-member-cancel') { mealState.memberEdit = null; mealState.dirty = false; mealPaint(); return; }
        if (action === 'meal-member-edit') {
            if (!mealCan('manage')) return;
            mealState.memberEdit = { employeeId: button.dataset.employee, participating: button.dataset.participating === 'true', effectiveDate: mealNextMonth(), openedAt: Date.now(), version: mealState.data?.membershipVersions?.[button.dataset.employee] || '' };
            mealPaint(); return;
        }
        if (action === 'meal-clear-member-filters') { mealState.memberFilters = { query: '', department: '', status: '' }; mealPaint(); return; }
        if (action === 'meal-export') {
            const token = state.token, identity = mealState.identity, month = mealState.month;
            const response = await fetch(`/api/browser/admin/meals/export?month=${encodeURIComponent(month)}`, { headers: { Authorization: `Bearer ${token}` } });
            if (!response.ok) throw new Error((await response.json()).error || '匯出失敗。');
            const blob = await response.blob();
            if (identity !== mealState.identity || token !== state.token) return;
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a'); link.href = url; link.download = `lunch-${month}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
            return;
        }
        if (!mealDiscard()) return;
        if (action === 'meal-refresh') { await mealLoad(); if (mealIsAdmin()) await reloadDashboard(); return; }
        if (action === 'meal-month') {
            const date = new Date(`${mealState.month}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + Number(button.dataset.offset));
            mealState.month = date.toISOString().slice(0, 7); mealState.employeeId = ''; return await mealLoad();
        }
        if (action === 'meal-panel') mealState.panel = button.dataset.panel;
        if (action === 'meal-select-date') { mealState.selectedDate = button.dataset.date; mealState.employeeId = ''; }
        if (action === 'meal-edit-choice') mealState.employeeId = button.dataset.employee;
        if (action === 'meal-cancel-warning') {
            mealState.selectedDate = button.dataset.date;
            const day = mealState.data.days.find((d) => d.date === button.dataset.date);
            if (mealIsAdmin()) { mealState.employeeId = button.dataset.employee; mealPaint(); const select = document.querySelector('[data-meal-form="choice"] select'); if (select) select.value = 'false'; mealState.dirty = true; document.querySelector('[data-meal-form="choice"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
            if (!window.confirm(`確認取消 ${day.date} 的午餐？`)) return;
            await mealSave('choice', { date: day.date, eating: false, version: day.version, reason: '全日請假提醒：員工確認取消餐點' }); return;
        }
        mealPaint();
        if (action === 'meal-edit-choice') document.querySelector('[data-meal-form="choice"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch (error) { mealMessage(error.message); }
};
const previousMealChange = handleDashboardChange;
handleDashboardChange = async function handleMealsChange(event) {
    if (event.target.matches('[data-meal-month]')) {
        if (!mealDiscard()) { event.target.value = mealState.month; return; }
        mealState.month = event.target.value; mealState.employeeId = '';
        try { await mealLoad(); } catch (error) { mealMessage(error.message); } return;
    }
    if (event.target.closest('[data-meal-form]')) { if (!event.target.closest('[data-meal-form="member-filter"]')) mealState.dirty = true; return; }
    return previousMealChange(event);
};
async function mealSave(operation, body) {
    const identity = mealState.identity;
    const controls = [...document.querySelectorAll('#meal-workspace button, #meal-workspace input, #meal-workspace select')].map((control) => [control, control.disabled]);
    mealState.busy = true;
    controls.forEach(([control]) => { control.disabled = true; });
    try {
        const result = await requestJson(`/api/browser/${mealIsAdmin() ? 'admin' : 'employee'}/meals/${operation}`, { method: 'POST', auth: true, body });
        if (identity !== mealState.identity) return;
        mealState.dirty = false;
        mealState.busy = false;
        if (operation === 'membership') mealState.memberEdit = null;
        await mealLoad();
        if (mealIsAdmin()) await reloadDashboard();
        mealMessage(result.message, 'success');
    } finally {
        if (identity === mealState.identity) {
            mealState.busy = false;
            controls.forEach(([control, disabled]) => { if (control.isConnected) control.disabled = disabled; });
        }
    }
}
const previousMealSubmit = handleDashboardSubmit;
handleDashboardSubmit = async function handleMealsSubmit(event) {
    const form = event.target.closest('[data-meal-form]');
    if (!form) return previousMealSubmit(event);
    event.preventDefault();
    if (mealState.busy) return;
    const operation = form.dataset.mealForm;
    const fields = new FormData(form);
    const body = Object.fromEntries(fields);
    if (operation === 'member-filter') { mealState.memberFilters = { query: String(body.query || '').trim(), department: body.department || '', status: body.status || '' }; mealPaint(); return; }
    for (const key of ['participating', 'serving', 'eating']) if (key in body) body[key] = body[key] === 'true';
    if (operation === 'schedule') body.weekdays = fields.getAll('weekdays').map(Number);
    if (operation === 'choice' || operation === 'close') body.version = mealState.data.days.find((d) => d.date === body.date)?.version;
    if (operation === 'close' && !window.confirm(`確認已將 ${body.date} 的 ${mealState.data.days.find((d) => d.date === body.date).currentCount} 份午餐訂單交給供應商？`)) return;
    try { await mealSave(operation, body); }
    catch (error) {
        if (operation === 'membership') setMessage(document.getElementById('meal-member-error'), error.message, 'error');
        else mealMessage(error.message);
        if (error.message.includes('重新整理')) mealState.pending = true;
    }
};
const previousMealSync = handleRealtimeSyncMessage;
handleRealtimeSyncMessage = async function handleMealsSync(payload) {
    if (['meals', 'leaveRequests', 'employees'].includes(payload?.type) && mealActive()) {
        if (payload.sessionToken === state.token || mealState.busy) return;
        if (mealState.dirty || mealState.memberEdit || document.activeElement?.closest('[data-meal-form]')) { mealState.pending = true; mealMessage('資料有異動，請先保存內容或重新整理後確認最新餐數。', 'info'); return; }
        try { await mealLoad(); } catch (error) { mealMessage(error.message); } return;
    }
    if (payload?.type === 'meals') {
        if (state.dashboard?.role === 'employee' || (mealIsAdmin() && mealCan('view'))) {
            try { await reloadDashboard(); } catch (error) { mealMessage(error.message); }
        }
        return;
    }
    return previousMealSync(payload);
};
document.addEventListener('input', (event) => {
    if (event.target.closest('[data-meal-form]') && !event.target.closest('[data-meal-form="member-filter"]')) mealState.dirty = true;
    if (mealState.memberEdit && event.target.closest('[data-meal-form="membership"]') && ['effectiveDate', 'reason'].includes(event.target.name)) mealState.memberEdit[event.target.name] = event.target.value;
});
document.addEventListener('cancel', (event) => { if (event.target.id === 'meal-member-dialog') { event.preventDefault(); if (!mealState.busy) { mealState.memberEdit = null; mealState.dirty = false; mealPaint(); } } }, true);
const previousMealLogout = handleLogout;
handleLogout = function logoutWithMealCleanup(...args) {
    Object.assign(mealState, { identity: '', month: '', data: null, dashboard: null, dirty: false, pending: false, loading: false, busy: false, memberEdit: null, memberFilters: { query: '', department: '', status: '' } });
    return previousMealLogout(...args);
};
