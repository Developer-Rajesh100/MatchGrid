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
        style={{ marginBottom: '16px' }}
      >
        <ArrowLeft size={13} /> Back
      </button>

      {/* Profile Card */}
      <div
        className="card"
        style={{
          borderLeft: `6px solid ${player.team_color || '#f0a53d'}`,
          marginBottom: '28px',
          padding: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          flexWrap: 'wrap',
        }}
      >
        <Avatar name={player.name} size={72} color={player.team_color || '#f0a53d'} photoUrl={player.photo_url} />

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 700, margin: 0 }}>
              {player.name}
            </h2>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, color: 'var(--amber)' }}>
              #{player.number}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px', flexWrap: 'wrap' }}>
            <NavLink
              to={`/teams/${player.team_id}`}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--amber)', fontWeight: 600, fontSize: '14px' }}
            >
              <Shield size={14} /> {player.team_name}
            </NavLink>
            {player.is_manager && (
              <span style={{ fontSize: '11px', background: 'var(--amber)', color: 'var(--base)', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                TEAM MANAGER
              </span>
            )}
            {player.dcl_id && (
              <span style={{ fontSize: '12px', color: 'var(--chalk-muted)' }}>
                ID: {player.dcl_id}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Player Stats Grid */}
      <div className="section-title">
        <h2><Trophy size={20} color="var(--amber)" /> Tournament Record</h2>
      </div>

      <div className="stat-grid" style={{ marginBottom: '32px' }}>
        <StatTile label="Goals" value={stats.goals} sublabel="Tournament goals" />
        <StatTile label="Assists" value={stats.assists} sublabel="Key passes" />
        <StatTile label="POTM Awards" value={stats.potm_awards} sublabel="Player of the match" />
        <StatTile label="Appearances" value={stats.appearances} sublabel="Matches played" />
        <StatTile label="Yellow Cards" value={stats.yellow_cards} sublabel="Cautions" />
        <StatTile label="Red Cards" value={stats.red_cards} sublabel="Dismissals" />
      </div>

      {/* Match History & Goal Log */}
      <div className="grid-2">
        {/* Match History */}
        <div className="card">
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 600, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={18} color="var(--amber)" /> Match History ({history.length})
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
                  padding: '10px 12px',
                  borderRadius: '6px',
                  background: 'var(--panel-alt)',
                  cursor: 'pointer',
                  border: '1px solid var(--line)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13.5px' }}>
                    vs {m.opponent_name}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--chalk-dim)', marginTop: '2px' }}>
                    {m.label} · Result: <strong style={{ color: m.result === 'Won' ? 'var(--green)' : m.result === 'Lost' ? 'var(--red)' : 'var(--amber)' }}>{m.result} ({m.my_score}–{m.opponent_score})</strong>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                  {m.goals > 0 && <span title={`${m.goals} Goals`}>⚽ {m.goals}</span>}
                  {m.assists > 0 && <span title={`${m.assists} Assists`}>👟 {m.assists}</span>}
                  {m.yellow_cards > 0 && <span>🟨</span>}
                  {m.red_cards > 0 && <span>🟥</span>}
                  {m.potm && <span title="Player of the Match" style={{ color: 'var(--amber)' }}>⭐ POTM</span>}
                  <ArrowRight size={14} color="var(--chalk-muted)" />
                </div>
              </div>
            ))}

            {history.length === 0 && (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--chalk-muted)', fontSize: '13px' }}>
                No match appearances recorded for this player yet.
              </div>
            )}
          </div>
        </div>

        {/* Goal Log */}
        <div className="card">
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 600, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Flame size={18} color="var(--amber)" /> Goal Log ({goalLog.length})
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {goalLog.map((g, idx) => (
              <div
                key={idx}
                onClick={() => navigate(`/matches/${g.match_id}`)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  background: 'var(--panel-alt)',
                  cursor: 'pointer',
                  border: '1px solid var(--line)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '16px' }}>⚽</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13.5px' }}>
                      vs {g.opponent_name}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--chalk-dim)' }}>
                      {g.label}
                    </div>
                  </div>
                </div>

                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '16px', color: 'var(--amber)' }}>
                  {g.minute ? `${g.minute}'` : 'Goal'}
                </div>
              </div>
            ))}

            {goalLog.length === 0 && (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--chalk-muted)', fontSize: '13px' }}>
                No tournament goals scored yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
