import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateShifts, DAY_TYPES, ShiftError } from '../src/shifts.js';
import { calculate } from '../src/payroll.js';
import { reportRows } from '../src/reports.js';

const multipliers = Object.fromEntries(Object.entries(DAY_TYPES).map(([k, v]) => [k, { multiplier: v.multiplier, overtime: v.overtime }]));
const shift = (overrides = {}) => ({ date: '2026-11-01', start: '21:00', end: '06:00', dayType: 'ordinary', nextDayType: 'regularHoliday', ...overrides });
const compute = (shifts, overrides = {}) => calculateShifts({
  cutoffStart: '2026-11-01', cutoffEnd: '2026-11-15', hourlyRate: 100,
  nightRate: 10, absenceHours: 0, multipliers, shifts, ...overrides,
});
const total = r => r.basic + r.premium + r.overtime + r.night;

test('21:00–06:00 ordinary to regular holiday splits at 22:00 and midnight', () => {
  const r = compute([shift()]);
  assert.deepEqual(r.segments.map(s => [s.date, s.start, s.end, s.hours, s.multiplier, s.nightRate]),
    [['2026-11-01', '21:00', '22:00', 1, 1, 0],
      ['2026-11-01', '22:00', '24:00', 2, 1, 10],
      ['2026-11-02', '00:00', '06:00', 6, 2, 10]]);
  assert.deepEqual([r.basic, r.premium, r.overtime, r.night, total(r)], [900, 600, 0, 140, 1640]);
});

test('special holiday to rest day: break and 06:00 boundary correctly remove unpaid time', () => {
  const r = compute([shift({ start: '21:00', end: '07:00', dayType: 'specialHoliday', nextDayType: 'rest', breakStart: '23:30', breakEnd: '00:30' })]);
  assert.deepEqual([r.paidHours, r.unpaidHours, r.basic, r.premium, r.night, total(r)], [9, 1, 900, 270, 91, 1261]);
  assert.equal(r.segments.find(s => s.start === '06:00').night, 0);
});

test('regular holiday on rest day with night overtime multiplies rather than duplicating basic', () => {
  const r = compute([shift({ start: '20:00', end: '23:00', dayType: 'regularRest', overtimeStart: '22:00', overtimeEnd: '23:00' })]);
  assert.deepEqual([r.basic, r.premium, r.overtime, r.night, total(r)], [300, 480, 78, 33.8, 891.8]);
  assert.equal(r.segments.at(-1).overtimeFactor, 1.3);
  const result = calculate({ shiftCalculation: r, insurance: false, health: false, hdmf: false });
  const earnings = Object.fromEntries(result.earnings);
  assert.equal(earnings['Regular holiday premium'], 300);
  assert.equal(earnings['Holiday/rest-day overlap premium'], 180);
  assert.equal(result.gross, 891.8);
  assert.ok(reportRows(result, false).some(([label]) => label.includes('2026-11-01 22:00-23:00')));
  const minimumWage = calculate({ shiftCalculation: r, minimumWage: true, insurance: false, health: false, hdmf: false });
  assert.equal(minimumWage.exclusions, 711.8);
});

test('only cutoff calendar hours count, including overnight shift starting before cutoff', () => {
  const r = compute([shift()], { cutoffStart: '2026-11-02', cutoffEnd: '2026-11-02' });
  assert.deepEqual([r.paidHours, r.basic, r.premium, r.night, total(r)], [6, 600, 600, 120, 1320]);
});

test('multiple shifts and paid-hours basic integrate once with allowances and deductions', () => {
  const s = compute([
    shift({ start: '08:00', end: '10:00', dayType: 'ordinary' }),
    shift({ date: '2026-11-02', start: '08:00', end: '10:00', dayType: 'specialRest' }),
  ], { absenceHours: 2 });
  assert.deepEqual([s.basic, s.premium, s.unpaidValue], [400, 100, 200]);
  const r = calculate({ frequency: 'semi', shiftCalculation: s, allowances: true, allowanceAmount: 50, insurance: false, health: false, hdmf: false });
  assert.equal(r.gross, 550);
  assert.equal(r.net, 550);
});

test('invalid classifications, ambiguous intervals, and overlaps fail rather than assume', () => {
  assert.throws(() => compute([shift({ nextDayType: '' })]), /day type/);
  assert.throws(() => compute([shift(), shift({ start: '23:00', end: '23:30' })]), /overlaps/);
  assert.throws(() => compute([shift({ breakStart: '20:00', breakEnd: '21:00' })]), /inside the shift/);
  assert.throws(() => compute([shift({ start: '21:00', end: '21:00' })]), /shorter than 24/);
  assert.throws(() => compute([shift()], { nightRate: 5 }), ShiftError);
});
