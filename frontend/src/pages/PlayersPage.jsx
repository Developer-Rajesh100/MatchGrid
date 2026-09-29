import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { playersApi } from '../api/players';
import { teamsApi } from '../api/teams';
import { Avatar } from '../components/common/Avatar';
import { LoadingState, ErrorState } from '../components/common/Common';
import { Users, Search } from 'lucide-react';

export function PlayersPage() {
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTeam, setSelectedTeam] = useState(searchParams.get('team') || 'all');
  const [selectedPos, setSelectedPos] = useState('all');
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
    if (selectedPos !== 'all' && p.position !== selectedPos) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = p.name?.toLowerCase().includes(q);
      const matchDcl = p.dcl_id?.toLowerCase().includes(q);
      const matchTeam = p.team_name?.toLowerCase().includes(q);
      if (!matchName && !matchDcl && !matchTeam) return false;
    }
    return true;
  });

  return (
    <div>
      <div className="section-title">
        <div>
          <h2><Users size={24} color="var(--amber)" /> Tournament Players ({players.length})</h2>
          <p>Search and filter players across all 6 teams</p>
        </div>
      </div>

      {/* Filters row */}
      <div
        className="card"
        style={{
          marginBottom: '24px',
          display: 'flex',
          gap: '12px',
          flexWrap: 'wrap',
          alignItems: 'center',
          padding: '14px',
        }}
      >
        {/* Search */}
        <div style={{ flex: '1 1 200px', position: 'relative' }}>
          <input
            type="text"
            className="input"
            placeholder="Search by player name or DCL ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: '34px' }}
          />
          <Search size={15} color="var(--chalk-dim)" style={{ position: 'absolute', left: '11px', top: '12px' }} />
        </div>

        {/* Team Filter */}
        <div style={{ flex: '0 1 180px' }}>
          <select
            className="select"
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
          >
            <option value="all">All Teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* Position Filter */}
        <div style={{ flex: '0 1 140px' }}>
          <select
            className="select"
            value={selectedPos}
            onChange={(e) => setSelectedPos(e.target.value)}
          >
            <option value="all">All Positions</option>
            <option value="GK">Goalkeeper (GK)</option>
            <option value="DEF">Defender (DEF)</option>
            <option value="MID">Midfielder (MID)</option>
            <option value="FWD">Forward (FWD)</option>
          </select>
        </div>
      </div>

      {loading ? (
        <LoadingState message="Loading players..." />
      ) : error ? (
        <ErrorState message={error} />
      ) : (
        <div className="grid-3">
          {filteredPlayers.map((player) => (
            <div
              key={player.id}
              className="card"
              onClick={() => navigate(`/players/${player.id}`)}
              style={{
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                borderLeft: `4px solid ${player.team_color || '#f0a53d'}`,
                padding: '14px',
              }}
            >
              <Avatar name={player.name} size={44} color={player.team_color || '#f0a53d'} photoUrl={player.photo_url} />

              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 700, fontSize: '15px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {player.name}
                  </span>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--amber)', fontSize: '14px' }}>
                    #{player.number}
                  </span>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--chalk-dim)', marginTop: '2px' }}>
                  {player.team_name}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                  <span style={{ fontSize: '10px', background: 'var(--panel-alt)', border: '1px solid var(--line)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, color: 'var(--chalk-dim)' }}>
                    {player.position}
                  </span>
                  {player.is_manager && (
                    <span style={{ fontSize: '10px', background: 'var(--amber)', color: 'var(--base)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                      MANAGER
                    </span>
                  )}
                  {player.dcl_id && (
                    <span style={{ fontSize: '10px', color: 'var(--chalk-muted)', marginLeft: 'auto' }}>
                      {player.dcl_id}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}

          {filteredPlayers.length === 0 && (
            <div className="card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '36px', color: 'var(--chalk-muted)' }}>
              No players found matching current filters.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
