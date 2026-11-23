import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { teamsApi } from '../api/teams';
import { Avatar } from '../components/common/Avatar';
import { LoadingState, ErrorState } from '../components/common/Common';
import { Shield, Users, ArrowRight } from 'lucide-react';

export function TeamsPage() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    teamsApi
      .getTeams()
      .then((data) => setTeams(data || []))
      .catch((err) => setError(err.message || 'Failed to load teams'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState message="Loading tournament teams..." />;
  if (error) return <ErrorState message={error} />;

  const groupA = teams.filter((t) => t.group_name === 'A');
  const groupB = teams.filter((t) => t.group_name === 'B');

  const getTeamLogo = (name, logoUrl) =>
    logoUrl || (name ? `/assets/teams/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}.png` : null);

  const renderTeamGrid = (teamList, title) => (
    <div style={{ marginBottom: '32px' }}>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 600, marginBottom: '14px', color: 'var(--chalk)' }}>
        {title}
      </h3>
      <div className="grid-3">
        {teamList.map((team) => (
          <div
            key={team.id}
            className="card"
            onClick={() => navigate(`/teams/${team.id}`)}
            style={{
              cursor: 'pointer',
              borderTop: `4px solid ${team.color || 'var(--amber)'}`,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '16px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <Avatar name={team.name} color={team.color || '#f0a53d'} size={40} photoUrl={getTeamLogo(team.name, team.logo_url)} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '16px' }}>{team.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--chalk-dim)' }}>
                    Group {team.group_name || 'TBD'}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: '10px' }}>
              <span style={{ fontSize: '12.5px', color: 'var(--chalk-dim)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Users size={13} /> {team.player_count || 0} players
              </span>
              <span style={{ fontSize: '12px', color: 'var(--amber)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}>
                Squad <ArrowRight size={13} />
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <div className="section-title">
        <div>
          <h2><Shield size={24} color="var(--amber)" /> Tournament Teams</h2>
          <p>The 6 competing clubs of DCL Season 5</p>
        </div>
      </div>

      {renderTeamGrid(groupA, 'Group A')}
      {renderTeamGrid(groupB, 'Group B')}
    </div>
  );
}
