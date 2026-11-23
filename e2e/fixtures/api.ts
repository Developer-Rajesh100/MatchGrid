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
}

export function createEntityTracker(): TestEntityTracker {
  return {
    teamIds: [],
    playerIds: [],
    matchIds: [],
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

export async function createTestTeam(
  request: APIRequestContext,
  token: string,
  data: { name: string; color?: string; group_name?: string }
): Promise<any> {
  const response = await request.post(`${API_BASE_URL}/api/teams`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name: data.name,
      color: data.color || '#10B981',
      group_name: data.group_name || null,
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

export async function teardownEntities(
  request: APIRequestContext,
  token: string,
  tracker: TestEntityTracker
): Promise<void> {
  // Delete matches first
  for (const matchId of tracker.matchIds) {
    try {
      await deleteMatch(request, token, matchId);
    } catch {
      // Ignore cleanup error if already deleted
    }
  }

  // Delete players
  for (const playerId of tracker.playerIds) {
    try {
      await deletePlayer(request, token, playerId);
    } catch {
      // Ignore cleanup error
    }
  }

  // Delete teams
  for (const teamId of tracker.teamIds) {
    try {
      await deleteTeam(request, token, teamId);
    } catch {
      // Ignore cleanup error
    }
  }
}
