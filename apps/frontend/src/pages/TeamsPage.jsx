import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { teamsApi } from '../api/teams';
import { Avatar } from '../components/common/Avatar';
import { LoadingState, ErrorState, EmptyState } from '../components/common/Common';
import { Shield, Users, ArrowRight } from 'lucide-react';
import { useTournament } from '../context/TournamentContext';

export function TeamsPage() {
  const { tournamentId, slug } = useTournament();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    const query = {};
    if (tournamentId) query.tournament_id = tournamentId;
    if (slug) query.tournament_slug = slug;
    teamsApi
      .getTeams(query)
      .then((data) => setTeams(data || []))
      .catch((err) => setError(err.message || 'Failed to load teams'))
      .finally(() => setLoading(false));
  }, [tournamentId, slug]);

  if (loading) return <LoadingState message="Loading competing clubs..." />;
  if (error) return <ErrorState message={error} />;

  const groupA = teams.filter((t) => t.group_name === 'A');
  const groupB = teams.filter((t) => t.group_name === 'B');

  const renderTeamGrid = (teamList, title) => (
    <div style={{ marginBottom: '32px' }}>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 700, marginBottom: '16px', color: 'var(--text-primary)' }}>
        {title}
      </h3>
      <div className="grid-3">
        {teamList.map((team) => (
          <div
            key={team.id}
            className="card card-clickable"
            onClick={() => navigate(`/teams/${team.id}`)}
            style={{
              borderLeft: `4px solid ${team.color || 'var(--brand-primary)'}`,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '16px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <Avatar
                  name={team.name}
                  color={team.color || '#10B981'}
                  size={42}
                  photoUrl={team.logo_url}
                />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)' }}>{team.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    Group {team.group_name || 'TBD'}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
              <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Users size={13} /> {team.player_count || 0} registered players
              </span>
              <span style={{ fontSize: '12px', color: 'var(--brand-primary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
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
          <h2><Shield size={24} color="var(--brand-primary)" /> Competing Clubs</h2>
          <p>Official competing clubs and squad registries</p>
        </div>
      </div>

      {teams.length === 0 ? (
        <EmptyState
          title="No clubs registered"
          description="No clubs have registered for MatchGrid yet. Teams will appear here once added in the Admin Portal."
          icon={Shield}
        />
      ) : (
        <>
          {groupA.length > 0 && renderTeamGrid(groupA, 'Group A')}
          {groupB.length > 0 && renderTeamGrid(groupB, 'Group B')}
          {teams.some((t) => !['A', 'B'].includes(t.group_name)) &&
            renderTeamGrid(
              teams.filter((t) => !['A', 'B'].includes(t.group_name)),
              'Other Clubs'
            )}
        </>
      )}
    </div>
  );
}
export default TeamsPage;
