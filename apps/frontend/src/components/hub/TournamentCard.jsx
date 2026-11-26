import React from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Radio } from 'lucide-react';

const STAGE_NAMES = {
  group: 'Group stage',
  quarters: 'Quarter-finals',
  semis: 'Semi-finals',
  final: 'Final',
  champions: 'Completed',
};

function formatSeason(season) {
  if (!season) return '';
  return /^\d{4}$/.test(String(season)) ? String(season) : `Season ${season}`;
}

export function StatusBadge({ status, live }) {
  if (live) {
    return (
      <span className="pill pill-live pill-xs">
        <Radio size={10} aria-hidden="true" /> Live
      </span>
    );
  }
  const key = (status || 'active').toLowerCase();
  const label = { draft: 'Draft', completed: 'Completed' }[key] || 'Active';
  return <span className={`pill pill-${key} pill-xs`}>{label}</span>;
}

/** One row of the tournament directory (kept as `.tournament-card` for the e2e contract). */
export function TournamentCard({ tournament }) {
  if (!tournament) return null;
  const slug = tournament.slug || tournament.id;
  const liveCount = tournament.live_matches_count || 0;
  const byline = [tournament.organizer_name, formatSeason(tournament.season)].filter(Boolean).join(' · ');

  return (
    <Link to={`/t/${slug}`} className="tournament-card directory-row">
      <span className="directory-row__name">
        {tournament.logo_url ? (
          <img src={tournament.logo_url} alt="" className="directory-row__logo" />
        ) : (
          <span className="directory-row__logo directory-row__logo--empty">
            <Trophy size={18} aria-hidden="true" />
          </span>
        )}
        <span className="directory-row__text">
          <span className="directory-row__title" title={tournament.name}>{tournament.name}</span>
          {byline && <span className="directory-row__by">{byline}</span>}
          {tournament.champion_team_name && (
            <span className="directory-row__champion">
              <Trophy size={12} aria-hidden="true" /> Champion: {tournament.champion_team_name}
            </span>
          )}
        </span>
      </span>
      <span className="directory-row__status">
        <StatusBadge status={tournament.status} live={liveCount > 0} />
      </span>
      <span className="directory-row__facts">
        <span className="directory-row__stage">{STAGE_NAMES[tournament.stage] || 'Group stage'}</span>
        <span className="directory-row__n num">
          {tournament.teams_count ?? 0}<span className="directory-row__unit"> clubs</span>
        </span>
        <span className="directory-row__n num">
          {tournament.matches_count ?? 0}<span className="directory-row__unit"> matches</span>
        </span>
        <span className={`directory-row__n num ${liveCount > 0 ? 'is-live' : ''}`}>
          {liveCount}<span className="directory-row__unit"> live</span>
        </span>
      </span>
    </Link>
  );
}

export default TournamentCard;
