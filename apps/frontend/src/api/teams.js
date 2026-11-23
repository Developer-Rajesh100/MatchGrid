import { apiClient } from './client';

export const teamsApi = {
  getTeams: () => apiClient('/api/teams'),
  getTeam: (teamId) => apiClient(`/api/teams/${teamId}`),
  updateTeam: (teamId, data) => apiClient(`/api/teams/${teamId}`, { method: 'PATCH', body: data }),
};
