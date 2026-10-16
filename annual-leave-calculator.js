'use strict';

// Pure, date-only annual-leave projection. No database writes, payroll, or rounding
// of existing leave usage belongs here. Fractions, not decimal display strings,
// are the storage/arithmetical contract. See LAW_SOURCES and dateRules in results.
const CALCULATOR_VERSION = 'tw-annual-leave-1';
const DAY = 86400000;
const LAW_SOURCES = Object.freeze([
    { title: '勞動基準法第 38 條', url: 'https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=N0030001&flno=38' },
    { title: '勞動基準法施行細則第 24 條', url: 'https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=N0030002&flno=24' },
    { title: '勞動基準法施行細則第 24-1 條', url: 'https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=N0030002&flno=24-1' },
    { title: '勞動部：曆年制與離職核算', url: 'https://www.mol.gov.tw/1607/28690/2282/2284/2292/81173/' },
    { title: '勞動部：半年與一年權利、留停及離職畸零年資', url: 'https://www.mol.gov.tw/1607/28690/2282/2284/2292/81182/' },
    { title: '勞動部：部分工時特別休假', url: 'https://www.mol.gov.tw/1607/28690/2282/2284/2292/81202/' }
]);
function invalid(message, field = '') {
    throw Object.assign(new Error(message), { code: 'ANNUAL_LEAVE_INVALID_INPUT', statusCode: 400, field });
}
function gcd(a, b) { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a || 1n; }
function fraction(numerator, denominator = 1n) {
    let n = BigInt(numerator), d = BigInt(denominator);
    if (!d) invalid('分母不得為零。', 'denominator');
    if (d < 0n) { n = -n; d = -d; }
    const factor = gcd(n, d);
    return { n: n / factor, d: d / factor };
}
function parse(value) {
    if (value && typeof value === 'object') {
        if (typeof value.n === 'bigint' && typeof value.d === 'bigint') return fraction(value.n, value.d);
        const n = value.numerator, d = value.denominator;
        if (typeof n !== 'string' || typeof d !== 'string' || !/^-?\d{1,500}$/.test(n) || !/^\d{1,500}$/.test(d)) invalid('精確數值需提供整數字串 numerator／denominator。');
        return fraction(n, d);
    }
    if (typeof value === 'bigint') return fraction(value);
    if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)) invalid('數值超過安全輸入範圍，請傳十進位字串。');
    if (typeof value !== 'number' && typeof value !== 'string') invalid('數值必須為十進位字串或精確分數。');
    const text = String(value), ratio = text.match(/^(-?\d{1,500})\/(-?\d{1,500})$/);
    if (ratio) return fraction(ratio[1], ratio[2]);
    const match = text.match(/^(-?)(\d{1,200})(?:\.(\d{1,30}))?$/);
    if (!match) invalid('數值格式不正確；請使用一般十進位字串，不使用指數或已截斷顯示值。');
    return fraction(BigInt((match[1] || '') + match[2] + (match[3] || '')), 10n ** BigInt((match[3] || '').length));
}
const add = (a, b) => { a = parse(a); b = parse(b); return fraction(a.n * b.d + b.n * a.d, a.d * b.d); };
const subtract = (a, b) => { a = parse(a); b = parse(b); return fraction(a.n * b.d - b.n * a.d, a.d * b.d); };
const multiply = (a, b) => { a = parse(a); b = parse(b); return fraction(a.n * b.n, a.d * b.d); };
const divide = (a, b) => { a = parse(a); b = parse(b); return fraction(a.n * b.d, a.d * b.n); };
const compare = (a, b) => { const delta = subtract(a, b).n; return delta < 0n ? -1 : delta > 0n ? 1 : 0; };
const total = (values) => values.reduce(add, fraction(0n));
function ceil1(value) {
    const a = parse(value);
    if (a.n < 0n) invalid('無條件進位只適用非負的新給假日數。', 'rounding');
    return fraction((a.n * 10n + a.d - 1n) / a.d, 10n);
}
function serialize(value) {
    const a = parse(value), negative = a.n < 0n, numerator = negative ? -a.n : a.n;
    let remainder = numerator % a.d, digits = '';
    for (let i = 0; remainder && i < 18; i++) { remainder *= 10n; digits += String(remainder / a.d); remainder %= a.d; }
    return { numerator: String(a.n), denominator: String(a.d), decimal: `${negative ? '-' : ''}${numerator / a.d}${digits ? `.${digits}` : ''}${remainder ? '…' : ''}` };
}
// External helpers accept serialized fractions and return serialized fractions.
// Internal BigInts never escape the calculate() result or these public helpers.
function rational(value, denominator) { return serialize(denominator === undefined ? value : divide(value, denominator)); }
Object.assign(rational, {
    from: serialize, serialize, add: (a, b) => serialize(add(a, b)), subtract: (a, b) => serialize(subtract(a, b)),
    multiply: (a, b) => serialize(multiply(a, b)), divide: (a, b) => serialize(divide(a, b)), compare,
    ceil1: (value) => serialize(ceil1(value)), sum: (values) => serialize(total(values))
});
Object.freeze(rational);

function date(value, field) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid(`${field} 必須為 YYYY-MM-DD 純日期。`, field);
    const [year, month, day] = value.split('-').map(Number), at = Date.UTC(year, month - 1, day);
    if (year < 1900 || year > 9998 || !Number.isFinite(at) || new Date(at).toISOString().slice(0, 10) !== value) invalid(`${field} 不是有效日期。`, field);
    return { text: value, year, month, day, ordinal: at / DAY };
}
function textAt(ordinal) {
    const result = new Date(ordinal * DAY).toISOString().slice(0, 10);
    if (!/^\d{4}-/.test(result)) invalid('日期超出可計算範圍。');
    return result;
}
function monthDays(year, month) { return new Date(Date.UTC(year, month, 0)).getUTCDate(); }
function addMonths(origin, months) {
    const index = origin.year * 12 + origin.month - 1 + months, year = Math.floor(index / 12), month = index % 12 + 1;
    const day = Math.min(origin.day, monthDays(year, month));
    return { ...date(`${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, '計算日期'), clamped: day !== origin.day };
}
function weight(start, end, basis) {
    if (end < start) invalid('權重區間迄日不可早於起日。');
    if (basis === 'actual_day') return { value: fraction(BigInt(end - start)), parts: [{ start: textAt(start), endExclusive: textAt(end), days: end - start, divisor: 1 }] };
    const parts = [];
    let value = fraction(0n), cursor = start;
    while (cursor < end) {
        const current = date(textAt(cursor), '計算日期'), next = addMonths({ ...current, day: 1 }, 1).ordinal, finish = Math.min(next, end), divisor = monthDays(current.year, current.month);
        const piece = fraction(BigInt(finish - cursor), BigInt(divisor)); value = add(value, piece);
        parts.push({ start: textAt(cursor), endExclusive: textAt(finish), days: finish - cursor, divisor, weight: serialize(piece) }); cursor = finish;
    }
    return { value, parts };
}
function normalizeExclusions(periods, service, leave) {
    if (!Array.isArray(periods) || periods.length > 500) invalid('不計年資區間必須為陣列且不得超過 500 段。', 'excludedPeriods');
    const result = periods.map((period, index) => {
        if (!period || typeof period !== 'object') invalid('不計年資區間格式不正確。', 'excludedPeriods');
        const start = date(period.start, `excludedPeriods[${index}].start`), end = date(period.end, `excludedPeriods[${index}].end`);
        if (end.ordinal <= start.ordinal) invalid('不計年資區間必須有明確正長度；迄日為復職日且不包含。', 'excludedPeriods');
        if (start.ordinal < service.ordinal) invalid('不計年資區間不得早於認列年資起算日。', 'excludedPeriods');
        if (leave && end.ordinal > leave.ordinal + 1) invalid('不計年資區間不得超出最後在職日翌日。', 'excludedPeriods');
        return { start: start.text, end: end.text, startOrdinal: start.ordinal, endOrdinal: end.ordinal, days: end.ordinal - start.ordinal };
    }).sort((a, b) => a.startOrdinal - b.startOrdinal);
    for (let i = 1; i < result.length; i++) if (result[i].startOrdinal < result[i - 1].endOrdinal) invalid('不計年資區間不得重疊；請先核對，不能重複扣除。', 'excludedPeriods');
    return result;
}
function milestone(service, months, exclusions) {
    const base = addMonths(service, months);
    let ordinal = base.ordinal, excludedDays = 0;
    const applied = [];
    // Each completed excluded interval shifts the target. If the target falls
    // inside an interval, its remaining paused days must also be skipped. The
    // shifted target can reach a later interval, which this ordered pass visits.
    for (const period of exclusions) {
        if (period.startOrdinal >= ordinal) break;
        ordinal += period.days; excludedDays += period.days;
        applied.push({ start: period.start, endExclusive: period.end, days: period.days });
    }
    return { ...date(textAt(ordinal), '資格取得日'), base: base.text, clamped: base.clamped, excludedDays, applied };
}
function statutoryDays(serviceMonths) {
    if (serviceMonths === 6) return 3;
    if (!Number.isSafeInteger(serviceMonths) || serviceMonths < 12 || serviceMonths % 12 !== 0) invalid('年資事件須為滿半年或整週年。');
    const years = serviceMonths / 12;
    if (years === 1) return 7;
    if (years === 2) return 10;
    if (years < 5) return 14;
    if (years < 10) return 15;
    return Math.min(30, years + 6);
}

function makeSegment(lot, start, finish, basis) {
    const sourceStart = date(lot.periodStart, 'lot.periodStart'), sourceEnd = date(lot.periodEndExclusive, 'lot.periodEndExclusive');
    if (sourceEnd.ordinal <= sourceStart.ordinal || sourceEnd.ordinal - sourceStart.ordinal > 732) invalid('來源期間須有正長度且不得超過兩年。', 'lot.periodEndExclusive');
    const days = parse(lot.statutoryDays), hours = parse(lot.statutoryHours);
    if (compare(days, 0) < 0 || compare(hours, 0) < 0) invalid('來源權利不得為負。', 'lot');
    const sourceWeight = weight(sourceStart.ordinal, sourceEnd.ordinal, basis), intersection = weight(start, finish, basis);
    const ratio = divide(intersection.value, sourceWeight.value), rawDays = multiply(days, ratio);
    return { eventKey: lot.eventKey, start: textAt(start), endExclusive: textAt(finish), sourceWeight: serialize(sourceWeight.value), intersectionWeight: serialize(intersection.value), ratio: serialize(ratio), rawDays: serialize(rawDays), rawHours: serialize(multiply(hours, ratio)), status: lot.status,
        sourceWeightParts: sourceWeight.parts, intersectionWeightParts: intersection.parts,
        formula: `(${days.n}/${days.d}) × (${intersection.value.n}/${intersection.value.d}) ÷ (${sourceWeight.value.n}/${sourceWeight.value.d})`,
        allocationOnly: true, contributesToAnnual: lot.status !== 'ineligible_after_leave' };
}

// Splits an entire acquired source right by year, without rounding or changing
// its acquisition status. Saving the next-year partition is not a carryover.
function partitionLot(lot, { year, prorationBasis = 'calendar_month' } = {}) {
    if (!lot || typeof lot !== 'object') invalid('請提供來源權利。', 'lot');
    if (!Number.isSafeInteger(year) || year < 1900 || year > 9997) invalid('分割年度不正確。', 'year');
    if (!['calendar_month', 'actual_day'].includes(prorationBasis)) invalid('分攤基礎不正確。', 'prorationBasis');
    const sourceStart = date(lot.periodStart, 'lot.periodStart'), sourceEnd = date(lot.periodEndExclusive, 'lot.periodEndExclusive');
    if (sourceEnd.ordinal <= sourceStart.ordinal || sourceEnd.ordinal - sourceStart.ordinal > 732) invalid('來源期間須有正長度且不得超過兩年。', 'lot.periodEndExclusive');
    const yearStart = date(`${year}-01-01`, '年度起日').ordinal, yearEnd = date(`${year + 1}-01-01`, '年度迄日').ordinal;
    const start = Math.max(sourceStart.ordinal, yearStart), finish = Math.min(sourceEnd.ordinal, yearEnd);
    return finish <= start ? null : makeSegment(lot, start, finish, prorationBasis);
}

/**
 * Input: confirmed serviceDate, actual hireDate, excludedPeriods [start,end),
 * leaveDate = last day employed (inclusive). year is the reporting calendar year;
 * anniversary mode selects whole lots acquired in that year. All money, leave
 * debits, prior settlements and grants remain the caller/store's responsibility.
 * sourceLots only include sources relevant to this year, not lifetime history.
 */
function calculate(input) {
    if (!input || typeof input !== 'object') invalid('請提供特休試算輸入。');
    const { employeeId, year, period = 'calendar_year', prorationBasis = 'calendar_month', rounding = 'raw', edgeDateConfirmed = false, employmentType = 'full_time' } = input;
    if (typeof employeeId !== 'string' || !employeeId.trim() || employeeId.length > 200) invalid('請提供員工識別碼。', 'employeeId');
    if (!Number.isSafeInteger(year) || year < 2017 || year > 9997) invalid('本引擎只適用 2017 年起的現行特休級距，年度須為整數。', 'year');
    if (!['calendar_year', 'anniversary'].includes(period)) invalid('特休制度不正確。', 'period');
    if (!['calendar_month', 'actual_day'].includes(prorationBasis)) invalid('分攤基礎不正確。', 'prorationBasis');
    if (!['raw', 'ceil_1_decimal'].includes(rounding)) invalid('小數策略不正確。', 'rounding');
    if (typeof edgeDateConfirmed !== 'boolean') invalid('月底日期確認必須為布林值。', 'edgeDateConfirmed');
    if (!['full_time', 'part_time_same_days', 'part_time_proportional'].includes(employmentType)) invalid('僱用型態不正確。', 'employmentType');
    const entitlementFactor = parse(input.entitlementFactor === undefined ? 1 : input.entitlementFactor);
    if (compare(entitlementFactor, 0) <= 0 || compare(entitlementFactor, 1) > 0) invalid('給假比例必須大於 0 且不超過 1。', 'entitlementFactor');
    if (employmentType !== 'part_time_proportional' && compare(entitlementFactor, 1) !== 0) invalid('全時或每週日數相同的部分工時應給完整日數，不得再減日數。', 'entitlementFactor');
    const factorBasis = typeof input.factorBasis === 'string' ? input.factorBasis.trim() : '';
    if (factorBasis.length > 2000) invalid('比例依據不得超過 2000 字。', 'factorBasis');
    if (employmentType === 'part_time_proportional' && (input.entitlementFactor === undefined || !factorBasis)) invalid('部分工時比例必須提供已確認的比例及計算依據，不得由引擎自行推定。', 'factorBasis');
    const hire = date(input.hireDate, 'hireDate'), service = date(input.serviceDate, 'serviceDate'), asOf = date(input.asOf, 'asOf');
    const leave = input.leaveDate == null || input.leaveDate === '' ? null : date(input.leaveDate, 'leaveDate');
    if (leave && leave.ordinal < hire.ordinal) invalid('最後在職日不得早於到職日。', 'leaveDate');
    if (service.ordinal > hire.ordinal) invalid('認列年資起算日不得晚於到職日；不計年資請改用排除區間，避免雙重扣除。', 'serviceDate');
    if (Math.max(year, asOf.year) - service.year > 150) invalid('年資超過 150 年，請先核對來源日期。', 'serviceDate');
    const dayHours = parse(input.dayHours);
    if (compare(dayHours, 0) <= 0 || compare(dayHours, 24) > 0) invalid('每日工時必須大於 0 且不超過 24，請使用核實的正常工時。', 'dayHours');
    const exclusions = normalizeExclusions(input.excludedPeriods || [], service, leave), warnings = [];
    const warn = (code, message, blocking = false) => { if (!warnings.some((warning) => warning.code === code)) warnings.push({ code, message, blocking }); };
    if (service.day >= 29 || hire.day >= 29) warn('EDGE_DATE_CONFIRMATION', '月底或 2 月 29 日採對應月同日、無同日取月末；此計算約定須人工確認具體資格日及期間。', !edgeDateConfirmed);
    if (service.text !== hire.text) warn('RECOGNIZED_PRIOR_SERVICE', '採已核實認列年資日計算；早於本次到職的取得事件不在本次任職自動給假，既有權利須另行對帳。');
    if (exclusions.length) warn('EXCLUDED_SERVICE_CONVENTION', '已提供的不計年資區間按實際日數推遲資格日；取得後的六／十二個曆月可休期間不因後續留停自動延長，須另核對公司約定。');
    if (leave) warn('TERMINATION_RECONCILIATION', '最後在職日含當日；已取得完整法定權利不按離職月份縮減。年度配置不是離職結算上限，未休與已結薪仍須另行對帳。');
    if (employmentType === 'part_time_proportional') warn('PART_TIME_CONVERSION_BASIS', '比例須由管理者依正常工時及勞雇約定核實；日轉小時使用比例換算基準工時，不能再以已納入比例的短工時重複折減。');
    const yearStart = date(`${year}-01-01`, '年度起日').ordinal, yearEnd = date(`${year + 1}-01-01`, '年度迄日').ordinal;
    const sourceLots = [], segments = [];
    const maxYears = Math.max(0, year - service.year + 1);
    for (const months of [6, ...Array.from({ length: maxYears }, (_, index) => (index + 1) * 12)]) {
        const event = milestone(service, months, exclusions);
        if (event.ordinal >= yearEnd) continue;
        const end = addMonths(event, months === 6 ? 6 : 12);
        if (period === 'anniversary' ? event.ordinal < yearStart : end.ordinal <= yearStart) continue;
        if (event.ordinal < hire.ordinal) { warn('SOURCE_BEFORE_CURRENT_HIRE', '所選年度含本次到職前取得的來源期間；其既有權利需人工對帳，未自動認列為本次任職新權利。', true); continue; }
        if (event.text < '2017-01-01') { warn('PRE_2017_SOURCE', '所選年度涉及 2017 年新制前取得的權利；本引擎不以現行級距回算舊權利，請人工核對。', true); continue; }
        if ((event.clamped || end.clamped) && !edgeDateConfirmed) warn('EDGE_DATE_CONFIRMATION', '月底或 2 月 29 日採對應月同日、無同日取月末；此計算約定須人工確認具體資格日及期間。', true);
        const eventKey = months === 6 ? 'm6' : `y${months / 12}`, baselineDays = fraction(BigInt(statutoryDays(months))), days = multiply(baselineDays, entitlementFactor);
        const status = leave && event.ordinal > leave.ordinal ? 'ineligible_after_leave' : event.ordinal <= asOf.ordinal ? 'acquired' : 'projected';
        const lot = {
            eventKey, serviceMonths: months, acquisitionDate: event.text, baseAcquisitionDate: event.base,
            periodStart: event.text, periodEndExclusive: end.text, baselineStatutoryDays: serialize(baselineDays), statutoryDays: serialize(days), statutoryHours: serialize(multiply(days, dayHours)),
            status, excludedDays: event.excludedDays,
            steps: [
                { code: 'SERVICE_MILESTONE', serviceDate: service.text, months, baseAcquisitionDate: event.base, missingDayClamped: event.clamped },
                { code: 'EXCLUDE_SERVICE_DAYS', periods: event.applied, excludedDays: event.excludedDays, acquisitionDate: event.text },
                { code: 'STATUTORY_TIER', completedYears: months === 6 ? '0.5' : String(months / 12), days: serialize(baselineDays), independentHalfYearLot: months === 6 },
                { code: 'EMPLOYMENT_FACTOR', employmentType, factor: serialize(entitlementFactor), factorBasis, baselineDays: serialize(baselineDays), days: serialize(days) },
                { code: 'ELIGIBILITY_AT_AS_OF', asOf: asOf.text, leaveDate: leave?.text || null, status },
                { code: 'SOURCE_PERIOD', start: event.text, endExclusive: end.text, months: months === 6 ? 6 : 12, missingDayClamped: end.clamped }
            ]
        };
        sourceLots.push(lot);
        segments.push(period === 'calendar_year' ? partitionLot(lot, { year, prorationBasis }) : { ...makeSegment(lot, event.ordinal, end.ordinal, prorationBasis), allocationOnly: false });
    }
    const acquiredRaw = total(segments.filter((segment) => segment.status === 'acquired').map((segment) => segment.rawDays));
    const projectedRaw = total(segments.filter((segment) => segment.status === 'projected').map((segment) => segment.rawDays));
    const raw = add(acquiredRaw, projectedRaw), rounded = rounding === 'ceil_1_decimal' ? ceil1(raw) : raw;
    const acquiredRounded = rounding === 'ceil_1_decimal' ? ceil1(acquiredRaw) : acquiredRaw;
    const acquiredSource = total(sourceLots.filter((lot) => lot.status === 'acquired').map((lot) => lot.statutoryDays));
    const acquiredInYear = total(sourceLots.filter((lot) => lot.status === 'acquired' && lot.acquisitionDate >= `${year}-01-01`).map((lot) => lot.statutoryDays));
    const manualConfirmationRequired = warnings.some((warning) => warning.blocking);
    return {
        calculatorVersion: CALCULATOR_VERSION, employeeId: employeeId.trim(), year, asOf: asOf.text,
        policy: { period, prorationBasis, rounding, dayHours: serialize(dayHours), employmentType, entitlementFactor: serialize(entitlementFactor), factorBasis },
        inputs: { hireDate: hire.text, serviceDate: service.text, leaveDate: leave?.text || null, excludedPeriods: exclusions.map(({ start, end }) => ({ start, end })), edgeDateConfirmed },
        dateRules: { timeZone: 'Asia/Taipei', interval: '[start,end)', leaveDate: 'last_employed_day_inclusive', exclusionEnd: 'return_to_service_day_exclusive', anniversary: 'original_anchor_same_day_or_month_end', serviceExclusion: 'actual_days_shift_each_milestone', rightPeriod: 'six_or_twelve_calendar_months_after_acquisition', sourceScope: 'sources_relevant_to_selected_year', decimal: 'display_only_max_18_fraction_digits' },
        manualConfirmationRequired, warnings, sourceLots, segments,
        statutory: { acquiredInYearDays: serialize(acquiredInYear), acquiredSourceDays: serialize(acquiredSource), acquiredSourceHours: serialize(multiply(acquiredSource, dayHours)), lifetimeTotal: false },
        annual: { rawDays: serialize(raw), grantedDays: serialize(rounded), roundingDifferenceDays: serialize(subtract(rounded, raw)), rawHours: serialize(multiply(raw, dayHours)), grantedHours: serialize(multiply(rounded, dayHours)), roundingDifferenceHours: serialize(multiply(subtract(rounded, raw), dayHours)),
            acquiredRawDays: serialize(acquiredRaw), acquiredGrantedDays: serialize(acquiredRounded), acquiredRoundingDifferenceDays: serialize(subtract(acquiredRounded, acquiredRaw)), acquiredRawHours: serialize(multiply(acquiredRaw, dayHours)), acquiredGrantedHours: serialize(multiply(acquiredRounded, dayHours)),
            projectedRawDays: serialize(projectedRaw), projectedRawHours: serialize(multiply(projectedRaw, dayHours)), eligibleSourceDays: serialize(acquiredSource),
            includesProjected: compare(projectedRaw, 0) > 0, allocationOnly: period === 'calendar_year', independentlyRoundedSubtotalsMustNotBeAdded: true },
        steps: [
            { code: 'SOURCE_RIGHTS_FIRST', message: 'sourceLots 的完整法定日數與年度配置分開；只有 acquired 才已取得，需排除既有給假與已結算權利後才可入帳。' },
            { code: 'YEAR_ALLOCATION', period, prorationBasis, message: period === 'calendar_year' ? '逐來源以本年度交集權重／完整來源期間權重分攤；半年批次使用自身六個月分母。' : '採本年度資格取得事件的完整權利，不按月份切分。' },
            { code: 'SUM_BEFORE_ROUNDING', rawDays: serialize(raw), rounding, grantedDays: serialize(rounded), differenceDays: serialize(subtract(rounded, raw)), message: '全年預估合計與已取得配置各自加總後進位一次；不可將分別進位小計相加，年度配置也不能覆寫法定全額。' },
            { code: 'EXACT_HOURS', dayHours: serialize(dayHours), message: '精確日數乘核實的日工時；不轉成既有百分之一小時帳本，不計薪資、預占或已休。' }
        ],
        sources: LAW_SOURCES.map((source) => ({ ...source }))
    };
}

module.exports = { CALCULATOR_VERSION, LAW_SOURCES, calculate, partitionLot, rational, statutoryDays,
    add: rational.add, subtract: rational.subtract, multiply: rational.multiply, divide: rational.divide, compare: rational.compare,
    ceil1: rational.ceil1, serialize: rational.serialize, sum: rational.sum };
