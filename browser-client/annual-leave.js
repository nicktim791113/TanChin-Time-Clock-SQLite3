/* Annual leave uses server calculations and exact strings; the UI never recomputes rights. */
const alToday = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const alState = { identity: '', open: false, data: null, permissions: {}, tab: 'overview', year: Number(alToday().slice(0, 4)), asOf: alToday(), loading: false, busy: false, sequence: 0, message: '', messageType: '', preview: null, previewKind: '', previewInput: null, idempotencyKey: '', drafts: {}, selected: [], search: '', department: '', dirty: false };
const alKind = (value) => ({grant:'年資給假',rounding:'進位加給',opening:'期初接管',carry:'協商遞延',adjustment:'人工調整',correction:'精確調整',used:'核准扣抵',held:'待審預占',carry_in:'遞延轉入',carry_out:'遞延轉出',wage_pending:'待未休工資處理',rounding_delta:'進位差額',release:'釋放預占'}[value] || value || '');
const alTime = (value) => typeof value === 'number' ? new Date(value).toLocaleString('zh-TW', {timeZone:'Asia/Taipei',hour12:false}) : value;
const alEsc = (value) => escapeHtml(String(value ?? ''));
const alPermissions = ['admin.leave.entitlements.policy.manage', 'admin.leave.entitlements.grant', 'admin.leave.entitlements.close'];
const alCanOpen = () => state.dashboard?.role === 'system_admin' || ['admin.leave.balances.view', 'admin.leave.balances.manage', ...alPermissions].some(hasCurrentAdminPermission);
const alCanOldBalance = () => state.dashboard?.role === 'system_admin' || ['admin.leave.balances.view', 'admin.leave.balances.manage'].some(hasCurrentAdminPermission);
const alCan = (name) => Boolean(alState.permissions[name]);
const alButton = (action, label, attrs = '', primary = false) => `<button type="button" class="${primary ? 'primary' : 'outline'}-btn" data-al-action="${action}" ${attrs}>${alEsc(label)}</button>`;
const alField = (label, name, value = '', type = 'text', attrs = '') => `<label class="field"><span>${alEsc(label)}</span><input name="${name}" type="${type}" value="${alEsc(value && typeof value === 'object' ? alFraction(value).replace(/\s/g, '') : value)}" ${attrs}></label>`;
const alSelect = (label, name, value, options, attrs = '') => `<label class="field"><span>${alEsc(label)}</span><select name="${name}" ${attrs}>${options.map(([id, text]) => `<option value="${alEsc(id)}" ${String(id) === String(value) ? 'selected' : ''}>${alEsc(text)}</option>`).join('')}</select></label>`;
const alText = (label, name, value = '', attrs = '') => `<label class="field al-wide"><span>${alEsc(label)}</span><textarea name="${name}" rows="3" ${attrs}>${alEsc(value)}</textarea></label>`;
const alCheck = (name, label, checked = false) => `<label class="al-check"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''} required>${alEsc(label)}</label>`;
const alEmpty = (text) => `<div class="al-empty">${alEsc(text)}</div>`;
function alExact(value) {
    if (value == null || value === '') return '—';
    if (typeof value !== 'object') return String(value);
    if (value.decimal != null) return String(value.decimal);
    if (value.numerator != null && value.denominator != null) return `${value.numerator}/${value.denominator}`;
    return String(value.value ?? '—');
}
function alFraction(value) { return value && typeof value === 'object' && value.numerator != null ? `${value.numerator} / ${value.denominator}` : alExact(value); }
function alFacts(entries) { return `<dl class="al-facts">${entries.map(([title, value]) => `<div><dt>${alEsc(title)}</dt><dd>${alEsc(alExact(value))}</dd></div>`).join('')}</dl>`; }
function alWarnings(warnings = []) { return warnings.length ? `<div class="al-warning">${warnings.map((w) => alEsc(typeof w === 'string' ? w : w.message || w.code)).join('<br>')}</div>` : ''; }
function alEmployees() { return alState.data?.employees || []; }
function alPerson(id) { const person = alEmployees().find((p) => (p.employeeId || p.id) === id); return person ? `${id} ${person.name || ''}` : id || ''; }
function alEmployeeOptions() { return [['', '請選擇員工'], ...alEmployees().map((e) => [e.employeeId || e.id, `${e.employeeId || e.id} ${e.name || ''}`])]; }
function alServiceDraft(employeeId) {
    const service = (alState.data?.services || []).find((s) => s.employeeId === employeeId) || {}, employee = alEmployees().find((p) => (p.id || p.employeeId) === employeeId) || {};
    return { ...service, serviceEffectiveFrom: '', employeeId, serviceDate: service.serviceDate || employee.hire_date || '', excludedPeriodsText: (service.excludedPeriods || []).map((p) => `${p.start},${p.end},${p.reason}`).join('\n'), reason: '' };
}
function alPolicyOptions() { return [['', '請選擇制度版本'], ...(alState.data?.policies || []).map((p) => [p.id, `${p.name || p.label || p.id} · ${p.effectiveFrom || p.effective_from || ''}`])]; }
function alFilters() {
    const departments = [...new Set(alEmployees().map((e) => e.department).filter(Boolean))];
    return `<div class="al-toolbar">${alField('搜尋工號／姓名', 'alSearch', alState.search, 'search', 'data-al-filter="search"')}${alSelect('部門篩選', 'alDepartment', alState.department, [['', '全部部門'], ...departments.map((d) => [d, d])], 'data-al-filter="department"')}${alButton('select-visible', '選取顯示人員')}${alButton('clear-selected', '清除選取')}</div>`;
}
function alEmployeePicker() {
    const text = alState.search.trim().toLocaleLowerCase(), people = alEmployees().filter((e) => (!alState.department || e.department === alState.department) && `${e.employeeId || e.id} ${e.name}`.toLocaleLowerCase().includes(text));
    return `${alFilters()}<p class="al-note">已選 ${alState.selected.length} 人 · 顯示 ${people.length} 人。篩選不會取消先前選取。</p><div class="al-person-list">${people.map((e) => { const id = e.employeeId || e.id; return `<label class="al-person"><input type="checkbox" data-al-employee value="${alEsc(id)}" ${alState.selected.includes(id) ? 'checked' : ''}><span>${alEsc(id)} ${alEsc(e.name)}<small>${alEsc(e.department || '未分部門')}</small></span></label>`; }).join('') || '<p>沒有符合條件的人員。</p>'}</div>`;
}
function alRenderPolicy() {
    const d = alState.drafts.policy || {};
    return `<section class="al-card"><h4>制度版本</h4><p>新增版本保留既有政策與計算快照；先確認制度、折算與協商依據。</p>${alCan('policyManage') ? `<form data-al-form="policy"><div class="al-form-grid">${alField('制度名稱', 'name', d.name, 'text', 'required maxlength="100"')}${alField('生效日期', 'effectiveFrom', d.effectiveFrom, 'date', 'required')}${alField('特休假別代碼', 'leaveTypeId', d.leaveTypeId || 'annual', 'text', 'required')}${alSelect('特休制度', 'period', d.period || 'calendar_year', [['calendar_year', '曆年制'], ['anniversary', '週年制']])}${alSelect('折算基礎', 'prorationBasis', d.prorationBasis || 'calendar_month', [['calendar_month', '曆月比例'], ['actual_day', '實際日數']])}${alSelect('小數處理', 'rounding', d.rounding || 'raw', [['raw', '保留精確原值'], ['ceil_1_decimal', '無條件進位至小數第 1 位']])}${alText('協商／制度依據', 'agreementReference', d.agreementReference, 'required maxlength="500"')}${alText('建立版本原因', 'reason', d.reason, 'required maxlength="500"')}</div>${alCheck('confirmAnnualLeave', '確認此假別為特休，已核對制度內容及協商依據')}${alCheck('confirm', '確認建立新制度版本；既有版本不覆寫')}<div class="al-actions"><button class="primary-btn" type="submit">建立制度版本</button></div></form>` : '<p class="al-note">目前權限可查看制度，無法新增版本。</p>'}${alPolicyList()}</section>`;
}
function alPolicyList() {
    const policies = alState.data?.policies || [];
    return policies.length ? `<div class="al-table-wrap"><table class="al-table"><thead><tr><th>制度／版本</th><th>生效日</th><th>期間</th><th>折算</th><th>精度</th></tr></thead><tbody>${policies.map((p) => `<tr><td>${alEsc(p.name || p.label || p.id)}<small>${alEsc(p.id)}</small></td><td>${alEsc(p.effectiveFrom || p.effective_from)}</td><td>${p.period === 'anniversary' ? '週年制' : '曆年制'}</td><td>${p.prorationBasis === 'actual_day' ? '實際日數' : '曆月比例'}</td><td>${p.rounding === 'ceil_1_decimal' ? '進位 1 位' : '精確原值'}</td></tr>`).join('')}</tbody></table></div>` : alEmpty('尚未建立特休制度。請由具制度設定權限的人員確認後新增。');
}
function alRenderService() {
    const d = alState.drafts.service || {}, service = (alState.data?.services || []).find((row) => row.employeeId === d.employeeId), frozen = Boolean(service?.frozen || service?.locked || service?.hasGrants || (alState.data?.accounts || []).some((a) => a.employeeId === d.employeeId));
    const employee = alEmployees().find((p) => (p.id || p.employeeId) === d.employeeId);
    const roster = employee ? alFacts([['名冊到職日', employee.hire_date || '尚未填寫'], ['名冊離職日', employee.leave_date || '未設定'], ['上次核對到職日', service?.hireDate || '尚未核對'], ['上次核對離職日', service ? service.leaveDate || '未設定' : '尚未核對']]) : '';
    return `<section class="al-card"><h4>到職年資與期初接管</h4><p>先核對年資、工時及接管日前的未休餘額；接管日前已取得的權利不會再次自動發給。首版生效日須與接管起日相同。後續年資與工時修訂另建生效版本，既有入帳來源保留原快照。</p>${roster}${!alCan('policyManage') ? alEmpty('目前權限僅供檢視；核對資料須由制度管理者維護。') : `<form data-al-form="service"><div class="al-form-grid">${alSelect('核對員工', 'employeeId', d.employeeId, alEmployeeOptions(), 'required data-al-service-person')}${alField('本次核對版本生效日', 'serviceEffectiveFrom', d.serviceEffectiveFrom, 'date', 'required')}${alField('認列年資起算日', 'serviceDate', d.serviceDate, 'date', 'required')}${alField(d.employmentType === 'part_time_proportional' ? '比例換算基準工時（通常 8）' : '正常每日工時', 'dayHours', d.dayHours || '8', 'text', 'required inputmode="decimal"')}${alSelect('工作型態', 'employmentType', d.employmentType || 'full_time', [['full_time', '全時工作'], ['part_time_same_days', '部分工時：相同工作日數'], ['part_time_proportional', '部分工時：比例計算']])}${alField('權利比例（原值或分數）', 'entitlementFactor', d.entitlementFactor || '1', 'text', 'required placeholder="例如 1、0.5 或 1/2"')}${alField('比例計算依據', 'factorBasis', d.factorBasis, 'text', 'maxlength="500"')}${alText('不計年資期間：起日,復職日,原因（每段一列）', 'excludedPeriodsText', d.excludedPeriodsText, 'placeholder="2026-01-01,2026-02-01,留職停薪"')}${alField('權利接管起日', 'cutoverDate', d.cutoverDate, 'date', 'required'+(frozen ? ' readonly' : ''))}${alField('期初未休餘額（精確小時）', 'openingHours', d.openingHours ?? '0', 'text', 'required placeholder="例如 16 或 1/3"'+(frozen ? ' readonly' : ''))}${alField('期初餘額使用迄日', 'openingExpires', d.openingExpires, 'date', 'required'+(frozen ? ' readonly' : ''))}${alText('期初對帳來源與核對依據', 'openingSource', d.openingSource, 'required maxlength="500"'+(frozen ? ' readonly' : ''))}${alText('儲存原因', 'reason', d.reason, 'required maxlength="500"')}</div><p class="al-note">不計年資期間採起日含、復職日不含。相同工作日數的部分工時不得再減少特休日數；比例型須填比例與計算依據，工時填比例換算基準（通常 8），勿再用已減少工時重複折減。</p>${alCheck('verified', '確認已核對受僱年資、留停與正常工時', d.verified)}<label class="al-check"><input type="checkbox" name="edgeDateConfirmed" ${d.edgeDateConfirmed ? 'checked' : ''}>已人工核對月底／2 月 29 日等特殊到職日的資格日規則（適用者勾選）</label>${alCheck('takeoverConfirmed', '確認期初餘額已對帳，接管日前既有權利不重複發給', d.takeoverConfirmed)}${alCheck('confirm', '確認保存核對資料與接管基準')}${frozen ? alWarnings(['此員工已有給假入帳。接管基準固定；新版本生效日須晚於舊版，不能移動已入帳資格日。同年度工時混用需先人工對帳。']) : ''}<div class="al-actions"><button class="primary-btn" type="submit">儲存核對資料</button></div></form>`}${service?.reviewRequired ? alWarnings(['此員工有待核對異動，尚未套用新版本；後續給假已封鎖。', ...(service.reviewIssues || [])]) : ''}${alServiceHistory(service?.versions || [])}</section>`;
}
function alServiceHistory(versions) { return versions.length ? '<h4>年資核對版本歷程</h4><div class="al-table-wrap"><table class="al-table"><thead><tr><th>版本生效日</th><th>年資起算</th><th>每日工時</th><th>權利比例</th><th>核對原因</th></tr></thead><tbody>'+versions.map((v)=>'<tr><td>'+alEsc(v.effectiveFrom)+'</td><td>'+alEsc(v.serviceDate)+'</td><td>'+alEsc(alExact(v.dayHours))+'</td><td>'+alEsc(alFraction(v.entitlementFactor))+'</td><td class="al-wrap">'+alEsc(v.reason)+'</td></tr>').join('')+'</tbody></table></div>' : ''; }
function alRenderGrant() {
    const d = alState.drafts.grant || {};
    return `<section class="al-card"><h4>年資特休試算</h4><p>先核對逐人計算與已認列額度。試算本身不會新增額度，核准後才入帳。</p><form data-al-form="grant-preview"><div class="al-form-grid">${alSelect('制度版本', 'policyId', d.policyId, alPolicyOptions(), 'required')}${alField('配置年度', 'year', d.year || alState.year, 'number', 'required min="2017" max="2100"')}${alField('資格判斷基準日', 'asOf', d.asOf || alState.asOf, 'date', 'required')}${alText('試算與給假原因', 'reason', d.reason, 'required maxlength="500"')}</div>${alEmployeePicker()}<div class="al-actions"><button class="primary-btn" type="submit">產生給假試算</button></div></form></section>${alRenderPreview('grant')}`;
}
function alAllocationOptions() { return [['', '請選擇權利批次'], ...(alState.data?.allocations || []).map((a) => [a.id, alPerson(a.employeeId) + ' · ' + a.year + ' · ' + alKind(a.kind) + ' · 可用 ' + alExact(a.availableHours) + ' 小時'])]; }
function alRenderClose() {
    const d = alState.drafts.close || {}, closeYear = Number(d.year || alState.year), termination = d.closureType === 'termination', allocations = (alState.data?.allocations || []).filter((row) => termination ? row.employeeId === d.closeEmployeeId : row.year === closeYear);
    return `<section class="al-card"><h4>年度結算與協商遞延</h4><p>逐批勾選未休權利並核對同意依據。未休工資僅列待薪資處理，不代表核薪或已付款。</p>${alWarnings(['結算前須完成年資版本核對；名冊到職／離職日異動或有待核對紀錄時，先回年資核對完成確認。', '未到期且未離職的權利不能結清；待審預占與異常須先結案，已遞延批次不得再次遞延。'])}<form data-al-form="close-preview"><div class="al-form-grid">${alField(termination ? '離職結算年度（依基準日）' : '結算來源年度', 'year', termination ? Number((d.asOf || alState.asOf).slice(0, 4)) : d.year || alState.year, 'number', 'required min="2017" max="2100"'+(termination ? ' readonly' : ''))}${alField('結算基準日', 'asOf', d.asOf || alState.asOf, 'date', 'required')}${alSelect('結算情境', 'closureType', d.closureType || 'year_end', [['year_end', '年度終結'], ['termination', '契約終止']])}${termination ? alSelect('離職員工（涵蓋全部已取得來源）', 'closeEmployeeId', d.closeEmployeeId, alEmployeeOptions(), 'required') : ''}${alText('結算原因', 'reason', d.reason, 'required maxlength="500"')}</div>${termination ? '<p class="al-note">離職結算列出此人的全部已取得來源，包括配置於後續年度的部分；不以今年畫面餘額作上限。</p>' : ''}${allocations.length ? allocations.map((row, i) => `<details class="al-details"><summary>${alEsc(alPerson(row.employeeId))} · ${alEsc(row.year)} 年 <small>${alEsc(alKind(row.kind))} · 可用 ${alEsc(alExact(row.exact ? row.exact.availableHours : row.availableHours))} 小時</small></summary><div data-al-close-row data-allocation-id="${alEsc(row.id)}" data-index="${i}"><label class="al-check"><input type="checkbox" name="include_${i}" ${d['include_'+i] ? 'checked' : ''}>納入本次結算</label>${alFacts([['權利期間', (row.periodStart || '') + ' ～ ' + (row.periodEndExclusive || '') + '（迄日不含）'], ['原始來源', row.sourceLotId || row.id], ['已休小時', row.usedHours], ['待審預占小時', row.heldHours]])}<div class="al-form-grid">${alSelect('未休處理方式', 'closeMode_'+i, d['closeMode_'+i] || 'wage', [['wage', '列待未休工資處理'], ...(row.canCarry ? [['carry', '協商遞延至次年度']] : [])])}${alField('同意日期（遞延必填）', 'agreementDate_'+i, d['agreementDate_'+i], 'date')}${alField('同意證據／文件編號（遞延必填）', 'evidence_'+i, d['evidence_'+i], 'text', 'maxlength="500"')}</div>${alWarnings(row.warnings || [])}</div></details>`).join('') : alEmpty('目前年度沒有可結算的權利批次。')}<div class="al-actions"><button class="primary-btn" type="submit" ${allocations.length ? '' : 'disabled'}>預覽年度結算</button></div></form></section>${alRenderPreview('close')}`;
}
function alRenderCorrection() {
    const d = alState.drafts.correction || {};
    return `<section class="al-card"><h4>精確額度調整</h4><p>以可追溯差額記錄更正，保留原始給假批次與請假紀錄。負調整不能超過未休且未預占的可用額度。</p><form data-al-form="correction-preview"><div class="al-form-grid">${alSelect('調整來源批次', 'allocationId', d.allocationId, alAllocationOptions(), 'required')}${alField('精確調整小時（可正／負）', 'quantity', d.quantity, 'text', 'required placeholder="例如 0.8、-0.5 或 -1/3"')}${alText('調整原因與依據', 'reason', d.reason, 'required maxlength="500"')}</div><div class="al-actions"><button class="primary-btn" type="submit">預覽精確調整</button></div></form></section>${alRenderPreview('correction')}`;
}
const alStatus = (status) => ({ acquired: '已取得', projected: '未達資格日（僅預估）', ineligible_after_leave: '離職後未取得', ready: '可確認', blocked: '待處理，不能入帳', unchanged: '已認列，無新增' }[status] || status || '');
function alRenderSteps(steps) {
    const names = { SOURCE_RIGHTS_FIRST: '先核對完整法定權利，再配置至年度；未達資格日的預估不入帳。', EXACT_HOURS: '以精確日數乘核定每日工時；薪資另由負責人員核對。', SERVICE_MILESTONE: '年資資格門檻', EXCLUDE_SERVICE_DAYS: '不計年資日數', STATUTORY_TIER: '法定級距', EMPLOYMENT_FACTOR: '工時型態與權利比例', ELIGIBILITY_AT_AS_OF: '基準日資格', SOURCE_PERIOD: '完整權利期間', SUM_BEFORE_ROUNDING: '加總後一次進位' };
    const fields = { serviceDate:'年資起算', months:'月數', baseAcquisitionDate:'原資格日', excludedDays:'排除日數', acquisitionDate:'調整後資格日', completedYears:'已滿年資', days:'日數', factor:'權利比例', baselineDays:'法定基準', asOf:'基準日', leaveDate:'最後在職日', start:'起日', endExclusive:'迄日（不含）', rawDays:'原始日數', grantedDays:'處理後日數', differenceDays:'差額', dayHours:'每日工時' };
    return '<ol class="al-steps">'+(steps || []).map((step)=>typeof step==='string' ? '<li>'+alEsc(step)+'</li>' : '<li>'+alEsc(names[step.code] || step.message || step.description || step.label || step.code)+(step.formula ? '<div class="al-code">'+alEsc(step.formula)+'</div>' : '')+alFacts(Object.entries(fields).filter(([key])=>step[key]!=null).map(([key,label])=>[label,step[key]]))+'</li>').join('')+'</ol>';
}
function alRenderCalculation(row) {
    const c = row.calculation || row, annual = c.annual || {}, lots = c.sourceLots || c.lots || row.lots || [], segments = c.segments || [];
    const raw = row.rawDays ?? annual.acquiredRawDays, rounded = row.roundedDays ?? annual.acquiredGrantedDays, difference = row.differenceDays ?? annual.acquiredRoundingDifferenceDays;
    return alFacts([['法定已取得來源日數', c.statutory?.acquiredSourceDays], ['已取得本期配置原值', raw], ['原始精確分數', alFraction(raw)], ['已取得配置處理後日數', rounded], ['進位差額', difference], ['所選年度新增小時', row.deltaHours ?? row.grantHours], ['本次完整來源入帳小時', row.totalPostedHours], ['配置至後續年度小時（已取得）', row.futureAllocationHours], ['已認列小時', row.alreadyGrantedHours], ['尚待資格日的預估日數（不入帳）', annual.projectedRawDays]]) + (annual.includesProjected ? alWarnings(['年度試算含未達資格日的預估；預估不列為已取得權利，也不會提前入帳。']) : '') + '<p class="al-note">小數是顯示摘要；完整原值以分子／分母保存，不使用畫面截斷值回算。再次給假依累計原值重新核對進位差額，不重複加給；原值、處理後日數是累計配置，新增小時才是本次入帳影響。</p>' + alRenderSteps(c.steps || []) + lots.map((lot)=>'<details class="al-details"><summary>'+alEsc(lot.acquisitionDate || lot.eventDate || lot.id)+' · '+alEsc(alStatus(lot.status))+' · '+alEsc(alExact(lot.statutoryDays || lot.days))+' 日</summary><div>'+alFacts([['來源期間', (lot.periodStart || '')+' ～ '+(lot.periodEndExclusive || '')+'（迄日不含）'], ['法定日數原值', lot.statutoryDays], ['精確分數', alFraction(lot.statutoryDays)], ['完整來源小時', lot.statutoryHours]])+alRenderSteps(lot.steps || [])+'</div></details>').join('') + (segments.length ? '<h5>年度分段與折算</h5>'+segments.map((segment)=>'<details class="al-details"><summary>'+alEsc(segment.start)+' ～ '+alEsc(segment.endExclusive)+' · '+alEsc(alStatus(segment.status))+'</summary><div>'+alFacts([['完整來源權重', alFraction(segment.sourceWeight)], ['年度交集權重', alFraction(segment.intersectionWeight)], ['分攤比例', alFraction(segment.ratio)], ['分段日數', segment.rawDays], ['精確分數', alFraction(segment.rawDays)], ['分段小時', segment.rawHours]])+'<p class="al-code">'+alEsc(segment.formula)+'</p></div></details>').join('') : '') + (row.allocations?.length ? '<h5>本次各年度配置</h5>'+alFacts(row.allocations.map((part)=>[part.year+' 年 · '+part.periodStart+' ～ '+part.periodEndExclusive, part.hours])) : '') + alWarnings(row.warnings || c.warnings || []);
}
function alRenderPreview(kind) {
    if (alState.previewKind !== kind || !alState.preview) return '';
    const p = alState.preview, rows = p.rows || [], permission = { grant: 'grant', close: 'close', correction: 'adjust' }[kind], label = { grant: '核准給假入帳', close: '確認年度結算', correction: '確認精確調整' }[kind];
    return `<section class="al-preview" aria-label="試算預覽"><h4>待確認預覽 · ${rows.length} 筆</h4><p class="al-note">以下仍是預覽。資料或條件有異動時必須重新試算。</p>${alWarnings([...(p.warnings || []), ...(p.asOf && p.asOf > alState.data.today ? ['基準日尚未到達；本次僅供試算，不能提前入帳或結算。'] : [])])}${rows.map((row) => `<details class="al-details"><summary>${alEsc(alPerson(row.employeeId || row.employee_id))}<small>${alEsc(alStatus(row.status))} · ${alEsc(alExact(row.deltaHours ?? row.grantHours ?? row.amountHours ?? row.availableHours))} 小時</small></summary><div>${kind === 'grant' ? alRenderCalculation(row) : kind === 'close' ? alFacts([['結算小時', row.amountHours], ['結算小時精確分數', alFraction(row.amountHours)], ['結算日數', row.amountDays], ['來源批次', row.allocationId], ['原期間', row.originalPeriodStart + ' ～ ' + row.originalPeriodEndExclusive], ['處理方式', row.mode === 'carry' ? '協商遞延' : '待未休工資處理（非已付款）']]) + alWarnings(row.warnings) : alFacts([['調整前可用小時', row.beforeHours], ['本次調整小時', row.deltaHours], ['調整後可用小時', row.afterHours], ['精確分數', alFraction(row.deltaHours)], ['來源批次', row.allocationId]])}</div></details>`).join('')}${alCan(permission) ? `<form data-al-form="${kind}-confirm">${alCheck('confirm', '已核對各筆計算、原始權利、異常及本次影響範圍')}<div class="al-actions"><button class="primary-btn" type="submit" ${p.blocked || (p.asOf && p.asOf > alState.data.today) || p.canConfirm === false || !rows.length || rows.some((row) => row.status === 'blocked') ? 'disabled' : ''}>${label}</button>${alButton('cancel-preview', '取消預覽')}</div></form>` : `<p class="al-note">目前沒有${label}權限；此預覽尚未入帳。</p>`}</section>`;
}
function alRenderOverview() {
    const data = alState.data, balances = data?.balances || [];
    const scopeNote = balances.some((row) => row.summaryScope === 'overlapping_source_lifetimes') ? '<p class="al-note">週年制：所選年交集來源的全期餘額（含跨年使用），不是當年請假發生量。</p>' : '';
    return `<section class="al-card"><h4>特休權利帳</h4><p>精確權利與人工額度分開追溯；數值採後端計算結果，不以畫面小數重新計算。</p>${scopeNote}<div class="al-stats">${[['制度版本', data?.policies?.length || 0], ['可見人員', alEmployees().length], ['權利帳', data?.accounts?.length || 0], ['結算紀錄', data?.closures?.length || 0]].map(([label, value]) => `<div class="al-stat"><span>${label}</span><strong>${value}</strong></div>`).join('')}</div>${balances.length ? `<div class="al-table-wrap"><table class="al-table"><thead><tr><th>員工</th><th>年度</th><th>已給小時</th><th>轉入／調整／結算</th><th>已休</th><th>待審預占</th><th>可用</th><th>可用天數／工時</th><th>計算來源</th></tr></thead><tbody>${balances.map((row) => `<tr><td>${alEsc(alPerson(row.employeeId || row.employee_id))}</td><td>${alEsc(row.year || alState.year)}</td><td>${alEsc(alExact(row.exact ? row.exact.grantHours : row.grantHours))}</td><td>轉入 ${alEsc(alExact(row.exact?.carryHours ?? row.carryHours))}<small>調整 ${alEsc(alExact(row.exact?.adjustmentHours ?? row.adjustmentHours))}</small><small>已結算 ${alEsc(alExact(row.exact?.closedHours))}</small></td><td>${alEsc(alExact(row.exact ? row.exact.usedHours : row.usedHours))}</td><td>${alEsc(alExact(row.exact ? row.exact.heldHours : row.heldHours))}</td><td>${alEsc(alExact(row.exact ? row.exact.availableHours : row.availableHours))}</td><td>${alEsc(alExact(row.exact?.availableDays ?? row.availableDays))} 天<small>${row.mixedDayHours ? '依來源工時' : alEsc(alExact(row.dayHours))+' 小時／日'}</small></td><td>${alButton('employee-detail', '查看明細', `data-employee-id="${alEsc(row.employeeId || row.employee_id)}"`)}</td></tr>`).join('')}</tbody></table></div>` : alEmpty('本年度尚未建立特休權利帳。依序建立制度、核對年資，再試算並核准給假。')}${alPolicyList()}</section>`;
}
function renderAnnualLeaveWorkspace() {
    const tabs = [['overview', '權利總覽', true], ['policy', '制度版本', true], ['service', '年資核對', alCan('policyManage')], ['grant', '給假試算', true], ['close', '年度結算', alCan('close')], ['correction', '精確調整', alCan('adjust')]].filter((t) => t[2]);
    if (!tabs.some(([id]) => id === alState.tab)) alState.tab = 'overview';
    return `<section id="annual-leave-workspace" class="al-workspace" aria-label="年資特休制度"><div class="al-header"><div><h3>年資特休制度</h3><p>制度版本 → 年資核對 → 試算核准 → 年度結算</p></div><div class="al-actions">${alCanOldBalance() ? alButton('back', '返回人工假別額度') : ''}${alButton('refresh', '重新整理')}</div></div><div class="al-message inline-message" aria-live="polite">${alEsc(alState.message)}</div>${!alState.data ? '<p role="status">讀取年資特休資料中…</p>' : `<div class="al-toolbar">${alField('查看年度', 'alYear', alState.year, 'number', 'min="2017" max="2100" data-al-year')}${alButton('export-json', '匯出精確 JSON')}${alButton('export-csv', '匯出核對 CSV')}</div><div class="al-tabs" role="tablist" aria-label="年資特休作業">${tabs.map(([id, label]) => `<button type="button" role="tab" data-al-action="tab" data-tab="${id}" aria-selected="${alState.tab === id}">${label}</button>`).join('')}</div><div data-al-context="${alState.tab}">${({ overview: alRenderOverview, policy: alRenderPolicy, service: alRenderService, grant: alRenderGrant, close: alRenderClose, correction: alRenderCorrection }[alState.tab])()}</div>`}</section>`;
}
function alPaint() {
    const root = document.getElementById('annual-leave-workspace');
    if (root) { root.outerHTML = renderAnnualLeaveWorkspace(); alSetBusy(alState.busy); }
    if (typeof installWorkbenchPageHelp === 'function') installWorkbenchPageHelp();
}
function alSetBusy(busy) {
    const root = document.getElementById('annual-leave-workspace');
    if (!root) return;
    root.setAttribute('aria-busy', String(busy));
    root.querySelectorAll('input,select,textarea,button').forEach((node) => {
        if (busy) { node.dataset.alWasDisabled = String(node.disabled); node.disabled = true; }
        else if ('alWasDisabled' in node.dataset) { node.disabled = node.dataset.alWasDisabled === 'true'; delete node.dataset.alWasDisabled; }
    });
}
function alMessage(message, type = 'error') {
    alState.message = message; alState.messageType = type;
    const root = document.querySelector('.al-message'); if (root) { setMessage(root, message, type); root.classList.add('al-message'); }
}
function alInvalidatePreview() { alState.preview = null; alState.previewKind = ''; alState.previewInput = null; alState.idempotencyKey = ''; document.querySelector('#annual-leave-workspace .al-preview')?.remove(); }
function alDiscard() { if (!alState.dirty && !alState.preview) return true; if (!window.confirm('尚有未儲存輸入或試算。確定捨棄並切換？')) return false; alState.dirty = false; alState.drafts = {}; alInvalidatePreview(); return true; }
async function alLoad() {
    const identity = alState.identity, sequence = ++alState.sequence;
    alState.loading = true;
    try {
        const result = await requestJson(`/api/browser/annual-leave?year=${alState.year}`, { auth: true });
        if (identity !== alState.identity || sequence !== alState.sequence) return;
        alState.data = result.annualLeave; alState.permissions = result.permissions || {}; alState.loading = false; alPaint();
    } catch (error) { if (identity === alState.identity && sequence === alState.sequence) { alState.loading = false; alMessage(error.message); } }
}
function alDraft(form) {
    const values = Object.fromEntries(new FormData(form));
    form.querySelectorAll('input[type="checkbox"]').forEach((input) => { if (input.name) values[input.name] = input.checked; });
    const kind = form.dataset.alForm.replace(/-(preview|confirm)$/, '');
    if (!form.dataset.alForm.endsWith('-confirm')) alState.drafts[kind] = values;
    return values;
}
async function alSubmit(form) {
    if (alState.busy || !form.reportValidity()) return;
    const operation = form.dataset.alForm, d = alDraft(form), identity = alState.identity;
    let body = { ...d, revision: alState.data?.revision };
    if (operation === 'service') {
        const excludedPeriods = String(d.excludedPeriodsText || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
            const [start, end, ...reason] = line.split(',').map((part) => part.trim());
            if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || !reason.join(',').trim()) throw new Error('不計年資期間請填「起日,復職日,原因」，每段一列。');
            return { start, end, reason: reason.join(',') };
        });
        body = { ...body, excludedPeriods }; delete body.excludedPeriodsText;
        if (body.employmentType !== 'part_time_proportional') body.entitlementFactor = '1';
    } else if (operation === 'grant-preview') {
        if (!alState.selected.length || alState.selected.length > 100) throw new Error('請選擇 1 至 100 位員工。');
        body = { ...body, year: Number(d.year), employeeIds: [...alState.selected] };
        delete body.alSearch; delete body.alDepartment;
    } else if (operation === 'close-preview') {
        const rows = [...form.querySelectorAll('[data-al-close-row]')].filter((row) => d[`include_${row.dataset.index}`]).map((row) => {
            const i = row.dataset.index, mode = d[`closeMode_${i}`], agreementDate = d[`agreementDate_${i}`], evidence = d[`evidence_${i}`];
            if (mode === 'carry' && (!agreementDate || !evidence?.trim())) throw new Error('每一筆遞延均須填寫同意日期與證據。');
            return { allocationId: row.dataset.allocationId, mode, agreementDate, evidence };
        });
        if (!rows.length) throw new Error('請展開權利批次，勾選本次要結算的項目。');
        body = { revision: alState.data.revision, year: d.closureType === 'termination' ? Number(d.asOf.slice(0, 4)) : Number(d.year), asOf: d.asOf, closureType: d.closureType, rows, reason: d.reason };
    } else if (operation.endsWith('-confirm')) {
        if (!alState.preview || !d.confirm) throw new Error('請重新試算並核對確認欄。');
        body = { previewId: alState.preview.previewId, digest: alState.preview.digest, revision: alState.preview.revision, confirm: true, reason: alState.previewInput?.reason, idempotencyKey: alState.idempotencyKey };
    }
    alState.busy = true; alSetBusy(true); alMessage('', 'info');
    try {
        const result = await requestJson(`/api/browser/annual-leave/${operation}`, { method: 'POST', auth: true, body });
        if (identity !== alState.identity) return;
        if (operation.endsWith('-preview')) {
            alState.preview = result.preview; alState.previewKind = operation.replace('-preview', ''); alState.previewInput = body;
            alState.idempotencyKey = window.crypto.randomUUID(); alState.dirty = true; alPaint();
            document.querySelector('#annual-leave-workspace .al-preview')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        } else {
            alState.dirty = false; alState.drafts = {}; alInvalidatePreview(); await alLoad();
            if (identity !== alState.identity) return;
            if (operation === 'service') { alState.drafts.service = alServiceDraft(body.employeeId); alPaint(); }
            alMessage(result.reviewRequired ? `已記錄待核對，未套用新版本，後續給假已封鎖。${(result.warnings || []).join('；')}` : result.message || '已儲存，請核對最新權利帳。', result.reviewRequired ? 'error' : 'success');
        }
    } catch (error) { if (identity === alState.identity) alMessage(error.message); }
    finally { if (identity === alState.identity) { alState.busy = false; alSetBusy(false); } }
}
function alRenderEmployeeEntry(employeeId = '') { return `<div class="al-entry">${alButton('employee-detail', '查看年資特休計算明細', `data-employee-id="${alEsc(employeeId)}"`)}<span>已入帳的本人權利來源與精確計算</span></div>`; }
function alRenderReadonlyEmployee(employee) {
    const lots = employee.lots || [], allocations = employee.allocations || [], closures = employee.closures || [], ledger = employee.ledger || [];
    const lotHtml = lots.length ? lots.map((lot) => `<details class="al-details"><summary>${alEsc(lot.acquisitionDate || lot.eventDate || lot.qualifiedOn || lot.id)} · 權利計算快照</summary><div>${alRenderCalculation(lot.calculation || lot.snapshot || lot)}</div></details>`).join('') : alEmpty('此年度尚無已入帳年資特休計算快照；不表示沒有法定休假權利。');
    const allocationHtml = allocations.map((row) => `<details class="al-details"><summary>${alEsc(row.year)} 年 · ${alEsc(alKind(row.kind))} · 可用 ${alEsc(alExact(row.exact ? row.exact.availableHours : row.availableHours))} 小時</summary><div>${alFacts([['批次代碼', row.id], ['來源批次', row.sourceLotId], ['原給小時', row.grantHours], ['已休小時', row.usedHours], ['待審預占', row.heldHours], ['可用小時', row.availableHours], ['原始精確分數', alFraction(row.availableHours)], ['使用期間', (row.periodStart || '') + ' ～ ' + (row.periodEndExclusive || '') + '（迄日不含）']])}${alWarnings(row.warnings || [])}</div></details>`).join('');
    const closureHtml = closures.map((row) => `<div class="al-card">${alFacts([['年度', row.year], ['處理狀態', row.status === 'wage_pending' || row.mode === 'wage' ? '待未休工資處理（非已付款）' : '協商遞延'], ['小時', row.hours ?? row.quantity ?? row.amount], ['來源批次', row.allocationId || row.sourceLotId]])}</div>`).join('');
    const ledgerHtml = ledger.length ? `<details class="al-details"><summary>權利異動紀錄 · ${ledger.length} 筆</summary><div class="al-table-wrap"><table class="al-table"><thead><tr><th>時間</th><th>類別</th><th>小時</th></tr></thead><tbody>${ledger.map((row) => `<tr><td>${alEsc(alTime(row.createdAt || row.created_at))}</td><td>${alEsc(alKind(row.kind || row.type || row.action))}</td><td>${alEsc(alExact(row.quantity ?? row.hours ?? row.amount))}</td></tr>`).join('')}</tbody></table></div></details>` : '';
    return `<section><h3>${alEsc(employee.employeeId)} ${alEsc(employee.name)}</h3>${alWarnings(employee.warnings || [])}${lotHtml}${allocationHtml ? '<h4>權利批次與餘額</h4>' + allocationHtml : ''}${closureHtml ? '<h4>結算紀錄</h4>' + closureHtml : ''}${ledgerHtml}</section>`;
}
async function alOpenEmployeeDetail(employeeId = '') {
    document.getElementById('annual-leave-detail-dialog')?.remove();
    const identity = alState.identity, dialog = document.createElement('dialog');
    dialog.id = 'annual-leave-detail-dialog'; dialog.className = 'wb-dialog al-dialog'; dialog.setAttribute('aria-labelledby', 'al-detail-title');
    dialog.innerHTML = `<header class="wb-dialog-header"><div><h2 id="al-detail-title">年資特休計算明細</h2><p>僅顯示已入帳權利；此視窗不提供修改或薪資付款。</p></div><button class="outline-btn" type="button" data-al-close-detail>關閉</button></header><div class="wb-dialog-body"><div class="al-toolbar">${alField('明細年度', 'detailYear', alState.year, 'number', 'min="2017" max="2100" data-al-detail-year')}</div><div data-al-detail-content role="status">讀取已入帳計算明細中…</div></div>`;
    dialog.querySelector('[data-al-close-detail]').onclick = () => dialog.close(); dialog.addEventListener('close', () => dialog.remove());
    dialog.addEventListener('keydown', (event) => { if (event.key === 'Escape') event.stopPropagation(); });
    let sequence = 0;
    const load = async (year) => {
        const current = ++sequence, content = dialog.querySelector('[data-al-detail-content]'); content.textContent = '讀取已入帳計算明細中…';
        try {
            const query = new URLSearchParams({ year: String(year) }); if (employeeId) query.set('employeeId', employeeId);
            const employeeView = state.dashboard?.role === 'employee';
            const result = await requestJson(employeeView ? `/api/browser/employee/annual-leave?${query}` : `/api/browser/annual-leave?year=${encodeURIComponent(year)}`, { auth: true });
            if (!employeeView) {
                const data = result.annualLeave || {}, person = (data.employees || []).find((p) => (p.id || p.employeeId) === employeeId);
                const filter = (key) => (data[key] || []).filter((row) => (row.employeeId || row.employee_id) === employeeId);
                const allocations = filter('allocations').filter((a) => a.periodStart < String(Number(year)+1)+'-01-01' && a.periodEndExclusive > String(year)+'-01-01');
                const ids = new Set(allocations.map((a) => a.id)), sources = new Set(allocations.map((a) => a.sourceLotId));
                result.employees = person ? [{ employeeId, name: person.name, lots: filter('lots').filter((lot) => sources.has(lot.id)), allocations, balances: filter('balances'), closures: filter('closures'), ledger: filter('ledger').filter((row) => ids.has(row.allocationId)) }] : [];
            }
            if (identity !== alState.identity || current !== sequence || !dialog.isConnected) return;
            content.removeAttribute('role'); content.innerHTML = (result.employees || result.annualLeave?.employees || []).map(alRenderReadonlyEmployee).join('') || alEmpty('目前沒有可顯示的已入帳權利。');
        } catch (error) { if (identity === alState.identity && current === sequence && dialog.isConnected) content.textContent = error.message; }
    };
    dialog.querySelector('[data-al-detail-year]').onchange = (event) => load(Number(event.target.value));
    document.body.append(dialog); dialog.showModal(); await load(alState.year);
}
function alResetIdentity(identity = '') {
    document.getElementById('annual-leave-detail-dialog')?.remove();
    Object.assign(alState, { identity, data: null, permissions: {}, open: false, preview: null, previewKind: '', previewInput: null, idempotencyKey: '', drafts: {}, selected: [], dirty: false, busy: false, loading: false, message: '', sequence: alState.sequence + 1 });
}
function alInsertEntries() {
    const employeeRoot = document.getElementById('employee-leave-balances');
    if (employeeRoot && !employeeRoot.parentElement.querySelector('[data-al-own-entry]')) { const entry = document.createElement('div'); entry.dataset.alOwnEntry = ''; entry.innerHTML = alRenderEmployeeEntry(); employeeRoot.after(entry); }
    const proxy = document.getElementById('supervisor-workspace');
    if (proxy && !proxy.querySelector('[data-al-proxy-entry]') && typeof supervisorState !== 'undefined' && supervisorState.data?.employees?.length) {
        const entry = document.createElement('div'); entry.className = 'al-entry'; entry.dataset.alProxyEntry = '';
        entry.innerHTML = `${alButton('proxy-detail', '查看代辦員工特休明細')}<span>限已獲代辦授權的員工，唯讀查看</span>`; proxy.prepend(entry);
    }
}
const alPreviousRender = renderDashboard;
renderDashboard = function renderAnnualLeaveIdentity(dashboard) {
    const identity = `${state.token}/${dashboard?.role}/${dashboard?.user?.id || ''}/${JSON.stringify(dashboard?.permissions || {})}`;
    if (identity !== alState.identity) alResetIdentity(identity);
    return alPreviousRender(dashboard);
};
const alPreviousEntitlementsRender = renderLeaveEntitlementWorkspace;
renderLeaveEntitlementWorkspace = function renderWithAnnualLeave() {
    if (alCanOpen() && (alState.open || !alCanOldBalance())) return renderAnnualLeaveWorkspace();
    return alPreviousEntitlementsRender();
};
const alPreviousPost = postRenderSetup;
postRenderSetup = function setupAnnualLeave() {
    alPreviousPost(); alInsertEntries();
    if (document.getElementById('annual-leave-workspace') && !alState.data && !alState.loading) alLoad();
};
if (typeof spPaint === 'function') { const alPreviousProxyPaint = spPaint; spPaint = function paintAnnualLeaveProxy() { alPreviousProxyPaint(); alInsertEntries(); }; }
const alPreviousLogout = handleLogout;
handleLogout = function logoutAnnualLeave(...args) { alResetIdentity(); return alPreviousLogout(...args); };
const alPreviousClick = handleDashboardClick;
handleDashboardClick = async function annualLeaveNavigationGuard(event) {
    const button = event.target.closest('[data-action]'), action = button?.dataset.action || '';
    if (document.getElementById('annual-leave-workspace') && alState.dirty && (action.includes('workspace') || action.includes('section') || action === 'logout') && !alDiscard()) { event.preventDefault(); return; }
    return alPreviousClick(event);
};
const alPreviousChange = handleDashboardChange;
handleDashboardChange = async function annualLeaveRoleGuard(event) {
    if (event.target.id === 'workspace-switch' && alState.dirty && !alDiscard()) { event.target.value = state.dashboard.role; return; }
    return alPreviousChange(event);
};
const alPreviousSync = handleRealtimeSyncMessage;
handleRealtimeSyncMessage = async function syncAnnualLeave(payload) {
    if (['annualLeave', 'leaveEntitlements', 'leaveRequests', 'leaveSettings', 'employees'].includes(payload?.type)) {
        if (payload.sessionToken === state.token && alState.busy) return;
        if (document.getElementById('annual-leave-workspace')) {
            if (alState.dirty || alState.preview || alState.busy) { alInvalidatePreview(); alMessage('相關資料已有異動，輸入已保留；請重新整理並重新試算後確認。', 'info'); return; }
            await alLoad(); if (payload.type === 'annualLeave') return;
        } else alState.data = null;
        document.getElementById('annual-leave-detail-dialog')?.remove();
    }
    return alPreviousSync(payload);
};
document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-al-action]'); if (!button) return;
    event.preventDefault(); if (alState.busy) return;
    const action = button.dataset.alAction;
    try {
        if (action === 'employee-detail') return alOpenEmployeeDetail(button.dataset.employeeId || '');
        if (action.startsWith('export-')) {
            const format = action === 'export-json' ? 'json' : 'csv';
            const response = await fetch(`/api/browser/annual-leave/export?year=${alState.year}&format=${format}`, { headers: { Authorization: `Bearer ${state.token}` } });
            if (!response.ok) throw new Error((await response.json()).error || '匯出未完成。');
            const url = URL.createObjectURL(await response.blob()), link = document.createElement('a'); link.href = url; link.download = `年資特休-${alState.year}.${format}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); return;
        }
        if (action === 'proxy-detail') {
            const id = supervisorState.employeeId;
            if (!id) throw new Error('請先選擇已授權的代辦員工。'); return alOpenEmployeeDetail(id);
        }
        if (action === 'open') {
            if (typeof leDiscard === 'function' && !await leDiscard()) return;
            alState.open = true; const root = document.getElementById('leave-entitlement-workspace'); if (root) root.outerHTML = renderAnnualLeaveWorkspace(); await alLoad(); return;
        }
        if (['back', 'tab', 'refresh'].includes(action)) {
            if (!alDiscard()) return;
            if (action === 'back') { alState.open = false; document.getElementById('annual-leave-workspace').outerHTML = renderLeaveEntitlementWorkspace(); if (!leState.data) await leLoad(); return; }
            if (action === 'tab') alState.tab = button.dataset.tab;
            if (action === 'refresh') await alLoad(); else alPaint(); return;
        }
        if (action === 'cancel-preview') { alInvalidatePreview(); alState.dirty = true; alPaint(); return; }
        if (action === 'select-visible') { document.querySelectorAll('[data-al-employee]').forEach((input) => { if (!alState.selected.includes(input.value)) alState.selected.push(input.value); }); }
        if (action === 'clear-selected') alState.selected = [];
        alState.dirty = true; alInvalidatePreview(); alPaint();
    } catch (error) { alMessage(error.message); }
});
document.addEventListener('submit', (event) => { const form = event.target.closest('[data-al-form]'); if (!form) return; event.preventDefault(); alSubmit(form).catch((error) => alMessage(error.message)); });
document.addEventListener('input', (event) => {
    const form = event.target.closest('[data-al-form]'); if (!form || alState.busy || form.dataset.alForm.endsWith('-confirm') || event.target.matches('[data-al-filter],[data-al-service-person]')) return;
    alDraft(form); alState.dirty = true; alInvalidatePreview();
});
document.addEventListener('change', async (event) => {
    const input = event.target;
    if (alState.busy || !input.closest('#annual-leave-workspace')) return;
    if (input.matches('[data-al-year]')) { if (!alDiscard()) { input.value = alState.year; return; } alState.year = Number(input.value); await alLoad(); return; }
    if (input.matches('[data-al-filter]')) { alState[input.dataset.alFilter] = input.value; alPaint(); return; }
    if (input.matches('[data-al-employee]')) { alState.selected = input.checked ? [...new Set([...alState.selected, input.value])] : alState.selected.filter((id) => id !== input.value); alState.dirty = true; alInvalidatePreview(); alPaint(); return; }
    if (input.closest('[data-al-form="close-preview"]') && ['closureType', 'closeEmployeeId', 'year'].includes(input.name)) { const d = alDraft(input.closest('form')); for (const key of Object.keys(d)) if (/^(include_|closeMode_|agreementDate_|evidence_)/.test(key)) delete d[key]; alState.drafts.close = d; alPaint(); return; }
    if (input.name === 'asOf' && input.closest('[data-al-form="close-preview"]') && alState.drafts.close?.closureType === 'termination') { input.form.elements.year.value = Number(input.value.slice(0, 4)); alDraft(input.form); }
    if (input.name === 'cutoverDate' && !alState.drafts.service?.serviceEffectiveFrom) { const form = input.closest('form'); form.elements.serviceEffectiveFrom.value = input.value; alDraft(form); return; }
    if (input.name === 'employmentType') { alDraft(input.closest('form')); alPaint(); return; }
    if (input.matches('[data-al-service-person]')) {
        const previousId = alState.drafts.service?.employeeId || '';
        if (!alDiscard()) { input.value = previousId; return; }
        alState.drafts.service = alServiceDraft(input.value); alState.dirty = false; alInvalidatePreview(); alPaint();
    }
});
window.addEventListener('beforeunload', (event) => { if (alState.dirty) { event.preventDefault(); event.returnValue = ''; } });
