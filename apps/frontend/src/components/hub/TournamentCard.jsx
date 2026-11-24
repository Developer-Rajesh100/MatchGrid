import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Calendar, Users, Radio, ArrowRight, ShieldCheck } from 'lucide-react';

export function TournamentCard({ tournament }) {
  const navigate = useNavigate();

  if (!tournament) return null;

  const status = (tournament.status || 'UPCOMING').toUpperCase();
  const isLive = (tournament.live_matches_count || 0) > 0 || status === 'LIVE';
  const slug = tournament.slug || tournament.id;

  return (
    <div
      className="card card-hover tournament-card"
      onClick={() => navigate(`/t/${slug}`)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        cursor: 'pointer',
        position: 'relative',
        transition: 'transform var(--transition-fast), border-color var(--transition-fast)',
      }}
    >
      <div>
        {/* Top bar: Status Pill & Season */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
            {tournament.season || 'Season 1'}
          </span>
          {isLive ? (
            <span className="pill pill-live pill-xs">
              <Radio size={10} className="pulse-icon" /> LIVE NOW
            </span>
          ) : (
            <span className={`pill pill-${status.toLowerCase()} pill-xs`}>
              {status}
            </span>
          )}
        </div>

        {/* Tournament Avatar & Name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
          {tournament.logo_url ? (
            <img
              src={tournament.logo_url}
              alt={tournament.name}
              className="tournament-card-logo"
              style={{
                width: '48px',
                height: '48px',
                borderRadius: 'var(--radius-md)',
                objectFit: 'contain',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
              }}
            />
          ) : (
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--brand-primary)',
              }}
            >
              <Trophy size={24} />
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <h3
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '17px',
                fontWeight: 700,
                color: 'var(--text-primary)',
                margin: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={tournament.name}
            >
              {tournament.name}
            </h3>
            {tournament.organizer_name && (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                By {tournament.organizer_name}
              </span>
            )}
          </div>
        </div>

        {/* Champion Banner if completed */}
        {tournament.champion_team_name && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 10px',
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '14px',
              fontSize: '12px',
              color: 'var(--accent-gold)',
              fontWeight: 600,
            }}
          >
            <ShieldCheck size={14} />
            <span>Champion: {tournament.champion_team_name}</span>
          </div>
        )}

        {/* Metrics Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '8px',
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px',
            marginBottom: '16px',
            textAlign: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Clubs</div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {tournament.teams_count ?? 0}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Matches</div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {tournament.matches_count ?? 0}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Live</div>
            <div
              style={{
                fontSize: '15px',
                fontWeight: 700,
                color: (tournament.live_matches_count || 0) > 0 ? 'var(--status-live)' : 'var(--text-secondary)',
              }}
            >
              {tournament.live_matches_count ?? 0}
            </div>
          </div>
        </div>
      </div>

      {/* Footer CTA */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid var(--border-subtle)',
          paddingTop: '12px',
        }}
      >
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          {tournament.stage ? tournament.stage.toUpperCase() : 'TOURNAMENT'}
        </span>
        <span
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--brand-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          Explore Center <ArrowRight size={13} />
        </span>
      </div>
    </div>
  );
}

export default TournamentCard;
