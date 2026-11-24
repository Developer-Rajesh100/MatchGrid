import { apiClient } from './client';

export const authApi = {
  login: async (username, password) => {
    const res = await apiClient('/api/auth/login', {
      method: 'POST',
      body: { username, password },
    });
    if (res?.access_token) {
      const role = res.role || 'SUPER_ADMIN';
      const userId = res.user_id || '';

      localStorage.setItem('matchgrid_admin_token', res.access_token);
      localStorage.setItem('matchgrid_admin_username', username);
      localStorage.setItem('matchgrid_role', role);
      localStorage.setItem('matchgrid_user_id', userId);

      // Compatibility aliases
      localStorage.setItem('dcl_admin_token', res.access_token);
      localStorage.setItem('dcl_admin_username', username);

      window.dispatchEvent(new Event('matchgrid-auth-changed'));
      window.dispatchEvent(new Event('dcl-auth-changed'));
    }
    return res;
  },
  logout: () => {
    localStorage.removeItem('matchgrid_admin_token');
    localStorage.removeItem('matchgrid_admin_username');
    localStorage.removeItem('matchgrid_role');
    localStorage.removeItem('matchgrid_user_id');
    localStorage.removeItem('dcl_admin_token');
    localStorage.removeItem('dcl_admin_username');

    window.dispatchEvent(new Event('matchgrid-auth-changed'));
    window.dispatchEvent(new Event('dcl-auth-changed'));
  },
  getUsername: () =>
    localStorage.getItem('matchgrid_admin_username') ||
    localStorage.getItem('dcl_admin_username') ||
    'Admin',
  getRole: () =>
    localStorage.getItem('matchgrid_role') || 'SUPER_ADMIN',
  getUserId: () =>
    localStorage.getItem('matchgrid_user_id') || '',
  hasRole: (allowedRoles) => {
    const role = authApi.getRole();
    return Array.isArray(allowedRoles) ? allowedRoles.includes(role) : role === allowedRoles;
  },
  isSuperAdmin: () => authApi.getRole() === 'SUPER_ADMIN',
  isOrganizer: () => authApi.getRole() === 'ORGANIZER',
  isScorer: () => authApi.getRole() === 'SCORER',
  isAuthenticated: () =>
    Boolean(
      localStorage.getItem('matchgrid_admin_token') ||
      localStorage.getItem('dcl_admin_token')
    ),
};
