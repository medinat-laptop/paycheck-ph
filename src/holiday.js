const DAY_TYPES = {
  ordinary: { label: 'Regular working day', multiplier: 1 },
  specialHoliday: { label: 'Special non-working holiday', multiplier: 1.3 },
  regularHoliday: { label: 'Regular holiday', multiplier: 2 },
};
const round = value => Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 100 + 1e-8) / 100;

export class HolidayCalculationError extends Error {}

function parseTime(value, field, shiftNumber) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value ?? '');
  if (!match) throw new HolidayCalculationError(`Shift ${shiftNumber}: enter a valid ${field}.`);
  return Number(match[1]) * 60 + Number(match[2]);
}

function dateIndex(value, shiftNumber) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) {
    throw new HolidayCalculationError(`Shift ${shiftNumber}: enter a valid work date.`);
  }
  const index = Date.parse(`${value}T00:00:00Z`) / 86400000;
  if (!Number.isInteger(index) || new Date(index * 86400000).toISOString().slice(0, 10) !== value) {
    throw new HolidayCalculationError(`Shift ${shiftNumber}: enter a valid work date.`);
  }
  return index;
}

function breakInterval(shift, base, start, end, shiftNumber) {
  const hasStart = Boolean(shift.breakStart);
  const hasEnd = Boolean(shift.breakEnd);
  if (hasStart !== hasEnd) {
    throw new HolidayCalculationError(`Shift ${shiftNumber}: enter both unpaid break times.`);
  }
  if (!hasStart) return null;

  const breakStartTime = parseTime(shift.breakStart, 'unpaid break start', shiftNumber);
  const breakEndTime = parseTime(shift.breakEnd, 'unpaid break end', shiftNumber);
  const candidates = [base + breakStartTime, base + breakStartTime + 1440]
    .filter(value => value >= start && value < end);
  for (const breakStart of candidates) {
    let breakEnd = base + breakEndTime;
    if (breakEnd <= breakStart) breakEnd += 1440;
    if (breakEnd > breakStart && breakEnd <= end) return [breakStart, breakEnd];
  }
  throw new HolidayCalculationError(`Shift ${shiftNumber}: the unpaid break must fall within the shift.`);
}

function dateFor(index) {
  return new Date(index * 86400000).toISOString().slice(0, 10);
}

function timeFor(minute, end = false) {
  const withinDay = ((minute % 1440) + 1440) % 1440;
  if (end && withinDay === 0) return '24:00';
  return `${String(Math.floor(withinDay / 60)).padStart(2, '0')}:${String(withinDay % 60).padStart(2, '0')}`;
}

export function calculateHolidayPremiums(shifts = [], hourlyRate = 0) {
  if (!Array.isArray(shifts)) throw new HolidayCalculationError('Holiday shifts must be a list.');
  if (!Number.isFinite(hourlyRate) || hourlyRate < 0) {
    throw new HolidayCalculationError('Enter a valid hourly rate for holiday calculations.');
  }

  const entries = shifts.map((shift, index) => {
    const shiftNumber = index + 1;
    const hasInput = ['date', 'dayType', 'start', 'end', 'nextDayType', 'breakStart', 'breakEnd']
      .some(key => Boolean(shift[key]));
    if (!hasInput) return null;

    const baseDay = dateIndex(shift.date, shiftNumber);
    if (!Object.hasOwn(DAY_TYPES, shift.dayType)) {
      throw new HolidayCalculationError(`Shift ${shiftNumber}: select the work-date type.`);
    }
    const start = baseDay * 1440 + parseTime(shift.start, 'shift start', shiftNumber);
    let end = baseDay * 1440 + parseTime(shift.end, 'shift end', shiftNumber);
    if (end <= start) end += 1440;
    if (end - start >= 1440) {
      throw new HolidayCalculationError(`Shift ${shiftNumber}: shift duration must be less than 24 hours.`);
    }
    const nextDayType = shift.nextDayType || '';
    if (end > (baseDay + 1) * 1440 && !Object.hasOwn(DAY_TYPES, nextDayType)) {
      throw new HolidayCalculationError(`Shift ${shiftNumber}: select the succeeding calendar date's type.`);
    }
    const unpaidBreak = breakInterval(shift, baseDay * 1440, start, end, shiftNumber);
    return { shiftNumber, baseDay, start, end, dayType: shift.dayType, nextDayType, unpaidBreak };
  }).filter(Boolean).sort((a, b) => a.start - b.start);

  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index].start < entries[index - 1].end) {
      throw new HolidayCalculationError('Holiday shifts overlap. Correct the shift times before calculating.');
    }
  }

  const segments = [];
  let specialPremium = 0;
  let regularPremium = 0;
  let paidHours = 0;
  let unpaidBreakHours = 0;

  for (const shift of entries) {
    if (shift.unpaidBreak) unpaidBreakHours += (shift.unpaidBreak[1] - shift.unpaidBreak[0]) / 60;
    const boundaries = [shift.start, shift.end];
    const midnight = (Math.floor(shift.start / 1440) + 1) * 1440;
    if (midnight < shift.end) boundaries.push(midnight);
    if (shift.unpaidBreak) boundaries.push(...shift.unpaidBreak);
    boundaries.sort((a, b) => a - b);

    for (let index = 0; index < boundaries.length - 1; index += 1) {
      const start = boundaries[index];
      const end = boundaries[index + 1];
      if (shift.unpaidBreak && start >= shift.unpaidBreak[0] && end <= shift.unpaidBreak[1]) continue;

      const dayIndex = Math.floor(start / 1440);
      const type = dayIndex === shift.baseDay ? shift.dayType : shift.nextDayType;
      const rule = DAY_TYPES[type];
      const hours = (end - start) / 60;
      const basePay = round(hours * hourlyRate);
      const premium = round(hours * hourlyRate * (rule.multiplier - 1));
      paidHours += hours;
      if (type === 'specialHoliday') specialPremium = round(specialPremium + premium);
      if (type === 'regularHoliday') regularPremium = round(regularPremium + premium);
      segments.push({
        date: dateFor(dayIndex),
        start: timeFor(start),
        end: timeFor(end, true),
        dayType: type,
        label: rule.label,
        hours,
        hourlyRate,
        multiplier: rule.multiplier,
        basePay,
        premium,
      });
    }
  }

  return {
    segments,
    paidHours: round(paidHours),
    unpaidBreakHours: round(unpaidBreakHours),
    specialPremium,
    regularPremium,
    totalPremium: round(specialPremium + regularPremium),
  };
}
