import { describe, expect, it, vi, afterEach } from 'vitest';
import { buildApiUrl, buildWsUrl, resolveApiBase } from './config';
import { apiClient } from './api/client';

const here = (protocol, host) => ({ protocol, host });

describe('API and WebSocket base URLs', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('stays same-origin when nothing is configured (local dev and Docker Compose)', () => {
    expect(resolveApiBase({})).toBe('');
    expect(buildApiUrl('/api/matches', '')).toBe('/api/matches');
    expect(buildWsUrl('', {}, here('http:', 'localhost:5173'))).toBe('ws://localhost:5173/ws/live');
    expect(buildWsUrl('?tournament_id=abc', {}, here('https:', 'matchgrid.example'))).toBe(
      'wss://matchgrid.example/ws/live?tournament_id=abc'
    );
  });

  it('points REST at the API origin and ignores stray whitespace and trailing slashes', () => {
    const env = { VITE_API_URL: '  https://api.onrender.com/// ' };
    expect(resolveApiBase(env)).toBe('https://api.onrender.com');
    expect(buildApiUrl('/api/auth/login', resolveApiBase(env))).toBe('https://api.onrender.com/api/auth/login');
  });

  it('derives the socket from the API URL, https becoming wss', () => {
    expect(buildWsUrl('', { VITE_API_URL: 'https://api.onrender.com' }, here('https:', 'app.vercel.app'))).toBe(
      'wss://api.onrender.com/ws/live'
    );
    expect(buildWsUrl('', { VITE_API_URL: 'http://localhost:8001' }, here('http:', 'localhost:5173'))).toBe(
      'ws://localhost:8001/ws/live'
    );
  });

  it('lets VITE_WS_URL override the derived socket and keeps the tournament room in the query', () => {
    const env = { VITE_API_URL: 'https://api.onrender.com', VITE_WS_URL: 'wss://ws.example.com/' };
    expect(buildWsUrl('?tournament_id=t1', env, here('https:', 'app.vercel.app'))).toBe(
      'wss://ws.example.com/ws/live?tournament_id=t1'
    );
  });

  it('apiClient sends every request to the configured API origin', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.onrender.com');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: 1 }) });
    vi.stubGlobal('fetch', fetchMock);
    await apiClient('/api/tournaments/public');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.onrender.com/api/tournaments/public');
  });

  it('apiClient stays relative when no API URL is set', async () => {
    vi.stubEnv('VITE_API_URL', '');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    await apiClient('/api/tournaments/public');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/tournaments/public');
  });
});
