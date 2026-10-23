const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function loadHelp({ role = 'admin', section = 'salaryAdvances', salaryVisible = true, page, dialogStage = '' } = {}) {
    let toolbar, activeStage = dialogStage, paints = 0;
    const salaryDialog = { querySelector: () => ({ dataset: { saForm: activeStage } }) };
    const salaryRoot = { closest: () => salaryVisible ? null : {}, querySelector: (selector) => selector === '.workspace-subnav-content' ? workspace : selector === '.sa-dialog[open]' && activeStage ? salaryDialog : null };
    const workspace = {
        querySelector: (selector) => selector === ':scope > .wb-page-toolbar' ? toolbar : null,
        prepend: (node) => { toolbar = node; }
    };
    const context = vm.createContext({
        state: { dashboard: { role }, activeSections: { [role]: section }, activeSubSections: {} },
        ...(page ? { saState: { page }, saPaint() { paints++; } } : {}),
        document: {
            getElementById: (id) => id === 'salary-advance-workspace' ? salaryRoot : null,
            querySelector: (selector) => selector === '#salary-advance-workspace' ? salaryRoot : null,
            addEventListener() {}, createElement: () => ({}), body: { dataset: {} }
        },
        ui: { dashboardContent: { querySelector: (selector) => null, querySelectorAll: () => [] } },
        postRenderSetup() {}, handleLogout() {}, renderDashboard() {}, handleDashboardClick() {},
        escapeHtml: (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../browser-client/workbench-help.js'), 'utf8'), context);
    return {
        run: (expression) => vm.runInContext(expression, context),
        toolbar: () => toolbar,
        paints: () => paints,
        setDialog: (stage) => { activeStage = stage; },
        describe({ label, name = '', action, form, submit = false, paperTarget = false, modal = false }) {
            context.helpControl = {
                name, dataset: action ? { saAction: action } : {},
                getAttribute: (attribute) => attribute === 'aria-label' ? label : null,
                matches: (selector) => (selector === 'button[type="submit"]' && submit) || (selector === '[data-sa-paper-target]' && paperTarget),
                closest: (selector) => selector === 'form' && form ? { dataset: { saForm: form }, querySelector: () => null } : null,
                // Help must never inspect the actual request, amount, note or employee identity.
                get value() { throw new Error('Private form values must not be read'); }
            };
            return vm.runInContext(`workbenchControlDescription(helpControl, workbenchHelpContext(${modal}))`, context);
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

test('salary page repaint refreshes the active subpage help without changing toolbar placement', () => {
    const ui = loadHelp({ page: 'query' });
    assert.match(ui.run('workbenchHelpContext(false).topic[1]'), /全員名冊/);
    ui.run('saPaint()'); assert.equal(ui.paints(), 1);
    assert.match(ui.toolbar().innerHTML, /借支申請管理/);
    ui.run('saState.page = "paper"; saPaint()');
    assert.equal(ui.paints(), 2);
    assert.equal(ui.run('workbenchHelpContext(false).sub'), 'paper');
    assert.match(ui.run('workbenchHelpContext(false).topic[1]'), /紙本/);
    ui.run('saState.page = "settings"; saPaint()');
    assert.match(ui.run('workbenchHelpContext(false).topic[1]'), /設定權限/);
});

test('paper help distinguishes selecting the actual registration month, preview confirmation and final save', () => {
    const ui = loadHelp({ page: 'paper' });
    assert.match(ui.describe({ label: '補登月份', name: 'applicationMonth', form: 'filters' }), /新增補登使用此月份/);
    assert.match(ui.describe({ label: '查詢', form: 'filters', submit: true }), /已查詢的登記月份/);
    const amount = ui.describe({ label: '085 補登金額（元）', name: 'requestedAmount', form: 'paper' });
    assert.match(amount, /原單規則快照上限/); assert.doesNotMatch(amount, /本人要借支/);
    assert.match(ui.describe({ label: '085 補登備註（選填）', name: 'note', form: 'paper' }), /不再送管理部待複核/);
    assert.match(ui.describe({ label: '確認儲存', form: 'paper', submit: true }), /此步驟尚未儲存/);
    assert.match(ui.describe({ label: '確認儲存', form: 'paper-confirm', submit: true }), /確認後儲存/);
    assert.match(ui.describe({ label: '編輯紀錄', paperTarget: true }), /不能用此欄修改一般線上申請/);
    assert.match(ui.describe({ label: '重設', action: 'reset-filters' }), /保留目前月份/);
});

test('paper help normalizes row labels without exposing employee identifiers or reading private values', () => {
    const ui = loadHelp({ page: 'paper' });
    for (const employee of ['085', 'PRIVATE-EMPLOYEE']) {
        ui.describe({ label: `${employee} 補登金額（元）`, name: 'requestedAmount', form: 'paper' });
        assert.equal(ui.run('workbenchControlLabel(helpControl)'), '補登金額（元）');
        ui.describe({ label: `${employee} 補登備註（選填）`, name: 'note', form: 'paper' });
        assert.equal(ui.run('workbenchControlLabel(helpControl)'), '補登備註（選填）');
    }
});

test('salary dialog help uses its exact operation stage and underlying page help remains unchanged', () => {
    const ui = loadHelp({ page: 'paper', dialogStage: 'paper-confirm' });
    assert.equal(ui.run('workbenchHelpContext().stage'), 'paper-confirm');
    assert.equal(ui.run('workbenchHelpContext().root'), '#salary-advance-workspace .sa-dialog[open]');
    assert.match(ui.run('workbenchHelpContext().topic[1]'), /確認後才會儲存/);
    assert.match(ui.describe({ label: '返回修改', action: 'dismiss', modal: true }), /保留欄位草稿/);
    assert.equal(ui.run('workbenchHelpContext(false).sub'), 'paper');
    assert.equal(ui.run('workbenchHelpContext(false).stage'), undefined);
    for (const [stage, title] of [['review', '管理部審核'], ['cancel', '取消借支申請'], ['withdraw', '撤回借支申請']]) {
        ui.setDialog(stage); assert.equal(ui.run('workbenchHelpContext().topic[0]'), title);
    }
    ui.setDialog(''); assert.equal(ui.run('workbenchHelpContext().stage'), undefined);
});
