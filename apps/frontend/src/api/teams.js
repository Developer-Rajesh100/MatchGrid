import { apiClient, withQuery } from './client';

export const teamsApi = {
  getTeams: (params = {}) => apiClient(withQuery('/api/teams', params)),
  getTeam: (teamId) => apiClient(`/api/teams/${teamId}`),
  createTeam: (data) => apiClient('/api/teams', { method: 'POST', body: data }),
  updateTeam: (teamId, data) => apiClient(`/api/teams/${teamId}`, { method: 'PATCH', body: data }),
  deleteTeam: (teamId) => apiClient(`/api/teams/${teamId}`, { method: 'DELETE' }),
};
