import { apiClient } from './client';

export const matchesApi = {
  getMatches: (params = {}) => {
    const query = new URLSearchParams();
    if (params.team_id) query.append('team_id', params.team_id);
    if (params.status) query.append('status', params.status);
    if (params.stage) query.append('stage', params.stage);
    if (params.group_id) query.append('group_id', params.group_id);
    if (params.date) query.append('date', params.date);
    const qs = query.toString();
    return apiClient(`/api/matches${qs ? `?${qs}` : ''}`);
  },
  getMatch: (matchId) => apiClient(`/api/matches/${matchId}`),
  updateMatch: (matchId, data) => apiClient(`/api/matches/${matchId}`, { method: 'PATCH', body: data }),
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
  generateSemis: () =>
    apiClient('/api/matches/generate-semis', { method: 'POST' }),
  generateFinal: () =>
    apiClient('/api/matches/generate-final', { method: 'POST' }),
  getGroups: () =>
    apiClient('/api/groups'),
  randomGroupDraw: () =>
    apiClient('/api/groups/random-draw', { method: 'POST' }),
};
