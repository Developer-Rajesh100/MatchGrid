import { apiClient } from './client';

export const standingsApi = {
  getStandings: (param = null) => {
    if (typeof param === 'string' && param) {
      return apiClient(`/api/standings/${param}`);
    }
    const q = new URLSearchParams();
    if (param?.tournament_id) q.append('tournament_id', param.tournament_id);
    if (param?.tournament_slug || param?.slug) q.append('tournament_slug', param.tournament_slug || param.slug);
    const qs = q.toString();
    return apiClient(`/api/standings${qs ? `?${qs}` : ''}`);
  },
};

