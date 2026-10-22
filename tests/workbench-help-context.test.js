const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function loadHelp({ role = 'admin', section = 'salaryAdvances', salaryVisible = true } = {}) {
    let toolbar;
    const salaryRoot = { closest: () => salaryVisible ? null : {}, querySelector: () => null };
    const workspace = {
        querySelector: (selector) => selector === ':scope > .wb-page-toolbar' ? toolbar : null,
        prepend: (node) => { toolbar = node; }
    };
    const context = vm.createContext({
        state: { dashboard: { role }, activeSections: { [role]: section }, activeSubSections: {} },
        document: {
            getElementById: (id) => id === 'salary-advance-workspace' ? salaryRoot : null,
            querySelector: (selector) => selector === '#salary-advance-workspace' ? salaryRoot : null,
            addEventListener() {}, createElement: () => ({}), body: { dataset: {} }
        },
        ui: { dashboardContent: { querySelector: (selector) => selector === '.workspace-shell' ? workspace : null, querySelectorAll: () => [] } },
        postRenderSetup() {}, handleLogout() {}, renderDashboard() {}, handleDashboardClick() {},
        escapeHtml: (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../browser-client/workbench-help.js'), 'utf8'), context);
    return {
        run: (expression) => vm.runInContext(expression, context),
        toolbar: () => toolbar,
        describe({ label, name = '', action, form, submit = false }) {
            context.helpControl = {
                name, dataset: action ? { saAction: action } : {},
                getAttribute: (attribute) => attribute === 'aria-label' ? label : null,
                matches: (selector) => selector === 'button[type="submit"]' && submit,
                closest: (selector) => selector === 'form' && form ? { dataset: { saForm: form }, querySelector: () => null } : null,
                // Help must never inspect the actual request, amount, note or employee identity.
                get value() { throw new Error('Private form values must not be read'); }
            };
            return vm.runInContext('workbenchControlDescription(helpControl, workbenchHelpContext(false))', context);
        }
    };
}

test('salary-only admin page labels its own management context instead of falling back to employee help', () => {
    const ui = loadHelp();
    assert.equal(ui.run('workbenchHelpContext(false).topic[0]'), '借支申請管理');
    assert.equal(ui.run('workbenchHelpContext(false).root'), '#salary-advance-workspace');
    assert.match(ui.run('workbenchHelpContext(false).topic[1]'), /直接交管理部審核/);
    ui.run('installWorkbenchPageHelp()');
    assert.match(ui.toolbar().innerHTML, /<h3>借支申請管理<\/h3>/);
    assert.doesNotMatch(ui.toolbar().innerHTML, /員工工作台/);
});

test('employee active salary panel has personal help while a hidden panel does not override other pages', () => {
    const active = loadHelp({ role: 'employee', section: '' });
    assert.equal(active.run('workbenchHelpContext(false).section'), 'salaryAdvances');
    assert.equal(active.run('workbenchHelpContext(false).topic[0]'), '我的借支');
    assert.match(active.run('workbenchHelpContext(false).topic[3].join(" ")'), /只能查看本人的申請/);
    const hidden = loadHelp({ role: 'employee', section: '', salaryVisible: false });
    assert.equal(hidden.run('workbenchHelpContext(false).topic[0]'), '員工工作台');
    assert.equal(hidden.run('workbenchHelpContext(false).root'), undefined);
    const another = loadHelp({ role: 'admin', section: 'reports', salaryVisible: false });
    assert.equal(another.run('workbenchHelpContext(false).topic[0]'), '考勤報表');
});

test('integrated employee pages explain their distinct review and draft rules without changing admin context', () => {
    const employee = loadHelp({ role: 'employee', section: '', salaryVisible: false });
    employee.run("state.employeeWorkspacePanel = 'leave'");
    assert.equal(employee.run('workbenchHelpContext(false).topic[0]'), '我的請假');
    assert.match(employee.run('workbenchHelpContext(false).topic[3].join(" ")'), /管理部終審/);
    assert.match(employee.run('workbenchHelpContext(false).topic[3].join(" ")'), /重整／關頁不保存/);
    employee.run("state.employeeWorkspacePanel = 'overtime'");
    assert.equal(employee.run('workbenchHelpContext(false).topic[0]'), '我的加班');
    assert.match(employee.run('workbenchHelpContext(false).topic[3].join(" ")'), /僅待主管時可撤回/);
    assert.match(employee.run('workbenchHelpContext(false).topic[3].join(" ")'), /新申請只限本人/);
    employee.run("state.employeeWorkspacePanel = 'records'");
    assert.equal(employee.run('workbenchHelpContext(false).topic[0]'), '員工工作台');

    const admin = loadHelp({ role: 'admin', section: 'reports', salaryVisible: false });
    admin.run("state.employeeWorkspacePanel = 'leave'");
    assert.equal(admin.run('workbenchHelpContext(false).topic[0]'), '考勤報表');
});

test('salary controls explain actual management review, cancellation and monthly export without using leave workflows', () => {
    const ui = loadHelp();
    const cancel = ui.describe({ label: '取消', action: 'cancel' });
    assert.match(cancel, /取消申請表單/);
    assert.match(cancel, /不會自動沖回已發放款項/);
    assert.doesNotMatch(cancel, /捨棄|未儲存|假別|額度/);
    const review = ui.describe({ label: '確認管理部審核', form: 'review', submit: true });
    assert.match(review, /管理部審核/);
    assert.match(review, /核准金額不能超過申請金額/);
    assert.doesNotMatch(review, /必審|投票|主管核准/);
    assert.match(ui.describe({ label: '下載 Excel 總表及明細', action: 'export' }), /所選登記月份/);
    assert.match(ui.describe({ label: '查看登記月份', name: 'applicationMonth' }), /不變更申請月份/);
    assert.match(ui.describe({ label: '預計扣回月份', name: 'deductionMonthOffset' }), /不會執行扣薪/);
});

test('employee salary submission and withdrawal help preserve self-service and pending-only scope', () => {
    const ui = loadHelp({ role: 'employee', section: '' });
    assert.match(ui.describe({ label: '送交管理部審核', form: 'submit', submit: true }), /本人的借支申請，直接交管理部/);
    assert.match(ui.describe({ label: '撤回', action: 'withdraw' }), /本人待審申請/);
    assert.match(ui.describe({ label: '確認撤回申請', form: 'withdraw', submit: true }), /不占每月有效筆數/);
});
