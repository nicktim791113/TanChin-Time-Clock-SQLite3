/* Approved online-request corrections are separate from paper replacement workflows. */
const approvedCorrectionState = { sequence: 0, dialog: null, identity: '', kind: '', requestId: '', data: null, dirty: false, busy: false, pending: null };
const acEscape = (value) => escapeHtml(String(value ?? ''));
const acIdentity = () => `${state.token || ''}/${state.dashboard?.role || ''}/${state.dashboard?.user?.id || ''}`;
function acEligible(kind, row) {
    const modes = kind === 'leave' ? ['employee_request','supervisor_proxy'] : ['self_request','supervisor_proxy','supervisor_proxy_auto_approved'];
    return ['leave','overtime'].includes(kind) && row.status === 'approved' && modes.includes(row.approval_mode);
}
function renderApprovedCorrectionActions(kind, row) {
    if (state.dashboard?.role !== 'admin' || !acEligible(kind,row)) return '';
    const canEdit = hasCurrentAdminPermission(`admin.${kind}.approvedCorrect`) && !state.dashboard?.impersonation?.active;
    const count = row.correctionSummary?.count || 0;
    return `<button type="button" class="mini-btn" data-ac-open="${kind}" data-id="${acEscape(row.id)}">${canEdit ? '更正已核准申請' : '查看更正歷程'}${count ? `（${count}）` : ''}</button>`;
}
function acTime(value) { if(value==null||value==='')return '未記錄';const at=Number(value); return Number.isFinite(at) ? new Date(at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}) : '未記錄'; }
function acDateTime(value) { if(value==null||value==='')return{date:'',time:''};const at=Number(value);if(!Number.isFinite(at))return{date:'',time:''};const text=new Date(at+8*3600000).toISOString();return{date:text.slice(0,10),time:text.slice(11,16)}; }
function acActor(id) { const person=(state.dashboard?.datasets?.employees || []).find(row=>row.id===id);return person ? `${id} ${person.name}` : id || '操作者未記錄'; }
function acModeLabel(mode) { return {legacy_range:'原連續區間',explicit_dates:'逐日日期',explicit_segments:'明確時段'}[mode] || '原連續區間'; }
function acSnapshot(row,kind=approvedCorrectionState.kind) {
    const leave=kind==='leave'||(kind!=='overtime'&&Boolean(row.leaveTypeId||row.leave_type_id));
    const rest=row.breakMinutes ?? row.break_minutes;
    const fields=[['開始',row.startDate ? `${row.startDate} ${row.startTime}` : acTime(row.start_at)],['結束',row.endDate ? `${row.endDate} ${row.endTime}` : acTime(row.end_at)],['整筆時數',row.durationHours ?? row.duration_hours],...(!leave?[['休息',rest==null?'未記錄':`${rest} 分鐘`]]:[]),...(leave?[['假別',row.leaveTypeName || row.leaveTypeId || row.leave_type_id || '—'],['日期模式',acModeLabel(row.dateSelectionMode || row.date_selection_mode)]]:[]),['申請事由',row.reason || '未填寫']];
    const segments=row.leaveSegments || row.leave_segments || [],daily=row.dailyHours || row.daily_hours || [];
    return `<dl class="ac-snapshot">${fields.map(([label,value])=>`<div><dt>${label}</dt><dd>${acEscape(value)}</dd></div>`).join('')}</dl>${segments.length?`<ul>${segments.map(part=>`<li>${acEscape(part.date || acDateTime(part.startAt).date)} ${acEscape(acDateTime(part.startAt).time)}–${acEscape(acDateTime(part.endAt).time)} · ${acEscape(part.hours)} 小時${part.breakMinutes==null?'':` · 休息 ${acEscape(part.breakMinutes)} 分鐘`}</li>`).join('')}</ul>`:Array.isArray(daily)&&daily.length?`<ul>${daily.map(part=>`<li>${acEscape(part.date)} · ${acEscape(part.hours)} 小時</li>`).join('')}</ul>`:''}${Array.isArray(row.accountingDailyHours)&&row.accountingDailyHours.length ? `<section class="ac-accounting"><h5>帳務每日分配（原日期模式保留）</h5><ul>${row.accountingDailyHours.map(part=>`<li>${acEscape(part.date)} · ${acEscape(part.hours)} 小時</li>`).join('')}</ul></section>` : ''}${row.accountingPreviewPending ? '<p class="ac-accounting-pending">帳務每日分配：待儲存時依新資料核對，不沿用原分配。</p>' : ''}`;
}
function acAfterSnapshot(original, pending, kind=approvedCorrectionState.kind) {
    const after = { ...original, ...pending };
    if (pending.leaveTypeId) after.leaveTypeName = (state.dashboard?.datasets?.leave?.leaveTypes || []).find(type => type.id === pending.leaveTypeId)?.name || pending.leaveTypeId;
    const allocationChanged = ['startDate','endDate','startTime','endTime','durationHours','dateSelectionMode','dailyHours','leaveSegments','leaveTypeId'].some(key => Object.hasOwn(pending,key));
    if (!allocationChanged || kind==='overtime' || (kind!=='leave'&&!original.leaveTypeId&&!original.leave_type_id&&!pending.leaveTypeId)) return after;
    // Preview accounting from the reviewed new timing, never from the original allocation.
    let daily = Array.isArray(pending.dailyHours) ? pending.dailyHours : null;
    if (!daily && Array.isArray(pending.leaveSegments)) {
        const units = new Map();
        for (const part of pending.leaveSegments) { const date = part.date || acDateTime(part.startAt).date; units.set(date, (units.get(date) || 0) + Math.round(Number(part.hours) * 100)); }
        daily = [...units].map(([date,amount]) => ({date,hours:amount / 100}));
    }
    if (daily && daily.length && daily.every(part => part.date && Number.isFinite(Number(part.hours)) && Number(part.hours) > 0)) {
        after.accountingDailyHours = daily.map(part => ({date:part.date,hours:Number(part.hours)}));
    } else if (pending.startDate && pending.endDate && pending.endTime && Number(pending.durationHours) > 0 && pending.startDate === acDateTime(Date.parse(pending.endDate + 'T' + pending.endTime + ':00+08:00') - 1).date) {
        after.accountingDailyHours = [{date:pending.startDate,hours:Number(pending.durationHours)}];
    } else {
        after.accountingDailyHours = [];
        after.accountingPreviewPending = true;
    }
    return after;
}
function acHistory(history) {
    return `<section class="ac-history"><h4>更正歷程</h4>${history.length ? history.map(item=>`<details><summary>${acEscape(acTime(item.correctedAt))} · ${acEscape(acActor(item.actorId))}</summary><p>更正原因：${acEscape(item.reason)}</p><div class="ac-compare"><section><h5>更正前</h5>${acSnapshot(item.before || {})}</section><section><h5>更正後</h5>${acSnapshot(item.after || {})}</section></div></details>`).join('') : '<p>尚無更正紀錄。</p>'}</section>`;
}
function acField(label,name,type,value,extra='') { return `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${acEscape(value)}" ${extra} required></label>`; }
function acForm(kind, record) {
    const start=acDateTime(record.start_at),end=acDateTime(record.end_at),mode=record.dateSelectionMode || record.date_selection_mode || 'legacy_range';
    const rest=record.breakMinutes ?? record.break_minutes;
    const types=state.dashboard?.datasets?.leave?.leaveTypes || [];
    const currentType=record.leaveTypeId || record.leave_type_id;
    const choices=types.some(type=>type.id===currentType)?types:[{id:currentType,name:record.leaveTypeName || currentType},...types];
    return `<form data-ac-form data-ac-mode="${acEscape(mode)}"><label class="ac-check"><input type="checkbox" name="editTiming">更改日期／時間／${kind==='leave'?'假別／':''}時數</label><p>不勾選時，只更正事由；原時間（含秒）、每日分配、時數及休息資料完整保留。更改舊加班時段時才須人工確認休息。</p><fieldset data-ac-timing disabled><div class="ac-period">${acField('開始日期','startDate','date',start.date)}${acField('開始時間','startTime','time',start.time)}${acField('結束日期','endDate','date',end.date)}${acField('結束時間','endTime','time',end.time)}${kind==='leave'?`<label class="field"><span>假別</span><select name="leaveTypeId" required>${choices.filter(type=>type.enabled!==false||type.id===currentType).map(type=>`<option value="${acEscape(type.id)}" ${type.id===currentType?'selected':''}>${acEscape(type.name)}</option>`).join('')}</select></label>`:acField('休息（分鐘）','breakMinutes','number',rest==null?'':rest,'min="0" step="1"')}${acField('扣除後整筆時數','durationHours','number',record.duration_hours,kind==='overtime'||mode!=='legacy_range'?'readonly min="0.01" step="0.01"':'min="0.01" step="0.01"')}</div>
    ${kind==='leave'?`<div data-ac-leave-editor>${mode==='legacy_range'?'<p>舊單沿用原起訖與整筆時數，不推算每日分配。</p><button type="button" class="outline-btn" data-ac-action="precise">改用明確時段（須重新核對清單）</button>':mode==='explicit_segments'?renderLeaveDaysEditor():renderLegacyLeaveDaysEditor()}</div>`:rest==null?'<label class="ac-check"><input name="confirmLegacyBreak" type="checkbox" required>原單休息未記錄；確認本次填寫的休息分鐘為人工核對值，不是系統倒推。</label>':''}
    </fieldset><label class="field"><span>申請事由</span><textarea name="reason" rows="3">${acEscape(record.reason || '')}</textarea></label><label class="field"><span>本次更正原因（必填，與申請事由分開）</span><textarea name="correctionReason" rows="3" maxlength="500" required></textarea></label>
    <p>原員工、申請人、核准狀態與原審核紀錄保留；更正另記操作者、時間及前後內容。此操作不建立紙本替代單。</p>
    <button type="submit" class="primary-btn">預覽更正前後內容</button></form><section class="ac-preview" hidden></section>`;
}
function acPeriod(values) {
    const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
    if(!validDate(values.startDate)||!validDate(values.endDate)||![values.startTime,values.endTime].every(value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value||'')))throw new Error('請填寫有效的完整起訖日期時間。');
    const minutes=(Date.parse(values.endDate+'T'+values.endTime+':00+08:00')-Date.parse(values.startDate+'T'+values.startTime+':00+08:00'))/60000;
    if(!(minutes>0))throw new Error('結束必須晚於開始；跨夜請填完整結束日期。');return minutes;
}
function acNetHours(values) { const minutes=acPeriod(values),rest=Number(values.breakMinutes);if(!/^\d+$/.test(String(values.breakMinutes))||!Number.isSafeInteger(rest)||rest<0||rest>=minutes)throw new Error('休息須為 0 以上整數，且小於起訖總分鐘。');return Math.floor((minutes-rest)*100/60)/100; }
function acCollect(form, kind, original) {
    const fields=Object.fromEntries(new FormData(form));
    const body={requestId:original.id,revision:approvedCorrectionState.data.revision,correctionReason:String(fields.correctionReason||'').trim(),reason:String(fields.reason||'').trim()};
    if(body.correctionReason.length>500)throw new Error('本次更正原因最多 500 字。');
    if(!body.correctionReason)throw new Error('請填寫本次更正原因。');
    if(!fields.editTiming)return body;
    Object.assign(body,Object.fromEntries(['startDate','startTime','endDate','endTime'].map(key=>[key,fields[key]])));
    if(kind==='overtime') {
        body.breakMinutes=fields.breakMinutes;body.durationHours=acNetHours({...body,breakMinutes:fields.breakMinutes});
        if((original.breakMinutes ?? original.break_minutes)==null){if(!fields.confirmLegacyBreak)throw new Error('請明確確認原單休息未記錄與本次人工核對值。');body.confirmLegacyBreak=true;}
    } else {
        body.leaveTypeId=fields.leaveTypeId;
        if(!body.leaveTypeId)throw new Error('請選擇假別。');
        if(form.dataset.acMode==='legacy_range') {const hours=Number(fields.durationHours);if(!/^\d+(\.\d{1,2})?$/.test(String(fields.durationHours))||!(hours>0)||hours>acPeriod(body)/60)throw new Error('請核對舊單整筆實際時數。');body.dateSelectionMode='legacy_range';body.durationHours=hours;}
        else Object.assign(body,collectLeaveDays(form));
    }
    return body;
}
function acLive(sequence, dialog) { return approvedCorrectionState.sequence===sequence && approvedCorrectionState.dialog===dialog && dialog.isConnected && approvedCorrectionState.identity===acIdentity(); }
function acClose(force=false) {
    const s=approvedCorrectionState;if(s.busy&&!force)return false;
    if(!force&&s.dirty&&!window.confirm('尚有未保存的更正內容，確定捨棄並關閉？'))return false;
    s.dialog?.remove();Object.assign(s,{dialog:null,data:null,dirty:false,busy:false,pending:null,sequence:s.sequence+1});return true;
}
async function openApprovedCorrection(kind,id) {
    if(state.dashboard?.role!=='admin'||!['leave','overtime'].includes(kind))return;
    if(!acClose())return;
    const s=approvedCorrectionState,sequence=++s.sequence,dialog=document.createElement('dialog');
    Object.assign(s,{dialog,identity:acIdentity(),kind,requestId:id,dirty:false,busy:false,pending:null});
    dialog.id='approved-correction-dialog';dialog.className='ac-dialog';dialog.setAttribute('aria-labelledby','ac-title');dialog.innerHTML='<header><h3 id="ac-title">已核准申請更正／歷程</h3><div class="ac-header-actions"><button type="button" class="outline-btn" data-action="wb-help">操作說明</button><button type="button" class="outline-btn" data-ac-action="close">關閉</button></div></header><div class="ac-message" role="status" aria-live="polite"></div><div class="ac-content">讀取中…</div>';
    dialog.addEventListener('cancel',event=>{event.preventDefault();acClose();});document.body.append(dialog);dialog.showModal();
    try {
        const result=await requestJson(`/api/browser/admin/${kind}/approved-correction?${new URLSearchParams({requestId:id})}`,{auth:true});if(!acLive(sequence,dialog))return;
        const data=result.correction;s.data=data;
        const record=data.record;
        dialog.querySelector('.ac-content').innerHTML=`<section class="ac-original"><h4>原申請與原核准</h4><p>核准狀態：${acEscape(record.statusText || '已核准')}（保留原紀錄）</p><p>員工：${acEscape(record.employeeId || record.employee_id)} ${acEscape(record.employeeName || '')} · 申請人：${acEscape(record.applicantId || record.applicant_id || '未記錄')} ${acEscape(record.applicantName || '')}</p>${acSnapshot(record)}${typeof renderRequestReviewProgress==='function'?renderRequestReviewProgress(record):''}</section>${data.canCorrect?acForm(kind,record):'<p>唯讀更正歷程；目前沒有更正權限或為身份模擬。</p>'}${acHistory(data.history||[])}`;
        const form=dialog.querySelector('[data-ac-form]');if(form&&kind==='leave'&&form.dataset.acMode!=='legacy_range')syncLeaveDaysEditor(form,{request:record});
    }catch(error){if(acLive(sequence,dialog))dialog.querySelector('.ac-message').textContent=error.message;}
}
async function acSave() {
    const s=approvedCorrectionState,dialog=s.dialog,sequence=s.sequence;
    if(!dialog||!s.pending||s.busy||!s.data?.canCorrect||s.identity!==acIdentity())return;
    s.busy=true;dialog.querySelectorAll('button,input,select,textarea').forEach(control=>{control.dataset.acWasDisabled=String(control.disabled);control.disabled=true;});
    try {const result=await requestJson(`/api/browser/admin/${s.kind}/approved-correction`,{auth:true,method:'POST',body:{...s.pending,confirm:true}});if(!acLive(sequence,dialog))return;s.busy=false;s.dirty=false;acClose(true);await reloadDashboard(result.message||'已核准申請已更正，原審核紀錄保留。');}
    catch(error){if(acLive(sequence,dialog))dialog.querySelector('.ac-message').textContent=error.message;}
    finally{if(acLive(sequence,dialog)){s.busy=false;dialog.querySelectorAll('button,input,select,textarea').forEach(control=>{control.disabled=control.dataset.acWasDisabled==='true';});}}
}
document.addEventListener('input',event=>{
    const form=event.target.closest?.('[data-ac-form]');if(!form||approvedCorrectionState.busy)return;
    approvedCorrectionState.dirty=true;approvedCorrectionState.pending=null;const preview=approvedCorrectionState.dialog?.querySelector('.ac-preview');if(preview)preview.hidden=true;
    if(event.target.name==='editTiming')form.querySelector('[data-ac-timing]').disabled=!event.target.checked;
    if(approvedCorrectionState.kind==='overtime'&&form.elements.editTiming?.checked){try{form.elements.durationHours.value=acNetHours(Object.fromEntries(new FormData(form)));}catch{form.elements.durationHours.value='';}}
});
document.addEventListener('change',event=>{if(event.target.closest?.('[data-ac-form]'))event.target.dispatchEvent(new Event('input',{bubbles:true}));});
document.addEventListener('submit',event=>{
    const form=event.target.closest?.('[data-ac-form]');if(!form)return;event.preventDefault();const s=approvedCorrectionState;
    if(s.busy||!s.data?.canCorrect||s.identity!==acIdentity())return;
    try {if(!form.reportValidity())return;s.pending=acCollect(form,s.kind,s.data.record);const preview=s.dialog.querySelector('.ac-preview');preview.innerHTML=`<h4>確認更正前後內容</h4><div class="ac-compare"><section><h5>更正前</h5>${acSnapshot(s.data.record)}</section><section><h5>更正後</h5>${acSnapshot(acAfterSnapshot(s.data.record,s.pending))}</section></div><p>本次更正原因：${acEscape(s.pending.correctionReason)}</p><button type="button" class="primary-btn" data-ac-action="save">確認保存更正</button><button type="button" class="outline-btn" data-ac-action="edit">返回修改</button>`;preview.hidden=false;preview.scrollIntoView?.({block:'nearest'});}
    catch(error){s.dialog.querySelector('.ac-message').textContent=error.message;}
});
document.addEventListener('click',event=>{
    const help=event.target.closest?.('.ac-dialog [data-action="wb-help"]');if(help){event.preventDefault();if(typeof openWorkbenchHelp==='function')openWorkbenchHelp();return;}
    const open=event.target.closest?.('[data-ac-open]');if(open){event.preventDefault();openApprovedCorrection(open.dataset.acOpen,open.dataset.id);return;}
    const button=event.target.closest?.('[data-ac-action]');if(!button)return;event.preventDefault();const s=approvedCorrectionState;if(s.busy)return;
    if(button.dataset.acAction==='close')acClose();
    if(button.dataset.acAction==='save')acSave();
    if(button.dataset.acAction==='edit'){s.pending=null;s.dialog.querySelector('.ac-preview').hidden=true;}
    if(button.dataset.acAction==='precise'){const form=button.closest('form');form.dataset.acMode='explicit_segments';form.querySelector('[data-ac-leave-editor]').innerHTML=renderLeaveDaysEditor();form.elements.durationHours.readOnly=true;syncLeaveDaysEditor(form,{reset:true});s.dirty=true;s.pending=null;s.dialog.querySelector('.ac-preview').hidden=true;}
});
const acPreviousRender=renderDashboard;
renderDashboard=function renderWithApprovedCorrectionCleanup(dashboard){const next=`${state.token||''}/${dashboard.role||''}/${dashboard.user?.id||''}`;if(approvedCorrectionState.dialog&&next!==approvedCorrectionState.identity)acClose(true);return acPreviousRender(dashboard);};
const acPreviousLogout=handleLogout;
handleLogout=function logoutWithApprovedCorrectionCleanup(...args){acClose(true);return acPreviousLogout(...args);};

const acPreviousReviewProgress = typeof renderRequestReviewProgress === 'function' ? renderRequestReviewProgress : () => '';
function renderApprovedCorrectionIndicator(row) {
    const summary = row?.correctionSummary;
    if (!summary?.count) return '';
    return '<aside class="ac-correction-indicator" aria-label="已核准申請更正紀錄"><strong>已更正 ' + acEscape(summary.count) + ' 次</strong><span>最近：' + acEscape(acTime(summary.lastAt)) + ' · ' + acEscape(acActor(summary.lastActorId)) + '</span><p>更正原因：' + acEscape(summary.lastReason || '未記錄') + '</p><small>原核准狀態與審核紀錄保留；更正前後內容另記歷程。</small></aside>';
};

renderRequestReviewProgress = function renderProgressWithApprovedCorrection(row) { return (acPreviousReviewProgress(row) || '') + renderApprovedCorrectionIndicator(row); };
