import { apiClient } from './client';

export const authApi = {
  login: async (username, password) => {
    const res = await apiClient('/api/auth/login', {
      method: 'POST',
      body: { username, password },
    });
    if (res?.access_token) {
      localStorage.setItem('dcl_admin_token', res.access_token);
      localStorage.setItem('dcl_admin_username', username);
      window.dispatchEvent(new Event('dcl-auth-changed'));
    }
    return res;
  },
  logout: () => {
    localStorage.removeItem('dcl_admin_token');
    localStorage.removeItem('dcl_admin_username');
    window.dispatchEvent(new Event('dcl-auth-changed'));
  },
  getMe: () => apiClient('/api/auth/me'),
  getToken: () => localStorage.getItem('dcl_admin_token'),
  getUsername: () => localStorage.getItem('dcl_admin_username') || 'Admin',
  isAuthenticated: () => !!localStorage.getItem('dcl_admin_token'),
};
