import React from 'react';
import { Avatar } from './Avatar';

/**
 * A team as it appears in lists and scoreboards: crest, name, and the team's colour as a sharp
 * 3px vertical bar (never a tinted background).
 */
export function TeamMark({ name, color = '#64748B', crestUrl = null, size = 28, sub = null, align = 'left', bar = true }) {
  return (
    <span
      className={`team-mark team-mark--${align} ${bar ? 'team-mark--bar' : ''}`}
      style={{ '--team-color': color && color.startsWith('#') ? color : '#64748B' }}
    >
      <Avatar name={name} crestUrl={crestUrl} color={color} size={size} />
      <span className="team-mark__text">
        <span className="team-mark__name">{name || 'TBD'}</span>
        {sub && <span className="team-mark__sub">{sub}</span>}
      </span>
    </span>
  );
}

export default TeamMark;
