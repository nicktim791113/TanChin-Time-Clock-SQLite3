'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const calculator = require('../annual-leave-calculator');
const { calculate, rational: r, partitionLot, statutoryDays } = calculator;
const base = Object.freeze({ employeeId: 'E001', hireDate: '2025-07-01', serviceDate: '2025-07-01', year: 2026, asOf: '2026-12-31', dayHours: '8' });
const run = (overrides = {}) => calculate({ ...base, ...overrides });
function exact(actual, expected) { assert.deepEqual(actual, r(expected)); }
function invalid(overrides, field) {
    assert.throws(() => run(overrides), (error) => error.code === 'ANNUAL_LEAVE_INVALID_INPUT' && error.statusCode === 400 && (!field || error.field === field));
}

test('exact arithmetic serializes normalized fractions without floating-point or JSON BigInt leaks', () => {
    exact(r('0.1'), '1/10');
    exact(r.add('0.1', '0.2'), '0.3');
    exact(r('2', '6'), '1/3');
    exact(r('-2/-6'), '1/3');
    exact(r.subtract('0.3', '0.2'), '0.1');
    exact(r.multiply('1/3', '3/7'), '1/7');
    exact(r.divide('1/3', '2/7'), '7/6');
    exact(r.sum(['1/3', '1/3', '1/3']), '1');
    assert.equal(r.compare('0.3', r('3/10')), 0);
    assert.equal(r.compare('-1/3', 0), -1);
    assert.equal(r.compare('9007199254740993', '9007199254740992'), 1);
    assert.equal(r('1/3').decimal, '0.333333333333333333…');
    assert.equal(r('-1/3').decimal, '-0.333333333333333333…');
    exact(r.serialize({ numerator: '20', denominator: '30', decimal: 'not arithmetic' }), '2/3');
    assert.doesNotThrow(() => JSON.stringify(run()));
    for (const key of ['add', 'subtract', 'multiply', 'divide', 'compare', 'ceil1', 'serialize', 'sum']) assert.equal(calculator[key], r[key]);
});

test('ceil tenths handles exact boundaries and refuses truncated or unsafe numeric inputs', () => {
    exact(r.ceil1('7.01'), '7.1');
    exact(r.ceil1('7.1'), '7.1');
    exact(r.ceil1('7.10'), '7.1');
    exact(r.ceil1('0.000000000000000000001'), '0.1');
    exact(r.ceil1('0'), '0');
    for (const value of ['1e3', '0.333…', '1/0', '', 'NaN', Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, null]) assert.throws(() => r(value));
    assert.throws(() => r.divide(1, 0));
    assert.throws(() => r.ceil1('-0.1'));
});

test('current statutory table covers half-year, all thresholds, and thirty-day cap', () => {
    for (const [months, days] of [[6, 3], [12, 7], [24, 10], [36, 14], [48, 14], [60, 15], [108, 15], [120, 16], [132, 17], [276, 29], [288, 30], [300, 30], [1200, 30]]) assert.equal(statutoryDays(months), days);
    for (const months of [0, -1, 5, 18, '12', NaN]) assert.throws(() => statutoryDays(months));
});

test('July first hire separates half-year three days and one-year seven days from calendar allocation', () => {
    const result = run();
    assert.deepEqual(result.sourceLots.map((lot) => [lot.eventKey, lot.acquisitionDate, lot.periodEndExclusive]), [
        ['m6', '2026-01-01', '2026-07-01'], ['y1', '2026-07-01', '2027-07-01']
    ]);
    exact(result.sourceLots[0].statutoryDays, 3);
    exact(result.sourceLots[1].statutoryDays, 7);
    exact(result.annual.rawDays, '6.5');
    exact(result.statutory.acquiredSourceDays, 10);
    exact(result.statutory.acquiredInYearDays, 10);
    exact(result.segments[0].sourceWeight, 6);
    exact(result.segments[0].ratio, 1);
    exact(result.segments[1].ratio, '1/2');
    assert.equal(result.annual.allocationOnly, true);
    assert.equal(result.statutory.lifetimeTotal, false);
    assert.equal(result.manualConfirmationRequired, false);
    const next = run({ year: 2027, asOf: '2027-12-31' });
    exact(next.annual.rawDays, '8.5');
    exact(next.statutory.acquiredInYearDays, 10);
    exact(next.statutory.acquiredSourceDays, 17);
});

test('asOf distinguishes forecasts from acquired events on the exact qualification day', () => {
    const before = run({ asOf: '2025-12-31' });
    exact(before.annual.acquiredRawDays, 0);
    exact(before.annual.projectedRawDays, '6.5');
    const halfway = run({ asOf: '2026-01-01' });
    assert.equal(halfway.sourceLots[0].status, 'acquired');
    assert.equal(halfway.sourceLots[1].status, 'projected');
    exact(halfway.annual.acquiredRawDays, 3);
    exact(halfway.annual.projectedRawDays, '3.5');
    exact(halfway.statutory.acquiredSourceDays, 3);
    assert.equal(run({ asOf: '2026-06-30' }).sourceLots[1].status, 'projected');
    assert.equal(run({ asOf: '2026-07-01' }).sourceLots[1].status, 'acquired');
    assert.equal(run({ asOf: '2030-01-01' }).annual.includesProjected, false);
});

test('each annual threshold becomes acquired on its anniversary, including the capped tier', () => {
    for (const [years, days] of [[1, 7], [2, 10], [3, 14], [4, 14], [5, 15], [9, 15], [10, 16], [24, 30], [25, 30]]) {
        const start = `${2026 - years}-07-01`;
        const input = { hireDate: start, serviceDate: start, period: 'anniversary' };
        const before = run({ ...input, asOf: '2026-06-30' }).sourceLots.find((lot) => lot.eventKey === `y${years}`);
        const onDay = run({ ...input, asOf: '2026-07-01' }).sourceLots.find((lot) => lot.eventKey === `y${years}`);
        assert.equal(before.status, 'projected');
        assert.equal(onDay.status, 'acquired');
        exact(onDay.statutoryDays, days);
    }
});

test('anniversary report selects complete lots acquired in the reporting year', () => {
    const result = run({ period: 'anniversary' });
    exact(result.annual.rawDays, 10);
    assert.ok(result.segments.every((segment) => segment.ratio.decimal === '1' && !segment.allocationOnly));
    const next = run({ period: 'anniversary', year: 2027, asOf: '2027-12-31' });
    assert.deepEqual(next.sourceLots.map((lot) => lot.eventKey), ['y2']);
    exact(next.annual.rawDays, 10);
});

test('leaveDate is last employed day and never prorates an already acquired statutory right', () => {
    const before = run({ leaveDate: '2026-06-30' });
    assert.equal(before.sourceLots[1].status, 'ineligible_after_leave');
    exact(before.statutory.acquiredSourceDays, 3);
    exact(before.annual.rawDays, 3);
    assert.equal(before.segments[1].contributesToAnnual, false);
    for (const leaveDate of ['2026-07-01', '2026-07-02', '2026-09-30']) {
        const acquired = run({ leaveDate });
        exact(acquired.sourceLots[1].statutoryDays, 7);
        exact(acquired.statutory.acquiredSourceDays, 10);
        assert.equal(acquired.sourceLots[1].status, 'acquired');
        assert.ok(acquired.warnings.some((warning) => warning.code === 'TERMINATION_RECONCILIATION'));
    }
    const noRight = run({ leaveDate: '2025-12-31' });
    exact(noRight.annual.rawDays, 0);
    exact(noRight.statutory.acquiredSourceDays, 0);
});

test('all year partitions conserve complete source days and hours exactly without segment rounding', () => {
    for (const prorationBasis of ['calendar_month', 'actual_day']) {
        const result = run({ hireDate: '2024-08-17', serviceDate: '2024-08-17', year: 2025, asOf: '2025-12-31', dayHours: '7.25', prorationBasis });
        for (const lot of result.sourceLots) {
            const portions = [2024, 2025, 2026].map((year) => partitionLot(lot, { year, prorationBasis })).filter(Boolean);
            exact(r.sum(portions.map((item) => item.rawDays)), lot.statutoryDays);
            exact(r.sum(portions.map((item) => item.rawHours)), lot.statutoryHours);
            exact(r.sum(portions.map((item) => item.ratio)), 1);
            assert.equal(partitionLot(lot, { year: 2030, prorationBasis }), null);
        }
        assert.deepEqual(result.segments, result.sourceLots.map((lot) => partitionLot(lot, { year: 2025, prorationBasis })));
    }
});

test('partition conservation holds across every hire month, leap boundaries, and proportional hours', () => {
    for (let month = 1; month <= 12; month++) {
        for (const day of [1, 17, 28]) {
            const hireDate = `2023-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            for (const prorationBasis of ['calendar_month', 'actual_day']) {
                const result = run({ hireDate, serviceDate: hireDate, year: 2024, asOf: '2024-12-31', dayHours: '7.5', employmentType: 'part_time_proportional', entitlementFactor: '2/3', factorBasis: '人工核實測試比例', prorationBasis });
                for (const lot of result.sourceLots) {
                    const pieces = [2023, 2024, 2025].map((year) => partitionLot(lot, { year, prorationBasis })).filter(Boolean);
                    exact(r.sum(pieces.map((piece) => piece.rawDays)), lot.statutoryDays);
                    exact(r.sum(pieces.map((piece) => piece.rawHours)), lot.statutoryHours);
                }
                exact(result.annual.rawDays, r.add(result.annual.acquiredRawDays, result.annual.projectedRawDays));
            }
        }
    }
});

test('actual-day basis uses leap-year days while month basis treats each full month as one', () => {
    const input = { hireDate: '2023-07-01', serviceDate: '2023-07-01', year: 2024, asOf: '2024-12-31' };
    const monthly = run(input), daily = run({ ...input, prorationBasis: 'actual_day' });
    exact(monthly.annual.rawDays, '6.5');
    exact(daily.segments[0].sourceWeight, 182);
    exact(daily.segments[1].sourceWeight, 365);
    exact(daily.segments[1].intersectionWeight, 184);
    exact(daily.annual.rawDays, r.add(3, r.multiply(7, '184/365')));
    assert.notDeepEqual(daily.annual.rawDays, monthly.annual.rawDays);
    const spanningLeap = run({ ...input, year: 2023, asOf: '2023-12-31', hireDate: '2022-07-01', serviceDate: '2022-07-01', prorationBasis: 'actual_day' });
    exact(spanningLeap.sourceLots[1].statutoryDays, 7);
    exact(spanningLeap.segments[1].sourceWeight, 366);
});

test('month portions use actual calendar-month denominators and rounding occurs after annual sum', () => {
    const result = run({ hireDate: '2024-08-17', serviceDate: '2024-08-17', year: 2025, asOf: '2025-12-31', rounding: 'ceil_1_decimal' });
    const first = result.segments[0];
    assert.deepEqual(first.sourceWeightParts[0], { start: '2025-02-17', endExclusive: '2025-03-01', days: 12, divisor: 28, weight: r('12/28') });
    exact(result.annual.rawDays, r.sum(result.segments.map((item) => item.rawDays)));
    exact(result.annual.grantedDays, r.ceil1(result.annual.rawDays));
    exact(result.annual.roundingDifferenceDays, r.subtract(result.annual.grantedDays, result.annual.rawDays));
    exact(result.annual.grantedHours, r.multiply(result.annual.grantedDays, 8));
    assert.equal(result.annual.independentlyRoundedSubtotalsMustNotBeAdded, true);
    const candidates = Array.from({ length: 27 }, (_, index) => run({ hireDate: `2024-06-${String(index + 1).padStart(2, '0')}`, serviceDate: `2024-06-${String(index + 1).padStart(2, '0')}`, year: 2025, rounding: 'ceil_1_decimal' }));
    const counterexample = candidates.find((item) => r.compare(r.sum(item.segments.map((part) => r.ceil1(part.rawDays))), item.annual.grantedDays) > 0);
    assert.ok(counterexample, 'fixture must prove that rounding every source overgrants versus sum-first');
});

test('month-end and leap-day conventions block posting until the configured rule is confirmed', () => {
    const result = run({ hireDate: '2024-02-29', serviceDate: '2024-02-29', year: 2025, asOf: '2025-12-31' });
    assert.equal(result.manualConfirmationRequired, true);
    assert.equal(result.sourceLots.find((lot) => lot.eventKey === 'y1').acquisitionDate, '2025-02-28');
    const confirmed = run({ hireDate: '2024-02-29', serviceDate: '2024-02-29', year: 2028, asOf: '2028-12-31', edgeDateConfirmed: true });
    assert.equal(confirmed.sourceLots.find((lot) => lot.eventKey === 'y4').acquisitionDate, '2028-02-29', 'must keep original anchor rather than drift from previous clamped anniversary');
    assert.equal(confirmed.manualConfirmationRequired, false);
    const august = run({ hireDate: '2023-08-31', serviceDate: '2023-08-31', year: 2024, asOf: '2024-12-31' });
    assert.equal(august.sourceLots[0].acquisitionDate, '2024-02-29');
    assert.equal(august.manualConfirmationRequired, true);
});

test('excluded periods delay service milestones by complete paused days and expose the calculation', () => {
    const excludedPeriods = [{ start: '2025-11-01', end: '2025-12-01' }];
    const result = run({ excludedPeriods });
    const half = result.sourceLots.find((lot) => lot.eventKey === 'm6');
    assert.equal(half.acquisitionDate, '2026-01-31');
    assert.equal(half.baseAcquisitionDate, '2026-01-01');
    assert.equal(half.excludedDays, 30);
    assert.equal(half.periodEndExclusive, '2026-07-31');
    assert.deepEqual(half.steps.find((step) => step.code === 'EXCLUDE_SERVICE_DAYS').periods, [{ start: '2025-11-01', endExclusive: '2025-12-01', days: 30 }]);
    assert.equal(result.sourceLots.find((lot) => lot.eventKey === 'y1').acquisitionDate, '2026-07-31');
});

test('a target inside a pause skips its remainder, and a shifted target can reach another pause', () => {
    const result = run({ excludedPeriods: [{ start: '2025-12-15', end: '2026-01-15' }, { start: '2026-01-20', end: '2026-02-01' }] });
    assert.equal(result.sourceLots[0].acquisitionDate, '2026-02-13');
    assert.equal(result.sourceLots[0].excludedDays, 43);
    const adjacent = run({ excludedPeriods: [{ start: '2025-11-01', end: '2025-11-15' }, { start: '2025-11-15', end: '2025-12-01' }] });
    assert.equal(adjacent.sourceLots[0].acquisitionDate, '2026-01-31');
    const onAcquisition = run({ excludedPeriods: [{ start: '2026-01-01', end: '2026-02-01' }] });
    assert.equal(onAcquisition.sourceLots[0].acquisitionDate, '2026-01-01', 'qualification was completed through previous employed day');
    assert.equal(onAcquisition.sourceLots[1].acquisitionDate, '2026-08-01');
});

test('part time with the same weekly days retains full days and uses shorter normal hours once', () => {
    const result = run({ employmentType: 'part_time_same_days', dayHours: '4' });
    exact(result.sourceLots[1].baselineStatutoryDays, 7);
    exact(result.sourceLots[1].statutoryDays, 7);
    exact(result.sourceLots[1].statutoryHours, 28);
    exact(result.annual.rawHours, 26);
    invalid({ employmentType: 'part_time_same_days', entitlementFactor: '1/2' }, 'entitlementFactor');
    invalid({ employmentType: 'full_time', entitlementFactor: '1/2' }, 'entitlementFactor');
});

test('part time proportion requires a confirmed factor basis and preserves baseline versus scaled right', () => {
    const result = run({ employmentType: 'part_time_proportional', entitlementFactor: '1/3', factorBasis: '已核實全年正常工時 696 / 2088，約定以 8 小時基準換算', dayHours: '8' });
    const lot = result.sourceLots[1];
    exact(lot.baselineStatutoryDays, 7);
    exact(lot.statutoryDays, '7/3');
    exact(lot.statutoryHours, '56/3');
    exact(lot.steps.find((step) => step.code === 'EMPLOYMENT_FACTOR').factor, '1/3');
    exact(result.annual.rawDays, '13/6');
    assert.ok(result.warnings.some((warning) => warning.code === 'PART_TIME_CONVERSION_BASIS'));
    invalid({ employmentType: 'part_time_proportional' }, 'factorBasis');
    invalid({ employmentType: 'part_time_proportional', entitlementFactor: '1/2' }, 'factorBasis');
    for (const entitlementFactor of [0, -1, '1.01']) invalid({ employmentType: 'part_time_proportional', entitlementFactor, factorBasis: 'test' }, 'entitlementFactor');
});

test('invalid dates, unknown policies, overlapping periods and missing facts fail explicitly', () => {
    for (const [overrides, field] of [
        [{ employeeId: '' }, 'employeeId'], [{ year: 2016 }, 'year'], [{ year: 2026.5 }, 'year'], [{ asOf: undefined }, 'asOf'],
        [{ hireDate: '2025-02-29' }, 'hireDate'], [{ serviceDate: undefined }, 'serviceDate'], [{ serviceDate: '2025-07-02' }, 'serviceDate'],
        [{ leaveDate: '2025-06-30' }, 'leaveDate'], [{ dayHours: 0 }, 'dayHours'], [{ dayHours: 25 }, 'dayHours'],
        [{ period: 'other' }, 'period'], [{ prorationBasis: 'days' }, 'prorationBasis'], [{ rounding: 'floor' }, 'rounding'],
        [{ edgeDateConfirmed: 1 }, 'edgeDateConfirmed'], [{ employmentType: 'other' }, 'employmentType'],
        [{ excludedPeriods: [{ start: '2025-08-01', end: '2025-08-01' }] }, 'excludedPeriods'],
        [{ excludedPeriods: [{ start: '2025-06-01', end: '2025-08-01' }] }, 'excludedPeriods'],
        [{ excludedPeriods: [{ start: '2025-08-01', end: '2025-10-01' }, { start: '2025-09-01', end: '2025-11-01' }] }, 'excludedPeriods'],
        [{ leaveDate: '2025-10-01', excludedPeriods: [{ start: '2025-08-01', end: '2025-10-03' }] }, 'excludedPeriods']
    ]) invalid(overrides, field);
    assert.throws(() => calculate(null));
    assert.throws(() => partitionLot({}, { year: 2026 }));
    assert.throws(() => partitionLot(run().sourceLots[0], { year: 2026, prorationBasis: 'other' }));
});

test('recognized prior service and pre-2017 source rights are explicit reconciliation boundaries', () => {
    const recognized = run({ hireDate: '2026-04-01', serviceDate: '2025-07-01' });
    assert.equal(recognized.manualConfirmationRequired, true);
    assert.ok(recognized.warnings.some((warning) => warning.code === 'SOURCE_BEFORE_CURRENT_HIRE'));
    assert.deepEqual(recognized.sourceLots.map((lot) => lot.eventKey), ['y1']);
    const old = run({ hireDate: '2015-07-01', serviceDate: '2015-07-01', year: 2017, asOf: '2017-12-31' });
    assert.equal(old.manualConfirmationRequired, true);
    assert.ok(old.warnings.some((warning) => warning.code === 'PRE_2017_SOURCE'));
    assert.deepEqual(old.sourceLots.map((lot) => lot.eventKey), ['y2']);
});

test('calculation is deterministic, does not mutate inputs, and includes traceable official sources', () => {
    const input = Object.freeze({ ...base, excludedPeriods: Object.freeze([Object.freeze({ start: '2025-11-01', end: '2025-12-01' })]) });
    const first = calculate(input), second = calculate(input);
    assert.deepEqual(first, second);
    assert.equal(input.excludedPeriods[0].end, '2025-12-01');
    assert.equal(first.calculatorVersion, calculator.CALCULATOR_VERSION);
    assert.ok(first.sources.some((source) => source.url.includes('flno=24-1')));
    assert.ok(first.sources.every((source) => /https:\/\/(law\.moj\.gov\.tw|www\.mol\.gov\.tw)\//.test(source.url)));
    assert.deepEqual(run({ hireDate: '2027-07-01', serviceDate: '2027-07-01' }).sourceLots, []);
});
