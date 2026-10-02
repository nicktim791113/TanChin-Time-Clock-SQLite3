const crypto = require('node:crypto');

function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function proxyReason(value) {
    const reason = typeof value === 'string' ? value.trim() : '';
    if (!reason || reason.length > 500) fail('請填寫代辦／異動原因（最多 500 字）。');
    return reason;
}
function requirePersonalSupervisor(session) {
    if (session?.role !== 'employee' || session.authMethod !== 'web_password' || session.impersonation?.active ||
        (session.realEmployeeId && session.realEmployeeId !== session.employeeId)) {
        fail('主管代辦須使用主管本人的個人網頁密碼登入員工工作台。', 403);
    }
}
function createSupervisorStore(sql, addAuditLog) {
    sql.exec(`CREATE TABLE IF NOT EXISTS supervisor_assignments (
        employee_id TEXT NOT NULL, supervisor_id TEXT NOT NULL, updated_at INTEGER NOT NULL,
        updated_by TEXT NOT NULL, PRIMARY KEY(employee_id, supervisor_id));
        CREATE INDEX IF NOT EXISTS supervisor_assignments_supervisor ON supervisor_assignments(supervisor_id);`);
    const employees = () => sql.prepare('SELECT id, name, department FROM employees ORDER BY id').all();
    const rows = () => sql.prepare('SELECT * FROM supervisor_assignments ORDER BY employee_id, supervisor_id').all();
    const revision = (id) => crypto.createHash('sha256').update(JSON.stringify({
        employees: employees(), assignments: rows().filter((row) => row.employee_id === id)
    })).digest('hex');
    const assignedEmployees = (id) => sql.prepare(`SELECT e.id, e.name, e.department FROM employees e
        JOIN supervisor_assignments a ON a.employee_id = e.id
        JOIN employees s ON s.id = a.supervisor_id WHERE a.supervisor_id = ? AND e.id <> ? ORDER BY e.id`).all(id, id);
    const isAssigned = (supervisorId, employeeId) => assignedEmployees(supervisorId).some((e) => e.id === employeeId);
    const assignmentsState = () => {
        const assignments = rows();
        return { employees: employees().map((e) => ({ ...e, revision: revision(e.id),
            supervisorIds: assignments.filter((row) => row.employee_id === e.id).map((row) => row.supervisor_id) })) };
    };
    const saveAssignments = (body, audit, now = Date.now()) => sql.transaction(() => {
        const employee = employees().find((e) => e.id === body.employeeId);
        if (!employee) fail('找不到要設定的員工。', 404);
        if (!Array.isArray(body.supervisorIds) || body.supervisorIds.some((id) => typeof id !== 'string')) fail('請選擇主管名單。');
        const ids = [...new Set(body.supervisorIds)].sort();
        const available = new Set(employees().map((e) => e.id));
        if (ids.some((id) => !available.has(id) || id === employee.id)) fail('主管必須是現有員工，且不可指定本人。');
        if (body.revision !== revision(employee.id)) fail('主管設定或員工名單已變更，請重新整理後再儲存。', 409);
        const reason = proxyReason(body.reason);
        const before = rows().filter((row) => row.employee_id === employee.id);
        const entry = audit({ action: 'supervisor_assignment', target_type: 'supervisor_assignment', target_id: employee.id,
            summary: `設定 ${employee.id} 的指定代辦主管：${reason}`, before_data: before,
            after_data: { employeeId: employee.id, supervisorIds: ids, reason } });
        sql.prepare('DELETE FROM supervisor_assignments WHERE employee_id = ?').run(employee.id);
        const insert = sql.prepare('INSERT INTO supervisor_assignments VALUES (?, ?, ?, ?)');
        ids.forEach((id) => insert.run(employee.id, id, now, entry.actor_id || ''));
        addAuditLog(entry);
    })();
    return { assignedEmployees, isAssigned, assignmentsState, saveAssignments, transaction: (callback) => sql.transaction(callback)() };
}
module.exports = { createSupervisorStore, proxyReason, requirePersonalSupervisor };
