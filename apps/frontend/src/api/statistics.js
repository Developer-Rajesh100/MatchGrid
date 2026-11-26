import { apiClient, withQuery } from './client';

export const statisticsApi = {
  getLeaderboards: (params = {}) => apiClient(withQuery('/api/statistics/leaderboards', params)),
};
