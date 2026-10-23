'use strict';

const saToday = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const saState = { identity: '', role: '', month: saToday().slice(0, 7), page: 'query', filters: {}, expanded: {}, paperTargets: {}, data: null, loading: false, busy: false, sequence: 0, message: '', error: false, action: null, draft: {}, submitKey: '' };
const saEsc = (value) => escapeHtml(String(value ?? ''));
const saStatus = (status) => ({ pending_admin: '待複核', approved: '已複核', rejected: '已退回', withdrawn: '已取消（員工撤回）', cancelled: '已取消' }[status] || status);
const saPaper = (row) => row?.entryMode === 'admin_paper_approved';
const saRowStatus = (row) => row.status === 'approved' && saPaper(row) ? '補登記' : saStatus(row.status);
const saMoney = (value) => value == null ? '—' : `NT$ ${Number(value).toLocaleString('zh-TW')}`;
const saTime = (value) => value ? new Date(value).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }) : '—';
const saCan = (permission) => Boolean(saState.data?.permissions?.[permission]);
const saOwn = () => saState.role === 'employee';
const saRootApi = () => saOwn() ? '/api/browser/employee/salary-advances' : '/api/browser/salary-advances';
const saButton = (action, label, attrs = '', primary = false) => `<button type="button" class="${primary ? 'primary' : 'outline'}-btn" data-sa-action="${action}" ${attrs}>${saEsc(label)}</button>`;
const saInput = (label, name, value, type = 'text', attrs = '') => `<label class="field"><span>${saEsc(label)}</span><input name="${name}" type="${type}" value="${saEsc(value)}" ${attrs}></label>`;
const saNote = (label, name, value = '', required = false) => `<label class="field"><span>${saEsc(label)}</span><textarea name="${name}" maxlength="500" rows="2" ${required ? 'required' : ''}>${saEsc(value)}</textarea></label>`;
function saNewSubmissionKey() {
    if (typeof window.crypto?.randomUUID === 'function') return window.crypto.randomUUID();
    // randomUUID requires HTTPS, but getRandomValues is also available on the company's HTTP LAN origin.
    if (typeof window.crypto?.getRandomValues !== 'function') throw new Error('此瀏覽器無法產生送件識別碼，請更新瀏覽器後再試。');
    const bytes = new Uint8Array(16); window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function saReset(identity = '') {
    Object.assign(saState, { identity, role: '', month: saToday().slice(0, 7), page: 'query', filters: {}, expanded: {}, paperTargets: {}, data: null, loading: false, busy: false, sequence: saState.sequence + 1, message: '', error: false, action: null, draft: {}, submitKey: '' });
}
function saHelp() {
    return `<details class="sa-help"><summary>借支申請操作說明</summary><ol><li>在活動開放期間填入整數新臺幣金額，核對後送交管理部；不經主管審核，也不開放主管代辦。</li><li>每月有效筆數只計待審及已核准申請；退回、撤回及取消不占有效筆數。未過截止時間時可重新送出。</li><li>待審申請可自行撤回；已核准需聯絡管理部。既有申請保留送件時的活動規則，不因後續設定變更而自動改額。管理者代為紙本核准補登的紀錄也會顯示於你的登記月份，並標示「補登記」。</li><li>管理部核准只表示申請通過，實際發放與薪資扣回須依公司後續作業；此頁不會發放款項或扣薪。</li><li>管理者總表包含各狀態明細，核准總額排除已取消申請；ERP 可讀取修訂與取消紀錄，管理部仍須核對實際發放。</li></ol></details>`;
}
function saSubmission() {
    const data = saState.data, rules = data.settings, window = data.window, enabled = window.isOpen;
    return `<section class="sa-card"><h4>本月借支申請</h4><p>${saEsc(window.applicationMonth)} 登記期間：<strong>${saEsc(window.opensOn)} 至 ${saEsc(window.closesOn)} 23:59（臺北時間）</strong></p><p>單筆上限 ${saMoney(rules.maxAmount)}；每月待審與核准合計上限 ${rules.maxActivePerMonth ?? '待設定'} 筆。${rules.deductionMonthOffset == null ? '扣回月份由管理部另行確認。' : `預計於申請月後 ${rules.deductionMonthOffset} 個月扣回，實際發放仍須確認。`}</p>
        ${enabled ? `<form data-sa-form="submit"><div class="sa-grid">${saInput('申請金額（新臺幣元）', 'requestedAmount', saState.draft.requestedAmount || '', 'number', `required min="1" max="${rules.maxAmount}" step="1" inputmode="numeric"`)}${saNote('申請備註（選填）', 'note', saState.draft.note || '')}</div><p class="sa-note">請確認金額及活動規則；送出後由管理部審核。</p><button class="primary-btn" type="submit">送交管理部審核</button></form>` : `<p class="sa-notice">${rules.enabled ? '目前不在開放登記期間。' : '目前借支活動尚未啟用，請聯絡管理部。'}</p>`}</section>`;
}
function saSettings() {
    if (!saCan('settings')) return '';
    const s = saState.data.settings, draft = saState.draft.settings || s;
    return `<section class="sa-card"><h4>活動設定</h4><p>每月依下列日期開放；月份沒有指定日期時，採該月最後一天。金額及筆數未設定前不可啟用。修改只影響之後新送出的申請。</p>
        <form data-sa-form="settings"><label class="sa-check"><input type="checkbox" name="enabled" ${draft.enabled ? 'checked' : ''}>啟用每月借支登記</label><div class="sa-grid">${saInput('每月開始日', 'startDay', draft.startDay, 'number', 'required min="1" max="31" step="1"')}${saInput('每月截止日（含當日）', 'endDay', draft.endDay, 'number', 'required min="1" max="31" step="1"')}${saInput('單筆金額上限（新臺幣元）', 'maxAmount', draft.maxAmount ?? '', 'number', 'min="1" max="1000000000" step="1" placeholder="請填已確認的公司上限"')}${saInput('每月有效申請筆數上限', 'maxActivePerMonth', draft.maxActivePerMonth ?? '', 'number', 'min="1" max="12" step="1" placeholder="請填已確認筆數"')}<label class="field"><span>預計扣回月份</span><select name="deductionMonthOffset">${[['', '尚待確認'], ...Array.from({ length: 13 }, (_, n) => [String(n), n === 0 ? '申請當月' : `申請月後 ${n} 個月`])].map(([value, label]) => `<option value="${value}" ${String(draft.deductionMonthOffset ?? '') === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>${saNote('設定原因', 'reason', draft.reason || '', true)}</div><button class="primary-btn" type="submit">儲存活動設定</button></form></section>`;
}
function saActionForm() {
    if (!saState.action) return '';
    if (saState.action.kind === 'paper') {
        const { employeeId, employeeName, applicationMonth, requestedAmount, note, requestId } = saState.action;
        return `<dialog class="sa-dialog" aria-labelledby="sa-dialog-title"><h4 id="sa-dialog-title">確認${requestId ? '修改' : '新增'}紙本核准補登</h4><p>${saEsc(employeeId)} ${saEsc(employeeName)} · ${saEsc(applicationMonth)}</p><p class="sa-confirm-amount">${saMoney(requestedAmount)}</p><p>${saEsc(note || '未填寫備註')}</p><p class="sa-note">儲存後直接列為「補登記」，員工可在自己的登記月份查看；每次異動都保留操作紀錄。核准不代表已發放。</p><form data-sa-form="paper-confirm"><div class="sa-actions"><button class="primary-btn" type="submit">確認儲存</button>${saButton('dismiss', '返回修改')}</div></form></dialog>`;
    }
    const { kind, requestId } = saState.action, row = saState.data.requests.find((r) => r.requestId === requestId);
    if (!row) return '';
    const label = { review: '管理部審核', withdraw: '撤回申請', cancel: '取消申請' }[kind];
    const saved = saState.draft.action, draft = saved?.kind === kind && saved?.requestId === requestId ? saved.values : {};
    const decision = draft.decision || 'approved';
    return `<dialog class="sa-dialog sa-decision" aria-labelledby="sa-dialog-title"><h4 id="sa-dialog-title">${label}：${saEsc(row.employeeId)} ${saEsc(row.employeeName)}</h4><p>申請 ${saMoney(row.requestedAmount)} · ${saEsc(row.applicationMonth)} · ${saEsc(row.requestId)}</p><form data-sa-form="${kind}" data-sa-id="${saEsc(requestId)}" data-sa-revision="${row.revision}"><div class="sa-grid">${kind === 'review' ? `<label class="field"><span>審核結果</span><select name="decision"><option value="approved" ${decision === 'approved' ? 'selected' : ''}>核准</option><option value="rejected" ${decision === 'rejected' ? 'selected' : ''}>退回</option></select></label>${saInput('核准金額（退回時不使用）', 'approvedAmount', draft.approvedAmount ?? row.requestedAmount, 'number', `min="1" max="${row.requestedAmount}" step="1"`)}` : ''}${saNote(kind === 'review' ? '審核說明（選填）' : '操作原因', 'reason', draft.reason || '', kind !== 'review')}</div>${kind === 'cancel' ? '<p class="sa-notice">若 ERP 已入借支帳或薪資，取消來源申請後仍須在 ERP 核對差異，不會自動沖回已發放款項。</p>' : ''}<div class="sa-actions"><button class="primary-btn" type="submit">確認${label}</button>${saButton('dismiss', '返回')}</div></form></dialog>`;
}
function saRequests(rows = saState.data.requests) {
    if (!rows.length) return `<p class="sa-empty">${!saOwn() && saState.page === 'review' ? saFilter().status === 'pending_admin' ? '目前篩選條件下沒有待複核申請。' : '目前篩選條件下沒有申請。' : '此月份尚無借支申請。'}</p>`;
    return `<div class="sa-table-wrap"><table class="sa-table"><thead><tr>${saOwn() ? '' : '<th>員工</th>'}<th>月份／單號</th><th>申請／核准金額</th><th>狀態</th><th>說明／時間</th><th>操作</th></tr></thead><tbody>${rows.map((r) => `<tr>${saOwn() ? '' : `<td>${saEsc(r.employeeId)} ${saEsc(r.employeeName)}<small>${saEsc(r.department)}</small></td>`}<td>${saEsc(r.applicationMonth)}<small>${saEsc(r.requestId)}</small><small>扣回月份：${saEsc(r.deductionMonth || '待確認')}</small></td><td>${saMoney(r.requestedAmount)}<small>核准：${saMoney(r.approvedAmount)}</small></td><td>${saPill(r)}${saPaper(r) ? '<small>來源：紙本核准補登</small>' : ''}${r.status === 'approved' ? '<small>核准不表示已發放</small>' : ''}</td><td>${r.status === 'cancelled' ? `<div>取消原因：${saEsc(r.cancellationReason)}</div>` : ''}${r.status === 'withdrawn' ? `<div>撤回原因：${saEsc(r.withdrawalReason)}</div>` : ''}${r.reviewNote ? `<div>審核說明：${saEsc(r.reviewNote)}</div>` : ''}${r.note ? `<div>申請備註：${saEsc(r.note)}</div>` : ''}<small>送出 ${saEsc(saTime(r.submittedAt))}</small><small>更新 ${saEsc(saTime(r.updatedAt))} · v${r.revision}</small></td><td><div class="sa-actions">${saOwn() && r.status === 'pending_admin' ? saButton('withdraw', '撤回', `data-sa-id="${saEsc(r.requestId)}"`) : ''}${!saOwn() && saCan('review') && r.status === 'pending_admin' ? saButton('review', '審核', `data-sa-id="${saEsc(r.requestId)}"`, true) : ''}${!saOwn() && saCan('review') && ['pending_admin', 'approved'].includes(r.status) ? saButton('cancel', '取消', `data-sa-id="${saEsc(r.requestId)}"`) : ''}</div></td></tr>`).join('')}</tbody></table></div>`;
}
function saPill(row) {
    if (!row) return '<span class="sa-status sa-status-none">無申請</span>';
    const amount = row.status === 'approved' ? row.approvedAmount : (row.approvedAmount ?? row.requestedAmount);
    return `<span class="sa-status sa-status-${saEsc(row.status)}">${saEsc(saRowStatus(row))} ${saMoney(amount)}</span>`;
}
function saFilter() {
    return saState.filters[saState.page] ||= { department: '', search: '', status: saState.page === 'review' ? 'pending_admin' : '' };
}
function saMatchesStatus(row, status) {
    if (!status) return true;
    if (status === 'has_application') return Boolean(row);
    if (!row) return status === 'none';
    if (status === 'paper') return row.status === 'approved' && saPaper(row);
    if (status === 'approved') return row.status === 'approved' && !saPaper(row);
    if (status === 'cancelled') return ['cancelled', 'withdrawn'].includes(row.status);
    return row.status === status;
}
function saAllEmployees() {
    const employees = new Map((saState.data.employees || []).map((e) => [e.id, e]));
    // Preserve historical requests even if an employee was later removed from the roster.
    for (const row of saState.data.requests) if (!employees.has(row.employeeId)) employees.set(row.employeeId, { id: row.employeeId, name: row.employeeName, department: row.department, historical: true });
    return [...employees.values()].sort((a, b) => String(a.id).localeCompare(String(b.id), 'zh-TW', { numeric: true }));
}
function saEmployeeMatches(employee) {
    const filter = saFilter(), query = filter.search.trim().toLocaleLowerCase();
    return (!filter.department || employee.department === filter.department) && (!query || `${employee.id} ${employee.name} ${employee.department || ''}`.toLocaleLowerCase().includes(query));
}
function saEmployeeRows(employeeId) {
    const time = (row) => Number(new Date(row.createdAt || row.submittedAt || row.updatedAt || 0)) || 0;
    return saState.data.requests.filter((row) => row.employeeId === employeeId).sort((a, b) => time(b) - time(a) || String(b.requestId).localeCompare(String(a.requestId)));
}
function saFilteredRoster() {
    const filter = saFilter();
    return saAllEmployees().filter((e) => {
        const rows = saEmployeeRows(e.id);
        return saEmployeeMatches(e) && saMatchesStatus(rows[0], filter.status);
    });
}
function saFilterBar(paper = false) {
    const filter = saFilter(), departments = [...new Set(saAllEmployees().map((e) => e.department).filter(Boolean))].sort();
    const options = [['', '全部狀態'], ...(saState.page !== 'review' ? [['has_application', '有申請紀錄'], ['none', '無申請']] : []), ['pending_admin', '待複核'], ['approved', '已複核'], ['paper', '補登記'], ['rejected', '已退回'], ['cancelled', '已取消／員工撤回']];
    return `<form data-sa-form="filters" class="sa-filters">${saInput(paper ? '補登月份' : '登記月份', 'applicationMonth', saState.month, 'month', 'required min="2020-01" max="2100-12"')}<label class="field"><span>部門</span><select name="department"><option value="">全部部門</option>${departments.map((d) => `<option value="${saEsc(d)}" ${filter.department === d ? 'selected' : ''}>${saEsc(d)}</option>`).join('')}</select></label>${saInput('員工工號／姓名', 'search', filter.search, 'search', 'placeholder="搜尋人員"')}<label class="field"><span>申請狀態</span><select name="status">${options.map(([value, label]) => `<option value="${value}" ${filter.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><div class="sa-actions"><button class="primary-btn" type="submit">查詢</button>${saButton('reset-filters', '重設')}</div></form>`;
}
function saHistory(rows) {
    return rows.map((r) => `<div class="sa-record-detail"><strong>${saEsc(saRowStatus(r))} · 申請 ${saMoney(r.requestedAmount)}${r.approvedAmount == null ? '' : `／核准 ${saMoney(r.approvedAmount)}`}</strong><small>申請單號 ${saEsc(r.requestId)} · v${r.revision}</small><small>送出 ${saEsc(saTime(r.submittedAt || r.createdAt))} · 更新 ${saEsc(saTime(r.updatedAt))}</small>${r.note ? `<small>備註：${saEsc(r.note)}</small>` : ''}${r.reviewNote ? `<small>審核：${saEsc(r.reviewNote)}</small>` : ''}${r.cancellationReason || r.withdrawalReason ? `<small>取消：${saEsc(r.cancellationReason || r.withdrawalReason)}</small>` : ''}</div>`).join('');
}
function saRosterTable() {
    const employees = saFilteredRoster(), expandable = employees.filter((e) => saEmployeeRows(e.id).length), allExpanded = expandable.length && expandable.every((e) => saState.expanded[`${saState.month}/${e.id}`]);
    return `<div class="sa-roster-toolbar"><p class="sa-note">共 ${employees.length} 位人員；每人顯示最新一筆申請。點選人員可查看當月歷次明細。</p>${saButton('toggle-all-details', allExpanded ? '全部收合明細' : '全部展開明細', expandable.length ? '' : 'disabled')}</div><div class="sa-table-wrap"><table class="sa-table sa-roster-table"><thead><tr><th>工號／姓名</th><th>部門</th><th>本月申請狀態</th><th>更新日期</th><th>紀錄明細</th></tr></thead><tbody>${employees.map((e) => {
        const rows = saEmployeeRows(e.id), latest = rows[0], expanded = Boolean(saState.expanded[`${saState.month}/${e.id}`]), detailId = `sa-history-${encodeURIComponent(e.id)}`;
        return `<tr data-sa-person="${saEsc(e.id)}"><td>${rows.length ? saButton('toggle-details', `${e.id} ${e.name}`, `data-sa-employee="${saEsc(e.id)}" aria-expanded="${expanded}" aria-controls="${saEsc(detailId)}"`) : `${saEsc(e.id)} ${saEsc(e.name)}`}${saEmployeeNote(e)}</td><td>${saEsc(e.department || '—')}</td><td>${saPill(latest)}</td><td class="sa-date-cell">${saEsc(saTime(latest?.updatedAt))}</td><td>${rows.length ? saButton('toggle-details', `${expanded ? '收合' : '查看'} ${rows.length} 筆紀錄`, `data-sa-employee="${saEsc(e.id)}" aria-expanded="${expanded}" aria-controls="${saEsc(detailId)}"`) : '尚無登記紀錄'}</td></tr>${expanded && rows.length ? `<tr id="${saEsc(detailId)}" class="sa-history-row"><td colspan="5">${saHistory(rows)}</td></tr>` : ''}`;
    }).join('') || '<tr><td colspan="5" class="sa-empty">沒有符合條件的人員。</td></tr>'}</tbody></table></div>`;
}
function saEmployeeNote(employee) {
    return employee.terminationDate ? `<small>離職日 ${saEsc(employee.terminationDate)}</small>` : employee.historical ? '<small>歷史人員</small>' : '';
}
function saPaperKey(employeeId, requestId = '') { return `${saState.month}/${employeeId}/${requestId}`; }
function saPaperTable() {
    const employees = saFilteredRoster();
    return `<p class="sa-note">每人一列。填寫金額與備註後確認儲存；切換「編輯紀錄」可修正既有補登，版本與操作紀錄持續保留。新增仍須符合活動金額及每月筆數上限。</p><div class="sa-table-wrap"><table class="sa-table sa-paper-table"><thead><tr><th>工號／姓名</th><th>本月申請狀態</th><th>編輯紀錄／版本</th><th>補登金額</th><th>備註</th><th>儲存</th><th>更新日期</th></tr></thead><tbody>${employees.map((e) => {
        const rows = saEmployeeRows(e.id), papers = rows.filter((r) => saPaper(r) && r.status === 'approved');
        const targetKey = `${saState.month}/${e.id}`, selected = saState.paperTargets[targetKey];
        const row = selected === '' ? null : papers.find((r) => r.requestId === selected) || papers[0] || null;
        const requestId = row?.requestId || '', key = saPaperKey(e.id, requestId), draft = saState.draft.paper?.[key] || {}, formId = `sa-paper-${encodeURIComponent(e.id)}`;
        return `<tr><td>${saEsc(e.id)} ${saEsc(e.name)}<small>${saEsc(e.department || '—')}</small>${saEmployeeNote(e)}</td><td>${saPill(rows[0])}${rows.length > 1 ? `<small>當月共 ${rows.length} 筆紀錄</small>` : ''}</td><td>${papers.length ? `<select aria-label="${saEsc(e.id)} 編輯紀錄與版本" data-sa-paper-target data-sa-employee="${saEsc(e.id)}"><option value="" ${!row ? 'selected' : ''}>新增另一筆補登</option>${papers.map((r) => `<option value="${saEsc(r.requestId)}" ${r.requestId === requestId ? 'selected' : ''}>v${r.revision} · ${saMoney(r.approvedAmount)} · ${saEsc(r.requestId)}</option>`).join('')}</select>` : '<span class="sa-note">新增補登</span>'}</td><td><input aria-label="${saEsc(e.id)} 補登金額（元）" form="${saEsc(formId)}" name="requestedAmount" type="number" value="${saEsc(draft.requestedAmount ?? row?.requestedAmount ?? '')}" required min="1" max="${row?.rulesSnapshot?.maxAmount || saState.data.settings.maxAmount || 1000000000}" step="1" inputmode="numeric"></td><td><input aria-label="${saEsc(e.id)} 補登備註（選填）" form="${saEsc(formId)}" name="note" maxlength="500" value="${saEsc(draft.note ?? row?.note ?? '')}"></td><td><form id="${saEsc(formId)}" data-sa-form="paper" data-sa-employee="${saEsc(e.id)}" data-sa-id="${saEsc(requestId)}" data-sa-revision="${row?.revision || ''}" class="sa-paper-form"><button class="primary-btn" type="submit">${row ? '確認修改儲存' : '確認儲存'}</button></form></td><td class="sa-date-cell">${saEsc(saTime(row?.updatedAt))}</td></tr>`;
    }).join('') || '<tr><td colspan="7" class="sa-empty">沒有符合條件的人員。</td></tr>'}</tbody></table></div>`;
}
function saAdminSummary() {
    const data = saState.data, roster = saFilteredRoster(), people = new Set(roster.map((e) => e.id));
    const rows = data.requests.filter((r) => people.has(r.employeeId)), summary = data.summary;
    let items;
    if (saState.page === 'review') items = [['本月申請筆數', summary.count], ['本月待複核', summary.pendingCount], ['有效申請金額', saMoney(summary.requestedAmount)], ['已複核合計', saMoney(summary.approvedAmount)]];
    else if (saState.page === 'paper') {
        const papers = rows.filter((r) => saPaper(r) && r.status === 'approved');
        items = [['篩選人員', roster.length], ['已補登人數', new Set(papers.map((r) => r.employeeId)).size], ['有效補登筆數', papers.length], ['有效補登金額', saMoney(papers.reduce((sum, r) => sum + r.approvedAmount, 0))]];
    } else items = [['篩選人員', roster.length], ['有申請紀錄', new Set(rows.map((r) => r.employeeId)).size], ['無申請人數', roster.filter((e) => !saEmployeeRows(e.id).length).length], ['已複核合計', saMoney(rows.filter((r) => r.status === 'approved').reduce((sum, r) => sum + r.approvedAmount, 0))]];
    return `<div class="sa-summary" aria-label="${saEsc(saState.month)} ${saState.page === 'review' ? '當月完整申請統計' : '目前人員篩選統計'}">${items.map(([label, value]) => `<span>${saEsc(label)}<strong>${saEsc(value)}</strong></span>`).join('')}</div>`;
}
function saAdminContent() {
    const data = saState.data, pages = [['query', '查看登記月份'], ...(saCan('review') ? [['review', '管理部待複核']] : []), ...(saCan('paper') ? [['paper', '紙本核准補登']] : []), ...(saCan('settings') ? [['settings', '活動設定']] : [])];
    if (!pages.some(([id]) => id === saState.page)) saState.page = 'query';
    let content = '';
    if (saState.page === 'settings') content = saSettings();
    else {
        const title = pages.find(([id]) => id === saState.page)[1];
        content = `<section class="sa-card"><div class="sa-header"><h4>${title}</h4>${saCan('export') && saState.page !== 'paper' ? saButton('export', '下載 Excel 總表及明細') : ''}</div>${saFilterBar(saState.page === 'paper')}`;
        if (saState.page === 'query') content += saRosterTable();
        else if (saState.page === 'paper') content += saPaperTable();
        else {
            const filter = saFilter(), rows = data.requests.filter((r) => saEmployeeMatches({ id: r.employeeId, name: r.employeeName, department: r.department }) && saMatchesStatus(r, filter.status));
            content += `<p class="sa-note">預設列出待複核申請；切換「全部狀態」可查看並取消已複核或補登紀錄。審核說明可不填，取消時須填操作原因。</p>${saRequests(rows)}`;
        }
        content += '</section>';
    }
    return `<div class="workspace-subnav-layout"><aside class="workspace-subnav-sidebar" aria-label="借支管理子導覽"><div class="workspace-subnav-card"><div class="workspace-subnav-group"><p class="workspace-subnav-group-title">借支申請管理</p><div class="workspace-subnav-items">${pages.map(([id, label]) => `<button type="button" class="workspace-subnav-item ${saState.page === id ? 'is-active' : ''}" data-sa-action="page" data-sa-page="${id}" aria-current="${saState.page === id ? 'page' : 'false'}"><span>${label}</span>${id === 'review' ? `<span class="workspace-subnav-badge">${data.summary.pendingCount}</span>` : ''}</button>`).join('')}</div></div></div></aside><section class="workspace-subnav-content">${saState.page === 'settings' ? '' : saAdminSummary()}${content}</section></div>`;
}
function renderSalaryAdvanceWorkspace(role) {
    const nextRole = role || state.dashboard?.role || 'employee';
    const identity = `${state.token}/${nextRole}/${state.dashboard?.user?.id || ''}`;
    if (saState.identity !== identity) { saReset(identity); saState.role = nextRole; }
    const data = saState.data;
    return `<section id="salary-advance-workspace" class="sa-workspace" aria-label="借支申請"><div class="sa-header">${saOwn() ? '<div><h3>借支申請</h3><p>員工登記 → 管理部審核 → 後續發放核對</p></div>' : '<p class="sa-note">查詢登記、管理部複核及紙本補登分開處理。</p>'}${saButton('refresh', '重新整理')}</div><div class="sa-message ${saState.error ? 'sa-error' : ''}" role="status" aria-live="polite">${saEsc(saState.message)}</div>${saOwn() ? saHelp() : ''}${!data ? `<p>${saState.loading || !saState.error ? '正在讀取借支申請…' : '無法讀取此月份，請重新整理。'}</p>` : saOwn() ? `${saSubmission()}<section class="sa-card"><div class="sa-toolbar">${saInput('查看登記月份', 'applicationMonth', saState.month, 'month', 'data-sa-month min="2020-01" max="2100-12"')}</div>${saRequests()}</section>` : saAdminContent()}${data ? saActionForm() : ''}</section>`;
}
function saPaint() {
    const root = document.getElementById('salary-advance-workspace');
    if (root) { root.outerHTML = renderSalaryAdvanceWorkspace(saState.role); saBusy(saState.busy); saMountDialog(); }
}
function saMountDialog() {
    const dialog = document.querySelector('#salary-advance-workspace .sa-dialog');
    if (dialog && !dialog.open) dialog.showModal();
    if (dialog && saState.error) {
        const message = document.createElement('p'); message.className = 'sa-message sa-error'; message.setAttribute('role', 'alert'); message.textContent = saState.message; dialog.prepend(message);
    }
}
function saBusy(value) {
    saState.busy = value;
    document.querySelectorAll('#salary-advance-workspace button, #salary-advance-workspace input, #salary-advance-workspace textarea, #salary-advance-workspace select').forEach((node) => { node.disabled = value; });
}
async function saLoad() {
    const sequence = ++saState.sequence, identity = saState.identity, month = saState.month;
    saState.loading = true;
    try {
        const data = await requestJson(`${saRootApi()}?applicationMonth=${encodeURIComponent(month)}`, { auth: true });
        if (sequence !== saState.sequence || identity !== saState.identity) return;
        saState.data = data;
    } catch (error) {
        if (sequence !== saState.sequence || identity !== saState.identity) return;
        saState.message = error.message || '讀取失敗，請重新整理。'; saState.error = true;
    } finally {
        if (sequence === saState.sequence && identity === saState.identity) { saState.loading = false; saPaint(); }
    }
}
const saPreviousPostRender = postRenderSetup;
postRenderSetup = function setupSalaryAdvances() {
    saPreviousPostRender();
    if (document.getElementById('salary-advance-workspace') && !saState.data && !saState.loading) saLoad();
    saMountDialog();
};
const saPreviousLogout = handleLogout;
handleLogout = function logoutSalaryAdvances(...args) { saReset(); return saPreviousLogout(...args); };
const saPreviousDashboard = renderDashboard;
renderDashboard = function renderSalaryAdvanceIdentity(dashboard) {
    const role = dashboard?.role || '';
    if (saState.identity && saState.identity !== `${state.token}/${role}/${dashboard?.user?.id || ''}`) saReset();
    return saPreviousDashboard(dashboard);
};
document.addEventListener('input', (event) => {
    const form = event.target.closest('[data-sa-form]') || event.target.form;
    if (!form?.dataset.saForm || saState.busy) return;
    if (form.dataset.saForm === 'submit') {
        saState.draft.requestedAmount = form.elements.requestedAmount.value;
        saState.draft.note = form.elements.note.value;
        saState.submitKey = '';
    } else if (form.dataset.saForm === 'settings') {
        saState.draft.settings = Object.fromEntries(new FormData(form));
        saState.draft.settings.enabled = form.elements.enabled.checked;
        saState.draft.settingsRevision ??= saState.data.settings.revision;
    } else if (form.dataset.saForm === 'paper') {
        const key = saPaperKey(form.dataset.saEmployee, form.dataset.saId);
        saState.draft.paper ||= {};
        saState.draft.paper[key] = { ...Object.fromEntries(new FormData(form)), revision: Number(form.dataset.saRevision), idempotencyKey: '' };
    } else if (['review', 'withdraw', 'cancel'].includes(form.dataset.saForm)) {
        saState.draft.action = { kind: form.dataset.saForm, requestId: form.dataset.saId, values: Object.fromEntries(new FormData(form)) };
    }
});
document.addEventListener('change', async (event) => {
    if (event.target.matches('[data-sa-paper-target]') && !saState.busy) {
        saState.paperTargets[`${saState.month}/${event.target.dataset.saEmployee}`] = event.target.value; saPaint(); return;
    }
    if (!event.target.matches('[data-sa-month]') || saState.busy) return;
    if (!/^\d{4}-\d{2}$/.test(event.target.value)) return;
    saState.month = event.target.value; saState.action = null; saState.data = null; saPaint(); await saLoad();
});
document.addEventListener('cancel', (event) => {
    if (!event.target.matches('#salary-advance-workspace .sa-dialog')) return;
    event.preventDefault();
    if (!saState.busy) { saState.action = null; delete saState.draft.action; saPaint(); }
}, true);
document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-sa-action]');
    if (!button || saState.busy) return;
    const action = button.dataset.saAction;
    if (action === 'toggle-details') { const key = `${saState.month}/${button.dataset.saEmployee}`; saState.expanded[key] = !saState.expanded[key]; saPaint(); return; }
    if (action === 'toggle-all-details') { const employees = saFilteredRoster().filter((e) => saEmployeeRows(e.id).length), expand = !employees.every((e) => saState.expanded[`${saState.month}/${e.id}`]); employees.forEach((e) => { saState.expanded[`${saState.month}/${e.id}`] = expand; }); saPaint(); return; }
    if (action === 'page') { saState.page = button.dataset.saPage; saState.action = null; saState.message = ''; saState.error = false; saPaint(); return; }
    if (action === 'reset-filters') { delete saState.filters[saState.page]; saPaint(); return; }
    if (action === 'refresh') { saState.message = ''; saState.error = false; await saLoad(); return; }
    if (action === 'dismiss') { saState.action = null; delete saState.draft.action; saPaint(); return; }
    if (['review', 'withdraw', 'cancel'].includes(action)) { saState.action = { kind: action, requestId: button.dataset.saId }; delete saState.draft.action; saState.message = ''; saState.error = false; saPaint(); return; }
    if (action !== 'export') return;
    const identity = saState.identity; saBusy(true);
    try {
        const response = await fetch(`/api/browser/salary-advances/export?applicationMonth=${encodeURIComponent(saState.month)}`, { headers: { Authorization: `Bearer ${state.token}` } });
        if (!response.ok) { const result = await response.json(); throw new Error(result.error || '匯出失敗。'); }
        const blob = await response.blob();
        if (identity !== saState.identity) return;
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = `借支申請總表-${saState.month}.xlsx`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        saState.message = '已下載借支總表及明細；內容不代表已發放或已扣薪。'; saState.error = false;
    } catch (error) { if (identity === saState.identity) { saState.message = error.message; saState.error = true; } }
    finally { if (identity === saState.identity) { saBusy(false); saPaint(); } }
});
document.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-sa-form]');
    if (!form) return;
    event.preventDefault(); if (saState.busy) return;
    let operation = form.dataset.saForm;
    const values = Object.fromEntries(new FormData(form)), identity = saState.identity;
    if (operation === 'filters') {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(values.applicationMonth)) return;
        saState.filters[saState.page] = { department: values.department || '', search: values.search || '', status: values.status || '' };
        if (values.applicationMonth !== saState.month) {
            saState.month = values.applicationMonth; saState.data = null; saState.action = null; saState.error = false; saState.message = ''; saPaint(); await saLoad();
        } else saPaint();
        return;
    }
    if (operation === 'paper') {
        if (!saCan('paper') || saOwn()) return;
        const employee = saAllEmployees().find((e) => e.id === form.dataset.saEmployee), key = saPaperKey(form.dataset.saEmployee, form.dataset.saId);
        if (!employee) return;
        saState.draft.paper ||= {};
        const oldDraft = saState.draft.paper[key] || {};
        const draft = saState.draft.paper[key] = { ...oldDraft, ...values, revision: oldDraft.revision ?? Number(form.dataset.saRevision) };
        try { if (!form.dataset.saId) draft.idempotencyKey ||= saNewSubmissionKey(); }
        catch (error) { saState.message = error.message; saState.error = true; saPaint(); return; }
        saState.action = { kind: 'paper', employeeId: employee.id, employeeName: employee.name, applicationMonth: saState.month, requestId: form.dataset.saId || '', revision: draft.revision, requestedAmount: Number(values.requestedAmount), note: values.note || '', idempotencyKey: draft.idempotencyKey, key };
        saState.error = false; saState.message = ''; saPaint(); return;
    }
    let body;
    let savedPaper = null;
    if (operation === 'paper-confirm') {
        if (saState.action?.kind !== 'paper' || !saCan('paper') || saOwn()) return;
        savedPaper = { ...saState.action };
        operation = savedPaper.requestId ? 'paper-approved/correct' : 'paper-approved';
        body = savedPaper.requestId ? { requestId: savedPaper.requestId, revision: savedPaper.revision, requestedAmount: savedPaper.requestedAmount, note: savedPaper.note, confirm: true } : { employeeId: savedPaper.employeeId, applicationMonth: savedPaper.applicationMonth, requestedAmount: savedPaper.requestedAmount, note: savedPaper.note, idempotencyKey: savedPaper.idempotencyKey, confirm: true };
    } else if (operation === 'submit') {
        try { saState.submitKey ||= saNewSubmissionKey(); } catch (error) { saState.message = error.message; saState.error = true; saPaint(); return; }
        body = { requestedAmount: Number(values.requestedAmount), note: values.note, applicationMonth: saState.data.window.applicationMonth, idempotencyKey: saState.submitKey };
    } else if (operation === 'settings') {
        const optional = (name) => values[name] === '' ? null : Number(values[name]);
        body = { revision: saState.draft.settingsRevision ?? saState.data.settings.revision, enabled: form.elements.enabled.checked, startDay: Number(values.startDay), endDay: Number(values.endDay), maxAmount: optional('maxAmount'), maxActivePerMonth: optional('maxActivePerMonth'), deductionMonthOffset: optional('deductionMonthOffset'), reason: values.reason };
    } else {
        saState.draft.action = { kind: operation, requestId: form.dataset.saId, values };
        body = { requestId: form.dataset.saId, revision: Number(form.dataset.saRevision), reason: values.reason };
        if (operation === 'review') { body.decision = values.decision; if (values.decision === 'approved') body.approvedAmount = Number(values.approvedAmount); }
    }
    saBusy(true);
    try {
        const result = await requestJson(`${saRootApi()}/${operation}`, { method: 'POST', auth: true, body });
        if (identity !== saState.identity) return;
        saState.message = result.message || '已完成。'; saState.error = false; saState.action = null;
        if (savedPaper) {
            delete saState.draft.paper[savedPaper.key];
            if (result.request?.requestId) saState.paperTargets[`${savedPaper.applicationMonth}/${savedPaper.employeeId}`] = result.request.requestId;
        } else if (operation === 'submit') { delete saState.draft.requestedAmount; delete saState.draft.note; saState.submitKey = ''; saState.month = saState.data.window.applicationMonth; }
        else if (operation === 'settings') { delete saState.draft.settings; delete saState.draft.settingsRevision; }
        else delete saState.draft.action;
        await saLoad();
    } catch (error) { if (identity === saState.identity) { saState.message = error.message || '作業失敗，請重新整理後再試。'; saState.error = true; } }
    finally { if (identity === saState.identity) { saBusy(false); saPaint(); } }
});
