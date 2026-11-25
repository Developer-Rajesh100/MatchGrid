import React from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusPill } from '../common/StatusPill';
import { Avatar } from '../common/Avatar';
import { Calendar, Clock, MapPin, Activity } from 'lucide-react';
import { useTournament } from '../../context/TournamentContext';
import { tPath } from '../../utils/paths';

export function MatchRow({ match, showVenue = false }) {
  const navigate = useNavigate();
  const { slug: contextSlug } = useTournament();
  const slug = match.tournament_slug || contextSlug;

  const isPlayed = match.status === 'full_time' || match.status === 'live' || match.status === 'completed';
  const team1Name = match.team1_name || 'TBD';
  const team2Name = match.team2_name || 'TBD';

  const label =
    match.label ||
    (match.group_name
      ? `Group ${match.group_name}`
      : match.stage === 'semi'
      ? 'Semi-final'
      : match.stage === 'final'
      ? 'Final'
      : match.stage === 'extra'
      ? 'Friendly'
      : '');

  const isLive = match.status === 'live';

  return (
    <div
      className="match-row"
      onClick={() => navigate(tPath(slug, `matches/${match.id}`))}
      role="button"
      tabIndex={0}
      style={{
        borderLeft: isLive
          ? '4px solid var(--status-live)'
          : match.status === 'full_time'
          ? '4px solid var(--brand-primary)'
          : '4px solid var(--border-subtle)',
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') navigate(tPath(slug, `matches/${match.id}`));
      }}
    >
      <div className="match-teams">
        <div
          style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            fontWeight: 700,
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            marginBottom: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span>Match #{match.match_number}</span>
          {label && <span>&bull; {label}</span>}
        </div>

        {/* Team 1 */}
        <div className="match-team">
          <div className="match-team-info">
            <Avatar
              name={team1Name}
              photoUrl={match.team1_logo}
              size={26}
              color={match.team1_color || '#10B981'}
            />
            <span
              className="match-team-name"
              style={{
                fontWeight: match.winner_id === match.team1_id ? 700 : 500,
                color: match.winner_id === match.team1_id ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              {team1Name}
            </span>
          </div>
          <span className="match-score">
            {isPlayed && match.score1 !== null ? match.score1 : '—'}
          </span>
        </div>

        {/* Team 2 */}
        <div className="match-team">
          <div className="match-team-info">
            <Avatar
              name={team2Name}
              photoUrl={match.team2_logo}
              size={26}
              color={match.team2_color || '#34D399'}
            />
            <span
              className="match-team-name"
              style={{
                fontWeight: match.winner_id === match.team2_id ? 700 : 500,
                color: match.winner_id === match.team2_id ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              {team2Name}
            </span>
          </div>
          <span className="match-score">
            {isPlayed && match.score2 !== null ? match.score2 : '—'}
          </span>
        </div>
      </div>

      <div className="match-meta">
        <StatusPill status={match.status} isHalfTime={Boolean(match.is_half_time)} />
        {isLive && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              marginTop: '5px',
              fontSize: '11px',
              fontWeight: 700,
              color: match.is_half_time ? 'var(--accent-gold)' : 'var(--status-live)',
            }}
          >
            <Activity size={12} className={match.is_half_time ? '' : 'pulse-live'} />
            <span>{match.is_half_time ? 'Half Time' : 'In Progress'}</span>
          </div>
        )}
        {match.date && (
          <div className="match-date-time" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px' }}>
            <Calendar size={11} /> {match.date}
          </div>
        )}
        {match.time && (
          <div className="match-date-time" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={11} /> {match.time}
          </div>
        )}
        {showVenue && match.venue && (
          <div className="match-date-time" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <MapPin size={11} /> {match.venue}
          </div>
        )}
      </div>
    </div>
  );
}
export default MatchRow;
