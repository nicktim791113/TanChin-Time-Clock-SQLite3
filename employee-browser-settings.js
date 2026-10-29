'use strict';
const crypto = require('node:crypto');
const MODES = Object.freeze({ recent7: '最近 7 日', current_month: '本月', current_previous_month: '本月及上月' });
function punchHistoryWindow(mode = 'recent7', now = Date.now()) {
    if (!Object.hasOwn(MODES, mode)) mode = 'recent7';
    const date = new Date(now + 8 * 3600000).toISOString().slice(0, 10);
    const today = Date.parse(`${date}T00:00:00+08:00`);
    let startAt = today - 6 * 86400000;
    if (mode !== 'recent7') {
        const [year, month] = date.split('-').map(Number);
        startAt = Date.UTC(year, month - 1 - (mode === 'current_previous_month' ? 1 : 0), 1) - 8 * 3600000;
    }
    return { mode, label: MODES[mode], startAt, endAt: now, timeZone: 'Asia/Taipei' };
}
function createEmployeeBrowserSettingsStore(sql, addAuditLog) {
    sql.exec(`CREATE TABLE IF NOT EXISTS employee_browser_settings (
        employee_id TEXT PRIMARY KEY, punch_history_mode TEXT NOT NULL DEFAULT 'recent7', device_limit INTEGER,
        updated_at INTEGER NOT NULL, updated_by TEXT NOT NULL);`);
    const globalLimit = () => {
        const raw = sql.prepare('SELECT value FROM settings WHERE key = ?').get('browserSecuritySettings')?.value;
        const value = raw ? JSON.parse(raw)?.maxDevicesPerEmployee : undefined;
        return ['number', 'string'].includes(typeof value) && Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 4 ? Number(value) : 4;
    };
    const forEmployee = (id) => {
        const row = sql.prepare('SELECT punch_history_mode, device_limit FROM employee_browser_settings WHERE employee_id = ?').get(id);
        return { punchHistoryMode: row?.punch_history_mode || 'recent7', deviceLimit: row?.device_limit ?? null,
            effectiveDeviceLimit: row?.device_limit ?? globalLimit() };
    };
    const state = () => {
        const employees = sql.prepare('SELECT id, name, department FROM employees ORDER BY id').all().map((row) => ({ ...row,
            ...forEmployee(row.id), boundDeviceCount: sql.prepare('SELECT COUNT(*) AS n FROM employee_devices WHERE employee_id = ?').get(row.id).n }));
        const persisted = sql.prepare('SELECT * FROM employee_browser_settings ORDER BY employee_id').all();
        // Device heartbeats do not invalidate settings edits; roster, global limit and saved values do.
        const revision = crypto.createHash('sha256').update(JSON.stringify({ employees: employees.map(({ boundDeviceCount, ...row }) => row), persisted })).digest('hex');
        return { employees, revision, globalDeviceLimit: globalLimit() };
    };
    const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
    const save = (body, audit, now = Date.now()) => sql.transaction(() => {
        const before = state();
        if (typeof body.revision !== 'string' || body.revision !== before.revision) fail('員工個別設定或名單已變更，請重新整理後再儲存。', 409);
        if (body.confirm !== true) fail('請確認儲存員工個別設定。');
        const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
        if (!reason || reason.length > 500) fail('請填寫設定原因（最多 500 字）。');
        if (!Array.isArray(body.employees) || body.employees.length !== before.employees.length ||
            body.employees.some((row) => !row || typeof row !== 'object' || typeof row.id !== 'string' ||
                !before.employees.some((employee) => employee.id === row.id) || !Object.hasOwn(MODES, row.punchHistoryMode) ||
                !(row.deviceLimit === null || Number.isInteger(row.deviceLimit) && row.deviceLimit >= 1 && row.deviceLimit <= 4)) ||
            new Set(body.employees.map((row) => row.id)).size !== body.employees.length) fail('請提供完整且有效的員工打卡查詢範圍與裝置上限。');
        const changes = body.employees.map(({ id, punchHistoryMode, deviceLimit }) => ({ id, punchHistoryMode, deviceLimit }))
            .filter((row) => { const old = before.employees.find((employee) => employee.id === row.id); return old.punchHistoryMode !== row.punchHistoryMode || old.deviceLimit !== row.deviceLimit; });
        if (!changes.length) return before;
        const entry = audit({ action: 'employee_browser_settings_update', target_type: 'employee_browser_settings', target_id: 'employees',
            summary: `更新 ${changes.length} 位員工的打卡查詢範圍與裝置上限：${reason}`,
            before_data: before.employees.filter((row) => changes.some((change) => change.id === row.id)), after_data: { employees: changes, reason } });
        const insert = sql.prepare(`INSERT INTO employee_browser_settings VALUES (?, ?, ?, ?, ?) ON CONFLICT(employee_id) DO UPDATE SET
            punch_history_mode=excluded.punch_history_mode, device_limit=excluded.device_limit, updated_at=excluded.updated_at, updated_by=excluded.updated_by`);
        changes.forEach((row) => insert.run(row.id, row.punchHistoryMode, row.deviceLimit, now, entry.actor_id || ''));
        addAuditLog(entry);
        return state();
    })();
    const removeEmployees = (ids) => { const remove = sql.prepare('DELETE FROM employee_browser_settings WHERE employee_id = ?'); ids.forEach((id) => remove.run(id)); };
    return { forEmployee, state, save, removeEmployees };
}
module.exports = { createEmployeeBrowserSettingsStore, punchHistoryWindow };
