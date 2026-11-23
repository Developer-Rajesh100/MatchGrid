import React, { useEffect, useState } from 'react';
import { statisticsApi } from '../api/statistics';
import { LeaderCard } from '../components/stats/LeaderCard';
import { LoadingState, ErrorState } from '../components/common/Common';
import { Trophy, Flame, Zap, Award, Activity, RefreshCw } from 'lucide-react';
import { useLiveSocket } from '../hooks/useLiveSocket';

export function StatsPage() {
  const [leaderboards, setLeaderboards] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError(null);
      const data = await statisticsApi.getLeaderboards();
      setLeaderboards(data);
    } catch (err) {
      if (showLoading) setError(err.message || 'Failed to load leaderboards');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats(true);
  }, []);

  useLiveSocket(() => {
    fetchStats(false);
  });

  return (
    <div>
      <div className="section-title">
        <div>
          <h2><Trophy size={24} color="var(--brand-primary)" /> Tournament Statistics</h2>
          <p>Official player performance leaderboards and tournament individual honors</p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={fetchStats}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {loading ? (
        <LoadingState message="Loading leaderboard rankings..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchStats} />
      ) : (
        <div className="grid-2">
          {/* Top Scorers */}
          <LeaderCard
            title="Golden Boot (Top Scorers)"
            icon={Flame}
            unit="goals"
            items={leaderboards?.top_scorers || []}
          />

          {/* Top Assists */}
          <LeaderCard
            title="Top Playmakers (Assists)"
            icon={Zap}
            unit="assists"
            items={leaderboards?.top_assists || []}
          />

          {/* Player of the Match */}
          <LeaderCard
            title="Player of the Match (POTM)"
            icon={Award}
            unit="awards"
            items={leaderboards?.top_potm || []}
          />

          {/* Most Appearances */}
          <LeaderCard
            title="Most Appearances"
            icon={Activity}
            unit="matches"
            items={leaderboards?.most_appearances || []}
          />
        </div>
      )}
    </div>
  );
}
export default StatsPage;
