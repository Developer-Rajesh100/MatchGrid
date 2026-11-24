import { apiClient } from './client';

export const playersApi = {
  getPlayers: (params = {}) => {
    const query = new URLSearchParams();
    if (params.team_id) query.append('team_id', params.team_id);
    if (params.tournament_id) query.append('tournament_id', params.tournament_id);
    if (params.tournament_slug) query.append('tournament_slug', params.tournament_slug);
    const qs = query.toString();
    return apiClient(`/api/players${qs ? `?${qs}` : ''}`);
  },
  getPlayer: (playerId) => apiClient(`/api/players/${playerId}`),
  createPlayer: (data) => apiClient('/api/players', { method: 'POST', body: data }),
  deletePlayer: (playerId) => apiClient(`/api/players/${playerId}`, { method: 'DELETE' }),
};
