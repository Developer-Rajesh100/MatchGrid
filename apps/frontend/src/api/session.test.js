import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AUTH_CHANGED_EVENT, clearSession, saveSession, session } from './session';
import { withQuery } from './client';

describe('session', () => {
  beforeEach(() => localStorage.clear());

  it('saves and clears the whole session together, announcing each change', () => {
    const reasons = [];
    const listener = (e) => reasons.push(e.detail.reason);
    window.addEventListener(AUTH_CHANGED_EVENT, listener);
    saveSession({ token: 't0k', username: 'ana', role: 'SCORER', userId: 'u1' });
    expect([session.token(), session.username(), session.role(), session.userId()]).toEqual(['t0k', 'ana', 'SCORER', 'u1']);
    clearSession('expired');
    expect([session.token(), session.role(), session.userId()]).toEqual(['', '', '']);
    expect(localStorage.length).toBe(0);
    expect(reasons).toEqual(['login', 'expired']);
    window.removeEventListener(AUTH_CHANGED_EVENT, listener);
  });

  it('a 401 on a signed-in call ends the session (role included), a failed sign-in does not announce one', async () => {
    const { apiClient } = await import('./client');
    const listener = vi.fn();
    window.addEventListener(AUTH_CHANGED_EVENT, listener);
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ detail: 'nope' }) }));

    await expect(apiClient('/api/auth/login', { method: 'POST', body: {} })).rejects.toThrow('nope');
    expect(listener).not.toHaveBeenCalled();

    saveSession({ token: 'old', username: 'ana', role: 'ORGANIZER', userId: 'u1' });
    listener.mockClear();
    await expect(apiClient('/api/organizer/tournaments')).rejects.toThrow('nope');
    expect(session.token()).toBe('');
    expect(session.role()).toBe('');
    expect(listener.mock.calls[0][0].detail.reason).toBe('expired');
    window.removeEventListener(AUTH_CHANGED_EVENT, listener);
  });
});

describe('withQuery', () => {
  it('skips empty values, maps slug to tournament_slug and accepts a bare tournament id', () => {
    expect(withQuery('/api/teams', { tournament_id: 'a1', slug: 'cup', team_id: '', date: null })).toBe(
      '/api/teams?tournament_id=a1&tournament_slug=cup'
    );
    expect(withQuery('/api/teams', 'a1')).toBe('/api/teams?tournament_id=a1');
    expect(withQuery('/api/standings', null)).toBe('/api/standings');
    expect(withQuery('/api/x', { tournament_slug: 'explicit', slug: 'alias' })).toBe('/api/x?tournament_slug=explicit');
  });
});
