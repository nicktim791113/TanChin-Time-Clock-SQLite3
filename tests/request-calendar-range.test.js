const assert=require('node:assert/strict');const {test}=require('node:test');
const {monthRange,requestDateRange,attachRequestCalendarRoutes}=require('../request-calendar');
const at=text=>Date.parse(text+'+08:00');
function fixture(records){const routes=new Map(),calls=[];const query=filters=>{calls.push(filters);return records.filter(row=>row.end_at>filters.overlapStartAt&&row.start_at<=filters.overlapEndAt).slice(0,filters.limit===null?Infinity:3000);};
attachRequestCalendarRoutes({get:(url,...handlers)=>routes.set(url,handlers.at(-1))},{db:{queryLeaveRequests:query,queryOvertimeRequests:query,getRequestHistory:()=>({window:()=>({earliestMonth:'2026-10'})})},requireSession(){},requireRole:()=>()=>{},requirePermission:()=>()=>{},buildLookup:()=>({employeeMap:new Map([['E1',{name:'員工',department:'Test'}]]),typeMap:new Map([['annual',{name:'特休'}]])}),formatRecord:(_kind,row)=>({...row,employeeId:row.employee_id})});
return{calls,request:(query,role='admin',kind='leave')=>{let result,status=200;routes.get('/api/browser/'+role+'/'+kind+'/calendar')({query,browserSession:{employeeId:'E1'}},{json:value=>result=value,status(value){status=value;return this;}});return{status,...result};}};}
const row=(id,start,end)=>({id,employee_id:'E1',applicant_id:'E1',leave_type_id:'annual',status:'approved',start_at:at(start),end_at:at(end),duration_hours:1});
test('date range validates partial, invalid, reversed and role-bypassing bounds; blanks resolve exact Taipei month',()=>{
 const month=monthRange('2026-11'),range=requestDateRange({},month,'admin');assert.equal(range.start,at('2026-11-01T00:00:00'));assert.equal(range.end,at('2026-12-01T00:00:00'));
 for(const values of [{startDate:'2026-11-01'},{endDate:'2026-11-01'},{startDate:'2026-02-30',endDate:'2026-03-01'},{startDate:'2026-11-02',endDate:'2026-11-01'},{startDate:['2026-11-01'],endDate:'2026-11-02'}])assert.throws(()=>requestDateRange(values,month,'admin'));
 assert.throws(()=>requestDateRange({startDate:'2020-01-01',endDate:'2026-11-01'},month,'employee'),/管理者/);
 const same=requestDateRange({startDate:'2026-11-01',endDate:'2026-11-01'},month,'admin');assert.equal(same.end-same.start,86400000);
});
test('list covers the full chosen range, calendar intersects its month, counts remain independent of filters',()=>{
 const f=fixture([row('oct','2026-10-31T23:00:00','2026-11-01T00:00:00'),row('nov-first','2026-11-01T00:00:00','2026-11-01T01:00:00'),row('nov-last','2026-11-30T23:00:00','2026-12-01T00:00:00'),row('dec','2026-12-01T00:00:00','2026-12-01T01:00:00')]);
 const query={month:'2026-11',startDate:'2026-10-31',endDate:'2026-11-01'};
 const result=f.request(query).calendar;assert.equal(result.detail.totalCount,2);assert.equal(result.totalCount,1);assert.equal(result.unfilteredMonthCount,2);assert.equal(result.events.length,1);assert.equal(result.days[0].totalCount,1);assert.equal(result.days.at(-1).totalCount,0);
 const filtered=f.request({...query,employeeId:'foreign'}).calendar;assert.equal(filtered.detail.totalCount,0);assert.equal(filtered.unfilteredMonthCount,2);
 const day=f.request({...query,date:'2026-11-01'}).calendar;assert.equal(day.detail.totalCount,1);assert.equal(day.detail.records[0].id,'nov-first');
 const external=f.request({month:'2026-11',startDate:'2026-12-01',endDate:'2026-12-01'}).calendar;assert.equal(external.totalCount,0);assert.equal(external.detail.totalCount,1);
 for(const kind of ['leave','overtime'])assert.equal(f.request({...query,date:'2026-11-01'},'admin',kind).calendar.detail.pageSize,15);
 assert.equal(f.request({month:'2026-11'},'employee').calendar.detail.pageSize,50);
 assert.equal(f.request({month:'2026-11',startDate:'2026-01-01',endDate:'2026-11-30'},'employee').status,400);
});
test('complete range counts and final page exceed the former 3000 record cap without scanning an unrelated month',()=>{
 const f=fixture(Array.from({length:3501},(_,i)=>row('row-'+i,'2026-11-02T09:00:00','2026-11-02T10:00:00')));
 const calendar=f.request({month:'2026-11',page:'234'}).calendar;
 assert.equal(calendar.detail.totalCount,3501);assert.equal(calendar.detail.totalPages,234);assert.equal(calendar.detail.records.length,6);assert.equal(calendar.detail.records.at(-1).id,'row-3500');assert.equal(calendar.unfilteredMonthCount,3501);
 assert.ok(f.calls.every(query=>query.limit===null&&query.overlapStartAt===at('2026-11-01T00:00:00')));
});
test('a long request does not expose clicked-day detail outside the applied range',()=>{
 const f=fixture([row('long','2026-11-01T08:00:00','2026-11-05T17:00:00')]);
 const result=f.request({month:'2026-11',startDate:'2026-11-03',endDate:'2026-11-04',date:'2026-11-01'}).calendar;
 assert.equal(result.totalCount,1);assert.equal(result.days[0].totalCount,0);assert.equal(result.days[0].outsideRange,true);assert.equal(result.detail.totalCount,0);assert.equal(result.detail.records.length,0);
 assert.equal(f.request({month:'2026-11',startDate:'2026-11-03',endDate:'2026-11-04',date:'2026-11-03'}).calendar.detail.totalCount,1);
});
