import { apiClient } from './client';

export const organizerApi = {
  getMyTournaments: () => apiClient('/api/organizer/tournaments'),
  createTournament: (data) =>
    apiClient('/api/organizer/tournaments', {
      method: 'POST',
      body: data,
    }),
  getTournamentMatches: (tournamentId) => apiClient(`/api/organizer/tournaments/${tournamentId}/matches`),
  updateTournament: (tournamentId, data) =>
    apiClient(`/api/organizer/tournaments/${tournamentId}`, { method: 'PATCH', body: data }),
  updateConfig: (tournamentId, config) =>
    apiClient(`/api/organizer/tournaments/${tournamentId}/config`, { method: 'PATCH', body: config }),
  deleteTournament: (tournamentId) =>
    apiClient(`/api/organizer/tournaments/${tournamentId}`, {
      method: 'DELETE',
    }),
  getScorers: () => apiClient('/api/organizer/scorers'),
  createScorer: (usernameOrData, maybePassword = null) => {
    const payload =
      typeof usernameOrData === 'object' && usernameOrData !== null
        ? usernameOrData
        : { username: usernameOrData, password: maybePassword };
    return apiClient('/api/organizer/scorers', {
      method: 'POST',
      body: payload,
    });
  },
  deleteScorer: (scorerId) =>
    apiClient(`/api/organizer/scorers/${scorerId}`, {
      method: 'DELETE',
    }),
  assignScorer: (matchId, scorerId) =>
    apiClient(`/api/organizer/matches/${matchId}/scorers`, {
      method: 'POST',
      body: { scorer_id: scorerId },
    }),
  removeScorer: (matchId, scorerId) =>
    apiClient(`/api/organizer/matches/${matchId}/scorers/${scorerId}`, {
      method: 'DELETE',
    }),
};
