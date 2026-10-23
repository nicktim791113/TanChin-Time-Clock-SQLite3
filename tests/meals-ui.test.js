const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture() {
    const pending = [], calls = [], listeners = {};
    const context = vm.createContext({ console, Date, String, Object, Array, Number, Map, Set, URL, setTimeout,
        state: { token: 'meal-test', dashboard: { role: 'admin', user: { id: 'A001' } }, activeSections: { admin: 'meals' } },
        auditActionLabels: {}, auditTargetTypeLabels: {}, ui: {},
        escapeHtml: (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
        getAdminPermissionSet: () => new Set(['admin.meals.view', 'admin.meals.manage']), setMessage() {},
        renderDashboard() {}, renderEmployeeWorkspaceItems: () => [], renderAdminPermissionAwareContent() {}, postRenderSetup() {},
        handleDashboardClick() {}, handleDashboardChange() {}, handleDashboardSubmit() {}, handleRealtimeSyncMessage() {}, handleLogout() {},
        window: { confirm() { throw new Error('Native dialogs must not be used for membership editing'); } },
        document: { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null, addEventListener(name, callback) { listeners[name] = callback; } },
        FormData: class { constructor(form) { return Object.entries(form.values); } },
        requestJson: (url, options) => { calls.push({ url, options }); return new Promise((resolve) => pending.push(resolve)); }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../browser-client/meals.js'), 'utf8'), context);
    return { context, calls, pending, listeners, run: (code) => vm.runInContext(code, context) };
}
function data(month = '2026-10') { return { month, today: '2026-10-24', days: [], employees: [{ id: '085', name: '員工甲', department: '製造部' }, { id: '088', name: '員工乙', department: '品保部' }], memberships: [{ employee_id: '085', name: '員工甲', department: '製造部', effective_date: '2026-10-01', participating: 1, updated_at: Date.parse('2026-09-20T08:00:00+08:00') }, { employee_id: '085', name: '員工甲', department: '製造部', effective_date: '2026-11-01', participating: 0, updated_at: Date.parse('2026-10-20T10:00:00+08:00') }], membershipVersions: { '085': 'membership-version', '088': 'empty-version' } }; }

test('admin meal entry without prefetched meals loads the Taipei month and ignores superseded responses', async () => {
    const f = fixture();
    f.run('renderDashboard(state.dashboard); postRenderSetup()');
    const month = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 7);
    assert.equal(f.calls[0].url, `/api/browser/admin/meals?month=${month}`);
    f.pending.shift()({ meals: data(month) }); await new Promise(setImmediate);
    assert.equal(f.run('mealState.month'), month);
    const first = f.run('mealLoad()'), second = f.run('mealLoad()');
    const resolveFirst = f.pending.shift(), resolveSecond = f.pending.shift();
    resolveSecond({ meals: { ...data(month), marker: 'new' } }); await second;
    resolveFirst({ meals: { ...data(month), marker: 'old' } }); await first;
    assert.equal(f.run('mealState.data.marker'), 'new');
});

test('membership roster includes nonparticipants, separates scheduled state and dates, and edits via an optional future dialog', async () => {
    const f = fixture(); f.context.fixtureData = data();
    f.run('mealState.data = fixtureData; mealState.panel = "membership"; mealState.month = "2026-10"');
    const html = f.run('renderMealMembers(fixtureData)');
    assert.equal((html.match(/<tr>/g) || []).length, 3);
    assert.match(html, /088 員工乙/); assert.match(html, /尚未設定/);
    assert.match(html, /2026-11-01 <strong>不加入/); assert.match(html, /生效日期/); assert.match(html, /修改日期/);
    assert.doesNotMatch(html, /data-meal-form="membership"/);
    const editButton = { dataset: { action: 'meal-member-edit', employee: '085', participating: 'false' } };
    await f.context.handleDashboardClick({ target: { closest: () => editButton }, preventDefault() {} });
    const dialog = f.run('renderMealMemberDialog()');
    assert.match(dialog, /<dialog/); assert.match(dialog, /name="effectiveDate"[^>]*value="2026-11-01"/);
    assert.match(dialog, /name="version" value="membership-version"/); assert.match(dialog, /name="reason"[^>]*required/);
    assert.match(dialog, /修改日期（系統記錄）/); assert.match(dialog, /readonly/);
    f.listeners.input({ target: { name: 'reason', value: '保留資格修改原因', closest: (selector) => selector === '[data-meal-form="member-filter"]' ? null : {} } });
    f.listeners.input({ target: { name: 'effectiveDate', value: '2026-11-05', closest: (selector) => selector === '[data-meal-form="member-filter"]' ? null : {} } });
    const rerendered = f.run('renderMealMemberDialog()');
    assert.match(rerendered, /保留資格修改原因/); assert.match(rerendered, /value="2026-11-05"/);
    const form = { dataset: { mealForm: 'member-filter' }, values: { query: '', department: '', status: 'not-joined' } };
    await f.context.handleDashboardSubmit({ target: { closest: () => form }, preventDefault() {} });
    const filtered = f.run('renderMealMembers(fixtureData)');
    assert.match(filtered, /088 員工乙/); assert.doesNotMatch(filtered, /085 員工甲/);
    assert.equal(f.calls.length, 0, 'filtering does not write membership');
});

test('overview realtime updates preserve open membership drafts and refresh normally after editing finishes', async () => {
    const f = fixture(); let reloads = 0;
    Object.assign(f.context, { URLSearchParams, renderAdminEmployeeInsight() {}, renderAdminTodayNormalInsight() {}, renderAdminAbnormalInsight() {},
        getAdminInsightTitle() {}, renderAdminDashboardInsightContent() {}, renderEmployeeDashboard() {}, reloadDashboard() { reloads++; } });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../browser-client/dashboard-metrics.js'), 'utf8'), f.context);
    f.context.fixtureData = data();
    f.run('mealState.data = fixtureData; mealState.memberEdit = { employeeId: "085", participating: false, effectiveDate: "2026-11-05", reason: "不要遺失", version: "original" }; mealState.dirty = true');
    await f.context.handleRealtimeSyncMessage({ type: 'meals', sessionToken: 'someone-else' });
    assert.equal(reloads, 0); assert.equal(f.run('mealState.pending'), true);
    assert.match(f.run('renderMealMemberDialog()'), /不要遺失/);
    assert.equal(f.run('mealState.memberEdit.version'), 'original');
    f.run('mealState.memberEdit = null; mealState.dirty = false');
    await f.context.handleRealtimeSyncMessage({ type: 'meals', sessionToken: 'someone-else' });
    assert.equal(reloads, 1);
});

test('prefetched admin meal panels opt out of the shared card initializer that otherwise hides nested calendars and membership forms', () => {
    const f = fixture(); f.context.fixtureData = data();
    f.context.fixtureData.days = [{ date: '2026-10-24', serving: true, cutoff: '09:00', locked: false, revision: 0, rows: [], currentCount: 0, submittedCount: null, differenceCount: null, changes: [], orders: [] }];
    f.context.fixtureData.schedule = { weekdays: [1, 2, 3, 4, 5], cutoff: '09:00', leaveStart: '08:20', leaveEnd: '17:00' };
    f.context.fixtureData.schedules = [];
    f.run('mealState.data = fixtureData; mealState.month = fixtureData.month; mealState.selectedDate = "2026-10-24"');
    const app = fs.readFileSync(path.join(__dirname, '../browser-client/app.js'), 'utf8');
    const start = app.indexOf('setupCollapsibleSections = function setupCollapsibleSectionsPersistent()');
    const end = app.indexOf('\n};', start) + 3;
    assert.ok(start >= 0 && end > start);
    vm.runInContext(app.slice(start, end), f.context);
    for (const panel of ['calendar', 'membership', 'schedule']) {
        f.run(`mealState.panel = "${panel}"`);
        const html = f.run('renderMealWorkspace()'), article = html.match(/<article class="table-card meal-admin-panel"([^>]*)>/);
        assert.ok(article, panel);
        let nestedTitleReads = 0;
        const card = { dataset: { noCollapsible: article[1].match(/data-no-collapsible="([^"]*)"/)?.[1] }, closest: () => null,
            querySelector() { nestedTitleReads++; throw new Error('Shared collapsing must not restructure the meal panel'); } };
        f.context.document.querySelectorAll = () => [card];
        f.run('setupCollapsibleSections()');
        assert.equal(nestedTitleReads, 0, panel);
        assert.equal(card.dataset.collapsibleReady, undefined, panel);
        if (panel === 'calendar') { assert.match(html, /data-meal-month/); assert.match(html, /2026-10-24 午餐/); }
        if (panel === 'membership') assert.match(html, /088 員工乙/);
    }
});
