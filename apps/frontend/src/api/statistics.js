import { apiClient } from './client';

export const statisticsApi = {
  getLeaderboards: () => apiClient('/api/statistics/leaderboards'),
};
