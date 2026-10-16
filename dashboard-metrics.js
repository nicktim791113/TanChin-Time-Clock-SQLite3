const crypto = require('node:crypto');
const DAY = 86400000, OFFSET = 8 * 3600000;
const DEFAULT_CARDS = ['employeeCount', 'todayPunchCount', 'leaveDay:0', 'overtimeDay:0', 'leavePendingSupervisor', 'leavePendingAdmin', 'overtimePendingSupervisor', 'mealToday'];
const relative = ['前3天', '前天', '昨天', '今天', '明天', '後天', '後3天'];
const dateText = (now) => new Date(now + OFFSET).toISOString().slice(0, 10);
function fail(message, statusCode = 400) { throw Object.assign(new Error(message), { statusCode }); }
function createDashboardMetricStore(sql, addAuditLog) {
    sql.exec('CREATE TABLE IF NOT EXISTS dashboard_metric_preferences (employee_id TEXT PRIMARY KEY, cards_json TEXT NOT NULL, revision TEXT NOT NULL, updated_at INTEGER NOT NULL)');
    const preferences = (id, catalog) => {
        const saved = sql.prepare('SELECT * FROM dashboard_metric_preferences WHERE employee_id = ?').get(id);
        const allowed = catalog.filter((c) => c.available).map((c) => c.key);
        const cards = [...new Set([...(saved ? JSON.parse(saved.cards_json) : DEFAULT_CARDS), ...DEFAULT_CARDS, ...allowed])].filter((key) => allowed.includes(key)).slice(0, 8);
        while (cards.length < 8) cards.push('');
        return { cardKeys: cards, revision: saved?.revision || 'new' };
    };
    const save = (id, body, catalog, audit) => sql.transaction(() => {
        const before = preferences(id, catalog), allowed = catalog.filter((c) => c.available).map((c) => c.key), cards = body.cardKeys;
        if (body.revision !== before.revision) fail('指標設定已變更，請重新開啟設定。', 409);
        if (body.confirm !== true || !Array.isArray(cards) || cards.length !== 8 || cards.some((key) => typeof key !== 'string' || (key && !allowed.includes(key)))) fail('請確認選擇八個已授權指標。');
        const selected = cards.filter(Boolean);
        if (new Set(selected).size !== selected.length || selected.length !== Math.min(8, allowed.length)) fail('八個位置不得重複；權限不足八種時其餘位置保留空白。');
        const revision = crypto.randomUUID();
        sql.prepare('INSERT OR REPLACE INTO dashboard_metric_preferences VALUES (?, ?, ?, ?)').run(id, JSON.stringify(cards), revision, Date.now());
        addAuditLog(audit({ action: 'dashboard_metric_preferences', target_type: 'dashboard_preferences', target_id: id, summary: '更新個人管理者指標列', before_data: before.cardKeys, after_data: cards }));
        return { cardKeys: cards, revision };
    })();
    const removeEmployees = (ids) => ids.forEach((id) => sql.prepare('DELETE FROM dashboard_metric_preferences WHERE employee_id = ?').run(id));
    return { preferences, save, removeEmployees };
}
function metricSources(db, can, now) {
    const today = dateText(now), start = Date.parse(`${today}T00:00:00+08:00`);
    const requests = (kind, permission) => {
        if (!can(permission)) return [];
        const query = kind === 'leave' ? db.queryLeaveRequests : db.queryOvertimeRequests;
        const nearby = query({ overlapStartAt: start - 3 * DAY, overlapEndAt: start + 4 * DAY - 1, limit: null });
        const pending = query({ status: kind === 'leave' ? ['pending_supervisor', 'pending_admin'] : 'pending_supervisor', limit: null });
        return [...new Map([...nearby, ...pending].map((row) => [row.id, row])).values()];
    };
    const leaves = requests('leave', 'admin.leave.review'), overtime = requests('overtime', 'admin.overtime.view');
    const charges = new Map(leaves.filter((row) => row.status === 'approved').map((row) => [row.id, db.getLeaveEntitlements().charges(row.id)]));
    const onDay = (kind, row, date) => {
        const at = Date.parse(`${date}T00:00:00+08:00`), dates = kind === 'leave' ? charges.get(row.id) || [] : [];
        return row.start_at < at + DAY && row.end_at > at && (!dates.length || dates.some((c) => c.date === date && c.hours > 0));
    };
    const meals = can('admin.meals.view') ? { today: db.getMeals().dayState(today, now), tomorrow: db.getMeals().dayState(dateText(start + DAY), now) } : null;
    return { today, start, leaves, overtime, meals, onDay };
}
function buildDashboardMetrics(db, can, summary = {}, now = Date.now(), suppliedSources = null) {
    const source = suppliedSources || metricSources(db, can, now), catalog = [];
    const add = (key, label, category, available, value, subtitle = '', date = null) => catalog.push({ key, label, category, available, value: available ? value : null, subtitle: available ? subtitle : '未授權', date });
    const roster = ['admin.people.view', 'admin.people.edit', 'admin.security.view', 'admin.reports.view', 'admin.manualPunch.create', 'admin.leave.review', 'admin.leave.paperCreate', 'admin.leave.settings', 'admin.leave.balances.view', 'admin.leave.balances.manage', 'admin.overtime.view', 'admin.overtime.paperCreate'].some(can);
    const attendance = can('admin.reports.view') || can('admin.manualPunch.create');
    add('employeeCount', '員工數量', '人員與考勤', roster, db.loadEmployees().length, '員工名冊總人數');
    add('todayPunchCount', '今日正常打卡', '人員與考勤', attendance, summary.todayPunchCount || 0, '出勤統計範圍');
    add('todayAbnormalPunchCount', '今日異常打卡', '人員與考勤', attendance, summary.todayAbnormalPunchCount || 0, '異常紀錄與失敗稽核');
    for (let offset = -3; offset <= 3; offset++) {
        const date = dateText(source.start + offset * DAY);
        for (const kind of ['leave', 'overtime']) {
            const rows = kind === 'leave' ? source.leaves : source.overtime;
            const people = new Set(rows.filter((r) => r.status === 'approved' && source.onDay(kind, r, date)).map((r) => r.employee_id));
            add(`${kind}Day:${offset}`, `${date.slice(5).replace('-', '/')} ${kind === 'leave' ? '請假' : '加班'}人數`, kind === 'leave' ? '請假' : '加班', can(kind === 'leave' ? 'admin.leave.review' : 'admin.overtime.view'), people.size, `${relative[offset + 3]} · 已核准`, date);
        }
    }
    add('leavePendingSupervisor', '請假待主管審核', '請假', can('admin.leave.review'), source.leaves.filter((r) => r.status === 'pending_supervisor').length, '全部日期 · 單數');
    add('leavePendingAdmin', '請假待管理部複核', '請假', can('admin.leave.review'), source.leaves.filter((r) => r.status === 'pending_admin').length, '全部日期 · 單數');
    add('overtimePendingSupervisor', '加班待主管審核', '加班', can('admin.overtime.view'), source.overtime.filter((r) => r.status === 'pending_supervisor').length, '全部日期 · 單數');
    for (const [key, label, name] of [['mealToday', '今天午餐份數', 'today'], ['mealTomorrow', '明天午餐份數', 'tomorrow']]) {
        const meal = source.meals?.[name];
        add(key, label, '午餐', Boolean(meal), meal?.currentCount || 0, meal ? `${meal.serving ? '供餐' : '未供餐'} · ${meal.submittedCount == null ? '未交單' : `已交單 ${meal.submittedCount} 份`}` : '', meal?.date);
    }
    add('mealParticipants', '參加午餐團膳人數', '午餐', Boolean(source.meals), source.meals?.today.rows.filter((r) => r.eligible).length || 0, '今日生效參加資格', source.today);
    for (const [key, label, permission] of [['shiftCount', '班別數量', 'admin.shifts.manage'], ['bellScheduleCount', '響鈴排程', 'admin.bells.manage'], ['greetingCount', '問候語', 'admin.system.manage'], ['customThemeCount', '自訂主題', 'admin.themes.manage']]) add(key, label, '系統', can(permission), summary[key] ?? 0);
    return { today: source.today, timeZone: 'Asia/Taipei', catalog,
        roster: roster ? db.loadEmployees().map(({ id, name, department, job_title, termination_date }) => ({ id, name, department, job_title, termination_date })) : [] };
}
function attachDashboardMetricRoutes(server, { db, requireSession, requireAdmin, can, auditEntry, notify, formatRecord }) {
    const handle = (callback) => (request, response) => { try { callback(request, response); } catch (error) { response.status(error.statusCode || 500).json({ success: false, error: error.statusCode ? error.message : '指標處理失敗，未儲存異動。' }); } };
    server.post('/api/browser/admin/dashboard-metrics/preferences', requireSession, requireAdmin, handle((request, response) => {
        if (request.browserSession.impersonation?.active) fail('身份模擬不能修改個人指標設定。', 403);
        const catalog = buildDashboardMetrics(db, (p) => can(request.browserSession, p)).catalog;
        const preferences = db.getDashboardMetrics().save(request.browserSession.employeeId, request.body || {}, catalog, (entry) => auditEntry(request, entry));
        notify(request); response.json({ success: true, preferences, message: '已儲存個人八張指標與順序。' });
    }));
    server.get('/api/browser/admin/dashboard-metrics/detail', requireSession, requireAdmin, handle((request, response) => {
        const allowed = (p) => can(request.browserSession, p), now = Date.now(), source = metricSources(db, allowed, now);
        const metrics = buildDashboardMetrics(db, allowed, {}, now, source), metric = metrics.catalog.find((c) => c.key === request.query.key);
        if (!metric?.available) fail('沒有此指標的查看權限。', 403);
        if (metric.date && request.query.date !== metric.date) fail('指標日期已變更，請重新整理。', 409);
        let rows, kind;
        if (metric.key.startsWith('leave') || metric.key.startsWith('overtime')) {
            kind = metric.key.startsWith('leave') ? 'leave' : 'overtime'; const all = kind === 'leave' ? source.leaves : source.overtime;
            rows = metric.key.includes('Day:') ? all.filter((r) => r.status === 'approved' && source.onDay(kind, r, metric.date)) : all.filter((r) => r.status === (metric.key === 'leavePendingAdmin' ? 'pending_admin' : 'pending_supervisor'));
        } else if (metric.key.startsWith('meal')) {
            kind = 'meal'; const meal = metric.key === 'mealTomorrow' ? source.meals.tomorrow : source.meals.today;
            rows = meal.rows.filter((r) => metric.key === 'mealParticipants' ? r.eligible : r.eating);
        } else fail('此指標請使用原明細入口。');
        const page = request.query.page == null ? 1 : Number(request.query.page);
        if (!Number.isSafeInteger(page) || page < 1) fail('頁碼不正確。');
        const totalPages = Math.max(1, Math.ceil(rows.length / 50)), current = Math.min(page, totalPages);
        response.json({ success: true, detail: { metric, kind, page: current, totalPages, totalRecords: rows.length, records: rows.slice((current - 1) * 50, current * 50).map((r) => kind === 'meal' ? ({ employeeId: r.employee_id, employeeName: r.name, employeeDepartment: r.department, eating: r.eating, submittedEating: r.submittedEating }) : formatRecord(kind, r)) } });
    }));
}
module.exports = { DEFAULT_CARDS, createDashboardMetricStore, buildDashboardMetrics, attachDashboardMetricRoutes };
