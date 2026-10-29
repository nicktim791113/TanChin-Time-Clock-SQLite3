const test = require('node:test');
const assert = require('node:assert/strict');
const { attachSupervisorRoutes } = require('../supervisor-routes');
const fs = require('node:fs'), vm = require('node:vm');
function fixture() {
    const routes = {}, reads = []; let assigned = [{ id:'E1',name:'一' }, { id:'E2',name:'二' }];
    const roster = [...assigned, { id:'S',name:'主管' }];
    const at = Date.parse('2026-10-15T09:00:00+08:00');
    const rows = Array.from({length:122}, (_,i) => ({ id:'r'+i,employee_id:i%2?'E1':'E2',applicant_id:'S',start_at:at+i*60000,end_at:at+i*60000+60000,created_at:i,duration_hours:1/60,status:i%2?'approved':'pending_supervisor' }));
    const store = { assignedEmployees:()=>assigned, reasonPresets:()=>({values:[],revision:0}) };
    const calendar = ({month,employeeId}) => ({ month,days:[{date:'2026-10-15',serving:true,cutoff:'09:00',deadline:at,locked:true,revision:1,version:'v',rows:[{employee_id:employeeId,eating:employeeId==='E1',eligible:true,submittedEating:null}]}] });
    attachSupervisorRoutes({get:(url,...h)=>routes[url]=h.at(-1),post(){}},{
        db:{getSupervisors:()=>store,loadEmployees:()=>roster,queryLeaveRequests:o=>{reads.push(o);return rows.filter(r=>r.employee_id===o.employeeId)},queryOvertimeRequests:o=>{reads.push(o);return rows.filter(r=>r.employee_id===o.employeeId)},getMeals:()=>({calendar,dayState:()=>({version:'v',rows:[]})}),loadLeaveTypes:()=>[],getLeaveEntitlements:()=>({balances:()=>[]})},
        requireSession(){},requireRole:()=>()=>{},requirePermission:()=>()=>{},validateBoundDevice(){},buildLookup:()=>({employeeMap:new Map(roster.map(e=>[e.id,e]))}),formatRecord:(_kind,r)=>({id:r.id,employeeId:r.employee_id,applicantId:r.employee_id})
    });
    const get=(query={},simulation=false)=>{let result,status=200;routes['/api/browser/employee/supervisor']({query:{month:'2026-10',...query},browserSession:{role:'employee',employeeId:'S',authMethod:'web_password',...(simulation?{realRole:'developer',impersonation:{active:true,targetEmployeeId:'S'}}:{})}},{status(n){status=n;return this},json(body){result=body}});return {status,...result}};
    return {get,reads,roster, revoke:()=>assigned=assigned.slice(0,1)};
}
test('merge all authorized rows before pagination and count calendar across people',()=>{
 const f=fixture(), a=f.get({employeeIds:'E1,E2'}),b=f.get({employeeIds:['E2','E1'],page:'2'}),c=f.get({employeeIds:'E1,E2',page:'3'});
 assert.equal(a.status,200);assert.equal(a.proxy.calendar.totalCount,122);assert.equal(a.proxy.calendar.detail.totalCount,122);
 assert.equal(a.proxy.calendar.detail.records.length,50);assert.equal(b.proxy.calendar.detail.records.length,50);assert.equal(c.proxy.calendar.detail.records.length,22);
 const all=[...a.proxy.calendar.detail.records,...b.proxy.calendar.detail.records,...c.proxy.calendar.detail.records];assert.equal(new Set(all.map(r=>r.id)).size,122);assert.equal(all[0].id,'r121');assert.ok(f.reads.every(q=>q.limit===null));
 assert.deepEqual(new Set(all.map(r=>r.employeeId)),new Set(['E1','E2']));assert.equal(all[0].applicantId,'S');assert.equal(all[0].applicantName,'主管');
});
test('default and legacy single employee query remain compatible; repeated and duplicate ids deduplicate',()=>{
 const f=fixture();assert.deepEqual(f.get().proxy.employeeIds,['E1']);assert.deepEqual(f.get({employeeId:'E2'}).proxy.employeeIds,['E2']);assert.deepEqual(f.get({employeeIds:['E1','E1,E2']}).proxy.employeeIds,['E1','E2']);
});
test('explicit empty selection reads no person and never falls back',()=>{const f=fixture(),r=f.get({employeeIds:''});assert.equal(r.status,200);assert.deepEqual(r.proxy.employeeIds,[]);assert.equal(r.proxy.calendar.detail.totalCount,0);assert.equal(f.reads.length,0);assert.equal(r.proxy.meals.days.length,0)});
test('invalid or mixed selections fail closed before request reads',()=>{for(const query of [{employeeIds:'E1,X'},{employeeIds:'E1',employeeId:'E2'},{employeeIds:'E1,'},{employeeIds:{bad:true}},{employeeIds:Array.from({length:101},(_,i)=>'X'+i)}]){const f=fixture(),r=f.get(query);assert.ok([400,403].includes(r.status));assert.equal(f.reads.length,0)}});
test('revoked selection fails before any read; still-authorized terminated history remains visible',()=>{let f=fixture();f.revoke();assert.equal(f.get({employeeIds:'E1,E2'}).status,403);assert.equal(f.reads.length,0);f=fixture();f.roster[1].termination_date='2020-01-01';assert.equal(f.get({employeeIds:'E1,E2'}).status,200)});
test('meal merged rows include only selected employees; overtime and date filtering keep all matching rows',()=>{const f=fixture(),r=f.get({employeeIds:'E1,E2',kind:'overtime',date:'2026-10-15'});assert.equal(r.proxy.calendar.detail.totalCount,122);assert.deepEqual(r.proxy.meals.days[0].rows.map(r=>r.employee_id),['E1','E2']);assert.equal(f.get({employeeIds:'E1,E2',date:'2026-10-16'}).proxy.calendar.detail.totalCount,0)});

test('simulation may read merged authorized history but reports readonly',()=>{const r=fixture().get({employeeIds:'E1,E2'},true);assert.equal(r.status,200);assert.equal(r.proxy.canWrite,false);assert.equal(r.proxy.reasonPresets.canEdit,false)});
function ui() {
 const state={token:'t',dashboard:{role:'employee',supervisorProxy:{canUse:true}},activeSections:{}};
 const context=vm.createContext({state,Date,URLSearchParams,auditActionLabels:{},auditTargetTypeLabels:{},ui:{},
 escapeHtml:v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
 document:{addEventListener(){},getElementById(){return null}},renderDashboard(){},renderEmployeeWorkspaceItems(){return[]},renderAdminPermissionAwareContent(){},renderSystemAdminDashboard(){},postRenderSetup(){},handleDashboardClick(event){if(event.target.closest('[data-action]').dataset.action==='paper-clear-employees') context.fixtureInputs.forEach(i=>i.checked=false);else if(event.target.closest('[data-action]').dataset.action==='paper-select-visible-employees') context.fixtureInputs.forEach(i=>i.checked=true)},handleDashboardChange(){},handleDashboardSubmit(){},handleRealtimeSyncMessage(){},handleLogout(){},setMessage(){},hasCurrentAdminPermission(){return false},renderAdminLeaveRouteRows(){return''},renderLeaveDaysSummary(){return''}});
 vm.runInContext(fs.readFileSync('browser-client/supervisor.js','utf8'),context);return context;
}
test('record multi-selection is preserved in requests across date/kind, explicit clear stays empty, identity resets it',async()=>{
 const c=ui(),urls=[];c.requestJson=async url=>{urls.push(new URL(url,'http://fixture').searchParams);return{proxy:{employeeId:'E1',employeeIds:urls.at(-1).get('employeeIds')?.split(',').filter(Boolean)||[]}}};
 vm.runInContext("Object.assign(supervisorState,{month:'2026-10',date:'2026-10-15',proxyView:'records',recordEmployeeIds:['E1','E2']})",c);
 await vm.runInContext('spLoad()',c);assert.equal(urls[0].get('employeeIds'),'E1,E2');assert.equal(urls[0].has('employeeId'),false);
 vm.runInContext("supervisorState.kind='overtime';supervisorState.date='2026-10-16'",c);await vm.runInContext('spLoad()',c);assert.equal(urls[1].get('employeeIds'),'E1,E2');
 vm.runInContext('supervisorState.recordEmployeeIds=[]',c);await vm.runInContext('spLoad()',c);assert.equal(urls[2].get('employeeIds'),'');
 vm.runInContext("renderDashboard({role:'employee',user:{id:'new'}})",c);assert.equal(vm.runInContext('supervisorState.recordEmployeeIds',c),null);
});
test('merged record details show subject and applicant and withdrawal carries each row employee id',()=>{
 const c=ui();vm.runInContext("Object.assign(supervisorState,{kind:'leave',date:'2026-10-15',employeeId:'E1',form:'withdraw:r2',data:{canWrite:true,calendar:{detail:{records:[{id:'r2',employeeId:'E2',employeeName:'二',applicantId:'S',applicantName:'主管',canProxyWithdraw:true}],totalPages:1}}}})",c);
 const html=vm.runInContext('spRequestDetail()',c);assert.match(html,/對象：E2 二/);assert.match(html,/申請人：S 主管/);assert.match(html,/name="employeeId" value="E2"/);assert.match(html,/確認代 E2 二/);
});
test('merged meal details and calendar show selected people and nonzero count status classes',()=>{
 const c=ui();c.data={employees:[{id:'E1',name:'一'},{id:'E2',name:'二'}],meals:{days:[{date:'2026-10-15',serving:true,cutoff:'09:00',rows:[{employee_id:'E1',eligible:true,eating:true},{employee_id:'E2',eligible:true,eating:false}]}]}};
 vm.runInContext("Object.assign(supervisorState,{kind:'meals',proxyView:'records',date:'2026-10-15',month:'2026-10',data})",c);
 assert.match(vm.runInContext('spCalendar(data)',c),/用餐 1／不用餐 1/);const detail=vm.runInContext('spMealDetail()',c);assert.match(detail,/E1 一/);assert.match(detail,/E2 二/);
 c.data.calendar={days:[{date:'2026-10-15',totalCount:2,approvedCount:1,pendingCount:1}]};vm.runInContext("supervisorState.kind='leave'",c);const html=vm.runInContext('spCalendar(data)',c);assert.match(html,/sp-count-approved/);assert.match(html,/sp-count-pending/);assert.match(html,/2 件/);
});

test('record picker clear/select-visible actions reload explicit selection without populating create targets',async()=>{
 const c=ui();c.fixtureInputs=[{value:'E1',checked:true},{value:'E2',checked:true}];
 const field={querySelector:()=>c.fixtureInputs[0],querySelectorAll:()=>c.fixtureInputs.filter(i=>i.checked)};
 const button={dataset:{action:'paper-clear-employees'},closest:selector=>selector==='[data-paper-employee-field]'?field:null};c.event={target:{closest:()=>button},preventDefault(){}};
 const seen=[];c.requestJson=async url=>{const q=new URL(url,'http://fixture').searchParams;seen.push(q.get('employeeIds'));return{proxy:{employeeId:q.get('employeeIds')?'E1':'',employeeIds:q.get('employeeIds').split(',').filter(Boolean)}}};
 vm.runInContext("Object.assign(supervisorState,{month:'2026-10',proxyView:'records',recordEmployeeIds:['E1','E2']})",c);
 await vm.runInContext('handleDashboardClick(event)',c);assert.equal(seen[0],'');button.dataset.action='paper-select-visible-employees';await vm.runInContext('handleDashboardClick(event)',c);assert.equal(seen[1],'E1,E2');
 let selected;c.renderAdminPaperEmployeePicker=(_staff,_label,_selected,options)=>{selected=options.selectedIds;return''};vm.runInContext("supervisorState.data={employees:[{id:'E1'},{id:'E2'}]};spTargets()",c);assert.equal(selected.length,0);
});
