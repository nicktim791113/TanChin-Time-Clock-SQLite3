const crypto = require('node:crypto');

const DEFAULT_SCHEDULE = { weekdays: [], cutoff: '09:00', leaveStart: '08:00', leaveEnd: '17:00' };
function fail(message, status = 400) { const error = new Error(message); error.status = status; throw error; }
function dateKey(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '2000-01-01' || value > '2100-12-31') fail('日期格式不正確。');
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) fail('日期不存在。');
    return value;
}
function timeKey(value) {
    if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) fail('時間須為 00:00 至 23:59。');
    return value;
}
function taipeiDate(now = Date.now()) { return new Date(now + 8 * 3600000).toISOString().slice(0, 10); }
function at(date, time) { return Date.parse(`${date}T${time}:00+08:00`); }
function monthDates(month) {
    if (typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) fail('月份格式不正確。');
    dateKey(`${month}-01`);
    const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
    return Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}
function reasonText(value, required = true) {
    const reason = typeof value === 'string' ? value.trim() : '';
    if ((required && !reason) || reason.length > 500) fail('請填寫異動原因（最多 500 字）。');
    return reason;
}

function createMealStore(sql, addAuditLog) {
    sql.exec(`
        CREATE TABLE IF NOT EXISTS meal_schedules (effective_date TEXT PRIMARY KEY, data_json TEXT NOT NULL, updated_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS meal_memberships (
            employee_id TEXT NOT NULL, effective_date TEXT NOT NULL, participating INTEGER NOT NULL,
            name TEXT NOT NULL, department TEXT NOT NULL, updated_at INTEGER NOT NULL,
            PRIMARY KEY(employee_id, effective_date));
        CREATE TABLE IF NOT EXISTS meal_days (date TEXT PRIMARY KEY, serving INTEGER NOT NULL, cutoff TEXT NOT NULL, note TEXT NOT NULL, updated_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS meal_choices (
            employee_id TEXT NOT NULL, date TEXT NOT NULL, eating INTEGER NOT NULL,
            name TEXT NOT NULL, department TEXT NOT NULL, reason TEXT NOT NULL, updated_at INTEGER NOT NULL,
            PRIMARY KEY(employee_id, date));
        CREATE TABLE IF NOT EXISTS meal_orders (
            date TEXT NOT NULL, revision INTEGER NOT NULL, snapshot_json TEXT NOT NULL,
            created_at INTEGER NOT NULL, created_by TEXT NOT NULL, reason TEXT NOT NULL,
            PRIMARY KEY(date, revision));
        CREATE INDEX IF NOT EXISTS meal_choices_date ON meal_choices(date);
    `);
    const all = (query, ...args) => sql.prepare(query).all(...args);
    const get = (query, ...args) => sql.prepare(query).get(...args);
    const run = (query, ...args) => sql.prepare(query).run(...args);
    const scheduleFor = (date) => {
        const row = get('SELECT * FROM meal_schedules WHERE effective_date <= ? ORDER BY effective_date DESC LIMIT 1', date);
        return { ...DEFAULT_SCHEDULE, ...(row ? JSON.parse(row.data_json) : {}), effectiveDate: row?.effective_date || '' };
    };
    const memberRows = (date) => all(`SELECT m.* FROM meal_memberships m WHERE m.effective_date =
        (SELECT MAX(m2.effective_date) FROM meal_memberships m2 WHERE m2.employee_id = m.employee_id AND m2.effective_date <= ?)`, date);
    function audit(context, action, id, before, after, reason) {
        if (!context?.audit) throw new Error('團膳異動缺少稽核操作者。');
        addAuditLog(context.audit({ action: `meal_${action}`, target_type: 'meal', target_id: id,
            summary: `${context.label || '團膳異動'}：${reason}`, before_data: before, after_data: { ...after, reason } }));
    }
    function ensureFuture(date, now) { if (date < taipeiDate(now)) fail('制度與參加資格只能從今天或未來生效，不能改寫歷史。'); }
    function employeeFor(id, allowFormer = false) {
        if (typeof id !== 'string' || !id.trim() || id.length > 128) fail('請選擇有效員工。');
        const employee = get('SELECT id, name, department FROM employees WHERE id = ?', id);
        if (!employee && allowFormer) {
            const member = get('SELECT * FROM meal_memberships WHERE employee_id = ? ORDER BY effective_date DESC LIMIT 1', id);
            if (member) return { id, name: member.name, department: member.department };
        }
        if (!employee) fail('找不到員工。', 404);
        return employee;
    }
    function dayState(date, now = Date.now()) {
        dateKey(date);
        const today = taipeiDate(now);
        const schedule = scheduleFor(date);
        const override = get('SELECT * FROM meal_days WHERE date = ?', date);
        const serving = override ? Boolean(override.serving) : schedule.weekdays.includes(new Date(`${date}T00:00:00Z`).getUTCDay());
        const cutoff = override?.cutoff || schedule.cutoff;
        const deadline = at(date, cutoff);
        const orders = all('SELECT * FROM meal_orders WHERE date = ? ORDER BY revision', date).map((row) => ({ ...row, snapshot: JSON.parse(row.snapshot_json), snapshot_json: undefined }));
        const order = orders.at(-1);
        const locked = now >= deadline || Boolean(order);
        const choices = all('SELECT * FROM meal_choices WHERE date = ?', date);
        const members = memberRows(date);
        const employees = all('SELECT id, name, department FROM employees');
        const employeeMap = new Map(employees.map((row) => [row.id, row]));
        const choiceMap = new Map(choices.map((row) => [row.employee_id, row]));
        const submitted = new Map((order?.snapshot.rows || []).map((row) => [row.employee_id, row]));
        const memberMap = new Map(members.map((row) => [row.employee_id, row]));
        const ids = new Set([...members.filter((m) => m.participating).map((m) => m.employee_id), ...choiceMap.keys(), ...submitted.keys()]);
        const leaves = all("SELECT employee_id, start_at, end_at FROM leave_requests WHERE status = 'approved' AND start_at < ? AND end_at > ?", at(date, '23:59') + 60000, at(date, '00:00'));
        const rows = [...ids].sort().map((id) => {
            const employee = employeeMap.get(id);
            const member = memberMap.get(id);
            const choice = choiceMap.get(id);
            // Effective-dated membership and schedule retain history; closed supplier lists are immutable snapshots.
            const eligible = Boolean(member?.participating);
            const eating = Boolean(serving && eligible && (choice ? choice.eating : true));
            const fullDayLeave = leaves.some((leave) => leave.employee_id === id && leave.start_at <= at(date, schedule.leaveStart) && leave.end_at >= at(date, schedule.leaveEnd));
            return { employee_id: id, name: (date < today ? choice?.name || member?.name : employee?.name) || submitted.get(id)?.name || member?.name || id,
                department: (date < today ? choice?.department || member?.department : employee?.department) || submitted.get(id)?.department || '',
                eligible, eating, formerEmployee: !employee, choice: choice ? (choice.eating ? 'eat' : 'skip') : 'default',
                submittedEating: order ? Boolean(submitted.get(id)?.eating) : null,
                canChange: serving && eligible && !locked, warning: eating && fullDayLeave,
                updatedAt: choice?.updated_at || null, reason: choice?.reason || '' };
        });
        const currentCount = rows.filter((row) => row.eating).length;
        const changes = order ? rows.filter((row) => row.eating !== row.submittedEating).map((row) => ({ employee_id: row.employee_id, name: row.name, before: row.submittedEating, after: row.eating })) : [];
        const version = crypto.createHash('sha256').update(JSON.stringify({ date, schedule, override, members, choices, employees, revision: order?.revision || 0 })).digest('hex');
        return { date, serving, cutoff, deadline, locked, note: override?.note || '', currentCount,
            submittedCount: order ? order.snapshot.count : null, submittedAt: order?.created_at || null,
            revision: order?.revision || 0, differenceCount: order ? currentCount - order.snapshot.count : null,
            changes, orders, rows, version };
    }
    function calendar({ month = taipeiDate().slice(0, 7), employeeId = null, now = Date.now() } = {}) {
        const dates = monthDates(month);
        const days = dates.map((date) => {
            const day = dayState(date, now);
            if (!employeeId) return day;
            const own = day.rows.find((row) => row.employee_id === employeeId) || { employee_id: employeeId, eligible: false, eating: false, canChange: false, warning: false, submittedEating: null };
            return { date, serving: day.serving, cutoff: day.cutoff, deadline: day.deadline, locked: day.locked, note: day.note, revision: day.revision, version: day.version,
                rows: [{ ...own, reason: undefined }] };
        });
        return { month, today: taipeiDate(now), now, days,
            ...(employeeId ? {} : { schedule: scheduleFor(dates[0]), schedules: all('SELECT * FROM meal_schedules ORDER BY effective_date').map((s) => ({ effectiveDate: s.effective_date, ...JSON.parse(s.data_json) })),
                employees: [...new Map([...all('SELECT employee_id AS id, name, department FROM meal_memberships ORDER BY effective_date'), ...all('SELECT id, name, department FROM employees ORDER BY id')].map((e) => [e.id, e])).values()],
                memberships: all('SELECT * FROM meal_memberships ORDER BY employee_id, effective_date') }) };
    }
    const saveSchedule = (body, context, now = Date.now()) => sql.transaction(() => {
        const date = dateKey(body.effectiveDate); ensureFuture(date, now);
        if (!Array.isArray(body.weekdays) || body.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) fail('供餐星期不正確。');
        const data = { weekdays: [...new Set(body.weekdays)].sort(), cutoff: timeKey(body.cutoff), leaveStart: timeKey(body.leaveStart), leaveEnd: timeKey(body.leaveEnd) };
        if (data.leaveStart >= data.leaveEnd) fail('全日請假提醒區間的結束時間須晚於開始時間。');
        const reason = reasonText(body.reason);
        const before = get('SELECT * FROM meal_schedules WHERE effective_date = ?', date) || null;
        run('INSERT INTO meal_schedules VALUES (?, ?, ?) ON CONFLICT(effective_date) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at', date, JSON.stringify(data), now);
        audit(context, 'schedule', date, before, data, reason);
    })();
    const saveMember = (body, context, now = Date.now()) => sql.transaction(() => {
        const employee = employeeFor(body.employeeId, body.participating === false);
        const date = dateKey(body.effectiveDate); ensureFuture(date, now);
        if (typeof body.participating !== 'boolean') fail('請指定加入或退出團膳。');
        const reason = reasonText(body.reason);
        const before = get('SELECT * FROM meal_memberships WHERE employee_id = ? AND effective_date = ?', employee.id, date) || null;
        const after = { employee_id: employee.id, effective_date: date, participating: body.participating, name: employee.name || employee.id, department: employee.department || '' };
        run(`INSERT INTO meal_memberships VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(employee_id, effective_date) DO UPDATE SET
            participating = excluded.participating, name = excluded.name, department = excluded.department, updated_at = excluded.updated_at`,
        employee.id, date, Number(body.participating), after.name, after.department, now);
        audit(context, 'membership', employee.id, before, after, reason);
    })();
    const saveDay = (body, context, now = Date.now()) => sql.transaction(() => {
        const date = dateKey(body.date); ensureFuture(date, now);
        if (typeof body.serving !== 'boolean') fail('請指定是否供餐。');
        const reason = reasonText(body.reason);
        const before = get('SELECT * FROM meal_days WHERE date = ?', date) || null;
        const after = { date, serving: body.serving, cutoff: timeKey(body.cutoff), note: reason };
        run('INSERT INTO meal_days VALUES (?, ?, ?, ?, ?) ON CONFLICT(date) DO UPDATE SET serving = excluded.serving, cutoff = excluded.cutoff, note = excluded.note, updated_at = excluded.updated_at',
            date, Number(body.serving), after.cutoff, reason, now);
        audit(context, 'day', date, before, after, reason);
    })();
    const saveChoice = (body, context, now = Date.now()) => sql.transaction(() => {
        const employee = employeeFor(body.employeeId, Boolean(context.manager));
        const day = dayState(body.date, now);
        const row = day.rows.find((item) => item.employee_id === employee.id);
        if (body.version !== day.version) fail('資料已變更，請重新整理後再確認。', 409);
        if (!day.serving || !row?.eligible) fail('此日未供餐或員工尚未參加團膳。');
        if (!context.manager && day.locked) fail('已達變更截止時間或已結單，請聯絡團膳管理者。', 403);
        if (typeof body.eating !== 'boolean') fail('請指定是否用餐。');
        const reason = reasonText(body.reason, Boolean(context.manager));
        const before = get('SELECT * FROM meal_choices WHERE employee_id = ? AND date = ?', employee.id, day.date) || { eating: row.eating, choice: 'default' };
        const after = { employee_id: employee.id, date: day.date, eating: body.eating, name: employee.name || employee.id, department: employee.department || '', updated_at: now };
        run(`INSERT INTO meal_choices VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(employee_id, date) DO UPDATE SET
            eating = excluded.eating, name = excluded.name, department = excluded.department, reason = excluded.reason, updated_at = excluded.updated_at`,
            employee.id, day.date, Number(body.eating), after.name, after.department, reason, now);
        audit(context, 'choice', `${day.date}/${employee.id}`, before, after, reason || (body.eating ? '員工確認用餐' : '員工取消用餐'));
    })();
    const closeOrder = (body, context, now = Date.now()) => sql.transaction(() => {
        const day = dayState(body.date, now);
        if (body.version !== day.version) fail('餐數已變更，請重新整理後確認交單。', 409);
        if (!day.serving && !day.revision) fail('未供餐日不可交單。');
        const reason = reasonText(body.reason);
        const snapshot = { serving: day.serving, cutoff: day.cutoff, count: day.currentCount, rows: day.rows.map(({ employee_id, name, department, eligible, eating }) => ({ employee_id, name, department, eligible, eating })) };
        run('INSERT INTO meal_orders VALUES (?, ?, ?, ?, ?, ?)', day.date, day.revision + 1, JSON.stringify(snapshot), now, context.actorId || '', reason);
        audit(context, 'close', day.date, day.orders.at(-1) || null, { revision: day.revision + 1, snapshot }, reason);
    })();
    return { calendar, dayState, saveSchedule, saveMember, saveDay, saveChoice, closeOrder };
}

module.exports = { createMealStore, taipeiDate, monthDates };
