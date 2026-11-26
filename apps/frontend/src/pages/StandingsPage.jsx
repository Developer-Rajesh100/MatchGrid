import React, { useEffect, useState } from 'react';
import { standingsApi } from '../api/standings';
import { StandingsTable } from '../components/standings/StandingsTable';
import { LoadingState, ErrorState } from '../components/common/Common';
import { BarChart3, Info, RefreshCw } from 'lucide-react';
import { useLiveSocket } from '../hooks/useLiveSocket';
import { useTournament } from '../context/TournamentContext';

const NEXT_ROUND = { semis_final: 'semi-finals', quarters_semis_final: 'quarter-finals' };

/** The tournament's own rules in words, from its settings (never hard-coded points or pairings). */
function describeRules(config, groupCount) {
  if (!config) return 'Points, then goal difference, then goals scored, then club name decide the order of each table.';
  const { points_win: w, points_draw: d, points_loss: l, knockout_format: fmt, qualifiers_per_group: q } = config;
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const points = `Clubs receive ${plural(w, 'point')} for a win, ${plural(d, 'point')} for a draw and ${plural(l, 'point')} for a defeat.`;
  const order = 'Tie-breakers: points, then goal difference, then goals for, then club name.';
  if (fmt === 'none') return `${points} ${order} The table decides the tournament; there is no knockout stage.`;
  const advance = `The top ${q} ${q === 1 ? 'club' : 'clubs'} from each group advance to the ${NEXT_ROUND[fmt]}.`;
  const official =
    fmt === 'semis_final' && groupCount === 2 && q === 2
      ? ' Semi-final 1 is Group A 2nd vs Group B 1st, and Semi-final 2 is Group B 2nd vs Group A 1st.'
      : ' Pairings are seeded from the final group tables.';
  return `${points} ${order} ${advance}${official}`;
}

export function StandingsPage() {
  const { tournamentId, slug, tournament } = useTournament();
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const rulesText = describeRules(tournament?.config, standings.length);

  const fetchStandings = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError(null);
      const query = {};
      if (tournamentId) query.tournament_id = tournamentId;
      if (slug) query.tournament_slug = slug;
      const data = await standingsApi.getStandings(query);
      setStandings(data || []);
    } catch (err) {
      if (showLoading) setError(err.message || 'Failed to load tournament standings');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchStandings(true);
  }, [tournamentId, slug]);

  useLiveSocket(() => {
    fetchStandings(false);
  }, tournamentId, { enabled: Boolean(tournamentId) });

  return (
    <div>
      <div className="section-title">
        <div>
          <h2><BarChart3 size={24} color="var(--brand-primary)" /> Tournament Standings</h2>
          <p>Real-time group tables, goal difference calculations, and knockout seeding</p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={fetchStandings}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {loading ? (
        <LoadingState message="Calculating live standings..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchStandings} />
      ) : (
        <>
          {standings.length === 0 ? (
            <div className="card empty-note">
              No tournament groups or standings available. Group tables will appear once teams are drawn and fixtures begin.
            </div>
          ) : (
            <div className="grid-2" style={{ marginBottom: '32px' }}>
              {standings.map((grp) => (
                <StandingsTable
                  key={grp.group_id}
                  groupName={grp.group_name}
                  standings={grp.standings}
                />
              ))}
            </div>
          )}

          <aside className="rules-note">
            <Info size={18} aria-hidden="true" />
            <div>
              <h4>MatchGrid Progression Rules & Tie-breakers</h4>
              <p>{rulesText}</p>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
export default StandingsPage;
