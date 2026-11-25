import { describe, expect, it } from 'vitest';
import { clockOffsetMs, matchElapsedSeconds } from './clock';

const at = (iso) => Date.parse(iso);

describe('server-authoritative match clock', () => {
  it('measures the offset between the device clock and server_now', () => {
    const match = { server_now: '2026-01-01T14:00:00Z' };
    expect(clockOffsetMs(match, at('2026-01-01T12:00:00Z'))).toBe(2 * 3600 * 1000);
    expect(clockOffsetMs({}, 123)).toBe(0); // no server time: fall back to the device clock
  });

  it('computes live elapsed time identically on a fast, slow or correct device clock', () => {
    const match = { status: 'live', started_at: '2026-01-01T13:50:00Z', server_now: '2026-01-01T14:00:00Z' };
    for (const deviceNow of ['2026-01-01T12:00:00Z', '2026-01-01T14:00:00Z', '2026-01-01T16:30:00Z']) {
      const offset = clockOffsetMs(match, at(deviceNow));
      expect(matchElapsedSeconds(match, offset, at(deviceNow))).toBe(600);
    }
  });

  it('keeps counting from the offset as time passes', () => {
    const match = { status: 'live', started_at: '2026-01-01T13:50:00Z', server_now: '2026-01-01T14:00:00Z' };
    const offset = clockOffsetMs(match, at('2026-01-01T09:00:00Z'));
    expect(matchElapsedSeconds(match, offset, at('2026-01-01T09:00:30Z'))).toBe(630);
  });

  it('freezes at the stored elapsed time during half time and after full time', () => {
    expect(matchElapsedSeconds({ status: 'live', is_half_time: true, elapsed_seconds: 1500, started_at: '2026-01-01T00:00:00Z' }, 0, at('2030-01-01T00:00:00Z'))).toBe(1500);
    expect(
      matchElapsedSeconds({ status: 'full_time', started_at: '2026-01-01T13:00:00Z', ended_at: '2026-01-01T13:50:00Z' })
    ).toBe(3000);
    expect(matchElapsedSeconds({ status: 'full_time' })).toBeNull(); // duration never recorded
    expect(matchElapsedSeconds({ status: 'upcoming' })).toBe(0);
    expect(matchElapsedSeconds({ status: 'cancelled' })).toBe(0);
  });

  it('never goes negative if the device clock lags the kickoff', () => {
    const match = { status: 'live', started_at: '2026-01-01T14:00:00Z' };
    expect(matchElapsedSeconds(match, 0, at('2026-01-01T13:59:00Z'))).toBe(0);
  });
});
