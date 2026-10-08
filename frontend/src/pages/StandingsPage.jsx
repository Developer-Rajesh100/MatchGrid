import React, { useEffect, useState } from 'react';
import { standingsApi } from '../api/standings';
import { StandingsTable } from '../components/standings/StandingsTable';
import { LoadingState, ErrorState } from '../components/common/Common';
import { BarChart3, Info, RefreshCw } from 'lucide-react';
import { useLiveSocket } from '../hooks/useLiveSocket';

export function StandingsPage() {
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStandings = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError(null);
      const data = await standingsApi.getStandings();
      setStandings(data || []);
    } catch (err) {
      if (showLoading) setError(err.message || 'Failed to load tournament standings');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchStandings(true);
  }, []);

  useLiveSocket(() => {
    fetchStandings(false);
  });

  return (
    <div>
      <div className="section-title">
        <div>
          <h2><BarChart3 size={24} color="var(--amber)" /> Tournament Standings</h2>
          <p>Live group tables, points, and qualification status</p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={fetchStandings}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {loading ? (
        <LoadingState message="Loading standings..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchStandings} />
      ) : (
        <>
          <div className="grid-2" style={{ marginBottom: '28px' }}>
            {standings.map((grp) => (
              <StandingsTable
                key={grp.group_id}
                groupName={grp.group_name}
                standings={grp.standings}
              />
            ))}
          </div>

          {/* Qualification rules callout */}
          <div
            className="card"
            style={{
              background: 'rgba(21, 34, 25, 0.7)',
              borderColor: 'var(--line-light)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '14px',
            }}
          >
            <Info size={22} color="var(--amber)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <h4 style={{ fontWeight: 600, fontSize: '15px', marginBottom: '4px' }}>
                Tournament Format & Tie-breakers
              </h4>
              <p style={{ fontSize: '13px', color: 'var(--chalk-dim)', lineHeight: '1.6' }}>
                Teams are ranked by: <strong>Points (3 for a Win, 1 for a Draw)</strong> &rarr; <strong>Goal Difference (GD)</strong> &rarr; <strong>Goals For (GF)</strong>.
                The top 2 teams from each group qualify for the semi-finals: <strong>Semi-final 1: Group A Runner-up vs Group B Winner (A2 vs B1)</strong> and <strong>Semi-final 2: Group B Runner-up vs Group A Winner (B2 vs A1)</strong>.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
