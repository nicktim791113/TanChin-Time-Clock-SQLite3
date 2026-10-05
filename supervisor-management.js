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
    const saveAssignmentsBatch = (body, audit, now = Date.now()) => sql.transaction(() => {
        const employeeIds = body.employeeIds, supervisorIds = body.supervisorIds;
        if (!Array.isArray(employeeIds) || !employeeIds.length || employeeIds.length > 100 ||
            employeeIds.some((id) => typeof id !== 'string' || !id) || new Set(employeeIds).size !== employeeIds.length) fail('請選擇 1 至 100 位不重複的設定員工。');
        if (!Array.isArray(supervisorIds) || supervisorIds.length > 100 ||
            supervisorIds.some((id) => typeof id !== 'string' || !id) || new Set(supervisorIds).size !== supervisorIds.length) fail('請選擇最多 100 位不重複的主管。');
        if (!['add', 'replace'].includes(body.mode)) fail('請選擇新增或取代主管的設定模式。');
        if (body.mode === 'add' && !supervisorIds.length) fail('新增模式請至少選擇一位主管。');
        if (body.mode === 'replace' && !supervisorIds.length && body.confirmClear !== true) fail('請另外確認清除所選員工的全部代辦主管授權。');
        if (body.confirmAssignment !== true) fail('請確認更新所有勾選員工的代辦主管授權。');
        const reason = proxyReason(body.reason), available = new Set(employees().map((e) => e.id));
        if (employeeIds.some((id) => !available.has(id))) fail('設定員工已不存在，整批未儲存。', 409);
        if (supervisorIds.some((id) => !available.has(id))) fail('主管必須是現有員工，整批未儲存。');
        if (employeeIds.some((id) => supervisorIds.includes(id))) fail('設定員工與主管不可包含相同的人（不可指定本人），整批未儲存。');
        if (!body.revisions || typeof body.revisions !== 'object' || Array.isArray(body.revisions) ||
            employeeIds.some((id) => !Object.hasOwn(body.revisions, id) || body.revisions[id] !== revision(id))) fail('主管設定或員工名單已變更，請重新整理後再儲存；整批未儲存。', 409);
        const batchId = crypto.randomUUID(), assignments = rows(), ids = [...supervisorIds].sort();
        const insert = sql.prepare('INSERT INTO supervisor_assignments VALUES (?, ?, ?, ?)');
        const remove = sql.prepare('DELETE FROM supervisor_assignments WHERE employee_id = ?');
        // Validate the entire batch before writing; audit failures roll back every employee.
        employeeIds.forEach((employeeId) => {
            const before = assignments.filter((row) => row.employee_id === employeeId);
            const previous = before.map((row) => row.supervisor_id);
            const after = body.mode === 'add' ? [...new Set([...previous, ...ids])].sort() : ids;
            const entry = audit({ action: 'supervisor_assignment', target_type: 'supervisor_assignment', target_id: employeeId,
                summary: `批量${body.mode === 'add' ? '新增' : '取代'} ${employeeId} 的指定代辦主管：${reason}`, before_data: before,
                after_data: { employeeId, supervisorIds: after, reason, mode: body.mode, batchId, batchSize: employeeIds.length } });
            if (body.mode === 'replace') remove.run(employeeId);
            ids.filter((id) => body.mode === 'replace' || !previous.includes(id)).forEach((id) => insert.run(employeeId, id, now, entry.actor_id || ''));
            addAuditLog(entry);
        });
        return { updatedCount: employeeIds.length, batchId };
    })();
    return { assignedEmployees, isAssigned, assignmentsState, saveAssignments, saveAssignmentsBatch, transaction: (callback) => sql.transaction(callback)() };
}
module.exports = { createSupervisorStore, proxyReason, requirePersonalSupervisor };
