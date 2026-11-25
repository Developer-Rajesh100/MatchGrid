import React, { useState } from 'react';

/**
 * Geometric, high-craft Avatar component.
 * Supports team crests and player photos with graceful fallback to
 * clean geometric initials badges on dark stadium backdrop.
 */
export function Avatar({
  name = '',
  photoUrl = null,
  crestUrl = null,
  color = '#10B981',
  size = 36,
  shape = 'square',
  className = '',
}) {
  const [imgError, setImgError] = useState(false);
  const effectiveUrl = photoUrl || crestUrl;

  // Compute clean initials (up to 2 characters)
  const initials = name
    ? name
        .trim()
        .split(/\s+/)
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '??';

  const borderRadius = shape === 'circle' ? '50%' : '8px';
  const cleanColor = color && color.startsWith('#') ? color : '#10B981';

  if (effectiveUrl && !imgError) {
    return (
      <div
        className={`avatar ${className}`}
        style={{
          width: size,
          height: size,
          borderRadius,
          boxShadow: `0 0 0 2px var(--bg-canvas), 0 0 0 3.5px ${cleanColor}`,
          background: 'var(--bg-elevated)',
          flexShrink: 0,
        }}
      >
        <img
          src={effectiveUrl}
          alt={name}
          loading="lazy"
          onError={() => setImgError(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
    );
  }

  return (
    <div
      className={`avatar ${className}`}
      title={name}
      style={{
        width: size,
        height: size,
        borderRadius,
        background: 'var(--bg-elevated)',
        boxShadow: `0 0 0 2px var(--bg-canvas), 0 0 0 3.5px ${cleanColor}`,
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-num)',
        fontSize: Math.max(12, Math.round(size * 0.42)),
        fontWeight: 700,
        letterSpacing: '0.04em',
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}
