import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '../common/Avatar';

export function StandingsTable({ groupName, standings = [], showLegend = true }) {
  const navigate = useNavigate();

  const getTeamLogo = (name) =>
    name ? `/assets/teams/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}.png` : null;

  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 600, color: 'var(--chalk)' }}>
          Group {groupName}
        </h3>
        {showLegend && (
          <span style={{ fontSize: '11px', color: 'var(--chalk-dim)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', background: 'var(--green)', borderRadius: '2px', display: 'inline-block' }} />
            Top 2 qualify for Semi-finals
          </span>
        )}
      </div>

      <div className="table-wrapper">
        <table className="dcl-table">
          <thead>
            <tr>
              <th className="num" style={{ width: '38px' }}>Pos</th>
              <th>Team</th>
              <th className="num">P</th>
              <th className="num">W</th>
              <th className="num">D</th>
              <th className="num">L</th>
              <th className="num">GF</th>
              <th className="num">GA</th>
              <th className="num" style={{ color: 'var(--amber)' }}>Pts</th>
              <th className="num">GD</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row, idx) => {
              const isTopTwo = idx < 2;
              return (
                <tr
                  key={row.team_id}
                  className={`clickable ${isTopTwo ? 'qualify-spot' : ''}`}
                  onClick={() => navigate(`/teams/${row.team_id}`)}
                >
                  <td className="num" style={{ fontWeight: 600, color: isTopTwo ? 'var(--green)' : 'var(--chalk-dim)' }}>
                    {idx + 1}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Avatar name={row.team_name} photoUrl={getTeamLogo(row.team_name)} color={row.team_color || '#f0a53d'} size={24} />
                      <span style={{ fontWeight: 600 }}>{row.team_name}</span>
                    </div>
                  </td>
                  <td className="num">{row.played}</td>
                  <td className="num">{row.won}</td>
                  <td className="num">{row.drawn}</td>
                  <td className="num">{row.lost}</td>
                  <td className="num">{row.goals_for}</td>
                  <td className="num">{row.goals_against}</td>
                  <td className="num" style={{ fontWeight: 700, color: 'var(--amber)', fontSize: '15px' }}>
                    {row.points}
                  </td>
                  <td className="num" style={{ color: row.goal_difference > 0 ? 'var(--green)' : row.goal_difference < 0 ? 'var(--red)' : 'inherit' }}>
                    {row.goal_difference > 0 ? `+${row.goal_difference}` : row.goal_difference}
                  </td>
                </tr>
              );
            })}
            {standings.length === 0 && (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: '24px', color: 'var(--chalk-muted)' }}>
                  No standings data available yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
