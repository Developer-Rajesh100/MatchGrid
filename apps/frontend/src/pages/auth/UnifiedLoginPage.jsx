import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { authApi } from '../../api/auth';
import { AlertCircle, Lock, ShieldCheck } from 'lucide-react';

export function UnifiedLoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await authApi.login(username, password);
      const role = res?.role;

      const cameFrom = location.state?.from?.pathname;
      if (cameFrom && cameFrom !== '/login') {
        navigate(cameFrom, { replace: true }); // back to where the session ran out (or was needed)
      } else if (role === 'SUPER_ADMIN') {
        navigate('/superadmin');
      } else if (role === 'ORGANIZER') {
        navigate('/organizer');
      } else if (role === 'SCORER') {
        navigate('/scorer');
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '440px', margin: '48px auto 0', padding: '0 12px' }}>
      <div
        className="card"
        style={{
          padding: '36px 28px',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ display: 'inline-flex', marginBottom: '14px' }}>
            <img
              src="/assets/brand/matchgrid-logo.png"
              alt="MatchGrid Logo"
              style={{ width: '56px', height: '56px', objectFit: 'contain' }}
            />
          </div>
          <h2
            data-testid="portal-login-title"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '26px',
              fontWeight: 700,
              color: 'var(--text-primary)',
            }}
          >
            MatchGrid Portal
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13.5px', marginTop: '6px' }}>
            Unified Role Login &bull; Superadmin &bull; Organizer &bull; Scorer
          </p>
        </div>

        {location.state?.expired && !error && (
          <div role="status" data-testid="session-expired" style={{ marginBottom: 12, color: 'var(--accent-gold)', fontSize: 13 }}>
            Your session expired. Please sign in again.
          </div>
        )}
        {error && (
          <div
            data-testid="admin-login-error"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 14px',
              borderRadius: '8px',
              background: 'var(--status-live-tint)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: 'var(--status-live)',
              fontSize: '13px',
              marginBottom: '20px',
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div className="field">
            <label>Operator Username</label>
            <input
              type="text"
              data-testid="admin-username-input"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. admin or organizer"
              required
            />
          </div>

          <div className="field" style={{ marginBottom: '24px' }}>
            <label>Access Password</label>
            <input
              type="password"
              data-testid="admin-password-input"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
            />
          </div>

          <button
            type="submit"
            data-testid="admin-login-submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '12px', fontSize: '14px' }}
            disabled={loading}
          >
            {loading ? 'Authenticating...' : 'Sign In to Operations Console'}
          </button>
        </form>

        <div
          style={{
            marginTop: '24px',
            paddingTop: '20px',
            borderTop: '1px solid var(--border-subtle)',
            fontSize: '12px',
            color: 'var(--text-muted)',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <span>Role-Based Access: Superadmin &bull; Organizer &bull; Scorer</span>
          <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>
            Tokens expire in 24 hours &bull; Strict cross-tenant boundary isolation
          </span>
        </div>
      </div>
    </div>
  );
}

export default UnifiedLoginPage;
