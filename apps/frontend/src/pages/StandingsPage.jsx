import React, { useEffect, useState } from 'react';
import { standingsApi } from '../api/standings';
import { StandingsTable } from '../components/standings/StandingsTable';
import { LoadingState, ErrorState } from '../components/common/Common';
import { BarChart3, Info, RefreshCw, Trophy } from 'lucide-react';
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
          <div className="grid-2" style={{ marginBottom: '32px' }}>
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
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderLeft: '4px solid var(--brand-primary)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '16px',
              padding: '20px',
            }}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'var(--brand-primary-tint)',
                color: 'var(--brand-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Info size={20} />
            </div>
            <div>
              <h4 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)', marginBottom: '6px' }}>
                MatchGrid Progression Rules & Tie-breakers
              </h4>
              <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
                Clubs receive <strong>3 points for a win</strong>, <strong>1 point for a draw</strong>, and <strong>0 for a defeat</strong>.
                Tie-breaker hierarchy: <strong>Points</strong> &rarr; <strong>Goal Difference (GD)</strong> &rarr; <strong>Goals For (GF)</strong> &rarr; <strong>Club Name Alphabetical</strong>.
                The top 2 clubs from each group advance to the Knockout Semi-Finals:
                <strong> Semi-final 1: Group A 2nd vs Group B 1st (A2 vs B1)</strong> &bull;
                <strong> Semi-final 2: Group B 2nd vs Group A 1st (B2 vs A1)</strong>.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
export default StandingsPage;
