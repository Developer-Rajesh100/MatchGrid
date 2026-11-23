import React, { useState } from 'react';

/**
 * Geometric, high-craft Avatar component.
 * Supports team crests and player photos with graceful fallback to
 * clean geometric initials badges on dark stadium backdrop.
 */
export function Avatar({
  name = '',
  photoUrl = null,
  color = '#10B981',
  size = 36,
  shape = 'square',
}) {
  const [imgError, setImgError] = useState(false);

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

  if (photoUrl && !imgError) {
    return (
      <div
        className="avatar"
        style={{
          width: size,
          height: size,
          borderRadius,
          border: `1.5px solid ${cleanColor}55`,
          background: 'var(--bg-elevated)',
          flexShrink: 0,
        }}
      >
        <img
          src={photoUrl}
          alt={name}
          onError={() => setImgError(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
    );
  }

  return (
    <div
      className="avatar"
      title={name}
      style={{
        width: size,
        height: size,
        borderRadius,
        background: `linear-gradient(135deg, ${cleanColor}22, ${cleanColor}44)`,
        border: `1.5px solid ${cleanColor}77`,
        color: 'var(--text-primary)',
        fontSize: Math.max(11, Math.round(size * 0.38)),
        fontWeight: 700,
        letterSpacing: '0.5px',
        flexShrink: 0,
        boxShadow: `0 2px 8px ${cleanColor}22`,
      }}
    >
      {initials}
    </div>
  );
}
