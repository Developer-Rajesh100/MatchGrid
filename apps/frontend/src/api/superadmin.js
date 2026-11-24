import { apiClient } from './client';

export const superadminApi = {
  getStats: () => apiClient('/api/superadmin/stats'),
  getUsers: () => apiClient('/api/superadmin/users'),
  createOrganizer: (usernameOrData, maybePassword = null) => {
    const payload =
      typeof usernameOrData === 'object' && usernameOrData !== null
        ? usernameOrData
        : { username: usernameOrData, password: maybePassword };
    return apiClient('/api/superadmin/organizers', {
      method: 'POST',
      body: payload,
    });
  },
  updateUserStatus: (userId, isActive) =>
    apiClient(`/api/superadmin/users/${userId}/status`, {
      method: 'PATCH',
      body: { is_active: isActive },
    }),
  deleteUser: (userId) =>
    apiClient(`/api/superadmin/users/${userId}`, {
      method: 'DELETE',
    }),
  getTournaments: () => apiClient('/api/superadmin/tournaments'),
  deleteTournament: (tournamentId) =>
    apiClient(`/api/superadmin/tournaments/${tournamentId}`, {
      method: 'DELETE',
    }),
};
