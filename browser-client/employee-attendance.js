/* Daily attendance is computed by the server from the signed-in employee's evidence. */
const employeeAttendanceUi = { identity: '', month: '', view: 'daily', data: null, loading: false, error: '', sequence: 0 };
const attendanceCalendarUi = { identity: '', data: null, draft: null, loading: false, busy: false, dirty: false, remoteChanged: false, error: '', sequence: 0 };
const eaEscape = value => escapeHtml(String(value ?? ''));
const eaIdentity = () => `${state.token || ''}/${state.dashboard?.role || ''}/${state.dashboard?.user?.id || ''}/${Boolean(state.dashboard?.impersonation?.active)}`;
const eaToday = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const eaDate = value => Number.isFinite(Number(value)) && value != null ? new Date(Number(value) + 8 * 3600000).toISOString().slice(0, 10) : '';
const eaTime = value => Number.isFinite(Number(value)) && value != null ? new Date(Number(value) + 8 * 3600000).toISOString().slice(11, 19) : '—';
const eaStamp = value => value == null ? '—' : `${eaDate(value)} ${eaTime(value)}`;
const eaStatusLabels = { completed: '已核對', in_progress: '進行中', unknown: '待確認', offday: '無排定時段', excused: '已請假', none: '無加班', pending: '待確認', not_started: '尚未開始', normal_overlap: '已由日班核對' };
const eaIssueLabels = { missing_in: '缺少可配對的上班卡。', missing_out: '缺少可配對的下班卡。', ambiguous_punches: '連續同類打卡或配對不明，請核對原始紀錄。', open_punch: '已打上班卡，等待下班紀錄。', uncertain_leave: '舊請假單未提供明確時段，暫無法判定需出勤的邊界。', missing_punches: '沒有足夠的打卡紀錄可判定。', uncertain_break: '休息時段未記錄，無法確認應從遲到或早退中排除的休息分鐘。', abnormal_punch: '有異常打卡紀錄，請先核對。', unlocated_overtime_rest: '這筆加班只記錄休息分鐘，沒有明確休息時段；受影響的分鐘暫列待確認。' };
function eaStatus(status) { return eaStatusLabels[status] || status || '待確認'; }
function eaMinute(value, status) {
    if (value == null || !Number.isFinite(Number(value))) return `<span class="ea-unresolved">${status === 'in_progress' || status === 'not_started' ? '未結束' : ['offday','none','excused','normal_overlap'].includes(status) ? '—' : '待確認'}</span>`;
    return `<span class="${Number(value) > 0 ? 'ea-minutes-alert' : 'ea-minutes-zero'}">${eaEscape(value)}<small> 分</small></span>`;
}
function eaMonths(window = state.dashboard?.punchHistoryWindow) {
    const current = window?.endAt != null ? eaDate(window.endAt).slice(0, 7) : eaToday().slice(0, 7), earliest = window?.startAt != null ? eaDate(window.startAt).slice(0, 7) : current;
    const [year, month] = current.split('-').map(Number), previous = new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
    return [current, previous].filter(value => value >= earliest);
}
function eaPrepare(dashboard) {
    const identity = eaIdentity();
    if (employeeAttendanceUi.identity !== identity) Object.assign(employeeAttendanceUi, { identity, month: eaMonths(dashboard?.punchHistoryWindow)[0], view: 'daily', data: null, loading: false, error: '', sequence: employeeAttendanceUi.sequence + 1 });
    if (!eaMonths(dashboard?.punchHistoryWindow).includes(employeeAttendanceUi.month)) Object.assign(employeeAttendanceUi, { month: eaMonths(dashboard?.punchHistoryWindow)[0], data: null, loading: false, error: '', sequence: employeeAttendanceUi.sequence + 1 });
}
function eaTotals(days) {
    const sum = getter => days.reduce((total, day) => { const value = getter(day); return total + (Number.isFinite(value) ? value : 0); }, 0);
    return { late: sum(day => day.lateMinutes), early: sum(day => day.earlyMinutes), otLate: sum(day => day.overtime?.lateMinutes), otEarly: sum(day => day.overtime?.earlyMinutes),
        unknown: days.filter(day => day.status === 'unknown' || day.overtime?.status === 'unknown' || day.leave?.pendingCount || day.overtime?.pendingCount).length };
}
function eaDayDetails(day) {
    const punches = day.punches || [], leave = day.leave?.requests || [], overtime = day.overtime?.requests || [];
    const issues = [...new Set([...(day.issues || []), ...(day.overtime?.issues || [])])];
    return `<div class="ea-day-evidence"><section><h4>判定依據</h4><p>${eaEscape(day.calendarNote || (day.isWorkday ? '工作日' : '非工作日'))}</p>
        <p>日班需出勤：${day.requiredSegments?.length ? day.requiredSegments.map(segment => `${eaTime(segment.startAt)}–${eaTime(segment.endAt)}`).join('、') : '—'}</p>
        ${issues.length ? `<ul class="ea-issues">${issues.map(issue => { const text = typeof issue === 'string' ? issue : issue.message || issue.code; return `<li>${eaEscape(eaIssueLabels[text] || text)}</li>`; }).join('')}</ul>` : ''}
        ${day.leave?.pendingCount || day.overtime?.pendingCount ? '<p class="ea-unresolved">有待審申請，核准後會重新核對；目前未列為已核准時段。</p>' : ''}
        </section><section><h4>當日原始打卡</h4>${punches.length ? `<ul>${punches.map(punch => `<li>${eaEscape(eaTime(punch.timestamp))} · ${punch.type === 'in' ? '上班' : punch.type === 'out' ? '下班' : '未辨識'} · ${eaEscape(punch.source || '卡號')}${punch.excluded ? ' · 不列入判定' : ''}${punch.status ? ` · ${eaEscape(punch.status)}` : ''}</li>`).join('')}</ul>` : '<p>沒有打卡紀錄；不推定為零分鐘或未出勤。</p>'}</section>
        ${leave.length ? `<section><h4>請假依據</h4><ul>${leave.map(row => `<li>${eaEscape(row.leaveTypeName || '請假')} · ${eaEscape(eaStamp(row.startAt))} 至 ${eaEscape(eaStamp(row.endAt))} · ${eaEscape(row.status === 'approved' ? '已核准' : '待審')}<small>單號 ${eaEscape(row.id)}</small>${row.segments?.length ? `<small>實際時段：${row.segments.map(segment => `${eaEscape(eaStamp(segment.startAt))}–${eaEscape(eaStamp(segment.endAt))}`).join("；")}</small>` : ""}</li>`).join('')}</ul></section>` : ''}
        ${overtime.length ? `<section><h4>加班依據</h4><ul>${overtime.map(row => `<li>${eaEscape(eaStamp(row.startAt))} 至 ${eaEscape(eaStamp(row.endAt))} · ${eaEscape(row.status === 'approved' ? '已核准' : '待審')}<small>${row.breakSource === "automatic_lunch" ? "午休 12:20–13:00 · " : ""}休息 ${row.breakMinutes == null ? '未記錄' : `${eaEscape(row.breakMinutes)} 分鐘`} · 單號 ${eaEscape(row.id)}</small>${row.status === 'approved' ? `<span>遲到 ${eaMinute(row.lateMinutes, row.assessmentStatus || day.overtime.status)} ／ 早退 ${eaMinute(row.earlyMinutes, row.assessmentStatus || day.overtime.status)}</span>` : ''}</li>`).join('')}</ul></section>` : ''}</div>`;
}
function eaDaily(days) {
    if (!days.length) return '<p class="ea-empty">此月份沒有可查閱的日期。</p>';
    return `<div class="ea-day-list"><div class="ea-table-heading" aria-hidden="true"><span>日期／打卡</span><span>日班 遲到／早退</span><span>加班 遲到／早退</span><span>狀態</span></div>${days.slice().reverse().map(day => `<details class="ea-day" data-ea-date="${eaEscape(day.date)}"><summary>
        <span class="ea-date"><strong>${eaEscape(day.date.slice(5))} <small>${'日一二三四五六'[new Date(`${day.date}T00:00:00Z`).getUTCDay()]}</small></strong><small>${eaEscape(eaTime(day.firstInAt).slice(0, 5))} → ${eaEscape(eaTime(day.lastOutAt).slice(0, 5))}</small></span>
        <span class="ea-metric"><small class="ea-mobile-label">日班 遲到／早退</small><span>${eaMinute(day.lateMinutes, day.status)} <span class="ea-divider">／</span> ${eaMinute(day.earlyMinutes, day.status)}</span></span>
        <span class="ea-metric"><small class="ea-mobile-label">加班 遲到／早退</small><span>${eaMinute(day.overtime?.lateMinutes, day.overtime?.status || 'none')} <span class="ea-divider">／</span> ${eaMinute(day.overtime?.earlyMinutes, day.overtime?.status || 'none')}</span></span>
        <span class="ea-day-status">${eaEscape(eaStatus(day.status))}${day.overtime?.approvedCount ? `<small>加班 ${eaEscape(eaStatus(day.overtime.status))}</small>` : ''}${day.leave?.pendingCount || day.overtime?.pendingCount ? '<small>有待審申請</small>' : ''}<small class="ea-expand">展開依據 ⌄</small></span>
        </summary>${eaDayDetails(day)}</details>`).join('')}</div>`;
}
function eaRaw(days) {
    const records = days.flatMap(day => (day.punches || []).map(punch => ({ ...punch, date: day.date }))).sort((a, b) => b.timestamp - a.timestamp);
    return records.length ? `<div class="ea-raw-scroll"><table class="ea-raw"><thead><tr><th>日期</th><th>時間</th><th>動作</th><th>來源</th><th>紀錄狀態</th></tr></thead><tbody>${records.map(row => `<tr><td>${eaEscape(row.date)}</td><td>${eaEscape(eaTime(row.timestamp))}</td><td>${row.type === 'in' ? '上班' : row.type === 'out' ? '下班' : '未辨識'}</td><td>${eaEscape(row.source || '卡號')}</td><td>${eaEscape(row.status || '正常')}${row.excluded ? '（未列入判定）' : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="ea-empty">此範圍沒有打卡紀錄。</p>';
}
function renderEmployeeAttendanceWorkspace(dashboard = state.dashboard) {
    eaPrepare(dashboard);
    const current = employeeAttendanceUi, data = current.data, days = data?.days || [], totals = eaTotals(days), months = eaMonths(dashboard?.punchHistoryWindow);
    if (!data && !current.loading && !current.error) queueMicrotask(() => { if (document.getElementById('employee-attendance-workspace')) eaLoad(); });
    return `<article id="employee-attendance-workspace" class="employee-workbench-panel ea-workspace" data-no-collapsible="true" aria-busy="${current.loading}">
        <div class="ea-heading"><div><h3>我的出勤</h3><p>每天看懂日班與加班的到、離班情形。</p></div><button type="button" class="outline-btn" data-ea-action="refresh" ${current.loading ? 'disabled' : ''}>重新整理</button></div>
        <div class="ea-toolbar"><div class="ea-months" role="group" aria-label="出勤月份">${months.map((month, index) => `<button type="button" data-ea-action="month" data-month="${month}" aria-pressed="${current.month === month}" ${current.loading ? 'disabled' : ''}>${index === 0 ? '本月' : '上月'} <small>${month}</small></button>`).join('')}</div><div class="ea-views" role="group" aria-label="出勤檢視"><button type="button" data-ea-action="daily" aria-pressed="${current.view === 'daily'}">每日出勤</button><button type="button" data-ea-action="raw" aria-pressed="${current.view === 'raw'}">原始打卡</button></div></div>
        <p class="ea-scope">可見範圍：${eaEscape(dashboard?.punchHistoryWindow?.label || '最近 7 日')} · 台北時間${data?.historyWindow?.startAt != null ? ` · ${eaEscape(eaDate(data.historyWindow.startAt))} 起` : ''}。日班 08:20–17:00，午休 12:20–13:00；加班依核准時段。</p>
        ${current.error ? `<p class="ea-error" role="alert">${eaEscape(current.error)}，可按重新整理重試。</p>` : ''}
        ${current.loading && !data ? '<p class="ea-empty" role="status">正在核對出勤紀錄…</p>' : ''}
        ${data ? `<div class="ea-stats" aria-label="查閱範圍摘要"><div><small>日班遲到／早退</small><strong>${totals.late} <span>／</span> ${totals.early}<small> 分</small></strong></div><div><small>加班遲到／早退</small><strong>${totals.otLate} <span>／</span> ${totals.otEarly}<small> 分</small></strong></div><div><small>待確認</small><strong>${totals.unknown}<small> 天</small></strong></div></div><p class="ea-summary-note">合計僅包含可判定的分鐘，缺卡不以 0 代替；點選日期查看依據。早到、晚退不列入，也不抵銷遲到或早退。</p>${data.schedule?.configured ? '' : '<p class="ea-unresolved">目前按週一至五日班預設核對；國定假日與補班日由管理者在「出勤工作日」設定。</p>'}${current.view === 'daily' ? eaDaily(days) : eaRaw(days)}` : ''}
    </article>`;
}
function eaPaint() { const host = document.getElementById('employee-attendance-workspace'); if (host && state.dashboard?.role === 'employee') host.outerHTML = renderEmployeeAttendanceWorkspace(); }
async function eaLoad() {
    const current = employeeAttendanceUi;
    if (current.loading || state.dashboard?.role !== 'employee' || !eaMonths().includes(current.month)) return;
    const identity = eaIdentity(), month = current.month, sequence = ++current.sequence;
    current.loading = true; current.error = ''; eaPaint();
    try {
        const result = await requestJson(`/api/browser/employee/attendance?month=${encodeURIComponent(month)}`, { auth: true });
        if (identity !== eaIdentity() || sequence !== current.sequence || month !== current.month) return;
        current.data = result.attendance;
    } catch (error) { if (identity === eaIdentity() && sequence === current.sequence) { current.data = null; current.error = error.message; } }
    finally { if (identity === eaIdentity() && sequence === current.sequence) { current.loading = false; eaPaint(); } }
}
document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-ea-action]'); if (!button || state.dashboard?.role !== 'employee') return;
    const action = button.dataset.eaAction, current = employeeAttendanceUi;
    if (['raw','daily'].includes(action)) { current.view = action; eaPaint(); return; }
    if (current.loading) return;
    if (action === 'month') { if (!eaMonths().includes(button.dataset.month)) return; current.month = button.dataset.month; current.data = null; }
    eaLoad();
});

function acalPrepare() {
    const identity = eaIdentity();
    if (attendanceCalendarUi.identity !== identity) Object.assign(attendanceCalendarUi, { identity, data: null, draft: null, loading: false, busy: false, dirty: false, remoteChanged: false, error: '', sequence: attendanceCalendarUi.sequence + 1 });
}
function acalCanEdit() { return Boolean(attendanceCalendarUi.data?.canEdit && !state.dashboard?.impersonation?.active && hasCurrentAdminPermission('admin.shifts.manage')); }
function acalNewDraft(data) { return { workdays: [...data.workdays], exceptions: data.exceptions.map(row => ({ ...row })), reason: '', confirm: false }; }
const acalSyncNotice = '工作日設定已有更新。若有未儲存的修改，會保留到你確認重新載入。';
function renderAttendanceCalendarSettings() {
    acalPrepare();
    const current = attendanceCalendarUi, draft = current.draft, editable = acalCanEdit() && !current.busy && !current.loading;
    if (!current.data && !current.loading && !current.error) queueMicrotask(() => { if (document.getElementById('attendance-calendar-workspace')) acalLoad(); });
    return `<article id="attendance-calendar-workspace" class="workspace-card acal-workspace" data-no-collapsible="true"><h3>出勤工作日</h3><p class="helper-text">「我的出勤」以日班 08:20–17:00、午休 12:20–13:00 核對。設定每週工作日，再加入國定假日、休息日及補班日；例外日期優先。適用全公司。</p>
        <p class="helper-text">設定及申請更正後會重新核對查閱範圍內的紀錄；這裡不變更打卡，也不計算薪資。</p>
        ${current.error ? `<p class="ea-error" role="alert">${eaEscape(current.error)}</p>` : ''}
        <p id="attendance-calendar-sync-notice" role="status">${current.remoteChanged ? acalSyncNotice : ''}</p>
        ${draft ? `<form data-acal-form><fieldset ${editable ? '' : 'disabled'}><legend>每週工作日</legend><div class="acal-weekdays">${[1,2,3,4,5,6,0].map(day => `<label><input name="workdays" type="checkbox" value="${day}" ${draft.workdays.includes(day) ? 'checked' : ''}>星期${'日一二三四五六'[day]}</label>`).join('')}</div><h4>例外日期</h4><p class="helper-text">例如國定假日設為休息日；週六補班設為工作日。例外日期不會取消已核准加班。</p>
        <div class="acal-exceptions">${draft.exceptions.map((row, index) => `<div class="acal-exception" data-acal-index="${index}"><label class="field"><span>日期</span><input type="date" data-acal-field="date" value="${eaEscape(row.date)}" required></label><label class="field"><span>當日類型</span><select data-acal-field="kind"><option value="offday" ${row.kind === 'offday' ? 'selected' : ''}>休息日</option><option value="workday" ${row.kind === 'workday' ? 'selected' : ''}>工作日</option></select></label><label class="field"><span>說明</span><input data-acal-field="note" maxlength="200" value="${eaEscape(row.note)}" placeholder="例如國定假日／補班"></label><button type="button" class="outline-btn" data-acal-action="remove" data-index="${index}">移除</button></div>`).join('') || '<p>尚未設定例外日期。</p>'}</div><button type="button" class="outline-btn" data-acal-action="add">新增例外日期</button>
        <label class="field"><span>本次設定原因（必填）</span><input name="reason" value="${eaEscape(draft.reason)}" maxlength="500" required></label><label class="acal-confirm"><input name="confirm" type="checkbox" ${draft.confirm ? 'checked' : ''} required>確認將此工作日設定套用至出勤判定</label><button type="submit" class="primary-btn">${current.busy ? '儲存中…' : '儲存出勤工作日'}</button></fieldset></form>${!current.data.canEdit ? '<p class="helper-text">目前為唯讀，身份模擬不能儲存設定。</p>' : ''}` : '<p role="status">讀取工作日設定中…</p>'}
        <button type="button" class="outline-btn" data-acal-action="refresh" ${current.loading || current.busy ? 'disabled' : ''}>重新載入設定</button><p class="helper-text">儲存會留下操作者、時間、原因與前後設定。</p></article>`;
}
function acalPaint() { const host = document.getElementById('attendance-calendar-workspace'); if (host && state.dashboard?.role === 'admin') host.outerHTML = renderAttendanceCalendarSettings(); }
async function acalLoad({ discardDraft = false } = {}) {
    const current = attendanceCalendarUi;
    if (current.loading || current.busy || state.dashboard?.role !== 'admin') return;
    if (current.dirty && (!discardDraft || !window.confirm('捨棄尚未儲存的工作日設定並重新載入？'))) return;
    const identity = eaIdentity(), sequence = ++current.sequence;
    const hadRemoteChange = current.remoteChanged;
    current.loading = true; current.error = ''; current.remoteChanged = false;
    acalPaint();
    try {
        const result = await requestJson('/api/browser/admin/attendance-calendar', { auth: true });
        if (identity !== eaIdentity() || sequence !== current.sequence) return;
        current.data = result.calendar; current.draft = acalNewDraft(result.calendar); current.dirty = false;
    } catch (error) {
        if (identity === eaIdentity() && sequence === current.sequence) { current.error = error.message; current.remoteChanged ||= hadRemoteChange; }
    } finally {
        if (identity === eaIdentity() && sequence === current.sequence) {
            current.loading = false; acalPaint();
            if (current.remoteChanged && !current.dirty && !current.error) await acalLoad();
        }
    }
}
function acalInput(event) {
    const form = event.target.closest?.('[data-acal-form]'), current = attendanceCalendarUi;
    if (!form || !acalCanEdit() || current.busy || current.loading) return;
    const field = event.target, row = field.closest('[data-acal-index]'); current.dirty = true;
    if (row) current.draft.exceptions[Number(row.dataset.acalIndex)][field.dataset.acalField] = field.value;
    else if (field.name === 'workdays') current.draft.workdays = [...form.querySelectorAll('[name="workdays"]:checked')].map(item => Number(item.value));
    else if (field.name === 'reason') current.draft.reason = field.value;
    else if (field.name === 'confirm') current.draft.confirm = field.checked;
}
document.addEventListener('input', acalInput); document.addEventListener('change', acalInput);
document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-acal-action]'), current = attendanceCalendarUi; if (!button || current.busy || current.loading) return;
    if (button.dataset.acalAction === 'refresh') { acalLoad({ discardDraft: true }); return; }
    if (!acalCanEdit()) return;
    if (button.dataset.acalAction === 'add') current.draft.exceptions.push({ date: '', kind: 'offday', note: '' });
    if (button.dataset.acalAction === 'remove') current.draft.exceptions.splice(Number(button.dataset.index), 1);
    current.dirty = true; acalPaint();
});
document.addEventListener('submit', async event => {
    const form = event.target.closest?.('[data-acal-form]'), current = attendanceCalendarUi; if (!form) return;
    event.preventDefault(); if (current.busy || current.loading || !acalCanEdit() || !form.reportValidity()) return;
    const identity = eaIdentity(), sequence = ++current.sequence, body = { ...current.draft, revision: current.data.revision };
    current.busy = true; current.error = ''; acalPaint();
    try {
        const result = await requestJson('/api/browser/admin/attendance-calendar', { auth: true, method: 'POST', body });
        if (identity !== eaIdentity() || sequence !== current.sequence) return;
        current.data = result.calendar; current.draft = acalNewDraft(result.calendar); current.dirty = false;
        current.error = ''; setMessage(ui.dashboardMessage, '出勤工作日已儲存。', 'success');
    } catch (error) { if (identity === eaIdentity() && sequence === current.sequence) current.error = error.message; }
    finally {
        if (identity === eaIdentity() && sequence === current.sequence) {
            current.busy = false; acalPaint();
            if (current.remoteChanged && !current.dirty && !current.error) await acalLoad();
        }
    }
});
const eaPreviousSync = handleRealtimeSyncMessage;
handleRealtimeSyncMessage = async function syncAttendanceCalendar(payload) {
    if (payload?.type !== 'attendanceCalendar') return eaPreviousSync(payload);
    if (payload.origin === 'browser' && payload.sessionToken && payload.sessionToken === state.token) return;
    if (state.dashboard?.role === 'employee') {
        const current = employeeAttendanceUi;
        current.sequence++; current.data = null; current.loading = false; current.error = '';
        if (document.getElementById('employee-attendance-workspace')) {
            eaPrepare(state.dashboard);
            await eaLoad();
        }
    } else if (state.dashboard?.role === 'admin') {
        const current = attendanceCalendarUi;
        if (current.identity !== eaIdentity()) return;
        if (current.dirty || current.busy || current.loading) {
            current.remoteChanged = true;
            const notice = document.getElementById('attendance-calendar-sync-notice');
            if (notice) notice.textContent = acalSyncNotice;
        } else if (document.getElementById('attendance-calendar-workspace')) {
            await acalLoad();
        } else {
            current.data = null; current.draft = null; current.error = '';
        }
    }
};
const eaPreviousRender = renderDashboard;
renderDashboard = function renderAttendanceDashboard(dashboard) {
    employeeAttendanceUi.sequence++; employeeAttendanceUi.loading = false; employeeAttendanceUi.data = null; employeeAttendanceUi.error = '';
    return eaPreviousRender(dashboard);
};
const eaPreviousLogout = handleLogout;
handleLogout = function logoutAttendance(...args) {
    employeeAttendanceUi.identity = ''; employeeAttendanceUi.sequence++; employeeAttendanceUi.data = null;
    attendanceCalendarUi.identity = ''; attendanceCalendarUi.sequence++; attendanceCalendarUi.data = null; attendanceCalendarUi.draft = null;
    return eaPreviousLogout(...args);
};
