const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const app = fs.readFileSync(path.join(__dirname, '../browser-client/app.js'), 'utf8');
const supervisor = fs.readFileSync(path.join(__dirname, '../browser-client/supervisor.js'), 'utf8');
function section(start, end) { return app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start))); }
function setup() {
    const state = { token: 'test', dashboard: { role: 'employee', supervisorProxy: { canUse: true } }, activeSections: {} };
    const listeners = {};
    const context = vm.createContext({ state, Date, URLSearchParams, listeners, auditActionLabels: {}, auditTargetTypeLabels: {}, ui: {},
        escapeHtml: (text) => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'),
        document: { addEventListener(type, handler) { listeners[type] = handler; }, getElementById() { return null; } }, renderDashboard() {}, renderEmployeeWorkspaceItems() { return []; },
        renderAdminPermissionAwareContent() {}, renderSystemAdminDashboard() {}, postRenderSetup() {}, handleDashboardClick() {},
        handleDashboardChange() {}, handleDashboardSubmit() {}, handleRealtimeSyncMessage() {}, handleLogout() {}, setMessage() {},
        hasCurrentAdminPermission() { return true; }, renderAdminLeaveRouteRows() { return ''; } });
    vm.runInContext(section('function buildDepartmentOptions(', 'function buildEmployeeDirectoryDepartmentOptions('), context);
    vm.runInContext(section('const paperEmployeePickerHeights', 'function getAdminPaperRequest('), context);
    vm.runInContext(section('const originalHandleDashboardClickWithPaperEmployeePicker', 'function renderAdminPaperLeaveForm('), context);
    vm.runInContext(section('function renderBrowserPunchPermissions(', 'function renderAdminSecuritySection('), context);
    vm.runInContext(supervisor, context);
    return context;
}

// A small DOM double exercises the shared filter and selection handlers without a browser dependency.
function picker(ids, { selected = [], disabled = [], limit = 0 } = {}) {
    const field = { dataset: { paperSelectionLimit: String(limit) } }, count = {}, empty = {}, search = { value: '', closest: () => field }, department = { value: '', closest: () => field };
    const items = ids.map((id, index) => {
        const classes = new Set();
        const input = { value: id, type: 'checkbox', checked: selected.includes(id), disabled: disabled.includes(id),
            closest: (selector) => selector === 'form' || selector === '[data-sp-form]' ? field.form : field,
            matches: (selector) => selector.includes('[data-paper-employee-checkbox]') };
        return { input, dataset: { searchText: `${id} person${index}`, department: index % 2 ? 'B' : 'A' },
            classList: { contains: (name) => classes.has(name), toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name) },
            querySelector: () => input };
    });
    field.querySelectorAll = (selector) => selector.includes('data-paper-employee-item') ? items : items.map((item) => item.input).filter((input) => !selector.includes(':checked') || input.checked);
    field.querySelector = (selector) => selector.includes('employee-search') ? search : selector.includes('employee-department') ? department : selector.includes('employee-empty') ? empty : count;
    const event = (action) => ({ preventDefault() {}, target: { closest: () => ({ dataset: { action }, closest: (selector) => selector === '[data-sp-form]' ? field.form : field }) } });
    return { field, items, count, empty, search, department, event };
}

test('paper-style picker supports single, multiple, checked and unavailable staff with escaped scope', () => {
    const context = setup();
    context.staff = [{ id: 'E1', name: '<script>name</script>', department: 'A&B' }, { id: 'E2', name: 'Other', department: 'B' }];
    const html = vm.runInContext("renderAdminPaperEmployeePicker(staff, 'Staff', [], { name: 'supervisorIds', selectedIds: ['E1'], disabledIds: ['E2'] })", context);
    assert.ok(html.includes('name="supervisorIds"')); assert.ok(html.includes('value="E1" data-paper-employee-checkbox checked'));
    assert.ok(html.includes('value="E2" data-paper-employee-checkbox  disabled'));
    assert.ok(html.includes('&lt;script&gt;')); assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('<option value="A&amp;B"')); assert.ok(html.includes('已選 1 位 / 顯示 2 位'));
    const single = vm.runInContext("renderAdminPaperEmployeePicker(staff, 'Staff', [], { single: true, name: 'viewEmployeeId', selectedIds: ['E1'] })", context);
    assert.equal((single.match(/type="radio"/g) || []).length, 2);
    assert.ok(!single.includes('paper-select-visible-employees')); assert.ok(!single.includes('paper-clear-employees'));
    const readonly = vm.runInContext("renderAdminPaperEmployeePicker(staff, 'Staff', [], { disabled: true, selectedIds: ['E1'] })", context);
    assert.equal((readonly.match(/ disabled/g) || []).length, 4);
});

test('list height is independent per picker, retained on rerender and not a permission or form edit', async () => {
    const context = setup();
    function sizeField(key) {
        const control = { value: '186', matches: (selector) => selector.includes('data-paper-employee-height'), closest: () => field };
        const list = { style: {} }, output = {};
        const field = { dataset: { paperPickerSizeKey: key }, querySelector: (selector) => selector.includes('height-value') ? output : selector.includes('employee-height') ? control : list };
        return { field, control, list, output };
    }
    const fields = ['enabledIds', 'assignmentEmployeeId', 'supervisorIds'].map(sizeField);
    for (const [i, dom] of fields.entries()) {
        dom.control.value = String([400, 250, 600][i]); context.control = dom.control;
        vm.runInContext('resizePaperEmployeePicker(control)', context);
        assert.equal(dom.list.style.height, `${dom.control.value}px`);
        assert.equal(dom.output.textContent, dom.list.style.height);
        assert.equal(dom.control.defaultValue, dom.control.value);
        const html = vm.runInContext(`renderAdminPaperEmployeePicker([], 'Staff', [], { name: '${dom.field.dataset.paperPickerSizeKey}', disabled: true })`, context);
        assert.ok(html.includes(`style="height: ${dom.control.value}px"`));
        const slider = html.match(/<input type="range"[^>]+>/)[0];
        assert.ok(!slider.includes('name=') && !slider.includes('disabled'));
        await context.listeners.input({ target: dom.control });
        context.event = { target: dom.control }; await vm.runInContext('handleDashboardChange(event)', context);
        assert.equal(vm.runInContext('supervisorState.dirty', context), false);
    }
    for (const [input, expected] of [['9000', '1200'], ['-2', '100'], ['NaN', '186']]) {
        fields[0].control.value = input; context.control = fields[0].control;
        vm.runInContext('resizePaperEmployeePicker(control)', context);
        assert.equal(fields[0].control.value, expected);
    }
});

test('native resize synchronizes the slider, ignores collapsed/detached lists and releases old observers', () => {
    const context = setup(), observers = [], control = {}, output = {};
    const field = { dataset: { paperPickerSizeKey: 'supervisorIds' }, querySelector: (selector) => selector.includes('height-value') ? output : control };
    const list = { isConnected: true, height: 360, closest: () => field, getBoundingClientRect() { return { height: this.height }; } };
    context.document.querySelectorAll = () => [list];
    context.ResizeObserver = class {
        constructor(callback) { this.callback = callback; observers.push(this); }
        observe(target) { this.target = target; }
        disconnect() { this.disconnected = true; }
    };
    vm.runInContext('setupPaperEmployeePickerSizes()', context);
    assert.equal(observers[0].target, list);
    observers[0].callback([{ target: list }]); assert.equal(control.value, '360');
    list.height = 0; observers[0].callback([{ target: list }]); assert.equal(control.value, '360');
    list.isConnected = false; list.height = 186; observers[0].callback([{ target: list }]); assert.equal(control.value, '360');
    vm.runInContext('setupPaperEmployeePickerSizes()', context); assert.equal(observers[0].disconnected, true);
    assert.equal(observers.length, 2);
});

test('picker CSS permits vertical resizing with natural rows and supervisor forms use the available width', () => {
    const style = fs.readFileSync(path.join(__dirname, '../browser-client/style.css'), 'utf8');
    const pickerRule = style.match(/\.paper-employee-picker\s*\{([^}]+)\}/)[1];
    assert.match(pickerRule, /resize:\s*vertical/); assert.match(pickerRule, /align-content:\s*start/);
    assert.match(pickerRule, /min-height:\s*100px/); assert.match(pickerRule, /max-height:\s*1200px/);
    const supervisorStyle = fs.readFileSync(path.join(__dirname, '../browser-client/supervisor.css'), 'utf8');
    assert.ok(!supervisorStyle.includes('850px'));
    assert.match(supervisorStyle, /\.sp-form\s*\{[^}]+width:\s*100%/);
});

test('filtering retains hidden selections, combines department and text, and exposes no-match state', () => {
    const context = setup(), dom = picker(['E1', 'E2', 'E3'], { selected: ['E1'] });
    context.control = dom.search;
    dom.search.value = 'PERSON1'; dom.department.value = 'B';
    vm.runInContext('filterAdminPaperEmployeePicker(control)', context);
    assert.equal(dom.count.textContent, '已選 1 位 / 顯示 1 位'); assert.equal(dom.items[0].input.checked, true);
    dom.department.value = 'A'; vm.runInContext('filterAdminPaperEmployeePicker(control)', context);
    assert.equal(dom.count.textContent, '已選 1 位 / 顯示 0 位'); assert.equal(dom.empty.hidden, false);
    dom.search.value = ''; dom.department.value = ''; vm.runInContext('filterAdminPaperEmployeePicker(control)', context);
    assert.equal(dom.empty.hidden, true); assert.equal(dom.count.textContent, '已選 1 位 / 顯示 3 位');
});

test('select visible skips unavailable and hidden staff, clear covers hidden selections, and batch caps at 100', async () => {
    const context = setup(), dom = picker(['E1', 'E2', 'E3', 'E4'], { selected: ['E1'], disabled: ['E4'] });
    dom.items[0].classList.toggle('is-hidden', true); dom.items[2].classList.toggle('is-hidden', true);
    context.event = dom.event('paper-select-visible-employees'); await vm.runInContext('handleDashboardClick(event)', context);
    assert.deepEqual(dom.items.map((item) => item.input.checked), [true, true, false, false]);
    context.event = dom.event('paper-clear-employees'); await vm.runInContext('handleDashboardClick(event)', context);
    assert.ok(dom.items.every((item) => !item.input.checked));
    const batch = picker(Array.from({ length: 105 }, (_, i) => `E${i}`), { limit: 100 });
    batch.field.form = { dataset: {} };
    context.event = batch.event('paper-select-visible-employees'); await vm.runInContext('handleDashboardClick(event)', context);
    assert.equal(batch.items.filter((item) => item.input.checked).length, 100);
    assert.equal(vm.runInContext('supervisorState.dirty', context), true);
    batch.items[104].input.checked = true;
    context.event = { target: batch.items[104].input }; await vm.runInContext('handleDashboardChange(event)', context);
    assert.equal(batch.items[104].input.checked, false);
    assert.equal(batch.count.textContent, '已選 100 位 / 顯示 105 位');
});

test('proxy leave and overtime forms appear immediately; meal and assignment pickers retain eligibility and contracts', () => {
    const context = setup();
    vm.runInContext(`Object.assign(supervisorState, { employeeId: 'E1', date: '2026-10-05', month: '2026-10', form: '',
        data: { employees: [{ id: 'E1', name: 'One', department: 'A' }, { id: 'E2', name: 'Two', department: 'B' }],
            leaveTypes: [{ id: 'annual', name: 'Annual' }], batchMeal: { employees: [{ id: 'E1', canChange: true }, { id: 'E2', canChange: false }] },
            calendar: { detail: { records: [], totalPages: 1 } } } });`, context);
    for (const kind of ['leave', 'overtime']) {
        context.kind = kind;
        const html = vm.runInContext('supervisorState.kind = kind; spRequestDetail()', context);
        assert.ok(html.includes(`data-sp-form="${kind}"`)); assert.ok(html.includes('name="proxyReason"'));
        assert.ok(html.includes('data-paper-selection-limit="100"')); assert.ok(!html.includes('data-action="sp-create"'));
        assert.ok(html.includes('data-action="sp-reset-form"')); assert.equal((html.match(/name="startDate"/g) || []).length, 1);
    }
    const meal = vm.runInContext('spTargets(true)', context);
    assert.ok(meal.includes('value="E2" data-paper-employee-checkbox  disabled'));
    assert.ok(meal.includes('本日無法代登午餐'));
    vm.runInContext(`supervisorState.assignmentId = 'E1'; supervisorState.assignments = { employees: [
        { id: 'E1', name: 'One', department: 'A', supervisorIds: ['E2'] }, { id: 'E2', name: 'Two', department: 'B', supervisorIds: [] }] };`, context);
    const assignment = vm.runInContext('renderSupervisorAssignments()', context);
    const targets = assignment.slice(assignment.indexOf('<form data-sp-form="assignments"'));
    assert.equal((targets.match(/name="supervisorIds"/g) || []).length, 1);
    assert.ok(targets.includes('value="E2" data-paper-employee-checkbox checked')); assert.ok(!targets.includes('value="E1" data-paper-employee-checkbox'));
    const punch = vm.runInContext("renderBrowserPunchPermissions({ revision: 'test', employees: [{ id: 'E1', name: 'One', enabled: true }, { id: 'E2', name: 'Two', enabled: false }] })", context);
    assert.equal((punch.match(/name="enabledIds"/g) || []).length, 2); assert.ok(punch.includes('paper-select-visible-employees'));
});

test('canceling a single employee switch restores radio identity without erasing the unsaved form', async () => {
    const context = setup(), dom = picker(['E1', 'E2'], { selected: ['E2'] });
    dom.items.forEach((item) => { item.input.type = 'radio'; item.input.hasAttribute = (name) => name === 'data-sp-employee'; });
    dom.items[1].input.matches = () => true;
    context.event = { target: dom.items[1].input };
    vm.runInContext("supervisorState.employeeId = 'E1'; supervisorState.dirty = true; spDiscard = async () => false;", context);
    await vm.runInContext('handleDashboardChange(event)', context);
    assert.equal(dom.items[0].input.checked, true); assert.equal(dom.items[1].input.checked, false);
    assert.equal(dom.items[1].input.value, 'E2'); assert.equal(vm.runInContext('supervisorState.dirty', context), true);
});

test('existing paper correction remains single-person and read-only punch settings retain checked staff', async () => {
    const context = setup(), dom = picker(['E1', 'E2'], { selected: ['E1', 'E2'] });
    dom.field.form = { dataset: { correctionRequestId: 'original-request' } };
    context.event = { target: dom.items[1].input };
    await vm.runInContext('spPreviousChange(event)', context);
    assert.deepEqual(dom.items.map((item) => item.input.checked), [false, true]);
    const paper = vm.runInContext("renderAdminPaperEmployeePicker([{ id: 'E1', name: 'One' }])", context);
    assert.ok(paper.includes('name="employeeIds"')); assert.ok(!paper.includes(' checked'));
    context.hasCurrentAdminPermission = () => false;
    const readonly = vm.runInContext("renderBrowserPunchPermissions({ revision: 'test', employees: [{ id: 'E1', enabled: true }, { id: 'E2', enabled: false }] })", context);
    assert.ok(readonly.includes('value="E1" data-paper-employee-checkbox checked disabled'));
    assert.ok(!readonly.includes('type="submit"')); assert.ok(!readonly.includes('name="reason"'));
});
