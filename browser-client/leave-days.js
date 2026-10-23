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
function renderLegacyLeaveDaysEditor({ batch = false } = {}) {
    return `<section class="ld-editor" data-leave-days data-ld-mode="legacy" data-ld-batch="${batch}" aria-label="逐日選擇請假日期">
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
function syncLegacyLeaveDaysEditor(form, { reset = false, request = null } = {}) {
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
    if (form.querySelector('[data-leave-days]')?.dataset.ldMode === 'segments') return collectLeaveSegments(lsReadRows(form));
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
    if ((request?.dateSelectionMode || request?.date_selection_mode) === 'explicit_segments') {
        const rows = request.leaveSegments || request.leave_segments || [];
        const dates = new Set(rows.map((row) => row.date || lsDateTime(row.startAt).date));
        return `<details class="ld-request-summary"><summary>實際請假 ${dates.size} 日 · ${rows.length} 段</summary><ul>${rows.map((row) => {
            const start = lsDateTime(row.startAt), end = lsDateTime(row.endAt);
            return `<li><span>${ldEscape(row.date || start.date)} ${ldEscape(start.time)}–${ldEscape(end.date !== start.date ? '24:00' : end.time)}${row.breakMinutes !== undefined && row.breakMinutes !== null ? `<small class="ls-break-summary">休息 ${ldEscape(row.breakMinutes)} 分鐘</small>` : ''}</span><strong>${ldEscape(row.hours)} 小時</strong></li>`;
        }).join('')}</ul><p>只計入列出的時段；日期之間及同日時段之間的空檔不算請假。</p></details>`;
    }
    if (request?.dateSelectionMode !== 'explicit_dates' && request?.date_selection_mode !== 'explicit_dates') return '<small class="ld-legacy-note">舊單沿用原起訖範圍；尚未確認逐日請假日期。</small>';
    const selected = request.dailyHours || [], selectedSet = new Set(selected.map((row) => row.date));
    const format = (value) => new Date(Number(value) + 8 * 3600000).toISOString();
    let excluded = [];
    try { const start = format(request.start_at), end = format(request.end_at); excluded = leaveDayRange(start.slice(0, 10), start.slice(11, 16), end.slice(0, 10), end.slice(11, 16)).filter((row) => !selectedSet.has(row.date)); } catch (_) { /* Invalid historical period is not inferred. */ }
    return `<details class="ld-request-summary"><summary>實際請假 ${selected.length} 日${excluded.length ? ` · 排除 ${excluded.length} 日` : ''}</summary><ul>${selected.map((row) => `<li><span>${ldEscape(row.date)}</span><strong>${ldEscape(row.hours)} 小時</strong></li>`).join('')}</ul>${excluded.length ? `<p>不請假：${excluded.map((row) => ldEscape(row.date)).join('、')}</p>` : ''}</details>`;
}
function renderLeaveDaysEditor({ batch = false } = {}) {
    return `<section class="ld-editor ls-editor" data-leave-days data-ld-mode="segments" data-ld-batch="${batch}" aria-label="多日期與時段請假">
        <input type="hidden" name="dateSelectionMode" value="explicit_segments"><input type="hidden" name="dailyHours" value="">
        <div class="ld-heading"><div><h4>同一張單的請假時段</h4><p>同一假別可加入多個日期或區間，全部時段一起送出審核。</p></div><strong data-ld-summary aria-live="polite">尚未加入時段</strong></div>
        <p class="ld-note">先填上方的新增區間與每日起訖，再加入下方清單。可重複加入其他日期，也可在同一天新增上午、下午等不重疊的時段。只列入清單中的時段。</p>
        ${batch ? '<p class="ld-note">所選員工共用下方所有時段與時數；每位員工各建立一張完整申請。班表不同時請分開送出。</p>' : ''}
        <div class="ls-add-tools"><label class="field"><span>每日休息（分鐘）</span><input type="number" min="0" max="1439" step="1" data-ls-batch-break aria-label="加入區間的每日休息分鐘"></label>
            <label class="field"><span>每日實際請假時數</span><input type="number" min="0.01" max="24" step="0.01" data-ls-batch-hours placeholder="依起訖減休息計算" aria-label="加入區間的每日實際請假時數"></label>
            <button type="button" class="outline-btn" data-ls-action="auto-batch">恢復自動計算</button>
            <label class="ls-weekends"><input type="checkbox" data-ls-weekends>多日區間包含週末</label>
            <button type="button" class="outline-btn" data-ls-action="add-range">加入上方日期區間</button>
            <button type="button" class="outline-btn" data-ls-action="add-one">新增單一時段</button></div>
        <p class="ld-note">完整涵蓋 12:20–13:00 時預帶休息 40 分鐘，其他時段預帶 0 分鐘；可另外修改休息分鐘，實際時數會重新計算，也可再自行調整實際時數。多日區間預設只加入週一至五，請自行核對假日與補班日。結束 00:00 表示該日 24:00，跨夜請拆成兩天。最多 740 段，最早至最晚日期最多 370 日。</p>
        <p class="ld-message" data-ld-message role="status"></p><div class="ls-rows" data-ls-rows></div>
    </section>`;
}
function lsDateTime(timestamp) {
    const value = Number(timestamp);
    if (!Number.isFinite(value) || !Number.isFinite(new Date(value + 8 * 3600000).getTime())) return { date: '', time: '' };
    const text = new Date(value + 8 * 3600000).toISOString();
    return { date: text.slice(0, 10), time: text.slice(11, 16) };
}
function lsRowFromSegment(segment) {
    const start = lsDateTime(segment.startAt), end = lsDateTime(segment.endAt);
    // Historical hours are already net. Never invent or deduct a lunch break during correction.
    return { id: segment.id || '', date: segment.date || start.date, startTime: start.time, endTime: end.time, hours: String(segment.hours ?? ''), manual: true, breakManual: true,
        ...(segment.breakMinutes !== undefined && segment.breakMinutes !== null ? { breakMinutes: String(segment.breakMinutes) } : {}) };
}
function lsReadRows(form) {
    return [...form.querySelectorAll('[data-ls-row]')].map((row) => ({ id: row.dataset.lsId || '',
        ...Object.fromEntries(['date', 'startTime', 'endTime', 'hours'].map((key) => [key, row.querySelector(`[data-ls-field="${key}"]`).value])),
        manual: row.dataset.lsManual === 'true', breakManual: row.dataset.lsBreakManual === 'true',
        ...(row.dataset.lsBreakKnown === 'true' ? { breakMinutes: row.querySelector('[data-ls-field="breakMinutes"]').value } : {}) }));
}
function leaveSegmentElapsedMinutes(startTime, endTime) {
    if (![startTime, endTime].every((time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time || ''))) return 0;
    const minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    return Math.max(0, (endTime === '00:00' ? 1440 : minutes(endTime)) - minutes(startTime));
}
function leaveSegmentDefaultBreakMinutes(startTime, endTime) {
    return leaveSegmentElapsedMinutes(startTime, endTime) > 0 && startTime <= '12:20' && (endTime === '00:00' || endTime >= '13:00') ? 40 : 0;
}
function leaveSegmentNetHours(startTime, endTime, breakMinutes) {
    const elapsed = leaveSegmentElapsedMinutes(startTime, endTime), rest = Number(breakMinutes);
    if (!/^\d+$/.test(String(breakMinutes)) || !Number.isSafeInteger(rest) || rest < 0 || rest >= elapsed) return '';
    return String(Math.floor((elapsed - rest) * 100 / 60) / 100);
}
// A leave draft owns its meal choices. Never derive another employee's choice from the visible calendar.
function leaveMealRequestKey(body) {
    return JSON.stringify([body.employeeIds || [], (body.leaveSegments || []).map((row) => [row.startAt, row.endAt])]);
}
function leaveHasLunchOverlap(body) {
    return (body.leaveSegments || []).some((row) => {
        const date = new Date(Number(row.startAt) + 8 * 3600000).toISOString().slice(0, 10);
        return Number(row.startAt) < Date.parse(`${date}T13:00:00+08:00`) && Number(row.endAt) > Date.parse(`${date}T12:20:00+08:00`);
    });
}
function leaveMealSelectionKey(row) { return `${row.employeeId}/${row.date}`; }
function leaveMealState(holder) { return holder.leaveMeals ||= { key: '', sequence: 0, options: [], selected: {}, loading: false, error: '', promise: null }; }
function renderLeaveMealOptions(holder, employees = []) {
    const meals = leaveMealState(holder), options = meals.options.filter((row) => row.participates);
    if (meals.loading) return '<p class="ld-note" role="status">正在確認請假日期的團膳資格與截止時間…</p>';
    if (meals.error) return `<p class="ld-message" role="alert">${ldEscape(meals.error)}<button type="button" class="outline-btn" data-leave-meal-retry>重試午餐資格</button></p>`;
    if (!options.length) return '';
    const impersonating = Boolean(state.dashboard?.impersonation?.active);
    return `<fieldset class="leave-meal-options"><legend>午餐安排</legend><p>請假時段與 12:20–13:00 重疊，預設勾選有參加團膳且仍可取消的日期。送出請假時即取消午餐；請假退回或撤回不會自動恢復。</p>${options.map((row) => {
        const key = leaveMealSelectionKey(row), editable = !impersonating && row.serving && row.canChange && row.eating;
        const employee = employees.find((item) => item.id === row.employeeId);
        return `<label class="leave-meal-choice ${editable ? '' : 'is-disabled'}"><input type="checkbox" data-leave-meal-choice="${ldEscape(key)}" ${editable && meals.selected[key] !== false ? 'checked' : ''} ${editable ? '' : 'disabled'}><span><strong>${ldEscape(row.date)}${employees.length > 1 ? ` · ${ldEscape(row.employeeId)} ${ldEscape(employee?.name || '')}` : ''}　當天不用餐</strong><small>${impersonating ? '身份模擬不能修改午餐安排' : !row.serving ? '本日未供餐' : !row.eating ? '目前已登記不用餐，無須重複取消' : row.canChange ? '可取消勾選，保留原本的午餐安排' : ldEscape(row.reason || '已截止或結單，請聯絡團膳管理者')}</small></span></label>`;
    }).join('')}</fieldset>`;
}
function collectLeaveMealChoices(holder, body) {
    const meals = leaveMealState(holder);
    if (state.dashboard?.impersonation?.active) return [];
    if (meals.key !== leaveMealRequestKey(body) || meals.loading || meals.error) return [];
    return meals.options.filter((row) => row.participates && row.serving && row.canChange && row.eating && meals.selected[leaveMealSelectionKey(row)] !== false)
        .map(({ employeeId, date }) => ({ employeeId, date }));
}
function requireLeaveMealOptionsReady(holder, body) {
    if (!leaveHasLunchOverlap(body)) return;
    const meals = leaveMealState(holder);
    if (meals.error) throw new Error(meals.error);
    if (meals.key !== leaveMealRequestKey(body) || meals.loading) throw new Error('午餐資格仍在更新，請確認日期與員工後再送出。');
}
async function loadLeaveMealOptions(holder, body, route, isCurrent, paint, force = false) {
    const meals = leaveMealState(holder), key = leaveMealRequestKey(body);
    if (!force && meals.key === key) { if (meals.promise) await meals.promise; if (meals.error) throw new Error(meals.error); return; }
    const sequence = ++meals.sequence;
    meals.key = key; meals.error = ''; meals.options = [];
    if (!leaveHasLunchOverlap(body)) { meals.loading = false; meals.promise = null; paint(); return; }
    meals.loading = true; paint();
    meals.promise = (async () => {
        try {
            const result = await requestJson(route, { method: 'POST', auth: true, body });
            if (!isCurrent() || sequence !== meals.sequence) return;
            meals.options = result.options || [];
        } catch (error) { if (isCurrent() && sequence === meals.sequence) meals.error = `無法確認午餐安排：${error.message}`; }
        finally { if (isCurrent() && sequence === meals.sequence) { meals.loading = false; meals.promise = null; paint(); } }
    })();
    await meals.promise;
    if (isCurrent() && sequence === meals.sequence && meals.error) throw new Error(meals.error);
}
function collectLeaveSegments(rows) {
    if (!rows.length || rows.length > 740) throw new Error('請先加入至少 1 段請假時段，最多 740 段。');
    const segments = rows.map((row, index) => {
        const label = `第 ${index + 1} 段`;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date || '') || !Number.isFinite(Date.parse(`${row.date}T00:00:00Z`)) || new Date(`${row.date}T00:00:00Z`).toISOString().slice(0, 10) !== row.date) throw new Error(`${label}請填有效日期。`);
        if (![row.startTime, row.endTime].every((time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time || ''))) throw new Error(`${label}請填完整起訖時間。`);
        const startAt = Date.parse(`${row.date}T${row.startTime}:00+08:00`), endAt = row.endTime === '00:00'
            ? Date.parse(`${row.date}T00:00:00+08:00`) + 86400000 : Date.parse(`${row.date}T${row.endTime}:00+08:00`);
        if (endAt <= startAt) throw new Error(`${label}結束時間須晚於開始；跨夜請分成兩天填寫。`);
        const hasBreak = row.breakMinutes !== undefined && row.breakMinutes !== null, breakMinutes = hasBreak ? Number(row.breakMinutes) : 0;
        if (hasBreak && (!/^\d+$/.test(String(row.breakMinutes)) || !Number.isSafeInteger(breakMinutes) || breakMinutes < 0 || breakMinutes * 60000 >= endAt - startAt)) throw new Error(`${label}休息分鐘須為 0 以上的整數，且小於該段起訖時間。`);
        const units = Math.round(Number(row.hours) * 100);
        if (!/^\d+(\.\d{1,2})?$/.test(String(row.hours)) || !Number.isSafeInteger(units) || units <= 0 || units > 2400 || units * 36000 > endAt - startAt - breakMinutes * 60000) throw new Error(`${label}實際時數須大於 0、最多兩位小數，且不得超過該段起訖時間扣除休息後的時數。`);
        return { ...(row.id ? { id: row.id } : {}), date: row.date, startAt, endAt, hours: units / 100, ...(hasBreak ? { breakMinutes } : {}) };
    }).sort((a, b) => a.startAt - b.startAt || a.endAt - b.endAt);
    const daily = new Map();
    segments.forEach((row, index) => {
        if (index && segments[index - 1].endAt > row.startAt) throw new Error(`${row.date} 的請假時段重疊，請核對並刪除重複時段或調整起訖時間。`);
        daily.set(row.date, (daily.get(row.date) || 0) + Math.round(row.hours * 100));
    });
    if ((Date.parse(`${segments[segments.length - 1].date}T00:00:00Z`) - Date.parse(`${segments[0].date}T00:00:00Z`)) / 86400000 + 1 > 370) throw new Error('多時段請假最早至最晚日期不可超過 370 日，請分單申請。');
    const start = lsDateTime(segments[0].startAt), end = lsDateTime(segments[segments.length - 1].endAt);
    return { dateSelectionMode: 'explicit_segments', leaveSegments: segments, dailyHours: [...daily].map(([date, units]) => ({ date, hours: units / 100 })),
        durationHours: [...daily.values()].reduce((sum, units) => sum + units, 0) / 100,
        startDate: start.date, startTime: start.time, endDate: end.date, endTime: end.time };
}
function leaveSegmentBatchRows(fields, hours, includeWeekends = false, breakMinutes) {
    const [startDate, startTime, endDate, endTime] = fields;
    const dates = leaveDayRange(startDate, '00:00', endDate, '23:59');
    const rows = dates.filter((row) => includeWeekends || leaveDayInitiallySelected(row.date, dates.length > 1))
        .map((row) => ({ id: '', date: row.date, startTime, endTime, hours: String(hours ?? ''), ...(breakMinutes !== undefined ? { breakMinutes: String(breakMinutes) } : {}) }));
    if (!rows.length) throw new Error('區間沒有週一至五；輪班或補班請勾選「多日區間包含週末」。');
    collectLeaveSegments(rows);
    return rows;
}
function lsPaintRows(form, rows) {
    const host = form.querySelector('[data-ls-rows]');
    host.innerHTML = rows.map((row, index) => `<div class="ls-row" data-ls-row data-ls-id="${ldEscape(row.id)}" data-ls-manual="${Boolean(row.manual)}" data-ls-break-manual="${Boolean(row.breakManual)}" data-ls-break-known="${row.breakMinutes !== undefined && row.breakMinutes !== null}">
        <strong class="ls-row-number">第 ${index + 1} 段</strong>
        <label class="field"><span>日期</span><input type="date" data-ls-field="date" value="${ldEscape(row.date)}" required aria-label="第 ${index + 1} 段日期"></label>
        <label class="field"><span>開始</span><input type="time" data-ls-field="startTime" value="${ldEscape(row.startTime)}" required aria-label="第 ${index + 1} 段開始時間"></label>
        <label class="field"><span>結束</span><input type="time" data-ls-field="endTime" value="${ldEscape(row.endTime)}" required aria-label="第 ${index + 1} 段結束時間"></label>
        <label class="field"><span>休息（分鐘）</span><input type="number" min="0" max="1439" step="1" data-ls-field="breakMinutes" value="${ldEscape(row.breakMinutes)}" placeholder="舊單未記錄" aria-label="第 ${index + 1} 段休息分鐘"></label>
        <label class="field"><span>實際時數</span><input type="number" min="0.01" max="24" step="0.01" data-ls-field="hours" value="${ldEscape(row.hours)}" required placeholder="扣除休息" aria-label="第 ${index + 1} 段實際時數"></label>
        <div class="ls-row-actions"><button type="button" class="outline-btn" data-ls-action="auto-row">恢復自動計算</button><button type="button" class="outline-btn" data-ls-action="duplicate">同日加一段</button><button type="button" class="outline-btn" data-ls-action="remove" aria-label="刪除第 ${index + 1} 段">刪除</button></div>
    </div>`).join('');
    lsWriteTotals(form);
}
function lsWriteTotals(form) {
    const editor = form.querySelector('[data-leave-days]'), rows = lsReadRows(form), total = rows.reduce((sum, row) => sum + (Number.isFinite(Number(row.hours)) ? Math.round(Number(row.hours) * 100) : 0), 0) / 100;
    const dates = new Set(rows.map((row) => row.date).filter(Boolean));
    editor.querySelector('[data-ld-summary]').textContent = rows.length ? `${dates.size} 日 · ${rows.length} 段 · ${total} 小時` : '尚未加入時段';
    form.elements.namedItem('durationHours').value = total || '';
    let message = '';
    try {
        const selection = collectLeaveSegments(rows);
        form.elements.namedItem('dailyHours').value = selection.dailyHours.map((row) => `${row.date}=${row.hours}`).join('\n');
    } catch (error) { message = error.message; form.elements.namedItem('dailyHours').value = ''; }
    editor.querySelector('[data-ld-message]').textContent = rows.length ? message : '請先加入日期區間或新增單一時段，再送出申請。';
}
function lsSyncBatch(form, { reset = false } = {}) {
    const editor = form.querySelector('[data-leave-days]');
    if (editor?.dataset.ldMode !== 'segments') return;
    if (reset) { delete editor.dataset.lsManual; delete editor.dataset.lsBreakManual; }
    const [, startTime, , endTime] = ldFields(form), rest = editor.querySelector('[data-ls-batch-break]'), hours = editor.querySelector('[data-ls-batch-hours]');
    if (editor.dataset.lsBreakManual !== 'true') rest.value = leaveSegmentDefaultBreakMinutes(startTime, endTime);
    if (editor.dataset.lsManual !== 'true') hours.value = leaveSegmentNetHours(startTime, endTime, rest.value);
}
function lsSyncRow(row, changed = '') {
    const field = (name) => row.querySelector(`[data-ls-field="${name}"]`), start = field('startTime').value, end = field('endTime').value;
    if (changed === 'hours') row.dataset.lsManual = 'true';
    if (changed === 'breakMinutes') { row.dataset.lsBreakManual = 'true'; row.dataset.lsBreakKnown = 'true'; row.dataset.lsManual = 'false'; }
    if (changed === 'auto') { row.dataset.lsManual = 'false'; row.dataset.lsBreakManual = 'false'; }
    if (row.dataset.lsBreakManual !== 'true') { field('breakMinutes').value = leaveSegmentDefaultBreakMinutes(start, end); row.dataset.lsBreakKnown = 'true'; }
    if (row.dataset.lsManual !== 'true') field('hours').value = leaveSegmentNetHours(start, end, field('breakMinutes').value);
}
function syncLeaveDaysEditor(form, { reset = false, request = null } = {}) {
    let editor = form?.querySelector('[data-leave-days]'); if (!editor) return;
    const mode = request ? ((request.dateSelectionMode || request.date_selection_mode) === 'explicit_segments' ? 'segments' : 'legacy') : reset ? 'segments' : editor.dataset.ldMode;
    if (editor.dataset.ldMode !== mode) {
        editor.outerHTML = mode === 'segments' ? renderLeaveDaysEditor({ batch: editor.dataset.ldBatch === 'true' }) : renderLegacyLeaveDaysEditor({ batch: editor.dataset.ldBatch === 'true' });
        editor = form.querySelector('[data-leave-days]'); leaveDayEditors.delete(form);
    }
    const labels = { startDate: '新增區間開始日期', endDate: '新增區間結束日期', startTime: '每日開始時間', endTime: '每日結束時間' };
    for (const [name, text] of Object.entries(labels)) {
        const field = form.elements.namedItem(name), label = field?.closest('label')?.querySelector('span');
        if (!label) continue;
        if (!label.dataset.ldOriginalLabel) label.dataset.ldOriginalLabel = label.textContent;
        label.textContent = mode === 'segments' ? text : label.dataset.ldOriginalLabel;
        field.required = mode !== 'segments';
    }
    if (mode === 'legacy') return syncLegacyLeaveDaysEditor(form, { reset, request });
    lsSyncBatch(form, { reset });
    if (request) lsPaintRows(form, (request.leaveSegments || request.leave_segments || []).map(lsRowFromSegment));
    else if (reset) lsPaintRows(form, []);
    else lsWriteTotals(form);
}
document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-ls-action]'); if (!button || button.disabled) return;
    const form = button.closest('form'), editor = button.closest('[data-leave-days]'); if (!form || !editor) return;
    event.preventDefault();
    try {
        const rows = lsReadRows(form), action = button.dataset.lsAction;
        if (action === 'auto-batch') { lsSyncBatch(form, { reset: true }); return; }
        if (action === 'auto-row') { lsSyncRow(button.closest('[data-ls-row]'), 'auto'); lsWriteTotals(form); return; }
        if (action === 'remove' || action === 'duplicate') {
            const index = [...form.querySelectorAll('[data-ls-row]')].indexOf(button.closest('[data-ls-row]'));
            if (action === 'remove') rows.splice(index, 1);
            else { if (rows.length >= 740) throw new Error('一次最多 740 段請假。'); rows.splice(index + 1, 0, { ...rows[index], id: '', startTime: rows[index].endTime === '00:00' ? '' : rows[index].endTime, endTime: '', hours: '', breakMinutes: '0', manual: false, breakManual: false }); }
        } else if (action === 'add-range') {
            lsSyncBatch(form);
            const additions = leaveSegmentBatchRows(ldFields(form), editor.querySelector('[data-ls-batch-hours]').value, editor.querySelector('[data-ls-weekends]').checked, editor.querySelector('[data-ls-batch-break]').value)
                .map((row) => ({ ...row, manual: editor.dataset.lsManual === 'true', breakManual: editor.dataset.lsBreakManual === 'true' }));
            if (rows.length + additions.length > 740) throw new Error('一次最多 740 段請假。');
            // Validate before mutating so a duplicate range cannot partly append.
            collectLeaveSegments([...rows, ...additions]); rows.push(...additions);
        } else if (action === 'add-one') {
            if (rows.length >= 740) throw new Error('一次最多 740 段請假。');
            lsSyncBatch(form);
            const [date, startTime, , endTime] = ldFields(form);
            rows.push({ id: '', date, startTime, endTime, hours: editor.querySelector('[data-ls-batch-hours]').value, breakMinutes: editor.querySelector('[data-ls-batch-break]').value,
                manual: editor.dataset.lsManual === 'true', breakManual: editor.dataset.lsBreakManual === 'true' });
        }
        lsPaintRows(form, rows);
        form.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (error) { editor.querySelector('[data-ld-message]').textContent = error.message; }
});
const ldPreviousPostRender = postRenderSetup;
postRenderSetup = function postRenderWithLeaveDays() { ldPreviousPostRender(); setupLeaveDaysEditors(); };
document.addEventListener('input', (event) => {
    const form = event.target.closest('form'); if (!form?.querySelector('[data-leave-days]')) return;
    if (form.querySelector('[data-leave-days]').dataset.ldMode === 'segments') {
        const row = event.target.closest('[data-ls-row]'), editor = form.querySelector('[data-leave-days]');
        if (row) { lsSyncRow(row, event.target.dataset.lsField); lsWriteTotals(form); }
        else {
            if (event.target.matches('[data-ls-batch-hours]')) editor.dataset.lsManual = 'true';
            if (event.target.matches('[data-ls-batch-break]')) { editor.dataset.lsBreakManual = 'true'; editor.dataset.lsManual = 'false'; }
            lsSyncBatch(form);
        }
        return;
    }
    if (['startDate', 'startTime', 'endDate', 'endTime'].includes(event.target.name)) syncLeaveDaysEditor(form);
    else if (event.target.matches('[data-ld-hours]')) ldWriteTotals(form);
});
document.addEventListener('change', (event) => {
    const form = event.target.closest('form'); if (!form?.querySelector('[data-leave-days]')) return;
    if (form.querySelector('[data-leave-days]').dataset.ldMode === 'segments') {
        const row = event.target.closest('[data-ls-row]');
        if (row) { lsSyncRow(row, event.target.dataset.lsField); lsWriteTotals(form); } else lsSyncBatch(form);
        return;
    }
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
