import React from 'react';
import { Avatar } from '../common/Avatar';
import { ScoreLine } from '../common/ScoreLine';

function Side({ side, name, color, crestUrl, winner, onClick, size }) {
  const Tag = onClick ? 'button' : 'div';
  const hex = color && color.startsWith('#') ? color : '#64748B';
  return (
    <Tag
      {...(onClick ? { type: 'button', onClick } : {})}
      className={`sb-team sb-team--${side} ${winner ? 'is-winner' : ''}`}
      style={{ '--team-color': hex }}
    >
      <Avatar name={name || 'TBD'} crestUrl={crestUrl} color={hex} size={size} />
      <span className="sb-team__name">{name || 'TBD'}</span>
      {winner && <span className="sb-team__tag">Winner</span>}
    </Tag>
  );
}

/**
 * The one scoreboard: [home] score/state [away], aligned on a single axis at every width.
 * Team colour is the 3px bar on each team's outer edge. `center` renders under the score (a clock, a minute).
 */
export function Scoreboard({ match, variant = 'public', onTeamClick, center = null }) {
  const live = match.status === 'live';
  const played = live || match.status === 'full_time';
  const level = played && match.score1 === match.score2;
  const penaltyWinner =
    level && match.stage !== 'group' && match.winner_id
      ? match.winner_id === match.team1_id ? 'home' : 'away'
      : null;
  const crest = variant === 'hero' ? 48 : 56;

  return (
    <div className={`scoreboard scoreboard--${variant}`}>
      <Side
        side="home"
        name={match.team1_name}
        color={match.team1_color}
        crestUrl={match.team1_crest_url}
        size={crest}
        winner={match.status === 'full_time' && match.winner_id && match.winner_id === match.team1_id}
        onClick={onTeamClick && match.team1_id ? () => onTeamClick(match.team1_id) : undefined}
      />
      <div className="scoreboard__score">
        {played ? (
          <ScoreLine className="hero-score" home={match.score1} away={match.score2} size={variant === 'hero' ? 'lg' : 'xl'} penaltyWinner={penaltyWinner} />
        ) : (
          <span className="scoreboard__vs">vs</span>
        )}
      </div>
      {center && <div className="scoreboard__footer">{center}</div>}
      <Side
        side="away"
        name={match.team2_name}
        color={match.team2_color}
        crestUrl={match.team2_crest_url}
        size={crest}
        winner={match.status === 'full_time' && match.winner_id && match.winner_id === match.team2_id}
        onClick={onTeamClick && match.team2_id ? () => onTeamClick(match.team2_id) : undefined}
      />
    </div>
  );
}

export default Scoreboard;
