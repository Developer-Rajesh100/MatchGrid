import { apiClient } from './client';

export const authApi = {
  login: async (username, password) => {
    const res = await apiClient('/api/auth/login', {
      method: 'POST',
      body: { username, password },
    });
    if (res?.access_token) {
      localStorage.setItem('matchgrid_admin_token', res.access_token);
      localStorage.setItem('matchgrid_admin_username', username);
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
    localStorage.removeItem('dcl_admin_token');
    localStorage.removeItem('dcl_admin_username');

    window.dispatchEvent(new Event('matchgrid-auth-changed'));
    window.dispatchEvent(new Event('dcl-auth-changed'));
  },
  getUsername: () =>
    localStorage.getItem('matchgrid_admin_username') ||
    localStorage.getItem('dcl_admin_username') ||
    'Admin',
  isAuthenticated: () =>
    Boolean(
      localStorage.getItem('matchgrid_admin_token') ||
      localStorage.getItem('dcl_admin_token')
    ),
};
