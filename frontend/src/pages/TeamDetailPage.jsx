import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { teamsApi } from '../api/teams';
import { playersApi } from '../api/players';
import { matchesApi } from '../api/matches';
import { Avatar } from '../components/common/Avatar';
import { MatchRow } from '../components/match/MatchRow';
import { LoadingState, ErrorState } from '../components/common/Common';
import { ArrowLeft, Users, Calendar } from 'lucide-react';

export function TeamDetailPage() {
  const { teamId } = useParams();
  const navigate = useNavigate();
  const [team, setTeam] = useState(null);
  const [players, setPlayers] = useState([]);
  const [teamMatches, setTeamMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      teamsApi.getTeam(teamId),
      playersApi.getPlayers({ team_id: teamId }),
      matchesApi.getMatches({ team_id: teamId }),
    ])
      .then(([tData, pData, mData]) => {
        setTeam(tData);
        setPlayers(pData || []);
        setTeamMatches(mData || []);
      })
      .catch((err) => setError(err.message || 'Failed to load team details'))
      .finally(() => setLoading(false));
  }, [teamId]);

  if (loading) return <LoadingState message="Loading squad & fixtures..." />;
  if (error || !team) return <ErrorState message={error || 'Team not found'} />;

  // Manager(s) get their own section; everyone else is listed by jersey number
  const managers = players.filter((p) => p.is_manager);
  const squadPlayers = players.filter((p) => !p.is_manager).sort((a, b) => a.number - b.number);

  const getTeamLogo = (name, logoUrl) =>
    logoUrl || (name ? `/assets/teams/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}.png` : null);

  return (
    <div>
      <button
        onClick={() => navigate('/teams')}
        className="btn btn-outline btn-sm"
        style={{ marginBottom: '16px' }}
      >
        <ArrowLeft size={13} /> Back to Teams
      </button>

      {/* Team Header Card */}
      <div
        className="card"
        style={{
          borderLeft: `6px solid ${team.color || 'var(--amber)'}`,
          marginBottom: '28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '20px',
          flexWrap: 'wrap',
          padding: '24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <Avatar name={team.name} size={64} color={team.color || '#f0a53d'} photoUrl={getTeamLogo(team.name, team.logo_url)} />
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '30px', fontWeight: 700, margin: 0 }}>
              {team.name}
            </h2>
            <div style={{ fontSize: '13px', color: 'var(--chalk-dim)', marginTop: '4px', display: 'flex', gap: '12px' }}>
              <span>Group {team.group_name || 'TBD'}</span>
              <span>•</span>
              <span>{players.length} Registered Players</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <div className="stat-tile" style={{ minWidth: '90px', padding: '8px 14px' }}>
            <div className="stat-tile-val">{teamMatches.length}</div>
            <div className="stat-tile-lbl">Matches</div>
          </div>
        </div>
      </div>

      {/* Squad Roster */}
      <div style={{ marginBottom: '32px' }}>
        <div className="section-title">
          <h2><Users size={22} color="var(--amber)" /> Team Squad ({players.length})</h2>
          <p>Click on any player to view their profile and stats</p>
        </div>

        {managers.length > 0 && (
          <div className="squad-group">
            <div className="squad-group-title">Manager{managers.length > 1 ? 's' : ''}</div>
            <div className="squad-grid">
              {managers.map((m) => (
                <div
                  key={m.id}
                  className="squad-card squad-card-manager"
                  style={{ '--squad-accent': team.color || 'var(--amber)' }}
                  role="link"
                  tabIndex={0}
                  onClick={() => navigate(`/players/${m.id}`)}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/players/${m.id}`)}
                >
                  <Avatar name={m.name} size={52} photoUrl={m.photo_url} />
                  <div className="squad-info">
                    <div className="squad-name"><span>{m.name}</span></div>
                    <div className="squad-id">{m.dcl_id || ''}</div>
                  </div>
                  <span className="squad-badge-manager">MANAGER</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="squad-group">
          <div className="squad-group-title">Players ({squadPlayers.length})</div>
          <div className="squad-grid">
            {squadPlayers.map((player, i) => (
              <div
                key={player.id}
                className="squad-card"
                style={{ '--squad-accent': team.color || 'var(--amber)' }}
                role="link"
                tabIndex={0}
                onClick={() => navigate(`/players/${player.id}`)}
                onKeyDown={(e) => e.key === 'Enter' && navigate(`/players/${player.id}`)}
              >
                <span className="squad-serial">{i + 1}</span>
                <Avatar name={player.name} size={40} photoUrl={player.photo_url} />
                <div className="squad-info">
                  <div className="squad-name"><span>{player.name}</span></div>
                  <div className="squad-id">{player.dcl_id || ''}</div>
                </div>
              </div>
            ))}
            {squadPlayers.length === 0 && (
              <div className="card" style={{ textAlign: 'center', color: 'var(--chalk-dim)', padding: '24px', gridColumn: '1 / -1' }}>
                No players registered yet.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Team Matches */}
      <div>
        <div className="section-title">
          <h2><Calendar size={22} color="var(--amber)" /> Matches & Schedule</h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {teamMatches.map((m) => (
            <MatchRow key={m.id} match={m} showVenue />
          ))}
          {teamMatches.length === 0 && (
            <div className="card" style={{ textAlign: 'center', color: 'var(--chalk-dim)', padding: '24px' }}>
              No matches scheduled yet for this team.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
