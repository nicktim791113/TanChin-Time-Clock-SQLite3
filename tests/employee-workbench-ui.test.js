const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function createWorkbenchUi({ active = '' } = {}) {
    const state = { token: 'employee-session', employeeWorkspacePanel: active, dashboard: {
        role: 'employee', user: { id: 'E001' }, summary: { todayRecordCount: 2 },
        employeeWorkspaceNav: { canEdit: true, order: ['leave-request', 'supervisor', 'meals'],
            defaultOrder: ['leave-request', 'meals', 'supervisor'], source: 'custom' }
    } };
    const panel = { form: { reason: 'Keep this unsaved leave reason', date: '2026-11-05' } };
    const originalForm = panel.form, requests = [], pending = [];
    const items = [{ id: 'leave-request', label: '請假申請' }, { id: 'meals', label: '我的午餐團膳' }];
    const tablist = {
        children: items.map((item, index) => ({ dataset: { panel: item.id }, tabIndex: active ? (active === item.id ? 0 : -1) : (index ? -1 : 0) })),
        querySelectorAll() { return this.children; },
        append(button) { this.children = this.children.filter((child) => child !== button); this.children.push(button); }
    };
    let dialog, renders = 0;
    const opener = { focus() {} }, dashboardMessage = {}, documentListeners = {};
    const document = {
        addEventListener(type, handler) { documentListeners[type] = handler; },
        getElementById(id) { return id === 'employee-order-dialog' ? dialog : null; },
        querySelector(selector) { return selector === '.employee-workbench-tabs' ? tablist : selector === '[data-employee-order-open]' ? opener : null; },
        body: { append(node) { dialog = node; } },
        createElement() {
            const handlers = {}, formHandlers = {}, list = { innerHTML: '', querySelectorAll: () => [] }, message = {}, discard = { hidden: true };
            const buttons = [{ disabled: false, dataset: {} }, { disabled: true, dataset: {} }];
            return {
                handlers, formHandlers, buttons, setAttribute() {}, addEventListener(type, handler) { handlers[type] = handler; },
                querySelector(selector) { return selector === 'ol' ? list : selector === '[data-employee-order-message]' ? message
                    : selector === 'form' ? { addEventListener(type, handler) { formHandlers[type] = handler; } } : discard; },
                querySelectorAll() { return buttons; }, showModal() {}, close() {}, remove() { if (dialog === this) dialog = null; }
            };
        }
    };
    const context = vm.createContext({ state, document, escapeHtml: String, auditTargetTypeLabels: {}, ui: { dashboardMessage },
        renderEmployeeWorkspaceItems: () => items,
        renderDashboard() { renders++; panel.form = { reason: '', date: '' }; },
        setMessage(node, text) { node.text = text; }, handleLogout() {},
        requestJson(route, options) { requests.push({ route, options }); return new Promise((resolve, reject) => pending.push({ resolve, reject })); }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../browser-client/employee-workbench.js'), 'utf8'), context);
    return { context, state, panel, originalForm, tablist, requests, pending,
        get dialog() { return dialog; }, get renders() { return renders; },
        open() { vm.runInContext('openEmployeeWorkspaceOrder()', context); return dialog; },
        move(id, direction) {
            const move = { dataset: { employeeOrderMove: id, direction: String(direction) } };
            dialog.handlers.click({ target: { closest(selector) { return selector === '[data-employee-order-move]' ? move : null; } } });
        },
        submit() { return dialog.formHandlers.submit({ preventDefault() {} }); }
    };
}

test('saving employee navigation preserves an open draft and existing permitted tab nodes', async () => {
    for (const active of ['', 'leave-request']) {
        const ui = createWorkbenchUi({ active });
        const originals = [...ui.tablist.children];
        ui.open();
        ui.move('meals', -1);
        const save = ui.submit();
        assert.equal(ui.requests.length, 1);
        assert.equal(ui.requests[0].route, '/api/browser/employee/workspace-nav-order/save');
        assert.deepEqual(Array.from(ui.requests[0].options.body.order), ['meals', 'supervisor', 'leave-request']);
        ui.pending[0].resolve({ message: 'Saved', dashboard: { summary: { todayRecordCount: 99 }, employeeWorkspaceNav: {
            canEdit: true, source: 'custom', order: ['meals', 'supervisor', 'leave-request']
        } } });
        await save;
        assert.equal(ui.renders, 0);
        assert.equal(ui.panel.form, ui.originalForm);
        assert.equal(ui.panel.form.reason, 'Keep this unsaved leave reason');
        assert.equal(ui.panel.form.date, '2026-11-05');
        assert.deepEqual(ui.state.dashboard.summary, { todayRecordCount: 2 });
        assert.deepEqual(ui.tablist.children.map((node) => node.dataset.panel), ['meals', 'leave-request']);
        assert.equal(ui.tablist.children[0], originals[1]);
        assert.equal(ui.tablist.children[1], originals[0]);
        assert.equal(ui.state.employeeWorkspacePanel, active);
        assert.equal(ui.dialog, null);
        assert.deepEqual(ui.tablist.children.map((node) => node.tabIndex), active ? [-1, 0] : [0, -1]);
    }
});

test('stale ordering dialogs cannot submit preferences using a different identity or revoked edit access', async () => {
    for (const changeIdentity of [
        (state) => { state.token = 'another-session'; },
        (state) => { state.dashboard.role = 'admin'; },
        (state) => { state.dashboard.user.id = 'A001'; },
        (state) => { state.dashboard.employeeWorkspaceNav.canEdit = false; }
    ]) {
        const ui = createWorkbenchUi();
        ui.open(); changeIdentity(ui.state);
        await ui.submit();
        assert.equal(ui.requests.length, 0);
        assert.equal(ui.dialog, null);
        assert.equal(ui.panel.form, ui.originalForm);
    }
});

test('a delayed ordering response cannot replace a new session dashboard or rearrange its navigation', async () => {
    const ui = createWorkbenchUi();
    ui.open(); ui.move('meals', -1);
    const save = ui.submit();
    const newDashboard = { role: 'employee', user: { id: 'A001' }, employeeWorkspaceNav: { canEdit: true, order: ['leave-request', 'meals'] } };
    ui.state.token = 'new-session'; ui.state.dashboard = newDashboard;
    ui.pending[0].resolve({ dashboard: { role: 'employee', user: { id: 'E001' }, employeeWorkspaceNav: { order: ['meals', 'leave-request'] } } });
    await save;
    assert.equal(ui.state.dashboard, newDashboard);
    assert.deepEqual(ui.state.dashboard.employeeWorkspaceNav.order, ['leave-request', 'meals']);
    assert.deepEqual(ui.tablist.children.map((node) => node.dataset.panel), ['leave-request', 'meals']);
    assert.equal(ui.dialog, null);
});
