const assert = require('node:assert/strict');
const { test } = require('node:test');
const { startFixture } = require('./fixtures/browser-server');
test('manual browser punch validates identity, confirmation snapshots and preserves selected direction inside one minute', async (t) => {
    const fixture = await startFixture(); t.after(() => fixture.close()); const { db, url } = fixture;
    db.setSetting('browserSecuritySettings', { deviceBindingEnabled: false, gpsRequiredOnPunch: false });
    async function request(route, body, token) {
        const response = await fetch(`${url}/api/browser${route}`, { method: body === null ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === null ? undefined : JSON.stringify(body) });
        return { status: response.status, ...await response.json() };
    }
    const employee = await request('/login', { employeeId: 'E001', secret: 'employee-card', role: 'employee' });
    assert.equal(employee.status, 200); const token = employee.token;
    const records = () => db.loadPunchRecords().filter((row) => row.id === 'E001');
    assert.equal((await request('/punch', { forceType: 'bad' }, token)).status, 400);
    assert.equal(records().length, 0);
    assert.equal((await request('/punch', {}, token)).success, true); // legacy auto remains supported
    const initial = records()[0]; assert.equal(initial.type, 'in');
    const challenge = await request('/punch', { forceType: 'in' }, token);
    assert.equal(challenge.confirmationRequired, true); assert.equal(records().length, 1);
    assert.equal(challenge.confirmation.expectedLatest.timestamp, initial.timestamp);
    const unconfirmed = await request('/punch', { forceType: 'in', confirmManual: true }, token);
    assert.equal(unconfirmed.confirmationRequired, true); assert.equal(records().length, 1);
    const confirmation = unconfirmed.confirmation;
    const confirmedBody = { forceType: 'in', confirmationToken: confirmation.token, expectedLatest: confirmation.expectedLatest };
    const [confirmed, replay] = await Promise.all([request('/punch', confirmedBody, token), request('/punch', confirmedBody, token)]);
    assert.equal([confirmed, replay].filter((row) => row.data?.dashboard).length, 1);
    assert.equal(records().length, 2); assert.equal(records()[0].type, 'in'); assert.equal(records()[0].status, '重複打卡');
    const reverse = await request('/punch', { forceType: 'out' }, token);
    assert.equal(reverse.success, true); assert.equal(reverse.confirmationRequired, undefined);
    assert.equal(records().length, 3); assert.equal(records()[0].type, 'out'); assert.equal(records()[0].status, '重複打卡');
    assert.equal(reverse.data.dashboard.recentRecords[0].statusText, '下班（重複打卡）');
    assert.equal(reverse.data.dashboard.recentRecords[0].attendanceStatusText, '重複打卡');
    assert.equal(reverse.data.dashboard.recentRecords[0].type, 'out');
    const stale = await request('/punch', { forceType: 'in' }, token);
    db.addPunchRecord({ id:'E001', timestamp: Date.now() + 1, type:'out', shift:'fixture', status:'重複打卡', source:'fixture' });
    const before = records().length;
    const recheck = await request('/punch', { forceType:'in', confirmationToken:stale.confirmation.token, expectedLatest:stale.confirmation.expectedLatest }, token);
    assert.equal(recheck.confirmationRequired, true); assert.equal(records().length, before);
    const permissions = db.getBrowserPunchPermissions(), current = permissions.state();
    permissions.save({ revision:current.revision, employees:current.employees.map((row) => ({ id:row.id, enabled:row.id !== 'E001' })), reason:'fixture restriction' }, (entry) => ({...entry, actor_id:'fixture'}));
    assert.equal((await request('/punch', { forceType:'out' }, token)).status, 403); assert.equal(records().length, before);
    db.setSetting('systemPassword', 'fixture-system-password'); db.setSetting('developerImpersonationEnabled', true);
    const login = await request('/login', { role:'account', employeeId:'D001', secret:'D001-test-password' });
    const developer = await request('/workspace', { role:'developer' }, login.token);
    const simulated = await request('/developer/impersonation/start', { targetRole:'employee', targetEmployeeId:'A001', systemPassword:'fixture-system-password' }, developer.token);
    assert.equal(simulated.status, 200); assert.equal(simulated.dashboard.punchAction.enabled, false);
    assert.equal((await request('/punch', { forceType:'in' }, simulated.token || developer.token)).status, 403);
    assert.equal(db.loadPunchRecords().filter((row) => row.id === 'A001').length, 0);
});
const vm = require('node:vm');
const fs = require('node:fs');
test('unchanged confirmed snapshot survives time-only suggestion changes and token stays single-use', () => {
    const serverSource = fs.readFileSync(require.resolve('../server.js'), 'utf8');
    const start = serverSource.indexOf("  server.post('/api/browser/punch'");
    const end = serverSource.indexOf("  server.post('/api/browser/employee/leave/meal-options'", start);
    let handler, now = 100000, suggestion = 'in'; const writes = [];
    class Clock extends Date { static now() { return now; } }
    const latest = { id:'E001', timestamp:now - 1000, type:'in', status:'正常' };
    const context = vm.createContext({ Date:Clock, crypto:require('node:crypto'),
        server:{post:(_route,...callbacks)=>{handler=callbacks.at(-1);}}, requireBrowserSession(){}, requireBrowserRole:()=>()=>{},
        getEmployeeById:()=>({id:'E001',name:'fixture'}), dbModule:{getBrowserPunchPermissions:()=>({allowed:()=>true})},
        createHttpError:(message,statusCode)=>Object.assign(new Error(message),{statusCode}),
        validateEmployeeSessionDevice:()=>({securitySettings:{},deviceRecord:null}), validatePunchLocationPayload:()=>({}),
        getLastValidPunch:()=>latest, getAllPunchRecords:()=>[latest], determinePunchType:()=>suggestion,
        updateEmployeeDeviceLocation:()=>null, getRequestIpAddress:()=>'', notifyDesktop(){}, writeBrowserAuditLog(){},
        buildDashboardForSession:()=>({}), writePunchFailureAuditLog(){}, extractSupportCode:()=>'',
        createPunchRecord:(_employee,options)=>{writes.push(options);return{record:{...latest,type:options.type}};}
    });
    vm.runInContext(serverSource.slice(start,end),context);
    const session = {employeeId:'E001',authMethod:'card'};
    const submit = (body) => { let payload; handler({body,browserSession:session,headers:{}},{json:(value)=>payload=value,status(){return this;}});return payload; };
    const challenge = submit({forceType:'out'});
    assert.equal(challenge.confirmationRequired,true); assert.equal(writes.length,0);
    now += 61000; suggestion='out'; // only time and suggestion changed; same trusted card snapshot
    const body = {forceType:'out',confirmationToken:challenge.confirmation.token,expectedLatest:challenge.confirmation.expectedLatest};
    const result = submit(body);
    assert.equal(result.success,true); assert.equal(result.confirmationRequired,undefined); assert.equal(writes.length,1); assert.equal(writes[0].type,'out');
    const replay = submit(body); assert.equal(replay.confirmationRequired,true); assert.equal(writes.length,1);
});
