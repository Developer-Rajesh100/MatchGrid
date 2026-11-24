import { apiClient } from './client';

export const teamsApi = {
  getTeams: (params = {}) => {
    const q = new URLSearchParams();
    if (params?.tournament_id) q.append('tournament_id', params.tournament_id);
    if (params?.tournament_slug || params?.slug) q.append('tournament_slug', params.tournament_slug || params.slug);
    const qs = q.toString();
    return apiClient(`/api/teams${qs ? `?${qs}` : ''}`);
  },
  getTeam: (teamId) => apiClient(`/api/teams/${teamId}`),
  updateTeam: (teamId, data) => apiClient(`/api/teams/${teamId}`, { method: 'PATCH', body: data }),
};
