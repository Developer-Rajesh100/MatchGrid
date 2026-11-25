import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '../common/Avatar';
import { useTournament } from '../../context/TournamentContext';
import { tPath } from '../../utils/paths';

export function StandingsTable({ groupName, standings = [], showLegend = true }) {
  const navigate = useNavigate();
  const { slug } = useTournament();

  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
          Group {groupName}
        </h3>
        {showLegend && (
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', background: 'var(--brand-primary)', borderRadius: '2px', display: 'inline-block' }} />
            Top 2 qualify for Semi-finals
          </span>
        )}
      </div>

      <div className="table-wrapper">
        <table className="dcl-table matchgrid-table">
          <thead>
            <tr>
              <th className="num" style={{ width: '40px' }}>Pos</th>
              <th>Team</th>
              <th className="num" title="Played">P</th>
              <th className="num" title="Won">W</th>
              <th className="num" title="Drawn">D</th>
              <th className="num" title="Lost">L</th>
              <th className="num" title="Goals For">GF</th>
              <th className="num" title="Goals Against">GA</th>
              <th className="num" title="Points" style={{ color: 'var(--brand-primary)' }}>Pts</th>
              <th className="num" title="Goal Difference">GD</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row, idx) => {
              const isTopTwo = idx < 2;
              return (
                <tr
                  key={row.team_id}
                  className={`clickable ${isTopTwo ? 'qualify-spot' : ''}`}
                  onClick={() => navigate(tPath(slug, `teams/${row.team_id}`))}
                >
                  <td className="num" style={{ fontWeight: 700, color: isTopTwo ? 'var(--brand-primary)' : 'var(--text-secondary)' }}>
                    {idx + 1}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Avatar
                        name={row.team_name}
                        photoUrl={row.team_logo}
                        color={row.team_color || '#10B981'}
                        size={24}
                      />
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {row.team_name}
                      </span>
                    </div>
                  </td>
                  <td className="num">{row.played}</td>
                  <td className="num">{row.won}</td>
                  <td className="num">{row.drawn}</td>
                  <td className="num">{row.lost}</td>
                  <td className="num">{row.goals_for}</td>
                  <td className="num">{row.goals_against}</td>
                  <td className="num" style={{ fontWeight: 700, color: 'var(--brand-primary)', fontSize: '15px' }}>
                    {row.points}
                  </td>
                  <td
                    className="num"
                    style={{
                      fontWeight: 600,
                      color:
                        row.goal_difference > 0
                          ? 'var(--brand-primary)'
                          : row.goal_difference < 0
                          ? 'var(--status-live)'
                          : 'var(--text-secondary)',
                    }}
                  >
                    {row.goal_difference > 0 ? `+${row.goal_difference}` : row.goal_difference}
                  </td>
                </tr>
              );
            })}
            {standings.length === 0 && (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: '28px', color: 'var(--text-muted)' }}>
                  No standings recorded for Group {groupName} yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
export default StandingsTable;
