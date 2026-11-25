import { apiClient } from './client';

export const matchesApi = {
  getMatches: (params = {}) => {
    const query = new URLSearchParams();
    if (params.team_id) query.append('team_id', params.team_id);
    if (params.status) query.append('status', params.status);
    if (params.stage) query.append('stage', params.stage);
    if (params.group_id) query.append('group_id', params.group_id);
    if (params.date) query.append('date', params.date);
    if (params.tournament_id) query.append('tournament_id', params.tournament_id);
    if (params.tournament_slug || params.slug) query.append('tournament_slug', params.tournament_slug || params.slug);
    const qs = query.toString();
    return apiClient(`/api/matches${qs ? `?${qs}` : ''}`);
  },
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
    const q = new URLSearchParams();
    if (params?.tournament_id) q.append('tournament_id', params.tournament_id);
    if (params?.tournament_slug || params?.slug) q.append('tournament_slug', params.tournament_slug || params.slug);
    const qs = q.toString();
    return apiClient(`/api/groups${qs ? `?${qs}` : ''}`);
  },
  randomGroupDraw: (tournamentId = null) =>
    apiClient(`/api/groups/random-draw${tournamentId ? `?tournament_id=${tournamentId}` : ''}`, { method: 'POST' }),
  seedKnockout: (tournamentId = null) =>
    apiClient(`/api/matches/seed-knockout${tournamentId ? `?tournament_id=${tournamentId}` : ''}`, { method: 'POST' }),
  getBracket: (tournamentIdOrParams, maybeSlug = null) => {
    let tId = null;
    let tSlug = null;
    if (typeof tournamentIdOrParams === 'object' && tournamentIdOrParams !== null) {
      tId = tournamentIdOrParams.tournament_id || tournamentIdOrParams.id;
      tSlug = tournamentIdOrParams.tournament_slug || tournamentIdOrParams.slug;
    } else {
      tId = tournamentIdOrParams;
      tSlug = maybeSlug;
    }
    const q = new URLSearchParams();
    if (tId) q.append('tournament_id', tId);
    if (tSlug) q.append('tournament_slug', tSlug);
    const qs = q.toString();
    return apiClient(`/api/matches/bracket${qs ? `?${qs}` : ''}`);
  },
  getAssignedMatches: () =>
    apiClient('/api/scorer/matches'),
};

