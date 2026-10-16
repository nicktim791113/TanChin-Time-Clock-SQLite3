const PAY_RATES = Object.freeze({ full: 1, half: 0.5, unpaid: 0 });
const hasValue = (value) => value !== undefined && value !== null;
const legacyPaid = (value) => value === true || value === 1 || value === '1' || value === 'true';

// This is a leave-type label, not a payroll calculation or a historical pay snapshot.
function normalizeLeavePay(type = {}, previous = {}) {
    let mode;
    if (hasValue(type.pay_mode)) {
        if (typeof type.pay_mode !== 'string' || !Object.hasOwn(PAY_RATES, type.pay_mode)) {
            throw Object.assign(new Error('給薪方式須為全薪、半薪或無薪。'), { statusCode: 400 });
        }
        mode = type.pay_mode;
    } else {
        const oldMode = Object.hasOwn(PAY_RATES, previous.pay_mode)
            ? previous.pay_mode : legacyPaid(previous.paid) ? 'full' : 'unpaid';
        // Older clients only know paid. Keep half-pay when that boolean has not changed.
        mode = hasValue(type.paid) && legacyPaid(type.paid) !== (oldMode !== 'unpaid')
            ? legacyPaid(type.paid) ? 'full' : 'unpaid' : oldMode;
    }
    return { pay_mode: mode, pay_rate: PAY_RATES[mode], paid: mode !== 'unpaid' };
}

module.exports = { PAY_RATES, normalizeLeavePay };
