function parseIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError('La fecha debe tener formato YYYY-MM-DD');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (date.toISOString().slice(0, 10) !== value) {
    throw new TypeError('La fecha no es válida');
  }
  return date;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function isBusinessDay(date, holidays) {
  const day = date.getUTCDay();
  return day !== 0 && day !== 6 && !holidays.has(isoDate(date));
}

function addBusinessDays(startDate, days, holidays = new Set()) {
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    throw new RangeError('El plazo debe estar entre 1 y 90 días hábiles');
  }
  const date = parseIsoDate(startDate);
  let counted = 0;
  while (counted < days) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (isBusinessDay(date, holidays)) counted += 1;
  }
  return isoDate(date);
}

function countLateBusinessDays(dueDate, throughDate, holidays = new Set()) {
  const date = parseIsoDate(dueDate);
  const endDate = parseIsoDate(throughDate);
  let counted = 0;
  while (date < endDate) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (date <= endDate && isBusinessDay(date, holidays)) counted += 1;
  }
  return counted;
}

module.exports = { addBusinessDays, countLateBusinessDays, parseIsoDate };
