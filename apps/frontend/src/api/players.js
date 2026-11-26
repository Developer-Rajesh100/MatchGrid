import { apiClient, withQuery } from './client';

export const playersApi = {
  getPlayers: (params = {}) => apiClient(withQuery('/api/players', params)),
  getPlayer: (playerId) => apiClient(`/api/players/${playerId}`),
  createPlayer: (data) => apiClient('/api/players', { method: 'POST', body: data }),
  deletePlayer: (playerId) => apiClient(`/api/players/${playerId}`, { method: 'DELETE' }),
};
