import React from 'react';

/** Placeholder block shown while data loads for the first time (never over data that is merely refreshing). */
export function Skeleton({ width = '100%', height = 14, circle = false, className = '' }) {
  return (
    <span
      className={`skeleton ${circle ? 'skeleton--circle' : ''} ${className}`}
      style={{ width, height, display: 'block' }}
      aria-hidden="true"
    />
  );
}

export function SkeletonRows({ rows = 4, height = 44, label = 'Loading' }) {
  return (
    <div className="skeleton-stack" role="status" aria-live="polite" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={height} />
      ))}
    </div>
  );
}

export function SkeletonCard({ lines = 3, label = 'Loading' }) {
  return (
    <div className="card skeleton-card" role="status" aria-live="polite" aria-label={label}>
      <Skeleton width="40%" height={16} />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '65%' : '100%'} height={12} />
      ))}
    </div>
  );
}

export default Skeleton;
