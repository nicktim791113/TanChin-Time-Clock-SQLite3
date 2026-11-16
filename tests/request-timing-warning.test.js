const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

test('past timing confirmation uses only selected Taipei intervals and rechecks changed periods', async () => {
    const buttons = {};
    let dialog;
    const context = vm.createContext({
        document: {
            getElementById: () => dialog,
            body: { append: node => { dialog = node; } },
            createElement: () => ({
                setAttribute() {}, showModal() {},
                querySelector: key => buttons[key] ||= {},
                addEventListener: (_, close) => { context.onClose = close; },
                close(value) { this.returnValue = value; context.onClose(); },
                remove() { dialog = null; }
            })
        }
    });
    vm.runInContext(fs.readFileSync(require.resolve('../browser-client/request-timing-warning.js'), 'utf8'), context);
    const confirm = context.confirmPastRequestTiming;
    const now = Date.parse('2026-11-16T09:00:00+08:00');
    const draft = {};
    const leave = { startDate: '2026-11-15', leaveSegments: [{ startAt: now, endAt: now + 60000 }] };
    assert.equal(confirm('leave', leave, draft, now), true);
    leave.leaveSegments.push({ startAt: now - 60000, endAt: now });
    const canceled = confirm('leave', leave, draft, now);
    assert.match(dialog.innerHTML, /此為事後提出申請，請確認是否違反申請流程/);
    buttons['[data-past-request-back]'].onclick();
    assert.equal(await canceled, false);
    const accepted = confirm('leave', leave, draft, now);
    buttons['[data-past-request-confirm]'].onclick();
    assert.equal(await accepted, true);
    assert.equal(confirm('leave', leave, draft, now), true);
    leave.leaveSegments[0].endAt += 60000;
    const changed = confirm('leave', leave, draft, now);
    buttons['[data-past-request-back]'].onclick();
    assert.equal(await changed, false);
    assert.equal(confirm('overtime', { startDate: '2026-11-16', startTime: '09:00', endDate: '2026-11-16', endTime: '10:00' }, {}, now), true);
    const overtime = confirm('overtime', { startDate: '2026-11-16', startTime: '08:59', endDate: '2026-11-16', endTime: '10:00' }, {}, now);
    buttons['[data-past-request-back]'].onclick();
    assert.equal(await overtime, false);
});
