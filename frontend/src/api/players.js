import { apiClient } from './client';

export const playersApi = {
  getPlayers: (params = {}) => {
    const query = new URLSearchParams();
    if (params.team_id) query.append('team_id', params.team_id);
    const qs = query.toString();
    return apiClient(`/api/players${qs ? `?${qs}` : ''}`);
  },
  getPlayer: (playerId) => apiClient(`/api/players/${playerId}`),
  createPlayer: (data) => apiClient('/api/players', { method: 'POST', body: data }),
  updatePlayer: (playerId, data) => apiClient(`/api/players/${playerId}`, { method: 'PATCH', body: data }),
  deletePlayer: (playerId) => apiClient(`/api/players/${playerId}`, { method: 'DELETE' }),
};
