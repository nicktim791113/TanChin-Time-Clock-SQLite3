const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function loadUi() {
    const context = vm.createContext({ postRenderSetup() {}, document: { addEventListener() {} }, escapeHtml: String });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../browser-client/leave-days.js'), 'utf8'), context);
    return (expression) => vm.runInContext(expression, context);
}

test('supervisor leave tools precede the list and daily hours are a calculated output', () => {
    const run = loadUi();
    const list = run('renderLeaveDaysEditor({batch:true,autoHours:true,externalTools:true})');
    assert.match(list, /同一張單的請假時段/);
    assert.doesNotMatch(list, /data-ls-batch-break|data-ls-action="add-range"/);
    const tools = run('renderLeaveDaysAddTools({autoHours:true})');
    assert.match(tools, /data-ls-batch-hours readonly aria-readonly="true"/);
    assert.match(tools, /不能直接修改時數/);
    assert.match(tools, /data-ls-action="add-range"/);
    assert.doesNotMatch(run('renderLeaveDaysAddTools()'), /readonly/);
});

test('external supervisor batch controls recompute hours while preserving an explicit rest change', () => {
    const run = loadUi();
    run(`var values={startDate:'2026-10-29',startTime:'08:20',endDate:'2026-10-29',endTime:'17:00'};
        var rest={value:''}, hours={value:'1'};
        var editor={dataset:{ldMode:'segments',lsAutoHours:'true',lsExternalTools:'true',lsManual:'true'}};
        var form={elements:{namedItem(name){return {value:values[name]}}},querySelector(selector){return selector==='[data-leave-days]'?editor:selector.includes('batch-break')?rest:hours}};
        lsSyncBatch(form);`);
    assert.equal(run('hours.value'), '8');
    run("editor.dataset.lsBreakManual='true';rest.value='30';hours.value='1';lsSyncBatch(form)");
    assert.equal(run('hours.value'), '8.16');
    run("values.endTime='18:00';lsSyncBatch(form)");
    assert.equal(run('rest.value'), '30');
    assert.equal(run('hours.value'), '9.16');
    run('lsSyncBatch(form,{reset:true})');
    assert.equal(run('rest.value'), 40);
    assert.equal(run('hours.value'), '9');
});

test('supervisor segment collection ignores injected hours and derives net minutes on every read', () => {
    const run = loadUi();
    run(`var controls=Object.fromEntries(Object.entries({date:'2026-10-29',startTime:'08:20',endTime:'17:00',hours:'1',breakMinutes:'40'}).map(([key,value])=>[key,{value}]));
        var row={dataset:{lsId:'',lsManual:'true',lsAutoHours:'true',lsBreakManual:'true',lsBreakKnown:'true'},querySelector(selector){return controls[selector.match(/"(.*?)"/)[1]]}};
        var editor={dataset:{lsAutoHours:'true'}};
        var form={querySelector(){return editor},querySelectorAll(){return [row]}};`);
    assert.equal(run('lsReadRows(form)[0].hours'), '8');
    assert.equal(run('lsReadRows(form)[0].manual'), false);
    run("lsSyncRow(row,'hours')");
    assert.equal(run('controls.hours.value'), '8');
    run("controls.breakMinutes.value='520';lsSyncRow(row,'breakMinutes')");
    assert.equal(run('controls.hours.value'), '');
    assert.throws(() => run('collectLeaveSegments(lsReadRows(form))'), /休息分鐘/);
});
