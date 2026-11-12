'use strict';

const cotBase = '/api/browser/supervisors/conditional-overtime';
const cotEscape = value => escapeHtml(String(value ?? ''));
const cotIdentity = () => JSON.stringify([state.token, state.dashboard?.role, state.dashboard?.user?.id, Boolean(state.dashboard?.impersonation?.active)]);
const cotPeriodFields = ['startDate', 'startTime', 'endDate', 'endTime'];
const cotFormStates = new WeakMap();
const cotSettings = { identity: '', data: null, draft: null, dirty: false, loading: false, saving: false, error: '' };
const cotInbox = { records: null, loading: false, error: '', sequence: 0, page: 1 };
const cotPageSize = 15;
let cotGeneration = 0;
let cotDialog;

function cotPeriod(body, ids) {
    return { employeeIds: [...new Set(ids)].sort(), ...Object.fromEntries(cotPeriodFields.map(name => [name, body[name]])) };
}
function cotPreviewKey(body, ids) { return JSON.stringify(cotPeriod(body, ids)); }
async function cotRequestPreview(body, ids) {
    const key = cotPreviewKey(body, ids);
    const result = await requestJson(`${cotBase}/preview`, { method: 'POST', auth: true, body: JSON.parse(key) });
    const previews = result.previews || [];
    if (ids.some(id => !previews.some(row => row.employeeId === id))) throw new Error('缺少申請對象的複核預覽，請重新查詢。');
    return { key, previews };
}
function cotEvidence(evidence = []) {
    const dates = [...new Set(evidence.map(item => [item.weekSaturday || item.saturday, item.leaveDate || (item.leaveDates || []).join('、'), item.uncertain ? '（舊單時段待核對）' : ''].join('|')))];
    return dates.length ? `<ul>${dates.map(value => { const [saturday, dates, note] = value.split('|'); return `<li>週六 ${cotEscape(saturday)} · 該週請假日期 ${cotEscape(dates)}${cotEscape(note)}</li>`; }).join('')}</ul>` : '';
}
function cotPeople(people = []) { return people.map(person => typeof person === 'string' ? person : [person.id, person.name].filter(Boolean).join(' ')).join('、'); }
function cotPreviewMarkup(preview) {
    if (!preview) return '';
    const relevant = preview.previews.filter(row => row.required || row.blockedReason);
    return `<section class="cot-notice" aria-label="條件複核預覽"><h4>條件複核預覽</h4>${relevant.length ? relevant.map(row => `<div><strong>${cotEscape(row.employeeId)} · 需條件複核</strong>${cotEvidence(row.evidence)}${row.reviewers?.length ? `<p>複核人選：${cotEscape(cotPeople(row.reviewers))}</p>` : ''}${row.blockedReason ? '<p class="cot-warning" role="alert">目前無可用複核人，送出後需由管理者重新指派。</p>' : ''}</div>`).join('') : '<p>這次申請未觸發條件複核。</p>'}</section>`;
}
function cotPreviewFingerprints(preview) {
    if (preview.previews.some(row => row.required && !row.fingerprint)) return null;
    return Object.fromEntries(preview.previews.filter(row => row.required).map(row => [row.employeeId, row.fingerprint]));
}
const cotPreviewInstruction = '第一次按送出時會先查詢條件複核，核對後再確認送出。';
function cotFormPreviewHost() { return `<div data-cot-form-preview aria-live="polite">${cotPreviewInstruction}</div>`; }
function cotReadFormPeriod(form) { return Object.fromEntries(cotPeriodFields.map(name => [name, form.elements.namedItem(name)?.value])); }
function cotCurrentIds(form, field) { return [...form.querySelectorAll(`[name="${field}"]:checked`)].map(input => input.value); }
async function cotReviewForm(form, body, ids, employeeField) {
    const host = form.querySelector('[data-cot-form-preview]');
    if (!host) return null;
    const key = cotPreviewKey(body, ids), identity = cotIdentity();
    const current = cotFormStates.get(form);
    if (current?.key === key && current.identity === identity && (!current.preview || cotPreviewFingerprints(current.preview) !== null)) {
        if (!current.preview) return null;
        if (!host.querySelector('[data-cot-ack]')?.checked) {
            host.querySelector('[data-cot-ack]')?.focus();
            return null;
        }
        return cotPreviewFingerprints(current.preview);
    }
    const pending = { key, identity, preview: null };
    cotFormStates.set(form, pending);
    host.textContent = '正在查詢條件複核…';
    try {
        const preview = await cotRequestPreview(body, ids);
        if (identity !== cotIdentity() || !form.isConnected || cotFormStates.get(form) !== pending) return null;
        if (key !== cotPreviewKey(cotReadFormPeriod(form), cotCurrentIds(form, employeeField))) { cotResetForm(form); return null; }
        pending.preview = preview;
        const allowed = cotPreviewFingerprints(preview) !== null;
        host.innerHTML = `${cotPreviewMarkup(preview)}${allowed ? '<label class="cot-check"><input type="checkbox" data-cot-ack>我已查看條件複核預覽，確認後送出</label>' : ''}`;
        host.querySelector('[data-cot-ack]')?.focus();
    } catch (error) {
        if (identity !== cotIdentity() || !form.isConnected || cotFormStates.get(form) !== pending) return null;
        cotFormStates.delete(form);
        host.textContent = error.message;
    }
    return null;
}
function cotResetForm(form) {
    cotFormStates.delete(form);
    const host = form.querySelector('[data-cot-form-preview]');
    if (host) host.textContent = cotPreviewInstruction;
}
function cotOnFormInput(event) {
    const target = event.target;
    if (![...cotPeriodFields, 'employeeIds'].includes(target.name)) return;
    const form = target.closest?.('[data-sp-form="overtime"], #admin-paper-overtime-form');
    if (form) cotResetForm(form);
}
document.addEventListener('input', cotOnFormInput);
document.addEventListener('change', cotOnFormInput);

const cotLabels = { waiting_supervisor: '原主管審核中', pending: '待額外複核', approved: '複核通過', rejected: '已駁回', withdrawn: '已撤回', cancelled: '已作廢' };
function cotReviewProgress(row) {
    const review = row?.additionalReview;
    if (!review?.required) return '';
    return `<details class="cot-progress"><summary>第二階段：條件複核 · ${cotEscape(cotLabels[review.status] || '待確認')}${review.reconciliationRequired ? ' <span class="cot-warning">原已核准，待補複核</span>' : ''}</summary>
        <div class="cot-notice">${review.reconciliationRequired ? '<p>請核對後續出勤與結算。</p>' : ''}
        ${cotEvidence(review.evidence)}${review.reviewerIds?.length ? `<p>複核人選：${cotEscape(cotPeople(review.reviewers || review.reviewerIds))}</p>` : ''}
        ${review.status === 'pending' && Array.isArray(review.eligibleReviewerIds) ? `<p>${review.eligibleReviewerIds.length ? '目前待複核：' + cotEscape(cotPeople((review.reviewers || review.eligibleReviewerIds).filter(person => review.eligibleReviewerIds.includes(person.id || person)))) : '目前沒有符合資格的複核人，待管理者改派。'}</p>` : ''}
        ${review.reviewerVotes?.length ? `<ul>${review.reviewerVotes.map(vote => `<li>${cotEscape(vote.reviewerName || vote.reviewerId)} · ${vote.decision === 'approved' ? '複核通過' : '複核駁回'}${vote.decidedAt ? ` · ${cotEscape(cotTime(vote.decidedAt))}` : ''}</li>`).join('')}</ul>` : ''}
        <button type="button" class="outline-btn" data-cot-open="${cotEscape(row.id)}">${review.canReview ? '辦理複核' : '查看複核歷程'}</button></div></details>`;
}
function cotTime(value) {
    const date = new Date(Number(value) + 8 * 3600000);
    return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 16).replace('T', ' ') : '';
}

function cotCanSettings(dashboard = state.dashboard) {
    return dashboard?.role === 'system_admin' || (dashboard?.role === 'admin' && (dashboard.permissions?.admin || []).includes('admin.overtime.conditionalSettings'));
}
function cotCanWriteSettings() { return cotCanSettings() && !state.dashboard?.impersonation?.active && cotSettings.data?.canEdit === true; }
function cotDiscardSettings({ retainUntilLoaded = false } = {}) {
    if (cotSettings.identity !== cotIdentity()) return true;
    if (cotSettings.saving) return false;
    if (cotSettings.dirty && !window.confirm('捨棄尚未儲存的條件複核設定？')) return false;
    if (cotSettings.dirty && !retainUntilLoaded) { cotSettings.draft = cotSettingsDraft(cotSettings.data); cotSettings.dirty = false; cotSettings.error = ''; }
    return true;
}
function cotSettingsDraft(data) {
    const settings = data.settings;
    return { ...settings, leaveTypeIds: settings.configured ? [...settings.leaveTypeIds] : data.leaveTypes.filter(type => type.enabled !== false).map(type => type.id), reviewerIds: [...settings.reviewerIds], reason: '', confirm: false };
}
function cotRenderSettings() {
    const { data, draft, error, loading, saving } = cotSettings;
    const editable = cotCanWriteSettings() && !saving && !loading;
    const options = (selected, other) => `<option value="">請選擇</option>${data.employees.filter(person => person.id !== other || person.id === selected).map(person => `<option value="${cotEscape(person.id)}" ${person.id === selected ? 'selected' : ''}>${cotEscape(person.id)} ${cotEscape(person.name)}</option>`).join('')}${selected && !data.employees.some(person => person.id === selected) ? `<option value="${cotEscape(selected)}" selected>${cotEscape(selected)}（已停用）</option>` : ''}`;
    return `<section id="conditional-overtime-settings" class="cot-settings"><h3>週六加班條件複核</h3><p>指定假別在該週工作日時段內有請假時，週六加班須完成額外複核。主複核人不適用時，使用備援複核人。</p>
        ${error ? `<p class="inline-message error" role="alert">${cotEscape(error)}</p>` : ''}${draft ? `<form data-cot-settings-form class="stack-form"><fieldset ${editable ? '' : 'disabled'}>
            <label class="cot-check"><input type="checkbox" name="enabled" ${draft.enabled ? 'checked' : ''}>啟用條件複核</label>
            <div class="cot-settings-grid"><label class="field"><span>生效日期</span><input type="date" name="effectiveDate" value="${cotEscape(draft.effectiveDate)}" ${draft.enabled ? 'required' : ''}></label>
            <label class="field"><span>主複核人</span><select name="primaryReviewer" ${draft.enabled ? 'required' : ''}>${options(draft.reviewerIds[0], draft.reviewerIds[1])}</select></label>
            <label class="field"><span>備援複核人</span><select name="backupReviewer">${options(draft.reviewerIds[1], draft.reviewerIds[0])}</select></label></div>
            <div><h4>適用假別</h4><div class="cot-type-list">${data.leaveTypes.map(type => `<label class="cot-check"><input type="checkbox" name="leaveTypeIds" value="${cotEscape(type.id)}" ${draft.leaveTypeIds.includes(type.id) ? 'checked' : ''}>${cotEscape(type.name)}</label>`).join('') || '<p>目前沒有可選假別。</p>'}</div></div>
            <label class="field"><span>設定原因</span><textarea name="reason" maxlength="500" required>${cotEscape(draft.reason)}</textarea></label>
            <label class="cot-check"><input type="checkbox" name="confirm" ${draft.confirm ? 'checked' : ''} required>已核對規則、適用假別與複核人</label>
            </fieldset><div class="cot-settings-actions"><button type="submit" class="primary-btn" ${editable ? '' : 'disabled'}>${saving ? '儲存中…' : '儲存條件複核設定'}</button><button type="button" class="outline-btn" data-cot-settings-refresh ${loading || saving ? 'disabled' : ''}>重新載入設定</button></div></form>${data.canEdit ? '' : '<p>目前為唯讀。</p>'}`
            : loading ? '<p role="status">讀取設定中…</p>' : '<div class="cot-settings-actions"><button type="button" class="outline-btn" data-cot-settings-refresh>重新載入設定</button></div>'}
        ${data ? cotRenderInbox() : ''}</section>`;
}
function cotPaintSettings() {
    const host = document.getElementById('conditional-overtime-settings');
    if (host && cotCanSettings()) {
        host.outerHTML = cotRenderSettings();
        if (typeof installWorkbenchPageHelp === 'function') installWorkbenchPageHelp();
    }
}
async function cotLoadSettings() {
    if (!cotCanSettings() || cotSettings.loading || cotSettings.saving) return;
    const identity = cotIdentity(), generation = cotGeneration;
    Object.assign(cotSettings, { identity, loading: true, error: '' }); cotPaintSettings();
    try {
        const data = await requestJson(`${cotBase}/settings`, { auth: true });
        if (identity !== cotIdentity() || generation !== cotGeneration) return;
        Object.assign(cotSettings, { data, draft: cotSettingsDraft(data), dirty: false });
    } catch (error) {
        if (identity === cotIdentity() && generation === cotGeneration) cotSettings.error = error.message;
    } finally {
        if (identity === cotIdentity() && generation === cotGeneration) {
            cotSettings.loading = false; cotPaintSettings();
            if (document.getElementById('conditional-overtime-inbox') && !cotInbox.records && !cotInbox.error) cotLoadInbox();
        }
    }
}
function cotReadSettings(form) {
    const fields = new FormData(form);
    return { enabled: fields.has('enabled'), effectiveDate: fields.get('effectiveDate') || '', leaveTypeIds: fields.getAll('leaveTypeIds'),
        reviewerIds: [fields.get('primaryReviewer') || '', fields.get('backupReviewer') || ''], reason: fields.get('reason') || '',
        confirm: fields.has('confirm'), revision: cotSettings.data.settings.revision };
}
document.addEventListener('input', event => {
    const form = event.target.closest?.('[data-cot-settings-form]');
    if (!form || !cotCanWriteSettings() || cotSettings.loading || cotSettings.saving) return;
    cotSettings.draft = cotReadSettings(form); cotSettings.dirty = true;
});
document.addEventListener('submit', async event => {
    const form = event.target.closest?.('[data-cot-settings-form]');
    if (!form) return;
    event.preventDefault();
    if (!cotCanWriteSettings() || cotSettings.saving || cotSettings.loading || !form.reportValidity()) return;
    const identity = cotIdentity(), generation = cotGeneration;
    const draft = cotReadSettings(form);
    if (draft.enabled && (!draft.effectiveDate || !draft.leaveTypeIds.length || !draft.reviewerIds[0])) {
        cotSettings.error = '請填生效日期、適用假別與主複核人。'; cotPaintSettings(); return;
    }
    const reviewerIds = draft.reviewerIds.filter(Boolean);
    if (new Set(reviewerIds).size !== reviewerIds.length || (!draft.reviewerIds[0] && draft.reviewerIds[1])) {
        cotSettings.error = '主複核人與備援須為不同員工，且應先指定主複核人。'; cotPaintSettings(); return;
    }
    Object.assign(cotSettings, { draft, dirty: true, saving: true, error: '' }); cotPaintSettings();
    try {
        const result = await requestJson(`${cotBase}/settings`, { method: 'POST', auth: true, body: { ...draft, reviewerIds } });
        if (identity !== cotIdentity() || generation !== cotGeneration) return;
        const data = { ...cotSettings.data, ...result };
        Object.assign(cotSettings, { data, draft: cotSettingsDraft(data), dirty: false });
        setMessage(ui.dashboardMessage, '已儲存條件複核設定。', 'success');
    } catch (error) {
        if (identity === cotIdentity() && generation === cotGeneration) cotSettings.error = error.message;
    } finally {
        if (identity === cotIdentity() && generation === cotGeneration) { cotSettings.saving = false; cotPaintSettings(); }
    }
});

function cotRenderInbox() {
    const { records, loading, error } = cotInbox;
    return `<section id="conditional-overtime-inbox" class="cot-inbox"><h3>週六加班待額外複核</h3>${error ? `<p role="alert">${cotEscape(error)}</p>` : ''}
        ${records ? cotInboxTable(records) : loading ? '<p role="status">讀取複核案件…</p>' : ''}
        <button type="button" class="outline-btn" data-cot-inbox-refresh ${loading ? 'disabled' : ''}>重新載入複核案件</button></section>`;
}
function cotInboxPageCount(rows) { return Math.max(1, Math.ceil(rows.length / cotPageSize)); }
function cotInboxTable(rows) {
    if (!rows.length) return '<p>目前沒有待額外複核的加班申請。</p>';
    const pages = cotInboxPageCount(rows);
    const page = Math.min(cotInbox.page, pages);
    const offset = (page - 1) * cotPageSize;
    const items = rows.slice(offset, offset + cotPageSize).map(row => {
        const review = row.additionalReview || {};
        const saturdays = [...new Set((review.evidence || []).map(item => item.weekSaturday || item.saturday).filter(Boolean))];
        const current = review.eligibleReviewerIds || [];
        const people = current.map(id => review.reviewers?.find(person => person.id === id) || id);
        return `<tr><td><strong>${cotEscape(row.employeeName || '姓名未記錄')}</strong><small>${cotEscape(row.employeeId)}</small></td>
            <td>${cotEscape(row.startText)}<small>至 ${cotEscape(row.endText)} · ${cotEscape(row.duration_hours)} 小時</small></td>
            <td>${cotEscape(saturdays.join('、') || '—')}</td>
            <td>${cotEscape(cotPeople(people) || '待管理者指派')}</td>
            <td>${cotEscape(cotLabels[review.status] || row.statusText || '待額外複核')}${review.reconciliationRequired ? '<small class="cot-warning">原已核准，待補複核</small>' : ''}</td>
            <td><button type="button" class="outline-btn" data-cot-open="${cotEscape(row.id)}">${review.canReview ? '辦理複核' : '查看複核'}</button></td></tr>`;
    }).join('');
    return `<div class="cot-table-scroll" role="region" aria-label="待額外複核清單" tabindex="0"><table class="cot-table">
        <thead><tr><th scope="col">員工</th><th scope="col">起訖／時數</th><th scope="col">觸發週六</th><th scope="col">目前複核人</th><th scope="col">狀態</th><th scope="col">操作</th></tr></thead>
        <tbody>${items}</tbody></table></div>
        <nav class="cot-pagination" aria-label="待額外複核分頁"><button type="button" class="outline-btn" data-cot-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>上一頁</button>
            <span>第 ${page}／${pages} 頁 · 共 ${rows.length} 筆</span><button type="button" class="outline-btn" data-cot-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>下一頁</button></nav>`;
}
function cotCanReadInbox() {
    const dashboard = state.dashboard;
    return dashboard?.role === 'employee' || cotCanSettings() || (dashboard?.role === 'admin' && (dashboard.permissions?.admin || []).includes('admin.overtime.view'));
}
function cotPaintInbox() {
    const host = document.getElementById('conditional-overtime-inbox');
    if (host && cotCanReadInbox()) host.outerHTML = cotRenderInbox();
}
async function cotLoadInbox() {
    if (!cotCanReadInbox() || cotInbox.loading) return;
    const identity = cotIdentity(), sequence = ++cotInbox.sequence;
    Object.assign(cotInbox, { loading: true, error: '' }); cotPaintInbox();
    try {
        const result = await requestJson(`${cotBase}/inbox`, { auth: true });
        if (identity === cotIdentity() && sequence === cotInbox.sequence) {
            cotInbox.records = result.records || [];
            cotInbox.page = Math.min(cotInbox.page, cotInboxPageCount(cotInbox.records));
        }
    } catch (error) {
        if (identity === cotIdentity() && sequence === cotInbox.sequence) cotInbox.error = error.message;
    } finally {
        if (identity === cotIdentity() && sequence === cotInbox.sequence) { cotInbox.loading = false; cotPaintInbox(); }
    }
}

function cotHistory(history = []) {
    const actions = { trigger: '列入條件複核', refresh: '重新核對條件', reassign: '改派複核人', decision: '提交複核決定', rejected: '申請駁回', withdrawn: '撤回申請', cancelled: '作廢申請' };
    return history.length ? `<ol>${history.map(event => `<li>${cotEscape(actions[event.action] || '複核更新')} · ${cotEscape(event.actorName || event.actorId || '系統')} ${cotEscape(cotTime(event.createdAt || event.at))}${event.reason || event.comment ? `<p>${cotEscape(event.reason || event.comment)}</p>` : ''}${event.action === 'reassign' ? `<p>${cotEscape(cotPeople(event.before?.reviewerIds) || '未指定')} → ${cotEscape(cotPeople(event.after?.reviewerIds) || '未指定')}</p>` : ''}${event.action === 'decision' && cotLabels[event.after?.status] ? `<p>${cotEscape(cotLabels[event.after.status])}</p>` : ''}</li>`).join('')}</ol>` : '<p>尚無複核歷程。</p>';
}
async function cotOpenReview(requestId) {
    if (cotDialog) return;
    const identity = cotIdentity();
    const dialog = document.createElement('dialog');
    cotDialog = dialog; dialog.id = 'conditional-overtime-dialog'; dialog.className = 'cot-dialog'; dialog.setAttribute('aria-labelledby', 'cot-dialog-title');
    dialog.innerHTML = '<h3 id="cot-dialog-title">加班條件複核</h3><div data-cot-content role="status">讀取複核歷程…</div><p data-cot-error role="alert"></p><div class="inline-actions"><button type="button" class="outline-btn" data-cot-help>操作說明</button><button type="button" class="outline-btn" data-cot-close>關閉</button></div>';
    const live = () => cotDialog === dialog && identity === cotIdentity() && dialog.isConnected;
    let busy = false, dirty = false;
    const close = (confirmed = false) => {
        if (busy || cotDialog !== dialog || (dirty && !confirmed && !window.confirm('捨棄尚未送出的複核內容？'))) return;
        cotDialog = null; dialog.close(); dialog.remove();
    };
    dialog.querySelector('[data-cot-close]').addEventListener('click', () => close());
    dialog.querySelector('[data-cot-help]').addEventListener('click', () => { if (typeof openWorkbenchHelp === 'function') openWorkbenchHelp(); });
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('input', () => { dirty = true; });
    document.body.append(dialog); dialog.showModal();
    const path = `${cotBase}/${encodeURIComponent(requestId)}`;
    const content = dialog.querySelector('[data-cot-content]');
    const error = dialog.querySelector('[data-cot-error]');
    try {
        const result = await requestJson(`${path}/history`, { auth: true });
        if (!live()) return;
        const row = result.record || result.request || {};
        const review = row.additionalReview || result.additionalReview || result.review || {};
        const canReview = !state.dashboard?.impersonation?.active && (result.canReview === true || result.canDecide === true || review.canReview === true);
        const canReassign = cotCanSettings() && !state.dashboard?.impersonation?.active && result.canReassign === true && ['pending', 'waiting_supervisor'].includes(review.status);
        const staff = result.employees || cotSettings.data?.employees || [];
        const picker = (name, label, selected) => `<label class="field"><span>${label}</span>${staff.length ? `<select name="${name}"><option value="">請選擇</option>${staff.map(person => `<option value="${cotEscape(person.id)}" ${person.id === selected ? 'selected' : ''}>${cotEscape(person.id)} ${cotEscape(person.name)}</option>`).join('')}</select>` : `<input name="${name}" value="${cotEscape(selected)}" placeholder="員工工號">`}</label>`;
        const common = (label, required) => `<label class="field"><span>${label}</span><textarea name="reason" maxlength="500" ${required ? 'required' : ''}></textarea></label><label class="cot-check"><input type="checkbox" name="confirm" required>確認送出本次操作</label>`;
        content.removeAttribute('role');
        content.innerHTML = `<p>單號 ${cotEscape(requestId)}${row.employeeName ? ` · ${cotEscape(row.employeeId)} ${cotEscape(row.employeeName)}` : ''}</p>
            ${row.startText && row.endText ? `<p>加班起訖：${cotEscape(row.startText)} 至 ${cotEscape(row.endText)} · ${cotEscape(row.duration_hours)} 小時</p>` : ''}${row.reason ? `<p>加班事由：${cotEscape(row.reason)}</p>` : ''}
            ${row.reviewPolicy ? `<h4>原主管審核</h4>${cotPreviousProgress(row)}` : row.supervisorDecisionText ? `<p>原主管審核：${cotEscape(row.supervisorDecisionText)} ${cotEscape(row.supervisorName)}</p>` : ''}
            <p>${cotEscape(cotLabels[review.status] || '')}</p>${cotEvidence(review.evidence)}<h4>複核歷程</h4>${cotHistory(result.history)}
            ${canReview ? `<form data-cot-decision class="stack-form"><h4>送出複核決定</h4><label class="field"><span>決定</span><select name="decision" required><option value="">請選擇</option><option value="approved">通過</option><option value="rejected">駁回</option></select></label>${common('複核意見（必填）', true)}<button type="submit" class="primary-btn">送出複核決定</button></form>` : ''}
            ${canReassign ? `<form data-cot-reassign class="stack-form"><h4>改派複核人</h4>${picker('primary', '主複核人', review.reviewerIds?.[0])}${picker('backup', '備援複核人', review.reviewerIds?.[1])}${common('改派原因', true)}<button type="submit" class="primary-btn">確認改派</button></form>` : ''}`;
        dialog.addEventListener('submit', async event => {
            event.preventDefault();
            if (busy || !live() || !event.target.reportValidity()) return;
            const isDecision = event.target.hasAttribute('data-cot-decision');
            if (isDecision ? !canReview : !canReassign) return;
            const fields = new FormData(event.target);
            const reason = String(fields.get('reason') || '').trim();
            const primary = String(fields.get('primary') || '').trim();
            const backup = String(fields.get('backup') || '').trim();
            if (!isDecision && (!primary || primary === backup || !reason)) { error.textContent = '請填主複核人與原因；備援須為不同員工。'; return; }
            if (isDecision && !reason) { error.textContent = '請填寫複核意見。'; return; }
            const body = { revision: review.revision, confirm: fields.has('confirm'), ...(isDecision ? { decision: fields.get('decision'), comment: reason } : { reviewerIds: [primary, backup].filter(Boolean), reason }) };
            busy = true; error.textContent = '';
            const controls = [...dialog.querySelectorAll('input,select,textarea,button')];
            controls.forEach(control => { control.disabled = true; });
            try {
                await requestJson(`${path}/${isDecision ? 'decision' : 'reassign'}`, { method: 'POST', auth: true, body });
                if (!live()) return;
                busy = false; close(true); cotInvalidateInbox();
                await reloadDashboard(isDecision ? '已送出加班複核決定。' : '已改派加班複核人。', 'success');
            } catch (failure) {
                if (live()) error.textContent = failure.message;
                else if (identity === cotIdentity()) setMessage(ui.dashboardMessage, '已送出操作，重新載入工作台時發生錯誤。', 'error');
            } finally {
                busy = false;
                if (live()) controls.forEach(control => { control.disabled = false; });
            }
        });
    } catch (failure) { if (live()) { content.textContent = ''; error.textContent = failure.message; } }
}

document.addEventListener('click', event => {
    const employeePickerAction = event.target.closest?.('[data-action="paper-select-visible-employees"], [data-action="paper-clear-employees"]');
    const employeePickerForm = employeePickerAction?.closest('[data-sp-form="overtime"], #admin-paper-overtime-form');
    if (employeePickerForm) cotResetForm(employeePickerForm);
    if (event.target.closest?.('[data-cot-settings-refresh]')) { if (cotDiscardSettings({ retainUntilLoaded: true })) cotLoadSettings(); return; }
    if (event.target.closest?.('[data-cot-inbox-refresh]')) { cotLoadInbox(); return; }
    const pageButton = event.target.closest?.('[data-cot-page]');
    if (pageButton && cotCanReadInbox() && cotInbox.records) {
        const page = Number(pageButton.dataset.cotPage);
        if (Number.isInteger(page) && page > 0 && page <= cotInboxPageCount(cotInbox.records)) { cotInbox.page = page; cotPaintInbox(); }
        return;
    }
    const button = event.target.closest?.('[data-cot-open]');
    if (button) cotOpenReview(button.dataset.cotOpen);
});

function cotResetSession() {
    cotGeneration++;
    Object.assign(cotSettings, { identity: '', data: null, draft: null, dirty: false, loading: false, saving: false, error: '' });
    cotInvalidateInbox();
    cotInbox.page = 1;
    if (cotDialog) { cotDialog.close(); cotDialog.remove(); cotDialog = null; }
}
const cotPreviousRender = renderDashboard;
let cotActiveIdentity = '';
renderDashboard = function renderDashboardWithConditionalOvertime(dashboard) {
    const identity = JSON.stringify([state.token, dashboard.role, dashboard.user?.id, Boolean(dashboard.impersonation?.active)]);
    if (identity !== cotActiveIdentity) { cotResetSession(); cotActiveIdentity = identity; }
    return cotPreviousRender(dashboard);
};
const cotPreviousPostRender = postRenderSetup;
postRenderSetup = function postRenderConditionalOvertime() {
    cotPreviousPostRender();
    if (document.getElementById('conditional-overtime-settings') && !cotSettings.data && !cotSettings.error) cotLoadSettings();
    if (document.getElementById('conditional-overtime-inbox') && !cotInbox.records && !cotInbox.error) cotLoadInbox();
};
const cotPreviousLogout = handleLogout;
handleLogout = function logoutConditionalOvertime(...args) { cotResetSession(); cotActiveIdentity = ''; return cotPreviousLogout(...args); };
const cotPreviousSync = handleRealtimeSyncMessage;
function cotInvalidateInbox() { Object.assign(cotInbox, { records: null, loading: false, error: '', sequence: cotInbox.sequence + 1 }); }
handleRealtimeSyncMessage = async function syncConditionalOvertime(payload) {
    if (['overtimeRequests', 'conditionalOvertime', 'leaveRequests', 'attendanceCalendar'].includes(payload?.type)) {
        cotInvalidateInbox();
        if (document.getElementById('conditional-overtime-inbox')) cotLoadInbox();
    }
    return cotPreviousSync(payload);
};
const cotPreviousProgress = renderRequestReviewProgress;
renderRequestReviewProgress = function renderConditionalOvertimeProgress(row) { return (cotPreviousProgress(row) || '') + cotReviewProgress(row); };
