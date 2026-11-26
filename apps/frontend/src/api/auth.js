import { apiClient } from './client';
import { clearSession, saveSession, session } from './session';

const HOME_BY_ROLE = { SUPER_ADMIN: '/superadmin', ORGANIZER: '/organizer', SCORER: '/scorer' };

export const authApi = {
  login: async (username, password) => {
    const res = await apiClient('/api/auth/login', {
      method: 'POST',
      body: { username, password },
    });
    if (res?.access_token) {
      // The server always names the role; a response without one grants no portal at all.
      saveSession({ token: res.access_token, username, role: res.role || '', userId: res.user_id || '' });
    }
    return res;
  },
  logout: () => clearSession('logout'),
  getUsername: () => session.username() || 'Admin',
  // No default: a session without a stored role is not trusted to be anything (never SUPER_ADMIN).
  getRole: () => session.role(),
  getUserId: () => session.userId(),
  hasRole: (allowedRoles) => {
    const role = authApi.getRole();
    if (!role) return false;
    return Array.isArray(allowedRoles) ? allowedRoles.includes(role) : role === allowedRoles;
  },
  homePathForRole: (role = authApi.getRole()) => HOME_BY_ROLE[role] || '/login',
  isSuperAdmin: () => authApi.getRole() === 'SUPER_ADMIN',
  isOrganizer: () => authApi.getRole() === 'ORGANIZER',
  isScorer: () => authApi.getRole() === 'SCORER',
  isAuthenticated: () => Boolean(session.token()),
};
