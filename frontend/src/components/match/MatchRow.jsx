import React from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusPill } from '../common/StatusPill';
import { Avatar } from '../common/Avatar';
import { Calendar, Clock, MapPin } from 'lucide-react';

export function MatchRow({ match, showVenue = false }) {
  const navigate = useNavigate();

  const isPlayed = match.status === 'full_time' || match.status === 'live' || match.status === 'completed';
  const team1Name = match.team1_name || 'TBD';
  const team2Name = match.team2_name || 'TBD';

  const label =
    match.label ||
    (match.group_name ? `Group ${match.group_name}` : match.stage === 'semi' ? 'Semi-final' : match.stage === 'final' ? 'Final' : match.stage === 'extra' ? 'Friendly' : '');

  const getTeamLogo = (name, logoUrl) =>
    logoUrl || (name && name !== 'TBD' ? `/assets/teams/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}.png` : null);

  return (
    <div
      className="match-row"
      onClick={() => navigate(`/matches/${match.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') navigate(`/matches/${match.id}`);
      }}
    >
      <div className="match-teams">
        <div style={{ fontSize: '11px', color: 'var(--chalk-muted)', fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', marginBottom: '2px' }}>
          Match #{match.match_number} {label ? `· ${label}` : ''}
        </div>

        {/* Team 1 */}
        <div className="match-team">
          <div className="match-team-info">
            <Avatar name={team1Name} photoUrl={getTeamLogo(team1Name, match.team1_logo)} size={24} color="#f0a53d" />
            <span
              className="match-team-name"
              style={{
                fontWeight: match.winner_id === match.team1_id ? 700 : 500,
                color: match.winner_id === match.team1_id ? 'var(--chalk)' : 'inherit',
              }}
            >
              {team1Name}
            </span>
          </div>
          <span className="match-score">
            {isPlayed && match.score1 !== null ? match.score1 : '-'}
          </span>
        </div>

        {/* Team 2 */}
        <div className="match-team">
          <div className="match-team-info">
            <Avatar name={team2Name} photoUrl={getTeamLogo(team2Name, match.team2_logo)} size={24} color="#3ecf6e" />
            <span
              className="match-team-name"
              style={{
                fontWeight: match.winner_id === match.team2_id ? 700 : 500,
                color: match.winner_id === match.team2_id ? 'var(--chalk)' : 'inherit',
              }}
            >
              {team2Name}
            </span>
          </div>
          <span className="match-score">
            {isPlayed && match.score2 !== null ? match.score2 : '-'}
          </span>
        </div>
      </div>

      <div className="match-meta">
        <StatusPill status={match.status} isHalfTime={Boolean(match.is_half_time)} />
        {match.status === 'live' && (
          <div
            className="match-live-timer-indicator"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              marginTop: '5px',
              fontSize: '11px',
              fontWeight: 700,
              color: match.is_half_time ? 'var(--amber)' : 'var(--green)',
            }}
          >
            <Clock size={11} />
            <span>{match.is_half_time ? 'Half Time' : 'Live Match'}</span>
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
