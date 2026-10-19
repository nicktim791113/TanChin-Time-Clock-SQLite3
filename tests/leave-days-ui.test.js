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
