import { apiClient } from './client';

export const tournamentApi = {
  getTournament: () => apiClient('/api/tournament'),
};
