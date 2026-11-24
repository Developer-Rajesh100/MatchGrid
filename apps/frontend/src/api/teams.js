import { apiClient } from './client';

export const teamsApi = {
  getTeams: (params = {}) => {
    const q = new URLSearchParams();
    if (typeof params === 'string') {
      q.append('tournament_id', params);
    } else {
      if (params?.tournament_id) q.append('tournament_id', params.tournament_id);
      if (params?.tournament_slug || params?.slug) q.append('tournament_slug', params.tournament_slug || params.slug);
    }
    const qs = q.toString();
    return apiClient(`/api/teams${qs ? `?${qs}` : ''}`);
  },
  getTeam: (teamId) => apiClient(`/api/teams/${teamId}`),
  createTeam: (data) => apiClient('/api/teams', { method: 'POST', body: data }),
  updateTeam: (teamId, data) => apiClient(`/api/teams/${teamId}`, { method: 'PATCH', body: data }),
  deleteTeam: (teamId) => apiClient(`/api/teams/${teamId}`, { method: 'DELETE' }),
};

