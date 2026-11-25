import React from 'react';
import { Goal, Square, Star } from 'lucide-react';

const META = {
  goal: { label: 'Goal', color: 'var(--text-primary)' },
  yellow: { label: 'Yellow card', color: 'var(--event-yellow)' },
  red: { label: 'Red card', color: 'var(--status-live)' },
  potm: { label: 'Player of the match', color: 'var(--accent-gold)' },
};

/** Match-event glyph: a goal, a yellow or red card, or the player-of-the-match star (lucide, no emoji). */
export function EventIcon({ type, size = 16, title = true }) {
  const meta = META[type];
  if (!meta) return <span className="event-icon event-icon--none" aria-hidden="true">•</span>;
  const common = { size, color: meta.color, 'aria-hidden': true, focusable: false };
  let glyph;
  if (type === 'goal') glyph = <Goal {...common} />;
  else if (type === 'potm') glyph = <Star {...common} fill={meta.color} />;
  else glyph = <Square {...common} fill={meta.color} strokeWidth={1.5} />;
  // title={false}: the icon sits next to its own text label, so it is decoration only
  return title ? (
    <span className={`event-icon event-icon--${type}`} role="img" aria-label={meta.label}>
      {glyph}
    </span>
  ) : (
    <span className={`event-icon event-icon--${type}`} aria-hidden="true">
      {glyph}
    </span>
  );
}

export const EVENT_LABELS = Object.fromEntries(Object.entries(META).map(([k, v]) => [k, v.label]));
export default EventIcon;
