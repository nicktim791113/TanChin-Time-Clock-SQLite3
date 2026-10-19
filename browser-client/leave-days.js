// One editor for personal leave, paper corrections and supervisor proxy requests.
const leaveDayEditors = new WeakMap();
const ldEscape = (value) => escapeHtml(String(value ?? ''));
function leaveDayInitiallySelected(date, multiple) {
    return !multiple || ![0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay());
}
function leaveDayRange(startDate, startTime, endDate, endTime) {
    const validDate = (date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
    if (!validDate(startDate) || !validDate(endDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)) throw new Error('請先填寫完整、有效的開始與結束日期時間。');
    const start = Date.parse(`${startDate}T${startTime}:00+08:00`), end = Date.parse(`${endDate}T${endTime}:00+08:00`);
    if (end <= start) throw new Error('結束時間必須晚於開始時間。');
    const rows = [];
    for (let day = Date.parse(`${startDate}T00:00:00+08:00`); day < end; day += 86400000) {
        if (rows.length >= 370) throw new Error('一次請假最多可涵蓋 370 個日期，請分次申請。');
        const date = new Date(day + 8 * 3600000).toISOString().slice(0, 10), weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
        const from = Math.max(start, day), to = Math.min(end, day + 86400000);
        rows.push({ date, weekday, maxHours: (to - from) / 3600000, window: `${from === day ? '00:00' : startTime}–${to === day + 86400000 ? '24:00' : endTime}` });
    }
    return rows;
}
function renderLeaveDaysEditor({ batch = false } = {}) {
    return `<section class="ld-editor" data-leave-days aria-label="逐日選擇請假日期">
        <input type="hidden" name="dateSelectionMode" value="explicit_dates"><input type="hidden" name="dailyHours" value="">
        <div class="ld-heading"><div><h4>實際請假日期</h4><p>只計入勾選日期；取消勾選的日期不算請假。</p></div><strong data-ld-summary aria-live="polite"></strong></div>
        <p class="ld-note">跨日先選週一至五，請依實際出勤核對。國定假日請取消勾選；週末輪班或補班可自行勾選。系統尚未套用公司工作日曆。</p>
        ${batch ? '<p class="ld-note">所選員工共用以下日期與時數；若班表不同，請分開送出。</p>' : ''}
        <div class="ld-tools"><div class="ld-selection-actions" role="group" aria-label="快速選擇日期"><button type="button" class="outline-btn" data-ld-action="weekdays">選週一至五</button><button type="button" class="outline-btn" data-ld-action="all">全部日期</button><button type="button" class="outline-btn" data-ld-action="none">全部取消</button></div>
            <div class="ld-apply"><label class="field"><span>${batch ? '每人' : ''}每日實際時數</span><input type="number" min="0.01" max="24" step="0.01" data-ld-apply-hours placeholder="例如 8" aria-label="套用的每日實際時數"></label><button type="button" class="outline-btn" data-ld-action="apply">套用至勾選日</button></div></div>
        <p class="ld-note">請填扣除午休、休息等非工作時間後的實際時數；各日可分別調整。起訖時間僅限制可填範圍，不會直接換算成請假時數。同日有不同時段或假別時，請依實際起訖分開申請單日假。</p>
        <p class="ld-message" data-ld-message role="status"></p><div class="ld-days" data-ld-rows></div>
    </section>`;
}
function ldFields(form) {
    return ['startDate', 'startTime', 'endDate', 'endTime'].map((name) => form.elements.namedItem(name)?.value || '');
}
function ldReadRows(form) {
    return [...form.querySelectorAll('[data-ld-date]')].map((row) => ({ date: row.dataset.ldDate, selected: row.querySelector('[data-ld-selected]').checked, hours: row.querySelector('[data-ld-hours]').value }));
}
function ldWriteTotals(form) {
    const editor = form.querySelector('[data-leave-days]'); if (!editor) return;
    const rows = ldReadRows(form), selected = rows.filter((row) => row.selected);
    const saved = leaveDayEditors.get(form);
    if (saved && rows.length) saved.cachedRows = new Map([...(saved.cachedRows || []), ...rows.map((row) => [row.date, row])]);
    const total = Math.round(selected.reduce((sum, row) => sum + (Number.isFinite(Number(row.hours)) ? Number(row.hours) : 0), 0) * 100) / 100;
    const invalid = selected.filter((row) => !row.hours || Number(row.hours) <= 0).length;
    form.elements.namedItem('dailyHours').value = selected.map((row) => `${row.date}=${row.hours}`).join('\n');
    form.elements.namedItem('durationHours').value = total || '';
    editor.querySelector('[data-ld-summary]').textContent = `已選 ${selected.length} 日 · 排除 ${rows.length - selected.length} 日 · ${total} 小時${invalid ? `（${invalid} 日待填）` : ''}`;
    for (const row of form.querySelectorAll('[data-ld-date]')) {
        const checked = row.querySelector('[data-ld-selected]').checked, input = row.querySelector('[data-ld-hours]');
        row.classList.toggle('is-excluded', !checked); input.disabled = !checked; input.required = checked;
        row.querySelector('[data-ld-status]').textContent = checked ? '計入請假' : '不請假';
    }
}
function syncLeaveDaysEditor(form, { reset = false, request = null } = {}) {
    const editor = form?.querySelector('[data-leave-days]'); if (!editor) return;
    const fields = ldFields(form), signature = fields.join('|'), previous = leaveDayEditors.get(form);
    if (!reset && !request && previous?.signature === signature) { ldWriteTotals(form); return; }
    const oldRows = reset || request ? [] : ldReadRows(form), oldMap = new Map([...(reset || request ? [] : previous?.cachedRows || []), ...oldRows.map((row) => [row.date, row])]);
    const explicit = request?.dateSelectionMode === 'explicit_dates' || request?.date_selection_mode === 'explicit_dates';
    const requestRows = new Map((explicit ? request.dailyHours || [] : []).map((row) => [row.date, row]));
    let rows;
    try { rows = leaveDayRange(...fields); }
    catch (error) {
        editor.querySelector('[data-ld-rows]').innerHTML = '';
        editor.querySelector('[data-ld-message]').textContent = error.message;
        leaveDayEditors.set(form, { signature, error: error.message, cachedRows: oldMap, multiple: previous?.multiple }); ldWriteTotals(form); return;
    }
    editor.querySelector('[data-ld-message]').textContent = request && !explicit ? '這是尚未確認實際日期的舊紀錄。請重新勾選請假日並填時數，儲存後才會改為逐日計算。' : '';
    editor.querySelector('[data-ld-rows]').innerHTML = rows.map((row) => {
        const prior = oldMap.get(row.date), saved = requestRows.get(row.date);
        const selected = request ? Boolean(saved) : prior && previous?.multiple === (rows.length > 1) ? prior.selected : leaveDayInitiallySelected(row.date, rows.length > 1);
        const hours = request ? saved?.hours ?? '' : prior?.hours ?? '';
        return `<div class="ld-day ${selected ? '' : 'is-excluded'}" data-ld-date="${row.date}"><label class="ld-select"><input type="checkbox" data-ld-selected ${selected ? 'checked' : ''} aria-label="${row.date} 是否請假"><span><strong>${row.date}</strong><small>星期${'日一二三四五六'[row.weekday]}${[0, 6].includes(row.weekday) ? ' · 週末' : ''}</small></span></label><span class="ld-window">範圍 ${row.window}<small data-ld-status>${selected ? '計入請假' : '不請假'}</small></span><label class="ld-hours"><span>實際時數</span><input type="number" data-ld-hours min="0.01" max="${row.maxHours}" step="0.01" value="${ldEscape(hours)}" placeholder="請填寫" aria-label="${row.date} 實際請假時數" ${selected ? 'required' : 'disabled'}><span>小時</span></label></div>`;
    }).join('');
    leaveDayEditors.set(form, { signature, multiple: rows.length > 1, error: '', rows, cachedRows: oldMap });
    ldWriteTotals(form);
}
function setupLeaveDaysEditors(root = document) {
    root.querySelectorAll('form').forEach((form) => { if (form.querySelector('[data-leave-days]')) syncLeaveDaysEditor(form); });
}
function collectLeaveDays(form) {
    syncLeaveDaysEditor(form);
    const saved = leaveDayEditors.get(form);
    if (saved?.error) throw new Error(saved.error);
    const rows = ldReadRows(form).filter((row) => row.selected);
    if (!rows.length) throw new Error('請至少勾選一個實際需要請假的日期。');
    for (const row of rows) {
        const maximum = saved.rows.find((day) => day.date === row.date).maxHours, hours = Number(row.hours);
        if (!row.hours || !Number.isFinite(hours) || hours <= 0 || hours > maximum || Math.abs(hours * 100 - Math.round(hours * 100)) > 0.000001) throw new Error(`${row.date} 請填大於 0、最多 ${maximum} 小時的實際時數（小數最多兩位）。`);
    }
    return { dateSelectionMode: 'explicit_dates', dailyHours: rows.map((row) => ({ date: row.date, hours: Number(row.hours) })), durationHours: Math.round(rows.reduce((sum, row) => sum + Number(row.hours), 0) * 100) / 100 };
}
function renderLeaveDaysSummary(request) {
    if (request?.dateSelectionMode !== 'explicit_dates' && request?.date_selection_mode !== 'explicit_dates') return '<small class="ld-legacy-note">舊單沿用原起訖範圍；尚未確認逐日請假日期。</small>';
    const selected = request.dailyHours || [], selectedSet = new Set(selected.map((row) => row.date));
    const format = (value) => new Date(Number(value) + 8 * 3600000).toISOString();
    let excluded = [];
    try { const start = format(request.start_at), end = format(request.end_at); excluded = leaveDayRange(start.slice(0, 10), start.slice(11, 16), end.slice(0, 10), end.slice(11, 16)).filter((row) => !selectedSet.has(row.date)); } catch (_) { /* Invalid historical period is not inferred. */ }
    return `<details class="ld-request-summary"><summary>實際請假 ${selected.length} 日${excluded.length ? ` · 排除 ${excluded.length} 日` : ''}</summary><ul>${selected.map((row) => `<li><span>${ldEscape(row.date)}</span><strong>${ldEscape(row.hours)} 小時</strong></li>`).join('')}</ul>${excluded.length ? `<p>不請假：${excluded.map((row) => ldEscape(row.date)).join('、')}</p>` : ''}</details>`;
}
const ldPreviousPostRender = postRenderSetup;
postRenderSetup = function postRenderWithLeaveDays() { ldPreviousPostRender(); setupLeaveDaysEditors(); };
document.addEventListener('input', (event) => {
    const form = event.target.closest('form'); if (!form?.querySelector('[data-leave-days]')) return;
    if (['startDate', 'startTime', 'endDate', 'endTime'].includes(event.target.name)) syncLeaveDaysEditor(form);
    else if (event.target.matches('[data-ld-hours]')) ldWriteTotals(form);
});
document.addEventListener('change', (event) => {
    const form = event.target.closest('form'); if (!form?.querySelector('[data-leave-days]')) return;
    if (event.target.matches('[data-ld-selected], [data-ld-hours]')) ldWriteTotals(form);
    else if (['startDate', 'startTime', 'endDate', 'endTime'].includes(event.target.name)) syncLeaveDaysEditor(form);
});
document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-ld-action]'); if (!button || button.disabled) return;
    const form = button.closest('form'), action = button.dataset.ldAction, editor = button.closest('[data-leave-days]');
    event.preventDefault();
    if (action === 'apply') {
        const control = editor.querySelector('[data-ld-apply-hours]'), hours = Number(control.value);
        if (!control.value || !control.checkValidity() || hours <= 0) { editor.querySelector('[data-ld-message]').textContent = '請先填入大於 0、最多 24 小時的每日實際時數。'; control.focus(); return; }
        const selected = [...editor.querySelectorAll('[data-ld-date]')].filter((row) => row.querySelector('[data-ld-selected]').checked);
        if (!selected.length) { editor.querySelector('[data-ld-message]').textContent = '請先勾選要套用時數的日期。'; return; }
        selected.forEach((row) => { row.querySelector('[data-ld-hours]').value = control.value; });
        editor.querySelector('[data-ld-message]').textContent = '已套用時數，請核對首末日是否只有部分時間；超過當日範圍的時數須再調整。';
    } else {
        editor.querySelectorAll('[data-ld-date]').forEach((row) => { row.querySelector('[data-ld-selected]').checked = action === 'all' || action === 'weekdays' && ![0, 6].includes(new Date(`${row.dataset.ldDate}T00:00:00Z`).getUTCDay()); });
        editor.querySelector('[data-ld-message]').textContent = action === 'weekdays' ? '已選週一至五；仍請取消國定假日，並自行勾選補班日。' : '';
    }
    ldWriteTotals(form);
    form.dispatchEvent(new Event('input', { bubbles: true }));
});
