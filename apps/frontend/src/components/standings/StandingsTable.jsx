import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '../common/Avatar';
import { useTournament } from '../../context/TournamentContext';
import { tPath } from '../../utils/paths';

const NEXT_ROUND = { semis_final: 'semi-finals', quarters_semis_final: 'quarter-finals' };

/**
 * One group table. Numbers use the tabular numeral face so columns line up; the header sticks under the
 * navigation while the table scrolls; the qualifying places come from the tournament's own settings.
 */
export function StandingsTable({ groupName, standings = [], showLegend = true }) {
  const navigate = useNavigate();
  const { slug, tournament } = useTournament();
  const config = tournament?.config;
  const qualifiers = config && config.knockout_format !== 'none' ? config.qualifiers_per_group : 0;
  const nextRound = NEXT_ROUND[config?.knockout_format];

  return (
    <section className="standings-group">
      <div className="standings-group__head">
        <h3>Group {groupName}</h3>
        {showLegend && qualifiers > 0 && (
          <span className="standings-group__legend">
            <span className="standings-group__swatch" aria-hidden="true" />
            Top {qualifiers} advance{nextRound ? ` to the ${nextRound}` : ''}
          </span>
        )}
      </div>

      <div className="table-wrapper">
        <table className="matchgrid-table standings-table">
          <thead>
            <tr>
              <th className="num" style={{ width: '40px' }}>Pos</th>
              <th>Team</th>
              <th className="num" title="Played">P</th>
              <th className="num" title="Won">W</th>
              <th className="num" title="Drawn">D</th>
              <th className="num" title="Lost">L</th>
              <th className="num hide-sm" title="Goals For">GF</th>
              <th className="num hide-sm" title="Goals Against">GA</th>
              <th className="num" title="Goal Difference">GD</th>
              <th className="num standings-table__pts" title="Points">Pts</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row, idx) => {
              const advances = qualifiers > 0 && idx < qualifiers;
              return (
                <tr
                  key={row.team_id}
                  className={`clickable standings-row ${advances ? 'is-advancing qualify-spot' : ''}`}
                  onClick={() => navigate(tPath(slug, `teams/${row.team_id}`))}
                >
                  <td className="num standings-row__pos">{idx + 1}</td>
                  <td>
                    <span className="standings-team" style={{ '--team-color': row.team_color || '#64748B' }}>
                      <Avatar name={row.team_name} crestUrl={row.crest_url} color={row.team_color} size={26} />
                      <span className="standings-team__name">{row.team_name}</span>
                    </span>
                  </td>
                  <td className="num">{row.played}</td>
                  <td className="num">{row.won}</td>
                  <td className="num">{row.drawn}</td>
                  <td className="num">{row.lost}</td>
                  <td className="num hide-sm">{row.goals_for}</td>
                  <td className="num hide-sm">{row.goals_against}</td>
                  <td className={`num ${row.goal_difference > 0 ? 'is-pos' : row.goal_difference < 0 ? 'is-neg' : ''}`}>
                    {row.goal_difference > 0 ? `+${row.goal_difference}` : row.goal_difference}
                  </td>
                  <td className="num standings-table__pts-cell">{row.points}</td>
                </tr>
              );
            })}
            {standings.length === 0 && (
              <tr>
                <td colSpan={10} className="standings-empty">
                  No standings recorded for Group {groupName} yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default StandingsTable;
