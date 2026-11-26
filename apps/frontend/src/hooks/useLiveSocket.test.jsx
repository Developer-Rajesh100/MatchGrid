import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLiveSocket, LIVE_REFRESH_DELAY_MS } from './useLiveSocket';

// A fake WebSocketContext: records subscriptions and lets the test push frames into them.
const subs = [];
const subscribe = vi.fn((callback, tournamentId) => {
  const sub = { callback, tournamentId };
  subs.push(sub);
  return () => subs.splice(subs.indexOf(sub), 1);
});
vi.mock('../context/WebSocketContext', () => ({
  useWebSocket: () => ({ connected: true, isConnected: true, subscribe }),
}));
const push = (msg) => act(() => subs.forEach((s) => s.callback(msg)));

describe('useLiveSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    subs.length = 0;
    subscribe.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it('collapses a burst of frames into one call with the last frame', () => {
    const handler = vi.fn();
    renderHook(() => useLiveSocket(handler, 't1'));
    push({ type: 'match_event_added', match_id: 'm1' });
    push({ type: 'match_updated', match_id: 'm2' });
    push({ type: 'match_updated', match_id: 'm3' });
    expect(handler).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(LIVE_REFRESH_DELAY_MS); });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ type: 'match_updated', match_id: 'm3' });
  });

  it('does not subscribe at all until enabled (no global-room detour while a tournament loads)', () => {
    const handler = vi.fn();
    const { rerender } = renderHook(({ id }) => useLiveSocket(handler, id, { enabled: Boolean(id) }), {
      initialProps: { id: null },
    });
    expect(subscribe).not.toHaveBeenCalled();
    rerender({ id: 't1' });
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(subscribe.mock.calls[0][1]).toBe('t1');
  });

  it('applies the per-frame filter before coalescing, so an unrelated last frame cannot hide a relevant one', () => {
    const handler = vi.fn();
    renderHook(() => useLiveSocket(handler, 't1', { filter: (m) => m.match_id === 'mine' }));
    push({ type: 'match_event_added', match_id: 'mine' });
    push({ type: 'match_updated', match_id: 'downstream' });
    act(() => { vi.advanceTimersByTime(LIVE_REFRESH_DELAY_MS); });
    expect(handler).toHaveBeenCalledWith({ type: 'match_event_added', match_id: 'mine' });

    handler.mockClear();
    push({ type: 'match_updated', match_id: 'someone-else' });
    act(() => { vi.advanceTimersByTime(LIVE_REFRESH_DELAY_MS); });
    expect(handler).not.toHaveBeenCalled();
  });

  it('keeps only the listed types, but always lets a reconnect resync through', () => {
    const handler = vi.fn();
    renderHook(() => useLiveSocket(handler, null, { types: ['match_status_changed'], delayMs: 0 }));
    push({ type: 'match_event_added' });
    expect(handler).not.toHaveBeenCalled();
    push({ type: 'match_status_changed' });
    push({ type: 'resync' });
    expect(handler.mock.calls.map(([m]) => m.type)).toEqual(['match_status_changed', 'resync']);
  });

  it('drops a pending delivery when the component unmounts', () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useLiveSocket(handler, 't1'));
    push({ type: 'match_updated' });
    unmount();
    act(() => { vi.advanceTimersByTime(LIVE_REFRESH_DELAY_MS * 2); });
    expect(handler).not.toHaveBeenCalled();
    expect(subs).toHaveLength(0);
  });
});
