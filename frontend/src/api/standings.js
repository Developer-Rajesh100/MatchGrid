import { apiClient } from './client';

export const standingsApi = {
  getStandings: (groupId = null) =>
    apiClient(groupId ? `/api/standings/${groupId}` : '/api/standings'),
};
