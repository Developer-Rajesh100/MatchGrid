import React from 'react';
import { formatTime } from '../../utils/time';

const STATE = {
  live: 'Live',
  halftime: 'Half time',
  full_time: 'Full time',
  upcoming: 'Not started',
  cancelled: 'Cancelled',
};

/** mm:ss in the tabular numeral face, with the state spelled out (colour is never the only signal). */
export function MatchClock({ seconds = 0, status = 'upcoming', isHalfTime = false, unknown = false, size = 'md' }) {
  const state = status === 'live' && isHalfTime ? 'halftime' : status;
  return (
    <span className={`match-clock match-clock--${size} match-clock--${state}`}>
      <span className="match-clock__time num">{unknown ? '--:--' : formatTime(seconds)}</span>
      <span className="match-clock__state">{STATE[state] || ''}</span>
    </span>
  );
}

export default MatchClock;
