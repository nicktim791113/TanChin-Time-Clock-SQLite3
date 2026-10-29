const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function ui() {
    const listeners = {};
    const context = vm.createContext({ state: { token: 'fixture', dashboard: { role: 'admin', user: { id:'A1' } } },
        escapeHtml: (value) => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
        hasCurrentAdminPermission: () => true, listeners, document: { addEventListener(type, callback) { listeners[type] = callback; } }, handleRealtimeSyncMessage() {}, renderDashboard() {}, handleLogout() {} });
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../browser-client/employee-browser-settings.js'),'utf8'),context);
    return (source) => vm.runInContext(source,context);
}
test('individual settings render all three history modes, inheritance and readonly simulation', () => {
    const run=ui();
    run(`var data={revision:'r1',globalDeviceLimit:3,employees:[{id:'E1',name:'<script>',department:'Test',punchHistoryMode:'current_month',deviceLimit:null,effectiveDeviceLimit:3,boundDeviceCount:4}]};`);
    const history=run("renderEmployeeBrowserSettings(data,'history')");
    assert.match(history,/近 7 日紀錄/); assert.match(history,/當月紀錄＋上月紀錄/);
    assert.match(history,/value="current_month" selected/); assert.match(history,/&lt;script>/);
    const devices=run("renderEmployeeBrowserSettings(data,'devices')");
    assert.match(devices,/沿用全域（3 台）/); assert.match(devices,/既有裝置保留/);
    run('state.dashboard.impersonation={active:true}');
    assert.doesNotMatch(run("renderEmployeeBrowserSettings(data,'devices')"),/type="submit"/);
    assert.match(run("renderEmployeeBrowserSettings(data,'history')"),/data-ebs-value[^>]*disabled/);
});

test('saving one form advances a current peer but leaves an older unsaved peer stale', async () => {
    const run=ui();
    run(`var data={revision:'r1',employees:[{id:'E1',punchHistoryMode:'recent7',deviceLimit:2}]};
        state.dashboard.datasets={security:{employeeBrowserSettings:data}};
        var currentRevision={value:'r1'},peerRevision={value:'r1'},staleRevision={value:'r0'};
        document.querySelectorAll=()=>[currentRevision,peerRevision,staleRevision];
        var form={dataset:{ebsKind:'history'},isConnected:true,elements:{revision:currentRevision,reason:{value:'Update history only'},confirm:{checked:true}},
            querySelectorAll(selector){return selector==='[data-ebs-id]'?[{dataset:{ebsId:'E1'},querySelector(){return {value:'current_month'}}}]:[]}};
        ebsPaintForm=()=>{};
        var setMessage=()=>{};
        var requestJson=async()=>({settings:{revision:'r2',employees:[{id:'E1',punchHistoryMode:'current_month',deviceLimit:2}]}});`);
    await run("listeners.submit({target:{closest:()=>form},preventDefault(){}})");
    assert.deepEqual(JSON.parse(run('JSON.stringify([currentRevision.value,peerRevision.value,staleRevision.value])')),['r2','r2','r0']);
});
test('editing one permission preserves the other field and retains filtered employees in the complete payload', () => {
    const run=ui();
    run(`var data={employees:[{id:'E1',punchHistoryMode:'recent7',deviceLimit:2},{id:'E2',punchHistoryMode:'current_month',deviceLimit:null}]};
        var form={dataset:{ebsKind:'history'},elements:{revision:{value:'r1'},reason:{value:' fixture reason '},confirm:{checked:true}},
            querySelectorAll(){return [{dataset:{ebsId:'E1'},querySelector(){return {value:'current_previous_month'}}},{dataset:{ebsId:'E2'},hidden:true,querySelector(){return {value:'current_month'}}}]}};`);
    const history=JSON.parse(run('JSON.stringify(ebsCollect(form,data))'));
    assert.deepEqual(history.employees,[{id:'E1',punchHistoryMode:'current_previous_month',deviceLimit:2},{id:'E2',punchHistoryMode:'current_month',deviceLimit:null}]);
    assert.equal(history.reason,'fixture reason'); assert.equal(history.revision,'r1');
    run(`form.dataset.ebsKind='devices';form.querySelectorAll=()=>[{dataset:{ebsId:'E1'},querySelector(){return {value:''}}},{dataset:{ebsId:'E2'},querySelector(){return {value:'4'}}}];`);
    const devices=JSON.parse(run('JSON.stringify(ebsCollect(form,data))'));
    assert.deepEqual(devices.employees,[{id:'E1',punchHistoryMode:'recent7',deviceLimit:null},{id:'E2',punchHistoryMode:'current_month',deviceLimit:4}]);
    run('data.employees.push({id:"E3",punchHistoryMode:"recent7",deviceLimit:null})');
    assert.throws(()=>run('ebsCollect(form,data)'),/名單已變更/);
});
