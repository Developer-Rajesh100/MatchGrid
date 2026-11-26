import { apiClient, withQuery } from './client';

export const standingsApi = {
  // A string is one group's id; an object scopes the whole tournament ({ tournament_id | slug }).
  getStandings: (param = null) =>
    typeof param === 'string' && param
      ? apiClient(`/api/standings/${param}`)
      : apiClient(withQuery('/api/standings', param)),
};
