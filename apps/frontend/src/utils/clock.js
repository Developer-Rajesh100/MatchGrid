// Server-authoritative match clock.
//
// The backend returns `server_now` (its UTC clock) with every match. A client measures how far its own
// clock is from that once per response and applies the offset, so the displayed minute is correct
// even on a device whose clock is minutes off — and identical on every device. No local storage is used.

/** Milliseconds to add to Date.now() to get server time, from a match payload's `server_now`. */
export function clockOffsetMs(match, receivedAtMs = Date.now()) {
  const server = match?.server_now ? Date.parse(match.server_now) : NaN;
  return Number.isNaN(server) ? 0 : server - receivedAtMs;
}

/**
 * Elapsed match seconds from server fields only, or null when the duration of a finished match
 * was never recorded.
 */
export function matchElapsedSeconds(match, offsetMs = 0, nowMs = Date.now()) {
  if (!match || match.status === 'upcoming' || match.status === 'cancelled') return 0;

  if (match.status === 'full_time') {
    if (match.started_at && match.ended_at) {
      return Math.max(0, Math.floor((Date.parse(match.ended_at) - Date.parse(match.started_at)) / 1000));
    }
    return typeof match.elapsed_seconds === 'number' ? match.elapsed_seconds : null;
  }

  // live
  if (match.is_half_time) return match.elapsed_seconds || 0;
  if (match.started_at) {
    return Math.max(0, Math.floor((nowMs + offsetMs - Date.parse(match.started_at)) / 1000));
  }
  return match.elapsed_seconds || 0;
}

/** "37'" for a live match, "HT" at half time, "FT" when finished, '' before kick-off. */
export function minuteLabel(match, offsetMs = 0, nowMs = Date.now()) {
  if (!match) return '';
  if (match.status === 'full_time') return 'FT';
  if (match.status !== 'live') return '';
  if (match.is_half_time) return 'HT';
  const seconds = matchElapsedSeconds(match, offsetMs, nowMs) || 0;
  return `${Math.max(1, Math.floor(seconds / 60) + 1)}'`;
}
