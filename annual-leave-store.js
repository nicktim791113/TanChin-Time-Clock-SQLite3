const crypto = require('node:crypto');
const calc = require('./annual-leave-calculator');
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const id = () => crypto.randomUUID();
const json = (value) => JSON.stringify(value);
const parse = (value) => JSON.parse(value);
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const exact = (value) => calc.serialize(calc.rational(value));
const add = (a, b) => exact(calc.add(a, b));
const sub = (a, b) => exact(calc.subtract(a, b));
const mul = (a, b) => exact(calc.multiply(a, b));
const div = (a, b) => exact(calc.divide(a, b));
const cmp = (a, b) => calc.compare(a, b);
const sum = (values) => values.reduce(add, exact('0'));
const min = (a, b) => cmp(a, b) < 0 ? exact(a) : exact(b);
const maximum = (a, b) => cmp(a, b) > 0 ? exact(a) : exact(b);
const numeric = (value) => Number(value.numerator) / Number(value.denominator);
const FULL_HALF_YEAR = 'full_at_acquisition_year_end';
function calculationForEmployee(value) {
    if (Array.isArray(value)) return value.map(calculationForEmployee);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).filter(([key]) => !['factorBasis', 'agreementReference', 'openingSource', 'evidence'].includes(key)).map(([key, item]) => [key, calculationForEmployee(item)]));
}
const taipeiDay = (timestamp) => new Date(Number(timestamp) + 28800000).toISOString().slice(0, 10);
function date(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('日期須為 YYYY-MM-DD。');
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail('日期不是有效日期。');
    return value;
}
const plusDay = (value) => new Date(Date.parse(`${date(value)}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
function nextYearDate(value) {
    const d = new Date(`${date(value)}T00:00:00Z`), year = d.getUTCFullYear() + 1, month = d.getUTCMonth();
    return new Date(Date.UTC(year, month, Math.min(d.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate()))).toISOString().slice(0, 10);
}
function year(value) { const n = Number(value); if (!Number.isInteger(n) || n < 2017 || n > 2100) fail('特休年度須為 2017 至 2100。'); return n; }
function text(value, label, max = 500) { if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(`請填寫${label}（最多 ${max} 字）。`); return value.trim(); }
function quantity(value, label, allowNegative = false) {
    if (typeof value !== 'string' && typeof value !== 'number') fail(`${label}須為十進位或分數，例如 7.01、1/3。`);
    if (String(value).length > 100) fail(`${label}精度超出上限。`);
    let result; try { result = exact(value); } catch { fail(`${label}須為有效十進位或分數。`); }
    if ((!allowNegative && cmp(result, '0') < 0) || cmp(result, '100000') > 0 || cmp(result, '-100000') < 0) fail(`${label}超出範圍。`);
    return result;
}

function createAnnualLeaveStore(sql, addAuditLog, options = {}) {
    const now = options.now || Date.now, today = () => taipeiDay(now()), previews = new Map();
    sql.exec(`
      CREATE TABLE IF NOT EXISTS annual_leave_policy_versions (id TEXT PRIMARY KEY, leave_type_id TEXT NOT NULL, effective_from TEXT NOT NULL, data_json TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(leave_type_id,effective_from));
      CREATE TABLE IF NOT EXISTS annual_leave_policy_revisions (id TEXT PRIMARY KEY, policy_id TEXT NOT NULL, before_json TEXT NOT NULL, after_json TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS employee_service_periods (employee_id TEXT PRIMARY KEY, revision TEXT NOT NULL, data_json TEXT NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS annual_leave_accounts (id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, leave_type_id TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, data_json TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS annual_leave_active_account ON annual_leave_accounts(employee_id,leave_type_id) WHERE active=1;
      CREATE TABLE IF NOT EXISTS annual_leave_grant_lots (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, event_key TEXT NOT NULL, data_json TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(account_id,event_key));
      CREATE TABLE IF NOT EXISTS annual_leave_allocations (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, source_lot_id TEXT, year INTEGER NOT NULL, data_json TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS annual_leave_allocation_account ON annual_leave_allocations(account_id,year);
      CREATE TABLE IF NOT EXISTS annual_leave_adjustments (id TEXT PRIMARY KEY, allocation_id TEXT NOT NULL, amount_json TEXT NOT NULL, data_json TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS annual_leave_year_closures (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, allocation_id TEXT NOT NULL, amount_json TEXT NOT NULL, data_json TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS annual_leave_batches (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL, result_json TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(actor_id,idempotency_key));
      CREATE TABLE IF NOT EXISTS annual_leave_ledger (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, allocation_id TEXT, request_id TEXT, action TEXT NOT NULL, data_json TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS annual_leave_charge_state (account_id TEXT NOT NULL, request_id TEXT NOT NULL, data_json TEXT NOT NULL, PRIMARY KEY(account_id,request_id));
    `);
    const staff = () => sql.prepare('SELECT id,name,department,hire_date,termination_date AS leave_date FROM employees ORDER BY id').all();
    const policies = () => sql.prepare('SELECT * FROM annual_leave_policy_versions ORDER BY effective_from,id').all().map((r) => ({ halfYearMode: 'prorated', ...parse(r.data_json), id: r.id }));
    const services = () => sql.prepare('SELECT * FROM employee_service_periods ORDER BY employee_id').all().map((r) => ({ ...parse(r.data_json), revision: r.revision }));
    const accounts = () => sql.prepare('SELECT * FROM annual_leave_accounts WHERE active=1 ORDER BY employee_id,leave_type_id').all().map((r) => ({ ...parse(r.data_json), id: r.id, employeeId: r.employee_id, leaveTypeId: r.leave_type_id }));
    const lotsFor = (accountId) => sql.prepare('SELECT * FROM annual_leave_grant_lots WHERE account_id=? ORDER BY event_key').all(accountId).map((r) => ({ ...parse(r.data_json), id: r.id, accountId: r.account_id }));
    const legacyRows = (employeeId, typeId) => sql.prepare('SELECT * FROM leave_entitlements WHERE employee_id=? AND leave_type_id=? ORDER BY year').all(employeeId, typeId);
    const employeeEpoch = (employeeId) => sql.prepare('SELECT after_at FROM leave_entitlement_employee_epochs WHERE employee_id=?').get(employeeId)?.after_at || 0;
    const revision = () => hash({
        staff: staff(), types: sql.prepare('SELECT id,name,enabled,deducts_balance FROM leave_types ORDER BY id').all(),
        policies: policies(), services: services(), accounts: accounts(),
        lots: sql.prepare('SELECT * FROM annual_leave_grant_lots ORDER BY id').all(),
        allocations: sql.prepare('SELECT * FROM annual_leave_allocations ORDER BY id').all(),
        adjustments: sql.prepare('SELECT * FROM annual_leave_adjustments ORDER BY id').all(),
        closures: sql.prepare('SELECT * FROM annual_leave_year_closures ORDER BY id').all(),
        legacy: sql.prepare('SELECT * FROM leave_entitlements ORDER BY employee_id,leave_type_id,year').all(),
        requests: sql.prepare('SELECT id,employee_id,leave_type_id,start_at,end_at,duration_hours,status,created_at,updated_at FROM leave_requests ORDER BY id').all(),
        charges: sql.prepare('SELECT * FROM leave_entitlement_charges ORDER BY request_id,date').all()
    });
    function checkRevision(body) { if (body.revision !== revision()) fail('年資、額度、制度或請假資料已變更，請重新整理並預覽。', 409); }
    const entryAudit = (audit, action, target, before, after, why) => addAuditLog(audit({ action, target_type: 'annual_leave', target_id: target, summary: why, before_data: before, after_data: after }));
    function ledger(accountId, allocationId, requestId, action, data) {
        sql.prepare('INSERT INTO annual_leave_ledger VALUES (?,?,?,?,?,?,?)').run(id(), accountId, allocationId || null, requestId || null, action, json(data), now());
    }
    function policyCanRevise(policy) {
        // Even inactive accounts are historical posted references. A later
        // employee deletion must never make an already-used policy editable.
        if (sql.prepare('SELECT 1 FROM annual_leave_accounts WHERE leave_type_id=? LIMIT 1').get(policy.leaveTypeId)) return false;
        const ids = new Set(policies().filter((p) => p.leaveTypeId === policy.leaveTypeId).map((p) => p.id));
        return !['annual_leave_grant_lots', 'annual_leave_allocations', 'annual_leave_ledger'].some((table) =>
            sql.prepare(`SELECT data_json FROM ${table}`).all().some((row) => {
                const data = parse(row.data_json);
                return ids.has(data.policyId) || ids.has(data.policy?.id);
            }));
    }
    function policyFields(body) {
        if (body.confirm !== true || body.confirmAnnualLeave !== true) fail('請確認此制度只適用所選特休假別。');
        const type = sql.prepare('SELECT * FROM leave_types WHERE id=?').get(body.leaveTypeId);
        if (!type || !type.enabled || !type.deducts_balance) fail('請選擇已啟用且扣額度的特休假別。');
        if (!['calendar_year', 'anniversary'].includes(body.period) || !['calendar_month', 'actual_day'].includes(body.prorationBasis) || !['raw', 'ceil_1_decimal'].includes(body.rounding)) fail('制度期間、折算基礎或小數方式不正確。');
        const halfYearMode = body.halfYearMode ?? 'prorated';
        if (!['prorated', FULL_HALF_YEAR].includes(halfYearMode) || (halfYearMode === FULL_HALF_YEAR && body.period !== 'calendar_year')) fail('半年整筆給假並於年底結清只適用曆年制。');
        const effectiveFrom = date(body.effectiveFrom);
        if (effectiveFrom < '2017-01-01') fail('現行年資制度生效日不可早於 2017-01-01。');
        return { name: text(body.name, '制度名稱', 100), leaveTypeId: type.id, leaveTypeName: type.name,
            period: body.period, prorationBasis: body.prorationBasis, rounding: body.rounding, halfYearMode, effectiveFrom,
            agreementReference: text(body.agreementReference, '制度與折算約定依據'), reason: text(body.reason, '設定原因') };
    }
    function savePolicy(body, audit) {
        return sql.transaction(() => {
            checkRevision(body);
            const fields = policyFields(body), { effectiveFrom, reason: why } = fields;
            const previous = policies().filter((p) => p.leaveTypeId === fields.leaveTypeId);
            if (previous.some((p) => p.effectiveFrom >= effectiveFrom)) fail('新制度版本的生效日須晚於此假別所有舊版本。', 409);
            const posted = accounts().filter((a) => a.leaveTypeId === fields.leaveTypeId).flatMap((a) => lotsFor(a.id));
            if (posted.some((l) => l.acquisitionDate >= effectiveFrom)) fail('新版本生效日不可回溯覆蓋已給假批次。', 409);
            const policy = { id: id(), ...fields, createdAt: now() };
            sql.prepare('INSERT INTO annual_leave_policy_versions VALUES (?,?,?,?,?)').run(policy.id, fields.leaveTypeId, effectiveFrom, json(policy), now());
            entryAudit(audit, 'annual_leave_policy', policy.id, null, policy, `建立特休制度版本：${why}`);
            return { policyId: policy.id, policy };
        })();
    }
    function reviseUnusedPolicy(body, audit) {
        return sql.transaction(() => {
            checkRevision(body);
            if (body.confirmUnusedRevision !== true) fail('請明確確認只修訂尚未入帳的制度，保留原版本歷程。');
            const before = policies().find((p) => p.id === body.policyId);
            if (!before) fail('找不到要修訂的制度。', 404);
            if (!policyCanRevise(before)) fail('此假別已有入帳或歷史權利帳，不能修改原制度；請另建較晚生效版本。', 409);
            const fields = policyFields(body);
            if (fields.leaveTypeId !== before.leaveTypeId || fields.effectiveFrom !== before.effectiveFrom) fail('未入帳修訂須保留原假別與生效日；日期異動請另建制度版本。');
            const revisionId = id(), policy = { ...before, ...fields, revisedAt: now(), revisionId };
            sql.prepare('INSERT INTO annual_leave_policy_revisions VALUES (?,?,?,?,?)').run(revisionId, before.id, json(before), json(policy), now());
            sql.prepare('UPDATE annual_leave_policy_versions SET data_json=? WHERE id=?').run(json(policy), before.id);
            entryAudit(audit, 'annual_leave_policy_revision', before.id, before, policy, `修訂未入帳特休制度：${fields.reason}`);
            return { policyId: policy.id, policy, revisionId };
        })();
    }
    function saveService(body, audit) {
        return sql.transaction(() => {
            checkRevision(body);
            const person = staff().find((e) => e.id === body.employeeId);
            if (!person) fail('員工已不存在。', 404);
            if (body.confirm !== true || body.verified !== true) fail('請確認已核對到職年資、工時、接管基準與適用規則。');
            const previous = services().find((s) => s.employeeId === person.id) || null, activeAccounts = accounts().filter((a) => a.employeeId === person.id);
            if (activeAccounts.length && (!previous || !body.serviceEffectiveFrom)) fail('已入帳員工須提供新版本生效日，不可直接改寫已入帳年資版本。', 409);
            const hireDate = date(person.hire_date), serviceDate = date(body.serviceDate), cutoverDate = date(body.cutoverDate ?? previous?.cutoverDate);
            if (cutoverDate < hireDate || cutoverDate < '2017-01-01' || cutoverDate > '2100-12-31') fail('接管起日須介於實際到職日（且不早於 2017 年）與 2100 年之間。');
            if (serviceDate > cutoverDate) fail('認列年資起算日不可晚於接管起日。');
            const effectiveFrom = date(body.serviceEffectiveFrom || cutoverDate);
            if (effectiveFrom < cutoverDate || effectiveFrom > '2100-12-31') fail('年資版本生效日須介於接管起日與 2100 年之間。');
            const oldVersions = previous ? serviceVersions(previous) : [];
            if ((oldVersions[0]?.effectiveFrom || effectiveFrom) > cutoverDate) fail('首版年資版本須自接管日起生效；接管日不得早於已核對的最早版本，避免套用未生效工時。', 409);
            if (activeAccounts.length && oldVersions.some((v) => v.effectiveFrom >= effectiveFrom)) fail('已入帳年資的新版本生效日須晚於所有舊版本；不得回寫舊版本。', 409);
            if (!activeAccounts.length && oldVersions.some((v) => v.effectiveFrom > effectiveFrom)) fail('請先核對已建立的較晚生效版本，不可覆寫較早版本。', 409);
            if (oldVersions.length >= 100) fail('年資版本已達 100 筆，請先完成專用歷史資料核對。', 409);
            const dayHours = quantity(body.dayHours, '每日正常工時');
            if (cmp(dayHours, '1') < 0 || cmp(dayHours, '24') > 0) fail('每日正常工時須介於 1 至 24 小時。');
            const employmentType = body.employmentType || 'full_time';
            if (!['full_time', 'part_time_same_days', 'part_time_proportional'].includes(employmentType)) fail('工作型態不正確。');
            const entitlementFactor = quantity(body.entitlementFactor ?? '1', '特休日數折算比例');
            if (cmp(entitlementFactor, '0') <= 0 || cmp(entitlementFactor, '1') > 0 || (employmentType !== 'part_time_proportional' && cmp(entitlementFactor, '1') !== 0)) fail('只有已核對的比例部分工時可另設 0 至 1 的折算比例。');
            const factorBasis = employmentType === 'part_time_proportional' ? text(body.factorBasis, '部分工時比例依據') : '';
            if (!Array.isArray(body.excludedPeriods || []) || (body.excludedPeriods || []).length > 100) fail('不計年資區間格式不正確。');
            const excludedPeriods = (body.excludedPeriods || []).map((p) => ({ start: date(p.start), end: date(p.end), reason: text(p.reason, '不計年資原因') })).sort((a, b) => a.start.localeCompare(b.start));
            excludedPeriods.forEach((p, i) => { if (p.end <= p.start || p.start < serviceDate || (i && excludedPeriods[i - 1].end > p.start)) fail('不計年資區間不得倒置、重疊或早於起算日。'); });
            const openingHours = body.openingHours == null && previous ? exact(previous.openingHours) : quantity(body.openingHours ?? '0', '接管剩餘小時'), openingExpires = date(body.openingExpires || previous?.openingExpires || `${cutoverDate.slice(0, 4)}-12-31`);
            if (openingExpires < cutoverDate || openingExpires > nextYearDate(cutoverDate)) fail('接管額度期限須自接管起日至其後一年內。');
            const openingHalfYearOnly = body.openingHalfYearOnly ?? previous?.openingHalfYearOnly ?? false;
            if (typeof openingHalfYearOnly !== 'boolean') fail('半年假接管來源標記須為布林值。');
            if (openingHalfYearOnly && (openingExpires !== `${cutoverDate.slice(0, 4)}-12-31` || (!activeAccounts.length && cmp(openingHours, mul(mul('3', entitlementFactor), dayHours)) > 0))) fail('半年假接管餘額不得超過原半年完整權利，且期限須為接管當年 12/31。');
            const manual = sql.prepare('SELECT * FROM leave_entitlements WHERE employee_id=? ORDER BY leave_type_id,year').all(person.id);
            if (!activeAccounts.length && (manual.length || cmp(openingHours, '0') > 0) && body.takeoverConfirmed !== true) fail('已有人工額度或接管餘額，請核對後確認接管，避免重複給假。');
            const why = text(body.reason, '年資核對原因'), openingSource = manual.length || cmp(openingHours, '0') > 0 ? text(body.openingSource ?? previous?.openingSource, '接管對帳依據') : String(body.openingSource ?? previous?.openingSource ?? '').trim();
            if (activeAccounts.length && (cutoverDate !== previous.cutoverDate || cmp(openingHours, previous.openingHours) !== 0 || openingExpires !== previous.openingExpires || openingSource !== previous.openingSource || openingHalfYearOnly !== (previous.openingHalfYearOnly || false))) fail('接管後不可改寫接管日期、期初餘額、期限或對帳來源；請使用獨立額度調整保存原因。', 409);
            const service = { employeeId: person.id, hireDate, leaveDate: person.leave_date || '', serviceDate, excludedPeriods, dayHours,
                employmentType, entitlementFactor, factorBasis, edgeDateConfirmed: body.edgeDateConfirmed === true, verified: true,
                cutoverDate, openingHours, openingExpires, openingSource, openingHalfYearOnly, takeoverConfirmed: activeAccounts.length ? previous.takeoverConfirmed : body.takeoverConfirmed === true,
                manualRevision: hash(manual), reason: why, verifiedAt: now(), revision: id(), effectiveFrom, reviewRequired: false, reviewIssues: [] };
            // Validate the service calendar before accepting even an unposted
            // version. In particular, exclusions must not exceed termination.
            calc.calculate(calculatorInput(person, service, { period: 'anniversary', prorationBasis: 'calendar_month', rounding: 'raw' }, Number(effectiveFrom.slice(0, 4)), today()));
            if (openingHalfYearOnly) {
                const openingTerms = activeAccounts.length ? serviceVersionAt(previous, cutoverDate) : service;
                const openingCheck = calc.calculate(calculatorInput(person, service, { period: 'calendar_year', halfYearMode: FULL_HALF_YEAR, prorationBasis: 'calendar_month', rounding: 'raw' }, Number(cutoverDate.slice(0, 4)), cutoverDate, openingTerms));
                const source = openingCheck.sourceLots.find((lot) => lot.eventKey === 'm6' && lot.status === 'acquired' && lot.acquisitionDate < cutoverDate);
                if (!source || source.acquisitionDate.slice(0, 4) !== cutoverDate.slice(0, 4)) fail('半年假接管須為接管當年、接管日前已取得的半年來源；未取得或跨年已結清的來源不可帶入。');
                if (activeAccounts.length && source.acquisitionDate !== previous.openingHalfYearSource?.acquisitionDate) fail('已接管半年來源的資格日不可改寫，請先完成專用歷史對帳。', 409);
                service.openingHalfYearSource = { eventKey: 'm6', acquisitionDate: source.acquisitionDate, statutoryDays: source.statutoryDays, statutoryHours: source.statutoryHours,
                    previouslyUsedOrSettledHours: sub(source.statutoryHours, openingHours), periodEndExclusive: source.periodEndExclusive };
            }
            const version = { ...service, id: service.revision };
            service.versions = [...oldVersions.filter((v) => v.effectiveFrom !== effectiveFrom), version];
            const issues = [];
            for (const account of activeAccounts) {
                for (const lot of lotsFor(account.id)) {
                    const terms = serviceVersionAt(service, lot.acquisitionDate);
                    const recalculated = calc.calculate(calculatorInput(person, service, { ...lot.policy, period: lot.halfYearMode === FULL_HALF_YEAR ? 'calendar_year' : 'anniversary', halfYearMode: lot.halfYearMode === FULL_HALF_YEAR ? FULL_HALF_YEAR : 'prorated' }, Number(lot.acquisitionDate.slice(0, 4)), today(), terms));
                    const expected = recalculated.sourceLots.find((candidate) => candidate.eventKey === lot.eventKey);
                    if (!expected || expected.acquisitionDate !== lot.acquisitionDate || expected.status !== 'acquired' || expected.periodEndExclusive !== lot.periodEndExclusive || cmp(expected.statutoryDays, lot.statutoryDays) !== 0 || cmp(expected.statutoryHours, lot.statutoryHours) !== 0) {
                        issues.push(`已入帳來源 ${lot.eventKey}（${lot.acquisitionDate}）的取得日、資格或完整權利將改變；須專用歷史對帳，不可回寫原批次。`);
                    }
                }
            }
            if (issues.length) {
                const blocked = { ...previous, reviewRequired: true, reviewIssues: issues, proposedRevision: version, reviewRequestedAt: now(), revision: id() };
                sql.prepare('INSERT OR REPLACE INTO employee_service_periods VALUES (?,?,?,?)').run(person.id, blocked.revision, json(blocked), now());
                entryAudit(audit, 'annual_leave_service_review', person.id, previous, blocked, `年資修訂待核對，未套用且封鎖後續給假：${why}`);
                return { service: blocked, reviewRequired: true, warnings: issues };
            }
            sql.prepare('INSERT OR REPLACE INTO employee_service_periods VALUES (?,?,?,?)').run(person.id, service.revision, json(service), now());
            entryAudit(audit, 'annual_leave_service', person.id, previous, service, `核對年資及接管基準：${why}`);
            return { service };
        })();
    }
    function compute(account) {
        const rows = sql.prepare('SELECT * FROM annual_leave_allocations WHERE account_id=? ORDER BY year,id').all(account.id);
        const closures = sql.prepare('SELECT * FROM annual_leave_year_closures WHERE account_id=? ORDER BY created_at,id').all(account.id).map((r) => ({ ...parse(r.data_json), id: r.id, allocationId: r.allocation_id, amount: parse(r.amount_json) }));
        const person = staff().find((e) => e.id === account.employeeId);
        const allocations = rows.map((r) => {
            const item = parse(r.data_json), adjustments = sql.prepare('SELECT amount_json FROM annual_leave_adjustments WHERE allocation_id=?').all(r.id).map((x) => parse(x.amount_json));
            const adjustedHours = sum(adjustments), closedHours = sum(closures.filter((c) => c.allocationId === r.id).map((c) => c.amount));
            const grantHours = add(item.hours, adjustedHours);
            return { ...item, id: r.id, lotId: r.id, accountId: account.id, sourceLotId: r.source_lot_id, employeeId: account.employeeId,
                name: person?.name || '', leaveTypeId: account.leaveTypeId, year: r.year, grantHours, adjustedHours, closedHours,
                usedHours: exact('0'), heldHours: exact('0'), availableHours: sub(grantHours, closedHours), warnings: [], canCarry: item.kind !== 'carry' && item.settlementRule !== 'year_end_wage_only' };
        });
        const warnings = [], unfunded = [], requestRows = new Map();
        const requests = sql.prepare("SELECT * FROM leave_requests WHERE employee_id=? AND leave_type_id=? AND created_at>? AND status IN ('approved','pending_supervisor','pending_admin') ORDER BY start_at,created_at,id").all(account.employeeId, account.leaveTypeId, account.employeeEpoch);
        const daily = [];
        for (const request of requests) {
            const start = taipeiDay(request.start_at), end = taipeiDay(request.end_at - 1);
            if (end < account.cutoverDate) continue;
            let charges = sql.prepare('SELECT date,units FROM leave_entitlement_charges WHERE request_id=? ORDER BY date').all(request.id);
            if (!charges.length) {
                const relevant = allocations.filter((a) => a.periodStart <= end && a.periodEndExclusive > start);
                const crosses = start < account.cutoverDate || start.slice(0, 4) !== end.slice(0, 4) || relevant.some((a) => (a.periodStart > start && a.periodStart <= end) || (a.periodEndExclusive > start && a.periodEndExclusive <= end));
                if (crosses || !(Number(request.duration_hours) > 0)) { warnings.push({ requestId: request.id, start, end, message: `舊單 ${request.id} 跨來源期間或無有效時數，請先分配每日扣抵。` }); continue; }
                charges = [{ date: start, units: Math.round(Number(request.duration_hours) * 100) }];
            }
            charges.filter((c) => c.date >= account.cutoverDate).forEach((c) => daily.push({ request, date: c.date, amount: div(String(c.units), '100') }));
        }
        daily.sort((a, b) => a.date.localeCompare(b.date) || a.request.created_at - b.request.created_at || a.request.id.localeCompare(b.request.id));
        const allocationById = new Map(allocations.map((a) => [a.id, a]));
        const previous = new Map(sql.prepare('SELECT request_id,data_json FROM annual_leave_charge_state WHERE account_id=?').all(account.id)
            .map((row) => [row.request_id, parse(row.data_json).map((item) => ({ ...item, remaining: exact(item.amount) }))]));
        const eligible = (allocation, charge) => allocation && allocation.periodStart <= charge.date && allocation.periodEndExclusive > charge.date;
        for (const charge of daily) {
            charge.remaining = exact(charge.amount); charge.status = charge.request.status === 'approved' ? 'used' : 'held'; charge.assigned = [];
        }
        const apply = (charge, allocation, limit) => {
            const amount = min(charge.remaining, min(limit, maximum('0', allocation.availableHours)));
            if (cmp(amount, '0') <= 0) return exact('0');
            allocation[`${charge.status}Hours`] = add(allocation[`${charge.status}Hours`], amount);
            allocation.availableHours = sub(allocation.availableHours, amount);
            charge.assigned.push({ allocationId: allocation.id, date: charge.date, status: charge.status, amount });
            charge.remaining = sub(charge.remaining, amount);
            return amount;
        };
        // Preserve every still-valid request/date/source mapping before any new
        // demand competes for capacity. Cancelling an earlier request therefore
        // restores its original source instead of moving later requests into it.
        // Status-only changes keep the same source; a date edit can retain the
        // prior source only when that source covers the revised date.
        for (const sameDate of [true, false]) {
            for (const charge of daily) {
                for (const old of previous.get(charge.request.id) || []) {
                    if ((old.date === charge.date) !== sameDate || !old.allocationId || cmp(old.remaining, '0') <= 0) continue;
                    const allocation = allocationById.get(old.allocationId);
                    if (!eligible(allocation, charge)) continue;
                    old.remaining = sub(old.remaining, apply(charge, allocation, old.remaining));
                    if (cmp(charge.remaining, '0') === 0) break;
                }
            }
        }
        // Only new demand or a previously unfunded remainder gets the current
        // carry-first ordering. Creating a carry does not migrate settled usage.
        for (const charge of daily) {
            const selected = allocations.filter((a) => eligible(a, charge))
                .sort((a, b) => Number(b.kind === 'carry') - Number(a.kind === 'carry') || a.periodEndExclusive.localeCompare(b.periodEndExclusive) || a.periodStart.localeCompare(b.periodStart) || a.id.localeCompare(b.id));
            for (const allocation of selected) {
                if (cmp(charge.remaining, '0') === 0) break;
                apply(charge, allocation, charge.remaining);
            }
            const requestId = charge.request.id;
            if (!requestRows.has(requestId)) requestRows.set(requestId, []);
            // Stable aggregation prevents spurious audit differences when an
            // original and newly funded portion now share the same source.
            const combined = new Map();
            for (const item of charge.assigned) combined.set(item.allocationId, add(combined.get(item.allocationId) || '0', item.amount));
            for (const [allocationId, amount] of combined) requestRows.get(requestId).push({ allocationId, date: charge.date, status: charge.status, amount });
            if (cmp(charge.remaining, '0') > 0) {
                const item = { requestId, date: charge.date, status: charge.status, amount: charge.remaining };
                unfunded.push(item); requestRows.get(requestId).push({ ...item, allocationId: null });
            }
        }
        allocations.forEach((a) => {
            a.warnings = warnings.filter((w) => w.start < a.periodEndExclusive && w.end >= a.periodStart).map((w) => w.message);
            if (cmp(a.availableHours, '0') < 0) a.warnings.push('來源已結轉／待結薪金額超過目前總額，請核對修正。');
        });
        return { account, allocations, closures, lots: lotsFor(account.id), warnings, unfunded, requestRows };
    }
    function reconcile() {
        for (const account of accounts()) {
            const snapshot = compute(account), previous = sql.prepare('SELECT * FROM annual_leave_charge_state WHERE account_id=?').all(account.id);
            const old = new Map(previous.map((r) => [r.request_id, parse(r.data_json)]));
            for (const requestId of new Set([...old.keys(), ...snapshot.requestRows.keys()])) {
                const before = old.get(requestId) || [], after = snapshot.requestRows.get(requestId) || [];
                if (hash(before) === hash(after)) continue;
                const keys = new Set([...before, ...after].map((r) => `${r.allocationId || ''}|${r.status}`));
                for (const key of keys) {
                    const [allocationId, status] = key.split('|');
                    const amount = (list) => sum(list.filter((r) => (r.allocationId || '') === allocationId && r.status === status).map((r) => r.amount));
                    const delta = sub(amount(after), amount(before));
                    if (cmp(delta, '0') !== 0) ledger(account.id, allocationId, requestId, status === 'used' ? 'usage_delta' : 'reservation_delta', { delta, before: amount(before), after: amount(after), reason: '依原請假單及每日分配同步，不改寫原單。' });
                }
                ledger(account.id, null, requestId, 'allocation_snapshot', { before, after, reason: '保存原來源扣抵映射；撤銷釋放原來源，只有新增或必要差額重新分配。' });
                sql.prepare('INSERT OR REPLACE INTO annual_leave_charge_state VALUES (?,?,?)').run(account.id, requestId, json(after));
            }
        }
    }
    function balanceRows(employeeIds, requestedYear) {
        const y = year(requestedYear), from = `${y}-01-01`, end = `${y + 1}-01-01`;
        return accounts().filter((a) => employeeIds.includes(a.employeeId) && a.cutoverDate < end).map((a) => {
            const view = compute(a), allocations = view.allocations.filter((r) => r.periodStart < end && r.periodEndExclusive > from);
            const used = sum(allocations.map((r) => r.usedHours)), held = sum(allocations.map((r) => r.heldHours));
            const overflow = view.unfunded.filter((r) => r.date >= from && r.date < end);
            const carry = sum(allocations.filter((r) => r.kind === 'carry').map((r) => r.hours));
            const grant = sum(allocations.filter((r) => r.kind !== 'carry').map((r) => sub(r.grantHours, r.adjustedHours)));
            const adjustment = sum(allocations.map((r) => r.adjustedHours)), closed = sum(allocations.map((r) => r.closedHours));
            const available = sub(sum(allocations.map((r) => r.availableHours)), sum(overflow.map((r) => r.amount)));
            const warnings = view.warnings.filter((w) => w.start < end && w.end >= from).map((w) => w.message);
            const dayHours = allocations[0]?.dayHours || a.dayHours, mixedDayHours = allocations.some((r) => cmp(r.dayHours, dayHours) !== 0);
            const grantDays = sum(allocations.filter((r) => r.kind !== 'carry').map((r) => div(r.hours, r.dayHours)));
            const availableDays = warnings.length || (mixedDayHours && overflow.length) ? null : sub(sum(allocations.map((r) => div(r.availableHours, r.dayHours))), div(sum(overflow.map((r) => r.amount)), dayHours));
            return { employee_id: a.employeeId, leave_type_id: a.leaveTypeId, year: y, mode: 'annual_ledger', accounting_start: a.cutoverDate,
                dayHours: mixedDayHours ? null : numeric(dayHours), mixedDayHours, grantDays: numeric(grantDays), grantHours: numeric(grant), carryHours: numeric(carry),
                adjustmentHours: numeric(sub(adjustment, closed)), usedHours: numeric(add(used, sum(overflow.filter((r) => r.status === 'used').map((r) => r.amount)))),
                heldHours: numeric(add(held, sum(overflow.filter((r) => r.status === 'held').map((r) => r.amount)))), availableHours: warnings.length ? null : numeric(available),
                availableDays: availableDays == null ? null : numeric(availableDays), warnings, records: [],
                exact: { grantHours: grant, carryHours: carry, adjustmentHours: adjustment, closedHours: closed, usedHours: add(used, sum(overflow.filter((r) => r.status === 'used').map((r) => r.amount))),
                    heldHours: add(held, sum(overflow.filter((r) => r.status === 'held').map((r) => r.amount))), availableHours: warnings.length ? null : available, availableDays },
                period: a.period, summaryScope: a.period === 'anniversary' ? 'overlapping_source_lifetimes' : 'calendar_year', accountId: a.id, calculationDetailsAvailable: true };
        });
    }
    function state(requestedYear) {
        const y = year(requestedYear), all = accounts().map(compute), people = staff();
        return { year: y, today: today(), revision: revision(), policies: policies().map((policy) => ({ ...policy, canRevise: policyCanRevise(policy) })), employees: people, services: services(),
            leaveTypes: sql.prepare('SELECT id,name,enabled,deducts_balance FROM leave_types ORDER BY display_order,id').all(),
            accounts: all.map((s) => ({ ...s.account, warnings: s.warnings.map((w) => w.message) })),
            balances: balanceRows(people.map((p) => p.id), y),
            lots: all.flatMap((s) => s.lots.map((l) => ({ ...l, employeeId: s.account.employeeId }))),
            allocations: all.flatMap((s) => s.allocations),
            ledger: all.flatMap((s) => sql.prepare('SELECT * FROM annual_leave_ledger WHERE account_id=? ORDER BY created_at,id').all(s.account.id).map((r) => ({ id: r.id, employeeId: s.account.employeeId, allocationId: r.allocation_id, requestId: r.request_id, action: r.action, createdAt: r.created_at, ...parse(r.data_json) }))),
            closures: all.flatMap((s) => s.closures.filter((c) => c.year === y).map((c) => ({ ...c, employeeId: s.account.employeeId }))) };
    }
    function selectedEmployees(values) {
        if (!Array.isArray(values) || !values.length || values.length > 100 || new Set(values).size !== values.length) fail('請選擇 1 至 100 位不重複員工。');
        const people = staff(); return values.map((value) => { const person = people.find((p) => p.id === value); if (!person) fail('員工名單已變更。', 409); return person; });
    }
    const serviceVersions = (service) => service.versions?.length ? service.versions : [{ ...service, id: service.revision, effectiveFrom: service.cutoverDate }];
    const serviceVersionAt = (service, acquiredAt) => serviceVersions(service).filter((version) => version.effectiveFrom <= acquiredAt).at(-1) || serviceVersions(service)[0];
    const calculatorInput = (person, service, policy, y, asOf, terms = service) => ({ employeeId: person.id, hireDate: service.hireDate,
        serviceDate: service.serviceDate, excludedPeriods: service.excludedPeriods.map(({ start, end }) => ({ start, end })), year: y, asOf,
        period: policy.period, prorationBasis: policy.prorationBasis, rounding: policy.rounding, halfYearMode: policy.halfYearMode || 'prorated', dayHours: terms.dayHours,
        leaveDate: person.leave_date || undefined, edgeDateConfirmed: service.edgeDateConfirmed,
        employmentType: terms.employmentType, entitlementFactor: terms.entitlementFactor, factorBasis: terms.factorBasis });
    function calculateServiceVersions(person, service, policy, y, asOf) {
        // The latest verified service calendar determines milestones. Working
        // hours/type/factor come from the immutable version effective when the
        // right was acquired; choosing a later preview never rewrites them.
        const cache = new Map(), calculateVersion = (version) => {
            if (!cache.has(version.id)) cache.set(version.id, calc.calculate(calculatorInput(person, service, policy, y, asOf, version)));
            return cache.get(version.id);
        };
        const result = calculateVersion(serviceVersions(service)[0]);
        const selections = result.sourceLots.map((source) => {
            const version = serviceVersionAt(service, source.acquisitionDate), calculated = calculateVersion(version);
            return { version, source: calculated.sourceLots.find((lot) => lot.eventKey === source.eventKey), segment: calculated.segments.find((segment) => segment.eventKey === source.eventKey) };
        });
        const sourceLots = selections.map(({ source, version }) => ({ ...source, dayHours: exact(version.dayHours), serviceVersionId: version.id, serviceEffectiveFrom: version.effectiveFrom,
            steps: [...source.steps, { code: 'SERVICE_VERSION', serviceVersionId: version.id, effectiveFrom: version.effectiveFrom, dayHours: exact(version.dayHours), message: '工時與工作型態按資格取得日適用版本；舊權利批次不隨之回寫。' }] }));
        const segments = selections.map(({ segment, version }) => ({ ...segment, dayHours: exact(version.dayHours), serviceVersionId: version.id }));
        const eligible = segments.filter((s) => s.status !== 'ineligible_after_leave'), acquired = segments.filter((s) => s.status === 'acquired'), projected = segments.filter((s) => s.status === 'projected');
        const sourceAcquired = sourceLots.filter((lot) => lot.status === 'acquired'), sourceInYear = sourceAcquired.filter((lot) => lot.acquisitionDate.startsWith(`${y}-`));
        const totals = (items) => {
            const rawDays = sum(items.map((s) => s.rawDays)), rawHours = sum(items.map((s) => s.rawHours));
            const grantedDays = policy.rounding === 'ceil_1_decimal' ? exact(calc.ceil1(rawDays)) : rawDays, differenceDays = sub(grantedDays, rawDays);
            const normalHours = items[0]?.dayHours || service.dayHours, mixedDayHours = items.some((s) => cmp(s.dayHours, normalHours) !== 0);
            const differenceHours = mixedDayHours && cmp(differenceDays, '0') !== 0 ? null : mul(differenceDays, normalHours);
            return { rawDays, rawHours, grantedDays, differenceDays, differenceHours, grantedHours: differenceHours ? add(rawHours, differenceHours) : null, mixedDayHours };
        };
        const all = totals(eligible), earned = totals(acquired), forecast = totals(projected);
        const warnings = [...new Map([...cache.values()].flatMap((c) => c.warnings).map((warning) => [warning.code, warning])).values()];
        if (all.mixedDayHours) warnings.push({ code: 'MIXED_SERVICE_DAY_HOURS', message: '本年度來源含不同正常工時；原值按來源保留，同年度新給假與進位須先完成專用制度對帳，不以單一工時回算。', blocking: false });
        return { ...result, sourceLots, segments, warnings, manualConfirmationRequired: warnings.some((w) => w.blocking),
            statutory: { ...result.statutory, acquiredInYearDays: sum(sourceInYear.map((lot) => lot.statutoryDays)), acquiredSourceDays: sum(sourceAcquired.map((lot) => lot.statutoryDays)), acquiredSourceHours: sum(sourceAcquired.map((lot) => lot.statutoryHours)) },
            annual: { ...result.annual, rawDays: all.rawDays, rawHours: all.rawHours, grantedDays: all.grantedDays, grantedHours: all.grantedHours, roundingDifferenceDays: all.differenceDays, roundingDifferenceHours: all.differenceHours,
                acquiredRawDays: earned.rawDays, acquiredRawHours: earned.rawHours, acquiredGrantedDays: earned.grantedDays, acquiredGrantedHours: earned.grantedHours, acquiredRoundingDifferenceDays: earned.differenceDays,
                projectedRawDays: forecast.rawDays, projectedRawHours: forecast.rawHours, eligibleSourceDays: sum(sourceAcquired.map((lot) => lot.statutoryDays)), includesProjected: projected.length > 0, mixedDayHours: all.mixedDayHours },
            steps: result.steps.filter((step) => !['SUM_BEFORE_ROUNDING', 'EXACT_HOURS'].includes(step.code)).concat([
                { code: 'SUM_BEFORE_ROUNDING', rawDays: all.rawDays, rounding: policy.rounding, grantedDays: all.grantedDays, differenceDays: all.differenceDays, message: '按各來源適用的版本加總原始日數後進位一次。' },
                { code: 'SERVICE_VERSION_HOURS', message: '來源日數乘取得日適用正常工時；跨版本不得用最新工時覆寫過往權利。', mixedDayHours: all.mixedDayHours }
            ]) };
    }
    function prepareGrant(body) {
        checkRevision(body);
        const y = year(body.year), asOf = date(body.asOf), why = text(body.reason, '給假原因');
        const policy = policies().find((p) => p.id === body.policyId);
        if (!policy) fail('請選擇已建立的特休制度。');
        const type = sql.prepare('SELECT enabled,deducts_balance FROM leave_types WHERE id=?').get(policy.leaveTypeId);
        if (!type?.enabled || !type.deducts_balance) fail('制度對應的假別已停用或不再扣額度，請先核對假別設定。');
        const nextPolicy = policies().find((p) => p.leaveTypeId === policy.leaveTypeId && p.effectiveFrom > policy.effectiveFrom);
        const plans = [], rows = selectedEmployees(body.employeeIds).map((person) => {
            const service = services().find((s) => s.employeeId === person.id), oldAccount = accounts().find((a) => a.employeeId === person.id && a.leaveTypeId === policy.leaveTypeId);
            const row = { employeeId: person.id, name: person.name, status: 'blocked', warnings: [] };
            if (!service) { row.warnings.push('尚未核對年資與接管基準。'); return row; }
            if (service.reviewRequired) { row.warnings.push('年資修訂仍待歷史對帳，後續給假已封鎖。', ...(service.reviewIssues || [])); return row; }
            if (person.hire_date !== service.hireDate || (person.leave_date || '') !== (service.leaveDate || '')) { row.warnings.push('名冊到職日或離職日已變更，請先重新核對年資版本，不能沿用未核對資料繼續給假。'); return row; }
            const manual = sql.prepare('SELECT * FROM leave_entitlements WHERE employee_id=? ORDER BY leave_type_id,year').all(person.id);
            if (!oldAccount && service.manualRevision !== hash(manual)) { row.warnings.push('人工額度已變更，請重新核對接管餘額。'); return row; }
            if (oldAccount && oldAccount.period !== policy.period) { row.warnings.push('既有權利帳的週年／曆年期間不可直接切換，請先完成來源結算。'); return row; }
            let calculation;
            try { calculation = calculateServiceVersions(person, service, policy, y, asOf); }
            catch (error) { row.warnings.push(error.message); return row; }
            row.calculation = calculation;
            row.steps = calculation.steps; row.rawDays = calculation.annual.acquiredRawDays; row.roundedDays = calculation.annual.acquiredGrantedDays;
            row.differenceDays = calculation.annual.acquiredRoundingDifferenceDays;
            row.warnings.push(...calculation.warnings.map((w) => w.message || String(w)));
            if (calculation.manualConfirmationRequired || calculation.warnings.some((w) => w.blocking)) return row;
            if (service.cutoverDate > asOf) { row.warnings.push('接管起日尚未到達試算基準日。'); return row; }
            if (!oldAccount && service.openingHalfYearOnly && policy.halfYearMode !== FULL_HALF_YEAR) { row.warnings.push('半年假年底結清的接管來源須使用對應的半年整筆制度。'); return row; }
            if (!oldAccount && !service.openingHalfYearOnly && cmp(service.openingHours, '0') > 0 && policy.halfYearMode === FULL_HALF_YEAR) {
                const atCutover = calculateServiceVersions(person, service, policy, Number(service.cutoverDate.slice(0, 4)), service.cutoverDate);
                if (atCutover.sourceLots.some((lot) => lot.eventKey === 'm6' && lot.status === 'acquired' && lot.acquisitionDate < service.cutoverDate)) {
                    row.warnings.push('期初可能混合半年與滿一年來源，請先拆清；本版尚不支援混合來源直接接管。若核對後僅含半年假，請標記「接管餘額僅含半年假」，保留年底結清限制。'); return row;
                }
            }
            const accountId = oldAccount?.id || `new:${person.id}:${policy.leaveTypeId}`;
            const existing = oldAccount ? lotsFor(oldAccount.id) : [], allAllocations = oldAccount ? compute(oldAccount).allocations : [];
            const newLots = calculation.sourceLots.filter((l) => l.status === 'acquired' && l.acquisitionDate >= service.cutoverDate && l.acquisitionDate >= policy.effectiveFrom && (!nextPolicy || l.acquisitionDate < nextPolicy.effectiveFrom) && !existing.some((e) => e.eventKey === l.eventKey));
            const lotPlans = newLots.map((source) => {
                const allocations = [];
                if (policy.period === 'anniversary') allocations.push({ year: Number(source.acquisitionDate.slice(0, 4)), periodStart: source.acquisitionDate, periodEndExclusive: source.periodEndExclusive, hours: source.statutoryHours, rawDays: source.statutoryDays, dayHours: source.dayHours, serviceVersionId: source.serviceVersionId });
                else {
                    for (let sliceYear = Number(source.periodStart.slice(0, 4)); sliceYear <= Number(source.periodEndExclusive.slice(0, 4)); sliceYear++) {
                        const part = calc.partitionLot(source, { year: sliceYear, prorationBasis: policy.prorationBasis });
                        if (part && cmp(part.rawDays, '0') > 0) allocations.push({ year: sliceYear,
                            periodStart: source.acquisitionDate > `${sliceYear}-01-01` ? source.acquisitionDate : `${sliceYear}-01-01`, periodEndExclusive: `${sliceYear + 1}-01-01`,
                            sourceIntersectionStart: part.start, sourceIntersectionEndExclusive: part.endExclusive,
                            rawDays: part.rawDays, hours: mul(part.rawDays, source.dayHours), dayHours: source.dayHours, serviceVersionId: source.serviceVersionId });
                    }
                }
                return { source, allocations };
            });
            const plannedAllocations = lotPlans.flatMap((l) => l.allocations);
            const rounding = [];
            for (const targetYear of new Set(plannedAllocations.map((a) => a.year))) {
                const previous = allAllocations.filter((a) => a.year === targetYear && a.kind === 'grant'), planned = plannedAllocations.filter((a) => a.year === targetYear);
                const yearDayHours = previous[0]?.dayHours || planned[0].dayHours;
                if (previous.some((a) => a.rounding !== policy.rounding) || [...previous, ...planned].some((a) => cmp(a.dayHours, yearDayHours) !== 0)) { row.warnings.push('同一配置年度的精度與正常工時不可混用，請完成專用政策對帳後再給假；版本變更不會回寫舊權利。'); return row; }
                const rawHours = sum([...previous.map((a) => a.hours), ...planned.map((a) => a.hours)]);
                const rawDays = div(rawHours, yearDayHours), roundedDays = policy.rounding === 'ceil_1_decimal' ? exact(calc.ceil1(rawDays)) : rawDays;
                const wanted = mul(sub(roundedDays, rawDays), yearDayHours), previousRounding = allAllocations.filter((a) => a.year === targetYear && a.kind === 'rounding');
                const posted = add(sum(previousRounding.map((a) => a.hours)), sum(allAllocations.filter((a) => a.year === targetYear).flatMap((a) => sql.prepare('SELECT amount_json,data_json FROM annual_leave_adjustments WHERE allocation_id=?').all(a.id).filter((r) => parse(r.data_json).kind === 'rounding_delta').map((r) => parse(r.amount_json)))));
                const difference = sub(wanted, posted);
                if (cmp(difference, '0') < 0 && previousRounding.some((a) => cmp(a.closedHours, '0') > 0)) { row.warnings.push('該年度進位加給已結算，請先核對新增來源與已結算差額。'); return row; }
                // A rounding bonus involving a cash-only half-year source must
                // not become a back door for carrying that source. It is a
                // company rounding bonus, distinct from the y1+ legal right.
                const halfYearBonus = previous.some((a) => a.settlementRule === 'year_end_wage_only') || lotPlans.some((lp) => lp.source.settlementRule === 'year_end_wage_only' && lp.allocations.some((a) => a.year === targetYear));
                if (cmp(difference, '0') !== 0) rounding.push({ year: targetYear, difference, rawDays, roundedDays, dayHours: yearDayHours,
                    ...(halfYearBonus ? { settlementRule: 'year_end_wage_only' } : {}) });
            }
            const opening = !oldAccount && cmp(service.openingHours, '0') > 0;
            const deltaHours = add(sum(plannedAllocations.map((a) => a.hours)), sum(rounding.map((r) => r.difference)));
            row.lots = newLots; row.allocations = plannedAllocations;
            row.totalPostedHours = add(deltaHours, opening ? service.openingHours : '0');
            row.grantHours = add(add(sum(plannedAllocations.filter((a) => a.year === y).map((a) => a.hours)), sum(rounding.filter((r) => r.year === y).map((r) => r.difference))), opening && Number(service.cutoverDate.slice(0, 4)) === y ? service.openingHours : '0');
            row.futureAllocationHours = sub(row.totalPostedHours, row.grantHours);
            row.alreadyGrantedHours = sum(allAllocations.filter((a) => a.year === y).map((a) => a.grantHours)); row.deltaHours = row.grantHours;
            row.status = newLots.length || opening || !oldAccount ? 'ready' : 'unchanged';
            if (calculation.sourceLots.some((l) => l.status === 'projected')) row.warnings.push('未到資格日的部分只列預估，不列入本次給假。');
            if (calculation.sourceLots.some((l) => l.acquisitionDate < service.cutoverDate)) row.warnings.push('接管前已取得來源不重複發給，請依已核對的接管剩餘額度追溯。');
            plans.push({ person, service, policy, accountId, oldAccount, lotPlans, rounding, opening, calculation });
            return row;
        });
        return { kind: 'grant', year: y, asOf, reason: why, rows, plans, blocked: rows.some((r) => r.status === 'blocked') };
    }
    function prepareClose(body) {
        checkRevision(body);
        const y = year(body.year), asOf = date(body.asOf), why = text(body.reason, '結算原因');
        if (!['year_end', 'termination'].includes(body.closureType || 'year_end')) fail('結算類型不正確。');
        if (!Array.isArray(body.rows) || !body.rows.length || body.rows.length > 100 || new Set(body.rows.map((r) => r.allocationId)).size !== body.rows.length) fail('請選擇 1 至 100 筆不重複來源額度。');
        const snapshots = accounts().map(compute), plans = [], rows = body.rows.map((input) => {
            const view = snapshots.find((s) => s.allocations.some((a) => a.id === input.allocationId)), allocation = view?.allocations.find((a) => a.id === input.allocationId);
            if (!allocation) fail('來源額度已不存在。', 409);
            const person = staff().find((p) => p.id === view.account.employeeId), warning = [...allocation.warnings];
            const service = services().find((s) => s.employeeId === view.account.employeeId);
            if (!service || service.reviewRequired) warning.push('年資來源仍待歷史對帳，請先完成核對再結算。');
            else if (person?.hire_date !== service.hireDate || (person?.leave_date || '') !== (service.leaveDate || '')) warning.push('名冊到職日或離職日尚未完成年資版本核對，不能結算。');
            if (!['carry', 'wage'].includes(input.mode)) fail('請選擇協商遞延或待結算工資。');
            const termination = body.closureType === 'termination';
            if (!termination && allocation.year !== y) fail('結算年度須與所選來源的記帳年度一致。');
            if (termination && y !== Number(asOf.slice(0, 4))) fail('離職結算年度須與結算基準日年度一致。');
            const sourceLot = allocation.sourceLotId ? view.lots.find((l) => l.id === allocation.sourceLotId) : null;
            if (sourceLot && sourceLot.acquisitionDate > asOf) warning.push('結算基準日尚未取得此來源權利。');
            if (allocation.kind === 'carry' && allocation.periodStart > asOf) warning.push('此遞延批次尚未生效，請先核對原結算流程。');
            if (termination ? !person?.leave_date || asOf < person.leave_date : asOf < allocation.periodEndExclusive) warning.push(termination ? '尚未確認離職日或尚未到離職日。' : '來源期間尚未結束，不能提前結算。');
            if (termination && input.mode === 'carry') warning.push('契約終止不能以遞延取代未休工資結算。');
            if (person?.leave_date && person.leave_date <= asOf && input.mode === 'carry') warning.push('員工已離職，不論結算情境皆不可再遞延；請核對全部已取得來源並列待結算工資。');
            if (cmp(allocation.heldHours, '0') > 0) warning.push('此來源尚有待審預占，請先結案。');
            if (view.unfunded.some((u) => u.date >= allocation.periodStart && u.date < allocation.periodEndExclusive)) warning.push('來源期間存在尚未覆蓋的請假時數，請先核對。');
            if (cmp(allocation.availableHours, '0') <= 0) warning.push('來源沒有可結算的正數餘額。');
            if (input.mode === 'carry' && !allocation.canCarry) warning.push(allocation.settlementRule === 'year_end_wage_only' ? '半年整筆來源須於年底列待結算工資，不能遞延至次年。' : '已遞延的來源不能再次遞延，請列待結算工資。');
            let agreementDate = '', evidence = '';
            if (input.mode === 'carry') {
                agreementDate = date(input.agreementDate); evidence = text(input.evidence, '員工協商同意依據');
                if (agreementDate > asOf) warning.push('協商同意日期不能晚於結算基準日。');
            }
            const plan = { accountId: view.account.id, allocationId: allocation.id, employeeId: view.account.employeeId, amount: allocation.availableHours,
                year: y, mode: input.mode, agreementDate, evidence, sourceYear: allocation.sourceYear ?? allocation.year, sourceKind: allocation.kind,
                dayHours: allocation.dayHours, periodStart: allocation.periodEndExclusive, periodEndExclusive: nextYearDate(allocation.periodEndExclusive),
                originalPeriodStart: allocation.periodStart, originalPeriodEndExclusive: allocation.periodEndExclusive, reason: why, closureType: body.closureType || 'year_end' };
            plans.push(plan);
            return { ...plan, name: person?.name || '', status: warning.length ? 'blocked' : 'ready', warnings: warning,
                amountHours: allocation.availableHours, amountDays: div(allocation.availableHours, allocation.dayHours), wageStatus: input.mode === 'wage' ? 'wage_pending' : null };
        });
        if (body.closureType === 'termination') {
            const selected = new Set(body.rows.map((row) => row.allocationId));
            for (const view of snapshots.filter((s) => plans.some((p) => p.accountId === s.account.id))) {
                const missing = view.allocations.filter((a) => !selected.has(a.id) && (cmp(a.availableHours, '0') > 0 || cmp(a.heldHours, '0') > 0)
                    && (a.sourceLotId ? view.lots.find((l) => l.id === a.sourceLotId)?.acquisitionDate <= asOf : a.periodStart <= asOf));
                if (missing.length) rows.filter((r) => r.accountId === view.account.id).forEach((row) => {
                    row.status = 'blocked'; row.warnings.push(`離職結算尚有 ${missing.length} 筆已取得來源未納入（含後續年度配置或待審預占），請完整核對後再預覽。`);
                });
            }
        }
        return { kind: 'close', year: y, asOf, reason: why, plans, rows, blocked: rows.some((r) => r.status === 'blocked') };
    }
    function prepareCorrection(body) {
        checkRevision(body); const why = text(body.reason, '調整原因'), amount = quantity(body.quantity, '調整小時', true);
        if (cmp(amount, '0') === 0) fail('調整小時不可為零。');
        const view = accounts().map(compute).find((s) => s.allocations.some((a) => a.id === body.allocationId));
        const allocation = view?.allocations.find((a) => a.id === body.allocationId);
        if (!allocation) fail('找不到可調整的來源額度。', 404);
        if (cmp(add(allocation.availableHours, amount), '0') < 0) fail('負調整不可超過尚未使用、預占或結轉的可用餘額。');
        if (allocation.warnings.length) fail('來源有待確認扣抵，請先完成每日分配。', 409);
        return { kind: 'correction', year: allocation.year, reason: why, blocked: false,
            plans: [{ accountId: view.account.id, allocationId: allocation.id, amount, reason: why }],
            rows: [{ employeeId: allocation.employeeId, name: allocation.name, allocationId: allocation.id, beforeHours: allocation.availableHours, deltaHours: amount, afterHours: add(allocation.availableHours, amount), status: 'ready', warnings: [] }] };
    }
    const preparers = { grant: prepareGrant, close: prepareClose, correction: prepareCorrection };
    function preview(kind, body, context = {}) {
        const plan = preparers[kind](body), currentRevision = revision(), previewId = id();
        const digest = hash({ kind, body, revision: currentRevision, rows: plan.rows });
        for (const [key, item] of previews) if (item.expiresAt < now()) previews.delete(key);
        if (previews.size >= 200) previews.delete(previews.keys().next().value);
        const owner = `${context.actorId || ''}/${context.sessionKey || ''}`;
        previews.set(previewId, { kind, body: parse(json(body)), digest, revision: currentRevision, owner, expiresAt: now() + 30 * 60000 });
        return { previewId, digest, revision: currentRevision, kind, year: plan.year, asOf: plan.asOf, rows: plan.rows, blocked: plan.blocked, expiresAt: now() + 30 * 60000 };
    }
    function addAllocation(accountId, sourceLotId, y, data, batchId) {
        const allocationId = id();
        sql.prepare('INSERT INTO annual_leave_allocations VALUES (?,?,?,?,?,?)').run(allocationId, accountId, sourceLotId || null, y, json(data), now());
        ledger(accountId, allocationId, null, data.kind === 'carry' ? 'carry_in' : 'grant', { amount: data.hours, batchId, sourceLotId, ...data });
        return allocationId;
    }
    function postGrant(plan, batchId) {
        let added = 0;
        for (const p of plan.plans) {
            const accountId = p.oldAccount?.id || id();
            if (!p.oldAccount) {
                const openingTerms = serviceVersionAt(p.service, p.service.cutoverDate);
                const account = { employeeId: p.person.id, leaveTypeId: p.policy.leaveTypeId, dayHours: openingTerms.dayHours, period: p.policy.period,
                    cutoverDate: p.service.cutoverDate, employeeEpoch: employeeEpoch(p.person.id), serviceSnapshot: p.service,
                    legacySnapshot: legacyRows(p.person.id, p.policy.leaveTypeId), createdAt: now() };
                sql.prepare('INSERT INTO annual_leave_accounts VALUES (?,?,?,?,?,?)').run(accountId, p.person.id, p.policy.leaveTypeId, 1, json(account), now());
                if (p.opening) addAllocation(accountId, null, Number(p.service.cutoverDate.slice(0, 4)), { kind: 'opening', hours: p.service.openingHours,
                    dayHours: openingTerms.dayHours, serviceVersionId: openingTerms.id, periodStart: p.service.cutoverDate, periodEndExclusive: plusDay(p.service.openingExpires),
                    sourceYear: Number(p.service.cutoverDate.slice(0, 4)), reason: '人工對帳接管的剩餘額度', policyId: p.policy.id,
                    ...(p.service.openingHalfYearOnly ? { openingHalfYearOnly: true, eventKey: 'm6', halfYearMode: FULL_HALF_YEAR, settlementRule: 'year_end_wage_only', openingHalfYearSource: p.service.openingHalfYearSource } : {}) }, batchId);
            }
            for (const lp of p.lotPlans) {
                const lotId = id(), data = { ...lp.source, policyId: p.policy.id, policy: p.policy, calculation: p.calculation, reason: plan.reason, notifiedAt: now() };
                sql.prepare('INSERT INTO annual_leave_grant_lots VALUES (?,?,?,?,?)').run(lotId, accountId, lp.source.eventKey, json(data), now());
                for (const a of lp.allocations) addAllocation(accountId, lotId, a.year, { ...a, kind: 'grant', dayHours: a.dayHours, serviceVersionId: lp.source.serviceVersionId,
                    sourceYear: Number(lp.source.acquisitionDate.slice(0, 4)), rounding: p.policy.rounding, policyId: p.policy.id, eventKey: lp.source.eventKey,
                    ...(lp.source.settlementRule ? { settlementRule: lp.source.settlementRule, halfYearMode: lp.source.halfYearMode } : {}) }, batchId);
                added++;
            }
            for (const rounding of p.rounding) {
                const allocations = compute({ id: accountId, employeeId: p.person.id, leaveTypeId: p.policy.leaveTypeId, ...p.oldAccount,
                    employeeEpoch: p.oldAccount?.employeeEpoch ?? employeeEpoch(p.person.id), cutoverDate: p.service.cutoverDate }).allocations.filter((a) => a.year === rounding.year);
                const existing = allocations.find((a) => a.kind === 'rounding');
                const adjust = (allocation, amount) => {
                    sql.prepare('INSERT INTO annual_leave_adjustments VALUES (?,?,?,?,?)').run(id(), allocation.id, json(amount), json({ kind: 'rounding_delta', reason: '新增來源後重新加總，年度只進位一次；保留已使用、預占及已結算來源', batchId, ...rounding }), now());
                    ledger(accountId, allocation.id, null, 'rounding_delta', { amount, batchId, ...rounding });
                };
                if (cmp(rounding.difference, '0') < 0) {
                    let remaining = sub('0', rounding.difference);
                    // A later milestone must never remove the source backing an
                    // earlier approved request. Reclaim only unused capacity,
                    // preferring the old bonus, then the newest grant sources.
                    const candidates = allocations.filter((a) => ['rounding', 'grant'].includes(a.kind))
                        .sort((a, b) => Number(b.kind === 'rounding') - Number(a.kind === 'rounding') || b.periodStart.localeCompare(a.periodStart) || a.id.localeCompare(b.id));
                    for (const allocation of candidates) {
                        const amount = min(remaining, maximum('0', allocation.availableHours));
                        if (cmp(amount, '0') > 0) { adjust(allocation, sub('0', amount)); remaining = sub(remaining, amount); }
                        if (cmp(remaining, '0') === 0) break;
                    }
                    if (cmp(remaining, '0') > 0) fail('年度進位差額已被使用、預占或結算，請先核對來源，整批未寫入。', 409);
                } else if (existing) adjust(existing, rounding.difference);
                else addAllocation(accountId, null, rounding.year, { kind: 'rounding', hours: rounding.difference, dayHours: rounding.dayHours,
                    periodStart: `${rounding.year}-01-01`, periodEndExclusive: `${rounding.year + 1}-01-01`, sourceYear: rounding.year,
                    rounding: p.policy.rounding, policyId: p.policy.id, calculation: rounding,
                    ...(rounding.settlementRule ? { settlementRule: rounding.settlementRule } : {}) }, batchId);
            }
        }
        return { updatedCount: plan.plans.length, addedLots: added };
    }
    function confirm(kind, body, audit, context = {}) {
        return sql.transaction(() => {
            if (body.confirm !== true) fail('請確認預覽內容及影響範圍。');
            const why = text(body.reason, '確認原因'), key = text(body.idempotencyKey, '請求識別碼', 120), actor = String(context.actorId || audit({}).actor_id || '');
            const requestHash = hash({ kind, previewId: body.previewId, digest: body.digest, revision: body.revision, reason: why });
            const prior = sql.prepare('SELECT * FROM annual_leave_batches WHERE actor_id=? AND idempotency_key=?').get(actor, key);
            if (prior) { if (prior.request_hash !== requestHash) fail('同一請求識別碼不可重用於其他內容。', 409); return { ...parse(prior.result_json), replayed: true }; }
            const saved = previews.get(body.previewId), owner = `${context.actorId || ''}/${context.sessionKey || ''}`;
            if (!saved || saved.expiresAt < now() || saved.owner !== owner || saved.kind !== kind || saved.digest !== body.digest || saved.revision !== body.revision) fail('預覽已過期或不屬於目前身份，請重新預覽。', 409);
            checkRevision(saved.body);
            const plan = preparers[kind](saved.body);
            if (hash({ kind, body: saved.body, revision: revision(), rows: plan.rows }) !== saved.digest) fail('計算內容已變更，請重新預覽。', 409);
            if (plan.blocked) fail('預覽仍有待確認項目，整批未寫入。', 409);
            if (plan.asOf && plan.asOf > today()) fail('未來日期可供試算，但尚不能確認入帳或結算。');
            const batchId = id(); let result;
            if (kind === 'grant') result = postGrant(plan, batchId);
            if (kind === 'close') {
                for (const p of plan.plans) {
                    const closureId = id(), data = { ...p, batchId, status: p.mode === 'wage' ? 'wage_pending' : 'carried', calculatedAt: now(), sourceWageBasis: '待薪資人員核對原年度正常工資；不是已付款。' };
                    sql.prepare('INSERT INTO annual_leave_year_closures VALUES (?,?,?,?,?,?)').run(closureId, p.accountId, p.allocationId, json(p.amount), json(data), now());
                    ledger(p.accountId, p.allocationId, null, p.mode === 'carry' ? 'carry_out' : 'wage_pending', { amount: p.amount, batchId, closureId });
                    if (p.mode === 'carry') addAllocation(p.accountId, null, Number(p.periodStart.slice(0, 4)), { kind: 'carry', hours: p.amount, dayHours: p.dayHours,
                        periodStart: p.periodStart, periodEndExclusive: p.periodEndExclusive, sourceYear: p.sourceYear, sourceAllocationId: p.allocationId, closureId }, batchId);
                }
                result = { updatedCount: plan.plans.length, carriedCount: plan.plans.filter((p) => p.mode === 'carry').length, wagePendingCount: plan.plans.filter((p) => p.mode === 'wage').length };
            }
            if (kind === 'correction') {
                for (const p of plan.plans) {
                    sql.prepare('INSERT INTO annual_leave_adjustments VALUES (?,?,?,?,?)').run(id(), p.allocationId, json(p.amount), json({ reason: why, batchId }), now());
                    ledger(p.accountId, p.allocationId, null, 'correction', { amount: p.amount, reason: why, batchId });
                }
                result = { updatedCount: plan.plans.length };
            }
            reconcile();
            entryAudit(audit, `annual_leave_${kind}`, batchId, null, { rows: plan.rows, batchId, reason: why }, `特休${kind === 'grant' ? '給假' : kind === 'close' ? '結算' : '調整'}：${why}`);
            result = { ...result, batchId, replayed: false };
            sql.prepare('INSERT INTO annual_leave_batches VALUES (?,?,?,?,?,?)').run(batchId, actor, key, requestHash, json(result), now());
            return result;
        })();
    }
    function employeeView(employeeIds, requestedYear) {
        const y = year(requestedYear), people = staff();
        const employees = accounts().filter((a) => employeeIds.includes(a.employeeId)).map((a) => {
            const s = compute(a), from = `${y}-01-01`, end = `${y + 1}-01-01`;
            const allocations = s.allocations.filter((r) => r.periodStart < end && r.periodEndExclusive > from);
            const included = new Set(allocations.map((r) => r.id)), sourceIds = new Set(allocations.map((r) => r.sourceLotId).filter(Boolean));
            return { employeeId: a.employeeId, name: people.find((p) => p.id === a.employeeId)?.name || '', leaveTypeId: a.leaveTypeId,
                balances: balanceRows([a.employeeId], y).filter((b) => b.leave_type_id === a.leaveTypeId), allocations,
                lots: s.lots.filter((l) => sourceIds.has(l.id)).map(({ reason, policy, ...l }) => calculationForEmployee({ ...l, policy: { name: policy.name, period: policy.period, rounding: policy.rounding, prorationBasis: policy.prorationBasis, halfYearMode: policy.halfYearMode || 'prorated' } })),
                closures: s.closures.filter((c) => included.has(c.allocationId)).map(({ evidence, agreementDate, reason, ...c }) => c),
                ledger: sql.prepare('SELECT * FROM annual_leave_ledger WHERE account_id=? ORDER BY created_at,id').all(a.id).filter((r) => included.has(r.allocation_id)).map((r) => ({ id: r.id, allocationId: r.allocation_id, requestId: r.request_id, action: r.action, createdAt: r.created_at, amount: parse(r.data_json).amount || parse(r.data_json).delta })),
                warnings: s.warnings.filter((w) => w.start < end && w.end >= from).map((w) => w.message) };
        });
        return { year: y, employees };
    }
    function removeEmployees(ids) {
        for (const employeeId of ids) {
            sql.prepare('UPDATE annual_leave_accounts SET active=0 WHERE employee_id=? AND active=1').run(employeeId);
            sql.prepare('DELETE FROM employee_service_periods WHERE employee_id=?').run(employeeId);
        }
    }
    return { state, revision, today, policies, savePolicy, reviseUnusedPolicy, saveService, employeeView, balances: balanceRows, reconcile, removeEmployees,
        isManaged: (employeeId, typeId, requestedYear) => accounts().some((a) => a.employeeId === employeeId && a.leaveTypeId === typeId && a.cutoverDate < `${Number(requestedYear) + 1}-01-01`),
        grantPreview: (body, ctx) => preview('grant', body, ctx), grantConfirm: (body, audit, ctx) => confirm('grant', body, audit, ctx),
        closePreview: (body, ctx) => preview('close', body, ctx), closeConfirm: (body, audit, ctx) => confirm('close', body, audit, ctx),
        correctionPreview: (body, ctx) => preview('correction', body, ctx), correctionConfirm: (body, audit, ctx) => confirm('correction', body, audit, ctx) };
}
module.exports = { createAnnualLeaveStore };
