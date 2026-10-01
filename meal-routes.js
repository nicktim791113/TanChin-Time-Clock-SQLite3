const { taipeiDate } = require('./meal-management');
function attachMealRoutes(server, context) {
    const { db, requireSession, requireRole, requirePermission, auditEntry, notify } = context;
    const store = () => db.getMeals();
    function handler(callback) {
        return (request, response) => {
            try { callback(request, response); }
            catch (error) {
                console.error('[團膳]', error.message);
                response.status(error.status || 500).json({ success: false, error: error.status ? error.message : '團膳資料寫入失敗，未儲存異動，請聯絡管理者。' });
            }
        };
    }
    const ownCalendar = (request) => store().calendar({ month: request.query.month || taipeiDate().slice(0, 7), employeeId: request.browserSession.employeeId });
    server.get('/api/browser/employee/meals', requireSession, requireRole('employee'), handler((request, response) => {
        response.json({ success: true, meals: ownCalendar(request) });
    }));
    server.get('/api/browser/admin/meals', requireSession, requirePermission('admin.meals.view'), handler((request, response) => {
        response.json({ success: true, meals: store().calendar({ month: request.query.month || taipeiDate().slice(0, 7) }) });
    }));
    const actions = [
        ['employee/meals/choice', null, 'saveChoice', '員工午餐登記'],
        ['admin/meals/choice', 'admin.meals.manage', 'saveChoice', '管理者代登午餐'],
        ['admin/meals/membership', 'admin.meals.manage', 'saveMember', '團膳參加資格'],
        ['admin/meals/schedule', 'admin.meals.settings', 'saveSchedule', '團膳供餐制度'],
        ['admin/meals/day', 'admin.meals.settings', 'saveDay', '每日供餐與截止時間'],
        ['admin/meals/close', 'admin.meals.close', 'closeOrder', '團膳供應商交單']
    ];
    actions.forEach(([route, permission, method, label]) => {
        server.post(`/api/browser/${route}`, requireSession, permission ? requirePermission('admin.meals.view', permission) : requireRole('employee'), handler((request, response) => {
            const body = { ...request.body };
            if (!permission) body.employeeId = request.browserSession.employeeId;
            const actorId = request.browserSession.realEmployeeId || request.browserSession.employeeId;
            store()[method](body, { manager: Boolean(permission), actorId, label, audit: (entry) => auditEntry(request, entry) });
            notify(request);
            response.json({ success: true, message: `${label}已儲存。` });
        }));
    });
    server.get('/api/browser/admin/meals/export', requireSession, requirePermission('admin.meals.view'), handler((request, response) => {
        const calendar = store().calendar({ month: request.query.month });
        const escape = (value) => {
            let text = String(value ?? '');
            if (typeof value !== 'number' && (/^\s*[=+@\-]/.test(text) || /^[\t\r\n]/.test(text))) text = `'${text}`;
            return `"${text.replace(/"/g, '""')}"`;
        };
        const rows = [['日期', '供餐', '截止時間', '目前登記餐數', '已交供應商份數', '交單版次', '差額', '工號', '姓名', '部門', '目前預訂', '已交單預訂', '全日請假提醒']];
        calendar.days.forEach((day) => {
            (day.rows.length ? day.rows : [null]).forEach((row) => rows.push([day.date, day.serving ? '是' : '否', day.cutoff, day.currentCount, day.submittedCount, day.revision, day.differenceCount,
                row?.employee_id, row?.name, row?.department, row ? (row.eating ? '用餐' : '不用餐') : '', row?.submittedEating == null ? '' : (row.submittedEating ? '用餐' : '不用餐'), row?.warning ? '是' : '']));
        });
        db.addAuditLog(auditEntry(request, { action: 'meal_export', target_type: 'meal', target_id: calendar.month, summary: '匯出午餐預訂月報' }));
        response.setHeader('Content-Disposition', `attachment; filename="lunch-${calendar.month}.csv"`);
        response.type('text/csv; charset=utf-8').send('\uFEFF' + rows.map((row) => row.map(escape).join(',')).join('\r\n'));
    }));
}
module.exports = { attachMealRoutes };
