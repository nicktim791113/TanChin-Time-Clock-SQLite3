const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function loadUi() {
    const context = vm.createContext({ postRenderSetup() {}, document: { addEventListener() {} },
        escapeHtml: (text) => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;') });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../browser-client/leave-days.js'), 'utf8'), context);
    return (expression) => vm.runInContext(expression, context);
}
test('leave editor uses Taiwan date boundaries, excludes midnight endpoint and keeps weekend shifts selectable', () => {
    const run = loadUi();
    assert.equal(run("leaveDayRange('2026-10-23', '09:00', '2026-10-26', '18:00').length"), 4);
    assert.equal(run("leaveDayRange('2026-12-31', '22:00', '2027-01-01', '00:00').length"), 1);
    assert.equal(run("leaveDayRange('2026-12-31', '22:00', '2027-01-01', '02:00')[1].maxHours"), 2);
    assert.equal(run("leaveDayInitiallySelected('2026-10-24', true)"), false);
    assert.equal(run("leaveDayInitiallySelected('2026-10-24', false)"), true);
    assert.equal(run("leaveDayInitiallySelected('2026-10-26', true)"), true);
    assert.throws(() => run("leaveDayRange('2026-02-30', '09:00', '2026-03-02', '18:00')"), /有效/);
    assert.throws(() => run("leaveDayRange('2026-01-01', '09:00', '2027-02-01', '18:00')"), /370/);
});
test('selected-date request details show omitted dates while legacy allocations do not imply selected leave days', () => {
    const run = loadUi();
    const request = { dateSelectionMode: 'explicit_dates', start_at: Date.parse('2026-10-23T09:00:00+08:00'), end_at: Date.parse('2026-10-26T18:00:00+08:00'),
        dailyHours: [{ date: '2026-10-23', hours: 8 }, { date: '2026-10-26', hours: 4 }] };
    const html = run(`renderLeaveDaysSummary(${JSON.stringify(request)})`);
    assert.match(html, /實際請假 2 日 · 排除 2 日/);
    assert.match(html, /不請假：2026-10-24、2026-10-25/);
    assert.match(html, /4 小時/);
    delete request.dateSelectionMode;
    const legacy = run(`renderLeaveDaysSummary(${JSON.stringify(request)})`);
    assert.match(legacy, /舊單沿用原起訖範圍/); assert.doesNotMatch(legacy, /實際請假 2 日/);
    assert.match(run(`renderLeaveDaysSummary({dateSelectionMode:'explicit_dates',dailyHours:[{date:'<script>',hours:8}]})`), /&lt;script&gt;/);
});

test('precise editor batches selected weekdays and collects one request with exact disjoint periods', () => {
    const run = loadUi();
    const batch = JSON.parse(run("JSON.stringify(leaveSegmentBatchRows(['2026-10-23','09:00','2026-10-26','18:00'],8))"));
    assert.deepEqual(batch.map((row) => row.date), ['2026-10-23', '2026-10-26']);
    assert.equal(run("leaveSegmentBatchRows(['2026-10-23','09:00','2026-10-26','18:00'],8,true).length"), 4);
    assert.equal(run("leaveSegmentBatchRows(['2026-10-24','09:00','2026-10-24','18:00'],8).length"), 1, 'a deliberate single weekend date is retained');
    const rows = [{ date: '2026-11-10', startTime: '14:00', endTime: '16:00', hours: '2' },
        { id: 'segment_existing', date: '2026-11-03', startTime: '09:00', endTime: '11:00', hours: '1.5' },
        { date: '2026-11-03', startTime: '14:00', endTime: '16:00', hours: '2' }];
    const selection = JSON.parse(run(`JSON.stringify(collectLeaveSegments(${JSON.stringify(rows)}))`));
    assert.equal(selection.dateSelectionMode, 'explicit_segments');
    assert.equal(selection.durationHours, 5.5);
    assert.equal(selection.startDate, '2026-11-03'); assert.equal(selection.startTime, '09:00');
    assert.equal(selection.endDate, '2026-11-10'); assert.equal(selection.endTime, '16:00');
    assert.equal(selection.leaveSegments[0].id, 'segment_existing');
    assert.deepEqual(selection.dailyHours, [{ date: '2026-11-03', hours: 3.5 }, { date: '2026-11-10', hours: 2 }]);
    const summary = run(`renderLeaveDaysSummary(${JSON.stringify(selection)})`);
    assert.match(summary, /實際請假 2 日 · 3 段/); assert.match(summary, /09:00–11:00/); assert.match(summary, /14:00–16:00/);
    assert.doesNotMatch(summary, /2026-11-04/);
});

test('precise editor preserves midnight and refuses invalid time/hours, duplicate ranges and excessive span', () => {
    const run = loadUi();
    const row = { date: '2026-12-31', startTime: '22:00', endTime: '00:00', hours: '2' };
    const selection = JSON.parse(run(`JSON.stringify(collectLeaveSegments([${JSON.stringify(row)}]))`));
    assert.equal(selection.endDate, '2027-01-01'); assert.equal(selection.endTime, '00:00');
    assert.deepEqual(selection.dailyHours, [{ date: '2026-12-31', hours: 2 }]);
    assert.match(run(`renderLeaveDaysSummary(${JSON.stringify(selection)})`), /22:00–24:00/);
    for (const rows of [[], [row, row], [{ ...row, date: '2026-02-30' }], [{ ...row, endTime: '01:00' }],
        [{ ...row, hours: 2.01 }], [{ ...row, hours: '' }], [{ ...row, hours: 1.001 }], [row, { ...row, date: '2028-01-10' }]]) {
        assert.throws(() => run(`collectLeaveSegments(${JSON.stringify(rows)})`));
    }
    assert.throws(() => run("leaveSegmentBatchRows(['2026-10-26','09:00','2026-10-23','18:00'],8)"));
    assert.throws(() => run("leaveSegmentBatchRows(['2026-10-24','09:00','2026-10-25','18:00'],8)"), /沒有週一至五/);
    assert.match(run('renderLeaveDaysEditor()'), /新增單一時段/);
    assert.match(run('renderLegacyLeaveDaysEditor()'), /同日有不同時段或假別/);
    assert.match(run(`renderLeaveDaysSummary({dateSelectionMode:'explicit_segments',leaveSegments:[{date:'<script>',hours:'<img>',startAt:0,endAt:1}]})`), /&lt;script&gt;/);
});

test('leave defaults deduct only a complete lunch window and use exact net-minute bounds', () => {
    const run = loadUi();
    assert.equal(run("leaveSegmentDefaultBreakMinutes('08:20', '17:00')"), 40);
    assert.equal(run("leaveSegmentDefaultBreakMinutes('12:20', '13:00')"), 40);
    for (const [start, end] of [['08:20', '12:59'], ['12:21', '17:00'], ['13:00', '17:00'], ['17:00', '08:20']]) {
        assert.equal(run(`leaveSegmentDefaultBreakMinutes('${start}', '${end}')`), 0);
    }
    assert.equal(run("leaveSegmentNetHours('08:20', '17:00', 40)"), '8');
    assert.equal(run("leaveSegmentNetHours('08:20', '17:00', 30)"), '8.16');
    assert.equal(run("leaveSegmentNetHours('23:59', '00:00', 0)"), '0.01');
    assert.equal(run("leaveSegmentNetHours('12:20', '13:00', 40)"), '');
    assert.equal(run("leaveSegmentNetHours('08:20', '17:00', '')"), '');
    const rows = JSON.parse(run("JSON.stringify(leaveSegmentBatchRows(['2026-10-23','08:20','2026-10-26','17:00'],8,false,40))"));
    assert.equal(rows.length, 2);
    const result = JSON.parse(run(`JSON.stringify(collectLeaveSegments(${JSON.stringify(rows)}))`));
    assert.equal(result.durationHours, 16);
    assert.deepEqual(result.leaveSegments.map((row) => row.breakMinutes), [40, 40]);
    assert.match(run(`renderLeaveDaysSummary(${JSON.stringify(result)})`), /休息 40 分鐘/);
});

test('leave break validation preserves legacy net hours without inventing rest metadata', () => {
    const run = loadUi(), row = { date: '2026-10-23', startTime: '08:20', endTime: '17:00', hours: '8' };
    const legacy = JSON.parse(run(`JSON.stringify(collectLeaveSegments([${JSON.stringify(row)}]))`));
    assert.equal(Object.hasOwn(legacy.leaveSegments[0], 'breakMinutes'), false);
    const loaded = JSON.parse(run(`JSON.stringify(lsRowFromSegment(${JSON.stringify(legacy.leaveSegments[0])}))`));
    assert.equal(loaded.hours, '8'); assert.equal(loaded.manual, true); assert.equal(loaded.breakManual, true);
    assert.equal(Object.hasOwn(loaded, 'breakMinutes'), false);
    for (const rest of [-1, 1.5, '', 'x', 520, 521]) {
        assert.throws(() => run(`collectLeaveSegments([${JSON.stringify({ ...row, breakMinutes: rest })}])`), /休息分鐘/);
    }
    assert.throws(() => run(`collectLeaveSegments([${JSON.stringify({ ...row, breakMinutes: 41 })}])`), /扣除休息/);
    assert.equal(run(`collectLeaveSegments([${JSON.stringify({ ...row, breakMinutes: '40' })}]).leaveSegments[0].breakMinutes`), 40);
});

test('segment editing preserves deliberate overrides and historic corrections until break is edited', () => {
    const run = loadUi();
    run(`var controls = Object.fromEntries(Object.entries({startTime:'08:20',endTime:'17:00',hours:'8',breakMinutes:'40'}).map(([key,value]) => [key,{value}]));
        var row = {dataset:{lsManual:'false',lsBreakManual:'false',lsBreakKnown:'true'}, querySelector(selector){return controls[selector.match(/"(.*?)"/)[1]];}};`);
    run("controls.breakMinutes.value='30'; lsSyncRow(row,'breakMinutes')");
    assert.equal(run('controls.hours.value'), '8.16');
    run("controls.hours.value='7'; lsSyncRow(row,'hours'); controls.endTime.value='18:00'; lsSyncRow(row,'endTime')");
    assert.equal(run('controls.hours.value'), '7'); assert.equal(run('controls.breakMinutes.value'), '30');
    run("lsSyncRow(row,'auto')");
    assert.equal(run('controls.hours.value'), '9'); assert.equal(run('controls.breakMinutes.value'), 40);
    run("row.dataset={lsManual:'true',lsBreakManual:'true',lsBreakKnown:'false'}; controls.hours.value='8'; controls.breakMinutes.value=''; lsSyncRow(row,'endTime')");
    assert.equal(run('controls.hours.value'), '8'); assert.equal(run('controls.breakMinutes.value'), '');
    assert.equal(run('row.dataset.lsBreakKnown'), 'false');
    run("controls.breakMinutes.value='40'; lsSyncRow(row,'breakMinutes')");
    assert.equal(run('controls.hours.value'), '9'); assert.equal(run('row.dataset.lsBreakKnown'), 'true');
});

test('paper batch defaults follow entered time, preserve manual rest and reset cleanly', () => {
    const run = loadUi();
    run(`var values = {startDate:'2026-10-23',startTime:'08:20',endDate:'2026-10-23',endTime:'17:00'};
        var rest = {value:''}, hours = {value:''};
        var editor = {dataset:{ldMode:'segments'},querySelector(selector){return selector.includes('batch-break') ? rest : hours;}};
        var form = {elements:{namedItem(name){return {value:values[name]};}},querySelector(){return editor;}};
        lsSyncBatch(form);`);
    assert.equal(run('rest.value'), 40); assert.equal(run('hours.value'), '8');
    run("values.endTime='12:20'; lsSyncBatch(form)");
    assert.equal(run('rest.value'), 0); assert.equal(run('hours.value'), '4');
    run("editor.dataset.lsBreakManual='true'; rest.value='20'; values.endTime='17:00'; lsSyncBatch(form)");
    assert.equal(run('rest.value'), '20'); assert.equal(run('hours.value'), '8.33');
    run("editor.dataset.lsManual='true'; hours.value='7'; lsSyncBatch(form)");
    assert.equal(run('hours.value'), '7');
    run('lsSyncBatch(form,{reset:true})');
    assert.equal(run('rest.value'), 40); assert.equal(run('hours.value'), '8');
});

test('paper forms open with company leave and overtime defaults', () => {
    const source = fs.readFileSync(path.join(__dirname, '../browser-client/app.js'), 'utf8');
    const context = vm.createContext({ formatDateInputValue: () => '2026-10-23', renderAdminPaperEmployeePicker: () => '', renderLeaveTypeOptions: () => '', renderLeaveDaysEditor: () => '' });
    for (const [name, start, end] of [['renderAdminPaperLeaveForm', '08:20', '17:00'], ['renderAdminPaperOvertimeForm', '17:30', '19:30']]) {
        const first = source.indexOf(`function ${name}(`), last = source.indexOf('\nfunction ', first + 10);
        vm.runInContext(source.slice(first, last), context);
        const html = vm.runInContext(`${name}({})`, context);
        assert.match(html, new RegExp(`name="startTime" type="time" value="${start}"`));
        assert.match(html, new RegExp(`name="endTime" type="time" value="${end}"`));
    }
});
