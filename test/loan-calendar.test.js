const assert = require('node:assert/strict');
const { test } = require('node:test');
const { addBusinessDays, countLateBusinessDays } = require('../loan-calendar');

test('loan due dates count weekdays and skip registered holidays', () => {
  assert.equal(addBusinessDays('2026-11-13', 7), '2026-11-24');
  assert.equal(addBusinessDays('2026-11-13', 7, new Set(['2026-11-16'])), '2026-11-25');
});

test('late days begin after the deadline and exclude weekends and holidays', () => {
  assert.equal(countLateBusinessDays('2026-11-13', '2026-11-15'), 0);
  assert.equal(countLateBusinessDays('2026-11-13', '2026-11-16'), 1);
  assert.equal(countLateBusinessDays('2026-11-13', '2026-11-16', new Set(['2026-11-16'])), 0);
});

test('loan calendar rejects invalid dates and durations', () => {
  assert.throws(() => addBusinessDays('2026-02-30', 7), /fecha no es válida/);
  assert.throws(() => addBusinessDays('2026-11-13', 0), /entre 1 y 90/);
});
