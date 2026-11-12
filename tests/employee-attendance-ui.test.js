const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(require.resolve('../browser-client/employee-attendance.js'), 'utf8');
const timestamp = (local) => Date.parse(`${local}:00+08:00`);

function loadUi() {
    const state = {
        token: 'session-E001',
        dashboard: {
            role: 'employee', user: { id: 'E001' },
            punchHistoryWindow: { startAt: timestamp('2026-10-01T00:00'), endAt: timestamp('2026-11-12T17:20'), label: '本月及上月' }
        }
    };
    const listeners = new Map();
    const requests = [];
    const deferredRenders = [];
    const host = { outerHTML: '' };
    const adminHost = { outerHTML: '' };
    const notice = { textContent: '' };
    const confirms = [];
    const now = timestamp('2026-11-12T17:20');
    class FixedDate extends Date {
        static now() { return now; }
    }
    const document = {
        addEventListener(type, listener) {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type).push(listener);
        },
        getElementById(id) {
            if (id === 'employee-attendance-workspace') return host;
            if (id === 'attendance-calendar-workspace') return adminHost;
            return id === 'attendance-calendar-sync-notice' ? notice : null;
        }
    };
    const context = vm.createContext({
        Date: FixedDate, document, state,
        window: { confirm(message) { confirms.push(message); return context.confirmDiscard; } },
        queueMicrotask(callback) { deferredRenders.push(callback); },
        escapeHtml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); },
        requestJson(url, options) { return new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })); },
        renderDashboard(dashboard) { state.dashboard = dashboard; },
        handleRealtimeSyncMessage(payload) { return payload.type; },
        handleLogout() { state.token = ''; state.dashboard = null; },
        hasCurrentAdminPermission() { return true; }
    });
    vm.runInContext(source, context);
    const run = (expression) => vm.runInContext(expression, context);
    const render = () => run('renderEmployeeAttendanceWorkspace()');
    const click = async (action, month) => {
        const target = { closest: (selector) => selector === '[data-ea-action]' ? { dataset: { eaAction: action, month } } : null };
        for (const handler of listeners.get('click')) await handler({ target });
    };
    render();
    return { state, requests, host, adminHost, notice, confirms, deferredRenders, run, render, click };
}

function monthData(month, days = []) {
    return { attendance: { month, schedule: { configured: true }, days } };
}

test('calendar sync supersedes a pending employee assessment and keeps the selected month and view', async () => {
    const ui = loadUi();
    await ui.click('month', '2026-10');
    await ui.click('raw');
    assert.equal(await ui.run("handleRealtimeSyncMessage({type:'displaySettings'})"), 'displaySettings');
    await ui.run("handleRealtimeSyncMessage({type:'attendanceCalendar',origin:'browser',sessionToken:state.token})");
    assert.equal(ui.requests.length, 1);
    const updated = ui.run("handleRealtimeSyncMessage({type:'attendanceCalendar',origin:'browser',sessionToken:'admin-session'})");
    assert.equal(ui.requests[1].url, '/api/browser/employee/attendance?month=2026-10');
    ui.requests[1].resolve(monthData('2026-10', [{date:'2026-10-31', punches:[{timestamp:timestamp('2026-10-31T08:20'), type:'in', source:'latest-assessment'}]}]));
    await updated;
    ui.requests[0].resolve(monthData('2026-10'));
    await Promise.resolve();
    assert.match(ui.host.outerHTML, /<table class="ea-raw"[\s\S]*latest-assessment/);
});

test('calendar sync reloads a clean admin form, retains a dirty draft, and reloads only on explicit discard', async () => {
    const ui = loadUi();
    ui.state.dashboard.role = 'admin';
    ui.run('renderAttendanceCalendarSettings()');
    const calendar = revision => ({ calendar: { revision, workdays: [1, 2, 3, 4, 5], exceptions: [], canEdit: true } });
    const sync = () => ui.run("handleRealtimeSyncMessage({type:'attendanceCalendar',origin:'browser',sessionToken:'other-admin'})");
    const initial = sync();
    ui.requests[0].resolve(calendar(1));
    await initial;
    ui.run("attendanceCalendarUi.draft.reason='keep typing'; attendanceCalendarUi.dirty=true");
    await sync();
    assert.equal(ui.requests.length, 1);
    assert.equal(ui.confirms.length, 0);
    assert.match(ui.notice.textContent, /設定已有更新/);
    assert.equal(ui.run('attendanceCalendarUi.draft.reason'), 'keep typing');
    await ui.run('acalLoad({discardDraft:true})');
    assert.equal(ui.confirms.length, 1);
    assert.equal(ui.requests.length, 1);
    ui.run('globalThis.confirmDiscard=true');
    const retry = ui.run('acalLoad({discardDraft:true})');
    assert.match(ui.adminHost.outerHTML, /<fieldset disabled>/);
    ui.requests[1].reject(new Error('offline'));
    await retry;
    assert.equal(ui.run('attendanceCalendarUi.draft.reason'), 'keep typing');
    assert.match(ui.adminHost.outerHTML, /offline/);
    const reload = ui.run('acalLoad({discardDraft:true})');
    ui.requests[2].resolve(calendar(2));
    await reload;
    assert.equal(ui.run('attendanceCalendarUi.data.revision'), 2);
    assert.equal(ui.run('attendanceCalendarUi.draft.reason'), '');
    assert.equal(ui.run('attendanceCalendarUi.remoteChanged'), false);
});

test('employee attendance only requests the signed-in employee’s allowed months', async () => {
    const ui = loadUi();
    assert.match(ui.render(), /上月 <small>2026-10/);
    await ui.click('month', '2026-09');
    await ui.click('month', '2026-12');
    assert.equal(ui.requests.length, 0);
    await ui.click('month', '2026-10');
    assert.equal(ui.requests[0].url, '/api/browser/employee/attendance?month=2026-10');
    assert.equal(ui.requests[0].options.auth, true);
    ui.requests[0].resolve(monthData('2026-10'));
    await Promise.resolve();
    assert.match(ui.host.outerHTML, /data-month="2026-10" aria-pressed="true"/);

    const dashboard = ui.state.dashboard;
    dashboard.punchHistoryWindow.startAt = timestamp('2026-11-06T00:00');
    ui.run('renderDashboard(state.dashboard)');
    const limited = ui.render();
    assert.doesNotMatch(limited, /data-month="2026-10"/);
    assert.match(limited, /data-month="2026-11" aria-pressed="true"/);
    await ui.click('month', '2026-10');
    assert.equal(ui.requests.length, 1);
    ui.state.dashboard.role = 'admin';
    await ui.click('refresh');
    assert.equal(ui.requests.length, 1);
});

test('old attendance responses cannot populate another identity or reappear after logout', async () => {
    const ui = loadUi();
    const oldLoad = ui.run('eaLoad()');
    ui.state.token = 'session-E002';
    ui.state.dashboard.user.id = 'E002';
    ui.run('renderDashboard(state.dashboard)');
    ui.render();
    const newLoad = ui.run('eaLoad()');
    ui.requests[1].resolve(monthData('2026-11'));
    await newLoad;
    ui.requests[0].resolve(monthData('2026-10', [{ date: '2026-10-31', calendarNote: 'employee-one-only' }]));
    await oldLoad;
    assert.equal(ui.run('employeeAttendanceUi.data.month'), '2026-11');
    assert.doesNotMatch(ui.render(), /employee-one-only/);

    const leavingLoad = ui.run('eaLoad()');
    ui.run('handleLogout()');
    ui.requests[2].resolve(monthData('2026-11', [{ date: '2026-11-12', calendarNote: 'logout-private' }]));
    await leavingLoad;
    assert.equal(ui.run('employeeAttendanceUi.data'), null);
    assert.doesNotMatch(ui.host.outerHTML, /logout-private/);
});

test('daily and raw views show exact evidence, distinguish null from zero, and escape record text', async () => {
    const ui = loadUi();
    const load = ui.run('eaLoad()');
    ui.requests[0].resolve(monthData('2026-11', [{
        date: '2026-11-12', isWorkday: true, status: 'unknown',
        calendarNote: '<b>work note</b>', issues: ['missing_out', { message: '<img src=x onerror=run()>' }],
        lateMinutes: 0, earlyMinutes: null, firstInAt: timestamp('2026-11-12T08:20'), lastOutAt: null,
        requiredSegments: [{ startAt: timestamp('2026-11-12T08:20'), endAt: timestamp('2026-11-12T12:20') }],
        punches: [
            { timestamp: timestamp('2026-11-12T08:20'), type: 'in', source: '<source>', status: '<ok>' },
            { timestamp: timestamp('2026-11-12T08:21'), type: 'in', source: '<duplicate>', status: '重複打卡', excluded: true }
        ],
        leave: { pendingCount: 1, requests: [{ id: '<leave-id>', leaveTypeName: '<leave-type>', status: 'pending' }] },
        overtime: { status: 'unknown', approvedCount: 1, lateMinutes: 7, earlyMinutes: null,
            requests: [{ id: '<ot-id>', status: 'approved', assessmentStatus: 'in_progress', breakMinutes: null, lateMinutes: 7 }] }
    }]));
    await load;
    const daily = ui.host.outerHTML;
    assert.match(daily, /ea-minutes-zero">0<small> 分/);
    assert.match(daily, /ea-minutes-alert">7<small> 分/);
    assert.match(daily, /ea-unresolved">待確認/);
    assert.match(daily, /<details[^>]*data-ea-date="2026-11-12"/);
    assert.match(daily, /判定依據[\s\S]*當日原始打卡[\s\S]*請假依據[\s\S]*加班依據/);
    assert.match(daily, /休息 未記錄/);
    assert.match(daily, /缺少可配對的下班卡/);
    assert.doesNotMatch(daily, /missing_out/);
    assert.match(daily, /&lt;ot-id&gt;[\s\S]*ea-unresolved">未結束/);
    for (const escaped of ['&lt;b&gt;work note', '&lt;img src=x onerror=run()&gt;', '&lt;source&gt;', '&lt;ok&gt;', '&lt;leave-type&gt;', '&lt;leave-id&gt;', '&lt;ot-id&gt;']) {
        assert.ok(daily.includes(escaped), escaped);
    }
    assert.doesNotMatch(daily, /<img src=x|<source>|<b>work note/);
    await ui.click('raw');
    const raw = ui.host.outerHTML;
    assert.match(raw, /<table class="ea-raw"/);
    assert.match(raw, /08:21:00[\s\S]*&lt;duplicate&gt;[\s\S]*重複打卡[\s\S]*08:20:00[\s\S]*&lt;source&gt;/);
    assert.doesNotMatch(raw, /<details|<source>/);
    await ui.click('daily');
    assert.match(ui.host.outerHTML, /<details[^>]*data-ea-date="2026-11-12"/);
    assert.equal(ui.requests.length, 1, 'switching views reuses the same scoped response');
});
