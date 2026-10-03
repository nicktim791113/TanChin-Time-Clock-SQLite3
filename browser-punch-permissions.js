const crypto = require('node:crypto');

function createBrowserPunchPermissionStore(sql, addAuditLog) {
    sql.exec(`CREATE TABLE IF NOT EXISTS browser_punch_permissions (
        employee_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL, updated_by TEXT NOT NULL);`);
    const allowed = (id) => sql.prepare('SELECT enabled FROM browser_punch_permissions WHERE employee_id = ?').get(id)?.enabled !== 0;
    const state = () => {
        const employees = sql.prepare(`SELECT e.id, e.name, e.department, COALESCE(p.enabled, 1) AS enabled,
            COALESCE(p.updated_at, 0) AS updatedAt FROM employees e
            LEFT JOIN browser_punch_permissions p ON p.employee_id = e.id ORDER BY e.id`).all()
            .map((row) => ({ ...row, enabled: Boolean(row.enabled) }));
        return { employees, revision: crypto.createHash('sha256').update(JSON.stringify(employees)).digest('hex') };
    };
    const save = (body, audit, now = Date.now()) => sql.transaction(() => {
        const before = state();
        const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
        if (body.revision !== before.revision) fail('打卡權限或員工名單已變更，請重新整理後再儲存。', 409);
        if (!Array.isArray(body.employees) || body.employees.length !== before.employees.length || body.employees.some((row) => !row || typeof row !== 'object') ||
            new Set(body.employees.map((row) => row.id)).size !== body.employees.length ||
            body.employees.some((row) => typeof row.enabled !== 'boolean' || !before.employees.some((e) => e.id === row.id))) {
            fail('請提供完整且有效的員工打卡權限。');
        }
        const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
        if (!reason || reason.length > 500) fail('請填寫設定原因（最多 500 字）。');
        const changes = body.employees.filter((row) => before.employees.find((e) => e.id === row.id).enabled !== row.enabled);
        if (!changes.length) return;
        const entry = audit({ action: 'browser_punch_permission', target_type: 'browser_punch_permission', target_id: 'employees',
            summary: `更新 ${changes.length} 位員工的網頁打卡權限：${reason}`,
            before_data: changes.map((row) => before.employees.find((e) => e.id === row.id)), after_data: { employees: changes, reason } });
        const insert = sql.prepare(`INSERT INTO browser_punch_permissions VALUES (?, ?, ?, ?)
            ON CONFLICT(employee_id) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at, updated_by = excluded.updated_by`);
        changes.forEach((row) => insert.run(row.id, Number(row.enabled), now, entry.actor_id || ''));
        addAuditLog(entry);
    })();
    return { allowed, state, save };
}
module.exports = { createBrowserPunchPermissionStore };
