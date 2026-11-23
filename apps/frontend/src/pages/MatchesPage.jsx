import React, { useEffect, useState } from 'react';
import { Calendar, RefreshCw } from 'lucide-react';
import { matchesApi } from '../api/matches';
import { MatchRow } from '../components/match/MatchRow';
import { LoadingState, ErrorState } from '../components/common/Common';
import { useLiveSocket } from '../hooks/useLiveSocket';

export function MatchesPage() {
  const [matches, setMatches] = useState([]);
  const [filterStage, setFilterStage] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchMatches = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError(null);
      const data = await matchesApi.getMatches();
      setMatches(data || []);
    } catch (err) {
      if (showLoading) setError(err.message || 'Failed to load matches');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatches(true);
  }, []);

  useLiveSocket(() => {
    fetchMatches(false);
  });

  const filteredMatches = matches.filter((m) => {
    if (filterStage !== 'all' && m.stage !== filterStage) return false;
    if (filterStatus === 'live' && m.status !== 'live') return false;
    if (filterStatus === 'upcoming' && m.status !== 'upcoming') return false;
    if (filterStatus === 'completed' && (m.status !== 'full_time' && m.status !== 'completed')) return false;
    return true;
  });

  return (
    <div>
      <div className="section-title">
        <div>
          <h2><Calendar size={24} color="var(--amber)" /> Match Fixtures & Results</h2>
          <p>Full schedule of group stages, semi-finals, final, and additional matches</p>
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
          Live ({matches.filter((m) => m.status === 'live').length})
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
        {matches.some((m) => m.stage === 'extra') && (
          <button
            className={`sub-tab ${filterStage === 'extra' && filterStatus === 'all' ? 'active' : ''}`}
            onClick={() => { setFilterStage('extra'); setFilterStatus('all'); }}
          >
            Other Matches
          </button>
        )}
        <button
          className={`sub-tab ${filterStatus === 'completed' ? 'active' : ''}`}
          onClick={() => { setFilterStage('all'); setFilterStatus('completed'); }}
        >
          Completed
        </button>
      </div>

      {loading ? (
        <LoadingState message="Loading fixtures..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchMatches} />
      ) : filterStage === 'all' && filterStatus === 'all' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Group A */}
          {matches.some((m) => m.group_name === 'A') && (
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--amber)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--amber)' }}></span>
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
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#3ecf6e', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#3ecf6e' }}></span>
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
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#3b82f6', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#3b82f6' }}></span>
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

          {/* Additional (admin-created) matches */}
          {matches.some((m) => m.stage === 'extra') && (
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--chalk-dim)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--chalk-dim)' }}></span>
                Other Matches
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
            <div className="state-container">
              <p>No fixtures scheduled yet.</p>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredMatches.map((m) => (
            <MatchRow key={m.id} match={m} showVenue />
          ))}
          {filteredMatches.length === 0 && (
            <div className="state-container">
              <p>No matches match the selected filter.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
