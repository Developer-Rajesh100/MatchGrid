import { describe, expect, it } from 'vitest';
import { formatDay, formatWhen } from './dates';
import { stageLabel } from './matchLabels';

const NOW = new Date(2026, 10, 25, 15, 0); // Wed 25 Nov 2026, local

describe('formatDay', () => {
  it('names the days around today', () => {
    expect(formatDay('2026-11-25', NOW)).toBe('Today');
    expect(formatDay('2026-11-26', NOW)).toBe('Tomorrow');
    expect(formatDay('2026-11-24', NOW)).toBe('Yesterday');
  });

  it('uses weekday and day for the rest of the year, and adds the year for other years', () => {
    expect(formatDay('2026-11-28', NOW)).toBe('Sat 28 Nov');
    expect(formatDay('2026-01-02', NOW)).toBe('Fri 2 Jan');
    expect(formatDay('2025-03-09', NOW)).toBe('9 Mar 2025');
    expect(formatDay('2027-01-15', NOW)).toBe('15 Jan 2027');
  });

  it('never leaks a raw ISO string and tolerates missing or malformed input', () => {
    for (const d of ['2026-11-28', '2025-03-09', '2026-11-25']) expect(formatDay(d, NOW)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(formatDay(null, NOW)).toBe('');
    expect(formatDay('soon', NOW)).toBe('');
    expect(formatDay('2026-13-45x', NOW)).toBe('');
  });
});

describe('formatWhen', () => {
  it('joins the day and the kick-off time', () => {
    expect(formatWhen('2026-11-25', '18:30', NOW)).toBe('Today 18:30');
    expect(formatWhen('2026-11-28', '16:00', NOW)).toBe('Sat 28 Nov 16:00');
    expect(formatWhen('2026-11-28', null, NOW)).toBe('Sat 28 Nov');
    expect(formatWhen(null, '16:00', NOW)).toBe('16:00');
  });
});

describe('stageLabel', () => {
  it('prefers the organizer label, then falls back to the stage', () => {
    expect(stageLabel({ label: 'Charity Cup', stage: 'extra' })).toBe('Charity Cup');
    expect(stageLabel({ stage: 'group', group_name: 'B' })).toBe('Group B');
    expect(stageLabel({ stage: 'group' })).toBe('Group stage');
    expect(stageLabel({ stage: 'quarter' })).toBe('Quarter-final');
    expect(stageLabel({ stage: 'semi' })).toBe('Semi-final');
    expect(stageLabel({ stage: 'final' })).toBe('Final');
    expect(stageLabel({ stage: 'extra' })).toBe('Friendly');
    expect(stageLabel(null)).toBe('');
  });
});
