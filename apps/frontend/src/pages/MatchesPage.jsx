import React, { useEffect, useState } from 'react';
import { Calendar, RefreshCw, Trophy, Filter, Award } from 'lucide-react';
import { matchesApi } from '../api/matches';
import { MatchRow } from '../components/match/MatchRow';
import { LoadingState, ErrorState, EmptyState } from '../components/common/Common';
import { useLiveSocket } from '../hooks/useLiveSocket';
import TournamentBracket from '../components/bracket/TournamentBracket';
import { useTournament } from '../context/TournamentContext';
import { isFullTime } from '../utils/matchStatus';

export function MatchesPage() {
  const { tournamentId, slug } = useTournament();
  const [matches, setMatches] = useState([]);
  const [filterStage, setFilterStage] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchMatches = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError(null);
      const query = {};
      if (tournamentId) query.tournament_id = tournamentId;
      if (slug) query.tournament_slug = slug;
      const data = await matchesApi.getMatches(query);
      setMatches(data || []);
    } catch (err) {
      if (showLoading) setError(err.message || 'Failed to load matches');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatches(true);
  }, [tournamentId, slug]);

  useLiveSocket(() => {
    fetchMatches(false);
  }, tournamentId, { enabled: Boolean(tournamentId) });

  const filteredMatches = matches.filter((m) => {
    if (filterStage !== 'all' && m.stage !== filterStage) return false;
    if (filterStatus === 'live' && m.status !== 'live') return false;
    if (filterStatus === 'upcoming' && m.status !== 'upcoming') return false;
    if (filterStatus === 'completed' && !isFullTime(m)) return false;
    return true;
  });

  const liveCount = matches.filter((m) => m.status === 'live').length;
  const completedCount = matches.filter(isFullTime).length;

  return (
    <div>
      <div className="section-title">
        <div>
          <h2><Calendar size={24} color="var(--brand-primary)" /> Match Fixtures & Results</h2>
          <p>Complete tournament schedule across group stages, semi-finals, and final</p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={fetchMatches}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="sub-tabs">
        <button
          className={`sub-tab ${filterStage === 'all' && filterStatus === 'all' ? 'active' : ''}`}
          onClick={() => { setFilterStage('all'); setFilterStatus('all'); }}
        >
          All ({matches.length})
        </button>
        <button
          className={`sub-tab ${filterStatus === 'live' ? 'active' : ''}`}
          onClick={() => { setFilterStage('all'); setFilterStatus('live'); }}
        >
          Live ({liveCount})
        </button>
        <button
          className={`sub-tab ${filterStage === 'group' && filterStatus === 'all' ? 'active' : ''}`}
          onClick={() => { setFilterStage('group'); setFilterStatus('all'); }}
        >
          Group Stage
        </button>
        <button
          className={`sub-tab ${filterStage === 'semi' && filterStatus === 'all' ? 'active' : ''}`}
          onClick={() => { setFilterStage('semi'); setFilterStatus('all'); }}
        >
          Semi-Finals
        </button>
        <button
          className={`sub-tab ${filterStage === 'final' && filterStatus === 'all' ? 'active' : ''}`}
          onClick={() => { setFilterStage('final'); setFilterStatus('all'); }}
        >
          Final
        </button>
        <button
          className={`sub-tab ${filterStage === 'bracket' ? 'active' : ''}`}
          onClick={() => { setFilterStage('bracket'); setFilterStatus('all'); }}
          data-testid="tab-bracket"
        >
          <Trophy size={14} aria-hidden="true" /> Bracket
        </button>
        {matches.some((m) => m.stage === 'extra') && (
          <button
            className={`sub-tab ${filterStage === 'extra' && filterStatus === 'all' ? 'active' : ''}`}
            onClick={() => { setFilterStage('extra'); setFilterStatus('all'); }}
          >
            Friendlies
          </button>
        )}
        <button
          className={`sub-tab ${filterStatus === 'completed' ? 'active' : ''}`}
          onClick={() => { setFilterStage('all'); setFilterStatus('completed'); }}
        >
          Completed ({completedCount})
        </button>
      </div>

      {loading ? (
        <LoadingState message="Loading match schedule..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchMatches} />
      ) : filterStage === 'bracket' ? (
        <TournamentBracket tournamentId={tournamentId} refreshTrigger={matches.length} />
      ) : filterStage === 'all' && filterStatus === 'all' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '26px' }}>
          {/* Group A */}
          {matches.some((m) => m.group_name === 'A') && (
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--brand-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--brand-primary)' }} />
                Group A Fixtures
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {matches
                  .filter((m) => m.group_name === 'A')
                  .map((m) => (
                    <MatchRow key={m.id} match={m} showVenue />
                  ))}
              </div>
            </div>
          )}

          {/* Group B */}
          {matches.some((m) => m.group_name === 'B') && (
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--brand-primary-hover)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--brand-primary-hover)' }} />
                Group B Fixtures
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {matches
                  .filter((m) => m.group_name === 'B')
                  .map((m) => (
                    <MatchRow key={m.id} match={m} showVenue />
                  ))}
              </div>
            </div>
          )}

          {/* Knockouts */}
          {matches.some((m) => m.stage === 'semi' || m.stage === 'final') && (
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-gold)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Trophy size={16} />
                Knockout Stage (Semi-Finals & Final)
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {matches
                  .filter((m) => m.stage === 'semi' || m.stage === 'final')
                  .map((m) => (
                    <MatchRow key={m.id} match={m} showVenue />
                  ))}
              </div>
            </div>
          )}

          {/* Additional matches */}
          {matches.some((m) => m.stage === 'extra') && (
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--text-secondary)' }} />
                Other Fixtures
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {matches
                  .filter((m) => m.stage === 'extra')
                  .map((m) => (
                    <MatchRow key={m.id} match={m} showVenue />
                  ))}
              </div>
            </div>
          )}

          {matches.length === 0 && (
            <EmptyState
              title="No fixtures scheduled"
              description="Tournament fixtures have not yet been drawn or scheduled."
              icon={Calendar}
            />
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredMatches.map((m) => (
            <MatchRow key={m.id} match={m} showVenue />
          ))}
          {filteredMatches.length === 0 && (
            <EmptyState
              title="No matches found"
              description="No matches match the selected criteria or filter."
              icon={Filter}
            />
          )}
        </div>
      )}
    </div>
  );
}
export default MatchesPage;
