// The API's match lifecycle is upcoming -> live -> full_time, or cancelled.

export const isLive = (match) => match?.status === 'live';
export const isFullTime = (match) => match?.status === 'full_time';
/** Kicked off: live now or finished, so a score is meaningful. */
export const isPlayed = (match) => isLive(match) || isFullTime(match);
/** Nothing left to do on it: finished or called off. */
export const isClosed = (match) => isFullTime(match) || match?.status === 'cancelled';
