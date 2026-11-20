export const DAY_TYPES = {
  ordinary: { label: 'Regular working day', multiplier: 1, overtime: 1.25 },
  regularHoliday: { label: 'Regular holiday', multiplier: 2, overtime: 1.3 },
  specialHoliday: { label: 'Special non-working holiday', multiplier: 1.3, overtime: 1.3 },
  specialWorking: { label: 'Special working day', multiplier: 1, overtime: 1.25 },
  rest: { label: 'Rest day', multiplier: 1.3, overtime: 1.3 },
  regularRest: { label: 'Regular holiday on rest day', multiplier: 2.6, overtime: 1.3 },
  specialRest: { label: 'Special non-working holiday on rest day', multiplier: 1.5, overtime: 1.3 },
};

const money = value => Math.round((value + Number.EPSILON) * 100 + 1e-8) / 100;
const time = value => {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value || '')) throw new ShiftError('Enter valid start and end times.');
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
};
const dateNumber = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw new ShiftError('Enter valid cutoff and shift dates.');
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) throw new ShiftError('Enter valid calendar dates.');
  return parsed / 60000;
};
const dateText = minute => new Date(Math.floor(minute / 1440) * 86400000).toISOString().slice(0, 10);
const clock = minute => {
  const value = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
};
export class ShiftError extends Error {}

function interval(startText, endText, shiftStart, shiftEnd, label) {
  if (!startText && !endText) return null;
  if (!startText || !endText) throw new ShiftError(`Enter both ${label} times, or leave both blank.`);
  const midnight = Math.floor(shiftStart / 1440) * 1440;
  let start = midnight + time(startText);
  if (start < shiftStart) start += 1440;
  let end = midnight + time(endText);
  if (end <= start) end += 1440;
  if (start < shiftStart || end > shiftEnd || start >= end) throw new ShiftError(`${label} must be inside the shift and shorter than 24 hours.`);
  return [start, end];
}

export function calculateShifts({ cutoffStart, cutoffEnd, shifts, multipliers, nightRate, hourlyRate, absenceHours = 0 }) {
  const startCutoff = dateNumber(cutoffStart);
  const endCutoff = dateNumber(cutoffEnd) + 1440;
  if (endCutoff <= startCutoff) throw new ShiftError('The cutoff end cannot be before its start.');
  if (!Array.isArray(shifts) || !shifts.length) throw new ShiftError('Add at least one shift.');
  if (!Number.isFinite(hourlyRate) || hourlyRate < 0 || !Number.isFinite(nightRate) || nightRate < 10 || nightRate > 100) throw new ShiftError('Enter a valid hourly rate and a night rate from 10% to 100%.');
  if (!Number.isFinite(absenceHours) || absenceHours < 0 || absenceHours > 744) throw new ShiftError('Enter valid unpaid absence/undertime hours.');
  for (const [key, config] of Object.entries(DAY_TYPES)) {
    const rule = multipliers[key];
    if (!rule || !Number.isFinite(rule.multiplier) || rule.multiplier < config.multiplier || rule.multiplier > 10 ||
      !Number.isFinite(rule.overtime) || rule.overtime < config.overtime || rule.overtime > 10) {
      throw new ShiftError(`Check ${config.label} multipliers against the displayed minimums.`);
    }
  }
  const segments = [];
  const intervals = [];
  const calendar = new Map();
  for (const [index, shift] of shifts.entries()) {
    const shiftStart = dateNumber(shift.date) + time(shift.start);
    let shiftEnd = dateNumber(shift.date) + time(shift.end);
    if (shiftEnd <= shiftStart) shiftEnd += 1440;
    if (shiftEnd - shiftStart >= 1440) throw new ShiftError(`Shift ${index + 1} must be shorter than 24 hours.`);
    if (intervals.some(([start, end]) => shiftStart < end && shiftEnd > start)) throw new ShiftError(`Shift ${index + 1} overlaps another shift.`);
    intervals.push([shiftStart, shiftEnd]);
    const midnight = dateNumber(shift.date) + 1440;
    const days = [[shift.date, shift.dayType]];
    if (shiftEnd > midnight && midnight < endCutoff && shiftEnd > startCutoff) days.push([dateText(midnight), shift.nextDayType]);
    for (const [date, type] of days) {
      const dateMinute = dateNumber(date);
      if (dateMinute >= endCutoff || dateMinute + 1440 <= startCutoff) continue;
      if (!Object.hasOwn(DAY_TYPES, type)) throw new ShiftError(`Select the day type for ${date} in shift ${index + 1}.`);
      if (calendar.has(date) && calendar.get(date) !== type) throw new ShiftError(`Conflicting day types for ${date}.`);
      calendar.set(date, type);
    }
    const unpaid = interval(shift.breakStart, shift.breakEnd, shiftStart, shiftEnd, 'Unpaid break');
    const overtime = interval(shift.overtimeStart, shift.overtimeEnd, shiftStart, shiftEnd, 'Overtime');
    const points = [shiftStart, shiftEnd, startCutoff, endCutoff, midnight, midnight - 1080, midnight - 120, midnight + 360, midnight + 1320,
      ...(unpaid || []), ...(overtime || [])].filter(value => value >= shiftStart && value <= shiftEnd);
    const boundaries = [...new Set(points)].sort((a, b) => a - b);
    for (let j = 0; j < boundaries.length - 1; j++) {
      const a = boundaries[j], b = boundaries[j + 1];
      if (a < startCutoff || a >= endCutoff) continue;
      const date = dateText(a);
      const type = calendar.get(date);
      if (!type) throw new ShiftError(`Select the day type for ${date}.`);
      const unpaidSegment = unpaid && a >= unpaid[0] && b <= unpaid[1];
      const isOT = !!overtime && a >= overtime[0] && b <= overtime[1];
      const local = a % 1440;
      const isNight = local < 360 || local >= 1320;
      const hours = (b - a) / 60;
      const { multiplier, overtime: overtimeFactor } = multipliers[type];
      const basic = unpaidSegment ? 0 : money(hours * hourlyRate);
      const premium = unpaidSegment ? 0 : money(hours * hourlyRate * (multiplier - 1));
      const ot = unpaidSegment || !isOT ? 0 : money(hours * hourlyRate * multiplier * (overtimeFactor - 1));
      const night = unpaidSegment || !isNight ? 0 : money(hours * hourlyRate * multiplier * (isOT ? overtimeFactor : 1) * nightRate / 100);
      segments.push({ date, start: clock(a), end: b % 1440 === 0 ? '24:00' : clock(b), hours, type, label: DAY_TYPES[type].label,
        hourlyRate, multiplier, overtimeFactor: isOT ? overtimeFactor : 1, nightRate: isNight ? nightRate : 0,
        unpaid: !!unpaidSegment, basic, premium, overtime: ot, night });
    }
  }
  if (!segments.length) throw new ShiftError('No shift hours fall within the selected cutoff.');
  const total = field => money(segments.reduce((sum, segment) => sum + segment[field], 0));
  const unpaidHours = segments.reduce((sum, segment) => sum + (segment.unpaid ? segment.hours : 0), 0);
  return {
    segments, basic: total('basic'), premium: total('premium'), overtime: total('overtime'), night: total('night'),
    paidHours: segments.reduce((sum, segment) => sum + (segment.unpaid ? 0 : segment.hours), 0),
    unpaidHours, absenceHours, unpaidValue: money((unpaidHours + absenceHours) * hourlyRate),
  };
}
