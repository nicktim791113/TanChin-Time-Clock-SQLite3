const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '../browser-client', name), 'utf8');
test('people subnavigation reorders labels without changing panel bindings or roster count', () => {
    const source = read('app.js');
    const start = source.indexOf('        people: {', source.indexOf('const workspaceSubnavConfigs'));
    const section = source.slice(start, source.indexOf('        security: {', start));
    const context = vm.createContext({ filterAdminEmployees: rows => rows.filter(row => row.visible) });
    const people = vm.runInContext('({' + section + '}).people', context);
    const items = people.groups[0].items;
    assert.deepEqual(Array.from(items, item => [item.id, item.panelIndex]), [['form', 1], ['roster', 3], ['departments', 2]]);
    assert.equal(items[1].badge({ employees: [{ visible: true }, { visible: false }] }), '1/2');
});
test('roster typography resets after base styling while retaining equal-width wrapping geometry', () => {
    const html = read('index.html'), base = read('style.css'), directory = read('admin-directory.css');
    assert.ok(html.indexOf('./admin-directory.css') > html.indexOf('./style.css'));
    assert.match(directory, /\.employee-roster-card\s*\{\s*font-size:\s*1rem/);
    assert.match(base, /\.employee-table-wrap \.employee-roster-table :is\(th, td\)\s*\{[^}]*font-size:\s*1\.76rem/);
    assert.match(base, /\.employee-table-wrap \.employee-roster-table th\s*\{[^}]*font-size:\s*1\.64rem/);
    assert.match(directory, /\.employee-roster-table :is\(th, td\)\s*\{\s*font-size:\s*\.88rem/);
    assert.match(directory, /\.employee-roster-table th\s*\{\s*font-size:\s*\.82rem/);
    assert.match(directory, /\.mini-btn\s*\{\s*font-size:\s*\.86rem/);
    const overrides = directory.slice(directory.indexOf('/* Restore the complete roster'));
    assert.ok(!/table-layout|column-width|white-space|overflow-wrap|overflow-x/.test(overrides), 'font reset must preserve table layout and wrapping');
});
