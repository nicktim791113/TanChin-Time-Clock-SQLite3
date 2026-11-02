const assert=require('node:assert/strict');const {test}=require('node:test');const {usageRange,usageAmount,buildLeaveUsage}=require('../leave-usage');
const {startFixture}=require('./fixtures/browser-server');const Database=require('better-sqlite3');const XLSX=require('xlsx');
const at=text=>Date.parse(text+'+08:00'),range=()=>usageRange({startDate:'2026-11-01',endDate:'2026-11-01'});
const request=(extra={})=>({id:'one',employee_id:'E001',leave_type_id:'annual',status:'approved',start_at:at('2026-11-01T08:00:00'),end_at:at('2026-11-01T17:00:00'),duration_hours:8,...extra});
test('usage range rejects partial, invalid and reverse dates and uses inclusive Taipei end',()=>{
 for(const values of [{},{startDate:'2026-11-01'},{startDate:'2026-02-30',endDate:'2026-03-01'},{startDate:'2026-11-02',endDate:'2026-11-01'}])assert.throws(()=>usageRange(values));
 assert.equal(range().end-range().start,86400000);
});
test('recorded daily or segment hours split exactly while boundary legacy hours remain unknown',()=>{
 const legacy=request({start_at:at('2026-10-31T08:00:00'),end_at:at('2026-11-02T17:00:00'),duration_hours:16});
 assert.deepEqual(usageAmount(legacy,range()),{hours:null,basis:'boundary_unknown'});
 assert.equal(usageAmount(legacy,range(),[{date:'2026-10-31',hours:8},{date:'2026-11-01',hours:8}]).hours,8);
 assert.equal(usageAmount(legacy,range(),[{date:'2026-02-30',hours:16}]).basis,'invalid_daily');
 assert.equal(usageAmount(request(),range()).hours,8);
 const explicit=request({date_selection_mode:'explicit_dates',start_at:at('2026-11-01T08:00:00'),end_at:at('2026-11-02T17:00:00'),duration_hours:12,daily_hours:[{date:'2026-11-01',hours:4},{date:'2026-11-02',hours:8}]});
 assert.deepEqual(usageAmount(explicit,range()),{hours:4,basis:'daily'});
 const segments=request({date_selection_mode:'explicit_segments',duration_hours:3,start_at:at('2026-11-01T09:00:00'),end_at:at('2026-11-02T15:00:00'),leave_segments:[{date:'2026-11-01',startAt:at('2026-11-01T09:00:00'),endAt:at('2026-11-01T10:00:00'),hours:1},{date:'2026-11-02',startAt:at('2026-11-02T13:00:00'),endAt:at('2026-11-02T15:00:00'),hours:2}]});
 assert.equal(usageAmount(segments,range()).hours,1);
});
test('overview retains zero-use people and disabled types, separates pending and excludes rejected records',()=>{
 const result=buildLeaveUsage({employees:[{id:'E001',name:'One'},{id:'E002',name:'Zero'}],types:[{id:'annual',name:'Annual',enabled:false}],range:range(),requests:[request(),request({id:'pending',status:'pending_admin',duration_hours:2}),request({id:'excluded',status:'rejected',duration_hours:99}),request({id:'unknown',start_at:at('2026-10-31T08:00:00')})]});
 assert.equal(result.employees.length,2);assert.equal(result.types[0].enabled,false);assert.deepEqual(result.employees[1].total,{approvedHours:0,pendingHours:0,approvedCount:0,pendingCount:0,unknownCount:0});
 const total=result.employees[0].total;assert.equal(total.approvedHours,8);assert.equal(total.pendingHours,2);assert.equal(total.unknownCount,1);assert.equal(result.details.length,3);
});
test('usage HTTP permissions, >3000 complete totals, drilldown, filtered Excel and zero people remain consistent and read-only',async(t)=>{
 const f=await startFixture();const {db,url}=f;db.setSetting('browserSecuritySettings',{deviceBindingEnabled:false,gpsRequiredOnPunch:false});
 const sql=new Database(f.databasePath);t.after(async()=>{sql.close();await f.close();});
 const insert=sql.prepare('INSERT INTO leave_requests(id,employee_id,applicant_id,leave_type_id,start_at,end_at,duration_hours,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)');
 sql.transaction(()=>{for(let i=0;i<3501;i++)insert.run('bulk-'+i,'E001','E001','annual',at('2026-11-01T09:00:00'),at('2026-11-01T10:00:00'),1,'approved',i,i);insert.run('other-type','E001','E001','personal',at('2026-11-01T09:00:00'),at('2026-11-01T11:00:00'),2,'pending_supervisor',5000,5000);})();
 async function call(route,token,body){const response=await fetch(url+'/api/browser'+route,{method:body?'POST':'GET',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,data:await response.json()};}
 async function login(id,role){const first=await call('/login',null,{employeeId:id,secret:id==='E001'?'employee-card':id+'-test-password',role:'account'});return first.data.dashboard.role==='workspace'?(await call('/workspace',first.data.token,{role})).data:first.data;}
 const admin=await login('A001','admin'),limited=await login('A002','admin'),employee=await login('E001','employee');const route='/admin/leave/usage?startDate=2026-11-01&endDate=2026-11-01';
 for(const [token,status]of [[null,401],[limited.token,403],[employee.token,403]])assert.equal((await call(route,token)).status,status);
 const before=JSON.stringify(sql.prepare('SELECT * FROM leave_requests ORDER BY id').all());
 const report=(await call(route,admin.token)).data.usage;assert.equal(report.total.approvedHours,3501);assert.equal(report.total.pendingHours,2);assert.ok(report.employees.some(person=>person.employeeId==='A001'&&person.total.approvedHours===0));
 const detail=(await call(route+'&employeeId=E001&leaveTypeId=annual&page=234',admin.token)).data.usage;assert.equal(detail.totalCount,3501);assert.equal(detail.details.length,6);assert.equal(detail.total.approvedHours,3501);assert.equal(detail.total.pendingHours,0);assert.equal(detail.types.length,1);
 const zero=(await call(route+'&department=NO_MATCH',admin.token)).data.usage;assert.equal(zero.totalCount,0);assert.equal(zero.total.approvedHours,0);
 const exported=await fetch(url+'/api/browser'+route.replace('/usage?','/usage/export?')+'&employeeId=E001&leaveTypeId=annual',{headers:{Authorization:'Bearer '+admin.token}});assert.equal(exported.status,200);
 const workbook=XLSX.read(Buffer.from(await exported.arrayBuffer()),{type:'buffer'}),rows=XLSX.utils.sheet_to_json(workbook.Sheets['請假使用總覽'],{header:1});assert.equal(rows.length,2);assert.equal(rows[1][0],'E001');assert.equal(rows[1][3],3501);assert.equal(rows[0].length,6);
 assert.equal(JSON.stringify(sql.prepare('SELECT * FROM leave_requests ORDER BY id').all()),before);
});
test('usage export drops stale response or blob after account changes and snapshots its filters',async()=>{
 const vm=require('node:vm'),fs=require('node:fs');
 for(const phase of ['response','blob']){
  const listeners={},requests=[],downloads=[];let resolveFetch,resolveBlob;
  const state={token:'old-token',dashboard:{role:'admin',user:{id:'A001'}}};
  const context=vm.createContext({state,URLSearchParams,escapeHtml:String,renderDashboard(){},handleLogout(){},handleRealtimeSyncMessage(){},postRenderSetup(){},setTimeout(){},requestJson(){},URL:{createObjectURL:()=>{downloads.push('url');return 'blob:test';},revokeObjectURL(){}},document:{getElementById:()=>null,addEventListener:(type,fn)=>(listeners[type]||=[]).push(fn),createElement:()=>({click:()=>downloads.push('click')})},fetch:(url,options)=>{requests.push({url,options});return new Promise(resolve=>resolveFetch=resolve);}});
  vm.runInContext(fs.readFileSync(require.resolve('../browser-client/leave-usage.js'),'utf8'),context);
  vm.runInContext("Object.assign(leaveUsageState,{identity:'old',filters:{startDate:'2026-11-01',endDate:'2026-11-30'},error:''})",context);
  const button={dataset:{luAction:'export'},isConnected:true};
  const active=listeners.click[0]({preventDefault(){},target:{closest:()=>button}});
  assert.match(requests[0].url,/startDate=2026-11-01/);assert.equal(requests[0].options.headers.Authorization,'Bearer old-token');
  if(phase==='response'){state.token='new-token';vm.runInContext("leaveUsageState.identity='new'",context);resolveFetch({ok:true,blob:async()=>Buffer.from('private')});}
  else{resolveFetch({ok:true,blob:()=>new Promise(resolve=>resolveBlob=resolve)});await new Promise(setImmediate);state.token='new-token';vm.runInContext("leaveUsageState.identity='new'",context);resolveBlob(Buffer.from('private'));}
  await active;assert.equal(downloads.length,0);assert.equal(vm.runInContext('leaveUsageState.error',context),'');
 }
});
test('logout clears modal and pending report without needing a dashboard render; detail rejects token-only changes',async()=>{
 const vm=require('node:vm'),fs=require('node:fs'),pending=[];let removed=0,logoutCalls=0;
 const body={innerHTML:'',textContent:''},dialog={isConnected:true,dataset:{},querySelector:()=>body,remove(){removed++;this.isConnected=false;}};
 const state={token:'one',dashboard:{role:'admin'}};
 const context=vm.createContext({state,URLSearchParams,escapeHtml:String,document:{addEventListener(){},getElementById:id=>id==='leave-usage-detail'?dialog:null},renderDashboard(){},postRenderSetup(){},handleLogout(){logoutCalls++;},handleRealtimeSyncMessage(){},requestJson:()=>new Promise(resolve=>pending.push(resolve))});
 vm.runInContext(fs.readFileSync(require.resolve('../browser-client/leave-usage.js'),'utf8'),context);
 vm.runInContext("Object.assign(leaveUsageState,{identity:'one',filters:{startDate:'2026-11-01',endDate:'2026-11-30'}})",context);
 const load=context.luLoad();context.handleLogout();pending[0]({usage:{page:1,employees:[{employeeId:'PRIVATE'}]}});await load;
 assert.equal(removed,1);assert.equal(logoutCalls,1);assert.equal(vm.runInContext('leaveUsageState.data',context),null);assert.equal(vm.runInContext('leaveUsageState.identity',context),'');
 context.dialog=dialog;dialog.isConnected=true;dialog.dataset={employee:'E001',type:'annual'};
 const detail=vm.runInContext('luDetail(dialog)',context);state.token='two';pending[1]({usage:{range:{},details:[{reason:'PRIVATE'}]}});await detail;
 assert.doesNotMatch(body.innerHTML,/PRIVATE/);assert.equal(body.textContent,'');
});
