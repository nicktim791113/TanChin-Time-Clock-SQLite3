const crypto = require('node:crypto');
const XLSX = require('xlsx');
const KEY = 'leaveEntitlementSettings';
const HEADERS = ['員工編號', '姓名', '假別代碼', '假別', '年度', '每日工時', '設定方式', '扣抵起日', '額度天數', '結轉小時', '調整小時', '設定原因', '版本'];
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fail(message, statusCode = 400) { throw Object.assign(new Error(message), { statusCode }); }
function year(value) { const n = Number(value); if (!Number.isInteger(n) || n < 2000 || n > 2100) fail('年度須為 2000 至 2100。'); return n; }
function date(value) {
    const parsed = typeof value === 'string' ? new Date(`${value}T00:00:00Z`) : new Date(NaN);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail('日期格式須為 YYYY-MM-DD 且為有效日期。');
    return value;
}
const day = (timestamp) => new Date(Number(timestamp) + 8 * 3600000).toISOString().slice(0, 10);
const hours = (units) => units / 100;
function units(value, label, negative = false) {
    if (value === '' || value == null || !['number', 'string'].includes(typeof value) || !/^-?\d+(\.\d{1,2})?$/.test(String(value))) fail(`${label}須為最多兩位小數的數字。`);
    const number = Number(value); if (!Number.isFinite(number) || Math.abs(number) > 100000 || (!negative && number < 0)) fail(`${label}超出有效範圍。`);
    return Math.round(number * 100);
}
function reason(value) { if (typeof value !== 'string' || !value.trim() || value.trim().length > 500) fail('請填寫設定原因（最多 500 字）。'); return value.trim(); }
function createLeaveEntitlementStore(sql, addAuditLog) {
    let annualProvider = null;
    sql.exec(`CREATE TABLE IF NOT EXISTS leave_entitlements (
        employee_id TEXT NOT NULL, leave_type_id TEXT NOT NULL, year INTEGER NOT NULL,
        day_units INTEGER NOT NULL, grant_units INTEGER NOT NULL, carry_units INTEGER NOT NULL,
        adjustment_units INTEGER NOT NULL, mode TEXT NOT NULL, accounting_start TEXT NOT NULL,
        revision TEXT NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT NOT NULL,
        PRIMARY KEY(employee_id, leave_type_id, year));
        CREATE TABLE IF NOT EXISTS leave_entitlement_charges (
        request_id TEXT NOT NULL, date TEXT NOT NULL, units INTEGER NOT NULL, PRIMARY KEY(request_id, date));
        CREATE INDEX IF NOT EXISTS leave_entitlement_charge_date ON leave_entitlement_charges(date);
        CREATE TABLE IF NOT EXISTS leave_entitlement_employee_epochs (employee_id TEXT PRIMARY KEY, after_at INTEGER NOT NULL);`);
    const staff = () => sql.prepare('SELECT id, name, department, hire_date FROM employees ORDER BY id').all();
    const types = () => sql.prepare('SELECT id, name, unit, enabled, deducts_balance FROM leave_types ORDER BY display_order, id').all();
    const grants = () => sql.prepare('SELECT * FROM leave_entitlements ORDER BY year, employee_id, leave_type_id').all();
    const settings = () => {
        const value = sql.prepare('SELECT value FROM settings WHERE key = ?').get(KEY)?.value;
        const saved = value ? JSON.parse(value) : { dayHours: 8, period: 'calendar_year' };
        return { dayHours: saved.dayHours, period: 'calendar_year', revision: hash(value || saved) };
    };
    const revision = () => hash({ settings: settings(), staff: staff(), types: types(), grants: grants(),
        epochs: sql.prepare('SELECT * FROM leave_entitlement_employee_epochs ORDER BY employee_id').all() });
    const usageRevision = () => hash({ requests: sql.prepare('SELECT id, employee_id, leave_type_id, start_at, end_at, duration_hours, status, updated_at FROM leave_requests ORDER BY id').all(),
        charges: sql.prepare('SELECT * FROM leave_entitlement_charges ORDER BY request_id, date').all() });
    function allocation(request, dailyHours, explicitHours) {
        const start = day(request.start_at), end = day(request.end_at - 1);
        const tracked = Boolean(types().find((t) => t.id === request.leave_type_id)?.deducts_balance) || annualProvider?.isManaged(request.employee_id, request.leave_type_id, Number(start.slice(0, 4))) ||
            grants().some((g) => g.employee_id === request.employee_id && g.leave_type_id === request.leave_type_id);
        if (tracked && (explicitHours === '' || explicitHours == null || units(explicitHours, '實際請假時數') <= 0)) fail('額度假別請填寫實際請假時數，不可用起訖時間自動推算。');
        let rows = dailyHours;
        if (typeof rows === 'string' && !rows.trim()) rows = [];
        if (typeof rows === 'string' && rows.trim()) {
            rows = rows.trim().split(/\r?\n/).map((line) => { const parts = line.split('='); if (parts.length !== 2) fail('每日時數格式為 YYYY-MM-DD=小時，每日一列。'); return { date: parts[0].trim(), hours: parts[1].trim() }; });
        }
        if (rows === '' || rows == null) rows = [];
        if (!Array.isArray(rows) || rows.length > 370) fail('每日請假時數格式錯誤或超過 370 日。');
        const total = Math.round(Number(request.duration_hours) * 100);
        if (!Number.isSafeInteger(total) || total <= 0 || total > 10000000) fail('請假時數超出有效範圍。');
        if (!rows.length) {
            if ((tracked && start !== end) || start.slice(0, 4) !== end.slice(0, 4)) fail('跨日額度請假須填寫每日實際時數（排除午休、非工作日），加總須等於整筆時數。');
            return [{ date: start, units: total }];
        }
        const seen = new Set();
        const normalized = rows.map((row) => {
            const d = date(row.date), amount = units(row.hours, '每日時數');
            if (d < start || d > end || seen.has(d) || amount <= 0 || amount > 2400) fail('每日時數日期須在申請期間、不重複，且介於 0 至 24 小時。');
            seen.add(d); return { date: d, units: amount };
        });
        if (normalized.reduce((sum, row) => sum + row.units, 0) !== total) fail('每日時數加總須等於整筆請假時數。');
        return normalized;
    }
    const replaceCharges = (requestId, rows) => {
        sql.prepare('DELETE FROM leave_entitlement_charges WHERE request_id = ?').run(requestId);
        const insert = sql.prepare('INSERT INTO leave_entitlement_charges VALUES (?, ?, ?)');
        rows.forEach((row) => insert.run(requestId, row.date, row.units));
    };
    const chargeQuery = sql.prepare('SELECT date, units FROM leave_entitlement_charges WHERE request_id = ? ORDER BY date');
    const charges = (requestId) => chargeQuery.all(requestId).map((row) => ({ date: row.date, hours: hours(row.units) }));
    function balance(grant) {
        const last = `${grant.year}-12-31`, warnings = [], result = { used_units: 0, held_units: 0, records: [] };
        const requests = sql.prepare("SELECT * FROM leave_requests WHERE employee_id = ? AND leave_type_id = ? AND status IN ('approved', 'pending_supervisor', 'pending_admin')").all(grant.employee_id, grant.leave_type_id);
        const epoch = sql.prepare('SELECT after_at FROM leave_entitlement_employee_epochs WHERE employee_id = ?').get(grant.employee_id)?.after_at || 0;
        const chargeQuery = sql.prepare('SELECT date, units FROM leave_entitlement_charges WHERE request_id = ? ORDER BY date');
        for (const request of requests) {
            if (request.created_at <= epoch) continue;
            const start = day(request.start_at), end = day(request.end_at - 1);
            if (end < grant.accounting_start || start > last) continue;
            let charges = chargeQuery.all(request.id), basis = 'daily';
            if (!charges.length) {
                basis = 'stored_hours';
                if (start < grant.accounting_start || end > last || !(Number(request.duration_hours) > 0)) {
                    warnings.push(`舊單 ${request.id} 跨扣抵邊界或無有效時數，需由額度管理者分配每日扣抵。`); continue;
                }
                charges = [{ date: start, units: Math.round(Number(request.duration_hours) * 100) }];
            }
            const amount = charges.filter((c) => c.date >= grant.accounting_start && c.date <= last).reduce((sum, c) => sum + c.units, 0);
            if (!amount) continue;
            const pending = request.status !== 'approved';
            result[pending ? 'held_units' : 'used_units'] += amount;
            result.records.push({ requestId: request.id, status: request.status, hours: hours(amount), basis });
        }
        const available = grant.grant_units + grant.carry_units + grant.adjustment_units - result.used_units - result.held_units;
        return { ...grant, dayHours: hours(grant.day_units), grantDays: grant.grant_units / grant.day_units,
            grantHours: hours(grant.grant_units), carryHours: hours(grant.carry_units), adjustmentHours: hours(grant.adjustment_units),
            usedHours: hours(result.used_units), heldHours: hours(result.held_units), availableHours: warnings.length ? null : hours(available),
            availableDays: warnings.length ? null : available / grant.day_units, warnings, records: result.records };
    }
    const removeEmployees = (ids) => ids.forEach((id) => {
        sql.prepare('DELETE FROM leave_entitlements WHERE employee_id = ?').run(id);
        sql.prepare('INSERT OR REPLACE INTO leave_entitlement_employee_epochs VALUES (?, ?)').run(id, Date.now());
    });
    const balances = (employeeIds, requestedYear) => {
        const selectedYear = year(requestedYear);
        const precise = selectedYear >= 2017 ? annualProvider?.balances(employeeIds, selectedYear) || [] : [];
        return [...grants().filter((g) => employeeIds.includes(g.employee_id) && g.year === selectedYear && !precise.some((a) => a.employee_id === g.employee_id && a.leave_type_id === g.leave_type_id)).map(balance), ...precise];
    };
    const state = (requestedYear) => ({ year: year(requestedYear), settings: settings(), employees: staff(), leaveTypes: types(),
        revision: revision(), usageRevision: usageRevision(), balances: balances(staff().map((e) => e.id), requestedYear) });
    function normalizeRows(rows) {
        if (!Array.isArray(rows) || !rows.length || rows.length > 1000) fail('請提供 1 至 1000 筆額度設定。');
        const people = staff(), leaveTypes = types(), current = grants(), seen = new Set();
        return rows.map((row) => {
            const y = year(row.year), employee = people.find((e) => e.id === row.employeeId), type = leaveTypes.find((t) => t.id === row.leaveTypeId);
            if (!employee || !type) fail('員工或假別已不存在，請重新匯出名單。', 409);
            if (annualProvider?.isManaged(employee.id, type.id, y)) fail('此員工的特休已由精確權利帳管理，請使用年資特休的獨立額度調整，不可用人工表單或 Excel 覆蓋。', 409);
            const key = `${employee.id}\0${type.id}\0${y}`;
            if (seen.has(key)) fail('相同員工、假別、年度不可重複設定。'); seen.add(key);
            const old = current.find((g) => g.employee_id === employee.id && g.leave_type_id === type.id && g.year === y);
            const dayUnits = old?.day_units || units(row.dayHours ?? settings().dayHours, '每日工時');
            if (dayUnits < 100 || dayUnits > 2400) fail('每日工時須介於 1 至 24 小時。');
            if (old && row.dayHours != null && units(row.dayHours, '每日工時') !== old.day_units) fail('已設定年度的換算工時不可改寫，請調整小時額度或建立新年度。');
            const start = date(row.accountingStart || `${y}-01-01`), mode = row.mode || 'total';
            if (!['total', 'remaining'].includes(mode) || !start.startsWith(`${y}-`) || (mode === 'total' && start !== `${y}-01-01`)) fail('全年總額扣抵起日須為 1 月 1 日；剩餘額度起日須在所選年度。');
            const grantUnits = Math.round(units(row.grantDays, '額度天數') * dayUnits / 100);
            const normalized = { employee_id: employee.id, leave_type_id: type.id, year: y, day_units: dayUnits,
                grant_units: grantUnits, carry_units: units(row.carryHours ?? 0, '結轉小時'), adjustment_units: units(row.adjustmentHours ?? 0, '調整小時', true),
                mode, accounting_start: start, reason: reason(row.reason) };
            if (grantUnits + normalized.carry_units + normalized.adjustment_units < 0) fail('額度、結轉及調整合計不可為負。');
            return normalized;
        });
    }
    const preview = (body) => {
        if (body.revision !== revision()) fail('額度制度或名冊已有異動，請重新整理／匯出並預覽。', 409);
        const rows = normalizeRows(body.rows);
        return { revision: body.revision, digest: hash({ rows, usageRevision: usageRevision() }), rows: rows.map((row) => ({ ...balance(row), reason: row.reason })) };
    };
    const save = (body, audit) => sql.transaction(() => {
        if (body.confirm !== true) fail('請確認儲存預覽中的全部額度。');
        const check = preview(body), rows = normalizeRows(body.rows);
        if (body.digest !== check.digest) fail('預覽內容已改變，請重新預覽。', 409);
        const before = grants(), batchId = crypto.randomUUID(), insert = sql.prepare('INSERT OR REPLACE INTO leave_entitlements VALUES (@employee_id, @leave_type_id, @year, @day_units, @grant_units, @carry_units, @adjustment_units, @mode, @accounting_start, @revision, @updated_at, @updated_by)');
        rows.forEach((row) => {
            const previous = before.find((g) => g.employee_id === row.employee_id && g.leave_type_id === row.leave_type_id && g.year === row.year) || null;
            const entry = audit({ action: 'leave_entitlement', target_type: 'leave_entitlement', target_id: `${row.employee_id}/${row.leave_type_id}/${row.year}`,
                summary: `設定假別額度：${row.reason}`, before_data: previous, after_data: { ...row, batchId } });
            insert.run({ ...row, revision: crypto.randomUUID(), updated_at: Date.now(), updated_by: entry.actor_id || '' });
            addAuditLog(entry);
        });
        return { updatedCount: rows.length, batchId };
    })();
    const saveSettings = (body, audit) => sql.transaction(() => {
        const before = settings();
        if (body.revision !== before.revision) fail('制度設定已變更，請重新整理。', 409);
        if (body.confirm !== true || body.period !== 'calendar_year') fail('請確認曆年制設定。');
        const n = units(body.dayHours, '每日工時'); if (n < 100 || n > 2400) fail('每日工時須介於 1 至 24 小時。');
        const after = { dayHours: hours(n), period: 'calendar_year', reason: reason(body.reason) };
        sql.prepare('INSERT OR REPLACE INTO settings VALUES (?, ?)').run(KEY, JSON.stringify(after));
        addAuditLog(audit({ action: 'leave_entitlement_settings', target_type: 'leave_entitlement', target_id: 'settings', summary: `變更假別額度制度：${after.reason}`, before_data: before, after_data: after }));
    })();
    const allocateLegacy = (body, audit) => sql.transaction(() => {
        if (body.revision !== revision() || body.usageRevision !== usageRevision() || body.confirm !== true) fail('資料已變更或尚未確認，請重新整理。', 409);
        const request = sql.prepare('SELECT * FROM leave_requests WHERE id = ?').get(body.requestId);
        if (!request) fail('找不到請假單。', 404);
        const rows = allocation(request, body.dailyHours, request.duration_hours), why = reason(body.reason);
        const before = sql.prepare('SELECT * FROM leave_entitlement_charges WHERE request_id = ?').all(request.id);
        replaceCharges(request.id, rows);
        addAuditLog(audit({ action: 'leave_entitlement_allocation', target_type: 'leave_entitlement', target_id: request.id,
            summary: `確認請假扣抵分配：${why}`, before_data: before, after_data: { rows, reason: why, requestUpdatedAt: request.updated_at } }));
        annualProvider?.reconcile();
    })();
    function workbook(requestedYear, leaveTypeId) {
        const data = state(requestedYear), type = data.leaveTypes.find((t) => t.id === leaveTypeId);
        if (!type) fail('請選擇有效假別。');
        const rows = data.employees.map((employee) => {
            const g = data.balances.find((b) => b.employee_id === employee.id && b.leave_type_id === type.id);
            return [employee.id, employee.name || '', type.id, type.name, data.year, g?.dayHours ?? data.settings.dayHours,
                g?.mode === 'remaining' ? '剩餘額度' : '全年總額', g?.accounting_start || `${data.year}-01-01`,
                g ? Math.round(g.grantDays * 100) / 100 : null, g?.carryHours ?? 0, g?.adjustmentHours ?? 0, null, data.revision];
        });
        const book = XLSX.utils.book_new(), sheet = XLSX.utils.aoa_to_sheet([HEADERS, ...rows]);
        sheet['!cols'] = HEADERS.map((_, index) => ({ wch: [16, 18, 16, 16, 10, 12, 16, 16, 14, 14, 14, 50, 68][index] }));
        sheet['!autofilter'] = { ref: sheet['!ref'] };
        XLSX.utils.book_append_sheet(book, sheet, '假別額度');
        const summary = XLSX.utils.aoa_to_sheet([['員工編號', '姓名', '假別', '年度', '已核准小時', '待審預占小時', '可用小時', '待確認'],
            ...data.balances.filter((b) => b.leave_type_id === type.id).map((b) => [b.employee_id, data.employees.find((e) => e.id === b.employee_id)?.name, type.name, data.year, b.usedHours, b.heldHours, b.availableHours, b.warnings.join('；')])]);
        summary['!cols'] = [16, 18, 16, 10, 18, 20, 18, 80].map((wch) => ({ wch }));
        XLSX.utils.book_append_sheet(book, summary, '目前餘額');
        XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
            ['填寫說明'], ['只填額度天數、結轉小時、調整小時、設定原因。額度天數空白的列不匯入；0 表示明確設定零額度。'],
            ['全年總額：扣抵起日為 1 月 1 日，計入該年度既有已核准及待審時數。'],
            ['剩餘額度：填寫截至扣抵起日前一日的剩餘天數。只計入扣抵起日以後的時數，之前異動需人工調整額度。'],
            ['不可改工號、姓名、假別代碼、年度、每日工時及版本。若系統資料異動，重新匯出。'],
            ['跨年或跨扣抵起日且沒有每日分配的舊單會顯示待確認，不推算分攤。'],
            ['新年度獨立設定，不自動結轉、不計算未休工資；結轉須經人工確認。']]), '填寫說明');
        book.Sheets['填寫說明']['!cols'] = [{ wch: 115 }];
        return XLSX.write(book, { type: 'buffer', bookType: 'xlsx', compression: true });
    }
    function readWorkbook(buffer) {
        if (!Buffer.isBuffer(buffer) || buffer.length > 5 * 1024 * 1024) fail('Excel 檔案須小於 5 MB。');
        // Bound ZIP expansion before handing user-supplied workbooks to the parser.
        let end = -1;
        for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65557); offset--) {
            if (buffer.readUInt32LE(offset) === 0x06054b50 && offset + 22 + buffer.readUInt16LE(offset + 20) === buffer.length) { end = offset; break; }
        }
        if (end < 0 || buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6)) fail('請使用有效的 .xlsx 活頁簿。');
        const count = buffer.readUInt16LE(end + 10), directoryEnd = buffer.readUInt32LE(end + 16) + buffer.readUInt32LE(end + 12);
        if (count > 200 || directoryEnd > end) fail('Excel 壓縮內容超過安全範圍。');
        let offset = buffer.readUInt32LE(end + 16), expanded = 0;
        for (let i = 0; i < count; i++) {
            if (offset + 46 > directoryEnd || buffer.readUInt32LE(offset) !== 0x02014b50 || buffer.readUInt16LE(offset + 8) & 1) fail('Excel 壓縮格式不支援。');
            expanded += buffer.readUInt32LE(offset + 24);
            if (expanded > 20 * 1024 * 1024) fail('Excel 解壓縮內容超過 20 MB。');
            offset += 46 + buffer.readUInt16LE(offset + 28) + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
        }
        if (offset !== directoryEnd) fail('Excel 壓縮內容異常。');
        let book; try { book = XLSX.read(buffer, { type: 'buffer', cellFormula: true, sheetRows: 1002 }); } catch { fail('無法讀取 Excel，請使用系統匯出的 .xlsx 範本。'); }
        const sheet = book.Sheets['假別額度']; if (!sheet) fail('缺少「假別額度」工作表。');
        const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
        if (range.e.r > 1000 || range.e.c !== 12) fail('Excel 須為系統匯出的 13 欄，最多 1000 筆。');
        if (Object.values(sheet).some((cell) => cell && typeof cell === 'object' && cell.f)) fail('匯入不接受公式，請填寫實際數字。');
        const table = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });
        if (JSON.stringify(table[0]) !== JSON.stringify(HEADERS)) fail('Excel 欄位標題已變更，請重新匯出。');
        const people = staff(), leaveTypes = types(), currentRevision = revision(), rows = [];
        for (let i = 1; i < table.length; i++) {
            const row = table[i]; if (row[8] == null || row[8] === '') continue;
            try {
                if (typeof row[0] !== 'string' || typeof row[2] !== 'string') fail('工號與假別代碼須保持文字格式（保留前導零）。');
                const employee = people.find((e) => e.id === row[0]), type = leaveTypes.find((t) => t.id === row[2]);
                if (!employee || !type || (employee.name || '') !== row[1] || type.name !== row[3] || row[12] !== currentRevision) fail('姓名、假別或版本不符，請重新匯出。', 409);
                if (!['全年總額', '剩餘額度'].includes(row[6])) fail('設定方式須為全年總額或剩餘額度。');
                rows.push({ employeeId: row[0], leaveTypeId: row[2], year: row[4], dayHours: row[5], mode: row[6] === '剩餘額度' ? 'remaining' : 'total',
                    accountingStart: row[7], grantDays: row[8], carryHours: row[9], adjustmentHours: row[10], reason: row[11] });
            } catch (error) { fail(`Excel 第 ${i + 1} 列：${error.message}`, error.statusCode); }
        }
        const body = { revision: currentRevision, rows }; return { ...body, preview: preview(body) };
    }
    return { settings, state, revision, usageRevision, balances, allocation, replaceCharges, charges, preview, save, saveSettings, allocateLegacy, workbook, readWorkbook, removeEmployees, setAnnualProvider: (provider) => { annualProvider = provider; } };
}
module.exports = { createLeaveEntitlementStore };
