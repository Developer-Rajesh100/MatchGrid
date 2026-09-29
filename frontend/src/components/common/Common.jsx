import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export function Stripe({ color = '#f0a53d' }) {
  return <div className="stripe" style={{ backgroundColor: color }} />;
}

export function StatTile({ label, value, sublabel = null }) {
  return (
    <div className="stat-tile">
      <div className="stat-tile-val">{value ?? '-'}</div>
      <div className="stat-tile-lbl">{label}</div>
      {sublabel && <div style={{ fontSize: '10px', color: 'var(--chalk-muted)', marginTop: '2px' }}>{sublabel}</div>}
    </div>
  );
}

export function LoadingState({ message = 'Loading data...' }) {
  return (
    <div className="state-container">
      <div className="spinner"></div>
      <p style={{ color: 'var(--chalk-dim)', fontSize: '14px' }}>{message}</p>
    </div>
  );
}

export function ErrorState({ message = 'Failed to load data', onRetry = null }) {
  return (
    <div className="state-container">
      <AlertCircle size={36} color="var(--red)" style={{ marginBottom: 12 }} />
      <p style={{ color: 'var(--red)', fontWeight: 600, marginBottom: 8 }}>{message}</p>
      {onRetry && (
        <button className="btn btn-outline" onClick={onRetry} style={{ marginTop: 8 }}>
          <RefreshCw size={14} /> Retry
        </button>
      )}
    </div>
  );
}
