import React from 'react';
import { NavLink } from 'react-router-dom';
import { Trophy, Calendar, BarChart3, GitFork, Shield, Flame, Radio } from 'lucide-react';
import { useTournament } from '../../context/TournamentContext';

export function TournamentSubNav() {
  const { tournament, slug } = useTournament();

  if (!tournament && !slug) return null;

  const basePath = `/t/${slug}`;
  const status = (tournament?.status || 'UPCOMING').toUpperCase();
  const isLive = (tournament?.live_matches_count || 0) > 0 || status === 'LIVE';

  const subLinks = [
    { to: basePath, label: 'Overview', icon: Trophy, end: true },
    { to: `${basePath}/matches`, label: 'Matches', icon: Calendar },
    { to: `${basePath}/standings`, label: 'Standings', icon: BarChart3 },
    { to: `${basePath}/bracket`, label: 'Bracket', icon: GitFork },
    { to: `${basePath}/teams`, label: 'Teams', icon: Shield },
    { to: `${basePath}/stats`, label: 'Stats', icon: Flame },
  ];

  return (
    <div className="tournament-subnav-container">
      <div className="tournament-subnav-inner">
        {/* Left: Tournament Header Meta */}
        <div className="tournament-subnav-meta">
          <div className="tournament-avatar-wrap">
            {tournament?.logo_url ? (
              <img
                src={tournament.logo_url}
                alt={tournament.name}
                className="tournament-subnav-avatar"
              />
            ) : (
              <div className="tournament-avatar-placeholder">
                <Trophy size={18} />
              </div>
            )}
          </div>

          <div className="tournament-subnav-titles">
            <div className="tournament-subnav-row">
              <h1 className="tournament-subnav-title">
                {tournament?.name || slug}
              </h1>
              {isLive ? (
                <span className="pill pill-live pill-xs">
                  <Radio size={10} className="pulse-icon" /> LIVE
                </span>
              ) : (
                <span className={`pill pill-${status.toLowerCase()} pill-xs`}>
                  {status}
                </span>
              )}
            </div>
            <div className="tournament-subnav-subtitle">
              {tournament?.season && <span>{tournament.season} &bull; </span>}
              <span>{tournament?.stage?.toUpperCase() || 'STAGE'}</span>
            </div>
          </div>
        </div>

        {/* Right / Scrollable Bottom: Subnav Tabs */}
        <nav className="tournament-subnav-tabs" aria-label="Tournament navigation">
          {subLinks.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `tournament-subnav-tab ${isActive ? 'active' : ''}`
              }
            >
              <Icon size={14} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}

export default TournamentSubNav;
