import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { StatusPill } from '../common/StatusPill';
import { TeamMark } from '../common/TeamMark';
import { useTournament } from '../../context/TournamentContext';
import { useNow } from '../../hooks/useNow';
import { tPath } from '../../utils/paths';
import { formatDay } from '../../utils/dates';
import { stageLabel } from '../../utils/matchLabels';
import { clockOffsetMs, minuteLabel } from '../../utils/clock';

function TeamLine({ name, color, crest, score, winner, played }) {
  return (
    <div className={`fixture-row__team ${winner ? 'is-winner' : ''}`}>
      <TeamMark name={name} color={color} crestUrl={crest} size={26} />
      <span className="fixture-row__score num">{played && score !== null && score !== undefined ? score : '–'}</span>
    </div>
  );
}

/** One fixture: two team lines with their scores, and its status and kick-off on the side. */
export function MatchRow({ match, showVenue = false }) {
  const navigate = useNavigate();
  const { slug: contextSlug } = useTournament();
  const slug = match.tournament_slug || contextSlug;

  const isLive = match.status === 'live';
  const played = isLive || match.status === 'full_time' || match.status === 'completed';
  const offset = useMemo(() => clockOffsetMs(match, Date.now()), [match]);
  const now = useNow(isLive ? 30000 : 0);
  const open = () => navigate(tPath(slug, `matches/${match.id}`));

  return (
    <div
      className={`fixture-row ${isLive ? 'is-live' : ''}`}
      onClick={open}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
    >
      <div className="fixture-row__main">
        <div className="fixture-row__title">
          <span className="num">Match #{match.match_number}</span>
          {stageLabel(match) && <span>{stageLabel(match)}</span>}
        </div>
        <TeamLine
          name={match.team1_name}
          color={match.team1_color}
          crest={match.team1_crest_url}
          score={match.score1}
          played={played}
          winner={match.winner_id && match.winner_id === match.team1_id}
        />
        <TeamLine
          name={match.team2_name}
          color={match.team2_color}
          crest={match.team2_crest_url}
          score={match.score2}
          played={played}
          winner={match.winner_id && match.winner_id === match.team2_id}
        />
      </div>

      <div className="fixture-row__side">
        <StatusPill status={match.status} isHalfTime={Boolean(match.is_half_time)} />
        {isLive && (
          <span className={`fixture-row__minute num ${match.is_half_time ? 'is-ht' : ''}`}>
            {minuteLabel(match, offset, now)}
          </span>
        )}
        {!isLive && (
          <span className="fixture-row__when">
            <span>{formatDay(match.date)}</span>
            {match.time && <span className="num">{match.time}</span>}
          </span>
        )}
        {showVenue && match.venue && (
          <span className="fixture-row__venue"><MapPin size={11} aria-hidden="true" />{match.venue}</span>
        )}
      </div>
    </div>
  );
}

export default MatchRow;
