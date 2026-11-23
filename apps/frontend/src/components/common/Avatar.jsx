import React, { useState } from 'react';

export function Avatar({ name = '', photoUrl = null, color = '#f0a53d', size = 36, shape = 'square' }) {
  const [imgError, setImgError] = useState(false);

  // Compute initials
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

  if (photoUrl && !imgError) {
    return (
      <div
        className="avatar"
        style={{
          width: size,
          height: size,
          borderRadius,
          border: `1.5px solid ${color}40`,
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
      style={{
        width: size,
        height: size,
        borderRadius,
        background: `linear-gradient(135deg, ${color}22, ${color}55)`,
        border: `1.5px solid ${color}66`,
        color: '#f4f1e6',
        fontSize: Math.max(11, Math.round(size * 0.38)),
      }}
    >
      {initials}
    </div>
  );
}
