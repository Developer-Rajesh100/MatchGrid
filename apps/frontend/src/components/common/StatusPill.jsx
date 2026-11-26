import React from 'react';


export function StatusPill({ status, isHalfTime = false }) {
  if (status === 'live') {
    if (isHalfTime) {
      return (
        <span className="pill pill-halftime" data-testid="status-pill-halftime">
          <span className="pill-dot"></span>
          Half Time
        </span>
      );
    }
    return (
      <span className="pill pill-live">
        <span className="pill-dot"></span>
        Live
      </span>
    );
  }
  if (status === 'full_time') {
    return (
      <span className="pill pill-full-time">
        <span className="pill-dot"></span>
        FT
      </span>
    );
  }
  if (status === 'cancelled') {
    return (
      <span className="pill pill-cancelled">
        <span className="pill-dot"></span>
        Cancelled
      </span>
    );
  }
  return (
    <span className="pill pill-upcoming">
      <span className="pill-dot"></span>
      Upcoming
    </span>
  );
}
