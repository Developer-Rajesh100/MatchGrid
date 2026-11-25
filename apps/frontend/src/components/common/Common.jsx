import React from 'react';
import { AlertCircle, RefreshCw, Inbox, ShieldAlert } from 'lucide-react';

export function Stripe({ color = 'var(--brand-primary)' }) {
  return <div className="stripe" style={{ backgroundColor: color }} />;
}

export function StatTile({ label, value, sublabel = null }) {
  return (
    <div className="stat-tile">
      <div className="stat-tile-val">{value ?? '-'}</div>
      <div className="stat-tile-lbl">{label}</div>
      {sublabel && (
        <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '3px' }}>
          {sublabel}
        </div>
      )}
    </div>
  );
}

export function LoadingState({ message = 'Loading MatchGrid data...' }) {
  return (
    <div className="state-container">
      <div className="spinner"></div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500 }}>{message}</p>
    </div>
  );
}

export function ErrorState({ message = 'Failed to load data', onRetry = null }) {
  return (
    <div className="state-container">
      <AlertCircle size={36} color="var(--status-live)" style={{ marginBottom: 12 }} />
      <p style={{ color: 'var(--status-live)', fontWeight: 600, marginBottom: 8 }}>{message}</p>
      {onRetry && (
        <button className="btn btn-outline" onClick={onRetry} style={{ marginTop: 8 }}>
          <RefreshCw size={14} /> Retry
        </button>
      )}
    </div>
  );
}

export function ForbiddenState({ role = null, homePath = '/', homeLabel = 'Back to home' }) {
  return (
    <div className="state-container" data-testid="forbidden-state" style={{ padding: '64px 20px' }}>
      <ShieldAlert size={42} color="var(--accent-gold)" style={{ marginBottom: 14 }} />
      <h2 style={{ margin: '0 0 8px', fontSize: '20px' }}>403 — Access denied</h2>
      <p style={{ color: 'var(--text-secondary)', maxWidth: 420, textAlign: 'center', marginBottom: 16 }}>
        {role
          ? `Your ${role.replace('_', ' ').toLowerCase()} account is not allowed to open this page.`
          : 'Your account is not allowed to open this page.'}
      </p>
      <a className="btn btn-primary" href={homePath}>
        {homeLabel}
      </a>
    </div>
  );
}

export function EmptyState({ title = 'No records found', description = 'Check back soon for upcoming updates.', icon: Icon = Inbox, action = null }) {
  return (
    <div className="state-container" style={{ padding: '48px 20px' }}>
      <div
        style={{
          width: '54px',
          height: '54px',
          borderRadius: '50%',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '16px',
          color: 'var(--text-muted)',
        }}
      >
        <Icon size={26} />
      </div>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '17px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
        {title}
      </h3>
      <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', maxWidth: '380px', margin: '0 auto 16px' }}>
        {description}
      </p>
      {action}
    </div>
  );
}

export function Badge({ children, variant = 'default', style = {} }) {
  const variantStyles = {
    default: { background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' },
    primary: { background: 'var(--brand-primary-tint)', color: 'var(--brand-primary)', border: '1px solid rgba(16, 185, 129, 0.3)' },
    live: { background: 'var(--status-live-tint)', color: 'var(--status-live)', border: '1px solid rgba(239, 68, 68, 0.3)' },
    gold: { background: 'var(--accent-gold-tint)', color: 'var(--accent-gold)', border: '1px solid rgba(245, 158, 11, 0.35)' },
    info: { background: 'var(--status-info-tint)', color: 'var(--status-info)', border: '1px solid rgba(56, 189, 248, 0.3)' },
  };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.4px',
        textTransform: 'uppercase',
        ...(variantStyles[variant] || variantStyles.default),
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function SkeletonLoader({ height = '48px', width = '100%', borderRadius = '8px', style = {} }) {
  return (
    <div
      style={{
        height,
        width,
        borderRadius,
        background: 'linear-gradient(90deg, var(--bg-surface) 25%, var(--bg-elevated) 50%, var(--bg-surface) 75%)',
        backgroundSize: '200% 100%',
        animation: 'brandShimmer 2s infinite linear',
        border: '1px solid var(--border-subtle)',
        ...style,
      }}
    />
  );
}
