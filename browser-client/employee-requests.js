/* Employee-only request workspaces. Request semantics and authorization stay on the existing APIs. */
const employeeRequests = { identity: '', dashboard: null, leave: null, overtime: null, balances: null, balanceError: '', balanceLoading: false, balanceSequence: 0, balancesOpen: false };
const erLabels = { leave: '請假', overtime: '加班' };
const erStatuses = { pending_supervisor: '待主管審核', pending_admin: '待管理部終審', approved: '已核准', rejected: '已駁回', withdrawn: '已撤回', cancelled: '已作廢' };
const erEscape = (value) => escapeHtml(String(value ?? ''));
const erToday = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const erMobile = () => Boolean(window.matchMedia?.('(max-width: 720px)').matches);
const erIdentity = (dashboard = state.dashboard) => `${state.token || ''}/${dashboard?.role || ''}/${dashboard?.user?.id || ''}`;
function erReset(identity = '') {
    for (const kind of ['leave', 'overtime']) document.getElementById(`er-${kind}-dialog`)?.remove();
    Object.assign(employeeRequests, { identity, dashboard: null, leave: null, overtime: null, balances: null, balanceError: '', balanceLoading: false, balancesOpen: false, balanceSequence: employeeRequests.balanceSequence + 1 });
}
function erState(kind) {
    if (!Object.hasOwn(erLabels, kind)) throw new Error('不支援的申請類別。');
    return employeeRequests[kind] ||= { month: erToday().slice(0, 7), date: erToday(), view: 'calendar', mode: 'browse', selecting: false, mobileOpen: false, filters: {}, page: 1,
        data: null, request: null, requestId: '', loading: false, sequence: 0, error: '', notice: '', busy: false, draft: null, confirmation: null };
}
function erLive(identity, current, kind) { return state.dashboard?.role === 'employee' && erIdentity() === identity && employeeRequests.identity === identity && employeeRequests[kind] === current; }
function erMinimum(kind) { return state.dashboard?.[kind]?.historyWindow?.earliestMonth || '2000-01'; }
function erClampMonth(kind) {
    const current = erState(kind), minimum = erMinimum(kind);
    if (current.month < minimum) { current.month = minimum; current.date = `${minimum}-01`; current.page = 1; current.requestId = ''; current.request = null; current.confirmation = null; }
}
function erDateValid(date) { return /^\d{4}-\d{2}-\d{2}$/.test(date || '') && Number.isFinite(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date; }
function erDateShift(date, days) { return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10); }
function erDateTime(value) {
    const timestamp = Number(value);
    if (!Number.isFinite(timestamp)) return { date: '', time: '' };
    const parsed = new Date(timestamp + 8 * 3600000);
    if (!Number.isFinite(parsed.getTime())) return { date: '', time: '' };
    const text = parsed.toISOString(); return { date: text.slice(0, 10), time: text.slice(11, 16) };
}
function erWallHours(startDate, startTime, endDate, endTime, midnight = false) {
    if (!erDateValid(startDate) || !erDateValid(endDate) || ![startTime, endTime].every((value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value || ''))) return '';
    const start = Date.parse(`${startDate}T${startTime}:00+08:00`), end = Date.parse(`${endDate}T${endTime}:00+08:00`) + (midnight && endTime === '00:00' ? 86400000 : 0);
    // A rounded-up hundredth can exceed a minute-based interval and fail the server's exact bound.
    return end > start ? String(Math.floor((end - start) / 36000) / 100) : '';
}
function erNewDraft(kind) {
    if (kind === 'leave') return { leaveTypeId: state.dashboard?.leave?.leaveTypes?.[0]?.id || '', reason: '', rows: [], commonStart: '08:20', commonEnd: '17:00', commonBreakMinutes: '40', commonBreakManual: false, commonHours: '8', commonManual: false, confirming: false, error: '' };
    return { startDate: erState(kind).date, startTime: '17:30', endDate: erState(kind).date, endTime: '19:30', durationHours: '2', hoursManual: false, reason: '', confirming: false, error: '' };
}
function erNewRow(draft, date) { return { date, startTime: draft.commonStart, endTime: draft.commonEnd, breakMinutes: draft.commonBreakMinutes, breakManual: draft.commonBreakManual, hours: draft.commonHours, manual: draft.commonManual }; }
function erAutoLeaveRow(row) {
    if (!row.breakManual) row.breakMinutes = String(leaveSegmentDefaultBreakMinutes(row.startTime, row.endTime));
    if (!row.manual) row.hours = String(leaveSegmentNetHours(row.startTime, row.endTime, row.breakMinutes));
}
function erDraftSummary(kind, draft) {
    if (!draft) return '';
    if (kind === 'overtime') return `${Number(draft.durationHours) || 0} 小時 · 1 張申請`;
    return `${new Set(draft.rows.map((row) => row.date).filter(Boolean)).size} 日 · ${draft.rows.length} 段 · ${Math.round(draft.rows.reduce((sum, row) => sum + (Number(row.hours) || 0), 0) * 100) / 100} 小時`;
}
function erBuildPayload(kind, draft) {
    if (kind === 'leave') {
        if (!(state.dashboard?.leave?.leaveTypes || []).some((type) => type.id === draft.leaveTypeId)) throw new Error('請選擇目前可用的假別。');
        return { leaveTypeId: draft.leaveTypeId, ...collectLeaveSegments(draft.rows), reason: draft.reason.trim() };
    }
    const wall = Number(erWallHours(draft.startDate, draft.startTime, draft.endDate, draft.endTime));
    if (!wall) throw new Error('請填完整起訖日期與時間，結束必須晚於開始。跨夜時請設定完整結束日期。');
    const hours = Number(draft.durationHours);
    if (!/^\d+(\.\d{1,2})?$/.test(String(draft.durationHours)) || !Number.isFinite(hours) || hours <= 0 || hours > wall) throw new Error('實際加班時數須大於 0、最多兩位小數，且不可超過起訖時間；請扣除休息時間。');
    return { employeeId: state.dashboard.user.id, startDate: draft.startDate, startTime: draft.startTime, endDate: draft.endDate, endTime: draft.endTime, durationHours: hours, reason: draft.reason.trim() };
}
function erButton(kind, action, label, attributes = '', primary = false) {
    return `<button type="button" class="er-button${primary ? ' er-primary' : ''}" data-action="er-${action}" data-kind="${kind}" ${attributes}>${label}</button>`;
}
function erBadge(row) { return `<span class="er-badge er-status-${erEscape(row.status)}">${erEscape(row.statusText || erStatuses[row.status] || row.status)}</span>`; }
function erSelect(kind, field, label, options, selected = '', filter = false) {
    if (selected && !options.some(([value]) => value === selected)) options = [...options, [selected, `${selected}（目前不可用）`]];
    return `<label class="er-field"><span>${label}</span><select ${filter ? 'data-er-filter' : 'data-er-field'}="${field}" data-kind="${kind}" data-er-focus="${field}">${options.map(([value, text]) => `<option value="${erEscape(value)}" ${value === selected ? 'selected' : ''}>${erEscape(text)}</option>`).join('')}</select></label>`;
}
function erInput(kind, name, label, value, type = 'text', attributes = '', rowIndex = null) {
    return `<label class="er-field"><span>${label}</span><input type="${type}" ${rowIndex === null ? 'data-er-field' : 'data-er-row-field'}="${name}" ${rowIndex === null ? '' : `data-row="${rowIndex}"`} data-kind="${kind}" data-er-focus="${rowIndex === null ? name : `row-${rowIndex}-${name}`}" value="${erEscape(value)}" ${attributes}></label>`;
}
function erEventTime(event, date) {
    const segments = (event.segments || []).filter((segment) => segment.date === date);
    return segments.map((segment) => { const start = erDateTime(segment.startAt), end = erDateTime(segment.endAt); return `${start.time}–${start.date === end.date ? end.time : '24:00'}`; }).join('、');
}
function erGrid(kind, current) {
    const [year, month] = current.month.split('-').map(Number), offset = new Date(`${current.month}-01T00:00:00Z`).getUTCDay(), count = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const eventsByDate = new Map();
    for (const event of current.data?.events || []) for (const date of new Set((event.segments || []).map((segment) => segment.date))) { if (!eventsByDate.has(date)) eventsByDate.set(date, []); eventsByDate.get(date).push(event); }
    const chosen = new Set(kind === 'leave' ? current.draft?.rows.map((row) => row.date) : [current.draft?.startDate]);
    return `<div class="er-calendar" role="group" aria-label="${current.month} ${erLabels[kind]}日曆">${['日', '一', '二', '三', '四', '五', '六'].map((day) => `<div class="er-weekday">${day}</div>`).join('')}
        ${Array.from({ length: offset }, () => '<div class="er-calendar-blank" aria-hidden="true"></div>').join('')}
        ${Array.from({ length: count }, (_, index) => { const date = `${current.month}-${String(index + 1).padStart(2, '0')}`, events = eventsByDate.get(date) || [], selected = current.selecting ? chosen.has(date) : current.date === date;
            return `<div class="er-day ${selected ? 'er-day-selected' : ''} ${date === erToday() ? 'er-day-today' : ''}">
                <button type="button" class="er-day-hit" data-action="er-date" data-kind="${kind}" data-date="${date}" data-er-focus="day-${date}" aria-pressed="${selected}" aria-label="${date}${date === erToday() ? ' 今天' : ''}，${events.length} 張申請${current.selecting ? chosen.has(date) ? '，已選取，再按取消' : '，選取日期' : '，查看當日紀錄'}"><span class="er-day-number">${index + 1}${date === erToday() ? '<small>今天</small>' : ''}</span>${events.length ? `<span class="er-day-count">${events.length} 筆</span>` : ''}</button>
                ${current.selecting ? chosen.has(date) ? '<span class="er-selected-mark" aria-hidden="true">✓</span>' : '' : `<div class="er-day-events">${events.slice(0, 2).map((event) => `<button type="button" class="er-event er-status-${erEscape(event.status)}" data-action="er-record" data-kind="${kind}" data-id="${erEscape(event.id)}" aria-label="查看整張${erLabels[kind]}申請：${erEscape(event.leaveTypeName || event.employeeName || erLabels[kind])}，${erEscape(erEventTime(event, date))}，${erEscape(event.statusText || erStatuses[event.status])}"><span>${erEscape(event.leaveTypeName || (event.employeeId !== state.dashboard?.user?.id ? event.employeeName : '加班'))} ${erEscape(erEventTime(event, date))}</span><small>${erEscape(event.statusText || erStatuses[event.status])}</small></button>`).join('')}${events.length > 2 ? `<span class="er-more">另有 ${events.length - 2} 筆</span>` : ''}</div>`}
            </div>`;
        }).join('')}</div>`;
}
function erPagination(kind, detail) {
    if (!detail || detail.totalPages <= 1) return '';
    return `<div class="er-pagination">${erButton(kind, 'page', '上一頁', `data-page="${detail.page - 1}" ${detail.page <= 1 ? 'disabled' : ''}`)}<span>第 ${detail.page}／${detail.totalPages} 頁</span>${erButton(kind, 'page', '下一頁', `data-page="${detail.page + 1}" ${detail.page >= detail.totalPages ? 'disabled' : ''}`)}</div>`;
}
function erRecordList(kind, detail) {
    const current = erState(kind);
    if (!detail) return `<div class="er-empty">${current.error ? '紀錄未載入，請重新整理。' : '讀取紀錄中…'}</div>`;
    if (!detail.records.length) return '<div class="er-empty">沒有符合條件的申請。可切換月份或清除篩選。</div>';
    return `<div class="er-record-list">${detail.records.map((row) => `<button type="button" class="er-record-row" data-action="er-record" data-kind="${kind}" data-id="${erEscape(row.id)}"><span class="er-record-main"><strong>${erEscape(kind === 'leave' ? row.leaveTypeName : row.employeeId === state.dashboard.user.id ? '本人加班' : `${row.employeeName} · 我代申請`)}</strong><span>${erEscape(row.startText)}<br>至 ${erEscape(row.endText)}</span>${kind === 'leave' ? `<small class="er-period-label">${erRecordPeriodLabel(row)}</small>` : ''}</span><span class="er-record-tail"><strong>${erEscape(row.duration_hours)} 小時</strong>${erBadge(row)}</span></button>`).join('')}</div>${erPagination(kind, detail)}`;
}
function erRecordPeriodLabel(row) {
    const mode = row.dateSelectionMode || row.date_selection_mode;
    if (mode === 'explicit_segments') { const segments = row.leaveSegments || row.leave_segments || []; return `實際 ${new Set(segments.map((segment) => segment.date || erDateTime(segment.startAt).date)).size} 日 · ${segments.length} 段，依明細時段請假`; }
    if (mode === 'explicit_dates') return `實際 ${(row.dailyHours || []).length} 日，僅勾選日期請假`;
    return '舊單沿用原起訖範圍';
}
function erFullRecord(kind, row) {
    const current = erState(kind);
    if (!row) return `<p class="er-empty">${current.error ? '無法載入這張申請，請返回紀錄後重試。' : '讀取整張申請中…'}</p>`;
    const fields = [['單號', row.id], ['員工', `${row.employeeId} ${row.employeeName}`], ['申請人', `${row.applicantId} ${row.applicantName}`], ['完整開始', row.startText], ['完整結束', row.endText], ['整筆時數', `${row.duration_hours} 小時`], ['申請時間', row.createdText], ['流程', row.approvalModeText]];
    const policy = row.reviewPolicy, reviewers = policy?.reviewers || [];
    return `<div class="er-record-detail"><div class="er-pane-heading"><h3>${erEscape(row.leaveTypeName || '加班')}申請詳情</h3>${erBadge(row)}</div><p class="er-note">這是整張申請；多個日期與時段一起審核、一起撤回。</p>
        <dl class="er-facts">${fields.map(([label, value]) => `<div><dt>${label}</dt><dd>${erEscape(value || '—')}</dd></div>`).join('')}</dl>
        ${kind === 'leave' ? `<div class="er-request-periods">${renderLeaveDaysSummary(row)}</div>` : ''}
        <h4>申請事由</h4><p class="er-reason">${erEscape(row.reason || '未填寫')}</p>
        <h4>審核進度</h4><p class="er-note">${erEscape(row.approval_mode && row.approval_mode !== 'self_request' ? row.approvalModeText || '依原申請流程' : kind === 'leave' ? '指定主管審核 → 管理部終審' : '指定主管審核')}</p>
        ${reviewers.length ? `<p>${policy.mode === 'required' ? '指定必審主管全部核准' : '任一位指定主管核准即可'}</p><ul class="er-reviewers">${reviewers.map((reviewer) => `<li><strong>${erEscape(reviewer.id)} ${erEscape(reviewer.name)}${reviewer.required ? '（必審）' : ''}</strong><span>${reviewer.revoked ? '已停用' : reviewer.decision === 'approved' ? '已核准' : reviewer.decision === 'rejected' ? '已駁回' : row.status === 'pending_supervisor' ? '待審核' : '免再審核'}</span>${reviewer.comment ? `<p>${erEscape(reviewer.comment)}</p>` : ''}${reviewer.decidedAt ? `<p>${erEscape(erDateTime(reviewer.decidedAt).date)} ${erEscape(erDateTime(reviewer.decidedAt).time)}</p>` : ''}</li>`).join('')}</ul>` : `<p>${erEscape(row.supervisorId || '')} ${erEscape(row.supervisorName || '依原審核流程')}</p>`}
        ${row.supervisor_comment ? `<p class="er-note">主管意見：${erEscape(row.supervisor_comment)}</p>` : ''}${row.supervisorDecidedText ? `<p class="er-note">主管審核時間：${erEscape(row.supervisorDecidedText)}</p>` : ''}
        ${kind === 'leave' ? `<p class="er-note">管理部：${erEscape(row.adminName || (row.status === 'pending_admin' ? '待終審' : '尚無終審紀錄'))}${row.adminDecidedText ? ` · ${erEscape(row.adminDecidedText)}` : ''}</p>${row.admin_comment ? `<p class="er-note">管理部意見：${erEscape(row.admin_comment)}</p>` : ''}` : ''}
        ${row.approval_mode === 'admin_paper_approved' ? `<details><summary>紙本核准資料</summary><p>單號 ${erEscape(row.paperNo || '—')} · 核准者 ${erEscape(row.paperApprovedBy || '—')}</p><p>${erEscape(row.paperComment || '')}</p></details>` : ''}
        ${row.calendarActions?.withdraw ? `<div class="er-record-actions">${current.confirmation?.type === 'withdraw' && current.confirmation.id === row.id ? erActionConfirmation(kind) : erButton(kind, 'withdraw', '撤回整張申請', `data-id="${erEscape(row.id)}" ${current.busy ? 'disabled' : ''}`)}</div>` : ''}</div>`;
}
function erWithdrawalPeriods(kind, row) {
    if (kind === 'leave' && row.dateSelectionMode === 'explicit_segments') return (row.leaveSegments || []).map((segment) => { const start = erDateTime(segment.startAt), end = erDateTime(segment.endAt); return `${start.date} ${start.time}–${end.date !== start.date ? '24:00' : end.time}（${segment.hours} 小時）`; });
    if (kind === 'leave' && row.dateSelectionMode === 'explicit_dates') return (row.dailyHours || []).map((day) => `${day.date}（${day.hours} 小時）`);
    return [`${row.startText} 至 ${row.endText}`];
}
function erActionConfirmation(kind) {
    const current = erState(kind), confirmation = current.confirmation;
    if (!confirmation) return '';
    const title = { withdraw: '確認撤回整張申請', discard: '確認放棄草稿', 'apply-time': '確認套用全部時段' }[confirmation.type];
    const row = current.request;
    const content = confirmation.type === 'withdraw' && row ? `<ul>${erWithdrawalPeriods(kind, row).map((period) => `<li>${erEscape(period)}</li>`).join('')}</ul><p>整筆 ${erEscape(row.duration_hours)} 小時，所有時段都會一起撤回。</p>`
        : confirmation.type === 'discard' ? '<p>這份草稿尚未送出。放棄後將清除所有已填日期、時段與事由。</p>'
            : '<p>所有時段將改用上方共用時間、休息分鐘與時數，會取代個別調整；套用後請核對同日多段是否重疊。</p>';
    return `<div class="er-action-confirm" role="alertdialog" aria-labelledby="er-${kind}-confirm-title"><h4 id="er-${kind}-confirm-title">${title}</h4>${content}<div class="er-inline-actions">${erButton(kind, 'cancel-confirm', '取消', current.busy ? 'disabled' : '')}${erButton(kind, `confirm-${confirmation.type}`, current.busy ? '處理中…' : confirmation.type === 'withdraw' ? '確定撤回整張申請' : confirmation.type === 'discard' ? '確定放棄' : '確定套用', `data-id="${erEscape(confirmation.id || '')}" data-er-focus="confirm-action" ${current.busy ? 'disabled' : ''}`, true)}</div></div>`;
}
function erSummary(kind, draft) { return `<strong data-er-summary>${erDraftSummary(kind, draft)}</strong><span>${kind === 'leave' ? '同一假別，所有時段合為 1 張申請' : '單一連續時段，可跨午夜與多日'}</span>`; }
function erConfirmation(kind, draft) {
    const type = state.dashboard?.leave?.leaveTypes?.find((row) => row.id === draft.leaveTypeId);
    return `<div class="er-confirmation"><h4>送出前核對整張申請</h4>${kind === 'leave' ? `<p><strong>${erEscape(type?.name || draft.leaveTypeId)}</strong></p><ol class="er-confirm-periods">${draft.rows.map((row) => `<li><strong>${erEscape(row.date)}</strong><span>${erEscape(row.startTime)}–${row.endTime === '00:00' ? '24:00' : erEscape(row.endTime)} · ${erEscape(row.hours)} 小時</span>${row.breakMinutes !== undefined ? `<span>休息 ${erEscape(row.breakMinutes)} 分鐘，已從請假時數扣除</span>` : ''}</li>`).join('')}</ol>` : `<p>${erEscape(draft.startDate)} ${erEscape(draft.startTime)}<br>至 ${erEscape(draft.endDate)} ${erEscape(draft.endTime)}</p>`}
        <h4>事由</h4><p class="er-reason">${erEscape(draft.reason || '未填寫')}</p><p class="er-note">${kind === 'leave' ? '送出後依指定主管審核規則，再交管理部終審。' : '送出後交指定主管審核，本人的申請不會自動核准。'}實際審核主管與進度可在送出後的整單詳情查看。</p></div>`;
}
function erEditor(kind) {
    const current = erState(kind), draft = current.draft, label = erLabels[kind];
    if (!draft) return '';
    const dates = new Set((draft.rows || []).map((row) => row.date));
    return `<div class="er-editor"><div class="er-pane-heading"><h3 id="er-${kind}-editor-title">${draft.confirming ? '確認' : '新增'}${label}申請</h3>${erButton(kind, 'close-editor', '×', `aria-label="暫存草稿並返回紀錄" ${current.busy ? 'disabled' : ''}`)}</div>
        <form id="er-${kind}-form" data-er-form="${kind}" novalidate><fieldset ${current.busy ? 'disabled' : ''}>
        ${draft.confirming ? erConfirmation(kind, draft) : `<div class="er-editor-body">
            ${kind === 'leave' ? `${erSelect(kind, 'leaveTypeId', '1　假別', (state.dashboard?.leave?.leaveTypes || []).map((type) => [type.id, type.name]), draft.leaveTypeId)}
                <div class="er-section-heading"><h4>2　日期與時段</h4>${erButton(kind, 'pick-dates', '選取日期')}</div>
                <details class="er-common"><summary>共用時段 · 套用全部已選日期</summary><div class="er-input-grid">${erInput(kind, 'commonStart', '開始時間', draft.commonStart, 'time')}${erInput(kind, 'commonEnd', '結束時間', draft.commonEnd, 'time')}${erInput(kind, 'commonBreakMinutes', '休息時間（分鐘）', draft.commonBreakMinutes, 'number', 'min="0" max="1439" step="1" required')}${erInput(kind, 'commonHours', '扣除休息後（小時）', draft.commonHours, 'number', 'min="0.01" max="24" step="0.01"')}</div><div class="er-inline-actions">${erButton(kind, 'auto-break', '恢復自動休息與時數')}${erButton(kind, 'apply-time', '套用到所有時段')}</div><p class="er-note">新選日期也會使用此設定；套用會覆蓋下方各段時間、休息與時數。</p></details>
                ${draft.rows.length ? `<div class="er-periods">${draft.rows.map((row, index) => `<section class="er-period"><div class="er-period-heading"><strong>第 ${index + 1} 段</strong>${erButton(kind, 'remove-row', '移除', `data-row="${index}" aria-label="移除第 ${index + 1} 段"`)}</div>${erInput(kind, 'date', '日期', row.date, 'date', 'required', index)}<div class="er-input-grid">${erInput(kind, 'startTime', '開始', row.startTime, 'time', 'required', index)}${erInput(kind, 'endTime', '結束', row.endTime, 'time', 'required', index)}${erInput(kind, 'breakMinutes', '休息時間（分鐘）', row.breakMinutes ?? '0', 'number', 'min="0" max="1439" step="1" required', index)}${erInput(kind, 'hours', '扣除休息後（小時）', row.hours, 'number', 'min="0.01" max="24" step="0.01" required', index)}</div><div class="er-inline-actions">${erButton(kind, 'auto-break', '恢復自動休息與時數', `data-row="${index}"`)}${erButton(kind, 'duplicate-row', '＋ 同日另一時段', `data-row="${index}"`)}</div><small>結束 00:00 表示該日 24:00；跨夜請拆成兩天。</small></section>`).join('')}</div>` : '<p class="er-empty">先在日曆選取日期，可選多個不連續日期；或按下方新增日期。</p>'}
                ${erButton(kind, 'add-row', '＋ 新增日期／時段')}<p class="er-note">已選 ${dates.size} 日。完整涵蓋 12:20–13:00 時預帶休息 40 分鐘，其他時段預帶 0 分鐘，可自行調整。修改休息會重新計算淨時數；手動休息或淨時數不會被時間變更覆蓋，可按「恢復自動休息與時數」重新帶入。最多 740 段，日期範圍最多 370 日。</p>`
                : `<p class="er-note">本人：${erEscape(state.dashboard?.user?.id)} ${erEscape(state.dashboard?.user?.name)}</p><h4>1　連續加班區間</h4><div class="er-input-grid">${erInput(kind, 'startDate', '開始日期', draft.startDate, 'date', 'required')}${erInput(kind, 'startTime', '開始時間', draft.startTime, 'time', 'required')}${erInput(kind, 'endDate', '結束日期', draft.endDate, 'date', 'required')}${erInput(kind, 'endTime', '結束時間', draft.endTime, 'time', 'required')}</div><div class="er-inline-actions">${erButton(kind, 'same-day', '結束在當日')}${erButton(kind, 'next-day', '結束在隔日')}</div>${erInput(kind, 'durationHours', '扣除休息後時數（小時）', draft.durationHours, 'number', 'min="0.01" step="0.01" required')}<p class="er-note">可直接修改完整結束日期。時數依起訖帶入，手動調整後保留；不連續日期請分筆申請。</p>`}
            <label class="er-field er-reason-field"><span>${kind === 'leave' ? '3' : '2'}　${label}事由</span><textarea data-er-field="reason" data-er-focus="reason" data-kind="${kind}" rows="3" placeholder="請簡述${label}原因">${erEscape(draft.reason)}</textarea></label>
            <p class="er-note">${kind === 'leave' ? '同一假別的所有時段一起送出，依既有指定主管與管理部終審規則處理。' : '指定主管依既有規則審核；核准不會直接修改打卡或出勤時間。'}</p></div>`}
        </fieldset><div class="er-form-error" data-er-form-error role="alert">${erEscape(draft.error)}</div>
        <footer class="er-editor-footer">${current.confirmation && current.confirmation.type !== 'withdraw' ? erActionConfirmation(kind) : ''}<div class="er-total">${erSummary(kind, draft)}</div><div class="er-footer-actions">${erButton(kind, draft.confirming ? 'edit-again' : 'discard', draft.confirming ? '返回修改' : '放棄草稿', current.busy || current.confirmation ? 'disabled' : '')}${draft.confirming ? erButton(kind, 'send', current.busy ? '送出中…' : `確認送出${label}`, current.busy || current.confirmation ? 'disabled' : '', true) : `<button type="submit" class="er-button er-primary" ${current.busy || current.confirmation || (kind === 'leave' && !draft.rows.length) ? 'disabled' : ''}>下一步確認</button>`}</div></footer></form></div>`;
}
function erPane(kind) {
    const current = erState(kind);
    if (current.mode === 'edit' && current.draft && !erMobile()) return erEditor(kind);
    if (current.mode === 'record') return `<div class="er-pane-actions">${erButton(kind, 'back-records', '← 返回紀錄')}${current.draft ? erButton(kind, 'resume', '返回草稿') : ''}</div>${erFullRecord(kind, current.request)}`;
    return `<div class="er-pane-heading"><h3>${current.view === 'calendar' ? current.date : current.month + ' 月內紀錄'}</h3>${current.view === 'calendar' ? erButton(kind, 'create-date', '申請這一天', current.busy ? 'disabled' : '') : ''}</div>
        ${current.selecting ? `<p class="er-note">${kind === 'leave' ? '在月曆勾選實際要請假的日期，再按「完成選取」填寫時段。' : '在月曆選開始日期，再按「完成選取」設定完整起訖。'}</p>` : ''}
        ${current.view === 'calendar' ? erRecordList(kind, current.data?.detail) : '<p class="er-empty">點選左側紀錄，查看整張申請與審核進度。</p>'}`;
}
function erBalanceHtml() {
    return `<details class="er-balances" data-er-balances ${employeeRequests.balancesOpen ? 'open' : ''}><summary>本人請假額度與年資特休明細</summary><div class="er-balance-content">${employeeRequests.balances ? typeof leBalanceTable === 'function' ? leBalanceTable(employeeRequests.balances) : '' : `<p class="er-note">${erEscape(employeeRequests.balanceError || '讀取本人額度中…')}</p>`}${typeof alRenderEmployeeEntry === 'function' ? alRenderEmployeeEntry() : ''}</div></details>`;
}
function renderEmployeeRequestWorkspace(kind) {
    const current = erState(kind), label = erLabels[kind], minimum = erMinimum(kind), data = current.data;
    const filters = current.filters, statuses = Object.entries(erStatuses).filter(([value]) => kind === 'leave' || value !== 'pending_admin');
    return `<section class="er-workspace" id="er-${kind}" data-er-kind="${kind}" aria-label="我的${label}" data-no-collapsible="true">
        <header class="er-heading"><div><h3>我的${label}</h3><p>選日期、送申請、查進度，都在這裡。</p></div><div class="er-heading-actions">${current.draft ? erButton(kind, 'resume', '繼續填寫草稿', current.busy ? 'disabled' : '') : erButton(kind, 'new', '＋ 新增申請', current.busy ? 'disabled' : '', true)}</div></header>
        ${kind === 'leave' ? erBalanceHtml() : ''}
        <div class="er-layout"><div class="er-calendar-column"><div class="er-calendar-toolbar"><div class="er-month-controls">${erButton(kind, 'month', '‹', `data-offset="-1" aria-label="上個月" ${current.month <= minimum ? 'disabled' : ''}`)}<label class="er-month-label"><span class="er-sr-only">${label}月份</span><input type="month" data-er-month data-kind="${kind}" data-er-focus="month" value="${current.month}" min="${minimum}" max="2100-12"></label>${erButton(kind, 'month', '›', `data-offset="1" aria-label="下個月" ${current.month >= '2100-12' ? 'disabled' : ''}`)}</div><div class="er-views" role="group" aria-label="${label}紀錄顯示方式">${['calendar', 'list'].map((view) => erButton(kind, 'view', view === 'calendar' ? '日曆' : '清單', `data-view="${view}" aria-pressed="${current.view === view}"`)).join('')}</div></div>
        <div class="er-filterbar">${erSelect(kind, 'status', '狀態', [['', '全部狀態'], ...statuses], filters.status, true)}${kind === 'leave' ? erSelect(kind, 'leaveTypeId', '假別', [['', '全部假別'], ...(state.dashboard?.leave?.leaveTypes || []).map((type) => [type.id, type.name])], filters.leaveTypeId, true) : erSelect(kind, 'relation', '申請對象', [['', '本人及我代申請'], ['self', '本人'], ['proxy', '我代申請']], filters.relation, true)}<div class="er-inline-actions">${erButton(kind, 'today', '本月')}${erButton(kind, 'refresh', '重新整理')}${Object.values(filters).some(Boolean) ? erButton(kind, 'clear-filters', '清除篩選') : ''}</div></div>
        ${current.selecting ? `<div class="er-selection"><span><strong>選擇${label}日期</strong><small>${kind === 'leave' ? `可選多個不連續日期 · 已選 ${new Set(current.draft?.rows.map((row) => row.date)).size} 日` : '選擇一筆連續加班的開始日期'}</small></span><div>${erButton(kind, 'stop-picking', '返回瀏覽')}${erButton(kind, 'done-picking', '完成選取', kind === 'leave' && !current.draft?.rows.length ? 'disabled' : '', true)}</div></div>` : current.draft && current.mode !== 'edit' ? `<div class="er-draft-note">有一份未送出的${label}草稿 ${erButton(kind, 'resume', '繼續填寫')}</div>` : ''}
        <div class="er-message ${current.error ? 'er-error' : ''}" role="status" aria-live="polite">${erEscape(current.error || (current.loading ? '正在載入紀錄…' : current.notice))}${current.error ? erButton(kind, 'refresh', '重試') : ''}</div>
        <div class="er-month-summary"><span>${current.month} · ${data ? `${data.totalCount} 張申請` : '尚未載入'}</span><span>整張單計 1 筆</span></div>
        ${current.view === 'calendar' ? erGrid(kind, current) : erRecordList(kind, data?.detail)}
        <p class="er-history-note">本人${label}紀錄可查看 ${minimum} 起的月份；較早紀錄請洽管理者。</p></div>
        <aside class="er-pane" aria-label="${label}申請與紀錄詳情">${erPane(kind)}</aside></div>
        <details class="er-help"><summary>如何申請與查看進度？</summary><ol><li>點日期瀏覽當日紀錄；點紀錄查看整張單。日曆／清單共用月份與篩選。</li><li>按「新增申請」選日期，再填時段與事由。${kind === 'leave' ? '同一假別可合併多日期與同日多段。' : '加班採單一連續區間，可修改完整結束日期。'}</li><li>確認全部日期、時段與扣除休息後時數，再送出。</li></ol><p>草稿在這次登入期間保留；切換工作頁、月份或檢視不會清除。重新載入、關閉頁面、登出或換帳號會清除，離開前請送出或自行記下內容。</p><p>${kind === 'leave' ? '請假待主管或待管理部終審時可撤回整張單。' : '加班僅待主管審核時可撤回整張單。'}最後可操作狀態依伺服器判定，既有單據不可拖曳改期。</p></details>
        ${erMobile() && current.mode === 'edit' && current.mobileOpen && current.draft ? `<dialog class="er-mobile-dialog" id="er-${kind}-dialog" data-er-dialog="${kind}" aria-labelledby="er-${kind}-editor-title">${erEditor(kind)}</dialog>` : ''}</section>`;
}
function erFocusSnapshot() {
    const active = document.activeElement, root = active?.closest?.('[data-er-kind]');
    if (!root) return null;
    return { kind: root.dataset.erKind, key: active.dataset?.erFocus, start: active.selectionStart, end: active.selectionEnd,
        bodyScroll: root.querySelector('.er-editor-body')?.scrollTop || 0, dialogScroll: root.querySelector('.er-mobile-dialog')?.scrollTop || 0 };
}
function erRestoreFocus(snapshot) {
    if (!snapshot) return;
    const root = document.getElementById(`er-${snapshot.kind}`);
    const control = [...(root?.querySelectorAll('[data-er-focus]') || [])].find((item) => item.dataset.erFocus === snapshot.key);
    if (control) { control.focus({ preventScroll: true }); if (typeof snapshot.start === 'number') { try { control.setSelectionRange(snapshot.start, snapshot.end); } catch (_) { /* Date/number inputs have no selection API. */ } } }
    const body = root?.querySelector('.er-editor-body'), dialog = root?.querySelector('.er-mobile-dialog');
    if (body) body.scrollTop = snapshot.bodyScroll; if (dialog) dialog.scrollTop = snapshot.dialogScroll;
}
function erSetupDialogs() {
    for (const dialog of document.querySelectorAll('[data-er-dialog]')) if (!dialog.open) dialog.showModal();
}
function erPaint(kind, { focus = '', preserveFocus = true } = {}) {
    const root = document.getElementById(`er-${kind}`); if (!root || state.dashboard?.role !== 'employee') return;
    const snapshot = preserveFocus ? erFocusSnapshot() : null;
    const commonOpen = root.querySelector('.er-common')?.open;
    root.outerHTML = renderEmployeeRequestWorkspace(kind); erSetupDialogs();
    const replacement = document.getElementById(`er-${kind}`);
    if (commonOpen && replacement.querySelector('.er-common')) replacement.querySelector('.er-common').open = true;
    erRestoreFocus(snapshot);
    if (focus) { const element = [...replacement.querySelectorAll('[data-er-focus]')].find((node) => node.dataset.erFocus === focus); element?.focus({ preventScroll: true }); }
}
async function erLoad(kind) {
    if (state.dashboard?.role !== 'employee') return;
    erClampMonth(kind);
    const current = erState(kind), identity = employeeRequests.identity, sequence = ++current.sequence;
    current.loading = true; current.error = ''; erPaint(kind);
    const params = new URLSearchParams({ month: current.month, scope: 'mine', page: current.page, ...current.filters });
    if (current.view === 'calendar') params.set('date', current.date);
    if (current.requestId && current.mode === 'record') params.set('requestId', current.requestId);
    try {
        const result = await requestJson(`/api/browser/employee/${kind}/calendar?${params}`, { auth: true });
        if (!erLive(identity, current, kind) || sequence !== current.sequence) return;
        current.data = result.calendar; current.page = result.calendar.detail.page; current.request = result.calendar.request || null;
    } catch (error) {
        if (!erLive(identity, current, kind) || sequence !== current.sequence) return;
        current.error = error.message; current.data = null; current.request = null;
    } finally { if (erLive(identity, current, kind) && sequence === current.sequence) { current.loading = false; erPaint(kind); } }
}
async function erLoadBalances() {
    if (state.dashboard?.role !== 'employee' || employeeRequests.balanceLoading || employeeRequests.balances !== null || !document.getElementById('er-leave')) return;
    const identity = employeeRequests.identity, sequence = ++employeeRequests.balanceSequence;
    employeeRequests.balanceLoading = true;
    try {
        const result = await requestJson(`/api/browser/employee/leave/balances?year=${erToday().slice(0, 4)}`, { auth: true });
        if (erIdentity() !== identity || employeeRequests.identity !== identity || sequence !== employeeRequests.balanceSequence) return;
        employeeRequests.balances = result.balances; employeeRequests.balanceError = '';
    } catch (error) { if (erIdentity() === identity && sequence === employeeRequests.balanceSequence) employeeRequests.balanceError = error.message; }
    finally { if (erIdentity() === identity && employeeRequests.identity === identity && sequence === employeeRequests.balanceSequence) { employeeRequests.balanceLoading = false; erPaint('leave'); } }
}
function erAutoHours(kind, draft) {
    if (kind === 'overtime' && !draft.hoursManual) draft.durationHours = erWallHours(draft.startDate, draft.startTime, draft.endDate, draft.endTime);
    if (kind === 'leave') {
        if (!draft.commonBreakManual) draft.commonBreakMinutes = String(leaveSegmentDefaultBreakMinutes(draft.commonStart, draft.commonEnd));
        if (!draft.commonManual) draft.commonHours = leaveSegmentNetHours(draft.commonStart, draft.commonEnd, draft.commonBreakMinutes);
    }
}
function erUpdateDraftInput(target) {
    const kind = target.dataset.kind;
    if (!Object.hasOwn(erLabels, kind) || state.dashboard?.role !== 'employee' || erIdentity() !== employeeRequests.identity) return;
    const current = erState(kind), draft = current.draft; if (!draft || current.busy) return;
    if (target.dataset.erRowField) {
        const row = draft.rows[Number(target.dataset.row)], key = target.dataset.erRowField; if (!row || !['date', 'startTime', 'endTime', 'breakMinutes', 'hours'].includes(key)) return;
        row[key] = target.value; if (key === 'hours') row.manual = true;
        if (key === 'breakMinutes') { row.breakManual = true; row.manual = false; }
        erAutoLeaveRow(row);
        const hours = target.closest('.er-period')?.querySelector('[data-er-row-field="hours"]'); if (hours && key !== 'hours') hours.value = row.hours;
        const rest = target.closest('.er-period')?.querySelector('[data-er-row-field="breakMinutes"]'); if (rest && key !== 'breakMinutes') rest.value = row.breakMinutes;
    } else {
        const key = target.dataset.erField, allowed = kind === 'leave' ? ['leaveTypeId', 'commonStart', 'commonEnd', 'commonBreakMinutes', 'commonHours', 'reason'] : ['startDate', 'startTime', 'endDate', 'endTime', 'durationHours', 'reason'];
        if (!allowed.includes(key)) return;
        draft[key] = target.value;
        if (key === 'durationHours') draft.hoursManual = true;
        if (key === 'commonHours') draft.commonManual = true;
        if (key === 'commonBreakMinutes') { draft.commonBreakManual = true; draft.commonManual = false; }
        erAutoHours(kind, draft);
        const hourKey = kind === 'leave' ? 'commonHours' : 'durationHours', hours = document.getElementById(`er-${kind}`)?.querySelector(`[data-er-field="${hourKey}"]`);
        if (hours && key !== hourKey) hours.value = draft[hourKey];
        const rest = document.getElementById(`er-${kind}`)?.querySelector('[data-er-field="commonBreakMinutes"]'); if (rest && key !== 'commonBreakMinutes') rest.value = draft.commonBreakMinutes;
    }
    draft.error = ''; draft.confirming = false;
    for (const summary of document.querySelectorAll(`#er-${kind} [data-er-summary]`)) summary.textContent = erDraftSummary(kind, draft);
    for (const message of document.querySelectorAll(`#er-${kind} [data-er-form-error]`)) message.textContent = '';
}
function erOpenDraft(kind, date = '') {
    const current = erState(kind); current.draft ||= erNewDraft(kind); current.mode = 'edit'; current.requestId = ''; current.request = null; current.confirmation = null; current.view = 'calendar'; current.error = ''; current.draft.confirming = false;
    if (date && erDateValid(date)) {
        if (kind === 'leave' && !current.draft.rows.some((row) => row.date === date)) current.draft.rows.push(erNewRow(current.draft, date));
        if (kind === 'overtime') { current.draft.startDate = date; current.draft.endDate = date; erAutoHours(kind, current.draft); }
        current.selecting = false; current.mobileOpen = true;
    } else { current.selecting = true; current.mobileOpen = false; }
    erPaint(kind);
}
function erCloseEditor(kind) {
    const current = erState(kind); if (current.busy) return;
    current.mode = 'browse'; current.selecting = false; current.mobileOpen = false; current.confirmation = null; erPaint(kind, { preserveFocus: false });
    document.getElementById(`er-${kind}`)?.querySelector('[data-action="er-resume"]')?.focus({ preventScroll: true });
    erLoad(kind);
}
async function erSend(kind) {
    const current = erState(kind), draft = current.draft, identity = employeeRequests.identity;
    if (!draft || current.busy || !draft.confirming || !erLive(identity, current, kind)) return;
    let body;
    try { body = erBuildPayload(kind, draft); } catch (error) { draft.error = error.message; draft.confirming = false; erPaint(kind); return; }
    current.busy = true; draft.error = ''; erPaint(kind);
    try {
        const result = await requestJson(`/api/browser/employee/${kind}/request`, { method: 'POST', auth: true, body });
        if (!erLive(identity, current, kind) || current.draft !== draft) return;
        current.draft = null; current.mode = 'browse'; current.selecting = false; current.mobileOpen = false; current.busy = false;
        current.date = body.startDate; current.month = body.startDate.slice(0, 7); current.filters = {}; current.page = 1; current.requestId = ''; current.request = null; current.data = null;
        current.notice = result.message || `${erLabels[kind]}申請已送出。請點紀錄查看整張申請及審核進度。`;
        renderDashboard(result.data.dashboard); setMessage(ui.dashboardMessage, current.notice, 'success');
    } catch (error) { if (erLive(identity, current, kind) && current.draft === draft) draft.error = error.message; }
    finally { if (erLive(identity, current, kind)) { current.busy = false; erPaint(kind); } }
}
async function erWithdraw(kind, id, confirmed = false) {
    const current = erState(kind), row = current.request, identity = employeeRequests.identity;
    if (current.busy || !row?.calendarActions?.withdraw || row.id !== id || !erLive(identity, current, kind)) return;
    if (!confirmed) { current.confirmation = { type: 'withdraw', id }; erPaint(kind, { focus: 'confirm-action' }); return; }
    if (current.confirmation?.type !== 'withdraw' || current.confirmation.id !== id) return;
    current.busy = true; current.error = ''; erPaint(kind);
    try {
        const result = await requestJson(`/api/browser/employee/${kind}/withdraw`, { method: 'POST', auth: true, body: { requestId: id } });
        if (!erLive(identity, current, kind)) return;
        current.busy = false; current.notice = result.message || '整張申請已撤回。'; current.mode = 'browse'; current.requestId = ''; current.request = null; current.data = null; current.confirmation = null;
        renderDashboard(result.data.dashboard); setMessage(ui.dashboardMessage, current.notice, 'success');
    } catch (error) { if (erLive(identity, current, kind)) { current.error = error.message; current.request = null; current.confirmation = null; } }
    finally { if (erLive(identity, current, kind)) { current.busy = false; erPaint(kind); } }
}
async function erHandleAction(button) {
    const kind = button.dataset.kind; if (!Object.hasOwn(erLabels, kind)) return;
    const current = erState(kind); if (!erLive(employeeRequests.identity, current, kind) || button.disabled || current.busy) return;
    const action = button.dataset.action.slice(3), draft = current.draft;
    // Confirmation belongs to the currently displayed action, never to a later editor or record.
    if (['new', 'create-date', 'resume', 'pick-dates', 'stop-picking', 'done-picking', 'date', 'record', 'back-records', 'view', 'month', 'today', 'clear-filters', 'page', 'refresh'].includes(action)) current.confirmation = null;
    if (action === 'new') { erOpenDraft(kind); return; }
    if (action === 'create-date') { erOpenDraft(kind, current.date); return; }
    if (action === 'resume') { if (!draft) return; current.mode = 'edit'; current.selecting = false; current.mobileOpen = true; current.requestId = ''; current.request = null; erPaint(kind); return; }
    if (action === 'close-editor') { erCloseEditor(kind); return; }
    if (action === 'cancel-confirm') { current.confirmation = null; erPaint(kind); return; }
    if (action === 'discard') { current.confirmation = { type: 'discard' }; erPaint(kind, { focus: 'confirm-action' }); return; }
    if (action === 'confirm-discard') { if (current.confirmation?.type !== 'discard') return; current.draft = null; current.confirmation = null; current.mode = 'browse'; current.selecting = false; current.mobileOpen = false; erPaint(kind); return; }
    if (action === 'pick-dates') { current.selecting = true; current.mobileOpen = false; current.view = 'calendar'; erPaint(kind); return; }
    if (action === 'stop-picking') { erCloseEditor(kind); return; }
    if (action === 'done-picking') { current.selecting = false; current.mobileOpen = true; erPaint(kind); return; }
    if (action === 'date' && erDateValid(button.dataset.date)) {
        current.date = button.dataset.date;
        if (current.selecting && draft) {
            if (kind === 'leave') { if (draft.rows.some((row) => row.date === current.date)) draft.rows = draft.rows.filter((row) => row.date !== current.date); else if (draft.rows.length < 740) draft.rows.push(erNewRow(draft, current.date)); else draft.error = '一次最多 740 段請假。'; }
            else { draft.startDate = current.date; draft.endDate = current.date; erAutoHours(kind, draft); }
            draft.confirming = false; erPaint(kind); return;
        }
        current.mode = 'browse'; current.requestId = ''; current.request = null; current.mobileOpen = false; current.page = 1; await erLoad(kind); return;
    }
    if (['add-row', 'remove-row', 'duplicate-row', 'auto-break', 'apply-time', 'confirm-apply-time', 'same-day', 'next-day', 'edit-again'].includes(action) && draft) {
        const index = Number(button.dataset.row);
        if (action === 'add-row' || action === 'duplicate-row') {
            if (draft.rows.length >= 740) { draft.error = '一次最多 740 段請假。'; erPaint(kind); return; }
            if (action === 'add-row') draft.rows.push(erNewRow(draft, current.date));
            else if (draft.rows[index]) { const previous = draft.rows[index]; draft.rows.splice(index + 1, 0, { date: previous.date, startTime: previous.endTime === '00:00' ? '' : previous.endTime, endTime: '', breakMinutes: '0', breakManual: false, hours: '', manual: false }); }
        }
        if (action === 'remove-row') draft.rows.splice(index, 1);
        if (action === 'auto-break' && kind === 'leave') {
            if (button.dataset.row !== undefined) {
                const row = draft.rows[index]; if (!row) return;
                row.breakManual = false; row.manual = false; erAutoLeaveRow(row);
            } else { draft.commonBreakManual = false; draft.commonManual = false; erAutoHours(kind, draft); }
        }
        if (action === 'apply-time') { current.confirmation = { type: 'apply-time' }; erPaint(kind, { focus: 'confirm-action' }); return; }
        if (action === 'confirm-apply-time') { if (current.confirmation?.type !== 'apply-time') return; draft.rows = draft.rows.map((row) => erNewRow(draft, row.date)); current.confirmation = null; }
        if (action === 'same-day' || action === 'next-day') { if (!erDateValid(draft.startDate)) { draft.error = '請先填有效開始日期。'; erPaint(kind); return; } draft.endDate = action === 'same-day' ? draft.startDate : erDateShift(draft.startDate, 1); erAutoHours(kind, draft); }
        draft.confirming = false; draft.error = ''; erPaint(kind); return;
    }
    if (action === 'send') { await erSend(kind); return; }
    if (action === 'withdraw') { await erWithdraw(kind, button.dataset.id); return; }
    if (action === 'confirm-withdraw') { await erWithdraw(kind, button.dataset.id, true); return; }
    if (action === 'record') { current.mode = 'record'; current.requestId = button.dataset.id; current.request = null; current.selecting = false; current.mobileOpen = false; current.confirmation = null; await erLoad(kind); return; }
    if (action === 'back-records') { current.mode = 'browse'; current.requestId = ''; current.request = null; current.confirmation = null; erPaint(kind); return; }
    if (action === 'view') { current.view = button.dataset.view === 'list' ? 'list' : 'calendar'; current.page = 1; }
    if (action === 'month') { const date = new Date(`${current.month}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + Number(button.dataset.offset)); const month = date.toISOString().slice(0, 7); if (month < erMinimum(kind) || month > '2100-12') return; current.month = month; current.date = `${month}-01`; }
    if (action === 'today') { current.month = erToday().slice(0, 7); current.date = erToday(); }
    if (action === 'clear-filters') current.filters = {};
    if (action === 'refresh' && kind === 'leave') { employeeRequests.balances = null; employeeRequests.balanceError = ''; erLoadBalances(); }
    if (['month', 'today', 'clear-filters'].includes(action)) { current.page = 1; current.requestId = ''; current.request = null; if (current.mode === 'record') current.mode = 'browse'; }
    if (action === 'page') current.page = Math.max(1, Number(button.dataset.page) || 1);
    await erLoad(kind);
}
const erPreviousRender = renderDashboard;
renderDashboard = function renderDashboardWithEmployeeRequests(dashboard) {
    const identity = erIdentity(dashboard), snapshot = erFocusSnapshot();
    if (employeeRequests.identity !== identity) erReset(identity);
    else if (employeeRequests.dashboard !== dashboard) {
        for (const kind of ['leave', 'overtime']) { const current = employeeRequests[kind]; if (current) { current.sequence += 1; current.loading = false; current.data = null; current.request = null; current.error = ''; } }
        employeeRequests.balances = null; employeeRequests.balanceError = ''; employeeRequests.balanceLoading = false; employeeRequests.balanceSequence += 1;
    }
    employeeRequests.dashboard = dashboard;
    const result = erPreviousRender(dashboard); if (erIdentity() === identity) erRestoreFocus(snapshot); return result;
};
const erPreviousPostRender = postRenderSetup;
postRenderSetup = function setupEmployeeRequests() {
    erPreviousPostRender(); if (state.dashboard?.role !== 'employee') return;
    erSetupDialogs();
    for (const kind of ['leave', 'overtime']) { const current = employeeRequests[kind]; if (document.getElementById(`er-${kind}`) && current && !current.data && !current.loading && !current.error) erLoad(kind); }
    erLoadBalances();
};
const erPreviousClick = handleDashboardClick;
handleDashboardClick = async function clickEmployeeRequests(event) {
    const button = event.target.closest('[data-action]');
    if (!button?.dataset.action?.startsWith('er-')) return erPreviousClick(event);
    event.preventDefault(); return erHandleAction(button);
};
const erPreviousSubmit = handleDashboardSubmit;
handleDashboardSubmit = async function submitEmployeeRequestDraft(event) {
    const form = event.target.closest?.('[data-er-form]'); if (!form) return erPreviousSubmit(event);
    event.preventDefault(); const kind = form.dataset.erForm, current = erState(kind);
    if (!erLive(employeeRequests.identity, current, kind) || current.busy || current.confirmation || !current.draft) return;
    try { erBuildPayload(kind, current.draft); current.draft.error = ''; current.draft.confirming = true; }
    catch (error) { current.draft.error = error.message; }
    erPaint(kind);
};
const erPreviousLogout = handleLogout;
handleLogout = function logoutEmployeeRequests(...args) { erReset(); return erPreviousLogout(...args); };
document.addEventListener('input', (event) => { if (event.target.matches?.('[data-er-field], [data-er-row-field]')) erUpdateDraftInput(event.target); });
document.addEventListener('change', (event) => {
    const target = event.target;
    if (target.matches?.('[data-er-field], [data-er-row-field]')) { erUpdateDraftInput(target); if (target.dataset.erRowField === 'date') erPaint(target.dataset.kind); return; }
    if (!target.matches?.('[data-er-filter], [data-er-month]')) return;
    const kind = target.dataset.kind, current = erState(kind); if (!erLive(employeeRequests.identity, current, kind) || current.busy) return;
    if (target.hasAttribute('data-er-month')) { if (!/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(target.value) || target.value < erMinimum(kind)) { erPaint(kind); return; } current.month = target.value; current.date = `${target.value}-01`; }
    else current.filters[target.dataset.erFilter] = target.value;
    current.page = 1; current.requestId = ''; current.request = null; current.confirmation = null; if (current.mode === 'record') current.mode = 'browse'; erLoad(kind);
});
document.addEventListener('toggle', (event) => { if (event.target.matches?.('[data-er-balances]')) employeeRequests.balancesOpen = event.target.open; }, true);
document.addEventListener('cancel', (event) => { const kind = event.target.dataset?.erDialog; if (!kind) return; event.preventDefault(); erCloseEditor(kind); }, true);
document.addEventListener('keydown', (event) => {
    const root = event.target.closest?.('[data-er-kind]'); if (!root) return;
    const kind = root.dataset.erKind, current = erState(kind);
    if (event.key === 'Escape' && current.confirmation && !current.busy) { event.preventDefault(); current.confirmation = null; erPaint(kind); return; }
    const day = event.target.closest?.('[data-action="er-date"]');
    if (!day || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const weekday = new Date(`${day.dataset.date}T00:00:00Z`).getUTCDay();
    const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -weekday, End: 6 - weekday }[event.key];
    const date = erDateShift(day.dataset.date, offset), month = date.slice(0, 7);
    if (month < erMinimum(kind) || month > '2100-12') return;
    event.preventDefault();
    const focus = () => [...(document.getElementById(`er-${kind}`)?.querySelectorAll('[data-action="er-date"]') || [])].find((button) => button.dataset.date === date)?.focus({ preventScroll: true });
    if (month !== current.month) { current.month = month; current.date = date; current.page = 1; current.requestId = ''; current.request = null; current.confirmation = null; if (current.mode === 'record') current.mode = 'browse'; const identity = employeeRequests.identity; erLoad(kind).then(() => { if (erLive(identity, current, kind) && current.month === month) focus(); }); }
    else focus();
});
window.addEventListener('beforeunload', (event) => { if (!employeeRequests.leave?.draft && !employeeRequests.overtime?.draft) return; event.preventDefault(); event.returnValue = ''; });
window.matchMedia?.('(max-width: 720px)').addEventListener?.('change', () => { for (const kind of ['leave', 'overtime']) { const current = employeeRequests[kind]; if (current?.mode === 'edit' && !current.selecting) current.mobileOpen = true; erPaint(kind); } });
