import React, { useEffect, useReducer, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { authApi } from '../../api/auth';
import { AUTH_CHANGED_EVENT } from '../../api/session';
import { ForbiddenState } from './Common';

/**
 * Route guard for the role portals.
 *  - no session (or a session with no stored role) -> redirect to the login page, remembering where
 *    the visitor was headed. If a session that WAS valid disappears while the page is open (a 401
 *    from the API clears it), the same redirect happens live and the login page says it expired.
 *  - signed in but with the wrong role -> a proper 403 screen (not a silent bounce to the home page).
 */
export function RoleGuard({
  allowedRoles = ['SUPER_ADMIN', 'ORGANIZER'],
  children,
  fallbackPath = '/login',
}) {
  const location = useLocation();
  const [, rerender] = useReducer((n) => n + 1, 0);
  const hadSession = useRef(false);
  const lastReason = useRef(null);

  useEffect(() => {
    // client.js clears the token on a 401 ('expired'); the nav bar's Logout announces 'logout'.
    // Other tabs signal through storage events.
    const onAuthChanged = (event) => {
      lastReason.current = event?.detail?.reason || 'expired';
      rerender();
    };
    window.addEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
    window.addEventListener('storage', rerender);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
      window.removeEventListener('storage', rerender);
    };
  }, []);

  const role = authApi.getRole();
  const signedIn = authApi.isAuthenticated() && Boolean(role);

  if (!signedIn) {
    // A deliberate logout is not an expiry: go home instead of nagging with a "session expired" login.
    if (hadSession.current && lastReason.current === 'logout') return <Navigate to="/" replace />;
    const expired = hadSession.current;
    return <Navigate to={fallbackPath} replace state={{ from: location, expired }} />;
  }
  hadSession.current = true;

  if (allowedRoles && allowedRoles.length > 0 && !authApi.hasRole(allowedRoles)) {
    return <ForbiddenState role={role} homePath={authApi.homePathForRole(role)} homeLabel="Go to my workspace" />;
  }

  return children;
}
