import { APIRequestContext } from '@playwright/test';

export const ADMIN_CREDENTIALS = {
  username: process.env.ADMIN_BOOTSTRAP_USERNAME || 'admin',
  password: process.env.ADMIN_BOOTSTRAP_PASSWORD || 'replace-with-a-strong-password',
};

export const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8001';

export interface TestEntityTracker {
  teamIds: string[];
  playerIds: string[];
  matchIds: string[];
  tournamentIds: string[];
  userIds: string[];
  scorerIds: string[];
}

export function createEntityTracker(): TestEntityTracker {
  return {
    teamIds: [],
    playerIds: [],
    matchIds: [],
    tournamentIds: [],
    userIds: [],
    scorerIds: [],
  };
}

export async function loginAsAdmin(
  request: APIRequestContext,
  credentials = ADMIN_CREDENTIALS
): Promise<string> {
  const response = await request.post(`${API_BASE_URL}/api/auth/login`, {
    data: credentials,
  });

  if (!response.ok()) {
    throw new Error(`Failed to log in as admin: ${response.status()} ${await response.text()}`);
  }

  const data = await response.json();
  return data.access_token;
}

export async function loginUser(
  request: APIRequestContext,
  credentials: { username: string; password: string }
): Promise<string> {
  const response = await request.post(`${API_BASE_URL}/api/auth/login`, {
    data: credentials,
  });

  if (!response.ok()) {
    throw new Error(`Failed to log in as ${credentials.username}: ${response.status()} ${await response.text()}`);
  }

  const data = await response.json();
  return data.access_token;
}

export async function createTestTeam(
  request: APIRequestContext,
  token: string,
  data: { name: string; color?: string; group_name?: string; tournament_id?: string }
): Promise<any> {
  const response = await request.post(`${API_BASE_URL}/api/teams`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name: data.name,
      color: data.color || '#10B981',
      group_name: data.group_name || null,
      tournament_id: data.tournament_id || undefined,
    },
  });

  if (!response.ok()) {
    throw new Error(`Failed to create test team: ${response.status()} ${await response.text()}`);
  }

  return response.json();
}

export async function createTestPlayer(
  request: APIRequestContext,
  token: string,
  data: { team_id: string; name: string; number: number; dcl_id?: string; is_manager?: boolean }
): Promise<any> {
  const response = await request.post(`${API_BASE_URL}/api/players`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      team_id: data.team_id,
      name: data.name,
      number: data.number,
      dcl_id: data.dcl_id || `TEST-${Date.now().toString().slice(-4)}`,
      is_manager: data.is_manager || false,
    },
  });

  if (!response.ok()) {
    throw new Error(`Failed to create test player: ${response.status()} ${await response.text()}`);
  }

  return response.json();
}

export async function createTestMatch(
  request: APIRequestContext,
  token: string,
  data: {
    team1_id: string;
    team2_id: string;
    stage?: 'extra' | 'group';
    label?: string;
    match_number?: number;
    venue?: string;
    date?: string;
    tournament_id?: string;
  }
): Promise<any> {
  const response = await request.post(`${API_BASE_URL}/api/matches`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      stage: data.stage || 'extra',
      team1_id: data.team1_id,
      team2_id: data.team2_id,
      date: data.date || new Date().toISOString().split('T')[0],
      label: data.label || 'Friendly Test Match',
      match_number: data.match_number || Math.floor(100 + Math.random() * 800),
      venue: data.venue || 'MatchGrid Arena',
      tournament_id: data.tournament_id || undefined,
    },
  });

  if (!response.ok()) {
    throw new Error(`Failed to create test match: ${response.status()} ${await response.text()}`);
  }

  return response.json();
}

export async function deleteMatch(request: APIRequestContext, token: string, matchId: string): Promise<void> {
  await request.delete(`${API_BASE_URL}/api/matches/${matchId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function deletePlayer(request: APIRequestContext, token: string, playerId: string): Promise<void> {
  await request.delete(`${API_BASE_URL}/api/players/${playerId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function deleteTeam(request: APIRequestContext, token: string, teamId: string): Promise<void> {
  await request.delete(`${API_BASE_URL}/api/teams/${teamId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function createOrganizer(
  request: APIRequestContext,
  superadminToken: string,
  data: { username: string; password: string; organization_name?: string; email?: string }
): Promise<any> {
  const response = await request.post(`${API_BASE_URL}/api/superadmin/organizers`, {
    headers: { Authorization: `Bearer ${superadminToken}` },
    data: {
      username: data.username,
      password: data.password,
      organization_name: data.organization_name || 'E2E Organization',
      email: data.email || `${data.username}@matchgrid.internal`,
    },
  });

  if (!response.ok()) {
    throw new Error(`Failed to create organizer: ${response.status()} ${await response.text()}`);
  }

  return response.json();
}

export async function deleteUser(request: APIRequestContext, superadminToken: string, userId: string): Promise<void> {
  await request.delete(`${API_BASE_URL}/api/superadmin/users/${userId}`, {
    headers: { Authorization: `Bearer ${superadminToken}` },
  });
}

export async function createTournament(
  request: APIRequestContext,
  token: string,
  data: { name: string; season: string; slug?: string; format_description?: string; logo_url?: string }
): Promise<any> {
  const response = await request.post(`${API_BASE_URL}/api/organizer/tournaments`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name: data.name,
      season: data.season,
      slug: data.slug,
      format_description: data.format_description,
      logo_url: data.logo_url,
    },
  });

  if (!response.ok()) {
    throw new Error(`Failed to create tournament: ${response.status()} ${await response.text()}`);
  }

  return response.json();
}

export async function deleteTournament(request: APIRequestContext, token: string, tournamentId: string): Promise<void> {
  await request.delete(`${API_BASE_URL}/api/organizer/tournaments/${tournamentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function createScorer(
  request: APIRequestContext,
  organizerToken: string,
  data: { username: string; password: string }
): Promise<any> {
  const response = await request.post(`${API_BASE_URL}/api/organizer/scorers`, {
    headers: { Authorization: `Bearer ${organizerToken}` },
    data: {
      username: data.username,
      password: data.password,
    },
  });

  if (!response.ok()) {
    throw new Error(`Failed to create scorer: ${response.status()} ${await response.text()}`);
  }

  return response.json();
}

export async function deleteScorer(request: APIRequestContext, organizerToken: string, scorerId: string): Promise<void> {
  await request.delete(`${API_BASE_URL}/api/organizer/scorers/${scorerId}`, {
    headers: { Authorization: `Bearer ${organizerToken}` },
  });
}

export async function assignScorerToMatch(
  request: APIRequestContext,
  organizerToken: string,
  matchId: string,
  scorerId: string
): Promise<any> {
  const response = await request.post(`${API_BASE_URL}/api/organizer/matches/${matchId}/scorers`, {
    headers: { Authorization: `Bearer ${organizerToken}` },
    data: { scorer_id: scorerId },
  });

  if (!response.ok()) {
    throw new Error(`Failed to assign scorer to match: ${response.status()} ${await response.text()}`);
  }

  return response.json();
}

export async function removeScorerFromMatch(
  request: APIRequestContext,
  organizerToken: string,
  matchId: string,
  scorerId: string
): Promise<any> {
  const response = await request.delete(`${API_BASE_URL}/api/organizer/matches/${matchId}/scorers/${scorerId}`, {
    headers: { Authorization: `Bearer ${organizerToken}` },
  });

  if (!response.ok()) {
    throw new Error(`Failed to remove scorer from match: ${response.status()} ${await response.text()}`);
  }

  return response.json();
}

export async function teardownEntities(
  request: APIRequestContext,
  token: string,
  tracker: TestEntityTracker
): Promise<void> {
  // 1. Delete matches first
  for (const matchId of tracker.matchIds) {
    try {
      await deleteMatch(request, token, matchId);
    } catch {
      // Ignore cleanup error if already deleted
    }
  }

  // 2. Delete players
  for (const playerId of tracker.playerIds) {
    try {
      await deletePlayer(request, token, playerId);
    } catch {
      // Ignore cleanup error
    }
  }

  // 3. Delete teams
  for (const teamId of tracker.teamIds) {
    try {
      await deleteTeam(request, token, teamId);
    } catch {
      // Ignore cleanup error
    }
  }

  // 4. Delete tournaments (cascades any associated fixtures)
  for (const tournamentId of tracker.tournamentIds) {
    try {
      await deleteTournament(request, token, tournamentId);
    } catch {
      // Ignore cleanup error
    }
  }

  // 5. Delete scorers
  for (const scorerId of tracker.scorerIds) {
    try {
      await deleteUser(request, token, scorerId);
    } catch {
      // Ignore cleanup error
    }
  }

  // 6. Delete users (e.g. organizers)
  for (const userId of tracker.userIds) {
    try {
      await deleteUser(request, token, userId);
    } catch {
      // Ignore cleanup error
    }
  }
}
