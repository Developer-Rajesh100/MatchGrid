import React from 'react';
import { NavLink } from 'react-router-dom';
import { Activity, ShieldCheck, Trophy, Sparkles } from 'lucide-react';
import { useWebSocket } from '../../context/WebSocketContext';

export function Footer() {
  const { isConnected } = useWebSocket();

  return (
    <footer className="brand-footer">
      <div className="brand-footer-inner">
        <div className="brand-footer-brand">
          <img src="/assets/brand/matchgrid-logo.png" alt="MatchGrid Logo" />
          <span>MatchGrid</span>
        </div>

        <p style={{ maxWidth: '640px', margin: '0 auto', lineHeight: '1.6', color: 'var(--text-secondary)' }}>
          Broadcast-grade sports tournament management and real-time live digital scoreboard platform.
          Engineered with sub-millisecond materialized standings, synchronized match clocks, and live WebSocket broadcasts.
        </p>

        <div className="brand-footer-links">
          <NavLink to="/">Tournaments</NavLink>
          <NavLink to="/login">Staff Sign In</NavLink>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            fontSize: '12px',
            color: 'var(--text-muted)',
            paddingTop: '12px',
            borderTop: '1px solid var(--border-subtle)',
            width: '100%',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: isConnected ? 'var(--brand-primary)' : 'var(--text-muted)',
                boxShadow: isConnected ? '0 0 8px var(--brand-primary)' : 'none',
              }}
            />
            <span>Engine: {isConnected ? 'WebSocket Broadcast Active' : 'Polling Fallback Mode'}</span>
          </div>

          <div className="brand-footer-copy">
            &copy; {new Date().getFullYear()} MatchGrid &bull; Flagship Tournament Architecture
          </div>
        </div>
      </div>
    </footer>
  );
}
export default Footer;
