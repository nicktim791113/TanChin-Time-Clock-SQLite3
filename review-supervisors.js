const crypto = require('node:crypto');

function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function createReviewSupervisorStore(sql, addAuditLog) {
    sql.exec(`CREATE TABLE IF NOT EXISTS employee_review_supervisors (
        employee_id TEXT PRIMARY KEY, supervisor_id TEXT NOT NULL, revision TEXT NOT NULL,
        updated_at INTEGER NOT NULL, updated_by TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS employee_review_supervisors_supervisor ON employee_review_supervisors(supervisor_id);
        CREATE TABLE IF NOT EXISTS employee_review_policies (employee_id TEXT PRIMARY KEY, mode TEXT NOT NULL, required_json TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS employee_review_members (employee_id TEXT NOT NULL, supervisor_id TEXT NOT NULL, PRIMARY KEY(employee_id, supervisor_id));`);
    const employees = () => sql.prepare('SELECT id, name, department FROM employees ORDER BY id').all();
    const policy = (employeeId) => {
        const saved = sql.prepare('SELECT * FROM employee_review_policies WHERE employee_id = ?').get(employeeId);
        const legacy = sql.prepare('SELECT * FROM employee_review_supervisors WHERE employee_id = ?').get(employeeId);
        const ids = saved ? sql.prepare('SELECT supervisor_id FROM employee_review_members WHERE employee_id = ? ORDER BY supervisor_id').all(employeeId).map((r) => r.supervisor_id) : [legacy?.supervisor_id].filter(Boolean);
        return { supervisorIds: ids, supervisorId: ids[0] || '', mode: saved?.mode || 'any', requiredSupervisorIds: saved ? JSON.parse(saved.required_json) : [] };
    };
    const rows = () => employees().flatMap((e) => policy(e.id).supervisorIds.map((id) => ({ employee_id: e.id, supervisor_id: id, enabled: true })));
    const customized = () => Boolean(sql.prepare("SELECT value FROM settings WHERE key = 'employeeReviewCustomized'").get());
    const insert = sql.prepare('INSERT OR REPLACE INTO employee_review_supervisors VALUES (?, ?, ?, ?, ?)');
    const importLegacy = (routes) => {
        if (customized()) fail('已使用個別員工審核主管設定，不能再用部門路徑覆蓋；請使用主管審核頁面。', 409);
        const staff = employees(), ids = new Set(staff.map((e) => e.id));
        sql.prepare('DELETE FROM employee_review_supervisors').run();
        sql.prepare('DELETE FROM employee_review_policies').run();
        sql.prepare('DELETE FROM employee_review_members').run();
        for (const employee of staff) {
            const route = routes.find((r) => r.enabled && r.department === String(employee.department || '').trim()) ||
                routes.find((r) => r.enabled && ['*', '全部', '預設'].includes(r.department));
            if (route && ids.has(route.supervisor_id) && route.supervisor_id !== employee.id)
                insert.run(employee.id, route.supervisor_id, crypto.randomUUID(), Date.now(), '__legacy_migration__');
        }
    };
    // Materialize the existing roster once; future hires never inherit a department rule.
    sql.transaction(() => {
        if (sql.prepare("SELECT value FROM settings WHERE key = 'employeeReviewMigration'").get()) return;
        const legacy = sql.prepare('SELECT * FROM leave_approval_routes ORDER BY department').all();
        importLegacy(legacy);
        sql.prepare("INSERT INTO settings (key, value) VALUES ('employeeReviewMigration', '1')").run();
        if (legacy.length) addAuditLog({ action: 'migrate', target_type: 'employee_review_supervisor', target_id: 'all',
            actor_id: '__system__', actor_role: 'system', summary: '將既有部門審核路徑轉為個別員工指定；不變更已送出案件',
            before_data: legacy, after_data: rows() });
    })();
    const state = () => {
        const staff = employees();
        return { employees: staff.map((e) => {
            const selected = policy(e.id), row = sql.prepare('SELECT * FROM employee_review_supervisors WHERE employee_id = ?').get(e.id);
            return { ...e, ...selected, revision: crypto.createHash('sha256')
                .update(JSON.stringify({ staff, row: row || null, policy: selected })).digest('hex') };
        }) };
    };
    const saveBatch = (body, audit, now = Date.now()) => sql.transaction(() => {
        const ids = body.employeeIds;
        const supervisorIds = body.supervisorIds === undefined ? typeof body.supervisorId === 'string' ? [body.supervisorId].filter(Boolean) : null : body.supervisorIds;
        if (!Array.isArray(supervisorIds) || supervisorIds.length > 100 || supervisorIds.some((id) => typeof id !== 'string' || !id) || new Set(supervisorIds).size !== supervisorIds.length) fail('請選擇最多 100 位不重複的審核主管。');
        const mode = body.mode || 'any', requiredSupervisorIds = body.requiredSupervisorIds || [];
        if (!['any', 'required'].includes(mode) || !Array.isArray(requiredSupervisorIds) || requiredSupervisorIds.some((id) => !supervisorIds.includes(id)) || new Set(requiredSupervisorIds).size !== requiredSupervisorIds.length ||
            (mode === 'required' && !requiredSupervisorIds.length) || (mode === 'any' && requiredSupervisorIds.length)) fail('指定必審模式須選擇必審主管，且必須包含在審核主管名單中。');
        const supervisorId = [...supervisorIds].sort()[0] || '';
        if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some((id) => typeof id !== 'string' || !id) ||
            new Set(ids).size !== ids.length) fail('請選擇 1 至 100 位不重複的設定員工。');
        const current = state(), staffIds = new Set(current.employees.map((e) => e.id));
        if (ids.some((id) => !staffIds.has(id))) fail('員工名單已變更，整批未儲存。', 409);
        if (supervisorIds.some((id) => !staffIds.has(id))) fail('請選擇現有審核主管。');
        if (ids.some((id) => supervisorIds.includes(id))) fail('不可指定員工本人為自己的審核主管，整批未儲存。');
        if (body.confirmReview !== true) fail('請確認更新所選員工的請假／加班審核主管。');
        if (!supervisorId && body.confirmClear !== true) fail('請另外確認清除所選員工的審核主管。');
        const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
        if (!reason || reason.length > 500) fail('請填寫設定原因（最多 500 字）。');
        if (!body.revisions || typeof body.revisions !== 'object' || Array.isArray(body.revisions) || ids.some((id) =>
            !Object.hasOwn(body.revisions, id) || body.revisions[id] !== current.employees.find((e) => e.id === id).revision))
            fail('審核主管或員工名單已變更，請重新整理；整批未儲存。', 409);
        const previous = rows(), batchId = crypto.randomUUID();
        for (const employeeId of ids) {
            const entry = audit({ action: 'employee_review_supervisor', target_type: 'employee_review_supervisor', target_id: employeeId,
                summary: `設定 ${employeeId} 的請假／加班審核主管：${reason}`,
                before_data: { ...policy(employeeId), rows: previous.filter((r) => r.employee_id === employeeId) },
                after_data: { employeeId, supervisorId, supervisorIds, mode, requiredSupervisorIds, reason, batchId, batchSize: ids.length } });
            insert.run(employeeId, supervisorId, crypto.randomUUID(), now, entry.actor_id || '');
            sql.prepare('INSERT OR REPLACE INTO employee_review_policies VALUES (?, ?, ?)').run(employeeId, mode, JSON.stringify([...requiredSupervisorIds].sort()));
            sql.prepare('DELETE FROM employee_review_members WHERE employee_id = ?').run(employeeId);
            supervisorIds.forEach((id) => sql.prepare('INSERT INTO employee_review_members VALUES (?, ?)').run(employeeId, id));
            addAuditLog(entry);
        }
        sql.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('employeeReviewCustomized', '1')").run();
        return { updatedCount: ids.length, batchId };
    })();
    const removeEmployees = (ids) => ids.forEach((id) => {
        sql.prepare('DELETE FROM employee_review_policies WHERE employee_id = ?').run(id);
        sql.prepare('DELETE FROM employee_review_members WHERE employee_id = ? OR supervisor_id = ?').run(id, id);
    });
    return { state, rows, policy, saveBatch, importLegacy, customized, removeEmployees };
}
module.exports = { createReviewSupervisorStore };
