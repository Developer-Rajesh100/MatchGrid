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

  // Group players by position
  const positions = ['GK', 'DEF', 'MID', 'FWD'];
  const posLabels = { GK: 'Goalkeepers', DEF: 'Defenders', MID: 'Midfielders', FWD: 'Forwards' };

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

        <div className="grid-2">
          {positions.map((pos) => {
            const posPlayers = players.filter((p) => p.position === pos);
            if (posPlayers.length === 0) return null;
            return (
              <div key={pos} className="card">
                <div style={{ fontWeight: 700, fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--chalk-dim)', marginBottom: '12px', borderBottom: '1px solid var(--line)', paddingBottom: '6px' }}>
                  {posLabels[pos]} ({posPlayers.length})
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {posPlayers.map((player) => (
                    <div
                      key={player.id}
                      onClick={() => navigate(`/players/${player.id}`)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        background: 'var(--panel-alt)',
                        cursor: 'pointer',
                        transition: 'background 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '16px', color: 'var(--amber)', width: '22px' }}>
                          #{player.number}
                        </span>
                        <Avatar name={player.name} size={30} photoUrl={player.photo_url} />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {player.name}
                            {player.is_manager && (
                              <span style={{ fontSize: '10px', background: 'var(--amber)', color: 'var(--base)', padding: '1px 5px', borderRadius: '3px', fontWeight: 700 }}>
                                MANAGER
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--chalk-dim)' }}>
                            {player.dcl_id || ''}
                          </div>
                        </div>
                      </div>

                      <span style={{ fontSize: '12px', color: 'var(--chalk-dim)', fontWeight: 600 }}>
                        {player.position}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
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
