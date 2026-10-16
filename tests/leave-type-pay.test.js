const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeLeavePay } = require('../leave-type-pay');

test('legacy boolean leave pay keeps its meaning, including string booleans', () => {
    for (const paid of [true, 1, '1', 'true']) assert.deepEqual(normalizeLeavePay({ paid }), { pay_mode: 'full', pay_rate: 1, paid: true });
    for (const paid of [false, 0, '0', 'false', undefined]) assert.deepEqual(normalizeLeavePay({ paid }), { pay_mode: 'unpaid', pay_rate: 0, paid: false });
});

test('half pay survives old client round trips and explicit changes remain possible', () => {
    const half = normalizeLeavePay({ pay_mode: 'half', paid: false });
    assert.deepEqual(half, { pay_mode: 'half', pay_rate: 0.5, paid: true });
    assert.deepEqual(normalizeLeavePay({ paid: true }, half), half);
    assert.deepEqual(normalizeLeavePay({}, half), half);
    assert.equal(normalizeLeavePay({ paid: false }, half).pay_mode, 'unpaid');
    assert.equal(normalizeLeavePay({ pay_mode: 'full' }, half).pay_rate, 1);
    assert.equal(normalizeLeavePay({ paid: true }, { pay_mode: 'unpaid' }).pay_mode, 'full');
});

test('invalid explicit pay modes fail instead of silently changing payroll labels', () => {
    for (const pay_mode of ['', 'partial', 'FULL', 'constructor', '__proto__', 0.5, {}, []]) {
        assert.throws(() => normalizeLeavePay({ pay_mode, paid: true }), (error) => error.statusCode === 400);
    }
    assert.deepEqual(normalizeLeavePay({ paid: false, pay_rate: 0.5 }), { pay_mode: 'unpaid', pay_rate: 0, paid: false });
});
