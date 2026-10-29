const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const app = fs.readFileSync(require.resolve('../browser-client/app.js'), 'utf8');
const source = app.slice(app.indexOf('let employeePunchRequestInFlight = false;'), app.indexOf('const originalGetRealtimeSyncLabelWithSecurity'));
function client(confirm = false) {
    const selector = { value:'in', isConnected:true }, requests = [], messages = [], rendered = [];
    const state = { token:'one', dashboard:{ user:{id:'E001'}, punchAction:{enabled:true}, security:{} } };
    let respond;
    const context = vm.createContext({ state, Date, window:{confirm:()=>confirm}, document:{ addEventListener(){}, querySelector:()=>selector, querySelectorAll:()=>[] }, ui:{}, escapeHtml:String, setMessage:(...args)=>messages.push(args), formatBrowserPunchError:(e)=>e.message, renderDashboard:(dashboard)=>rendered.push(dashboard), requestJson:async(url, options)=> { requests.push(options.body); return await new Promise((resolve)=>{respond=resolve;}); } });
    vm.runInContext(source, context);
    return { context, state, selector, requests, messages, rendered, respond:(value)=>respond(value), click:()=>context.handleEmployeePunch() };
}
test('punch double clicks share the in-flight lock and cancellation sends no confirmed punch', async () => {
    const c = client(false), first = c.click(); await c.click(); assert.equal(c.requests.length,1);
    c.respond({confirmationRequired:true,confirmation:{token:'t',selectedType:'in',expectedLatest:{timestamp:Date.now(),type:'in'}}}); await first;
    assert.equal(c.requests.length,1); assert.equal(c.selector.value,'in'); assert.equal(c.selector.disabled,false); assert.equal(c.rendered.length,0);
});
test('confirmation resends chosen action and trusted snapshot, then only renders on success', async () => {
    const c = client(true), first = c.click();
    const confirmation = { token:'t', selectedType:'in', expectedLatest:{timestamp:123,type:'in'} };
    c.respond({confirmationRequired:true,confirmation}); await new Promise((resolve)=>setImmediate(resolve));
    assert.equal(c.requests.length,2); assert.equal(c.requests[1].forceType,'in'); assert.equal(c.requests[1].confirmationToken,'t'); assert.equal(c.requests[1].expectedLatest.timestamp,123);
    c.respond({data:{dashboard:{}},message:'打卡成功'}); await first; assert.equal(c.rendered.length,1);
});
test('identity changes prevent an old challenge from sending confirmation or rendering', async () => {
    const c = client(true), first = c.click(); c.state.token='two';
    c.respond({confirmationRequired:true,confirmation:{token:'t'}}); await first;
    assert.equal(c.requests.length,1); assert.equal(c.rendered.length,0);
});
