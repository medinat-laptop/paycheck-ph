import { DEFAULT_RULES } from './schedules.js';

export const FREQUENCIES = {
  monthly: ['Monthly', 'month', 12],
  semi: ['Semi-Monthly', 'cutoff', 24],
  biweekly: ['Bi-Weekly', 'two weeks', 26],
  weekly: ['Weekly', 'week', 52],
  daily: ['Daily', 'day', null],
};

export const DEFAULT_INPUTS = {
  name: '', sector: 'private', frequency: 'monthly', salary: 35000, days: 22, daysWorked: '', hours: 8,
  dailyRate: '', hourlyRate: '', insurance: true, health: true, hdmf: true,
  insuranceBasis: '', healthBasis: '', hdmfBasis: '', allocation: '',
  allowances: false, allowanceAmount: 0, bonuses: false, bonusAmount: 0,
  benefits: false, qualifyingBonus: 0, usedBonusExclusion: 0, exemptBenefit: 0, minimumWage: false,
  night: false, nightHours: 0, nightShifts: 1, nightRate: '', nightHourly: '',
  overtime: false, ordinaryHours: 0, restHours: 0, holidayHours: 0, holidayType: 'regularHoliday',
  ordinaryMultiplier: '', restMultiplier: '', holidayMultiplier: '',
  deductions: false, deductionAmount: 0,
  companyPayroll: false, specialDays: 0, regularHolidayDays: 0,
  dailyExemptAllowance: 0, companyNightHours: 0, companyNightPremium: 0,
};

const currency = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
export const peso = value => currency.format(value);
export const round = value => Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 100 + 1e-8) / 100;
const number = (value, fallback = 0, min = 0, max = 1e9) =>
  value === '' || value == null || !Number.isFinite(Number(value)) ? fallback : Math.min(max, Math.max(min, Number(value)));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const sum = (...values) => round(values.reduce((total, value) => total + value, 0));

export function sssContribution(pay, rules = DEFAULT_RULES.sss) {
  const { min, max, step, regularMax } = rules;
  const brackets = rules.brackets;
  if (brackets.length) {
    const index = brackets.findLastIndex(row => pay >= row[0]);
    const [lower, msc, employee, employer, ec] = brackets[Math.max(0, index)];
    return { msc, lower, upper: brackets[index + 1]?.[0], employee, employer, ec, mpfEmployee: null, mpfEmployer: null };
  }
  const msc = clamp(min + Math.floor((pay - min + step / 2) / step) * step, min, max);
  const mpf = Math.max(0, msc - regularMax);
  return {
    msc, lower: msc === min ? 0 : msc - step / 2, upper: msc === max ? undefined : msc + step / 2,
    employee: round(msc * rules.employee), employer: round(msc * rules.employer),
    ec: msc >= rules.ecThreshold ? rules.ecHigh : rules.ecLow,
    mpfEmployee: round(mpf * rules.employee), mpfEmployer: round(mpf * rules.employer),
  };
}

export function sssBracketLabel({ lower, upper }, format = peso) {
  if (!lower) return upper == null ? 'All covered pay' : `Below ${format(upper)}`;
  if (upper == null) return `${format(lower)} and above`;
  return `${format(lower)} – ${format(round(upper - 0.01))}`;
}

export function withholding(taxable, frequency, rules = DEFAULT_RULES.tax) {
  const periods = FREQUENCIES.biweekly[2];
  const table = frequency === 'biweekly' ? rules.annual : rules[frequency];
  const comparison = frequency === 'biweekly' ? round(taxable * periods) : taxable;
  const index = table.findLastIndex(([threshold], i) => i <= 1 ? i === 0 || comparison > threshold : comparison >= threshold);
  const [basis, fixed, rate] = table[index];
  const excess = rate ? round(Math.max(0, comparison - basis)) : 0;
  const variable = round(excess * rate);
  const divisor = frequency === 'biweekly' ? periods : 1;
  return {
    bracket: index + 1, rate, fixed, excess, variable, comparison, divisor,
    lower: index ? basis : 0, upper: table[index + 1]?.[0],
    tax: round((fixed + variable) / divisor),
  };
}

export function calculate(inputs = {}, rules = DEFAULT_RULES) {
  const i = { ...DEFAULT_INPUTS, ...inputs };
  const government = i.sector === 'government';
  const frequency = Object.hasOwn(FREQUENCIES, i.frequency) ? i.frequency : 'monthly';
  const companyPayroll = !government && frequency === 'semi' && i.companyPayroll;
  const [frequencyLabel, periodLabel, periods] = FREQUENCIES[frequency];
  const days = number(i.days, 22, 1, 31);
  const daysWorked = number(i.daysWorked, null, 0, 31);
  const hours = number(i.hours, 8, 0.01, 24);
  const salary = number(i.salary);
  const rate = number(i.dailyRate, salary ? salary / days : number(i.hourlyRate) * hours);
  const dailyRate = companyPayroll ? round(rate) : rate;
  const hourlyRate = number(i.hourlyRate, dailyRate / hours);
  const monthly = salary || dailyRate * days;
  const payFactor = periods ? 12 / periods : 1 / days;
  const contributionFactor = number(i.allocation, payFactor * 100, 0, 100) / 100;
  const basic = round(companyPayroll ? dailyRate * (daysWorked ?? 0) : daysWorked == null
    ? (frequency === 'daily' ? dailyRate : monthly * payFactor)
    : dailyRate * daysWorked);
  const specialDays = companyPayroll ? number(i.specialDays, 0, 0, daysWorked ?? 0) : 0;
  const regularHolidayDays = companyPayroll ? number(i.regularHolidayDays, 0, 0, (daysWorked ?? 0) - specialDays) : 0;
  const specialPremium = round(dailyRate * 0.30 * specialDays);
  const regularPremium = round(dailyRate * regularHolidayDays);
  const exemptAllowance = companyPayroll ? round(number(i.dailyExemptAllowance) * (daysWorked ?? 0)) : 0;
  const governmentHourly = number(i.hourlyRate, monthly / rules.governmentHourly.days / rules.governmentHourly.hours);
  const premiumHourly = government ? governmentHourly : hourlyRate;
  const otRules = rules.overtime[government ? 'government' : 'private'];
  const holidayType = ['regularHoliday', 'specialHoliday', 'holidayRest', 'specialRest'].includes(i.holidayType) ? i.holidayType : 'regularHoliday';
  const ordinaryMultiplier = number(i.ordinaryMultiplier, otRules.ordinary, government ? 1 : otRules.ordinary, 10);
  const restMultiplier = number(i.restMultiplier, otRules.rest, government ? 1 : otRules.rest, 10);
  const holidayMultiplier = number(i.holidayMultiplier, otRules[holidayType], government ? 1 : otRules[holidayType], 10);
  const overtime = i.overtime ? round(premiumHourly * (
    number(i.ordinaryHours) * ordinaryMultiplier + number(i.restHours) * restMultiplier + number(i.holidayHours) * holidayMultiplier
  )) : 0;
  const nightRules = rules.night[government ? 'government' : 'private'];
  const nightHourly = number(i.nightHourly, premiumHourly);
  const nightRate = number(i.nightRate, nightRules.default, nightRules.min, nightRules.max);
  const nightWork = companyPayroll
    ? number(i.companyNightHours, 0, 0, nightRules.maxHours) * (daysWorked ?? 0)
    : number(i.nightHours, 0, 0, nightRules.maxHours) * number(i.nightShifts);
  const companyNightPremium = number(i.companyNightPremium);
  const night = companyPayroll ? round(companyNightPremium * nightWork)
    : i.night ? round(nightHourly * nightWork * nightRate / 100) : 0;
  const allowance = i.allowances ? round(number(i.allowanceAmount)) : 0;
  const taxableBonus = i.bonuses ? round(number(i.bonusAmount)) : 0;
  const qualifyingBonus = i.benefits ? round(number(i.qualifyingBonus)) : 0;
  const exemptBenefit = i.benefits ? round(number(i.exemptBenefit)) : 0;
  const bonusExempt = round(Math.min(qualifyingBonus, Math.max(0, rules.bonusExclusion - number(i.usedBonusExclusion))));
  const otherComp = sum(taxableBonus, qualifyingBonus, exemptBenefit);
  const gross = sum(basic, allowance, overtime, night, otherComp, specialPremium, regularPremium, exemptAllowance);
  const estimatedInsurance = government ? monthly : round((frequency === 'daily' ? dailyRate * days : monthly) + (gross - basic));
  const insuranceBasis = companyPayroll ? sum(basic, night, specialPremium, regularPremium) : number(i.insuranceBasis, estimatedInsurance);
  const healthBasis = government ? number(i.healthBasis, monthly) : monthly;
  const hdmfBasis = government ? number(i.hdmfBasis, monthly + allowance) : monthly + allowance;
  const sss = !government && i.insurance && insuranceBasis > 0 ? sssContribution(round(insuranceBasis), rules.sss) : null;
  const hi = rules.health;
  const hd = rules.hdmf;
  const healthApplied = healthBasis > 0 ? clamp(healthBasis, hi.floor, hi.ceiling) : 0;
  const hdmfApplied = Math.min(hdmfBasis, hd.ceiling);
  const healthPremium = i.health ? round(healthApplied * hi.rate) : 0;
  const healthEmployee = round(healthPremium * hi.employeeShare);
  const monthlyShares = [
    { key: 'insurance', label: government ? 'GSIS' : 'SSS', basis: insuranceBasis, enabled: i.insurance,
      employee: sss?.employee ?? (government && i.insurance ? round(insuranceBasis * rules.gsis.employee) : 0),
      employer: sss?.employer ?? (government && i.insurance ? round(insuranceBasis * rules.gsis.employer) : 0), ec: sss?.ec ?? 0 },
    { key: 'health', label: 'PhilHealth', basis: government ? healthApplied : monthly, enabled: i.health,
      employee: i.health && !government ? round(monthly * 0.025) : healthEmployee,
      employer: round(healthPremium - healthEmployee), ec: 0 },
    { key: 'hdmf', label: 'Pag-IBIG', basis: hdmfApplied, enabled: i.hdmf,
      employee: !i.hdmf ? 0 : government
        ? round(hdmfApplied * (hdmfBasis <= hd.threshold ? hd.lowRate : hd.highRate))
        : monthly > 0 ? 200 : 0,
      employer: i.hdmf ? round(hdmfApplied * hd.employer) : 0, ec: 0 },
  ];
  const shares = monthlyShares.map(item => {
    const factor = companyPayroll && item.key === 'insurance' ? 1 : contributionFactor;
    const basis = companyPayroll && item.key !== 'insurance' ? basic : item.basis;
    let employee = round(item.employee * factor);
    if (companyPayroll && item.enabled) {
      if (item.key === 'health') employee = round(basic * 0.025);
      if (item.key === 'hdmf') employee = Math.min(200, round(basic * 0.02));
    }
    return { ...item, basis, employee, employer: round(item.employer * factor), ec: round(item.ec * factor) };
  });
  const contributions = sum(...shares.map(item => item.employee));
  const employerCost = sum(...shares.flatMap(item => [item.employer, item.ec]));
  const minimumWageExempt = i.minimumWage ? sum(basic, overtime, night) : 0;
  const exclusions = sum(bonusExempt, exemptBenefit, minimumWageExempt, exemptAllowance, specialPremium);
  const taxableBeforeContributions = Math.max(0, round(gross - exclusions));
  const taxable = Math.max(0, round(taxableBeforeContributions - contributions));
  const taxDetails = withholding(taxable, frequency, rules.tax);
  const tax = taxDetails.tax;
  const otherDeduction = i.deductions ? round(number(i.deductionAmount)) : 0;
  const totalDeductions = sum(contributions, tax, otherDeduction);
  const net = round(gross - totalDeductions);
  return {
    name: i.name.trim(), government, companyPayroll, frequency, frequencyLabel, periodLabel, monthly, dailyRate, hourlyRate, daysWorked,
    contributionFactor, insuranceBasis, healthBasis, hdmfBasis, premiumHourly, sss, nightHourly, nightRate, nightWork, ordinaryMultiplier, restMultiplier, holidayMultiplier,
    gross, contributions, employerCost, exclusions, taxableBeforeContributions, taxable, taxDetails, tax, totalDeductions, net, companyNightPremium,
    earnings: [['Basic salary', basic], ['Allowances', allowance], ['Overtime pay', overtime], ['Night differential', night], ['Other compensation', otherComp],
      ...(companyPayroll ? [['Special holiday premium', specialPremium], ['Regular holiday premium', regularPremium], ['Non-taxable daily allowance', exemptAllowance]] : [])],
    shares, otherDeduction,
  };
}
