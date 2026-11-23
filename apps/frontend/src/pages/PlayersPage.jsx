import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { playersApi } from '../api/players';
import { teamsApi } from '../api/teams';
import { Avatar } from '../components/common/Avatar';
import { LoadingState, ErrorState, EmptyState } from '../components/common/Common';
import { Users, Search, Filter } from 'lucide-react';

export function PlayersPage() {
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTeam, setSelectedTeam] = useState(searchParams.get('team') || 'all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    Promise.all([playersApi.getPlayers(), teamsApi.getTeams()])
      .then(([pData, tData]) => {
        setPlayers(pData || []);
        setTeams(tData || []);
      })
      .catch((err) => setError(err.message || 'Failed to load players'))
      .finally(() => setLoading(false));
  }, []);

  const filteredPlayers = players.filter((p) => {
    if (selectedTeam !== 'all' && p.team_id !== selectedTeam) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = p.name?.toLowerCase().includes(q);
      const matchId = p.dcl_id?.toLowerCase().includes(q);
      const matchTeam = p.team_name?.toLowerCase().includes(q);
      if (!matchName && !matchId && !matchTeam) return false;
    }
    return true;
  });

  return (
    <div>
      <div className="section-title">
        <div>
          <h2><Users size={24} color="var(--brand-primary)" /> Tournament Squad Players ({players.length})</h2>
          <p>Search and filter players across all competing clubs</p>
        </div>
      </div>

      {/* Filters row */}
      <div
        className="card"
        style={{
          marginBottom: '28px',
          display: 'flex',
          gap: '14px',
          flexWrap: 'wrap',
          alignItems: 'center',
          padding: '16px 20px',
        }}
      >
        {/* Search */}
        <div style={{ flex: '1 1 240px', position: 'relative' }}>
          <input
            type="text"
            className="input"
            placeholder="Search by player name or Registration ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: '38px' }}
          />
          <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '13px', top: '13px' }} />
        </div>

        {/* Team Filter */}
        <div style={{ flex: '0 1 200px' }}>
          <select
            className="select"
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
          >
            <option value="all">All Competing Clubs</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <LoadingState message="Loading squad roster..." />
      ) : error ? (
        <ErrorState message={error} />
      ) : (
        <div className="grid-3">
          {filteredPlayers.map((player) => (
            <div
              key={player.id}
              className="card card-clickable"
              onClick={() => navigate(`/players/${player.id}`)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                borderLeft: `4px solid ${player.team_color || 'var(--brand-primary)'}`,
                padding: '16px',
              }}
            >
              <Avatar
                name={player.name}
                size={46}
                color={player.team_color || '#10B981'}
                photoUrl={player.photo_url}
              />

              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontWeight: 700, fontSize: '15px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-primary)' }}>
                    {player.name}
                  </span>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--brand-primary)', fontSize: '14px' }}>
                    #{player.number}
                  </span>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {player.team_name}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                  {player.is_manager && (
                    <span
                      style={{
                        fontSize: '9.5px',
                        background: 'var(--accent-gold)',
                        color: '#000',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontWeight: 800,
                        letterSpacing: '0.4px',
                      }}
                    >
                      MANAGER
                    </span>
                  )}
                  {player.dcl_id && (
                    <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                      ID: {player.dcl_id}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}

          {filteredPlayers.length === 0 && (
            <div style={{ gridColumn: '1 / -1' }}>
              <EmptyState
                title="No players match your search"
                description="Try clearing search query or selecting another club."
                icon={Filter}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
export default PlayersPage;
