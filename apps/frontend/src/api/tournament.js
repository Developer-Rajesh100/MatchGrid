import { apiClient } from './client';

export const tournamentApi = {
  getTournament: () => apiClient('/api/tournament'),
  getPublicTournaments: () => apiClient('/api/tournaments/public'),
  getTournamentBySlug: (slug) => apiClient(`/api/tournaments/slug/${slug}`),
  getTournamentById: (id) => apiClient(`/api/tournaments/${id}`),
  updateTournament: (data) =>
    apiClient('/api/tournament', { method: 'PATCH', body: data }),
  updateConfig: (config) =>
    apiClient('/api/tournament/config', { method: 'PATCH', body: config }),
};
