import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { matchesApi } from '../../api/matches';
import { authApi } from '../../api/auth';
import { useLiveSocket } from '../../hooks/useLiveSocket';
import { StatusPill } from '../../components/common/StatusPill';
import { Avatar } from '../../components/common/Avatar';
import { LoadingState, ErrorState, EmptyState } from '../../components/common/Common';
import { Clock, Shield, RefreshCw, Trophy, ChevronRight, Activity, Calendar } from 'lucide-react';

export function ScorerDashboardPage() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const username = authApi.getUsername();
  const role = authApi.getRole();

  const loadAssignedMatches = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const data = await matchesApi.getAssignedMatches();
      setMatches(data || []);
    } catch (err) {
      setError(err.message || 'Failed to load assigned matches');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAssignedMatches();
  }, [loadAssignedMatches]);

  // Real-time updates via live WebSocket
  useLiveSocket(() => {
    loadAssignedMatches(false);
  });

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 16px' }}>
      {/* Cockpit Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '28px',
          paddingBottom: '20px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--brand-primary)',
              }}
            >
              <Activity size={20} />
            </div>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '26px',
                fontWeight: 700,
                color: 'var(--text-primary)',
                margin: 0,
              }}
            >
              Scorer Cockpit
            </h1>
          </div>
          <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--text-secondary)' }}>
            Live match console access for operator{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{username}</strong>{' '}
            <span
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '4px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--brand-primary)',
                fontWeight: 600,
                textTransform: 'uppercase',
                marginLeft: '4px',
              }}
            >
              {role}
            </span>
          </p>
        </div>

        <button
          onClick={() => loadAssignedMatches(true)}
          className="btn btn-outline"
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          disabled={loading}
          data-testid="refresh-scorer-matches"
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          <span>Refresh Roster</span>
        </button>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <LoadingState message="Loading your assigned matches..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => loadAssignedMatches(true)} />
      ) : matches.length === 0 ? (
        <div data-testid="scorer-empty-state">
          <EmptyState
            title="No Matches Assigned"
            description="You currently do not have any matches assigned to your scoring roster. When an organizer assigns you to a fixture, it will appear here."
            icon={Calendar}
          />
        </div>
      ) : (
        <div
          data-testid="scorer-matches-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: '20px',
          }}
        >
          {matches.map((match) => {
            const isLive = match.status === 'live';
            const isFinished = match.status === 'full_time' || match.status === 'completed';

            return (
              <div
                key={match.id}
                className="card"
                data-testid={`scorer-match-card-${match.id}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '20px',
                  borderRadius: '12px',
                  background: 'var(--bg-surface)',
                  border: isLive
                    ? '1.5px solid rgba(239, 68, 68, 0.4)'
                    : '1px solid var(--border-subtle)',
                  boxShadow: isLive ? '0 0 20px rgba(239, 68, 68, 0.12)' : 'var(--shadow-sm)',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
              >
                {/* Top Tournament & Match Meta */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '14px',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        background: 'var(--bg-elevated)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        border: '1px solid var(--border-subtle)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Match #{match.match_number}
                    </span>
                    {match.tournament_name && (
                      <span
                        title={match.tournament_name}
                        style={{
                          fontSize: '12px',
                          color: 'var(--text-secondary)',
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {match.tournament_name}
                      </span>
                    )}
                  </div>
                  <StatusPill status={match.status} isHalfTime={match.is_half_time} />
                </div>

                {/* Matchup Header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 12px',
                    background: 'var(--bg-base)',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                    marginBottom: '16px',
                  }}
                >
                  {/* Team 1 */}
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      textAlign: 'center',
                      gap: '8px',
                    }}
                  >
                    <Avatar
                      name={match.team1_name || 'Team 1'}
                      crestUrl={match.team1_crest_url}
                      color={match.team1_color || '#10B981'}
                      size={44}
                    />
                    <span
                      style={{
                        fontSize: '13.5px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        maxWidth: '120px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {match.team1_name || 'TBD'}
                    </span>
                  </div>

                  {/* Score or VS */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      padding: '0 12px',
                    }}
                  >
                    {isLive || isFinished ? (
                      <div
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: '22px',
                          fontWeight: 800,
                          color: isLive ? 'var(--status-live)' : 'var(--text-primary)',
                          letterSpacing: '1px',
                        }}
                      >
                        {match.team1_score ?? 0} : {match.team2_score ?? 0}
                      </div>
                    ) : (
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: 'var(--text-muted)',
                          textTransform: 'uppercase',
                        }}
                      >
                        VS
                      </span>
                    )}
                    {match.label && (
                      <span
                        style={{
                          fontSize: '10.5px',
                          color: 'var(--text-muted)',
                          marginTop: '4px',
                        }}
                      >
                        {match.label}
                      </span>
                    )}
                  </div>

                  {/* Team 2 */}
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      textAlign: 'center',
                      gap: '8px',
                    }}
                  >
                    <Avatar
                      name={match.team2_name || 'Team 2'}
                      crestUrl={match.team2_crest_url}
                      color={match.team2_color || '#3B82F6'}
                      size={44}
                    />
                    <span
                      style={{
                        fontSize: '13.5px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        maxWidth: '120px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {match.team2_name || 'TBD'}
                    </span>
                  </div>
                </div>

                {/* Action Button: Open Live Console */}
                <div style={{ marginTop: 'auto' }}>
                  <button
                    onClick={() => navigate(`/scorer/matches/${match.id}/live`)}
                    className={isLive ? 'btn btn-primary' : 'btn btn-outline'}
                    data-testid={`scorer-open-console-${match.id}`}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '10px 16px',
                      fontSize: '13.5px',
                      fontWeight: 600,
                      background: isLive ? 'var(--status-live)' : undefined,
                      borderColor: isLive ? 'var(--status-live)' : undefined,
                      color: isLive ? '#ffffff' : undefined,
                    }}
                  >
                    <Clock size={15} />
                    <span>{isLive ? 'Open Live Console (Live Now)' : 'Open Match Console'}</span>
                    <ChevronRight size={14} style={{ marginLeft: 'auto' }} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ScorerDashboardPage;
