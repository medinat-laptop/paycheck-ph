import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculate } from '../src/payroll.js';
import { HolidayCalculationError } from '../src/holiday.js';
import { reportRows } from '../src/reports.js';

const overnightHoliday = {
  date: '2026-11-01',
  dayType: 'regularHoliday',
  start: '21:00',
  end: '06:00',
  nextDayType: 'ordinary',
  breakStart: '01:00',
  breakEnd: '02:00',
};

test('date-based holiday premium splits midnight and excludes breaks without changing 20% night pay', () => {
  const result = calculate({
    companyPayroll: true,
    datedHolidayMode: true,
    frequency: 'semi',
    dailyRate: 1000,
    daysWorked: 1,
    companyNightHours: 4,
    companyNightPremium: 25,
    holidayShifts: [overnightHoliday],
  });

  assert.deepEqual(result.holidayCalculation.segments.map(({ date, start, end, dayType, hours, premium }) =>
    [date, start, end, dayType, hours, premium]), [
    ['2026-11-01', '21:00', '24:00', 'regularHoliday', 3, 375],
    ['2026-11-02', '00:00', '01:00', 'ordinary', 1, 0],
    ['2026-11-02', '02:00', '06:00', 'ordinary', 4, 0],
  ]);
  assert.deepEqual([result.holidayCalculation.paidHours, result.holidayCalculation.unpaidBreakHours,
    result.holidayCalculation.totalPremium], [8, 1, 375]);
  assert.equal(result.earnings.find(([label]) => label === 'Basic salary')[1], 1000);
  assert.equal(result.earnings.find(([label]) => label === 'Regular holiday premium')[1], 375);
  assert.equal(result.earnings.find(([label]) => label === 'Night differential')[1], 100);
  assert.equal(result.gross, 1475);
  assert.ok(reportRows(result, false).some(([label]) => label === '2026-11-01 21:00-24:00 Regular holiday'));
});

test('special holiday premium applies only to actual worked holiday hours', () => {
  const result = calculate({
    companyPayroll: true,
    datedHolidayMode: true,
    frequency: 'semi',
    dailyRate: 1040,
    daysWorked: 1,
    holidayShifts: [{
      date: '2026-11-01',
      dayType: 'specialHoliday',
      start: '21:00',
      end: '06:00',
      nextDayType: 'ordinary',
      breakStart: '01:00',
      breakEnd: '02:00',
    }],
  });
  assert.equal(result.holidayCalculation.specialPremium, 117);
  assert.equal(result.holidayCalculation.regularPremium, 0);
});

test('invalid or overlapping date-based holiday entries fail explicitly', () => {
  const base = { companyPayroll: true, datedHolidayMode: true, frequency: 'semi', dailyRate: 1000, daysWorked: 1 };
  assert.throws(() => calculate({ ...base, holidayShifts: [{ ...overnightHoliday, nextDayType: '' }] }),
    HolidayCalculationError);
  assert.throws(() => calculate({ ...base, holidayShifts: [{ ...overnightHoliday, breakEnd: '' }] }),
    /both unpaid break times/);
  assert.throws(() => calculate({ ...base, holidayShifts: [overnightHoliday, {
    ...overnightHoliday, start: '23:00', end: '23:30', nextDayType: '', breakStart: '', breakEnd: '',
  }] }),
    /overlap/);
});
