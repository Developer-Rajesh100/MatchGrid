import { apiClient } from './client';

export const tournamentApi = {
  getPublicTournaments: () => apiClient('/api/tournaments/public'),
  getTournamentBySlug: (slug) => apiClient(`/api/tournaments/slug/${slug}`),
  getTournamentById: (id) => apiClient(`/api/tournaments/${id}`),
};
