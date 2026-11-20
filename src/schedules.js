export const SOURCE_DATE = 'November 2026';

export const SOURCES = [
  ['SSS Circular 2024-006', 'https://www.sss.gov.ph/wp-content/uploads/2024/12/CI-2024-006-Publication.pdf', 'Business employees, effective January 2025'],
  ['GSIS contributions', 'https://www.gsis.gov.ph/active-members/contributions/', 'Regular and special member premiums'],
  ['PhilHealth Advisory 2025-0002', 'https://www.philhealth.gov.ph/advisories/2025/PA2025-0002.pdf', 'Premium schedule and monthly basic salary basis'],
  ['PhilHealth Advisory 2026-0042', 'https://www.philhealth.gov.ph/advisories/2026/PA2026-0042.pdf', '2026 premium rate and limits'],
  ['Pag-IBIG Circular 460', "https://www.pagibigfund.gov.ph/document/pdf/circulars/provident/Circular%20No.%20460%20-%20Guidelines%20on%20the%20Pag-IBIG%20Fund's%20Implementation%20of%20Increase%20in%20the%20MFS%20Effective%20February%202024.pdf", 'Fund salary and mandatory savings from February 2024'],
  ['BIR RR 11-2018, Annex E', 'https://bir-cdn.bir.gov.ph/local/pdf/Annex%20E%20RR%2011-2018.pdf', 'Compensation withholding tables from January 2023'],
  ['TRAIN Law (RA 10963)', 'https://lawphil.net/statutes/repacts/ra2017/ra_10963_2017.html', 'Annual tax, minimum wage and qualifying benefits exclusions'],
  ['BIR RR 29-2025', 'https://bir-cdn.bir.gov.ph/BIR/pdf/RR%20No.%2029-2025.pdf', 'De minimis benefits; enter only amounts already verified eligible'],
  ['DOLE statutory benefits handbook', 'https://bwc.dole.gov.ph/wp-content/uploads/2024/10/Workers-Statutory-Monetary-Benefits-Handbook-2024-Edition.pdf', 'Private-sector night differential and overtime'],
  ['RA 11701 implementing rules', 'https://lawphil.net/statutes/repacts/ra2023/irr_11701_2023.html', 'Night differential for covered government personnel'],
  ['CSC-DBM Joint Circular 2015-2', 'https://www.dbm.gov.ph/index.php/joint-circulars', 'Government overtime pay, authorization and limits'],
];

export const DEFAULT_RULES = {
  sss: { min: 5000, max: 35000, step: 500, regularMax: 20000, employee: 0.05, employer: 0.10, ecThreshold: 15000, ecLow: 10, ecHigh: 30, brackets: [] },
  gsis: { employee: 0.09, employer: 0.12 },
  health: { floor: 10000, ceiling: 100000, rate: 0.05, employeeShare: 0.5 },
  hdmf: { ceiling: 10000, threshold: 1500, lowRate: 0.01, highRate: 0.02, employer: 0.02 },
  night: { private: { min: 10, max: 100, default: 10, maxHours: 8 }, government: { min: 0, max: 20, default: 10, maxHours: 12 } },
  overtime: {
    private: { ordinary: 1.25, rest: 1.69, regularHoliday: 2.60, specialHoliday: 1.69, holidayRest: 3.38, specialRest: 1.95 },
    government: { ordinary: 1.25, rest: 1.5, regularHoliday: 1.5, specialHoliday: 1.5, holidayRest: 1.5, specialRest: 1.5 },
  },
  governmentHourly: { days: 22, hours: 8 },
  bonusExclusion: 90000,
  // Rows contain the excess threshold, fixed tax and marginal rate.
  tax: {
    monthly: [[0, 0, 0], [20833, 0, .15], [33333, 1875, .20], [66667, 8541.80, .25], [166667, 33541.80, .30], [666667, 183541.80, .35]],
    semi: [[0, 0, 0], [10417, 0, .15], [16667, 937.50, .20], [33333, 4270.70, .25], [83333, 16770.70, .30], [333333, 91770.70, .35]],
    weekly: [[0, 0, 0], [4808, 0, .15], [7692, 432.60, .20], [15385, 1971.20, .25], [38462, 7740.45, .30], [153846, 42355.65, .35]],
    daily: [[0, 0, 0], [685, 0, .15], [1096, 61.65, .20], [2192, 280.85, .25], [5479, 1102.60, .30], [21918, 6034.30, .35]],
    annual: [[0, 0, 0], [250000, 0, .15], [400000, 22500, .20], [800000, 102500, .25], [2000000, 402500, .30], [8000000, 2202500, .35]],
  },
};

export function parseRules(text) {
  const parsed = JSON.parse(text);
  function check(value, shape, path) {
    if (typeof shape === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e9) {
        throw new Error(`${path} must be a non-negative number of at most 1 billion.`);
      }
    } else if (Array.isArray(shape)) {
      if (!Array.isArray(value) || (path !== 'sss.brackets' && value.length < 2)) {
        throw new Error(`${path} must be an array${path === 'sss.brackets' ? '' : ' with at least two rows'}.`);
      }
      value.forEach((row, i) => {
        const length = path === 'sss.brackets' ? 5 : 3;
        if (!Array.isArray(row) || row.length !== length) throw new Error(`${path}[${i}] requires ${length} numbers.`);
        row.forEach((cell, j) => check(cell, 0, `${path}[${i}][${j}]`));
        if ((!i && row[0] !== 0) || (i && row[0] <= value[i - 1][0])) throw new Error(`${path} must start at zero and use increasing thresholds.`);
        if (length === 3 && row[2] > 1) throw new Error(`${path} rates must be between 0 and 1.`);
      });
    } else {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path || 'Settings'} must be an object.`);
      for (const key of Object.keys(shape)) check(value[key], shape[key], path ? `${path}.${key}` : key);
      for (const key of Object.keys(value)) if (!Object.hasOwn(shape, key)) throw new Error(`Unknown setting: ${path ? `${path}.` : ''}${key}.`);
    }
  }
  check(parsed, DEFAULT_RULES, '');
  const { sss, gsis, health, hdmf, night, governmentHourly, overtime } = parsed;
  if (!sss.step || sss.min > sss.max || (sss.max - sss.min) % sss.step !== 0 || sss.regularMax < sss.min || sss.regularMax > sss.max || sss.ecLow > sss.ecHigh) throw new Error('Review the SSS step, MSC limits and EC amounts.');
  if (health.floor > health.ceiling || hdmf.threshold > hdmf.ceiling) throw new Error('Review the contribution floors, thresholds and ceilings.');
  if ([sss.employee, sss.employer, gsis.employee, gsis.employer, health.rate, health.employeeShare, hdmf.lowRate, hdmf.highRate, hdmf.employer].some(rate => rate > 1)) throw new Error('Contribution rates must be decimals between 0 and 1.');
  if (Object.values(night).some(r => r.min > r.default || r.default > r.max || r.max > 100 || !r.maxHours || r.maxHours > 24)) throw new Error('Review the night differential rates (0–100%) and eligible hours (up to 24).');
  if (!governmentHourly.days || governmentHourly.days > 31 || !governmentHourly.hours || governmentHourly.hours > 24) throw new Error('Review the government hourly divisor.');
  if (Object.values(overtime).some(r => Object.values(r).some(rate => rate < 1 || rate > 10))) throw new Error('Overtime multipliers must be between 1 and 10.');
  return parsed;
}
