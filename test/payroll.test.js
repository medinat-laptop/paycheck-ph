import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculate, sssBracketLabel, sssContribution, withholding } from '../src/payroll.js';
import { DEFAULT_RULES, parseRules } from '../src/schedules.js';
import { reportRows } from '../src/reports.js';

test('Private company cutoff calculates earnings, deduction bases, and net pay for a fictional payslip', () => {
  const r = calculate({
    companyPayroll: true, salary: 22002.20, frequency: 'semi', daysWorked: 10,
    specialDays: 2, dailyExemptAllowance: 100.12, companyNightHours: 3, companyNightPremium: 25.13,
  });
  const earnings = Object.fromEntries(r.earnings);
  assert.equal(earnings['Basic salary'], 10001);
  assert.equal(earnings['Special holiday premium'], 600.06);
  assert.equal(earnings['Night differential'], 753.90);
  assert.equal(earnings['Non-taxable daily allowance'], 1001.20);
  assert.equal(r.insuranceBasis, 11354.96);
  assert.deepEqual(r.shares.map(s => s.employee), [575, 250.03, 200]);
  assert.deepEqual([r.gross, r.contributions, r.taxableBeforeContributions, r.taxable, r.tax, r.net],
    [12356.16, 1025.03, 10754.90, 9729.87, 0, 11331.13]);
});

test('Company cutoff counts regular holiday basic pay once and does not change standard payroll', () => {
  const inputs = { dailyRate: 1000, daysWorked: 2, regularHolidayDays: 1, frequency: 'semi' };
  const r = calculate({ ...inputs, companyPayroll: true });
  assert.equal(r.gross, 3000);
  assert.equal(r.taxableBeforeContributions, 3000);
  assert.equal(r.shares[2].employee, 40);
  assert.equal(calculate(inputs).gross, 2000);
  assert.equal(calculate({ ...inputs, companyPayroll: true, sector: 'government' }).gross, 2000);
});

test('Actual days worked determine basic pay without changing contribution allocation', () => {
  const inputs = { salary: 33000, days: 22, frequency: 'semi' };
  const standard = calculate(inputs);
  const actual = calculate({ ...inputs, daysWorked: '10' });
  assert.equal(standard.gross, 16500);
  assert.equal(actual.gross, 15000);
  assert.equal(actual.contributions, standard.contributions);
  assert.equal(actual.tax, 486.83);
  assert.deepEqual(reportRows(actual, false).find(([label]) => label === 'Days worked this pay period'),
    ['Days worked this pay period', '10']);
});

test('Days worked respects a manual daily rate, partial days, and zero', () => {
  const inputs = { frequency: 'semi', dailyRate: 1200 };
  assert.equal(calculate({ ...inputs, daysWorked: '10.5' }).gross, 12600);
  assert.equal(calculate({ ...inputs, daysWorked: '0' }).gross, 0);
  assert.equal(calculate({ ...inputs, daysWorked: '' }).gross, 17500);
});

test('SSS Circular 2024-006: minimum, bracket edges, EC, and MPF', () => {
  const cases = [
    [3000, 5000, 250, 500, 10, 0],
    [5249.99, 5000, 250, 500, 10, 0],
    [5250, 5500, 275, 550, 10, 0],
    [14749.99, 14500, 725, 1450, 10, 0],
    [14750, 15000, 750, 1500, 30, 0],
    [20250, 20500, 1025, 2050, 30, 25],
    [34749.99, 34500, 1725, 3450, 30, 725],
    [100000, 35000, 1750, 3500, 30, 750],
  ];
  for (const [basis, ...expected] of cases) {
    const r = sssContribution(basis);
    assert.deepEqual([r.msc, r.employee, r.employer, r.ec, r.mpfEmployee], expected, `Basis: ${basis}`);
  }
});

test('SSS breakdown shows the published compensation boundaries and MPF transition', () => {
  assert.equal(sssBracketLabel(sssContribution(5249.99)), 'Below ₱5,250.00');
  const regular = calculate({ salary: 20249.99 });
  assert.equal(sssBracketLabel(regular.sss), '₱19,750.00 – ₱20,249.99');
  assert.equal(regular.sss.mpfEmployee, 0);
  const mpf = calculate({ salary: 20250 });
  assert.equal(sssBracketLabel(mpf.sss), '₱20,250.00 – ₱20,749.99');
  assert.deepEqual([mpf.sss.employee, mpf.sss.employer + mpf.sss.ec, mpf.sss.mpfEmployee, mpf.sss.mpfEmployer], [1025, 2080, 25, 50]);
  const top = calculate({ salary: 34750 });
  assert.equal(sssBracketLabel(top.sss), '₱34,750.00 and above');
  assert.deepEqual(reportRows(top, false).find(([label]) => label === 'SSS monthly compensation bracket'),
    ['SSS monthly compensation bracket', 'PHP 34,750.00 and above']);
});

test('Monthly private payroll keeps employer shares and EC out of net pay', () => {
  const r = calculate();
  assert.deepEqual([r.gross, r.contributions, r.taxable, r.tax, r.totalDeductions, r.net, r.employerCost],
    [35000, 2825, 32175, 1701.3, 4526.3, 30473.7, 4605]);
  assert.equal(reportRows(r, false).find(([label]) => label === 'NET TAKE-HOME PAY')[1], 30473.7);
});

test('GSIS substitutes for SSS; mid-month payroll uses Annex E and half shares', () => {
  const r = calculate({ sector: 'government', salary: 44000, frequency: 'semi' });
  assert.equal(r.sss, null);
  assert.deepEqual(r.shares.map(s => [s.label, s.employee, s.employer]), [['GSIS', 1980, 2640], ['PhilHealth', 550, 550], ['Pag-IBIG', 100, 100]]);
  assert.deepEqual([r.gross, r.taxable, r.tax, r.net], [22000, 19370, 1478.10, 17891.90]);
});

test('Government PhilHealth floor and ceiling, low Pag-IBIG rate, and plan overrides', () => {
  const low = calculate({ sector: 'government', salary: 1500 });
  assert.deepEqual(low.shares.slice(1).map(s => [s.employee, s.employer]), [[250, 250], [15, 30]]);
  const high = calculate({ sector: 'government', salary: 120000, frequency: 'semi', allocation: '100' });
  assert.deepEqual(high.shares.slice(1).map(s => [s.employee, s.employer]), [[2500, 2500], [200, 200]]);
  const disabled = calculate({ insurance: false, health: false, hdmf: false, healthBasis: 100000 });
  assert.deepEqual(disabled.shares.map(s => [s.employee, s.employer, s.ec]), [[0, 0, 0], [0, 0, 0], [0, 0, 0]]);
  const override = calculate({ sector: 'government', healthBasis: 20000, hdmfBasis: 1500, insuranceBasis: 12000 });
  assert.deepEqual(override.shares.map(s => s.employee), [1080, 500, 15]);
});

test('Private employee overrides leave employer shares and SSS brackets intact', () => {
  const low = calculate({ salary: 1500, healthBasis: 100000, hdmfBasis: 10000 });
  assert.deepEqual(low.shares.map(s => [s.employee, s.employer]), [[250, 500], [37.5, 250], [200, 30]]);
  const high = calculate({ salary: 120000, frequency: 'semi', allowances: true, allowanceAmount: 5000 });
  assert.deepEqual(high.shares.map(s => [s.employee, s.employer]), [[875, 1750], [1500, 1250], [100, 100]]);
  assert.equal(high.sss.msc, 35000);
  assert.equal(high.contributions, 2475);
  assert.equal(calculate({ salary: 0 }).contributions, 0);
});

test('BIR scheduled withholding uses fixed tax plus a marginal excess rate', () => {
  for (const [taxable, frequency, bracket, tax] of [
    [20833, 'monthly', 1, 0], [25000, 'monthly', 2, 625.05], [33333, 'monthly', 3, 1875],
    [70000, 'monthly', 4, 9375.05], [170000, 'monthly', 5, 34541.7], [700000, 'monthly', 6, 195208.35],
    [10417, 'semi', 1, 0], [12000, 'semi', 2, 237.45], [20000, 'semi', 3, 1604.1],
    [6000, 'weekly', 2, 178.8], [2000, 'daily', 3, 242.45], [20000, 'biweekly', 3, 1788.46],
  ]) {
    const r = withholding(taxable, frequency);
    assert.deepEqual([r.bracket, r.tax], [bracket, tax], `${frequency} ${taxable}`);
  }
});

test('Night premiums and overtime use the correct rate and hours; toggles exclude them', () => {
  const input = {
    hourlyRate: 150, night: true, nightHours: 4, nightShifts: 1, overtime: true,
    ordinaryHours: 2, restHours: 1, holidayHours: 1, holidayType: 'holidayRest',
    allowances: true, allowanceAmount: 300, deductions: true, deductionAmount: 700,
  };
  const r = calculate(input);
  assert.deepEqual(r.earnings.slice(1, 4), [['Allowances', 300], ['Overtime pay', 1135.5], ['Night differential', 60]]);
  assert.equal(r.otherDeduction, 700);
  const off = calculate({ ...input, night: false, overtime: false, allowances: false, deductions: false });
  assert.equal(off.gross, 35000);
  assert.equal(off.otherDeduction, 0);
  const g = calculate({ ...input, sector: 'government', salary: 26400, hourlyRate: '', nightRate: 20 });
  assert.deepEqual(g.earnings.slice(2, 4), [['Overtime pay', 825], ['Night differential', 120]]);
});

test('Qualifying benefits use only the remaining annual exemption; other deductions are post-tax', () => {
  const r = calculate({
    salary: 25000, insurance: false, health: false, hdmf: false, benefits: true,
    qualifyingBonus: 25000, usedBonusExclusion: 80000, exemptBenefit: 3000,
    bonuses: true, bonusAmount: 1000, deductions: true, deductionAmount: 2000,
  });
  assert.deepEqual([r.gross, r.exclusions, r.taxable, r.tax, r.net], [54000, 13000, 41000, 3408.4, 48591.6]);
  const mwe = calculate({ salary: 13000, minimumWage: true, bonuses: true, bonusAmount: 22000, insurance: false, health: false, hdmf: false });
  assert.deepEqual([mwe.exclusions, mwe.taxable, mwe.tax], [13000, 22000, 175.05]);
});

test('Manual rates and pay frequency affect the right period inputs', () => {
  const r = calculate({ frequency: 'daily', days: 20, hours: 8, salary: 22000, dailyRate: 1000, night: true, nightHours: 4, nightShifts: 2 });
  assert.deepEqual([r.dailyRate, r.hourlyRate, r.gross, r.earnings[3][1], r.contributions], [1000, 125, 1100, 100, 87.5]);
  assert.equal(calculate({ frequency: 'weekly', salary: 26000 }).gross, 6000);
  assert.equal(calculate({ frequency: 'biweekly', salary: 26000 }).gross, 12000);
});

test('Custom schedules validate and override standard brackets and contributions', () => {
  const edited = structuredClone(DEFAULT_RULES);
  edited.sss.brackets = [[0, 3000, 100, 210, 8], [4000, 5000, 200, 420, 10]];
  edited.health.rate = 0.06;
  const rules = parseRules(JSON.stringify(edited));
  assert.equal(calculate({}, rules).shares[0].employee, 200);
  assert.equal(calculate({}, rules).shares[1].employee, 875);
  assert.equal(calculate({ sector: 'government' }, rules).shares[1].employee, 1050);
  edited.tax.monthly[2][0] = 100;
  assert.throws(() => parseRules(JSON.stringify(edited)), /increasing thresholds/);
});
