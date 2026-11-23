import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, NavLink } from 'react-router-dom';
import { playersApi } from '../api/players';
import { Avatar } from '../components/common/Avatar';
import { StatTile, LoadingState, ErrorState } from '../components/common/Common';
import { ArrowLeft, Trophy, Flame, Shield, Calendar, ArrowRight } from 'lucide-react';
import { useLiveSocket } from '../hooks/useLiveSocket';

export function PlayerDetailPage() {
  const { playerId } = useParams();
  const navigate = useNavigate();
  const [player, setPlayer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadPlayer = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError(null);
      const data = await playersApi.getPlayer(playerId);
      setPlayer(data);
    } catch (err) {
      if (showLoading) setError(err.message || 'Failed to load player details');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    loadPlayer(true);
  }, [playerId]);

  useLiveSocket(() => {
    loadPlayer(false);
  });

  if (loading) return <LoadingState message="Loading player profile..." />;
  if (error || !player) return <ErrorState message={error || 'Player not found'} onRetry={() => loadPlayer(true)} />;

  const stats = player.stats || {
    goals: 0,
    assists: 0,
    potm_awards: 0,
    appearances: 0,
    yellow_cards: 0,
    red_cards: 0,
  };

  const history = player.history || [];
  const goalLog = player.goal_log || [];

  return (
    <div>
      <button
        onClick={() => navigate(-1)}
        className="btn btn-outline btn-sm"
        style={{ marginBottom: '18px' }}
      >
        <ArrowLeft size={13} /> Back
      </button>

      {/* Profile Card with 4px vertical accent bar */}
      <div
        className="card"
        style={{
          borderLeft: `4px solid ${player.team_color || 'var(--brand-primary)'}`,
          marginBottom: '28px',
          padding: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          flexWrap: 'wrap',
        }}
      >
        <Avatar
          name={player.name}
          size={72}
          color={player.team_color || '#10B981'}
          photoUrl={player.photo_url}
        />

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              {player.name}
            </h2>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, color: 'var(--brand-primary)' }}>
              #{player.number}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px', flexWrap: 'wrap' }}>
            <NavLink
              to={`/teams/${player.team_id}`}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--brand-primary)', fontWeight: 600, fontSize: '14px' }}
            >
              <Shield size={14} /> {player.team_name}
            </NavLink>
            {player.is_manager && (
              <span
                style={{
                  fontSize: '10px',
                  background: 'var(--accent-gold)',
                  color: '#000',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontWeight: 800,
                  letterSpacing: '0.5px',
                }}
              >
                TEAM MANAGER
              </span>
            )}
            {player.dcl_id && (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Registration ID: {player.dcl_id}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Player Stats Grid */}
      <div className="section-title">
        <h2><Trophy size={20} color="var(--brand-primary)" /> Tournament Performance Record</h2>
      </div>

      <div className="stat-grid" style={{ marginBottom: '32px' }}>
        <StatTile label="Goals" value={stats.goals} sublabel="Official goals" />
        <StatTile label="Assists" value={stats.assists} sublabel="Key goal assists" />
        <StatTile label="POTM Awards" value={stats.potm_awards} sublabel="Player of match" />
        <StatTile label="Appearances" value={stats.appearances} sublabel="Matches played" />
        <StatTile label="Yellow Cards" value={stats.yellow_cards} sublabel="Cautions" />
        <StatTile label="Red Cards" value={stats.red_cards} sublabel="Dismissals" />
      </div>

      {/* Match History & Goal Log */}
      <div className="grid-2">
        {/* Match History */}
        <div className="card">
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
            <Calendar size={18} color="var(--brand-primary)" /> Match Appearances ({history.length})
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {history.map((m, idx) => (
              <div
                key={m.match_id || idx}
                onClick={() => navigate(`/matches/${m.match_id}`)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '11px 14px',
                  borderRadius: '8px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                    #{m.match_number}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--text-primary)' }}>
                    vs {m.opponent_team_name}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    ({m.stage})
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
                    {m.score_display}
                  </span>
                  <ArrowRight size={13} color="var(--text-muted)" />
                </div>
              </div>
            ))}

            {history.length === 0 && (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>
                No match appearances recorded for this player yet.
              </div>
            )}
          </div>
        </div>

        {/* Goal Log */}
        <div className="card">
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
            <Flame size={18} color="var(--brand-primary)" /> Goal Scoring Log ({goalLog.length})
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {goalLog.map((g, idx) => (
              <div
                key={g.event_id || idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '11px 14px',
                  borderRadius: '8px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span>⚽</span>
                  <span style={{ fontWeight: 700, color: 'var(--brand-primary)', fontSize: '13.5px' }}>
                    {g.minute}'
                  </span>
                  <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                    vs {g.opponent_team_name}
                  </span>
                </div>

                {g.assist_player_name && (
                  <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    Assist: {g.assist_player_name}
                  </span>
                )}
              </div>
            ))}

            {goalLog.length === 0 && (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>
                No goals scored yet in this tournament.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
export default PlayerDetailPage;
