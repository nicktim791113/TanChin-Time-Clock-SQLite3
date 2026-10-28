const dmState = { identity: '', detail: null, sequence: 0, draft: null, density: 'comfortable', busy: false, dirty: false, filters: {}, previousFocus: null };
auditActionLabels.dashboard_metric_preferences = '個人指標設定';
auditTargetTypeLabels.dashboard_preferences = '管理者指標列';
const dmEscape = (value) => escapeHtml(String(value ?? ''));
const dmLegacy = ['employeeCount', 'shiftCount', 'todayPunchCount', 'todayAbnormalPunchCount', 'bellScheduleCount', 'greetingCount', 'customThemeCount'];
const dmGroupsFallback = [
    { key: 'people', label: '人員與考勤', kind: 'people', items: ['employeeCount', 'todayPunchCount', 'todayAbnormalPunchCount'] },
    { key: 'leaveWeek', label: '請假 7 日', kind: 'week', items: Array.from({ length: 7 }, (_, i) => `leaveDay:${i - 3}`) },
    { key: 'leaveReview', label: '請假待審核', kind: 'review', items: ['leavePendingSupervisor', 'leavePendingAdmin'] },
    { key: 'overtimeWeek', label: '加班 7 日', kind: 'week', items: Array.from({ length: 7 }, (_, i) => `overtimeDay:${i - 3}`) },
    { key: 'overtimeReview', label: '加班待審核', kind: 'review', items: ['overtimePendingSupervisor'] },
    { key: 'meals', label: '午餐團膳', kind: 'meals', items: ['mealToday', 'mealTomorrow', 'mealParticipants'] },
    { key: 'schedule', label: '班別與響鈴', kind: 'settings', items: ['shiftCount', 'bellScheduleCount'] },
    { key: 'salary', label: '借支管理', kind: 'salary', items: ['salaryPendingCount', 'salaryPendingPeople', 'salaryPendingAmount', 'salaryApprovedAmount'] },
    { key: 'appearance', label: '問候語與主題', kind: 'settings', items: ['greetingCount', 'customThemeCount'] }
];
const dmPaths = { salary: 'M12 2v20M17 5H9a4 4 0 0 0 0 8h6a3 3 0 0 1 0 6H6', people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87', week: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2', review: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11', meals: 'M3 2v7a3 3 0 0 0 6 0V2M6 2v20M19 2c-4 3-4 9 0 10v10M19 2v10', settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2', arrow: 'M9 5l7 7-7 7', up: 'M5 15l7-7 7 7', down: 'M5 9l7 7 7-7', close: 'M6 6l12 12M18 6L6 18', order: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01' };
function dmIcon(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${dmPaths[name] || dmPaths.settings}"/></svg>`; }
function dmGroups(data = state.dashboard?.dashboardMetrics) { return data?.groups || dmGroupsFallback; }
function dmItem(key, dashboard = state.dashboard) { return dashboard?.dashboardMetrics?.catalog.find((item) => item.key === key); }
function dmValue(item, dashboard) {
    if (!item?.available) return '—';
    if (item.key === 'todayPunchCount' || item.key === 'todayAbnormalPunchCount') {
        const attendance = getScopedAttendanceSummary(dashboard);
        return item.key === 'todayPunchCount' ? attendance.normalEmployees.length : attendance.abnormalRecords.length + attendance.failureLogs.length;
    }
    return item.key.startsWith('salary') && item.key.endsWith('Amount') ? `NT$ ${Number(item.value).toLocaleString('zh-TW')}` : item.value;
}
function dmShortLabel(item) {
    return ({ leavePendingSupervisor: '待主管審核', leavePendingAdmin: '待管理部複核', overtimePendingSupervisor: '待主管審核', mealParticipants: '參加團膳人數' })[item.key] || item.label;
}
function dmItemButton(item, dashboard) {
    const tone = item.key === 'todayAbnormalPunchCount' ? 'danger' : item.key.includes('Pending') ? 'warning' : item.key === 'todayPunchCount' ? 'success' : '';
    const unit = item.key === 'salaryPendingPeople' ? '人' : item.key.endsWith('Amount') ? '' : item.key.includes('Pending') || item.key === 'todayAbnormalPunchCount' ? '筆' : item.key.startsWith('meal') && item.key !== 'mealParticipants' ? '份' : ['employeeCount', 'todayPunchCount', 'mealParticipants'].includes(item.key) ? '人' : '';
    return `<button type="button" class="dm-metric-row ${tone}" data-action="dm-insight" data-key="${dmEscape(item.key)}" ${item.available ? '' : 'disabled'} title="${dmEscape(item.available ? `${item.label}：${item.subtitle || '檢視資訊與設定入口'}` : '未授權查看此項目')}"><span>${dmEscape(dmShortLabel(item))}</span><strong>${dmEscape(dmValue(item, dashboard))}<small>${unit}</small></strong>${dmIcon('arrow')}</button>`;
}
function dmWeek(group, dashboard, selected = '') {
    const items = group.items.map((key) => dmItem(key, dashboard)).filter(Boolean), max = Math.max(1, ...items.filter((item) => item.available).map((item) => Number(item.value) || 0));
    return `<div class="dm-week ${selected ? 'dm-week-tabs' : ''}" aria-label="${dmEscape(group.label)}，已核准人數">${items.map((item) => {
        const today = item.key.endsWith(':0'), chosen = selected === item.key, value = dmValue(item, dashboard), height = item.available ? Math.max(Number(value) > 0 ? 8 : 0, (Number(value) / max) * 100) : 0;
        const weekday = item.date ? new Date(item.date + 'T12:00:00+08:00').getUTCDay() : 0;
        return `<button type="button" class="dm-day ${today ? 'is-today' : ''} ${chosen ? 'is-selected' : ''}" data-action="dm-insight" data-key="${dmEscape(item.key)}" ${item.available ? '' : 'disabled'} ${selected ? `aria-pressed="${chosen}"` : ''} aria-label="${dmEscape(`${item.label}，${item.available ? `${value} 人` : '未授權'}，${today ? '今天' : item.subtitle || ''}`)}"><strong>${dmEscape(value)}</strong>${selected ? '' : `<span class="dm-bar-track"><span class="dm-bar" style="height:${height}%"></span></span>`}<span>${dmEscape(item.date?.slice(5).replace('-', '/') || '')}</span><small>${today ? '今天' : ['日', '一', '二', '三', '四', '五', '六'][weekday]}</small></button>`;
    }).join('')}</div>`;
}
function renderDashboardMetricStrip(dashboard) {
    const data = dashboard.dashboardMetrics;
    if (!data) return '';
    const groups = dmGroups(data), ordered = [...new Set([...(data.cardKeys || []), ...groups.map((group) => group.key)])].map((key) => groups.find((group) => group.key === key)).filter(Boolean).slice(0, 8);
    return `<section class="dm-strip dm-density-${data.density === 'compact' ? 'compact' : 'comfortable'}" aria-label="管理者八張分組指標"><div class="dm-toolbar"><div><h2>工作台總覽</h2><span>${dmEscape(data.today)} · 台北時間</span></div><button type="button" class="outline-btn dm-order-button" data-action="dm-settings">${dmIcon('order')}選擇卡片與排列</button></div>
        ${data.migrated ? '<p class="dm-migration" role="status">新增「借支管理」卡片，沿用原有順序並替換「問候語與主題」。可從九張卡片中選擇八張並調整順序。</p>' : ''}
        <div class="dm-cards">${ordered.map((group, index) => {
            const items = group.items.map((key) => dmItem(key, dashboard)).filter(Boolean), available = items.some((item) => item.available);
            const footer = group.kind === 'salary' ? `${data.today?.slice(0, 7) || ''} 登記月 · 已複核含補登，非已發放` : group.kind === 'week' ? '點選日期查看人員與申請明細' : group.kind === 'review' ? '全部日期 · 依申請單計數' : group.kind === 'settings' ? '查看配置概況與設定入口' : group.kind === 'meals' ? '目前預訂 · 交單份數請見明細' : '異常含打卡紀錄與失敗稽核';
            return `<article class="dm-card ${group.kind === 'salary' ? 'dm-salary-card' : ''} ${available ? '' : 'dm-locked'}" data-metric-slot="${index}" data-metric-group="${group.key}"><header><h3>${dmIcon(group.kind)}${dmEscape(group.label)}</h3>${group.kind === 'week' ? '<span>已核准人數</span>' : ''}</header><div class="dm-card-body">${group.kind === 'week' ? dmWeek(group, dashboard) : items.map((item) => dmItemButton(item, dashboard)).join('')}</div><p class="dm-card-note">${available ? footer : '目前帳號未授權此分組的資料'}</p></article>`;
        }).join('')}</div></section>`;
}
function dmSummary(items) { return `<div class="dm-summary">${items.map(([value, label, tone = '']) => `<div class="${tone}"><strong>${dmEscape(value)}</strong><span>${dmEscape(label)}</span></div>`).join('')}</div>`; }
renderAdminEmployeeInsight = function renderRosterOverview(dashboard = state.dashboard) {
    const people = dashboard.dashboardMetrics?.roster || [], active = people.filter((employee) => isActiveRosterEmployee(employee));
    const departments = [...new Set(people.map((employee) => employee.department).filter(Boolean))];
    return `${dmSummary([[people.length, '名冊總人數'], [active.length, '在職人數', 'success'], [people.length - active.length, '離職人數'], [departments.length, '部門']])}<section class="insight-section"><h3>完整員工名冊</h3><p class="helper-text">名冊不受今日出勤統計範圍影響。</p>${renderInsightEmployeeTable(people)}</section>`;
};
const dmPreviousNormal = renderAdminTodayNormalInsight, dmPreviousAbnormal = renderAdminAbnormalInsight;
renderAdminTodayNormalInsight = (dashboard = state.dashboard) => {
    const attendance = getScopedAttendanceSummary(dashboard);
    return dmSummary([[attendance.normalEmployees.length, '正常打卡人數', 'success'], [attendance.missingEmployees?.length || 0, '未打卡人數', 'warning'], [attendance.monitoredEmployees?.length || 0, '納入統計人數']]) + dmPreviousNormal(dashboard);
};
renderAdminAbnormalInsight = (dashboard = state.dashboard) => {
    const attendance = getScopedAttendanceSummary(dashboard);
    return dmSummary([[attendance.abnormalRecords.length, '異常紀錄', 'danger'], [attendance.failureLogs.length, '失敗稽核', 'warning']]) + renderAdminInsightScopeControls(dashboard) + dmPreviousAbnormal(dashboard);
};
function dmDialog() { return document.getElementById('dashboard-metric-settings'); }
function dmMessage(text, type = 'error') { const target = dmDialog()?.querySelector('[data-dm-message]'); if (target) setMessage(target, text, type); }
function dmClose(force = false) {
    const dialog = dmDialog(); if (!dialog || dmState.busy) return;
    if (dmState.dirty && !force) { dialog.querySelector('[data-dm-discard-panel]').hidden = false; return; }
    dialog.close(); dialog.remove(); dmState.draft = null; dmState.dirty = false; dmState.previousFocus?.focus?.();
}
function dmSettingsRows() {
    return dmState.draft.map((key, index) => { const group = dmGroups().find((item) => item.key === key); return `<li><span class="dm-position">${index + 1}</span><div><label class="dm-card-choice"><span class="dm-sr-only">第 ${index + 1} 張卡片</span><select data-dm-card-index="${index}" aria-label="第 ${index + 1} 張卡片">${dmGroups().filter((item) => item.key === key || !dmState.draft.includes(item.key)).map((item) => `<option value="${dmEscape(item.key)}" ${item.key === key ? 'selected' : ''}>${dmEscape(item.label)}</option>`).join('')}</select></label><small>${group.items.map((item) => dmItem(item)).filter(Boolean).map((item) => dmEscape(dmShortLabel(item))).join('、')}</small></div><button type="button" class="dm-move" data-dm-move="${index}" data-direction="-1" ${index === 0 ? 'disabled' : ''} aria-label="${dmEscape(group.label)}往前移">${dmIcon('up')}</button><button type="button" class="dm-move" data-dm-move="${index}" data-direction="1" ${index === 7 ? 'disabled' : ''} aria-label="${dmEscape(group.label)}往後移">${dmIcon('down')}</button></li>`; }).join('');
}
function dmOpenSettings() {
    if (dmDialog()) return;
    const data = state.dashboard.dashboardMetrics; dmState.draft = [...data.cardKeys]; dmState.density = data.density || 'comfortable'; dmState.dirty = false; dmState.previousFocus = document.activeElement;
    const dialog = document.createElement('dialog'); dialog.id = 'dashboard-metric-settings'; dialog.className = 'dm-dialog'; dialog.setAttribute('aria-label', '個人指標排列與高度');
    dialog.innerHTML = `<div class="modal-header"><div><h3>個人指標排列與高度</h3><p>從九張卡片中選擇八張；調整只套用於您的帳號。</p></div><button class="ghost-btn dm-icon" type="button" data-dm-close aria-label="關閉">${dmIcon('close')}</button></div><form data-dm-settings-form><fieldset class="dm-density-picker"><legend>卡片高度</legend><label><input type="radio" name="density" value="comfortable" ${dmState.density === 'comfortable' ? 'checked' : ''}>標準</label><label><input type="radio" name="density" value="compact" ${dmState.density === 'compact' ? 'checked' : ''}>緊湊</label><span>僅改變間距，所有資料仍會保留。</span></fieldset><ol class="dm-order-list" data-dm-order>${dmSettingsRows()}</ol>
        <p class="dm-helper">使用選單更換卡片，上下箭頭調整閱讀順序。未授權的項目顯示「—」，排列不會增加查看權限。</p><div class="inline-message" data-dm-message aria-live="polite"></div><div class="dm-save-row"><button class="outline-btn" type="button" data-dm-reset>恢復預設</button><button class="primary-btn" type="submit">儲存排列與高度</button></div>
        <div class="dm-discard" data-dm-discard-panel hidden><p>有尚未儲存的設定。</p><button type="button" class="outline-btn" data-dm-keep>繼續編輯</button><button type="button" class="outline-btn" data-dm-discard>捨棄並關閉</button></div></form>`;
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); dmClose(); });
    dialog.addEventListener('click', (event) => {
        if (event.target.closest('[data-dm-close]')) dmClose();
        if (event.target.closest('[data-dm-discard]')) dmClose(true);
        if (event.target.closest('[data-dm-keep]')) dialog.querySelector('[data-dm-discard-panel]').hidden = true;
        if (dmState.busy) return;
        const move = event.target.closest('[data-dm-move]');
        if (move) { const index = Number(move.dataset.dmMove), target = index + Number(move.dataset.direction); [dmState.draft[index], dmState.draft[target]] = [dmState.draft[target], dmState.draft[index]]; dmState.dirty = true; dialog.querySelector('[data-dm-order]').innerHTML = dmSettingsRows(); dialog.querySelector(`[data-dm-move="${target}"][data-direction="${move.dataset.direction}"]:not([disabled])`)?.focus(); }
        if (event.target.closest('[data-dm-reset]')) { dmState.draft = dmGroups().filter((group) => group.key !== 'appearance').map((group) => group.key).slice(0, 8); dmState.density = 'comfortable'; dmState.dirty = true; dialog.querySelector('[data-dm-order]').innerHTML = dmSettingsRows(); dialog.querySelector('[name="density"][value="comfortable"]').checked = true; }
    });
    dialog.addEventListener('change', (event) => {
        if (dmState.busy) return;
        if (event.target.name === 'density') { dmState.density = event.target.value; dmState.dirty = true; }
        if (event.target.matches('[data-dm-card-index]')) { const index = Number(event.target.dataset.dmCardIndex), key = event.target.value; if (index >= 0 && index < 8 && dmGroups().some((group) => group.key === key) && !dmState.draft.includes(key)) { dmState.draft[index] = key; dmState.dirty = true; dialog.querySelector('[data-dm-order]').innerHTML = dmSettingsRows(); } }
    });
    dialog.querySelector('form').addEventListener('submit', async (event) => {
        event.preventDefault(); if (dmState.busy) return;
        const identity = dmState.identity, body = { cardKeys: [...dmState.draft], density: dmState.density, revision: data.revision, confirm: true };
        dmState.busy = true; dialog.querySelectorAll('input, select, button').forEach((control) => { control.dataset.dmWasDisabled = String(control.disabled); control.disabled = true; });
        try {
            const result = await requestJson('/api/browser/admin/dashboard-metrics/preferences', { auth: true, method: 'POST', body });
            if (identity !== dmState.identity) return;
            Object.assign(state.dashboard.dashboardMetrics, result.preferences); dmState.dirty = false; dmState.busy = false; dmClose(true);
            renderDashboard(state.dashboard); setMessage(ui.dashboardMessage, result.message, 'success');
        } catch (error) { if (identity === dmState.identity) dmMessage(error.message); }
        finally { if (identity === dmState.identity) { dmState.busy = false; dialog.querySelectorAll('input, select, button').forEach((control) => { control.disabled = control.dataset.dmWasDisabled === 'true'; }); } }
    });
    document.body.append(dialog); dialog.showModal();
}
const dmPreviousInsightTitle = getAdminInsightTitle, dmPreviousInsight = renderAdminDashboardInsightContent;
getAdminInsightTitle = function metricInsightTitle(key) { return dmGroups().find((group) => group.items.includes(key))?.label || dmPreviousInsightTitle(key); };
function dmTabs(key, dashboard) {
    const group = dmGroups(dashboard.dashboardMetrics).find((item) => item.items.includes(key));
    if (!group) return '';
    if (group.kind === 'week') return dmWeek(group, dashboard, key);
    return `<div class="dm-detail-tabs" aria-label="${dmEscape(group.label)}項目">${group.items.map((itemKey) => dmItem(itemKey, dashboard)).filter(Boolean).map((item) => `<button type="button" data-action="dm-insight" data-key="${dmEscape(item.key)}" class="${key === item.key ? 'is-selected' : ''}" aria-pressed="${key === item.key}" ${item.available ? '' : 'disabled'}>${dmEscape(dmShortLabel(item))}<strong>${dmEscape(dmValue(item, dashboard))}</strong></button>`).join('')}</div>`;
}
function dmSettingsInsight(key, dashboard) {
    const insights = getAdminDashboardInsights(dashboard), item = dmItem(key, dashboard);
    const configs = {
        shiftCount: { section: 'shifts', label: '開啟班別設定', description: '班別決定時段與打卡判斷；目前班別依主機時間判定，不代表員工個別排班。', stats: [[item.value, '班別'], [insights.shifts?.current?.name || '無', '目前班別']] },
        bellScheduleCount: { section: 'bells', subsection: 'schedules', label: '開啟響鈴設定', description: '查看排程是否啟用與下次執行時間。聲音播放與實際硬體仍由服務主機執行。', stats: [[insights.bells?.enabledCount || 0, '啟用排程', 'success'], [insights.bells?.totalCount ?? item.value, '全部排程'], [insights.bells?.nextSchedule?.nextTimeText || '無', '下一個響鈴']] },
        greetingCount: { section: 'system', subsection: 'greetings', label: '開啟問候語管理', description: '問候語會依類型與對象顯示。開啟管理頁可新增、調整內容或刪除。', stats: [[item.value, '問候語']] },
        customThemeCount: { section: 'themes', subsection: 'editor', label: '開啟主題編輯器', description: '自訂主題與主題排程分開管理；建立主題不代表已套用到目前畫面。', stats: [[item.value, '自訂主題'], [(insights.themes?.themeSchedules || []).length, '主題排程'], [(insights.themes?.specialEffects || []).length, '節日特效']] }
    };
    const config = configs[key];
    return `${dmSummary(config.stats)}<div class="dm-setting-context"><p>${config.description}</p><button type="button" class="primary-btn" data-dm-navigate="${config.section}" data-subsection="${config.subsection || ''}">${config.label}${dmIcon('arrow')}</button></div>${dmPreviousInsight(key, dashboard)}`;
}
function dmApplicantCell(row) {
    if (!row.applicantId) return '<span class="dm-cell-secondary">未記錄</span>';
    return `<strong>${dmEscape(row.applicantName || '姓名未記錄')}</strong><small class="dm-cell-secondary">${dmEscape(row.applicantId)}</small>`;
}
renderAdminDashboardInsightContent = function metricInsightContent(key, dashboard = state.dashboard) {
    const item = dmItem(key, dashboard);
    if (!item) return dmPreviousInsight(key, dashboard);
    if (!item.available) return '<p class="dm-empty-state">目前帳號沒有此項目的查看權限。</p>';
    const tabs = dmTabs(key, dashboard);
    if (dmLegacy.includes(key)) return `<div class="dm-detail">${tabs}${['shiftCount', 'bellScheduleCount', 'greetingCount', 'customThemeCount'].includes(key) ? dmSettingsInsight(key, dashboard) : dmPreviousInsight(key, dashboard)}</div>`;
    const data = dmState.detail;
    if (!data || data.metric.key !== key) return `<div class="dm-detail">${tabs}<p class="dm-empty-state" role="status">讀取完整指標明細中…</p></div>`;
    if (data.error) return `<div class="dm-detail">${tabs}<p class="inline-message error">${dmEscape(data.error)}</p><button class="outline-btn" data-dm-retry>重新讀取</button></div>`;
    const meal = data.kind === 'meal', summary = data.summary || {}, filters = data.filters || {}, details = data.records || [];
    if (data.kind === 'salary') return dmSalaryDetail(data, tabs, item);
    const showApplicant = ['leavePendingSupervisor', 'leavePendingAdmin', 'overtimePendingSupervisor'].includes(key);
    const summaryItems = meal ? [[summary.people ?? data.totalRecords, '符合條件人數'], [summary.departments || 0, '部門']] : [[summary.people || 0, '符合條件人數'], [data.totalRecords, '申請單數'], ...(data.kind === 'leave' && summary.dayHours != null ? [[summary.dayHours, '當日請假時數']] : []), [summary.requestHours || 0, '整張申請合計時數']];
    return `<div class="dm-detail">${tabs}${dmSummary(summaryItems)}<div class="dm-detail-heading"><div><h3>${dmEscape(item.label)}</h3><p>${dmEscape(item.date || '全部日期')} · ${dmEscape(item.subtitle)}${!meal ? data.kind === 'leave' && summary.dayHours != null ? ' · 當日時數只計本日；整筆時數包含其他實際請假日。' : ' · 同人多單分別列出；整筆時數包含整張申請。' : ''}</p></div></div>
        <form class="dm-filters" data-dm-filter><label><span>搜尋人員</span><input name="keyword" maxlength="100" value="${dmEscape(filters.keyword || '')}" placeholder="工號、姓名、部門"></label><label><span>部門</span><select name="department"><option value="">全部部門</option>${(data.departments || []).map((department) => `<option value="${dmEscape(department)}" ${filters.department === department ? 'selected' : ''}>${dmEscape(department)}</option>`).join('')}</select></label><button type="submit" class="primary-btn">查詢</button><button type="button" class="outline-btn" data-dm-clear>清除篩選</button></form>
        ${renderInsightTable(meal ? ['工號', '姓名', '部門', '目前用餐', '供應商交單'] : ['人員', ...(showApplicant ? ['申請人'] : []), '部門', '申請時段', data.kind === 'leave' && summary.dayHours != null ? '當日／整筆時數' : '整筆時數', '狀態', '申請內容'], details.map((row) => meal ? `<tr><td>${dmEscape(row.employeeId)}</td><td>${dmEscape(row.employeeName)}</td><td>${dmEscape(row.employeeDepartment || '—')}</td><td><span class="dm-status ${row.eating ? 'success' : ''}">${row.eating ? '用餐' : '不用餐'}</span></td><td>${row.submittedEating == null ? '未交單' : row.submittedEating ? '已交單・用餐' : '已交單・不用餐'}</td></tr>` : `<tr><td><strong>${dmEscape(row.employeeName)}</strong><small class="dm-cell-secondary">${dmEscape(row.employeeId)}</small></td>${showApplicant ? `<td>${dmApplicantCell(row)}</td>` : ''}<td>${dmEscape(row.employeeDepartment || '—')}</td><td>${dmEscape(row.startText)}<small class="dm-cell-secondary">至 ${dmEscape(row.endText)}</small></td><td>${data.kind === 'leave' && row.dayHours != null ? `${dmEscape(row.dayHours)}<small class="dm-cell-secondary">整筆 ${dmEscape(row.duration_hours)} 小時</small>` : dmEscape(row.duration_hours)}</td><td><span class="dm-status ${row.status === 'approved' ? 'success' : 'warning'}">${dmEscape(row.statusText)}</span></td><td><details class="dm-request-detail"><summary>${dmEscape(row.leaveTypeName || (data.kind === 'leave' ? '請假內容' : '加班內容'))}</summary><p>${dmEscape(row.reason || '未填寫原因')}</p>${data.kind === 'leave' ? renderLeaveDaysSummary(row) : ''}${renderRequestReviewProgress(row)}</details></td></tr>`), '目前沒有符合條件的資料。')}
        <footer class="dm-pagination"><span>顯示 ${data.totalRecords ? (data.page - 1) * 50 + 1 : 0}–${Math.min(data.page * 50, data.totalRecords)} 筆，共 ${data.totalRecords} 筆${data.unfilteredRecords !== data.totalRecords ? `（篩選前 ${data.unfilteredRecords} 筆）` : ''}</span><div><button type="button" class="outline-btn" data-dm-page="${data.page - 1}" ${data.page <= 1 ? 'disabled' : ''}>上一頁</button><span>${data.page} / ${data.totalPages}</span><button type="button" class="outline-btn" data-dm-page="${data.page + 1}" ${data.page >= data.totalPages ? 'disabled' : ''}>下一頁</button></div></footer></div>`;
};
function dmSalaryDetail(data, tabs, item) {
    const money = (amount) => `NT$ ${Number(amount || 0).toLocaleString('zh-TW')}`, summary = data.summary, filters = data.filters || {};
    return `<div class="dm-detail">${tabs}${dmSummary([[summary.people, '符合條件人數'], [summary.requests, '申請筆數'], [money(summary.requestedAmount), '申請金額'], [money(summary.approvedAmount), '已複核金額']])}<div class="dm-detail-heading"><div><h3>${dmEscape(item.label)}</h3><p>${dmEscape(item.date)} 登記月份 · ${dmEscape(item.subtitle)}。同一人多筆申請分別計數。</p></div></div><form class="dm-filters" data-dm-filter><label><span>搜尋人員</span><input name="keyword" maxlength="100" value="${dmEscape(filters.keyword || '')}" placeholder="工號、姓名、部門"></label><label><span>部門</span><select name="department"><option value="">全部部門</option>${data.departments.map((department) => `<option value="${dmEscape(department)}" ${filters.department === department ? 'selected' : ''}>${dmEscape(department)}</option>`).join('')}</select></label><button type="submit" class="primary-btn">查詢</button><button type="button" class="outline-btn" data-dm-clear>清除篩選</button></form>${renderInsightTable(['工號／姓名', '部門', '申請金額', '已複核金額', '狀態', '日期／版本'], data.records.map((row) => `<tr><td>${dmEscape(row.employeeId)} ${dmEscape(row.employeeName)}</td><td>${dmEscape(row.employeeDepartment || '—')}</td><td>${money(row.requestedAmount)}</td><td>${row.approvedAmount == null ? '—' : money(row.approvedAmount)}</td><td><span class="dm-status ${row.status === 'approved' ? 'success' : 'warning'}">${row.status === 'approved' ? row.entryMode === 'admin_paper_approved' ? '補登記' : '已複核' : '待複核'}</span></td><td>${dmEscape(new Date(row.updatedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }))}<small class="dm-cell-secondary">v${row.revision} · ${dmEscape(row.requestId)}</small></td></tr>`), '目前沒有符合條件的資料。')}<footer class="dm-pagination"><span>共 ${data.totalRecords} 筆（篩選前 ${data.unfilteredRecords} 筆）</span><div><button type="button" class="outline-btn" data-dm-page="${data.page - 1}" ${data.page <= 1 ? 'disabled' : ''}>上一頁</button><span>${data.page} / ${data.totalPages}</span><button type="button" class="outline-btn" data-dm-page="${data.page + 1}" ${data.page >= data.totalPages ? 'disabled' : ''}>下一頁</button></div></footer></div>`;
}
async function dmLoadDetail(key, page = 1, filters = null) {
    const item = dmItem(key); if (!item?.available) return;
    if (dmLegacy.includes(key)) { ++dmState.sequence; dmState.detail = null; dmState.filters = {}; openAdminDashboardInsight(key); return; }
    const identity = dmState.identity, sequence = ++dmState.sequence;
    if (filters) dmState.filters = filters;
    else if (state.activeInsightKey !== key) dmState.filters = {};
    const selectedFilters = { ...dmState.filters };
    dmState.detail = null; openAdminDashboardInsight(key);
    try {
        const result = await requestJson(`/api/browser/admin/dashboard-metrics/detail?${new URLSearchParams({ key, page, ...selectedFilters, ...(item.date ? { date: item.date } : {}) })}`, { auth: true });
        if (identity !== dmState.identity || sequence !== dmState.sequence || state.activeInsightKey !== key) return;
        dmState.detail = result.detail;
    } catch (error) { if (identity !== dmState.identity || sequence !== dmState.sequence || state.activeInsightKey !== key) return; dmState.detail = { metric: { key }, error: error.message }; }
    refreshAdminDashboardInsightModal();
}
ui.dashboardInsightContent?.addEventListener('click', (event) => {
    const item = event.target.closest('[data-action="dm-insight"]'); if (item) { dmLoadDetail(item.dataset.key); return; }
    const page = event.target.closest('[data-dm-page]'); if (page) dmLoadDetail(state.activeInsightKey, Number(page.dataset.dmPage));
    if (event.target.closest('[data-dm-clear]')) dmLoadDetail(state.activeInsightKey, 1, {});
    if (event.target.closest('[data-dm-retry]')) dmLoadDetail(state.activeInsightKey);
    const navigate = event.target.closest('[data-dm-navigate]');
    if (navigate) { closeDashboardInsightModal(); state.activeSections.admin = navigate.dataset.dmNavigate; if (navigate.dataset.subsection) activateWorkspaceSubsection('admin', navigate.dataset.dmNavigate, navigate.dataset.subsection); renderDashboard(state.dashboard); }
});
ui.dashboardInsightContent?.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-dm-filter]'); if (!form) return;
    event.preventDefault(); dmLoadDetail(state.activeInsightKey, 1, { keyword: form.elements.keyword.value.trim(), department: form.elements.department.value });
});
const dmPreviousClick = handleDashboardClick;
handleDashboardClick = async function metricDashboardClick(event) {
    const button = event.target.closest('[data-action]'), action = button?.dataset.action;
    if (action === 'dm-settings') { event.preventDefault(); dmOpenSettings(); return; }
    if (action === 'dm-insight') { event.preventDefault(); await dmLoadDetail(button.dataset.key); return; }
    if (action === 'dm-review') {
        event.preventDefault(); requestCalendars.reviewKind = button.dataset.kind || 'leave'; state.employeeWorkspacePanel = 'supervisor-review';
        renderDashboard(state.dashboard); document.getElementById(`rc-${requestCalendars.reviewKind}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); return;
    }
    return dmPreviousClick(event);
};
const dmPreviousEmployee = renderEmployeeDashboard;
renderEmployeeDashboard = function employeeReviewNotice(dashboard) {
    const html = dmPreviousEmployee(dashboard), review = dashboard.supervisorReview;
    if (!review?.canUse) return html;
    const notice = `<section class="dm-review-notice ${review.count ? 'has-pending' : ''}" aria-label="待主管審核事件"><div><h3>待我審核 <strong>${review.count}</strong> 筆</h3><span>請假 ${review.leaveCount || 0} 筆 · 加班 ${review.overtimeCount || 0} 筆</span></div><div class="inline-actions"><button type="button" class="outline-btn" data-action="dm-review" data-kind="leave">請假 ${review.leaveCount || 0}</button><button type="button" class="outline-btn" data-action="dm-review" data-kind="overtime">加班 ${review.overtimeCount || 0}</button></div></section>`;
    return notice + html;
};
function renderRequestReviewProgress(row) {
    const policy = row.reviewPolicy; if (!policy) return '';
    const required = policy.reviewers.filter((r) => r.required), approved = required.filter((r) => r.decision === 'approved' && !r.revoked).length;
    return `<details class="dm-review-progress"><summary>${policy.mode === 'required' ? `必審 ${approved}/${required.length} 已核准` : '任一主管核准即可'}</summary><ul>${policy.reviewers.map((r) => `<li>${dmEscape(r.id)} ${dmEscape(r.name)}${r.required ? '（必審）' : ''}：${r.revoked ? '已停用' : r.decision === 'approved' ? '已核准' : r.decision === 'rejected' ? '已駁回' : row.status === 'pending_supervisor' ? '待審核' : '免再審核'}${r.comment ? ` · ${dmEscape(r.comment)}` : ''}</li>`).join('')}</ul></details>`;
}
const dmPreviousRender = renderDashboard;
renderDashboard = function renderMetricsDashboard(dashboard) {
    const identity = `${state.token}/${dashboard.role}/${dashboard.user?.id || ''}`;
    if (identity !== dmState.identity) { if (dmState.identity && state.activeInsightKey) closeDashboardInsightModal(); dmState.busy = false; dmState.dirty = false; dmClose(true); Object.assign(dmState, { identity, detail: null, draft: null, filters: {}, sequence: dmState.sequence + 1 }); }
    const result = dmPreviousRender(dashboard);
    if (dashboard.role === 'admin' && state.activeInsightKey) {
        const item = dmItem(state.activeInsightKey, dashboard);
        if (!item?.available) { ++dmState.sequence; dmState.detail = null; refreshAdminDashboardInsightModal(); }
        else if (dmLegacy.includes(state.activeInsightKey)) refreshAdminDashboardInsightModal();
        else if (dmState.detail && state.activeInsightKey === dmState.detail.metric.key) dmLoadDetail(state.activeInsightKey, dmState.detail.page || 1);
    }
    return result;
};
const dmPreviousSync = handleRealtimeSyncMessage;
handleRealtimeSyncMessage = async function syncMetricDashboard(payload) {
    if (payload?.type === 'dashboardMetrics' && state.dashboard?.role === 'admin') {
        if (dmState.busy || dmState.dirty) return;
        return reloadDashboard();
    }
    if (payload?.type === 'meals' && state.dashboard?.role === 'admin' && typeof mealActive === 'function' && mealActive() &&
        (mealState.busy || mealState.dirty || mealState.memberEdit || document.activeElement?.closest('[data-meal-form]'))) return dmPreviousSync(payload);
    if (['meals', 'salaryAdvances'].includes(payload?.type) && state.dashboard?.role === 'admin') return reloadDashboard();
    return dmPreviousSync(payload);
};
const dmPreviousLogout = handleLogout;
handleLogout = function logoutMetrics(...args) { dmState.busy = false; dmState.dirty = false; dmClose(true); Object.assign(dmState, { identity: '', detail: null, sequence: dmState.sequence + 1 }); return dmPreviousLogout(...args); };
