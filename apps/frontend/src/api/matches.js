import { apiClient, withQuery } from './client';

export const matchesApi = {
  getMatches: (params = {}) => {
    const { team_id, status, stage, group_id, date, tournament_id, tournament_slug, slug } = params;
    return apiClient(withQuery('/api/matches', { team_id, status, stage, group_id, date, tournament_id, tournament_slug, slug }));
  },
  getFeaturedLive: (limit = 8) => apiClient(`/api/matches/featured?limit=${limit}`),
  getMatch: (matchId) => apiClient(`/api/matches/${matchId}`),
  createMatch: (data) => apiClient('/api/matches', { method: 'POST', body: data }),
  deleteMatch: (matchId) => apiClient(`/api/matches/${matchId}`, { method: 'DELETE' }),
  updateMatch: (matchId, data) => apiClient(`/api/matches/${matchId}`, { method: 'PATCH', body: data }),
  assignTeams: (matchId, team1Id, team2Id) =>
    apiClient(`/api/matches/${matchId}/teams`, {
      method: 'PUT',
      body: { team1_id: team1Id, team2_id: team2Id },
    }),
  startMatch: (matchId) => apiClient(`/api/matches/${matchId}/start`, { method: 'POST' }),
  endMatch: (matchId) => apiClient(`/api/matches/${matchId}/end`, { method: 'POST' }),
  reopenMatch: (matchId) => apiClient(`/api/matches/${matchId}/reopen`, { method: 'POST' }),
  pauseHalfTime: (matchId, data = {}) =>
    apiClient(`/api/matches/${matchId}/half-time`, { method: 'POST', body: data }),
  resumeMatch: (matchId) =>
    apiClient(`/api/matches/${matchId}/resume`, { method: 'POST' }),
  resetTimer: (matchId) =>
    apiClient(`/api/matches/${matchId}/reset-timer`, { method: 'POST' }),
  cancelMatch: (matchId) => apiClient(`/api/matches/${matchId}/cancel`, { method: 'POST' }),
  uncancelMatch: (matchId) => apiClient(`/api/matches/${matchId}/uncancel`, { method: 'POST' }),
  setWinner: (matchId, teamId) =>
    apiClient(`/api/matches/${matchId}/winner`, { method: 'POST', body: { team_id: teamId } }),
  updateLineup: (matchId, playerIds) =>
    apiClient(`/api/matches/${matchId}/lineup`, { method: 'PUT', body: { player_ids: playerIds } }),
  addEvent: (matchId, eventData) =>
    apiClient(`/api/matches/${matchId}/events`, { method: 'POST', body: eventData }),
  deleteEvent: (matchId, eventId) =>
    apiClient(`/api/matches/${matchId}/events/${eventId}`, { method: 'DELETE' }),
  generateGroupFixtures: (groupId, force = false) =>
    apiClient('/api/matches/generate-group-fixtures', {
      method: 'POST',
      body: { group_id: groupId, force },
    }),
  getGroups: (params = {}) => {
    const { tournament_id, tournament_slug, slug } = params || {};
    return apiClient(withQuery('/api/groups', { tournament_id, tournament_slug, slug }));
  },
  randomGroupDraw: (tournamentId = null) =>
    apiClient(withQuery('/api/groups/random-draw', { tournament_id: tournamentId }), { method: 'POST' }),
  seedKnockout: (tournamentId = null) =>
    apiClient(withQuery('/api/matches/seed-knockout', { tournament_id: tournamentId }), { method: 'POST' }),
  // getBracket(id), getBracket(id, slug) or getBracket({ tournament_id | id, tournament_slug | slug }).
  getBracket: (tournamentIdOrParams, maybeSlug = null) => {
    const p = typeof tournamentIdOrParams === 'object' && tournamentIdOrParams !== null
      ? { tournament_id: tournamentIdOrParams.tournament_id || tournamentIdOrParams.id, slug: tournamentIdOrParams.tournament_slug || tournamentIdOrParams.slug }
      : { tournament_id: tournamentIdOrParams, slug: maybeSlug };
    return apiClient(withQuery('/api/matches/bracket', p));
  },
  getAssignedMatches: () =>
    apiClient('/api/scorer/matches'),
};

