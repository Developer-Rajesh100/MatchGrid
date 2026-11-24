import { apiClient } from './client';

export const tournamentApi = {
  getTournament: () => apiClient('/api/tournament'),
  updateTournament: (data) =>
    apiClient('/api/tournament', { method: 'PATCH', body: data }),
  updateConfig: (config) =>
    apiClient('/api/tournament/config', { method: 'PATCH', body: config }),
};
