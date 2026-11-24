import { apiClient } from './client';

export const statisticsApi = {
  getLeaderboards: (params = {}) => {
    const q = new URLSearchParams();
    if (params?.tournament_id) q.append('tournament_id', params.tournament_id);
    if (params?.tournament_slug || params?.slug) q.append('tournament_slug', params.tournament_slug || params.slug);
    const qs = q.toString();
    return apiClient(`/api/statistics/leaderboards${qs ? `?${qs}` : ''}`);
  },
};

