import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Radio, ChevronRight, Activity } from 'lucide-react';

export function LiveSpotlightBanner({ liveTournaments = [] }) {
  const navigate = useNavigate();

  if (!liveTournaments || liveTournaments.length === 0) return null;

  const topLive = liveTournaments[0];
  const count = liveTournaments.reduce((acc, t) => acc + (t.live_matches_count || 1), 0);

  return (
    <div
      className="hero-live-card"
      style={{
        marginBottom: '28px',
        background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.12) 0%, rgba(15, 23, 42, 0.95) 100%)',
        borderColor: 'rgba(239, 68, 68, 0.35)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="pill pill-live">
            <Radio size={12} className="pulse-icon" /> {count} {count === 1 ? 'MATCH LIVE' : 'MATCHES LIVE'}
          </span>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>
            {topLive.name} &bull; Action underway right now
          </span>
        </div>

        <button
          type="button"
          onClick={() => navigate(`/t/${topLive.slug || topLive.id}/matches`)}
          className="btn btn-sm btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          View Live Fixtures <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

export default LiveSpotlightBanner;
